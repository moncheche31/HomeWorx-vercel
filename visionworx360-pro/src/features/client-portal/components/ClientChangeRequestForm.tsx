import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
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
import { Checkbox } from "@/components/ui/checkbox";
import { InlineError } from "@/components/feedback/InlineError";
import { InformationNotice } from "@/components/feedback/Notice";
import type { ChangeRequestSelection } from "@/domains/proposal/share";
import { submitProposalChangeRequest } from "@/features/proposal/services/proposalShare.functions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  options: ChangeRequestSelection[];
  onSubmitted?: () => void;
}

/**
 * "Request Changes" — the client's only write path, and it writes to a
 * change-request record, never to the proposal. Structured picks are limited
 * to options the contractor already published in this proposal version, and
 * even those are stored as *requested* until the contractor applies them.
 */
export function ClientChangeRequestForm({ open, onOpenChange, token, options, onSubmitted }: Props) {
  const { t } = useTranslation("proposal");
  const submitFn = useServerFn(submitProposalChangeRequest);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMessage("");
    setPicked([]);
    setError(null);
    setDone(false);
  }, [open]);

  const mutation = useMutation({
    mutationFn: async () =>
      submitFn({
        data: {
          token,
          kind: "change_request" as const,
          message: message.trim(),
          selections: options.filter((o) => picked.includes(`${o.kind}:${o.key}`)),
          requesterName: name.trim() || undefined,
          requesterEmail: email.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setDone(true);
      onSubmitted?.();
    },
    onError: (cause: unknown) => {
      const reason = cause instanceof Error ? cause.message : "";
      setError(
        reason.includes("REVOKED")
          ? t("portal.revoked")
          : reason.includes("EXPIRED")
            ? t("portal.expired")
            : t("portal.submitError"),
      );
    },
  });

  const submit = () => {
    if (message.trim().length < 2) {
      setError(t("portal.messageRequired"));
      return;
    }
    setError(null);
    mutation.mutate();
  };

  const toggle = (id: string) =>
    setPicked((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("portal.requestChanges")}</DialogTitle>
          <DialogDescription>{t("portal.requestHint")}</DialogDescription>
        </DialogHeader>

        {done ? (
          <InformationNotice title={t("portal.submitted")} description={t("portal.submittedBody")} />
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cr-message">{t("portal.message")}</Label>
              <Textarea
                id="cr-message"
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("portal.messagePlaceholder")}
              />
            </div>

            {options.length > 0 ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">{t("portal.options")}</legend>
                {options.map((option) => {
                  const id = `${option.kind}:${option.key}`;
                  return (
                    <label key={id} className="flex min-h-11 items-center gap-2 text-sm">
                      <Checkbox checked={picked.includes(id)} onCheckedChange={() => toggle(id)} />
                      <span>{option.label}</span>
                    </label>
                  );
                })}
              </fieldset>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="cr-name">{t("portal.yourName")}</Label>
                <Input id="cr-name" className="min-h-11" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="cr-email">{t("portal.yourEmail")}</Label>
                <Input
                  id="cr-email"
                  type="email"
                  inputMode="email"
                  className="min-h-11"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>

            {error ? <InlineError message={error} /> : null}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button type="button" className="min-h-11" onClick={() => onOpenChange(false)}>
              {t("portal.close")}
            </Button>
          ) : (
            <Button
              type="button"
              className="min-h-11"
              disabled={mutation.isPending}
              onClick={submit}
              data-testid="client-submit-change-request"
            >
              {t("portal.submit")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
