import { describe, expect, it } from "vitest";
import {
  ASSUMED_FOOTPRINT_WIDEN_PCT,
  BALLPARK_INTAKE_SOURCES,
  buildMultiInputBallpark,
  completenessPct,
  DESCRIPTION_BALLPARK_SCHEMA,
  emptyHistory,
  footprintFor,
  mapIntakeAnswers,
  MAX_TOTAL_WIDEN_PCT,
  PHOTO_BALLPARK_SCHEMA,
  PHOTO_OBSERVATION_PROMPTS,
  recordRefinement,
  refineWithAnswers,
  risksFor,
  schemaForSource,
  SOURCE_WIDEN_PCT,
  type BallparkAnswers,
  type BallparkInterviewSchema,
} from "../index";

const answer = (value: string | number) => ({ status: "answered" as const, value });

const onsiteAnswers: BallparkAnswers = {
  lengthFt: answer(16),
  widthFt: answer(18),
  ceilingHeightFt: answer(8),
  drywall: answer("walls_and_ceiling"),
  flooringQuality: answer("mid"),
  plumbing: answer("none"),
  electrical: answer("moderate"),
  finishLevel: answer("standard"),
  roomType: answer("garage"),
  scopeType: answer("conversion"),
};

const photoAnswers: BallparkAnswers = {
  roomType: answer("kitchen"),
  sizeClass: answer("medium"),
  scopeType: answer("full"),
  finishLevel: answer("standard"),
  plumbingRelocation: answer("no"),
  wallRemoval: answer("no"),
  "obs.cabinetsPresent": answer("yes"),
  "obs.flooringToReplace": answer("yes"),
};

const cabinetryOnlySchema: BallparkInterviewSchema = {
  ...PHOTO_BALLPARK_SCHEMA,
  key: "quick_ballpark_v1.scoped.cabinetry",
  questions: [
    { id: "builtInLengthFt", kind: "dimension", promptKey: "q.builtInLengthFt.prompt", unit: "ft" },
    { id: "finishLevel", kind: "choice", promptKey: "q.finishLevel.prompt" },
  ],
};

describe("multi-input ballpark intake", () => {
  it("exposes exactly the three intake paths", () => {
    expect([...BALLPARK_INTAKE_SOURCES]).toEqual(["onsite", "photos", "description"]);
    expect(schemaForSource("photos")).toBe(PHOTO_BALLPARK_SCHEMA);
    expect(schemaForSource("description")).toBe(DESCRIPTION_BALLPARK_SCHEMA);
    expect(schemaForSource("onsite").key).toBe("quick_ballpark_v1");
  });

  it("never derives a dimension from a photo observation", () => {
    for (const prompt of PHOTO_OBSERVATION_PROMPTS) {
      expect(prompt.key).not.toMatch(/^(length|width|height|area|dimension)/i);
    }
  });

  it("fills a footprint from a size class and flags it as assumed", () => {
    const mapped = mapIntakeAnswers(photoAnswers, "photos");
    expect(mapped.footprintAssumed).toBe(true);
    expect(mapped.injectedKeys).toContain("lengthFt");
    const kitchen = footprintFor("kitchen", "medium");
    expect(mapped.answers.lengthFt?.value).toBe(kitchen?.lengthFt);
  });

  it("never overwrites a contractor answer", () => {
    const withDims: BallparkAnswers = { ...photoAnswers, lengthFt: answer(11), widthFt: answer(13) };
    const mapped = mapIntakeAnswers(withDims, "photos");
    expect(mapped.footprintAssumed).toBe(false);
    expect(mapped.answers.lengthFt?.value).toBe(11);
  });

  it("prunes stale off-scope garage answers before mapping or pricing", () => {
    const staleGarageDraft: BallparkAnswers = {
      lengthFt: answer(22),
      widthFt: answer(20),
      ceilingHeightFt: answer(8),
      scopeType: answer("conversion"),
      raisedFloor: answer("yes"),
      partitions: answer("moderate"),
      builtInLengthFt: answer(10),
      finishLevel: answer("standard"),
    };

    const mapped = mapIntakeAnswers(staleGarageDraft, "description", ["builtInLengthFt", "finishLevel"]);
    expect(Object.keys(mapped.answers).sort()).toEqual(["builtInLengthFt", "finishLevel"]);
    expect(mapped.injectedKeys).toEqual([]);
    expect(mapped.footprintAssumed).toBe(false);

    const result = buildMultiInputBallpark({
      source: "description",
      answers: staleGarageDraft,
      options: { schema: cabinetryOnlySchema },
    });
    expect(result.derived.geometryInput.lengthFt).toBeNull();
    expect(result.derived.geometryInput.widthFt).toBeNull();
    expect(result.unknowns.map((unknown) => unknown.questionId)).not.toContain("raisedFloor");
    expect(result.assumptions.map((assumption) => assumption.key)).not.toContain("partitionLf");
  });
});

describe("multi-input ballpark result", () => {
  it("produces a range, a ledger and disclaimers for every path", () => {
    for (const source of BALLPARK_INTAKE_SOURCES) {
      const result = buildMultiInputBallpark({
        source,
        answers: source === "onsite" ? onsiteAnswers : photoAnswers,
      });
      expect(result.band.low).toBeLessThanOrEqual(result.band.expected);
      expect(result.band.expected).toBeLessThanOrEqual(result.band.high);
      expect(result.disclaimers.length).toBeGreaterThan(0);
      expect(result.disclaimers.every((d) => d.requiresCounselReview)).toBe(true);
      expect(result.ledger.source).toBe(source);
      expect(result.totalWidenPct).toBeLessThanOrEqual(MAX_TOTAL_WIDEN_PCT);
    }
  });

  it("adds the rendering disclaimer only for the photo path", () => {
    const photos = buildMultiInputBallpark({ source: "photos", answers: photoAnswers });
    const onsite = buildMultiInputBallpark({ source: "onsite", answers: onsiteAnswers });
    expect(photos.disclaimers.map((d) => d.key)).toContain("rendering_conceptual");
    expect(onsite.disclaimers.map((d) => d.key)).not.toContain("rendering_conceptual");
  });

  it("widens a remote ballpark more than a measured on-site one", () => {
    const onsite = buildMultiInputBallpark({ source: "onsite", answers: onsiteAnswers });
    const photos = buildMultiInputBallpark({ source: "photos", answers: photoAnswers });
    expect(onsite.sourceWidenPct).toBe(SOURCE_WIDEN_PCT.onsite);
    expect(photos.sourceWidenPct).toBe(SOURCE_WIDEN_PCT.photos + ASSUMED_FOOTPRINT_WIDEN_PCT);
    expect(photos.confidence).toBe("low");
    expect(photos.totalWidenPct).toBeGreaterThan(onsite.totalWidenPct);
  });

  it("is deterministic and idempotent", () => {
    const a = buildMultiInputBallpark({ source: "description", answers: photoAnswers });
    const b = buildMultiInputBallpark({ source: "description", answers: photoAnswers });
    expect(a.band).toEqual(b.band);
    expect(a.ledger.completenessPct).toBe(b.ledger.completenessPct);
  });

  it("files every input into a ledger bucket and names high-impact risks", () => {
    const result = buildMultiInputBallpark({ source: "photos", answers: photoAnswers });
    expect(result.ledger.observed.length).toBe(2);
    expect(result.ledger.assumed.length).toBeGreaterThan(0);
    const riskKeys = result.ledger.risks.map((r) => r.key);
    expect(riskKeys).toContain("concealedConditions");
    expect(riskKeys).toContain("assumedFootprint");
    expect(riskKeys).toContain("permits");
  });

  it("scores completeness from high-impact inputs only", () => {
    expect(completenessPct({})).toBe(0);
    expect(completenessPct(onsiteAnswers)).toBeGreaterThan(completenessPct(photoAnswers));
  });

  it("flags structural risk when a wall is coming out", () => {
    const risks = risksFor({ ...photoAnswers, wallRemoval: answer("yes") }, "photos");
    expect(risks.map((r) => r.key)).toContain("structural");
  });
});

describe("refinement instead of restarting", () => {
  it("tightens the same estimate when real measurements arrive", () => {
    const before = buildMultiInputBallpark({ source: "photos", answers: photoAnswers });
    const { answers, changedKeys } = refineWithAnswers(photoAnswers, {
      lengthFt: answer(12),
      widthFt: answer(14),
      ceilingHeightFt: answer(9),
    });
    const after = buildMultiInputBallpark({ source: "photos", answers });

    expect(changedKeys).toEqual(["lengthFt", "widthFt", "ceilingHeightFt"]);
    expect(after.footprintAssumed).toBe(false);
    expect(after.sourceWidenPct).toBeLessThan(before.sourceWidenPct);
    /* Earlier answers survive the refinement. */
    expect(after.ledger.observed.length).toBe(before.ledger.observed.length);
  });

  it("ignores a no-op patch and keeps a history trail otherwise", () => {
    const noop = refineWithAnswers(photoAnswers, { roomType: answer("kitchen") });
    expect(noop.changedKeys).toEqual([]);

    let history = emptyHistory("2026-01-01T00:00:00.000Z");
    history = recordRefinement(history, {
      kind: "answers",
      source: "photos",
      changedKeys: [],
      bandBefore: null,
      bandAfter: null,
      confidenceBefore: null,
      confidenceAfter: null,
    });
    expect(history.events).toHaveLength(0);

    history = recordRefinement(history, {
      kind: "measurements",
      source: "photos",
      changedKeys: ["lengthFt"],
      bandBefore: { low: 1, expected: 2, high: 3 },
      bandAfter: { low: 1.5, expected: 2, high: 2.5 },
      confidenceBefore: "low",
      confidenceAfter: "medium",
      at: "2026-01-02T00:00:00.000Z",
    });
    expect(history.events).toHaveLength(1);
    expect(history.events[0].kind).toBe("measurements");
  });
});
