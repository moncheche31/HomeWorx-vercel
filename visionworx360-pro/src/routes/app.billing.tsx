import { createFileRoute } from "@tanstack/react-router";
import { BillingPage } from "@/features/billing/pages/BillingPage";

export const Route = createFileRoute("/app/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Subscription — VisionWorx360 Pro" },
      {
        name: "description",
        content: "Manage your VisionWorx360 Pro Contractor Edition subscription, trial and invoices.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});
