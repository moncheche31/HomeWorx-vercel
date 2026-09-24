import { useTranslation } from "react-i18next";

export function useLocale(): string {
  const { i18n } = useTranslation();
  return i18n.language || "en-US";
}

export function formatCurrency(value: number, locale: string, currency = "USD") {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    /* Whole-dollar money policy: the estimator never shows cents. */
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(Number.isFinite(value) ? value : 0));
}

export function formatNumber(value: number, locale: string, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatPercent(value: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatDate(date: Date | string, locale: string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(d);
}

export function formatTime(date: Date | string, locale: string) {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(d);
}

/** Format decimal feet as feet-inches, e.g. 8.5 -> 8' 6" (en) / 8' 6" (es uses same unit symbols). */
export function formatFeetInches(decimalFeet: number, locale: string) {
  const totalInches = Math.round(decimalFeet * 12);
  const ft = Math.trunc(totalInches / 12);
  const inches = Math.abs(totalInches % 12);
  const ftLabel = new Intl.NumberFormat(locale).format(ft);
  const inLabel = new Intl.NumberFormat(locale).format(inches);
  return `${ftLabel}′ ${inLabel}″`;
}

export function formatMeasurement(value: number, unit: string, locale: string) {
  return `${new Intl.NumberFormat(locale).format(value)} ${unit}`;
}
