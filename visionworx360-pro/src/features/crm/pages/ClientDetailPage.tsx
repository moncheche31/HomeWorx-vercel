import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Home, Pencil, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useClientQuery, usePropertiesQuery, usePropertyMutations } from "../hooks/useCrm";
import { ClientRecordActions } from "../components/ClientRecordActions";
import { ClientFormDialog } from "../components/ClientFormDialog";
import { PropertyFormDialog } from "../components/PropertyFormDialog";
import { ClientStatusBadge } from "../components/StatusBadges";
import { clientDisplayName } from "../utils/format";
import type { PropertyDTO } from "../services/types";
import { readListSearch } from "../navigation/listReturn";

export function ClientDetailPage({ clientId }: { clientId: string }) {
  const { t } = useTranslation("crm");
  const navigate = useNavigate();
  const clientQ = useClientQuery(clientId);
  const propertiesQ = usePropertiesQuery(clientId, false);
  const propMut = usePropertyMutations();

  /* Return to the list view the contractor came from; `{}` = plain list. */
  const [listSearch] = useState(() => readListSearch("clients"));
  const [editOpen, setEditOpen] = useState(false);
  const [propDialog, setPropDialog] = useState(false);
  const [editingProp, setEditingProp] = useState<PropertyDTO | null>(null);

  if (clientQ.isLoading)
    return (
      <div className="p-8">
        <LoadingSpinner label="…" />
      </div>
    );
  if (clientQ.isError)
    return (
      <div className="p-8">
        <RetryPanel title={t("errors.loadFailed")} onRetry={() => clientQ.refetch()} />
      </div>
    );
  if (!clientQ.data)
    return (
      <div className="p-8">
        <EmptyState title={t("empty.clients.title")} description={t("empty.clients.description")} />
      </div>
    );

  const c = clientQ.data;
  const properties = propertiesQ.data ?? [];

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
      <Link
        to="/app/clients"
        search={listSearch}
        className="mb-4 inline-flex items-center gap-1 text-sm text-foreground-muted hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden /> {t("nav.backToClients")}
      </Link>

      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold md:text-3xl">
            {clientDisplayName(c)} <ClientStatusBadge status={c.status} />
          </h1>
          <p className="mt-1 text-sm text-foreground-muted">
            {[c.email, c.phone, [c.city, c.region].filter(Boolean).join(", ")]
              .filter(Boolean)
              .join(" · ") || "—"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="mr-1 size-4" aria-hidden />
            {t("actions.edit")}
          </Button>
          <ClientRecordActions
            clientId={c.id}
            clientName={clientDisplayName(c)}
            archived={c.status !== "active"}
            onDeleted={() => navigate({ to: "/app/clients" })}
          />
        </div>
      </header>

      {c.notes && (
        <Card className="mb-6">
          <CardContent className="p-4 text-sm text-foreground whitespace-pre-wrap">
            {c.notes}
          </CardContent>
        </Card>
      )}

      <section aria-labelledby="properties-heading">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="properties-heading" className="text-lg font-semibold">
            {t("client.properties")}
          </h2>
          <Button
            size="sm"
            onClick={() => {
              setEditingProp(null);
              setPropDialog(true);
            }}
          >
            <Plus className="mr-1 size-4" aria-hidden />
            {t("actions.addProperty")}
          </Button>
        </div>

        {propertiesQ.isLoading && <LoadingSpinner label="…" />}
        {properties.length === 0 && !propertiesQ.isLoading && (
          <EmptyState
            icon={Home}
            title={t("empty.properties.title")}
            description={t("empty.properties.description")}
            action={
              <Button
                onClick={() => {
                  setEditingProp(null);
                  setPropDialog(true);
                }}
              >
                {t("empty.properties.action")}
              </Button>
            }
          />
        )}
        {properties.length > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {properties.map((p) => (
              <Card key={p.id}>
                <CardContent className="flex items-start justify-between gap-2 p-4">
                  <button
                    className="min-w-0 flex-1 text-left"
                    type="button"
                    onClick={() =>
                      navigate({
                        to: "/app/clients/$clientId/properties/$propertyId",
                        params: { clientId: c.id, propertyId: p.id },
                      })
                    }
                  >
                    <div className="truncate font-medium">
                      {p.nickname || p.street || t("property.fields.nickname")}
                    </div>
                    <div className="truncate text-sm text-foreground-muted">
                      {[p.street, [p.city, p.region].filter(Boolean).join(", "), p.postalCode]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("actions.edit")}
                    onClick={() => {
                      setEditingProp(p);
                      setPropDialog(true);
                    }}
                  >
                    <Pencil className="size-4" aria-hidden />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </ul>
        )}
      </section>

      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={c} />
      <PropertyFormDialog
        open={propDialog}
        onOpenChange={setPropDialog}
        clientId={c.id}
        property={editingProp}
      />
    </div>
  );
}
