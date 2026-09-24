import { useMemo } from "react";
import { isReadOnly } from "@/domains/estimating";
import {
  resolveBallparkBaseline,
  type BallparkBandLike,
} from "@/domains/ballpark";
import { useEstimateQuery } from "@/features/estimating/hooks/useEstimating";

export interface UseBallparkBaselineInput {
  estimateId: string | null;
  projectId: string | null;
  sessionSnapshot: unknown;
  computedBand: BallparkBandLike;
  factsChanged: boolean;
  schemaKey?: string | null;
  savedSchemaKey?: string | null;
}

/**
 * Joins the two records used by the refinement page without conflating their
 * responsibilities: the estimate owns pricing; the durable session owns
 * interview continuity.
 */
export function useBallparkBaseline({
  estimateId,
  projectId,
  sessionSnapshot,
  computedBand,
  factsChanged,
  schemaKey,
  savedSchemaKey,
}: UseBallparkBaselineInput) {
  const estimateQuery = useEstimateQuery(estimateId ?? undefined);
  const estimate = estimateQuery.data ?? null;
  const isCurrentEditableEstimate = Boolean(
    estimateId &&
      estimate &&
      estimate.id === estimateId &&
      estimate.projectId === projectId &&
      estimate.intakeMode === "ballpark" &&
      !estimate.archivedAt &&
      !isReadOnly(estimate),
  );
  const estimateSnapshot = isCurrentEditableEstimate ? estimate?.rangeSnapshot ?? null : null;
  const schemaChanged = Boolean(schemaKey && savedSchemaKey && schemaKey !== savedSchemaKey);
  const sessionSnapshotForSchema = schemaChanged ? null : sessionSnapshot;
  const baselineSnapshot = estimateSnapshot ?? sessionSnapshotForSchema;
  const preview = useMemo(
    () =>
      resolveBallparkBaseline({
        estimateSnapshot,
        sessionSnapshot,
        computedBand,
        factsChanged,
        schemaKey,
        savedSchemaKey,
      }),
    [estimateSnapshot, sessionSnapshot, computedBand, factsChanged, schemaKey, savedSchemaKey],
  );

  return {
    estimateQuery,
    estimateSnapshot,
    baselineSnapshot,
    preview,
    isCurrentEditableEstimate,
  };
}
