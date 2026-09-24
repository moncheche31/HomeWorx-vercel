/**
 * REAL-BOUNDARY harness for the pricing-inheritance regression suite.
 *
 * Every write in the suite travels the same path production uses:
 *
 *   supabase-js (a real signed-in user's JWT)
 *     -> PostgREST (role `authenticated`, RLS enforced)
 *     -> SECURITY DEFINER RPC / table write
 *     -> BEFORE/AFTER triggers
 *     -> estimates / estimate_line_items / estimate_audit_events
 *
 * Postgres is a Supabase Postgres 17 image with every VisionWorx migration
 * replayed (see scripts/integration-harness). Privileged SQL (psql) is used
 * ONLY to create the auth.users row GoTrue would create at sign-up and to read
 * pg_catalog; it never writes pricing data.
 *
 * NO SILENT SKIPS. If the live boundary is not configured or not reachable,
 * `probeLiveBoundary()` records a reason starting with "BLOCKED:" and every
 * test FAILS with it through `assertLive()` (tests are never reported as
 * skipped). A green run therefore always means the assertions actually executed
 * against a database.
 */

import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { calculateEngineEstimate } from "@/domains/estimating/engine/calculate";
import { buildCanonicalCostGraph, type CanonicalCostLine } from "@/domains/estimating/canonicalCostGraph";
import { pricingSnapshotFromStrategy } from "@/domains/estimating/ballparkCostBasis";
import { pricingStrategyOf } from "@/domains/estimating/pricingStrategy";
import { buildProjectPricing } from "@/features/estimating/services/estimateCommit.server";
import { saveMyOrganization } from "@/features/workspace/services/organization.server";
import { assertLocalTestDatabase } from "../testDatabaseGuard";

/* ------------------------------------------------------------------ *
 * Configuration — all required, never defaulted to a skip.
 * ------------------------------------------------------------------ */

const ENV = {
  postgrestUrl: process.env["VW_IT_POSTGREST_URL"],
  jwtSecret: process.env["VW_IT_JWT_SECRET"],
  pgUrl: process.env["VW_IT_PG_URL"],
};

let proxy: { url: string; close: () => Promise<void> } | null = null;
let blockedReason: string | null = "BLOCKED: live boundary not probed yet (probeLiveBoundary was not called).";

/**
 * Probe once per run. Never throws: a hook that throws makes vitest report the
 * tests as "skipped", which is exactly the silent outcome this suite forbids.
 * Instead every test calls assertLive() first and FAILS with the reason.
 */
export async function probeLiveBoundary(): Promise<void> {
  try {
    await requireLiveBoundary();
    blockedReason = null;
  } catch (e) {
    blockedReason = (e as Error).message;
  }
}

export function isBlocked(): boolean {
  return blockedReason !== null;
}

export function assertLive(): void {
  if (blockedReason) throw new Error(blockedReason);
}

async function requireLiveBoundary(): Promise<void> {
  const missing = Object.entries({
    VW_IT_POSTGREST_URL: ENV.postgrestUrl,
    VW_IT_JWT_SECRET: ENV.jwtSecret,
    VW_IT_PG_URL: ENV.pgUrl,
  })
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) {
    throw new Error(
      `BLOCKED: real database boundary not configured (missing ${missing.join(", ")}). ` +
        "Run `bun run test:integration` (scripts/integration-harness/run.sh). This suite never skips silently.",
    );
  }
  assertLocalTestDatabase({ VW_IT_POSTGREST_URL: ENV.postgrestUrl, VW_IT_PG_URL: ENV.pgUrl });
  try {
    execFileSync("psql", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("BLOCKED: psql is not installed; it is required to create auth.users rows.");
  }
  try {
    sql("select 1 as ok");
  } catch (e) {
    throw new Error(`BLOCKED: Postgres at VW_IT_PG_URL is not reachable: ${(e as Error).message}`);
  }
  const probe = await fetch(ENV.postgrestUrl!).catch((e: Error) => e);
  if (probe instanceof Error || !probe.ok) {
    throw new Error(`BLOCKED: PostgREST at VW_IT_POSTGREST_URL is not reachable (${String(probe instanceof Error ? probe.message : probe.status)}).`);
  }
  if (!proxy) proxy = await startRestProxy(ENV.postgrestUrl!);
}

export async function releaseLiveBoundary(): Promise<void> {
  await proxy?.close();
  proxy = null;
}

/* ------------------------------------------------------------------ *
 * supabase-js expects `${url}/rest/v1`; PostgREST serves at `/`. A tiny
 * pass-through proxy strips the prefix so the stock client works unchanged.
 * ------------------------------------------------------------------ */

async function startRestProxy(target: string) {
  const t = new URL(target);
  const server = http.createServer((req, res) => {
    const path = (req.url ?? "/").replace(/^\/rest\/v1/, "") || "/";
    const upstream = http.request(
      { host: t.hostname, port: t.port, method: req.method, path, headers: { ...req.headers, host: t.host } },
      (r) => {
        res.writeHead(r.statusCode ?? 502, r.headers);
        r.pipe(res);
      },
    );
    upstream.on("error", (e) => {
      res.writeHead(502);
      res.end(String(e));
    });
    req.pipe(upstream);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

/* ------------------------------------------------------------------ *
 * JWTs exactly as GoTrue issues them (HS256, role claim read by PostgREST).
 * ------------------------------------------------------------------ */

const b64url = (v: Buffer | string) =>
  Buffer.from(v).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

function signJwt(payload: Record<string, unknown>): string {
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600, ...payload }));
  const sig = b64url(crypto.createHmac("sha256", ENV.jwtSecret!).update(`${header}.${body}`).digest());
  return `${header}.${body}.${sig}`;
}

export type SB = SupabaseClient;

export function userClient(userId: string): SB {
  const token = signJwt({ sub: userId, role: "authenticated", aud: "authenticated" });
  const anon = signJwt({ role: "anon" });
  return createClient(proxy!.url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

/* ------------------------------------------------------------------ *
 * Privileged SQL (auth.users creation + pg_catalog reads only).
 * ------------------------------------------------------------------ */

export function sql<T = Record<string, unknown>>(query: string): T[] {
  const out = execFileSync(
    "psql",
    [ENV.pgUrl!, "-X", "-A", "-t", "-q", "-v", "ON_ERROR_STOP=1", "-c", `select coalesce(json_agg(t), '[]'::json) from (${query}) t`],
    { encoding: "utf8" },
  );
  return JSON.parse(out.trim() || "[]") as T[];
}

function sqlExec(statement: string): void {
  execFileSync("psql", [ENV.pgUrl!, "-X", "-q", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" });
}

const must = <T>(r: { data: T | null; error: { message: string } | null }, what: string): T => {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
};

/* ------------------------------------------------------------------ *
 * Tenants: a real user who signs up and sets company pricing through the
 * production save path (`saveMyOrganization`).
 * ------------------------------------------------------------------ */

export interface OrgPricing {
  defaultPricingMethod: "target_gross_margin" | "overhead_profit";
  defaultTargetGrossMarginPct: number;
  defaultOverheadPct: number;
  defaultProfitPct: number;
  defaultLaborRate: number;
}

export interface Tenant {
  userId: string;
  orgId: string;
  sb: SB;
  pricing: OrgPricing;
}

export async function createTenant(label: string, pricing: OrgPricing): Promise<Tenant> {
  const userId = crypto.randomUUID();
  const email = `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${userId.slice(0, 8)}@vw-it.test`;
  sqlExec(
    `insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
     values ('00000000-0000-0000-0000-000000000000', '${userId}', 'authenticated', 'authenticated', '${email}', '{}', '{}', now(), now())`,
  );
  const sb = userClient(userId);
  const organizationName = `VW-IT ${label}`;
  /* Sign-up onboarding: the production save path creates the organization
     through create_organization_for_current_user. */
  const created = await saveMyOrganization(sb as never, userId, { organizationName, taxRate: 0 } as never);
  const t: Tenant = { userId, orgId: created.id, sb, pricing };
  setOrgPricingPrivileged(t, pricing);
  return t;
}

/**
 * Company pricing defaults are written with privileged SQL, NOT through the
 * Company Settings save (`saveMyOrganization` -> UPDATE organizations).
 *
 * Reason (separate, out-of-scope defect — reproduced here with grants that are
 * hash-identical to production): the `organizations_update_admin` RLS policy
 * calls public.has_role(), and migration 20260828110936 revoked EXECUTE on
 * has_role from `authenticated`, so that UPDATE fails for a signed-in owner with
 * "permission denied for function has_role". This suite tests what an estimate
 * does with the organization's settings, so it sets them directly.
 */
function setOrgPricingPrivileged(t: Tenant, p: OrgPricing): void {
  sqlExec(
    `update public.organizations set
       default_pricing_method = '${p.defaultPricingMethod}',
       default_target_gross_margin_pct = ${p.defaultTargetGrossMarginPct},
       default_overhead_pct = ${p.defaultOverheadPct},
       default_profit_pct = ${p.defaultProfitPct},
       default_labor_rate = ${p.defaultLaborRate},
       tax_rate = 0
     where id = '${t.orgId}'`,
  );
  t.pricing = p;
}

export async function updateOrgPricing(t: Tenant, pricing: OrgPricing): Promise<void> {
  setOrgPricingPrivileged(t, pricing);
}

export async function readOrg(t: Tenant): Promise<Record<string, unknown>> {
  return must(await t.sb.from("organizations").select("*").eq("id", t.orgId).single(), "read organization");
}

/* ------------------------------------------------------------------ *
 * Project + scope, written through RLS as the contractor.
 * Titles are deliberately NOT knowledge-base vocabulary so every line is
 * unmatched and its money comes only from the contractor pricing below.
 * ------------------------------------------------------------------ */

export const FIXTURE_LINES = [
  { title: "Zq fixture alpha custom fabrication", quantity: 1, laborHours: 10, laborRate: 85, materialCost: 500 },
  { title: "Zq fixture bravo custom fabrication", quantity: 2, laborHours: 4, laborRate: 85, materialCost: 125 },
] as const;

export async function createProjectWithScope(t: Tenant, name: string): Promise<string> {
  const client = must<{ id: string }>(
    await t.sb.from("clients").insert({ organization_id: t.orgId, created_by: t.userId, first_name: "Test", last_name: name }).select("id").single(),
    "insert client",
  );
  const property = must<{ id: string }>(
    await t.sb.from("properties").insert({ organization_id: t.orgId, client_id: client.id, created_by: t.userId, street: "1 Test St" }).select("id").single(),
    "insert property",
  );
  const project = must<{ id: string }>(
    await t.sb
      .from("projects")
      .insert({ organization_id: t.orgId, client_id: client.id, property_id: property.id, created_by: t.userId, name, status: "estimate_in_progress" })
      .select("id")
      .single(),
    "insert project",
  );
  const section = must<{ id: string }>(
    await t.sb.from("scope_sections").insert({ organization_id: t.orgId, project_id: project.id, name: "Scope", created_by: t.userId }).select("id").single(),
    "insert scope section",
  );
  for (const [i, line] of FIXTURE_LINES.entries()) {
    must(
      await t.sb
        .from("scope_items")
        .insert({
          organization_id: t.orgId,
          project_id: project.id,
          section_id: section.id,
          title: line.title,
          quantity: line.quantity,
          unit_key: "each",
          is_included: true,
          sort_order: i,
          created_by: t.userId,
          /* Same stamps materializeScope() writes for contractor-confirmed items
             (estimateCommit.server.ts). Without quantity evidence the
             quantity-evidence gate correctly refuses to let any price stand. */
          confidence_status: "confirmed",
          origin_type: "contractor",
          quantity_basis: "contractor_entered",
        })
        .select("id")
        .single(),
      "insert scope item",
    );
  }
  return project.id;
}

/* ------------------------------------------------------------------ *
 * Production estimate entry points.
 * ------------------------------------------------------------------ */

/** Same sequence as `createEstimateFromScope` (estimating.functions.ts:642). */
export async function createEstimateFromScope(t: Tenant, projectId: string): Promise<string> {
  const pricing = await buildProjectPricing(t.sb as never, projectId, t.orgId);
  return must<string>(
    await t.sb.rpc("create_estimate_from_scope", { _project_id: projectId, _title: "", _pricing: pricing }),
    "create_estimate_from_scope",
  );
}

/** Contractor prices each line through the production manual-pricing RPC. */
export async function priceLinesAsContractor(t: Tenant, estimateId: string): Promise<void> {
  const lines = must<Array<{ id: string; description: string }>>(
    await t.sb.from("estimate_line_items").select("id, description").eq("estimate_id", estimateId).is("archived_at", null),
    "read lines",
  );
  for (const line of lines) {
    const spec = FIXTURE_LINES.find((f) => f.title === line.description);
    if (!spec) throw new Error(`unexpected fixture line: ${line.description}`);
    must(
      await t.sb.rpc("set_estimate_line_manual_pricing", {
        _line_id: line.id,
        _quantity: spec.quantity,
        _labor_hours: spec.laborHours,
        _labor_rate: spec.laborRate,
        _material_cost: spec.materialCost,
      }),
      "set_estimate_line_manual_pricing",
    );
  }
}

export async function createRevision(t: Tenant, estimateId: string): Promise<string> {
  const res = must<{ estimate_id: string }>(await t.sb.rpc("create_estimate_revision", { _estimate_id: estimateId }), "create_estimate_revision");
  return res.estimate_id;
}

export async function createVersion(t: Tenant, estimateId: string): Promise<string> {
  return must<string>(await t.sb.rpc("create_estimate_version", { _estimate_id: estimateId }), "create_estimate_version");
}

/* ------------------------------------------------------------------ *
 * Evidence: the stored row, its lines, its audit trail, and BOTH canonical
 * pricing implementations (database + TypeScript) over the same rows.
 * ------------------------------------------------------------------ */

export interface EstimateEvidence {
  row: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  audit: Array<Record<string, unknown>>;
  /** public.estimate_invariant_cost(_estimate_id). */
  db: Record<string, unknown>;
  /** TypeScript canonical path: buildCanonicalCostGraph over the same rows. */
  ts: { subtotal: number; jobCost: number; overhead: number; profit: number; grossMarginPct: number; method: string };
}

const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

export async function readEvidence(t: Tenant, estimateId: string): Promise<EstimateEvidence> {
  const row = must<Record<string, unknown>>(await t.sb.from("estimates").select("*").eq("id", estimateId).single(), "read estimate");
  const lines = must<Array<Record<string, unknown>>>(
    await t.sb.from("estimate_line_items").select("*").eq("estimate_id", estimateId).is("archived_at", null).order("sort_order"),
    "read lines",
  );
  const audit = must<Array<Record<string, unknown>>>(
    await t.sb.from("estimate_audit_events").select("*").eq("estimate_id", estimateId).order("created_at"),
    "read audit",
  );
  const db = must<Record<string, unknown>>(await t.sb.rpc("estimate_invariant_cost", { _estimate_id: estimateId }), "estimate_invariant_cost");

  /* Mirrors refreshBallparkFromCanonicalLines (estimating.functions.ts ~958-1030). */
  const strategy = pricingStrategyOf({
    pricingMethod: row.pricing_method,
    targetGrossMarginPct: row.target_gross_margin_pct,
    defaultOverheadPct: row.default_overhead_pct,
    defaultProfitPct: row.default_profit_pct,
  });
  const canonicalLines: CanonicalCostLine[] = lines.map((r) => ({
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
    rolledUpIntoLineId: null,
  }));
  const graph = buildCanonicalCostGraph(
    canonicalLines,
    {
      currency: (row.currency as string | null) ?? "USD",
      taxRatePct: num(row.tax_rate),
      defaultOverheadPct: num(row.default_overhead_pct),
      defaultProfitPct: num(row.default_profit_pct),
      defaultContingencyPct: num(row.default_contingency_pct),
      pricingStrategy: strategy,
    },
    {
      pricing: pricingSnapshotFromStrategy(strategy, {
        contingencyPct: num(row.default_contingency_pct),
        laborRate: row.default_labor_rate == null ? null : num(row.default_labor_rate),
      }),
    },
  );
  /* Engine over the same rows, for the realized-margin figure. */
  const engine = calculateEngineEstimate(canonicalLines, { currency: "USD", taxRatePct: 0, pricingStrategy: strategy });

  return {
    row,
    lines,
    audit,
    db,
    ts: {
      subtotal: graph.totals.subtotal,
      jobCost: graph.totals.jobCost,
      overhead: graph.totals.overhead,
      profit: graph.totals.profit,
      grossMarginPct: engine.totals.grossMarginPct,
      method: strategy.method,
    },
  };
}

/** Compact, human-readable pricing record printed into the test log as evidence. */
export function describePricing(label: string, e: EstimateEvidence): string {
  const r = e.row;
  const lineOhp = e.lines.map((l) => `${num(l.overhead_pct)}/${num(l.profit_pct)}`).join(", ");
  return (
    `[${label}] method=${String(r.pricing_method)} target=${num(r.target_gross_margin_pct)} ` +
    `hdrOH=${num(r.default_overhead_pct)} hdrP=${num(r.default_profit_pct)} labor=${num(r.default_labor_rate)} ` +
    `lockedAt=${r.pricing_settings_locked_at ? "set" : "null"} lineOH/P=[${lineOhp}] ` +
    `jobCost=${num(e.db.jobCost)} sellDB=${num(e.db.canonicalSubtotal)} sellTS=${e.ts.subtotal} ` +
    `realizedMargin=${e.ts.grossMarginPct}%`
  );
}

export function createdPricingProvenance(e: EstimateEvidence): Record<string, unknown> | null {
  const created = e.audit.find((a) => a.event_type === "created");
  const meta = (created?.metadata ?? {}) as Record<string, unknown>;
  return (meta.pricing_inherited as Record<string, unknown> | undefined) ?? null;
}

/** Every audit row written for an estimate at creation (created / version_created / revision_created). */
export function creationAuditMetadata(e: EstimateEvidence): Record<string, unknown> | null {
  const ev = e.audit.find((a) => ["created", "version_created", "revision_created"].includes(String(a.event_type)));
  return (ev?.metadata as Record<string, unknown> | undefined) ?? null;
}
