import { useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Archive, ChevronDown, ChevronRight, Edit3, GripVertical, Plus, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { ScopeItemDTO, ScopeSectionDTO } from "../types";
import type { useScopeMutations } from "../hooks/useScope";
import { ScopeItemRow } from "./ScopeItemRow";

export function ScopeSectionCard({
  section, items, projectId, mutations, collapsed, onToggleCollapse,
  onEditSection, onAddItem, onEditItem, onMoveItem, quickAddRoomId,
}: {
  section: ScopeSectionDTO;
  items: ScopeItemDTO[];
  projectId: string;
  mutations: ReturnType<typeof useScopeMutations>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onEditSection: () => void;
  onAddItem: () => void;
  onEditItem: (item: ScopeItemDTO) => void;
  onMoveItem: (item: ScopeItemDTO) => void;
  quickAddRoomId: string | null;
}) {
  const { t } = useTranslation("scope");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(section.name);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    data: { type: "section" },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `sectiondrop:${section.id}`,
    data: { type: "sectiondrop", sectionId: section.id },
  });

  const saveName = async () => {
    const next = name.trim();
    setRenaming(false);
    if (!next || next === section.name) { setName(section.name); return; }
    try {
      await mutations.updateSection.mutateAsync({
        projectId, id: section.id, name: next, description: section.description,
        tradeKey: section.tradeKey, roomId: section.roomId,
      });
    } catch (e) {
      setName(section.name);
      toast.error((e as Error).message || t("errors.generic"));
    }
  };

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-70 shadow-lg" : undefined}
    >
      <CardContent className="space-y-3 p-3 sm:p-4">
        <div className="flex items-start gap-1">
          <button
            type="button"
            className="mt-0.5 flex size-11 shrink-0 touch-none items-center justify-center rounded-md text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("sections.dragHandle")}
            title={t("sections.dragHandle")}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-5" aria-hidden />
          </button>
          <button
            type="button"
            className="mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-md text-foreground-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={collapsed ? t("sections.expand") : t("sections.collapse")}
            aria-expanded={!collapsed}
            title={collapsed ? t("sections.expand") : t("sections.collapse")}
            onClick={onToggleCollapse}
          >
            {collapsed ? <ChevronRight className="size-5" aria-hidden /> : <ChevronDown className="size-5" aria-hidden />}
          </button>

          <div className="min-w-0 flex-1 py-1">
            {renaming ? (
              <Input
                className="h-11 text-base" value={name} autoFocus
                aria-label={t("sections.rename")}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveName();
                  if (e.key === "Escape") { setName(section.name); setRenaming(false); }
                }}
              />
            ) : (
              <button
                type="button"
                className="w-full truncate text-left text-base font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                onClick={() => setRenaming(true)}
                aria-label={t("sections.rename")}
              >
                {section.name}
              </button>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-foreground-muted">
              {section.tradeKey && (
                <Badge variant="secondary">{t(`trades.${section.tradeKey}`, section.tradeKey)}</Badge>
              )}
              <span>{t("items.count", { count: items.length })}</span>
            </div>
          </div>

          <Button
            size="icon" variant="ghost" className="size-11"
            aria-label={t("sections.edit")} title={t("sections.edit")}
            onClick={onEditSection}
          >
            <Edit3 className="size-4" aria-hidden />
          </Button>
          {section.archivedAt ? (
            <Button
              size="icon" variant="ghost" className="size-11"
              aria-label={t("sections.restore")} title={t("sections.restore")}
              onClick={() => mutations.restoreSection.mutate({ projectId, id: section.id })}
            >
              <RotateCcw className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              size="icon" variant="ghost" className="size-11"
              aria-label={t("sections.archive")} title={t("sections.archive")}
              onClick={async () => {
                try {
                  await mutations.archiveSection.mutateAsync({ projectId, id: section.id });
                } catch (e) {
                  const msg = (e as Error).message;
                  toast.error(msg === "section_has_active_items" ? t("errors.sectionHasItems") : msg);
                }
              }}
            >
              <Archive className="size-4" aria-hidden />
            </Button>
          )}
        </div>

        {!collapsed && (
          <>
            <div
              ref={setDropRef}
              className={
                "rounded-md transition " +
                (isOver ? "bg-muted ring-2 ring-ring ring-offset-2 ring-offset-background" : "")
              }
            >
              <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                <ul className="divide-y divide-border">
                  {items.map((it) => (
                    <ScopeItemRow
                      key={it.id} item={it} projectId={projectId} mutations={mutations}
                      onEdit={() => onEditItem(it)} onMove={() => onMoveItem(it)}
                    />
                  ))}
                </ul>
              </SortableContext>
              {items.length === 0 && (
                <p className="py-6 text-center text-sm text-foreground-muted">{t("items.empty")}</p>
              )}
            </div>

            <QuickAdd
              onAdd={async (title) => {
                try {
                  await mutations.quickAddItem.mutateAsync({
                    projectId, sectionId: section.id,
                    roomId: quickAddRoomId ?? section.roomId ?? null,
                    title,
                  });
                } catch (e) { toast.error((e as Error).message || t("errors.generic")); }
              }}
            />

            <Button variant="outline" className="h-11 w-full sm:w-auto" onClick={onAddItem}>
              <Plus className="mr-1 size-4" aria-hidden /> {t("items.add")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function QuickAdd({ onAdd }: { onAdd: (title: string) => Promise<void> | void }) {
  const { t } = useTranslation("scope");
  const [v, setV] = useState("");
  return (
    <form
      className="flex gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!v.trim()) return;
        const val = v.trim();
        setV("");
        await onAdd(val);
      }}
    >
      <Input
        className="h-12 text-base" placeholder={t("items.quickAdd")} aria-label={t("items.quickAdd")}
        value={v} onChange={(e) => setV(e.target.value)}
      />
      <Button
        type="submit" variant="secondary" className="size-12 shrink-0" size="icon"
        disabled={!v.trim()} aria-label={t("items.add")} title={t("items.add")}
      >
        <Plus className="size-5" aria-hidden />
      </Button>
    </form>
  );
}
