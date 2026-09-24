import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface Props {
  transcript: string;
  interim: string;
  listening: boolean;
  onChange: (value: string) => void;
}

export function LiveTranscript({ transcript, interim, listening, onChange }: Props) {
  const { t } = useTranslation("voice");
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t("capture.transcript.title")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <Label htmlFor="voice-transcript" className="sr-only">
          {t("capture.transcript.title")}
        </Label>
        <Textarea
          id="voice-transcript"
          value={transcript}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("capture.transcript.placeholder")}
          rows={8}
          className="min-h-40 text-base"
          aria-live="polite"
        />
        {listening && interim ? (
          <p className="text-sm italic text-muted-foreground" aria-live="polite">
            {interim}…
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">{t("capture.transcript.hint")}</p>
      </CardContent>
    </Card>
  );
}
