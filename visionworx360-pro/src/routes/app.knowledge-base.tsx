import { createFileRoute } from "@tanstack/react-router";
import { KnowledgeBasePage } from "@/features/knowledge-base/pages/KnowledgeBasePage";

export const Route = createFileRoute("/app/knowledge-base")({
  head: () => ({
    meta: [
      { title: "Knowledge Base — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "Pre-loaded contractor work items, production rates and estimating templates you can customize for your company.",
      },
      { property: "og:title", content: "Knowledge Base — VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "Seeded estimating assemblies, favorites and multi-trade templates.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: KnowledgeBasePage,
});
