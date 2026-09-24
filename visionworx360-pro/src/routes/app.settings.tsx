import { createFileRoute } from "@tanstack/react-router";
import { SettingsPage } from "@/features/settings/pages/SettingsPage";

export const Route = createFileRoute("/app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Accessibility & Display | VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "Adjust text size, display density, and device text scaling for easier reading in the field.",
      },
      { property: "og:title", content: "Settings — VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "Accessibility and display preferences for contractors in the field.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SettingsPage,
});
