export type SubscriptionStatus =
  | "none"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

export interface BillingStatusDTO {
  /** True only when a Stripe secret key AND a Price ID are configured. */
  configured: boolean;
  productKey: string;
  status: SubscriptionStatus;
  trialDays: number;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasCustomer: boolean;
  /** Server-computed entitlement — never derived in the browser. */
  entitled: boolean;
}
