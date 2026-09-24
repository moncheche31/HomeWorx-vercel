import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { commitApprovedEstimate } from "../services/estimateCommit.functions";
import type { CanonicalEstimateCommit, EstimateCommitResult } from "@/domains/estimating/estimateCommit";

/**
 * Shared "approve -> durable estimate" mutation for every intake mode.
 * Intake features must use this instead of talking to estimate services
 * directly, so scope, estimate, ballpark band and cache invalidation stay
 * identical no matter how the job was captured.
 */
export function useEstimateCommit() {
  const qc = useQueryClient();
  const fn = useServerFn(commitApprovedEstimate);
  return useMutation({
    mutationFn: (payload: CanonicalEstimateCommit) =>
      fn({ data: payload as never }) as Promise<EstimateCommitResult>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimating"] });
      qc.invalidateQueries({ queryKey: ["scope"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}
