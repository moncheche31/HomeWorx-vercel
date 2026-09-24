import type { ProposalSchedulePhase } from "@/domains/proposal";

/** Plain-language phase timeline. No dates are invented. */
export function ProposalSchedule({ phases }: { phases: ProposalSchedulePhase[] }) {
  return (
    <ol className="space-y-4">
      {phases.map((phase, index) => (
        <li key={phase.key} className="flex gap-3">
          <span
            className="proposal-accent-surface flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
            aria-hidden
          >
            {index + 1}
          </span>
          <div>
            <h3 className="proposal-heading text-base">{phase.label}</h3>
            <p className="proposal-muted-text text-sm">{phase.description}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
