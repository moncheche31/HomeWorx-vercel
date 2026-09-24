import { createFileRoute } from "@tanstack/react-router";
import { ComingSoonPage } from "@/features/workspace/pages/ComingSoonPage";
export const Route = createFileRoute("/app/files")({
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: () => <ComingSoonPage titleKey="nav.files" messageKey="comingSoon.files" />,
});
