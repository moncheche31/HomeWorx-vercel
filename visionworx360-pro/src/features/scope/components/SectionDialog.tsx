import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { SCOPE_TRADES } from "../catalog";
import type { ScopeSectionDTO } from "../types";
import type { useScopeMutations } from "../hooks/useScope";

const NONE = "__none__";

export function SectionDialog({
  open, onOpenChange, projectId, rooms, section, mutations,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  rooms: Array<{ id: string; name: string }>;
  section?: ScopeSectionDTO;
  mutations: ReturnType<typeof useScopeMutations>;
}) {
  const { t } = useTranslation("scope");
  const [name, setName] = useState(section?.name ?? "");
  const [description, setDescription] = useState(section?.description ?? "");
  const [tradeKey, setTradeKey] = useState(section?.tradeKey ?? "");
  const [roomId, setRoomId] = useState<string>(section?.roomId ?? NONE);

  const submit = async () => {
    const payload: Record<string, unknown> = {
      projectId, name, description: description || null,
      tradeKey: tradeKey || null, roomId: roomId === NONE ? null : roomId,
    };
    try {
      if (section) await mutations.updateSection.mutateAsync({ ...payload, id: section.id });
      else await mutations.createSection.mutateAsync(payload);
      onOpenChange(false);
    } catch (e) { toast.error((e as Error).message || t("errors.generic")); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0">
        <DialogHeader>
          <DialogTitle>{section ? t("sections.edit") : t("sections.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            className="h-12 text-base" autoFocus
            placeholder={t("sections.namePlaceholder")} aria-label={t("sections.namePlaceholder")}
            value={name} onChange={(e) => setName(e.target.value)}
          />
          <Select value={tradeKey || NONE} onValueChange={(v) => setTradeKey(v === NONE ? "" : v)}>
            <SelectTrigger className="h-12" aria-label={t("form.trade")}>
              <SelectValue placeholder={t("form.trade")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("form.notSet")}</SelectItem>
              {SCOPE_TRADES.map((tr) => <SelectItem key={tr} value={tr}>{t(`trades.${tr}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger className="h-12" aria-label={t("form.room")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("filters.generalScope")}</SelectItem>
              {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Textarea
            placeholder={t("sections.descriptionPlaceholder")}
            aria-label={t("sections.descriptionPlaceholder")}
            value={description} onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" className="h-12" onClick={() => onOpenChange(false)}>
            {t("form.cancel")}
          </Button>
          <Button className="h-12" onClick={submit} disabled={!name.trim()}>{t("form.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
