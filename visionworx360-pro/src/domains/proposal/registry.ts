/**
 * Module 014 — provider registry. Version 1 registers only deterministic
 * builders; AI providers can be registered later without touching the UI.
 */
import { buildProposal } from "./build";
import { generateVision } from "./vision";
import type { ProposalWritingProvider } from "./extensionPoints";
import type { ProposalDocument, ProposalInput } from "./types";

export const deterministicWritingProvider: ProposalWritingProvider = {
  key: "deterministic-v1",
  deterministic: true,
  rewriteVision: (input) =>
    generateVision({
      projectName: input.projectName,
      locale: input.locale,
      approvedScopeText: input.approvedScopeText,
      roomNames: input.roomNames,
      projectTypeLabel: input.projectTypeLabel,
    }),
};

let activeWritingProvider: ProposalWritingProvider = deterministicWritingProvider;

export function registerProposalWritingProvider(provider: ProposalWritingProvider): void {
  activeWritingProvider = provider;
}

export function getProposalWritingProvider(): ProposalWritingProvider {
  return activeWritingProvider;
}

export function isDeterministicProposalOnly(): boolean {
  return activeWritingProvider.deterministic;
}

/** Single entry point used by the feature layer. */
export function composeProposal(input: ProposalInput): ProposalDocument {
  return buildProposal(input);
}
