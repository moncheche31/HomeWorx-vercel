import { createFileRoute } from "@tanstack/react-router";
import { PropertyDetailPage } from "@/features/crm/pages/PropertyDetailPage";
export const Route = createFileRoute("/app/clients/$clientId/properties/$propertyId")({
  head: () => ({
    meta: [{ title: "Property — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: RouteComponent,
});
function RouteComponent() {
  const { clientId, propertyId } = Route.useParams();
  return <PropertyDetailPage clientId={clientId} propertyId={propertyId} />;
}
