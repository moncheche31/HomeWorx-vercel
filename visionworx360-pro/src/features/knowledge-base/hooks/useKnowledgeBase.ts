import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveOrgId } from "@/features/crm/hooks/useCrm";
import {
  applyAssemblyTemplate, createOrgAssembly, duplicateAssembly, listAssemblyTemplates,
  listLibraryVersions, listTemplateItems, recordAssemblyUsage, saveAssemblyEdit,
  searchAssemblies, setAssemblyState, toggleFavorite,
} from "../services/knowledgeBase.functions";
import type { z } from "zod";
import type {
  applyTemplateSchema, assemblyStateSchema, createOrgAssemblySchema,
  duplicateAssemblySchema, favoriteSchema, recordUsageSchema, saveAssemblySchema,
} from "../services/schemas";
import type {
  AssemblyDTO, AssemblyTemplateDTO, AssemblyTemplateItemDTO, LibraryVersionDTO,
} from "../types";

type SaveEditInput = z.input<typeof saveAssemblySchema>;
type SetStateInput = z.input<typeof assemblyStateSchema>;
type DuplicateInput = z.input<typeof duplicateAssemblySchema>;
type CreateInput = z.input<typeof createOrgAssemblySchema>;
type FavoriteInput = z.input<typeof favoriteSchema>;
type UsageInput = z.input<typeof recordUsageSchema>;
type ApplyTemplateInput = z.input<typeof applyTemplateSchema>;

export interface AssemblyFilters {
  search?: string;
  tradeKey?: string | null;
  categoryKey?: string | null;
  includeDisabled?: boolean;
}

export function useAssembliesQuery(filters: AssemblyFilters) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(searchAssemblies);
  return useQuery({
    queryKey: ["kb", "assemblies", orgId, filters],
    enabled: !!orgId,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    queryFn: () =>
      fn({
        data: {
          search: filters.search?.trim() || null,
          tradeKey: filters.tradeKey || null,
          categoryKey: filters.categoryKey || null,
          includeDisabled: filters.includeDisabled ?? false,
          limit: 300,
          offset: 0,
        },
      }) as Promise<AssemblyDTO[]>,
  });
}

export function useLibraryVersionsQuery() {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listLibraryVersions);
  return useQuery({
    queryKey: ["kb", "versions", orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: () => fn({ data: undefined }) as Promise<LibraryVersionDTO[]>,
  });
}

export function useAssemblyTemplatesQuery() {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listAssemblyTemplates);
  return useQuery({
    queryKey: ["kb", "templates", orgId],
    enabled: !!orgId,
    staleTime: 5 * 60_000,
    queryFn: () => fn({ data: undefined }) as Promise<AssemblyTemplateDTO[]>,
  });
}

export function useTemplateItemsQuery(templateId: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listTemplateItems);
  return useQuery({
    queryKey: ["kb", "template-items", orgId, templateId],
    enabled: !!orgId && !!templateId,
    queryFn: () => fn({ data: { templateId: templateId! } }) as Promise<AssemblyTemplateItemDTO[]>,
  });
}

export function useKnowledgeBaseMutations() {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["kb"] });

  const save = useServerFn(saveAssemblyEdit);
  const state = useServerFn(setAssemblyState);
  const duplicate = useServerFn(duplicateAssembly);
  const create = useServerFn(createOrgAssembly);
  const favorite = useServerFn(toggleFavorite);
  const usage = useServerFn(recordAssemblyUsage);
  const apply = useServerFn(applyAssemblyTemplate);

  return {
    saveEdit: useMutation({
      mutationFn: (input: SaveEditInput) => save({ data: input }),
      onSuccess: invalidate,
    }),
    setState: useMutation({
      mutationFn: (input: SetStateInput) => state({ data: input }),
      onSuccess: invalidate,
    }),
    duplicate: useMutation({
      mutationFn: (input: DuplicateInput) => duplicate({ data: input }),
      onSuccess: invalidate,
    }),
    create: useMutation({
      mutationFn: (input: CreateInput) => create({ data: input }),
      onSuccess: invalidate,
    }),
    toggleFavorite: useMutation({
      mutationFn: (input: FavoriteInput) => favorite({ data: input }),
      onSuccess: invalidate,
    }),
    recordUsage: useMutation({
      mutationFn: (input: UsageInput) => usage({ data: input }),
    }),
    applyTemplate: useMutation({
      mutationFn: (input: ApplyTemplateInput) => apply({ data: input }),
      onSuccess: () => {
        invalidate();
        qc.invalidateQueries({ queryKey: ["scope"] });
      },
    }),
  };
}
