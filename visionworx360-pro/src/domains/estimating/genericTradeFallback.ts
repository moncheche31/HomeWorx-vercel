/**
 * GENERIC TRADE FALLBACK — recognized work is never silently worth $0.
 *
 * The catalog will always lag reality: a contractor can describe legitimate
 * residential work ("remove the closet", "build the built-in bookcases to
 * match the rendering") that no assembly key covers yet. Before this module the
 * canonical cost graph zeroed those lines, and an estimate whose whole scope
 * was uncatalogued collapsed to a "$0 – $0 suggested price" — a fake number
 * presented as a real one.
 *
 * The rule this module enforces:
 *
 *   Recognized work with a usable quantity and an identifiable trade is priced
 *   from a documented GENERIC TRADE RATE and labeled as an allowance that needs
 *   review. Work with no usable quantity or no identifiable trade stays
 *   explicitly UNPRICED. Neither one is ever a silent zero.
 *
 * These rates are deliberately coarse, conservative, order-of-magnitude
 * residential remodeling productivity/material numbers. They exist to keep an
 * estimate honest and reviewable until a real assembly (or the contractor's own
 * cost book) replaces them — they are not a substitute for the catalog.
 *
 * Pure module: no React, no Supabase, no i18n, no IO.
 */

import { normalizeTradeKey, UNASSIGNED_TRADE, type LaborTradeKey } from "./tradeTaxonomy";
import { inferTradeKey } from "./tradeInference";
import { roundQuarterHour } from "./laborTime";

/** Unit families the fallback prices in. Everything else is treated as a count. */
export type FallbackUnitFamily = "linear" | "area" | "volume" | "count";

/** Default labor rate used when a line carries none. Conservative blended rate. */
export const FALLBACK_LABOR_RATE = 65;

export interface GenericTradeRate {
  laborHoursPerUnit: number;
  materialCostPerUnit: number;
}

/**
 * Generic residential remodeling rates by trade and unit family. Every trade in
 * the taxonomy is covered so a recognized line can never fall through.
 */
export const GENERIC_TRADE_RATES: Record<
  LaborTradeKey,
  Record<FallbackUnitFamily, GenericTradeRate>
> = {
  general_conditions: {
    linear: { laborHoursPerUnit: 0.05, materialCostPerUnit: 1 },
    area: { laborHoursPerUnit: 0.01, materialCostPerUnit: 0.5 },
    volume: { laborHoursPerUnit: 0.05, materialCostPerUnit: 2 },
    count: { laborHoursPerUnit: 1, materialCostPerUnit: 25 },
  },
  demolition: {
    linear: { laborHoursPerUnit: 0.35, materialCostPerUnit: 3 },
    area: { laborHoursPerUnit: 0.05, materialCostPerUnit: 1 },
    volume: { laborHoursPerUnit: 0.2, materialCostPerUnit: 2 },
    count: { laborHoursPerUnit: 2, materialCostPerUnit: 40 },
  },
  sitework_concrete: {
    linear: { laborHoursPerUnit: 0.5, materialCostPerUnit: 18 },
    area: { laborHoursPerUnit: 0.1, materialCostPerUnit: 7 },
    volume: { laborHoursPerUnit: 1.5, materialCostPerUnit: 180 },
    count: { laborHoursPerUnit: 3, materialCostPerUnit: 120 },
  },
  framing: {
    linear: { laborHoursPerUnit: 0.5, materialCostPerUnit: 22 },
    area: { laborHoursPerUnit: 0.06, materialCostPerUnit: 4 },
    volume: { laborHoursPerUnit: 0.3, materialCostPerUnit: 12 },
    count: { laborHoursPerUnit: 3, materialCostPerUnit: 150 },
  },
  roofing: {
    linear: { laborHoursPerUnit: 0.2, materialCostPerUnit: 9 },
    area: { laborHoursPerUnit: 0.045, materialCostPerUnit: 4.5 },
    volume: { laborHoursPerUnit: 0.2, materialCostPerUnit: 6 },
    count: { laborHoursPerUnit: 2, materialCostPerUnit: 90 },
  },
  exterior: {
    linear: { laborHoursPerUnit: 0.25, materialCostPerUnit: 12 },
    area: { laborHoursPerUnit: 0.05, materialCostPerUnit: 6 },
    volume: { laborHoursPerUnit: 0.2, materialCostPerUnit: 8 },
    count: { laborHoursPerUnit: 3, materialCostPerUnit: 250 },
  },
  plumbing: {
    linear: { laborHoursPerUnit: 0.25, materialCostPerUnit: 9 },
    area: { laborHoursPerUnit: 0.05, materialCostPerUnit: 3 },
    volume: { laborHoursPerUnit: 0.2, materialCostPerUnit: 5 },
    count: { laborHoursPerUnit: 2.5, materialCostPerUnit: 180 },
  },
  electrical: {
    linear: { laborHoursPerUnit: 0.08, materialCostPerUnit: 3 },
    area: { laborHoursPerUnit: 0.03, materialCostPerUnit: 1.5 },
    volume: { laborHoursPerUnit: 0.1, materialCostPerUnit: 2 },
    count: { laborHoursPerUnit: 1, materialCostPerUnit: 45 },
  },
  hvac: {
    linear: { laborHoursPerUnit: 0.15, materialCostPerUnit: 10 },
    area: { laborHoursPerUnit: 0.03, materialCostPerUnit: 4 },
    volume: { laborHoursPerUnit: 0.1, materialCostPerUnit: 5 },
    count: { laborHoursPerUnit: 2.5, materialCostPerUnit: 220 },
  },
  insulation: {
    linear: { laborHoursPerUnit: 0.05, materialCostPerUnit: 2 },
    area: { laborHoursPerUnit: 0.02, materialCostPerUnit: 1.5 },
    volume: { laborHoursPerUnit: 0.05, materialCostPerUnit: 2 },
    count: { laborHoursPerUnit: 1, materialCostPerUnit: 40 },
  },
  drywall: {
    linear: { laborHoursPerUnit: 0.12, materialCostPerUnit: 2.5 },
    area: { laborHoursPerUnit: 0.035, materialCostPerUnit: 1.6 },
    volume: { laborHoursPerUnit: 0.1, materialCostPerUnit: 2 },
    count: { laborHoursPerUnit: 1.5, materialCostPerUnit: 45 },
  },
  finish_carpentry: {
    linear: { laborHoursPerUnit: 0.6, materialCostPerUnit: 45 },
    area: { laborHoursPerUnit: 0.12, materialCostPerUnit: 14 },
    volume: { laborHoursPerUnit: 0.3, materialCostPerUnit: 20 },
    count: { laborHoursPerUnit: 4, materialCostPerUnit: 300 },
  },
  flooring: {
    linear: { laborHoursPerUnit: 0.1, materialCostPerUnit: 5 },
    area: { laborHoursPerUnit: 0.04, materialCostPerUnit: 5 },
    volume: { laborHoursPerUnit: 0.1, materialCostPerUnit: 6 },
    count: { laborHoursPerUnit: 1.5, materialCostPerUnit: 60 },
  },
  tile: {
    linear: { laborHoursPerUnit: 0.2, materialCostPerUnit: 8 },
    area: { laborHoursPerUnit: 0.12, materialCostPerUnit: 9 },
    volume: { laborHoursPerUnit: 0.2, materialCostPerUnit: 10 },
    count: { laborHoursPerUnit: 2, materialCostPerUnit: 90 },
  },
  painting: {
    linear: { laborHoursPerUnit: 0.04, materialCostPerUnit: 0.9 },
    area: { laborHoursPerUnit: 0.015, materialCostPerUnit: 0.6 },
    volume: { laborHoursPerUnit: 0.05, materialCostPerUnit: 1 },
    count: { laborHoursPerUnit: 1, materialCostPerUnit: 30 },
  },
  specialty: {
    linear: { laborHoursPerUnit: 0.25, materialCostPerUnit: 15 },
    area: { laborHoursPerUnit: 0.06, materialCostPerUnit: 8 },
    volume: { laborHoursPerUnit: 0.2, materialCostPerUnit: 10 },
    count: { laborHoursPerUnit: 2, materialCostPerUnit: 150 },
  },
  /* No identifiable trade: intentionally absent from pricing. See below. */
  unassigned: {
    linear: { laborHoursPerUnit: 0, materialCostPerUnit: 0 },
    area: { laborHoursPerUnit: 0, materialCostPerUnit: 0 },
    volume: { laborHoursPerUnit: 0, materialCostPerUnit: 0 },
    count: { laborHoursPerUnit: 0, materialCostPerUnit: 0 },
  },
};

const LINEAR_UNITS = new Set(["linear_foot", "linear_feet", "lf", "linear_meter", "lm"]);
const AREA_UNITS = new Set(["square_foot", "square_feet", "sf", "sqft", "square", "square_meter", "sm", "square_yard", "sy"]);
const VOLUME_UNITS = new Set(["cubic_foot", "cubic_yard", "cy", "cf", "gallon"]);

/** Which rate column a unit reads from. Unknown units are counted, never dropped. */
export function unitFamily(unitKey: string | null | undefined): FallbackUnitFamily {
  const key = String(unitKey ?? "").trim().toLowerCase();
  if (LINEAR_UNITS.has(key)) return "linear";
  if (AREA_UNITS.has(key)) return "area";
  if (VOLUME_UNITS.has(key)) return "volume";
  return "count";
}

export interface FallbackCandidate {
  description?: string | null;
  tradeKey?: string | null;
  quantity: number;
  unitKey?: string | null;
  laborRate?: number | null;
  /** Permits/fees are direct fees with zero labor; never fallback-priced. */
  costBasis?: string | null;
}

export interface FallbackPricing {
  tradeKey: LaborTradeKey;
  unitFamily: FallbackUnitFamily;
  laborHoursPerUnit: number;
  laborRate: number;
  materialCost: number;
  /** Human-auditable basis string persisted with the line. */
  basis: string;
}

/** Why a recognized line could not even be fallback-priced. */
export type FallbackRefusal = "no-quantity" | "no-trade" | "fee-basis" | null;

const FEE_BASES = new Set(["permit_fee", "fee", "direct_fee"]);

/**
 * Price one recognized-but-uncatalogued line from generic trade rates.
 *
 * Returns `{ pricing: null, refusal }` when the line genuinely cannot be
 * priced. The caller must then mark it UNPRICED / needs review — the one thing
 * it must never do is treat the refusal as $0 of real work.
 */
export function resolveGenericTradeFallback(
  line: FallbackCandidate,
  options: { laborRate?: number | null } = {},
): { pricing: FallbackPricing | null; refusal: FallbackRefusal } {
  const basisKey = String(line.costBasis ?? "").toLowerCase();
  if (FEE_BASES.has(basisKey)) return { pricing: null, refusal: "fee-basis" };

  const qty = Number(line.quantity ?? 0);
  if (!Number.isFinite(qty) || qty <= 0) return { pricing: null, refusal: "no-quantity" };

  /* Assigned trade wins; wording only fills a genuine blank. */
  let trade = normalizeTradeKey(line.tradeKey);
  if (trade === UNASSIGNED_TRADE) {
    trade = inferTradeKey(line.description, null, "low") ?? UNASSIGNED_TRADE;
  }
  if (trade === UNASSIGNED_TRADE) return { pricing: null, refusal: "no-trade" };

  const family = unitFamily(line.unitKey);
  const rate = GENERIC_TRADE_RATES[trade][family];
  const laborRate =
    Number.isFinite(Number(line.laborRate)) && Number(line.laborRate) > 0
      ? Number(line.laborRate)
      : Number.isFinite(Number(options.laborRate)) && Number(options.laborRate) > 0
        ? Number(options.laborRate)
        : FALLBACK_LABOR_RATE;

  return {
    pricing: {
      tradeKey: trade,
      unitFamily: family,
      /* Quarter-hour invariant applies to the per-unit rate's total below too. */
      laborHoursPerUnit: rate.laborHoursPerUnit,
      laborRate,
      materialCost: rate.materialCostPerUnit,
      basis: `generic_trade_fallback:${trade}:${family}`,
    },
    refusal: null,
  };
}

/** Total fallback labor hours for a line, on the 0.25h grid. */
export function fallbackLaborHours(quantity: number, laborHoursPerUnit: number): number {
  return roundQuarterHour(Math.max(0, quantity) * Math.max(0, laborHoursPerUnit));
}
