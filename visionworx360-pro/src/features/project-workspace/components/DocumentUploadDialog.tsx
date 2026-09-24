import { useState } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUploadTicket,
  useDocumentMutations,
  useRoomsQuery,
} from "../hooks/useProjectWorkspace";
import {
  DOCUMENT_MIME_TYPES,
  MAX_DOCUMENT_BYTES,
  type DocumentType,
} from "../types";

const TYPES: DocumentType[] = [
  "pdf",
  "plan",
  "contract",
  "permit",
  "inspection",
  "survey",
  "specification",
  "image",
  "other",
];

export function DocumentUploadDialog({
  open,
  onOpenChange,
  projectId,
  defaultRoomId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  defaultRoomId?: string | null;
}) {
  const { t } = useTranslation("pw");
  const ticket = useUploadTicket();
  const { finalize } = useDocumentMutations(projectId);
  const roomsQ = useRoomsQuery(projectId);
  const [file, setFile] = useState<File | null>(null);
  const [docType, setDocType] = useState<DocumentType>("other");
  const [description, setDescription] = useState("");
  const [roomId, setRoomId] = useState<string>(defaultRoomId ?? "__none__");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > MAX_DOCUMENT_BYTES) throw new Error(t("errors.fileTooLarge"));
      if (!(DOCUMENT_MIME_TYPES as readonly string[]).includes(file.type))
        throw new Error(t("errors.unsupportedType"));
      const tk = await ticket.mutateAsync({
        kind: "document",
        projectId,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
      });
      const uploadRes = await fetch(tk.signedUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      });
      if (!uploadRes.ok) throw new Error(t("documents.uploadFailed"));
      await finalize.mutateAsync({
        projectId,
        roomId: roomId === "__none__" ? null : roomId,
        storagePath: tk.storagePath,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        description: description || null,
        documentType: docType,
      });
      toast.success(t("documents.toasts.uploaded"));
      setFile(null);
      setDescription("");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message || t("documents.uploadFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? undefined : onOpenChange(v))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("documents.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <input
            type="file"
            accept={DOCUMENT_MIME_TYPES.join(",")}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="doc-type">{t("documents.documentType")}</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as DocumentType)}>
                <SelectTrigger id="doc-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((dt) => (
                    <SelectItem key={dt} value={dt}>
                      {t(`documents.types.${dt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="doc-room">{t("photos.assignRoom")}</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger id="doc-room">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">{t("photos.unassigned")}</SelectItem>
                  {(roomsQ.data ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="doc-desc">{t("documents.description")}</Label>
            <Textarea
              id="doc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={1000}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !file}>
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
