import { useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, Camera, ImagePlus, Info, ScanSearch, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PHOTO_KINDS,
  analyzePhotoPackage,
  type PhotoKind,
  type PhotoScaleObservation,
} from "@/domains/ballpark";
import type { FlowPhoto } from "../hooks/useBallparkFlow";
import { ScaleReferenceCapture } from "./ScaleReferenceCapture";

interface Props {
  photos: FlowPhoto[];
  onPhotosChange: (next: FlowPhoto[]) => void;
  /** Scale-reference observations, lifted so the engine can consume them. */
  observations: PhotoScaleObservation[];
  onObservationsChange: (next: PhotoScaleObservation[]) => void;
  roomType: string | null;
  sizeClass: string | null;
  cabinetsConfirmed: boolean;
  onContinue: () => void;
}

/**
 * Photo intake — automatic first, calibration only if you ask for it.
 *
 * Upload, tell us what the images are, and continue. The app classifies the
 * package, says plainly that no image-analysis provider is reading the pixels,
 * and then asks the few questions that actually move a range. Manual
 * object-scale calibration lives under "Advanced" and is never required — it
 * used to be the front door, which is how a door height ended up defining a
 * garage's width.
 */
export function PhotoIntakePanel({
  photos,
  onPhotosChange,
  observations,
  onObservationsChange,
  roomType,
  sizeClass,
  cabinetsConfirmed,
  onContinue,
}: Props) {
  const { t } = useTranslation("ballpark");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const analysis = useMemo(
    () =>
      analyzePhotoPackage({
        photos: photos.map(({ id, name, kind }) => ({ id, name, kind })),
        roomType,
        sizeClass,
      }),
    [photos, roomType, sizeClass],
  );

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const added: FlowPhoto[] = Array.from(files).map((file) => ({
      id: `${file.name}-${file.size}-${file.lastModified}`,
      name: file.name,
      kind: "room_photo",
      url: URL.createObjectURL(file),
    }));
    onPhotosChange([...photos, ...added.filter((a) => !photos.some((p) => p.id === a.id))]);
  };

  const setKind = (id: string, kind: PhotoKind) => {
    onPhotosChange(photos.map((photo) => (photo.id === id ? { ...photo, kind } : photo)));
  };

  /* Order matters: the first whole-room shot is the one the summary leans on. */
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= photos.length) return;
    const next = [...photos];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(target, 0, moved);
    onPhotosChange(next);
  };

  const remove = (id: string) => {
    onPhotosChange(photos.filter((p) => p.id !== id));
    onObservationsChange(observations.filter((o) => o.photoId !== id));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="size-4 text-primary" aria-hidden />
          {t("photos.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-muted">{t("photos.hint")}</p>

        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <Button
          variant="outline"
          className="min-h-(--control-min-h) w-full text-base"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus className="mr-2 size-5" aria-hidden />
          {t("photos.add")}
        </Button>

        {photos.length > 0 ? (
          <ul className="space-y-2">
            {photos.map((photo, index) => (
              <li
                key={photo.id}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-border p-2"
              >
                {photo.url ? (
                  <img
                    src={photo.url}
                    alt={t("photos.alt", { name: photo.name })}
                    className="size-16 rounded-md object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="grid size-16 place-items-center rounded-md bg-muted text-xs text-foreground-muted">
                    {t("photos.previewLost")}
                  </span>
                )}
                <div className="min-w-0 space-y-1">
                  <p className="truncate text-sm text-foreground">{photo.name}</p>
                  <Label className="sr-only" htmlFor={`kind-${photo.id}`}>
                    {t("photos.kindLabel")}
                  </Label>
                  <Select
                    value={photo.kind}
                    onValueChange={(value) => setKind(photo.id, value as PhotoKind)}
                  >
                    <SelectTrigger id={`kind-${photo.id}`} className="min-h-(--control-min-h-sm)">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PHOTO_KINDS.map((kind) => (
                        <SelectItem key={kind} value={kind}>
                          {t(`photos.kind.${kind}`)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-(--control-min-h-sm) min-w-11"
                    aria-label={t("photos.moveUp")}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-(--control-min-h-sm) min-w-11"
                    aria-label={t("photos.moveDown")}
                    disabled={index === photos.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="min-h-(--control-min-h-sm) min-w-11"
                    aria-label={t("photos.remove")}
                    onClick={() => remove(photo.id)}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {/* What we can and cannot say about these images, in plain language. */}
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ScanSearch className="size-4 text-primary" aria-hidden />
            {t("analysis.title")}
          </p>
          {analysis.notes.map((note) => (
            <p key={note.code} className="flex items-start gap-2 text-xs text-foreground-muted">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t(note.messageKey)}
            </p>
          ))}
        </div>

        {analysis.objectScaleAvailable ? (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="min-h-(--control-min-h) w-full text-sm">
                {advancedOpen ? t("scale.hideAdvanced") : t("scale.showAdvanced")}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <ScaleReferenceCapture
                roomType={roomType}
                photoIds={photos.map((photo) => photo.id)}
                observations={observations}
                onChange={onObservationsChange}
                allowCabinetRun={cabinetsConfirmed}
              />
            </CollapsibleContent>
          </Collapsible>
        ) : null}

        <p className="rounded-lg border border-border p-3 text-xs text-foreground-muted">
          {t("photos.noMeasurements")}
        </p>

        <Button className="min-h-(--control-min-h) w-full text-base" onClick={onContinue}>
          {photos.length > 0 ? t("photos.continue") : t("photos.continueWithout")}
        </Button>
      </CardContent>
    </Card>
  );
}
