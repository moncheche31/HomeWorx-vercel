/**
 * NATIONAL PERMIT FEE BENCHMARKS — 2026 research defaults.
 *
 * These rows are FALLBACKS, not local truth. Every row carries its source
 * title, source URL, effective date and library version so it can be replaced
 * when a jurisdiction schedule is loaded, and so the UI can label the number
 * as "national permit allowance — verify local fee".
 *
 * Sources (2026):
 *  - Angi, "How Much Do Building Permits Cost?" (2026)
 *  - HomeGuide, "Building Permit Cost" (2026)
 *
 * Whole dollars only. Zero labor hours by construction.
 */

import type { PermitFeeRule, PermitType } from "./types";

export const PERMIT_LIBRARY_VERSION = "national-2026.1";
export const PERMIT_LIBRARY_EFFECTIVE_DATE = "2026-01-01";

const ANGI = {
  sourceType: "national_benchmark" as const,
  sourceTitle: "Angi 2026 building permit cost research",
  sourceUrl: "https://www.angi.com/articles/how-much-does-building-permit-cost.htm",
};

const HOMEGUIDE = {
  sourceType: "national_benchmark" as const,
  sourceTitle: "HomeGuide 2026 building permit cost research",
  sourceUrl: "https://homeguide.com/costs/building-permit-cost",
};

interface RuleSeed {
  id: string;
  permitType: PermitType;
  workClass: string;
  method: PermitFeeRule["method"];
  base?: number;
  low?: number;
  high?: number;
  rate?: number;
  min?: number;
  max?: number;
  bundles?: PermitType[];
  source: typeof ANGI;
  notes?: string;
}

/**
 * National fallback formulas. `range_allowance` rows price at the midpoint and
 * expose the band; `percent_of_valuation` rows apply a percentage of the
 * PRE-PERMIT construction cost base with min/max guardrails.
 */
const SEEDS: RuleSeed[] = [
  /* ---- Standalone trade permits ---- */
  {
    id: "nat-electrical-minor",
    permitType: "electrical",
    workClass: "electrical_minor",
    method: "range_allowance",
    low: 50,
    high: 350,
    source: HOMEGUIDE,
    notes: "Electrical commonly $50–$350, or base plus per-device fee.",
  },
  {
    id: "nat-electrical-devices",
    permitType: "electrical",
    workClass: "electrical_devices",
    method: "per_device",
    base: 60,
    rate: 12,
    min: 75,
    max: 500,
    source: HOMEGUIDE,
    notes: "Base permit plus per-circuit/device fee; scales with known counts.",
  },
  {
    id: "nat-electrical-service",
    permitType: "electrical",
    workClass: "electrical_service",
    method: "range_allowance",
    low: 150,
    high: 500,
    source: ANGI,
    notes: "Service/panel/rewiring work sits at the top of the $10–$500 band.",
  },
  {
    id: "nat-plumbing-minor",
    permitType: "plumbing",
    workClass: "plumbing_minor",
    method: "range_allowance",
    low: 50,
    high: 300,
    source: HOMEGUIDE,
    notes: "Plumbing commonly $30–$500, or per fixture.",
  },
  {
    id: "nat-plumbing-fixtures",
    permitType: "plumbing",
    workClass: "plumbing_fixtures",
    method: "per_fixture",
    base: 70,
    rate: 25,
    min: 90,
    max: 500,
    source: HOMEGUIDE,
  },
  {
    id: "nat-plumbing-roughin",
    permitType: "plumbing",
    workClass: "plumbing_rough_in",
    method: "range_allowance",
    low: 150,
    high: 500,
    source: ANGI,
  },
  {
    id: "nat-mechanical",
    permitType: "mechanical",
    workClass: "hvac_equipment",
    method: "range_allowance",
    low: 250,
    high: 400,
    source: ANGI,
    notes: "HVAC $250–$400 for equipment or duct modification.",
  },
  {
    id: "nat-roofing",
    permitType: "roofing",
    workClass: "roofing",
    method: "range_allowance",
    low: 250,
    high: 500,
    source: ANGI,
  },
  {
    id: "nat-demolition",
    permitType: "demolition",
    workClass: "demolition",
    method: "range_allowance",
    low: 150,
    high: 300,
    source: ANGI,
    notes: "Demolition about $200 nationally.",
  },
  {
    id: "nat-windows",
    permitType: "building",
    workClass: "windows",
    method: "per_device",
    base: 0,
    rate: 50,
    min: 100,
    max: 1000,
    source: ANGI,
    notes: "Roughly $50 per window; applied only where a permit is likely.",
  },
  {
    id: "nat-deck",
    permitType: "building",
    workClass: "deck",
    method: "range_allowance",
    low: 100,
    high: 300,
    source: ANGI,
  },
  {
    id: "nat-fence",
    permitType: "building",
    workClass: "fence",
    method: "range_allowance",
    low: 50,
    high: 300,
    source: HOMEGUIDE,
  },
  {
    id: "nat-shed",
    permitType: "building",
    workClass: "shed",
    method: "range_allowance",
    low: 50,
    high: 300,
    source: HOMEGUIDE,
  },
  {
    id: "nat-zoning",
    permitType: "zoning",
    workClass: "zoning",
    method: "range_allowance",
    low: 100,
    high: 500,
    source: HOMEGUIDE,
  },
  {
    id: "nat-occupancy",
    permitType: "occupancy",
    workClass: "occupancy",
    method: "range_allowance",
    low: 100,
    high: 400,
    source: HOMEGUIDE,
    notes: "Optional certificate / additional inspection fee — needs review.",
  },

  /* ---- Building permits by project class (master permits) ---- */
  {
    id: "nat-building-simple",
    permitType: "building",
    workClass: "structural_minor",
    method: "range_allowance",
    low: 150,
    high: 2000,
    source: ANGI,
    notes: "Construction permits commonly $150–$2,000.",
  },
  {
    id: "nat-building-conversion",
    permitType: "building",
    workClass: "conversion",
    method: "range_allowance",
    low: 1200,
    high: 2000,
    bundles: ["electrical", "plumbing", "mechanical"],
    source: ANGI,
    notes:
      "Garage/basement conversion $1,200–$2,000 combined; many jurisdictions bundle trade permits into this master permit.",
  },
  {
    id: "nat-building-kitchen",
    permitType: "building",
    workClass: "kitchen_remodel",
    method: "range_allowance",
    low: 700,
    high: 1400,
    source: ANGI,
    notes: "Kitchen remodel ~$1,000 midpoint.",
  },
  {
    id: "nat-building-bathroom",
    permitType: "building",
    workClass: "bathroom_remodel",
    method: "range_allowance",
    low: 400,
    high: 800,
    source: ANGI,
    notes: "Bathroom remodel ~$600 midpoint.",
  },
  {
    id: "nat-building-basement-finish",
    permitType: "building",
    workClass: "basement_finish",
    method: "range_allowance",
    low: 350,
    high: 650,
    source: ANGI,
    notes: "Basement finish ~$500 for straightforward permitted finish.",
  },
  {
    id: "nat-building-addition",
    permitType: "building",
    workClass: "addition",
    method: "range_allowance",
    low: 900,
    high: 1700,
    bundles: ["electrical", "plumbing", "mechanical"],
    source: ANGI,
    notes: "Home addition ~$1,300 starting allowance; larger jobs use valuation.",
  },
  {
    id: "nat-building-valuation",
    permitType: "building",
    workClass: "whole_home_renovation",
    method: "percent_of_valuation",
    rate: 1.25,
    min: 500,
    max: 25000,
    bundles: ["electrical", "plumbing", "mechanical"],
    source: HOMEGUIDE,
    notes:
      "Permit fees average 0.5%–2.0% of construction cost; 1.25% configurable midpoint with guardrails.",
  },
];

export const NATIONAL_PERMIT_RULES: PermitFeeRule[] = SEEDS.map((s) => ({
  id: s.id,
  scope: "national",
  jurisdiction: { countryCode: "US" },
  permitType: s.permitType,
  workClass: s.workClass,
  method: s.method,
  base: s.base ?? null,
  min: s.min ?? null,
  max: s.max ?? null,
  rate: s.rate ?? null,
  low: s.low ?? null,
  high: s.high ?? null,
  effectiveDate: PERMIT_LIBRARY_EFFECTIVE_DATE,
  version: PERMIT_LIBRARY_VERSION,
  sourceType: s.source.sourceType,
  sourceTitle: s.source.sourceTitle,
  sourceUrl: s.source.sourceUrl,
  confidence: "low",
  bundles: s.bundles ?? [],
  notes: s.notes ?? null,
}));

/** Default midpoint used by valuation strategy, in percent of construction cost. */
export const DEFAULT_VALUATION_PCT = 1.25;
export const VALUATION_PCT_MIN = 0.5;
export const VALUATION_PCT_MAX = 2.0;

/** Construction cost above which the valuation strategy is preferred. */
export const VALUATION_STRATEGY_THRESHOLD = 150_000;

export function nationalRule(
  permitType: PermitType,
  workClass: string,
): PermitFeeRule | null {
  return (
    NATIONAL_PERMIT_RULES.find((r) => r.permitType === permitType && r.workClass === workClass) ??
    null
  );
}
