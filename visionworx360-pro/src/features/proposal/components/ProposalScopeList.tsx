import { useState } from "react";
import { ChevronDown } from "lucide-react";
import type { ProposalScopeSection } from "@/domains/proposal";

interface Props {
  sections: ProposalScopeSection[];
  /** Optional intro paragraph for the client presentation. */
  intro?: string | null;
}

/**
 * The canonical scope, grouped for display. Client sections arrive as polished
 * prose (`presentation: "prose"`); contractor sections stay concise items.
 */
export function ProposalScopeList({ sections, intro }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (section: ProposalScopeSection, index: number) =>
    open[section.key] ?? (section.presentation === "prose" || index === 0);

  return (
    <div>
      {intro ? (
        <p className="mb-3 text-sm leading-relaxed md:text-base">{intro}</p>
      ) : null}
      <div className="divide-y proposal-rule">
        {sections.map((section, index) => {
          const expanded = isOpen(section, index);
          const prose = section.presentation === "prose";
          return (
            <div key={section.key} className="py-2">
              <button
              type="button"
              className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
              aria-expanded={expanded}
              onClick={() => setOpen((prev) => ({ ...prev, [section.key]: !expanded }))}
            >
              <span className="proposal-heading text-base md:text-lg">{section.title}</span>
              <ChevronDown
                className={`size-4 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
                aria-hidden
                />
              </button>
              {expanded ? (
                prose ? (
                  <div className="mt-2 space-y-2 text-sm leading-relaxed md:text-base">
                    {section.lines.map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                ) : (
                  <ul className="mt-2 space-y-2 text-sm leading-relaxed md:text-base">
                    {section.lines.map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
