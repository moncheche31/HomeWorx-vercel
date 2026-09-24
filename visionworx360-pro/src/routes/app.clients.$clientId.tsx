import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/app/clients/$clientId")({
  head: () => ({
    meta: [{ title: "Client — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: () => <Outlet />,
});
