/**
 * REAL MULTIMODAL VISUAL ANALYSIS — server side.
 *
 * The images themselves are sent to a multimodal model through the Lovable AI
 * gateway, which returns STRICT structured construction observations. This is
 * genuine pixel analysis: before photos, after renderings, floor plans and
 * video keyframes are all uploaded as image content parts.
 *
 * Boundaries enforced here (never negotiable in a prompt alone — the caller
 * also sanitizes the result):
 *  - before photo / keyframe = visible existing condition;
 *  - after rendering        = design intent only;
 *  - floor plan             = dimensions only where printed and legible;
 *  - hidden conditions (load-bearing, wiring, asbestos, member sizes, code)
 *    are warnings/questions, never observations;
 *  - the model returns NO prices and NO quantities it cannot read.
 */

import {
  sanitizeUnderstanding,
  visualUnderstandingSchema,
  VISUAL_UNDERSTANDING_JSON_SCHEMA,
  emptyVisualUnderstanding,
  type VisualEvidenceKind,
  type VisualUnderstandingResult,
} from "@/domains/remoteVision/visualUnderstanding";
import { ONTOLOGY } from "@/domains/remoteVision/ontology";

/** Multimodal model verified available on the gateway for image input. */
export const VISION_MODEL = "google/gemini-3-flash";
export const VISION_PROVIDER_ID = `lovable-ai:${VISION_MODEL}`;

const MAX_IMAGES = 12;
const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface VisionImageInput {
  /** Media id (or `${mediaId}#frame-n` for a keyframe) echoed back as evidence. */
  id: string;
  kind: VisualEvidenceKind;
  /** `data:image/...;base64,...` */
  dataUrl: string;
}

export interface VisionUnderstandingInput {
  images: VisionImageInput[];
  transcript: string;
  measurementFacts: string;
}

const SUBJECT_KEYS = ONTOLOGY.map((s) => s.subjectKey).join(", ");

function systemPrompt(): string {
  return [
    "You are a construction estimator's visual analyst for a residential remodeling app.",
    "You receive jobsite media and the contractor's own words for ONE project.",
    "Report only what the pixels support. Never output prices, never output a quantity you cannot read off a drawing.",
    "Media authority rules:",
    "- before_photo / video_keyframe: visible EXISTING conditions (nature=observed_existing).",
    "- after_rendering: DESIGN INTENT only (nature=design_intent). It is never proof of existing or hidden conditions.",
    "- floor_plan: dimensional/layout evidence only where a dimension is printed and legible (nature=drawing_dimension). Never infer scale.",
    "You must NEVER assert as observed: load-bearing status, wiring condition, pipe routing, structural member size, asbestos or lead, wall composition, or code compliance.",
    "Put those in hiddenConditionWarnings instead.",
    "When a price-significant dimension is missing, add a measurementTargets entry.",
    `Use these canonical subjectKey values when one fits, else null: ${SUBJECT_KEYS}.`,
    "Every observation must cite the mediaIds it came from, using the ids given in the user message.",
    "For each observation about a locatable physical object, also fill `regions`: one entry per visible instance,",
    "with the mediaId it appears in, a short label, a stable objectId, and a normalized bounding box",
    "(x, y = top-left corner, width, height — all fractions of the image between 0 and 1).",
    "Give the SAME objectId to the same physical object seen in several images. Use an empty regions array",
    "for scene-level facts that have no single location.",
  ].join("\n");
}

/** Call the gateway. Returns a structured, sanitized understanding or a typed empty state. */
export async function analyzeMediaWithModel(
  input: VisionUnderstandingInput,
): Promise<VisualUnderstandingResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return emptyVisualUnderstanding("provider_unavailable", null, "missing_api_key");

  const images = input.images.filter((i) => i.dataUrl.startsWith("data:image/")).slice(0, MAX_IMAGES);
  if (images.length === 0) return emptyVisualUnderstanding("no_media", VISION_PROVIDER_ID);

  const mediaKindById: Record<string, VisualEvidenceKind> = {};
  for (const image of images) mediaKindById[image.id] = image.kind;

  const content: unknown[] = [
    {
      type: "text",
      text: [
        "Contractor description (authoritative for scope):",
        input.transcript || "(none provided)",
        "",
        "Contractor-confirmed measurements (authoritative for dimensions):",
        input.measurementFacts || "(none provided)",
        "",
        "Media follows. Each image is preceded by its id and kind.",
      ].join("\n"),
    },
  ];
  for (const image of images) {
    content.push({ type: "text", text: `mediaId=${image.id} kind=${image.kind}` });
    content.push({ type: "image_url", image_url: { url: image.dataUrl } });
  }

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "visual_understanding",
            strict: true,
            schema: VISUAL_UNDERSTANDING_JSON_SCHEMA,
          },
        },
      }),
    });
  } catch {
    return emptyVisualUnderstanding("provider_error", VISION_PROVIDER_ID, "network_error");
  }

  if (!response.ok) {
    /* 429/5xx are transient; 400/401/402/403 are terminal. Both surface plainly. */
    return emptyVisualUnderstanding("provider_error", VISION_PROVIDER_ID, `http_${response.status}`);
  }

  try {
    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    const parsed = visualUnderstandingSchema.parse(JSON.parse(text));
    return {
      ...sanitizeUnderstanding(parsed, mediaKindById),
      status: "ok",
      providerId: VISION_PROVIDER_ID,
      errorCode: null,
    };
  } catch {
    return emptyVisualUnderstanding("provider_error", VISION_PROVIDER_ID, "invalid_model_output");
  }
}
