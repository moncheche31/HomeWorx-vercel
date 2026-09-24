/**
 * "Use Previous Project as Template" (server-only implementation).
 *
 * This is a SELECTIVE copy of estimate/scope data, never a whole-project
 * clone: customer identity, addresses, contacts, signatures, payments,
 * invoices, acceptance, project dates, permits, communications, measurements,
 * media and history are not read here at all. See
 * `@/domains/estimating/copyPlan` for the enforced contract.
 *
 * The copy itself runs inside one SECURITY DEFINER RPC so it is atomic,
 * tenant-scoped and idempotent (a partial unique index makes a repeated
 * confirmation return the estimate that already exists).
 */

import {
  buildCopyProvenanceLabel,
  normalizeCopyOptions,
  sanitizeForTemplate,
  type EstimateCopyOptions,
} from "@/domains/estimating/copyPlan";
import { PRICING_ENGINE_VERSION } from "@/domains/estimating/pricing/engineVersion";

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const msg = (e: unknown, fallback: string) =>
  (e as { message?: string } | null)?.message ?? fallback;

async function resolveOrg(sb: SB): Promise<string> {
  const { data, error } = await sb.rpc("current_active_organization_id");
  if (error) throw new Error(msg(error, "No active organization"));
  const org = data as string | null;
  if (!org) throw new Error("No active organization");
  return org;
}

export interface CopySourceDTO {
  estimateId: string;
  estimateTitle: string;
  estimateStatus: string;
  /** ISO timestamp of the source estimate. */
  estimateDatedAt: string | null;
  projectId: string;
  projectName: string;
  projectType: string | null;
  /** Display reference only — never copied into the new project. */
  clientReference: string | null;
  /** "Jackie's Kitchen — 2026-08-12". */
  label: string;
}

/**
 * Prior estimates the signed-in contractor's organization owns. Tenant scoped
 * by `organization_id` on every table touched, on top of RLS.
 */
export async function listCopySourcesImpl(
  sbLike: unknown,
  input: { search?: string; excludeProjectId?: string; limit: number },
): Promise<CopySourceDTO[]> {
  const sb = sbLike as SB;
  const org = await resolveOrg(sb);

  const { data: projectRows, error: projectError } = await sb.from("projects")
    .select("id, name, project_type, project_type_key, client_id")
    .eq("organization_id", org);
  if (projectError) throw new Error(msg(projectError, "Failed to load projects"));
  const projects = ((projectRows as Record<string, unknown>[]) ?? [])
    .filter((p) => p.id !== input.excludeProjectId);
  if (projects.length === 0) return [];

  const clientIds = [...new Set(projects.map((p) => p.client_id).filter(Boolean))] as string[];
  const clientNames = new Map<string, string>();
  if (clientIds.length > 0) {
    const { data: clients } = await sb.from("clients")
      .select("id, first_name, last_name, company")
      .eq("organization_id", org).in("id", clientIds);
    for (const c of ((clients as Record<string, string | null>[] | null) ?? [])) {
      const name = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
      clientNames.set(c.id as string, c.company || name || "");
    }
  }

  const { data: estimateRows, error: estimateError } = await sb.from("estimates")
    .select("id, project_id, title, status, updated_at, created_at")
    .eq("organization_id", org)
    .is("archived_at", null)
    .is("superseded_by_id", null)
    .in("project_id", projects.map((p) => p.id as string))
    .order("updated_at", { ascending: false })
    .limit(200);
  if (estimateError) throw new Error(msg(estimateError, "Failed to load estimates"));

  const byId = new Map(projects.map((p) => [p.id as string, p]));
  const search = (input.search ?? "").trim().toLowerCase();

  const rows: CopySourceDTO[] = [];
  for (const e of ((estimateRows as Record<string, unknown>[]) ?? [])) {
    const project = byId.get(e.project_id as string);
    if (!project) continue;
    const projectName = (project.name as string) ?? "";
    const clientReference = clientNames.get(project.client_id as string) ?? null;
    const title = (e.title as string) ?? "Estimate";
    if (
      search &&
      ![projectName, clientReference ?? "", title]
        .some((v) => v.toLowerCase().includes(search))
    ) {
      continue;
    }
    const datedAt = (e.updated_at as string | null) ?? (e.created_at as string | null) ?? null;
    rows.push({
      estimateId: e.id as string,
      estimateTitle: title,
      estimateStatus: (e.status as string) ?? "draft",
      estimateDatedAt: datedAt,
      projectId: project.id as string,
      projectName,
      projectType:
        ((project.project_type as string | null) ??
          (project.project_type_key as string | null)) ?? null,
      clientReference,
      label: buildCopyProvenanceLabel(projectName, datedAt),
    });
    if (rows.length >= input.limit) break;
  }
  return rows;
}

export interface CopyEstimateResult {
  estimateId: string;
  /** False when an identical copy already existed (double-click / retry). */
  created: boolean;
  lines: number;
  sections: number;
}

export async function copyEstimateToProjectImpl(
  sbLike: unknown,
  input: {
    sourceEstimateId: string;
    targetProjectId: string;
    options: Partial<EstimateCopyOptions>;
  },
): Promise<CopyEstimateResult> {
  const sb = sbLike as SB;
  const options = normalizeCopyOptions(input.options);
  /*
   * Belt and braces: the payload that reaches the database can only ever carry
   * copy switches, never a never-copied field smuggled in by a caller.
   */
  const payload = sanitizeForTemplate({
    ...options,
    pricingEngineVersion: PRICING_ENGINE_VERSION,
  } as Record<string, unknown>);

  const { data, error } = await sb.rpc("copy_estimate_to_project", {
    _source_estimate_id: input.sourceEstimateId,
    _target_project_id: input.targetProjectId,
    _options: payload,
  });
  if (error) throw new Error(msg(error, "Failed to copy estimate"));
  const result = (data ?? {}) as Record<string, unknown>;
  return {
    estimateId: result.estimate_id as string,
    created: result.created === true,
    lines: Number(result.lines ?? 0),
    sections: Number(result.sections ?? 0),
  };
}

/**
 * "Refresh current pricing" on a copied estimate.
 *
 * Releases only lines still holding an untouched copied price back to system
 * pricing, then re-runs canonical pricing. Contractor-edited lines are stamped
 * `contractor` by the override trigger and are preserved untouched.
 */
export async function refreshCopiedPricingImpl(
  sbLike: unknown,
  input: { estimateId: string },
  buildPricing: (projectId: string, org: string) => Promise<unknown>,
): Promise<{ released: number }> {
  const sb = sbLike as SB;
  const org = await resolveOrg(sb);

  const { data: est, error: loadError } = await sb.from("estimates")
    .select("id, project_id").eq("id", input.estimateId)
    .eq("organization_id", org).maybeSingle();
  if (loadError) throw new Error(msg(loadError, "Estimate lookup failed"));
  if (!est) throw new Error("Estimate not in active organization");

  const { data: released, error } = await sb.rpc("release_copied_estimate_pricing", {
    _estimate_id: input.estimateId,
  });
  if (error) throw new Error(msg(error, "Failed to refresh pricing"));

  const pricing = await buildPricing((est as Record<string, unknown>).project_id as string, org);
  const { error: priceError } = await sb.rpc("apply_knowledge_base_pricing", {
    _estimate_id: input.estimateId,
    _pricing: pricing ?? null,
  });
  if (priceError) throw new Error(msg(priceError, "Failed to refresh pricing"));

  await sb.from("estimates").update({
    pricing_engine_version: PRICING_ENGINE_VERSION,
    pricing_repriced_at: new Date().toISOString(),
  }).eq("organization_id", org).eq("id", input.estimateId);

  return { released: Number(released ?? 0) };
}
