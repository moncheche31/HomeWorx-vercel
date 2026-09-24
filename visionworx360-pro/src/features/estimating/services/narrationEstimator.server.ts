/**
 * ESTIMATOR READING OF THE NARRATION — server-only model call.
 *
 * The deterministic lexicon matches words. A senior estimator reads intent:
 * what work is actually being bought, what the trade sequence implies, what
 * prep/demo/prerequisite work a real estimator would carry. This pass adds
 * that reading — and only the reading.
 *
 * Hard boundaries (enforced, not just prompted):
 *  - No money, no rates, no hours. Pricing stays in the book.
 *  - No invented quantities. A quantity may only be repeated back when the
 *    contractor stated it, or derived from dimensions he stated.
 *  - Work the contractor did not ask for (prerequisites, media findings) comes
 *    back flagged, and reaches him as a suggestion he must approve.
 *  - Any failure returns an empty reading; the deterministic pipeline keeps
 *    working exactly as it does today.
 */

import {
  ESTIMATOR_READING_JSON_SCHEMA,
  assertNoEstimatorPricingSignals,
  estimatorReadingSchema,
  type EstimatorReading,
} from "./narrationEstimator.shared";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const ESTIMATOR_MODEL = "google/gemini-3.7-flash";
const MAX_IMAGES = 8;

export interface EstimatorReadingImage {
  id: string;
  kind: "before_photo" | "after_rendering" | "floor_plan" | "video_keyframe";
  dataUrl: string;
}

export interface EstimatorReadingRequest {
  narration: string;
  measurementFacts: string;
  /** Trades/subjects the deterministic pass already recognized (context only). */
  recognizedWork: string[];
  images: EstimatorReadingImage[];
}

export type EstimatorReadingFailure =
  | "missing_api_key"
  | "no_narration"
  | "network_error"
  | "invalid_model_output"
  | "pricing_signal_rejected"
  | `http_${number}`;

export interface EstimatorReadingResult {
  reading: EstimatorReading | null;
  model: string;
  error: EstimatorReadingFailure | null;
}

export const EMPTY_ESTIMATOR_READING: EstimatorReading = { job_summary: "", items: [] };

function systemPrompt(): string {
  return [
    "You are a senior construction estimator with deep field knowledge of how work is",
    "actually built, sequenced and bought. A contractor describes a job in his own words.",
    "Your ONLY job is to read that scope the way an estimator would and list the work items",
    "the job consists of. Someone else prices them from a cost book.",
    "",
    "HOW TO READ THE SCOPE",
    "- Identify each distinct item of work, its trade, and the unit it is normally bought in.",
    "- Think in construction process: demolition, protection, substrate prep, rough-in, install,",
    "  finish, cleanup and disposal. If a described task cannot be built without another task,",
    "  list that task too and mark it origin='implied_prerequisite'.",
    "- Use the contractor's own wording in spoken_phrase. Never rename his words.",
    "- Photos, renderings, floor plans and video frames are REFERENCE for judgment: they tell you",
    "  condition, access and complexity. Work you can only see (never described) is allowed, but it",
    "  must be marked origin='observed_in_media' so the contractor approves it before it is priced.",
    "",
    "HARD RULES — violating any of these makes your whole answer unusable:",
    "- NEVER output money, prices, costs, rates, wages, markup, margin, labor hours or crew hours.",
    "- NEVER invent a quantity. quantity is null unless the contractor stated it",
    "  (quantity_basis='stated') or it follows arithmetically from dimensions he stated",
    "  (quantity_basis='derived_from_stated_dimensions'). Otherwise quantity=null,",
    "  quantity_basis='unknown'. A missing size is not a reason to guess a size.",
    "- Work the contractor explicitly said to exclude is not listed at all.",
    "- Do not split one item into catalog components; the assembly expansion does that later.",
    "- subject_terms read like cost-book line descriptions so the book matcher can bind them.",
  ].join("\n");
}

function userText(req: EstimatorReadingRequest): string {
  return [
    "Contractor's narration (authoritative for scope):",
    req.narration,
    "",
    "Contractor-confirmed measurements (authoritative for dimensions):",
    req.measurementFacts || "(none provided)",
    "",
    "Work the deterministic recognizer already picked up (context; do not simply repeat it —",
    "your value is what it missed or misread):",
    req.recognizedWork.length ? req.recognizedWork.join("; ") : "(nothing recognized)",
    "",
    req.images.length ? "Jobsite media follows as reference." : "No media supplied.",
  ].join("\n");
}

export async function readNarrationAsEstimator(
  req: EstimatorReadingRequest,
): Promise<EstimatorReadingResult> {
  if (!req.narration.trim()) {
    return { reading: EMPTY_ESTIMATOR_READING, model: ESTIMATOR_MODEL, error: "no_narration" };
  }
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { reading: null, model: ESTIMATOR_MODEL, error: "missing_api_key" };

  const content: unknown[] = [{ type: "text", text: userText(req) }];
  for (const image of req.images.filter((i) => i.dataUrl.startsWith("data:image/")).slice(0, MAX_IMAGES)) {
    content.push({ type: "text", text: `mediaId=${image.id} kind=${image.kind}` });
    content.push({ type: "image_url", image_url: { url: image.dataUrl } });
  }

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: ESTIMATOR_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "estimator_reading",
            strict: true,
            schema: ESTIMATOR_READING_JSON_SCHEMA,
          },
        },
      }),
    });
  } catch {
    return { reading: null, model: ESTIMATOR_MODEL, error: "network_error" };
  }

  if (!response.ok) {
    return {
      reading: null,
      model: ESTIMATOR_MODEL,
      error: `http_${response.status}` as EstimatorReadingFailure,
    };
  }

  let parsed: EstimatorReading;
  try {
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = JSON.parse(body.choices?.[0]?.message?.content ?? "") as Record<string, unknown>;
    const items = Array.isArray(raw.items) ? raw.items.slice(0, 40) : [];
    parsed = estimatorReadingSchema.parse({
      job_summary: typeof raw.job_summary === "string" ? raw.job_summary.slice(0, 400) : "",
      items: items.map((entry) => {
        const item = entry as Record<string, unknown>;
        const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
        return {
          spoken_phrase: clip(item.spoken_phrase, 200) || clip(item.work_description, 200),
          work_description: clip(item.work_description, 200),
          trade: clip(item.trade, 60) || "general",
          subject_terms: (Array.isArray(item.subject_terms) ? item.subject_terms : [])
            .slice(0, 6)
            .map((t) => clip(t, 80))
            .filter(Boolean),
          unit: item.unit ?? "unknown",
          quantity: typeof item.quantity === "number" && item.quantity > 0 ? item.quantity : null,
          quantity_basis: item.quantity_basis ?? "unknown",
          origin: item.origin ?? "stated",
          confidence: typeof item.confidence === "number" ? Math.min(1, Math.max(0, item.confidence)) : 0.5,
          reason: clip(item.reason, 300) || "Estimator reading of the contractor's scope.",
        };
      }),
    });
  } catch {
    return { reading: null, model: ESTIMATOR_MODEL, error: "invalid_model_output" };
  }

  try {
    assertNoEstimatorPricingSignals(parsed);
  } catch {
    return { reading: null, model: ESTIMATOR_MODEL, error: "pricing_signal_rejected" };
  }

  /* A quantity without stated evidence is a guess. Strip it here so no
     downstream path can ever treat model arithmetic as contractor evidence. */
  const reading: EstimatorReading = {
    ...parsed,
    items: parsed.items.map((item) =>
      item.quantity_basis === "unknown" ? { ...item, quantity: null } : item,
    ),
  };
  return { reading, model: ESTIMATOR_MODEL, error: null };
}
