import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { WarningNotice } from "@/components/feedback/Notice";
import { cn } from "@/lib/utils";
import { useDictation } from "@/features/voice-capture/hooks/useDictation";
import { DictationControl } from "@/features/voice-capture/components/DictationControl";
import {
  parseAnswer,
  type BallparkAnswer,
  type BallparkAnswers,
  type BallparkLocale,
  type BallparkQuestion,
} from "@/domains/ballpark";

interface Props {
  question: BallparkQuestion;
  answer: BallparkAnswer | undefined;
  locale: BallparkLocale;
  onAnswer: (questionId: string, answer: BallparkAnswer) => void;
  /** A "sixteen by eighteen" reply fills both dimension questions at once. */
  onAnswerMany: (patch: BallparkAnswers) => void;
}

/**
 * One question per screen, voice first: a large microphone, an editable
 * transcript, and a keyboard fallback that is always available.
 */
export function BallparkQuestionCard({ question, answer, locale, onAnswer, onAnswerMany }: Props) {
  const { t } = useTranslation("ballpark");
  const [transcript, setTranscript] = useState("");
  const [notUnderstood, setNotUnderstood] = useState(false);
  /** What the contractor typed, kept verbatim even when it cannot be read. */
  const [manualDraft, setManualDraft] = useState<string | null>(null);
  const [manualError, setManualError] = useState(false);

  const speech = useDictation({
    lang: locale,
    onFinalSegment: (text) => setTranscript((prev) => (prev ? `${prev} ${text}` : text)),
  });
  const listening = speech.listening;

  // A new question starts with a clean slate.
  useEffect(() => {
    setTranscript("");
    setNotUnderstood(false);
    setManualDraft(null);
    setManualError(false);
    speech.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.id]);

  const storedValue =
    answer?.status === "answered" && answer.value !== undefined ? String(answer.value) : "";
  const manualValue = manualDraft ?? storedValue;
  /** A specific reason, so the contractor knows what this question wants. */
  const parseErrorKey = `voice.cannotRead.${question.kind}`;

  const selectOption = (value: string) => {
    /* Structured controls already carry a canonical schema value. Never send
       that value back through speech parsing or let an old transcript compete
       with the contractor's explicit selection. */
    setTranscript("");
    setNotUnderstood(false);
    setManualError(false);
    onAnswer(question.id, { status: "answered", value, transcript: null });
  };

  const applyTranscript = () => {
    const text = transcript.trim();
    if (!text) return;
    const parsed = parseAnswer(question, text, locale);
    if (parsed.unknown) {
      onAnswer(question.id, { status: "unknown", transcript: text });
      setNotUnderstood(false);
      return;
    }
    if (parsed.value === null || parsed.value === undefined) {
      setNotUnderstood(true);
      return;
    }
    setNotUnderstood(false);
    const patch: BallparkAnswers = {
      [question.id]: { status: "answered", value: parsed.value, transcript: text },
    };
    // "sixteen by eighteen" answers the length and the width in one breath.
    if (parsed.pair && question.acceptsPair) {
      patch[question.acceptsPair.lengthId] = {
        status: "answered",
        value: parsed.pair.lengthFt,
        transcript: text,
      };
      patch[question.acceptsPair.widthId] = {
        status: "answered",
        value: parsed.pair.widthFt,
        transcript: text,
      };
    }
    onAnswerMany(patch);
  };

  /**
   * Typed answers run through the SAME parser as speech, so "18 ft",
   * "18 x 16" and "about 16 feet" are all accepted from the keyboard too. The
   * typed text is never discarded, even when it cannot be read yet.
   */
  const setManual = (raw: string) => {
    setManualDraft(raw);
    if (raw.trim() === "") {
      setManualError(false);
      onAnswer(question.id, { status: "skipped", transcript: null });
      return;
    }
    const parsed = parseAnswer(question, raw, locale);
    if (parsed.unknown) {
      setManualError(false);
      onAnswer(question.id, { status: "unknown", transcript: raw });
      return;
    }
    if (parsed.value === null || parsed.value === undefined) {
      setManualError(true);
      return;
    }
    setManualError(false);
    const patch: BallparkAnswers = {
      [question.id]: { status: "answered", value: parsed.value, transcript: raw },
    };
    if (parsed.pair && question.acceptsPair) {
      patch[question.acceptsPair.lengthId] = {
        status: "answered",
        value: parsed.pair.lengthFt,
        transcript: raw,
      };
      patch[question.acceptsPair.widthId] = {
        status: "answered",
        value: parsed.pair.widthFt,
        transcript: raw,
      };
    }
    onAnswerMany(patch);
  };

  return (
    <Card>
      <CardContent className="space-y-5 p-4 sm:p-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-foreground sm:text-2xl">
            {t(question.promptKey)}
          </h2>
          {question.hintKey ? (
            <p className="text-sm text-foreground-muted">{t(question.hintKey)}</p>
          ) : null}
        </div>

        {question.options ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {question.options.map((option) => {
              const selected = answer?.status === "answered" && answer.value === option.value;
              return (
                <Button
                  key={option.value}
                  type="button"
                  variant={selected ? "default" : "outline"}
                  className={cn(
                    "min-h-(--control-min-h) justify-start text-base",
                    selected && "font-semibold",
                  )}
                  aria-pressed={selected}
                  onClick={() => selectOption(option.value)}
                >
                  {t(option.labelKey)}
                </Button>
              );
            })}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor={`ballpark-${question.id}`} className="text-sm">
              {question.unit === "ft" ? "ft" : question.unit === "each" ? "#" : t("actions.save")}
            </Label>
            <Input
              id={`ballpark-${question.id}`}
              className="min-h-(--control-min-h) text-lg"
              inputMode={question.kind === "text" ? "text" : "decimal"}
              type="text"
              value={manualValue}
              placeholder={question.defaultValue != null ? String(question.defaultValue) : ""}
              onChange={(event) => setManual(event.target.value)}
            />
            {manualError ? (
              <WarningNotice title={t(parseErrorKey, { defaultValue: t("voice.notUnderstood") })} />
            ) : null}
          </div>
        )}

        <div className="space-y-3 rounded-lg border border-border bg-surface-muted/40 p-3">
          <DictationControl
            status={speech.status}
            errorCode={speech.errorCode}
            interim={speech.interim}
            elapsedMs={speech.elapsedMs}
            audioLevel={speech.audioLevel}
            hasRetryableAudio={speech.hasRetryableAudio}
            idleLabel={t("voice.start")}
            onStart={() => void speech.start()}
            onStop={() => speech.stop()}
            onRetryTranscription={() => speech.retryTranscription()}
            onRecordAgain={() => speech.recordAgain()}
          />

          <div className="space-y-2">
            <Label htmlFor={`ballpark-transcript-${question.id}`} className="text-sm">
              {t("voice.transcript")}
              </Label>
              <Textarea
                id={`ballpark-transcript-${question.id}`}
                rows={2}
                value={transcript + (speech.interim ? ` ${speech.interim}` : "")}
                onChange={(event) => setTranscript(event.target.value)}
                placeholder={t("voice.transcriptHint")}
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-(--control-min-h-sm) w-full sm:w-auto"
                disabled={!transcript.trim()}
                onClick={applyTranscript}
              >
              {t("actions.save")}
            </Button>
          </div>

          {notUnderstood ? (
            <WarningNotice title={t(parseErrorKey, { defaultValue: t("voice.notUnderstood") })} />
          ) : null}
        </div>

        {question.allowUnknown ? (
          <Button
            type="button"
            variant="ghost"
            className="min-h-(--control-min-h-sm) w-full sm:w-auto"
            onClick={() => onAnswer(question.id, { status: "unknown", transcript: null })}
          >
            <HelpCircle className="mr-2 size-4" aria-hidden />
            {t("actions.unknown")}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
