import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { SupportPage } from "@/features/support/pages/SupportPage";

const searchSchema = z.object({ ref: z.string().max(64).optional() });

export const Route = createFileRoute("/app/support")({
  validateSearch: (search) => searchSchema.parse(search),
  head: () => ({
    meta: [
      { title: "Support & feedback — VisionWorx360 Pro" },
      {
        name: "description",
        content: "Report a problem or send feedback about VisionWorx360 Pro Contractor Edition.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RouteComponent,
});

function RouteComponent() {
  const { ref } = Route.useSearch();
  return <SupportPage referenceId={ref} />;
}
