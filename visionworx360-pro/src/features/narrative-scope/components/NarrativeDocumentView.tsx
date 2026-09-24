interface Props {
  text: string;
  className?: string;
}

/**
 * Renders the narrative Scope of Work. Group titles are the short lines,
 * sentences are paragraphs — no tables, codes, rates or estimating jargon.
 */
export function NarrativeDocumentView({ text, className }: Props) {
  const lines = text.split("\n");

  return (
    <article
      className={
        className ??
        "rounded-xl border border-border bg-surface p-4 text-base leading-relaxed sm:p-6"
      }
    >
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={index} className="h-3" aria-hidden />;
        const isHeading = !trimmed.endsWith(".") && trimmed.length < 60;
        return isHeading ? (
          <h3 key={index} className="mt-4 text-base font-semibold first:mt-0">
            {trimmed}
          </h3>
        ) : (
          <p key={index} className="mt-1 text-foreground">
            {trimmed}
          </p>
        );
      })}
    </article>
  );
}
