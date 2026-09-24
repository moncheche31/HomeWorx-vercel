import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ArrowLeft, FolderKanban, Pencil, Archive, RotateCcw, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { usePropertyQuery, usePropertyMutations, useProjectsQuery } from "../hooks/useCrm";
import { PropertyFormDialog } from "../components/PropertyFormDialog";
import { ProjectFormDialog } from "../components/ProjectFormDialog";
import { ProjectStatusBadge } from "../components/StatusBadges";
import { formatMoney } from "../utils/format";
import { useLocale } from "@/i18n/format";

export function PropertyDetailPage({
  clientId,
  propertyId,
}: {
  clientId: string;
  propertyId: string;
}) {
  const { t } = useTranslation("crm");
  const navigate = useNavigate();
  const locale = useLocale();
  const propQ = usePropertyQuery(propertyId);
  const projQ = useProjectsQuery({
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 100,
    sort: "recent",
  });
  const { archive, restore, orgId } = usePropertyMutations();
  const [editOpen, setEditOpen] = useState(false);
  const [projDialog, setProjDialog] = useState(false);

  if (propQ.isLoading)
    return (
      <div className="p-8">
        <LoadingSpinner label="…" />
      </div>
    );
  if (propQ.isError)
    return (
      <div className="p-8">
        <RetryPanel title={t("errors.loadFailed")} onRetry={() => propQ.refetch()} />
      </div>
    );
  if (!propQ.data)
    return (
      <div className="p-8">
        <EmptyState
          title={t("empty.properties.title")}
          description={t("empty.properties.description")}
        />
      </div>
    );

  const p = propQ.data;
  const projects = (projQ.data?.items ?? []).filter((x) => x.propertyId === propertyId);
  const archived = !!p.archivedAt;

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <Link
        to="/app/clients/$clientId"
        params={{ clientId }}
        className="mb-4 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t("nav.backToClient")}
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">{p.nickname || p.street || "—"}</h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {[p.street, [p.city, p.region].filter(Boolean).join(", "), p.postalCode, p.county]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
          <div className="mt-2 flex flex-wrap gap-4 text-sm text-foreground-muted">
            {p.yearBuilt != null && (
              <span>
                {t("property.fields.yearBuilt")}: {p.yearBuilt}
              </span>
            )}
            {p.squareFootage != null && (
              <span>
                {t("property.fields.squareFootage")}: {p.squareFootage.toLocaleString(locale)}
              </span>
            )}
            {p.bedrooms != null && (
              <span>
                {t("property.fields.bedrooms")}: {p.bedrooms}
              </span>
            )}
            {p.bathrooms != null && (
              <span>
                {t("property.fields.bathrooms")}: {p.bathrooms}
              </span>
            )}
            {p.stories != null && (
              <span>
                {t("property.fields.stories")}: {p.stories}
              </span>
            )}
            {p.constructionType && <span>{p.constructionType}</span>}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 size-4" aria-hidden />
            {t("actions.edit")}
          </Button>
          {!archived ? (
            <Button
              variant="outline"
              onClick={async () => {
                if (!orgId) return;
                await archive.mutateAsync({ id: p.id, activeOrganizationId: orgId });
                toast.success(t("property.toast.archived"));
              }}
            >
              <Archive className="mr-1 size-4" aria-hidden />
              {t("actions.archive")}
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                if (!orgId) return;
                await restore.mutateAsync({ id: p.id, activeOrganizationId: orgId });
                toast.success(t("property.toast.restored"));
              }}
            >
              <RotateCcw className="mr-1 size-4" aria-hidden />
              {t("actions.restore")}
            </Button>
          )}
        </div>
      </header>

      {p.notes && (
        <Card className="mb-6">
          <CardContent className="p-4 text-sm whitespace-pre-wrap">{p.notes}</CardContent>
        </Card>
      )}

      <section aria-labelledby="projects-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="projects-heading" className="text-lg font-semibold">
            {t("property.projects")}
          </h2>
          <Button size="sm" onClick={() => setProjDialog(true)}>
            <Plus className="mr-1 size-4" aria-hidden />
            {t("actions.addProject")}
          </Button>
        </div>
        {projects.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title={t("empty.projects.title")}
            description={t("empty.projects.description")}
            action={
              <Button onClick={() => setProjDialog(true)}>{t("empty.projects.action")}</Button>
            }
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {projects.map((pr) => (
              <Card
                key={pr.id}
                className="cursor-pointer"
                onClick={() =>
                  navigate({ to: "/app/projects/$projectId", params: { projectId: pr.id } })
                }
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{pr.name}</div>
                      <div className="text-xs text-foreground-muted">
                        {formatMoney(pr.budget, "USD", locale)}
                      </div>
                    </div>
                    <ProjectStatusBadge status={pr.status} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <PropertyFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        clientId={clientId}
        property={p}
      />
      <ProjectFormDialog
        open={projDialog}
        onOpenChange={setProjDialog}
        defaultClientId={clientId}
        defaultPropertyId={propertyId}
      />
    </div>
  );
}
