import { useTranslation } from "react-i18next";
import { AlertTriangle, ShieldQuestion } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BallparkDisclaimerTemplate } from "@/domains/ballpark";

interface Props {
  disclaimers: BallparkDisclaimerTemplate[];
}

/**
 * Plain-language preliminary-estimate notice. Template text only — the launch
 * checklist still requires counsel review, which we say out loud in the app so
 * nobody mistakes this for legal protection.
 */
export function BallparkDisclaimer({ disclaimers }: Props) {
  const { t } = useTranslation("ballpark");
  if (disclaimers.length === 0) return null;

  return (
    <Card className="border-warning/40 bg-warning/5">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          {t(disclaimers[0].titleKey)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {disclaimers.map((disclaimer) => (
          <div key={disclaimer.key} className="space-y-2">
            <p className="text-sm text-foreground">{t(disclaimer.bodyKey)}</p>
            {disclaimer.bulletKeys.length > 0 ? (
              <ul className="grid gap-1 sm:grid-cols-2">
                {disclaimer.bulletKeys.map((key) => (
                  <li key={key} className="text-sm text-foreground-muted">
                    • {t(key)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
        {disclaimers.some((d) => d.requiresCounselReview) ? (
          <p className="flex items-start gap-2 rounded-lg border border-border bg-background p-3 text-xs text-foreground-muted">
            <ShieldQuestion className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("disclaimer.counselReview")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
