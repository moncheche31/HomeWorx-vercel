import type {
  PresentedPricing,
  PricingComponents,
  PricingDisclosure,
  PricingMode,
} from "@/domains/estimating/pricingModes";
/**
 * Module 014 — Intelligent Proposal & Sales Presentation contracts.
 *
 * The proposal layer is a *presentation* layer. It never calculates costs
 * (Module 008 remains the single source of truth for math) and never rewrites
 * the Narrative Scope (Module 010B remains the single source of truth for the
 * written scope). It takes finished artefacts and arranges them into a
 * customer-facing sales document. Version 1 is fully deterministic — no AI.
 */
import type { ProposalTemplateContent, ProposalTemplateKey } from "./templates";
import type { ProposalAsIllustrated, ProposalFinishLevel } from "./asIllustrated";

export type ProposalLocale = "en-US" | "es-US";

export type ProposalBilingual = Record<ProposalLocale, string>;

export type ProposalTheme = "classic" | "modern" | "luxury" | "minimal";

export const PROPOSAL_THEMES: ProposalTheme[] = ["classic", "modern", "luxury", "minimal"];

export type ProposalAudience = "customer" | "contractor";

export type ProposalLevelKey = "economy" | "good" | "premium";

export const PROPOSAL_LEVELS: ProposalLevelKey[] = ["economy", "good", "premium"];

export type ProposalSectionKey =
  | "cover"
  | "vision"
  | "scope"
  | "gallery"
  | "investment"
  | "upgrades"
  | "schedule"
  | "warranty"
  | "acceptance";

export const PROPOSAL_SECTION_ORDER: ProposalSectionKey[] = [
  "cover",
  "vision",
  "scope",
  "gallery",
  "investment",
  "upgrades",
  "schedule",
  "warranty",
  "acceptance",
];

/* -------------------------------------------------------------- branding */

export interface ProposalBranding {
  companyName: string;
  /** Optional short line under the brand name (realtor templates). */
  tagline?: string | null;
  logoUrl: string | null;
  /** Optional contractor headshot shown on the cover. */
  contractorPhotoUrl: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  addressLine: string | null;
  licenseNumber: string | null;
  insuranceLine: string | null;
  /** Company accent colour (any CSS colour). Falls back to the theme accent. */
  accentColor: string | null;
}

/* ---------------------------------------------------------------- inputs */

export interface ProposalCustomer {
  name: string | null;
  propertyAddress: string | null;
}

/** Minimal projection of a photo — the proposal never sees storage internals. */
export interface ProposalMedia {
  id: string;
  kind: "before" | "rendering" | "inspiration";
  storagePath: string;
  caption: string | null;
  altText: string | null;
}

export interface ProposalUpgradeInput {
  id: string;
  label: string;
  description: string;
  priceLow?: number | null;
  priceHigh?: number | null;
}

export interface ProposalInput {
  projectId: string;
  projectName: string;
  projectTypeLabel?: string | null;
  locale: ProposalLocale;
  audience: ProposalAudience;
  customer: ProposalCustomer;
  branding: ProposalBranding;
  /**
   * The canonical scope narrative to present. When the scope has not been
   * approved yet this is still the CURRENT canonical text (contractor wording
   * or the generated narrative) — `scopeApproved` records the approval state.
   */
  approvedScopeText: string | null;
  /** True only when the narrative scope is actually approved. */
  scopeApproved?: boolean;
  /** Optional finish/material/product labels used only for finish-level signals. */
  finishLabels?: string[];
  /** Room names, used only to make the vision paragraph specific. */
  roomNames?: string[];
  media?: ProposalMedia[];
  /** Copilot-approved optional upgrades (Module 013, customer language). */
  upgrades?: ProposalUpgradeInput[];
  /** Resolved upstream from estimate mode and detailed-pricing integrity. */
  pricingSource?: ProposalPricingSource | null;
  /** How the job is sold. Presentation only. */
  pricingMode?: PricingMode;
  /**
   * Engine cost buckets for the presented total. Supplied only when the
   * contractor wants a labor / material breakout; the proposal never
   * recalculates pricing itself.
   */
  pricingComponents?: PricingComponents | null;
  /** Legacy detailed total input retained for deterministic callers/tests. */
  baseTotal?: number | null;
  currency?: string;
  settings: ProposalSettings;
  /** ISO date. Defaults to today. */
  issuedAt?: string;
  proposalNumber?: string | null;
}

/* -------------------------------------------------------------- settings */

export interface ProposalSettings {
  version: 1;
  theme: ProposalTheme;
  /**
   * Presentation template. Presentation-only: it changes headings, copy and
   * section order, never project/estimate/pricing data. Existing proposals
   * default to "contractor" so current output is unchanged.
   */
  template?: ProposalTemplateKey;
  /** Investment levels the contractor chose to show. */
  visibleLevels: ProposalLevelKey[];
  /** Sections the contractor chose to hide (cover is never hidden). */
  hiddenSections: ProposalSectionKey[];
  /** Contractor-edited warranty copy. Null uses the default template. */
  warrantyText: string | null;
  /** Contractor-edited vision copy. Null uses the generated paragraph. */
  visionText: string | null;
  /** Optional brand name shown instead of the organization name (e.g. a design studio). */
  brandNameOverride?: string | null;
  /** Optional short line under the brand name on realtor templates. */
  brandTaglineOverride?: string | null;
  /**
   * Contractor authority over the buyer/realtor "Project as Illustrated"
   * figure. Null on both = derive it from project finish signals.
   */
  asIllustratedFinishOverride?: ProposalFinishLevel | null;
  asIllustratedAmountOverride?: number | null;
  /**
   * How much pricing detail the CUSTOMER sees. Independent of how the job is
   * priced internally: a contractor selling labor + materials may still show
   * one number. Null follows the estimate's pricing mode.
   */
  pricingDisclosure?: PricingDisclosure | null;
  proposalNumber: string | null;
  acceptedAt: string | null;
  acceptedByName: string | null;
}


/* --------------------------------------------------------------- outputs */

export interface ProposalInvestmentOption {
  key: ProposalLevelKey;
  label: string;
  summary: string;
  /** Null when no estimate total is available yet. */
  amount: number | null;
  includes: string[];
  recommended: boolean;
}

export type ProposalPricingSource =
  | { kind: "ballpark"; low: number; expected: number; high: number; selected?: number }
  | { kind: "detailed_complete"; total: number }
  | {
      kind: "detailed_incomplete";
      partialTotal: number;
      ballpark: { low: number; expected: number; high: number; selected?: number } | null;
    };

/** Customer-facing pricing breakout, already resolved by the estimating engine. */
export interface ProposalPricingPresentation extends PresentedPricing {
  currency: string;
}

export interface ProposalSchedulePhase {
  key: string;
  label: string;
  description: string;
}

export interface ProposalScopeSection {
  key: string;
  title: string;
  lines: string[];
  /**
   * "lines" — concise internal items (contractor preview).
   * "prose" — polished complete sentences (client presentation).
   */
  presentation?: "lines" | "prose";
}

export interface ProposalGalleryGroup {
  kind: ProposalMedia["kind"];
  label: string;
  media: ProposalMedia[];
}

export interface ProposalUpgradeCard {
  id: string;
  label: string;
  description: string;
  priceLabel: string | null;
}

export interface ProposalDocument {
  projectId: string;
  locale: ProposalLocale;
  audience: ProposalAudience;
  theme: ProposalTheme;
  /** Selected presentation template (defaults to "contractor"). */
  template: ProposalTemplateKey;
  /** Resolved template copy. Null for the contractor template. */
  templateContent: ProposalTemplateContent | null;
  proposalNumber: string;
  issuedAt: string;
  branding: ProposalBranding;
  customer: ProposalCustomer;
  projectName: string;
  vision: string;
  scopeSections: ProposalScopeSection[];
  /** Intro paragraph above the client Scope of Work. Null in contractor view. */
  scopeIntro: string | null;
  gallery: ProposalGalleryGroup[];
  investment: ProposalInvestmentOption[];
  upgrades: ProposalUpgradeCard[];
  schedule: ProposalSchedulePhase[];
  warranty: string;
  acceptance: {
    statement: string;
    acceptedAt: string | null;
    acceptedByName: string | null;
  };
  /** Sections actually rendered, in order. */
  sections: ProposalSectionKey[];
  /** True when the narrative scope has not been approved yet. */
  awaitingApproval: boolean;
  /** Controls customer-facing warnings, printing and acceptance. */
  pricingSource: ProposalPricingSource | null;
  canFinalize: boolean;
  /**
   * Buyer/realtor "Project as Illustrated" figure inside the ballpark band.
   * Null when there is no ballpark range to anchor it to.
   */
  asIllustrated: ProposalAsIllustrated | null;
  /**
   * Labor / material presentation for the customer. Null when the contractor
   * presents one total only — itemised disclosure is never forced.
   */
  pricingPresentation: ProposalPricingPresentation | null;
}
