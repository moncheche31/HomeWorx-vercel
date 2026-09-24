import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { BillingStatusDTO, SubscriptionStatus } from "../types";

const returnUrlSchema = z.object({
  returnUrl: z.string().url().max(500),
});

async function activeOrg(supabase: {
  rpc: (n: string, p?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
}): Promise<string> {
  const { data, error } = await supabase.rpc("current_active_organization_id");
  if (error) throw new Error("no_active_organization");
  const org = data as string | null;
  if (!org) throw new Error("no_active_organization");
  return org;
}

/**
 * Authoritative subscription state for the caller's organization.
 *
 * Read from the database row that only webhook processing can write, so the
 * browser can never assert its own entitlement.
 */
export const getBillingStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<BillingStatusDTO> => {
    const { readBillingConfig, isBillingConfigured, accessStatusFor } = await import(
      "./billing.server"
    );
    const config = readBillingConfig();
    const org = await activeOrg(context.supabase as never);

    const { data } = await context.supabase
      .from("organization_subscriptions")
      .select(
        "status, trial_ends_at, current_period_end, cancel_at_period_end, provider_customer_id, product_key",
      )
      .eq("organization_id", org)
      .maybeSingle();

    const row = (data ?? null) as Record<string, unknown> | null;
    const status = (row?.status as SubscriptionStatus | undefined) ?? "none";

    return {
      configured: isBillingConfigured(config),
      productKey: (row?.product_key as string | undefined) ?? config.productKey,
      status,
      trialDays: config.trialDays,
      trialEndsAt: (row?.trial_ends_at as string | null) ?? null,
      currentPeriodEnd: (row?.current_period_end as string | null) ?? null,
      cancelAtPeriodEnd: Boolean(row?.cancel_at_period_end),
      hasCustomer: Boolean(row?.provider_customer_id),
      entitled: accessStatusFor(status) === "active",
    };
  });

/**
 * Start (or resume) the Contractor Edition subscription with the configured
 * trial. Throws `billing_not_configured` when no Stripe Price ID is set —
 * there is deliberately no fallback price in code.
 */
export const startSubscriptionCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => returnUrlSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { readBillingConfig, isBillingConfigured, stripeRequest } = await import(
      "./billing.server"
    );
    const config = readBillingConfig();
    if (!isBillingConfigured(config)) throw new Error("billing_not_configured");

    const org = await activeOrg(context.supabase as never);
    const { data: existing } = await context.supabase
      .from("organization_subscriptions")
      .select("provider_customer_id")
      .eq("organization_id", org)
      .maybeSingle();
    const customerId =
      ((existing ?? null) as { provider_customer_id?: string | null } | null)
        ?.provider_customer_id ?? null;

    const session = await stripeRequest<{ url?: string }>(
      config.secretKey as string,
      "/checkout/sessions",
      {
        mode: "subscription",
        "line_items[0][price]": config.priceId as string,
        "line_items[0][quantity]": "1",
        client_reference_id: org,
        "metadata[organization_id]": org,
        "subscription_data[metadata][organization_id]": org,
        ...(config.trialDays > 0
          ? { "subscription_data[trial_period_days]": String(config.trialDays) }
          : {}),
        ...(customerId ? { customer: customerId } : {}),
        success_url: `${data.returnUrl}?billing=success`,
        cancel_url: `${data.returnUrl}?billing=cancelled`,
        allow_promotion_codes: "true",
      },
    );
    if (!session.url) throw new Error("billing_checkout_failed");
    return { url: session.url };
  });

/** Stripe-hosted billing portal for payment method, invoices and cancellation. */
export const openBillingPortal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => returnUrlSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { readBillingConfig, isBillingConfigured, stripeRequest } = await import(
      "./billing.server"
    );
    const config = readBillingConfig();
    if (!isBillingConfigured(config)) throw new Error("billing_not_configured");

    const org = await activeOrg(context.supabase as never);
    const { data: existing } = await context.supabase
      .from("organization_subscriptions")
      .select("provider_customer_id")
      .eq("organization_id", org)
      .maybeSingle();
    const customerId =
      ((existing ?? null) as { provider_customer_id?: string | null } | null)
        ?.provider_customer_id ?? null;
    if (!customerId) throw new Error("billing_no_customer");

    const portal = await stripeRequest<{ url?: string }>(
      config.secretKey as string,
      "/billing_portal/sessions",
      { customer: customerId, return_url: data.returnUrl },
    );
    if (!portal.url) throw new Error("billing_portal_failed");
    return { url: portal.url };
  });
