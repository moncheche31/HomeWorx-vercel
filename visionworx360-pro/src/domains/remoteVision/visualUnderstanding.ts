/**
 * STRUCTURED MULTIMODAL PROJECT UNDERSTANDING (Item A).
 *
 * What a real vision model is allowed to return. Deliberately NOT an estimate:
 * the model reports what is VISIBLE (before photos, video keyframes), what is
 * INTENDED (after renderings), what is DIMENSIONAL (floor plans, only where a
 * dimension is printed), and what it CANNOT know. Pricing stays with the
 * canonical catalog/cost graph.
 *
 * Hidden-condition facts (load-bearing status, wiring condition, pipe routing,
 * member sizes, asbestos, code compliance) may only ever appear as
 * `hiddenConditionWarnings` or `measurementTargets` — never as observations.
 *
 * Pure module: no React, no IO.
 */

import { z } from "zod";

export type VisualEvidenceKind =
  | "before_photo"
  | "after_rendering"
  | "floor_plan"
  | "video_keyframe";

/** What kind of truth an observation carries. */
export type ObservationNature =
  /** Visible in a before photo / keyframe: an existing condition. */
  | "observed_existing"
  /** Visible in a rendering: DESIGN INTENT, never proof of existing conditions. */
  | "design_intent"
  /** Printed on a drawing and legible. */
  | "drawing_dimension"
  /** Reasoned from the above; weakest visual authority. */
  | "inferred";

/**
 * PHASE 2 — object-level identity.
 *
 * A region pins an observation to a specific PLACE in a specific image, so
 * narration like "that door" can bind to one object instead of colliding on a
 * shared ontology subject key. Coordinates are normalized 0..1 of the image
 * (x, y = top-left corner), so they survive any display size.
 *
 * A region carries identity only. It grants no authority: a boxed object is
 * still a visual observation and still cannot set a price on its own.
 */
export const visualRegionSchema = z.object({
  /** Stable id for this detected object within the analysis run. */
  objectId: z.string(),
  /** Media id the box belongs to; must be one of the analyzed ids. */
  mediaId: z.string(),
  /** Short human label for the boxed object ("left door", "base cabinets"). */
  label: z.string(),
  /*
   * Accepted as plain numbers, NOT as 0..1 here. Gemini routinely answers in
   * its own 0..1000 box convention, and a hard 0..1 bound rejected the entire
   * analysis payload over box coordinates — losing every observation for a
   * cosmetic detail. `sanitizeRegions` rescales and clamps instead.
   */
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type VisualRegion = z.infer<typeof visualRegionSchema>;

export const visualObservationSchema = z.object({
  /** Canonical ontology subject key when the model can name one, else null. */
  subjectKey: z.string().nullable(),
  /** Free-text object the model saw ("upper cabinets", "carpeted floor"). */
  object: z.string(),
  nature: z.enum(["observed_existing", "design_intent", "drawing_dimension", "inferred"]),
  /** Action the visual delta suggests; null when it is condition only. */
  actionKey: z.string().nullable(),
  /** Media ids this observation came from. */
  mediaIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  /** Short human-readable justification (the "evidence snippet"). */
  note: z.string().nullable(),
  /**
   * Where in the media this object is. Optional: rows stored before Phase 2
   * have none, and a model may legitimately return none for a scene-level fact.
   */
  regions: z.array(visualRegionSchema).optional(),
});
export type VisualObservation = z.infer<typeof visualObservationSchema>;


export const transformationCandidateSchema = z.object({
  subjectKey: z.string().nullable(),
  existingObject: z.string(),
  proposedObject: z.string(),
  actionKey: z.string().nullable(),
  mediaIds: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  note: z.string().nullable(),
});
export type TransformationCandidate = z.infer<typeof transformationCandidateSchema>;

export const hiddenConditionWarningSchema = z.object({
  topic: z.string(),
  message: z.string(),
  /** Whether resolving it is likely to move the price materially. */
  priceSignificant: z.boolean(),
});
export type HiddenConditionWarning = z.infer<typeof hiddenConditionWarningSchema>;

export const measurementTargetSchema = z.object({
  subjectKey: z.string().nullable(),
  label: z.string(),
  /** linear | area | count | volume — the family the number must be in. */
  unitFamily: z.enum(["linear", "area", "count", "volume"]),
  reason: z.string(),
});
export type MeasurementTarget = z.infer<typeof measurementTargetSchema>;

export const visualUnderstandingSchema = z.object({
  observations: z.array(visualObservationSchema),
  transformations: z.array(transformationCandidateSchema),
  hiddenConditionWarnings: z.array(hiddenConditionWarningSchema),
  measurementTargets: z.array(measurementTargetSchema),
});
export type VisualUnderstanding = z.infer<typeof visualUnderstandingSchema>;

export type VisualUnderstandingStatus =
  | "ok"
  /** A run is in flight. Any observations carried alongside are the PREVIOUS ones. */
  | "analyzing"
  /** No media was supplied, so nothing visual could be analyzed. */
  | "no_media"
  /** No multimodal provider is configured for this deployment. */
  | "provider_unavailable"
  /** The provider was reachable but failed (rate limit, upstream, schema). */
  | "provider_error";

export interface VisualUnderstandingResult extends VisualUnderstanding {
  status: VisualUnderstandingStatus;
  /** Model/provider that produced this, for the audit trail. */
  providerId: string | null;
  /** Machine-readable failure detail when `status !== "ok"`. */
  errorCode?: string | null;
  /**
   * True when the observations describe an EARLIER media set than the current
   * one. Stale facts are still shown (never blanked) but are labelled, and a
   * fresh run replaces them on success.
   */
  stale?: boolean;
}

export const EMPTY_VISUAL_UNDERSTANDING: VisualUnderstanding = {
  observations: [],
  transformations: [],
  hiddenConditionWarnings: [],
  measurementTargets: [],
};

export function emptyVisualUnderstanding(
  status: VisualUnderstandingStatus,
  providerId: string | null = null,
  errorCode: string | null = null,
): VisualUnderstandingResult {
  return { ...EMPTY_VISUAL_UNDERSTANDING, status, providerId, errorCode, stale: false };
}

/**
 * Mark an existing result as belonging to a superseded media set, WITHOUT
 * discarding its facts. This is the non-destructive replacement for the old
 * "blank it on any media change" behaviour.
 */
export function markVisualUnderstandingStale(
  previous: VisualUnderstandingResult,
): VisualUnderstandingResult {
  if (previous.observations.length === 0) return emptyVisualUnderstanding("analyzing");
  return { ...previous, status: "analyzing", stale: true };
}


/**
 * JSON Schema handed to the model. Strict: every property required, no extras,
 * so the model cannot invent a "price" or "quantity" field we would then trust.
 */
export const VISUAL_UNDERSTANDING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observations", "transformations", "hiddenConditionWarnings", "measurementTargets"],
  properties: {
    observations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "subjectKey",
          "object",
          "nature",
          "actionKey",
          "mediaIds",
          "confidence",
          "note",
          "regions",
        ],
        properties: {
          subjectKey: { type: ["string", "null"] },
          object: { type: "string" },
          nature: {
            type: "string",
            enum: ["observed_existing", "design_intent", "drawing_dimension", "inferred"],
          },
          actionKey: { type: ["string", "null"] },
          mediaIds: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          note: { type: ["string", "null"] },
          regions: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["objectId", "mediaId", "label", "x", "y", "width", "height"],
              properties: {
                objectId: { type: "string" },
                mediaId: { type: "string" },
                label: { type: "string" },
                x: { type: "number" },
                y: { type: "number" },
                width: { type: "number" },
                height: { type: "number" },
              },
            },
          },
        },
      },
    },
    transformations: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "subjectKey",
          "existingObject",
          "proposedObject",
          "actionKey",
          "mediaIds",
          "confidence",
          "note",
        ],
        properties: {
          subjectKey: { type: ["string", "null"] },
          existingObject: { type: "string" },
          proposedObject: { type: "string" },
          actionKey: { type: ["string", "null"] },
          mediaIds: { type: "array", items: { type: "string" } },
          confidence: { type: "number" },
          note: { type: ["string", "null"] },
        },
      },
    },
    hiddenConditionWarnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "message", "priceSignificant"],
        properties: {
          topic: { type: "string" },
          message: { type: "string" },
          priceSignificant: { type: "boolean" },
        },
      },
    },
    measurementTargets: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["subjectKey", "label", "unitFamily", "reason"],
        properties: {
          subjectKey: { type: ["string", "null"] },
          label: { type: "string" },
          unitFamily: { type: "string", enum: ["linear", "area", "count", "volume"] },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

/**
 * Facts a model is never allowed to assert as observed. Anything matching these
 * is downgraded into a hidden-condition warning by `sanitizeUnderstanding`.
 */
const HIDDEN_FACT_PATTERNS = [
  /\bload[-\s]?bearing\b/i,
  /\bnon[-\s]?bearing\b/i,
  /\basbestos\b/i,
  /\blead\s+paint\b/i,
  /\bcode\s+complian\w+\b/i,
  /\bwir(e|ing)\s+(condition|gauge|is)\b/i,
  /\bpipe\s+rout\w+\b/i,
  /\bstructural\s+member\s+size\b/i,
  /\bmold\b/i,
];

/** 0..1 clamp for a normalized box coordinate. */
function unit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/**
 * Rescale a box the model expressed in a pixel-style convention (Gemini's
 * 0..1000 grid, or raw pixels) back into 0..1 fractions of the image.
 */
function boxScale(region: { x: number; y: number; width: number; height: number }): number {
  const largest = Math.max(
    Math.abs(Number(region.x) || 0),
    Math.abs(Number(region.y) || 0),
    Math.abs(Number(region.width) || 0),
    Math.abs(Number(region.height) || 0),
  );
  if (largest <= 1) return 1;
  if (largest <= 1000) return 1000;
  return largest;
}

/**
 * Keep only boxes that point at media we actually analyzed, clamp them into the
 * image, drop degenerate boxes, and guarantee every surviving region has a
 * stable, unique objectId (models frequently omit or repeat it).
 */
export function sanitizeRegions(
  observation: VisualObservation,
  mediaKindById: Record<string, VisualEvidenceKind>,
): VisualRegion[] {
  const regions = observation.regions ?? [];
  const seen = new Set<string>();
  const out: VisualRegion[] = [];
  for (const [index, region] of regions.entries()) {
    if (!region || typeof region.mediaId !== "string") continue;
    if (!mediaKindById[region.mediaId]) continue;
    const scale = boxScale(region);
    const x = unit(Number(region.x) / scale);
    const y = unit(Number(region.y) / scale);
    const width = Math.min(unit(Number(region.width) / scale), 1 - x);
    const height = Math.min(unit(Number(region.height) / scale), 1 - y);
    /* A zero-area box identifies nothing. */
    if (width <= 0.001 || height <= 0.001) continue;
    let objectId =
      typeof region.objectId === "string" && region.objectId.trim().length > 0
        ? region.objectId.trim()
        : `${region.mediaId}:obj-${index}`;
    while (seen.has(objectId)) objectId = `${objectId}-${index}`;
    seen.add(objectId);
    out.push({
      objectId,
      mediaId: region.mediaId,
      label:
        typeof region.label === "string" && region.label.trim().length > 0
          ? region.label.trim()
          : observation.object,
      x,
      y,
      width,
      height,
    });
  }
  return out;
}

/**
 * Enforce the media-authority rules on whatever the model returned:
 *  - hidden facts become warnings, never observations;
 *  - rendering-sourced observations are forced to `design_intent`;
 *  - confidence is clamped, unknown subject keys are nulled by the caller.
 */
export function sanitizeUnderstanding(
  raw: VisualUnderstanding,
  mediaKindById: Record<string, VisualEvidenceKind>,
): VisualUnderstanding {
  const warnings: HiddenConditionWarning[] = [...raw.hiddenConditionWarnings];
  const observations: VisualObservation[] = [];

  for (const observation of raw.observations) {
    const text = `${observation.object} ${observation.note ?? ""}`;
    const hidden = HIDDEN_FACT_PATTERNS.find((p) => p.test(text));
    if (hidden) {
      warnings.push({
        topic: observation.subjectKey ?? observation.object,
        message: `Cannot be confirmed from media: ${observation.object}${
          observation.note ? ` — ${observation.note}` : ""
        }`,
        priceSignificant: true,
      });
      continue;
    }
    const kinds = observation.mediaIds.map((id) => mediaKindById[id]).filter(Boolean);
    const renderingOnly = kinds.length > 0 && kinds.every((k) => k === "after_rendering");
    observations.push({
      ...observation,
      nature: renderingOnly ? "design_intent" : observation.nature,
      confidence: Math.max(0, Math.min(1, Number(observation.confidence) || 0)),
      regions: sanitizeRegions(observation, mediaKindById),
    });
  }

  return {
    observations,
    transformations: raw.transformations.map((t) => ({
      ...t,
      confidence: Math.max(0, Math.min(1, Number(t.confidence) || 0)),
    })),
    hiddenConditionWarnings: warnings,
    measurementTargets: raw.measurementTargets,
  };
}
