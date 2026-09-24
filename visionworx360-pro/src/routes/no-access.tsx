import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { ProtectedRoute } from "./ProtectedRoute";
import { FullPageError } from "@/components/feedback/FullPageError";

const searchSchema = z.object({
  product: z.string().optional(),
});

export const Route = createFileRoute("/no-access")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "Access unavailable — VisionWorx360 Pro" },
      { name: "description", content: "This product is not enabled for your organization." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NoAccessPage,
});

function NoAccessPage() {
  const { t } = useTranslation("billing");
  return (
    <ProtectedRoute>
      <FullPageError
        title={t("noAccess.title")}
        description={t("noAccess.description")}
        action={
          <Link
            to="/app/billing"
            className="inline-flex min-h-[44px] items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("noAccess.action")}
          </Link>
        }
      />
    </ProtectedRoute>
  );
}
