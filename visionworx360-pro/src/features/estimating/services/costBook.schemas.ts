import { z } from "zod";

/** Nullable numeric override field: null clears the override. */
const rate = z.number().nonnegative().nullable().optional();

export const costBookValuesSchema = z.object({
  hoursPerUnit: rate,
  setupHours: rate,
  minTaskHours: rate,
  laborRate: rate,
  materialUnitCost: rate,
  wasteFactor: rate,
  crewSize: rate,
  equipmentCost: rate,
  otherCost: rate,
  directUnitCost: rate,
});

export const searchCostBookSchema = z.object({
  search: z.string().max(200).optional(),
  tradeKey: z.string().max(60).optional(),
  categoryKey: z.string().max(60).optional(),
  customizedOnly: z.boolean().optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
});

export const costBookEntrySchema = z.object({
  assemblyKey: z.string().min(1).max(200),
});

export const saveCompanyOverrideSchema = z.object({
  assemblyKey: z.string().min(1).max(200),
  values: costBookValuesSchema,
  productivityConvention: z.string().max(60).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export const resetCompanyOverrideSchema = costBookEntrySchema;

export const linePricingBasisSchema = z.object({
  lineId: z.string().uuid(),
});

export const saveLineRateOverrideSchema = z.object({
  lineId: z.string().uuid(),
  scope: z.enum(["estimate", "company"]),
  values: costBookValuesSchema,
  note: z.string().max(2000).nullable().optional(),
  /** When saving as a company default, also apply it to this estimate now. */
  applyToThisEstimate: z.boolean().optional(),
});

export const resetLineRateOverrideSchema = linePricingBasisSchema;

export const repriceFromCostBookSchema = z.object({
  estimateId: z.string().uuid(),
});

export const overrideHistorySchema = z.object({
  assemblyKey: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(50).optional(),
});
