import { describe, expect, it } from "vitest";
import {
  analyzeDescription,
  applyQuantityAnswers,
  buildAssumptions,
  buildQuestions,
  buildScenarios,
  collectFeatures,
} from "@/domains/remoteVision";
import { inferStructureScale } from "@/domains/remoteVision/projectScale";
import { ballparkAllowanceFor } from "@/domains/remoteVision/ballparkAllowance";
import { tradeCoverage, unbackedTrades } from "@/domains/qa/tradeCoverage";

const PEMBROKE =
  "Okay, in this job, we are going to totally renovate the exterior of the home. So we're gonna put a new standing seam metal roof, new siding, new windows, new fascia, new porches, new columns with the stone column base, new landscaping.";

const analyze = (text: string) =>
  analyzeDescription({
    description: text,
    media: [],
    locale: "en-US",
    confirmedMeasurements: [],
  } as never);

describe("exterior scope recognition (Pembroke regression)", () => {
  const keys = collectFeatures(analyze(PEMBROKE)).map((f) => f.featureKey);

  it("keeps siding when fascia is named in a different clause", () => {
    expect(keys).toContain("siding.replace");
    expect(keys).toContain("fascia.replace");
  });

  it("recognizes plural porches as deck/porch construction", () => {
    expect(keys).toContain("deck.build");
  });

  it("recognizes landscaping instead of silently dropping it", () => {
    expect(keys).toContain("landscaping.install");
  });

  it("recognizes roofing, windows and columns", () => {
    expect(keys).toEqual(
      expect.arrayContaining(["roofing.metal.replace", "windows.replace", "structural.column"]),
    );
  });

  it("prices a whole-house exterior remodel in tens of thousands, not hundreds", () => {
    const result = analyze(PEMBROKE);
    const assumptions = buildAssumptions(result, PEMBROKE, {} as never);
    const [economy] = buildScenarios(result, assumptions, "en-US", {});
    expect(economy).toBeTruthy();
    const roof = economy!.drivers.find((d) => d.featureKey === "roofing.metal.replace");
    expect(roof).toBeTruthy();
    expect(roof!.costLow).toBeGreaterThan(8000);
    const total = economy!.drivers.reduce((sum, d) => sum + d.costLow, 0);
    expect(total).toBeGreaterThan(30000);
  });
});

describe("scale-aware allowances", () => {
  it("sizes an unmeasured roof off the building envelope, not a room", () => {
    const scale = inferStructureScale({ text: "new roof on the whole house" });
    const allowance = ballparkAllowanceFor("roofing.replace", "square_foot", { scale });
    expect(allowance?.basisKey).toBe("whole_structure");
    expect(allowance!.quantity).toBeGreaterThan(1500);
  });

  it("uses a stated house size when the contractor gives one", () => {
    /* 3,000 SF over two stories is a 1,500 SF footprint, not the 1,800 default. */
    const stated = inferStructureScale({ text: "it's a 3,000 square foot two story house" });
    expect(stated.footprintSf).toBe(1500);
    expect(stated.stories).toBe(2);
    const oneStory = inferStructureScale({ text: "it's a 3,000 square foot house" });
    expect(oneStory.footprintSf).toBe(3000);
  });

  it("still uses interior allowances for interior work", () => {
    const scale = inferStructureScale({ text: "paint the hallway" });
    const allowance = ballparkAllowanceFor("paint.interior", "square_foot", { scale });
    expect(allowance?.basisKey).toBe("standard");
  });
});

describe("count-based exterior openings", () => {
  it("asks for the window count instead of silently assuming one", () => {
    const result = analyze(PEMBROKE);
    const assumptions = buildAssumptions(result, PEMBROKE, {} as never);
    expect(buildQuestions(result, assumptions).map((q) => q.topic)).toContain("window_count");
    expect(collectFeatures(result).find((feature) => feature.featureKey === "windows.replace")?.quantity)
      .toBeNull();
  });

  it("uses a contractor-provided whole-number window count", () => {
    const answered = applyQuantityAnswers(analyze(PEMBROKE), { "question:window_count": "6" });
    const window = collectFeatures(answered).find((feature) => feature.featureKey === "windows.replace");
    expect(window?.quantity).toBe(6);
    expect(window?.provenance?.source).toBe("contractor_override");
  });
});

describe("trade coverage audit", () => {
  it("has no trade that is listed but unrecognized or unpriced", () => {
    expect(unbackedTrades().map((t) => t.tradeKey)).toEqual([]);
  });

  it("sizes exterior trades at building scale", () => {
    const byKey = Object.fromEntries(tradeCoverage().map((t) => [t.tradeKey, t]));
    for (const trade of ["roofing", "exterior", "sitework_concrete"]) {
      expect(byKey[trade]?.allowanceRealistic, trade).toBe(true);
    }
  });
});
