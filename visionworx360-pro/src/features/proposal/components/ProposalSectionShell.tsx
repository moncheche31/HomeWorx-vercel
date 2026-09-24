import type { ReactNode } from "react";

/** Shared section shell so every proposal block reads the same theme tokens. */
export function ProposalSectionShell({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section className="proposal-section proposal-card p-5 md:p-8">
      <header className="mb-4 flex items-baseline justify-between gap-3 border-b pb-3 proposal-rule">
        <h2 className="proposal-heading text-xl md:text-2xl">{title}</h2>
        {action}
      </header>
      {children}
    </section>
  );
}
