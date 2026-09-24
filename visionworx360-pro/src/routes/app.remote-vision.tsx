import { createFileRoute } from "@tanstack/react-router";
import { validateProjectSearch } from "@/features/crm/hooks/usePreselectedProject";
import { RemoteVisionPage } from "@/features/remote-vision/pages/RemoteVisionPage";

export const Route = createFileRoute("/app/remote-vision")({
  validateSearch: validateProjectSearch,
  head: () => ({
    meta: [
      { title: "Estimate from Photos or Video — VisionWorx360 Pro" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RemoteVisionPage,
});
