import { createFileRoute } from "@tanstack/react-router";
import { ClientDetailPage } from "@/features/crm/pages/ClientDetailPage";

export const Route = createFileRoute("/app/clients/$clientId/")({
  head: () => ({
    meta: [{ title: "Client — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { clientId } = Route.useParams();
  return <ClientDetailPage clientId={clientId} />;
}
