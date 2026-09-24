import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/features/workspace/pages/ComingSoonPage";
export const Route = createFileRoute("/app/estimates")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => <ComingSoonPage titleKey="nav.estimates" messageKey="comingSoon.estimates" />,
});
