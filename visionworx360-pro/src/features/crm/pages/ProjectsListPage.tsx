import { useTranslation } from "react-i18next";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { FolderKanban, Search } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useProjectsQuery, useCrmFilterOptionsQuery, useClientsQuery } from "../hooks/useCrm";
import { ProjectStatusBadge, PriorityBadge } from "../components/StatusBadges";
import { ProjectRecordActions } from "../components/ProjectRecordActions";
import { CreateRecordActions } from "../components/CreateRecordActions";
import { FilterMenu, SortMenu, FilterField, filterSelectClass } from "../components/ListControls";
import { formatMoney, clientDisplayName } from "../utils/format";
import { useLocale } from "@/i18n/format";
import { ProjectThumbnail } from "../components/ProjectThumbnail";
import { ProjectBallparkRange } from "../components/ProjectBallparkRange";
import { WorkspaceStateNotice } from "@/features/workspace/components/WorkspaceStateNotice";
import { useWorkspaceResolution } from "@/features/workspace/hooks/useWorkspaceResolution";
import { CurrencyInput } from "@/components/inputs/CurrencyInput";
import {
  PROJECT_CATEGORY_KEYS,
  PROJECT_TYPES_BY_CATEGORY,
  type ProjectCategoryKey,
} from "../catalog/projectTypes";
import type { ProjectStatus, ProjectPriority } from "../services/types";
import { type ProjectSort } from "../services/schemas";
import { DEFAULT_PROJECT_SORT } from "../services/projectSort";
import {
  PROJECT_STATUS_VALUES,
  PROJECT_PRIORITY_VALUES,
  type ProjectsListSearch,
} from "../navigation/listSearch";
import { useListSearchUpdater } from "../navigation/useListSearchUpdater";
import { useRememberListSearch } from "../navigation/useRememberListSearch";

/** Single source of truth shared with the route's search-param validation. */
const STATUSES: readonly ProjectStatus[] = PROJECT_STATUS_VALUES;
const PRIORITIES: readonly ProjectPriority[] = PROJECT_PRIORITY_VALUES;

export function ProjectsListPage() {
  const { t } = useTranslation("crm");
  const workspace = useWorkspaceResolution();
  const navigate = useNavigate();
  const locale = useLocale();

  /*
    Search, filters and page are route search params, not component state, so
    they survive opening a record and navigating back. Sort stays in
    sessionStorage: it is a durable per-contractor preference rather than a
    shareable view, and converting it would change existing behaviour.
  */
  const search = useSearch({ from: "/app/projects/" }) as ProjectsListSearch;
  const setSearch = useListSearchUpdater<ProjectsListSearch>();

  const q = search.q ?? "";
  const status = search.status ?? "";
  const priority = search.priority ?? "";
  const city = search.city ?? "";
  const clientId = search.clientId ?? "";
  const projectTypeKey = search.type ?? "";
  const budgetMin = search.budgetMin ?? null;
  const budgetMax = search.budgetMax ?? null;
  const page = search.page ?? 1;

  useRememberListSearch("projects", search);

  const sort: ProjectSort = search.sort ?? DEFAULT_PROJECT_SORT;
  const pageSize = 20;

  const options = useCrmFilterOptionsQuery();
  const clients = useClientsQuery({
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 100,
    sort: "name_asc",
  });

  const activeFilterCount =
    (status ? 1 : 0) +
    (priority ? 1 : 0) +
    (city ? 1 : 0) +
    (clientId ? 1 : 0) +
    (projectTypeKey ? 1 : 0) +
    (budgetMin != null ? 1 : 0) +
    (budgetMax != null ? 1 : 0);

  function resetFilters() {
    setSearch({
      status: undefined,
      priority: undefined,
      city: undefined,
      clientId: undefined,
      type: undefined,
      budgetMin: undefined,
      budgetMax: undefined,
    });
  }

  const query = useProjectsQuery({
    q,
    sort,
    page,
    pageSize,
    includeArchived: false,
    status: status || undefined,
    priority: priority || undefined,
    city: city || undefined,
    clientId: clientId || undefined,
    projectTypeKey: projectTypeKey || undefined,
    budgetMin: budgetMin ?? undefined,
    budgetMax: budgetMax ?? undefined,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));


  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold md:text-3xl">{t("project.titleList")}</h1>
          <p className="mt-1 text-sm text-foreground-muted">{t("project.subtitleList")}</p>
        </div>
        <CreateRecordActions show="project" />
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
          <Input
            aria-label={t("actions.search")}
            placeholder={t("search.projectsPlaceholder")}
            value={q}
            onChange={(e) => {
              setSearch({ q: e.target.value || undefined });
            }}
            className="pl-9 min-h-(--control-min-h-sm)"
          />
        </div>

        <div className="flex items-center gap-2">
          <FilterMenu activeCount={activeFilterCount} onReset={resetFilters}>
            <FilterField id="f-status" label={t("filters.status")}>
              <select
                id="f-status"
                className={filterSelectClass}
                value={status}
                onChange={(e) => {
                  setSearch({ status: (e.target.value || undefined) as ProjectStatus | undefined });
                }}
              >
                <option value="">{t("filters.any")}</option>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField id="f-priority" label={t("filters.priority")}>
              <select
                id="f-priority"
                className={filterSelectClass}
                value={priority}
                onChange={(e) => {
                  setSearch({
                    priority: (e.target.value || undefined) as ProjectPriority | undefined,
                  });
                }}
              >
                <option value="">{t("filters.any")}</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {t(`priority.${p}`)}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField id="f-city" label={t("filters.city")}>
              <select
                id="f-city"
                className={filterSelectClass}
                value={city}
                onChange={(e) => {
                  setSearch({ city: e.target.value || undefined });
                }}
              >
                <option value="">{t("filters.any")}</option>
                {(options.data?.propertyCities ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField id="f-type" label={t("filters.projectType")}>
              <select
                id="f-type"
                className={filterSelectClass}
                value={projectTypeKey}
                onChange={(e) => {
                  setSearch({ type: e.target.value || undefined });
                }}
              >
                <option value="">{t("filters.any")}</option>
                {PROJECT_CATEGORY_KEYS.map((category: ProjectCategoryKey) => (
                  <optgroup key={category} label={t(`projectCategories.${category}`)}>
                    {PROJECT_TYPES_BY_CATEGORY[category].map((key) => (
                      <option key={key} value={key}>
                        {t(`projectTypes.${key}`)}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </FilterField>

            <FilterField id="f-client" label={t("filters.client")}>
              <select
                id="f-client"
                className={filterSelectClass}
                value={clientId}
                onChange={(e) => {
                  setSearch({ clientId: e.target.value || undefined });
                }}
              >
                <option value="">{t("filters.any")}</option>
                {(clients.data?.items ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {clientDisplayName(c)}
                  </option>
                ))}
              </select>
            </FilterField>

            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1">
                <Label className="text-xs">{t("filters.budgetMin")}</Label>
                <CurrencyInput
                  aria-label={t("filters.budgetMin")}
                  placeholder={t("filters.budgetMin")}
                  className="min-h-(--control-min-h-sm)"
                  value={budgetMin}
                  onValueChange={(v) => {
                    setSearch({ budgetMin: v ?? undefined });
                  }}
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">{t("filters.budgetMax")}</Label>
                <CurrencyInput
                  aria-label={t("filters.budgetMax")}
                  placeholder={t("filters.budgetMax")}
                  className="min-h-(--control-min-h-sm)"
                  value={budgetMax}
                  onValueChange={(v) => {
                    setSearch({ budgetMax: v ?? undefined });
                  }}
                />
              </div>
            </div>
          </FilterMenu>

          <SortMenu
            value={sort}
            onChange={(v) => {
              setSearch({ sort: v === DEFAULT_PROJECT_SORT ? undefined : v });
            }}
            options={[
              { value: "recent", label: t("sort.recentlyWorkedOn") },
              { value: "newest", label: t("sort.recentlyAdded") },
              { value: "oldest", label: t("sort.oldest") },
              { value: "city_asc", label: t("sort.cityAsc") },
              { value: "city_desc", label: t("sort.cityDesc") },
              { value: "name_asc", label: t("sort.projectNameAsc") },
              { value: "budget_asc", label: t("sort.budgetLowHigh") },
              { value: "budget_desc", label: t("sort.budgetHighLow") },
            ]}
          />
        </div>

      </div>

      {workspace.state !== "ready" && (
        <WorkspaceStateNotice state={workspace.state} onRetry={workspace.retry} />
      )}

      {workspace.state === "ready" && (query.isPending || query.isLoading) && (
        <div className="py-12">
          <LoadingSpinner label="…" />
        </div>
      )}
      {workspace.state === "ready" && query.isError && (
        <RetryPanel title={t("errors.loadFailed")} onRetry={() => query.refetch()} />
      )}

      {workspace.state === "ready" && query.isSuccess && items.length === 0 && (
        <EmptyState
          icon={FolderKanban}
          title={q ? t("empty.search.title") : t("empty.projects.title")}
          description={q ? t("empty.search.description") : t("empty.projects.description")}
          action={<CreateRecordActions show="project" align="start" />}
        />

      )}

      {items.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer overflow-hidden p-0 transition hover:shadow-md"
              onClick={() =>
                navigate({ to: "/app/projects/$projectId", params: { projectId: p.id } })
              }
            >
              <ProjectThumbnail
                projectId={p.id}
                storagePath={p.coverStoragePath}
                alt={p.coverAlt}
                projectName={p.name}
              />
              <CardContent className="p-4">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="line-clamp-2 text-base font-semibold">{p.name}</h3>
                  <ProjectStatusBadge status={p.status} />
                </div>
                <ProjectBallparkRange
                  low={p.ballparkLow}
                  high={p.ballparkHigh}
                  currency={p.ballparkCurrency}
                  className="mb-2"
                />
                <div className="text-sm text-foreground-muted">{p.clientName ?? "—"}</div>
                <div className="truncate text-xs text-foreground-muted">
                  {p.propertyLabel ?? "—"}
                </div>
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="font-medium">{formatMoney(p.budget, "USD", locale)}</span>
                  <PriorityBadge priority={p.priority} />
                </div>
                <div className="mt-2 text-xs text-foreground-muted">
                  {t("project.fields.lastUpdated")}:{" "}
                  {new Date(p.updatedAt).toLocaleDateString(locale)}
                </div>
                <div
                  className="mt-3 flex justify-end gap-1 border-t border-border pt-2"
                  onClick={(e) => e.stopPropagation()}
                >
                  <ProjectRecordActions
                    projectId={p.id}
                    projectName={p.name}
                    archived={p.status === "archived"}
                    variant="row"
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setSearch({ page: page > 2 ? page - 1 : undefined })}
          >
            {t("pagination.prev")}
          </Button>
          <span className="text-sm text-foreground-muted">
            {t("pagination.page", { page, total: totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setSearch({ page: page + 1 })}
          >
            {t("pagination.next")}
          </Button>
        </nav>
      )}

    </div>
  );
}
