import type { AuthUser } from "@/features/auth/types/auth";
import type { UserProfile } from "../types";

/**
 * Derive a human-readable display name from a signed-in user.
 * Fallback order (per Prompt 002B.1):
 *   1. profile.displayName
 *   2. profile.firstName + profile.lastName
 *   3. auth firstName + lastName (metadata)
 *   4. safe email-derived label (local part only)
 *   5. localized generic label ("User" / "Usuario") — caller supplies via `fallback`.
 */
export function resolveDisplayName(
  user: AuthUser | null,
  profile: Partial<UserProfile> | null,
  fallback: string,
): string {
  const clean = (s: string | null | undefined) => (s ?? "").trim();

  const displayName = clean(profile?.displayName);
  if (displayName) return displayName;

  const profileFull = [clean(profile?.firstName), clean(profile?.lastName)]
    .filter(Boolean)
    .join(" ");
  if (profileFull) return profileFull;

  const authFull = [clean(user?.firstName), clean(user?.lastName)].filter(Boolean).join(" ");
  if (authFull) return authFull;

  const email = clean(user?.email ?? profile?.email);
  if (email && email.includes("@")) {
    const local = email.split("@")[0];
    if (local) return local;
  }

  return fallback;
}

/**
 * Compute 1–2 uppercase initials from a display name.
 * Handles accented characters, hyphenated names, and multi-part names.
 * Examples: "Michael Cadorette" -> "MC", "Ana María López" -> "AL",
 * "jean-luc picard" -> "JP", "solo" -> "S".
 */
export function computeInitials(name: string | null | undefined, fallback = "?"): string {
  const source = (name ?? "").trim();
  if (!source) return fallback;

  // Split on whitespace and hyphens; ignore empty parts and non-letter tokens.
  const parts = source
    .split(/[\s\-·.]+/u)
    .map((p) => p.trim())
    .filter((p) => /\p{L}/u.test(p));

  if (parts.length === 0) return fallback;

  const first = firstLetter(parts[0]);
  if (parts.length === 1) return first || fallback;

  const last = firstLetter(parts[parts.length - 1]);
  return first + last || fallback;
}

function firstLetter(word: string): string {
  for (const ch of word) {
    if (/\p{L}/u.test(ch)) return ch.toLocaleUpperCase();
  }
  return "";
}
