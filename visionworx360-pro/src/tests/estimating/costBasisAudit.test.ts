import { describe, expect, it } from "vitest";
import {
  auditEstimateLines,
  auditLine,
  type AuditableLine,
} from "@/domains/estimating/lineAudit";
import { classifyCostBasis, isUnitCompatibleWithBasis } from "@/domains/estimating/costBasis";
import { assessHoursPlausibility } from "@/domains/estimating/laborPlausibility";
import { deriveLaborHours, resolveAuthoritativeHours, toHoursPerUnit } from "@/domains/estimating/productivity";

const line = (over: Partial<AuditableLine> = {}): AuditableLine => ({
  id: "l1",
  description: "Install drywall",
  quantity: 500,
  unitKey: "square_foot",
  tradeKey: "drywall",
  laborHours: 15,
  laborRate: 65,
  materialCost: 0.5,
  equipmentCost: 0,
  subcontractorCost: 0,
  otherCost: 0,
  ...over,
});

const codes = (l: AuditableLine) => auditLine(l).findings.map((f) => f.code);

describe("cost basis classification", () => {
  it.each([
    ["Building permit", "permit_fee"],
    ["City plan review fee", "permit_fee"],
    ["Dumpster and disposal fee", "other_direct_cost"],
    ["Scissor lift rental", "equipment"],
    ["HVAC by others (subcontract)", "subcontract"],
    ["Appliance allowance", "allowance"],
    ["Cabinet hardware — material only", "material_unit"],
    ["Service call / trip charge", "labor_lump_sum"],
    ["Time and material handyman work", "labor_time_and_material"],
    ["Install LVL beam at garage opening", "labor_production"],
    ["Demo interior partition walls", "labor_production"],
  ])("classifies %s as %s", (description, expected) => {
    expect(classifyCostBasis({ description }).basis).toBe(expected);
  });

  it("keeps an explicit stored basis and locks contractor-owned ones", () => {
    const r = classifyCostBasis({
      description: "Install LVL beam",
      storedBasis: "material_unit",
      isContractorOwned: true,
    });
    expect(r.basis).toBe("material_unit");
    expect(r.isLocked).toBe(true);
  });
});

describe("unit compatibility", () => {
  it("forbids hour-based scope quantities on fees", () => {
    expect(isUnitCompatibleWithBasis("permit_fee", "hour")).toBe(false);
    expect(isUnitCompatibleWithBasis("permit_fee", "each")).toBe(true);
    expect(isUnitCompatibleWithBasis("permit_fee", "lump_sum")).toBe(true);
  });

  it("allows area/linear/count units on production labor and hours only on T&M", () => {
    expect(isUnitCompatibleWithBasis("labor_production", "square_foot")).toBe(true);
    expect(isUnitCompatibleWithBasis("labor_production", "linear_foot")).toBe(true);
    expect(isUnitCompatibleWithBasis("labor_production", "hour")).toBe(false);
    expect(isUnitCompatibleWithBasis("labor_time_and_material", "hour")).toBe(true);
  });
});

describe("productivity conventions", () => {
  it("never confuses hours-per-unit, units-per-hour and total hours", () => {
    expect(toHoursPerUnit({ convention: "hours_per_unit", value: 0.02 })).toBe(0.02);
    expect(toHoursPerUnit({ convention: "units_per_hour", value: 50 })).toBe(0.02);
    expect(toHoursPerUnit({ convention: "total_hours", value: 10 }, 500)).toBe(0.02);
  });

  it("derives totals from a per-unit rate and does not re-multiply a total", () => {
    expect(deriveLaborHours({ rate: { convention: "hours_per_unit", value: 0.02 }, quantity: 500 }).totalHours).toBe(10);
    expect(deriveLaborHours({ rate: { convention: "units_per_hour", value: 50 }, quantity: 500 }).totalHours).toBe(10);
    expect(deriveLaborHours({ rate: { convention: "total_hours", value: 10 }, quantity: 500 }).totalHours).toBe(10);
  });

  it("adds setup time and applies the productivity multiplier once", () => {
    const d = deriveLaborHours({
      rate: { convention: "hours_per_unit", value: 0.02 },
      quantity: 500,
      setupHours: 1,
      productivityMultiplier: 1.2,
    });
    expect(d.totalHours).toBeCloseTo(13.2, 4);
    expect(d.formula).toContain("hr setup");
  });

  it("keeps a contractor-entered total authoritative", () => {
    const derived = deriveLaborHours({ rate: { convention: "hours_per_unit", value: 0.02 }, quantity: 500 });
    expect(resolveAuthoritativeHours({ contractorHours: 4, derived })).toEqual({
      hours: 4,
      basis: "contractor",
      formula: "contractor-entered total",
    });
  });
});

describe("line audit — provable repairs", () => {
  it("never lets a permit fee be modeled as labor and repairs it into a direct cost", () => {
    const result = auditLine(
      line({
        description: "Building permit",
        quantity: 1,
        unitKey: "hour",
        tradeKey: "general_conditions",
        laborHours: 6,
        laborRate: 85,
        materialCost: 0,
      }),
    );
    expect(result.basis).toBe("permit_fee");
    expect(result.findings.map((f) => f.code)).toContain("fee_modeled_as_labor");
    expect(result.repair?.patch.laborHours).toBe(0);
    expect(result.repair?.patch.unitKey).toBe("each");
    expect(result.repair?.patch.otherCost).toBe(510);
  });

  it("repairs a per-unit rate stored in the total-hours column", () => {
    const result = auditLine(
      line({
        description: "Paint walls and ceilings",
        tradeKey: "painting",
        quantity: 1039,
        laborHours: 0.011,
        catalogHoursPerUnit: 0.011,
        computedLaborHours: 11.429,
      }),
    );
    expect(result.findings.map((f) => f.code)).toContain("per_unit_stored_as_total");
    expect(result.repair?.patch.laborHours).toBe(11.429);
  });

  it("flags wall demo that collapsed to tiny hours instead of accepting it", () => {
    const result = auditLine(
      line({
        description: "Demo interior partition walls",
        tradeKey: "demolition",
        quantity: 320,
        laborHours: 0.4,
        materialCost: 0,
      }),
    );
    expect(result.plausibility.verdict).toBe("implausibly_low");
    expect(result.findings.map((f) => f.code)).toContain("implausible_hours");
    expect(result.repair).toBeNull();
  });

  it("flags a measured line still sitting at the placeholder quantity of 1", () => {
    const result = auditLine(
      line({
        description: "Install base and wall cabinets",
        tradeKey: "finish_carpentry",
        quantity: 1,
        unitKey: "linear_foot",
        laborHours: 1.4,
      }),
    );
    expect(result.findings.map((f) => f.code)).toContain("placeholder_quantity");
    expect(result.repair).toBeNull();
  });

  it("requires labor on LVL installation but not on an explicit material-only line", () => {
    expect(
      codes(
        line({
          description: "Install LVL beam and posts at garage opening",
          tradeKey: "framing",
          quantity: 1,
          unitKey: "each",
          laborHours: 0,
          materialCost: 900,
        }),
      ),
    ).toContain("missing_install_labor");

    expect(
      codes(
        line({
          description: "LVL beam — material only, install by others",
          tradeKey: "framing",
          quantity: 1,
          unitKey: "each",
          laborHours: 0,
          materialCost: 900,
        }),
      ),
    ).not.toContain("missing_install_labor");
  });

  it("reports an unpriced line separately from missing labor", () => {
    expect(
      codes(line({ description: "Install finished flooring", laborHours: 0, materialCost: 0, laborRate: 0 })),
    ).toContain("unpriced_line");
  });

  it("never repairs a contractor-owned line, only reports it", () => {
    const result = auditLine(
      line({
        description: "Building permit",
        quantity: 1,
        unitKey: "hour",
        laborHours: 6,
        pricingSource: "contractor",
        isContractorOwned: true,
      }),
    );
    expect(result.repair).toBeNull();
    expect(result.findings.map((f) => f.code)).toContain("contractor_value_questionable");
  });
});

describe("trade productivity plausibility across trades", () => {
  const cases: Array<[string, string, string, number, number, string]> = [
    ["roofing", "Install architectural shingles", "square_foot", 2400, 36, "ok"],
    ["flooring", "Install LVP flooring", "square_foot", 500, 15, "ok"],
    ["painting", "Prime and paint walls", "square_foot", 1200, 24, "ok"],
    ["electrical", "Install GFCI receptacles", "each", 6, 4.8, "ok"],
    ["plumbing", "Rough-in and set shut-off valves", "each", 4, 0.4, "implausibly_low"],
    ["framing", "Frame platform floor", "square_foot", 279, 10.08, "ok"],
    ["tile", "Set floor tile", "square_foot", 120, 1, "implausibly_low"],
    ["sitework_concrete", "Pour slab", "cubic_yard", 12, 300, "implausibly_high"],
  ];

  it.each(cases)("%s: %s", (tradeKey, _d, unitKey, quantity, totalHours, verdict) => {
    expect(
      assessHoursPlausibility({ basis: "labor_production", tradeKey, unitKey, quantity, totalHours }).verdict,
    ).toBe(verdict);
  });

  it("never assesses labor-free bases", () => {
    expect(
      assessHoursPlausibility({ basis: "permit_fee", unitKey: "each", quantity: 1, totalHours: 0 }).verdict,
    ).toBe("unknown");
  });
});

describe("estimate-level audit summary", () => {
  it("counts repaired vs flagged vs clean lines by category", () => {
    const summary = auditEstimateLines([
      line({ id: "ok" }),
      line({ id: "permit", description: "Building permit", quantity: 1, unitKey: "hour", laborHours: 5, materialCost: 0 }),
      line({ id: "placeholder", description: "Install cabinets", quantity: 1, unitKey: "linear_foot", laborHours: 1.4 }),
      line({
        id: "protected",
        description: "Building permit",
        quantity: 1,
        unitKey: "hour",
        laborHours: 5,
        materialCost: 0,
        isContractorOwned: true,
      }),
    ]);
    expect(summary.totalLines).toBe(4);
    expect(summary.cleanLines).toBe(1);
    expect(summary.repairableLines).toBe(1);
    expect(summary.flaggedLines).toBe(2);
    expect(summary.contractorProtectedLines).toBe(1);
    expect(summary.byCode.fee_modeled_as_labor).toBe(2);
    expect(summary.byCode.placeholder_quantity).toBe(1);
  });
});
