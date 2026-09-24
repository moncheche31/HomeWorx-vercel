import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveOrgId } from "@/features/crm/hooks/useCrm";
import {
  applyCompositeAssemblyToLine,
  applyKnowledgeBasePricing,
  archiveEstimate, archiveEstimateLine, confirmLineCatalogItem, createEstimateFromScope,
  createEstimateLine, createEstimateRevision, createEstimateVersion, getEstimate,
  listEstimateAudit, listEstimateLines, refineBallparkAssumption, listEstimates, listRecentEstimates, refreshEstimate, reviewLineQuantity,
  convertEstimateToDetailed, getScopeSyncState, reviseAndSyncEstimate, setBallparkBandPosition, setEstimateStatus, setLineManualPricing, syncEstimateFromScope, updateEstimate,
  updateEstimateLine,
} from "../services/estimating.functions";
import type { ScopeSyncStateDTO } from "../services/estimating.functions";
import { captureLineMeasurement } from "../services/lineMeasurement.functions";
import type { CaptureLineMeasurementInput } from "../services/lineMeasurement.schemas";
import type { EstimateDTO, EstimateLineDTO, RecentEstimateDTO } from "../types";
import type { z } from "zod";
import type {
  applyCompositeSchema,
  confirmLineCatalogSchema, createLineSchema, manualLinePricingSchema,
  reviewLineQuantitySchema, setStatusSchema, updateEstimateSchema, updateLineSchema,
} from "../services/schemas";

type SetStatusInput = z.infer<typeof setStatusSchema>;
type UpdateEstimateInput = z.infer<typeof updateEstimateSchema>;
type CreateLineInput = z.infer<typeof createLineSchema>;
type UpdateLineInput = z.infer<typeof updateLineSchema>;
type ConfirmCatalogInput = z.infer<typeof confirmLineCatalogSchema>;
type ManualPricingInput = z.infer<typeof manualLinePricingSchema>;
type ReviewQuantityInput = z.infer<typeof reviewLineQuantitySchema>;
type ApplyCompositeInput = z.infer<typeof applyCompositeSchema>;

export function useEstimatesQuery(projectId: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listEstimates);
  return useQuery({
    queryKey: ["estimating", "list", orgId, projectId],
    enabled: !!orgId && !!projectId,
    queryFn: () => fn({ data: { projectId: projectId! } }) as Promise<EstimateDTO[]>,
  });
}

/**
 * Workspace-wide recent estimates for the dashboard. Includes ballpark-mode
 * estimates: no pricing completeness is required for an estimate to be real.
 */
export function useRecentEstimatesQuery(limit = 6) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listRecentEstimates);
  return useQuery({
    queryKey: ["estimating", "recent", orgId, limit],
    enabled: !!orgId,
    queryFn: () => fn({ data: { limit } }) as Promise<RecentEstimateDTO[]>,
  });
}

export function useEstimateQuery(estimateId: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(getEstimate);
  return useQuery({
    queryKey: ["estimating", "estimate", orgId, estimateId],
    enabled: !!orgId && !!estimateId,
    queryFn: () => fn({ data: { estimateId: estimateId! } }) as Promise<EstimateDTO>,
  });
}

export function useEstimateLinesQuery(estimateId: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listEstimateLines);
  return useQuery({
    queryKey: ["estimating", "lines", orgId, estimateId],
    enabled: !!orgId && !!estimateId,
    queryFn: () => fn({ data: { estimateId: estimateId! } }) as Promise<EstimateLineDTO[]>,
  });
}

/**
 * Durable scope-staleness read: the baseline lives on the estimate row, so a
 * closed-and-reopened project still knows the estimate is based on old scope.
 */
export function useScopeSyncStateQuery(estimateId: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(getScopeSyncState);
  return useQuery({
    queryKey: ["estimating", "scopeSync", orgId, estimateId],
    enabled: !!orgId && !!estimateId,
    queryFn: () => fn({ data: { estimateId: estimateId! } }) as Promise<ScopeSyncStateDTO>,
  });
}

export function useEstimateAuditQuery(estimateId: string | undefined) {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listEstimateAudit);
  return useQuery({
    queryKey: ["estimating", "audit", orgId, estimateId],
    enabled: !!orgId && !!estimateId,
    queryFn: () => fn({ data: { estimateId: estimateId! } }),
  });
}

/**
 * Explicit reconciliation. Reads are pure, so scope/catalog changes reach a
 * saved estimate only when the contractor asks (or a commit finishes).
 */
export function useRefreshEstimate(projectId: string, estimateId?: string) {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();
  const fn = useServerFn(refreshEstimate);
  return useMutation({
    mutationFn: () => fn({ data: { estimateId: estimateId! } }) as Promise<EstimateDTO>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["estimating", "list", orgId, projectId] });
      qc.invalidateQueries({ queryKey: ["estimating", "recent", orgId] });
      qc.invalidateQueries({ queryKey: ["estimating", "scopeSync", orgId] });
      if (estimateId) {
        qc.invalidateQueries({ queryKey: ["estimating", "estimate", orgId, estimateId] });
        qc.invalidateQueries({ queryKey: ["estimating", "lines", orgId, estimateId] });
        qc.invalidateQueries({ queryKey: ["estimating", "audit", orgId, estimateId] });
      }
    },
  });
}

export function useEstimateMutations(projectId: string, estimateId?: string) {
  const qc = useQueryClient();
  const orgId = useActiveOrgId();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["estimating", "list", orgId, projectId] });
    /* Saving a ballpark changes what the dashboard should show. */
    qc.invalidateQueries({ queryKey: ["estimating", "recent", orgId] });
    qc.invalidateQueries({ queryKey: ["estimating", "scopeSync", orgId] });
    if (estimateId) {

      qc.invalidateQueries({ queryKey: ["estimating", "estimate", orgId, estimateId] });
      qc.invalidateQueries({ queryKey: ["estimating", "lines", orgId, estimateId] });
      qc.invalidateQueries({ queryKey: ["estimating", "audit", orgId, estimateId] });
    }
  };

  const fromScope = useServerFn(createEstimateFromScope);
  const newVersion = useServerFn(createEstimateVersion);
  const newRevision = useServerFn(createEstimateRevision);
  const sync = useServerFn(syncEstimateFromScope);
  const reviseSync = useServerFn(reviseAndSyncEstimate);
  const status = useServerFn(setEstimateStatus);
  const update = useServerFn(updateEstimate);
  const bandPosition = useServerFn(setBallparkBandPosition);
  const convertDetailed = useServerFn(convertEstimateToDetailed);
  const archive = useServerFn(archiveEstimate);
  const addLine = useServerFn(createEstimateLine);
  const patchLine = useServerFn(updateEstimateLine);
  const removeLine = useServerFn(archiveEstimateLine);
  const applyPricing = useServerFn(applyKnowledgeBasePricing);
  const confirmCatalog = useServerFn(confirmLineCatalogItem);
  const manualPricing = useServerFn(setLineManualPricing);
  const reviewQuantity = useServerFn(reviewLineQuantity);
  const applyComposite = useServerFn(applyCompositeAssemblyToLine);
  const refineAssumption = useServerFn(refineBallparkAssumption);
  const captureMeasurement = useServerFn(captureLineMeasurement);

  return {
    /** Contractor confirms a Knowledge Base item for one line (authoritative). */
    confirmLineCatalog: useMutation({
      mutationFn: (data: ConfirmCatalogInput) => confirmCatalog({ data }),
      onSuccess: invalidate,
    }),
    /** Contractor prices a line by hand; protected from automatic repricing. */
    setLineManualPricing: useMutation({
      mutationFn: (data: ManualPricingInput) => manualPricing({ data }),
      onSuccess: invalidate,
    }),
    /** Recognized composite (e.g. platform floor) expanded into its components. */
    applyCompositeAssembly: useMutation({
      mutationFn: (data: ApplyCompositeInput) => applyComposite({ data }),
      onSuccess: invalidate,
    }),
    /**
     * Ballpark refinement loop: the contractor corrects a disclosed assumption
     * (or clears the correction with a null quantity) and the band recalculates.
     */
    refineBallparkAssumption: useMutation({
      mutationFn: (data: {
        estimateId: string;
        itemId: string;
        itemKey: string;
        quantity: number | null;
      }) => refineAssumption({ data }),
      onSuccess: invalidate,
    }),
    /**
     * On-site measurement capture for a gated line: spoken or typed, bound to
     * the exact line that asked for it.
     */
    captureLineMeasurement: useMutation({
      mutationFn: (data: CaptureLineMeasurementInput) => captureMeasurement({ data }),
      onSuccess: invalidate,
    }),
    reviewLineQuantity: useMutation({
      mutationFn: (data: ReviewQuantityInput) => reviewQuantity({ data }),
      onSuccess: invalidate,
    }),
    createFromScope: useMutation({
      mutationFn: (data: { projectId: string; title?: string }) => fromScope({ data }),
      onSuccess: invalidate,
    }),
    createRevision: useMutation({
      mutationFn: (data: { estimateId: string }) => newRevision({ data }),
      onSuccess: invalidate,
    }),
    applyKnowledgePricing: useMutation({
      mutationFn: (data: { estimateId: string }) => applyPricing({ data }),
      onSuccess: invalidate,
    }),
    createVersion: useMutation({
      mutationFn: (data: { estimateId: string }) => newVersion({ data }),
      onSuccess: invalidate,
    }),
    /** Issued documents: next numbered revision + scope import in one action. */
    reviseAndSync: useMutation({
      mutationFn: (data: { estimateId: string }) => reviseSync({ data }),
      onSuccess: invalidate,
    }),
    syncFromScope: useMutation({
      mutationFn: (data: { estimateId: string }) => sync({ data }),
      onSuccess: invalidate,
    }),
    setStatus: useMutation({
      mutationFn: (data: SetStatusInput) => status({ data }),
      onSuccess: invalidate,
    }),
    updateEstimate: useMutation({
      mutationFn: (data: UpdateEstimateInput) => update({ data }),
      onSuccess: invalidate,
    }),
    /**
     * Where inside the saved preliminary band the contractor is selling.
     * Price position only — scope and pricing settings are never touched.
     */
    setBallparkBandPosition: useMutation({
      mutationFn: (data: { estimateId: string; position: "low" | "expected" | "high" }) =>
        bandPosition({ data }),
      onSuccess: invalidate,
    }),
    /** Ballpark -> Detailed on the same estimate; idempotent, non-destructive. */
    convertToDetailed: useMutation({
      mutationFn: (data: { estimateId: string }) => convertDetailed({ data }),
      onSuccess: invalidate,
    }),
    archiveEstimate: useMutation({
      mutationFn: (data: { estimateId: string; archived: boolean }) => archive({ data }),
      onSuccess: invalidate,
    }),
    createLine: useMutation({
      mutationFn: (data: CreateLineInput) => addLine({ data }),
      onSuccess: invalidate,
    }),
    updateLine: useMutation({
      mutationFn: (data: UpdateLineInput) => patchLine({ data }),
      onSuccess: () => {
        if (estimateId) {
          qc.invalidateQueries({ queryKey: ["estimating", "lines", orgId, estimateId] });
        }
      },
    }),
    archiveLine: useMutation({
      mutationFn: (data: { lineId: string; archived: boolean }) => removeLine({ data }),
      onSuccess: invalidate,
    }),
  };
}
