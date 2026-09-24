import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeEnginePage } from "@/features/knowledge/pages/KnowledgeEnginePage";

export const Route = createFileRoute("/app/knowledge")({
  head: () => ({
    meta: [
      { title: "Knowledge Engine — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "Inspect the deterministic contractor knowledge foundation: required work, common omissions, upgrades and value engineering by project type.",
      },
      { property: "og:title", content: "Knowledge Engine — VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "The shared, versioned contractor brain behind scope review and proposals.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KnowledgeEnginePage,
});
