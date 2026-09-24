/**
 * AI-ESTIMATED MATERIAL FALLBACK — server-only model call.
 *
 * Used ONLY where the 2026 NCE book genuinely has no row for a component
 * (house wrap, seam tape, vinyl siding panels as a finished product, undersill
 * trim...). The model may return a MATERIAL unit cost and nothing else:
 *   - never a labor hour, never a labor rate, never a crew size;
 *   - never blended into a book price — an estimated material always stays a
 *     separately-labelled "Est." value with its own provenance.
 *
 * Labor for these lines still comes from the book wherever a craft rate exists;
 * where it does not, the line carries material only and says so.
 */

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const MATERIAL_ESTIMATE_MODEL = "google/gemini-3-flash";

export interface MaterialEstimateRequest {
  /** Stable key echoed back so answers can be matched to components. */
  key: string;
  name: string;
  /** Scope unit the line is priced in (square_foot, linear_foot, each...). */
  unit: string;
  tradeKey: string;
  context: string | null;
}

export interface MaterialEstimateResult {
  key: string;
  /** Material cost per ONE unit, in dollars. Never a total, never labor. */
  materialPerUnit: number;
  note: string;
}

const PRICE_KEYS = /(labor|labour|hour|hrs|crew|wage|rate|total)/i;

/**
 * Ask for per-unit material costs for a batch of unmatched components.
 * Any answer that smuggles labor in, or that is not a positive finite number,
 * is dropped rather than repaired — a wrong number is worse than a gap.
 */
export async function estimateMaterialCosts(
  reqs: MaterialEstimateRequest[],
): Promise<{ results: MaterialEstimateResult[]; model: string; error: string | null }> {
  if (reqs.length === 0) return { results: [], model: MATERIAL_ESTIMATE_MODEL, error: null };
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { results: [], model: MATERIAL_ESTIMATE_MODEL, error: "missing_api_key" };

  const system = [
    "You are a construction materials buyer pricing MATERIAL ONLY.",
    "For each item, give the typical installed-material cost for ONE unit of the stated unit,",
    "in US dollars, at contractor supply-house pricing (no tax, no delivery, no labor).",
    "Price the US NATIONAL AVERAGE. Do not adjust for any city, state or region:",
    "the job-site location factor is applied afterwards, once, by the estimator.",
    "",
    "HARD RULES:",
    "- Never include labor, hours, crew, equipment, overhead, profit, or a job total.",
    "- material_per_unit is the cost of a single unit only (per SF, per LF, per each).",
    "- Include normal waste in the unit cost only where the trade always buys it that way.",
    "- note: one short sentence naming the product assumption you priced.",
    "- Return one object per requested key, using the exact key given.",
    "- A purchased service that is bought as a unit, such as a dumpster or a dump",
    "  fee per load, is priced as the purchase price of that unit. It is a bought",
    "  item, not labor, so it still gets a number — never skip it.",
    "- Every requested key must appear in the answer.",

  ].join("\n");

  const user = JSON.stringify(
    reqs.map((r) => ({ key: r.key, item: r.name, unit: r.unit, trade: r.tradeKey, context: r.context })),
  );

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: MATERIAL_ESTIMATE_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "material_estimates",
            strict: true,
            schema: {
              type: "object",
              additionalProperties: false,
              required: ["items"],
              properties: {
                items: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["key", "material_per_unit", "note"],
                    properties: {
                      key: { type: "string" },
                      material_per_unit: { type: "number" },
                      note: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      }),
    });
  } catch {
    return { results: [], model: MATERIAL_ESTIMATE_MODEL, error: "network_error" };
  }

  if (!response.ok) {
    return { results: [], model: MATERIAL_ESTIMATE_MODEL, error: `http_${response.status}` };
  }

  try {
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = JSON.parse(body.choices?.[0]?.message?.content ?? "") as {
      items?: { key?: unknown; material_per_unit?: unknown; note?: unknown }[];
    };
    const wanted = new Set(reqs.map((r) => r.key));
    const results: MaterialEstimateResult[] = [];
    for (const it of raw.items ?? []) {
      const key = String(it.key ?? "");
      const value = Number(it.material_per_unit);
      const note = typeof it.note === "string" ? it.note.trim().slice(0, 200) : "";
      if (!wanted.has(key)) continue;
      if (!Number.isFinite(value) || value <= 0) continue;
      /* Defence in depth: reject an answer that describes labor. */
      if (PRICE_KEYS.test(note) && /\$\s*\d/.test(note)) continue;
      results.push({ key, materialPerUnit: Math.round(value * 100) / 100, note });
    }
    return { results, model: MATERIAL_ESTIMATE_MODEL, error: null };
  } catch {
    return { results: [], model: MATERIAL_ESTIMATE_MODEL, error: "invalid_model_output" };
  }
}
