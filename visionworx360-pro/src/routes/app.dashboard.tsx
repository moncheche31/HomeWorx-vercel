import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "@/features/workspace/pages/DashboardPage";

export const Route = createFileRoute("/app/dashboard")({
  head: () => ({
    meta: [{ title: "Dashboard — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: DashboardPage,
});
