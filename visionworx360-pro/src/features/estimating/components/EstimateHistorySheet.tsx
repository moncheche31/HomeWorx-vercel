import { useTranslation } from "react-i18next";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLocale, formatDate } from "@/i18n/format";
import { useEstimateAuditQuery } from "../hooks/useEstimating";

export function EstimateHistorySheet({
  open, onOpenChange, estimateId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  estimateId: string;
}) {
  const { t } = useTranslation("estimating");
  const locale = useLocale();
  const q = useEstimateAuditQuery(open ? estimateId : undefined);
  const events = q.data ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t("history.title")}</SheetTitle>
        </SheetHeader>
        <ul className="mt-4 space-y-3 px-4 pb-8">
          {events.length === 0 ? (
            <li className="text-sm text-foreground-muted">{t("history.empty")}</li>
          ) : null}
          {events.map((e) => (
            <li key={e.id} className="border-b border-border pb-2 last:border-b-0">
              <p className="text-sm font-medium">
                {t(`history.${e.eventType}`, { defaultValue: e.eventType })}
              </p>
              {e.summary ? (
                <p className="text-sm text-foreground-muted">{e.summary}</p>
              ) : null}
              <p className="text-xs text-foreground-muted">
                {formatDate(e.createdAt, locale)}
              </p>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
