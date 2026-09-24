/**
 * Scope sanity check.
 *
 * A generated scope is a draft written by software, and software makes very
 * confident mistakes: the same platform framed twice, kitchen cabinets left
 * inside a garage-to-bedroom conversion, shower tile filed under framing, a
 * demolition phase that quietly never got written, and "real" tasks carrying
 * 0.1 hours.
 *
 * Product rules encoded here:
 *  - INFER FIRST, ASK SECOND. Only items that materially affect scope or cost
 *    are surfaced.
 *  - NEVER SILENTLY REWRITE. Every finding is a proposal for the contractor,
 *    who confirms, edits, reclassifies, merges, deletes or keeps.
 *  - RE-RUNNABLE. `fingerprint` changes whenever scope changes, so a later
 *    edit re-opens the gate instead of riding an old approval.
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import type { EstimatingMode } from "@/domains/estimating/modes";
import {
  normalizeTradeKey,
  UNASSIGNED_TRADE,
} from "@/domains/estimating/tradeTaxonomy";
import { classifyTrade, inferTradeKey } from "@/domains/estimating/tradeInference";
import { partitionFindingsByMode } from "./reviewStage";
import {
  isExplicitNoLaborTreatment,
  type ScopeDecisionRecord,
  type ScopeFinding,
  type ScopeFindingKind,
  type ScopeValidationContext,
  type ScopeValidationItem,
  type ScopeValidationReport,
} from "./types";

export * from "./types";
export * from "./reviewStage";

/* ------------------------------------------------------------------ *
 * Thresholds — deliberately conservative so the gate stays credible
 * ------------------------------------------------------------------ */

/** Below this, a real construction task is not a task, it is a typo. */
export const MIN_REAL_TASK_HOURS = 0.5;
/** Near-duplicate threshold on token overlap (Jaccard). */
export const NEAR_DUPLICATE_SIMILARITY = 0.8;

const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "of", "to", "in", "on", "at", "for", "with",
  "new", "existing", "per", "each", "all", "as", "needed", "work", "area",
]);

const normalizeText = (v: string | null | undefined): string =>
  String(v ?? "")
    .toLowerCase()
    /* "16 x 18", "16x18" and "16'x18'" are the same dimension to a human. */
    .replace(/(\d)\s*['"\u2019\u201d]?\s*x\s*['"\u2019\u201d]?\s*(\d)/g, "$1x$2")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (v: string): string[] =>
  normalizeText(v)
    .split(" ")
    .filter((w) => w && !STOP_WORDS.has(w));

function similarity(a: string, b: string): number {
  const sa = new Set(tokens(a));
  const sb = new Set(tokens(b));
  if (!sa.size || !sb.size) return 0;
  let shared = 0;
  for (const t of sa) if (sb.has(t)) shared += 1;
  return shared / (sa.size + sb.size - shared);
}

const itemText = (item: ScopeValidationItem): string =>
  `${item.title ?? ""} ${item.description ?? ""}`.trim();

/**
 * Work that only exists in a kitchen. Flagged when the project's own evidence
 * never mentions a kitchen — the classic "leftover from the last project".
 */
const KITCHEN_ONLY_SIGNALS = [
  "kitchen cabinet",
  "kitchen island",
  "upper cabinet",
  "base cabinet",
  "countertop",
  "backsplash",
  "range hood",
  "cooktop",
  "dishwasher",
  "refrigerator",
  "microwave",
  "oven",
  "appliance",
];

/** Evidence wording that means "something has to come out first". */
const DEMOLITION_EVIDENCE = [
  "convert",
  "conversion",
  "remove",
  "removal",
  "demo",
  "demolition",
  "tear out",
  "gut",
  "replace existing",
  "existing wall",
  "existing partition",
];

/** Verb pairs that cannot both be true about the same subject. */
const CONFLICT_PAIRS: Array<[readonly string[], readonly string[]]> = [
  [["remove", "demo", "demolish", "tear out"], ["keep", "retain", "preserve", "protect in place"]],
  [["replace"], ["refinish", "reuse", "salvage"]],
];

const subjectOf = (text: string): string =>
  tokens(text)
    .filter(
      (w) =>
        ![
          "remove", "demo", "demolish", "tear", "out", "keep", "retain",
          "preserve", "protect", "place", "replace", "refinish", "reuse",
          "salvage", "install",
        ].includes(w),
    )
    .join(" ");

/* ------------------------------------------------------------------ *
 * Fingerprint & stable issue identity
 * ------------------------------------------------------------------ */

function hash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i += 1) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * The decision-relevant state of one item. Cosmetic reordering, unrelated
 * items and re-validation runs do NOT change it; a real edit to the wording,
 * trade, quantity, hours, treatment or inclusion does.
 */
export function itemSignature(item: ScopeValidationItem): string {
  return [
    item.id,
    normalizeText(item.title),
    normalizeText(item.description),
    normalizeTradeKey(item.tradeKey ?? item.categoryKey),
    item.quantity ?? "",
    item.unitKey ?? "",
    item.laborHours ?? "",
    item.laborTreatment ?? "",
    item.isIncluded === false ? "0" : "1",
  ].join("|");
}

/** Stable identity of an issue: its kind plus the items it is about. */
export function subjectKeyFor(kind: ScopeFindingKind, itemIds: readonly string[], suffix = ""): string {
  const ids = [...itemIds].sort().join("+");
  return `${kind}:${ids || suffix || "-"}`;
}

/** Identity + the state that justified the finding. */
export function subjectFingerprintFor(
  kind: ScopeFindingKind,
  items: readonly ScopeValidationItem[],
  suffix = "",
): string {
  const parts = items.map(itemSignature).sort();
  return hash(`${kind}|${suffix}|${parts.join("\n")}`);
}

/**
 * Structural fingerprint of the scope under review. Deterministic and
 * order-independent so a pure reorder does not re-open the gate, while any
 * added, edited, retraded or rehoured item does.
 */
export function scopeFingerprint(items: readonly ScopeValidationItem[]): string {
  const parts = items.map(itemSignature).sort();
  return `${parts.length}:${hash(parts.join("\n"))}`;
}


/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/**
 * Run every sanity rule over a generated scope.
 *
 * Severity contract:
 *  - `blocker`  — a legitimate labor item with no hours and no stated reason.
 *                 Approving that ships an estimate that is simply wrong.
 *  - `warning`  — needs a human decision (duplicate, wrong trade, unrelated).
 *  - `info`     — worth a glance, safe to approve as-is.
 */
export function validateScope(
  items: readonly ScopeValidationItem[],
  context: ScopeValidationContext = {},
): ScopeValidationReport {
  const active = items.filter((i) => i.isIncluded !== false);
  const byId = new Map(items.map((i) => [i.id, i]));
  const findings: ScopeFinding[] = [];

  /**
   * Every rule emits through here so no finding can ship without a stable
   * subject identity. `id` stays the render key; decisions ride on the
   * subject, which does not move when the findings array is recomputed.
   */
  const emit = (
    finding: Omit<ScopeFinding, "subjectKey" | "subjectFingerprint">,
    suffix = "",
  ) => {
    const subjects = finding.itemIds.map((id) => byId.get(id)).filter(Boolean) as ScopeValidationItem[];
    findings.push({
      ...finding,
      subjectKey: subjectKeyFor(finding.kind, finding.itemIds, suffix),
      subjectFingerprint: subjectFingerprintFor(finding.kind, subjects, suffix),
    });
  };

  const evidence = normalizeText(
    [context.evidenceText, context.projectName, context.projectType].filter(Boolean).join(" "),
  );

  /* 1. Duplicates and near-duplicates -------------------------------- */
  /*
   * Title similarity alone is not duplication: "frame the 15.5x18 platform"
   * and "frame the 12x14 platform" read alike and are different work. Two
   * items are the SAME work only when they also share their placement and
   * measurable identity — or when they literally came from the same source
   * row (provenance), which is how a re-import duplicates scope.
   */
  const sameIdentity = (a: ScopeValidationItem, b: ScopeValidationItem): boolean => {
    if (a.originRef && b.originRef && a.originRef === b.originRef) return true;
    if ((a.roomId ?? null) !== (b.roomId ?? null)) return false;
    if ((a.unitKey ?? null) !== (b.unitKey ?? null)) return false;
    const qa = a.quantity ?? null;
    const qb = b.quantity ?? null;
    if (qa != null && qb != null && qa !== qb) return false;
    return true;
  };
  const seen: Array<{ item: ScopeValidationItem; text: string }> = [];
  const duplicateGroups = new Map<string, string[]>();
  for (const item of active) {
    const text = itemText(item);
    const match = seen.find(
      (s) =>
        (s.item.originRef && item.originRef && s.item.originRef === item.originRef) ||
        ((normalizeText(s.text) === normalizeText(text) ||
          similarity(s.text, text) >= NEAR_DUPLICATE_SIMILARITY) &&
          sameIdentity(s.item, item)),
    );
    if (match) {
      const key = match.item.id;
      const group = duplicateGroups.get(key) ?? [key];
      group.push(item.id);
      duplicateGroups.set(key, group);
    } else {
      seen.push({ item, text });
    }
  }

  for (const [key, group] of duplicateGroups) {
    const first = active.find((i) => i.id === key);
    emit({
      id: `duplicate:${key}`,
      kind: "duplicate",
      severity: "warning",
      itemIds: group,
      params: { title: first?.title ?? "", count: group.length },
    });
  }

  /* 2. Work unrelated to this project -------------------------------- */
  const evidenceMentionsKitchen = evidence.includes("kitchen");
  for (const item of active) {
    if (evidenceMentionsKitchen) break;
    const text = normalizeText(itemText(item));
    const signal = KITCHEN_ONLY_SIGNALS.find((s) => text.includes(s));
    if (signal) {
      emit({
        id: `unrelated:${item.id}`,
        kind: "unrelated_scope",
        severity: "warning",
        itemIds: [item.id],
        params: { title: item.title, signal },
      });
    }
  }

  /* 3. Suspicious trade assignment ----------------------------------- *
   *
   * The classifier now resolves ordinary wording on its own, so this rule is
   * deliberately quiet. It speaks only when it is SURE and the assignment
   * CONTRADICTS the wording. Ambiguous, mixed-trade or merely-unlabelled work
   * is not a contractor interruption:
   *   - high confidence + contradiction  -> warning, with the suggestion
   *   - high confidence + no assignment  -> info, nothing to correct
   *   - anything less, or ambiguous      -> silence
   *
   * A contractor's own assignment is never second-guessed at all.
   */
  for (const item of active) {
    if (item.tradeAssignedBy === "contractor") continue;
    const assigned = normalizeTradeKey(item.tradeKey ?? item.categoryKey);
    const classification = classifyTrade(item.title, item.description);
    if (classification.ambiguous) continue;
    if (classification.confidence !== "high" || !classification.trade) continue;
    const suggested = classification.trade;
    if (assigned === UNASSIGNED_TRADE) {
      emit({
        id: `trade:${item.id}`,
        kind: "suspicious_trade",
        severity: "info",
        itemIds: [item.id],
        suggestedTradeKey: suggested,
        params: { title: item.title, assigned, suggested },
      });
      continue;
    }
    if (assigned !== suggested) {
      emit({
        id: `trade:${item.id}`,
        kind: "suspicious_trade",
        severity: "warning",
        itemIds: [item.id],
        suggestedTradeKey: suggested,
        params: { title: item.title, assigned, suggested },
      });
    }
  }

  /* 4. Missing demolition phase -------------------------------------- */
  const evidenceWantsDemo = DEMOLITION_EVIDENCE.some((w) => evidence.includes(w));
  const hasDemo = active.some(
    (i) =>
      normalizeTradeKey(i.tradeKey ?? i.categoryKey) === "demolition" ||
      inferTradeKey(i.title, i.description) === "demolition",
  );
  if (active.length > 0 && evidenceWantsDemo && !hasDemo) {
    emit(
      {
        id: "missing_phase:demolition",
        kind: "missing_phase",
        severity: "warning",
        itemIds: [],
        params: { phase: "demolition" },
      },
      "demolition",
    );
  }

  /* 5 & 6. Zero and token labor hours -------------------------------- */
  for (const item of active) {
    const laborBearing = item.isLaborBearing !== false;
    if (!laborBearing) continue;
    if (isExplicitNoLaborTreatment(item.laborTreatment)) continue;
    /*
     * `undefined` means "hours are not known yet" (scope approval runs before
     * pricing). Only a KNOWN zero is a blocker — the gate never invents a
     * problem out of missing data.
     */
    if (item.laborHours === undefined) continue;
    const hoursValue = typeof item.laborHours === "number" ? item.laborHours : null;
    if (hoursValue == null || hoursValue <= 0) {
      emit({
        id: `zero_hours:${item.id}`,
        kind: "zero_hours",
        severity: "blocker",
        itemIds: [item.id],
        params: { title: item.title },
      });
      continue;
    }
    if (hoursValue < MIN_REAL_TASK_HOURS) {
      emit({
        id: `implausible_hours:${item.id}`,
        kind: "implausible_hours",
        severity: "warning",
        itemIds: [item.id],
        params: { title: item.title, hours: hoursValue, minimum: MIN_REAL_TASK_HOURS },
      });
    }
  }

  /* 7. Conflicting scope --------------------------------------------- */
  for (let a = 0; a < active.length; a += 1) {
    for (let b = a + 1; b < active.length; b += 1) {
      const left = normalizeText(itemText(active[a]));
      const right = normalizeText(itemText(active[b]));
      const subjectLeft = subjectOf(left);
      const subjectRight = subjectOf(right);
      if (!subjectLeft || subjectLeft !== subjectRight) continue;
      const conflicted = CONFLICT_PAIRS.some(
        ([xs, ys]) =>
          (xs.some((x) => left.includes(x)) && ys.some((y) => right.includes(y))) ||
          (xs.some((x) => right.includes(x)) && ys.some((y) => left.includes(y))),
      );
      if (conflicted) {
        emit({
          id: `conflict:${active[a].id}:${active[b].id}`,
          kind: "conflicting_scope",
          severity: "warning",
          itemIds: [active[a].id, active[b].id],
          params: { first: active[a].title, second: active[b].title },
        });
      }
    }
  }

  /* 8. Foreign room reference ---------------------------------------- */
  const roomNames = (context.roomNames ?? []).map(normalizeText).filter(Boolean);
  if (roomNames.length > 0) {
    for (const item of active) {
      const room = normalizeText(item.roomName);
      if (!room) continue;
      if (!roomNames.includes(room)) {
        emit({
          id: `foreign:${item.id}`,
          kind: "foreign_context",
          severity: "info",
          itemIds: [item.id],
          params: { title: item.title, room: item.roomName ?? "" },
        });
      }
    }
  }

  /* 9. Approved but untreated ---------------------------------------- */
  for (const item of active) {
    if (item.isPriced !== false) continue;
    if (isExplicitNoLaborTreatment(item.laborTreatment)) continue;
    emit({
      id: `untreated:${item.id}`,
      kind: "untreated_item",
      severity: "warning",
      itemIds: [item.id],
      params: { title: item.title },
    });
  }

  const blockerCount = findings.filter((f) => f.severity === "blocker").length;
  const warningCount = findings.filter((f) => f.severity === "warning").length;
  const infoCount = findings.filter((f) => f.severity === "info").length;

  return {
    findings,
    blockerCount,
    warningCount,
    infoCount,
    isClean: findings.length === 0,
    fingerprint: scopeFingerprint(items),
  };
}

/* ------------------------------------------------------------------ *
 * Decisions & approval gate
 * ------------------------------------------------------------------ */

export interface ScopeApprovalState {
  /** Fingerprint captured when the contractor last cleared the gate. */
  approvedFingerprint?: string | null;
  /** Legacy: finding ids acknowledged in-session. */
  acknowledgedFindingIds?: readonly string[] | null;
  /** Durable per-issue decisions (kept / reassigned / dismissed). */
  decisions?: readonly ScopeDecisionRecord[] | null;
  /**
   * Which estimating mode the contractor is working in. In `ballpark` mode the
   * production/organization findings (trade assignment, labor treatment) are
   * deferred: they neither block nor count as outstanding.
   */
  mode?: EstimatingMode;
}

export interface ScopeApprovalDecision {
  canApprove: boolean;
  /** Findings still waiting on a contractor decision, in the current mode. */
  outstanding: ScopeFinding[];
  /** Findings this mode intentionally postpones — optional, never blocking. */
  deferred: ScopeFinding[];
  /** True when scope moved since the last approval, so the gate re-opened. */
  isStale: boolean;
}

/**
 * A decision sticks while the item it was made about is materially unchanged.
 * Edit the item (retitle, retrade, requantify) and the fingerprint moves, so
 * the question is asked again on purpose rather than silently inherited.
 */
export function isFindingDecided(
  finding: ScopeFinding,
  decisions: readonly ScopeDecisionRecord[] | null | undefined,
): boolean {
  if (!decisions?.length) return false;
  return decisions.some((d) => {
    if (d.subjectKey !== finding.subjectKey) return false;
    /*
     * A reassignment is honoured by RESULT, not by fingerprint: the act of
     * moving the item changes its state, and the contractor's pick outranks
     * the suggestion even when the two disagree. As long as the item still
     * carries the trade the contractor chose, the question stays answered.
     */
    if (d.decision === "reassigned" && d.decidedTradeKey) {
      return normalizeTradeKey(String(finding.params?.assigned ?? "")) ===
        normalizeTradeKey(d.decidedTradeKey);
    }
    return d.subjectFingerprint === finding.subjectFingerprint;
  });
}


/**
 * Item ids whose trade the CONTRACTOR has settled — by reassigning it, or by
 * explicitly keeping it. The classifier may improve, the wording may change:
 * neither reopens a decision a human already made. Only an explicit new
 * decision does.
 */
export function contractorTradeDecisions(
  decisions: readonly ScopeDecisionRecord[] | null | undefined,
): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const d of decisions ?? []) {
    if (!d.subjectKey.startsWith("suspicious_trade:")) continue;
    if (d.decision !== "reassigned" && d.decision !== "kept") continue;
    const ids = d.subjectKey.slice("suspicious_trade:".length).split("+");
    for (const id of ids) {
      if (id && id !== "-") out.set(id, d.decidedTradeKey ?? null);
    }
  }
  return out;
}


/** Findings the contractor has not yet answered, in report order. */
export function openFindings(
  report: ScopeValidationReport,
  decisions: readonly ScopeDecisionRecord[] | null | undefined,
): ScopeFinding[] {
  return report.findings.filter((f) => !isFindingDecided(f, decisions));
}

/**
 * Blockers must be resolved or explicitly acknowledged; warnings and info
 * never hard-block, because a contractor who has looked at the item knows more
 * than the generator did.
 */
export function evaluateScopeApproval(
  report: ScopeValidationReport,
  state: ScopeApprovalState = {},
): ScopeApprovalDecision {
  const acknowledged = new Set(state.acknowledgedFindingIds ?? []);
  const mode: EstimatingMode = state.mode ?? "detailed";
  /*
   * Ballpark defers organization/production findings (trade assignment, labor
   * treatment). They stay visible as optional review but are never outstanding
   * and can never block a preliminary number.
   */
  const staged = partitionFindingsByMode(report.findings, mode);
  const outstanding = staged.active.filter(
    (f) => !acknowledged.has(f.id) && !isFindingDecided(f, state.decisions),
  );
  const isStale =
    !!state.approvedFingerprint && state.approvedFingerprint !== report.fingerprint;
  return {
    canApprove: outstanding.every((f) => f.severity !== "blocker"),
    outstanding,
    deferred: staged.deferred,
    isStale,
  };
}

