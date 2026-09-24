import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { ScopeItemDTO, ScopeSectionDTO } from "../types";
import type { useScopeMutations } from "../hooks/useScope";

const NONE = "__none__";

export function MoveItemDialog({
  open, onOpenChange, projectId, item, sections, rooms, mutations,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  item: ScopeItemDTO;
  sections: ScopeSectionDTO[];
  rooms: Array<{ id: string; name: string }>;
  mutations: ReturnType<typeof useScopeMutations>;
}) {
  const { t } = useTranslation("scope");
  const [sectionId, setSectionId] = useState(item.sectionId);
  const [roomId, setRoomId] = useState<string>(item.roomId ?? NONE);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("items.move")}</DialogTitle>
          <DialogDescription>{item.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger className="h-12" aria-label={t("sections.title")}><SelectValue /></SelectTrigger>
            <SelectContent>
              {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={roomId} onValueChange={setRoomId}>
            <SelectTrigger className="h-12" aria-label={t("form.room")}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("filters.generalScope")}</SelectItem>
              {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" className="h-12" onClick={() => onOpenChange(false)}>
            {t("form.cancel")}
          </Button>
          <Button
            className="h-12"
            onClick={async () => {
              try {
                await mutations.moveItem.mutateAsync({
                  projectId, id: item.id, newSectionId: sectionId,
                  newRoomId: roomId === NONE ? null : roomId,
                });
                onOpenChange(false);
              } catch (e) { toast.error((e as Error).message || t("errors.generic")); }
            }}
          >
            {t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
