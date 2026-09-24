/**
 * Unmatched line pricing & quantity completion (Phase 1).
 *
 * Pure, deterministic helpers shared by the Complete-pricing workflow, the
 * estimate summary counts and the server bridge. No network, no Supabase,
 * no React, no i18n.
 *
 * The preview math MUST stay identical to what the server persists, so this
 * module reuses the same primitives as the pricing bridge
 * (`resolveCrewHoursPerUnit`, `resolveMaterialCostPerUnit`) and the estimate
 * engine (`calculateLine`). Crew size stays descriptive: it never multiplies
 * billable labor hours, and markup/overhead/profit/contingency are applied
 * exactly once by `calculateLine`.
 */

import { calculateLine, round2, type EstimateLineTotals } from "../calculations";
import {
  resolveCrewHoursPerUnit,
  resolveMaterialCostPerUnit,
  type LinePricingSource,
} from "./knowledgeBridge";

/** How a line's catalog mapping was established. */
export type CatalogMappingSource = "auto" | "contractor" | null;

/** Minimum shape the completion workflow needs from an estimate line. */
export interface CompletionLine {
  id: string;
  description: string;
  quantity: number;
  unitKey: string | null;
  pricingSource: LinePricingSource;
  isPriceOverridden: boolean;
  isQuantityPlaceholder: boolean;
  laborHours: number;
  laborRate: number;
  materialCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;
}

export interface LineCompletionState {
  /** No usable pricing yet: unmatched, never priced, or zero direct cost. */
  needsPricing: boolean;
  /** Quantity is a placeholder default the contractor has not confirmed. */
  needsQuantityReview: boolean;
  /** Nothing left for the contractor to do on this line. */
  isComplete: boolean;
}

export interface CompletionSummary {
  total: number;
  /** Lines with nothing outstanding. */
  complete: number;
  /** Lines still needing pricing and/or a quantity review. */
  incomplete: number;
  needsPricing: number;
  needsQuantityReview: number;
  /** Lines priced from the Knowledge Base (automatic or confirmed). */
  priced: number;
  /** Lines the contractor priced themselves — never auto-repriced. */
  contractorEdited: number;
}

const directCostOf = (line: CompletionLine): number =>
  round2(
    round2(line.laborHours * line.laborRate) +
      round2(line.materialCost * line.quantity) +
      round2(line.equipmentCost * line.quantity) +
      round2(line.subcontractorCost * line.quantity) +
      round2(line.otherCost * line.quantity),
  );

/** Classify one line. A non-null quantity of 1 is never trusted on its own. */
export function classifyLine(line: CompletionLine): LineCompletionState {
  const needsPricing =
    line.pricingSource === "unmatched" ||
    line.pricingSource === null ||
    directCostOf(line) <= 0;
  const needsQuantityReview = line.isQuantityPlaceholder === true;
  return { needsPricing, needsQuantityReview, isComplete: !needsPricing && !needsQuantityReview };
}

/** Counts surfaced in the estimate header and the workflow progress label. */
export function summarizeCompletion(lines: CompletionLine[]): CompletionSummary {
  const summary: CompletionSummary = {
    total: lines.length,
    complete: 0,
    incomplete: 0,
    needsPricing: 0,
    needsQuantityReview: 0,
    priced: 0,
    contractorEdited: 0,
  };
  for (const line of lines) {
    const state = classifyLine(line);
    if (state.isComplete) summary.complete += 1;
    else summary.incomplete += 1;
    if (state.needsPricing) summary.needsPricing += 1;
    if (state.needsQuantityReview) summary.needsQuantityReview += 1;
    if (line.isPriceOverridden || line.pricingSource === "contractor") {
      summary.contractorEdited += 1;
    } else if (line.pricingSource === "knowledge_base") summary.priced += 1;
  }
  return summary;
}

/** Lines the workflow steps through, in the order they appear in the estimate. */
export function listIncompleteLines<T extends CompletionLine>(lines: T[]): T[] {
  return lines.filter((line) => !classifyLine(line).isComplete);
}

/**
 * Next line needing attention after `currentId`, wrapping around so the
 * contractor never gets stuck at the end of the list. Returns null when the
 * estimate is fully complete.
 */
export function nextIncompleteLineId(
  lines: CompletionLine[],
  currentId: string | null,
): string | null {
  const pending = listIncompleteLines(lines).map((line) => line.id);
  if (pending.length === 0) return null;
  if (!currentId) return pending[0]!;
  const order = lines.map((line) => line.id);
  const from = order.indexOf(currentId);
  for (let i = 1; i <= order.length; i += 1) {
    const id = order[(from + i) % order.length]!;
    if (pending.includes(id)) return id;
  }
  return null;
}

/**
 * A candidate may only be applied when its unit matches the line's unit.
 * A line with no unit yet adopts the candidate's unit, which is safe.
 */
export function isUnitCompatible(
  lineUnit: string | null | undefined,
  assemblyUnit: string | null | undefined,
): boolean {
  if (!lineUnit || !assemblyUnit) return true;
  return lineUnit === assemblyUnit;
}

export interface CandidatePreviewInput {
  quantity: number;
  /** Knowledge Base defaults. */
  defaultLaborHours?: number | null;
  productionRate?: number | null;
  crewSize?: number | null;
  materialAllowance?: number | null;
  wasteFactor?: number | null;
  materialFactor?: number | null;
  /** Estimate context. */
  laborRate: number;
  equipmentCost?: number | null;
  subcontractorCost?: number | null;
  otherCost?: number | null;
  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  isTaxable: boolean;
  taxRatePct: number;
}

export interface CandidatePreview {
  laborHoursPerUnit: number;
  /** quantity × labor hours per unit. Crew size is NOT a multiplier. */
  laborHours: number;
  materialCostPerUnit: number;
  totals: EstimateLineTotals;
}

/**
 * Preview exactly what confirming a Knowledge Base item will persist.
 * The server applies the same formulas, so preview === saved result.
 */
export function previewCandidateLine(input: CandidatePreviewInput): CandidatePreview {
  const laborHoursPerUnit = resolveCrewHoursPerUnit({
    defaultLaborHours: input.defaultLaborHours ?? null,
    productionRate: input.productionRate ?? null,
  });
  const quantity = Number.isFinite(input.quantity) && input.quantity > 0 ? input.quantity : 0;
  const laborHours = Math.round(quantity * laborHoursPerUnit * 10_000) / 10_000;
  const materialCostPerUnit = resolveMaterialCostPerUnit({
    materialAllowance: input.materialAllowance ?? null,
    wasteFactor: input.wasteFactor ?? null,
    materialFactor: input.materialFactor ?? 1,
  });

  const totals = calculateLine(
    {
      quantity,
      laborHours,
      laborRate: input.laborRate,
      materialCost: materialCostPerUnit,
      equipmentCost: input.equipmentCost ?? 0,
      subcontractorCost: input.subcontractorCost ?? 0,
      otherCost: input.otherCost ?? 0,
      overheadPct: input.overheadPct,
      profitPct: input.profitPct,
      contingencyPct: input.contingencyPct,
      isTaxable: input.isTaxable,
    },
    input.taxRatePct,
  );

  return { laborHoursPerUnit, laborHours, materialCostPerUnit, totals };
}

/** Preview for contractor-entered manual pricing (no library item involved). */
export function previewManualLine(input: {
  quantity: number;
  laborHours: number;
  laborRate: number;
  materialCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;
  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  isTaxable: boolean;
  taxRatePct: number;
}): EstimateLineTotals {
  return calculateLine(
    {
      quantity: input.quantity,
      laborHours: input.laborHours,
      laborRate: input.laborRate,
      materialCost: input.materialCost,
      equipmentCost: input.equipmentCost,
      subcontractorCost: input.subcontractorCost,
      otherCost: input.otherCost,
      overheadPct: input.overheadPct,
      profitPct: input.profitPct,
      contingencyPct: input.contingencyPct,
      isTaxable: input.isTaxable,
    },
    input.taxRatePct,
  );
}

/** Estimate document states in which the completion workflow may run. */
const EDITABLE_STATUSES = new Set(["draft", "in_review", "ready"]);

export function canCompleteLinePricing(estimate: {
  status: string;
  lockedAt: string | null;
  supersededById: string | null;
  archivedAt?: string | null;
}): boolean {
  if (estimate.lockedAt || estimate.supersededById || estimate.archivedAt) return false;
  return EDITABLE_STATUSES.has(estimate.status);
}
