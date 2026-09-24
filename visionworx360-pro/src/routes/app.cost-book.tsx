import { createFileRoute } from "@tanstack/react-router";
import { CostBookPage } from "@/features/estimating/pages/CostBookPage";

export const Route = createFileRoute("/app/cost-book")({
  head: () => ({
    meta: [
      { title: "Cost Book — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "See the exact labor productivity and material baseline behind every estimated task, and set your own company rates.",
      },
      { property: "og:title", content: "Cost Book — VisionWorx360 Pro" },
      {
        property: "og:description",
        content:
          "Contractor rate transparency: VisionWorx baseline versus your company defaults, with full source provenance.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CostBookPage,
});
