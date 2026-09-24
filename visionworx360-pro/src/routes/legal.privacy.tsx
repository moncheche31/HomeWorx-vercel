import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/features/legal/pages/LegalDocumentPage";
import { PRIVACY_DOCUMENT } from "@/domains/legal/documents";

export const Route = createFileRoute("/legal/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "How VisionWorx360 Pro collects, uses, and protects contractor and customer project data.",
      },
      { property: "og:title", content: "Privacy Policy — VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "Data handling practices for VisionWorx360 Pro Contractor Edition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LegalDocumentPage document={PRIVACY_DOCUMENT} />,
});
