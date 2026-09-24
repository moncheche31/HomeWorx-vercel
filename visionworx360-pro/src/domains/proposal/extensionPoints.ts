/**
 * Module 014 — AI-ready extension seams.
 *
 * Version 1 registers no AI. These interfaces exist so a future provider can
 * rewrite prose, coach the sale, or recommend financing without changing any
 * component, route, or persisted shape.
 */
import type { ProposalDocument, ProposalInput } from "./types";

export interface ProposalWritingProvider {
  key: string;
  deterministic: boolean;
  /** Rewrites the vision paragraph in the contractor's voice. */
  rewriteVision(input: ProposalInput, current: string): string | Promise<string>;
}

export interface ProposalSalesCoachProvider {
  key: string;
  /** Coaching hints shown in contractor preview only. */
  coach(doc: ProposalDocument): string[] | Promise<string[]>;
}

export interface ProposalFinancingProvider {
  key: string;
  /** Financing options presented under the investment section. */
  options(doc: ProposalDocument): Array<{ label: string; detail: string }>;
}

export interface ProposalFollowUpProvider {
  key: string;
  /** Follow-up message drafts after a proposal is sent. */
  drafts(doc: ProposalDocument): string[] | Promise<string[]>;
}
