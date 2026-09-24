import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  applyProjectPermitPlan,
  getProjectPermitPlan,
  type PermitPlanResult,
} from "../services/permits.functions";

/** Permit plan for ONE project + estimate. Never cached across projects. */
export function usePermitPlanQuery(params: { projectId: string; estimateId?: string }) {
  const fn = useServerFn(getProjectPermitPlan);
  return useQuery({
    queryKey: ["estimating", "permits", params.projectId, params.estimateId],
    enabled: !!params.estimateId,
    queryFn: () =>
      fn({
        data: { projectId: params.projectId, estimateId: params.estimateId as string },
      }) as Promise<PermitPlanResult>,
  });
}

export function useApplyPermitPlan(projectId: string, estimateId?: string) {
  const qc = useQueryClient();
  const fn = useServerFn(applyProjectPermitPlan);
  return useMutation({
    mutationFn: () =>
      fn({ data: { projectId, estimateId: estimateId as string } }) as Promise<{
        written: number;
        total: number;
      }>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimating", "permits", projectId] });
      qc.invalidateQueries({ queryKey: ["estimating"] });
    },
  });
}
