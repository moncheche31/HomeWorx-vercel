import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe webhook — the ONLY writer of subscription state.
 *
 * Every event is signature-verified against STRIPE_WEBHOOK_SECRET before any
 * database write, and entitlement is mirrored onto organization_products so
 * ProductAccessGuard keeps working as the single access system.
 */
function verifySignature(payload: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const [k, ...rest] = p.split("=");
      return [k.trim(), rest.join("=")];
    }),
  ) as Record<string, string>;
  const timestamp = parts["t"];
  const signature = parts["v1"];
  if (!timestamp || !signature) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function isoFromUnix(seconds: unknown): string | null {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return null;
  return new Date(value * 1000).toISOString();
}

const ENTITLED = ["active", "trialing"];

export const Route = createFileRoute("/api/public/stripe-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["STRIPE_WEBHOOK_SECRET"];
        if (!secret) return new Response("billing_not_configured", { status: 503 });

        const body = await request.text();
        if (!verifySignature(body, request.headers.get("stripe-signature"), secret)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let event: { type?: string; data?: { object?: Record<string, unknown> } };
        try {
          event = JSON.parse(body);
        } catch {
          return new Response("Invalid payload", { status: 400 });
        }

        const object = event.data?.object ?? {};
        const type = String(event.type ?? "");
        const metadata = (object["metadata"] ?? {}) as Record<string, string>;
        const organizationId =
          metadata["organization_id"] ?? (object["client_reference_id"] as string | undefined);
        if (!organizationId) return new Response("ok (no organization)", { status: 200 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (type === "checkout.session.completed") {
          await supabaseAdmin.from("organization_subscriptions").upsert(
            {
              organization_id: organizationId,
              provider: "stripe",
              provider_customer_id: (object["customer"] as string | null) ?? null,
              provider_subscription_id: (object["subscription"] as string | null) ?? null,
              status: "incomplete",
            } as never,
            { onConflict: "organization_id" },
          );
          return new Response("ok", { status: 200 });
        }

        if (type.startsWith("customer.subscription.")) {
          const status = String(object["status"] ?? "incomplete");
          const item =
            ((object["items"] as { data?: Record<string, unknown>[] } | undefined)?.data ?? [])[0] ??
            {};
          const priceId = ((item["price"] as { id?: string } | undefined)?.id ?? null) as
            | string
            | null;

          await supabaseAdmin.from("organization_subscriptions").upsert(
            {
              organization_id: organizationId,
              provider: "stripe",
              provider_customer_id: (object["customer"] as string | null) ?? null,
              provider_subscription_id: (object["id"] as string | null) ?? null,
              price_id: priceId,
              status: type === "customer.subscription.deleted" ? "canceled" : status,
              trial_ends_at: isoFromUnix(object["trial_end"]),
              current_period_end: isoFromUnix(object["current_period_end"]),
              cancel_at_period_end: Boolean(object["cancel_at_period_end"]),
              provider_metadata: { last_event: type },
            } as never,
            { onConflict: "organization_id" },
          );

          const effective = type === "customer.subscription.deleted" ? "canceled" : status;
          await supabaseAdmin.from("organization_products").upsert(
            {
              organization_id: organizationId,
              product_key: "contractor",
              access_status: ENTITLED.includes(effective) ? "active" : "revoked",
            } as never,
            { onConflict: "organization_id,product_key" },
          );
          return new Response("ok", { status: 200 });
        }

        return new Response("ok (ignored)", { status: 200 });
      },
    },
  },
});
