import { createContext, useContext, useState, type ReactNode } from "react";
import { resolvePublicConfig, setRuntimePublicConfig, type PublicConfigLifecycle } from "./env";

const initialLifecycle: PublicConfigLifecycle = {
  state: "loading",
  fingerprint: "resolving",
};

const PublicConfigContext = createContext<PublicConfigLifecycle>(initialLifecycle);

export function PublicConfigProvider({
  children,
  runtimeConfig,
}: {
  children: ReactNode;
  runtimeConfig?: Record<string, string | undefined>;
}) {
  // Applied during render (not in an effect) so any lazily created client that
  // resolves configuration before the effect runs sees the SSR-provided values.
  setRuntimePublicConfig(runtimeConfig);

  // Resolve synchronously from the loader-provided values. The previous
  // effect-only transition rendered the auth loading screen before
  // AuthProvider existed, so its session timeout could never protect this
  // path when hydration/effects were delayed on mobile Safari.
  const [lifecycle] = useState<PublicConfigLifecycle>(() => resolvePublicConfig());

  return <PublicConfigContext.Provider value={lifecycle}>{children}</PublicConfigContext.Provider>;
}

export function usePublicConfig(): PublicConfigLifecycle {
  return useContext(PublicConfigContext);
}
