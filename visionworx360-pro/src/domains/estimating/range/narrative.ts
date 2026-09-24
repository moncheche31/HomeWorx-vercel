/**
 * V1 Estimate Range Engine — customer-facing narrative.
 *
 * Deterministic, bilingual, no estimating jargon. The narrative is the primary
 * result the contractor reviews; the grid is secondary.
 */

import type { EstimateRangeResult, RangeLocale, RangeTier } from "./types";

const TIER_WORD: Record<RangeLocale, Record<RangeTier, string>> = {
  "en-US": { good: "value", better: "midrange", best: "premium" },
  "es-US": { good: "económicos", better: "intermedios", best: "premium" },
};

function money(value: number, locale: RangeLocale, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export interface RangeNarrativeOptions {
  locale: RangeLocale;
  projectName?: string | null;
}

/** One plain-language sentence stating the preliminary investment range. */
export function buildRangeNarrative(
  range: EstimateRangeResult,
  options: RangeNarrativeOptions,
): string {
  const { locale } = options;
  if (range.isEmpty) {
    return locale === "es-US"
      ? "Aún no hay alcance suficiente para calcular un rango preliminar."
      : "There is not enough scope yet to calculate a preliminary range.";
  }

  const low = money(range.selected.low, locale, range.currency);
  const high = money(range.selected.high, locale, range.currency);
  const finish = TIER_WORD[locale][range.selected.tier];

  return locale === "es-US"
    ? `Según el alcance actual y supuestos de acabados ${finish}, la inversión estimada es de ${low} a ${high}.`
    : `Based on the current scope and ${finish} finish assumptions, the estimated investment is ${low}–${high}.`;
}

/** Short per-section lines for the review screen. */
export function buildSectionNarrative(
  range: EstimateRangeResult,
  options: RangeNarrativeOptions,
): string[] {
  return range.selected.sections.map((s) => {
    const low = money(s.low, options.locale, range.currency);
    const high = money(s.high, options.locale, range.currency);
    return `${s.label}: ${low}–${high}`;
  });
}
