/**
 * MERGING THE ESTIMATOR'S READING INTO THE DETERMINISTIC SCOPE.
 *
 * The lexicon matches words; the estimator pass reads intent. This module joins
 * the two under the project's standing authority order, and it is deliberately
 * pure so the rules are testable without a model call.
 *
 * Invariants enforced here:
 *  1. The deterministic recognizer OWNS anything it already recognized. The
 *     estimator may only fill a gap it left — never overwrite a recognized item.
 *  2. Only work the contractor actually STATED can become priced scope.
 *     Prerequisites the estimator would carry, and anything seen only in media,
 *     come back as suggestions with a question attached (never priced).
 *  3. A quantity is adopted only when the contractor stated it, or it follows
 *     from dimensions he stated. Everything else stays null and takes the normal
 *     ballpark-allowance / Needs Review path.
 *  4. Nothing here prices anything. Units bind to catalog rules or not at all.
 */

import type { GroundingCandidate } from "@/domains/scopeGrounding";
import type { ScopeObservation } from "@/domains/scopeGrounding/types";
import type {
  EstimatorItem,
  EstimatorReading,
} from "@/features/estimating/services/narrationEstimator.shared";
import { WORK_RULES, localized, workRuleFor, type WorkRule } from "./lexicon";
import { matchSubject } from "./ontology";
import type { RemoteVisionLocale } from "./types";

export interface EstimatorMergeInput {
  reading: EstimatorReading | null;
  /** Candidates the deterministic pass admitted. */
  candidates: GroundingCandidate[];
  locale: RemoteVisionLocale;
}

export interface EstimatorMergeResult {
  candidates: GroundingCandidate[];
  /** Suggestions requiring contractor approval before they can be priced. */
  suggestions: ScopeObservation[];
}

function searchText(item: EstimatorItem): string {
  return [item.work_description, item.spoken_phrase, ...item.subject_terms].join(". ");
}

/** Bind the estimator's item to a catalog rule, or return null (never guess). */
export function resolveEstimatorRule(item: EstimatorItem): WorkRule | null {
  const text = searchText(item);
  const direct = WORK_RULES.find((rule) => rule.match.test(text));
  if (direct) return direct;
  const subject = matchSubject(text);
  if (subject?.featureKey) return workRuleFor(subject.featureKey) ?? null;
  return null;
}

function statedQuantity(item: EstimatorItem): number | null {
  if (item.quantity === null || item.quantity <= 0) return null;
  return item.quantity_basis === "unknown" ? null : item.quantity;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 60);
}

function suggestion(item: EstimatorItem, reasonPrefix: string): ScopeObservation {
  return {
    id: `observation:estimator:${slug(item.work_description || item.spoken_phrase)}`,
    label: item.spoken_phrase || item.work_description,
    reason: `${reasonPrefix} ${item.reason}`,
    evidence: item.spoken_phrase || null,
    question: `Include ${item.work_description} in this scope?`,
  };
}

export function mergeEstimatorReading(input: EstimatorMergeInput): EstimatorMergeResult {
  const { reading, locale } = input;
  const candidates = input.candidates.map((c) => ({ ...c }));
  const suggestions: ScopeObservation[] = [];
  if (!reading) return { candidates, suggestions };

  const byKey = new Map(candidates.map((c) => [c.featureKey, c]));

  for (const item of reading.items) {
    /* Implied prerequisites and media-only findings are ALWAYS approval-gated:
       an estimator's judgment about unstated work is a proposal, not scope. */
    if (item.origin !== "stated") {
      const prefix =
        item.origin === "implied_prerequisite"
          ? "Prerequisite work this scope implies, not stated by the contractor:"
          : "Seen in the project media, not stated by the contractor:";
      suggestions.push(suggestion(item, prefix));
      continue;
    }

    const rule = resolveEstimatorRule(item);
    if (!rule) {
      /* Stated work no assembly covers must never vanish — it is surfaced so it
         gets priced by hand instead of being silently dropped. */
      suggestions.push(
        suggestion(item, "Stated work that matches no catalog assembly, so it needs manual pricing:"),
      );
      continue;
    }

    const stated = statedQuantity(item);
    const existing = byKey.get(rule.featureKey);
    if (existing) {
      /* Rule 1: never overwrite the deterministic reading. Only supply a stated
         quantity it did not find. */
      if (!existing.quantityIsStated && stated !== null) {
        existing.defaultQuantity = stated;
        existing.quantityIsStated = true;
      }
      continue;
    }

    const candidate: GroundingCandidate = {
      featureKey: rule.featureKey,
      label: localized(rule.label, locale),
      sentence: item.spoken_phrase || item.work_description,
      defaultQuantity: stated ?? rule.quantity,
      quantityIsStated: stated !== null,
      unitKey: rule.unitKey,
      quantityBasis: rule.quantityBasis ?? "measured",
      source: "description",
    };
    candidates.push(candidate);
    byKey.set(rule.featureKey, candidate);
  }

  return { candidates, suggestions };
}
