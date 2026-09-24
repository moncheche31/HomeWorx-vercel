import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/app/customers")({
  beforeLoad: () => {
    throw redirect({ to: "/app/clients" });
  },
});
