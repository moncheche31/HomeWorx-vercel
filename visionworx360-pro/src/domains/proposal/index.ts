export * from "./types";
export * from "./themes";
export * from "./templates";
export * from "./sanitize";
export * from "./asIllustrated";
export { generateVision } from "./vision";
export { buildClientScopeSections, buildScopeIntro, isNonScopeLine } from "./clientScope";
export { buildProposal, buildProposalNumber, splitScopeSections, defaultProposalSettings } from "./build";
export {
  composeProposal,
  registerProposalWritingProvider,
  getProposalWritingProvider,
  isDeterministicProposalOnly,
  deterministicWritingProvider,
} from "./registry";
export type {
  ProposalWritingProvider,
  ProposalSalesCoachProvider,
  ProposalFinancingProvider,
  ProposalFollowUpProvider,
} from "./extensionPoints";
export { LEVEL_TEMPLATES, SCHEDULE_PHASES, DEFAULT_WARRANTY } from "./content";
export { planProposalGallery } from "./galleryLayout";
export type { ProposalGalleryPlan } from "./galleryLayout";
