/**
 * ASSEMBLY EXPANSION — shared contract (client-safe).
 *
 * The model supplies WHAT a complete assembly contains. It never supplies what
 * anything costs: the response schema has no price/rate/hours field, and
 * `assertNoPricingSignals` rejects an entire expansion if a free-text field
 * smuggles a currency or hours figure. Pricing is done later, exclusively by
 * the Part 1 book matcher.
 *
 * Roll-out gate: only trades in ENABLED_EXPANSION_TRADES may be expanded.
 * Roofing is proven end-to-end first; other trades are enabled one at a time.
 */

import { z } from "zod";

export const EXPANSION_PROMPT_VERSION = "v2-all-trades";

/**
 * Trades allowed to expand.
 *
 * Catch-all buckets are deliberately absent: demolition, general conditions and
 * specialty are single priced lines by design, and forcing a component list on
 * them invents structure the contractor never asked for.
 */
export const ENABLED_EXPANSION_TRADES = new Set<string>([
  "roofing",
  "siding",
  "electrical",
  "plumbing",
  "drywall",
  "painting",
  "flooring",
  "framing",
  "carpentry",
  "hvac",
  "insulation",
  "doors",
  "finish_carpentry",
]);

/**
 * Some lines carry a bucket trade ("exterior") rather than the real trade. The
 * contractor's own wording decides — and only when it is unmistakable. A line
 * that does not clearly name an enabled trade is never expanded.
 */
const BUCKET_TRADES = new Set(["exterior", "general", "other"]);
const TRADE_BY_PHRASE: [RegExp, string][] = [
  [/\bsiding|clapboard|lap board|shake siding|vinyl siding|fiber ?cement\b/i, "siding"],
  [/\broof(ing)?\b|\bshingle|standing seam\b/i, "roofing"],
  [/\bdrywall|sheetrock|gypsum board\b/i, "drywall"],
  [/\bpaint(ing)?\b|\bprime\b|\bprimer\b/i, "painting"],
  [/\bflooring|hardwood floor|vinyl plank|carpet\b/i, "flooring"],
  [/\bframing\b|\bframe walls\b|\bjoist|\brafter|\bstud wall\b/i, "framing"],
  [/\binsulation|insulate\b/i, "insulation"],
  [/\boutlet|circuit|receptacle|electrical panel|wiring\b/i, "electrical"],
  [/\bplumbing|rough-?in plumbing|fixture supply\b/i, "plumbing"],
  [/\bhvac|ductwork|mini-?split|furnace\b/i, "hvac"],
];


/** Canonical expansion trade for a line, or null when it must not expand. */
export const expansionTradeForLine = (
  tradeKey: string | null | undefined,
  description?: string | null,
): string | null => {
  const key = (tradeKey ?? "").trim().toLowerCase();
  if (ENABLED_EXPANSION_TRADES.has(key)) return key;
  if (!BUCKET_TRADES.has(key) || !description) return null;
  const hit = TRADE_BY_PHRASE.find(([re]) => re.test(description));
  return hit && ENABLED_EXPANSION_TRADES.has(hit[1]) ? hit[1] : null;
};

export const isExpansionEnabledForTrade = (
  tradeKey: string | null | undefined,
  description?: string | null,
): boolean => expansionTradeForLine(tradeKey, description) !== null;


export const INCLUSION_KINDS = ["standard", "conditional", "existing_typically"] as const;
export const QUANTITY_BASES = [
  "same_as_parent",
  "eave_lf",
  "ridge_lf",
  "perimeter_lf",
  "per_penetration",
  "wall_sf",
  "opening_count",
  "corner_lf",
  "factor",
  "manual",
] as const;


export type InclusionKind = (typeof INCLUSION_KINDS)[number];
export type QuantityBasis = (typeof QUANTITY_BASES)[number];

export const expansionComponentSchema = z.object({
  sequence: z.number().int().min(1).max(20),
  name: z.string().trim().min(3).max(120),
  search_terms: z.array(z.string().trim().min(2).max(60)).min(1).max(5),
  typical_unit: z.string().trim().max(12).nullable().default(null),
  inclusion: z.enum(INCLUSION_KINDS),
  quantity_basis: z.enum(QUANTITY_BASES),
  reason: z.string().trim().max(200).nullable().default(null),
});

export const assemblyExpansionSchema = z.object({
  assembly_label: z.string().trim().min(3).max(140),
  components: z.array(expansionComponentSchema).min(1).max(15),
});

export type ExpansionComponent = z.infer<typeof expansionComponentSchema>;
export type AssemblyExpansionPayload = z.infer<typeof assemblyExpansionSchema>;

/** JSON schema mirror for the gateway's strict structured-output mode. */
export const ASSEMBLY_EXPANSION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assembly_label", "components"],
  properties: {
    assembly_label: { type: "string" },
    components: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["sequence", "name", "search_terms", "typical_unit", "inclusion", "quantity_basis", "reason"],
        properties: {
          sequence: { type: "integer" },
          name: { type: "string" },
          search_terms: { type: "array", items: { type: "string" } },
          typical_unit: { type: ["string", "null"] },
          inclusion: { type: "string", enum: [...INCLUSION_KINDS] },
          quantity_basis: { type: "string", enum: [...QUANTITY_BASES] },
          reason: { type: ["string", "null"] },
        },
      },
    },
  },
} as const;

const CURRENCY = /(\$\s*\d)|(\b\d[\d,]*\.\d{2}\b)|\b(usd|dollars?|per\s+dollar)\b/i;
const HOURS = /\b\d+(\.\d+)?\s*(hr|hrs|hour|hours|manhours?|man-hours?)\b/i;
/* Numeric-adjacent only: prose like "cost-effective" or "high-temp rated" is
   normal component language and must not nuke a valid expansion. What must
   never appear is a NUMBER presented as a cost, rate, wage or hour figure. */
const NUMERIC_RATE = /\b(cost|price|priced|rate|wage|labou?r|craft)s?\s*(?:of|:|=|is|at)?\s*\$?\d/i;
const PER_UNIT_RATE = /\b\d[\d,.]*\s*(?:per|\/)\s*(?:hr|hour|man-?hour|sf|sq\.?\s?ft|lf|square|unit|ea)\b/i;
const RATE_WORDS = new RegExp(`(${NUMERIC_RATE.source})|(${PER_UNIT_RATE.source})`, "i");


/** Layer 2 guard: any pricing signal invalidates the whole expansion. */
export function assertNoPricingSignals(payload: AssemblyExpansionPayload): void {
  const strings = [
    payload.assembly_label,
    ...payload.components.flatMap((c) => [c.name, c.reason ?? "", ...c.search_terms]),
  ];
  for (const s of strings) {
    if (CURRENCY.test(s) || HOURS.test(s) || RATE_WORDS.test(s)) {
      throw new Error("Expansion rejected: model output contained a pricing signal");
    }
  }
}

const norm = (v: string) => v.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Cache key. Only facts that change composition belong here — never quantity,
 * price, or project identity, so one org's roofing knowledge is reused.
 */
export function expansionSignature(input: {
  tradeKey: string;
  scopePhrase: string;
  constructionType?: string | null;
  materialFamily?: string | null;
}): string {
  return [
    norm(input.tradeKey),
    norm(input.scopePhrase),
    norm(input.constructionType ?? "unspecified"),
    norm(input.materialFamily ?? "unspecified"),
    EXPANSION_PROMPT_VERSION,
  ].join("|");
}
