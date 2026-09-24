import { createFileRoute } from "@tanstack/react-router";
import { ProposalPage } from "@/features/proposal/pages/ProposalPage";

export const Route = createFileRoute("/app/proposal/$projectId")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: ProposalPage,
});
