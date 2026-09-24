import type { ClientDTO } from "../services/types";

export function clientDisplayName(c: ClientDTO): string {
  if (c.company) return c.company;
  const name = [c.firstName, c.lastName].filter(Boolean).join(" ").trim();
  return name || c.email || c.phone || "Unnamed client";
}

export function clientInitials(c: ClientDTO): string {
  const src = c.company || [c.firstName, c.lastName].filter(Boolean).join(" ");
  return (src || "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

export function formatMoney(
  v: number | null | undefined,
  currency = "USD",
  locale = "en-US",
): string {
  if (v == null || Number.isNaN(v)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `$${v}`;
  }
}
