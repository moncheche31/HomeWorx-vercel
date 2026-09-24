import { z } from "zod";

const uuid = z.string().uuid();

export const listCopySourcesSchema = z.object({
  /** Free-text match on project name, client name or estimate title. */
  search: z.string().trim().max(120).optional(),
  /** The project being built now; it can never be its own template. */
  excludeProjectId: uuid.optional(),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

export const copyOptionsSchema = z.object({
  copyScope: z.boolean(),
  copyLines: z.boolean(),
  copyQuantities: z.boolean(),
  copyPricing: z.boolean(),
  copyMarkup: z.boolean(),
  copyAssumptions: z.boolean(),
}).partial();

export const copyEstimateSchema = z.object({
  sourceEstimateId: uuid,
  targetProjectId: uuid,
  options: copyOptionsSchema.optional().default({}),
});

export const refreshCopiedPricingSchema = z.object({ estimateId: uuid });
