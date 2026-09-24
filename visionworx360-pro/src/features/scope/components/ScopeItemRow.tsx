import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive, Check, Copy, Edit3, EyeOff, GripVertical, ImageIcon, MoreVertical,
  Paperclip, Trash2, X, CornerUpRight, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ScopeItemDTO } from "../types";
import type { useScopeMutations } from "../hooks/useScope";

const PRIORITY_CLASS: Record<string, string> = {
  urgent: "border-destructive text-destructive font-semibold",
  high: "border-[color:var(--confidence-needs-confirmation)] text-[color:var(--confidence-needs-confirmation)] font-semibold",
  low: "text-foreground-muted",
};

export function ScopeItemRow({
  item, projectId, mutations, onEdit, onMove,
}: {
  item: ScopeItemDTO;
  projectId: string;
  mutations: ReturnType<typeof useScopeMutations>;
  onEdit: () => void;
  onMove: () => void;
}) {
  const { t } = useTranslation("scope");
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState(item.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { type: "item", sectionId: item.sectionId },
  });

  const basePayload = {
    projectId, id: item.id, sectionId: item.sectionId, roomId: item.roomId,
    title: item.title, tradeKey: item.tradeKey, categoryKey: item.categoryKey,
    subcategoryKey: item.subcategoryKey, actionKey: item.actionKey, unitKey: item.unitKey,
    quantity: item.quantity, description: item.description,
    materialSelection: item.materialSelection, finishSelection: item.finishSelection,
    laborNotes: item.laborNotes, customerNotes: item.customerNotes,
    internalNotes: item.internalNotes, assumptions: item.assumptions,
    exclusions: item.exclusions, isIncluded: item.isIncluded,
    isCustomerSelection: item.isCustomerSelection, isClientVisible: item.isClientVisible,
    priority: item.priority, confidenceStatus: item.confidenceStatus,
    completionStatus: item.completionStatus, scopeItemKey: item.scopeItemKey,
  };

  const saveTitle = async () => {
    const next = title.trim();
    setEditingTitle(false);
    if (!next || next === item.title) { setTitle(item.title); return; }
    try {
      await mutations.updateItem.mutateAsync({ ...basePayload, title: next });
    } catch (e) {
      setTitle(item.title);
      toast.error((e as Error).message || t("errors.generic"));
    }
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={
        "flex items-start gap-2 rounded-md border border-transparent bg-background py-3 pr-1 " +
        (isDragging ? "opacity-60 border-border shadow-sm" : "")
      }
    >
      <button
        type="button"
        className="mt-1 flex size-11 shrink-0 touch-none items-center justify-center rounded-md text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={t("items.dragHandle")}
        title={t("items.dragHandle")}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" aria-hidden />
      </button>

      <div className="min-w-0 flex-1">
        {editingTitle ? (
          <Input
            className="h-11 text-base" value={title} autoFocus
            aria-label={t("form.title")}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveTitle();
              if (e.key === "Escape") { setTitle(item.title); setEditingTitle(false); }
            }}
          />
        ) : (
          <button
            type="button"
            className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
            onClick={() => setEditingTitle(true)}
            aria-label={t("items.inlineEdit")}
          >
            <span className={"font-medium " + (item.isIncluded ? "" : "line-through text-foreground-muted")}>
              {item.title}
            </span>
          </button>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {!item.isIncluded && <Badge variant="outline">{t("items.excluded")}</Badge>}
          {item.tradeKey && (
            <Badge variant="secondary">{t(`trades.${item.tradeKey}`, item.tradeKey)}</Badge>
          )}
          {item.categoryKey && (
            <Badge variant="outline">{t(`categories.${item.categoryKey}`, item.categoryKey)}</Badge>
          )}
          {item.actionKey && <Badge>{t(`actions.${item.actionKey}`)}</Badge>}
          <Badge variant="outline">{t(`completion.${item.completionStatus}`)}</Badge>
          {item.priority !== "normal" && (
            <Badge variant="outline" className={PRIORITY_CLASS[item.priority]}>
              {t(`priority.${item.priority}`)}
            </Badge>
          )}
          {item.confidenceStatus && (
            <Badge
              variant="outline"
              className={
                item.confidenceStatus === "needs_verification"
                  ? "border-[color:var(--confidence-needs-confirmation)] text-[color:var(--confidence-needs-confirmation)] font-semibold"
                  : undefined
              }
            >
              {t(`confidence.${item.confidenceStatus}`)}
            </Badge>
          )}
          {!item.isClientVisible && (
            <Badge variant="outline" className="gap-1">
              <EyeOff className="size-3" aria-hidden /> {t("items.internalOnly")}
            </Badge>
          )}
          {item.linkedPhotoIds.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-foreground-muted">
              <ImageIcon className="size-3.5" aria-hidden /> {item.linkedPhotoIds.length}
            </span>
          )}
          {item.linkedDocumentIds.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs text-foreground-muted">
              <Paperclip className="size-3.5" aria-hidden /> {item.linkedDocumentIds.length}
            </span>
          )}
        </div>

        {(item.quantity != null || item.unitKey) && (
          <p className="mt-1 text-xs text-foreground-muted">
            {item.quantity ?? ""} {item.unitKey ? t(`units.${item.unitKey}`) : ""}
          </p>
        )}
        {item.description && (
          <p className="mt-1 whitespace-pre-wrap text-sm">{item.description}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon" variant="ghost" className="size-11"
          aria-label={t("items.edit")} title={t("items.edit")}
          onClick={onEdit}
        >
          <Edit3 className="size-4" aria-hidden />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon" variant="ghost" className="size-11"
              aria-label={t("items.more")} title={t("items.more")}
            >
              <MoreVertical className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => mutations.duplicateItem.mutate({ projectId, id: item.id })}>
              <Copy className="mr-2 size-4" aria-hidden /> {t("items.duplicate")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onMove}>
              <CornerUpRight className="mr-2 size-4" aria-hidden /> {t("items.move")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                mutations.updateItem.mutate({ ...basePayload, isIncluded: !item.isIncluded })
              }
            >
              {item.isIncluded
                ? <><X className="mr-2 size-4" aria-hidden /> {t("items.markExcluded")}</>
                : <><Check className="mr-2 size-4" aria-hidden /> {t("items.markIncluded")}</>}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {item.archivedAt ? (
              <DropdownMenuItem onClick={() => mutations.restoreItem.mutate({ projectId, id: item.id })}>
                <RotateCcw className="mr-2 size-4" aria-hidden /> {t("items.restore")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={() => mutations.archiveItem.mutate({ projectId, id: item.id })}>
                <Archive className="mr-2 size-4" aria-hidden /> {t("items.archive")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-2 size-4" aria-hidden /> {t("items.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("items.delete")}</AlertDialogTitle>
            <AlertDialogDescription>{t("items.deleteConfirm")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                try {
                  await mutations.deleteItem.mutateAsync({ projectId, id: item.id });
                  toast.success(t("items.deleted"));
                } catch (e) { toast.error((e as Error).message || t("errors.generic")); }
              }}
            >
              {t("items.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
