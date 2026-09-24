import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearch } from "@tanstack/react-router";
import { Users, Search, Pencil } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useClientsQuery, useCrmFilterOptionsQuery } from "../hooks/useCrm";
import { ClientRecordActions } from "../components/ClientRecordActions";
import { ClientFormDialog } from "../components/ClientFormDialog";
import { ClientStatusBadge } from "../components/StatusBadges";
import { CreateRecordActions } from "../components/CreateRecordActions";
import { FilterMenu, SortMenu, FilterField, filterSelectClass } from "../components/ListControls";
import { clientDisplayName } from "../utils/format";
import type { ClientDTO, ClientStatus } from "../services/types";
import type { ClientSort } from "../services/schemas";
import type { ClientsListSearch, YesNo } from "../navigation/listSearch";
import { useListSearchUpdater } from "../navigation/useListSearchUpdater";
import { useRememberListSearch } from "../navigation/useRememberListSearch";

export function ClientsListPage() {
  const { t } = useTranslation("crm");
  /*
    Search, filters and page live in the route search params so returning from
    a client detail screen restores the list exactly as it was left.
  */
  const search = useSearch({ from: "/app/clients/" }) as ClientsListSearch;
  const setSearch = useListSearchUpdater<ClientsListSearch>();

  const q = search.q ?? "";
  const city = search.city ?? "";
  const status = search.status ?? "";
  const hasOpenProjects = search.openProjects ?? "";
  const page = search.page ?? 1;

  useRememberListSearch("clients", search);

  const sort: ClientSort = search.sort ?? "newest";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ClientDTO | null>(null);

  const pageSize = 20;
  const options = useCrmFilterOptionsQuery();
  const query = useClientsQuery({
    q,
    city: city || undefined,
    status: status || undefined,
    hasOpenProjects: hasOpenProjects || undefined,
    includeArchived: status === "archived",
    page,
    pageSize,
    sort,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const activeFilterCount = (city ? 1 : 0) + (status ? 1 : 0) + (hasOpenProjects ? 1 : 0);

  function resetFilters() {
    setSearch({ city: undefined, status: undefined, openProjects: undefined });
  }


  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground md:text-3xl">
            {t("client.titleList")}
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">{t("client.subtitleList")}</p>
        </div>
        <CreateRecordActions show="client" />
      </header>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-muted"
            aria-hidden
          />
          <Input
            aria-label={t("actions.search")}
            placeholder={t("search.clientsPlaceholder")}
            value={q}
            onChange={(e) => {
              setSearch({ q: e.target.value || undefined });
            }}
            className="pl-9 min-h-(--control-min-h-sm)"
          />
        </div>

        <div className="flex items-center gap-2">
          <FilterMenu activeCount={activeFilterCount} onReset={resetFilters}>
            <FilterField id="cf-city" label={t("filters.city")}>
              <select
                id="cf-city"
                className={filterSelectClass}
                value={city}
                onChange={(e) => {
                  setSearch({ city: e.target.value || undefined });
                }}
              >
                <option value="">{t("filters.any")}</option>
                {(options.data?.clientCities ?? []).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField id="cf-status" label={t("filters.status")}>
              <select
                id="cf-status"
                className={filterSelectClass}
                value={status}
                onChange={(e) => {
                  setSearch({
                    status: (e.target.value || undefined) as ClientStatus | undefined,
                  });
                }}
              >
                <option value="">{t("filters.any")}</option>
                <option value="active">{t("clientStatus.active")}</option>
                <option value="archived">{t("clientStatus.archived")}</option>
              </select>
            </FilterField>

            <FilterField id="cf-projects" label={t("filters.openProjects")}>
              <select
                id="cf-projects"
                className={filterSelectClass}
                value={hasOpenProjects}
                onChange={(e) => {
                  setSearch({ openProjects: (e.target.value || undefined) as YesNo | undefined });
                }}
              >
                <option value="">{t("filters.any")}</option>
                <option value="yes">{t("filters.hasOpenProjects")}</option>
                <option value="no">{t("filters.noOpenProjects")}</option>
              </select>
            </FilterField>
          </FilterMenu>

          <SortMenu
            value={sort}
            onChange={(v) => {
              setSearch({ sort: v === "newest" ? undefined : v });
            }}
            options={[
              { value: "name_asc", label: t("sort.nameAsc") },
              { value: "name_desc", label: t("sort.nameDesc") },
              { value: "city_asc", label: t("sort.cityAsc") },
              { value: "newest", label: t("sort.recentlyAdded") },
              { value: "recent", label: t("sort.recentlyUpdated") },
            ]}
          />
        </div>
      </div>


      {query.isLoading && (
        <div className="py-12">
          <LoadingSpinner label={t("actions.search")} />
        </div>
      )}
      {query.isError && (
        <RetryPanel
          title={t("errors.loadFailed")}
          description={query.error instanceof Error ? query.error.message : undefined}
          onRetry={() => query.refetch()}
        />
      )}

      {!query.isLoading && !query.isError && items.length === 0 && (
        <EmptyState
          icon={Users}
          title={q ? t("empty.search.title") : t("empty.clients.title")}
          description={q ? t("empty.search.description") : t("empty.clients.description")}
          action={<CreateRecordActions show="client" align="start" />}
        />

      )}

      {items.length > 0 && (
        <ul className="grid grid-cols-1 gap-2">
          {items.map((c) => (
            <Card key={c.id} className="flex min-w-0 items-center gap-3 p-4">
              <Link
                to="/app/clients/$clientId"
                params={{ clientId: c.id }}
                className="min-w-0 flex-1"
              >
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-foreground">
                    {clientDisplayName(c)}
                  </span>
                  <ClientStatusBadge status={c.status} />
                </div>
                <div className="truncate text-sm text-foreground-muted">
                  {[c.email, c.phone, [c.city, c.region].filter(Boolean).join(", ")]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </Link>
              <Button
                variant="ghost"
                size="icon"
                aria-label={t("actions.edit")}
                onClick={() => {
                  setEditing(c);
                  setDialogOpen(true);
                }}
              >
                <Pencil className="size-4" aria-hidden />
              </Button>
              <ClientRecordActions
                clientId={c.id}
                clientName={clientDisplayName(c)}
                archived={c.status !== "active"}
                variant="row"
              />
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

      <ClientFormDialog open={dialogOpen} onOpenChange={setDialogOpen} client={editing} />
    </div>
  );
}
