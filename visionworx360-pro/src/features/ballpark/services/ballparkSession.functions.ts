import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  getBallparkSessionSchema,
  discardBallparkDraftSchema,
  saveBallparkSchema,
  saveBallparkSessionSchema,
} from "./ballparkSession.schemas";
import type { DurableBallparkSession } from "@/domains/ballpark";
import type { Json } from "@/integrations/supabase/types";

export const getBallparkSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => getBallparkSessionSchema.parse(input))
  .handler(async ({ data, context }): Promise<DurableBallparkSession | null> => {
    const { data: row, error } = await context.supabase
      .from("estimate_ballpark_sessions")
      .select("payload, updated_at, current_question_id, frozen_question_ids, interview_type, current_stage, range_snapshot, draft_preview")
      .eq("estimate_id", data.estimateId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    const payload = row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
      ? row.payload
      : {};
    return JSON.parse(JSON.stringify({
      ...payload,
      currentQuestionId: row.current_question_id,
      frozenQuestionIds: row.frozen_question_ids,
      interviewType: row.interview_type,
      currentStage: row.current_stage,
      rangeSnapshot: row.range_snapshot,
      draftPreview: row.draft_preview,
      updatedAt: row.updated_at,
    })) as DurableBallparkSession;
  });

export const saveBallparkSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveBallparkSessionSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ updatedAt: string }> => {
    const { data: row, error } = await context.supabase.rpc("save_estimate_ballpark_session", {
      _estimate_id: data.estimateId,
      _session: data.session as unknown as Json,
    });
    if (error) throw new Error(error.message);
    return { updatedAt: row.updated_at };
  });

export const saveBallpark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => saveBallparkSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ updatedAt: string }> => {
    const { data: row, error } = await context.supabase.rpc("save_estimate_ballpark", {
      _estimate_id: data.estimateId,
      _range_snapshot: data.rangeSnapshot as unknown as Json,
      _session: data.session as unknown as Json,
    });
    if (error) throw new Error(error.message);
    return { updatedAt: row.updated_at };
  });

export const discardBallparkDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => discardBallparkDraftSchema.parse(input))
  .handler(async ({ data, context }): Promise<{ updatedAt: string }> => {
    const { data: row, error } = await context.supabase.rpc("discard_estimate_ballpark_draft", {
      _estimate_id: data.estimateId,
    });
    if (error) throw new Error(error.message);
    return { updatedAt: row.updated_at };
  });