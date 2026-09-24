import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocale, formatDate } from "@/i18n/format";
import type { ProposalDocument } from "@/domains/proposal";

interface Props {
  acceptance: ProposalDocument["acceptance"];
  onAccept: (name: string) => void;
  onReset: () => void;
  disabled?: boolean;
}

/** Acceptance block. Local record only — no contract is executed here. */
export function ProposalAcceptance({ acceptance, onAccept, onReset, disabled = false }: Props) {
  const { t } = useTranslation("proposal");
  const locale = useLocale();
  const [name, setName] = useState("");

  if (acceptance.acceptedAt) {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          {t("acceptance.accepted", {
            name: acceptance.acceptedByName ?? "",
            date: formatDate(acceptance.acceptedAt, locale),
          })}
        </p>
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 proposal-no-print"
          onClick={onReset}
        >
          {t("acceptance.reset")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed">{acceptance.statement}</p>
      <div className="flex flex-col gap-2 sm:flex-row proposal-no-print">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("acceptance.namePlaceholder")}
          aria-label={t("acceptance.namePlaceholder")}
          className="min-h-12"
        />
        <Button
          type="button"
          className="min-h-12 sm:w-auto"
          disabled={disabled || name.trim().length < 2}
          onClick={() => onAccept(name.trim())}
        >
          {t("acceptance.accept")}
        </Button>
      </div>
    </div>
  );
}
