import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { resolveProjectPricingLocation } from "../services/pricingLocation.functions";
import {
  NATIONAL_BASELINE_LOCATION,
  bookLaborRateTable,
  bookLaborRate,
  type BookPricingLocation,
} from "@/domains/estimating/pricing/bookLaborRates";

/**
 * The job-site book pricing location for a project, resolved once and shared
 * by every pricing surface. While it loads — or when the job site is not
 * confirmed yet — pricing continues at the flagged national baseline instead
 * of any flat rate, so a brand-new project can still produce a ballpark.
 */
export function useBookPricingLocation(projectId: string | null | undefined) {
  const resolve = useServerFn(resolveProjectPricingLocation);
  const query = useQuery({
    queryKey: ["book-pricing-location", projectId ?? "none"],
    enabled: !!projectId,
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<BookPricingLocation> =>
      resolve({ data: { projectId: projectId as string } }),
  });

  const location = query.data ?? NATIONAL_BASELINE_LOCATION;
  return {
    location,
    isNationalBaseline: location.source === "national_baseline",
    laborRates: bookLaborRateTable(location),
    generalLaborRate: bookLaborRate("general", location),
    loading: query.isLoading,
  };
}
