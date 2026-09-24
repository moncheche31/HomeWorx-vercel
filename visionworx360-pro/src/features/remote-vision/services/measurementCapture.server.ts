/**
 * Server-only helpers for measurement capture: row mapping and plan/sheet
 * text extraction.
 *
 * Extraction is deliberately conservative. The model is asked ONLY to read
 * the dimension text that is printed on the plan — it is never asked to infer
 * or compute a measurement. Whatever comes back is parsed by the same
 * unit-safe parser the typed/spoken paths use, and every item lands as a
 * `candidate` that a human has to confirm.
 */

import type { MeasurementCapture, MeasurementItem } from "@/domains/measurementCapture";

const MODEL = "google/gemini-3.6-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
/** Plans are photos of paper; anything larger is a scan we should not inline. */
const MAX_INLINE_BYTES = 12 * 1024 * 1024;

const PROMPT = [
  "You are reading a construction plan, hand sketch, or measurement sheet.",
  "Transcribe ONLY the dimensions that are actually written on the page.",
  "One per line, in the form: <label>: <dimension exactly as written>.",
  "Keep the original units and symbols (94\", 7'-10\", 12 x 14, 8' ceiling).",
  "Never convert, never round, never invent a dimension that is not printed.",
  "If nothing is legible, reply with the single word NONE.",
].join(" ");

export function mapItem(row: Record<string, unknown>): MeasurementItem {
  return {
    id: String(row.id),
    label: String(row.label ?? "Measurement"),
    subject: (row.subject as string | null) ?? null,
    kind: (row.kind as "single" | "pair") ?? "single",
    inches: Number(row.inches ?? 0),
    secondaryInches: row.secondary_inches === null || row.secondary_inches === undefined
      ? null
      : Number(row.secondary_inches),
    display: "",
    rawText: (row.raw_text as string | null) ?? "",
    source: row.source as MeasurementItem["source"],
    status: row.status as MeasurementItem["status"],
    flag: (row.flag as MeasurementItem["flag"]) ?? null,
    overriddenAt: (row.overridden_at as string | null) ?? null,
    documentId: (row.document_id as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

export function mapCapture(row: Record<string, unknown>): MeasurementCapture {
  return {
    id: String(row.id),
    source: row.source as MeasurementCapture["source"],
    transcript: (row.transcript as string | null) ?? null,
    documentId: (row.document_id as string | null) ?? null,
    fileName: (row.file_name as string | null) ?? null,
    createdAt: String(row.created_at ?? ""),
  };
}

export function toItemRow(
  item: Record<string, unknown>,
  org: string,
  projectId: string,
  userId: string,
): Record<string, unknown> {
  return {
    organization_id: org,
    project_id: projectId,
    capture_id: item.captureId ?? null,
    document_id: item.documentId ?? null,
    source: item.source,
    status: item.status ?? "candidate",
    flag: item.flag ?? null,
    label: item.label,
    subject: item.subject ?? null,
    kind: item.kind ?? "single",
    inches: item.inches,
    secondary_inches: item.secondaryInches ?? null,
    raw_text: item.rawText ?? null,
    created_by: userId,
  };
}

/** Read the dimension text off an uploaded plan image or PDF. */
export async function readPlanText(
  signedUrl: string,
  mimeType: string,
): Promise<{ text: string; error: string | null }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { text: "", error: "extraction_unavailable" };

  const file = await fetch(signedUrl);
  if (!file.ok) return { text: "", error: "plan_unreadable" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) return { text: "", error: "plan_unreadable" };
  if (bytes.byteLength > MAX_INLINE_BYTES) return { text: "", error: "plan_too_large" };

  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const base64 = btoa(binary);
  const dataUrl = `data:${mimeType};base64,${base64}`;

  const content = mimeType === "application/pdf"
    ? [
        { type: "text", text: PROMPT },
        { type: "file", file: { filename: "plan.pdf", file_data: dataUrl } },
      ]
    : [
        { type: "text", text: PROMPT },
        { type: "image_url", image_url: { url: dataUrl } },
      ];

  const response = await fetch(GATEWAY, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "user", content }] }),
  });

  if (response.status === 429) return { text: "", error: "rate_limited" };
  if (response.status === 402 || response.status === 403) {
    return { text: "", error: "extraction_blocked" };
  }
  if (!response.ok) return { text: "", error: "extraction_failed" };

  const payload = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const text = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text || /^none$/i.test(text)) return { text: "", error: "no_measurements" };
  return { text, error: null };
}
