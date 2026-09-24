import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * "Scope of Work Changed" notice.
 *
 * Draft/working estimates are updated in place; issued or locked documents are
 * preserved and get the next numbered revision instead. Exactly one action.
 */
export function ScopeChangedBanner({
  action,
  needsReview,
  pending,
  onUpdate,
  onRevise,
}: {
  action: "update" | "revise";
  needsReview: number;
  pending: boolean;
  onUpdate: () => void;
  onRevise: () => void;
}) {
  const { t } = useTranslation("estimating");
  const isRevise = action === "revise";

  return (
    <Card className="border-warning/40 bg-warning/10" data-testid="scope-changed-banner">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
          <div className="space-y-1">
            <p className="text-base font-semibold sm:text-sm">{t("scopeChanged.title")}</p>
            <p className="text-base text-muted-foreground sm:text-sm">
              {isRevise ? t("scopeChanged.issuedBody") : t("scopeChanged.draftBody")}
            </p>
            {needsReview > 0 ? (
              <p className="text-base text-muted-foreground sm:text-sm">
                {t("scopeChanged.needsReview", { count: needsReview })}
              </p>
            ) : null}
          </div>
        </div>
        <Button
          className="h-11 w-full text-base sm:w-auto sm:text-sm"
          disabled={pending}
          onClick={isRevise ? onRevise : onUpdate}
        >
          {pending
            ? t("scopeChanged.working")
            : isRevise
              ? t("actions.createRevision")
              : t("scopeChanged.updateAction")}
        </Button>
      </CardContent>
    </Card>
  );
}
