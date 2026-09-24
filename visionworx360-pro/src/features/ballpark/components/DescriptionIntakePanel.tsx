import { useTranslation } from "react-i18next";
import { MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useDictation } from "@/features/voice-capture/hooks/useDictation";
import { DictationControl } from "@/features/voice-capture/components/DictationControl";

interface Props {
  value: string;
  locale: string;
  onChange: (value: string) => void;
  onContinue: () => void;
}

/**
 * "Describe your project": voice or typing, nothing else required. The
 * description is kept verbatim as a known fact and the follow-up questions
 * pick up whatever it did not cover.
 */
export function DescriptionIntakePanel({ value, locale, onChange, onContinue }: Props) {
  const { t } = useTranslation("ballpark");

  const speech = useDictation({
    lang: locale,
    onFinalSegment: (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      onChange(value ? `${value} ${trimmed}` : trimmed);
    },
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="size-4 text-primary" aria-hidden />
          {t("describe.title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-foreground-muted">{t("describe.hint")}</p>

        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          rows={6}
          placeholder={t("describe.placeholder")}
          aria-label={t("describe.title")}
        />

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

        <Button className="min-h-(--control-min-h) w-full text-base" onClick={onContinue}>
          {t("describe.continue")}
        </Button>
      </CardContent>
    </Card>
  );
}
