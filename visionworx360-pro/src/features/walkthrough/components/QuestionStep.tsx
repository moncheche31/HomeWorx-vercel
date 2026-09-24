import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import type { WalkthroughAnswer, WalkthroughQuestion } from "@/domains/walkthrough";

interface Props {
  questions: WalkthroughQuestion[];
  answers: Record<string, WalkthroughAnswer>;
  onAnswer: (questionId: string, answer: WalkthroughAnswer) => void;
  onDone: () => void;
}

/** One question at a time — large choices, skip, not sure, review later. */
export function QuestionStep({ questions, answers, onAnswer, onDone }: Props) {
  const { t } = useTranslation("walkthrough");
  const [freeform, setFreeform] = useState("");
  const pending = questions.filter((q) => !answers[q.id]);
  const answered = questions.length - pending.length;
  const question = pending[0];

  if (!question) {
    return (
      <div className="space-y-4">
        <Card>
          <CardContent className="p-6 text-center text-sm text-foreground-muted">
            {t("questions.allDone")}
          </CardContent>
        </Card>
        <Button className="min-h-14 w-full text-base" onClick={onDone}>
          {t("questions.continue")}
        </Button>
      </div>
    );
  }

  const submit = (answer: WalkthroughAnswer) => {
    onAnswer(question.id, answer);
    setFreeform("");
  };

  return (
    <div className="space-y-4 pb-8">
      <div className="space-y-2">
        <p className="text-xs text-foreground-muted">
          {t("questions.progress", { answered, total: questions.length })}
        </p>
        <Progress
          value={questions.length ? Math.round((answered / questions.length) * 100) : 0}
          aria-label={t("questions.progressLabel")}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">{t(`questions.prompts.${question.kind}`)}</h2>
            <p className="text-sm text-foreground-muted">{question.subject}</p>
          </div>

          {question.options.length > 0 ? (
            <div className="grid gap-2">
              {question.options.map((option) => (
                <Button
                  key={option.value}
                  variant="outline"
                  className="min-h-14 w-full justify-start whitespace-normal text-left text-base"
                  onClick={() => submit({ status: "answered", value: option.value })}
                >
                  {option.rawLabel ? option.label : t(option.label)}
                </Button>
              ))}
            </div>
          ) : null}

          {question.freeform ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (freeform.trim()) submit({ status: "answered", value: freeform.trim() });
              }}
            >
              <Input
                value={freeform}
                onChange={(e) => setFreeform(e.target.value)}
                placeholder={t(`questions.placeholders.${question.kind}`)}
                aria-label={t(`questions.placeholders.${question.kind}`)}
                className="min-h-12 text-base"
              />
              <Button type="submit" className="min-h-12 shrink-0">
                {t("questions.save")}
              </Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-2">
        <Button variant="ghost" className="min-h-12" onClick={() => submit({ status: "skipped" })}>
          {t("questions.skip")}
        </Button>
        <Button variant="ghost" className="min-h-12" onClick={() => submit({ status: "unsure" })}>
          {t("questions.notSure")}
        </Button>
        <Button variant="ghost" className="min-h-12" onClick={() => submit({ status: "later" })}>
          {t("questions.later")}
        </Button>
      </div>

      <Button variant="outline" className="min-h-12 w-full" onClick={onDone}>
        {t("questions.reviewNow")}
      </Button>
    </div>
  );
}
