import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Organization } from "../types";
import { mapOrgRow } from "./organization.shared";
import {
  PRIMARY_BUSINESS_TYPES,
  PREFERRED_PROJECT_SCALES,
} from "@/features/crm/catalog/businessProfile";
import {
  PROJECT_CATEGORY_KEYS,
  ALL_PROJECT_TYPE_KEYS,
} from "@/features/crm/catalog/projectTypes";

/** Roles allowed to edit the organization business profile. */
const EDITOR_ROLES = new Set(["owner", "administrator"]);

const businessProfileSchema = z.object({
  primaryBusinessType: z
    .union([z.literal(""), z.enum(PRIMARY_BUSINESS_TYPES)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
  secondaryBusinessTypes: z
    .array(z.enum(PRIMARY_BUSINESS_TYPES))
    .max(20)
    .optional()
    .default([]),
  serviceSpecialties: z
    .array(z.string().max(64))
    .max(64)
    .optional()
    .default([]),
  preferredProjectScale: z
    .union([z.literal(""), z.enum(PREFERRED_PROJECT_SCALES)])
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

const KNOWN_SPECIALTY = new Set<string>([
  ...PROJECT_CATEGORY_KEYS,
  ...ALL_PROJECT_TYPE_KEYS,
]);

export const saveBusinessProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => businessProfileSchema.parse(d))
  .handler(async ({ data, context }): Promise<Organization> => {
    // Derive the caller's active organization server-side; never trust the browser.
    const { data: profile, error: profErr } = await context.supabase
      .from("profiles")
      .select("organization_id")
      .eq("id", context.userId)
      .maybeSingle();
    if (profErr) throw new Error(profErr.message);
    const orgId = profile?.organization_id;
    if (!orgId) throw new Error("No active organization");

    // Role guard: only owner / administrator may edit the business profile.
    const { data: roleRow, error: roleErr } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (roleErr) throw new Error(roleErr.message);
    if (!roleRow || !EDITOR_ROLES.has(roleRow.role as string)) {
      throw new Error("Forbidden");
    }

    // Server-side array validation against the catalog.
    const specialties = (data.serviceSpecialties ?? []).filter((s) =>
      KNOWN_SPECIALTY.has(s),
    );
    const secondaries = data.secondaryBusinessTypes ?? [];

    const patch = {
      primary_business_type: data.primaryBusinessType ?? null,
      secondary_business_types: secondaries,
      service_specialties: specialties,
      preferred_project_scale: data.preferredProjectScale ?? null,
    };

    const { data: updated, error } = await context.supabase
      .from("organizations")
      .update(patch as never)
      .eq("id", orgId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return mapOrgRow(updated as Record<string, unknown>);
  });
