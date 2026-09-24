import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { BallparkInputLedger, BallparkInputRecord } from "@/domains/ballpark";

interface Props {
  ledger: BallparkInputLedger;
  onEdit: (questionId?: string) => void;
}

const SECTIONS: { key: keyof BallparkInputLedger; titleKey: string }[] = [
  { key: "measured", titleKey: "ledger.measured" },
  { key: "inferred", titleKey: "ledger.inferred" },
  { key: "known", titleKey: "ledger.known" },
  { key: "observed", titleKey: "ledger.observed" },
  { key: "assumed", titleKey: "ledger.assumed" },
  { key: "unknown", titleKey: "ledger.unknown" },
];

/**
 * What the number rests on, separated by where it came from. Assumptions are
 * never hidden and every row jumps back to the question behind it.
 */
export function InputLedgerCard({ ledger, onEdit }: Props) {
  const { t } = useTranslation("ballpark");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("ledger.title")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-foreground-muted">{t("ledger.completeness")}</span>
            <span className="font-semibold text-foreground">{ledger.completenessPct}%</span>
          </div>
          <Progress value={ledger.completenessPct} />
          <p className="text-xs text-foreground-muted">{t("ledger.completenessHint")}</p>
        </CardContent>
      </Card>

      {SECTIONS.map((section) => {
        const rows = ledger[section.key] as BallparkInputRecord[];
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return (
          <Card key={section.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t(section.titleKey)}{" "}
                <span className="text-sm font-normal text-foreground-muted">({rows.length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {rows.map((row) => (
                <button
                  key={`${section.key}-${row.key}`}
                  type="button"
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
                  onClick={() => onEdit(row.questionId ?? undefined)}
                >
                  <span className="min-w-0 space-y-0.5">
                    <span className="block text-sm font-medium text-foreground">
                      {t(row.labelKey)}
                    </span>
                    <span className="block text-sm text-foreground-muted">{row.value}</span>
                    {row.basis ? (
                      <span className="block text-xs text-foreground-muted">{row.basis}</span>
                    ) : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <Badge variant={row.category === "measured" ? "default" : "secondary"}>
                      {t(`ledger.category.${row.category}`)}
                    </Badge>
                    {row.impact === "high" ? (
                      <Badge variant="outline">{t("ledger.impact.high")}</Badge>
                    ) : null}
                  </span>
                </button>
              ))}
            </CardContent>
          </Card>
        );
      })}

      {ledger.risks.length > 0 ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{t("ledger.risks")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {ledger.risks.map((risk) => (
              <div key={risk.key} className="rounded-lg border border-border p-3">
                <p className="flex items-center justify-between gap-2 text-sm font-medium text-foreground">
                  {t(risk.labelKey)}
                  <Badge variant="secondary">{t(`ledger.impact.${risk.impact}`)}</Badge>
                </p>
                <p className="mt-1 text-sm text-foreground-muted">{t(risk.noteKey)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <Button
        variant="outline"
        className="min-h-(--control-min-h) w-full text-base"
        onClick={() => onEdit()}
      >
        {t("ledger.editAssumptions")}
      </Button>
    </div>
  );
}
