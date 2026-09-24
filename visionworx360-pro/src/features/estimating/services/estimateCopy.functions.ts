import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  copyEstimateSchema,
  listCopySourcesSchema,
  refreshCopiedPricingSchema,
} from "./estimateCopy.schemas";
import type { CopyEstimateResult, CopySourceDTO } from "./estimateCopy.server";

export type { CopyEstimateResult, CopySourceDTO };

/** Prior estimates in the contractor's own organization, for template pick. */
export const listCopySources = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listCopySourcesSchema.parse(d))
  .handler(async ({ data, context }): Promise<CopySourceDTO[]> => {
    const { listCopySourcesImpl } = await import("./estimateCopy.server");
    return listCopySourcesImpl(context.supabase, data);
  });

/** Selective, idempotent copy of a prior estimate into the current project. */
export const copyEstimateToProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => copyEstimateSchema.parse(d))
  .handler(async ({ data, context }): Promise<CopyEstimateResult> => {
    const { copyEstimateToProjectImpl } = await import("./estimateCopy.server");
    return copyEstimateToProjectImpl(context.supabase, data);
  });

/** Explicit contractor action; never runs on load or reopen. */
export const refreshCopiedPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refreshCopiedPricingSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ released: number }> => {
    const { refreshCopiedPricingImpl } = await import("./estimateCopy.server");
    const { buildProjectPricing } = await import("./estimateCommit.server");
    return refreshCopiedPricingImpl(context.supabase, data, (projectId, org) =>
      buildProjectPricing(context.supabase as never, projectId, org));
  });
