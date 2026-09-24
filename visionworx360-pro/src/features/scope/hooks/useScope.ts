import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useOptionalWorkspace } from "@/features/workspace/providers/WorkspaceProvider";
import { useActiveOrgId } from "@/features/crm/hooks/useCrm";
import {
  applyScopeTemplate, archiveScopeItem, archiveScopeSection, bulkUpdateScopeInclusion,
  createScopeItem, createScopeSection, deleteScopeItem, duplicateScopeItem,
  insertTemplateItem, insertTemplateSection, linkScopeDocument, linkScopePhoto,
  listScopeItems, listScopeSections, listScopeTemplates, moveScopeItem,
  moveScopeItemToPosition, previewScopeTemplate, quickAddScopeItem, recommendScopeTemplate,
  reorderScopeItems, reorderScopeSections, restoreScopeItem, restoreScopeSection,
  unlinkScopeDocument, unlinkScopePhoto, updateScopeItem, updateScopeSection,
} from "../services/scope.functions";
import type { ScopeItemDTO, ScopeSectionDTO } from "../types";

/* Sections */
export function useScopeSectionsQuery(
  projectId: string | undefined,
  roomId?: string | null,
  includeArchived = false,
) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listScopeSections);
  return useQuery({
    queryKey: ["scope", "sections", orgId, projectId, roomId ?? "all", includeArchived],
    enabled: !!orgId && !!projectId,
    queryFn: () =>
      fn({ data: { projectId: projectId!, roomId: roomId ?? undefined, includeArchived } }) as Promise<ScopeSectionDTO[]>,
  });
}

/* Items */
export function useScopeItemsQuery(
  projectId: string | undefined,
  filters: {
    roomId?: string | null; sectionId?: string; tradeKey?: string;
    confidence?: any; search?: string; includedOnly?: boolean;
    excludedOnly?: boolean; includeArchived?: boolean;
  } = {},
) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listScopeItems);
  return useQuery({
    queryKey: ["scope", "items", orgId, projectId, filters],
    enabled: !!orgId && !!projectId,
    queryFn: () =>
      fn({ data: { projectId: projectId!, ...filters } }) as Promise<ScopeItemDTO[]>,
  });
}

/**
 * Same query, but tolerant of surfaces that render outside the workspace
 * provider (dialogs mounted in isolation). Without an org it simply stays
 * disabled instead of throwing.
 */
export function useOptionalScopeItemsQuery(
  projectId: string | undefined,
  filters: Parameters<typeof useScopeItemsQuery>[1] = {},
) {
  const orgId = useOptionalWorkspace()?.organization?.id ?? null;
  const fn = useServerFn(listScopeItems);
  return useQuery({
    queryKey: ["scope", "items", orgId, projectId, filters],
    enabled: !!orgId && !!projectId,
    queryFn: () =>
      fn({ data: { projectId: projectId!, ...filters } }) as Promise<ScopeItemDTO[]>,
  });
}

/* Templates */
export function useScopeTemplatesQuery() {
  const fn = useServerFn(listScopeTemplates);
  return useQuery({
    queryKey: ["scope", "templates"],
    queryFn: () => fn({ data: {} }),
    staleTime: 60_000,
  });
}
export function useRecommendedTemplateQuery(projectId: string | undefined) {
  const fn = useServerFn(recommendScopeTemplate);
  return useQuery({
    queryKey: ["scope", "recommended", projectId],
    enabled: !!projectId,
    queryFn: () => fn({ data: { projectId: projectId! } }),
  });
}
export function useTemplatePreviewQuery(templateId: string | undefined) {
  const fn = useServerFn(previewScopeTemplate);
  return useQuery({
    queryKey: ["scope", "templatePreview", templateId],
    enabled: !!templateId,
    queryFn: () => fn({ data: { templateId: templateId! } }),
  });
}

/* Mutations */
export function useScopeMutations(projectId: string) {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();
  const inval = () => {
    qc.invalidateQueries({ queryKey: ["scope", "sections", orgId, projectId] });
    qc.invalidateQueries({ queryKey: ["scope", "items", orgId, projectId] });
    qc.invalidateQueries({ queryKey: ["pw", "activity", orgId, projectId] });
  };

  const createSection = useServerFn(createScopeSection);
  const updateSection = useServerFn(updateScopeSection);
  const archiveSection = useServerFn(archiveScopeSection);
  const restoreSection = useServerFn(restoreScopeSection);
  const reorderSections = useServerFn(reorderScopeSections);

  const createItem = useServerFn(createScopeItem);
  const quickAddItem = useServerFn(quickAddScopeItem);
  const updateItem = useServerFn(updateScopeItem);
  const archiveItem = useServerFn(archiveScopeItem);
  const restoreItem = useServerFn(restoreScopeItem);
  const duplicateItem = useServerFn(duplicateScopeItem);
  const moveItem = useServerFn(moveScopeItem);
  const moveItemToPosition = useServerFn(moveScopeItemToPosition);
  const deleteItem = useServerFn(deleteScopeItem);
  const reorderItems = useServerFn(reorderScopeItems);
  const bulkInclusion = useServerFn(bulkUpdateScopeInclusion);

  const linkPhoto = useServerFn(linkScopePhoto);
  const unlinkPhoto = useServerFn(unlinkScopePhoto);
  const linkDocument = useServerFn(linkScopeDocument);
  const unlinkDocument = useServerFn(unlinkScopeDocument);

  const applyTemplate = useServerFn(applyScopeTemplate);
  const insertSectionFromTemplate = useServerFn(insertTemplateSection);
  const insertItemFromTemplate = useServerFn(insertTemplateItem);

  return {
    createSection: useMutation({ mutationFn: (d: any) => createSection({ data: d }), onSuccess: inval }),
    updateSection: useMutation({ mutationFn: (d: any) => updateSection({ data: d }), onSuccess: inval }),
    archiveSection: useMutation({ mutationFn: (d: any) => archiveSection({ data: d }), onSuccess: inval }),
    restoreSection: useMutation({ mutationFn: (d: any) => restoreSection({ data: d }), onSuccess: inval }),
    reorderSections: useMutation({ mutationFn: (d: any) => reorderSections({ data: d }), onSuccess: inval }),
    createItem: useMutation({ mutationFn: (d: any) => createItem({ data: d }), onSuccess: inval }),
    quickAddItem: useMutation({ mutationFn: (d: any) => quickAddItem({ data: d }), onSuccess: inval }),
    updateItem: useMutation({ mutationFn: (d: any) => updateItem({ data: d }), onSuccess: inval }),
    archiveItem: useMutation({ mutationFn: (d: any) => archiveItem({ data: d }), onSuccess: inval }),
    restoreItem: useMutation({ mutationFn: (d: any) => restoreItem({ data: d }), onSuccess: inval }),
    duplicateItem: useMutation({ mutationFn: (d: any) => duplicateItem({ data: d }), onSuccess: inval }),
    moveItem: useMutation({ mutationFn: (d: any) => moveItem({ data: d }), onSuccess: inval }),
    moveItemToPosition: useMutation({ mutationFn: (d: any) => moveItemToPosition({ data: d }), onSuccess: inval }),
    deleteItem: useMutation({ mutationFn: (d: any) => deleteItem({ data: d }), onSuccess: inval }),
    reorderItems: useMutation({ mutationFn: (d: any) => reorderItems({ data: d }), onSuccess: inval }),
    bulkInclusion: useMutation({ mutationFn: (d: any) => bulkInclusion({ data: d }), onSuccess: inval }),
    linkPhoto: useMutation({ mutationFn: (d: any) => linkPhoto({ data: d }), onSuccess: inval }),
    unlinkPhoto: useMutation({ mutationFn: (d: any) => unlinkPhoto({ data: d }), onSuccess: inval }),
    linkDocument: useMutation({ mutationFn: (d: any) => linkDocument({ data: d }), onSuccess: inval }),
    unlinkDocument: useMutation({ mutationFn: (d: any) => unlinkDocument({ data: d }), onSuccess: inval }),
    applyTemplate: useMutation({ mutationFn: (d: any) => applyTemplate({ data: d }), onSuccess: inval }),
    insertTemplateSection: useMutation({ mutationFn: (d: any) => insertSectionFromTemplate({ data: d }), onSuccess: inval }),
    insertTemplateItem: useMutation({ mutationFn: (d: any) => insertItemFromTemplate({ data: d }), onSuccess: inval }),
  };
}
