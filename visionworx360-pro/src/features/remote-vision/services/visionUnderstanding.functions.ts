import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { analyzeMediaWithModel } from "./visionUnderstanding.server";
import { resolveProjectVisionImages } from "./visionRequest.server";
import { ensureProjectMediaAnalysisFor } from "./ensureMediaAnalysis.server";
import type { VisualUnderstandingResult } from "@/domains/remoteVision/visualUnderstanding";

/**
 * Client entry point for real multimodal analysis of the CURRENT project's
 * media. Images never touch a third party from the browser: the API key stays
 * on the server.
 *
 * Two input shapes, one pipeline:
 *  - `dataUrl`     — already inlined by the client (video keyframes).
 *  - `storagePath` — a durable `project_photos` object; the bytes are signed,
 *    downloaded and inlined server-side. Before this existed, every persisted
 *    photo was dropped and only keyframes were ever analyzed.
 */

const MAX_IMAGES = 12;
const MAX_DATA_URL_CHARS = 8_000_000; // ~6 MB per image after base64.

const imageSchema = z
  .object({
    id: z.string().min(1),
    kind: z.enum(["before_photo", "after_rendering", "floor_plan", "video_keyframe"]),
    dataUrl: z.string().startsWith("data:image/").max(MAX_DATA_URL_CHARS).nullish(),
    storagePath: z.string().min(1).max(1_024).nullish(),
    mimeType: z.string().max(200).nullish(),
  })
  .refine((i) => Boolean(i.dataUrl) || Boolean(i.storagePath), {
    message: "image needs a dataUrl or a storagePath",
  });

const inputSchema = z.object({
  /** Required whenever a storagePath is sent: it scopes the signed read. */
  projectId: z.string().uuid().nullish(),
  images: z.array(imageSchema).max(MAX_IMAGES),
  transcript: z.string().max(20_000).default(""),
  measurementFacts: z.string().max(10_000).default(""),
});

export const analyzeProjectMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }): Promise<VisualUnderstandingResult> => {
    const images = await resolveProjectVisionImages(
      context.supabase,
      data.projectId ?? null,
      data.images,
      MAX_IMAGES,
    );
    return analyzeMediaWithModel({
      images,
      transcript: data.transcript,
      measurementFacts: data.measurementFacts,
    });
  });

/**
 * Surface-independent analysis entry point: called after ANY media change on a
 * project (Photos tab upload, Estimate-from-Photos upload, archive). Runs at
 * most one gateway call per real media-set change and never throws, so a
 * failed analysis can never block or undo an upload.
 */
export const ensureProjectMediaAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ projectId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) =>
    ensureProjectMediaAnalysisFor(context.supabase, context.userId, data.projectId),
  );
