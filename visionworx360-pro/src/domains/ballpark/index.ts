/** Public surface of the Voice-First Ballpark Interview domain. */

export * from "./types";
export { GARAGE_CONVERSION_SCHEMA, QUICK_BALLPARK_SCHEMA, isQuestionVisible, visibleQuestions } from "./questions";
export {
  normalizeSpeech,
  wordsToNumbers,
  parseFeet,
  parseCount,
  parseDimensionPair,
  isUnknownSpeech,
  matchOption,
  parseAnswer,
  type ParsedSpeechAnswer,
} from "./parse";
export {
  deriveBallpark,
  PARTITION_ALLOWANCE_FACTOR,
  BATHROOM_ALLOWANCE,
  CLOSET_ALLOWANCE,
  OPENING_ASSUMPTION,
  UNKNOWN_WIDEN_PCT,
} from "./derive";
export {
  SAMPLE_PRICEBOOK,
  SAMPLE_LABOR_RATE,
  withLaborRate,
  withFinishTier,
  normalizeFinishTier,
  isTierSensitive,
  TIER_MATERIAL_FACTOR,
  type FinishTier,
} from "./pricebook";

export {
  buildBallpark,
  buildBallparkLines,
  unknownWidenPct,
  confidenceFor,
  MAX_UNKNOWN_WIDEN_PCT,
  FINISH_FACTOR,
  type BallparkRangeOptions,
} from "./range";
export {
  applySmallJobEconomics,
  serviceCallMinimum,
  SMALL_JOB_THRESHOLD,
  MOBILIZATION_FEE,
  SETUP_CLEANUP_HOURS,
  MINIMUM_LABOR_HOURS,
  type SmallJobAdjustment,
  type SmallJobResult,
} from "./smallJob";
export {
  deriveWorkDomains,
  scopeAwareSchema,
  schemaForScope,
  isQuestionRelevant,
  isFactKnown,
  signalsFromNarrative,
  unresolvedQuestions,
  GEOMETRY_DOMAINS,
  measurementFieldsForDomains,
  measurementFieldsForScope,
  MEASUREMENT_RULES,

  ALL_MEASUREMENT_FIELDS,
  type MeasurementFieldId,
  type WorkDomain,
  type ScopeSignal,
  type KnownFacts,
} from "./scopeProfile";

export {
  mergeMeasuredGeometry,
  ballparkAnswersFromGeometry,
  controlledGeometryPatch,
} from "./continuity";
export {
  reconcileAnswerIntegrity,
  isContractorStated,
  type AnswerIntegrityConflict,
} from "./answerIntegrity";


/* --- Multi-Input Ballpark (shared intake architecture) ------------- */
export {
  BALLPARK_INTAKE_SOURCES,
  isIntakeSource,
  SIZE_CLASS_FOOTPRINT,
  ROOM_TYPE_FOOTPRINT,
  footprintFor,
  PHOTO_OBSERVATION_PROMPTS,
  OBSERVATION_PREFIX,
  observationsFromAnswers,
  RISK_RULES,
  risksFor,
  mapIntakeAnswers,
  HIGH_VALUE_INPUTS,
  completenessPct,
  type BallparkIntakeSource,
  type BallparkFactCategory,
  type BallparkImpact,
  type BallparkInputRecord,
  type BallparkInputLedger,
  type BallparkRisk,
  type BallparkRecordProvenance,
  type BallparkSizeClass,
  type BallparkPhotoObservation,
} from "./intake";
export {
  PHOTO_BALLPARK_SCHEMA,
  DESCRIPTION_BALLPARK_SCHEMA,
  PHOTO_OBSERVATION_QUESTIONS,
  ROOM_TYPE_OPTIONS,
  SIZE_CLASS_OPTIONS,
  SCOPE_TYPE_OPTIONS,
  FINISH_LEVEL_OPTIONS,
  schemaForSource,
} from "./intakeSchemas";
export {
  PRELIMINARY_DISCLAIMER_TEMPLATE,
  RENDERING_DISCLAIMER_TEMPLATE,
  disclaimersFor,
  type BallparkDisclaimerTemplate,
} from "./disclaimer";
export {
  buildMultiInputBallpark,
  buildLedger,
  multiInputConfidence,
  SOURCE_WIDEN_PCT,
  ASSUMED_FOOTPRINT_WIDEN_PCT,
  INFERRED_FOOTPRINT_WIDEN_PCT,
  MAX_TOTAL_WIDEN_PCT,
  MAX_CONFIDENCE,
  type MultiInputBallparkInput,
  type MultiInputBallparkResult,
} from "./multiInput";
export {
  emptyHistory,
  refineWithAnswers,
  refineWithMeasurements,
  recordRefinement,
  MAX_HISTORY_EVENTS,
  type BallparkHistory,
  type BallparkRefinementEvent,
  type BallparkRefinementKind,
} from "./refinement";
export * from "./persistence";

/* --- Photo scale inference (analysis layer, separate from pricing) -- */
export {
  SCALE_REFERENCES,
  ROOM_TYPE_REFERENCE_HINTS,
  scaleReferenceFor,
  scaleReferencesForAxis,
  suggestedReferences,
  suggestedReferencesForAxis,
  type ScaleReference,
  type ScaleReferenceCategory,
  type ScaleAxis,
} from "./scaleReferences";

export {
  MEASUREMENT_SOURCE_TYPES,
  SOURCE_TYPE_RANK,
  SCALE_TARGETS,
  SCALE_TARGET_LABELS,
  TARGET_AXIS,
  PHOTO_KINDS,
  isPhotoKind,
  supportsObjectScale,
  MAX_INFERRED_CONFIDENCE,
  MIN_INFERRED_CONFIDENCE,
  ALLOWANCE_SPREAD_PCT,
  CROSS_AXIS_SPREAD_MULTIPLIER,
  PLAUSIBLE_RANGE,
  MIN_HABITABLE_FLOOR_AREA_SF,
  LARGE_ROOM_TYPES,
  DEFAULT_CEILING_FT,
  SUMMARY_MEASUREMENT_ORDER,
  candidateFor,
  cabinetsConfirmed,
  backsplashSupported,
  inferMeasurements,
  confirmMeasurement,
  adjustMeasurement,
  measurementsToAnswers,
  summaryMeasurements,
  sizeClassFromArea,
  type MeasurementSourceType,
  type MeasurementUnit,
  type MeasurementEstimate,
  type PhotoScaleObservation,
  type PhotoComponentCount,
  type PhotoInferenceInput,
  type PhotoInferenceResult,
  type PhotoKind,
  type InferenceEvidence,
  type InferenceWarning,
  type RejectedObservation,
  type ScaleTarget,
} from "./photoInference";
export {
  HAS_VISION_PROVIDER,
  HIGH_VALUE_CLARIFICATIONS,
  MAX_CLARIFICATIONS,
  ANALYSIS_SOURCE_TYPES,
  analyzePhotoPackage,
  clarificationsFor,
  scopeCategoriesFor,
  type AnalyzedPhoto,
  type AnalysisNote,
  type AnalysisSourceType,
  type AnalysisUnit,
  type ConditionStatus,
  type PhotoAnalysis,
  type PhotoAnalysisFact,
  type VisionProvider,
} from "./photoAnalysis";


/* --- Ballpark quantity resolution (geometry + allowances, no takeoff) --- */
export {
  geometryFactsFrom,
  geometryFactsFromSnapshot,
  hasUsableGeometry,
  resolveBallparkScope,
  consolidate,
  planForTitle,
  countFromText,
  BALLPARK_ALLOWANCES,
  EMPTY_GEOMETRY_FACTS,
  type BallparkGeometryFacts,
  type BallparkQuantitySource,
  type ResolvedPricePart,
  type ResolvedScopeSubject,
  type UnresolvedScopeSubject,
} from "./quantityResolution";
export {
  recalculateBallparkFromScope,
  type BallparkScopeAssumption,
  type ScopeBallparkResult,
  type ScopeBallparkOptions,
  type RecalcScopeItem,
  type UnpriceableScopeItem,
} from "./scopeRecalc";
export {
  evaluateBandPlausibility,
  constrainBand,
  finalizeBallparkBand,
  spreadWindow,
  baseRelSpread,
  evidenceCompleteness,
  MAX_REL_SPREAD,
  MIN_REL_SPREAD,
  MIN_ABS_SPREAD,
  type BallparkEvidence,
  type BallparkBand,
  type SpreadWindow,
  type PlausibilityReport,
} from "./plausibility";
export {
  planBallparkQuestions,
  questionImpactPct,
  isDetailedOnlyQuestion,
  TOPIC_IMPACT_PCT,
  MIN_QUESTION_IMPACT_PCT,
  type BallparkQuestionCandidate,
  type BallparkQuestionTopic,
  type PrioritizedQuestion,
  type QuestionPlan,
} from "./questionPriority";
export {
  selectImproveAccuracyQuestions,
  improveAccuracyQuestionIds,
  improveAccuracySelectionAnswers,
} from "./improveAccuracy";
export {
  BALLPARK_ENGINE_VERSION,
  ballparkSnapshotVersion,
  isBallparkSnapshotStale,
} from "./engineVersion";
export {
  currentBallparkBand,
  resolveBallparkBaseline,
  resolvePreviewBand,
  type BallparkBandLike,
  type BallparkBaselineInput,
  type PreviewBandResult,
} from "./previewBaseline";


