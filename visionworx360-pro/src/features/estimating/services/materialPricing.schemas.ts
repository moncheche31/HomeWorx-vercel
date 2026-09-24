import { z } from "zod";
import { MATERIAL_PRICING_PROVIDER_TYPES } from "@/domains/materialPricing/types";

const providerType = z.enum(
  MATERIAL_PRICING_PROVIDER_TYPES as unknown as [string, ...string[]],
);

export const saveMaterialProviderSchema = z.object({
  providerType,
  /** Blank is rejected: clearing a key is `removeMaterialPricingProvider`. */
  apiKey: z.string().trim().min(8).max(512),
  isEnabled: z.boolean().optional(),
});

export const providerTypeSchema = z.object({ providerType });
