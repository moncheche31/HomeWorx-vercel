import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useProjectQuery } from "../hooks/useCrm";
import { ProjectFormDialog } from "../components/ProjectFormDialog";
import { ContinueEstimateActions } from "../components/ContinueEstimateActions";
import { ProjectRecordActions } from "../components/ProjectRecordActions";
import { ProjectStatusBadge, PriorityBadge } from "../components/StatusBadges";
import { ProjectPhotosTab } from "@/features/project-workspace/components/ProjectPhotosTab";
import { ProjectDocumentsTab } from "@/features/project-workspace/components/ProjectDocumentsTab";
import { ProjectActivityFeed } from "@/features/project-workspace/components/ProjectActivityFeed";
import { NarrativeScopeTab } from "@/features/narrative-scope/components/NarrativeScopeTab";
import { EstimateTab } from "@/features/estimating/components/EstimateTab";
import { ShoppingListTab } from "@/features/estimating/components/ShoppingListTab";
import { useProjectIntakeState } from "../hooks/useProjectIntakeState";
import { readListSearch } from "../navigation/listReturn";
import { BackToProjectsLink, BackToProjectsFooter } from "../navigation/BackToProjectsLink";

export function ProjectDetailPage({ projectId }: { projectId: string }) {
  const { t } = useTranslation("crm");
  const { t: tEst } = useTranslation("estimating");
  const { t: tNarrative } = useTranslation("narrative");
  const navigate = useNavigate();
  const projQ = useProjectQuery(projectId);
  const [editOpen, setEditOpen] = useState(false);
  const [tab, setTab] = useState("scope");
  /**
   * Work mode vs setup mode: the prominent intake chooser only appears for a
   * genuinely blank project (no captured description, no structured scope, no
   * estimate). Once anything is captured, the three methods stay reachable as
   * secondary "Add More Information" actions on the same project.
   */
  const intake = useProjectIntakeState(projectId);
  /* Return to the list view the contractor came from; `{}` = plain list. */
  const [listSearch] = useState(() => readListSearch("projects"));



  if (projQ.isLoading)
    return (
      <div className="p-8">
        <LoadingSpinner label="…" />
      </div>
    );
  if (projQ.isError)
    return (
      <div className="p-8">
        <RetryPanel title={t("errors.loadFailed")} onRetry={() => projQ.refetch()} />
      </div>
    );
  if (!projQ.data)
    return (
      <div className="p-8">
        <EmptyState
          title={t("empty.projects.title")}
          description={t("empty.projects.description")}
        />
      </div>
    );

  const p = projQ.data;
  const archived = p.status === "archived";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <BackToProjectsLink className="mb-4" listSearch={listSearch} />


      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold md:text-3xl">{p.name}</h1>
            <ProjectStatusBadge status={p.status} />
            <PriorityBadge priority={p.priority} />
          </div>
          <p className="mt-1 text-sm text-foreground-muted">
            {[p.clientName, p.propertyLabel].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 size-4" aria-hidden />
            {t("actions.editProject")}
          </Button>
          <ProjectRecordActions
            projectId={p.id}
            projectName={p.name}
            archived={archived}
            onDeleted={() => navigate({ to: "/app/projects" })}
          />
        </div>
      </header>

      {intake.isUnstarted ? (
        <ContinueEstimateActions projectId={p.id} projectName={p.name} className="mb-6" />
      ) : !intake.loading ? (
        <div className="mb-6 flex justify-end">
          <ContinueEstimateActions projectId={p.id} projectName={p.name} variant="menu" />
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="scope">{tNarrative("tab")}</TabsTrigger>
          <TabsTrigger value="estimate">{tEst("tab")}</TabsTrigger>
          <TabsTrigger value="shopping-list">
            {tEst("shoppingList.tab", { defaultValue: "Shopping list" })}
          </TabsTrigger>
          <TabsTrigger value="photos">{t("project.tabs.photos")}</TabsTrigger>
          <TabsTrigger value="documents">{t("project.tabs.documents")}</TabsTrigger>
          <TabsTrigger value="activity">{t("project.tabs.activity")}</TabsTrigger>
        </TabsList>

        <TabsContent value="scope" className="mt-4">
          <NarrativeScopeTab
            projectId={p.id}
            projectName={p.name}
            onCreateEstimate={() => setTab("estimate")}
          />
        </TabsContent>
        <TabsContent value="estimate" className="mt-4">
          <EstimateTab projectId={p.id} projectName={p.name} />
        </TabsContent>
        {/* A separate document: what to buy, not estimate detail. */}
        <TabsContent value="shopping-list" className="mt-4">
          <ShoppingListTab projectId={p.id} />
        </TabsContent>
        <TabsContent value="photos" className="mt-4">
          <ProjectPhotosTab projectId={p.id} />
        </TabsContent>
        <TabsContent value="documents" className="mt-4">
          <ProjectDocumentsTab projectId={p.id} />
        </TabsContent>
        <TabsContent value="activity" className="mt-4">
          <ProjectActivityFeed projectId={p.id} />
        </TabsContent>
      </Tabs>

      <BackToProjectsFooter listSearch={listSearch} />

      <ProjectFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        project={p}
        defaultClientId={p.clientId}
        defaultPropertyId={p.propertyId}
      />
    </div>
  );
}
