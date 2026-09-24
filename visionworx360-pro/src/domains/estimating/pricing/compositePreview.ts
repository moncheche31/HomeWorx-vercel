/**
 * Composite assembly pricing preview (Pricing Integrity, Phase 1 correction).
 *
 * A recognized composite (e.g. `composite.floor.platform`) is priced by
 * resolving its component assembly keys DIRECTLY out of the effective library
 * — never by free-text searching the contractor's sentence. Each component is
 * priced with the canonical formulas (`previewCandidateLine`), so the preview
 * is exactly what the server persists.
 *
 * Rules enforced here:
 *  - the base quantity is applied exactly once per component
 *    (component quantity = base quantity × component factor),
 *  - crew size never multiplies billable labor hours,
 *  - overhead / profit / contingency / tax are applied once, by `calculateLine`,
 *  - if any component key is missing, the preview reports exactly which one
 *    and is not applicable.
 *
 * Pure functions only — no React, no Supabase, no i18n, no IO.
 */

import { round2, type EstimateLineTotals } from "../calculations";
import { previewCandidateLine } from "./completion";
import type { CompositeAssembly, CompositePlan } from "./assemblies";

/** Minimum library record shape needed to price a component. */
export interface CompositeAssemblyRecord {
  assemblyKey: string;
  workItem: string;
  unitKey: string;
  origin?: string;
  defaultLaborHours?: number | null;
  productionRate?: number | null;
  crewSize?: number | null;
  materialAllowance?: number | null;
  wasteFactor?: number | null;
  defaultOverheadPct?: number | null;
  suggestedProfitPct?: number | null;
}

export interface CompositeComponentPreview {
  assemblyKey: string;
  role: string;
  workItem: string;
  unitKey: string;
  origin: string;
  quantity: number;
  quantityFactor: number;
  laborHoursPerUnit: number;
  laborHours: number;
  materialCostPerUnit: number;
  wasteFactor: number;
  totals: EstimateLineTotals;
}

export interface CompositePricingContext {
  laborRate: number;
  overheadPct: number;
  profitPct: number;
  contingencyPct: number;
  isTaxable: boolean;
  taxRatePct: number;
}

export interface CompositePreview {
  composite: CompositeAssembly;
  compositeKey: string;
  quantity: number;
  unitKey: string;
  components: CompositeComponentPreview[];
  /** Component keys that do not exist in the effective library. */
  missingKeys: string[];
  /** Both quantity and every component resolved: the action may be enabled. */
  canApply: boolean;
  /** Sum of the component canonical totals. */
  totals: EstimateLineTotals;
}

const EMPTY_TOTALS: EstimateLineTotals = {
  laborTotal: 0, materialTotal: 0, equipmentTotal: 0, subcontractorTotal: 0,
  otherTotal: 0, directCost: 0, overhead: 0, profit: 0, contingency: 0,
  taxable: 0, tax: 0, total: 0,
};

const sumTotals = (rows: EstimateLineTotals[]): EstimateLineTotals =>
  rows.reduce<EstimateLineTotals>(
    (acc, r) => ({
      laborTotal: round2(acc.laborTotal + r.laborTotal),
      materialTotal: round2(acc.materialTotal + r.materialTotal),
      equipmentTotal: round2(acc.equipmentTotal + r.equipmentTotal),
      subcontractorTotal: round2(acc.subcontractorTotal + r.subcontractorTotal),
      otherTotal: round2(acc.otherTotal + r.otherTotal),
      directCost: round2(acc.directCost + r.directCost),
      overhead: round2(acc.overhead + r.overhead),
      profit: round2(acc.profit + r.profit),
      contingency: round2(acc.contingency + r.contingency),
      taxable: round2(acc.taxable + r.taxable),
      tax: round2(acc.tax + r.tax),
      total: round2(acc.total + r.total),
    }),
    { ...EMPTY_TOTALS },
  );

/**
 * Price every component of a recognized composite at the given base quantity.
 * `lookup` resolves an assembly key against the effective (organization +
 * library) records; returning null means the component is unavailable.
 */
export function previewCompositeAssembly(input: {
  plan: CompositePlan;
  lookup: (assemblyKey: string) => CompositeAssemblyRecord | null | undefined;
  quantity?: number | null;
  context: CompositePricingContext;
}): CompositePreview {
  const { plan, lookup, context } = input;
  const base = Number(input.quantity ?? plan.quantity ?? 0);
  const quantity = Number.isFinite(base) && base > 0 ? base : 0;

  const components: CompositeComponentPreview[] = [];
  const missingKeys: string[] = [];

  for (const component of plan.composite.components) {
    const record = lookup(component.assemblyKey);
    if (!record) {
      missingKeys.push(component.assemblyKey);
      continue;
    }
    /* Base quantity applied exactly once, scaled only by the declared factor. */
    const componentQuantity = round2(quantity * component.quantityFactor);
    const priced = previewCandidateLine({
      quantity: componentQuantity,
      defaultLaborHours: record.defaultLaborHours ?? null,
      productionRate: record.productionRate ?? null,
      crewSize: record.crewSize ?? null, // descriptive only, never a multiplier
      materialAllowance: record.materialAllowance ?? null,
      wasteFactor: record.wasteFactor ?? null,
      materialFactor: 1,
      laborRate: context.laborRate,
      equipmentCost: 0,
      subcontractorCost: 0,
      otherCost: 0,
      overheadPct: context.overheadPct || record.defaultOverheadPct || 0,
      profitPct: context.profitPct || record.suggestedProfitPct || 0,
      contingencyPct: context.contingencyPct,
      isTaxable: context.isTaxable,
      taxRatePct: context.taxRatePct,
    });

    components.push({
      assemblyKey: record.assemblyKey,
      role: component.role,
      workItem: record.workItem,
      unitKey: record.unitKey,
      origin: record.origin ?? "library",
      quantity: componentQuantity,
      quantityFactor: component.quantityFactor,
      laborHoursPerUnit: priced.laborHoursPerUnit,
      laborHours: priced.laborHours,
      materialCostPerUnit: priced.materialCostPerUnit,
      wasteFactor: record.wasteFactor ?? 0,
      totals: priced.totals,
    });
  }

  return {
    composite: plan.composite,
    compositeKey: plan.composite.key,
    quantity,
    unitKey: plan.composite.unitKey,
    components,
    missingKeys,
    canApply:
      quantity > 0 &&
      missingKeys.length === 0 &&
      components.length === plan.composite.components.length,
    totals: sumTotals(components.map((c) => c.totals)),
  };
}

/** Payload the server persists: one entry per component, in display order. */
export function compositeApplyPayload(preview: CompositePreview): {
  compositeKey: string;
  quantity: number;
  unitKey: string;
  components: { assemblyKey: string; role: string; quantityFactor: number }[];
} {
  return {
    compositeKey: preview.compositeKey,
    quantity: preview.quantity,
    unitKey: preview.unitKey,
    components: preview.components.map((c) => ({
      assemblyKey: c.assemblyKey,
      role: c.role,
      quantityFactor: c.quantityFactor,
    })),
  };
}
