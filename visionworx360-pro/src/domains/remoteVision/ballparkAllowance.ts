/**
 * Ballpark allowance quantities for recognized work with NO stated size.
 *
 * Two different products, two different rules:
 *
 *   - DETAILED estimate: a measured line with no confirmed quantity stays
 *     unpriced / Needs Review. A detailed estimate must not contain guesses.
 *   - BALLPARK estimate: the whole point is a rough band. Recognized work is
 *     priced from a conservative, documented standard allowance, ALWAYS
 *     flagged as an assumed quantity needing confirmation.
 *
 * This is NOT the silent "default the quantity to 1" bug: the number here is a
 * published allowance from the canonical `BALLPARK_ALLOWANCES` registry, it is
 * attributed (`quantityBasis: "ballpark_allowance"`), and every line it feeds
 * carries `needsReview`.
 *
 * Pure: no React, no IO, no i18n.
 */

import { BALLPARK_ALLOWANCES } from "@/domains/ballpark/quantityResolution";
import { unitFamily } from "@/domains/estimating/genericTradeFallback";
import { structureScaleAllowance, type StructureScale } from "./projectScale";

/**
 * Single-cabinet phrasing. A pantry / tall / single cabinet is ONE unit of
 * casework, not a whole wall run, so it gets the standard single-cabinet
 * allowance instead of the built-in casework run.
 */
const SINGLE_CABINET_RE =
  /\b(pantry|tall cabinet|single cabinet|one cabinet|linen|broom|utility cabinet)\b/i;

/** Feature-specific allowances, keyed by exact feature key prefix. */
const FEATURE_ALLOWANCE: Array<{ match: RegExp; quantity: number; family: string }> = [
  /* Casework / cabinetry runs whose wall was never measured. */
  { match: /^cabinets\./, quantity: BALLPARK_ALLOWANCES.builtInLf, family: "linear" },
  { match: /^carpentry\.|^trim\./, quantity: BALLPARK_ALLOWANCES.builtInLf, family: "linear" },
  { match: /^countertops\./, quantity: BALLPARK_ALLOWANCES.builtInLf, family: "linear" },
  { match: /^structural\.lvl_beam/, quantity: BALLPARK_ALLOWANCES.beamLf, family: "linear" },
  { match: /^structural\./, quantity: BALLPARK_ALLOWANCES.bearingDemoLf, family: "linear" },
  { match: /^framing\./, quantity: BALLPARK_ALLOWANCES.framingLf, family: "linear" },
  { match: /^demolition\./, quantity: BALLPARK_ALLOWANCES.wallDemoLf, family: "linear" },
  /* Outdoor structures are sized as one structure, not as a room. */
  { match: /^deck\./, quantity: BALLPARK_ALLOWANCES.deckSf, family: "area" },
  { match: /^fence\./, quantity: BALLPARK_ALLOWANCES.fenceLf, family: "linear" },
  { match: /^concrete\./, quantity: BALLPARK_ALLOWANCES.flatworkSf, family: "area" },
];

/**
 * Conservative single-room allowances used when nothing feature-specific
 * applies. Deliberately modest: a ballpark that reads low is corrected by the
 * contractor; one that reads high loses the job.
 */
const FAMILY_ALLOWANCE: Record<string, number | null> = {
  linear: BALLPARK_ALLOWANCES.closetLf,
  area: 120,
  volume: 5,
  count: null,
};

export interface BallparkAllowanceContext {
  /** The contractor's own wording for this item, used only to tell a single
   * cabinet apart from a full cabinet run. Never invents scope. */
  label?: string | null;
  evidence?: string | null;
  /**
   * Whole-building scale for envelope work. Without it, exterior trades fall
   * back to an average single-family home instead of an interior-room number.
   */
  scale?: StructureScale | null;
}

const isCabinetry = (featureKey: string) =>
  /^cabinets\./.test(featureKey) || /casework|cabinet/i.test(featureKey);

/**
 * The allowance quantity to price a size-less feature at in BALLPARK mode, or
 * null when no defensible allowance exists (then it stays unpriced).
 *
 * Cabinetry uses the published trade rule of thumb rather than an arbitrary
 * number: a cabinet run finishes 84" to the floor, and a single pantry-style
 * cabinet is 36" wide (3 LF / 21 SF of face).
 */
export interface BallparkAllowance {
  quantity: number;
  /** i18n key suffix naming the published rule of thumb used. */
  basisKey: "standard_cabinet" | "cabinet_run" | "standard" | "whole_structure";
  /** Plain-language disclosure of how the allowance was sized. */
  note?: string;
}

/** Resolve the allowance AND the rule of thumb it came from. */
export function ballparkAllowanceFor(
  featureKey: string,
  unitKey: string | null | undefined,
  context: BallparkAllowanceContext = {},
): BallparkAllowance | null {
  const family = unitFamily(unitKey);
  if (family === "count") return null;

  /*
   * WHOLE-BUILDING WORK FIRST. A roof, whole-house siding, fascia run, gutters
   * or landscaping is sized off the structure, never off an interior-room
   * number. Still an assumption: the caller keeps `ballpark_allowance` +
   * needsReview exactly as before.
   */
  const envelope = structureScaleAllowance(featureKey, family, {
    scale: context.scale ?? null,
    wording: `${context.label ?? ""} ${context.evidence ?? ""}`,
  });
  if (envelope) {
    return {
      quantity: envelope.quantity,
      basisKey: envelope.tier === "structure" ? "whole_structure" : "standard",
      note: envelope.note,
    };
  }

  if (isCabinetry(featureKey) && (family === "linear" || family === "area")) {
    const wording = `${context.label ?? ""} ${context.evidence ?? ""}`;
    const single = SINGLE_CABINET_RE.test(wording);
    /* 36" wide single cabinet, else an unmeasured casework run; 84" tall. */
    const widthFt = single ? BALLPARK_ALLOWANCES.singleCabinetLf : BALLPARK_ALLOWANCES.builtInLf;
    return {
      quantity: family === "linear" ? widthFt : widthFt * BALLPARK_ALLOWANCES.cabinetRunHeightFt,
      basisKey: single ? "standard_cabinet" : "cabinet_run",
    };
  }

  const specific = FEATURE_ALLOWANCE.find((a) => a.match.test(featureKey) && a.family === family);
  if (specific) return { quantity: specific.quantity, basisKey: "standard" };
  const generic = FAMILY_ALLOWANCE[family] ?? null;
  return generic && generic > 0 ? { quantity: generic, basisKey: "standard" } : null;
}

export function ballparkAllowanceQuantity(
  featureKey: string,
  unitKey: string | null | undefined,
  context: BallparkAllowanceContext = {},
): number | null {
  return ballparkAllowanceFor(featureKey, unitKey, context)?.quantity ?? null;
}
