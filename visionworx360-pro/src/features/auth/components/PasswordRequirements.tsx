import { useTranslation } from "react-i18next";
import { Check, Circle } from "lucide-react";
import { checkPassword, PASSWORD_MIN } from "../validation/schemas";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  id?: string;
  className?: string;
}

const RULE_KEYS = ["length", "uppercase", "lowercase", "number", "symbol"] as const;

export function PasswordRequirements({ value, id, className }: Props) {
  const { t } = useTranslation("auth");
  const checks = checkPassword(value);

  return (
    <ul
      id={id}
      aria-label={t("password.requirementsLabel")}
      className={cn("mt-2 space-y-1 text-xs", className)}
    >
      {RULE_KEYS.map((k) => {
        const met = checks[k];
        const label =
          k === "length"
            ? t("password.rules.length", { min: PASSWORD_MIN })
            : t(`password.rules.${k}`);
        return (
          <li key={k} className="flex items-start gap-2">
            {met ? (
              <Check
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-success"
              />
            ) : (
              <Circle
                aria-hidden
                className="mt-0.5 size-3.5 shrink-0 text-foreground-muted"
              />
            )}
            <span
              className={met ? "text-foreground" : "text-foreground-muted"}
            >
              <span className="sr-only">
                {met ? t("password.met") : t("password.unmet")}:{" "}
              </span>
              {label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
