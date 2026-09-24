import { useEffect, useRef, useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useClientMutations } from "../hooks/useCrm";
import type { ClientDTO, ContactMethod } from "../services/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  client?: ClientDTO | null;
  onSaved?: (c: ClientDTO) => void;
}

const initial = {
  firstName: "",
  lastName: "",
  company: "",
  email: "",
  phone: "",
  secondaryPhone: "",
  addressLine1: "",
  city: "",
  region: "",
  postalCode: "",
  notes: "",
  preferredContact: "any" as ContactMethod,
};

export function ClientFormDialog({ open, onOpenChange, client, onSaved }: Props) {
  const { t } = useTranslation("crm");
  const { create, update, orgId } = useClientMutations();
  const [form, setForm] = useState(initial);
  const [err, setErr] = useState<string | null>(null);
  // Guards against duplicate clients on repeated clicks / retries.
  const createdRef = useRef<ClientDTO | null>(null);
  const inFlightRef = useRef(false);
  const editing = !!client;

  useEffect(() => {
    if (open) {
      setErr(null);
      createdRef.current = null;
      inFlightRef.current = false;
      setForm(
        client
          ? {
              firstName: client.firstName ?? "",
              lastName: client.lastName ?? "",
              company: client.company ?? "",
              email: client.email ?? "",
              phone: client.phone ?? "",
              secondaryPhone: client.secondaryPhone ?? "",
              addressLine1: client.addressLine1 ?? "",
              city: client.city ?? "",
              region: client.region ?? "",
              postalCode: client.postalCode ?? "",
              notes: client.notes ?? "",
              preferredContact: client.preferredContact,
            }
          : initial,
      );
    }
  }, [open, client]);

  const bind =
    (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (createdRef.current) {
      onSaved?.(createdRef.current);
      onOpenChange(false);
      return;
    }
    if (inFlightRef.current) return;
    if (!orgId) {
      setErr(t("errors.noActiveOrg"));
      return;
    }
    inFlightRef.current = true;
    try {
      if (editing && client) {
        const saved = await update.mutateAsync({
          ...form,
          id: client.id,
          activeOrganizationId: orgId,
        });
        toast.success(t("client.toast.updated"));
        onSaved?.(saved);
      } else {
        const saved = await create.mutateAsync({ ...form, activeOrganizationId: orgId });
        createdRef.current = saved;
        toast.success(t("client.toast.created"));
        onSaved?.(saved);
      }
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errors.loadFailed"));
    } finally {
      inFlightRef.current = false;
    }
  }

  const busy = create.isPending || update.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t("actions.edit") + " " + t("client.titleList").slice(0, -1)
              : t("actions.newClient")}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-1">
            <Label htmlFor="firstName">{t("client.fields.firstName")}</Label>
            <Input
              id="firstName"
              value={form.firstName}
              onChange={bind("firstName")}
              autoComplete="given-name"
            />
          </div>
          <div className="sm:col-span-1">
            <Label htmlFor="lastName">{t("client.fields.lastName")}</Label>
            <Input
              id="lastName"
              value={form.lastName}
              onChange={bind("lastName")}
              autoComplete="family-name"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="company">{t("client.fields.company")}</Label>
            <Input
              id="company"
              value={form.company}
              onChange={bind("company")}
              autoComplete="organization"
            />
          </div>
          <div>
            <Label htmlFor="email">{t("client.fields.email")}</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={bind("email")}
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="phone">{t("client.fields.phone")}</Label>
            <Input
              id="phone"
              inputMode="tel"
              value={form.phone}
              onChange={bind("phone")}
              autoComplete="tel"
            />
          </div>
          <div>
            <Label htmlFor="secondaryPhone">{t("client.fields.secondaryPhone")}</Label>
            <Input
              id="secondaryPhone"
              inputMode="tel"
              value={form.secondaryPhone}
              onChange={bind("secondaryPhone")}
            />
          </div>
          <div>
            <Label htmlFor="preferredContact">{t("client.fields.preferredContact")}</Label>
            <Select
              value={form.preferredContact}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, preferredContact: v as ContactMethod }))
              }
            >
              <SelectTrigger id="preferredContact">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(["any", "email", "phone", "sms"] as ContactMethod[]).map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`contact.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="addressLine1">{t("client.fields.address")}</Label>
            <Input
              id="addressLine1"
              value={form.addressLine1}
              onChange={bind("addressLine1")}
              autoComplete="street-address"
            />
          </div>
          <div>
            <Label htmlFor="city">{t("client.fields.city")}</Label>
            <Input
              id="city"
              value={form.city}
              onChange={bind("city")}
              autoComplete="address-level2"
            />
          </div>
          <div>
            <Label htmlFor="region">{t("client.fields.region")}</Label>
            <Input
              id="region"
              value={form.region}
              onChange={bind("region")}
              autoComplete="address-level1"
            />
          </div>
          <div>
            <Label htmlFor="postalCode">{t("client.fields.postalCode")}</Label>
            <Input
              id="postalCode"
              value={form.postalCode}
              onChange={bind("postalCode")}
              autoComplete="postal-code"
            />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">{t("client.fields.notes")}</Label>
            <Textarea id="notes" value={form.notes} onChange={bind("notes")} rows={3} />
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
      </DialogContent>
    </Dialog>
  );
}
