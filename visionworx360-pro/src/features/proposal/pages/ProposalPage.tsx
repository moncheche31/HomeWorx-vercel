import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import {
  WorkspaceBackFooter,
  workspaceBackLinkClass,
} from "@/components/navigation/workspaceBack";
import { EmptyState } from "@/components/feedback/EmptyState";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { InlineError } from "@/components/feedback/InlineError";
import { DEFAULT_WARRANTY, type ProposalAudience } from "@/domains/proposal";
import { useProposal } from "../hooks/useProposal";
import { useProposalSharing } from "../hooks/useProposalSharing";
import { ProposalToolbar } from "../components/ProposalToolbar";
import { ProposalSendDialog } from "../components/ProposalSendDialog";
import { ProposalClientActivity } from "../components/ProposalClientActivity";
import { ProposalSettingsSheet } from "../components/ProposalSettingsSheet";
import { ContractorBreakdownPanel } from "@/components/estimating/ContractorBreakdownPanel";
import { ProposalDocumentView } from "../components/ProposalDocumentView";

/**
 * Module 014 — the customer-facing sales presentation for one project.
 * Everything shown here is assembled from approved artefacts; nothing is
 * recalculated and nothing is written back to the scope or estimate.
 */
export function ProposalPage() {
  const { projectId } = useParams({ from: "/app/proposal/$projectId" });
  const { t } = useTranslation("proposal");
  const [audience, setAudience] = useState<ProposalAudience>("customer");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [selectedLevel, setSelectedLevel] = useState<string | null>(null);

  const proposal = useProposal(projectId, audience);
  const sharing = useProposalSharing(projectId);
  const doc = proposal.document;

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8">
      <header className="proposal-no-print mb-5 space-y-3">
        <Link
          to="/app/projects/$projectId"
          params={{ projectId }}
          aria-label={t("toolbar.back")}
          className={workspaceBackLinkClass("top")}
        >
          <ArrowLeft className="size-5 shrink-0" aria-hidden />
          <span>{t("toolbar.back")}</span>
        </Link>

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold md:text-3xl">{t("title")}</h1>
          <p className="text-sm text-foreground-muted">{t("subtitle")}</p>
        </div>
        <p className="text-sm font-medium">
          {t("template.current")}{" "}
          <span className="text-foreground-muted">
            {t(`template.${proposal.settings.template ?? "contractor"}.label`)}
          </span>
        </p>
        <ProposalToolbar
          template={proposal.settings.template ?? "contractor"}
          onTemplateChange={proposal.setTemplate}
          theme={proposal.settings.theme}
          onThemeChange={proposal.setTheme}
          audience={audience}
          onAudienceChange={setAudience}
          onOpenSettings={() => setSettingsOpen(true)}
          projectId={projectId}
          onSendToClient={() => setSendOpen(true)}
          canSend={Boolean(doc)}
        />
      </header>

      <ProposalClientActivity
        shares={sharing.shares}
        requests={sharing.requests}
        onRevoke={(id) => sharing.revokeShare.mutate(id)}
        onDisposition={(input) => sharing.disposition.mutate(input)}
        busy={sharing.revokeShare.isPending || sharing.disposition.isPending}
      />

      {proposal.error ? (
        <InlineError message={t("empty.body")} onRetry={proposal.refetch} />
      ) : proposal.loading || !doc ? (
        <LoadingSpinner />
      ) : doc.awaitingApproval && doc.scopeSections.length === 0 && doc.gallery.length === 0 ? (
        <EmptyState title={t("empty.title")} description={t("empty.body")} />
      ) : (
        <ProposalDocumentView
          doc={doc}
          tokens={proposal.tokens}
          currency={proposal.currency}
          selectedLevel={selectedLevel}
          onSelectLevel={setSelectedLevel}
          onAccept={proposal.accept}
          onResetAcceptance={proposal.clearAcceptance}
        />
      )}

      {/*
        Internal contractor view only. Shown for EVERY audience the contractor
        previews (customer, realtor, buyer) because the reviewer is the
        authenticated contractor; it is excluded from the document itself, the
        share snapshot, the print/PDF output and the client portal.
      */}
      {doc ? (
        <ContractorBreakdownPanel
          breakdown={proposal.contractorBreakdown}
          currency={proposal.currency}
          className="mt-4"
        />
      ) : null}

      {doc ? (
        <ProposalSendDialog
          open={sendOpen}
          onOpenChange={setSendOpen}
          projectName={doc.projectName}
          companyName={doc.branding.companyName}
          clientEmail={proposal.clientEmail}
          clientName={proposal.clientName}
          nextVersion={sharing.shares.length + 1}
          pending={sharing.send.isPending}
          onSend={(input) =>
            sharing.send.mutateAsync({
              ...input,
              // The client always receives the customer-facing document,
              // regardless of which audience the contractor is previewing.
              document: proposal.customerDocument ?? doc,
              locale: proposal.locale,
              logoPath: proposal.logoPath,
              estimateId: proposal.estimateId,
            })
          }
        />
      ) : null}

      <ProposalSettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        settings={proposal.settings}
        onToggleLevel={proposal.toggleLevel}
        onToggleSection={proposal.toggleSection}
        onUpdate={proposal.update}
        onReset={proposal.reset}
        template={proposal.settings.template ?? "contractor"}
        onTemplateChange={proposal.setTemplate}
        defaultWarranty={DEFAULT_WARRANTY[proposal.locale]}
        defaultVision={doc?.vision ?? ""}
      />
      <WorkspaceBackFooter className="proposal-no-print">
        <Link
          to="/app/projects/$projectId"
          params={{ projectId }}
          aria-label={t("toolbar.back")}
          className={workspaceBackLinkClass("bottom")}
        >
          <ArrowLeft className="size-5 shrink-0" aria-hidden />
          <span>{t("toolbar.back")}</span>
        </Link>
      </WorkspaceBackFooter>
    </div>
  );
}
