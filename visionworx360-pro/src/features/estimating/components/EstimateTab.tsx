import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  History,
  ListChecks,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Settings2,
  GitBranch,
  Lock,
  Sparkles,
  Copy,
  Info,
  FileText,
  ShieldCheck,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { AssemblyReviewPanel } from "./AssemblyReviewPanel";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import {
  reconcilePreliminaryToFinal,
  canApplyKnowledgePricing,
  canCompleteLinePricing,
  summarizeCompletion,
  summarizePricing,
  pricingStrategyOf,
  isSeededPricingOnly,
  assessDetailedIntegrity,
  isFinalEstimateStatus,
  type RangeAssumptions,
} from "@/domains/estimating";
import { computeEstimateTotals } from "../services/estimateTotals";
import {
  useEstimateLinesQuery,
  useEstimateMutations,
  useEstimatesQuery,
  useRefreshEstimate,
  useScopeSyncStateQuery,
} from "../hooks/useEstimating";
import { LEGACY_ESTIMATE_STATUSES } from "../types";
import type { EstimateIntakeMode, EstimateLineDTO, LegacyEstimateStatus } from "../types";
import { EstimateLineRow, type LinePatch } from "./EstimateLineRow";
import { useRepriceFromCostBook } from "../hooks/useCostBook";
import { EstimateSummaryPanel } from "./EstimateSummaryPanel";
import { LocationFactorNotice } from "./LocationFactorNotice";

import { EstimateRangePanel } from "./EstimateRangePanel";
import { CompletePricingDialog } from "./CompletePricingDialog";
import { EstimateModeCard } from "./EstimateModeCard";
import { BallparkRangeCard } from "./BallparkRangeCard";

import { summarizeResolution } from "@/domains/estimating/resolution";
import { IncompletePricingBanner } from "./IncompletePricingBanner";
import { PermitAllowancePanel } from "./PermitAllowancePanel";
import { UnresolvedLinesPanel } from "./UnresolvedLinesPanel";

import { ScopeChangedBanner } from "./ScopeChangedBanner";
import { CopyFromProjectDialog } from "./CopyFromProjectDialog";
import { CopiedPricingBanner } from "./CopiedPricingBanner";
import { findBallparkSnapshot, readBallparkSummary } from "../services/ballparkSummary";
import {
  readBallparkCostBasis,
  totalsForSelectedBallparkPrice,
} from "@/domains/estimating/ballparkCostBasis";
import { GeometryQuantitiesPanel } from "./GeometryQuantitiesPanel";
import { LaborHoursPanel } from "./LaborHoursPanel";
import { MaterialsPanel } from "./MaterialsPanel";
import { FinancialSummaryPanel } from "./FinancialSummaryPanel";
import { PricingReconciliationNotice } from "./PricingReconciliationNotice";
import { PricingConfirmationNotice } from "./PricingConfirmationNotice";
import { useOptionalWorkspace } from "@/features/workspace/providers/WorkspaceProvider";

import { EstimateSettingsDialog } from "./EstimateSettingsDialog";
import { EstimateHistorySheet } from "./EstimateHistorySheet";
import { CreateRevisionDialog } from "./CreateRevisionDialog";
import { CopilotReviewDialog } from "@/features/copilot/components/CopilotReviewDialog";
import { getRevisionUiState, toLineageDocument } from "../revisionState";
import { describeDocument, documentKindOf, revisionNumberOf } from "@/domains/estimating";
import { PILOT_CONVERT_TO_DETAILED_ENABLED } from "@/config/pilot";
import { useNarrationScopeRecovery } from "../hooks/useNarrationScopeRecovery";

const STATUSES: readonly LegacyEstimateStatus[] = LEGACY_ESTIMATE_STATUSES;

type DraftMap = Record<string, Record<string, number>>;

export function EstimateTab({
  projectId,
  projectName = "",
}: {
  projectId: string;
  projectName?: string;
}) {
  const { t, i18n } = useTranslation("estimating");
  const organization = useOptionalWorkspace()?.organization ?? null;
  const { t: tCopilot } = useTranslation("copilot");
  const estimatesQ = useEstimatesQuery(projectId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const estimates = estimatesQ.data ?? [];
  const active = estimates.find((e) => e.id === selectedId) ?? estimates[0] ?? null;
  const linesQ = useEstimateLinesQuery(active?.id);
  const scopeSyncQ = useScopeSyncStateQuery(active?.id);
  const m = useEstimateMutations(projectId, active?.id);
  const refresh = useRefreshEstimate(projectId, active?.id);

  const [drafts, setDrafts] = useState<DraftMap>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  /* Estimate Review is pricing refinement, so it lives with the Estimate. */
  const [reviewOpen, setReviewOpen] = useState(false);
  const [newLine, setNewLine] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  /* Prior-project template pick. Never opens or copies on its own. */
  const [copyOpen, setCopyOpen] = useState(false);
  /** Ballpark estimates open on the range only; this reveals the detailed screen. */
  const [detailedOpen, setDetailedOpen] = useState(false);


  const lines = linesQ.data ?? [];
  /*
   * A job the contractor described out loud must never show $0. When there is
   * no structured scope yet, the saved narration is replayed through the same
   * recognition + book-pricing pipeline the intake screen uses.
   */
  useNarrationScopeRecovery(projectId, {
    enabled: !linesQ.isLoading && lines.length === 0 && active?.status === "draft",
  });
  const revisionState = active ? getRevisionUiState(active) : null;
  const readOnly = active ? active.status === "approved" || revisionState!.readOnly : false;
  const reprice = useRepriceFromCostBook();
  const supersededBy = revisionState?.supersededById
    ? (estimates.find((e) => e.id === revisionState.supersededById) ?? null)
    : null;

  /**
   * Contractor-facing lineage label: revisions read as "Revision 1/2/3…" and
   * the lineage root reads as the original estimate. Alternates and change
   * orders keep their structural labels.
   */
  const documentLabel = (estimate: (typeof estimates)[number]): string => {
    const doc = toLineageDocument(estimate);
    if (documentKindOf(doc) !== "estimate") return describeDocument(doc).text;
    const n = revisionNumberOf(doc);
    return n <= 0 ? t("revision.originalLabel") : t("revision.numberedLabel", { number: n });
  };

  /*
   * Materialized assembly components are never their own row. They roll up
   * into the scope line that produced them (their money is unchanged — the
   * detail is an opt-in drill-down on that line).
   */
  const componentsByParent = useMemo(() => {
    const map = new Map<string, EstimateLineDTO[]>();
    for (const line of lines) {
      if (!line.parentLineId) continue;
      const arr = map.get(line.parentLineId) ?? [];
      arr.push(line);
      map.set(line.parentLineId, arr);
    }
    return map;
  }, [lines]);

  const groups = useMemo(() => {
    const map = new Map<string, EstimateLineDTO[]>();
    for (const line of lines) {
      if (line.parentLineId) continue;
      const key = line.groupLabel?.trim() || t("group.ungrouped");
      const arr = map.get(key) ?? [];
      arr.push(line);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [lines, t]);


  /*
   * Auto-expanded assemblies nobody has reviewed yet. The badge on the line is
   * two collapsibles deep, so the count is surfaced at the top of the tab and
   * one tap opens the breakdown, the group and the line itself.
   */
  const unreviewedLines = useMemo(
    () => lines.filter((l) => l.assemblyExpansionStatus === "auto_expanded_unreviewed"),
    [lines],
  );
  /** Lines whose quantity is an assumption rather than a measurement. */
  const placeholderLines = useMemo(
    () => lines.filter((l) => l.isQuantityPlaceholder && !l.parentLineId),
    [lines],
  );

  const [focusSignals, setFocusSignals] = useState<Record<string, number>>({});
  /*
   * Ballpark estimates never render the line-item breakdown, so opening it was
   * a no-op there. The review surface gets its own section in that mode.
   */
  const [assemblyReviewOpen, setAssemblyReviewOpen] = useState(false);
  const revealUnreviewed = () => {
    const first = unreviewedLines[0];
    if (!first) return;
    setAssemblyReviewOpen(true);
    setAdvancedOpen(true);
    setCollapsed((c) => {
      const next = { ...c };
      for (const l of unreviewedLines) {
        const key = l.groupLabel?.trim() || t("group.ungrouped");
        next[key] = false;
      }
      return next;
    });
    const stamp = Date.now();
    setFocusSignals((s) => {
      const next = { ...s };
      for (const l of unreviewedLines) next[l.id] = stamp;
      return next;
    });
    window.setTimeout(() => {
      const target =
        document.getElementById(`assembly-review-${first.id}`) ??
        document.getElementById(`estimate-line-${first.id}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  };


  /**
   * ONE canonical cost model, shared with the proposal and every preview
   * surface. See `services/estimateTotals.ts` — no surface derives totals on
   * its own any more.
   */
  const totals = useMemo(
    () => computeEstimateTotals(active ?? null, lines, drafts),
    [active, lines, drafts],
  );
  const engineLines = totals.engineLines;
  const baseEngine = totals.base;
  const engine = totals.engine;

  /* Lines the engine cannot defend. Surfaced instead of silently padded. */
  const resolution = useMemo(
    () =>
      summarizeResolution(
        lines.map((line) => ({
          id: line.id,
          description: line.description,
          costBasis: line.costBasis,
          unitKey: line.unitKey,
          quantity: line.quantity,
          isQuantityPlaceholder: line.isQuantityPlaceholder,
          quantityIsAssumedDefault: line.quantityIsAssumedDefault,
          laborHours: line.laborHours,
          laborHoursPerUnit: line.laborHoursPerUnit,
          pricingSource: line.pricingSource,
          isPriceOverridden: line.isPriceOverridden,
          resolutionStatus: line.resolutionStatus,
          unresolvedReason: line.unresolvedReason,
        })),
      ),
    [lines],
  );




  const pricingStatus = useMemo(
    () =>
      summarizePricing(
        lines.map((line) => ({
          pricingSource: line.pricingSource,
          isPriceOverridden: line.isPriceOverridden,
          laborHours: line.laborHours,
          laborRate: line.laborRate,
          materialCost: line.materialCost,
          equipmentCost: line.equipmentCost,
          subcontractorCost: line.subcontractorCost,
          otherCost: line.otherCost,
          pricingProvenance: line.pricingProvenance,
        })),
      ),
    [lines],
  );

  /** Lines still needing a price and/or a confirmed quantity. */
  const completion = useMemo(() => summarizeCompletion(lines), [lines]);
  const canComplete = active ? canCompleteLinePricing(active) : false;

  const canReprice = active ? canApplyKnowledgePricing(active) : false;

  /**
   * Ballpark mode never blocks on line-level pricing completeness. Unresolved
   * lines stay visible as optional exceptions instead of a required gate.
   */
  const isBallpark = active?.intakeMode === "ballpark";

  /*
   * ADR-066 marker. The database flags a saved band as stale when lines change;
   * without a UI signal "stale" and "current" look identical to the contractor.
   */
  const bandNeedsCanonicalRefresh =
    (active?.rangeSnapshot as Record<string, unknown> | null | undefined)?.[
      "needsCanonicalRefresh"
    ] === true;

  /*
   * Pricing-integrity guard. The saved ballpark band survives conversion (it is
   * carried under `range_snapshot.ballpark`), so a detailed estimate whose scope
   * lines are still mostly unpriced can be flagged instead of presenting a
   * collapsed total as final.
   */
  const savedBallpark = active ? readBallparkSummary(active.rangeSnapshot) : null;
  const integrity = useMemo(
    () =>
      assessDetailedIntegrity({
        lines: engineLines.map((l) => ({
          laborHours: l.laborHours ?? 0,
          laborRate: l.laborRate ?? 0,
          materialCost: l.materialCost ?? 0,
          equipmentCost: l.equipmentCost ?? 0,
          subcontractorCost: l.subcontractorCost ?? 0,
          otherCost: l.otherCost ?? 0,
        })),
        grandTotal: engine.totals.grandTotal,
        ballpark: savedBallpark,
      }),
    [engineLines, engine.totals.grandTotal, savedBallpark],
  );
  const pricingIncomplete = !isBallpark && integrity.isIncomplete;

  /*
   * PRELIMINARY <-> FINAL. The financial summary must present the estimate's
   * authoritative selling price, not a second formula.
   *
   * In ballpark mode the authoritative number is the band value at the
   * contractor's SELECTED position (low / recommended / high). The COST side
   * comes from the saved cost basis produced by the same engine run that made
   * the band, and stays FIXED across positions: only selling price, tax and
   * the REALIZED gross profit / margin move. Cost is never reverse-derived
   * from the selected price, because that would silently rewrite job cost so
   * every position appeared to hit the configured target margin.
   *
   * When a legacy snapshot carries no cost basis, nothing is fabricated: the
   * internal breakdown is flagged provisional until the ballpark is recalculated.
   */
  const ballparkCostBasis = useMemo(
    () => (savedBallpark ? readBallparkCostBasis(findBallparkSnapshot(active?.rangeSnapshot ?? null)) : null),
    [savedBallpark, active?.rangeSnapshot],
  );
  const ballparkTotals = useMemo(
    () =>
      savedBallpark && ballparkCostBasis
        ? totalsForSelectedBallparkPrice(
            ballparkCostBasis,
            savedBallpark.selected,
            active?.taxRate ?? 0,
          )
        : null,
    [savedBallpark, ballparkCostBasis, active?.taxRate],
  );
  /* Truthful fallback: price only, no invented cost breakdown. */
  const ballparkCostBasisMissing = Boolean(savedBallpark) && !ballparkCostBasis;
  const presentedTotals =
    isBallpark && ballparkTotals ? ballparkTotals : engine.totals;


  /* Any residual gap between the two is reported, never hidden. */
  const reconciliation = useMemo(
    () =>
      reconcilePreliminaryToFinal({
        preliminary: savedBallpark?.selected ?? null,
        final: isBallpark ? (ballparkTotals?.grandTotal ?? null) : engine.totals.grandTotal,
      }),
    [savedBallpark?.selected, isBallpark, ballparkTotals, engine.totals.grandTotal],
  );


  /*
   * Durable scope staleness: the estimate row remembers the structured scope it
   * was last synchronized against, so this survives closing the project.
   */
  const scopeSync = scopeSyncQ.data ?? null;

  const fail = () => toast.error(t("errors.generic"));

  if (estimatesQ.isLoading)
    return (
      <div className="py-10">
        <LoadingSpinner label="…" />
      </div>
    );
  if (estimatesQ.isError)
    return <RetryPanel title={t("errors.generic")} onRetry={() => estimatesQ.refetch()} />;

  if (!active) {
    return (
      <EmptyState
        title={t("empty.title")}
        description={t("empty.description")}
        action={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            disabled={m.createFromScope.isPending}
            onClick={async () => {
              try {
                const res = await m.createFromScope.mutateAsync({ projectId });
                setSelectedId(res.estimateId);
                toast.success(t("toast.created"));
              } catch {
                fail();
              }
            }}
          >
            <Plus className="mr-1 size-4" aria-hidden />
            {t("empty.generate")}
          </Button>
          <Button
            variant="outline"
            className="min-h-(--control-min-h)"
            onClick={() => setCopyOpen(true)}
          >
            <Copy className="mr-1 size-4" aria-hidden />
            {t("copy.entry")}
          </Button>
          <CopyFromProjectDialog
            projectId={projectId}
            open={copyOpen}
            onOpenChange={setCopyOpen}
            onCopied={(estimateId) => setSelectedId(estimateId)}
          />
          </div>
        }
      />
    );
  }

  const patchLine = async (patch: LinePatch) => {
    const { lineId, ...rest } = patch;
    try {
      await m.updateLine.mutateAsync({ lineId, ...rest } as never);
      setDrafts((d) => {
        const next = { ...d };
        delete next[lineId];
        return next;
      });
    } catch {
      fail();
    }
  };

  /*
   * BALLPARK SCREEN — exact contractor spec, seven boxes in this order and
   * nothing else: range, selected selling price, permits, conversion prompt,
   * estimate type, truncated labor & hours, materials. Assumption /
   * provenance disclosure, placeholder warnings and inline task/trade/project
   * detail are excluded; the latter open from the labor box on demand.
   */
  if (isBallpark && !detailedOpen) {
    return (
      <div data-testid="ballpark-screen" className="space-y-4">
        {/* 1. Preliminary range */}
        <section data-testid="est-ballpark-range">
          <BallparkRangeCard
            projectId={projectId}
            estimate={active}
            readOnly={!!readOnly}
            saving={m.updateEstimate.isPending}
            hideExplanations
            onSave={() => toast.success(t("toast.saved"))}
            selecting={m.setBallparkBandPosition.isPending}
            onSelectPosition={async (position) => {
              try {
                await m.setBallparkBandPosition.mutateAsync({
                  estimateId: active.id,
                  position,
                });
                toast.success(t("toast.saved"));
              } catch {
                fail();
              }
            }}
            converting={m.convertToDetailed.isPending}
            {...(PILOT_CONVERT_TO_DETAILED_ENABLED
              ? {
                  onConvertToDetailed: async () => {
                    try {
                      await m.convertToDetailed.mutateAsync({ estimateId: active.id });
                      toast.success(t("convert.success"));
                    } catch (e) {
                      toast.error(
                        String((e as Error)?.message ?? "").includes("estimate_locked")
                          ? t("convert.locked")
                          : t("convert.error"),
                      );
                    }
                  },
                }
              : {})}
          />
        </section>

        {/* 2. Selected ballpark selling price */}
        <section data-testid="est-financial-summary">
          <FinancialSummaryPanel
            totals={presentedTotals}
            currency={active.currency}
            sourceLabel={
              savedBallpark
                ? t("financial.selectedBallparkTitle", {
                    position: t(`ballpark.position.${savedBallpark.selectedPosition}`),
                  })
                : null
            }
            costBasisUnavailable={ballparkCostBasisMissing}
            strategy={pricingStrategyOf(active)}
            companyStrategy={
              organization
                ? {
                    method: organization.defaultPricingMethod,
                    targetGrossMarginPct: organization.defaultTargetGrossMarginPct,
                    overheadPct: organization.defaultOverheadPct,
                    profitPct: organization.defaultProfitPct,
                  }
                : null
            }
          />
        </section>

        {/* 3. Permits and inspection fees */}
        <PermitAllowancePanel
          projectId={projectId}
          estimateId={active.id}
          currency={active.currency}
          locale={i18n.language === "es-US" ? "es-US" : "en-US"}
          readOnly={!!readOnly}
        />

        {/* 4. Conversion prompt */}
        <div
          data-testid="ballpark-convert-primary"
          className="rounded-md border border-primary/40 bg-primary/5 p-3 print:hidden"
        >
          <p className="text-sm text-foreground-muted">{t("mode.preliminaryBody")}</p>
        </div>

        {/* 5. Estimate type + presentation selector */}
        <section data-testid="est-mode">
          <EstimateModeCard
            estimate={active}
            projectId={projectId}
            exceptions={completion.incomplete}
            readOnly={!!readOnly}
            saving={m.updateEstimate.isPending}
            onReviewExceptions={() => setCompleteOpen(true)}
            onPricingModeChange={async (mode) => {
              try {
                await m.updateEstimate.mutateAsync({ estimateId: active.id, pricingMode: mode });
                toast.success(t(`pricingMode.switched.${mode}`));
              } catch {
                fail();
              }
            }}
            onModeChange={async (mode: EstimateIntakeMode) => {
              try {
                await m.updateEstimate.mutateAsync({ estimateId: active.id, intakeMode: mode });
                toast.success(t(`mode.switched.${mode}`));
              } catch {
                fail();
              }
            }}
          />
        </section>

        {/* 6. Labor and hours — truncated, detail opens from its buttons */}
        <LaborHoursPanel
          truncated
          estimate={active}
          lines={lines}
          company={
            organization
              ? {
                  laborRate: organization.defaultLaborRate,
                  productivityMultiplier: organization.defaultProductivityMultiplier,
                  crewSize: organization.defaultCrewSize,
                  productiveHoursPerDay: organization.defaultProductiveHoursPerDay,
                }
              : null
          }
          readOnly={readOnly}
          saving={m.updateEstimate.isPending}
          onSaveSettings={() => undefined}
        />

        {/* 7. Materials and incidentals */}
        <MaterialsPanel
          lines={lines}
          engineLines={baseEngine.lines}
          totals={engine.totals}
          currency={active.currency}
          pricingMode={active.pricingMode}
          readOnly={readOnly}
          onSetLineMaterialCost={async (lineId, materialCost) => {
            try {
              await m.updateLine.mutateAsync({ lineId, materialCost });
              toast.success(t("toast.saved"));
            } catch {
              fail();
            }
          }}
        />

        <div className="flex justify-end print:hidden">
          <Button variant="outline" className="h-11" onClick={() => setDetailedOpen(true)}>
            Detailed estimate
          </Button>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-4">
      {isBallpark ? (
        <div className="print:hidden">
          <Button variant="ghost" className="h-11 px-2" onClick={() => setDetailedOpen(false)}>
            ← Back to ballpark
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={active.id}
          onValueChange={(v) => {
            // Line-price edits are draft-until-blur. Switching versions used to
            // drop them silently; confirm first so typed pricing is never lost
            // without the contractor knowing.
            if (Object.keys(drafts).length > 0 && !window.confirm(t("unsavedDraftsSwitch"))) {
              return;
            }
            setSelectedId(v);
            setDrafts({});
          }}
        >
          <SelectTrigger className="h-11 w-full sm:w-64" aria-label={t("versions")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {estimates.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {documentLabel(e)} · {e.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={active.status}
          onValueChange={async (v) => {
            try {
              await m.setStatus.mutateAsync({
                estimateId: active.id,
                status: v as LegacyEstimateStatus,
              });
              toast.success(t("status.changed"));
            } catch {
              fail();
            }
          }}
        >
          <SelectTrigger
            className="h-11 w-full sm:w-44"
            aria-label={t("status.label")}
            disabled={readOnly}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUSES.map((s) => (
              <SelectItem
                key={s}
                value={s}
                disabled={pricingIncomplete && s !== active.status && isFinalEstimateStatus(s)}
              >
                {t(`status.${s}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex w-full flex-1 flex-wrap justify-end gap-2 sm:w-auto">
          <Button asChild className="h-11 w-full text-base sm:w-auto sm:text-sm">
            <Link to="/app/proposal/$projectId" params={{ projectId }}>
              <FileText className="mr-1 size-4" aria-hidden />
              {t("actions.viewProposal")}
            </Link>
          </Button>
          {revisionState?.canRevise && revisionState.reviseIsPrimary ? (
            <Button
              className="h-11"
              disabled={m.createRevision.isPending}
              onClick={() => setRevisionOpen(true)}
            >
              <GitBranch className="mr-1 size-4" aria-hidden />
              {m.createRevision.isPending ? t("revision.creating") : t("actions.createRevision")}
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-11">
                <MoreHorizontal className="mr-1 size-4" aria-hidden />
                {t("actions.more")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              {/* Reads are pure; reconciliation only runs when asked for. */}
              <DropdownMenuItem
                disabled={readOnly || refresh.isPending}
                onSelect={async () => {
                  try {
                    await refresh.mutateAsync();
                    toast.success(t("toast.refreshed"));
                  } catch {
                    fail();
                  }
                }}
              >
                {refresh.isPending ? t("actions.refreshing") : t("actions.refresh")}
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={readOnly || m.syncFromScope.isPending}
                onSelect={async () => {
                  try {
                    const res = await m.syncFromScope.mutateAsync({ estimateId: active.id });
                    toast.success(
                  res.imported > 0
                    ? t("toast.synced", { count: res.imported })
                    : t("toast.syncedNone"),
                );
              } catch {
                fail();
                  }
                }}
              >
                <RefreshCw className="mr-2 size-4" aria-hidden />
                {t("actions.syncScope")}
              </DropdownMenuItem>
              {/*
               * Explicit, contractor-initiated reprice from the company Cost Book.
               * Cost-book changes never reach an estimate silently, and locked or
               * approved estimates are refused server-side.
               */}
              <DropdownMenuItem
                disabled={readOnly || reprice.isPending}
                onSelect={async () => {
                  try {
                    await reprice.mutateAsync(active.id);
                    toast.success(t("costBook.repriceDone"));
                  } catch {
                    toast.error(t("costBook.repriceBlocked"));
                  }
                }}
              >
                <RefreshCw className="mr-2 size-4" aria-hidden />
                {t("costBook.repriceAction")}
              </DropdownMenuItem>
              {revisionState?.canRevise && !revisionState.reviseIsPrimary ? (
                <DropdownMenuItem
                  disabled={m.createRevision.isPending}
                  onSelect={() => setRevisionOpen(true)}
                >
                  <GitBranch className="mr-2 size-4" aria-hidden />
                  {t("actions.createRevision")}
                </DropdownMenuItem>
              ) : null}
              {/*
                The ambiguous "New version" action is intentionally hidden from
                the contractor UI; revising is the single user-facing path.
                Versioning infrastructure (m.createVersion) stays available.
              */}
              <DropdownMenuItem
                data-testid="estimate-review-action"
                onSelect={() => setReviewOpen(true)}
              >
                <ShieldCheck className="mr-2 size-4" aria-hidden />
                {tCopilot("actions.open")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setCopyOpen(true)}>
                <Copy className="mr-2 size-4" aria-hidden />
                {t("copy.entry")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                <Settings2 className="mr-2 size-4" aria-hidden />
                {t("actions.settings")}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setHistoryOpen(true)}>
                <History className="mr-2 size-4" aria-hidden />
                {t("actions.history")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <CopiedPricingBanner estimate={active} readOnly={!!readOnly} />
      <CopyFromProjectDialog
        projectId={projectId}
        open={copyOpen}
        onOpenChange={setCopyOpen}
        onCopied={(estimateId) => {
          setSelectedId(estimateId);
          setDrafts({});
        }}
      />

      {scopeSync?.isStale && (scopeSync.action === "update" || scopeSync.action === "revise") ? (
        <ScopeChangedBanner
          action={scopeSync.action}
          needsReview={scopeSync.needsReview}
          pending={m.syncFromScope.isPending || m.reviseAndSync.isPending}
          onUpdate={async () => {
            try {
              await m.syncFromScope.mutateAsync({ estimateId: active.id });
              toast.success(t("scopeChanged.updated"));
            } catch {
              fail();
            }
          }}
          onRevise={async () => {
            try {
              const res = await m.reviseAndSync.mutateAsync({ estimateId: active.id });
              setSelectedId(res.estimateId);
              setDrafts({});
              toast.success(t("scopeChanged.revisedAndSynced"));
            } catch {
              fail();
            }
          }}
        />
      ) : null}

      {/*
        DECISION-FIRST ORDER. The contractor sees the price decision first and
        the arithmetic that produced it last: status → range → money → what is
        assumed → next step → supporting detail → task breakdown.
      */}

      {revisionState?.showSupersededBanner ? (
        <div
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-primary/[0.08] px-3 py-2 text-sm text-primary"
        >
          <Lock className="size-4 shrink-0" aria-hidden />
          <span className="font-medium">{t("revision.supersededBanner")}</span>
          {supersededBy ? (
            <button
              type="button"
              className="min-h-(--control-min-h-sm) underline underline-offset-2"
              onClick={() => {
                setSelectedId(supersededBy.id);
                setDrafts({});
              }}
            >
              {t("revision.openNewer", {
                label: documentLabel(supersededBy),
              })}
            </button>
          ) : null}
        </div>
      ) : readOnly ? (
        <p className="rounded-md border border-border bg-surface-muted px-3 py-2 text-sm text-foreground-muted">
          {t("status.lockedNotice")}
        </p>
      ) : null}

      {linesQ.isLoading ? <LoadingSpinner label="…" /> : null}

      {/*
        BALLPARK vs DETAILED. Pricing-confirmation is a DETAILED-mode action:
        a ballpark is allowed to run on provisional company defaults, so this
        warning never appears beside a preliminary range.
      */}
      <PricingConfirmationNotice
        required={!isBallpark && active.pricingConfirmationRequired}
        reason={active.pricingConfirmationReason}
        source={active.pricingSource}
      />

      {pricingIncomplete ? (
        <IncompletePricingBanner
          integrity={integrity}
          ballpark={savedBallpark}
          currency={active.currency}
        />
      ) : null}

      {/* A. + B. The preliminary band and the selected selling price come first. */}
      {isBallpark ? (
        <section data-testid="est-ballpark-range" className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            {t("breakdown.sectionHeading")}
          </h3>
          <BallparkRangeCard
            projectId={projectId}
            estimate={active}
            readOnly={!!readOnly}
            saving={m.updateEstimate.isPending}
            onSave={() => toast.success(t("toast.saved"))}
            selecting={m.setBallparkBandPosition.isPending}
            onSelectPosition={async (position) => {
              try {
                await m.setBallparkBandPosition.mutateAsync({
                  estimateId: active.id,
                  position,
                });
                toast.success(t("toast.saved"));
              } catch {
                fail();
              }
            }}
            converting={m.convertToDetailed.isPending}
            {...(PILOT_CONVERT_TO_DETAILED_ENABLED
              ? {
                  onConvertToDetailed: async () => {
                    try {
                      await m.convertToDetailed.mutateAsync({ estimateId: active.id });
                      toast.success(t("convert.success"));
              } catch (e) {
                toast.error(
                  String((e as Error)?.message ?? "").includes("estimate_locked")
                    ? t("convert.locked")
                          : t("convert.error"),
                      );
                    }
                  },
                }
              : {})}
          />
        </section>
      ) : null}

      {/* C. Contractor financial summary, tied to the selected band position. */}
      <section data-testid="est-financial-summary">
        <FinancialSummaryPanel
          totals={presentedTotals}
          currency={active.currency}
          sourceLabel={
            isBallpark && savedBallpark
              ? t("financial.selectedBallparkTitle", {
                  position: t(`ballpark.position.${savedBallpark.selectedPosition}`),
                })
              : null
          }
          costBasisUnavailable={isBallpark && ballparkCostBasisMissing}
          strategy={pricingStrategyOf(active)}
          companyStrategy={
            organization
              ? {
                  method: organization.defaultPricingMethod,
                  targetGrossMarginPct: organization.defaultTargetGrossMarginPct,
                  overheadPct: organization.defaultOverheadPct,
                  profitPct: organization.defaultProfitPct,
                }
              : null
          }
        />
      </section>

      {/* D. */}
      <div data-testid="est-reconciliation">
        <PricingReconciliationNotice
          reconciliation={reconciliation}
          currency={active.currency}
        />
      </div>

      {/* E. Assumptions, assumed quantities and blocked lines.
          In Ballpark the unresolved-line callout (yellow, with a "measure this"
          CTA) is a DETAILED-mode workflow: a ballpark discloses assumptions
          without asking the contractor to resolve them. */}
      <section data-testid="est-assumptions">
        <UnresolvedLinesPanel
          summary={resolution}
          projectId={projectId}
          estimateId={active.id}
          locale={i18n.language === "es-US" ? "es-US" : "en-US"}
          readOnly={!!readOnly}
          hideUnresolved={isBallpark}
        />
        <PermitAllowancePanel
          projectId={projectId}
          estimateId={active.id}
          currency={active.currency}
          locale={i18n.language === "es-US" ? "es-US" : "en-US"}
          readOnly={!!readOnly}
        />
      </section>

      {/*
        F. The next step. Single CTA, hosted by the ballpark card so the
        confirmation dialog always precedes the scope import.
      */}
      {isBallpark && !readOnly ? (
        <div
          data-testid="ballpark-convert-primary"
          className="rounded-md border border-primary/40 bg-primary/5 p-3 print:hidden"
        >
          <p className="text-sm text-foreground-muted">{t("mode.preliminaryBody")}</p>
        </div>
      ) : null}

      {/*
        Conversion aftermath. A seeded detailed estimate can show a total built
        from lines that are not priced yet, and the saved band is marked stale
        until the canonical engine re-runs. Both are stated instead of silent.
      */}
      {!isBallpark && bandNeedsCanonicalRefresh ? (
        <div
          data-testid="estimate-band-stale"
          className="rounded-md border border-warning/40 bg-warning/5 p-3 text-sm text-foreground-muted print:hidden"
        >
          {t("convert.bandStale")}
        </div>
      ) : null}

      {/* G. Geometry and mode context.
          Measurements and takeoff belong to the DETAILED estimate. In Ballpark
          the geometry panel — and with it the Measurements dialog — is never
          rendered, so no measurement prompt can appear beside a range. */}
      {!isBallpark ? (
        <section data-testid="est-geometry">
          <GeometryQuantitiesPanel
            projectId={projectId}
          estimate={active}
          lines={lines}
            readOnly={readOnly}
          />
        </section>
      ) : null}


      <section data-testid="est-mode">
        <EstimateModeCard
          estimate={active}
          projectId={projectId}
        exceptions={completion.incomplete}
        readOnly={!!readOnly}
        saving={m.updateEstimate.isPending}
        onReviewExceptions={() => setCompleteOpen(true)}
        onPricingModeChange={async (mode) => {
          try {
            await m.updateEstimate.mutateAsync({ estimateId: active.id, pricingMode: mode });
            toast.success(t(`pricingMode.switched.${mode}`));
          } catch {
            fail();
          }
        }}
        onModeChange={async (mode: EstimateIntakeMode) => {
          try {
            await m.updateEstimate.mutateAsync({ estimateId: active.id, intakeMode: mode });
            toast.success(t(`mode.switched.${mode}`));
          } catch {
            fail();
            }
          }}
        />
      </section>

      {/* H. Supporting labor and material summaries. */}
      <section data-testid="est-supporting" className="space-y-4">
        <LaborHoursPanel
          estimate={active}
          lines={lines}
        company={
          organization
            ? {
                laborRate: organization.defaultLaborRate,
                productivityMultiplier: organization.defaultProductivityMultiplier,
                crewSize: organization.defaultCrewSize,
                productiveHoursPerDay: organization.defaultProductiveHoursPerDay,
              }
            : null
        }
        readOnly={readOnly}
        saving={m.updateEstimate.isPending}
        onSaveSettings={async (laborSettings) => {
          try {
            await m.updateEstimate.mutateAsync({
              estimateId: active.id,
              laborSettings: {
                productivityMultiplier: laborSettings.productivityMultiplier ?? null,
                laborRate: laborSettings.laborRate ?? null,
                crewSize: laborSettings.crewSize ?? null,
                productiveHoursPerDay: laborSettings.productiveHoursPerDay ?? null,
                /* Typed-in hours are contractor authority: never dropped. */
                ...(active.laborSettings?.hourOverrides
                  ? { hourOverrides: { ...active.laborSettings.hourOverrides } }
                  : {}),
                ...(active.laborSettings?.includeNonInstallTime != null
                  ? { includeNonInstallTime: active.laborSettings.includeNonInstallTime }
                  : {}),
              },
            });
            toast.success(t("toast.saved"));
          } catch {
            fail();
          }
          }}
        />

        <MaterialsPanel
          lines={lines}
          engineLines={baseEngine.lines}
          totals={engine.totals}
          currency={active.currency}
          pricingMode={active.pricingMode}
        readOnly={readOnly}
        onSetLineMaterialCost={async (lineId, materialCost) => {
          try {
            /* Contractor money: the line is flagged as overridden and repricing skips it. */
            await m.updateLine.mutateAsync({ lineId, materialCost });
            toast.success(t("toast.saved"));
          } catch {
            fail();
            }
          }}
        />
      </section>

      {/*
        Detailed pricing exceptions. Detailed mode only — ballpark mode never
        shows the line-level pricing workflow alongside the range.
      */}
      {!isBallpark ? (
      <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/40 px-3 py-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-wrap items-start gap-2 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="space-y-0.5">
            {pricingStatus.total > 0 ? (
              <p className="font-medium text-foreground">
                {t("kbPricing.summary", {
                  priced: pricingStatus.priced,
                  unmatched: pricingStatus.unmatched,
                  total: pricingStatus.total,
                })}
              </p>
            ) : null}
            {pricingStatus.contractorEdited > 0 ? (
                <p>{t("kbPricing.edited", { count: pricingStatus.contractorEdited })}</p>
              ) : null}
              {pricingStatus.unmatched > 0 ? <p>{t("kbPricing.needsReview")}</p> : null}
              {/*
                An unresolved line contributes $0. Silently rolling that into
                the total presents an incomplete estimate as a real price, so
                the exclusion is stated plainly instead.
              */}
              {completion.needsPricing > 0 ? (
                <p className="font-medium text-warning-foreground">
                  {t("kbPricing.unresolvedBlocking", { count: completion.needsPricing })}
                </p>
              ) : null}
              {completion.needsQuantityReview > 0 ? (
                <p>
                  {t("completion.counts.needsQuantity", { count: completion.needsQuantityReview })}
                </p>
              ) : null}
              {pricingStatus.usesSampleData || isSeededPricingOnly() ? (
                <p>{t("kbPricing.sampleData")}</p>
            ) : null}
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row">
          <Button
            variant="outline"
            className="h-11 w-full sm:w-auto"
            disabled={!canReprice || m.applyKnowledgePricing.isPending}
              onClick={async () => {
                try {
                  const res = await m.applyKnowledgePricing.mutateAsync({ estimateId: active.id });
                  toast.success(
                    t("kbPricing.toast", {
                      priced: res.priced,
                      unmatched: res.unmatched,
                    }),
                  );
                } catch {
                  fail();
                }
              }}
            >
              <Sparkles className="mr-1 size-4" aria-hidden />
              {m.applyKnowledgePricing.isPending ? t("kbPricing.applying") : t("kbPricing.action")}
            </Button>
            <Button
              className="h-11 w-full sm:w-auto"
            disabled={!canComplete || completion.incomplete === 0}
            onClick={() => setCompleteOpen(true)}
          >
            <ListChecks className="mr-1 size-4" aria-hidden />
            {t("completion.action")}
            {completion.incomplete > 0 ? ` (${completion.incomplete})` : ""}
          </Button>
        </div>
        </div>
      ) : null}

      {/* UNCONFIRMED SIZES, STATED UP FRONT. A total built on assumed
          quantities must never read as a measured estimate — any trade,
          any job, any location. */}
      {placeholderLines.length > 0 ? (
        <div
          data-testid="placeholder-quantity-banner"
          className="rounded-md border border-warning/40 bg-warning/5 px-3 py-2"
        >
          <p className="text-sm">
            <span className="font-medium text-warning">Estimated size — not yet confirmed</span>{" "}
            <span className="text-foreground-muted">
              {placeholderLines.length} line{placeholderLines.length === 1 ? "" : "s"} (
              {placeholderLines.map((l) => l.description).join(", ")}) are priced from assumed
              quantities. Confirm the actual sizes before issuing this estimate.
            </span>
          </p>
        </div>
      ) : null}


      {/* Unreviewed auto-expansions, surfaced where the contractor lands. */}
      {unreviewedLines.length > 0 ? (
        <div
          data-testid="assembly-unreviewed-banner"
          className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2"
        >
          <p className="text-sm">
            <span className="font-medium text-warning">Auto-expanded, unreviewed</span>{" "}
            <span className="text-foreground-muted">
              {unreviewedLines.length} line{unreviewedLines.length === 1 ? "" : "s"} (
              {unreviewedLines.map((l) => l.description).join(", ")}) have assembly components
              waiting for your review.
            </span>
          </p>
          <Button variant="outline" size="sm" onClick={revealUnreviewed}>
            Review assemblies
          </Button>
        </div>
      ) : null}

      {/* Ballpark has no line-item breakdown, so review lives here. */}
      {isBallpark && assemblyReviewOpen && unreviewedLines.length > 0 ? (
        <section data-testid="assembly-review-section" className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
            Assembly review
          </h3>
          {unreviewedLines.map((line) => (
            <Card key={line.id} id={`assembly-review-${line.id}`} className="scroll-mt-24">
              <CardContent className="p-4">
                <p className="text-sm font-medium">{line.description}</p>
                <AssemblyReviewPanel line={line} readOnly={!!readOnly} />
              </CardContent>
            </Card>
          ))}
        </section>
      ) : null}





      {isBallpark ? null : (
        <EstimateRangePanel
          projectId={projectId}
        estimate={active}
        lines={engineLines}
        readOnly={!!readOnly}
        saving={m.updateEstimate.isPending}
        onSave={async (assumptions: RangeAssumptions, snapshot) => {
          try {
            await m.updateEstimate.mutateAsync({
              estimateId: active.id,
              rangeAssumptions: assumptions,
              rangeSnapshot: snapshot as never,
            });
            toast.success(t("toast.saved"));
          } catch {
            fail();
          }
        }}
        />
      )}

      {/*
        I. TASK BREAKDOWN — always the final substantive section. The arithmetic
        explains the decision above; it never leads the page.
      */}
      <section data-testid="est-task-breakdown" className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-foreground-muted">
          {t("breakdown.title")}
        </h3>

        {isBallpark ? (
          <p className="text-sm text-foreground-muted">{t("breakdown.note")}</p>
        ) : (
          <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
            <CollapsibleTrigger asChild>
              <button
              type="button"
            className="flex min-h-(--control-min-h-sm) w-full items-center justify-between gap-2 rounded-md border border-border px-3 text-left text-sm font-medium"
          >
            {t("range.lineItems")}
            <ChevronDown
              className={`size-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              aria-hidden
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-4 pt-4">
      <div className="space-y-3">
        {groups.map(([label, groupLines]) => {
          const open = !collapsed[label];
          return (
            <Card key={label}>
              <Collapsible
                open={open}
                onOpenChange={(v) => setCollapsed((c) => ({ ...c, [label]: !v }))}
              >
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className="flex min-h-(--control-min-h-sm) w-full items-center justify-between gap-2 px-4 py-3 text-left"
                          >
                            <span className="font-medium">{label}</span>
                            <span className="flex items-center gap-2 text-xs text-foreground-muted">
                              {groupLines.some(
                                (l) => l.assemblyExpansionStatus === "auto_expanded_unreviewed",
                              ) ? (
                                <Badge
                                  variant="outline"
                                  className="border-warning/40 font-normal text-warning"
                                >
                                  Auto-expanded, unreviewed
                                </Badge>
                              ) : null}
                              <Badge variant="outline" className="font-normal">
                                {t("totals.lines", { count: groupLines.length })}
                              </Badge>

                              <ChevronDown
                                className={`size-4 transition-transform ${open ? "rotate-180" : ""}`}
                                aria-hidden
                      />
                    </span>
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <CardContent className="p-0">
                    {groupLines.map((line) => (
                              <EstimateLineRow
                                key={line.id}
                                line={line}
                                components={componentsByParent.get(line.id) ?? []}
                                focusSignal={focusSignals[line.id]}


                                currency={active.currency}
                                taxRate={active.taxRate}
                                readOnly={!!readOnly}
                              draft={drafts[line.id] ?? {}}
                              onDraftChange={(field, value) =>
                                setDrafts((d) => ({
                                  ...d,
                                  [line.id]: { ...(d[line.id] ?? {}), [field]: value },
                                }))
                              }
                              onPatch={patchLine}
                              onRemove={async () => {
                                try {
                                  await m.archiveLine.mutateAsync({
                                    lineId: line.id,
                                    archived: true,
                                  });
                                  toast.success(t("toast.lineRemoved"));
                                } catch {
                                  fail();
                          }
                        }}
                      />
                    ))}
                  </CardContent>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          );
        })}
      </div>

      {!readOnly ? (
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            const description = newLine.trim();
            if (!description) return;
            try {
              await m.createLine.mutateAsync({ estimateId: active.id, description });
              setNewLine("");
              toast.success(t("toast.lineAdded"));
            } catch {
              fail();
            }
          }}
        >
          <Input
            className="h-11"
            value={newLine}
            onChange={(e) => setNewLine(e.target.value)}
                  placeholder={t("newLine.placeholder")}
                  aria-label={t("actions.addLine")}
                />
                <Button
                  type="submit"
                  className="h-11"
                  disabled={!newLine.trim() || m.createLine.isPending}
                >
                  <Plus className="mr-1 size-4" aria-hidden />
                  {t("actions.addLine")}
                </Button>
                </form>
              ) : null}

              <LocationFactorNotice estimate={active} className="mt-2" />

              <EstimateSummaryPanel
                totals={engine.totals}
                pricingMode={active.pricingMode}
                currency={active.currency}
                seededPricingNotice={isSeededPricingOnly()}
              />

            </CollapsibleContent>
          </Collapsible>
        )}
      </section>


      <EstimateSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        estimate={active}
        saving={m.updateEstimate.isPending}
        directCost={engine.totals.directCost}
        contingency={engine.totals.contingency}
        currentSellingPrice={engine.totals.subtotal}
        companyStrategy={
          organization
            ? {
                method: organization.defaultPricingMethod,
                targetGrossMarginPct: organization.defaultTargetGrossMarginPct,
                overheadPct: organization.defaultOverheadPct,
                profitPct: organization.defaultProfitPct,
              }
            : null
        }
        onSave={async (values) => {
          try {
            await m.updateEstimate.mutateAsync({ estimateId: active.id, ...values });
            setSettingsOpen(false);
            toast.success(t("toast.settingsSaved"));
          } catch {
            fail();
          }
        }}
      />

      <CreateRevisionDialog
        open={revisionOpen}
        onOpenChange={setRevisionOpen}
        pending={m.createRevision.isPending}
        onConfirm={async () => {
          try {
            const res = await m.createRevision.mutateAsync({ estimateId: active.id });
            setSelectedId(res.estimateId);
            setDrafts({});
            setRevisionOpen(false);
            // The new revision number is one past the document we revised.
            const nextNumber = revisionNumberOf(toLineageDocument(active)) + 1;
            toast.success(
              res.created
                ? Number.isFinite(nextNumber) && nextNumber > 0
                  ? t("toast.revisionCreatedNumbered", { number: nextNumber })
                  : t("toast.revisionCreated")
                : t("toast.revisionExists"),
            );
          } catch {
            fail();
          }
        }}
      />

      {completeOpen ? (
        <CompletePricingDialog
          open={completeOpen}
          onOpenChange={setCompleteOpen}
          estimate={active}
          lines={lines}
          mutations={m}
        />
      ) : null}

      <EstimateHistorySheet
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        estimateId={active.id}
      />

      {/*
        ONE CONVERSION CTA. The scope import lives on the ballpark card behind a
        confirmation dialog; duplicated unconfirmed CTAs used to fire the same
        scope-seeding mutation with no warning.
      */}

      <CopilotReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        projectId={projectId}
        projectName={projectName}
      />
    </div>
  );
}
