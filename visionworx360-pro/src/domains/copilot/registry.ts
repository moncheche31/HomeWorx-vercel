/**
 * Module 013 — provider registry. Version 1 registers only the deterministic
 * provider; AI providers can be registered later without touching the UI.
 */
import { reviewProject } from "./review";
import type { CopilotReviewProvider } from "./extensionPoints";
import type { CopilotReview, CopilotReviewInput } from "./types";

export const deterministicCopilotProvider: CopilotReviewProvider = {
  key: "deterministic-v1",
  deterministic: true,
  review: (input: CopilotReviewInput): CopilotReview => reviewProject(input),
};

let activeProvider: CopilotReviewProvider = deterministicCopilotProvider;

export function registerCopilotProvider(provider: CopilotReviewProvider): void {
  activeProvider = provider;
}

export function getCopilotProvider(): CopilotReviewProvider {
  return activeProvider;
}

export function isDeterministicCopilotOnly(): boolean {
  return activeProvider.deterministic;
}
