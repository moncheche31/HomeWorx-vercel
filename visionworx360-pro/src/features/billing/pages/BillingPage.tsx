import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CreditCard, ExternalLink, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/i18n/format";
import {
  getBillingStatus,
  openBillingPortal,
  startSubscriptionCheckout,
} from "../services/billing.functions";

/**
 * Plan and subscription surface. All state comes from the server; the browser
 * never decides entitlement, and every action fails safely (with an explicit
 * message) when Stripe is not configured yet.
 */
export function BillingPage() {
  const { t, i18n } = useTranslation(["billing", "common"]);
  const statusFn = useServerFn(getBillingStatus);
  const checkoutFn = useServerFn(startSubscriptionCheckout);
  const portalFn = useServerFn(openBillingPortal);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = useQuery({
    queryKey: ["billing", "status"],
    queryFn: () => statusFn(),
    staleTime: 30_000,
  });

  const data = query.data;
  const date = (value: string | null) =>
    value ? formatDate(new Date(value), i18n.language) : null;

  const run = async (action: "checkout" | "portal") => {
    setError(null);
    setBusy(true);
    try {
      const returnUrl = `${window.location.origin}/app/billing`;
      const result =
        action === "checkout"
          ? await checkoutFn({ data: { returnUrl } })
          : await portalFn({ data: { returnUrl } });
      window.location.href = result.url;
    } catch (e) {
      const message = String((e as Error)?.message ?? "");
      setError(
        message.includes("billing_not_configured")
          ? t("errors.notConfigured")
          : message.includes("billing_no_customer")
            ? t("errors.noCustomer")
            : t("errors.generic"),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <header className="mb-(--density-gap)">
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-sm text-foreground-muted">{t("description")}</p>
      </header>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="size-4" aria-hidden />
              {t("plan.name")}
            </CardTitle>
            <Badge variant={data?.entitled ? "default" : "secondary"}>
              {t(`status.${data?.status ?? "none"}`)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-base text-foreground sm:text-sm">{t("plan.summary")}</p>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <dt className="text-xs uppercase tracking-wide text-foreground-muted">
                {t("fields.trial")}
              </dt>
              <dd className="text-base font-medium text-foreground">
                {date(data?.trialEndsAt ?? null) ??
                  t("fields.trialLength", { days: data?.trialDays ?? 14 })}
              </dd>
            </div>
            <div className="rounded-lg border border-border p-3">
              <dt className="text-xs uppercase tracking-wide text-foreground-muted">
                {t("fields.renews")}
              </dt>
              <dd className="text-base font-medium text-foreground">
                {date(data?.currentPeriodEnd ?? null) ?? "—"}
              </dd>
            </div>
          </dl>

          {data?.cancelAtPeriodEnd ? (
            <p className="text-sm text-warning">{t("notices.cancelling")}</p>
          ) : null}

          {data && !data.configured ? (
            <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              <div>
                <p className="text-sm font-medium text-foreground">{t("notConfigured.title")}</p>
                <p className="mt-1 text-sm text-foreground-muted">{t("notConfigured.body")}</p>
              </div>
            </div>
          ) : null}

          {data?.status === "past_due" || data?.status === "unpaid" ? (
            <p className="text-sm text-danger">{t("notices.pastDue")}</p>
          ) : null}

          {error ? <p className="text-sm text-danger">{error}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button
              className="min-h-(--control-min-h) w-full text-base sm:w-auto sm:text-sm"
              disabled={busy || !data?.configured || query.isLoading}
              onClick={() => void run("checkout")}
            >
              {data?.entitled ? t("actions.changePlan") : t("actions.startTrial")}
            </Button>
            <Button
              variant="outline"
              className="min-h-(--control-min-h) w-full text-base sm:w-auto sm:text-sm"
              disabled={busy || !data?.configured || !data?.hasCustomer}
              onClick={() => void run("portal")}
            >
              <ExternalLink className="mr-2 size-4" aria-hidden />
              {t("actions.manage")}
            </Button>
          </div>

          <p className="text-xs text-foreground-muted">{t("plan.pricingNote")}</p>
        </CardContent>
      </Card>
    </div>
  );
}
