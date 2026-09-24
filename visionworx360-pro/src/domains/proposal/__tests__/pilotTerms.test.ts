import { describe, expect, it } from "vitest";
import en from "@/i18n/locales/en-US/proposal.json";
import es from "@/i18n/locales/es-US/proposal.json";
import enLegal from "@/i18n/locales/en-US/legal.json";
import esLegal from "@/i18n/locales/es-US/legal.json";
import enBilling from "@/i18n/locales/en-US/billing.json";
import esBilling from "@/i18n/locales/es-US/billing.json";
import {
  DEFAULT_PROPOSAL_TERMS,
  resolveProposalTermsClauses,
} from "@/domains/proposal/terms";
import { LEGAL_DOCUMENTS } from "@/domains/legal/documents";

describe("paid-pilot legal + proposal terms", () => {
  it("includes change-order, exclusions and taxes clauses by default", () => {
    for (const clause of ["changeOrders", "exclusions", "taxesAndFees"] as const) {
      expect(DEFAULT_PROPOSAL_TERMS.clauses).toContain(clause);
    }
  });

  it("defaults to a 30-day validity period", () => {
    expect(DEFAULT_PROPOSAL_TERMS.validityDays).toBe(30);
  });

  it("hides the preliminary clause on final detailed proposals", () => {
    const clauses = resolveProposalTermsClauses(DEFAULT_PROPOSAL_TERMS, {
      preliminary: false,
      hasAcceptance: false,
    });
    expect(clauses).not.toContain("preliminaryVsFinal");
    expect(clauses).toContain("changeOrders");
  });

  it("resolves every clause in EN and ES", () => {
    for (const clause of DEFAULT_PROPOSAL_TERMS.clauses) {
      for (const bundle of [en, es] as unknown as Array<Record<string, never>>) {
        const node = (bundle as unknown as { terms: { clause: Record<string, unknown> } }).terms
          .clause[clause] as { heading?: string; body?: string } | undefined;
        expect(node?.heading, `${clause} heading`).toBeTruthy();
        expect(node?.body, `${clause} body`).toBeTruthy();
      }
    }
  });

  it("never leaks internal review metadata into customer copy", () => {
    const blob = JSON.stringify(en) + JSON.stringify(es);
    expect(blob.toLowerCase()).not.toContain("counsel");
    expect(blob.toLowerCase()).not.toContain("template wording");
  });

  it("carries effective dates and internal counsel-review flags on legal docs", () => {
    for (const doc of LEGAL_DOCUMENTS) {
      expect(doc.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(doc.requiresCounselReview).toBe(true);
    }
    expect((enLegal as { effectiveLabel?: string }).effectiveLabel).toBeTruthy();
    expect((esLegal as { effectiveLabel?: string }).effectiveLabel).toBeTruthy();
  });

  it("has EN/ES copy for the billing-gated no-access screen", () => {
    for (const bundle of [enBilling, esBilling] as Array<{
      noAccess?: { title?: string; description?: string; action?: string };
    }>) {
      expect(bundle.noAccess?.title).toBeTruthy();
      expect(bundle.noAccess?.description).toBeTruthy();
      expect(bundle.noAccess?.action).toBeTruthy();
    }
  });
});
