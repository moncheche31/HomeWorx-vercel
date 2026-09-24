import { describe, expect, it } from "vitest";
import { analyzeDescription } from "@/domains/remoteVision/analyze";
import { buildAssumptions } from "@/domains/remoteVision/assumptions";
import { buildScenarios } from "@/domains/remoteVision/scenarios";
import {
  NATIONAL_BASELINE_LOCATION,
  bookLaborRateTable,
  type BookPricingLocation,
} from "@/domains/estimating/pricing/bookLaborRates";

/**
 * INVARIANT (one pricing engine): the preliminary intake band prices labor
 * from the BOOK — NCE 2026 craft wages times the job-site area modification
 * factor — exactly like the detailed estimate. There is no flat company rate
 * and no module-local sample rate anywhere in this path. An unconfirmed job
 * site prices at the flagged national baseline instead of failing.
 */
const NARRATIVE = [
  "Demo the existing closet, about 6 linear feet.",
  "Remove a 6 LF load-bearing wall and install a 26 foot LVL beam.",
  "Add two support columns.",
  "Build in bookcases along the opened wall.",
].join(" ");

const HIGH_COST_AREA: BookPricingLocation = {
  location: "Test Metro",
  source: "zip_prefix",
  materialPct: 5,
  laborPct: 40,
  equipmentPct: 0,
};

function scenariosAt(location: BookPricingLocation | null) {
  const analysis = analyzeDescription({ locale: "en-US", description: NARRATIVE, media: [] });
  const assumptions = buildAssumptions(analysis, NARRATIVE);
  return buildScenarios(analysis, assumptions, "en-US", {
    bookLocation: location,
    laborRates: location ? bookLaborRateTable(location) : null,
  });
}

describe("intake band book-rate pricing", () => {
  it("prices labor higher in a high-factor area than at national baseline", () => {
    const metro = scenariosAt(HIGH_COST_AREA).find((s) => s.level === "economy")!;
    const national = scenariosAt(NATIONAL_BASELINE_LOCATION).find((s) => s.level === "economy")!;
    expect(metro.laborHours).toBeGreaterThan(0);
    expect(metro.costHigh).toBeGreaterThan(national.costHigh);
  });

  it("keeps labor hours identical across locations — only money moves", () => {
    const a = scenariosAt(HIGH_COST_AREA).find((s) => s.level === "economy")!;
    const b = scenariosAt(NATIONAL_BASELINE_LOCATION).find((s) => s.level === "economy")!;
    expect(a.laborHours).toBe(b.laborHours);
  });

  it("still prices a brand-new project with no confirmed job site", () => {
    const fresh = scenariosAt(null).find((s) => s.level === "economy")!;
    const baseline = scenariosAt(NATIONAL_BASELINE_LOCATION).find((s) => s.level === "economy")!;
    expect(fresh.costHigh).toBeGreaterThan(0);
    expect(fresh.costHigh).toBe(baseline.costHigh);
  });

  it("never fabricates an appliance from a spatial mention", () => {
    const scenarios = scenariosAt(NATIONAL_BASELINE_LOCATION);
    for (const scenario of scenarios) {
      for (const driver of scenario.drivers) {
        expect(driver.featureKey.startsWith("appliance")).toBe(false);
      }
    }
  });
});
