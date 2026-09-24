import { createFileRoute } from "@tanstack/react-router";
import { ProfilePage } from "@/features/workspace/pages/ProfilePage";

export const Route = createFileRoute("/app/profile")({
  head: () => ({
    meta: [{ title: "Profile — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: ProfilePage,
});
