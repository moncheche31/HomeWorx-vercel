import { createFileRoute } from "@tanstack/react-router";
import { ProposalScopePage } from "@/features/narrative-scope/pages/ProposalScopePage";
export const Route = createFileRoute("/app/proposals")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: ProposalScopePage,
});
