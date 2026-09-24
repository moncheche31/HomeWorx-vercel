import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "hero" | "inline";
  className?: string;
}

/**
 * The single primary entry point into Guided Mode. Advanced Edit (the manual
 * Scope Builder) stays where it is — both edit the same records.
 */
export function StartWalkthroughButton({ variant = "inline", className }: Props) {
  const { t } = useTranslation("walkthrough");

  if (variant === "hero") {
    return (
      <div className={cn("rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5", className)}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold text-foreground">{t("cta.start")}</p>
            <p className="text-sm text-foreground-muted">{t("cta.description")}</p>
          </div>
          <Button asChild className="min-h-14 w-full text-base sm:w-auto">
            <Link to="/app/walkthrough">
              <Mic className="mr-2 size-5" aria-hidden />
              {t("cta.start")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button asChild className={cn("min-h-12 w-full sm:w-auto", className)}>
      <Link to="/app/walkthrough">
        <Mic className="mr-2 size-4" aria-hidden />
        {t("cta.start")}
      </Link>
    </Button>
  );
}
