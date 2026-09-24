/**
 * The proposal must always open, whatever state the scope is in:
 *  - approved wording present  -> presented, not awaiting approval;
 *  - approved wording null     -> the CURRENT canonical narrative is presented,
 *                                 still flagged as awaiting approval;
 *  - empty / artefact-only     -> no scope sections, still no crash.
 */
import { describe, expect, it } from "vitest";
import { buildProposal, defaultProposalSettings } from "../build";
import type { ProposalInput } from "../types";

const CANONICAL = [
  "Garage Conversion",
  "",
  "Framing & Insulation",
  "Remove existing garage partition wall.",
  "Install insulate walls, ceiling, floor.",
  "Building permit.",
].join("\n");

function input(patch: Partial<ProposalInput> = {}): ProposalInput {
  return {
    projectId: "p1",
    projectName: "Garage Conversion",
    locale: "en-US",
    audience: "customer",
    customer: { name: "Client", propertyAddress: null },
    branding: {
      companyName: "Co",
      logoUrl: null,
      contractorPhotoUrl: null,
      phone: null,
      email: null,
      website: null,
      addressLine: null,
      licenseNumber: null,
      insuranceLine: null,
      accentColor: null,
    },
    approvedScopeText: null,
    roomNames: [],
    media: [],
    upgrades: [],
    pricingSource: null,
    currency: "USD",
    settings: defaultProposalSettings(),
    ...patch,
  } as ProposalInput;
}

describe("proposal scope fallback", () => {
  it("presents the current canonical scope when nothing is approved", () => {
    const doc = buildProposal(input({ approvedScopeText: CANONICAL, scopeApproved: false }));
    expect(doc.scopeSections.length).toBeGreaterThan(0);
    expect(doc.awaitingApproval).toBe(true);
    expect(doc.scopeIntro).toBeTruthy();
  });

  it("does not flag approval once the scope is approved", () => {
    const doc = buildProposal(input({ approvedScopeText: CANONICAL, scopeApproved: true }));
    expect(doc.awaitingApproval).toBe(false);
  });

  it("builds a document with a null scope", () => {
    const doc = buildProposal(input({ approvedScopeText: null }));
    expect(doc.scopeSections).toEqual([]);
    expect(doc.scopeIntro).toBeNull();
    expect(doc.awaitingApproval).toBe(true);
  });

  it("builds a document with an empty / artefact-only scope", () => {
    const doc = buildProposal(
      input({ approvedScopeText: "   \n\n Note: internal only \n", scopeApproved: false }),
    );
    expect(doc.scopeSections).toEqual([]);
    expect(doc.awaitingApproval).toBe(true);
  });

  it("keeps the contractor preview on concise items", () => {
    const doc = buildProposal(
      input({ audience: "contractor", approvedScopeText: CANONICAL, scopeApproved: true }),
    );
    expect(doc.scopeIntro).toBeNull();
    expect(doc.scopeSections.every((s) => s.presentation !== "prose")).toBe(true);
  });
});
