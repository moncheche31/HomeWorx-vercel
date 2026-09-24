import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, Link2Off, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, useLocale } from "@/i18n/format";
import {
  countOpenChangeRequests,
  isOpenChangeRequest,
  type ProposalChangeRequest,
  type ProposalShareSummary,
} from "@/domains/proposal/share";

interface Props {
  shares: ProposalShareSummary[];
  requests: ProposalChangeRequest[];
  onRevoke: (id: string) => void;
  onDisposition: (input: {
    id: string;
    status: "reviewing" | "applied" | "declined";
    contractorNote?: string;
  }) => void;
  busy: boolean;
}

/**
 * Contractor cockpit for everything the client did with a sent proposal.
 *
 * Nothing here lets the client's request touch the proposal itself. Applying a
 * request only records the contractor's decision; the revised proposal reaches
 * the client as a brand-new share version created from the contractor's own
 * updated document, leaving every previously sent version untouched.
 */
export function ProposalClientActivity({ shares, requests, onRevoke, onDisposition, busy }: Props) {
  const { t } = useTranslation("proposal");
  const locale = useLocale();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const open = countOpenChangeRequests(requests);

  if (shares.length === 0 && requests.length === 0) return null;

  return (
    <section className="proposal-no-print mb-5 space-y-3" data-testid="proposal-client-activity">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">{t("client.title")}</CardTitle>
          {open > 0 ? (
            <Badge variant="destructive" data-testid="proposal-pending-badge">
              {t("client.pending", { count: open })}
            </Badge>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {shares.length > 0 ? (
            <ul className="space-y-2">
              {shares.map((share) => (
                <li
                  key={share.id}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <span className="font-medium">{t("client.version", { version: share.shareVersion })}</span>
                  <span className="text-foreground-muted">{share.recipientEmail}</span>
                  <span className="text-foreground-muted">
                    {share.sentAt ? formatDate(share.sentAt, locale) : ""}
                  </span>
                  <Badge variant={share.status === "revoked" ? "outline" : "secondary"}>
                    {t(`client.status.${share.status}`)}
                  </Badge>
                  {share.viewCount > 0 ? (
                    <span className="text-xs text-foreground-muted">
                      {t("client.views", { count: share.viewCount })}
                    </span>
                  ) : null}
                  {share.status === "active" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="ml-auto min-h-11"
                      disabled={busy}
                      onClick={() => onRevoke(share.id)}
                    >
                      <Link2Off className="size-4" aria-hidden />
                      {t("client.revoke")}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {requests.length === 0 ? (
            <p className="text-sm text-foreground-muted">{t("client.noRequests")}</p>
          ) : (
            <ul className="space-y-3">
              {requests.map((req) => (
                <li key={req.id} className="space-y-2 rounded-md border border-border p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <MessageSquare className="size-4" aria-hidden />
                    <span className="font-medium">{t(`client.kind.${req.kind}`)}</span>
                    <Badge variant={isOpenChangeRequest(req.status) ? "destructive" : "secondary"}>
                      {t(`client.request.${req.status}`)}
                    </Badge>
                    <span className="text-foreground-muted">
                      {t("client.version", { version: req.shareVersion })}
                    </span>
                    <span className="text-foreground-muted">
                      {req.createdAt ? formatDate(req.createdAt, locale) : ""}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{req.message}</p>
                  {req.selections.length > 0 ? (
                    <ul className="flex flex-wrap gap-1">
                      {req.selections.map((sel) => (
                        <li key={`${sel.kind}-${sel.key}`}>
                          <Badge variant="outline">{sel.label}</Badge>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {req.contractorNote ? (
                    <p className="text-sm text-foreground-muted">{req.contractorNote}</p>
                  ) : null}

                  {isOpenChangeRequest(req.status) ? (
                    <div className="space-y-2">
                      <Textarea
                        rows={2}
                        aria-label={t("client.note")}
                        placeholder={t("client.note")}
                        value={notes[req.id] ?? ""}
                        onChange={(e) => setNotes((n) => ({ ...n, [req.id]: e.target.value }))}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() =>
                            onDisposition({
                              id: req.id,
                              status: "applied",
                              contractorNote: notes[req.id] || undefined,
                            })
                          }
                        >
                          {t("client.apply")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          className="min-h-11"
                          disabled={busy}
                          onClick={() =>
                            onDisposition({
                              id: req.id,
                              status: "declined",
                              contractorNote: notes[req.id] || undefined,
                            })
                          }
                        >
                          <Ban className="size-4" aria-hidden />
                          {t("client.decline")}
                        </Button>
                        {req.status === "requested" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="min-h-11"
                            disabled={busy}
                            onClick={() => onDisposition({ id: req.id, status: "reviewing" })}
                          >
                            {t("client.markReviewing")}
                          </Button>
                        ) : null}
                      </div>
                      <p className="text-xs text-foreground-muted">{t("client.applyHint")}</p>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
