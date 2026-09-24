import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { JsonObject, OrganizationProduct, ProductAccessStatus } from "../types";

const activeOrganizationSchema = z.object({ organizationId: z.string().uuid() });

/** List product-access rows for the caller's active organization. */
export const listActiveOrganizationProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => activeOrganizationSchema.parse(data))
  .handler(async ({ context, data }): Promise<OrganizationProduct[]> => {
    const { data: rows, error } = await context.supabase
      .from("organization_products")
      .select("product_key, access_status, settings")
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r: Record<string, unknown>) => ({
      productKey: String(r.product_key),
      accessStatus: r.access_status as ProductAccessStatus,
      settings: ((r.settings as JsonObject | null) ?? {}) as JsonObject,
    }));
  });

const updateAccessSchema = z.object({
  productKey: z.string().trim().min(1).max(64),
  accessStatus: z.enum(["active", "revoked"]),
  settings: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Grant / revoke / update settings for a product on the caller's active org.
 * Ignores any organization_id supplied by the browser. Row-level authorization
 * (owner/administrator only) is enforced by RLS policies.
 */
export const updateActiveOrganizationProductAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateAccessSchema.parse(d))
  .handler(async ({ data, context }): Promise<OrganizationProduct> => {
    const { data: profile, error: profileError } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profileError) throw new Error(profileError.message);
    const orgId = profile?.organization_id;
    if (!orgId) throw new Error("No active organization");

    const payload = {
      organization_id: orgId,
      product_key: data.productKey,
      access_status: data.accessStatus,
      ...(data.settings ? { settings: data.settings } : {}),
    };

    const { data: row, error } = await context.supabase
      .from("organization_products")
      .upsert(payload as never, { onConflict: "organization_id,product_key" })
      .select("product_key, access_status, settings")
      .single();

    if (error) throw new Error(error.message);
    const r = row as Record<string, unknown>;
    return {
      productKey: String(r.product_key),
      accessStatus: r.access_status as ProductAccessStatus,
      settings: ((r.settings as JsonObject | null) ?? {}) as JsonObject,
    };
  });
