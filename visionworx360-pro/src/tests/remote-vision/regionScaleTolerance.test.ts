/**
 * REGRESSION — a box coordinate convention must never destroy an analysis.
 *
 * Gemini answers bounding boxes on its own 0..1000 grid. The region schema
 * required 0..1, so the whole structured payload failed validation and the run
 * was recorded as `provider_error` / zero observations — every real photo of
 * Michael's produced nothing. Coordinates are now rescaled and clamped in the
 * sanitizer rather than rejected up front.
 */

import { describe, expect, it } from "vitest";
import {
  sanitizeRegions,
  visualUnderstandingSchema,
  type VisualObservation,
} from "@/domains/remoteVision/visualUnderstanding";

const MEDIA = { "photo-1": "before_photo" } as const;

function observation(regions: unknown[]): VisualObservation {
  return {
    subjectKey: "kitchen_cabinets",
    object: "wall cabinets",
    nature: "observed_existing",
    actionKey: null,
    mediaIds: ["photo-1"],
    confidence: 0.9,
    note: null,
    regions,
  } as unknown as VisualObservation;
}

describe("bounding box scale tolerance", () => {
  it("parses a payload whose boxes use the 0..1000 grid", () => {
    const parsed = visualUnderstandingSchema.safeParse({
      observations: [
        observation([
          { objectId: "cab1", mediaId: "photo-1", label: "wall cabinet", x: 50, y: 180, width: 260, height: 270 },
        ]),
      ],
      transformations: [],
      hiddenConditionWarnings: [],
      measurementTargets: [],
      clarifyingQuestions: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("rescales a 0..1000 box into image fractions", () => {
    const [region] = sanitizeRegions(
      observation([
        { objectId: "cab1", mediaId: "photo-1", label: "wall cabinet", x: 500, y: 250, width: 200, height: 100 },
      ]),
      MEDIA as unknown as Record<string, "before_photo">,
    );
    expect(region).toMatchObject({ x: 0.5, y: 0.25, width: 0.2, height: 0.1 });
  });

  it("leaves an already-normalized box untouched", () => {
    const [region] = sanitizeRegions(
      observation([
        { objectId: "cab1", mediaId: "photo-1", label: "wall cabinet", x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
      ]),
      MEDIA as unknown as Record<string, "before_photo">,
    );
    expect(region).toMatchObject({ x: 0.1, y: 0.2, width: 0.3, height: 0.4 });
  });

  it("rescales raw pixel coordinates by the largest extent", () => {
    const [region] = sanitizeRegions(
      observation([
        { objectId: "a", mediaId: "photo-1", label: "cabinet", x: 0, y: 0, width: 2048, height: 1024 },
      ]),
      MEDIA as unknown as Record<string, "before_photo">,
    );
    expect(region?.width).toBeCloseTo(1, 5);
    expect(region?.height).toBeCloseTo(0.5, 5);
  });

  it("still drops degenerate and unknown-media boxes", () => {
    const regions = sanitizeRegions(
      observation([
        { objectId: "a", mediaId: "photo-1", label: "x", x: 10, y: 10, width: 0, height: 100 },
        { objectId: "b", mediaId: "other", label: "y", x: 10, y: 10, width: 100, height: 100 },
      ]),
      MEDIA as unknown as Record<string, "before_photo">,
    );
    expect(regions).toHaveLength(0);
  });
});
