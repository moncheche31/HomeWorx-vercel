import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Presentation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { useProjectsQuery } from "@/features/crm/hooks/useCrm";
import { NarrativeDocumentView } from "../components/NarrativeDocumentView";
import { readNarrativeScope } from "../hooks/useNarrativeScopeStore";

/**
 * Customer proposal scope. Generated directly from the approved narrative —
 * never from estimating internals.
 */
export function ProposalScopePage() {
  const { t } = useTranslation("narrative");
  const { t: tp } = useTranslation("proposal");
  const query = useProjectsQuery({ q: "", includeArchived: false, page: 1, pageSize: 50, sort: "recent" });
  const projects = query.data?.items ?? [];
  const [selected, setSelected] = useState<string>("");

  const activeId = selected || projects[0]?.id || "";
  const approved = useMemo(
    () => (activeId ? readNarrativeScope(activeId).approvedText : null),
    [activeId],
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-8">
      <header className="mb-5 space-y-1">
        <h1 className="text-2xl font-semibold md:text-3xl">{t("proposal.title")}</h1>
        <p className="text-sm text-foreground-muted">{t("proposal.subtitle")}</p>
      </header>

      {query.isLoading ? (
        <LoadingSpinner />
      ) : projects.length === 0 ? (
        <EmptyState title={t("proposal.empty")} />
      ) : (
        <div className="space-y-4">
          <Select value={activeId} onValueChange={setSelected}>
            <SelectTrigger className="min-h-(--control-min-h)" aria-label={t("proposal.picker")}>
              <SelectValue placeholder={t("proposal.picker")} />
            </SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {activeId ? (
            <Button asChild className="min-h-(--control-min-h) w-full sm:w-auto">
              <Link to="/app/proposal/$projectId" params={{ projectId: activeId }}>
                <Presentation className="mr-2 size-4" aria-hidden />
                {tp("open")}
              </Link>
            </Button>
          ) : null}

          {approved ? (
            <NarrativeDocumentView text={approved} />
          ) : (
            <Card>
              <CardContent className="p-5 text-sm text-foreground-muted">
                {t("proposal.notApproved")}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
