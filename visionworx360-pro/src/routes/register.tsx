import { createFileRoute } from "@tanstack/react-router";
import { PublicOnlyRoute } from "./PublicOnlyRoute";
import { RegisterPage } from "@/features/auth/pages/RegisterPage";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Create account · VisionWorx360 Pro" },
      { name: "description", content: "Create a VisionWorx360 Pro account." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: () => (
    <PublicOnlyRoute>
      <RegisterPage />
    </PublicOnlyRoute>
  ),
});
