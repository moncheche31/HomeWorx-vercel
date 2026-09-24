/**
 * Phase 3 — pure UI state helpers for estimate revisions.
 *
 * Framework-free so the Estimate tab and tests share one source of truth for
 * "can this be revised?" and "is this version read-only?".
 */

import {
  documentKindOf,
  isReadOnly,
  isSuperseded,
  type LineageDocument,
} from "@/domains/estimating";
import type { EstimateDTO } from "./types";

/** EstimateDTO → the minimal shape the lineage helpers understand. */
export function toLineageDocument(estimate: EstimateDTO): LineageDocument {
  return {
    id: estimate.id,
    projectId: estimate.projectId,
    parentEstimateId: estimate.parentEstimateId,
    documentKind: estimate.documentKind,
    lineageRootId: estimate.lineageRootId,
    revisionNumber: estimate.revisionNumber,
    version: estimate.version,
    optionLabel: estimate.optionLabel,
    supersededById: estimate.supersededById,
    status: estimate.status,
    lockedAt: estimate.lockedAt,
    archivedAt: estimate.archivedAt,
    createdAt: estimate.createdAt,
  };
}

export interface RevisionUiState {
  /** Show the "Create Revised Version" action. */
  canRevise: boolean;
  /** Solid-blue treatment: revising is the recommended next step. */
  reviseIsPrimary: boolean;
  /** Editing controls (lines, sync, settings, status) must be disabled. */
  readOnly: boolean;
  /** Render the "Superseded — read-only" banner. */
  showSupersededBanner: boolean;
  /** Newer revision this document points at, when known. */
  supersededById: string | null;
}

export function getRevisionUiState(estimate: EstimateDTO): RevisionUiState {
  const doc = toLineageDocument(estimate);
  const superseded = isSuperseded(doc);
  const locked = isReadOnly(doc);
  const revisable =
    documentKindOf(doc) === "estimate" && !superseded && !estimate.archivedAt;

  return {
    canRevise: revisable,
    // A locked/approved estimate can only change through a new revision.
    reviseIsPrimary: revisable && locked,
    readOnly: locked,
    showSupersededBanner: superseded,
    supersededById: estimate.supersededById,
  };
}
