/**
 * Configurable support contact.
 *
 * Set `VITE_SUPPORT_CONTACT` (e.g. a support inbox or help URL) so the pilot
 * contact point can change without a code edit. No personal address is
 * hardcoded — when unset, the in-app Support & Feedback form is the only
 * channel shown.
 */
export function getSupportContact(): string | null {
  const raw = (import.meta.env as Record<string, unknown>)["VITE_SUPPORT_CONTACT"];
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length > 0 ? value : null;
}
