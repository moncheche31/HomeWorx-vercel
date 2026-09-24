import { createFileRoute } from "@tanstack/react-router";
import { OrganizationPage } from "@/features/workspace/pages/OrganizationPage";

export const Route = createFileRoute("/app/organization")({
  head: () => ({
    meta: [{ title: "Organization — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: OrganizationPage,
});
