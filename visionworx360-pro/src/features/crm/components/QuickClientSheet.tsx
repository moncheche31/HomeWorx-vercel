import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useClientMutations } from "../hooks/useCrm";
import type { ClientDTO } from "../services/types";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (client: ClientDTO) => void;
}

const empty = { name: "", phone: "", email: "", address: "" };

/**
 * Minimal in-flow client creation used by the project creation form.
 * Keeps typed data on failure and never creates the same client twice.
 */
export function QuickClientSheet({ open, onOpenChange, onCreated }: Props) {
  const { t } = useTranslation("crm");
  const { create, orgId } = useClientMutations();
  const [form, setForm] = useState(empty);
  const [err, setErr] = useState<string | null>(null);
  // Guards against double-submit / retries creating duplicate clients.
  const createdRef = useRef<ClientDTO | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (open) {
      setErr(null);
      createdRef.current = null;
      inFlightRef.current = false;
      setForm(empty);
    }
  }, [open]);

  const bind = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (createdRef.current) {
      onCreated(createdRef.current);
      onOpenChange(false);
      return;
    }
    if (inFlightRef.current) return;
    if (!orgId) {
      setErr(t("errors.noActiveOrg"));
      return;
    }
    const name = form.name.trim();
    if (!name) {
      setErr(t("quickClient.nameRequired"));
      return;
    }
    const [firstName, ...rest] = name.split(/\s+/);
    inFlightRef.current = true;
    setErr(null);
    try {
      const saved = await create.mutateAsync({
        activeOrganizationId: orgId,
        firstName: firstName ?? name,
        lastName: rest.join(" "),
        email: form.email.trim(),
        phone: form.phone.trim(),
        addressLine1: form.address.trim(),
        preferredContact: "any",
      });
      createdRef.current = saved;
      toast.success(t("client.toast.created"));
      onCreated(saved);
      onOpenChange(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("errors.loadFailed"));
    } finally {
      inFlightRef.current = false;
    }
  }

  const busy = create.isPending;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("quickClient.title")}</SheetTitle>
          <SheetDescription>{t("quickClient.description")}</SheetDescription>
        </SheetHeader>
        <form onSubmit={onSubmit} className="grid gap-4 py-4">
          <div>
            <Label htmlFor="qc-name">
              {t("quickClient.fields.name")}{" "}
              <span className="text-destructive" aria-hidden>
                *
              </span>
            </Label>
            <Input
              id="qc-name"
              required
              autoComplete="name"
              className="min-h-(--control-min-h)"
              value={form.name}
              onChange={bind("name")}
            />
          </div>
          <div>
            <Label htmlFor="qc-phone">{t("quickClient.fields.phone")}</Label>
            <Input
              id="qc-phone"
              inputMode="tel"
              autoComplete="tel"
              className="min-h-(--control-min-h)"
              value={form.phone}
              onChange={bind("phone")}
            />
          </div>
          <div>
            <Label htmlFor="qc-email">{t("quickClient.fields.email")}</Label>
            <Input
              id="qc-email"
              type="email"
              autoComplete="email"
              className="min-h-(--control-min-h)"
              value={form.email}
              onChange={bind("email")}
            />
          </div>
          <div>
            <Label htmlFor="qc-address">{t("quickClient.fields.address")}</Label>
            <Input
              id="qc-address"
              autoComplete="street-address"
              className="min-h-(--control-min-h)"
              value={form.address}
              onChange={bind("address")}
            />
          </div>
          {err ? (
            <p className="text-sm text-destructive" role="alert">
              {err}
            </p>
          ) : null}
          <SheetFooter className="gap-2">
            <Button type="submit" className="min-h-(--control-min-h) w-full" disabled={busy}>
              {busy ? t("actions.saving") : t("quickClient.submit")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="min-h-(--control-min-h) w-full"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t("actions.cancel")}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
