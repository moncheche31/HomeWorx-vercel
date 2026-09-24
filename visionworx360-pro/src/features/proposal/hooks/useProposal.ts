import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  composeProposal,
  themeTokens,
  type ProposalAudience,
  type ProposalInput,
  type ProposalLocale,
  type ProposalMedia,
} from "@/domains/proposal";
import { useClientQuery, useProjectQuery, usePropertyQuery } from "@/features/crm/hooks/useCrm";
import { useEstimateLinesQuery, useEstimatesQuery } from "@/features/estimating/hooks/useEstimating";
import { useScopeItemsQuery } from "@/features/scope/hooks/useScope";
import { usePhotosQuery, useRoomsQuery } from "@/features/project-workspace/hooks/useProjectWorkspace";
import type { PhotoDTO, PhotoType } from "@/features/project-workspace/types";
import { useNarrativeScope } from "@/features/narrative-scope/hooks/useNarrativeScope";
import { useCopilot } from "@/features/copilot/hooks/useCopilot";
import { useWorkspace } from "@/features/workspace/providers/WorkspaceProvider";
import { useCompanyLogoUrl } from "@/features/workspace/hooks/useCompanyLogo";
import { logger } from "@/lib/logging/logger";
import { useProposalSettingsStore } from "./useProposalSettingsStore";
import { resolveActivePricingSource } from "../services/resolveActivePricingSource";
import { buildContractorBreakdown } from "@/domains/estimating";
import { computeEstimateTotals } from "@/features/estimating/services/estimateTotals";

const MEDIA_KIND: Partial<Record<PhotoType, ProposalMedia["kind"]>> = {
  existing: "before",
  damage: "before",
  design: "rendering",
  rendering: "rendering",
  completed: "rendering",
  inspiration: "inspiration",
};

/**
 * Module 014 orchestration. Read-only over every upstream module: the
 * estimating engine, the Narrative Scope engine and the Copilot are untouched.
 */
export function useProposal(projectId: string, audience: ProposalAudience = "customer") {
  const { i18n } = useTranslation();
  const locale: ProposalLocale = i18n.language?.startsWith("es") ? "es-US" : "en-US";

  const { organization } = useWorkspace();
  /**
   * Proposal branding reads the same canonical company logo as Company
   * Settings; private storage paths are resolved to a short-lived signed URL.
   * Null when no logo is set, so the cover renders cleanly without a
   * broken-image placeholder.
   */
  const { url: brandLogoUrl } = useCompanyLogoUrl(organization?.logoUrl ?? null);
  const store = useProposalSettingsStore(projectId);

  const projectQ = useProjectQuery(projectId);
  const project = projectQ.data;
  const clientQ = useClientQuery(project?.clientId);
  const propertyQ = usePropertyQuery(project?.propertyId);
  const roomsQ = useRoomsQuery(projectId);
  const photosQ = usePhotosQuery(projectId);

  const projectName = project?.name ?? "";
  const narrative = useNarrativeScope(projectId, projectName, "customer");
  const copilot = useCopilot(projectId, projectName);

  const estimatesQ = useEstimatesQuery(projectId);
  const latestEstimate = useMemo(() => {
    const list = estimatesQ.data ?? [];
    return [...list].sort((a, b) => b.version - a.version)[0] ?? null;
  }, [estimatesQ.data]);
  const linesQ = useEstimateLinesQuery(latestEstimate?.id);
  const scopeItemsQ = useScopeItemsQuery(projectId, { includedOnly: true });

  const activePricingSource = useMemo(() => {
    if (!latestEstimate || !linesQ.data) return null;
    return resolveActivePricingSource({
      estimate: latestEstimate,
      lines: linesQ.data,
      includedScopeItemIds: (scopeItemsQ.data ?? [])
        .filter((item) => !item.archivedAt && item.isIncluded)
        .map((item) => item.id),
    });
  }, [latestEstimate, linesQ.data, scopeItemsQ.data]);

  /**
   * ONE totals derivation, shared with the Estimate tab. The proposal never
   * recomputes the cost model itself — it only decides how much of the
   * calculated job the customer sees.
   */
  const activeLines = useMemo(
    () => (linesQ.data ?? []).filter((line) => !line.archivedAt),
    [linesQ.data],
  );
  const shared = useMemo(
    () => (latestEstimate && linesQ.data ? computeEstimateTotals(latestEstimate, activeLines) : null),
    [latestEstimate, linesQ.data, activeLines],
  );

  const pricingComponents = useMemo(() => {
    if (!shared) return null;
    const totals = shared.totals;
    return {
      laborTotal: totals.laborTotal,
      materialTotal: totals.materialTotal,
      equipmentTotal: totals.equipmentTotal,
      subcontractorTotal: totals.subcontractorTotal,
      otherTotal: totals.otherTotal,
      overhead: totals.overhead,
      profit: totals.profit,
      contingency: totals.contingency,
      tax: totals.tax,
    };
  }, [shared]);

  /**
   * INTERNAL-ONLY breakdown for the contractor reviewing this proposal.
   * Same math as the presented price; it is never passed into the proposal
   * document, share snapshot, print view or client portal.
   */
  const contractorBreakdown = useMemo(() => {
    if (!shared || activeLines.length === 0) return null;
    const totals = shared.totals;
    return buildContractorBreakdown(
      activeLines.map((line) => {
        const laborCost = line.laborHours * line.laborRate;
        const otherCost = line.equipmentCost + line.subcontractorCost + line.otherCost;
        return {
          id: line.id,
          label: line.description,
          tradeKey: line.tradeKey,
          quantity: line.quantity,
          unitKey: line.unitKey,
          quantityIsAssumedDefault: line.quantityIsAssumedDefault,
          laborHours: line.laborHours,
          laborCost,
          materialCost: line.materialCost,
          otherCost,
          total: laborCost + line.materialCost + otherCost,
        };
      }),
      {
        overhead: totals.overhead,
        profit: totals.profit,
        contingency: totals.contingency,
        tax: totals.tax,
      },
    );
  }, [shared, activeLines]);

  const media: ProposalMedia[] = useMemo(
    () =>
      ((photosQ.data as PhotoDTO[] | undefined) ?? [])
        .filter((p) => !p.archivedAt && MEDIA_KIND[p.photoType])
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((p) => ({
          id: p.id,
          kind: MEDIA_KIND[p.photoType]!,
          storagePath: p.storagePath,
          caption: p.caption,
          altText: p.altText,
        })),
    [photosQ.data],
  );

  const upgrades = useMemo(
    () =>
      copilot.accepted
        .filter((rec) => rec.sectionKey === "upsell")
        .map((rec) => ({
          id: rec.id,
          label: rec.customerLabel,
          description: rec.customerRationale,
          priceLow: rec.typicalPriceRange?.low ?? null,
          priceHigh: rec.typicalPriceRange?.high ?? null,
        })),
    [copilot.accepted],
  );

  const propertyAddress = useMemo(() => {
    const p = propertyQ.data;
    if (!p) return null;
    return [p.street, p.city, p.region, p.postalCode].filter(Boolean).join(", ") || null;
  }, [propertyQ.data]);

  const customerName = useMemo(() => {
    const c = clientQ.data;
    if (!c) return null;
    return c.company || [c.firstName, c.lastName].filter(Boolean).join(" ") || null;
  }, [clientQ.data]);

  const input: ProposalInput | null = useMemo(() => {
    if (!project) return null;
    return {
      projectId,
      projectName: project.name,
      projectTypeLabel: project.projectType ?? null,
      locale,
      audience,
      customer: { name: customerName, propertyAddress },
      branding: {
        companyName: organization?.businessName || organization?.organizationName || "",
        logoUrl: brandLogoUrl,
        contractorPhotoUrl: null,
        phone: organization?.phone ?? null,
        email: organization?.email ?? null,
        website: organization?.website ?? null,
        addressLine:
          [organization?.addressLine1, organization?.city, organization?.region, organization?.postalCode]
            .filter(Boolean)
            .join(", ") || null,
        licenseNumber: organization?.licenseNumber ?? null,
        insuranceLine: null,
        accentColor: organization?.brandAccentColor ?? null,
      },
      /**
       * One scope model, two states: the approved wording when it exists,
       * otherwise the CURRENT canonical narrative (contractor edit, or the
       * generated text). The document still marks itself as awaiting approval.
       */
      approvedScopeText: narrative.record.approvedText ?? narrative.displayText ?? null,
      scopeApproved: Boolean(narrative.record.approvedText),
      roomNames: ((roomsQ.data as Array<{ name: string }> | undefined) ?? []).map((r) => r.name),
      media,
      upgrades,
      pricingSource: activePricingSource?.kind === "ballpark"
        ? { kind: "ballpark", ...activePricingSource.range }
        : activePricingSource?.kind === "detailed_complete"
          ? { kind: "detailed_complete", total: activePricingSource.total }
          : activePricingSource?.kind === "detailed_incomplete"
            ? {
                kind: "detailed_incomplete",
                partialTotal: activePricingSource.partialTotal,
                ballpark: activePricingSource.ballpark,
              }
            : null,
      pricingMode: latestEstimate?.pricingMode ?? "total",
      pricingComponents,
      currency: latestEstimate?.currency ?? organization?.currency ?? "USD",
      settings: store.settings,
      issuedAt: undefined,
    };
  }, [
    project, projectId, locale, audience, customerName, propertyAddress, organization,
    narrative.record.approvedText, narrative.displayText, roomsQ.data, media, upgrades,
    activePricingSource, latestEstimate?.currency, latestEstimate?.pricingMode,
    pricingComponents, store.settings,
  ]);

  /**
   * Presentation must never take the page down. If the scope text ever defeats
   * the presentation layer we still render the proposal, with the scope
   * section empty, rather than throwing into the error boundary.
   */
  const document = useMemo(() => {
    if (!input) return null;
    try {
      return composeProposal(input);
    } catch (error) {
      logger.error("proposal_compose_failed", { projectId, error: String(error) });
      try {
        return composeProposal({ ...input, approvedScopeText: null });
      } catch {
        return null;
      }
    }
  }, [input, projectId]);

  /**
   * What the client actually receives. The contractor may be previewing the
   * contractor audience when they hit Send; the shared snapshot must always be
   * the customer-facing document, with no internal terminology in it.
   */
  const customerDocument = useMemo(() => {
    if (!input) return null;
    if (audience === "customer") return document;
    try {
      return composeProposal({ ...input, audience: "customer" });
    } catch {
      return null;
    }
  }, [input, audience, document]);

  return {
    ...store,
    locale,
    audience,
    document,
    customerDocument,
    /** Client contact + branding path used by the "Send to client" flow. */
    clientEmail: clientQ.data?.email ?? null,
    clientName: customerName,
    logoPath: organization?.logoUrl ?? null,
    estimateId: latestEstimate?.id ?? null,
    /** INTERNAL ONLY — contractor cost split; never rendered externally. */
    contractorBreakdown,
    tokens: themeTokens(store.settings.theme),
    currency: latestEstimate?.currency ?? organization?.currency ?? "USD",
    loading:
      projectQ.isLoading || photosQ.isLoading || estimatesQ.isLoading || linesQ.isLoading ||
      scopeItemsQ.isLoading || narrative.loading,
    error: projectQ.isError,
    refetch: () => void projectQ.refetch(),
  };
}

export type UseProposalResult = ReturnType<typeof useProposal>;
