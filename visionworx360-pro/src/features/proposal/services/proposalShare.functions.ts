/**
 * Contractor-side and client-side entry points for proposal sharing.
 *
 * Contractor functions run through `requireSupabaseAuth` and are scoped by the
 * organization RLS policies. Client-portal functions are deliberately
 * unauthenticated — the share token *is* the credential — and therefore
 * validate the token hash first, then read only the single share row and its
 * frozen snapshot through the admin client. They never accept an organization,
 * project or share id from the browser.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  hashShareToken,
  resolveShareAccess,
  type ChangeRequestSelection,
  type ProposalChangeRequest,
  type ProposalShareSummary,
} from "@/domains/proposal/share";
import type { ProposalDocument } from "@/domains/proposal/types";

/* ----------------------------------------------------------- validation */

const createSchema = z.object({
  projectId: z.string().uuid(),
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/),
  recipientEmail: z.string().trim().email().max(320),
  recipientName: z.string().trim().max(200).optional(),
  subject: z.string().trim().max(300).optional(),
  message: z.string().trim().max(4000).optional(),
  locale: z.string().trim().max(16).default("en-US"),
  template: z.string().trim().max(64).optional(),
  estimateId: z.string().uuid().nullish(),
  document: z.record(z.string(), z.unknown()),
  mediaPaths: z.array(z.string().max(500)).max(200).default([]),
  logoPath: z.string().max(500).nullish(),
  expiresAt: z.string().max(40).nullish(),
});

const tokenSchema = z.object({ token: z.string().min(20).max(200) });

const assetSchema = tokenSchema.extend({ storagePath: z.string().min(1).max(500) });

const submitSchema = tokenSchema.extend({
  kind: z.enum(["change_request", "question"]).default("change_request"),
  message: z.string().trim().min(2).max(4000),
  selections: z
    .array(
      z.object({
        kind: z.enum(["investment_level", "upgrade"]),
        key: z.string().max(200),
        label: z.string().max(300),
      }),
    )
    .max(20)
    .default([]),
  requesterName: z.string().trim().max(200).optional(),
  requesterEmail: z.string().trim().email().max(320).optional(),
});

const dispositionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["reviewing", "applied", "declined"]),
  contractorNote: z.string().trim().max(4000).optional(),
});

/* -------------------------------------------------------------- mapping */

type ShareRow = Record<string, unknown>;

function mapShare(row: ShareRow): ProposalShareSummary {
  return {
    id: String(row["id"]),
    projectId: String(row["project_id"]),
    shareVersion: Number(row["share_version"] ?? 1),
    recipientEmail: String(row["recipient_email"] ?? ""),
    recipientName: (row["recipient_name"] as string | null) ?? null,
    subject: (row["subject"] as string | null) ?? null,
    message: (row["message"] as string | null) ?? null,
    status: (row["status"] as ProposalShareSummary["status"]) ?? "active",
    deliveryStatus: (row["delivery_status"] as ProposalShareSummary["deliveryStatus"]) ?? "link_ready",
    deliveryDetail: (row["delivery_detail"] as string | null) ?? null,
    sentAt: String(row["sent_at"] ?? ""),
    expiresAt: (row["expires_at"] as string | null) ?? null,
    revokedAt: (row["revoked_at"] as string | null) ?? null,
    lastViewedAt: (row["last_viewed_at"] as string | null) ?? null,
    viewCount: Number(row["view_count"] ?? 0),
  };
}

function mapChangeRequest(row: ShareRow): ProposalChangeRequest {
  return {
    id: String(row["id"]),
    projectId: String(row["project_id"]),
    shareId: String(row["share_id"]),
    shareVersion: Number(row["share_version"] ?? 1),
    kind: (row["kind"] as ProposalChangeRequest["kind"]) ?? "change_request",
    message: String(row["message"] ?? ""),
    selections: (row["selections"] as ChangeRequestSelection[] | null) ?? [],
    requesterName: (row["requester_name"] as string | null) ?? null,
    requesterEmail: (row["requester_email"] as string | null) ?? null,
    status: (row["status"] as ProposalChangeRequest["status"]) ?? "requested",
    contractorNote: (row["contractor_note"] as string | null) ?? null,
    createdAt: String(row["created_at"] ?? ""),
    resolvedAt: (row["resolved_at"] as string | null) ?? null,
  };
}

/* ------------------------------------------------------ contractor side */

export const createProposalShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => createSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ share: ProposalShareSummary }> => {
    const sb = context.supabase;

    const { data: project, error: projectError } = await sb
      .from("projects")
      .select("id, organization_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (projectError) throw new Error(projectError.message);
    if (!project) throw new Error("PROJECT_NOT_FOUND");
    const organizationId = (project as { organization_id: string }).organization_id;

    const { data: previous } = await sb
      .from("proposal_shares")
      .select("share_version")
      .eq("project_id", data.projectId)
      .order("share_version", { ascending: false })
      .limit(1);
    const nextVersion =
      ((previous as Array<{ share_version: number }> | null)?.[0]?.share_version ?? 0) + 1;

    const { data: inserted, error } = await sb
      .from("proposal_shares")
      .insert({
        organization_id: organizationId,
        project_id: data.projectId,
        estimate_id: data.estimateId ?? null,
        token_hash: data.tokenHash,
        recipient_email: data.recipientEmail,
        recipient_name: data.recipientName ?? null,
        subject: data.subject ?? null,
        message: data.message ?? null,
        locale: data.locale,
        template: data.template ?? null,
        share_version: nextVersion,
        document: data.document,
        media_paths: data.mediaPaths,
        logo_path: data.logoPath ?? null,
        expires_at: data.expiresAt ?? null,
        created_by: context.userId,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { share: mapShare(inserted as ShareRow) };
  });

export const listProposalShares = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ shares: ProposalShareSummary[] }> => {
    const { data: rows, error } = await context.supabase
      .from("proposal_shares")
      .select("*")
      .eq("project_id", data.projectId)
      .order("share_version", { ascending: false });
    if (error) throw new Error(error.message);
    return { shares: ((rows as ShareRow[] | null) ?? []).map(mapShare) };
  });

export const revokeProposalShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ share: ProposalShareSummary }> => {
    const { data: row, error } = await context.supabase
      .from("proposal_shares")
      .update({ status: "revoked", revoked_at: new Date().toISOString() } as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { share: mapShare(row as ShareRow) };
  });

export const listProposalChangeRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<{ requests: ProposalChangeRequest[] }> => {
    const { data: rows, error } = await context.supabase
      .from("proposal_change_requests")
      .select("*")
      .eq("project_id", data.projectId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { requests: ((rows as ShareRow[] | null) ?? []).map(mapChangeRequest) };
  });

/**
 * Contractor disposition. Applying never mutates a sent snapshot: it records
 * the decision, and the revised proposal reaches the client as a new share
 * version created from the contractor's updated live proposal.
 */
export const setChangeRequestStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dispositionSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ request: ProposalChangeRequest }> => {
    const { data: current, error: readError } = await context.supabase
      .from("proposal_change_requests")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("CHANGE_REQUEST_NOT_FOUND");
    const from = (current as { status: ProposalChangeRequest["status"] }).status;
    if (from === "applied" || from === "declined") throw new Error("CHANGE_REQUEST_CLOSED");

    const terminal = data.status === "applied" || data.status === "declined";
    const { data: row, error } = await context.supabase
      .from("proposal_change_requests")
      .update({
        status: data.status,
        contractor_note: data.contractorNote ?? null,
        resolved_by: terminal ? context.userId : null,
        resolved_at: terminal ? new Date().toISOString() : null,
      } as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { request: mapChangeRequest(row as ShareRow) };
  });

/* ---------------------------------------------------------- client side */

export interface SharedProposalResult {
  document: ProposalDocument;
  shareVersion: number;
  sentAt: string;
  locale: string;
  companyName: string;
  projectName: string;
  logoPath: string | null;
}

export const getSharedProposal = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => tokenSchema.parse(d))
  .handler(async ({ data }): Promise<SharedProposalResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await hashShareToken(data.token);
    const { data: row } = await supabaseAdmin
      .from("proposal_shares")
      .select("*")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    const share = row as ShareRow | null;
    const access = resolveShareAccess(
      share
        ? {
            status: share["status"] as "active" | "revoked",
            expiresAt: (share["expires_at"] as string | null) ?? null,
          }
        : null,
    );
    if (!access.ok) throw new Error(`SHARE_${access.reason.toUpperCase()}`);

    await supabaseAdmin
      .from("proposal_shares")
      .update({
        view_count: Number(share!["view_count"] ?? 0) + 1,
        last_viewed_at: new Date().toISOString(),
        first_viewed_at: (share!["first_viewed_at"] as string | null) ?? new Date().toISOString(),
      } as never)
      .eq("id", share!["id"] as string);

    const document = share!["document"] as ProposalDocument;
    return {
      document,
      shareVersion: Number(share!["share_version"] ?? 1),
      sentAt: String(share!["sent_at"] ?? ""),
      locale: String(share!["locale"] ?? "en-US"),
      companyName: document?.branding?.companyName ?? "",
      projectName: document?.projectName ?? "",
      logoPath: (share!["logo_path"] as string | null) ?? null,
    };
  });

/**
 * Short-lived signed URL for one image inside a shared proposal. The path must
 * be on the share's own allow-list, so a token can never be used to enumerate
 * other projects' media.
 */
export const getSharedProposalAsset = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => assetSchema.parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await hashShareToken(data.token);
    const { data: row } = await supabaseAdmin
      .from("proposal_shares")
      .select("status, expires_at, media_paths, logo_path")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    const share = row as ShareRow | null;
    const access = resolveShareAccess(
      share
        ? {
            status: share["status"] as "active" | "revoked",
            expiresAt: (share["expires_at"] as string | null) ?? null,
          }
        : null,
    );
    if (!access.ok) throw new Error(`SHARE_${access.reason.toUpperCase()}`);

    const mediaPaths = (share!["media_paths"] as string[] | null) ?? [];
    const logoPath = (share!["logo_path"] as string | null) ?? null;
    const isLogo = logoPath !== null && data.storagePath === logoPath;
    if (!isLogo && !mediaPaths.includes(data.storagePath)) throw new Error("ASSET_NOT_SHARED");

    const { data: signed, error } = await supabaseAdmin.storage
      .from(isLogo ? "org-branding" : "project-media")
      .createSignedUrl(data.storagePath, 300);
    if (error || !signed) throw new Error("ASSET_UNAVAILABLE");
    return { url: signed.signedUrl };
  });

export const submitProposalChangeRequest = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => submitSchema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const tokenHash = await hashShareToken(data.token);
    const { data: row } = await supabaseAdmin
      .from("proposal_shares")
      .select("id, organization_id, project_id, share_version, status, expires_at, recipient_email")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    const share = row as ShareRow | null;
    const access = resolveShareAccess(
      share
        ? {
            status: share["status"] as "active" | "revoked",
            expiresAt: (share["expires_at"] as string | null) ?? null,
          }
        : null,
    );
    if (!access.ok) throw new Error(`SHARE_${access.reason.toUpperCase()}`);

    const { error } = await supabaseAdmin.from("proposal_change_requests").insert({
      organization_id: share!["organization_id"] as string,
      project_id: share!["project_id"] as string,
      share_id: share!["id"] as string,
      share_version: Number(share!["share_version"] ?? 1),
      kind: data.kind,
      message: data.message,
      selections: data.selections,
      requester_name: data.requesterName ?? null,
      requester_email: data.requesterEmail ?? (share!["recipient_email"] as string | null) ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
