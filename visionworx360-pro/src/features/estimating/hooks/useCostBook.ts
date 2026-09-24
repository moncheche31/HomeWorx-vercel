/**
 * Cost Book query/mutation hooks (contractor surfaces only).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import { useServerFn } from "@tanstack/react-start";
import {
  getCostBookEntry,
  getLinePricingBasis,
  listCostBookHistory,
  repriceEstimateFromCostBook,
  resetCompanyOverride,
  resetLineRateOverride,
  saveCompanyOverride,
  saveLineRateOverride,
  searchCostBook,
} from "../services/costBook.functions";
import type {
  saveCompanyOverrideSchema,
  saveLineRateOverrideSchema,
} from "../services/costBook.schemas";

type SaveCompanyOverrideInput = z.infer<typeof saveCompanyOverrideSchema>;
type SaveLineRateOverrideInput = z.infer<typeof saveLineRateOverrideSchema>;

export interface CostBookFilters {
  search?: string;
  tradeKey?: string;
  categoryKey?: string;
  customizedOnly?: boolean;
}

export function useCostBookSearch(filters: CostBookFilters) {
  const fn = useServerFn(searchCostBook);
  return useQuery({
    queryKey: ["costBook", "search", filters],
    queryFn: () => fn({ data: { ...filters, limit: 60 } }),
    staleTime: 30_000,
  });
}

export function useCostBookEntry(assemblyKey: string | null) {
  const fn = useServerFn(getCostBookEntry);
  return useQuery({
    queryKey: ["costBook", "entry", assemblyKey],
    queryFn: () => fn({ data: { assemblyKey: assemblyKey as string } }),
    enabled: !!assemblyKey,
  });
}

export function useCostBookHistory(assemblyKey: string | null) {
  const fn = useServerFn(listCostBookHistory);
  return useQuery({
    queryKey: ["costBook", "history", assemblyKey],
    queryFn: () => fn({ data: { assemblyKey: assemblyKey as string } }),
    enabled: !!assemblyKey,
  });
}

export function useLinePricingBasis(lineId: string | null) {
  const fn = useServerFn(getLinePricingBasis);
  return useQuery({
    queryKey: ["costBook", "lineBasis", lineId],
    queryFn: () => fn({ data: { lineId: lineId as string } }),
    enabled: !!lineId,
  });
}

export function useSaveCompanyOverride() {
  const fn = useServerFn(saveCompanyOverride);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SaveCompanyOverrideInput) => fn({ data }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["costBook"] }),
  });
}

export function useResetCompanyOverride() {
  const fn = useServerFn(resetCompanyOverride);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assemblyKey: string) => fn({ data: { assemblyKey } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["costBook"] }),
  });
}

export function useSaveLineRateOverride(estimateId?: string) {
  const fn = useServerFn(saveLineRateOverride);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SaveLineRateOverrideInput) => fn({ data }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["costBook"] });
      void qc.invalidateQueries({ queryKey: ["estimating"] });
      if (estimateId) void qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
    },
  });
}

export function useResetLineRateOverride(estimateId?: string) {
  const fn = useServerFn(resetLineRateOverride);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => fn({ data: { lineId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["costBook"] });
      void qc.invalidateQueries({ queryKey: ["estimating"] });
      if (estimateId) void qc.invalidateQueries({ queryKey: ["estimate", estimateId] });
    },
  });
}

export function useRepriceFromCostBook() {
  const fn = useServerFn(repriceEstimateFromCostBook);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (estimateId: string) => fn({ data: { estimateId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["estimating"] });
      void qc.invalidateQueries({ queryKey: ["costBook"] });
    },
  });
}
