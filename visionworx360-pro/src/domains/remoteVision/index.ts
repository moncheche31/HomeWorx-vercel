export * from "./types";
export * from "./lexicon";
export {
  EMPTY_CONTEXT,
  emptyDimensions,
  hasDimensionValues,
  floorAreaSqft,
  dimensionsText,
  mergeIntakeText,
  buildInputLedger,
  buildMeasurementFacts,
  type RemoteVisionInputKind,
  type RemoteVisionInputRecord,
  type RemoteVisionFact,
} from "./context";
export {
  VIDEO_MIME_TYPES,
  MAX_VIDEO_BYTES,
  MAX_VIDEO_SECONDS,
  KEYFRAME_TARGET,
  keyframeTimestamps,
  isSupportedVideoType,
  validateVideoFile,
  type VideoValidationError,
} from "./videoIntake";
export { analyzeDescription, collectFeatures, excludeFeatures, mediaConfidenceBoost } from "./analyze";
export { buildAssumptions, TOPIC_SPECS, OPTION_WEIGHTS } from "./assumptions";
export { buildScenarios, ESTIMATE_LEVELS } from "./scenarios";
export { applyQuantityAnswers, buildQuestions, KNOWN_FEATURE_KEYS } from "./questions";
export { buildRemoteNarrative } from "./narrative";
export {
  deterministicVisionProvider,
  getVisionProvider,
  setVisionProvider,
  isDeterministicVisionOnly,
} from "./registry";
export type * from "./extensionPoints";
export {
  FEATURE_ASSEMBLY_MAP,
  assemblyKeyForFeature,
  resolveFeatureAssembly,
  type AssemblyRefusal,
} from "./featureAssembly";
export { priceFeature, priceCanonicalFeature, tradeKeyFor } from "./canonicalPricing";
export { stripSpatialContext, isSpatialContextOnly } from "./spatialContext";
export { planDurableHydration, planReCaptureAdoption } from "./durableHydration";
export type { DurableProjectScopeState } from "./durableHydration";
export {
  evaluatePricingGuard,
  PricingUnresolvedError,
  type PricingGuardState,
} from "./pricingGuard";
export {
  ONTOLOGY,
  ontologySubject,
  subjectForFeatureKey,
  ontologyCoverageByTrade,
  matchSubject,
  isContextOnlyMention,
  actionForSubject,
  evaluateWorkCandidate,
  unitFamilyCompatible,
  dependenciesFor,
  type OntologySubject,
  type OntologyActionKey,
  type OntologyDependency,
  type DependencyStrength,
  type WorkCandidateCheck,
} from "./ontology";
export {
  visualObservationSchema,
  visualUnderstandingSchema,
  VISUAL_UNDERSTANDING_JSON_SCHEMA,
  EMPTY_VISUAL_UNDERSTANDING,
  emptyVisualUnderstanding,
  markVisualUnderstandingStale,
  sanitizeUnderstanding,
  sanitizeRegions,
  visualRegionSchema,
  type VisualRegion,
  type VisualObservation,
  type VisualUnderstanding,
  type VisualUnderstandingResult,
  type VisualUnderstandingStatus,
  type VisualEvidenceKind,
  type ObservationNature,
  type TransformationCandidate,
  type HiddenConditionWarning,
  type MeasurementTarget,
} from "./visualUnderstanding";
export {
  extractDeicticPhrases,
  resolveDeicticReferences,
  collectTaggedObjects,
  type DeicticPhrase,
  type DeicticBinding,
} from "./deixis";
export {
  fuseProjectUnderstanding,
  scopeFacts,
  visualCandidates,
  authorityRank,
  outranks,
  AUTHORITY_ORDER,
  type ProjectUnderstanding,
  type ProjectFact,
  type FactAuthority,
  type FactProvenance,
  type FactStatus,
} from "./fusion";

