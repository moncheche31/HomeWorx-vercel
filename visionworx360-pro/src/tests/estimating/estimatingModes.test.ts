import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  BALLPARK_CONTRACT,
  BALLPARK_QUESTION_BUDGET,
  DETAILED_CONTRACT,
  DETAILED_INHERITED_FACTS,
  estimatingModeContract,
  selectBallparkClarifications,
  withinBallparkQuestionBudget,
} from "@/domains/estimating";
import {
  buildBallpark,
  HIGH_VALUE_INPUTS,
  QUICK_BALLPARK_SCHEMA,
  visibleQuestions,
  type BallparkAnswers,
} from "@/domains/ballpark";

import en from "@/i18n/locales/en-US/estimating.json";
import es from "@/i18n/locales/es-US/estimating.json";

const answered = (value: string | number) => ({ status: "answered" as const, value });

/** A contractor who said the ordinary amount out loud and nothing more. */
const scenario = (facts: Record<string, string | number>): BallparkAnswers =>
  Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, answered(v)])) as BallparkAnswers;

const SCENARIOS: Record<string, BallparkAnswers> = {
  bathroom: scenario({ roomType: "bathroom", scopeType: "full_remodel", lengthFt: 8, widthFt: 6 }),
  kitchen: scenario({ roomType: "kitchen", scopeType: "full_remodel", lengthFt: 14, widthFt: 12 }),
  garage: scenario({ roomType: "garage", scopeType: "conversion", lengthFt: 20, widthFt: 18 }),
  basement: scenario({ roomType: "basement", scopeType: "finish", lengthFt: 28, widthFt: 22 }),
};

describe("estimating modes — the two-mode product contract", () => {
  it("keeps ballpark coarse, ranged and assumption-driven", () => {
    expect(BALLPARK_CONTRACT).toMatchObject({
      granularity: "assembly",
      output: "range",
      unknownsBlock: false,
      unknownsResolveAs: "allowance",
      authority: "assumed_by_engine",
    });
    expect(estimatingModeContract("ballpark")).toBe(BALLPARK_CONTRACT);
  });

  it("keeps detailed line-item, confirmed and contractor-owned", () => {
    expect(DETAILED_CONTRACT).toMatchObject({
      granularity: "line_item",
      output: "total",
      questionBudget: null,
      unknownsBlock: true,
      authority: "confirmed_by_contractor",
    });
  });

  it("caps ballpark clarifications at the question budget", () => {
    expect(BALLPARK_QUESTION_BUDGET).toBeLessThanOrEqual(6);
    expect(selectBallparkClarifications([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toHaveLength(
      BALLPARK_QUESTION_BUDGET,
    );
    expect(withinBallparkQuestionBudget(BALLPARK_QUESTION_BUDGET)).toBe(true);
    expect(withinBallparkQuestionBudget(BALLPARK_QUESTION_BUDGET + 1)).toBe(false);
  });
});

describe("ballpark stays fast for representative residential jobs", () => {
  for (const [name, answers] of Object.entries(SCENARIOS)) {
    it(`asks at most ${BALLPARK_QUESTION_BUDGET} clarifications for a ${name}`, () => {
      const surfaced = selectBallparkClarifications(
        visibleQuestions(QUICK_BALLPARK_SCHEMA, answers).filter(
          (q) => HIGH_VALUE_INPUTS.includes(q.id) && answers[q.id]?.status !== "answered",
        ),
      );
      expect(withinBallparkQuestionBudget(surfaced.length)).toBe(true);
    });

    it(`still produces a usable range for a ${name} with ordinary unknowns`, () => {
      const result = buildBallpark(answers, { currency: "USD" });
      expect(result.band.low).toBeGreaterThan(0);
      expect(result.band.expected).toBeGreaterThanOrEqual(result.band.low);
      expect(result.band.high).toBeGreaterThanOrEqual(result.band.expected);
      /* Unknowns widen and disclose; they never stop the range from existing. */
      expect(result.assumptions.length).toBeGreaterThan(0);
    });
  }

  it("widens rather than fakes precision when more is unknown", () => {
    const sparse = buildBallpark(scenario({ roomType: "kitchen" }), { currency: "USD" });
    const rich = buildBallpark(SCENARIOS.kitchen, { currency: "USD" });
    expect(sparse.unknownWidenPct).toBeGreaterThanOrEqual(rich.unknownWidenPct);
  });
});

describe("ballpark -> detailed is explicit and inherits everything", () => {
  const card = readFileSync("src/features/estimating/components/BallparkRangeCard.tsx", "utf8");
  const fn = readFileSync("src/features/estimating/services/estimating.functions.ts", "utf8");

  it("offers an obvious Build Detailed Estimate action, not a hidden menu item", () => {
    expect(card).toMatch(/data-testid="ballpark-build-detailed"/);
    expect(card).toMatch(/convert\.action/);
    expect(card).toMatch(/mode\.detailedHandoff/);
  });

  it("never converts silently — the action goes through a confirmation", () => {
    expect(card).toMatch(/ConvertToDetailedDialog/);
    expect(card).toMatch(/setConvertOpen\(true\)/);
  });

  it("inherits project facts, media, geometry and assumptions", () => {
    expect(DETAILED_INHERITED_FACTS).toContain("scope");
    expect(DETAILED_INHERITED_FACTS).toContain("geometry");
    expect(DETAILED_INHERITED_FACTS).toContain("photos");
    expect(DETAILED_INHERITED_FACTS).toContain("assumptions");
    /* Conversion flips the mode on the SAME row; nothing is recreated. */
    expect(fn).toMatch(/\.update\(\{ intake_mode: "detailed" \}\)/);
  });

  it("keeps the historical ballpark snapshot for comparison", () => {
    expect(DETAILED_INHERITED_FACTS).toContain("ballparkRange");
    expect(fn).toMatch(/ballparkRange: existing\.range_snapshot/);
  });
});

describe("mode difference is visible and bilingual", () => {
  it("labels each mode with its own promise", () => {
    expect(en.mode.ballparkTagline).toBeTruthy();
    expect(en.mode.detailedTagline).toBeTruthy();
    expect(en.mode.ballparkTagline).not.toEqual(en.mode.detailedTagline);
  });

  it("keeps EN/ES parity for the mode copy", () => {
    expect(Object.keys(es.mode).sort()).toEqual(Object.keys(en.mode).sort());
    for (const key of ["ballparkTagline", "detailedTagline", "detailedHandoff"] as const) {
      expect(es.mode[key]).toBeTruthy();
      expect(es.mode[key]).not.toEqual(en.mode[key]);
    }
  });

  it("renders the mode promise in both surfaces", () => {
    const modeCard = readFileSync(
      "src/features/estimating/components/EstimateModeCard.tsx",
      "utf8",
    );
    expect(modeCard).toMatch(/mode\.detailedTagline/);
    expect(
      readFileSync("src/features/estimating/components/BallparkRangeCard.tsx", "utf8"),
    ).toMatch(/mode\.ballparkTagline/);
  });
});
