import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Shared presentation for every "back" control inside a contractor project
 * workspace (projects list, project shell, proposal, room detail...).
 *
 * Kept in one place so the top and bottom placements stay identical in target
 * size, contrast and focus treatment. Contractor-facing only: always hidden
 * from print / PDF / client-facing output.
 */
export function workspaceBackLinkClass(
  placement: "top" | "bottom" = "top",
  className?: string,
) {
  return cn(
    // Density-token control height (44px floor) with comfortable padding.
    "inline-flex min-h-(--control-min-h) items-center gap-2 rounded-lg border px-4 text-sm font-medium",
    "transition-colors active:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "print:hidden",
    placement === "top"
      ? "border-border bg-surface text-foreground hover:bg-surface-muted"
      : "border-border/70 bg-transparent text-foreground-muted hover:bg-surface-muted hover:text-foreground",
    className,
  );
}

/**
 * Bottom-of-page container: quiet separator plus room for sticky mobile
 * action bars. Back-only by design — no tab stepping / forward navigation.
 */
export function WorkspaceBackFooter({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-8 flex justify-start border-t border-border/60 pt-6 pb-24 md:pb-6 print:hidden",
        className,
      )}
    >
      {children}
    </div>
  );
}
