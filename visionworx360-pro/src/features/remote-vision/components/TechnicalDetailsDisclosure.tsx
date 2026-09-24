import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, Wrench } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * Single deliberate entry point for PURE-STATUS surfaces.
 *
 * Audit/status panels (what the model saw, what the estimate stands on, how the
 * project was understood) carry nothing a contractor can act on, so they get no
 * presence in the default flow — only this one quiet link. Nothing underneath is
 * removed or changed; it is display-only gating.
 */
export function TechnicalDetailsDisclosure({ children }: { children: ReactNode }) {
  const { t } = useTranslation("remote-vision");

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex min-h-11 w-full items-center gap-2 text-left text-sm text-foreground-muted underline-offset-4 hover:underline"
        >
          <Wrench className="size-4 shrink-0" aria-hidden />
          <span>{t("technical.toggle")}</span>
          <ChevronDown className="size-4 shrink-0" aria-hidden />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 pt-3">
        <p className="text-xs text-foreground-muted">{t("technical.hint")}</p>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
