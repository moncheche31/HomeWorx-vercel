import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBallparkBaseline } from "../hooks/useBallparkBaseline";
import type { EstimateDTO } from "@/features/estimating/types";

const CURRENT = { low: 36500, expected: 50038.71, high: 65500 };
const STALE_SESSION = { low: 34500, expected: 38809.02, high: 43000 };
const REFINED = { low: 41000, expected: 56000, high: 72000 };

const estimate: EstimateDTO = {
  id: "1d815f3b-6241-40d7-b695-6c8374458dc8",
  organizationId: "11111111-1111-4111-8111-111111111111",
  projectId: "70b778fc-07e8-42ac-8e7e-b992d85a53af",
  version: 1,
  parentEstimateId: null,
  documentKind: "estimate",
  lineageRootId: "1d815f3b-6241-40d7-b695-6c8374458dc8",
  revisionNumber: 0,
  optionLabel: null,
  supersededById: null,
  sentAt: null,
  acceptedAt: null,
  declinedAt: null,
  lockedAt: null,
  title: "Master Suite Garage Conversion",
  notes: null,
  status: "draft",
  currency: "USD",
  taxRate: 0,
  defaultOverheadPct: 0,
  defaultProfitPct: 0,
  defaultContingencyPct: 0,
  defaultLaborRate: 0,
  costCatalogRef: null,
  intakeMode: "ballpark",
  pricingMode: "total",
  pricingMethod: "overhead_profit" as const,
  targetGrossMarginPct: 0,
  laborSettings: {},
  rangeAssumptions: {},
  rangeSnapshot: {
    kind: "ballpark",
    engineVersion: 2,
    band: CURRENT,
    originalBallpark: { band: STALE_SESSION },
    previous: { band: { low: 32500, expected: 44909.52, high: 58500 } },
  },
  scopeSyncFingerprint: null,
  scopeSyncedAt: null,
  pricingConfirmationRequired: false,
  pricingConfirmationReason: null,
  pricingSource: "contractor_confirmed",
  pricingConfirmedAt: null,
  pricingSettingsLockedAt: null,
  pricingEngineVersion: 1,
  pricingRepricedAt: null,
  pricingLocation: null,
  pricingLocationSource: null,
  pricingLocationOverride: null,
  pricingLocationFactors: null,

  createdBy: "22222222-2222-4222-8222-222222222222",
  approvedBy: null,
  approvedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-11T20:52:25.900Z",
  copiedFromEstimateId: null,
  copiedFromProjectId: null,
  copiedFromLabel: null,
  copiedSourceDatedAt: null,
  pricingCopyMode: null,
  archivedAt: null,
};

let queryResult: { data: EstimateDTO | undefined; isLoading: boolean };
vi.mock("@/features/estimating/hooks/useEstimating", () => ({
  useEstimateQuery: () => queryResult,
}));

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const input = (factsChanged: boolean, computedBand = STALE_SESSION) => ({
  estimateId: estimate.id,
  projectId: estimate.projectId,
  sessionSnapshot: { band: STALE_SESSION },
  computedBand,
  factsChanged,
});

describe("BallparkPage estimate/session baseline integration", () => {
  beforeEach(() => {
    queryResult = { data: structuredClone(estimate), isLoading: false };
  });

  it("loads the current editable estimate before the stale durable session", () => {
    const estimateBefore = structuredClone(queryResult.data);
    const { result } = renderHook(() => useBallparkBaseline(input(false)), { wrapper });

    expect(result.current.isCurrentEditableEstimate).toBe(true);
    expect(result.current.preview).toMatchObject({
      band: CURRENT,
      savedBand: CURRENT,
      isPreview: false,
      source: "estimate",
    });
    expect(queryResult.data).toEqual(estimateBefore);
  });

  it("keeps edits uncommitted until the page invokes its explicit completion mutation", () => {
    const estimateBefore = structuredClone(queryResult.data);
    const { result } = renderHook(() => useBallparkBaseline(input(true, REFINED)), { wrapper });

    expect(result.current.preview).toMatchObject({
      band: REFINED,
      savedBand: CURRENT,
      isPreview: true,
      source: "estimate",
    });
    expect(result.current.baselineSnapshot).toEqual(estimate.rangeSnapshot);
    expect(queryResult.data).toEqual(estimateBefore);
  });

  it("falls back to the session only when no current editable estimate is available", () => {
    queryResult = { data: undefined, isLoading: false };
    const { result } = renderHook(() => useBallparkBaseline(input(false)), { wrapper });
    expect(result.current.preview).toMatchObject({ band: STALE_SESSION, source: "session" });
  });
});
