/**
 * Estimate pricing / presentation modes + small-job coverage.
 *
 * Three ways to sell ONE estimate — one total, labor + materials, labor only —
 * and credible ballparks for handyman-sized work, not just full remodels.
 */

import { describe, expect, it } from "vitest";
import {
  presentPricing,
  presentBand,
  pricingModeContract,
  resolveDisclosure,
  normalizePricingMode,
  modeSwitchPreservesScope,
  PRICING_MODES,
  OWNER_SUPPLIED_HANDLING_PCT,
  type PricingComponents,
} from "@/domains/estimating";
import {
  applySmallJobEconomics,
  serviceCallMinimum,
  SMALL_JOB_THRESHOLD,
} from "@/domains/ballpark/smallJob";
import { recalculateBallparkFromScope } from "@/domains/ballpark/scopeRecalc";
import { resolveBallparkScope, type BallparkGeometryFacts } from "@/domains/ballpark/quantityResolution";
import { buildProposal, defaultProposalSettings } from "@/domains/proposal";
import { mapEstimate } from "@/features/estimating/services/mappers";
import { updateEstimateSchema } from "@/features/estimating/services/schemas";

const totals: PricingComponents = {
  laborTotal: 10000,
  materialTotal: 6000,
  productTotal: 0,
  allowanceTotal: 0,
  equipmentTotal: 500,
  subcontractorTotal: 1500,
  otherTotal: 0,
  overhead: 1800,
  profit: 1800,
  contingency: 0,
  tax: 0,
};

const geometry = (over: Partial<BallparkGeometryFacts> = {}): BallparkGeometryFacts =>
  ({
    lengthFt: 12,
    widthFt: 10,
    ceilingHeightFt: 8,
    floorAreaSf: 120,
    ceilingAreaSf: 120,
    wallNetAreaSf: 320,
    drywallSurfaceSf: 440,
    flooringWithWasteSf: 132,
    trimLf: 44,
    partitionLf: 0,
    perimeterLf: 44,
    ...over,
  }) as BallparkGeometryFacts;

const scope = (titles: string[]) =>
  titles.map((title, index) => ({
    id: `item-${index}`,
    title,
    quantity: null,
    unitKey: null,
    isIncluded: true,
  }));

/* ------------------------------------------------------------------ */

describe("pricing modes — contracts", () => {
  it("exposes exactly the three contractor-facing modes", () => {
    expect([...PRICING_MODES]).toEqual(["total", "labor_materials", "labor_only"]);
    expect(normalizePricingMode("nonsense")).toBe("total");
  });

  it("only labor-only stops selling materials", () => {
    expect(pricingModeContract("total").sellsMaterials).toBe(true);
    expect(pricingModeContract("labor_materials").sellsMaterials).toBe(true);
    expect(pricingModeContract("labor_only").sellsMaterials).toBe(false);
    expect(pricingModeContract("labor_only").requiresOwnerSuppliedNotice).toBe(true);
  });

  it("keeps disclosure a contractor decision, defaulting from the mode", () => {
    expect(resolveDisclosure("total")).toBe("total_only");
    expect(resolveDisclosure("labor_materials")).toBe("labor_materials");
    expect(resolveDisclosure("labor_only")).toBe("labor_only");
    /* Contractor authority: sell labor + materials, still present one number. */
    expect(resolveDisclosure("labor_materials", "total_only")).toBe("total_only");
    expect(resolveDisclosure("total", "category_subtotals")).toBe("category_subtotals");
  });
});

describe("pricing modes — no double counting", () => {
  for (const mode of PRICING_MODES) {
    it(`buckets sum exactly to the presented total in ${mode}`, () => {
      const p = presentPricing(totals, mode);
      const sum = p.laborSell + p.materialSell + p.otherSell + p.handlingSell;
      expect(Math.abs(sum - p.total)).toBeLessThan(0.05);
    });
  }

  it("labor + materials equals the one-price total", () => {
    const one = presentPricing(totals, "total");
    const split = presentPricing(totals, "labor_materials");
    expect(Math.abs(split.total - one.total)).toBeLessThan(0.05);
    expect(split.materialSell).toBeGreaterThan(0);
  });

  it("excludes material sell in labor-only while keeping labor implications", () => {
    const full = presentPricing(totals, "labor_materials");
    const labor = presentPricing(totals, "labor_only");
    expect(labor.materialSell).toBe(0);
    expect(labor.excludedMaterialSell).toBeCloseTo(full.materialSell, 2);
    /* Labor money survives untouched, plus disclosed handling. */
    expect(labor.laborSell).toBeCloseTo(full.laborSell, 2);
    expect(labor.handlingSell).toBeCloseTo(
      (full.laborSell * OWNER_SUPPLIED_HANDLING_PCT) / 100,
      2,
    );
    /* Equipment and subcontractor stay the contractor's to sell. */
    expect(labor.otherSell).toBeCloseTo(full.otherSell, 2);
    expect(labor.total).toBeLessThan(full.total);
  });

  it("charges no handling when the scope carries no material at all", () => {
    const p = presentPricing({ ...totals, materialTotal: 0, productTotal: 0 }, "labor_only");
    expect(p.handlingSell).toBe(0);
  });

  it("re-expresses a ballpark band in the selected mode, still a band", () => {
    const band = { low: 18000, expected: 22000, high: 27000 };
    const labor = presentBand(band, totals, "labor_only");
    expect(labor.factor).toBeLessThan(1);
    expect(labor.low).toBeLessThan(labor.expected);
    expect(labor.expected).toBeLessThan(labor.high);
    expect(presentBand(band, totals, "total").factor).toBe(1);
  });
});

describe("small job / handyman economics", () => {
  it("leaves full remodels untouched", () => {
    const band = { low: 40000, expected: 52000, high: 66000 };
    const result = applySmallJobEconomics(band, { laborRate: 65 });
    expect(result.isSmallJob).toBe(false);
    expect(result.band).toEqual(band);
  });

  it("adds mobilization and enforces a service-call minimum on tiny work", () => {
    const band = { low: 60, expected: 90, high: 130 };
    const result = applySmallJobEconomics(band, { laborRate: 65 });
    expect(result.isSmallJob).toBe(true);
    expect(result.band.low).toBeGreaterThanOrEqual(serviceCallMinimum(65, 20));
    expect(result.band.low).toBeLessThanOrEqual(result.band.expected);
    expect(result.band.expected).toBeLessThanOrEqual(result.band.high);
  });

  it("keeps the small-job threshold well below remodel territory", () => {
    expect(SMALL_JOB_THRESHOLD).toBeLessThan(10000);
  });
});

/* ------------------------------------------------------------------ */

const SMALL_JOBS: Array<{ name: string; titles: string[] }> = [
  {
    name: "handyman drywall and paint repair",
    titles: ["Patch drywall in the hallway", "Texture to match existing", "Paint the patched wall"],
  },
  {
    name: "interior door replacement",
    titles: ["Replace interior door", "Install door casing", "Paint the new door"],
  },
  {
    name: "small plumbing fixture replacement",
    titles: ["Replace bathroom vanity faucet", "Replace toilet", "Replace angle stops and supply lines"],
  },
  {
    name: "small electrical device and fixture work",
    titles: ["Replace outlets and switches", "Install new ceiling light fixture", "Install ceiling fan"],
  },
  {
    name: "trim and built-in carpentry one-off",
    titles: ["Install crown molding in the dining room", "Build closet shelving", "Install baseboard trim"],
  },
  {
    name: "flooring repair",
    titles: ["Remove damaged flooring", "Install matching luxury vinyl plank flooring", "Install transition strips"],
  },
  {
    name: "deck repair and small exterior carpentry",
    titles: ["Replace damaged deck boards", "Replace deck railing", "Replace rotted fascia"],
  },
  {
    name: "minor framing / partition change",
    titles: ["Remove non-bearing partition wall", "Frame new partition wall", "Hang and finish drywall"],
  },
  {
    name: "structural wall, LVL and columns one-off",
    titles: [
      "Install LVL beam at the removed wall",
      "Install support columns",
      "Patch drywall at the beam",
      "Install finish carpentry wrap at the beam",
    ],
  },
  {
    name: "painting a single room",
    titles: ["Paint walls and ceiling", "Paint trim", "Final clean"],
  },
];

describe("small job coverage — nothing common is left unpriced", () => {
  for (const job of SMALL_JOBS) {
    it(`prices every line of a ${job.name}`, () => {
      const { unresolved } = resolveBallparkScope(
        scope(job.titles).map(({ id, title, quantity, unitKey }) => ({ id, title, quantity, unitKey })),
        { geometry: geometry() },
      );
      expect(unresolved.map((u) => `${u.title} (${u.reason})`)).toEqual([]);
    });

    it(`produces a realistic, ordered band for a ${job.name}`, () => {
      const result = recalculateBallparkFromScope(scope(job.titles), { geometry: geometry() });
      expect(result).not.toBeNull();
      const band = result!.band;
      expect(band.low).toBeLessThanOrEqual(band.expected);
      expect(band.expected).toBeLessThanOrEqual(band.high);
      /* Small work is never priced below what showing up actually costs. */
      expect(band.low).toBeGreaterThanOrEqual(serviceCallMinimum(65, 20) * 0.99);
      expect(result!.unpriceable).toEqual([]);
    });
  }
});

describe("mode switching preserves the estimate", () => {
  const titles = [
    "Remove existing cabinets",
    "Install new kitchen cabinets",
    "Install quartz countertops",
    "Install tile backsplash",
    "Install kitchen sink and faucet",
    "Install appliances",
    "Paint walls and ceiling",
    "Final clean",
  ];

  const run = (mode: "total" | "labor_materials" | "labor_only") =>
    recalculateBallparkFromScope(scope(titles), { geometry: geometry(), pricingMode: mode })!;

  it("keeps scope, quantities and assumptions identical across modes", () => {
    const one = run("total");
    const labor = run("labor_only");
    expect(labor.pricedCount).toBe(one.pricedCount);
    expect(labor.assumptions.map((a) => `${a.itemKey}:${a.quantity}`)).toEqual(
      one.assumptions.map((a) => `${a.itemKey}:${a.quantity}`),
    );
    expect(
      modeSwitchPreservesScope(
        one.assumptions.map((a) => ({ id: a.itemKey, quantity: a.quantity })),
        labor.assumptions.map((a) => ({ id: a.itemKey, quantity: a.quantity })),
      ),
    ).toBe(true);
  });

  it("prices a kitchen labor-only install below the same kitchen with materials", () => {
    const withMaterials = run("labor_materials");
    const laborOnly = run("labor_only");
    expect(laborOnly.band.expected).toBeLessThan(withMaterials.band.expected);
    expect(laborOnly.split.materialSell).toBe(0);
    expect(laborOnly.split.excludedMaterialSell).toBeGreaterThan(0);
    /* Owner-supplied cabinets still take labor to receive, set and finish. */
    expect(laborOnly.split.laborSell).toBeGreaterThan(0);
    expect(laborOnly.split.handlingSell).toBeGreaterThan(0);
  });

  it("splits sum to the presented expected value in every mode", () => {
    for (const mode of PRICING_MODES) {
      const r = run(mode);
      const sum =
        r.split.laborSell + r.split.materialSell + r.split.otherSell + r.split.handlingSell;
      expect(Math.abs(sum - r.band.expected)).toBeLessThan(1);
    }
  });

  it("does not turn a labor-only ballpark into a detailed interrogation", () => {
    const r = run("labor_only");
    expect(r.unpriceable).toEqual([]);
    expect(r.assumptions.length).toBe(r.pricedCount);
  });

  it("still prices a bathroom labor + materials remodel end to end", () => {
    const bathroom = recalculateBallparkFromScope(
      scope([
        "Gut the bathroom down to studs",
        "Rough-in plumbing for the new layout",
        "Waterproof the shower pan and wet walls",
        "Tile the shower walls",
        "Set the vanity and vanity light",
        "Install toilet",
        "Hang and finish drywall",
        "Paint walls and ceiling",
      ]),
      { geometry: geometry({ floorAreaSf: 48, lengthFt: 8, widthFt: 6 }), pricingMode: "labor_materials" },
    )!;
    expect(bathroom.unpriceable).toEqual([]);
    expect(bathroom.split.materialSell).toBeGreaterThan(0);
    expect(bathroom.split.laborSell).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ *
 * Contractor authority over what the CUSTOMER sees
 * ------------------------------------------------------------------ */

describe("proposal presentation — the contractor decides the disclosure", () => {
  const base = {
    projectId: "p1",
    projectName: "Kitchen",
    locale: "en-US" as const,
    audience: "customer" as const,
    customer: { name: "Client", propertyAddress: null },
    branding: {
      companyName: "Co", logoUrl: null, contractorPhotoUrl: null, phone: null,
      email: null, website: null, addressLine: null, licenseNumber: null,
      insuranceLine: null, accentColor: null,
    },
    approvedScopeText: "Install cabinets.",
    scopeApproved: true,
    baseTotal: 21600,
    currency: "USD",
    pricingComponents: totals,
  };

  it("shows one total only by default — itemisation is never forced", () => {
    const doc = buildProposal({ ...base, settings: defaultProposalSettings() });
    expect(doc.pricingPresentation).toBeNull();
  });

  it("shows a labor / material split when the contractor asks for one", () => {
    const doc = buildProposal({
      ...base,
      pricingMode: "labor_materials",
      settings: defaultProposalSettings(),
    });
    expect(doc.pricingPresentation?.materialSell).toBeGreaterThan(0);
    expect(doc.pricingPresentation?.laborSell).toBeGreaterThan(0);
    /* Buckets sum exactly to the presented total: nothing double-counted. */
    const p = doc.pricingPresentation!;
    expect(p.laborSell + p.materialSell + p.otherSell + p.handlingSell).toBeCloseTo(p.total, 2);
  });

  it("can still present one number while pricing labor + materials internally", () => {
    const doc = buildProposal({
      ...base,
      pricingMode: "labor_materials",
      settings: { ...defaultProposalSettings(), pricingDisclosure: "total_only" },
    });
    expect(doc.pricingPresentation).toBeNull();
  });

  it("discloses owner-supplied materials on a labor-only proposal", () => {
    const doc = buildProposal({
      ...base,
      pricingMode: "labor_only",
      settings: defaultProposalSettings(),
    });
    const p = doc.pricingPresentation!;
    expect(p.ownerSuppliesMaterials).toBe(true);
    expect(p.materialSell).toBe(0);
    expect(p.excludedMaterialSell).toBeGreaterThan(0);
    /* Owner-supplied material still costs the contractor labor to handle. */
    expect(p.handlingSell).toBeGreaterThan(0);
  });
});

describe("pricing mode persistence", () => {
  it("defaults legacy estimate rows to one total price", () => {
    expect(mapEstimate({ id: "e", created_by: "u" }).pricingMode).toBe("total");
  });

  it("round-trips each stored mode", () => {
    for (const mode of PRICING_MODES) {
      expect(mapEstimate({ id: "e", created_by: "u", pricing_mode: mode }).pricingMode).toBe(mode);
    }
  });

  it("accepts only the three modes on update", () => {
    expect(updateEstimateSchema.safeParse({
      estimateId: "11111111-1111-4111-8111-111111111111", pricingMode: "labor_only",
    }).success).toBe(true);
    expect(updateEstimateSchema.safeParse({
      estimateId: "11111111-1111-4111-8111-111111111111", pricingMode: "free",
    }).success).toBe(false);
  });
});
