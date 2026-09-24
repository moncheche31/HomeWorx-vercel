import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

import { originStamp } from "@/domains/provenance";
import {
  applyCompositeSchema,
  applyKnowledgePricingSchema,
  archiveEstimateSchema, archiveLineSchema, confirmLineCatalogSchema, createFromScopeSchema,
  convertEstimateSchema,
  createLineSchema, createRevisionSchema, createVersionSchema, getEstimateSchema,
  listAuditSchema, listEstimatesSchema, listRecentEstimatesSchema, manualLinePricingSchema, reviewLineQuantitySchema,
  reviseAndSyncSchema, scopeSyncStateSchema,
  refineBallparkAssumptionSchema,
  refreshBallparkClarificationSchema,
  repairLaborHoursSchema,
  setBallparkBandPositionSchema,
  setStatusSchema, syncFromScopeSchema, updateEstimateSchema, updateLineSchema,
  auditCostBasisSchema,
} from "./schemas";
import { calculateEngineEstimate } from "@/domains/estimating/engine/calculate";
import {
  buildCanonicalCostGraph,
  reconcileBandToCanonical,
  type CanonicalCostLine,
} from "@/domains/estimating/canonicalCostGraph";
import {
  resolveCompositeExclusivity,
  rollUpMap,
} from "@/domains/estimating/compositeExclusivity";
import { classifyProject, evaluateMarketSanity } from "@/domains/estimating/marketSanity";

import { costBasisFromEngineTotals, pricingSnapshotFromStrategy } from "@/domains/estimating/ballparkCostBasis";
import { findBallparkSnapshot, preserveBallparkHistory, readBallparkSummary } from "./ballparkSummary";
import { applyBallparkBandPosition } from "@/domains/estimating/ballparkPosition";
import { assumptionKey, recalculateBallparkFromScope } from "@/domains/ballpark/scopeRecalc";
import {
  NATIONAL_BASELINE_LOCATION,
  bookLaborRate,
} from "@/domains/estimating/pricing/bookLaborRates";
import {
  deriveWorkDomains,
  measurementFieldsForDomains,
  type WorkDomain,
} from "@/domains/ballpark/scopeProfile";
import { normalizeLaborSettings } from "@/domains/estimating/laborHours";
import type {
  LaborHoursRepairEntry,
  LaborHoursRepairReport,
} from "@/domains/estimating/laborHoursIntegrity";
import { BALLPARK_ENGINE_VERSION, isBallparkSnapshotStale } from "@/domains/ballpark/engineVersion";
import { evaluateRecalcGate } from "@/domains/ballpark/recalcGate";

import {
  EMPTY_GEOMETRY_FACTS,
  geometryFactsFrom,
  geometryFactsFromSnapshot,
  hasUsableGeometry,
  type BallparkGeometryFacts,
} from "@/domains/ballpark/quantityResolution";

import { findUnreconciledScopeItems } from "@/domains/scopeInterpretation/reconcile";
import {
  autoApplicableDerivations,
  derivationSummary,
  planQuantityPropagation,
} from "@/domains/geometry";

import { mapAuditEvent, mapEstimate, mapLine } from "./mappers";
import { autoExpandEnabledLines } from "./assemblyExpansion.core";
import { PRICING_ENGINE_VERSION, shouldRepriceEstimate } from "@/domains/estimating/pricing/engineVersion";
import type { EstimateAuditEventDTO, EstimateDTO, EstimateLineDTO, RecentEstimateDTO } from "../types";
import {
  assessDetailedIntegrity, isFinalEstimateStatus,
  assessScopeSync, computeScopeFingerprint, findOrphanedLineIds, isReadOnly,
  type ScopeFingerprintItem,
  buildPricingPayload, getPricingProvider,
  type KnowledgePricingPayload,
} from "@/domains/estimating";
import { pricingStrategyOf } from "@/domains/estimating/pricingStrategy";
import { auditEstimateLines } from "@/domains/estimating/lineAudit";
import { findSupersededLines, quantityToInherit } from "@/domains/estimating/supersession";

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

async function loadEstimate(sb: SB, estimateId: string, org: string) {
  const { data, error } = await sb.from("estimates").select("*")
    .eq("id", estimateId).eq("organization_id", org).maybeSingle();
  if (error) throw new Error(msg(error, "Estimate lookup failed"));
  if (!data) throw new Error("Estimate not in active organization");
  return data as Record<string, unknown>;
}

async function loadLine(sb: SB, lineId: string, org: string) {
  const { data, error } = await sb.from("estimate_line_items").select("*")
    .eq("id", lineId).eq("organization_id", org).maybeSingle();
  if (error) throw new Error(msg(error, "Line lookup failed"));
  if (!data) throw new Error("Line not in active organization");
  return data as Record<string, unknown>;
}

async function audit(
  sb: SB,
  row: { organization_id: unknown; project_id: unknown; id?: unknown },
  estimateId: string,
  eventType: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  metadata: Record<string, unknown> = {},
) {
  await sb.from("estimate_audit_events").insert({
    organization_id: row.organization_id,
    project_id: row.project_id,
    estimate_id: estimateId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    summary,
    metadata,
  });
}


/**
 * Resolve regional pricing for a project and shape it for the SQL Knowledge
 * Base bridge. Version 1 resolves through the seeded provider, whose values are
 * illustrative sample data (`isSampleData: true`) — never licensed cost data.
 */
async function buildProjectPricing(
  sb: SB,
  projectId: string,
  organizationId: string,
): Promise<KnowledgePricingPayload | null> {
  try {
    const { data: project } = await sb.from("projects")
      .select("property_id").eq("id", projectId).maybeSingle();
    const propertyId = (project as { property_id?: string } | null)?.property_id ?? null;

    let location: Record<string, string | null> = {};
    if (propertyId) {
      const { data: property } = await sb.from("properties")
        .select("postal_code, region, county").eq("id", propertyId).maybeSingle();
      const p = (property ?? {}) as Record<string, string | null>;
      location = {
        postalCode: p.postal_code ?? null,
        state: p.region ?? null,
        county: p.county ?? null,
      };
    }

    const provider = getPricingProvider();
    const base = await provider.resolve({ organizationId, location });
    if (!base) return null;

    const { data: tradeRows } = await sb.from("catalog_assemblies")
      .select("trade_key").eq("is_active", true).limit(5000);
    const trades = [
      ...new Set(
        ((tradeRows as { trade_key: string | null }[] | null) ?? [])
          .map((r) => r.trade_key)
          .filter((t): t is string => !!t),
      ),
    ];

    const rates: Record<string, number | null> = {};
    for (const trade of trades) {
      const resolved = await provider.resolve({ organizationId, location, tradeKey: trade });
      rates[trade] = resolved?.laborRate ?? null;
    }
    return buildPricingPayload(base, rates);
  } catch {
    // Pricing is a best-effort enrichment: never block estimate generation.
    return null;
  }
}

/* ================= ESTIMATES ================= */

export const listEstimates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listEstimatesSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    let q = sb.from("estimates").select("*")
      .eq("organization_id", org).eq("project_id", data.projectId);
    if (!data.includeArchived) q = q.is("archived_at", null);
    const { data: rows, error } = await q.order("version", { ascending: false });
    if (error) throw new Error(msg(error, "Failed to load estimates"));
    /*
     * Reads are pure. Reconciliation/repricing runs only through the explicit
     * `refreshEstimate` action or a commit — never as a side effect of a read,
     * which is how one surface used to silently rewrite another's numbers.
     */
    const list = (rows as Record<string, unknown>[]) ?? [];
    return list.map(mapEstimate);
  });


/**
 * Recent estimates across the whole workspace.
 *
 * Deliberately unfiltered by intake mode, pricing completeness or unmatched
 * lines: a saved ballpark is a real estimate. Only archived documents and
 * superseded revisions drop out.
 */
export const listRecentEstimates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listRecentEstimatesSchema.parse(d))
  .handler(async ({ data, context }): Promise<RecentEstimateDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { data: rows, error } = await sb.from("estimates").select("*")
      .eq("organization_id", org)
      .is("archived_at", null)
      .is("superseded_by_id", null)
      .order("updated_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(msg(error, "Failed to load estimates"));

    const estimates = ((rows as Record<string, unknown>[]) ?? []).map(mapEstimate);
    const projectIds = [...new Set(estimates.map((e) => e.projectId))];
    const names = new Map<string, string>();
    if (projectIds.length > 0) {
      const { data: projects } = await sb.from("projects").select("id, name")
        .eq("organization_id", org).in("id", projectIds);
      for (const p of ((projects as { id: string; name: string }[] | null) ?? [])) {
        names.set(p.id, p.name);
      }
    }
    return estimates.map((estimate) => ({
      estimate,
      projectName: names.get(estimate.projectId) ?? null,
    }));
  });



/** Pure read. Reconciliation happens in `refreshEstimate`, never here. */
export const getEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getEstimateSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    return mapEstimate(await loadEstimate(sb, data.estimateId, org));
  });


/**
 * The ONE place reconciliation/repricing runs.
 *
 * Explicit action only: the contractor asks for a refresh, or a commit /
 * scope sync finishes. Reads never trigger it, so no tab can silently rewrite
 * another tab's saved numbers.
 */
export const refreshEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getEstimateSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const est = await loadEstimate(sb, data.estimateId, org);
    /* Expansion-enabled trades get their assembly listed on an explicit
       refresh too, so an estimate created before this feature catches up. */
    await autoExpandEnabledLines(sb, data.estimateId, org, context.userId);
    return mapEstimate(await ensureEstimateCurrent(sb, est, org));
  });


/**
 * Detailed-pricing self-healing on open.
 *
 * Persisted line pricing used to be write-once: a line the catalog could not
 * resolve was stamped `unmatched` at $0 and every later sync skipped it, so
 * fixing the catalog never reached estimates that already existed. Reopening an
 * editable draft now re-runs system pricing when the estimate carries an older
 * pricing-engine stamp or still has unresolved system lines.
 *
 * Contractor intent is never overwritten: the RPC leaves manual/contractor
 * pricing and contractor catalog mappings alone, and read-only documents
 * (sent, accepted, locked, superseded, archived) are skipped entirely.
 */
function isEditableEstimate(est: Record<string, unknown>): boolean {
  return (
    est.archived_at == null &&
    !isReadOnly({
      id: est.id as string,
      projectId: est.project_id as string,
      status: est.status as never,
      lockedAt: (est.locked_at as string | null) ?? null,
      supersededById: (est.superseded_by_id as string | null) ?? null,
    })
  );
}

/**
 * Scope removals reach the estimate.
 *
 * Importing scope is additive, so a line whose scope item was later EXCLUDED
 * or archived used to stay priced forever. That is how a garage conversion
 * kept kitchen cabinets and countertops from a template the contractor had
 * already switched off. Reopening an editable draft now archives those
 * leftovers; contractor-priced, contractor-confirmed and hand-added lines are
 * never touched.
 */
async function reconcileScopeRemovals(
  sb: SB,
  est: Record<string, unknown>,
): Promise<boolean> {
  if (!isEditableEstimate(est)) return false;
  try {
    const { data, error } = await sb.rpc("reconcile_estimate_from_scope", {
      _estimate_id: est.id as string,
    });
    if (error) return false;
    return Number((data as { removed?: number } | null)?.removed ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Placeholder quantities become measured quantities.
 *
 * A scope row with no measurement imports as `quantity = 1`, which prices a
 * 288 sq ft floor as one square foot. When the project already carries a
 * geometry record, the derived quantity (and its formula) is written for those
 * placeholder lines automatically — the contractor should not have to press a
 * button to stop the estimate being wrong.
 *
 * Deliberately narrow: only single-surface derivations for lines still flagged
 * as placeholders, never a reviewed, overridden or hand-entered quantity, and
 * never an automatic extra line.
 */
async function fillPlaceholderQuantitiesFromGeometry(
  sb: SB,
  est: Record<string, unknown>,
  org: string,
): Promise<boolean> {
  if (!isEditableEstimate(est)) return false;
  try {
    const { data: rows } = await sb
      .from("project_measurements")
      .select("label,length_ft,width_ft,ceiling_height_ft,openings,interior_partition_lf,floor_waste_pct")
      .eq("organization_id", org)
      .eq("project_id", est.project_id as string)
      .order("created_at", { ascending: true })
      .limit(1);
    const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
    if (!row) return false;

    const num = (v: unknown): number | null => (v == null ? null : Number(v));
    const geometry = {
      roomId: null,
      label: (row.label as string | null) ?? null,
      lengthFt: num(row.length_ft),
      widthFt: num(row.width_ft),
      ceilingHeightFt: num(row.ceiling_height_ft),
      openings: Array.isArray(row.openings) ? (row.openings as never) : [],
      interiorPartitionLf: num(row.interior_partition_lf),
      floorWastePct: num(row.floor_waste_pct),
    };

    const { data: lineRows } = await sb.from("estimate_line_items")
      .select("*")
      .eq("organization_id", org)
      .eq("estimate_id", est.id as string)
      .is("archived_at", null);

    const lines = ((lineRows as Record<string, unknown>[] | null) ?? []).map((l) => ({
      id: l.id as string,
      description: (l.description as string) ?? "",
      unitKey: (l.unit_key as string | null) ?? null,
      categoryKey: (l.category_key as string | null) ?? null,
      tradeKey: (l.trade_key as string | null) ?? null,
      quantity: l.quantity == null ? null : Number(l.quantity),
      isQuantityPlaceholder: Boolean(l.is_quantity_placeholder),
      isPriceOverridden: Boolean(l.is_price_overridden),
      quantityReviewedAt: (l.quantity_reviewed_at as string | null) ?? null,
      archivedAt: (l.archived_at as string | null) ?? null,
    }));
    if (lines.length === 0) return false;

    const plan = planQuantityPropagation({ geometry, lines: lines as never });
    const auto = autoApplicableDerivations(plan, lines as never)
      .filter((d) => d.surfaces.length === 1);
    if (auto.length === 0) return false;

    const { error } = await sb.rpc("apply_geometry_quantities", {
      _estimate_id: est.id as string,
      _assignments: auto.map((d) => ({
        line_id: d.lineId,
        quantity: d.quantity,
        unit_key: d.unitKey,
        description: null,
        provenance: {
          ...(d.provenance as unknown as Record<string, unknown>),
          derivation: derivationSummary(d),
          appliedAutomatically: true,
        },
        expansions: [],
      })),
    });
    return !error;
  } catch {
    /* Reading an estimate must never fail because a derivation could not run. */
    return false;
  }
}

async function repriceStaleDetailedPricing(
  sb: SB,
  est: Record<string, unknown>,
  org: string,
  force = false,
): Promise<Record<string, unknown> | null> {
  const editable = isEditableEstimate(est);

  if (!editable) return null;

  try {
    const { count } = await sb.from("estimate_line_items")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", org).eq("estimate_id", est.id as string)
      .is("archived_at", null)
      .eq("pricing_source", "unmatched");

    if (
      !force &&
      !shouldRepriceEstimate({
        pricingEngineVersion: est.pricing_engine_version as number | null,
        unmatchedLineCount: Number(count ?? 0),
        isEditable: true,
        archived: false,
      })
    ) {
      return null;
    }

    const pricing = await buildProjectPricing(sb, est.project_id as string, org);
    const { error } = await sb.rpc("apply_knowledge_base_pricing", {
      _estimate_id: est.id as string,
      _pricing: pricing,
    });
    if (error) return null;
    /*
     * Live material pricing, when (and only when) the organization has a
     * provider configured. With no provider this call writes nothing at all,
     * so catalog-priced estimates are byte-for-byte unaffected.
     */
    const { applyLiveMaterialPricing } = await import("./liveMaterialPricing.server");
    await applyLiveMaterialPricing(sb, org, est.id as string);

    /*
     * Authoritative calculator pass (engine v2): derive measured quantities
     * from saved geometry, re-derive labor from explicit catalog productivity
     * conventions, keep fees labor-free, and rebuild the preliminary band from
     * the same invariant cost. Contractor pricing and overrides are untouched.
     */
    await sb.rpc("repair_estimate_pricing", { _estimate_id: est.id as string });


    await sb.from("estimates").update({
      pricing_engine_version: PRICING_ENGINE_VERSION,
      pricing_repriced_at: new Date().toISOString(),
    }).eq("organization_id", org).eq("id", est.id as string);

    return await loadEstimate(sb, est.id as string, org);
  } catch {
    /* Reading an estimate must never fail because repricing could not run. */
    return null;
  }
}

/**
 * Stale-engine self-healing on open.
 *
 * A ballpark snapshot written by an older engine can claim scope is unpriceable
 * that the current engine prices with a disclosed allowance. Reopening the
 * estimate must be enough to correct that — the contractor should never have to
 * fake a scope edit to get an honest band.
 *
 * Strictly bounded: only editable, non-archived, ballpark-mode documents are
 * touched; a snapshot already at the current version is returned untouched, so
 * this can never loop or churn.
 */
async function refreshStaleBallparkEngine(
  sb: SB,
  est: Record<string, unknown>,
  org: string,
): Promise<Record<string, unknown> | null> {
  if (est.intake_mode !== "ballpark") return null;
  if (est.archived_at != null) return null;
  if (
    isReadOnly({
      id: est.id as string,
      projectId: est.project_id as string,
      status: est.status as never,
      lockedAt: (est.locked_at as string | null) ?? null,
      supersededById: (est.superseded_by_id as string | null) ?? null,
    })
  ) {
    return null;
  }

  const snapshot = findBallparkSnapshot(est.range_snapshot ?? null);
  if (!snapshot || !isBallparkSnapshotStale(snapshot)) return null;

  try {
    const items = await loadScopeFingerprintItems(sb, est.project_id as string, org);
    const changed = await refreshBallparkFromScope(sb, est, items, { engineUpgrade: true });
    if (!changed) return null;
    return await loadEstimate(sb, est.id as string, org);
  } catch {
    /* Reading an estimate must never fail because a refresh could not run. */
    return null;
  }
}

/**
 * Single self-healing entry point for every read path that renders an estimate.
 *
 * The heal used to live only in `getEstimate`, but the Estimate tab loads its
 * document through `listEstimates` and its rows through `listEstimateLines`.
 * A cold app launch therefore rendered a stale ballpark band and permanently
 * `unmatched` $0 lines, because nothing on that path ever called `getEstimate`.
 *
 * Bounded and idempotent: an estimate already at the current ballpark and
 * pricing engine versions with no unresolved system lines does no writes.
 */
/**
 * One finish-floor scope, priced once.
 *
 * A generic system line ("Install finished flooring") and the contractor's
 * specific material line ("Hardwood flooring") describe the same floor. The
 * specific line owns the work; the generic one is archived and, when the
 * specific line was left at a placeholder quantity, inherits the resolved area
 * so the floor is never priced as 1 sq ft.
 */
async function collapseDuplicateWorkLines(
  sb: SB,
  est: Record<string, unknown>,
  org: string,
): Promise<boolean> {
  if (!isEditableEstimate(est)) return false;
  try {
    const { data: rows } = await sb.from("estimate_line_items")
      .select("id,description,quantity,unit_key,pricing_source,is_price_overridden,archived_at")
      .eq("organization_id", org)
      .eq("estimate_id", est.id as string)
      .is("archived_at", null);

    const lines = ((rows as Record<string, unknown>[] | null) ?? []).map((l) => ({
      id: l.id as string,
      description: (l.description as string | null) ?? "",
      quantity: l.quantity == null ? null : Number(l.quantity),
      unitKey: (l.unit_key as string | null) ?? null,
      pricingSource: (l.pricing_source as string | null) ?? null,
      isPriceOverridden: Boolean(l.is_price_overridden),
      archivedAt: (l.archived_at as string | null) ?? null,
    }));
    if (lines.length === 0) return false;

    const { supersededIds, supersededBy } = findSupersededLines(lines);
    if (supersededIds.length === 0) return false;

    const byId = new Map(lines.map((l) => [l.id, l]));
    for (const genericId of supersededIds) {
      const generic = byId.get(genericId)!;
      const owner = byId.get(supersededBy[genericId]!);
      if (owner) {
        const inherited = quantityToInherit(owner, generic);
        if (inherited != null) {
          await sb.from("estimate_line_items")
            .update({ quantity: inherited, is_quantity_placeholder: false })
            .eq("organization_id", org).eq("id", owner.id);
        }
      }
      await sb.from("estimate_line_items")
        .update({ archived_at: new Date().toISOString() })
        .eq("organization_id", org).eq("id", genericId);
    }
    return true;
  } catch {
    /* Reading an estimate must never fail because a cleanup could not run. */
    return false;
  }
}

async function ensureEstimateCurrent(
  sb: SB,
  est: Record<string, unknown>,
  org: string,
): Promise<Record<string, unknown>> {
  const refreshed = await refreshStaleBallparkEngine(sb, est, org);
  const current = refreshed ?? est;
  /* Scope first: work that left the scope must not be re-priced at all. */
  const removed = await reconcileScopeRemovals(sb, current);
  const collapsed = await collapseDuplicateWorkLines(sb, current, org);
  const measured = await fillPlaceholderQuantitiesFromGeometry(sb, current, org);
  const changed = removed || measured || collapsed;
  const repriced = await repriceStaleDetailedPricing(sb, current, org, changed);
  return repriced ?? (changed ? await loadEstimate(sb, current.id as string, org) : current);
}



/** Pure read: rows exactly as saved. Repricing lives in `refreshEstimate`. */
export const listEstimateLines = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => getEstimateSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateLineDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    /* Authorization/existence check only — no mutation. */
    await loadEstimate(sb, data.estimateId, org);
    const { data: rows, error } = await sb.from("estimate_line_items").select("*")
      .eq("organization_id", org).eq("estimate_id", data.estimateId)
      .is("archived_at", null)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(msg(error, "Failed to load estimate lines"));
    return ((rows as Record<string, unknown>[]) ?? []).map(mapLine);
  });


export const createEstimateFromScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createFromScopeSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ estimateId: string }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const pricing = await buildProjectPricing(sb, data.projectId, org);
    const { data: id, error } = await sb.rpc("create_estimate_from_scope", {
      _project_id: data.projectId,
      _title: data.title ?? "",
      _pricing: pricing,
    });
    if (error) throw new Error(msg(error, "Failed to create estimate"));
    return { estimateId: id as string };
  });

export const createEstimateVersion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createVersionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ estimateId: string }> => {
    const sb = context.supabase as unknown as SB;
    const { data: id, error } = await sb.rpc("create_estimate_version", {
      _estimate_id: data.estimateId,
    });
    if (error) throw new Error(msg(error, "Failed to create version"));
    return { estimateId: id as string };
  });

/**
 * Phase 3 — create a revised version of an estimate.
 *
 * All access is derived server-side inside `create_estimate_revision`
 * (organization comes from the caller's active org, never from the client).
 * The RPC is transactional and idempotent: repeated rapid calls for the same
 * source return the already-created revision with `created: false`.
 */
export const createEstimateRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createRevisionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ estimateId: string; created: boolean }> => {
    const sb = context.supabase as unknown as SB;
    const { data: res, error } = await sb.rpc("create_estimate_revision", {
      _estimate_id: data.estimateId,
    });
    if (error) throw new Error(msg(error, "Failed to create revision"));
    const row = (res ?? {}) as { estimate_id?: string; created?: boolean };
    if (!row.estimate_id) throw new Error("Failed to create revision");
    return { estimateId: row.estimate_id, created: row.created !== false };
  });

export const syncEstimateFromScope = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => syncFromScopeSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ imported: number; ballparkRefreshed: boolean }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const est = await loadEstimate(sb, data.estimateId, org);
    const pricing = await buildProjectPricing(sb, est.project_id as string, org);
    const { data: count, error } = await sb.rpc("sync_estimate_from_scope", {
      _estimate_id: data.estimateId,
      _pricing: pricing,
    });
    if (error) throw new Error(msg(error, "Failed to sync scope"));
    /* Sync is two-way for SYSTEM lines: excluded work leaves the estimate too. */
    await reconcileScopeRemovals(sb, est);
    /*
     * The import is additive: the RPC adds newly included scope items and never
     * deletes or overwrites contractor pricing. Recording the baseline is what
     * clears the stale-scope warning.
     */
    const items = await loadScopeFingerprintItems(sb, est.project_id as string, org);
    await recordScopeBaseline(sb, data.estimateId, computeScopeFingerprint(items));
    const ballparkRefreshed = await refreshBallparkFromScope(sb, est, items);
    /* Newly imported lines in an expansion-enabled trade get their complete
       assembly listed straight away (cache-first, never blocking). */
    await autoExpandEnabledLines(sb, data.estimateId, org, context.userId);
    return { imported: Number(count ?? 0), ballparkRefreshed };
  });

/**
 * The refinement half of the ballpark loop: infer -> disclose -> correct ->
 * recalculate. The contractor replaces one inferred quantity (or clears the
 * correction) and the band is re-priced from the same scope. No new
 * questionnaire, no detailed-estimate mode, and the correction is durable.
 */
export const refineBallparkAssumption = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refineBallparkAssumptionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ recalculated: boolean }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const est = await loadEstimate(sb, data.estimateId, org);
    if (
      isReadOnly({
        id: est.id as string,
        projectId: est.project_id as string,
        status: est.status as never,
        lockedAt: (est.locked_at as string | null) ?? null,
        supersededById: (est.superseded_by_id as string | null) ?? null,
      })
    ) {
      throw new Error("This estimate can no longer be edited");
    }

    const snapshot = findBallparkSnapshot(est.range_snapshot ?? null) as Record<string, unknown> | null;
    if (!snapshot) throw new Error("This estimate has no ballpark to refine");

    const overrides = readAssumptionOverrides(est.range_snapshot ?? null);
    const key = assumptionKey(data.itemId, data.itemKey);
    if (data.quantity == null) delete overrides[key];
    else overrides[key] = data.quantity;

    /*
     * The ballpark object may sit at the top level or nested under `ballpark`.
     * Write the correction back in whichever shape this estimate already uses.
     */
    const root = (est.range_snapshot ?? {}) as Record<string, unknown>;
    const nextBallpark = { ...snapshot, assumptionOverrides: overrides };
    const nextSnapshot =
      root.ballpark && root.ballpark === snapshot
        ? { ...root, ballpark: nextBallpark }
        : { ...root, ...nextBallpark };

    const { error } = await sb.from("estimates")
      .update({ range_snapshot: nextSnapshot as never })
      .eq("id", data.estimateId);
    if (error) throw new Error(msg(error, "Failed to save the correction"));

    const items = await loadScopeFingerprintItems(sb, est.project_id as string, org);
    const fresh = await loadEstimate(sb, data.estimateId, org);
    const recalculated = await refreshBallparkFromScope(sb, fresh, items, {
      contractorInitiated: true,
      /* Explicit corrected quantity: authoritative arithmetic, not drift. */
      assumptionCorrection: true,
    });
    return { recalculated };
  });

/**
 * "Improve accuracy" completion — ADR-062 in one place.
 *
 * Answering clarification questions refines FACTS. It must never hand pricing
 * authority back to the intake pricer: when this estimate already has canonical
 * cost lines, the band is re-derived from those lines with the estimate's own
 * pricing method, target margin, labor settings and cost bases untouched.
 *
 * `hasCanonicalLines: false` tells the caller it may bootstrap a first band
 * from the intake/scope path, which is the only case where that is authoritative.
 */
export const refreshBallparkAfterClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => refreshBallparkClarificationSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ hasCanonicalLines: boolean; refreshed: boolean }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const est = await loadEstimate(sb, data.estimateId, org);
    if (
      isReadOnly({
        id: est.id as string,
        projectId: est.project_id as string,
        status: est.status as never,
        lockedAt: (est.locked_at as string | null) ?? null,
        supersededById: (est.superseded_by_id as string | null) ?? null,
      })
    ) {
      throw new Error("This estimate can no longer be edited");
    }

    const { count, error: countError } = await sb
      .from("estimate_line_items")
      .select("id", { count: "exact", head: true })
      .eq("estimate_id", data.estimateId)
      .is("archived_at", null);
    if (countError) throw new Error(msg(countError, "Failed to read estimate lines"));
    if ((count ?? 0) === 0) return { hasCanonicalLines: false, refreshed: false };

    /*
     * Apply the refined FACTS to the canonical inputs first, through the same
     * authoritative repair the estimate already uses: measured quantities are
     * re-derived from the saved geometry, labor from catalog productivity, fees
     * stay labor-free. Contractor overrides and pricing settings are untouched.
     */
    await sb.rpc("repair_estimate_pricing", { _estimate_id: data.estimateId });
    const fresh = await loadEstimate(sb, data.estimateId, org);

    const refreshed = await refreshBallparkFromCanonicalLines(sb, fresh, {
      contractorInitiated: true,
      clarification: true,
    });
    return { hasCanonicalLines: true, refreshed };
  });



/**
 * Project geometry a ballpark can price from, without asking the contractor to
 * re-measure. Saved project measurements win; otherwise the geometry captured
 * with the saved ballpark session (including its history) is used.
 */
async function loadBallparkGeometry(
  sb: SB,
  est: Record<string, unknown>,
  /** Work domains in the CURRENT scope: only geometry they need is honoured. */
  domains: WorkDomain[] = [],
): Promise<BallparkGeometryFacts> {
  const allowed = new Set(measurementFieldsForDomains(domains));
  const gate = (field: string, value: number | null) => (allowed.has(field as never) ? value : null);
  const { data: rows } = await sb
    .from("project_measurements")
    .select("length_ft,width_ft,ceiling_height_ft,openings,interior_partition_lf,floor_waste_pct")
    .eq("project_id", est.project_id as string)
    .order("created_at", { ascending: true })
    .limit(1);

  const row = Array.isArray(rows) ? (rows[0] as Record<string, unknown> | undefined) : undefined;
  if (row) {
    const facts = geometryFactsFrom({
      roomId: null,
      label: null,
      lengthFt: gate("lengthFt", row.length_ft == null ? null : Number(row.length_ft)),
      widthFt: gate("widthFt", row.width_ft == null ? null : Number(row.width_ft)),
      ceilingHeightFt: gate(
        "ceilingHeightFt",
        row.ceiling_height_ft == null ? null : Number(row.ceiling_height_ft),
      ),
      openings:
        Array.isArray(row.openings) && (allowed.has("doors" as never) || allowed.has("windows" as never))
          ? (row.openings as never)
          : [],
      interiorPartitionLf: gate(
        "interiorPartitionLf",
        row.interior_partition_lf == null ? null : Number(row.interior_partition_lf),
      ),
      floorWastePct: row.floor_waste_pct == null ? null : Number(row.floor_waste_pct),
    });
    if (hasUsableGeometry(facts)) return facts;
  }

  const fromSnapshot = geometryFactsFromSnapshot(est.range_snapshot ?? null);
  return hasUsableGeometry(fromSnapshot) ? fromSnapshot : EMPTY_GEOMETRY_FACTS;
}


/**
 * Ballpark-mode estimates are priced from a saved band, not from line items, so
 * a scope change must re-price that band or the contractor keeps seeing a range
 * for work that no longer matches the scope.
 *
 * Non-destructive by construction: the band being replaced is carried forward
 * untouched under `previous`, and scope the pricebook cannot price is recorded
 * on the snapshot rather than quietly dropped. Locked / issued documents are
 * never touched — those go through a revision instead.
 *
 * Integrity gate: a credible saved band is only replaced when the structured
 * scope actually reconciles with the current Scope of Work and the new number
 * is not absurd next to the band it replaces. Otherwise the last credible band
 * stays current and the snapshot is flagged `needsReview`.
 */
function readAssumptionOverrides(snapshot: unknown): Record<string, number> {
  const snap = findBallparkSnapshot(snapshot ?? null) as Record<string, unknown> | null;
  const raw = snap?.assumptionOverrides;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = typeof value === "number" ? value : Number(value);
    if (Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
}

/**
 * THE authoritative ballpark refresh: derive the band from the canonical
 * estimate cost lines.
 *
 * Once an estimate has cost lines, those lines ARE the project's cost graph.
 * They already carry evidence gating, the permit/fee invariant, quarter-hour
 * labor, whole-dollar money and the contractor's cost-book overrides — all
 * enforced in the database. Re-pricing the scope through the sample pricebook
 * created a SECOND authoritative cost model that could disagree with the
 * detailed estimate by more than 2x. It no longer runs when lines exist.
 *
 * Returns false when the estimate has no canonical lines, so the caller falls
 * back to the scope pricer purely to bootstrap a first band.
 */
async function refreshBallparkFromCanonicalLines(
  sb: SB,
  est: Record<string, unknown>,
  opts: {
    contractorInitiated?: boolean;
    assumptionCorrection?: boolean;
    engineUpgrade?: boolean;
    /**
     * The refresh was triggered by a clarification/refinement round rather than
     * by ordinary line editing. Divergence protection is applied on that path:
     * answering a question may sharpen a band, never multiply it.
     */
    clarification?: boolean;
  } = {},
): Promise<boolean> {
  const { data: rows, error: linesError } = await sb
    .from("estimate_line_items")
    .select(
      "id,description,group_label,category_key,trade_key,unit_key,quantity,labor_hours,labor_rate,material_cost,equipment_cost,subcontractor_cost,other_cost,overhead_pct,profit_pct,contingency_pct,is_taxable,cost_basis,resolution_status,is_quantity_placeholder,quantity_is_assumed_default,catalog_item_key",
    )
    .eq("estimate_id", est.id as string)
    .is("archived_at", null);
  if (linesError) throw new Error(msg(linesError, "Failed to read estimate lines"));
  const lineRows = (rows ?? []) as Record<string, unknown>[];
  if (lineRows.length === 0) return false;

  const num = (v: unknown) => {
    const n = typeof v === "number" ? v : Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
  };

  /* Composite packages absorb their declared atomic children exactly once. */
  const rollUps = resolveCompositeExclusivity(
    lineRows.map((r) => ({
      id: r.id as string,
      itemKey: (r.catalog_item_key as string | null) ?? null,
    })),
  );
  const rolledUpBy = rollUpMap(rollUps);

  const canonicalLines: CanonicalCostLine[] = lineRows.map((r) => ({
    id: r.id as string,
    description: (r.description as string | null) ?? "",
    groupLabel: (r.group_label as string | null) ?? null,
    categoryKey: (r.category_key as string | null) ?? null,
    tradeKey: (r.trade_key as string | null) ?? null,
    unitKey: (r.unit_key as string | null) ?? null,
    quantity: num(r.quantity),
    laborHours: num(r.labor_hours),
    laborRate: num(r.labor_rate),
    materialCost: num(r.material_cost),
    equipmentCost: num(r.equipment_cost),
    subcontractorCost: num(r.subcontractor_cost),
    otherCost: num(r.other_cost),
    overheadPct: num(r.overhead_pct),
    profitPct: num(r.profit_pct),
    contingencyPct: num(r.contingency_pct),
    isTaxable: r.is_taxable !== false,
    costBasis: (r.cost_basis as string | null) ?? null,
    resolutionStatus: (r.resolution_status as string | null) ?? null,
    isQuantityPlaceholder: r.is_quantity_placeholder === true,
    quantityIsAssumedDefault: r.quantity_is_assumed_default === true,
    rolledUpIntoLineId: rolledUpBy.get(r.id as string) ?? null,
  }));

  const strategy = pricingStrategyOf({
    pricingMethod: est.pricing_method,
    targetGrossMarginPct: est.target_gross_margin_pct,
    defaultOverheadPct: est.default_overhead_pct,
    defaultProfitPct: est.default_profit_pct,
  });
  const currency = (est.currency as string | null) ?? "USD";
  const computedAt = new Date().toISOString();

  /* Evidence recorded but not confirmed widens the band; it never becomes truth. */
  const { data: measurementRows } = await sb
    .from("project_measurements")
    .select("length_ft,width_ft,unconfirmed_fields")
    .eq("project_id", est.project_id as string)
    .order("created_at", { ascending: true })
    .limit(1);
  const measurement = (Array.isArray(measurementRows) ? measurementRows[0] : null) as
    | Record<string, unknown>
    | null;
  const unconfirmed = Array.isArray(measurement?.unconfirmed_fields)
    ? (measurement!.unconfirmed_fields as string[])
    : [];

  const graph = buildCanonicalCostGraph(
    canonicalLines,
    {
      currency,
      taxRatePct: num(est.tax_rate),
      defaultOverheadPct: num(est.default_overhead_pct),
      defaultProfitPct: num(est.default_profit_pct),
      defaultContingencyPct: num(est.default_contingency_pct),
      pricingStrategy: strategy,
    },
    {
      pricing: pricingSnapshotFromStrategy(strategy, {
        contingencyPct: num(est.default_contingency_pct),
        laborRate: est.default_labor_rate == null ? null : num(est.default_labor_rate),
      }),
      engineVersion: BALLPARK_ENGINE_VERSION,
      computedAt,
      unconfirmedEvidence: unconfirmed,
    },
  );

  /* ADVISORY market diagnostic. Never changes a single dollar of the price. */
  const { data: projectRow } = await sb
    .from("projects")
    .select("name,description")
    .eq("id", est.project_id as string)
    .maybeSingle();
  const project = (projectRow ?? {}) as { name?: string | null; description?: string | null };
  const areaSf =
    measurement && measurement.length_ft != null && measurement.width_ft != null
      ? num(measurement.length_ft) * num(measurement.width_ft)
      : null;
  const sanity = evaluateMarketSanity({
    projectClass: classifyProject(`${project.name ?? ""} ${project.description ?? ""}`),
    finishedAreaSf: areaSf,
    sellingPrice: graph.band.expected,
    drivers: graph.drivers,
  });

  const previous = findBallparkSnapshot(est.range_snapshot ?? null);
  const stripHistory = (snap: unknown) => {
    if (!snap || typeof snap !== "object") return snap;
    const { previous: _p, originalBallpark: _o, ...rest } = snap as Record<string, unknown>;
    return rest;
  };

  /*
   * INTEGRITY GATE on the canonical path too. A credible saved band is never
   * replaced by a zero / admittedly-incomplete number, and a clarification
   * round may not multiply the price behind the contractor's back. Ordinary
   * line editing is deliberately exempt from the divergence check: adding scope
   * to an estimate is supposed to move the total.
   */
  const previousBandSummary = readBallparkSummary(previous);
  const gate = evaluateRecalcGate({
    candidate: graph.band,
    previous: previousBandSummary
      ? {
          low: previousBandSummary.low,
          expected: previousBandSummary.expected,
          high: previousBandSummary.high,
        }
      : null,
    unresolvedCount: 0,
    candidateIsValidQuote: graph.isValidQuote,
    contractorInitiated: opts.contractorInitiated === true || opts.clarification === true,
    assumptionCorrection: opts.assumptionCorrection === true,
    engineUpgrade: opts.engineUpgrade === true,
    divergenceFactor: opts.clarification ? undefined : Number.POSITIVE_INFINITY,
  });
  if (!gate.allow) {
    if (!previous) return false;
    const held = {
      ...(previous as Record<string, unknown>),
      /* The canonical engine HAS run; the DB refresh marker is satisfied. */
      needsCanonicalRefresh: false,
      needsReview: true,
      reviewReason: gate.reason,
      pendingRecalc: {
        band: graph.band,
        isValidQuote: graph.isValidQuote,
        source: "canonical_lines",
        computedAt,
      },
    };
    const { error: holdError } = await sb
      .from("estimates")
      .update({ range_snapshot: held as never })
      .eq("id", est.id as string);
    if (holdError) throw new Error(msg(holdError, "Failed to flag ballpark review"));
    return true;
  }



  const snapshot = {
    kind: "ballpark",
    /* One pipeline. This source is the only authoritative one when lines exist. */
    source: "canonical_lines",
    engineVersion: BALLPARK_ENGINE_VERSION,
    band: graph.band,
    currency,
    confidence:
      graph.uncertaintyPct <= 10 ? "high" : graph.uncertaintyPct <= 20 ? "medium" : "low",
    widenPct: graph.uncertaintyPct,
    pricedCount: canonicalLines.length - graph.rolledUpLineIds.length - graph.unresolvedLineIds.length,
    assumedCount: graph.assumedLineIds.length,
    costBasis: graph.costBasis,
    /* Reconciliation proof: preliminary expected IS the detailed selling price. */
    reconciliation: reconcileBandToCanonical(graph.band, graph.totals.grandTotal),
    drivers: graph.drivers,
    rolledUpComposites: rollUps,
    rolledUpLineIds: graph.rolledUpLineIds,
    unresolvedLineIds: graph.unresolvedLineIds,
    /* Recognized work priced from generic trade rates, pending review. */
    fallbackPricedLineIds: graph.fallbackPricedLineIds,

    assumedLineIds: graph.assumedLineIds,
    unconfirmedEvidence: unconfirmed,
    marketSanity: sanity,
    needsReview: graph.needsReview,
    reviewReasons: graph.reviewReasons,
    /*
     * VALIDITY GUARD. Scope that exists but priced to nothing is an INCOMPLETE
     * estimate, not a $0 quote. The UI reads this instead of the raw band.
     */
    isValidQuote: graph.isValidQuote,
    invalidReason: graph.invalidReason,
    savedAt: computedAt,

    ...(previous
      ? {
          previous: stripHistory(previous),
          originalBallpark:
            (previous as Record<string, unknown>).originalBallpark ?? stripHistory(previous),
        }
      : {}),
  };

  const { error } = await sb
    .from("estimates")
    .update({ range_snapshot: snapshot as never })
    .eq("id", est.id as string);
  if (error) throw new Error(msg(error, "Failed to refresh ballpark"));
  return true;
}

/**
 * ONE BAND WRITER (ADR-062 enforcement). Ordinary line editing used to leave the
 * canonical band to a SQL trigger that ran completely different math, so the
 * saved range silently drifted away from the detailed estimate. Line CRUD now
 * re-runs the canonical cost graph itself. Failures never fail the edit: the
 * database marks the snapshot `needsCanonicalRefresh` so the stale band is
 * visible as stale rather than replaced by a second engine's number.
 */
async function refreshCanonicalBandAfterLineChange(
  sb: SB,
  estimateId: string,
  org: string,
): Promise<void> {
  try {
    const fresh = await loadEstimate(sb, estimateId, org);
    if (fresh.locked_at != null || fresh.superseded_by_id != null) return;
    const snapshot = fresh.range_snapshot;
    /* Never invent a band for an estimate that has never had one. */
    if (!snapshot || typeof snapshot !== "object" || Object.keys(snapshot).length === 0) return;
    await refreshBallparkFromCanonicalLines(sb, fresh);
  } catch {
    /* Marker left in place by the database trigger; the edit itself stands. */
  }
}

async function refreshBallparkFromScope(
  sb: SB,
  est: Record<string, unknown>,
  items: readonly ScopeFingerprintItem[],
  opts: {
    contractorInitiated?: boolean;
    assumptionCorrection?: boolean;
    engineUpgrade?: boolean;
    clarification?: boolean;
  } = {},
): Promise<boolean> {
  if (est.intake_mode !== "ballpark") return false;

  if (est.locked_at != null || est.superseded_by_id != null) return false;

  /*
   * ONE AUTHORITATIVE COST PIPELINE. When canonical cost lines exist they are
   * the cost graph, and the scope pricer must not produce a competing job cost.
   */
  if (await refreshBallparkFromCanonicalLines(sb, est, opts)) return true;


  const scopeItems = items.map((i) => ({
    id: i.id,
    title: i.title ?? "",
    quantity: i.quantity ?? null,
    unitKey: i.unitKey ?? null,
    isIncluded: i.isIncluded !== false,
    archivedAt: i.archivedAt ?? null,
    tradeKey: i.tradeKey ?? null,
  }));

  /*
   * A ballpark resolves quantities from what the project already knows before
   * it ever asks the contractor to measure: saved project measurements first,
   * then the geometry captured with the saved ballpark session.
   */
  /*
   * A measured wall on a cabinet job is not room geometry. Domains come from
   * the current scope, so only measurements the work depends on can reach the
   * pricing layer.
   */
  const scopeDomains = deriveWorkDomains(
    scopeItems.map((i) => ({ title: i.title })),
  );
  const geometry = await loadBallparkGeometry(sb, est, scopeDomains);

  /* Contractor corrections survive every recalculation. */
  const assumptionOverrides = readAssumptionOverrides(est.range_snapshot ?? null);

  /*
   * Job-site book location for this estimate: manual override -> ZIP -> state
   * average -> flagged national baseline. Never crashes a fresh estimate.
   */
  let bookLocation = NATIONAL_BASELINE_LOCATION;
  try {
    const { data: locRows } = await sb.rpc("nce_estimate_location", { _estimate_id: est.id });
    const locRow = (Array.isArray(locRows) ? locRows[0] : locRows) as
      | Record<string, unknown>
      | undefined;
    if (locRow) {
      bookLocation = {
        location: String(locRow.location ?? NATIONAL_BASELINE_LOCATION.location),
        source: String(locRow.match_source ?? "national_baseline") as typeof bookLocation.source,
        materialPct: Number(locRow.material_pct ?? 0),
        laborPct: Number(locRow.labor_pct ?? 0),
        equipmentPct: Number(locRow.equipment_pct ?? 0),
      };
    }
  } catch {
    bookLocation = NATIONAL_BASELINE_LOCATION;
  }
  const bookRate = bookLaborRate("general", bookLocation);

  const result = recalculateBallparkFromScope(scopeItems, {
    assumptionOverrides,
    currency: (est.currency as string | null) ?? "USD",
    taxRatePct: Number(est.tax_rate ?? 0),
    /*
     * BOOK LABOR ONLY. The band prices at the published NCE 2026 craft wage
     * adjusted by this estimate's job-site area modification factor — the same
     * money the detailed line repricing produces. No flat company rate.
     */
    laborRate: bookRate,
    /*
     * The estimate's OWN saved method prices the refreshed band. A margin-
     * priced estimate never falls back to legacy 10/10 overhead+profit.
     */
    pricingStrategy: pricingStrategyOf({
      pricingMethod: est.pricing_method,
      targetGrossMarginPct: est.target_gross_margin_pct,
      defaultOverheadPct: est.default_overhead_pct,
      defaultProfitPct: est.default_profit_pct,
    }),
    overheadPct: Number(est.default_overhead_pct ?? 10),
    profitPct: Number(est.default_profit_pct ?? 10),
    contingencyPct: Number(est.default_contingency_pct ?? 0),
    geometry,
    /*
     * Internal labor model: the contractor's pace and any hours they typed in
     * are estimate-level overrides and are re-applied on every recalculation,
     * so a scope refresh never silently resets them.
     */
    laborDefaults: { laborRate: bookRate },
    laborSettings: normalizeLaborSettings(est.labor_settings),
  });


  const previous = findBallparkSnapshot(est.range_snapshot ?? null);
  const previousBand = readBallparkSummary(previous);

  /* Leftover structured scope the current narrative never describes. */
  const narrativeText = await loadCurrentNarrativeText(sb, est.project_id as string);
  const unresolved = findUnreconciledScopeItems({
    narrativeText,
    items: scopeItems.map((i) => ({
      id: i.id,
      sectionId: "",
      roomId: null,
      title: i.title,
      actionKey: null,
      quantity: i.quantity,
      unitKey: i.unitKey,
      materialSelection: null,
      isIncluded: i.isIncluded && !i.archivedAt,
    })),
  });

  const decision = evaluateRecalcGate({
    candidate: result ? result.band : null,
    previous: previousBand
      ? { low: previousBand.low, expected: previousBand.expected, high: previousBand.high }
      : null,
    unresolvedCount: unresolved.length,
    unpriceableCount: result?.unpriceable.length ?? 0,
    contractorInitiated: opts.contractorInitiated === true,
    assumptionCorrection: opts.assumptionCorrection === true,
    engineUpgrade: opts.engineUpgrade === true,

  });

  if (!decision.allow) {
    if (decision.reason === "noResult" || !previous) return false;
    /* Keep the credible band current; record why a new number was withheld. */
    const held = {
      ...(previous as Record<string, unknown>),
      needsReview: true,
      reviewReason: decision.reason,
      unresolvedScopeCount: unresolved.length,
      unresolvedScope: unresolved.slice(0, 25),
      ...(result
        ? { pendingRecalc: { band: result.band, confidence: result.confidence, computedAt: new Date().toISOString() } }
        : {}),
    };
    const { error } = await sb.from("estimates")
      .update({ range_snapshot: held as never })
      .eq("id", est.id as string);
    if (error) throw new Error(msg(error, "Failed to flag ballpark review"));
    return false;
  }

  if (!result) return false; // nothing priceable: keep the saved band as-is

  const stripBallparkHistory = (snap: unknown) => {
    if (!snap || typeof snap !== "object") return snap;
    const { previous: _p, originalBallpark: _o, ...rest } = snap as Record<string, unknown>;
    return rest;
  };

  const snapshot = {
    kind: "ballpark",
    source: "scope_recalc",
    /* Which engine produced these conclusions; drives stale detection on open. */
    engineVersion: BALLPARK_ENGINE_VERSION,
    band: result.band,

    currency: result.currency,
    confidence: result.confidence,
    widenPct: result.widenPct,
    pricedCount: result.pricedCount,
    assumedCount: result.assumedCount,
    derivedCount: result.derivedCount,
    allowanceCount: result.allowanceCount,
    provisionalCount: result.provisionalCount,
    correctedCount: result.correctedCount,
    assumptionOverrides,
    /* Provenance for every quantity the ballpark resolved on its own. */
    assumptions: result.assumptions.slice(0, 60),
    unpriceable: result.unpriceable,
    /*
     * INTERNAL labor summary. Contractor-only: hours, pace and crew capacity
     * are never read by the proposal / client portal, which only ever take the
     * band from this snapshot.
     */
    labor: {
      baselineHours: result.labor.baselineHours,
      totalHours: result.labor.totalHours,
      nonInstallHours: result.labor.nonInstallHours,
      productivityMultiplier: result.labor.productivityMultiplier,
      laborRate: result.labor.laborRate,
      laborAmount: result.labor.laborAmount,
      byTrade: result.labor.byTrade,
      /*
       * EVERY labor-bearing task is persisted, not a top-N sample. Storing a
       * subset is exactly what made the Tasks view total less than the
       * Project view; the three views must sum to the same number.
       */
      tasks: result.labor.tasks.map((t) => ({
        id: t.id,
        description: t.description,
        tradeKey: t.tradeKey,
        quantity: t.quantity,
        unitKey: t.unitKey,
        hoursPerUnit: t.hoursPerUnit,
        baselineHours: t.baselineHours,
        adjustedHours: t.adjustedHours,
        appliedMultiplier: t.appliedMultiplier,
        laborRate: t.laborRate,
        laborAmount: t.laborAmount,
        isOverridden: t.isOverridden,
        isImplausible: t.isImplausible,
        ...(t.isNonInstall ? { isNonInstall: true, nonInstallKey: t.nonInstallKey } : {}),
      })),
      nonInstall: result.labor.nonInstall,
      duration: result.labor.duration,
      isSmallJob: result.labor.isSmallJob,
      warnings: result.labor.warnings,
    },

    isSampleData: result.isSampleData,
    /*
     * FIXED cost basis for this band, captured from the same engine run. The
     * UI reads this instead of reverse-deriving cost from a selected price.
     */
    costBasis: costBasisFromEngineTotals(
      calculateEngineEstimate(result.pricedLines, {
        currency: result.currency,
        taxRatePct: Number(est.tax_rate ?? 0),
        pricingStrategy: pricingStrategyOf({
          pricingMethod: est.pricing_method,
          targetGrossMarginPct: est.target_gross_margin_pct,
          defaultOverheadPct: est.default_overhead_pct,
          defaultProfitPct: est.default_profit_pct,
        }),
      }).totals,
      {
        currency: result.currency,
        pricing: pricingSnapshotFromStrategy(
          pricingStrategyOf({
            pricingMethod: est.pricing_method,
            targetGrossMarginPct: est.target_gross_margin_pct,
            defaultOverheadPct: est.default_overhead_pct,
            defaultProfitPct: est.default_profit_pct,
          }),
          {
            contingencyPct: Number(est.default_contingency_pct ?? 0),
            /*
     * BOOK LABOR ONLY. The band prices at the published NCE 2026 craft wage
     * adjusted by this estimate's job-site area modification factor — the same
     * money the detailed line repricing produces. No flat company rate.
     */
    laborRate: bookRate,
          },
        ),
        engineVersion: BALLPARK_ENGINE_VERSION,
        computedAt: new Date().toISOString(),
      },
    ),
    needsReview: false,

    savedAt: new Date().toISOString(),
    /*
     * History is reference, never a working value. `previous` is the band this
     * one replaced (its own chain stripped so snapshots cannot grow forever),
     * and `originalBallpark` pins the oldest credible band on the chain.
     */
    ...(previous
      ? {
          previous: stripBallparkHistory(previous),
          originalBallpark:
            (previous as Record<string, unknown>).originalBallpark ??
            stripBallparkHistory(previous),
        }
      : {}),

  };

  const { error } = await sb.from("estimates")
    .update({ range_snapshot: snapshot as never })
    .eq("id", est.id as string);
  if (error) throw new Error(msg(error, "Failed to refresh ballpark"));
  return true;
}

/** The contractor-current Scope of Work prose: approved wins, else edited. */
async function loadCurrentNarrativeText(sb: SB, projectId: string): Promise<string> {
  const { data, error } = await sb.from("project_narrative_scopes")
    .select("edited_text, approved_text")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return "";
  const row = (data ?? {}) as { edited_text?: string | null; approved_text?: string | null };
  return row.approved_text?.trim() || row.edited_text?.trim() || "";
}



/* ------------------------------------------------- scope staleness (durable) */

/**
 * The structured scope of a project, reduced to the fields that change what is
 * being estimated. Narrative prose is intentionally not read here.
 */
async function loadScopeFingerprintItems(
  sb: SB,
  projectId: string,
  org: string,
): Promise<ScopeFingerprintItem[]> {
  const { data, error } = await sb.from("scope_items")
    .select(
      "id, section_id, room_id, title, trade_key, action_key, quantity, unit_key, material_selection, finish_selection, is_included, archived_at",
    )
    .eq("organization_id", org)
    .eq("project_id", projectId)
    .is("archived_at", null);
  if (error) throw new Error(msg(error, "Failed to load scope"));
  return ((data as Record<string, unknown>[]) ?? []).map((r) => ({
    id: r.id as string,
    sectionId: (r.section_id as string | null) ?? null,
    roomId: (r.room_id as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    actionKey: (r.action_key as string | null) ?? null,
    tradeKey: (r.trade_key as string | null) ?? null,
    quantity: r.quantity == null ? null : Number(r.quantity),
    unitKey: (r.unit_key as string | null) ?? null,
    materialSelection: (r.material_selection as string | null) ?? null,
    finishSelection: (r.finish_selection as string | null) ?? null,
    isIncluded: r.is_included !== false,
    archivedAt: (r.archived_at as string | null) ?? null,
  }));
}

/** Durable record of the scope state an estimate is synchronized against. */
async function recordScopeBaseline(sb: SB, estimateId: string, fingerprint: string) {
  const { error } = await sb.from("estimates")
    .update({ scope_sync_fingerprint: fingerprint, scope_synced_at: new Date().toISOString() })
    .eq("id", estimateId);
  if (error) throw new Error(msg(error, "Failed to record scope sync"));
}

export interface ScopeSyncStateDTO {
  estimateId: string;
  isStale: boolean;
  action: "none" | "update" | "revise";
  currentFingerprint: string;
  syncedFingerprint: string | null;
  syncedAt: string | null;
  /** Priced lines whose scope item was removed or excluded — review, never auto-delete. */
  needsReview: number;
}

/**
 * Server-side staleness read. Nothing is client-local: the baseline lives on
 * the estimate row, so closing and reopening the project still detects it.
 */
export const getScopeSyncState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => scopeSyncStateSchema.parse(d))
  .handler(async ({ data, context }): Promise<ScopeSyncStateDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const est = await loadEstimate(sb, data.estimateId, org);
    const items = await loadScopeFingerprintItems(sb, est.project_id as string, org);
    const currentFingerprint = computeScopeFingerprint(items);
    const stored = (est.scope_sync_fingerprint as string | null) ?? null;

    // First read of a legacy estimate adopts today's scope as its baseline.
    if (stored == null) {
      await recordScopeBaseline(sb, data.estimateId, currentFingerprint);
      return {
        estimateId: data.estimateId,
        isStale: false,
        action: "none",
        currentFingerprint,
        syncedFingerprint: currentFingerprint,
        syncedAt: new Date().toISOString(),
        needsReview: 0,
      };
    }

    const doc = mapEstimate(est);
    const state = assessScopeSync({
      currentFingerprint,
      syncedFingerprint: stored,
      isEditable: !isReadOnly({
        id: doc.id,
        projectId: doc.projectId,
        documentKind: doc.documentKind,
        status: doc.status,
        lockedAt: doc.lockedAt,
        supersededById: doc.supersededById,
      }),
      canRevise: doc.documentKind === "estimate" && !doc.supersededById && !doc.archivedAt,
    });

    let needsReview = 0;
    if (state.isStale) {
      const { data: rows } = await sb.from("estimate_line_items")
        .select("id, scope_item_id")
        .eq("organization_id", org).eq("estimate_id", data.estimateId).is("archived_at", null);
      needsReview = findOrphanedLineIds(
        ((rows as Record<string, unknown>[]) ?? []).map((r) => ({
          id: r.id as string,
          scopeItemId: (r.scope_item_id as string | null) ?? null,
        })),
        items,
      ).length;
    }

    return {
      estimateId: data.estimateId,
      isStale: state.isStale,
      action: state.action,
      currentFingerprint,
      syncedFingerprint: stored,
      syncedAt: (est.scope_synced_at as string | null) ?? null,
      needsReview,
    };
  });

/**
 * Issued / locked documents are preserved as customer-facing history: this
 * creates the next numbered revision and imports the current scope into it in
 * one contractor action.
 */
export const reviseAndSyncEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviseAndSyncSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ estimateId: string; created: boolean; imported: number }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { data: res, error } = await sb.rpc("create_estimate_revision", {
      _estimate_id: data.estimateId,
    });
    if (error) throw new Error(msg(error, "Failed to create revision"));
    const row = (res ?? {}) as { estimate_id?: string; created?: boolean };
    if (!row.estimate_id) throw new Error("Failed to create revision");

    const revisionId = row.estimate_id;
    const est = await loadEstimate(sb, revisionId, org);
    const projectId = est.project_id as string;
    const pricing = await buildProjectPricing(sb, projectId, org);
    const { data: count, error: syncError } = await sb.rpc("sync_estimate_from_scope", {
      _estimate_id: revisionId,
      _pricing: pricing,
    });
    if (syncError) throw new Error(msg(syncError, "Failed to sync scope"));

    const items = await loadScopeFingerprintItems(sb, projectId, org);
    await recordScopeBaseline(sb, revisionId, computeScopeFingerprint(items));
    /* The new revision is editable, so its ballpark band re-prices the new scope. */
    await refreshBallparkFromScope(sb, est, items);
    return { estimateId: revisionId, created: row.created !== false, imported: Number(count ?? 0) };
  });

export const setEstimateStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setStatusSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;

    /*
     * Pricing-integrity guard: a detailed estimate whose lines are mostly
     * unpriced (typically right after Ballpark -> Detailed conversion) must not
     * be presented as ready/final. Refinement may legitimately move pricing;
     * a collapse caused by missing pricing may not be published.
     */
    if (isFinalEstimateStatus(String(data.status))) {
      const org = await resolveOrg(sb);
      const est = await loadEstimate(sb, data.estimateId, org);
      if (est.intake_mode === "detailed") {
        const { data: rows } = await sb.from("estimate_line_items")
          .select("labor_hours, labor_rate, material_cost, equipment_cost, subcontractor_cost, other_cost")
          .eq("organization_id", org).eq("estimate_id", data.estimateId).is("archived_at", null);
        const lines = ((rows as Record<string, unknown>[]) ?? []).map((r) => ({
          laborHours: Number(r.labor_hours ?? 0),
          laborRate: Number(r.labor_rate ?? 0),
          materialCost: Number(r.material_cost ?? 0),
          equipmentCost: Number(r.equipment_cost ?? 0),
          subcontractorCost: Number(r.subcontractor_cost ?? 0),
          otherCost: Number(r.other_cost ?? 0),
        }));
        const integrity = assessDetailedIntegrity({ lines, grandTotal: 0, ballpark: null });
        if (integrity.reasons.includes("unpriced_lines") || integrity.reasons.includes("no_lines")) {
          throw new Error("estimate_incomplete_pricing");
        }
      }
    }

    const { error } = await sb.rpc("set_estimate_status", {
      _estimate_id: data.estimateId,
      _status: data.status,
    });
    if (error) throw new Error(msg(error, "Failed to change status"));
    return { ok: true };
  });


export const updateEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateEstimateSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const existing = await loadEstimate(sb, data.estimateId, org);
    if (existing.status === "approved") throw new Error("estimate_locked");
    /*
     * A ballpark snapshot may only be frozen onto a document that is still
     * being worked. Issued, accepted, locked and superseded documents keep the
     * numbers the customer already saw.
     */
    if (data.rangeSnapshot !== undefined) {
      const locked =
        existing.locked_at != null ||
        existing.superseded_by_id != null ||
        ["sent", "accepted", "declined", "superseded"].includes(String(existing.status));
      if (locked) throw new Error("estimate_locked");
    }

    const patch: Record<string, unknown> = {};
    if (data.title !== undefined) patch.title = data.title;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.taxRate !== undefined) patch.tax_rate = data.taxRate;
    if (data.defaultOverheadPct !== undefined) patch.default_overhead_pct = data.defaultOverheadPct;
    if (data.defaultProfitPct !== undefined) patch.default_profit_pct = data.defaultProfitPct;
    if (data.defaultContingencyPct !== undefined) patch.default_contingency_pct = data.defaultContingencyPct;
    if (data.defaultLaborRate !== undefined) patch.default_labor_rate = data.defaultLaborRate;
    if (data.rangeAssumptions !== undefined) patch.range_assumptions = data.rangeAssumptions;
    if (data.rangeSnapshot !== undefined) {
      patch.range_snapshot = preserveBallparkHistory(existing.range_snapshot, data.rangeSnapshot);
    }

    /*
     * ONE CONVERSION PATH. Ballpark -> Detailed must go through
     * `convertEstimateToDetailed` so the scope import, lock gate, audit event
     * and canonical band refresh all happen together. A bare mode flip here
     * would leave a detailed estimate with no lines and no audit trail.
     */
    if (data.intakeMode !== undefined) {
      if (data.intakeMode === "detailed" && existing.intake_mode === "ballpark") {
        throw new Error("use_convert_to_detailed");
      }
      patch.intake_mode = data.intakeMode;
    }
    /*
     * Pricing mode is a sell/presentation switch. Nothing else is touched, so
     * scope, quantities, answers and pricing history survive the change.
     */
    if (data.pricingMode !== undefined) patch.pricing_mode = data.pricingMode;
    /*
     * Pricing METHOD is mutually exclusive by construction: one column decides
     * whether overhead+profit or the target gross margin is in force.
     */
    if (data.pricingMethod !== undefined) patch.pricing_method = data.pricingMethod;
    if (data.targetGrossMarginPct !== undefined)
      patch.target_gross_margin_pct = data.targetGrossMarginPct;
    /*
     * Labor settings are an ESTIMATE-level override set. Writing them here can
     * never touch the organization's company defaults.
     */
    if (data.laborSettings !== undefined) patch.labor_settings = data.laborSettings;

    /*
     * A contractor save of ANY pricing field is an explicit choice, so it is
     * stamped as locked. `preserve_explicit_estimate_pricing` then protects
     * these values from later company-default inheritance or repricing; the
     * only way they move again is another deliberate save through this path.
     */
    const PRICING_FIELDS = [
      "default_overhead_pct",
      "default_profit_pct",
      "default_contingency_pct",
      "default_labor_rate",
      "pricing_method",
      "target_gross_margin_pct",
      "labor_settings",
      "tax_rate",
    ] as const;
    if (PRICING_FIELDS.some((f) => f in patch)) {
      patch.pricing_settings_locked_at = new Date().toISOString();
      /*
       * The save IS the confirmation, so any outstanding "confirm these
       * numbers" state clears here and the source becomes the contractor
       * rather than an inherited or provisional snapshot.
       */
      patch.pricing_confirmation_required = false;
      patch.pricing_confirmation_reason = null;
      patch.pricing_confirmed_at = new Date().toISOString();
      patch.pricing_source = "contractor_confirmed";
      /*
       * Mutex mirrored in the PERSISTED row, not just in the math: whichever
       * method is not in force stores zeros, so a stale percentage can never
       * be read back later as if it were live. The database trigger enforces
       * the same rule for every other write path.
       */
      const method = (patch.pricing_method ?? existing.pricing_method ?? "overhead_profit") as string;
      if (method === "target_gross_margin") {
        patch.default_overhead_pct = 0;
        patch.default_profit_pct = 0;
      } else {
        patch.target_gross_margin_pct = 0;
      }
    }



    const { data: row, error } = await sb.from("estimates").update(patch)
      .eq("id", data.estimateId).eq("organization_id", org).select("*").single();
    if (error) throw new Error(msg(error, "Failed to update estimate"));
    await audit(sb, existing as any, data.estimateId, "updated", "estimate", data.estimateId,
      "Estimate settings updated", { fields: Object.keys(patch) });

    /*
     * ONE BAND WRITER (D2). A band saved from the standalone Ballpark screen,
     * or a pricing-setting change, must not leave the saved range describing
     * different economics than the estimate's own lines. When lines exist the
     * canonical cost graph re-derives the band; when they do not, the saved
     * ballpark snapshot stands as the only evidence there is.
     */
    const bandAffecting =
      data.rangeSnapshot !== undefined || PRICING_FIELDS.some((f) => f in patch);
    if (bandAffecting) {
      try {
        const fresh = await loadEstimate(sb, data.estimateId, org);
        if (fresh.locked_at == null && fresh.superseded_by_id == null) {
          const refreshed = await refreshBallparkFromCanonicalLines(sb, fresh);
          if (refreshed) return mapEstimate(await loadEstimate(sb, data.estimateId, org));
        }
      } catch {
        /* The save stands; the band keeps its stale marker rather than a second engine's number. */
      }
    }
    return mapEstimate(row as Record<string, unknown>);
  });

/**
 * Contractor picks WHERE inside the saved preliminary band this job is being
 * sold: Low, Recommended (expected) or High.
 *
 * Deliberately narrow. It stamps `selectedBandPosition` on the existing
 * ballpark snapshot and writes NOTHING else — not the band, not the
 * assumptions, not the scope, not one pricing field. So it can never resolve an
 * outstanding "confirm your pricing" state, never flips the pricing method, and
 * never detaches the price from the scope that produced it.
 */
export const setBallparkBandPosition = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => setBallparkBandPositionSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const existing = await loadEstimate(sb, data.estimateId, org);

    /* Issued documents keep the position the customer was shown. */
    const locked =
      existing.locked_at != null ||
      existing.superseded_by_id != null ||
      ["approved", "sent", "accepted", "declined", "superseded"].includes(
        String(existing.status),
      );
    if (locked) throw new Error("estimate_locked");

    const next = applyBallparkBandPosition(existing.range_snapshot ?? null, data.position);
    if (next === (existing.range_snapshot ?? null)) {
      /* No ballpark band to position against; nothing to record. */
      return mapEstimate(existing as Record<string, unknown>);
    }

    const { data: row, error } = await sb.from("estimates")
      .update({ range_snapshot: next as never })
      .eq("id", data.estimateId).eq("organization_id", org).select("*").single();
    if (error) throw new Error(msg(error, "Failed to save ballpark selection"));
    await audit(sb, existing as any, data.estimateId, "updated", "estimate", data.estimateId,
      "Ballpark band position selected", { selectedBandPosition: data.position });
    return mapEstimate(row as Record<string, unknown>);
  });



/**
 * Ballpark -> Detailed conversion on the SAME estimate (ADR-045).
 *
 * Nothing is copied, duplicated or recreated: the project, client, property,
 * title, notes, measurements, photos, scope, assumptions, interview answers
 * and the saved ballpark range all stay on this row. Only `intake_mode` flips,
 * which unlocks the detailed pricing tools. The original ballpark range is
 * written into the audit trail so it stays comparable after refinement.
 *
 * Idempotent: converting an already-detailed estimate is a no-op that returns
 * the same row and writes no second audit event.
 */
export const convertEstimateToDetailed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => convertEstimateSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const existing = await loadEstimate(sb, data.estimateId, org);

    const locked =
      existing.locked_at != null ||
      existing.superseded_by_id != null ||
      existing.archived_at != null ||
      ["approved", "sent", "accepted", "declined", "superseded"].includes(
        String(existing.status),
      );
    if (locked) throw new Error("estimate_locked");

    /**
     * Seed the SAME estimate from the current approved scope. `sync_estimate_from_scope`
     * only imports scope items that do not already have a line on this estimate,
     * so a retried or interrupted conversion never duplicates or overwrites
     * contractor-entered detailed items.
     */
    const seedFromScope = async (): Promise<number> => {
      try {
        const pricing = await buildProjectPricing(sb, existing.project_id as string, org);
        const { data: count, error: syncError } = await sb.rpc("sync_estimate_from_scope", {
          _estimate_id: data.estimateId,
          _pricing: pricing,
        });
        if (syncError) return 0;
        return Number(count ?? 0);
      } catch {
        return 0;
      }
    };

    /* Already detailed: resume-safe re-entry still tops up any missing scope lines. */
    if (existing.intake_mode === "detailed") {
      const seeded = await seedFromScope();
      if (seeded > 0) {
        await audit(
          sb, existing as any, data.estimateId, "scope_synced", "estimate",
          data.estimateId, "Detailed estimate topped up from scope", { seededLines: seeded },
        );
        /* ADR-062: seeded lines change the cost graph, so the band re-derives. */
        await refreshCanonicalBandAfterLineChange(sb, data.estimateId, org);
      }
      return mapEstimate(await loadEstimate(sb, data.estimateId, org));
    }

    const { data: row, error } = await sb.from("estimates")
      .update({ intake_mode: "detailed" })
      .eq("id", data.estimateId)
      .eq("organization_id", org)
      .eq("intake_mode", "ballpark")
      .select("*")
      .maybeSingle();
    if (error) throw new Error(msg(error, "Failed to convert estimate"));
    /* A concurrent conversion already won; re-read instead of duplicating. */
    if (!row) return mapEstimate(await loadEstimate(sb, data.estimateId, org));

    const seededLines = await seedFromScope();

    /*
     * ONE BAND WRITER (ADR-062 / ADR-066). Seeding scope lines mutates the
     * canonical cost graph, and the database only marks the saved band stale.
     * The canonical engine runs here so band and line totals agree, and the
     * `needsCanonicalRefresh` marker is cleared rather than left silent.
     */
    await refreshCanonicalBandAfterLineChange(sb, data.estimateId, org);

    await audit(
      sb, existing as any, data.estimateId, "converted_to_detailed", "estimate",
      data.estimateId, "Converted from Ballpark to Detailed",
      {
        from: "ballpark",
        to: "detailed",
        seededLines,
        /* The original range stays in history for reference. */
        ballparkRange: existing.range_snapshot ?? null,
      },
    );
    return mapEstimate(await loadEstimate(sb, data.estimateId, org));
  });


export const archiveEstimate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveEstimateSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const existing = await loadEstimate(sb, data.estimateId, org);
    const { error } = await sb.from("estimates")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.estimateId).eq("organization_id", org);
    if (error) throw new Error(msg(error, "Failed to archive estimate"));
    await audit(sb, existing as any, data.estimateId, data.archived ? "archived" : "restored",
      "estimate", data.estimateId, data.archived ? "Estimate archived" : "Estimate restored");
    return { ok: true };
  });


/**
 * Explicit "Apply Knowledge Base Pricing" action for estimates already
 * generated at zero. Fills only blank, non-overridden fields; the RPC refuses
 * approved, sent, accepted, declined, locked and superseded documents.
 */
export const applyKnowledgeBasePricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applyKnowledgePricingSchema.parse(d))
  .handler(async ({ data, context }): Promise<{
    priced: number; unmatched: number; isSampleData: boolean;
  }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const est = await loadEstimate(sb, data.estimateId, org);
    const pricing = await buildProjectPricing(sb, est.project_id as string, org);
    const { data: res, error } = await sb.rpc("apply_knowledge_base_pricing", {
      _estimate_id: data.estimateId,
      _pricing: pricing,
    });
    if (error) throw new Error(msg(error, "Failed to apply pricing"));
    /* Prefer live material pricing when a provider is configured; inert otherwise. */
    const { applyLiveMaterialPricing } = await import("./liveMaterialPricing.server");
    await applyLiveMaterialPricing(sb, org, data.estimateId);
    const row = (res ?? {}) as { priced?: number; unmatched?: number; isSampleData?: boolean };

    return {
      priced: Number(row.priced ?? 0),
      unmatched: Number(row.unmatched ?? 0),
      isSampleData: row.isSampleData !== false,
    };
  });

/* ================= LINE ITEMS ================= */

export const createEstimateLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createLineSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateLineDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const est = await loadEstimate(sb, data.estimateId, org);
    if (est.status === "approved") throw new Error("estimate_locked");

    const { data: last } = await sb.from("estimate_line_items")
      .select("sort_order").eq("estimate_id", data.estimateId)
      .order("sort_order", { ascending: false }).limit(1);
    const nextSort = Number((last as Array<{ sort_order: number }> | null)?.[0]?.sort_order ?? -1) + 1;

    const { data: row, error } = await sb.from("estimate_line_items").insert({
      organization_id: org,
      project_id: est.project_id,
      estimate_id: data.estimateId,
      description: data.description,
      group_label: data.groupLabel ?? null,
      category_key: data.categoryKey ?? null,
      subcategory_key: data.subcategoryKey ?? null,
      trade_key: data.tradeKey ?? null,
      quantity: data.quantity ?? 1,
      unit_key: data.unitKey ?? null,
      labor_rate: Number(est.default_labor_rate ?? 0),
      overhead_pct: Number(est.default_overhead_pct ?? 0),
      profit_pct: Number(est.default_profit_pct ?? 0),
      contingency_pct: Number(est.default_contingency_pct ?? 0),
      sort_order: nextSort,
      created_by: context.userId,
      /* Hand-added lines are contractor authority on both existence and number. */
      ...originStamp("contractor"),
      quantity_basis: "contractor_entered",
      quantity_basis_note: "Added manually on the estimate",
    }).select("*").single();
    if (error) throw new Error(msg(error, "Failed to add line"));
    const mapped = mapLine(row as Record<string, unknown>);
    await audit(sb, est as any, data.estimateId, "created", "estimate_line_item", mapped.id,
      mapped.description);
    await refreshCanonicalBandAfterLineChange(sb, data.estimateId, org);
    return mapped;
  });

export const updateEstimateLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateLineSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateLineDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const existing = await loadLine(sb, data.lineId, org);
    const est = await loadEstimate(sb, existing.estimate_id as string, org);
    if (est.status === "approved") throw new Error("estimate_locked");

    const map: Record<string, string> = {
      description: "description", groupLabel: "group_label", categoryKey: "category_key",
      subcategoryKey: "subcategory_key", tradeKey: "trade_key", quantity: "quantity",
      unitKey: "unit_key", laborHours: "labor_hours", laborRate: "labor_rate",
      materialCost: "material_cost", equipmentCost: "equipment_cost",
      subcontractorCost: "subcontractor_cost", otherCost: "other_cost",
      overheadPct: "overhead_pct", profitPct: "profit_pct", contingencyPct: "contingency_pct",
      isTaxable: "is_taxable", isClientVisible: "is_client_visible", internalNotes: "internal_notes",
    };
    const patch: Record<string, unknown> = {};
    for (const [key, column] of Object.entries(map)) {
      const value = (data as Record<string, unknown>)[key];
      if (value !== undefined) patch[column] = value;
    }
    if (Object.keys(patch).length === 0) return mapLine(existing);

    const { data: row, error } = await sb.from("estimate_line_items").update(patch)
      .eq("id", data.lineId).eq("organization_id", org).select("*").single();
    if (error) throw new Error(msg(error, "Failed to update line"));
    const mapped = mapLine(row as Record<string, unknown>);
    await audit(sb, est as any, mapped.estimateId, "updated", "estimate_line_item", mapped.id,
      mapped.description, { fields: Object.keys(patch) });
    await refreshCanonicalBandAfterLineChange(sb, mapped.estimateId, org);
    return mapped;
  });

export const archiveEstimateLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => archiveLineSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const existing = await loadLine(sb, data.lineId, org);
    const est = await loadEstimate(sb, existing.estimate_id as string, org);
    if (est.status === "approved") throw new Error("estimate_locked");
    const { error } = await sb.from("estimate_line_items")
      .update({ archived_at: data.archived ? new Date().toISOString() : null })
      .eq("id", data.lineId).eq("organization_id", org);
    if (error) throw new Error(msg(error, "Failed to remove line"));
    await audit(sb, est as any, existing.estimate_id as string,
      data.archived ? "archived" : "restored", "estimate_line_item", data.lineId,
      String(existing.description ?? ""));
    await refreshCanonicalBandAfterLineChange(sb, existing.estimate_id as string, org);
    return { ok: true };
  });

/* ====== UNMATCHED LINE PRICING & QUANTITY COMPLETION (Phase 1) ====== */

/**
 * Explicit contractor confirmation of a Knowledge Base item for one line.
 *
 * The mapping is persisted as a trusted `catalog_item_key` with
 * `catalog_mapping_source = 'contractor'`, so future automatic repricing
 * treats it as an exact match instead of re-guessing. All guards (editable
 * document, active organization, unit compatibility) live in the RPC.
 */
export const confirmLineCatalogItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => confirmLineCatalogSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateLineDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const existing = await loadLine(sb, data.lineId, org);
    const pricing = await buildProjectPricing(sb, existing.project_id as string, org);

    const { error } = await sb.rpc("confirm_estimate_line_catalog", {
      _line_id: data.lineId,
      _assembly_key: data.assemblyKey,
      _quantity: data.quantity ?? null,
      _unit_key: data.unitKey ?? null,
      _description: data.description ?? null,
      _pricing: pricing,
    });
    if (error) throw new Error(msg(error, "Failed to apply library item"));
    return mapLine(await loadLine(sb, data.lineId, org));
  });

/**
 * Apply a recognized composite assembly (e.g. platform floor) to one line.
 *
 * Component assembly keys are resolved directly by the RPC against the
 * effective organization/library records — the contractor never has to search.
 * The first component is priced onto the original line (preserving its scope
 * link, audit trail and attachments); every further component becomes a linked
 * sibling line carrying durable composite provenance.
 */
export const applyCompositeAssemblyToLine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applyCompositeSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateLineDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const existing = await loadLine(sb, data.lineId, org);
    const pricing = await buildProjectPricing(sb, existing.project_id as string, org);

    const { error } = await sb.rpc("apply_composite_assembly", {
      _line_id: data.lineId,
      _composite_key: data.compositeKey,
      _components: data.components,
      _quantity: data.quantity,
      _unit_key: data.unitKey ?? null,
      _description: data.description ?? null,
      _pricing: pricing,
    });
    if (error) throw new Error(msg(error, "Failed to apply assembly"));
    return mapLine(await loadLine(sb, data.lineId, org));
  });

/**
 * Contractor-entered pricing. Sets `is_price_overridden`, which permanently

 * excludes the line from automatic repricing.
 */
export const setLineManualPricing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => manualLinePricingSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateLineDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { error } = await sb.rpc("set_estimate_line_manual_pricing", {
      _line_id: data.lineId,
      _quantity: data.quantity ?? null,
      _unit_key: data.unitKey ?? null,
      _description: data.description ?? null,
      _labor_hours: data.laborHours ?? null,
      _labor_rate: data.laborRate ?? null,
      _material_cost: data.materialCost ?? null,
      _equipment_cost: data.equipmentCost ?? null,
      _subcontractor_cost: data.subcontractorCost ?? null,
      _other_cost: data.otherCost ?? null,
    });
    if (error) throw new Error(msg(error, "Failed to save pricing"));
    return mapLine(await loadLine(sb, data.lineId, org));
  });

/** Confirm a placeholder quantity (and optionally unit/description) as reviewed. */
export const reviewLineQuantity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewLineQuantitySchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateLineDTO> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    const { error } = await sb.rpc("review_estimate_line_quantity", {
      _line_id: data.lineId,
      _quantity: data.quantity ?? null,
      _unit_key: data.unitKey ?? null,
      _description: data.description ?? null,
    });
    if (error) throw new Error(msg(error, "Failed to save quantity"));
    return mapLine(await loadLine(sb, data.lineId, org));
  });

/* ================= AUDIT ================= */

export const listEstimateAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listAuditSchema.parse(d))
  .handler(async ({ data, context }): Promise<EstimateAuditEventDTO[]> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    await loadEstimate(sb, data.estimateId, org);
    const { data: rows, error } = await sb.from("estimate_audit_events").select("*")
      .eq("organization_id", org).eq("estimate_id", data.estimateId)
      .order("created_at", { ascending: false }).limit(data.limit ?? 50);
    if (error) throw new Error(msg(error, "Failed to load history"));
    return ((rows as Record<string, unknown>[]) ?? []).map(mapAuditEvent);
  });

/* ================= LABOR-HOUR INTEGRITY ================= */

/**
 * A per-unit production rate is not a total. This audits every active line in
 * the workspace (or one estimate) and repairs ONLY the lines whose own pricing
 * evidence proves the quantity was never applied. Contractor-entered hours are
 * preserved untouched; merely suspicious lines are flagged for review.
 */
export const repairLaborHours = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => repairLaborHoursSchema.parse(d))
  .handler(async ({ data, context }): Promise<LaborHoursRepairReport> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    if (data.estimateId) await loadEstimate(sb, data.estimateId, org);

    const { data: rows, error } = await sb.rpc("repair_labor_hours", {
      _estimate_id: data.estimateId ?? null,
      _dry_run: data.dryRun ?? false,
    });
    if (error) throw new Error(msg(error, "Failed to audit labor hours"));

    const entries = ((rows as Record<string, unknown>[]) ?? []).map((r) => ({
      lineId: String(r.line_id),
      estimateId: String(r.estimate_id),
      description: (r.description as string | null) ?? "",
      quantity: Number(r.quantity ?? 0),
      oldHours: Number(r.old_hours ?? 0),
      newHours: Number(r.new_hours ?? 0),
      hoursPerUnit: r.hours_per_unit == null ? null : Number(r.hours_per_unit),
      action: String(r.action) as LaborHoursRepairEntry["action"],
      reason: (r.reason as string | null) ?? "",
    }));

    const count = (a: LaborHoursRepairEntry["action"]) =>
      entries.filter((e) => e.action === a).length;

    return {
      dryRun: data.dryRun ?? false,
      entries,
      repaired: count("repaired"),
      flagged: count("flagged"),
      preserved: count("preserved"),
    };
  });

/* ================= COST-BASIS / UNIT / PLAUSIBILITY AUDIT ================= */

export interface CostBasisAuditEntry {
  lineId: string;
  estimateId: string;
  description: string;
  basis: string;
  codes: string[];
  action: "repaired" | "flagged" | "preserved";
  note: string | null;
}

export interface CostBasisAuditReport {
  dryRun: boolean;
  scanned: number;
  repaired: number;
  flagged: number;
  preserved: number;
  byCode: Record<string, number>;
  entries: CostBasisAuditEntry[];
}

/**
 * Universal legacy repair path. Every active line is classified by cost basis,
 * checked for unit legality and assessed for labor plausibility. A line is
 * REWRITTEN only when the defect is mechanically provable (a fee priced in
 * hours, a per-unit rate stored as a total, an illegal fee unit) and the value
 * is not contractor-owned. Everything else is reported, never touched.
 */
export const auditCostBasis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => auditCostBasisSchema.parse(d))
  .handler(async ({ data, context }): Promise<CostBasisAuditReport> => {
    const sb = context.supabase as unknown as SB;
    const org = await resolveOrg(sb);
    if (data.estimateId) await loadEstimate(sb, data.estimateId, org);
    const dryRun = data.dryRun ?? true;

    let query = sb.from("estimate_line_items")
      .select(
        "id,estimate_id,description,quantity,unit_key,trade_key,category_key,labor_hours,labor_rate," +
          "material_cost,equipment_cost,subcontractor_cost,other_cost,pricing_source,is_price_overridden,pricing_provenance",
      )
      .eq("organization_id", org)
      .is("archived_at", null);
    if (data.estimateId) query = query.eq("estimate_id", data.estimateId);

    const { data: rows, error } = await query.limit(5000);
    if (error) throw new Error(msg(error, "Failed to audit estimate lines"));

    const lines = ((rows as Record<string, unknown>[]) ?? []).map((r) => {
      const prov = (r.pricing_provenance as Record<string, unknown> | null) ?? {};
      return {
        raw: r,
        line: {
          id: String(r.id),
          description: (r.description as string | null) ?? "",
          quantity: Number(r.quantity ?? 0),
          unitKey: (r.unit_key as string | null) ?? null,
          tradeKey: (r.trade_key as string | null) ?? null,
          categoryKey: (r.category_key as string | null) ?? null,
          laborHours: Number(r.labor_hours ?? 0),
          laborRate: Number(r.labor_rate ?? 0),
          materialCost: Number(r.material_cost ?? 0),
          equipmentCost: Number(r.equipment_cost ?? 0),
          subcontractorCost: Number(r.subcontractor_cost ?? 0),
          otherCost: Number(r.other_cost ?? 0),
          catalogHoursPerUnit:
            prov.laborHoursPerUnit == null ? null : Number(prov.laborHoursPerUnit),
          computedLaborHours:
            prov.computedLaborHours == null ? null : Number(prov.computedLaborHours),
          pricingSource: (r.pricing_source as string | null) ?? null,
          isContractorOwned:
            r.pricing_source === "contractor" || r.is_price_overridden === true,
        },
      };
    });

    const summary = auditEstimateLines(lines.map((l) => l.line));
    const entries: CostBasisAuditEntry[] = [];
    let repaired = 0;
    let flagged = 0;
    let preserved = 0;

    for (let i = 0; i < summary.results.length; i += 1) {
      const result = summary.results[i]!;
      const source = lines[i]!;
      if (result.findings.length === 0) continue;

      const contractorOwned = source.line.isContractorOwned;
      const action: CostBasisAuditEntry["action"] = contractorOwned
        ? "preserved"
        : result.repair
          ? "repaired"
          : "flagged";

      if (action === "repaired" && !dryRun && result.repair) {
        const patch: Record<string, unknown> = {};
        if (result.repair.patch.laborHours != null) patch.labor_hours = result.repair.patch.laborHours;
        if (result.repair.patch.unitKey) patch.unit_key = result.repair.patch.unitKey;
        if (result.repair.patch.otherCost != null) patch.other_cost = result.repair.patch.otherCost;
        patch.pricing_provenance = {
          ...((source.raw.pricing_provenance as Record<string, unknown> | null) ?? {}),
          costBasis: result.basis,
          costBasisRepair: { reason: result.repair.reason, note: result.repair.note, at: new Date().toISOString() },
        };
        const { error: upErr } = await sb.from("estimate_line_items")
          .update(patch)
          .eq("id", source.line.id)
          .eq("organization_id", org);
        if (upErr) throw new Error(msg(upErr, "Failed to repair estimate line"));
      }

      if (action === "repaired") repaired += 1;
      else if (action === "flagged") flagged += 1;
      else preserved += 1;

      entries.push({
        lineId: source.line.id,
        estimateId: String(source.raw.estimate_id),
        description: source.line.description,
        basis: result.basis,
        codes: result.findings.map((f) => f.code),
        action,
        note: result.repair?.note ?? null,
      });
    }

    return {
      dryRun,
      scanned: summary.totalLines,
      repaired,
      flagged,
      preserved,
      byCode: summary.byCode as unknown as Record<string, number>,
      entries,
    };
  });
