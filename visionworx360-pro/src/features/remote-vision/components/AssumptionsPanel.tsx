import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Assumption } from "@/domains/remoteVision";

interface Props {
  assumptions: Assumption[];
  onChange: (id: string, optionKey: string) => void;
}

export function AssumptionsPanel({ assumptions, onChange }: Props) {
  const { t } = useTranslation("remote-vision");

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("assumptions.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-muted">{t("assumptions.hint")}</p>
        {assumptions.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t("assumptions.empty")}</p>
        ) : (
          assumptions.map((a) => (
            <div key={a.id} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Label htmlFor={`assumption-${a.id}`} className="text-sm font-medium">
                  {t(`assumptions.topic.${a.topic}`)}
                </Label>
                <Badge variant={a.isAutomatic ? "secondary" : "default"}>
                  {a.isAutomatic ? t("assumptions.auto") : t("assumptions.confirmed")}
                </Badge>
              </div>
              <Select value={a.selectedKey} onValueChange={(v) => onChange(a.id, v)}>
                <SelectTrigger id={`assumption-${a.id}`} className="min-h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {a.optionKeys.map((key) => (
                    <SelectItem key={key} value={key}>
                      {t(`assumptions.option.${key}`, { defaultValue: key.replace(/_/g, " ") })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {a.basis ? <p className="text-xs text-foreground-muted">“{a.basis}”</p> : null}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
