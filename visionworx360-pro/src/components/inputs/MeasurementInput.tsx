import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatFeet, parseImperialLength } from "@/domains/measurement";

interface Props {
  id?: string;
  /** Stored value in FEET (the app's legacy unit); null when unset. */
  valueFt: number | null;
  onChangeFt: (feet: number | null) => void;
  /** Zero is meaningful for some fields (waste, offsets) but not for lengths. */
  allowZero?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

/**
 * One field for every US construction length in the app.
 *
 * A single smart text box beats split feet/inches boxes on a jobsite phone:
 * one tap, one keyboard, no tabbing between two tiny targets, and it accepts
 * whatever the contractor already says out loud — `94 in`, `7' 10"`, `8 ft`,
 * or a bare `7.5` (decimal feet, exactly as older records were entered).
 * The normalized reading is echoed back live so nothing is silently
 * reinterpreted.
 */
export function MeasurementInput({
  id,
  valueFt,
  onChangeFt,
  allowZero = false,
  className,
  placeholder,
  ...aria
}: Props) {
  const { t } = useTranslation("common");
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = `${fieldId}-hint`;
  const [draft, setDraft] = useState(() => (valueFt === null ? "" : formatFeet(valueFt)));
  const [invalid, setInvalid] = useState(false);

  /* Adopt values that changed outside this field (loaded record, voice fill,
     photo inference) without ever fighting what is being typed. */
  useEffect(() => {
    setDraft((current) => {
      const parsed = parseImperialLength(current, { allowZero });
      if (parsed && Math.abs(parsed.feet - (valueFt ?? NaN)) < 1e-6) return current;
      if (current === "" && valueFt === null) return current;
      return valueFt === null ? "" : formatFeet(valueFt);
    });
    setInvalid(false);
  }, [valueFt, allowZero]);

  const commit = (raw: string) => {
    setDraft(raw);
    if (raw.trim() === "") {
      setInvalid(false);
      onChangeFt(null);
      return;
    }
    const parsed = parseImperialLength(raw, { allowZero });
    if (!parsed) {
      // Keep the typed text; never discard what the contractor entered.
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChangeFt(parsed.feet);
  };

  const parsed = parseImperialLength(draft, { allowZero });

  return (
    <div className="space-y-1">
      <Input
        id={fieldId}
        // `text`, not `number`: a number input rejects ' and " outright, which
        // is exactly how the feet-only restriction got enforced in the browser.
        type="text"
        inputMode="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn("min-h-12 text-base", invalid && "border-danger", className)}
        value={draft}
        placeholder={placeholder ?? t("measurement.placeholder")}
        aria-invalid={invalid || undefined}
        aria-describedby={aria["aria-describedby"] ?? hintId}
        aria-label={aria["aria-label"]}
        onChange={(event) => commit(event.target.value)}
        onBlur={() => {
          if (parsed) setDraft(formatFeet(parsed.feet));
        }}
      />
      <p
        id={hintId}
        className={cn("text-xs", invalid ? "text-danger" : "text-foreground-muted")}
        aria-live="polite"
      >
        {invalid
          ? t("measurement.invalid")
          : parsed
            ? t("measurement.reading", { value: formatFeet(parsed.feet) })
            : t("measurement.formats")}
      </p>
    </div>
  );
}
