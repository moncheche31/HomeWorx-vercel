import { createFileRoute } from "@tanstack/react-router";
import { ProjectDetailPage } from "@/features/crm/pages/ProjectDetailPage";
export const Route = createFileRoute("/app/projects/$projectId/")({
  head: () => ({
    meta: [{ title: "Project — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: RouteComponent,
});
function RouteComponent() {
  const { projectId } = Route.useParams();
  return <ProjectDetailPage projectId={projectId} />;
}
