/**
 * LIVING TRADE-COVERAGE AUDIT.
 *
 * Every recent bad estimate had the same shape: a trade the app *implies* it
 * supports had no lexicon rule, no ontology subject, no catalog assembly, or an
 * allowance calibrated for an interior room. Finding that one project at a time
 * is not sustainable, so coverage is COMPUTED from the real registries and
 * rendered in-app. When someone adds a rule, this table updates itself; when
 * someone adds a trade to the taxonomy with nothing behind it, it shows red.
 *
 * Pure module: no React, no IO, no i18n.
 */

import { WORK_RULES, type WorkRule } from "@/domains/remoteVision/lexicon";
import { ONTOLOGY, subjectForFeatureKey } from "@/domains/remoteVision/ontology";
import { FEATURE_ASSEMBLY_MAP } from "@/domains/remoteVision/featureAssembly";
import { SAMPLE_PRICEBOOK } from "@/domains/ballpark/pricebook";
import { ballparkAllowanceFor } from "@/domains/remoteVision/ballparkAllowance";
import { tradeKeyFor } from "@/domains/remoteVision/canonicalPricing";
import { unitFamily } from "@/domains/estimating/genericTradeFallback";
import { LABOR_TRADES, type LaborTradeKey } from "@/domains/estimating/tradeTaxonomy";

export type AllowanceScaleVerdict =
  /** Sized off the building envelope — correct for exterior/whole-structure work. */
  | "whole_structure"
  /** A documented interior/room-scale allowance, correct for interior work. */
  | "room_scale"
  /** Sized as one outdoor structure (deck, fence, flatwork, one yard). */
  | "site_structure"
  /** Counted work: an allowance would be a guess, so there is none by design. */
  | "not_applicable"
  /** Measured work with no allowance at all — silently unpriced in ballpark. */
  | "missing";

export interface FeatureCoverage {
  featureKey: string;
  label: string;
  tradeKey: LaborTradeKey | string;
  unitKey: string | null;
  /** A lexicon rule exists, so the words can be recognized at all. */
  recognized: boolean;
  /** An ontology subject exists, so the admission gate can reason about it. */
  hasOntologySubject: boolean;
  /** Mapped to a catalog assembly that really exists. */
  priced: boolean;
  allowanceQuantity: number | null;
  allowanceScale: AllowanceScaleVerdict;
  notes: string[];
}

export interface TradeCoverage {
  tradeKey: LaborTradeKey;
  features: FeatureCoverage[];
  recognized: boolean;
  priced: boolean;
  allowanceRealistic: boolean;
  notes: string[];
}

/** Trades that describe envelope / site work, where scale must be building-wide. */
const EXTERIOR_TRADES: readonly string[] = ["roofing", "exterior", "sitework_concrete"];

/**
 * Outdoor work that is one STRUCTURE rather than a building envelope: a deck,
 * a fence run, a driveway apron. These correctly use their own site-scale
 * allowance instead of a roof/siding envelope number.
 */
const SITE_STRUCTURE_FEATURE = /^(deck|fence|concrete)\./;

/** Taxonomy entries that are bookkeeping, not sellable trades. */
const NON_TRADE_KEYS: readonly string[] = ["unassigned"];

function assemblyExists(featureKey: string): boolean {
  const key = FEATURE_ASSEMBLY_MAP[featureKey];
  if (!key) return false;
  return Boolean(SAMPLE_PRICEBOOK.get(key));
}

function coverageForRule(rule: WorkRule): FeatureCoverage {
  const notes: string[] = [];
  const tradeKey = tradeKeyFor(rule.featureKey);
  const hasSubject = Boolean(subjectForFeatureKey(rule.featureKey));
  const priced = assemblyExists(rule.featureKey);
  const family = unitFamily(rule.unitKey);

  const allowance = ballparkAllowanceFor(rule.featureKey, rule.unitKey, {
    label: rule.label["en-US"],
  });

  let allowanceScale: AllowanceScaleVerdict;
  if (family === "count") {
    allowanceScale = "not_applicable";
    notes.push("Counted work: quantity must be stated, never assumed.");
  } else if (!allowance) {
    allowanceScale = "missing";
    notes.push("No ballpark allowance: unmeasured work will stay unpriced.");
  } else if (allowance.basisKey === "whole_structure") {
    allowanceScale = "whole_structure";
  } else if (SITE_STRUCTURE_FEATURE.test(rule.featureKey)) {
    allowanceScale = "site_structure";
  } else {
    allowanceScale = "room_scale";
    if (EXTERIOR_TRADES.includes(tradeKey)) {
      notes.push("Exterior trade priced from a room-scale allowance — review scale.");
    }
  }

  if (!hasSubject) notes.push("No ontology subject: the admission gate cannot reason about it.");
  if (!priced) notes.push("No catalog assembly: recognized work cannot be priced.");

  return {
    featureKey: rule.featureKey,
    label: rule.label["en-US"],
    tradeKey,
    unitKey: rule.unitKey,
    recognized: true,
    hasOntologySubject: hasSubject,
    priced,
    allowanceQuantity: allowance?.quantity ?? null,
    allowanceScale,
    notes,
  };
}

/** Coverage for every feature the intake lexicon can recognize. */
export function featureCoverage(): FeatureCoverage[] {
  return WORK_RULES.map(coverageForRule).sort((a, b) =>
    `${a.tradeKey}${a.featureKey}`.localeCompare(`${b.tradeKey}${b.featureKey}`),
  );
}

/**
 * Coverage per TRADE the app claims to estimate. A trade in the taxonomy with
 * no recognizable feature is exactly the landscaping failure mode, surfaced
 * before a contractor finds it on a live job.
 */
export function tradeCoverage(): TradeCoverage[] {
  const features = featureCoverage();
  return LABOR_TRADES.filter((t) => !NON_TRADE_KEYS.includes(t)).map((tradeKey) => {
    const mine = features.filter((f) => f.tradeKey === tradeKey);
    const notes: string[] = [];
    if (mine.length === 0) {
      notes.push("Listed as a supported trade but nothing recognizes its work.");
    }
    /* An ontology subject can exist for a trade even with no lexicon rule. */
    const subjectsOnly = ONTOLOGY.filter(
      (s) => s.tradeKey === tradeKey && !mine.some((f) => f.featureKey === s.featureKey),
    );
    if (mine.length === 0 && subjectsOnly.length > 0) {
      notes.push("Ontology knows the subject, but no lexicon rule can hear it in speech.");
    }
    const allowanceRealistic =
      mine.length > 0 &&
      mine.every(
        (f) =>
          f.allowanceScale === "not_applicable" ||
          f.allowanceScale === "site_structure" ||
          (EXTERIOR_TRADES.includes(tradeKey)
            ? f.allowanceScale === "whole_structure"
            : f.allowanceScale === "room_scale"),
      );
    if (mine.some((f) => f.allowanceScale === "missing")) {
      notes.push("At least one feature has no allowance and will not price in ballpark mode.");
    }
    return {
      tradeKey,
      features: mine,
      recognized: mine.length > 0,
      priced: mine.length > 0 && mine.every((f) => f.priced),
      allowanceRealistic,
      notes,
    };
  });
}

/** Trades that are UI-visible / implied-supported but have no real backing. */
export function unbackedTrades(): TradeCoverage[] {
  return tradeCoverage().filter((t) => !t.recognized || !t.priced);
}
