import { createFileRoute } from "@tanstack/react-router";
import { RoomDetailPage } from "@/features/project-workspace/pages/RoomDetailPage";
export const Route = createFileRoute("/app/projects/$projectId/rooms/$roomId")({
  head: () => ({
    meta: [{ title: "Room — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  component: RouteComponent,
});
function RouteComponent() {
  const { projectId, roomId } = Route.useParams();
  return <RoomDetailPage projectId={projectId} roomId={roomId} />;
}
