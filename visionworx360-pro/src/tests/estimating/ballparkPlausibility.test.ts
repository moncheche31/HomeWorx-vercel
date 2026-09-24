/**
 * Ballpark accuracy + minimal-input standard.
 *
 * Objective, deterministic guardrails behind the product promise: "fast and
 * appropriately ranged, never careless". For each representative residential
 * project, priced from MINIMAL but realistic input:
 *
 *  - no ordinary residential line becomes an unpriced blocker;
 *  - the resulting band is neither pathologically wide nor fake-precise for a
 *    project of that size and that much evidence;
 *  - the expected value is plausible relative to the normalized assemblies
 *    that produced it (a sanity ratio, not a hard-coded dollar figure — the
 *    pricebook is versioned sample data);
 *  - the interview would ask a small number of high-impact questions.
 */

import { describe, expect, it } from "vitest";
import { recalculateBallparkFromScope } from "@/domains/ballpark/scopeRecalc";
import { resolveBallparkScope, type BallparkGeometryFacts } from "@/domains/ballpark/quantityResolution";
import {
  constrainBand,
  evaluateBandPlausibility,
  evidenceCompleteness,
  spreadWindow,
  MAX_REL_SPREAD,
} from "@/domains/ballpark/plausibility";
import {
  planBallparkQuestions,
  isDetailedOnlyQuestion,
  type BallparkQuestionCandidate,
} from "@/domains/ballpark/questionPriority";
import { BALLPARK_QUESTION_BUDGET } from "@/domains/estimating/modes";

/* ------------------------------------------------------------------ *
 * Minimal realistic input: a room size and a scope list. Nothing else.
 * ------------------------------------------------------------------ */

const geometryFor = (lengthFt: number, widthFt: number, ceilingHeightFt = 8): BallparkGeometryFacts => {
  const floor = lengthFt * widthFt;
  const perimeter = 2 * (lengthFt + widthFt);
  const wall = perimeter * ceilingHeightFt;
  return {
    lengthFt,
    widthFt,
    ceilingHeightFt,
    floorAreaSf: floor,
    ceilingAreaSf: floor,
    wallNetAreaSf: Math.round(wall * 0.88),
    drywallSurfaceSf: Math.round(wall * 0.88 + floor),
    flooringWithWasteSf: Math.round(floor * 1.1),
    trimLf: perimeter,
    partitionLf: perimeter,
    perimeterLf: perimeter,
  } as BallparkGeometryFacts;
};

const scope = (titles: string[]) =>
  titles.map((title, index) => ({
    id: `item-${index}`,
    title,
    quantity: null,
    unitKey: null,
    isIncluded: true,
  }));

interface Fixture {
  name: string;
  geometry: BallparkGeometryFacts;
  titles: string[];
  /** Highest-impact questions a contractor would still be asked. */
  questions: BallparkQuestionCandidate[];
}

const KITCHEN = (l: number, w: number) => [
  "Building permit for the kitchen",
  "Remove existing cabinets",
  "Remove existing flooring",
  "Install new kitchen cabinets",
  "Install quartz countertops",
  "Install tile backsplash",
  "Install kitchen sink and faucet",
  "Install recessed lighting",
  "Add dedicated circuits for the appliances",
  "Install luxury vinyl plank flooring",
  "Hang and finish drywall",
  "Paint walls and ceiling",
  "Install baseboard trim",
  "Order dumpster and haul debris",
  "Final clean",
];

const BATH_CORE = [
  "Protect existing floors and set dust containment",
  "Gut the bathroom down to studs",
  "Rough-in plumbing for the new layout",
  "Install bath exhaust fan vented to exterior",
  "Add GFCI protection at the vanity circuit",
  "Hang and finish drywall",
  "Install porcelain tile flooring",
  "Set the vanity and vanity light",
  "Install toilet",
  "Paint walls and ceiling",
  "Install baseboard trim",
  "Order dumpster and haul debris",
  "Final clean",
];

const dimensionsAnswered: BallparkQuestionCandidate = {
  id: "dimensions",
  subject: "Room dimensions",
  topic: "dimensions",
  inferable: true,
  inferredFrom: "saved-geometry",
};

const FIXTURES: Fixture[] = [
  {
    name: "builder-grade kitchen — small (10x10)",
    geometry: geometryFor(10, 10),
    titles: KITCHEN(10, 10),
    questions: [
      dimensionsAnswered,
      { id: "finishTier", subject: "Cabinet and countertop level", topic: "finishTier" },
      { id: "studCount", subject: "Exact stud count for the soffit", topic: "other" },
    ],
  },
  {
    name: "builder-grade kitchen — medium (12x14)",
    geometry: geometryFor(12, 14),
    titles: KITCHEN(12, 14),
    questions: [
      dimensionsAnswered,
      { id: "finishTier", subject: "Cabinet and countertop level", topic: "finishTier" },
      { id: "wallChanges", subject: "Are you removing the wall to the dining room?", topic: "wallChanges" },
    ],
  },
  {
    name: "builder-grade kitchen — large (14x20)",
    geometry: geometryFor(14, 20),
    titles: [...KITCHEN(14, 20), "Install range hood", "Install appliances"],
    questions: [
      dimensionsAnswered,
      { id: "finishTier", subject: "Cabinet and countertop level", topic: "finishTier" },
      { id: "plumbing", subject: "Is the sink moving to the island?", topic: "plumbingRelocation" },
    ],
  },
  {
    name: "half bath",
    geometry: geometryFor(4, 5),
    titles: [
      "Gut the bathroom down to studs",
      "Rough-in plumbing for the new layout",
      "Hang and finish drywall",
      "Install porcelain tile flooring",
      "Set the vanity and vanity light",
      "Install toilet",
      "Paint walls and ceiling",
      "Install baseboard trim",
      "Final clean",
    ],
    questions: [dimensionsAnswered, { id: "bathType", subject: "Half, three-quarter or full bath?", topic: "bathroomType" }],
  },
  {
    name: "three-quarter bath",
    geometry: geometryFor(5, 7),
    titles: [
      ...BATH_CORE,
      "Waterproof the shower pan and wet walls",
      "Tile the shower walls",
      "Install frameless shower door",
    ],
    questions: [
      dimensionsAnswered,
      { id: "showerConfig", subject: "Tub or walk-in shower?", topic: "showerConfig" },
    ],
  },
  {
    name: "full bath",
    geometry: geometryFor(6, 9),
    titles: [
      ...BATH_CORE,
      "Waterproof the shower pan and wet walls",
      "Tile the shower walls",
      "Install frameless shower door",
      "Install bath accessories",
    ],
    questions: [
      dimensionsAnswered,
      { id: "showerConfig", subject: "Tub or walk-in shower?", topic: "showerConfig" },
      { id: "trim", subject: "Trim LF around the linen closet", topic: "other" },
    ],
  },
  {
    name: "tub-to-shower conversion",
    geometry: geometryFor(5, 8),
    titles: [
      "Protect existing floors and set dust containment",
      "Remove existing flooring",
      "Rough-in plumbing for the new layout",
      "Waterproof the shower pan and wet walls",
      "Tile the shower walls",
      "Install frameless shower door",
      "Install grab bars in the shower",
      "Patch drywall in the hallway",
      "Paint walls and ceiling",
      "Final clean",
    ],
    questions: [dimensionsAnswered, { id: "showerConfig", subject: "Curbless or standard pan?", topic: "showerConfig" }],
  },
  {
    name: "basement finish",
    geometry: geometryFor(28, 24),
    titles: [
      "Building permit and inspections",
      "Frame interior partition walls",
      "Insulate walls and ceiling",
      "Hang and finish drywall",
      "Install recessed lighting",
      "Install outlets and switches",
      "Extend HVAC ductwork to the new space",
      "Install carpet",
      "Install baseboard trim",
      "Paint walls and ceiling",
      "Install interior doors",
      "Order dumpster and haul debris",
      "Final clean",
    ],
    questions: [
      dimensionsAnswered,
      { id: "ceiling", subject: "Ceiling height under the joists?", topic: "ceilingHeight" },
      { id: "bathType", subject: "Adding a bathroom down there?", topic: "bathroomType" },
    ],
  },
  {
    name: "bedroom / interior remodel",
    geometry: geometryFor(13, 12),
    titles: [
      "Remove existing flooring",
      "Patch drywall in the hallway",
      "Install engineered hardwood flooring",
      "Install recessed lighting",
      "Install outlets and switches",
      "Paint walls and ceiling",
      "Install baseboard trim",
      "Install interior doors",
      "Install closet shelving",
      "Final clean",
    ],
    questions: [dimensionsAnswered, { id: "flooring", subject: "Hardwood or LVP?", topic: "flooringCategory" }],
  },
  {
    name: "master suite garage conversion (regression)",
    geometry: geometryFor(20, 20, 9),
    titles: [
      "Pull permits",
      "Frame walls to code",
      "Build platform floor over the slab",
      "Insulate walls, ceiling and floor",
      "Hang and finish drywall",
      "Install LVL header at the new opening",
      "Install recessed lighting",
      "Install outlets and switches",
      "Install mini-split system",
      "Install engineered hardwood flooring",
      "Install baseboard trim",
      "Paint walls and ceiling",
      "Install interior doors",
      "Install closet shelving",
      "Install transition strips and thresholds",
      "Order dumpster and haul debris",
      "Final clean",
    ],
    questions: [
      dimensionsAnswered,
      { id: "bathType", subject: "Half, three-quarter or full bath in the suite?", topic: "bathroomType" },
      { id: "beam", subject: "Exact beam size and span engineering", topic: "structural" },
    ],
  },
  {
    name: "deck",
    geometry: geometryFor(16, 12),
    titles: [
      "Build deck off the rear of the house",
      "Install deck railing",
      "Install hose bib at the deck",
      "Final clean",
    ],
    questions: [dimensionsAnswered, { id: "finishTier", subject: "Pressure treated or composite?", topic: "finishTier" }],
  },
  {
    name: "simple addition",
    geometry: geometryFor(16, 20, 9),
    titles: [
      "Building permit and inspections",
      "Frame walls to code",
      "Insulate walls and ceiling",
      "Hang and finish drywall",
      "Install recessed lighting",
      "Install outlets and switches",
      "Extend HVAC ductwork to the new space",
      "Install engineered hardwood flooring",
      "Install baseboard trim",
      "Paint walls and ceiling",
      "Replace windows",
      "Install interior doors",
      "Replace roofing shingles",
      "Replace siding",
      "Order dumpster and haul debris",
      "Final clean",
    ],
    questions: [
      dimensionsAnswered,
      { id: "structural", subject: "Is a new foundation required?", topic: "structural" },
      { id: "hours", subject: "Exact labor hours for framing", topic: "structural" },
    ],
  },
];

describe("Ballpark accuracy — minimal input, realistic range", () => {
  for (const fixture of FIXTURES) {
    it(`prices ${fixture.name} without ordinary blockers`, () => {
      const { unresolved } = resolveBallparkScope(
        scope(fixture.titles).map(({ id, title, quantity, unitKey }) => ({ id, title, quantity, unitKey })),
        { geometry: fixture.geometry },
      );
      expect(unresolved.map((u) => `${u.title} (${u.reason})`)).toEqual([]);
    });

    it(`produces a plausible planning range for ${fixture.name}`, () => {
      const result = recalculateBallparkFromScope(scope(fixture.titles), {
        geometry: fixture.geometry,
      })!;
      expect(result).not.toBeNull();
      expect(result.unpriceable).toEqual([]);

      const report = evaluateBandPlausibility(result.band, {
        hasDimensions: true,
        pricedCount: result.pricedCount,
        derivedCount: result.derivedCount,
        allowanceCount: result.allowanceCount,
        correctedCount: result.correctedCount,
        unpriceableCount: result.unpriceable.length,
      });
      expect(report.issues.map((i) => i.code)).toEqual([]);
      /* Never a pathological spread, whatever the evidence state. */
      expect(report.relSpread).toBeLessThanOrEqual(MAX_REL_SPREAD);
    });

    it(`grounds the expected value in the priced assemblies for ${fixture.name}`, () => {
      const result = recalculateBallparkFromScope(scope(fixture.titles), {
        geometry: fixture.geometry,
      })!;
      /* Expected sits inside its own band and carries real money per line. */
      expect(result.band.low).toBeLessThan(result.band.expected);
      expect(result.band.expected).toBeLessThan(result.band.high);
      const perLine = result.band.expected / result.pricedCount;
      expect(perLine).toBeGreaterThan(100);
      expect(perLine).toBeLessThan(200_000);
      /* Finish tier moves the number in the right direction, never backwards. */
      const value = recalculateBallparkFromScope(scope(fixture.titles), {
        geometry: fixture.geometry,
        finishTier: "value",
      })!;
      const premium = recalculateBallparkFromScope(scope(fixture.titles), {
        geometry: fixture.geometry,
        finishTier: "premium",
      })!;
      expect(value.band.expected).toBeLessThan(premium.band.expected);
    });

    it(`keeps the question count small for ${fixture.name}`, () => {
      const plan = planBallparkQuestions(fixture.questions);
      expect(plan.ask.length).toBeLessThanOrEqual(BALLPARK_QUESTION_BUDGET);
      expect(plan.ask.length).toBeLessThanOrEqual(3);
      /* Dimensions are inferred from saved geometry, never re-asked. */
      expect(plan.ask.some((q) => q.topic === "dimensions")).toBe(false);
      /* Detailed-estimate interrogation never leaks into ballpark. */
      expect(plan.ask.every((q) => !isDetailedOnlyQuestion(q.subject))).toBe(true);
    });
  }
});

describe("Plausibility policy", () => {
  it("scales allowed spread with project size, not a fixed dollar width", () => {
    const evidence = { hasDimensions: true, pricedCount: 20, allowanceCount: 2 };
    const small = spreadWindow(6_000, evidence);
    const large = spreadWindow(300_000, evidence);
    expect(small.maxRelSpread).toBeGreaterThan(large.maxRelSpread);
    /* But the big project still carries more absolute dollars of uncertainty. */
    expect(large.maxRelSpread * 300_000).toBeGreaterThan(small.maxRelSpread * 6_000);
  });

  it("rejects the pathological ranges contractors distrust", () => {
    const evidence = { hasDimensions: true, pricedCount: 25, allowanceCount: 3 };
    expect(evaluateBandPlausibility({ low: 10_000, expected: 60_000, high: 120_000 }, evidence).ok).toBe(false);
    expect(evaluateBandPlausibility({ low: 100_000, expected: 125_000, high: 150_000 }, evidence).issues.map((i) => i.code)).toContain("too-wide");
    expect(evaluateBandPlausibility({ low: 59_900, expected: 60_000, high: 60_100 }, evidence).issues.map((i) => i.code)).toContain("too-narrow");
    expect(evaluateBandPlausibility({ low: 52_000, expected: 60_000, high: 71_000 }, evidence).ok).toBe(true);
  });

  it("widens when evidence is sparse and tightens when it is complete", () => {
    const sparse = spreadWindow(60_000, { hasDimensions: false, pricedCount: 3, allowanceCount: 3 });
    const complete = spreadWindow(60_000, {
      hasDimensions: true,
      hasFinishTier: true,
      pricedCount: 30,
      allowanceCount: 2,
      correctedCount: 4,
      mediaCount: 6,
    });
    expect(sparse.maxRelSpread).toBeGreaterThan(complete.maxRelSpread);
    expect(evidenceCompleteness({ hasDimensions: false, pricedCount: 3, allowanceCount: 3 })).toBeLessThan(0.4);
  });

  it("constrains without moving the expected value", () => {
    const evidence = { hasDimensions: true, pricedCount: 25, allowanceCount: 3 };
    const constrained = constrainBand({ low: 10_000, expected: 60_000, high: 130_000 }, evidence);
    expect(constrained.expected).toBe(60_000);
    expect(evaluateBandPlausibility(constrained, evidence).ok).toBe(true);
    const widened = constrainBand({ low: 59_950, expected: 60_000, high: 60_050 }, evidence);
    expect(evaluateBandPlausibility(widened, evidence).ok).toBe(true);
  });
});

describe("Question priority — infer first, ask second", () => {
  it("asks nothing when evidence answers everything", () => {
    const plan = planBallparkQuestions([
      dimensionsAnswered,
      { id: "finish", subject: "Finish level", topic: "finishTier", inferable: true, inferredFrom: "renderings" },
      { id: "walls", subject: "Wall removal", topic: "wallChanges", inferable: true, inferredFrom: "floor-plan" },
    ]);
    expect(plan.ask).toEqual([]);
    expect(plan.dropped.every((d) => d.droppedBecause === "inferable")).toBe(true);
  });

  it("suppresses detailed-estimate interrogation", () => {
    const plan = planBallparkQuestions([
      { id: "a", subject: "How many receptacles are in the plan?", topic: "electricalHvac" },
      { id: "b", subject: "Exact beam size and span engineering", topic: "structural" },
      { id: "c", subject: "Trim LF at the stair landing", topic: "other" },
      { id: "d", subject: "Labor hours for drywall", topic: "other" },
      { id: "e", subject: "Half, three-quarter or full bath?", topic: "bathroomType" },
    ]);
    expect(plan.ask.map((q) => q.id)).toEqual(["e"]);
    expect(plan.dropped.filter((d) => d.droppedBecause === "detailed-only")).toHaveLength(4);
  });

  it("ranks by expected cost impact and honours the budget", () => {
    const plan = planBallparkQuestions(
      [
        { id: "flooring", subject: "Flooring category", topic: "flooringCategory" },
        { id: "dims", subject: "Room dimensions", topic: "dimensions" },
        { id: "bath", subject: "Bath type", topic: "bathroomType" },
        { id: "site", subject: "Site access", topic: "siteConditions" },
      ],
      { budget: 2 },
    );
    expect(plan.ask.map((q) => q.id)).toEqual(["dims", "bath"]);
    expect(plan.dropped.map((d) => d.droppedBecause)).toContain("over-budget");
    expect(plan.ask.every((q) => q.reason === "material-impact")).toBe(true);
  });

  it("drops questions too small to move the range", () => {
    const plan = planBallparkQuestions([{ id: "x", subject: "Which doorstop style?", topic: "other" }]);
    expect(plan.ask).toEqual([]);
    expect(plan.dropped[0]!.droppedBecause).toBe("low-impact");
  });
});
