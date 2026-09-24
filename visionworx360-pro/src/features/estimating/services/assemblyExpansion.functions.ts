/**
 * ASSEMBLY EXPANSION — server functions (thin wrappers).
 *
 * All logic lives in `assemblyExpansion.core`. Nothing here writes money: the
 * expansion carries component NAMES only, and every dollar on a materialized
 * child line comes from the Part 1 book matcher.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { expansionTradeForLine } from "./assemblyExpansion.shared";
import {
  type AssemblyExpansionDTO,
  type MaterializeResult,
  type SB,
  loadExpansion,
  attachBookMatches,
  applyLineContext,
  materializeExpansion,
  runExpansion,
  runReview,
} from "./assemblyExpansion.core";


export type { AssemblyExpansionDTO, ExpansionComponentDTO, MaterializeResult } from "./assemblyExpansion.core";

const expandInput = z.object({
  estimateLineId: z.string().uuid(),
  regenerate: z.boolean().optional().default(false),
});

/** Expand one estimate line into its assembly components (cache-first). */
export const expandEstimateLineAssembly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => expandInput.parse(d))
  .handler(async ({ data, context }): Promise<AssemblyExpansionDTO> =>
    runExpansion(context.supabase as unknown as SB, {
      estimateLineId: data.estimateLineId,
      userId: context.userId,
      regenerate: data.regenerate,
    }),
  );

const reviewInput = z.object({
  expansionId: z.string().uuid(),
  estimateLineId: z.string().uuid().optional(),
  components: z
    .array(
      z.object({
        id: z.string().uuid(),
        isIncluded: z.boolean().optional(),
        quantity: z.number().nonnegative().nullable().optional(),
        selectedReferenceId: z.number().int().positive().nullable().optional(),
      }),
    )
    .max(20)
    .default([]),
  geometry: z
    .object({
      eaveLf: z.number().nonnegative().nullable().optional(),
      rakeLf: z.number().nonnegative().nullable().optional(),
      ridgeLf: z.number().nonnegative().nullable().optional(),
      hipValleyLf: z.number().nonnegative().nullable().optional(),
      penetrations: z.number().nonnegative().nullable().optional(),
      cornerLf: z.number().nonnegative().nullable().optional(),
      openingCount: z.number().nonnegative().nullable().optional(),
      perimeterLf: z.number().nonnegative().nullable().optional(),
    })
    .nullable()
    .optional(),
  markReviewed: z.boolean().optional().default(false),
});



/** Contractor review: include/exclude, quantity edits, and confirmation. */
export const reviewAssemblyExpansion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewInput.parse(d))
  .handler(async ({ data, context }): Promise<AssemblyExpansionDTO> =>
    runReview(context.supabase as unknown as SB, { ...data, userId: context.userId }),
  );

const materializeInput = z.object({ estimateLineId: z.string().uuid() });

/** Turn the reviewed components into real priced child lines. */
export const materializeAssemblyExpansion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => materializeInput.parse(d))
  .handler(async ({ data, context }): Promise<MaterializeResult> =>
    materializeExpansion(context.supabase as unknown as SB, {
      estimateLineId: data.estimateLineId,
      userId: context.userId,
    }),
  );

const getInput = z.object({ estimateLineId: z.string().uuid() });

/** Read the expansion already linked to a line, if any. */
export const getEstimateLineAssembly = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getInput.parse(d))
  .handler(async ({ data, context }): Promise<AssemblyExpansionDTO | null> => {
    const sb = context.supabase as unknown as SB;
    const { data: line } = await sb
      .from("estimate_line_items")
      .select("assembly_expansion_id, trade_key, description")
      .eq("id", data.estimateLineId)
      .maybeSingle();
    if (!line?.assembly_expansion_id) return null;
    const dto = await loadExpansion(sb, String(line.assembly_expansion_id), "cache");
    /* Match on the real trade, not a bucket like "exterior": a bucket scopes
       the book matcher to no section and silently falls back to whole-book. */
    const matchTrade =
      expansionTradeForLine(line.trade_key as string | null, line.description as string | null) ??
      String(line.trade_key ?? dto.tradeKey);
    await attachBookMatches(sb, matchTrade, dto);
    await applyLineContext(sb, data.estimateLineId, dto);
    return dto;


  });
