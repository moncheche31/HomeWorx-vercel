import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";
import { LoginPage } from "@/features/auth/pages/LoginPage";

function LoginRoute() {
  const { queryClient } = Route.useRouteContext();
  const clearProtectedCaches = useCallback(async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
  }, [queryClient]);
  return <LoginPage onAuthenticated={clearProtectedCaches} />;
}

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · VisionWorx360 Pro" },
      { name: "description", content: "Sign in to VisionWorx360 Pro." },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  component: LoginRoute,
});
