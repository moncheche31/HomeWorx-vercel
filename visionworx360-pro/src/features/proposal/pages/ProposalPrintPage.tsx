import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Download, Printer, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { InlineError } from "@/components/feedback/InlineError";
import { logger } from "@/lib/logging/logger";
import { useProposal } from "../hooks/useProposal";
import { ProposalDocumentView } from "../components/ProposalDocumentView";

/**
 * Document-style proposal preview for printing / browser "Save as PDF".
 *
 * It renders the SAME composed proposal document as the in-app proposal
 * screen — same branding, same client-facing scope, same authoritative
 * pricing, same template — with no app chrome around it. There is no second
 * proposal data model and nothing is recalculated or written back.
 *
 * There is no direct PDF generator: the browser print dialog's "Save as PDF"
 * is the reliable V1 path, and the labels say exactly that.
 */
export function ProposalPrintPage() {
  const { projectId } = useParams({ from: "/proposal-print/$projectId" });
  const { autoprint } = useSearch({ from: "/proposal-print/$projectId" });
  const { t } = useTranslation("proposal");
  const [canShare, setCanShare] = useState(false);
  const autoPrinted = useRef(false);

  // Always the customer-facing document — a printed proposal is what the
  // customer receives, never the contractor-only view.
  const proposal = useProposal(projectId, "customer");
  const doc = proposal.document;
  const ready = !proposal.error && !proposal.loading && proposal.hydrated && !!doc;

  useEffect(() => {
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  /**
   * Auto-open the print dialog only once the saved proposal settings have
   * hydrated and the document is composed, so the printed output never uses
   * default template/theme/section settings.
   */
  useEffect(() => {
    if (!autoprint || autoPrinted.current || !ready) return;
    autoPrinted.current = true;
    const id = window.setTimeout(() => {
      try {
        window.print();
      } catch (error) {
        logger.error("proposal_print", {
          event: "print dialog failed",
          projectId,
          reason: error instanceof Error ? error.message : "unknown",
        });
      }
    }, 250);
    return () => window.clearTimeout(id);
  }, [autoprint, ready, projectId]);

  const share = async () => {
    try {
      await navigator.share({ title: doc?.projectName ?? "", url: window.location.href });
    } catch {
      /* user dismissed the share sheet */
    }
  };

  return (
    <div className="proposal-print-page min-h-screen bg-surface-muted py-6 print:bg-white print:py-0">
      <div className="proposal-no-print mx-auto mb-4 flex w-full max-w-[8.5in] flex-wrap items-center gap-2 px-4">
        <Button asChild variant="ghost" className="-ml-2 min-h-11">
          <Link to="/app/proposal/$projectId" params={{ projectId }}>
            <ArrowLeft className="size-4" aria-hidden />
            {t("toolbar.back")}
          </Link>
        </Button>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canShare ? (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void share()}>
              <Share2 className="size-4" aria-hidden />
              {t("toolbar.share")}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={!ready}
            aria-label={t("toolbar.savePdf")}
            onClick={() => window.print()}
          >
            <Download className="size-4" aria-hidden />
            {t("toolbar.savePdf")}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={!ready}
            aria-label={t("toolbar.printProposal")}
            onClick={() => window.print()}
          >
            <Printer className="size-4" aria-hidden />
            {t("toolbar.printProposal")}
          </Button>
        </div>
      </div>

      <main className="proposal-print-sheet mx-auto w-full max-w-[8.5in] bg-white px-[0.5in] py-[0.5in] text-black shadow-sm print:max-w-none print:px-0 print:py-0 print:shadow-none">
        {proposal.error ? (
          <div className="proposal-no-print">
            <InlineError message={t("print.error")} onRetry={proposal.refetch} />
          </div>
        ) : proposal.loading || !proposal.hydrated || !doc ? (
          <div className="proposal-no-print">
            <LoadingSpinner />
          </div>
        ) : doc.awaitingApproval && doc.scopeSections.length === 0 && doc.gallery.length === 0 ? (
          <div className="proposal-no-print">
            <EmptyState title={t("empty.title")} description={t("empty.body")} />
          </div>
        ) : (
          <ProposalDocumentView
            doc={doc}
            tokens={proposal.tokens}
            currency={proposal.currency}
            selectedLevel={null}
            onSelectLevel={() => {}}
            onAccept={() => {}}
            onResetAcceptance={() => {}}
          />
        )}
      </main>
    </div>
  );
}
