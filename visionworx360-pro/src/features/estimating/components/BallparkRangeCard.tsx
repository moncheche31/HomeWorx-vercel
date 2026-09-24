import { pricingStrategyOf } from "@/domains/estimating/pricingStrategy";
import { calculateEngineEstimate } from "@/domains/estimating/engine/calculate";
import {
  costBasisFromEngineTotals,
  pricingSnapshotFromStrategy,
} from "@/domains/estimating/ballparkCostBasis";

import {
  BALLPARK_BAND_POSITIONS,
  DEFAULT_BALLPARK_BAND_POSITION,
  type BallparkBandPosition,
} from "@/domains/estimating/ballparkPosition";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CheckCircle2,
  Gauge,
  MoreHorizontal,
  Pencil,
  Save,
  Trash2,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency } from "@/i18n/format";
import {
  clarificationLabel,
  countAnsweredEntries,
  deriveClarificationState,
} from "@/domains/estimating";
import {
  BALLPARK_ENGINE_VERSION,
  buildBallpark,
  mergeMeasuredGeometry,
  type BallparkAnswers,
  transcriptsFromAnswers,
  type DurableBallparkSession,
} from "@/domains/ballpark";

import type { Json } from "@/integrations/supabase/types";
import { useBallparkSession } from "@/features/ballpark/hooks/useBallparkSession";
import { useBallparkFlow } from "@/features/ballpark/hooks/useBallparkFlow";
import { useDurableBallparkSession } from "@/features/ballpark/hooks/useDurableBallparkSession";
import { useProjectGeometry } from "../hooks/useMeasurements";
import { useProjectScopeContext } from "../hooks/useProjectScopeContext";
import { useProjectMediaUnderstanding } from "@/features/remote-vision/hooks/useProjectMediaUnderstanding";
import { visualObservationsToScopeText } from "@/features/remote-vision/services/mediaUnderstanding.shared";
import {
  countProvisionalAllowances,
  readBallparkAssumptions,
  readBallparkValidity,

  readBallparkSummary,
  readPriorBallpark,
} from "../services/ballparkSummary";
import { BallparkAssumptionRow } from "./BallparkAssumptionRow";
import { ConvertToDetailedDialog } from "./ConvertToDetailedDialog";
import { PriceBasisSplit } from "./PriceBasisSplit";

import type { EstimateDTO } from "../types";

interface Props {
  projectId: string;
  estimate: EstimateDTO;
  readOnly?: boolean;
  saving?: boolean;
  /** Persist the range onto the SAME estimate. Never creates scope or lines. */
  onSave: () => void;
  /** Secondary action: progress THIS estimate into a detailed estimate. */
  onConvertToDetailed?: () => void | Promise<void>;
  /** Conversion in flight. */
  converting?: boolean;
  /** Contractor's selling position inside the saved band. */
  onSelectPosition?: (position: BallparkBandPosition) => void;
  /** Position write in flight. */
  selecting?: boolean;
  /**
   * Ballpark screen: assumption / provenance / "how this was calculated"
   * disclosure is withdrawn from the range box by contractor instruction.
   */
  hideExplanations?: boolean;

}


/**
 * Ballpark range, in place on the estimate page.
 *
 * It reuses whatever the project already has — saved measurements, the
 * resumable walkthrough answers — and asks only for the high-impact answers
 * that are still missing. It never reads the estimate's unmatched line prices,
 * so 21 unpriced lines can never block or zero out the range, and it never
 * writes lines: saving only freezes a snapshot on this estimate.
 */
export function BallparkRangeCard({
  projectId,
  estimate,
  readOnly,
  saving,
  onSave,
  onConvertToDetailed,
  converting,
  onSelectPosition,
  selecting,
  hideExplanations,

}: Props) {
  const [convertOpen, setConvertOpen] = useState(false);

  const { t, i18n } = useTranslation(["estimating", "ballpark"]);
  const navigate = useNavigate();
  const money = (v: number) => formatCurrency(v, i18n.language, estimate.currency);

  /**
   * The interview is derived from THIS project's approved scope. Without this
   * every project inherited the garage-conversion question set (raised floor,
   * partitions, insulation) no matter what the work actually was.
   *
   * Structured scope rows are the first source; the APPROVED NARRATIVE is the
   * second, because Photos/Video and Describe-Your-Project approve wording
   * before any `scope_items` exist and an empty signal set would fall back to
   * the whole garage interview.
   */
  const mediaUnderstanding = useProjectMediaUnderstanding(projectId);
  const multimodalEvidence = useMemo(
    () => ({
      spokenNarration: mediaUnderstanding.spokenNarration,
      visualObservations: visualObservationsToScopeText(mediaUnderstanding.visualObservations),
    }),
    [mediaUnderstanding.spokenNarration, mediaUnderstanding.visualObservations],
  );
  const scopeContext = useProjectScopeContext(projectId, multimodalEvidence);
  const schema = scopeContext.schema;


  const durable = useDurableBallparkSession(estimate.id);
  const serverSession = durable.query.data ?? null;
  const waitForServer = durable.query.isLoading;
  const session = useBallparkSession(
    projectId,
    schema,
    undefined,
    estimate.id,
    serverSession,
    "full_refinement",
    waitForServer,
  );
  const flow = useBallparkFlow(projectId, null, estimate.id, serverSession, waitForServer);

  /**
   * Every ballpark action resumes the saved session. Only the explicit
   * "Change intake method" action is allowed back to the intake fork.
   */
  const goToBallpark = (resume: "inputs" | "interview" | "chooser") =>
    navigate({
      to: "/app/ballpark",
      search: {
        projectId,
        estimateId: estimate.id,
        projectName: estimate.title ?? undefined,
        resume,
      },
    });
  const { record } = useProjectGeometry(projectId);

  /**
   * Saved measurements overlay the interview answers; contractor input wins.
   * Only measurements the CURRENT scope depends on are merged, so a stray wall
   * reading on a cabinet job can never become room length/width and reprice it.
   */
  const answers: BallparkAnswers = useMemo(
    () => mergeMeasuredGeometry(session.answers, record, scopeContext.domains),
    [session.answers, record, scopeContext.domains],
  );

  const result = useMemo(
    () =>
      buildBallpark(answers, {
        currency: estimate.currency,
        taxRatePct: estimate.taxRate,
        laborRate: estimate.defaultLaborRate || null,
        schema,
        overheadPct: estimate.defaultOverheadPct,
        profitPct: estimate.defaultProfitPct,
        contingencyPct: estimate.defaultContingencyPct,
        /* Ballpark uses the SAME pricing method as the detailed estimate. */
        pricingStrategy: pricingStrategyOf(estimate),
      }),
    [answers, estimate, schema],
  );
  /*
   * The FIXED cost side of this band. Captured from the same engine run that
   * produced low/expected/high so the contractor can be shown truthful
   * realized economics at any selected price without ever back-solving cost
   * from the selling price.
   */
  const costBasis = useMemo(() => {
    const totals = calculateEngineEstimate(result.lines, {
      currency: result.currency,
      taxRatePct: estimate.taxRate,
      pricingStrategy: pricingStrategyOf(estimate),
    });
    return costBasisFromEngineTotals(totals.totals, {
      currency: result.currency,
      pricing: pricingSnapshotFromStrategy(pricingStrategyOf(estimate), {
        contingencyPct: estimate.defaultContingencyPct,
        laborRate: estimate.defaultLaborRate || null,
      }),
      engineVersion: BALLPARK_ENGINE_VERSION,
    });
  }, [result, estimate]);
  const savedSummary = readBallparkSummary(estimate.rangeSnapshot);

  /*
   * `readBallparkReview` / `readBallparkBlockers` are intentionally NOT read
   * here: review and blocker states stay internal to Detailed estimating.
   */
  const priorBand = readPriorBallpark(estimate.rangeSnapshot);
  /*
   * VALIDITY GUARD. An all-zero canonical band on an estimate that HAS scope is
   * a pricing failure. It must never be presented as a "$0 – $0" quote.
   */
  const validity = readBallparkValidity(estimate.rangeSnapshot);

  const assumptions = readBallparkAssumptions(estimate.rangeSnapshot);
  const provisionalCount = countProvisionalAllowances(estimate.rangeSnapshot);
  const hasPersistedAnswers = Object.keys(serverSession?.answers ?? {}).length > 0;
  const displayedBand = savedSummary
    ? { low: savedSummary.low, expected: savedSummary.expected, high: savedSummary.high }
    : result.band;
  /* Persisted on the estimate, so reopening shows the contractor's own choice. */
  const selectedPosition: BallparkBandPosition =
    savedSummary?.selectedPosition ?? DEFAULT_BALLPARK_BAND_POSITION;
  const displayedConfidence = savedSummary
    ? (savedSummary.confidence ?? "low")
    : result.confidence;
  const hasDraft = hasPersistedAnswers && serverSession?.currentStage === "questions";

  /**
   * PILOT SAFETY: the "Improve accuracy" question count is not computed or
   * advertised here. The domain selector still exists for future use; this
   * card no longer surfaces open-question counts, so clarification CTAs read
   * as plain edit/review wording.
   */
  const clarifications = useMemo(
    () =>
      deriveClarificationState({
        answeredCount: countAnsweredEntries(serverSession?.answers ?? null),
        openCount: 0,
      }),
    [serverSession?.answers],
  );
  const assumptionsCta = clarificationLabel(clarifications, {
    unstarted: "ballparkCard.editAssumptions",
    completed: "ballparkCard.reviewAssumptions",
    /* No count is advertised in the pilot; "new questions" wording is unused. */
    fresh: "ballparkCard.editAssumptions",
  });
  /*
   * The refinement interview ("answer more questions to firm this up") is a
   * Detailed-estimate workflow and is no longer offered from the ballpark.
   */

  const bq = (key: string) => t(key, { ns: "ballpark" });

  return (
    <Card className="border-primary/40">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Gauge className="size-4" aria-hidden />
            {bq("result.title")}
          </CardTitle>
          <Badge variant={displayedConfidence === "high" ? "default" : "secondary"}>
            {bq("result.confidence")}: {bq(`result.confidenceLevel.${displayedConfidence}`)}
          </Badge>
        </div>
        <p data-testid="ballpark-mode-tagline" className="text-sm text-foreground-muted">
          {t("mode.ballparkTagline")}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/*
          Unmistakable status. A contractor sharing this with a prospect must
          never be in doubt about which level of estimate they are sending.
        */}
        <div
          data-testid="ballpark-status-banner"
          className="rounded-md border border-primary/40 bg-primary/10 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="default">{t("mode.preliminaryBadge")}</Badge>
            <span className="text-sm font-semibold text-foreground">
              {t("mode.preliminaryTitle")}
            </span>
          </div>
          <p className="mt-1 text-sm text-foreground-muted">{t("mode.preliminaryBody")}</p>
          {/* The single conversion CTA in the app; always confirmed first. */}
          {onConvertToDetailed && !readOnly ? (
            <Button
              data-testid="ballpark-build-detailed"
              className="mt-3 h-12 w-full sm:w-auto"
              disabled={!!saving || !!converting}
              onClick={() => setConvertOpen(true)}
            >
              <ArrowRight className="mr-1 size-4" aria-hidden />
              {t("convert.action")}
            </Button>
          ) : null}
        </div>

        {/*
          VALIDITY GUARD. Meaningful scope that priced to nothing is an
          incomplete estimate, so the failure is stated before any number.
        */}
        {!validity.isValidQuote ? (
          <div
            data-testid="ballpark-invalid-quote"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3"
          >
            <p className="text-sm font-semibold text-foreground">{bq("result.invalidTitle")}</p>
            <p className="mt-1 text-sm text-foreground-muted">{bq("result.invalidBody")}</p>
            {validity.unresolvedLineCount > 0 ? (
              <p className="mt-1 text-sm text-foreground-muted">
                {t("result.invalidUnresolved", {
                  ns: "ballpark",
                  count: validity.unresolvedLineCount,
                })}
              </p>
            ) : null}
          </div>
        ) : null}

        {/*
          Selling POSITION inside one preliminary band. Same scope, same
          quantities, same pricing method — only where the contractor sells.
        */}
        <div
          role="radiogroup"
          aria-label={bq("result.positionGroupLabel")}
          className="grid gap-2 sm:grid-cols-3"
        >
          {BALLPARK_BAND_POSITIONS.map((key) => {
            const isSelected = key === selectedPosition;
            const interactive = Boolean(savedSummary && onSelectPosition && !readOnly);

            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={isSelected}
                data-testid={`ballpark-position-${key}`}
                data-selected={isSelected ? "true" : "false"}
                disabled={!interactive || !!selecting}
                onClick={() => onSelectPosition?.(key)}
                className={[
                  "min-h-(--control-min-h) rounded-lg border p-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  interactive ? "cursor-pointer hover:border-primary/60" : "cursor-default",
                  isSelected
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "border-border",
                ].join(" ")}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-xs uppercase tracking-wide text-foreground-muted">
                    {bq(`result.${key}`)}
                  </span>
                  {isSelected ? (
                    <CheckCircle2 className="size-4 text-primary" aria-hidden />
                  ) : null}
                </span>
                <span className="block text-xl font-semibold text-foreground sm:text-2xl">
                  {validity.isValidQuote ? money(displayedBand[key]) : bq("result.unpriced")}
                </span>

                {isSelected ? (
                  <span className="mt-1 block text-xs text-primary">
                    {bq("result.selectedBadge")}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        {/*
          Job cost vs sell price, always labelled. A band that silently
          included a 40% margin read as the app being broken.
        */}
        {validity.isValidQuote ? (
          <PriceBasisSplit
            testId="ballpark-price-basis"
            currency={estimate.currency}
            jobCost={costBasis.jobCost}
            sellPrice={displayedBand[selectedPosition]}
            marginPct={costBasis.pricing.targetGrossMarginPct}
          />
        ) : null}

        {savedSummary ? (
          <p data-testid="ballpark-selected-hint" className="text-xs text-foreground-muted">
            {bq("result.positionHint")}
          </p>
        ) : null}


        {!hideExplanations && priorBand ? (
          <p data-testid="ballpark-prior" className="text-xs text-foreground-muted">
            {t("ballparkCard.priorReference", {
              low: money(priorBand.low),
              expected: money(priorBand.expected),
              high: money(priorBand.high),
            })}
          </p>
        ) : null}

        {/*
          STRICT BALLPARK/DETAILED SEPARATION.

          The "pricing needs review" and "N items still need detail" warnings
          are withdrawn from Ballpark. A ballpark is COMPLETE when it has a
          credible range built from evidence plus disclosed assumptions;
          unconfirmed measurement provenance is stored internally but is never
          presented as a required action here. Exact quantities, takeoff gaps
          and trade-specific questions belong to the Detailed estimate.
        */}
        {savedSummary ? (
          <div
            data-testid="ballpark-complete"
            className="rounded-md border border-success/40 bg-success/10 p-3"
          >
            <p className="text-sm font-medium text-foreground">
              {t("ballparkCard.completeTitle")}
            </p>
            <p className="text-sm text-foreground-muted">
              {provisionalCount > 0
                ? t("ballparkCard.completeAllowances", { count: provisionalCount })
                : t("ballparkCard.completeBody")}
            </p>
          </div>
        ) : null}


        {!hideExplanations && assumptions.length > 0 ? (
          <details
            data-testid="ballpark-assumptions"
            className="rounded-md border border-border bg-surface-muted p-3"
          >
            <summary className="cursor-pointer text-sm font-medium text-foreground">
              {t("ballparkCard.assumptionsTitle", { count: assumptions.length })}
            </summary>
            <p className="mt-1 text-sm text-foreground-muted">
              {t("ballparkCard.assumptionsHint")}
            </p>
            <ul className="mt-2 space-y-2 text-sm text-foreground-muted">
              {assumptions.map((a) => (
                <BallparkAssumptionRow
                  key={`${a.itemId}-${a.itemKey}-${a.basisKey}`}
                  projectId={projectId}
                  estimateId={estimate.id}
                  assumption={a}
                  readOnly={readOnly}
                />
              ))}
            </ul>
          </details>
        ) : null}


        {hasDraft ? (
          <div className="rounded-md border border-border bg-surface-muted p-3">
            <p className="text-sm font-medium text-foreground">{t("ballparkCard.draftInProgress")}</p>
          </div>
        ) : null}

        {/*
          PILOT SAFETY: the "Improve accuracy — N key details missing" banner
          and its Answer now CTA are withdrawn from the pilot UI. No question
          count is advertised on this card.
        */}


        {/*
          A committed band owns its own assumptions. Recomputing them here made
          an approved Economy selection re-render as a generic "Basic" finish
          after unrelated edits, so the derived view is only shown while no
          snapshot has been saved.
        */}
        {!hideExplanations && !savedSummary ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-foreground">{bq("result.assumptions")}</p>
            <ul className="mt-1 space-y-1 text-sm text-foreground-muted">
              {result.assumptions.map((a) => (
                <li key={a.key}>
                  {bq(a.labelKey)}: <span className="text-foreground">{a.value}</span>{" "}
                  <span className="text-xs">({bq(`result.source.${a.source}`)})</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{bq("result.unknowns")}</p>
            {result.unknowns.length > 0 ? (
              <>
                <ul className="mt-1 space-y-1 text-sm text-foreground-muted">
                  {result.unknowns.map((u) => (
                    <li key={u.questionId}>{bq(u.promptKey)}</li>
                  ))}
                </ul>
                <p className="mt-1 text-xs text-foreground-muted">
                  {t("result.unknownsHint", {
                    ns: "ballpark",
                    pct: Math.round(result.unknownWidenPct),
                  })}
                </p>
              </>
            ) : (
              <p className="mt-1 text-sm text-foreground-muted">—</p>
            )}
          </div>
        </div>
        ) : null}

        <p className="text-xs text-foreground-muted">{bq("result.preliminary")}</p>
        {onConvertToDetailed && !readOnly ? (
          <p data-testid="ballpark-detailed-hint" className="text-xs text-foreground-muted">
            {t("mode.detailedHandoff")}
          </p>
        ) : null}
        {result.isSampleData ? (
          <p className="text-xs text-foreground-muted">{t("kbPricing.sampleData")}</p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          {!savedSummary ? (
            <Button
              className="h-12 w-full sm:w-auto"
              disabled={!!readOnly || !!saving || waitForServer || !session.hydrated}
              onClick={async () => {
                const now = new Date().toISOString();
                const snapshot = {
                  kind: "ballpark",
                  mode: "ballpark",
                  engineVersion: BALLPARK_ENGINE_VERSION,
                  currency: result.currency,

                  calculatedAt: now,
                  savedAt: now,
                  intakeMethod: flow.source,
                  band: result.band,
                  confidence: result.confidence,
                  unknownWidenPct: result.unknownWidenPct,
                  assumptions: result.assumptions,
                  unknowns: result.unknowns,
                  quantities: result.quantities,
                  geometry: result.derived.geometryInput as unknown as Record<string, unknown>,
                  isSampleData: result.isSampleData,
                  /*
                   * Fixed cost basis for this band. Selecting low/high changes
                   * price only; these costs never move with the selection.
                   */
                  costBasis: { ...costBasis, computedAt: now } as unknown as Json,

                } as unknown as Record<string, Json | undefined>;
                const source = flow.source ?? "onsite";
                const payload: DurableBallparkSession = {
                  schemaKey: schema.key,
                  schemaVersion: 1,
                  estimateId: estimate.id,
                  projectId,
                  intakeSource: source,
                  currentStage: "results",
                  interviewType: "full_refinement",
                  frozenQuestionIds: session.frozenQuestionIds,
                  answers,
                  transcripts: transcriptsFromAnswers(answers),
                  photoReferences: flow.photos.map(({ id, name, kind }) => ({ id, name, kind })),
                  photoAnalysis: {},
                  confirmedValues: Object.fromEntries(
                    Object.entries(answers)
                      .filter(([, answer]) => answer?.status === "answered")
                      .map(([key, answer]) => [key, answer?.value ?? null]),
                  ),
                  inferredValues: {},
                  assumedValues: Object.fromEntries(
                    result.assumptions
                      .filter((item) => item.source !== "answered")
                      .map((item) => [item.key, item as unknown as Json]),
                  ),
                  contractorOverrides: {},
                  derivedGeometry: result.derived.geometryInput as unknown as Record<string, Json | undefined>,
                  derivedQuantities: result.quantities as unknown as Json[],
                  unknowns: result.unknowns as unknown as Json[],
                  rangeInputs: { unknownWidenPct: result.unknownWidenPct },
                  rangeSnapshot: snapshot,
                  confidence: result.confidence,
                  description: flow.description,
                  observations: flow.observations as unknown as Json[],
                  corrections: flow.corrections,
                  clarifications: flow.clarifications,
                  updatedAt: now,
                };
                try {
                  await durable.persistComplete.mutateAsync({ session: payload, rangeSnapshot: snapshot });
                  onSave();
                } catch {
                  // The local hooks already retained this exact draft.
                }
              }}
            >
              <Save className="mr-1 size-4" aria-hidden />
              {t("ballparkCard.save")}
            </Button>
          ) : (
            <Button
              className="h-12 w-full sm:w-auto"
              disabled={!!readOnly}
              onClick={() => goToBallpark(hasDraft ? "interview" : "inputs")}
            >
              <Wand2 className="mr-1 size-4" aria-hidden />
              {hasDraft
                ? t("ballparkCard.continueEstimate")
                : t("ballparkCard.editEstimate")}

            </Button>
          )}




          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="h-12 w-full sm:w-auto">
                <MoreHorizontal className="mr-1 size-4" aria-hidden />
                {t("ballparkCard.moreOptions")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <DropdownMenuItem
                data-testid="ballpark-assumptions-action"
                onSelect={() => goToBallpark("inputs")}
              >
                {clarifications.status === "completed" ? (
                  <CheckCircle2 className="mr-2 size-4 text-success" aria-hidden />
                ) : (
                  <Pencil className="mr-2 size-4" aria-hidden />
                )}
                {t(assumptionsCta.key, { count: assumptionsCta.count })}
              </DropdownMenuItem>
              {/* Refinement interview withdrawn from Ballpark (Detailed only). */}
              <DropdownMenuItem onSelect={() => goToBallpark("chooser")}>
                <Gauge className="mr-2 size-4" aria-hidden />
                {t("ballparkCard.changeMethod")}
              </DropdownMenuItem>
              {hasDraft ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={durable.discard.isPending}
                    onSelect={() => durable.discard.mutate()}
                  >
                    <Trash2 className="mr-2 size-4" aria-hidden />
                    {bq("draft.discard")}
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>

          <p className="text-xs text-foreground-muted sm:ml-auto" role="status" aria-live="polite">
            {typeof navigator !== "undefined" && !navigator.onLine
              ? bq("persistence.offline")
              : durable.persistComplete.isPending
                ? bq("persistence.saving")
                : durable.persistComplete.isError
                  ? bq("persistence.error")
                  : savedSummary || durable.persistComplete.isSuccess
                    ? bq("persistence.saved")
                    : null}
          </p>
        </div>


      </CardContent>
      <ConvertToDetailedDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        pending={!!converting}
        onConfirm={async () => {
          await onConvertToDetailed?.();
          setConvertOpen(false);
        }}
      />
    </Card>
  );
}
