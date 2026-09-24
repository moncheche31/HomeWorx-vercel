import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, TouchSensor,
  closestCorners, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { useRoomsQuery } from "@/features/project-workspace/hooks/useProjectWorkspace";
import {
  useRecommendedTemplateQuery, useScopeItemsQuery, useScopeMutations,
  useScopeSectionsQuery, useScopeTemplatesQuery,
} from "../hooks/useScope";
import type { ScopeItemDTO, ScopeSectionDTO } from "../types";
import { SCOPE_PRIMARY_STATUSES, SCOPE_TRADES } from "../catalog";
import { ScopeSectionCard } from "./ScopeSectionCard";
import { SectionDialog } from "./SectionDialog";
import { ScopeItemEditor } from "./ScopeItemEditor";
import { MoveItemDialog } from "./MoveItemDialog";
import { TemplatesDialog } from "./TemplatesDialog";
import { ProjectLibraryDialog } from "@/features/knowledge-base/components/ProjectLibraryDialog";
import { useTranslation as useKbTranslation } from "react-i18next";

type Props = { projectId: string; capturedDescription?: string | null };

const ALL = "__all__";
const NO_ROOM = "__none__";

/**
 * Scope Builder v2 container.
 *
 * Extension points (intentionally not implemented here):
 * - Estimating: consume `src/domains/estimating/types.ts` from scope DTOs.
 * - AI assist / voice capture: attach to the quick-add and item editor inputs.
 * - Proposals / client presentation: read `isClientVisible` on scope items.
 */
export function ScopeTab({ projectId, capturedDescription = null }: Props) {
  const { t } = useTranslation("scope");
  const { t: tKb } = useKbTranslation("knowledge-base");
  const sectionsQ = useScopeSectionsQuery(projectId);
  const itemsQ = useScopeItemsQuery(projectId);
  const roomsQ = useRoomsQuery(projectId);
  const templatesQ = useScopeTemplatesQuery();
  const recommendedQ = useRecommendedTemplateQuery(projectId);
  const m = useScopeMutations(projectId);

  const [roomFilter, setRoomFilter] = useState<string>(ALL);
  const [tradeFilter, setTradeFilter] = useState<string>(ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [templateOpen, setTemplateOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [sectionDialog, setSectionDialog] = useState<{ section?: ScopeSectionDTO } | null>(null);
  const [itemDialog, setItemDialog] = useState<
    { section: ScopeSectionDTO; item?: ScopeItemDTO } | null
  >(null);
  const [moveDialog, setMoveDialog] = useState<ScopeItemDTO | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState<{ type: "section" | "item"; label: string } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const sections = sectionsQ.data ?? [];
  const items = itemsQ.data ?? [];
  const rooms = roomsQ.data ?? [];

  const filteredItems = useMemo(
    () =>
      items.filter((it) => {
        if (roomFilter === NO_ROOM && it.roomId !== null) return false;
        if (roomFilter !== ALL && roomFilter !== NO_ROOM && it.roomId !== roomFilter) return false;
        if (tradeFilter !== ALL && it.tradeKey !== tradeFilter) return false;
        if (statusFilter !== ALL && it.completionStatus !== statusFilter) return false;
        if (search && !it.title.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [items, roomFilter, tradeFilter, statusFilter, search],
  );

  const bySection = useMemo(() => {
    const map = new Map<string, ScopeItemDTO[]>();
    for (const it of filteredItems) {
      const arr = map.get(it.sectionId) ?? [];
      arr.push(it);
      map.set(it.sectionId, arr);
    }
    for (const arr of map.values()) arr.sort((a, b) => a.sortOrder - b.sortOrder);
    return map;
  }, [filteredItems]);

  if (sectionsQ.isLoading || itemsQ.isLoading) return <LoadingSpinner />;
  if (sectionsQ.error) return <RetryPanel onRetry={() => sectionsQ.refetch()} />;
  if (itemsQ.error) return <RetryPanel onRetry={() => itemsQ.refetch()} />;

  const activeRoomId = roomFilter !== ALL && roomFilter !== NO_ROOM ? roomFilter : null;

  const startBlank = async () => {
    try {
      await m.createSection.mutateAsync({
        projectId, name: t("sections.defaultName"), sectionKey: "general_conditions",
        roomId: activeRoomId,
      });
    } catch (e) { toast.error((e as Error).message || t("errors.generic")); }
  };

  const applyRecommended = async () => {
    const rec = recommendedQ.data;
    if (!rec) return;
    try {
      const res = await m.applyTemplate.mutateAsync({
        projectId, templateId: rec.id, roomId: activeRoomId, allowAppend: true,
      });
      toast.success(t("templates.appliedToast", {
        sections: res.sectionsCreated, items: res.itemsCreated,
      }));
    } catch (e) { toast.error((e as Error).message || t("errors.generic")); }
  };

  const onDragStart = (e: DragStartEvent) => {
    const type = e.active.data.current?.type;
    if (type === "section") {
      const s = sections.find((x) => x.id === e.active.id);
      setDragging(s ? { type: "section", label: s.name } : null);
    } else if (type === "item") {
      const it = items.find((x) => x.id === e.active.id);
      setDragging(it ? { type: "item", label: it.title } : null);
    }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    setDragging(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const activeType = active.data.current?.type;

    if (activeType === "section") {
      if (over.data.current?.type !== "section") return;
      const ids = sections.map((s) => s.id);
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      ids.splice(to, 0, ids.splice(from, 1)[0]);
      try {
        await m.reorderSections.mutateAsync({ projectId, orderedIds: ids });
      } catch (err) { toast.error((err as Error).message || t("errors.generic")); }
      return;
    }

    if (activeType !== "item") return;
    const moved = items.find((x) => x.id === active.id);
    if (!moved) return;

    const overType = over.data.current?.type;
    const targetSectionId =
      overType === "item"
        ? (over.data.current?.sectionId as string)
        : overType === "sectiondrop"
          ? (over.data.current?.sectionId as string)
          : null;
    if (!targetSectionId) return;

    const targetItems = (bySection.get(targetSectionId) ?? []).filter((x) => x.id !== moved.id);
    const overIndex =
      overType === "item" ? targetItems.findIndex((x) => x.id === over.id) : targetItems.length;
    const newIndex = overIndex < 0 ? targetItems.length : overIndex;

    try {
      if (targetSectionId === moved.sectionId) {
        const ids = targetItems.map((x) => x.id);
        ids.splice(newIndex, 0, moved.id);
        await m.reorderItems.mutateAsync({ projectId, sectionId: targetSectionId, orderedIds: ids });
      } else {
        await m.moveItemToPosition.mutateAsync({
          projectId, id: moved.id, newSectionId: targetSectionId,
          newRoomId: moved.roomId, newIndex,
        });
      }
    } catch (err) { toast.error((err as Error).message || t("errors.generic")); }
  };

  if (sections.length === 0) {
    return (
      <>
        {capturedDescription ? (
          <Card className="mb-4">
            <CardContent className="space-y-2 p-5">
              <h3 className="text-base font-semibold">{t("empty.capturedTitle")}</h3>
              <p className="text-sm text-foreground-muted">{t("empty.capturedHint")}</p>
              <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
                {capturedDescription}
              </p>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">{t("empty.buildTitle")}</h3>
              <p className="text-sm text-foreground-muted">{t("empty.description")}</p>
            </div>
            <Button className="min-h-12 w-full" onClick={startBlank}>
              <Plus className="mr-2 size-5" aria-hidden />
              {t("empty.startBlank")}
            </Button>
            <p className="text-sm text-foreground-muted">{t("empty.startBlankHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {recommendedQ.data && (
                <Button className="min-h-12" variant="outline" onClick={applyRecommended}>
                  {t("empty.useRecommended")}
                </Button>
              )}
              <Button className="min-h-12" variant="outline" onClick={() => setTemplateOpen(true)}>
                {t("empty.chooseTemplate")}
              </Button>
              <Button className="min-h-12" variant="outline" onClick={() => setLibraryOpen(true)}>
                {tKb("actions.browseLibrary")}
              </Button>
            </div>
          </CardContent>
        </Card>

        <ProjectLibraryDialog
          open={libraryOpen} onOpenChange={setLibraryOpen}
          projectId={projectId} roomId={activeRoomId}
        />
        <TemplatesDialog
          open={templateOpen} onOpenChange={setTemplateOpen}
          projectId={projectId} templates={templatesQ.data ?? []}
          recommendedId={recommendedQ.data?.id ?? null}
          sections={sections} roomId={activeRoomId} mutations={m}
        />
      </>
    );
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2 p-3">
          <Input
            className="h-11 min-w-[180px] flex-1 sm:max-w-xs"
            placeholder={t("filters.search")} aria-label={t("filters.search")}
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          <Select value={roomFilter} onValueChange={setRoomFilter}>
            <SelectTrigger className="h-11 w-[46%] sm:w-[200px]" aria-label={t("filters.allRooms")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allRooms")}</SelectItem>
              <SelectItem value={NO_ROOM}>{t("filters.generalScope")}</SelectItem>
              {rooms.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tradeFilter} onValueChange={setTradeFilter}>
            <SelectTrigger className="h-11 w-[46%] sm:w-[170px]" aria-label={t("filters.allTrades")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allTrades")}</SelectItem>
              {SCOPE_TRADES.map((tr) => <SelectItem key={tr} value={tr}>{t(`trades.${tr}`)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-11 w-[46%] sm:w-[160px]" aria-label={t("filters.allStatuses")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.allStatuses")}</SelectItem>
              {SCOPE_PRIMARY_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t(`completion.${s}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="hidden flex-1 sm:block" />
          <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => setLibraryOpen(true)}>
            {tKb("actions.browseLibrary")}
          </Button>
          <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => setTemplateOpen(true)}>
            {t("empty.chooseTemplate")}
          </Button>
          <Button className="h-11 flex-1 sm:flex-none" onClick={startBlank}>
            <Plus className="mr-1 size-4" aria-hidden /> {t("sections.addScopeSection")}
          </Button>
        </CardContent>
      </Card>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setDragging(null)}
      >
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {sections.map((section) => (
              <ScopeSectionCard
                key={section.id}
                section={section}
                items={bySection.get(section.id) ?? []}
                projectId={projectId}
                mutations={m}
                collapsed={!!collapsed[section.id]}
                onToggleCollapse={() =>
                  setCollapsed((c) => ({ ...c, [section.id]: !c[section.id] }))
                }
                onEditSection={() => setSectionDialog({ section })}
                onAddItem={() => setItemDialog({ section })}
                onEditItem={(item) => setItemDialog({ section, item })}
                onMoveItem={(item) => setMoveDialog(item)}
                quickAddRoomId={activeRoomId}
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {dragging && (
            <div className="rounded-md border border-primary bg-background px-3 py-2 text-sm font-medium shadow-lg">
              {dragging.label}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {sectionDialog && (
        <SectionDialog
          open onOpenChange={(o) => !o && setSectionDialog(null)}
          projectId={projectId} rooms={rooms} section={sectionDialog.section} mutations={m}
        />
      )}
      {itemDialog && (
        <ScopeItemEditor
          key={itemDialog.item?.id ?? "new"}
          open onOpenChange={(o) => !o && setItemDialog(null)}
          projectId={projectId} section={itemDialog.section} item={itemDialog.item}
          rooms={rooms} mutations={m}
        />
      )}
      {moveDialog && (
        <MoveItemDialog
          open onOpenChange={(o) => !o && setMoveDialog(null)}
          projectId={projectId} item={moveDialog} sections={sections} rooms={rooms} mutations={m}
        />
      )}
      <ProjectLibraryDialog
        open={libraryOpen} onOpenChange={setLibraryOpen}
        projectId={projectId} roomId={activeRoomId}
      />
      <TemplatesDialog
        open={templateOpen} onOpenChange={setTemplateOpen}
        projectId={projectId} templates={templatesQ.data ?? []}
        recommendedId={recommendedQ.data?.id ?? null}
        sections={sections} roomId={activeRoomId} mutations={m}
      />
    </div>
  );
}
