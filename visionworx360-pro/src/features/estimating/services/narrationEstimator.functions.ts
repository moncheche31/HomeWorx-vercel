/**
 * ESTIMATOR READING — server function wrapper.
 *
 * The narration and any reference media are read by a senior-estimator prompt
 * on the server. Nothing here writes to the database and nothing here prices:
 * the reading is scope only, and every dollar still comes from the book.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { readNarrationAsEstimator, type EstimatorReadingResult } from "./narrationEstimator.server";

const MAX_IMAGES = 8;
const MAX_DATA_URL_CHARS = 8_000_000;

const inputSchema = z.object({
  narration: z.string().max(20_000).default(""),
  measurementFacts: z.string().max(10_000).default(""),
  recognizedWork: z.array(z.string().max(160)).max(60).default([]),
  images: z
    .array(
      z.object({
        id: z.string().min(1),
        kind: z.enum(["before_photo", "after_rendering", "floor_plan", "video_keyframe"]),
        dataUrl: z.string().startsWith("data:image/").max(MAX_DATA_URL_CHARS),
      }),
    )
    .max(MAX_IMAGES)
    .default([]),
});

export const readNarrationAsEstimatorFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data }): Promise<EstimatorReadingResult> => readNarrationAsEstimator(data));
