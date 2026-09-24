/**
 * Assembly expansion hooks (contractor review surface).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  expandEstimateLineAssembly,
  getEstimateLineAssembly,
  materializeAssemblyExpansion,
  reviewAssemblyExpansion,
} from "../services/assemblyExpansion.functions";

export function useLineAssembly(lineId: string | null, enabled: boolean) {
  const fn = useServerFn(getEstimateLineAssembly);
  return useQuery({
    queryKey: ["assemblyExpansion", lineId],
    queryFn: () => fn({ data: { estimateLineId: lineId as string } }),
    enabled: !!lineId && enabled,
    staleTime: 30_000,
  });
}

function useInvalidate(estimateId?: string) {
  const qc = useQueryClient();
  return (lineId: string) => {
    void qc.invalidateQueries({ queryKey: ["assemblyExpansion", lineId] });
    void qc.invalidateQueries({ queryKey: ["estimating"] });
    if (estimateId) void qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
  };
}

export function useExpandLineAssembly(estimateId?: string) {
  const fn = useServerFn(expandEstimateLineAssembly);
  const invalidate = useInvalidate(estimateId);
  return useMutation({
    mutationFn: (v: { estimateLineId: string; regenerate?: boolean }) => fn({ data: v }),
    onSuccess: (_d, v) => invalidate(v.estimateLineId),
  });
}

export function useReviewAssemblyExpansion(lineId: string, estimateId?: string) {
  const fn = useServerFn(reviewAssemblyExpansion);
  const invalidate = useInvalidate(estimateId);
  return useMutation({
    mutationFn: (v: {
      expansionId: string;
      estimateLineId?: string;
      components: {
        id: string;
        isIncluded?: boolean;
        quantity?: number | null;
        selectedReferenceId?: number | null;
      }[];
      geometry?: Record<string, number | null> | null;
      markReviewed?: boolean;
    }) => fn({ data: v }),
    onSuccess: () => invalidate(lineId),
  });
}



export function useMaterializeAssembly(estimateId?: string) {
  const fn = useServerFn(materializeAssemblyExpansion);
  const invalidate = useInvalidate(estimateId);
  return useMutation({
    mutationFn: (estimateLineId: string) => fn({ data: { estimateLineId } }),
    onSuccess: (_d, lineId) => invalidate(lineId),
  });
}
