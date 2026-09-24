/**
 * PRICING INVARIANT GUARD.
 *
 * A project with recognized, included, priceable scope must never present or
 * commit a $0 – $0 estimate. Zero money with real scope is an ENGINE FAILURE,
 * and the contractor has to be told that rather than handed a fake number.
 *
 * Legitimate zero-cost states are preserved: a project with no included
 * priceable scope at all (notes/exclusions only) is not blocked.
 *
 * Pure module: no React, no IO.
 */

import type { EstimateScenario, UnpricedScopeFeature } from "./types";

export interface PricingGuardState {
  blocked: boolean;
  /** Machine-readable causes, in the order they were detected. */
  reasons: Array<"no_priced_tasks" | "zero_money">;
  unpricedFeatures: UnpricedScopeFeature[];
}

export interface PricingGuardInput {
  scenario: EstimateScenario | null | undefined;
  /** Count of included, priceable scope features/items on the project. */
  priceableScopeCount: number;
}

export function evaluatePricingGuard(input: PricingGuardInput): PricingGuardState {
  const { scenario, priceableScopeCount } = input;
  const unpricedFeatures = scenario?.unpricedFeatures ?? [];
  if (priceableScopeCount <= 0) return { blocked: false, reasons: [], unpricedFeatures };
  if (!scenario) {
    return { blocked: true, reasons: ["no_priced_tasks"], unpricedFeatures };
  }
  const reasons: PricingGuardState["reasons"] = [];
  const breakdown = scenario.breakdown ?? null;
  const hasCostEvidence =
    (breakdown?.laborCost ?? 0) > 0 || (breakdown?.materialCost ?? 0) > 0;
  /*
   * Zero tasks is only a failure when nothing else proves the money is real.
   * A caller that supplies a cost breakdown (crew hours + labor/material cost)
   * has an authoritative basis even when driver rollups were not passed along.
   */
  if (scenario.drivers.length === 0 && !hasCostEvidence) reasons.push("no_priced_tasks");
  if (!(scenario.costHigh > 0)) reasons.push("zero_money");
  return { blocked: reasons.length > 0, reasons, unpricedFeatures };
}

/** Thrown instead of committing an estimate that violates the invariant. */
export class PricingUnresolvedError extends Error {
  readonly state: PricingGuardState;

  constructor(state: PricingGuardState) {
    super(
      `Pricing unresolved: ${state.reasons.join(", ") || "unknown"}. ` +
        `${state.unpricedFeatures.length} recognized feature(s) could not be priced.`,
    );
    this.name = "PricingUnresolvedError";
    this.state = state;
  }
}
