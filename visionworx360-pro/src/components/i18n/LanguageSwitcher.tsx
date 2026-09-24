import { useTranslation } from "react-i18next";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/config";

interface LanguageSwitcherProps {
  variant?: "standard" | "compact";
  className?: string;
}

const labelMap: Record<SupportedLocale, { long: string; short: string }> = {
  "en-US": { long: "English", short: "EN" },
  "es-US": { long: "Español", short: "ES" },
};

export function LanguageSwitcher({ variant = "standard", className }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation("common");
  const current =
    (i18n.language as SupportedLocale) in labelMap ? (i18n.language as SupportedLocale) : "en-US";

  const change = (next: SupportedLocale) => {
    if (next === current) return;
    void i18n.changeLanguage(next);
  };

  const groupLabel = t("language.switcherLabel");

  if (variant === "compact") {
    return (
      <div
        role="group"
        aria-label={groupLabel}
        className={cn(
          "inline-flex items-center gap-1 rounded-full border border-border bg-surface p-0.5",
          className,
        )}
      >
        {SUPPORTED_LOCALES.map((loc) => {
          const active = loc === current;
          return (
            <button
              key={loc}
              type="button"
              onClick={() => change(loc)}
              aria-pressed={active}
              aria-label={labelMap[loc].long}
              className={cn(
                "inline-flex min-h-9 min-w-11 items-center justify-center rounded-full px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground-muted hover:text-foreground",
              )}
            >
              {labelMap[loc].short}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("inline-flex items-center gap-2", className)}>
      <Languages className="size-4 text-foreground-muted" aria-hidden />
      <label htmlFor="vwx-lang" className="sr-only">
        {groupLabel}
      </label>
      <select
        id="vwx-lang"
        value={current}
        onChange={(e) => change(e.target.value as SupportedLocale)}
        aria-label={groupLabel}
        className="min-h-11 rounded-md border border-border bg-surface px-3 pr-8 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring"
      >
        {SUPPORTED_LOCALES.map((loc) => (
          <option key={loc} value={loc}>
            {labelMap[loc].long}
          </option>
        ))}
      </select>
      <span aria-live="polite" className="sr-only">
        {t("language.changed", { language: labelMap[current].long })}
      </span>
    </div>
  );
}
