/**
 * Unified approved-estimate commit (server-only implementation).
 *
 * All three intake modes — On-site Walkthrough, Estimate from Photos or Video,
 * and Describe Your Project — converge here. This module owns the ONLY path
 * that turns an approved capture into durable scope + a durable estimate:
 *
 *   canonical payload
 *     -> materialize scope_sections / scope_items (idempotent by item key)
 *     -> create OR revise OR sync the project's estimate (never duplicate)
 *     -> persist the ballpark band + internal contractor breakdown
 *
 * Everything is additive: photos, notes, measurements, narrative scope and
 * replay/provenance rows are never touched here.
 */

import {
  buildBallparkSnapshot,
  buildCommitSession,
  INTAKE_SECTION_NAME,
  intakeScopeItemKey,
  intakeSectionKey,
  normalizeUnitKey,
  type CanonicalEstimateCommit,
  type EstimateCommitResult,
} from "@/domains/estimating/estimateCommit";
import { buildPricingPayload } from "@/domains/estimating/pricing/knowledgeBridge";
import { getPricingProvider } from "@/domains/estimating/pricing/registry";
import { isFinalEstimateStatus } from "@/domains/estimating/pricing/integrity";
import { commitFromReplay } from "@/domains/remoteVision/commitPayload";

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

async function assertProjectInOrg(sb: SB, projectId: string, org: string): Promise<void> {
  const { data, error } = await sb.from("projects").select("id")
    .eq("id", projectId).eq("organization_id", org).maybeSingle();
  if (error) throw new Error(msg(error, "Project lookup failed"));
  if (!data) throw new Error("Project not in active organization");
}

/** Best-effort knowledge-base pricing, mirroring the detailed estimate path. */
export async function buildProjectPricing(sb: SB, projectId: string, organizationId: string) {
  try {
    const { data: project } = await sb.from("projects")
      .select("property_id").eq("id", projectId).maybeSingle();
    const propertyId = (project as { property_id?: string } | null)?.property_id ?? null;

    let location: Record<string, string | null> = {};
    if (propertyId) {
      const { data: property } = await sb.from("properties")
        .select("postal_code, region, county").eq("id", propertyId).maybeSingle();
      const p = (property ?? {}) as Record<string, string | null>;
      location = { postalCode: p.postal_code ?? null, state: p.region ?? null, county: p.county ?? null };
    }

    const provider = getPricingProvider();
    const base = await provider.resolve({ organizationId, location });
    if (!base) return null;
    return buildPricingPayload(base, {});
  } catch {
    /* Pricing enrichment must never block the commit. */
    return null;
  }
}

interface MaterializeResult { written: number; archived: number }

async function materializeScope(
  sb: SB,
  org: string,
  userId: string,
  payload: CanonicalEstimateCommit,
): Promise<MaterializeResult> {
  const items = payload.items ?? [];
  if (items.length === 0) return { written: 0, archived: 0 };

  const sectionKey = intakeSectionKey(payload.intakeSource);

  /* One section per intake source: re-approving reuses it instead of stacking. */
  const { data: existingSection } = await sb.from("scope_sections").select("id")
    .eq("organization_id", org).eq("project_id", payload.projectId)
    .eq("section_key", sectionKey).is("archived_at", null).maybeSingle();

  let sectionId = (existingSection as { id?: string } | null)?.id ?? null;
  if (!sectionId) {
    const { data: max } = await sb.from("scope_sections").select("sort_order")
      .eq("organization_id", org).eq("project_id", payload.projectId)
      .order("sort_order", { ascending: false }).limit(1).maybeSingle();
    const nextSort = ((max as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
    const { data: row, error } = await sb.from("scope_sections").insert({
      organization_id: org, project_id: payload.projectId,
      name: INTAKE_SECTION_NAME[payload.intakeSource],
      section_key: sectionKey, sort_order: nextSort, created_by: userId,
    }).select("id").single();
    if (error) throw new Error(msg(error, "Failed to create scope section"));
    sectionId = (row as { id: string }).id;
  }

  const { data: existingRows } = await sb.from("scope_items")
    .select("id, scope_item_key")
    .eq("organization_id", org).eq("project_id", payload.projectId)
    .eq("section_id", sectionId).is("archived_at", null);
  const existing = new Map<string, string>();
  for (const r of ((existingRows as { id: string; scope_item_key: string | null }[] | null) ?? [])) {
    if (r.scope_item_key) existing.set(r.scope_item_key, r.id);
  }

  const seen = new Set<string>();
  let sort = 0;
  for (const item of items) {
    const key = intakeScopeItemKey(payload.intakeSource, item.key);
    seen.add(key);
    const quantity = item.pricingQuantity ?? item.quantity ?? null;
    const fields = {
      organization_id: org,
      project_id: payload.projectId,
      section_id: sectionId,
      room_id: item.roomId ?? null,
      title: item.title,
      scope_item_key: key,
      trade_key: item.tradeKey ?? null,
      category_key: item.categoryKey ?? null,
      subcategory_key: item.subcategoryKey ?? null,
      action_key: item.actionKey ?? null,
      description: item.description ?? null,
      quantity,
      unit_key: normalizeUnitKey(item.unitKey),
      internal_notes: item.internalNotes ?? null,
      is_included: true,
      is_client_visible: true,
      priority: "normal",
      /* Inferred work stays flagged for confirmation; stated work does not. */
      confidence_status: item.confirmed ? "confirmed" : "needs_verification",
      completion_status: "draft",
      sort_order: sort,
      /* Interpreted intake is machine-authored: never confuse it with a row a
         contractor typed, and record what produced it. */
      origin_type: item.confirmed ? "contractor" : "ai_inference",
      origin_ref: payload.intakeSource,
      origin_at: new Date().toISOString(),
      quantity_basis: quantity == null
        ? null
        : item.quantityBasis ?? (item.confirmed ? "contractor_entered" : "assumed"),
      quantity_basis_note: quantity == null ? null : item.quantityBasisNote ?? null,
    };
    sort += 1;

    const existingId = existing.get(key);
    if (existingId) {
      const { error } = await sb.from("scope_items").update(fields)
        .eq("id", existingId).eq("organization_id", org);
      if (error) throw new Error(msg(error, "Failed to update scope item"));
    } else {
      const { error } = await sb.from("scope_items")
        .insert({ ...fields, created_by: userId });
      if (error) throw new Error(msg(error, "Failed to create scope item"));
    }
  }

  /* Items the contractor removed during review are archived, never deleted. */
  let archived = 0;
  const stale = [...existing.entries()].filter(([key]) => !seen.has(key)).map(([, id]) => id);
  if (stale.length > 0) {
    const { error } = await sb.from("scope_items")
      .update({ archived_at: new Date().toISOString(), is_included: false })
      .in("id", stale).eq("organization_id", org);
    if (!error) archived = stale.length;
  }

  return { written: items.length, archived };
}

interface EstimateTarget { id: string; created: boolean; revised: boolean }

async function resolveEstimate(
  sb: SB,
  org: string,
  payload: CanonicalEstimateCommit,
): Promise<EstimateTarget> {
  const { data: rows, error } = await sb.from("estimates")
    .select("id, status, locked_at, superseded_by_id, version")
    .eq("organization_id", org).eq("project_id", payload.projectId)
    .is("archived_at", null).is("superseded_by_id", null)
    .order("version", { ascending: false }).limit(1);
  if (error) throw new Error(msg(error, "Estimate lookup failed"));

  const current = ((rows as Record<string, unknown>[]) ?? [])[0] ?? null;
  const pricing = await buildProjectPricing(sb, payload.projectId, org);

  if (!current) {
    const { data: id, error: createError } = await sb.rpc("create_estimate_from_scope", {
      _project_id: payload.projectId,
      _title: payload.title ?? "",
      _pricing: pricing,
    });
    if (createError) throw new Error(msg(createError, "Failed to create estimate"));
    return { id: id as string, created: true, revised: false };
  }

  const readOnly =
    current.locked_at != null || isFinalEstimateStatus(String(current.status));

  if (readOnly) {
    /* Issued documents are history: approving again produces the next revision. */
    const { data: res, error: revError } = await sb.rpc("create_estimate_revision", {
      _estimate_id: current.id as string,
    });
    if (revError) throw new Error(msg(revError, "Failed to revise estimate"));
    const row = (res ?? {}) as { estimate_id?: string };
    if (!row.estimate_id) throw new Error("Failed to revise estimate");
    return { id: row.estimate_id, created: false, revised: true };
  }

  return { id: current.id as string, created: false, revised: false };
}

/**
 * Approved intake with no items in the request is a materialization gap, not
 * an empty job: the durable replay written at approval is authoritative and is
 * replayed into the canonical payload so scope is never silently skipped.
 */
async function withReplayFallback(
  sb: SB,
  payload: CanonicalEstimateCommit,
): Promise<CanonicalEstimateCommit> {
  if ((payload.items ?? []).length > 0) return payload;
  if (payload.intakeSource !== "photos_video") return payload;
  const { data } = await sb.from("project_narrative_scopes")
    .select("answers").eq("project_id", payload.projectId).maybeSingle();
  const answers = (data as { answers?: Record<string, unknown> } | null)?.answers ?? null;
  const replay = answers?.__remoteVisionReplay ?? null;
  if (!replay) return payload;
  const recovered = commitFromReplay(payload.projectId, replay, {
    level: payload.ballpark?.level ?? null,
  });
  if (!recovered) return payload;
  return {
    ...payload,
    items: recovered.items,
    ballpark: payload.ballpark ?? recovered.ballpark ?? null,
    assumptions: payload.assumptions?.length ? payload.assumptions : recovered.assumptions,
    provenance: payload.provenance ?? recovered.provenance ?? null,
  };
}

export async function commitApprovedEstimateImpl(
  sb: SB,
  userId: string,
  input: CanonicalEstimateCommit,
): Promise<EstimateCommitResult> {
  const org = await resolveOrg(sb);
  await assertProjectInOrg(sb, input.projectId, org);
  const payload = await withReplayFallback(sb, input);

  const scope = await materializeScope(sb, org, userId, payload);
  const target = await resolveEstimate(sb, org, payload);

  /* Newly created estimates already imported scope; existing ones re-sync. */
  let imported = 0;
  if (!target.created) {
    const pricing = await buildProjectPricing(sb, payload.projectId, org);
    const { data: count, error } = await sb.rpc("sync_estimate_from_scope", {
      _estimate_id: target.id,
      _pricing: pricing,
    });
    if (error) throw new Error(msg(error, "Failed to sync scope into estimate"));
    imported = Number(count ?? 0);
  }

  /*
   * A contractor-stated labor-only quote is a pricing CONSTRAINT: persist it on
   * the estimate so the customer-facing price never charges materials.
   */
  if (payload.pricingMode) {
    await sb.from("estimates").update({ pricing_mode: payload.pricingMode })
      .eq("id", target.id).eq("organization_id", org);
  }

  let ballparkSaved = false;
  if (payload.ballpark) {
    /*
     * A selected preliminary scenario is authoritative for a BALLPARK commit.
     * Detailed catalog matching can otherwise choose a valid but different
     * task (roof tear-off, house wrap, deck stain) and destroy the preview.
     */
    await sb.from("estimates").update({
      intake_mode: "ballpark",
      range_assumptions: payload.assumptions ?? [],
    }).eq("id", target.id).eq("organization_id", org);

    const tasks = payload.ballpark.breakdown?.tasks ?? [];
    if (tasks.length > 0) {
      const { error: taskPricingError } = await sb.rpc("apply_ballpark_task_pricing", {
        _estimate_id: target.id,
        _tasks: tasks,
      });
      if (taskPricingError) {
        throw new Error(msg(taskPricingError, "Failed to preserve ballpark task pricing"));
      }
    }

    const snapshot = buildBallparkSnapshot(payload.intakeSource, payload.ballpark, {
      assumptions: payload.assumptions,
      quantities: payload.quantities,
    });
    const session = buildCommitSession({
      estimateId: target.id,
      projectId: payload.projectId,
      intakeSource: payload.intakeSource,
      confidence: payload.ballpark.confidence,
      narrativeText: payload.narrativeText ?? null,
      provenance: payload.provenance ?? null,
      assumptions: payload.assumptions,
      quantities: payload.quantities,
    });
    const { error } = await sb.rpc("save_estimate_ballpark", {
      _estimate_id: target.id,
      _range_snapshot: snapshot,
      _session: session,
    });
    if (error) throw new Error(msg(error, "Failed to save ballpark range"));
    ballparkSaved = true;

  }

  return {
    estimateId: target.id,
    createdEstimate: target.created,
    createdRevision: target.revised,
    scopeItemsWritten: scope.written,
    scopeItemsArchived: scope.archived,
    linesImported: imported,
    ballparkSaved,
  };
}
