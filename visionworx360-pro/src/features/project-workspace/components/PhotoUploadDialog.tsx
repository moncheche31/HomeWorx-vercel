import { useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useUploadTicket,
  usePhotoMutations,
  useRoomsQuery,
} from "../hooks/useProjectWorkspace";
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  type PhotoType,
} from "../types";

const TYPES: PhotoType[] = [
  "existing",
  "design",
  "rendering",
  "progress",
  "completed",
  "damage",
  "inspiration",
  "other",
];

export function PhotoUploadDialog({
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
  const { finalize } = usePhotoMutations(projectId);
  const roomsQ = useRoomsQuery(projectId);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [photoType, setPhotoType] = useState<PhotoType>("existing");
  const [roomId, setRoomId] = useState<string>(defaultRoomId ?? "__none__");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const submit = async () => {
    if (!files.length) return;
    setBusy(true);
    setProgress({ done: 0, total: files.length });
    let succeeded = 0;
    for (const file of files) {
      try {
        if (file.size > MAX_IMAGE_BYTES) {
          toast.error(`${file.name}: ${t("errors.fileTooLarge")}`);
          continue;
        }
        if (!(IMAGE_MIME_TYPES as readonly string[]).includes(file.type)) {
          toast.error(`${file.name}: ${t("errors.unsupportedType")}`);
          continue;
        }
        const tk = await ticket.mutateAsync({
          kind: "photo",
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
        if (!uploadRes.ok) throw new Error(t("photos.uploadFailed"));
        await finalize.mutateAsync({
          projectId,
          roomId: roomId === "__none__" ? null : roomId,
          storagePath: tk.storagePath,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
          photoType,
        });
        succeeded += 1;
      } catch (err) {
        toast.error((err as Error).message || t("photos.uploadFailed"));
      } finally {
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }
    setBusy(false);
    if (succeeded > 0) toast.success(t("photos.toasts.uploaded", { count: succeeded }));
    setFiles([]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (busy ? undefined : onOpenChange(v))}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("photos.add")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_MIME_TYPES.join(",")}
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="sr-only"
          />
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="sr-only"
          />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
            >
              <ImagePlus className="mr-2 size-5" aria-hidden />
              {t("photos.chooseFiles")}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-12 w-full"
              disabled={busy}
              onClick={() => cameraRef.current?.click()}
            >
              <Camera className="mr-2 size-5" aria-hidden />
              {t("photos.takePhoto")}
            </Button>
          </div>
          {files.length > 0 ? (
            <ul className="space-y-1 rounded-md border p-2" aria-live="polite">
              {files.map((f) => (
                <li key={`${f.name}-${f.size}`} className="truncate text-sm">
                  {f.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-foreground-muted">{t("photos.noFilesSelected")}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ph-type">{t("photos.photoType")}</Label>
              <Select value={photoType} onValueChange={(v) => setPhotoType(v as PhotoType)}>
                <SelectTrigger id="ph-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((pt) => (
                    <SelectItem key={pt} value={pt}>
                      {t(`photos.types.${pt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ph-room">{t("photos.assignRoom")}</Label>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger id="ph-room">
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
          {busy && (
            <p className="text-sm text-foreground-muted" aria-live="polite">
              {t("photos.uploading")} {progress.done}/{progress.total}
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            {t("actions.cancel")}
          </Button>
          <Button onClick={submit} disabled={busy || !files.length}>
            {t("actions.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
