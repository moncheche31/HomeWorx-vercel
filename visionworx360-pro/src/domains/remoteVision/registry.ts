import { analyzeDescription } from "./analyze";
import type {
  VisionAnalysisProvider,
  VisionAnalysisRequest,
  VisionAnalysisResult,
  VisionProviderCapabilities,
} from "./types";

const NO_AI_CAPABILITIES: VisionProviderCapabilities = {
  imageRecognition: false,
  renderingComparison: false,
  objectDetection: false,
  materialRecognition: false,
  roomDetection: false,
  finishRecognition: false,
  quantityEstimation: false,
};

/**
 * Version 1 provider: deterministic rules over the contractor's description.
 * Swap it out with `setVisionProvider()` once a real vision model exists.
 */
export const deterministicVisionProvider: VisionAnalysisProvider = {
  id: "deterministic.description.v1",
  capabilities: NO_AI_CAPABILITIES,
  analyze: async (request: VisionAnalysisRequest): Promise<VisionAnalysisResult> =>
    analyzeDescription(request),
};

let current: VisionAnalysisProvider = deterministicVisionProvider;

export function getVisionProvider(): VisionAnalysisProvider {
  return current;
}

export function setVisionProvider(provider: VisionAnalysisProvider): void {
  current = provider;
}

/** True while no AI vision is wired in (drives the "no AI" UI disclaimer). */
export function isDeterministicVisionOnly(): boolean {
  return current.id === deterministicVisionProvider.id;
}
