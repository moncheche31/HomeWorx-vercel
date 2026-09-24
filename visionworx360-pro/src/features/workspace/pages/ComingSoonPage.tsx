import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  titleKey: string;
  messageKey: string;
}

export function ComingSoonPage({ titleKey, messageKey }: Props) {
  const { t } = useTranslation("workspace");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col items-stretch px-4 py-10 sm:px-6">
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-primary/10 text-primary">
            <Sparkles className="size-7" aria-hidden />
          </span>
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            {t("comingSoon.eyebrow")}
          </p>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{t(titleKey)}</h1>
          <p className="max-w-lg text-sm text-foreground-muted">{t(messageKey)}</p>
          <Button asChild variant="outline" className="mt-2 min-h-11">
            <Link to="/app/dashboard">
              <ArrowLeft className="mr-2 size-4" aria-hidden />
              {t("comingSoon.backToDashboard")}
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
