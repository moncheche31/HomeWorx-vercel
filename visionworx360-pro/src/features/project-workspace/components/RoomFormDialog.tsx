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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRoomMutations } from "../hooks/useProjectWorkspace";
import type { RoomDTO, RoomType } from "../types";

const TYPES: RoomType[] = [
  "kitchen",
  "bathroom",
  "bedroom",
  "living_room",
  "dining_room",
  "basement",
  "garage",
  "exterior",
  "roof",
  "addition",
  "whole_house",
  "other",
];

export function RoomFormDialog({
  open,
  onOpenChange,
  projectId,
  room,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  room?: RoomDTO;
}) {
  const { t } = useTranslation("pw");
  const { create, update } = useRoomMutations(projectId);
  const [name, setName] = useState("");
  const [roomType, setRoomType] = useState<RoomType>("other");
  const [floor, setFloor] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (open) {
      setName(room?.name ?? "");
      setRoomType(room?.roomType ?? "other");
      setFloor(room?.floorLevel ?? "");
      setDescription(room?.description ?? "");
    }
  }, [open, room]);

  const busy = create.isPending || update.isPending;
  const isEdit = !!room;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isEdit) {
        await update.mutateAsync({
          id: room.id,
          projectId,
          name,
          roomType,
          floorLevel: floor || null,
          description: description || null,
        });
        toast.success(t("rooms.toasts.updated"));
      } else {
        await create.mutateAsync({
          projectId,
          name,
          roomType,
          floorLevel: floor || null,
          description: description || null,
        });
        toast.success(t("rooms.toasts.created"));
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
          <DialogTitle>{isEdit ? t("rooms.edit") : t("rooms.add")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label htmlFor="room-name">{t("rooms.name")}</Label>
            <Input
              id="room-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="room-type">{t("rooms.roomType")}</Label>
              <Select value={roomType} onValueChange={(v) => setRoomType(v as RoomType)}>
                <SelectTrigger id="room-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPES.map((rt) => (
                    <SelectItem key={rt} value={rt}>
                      {t(`rooms.types.${rt}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="room-floor">{t("rooms.floorLevel")}</Label>
              <Input
                id="room-floor"
                value={floor}
                onChange={(e) => setFloor(e.target.value)}
                maxLength={60}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="room-desc">{t("rooms.description")}</Label>
            <Textarea
              id="room-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
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
            <Button type="submit" disabled={busy || !name.trim()}>
              {t("actions.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
