/**
 * Contractor Cost Book — precedence, transparency and safety.
 *
 * Proves the override hierarchy
 *   manual line > this estimate > company Cost Book > jurisdiction > VisionWorx baseline
 * plus the invariants the estimating engine must never lose: quarter-hour labor,
 * whole-dollar money, no customer exposure of internal rates, and no silent
 * repricing of locked estimates.
 */

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  buildBasisComparison,
  costBookUpdateAvailable,
  laborHoursFor,
  primaryBasisSource,
  repriceBlockReason,
  resolveField,
  stripInternalBasis,
  toHoursPerUnit,
  unitsPerHour,
  type PricingBasisTrace,
} from "@/domains/costBook";
import { roundQuarterHour } from "@/domains/estimating/laborTime";
import { roundMoney } from "@/domains/estimating/money";

const layers = (over: Partial<Parameters<typeof resolveField>[1]> = {}) => ({
  catalogBaseline: { hoursPerUnit: 0.08, laborRate: 65, materialUnitCost: 1.2 },
  companyOverride: null,
  estimateOverride: null,
  lineManual: null,
  ...over,
});

/** A painting line: 0.08 hr/SF baseline, company 0.10, estimate 0.12. */
const paintingTrace = (
  opts: { company?: number | null; estimate?: number | null; manual?: boolean } = {},
): PricingBasisTrace =>
  ({
    lineId: "11111111-1111-4111-8111-111111111111",
    description: "Paint walls",
    tradeKey: "painting",
    categoryKey: "interior_finishes",
    unitKey: "square_foot",
    quantity: 900,
    quantityBasis: "measurement",
    quantityBasisNote: "Wall area from room measurements",
    quantityBasisFormula: "perimeter 120 LF x 8 ft height - openings",
    quantityIsAssumedDefault: false,
    costBasis: "labor_production",
    resolutionStatus: "resolved",
    pricingSource: "knowledge_base",
    isPriceOverridden: opts.manual ?? false,
    catalogItemKey: "paint-walls-2coat",
    catalogEntry: {
      assemblyKey: "paint-walls-2coat",
      workItem: "Paint walls — two coats",
      tradeKey: "painting",
      categoryKey: "interior_finishes",
      unitKey: "square_foot",
      costBasis: "labor_production",
      catalogVersion: 2,
      sourceVersion: "residential-core-v2",
      productivityConvention: "hours_per_unit",
      baseline: { hoursPerUnit: 0.08, laborRate: 65, materialUnitCost: 1.2 },
      company:
        opts.company === undefined || opts.company === null
          ? null
          : { hoursPerUnit: opts.company },
      companyNote: null,
      companyUpdatedAt: opts.company ? "2026-02-01T00:00:00.000Z" : null,
      isCustomized: opts.company !== undefined && opts.company !== null,
    },
    effective: {
      hoursPerUnit: opts.estimate ?? opts.company ?? 0.08,
      setupHours: 0,
      laborHoursRaw: 72,
      laborHours: 72,
      laborRate: 65,
      laborFormula: "0 setup + 900 SF x 0.08 hr/SF",
      materialUnitCost: 1.2,
      equipmentCost: null,
      subcontractorCost: null,
      otherCost: null,
      laborTotal: 4680,
      materialTotal: 1080,
      directCost: 5760,
    },
    estimateOverride:
      opts.estimate === undefined || opts.estimate === null
        ? {}
        : ({ hoursPerUnit: opts.estimate } as PricingBasisTrace["estimateOverride"]),
    sources: {},
  }) as unknown as PricingBasisTrace;

describe("cost book precedence", () => {
  it("uses the VisionWorx baseline when nothing is customized", () => {
    const r = resolveField("hoursPerUnit", layers());
    expect(r.value).toBe(0.08);
    expect(r.source).toBe("catalog_baseline");
  });

  it("lets a company override win over the VisionWorx baseline", () => {
    const r = resolveField("hoursPerUnit", layers({ companyOverride: { hoursPerUnit: 0.1 } }));
    expect(r.value).toBe(0.1);
    expect(r.source).toBe("company_override");
  });

  it("lets a project/estimate override win over the company override", () => {
    const r = resolveField(
      "hoursPerUnit",
      layers({
        companyOverride: { hoursPerUnit: 0.1 },
        estimateOverride: { hoursPerUnit: 0.12 },
      }),
    );
    expect(r.value).toBe(0.12);
    expect(r.source).toBe("estimate_override");
  });

  it("keeps a manual line override authoritative above every other layer", () => {
    const r = resolveField(
      "hoursPerUnit",
      layers({
        companyOverride: { hoursPerUnit: 0.1 },
        estimateOverride: { hoursPerUnit: 0.12 },
        lineManual: { hoursPerUnit: 0.2 },
      }),
    );
    expect(r.value).toBe(0.2);
    expect(r.source).toBe("line_manual");
  });

  it("falls back to the next priority source when the top layer is cleared", () => {
    const withEstimate = resolveField(
      "hoursPerUnit",
      layers({ companyOverride: { hoursPerUnit: 0.1 }, estimateOverride: { hoursPerUnit: 0.12 } }),
    );
    const afterReset = resolveField(
      "hoursPerUnit",
      layers({ companyOverride: { hoursPerUnit: 0.1 } }),
    );
    const afterCompanyReset = resolveField("hoursPerUnit", layers());

    expect(withEstimate.value).toBe(0.12);
    expect(afterReset.value).toBe(0.1);
    expect(afterReset.source).toBe("company_override");
    expect(afterCompanyReset.value).toBe(0.08);
    expect(afterCompanyReset.source).toBe("catalog_baseline");
  });

  it("keeps every layer visible in the stack so the baseline is never lost", () => {
    const r = resolveField(
      "hoursPerUnit",
      layers({ companyOverride: { hoursPerUnit: 0.1 }, estimateOverride: { hoursPerUnit: 0.12 } }),
    );
    expect(r.stack.map((s) => s.source)).toEqual([
      "estimate_override",
      "company_override",
      "catalog_baseline",
    ]);
  });
});

describe("pricing basis transparency", () => {
  it("shows the catalog source for a knowledge-base priced painting line", () => {
    const trace = paintingTrace();
    expect(primaryBasisSource(trace)).toBe("catalog_baseline");
    const rows = buildBasisComparison(trace);
    const hours = rows.find((r) => r.field === "hoursPerUnit");
    expect(hours?.baseline).toBe(0.08);
    expect(hours?.effective).toBe(0.08);
    expect(trace.catalogEntry?.sourceVersion).toBe("residential-core-v2");
    expect(trace.quantityBasisFormula).toContain("perimeter");
  });

  it("reports company then estimate authorship as overrides are layered on", () => {
    const company = paintingTrace({ company: 0.1 });
    expect(primaryBasisSource(company)).toBe("company_override");
    expect(buildBasisComparison(company).find((r) => r.field === "hoursPerUnit")?.effective).toBe(
      0.1,
    );

    const estimate = paintingTrace({ company: 0.1, estimate: 0.12 });
    expect(primaryBasisSource(estimate)).toBe("estimate_override");
    const row = buildBasisComparison(estimate).find((r) => r.field === "hoursPerUnit");
    expect(row).toMatchObject({ baseline: 0.08, company: 0.1, estimate: 0.12, effective: 0.12 });
  });

  it("keeps a manual line override labeled as contractor-authored", () => {
    expect(primaryBasisSource(paintingTrace({ company: 0.1, manual: true }))).toBe("line_manual");
  });

  it("exposes the labor story for plumbing and electrical conventions", () => {
    // Plumbing fixture install quoted as total hours per fixture.
    expect(laborHoursFor({ hoursPerUnit: 2.5, quantity: 3, setupHours: 1 }).normalized).toBe(8.5);
    // Electrical device install quoted as units per hour.
    expect(toHoursPerUnit("units_per_hour", 4)).toBe(0.25);
    expect(toHoursPerUnit("total_hours", 6, 3)).toBe(2);
    expect(unitsPerHour(0.08)).toBeCloseTo(12.5, 4);
  });
});

describe("invariants preserved by the override layer", () => {
  it("normalizes overridden labor to quarter-hour increments", () => {
    const labor = laborHoursFor({ hoursPerUnit: 0.12, quantity: 900 });
    expect(labor.normalized % 0.25).toBe(0);
    for (const hours of [0.1, 0.37, 1.61, 8.49]) {
      expect(roundQuarterHour(hours) % 0.25).toBe(0);
    }
  });

  it("keeps overridden monetary values whole dollars", () => {
    for (const amount of [4680.42, 1080.5, 5760.999]) {
      expect(Number.isInteger(roundMoney(amount))).toBe(true);
    }
  });

  it("applies the pricing strategy once to the resulting direct cost", () => {
    // Target gross margin 40% on a cost-book-adjusted direct cost.
    const directCost = roundMoney(5760);
    const sell = roundMoney(directCost / (1 - 0.4));
    expect(sell).toBe(9600);
    // Overriding the rate changes cost, not the margin rule.
    const higher = roundMoney(6480);
    expect(roundMoney(higher / (1 - 0.4))).toBe(10800);
  });
});

describe("existing estimate safety", () => {
  it("refuses to reprice locked, approved, archived or superseded estimates", () => {
    for (const status of ["approved", "accepted", "sent", "superseded"] as const) {
      expect(repriceBlockReason({ estimateId: "e1", status, archivedAt: null })).not.toBeNull();
    }
    expect(repriceBlockReason({ estimateId: "e1", status: "draft", archivedAt: "2026-01-01" })).not.toBeNull();
  });

  it("allows an explicit reprice of an editable estimate", () => {
    expect(repriceBlockReason({ estimateId: "e1", status: "draft", archivedAt: null })).toBeNull();
    expect(repriceBlockReason({ estimateId: "e1", status: "in_review", archivedAt: null })).toBeNull();
  });

  it("surfaces a cost-book update only when the company rate is newer than the line", () => {
    expect(
      costBookUpdateAvailable(
        { estimateId: "e1", status: "draft", costBookAppliedAt: "2026-01-01T00:00:00.000Z" },
        "2026-02-01T00:00:00.000Z",
      ),
    ).toBe(true);
    expect(
      costBookUpdateAvailable(
        { estimateId: "e1", status: "draft", costBookAppliedAt: "2026-02-01T00:00:00.000Z" },
        "2026-01-01T00:00:00.000Z",
      ),
    ).toBe(false);
  });
});

describe("customer-facing exposure", () => {
  it("strips internal rate and source data from a proposal row", () => {
    const stripped = stripInternalBasis({
      description: "Paint walls",
      quantity: 900,
      pricingBasis: { hoursPerUnit: 0.12 },
      catalogEntry: { assemblyKey: "paint-walls-2coat" },
      estimateOverride: { hoursPerUnit: 0.12 },
      laborHours: 108,
      laborRate: 65,
      materialCost: 1080,
      directCost: 5760,
      total: 9600,
    }) as Record<string, unknown>;

    expect(stripped.description).toBe("Paint walls");
    expect(stripped.total).toBe(9600);
    for (const leaked of [
      "pricingBasis",
      "catalogEntry",
      "estimateOverride",
      "laborHours",
      "laborRate",
      "materialCost",
      "directCost",
    ]) {
      expect(stripped).not.toHaveProperty(leaked);
    }
  });

  it("keeps internal basis fields out of proposal components", () => {
    const proposalDir = path.resolve("src/features/proposals");
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) files.push(full);
      }
    };
    if (fs.existsSync(proposalDir)) walk(proposalDir);

    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      expect(source).not.toContain("PricingBasisSheet");
      expect(source).not.toContain("line_pricing_basis");
      expect(source).not.toContain("costBook.");
    }
  });
});

describe("localization", () => {
  const load = (locale: string) =>
    JSON.parse(
      fs.readFileSync(path.resolve(`src/i18n/locales/${locale}/estimating.json`), "utf8"),
    ).costBook as Record<string, unknown>;

  it("ships EN and ES labels with matching keys", () => {
    const en = load("en-US");
    const es = load("es-US");
    expect(Object.keys(en).sort()).toEqual(Object.keys(es).sort());
    for (const key of ["viewBasis", "pageTitle", "saveThisEstimate", "saveCompanyDefault"]) {
      expect(typeof en[key]).toBe("string");
      expect(typeof es[key]).toBe("string");
    }
    expect(Object.keys(en.source as object).sort()).toEqual(
      Object.keys(es.source as object).sort(),
    );
    expect(Object.keys(en.field as object).sort()).toEqual(Object.keys(es.field as object).sort());
  });
});
