import { createFileRoute } from "@tanstack/react-router";
import { ClientProposalPage } from "@/features/client-portal/pages/ClientProposalPage";

/**
 * Public client portal. Deliberately outside /app and outside the contractor
 * auth guard: the homeowner opens it from the emailed link with no account.
 * The share token in the path is the credential, and every read is validated
 * server-side against the hashed token, its status and its expiry.
 */
export const Route = createFileRoute("/p/$token")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your project proposal" },
      { name: "description", content: "Review your project proposal and request changes." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ClientProposalPage,
});
