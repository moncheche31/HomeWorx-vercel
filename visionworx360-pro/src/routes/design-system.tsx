import { createFileRoute } from "@tanstack/react-router";
import { DesignSystemPage } from "@/pages/DesignSystemPage";

export const Route = createFileRoute("/design-system")({
  head: () => ({
    meta: [
      { title: "Design system · VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "VisionWorx360 Pro design system: brand, tokens, and reusable components for contractor field workflows.",
      },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Design system · VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "Brand, tokens, and reusable components for VisionWorx360 Pro.",
      },
    ],
  }),
  component: DesignSystemPage,
});
