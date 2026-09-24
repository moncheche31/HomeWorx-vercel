/**
 * Build the contractor-internal materials breakdown for ONE estimate.
 *
 * Pure and deterministic. It only ever reads the lines it is handed, so the
 * result is scoped to the current estimate by construction: no module cache,
 * no cross-project state, no default material list for work that is not in
 * this estimate's scope.
 */

import { normalizeTradeKey } from "../tradeTaxonomy";
import { compositionForLine } from "./composition";
import type {
  LineMaterials,
  MaterialLineComponent,
  MaterialSourceLine,
  MaterialsBreakdown,
  NoMaterialReason,
} from "./types";

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;
const round3 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 1000) / 1000;

export interface BuildMaterialsOptions {
  /** `labor_only` means the owner supplies materials for the whole job. */
  pricingMode?: "total" | "labor_materials" | "labor_only";
  /** Line ids the contractor has explicitly marked as excluded / owner-supplied. */
  ownerSuppliedLineIds?: readonly string[];
}

function noMaterialReason(
  line: MaterialSourceLine,
  options: BuildMaterialsOptions,
): NoMaterialReason {
  if (options.ownerSuppliedLineIds?.includes(line.id)) return "owner_supplied";
  if (options.pricingMode === "labor_only") return "owner_supplied";
  /*
   * A line that never resolved to an assembly has no material opinion at all.
   * That is a pricing gap, not a labor-only assembly, and must be flagged so
   * the contractor enters a unit price or a flat allowance.
   */
  if (line.pricingSource === "unmatched" || line.pricingSource == null) return "pricing_needed";
  return "labor_only";
}

/** Materials for a single line, split into major materials and consumables. */
export function buildLineMaterials(
  line: MaterialSourceLine,
  options: BuildMaterialsOptions = {},
): LineMaterials {
  const quantity = Number.isFinite(line.quantity) ? line.quantity : 0;
  const perUnitCost = round2(line.materialCost ?? 0);
  const materialTotal = round2(line.materialTotal ?? perUnitCost * quantity);
  const tradeKey = normalizeTradeKey(line.tradeKey ?? line.description ?? null);
  const base = {
    lineId: line.id,
    description: line.description,
    tradeKey,
    quantity,
    unitKey: line.unitKey ?? null,
    perUnitCost,
    materialTotal,
  };

  if (materialTotal <= 0) {
    const reason = noMaterialReason(line, options);
    const pricingNeeded = reason === "pricing_needed";
    return {
      ...base,
      materialTotal: 0,
      status: pricingNeeded ? "pricing_needed" : "no_material",
      reason,
      components: [
        {
          key: pricingNeeded ? "pricingNeeded" : reason,
          tier: "major",
          quantity: null,
          unitKey: null,
          unitCost: null,
          extendedCost: 0,
          source: pricingNeeded ? "pricing_needed" : "assembly",
          confidence: pricingNeeded ? "low" : "high",
        },
      ],
    };
  }

  /* Contractor money is authority: never decomposed, never re-derived. */
  if (line.isPriceOverridden || line.pricingSource === "contractor") {
    return {
      ...base,
      status: "override",
      reason: null,
      components: [
        {
          key: "contractorPriced",
          tier: "major",
          quantity,
          unitKey: line.unitKey ?? null,
          unitCost: perUnitCost,
          extendedCost: materialTotal,
          source: "override",
          confidence: "high",
        },
      ],
    };
  }

  const composition = compositionForLine(line);
  const components: MaterialLineComponent[] = composition.components.map((component) => {
    const extended = round2(materialTotal * component.share);
    const canDerive =
      component.coveragePerUnit != null &&
      component.coveragePerUnit > 0 &&
      component.measuredUnit != null &&
      line.unitKey === component.measuredUnit &&
      quantity > 0;
    const derivedQuantity = canDerive
      ? round3(quantity / (component.coveragePerUnit as number))
      : null;
    return {
      key: component.key,
      tier: component.tier,
      quantity: derivedQuantity,
      unitKey: derivedQuantity != null ? (component.componentUnit ?? null) : null,
      unitCost: derivedQuantity != null && derivedQuantity > 0
        ? round2(extended / derivedQuantity)
        : null,
      extendedCost: extended,
      source: derivedQuantity != null ? "derived" : component.tier === "consumable" ? "allowance" : "assembly",
      confidence: derivedQuantity != null ? "medium" : component.tier === "major" ? "medium" : "low",
    };
  });

  /* Rounding never changes the line total the estimate already published. */
  const drift = round2(materialTotal - components.reduce((a, c) => a + c.extendedCost, 0));
  if (drift !== 0 && components.length > 0) {
    const biggest = components.reduce((a, b) => (b.extendedCost > a.extendedCost ? b : a));
    biggest.extendedCost = round2(biggest.extendedCost + drift);
  }

  return { ...base, status: "priced", reason: null, components };
}

function rollup(components: MaterialLineComponent[]): MaterialLineComponent[] {
  const map = new Map<string, MaterialLineComponent>();
  for (const component of components) {
    const existing = map.get(component.key);
    if (!existing) {
      map.set(component.key, { ...component });
      continue;
    }
    existing.extendedCost = round2(existing.extendedCost + component.extendedCost);
    if (existing.quantity != null && component.quantity != null) {
      existing.quantity = round3(existing.quantity + component.quantity);
      existing.unitCost =
        existing.quantity > 0 ? round2(existing.extendedCost / existing.quantity) : null;
    } else {
      existing.quantity = null;
      existing.unitKey = null;
      existing.unitCost = null;
    }
  }
  return [...map.values()].sort((a, b) => b.extendedCost - a.extendedCost);
}

/** Whole-estimate materials breakdown. */
export function buildMaterialsBreakdown(
  lines: readonly MaterialSourceLine[],
  options: BuildMaterialsOptions = {},
): MaterialsBreakdown {
  const built = lines.map((line) => buildLineMaterials(line, options));
  const all = built.flatMap((line) => line.components);
  const major = all.filter((c) => c.tier === "major" && c.extendedCost > 0);
  const consumable = all.filter((c) => c.tier === "consumable" && c.extendedCost > 0);

  return {
    lines: built.sort((a, b) => b.materialTotal - a.materialTotal),
    majorTotal: round2(major.reduce((a, c) => a + c.extendedCost, 0)),
    consumableTotal: round2(consumable.reduce((a, c) => a + c.extendedCost, 0)),
    materialTotal: round2(built.reduce((a, l) => a + l.materialTotal, 0)),
    pricingNeededCount: built.filter((l) => l.status === "pricing_needed").length,
    noMaterialCount: built.filter((l) => l.status === "no_material").length,
    majorComponents: rollup(major),
    consumableComponents: rollup(consumable),
  };
}
