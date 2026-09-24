import { z } from "zod";

/**
 * Durable narrative-scope record (one per project).
 *
 * This is the contract shared by the server functions and the client store.
 * The database — not the device — is the source of truth after hydration.
 */
export interface NarrativeApprovalEntry {
  approvedAt: string;
  approvedText: string | null;
  /** Structured-scope fingerprint that was approved. */
  scopeFingerprint: string | null;
  /** Why the approval stopped being current, when it did. */
  invalidatedAt?: string | null;
  invalidatedReason?: "scope_changed" | null;
}

export interface NarrativeScopeRecord {
  version: 1;
  /** Contractor-edited wording. Null means "use the generated text". */
  editedText: string | null;
  answers: Record<string, string>;
  approvedText: string | null;
  approvedAt: string | null;
  /**
   * Structured scope that was approved. Wording-only edits never change this,
   * so cosmetic rewrites keep the approval; real scope changes invalidate it.
   */
  approvedScopeFingerprint: string | null;
  /** Audit trail — only the latest entry can be the current approval. */
  approvalHistory: NarrativeApprovalEntry[];
}

export const EMPTY_NARRATIVE_RECORD: NarrativeScopeRecord = {
  version: 1,
  editedText: null,
  answers: {},
  approvedText: null,
  approvedAt: null,
  approvedScopeFingerprint: null,
  approvalHistory: [],
};

export const HISTORY_LIMIT = 20;

const approvalEntrySchema = z.object({
  approvedAt: z.string(),
  approvedText: z.string().nullable(),
  scopeFingerprint: z.string().nullable(),
  invalidatedAt: z.string().nullable().optional(),
  invalidatedReason: z.literal("scope_changed").nullable().optional(),
});

/** Partial patch — every field is optional so callers only send what changed. */
export const narrativeScopePatchSchema = z.object({
  editedText: z.string().nullable().optional(),
  answers: z.record(z.string(), z.string()).optional(),
  approvedText: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  approvedScopeFingerprint: z.string().nullable().optional(),
  approvalHistory: z.array(approvalEntrySchema).optional(),
});

export type NarrativeScopePatch = z.infer<typeof narrativeScopePatchSchema>;

export const getNarrativeScopeSchema = z.object({ projectId: z.string().uuid() });

export const saveNarrativeScopeSchema = z.object({
  projectId: z.string().uuid(),
  patch: narrativeScopePatchSchema,
});

/** Row -> client record. Tolerates loose jsonb shapes. */
export function mapNarrativeRow(row: Record<string, unknown>): NarrativeScopeRecord {
  const answers = row["answers"];
  const history = row["approval_history"];
  return {
    version: 1,
    editedText: (row["edited_text"] as string | null) ?? null,
    answers:
      answers && typeof answers === "object" && !Array.isArray(answers)
        ? (answers as Record<string, string>)
        : {},
    approvedText: (row["approved_text"] as string | null) ?? null,
    approvedAt: (row["approved_at"] as string | null) ?? null,
    approvedScopeFingerprint: (row["approved_scope_fingerprint"] as string | null) ?? null,
    approvalHistory: Array.isArray(history) ? (history as NarrativeApprovalEntry[]) : [],
  };
}

/** Client record -> row columns, for the fields the patch actually touched. */
export function patchToRow(patch: NarrativeScopePatch): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if ("editedText" in patch) row["edited_text"] = patch.editedText ?? null;
  if ("answers" in patch) row["answers"] = patch.answers ?? {};
  if ("approvedText" in patch) row["approved_text"] = patch.approvedText ?? null;
  if ("approvedAt" in patch) row["approved_at"] = patch.approvedAt ?? null;
  if ("approvedScopeFingerprint" in patch)
    row["approved_scope_fingerprint"] = patch.approvedScopeFingerprint ?? null;
  if ("approvalHistory" in patch)
    row["approval_history"] = (patch.approvalHistory ?? []).slice(-HISTORY_LIMIT);
  return row;
}

/** True when a local record carries contractor work worth migrating forward. */
export function hasNarrativeContent(record: NarrativeScopeRecord | null | undefined): boolean {
  if (!record) return false;
  return Boolean(
    record.editedText ||
      record.approvedText ||
      record.approvedAt ||
      (record.approvalHistory?.length ?? 0) > 0 ||
      Object.keys(record.answers ?? {}).length > 0,
  );
}
