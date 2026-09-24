import { z } from "zod";

export const permitPlanRequestSchema = z.object({
  projectId: z.string().uuid(),
  estimateId: z.string().uuid(),
});

export const applyPermitPlanSchema = permitPlanRequestSchema;

export type PermitPlanRequest = z.infer<typeof permitPlanRequestSchema>;
