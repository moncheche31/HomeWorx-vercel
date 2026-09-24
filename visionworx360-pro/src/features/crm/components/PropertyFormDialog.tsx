import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { usePropertyMutations, useClientsQuery } from "../hooks/useCrm";
import { QuickClientSheet } from "./QuickClientSheet";
import { clientDisplayName } from "../utils/format";
import type { PropertyDTO } from "../services/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Fixed owning client. Omit to let the user pick or create one inline. */
  clientId?: string;
  property?: PropertyDTO | null;
  onSaved?: (p: PropertyDTO) => void;
}

const empty = {
  nickname: "",
  street: "",
  city: "",
  region: "",
  postalCode: "",
  county: "",
  yearBuilt: "",
  squareFootage: "",
  bedrooms: "",
  bathrooms: "",
  stories: "",
  constructionType: "",
  occupied: false,
  notes: "",
};

export function PropertyFormDialog({ open, onOpenChange, clientId, property, onSaved }: Props) {
  const { t } = useTranslation("crm");
  const { create, update, orgId } = usePropertyMutations();
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  const editing = !!property;
  const clientLocked = !!clientId;
  const [selectedClientId, setSelectedClientId] = useState<string>(
    clientId ?? property?.clientId ?? "",
  );
  const [quickClientOpen, setQuickClientOpen] = useState(false);
  const clientsQuery = useClientsQuery({
    q: "",
    includeArchived: false,
    page: 1,
    pageSize: 100,
    sort: "name_asc",
  });
  const clientOptions = clientsQuery.data?.items ?? [];

  useEffect(() => {
    if (open) setSelectedClientId(clientId ?? property?.clientId ?? "");
  }, [open, clientId, property]);

  useEffect(() => {
    if (open) {
      setErr(null);
      setForm(
        property
          ? {
              nickname: property.nickname ?? "",
              street: property.street ?? "",
              city: property.city ?? "",
              region: property.region ?? "",
              postalCode: property.postalCode ?? "",
              county: property.county ?? "",
              yearBuilt: property.yearBuilt?.toString() ?? "",
              squareFootage: property.squareFootage?.toString() ?? "",
              bedrooms: property.bedrooms?.toString() ?? "",
              bathrooms: property.bathrooms?.toString() ?? "",
              stories: property.stories?.toString() ?? "",
              constructionType: property.constructionType ?? "",
              occupied: property.occupied ?? false,
              notes: property.notes ?? "",
            }
          : empty,
      );
    }
  }, [open, property]);

  const bind =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) {
      setErr(t("errors.noActiveOrg"));
      return;
    }
    const effectiveClientId = clientId ?? selectedClientId;
    if (!effectiveClientId) {
      setErr(t("property.clientRequired"));
      return;
    }
    const payload = {
      activeOrganizationId: orgId,
      clientId: effectiveClientId,
      nickname: form.nickname,
      street: form.street,
      city: form.city,
      region: form.region,
      postalCode: form.postalCode,
      county: form.county,
      yearBuilt: form.yearBuilt ? Number(form.yearBuilt) : null,
      squareFootage: form.squareFootage ? Number(form.squareFootage) : null,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
      bathrooms: form.bathrooms ? Number(form.bathrooms) : null,
      stories: form.stories ? Number(form.stories) : null,
      constructionType: form.constructionType,
      occupied: form.occupied,
      notes: form.notes,
    };
    try {
      const saved =
        editing && property
          ? await update.mutateAsync({ ...payload, id: property.id })
          : await create.mutateAsync(payload);
      toast.success(t(editing ? "property.toast.updated" : "property.toast.created"));
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errors.loadFailed"));
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? t("actions.edit") : t("actions.newProperty")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          {!clientLocked && (
            <div className="sm:col-span-2">
              <Label htmlFor="property-client">
                {t("project.fields.client")}{" "}
                <span className="text-destructive" aria-hidden>
                  *
                </span>
              </Label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  id="property-client"
                  required
                  className="min-h-(--control-min-h-sm) w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                >
                  <option value="">{t("property.selectClient")}</option>
                  {clientOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {clientDisplayName(c)}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-(--control-min-h-sm) shrink-0"
                  onClick={() => setQuickClientOpen(true)}
                >
                  {t("actions.createNewClient")}
                </Button>
              </div>
            </div>
          )}
          <div className="sm:col-span-2">
            <Label htmlFor="nickname">{t("property.fields.nickname")}</Label>
            <Input id="nickname" value={form.nickname} onChange={bind("nickname")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="street">{t("property.fields.street")}</Label>
            <Input id="street" value={form.street} onChange={bind("street")} />
          </div>
          <div>
            <Label htmlFor="pcity">{t("property.fields.city")}</Label>
            <Input id="pcity" value={form.city} onChange={bind("city")} />
          </div>
          <div>
            <Label htmlFor="pregion">{t("property.fields.region")}</Label>
            <Input id="pregion" value={form.region} onChange={bind("region")} />
          </div>
          <div>
            <Label htmlFor="ppostal">{t("property.fields.postalCode")}</Label>
            <Input id="ppostal" value={form.postalCode} onChange={bind("postalCode")} />
          </div>
          <div>
            <Label htmlFor="county">{t("property.fields.county")}</Label>
            <Input id="county" value={form.county} onChange={bind("county")} />
          </div>
          <div>
            <Label htmlFor="yearBuilt">{t("property.fields.yearBuilt")}</Label>
            <Input
              id="yearBuilt"
              inputMode="numeric"
              value={form.yearBuilt}
              onChange={bind("yearBuilt")}
            />
          </div>
          <div>
            <Label htmlFor="sqft">{t("property.fields.squareFootage")}</Label>
            <Input
              id="sqft"
              inputMode="numeric"
              value={form.squareFootage}
              onChange={bind("squareFootage")}
            />
          </div>
          <div>
            <Label htmlFor="beds">{t("property.fields.bedrooms")}</Label>
            <Input
              id="beds"
              inputMode="decimal"
              value={form.bedrooms}
              onChange={bind("bedrooms")}
            />
          </div>
          <div>
            <Label htmlFor="baths">{t("property.fields.bathrooms")}</Label>
            <Input
              id="baths"
              inputMode="decimal"
              value={form.bathrooms}
              onChange={bind("bathrooms")}
            />
          </div>
          <div>
            <Label htmlFor="stories">{t("property.fields.stories")}</Label>
            <Input
              id="stories"
              inputMode="numeric"
              value={form.stories}
              onChange={bind("stories")}
            />
          </div>
          <div>
            <Label htmlFor="ctype">{t("property.fields.constructionType")}</Label>
            <Input id="ctype" value={form.constructionType} onChange={bind("constructionType")} />
          </div>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Switch
              id="occupied"
              checked={form.occupied}
              onCheckedChange={(v) => setForm((f) => ({ ...f, occupied: v }))}
            />
            <Label htmlFor="occupied">{t("property.fields.occupied")}</Label>
          </div>
          <div className="sm:col-span-2">
            <Label>{t("property.fields.gps")}</Label>
            <p className="text-sm text-foreground-muted">{t("property.gpsPlaceholder")}</p>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="pnotes">{t("property.fields.notes")}</Label>
            <Textarea id="pnotes" value={form.notes} onChange={bind("notes")} rows={3} />
          </div>
          {err && (
            <p className="sm:col-span-2 text-sm text-destructive" role="alert">
              {err}
            </p>
          )}
          <DialogFooter className="sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("actions.saving") : t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
        <QuickClientSheet
          open={quickClientOpen}
          onOpenChange={setQuickClientOpen}
          onCreated={(c) => {
            setSelectedClientId(c.id);
            setQuickClientOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
