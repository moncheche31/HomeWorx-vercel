import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/projects")({
  head: () => ({
    meta: [{ title: "Projects — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Outlet />,
});
