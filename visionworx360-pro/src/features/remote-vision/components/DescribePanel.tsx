import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useDictation } from "@/features/voice-capture/hooks/useDictation";
import { DictationControl } from "@/features/voice-capture/components/DictationControl";

interface Props {
  value: string;
  locale: "en-US" | "es-US";
  onChange: (text: string) => void;
}

export function DescribePanel({ value, locale, onChange }: Props) {
  const { t } = useTranslation("remote-vision");
  const speech = useDictation({
    lang: locale,
    onFinalSegment: (segment) => onChange(`${value ? `${value} ` : ""}${segment}`.trim()),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("describe.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-foreground-muted">{t("describe.hint")}</p>

        <DictationControl
          status={speech.status}
          errorCode={speech.errorCode}
          interim={speech.interim}
          elapsedMs={speech.elapsedMs}
          audioLevel={speech.audioLevel}
          hasRetryableAudio={speech.hasRetryableAudio}
          idleLabel={t("describe.record")}
          onStart={() => void speech.start()}
          onStop={() => speech.stop()}
          onRetryTranscription={() => speech.retryTranscription()}
          onRecordAgain={() => speech.recordAgain()}
        />

        <Textarea
          className="min-h-48 text-base leading-relaxed"
          placeholder={t("describe.placeholder")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </CardContent>
    </Card>
  );
}
