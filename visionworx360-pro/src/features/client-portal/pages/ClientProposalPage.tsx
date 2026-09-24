import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquarePlus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LoadingSpinner } from "@/components/feedback/LoadingSpinner";
import { EmptyState } from "@/components/feedback/EmptyState";
import { themeTokens, type ProposalDocument } from "@/domains/proposal";
import { shareSelectableOptions } from "@/domains/proposal/share";
import { ProposalDocumentView } from "@/features/proposal/components/ProposalDocumentView";
import { ProposalAssetProvider } from "@/features/proposal/components/ProposalAssetProvider";
import {
  getSharedProposal,
  getSharedProposalAsset,
} from "@/features/proposal/services/proposalShare.functions";
import { ClientChangeRequestForm } from "../components/ClientChangeRequestForm";

/**
 * Client portal — the homeowner's read-only view of exactly the proposal
 * version the contractor sent, opened with a secure share token.
 *
 * Read-only is structural, not cosmetic: the portal has no write path to any
 * contractor-owned record. The only thing a client can submit is a change
 * request, which lands in its own table for the contractor to disposition.
 */
export function ClientProposalPage() {
  const { token } = useParams({ from: "/p/$token" });
  const { t } = useTranslation("proposal");
  const load = useServerFn(getSharedProposal);
  const signAsset = useServerFn(getSharedProposalAsset);
  const [requestOpen, setRequestOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["shared-proposal", token],
    queryFn: async () => load({ data: { token } }),
    retry: false,
  });

  const resolve = useCallback(
    async (storagePath: string) => (await signAsset({ data: { token, storagePath } })).url,
    [signAsset, token],
  );

  const logoPath = query.data?.logoPath ?? null;
  useEffect(() => {
    if (!logoPath) return;
    let active = true;
    resolve(logoPath)
      .then((url) => active && setLogoUrl(url))
      .catch(() => active && setLogoUrl(null));
    return () => {
      active = false;
    };
  }, [logoPath, resolve]);

  const doc: ProposalDocument | null = useMemo(() => {
    if (!query.data) return null;
    const base = query.data.document;
    return { ...base, branding: { ...base.branding, logoUrl } };
  }, [query.data, logoUrl]);

  const submit = useMutation({ mutationFn: async () => undefined });

  if (query.isLoading) return <LoadingSpinner />;

  if (query.isError || !doc) {
    const reason = query.error instanceof Error ? query.error.message : "";
    const key = reason.includes("REVOKED")
      ? "portal.revoked"
      : reason.includes("EXPIRED")
        ? "portal.expired"
        : "portal.notFound";
    return (
      <main className="mx-auto w-full max-w-2xl px-4 py-10">
        <EmptyState title={t(key)} description={t("portal.contactContractor")} />
      </main>
    );
  }

  const currency = "USD";

  return (
    <div className="min-h-screen bg-surface-muted py-6 print:bg-white print:py-0">
      <div className="mx-auto w-full max-w-4xl px-4 md:px-8">
        <header className="proposal-no-print mb-4 flex flex-wrap items-center gap-2">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold md:text-2xl">{doc.projectName}</h1>
            <p className="text-sm text-foreground-muted">
              {t("portal.version", { version: query.data?.shareVersion ?? 1 })}
            </p>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => window.print()}
            >
              <Printer className="size-4" aria-hidden />
              {t("toolbar.savePdf")}
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => setRequestOpen(true)}
              data-testid="client-request-changes"
            >
              <MessageSquarePlus className="size-4" aria-hidden />
              {t("portal.requestChanges")}
            </Button>
          </div>
        </header>

        <ProposalAssetProvider resolve={resolve}>
          <ProposalDocumentView
            doc={doc}
            tokens={themeTokens(doc.theme)}
            currency={currency}
            selectedLevel={null}
            onSelectLevel={() => undefined}
            onAccept={() => undefined}
            onResetAcceptance={() => undefined}
            readOnly
          />
        </ProposalAssetProvider>

        <Card className="proposal-no-print mt-5">
          <CardContent className="p-4 text-sm text-foreground-muted">
            {t("portal.readOnlyNote")}
          </CardContent>
        </Card>

        <ClientChangeRequestForm
          open={requestOpen}
          onOpenChange={setRequestOpen}
          token={token}
          options={shareSelectableOptions(doc)}
          onSubmitted={() => submit.reset()}
        />
      </div>
    </div>
  );
}
