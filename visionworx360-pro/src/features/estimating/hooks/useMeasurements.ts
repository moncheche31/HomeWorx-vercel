import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveOrgId } from "@/features/crm/hooks/useCrm";
import {
  applyGeometryQuantities,
  listProjectMeasurements,
  saveProjectMeasurements,
} from "../services/measurements.functions";
import type { ProjectMeasurementDTO } from "../measurementTypes";
import type { z } from "zod";
import type {
  applyGeometryQuantitiesSchema, saveMeasurementsSchema,
} from "../services/measurementSchemas";

/**
 * The measurement panel renders inside dialogs that are also mounted in
 * isolation (tests, previews) without the workspace provider. A missing
 * workspace simply disables the queries instead of crashing the estimate.
 */
function useSafeOrgId(): string | null {
  try {
    return useActiveOrgId() ?? null;
  } catch {
    return null;
  }
}

type SaveInput = z.infer<typeof saveMeasurementsSchema>;
type ApplyInput = z.infer<typeof applyGeometryQuantitiesSchema>;

export function useProjectMeasurementsQuery(projectId: string | undefined) {
  const orgId = useSafeOrgId();
  const fn = useServerFn(listProjectMeasurements);
  return useQuery({
    queryKey: ["estimating", "measurements", orgId, projectId],
    enabled: !!orgId && !!projectId,
    queryFn: () => fn({ data: { projectId: projectId! } }) as Promise<ProjectMeasurementDTO[]>,
  });
}

/** The project-wide record (roomId === null), if the contractor saved one. */
export function useProjectGeometry(projectId: string | undefined) {
  const query = useProjectMeasurementsQuery(projectId);
  const record = useMemo(
    () => (query.data ?? []).find((m) => m.roomId == null) ?? null,
    [query.data],
  );
  return { ...query, record };
}

export function useMeasurementMutations(projectId: string, estimateId?: string) {
  const qc = useQueryClient();
  const orgId = useSafeOrgId();
  const save = useServerFn(saveProjectMeasurements);
  const apply = useServerFn(applyGeometryQuantities);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["estimating", "measurements", orgId, projectId] });
    if (estimateId) {
      qc.invalidateQueries({ queryKey: ["estimating", "lines", orgId, estimateId] });
      qc.invalidateQueries({ queryKey: ["estimating", "audit", orgId, estimateId] });
    }
  };

  return {
    saveMeasurements: useMutation({
      mutationFn: (data: SaveInput) => save({ data }),
      onSuccess: invalidate,
    }),
    applyQuantities: useMutation({
      mutationFn: (data: ApplyInput) => apply({ data }),
      onSuccess: invalidate,
    }),
  };
}
