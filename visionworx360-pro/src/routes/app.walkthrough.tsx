import { createFileRoute } from "@tanstack/react-router";
import { validateProjectSearch } from "@/features/crm/hooks/usePreselectedProject";
import { WalkthroughPage } from "@/features/walkthrough/pages/WalkthroughPage";

export const Route = createFileRoute("/app/walkthrough")({
  validateSearch: validateProjectSearch,
  head: () => ({
    meta: [
      { title: "Onsite Estimate — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "Walk the job room by room, speak the work, answer a few questions, and approve scope items in seconds.",
      },
      { property: "og:title", content: "Onsite Estimate — VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "Walk the property while VisionWorx360 Pro builds your estimate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: WalkthroughPage,
});
