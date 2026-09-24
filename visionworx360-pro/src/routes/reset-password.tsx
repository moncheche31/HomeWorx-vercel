import { createFileRoute } from "@tanstack/react-router";
import { AuthPlaceholderPage } from "@/features/auth/pages/AuthPlaceholderPage";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password · VisionWorx360 Pro" },
      { name: "description", content: "Set a new VisionWorx360 Pro password." },
      { name: "robots", content: "noindex" },
    ],
  }),
  // Must remain publicly accessible so recovery links work even when a stale
  // session exists. The final password reset form ships in a later prompt.
  component: () => (
    <AuthPlaceholderPage
      titleKey="auth:pages.reset.title"
      descriptionKey="auth:pages.reset.description"
    />
  ),
});
