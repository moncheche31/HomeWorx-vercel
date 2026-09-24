/**
 * ASSEMBLY EXPANSION — server-only model call.
 *
 * Same gateway pattern as the vision analyst. The model is asked for the
 * ordered component list of a complete assembly and for nothing else: no
 * quantities, no prices, no hours. Failures never block an estimate — they
 * return null and the line prices exactly as it does today.
 */

import {
  ASSEMBLY_EXPANSION_JSON_SCHEMA,
  assemblyExpansionSchema,
  assertNoPricingSignals,
  type AssemblyExpansionPayload,
} from "./assemblyExpansion.shared";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const EXPANSION_MODEL = "google/gemini-3-flash";

export interface ExpansionRequest {
  tradeKey: string;
  scopePhrase: string;
  unit: string | null;
  constructionType: string | null;
  materialFamily: string | null;
  contextNotes: string | null;
  /** Book section names the Part 1 mapping knows for this trade. */
  bookSections: string[];
}

export type ExpansionFailure =
  | "missing_api_key"
  | "network_error"
  | "invalid_model_output"
  | "pricing_signal_rejected"
  | `http_${number}`;

export interface ExpansionResult {
  payload: AssemblyExpansionPayload | null;
  model: string;
  error: ExpansionFailure | null;
}

function systemPrompt(req: ExpansionRequest): string {
  return [
    "You are a construction estimator's assembly checklist assistant.",
    "Given a scope phrase, list the ordered components that make up the COMPLETE assembly",
    "as it is actually installed in the field — including the steps contractors forget",
    "(underlayment, flashing, edge metal, ventilation, fasteners, disposal).",
    "",
    "HARD RULES:",
    "- Never output a price, cost, rate, wage, labor hour, craft hour, or quantity.",
    "- Output only: component name, search terms, typical unit, inclusion, quantity basis, one-line reason.",
    "- Mark a component 'conditional' when it depends on a site fact you were not told.",
    "- Mark it 'existing_typically' when it usually already exists and is not replaced.",
    "- Choose quantity_basis from the allowed enum only; use 'manual' when unsure.",
    "- Maximum 15 components. No duplicates. Sequence in installation order starting at 1.",
    "",
    "Search terms should read like a cost-book line description so the estimator's",
    "book matcher can find them. Book sections available for this trade:",
    req.bookSections.length ? req.bookSections.join(", ") : "(none mapped)",
  ].join("\n");
}

function userPrompt(req: ExpansionRequest): string {
  return [
    `Trade: ${req.tradeKey}`,
    `Contractor's scope phrase: ${req.scopePhrase}`,
    `Unit of the parent line: ${req.unit ?? "unknown"}`,
    `Construction type: ${req.constructionType ?? "unspecified"}`,
    `Material family mentioned: ${req.materialFamily ?? "unspecified"}`,
    `Project context: ${req.contextNotes ?? "(none)"}`,
  ].join("\n");
}

export async function expandAssemblyWithModel(req: ExpansionRequest): Promise<ExpansionResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { payload: null, model: EXPANSION_MODEL, error: "missing_api_key" };

  let response: Response;
  try {
    response = await fetch(GATEWAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: EXPANSION_MODEL,
        temperature: 0,
        messages: [
          { role: "system", content: systemPrompt(req) },
          { role: "user", content: userPrompt(req) },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: "assembly_expansion", strict: true, schema: ASSEMBLY_EXPANSION_JSON_SCHEMA },
        },
      }),
    });
  } catch {
    return { payload: null, model: EXPANSION_MODEL, error: "network_error" };
  }

  if (!response.ok) {
    return { payload: null, model: EXPANSION_MODEL, error: `http_${response.status}` as ExpansionFailure };
  }

  let parsed: AssemblyExpansionPayload;
  try {
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const raw = JSON.parse(body.choices?.[0]?.message?.content ?? "") as Record<string, unknown>;
    /* Shape overruns (too many components/terms, long prose) are trimmed, not
       treated as failures. Only unusable output falls through to the catch. */
    const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : null);
    const components = Array.isArray(raw.components) ? raw.components.slice(0, 15) : [];
    parsed = assemblyExpansionSchema.parse({
      assembly_label: clip(raw.assembly_label, 140) || "Assembly",
      components: components.map((c, i) => {
        const comp = c as Record<string, unknown>;
        return {
          sequence: typeof comp.sequence === "number" ? comp.sequence : i + 1,
          name: clip(comp.name, 120),
          search_terms: (Array.isArray(comp.search_terms) ? comp.search_terms : [])
            .filter((t): t is string => typeof t === "string" && t.trim().length >= 2)
            .slice(0, 5)
            .map((t) => t.trim().slice(0, 60)),
          typical_unit: clip(comp.typical_unit, 12),
          inclusion: comp.inclusion,
          quantity_basis: comp.quantity_basis,
          reason: clip(comp.reason, 200),
        };
      }),
    });
  } catch {
    return { payload: null, model: EXPANSION_MODEL, error: "invalid_model_output" };
  }


  try {
    assertNoPricingSignals(parsed);
  } catch {
    return { payload: null, model: EXPANSION_MODEL, error: "pricing_signal_rejected" };
  }

  /* Deduplicate and renumber; the model's sequence is advisory. */
  const seen = new Set<string>();
  const components = parsed.components
    .sort((a, b) => a.sequence - b.sequence)
    .filter((c) => {
      const key = c.name.trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((c, i) => ({ ...c, sequence: i + 1 }));

  return { payload: { ...parsed, components }, model: EXPANSION_MODEL, error: null };
}
