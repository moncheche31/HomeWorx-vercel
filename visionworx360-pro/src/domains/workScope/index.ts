/**
 * Current-job intelligence layer.
 *
 * `taxonomy` + `catalog` are GENERIC KNOWLEDGE (stateless, reusable).
 * `context` is PROJECT STATE derivation (pure function of current evidence).
 * Nothing in this domain writes to storage or remembers a previous project.
 */

export {
  ALL_WORK_DOMAINS,
  DOMAIN_PATTERNS,
  TRADE_DOMAIN,
  classifyWorkDomains,
  corroboratedDomains,
  deriveWorkDomains,
  isObservationSource,
  normalizeSignalText,
  type DomainEvidence,
  type ScopeEvidenceSource,
  type ScopeSignal,
  type WorkDomain,
} from "./taxonomy";

export {
  ALL_MEASUREMENT_FIELDS,
  BASE_QUESTION_RULES,
  MEASUREMENT_RULES,
  WORK_QUESTION_CATALOG,
  catalogQuestionsForDomains,
  isQuestionRelevant,
  measurementFieldsForDomains,
  questionRule,
  toBallparkQuestion,
  type ApplicabilityRule,
  type EstimatingLever,
  type MeasurementFieldId,
  type WorkQuestionDef,
} from "./catalog";

export {
  buildCurrentProjectScopeContext,
  SCOPE_CLARIFIER_QUESTION,
  isFactKnown,
  schemaFromContext,
  signalsFromNarrative,
  type CurrentProjectScopeContext,
  type KnownQuantity,
  type MeasurementProvenance,
  type ProjectEvidence,
  type QuestionProvenance,
  type ScopeItemEvidence,
} from "./context";

export {
  UNIVERSAL_KEYS,
  guardAssumptions,
  guardMeasurementFields,
  guardPricedItems,
  guardQuestions,
  isUniversal,
  reportRejections,
  traceToScope,
  type GuardRejection,
  type GuardResult,
} from "./guard";
