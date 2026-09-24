/**
 * Server-only material pricing plumbing.
 *
 * The stored API key is read HERE and nowhere else. The `api_key` column has
 * no Data API grant, so it is only reachable with the admin client from inside
 * a server handler.
 */

import {
  createMaterialPricingProvider,
  materialPricingProviderLabel,
} from "@/domains/materialPricing/registry";
import {
  resolveMaterialUnitCost,
  materialPriceSourceOf,
} from "@/domains/materialPricing/service";
import type {
  MaterialPricingProvider,
  MaterialPricingProviderType,
} from "@/domains/materialPricing/types";

export { materialPriceSourceOf };

export interface StoredProviderConfig {
  providerType: MaterialPricingProviderType;
  apiKey: string;
  isEnabled: boolean;
}

/** Read the org's active provider credential. Null when nothing is configured. */
export async function loadProviderConfig(
  organizationId: string,
  providerType?: MaterialPricingProviderType,
): Promise<StoredProviderConfig | null> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("material_pricing_providers")
      .select("provider_type, api_key, is_enabled")
      .eq("organization_id", organizationId);
    if (providerType) q = q.eq("provider_type", providerType);
    const { data, error } = await q.limit(1).maybeSingle();
    if (error || !data) return null;
    const row = data as { provider_type: string; api_key: string | null; is_enabled: boolean };
    if (!row.api_key) return null;
    return {
      providerType: row.provider_type as MaterialPricingProviderType,
      apiKey: row.api_key,
      isEnabled: row.is_enabled !== false,
    };
  } catch {
    return null;
  }
}

/** Build a usable provider for an org, or null (→ static catalog pricing). */
export async function resolveOrgProvider(
  organizationId: string,
): Promise<{ provider: MaterialPricingProvider | null; enabled: boolean }> {
  const config = await loadProviderConfig(organizationId);
  if (!config) return { provider: null, enabled: false };
  if (!config.isEnabled) return { provider: null, enabled: false };
  return {
    provider: createMaterialPricingProvider({
      providerType: config.providerType,
      apiKey: config.apiKey,
    }),
    enabled: true,
  };
}

export { resolveMaterialUnitCost, materialPricingProviderLabel };
