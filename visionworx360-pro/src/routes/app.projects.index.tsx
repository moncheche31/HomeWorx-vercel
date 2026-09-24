import { createFileRoute } from "@tanstack/react-router";
import { ProjectsListPage } from "@/features/crm/pages/ProjectsListPage";
import { parseProjectsListSearch } from "@/features/crm/navigation/listSearch";

export const Route = createFileRoute("/app/projects/")({
  head: () => ({
    meta: [{ title: "Projects — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  // List controls are navigation state: keeping them in the URL is what makes
  // "open a project, come back" restore the contractor's filtered view.
  validateSearch: parseProjectsListSearch,
  component: ProjectsListPage,
});
