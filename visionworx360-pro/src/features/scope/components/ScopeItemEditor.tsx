import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Paperclip, ImageIcon } from "lucide-react";
import {
  useDocumentsQuery, usePhotosQuery,
} from "@/features/project-workspace/hooks/useProjectWorkspace";
import { SignedImage } from "@/features/project-workspace/components/SignedImage";
import type { ScopeItemDTO, ScopeSectionDTO } from "../types";
import {
  SCOPE_ACTIONS, SCOPE_CATEGORIES, SCOPE_CONFIDENCES, SCOPE_PRIMARY_STATUSES,
  SCOPE_PRIORITIES, SCOPE_TRADES, SCOPE_UNITS, subcategoriesFor,
} from "../catalog";
import type { useScopeMutations } from "../hooks/useScope";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  projectId: string;
  section: ScopeSectionDTO;
  item?: ScopeItemDTO;
  rooms: Array<{ id: string; name: string }>;
  mutations: ReturnType<typeof useScopeMutations>;
};

const NONE = "__none__";

/**
 * Full scope item editor. Renders as a centered dialog on desktop and as a
 * full-screen sheet on mobile so field editing stays one-handed.
 */
export function ScopeItemEditor({
  open, onOpenChange, projectId, section, item, rooms, mutations,
}: Props) {
  const { t } = useTranslation("scope");
  const photosQ = usePhotosQuery(projectId);
  const documentsQ = useDocumentsQuery(projectId);

  const [title, setTitle] = useState(item?.title ?? "");
  const [roomId, setRoomId] = useState<string>(item?.roomId ?? section.roomId ?? NONE);
  const [tradeKey, setTradeKey] = useState(item?.tradeKey ?? section.tradeKey ?? "");
  const [categoryKey, setCategoryKey] = useState(item?.categoryKey ?? "");
  const [subcategoryKey, setSubcategoryKey] = useState(item?.subcategoryKey ?? "");
  const [actionKey, setActionKey] = useState<string>(item?.actionKey ?? "");
  const [quantity, setQuantity] = useState<string>(item?.quantity != null ? String(item.quantity) : "");
  const [unitKey, setUnitKey] = useState<string>(item?.unitKey ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [material, setMaterial] = useState(item?.materialSelection ?? "");
  const [finish, setFinish] = useState(item?.finishSelection ?? "");
  const [customerNotes, setCustomerNotes] = useState(item?.customerNotes ?? "");
  const [internalNotes, setInternalNotes] = useState(item?.internalNotes ?? "");
  const [assumptions, setAssumptions] = useState(item?.assumptions ?? "");
  const [exclusions, setExclusions] = useState(item?.exclusions ?? "");
  const [confidence, setConfidence] = useState<string>(item?.confidenceStatus ?? "");
  const [status, setStatus] = useState<string>(item?.completionStatus ?? "draft");
  const [priority, setPriority] = useState<string>(item?.priority ?? "normal");
  const [isIncluded, setIsIncluded] = useState<boolean>(item?.isIncluded ?? true);
  const [clientVisible, setClientVisible] = useState<boolean>(item?.isClientVisible ?? true);
  const [saving, setSaving] = useState(false);

  const subcategories = useMemo(() => subcategoriesFor(categoryKey), [categoryKey]);
  const photos = (photosQ.data ?? []).filter((p) => !p.archivedAt);
  const documents = (documentsQ.data ?? []).filter((d) => !d.archivedAt);
  const linkedPhotos = new Set(item?.linkedPhotoIds ?? []);
  const linkedDocs = new Set(item?.linkedDocumentIds ?? []);

  const submit = async () => {
    setSaving(true);
    const payload = {
      projectId,
      sectionId: section.id,
      roomId: roomId === NONE ? null : roomId,
      title,
      tradeKey: tradeKey || null,
      categoryKey: categoryKey || null,
      subcategoryKey: subcategoryKey || null,
      actionKey: actionKey || null,
      quantity: quantity === "" ? null : Number(quantity),
      unitKey: unitKey || null,
      description: description || null,
      materialSelection: material || null,
      finishSelection: finish || null,
      customerNotes: customerNotes || null,
      internalNotes: internalNotes || null,
      assumptions: assumptions || null,
      exclusions: exclusions || null,
      isIncluded,
      isClientVisible: clientVisible,
      isCustomerSelection: item?.isCustomerSelection ?? false,
      priority,
      confidenceStatus: confidence || null,
      completionStatus: status,
    };
    try {
      if (item) await mutations.updateItem.mutateAsync({ ...payload, id: item.id });
      else await mutations.createItem.mutateAsync(payload);
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message || t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const togglePhoto = async (photoId: string) => {
    if (!item) {
      toast.info(t("form.saveFirst"));
      return;
    }
    try {
      if (linkedPhotos.has(photoId))
        await mutations.unlinkPhoto.mutateAsync({ projectId, itemId: item.id, photoId });
      else await mutations.linkPhoto.mutateAsync({ projectId, itemId: item.id, photoId });
    } catch (e) { toast.error((e as Error).message); }
  };

  const toggleDocument = async (documentId: string) => {
    if (!item) {
      toast.info(t("form.saveFirst"));
      return;
    }
    try {
      if (linkedDocs.has(documentId))
        await mutations.unlinkDocument.mutateAsync({ projectId, itemId: item.id, documentId });
      else await mutations.linkDocument.mutateAsync({ projectId, itemId: item.id, documentId });
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl max-sm:h-[100dvh] max-sm:max-h-[100dvh] max-sm:w-screen max-sm:max-w-none max-sm:rounded-none max-sm:border-0 max-sm:top-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0 max-h-[88vh] overflow-y-auto p-4 sm:p-6"
      >
        <DialogHeader>
          <DialogTitle>{item ? t("items.edit") : t("items.add")}</DialogTitle>
          <DialogDescription>{section.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pb-24 sm:pb-0">
          <div className="space-y-1">
            <Label htmlFor="scope-title">{t("form.title")}</Label>
            <Input
              id="scope-title" className="h-12 text-base" value={title} autoFocus
              placeholder={t("form.title")} onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("form.status")}>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-12" aria-label={t("form.status")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_PRIMARY_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{t(`completion.${s}`)}</SelectItem>
                  ))}
                  {item && !SCOPE_PRIMARY_STATUSES.includes(item.completionStatus) && (
                    <SelectItem value={item.completionStatus}>
                      {t(`completion.${item.completionStatus}`)}
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("form.priority")}>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-12" aria-label={t("form.priority")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SCOPE_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>{t(`priority.${p}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("form.room")}>
              <Select value={roomId} onValueChange={setRoomId}>
                <SelectTrigger className="h-12" aria-label={t("form.room")}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("filters.generalScope")}</SelectItem>
                  {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("form.trade")}>
              <Select value={tradeKey || NONE} onValueChange={(v) => setTradeKey(v === NONE ? "" : v)}>
                <SelectTrigger className="h-12" aria-label={t("form.trade")}>
                  <SelectValue placeholder={t("form.notSet")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("form.notSet")}</SelectItem>
                  {SCOPE_TRADES.map((tr) => <SelectItem key={tr} value={tr}>{t(`trades.${tr}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("form.category")}>
              <Select
                value={categoryKey || NONE}
                onValueChange={(v) => { setCategoryKey(v === NONE ? "" : v); setSubcategoryKey(""); }}
              >
                <SelectTrigger className="h-12" aria-label={t("form.category")}>
                  <SelectValue placeholder={t("form.notSet")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("form.notSet")}</SelectItem>
                  {SCOPE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>{t(`categories.${c}`, c)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("form.subcategory")}>
              <Select
                value={subcategoryKey || NONE}
                onValueChange={(v) => setSubcategoryKey(v === NONE ? "" : v)}
                disabled={subcategories.length === 0}
              >
                <SelectTrigger className="h-12" aria-label={t("form.subcategory")}>
                  <SelectValue placeholder={t("form.notSet")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("form.notSet")}</SelectItem>
                  {subcategories.map((sc) => (
                    <SelectItem key={sc} value={sc}>{t(`subcategories.${sc}`, sc)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t("form.action")}>
              <Select value={actionKey || NONE} onValueChange={(v) => setActionKey(v === NONE ? "" : v)}>
                <SelectTrigger className="h-12" aria-label={t("form.action")}>
                  <SelectValue placeholder={t("form.notSet")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("form.notSet")}</SelectItem>
                  {SCOPE_ACTIONS.map((a) => <SelectItem key={a} value={a}>{t(`actions.${a}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label={t("form.quantity")}>
              <Input
                className="h-12" type="number" inputMode="decimal" step="0.01"
                value={quantity} onChange={(e) => setQuantity(e.target.value)}
                aria-label={t("form.quantity")}
              />
            </Field>
            <Field label={t("form.unit")}>
              <Select value={unitKey || NONE} onValueChange={(v) => setUnitKey(v === NONE ? "" : v)}>
                <SelectTrigger className="h-12" aria-label={t("form.unit")}>
                  <SelectValue placeholder={t("form.notSet")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("form.notSet")}</SelectItem>
                  {SCOPE_UNITS.map((u) => <SelectItem key={u} value={u}>{t(`units.${u}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label={t("form.description")}>
            <Textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              rows={3} aria-label={t("form.description")}
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("form.material")}>
              <Input className="h-12" value={material} onChange={(e) => setMaterial(e.target.value)} aria-label={t("form.material")} />
            </Field>
            <Field label={t("form.finish")}>
              <Input className="h-12" value={finish} onChange={(e) => setFinish(e.target.value)} aria-label={t("form.finish")} />
            </Field>
          </div>

          <Field label={t("form.internalNotes")}>
            <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={2} aria-label={t("form.internalNotes")} />
          </Field>
          <Field label={t("form.customerNotes")}>
            <Textarea value={customerNotes} onChange={(e) => setCustomerNotes(e.target.value)} rows={2} aria-label={t("form.customerNotes")} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t("form.assumptions")}>
              <Textarea value={assumptions} onChange={(e) => setAssumptions(e.target.value)} rows={2} aria-label={t("form.assumptions")} />
            </Field>
            <Field label={t("form.exclusions")}>
              <Textarea value={exclusions} onChange={(e) => setExclusions(e.target.value)} rows={2} aria-label={t("form.exclusions")} />
            </Field>
          </div>

          <Field label={t("form.confidence")}>
            <Select value={confidence || NONE} onValueChange={(v) => setConfidence(v === NONE ? "" : v)}>
              <SelectTrigger className="h-12" aria-label={t("form.confidence")}>
                <SelectValue placeholder={t("form.notSet")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("form.notSet")}</SelectItem>
                {SCOPE_CONFIDENCES.map((c) => <SelectItem key={c} value={c}>{t(`confidence.${c}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-foreground-muted">{t("form.confidenceHint")}</p>
          </Field>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label htmlFor="scope-included" className="text-sm">{t("form.isIncluded")}</Label>
            <Switch id="scope-included" checked={isIncluded} onCheckedChange={setIsIncluded} />
          </div>
          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <Label htmlFor="scope-client-visible" className="text-sm">{t("form.clientVisible")}</Label>
            <Switch id="scope-client-visible" checked={clientVisible} onCheckedChange={setClientVisible} />
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <ImageIcon className="size-4" aria-hidden /> {t("form.photos")}
            </p>
            {!item && <p className="text-xs text-foreground-muted">{t("form.saveFirst")}</p>}
            {item && photos.length === 0 && (
              <p className="text-xs text-foreground-muted">{t("form.noPhotos")}</p>
            )}
            {item && photos.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {photos.map((p) => {
                  const selected = linkedPhotos.has(p.id);
                  return (
                    <button
                      key={p.id} type="button"
                      aria-pressed={selected}
                      aria-label={p.caption ?? p.fileName}
                      onClick={() => togglePhoto(p.id)}
                      className={
                        "relative overflow-hidden rounded-md border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                        (selected ? "border-primary" : "border-border")
                      }
                    >
                      <SignedImage
                        projectId={projectId} storagePath={p.storagePath}
                        alt={p.altText ?? p.fileName} className="aspect-square w-full object-cover"
                      />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Attachments */}
          <div className="space-y-2">
            <p className="text-sm font-medium flex items-center gap-2">
              <Paperclip className="size-4" aria-hidden /> {t("form.attachments")}
            </p>
            {item && documents.length === 0 && (
              <p className="text-xs text-foreground-muted">{t("form.noDocuments")}</p>
            )}
            {item && documents.map((d) => {
              const selected = linkedDocs.has(d.id);
              return (
                <button
                  key={d.id} type="button" aria-pressed={selected}
                  onClick={() => toggleDocument(d.id)}
                  className={
                    "flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-2 text-left text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (selected ? "border-primary bg-muted" : "border-border")
                  }
                >
                  <span className="truncate">{d.fileName}</span>
                  {selected && <Badge variant="secondary">{t("form.attached")}</Badge>}
                </button>
              );
            })}
          </div>
        </div>

        <DialogFooter className="max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:z-10 max-sm:flex-row max-sm:gap-2 max-sm:border-t max-sm:border-border max-sm:bg-background max-sm:p-3">
          <Button variant="ghost" className="h-12 max-sm:flex-1" onClick={() => onOpenChange(false)}>
            {t("form.cancel")}
          </Button>
          <Button className="h-12 max-sm:flex-1" onClick={submit} disabled={!title.trim() || saving}>
            {t("form.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
