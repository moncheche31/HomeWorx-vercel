import { describe, expect, it } from "vitest";
import {
  buildProposal,
  buildProposalNumber,
  containsInternalTerms,
  defaultProposalSettings,
  generateVision,
  splitScopeSections,
  themeTokens,
  PROPOSAL_THEMES,
} from "..";
import type { ProposalInput } from "../types";

const branding = {
  companyName: "VisionWorx Remodeling",
  logoUrl: null,
  contractorPhotoUrl: null,
  phone: "555-0100",
  email: "hello@example.com",
  website: null,
  addressLine: "12 Main St",
  licenseNumber: "LIC-1234",
  insuranceLine: null,
  accentColor: null,
};

const SCOPE = `Kitchen
We will remove the existing cabinets and install new shaker cabinetry.
Quartz countertops will be installed throughout.

Flooring
New luxury vinyl plank flooring will be installed and finished with trim.`;

function makeInput(over: Partial<ProposalInput> = {}): ProposalInput {
  return {
    projectId: "abc-12345",
    projectName: "Miller Kitchen Remodel",
    locale: "en-US",
    audience: "customer",
    customer: { name: "Dana Miller", propertyAddress: "88 Oak Ave" },
    branding,
    approvedScopeText: SCOPE,
    roomNames: ["Kitchen"],
    media: [
      { id: "1", kind: "before", storagePath: "a.jpg", caption: null, altText: null },
      { id: "2", kind: "rendering", storagePath: "b.jpg", caption: null, altText: null },
    ],
    upgrades: [
      { id: "u1", label: "Under-cabinet lighting", description: "Soft task lighting.", priceLow: 800, priceHigh: 1400 },
    ],
    baseTotal: 40000,
    currency: "USD",
    settings: defaultProposalSettings(),
    issuedAt: "2026-03-01T00:00:00.000Z",
    ...over,
  };
}

describe("proposal document", () => {
  it("builds every populated section in order", () => {
    const doc = buildProposal(makeInput());
    expect(doc.sections).toEqual([
      "cover",
      "vision",
      "scope",
      "gallery",
      "investment",
      "upgrades",
      "schedule",
      "warranty",
      "acceptance",
    ]);
  });

  it("omits sections with no content", () => {
    const doc = buildProposal(makeInput({ media: [], upgrades: [] }));
    expect(doc.sections).not.toContain("gallery");
    expect(doc.sections).not.toContain("upgrades");
  });

  it("respects contractor-hidden sections but never hides the cover", () => {
    const settings = { ...defaultProposalSettings(), hiddenSections: ["cover", "schedule"] as const };
    const doc = buildProposal(makeInput({ settings: { ...defaultProposalSettings(), hiddenSections: [...settings.hiddenSections] } }));
    expect(doc.sections).toContain("cover");
    expect(doc.sections).not.toContain("schedule");
  });

  it("flags proposals whose scope is not approved", () => {
    const doc = buildProposal(makeInput({ approvedScopeText: null }));
    expect(doc.awaitingApproval).toBe(true);
    expect(doc.scopeSections).toHaveLength(0);
  });

  it("derives a stable proposal number", () => {
    expect(buildProposalNumber("abc-12345", "2026-03-01T00:00:00.000Z")).toBe("P-2026-12345");
  });
});

describe("investment options", () => {
  it("renders the saved ballpark band instead of retained detailed work", () => {
    const doc = buildProposal(makeInput({
      baseTotal: 7000,
      pricingSource: { kind: "ballpark", low: 34500, expected: 38809, high: 43000 },
    }));
    expect(doc.investment.map((option) => option.amount)).toEqual([34500, 38809, 43000]);
    expect(doc.investment.map((option) => option.label)).toEqual(["Low", "Expected", "High"]);
    expect(doc.canFinalize).toBe(true);
  });

  it("never presents or finalizes a partial detailed total", () => {
    const doc = buildProposal(makeInput({
      baseTotal: 7000,
      pricingSource: {
        kind: "detailed_incomplete",
        partialTotal: 7000,
        ballpark: { low: 34500, expected: 38809, high: 43000 },
      },
    }));
    expect(doc.investment.every((option) => option.amount === null)).toBe(true);
    expect(doc.canFinalize).toBe(false);
    expect(doc.pricingSource?.kind).toBe("detailed_incomplete");
  });

  it("produces three tiers with Good recommended", () => {
    const doc = buildProposal(makeInput());
    expect(doc.investment.map((o) => o.key)).toEqual(["economy", "good", "premium"]);
    expect(doc.investment.find((o) => o.recommended)?.key).toBe("good");
  });

  it("honours visible level selection", () => {
    const doc = buildProposal(
      makeInput({ settings: { ...defaultProposalSettings(), visibleLevels: ["good"] } }),
    );
    expect(doc.investment).toHaveLength(1);
  });

  it("shows no amounts when no estimate total exists", () => {
    const doc = buildProposal(makeInput({ baseTotal: null }));
    expect(doc.investment.every((o) => o.amount === null)).toBe(true);
  });

  it("never invents a total larger than premium multiplier", () => {
    const doc = buildProposal(makeInput());
    const premium = doc.investment.find((o) => o.key === "premium")!;
    expect(premium.amount).toBe(48800);
  });
});

describe("scope sections", () => {
  it("splits the narrative into titled groups without rewriting it", () => {
    const sections = splitScopeSections(SCOPE, "en-US", "customer");
    expect(sections.map((s) => s.title)).toEqual(["Kitchen", "Flooring"]);
    expect(sections[0].lines[1]).toContain("Quartz countertops");
  });

  it("drops internal-only lines in customer mode", () => {
    const text = "Kitchen\nInternal: margin check pending.\nNew cabinetry will be installed.";
    const customer = splitScopeSections(text, "en-US", "customer");
    const contractor = splitScopeSections(text, "en-US", "contractor");
    expect(customer[0].lines).toHaveLength(1);
    expect(contractor[0].lines).toHaveLength(2);
  });
});

describe("customer language", () => {
  it("keeps estimating terminology out of the whole customer document", () => {
    const doc = buildProposal(makeInput());
    const all = [
      doc.vision,
      doc.warranty,
      doc.acceptance.statement,
      ...doc.investment.flatMap((o) => [o.label, o.summary, ...o.includes]),
      ...doc.schedule.flatMap((p) => [p.label, p.description]),
      ...doc.scopeSections.flatMap((s) => s.lines),
    ].join(" ");
    expect(containsInternalTerms(all)).toBe(false);
  });

  it("detects internal terms", () => {
    expect(containsInternalTerms("Apply 18% markup")).toBe(true);
    expect(containsInternalTerms("Aplicar margen")).toBe(true);
  });
});

describe("vision", () => {
  it("mentions detected highlights", () => {
    const vision = generateVision({
      projectName: "Miller Kitchen",
      locale: "en-US",
      approvedScopeText: SCOPE,
      roomNames: ["Kitchen"],
    });
    expect(vision).toContain("cabinetry");
    expect(vision).toContain("Kitchen");
  });

  it("falls back gracefully with no scope", () => {
    const vision = generateVision({
      projectName: "New Project",
      locale: "es-US",
      approvedScopeText: null,
    });
    expect(vision.length).toBeGreaterThan(20);
    expect(containsInternalTerms(vision)).toBe(false);
  });
});

describe("bilingual output", () => {
  it("renders Spanish copy for every generated string", () => {
    const doc = buildProposal(makeInput({ locale: "es-US" }));
    expect(doc.investment[1].label).toBe("Recomendado");
    expect(doc.warranty).toContain("garantía");
    expect(doc.schedule[0].label).toBe("Preparación");
    expect(doc.gallery[0].label).toBe("Antes");
  });
});

describe("themes", () => {
  it("exposes tokens for all four themes", () => {
    for (const theme of PROPOSAL_THEMES) {
      expect(themeTokens(theme).className).toContain("proposal-theme-");
    }
  });
});
