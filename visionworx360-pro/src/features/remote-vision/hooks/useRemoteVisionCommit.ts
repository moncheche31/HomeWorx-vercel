import { useCallback, useState } from "react";
import { useProjectDescriptionNote } from "@/features/voice-capture/hooks/useProjectDescriptionNote";
import {
  approveRecord,
  invalidateApprovalRecord,
  useNarrativeScopeStore,
} from "@/features/narrative-scope/hooks/useNarrativeScopeStore";
import { useMeasurementMutations } from "@/features/estimating/hooks/useMeasurements";
import { useEstimateCommit } from "@/features/estimating/hooks/useEstimateCommit";
import { buildRemoteVisionCommit } from "@/domains/remoteVision/commitPayload";
import { hasDimensionValues, type RemoteVisionDimensions } from "@/domains/remoteVision";
import type { Assumption, EstimateScenario } from "@/domains/remoteVision/types";
import type { GroundedScope, GroundedScopeItem } from "@/domains/scopeGrounding/types";

export interface RemoteVisionCommitInput {
  /** Everything the contractor said/typed/measured, merged. */
  intakeText: string;
  /** The scope-of-work narrative shown on screen. */
  narrativeText: string;
  dimensions: RemoteVisionDimensions[];
  /** Structured replay payload: inputs, resolved scope, provenance and range. */
  replay?: Record<string, unknown>;
  /** Approved grounded scope — materialized into real scope items on commit. */
  grounded?: GroundedScope | GroundedScopeItem[] | null;
  removedFeatureKeys?: string[];
  /** The ballpark level the contractor selected (Economy / Standard / ...). */
  scenario?: EstimateScenario | null;
  assumptions?: Assumption[];
}

/**
 * Durable commit for the Remote Vision workflow.
 *
 * Approving used to write only to `localStorage`, so the project still looked
 * unstarted ("no scope of work") everywhere else in the app. Approval now
 * writes the three durable records the rest of the product reads:
 *
 *  - `project_notes` (`project_description`) — the raw intake text
 *  - `project_narrative_scopes` — the narrative plus its approval stamp
 *  - `project_measurements` — the project-wide geometry, when stated
 */
export function useRemoteVisionCommit(projectId: string | null) {
  const description = useProjectDescriptionNote(projectId ?? undefined);
  const narrative = useNarrativeScopeStore(projectId ?? "");
  const { saveMeasurements } = useMeasurementMutations(projectId ?? "");
  const estimateCommit = useEstimateCommit();
  const [estimateId, setEstimateId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  /**
   * Draft save. Reaching a number is already real work, so the intake and the
   * generated scope are written to the project before approval — closing the
   * app at the estimate step can no longer lose them. Approval state is
   * untouched here.
   */
  const saveDraft = useCallback(
    async (input: Omit<RemoteVisionCommitInput, "dimensions">) => {
      if (!projectId) return false;
      try {
        const intake = input.intakeText.trim();
        if (intake) await description.append(intake);
        const text = input.narrativeText.trim();
        const replayJson = input.replay ? JSON.stringify(input.replay) : null;
        /* The replay carries the resolved quantities, so a re-run with the same
           wording but different numbers MUST still be persisted. */
        const wordingChanged = Boolean(text) && text !== narrative.record.editedText;
        const replayChanged =
          Boolean(replayJson) && replayJson !== narrative.record.answers?.__remoteVisionReplay;
        if (wordingChanged || replayChanged) {
          await narrative.update({
            editedText: text || narrative.record.editedText,
            answers: {
              ...narrative.record.answers,
              ...(replayJson ? { __remoteVisionReplay: replayJson } : {}),
            },
            ...invalidateApprovalRecord(narrative.record),
          });
        }

        return true;
      } catch {
        return false;
      }
    },
    [projectId, description, narrative],
  );

  const resetDraft = useCallback(async () => {
    if (!projectId) return false;
    try {
      const answers = { ...narrative.record.answers };
      delete answers.__remoteVisionReplay;
      await narrative.update({
        editedText: null,
        answers,
        ...invalidateApprovalRecord(narrative.record),
      });
      return true;
    } catch {
      return false;
    }
  }, [narrative, projectId]);

  const commit = useCallback(
    async (input: RemoteVisionCommitInput) => {
      if (!projectId) return false;
      setSaving(true);
      setError(false);
      try {
        const intake = input.intakeText.trim();
        if (intake) await description.append(intake);

        const text = input.narrativeText.trim();
        if (text) {
          await narrative.update({
            editedText: text,
            ...approveRecord(narrative.record, { text, scopeFingerprint: null }),
          });
        }

        const geometry = (input.dimensions ?? []).find(hasDimensionValues);
        if (geometry) {
          await saveMeasurements.mutateAsync({
            projectId,
            roomId: null,
            label: geometry.roomLabel.trim() || null,
            lengthFt: geometry.lengthFt,
            widthFt: geometry.widthFt,
            ceilingHeightFt: geometry.ceilingHeightFt,
            openings: [],
            interiorPartitionLf: null,
          });
        }
        /*
         * The shared bridge: approved scope becomes real scope items and a real
         * project estimate. Identical service for all three intake modes, so
         * the Estimate tab and Proposal light up the same way.
         */
        const result = await estimateCommit.mutateAsync(
          buildRemoteVisionCommit({
            projectId,
            grounded: input.grounded ?? null,
            removedFeatureKeys: input.removedFeatureKeys ?? [],
            scenario: input.scenario ?? null,
            assumptions: input.assumptions ?? [],
            narrativeText: text,
            intakeText: intake,
            replay: input.replay ?? null,
          }),
        );
        setEstimateId(result.estimateId);
        return true;
      } catch {
        setError(true);
        return false;
      } finally {
        setSaving(false);
      }
    },
    [projectId, description, narrative, saveMeasurements, estimateCommit],
  );

  return { commit, saveDraft, resetDraft, saving, error, estimateId };
}

