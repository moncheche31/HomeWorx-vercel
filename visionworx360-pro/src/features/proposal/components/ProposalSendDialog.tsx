import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Check, Mail, Send } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { InlineError } from "@/components/feedback/InlineError";
import { InformationNotice } from "@/components/feedback/Notice";
import { defaultShareSubject } from "@/domains/proposal/share";
import type { SendProposalInput, SendProposalResult } from "../hooks/useProposalSharing";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectName: string;
  companyName: string;
  clientEmail: string | null;
  clientName: string | null;
  nextVersion: number;
  pending: boolean;
  onSend: (input: Omit<SendProposalInput, "document" | "locale" | "logoPath" | "estimateId">) =>
    Promise<SendProposalResult>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Email Proposal / Send to Client".
 *
 * Sending freezes the current customer-facing proposal into an immutable
 * share version and mints a secure, expiring, revocable link. Outbound email
 * from the app is not wired up yet (no sending domain is configured), so the
 * dialog hands the contractor the real link plus a prefilled message in their
 * own mail app — it never claims an email was delivered.
 */
export function ProposalSendDialog({
  open,
  onOpenChange,
  projectName,
  companyName,
  clientEmail,
  clientName,
  nextVersion,
  pending,
  onSend,
}: Props) {
  const { t } = useTranslation("proposal");
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendProposalResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setRecipient(clientEmail ?? "");
    setSubject(defaultShareSubject(projectName, companyName));
    setMessage(t("send.defaultMessage", { name: clientName ?? "" }).trim());
    setError(null);
    setResult(null);
    setCopied(false);
  }, [open, clientEmail, clientName, projectName, companyName, t]);

  const submit = async () => {
    const email = recipient.trim();
    if (!EMAIL_RE.test(email)) {
      setError(t("send.error.recipient"));
      return;
    }
    setError(null);
    try {
      const sent = await onSend({
        recipientEmail: email,
        recipientName: clientName,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
      });
      setResult(sent);
    } catch (cause) {
      const reason = cause instanceof Error ? cause.message : "";
      setError(
        reason.includes("PROJECT_NOT_FOUND")
          ? t("send.error.project")
          : reason.toLowerCase().includes("fetch") || reason.toLowerCase().includes("network")
            ? t("send.error.network")
            : t("send.error.save"),
      );
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.url);
      setCopied(true);
    } catch {
      setCopied(false);
      setError(t("send.error.copy"));
    }
  };

  const mailtoHref = result
    ? `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${message}\n\n${result.url}\n`)}`
    : "#";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("send.title")}</DialogTitle>
          <DialogDescription>
            {t("send.version", { version: result?.shareVersion ?? nextVersion })}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3" data-testid="proposal-send-result">
            <InformationNotice title={t("send.ready", { email: recipient })} />
            <div className="space-y-1">
              <Label htmlFor="share-link">{t("send.link")}</Label>
              <Input id="share-link" readOnly value={result.url} className="min-h-11" />
            </div>
            <p className="text-sm text-foreground-muted">{t("send.emailNotConfigured")}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void copy()}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? t("send.copied") : t("send.copy")}
              </Button>
              <Button asChild className="min-h-11">
                <a href={mailtoHref}>
                  <Mail className="size-4" aria-hidden />
                  {t("send.openMail")}
                </a>
              </Button>
            </div>
            {error ? <InlineError message={error} /> : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="share-recipient">{t("send.recipient")}</Label>
              <Input
                id="share-recipient"
                type="email"
                inputMode="email"
                className="min-h-11"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="client@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="share-subject">{t("send.subject")}</Label>
              <Input
                id="share-subject"
                className="min-h-11"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="share-message">{t("send.message")}</Label>
              <Textarea
                id="share-message"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
            {error ? <InlineError message={error} /> : null}
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>
              {t("send.done")}
            </Button>
          ) : (
            <Button type="button" className="min-h-11" disabled={pending} onClick={() => void submit()}>
              <Send className="size-4" aria-hidden />
              {t("send.action")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
