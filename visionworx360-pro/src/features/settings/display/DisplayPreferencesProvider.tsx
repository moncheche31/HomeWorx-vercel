import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { logger } from "@/lib/logging/logger";
import {
  DEFAULT_DISPLAY_PREFERENCES,
  applyDisplayPreferences,
  applyLargerTextToggle,
  readLocalDisplayPreferences,
  sanitizeDisplayPreferences,
  toPreferenceRow,
  writeLocalDisplayPreferences,
  type DisplayPreferences,
} from "./preferences";

export type DisplayPreferencesPersistence = "server" | "local";

export interface DisplayPreferencesContextValue {
  preferences: DisplayPreferences;
  persistence: DisplayPreferencesPersistence;
  isLoading: boolean;
  update: (patch: Partial<DisplayPreferences>) => void;
  setLargerText: (on: boolean) => void;
  reset: () => void;
}

const DisplayPreferencesContext = createContext<DisplayPreferencesContextValue | null>(null);

export function DisplayPreferencesProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const userId = user?.id ?? null;
  const [preferences, setPreferences] = useState<DisplayPreferences>(DEFAULT_DISPLAY_PREFERENCES);
  const [persistence, setPersistence] = useState<DisplayPreferencesPersistence>("local");
  const [isLoading, setIsLoading] = useState(false);
  const hydratedFromServer = useRef<string | null>(null);

  // Instant local application before any network round trip.
  useEffect(() => {
    const local = readLocalDisplayPreferences();
    setPreferences(local);
    applyDisplayPreferences(local);
  }, []);

  useEffect(() => {
    applyDisplayPreferences(preferences);
  }, [preferences]);

  // Server hydration (authoritative when available).
  useEffect(() => {
    if (!userId || status !== "authenticated") return;
    if (hydratedFromServer.current === userId) return;
    let cancelled = false;
    setIsLoading(true);
    void (async () => {
      const { data, error } = await supabase
        .from("user_preferences")
        .select("text_size, display_density, use_device_text_size")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      setIsLoading(false);
      if (error || !data) {
        setPersistence("local");
        logger.warn("display_preferences", {
          event: "server_hydrate_failed",
          reason: error?.message ?? "no_row",
        });
        return;
      }
      hydratedFromServer.current = userId;
      setPersistence("server");
      const next = sanitizeDisplayPreferences(data);
      setPreferences(next);
      writeLocalDisplayPreferences(next);
      applyDisplayPreferences(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [status, userId]);

  const persist = useCallback(
    (next: DisplayPreferences) => {
      writeLocalDisplayPreferences(next);
      if (!userId) return;
      void (async () => {
        const { error } = await supabase
          .from("user_preferences")
          .upsert({ user_id: userId, ...toPreferenceRow(next) }, { onConflict: "user_id" });
        if (error) {
          setPersistence("local");
          logger.warn("display_preferences", {
            event: "server_save_failed",
            reason: error.message,
          });
          return;
        }
        setPersistence("server");
      })();
    },
    [userId],
  );

  const update = useCallback(
    (patch: Partial<DisplayPreferences>) => {
      setPreferences((current) => {
        const next = sanitizeDisplayPreferences({ ...current, ...patch });
        applyDisplayPreferences(next);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setLargerText = useCallback(
    (on: boolean) => {
      setPreferences((current) => {
        const next = applyLargerTextToggle(current, on);
        applyDisplayPreferences(next);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(() => {
    const next = { ...DEFAULT_DISPLAY_PREFERENCES };
    applyDisplayPreferences(next);
    persist(next);
    setPreferences(next);
  }, [persist]);

  const value = useMemo<DisplayPreferencesContextValue>(
    () => ({ preferences, persistence, isLoading, update, setLargerText, reset }),
    [preferences, persistence, isLoading, update, setLargerText, reset],
  );

  return (
    <DisplayPreferencesContext.Provider value={value}>
      {children}
    </DisplayPreferencesContext.Provider>
  );
}

export function useDisplayPreferences(): DisplayPreferencesContextValue {
  const ctx = useContext(DisplayPreferencesContext);
  if (!ctx) {
    throw new Error("useDisplayPreferences must be used inside <DisplayPreferencesProvider>");
  }
  return ctx;
}
