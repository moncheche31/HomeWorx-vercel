import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RemoteVisionQuestion } from "@/domains/remoteVision";

interface Props {
  questions: RemoteVisionQuestion[];
  answers: Record<string, string>;
  onSave: (answers: Record<string, string>) => void;
}

export function RemoteQuestionsPanel({ questions, answers, onSave }: Props) {
  const { t } = useTranslation("remote-vision");
  const [draft, setDraft] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("questions.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-muted">{t("questions.hint")}</p>
        {questions.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t("questions.none")}</p>
        ) : (
          <>
            {questions.map((q) => (
              <div key={q.id} className="space-y-2">
                <Label htmlFor={q.id} className="text-sm font-medium">
                  {t(q.promptKey, { defaultValue: q.topic })}
                </Label>
                <Input
                  id={q.id}
                  className="min-h-12"
                  placeholder={t("questions.placeholder")}
                  value={draft[q.id] ?? answers[q.id] ?? ""}
                  onChange={(e) => setDraft((prev) => ({ ...prev, [q.id]: e.target.value }))}
                />
                {q.suggestions.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {q.suggestions.map((s) => (
                      <Button
                        key={s}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="min-h-11"
                        onClick={() => setDraft((prev) => ({ ...prev, [q.id]: s }))}
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            <Button
              className="min-h-12 w-full"
              onClick={() =>
                onSave(
                  Object.fromEntries(Object.entries(draft).filter(([, v]) => v.trim().length > 0)),
                )
              }
            >
              {t("questions.save")}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
