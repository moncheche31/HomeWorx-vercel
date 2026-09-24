import { createFileRoute } from "@tanstack/react-router";
import { ClientsListPage } from "@/features/crm/pages/ClientsListPage";
import { parseClientsListSearch } from "@/features/crm/navigation/listSearch";

export const Route = createFileRoute("/app/clients/")({
  head: () => ({
    meta: [{ title: "Clients — VisionWorx360 Pro" }, { name: "robots", content: "noindex" }],
  }),
  validateSearch: parseClientsListSearch,
  component: ClientsListPage,
});
