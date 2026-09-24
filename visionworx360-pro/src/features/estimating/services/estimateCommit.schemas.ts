import { z } from "zod";

const jsonRecord = z.record(z.string(), z.unknown());

export const canonicalScopeItemSchema = z.object({
  key: z.string().min(1).max(120),
  title: z.string().min(1).max(200),
  roomId: z.string().uuid().nullish(),
  tradeKey: z.string().max(60).nullish(),
  categoryKey: z.string().max(60).nullish(),
  subcategoryKey: z.string().max(60).nullish(),
  actionKey: z.string().max(40).nullish(),
  quantity: z.number().finite().nullish(),
  pricingQuantity: z.number().finite().nullish(),
  unitKey: z.string().max(40).nullish(),
  description: z.string().max(4000).nullish(),
  internalNotes: z.string().max(4000).nullish(),
  confirmed: z.boolean().optional(),
  /*
   * Ballpark allowance quantities commit WITH their basis, otherwise the
   * server cannot tell an assumed size from a measured one and the line is
   * saved as an unresolved placeholder that the canonical total ignores.
   */
  quantityBasis: z
    .enum(["measurement", "geometry_derived", "contractor_entered", "assumed", "catalog_default"])
    .nullish(),
  quantityBasisNote: z.string().max(500).nullish(),
});

export const canonicalBallparkSchema = z.object({
  level: z.string().min(1).max(40),
  low: z.number().finite().nonnegative(),
  expected: z.number().finite().nonnegative().nullish(),
  high: z.number().finite().nonnegative(),
  confidence: z.enum(["high", "medium", "low"]),
  laborHours: z.number().finite().nullish(),
  crewHours: z.number().finite().nullish(),
  durationDays: z.number().finite().nullish(),
  currency: z.string().max(8).optional(),
  breakdown: jsonRecord.nullish(),
});

export const commitApprovedEstimateSchema = z.object({
  projectId: z.string().uuid(),
  intakeSource: z.enum(["walkthrough", "photos_video", "describe"]),
  title: z.string().max(160).nullish(),
  items: z.array(canonicalScopeItemSchema).max(400).optional(),
  ballpark: canonicalBallparkSchema.nullish(),
  assumptions: z.array(jsonRecord).max(200).optional(),
  exclusions: z.array(jsonRecord).max(200).optional(),
  measurements: z.array(jsonRecord).max(400).optional(),
  quantities: z.array(jsonRecord).max(400).optional(),
  narrativeText: z.string().max(20000).nullish(),
  provenance: jsonRecord.nullish(),
});

export type CommitApprovedEstimateInput = z.infer<typeof commitApprovedEstimateSchema>;
