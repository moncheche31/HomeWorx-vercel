import { useTranslation } from "react-i18next";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { DetectedFeatureBase, VisionAnalysisResult } from "@/domains/remoteVision";

const BUCKETS = [
  "rooms",
  "structuralChanges",
  "cabinets",
  "flooring",
  "materials",
  "lighting",
  "windows",
  "doors",
  "appliances",
  "fixtures",
  "mechanicalChanges",
] as const;

export function DetectedFeaturesPanel({ result }: { result: VisionAnalysisResult }) {
  const { t } = useTranslation("remote-vision");
  const filled = BUCKETS.map(
    (key) => [key, (result[key] as DetectedFeatureBase[]) ?? []] as const,
  ).filter(([, list]) => list.length > 0);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
        <CardTitle className="text-base">{t("detected.title")}</CardTitle>
        <Badge variant="secondary">
          {t("detected.confidence", { value: Math.round(result.confidence * 100) })}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        {filled.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t("detected.empty")}</p>
        ) : (
          filled.map(([key, list]) => (
            <section key={key} className="space-y-2">
              <h3 className="text-sm font-medium">{t(`detected.buckets.${key}`)}</h3>
              <ul className="flex flex-wrap gap-2">
                {list.map((feature) => (
                  <li key={feature.id}>
                    <Badge variant="outline" className="max-w-full whitespace-normal text-left">
                      {feature.label}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </CardContent>
    </Card>
  );
}
