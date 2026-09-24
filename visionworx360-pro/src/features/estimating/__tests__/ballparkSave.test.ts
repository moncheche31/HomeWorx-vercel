/**
 * Ballpark save repair.
 *
 * Root cause of the live "Something went wrong" failure: `rangeSnapshotSchema`
 * only described the tiered Good/Better/Best snapshot, so the ballpark card's
 * band payload failed input validation on `calculatedAt` and `tiers` before it
 * ever reached the database. These tests pin the accepted shape, the
 * idempotent overwrite and the bilingual copy.
 */
import { describe, expect, it } from "vitest";
import { rangeSnapshotSchema, updateEstimateSchema } from "../services/schemas";
import en from "@/i18n/locales/en-US/estimating.json";
import es from "@/i18n/locales/es-US/estimating.json";
import enBallpark from "@/i18n/locales/en-US/ballpark.json";
import esBallpark from "@/i18n/locales/es-US/ballpark.json";

const snapshot = (overrides: Record<string, unknown> = {}) => ({
  kind: "ballpark" as const,
  mode: "ballpark" as const,
  currency: "USD",
  calculatedAt: "2026-08-03T00:00:00.000Z",
  savedAt: "2026-08-03T00:00:00.000Z",
  intakeMethod: "onsite" as const,
  band: { low: 41000, expected: 52000, high: 68000 },
  confidence: "medium" as const,
  unknownWidenPct: 12,
  assumptions: [{ key: "roomSize", labelKey: "a", value: "16 ft", source: "assumed" }],
  unknowns: [{ questionId: "ceilingHeight", promptKey: "p", widenPct: 4 }],
  quantities: [{ itemKey: "drywall", quantity: 640 }],
  geometry: { lengthFt: 16, widthFt: 18, ceilingHeightFt: 8 },
  isSampleData: true,
  ...overrides,
});

describe("ballpark snapshot persistence", () => {
  it("accepts a ballpark band with no tiered pricing at all", () => {
    expect(() => rangeSnapshotSchema.parse(snapshot())).not.toThrow();
  });

  it("still accepts the tiered Good/Better/Best snapshot", () => {
    expect(() =>
      rangeSnapshotSchema.parse({
        currency: "USD",
        calculatedAt: "2026-08-03T00:00:00.000Z",
        tiers: [{ tier: "better", low: 1, mid: 2, high: 3 }],
      }),
    ).not.toThrow();
  });

  it("saves onto the existing estimate — no lines, no pricing completeness", () => {
    const input = updateEstimateSchema.parse({
      estimateId: "9c2a4e70-1d5b-4c3a-8f2e-2f0f8b0f1a11",
      rangeSnapshot: snapshot(),
    });
    expect(Object.keys(input)).toEqual(["estimateId", "rangeSnapshot"]);
  });

  it("is idempotent: a second save is the same single snapshot field", () => {
    const first = updateEstimateSchema.parse({
      estimateId: "9c2a4e70-1d5b-4c3a-8f2e-2f0f8b0f1a11",
      rangeSnapshot: snapshot(),
    });
    const second = updateEstimateSchema.parse({
      estimateId: "9c2a4e70-1d5b-4c3a-8f2e-2f0f8b0f1a11",
      rangeSnapshot: snapshot({ savedAt: "2026-08-04T00:00:00.000Z" }),
    });
    expect(Object.keys(second)).toEqual(Object.keys(first));
  });

  it("clearing the snapshot stays allowed", () => {
    expect(() => rangeSnapshotSchema.parse(null)).not.toThrow();
  });
});

describe("ballpark copy", () => {
  it("offers edit / refine / change-intake in both languages", () => {
    for (const bundle of [en, es]) {
      expect(bundle.ballparkCard.edit).toBeTruthy();
      expect(bundle.ballparkCard.refine).toBeTruthy();
      expect(bundle.ballparkCard.changeIntake).toBeTruthy();
      expect(bundle.mode.editBallpark).toBeTruthy();
      for (const key of ["auth", "locked", "missing", "validation", "database", "network"]) {
        expect((bundle.ballparkCard.saveError as Record<string, string>)[key]).toBeTruthy();
      }
    }
  });

  it("does not lead the photo path with realtor wording", () => {
    expect(enBallpark.intake.photos.hint.toLowerCase()).not.toContain("realtor");
    expect(esBallpark.intake.photos.hint.toLowerCase()).not.toContain("inmobiliar");
    expect(enBallpark.intake.photos.help.toLowerCase()).toContain("realtor");
    expect(esBallpark.intake.photos.help.toLowerCase()).toContain("inmobiliar");
  });
});
