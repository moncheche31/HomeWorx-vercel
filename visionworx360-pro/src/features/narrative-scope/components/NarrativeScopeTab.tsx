import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  FileText,
  HelpCircle,
  Pencil,
  RefreshCw,
  Settings2,
  Calculator,
  ArrowLeft,
  DoorOpen,
  NotebookPen,
  MoreHorizontal,
  History,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { RetryPanel } from "@/components/feedback/RetryPanel";
import { ScopeTab } from "@/features/scope/components/ScopeTab";
import { ScopeValidationPanel } from "@/features/scope/components/ScopeValidationPanel";
import { useScopeValidation } from "@/features/scope/hooks/useScopeValidation";
import {
  clarificationLabel,
  countAnsweredEntries,
  deriveClarificationState,
} from "@/domains/estimating";
import type { EstimatingMode } from "@/domains/estimating/modes";
import { useEstimatesQuery } from "@/features/estimating/hooks/useEstimating";
import { useProjectDescriptionNote } from "@/features/voice-capture/hooks/useProjectDescriptionNote";
import { useNarrativeScope } from "../hooks/useNarrativeScope";
import { useNarrativeInterpretation } from "../hooks/useNarrativeInterpretation";
import { ReviewScopeChangesDialog } from "./ReviewScopeChangesDialog";
import { NarrativeQuestionsPanel } from "./NarrativeQuestionsPanel";
import { NarrativeDocumentView } from "./NarrativeDocumentView";
import { DecisionHistoryDialog } from "./DecisionHistoryDialog";
import { ProjectRoomsTab } from "@/features/project-workspace/components/ProjectRoomsTab";
import { ProjectNotesSection } from "@/features/project-workspace/components/ProjectNotesSection";

interface Props {
  projectId: string;
  projectName: string;
  onCreateEstimate?: () => void;
}

type Mode = "narrative" | "advanced";
type Panel = "none" | "edit" | "questions";
/** Secondary work areas reached from Scope > More Options (navigation only). */
type Subview = "scope" | "rooms" | "notes";

/**
 * Default contractor experience (Module 010B). The structured Scope Builder
 * lives behind "Advanced Edit"; nothing about the data model or the estimating
 * engine changes — this is presentation only.
 */
export function NarrativeScopeTab({ projectId, projectName, onCreateEstimate }: Props) {
  const { t, i18n } = useTranslation("narrative");
  const [mode, setMode] = useState<Mode>("narrative");
  const [panel, setPanel] = useState<Panel>("none");
  const [historyOpen, setHistoryOpen] = useState(false);

  const [draftText, setDraftText] = useState("");
  const [subview, setSubview] = useState<Subview>("scope");

  const n = useNarrativeScope(projectId, projectName);
  const interp = useNarrativeInterpretation(projectId);
  const captured = useProjectDescriptionNote(projectId);
  const estimates = useEstimatesQuery(projectId);
  const activeEstimates = (estimates.data ?? []).filter((e) => !e.archivedAt);
  const hasEstimate = activeEstimates.length > 0;
  /*
   * The scope review follows the deepest estimate level in play. Until a
   * detailed estimate exists the contractor is still in ballpark territory, so
   * trade-assignment and labor findings stay optional.
   */
  const estimatingMode: EstimatingMode = activeEstimates.some(
    (e) => e.intakeMode === "detailed",
  )
    ? "detailed"
    : "ballpark";
  /* Pre-approval sanity check: guardrail only, never rewrites scope. */
  const validation = useScopeValidation(projectId, n.displayText, estimatingMode);

  /**
   * Saving the wording is a scope edit, not a text edit: the narrative is
   * interpreted against the structured scope first. Wording-only changes save
   * silently; confident structural changes apply straight through; anything
   * uncertain (and every removal) goes to Review Scope Changes.
   */
  const handleSaveWording = async () => {
    const result = interp.begin(n.displayText, draftText);
    // Persist the wording FIRST: a later reload must never lose the contractor's
    // text, even when the structured interpretation still needs review.
    await Promise.resolve(n.saveWording(draftText));
    if (result.isWordingOnly) {
      interp.cancel();
      setPanel("none");
      toast.success(t("toast.saved"));
      return;
    }
    if (result.requiresReview) {
      setPanel("none");
      return; // dialog opens from `interp.interpretation`
    }
    const { applied } = await interp.apply(result.changes);
    if (applied > 0) await n.invalidateApproval();
    setPanel("none");
    toast.success(t("toast.scopeUpdated", { count: applied }));
  };

  /**
   * State-aware clarification CTA: first-time, "N new questions" after a scope
   * change, or "Review / Revise Answers" once everything is answered. Derived
   * from the persisted narrative record, so it survives refresh and navigation.
   */
  const questionState = useMemo(
    () =>
      deriveClarificationState({
        answeredCount: countAnsweredEntries(n.record.answers),
        openCount: n.questions.length,
      }),
    [n.record.answers, n.questions.length],
  );
  const questionCta = clarificationLabel(questionState, {
    unstarted: n.questions.length ? "actions.questionsCount" : "actions.questions",
    completed: "actions.questionsReview",
    fresh: "actions.questionsNew",
  });

  const capturedSection = captured.text ? (
    <Card data-testid="captured-project-description">
      <CardContent className="space-y-2 p-5">
        <h3 className="text-base font-semibold">{t("capturedDescription.title")}</h3>
        <p className="text-sm text-foreground-muted">{t("capturedDescription.hint")}</p>
        <p className="whitespace-pre-wrap text-base leading-relaxed text-foreground">
          {captured.text}
        </p>
        <Button asChild variant="outline" className="min-h-(--control-min-h) w-full sm:w-auto">
          <Link to="/app/capture" search={{ projectId, projectName }}>
            <Pencil className="mr-2 size-4" aria-hidden />
            {t("actions.editDescription")}
          </Link>
        </Button>
      </CardContent>
    </Card>
  ) : null;

  const approvedDate = useMemo(() => {
    if (!n.record.approvedAt) return null;
    return new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
      new Date(n.record.approvedAt),
    );
  }, [n.record.approvedAt, i18n.language]);

  /**
   * Approval invalidation is structural: a prior approval only goes stale when
   * the structured scope changed (see `useNarrativeScope`). Wording-only edits
   * keep the approval, so cosmetic rewrites never send the contractor back
   * through Approve Scope.
   */
  const isStale = !!n.needsReapproval;

  /** Approved AND still current: the approval reflects the displayed scope. */
  const isApprovedCurrent = !!n.record.approvedAt && !isStale;

  if (subview !== "scope") {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          data-testid="scope-subview-back"
          className="min-h-(--control-min-h) w-full text-base sm:w-auto"
          onClick={() => setSubview("scope")}
        >
          <ArrowLeft className="mr-2 size-5" aria-hidden />
          {t("actions.backToScope")}
        </Button>
        {subview === "rooms" ? (
          <ProjectRoomsTab projectId={projectId} />
        ) : (
          <ProjectNotesSection projectId={projectId} roomId={null} />
        )}
      </div>
    );
  }

  if (mode === "advanced") {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          className="min-h-(--control-min-h) w-full"
          onClick={() => setMode("narrative")}
        >
          <FileText className="mr-2 size-5" aria-hidden />
          {t("actions.simple")}
        </Button>
        <div className="space-y-1">
          <h2 className="text-lg font-semibold">{t("actions.advanced")}</h2>
          <p className="text-sm text-foreground-muted">{t("actions.advancedHint")}</p>
        </div>
        <ScopeTab projectId={projectId} capturedDescription={captured.text || null} />
      </div>
    );
  }

  if (n.loading) return <LoadingSpinner />;
  if (n.error) return <RetryPanel onRetry={n.refetch} />;

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          {isStale ? (
            <Badge variant="outline" data-testid="scope-needs-approval-badge">
              {t("needsApproval")}
            </Badge>
          ) : approvedDate ? (
            <Badge variant="secondary">{t("approved", { date: approvedDate })}</Badge>
          ) : null}
        </div>
        <p className="text-sm text-foreground-muted">{t("subtitle")}</p>
        {isStale ? <p className="text-sm text-warning">{t("pendingChanges")}</p> : null}
      </header>

      {capturedSection}

      {!n.hasItems ? (
        <Card>
          <CardContent className="space-y-4 p-5">
            {!captured.text ? (
              <EmptyState title={t("empty.title")} description={t("empty.body")} />
            ) : null}

            {captured.text ? (
              <p className="text-sm text-foreground-muted">
                {t("capturedDescription.noStructured")}
              </p>
            ) : null}

            <Button className="min-h-(--control-min-h) w-full" onClick={() => setMode("advanced")}>
              <Settings2 className="mr-2 size-5" aria-hidden />
              {t("actions.editScope")}
            </Button>
            <p className="text-sm text-foreground-muted">{t("actions.advancedHint")}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                variant="outline"
                data-testid="scope-rooms-action-empty"
                className="min-h-(--control-min-h) w-full text-base"
                onClick={() => setSubview("rooms")}
              >
                <DoorOpen className="mr-2 size-5" aria-hidden />
                {t("actions.rooms")}
              </Button>
              <Button
                variant="outline"
                data-testid="scope-notes-action-empty"
                className="min-h-(--control-min-h) w-full text-base"
                onClick={() => setSubview("notes")}
              >
                <NotebookPen className="mr-2 size-5" aria-hidden />
                {t("actions.notes")}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {panel === "edit" ? (
            <div className="space-y-3">
              <div>
                <h3 className="text-base font-semibold">{t("editor.title")}</h3>
                <p className="text-sm text-foreground-muted">{t("editor.hint")}</p>
              </div>
              <Textarea
                className="min-h-72 text-base leading-relaxed"
                value={draftText}
                onChange={(e) => setDraftText(e.target.value)}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  className="min-h-(--control-min-h)"
                  data-testid="scope-save-wording"
                  disabled={interp.applying}
                  onClick={() => {
                    void handleSaveWording();
                  }}
                >
                  {t("actions.save")}
                </Button>

                <Button
                  variant="outline"
                  className="min-h-(--control-min-h)"
                  onClick={() => setPanel("none")}
                >
                  {t("actions.cancel")}
                </Button>
              </div>
            </div>
          ) : panel === "questions" ? (
            <NarrativeQuestionsPanel
              questions={n.questions}
              answeredQuestions={n.answeredQuestions}
              answers={n.record.answers}
              onClose={() => setPanel("none")}
              onSave={(answers) => {
                /**
                 * Answers land in the canonical narrative record and become
                 * scope prose. Substantive decisions (what work is included,
                 * method or product choice) invalidate a prior approval;
                 * wording-only clarifications never do.
                 */
                const substantive = n.questions.some(
                  (q) => q.substantive && (answers[q.id] ?? "").trim().length > 0,
                );
                void (async () => {
                  await Promise.resolve(n.saveAnswers(answers));
                  if (substantive && n.record.approvedAt) await n.invalidateApproval();
                })();
                setPanel("none");
                toast.success(t("toast.answers"));
              }}
            />
          ) : (
            <>
              <NarrativeDocumentView text={n.displayText} />

              {isApprovedCurrent ? (
                <div
                  data-testid="scope-approved-banner"
                  role="status"
                  className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4"
                >
                  <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden />
                  <div className="space-y-0.5">
                    <p className="text-base font-semibold text-foreground">
                      {t("approvedBanner.title")}
                    </p>
                    <p className="text-sm text-foreground-muted">
                      {approvedDate
                        ? t("approvedBanner.bodyDated", { date: approvedDate })
                        : t("approvedBanner.body")}
                    </p>
                  </div>
                </div>
              ) : null}

              {!isApprovedCurrent && validation.report.findings.length > 0 ? (
                <ScopeValidationPanel
                  projectId={projectId}
                  items={validation.items}
                  findings={validation.activeFindings}
                  deferredFindings={validation.deferredFindings}
                  mode={validation.mode}
                  decidedSubjectKeys={validation.decidedSubjectKeys}
                  isSaving={validation.isSaving}
                  onDecide={validation.decide}
                  onDecideAll={validation.decideAll}
                />

              ) : null}

              {/* Exactly three visible actions: primary next step, Edit Scope, More Options. */}
              <div className="grid gap-2 sm:grid-cols-3">
                {isApprovedCurrent ? (
                  <Button
                    data-testid="scope-next-step-action"
                    className="min-h-(--control-min-h) w-full text-base sm:col-span-3"
                    onClick={() => onCreateEstimate?.()}
                  >
                    <Calculator className="mr-2 size-5" aria-hidden />
                    {hasEstimate ? t("actions.viewEstimate") : t("actions.estimate")}
                  </Button>
                ) : (
                  <Button
                    data-testid="scope-approve-action"
                    className="min-h-(--control-min-h) w-full text-base sm:col-span-3"
                    disabled={!validation.decision.canApprove}
                    onClick={() => {
                      if (!validation.decision.canApprove) {
                        toast.error(t("toast.validationBlocked"));
                        return;
                      }
                      void Promise.resolve(n.approve()).then(() =>
                        toast.success(t("toast.approved")),
                      );
                    }}
                  >
                    <CheckCircle2 className="mr-2 size-5" aria-hidden />
                    {isStale ? t("actions.approveUpdated") : t("actions.approve")}
                  </Button>
                )}

                <Button
                  variant="outline"
                  data-testid="scope-edit-action"
                  className="min-h-(--control-min-h) w-full text-base sm:col-span-2"
                  onClick={() => {
                    setDraftText(n.displayText);
                    setPanel("edit");
                  }}
                >
                  <Pencil className="mr-2 size-5" aria-hidden />
                  {t("actions.edit")}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      data-testid="scope-more-options"
                      className="min-h-(--control-min-h) w-full text-base"
                    >
                      <MoreHorizontal className="mr-2 size-5" aria-hidden />
                      {t("actions.moreOptions")}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-64 text-base">
                    <DropdownMenuItem
                      data-testid="scope-questions-action"
                      onSelect={() => setPanel("questions")}
                    >
                      {questionState.status === "completed" ? (
                        <CheckCircle2 className="mr-2 size-5 text-success" aria-hidden />
                      ) : (
                        <HelpCircle className="mr-2 size-5" aria-hidden />
                      )}
                      {t(questionCta.key, { count: questionCta.count })}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      data-testid="scope-regenerate-action"
                      onSelect={() => {
                        void Promise.resolve(n.regenerate()).then(() =>
                          toast.success(t("toast.regenerated")),
                        );
                      }}
                    >
                      <RefreshCw className="mr-2 size-5" aria-hidden />
                      {t("actions.regenerate")}
                    </DropdownMenuItem>

                    <DropdownMenuItem data-testid="scope-proposal-action" asChild>
                      <span>
                        <Link
                          to="/app/proposal/$projectId"
                          params={{ projectId }}
                          className="flex w-full items-center"
                        >
                          <FileText className="mr-2 size-5" aria-hidden />
                          {t("actions.proposal")}
                        </Link>
                      </span>
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      data-testid="scope-rooms-action"
                      onSelect={() => setSubview("rooms")}
                    >
                      <DoorOpen className="mr-2 size-5" aria-hidden />
                      {t("actions.rooms")}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      data-testid="scope-notes-action"
                      onSelect={() => setSubview("notes")}
                    >
                      <NotebookPen className="mr-2 size-5" aria-hidden />
                      {t("actions.notes")}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      data-testid="scope-history-action"
                      onSelect={() => setHistoryOpen(true)}
                    >
                      <History className="mr-2 size-5" aria-hidden />
                      {t("actions.history")}
                    </DropdownMenuItem>

                    <DropdownMenuItem
                      data-testid="scope-advanced-action"
                      onSelect={() => setMode("advanced")}
                    >
                      <Settings2 className="mr-2 size-5" aria-hidden />
                      {t("actions.advanced")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </>
          )}
        </>
      )}

      <DecisionHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        answers={n.record.answers ?? {}}
      />

      <ReviewScopeChangesDialog
        open={!!interp.interpretation && !interp.interpretation.isWordingOnly}
        changes={interp.interpretation?.changes ?? []}
        pending={interp.applying}
        onCancel={interp.cancel}
        onApply={(changes) => {
          void interp.apply(changes).then(({ applied }) => {
            if (applied > 0) void n.invalidateApproval();
            toast.success(t("toast.scopeUpdated", { count: applied }));
          });
        }}
      />
    </div>
  );
}
