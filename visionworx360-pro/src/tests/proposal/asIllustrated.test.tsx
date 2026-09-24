import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import {
  buildProposal,
  computeAsIllustrated,
  defaultProposalSettings,
  detectFinishSignals,
  type ProposalInput,
} from "@/domains/proposal";
import { ProposalAsIllustratedBlock } from "@/features/proposal/components/ProposalAsIllustrated";

const BAND = { low: 36000, expected: 50000, high: 65000 };

const branding = {
  companyName: "VisionWorx Remodeling",
  logoUrl: null,
  contractorPhotoUrl: null,
  phone: null,
  email: null,
  website: null,
  addressLine: null,
  licenseNumber: null,
  insuranceLine: null,
  accentColor: null,
};

const VALUE_SCOPE = `Master Suite
We will install new carpet throughout and stock cabinets with basic trim.
Laminate counters will be installed in the vanity area.`;

const PREMIUM_SCOPE = `Master Suite
We will install hardwood flooring and custom cabinetry with crown molding.
Marble counters and high-end fixtures complete the suite.`;

const AMBIGUOUS_SCOPE = `Master Suite
We will convert the garage into a bedroom and add a closet.`;

function makeInput(over: Partial<ProposalInput> = {}): ProposalInput {
  return {
    projectId: "abc-12345",
    projectName: "Master Suite Garage Conversion",
    locale: "en-US",
    audience: "customer",
    customer: { name: "Dana Miller", propertyAddress: "88 Oak Ave" },
    branding,
    approvedScopeText: AMBIGUOUS_SCOPE,
    settings: { ...defaultProposalSettings(), template: "buyer_transformation" },
    pricingSource: { kind: "ballpark", ...BAND },
    issuedAt: "2026-03-01T00:00:00.000Z",
    ...over,
  };
}

describe("as-illustrated finish detection", () => {
  it("places value finish signals toward the low end", () => {
    const result = computeAsIllustrated({ band: BAND, scopeText: VALUE_SCOPE });
    expect(result!.finishLevel).toBe("value");
    expect(result!.assumed).toBe(false);
    expect(result!.amount).toBeLessThan(BAND.expected);
    expect(result!.amount).toBeGreaterThanOrEqual(BAND.low);
  });

  it("places premium finish signals toward the high end", () => {
    const result = computeAsIllustrated({ band: BAND, scopeText: PREMIUM_SCOPE });
    expect(result!.finishLevel).toBe("premium");
    expect(result!.amount).toBeGreaterThan(BAND.expected);
    expect(result!.amount).toBeLessThanOrEqual(BAND.high);
  });

  it("defaults near Expected and discloses the assumption when data is ambiguous", () => {
    const result = computeAsIllustrated({ band: BAND, scopeText: AMBIGUOUS_SCOPE });
    expect(result!.finishLevel).toBe("standard");
    expect(result!.assumed).toBe(true);
    expect(result!.amount).toBe(BAND.expected);
  });

  it("reads Spanish finish signals too", () => {
    const es = detectFinishSignals("Instalaremos madera dura y gabinetes a medida con moldura de corona.");
    expect(es.confident).toBe(true);
    expect(es.level).toBe("premium");
  });

  it("never leaves the Low/High band, including with an out-of-range override", () => {
    expect(computeAsIllustrated({ band: BAND, amountOverride: 999999 })!.amount).toBe(BAND.high);
    expect(computeAsIllustrated({ band: BAND, amountOverride: 1 })!.amount).toBe(BAND.low);
    expect(computeAsIllustrated({ band: BAND, scopeText: PREMIUM_SCOPE })!.amount).toBeLessThanOrEqual(BAND.high);
  });

  it("honours contractor overrides over detection", () => {
    const level = computeAsIllustrated({ band: BAND, scopeText: PREMIUM_SCOPE, finishOverride: "value" });
    expect(level!.finishLevel).toBe("value");
    expect(level!.overridden).toBe(true);
    expect(level!.amount).toBe(BAND.low);

    const amount = computeAsIllustrated({ band: BAND, scopeText: AMBIGUOUS_SCOPE, amountOverride: 52000 });
    expect(amount!.amount).toBe(52000);
    expect(amount!.assumed).toBe(false);
  });

  it("returns null when there is no ballpark band to anchor to", () => {
    expect(computeAsIllustrated({ band: null, scopeText: PREMIUM_SCOPE })).toBeNull();
  });
});

describe("proposal document integration", () => {
  it("keeps the overall range and adds a separate as-illustrated figure", () => {
    const doc = buildProposal(makeInput({ approvedScopeText: PREMIUM_SCOPE }));
    expect(doc.investment.map((o) => o.amount)).toEqual([36000, 50000, 65000]);
    expect(doc.asIllustrated!.band).toEqual(BAND);
    expect(doc.asIllustrated!.amount).not.toBe(BAND.expected);
  });

  it("keeps contractor Low / Expected / High behaviour untouched", () => {
    const doc = buildProposal(makeInput({ audience: "contractor", settings: defaultProposalSettings() }));
    expect(doc.investment.map((o) => o.label)).toEqual(["Low", "Expected", "High"]);
    expect(doc.investment.map((o) => o.amount)).toEqual([36000, 50000, 65000]);
  });

  it("persists a contractor override through proposal settings", () => {
    const doc = buildProposal(
      makeInput({
        settings: {
          ...defaultProposalSettings(),
          template: "buyer_transformation",
          asIllustratedAmountOverride: 52000,
        },
      }),
    );
    expect(doc.asIllustrated!.amount).toBe(52000);
    expect(doc.asIllustrated!.overridden).toBe(true);
  });
});

describe("buyer/realtor value-conscious default", () => {
  const buyer = (scopeText: string | null, over: Record<string, unknown> = {}) =>
    computeAsIllustrated({ band: BAND, scopeText, presentation: "buyer", ...over })!;

  it("does not classify an attractive but unspecified rendering as premium", () => {
    const result = buyer(AMBIGUOUS_SCOPE);
    expect(result.finishLevel).not.toBe("premium");
    expect(result.amount).toBeLessThan(BAND.expected);
    expect(result.assumed).toBe(true);
    expect(result.valueConsciousDefault).toBe(true);
  });

  it("lands in the lower-to-middle portion of the range for a nice but generic scope", () => {
    const nice = buyer(`Master Suite
We will refresh the space with new tile in the bath and fresh paint throughout.`);
    expect(nice.amount).toBeGreaterThanOrEqual(BAND.low);
    expect(nice.amount).toBeLessThan(BAND.expected);
    expect(nice.finishLevel).not.toBe("premium");
  });

  it("still moves higher when the project explicitly shows premium selections", () => {
    const result = buyer(PREMIUM_SCOPE);
    expect(result.finishLevel).toBe("premium");
    expect(result.amount).toBeGreaterThan(BAND.expected);
    expect(result.valueConsciousDefault).toBe(false);
  });

  it("does not jump to premium on a single upgraded signal", () => {
    const oneSignal = buyer("Master Suite\nWe will install hardwood flooring and repaint.");
    expect(oneSignal.finishLevel).not.toBe("premium");
    expect(oneSignal.amount).toBeLessThanOrEqual(BAND.expected);
  });

  it("is not a hard-coded percentile — value signals sit below the generic default", () => {
    const generic = buyer(AMBIGUOUS_SCOPE).amount;
    const cheap = buyer(VALUE_SCOPE).amount;
    expect(cheap).toBeLessThan(generic);
  });

  it("keeps contractor presentation neutral (Expected-anchored) for the same scope", () => {
    const contractor = computeAsIllustrated({ band: BAND, scopeText: AMBIGUOUS_SCOPE })!;
    expect(contractor.amount).toBe(BAND.expected);
    expect(contractor.valueConsciousDefault).toBe(false);
  });

  it("lets a contractor override beat the value-conscious default", () => {
    const overridden = buyer(AMBIGUOUS_SCOPE, { finishOverride: "premium" });
    expect(overridden.finishLevel).toBe("premium");
    expect(overridden.amount).toBe(BAND.high);
    expect(overridden.valueConsciousDefault).toBe(false);
  });

  it("applies the buyer default through realtor templates only", () => {
    const buyerDoc = buildProposal(makeInput({ settings: { ...defaultProposalSettings(), template: "realtor_brief" } }));
    expect(buyerDoc.asIllustrated!.amount).toBeLessThan(BAND.expected);
    const contractorDoc = buildProposal(makeInput({ settings: defaultProposalSettings() }));
    expect(contractorDoc.asIllustrated!.amount).toBe(BAND.expected);
  });

  it("keeps the full ballpark range visible alongside the illustrated figure", () => {
    const doc = buildProposal(makeInput({ settings: { ...defaultProposalSettings(), template: "buyer_transformation" } }));
    expect(doc.asIllustrated!.band).toEqual(BAND);
    expect(doc.investment.map((o) => o.amount)).toEqual([36000, 50000, 65000]);
  });
});

describe("buyer/realtor presentation", () => {
  const value = computeAsIllustrated({ band: BAND, scopeText: AMBIGUOUS_SCOPE })!;

  it("shows the range, the as-illustrated figure and the planning note", () => {
    render(<ProposalAsIllustratedBlock value={value} currency="USD" />);
    expect(screen.getByText("Estimated Ballpark Range")).toBeTruthy();
    const block = screen.getByTestId("proposal-as-illustrated");
    expect(block.textContent).toContain("$36,000");
    expect(block.textContent).toContain("$65,000");
    expect(block.textContent).toMatch(/As Illustrated: approximately \$50,000/);
    expect(screen.getByText(/final pricing will depend on confirmed scope/i)).toBeTruthy();
    expect(screen.getByText(/builder-grade standard finish package/)).toBeTruthy();
  });

  it("uses one component for screen and print/PDF", () => {
    const view = readFileSync("src/features/proposal/components/ProposalTemplateView.tsx", "utf8");
    const print = readFileSync("src/features/proposal/pages/ProposalPrintPage.tsx", "utf8");
    expect(view).toContain("ProposalAsIllustratedBlock");
    // Print renders the same composed document view, so the wording cannot diverge.
    expect(print).toContain("ProposalDocumentView");
    const block = readFileSync("src/features/proposal/components/ProposalAsIllustrated.tsx", "utf8");
    expect(block).not.toContain("proposal-no-print");
  });

  it("keeps EN/ES parity for every new label", () => {
    const en = JSON.parse(readFileSync("src/i18n/locales/en-US/proposal.json", "utf8"));
    const es = JSON.parse(readFileSync("src/i18n/locales/es-US/proposal.json", "utf8"));
    expect(Object.keys(es.asIllustrated)).toEqual(Object.keys(en.asIllustrated));
    expect(Object.keys(es.asIllustrated.finish)).toEqual(Object.keys(en.asIllustrated.finish));
    for (const key of ["asIllustratedFinish", "asIllustratedAuto", "asIllustratedAmount", "asIllustratedHint"]) {
      expect(typeof es.settings[key]).toBe("string");
      expect(es.settings[key]).not.toBe(en.settings[key]);
    }
    expect(es.asIllustrated.amount).toContain("{{amount}}");
  });
});
