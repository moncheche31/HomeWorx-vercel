/**
 * BOOK LABOR RATES — National Construction Estimator 2026.
 *
 * SINGLE SOURCE OF TRUTH for every labor rate the app charges, in every
 * pricing path (Estimate tab, Remote Vision / narrative ballpark, scope
 * recalculation). There is no flat company rate and no legacy sample rate:
 * a rate is a published craft wage times the job-site area modification
 * factor, or it is the flagged national baseline.
 *
 * The wage figures mirror `labor_wage_rates_nce2026` (total hourly cost,
 * including burden) so the client-side ballpark and the database repricing
 * functions (`nce_labor_rate`) agree to the cent.
 *
 * Pure module — no React, no IO.
 */

export const BOOK_PRICING_SOURCE = "nce2026" as const;

/** Craft -> total burdened hourly cost, NCE 2026 national baseline (USD). */
export const NCE_CRAFT_HOURLY_COST: Readonly<Record<string, number>> = {
  Bricklayer: 44.21,
  "Bricklayer's Helper": 33.8,
  "Building Laborer": 37.4,
  Carpenter: 45.88,
  "Cement Mason": 43.66,
  "Drywall installer": 44.11,
  "Drywall Taper": 44.72,
  Electrician: 48.35,
  "Floor Layer": 42.19,
  Glazier: 43.85,
  Lather: 43.99,
  "Marble Setter": 37.59,
  Millwright: 43.64,
  "Mosaic & Terrazzo Worker": 39.86,
  "Operating Engineer": 51.09,
  Painter: 45.39,
  Plasterer: 45.5,
  "Plasterer Helper": 34.39,
  Plumber: 51.49,
  "Reinforcing Ironworker": 47.27,
  Roofer: 49.37,
  "Sheet Metal Worker": 49.64,
  "Sprinkler Fitter": 50.83,
  "Tile Layer": 40.27,
  "Truck Driver": 38.87,
};

/**
 * Trade -> craft. Mirrors the database `nce_craft_for_trade()` mapping and
 * additionally covers the app's own GC taxonomy keys (`sitework_concrete`,
 * `finish_carpentry`, `exterior`, ...) so no trade silently loses its craft.
 */
const TRADE_CRAFT: Readonly<Record<string, string>> = {
  roofing: "Roofer",
  siding: "Carpenter",
  exterior: "Carpenter",
  carpentry: "Carpenter",
  finish_carpentry: "Carpenter",
  trim: "Carpenter",
  framing: "Carpenter",
  decks: "Carpenter",
  doors: "Carpenter",
  windows: "Carpenter",
  doors_windows: "Carpenter",
  cabinetry: "Carpenter",
  drywall: "Drywall installer",
  painting: "Painter",
  flooring: "Floor Layer",
  tile: "Tile Layer",
  electrical: "Electrician",
  plumbing: "Plumber",
  hvac: "Sheet Metal Worker",
  masonry: "Bricklayer",
  concrete: "Cement Mason",
  sitework_concrete: "Cement Mason",
  insulation: "Building Laborer",
  demolition: "Building Laborer",
  sitework: "Building Laborer",
  landscaping: "Building Laborer",
  general_conditions: "Building Laborer",
  specialty: "Carpenter",
  unassigned: "Carpenter",
  general: "Carpenter",
};

/** Craft used whenever a trade is unknown — same default the database uses. */
export const BOOK_DEFAULT_CRAFT = "Carpenter";

/** National baseline general labor rate. Never a company flat rate. */
export const BOOK_NATIONAL_LABOR_RATE = NCE_CRAFT_HOURLY_COST[BOOK_DEFAULT_CRAFT] as number;

export function craftForTrade(tradeKey?: string | null): string {
  const key = String(tradeKey ?? "").trim().toLowerCase();
  return TRADE_CRAFT[key] ?? BOOK_DEFAULT_CRAFT;
}

/**
 * How the job-site labor factor was resolved. `national_baseline` means the
 * job site is not confirmed yet — the rate is real book money, but it is
 * flagged so nothing presents it as a located price.
 */
export type BookLocationSource =
  | "manual_override"
  | "zip_prefix"
  | "state_average"
  | "national_baseline";

export interface BookPricingLocation {
  location: string;
  source: BookLocationSource;
  materialPct: number;
  laborPct: number;
  equipmentPct: number;
}

/** Used before a job site is known: real book rates, national baseline, flagged. */
export const NATIONAL_BASELINE_LOCATION: BookPricingLocation = {
  location: "National Baseline",
  source: "national_baseline",
  materialPct: 0,
  laborPct: 0,
  equipmentPct: 0,
};

export function isLocatedPricing(location?: BookPricingLocation | null): boolean {
  return !!location && location.source !== "national_baseline";
}

const pct = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/** Book hourly labor rate for a trade at a job-site location factor. */
export function bookLaborRate(
  tradeKey?: string | null,
  location?: BookPricingLocation | null,
): number {
  const base = NCE_CRAFT_HOURLY_COST[craftForTrade(tradeKey)] ?? BOOK_NATIONAL_LABOR_RATE;
  const factor = 1 + pct(location?.laborPct) / 100;
  return Math.round(base * factor * 100) / 100;
}

/** Every trade's book rate at one location — handed to the ballpark engine. */
export function bookLaborRateTable(
  location?: BookPricingLocation | null,
): Record<string, number> {
  const table: Record<string, number> = {};
  for (const trade of Object.keys(TRADE_CRAFT)) table[trade] = bookLaborRate(trade, location);
  return table;
}
