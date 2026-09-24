import { createFileRoute } from "@tanstack/react-router";
import { PublicOnlyRoute } from "./PublicOnlyRoute";
import { AuthPlaceholderPage } from "@/features/auth/pages/AuthPlaceholderPage";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Forgot password · VisionWorx360 Pro" },
      { name: "description", content: "Reset your VisionWorx360 Pro password." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <PublicOnlyRoute>
      <AuthPlaceholderPage
        titleKey="auth:pages.forgot.title"
        descriptionKey="auth:pages.forgot.description"
      />
    </PublicOnlyRoute>
  ),
});
