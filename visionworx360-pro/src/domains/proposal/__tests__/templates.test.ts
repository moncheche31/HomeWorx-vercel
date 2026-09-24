import { describe, expect, it } from "vitest";
import {
  buildProposal,
  defaultProposalSettings,
  resolveProposalTemplate,
  type ProposalInput,
  type ProposalTemplateKey,
} from "..";

const baseInput = (template: ProposalTemplateKey, extra: Partial<ProposalInput> = {}): ProposalInput => ({
  projectId: "proj-12345",
  projectName: "Garage Conversion",
  locale: "en-US",
  audience: "customer",
  customer: { name: "Sample Buyer", propertyAddress: "12 Elm St" },
  branding: {
    companyName: "Acme Remodeling",
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
  approvedScopeText: "Garage Conversion\nFrame new walls\nInstall flooring",
  settings: { ...defaultProposalSettings(), template },
  issuedAt: "2026-01-15T00:00:00.000Z",
  ...extra,
});

describe("realtor proposal templates", () => {
  it("defaults to the contractor template with unchanged output", () => {
    const legacy = buildProposal(baseInput("contractor"));
    expect(legacy.template).toBe("contractor");
    expect(legacy.templateContent).toBeNull();
    expect(legacy.sections).toContain("scope");
    expect(legacy.sections).toContain("acceptance");
  });

  it("treats a missing template as contractor", () => {
    const input = baseInput("contractor");
    delete (input.settings as { template?: unknown }).template;
    expect(buildProposal(input).template).toBe("contractor");
  });

  it("renders buyer-facing headings and the conceptual notice", () => {
    const doc = buildProposal(baseInput("buyer_transformation"));
    expect(doc.templateContent?.title).toBe("See the Possibilities");
    const headings = doc.templateContent!.sections.map((s) => s.heading);
    expect(headings).toEqual([
      "Existing Condition",
      "Conceptual Transformation",
      "Design Vision",
      "Preliminary Renovation Investment",
      "Helping You See Beyond the Existing Condition",
      "Built from Real Construction Experience",
      "Interested in Exploring the Possibilities?",
      "Conceptual Visualization Notice",
    ]);
    expect(doc.templateContent!.disclaimer.body).toContain(
      "not architectural, engineering, permitting, or construction documents",
    );
    expect(doc.templateContent!.internalOnly).toBe(false);
  });

  it("marks the realtor brief as internal only", () => {
    const doc = buildProposal(baseInput("realtor_brief"));
    expect(doc.templateContent?.internalOnly).toBe(true);
    expect(doc.templateContent!.sections.map((s) => s.key)).toEqual([
      "buyer_objections",
      "transformation_opportunities",
      "before_after",
      "cost_context",
      "positioning_notes",
      "marketing_use",
      "construction_experience",
      "next_steps",
      "internal_notice",
    ]);
  });

  it("adds the construction-experience credibility section to realtor templates only", () => {
    const find = (key: ProposalTemplateKey, locale: "en-US" | "es-US") =>
      resolveProposalTemplate(key, locale).sections.find(
        (s) => s.key === "construction_experience",
      );

    const buyerEn = find("buyer_transformation", "en-US")!;
    expect(buyerEn.heading).toBe("Built from Real Construction Experience");
    expect(buyerEn.body).toContain("founded by a practicing contractor");
    expect(buyerEn.body).toContain("see the possibilities more clearly");

    const buyerEs = find("buyer_transformation", "es-US")!;
    expect(buyerEs.heading).toBe("Creado a partir de experiencia real en construcción");
    expect(buyerEs.body).toContain("contratista en ejercicio");

    const briefEn = find("realtor_brief", "en-US")!;
    expect(briefEn.heading).toBe("Built on Construction Experience");
    expect(briefEn.body).toContain("combines construction experience with visualization technology");

    const briefEs = find("realtor_brief", "es-US")!;
    expect(briefEs.heading).toBe("Respaldado por experiencia en construcción");
    expect(briefEs.body).toContain("tecnología de visualización");

    expect(find("contractor", "en-US")).toBeUndefined();
    expect(find("contractor", "es-US")).toBeUndefined();
    expect(buildProposal(baseInput("contractor")).templateContent).toBeNull();
  });

  it("makes no licensing or guarantee claims in the credibility copy", () => {
    for (const key of ["buyer_transformation", "realtor_brief"] as const) {
      for (const locale of ["en-US", "es-US"] as const) {
        const body =
          resolveProposalTemplate(key, locale).sections.find(
            (s) => s.key === "construction_experience",
          )?.body ?? "";
        expect(body.toLowerCase()).not.toContain("licensed");
        expect(body.toLowerCase()).not.toContain("guarantee");
        expect(body.toLowerCase()).not.toContain("licenciado");
        expect(body.toLowerCase()).not.toContain("garantiz");
      }
    }
  });

  it("provides Spanish copy for every realtor template", () => {
    for (const key of ["buyer_transformation", "realtor_brief"] as const) {
      const es = resolveProposalTemplate(key, "es-US");
      expect(es.title.length).toBeGreaterThan(0);
      expect(es.intro.body).not.toBe(resolveProposalTemplate(key, "en-US").intro.body);
      for (const section of es.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
      }
    }
  });

  it("keeps ballpark pricing authoritative in buyer-facing mode", () => {
    const pricingSource = { kind: "ballpark" as const, low: 34500, expected: 38750, high: 43000 };
    const contractor = buildProposal(baseInput("contractor", { pricingSource }));
    const buyer = buildProposal(baseInput("buyer_transformation", { pricingSource }));
    expect(buyer.pricingSource).toEqual(contractor.pricingSource);
    expect(buyer.investment.map((o) => o.amount)).toEqual([34500, 38750, 43000]);
    expect(buyer.canFinalize).toBe(true);
  });

  it("keeps the detailed-incomplete safety gate in realtor modes", () => {
    const pricingSource = {
      kind: "detailed_incomplete" as const,
      partialTotal: 7000,
      ballpark: { low: 34500, expected: 38750, high: 43000 },
    };
    for (const key of ["contractor", "buyer_transformation", "realtor_brief"] as const) {
      const doc = buildProposal(baseInput(key, { pricingSource }));
      expect(doc.canFinalize).toBe(false);
      expect(doc.investment.every((o) => o.amount === null)).toBe(true);
    }
  });

  it("changes only presentation when switching templates", () => {
    const pricingSource = { kind: "detailed_complete" as const, total: 51000 };
    const docs = (["contractor", "buyer_transformation", "realtor_brief"] as const).map((key) =>
      buildProposal(baseInput(key, { pricingSource })),
    );
    for (const doc of docs) {
      expect(doc.projectId).toBe("proj-12345");
      expect(doc.proposalNumber).toBe(docs[0]!.proposalNumber);
      expect(doc.pricingSource).toEqual(docs[0]!.pricingSource);
      expect(doc.investment).toEqual(docs[0]!.investment);
      expect(doc.scopeSections).toEqual(docs[0]!.scopeSections);
      expect(doc.gallery).toEqual(docs[0]!.gallery);
    }
  });

  it("applies the proposal brand override without touching contractor defaults", () => {
    const branded = buildProposal(
      baseInput("buyer_transformation", {
        settings: {
          ...defaultProposalSettings(),
          template: "buyer_transformation",
          brandNameOverride: "VisionWorx 360 Design Studio",
          brandTaglineOverride: "Conceptual property visualization",
        },
      }),
    );
    expect(branded.branding.companyName).toBe("VisionWorx 360 Design Studio");
    expect(branded.branding.tagline).toBe("Conceptual property visualization");
    expect(buildProposal(baseInput("contractor")).branding.companyName).toBe("Acme Remodeling");
  });
});
