import { useTranslation } from "react-i18next";
import { ChevronLeft, ListChecks, Pencil } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BallparkInputLedger, BallparkInputRecord } from "@/domains/ballpark";

/** Where a value came from, in the contractor's language. */
export type AssumptionSource = "contractor" | "photo" | "assumed" | "unknown";

interface Row {
  record: BallparkInputRecord;
  source: AssumptionSource;
}

interface Props {
  ledger: BallparkInputLedger;
  /** Jump to the question behind a row. */
  onEdit: (key: string) => void;
  onBack: () => void;
  onContinue: () => void;
}

const BADGE_VARIANT: Record<AssumptionSource, "secondary" | "outline"> = {
  contractor: "secondary",
  photo: "outline",
  assumed: "outline",
  unknown: "outline",
};

/**
 * The last stop before a number is produced.
 *
 * Every input the range rests on, grouped by where it came from and editable
 * in one tap. Photo-derived values are labelled as clues, never measurements,
 * and anything still unknown is shown as unknown rather than quietly filled
 * in — an unknown widens the range, it does not disappear.
 */
export function AssumptionsReviewPanel({ ledger, onEdit, onBack, onContinue }: Props) {
  const { t } = useTranslation("ballpark");

  const rows: Row[] = [
    ...[...(ledger.known ?? []), ...(ledger.measured ?? []), ...(ledger.observed ?? [])].map(
      (record) => ({ record, source: "contractor" as const }),
    ),
    ...(ledger.inferred ?? []).map((record) => ({ record, source: "photo" as const })),
    ...(ledger.assumed ?? []).map((record) => ({ record, source: "assumed" as const })),
    ...(ledger.unknown ?? []).map((record) => ({ record, source: "unknown" as const })),
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <ListChecks className="size-4 text-primary" aria-hidden />
          {t("assumptionsReview.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-muted">{t("assumptionsReview.hint")}</p>

        {rows.length > 0 ? (
          <ul className="space-y-2">
            {rows.map((row) => (
              <li
                key={`${row.source}-${row.record.key}`}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium text-foreground">
                    {t(row.record.labelKey, { defaultValue: row.record.key })}
                  </p>
                  <p className="text-sm text-foreground-muted">
                    {row.source === "unknown"
                      ? t("assumptionsReview.unknownValue")
                      : row.record.value}
                  </p>
                  {row.record.basis ? (
                    <p className="text-xs text-foreground-muted">{row.record.basis}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <Badge variant={BADGE_VARIANT[row.source]}>
                    {t(`assumptionsReview.source.${row.source}`)}
                  </Badge>
                  {row.record.editable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="min-h-(--control-min-h-sm)"
                      onClick={() => onEdit(row.record.key)}
                    >
                      <Pencil className="mr-1 size-3.5" aria-hidden />
                      {t("assumptionsReview.edit")}
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-foreground-muted">{t("assumptionsReview.empty")}</p>
        )}

        <p className="rounded-lg border border-border p-3 text-xs text-foreground-muted">
          {t("assumptionsReview.disclaimer")}
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="outline" className="min-h-(--control-min-h) text-base" onClick={onBack}>
            <ChevronLeft className="mr-1 size-5" aria-hidden />
            {t("actions.back")}
          </Button>
          <Button className="min-h-(--control-min-h) text-base" onClick={onContinue}>
            {t("assumptionsReview.continue")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
