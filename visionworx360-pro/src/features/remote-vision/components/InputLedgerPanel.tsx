import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { RemoteVisionInputRecord } from "@/domains/remoteVision";

/**
 * Shows what the ballpark is standing on and — critically — separates
 * contractor-stated facts from media-derived observations.
 */
export function InputLedgerPanel({ records }: { records: RemoteVisionInputRecord[] }) {
  const { t } = useTranslation("remote-vision");

  return (
    <Card data-testid="remote-vision-ledger">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("ledger.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-foreground-muted">{t("ledger.hint")}</p>
        {records.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t("ledger.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {records.map((r, i) => (
              <li
                key={`${r.kind}-${i}`}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
              >
                <span className="min-w-0 flex-1 truncate text-sm">{r.label}</span>
                <Badge variant="outline">{t(`ledger.kind.${r.kind}`)}</Badge>
                <Badge variant={r.contractorConfirmed ? "secondary" : "outline"}>
                  {r.contractorConfirmed ? t("ledger.confirmed") : t("ledger.observed")}
                </Badge>
                {r.detail ? (
                  <span className="w-full text-xs text-foreground-muted">{r.detail}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
