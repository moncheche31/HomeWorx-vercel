/**
 * Domain event logging adapter. Preserves the existing project_activity
 * behavior (writes happen through DB triggers already) and provides a typed
 * façade for future editions. Explicit typed result — never silently no-op.
 */

import type { ProductKey } from "../types";

export interface DomainEventInput {
  organizationId: string;
  productKey: ProductKey | string;
  actorUserId: string;
  domain: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  projectId?: string | null;
  metadata?: Record<string, unknown>;
}

export type DomainEventResult =
  | { status: "logged"; via: "project_activity_trigger" | "direct" }
  | { status: "unsupported"; reason: string }
  | { status: "skipped_by_policy"; reason: string };

/**
 * Log a domain event. For Contractor project scope, DB triggers on
 * project-workspace and scope tables already write project_activity rows —
 * calling this from the client would duplicate, so we return skipped_by_policy.
 *
 * Future editions will route through this adapter without touching Contractor
 * activity code.
 */
export function logDomainEvent(input: DomainEventInput): DomainEventResult {
  if (input.productKey === "CONTRACTOR" && input.projectId) {
    return {
      status: "skipped_by_policy",
      reason:
        "Contractor project events are written by database triggers; direct client logging would duplicate.",
    };
  }
  const msg = `[domainEvents] unsupported combination: product=${input.productKey} domain=${input.domain} action=${input.action}`;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.warn(msg, input);
  }
  return { status: "unsupported", reason: msg };
}
