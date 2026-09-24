/**
 * Ballpark refinement regressions:
 *
 * 1) Opening "Edit Assumptions" / "See ballpark range" must keep the CURRENT
 *    saved snapshot as the baseline — never the original/history band.
 * 2) Normal contractor phrasing must parse, typed exactly as it is spoken.
 */
import { describe, expect, it } from "vitest";
import {
  currentBallparkBand,
  resolveBallparkBaseline,
  resolvePreviewBand,
} from "@/domains/ballpark/previewBaseline";
import { parseAnswer } from "@/domains/ballpark/parse";
import { QUICK_BALLPARK_SCHEMA } from "@/domains/ballpark/questions";

const band = (low: number, expected: number, high: number) => ({ low, expected, high });

const CURRENT = band(36500, 50038.71, 65500);
const ORIGINAL = band(34500, 38809.02, 43000);

const savedSnapshot = {
  kind: "ballpark",
  engineVersion: 2,
  band: CURRENT,
  previous: { band: ORIGINAL },
  originalBallpark: { band: ORIGINAL },
};

const question = (id: string) => QUICK_BALLPARK_SCHEMA.questions.find((q) => q.id === id)!;

describe("ballpark preview baseline", () => {
  const staleLiveSession = {
    rangeSnapshot: { band: ORIGINAL },
    draftPreview: { band: band(28500, 31682.12, 35000) },
    answers: { lengthFt: { status: "answered", value: 18, transcript: "18 feet" } },
  };

  it("uses the live-shaped estimate snapshot before a stale durable session", () => {
    const estimateBefore = structuredClone(savedSnapshot);
    const sessionBefore = structuredClone(staleLiveSession);
    const res = resolveBallparkBaseline({
      estimateSnapshot: savedSnapshot,
      sessionSnapshot: staleLiveSession.rangeSnapshot,
      computedBand: ORIGINAL,
      factsChanged: false,
    });

    expect(res).toMatchObject({ band: CURRENT, savedBand: CURRENT, isPreview: false, source: "estimate" });
    expect(savedSnapshot).toEqual(estimateBefore);
    expect(staleLiveSession).toEqual(sessionBefore);
  });

  it("shows an uncommitted refinement while retaining the estimate baseline", () => {
    const refined = band(41000, 56000, 72000);
    const res = resolveBallparkBaseline({
      estimateSnapshot: savedSnapshot,
      sessionSnapshot: staleLiveSession.rangeSnapshot,
      computedBand: refined,
      factsChanged: true,
    });

    expect(res).toMatchObject({ band: refined, savedBand: CURRENT, isPreview: true, source: "estimate" });
    expect(savedSnapshot.band).toEqual(CURRENT);
    expect(staleLiveSession.rangeSnapshot.band).toEqual(ORIGINAL);
  });

  it("uses the durable range only for a standalone flow without an estimate snapshot", () => {
    const res = resolveBallparkBaseline({
      estimateSnapshot: null,
      sessionSnapshot: staleLiveSession.rangeSnapshot,
      computedBand: band(1, 2, 3),
      factsChanged: false,
    });
    expect(res).toMatchObject({ band: ORIGINAL, source: "session" });
  });

  it("invalidates a stale durable range when the scope schema changes", () => {
    const computed = band(7000, 7986, 9200);
    const res = resolveBallparkBaseline({
      estimateSnapshot: null,
      sessionSnapshot: staleLiveSession.rangeSnapshot,
      computedBand: computed,
      factsChanged: false,
      schemaKey: "quick_ballpark_v1.scoped.bookcases",
      savedSchemaKey: "quick_ballpark_v1.scoped.garage",
    });
    expect(res).toMatchObject({ band: computed, savedBand: null, isPreview: false, source: "computed" });
  });

  it("reads only the current band, never history", () => {
    expect(currentBallparkBand(savedSnapshot)).toEqual(CURRENT);
  });

  it("keeps the current engine-v2 snapshot as the baseline when refinement opens", () => {
    const res = resolvePreviewBand({
      savedSnapshot,
      computedBand: ORIGINAL,
      factsChanged: false,
    });
    expect(res.band).toEqual(CURRENT);
    expect(res.isPreview).toBe(false);
  });

  it("shows a computed preview against the estimate baseline when the interview schema changes", () => {
    const computed = band(7000, 7986, 9200);
    const res = resolvePreviewBand({
      savedSnapshot,
      computedBand: computed,
      factsChanged: false,
      schemaKey: "quick_ballpark_v1.scoped.bookcases",
      savedSchemaKey: "quick_ballpark_v1.scoped.garage",
    });
    expect(res.band).toEqual(computed);
    expect(res.savedBand).toEqual(CURRENT);
    expect(res.isPreview).toBe(true);
  });

  it("does not revert to the original band just because the intake engine recomputes", () => {
    const res = resolvePreviewBand({ savedSnapshot, computedBand: ORIGINAL, factsChanged: false });
    expect(res.band).not.toEqual(ORIGINAL);
  });

  it("shows a refined preview that differs from the saved band without committing it", () => {
    const refined = band(40000, 55000, 70000);
    const res = resolvePreviewBand({ savedSnapshot, computedBand: refined, factsChanged: true });
    expect(res.band).toEqual(refined);
    expect(res.savedBand).toEqual(CURRENT);
    expect(res.isPreview).toBe(true);
    /* Previewing must not mutate the stored snapshot or its history. */
    expect(savedSnapshot.band).toEqual(CURRENT);
    expect(savedSnapshot.originalBallpark.band).toEqual(ORIGINAL);
  });

  it("falls back to the computed band only when nothing is saved yet", () => {
    const res = resolvePreviewBand({ savedSnapshot: null, computedBand: ORIGINAL, factsChanged: false });
    expect(res.band).toEqual(ORIGINAL);
    expect(res.savedBand).toBeNull();
    expect(res.isPreview).toBe(false);
  });
});

describe("ballpark answer parsing", () => {
  const dim = question("ceilingHeightFt");

  it.each(["18 feet", "18 ft", "18'", "about 16 feet", "20 linear feet", "3", "12 foot ceiling"])(
    "parses the typed dimension %s",
    (text) => {
      const parsed = parseAnswer(dim, text, "en-US");
      expect(typeof parsed.value).toBe("number");
      expect(parsed.value as number).toBeGreaterThan(0);
    },
  );

  it("parses paired dimensions on the paired question", () => {
    for (const text of ["18 by 16", "18 x 16", "eighteen by sixteen"]) {
      const parsed = parseAnswer(question("lengthFt"), text, "en-US");
      expect(parsed.pair).toEqual({ lengthFt: 18, widthFt: 16 });
    }
  });

  it("parses speech transcripts identically to typed text", () => {
    const typed = parseAnswer(dim, "12 foot ceiling", "en-US");
    const spoken = parseAnswer(dim, "twelve foot ceiling", "en-US");
    expect(spoken.value).toBe(typed.value);
  });

  it("saves free-text questions verbatim", () => {
    const parsed = parseAnswer(question("useOfSpace"), "master suite with a sitting area", "en-US");
    expect(parsed.value).toBe("master suite with a sitting area");
    expect(parsed.unknown).toBe(false);
  });

  it("accepts natural phrasing on choice questions", () => {
    expect(parseAnswer(question("bathroom"), "we're adding a full bath in there", "en-US").value)
      .toBe("full");
    expect(parseAnswer(question("drywall"), "just walls, no ceiling", "en-US").value)
      .toBe("walls_only");
    expect(parseAnswer(question("closet"), "a big walk-in closet", "en-US").value).toBe("large");
  });

  it("reports a real failure only when the answer cannot be interpreted", () => {
    const parsed = parseAnswer(dim, "not applicable here", "en-US");
    expect(parsed.value).toBeNull();
    expect(parsed.unknown).toBe(false);
  });

  it("treats an explicit don't-know as unknown, not as a parse failure", () => {
    const parsed = parseAnswer(dim, "no idea", "en-US");
    expect(parsed.unknown).toBe(true);
  });
});
