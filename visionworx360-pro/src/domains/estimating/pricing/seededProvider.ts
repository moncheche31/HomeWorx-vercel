/**
 * Seeded regional pricing provider (Module 008, Version 1).
 *
 * Illustrative sample data only — NOT licensed cost data. Values are coarse
 * regional multipliers used so the engine is fully functional offline. Every
 * value it returns is flagged `isSampleData: true`.
 */

import type {
  PricingLocation,
  PricingProvenance,
  PricingProvider,
  PricingQuery,
  PricingScope,
  RegionalPricing,
} from "./types";

const DATASET_VERSION = "seed-v1";

/** Coarse cost-of-construction factors by US state (sample data). */
const STATE_FACTORS: Record<string, number> = {
  AL: 0.88, AK: 1.25, AZ: 0.97, AR: 0.86, CA: 1.24, CO: 1.03, CT: 1.14,
  DE: 1.02, FL: 0.96, GA: 0.92, HI: 1.35, ID: 0.94, IL: 1.08, IN: 0.95,
  IA: 0.93, KS: 0.9, KY: 0.91, LA: 0.89, ME: 0.98, MD: 1.05, MA: 1.18,
  MI: 1.0, MN: 1.07, MS: 0.85, MO: 0.95, MT: 0.95, NE: 0.92, NV: 1.02,
  NH: 1.02, NJ: 1.15, NM: 0.92, NY: 1.28, NC: 0.9, ND: 0.94, OH: 0.98,
  OK: 0.87, OR: 1.06, PA: 1.05, RI: 1.12, SC: 0.89, SD: 0.9, TN: 0.9,
  TX: 0.93, UT: 0.96, VT: 0.99, VA: 0.96, WA: 1.09, WV: 0.95, WI: 1.02,
  WY: 0.92, DC: 1.16,
};

/** Broad regions used when only a region is known (sample data). */
const REGION_FACTORS: Record<string, number> = {
  northeast: 1.14,
  midwest: 1.0,
  south: 0.91,
  west: 1.08,
};

/** Base burdened hourly labor rates by trade at national baseline (sample). */
const TRADE_BASE_RATES: Record<string, number> = {
  general: 65,
  carpentry: 68,
  framing: 66,
  drywall: 62,
  painting: 58,
  flooring: 62,
  tile: 70,
  plumbing: 88,
  electrical: 92,
  hvac: 88,
  roofing: 70,
  concrete: 72,
  masonry: 75,
  landscaping: 55,
  demolition: 52,
};

const NATIONAL_LABOR_BASE = 65;

function normalizeState(value?: string | null): string | null {
  if (!value) return null;
  return value.trim().toUpperCase().slice(0, 2);
}

/** ZIP-prefix → state (sample coverage; falls back to state/region/national). */
const ZIP_PREFIX_STATES: Record<string, string> = {
  "0": "MA", "1": "NY", "2": "VA", "3": "FL", "4": "MI",
  "5": "MN", "6": "IL", "7": "TX", "8": "CO", "9": "CA",
};

function resolveScope(location: PricingLocation): { scope: PricingScope; factor: number } {
  const state = normalizeState(location.state);
  if (location.postalCode) {
    const zip = String(location.postalCode).trim();
    const byState = state ? STATE_FACTORS[state] : undefined;
    const inferred = STATE_FACTORS[ZIP_PREFIX_STATES[zip[0]] ?? ""];
    const factor = byState ?? inferred;
    if (factor) return { scope: "postal_code", factor };
  }
  if (location.county && state && STATE_FACTORS[state]) {
    // County refinement is not licensed in v1; use the state factor at county scope.
    return { scope: "county", factor: STATE_FACTORS[state] };
  }
  if (state && STATE_FACTORS[state]) return { scope: "state", factor: STATE_FACTORS[state] };
  const region = location.region?.trim().toLowerCase();
  if (region && REGION_FACTORS[region]) return { scope: "region", factor: REGION_FACTORS[region] };
  return { scope: "national", factor: 1 };
}

export const seededPricingProvider: PricingProvider = {
  id: "seeded-v1",
  requiresLicense: false,
  async resolve(query: PricingQuery): Promise<RegionalPricing> {
    const { scope, factor } = resolveScope(query.location);
    const trade = query.tradeKey?.trim().toLowerCase() ?? "general";
    const base = TRADE_BASE_RATES[trade] ?? NATIONAL_LABOR_BASE;

    const provenance: PricingProvenance = {
      providerId: seededPricingProvider.id,
      scope,
      datasetVersion: DATASET_VERSION,
      effectiveDate: null,
      isSampleData: true,
      attribution: null,
    };

    return {
      currency: "USD",
      regionalFactor: factor,
      laborRate: Math.round(base * factor * 100) / 100,
      materialFactor: Math.round((1 + (factor - 1) * 0.5) * 1000) / 1000,
      equipmentFactor: Math.round((1 + (factor - 1) * 0.35) * 1000) / 1000,
      taxRatePct: null,
      provenance,
    };
  },
};
