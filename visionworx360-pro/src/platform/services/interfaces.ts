/**
 * Reserved platform service contracts. Implementations do NOT exist yet;
 * these types exist only to keep future engines UI-independent. Contractor
 * Edition will be one client of these services, not the owner.
 */

export interface PdfGenerationService {
  render(doc: { kind: string; data: unknown }): Promise<Uint8Array>;
}

export interface NotificationService {
  notify(input: {
    organizationId: string;
    userId?: string;
    category: string;
    title: string;
    body?: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ id: string }>;
}

export interface SubscriptionEntitlementService {
  hasEntitlement(input: { organizationId: string; entitlementKey: string }): Promise<boolean>;
}

export interface ReportingDataService {
  query(input: { organizationId: string; report: string; params?: Record<string, unknown> }): Promise<unknown>;
}
