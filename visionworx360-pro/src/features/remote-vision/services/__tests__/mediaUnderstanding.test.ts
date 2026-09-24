import { describe, expect, it } from "vitest";
import {
  hasUnderstandingContent,
  mapUnderstandingRow,
  mediaFingerprint,
  mediaUnderstandingPatchSchema,
  understandingPatchToRow,
  EMPTY_MEDIA_UNDERSTANDING,
} from "../mediaUnderstanding.shared";

const observation = {
  subjectKey: "wall.interior",
  object: "6 ft wall between kitchen and closet",
  nature: "observed_existing" as const,
  actionKey: "demolish",
  mediaIds: ["m1"],
  confidence: 0.8,
  note: "visible in before photo",
};

describe("durable project media understanding", () => {
  it("round-trips narration and observations", () => {
    const row = {
      project_id: "p1",
      spoken_narration: "On this wall we're building the bookcases.",
      visual_observations: [observation],
      media_fingerprint: "m1",
      visual_status: "ok",
      analyzed_at: "2026-01-01T00:00:00.000Z",
    };
    const record = mapUnderstandingRow(row);
    expect(record.spokenNarration).toContain("bookcases");
    expect(record.visualObservations).toHaveLength(1);
    expect(record.visualStatus).toBe("ok");
    expect(hasUnderstandingContent(record)).toBe(true);
  });

  it("drops malformed observations instead of throwing", () => {
    const record = mapUnderstandingRow({
      project_id: "p1",
      visual_observations: [observation, { object: 42 }, null],
    });
    expect(record.visualObservations).toHaveLength(1);
  });

  it("falls back to no_media for unknown or missing status", () => {
    expect(mapUnderstandingRow({ visual_status: "bogus" }).visualStatus).toBe("no_media");
    expect(mapUnderstandingRow({}).visualStatus).toBe("no_media");
    expect(hasUnderstandingContent(EMPTY_MEDIA_UNDERSTANDING)).toBe(false);
  });

  it("patches narration without clearing observations", () => {
    const columns = understandingPatchToRow({ spokenNarration: "new words" });
    expect(columns).toEqual({ spoken_narration: "new words" });
    expect("visual_observations" in columns).toBe(false);
  });

  it("stamps analyzed_at only when observations are written", () => {
    expect(understandingPatchToRow({ visualStatus: "ok" }).analyzed_at).toBeUndefined();
    expect(understandingPatchToRow({ visualObservations: [] }).analyzed_at).toBeTypeOf("string");
  });

  it("fingerprints media order-independently", () => {
    expect(mediaFingerprint(["b", "a"])).toBe(mediaFingerprint(["a", "b"]));
    expect(mediaFingerprint([])).toBeNull();
  });

  it("rejects observations that do not match the visual schema", () => {
    const result = mediaUnderstandingPatchSchema.safeParse({
      visualObservations: [{ object: "wall" }],
    });
    expect(result.success).toBe(false);
  });
});
