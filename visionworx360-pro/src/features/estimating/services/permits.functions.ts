import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { resolvePermitPlan } from "@/domains/permits/resolve";
import type { PermitPlan } from "@/domains/permits/types";
import { applyPermitPlanSchema, permitPlanRequestSchema } from "./permits.schemas";
import {
  permitTypeFromDescription,
  prePermitValuationBase,
  toContractorEntries,
  toJurisdiction,
  toPermitRule,
  toScopeSignals,
  type PermitLineRow,
  type PermitRuleRow,
} from "./permits.server";

interface PropertyRow {
  city: string | null;
  region: string | null;
  county: string | null;
  postal_code: string | null;
  square_footage: number | null;
}

type SB = {
  from: (t: string) => any;
  rpc: (name: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
};

const LINE_COLUMNS =
  "id, description, trade_key, quantity, unit_key, cost_basis, other_cost, direct_cost, is_price_overridden, archived_at";

async function loadContext(sb: SB, orgId: string, projectId: string, estimateId: string) {
  const { data: estimate } = await sb
    .from("estimates")
    .select("id, project_id, intake_mode, locked_at, archived_at")
    .eq("id", estimateId)
    .eq("project_id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!estimate) throw new Error("Estimate not found");

  const { data: project } = await sb
    .from("projects")
    .select("id, name, property_id, project_type")
    .eq("id", projectId)
    .eq("organization_id", orgId)
    .maybeSingle();

  let property: PropertyRow | null = null;
  const propertyId = (project as { property_id?: string | null } | null)?.property_id ?? null;
  if (propertyId) {
    const { data } = await sb
      .from("properties")
      .select("city, region, county, postal_code, square_footage")
      .eq("id", propertyId)
      .eq("organization_id", orgId)
      .maybeSingle();
    property = (data as PropertyRow | null) ?? null;
  }

  const { data: lineRows } = await sb
    .from("estimate_line_items")
    .select(LINE_COLUMNS)
    .eq("estimate_id", estimateId)
    .eq("organization_id", orgId)
    .is("archived_at", null);
  const lines = (lineRows ?? []) as PermitLineRow[];

  /* Jurisdiction rules for THIS org plus the shared national library. */
  const { data: ruleRows } = await sb
    .from("permit_fee_rules")
    .select(
      "id, jurisdiction_scope, city, county, state, postal_code, country_code, permit_type, work_class, calc_method, base_amount, min_amount, max_amount, rate, low_amount, high_amount, effective_date, library_version, source_type, source_title, source_url, confidence, bundles, notes",
    )
    .eq("is_active", true);
  const rules = ((ruleRows ?? []) as PermitRuleRow[])
    .map(toPermitRule)
    .filter((r): r is NonNullable<typeof r> => !!r);

  return { estimate, project, property, lines, rules };
}

export interface PermitPlanResult {
  plan: PermitPlan;
  /** Permit fee dollars currently on the estimate. */
  currentTotal: number;
  /** True when the contractor has locked at least one permit fee themselves. */
  hasContractorEntry: boolean;
  intakeMode: string;
  locked: boolean;
}

/** Resolve the permit plan for ONE project. Never reads another project. */
export const getProjectPermitPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => permitPlanRequestSchema.parse(d))
  .handler(async ({ data, context }): Promise<PermitPlanResult> => {
    const sb = context.supabase as unknown as SB;
    const { data: org, error } = await sb.rpc("current_active_organization_id");
    if (error || !org) throw new Error("No active organization");

    const ctx = await loadContext(sb, org as string, data.projectId, data.estimateId);
    const entries = toContractorEntries(ctx.lines, permitTypeFromDescription);
    const intakeMode = (ctx.estimate as { intake_mode: string }).intake_mode;

    const plan = resolvePermitPlan({
      signals: toScopeSignals(ctx.lines),
      projectClass: projectClassHint(ctx.project),
      jurisdiction: toJurisdiction(ctx.property),
      rules: ctx.rules,
      contractorEntries: entries,
      /* Ballpark prices `possible` permits as a labeled allowance so the range
         is never $0; detailed estimating only prices likely permits. */
      includePossible: intakeMode === "ballpark",
      valuationBase: prePermitValuationBase(ctx.lines),
      squareFeet: ctx.property?.square_footage ?? null,
    });

    const currentTotal = ctx.lines
      .filter((l) => l.cost_basis === "permit_fee")
      .reduce((sum, l) => sum + Math.round(Number(l.other_cost ?? 0)), 0);

    return {
      plan,
      currentTotal,
      hasContractorEntry: entries.length > 0,
      intakeMode,
      locked: !!(ctx.estimate as { locked_at: string | null }).locked_at,
    };
  });

/**
 * Write the resolved plan onto the estimate as permit FEE lines.
 *
 * Contractor-entered permit fees are left untouched; only system-generated
 * permit lines are replaced. Every written line carries zero labor hours and a
 * whole-dollar fee.
 */
export const applyProjectPermitPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => applyPermitPlanSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ written: number; total: number }> => {
    const sb = context.supabase as unknown as SB;
    const { data: org, error } = await sb.rpc("current_active_organization_id");
    if (error || !org) throw new Error("No active organization");

    const ctx = await loadContext(sb, org as string, data.projectId, data.estimateId);
    if ((ctx.estimate as { locked_at: string | null }).locked_at) throw new Error("estimate_locked");

    const entries = toContractorEntries(ctx.lines, permitTypeFromDescription);
    const intakeMode = (ctx.estimate as { intake_mode: string }).intake_mode;
    const plan = resolvePermitPlan({
      signals: toScopeSignals(ctx.lines),
      projectClass: projectClassHint(ctx.project),
      jurisdiction: toJurisdiction(ctx.property),
      rules: ctx.rules,
      contractorEntries: entries,
      includePossible: intakeMode === "ballpark",
      valuationBase: prePermitValuationBase(ctx.lines),
      squareFeet: ctx.property?.square_footage ?? null,
    });

    /* Retire system-generated permit lines only. Overrides survive. */
    const stale = ctx.lines.filter(
      (l) => l.cost_basis === "permit_fee" && l.is_price_overridden !== true,
    );
    if (stale.length > 0) {
      await sb
        .from("estimate_line_items")
        .update({ archived_at: new Date().toISOString() })
        .in(
          "id",
          stale.map((l) => l.id),
        );
    }

    const inserts = plan.components
      .filter((c) => c.sourceType !== "contractor")
      .map((c, index) => ({
        organization_id: org,
        project_id: data.projectId,
        estimate_id: data.estimateId,
        description: permitLineLabel(c.permitType, c.needsLocalVerification),
        trade_key: "general_conditions",
        quantity: 1,
        unit_key: "each",
        labor_hours: 0,
        labor_rate: 0,
        material_cost: 0,
        equipment_cost: 0,
        subcontractor_cost: 0,
        other_cost: c.amount,
        cost_basis: "permit_fee",
        cost_basis_source: "permit_subsystem",
        quantity_basis: "fee_scope",
        quantity_basis_note: `${c.sourceTitle} (${c.sourceVersion})`,
        pricing_source: c.sourceType,
        pricing_provenance: {
          permitType: c.permitType,
          workClass: c.workClass,
          method: c.method,
          low: c.low,
          high: c.high,
          bundledTypes: c.bundledTypes,
          likelihood: c.likelihood,
          jurisdictionScope: c.jurisdictionScope,
          sourceTitle: c.sourceTitle,
          sourceUrl: c.sourceUrl,
          sourceVersion: c.sourceVersion,
          effectiveDate: c.effectiveDate,
          needsLocalVerification: c.needsLocalVerification,
        },
        priced_at: new Date().toISOString(),
        origin_type: "system",
        origin_ref: `permit:${c.permitType}`,
        sort_order: 9000 + index,
        created_by: context.userId,
      }));

    if (inserts.length > 0) {
      const { error: insertError } = await sb.from("estimate_line_items").insert(inserts);
      if (insertError) throw new Error(String((insertError as { message?: string }).message ?? insertError));
    }

    return { written: inserts.length, total: plan.total };
  });

function permitLineLabel(permitType: string, needsVerification: boolean): string {
  const name =
    permitType === "building"
      ? "Building permit"
      : permitType === "mechanical"
        ? "Mechanical / HVAC permit"
        : `${permitType.charAt(0).toUpperCase()}${permitType.slice(1)} permit`;
  return needsVerification ? `${name} allowance — verify local fee` : name;
}

/**
 * Class hint for the master building permit. The project TYPE plus its NAME are
 * both scope evidence for this project ("Master Suite Garage Conversion" is a
 * conversion) — no other project is ever read.
 */
function projectClassHint(project: unknown): string | null {
  const p = project as { name?: string | null; project_type?: string | null } | null;
  if (!p) return null;
  const hint = [p.project_type ?? "", p.name ?? ""].join(" ").trim();
  return hint.length > 0 ? hint : null;
}
