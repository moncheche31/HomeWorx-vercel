import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { Footprints, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  projectId: string | null;
  projectName: string | null;
  /** Stay in this page and run the full room-by-room walkthrough. */
  onChooseDetailed: () => void;
}

/**
 * The fork every on-site estimate starts at: a fast spoken ballpark, or the
 * full room-by-room walkthrough. Both write to the same project.
 */
export function WalkthroughModeChooser({ projectId, projectName, onChooseDetailed }: Props) {
  const { t } = useTranslation("ballpark");
  const search = projectId ? { projectId, projectName: projectName ?? undefined } : {};

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-foreground">{t("chooser.title")}</h2>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Zap className="size-4 text-accent" aria-hidden />
              {t("chooser.quick")}
            </p>
            <p className="text-sm text-foreground-muted">{t("chooser.quickHint")}</p>
          </div>
          <Button asChild className="min-h-14 w-full text-base sm:w-auto">
            <Link to="/app/ballpark" search={search}>
              {t("chooser.quickCta")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-5">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Footprints className="size-4 text-primary" aria-hidden />
              {t("chooser.detailed")}
            </p>
            <p className="text-sm text-foreground-muted">{t("chooser.detailedHint")}</p>
          </div>
          <Button
            variant="outline"
            className="min-h-14 w-full text-base sm:w-auto"
            onClick={onChooseDetailed}
          >
            {t("chooser.detailedCta")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
