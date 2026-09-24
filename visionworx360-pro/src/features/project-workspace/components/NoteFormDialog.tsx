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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useNoteMutations } from "../hooks/useProjectWorkspace";
import type { NoteDTO, NoteType } from "../types";

const TYPES: NoteType[] = ["general", "field", "followup", "decision", "issue"];

export function NoteFormDialog({
  open,
  onOpenChange,
  projectId,
  roomId,
  note,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  roomId?: string | null;
  note?: NoteDTO;
}) {
  const { t } = useTranslation("pw");
  const { create, update } = useNoteMutations(projectId);
  const [body, setBody] = useState("");
  const [noteType, setNoteType] = useState<NoteType>("general");
  const [isInternal, setIsInternal] = useState(false);

  useEffect(() => {
    if (open) {
      setBody(note?.body ?? "");
      setNoteType(note?.noteType ?? "general");
      setIsInternal(note?.isInternal ?? false);
    }
  }, [open, note]);

  const busy = create.isPending || update.isPending;
  const isEdit = !!note;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: note.id,
          projectId,
          roomId: note.roomId ?? null,
          body,
          noteType,
          isInternal,
        });
        toast.success(t("notes.toasts.updated"));
      } else {
        await create.mutateAsync({
          projectId,
          roomId: roomId ?? null,
          body,
          noteType,
          isInternal,
        });
        toast.success(t("notes.toasts.created"));
      }
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message || t("errors.generic"));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("notes.edit") : t("notes.add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="note-body">{t("notes.body")}</Label>
            <Textarea
              id="note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={10000}
              rows={6}
              required
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="note-type">{t("notes.noteType")}</Label>
              <Select value={noteType} onValueChange={(v) => setNoteType(v as NoteType)}>
                <SelectTrigger id="note-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((nt) => (
                    <SelectItem key={nt} value={nt}>
                      {t(`notes.types.${nt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Switch id="internal" checked={isInternal} onCheckedChange={setIsInternal} />
              <Label htmlFor="internal">{t("notes.isInternal")}</Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              {t("actions.cancel")}
            </Button>
            <Button type="submit" disabled={busy || !body.trim()}>
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
