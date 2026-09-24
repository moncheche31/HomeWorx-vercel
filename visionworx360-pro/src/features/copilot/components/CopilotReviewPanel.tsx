import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { CheckCircle2, Eye, HardHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useCopilot } from "../hooks/useCopilot";
import { useEstimateReviewCommit } from "../hooks/useEstimateReviewCommit";
import { CopilotSectionPanel } from "./CopilotSectionPanel";

interface Props {
  projectId: string;
  projectName: string;
  description?: string;
  origin?: "walkthrough" | "remote_vision" | "manual";
}

/**
 * Module 013 — the Copilot review surface. It recommends; the contractor
 * always decides. Customer mode shows only accepted work, in plain language.
 */
export function CopilotReviewPanel({ projectId, projectName, description, origin }: Props) {
  const { t } = useTranslation("copilot");
  const [mode, setMode] = useState<"contractor" | "customer">("contractor");
  const [finishing, setFinishing] = useState(false);
  const copilot = useCopilot(projectId, projectName, { description, origin });
  const commit = useEstimateReviewCommit(projectId);

  /**
   * Finishing the review is explicit about its outcome: it either re-prices the
   * active ballpark or says exactly why the range did not move. It never
   * silently does nothing after a cost-driving change.
   */
  const finish = async () => {
    setFinishing(true);
    try {
      const plan = copilot.commitPlan;
      if (!plan.hasFactChange) {
        toast.info(t("toast.noChanges"));
        return;
      }
      await copilot.persistFacts();
      const result = await commit(plan.additions);
      if (result.outcome === "recalculated") {
        toast.success(t("toast.recalculated", { count: result.added }));
      } else if (result.outcome === "no_estimate") {
        toast.success(t("toast.scopeOnly", { count: result.added }));
      } else {
        toast.success(t("toast.factsOnly"));
      }
    } catch {
      toast.error(t("toast.failed"));
    } finally {
      setFinishing(false);
    }
  };

  if (copilot.loading) return <LoadingSpinner />;
  if (copilot.error) return <RetryPanel onRetry={copilot.refetch} />;

  if (copilot.review.isEmpty) {
    return (
      <Card>
        <CardContent className="p-5">
          <EmptyState title={t("empty.title")} description={t("empty.body")} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">{t("title")}</h2>
          {copilot.pending > 0 ? (
            <Badge variant="secondary">{t("pendingCount", { count: copilot.pending })}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-foreground-muted">
          {mode === "customer" ? t("customerSubtitle") : t("subtitle")}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("mode.label")}>
        <Button
          variant={mode === "contractor" ? "default" : "outline"}
          className="min-h-11"
          aria-pressed={mode === "contractor"}
          onClick={() => setMode("contractor")}
        >
          <HardHat className="mr-2 size-4" aria-hidden />
          {t("mode.contractor")}
        </Button>
        <Button
          variant={mode === "customer" ? "default" : "outline"}
          className="min-h-11"
          aria-pressed={mode === "customer"}
          onClick={() => setMode("customer")}
        >
          <Eye className="mr-2 size-4" aria-hidden />
          {t("mode.customer")}
        </Button>
      </div>

      {mode === "customer" && copilot.accepted.length === 0 ? (
        <Card>
          <CardContent className="p-5">
            <EmptyState title={t("customerEmpty.title")} description={t("customerEmpty.body")} />
          </CardContent>
        </Card>
      ) : (
        copilot.review.sections.map((section) => (
          <CopilotSectionPanel
            key={section.key}
            section={section}
            decisions={copilot.decisions}
            mode={mode}
            onDecide={copilot.setDecision}
            onAcceptAll={(ids) => {
              copilot.setMany(ids, "accepted");
              toast.success(t("toast.acceptedAll"));
            }}
          />
        ))
      )}

      {mode === "contractor" ? (
        <Button
          className="min-h-14 w-full text-base"
          data-testid="estimate-review-finish"
          disabled={finishing}
          onClick={() => void finish()}
        >
          <CheckCircle2 className="mr-2 size-5" aria-hidden />
          {t("actions.finish")}
        </Button>
      ) : null}
    </div>
  );
}
