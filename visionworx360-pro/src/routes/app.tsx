import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ProtectedRoute } from "./ProtectedRoute";
import { AppLayout } from "@/features/workspace/components/AppLayout";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "VisionWorx360 Pro" },
      { name: "description", content: "VisionWorx360 Pro application." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: () => (
    <ProtectedRoute>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </ProtectedRoute>
  ),
  notFoundComponent: () => (
    <ProtectedRoute>
      <AppLayout>
        <div className="p-8 text-center text-muted-foreground">Page not found.</div>
      </AppLayout>
    </ProtectedRoute>
  ),
});
