import { cn } from "@/lib/utils";

export function CurrencyValue({
  amount,
  currency = "USD",
  locale = "en-US",
  className,
}: {
  amount: number;
  currency?: string;
  locale?: string;
  className?: string;
}) {
  /* Whole-dollar money policy: no cents anywhere in the estimator. */
  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.round(Number.isFinite(amount) ? amount : 0));
  return (
    <span className={cn("font-mono tabular-nums font-semibold text-foreground", className)}>
      {formatted}
    </span>
  );
}

export function PercentageValue({
  value,
  locale = "en-US",
  className,
}: {
  value: number;
  locale?: string;
  className?: string;
}) {
  const formatted = new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value);
  return <span className={cn("tabular-nums", className)}>{formatted}</span>;
}

export function MeasurementValue({
  value,
  unit,
  className,
}: {
  value: number;
  unit: string;
  className?: string;
}) {
  return (
    <span className={cn("tabular-nums", className)}>
      {value.toLocaleString()} <span className="text-foreground-muted">{unit}</span>
    </span>
  );
}

export function DateValue({
  date,
  locale = "en-US",
  className,
}: {
  date: Date | string;
  locale?: string;
  className?: string;
}) {
  const d = typeof date === "string" ? new Date(date) : date;
  const formatted = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  }).format(d);
  return (
    <time dateTime={d.toISOString()} className={cn("tabular-nums", className)}>
      {formatted}
    </time>
  );
}
