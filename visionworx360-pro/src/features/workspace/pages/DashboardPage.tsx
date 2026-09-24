import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Building2,
  FileText,
  FolderKanban,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { WorkspaceStateNotice } from "../components/WorkspaceStateNotice";
import { useWorkspaceResolution } from "../hooks/useWorkspaceResolution";
import { useProjectsQuery } from "@/features/crm/hooks/useCrm";
import { ProjectBallparkRange } from "@/features/crm/components/ProjectBallparkRange";
import { ProjectThumbnail } from "@/features/crm/components/ProjectThumbnail";
import { ProjectStatusBadge } from "@/features/crm/components/StatusBadges";
import { useLocale } from "@/i18n/format";
import { CreateEstimateWizard } from "../components/CreateEstimateWizard";
import { useRecentEstimatesQuery } from "@/features/estimating/hooks/useEstimating";
import { readBallparkSummary } from "@/features/estimating/services/ballparkSummary";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/i18n/format";

import { workspaceDiagnostic } from "@/lib/diagnostics/workspaceDiagnostics";


const WELCOME_DISMISS_KEY = "vwx.onboarding.welcomeDismissed";

export function DashboardPage() {
  const { t } = useTranslation(["workspace", "crm"]);
  const locale = useLocale();
  const { profile, organization } = useWorkspace();
  const workspace = useWorkspaceResolution();
  const recentEstimates = useRecentEstimatesQuery(6);
  useEffect(() => {
    workspaceDiagnostic("dashboard.render", {
      lifecycleStage: "dashboard-render",
      organizationIdPresent: Boolean(organization?.id),
      workspaceState: workspace.state,
    });
  }, [organization?.id, workspace.state]);
  const greetName = profile.firstName?.trim() || profile.displayName;
  const isNewUser = !organization;

  const recentProjectsQuery = useProjectsQuery({
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 6,
    sort: "recent",
  });
  const recentProjects = recentProjectsQuery.data?.items ?? [];

  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setWelcomeDismissed(window.localStorage.getItem(WELCOME_DISMISS_KEY) === "1");
  }, []);
  const dismissWelcome = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(WELCOME_DISMISS_KEY, "1");
    }
    setWelcomeDismissed(true);
  };

  const showWelcome = isNewUser && !welcomeDismissed;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {t(isNewUser ? "welcome.greetingNew" : "welcome.greeting", { name: greetName })}
        </h1>
        <p className="mt-1 text-sm text-foreground-muted">{t("welcome.subtitle")}</p>
      </section>

      {showWelcome && (
        <Card className="mb-6 border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
          <CardHeader>
            <div className="flex items-start gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <CardTitle className="text-lg">{t("welcome.onboarding.title")}</CardTitle>
                <CardDescription>{t("welcome.onboarding.description")}</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row">
            <Button asChild className="min-h-11">
              <Link to="/app/organization">
                <Building2 className="mr-2 size-4" aria-hidden />
                {t("welcome.onboarding.primaryCta")}
              </Link>
            </Button>
            <Button variant="ghost" className="min-h-11" onClick={dismissWelcome}>
              {t("welcome.onboarding.skipCta")}
            </Button>
          </CardContent>
        </Card>
      )}




      <section className="mb-6 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0 space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              {t("cards.createEstimate.title")}
            </h2>
            <p className="text-sm text-foreground-muted">{t("cards.createEstimate.description")}</p>
          </div>
          <CreateEstimateWizard />
        </div>
      </section>

      <section className="mb-6">
      </section>

      {/* Quick actions — single consolidated section, directly below Create Estimate */}
      <Card data-testid="quick-actions" className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">{t("cards.quickActions.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Button asChild variant="outline" className="min-h-11 justify-start">
            <Link to="/app/projects">
              <FolderKanban className="mr-2 size-4" aria-hidden />
              {t("cards.quickActions.viewProjects")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 justify-start">
            <Link to="/app/clients">
              <Users className="mr-2 size-4" aria-hidden />
              {t("cards.quickActions.viewCustomers")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="min-h-11 justify-start">
            <Link to="/app/customers">
              <UserPlus className="mr-2 size-4" aria-hidden />
              {t("cards.quickActions.inviteTeammate")}
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent projects */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">{t("cards.recentProjects.title")}</CardTitle>
              <CardDescription>{t("cards.recentProjects.description")}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link to="/app/projects">
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {workspace.state !== "ready" && (
              <WorkspaceStateNotice state={workspace.state} onRetry={workspace.retry} />
            )}
            {workspace.state === "ready" &&
              (recentProjectsQuery.isPending || recentProjectsQuery.isLoading) && (
                <div className="py-8">
                  <LoadingSpinner label="…" />
                </div>
              )}
            {workspace.state === "ready" && recentProjectsQuery.isError && (
              <RetryPanel
                title={t("crm:errors.loadFailed")}
                onRetry={() => recentProjectsQuery.refetch()}
              />
            )}
            {workspace.state === "ready" &&
              recentProjectsQuery.isSuccess &&
              recentProjects.length === 0 && (
                <EmptyState
                  title={t("empty.noProjects")}
                  description={t("cards.recentProjects.empty")}
                  icon={FolderKanban}
                />
              )}
            {recentProjects.length > 0 && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {recentProjects.map((p) => (
                  <li key={p.id}>
                    <Link
                      to="/app/projects/$projectId"
                      params={{ projectId: p.id }}
                      className="group block overflow-hidden rounded-lg border border-border bg-card transition hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <ProjectThumbnail
                        projectId={p.id}
                        storagePath={p.coverStoragePath}
                        alt={p.coverAlt}
                        projectName={p.name}
                      />
                      <div className="p-3">
                        <div className="mb-1 flex items-start justify-between gap-2">
                          <h3 className="line-clamp-1 text-sm font-semibold">{p.name}</h3>
                          <ProjectStatusBadge status={p.status} />
                        </div>
                        <ProjectBallparkRange
                          low={p.ballparkLow}
                          high={p.ballparkHigh}
                          currency={p.ballparkCurrency}
                          className="mb-1"
                        />
                        <div className="truncate text-xs text-foreground-muted">
                          {p.clientName ?? "—"}
                        </div>
                        <div className="truncate text-xs text-foreground-muted">
                          {p.propertyLabel ?? "—"}
                        </div>
                        <div className="mt-2 text-[11px] text-foreground-muted">
                          {t("crm:project.fields.lastUpdated")}:{" "}
                          {new Date(p.updatedAt).toLocaleDateString(locale)}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Recent estimates */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("cards.recentEstimates.title")}</CardTitle>
            <CardDescription>{t("cards.recentEstimates.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {recentEstimates.isLoading ? (
              <LoadingSpinner label={t("cards.recentEstimates.title")} />
            ) : (recentEstimates.data?.length ?? 0) === 0 ? (
              <EmptyState
                title={t("empty.noEstimates")}
                description={t("cards.recentEstimates.empty")}
                icon={FileText}
              />
            ) : (
              <ul className="space-y-2">
                {(recentEstimates.data ?? []).map(({ estimate, projectName }) => {
                  const ballpark = readBallparkSummary(estimate.rangeSnapshot);
                  return (
                    <li key={estimate.id}>
                      <Link
                        to="/app/projects/$projectId"
                        params={{ projectId: estimate.projectId }}
                        search={{ tab: "estimate" }}
                        className="flex items-start gap-3 rounded-md border border-border p-3 transition-colors hover:bg-surface-muted"
                      >
                        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
                          <FileText className="size-4" aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-medium text-foreground">
                              {projectName ?? estimate.title}
                            </span>
                            {estimate.intakeMode === "ballpark" ? (
                              <Badge variant="secondary">
                                {t("cards.recentEstimates.ballpark")}
                              </Badge>
                            ) : null}
                          </div>
                          {ballpark ? (
                            <div className="text-sm text-foreground-muted">
                              {t("cards.recentEstimates.expected", {
                                value: formatCurrency(ballpark.expected, locale, ballpark.currency),
                              })}
                              {" · "}
                              {formatCurrency(ballpark.low, locale, ballpark.currency)}
                              {" – "}
                              {formatCurrency(ballpark.high, locale, ballpark.currency)}
                            </div>
                          ) : (
                            <div className="text-sm text-foreground-muted">{estimate.title}</div>
                          )}
                          <div className="text-xs text-foreground-muted">
                            {t("cards.recentEstimates.updated", {
                              date: new Date(estimate.updatedAt).toLocaleDateString(locale),
                            })}
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Company profile reminder — only when no organization exists */}
        {!organization && (
          <Card className="border-warning/40 bg-warning/5 lg:col-span-2">
            <CardHeader>
              <div className="flex items-start gap-3">
                <span className="grid size-9 place-items-center rounded-md bg-warning/20 text-warning-foreground">
                  <Building2 className="size-4" aria-hidden />
                </span>
                <div className="min-w-0">
                  <CardTitle className="text-base">{t("organization.emptyState.title")}</CardTitle>
                  <CardDescription>{t("organization.emptyState.description")}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline" className="min-h-11">
                <Link to="/app/organization">
                  <Sparkles className="mr-2 size-4" aria-hidden />
                  {t("organization.emptyState.cta")}
                </Link>
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
}
