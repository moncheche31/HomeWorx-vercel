import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/clients")({
  head: () => ({
    meta: [{ title: "Clients — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Outlet />,
});
