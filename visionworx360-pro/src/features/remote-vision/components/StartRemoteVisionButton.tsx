import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  variant?: "hero" | "inline";
  className?: string;
}

/**
 * Second estimating entry point (Module 011). Sits alongside the walkthrough
 * without replacing it — both end at the same narrative Scope of Work.
 */
export function StartRemoteVisionButton({ variant = "inline", className }: Props) {
  const { t } = useTranslation("remote-vision");

  if (variant === "hero") {
    return (
      <div className={cn("rounded-xl border border-accent/30 bg-accent/5 p-4 sm:p-5", className)}>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0 space-y-1">
            <p className="text-base font-semibold text-foreground">{t("cta.start")}</p>
            <p className="text-sm text-foreground-muted">{t("cta.description")}</p>
          </div>
          <Button asChild variant="outline" className="min-h-14 w-full text-base sm:w-auto">
            <Link to="/app/remote-vision">
              <Camera className="mr-2 size-5" aria-hidden />
              {t("cta.start")}
            </Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <Button asChild variant="outline" className={cn("min-h-12 w-full", className)}>
      <Link to="/app/remote-vision">
        <Camera className="mr-2 size-5" aria-hidden />
        {t("cta.start")}
      </Link>
    </Button>
  );
}
