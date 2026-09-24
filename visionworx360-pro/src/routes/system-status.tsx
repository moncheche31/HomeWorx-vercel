import { createFileRoute } from "@tanstack/react-router";
import { SystemStatusPage } from "@/pages/SystemStatusPage";

export const Route = createFileRoute("/system-status")({
  head: () => ({
    meta: [
      { title: "System status · VisionWorx360 Pro" },
      { name: "description", content: "Runtime status for the VisionWorx360 Pro application." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "System status · VisionWorx360 Pro" },
      { property: "og:description", content: "Runtime status for VisionWorx360 Pro." },
    ],
  }),
  component: SystemStatusPage,
});
