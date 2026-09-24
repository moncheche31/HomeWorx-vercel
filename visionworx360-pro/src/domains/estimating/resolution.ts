/**
 * Line resolution: which lines the engine can defensibly price, and which it
 * cannot (Universal Estimating Engine repair).
 *
 * The rule this module encodes is the one the database gate enforces on every
 * write: a line that has no measured quantity, no productivity rate, or no
 * catalog match has NO trustworthy total. It must be shown as unresolved, not
 * padded out with a fabricated 1-unit or 0-hour number.
 *
 * Pure. No React, no Supabase, no i18n, no IO.
 */

import { isLaborBearingBasis, type TaskCostBasis } from "./costBasis";

export type LineResolutionStatus = "resolved" | "unresolved";

/** Why a line cannot be priced yet. Mirrors `unresolved_reason` in SQL. */
export type UnresolvedReason =
  | "quantity_unmeasured"
  | "quantity_required"
  | "count_required"
  | "catalog_match_unconfirmed"
  | "ambiguous_multi_scope"
  | "no_productivity_rate"
  | "no_catalog_match"
  | "unit_mismatch"
  | "implausible_count"
  | "weak_match_needs_review"
  | "no_knowledge_base_match"
  | "intent_assembly_unavailable";

/** Units whose quantity must be physically measured — a bare 1 is not evidence. */
const MEASURED_UNITS: ReadonlySet<string> = new Set([
  "square_foot",
  "square_yard",
  "square",
  "linear_foot",
  "board_foot",
  "cubic_foot",
  "cubic_yard",
  "gallon",
  "pound",
  "sheet",
]);

export const isMeasuredUnit = (unitKey: string | null): boolean =>
  unitKey != null && MEASURED_UNITS.has(unitKey);

export interface ResolutionCheckLine {
  costBasis: TaskCostBasis | null;
  unitKey: string | null;
  quantity: number;
  isQuantityPlaceholder: boolean;
  laborHours: number;
  laborHoursPerUnit: number | null;
  pricingSource: string | null;
  isPriceOverridden: boolean;
  /** `size_not_count` means a dimension in the description was misread as a count. */
  quantityBasis?: string | null;
  /** Set when an automatic catalog match was too weak to price without review. */
  bindConfidence?: "high" | "low" | null;
  catalogConfirmedAt?: string | null;
  /**
   * The quantity is a fabricated default ("1 each"), not a measured or
   * contractor-entered number. The line still prices — a contractor needs a
   * workable ballpark — but it must never read as measured evidence.
   */
  quantityIsAssumedDefault?: boolean;
}

/**
 * The same decision the database gate makes, so the UI can never disagree with
 * the stored `resolution_status`. Contractor authorship always wins.
 */
export function evaluateResolution(line: ResolutionCheckLine): {
  status: LineResolutionStatus;
  reason: UnresolvedReason | null;
} {
  const contractor =
    line.isPriceOverridden || line.pricingSource === "contractor" || line.pricingSource === "manual";
  if (contractor) return { status: "resolved", reason: null };

  if (line.pricingSource == null || line.pricingSource === "unmatched") {
    return { status: "unresolved", reason: "no_catalog_match" };
  }
  if (isMeasuredUnit(line.unitKey) && line.isQuantityPlaceholder && line.quantity <= 1) {
    return {
      status: "unresolved",
      // A known production rate means only the measurement is missing, which is
      // a much smaller ask than "we have no basis at all".
      reason: (line.laborHoursPerUnit ?? 0) > 0 ? "quantity_required" : "quantity_unmeasured",
    };
  }
  if (line.isQuantityPlaceholder && line.quantityBasis === "size_not_count") {
    return { status: "unresolved", reason: "count_required" };
  }
  if (line.bindConfidence === "low" && line.catalogConfirmedAt == null) {
    return { status: "unresolved", reason: "catalog_match_unconfirmed" };
  }
  if (
    line.costBasis != null && isLaborBearingBasis(line.costBasis) &&
    (line.laborHours ?? 0) === 0 &&
    (line.laborHoursPerUnit ?? 0) === 0
  ) {
    return { status: "unresolved", reason: "no_productivity_rate" };
  }
  return { status: "resolved", reason: null };
}

export interface ResolutionSummaryLine extends ResolutionCheckLine {
  id: string;
  description: string;
  resolutionStatus: LineResolutionStatus;
  unresolvedReason: string | null;
}

export interface ResolutionSummary {
  total: number;
  resolved: number;
  unresolved: number;
  /** Priced lines standing on an assumed default quantity, not a measurement. */
  assumedDefault: number;
  /** Lines whose quantity is genuinely measured or contractor-entered. */
  measured: number;
  /** Grouped by reason so the UI can ask for the one missing input. */
  byReason: Record<string, number>;
  /** The assumed-default lines, so the UI can ask for an on-site confirmation. */
  assumedLines: Array<{
    id: string;
    description: string;
    unitKey: string | null;
    quantity: number;
  }>;
  lines: Array<{
    id: string;
    description: string;
    reason: string;
    /** Present when a production rate exists and only the measurement is missing. */
    unitKey: string | null;
    laborHoursPerUnit: number | null;
  }>;
  /**
   * True while any line is unresolved. A reconciled "ready" total must not be
   * presented as final while this holds.
   */
  blocksReconciliation: boolean;
}

export function summarizeResolution(lines: ResolutionSummaryLine[]): ResolutionSummary {
  const summary: ResolutionSummary = {
    total: lines.length,
    resolved: 0,
    unresolved: 0,
    assumedDefault: 0,
    measured: 0,
    byReason: {},
    assumedLines: [],
    lines: [],
    blocksReconciliation: false,
  };
  for (const line of lines) {
    if (line.resolutionStatus === "resolved") {
      summary.resolved += 1;
      if (line.quantityIsAssumedDefault) {
        summary.assumedDefault += 1;
        summary.assumedLines.push({
          id: line.id,
          description: line.description,
          unitKey: line.unitKey,
          quantity: line.quantity,
        });
      } else {
        summary.measured += 1;
      }
      continue;
    }
    const reason = line.unresolvedReason ?? "no_catalog_match";
    summary.unresolved += 1;
    summary.byReason[reason] = (summary.byReason[reason] ?? 0) + 1;
    summary.lines.push({
      id: line.id,
      description: line.description,
      reason,
      unitKey: line.unitKey,
      laborHoursPerUnit: line.laborHoursPerUnit,
    });
  }
  summary.blocksReconciliation = summary.unresolved > 0;
  return summary;
}
