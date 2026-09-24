/**
 * Material pricing provider settings (server functions).
 *
 * The API key is write-only from the client's point of view: it is stored via
 * the admin client and never returned by any of these functions.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MATERIAL_PRICING_PROVIDER_TYPES,
  type MaterialPricingProviderStatus,
  type MaterialPricingProviderType,
} from "@/domains/materialPricing/types";
import { providerTypeSchema, saveMaterialProviderSchema } from "./materialPricing.schemas";

type SB = { from: (t: string) => any; rpc: (f: string, a?: unknown) => any };

async function resolveOrg(sb: SB): Promise<string> {
  const { data, error } = await sb.rpc("current_active_organization_id");
  if (error || !data) throw new Error("No active organization");
  return data as string;
}

function statusFor(
  providerType: MaterialPricingProviderType,
  label: string,
  row: Record<string, unknown> | undefined,
): MaterialPricingProviderStatus {
  return {
    providerType,
    displayName: label,
    isConfigured: !!row,
    isEnabled: row ? row.is_enabled !== false : false,
    lastVerifiedAt: (row?.last_verified_at as string | null) ?? null,
    lastVerifyStatus: (row?.last_verify_status as string | null) ?? null,
    lastVerifyError: (row?.last_verify_error as string | null) ?? null,
  };
}

/** Configuration status for every registered provider. Never returns keys. */
export const listMaterialPricingProviderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MaterialPricingProviderStatus[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { materialPricingProviderLabel } = await import("./materialPricing.server");
    const { data } = await sb
      .from("material_pricing_providers")
      .select(
        "provider_type, is_enabled, last_verified_at, last_verify_status, last_verify_error",
      )
      .eq("organization_id", org);
    const rows = ((data as Record<string, unknown>[] | null) ?? []).reduce(
      (acc, row) => acc.set(row.provider_type as string, row),
      new Map<string, Record<string, unknown>>(),
    );
    return MATERIAL_PRICING_PROVIDER_TYPES.map((type) =>
      statusFor(type, materialPricingProviderLabel(type), rows.get(type)),
    );
  });

/** Store (or replace) an org's API key for a provider. */
export const saveMaterialPricingProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => saveMaterialProviderSchema.parse(d))
  .handler(async ({ data, context }): Promise<MaterialPricingProviderStatus> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { error } = await sb.from("material_pricing_providers").upsert(
      {
        organization_id: org,
        provider_type: data.providerType,
        api_key: data.apiKey,
        is_enabled: data.isEnabled ?? true,
        last_verified_at: null,
        last_verify_status: null,
        last_verify_error: null,
      },
      { onConflict: "organization_id,provider_type" },
    );
    if (error) throw new Error(error.message ?? "Failed to save provider key");

    const { materialPricingProviderLabel } = await import("./materialPricing.server");
    return statusFor(
      data.providerType as MaterialPricingProviderType,
      materialPricingProviderLabel(data.providerType as MaterialPricingProviderType),
      { is_enabled: data.isEnabled ?? true },
    );
  });

export const removeMaterialPricingProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providerTypeSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ removed: boolean }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { error } = await sb
      .from("material_pricing_providers")
      .delete()
      .eq("organization_id", org)
      .eq("provider_type", data.providerType);
    if (error) throw new Error(error.message ?? "Failed to remove provider");
    return { removed: true };
  });

/**
 * "Does this key work" ping. Records the outcome so the settings card can show
 * the last verification without re-calling the vendor.
 */
export const verifyMaterialPricingProvider = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => providerTypeSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string | null }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const providerType = data.providerType as MaterialPricingProviderType;

    const { loadProviderConfig } = await import("./materialPricing.server");
    const { createMaterialPricingProvider } = await import(
      "@/domains/materialPricing/registry"
    );
    const config = await loadProviderConfig(org, providerType);
    if (!config) return { ok: false, message: "No API key stored for this provider." };

    const provider = createMaterialPricingProvider({
      providerType: config.providerType,
      apiKey: config.apiKey,
    });
    if (!provider) return { ok: false, message: "Provider adapter is not available." };

    let result = { ok: false, message: null as string | null };
    try {
      const verified = await provider.verifyCredentials();
      result = { ok: verified.ok, message: verified.message ?? null };
    } catch (err) {
      result = { ok: false, message: err instanceof Error ? err.message : "Verification failed" };
    }

    await sb
      .from("material_pricing_providers")
      .update({
        last_verified_at: new Date().toISOString(),
        last_verify_status: result.ok ? "ok" : "failed",
        last_verify_error: result.ok ? null : result.message,
      })
      .eq("organization_id", org)
      .eq("provider_type", providerType);

    return result;
  });
