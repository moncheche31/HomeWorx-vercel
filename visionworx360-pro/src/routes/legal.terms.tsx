import { createFileRoute } from "@tanstack/react-router";
import { LegalDocumentPage } from "@/features/legal/pages/LegalDocumentPage";
import { TERMS_DOCUMENT } from "@/domains/legal/documents";

export const Route = createFileRoute("/legal/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — VisionWorx360 Pro" },
      {
        name: "description",
        content:
          "Terms of Service for VisionWorx360 Pro, the contractor estimating and proposal platform.",
      },
      { property: "og:title", content: "Terms of Service — VisionWorx360 Pro" },
      {
        property: "og:description",
        content: "The agreement covering use of VisionWorx360 Pro Contractor Edition.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: () => <LegalDocumentPage document={TERMS_DOCUMENT} />,
});
