/**
 * ESTIMATOR READING OF THE NARRATION — shared contract.
 *
 * A senior estimator reads a contractor's narration and says what work is
 * actually being bought before anyone touches a price. This module carries the
 * schema for that reading and NOTHING else: the model may name work, name the
 * trade, and repeat a quantity the contractor himself stated. It may never
 * produce a rate, a cost, an hour, or an invented quantity — every dollar still
 * comes from the loaded book (NCE 2026 + catalog assemblies + wage rates +
 * area modification factors).
 */

import { z } from "zod";

export const ESTIMATOR_ORIGINS = ["stated", "implied_prerequisite", "observed_in_media"] as const;
export type EstimatorItemOrigin = (typeof ESTIMATOR_ORIGINS)[number];

export const ESTIMATOR_QUANTITY_BASES = [
  "stated",
  "derived_from_stated_dimensions",
  "unknown",
] as const;
export type EstimatorQuantityBasis = (typeof ESTIMATOR_QUANTITY_BASES)[number];

export const ESTIMATOR_UNITS = [
  "square_foot",
  "linear_foot",
  "each",
  "hour",
  "lump_sum",
  "unknown",
] as const;
export type EstimatorUnit = (typeof ESTIMATOR_UNITS)[number];

export const estimatorItemSchema = z.object({
  /** The contractor's own wording for this work — shown to him verbatim. */
  spoken_phrase: z.string().min(1).max(200),
  /** What an estimator would call the work being bought. */
  work_description: z.string().min(1).max(200),
  trade: z.string().min(1).max(60),
  /** Cost-book-style search terms so the deterministic matcher can bind it. */
  subject_terms: z.array(z.string().min(1).max(80)).max(6),
  unit: z.enum(ESTIMATOR_UNITS),
  quantity: z.number().positive().nullable(),
  quantity_basis: z.enum(ESTIMATOR_QUANTITY_BASES),
  origin: z.enum(ESTIMATOR_ORIGINS),
  confidence: z.number().min(0).max(1),
  /** One line of estimator reasoning: why this work is part of the job. */
  reason: z.string().min(1).max(300),
});
export type EstimatorItem = z.infer<typeof estimatorItemSchema>;

export const estimatorReadingSchema = z.object({
  job_summary: z.string().max(400),
  items: z.array(estimatorItemSchema).max(40),
});
export type EstimatorReading = z.infer<typeof estimatorReadingSchema>;

/** Strict JSON schema for the gateway (every property required, no bounds). */
export const ESTIMATOR_READING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["job_summary", "items"],
  properties: {
    job_summary: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "spoken_phrase",
          "work_description",
          "trade",
          "subject_terms",
          "unit",
          "quantity",
          "quantity_basis",
          "origin",
          "confidence",
          "reason",
        ],
        properties: {
          spoken_phrase: { type: "string" },
          work_description: { type: "string" },
          trade: { type: "string" },
          subject_terms: { type: "array", items: { type: "string" } },
          unit: { type: "string", enum: [...ESTIMATOR_UNITS] },
          quantity: { type: ["number", "null"] },
          quantity_basis: { type: "string", enum: [...ESTIMATOR_QUANTITY_BASES] },
          origin: { type: "string", enum: [...ESTIMATOR_ORIGINS] },
          confidence: { type: "number" },
          reason: { type: "string" },
        },
      },
    },
  },
} as const;

const PRICING_SIGNAL =
  /(\$|\bUSD\b|\bprice[sd]?\b|\bpricing\b|\bcost(s|ed|ing)?\b|\brate\b|\bwage\b|\bper hour\b|\blabor hours?\b|\bman[- ]hours?\b|\bcrew hours?\b|\bmarkup\b|\bmargin\b)/i;

/**
 * The reading is scope, never money. Any pricing language means the model
 * stepped outside its lane and the whole reading is discarded.
 */
export function assertNoEstimatorPricingSignals(reading: EstimatorReading): void {
  const fields = [
    reading.job_summary,
    ...reading.items.flatMap((i) => [
      i.spoken_phrase,
      i.work_description,
      i.trade,
      i.reason,
      ...i.subject_terms,
    ]),
  ];
  for (const field of fields) {
    if (PRICING_SIGNAL.test(field)) {
      throw new Error(`Estimator reading contained a pricing signal: ${field.slice(0, 80)}`);
    }
  }
}
