import { useSearch } from "@tanstack/react-router";

export interface PreselectedProject {
  projectId?: string;
  estimateId?: string;
  projectName?: string;
  /** Ballpark intake path: onsite | photos | description. */
  source?: string;
  /** Ballpark resume intent: inputs | interview | chooser. */
  resume?: string;
}

/**
 * Reads the project preselected by the Create Estimate wizard from the route
 * search params. Returns an empty object when the flow was opened directly.
 */
export function usePreselectedProject(): PreselectedProject {
  const search = useSearch({ strict: false }) as PreselectedProject | undefined;
  return {
    projectId: typeof search?.projectId === "string" ? search.projectId : undefined,
    estimateId: typeof search?.estimateId === "string" ? search.estimateId : undefined,
    projectName: typeof search?.projectName === "string" ? search.projectName : undefined,
    source: typeof search?.source === "string" ? search.source : undefined,
    resume: typeof search?.resume === "string" ? search.resume : undefined,
  };
}

/** Shared search-param validator for the three estimate entry routes. */
export function validateProjectSearch(search: Record<string, unknown>): PreselectedProject {
  return {
    projectId: typeof search.projectId === "string" ? search.projectId : undefined,
    estimateId: typeof search.estimateId === "string" ? search.estimateId : undefined,
    projectName: typeof search.projectName === "string" ? search.projectName : undefined,
    source: typeof search.source === "string" ? search.source : undefined,
    resume: typeof search.resume === "string" ? search.resume : undefined,
  };
}
