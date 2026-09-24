import { createFileRoute } from "@tanstack/react-router";
import { validateProjectSearch } from "@/features/crm/hooks/usePreselectedProject";
import { BallparkPage } from "@/features/ballpark/pages/BallparkPage";

export const Route = createFileRoute("/app/ballpark")({
  validateSearch: validateProjectSearch,
  head: () => ({
    meta: [
      { title: "Quick Ballpark — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "Answer a dozen spoken questions on site and get a preliminary remodeling range with every assumption shown.",
      },
      { property: "og:title", content: "Quick Ballpark — VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "A short voice interview that turns a walkthrough into a preliminary estimate range.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BallparkPage,
});
