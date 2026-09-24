import { createFileRoute } from "@tanstack/react-router";
import { RootRedirect } from "./RootRedirect";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VisionWorx360 Pro — Voice-first estimating for contractors" },
      {
        name: "description",
        content:
          "VisionWorx360 Pro is a bilingual, mobile-first, voice-first estimating platform built for professional contractors.",
      },
      { property: "og:title", content: "VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "Voice-first estimating for contractors.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RootRedirect,
});
