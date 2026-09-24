import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const read = (p: string) => readFileSync(p, "utf8");

describe("paid-pilot release batch", () => {
  it("converts ballpark to detailed on the SAME estimate and seeds line items", () => {
    const fn = read("src/features/estimating/services/estimating.functions.ts");
    const handler = fn.slice(fn.indexOf("convertEstimateToDetailed"));
    expect(handler).toMatch(/sync_estimate_from_scope/);
    expect(handler).not.toMatch(/from\("estimates"\)\s*\n?\s*\.insert/);
    expect(handler).toMatch(/\.eq\("intake_mode", "ballpark"\)/);
    // Repeat conversion tops up rather than overwriting contractor edits.
    expect(handler).toMatch(/if \(existing\.intake_mode === "detailed"\)/);
    expect(handler).toMatch(/ballparkRange: existing\.range_snapshot/);
  });

  it("exposes legal routes and versioned documents", () => {
    expect(existsSync("src/routes/legal.terms.tsx")).toBe(true);
    expect(existsSync("src/routes/legal.privacy.tsx")).toBe(true);
    const docs = read("src/domains/legal/documents.ts");
    expect(docs).toMatch(/version:/);
    // Internal review status must never be presented as attorney review.
    expect(docs).not.toMatch(/counsel_reviewed"\s*,\s*$/m);
  });

  it("opens legal links from signup and queues acceptance", () => {
    const page = read("src/features/auth/pages/RegisterPage.tsx");
    expect(page).toMatch(/href="\/legal\/terms" target="_blank"/);
    expect(page).toMatch(/href="\/legal\/privacy" target="_blank"/);
    expect(page).toMatch(/queueSignupLegalAcceptance/);
  });

  it("keeps billing state server-authoritative and webhook-driven", () => {
    const fns = read("src/features/billing/services/billing.functions.ts");
    expect(fns).toMatch(/billing_not_configured/);
    expect(fns).toMatch(/requireSupabaseAuth/);
    const hook = read("src/routes/api/public/stripe-webhook.ts");
    expect(hook).toMatch(/timingSafeEqual/);
    expect(hook).toMatch(/organization_products/);
    // No invented price anywhere.
    expect(fns + hook).not.toMatch(/unit_amount/);
  });

  it("renders centralized versioned proposal terms in print output", () => {
    const view = read("src/features/proposal/components/ProposalDocumentView.tsx");
    expect(view).toMatch(/ProposalTerms/);
    expect(view).not.toMatch(/ProposalTerms[\s\S]{0,200}proposal-no-print/);
    const terms = read("src/domains/proposal/terms.ts");
    expect(terms).toMatch(/validityDays/);
    expect(terms).toMatch(/concealedConditions/);
  });

  it("never shows internal review wording to customers", () => {
    const en = read("src/i18n/locales/en-US/proposal.json");
    expect(en.toLowerCase()).not.toMatch(/counsel|template wording only/);
  });

  it("offers a support path with a correlation id", () => {
    const boundary = read("src/app/AppErrorBoundary.tsx");
    expect(boundary).toMatch(/\/app\/support\?ref=/);
    const support = read("src/features/support/services/support.functions.ts");
    expect(support).toMatch(/support_requests/);
    expect(support).not.toMatch(/access_token|refresh_token/);
  });
});
