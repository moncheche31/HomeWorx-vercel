import { createFileRoute } from "@tanstack/react-router";
import { validateProjectSearch } from "@/features/crm/hooks/usePreselectedProject";
import { VoiceCapturePage } from "@/features/voice-capture/pages/VoiceCapturePage";

export const Route = createFileRoute("/app/capture")({
  validateSearch: validateProjectSearch,
  head: () => ({
    meta: [
      { title: "Describe Your Project — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "Describe the work in your own words. VisionWorx360 Pro builds the scope of work and estimate.",
      },
      { property: "og:title", content: "Describe Your Project — VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "Describe the work and review the resulting scope before it enters the estimate.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: VoiceCapturePage,
});
