/**
 * Scope-aware ballpark questioning — compatibility surface.
 *
 * The knowledge that used to live here (domain patterns, question/measurement
 * applicability) now lives in the generic, stateless `@/domains/workScope`
 * library, and the per-project derivation lives in its `context` builder.
 * This module re-exports that behaviour so existing estimating surfaces keep
 * working while pointing at ONE canonical source.
 *
 * Legacy fallbacks deliberately REMOVED (they are how garage questions reached
 * a cabinet job):
 *   - unknown question id => "relevant"      (now: not relevant)
 *   - no scope signals    => full base schema (now: no questions)
 *   - no scope signals    => every measurement field (now: none)
 */

import { QUICK_BALLPARK_SCHEMA } from "./questions";
import type { BallparkInterviewSchema, BallparkQuestion } from "./types";
import {
  buildCurrentProjectScopeContext,
  SCOPE_CLARIFIER_QUESTION,
  catalogQuestionsForDomains,
  classifyWorkDomains,
  corroboratedDomains,
  deriveWorkDomains,
  isFactKnown,
  isQuestionRelevant,
  measurementFieldsForDomains,
  normalizeSignalText,
  signalsFromNarrative,
  toBallparkQuestion,
  type MeasurementFieldId,
  type ScopeSignal,
  type WorkDomain,
} from "@/domains/workScope";


export {
  deriveWorkDomains,
  isFactKnown,
  isQuestionRelevant,
  measurementFieldsForDomains,
  signalsFromNarrative,
};
export { ALL_MEASUREMENT_FIELDS, MEASUREMENT_RULES } from "@/domains/workScope";
export type { MeasurementFieldId, ScopeSignal, WorkDomain };

/** Ids whose value is already known from intake, replay or measurements. */
export type KnownFacts = Record<string, unknown>;

/** Domains for which room geometry is a genuine pricing input. */
export const GEOMETRY_DOMAINS: WorkDomain[] = [
  "room_conversion",
  "flooring",
  "insulation",
];

function schemaQuestionSignature(questions: readonly BallparkQuestion[]): string {
  const text = questions.map((question) => question.id).join("|");
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Filter a schema down to the questions the scope justifies, then append the
 * domain-specific questions the base schema never contained (planting,
 * structure, built-ins, bath…).
 *
 * `scopeText` is the CURRENT project's stated evidence. Surface-level rules
 * (ceiling vs wall insulation, doors vs windows, pipe vs fascia) need it, so
 * callers that have signals must pass it through.
 */
export function scopeAwareSchema(
  base: BallparkInterviewSchema = QUICK_BALLPARK_SCHEMA,
  domains: WorkDomain[] = [],
  scopeText = "",
): BallparkInterviewSchema {
  const kept: BallparkQuestion[] = base.questions.filter((question) =>
    isQuestionRelevant(question.id, domains, scopeText),
  );
  const keptIds = new Set(kept.map((q) => q.id));
  const extra = catalogQuestionsForDomains(domains, scopeText)
    .filter((def) => !keptIds.has(def.id))
    .map(toBallparkQuestion);
  const questions = [...kept, ...extra];
  /* Unclassifiable work asks one broad clarifier, never another trade's template. */
  if (questions.length === 0 && domains.length === 0) {
    return { ...base, key: `${base.key}.clarifier`, questions: [SCOPE_CLARIFIER_QUESTION] };
  }
  if (questions.length === base.questions.length && extra.length === 0) return base;
  return { ...base, key: `${base.key}.scoped.${schemaQuestionSignature(questions)}`, questions };
}

/** Stated (non-observed) evidence text — observations never justify a question. */
function scopeTextFromSignals(signals: ScopeSignal[]): string {
  return signals
    .filter((signal) => signal.source !== "visual_observation")
    .map(normalizeSignalText)
    .join(" ");
}

/** One call: scope signals → the interview schema this project deserves. */
export function schemaForScope(
  signals: ScopeSignal[],
  base: BallparkInterviewSchema = QUICK_BALLPARK_SCHEMA,
): BallparkInterviewSchema {
  return scopeAwareSchema(
    base,
    corroboratedDomains(classifyWorkDomains(signals)),
    scopeTextFromSignals(signals),
  );
}


/** The questions worth asking: in scope AND not already known. */
export function unresolvedQuestions(
  schema: BallparkInterviewSchema,
  answers: KnownFacts,
  known?: KnownFacts | null,
): BallparkQuestion[] {
  return schema.questions.filter(
    (question) => !isFactKnown(answers, question.id) && !isFactKnown(known, question.id),
  );
}

/** One call: scope signals -> the measurement fields worth asking for. */
export function measurementFieldsForScope(signals: ScopeSignal[]): MeasurementFieldId[] {
  return measurementFieldsForDomains(deriveWorkDomains(signals), scopeTextFromSignals(signals));
}


/** Full current-project context (preferred entry point for new surfaces). */
export { buildCurrentProjectScopeContext, SCOPE_CLARIFIER_QUESTION };
