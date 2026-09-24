/**
 * Reading a saved ballpark band back off an estimate.
 *
 * A ballpark-mode estimate carries its authoritative value in the single
 * `range_snapshot` object written by "Save ballpark to this estimate". This
 * helper is the one place that interprets that snapshot, so listings, the
 * dashboard and the estimate page can never disagree about the range.
 */
import {
  priceForBandPosition,
  readBallparkBandPosition,
  type BallparkBandPosition,
} from "@/domains/estimating/ballparkPosition";
import { mergeRangeSnapshot } from "@/domains/estimating/rangeSnapshotEnvelope";


export interface BallparkSummary {
  low: number;
  expected: number;
  high: number;
  currency: string;
  confidence: "high" | "medium" | "low" | null;
  savedAt: string | null;
  /** Where inside the band the contractor is selling. Defaults to expected. */
  selectedPosition: BallparkBandPosition;
  /** The selling price for `selectedPosition`. */
  selected: number;
}

const num = (v: unknown): number | null => {
  const x = typeof v === "string" ? Number(v) : v;
  return typeof x === "number" && Number.isFinite(x) ? x : null;
};

export function readBallparkSummary(snapshot: unknown): BallparkSummary | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  const snap = snapshot as Record<string, unknown>;
  /*
   * Once an estimate is converted to detailed mode, the detailed preliminary
   * range takes over `range_snapshot`. The original ballpark band is preserved
   * untouched under `ballpark`, so historical reference keeps resolving.
   */
  if (snap.kind !== "ballpark" && snap.mode !== "ballpark") {
    return snap.ballpark ? readBallparkSummary(snap.ballpark) : null;
  }

  const band = snap.band as Record<string, unknown> | undefined;
  if (!band || typeof band !== "object") return null;
  const low = num(band.low);
  const expected = num(band.expected);
  const high = num(band.high);
  if (low == null || expected == null || high == null) return null;
  const confidence = snap.confidence;
  const selectedPosition = readBallparkBandPosition(snap);
  return {
    low,
    expected,
    high,
    currency: typeof snap.currency === "string" ? snap.currency : "USD",
    confidence:
      confidence === "high" || confidence === "medium" || confidence === "low"
        ? confidence
        : null,
    savedAt:
      typeof snap.savedAt === "string"
        ? snap.savedAt
        : typeof snap.calculatedAt === "string"
          ? snap.calculatedAt
          : null,
    selectedPosition,
    selected: priceForBandPosition({ low, expected, high }, selectedPosition),
  };
}

/**
 * The saved ballpark band is immutable historical reference, and the finish
 * tier snapshot is a separate concept living in the same column. Both are
 * routed into the range-snapshot envelope so neither writer can destroy the
 * other's data. Legacy top-level snapshots keep reading correctly and are
 * upgraded in place on the next write.
 */
export function preserveBallparkHistory(existing: unknown, next: unknown): unknown {
  return mergeRangeSnapshot(existing, next);
}


const isBallparkShape = (v: unknown): boolean => {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return o.kind === "ballpark" || o.mode === "ballpark";
};

/** The raw ballpark snapshot object, at the top level or nested under `ballpark`. */
export function findBallparkSnapshot(snapshot: unknown): unknown | null {
  if (!snapshot || typeof snapshot !== "object") return null;
  if (isBallparkShape(snapshot) && readBallparkSummary(snapshot)) return snapshot;
  const nested = (snapshot as Record<string, unknown>).ballpark;
  return nested && readBallparkSummary(nested) ? nested : null;
}

export interface BallparkReviewState {
  reason: "scopeNeedsReview" | "divergent" | "unknown";
  unresolvedScopeCount: number;
}

/**
 * A snapshot held back by the recalculation integrity gate: the band shown is
 * the last credible one, and a new scope-derived number is being withheld until
 * the contractor reconciles the scope.
 */
export function readBallparkReview(snapshot: unknown): BallparkReviewState | null {
  const snap = findBallparkSnapshot(snapshot) as Record<string, unknown> | null;
  if (!snap || snap.needsReview !== true) return null;
  const reason = snap.reviewReason;
  return {
    reason: reason === "scopeNeedsReview" || reason === "divergent" ? reason : "unknown",
    unresolvedScopeCount: Number(snap.unresolvedScopeCount ?? 0) || 0,
  };
}

export interface BallparkValidity {
  isValidQuote: boolean;
  invalidReason: "scope_present_but_unpriced" | null;
  /** Lines the engine refused to price, so the UI can name what is missing. */
  unresolvedLineCount: number;
}

/**
 * VALIDITY GUARD (reader side). A canonical band of $0 on an estimate that has
 * scope is a pricing FAILURE, never a quote. This tells the UI to show the
 * failure and the unresolved items instead of printing "$0 – $0".
 */
export function readBallparkValidity(snapshot: unknown): BallparkValidity {
  const snap = findBallparkSnapshot(snapshot) as Record<string, unknown> | null;
  const unresolved = Array.isArray(snap?.unresolvedLineIds) ? snap!.unresolvedLineIds.length : 0;
  if (!snap) return { isValidQuote: true, invalidReason: null, unresolvedLineCount: 0 };
  if (snap.isValidQuote === false) {
    return {
      isValidQuote: false,
      invalidReason: "scope_present_but_unpriced",
      unresolvedLineCount: unresolved,
    };
  }
  /* Legacy snapshots predate the flag: derive it from the band and the lines. */
  const summary = readBallparkSummary(snap);
  const zero = summary != null && summary.expected <= 0 && summary.high <= 0;
  const hasScope = unresolved > 0 || Number(snap.pricedCount ?? 0) > 0;
  if (zero && hasScope) {
    return {
      isValidQuote: false,
      invalidReason: "scope_present_but_unpriced",
      unresolvedLineCount: unresolved,
    };
  }
  return { isValidQuote: true, invalidReason: null, unresolvedLineCount: unresolved };
}



export interface BallparkBlocker {
  itemId: string;
  title: string;
  reason: "noMapping" | "noQuantity" | "implausibleQuantity" | "unknown";
  quantity?: number | null;
  maxPlausible?: number | null;
}

/**
 * Scope the pricebook could not turn into money. The band is still real — it
 * simply does not cover these lines, so the estimate is INCOMPLETE, not wrong.
 */
export function readBallparkBlockers(snapshot: unknown): BallparkBlocker[] {
  const snap = findBallparkSnapshot(snapshot) as Record<string, unknown> | null;
  const raw = snap?.unpriceable;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object")
    .map((entry) => {
      const reason = entry.reason;
      return {
        itemId: String(entry.itemId ?? ""),
        title: typeof entry.title === "string" ? entry.title : "",
        reason:
          reason === "noMapping" || reason === "noQuantity" || reason === "implausibleQuantity"
            ? reason
            : ("unknown" as const),
        quantity: num(entry.quantity),
        maxPlausible: num(entry.maxPlausible),
      };
    });
}

/**
 * The band this one replaced, kept as read-only reference. `originalBallpark`
 * is the oldest credible band on the chain, so the historical number a
 * contractor quoted from stays visible no matter how often scope re-prices.
 */
export function readPriorBallpark(snapshot: unknown): BallparkSummary | null {
  const snap = findBallparkSnapshot(snapshot) as Record<string, unknown> | null;
  if (!snap) return null;
  return readBallparkSummary(snap.originalBallpark) ?? readBallparkSummary(snap.previous);
}


export interface BallparkAssumptionView {
  itemId: string;
  title: string;
  quantity: number;
  unitKey: string;
  /** `contractor` = the contractor corrected what the ballpark had inferred. */
  source: "explicit" | "stated" | "geometry" | "allowance" | "contractor";
  basisKey: string;
  basisValues: Record<string, string | number>;
  rolledUp: Array<{ itemId: string; title: string }>;
  /** Disclosed provisional allowance, refined during detailed estimating. */
  provisional: boolean;
  /** The contractor replaced the inferred quantity. Never re-inferred. */
  corrected: boolean;
  /** What the ballpark had inferred before the correction, for context. */
  inferredQuantity: number | null;
  /** Pricebook key: the address a correction is written against. */
  itemKey: string;
}

/**
 * Quantities the ballpark resolved on the contractor's behalf, from saved
 * geometry or a standard allowance. These are assumptions to review, never
 * questions that block the range.
 */
export function readBallparkAssumptions(snapshot: unknown): BallparkAssumptionView[] {
  const snap = findBallparkSnapshot(snapshot) as Record<string, unknown> | null;
  const raw = snap?.assumptions;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
    .map((e): BallparkAssumptionView => {
      const source = e.source;
      return {
        itemId: String(e.itemId ?? ""),
        title: typeof e.title === "string" ? e.title : "",
        quantity: num(e.quantity) ?? 0,
        unitKey: typeof e.unitKey === "string" ? e.unitKey : "each",
        source:
          source === "explicit" ||
          source === "stated" ||
          source === "geometry" ||
          source === "allowance" ||
          source === "contractor"
            ? source
            : ("allowance" as const),
        basisKey: typeof e.basisKey === "string" ? e.basisKey : "unknown",
        basisValues:
          e.basisValues && typeof e.basisValues === "object"
            ? (e.basisValues as Record<string, string | number>)
            : {},
        provisional: e.provisional === true,
        corrected: e.corrected === true,
        inferredQuantity: num(e.inferredQuantity) ?? null,
        itemKey: typeof e.itemKey === "string" ? e.itemKey : "",
        rolledUp: Array.isArray(e.rolledUp)
          ? (e.rolledUp as Array<Record<string, unknown>>).map((r) => ({
              itemId: String(r?.itemId ?? ""),
              title: typeof r?.title === "string" ? r.title : "",
            }))
          : [],
      };
    })
    /*
     * Quantities the contractor typed into scope, or stated in the scope text,
     * need no review. Corrections stay listed: they are the record of what the
     * contractor already refined, shown as confirmed rather than assumed.
     */
    .filter((a) => a.source === "geometry" || a.source === "allowance" || a.corrected);
}

/**
 * How many of the ballpark's assumptions are provisional allowances. Used by
 * the completion state: a ballpark is complete when nothing is unpriced, and it
 * discloses how much of it rests on allowances rather than measured scope.
 */
export function countProvisionalAllowances(snapshot: unknown): number {
  return readBallparkAssumptions(snapshot).filter((a) => a.provisional).length;
}
