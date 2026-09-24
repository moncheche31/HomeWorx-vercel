import { useTranslation } from "react-i18next";
import { Progress } from "@/components/ui/progress";
import { WALKTHROUGH_STEPS, stepProgress, type WalkthroughStep } from "@/domains/walkthrough";

export function StepProgress({ step }: { step: WalkthroughStep }) {
  const { t } = useTranslation("walkthrough");
  const { current, total } = stepProgress(step);
  const value = Math.round((current / total) * 100);

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <p className="truncate text-sm font-semibold text-foreground">{t(`steps.${step}.title`)}</p>
        <span className="shrink-0 text-xs font-medium text-foreground-muted">
          {t("progress.counter", { current, total })}
        </span>
      </div>
      <Progress value={value} aria-label={t("progress.label")} />
      <p className="text-xs text-foreground-muted">{t(`steps.${step}.hint`)}</p>
      <span className="sr-only">
        {WALKTHROUGH_STEPS.map((s) => t(`steps.${s}.title`)).join(", ")}
      </span>
    </div>
  );
}
