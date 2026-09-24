/**
 * Knowledge Base → Estimate pricing bridge (Phase 1).
 *
 * Pure, deterministic helpers shared by the server bridge and the UI notice.
 * No network, no Supabase, no React.
 *
 * FIELD SEMANTICS (as stored in the Knowledge Base):
 * - `default_labor_hours` — BILLABLE labor hours per unit of measure. This is
 *   what the Module 008 engine multiplies by the burdened labor rate, so it is
 *   used as-is.
 * - `crew_size` — workers in the crew. It is DESCRIPTIVE: the engine divides
 *   labor hours by crew size to derive calendar/crew hours for scheduling. It
 *   must never multiply labor hours, which would double-count labor cost.
 * - `production_rate` — units produced per labor hour; the inverse of
 *   `default_labor_hours` in the seeded library.
 * - `material_allowance` — material cost PER UNIT, before waste.
 * - `waste_factor` — a fraction (0.05 = 5%), not a percentage.
 * - `suggested_markup_pct` — recorded in provenance only. It is NOT applied,
 *   because the estimate math model already applies overhead → profit →
 *   contingency; applying markup as well would double-count.
 */

import type { PricingProvenance, RegionalPricing } from "./types";

/**
 * Minimum match score for a library item to price a line automatically.
 * Weaker candidates are recorded for review but never applied — a loose text
 * overlap ("Frame platform floor" ↔ "LVL beam") produced wildly wrong costs.
 * Must stay in sync with `kb_apply_pricing`.
 */
export const KB_MIN_MATCH_SCORE = 60;

/** Payload handed to the SQL bridge (`kb_apply_pricing`). */
export interface KnowledgePricingPayload {
  defaultLaborRate: number;
  /** Burdened hourly rate per trade key. */
  laborRates: Record<string, number>;
  materialFactor: number;
  equipmentFactor: number;
  regionalFactor: number;
  provenance: PricingProvenance & { currency: string };
}

const round = (value: number, dp = 4): number => {
  const f = 10 ** dp;
  return Math.round((Number.isFinite(value) ? value : 0) * f) / f;
};

/** Labor hours per unit, from stored labor hours or derived from production rate. */
export function resolveCrewHoursPerUnit(input: {
  defaultLaborHours?: number | null;
  productionRate?: number | null;
}): number {
  const hours = Number(input.defaultLaborHours ?? 0);
  if (hours > 0) return hours;
  const rate = Number(input.productionRate ?? 0);
  return rate > 0 ? round(1 / rate) : 0;
}

/**
 * Billable labor hours for a line: quantity × labor hours per unit.
 * Crew size is deliberately NOT a multiplier — see the field semantics above.
 */
export function resolveLaborHoursForLine(input: {
  quantity: number;
  defaultLaborHours?: number | null;
  productionRate?: number | null;
  crewSize?: number | null;
}): number {
  const qty = Number(input.quantity ?? 0);
  return round(qty * resolveCrewHoursPerUnit(input));
}

/** Per-unit material cost: allowance × (1 + waste fraction) × regional factor. */
export function resolveMaterialCostPerUnit(input: {
  materialAllowance?: number | null;
  wasteFactor?: number | null;
  materialFactor?: number | null;
}): number {
  const allowance = Number(input.materialAllowance ?? 0);
  const waste = Number(input.wasteFactor ?? 0);
  const factor = Number(input.materialFactor ?? 1) || 1;
  return Math.round(allowance * (1 + waste) * factor * 100) / 100;
}

/** Build the SQL bridge payload from resolved regional pricing. */
export function buildPricingPayload(
  base: RegionalPricing,
  tradeRates: Record<string, number | null | undefined>,
): KnowledgePricingPayload {
  const laborRates: Record<string, number> = {};
  for (const [trade, rate] of Object.entries(tradeRates)) {
    if (typeof rate === "number" && Number.isFinite(rate) && rate > 0) {
      laborRates[trade] = Math.round(rate * 100) / 100;
    }
  }
  return {
    defaultLaborRate: Math.round(Number(base.laborRate ?? 0) * 100) / 100,
    laborRates,
    materialFactor: Number(base.materialFactor ?? 1) || 1,
    equipmentFactor: Number(base.equipmentFactor ?? 1) || 1,
    regionalFactor: Number(base.regionalFactor ?? 1) || 1,
    provenance: { ...base.provenance, currency: base.currency },
  };
}

/* ---------------- estimate-level pricing status ---------------- */

export type LinePricingSource =
  | "knowledge_base"
  | "contractor"
  | "unmatched"
  | "nce_2026_book"
  /** Material cost estimated by the assistant; labor is never estimated. */
  | "ai_estimated_material"
  | (string & {})
  | null;


export interface PricingStatusLine {
  pricingSource: LinePricingSource;
  isPriceOverridden: boolean;
  laborHours: number;
  laborRate: number;
  materialCost: number;
  equipmentCost: number;
  subcontractorCost: number;
  otherCost: number;
  pricingProvenance:
    | { isSampleData?: boolean | null; pricing?: { isSampleData?: boolean | null } | null }
    | null;
}

export interface EstimatePricingStatus {
  total: number;
  priced: number;
  unmatched: number;
  contractorEdited: number;
  /** Lines with no cost at all — the estimate is not complete. */
  zeroCost: number;
  /** True while any applied value came from illustrative sample data. */
  usesSampleData: boolean;
}

const lineHasCost = (line: PricingStatusLine): boolean =>
  line.laborHours * line.laborRate > 0 ||
  line.materialCost > 0 ||
  line.equipmentCost > 0 ||
  line.subcontractorCost > 0 ||
  line.otherCost > 0;

/** Counts surfaced in the estimate-level pricing notice. */
export function summarizePricing(lines: PricingStatusLine[]): EstimatePricingStatus {
  const status: EstimatePricingStatus = {
    total: lines.length,
    priced: 0,
    unmatched: 0,
    contractorEdited: 0,
    zeroCost: 0,
    usesSampleData: false,
  };
  for (const line of lines) {
    if (line.isPriceOverridden || line.pricingSource === "contractor") status.contractorEdited += 1;
    else if (line.pricingSource === "knowledge_base") status.priced += 1;
    else status.unmatched += 1;

    if (!lineHasCost(line)) status.zeroCost += 1;
    const prov = line.pricingProvenance;
    if (prov?.isSampleData === true || prov?.pricing?.isSampleData === true) {
      status.usesSampleData = true;
    }
  }
  return status;
}

/** True when an estimate may be repriced (never issued / locked / superseded work). */
export function canApplyKnowledgePricing(estimate: {
  status: string;
  lockedAt: string | null;
  supersededById: string | null;
}): boolean {
  if (estimate.lockedAt || estimate.supersededById) return false;
  return !["approved", "sent", "accepted", "declined", "superseded"].includes(estimate.status);
}
