import { useEffect } from "react";
import { rememberListSearch, type CrmListKey } from "./listReturn";

/**
 * Records the current list view whenever its search params change, so an
 * explicit detail-page back link can return to it.
 */
export function useRememberListSearch<S extends object>(key: CrmListKey, search: S): void {
  useEffect(() => {
    // Cast: each list page passes the search shape that matches its key.
    rememberListSearch(key, search as never);
  }, [key, search]);
}
