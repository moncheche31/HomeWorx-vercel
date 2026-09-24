import { useTranslation } from "react-i18next";
import { Camera, Footprints, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { BallparkIntakeSource } from "@/domains/ballpark";

interface Props {
  onChoose: (source: BallparkIntakeSource) => void;
}

const OPTIONS: {
  source: BallparkIntakeSource;
  icon: typeof Camera;
  titleKey: string;
  hintKey: string;
  ctaKey: string;
}[] = [
  {
    source: "onsite",
    icon: Footprints,
    titleKey: "intake.onsite.title",
    hintKey: "intake.onsite.hint",
    ctaKey: "intake.onsite.cta",
  },
  {
    source: "photos",
    icon: Camera,
    titleKey: "intake.photos.title",
    hintKey: "intake.photos.hint",
    ctaKey: "intake.photos.cta",
  },
  {
    source: "description",
    icon: MessageSquareText,
    titleKey: "intake.description.title",
    hintKey: "intake.description.hint",
    ctaKey: "intake.description.cta",
  },
];

/**
 * The single fork for every ballpark. All three paths land on the same engine,
 * the same assumption ledger and the same preliminary range.
 */
export function IntakeSourceChooser({ onChoose }: Props) {
  const { t } = useTranslation("ballpark");

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-foreground">{t("intake.title")}</h2>
        <p className="text-sm text-foreground-muted">{t("intake.subtitle")}</p>
      </div>

      {OPTIONS.map(({ source, icon: Icon, titleKey, hintKey, ctaKey }) => (
        <Card key={source}>
          <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Icon className="size-4 text-primary" aria-hidden />
                {t(titleKey)}
              </p>
              <p className="text-sm text-foreground-muted">{t(hintKey)}</p>
              {t(`intake.${source}.help`, { defaultValue: "" }) ? (
                <p className="text-xs text-foreground-muted">
                  {t(`intake.${source}.help`, { defaultValue: "" })}
                </p>
              ) : null}
            </div>
            <Button
              variant={source === "onsite" ? "default" : "outline"}
              className="min-h-(--control-min-h) w-full text-base sm:w-auto"
              onClick={() => onChoose(source)}
            >
              {t(ctaKey)}
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
