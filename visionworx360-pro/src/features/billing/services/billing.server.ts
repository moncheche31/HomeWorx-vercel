/**
 * Server-only Stripe access for Contractor Edition billing.
 *
 * Nothing here invents a price: the plan is driven entirely by a configured
 * Stripe Price ID. With no configuration every entry point reports
 * `configured: false` and the UI degrades to an explanatory state — it never
 * simulates a successful payment.
 */

export interface BillingConfig {
  secretKey: string | null;
  priceId: string | null;
  webhookSecret: string | null;
  trialDays: number;
  productKey: string;
}

export const CONTRACTOR_PRODUCT_KEY = "contractor";
export const DEFAULT_TRIAL_DAYS = 14;

export function readBillingConfig(): BillingConfig {
  const trialRaw = Number(process.env["STRIPE_TRIAL_DAYS"] ?? DEFAULT_TRIAL_DAYS);
  return {
    secretKey: process.env["STRIPE_SECRET_KEY"] || null,
    priceId: process.env["STRIPE_PRICE_ID_CONTRACTOR"] || null,
    webhookSecret: process.env["STRIPE_WEBHOOK_SECRET"] || null,
    trialDays: Number.isFinite(trialRaw) && trialRaw >= 0 ? Math.floor(trialRaw) : DEFAULT_TRIAL_DAYS,
    productKey: CONTRACTOR_PRODUCT_KEY,
  };
}

export function isBillingConfigured(config: BillingConfig): boolean {
  return Boolean(config.secretKey && config.priceId);
}

/** Subscription states that entitle an organization to product access. */
export const ENTITLED_STATUSES = ["active", "trialing"] as const;

export function accessStatusFor(subscriptionStatus: string): "active" | "revoked" {
  return (ENTITLED_STATUSES as readonly string[]).includes(subscriptionStatus)
    ? "active"
    : "revoked";
}

function form(params: Record<string, string | undefined>): string {
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== "") body.set(key, value);
  }
  return body.toString();
}

/** Minimal Stripe REST call; no SDK, Worker-runtime safe. */
export async function stripeRequest<T>(
  secretKey: string,
  path: string,
  params?: Record<string, string | undefined>,
): Promise<T> {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: params ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(params ? { body: form(params) } : {}),
  });
  if (!response.ok) {
    const detail = await response.text();
    console.error(`Stripe request failed [${response.status}] ${path}: ${detail}`);
    throw new Error(`stripe_error_${response.status}`);
  }
  return (await response.json()) as T;
}

export function isoFromUnix(seconds: unknown): string | null {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}
