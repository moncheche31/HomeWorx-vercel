/**
 * Partially obscure an email for display in the email-confirmation UI.
 * Keeps the first character of the local part when possible, plus the domain.
 * Never returns nothing on non-empty input.
 */
export function maskEmail(email?: string | null): string {
  if (!email) return "";
  const trimmed = email.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return "•••";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const shown = local.length <= 2 ? local[0] ?? "" : local.slice(0, 2);
  const hiddenCount = Math.max(1, local.length - shown.length);
  return `${shown}${"•".repeat(hiddenCount)}@${domain}`;
}
