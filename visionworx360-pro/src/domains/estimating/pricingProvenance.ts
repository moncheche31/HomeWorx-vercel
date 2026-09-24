/**
 * WHERE AN ESTIMATE'S PRICING SETTINGS CAME FROM.
 *
 * Company pricing settings are DEFAULTS FOR NEW ESTIMATES, never a live feed
 * into saved documents. An existing estimate keeps the method and percentages
 * it was created with until the contractor deliberately applies the current
 * company defaults.
 *
 * This module answers two questions with no IO and no React:
 *  1. Does this estimate currently match the company default?
 *  2. Is the contractor looking at a company default or at an override?
 *
 * Pure module — no React, no Supabase, no i18n, no IO.
 */

import {
  normalizePricingStrategy,
  type PricingStrategy,
} from "./pricingStrategy";

export type PricingSettingsSource = "company_default" | "estimate_override";

export interface PricingSettingsProvenance {
  source: PricingSettingsSource;
  /** The strategy actually in force on the estimate. */
  estimate: PricingStrategy;
  /** The company default a "use company settings" action would apply. */
  company: PricingStrategy;
  /** True when applying company defaults would change nothing. */
  matchesCompanyDefault: boolean;
  /** True when the two differ by METHOD, not just by percentage. */
  methodDiffers: boolean;
}

const same = (a: number, b: number) => Math.abs(a - b) < 0.001;

/** Do two strategies price identically? Only the active method's inputs count. */
export function strategiesEqual(a: PricingStrategy, b: PricingStrategy): boolean {
  if (a.method !== b.method) return false;
  if (a.method === "target_gross_margin") {
    return same(a.targetGrossMarginPct, b.targetGrossMarginPct);
  }
  return same(a.overheadPct, b.overheadPct) && same(a.profitPct, b.profitPct);
}

/**
 * Compare an estimate's saved strategy with the company default.
 *
 * An estimate is only reported as a company default when it still prices
 * exactly like one; anything else is an override and is labelled as such, so a
 * contractor is never told a 10/10 legacy estimate is "the company setting"
 * after the company moved to a 40% target margin.
 */
export function resolvePricingProvenance(
  estimateStrategy: unknown,
  companyStrategy: unknown,
): PricingSettingsProvenance {
  const estimate = normalizePricingStrategy(estimateStrategy);
  const company = normalizePricingStrategy(companyStrategy);
  const matches = strategiesEqual(estimate, company);
  return {
    source: matches ? "company_default" : "estimate_override",
    estimate,
    company,
    matchesCompanyDefault: matches,
    methodDiffers: estimate.method !== company.method,
  };
}

/** The strategy an "Apply company defaults" action would save. */
export function companyDefaultStrategy(company: unknown): PricingStrategy {
  return normalizePricingStrategy(company);
}
