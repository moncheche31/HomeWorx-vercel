import { createFileRoute } from "@tanstack/react-router";
import { TerminologyMemoryPage } from "@/features/terminology/pages/TerminologyMemoryPage";

export const Route = createFileRoute("/app/terminology")({
  head: () => ({
    meta: [
      { title: "Correction Memory — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "Teach the estimator your own construction wording once: saved corrections are applied to every future scope and cost-book match.",
      },
      { property: "og:title", content: "Correction Memory — VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "Standing wording corrections that stop the app repeating the same interpretation mistake.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TerminologyMemoryPage,
});
