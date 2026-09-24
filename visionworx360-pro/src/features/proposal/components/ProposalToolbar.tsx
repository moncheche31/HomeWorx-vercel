import { useTranslation } from "react-i18next";
import { Link } from "@tanstack/react-router";
import { FileText, Printer, Send, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PROPOSAL_TEMPLATES,
  PROPOSAL_THEMES,
  type ProposalAudience,
  type ProposalTemplateKey,
  type ProposalTheme,
} from "@/domains/proposal";

interface Props {
  template: ProposalTemplateKey;
  onTemplateChange: (template: ProposalTemplateKey) => void;
  theme: ProposalTheme;
  onThemeChange: (theme: ProposalTheme) => void;
  audience: ProposalAudience;
  onAudienceChange: (audience: ProposalAudience) => void;
  onOpenSettings: () => void;
  /** Project the printable document view belongs to. */
  projectId: string;
  /** Opens the "Email Proposal / Send to Client" dialog. */
  onSendToClient: () => void;
  /** Disabled until there is a customer-facing document to freeze and share. */
  canSend: boolean;
}

/** Contractor-only controls. Hidden when printing. */
export function ProposalToolbar({
  template,
  onTemplateChange,
  theme,
  onThemeChange,
  audience,
  onAudienceChange,
  onOpenSettings,
  projectId,
  onSendToClient,
  canSend,
}: Props) {
  const { t } = useTranslation("proposal");

  return (
    <div className="proposal-no-print flex flex-wrap items-center gap-2">
      <Select
        value={template}
        onValueChange={(v) => onTemplateChange(v as ProposalTemplateKey)}
      >
        <SelectTrigger className="min-h-11 w-full sm:w-72" aria-label={t("toolbar.template")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROPOSAL_TEMPLATES.map((key) => (
            <SelectItem key={key} value={key}>
              {t(`template.${key}.label`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={theme} onValueChange={(v) => onThemeChange(v as ProposalTheme)}>
        <SelectTrigger className="min-h-11 w-36" aria-label={t("toolbar.theme")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PROPOSAL_THEMES.map((key) => (
            <SelectItem key={key} value={key}>
              {t(`theme.${key}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={audience} onValueChange={(v) => onAudienceChange(v as ProposalAudience)}>
        <SelectTrigger className="min-h-11 w-44" aria-label={t("toolbar.mode")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="customer">{t("mode.customer")}</SelectItem>
          <SelectItem value="contractor">{t("mode.contractor")}</SelectItem>
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={onOpenSettings}
      >
        <Settings2 className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t("toolbar.settings")}</span>
      </Button>

      {/*
        Both actions open the chrome-free document view used for printing and
        the browser's own "Save as PDF". Same proposal document model — there
        is no separate PDF generator, so the labels say so explicitly.

        Deliberately in-app navigation rather than a new browser tab: a new tab is a
        cold boot that has to restore the Supabase session from scratch, which
        raced the restore budget and dumped signed-in contractors on the
        sign-in screen. The print view has its own "Back to project" action.
      */}
      <Button
        type="button"
        className="min-h-11"
        onClick={onSendToClient}
        disabled={!canSend}
        data-testid="proposal-send-to-client"
      >
        <Send className="size-4" aria-hidden />
        {t("toolbar.sendToClient")}
      </Button>

      <Button asChild variant="outline" className="min-h-11">
        <Link
          to="/proposal-print/$projectId"
          params={{ projectId }}
          search={{ autoprint: undefined }}
          aria-label={t("toolbar.previewProposal")}
        >
          <FileText className="size-4" aria-hidden />
          {t("toolbar.previewProposal")}
        </Link>
      </Button>

      <Button asChild className="min-h-11">
        <Link
          to="/proposal-print/$projectId"
          params={{ projectId }}
          search={{ autoprint: true }}
          aria-label={t("toolbar.printProposal")}
        >
          <Printer className="size-4" aria-hidden />
          {t("toolbar.printProposal")}
        </Link>
      </Button>
    </div>
  );
}
