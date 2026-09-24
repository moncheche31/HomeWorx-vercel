/**
 * Voice-First Ballpark Walkthrough Interview — Phase 1.
 *
 * Guards the promises the contractor is shown: the geometry is real math, the
 * allowances are documented, unknowns widen the range instead of inventing
 * precision, and recalculating never duplicates scope.
 */
import { describe, expect, it } from "vitest";
import {
  BATHROOM_ALLOWANCE,
  CLOSET_ALLOWANCE,
  PARTITION_ALLOWANCE_FACTOR,
  QUICK_BALLPARK_SCHEMA,
  buildBallpark,
  confidenceFor,
  deriveBallpark,
  mergeMeasuredGeometry,
  parseAnswer,
  parseCount,
  parseDimensionPair,
  parseFeet,
  unknownWidenPct,
  visibleQuestions,
  type BallparkAnswers,
} from "../index";
import en from "@/i18n/locales/en-US/ballpark.json";
import es from "@/i18n/locales/es-US/ballpark.json";

const answer = (value: string | number) => ({ status: "answered" as const, value });

const GARAGE: BallparkAnswers = {
  lengthFt: answer(18),
  widthFt: answer(16),
  ceilingHeightFt: answer(8),
  useOfSpace: answer("Guest suite"),
  bathroom: answer("full"),
  closet: answer("small"),
  partitions: answer("moderate"),
  raisedFloor: answer("yes"),
  insulationWalls: answer("yes"),
  insulationCeiling: answer("yes"),
  insulationFloor: answer("yes"),
  drywall: answer("walls_and_ceiling"),
  flooringQuality: answer("mid"),
  plumbing: answer("nearby"),
  electrical: answer("moderate"),
  newDoors: answer(1),
  newWindows: answer(1),
  finishLevel: answer("standard"),
};

describe("core geometry", () => {
  const derived = deriveBallpark(GARAGE);
  const m = derived.geometry.measurements;

  it("derives 288 SF floor, 288 SF ceiling, 68 LF perimeter and 544 SF gross wall from 16 × 18 × 8", () => {
    expect(m.floor_area.value).toBe(288);
    expect(m.ceiling_area.value).toBe(288);
    expect(m.perimeter.value).toBe(68);
    expect(m.wall_gross_area.value).toBe(544);
  });

  it("keeps the geometry in the shape the measurement record stores", () => {
    expect(derived.geometryInput).toMatchObject({ lengthFt: 18, widthFt: 16, ceilingHeightFt: 8 });
  });
});

describe("partition allowances", () => {
  const partitionFor = (choice: string) =>
    deriveBallpark({
      lengthFt: answer(18),
      widthFt: answer(16),
      ceilingHeightFt: answer(8),
      partitions: answer(choice),
      bathroom: answer("none"),
      closet: answer("none"),
    }).allowances.partitionLf;

  it("is deterministic and documented for none/light/moderate/extensive", () => {
    expect(PARTITION_ALLOWANCE_FACTOR).toEqual({ none: 0, light: 0.25, moderate: 0.5, extensive: 0.9 });
    expect(partitionFor("none")).toBe(0);
    expect(partitionFor("light")).toBe(17);
    expect(partitionFor("moderate")).toBe(34);
    expect(partitionFor("extensive")).toBe(61.2);
  });

  it("prefers an entered partition length over the allowance", () => {
    const derived = deriveBallpark({ ...GARAGE, partitionLfKnown: answer(22) });
    expect(derived.allowances.partitionLf).toBe(22);
    const assumption = derived.assumptions.find((a) => a.key === "partitions");
    expect(assumption?.source).toBe("answered");
  });
});

describe("bathroom and closet", () => {
  const derived = deriveBallpark(GARAGE);

  it("adds visible assumptions for the selected sizes", () => {
    const bath = derived.assumptions.find((a) => a.key === "bathroom");
    const closet = derived.assumptions.find((a) => a.key === "closet");
    expect(bath?.value).toContain(String(BATHROOM_ALLOWANCE.full.areaSf));
    expect(closet?.value).toContain(String(CLOSET_ALLOWANCE.small.areaSf));
  });

  it("adds their quantities: fixtures, enclosing partitions and shelving", () => {
    const keys = derived.quantities.map((q) => q.itemKey);
    expect(keys).toContain("bath.full_fixtures");
    expect(keys).toContain("closet.shelving");
    /* 34 LF allowance + 26 LF bath + 12 LF closet */
    expect(derived.allowances.partitionLf).toBe(72);
  });

  it("adds nothing when both are none", () => {
    const none = deriveBallpark({ ...GARAGE, bathroom: answer("none"), closet: answer("none") });
    const keys = none.quantities.map((q) => q.itemKey);
    expect(keys).not.toContain("bath.full_fixtures");
    expect(keys).not.toContain("closet.shelving");
  });
});

describe("unknowns widen rather than invent", () => {
  const complete = buildBallpark(GARAGE);
  const vague = buildBallpark({
    lengthFt: answer(18),
    widthFt: answer(16),
    ceilingHeightFt: answer(8),
    partitions: answer("moderate"),
    raisedFloor: answer("unsure"),
    insulationWalls: answer("unsure"),
  });

  it("gives a complete interview a tight, confident band", () => {
    expect(complete.unknownWidenPct).toBe(0);
    expect(complete.confidence).toBe("high");
    expect(complete.band.low).toBeLessThan(complete.band.expected);
    expect(complete.band.high).toBeGreaterThan(complete.band.expected);
  });

  it("widens the band and lowers confidence when answers are missing", () => {
    expect(vague.unknownWidenPct).toBeGreaterThan(complete.unknownWidenPct);
    expect(vague.confidence).not.toBe("high");
    const width = (r: typeof complete) => (r.band.high - r.band.low) / r.band.expected;
    expect(width(vague)).toBeGreaterThan(width(complete));
  });

  it("never converts an unsure answer into an exact measurement", () => {
    const derived = deriveBallpark({ ...GARAGE, raisedFloor: answer("unsure") });
    const raised = derived.quantities.find((q) => q.itemKey === "framing.raised_floor");
    expect(raised?.isAssumed).toBe(true);
    expect(derived.unknowns.map((u) => u.questionId)).toContain("raisedFloor");
  });

  it("caps the total widening and reports low confidence without dimensions", () => {
    expect(unknownWidenPct(deriveBallpark({}))).toBeLessThanOrEqual(30);
    expect(confidenceFor(0, false)).toBe("low");
  });
});

describe("idempotence and continuity", () => {
  it("recalculating produces identical scope and costs", () => {
    const first = buildBallpark(GARAGE);
    const second = buildBallpark(GARAGE);
    expect(second.quantities).toEqual(first.quantities);
    expect(second.band).toEqual(first.band);
    expect(second.lines.length).toBe(first.lines.length);
  });

  it("emits one line per pricebook item, never duplicates", () => {
    const result = buildBallpark(GARAGE);
    expect(new Set(result.lines.map((l) => l.id)).size).toBe(result.lines.length);
  });

  it("lets detailed measurements replace the assumptions cleanly", () => {
    const merged = mergeMeasuredGeometry(GARAGE, {
      lengthFt: 20,
      widthFt: 15,
      ceilingHeightFt: 9,
      interiorPartitionLf: 40,
      openings: [{ kind: "door", count: 2, widthFt: 3, heightFt: 6.83 }],
    });
    const derived = deriveBallpark(merged);
    expect(derived.geometry.measurements.floor_area.value).toBe(300);
    expect(derived.allowances.partitionLf).toBe(40);
    /* Unrelated answers survive the merge. */
    expect(merged.finishLevel).toEqual(GARAGE.finishLevel);
    /* Merging the same record again changes nothing. */
    expect(mergeMeasuredGeometry(merged, { lengthFt: 20, widthFt: 15, ceilingHeightFt: 9, interiorPartitionLf: 40, openings: [{ kind: "door", count: 2, widthFt: 3, heightFt: 6.83 }] })).toEqual(merged);
  });

  it("keeps contractor answers untouched when the record has no value", () => {
    expect(mergeMeasuredGeometry(GARAGE, { lengthFt: null, widthFt: null, ceilingHeightFt: null })).toEqual(GARAGE);
  });
});

describe("voice parsing", () => {
  it("reads 'sixteen by eighteen'", () => {
    expect(parseDimensionPair("sixteen by eighteen")).toEqual({ lengthFt: 18, widthFt: 16 });
    expect(parseDimensionPair("16 x 18 feet")).toEqual({ lengthFt: 18, widthFt: 16 });
  });

  it("reads 'eight-foot ceiling' and feet with inches", () => {
    expect(parseFeet("eight foot ceiling")).toBe(8);
    expect(parseFeet("twelve feet six inches")).toBe(12.5);
    expect(parseFeet("twelve and a half feet")).toBe(12.5);
  });

  it("reads the Spanish equivalents", () => {
    expect(parseDimensionPair("dieciseis por dieciocho")).toEqual({ lengthFt: 18, widthFt: 16 });
    expect(parseFeet("techo de ocho pies")).toBe(8);
    expect(parseCount("dos puertas")).toBe(2);
    expect(parseCount("ninguna")).toBe(0);
  });

  it("selects the right option in both languages", () => {
    const bathroom = QUICK_BALLPARK_SCHEMA.questions.find((q) => q.id === "bathroom")!;
    expect(parseAnswer(bathroom, "we need a full bath", "en-US").value).toBe("full");
    expect(parseAnswer(bathroom, "un bano completo", "es-US").value).toBe("full");
  });

  it("returns unknown instead of guessing", () => {
    const height = QUICK_BALLPARK_SCHEMA.questions.find((q) => q.id === "ceilingHeightFt")!;
    expect(parseAnswer(height, "I'm not sure", "en-US")).toMatchObject({ value: null, unknown: true });
    expect(parseAnswer(height, "no se", "es-US")).toMatchObject({ value: null, unknown: true });
    expect(parseAnswer(height, "the ceiling is fine", "en-US").value).toBeNull();
  });

  it("keeps 'unsure' as a real choice where it is offered", () => {
    const raised = QUICK_BALLPARK_SCHEMA.questions.find((q) => q.id === "raisedFloor")!;
    expect(parseAnswer(raised, "not sure", "en-US")).toMatchObject({ value: "unsure", unknown: false });
  });
});

describe("interview schema", () => {
  it("is data-driven: conditional questions appear only when they apply", () => {
    const withoutPartitions = visibleQuestions(QUICK_BALLPARK_SCHEMA, { partitions: answer("none") });
    expect(withoutPartitions.map((q) => q.id)).not.toContain("partitionLfKnown");
    const withPartitions = visibleQuestions(QUICK_BALLPARK_SCHEMA, { partitions: answer("moderate") });
    expect(withPartitions.map((q) => q.id)).toContain("partitionLfKnown");
  });

  it("hides floor insulation once a slab floor is confirmed", () => {
    const ids = visibleQuestions(QUICK_BALLPARK_SCHEMA, { raisedFloor: answer("no") }).map((q) => q.id);
    expect(ids).not.toContain("insulationFloor");
  });

  it("resolves every EN and ES string it references", () => {
    const get = (bundle: Record<string, unknown>, path: string) =>
      path.split(".").reduce<unknown>((acc, part) => (acc as Record<string, unknown>)?.[part], bundle);
    const keys = QUICK_BALLPARK_SCHEMA.questions.flatMap((q) => [
      q.promptKey,
      ...(q.hintKey ? [q.hintKey] : []),
      ...(q.options ?? []).map((o) => o.labelKey),
    ]);
    for (const key of keys) {
      expect(typeof get(en, key), `en ${key}`).toBe("string");
      expect(typeof get(es, key), `es ${key}`).toBe("string");
    }
  });
});

describe("sample-data honesty", () => {
  it("always discloses that the pricing is illustrative", () => {
    const result = buildBallpark(GARAGE);
    expect(result.isSampleData).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain("sample-data");
  });

  it("reports missing dimensions instead of pricing thin air", () => {
    const empty = buildBallpark({});
    expect(empty.warnings.map((w) => w.code)).toContain("no-dimensions");
    expect(empty.confidence).toBe("low");
  });
});
