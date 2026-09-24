import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getNarrativeScope, saveNarrativeScope } from "../services/narrativeScope.functions";
import {
  EMPTY_NARRATIVE_RECORD,
  HISTORY_LIMIT,
  hasNarrativeContent,
  type NarrativeApprovalEntry,
  type NarrativeScopePatch,
  type NarrativeScopeRecord,
} from "../services/narrativeScope.shared";

export type { NarrativeApprovalEntry, NarrativeScopeRecord };

const EMPTY = EMPTY_NARRATIVE_RECORD;

const keyFor = (projectId: string) => `vwx.narrativeScope.v1.${projectId}`;

export const narrativeScopeQueryKey = (projectId: string) => ["narrative-scope", projectId];

/**
 * Device mirror of the durable record.
 *
 * It exists for two reasons only: (1) opportunistic forward-migration of
 * wording saved before this feature was durable, and (2) an instant first
 * paint while the database record is in flight, so the generated fallback can
 * never flash over contractor wording. The database is the source of truth.
 */
function readLocal(projectId: string): NarrativeScopeRecord {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(keyFor(projectId));
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as NarrativeScopeRecord;
    return parsed?.version === 1 ? { ...EMPTY, ...parsed } : EMPTY;
  } catch {
    return EMPTY;
  }
}

function writeLocal(projectId: string, record: NarrativeScopeRecord) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(keyFor(projectId), JSON.stringify(record));
  } catch {
    /* storage unavailable — the database still has the record */
  }
}

export function useNarrativeScopeStore(projectId: string) {
  const queryClient = useQueryClient();
  const fetchRecord = useServerFn(getNarrativeScope);
  const saveRecord = useServerFn(saveNarrativeScope);
  const [mirror, setMirror] = useState<NarrativeScopeRecord>(EMPTY);
  const migrated = useRef<string | null>(null);

  useEffect(() => {
    setMirror(readLocal(projectId));
  }, [projectId]);

  const query = useQuery({
    queryKey: narrativeScopeQueryKey(projectId),
    enabled: Boolean(projectId),
    staleTime: 30_000,
    queryFn: async (): Promise<NarrativeScopeRecord> => {
      const remote = (await fetchRecord({
        data: { projectId },
      })) as NarrativeScopeRecord | null;

      // Forward-migrate device-only wording exactly once, and only when the
      // database has nothing yet — never overwrite durable contractor work.
      if (!remote && migrated.current !== projectId) {
        migrated.current = projectId;
        const local = readLocal(projectId);
        if (hasNarrativeContent(local)) {
          const saved = (await saveRecord({
            data: { projectId, patch: local as NarrativeScopePatch },
          })) as NarrativeScopeRecord;
          writeLocal(projectId, saved);
          setMirror(saved);
          return saved;
        }
      }

      const record = remote ?? EMPTY;
      writeLocal(projectId, record);
      setMirror(record);
      return record;
    },
  });

  const mutation = useMutation({
    mutationFn: async (patch: NarrativeScopePatch) =>
      (await saveRecord({ data: { projectId, patch } })) as NarrativeScopeRecord,
    onMutate: async (patch) => {
      const key = narrativeScopeQueryKey(projectId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<NarrativeScopeRecord>(key) ?? mirror ?? EMPTY;
      const optimistic = { ...previous, ...patch, version: 1 as const } as NarrativeScopeRecord;
      queryClient.setQueryData(key, optimistic);
      writeLocal(projectId, optimistic);
      setMirror(optimistic);
      return { previous };
    },
    onError: (_error, _patch, ctx) => {
      if (ctx?.previous) {
        queryClient.setQueryData(narrativeScopeQueryKey(projectId), ctx.previous);
        writeLocal(projectId, ctx.previous);
        setMirror(ctx.previous);
      }
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(narrativeScopeQueryKey(projectId), saved);
      writeLocal(projectId, saved);
      setMirror(saved);
    },
  });

  /** Durable save. Awaitable so callers can persist wording before anything else. */
  const update = useCallback(
    async (patch: Partial<NarrativeScopeRecord>) => {
      const { version: _version, ...rest } = patch as NarrativeScopeRecord;
      return mutation.mutateAsync(rest as NarrativeScopePatch);
    },
    [mutation],
  );

  const record = (query.data ?? mirror ?? EMPTY) as NarrativeScopeRecord;

  return {
    record,
    /** True once the durable record (or its device mirror) is available. */
    hydrated: query.isSuccess || hasNarrativeContent(mirror),
    saving: mutation.isPending,
    update,
  };
}

/** Device mirror read — used by surfaces that render outside the app shell. */
export function readNarrativeScope(projectId: string): NarrativeScopeRecord {
  return readLocal(projectId);
}

/** Pure: stamp a new approval and append it to the audit trail. */
export function approveRecord(
  record: NarrativeScopeRecord,
  input: { text: string; scopeFingerprint: string | null; at?: string },
): Partial<NarrativeScopeRecord> {
  const approvedAt = input.at ?? new Date().toISOString();
  const entry: NarrativeApprovalEntry = {
    approvedAt,
    approvedText: input.text,
    scopeFingerprint: input.scopeFingerprint,
    invalidatedAt: null,
    invalidatedReason: null,
  };
  return {
    approvedText: input.text,
    approvedAt,
    approvedScopeFingerprint: input.scopeFingerprint,
    approvalHistory: [...(record.approvalHistory ?? []), entry].slice(-HISTORY_LIMIT),
  };
}

/**
 * Pure: the structured scope changed, so the prior approval no longer applies.
 * History is preserved (stamped as invalidated) for audit; only the current
 * approval fields are cleared.
 */
export function invalidateApprovalRecord(
  record: NarrativeScopeRecord,
  at: string = new Date().toISOString(),
): Partial<NarrativeScopeRecord> {
  if (!record.approvedAt) return {};
  const history = [...(record.approvalHistory ?? [])];
  const last = history[history.length - 1];
  if (last && !last.invalidatedAt) {
    history[history.length - 1] = { ...last, invalidatedAt: at, invalidatedReason: "scope_changed" };
  }
  return {
    approvedAt: null,
    approvedText: null,
    approvedScopeFingerprint: null,
    approvalHistory: history,
  };
}
