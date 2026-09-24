/**
 * Module 014D — "Project as Illustrated" estimate.
 *
 * The contractor-facing ballpark model (Low / Expected / High) is untouched.
 * For buyer / realtor facing output we additionally anchor ONE figure to the
 * finish / design package that is actually illustrated in the proposal.
 *
 * This is NOT a second pricing engine: it only places a point inside the
 * authoritative ballpark band that upstream estimating already produced.
 * Signals are deterministic keyword matches over the canonical scope
 * narrative (and any product/finish labels passed in), scored value ->
 * premium. When the signal is too weak to be trusted the figure defaults near
 * Expected and is disclosed as an assumption. A contractor override always
 * wins.
 */
import type { ProposalLocale } from "./types";

export type ProposalFinishLevel = "value" | "standard" | "premium";

export const PROPOSAL_FINISH_LEVELS: ProposalFinishLevel[] = ["value", "standard", "premium"];

export interface ProposalBallparkBand {
  low: number;
  expected: number;
  high: number;
  /**
   * Contractor-selected price position inside the band. When present it is the
   * anchor, so the customer-facing figure follows the contractor's selection.
   */
  selected?: number;
}

export interface ProposalFinishSignalResult {
  /** -1 (value) .. 0 (standard) .. +1 (premium). */
  score: number;
  level: ProposalFinishLevel;
  /** False when the project data does not support a confident read. */
  confident: boolean;
  /** Matched signal keywords, for contractor transparency. */
  matched: string[];
  /** How many distinct premium/upgraded signals were found. */
  premiumMatches: number;
  /** How many distinct value/builder-grade signals were found. */
  valueMatches: number;
}

export interface ProposalAsIllustrated {
  amount: number;
  band: ProposalBallparkBand;
  finishLevel: ProposalFinishLevel;
  /** True when the finish level was assumed rather than detected. */
  assumed: boolean;
  /** True when the contractor set the amount or the finish level by hand. */
  overridden: boolean;
  matchedSignals: string[];
  /**
   * True when the buyer/realtor value-conscious baseline shaped the figure
   * (i.e. the project data did not clearly show upgraded selections).
   */
  valueConsciousDefault: boolean;
}

interface FinishSignal {
  /** -1 value, 0 standard, +1 premium. */
  weight: number;
  patterns: RegExp[];
  label: string;
}

/** Bilingual (EN/ES) finish/material lexicon. Deterministic, no AI. */
const FINISH_SIGNALS: FinishSignal[] = [
  // ---- value / builder grade
  { weight: -1, label: "carpet", patterns: [/\bcarpet(ing)?\b/i, /\balfombra\b/i] },
  { weight: -1, label: "laminate", patterns: [/\blaminate\b/i, /\blaminado\b/i] },
  { weight: -1, label: "vinyl", patterns: [/\bvinyl\b/i, /\bvin[ií]lic[oa]\b/i, /\blvp\b/i] },
  { weight: -1, label: "stock cabinets", patterns: [/\bstock cabinet\w*/i, /\bgabinetes? de línea\b/i, /\bgabinetes? est[aá]ndar\b/i] },
  { weight: -1, label: "builder grade", patterns: [/\bbuilder[- ]grade\b/i, /\bbasic\b/i, /\beconomy\b/i, /\bb[aá]sic[oa]s?\b/i, /\becon[oó]mic[oa]s?\b/i] },
  { weight: -1, label: "laminate counters", patterns: [/\blaminate counter\w*/i, /\bformica\b/i, /\bf[oó]rmica\b/i] },
  { weight: -1, label: "prefinished trim", patterns: [/\bbasic trim\b/i, /\bmoldura b[aá]sica\b/i] },

  // ---- standard / mid grade
  { weight: 0, label: "tile", patterns: [/\btile\b/i, /\bazulejo\b/i, /\bbaldosa\b/i] },
  { weight: 0, label: "quartz", patterns: [/\bquartz\b/i, /\bcuarzo\b/i] },
  { weight: 0, label: "semi-custom cabinets", patterns: [/\bsemi[- ]custom\b/i, /\bsemipersonalizad[oa]s?\b/i] },
  { weight: 0, label: "mid-grade", patterns: [/\bmid[- ]grade\b/i, /\bstandard finish\w*/i, /\bgama media\b/i, /\bacabados? est[aá]ndar\b/i] },
  { weight: 0, label: "paint", patterns: [/\bpaint(ing)?\b/i, /\bpintura\b/i] },

  // ---- premium / high end
  { weight: 1, label: "hardwood", patterns: [/\bhardwood\b/i, /\bmadera dura\b/i, /\bmadera noble\b/i] },
  { weight: 1, label: "custom cabinetry", patterns: [/\bcustom cabinet\w*/i, /\bgabinetes? a medida\b/i, /\bgabinetes? personalizados?\b/i] },
  { weight: 1, label: "crown molding", patterns: [/\bcrown mold\w*/i, /\bmoldura de corona\b/i] },
  { weight: 1, label: "marble", patterns: [/\bmarble\b/i, /\bm[aá]rmol\b/i] },
  { weight: 1, label: "porcelain", patterns: [/\bporcelain\b/i, /\bporcel[aá]nic[oa]\b/i] },
  { weight: 1, label: "premium fixtures", patterns: [/\bhigh[- ]end\b/i, /\bpremium\b/i, /\bluxury\b/i, /\bde lujo\b/i, /\bgama alta\b/i] },
  { weight: 1, label: "designer tile", patterns: [/\bdesigner tile\b/i, /\bazulejo de dise[nñ]o\b/i] },
  { weight: 1, label: "waterfall island", patterns: [/\bwaterfall (edge|island)\b/i, /\bisla en cascada\b/i] },
];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function levelFromScore(score: number): ProposalFinishLevel {
  if (score <= -0.34) return "value";
  if (score >= 0.34) return "premium";
  return "standard";
}

export function scoreFromLevel(level: ProposalFinishLevel): number {
  return level === "value" ? -1 : level === "premium" ? 1 : 0;
}

/**
 * Reads finish/material signals out of the text the project already produced.
 * `extra` accepts product/selection labels when the project has them.
 */
export function detectFinishSignals(
  scopeText: string | null | undefined,
  extra: string[] = [],
): ProposalFinishSignalResult {
  const corpus = [scopeText ?? "", ...extra].join("\n");
  if (!corpus.trim()) {
    return { score: 0, level: "standard", confident: false, matched: [], premiumMatches: 0, valueMatches: 0 };
  }

  const matched: string[] = [];
  let total = 0;
  let weighted = 0;
  let premiumMatches = 0;
  let valueMatches = 0;

  for (const signal of FINISH_SIGNALS) {
    if (!signal.patterns.some((p) => p.test(corpus))) continue;
    matched.push(signal.label);
    total += 1;
    weighted += signal.weight;
    if (signal.weight > 0) premiumMatches += 1;
    if (signal.weight < 0) valueMatches += 1;
  }

  if (total === 0) {
    return { score: 0, level: "standard", confident: false, matched: [], premiumMatches: 0, valueMatches: 0 };
  }

  const score = clamp(weighted / total, -1, 1);
  // Two or more independent signals, or one decisive non-neutral signal set,
  // are required before we claim to know the finish level.
  const confident = total >= 2 && Math.abs(score) >= 0.2;
  return {
    score,
    level: confident ? levelFromScore(score) : "standard",
    confident,
    matched,
    premiumMatches,
    valueMatches,
  };
}

/**
 * Buyer / realtor renderings are intentionally attractive but value-conscious:
 * a nice-looking visualization is NOT evidence of a luxury budget. In that
 * presentation we start from a builder-grade / standard baseline and only let
 * the figure climb when the project data explicitly shows upgraded selections.
 */
export const BUYER_BASELINE_SCORE = -0.5;

/** Two or more distinct premium signals = an explicit upgraded package. */
export function hasExplicitPremiumSelections(detected: ProposalFinishSignalResult): boolean {
  return detected.premiumMatches >= 2;
}

export interface ComputeAsIllustratedArgs {
  band: ProposalBallparkBand | null;
  scopeText?: string | null;
  finishLabels?: string[];
  /** Contractor-chosen finish level. Wins over detection. */
  finishOverride?: ProposalFinishLevel | null;
  /** Contractor-typed amount. Wins over everything (still clamped). */
  amountOverride?: number | null;
  /**
   * "contractor" keeps the neutral Expected-anchored read. "buyer" applies the
   * value-conscious baseline used for buyer / realtor facing proposals.
   */
  presentation?: "contractor" | "buyer";
}

/** Places the As Illustrated figure inside the authoritative ballpark band. */
export function computeAsIllustrated(args: ComputeAsIllustratedArgs): ProposalAsIllustrated | null {
  const band = args.band;
  if (!band) return null;
  const low = Math.min(band.low, band.high);
  const high = Math.max(band.low, band.high);
  const expected = clamp(band.selected ?? band.expected, low, high);

  const detected = detectFinishSignals(args.scopeText, args.finishLabels ?? []);
  const overriddenLevel = args.finishOverride ?? null;
  const buyerFacing = args.presentation === "buyer";
  const explicitPremium = hasExplicitPremiumSelections(detected);

  let score: number;
  let valueConsciousDefault = false;

  if (overriddenLevel) {
    score = scoreFromLevel(overriddenLevel);
  } else if (buyerFacing && !explicitPremium) {
    // Still derived from the detected signals — the baseline only shifts where
    // a neutral / unspecified read lands, and never above Expected.
    score = clamp(BUYER_BASELINE_SCORE + detected.score * 0.5, -1, 0);
    valueConsciousDefault = true;
  } else {
    score = detected.confident ? detected.score : 0;
  }

  const level: ProposalFinishLevel = overriddenLevel ?? levelFromScore(score);

  // -1 -> low, 0 -> expected, +1 -> high (piecewise so Expected stays anchored).
  const derived =
    score <= 0 ? expected + (expected - low) * score : expected + (high - expected) * score;

  const amountOverride =
    typeof args.amountOverride === "number" && Number.isFinite(args.amountOverride) && args.amountOverride > 0
      ? args.amountOverride
      : null;

  const amount = Math.round(clamp(amountOverride ?? derived, low, high));
  const overridden = Boolean(amountOverride || overriddenLevel);
  const assumed = !overridden && (buyerFacing ? !explicitPremium : !detected.confident);

  return {
    amount,
    band: { low: Math.round(low), expected: Math.round(expected), high: Math.round(high) },
    finishLevel: level,
    assumed,
    overridden,
    matchedSignals: detected.matched,
    valueConsciousDefault: valueConsciousDefault && !overridden,
  };
}

/** Bilingual finish-level label for contractor-facing controls. */
export function finishLevelLabel(level: ProposalFinishLevel, locale: ProposalLocale): string {
  const table: Record<ProposalFinishLevel, Record<ProposalLocale, string>> = {
    value: { "en-US": "Value finishes", "es-US": "Acabados económicos" },
    standard: { "en-US": "Standard finishes", "es-US": "Acabados estándar" },
    premium: { "en-US": "Premium finishes", "es-US": "Acabados premium" },
  };
  return table[level][locale];
}
