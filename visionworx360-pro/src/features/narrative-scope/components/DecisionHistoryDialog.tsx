import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answers: Record<string, string>;
}

/**
 * Where clarification and Estimate Review decisions live now.
 *
 * The durable record keeps every decision; the contractor-facing Scope of Work
 * keeps none of them. This opt-in surface is the only place the individual
 * accepted/removed items are enumerated.
 */
export function DecisionHistoryDialog({ open, onOpenChange, answers }: Props) {
  const { t } = useTranslation("narrative");

  const entries = Object.entries(answers ?? {}).filter(([, value]) => value.trim().length > 0);
  const decisions = entries.filter(([key]) => key.startsWith("review."));
  const clarifications = entries.filter(([key]) => !key.startsWith("review."));
  const accepted = decisions.filter(([, v]) => v === "accepted").length;
  const removed = decisions.filter(([, v]) => v === "removed").length;

  const label = (key: string) => key.replace(/^review\./, "").replace(/[._]/g, " ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("history.title")}</DialogTitle>
          <DialogDescription>
            {t("history.summary", { accepted, removed })}
          </DialogDescription>
        </DialogHeader>

        {decisions.length === 0 && clarifications.length === 0 ? (
          <p className="text-base text-foreground-muted">{t("history.empty")}</p>
        ) : (
          <div className="space-y-5">
            {decisions.length ? (
              <section>
                <h3 className="text-base font-semibold">{t("history.decisions")}</h3>
                <ul className="mt-2 space-y-1">
                  {decisions.map(([key, value]) => (
                    <li key={key} className="flex justify-between gap-3 text-sm">
                      <span className="capitalize text-foreground">{label(key)}</span>
                      <span className="text-foreground-muted">
                        {t(`history.status.${value}`, { defaultValue: value })}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {clarifications.length ? (
              <section>
                <h3 className="text-base font-semibold">{t("history.clarifications")}</h3>
                <ul className="mt-2 space-y-1">
                  {clarifications.map(([key, value]) => (
                    <li key={key} className="text-sm text-foreground">
                      {value}
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
