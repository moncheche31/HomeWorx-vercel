import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

type SearchRecord = Record<string, unknown>;

/**
 * Writes CRM list-control changes back into the route's search params.
 *
 * - Any control change that is not an explicit page change returns the list to
 *   page 1, matching the previous `setPage(1)` behaviour of every filter.
 * - Empty values are removed so the URL only carries non-default state.
 * - Updates `replace` history so typing in the search box does not push a
 *   history entry per keystroke; the list URL the contractor leaves is the one
 *   the browser Back button restores.
 */
export function useListSearchUpdater<S extends object>() {
  const navigate = useNavigate();

  return useCallback(
    (patch: Partial<S>) => {
      const resetsPage = !Object.prototype.hasOwnProperty.call(patch, "page");
      // `useNavigate()` without a `from` cannot infer a search shape shared by
      // every route, so the reducer form is applied through a narrow local
      // signature instead of the router's per-route generic.
      const applySearch = navigate as unknown as (options: {
        search: (prev: SearchRecord) => SearchRecord;
        replace?: boolean;
      }) => void;
      applySearch({
        search: (prev: SearchRecord) => {
          const next: SearchRecord = { ...prev, ...(patch as SearchRecord) };
          if (resetsPage) delete next.page;
          for (const key of Object.keys(next)) {
            const value = next[key];
            if (value === undefined || value === null || value === "") delete next[key];
          }
          return next;
        },
        replace: true,
      });
    },
    [navigate],
  );
}
