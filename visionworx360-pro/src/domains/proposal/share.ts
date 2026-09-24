/**
 * Client proposal sharing — pure domain logic.
 *
 * A "share" is an immutable snapshot of the customer-facing proposal document
 * at the moment the contractor sent it. The client portal renders that
 * snapshot, never the live composition, so later contractor edits can never
 * retroactively change what a client already received.
 *
 * The client can never write to contractor-owned records. Everything the
 * client submits lands in a change-request record that the contractor
 * dispositions.
 */
import type { ProposalDocument } from "./types";
import { stripInternalLines } from "./sanitize";

export type ProposalShareStatus = "active" | "revoked";
export type ProposalShareDelivery = "link_ready" | "emailed" | "failed";

export type ChangeRequestStatus = "requested" | "reviewing" | "applied" | "declined";
export type ChangeRequestKind = "change_request" | "question";

export const CHANGE_REQUEST_OPEN_STATUSES: ChangeRequestStatus[] = ["requested", "reviewing"];

export interface ProposalShareSummary {
  id: string;
  projectId: string;
  shareVersion: number;
  recipientEmail: string;
  recipientName: string | null;
  subject: string | null;
  message: string | null;
  status: ProposalShareStatus;
  deliveryStatus: ProposalShareDelivery;
  deliveryDetail: string | null;
  sentAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastViewedAt: string | null;
  viewCount: number;
}

export interface ProposalChangeRequest {
  id: string;
  projectId: string;
  shareId: string;
  shareVersion: number;
  kind: ChangeRequestKind;
  message: string;
  selections: ChangeRequestSelection[];
  requesterName: string | null;
  requesterEmail: string | null;
  status: ChangeRequestStatus;
  contractorNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/**
 * Optional structured selection. Clients may only pick among options the
 * contractor already published in the proposal (investment levels and
 * optional upgrades) — and even then the pick is only ever *requested*.
 */
export interface ChangeRequestSelection {
  kind: "investment_level" | "upgrade";
  key: string;
  label: string;
}

/** Default share lifetime. Long enough for a homeowner, short enough to age out. */
export const DEFAULT_SHARE_TTL_DAYS = 60;

export type ShareAccessDenial = "not_found" | "revoked" | "expired";

export function resolveShareAccess(
  share: { status: ProposalShareStatus; expiresAt: string | null } | null | undefined,
  now: Date = new Date(),
): { ok: true } | { ok: false; reason: ShareAccessDenial } {
  if (!share) return { ok: false, reason: "not_found" };
  if (share.status === "revoked") return { ok: false, reason: "revoked" };
  if (share.expiresAt && new Date(share.expiresAt).getTime() <= now.getTime()) {
    return { ok: false, reason: "expired" };
  }
  return { ok: true };
}

/** Legal status transitions for a change request. Terminal states are final. */
export function canTransitionChangeRequest(
  from: ChangeRequestStatus,
  to: ChangeRequestStatus,
): boolean {
  if (from === to) return false;
  if (from === "applied" || from === "declined") return false;
  return to === "reviewing" || to === "applied" || to === "declined";
}

export function isOpenChangeRequest(status: ChangeRequestStatus): boolean {
  return CHANGE_REQUEST_OPEN_STATUSES.includes(status);
}

export function countOpenChangeRequests(list: Array<{ status: ChangeRequestStatus }>): number {
  return list.filter((item) => isOpenChangeRequest(item.status)).length;
}

/**
 * Everything the client is allowed to see. Contractor-only content — the
 * contractor preview audience, internal scope wording and any lingering
 * estimating terminology — is removed before the snapshot is persisted, so
 * the stored row itself carries no internal cost or margin language.
 */
export function sanitizeShareDocument(doc: ProposalDocument): ProposalDocument {
  return {
    ...doc,
    audience: "customer",
    scopeSections: doc.scopeSections
      .map((section) => ({ ...section, lines: stripInternalLines(section.lines) }))
      .filter((section) => section.lines.length > 0),
    branding: { ...doc.branding, logoUrl: null },
  };
}

/** Storage paths the client portal is allowed to resolve for this share. */
export function shareMediaPaths(doc: ProposalDocument): string[] {
  const paths = new Set<string>();
  for (const group of doc.gallery) {
    for (const media of group.media) paths.add(media.storagePath);
  }
  return [...paths];
}

/** Structured options the client may pick from, derived from the sent snapshot. */
export function shareSelectableOptions(doc: ProposalDocument): ChangeRequestSelection[] {
  return [
    ...doc.investment.map((option) => ({
      kind: "investment_level" as const,
      key: option.key,
      label: option.label,
    })),
    ...doc.upgrades.map((upgrade) => ({
      kind: "upgrade" as const,
      key: upgrade.id,
      label: upgrade.label,
    })),
  ];
}

const TOKEN_BYTES = 32;

/** Unguessable, URL-safe share token (256 bits of entropy). */
export function generateShareToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return btoa(out).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Only the hash is stored — a leaked database row cannot open a proposal. */
export async function hashShareToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function shareUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}/p/${token}`;
}

/** Default email subject/body a contractor can edit before sending. */
export function defaultShareSubject(projectName: string, companyName: string): string {
  return companyName ? `${projectName} — proposal from ${companyName}` : `${projectName} — proposal`;
}
