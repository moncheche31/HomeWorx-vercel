import { createFileRoute } from "@tanstack/react-router";
import { PropertiesListPage } from "@/features/crm/pages/PropertiesListPage";
import { parsePropertiesListSearch } from "@/features/crm/navigation/listSearch";

export const Route = createFileRoute("/app/properties")({
  head: () => ({
    meta: [{ title: "Properties — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: parsePropertiesListSearch,
  component: PropertiesListPage,
});
