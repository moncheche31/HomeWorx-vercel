import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useActiveOrgId } from "@/features/crm/hooks/useCrm";
import {
  deleteTerminologyCorrection,
  listTerminologyCorrections,
  recordTerminologyCorrectionUse,
  saveTerminologyCorrection,
  setTerminologyCorrectionActive,
  type TerminologyCorrectionDTO,
} from "../services/terminology.functions";

const KEY = ["terminology", "corrections"] as const;

export interface SaveCorrectionInput {
  wrongTerm: string;
  correctedTerm: string;
  triggerPhrase?: string | null;
  contextScope?: "any" | "interior" | "exterior";
  tradeKey?: string | null;
  captureMethod?: "explicit_correction" | "scope_text_edit" | "book_match_correction";
  sourceProjectId?: string | null;
  sourceEvidence?: string | null;
}

export function useTerminologyCorrectionsQuery() {
  const orgId = useActiveOrgId();
  const fn = useServerFn(listTerminologyCorrections);
  return useQuery<TerminologyCorrectionDTO[]>({
    queryKey: [...KEY, orgId],
    enabled: !!orgId,
    /* The memory is consulted on every interpretation, so keep it warm. */
    staleTime: 5 * 60_000,
    queryFn: () => fn() as unknown as Promise<TerminologyCorrectionDTO[]>,
  });
}

export function useTerminologyCorrectionMutations() {
  const qc = useQueryClient();
  const save = useServerFn(saveTerminologyCorrection);
  const toggle = useServerFn(setTerminologyCorrectionActive);
  const remove = useServerFn(deleteTerminologyCorrection);
  const recordUse = useServerFn(recordTerminologyCorrectionUse);
  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  return {
    save: useMutation({
      mutationFn: (data: SaveCorrectionInput) => save({ data }),
      onSuccess: invalidate,
    }),
    setActive: useMutation({
      mutationFn: (data: { id: string; isActive: boolean }) => toggle({ data }),
      onSuccess: invalidate,
    }),
    remove: useMutation({
      mutationFn: (data: { id: string }) => remove({ data }),
      onSuccess: invalidate,
    }),
    recordUse: useMutation({
      mutationFn: (data: { ids: string[] }) => recordUse({ data }),
      onSuccess: invalidate,
    }),
  };
}
