import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { Home, Search } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { WorkspaceStateNotice } from "@/features/workspace/components/WorkspaceStateNotice";
import { useWorkspaceResolution } from "@/features/workspace/hooks/useWorkspaceResolution";
import {
  usePropertyRecordsQuery,
  useCrmFilterOptionsQuery,
  useClientsQuery,
} from "../hooks/useCrm";
import { CreateRecordActions } from "../components/CreateRecordActions";
import { FilterMenu, SortMenu, FilterField, filterSelectClass } from "../components/ListControls";
import { clientDisplayName } from "../utils/format";
import type { PropertySort } from "../services/schemas";
import type { PropertiesListSearch, YesNo } from "../navigation/listSearch";
import { useListSearchUpdater } from "../navigation/useListSearchUpdater";
import { useRememberListSearch } from "../navigation/useRememberListSearch";

/** Dedicated Properties list page with Filter / Sort / Create New Property. */
export function PropertiesListPage() {
  const { t } = useTranslation("crm");
  const workspace = useWorkspaceResolution();
  /*
    Search, filters and page live in the route search params so returning from
    a property detail screen restores the list exactly as it was left.
  */
  const search = useSearch({ from: "/app/properties" }) as PropertiesListSearch;
  const setSearch = useListSearchUpdater<PropertiesListSearch>();

  const q = search.q ?? "";
  const city = search.city ?? "";
  const clientId = search.clientId ?? "";
  const hasActiveProjects = search.activeProjects ?? "";
  const page = search.page ?? 1;

  useRememberListSearch("properties", search);

  const sort: PropertySort = search.sort ?? "newest";
  const pageSize = 20;

  const options = useCrmFilterOptionsQuery();
  const clients = useClientsQuery({
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 100,
    sort: "name_asc",
  });
  const query = usePropertyRecordsQuery({
    q,
    city: city || undefined,
    clientId: clientId || undefined,
    hasActiveProjects: hasActiveProjects || undefined,
    includeArchived: false,
    page,
    pageSize,
    sort,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const activeFilterCount =
    (city ? 1 : 0) + (clientId ? 1 : 0) + (hasActiveProjects ? 1 : 0);

  function resetFilters() {
    setSearch({ city: undefined, clientId: undefined, activeProjects: undefined });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
            {t("property.titleList")}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">{t("property.subtitleList")}</p>
        </div>
        <CreateRecordActions show="property" />
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
          <Input
            aria-label={t("actions.search")}
            placeholder={t("search.propertiesPlaceholder")}
            value={q}
            onChange={(e) => {
              setSearch({ q: e.target.value || undefined });
            }}
            className="pl-9 min-h-(--control-min-h-sm)"
          />
        </div>

        <div className="flex items-center gap-2">
          <FilterMenu activeCount={activeFilterCount} onReset={resetFilters}>
            <FilterField id="pf-city" label={t("filters.city")}>
              <select
                id="pf-city"
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

            <FilterField id="pf-client" label={t("filters.client")}>
              <select
                id="pf-client"
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

            <FilterField id="pf-projects" label={t("filters.activeProjects")}>
              <select
                id="pf-projects"
                className={filterSelectClass}
                value={hasActiveProjects}
                onChange={(e) => {
                  setSearch({
                    activeProjects: (e.target.value || undefined) as YesNo | undefined,
                  });
                }}
              >
                <option value="">{t("filters.any")}</option>
                <option value="yes">{t("filters.hasActiveProjects")}</option>
                <option value="no">{t("filters.noActiveProjects")}</option>
              </select>
            </FilterField>
          </FilterMenu>

          <SortMenu
            value={sort}
            onChange={(v) => {
              setSearch({ sort: v === "newest" ? undefined : v });
            }}
            options={[
              { value: "address_asc", label: t("sort.addressAsc") },
              { value: "city_asc", label: t("sort.cityAsc") },
              { value: "newest", label: t("sort.recentlyAdded") },
              { value: "recent", label: t("sort.recentlyUpdated") },
            ]}
          />
        </div>
      </div>

      {workspace.state !== "ready" && (
        <WorkspaceStateNotice state={workspace.state} onRetry={workspace.retry} />
      )}

      {workspace.state === "ready" && query.isLoading && (
        <div className="py-12">
          <LoadingSpinner label="…" />
        </div>
      )}
      {workspace.state === "ready" && query.isError && (
        <RetryPanel title={t("errors.loadFailed")} onRetry={() => query.refetch()} />
      )}

      {workspace.state === "ready" && query.isSuccess && items.length === 0 && (
        <EmptyState
          icon={Home}
          title={q ? t("empty.search.title") : t("empty.properties.title")}
          description={q ? t("empty.search.description") : t("empty.properties.description")}
          action={<CreateRecordActions show="property" align="start" />}
        />
      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-2">
          {items.map((p) => (
            <Card key={p.id} className="flex min-w-0 items-center gap-3 p-4">
              <Link
                to="/app/clients/$clientId/properties/$propertyId"
                params={{ clientId: p.clientId, propertyId: p.id }}
                className="min-w-0 flex-1"
              >
                <div className="truncate font-medium text-foreground">
                  {p.nickname || p.addressLabel}
                </div>
                <div className="truncate text-sm text-foreground-muted">
                  {[p.addressLabel, p.clientName].filter(Boolean).join(" · ")}
                </div>
              </Link>
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
