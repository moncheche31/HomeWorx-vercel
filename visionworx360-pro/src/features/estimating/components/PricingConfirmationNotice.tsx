import { AlertTriangle } from "lucide-react";

/**
 * CONTRACTOR-ONLY notice that the pricing numbers on this estimate are a
 * provisional snapshot rather than a deliberate contractor choice.
 *
 * This exists because inherited or legacy pricing must never masquerade as a
 * decision somebody made. Until the contractor opens pricing settings and
 * saves, the estimate stays unlocked and the numbers stay clearly labelled
 * provisional. `proposal-no-print` keeps it out of every client-facing path.
 */
export function PricingConfirmationNotice({
  required,
  reason,
  source,
  className = "",
}: {
  required: boolean;
  reason?: string | null;
  source?: string | null;
  className?: string;
}) {
  if (!required) return null;
  return (
    <div
      data-testid="pricing-confirmation-notice"
      role="status"
      className={`proposal-no-print flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-3 text-xs ${className}`}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <div className="grid gap-1">
        <p className="font-medium">Pricing needs your confirmation</p>
        <p className="text-foreground-muted">
          These percentages are a provisional snapshot of your current company
          defaults, not a choice recorded on this estimate. Open pricing
          settings and save to confirm or change them.
        </p>
        {reason ? (
          <p className="text-foreground-muted" data-testid="pricing-confirmation-reason">
            Reason: {reason}
            {source ? ` (source: ${source})` : ""}
          </p>
        ) : null}
      </div>
    </div>
  );
}
