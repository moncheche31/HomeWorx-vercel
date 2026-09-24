import { createFileRoute } from "@tanstack/react-router";
import { TradeCoveragePage } from "@/features/qa/pages/TradeCoveragePage";

export const Route = createFileRoute("/app/trade-coverage")({
  head: () => ({
    meta: [
      { title: "Trade Coverage Audit — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "Live checklist of every trade VisionWorx360 can recognize, price, and scale correctly, computed from the estimating engine itself.",
      },
      { property: "og:title", content: "Trade Coverage Audit — VisionWorx360 Pro" },
      {
        property: "og:description",
        content:
          "Which trades are recognized, priced, and sized with realistic ballpark allowances — updated automatically.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TradeCoveragePage,
});
