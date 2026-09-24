import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

export type NetworkStatus = "online" | "offline" | "reconnecting" | "unknown";

interface NetworkContextValue {
  status: NetworkStatus;
  retry: () => void;
}

const NetworkContext = createContext<NetworkContextValue>({ status: "online", retry: () => {} });

/**
 * Tracks browser network connectivity. Renders the offline banner ONLY when
 * the browser has explicitly reported an offline state (or navigator.onLine
 * is false at check time). Defaults to "online" to avoid false positives
 * during SSR/hydration or inside preview iframes.
 */
export function NetworkStatusProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation("status");
  const [status, setStatus] = useState<NetworkStatus>("online");

  const sync = useCallback(() => {
    if (typeof navigator === "undefined") return;
    setStatus(navigator.onLine ? "online" : "offline");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => setStatus("online");
    const onOffline = () => {
      if (typeof navigator !== "undefined" && navigator.onLine) return;
      setStatus("offline");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    sync();
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, [sync]);

  const retry = useCallback(() => {
    setStatus("reconnecting");
    setTimeout(() => {
      if (typeof navigator === "undefined") {
        setStatus("online");
        return;
      }
      setStatus(navigator.onLine ? "online" : "offline");
    }, 400);
  }, []);

  const showBanner =
    status === "offline" && typeof navigator !== "undefined" && navigator.onLine === false;

  return (
    <NetworkContext.Provider value={{ status, retry }}>
      {children}
      {showBanner && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-destructive px-4 py-3 text-center text-sm font-medium text-destructive-foreground"
        >
          {t("offline.banner")}
        </div>
      )}
    </NetworkContext.Provider>
  );
}

export function useNetworkStatus() {
  return useContext(NetworkContext);
}
