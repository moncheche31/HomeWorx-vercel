/**
 * Module 015 — engine registry.
 *
 * Version 1 registers only the deterministic engine. A future AI-backed engine
 * swaps in here with no consumer change.
 */
import { deterministicKnowledgeEngine } from "./service";
import type { KnowledgeEngine } from "./providers";

let activeEngine: KnowledgeEngine = deterministicKnowledgeEngine;

export function registerKnowledgeEngine(engine: KnowledgeEngine): void {
  activeEngine = engine;
}

export function getKnowledgeEngine(): KnowledgeEngine {
  return activeEngine;
}

export function resetKnowledgeEngine(): void {
  activeEngine = deterministicKnowledgeEngine;
}

export function isDeterministicKnowledgeOnly(): boolean {
  return activeEngine.deterministic;
}
