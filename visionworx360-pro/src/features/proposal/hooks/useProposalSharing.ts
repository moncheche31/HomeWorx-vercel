import { useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  generateShareToken,
  hashShareToken,
  shareUrl,
  DEFAULT_SHARE_TTL_DAYS,
  sanitizeShareDocument,
  shareMediaPaths,
  type ChangeRequestStatus,
} from "@/domains/proposal/share";
import type { ProposalDocument } from "@/domains/proposal";
import {
  createProposalShare,
  listProposalChangeRequests,
  listProposalShares,
  revokeProposalShare,
  setChangeRequestStatus,
} from "../services/proposalShare.functions";

export interface SendProposalInput {
  document: ProposalDocument;
  recipientEmail: string;
  recipientName?: string | null;
  subject?: string;
  message?: string;
  locale: string;
  logoPath: string | null;
  estimateId: string | null;
}

export interface SendProposalResult {
  url: string;
  shareVersion: number;
}

/** Contractor-side sharing: send, list, revoke, and change-request handling. */
export function useProposalSharing(projectId: string) {
  const queryClient = useQueryClient();
  const create = useServerFn(createProposalShare);
  const list = useServerFn(listProposalShares);
  const revoke = useServerFn(revokeProposalShare);
  const listRequests = useServerFn(listProposalChangeRequests);
  const setStatus = useServerFn(setChangeRequestStatus);

  const sharesQuery = useQuery({
    queryKey: ["proposal-shares", projectId],
    queryFn: async () => (await list({ data: { projectId } })).shares,
    enabled: Boolean(projectId),
  });

  const requestsQuery = useQuery({
    queryKey: ["proposal-change-requests", projectId],
    queryFn: async () => (await listRequests({ data: { projectId } })).requests,
    enabled: Boolean(projectId),
  });

  const invalidate = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["proposal-shares", projectId] });
    await queryClient.invalidateQueries({ queryKey: ["proposal-change-requests", projectId] });
  }, [queryClient, projectId]);

  const send = useMutation({
    mutationFn: async (input: SendProposalInput): Promise<SendProposalResult> => {
      const token = generateShareToken();
      const tokenHash = await hashShareToken(token);
      const snapshot = sanitizeShareDocument(input.document);
      const expiresAt = new Date(
        Date.now() + DEFAULT_SHARE_TTL_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { share } = await create({
        data: {
          projectId,
          tokenHash,
          recipientEmail: input.recipientEmail,
          recipientName: input.recipientName ?? undefined,
          subject: input.subject,
          message: input.message,
          locale: input.locale,
          template: input.document.template,
          estimateId: input.estimateId,
          document: snapshot as unknown as Record<string, unknown>,
          mediaPaths: shareMediaPaths(input.document),
          logoPath: input.logoPath,
          expiresAt,
        },
      });

      return {
        url: shareUrl(typeof window === "undefined" ? "" : window.location.origin, token),
        shareVersion: share.shareVersion,
      };
    },
    onSuccess: invalidate,
  });

  const revokeShare = useMutation({
    mutationFn: async (id: string) => revoke({ data: { id } }),
    onSuccess: invalidate,
  });

  const disposition = useMutation({
    mutationFn: async (input: {
      id: string;
      status: Exclude<ChangeRequestStatus, "requested">;
      contractorNote?: string;
    }) => setStatus({ data: input }),
    onSuccess: invalidate,
  });

  return {
    shares: sharesQuery.data ?? [],
    sharesLoading: sharesQuery.isLoading,
    requests: requestsQuery.data ?? [],
    requestsLoading: requestsQuery.isLoading,
    send,
    revokeShare,
    disposition,
  };
}
