/**
 * Server-side access to the contractor's terminology correction memory.
 *
 * Read-only helpers used by live pipelines (book matching today). RLS keeps the
 * rows scoped to the caller's organization, so no org id has to be threaded
 * through. Corrections only ever change WORDING — never a price or a quantity.
 */
import type { TerminologyCorrection } from "@/domains/terminologyMemory";

type SB = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

export async function loadActiveTerminologyCorrections(sb: SB): Promise<TerminologyCorrection[]> {
  const { data, error } = await sb
    .from("contractor_terminology_corrections")
    .select("id, wrong_term, corrected_term, trigger_phrase, context_scope, trade_key, capture_method, is_active")
    .eq("is_active", true);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    wrongTerm: String(r.wrong_term ?? ""),
    correctedTerm: String(r.corrected_term ?? ""),
    triggerPhrase: (r.trigger_phrase as string | null) ?? null,
    contextScope: (r.context_scope as TerminologyCorrection["contextScope"]) ?? "any",
    tradeKey: (r.trade_key as string | null) ?? null,
    captureMethod: (r.capture_method as TerminologyCorrection["captureMethod"]) ?? "explicit_correction",
    isActive: true,
  }));
}

/** Best-effort usage counters — never fails the pipeline that fired them. */
export async function bumpTerminologyCorrectionUse(sb: SB, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (unique.length === 0) return;
  try {
    const { data: orgId } = await sb.rpc("current_active_organization_id");
    if (!orgId) return;
    await sb.rpc("bump_terminology_correction_usage", { _org_id: orgId, _ids: unique });
  } catch {
    /* counters are advisory */
  }
}
