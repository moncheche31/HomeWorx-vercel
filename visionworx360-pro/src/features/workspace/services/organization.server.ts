import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Organization, UserProfile } from "../types";
import { mapOrgRow, type SaveOrgInput } from "./organization.shared";
import { mapProfileRow } from "./profile.shared";

export interface WorkspaceLookupResult {
  organization: Organization | null;
  /** Canonical `public.profiles` row for the signed-in user (partial shape). */
  profile: Partial<UserProfile> | null;
  trace: {
    profileLookupStatus: "found" | "missing";
    organizationIdPresent: boolean;
    membershipStatus: "verified" | "missing" | "not-applicable";
    organizationLookupStatus: "found" | "missing" | "not-applicable";
  };
}

export async function resolveMyWorkspace(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<WorkspaceLookupResult> {
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`Profile lookup failed: ${profileError.code}`);
  if (!profile) {
    return {
      organization: null,
      profile: null,
      trace: {
        profileLookupStatus: "missing",
        organizationIdPresent: false,
        membershipStatus: "not-applicable",
        organizationLookupStatus: "not-applicable",
      },
    };
  }
  const mappedProfile = mapProfileRow(profile as Record<string, unknown>);
  const orgId = (profile as { organization_id: string | null }).organization_id;
  if (!orgId) {
    return {
      organization: null,
      profile: mappedProfile,
      trace: {
        profileLookupStatus: "found",
        organizationIdPresent: false,
        membershipStatus: "not-applicable",
        organizationLookupStatus: "not-applicable",
      },
    };
  }


  const { data: membership, error: membershipError } = await supabase
    .from("user_roles")
    .select("organization_id")
    .eq("user_id", userId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (membershipError) throw new Error(`Membership lookup failed: ${membershipError.code}`);
  if (!membership) throw new Error("Membership lookup failed: missing");

  const { data: row, error: organizationError } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", orgId)
    .maybeSingle();
  if (organizationError) throw new Error(`Organization lookup failed: ${organizationError.code}`);
  if (!row) throw new Error("Organization lookup failed: missing");
  return {
    organization: mapOrgRow(row as Record<string, unknown>),
    profile: mappedProfile,
    trace: {
      profileLookupStatus: "found",
      organizationIdPresent: true,
      membershipStatus: "verified",
      organizationLookupStatus: "found",
    },
  };
}

export async function saveMyOrganization(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: SaveOrgInput,
): Promise<Organization> {
  const { data: existingProfile, error: profileError } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) throw new Error(`Profile lookup failed: ${profileError.code}`);
  const payload = {
    organization_name: data.organizationName,
    business_name: data.businessName || null,
    license_state: data.licenseState || null,
    license_number: data.licenseNumber || null,
    primary_trade: data.primaryTrade || null,
    phone: data.phone || null,
    email: data.email || null,
    website: data.website || null,
    address_line1: data.addressLine1 || null,
    address_line2: data.addressLine2 || null,
    city: data.city || null,
    region: data.region || null,
    postal_code: data.postalCode || null,
    country: data.country || null,
    ...(data.taxRate != null ? { tax_rate: data.taxRate } : {}),
    ...(data.timezone ? { timezone: data.timezone } : {}),
    ...(data.language ? { language: data.language } : {}),
    ...(data.measurementSystem ? { measurement_system: data.measurementSystem } : {}),
    ...(data.currency ? { currency: data.currency } : {}),
    ...(data.defaultLaborRate != null ? { default_labor_rate: data.defaultLaborRate } : {}),
    ...(data.defaultProductivityMultiplier != null
      ? { default_productivity_multiplier: data.defaultProductivityMultiplier }
      : {}),
    ...(data.defaultCrewSize != null ? { default_crew_size: data.defaultCrewSize } : {}),
    ...(data.defaultProductiveHoursPerDay != null
      ? { default_productive_hours_per_day: data.defaultProductiveHoursPerDay }
      : {}),
    ...(data.defaultPricingMethod != null
      ? { default_pricing_method: data.defaultPricingMethod }
      : {}),
    ...(data.defaultTargetGrossMarginPct != null
      ? { default_target_gross_margin_pct: data.defaultTargetGrossMarginPct }
      : {}),
    ...(data.defaultOverheadPct != null ? { default_overhead_pct: data.defaultOverheadPct } : {}),
    ...(data.defaultProfitPct != null ? { default_profit_pct: data.defaultProfitPct } : {}),
  };
  const orgId = existingProfile?.organization_id ?? null;
  if (orgId) {
    const { data: updated, error } = await supabase
      .from("organizations").update(payload as never).eq("id", orgId).select("*").single();
    if (error) throw new Error(error.message);
    return mapOrgRow(updated as Record<string, unknown>);
  }
  const { data: created, error } = await supabase.rpc("create_organization_for_current_user", { payload });
  if (error) throw new Error(error.message);
  if (!created) throw new Error("Failed to create organization");
  return mapOrgRow(created as Record<string, unknown>);
}
