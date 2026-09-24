import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { UserProfile } from "../types";
import { mapProfileRow, type SaveProfileInput } from "./profile.shared";

/**
 * Update the signed-in user's own `public.profiles` row.
 *
 * Only whitelisted personal fields are written: `role`, `organization_id` and
 * `email` are never accepted from the client, so a caller cannot escalate a
 * role or move themselves into another organization. RLS additionally scopes
 * the statement to `auth.uid() = id`.
 *
 * Blank strings are stored as NULL; fields omitted from the payload are left
 * untouched so an existing value is never reset during a partial save.
 */
export async function saveMyProfile(
  supabase: SupabaseClient<Database>,
  userId: string,
  data: SaveProfileInput,
): Promise<Partial<UserProfile>> {
  const text = (v: string | null | undefined) => {
    if (v === undefined) return undefined;
    const trimmed = (v ?? "").trim();
    return trimmed === "" ? null : trimmed;
  };

  const payload: Record<string, unknown> = {};
  const first = text(data.firstName);
  const last = text(data.lastName);
  const display = text(data.displayName);
  const phone = text(data.phone);
  if (first !== undefined) payload.first_name = first;
  if (last !== undefined) payload.last_name = last;
  if (display !== undefined) payload.display_name = display;
  if (phone !== undefined) payload.phone = phone;
  if (data.language) payload.language = data.language;
  if (data.timezone) payload.timezone = data.timezone;
  if (data.measurementPreference) payload.measurement_preference = data.measurementPreference;

  if (Object.keys(payload).length === 0) {
    const { data: row, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Profile lookup failed: missing");
    return mapProfileRow(row as Record<string, unknown>);
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update(payload as never)
    .eq("id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!updated) throw new Error("Profile update failed: missing");
  return mapProfileRow(updated as Record<string, unknown>);
}


/**
 * Mirror the verified auth email onto the canonical `public.profiles` row.
 *
 * The authoritative account email lives in Supabase Auth. After a user
 * confirms an email change, the profile mirror is stale, so this copies the
 * value straight from the validated bearer-token claims — never from client
 * input — keeping the two in sync without allowing a spoofed address.
 */
export async function syncMyProfileEmail(
  supabase: SupabaseClient<Database>,
  userId: string,
  authEmail: string | null | undefined,
): Promise<Partial<UserProfile>> {
  const email = (authEmail ?? "").trim().toLowerCase();
  const { data: row, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Profile lookup failed: missing");

  const current = ((row as { email: string | null }).email ?? "").trim().toLowerCase();
  if (!email || email === current) return mapProfileRow(row as Record<string, unknown>);

  const { data: updated, error: updateError } = await supabase
    .from("profiles")
    .update({ email } as never)
    .eq("id", userId)
    .select("*")
    .maybeSingle();
  if (updateError) throw new Error(updateError.message);
  if (!updated) throw new Error("Profile update failed: missing");
  return mapProfileRow(updated as Record<string, unknown>);
}
