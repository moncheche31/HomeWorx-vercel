/**
 * Module 015 — Knowledge Engine (Contractor Brain).
 *
 * The shared, deterministic contractor knowledge foundation for the platform.
 * See ADR-038 for boundaries, versioning, ownership and AI extension seams.
 */
export * from "./types";
export * from "./providers";
export * from "./matching";
export * from "./versioning";
export * from "./overrides";
export {
  deterministicKnowledgeEngine,
  getKnowledgeOverrides,
  setKnowledgeOverrides,
} from "./service";
export {
  getKnowledgeEngine,
  isDeterministicKnowledgeOnly,
  registerKnowledgeEngine,
  resetKnowledgeEngine,
} from "./registry";
export {
  knowledgeCopilotRecommendations,
  mergeKnowledgeIntoCopilot,
  toCopilotConfidence,
  type KnowledgeCopilotInput,
} from "./copilotBridge";
export {
  KNOWLEDGE_EFFECTIVE_DATE,
  KNOWLEDGE_ENTRIES,
  KNOWLEDGE_ENTRY_KEYS,
  KNOWLEDGE_VERSION,
} from "./catalog";
export { ITEM_LIBRARY, UPGRADE_LIBRARY, VALUE_ENGINEERING_LIBRARY, bi } from "./items";
export type { KnowledgePipelineExtension } from "./extensionPoints";
