import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useProjectsQuery } from "@/features/crm/hooks/useCrm";
import { ProjectFormDialog } from "@/features/crm/components/ProjectFormDialog";

interface Props {
  selectedId: string | null;
  onSelect: (id: string, name: string) => void;
}

export function ProjectStep({ selectedId, onSelect }: Props) {
  const { t } = useTranslation("walkthrough");
  const { t: tCrm } = useTranslation("crm");
  const [createOpen, setCreateOpen] = useState(false);
  const [q, setQ] = useState("");
  const query = useProjectsQuery({
    q,
    includeArchived: false,
    page: 1,
    pageSize: 20,
    sort: "recent",
  });
  const projects = query.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
        />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t("project.searchPlaceholder")}
          aria-label={t("project.searchPlaceholder")}
          className="min-h-12 pl-9 text-base"
        />
      </div>

      {query.isLoading ? (
        <LoadingSpinner label={t("common.loading")} />
      ) : query.isError ? (
        <RetryPanel title={t("common.loadFailed")} onRetry={() => query.refetch()} />
      ) : projects.length === 0 ? (
        <Card>
          <CardContent className="space-y-3 p-5 text-center">
            <p className="text-sm text-foreground-muted">{t("project.empty")}</p>
            <Button className="min-h-12 w-full" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" aria-hidden />
              {tCrm("projectSelect.create")}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p.id, p.name)}
                aria-pressed={selectedId === p.id}
                className={`grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                  selectedId === p.id
                    ? "border-primary bg-primary/5"
                    : "border-border hover:bg-secondary/60"
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-base font-medium">{p.name}</span>
                  <span className="block truncate text-xs text-foreground-muted">
                    {[p.clientName, p.propertyLabel].filter(Boolean).join(" · ") || "—"}
                  </span>
                </span>
                {selectedId === p.id ? (
                  <span className="shrink-0 text-xs font-semibold text-primary">
                    {t("project.selected")}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button
        variant="outline"
        className="min-h-12 w-full"
        onClick={() => setCreateOpen(true)}
      >
        <Plus className="mr-2 size-4" aria-hidden />
        {tCrm("projectSelect.create")}
      </Button>

      <ProjectFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSaved={async (project) => {
          await query.refetch();
          onSelect(project.id, project.name);
        }}
      />
    </div>
  );
}
