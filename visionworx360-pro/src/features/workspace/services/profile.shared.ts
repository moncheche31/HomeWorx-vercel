import { z } from "zod";
import type { UserProfile } from "../types";

/**
 * Editable personal-profile fields.
 *
 * `email`, `role` and `organization_id` are intentionally NOT editable here:
 * email is owned by the auth account, role/organization are org-owned. The UI
 * explains this rather than silently disabling the fields.
 */
export const saveProfileSchema = z.object({
  firstName: z.string().trim().max(120).optional().nullable(),
  lastName: z.string().trim().max(120).optional().nullable(),
  displayName: z.string().trim().max(200).optional().nullable(),
  phone: z.string().trim().max(64).optional().nullable(),
  language: z.string().trim().max(16).optional().nullable(),
  timezone: z.string().trim().max(64).optional().nullable(),
  measurementPreference: z.enum(["imperial", "metric"]).optional().nullable(),
});

export type SaveProfileInput = z.infer<typeof saveProfileSchema>;

/**
 * Account (login) email validation. The address itself is changed through
 * Supabase Auth (`auth.updateUser`), never by writing `profiles.email`; this
 * schema only guards the client-side form before that request is made.
 */
export const accountEmailSchema = z.object({
  email: z.string().trim().min(1, "required").email("invalid_email").max(255, "invalid_email"),
});

export type AccountEmailInput = z.infer<typeof accountEmailSchema>;

/** Canonical `public.profiles` row -> app profile shape. */
export function mapProfileRow(row: Record<string, unknown>): Partial<UserProfile> {
  return {
    id: (row.id as string) ?? "",
    firstName: (row.first_name as string) ?? null,
    lastName: (row.last_name as string) ?? null,
    displayName: (row.display_name as string) ?? null,
    phone: (row.phone as string) ?? null,
    email: (row.email as string) ?? null,
    avatarUrl: (row.avatar_url as string) ?? null,
    ...(row.language ? { language: row.language as string } : {}),
    ...(row.role ? { role: row.role as UserProfile["role"] } : {}),
    ...(row.timezone ? { timezone: row.timezone as string } : {}),
    ...(row.measurement_preference
      ? { measurementPreference: row.measurement_preference as UserProfile["measurementPreference"] }
      : {}),
  };
}
