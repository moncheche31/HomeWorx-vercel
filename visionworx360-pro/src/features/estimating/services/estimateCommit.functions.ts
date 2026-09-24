import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { commitApprovedEstimateSchema } from "./estimateCommit.schemas";
import type { CanonicalEstimateCommit, EstimateCommitResult } from "@/domains/estimating/estimateCommit";

/**
 * The single shared commit used by every intake mode. Intake surfaces build a
 * canonical payload and call this; none of them create estimates themselves.
 */
export const commitApprovedEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => commitApprovedEstimateSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateCommitResult> => {
    const { commitApprovedEstimateImpl } = await import("./estimateCommit.server");
    return commitApprovedEstimateImpl(
      context.supabase as never,
      context.userId,
      data as unknown as CanonicalEstimateCommit,
    );
  });
