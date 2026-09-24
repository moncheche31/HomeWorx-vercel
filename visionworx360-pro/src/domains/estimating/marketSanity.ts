/**
 * MARKET SANITY DIAGNOSTIC — advisory only, never a price setter.
 *
 * After the canonical estimate is generated we compare it against broad public
 * benchmark metadata for the project class ($/SF and total). The result is a
 * FLAG plus the top cost drivers, so a contractor can see "this is unusually
 * high — check these five lines" without the app ever bending the price toward
 * a market average. Legitimate high-end and custom work must survive untouched.
 *
 * Benchmarks are broad 2026 national reference ranges compiled from public
 * remodeling cost aggregators. They are metadata, not pricing authority.
 *
 * Pure module: no React, no Supabase, no i18n, no IO.
 */

import { roundMoney as money } from "./money";
import type { CanonicalCostDriver } from "./canonicalCostGraph";

export type ProjectClass =
  | "garage_conversion"
  | "bathroom_remodel"
  | "kitchen_remodel"
  | "basement_finish"
  | "addition"
  | "whole_house_remodel"
  | "general_remodel";

export interface MarketBenchmark {
  projectClass: ProjectClass;
  /** Broad selling-price-per-finished-SF reference range. */
  lowPerSf: number;
  highPerSf: number;
  /** Broad total project reference range, used when area is unknown. */
  lowTotal: number;
  highTotal: number;
  source: string;
}

export const MARKET_BENCHMARKS_2026: Record<ProjectClass, MarketBenchmark> = {
  garage_conversion: { projectClass: "garage_conversion", lowPerSf: 80, highPerSf: 200, lowTotal: 15000, highTotal: 60000, source: "2026 national remodeling aggregates" },
  bathroom_remodel: { projectClass: "bathroom_remodel", lowPerSf: 250, highPerSf: 800, lowTotal: 12000, highTotal: 45000, source: "2026 national remodeling aggregates" },
  kitchen_remodel: { projectClass: "kitchen_remodel", lowPerSf: 150, highPerSf: 600, lowTotal: 20000, highTotal: 90000, source: "2026 national remodeling aggregates" },
  basement_finish: { projectClass: "basement_finish", lowPerSf: 50, highPerSf: 150, lowTotal: 20000, highTotal: 80000, source: "2026 national remodeling aggregates" },
  addition: { projectClass: "addition", lowPerSf: 200, highPerSf: 500, lowTotal: 50000, highTotal: 300000, source: "2026 national remodeling aggregates" },
  whole_house_remodel: { projectClass: "whole_house_remodel", lowPerSf: 100, highPerSf: 350, lowTotal: 60000, highTotal: 400000, source: "2026 national remodeling aggregates" },
  general_remodel: { projectClass: "general_remodel", lowPerSf: 80, highPerSf: 400, lowTotal: 5000, highTotal: 250000, source: "2026 national remodeling aggregates" },
};

/** Only a materially extreme value is worth a contractor's attention. */
export const HIGH_FLAG_FACTOR = 1.5;
export const LOW_FLAG_FACTOR = 0.5;

export type MarketSanityVerdict = "within" | "unusually_high" | "unusually_low" | "unknown";

export interface MarketSanityResult {
  verdict: MarketSanityVerdict;
  projectClass: ProjectClass | null;
  finishedAreaSf: number | null;
  sellingPrice: number;
  pricePerSf: number | null;
  benchmark: MarketBenchmark | null;
  /** The comparison basis actually used. */
  basis: "per_sf" | "total" | "none";
  /** Ratio against the relevant benchmark bound, for display. */
  ratio: number | null;
  /** i18n key suffix; null when nothing to say. */
  messageKey: "sanityHigh" | "sanityLow" | null;
  /** Top direct-cost drivers to review. Never modified by this diagnostic. */
  topDrivers: CanonicalCostDriver[];
}

const round2 = (v: number) => Math.round((Number.isFinite(v) ? v : 0) * 100) / 100;

/** Best-effort project class from free text. Unknown is a valid answer. */
export function classifyProject(text: string | null | undefined): ProjectClass | null {
  const t = String(text ?? "").toLowerCase();
  if (!t.trim()) return null;
  if (t.includes("garage") && (t.includes("convert") || t.includes("conversion") || t.includes("adu"))) return "garage_conversion";
  if (t.includes("whole house") || t.includes("whole-house")) return "whole_house_remodel";
  if (t.includes("addition")) return "addition";
  if (t.includes("basement")) return "basement_finish";
  if (t.includes("kitchen")) return "kitchen_remodel";
  if (t.includes("bath")) return "bathroom_remodel";
  return null;
}

/**
 * Compare a canonical selling price with broad market metadata.
 *
 * NEVER alters the price. Returns `within` whenever the estimate is inside the
 * generous flagging window, and `unknown` when there is nothing to compare to.
 */
export function evaluateMarketSanity(input: {
  projectClass: ProjectClass | null;
  finishedAreaSf: number | null;
  sellingPrice: number;
  drivers?: readonly CanonicalCostDriver[];
}): MarketSanityResult {
  const drivers = (input.drivers ?? []).slice(0, 5);
  const sellingPrice = money(input.sellingPrice);
  const cls = input.projectClass;
  const benchmark = cls ? MARKET_BENCHMARKS_2026[cls] : null;
  const area = input.finishedAreaSf != null && input.finishedAreaSf > 0 ? round2(input.finishedAreaSf) : null;
  const pricePerSf = area ? round2(sellingPrice / area) : null;

  const base = {
    projectClass: cls,
    finishedAreaSf: area,
    sellingPrice,
    pricePerSf,
    benchmark,
    topDrivers: drivers,
  };

  if (!benchmark || sellingPrice <= 0) {
    return { ...base, verdict: "unknown", basis: "none", ratio: null, messageKey: null };
  }

  const basis: "per_sf" | "total" = pricePerSf != null ? "per_sf" : "total";
  const value = basis === "per_sf" ? (pricePerSf as number) : sellingPrice;
  const low = basis === "per_sf" ? benchmark.lowPerSf : benchmark.lowTotal;
  const high = basis === "per_sf" ? benchmark.highPerSf : benchmark.highTotal;

  if (value > high * HIGH_FLAG_FACTOR) {
    return { ...base, verdict: "unusually_high", basis, ratio: round2(value / high), messageKey: "sanityHigh" };
  }
  if (value < low * LOW_FLAG_FACTOR) {
    return { ...base, verdict: "unusually_low", basis, ratio: round2(value / low), messageKey: "sanityLow" };
  }
  return { ...base, verdict: "within", basis, ratio: round2(value / high), messageKey: null };
}
