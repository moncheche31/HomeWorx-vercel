import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveOrgId } from "@/features/crm/hooks/useCrm";
import {
  copyEstimateToProject,
  listCopySources,
  refreshCopiedPricing,
  type CopySourceDTO,
} from "../services/estimateCopy.functions";
import type { EstimateCopyOptions } from "@/domains/estimating/copyPlan";

/** Prior estimates the contractor may use as a template. Org scoped. */
export function useCopySourcesQuery(params: {
  search?: string;
  excludeProjectId?: string;
  enabled?: boolean;
}) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listCopySources);
  return useQuery({
    queryKey: ["estimating", "copySources", orgId, params.search ?? "", params.excludeProjectId],
    enabled: !!orgId && params.enabled !== false,
    queryFn: () =>
      fn({
        data: {
          search: params.search || undefined,
          excludeProjectId: params.excludeProjectId,
          limit: 20,
        },
      }) as Promise<CopySourceDTO[]>,
  });
}

export function useEstimateCopyMutations(projectId: string, estimateId?: string) {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();
  const copy = useServerFn(copyEstimateToProject);
  const refresh = useServerFn(refreshCopiedPricing);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["estimating", "list", orgId, projectId] });
    qc.invalidateQueries({ queryKey: ["estimating", "recent", orgId] });
    qc.invalidateQueries({ queryKey: ["scope"] });
    if (estimateId) {
      qc.invalidateQueries({ queryKey: ["estimating", "estimate", orgId, estimateId] });
      qc.invalidateQueries({ queryKey: ["estimating", "lines", orgId, estimateId] });
    }
  };

  return {
    /** Idempotent: a repeated confirmation returns the existing copy. */
    copyFromProject: useMutation({
      mutationFn: (data: {
        sourceEstimateId: string;
        options: Partial<EstimateCopyOptions>;
      }) => copy({ data: { ...data, targetProjectId: projectId } }),
      onSuccess: invalidate,
    }),
    /** Explicit "Refresh current pricing" on a copied estimate. */
    refreshCopiedPricing: useMutation({
      mutationFn: (data: { estimateId: string }) => refresh({ data }),
      onSuccess: (_r, vars) => {
        qc.invalidateQueries({ queryKey: ["estimating", "list", orgId, projectId] });
        qc.invalidateQueries({ queryKey: ["estimating", "estimate", orgId, vars.estimateId] });
        qc.invalidateQueries({ queryKey: ["estimating", "lines", orgId, vars.estimateId] });
      },
    }),
  };
}
