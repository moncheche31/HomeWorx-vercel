/**
 * Public, browser-safe backend configuration for this Lovable Cloud project.
 *
 * These values are intentionally limited to the project URL and publishable
 * key. They are not secrets; Row Level Security and authenticated server
 * functions remain the security boundary.
 */
export const MANAGED_PUBLIC_CONFIG = {
  VITE_SUPABASE_URL: "https://lwybxokduogiewxciecq.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_QoYMK38bu0QqNRwXig1owQ_TKFoMQT3",
} as const;

export type ManagedPublicConfigKey = keyof typeof MANAGED_PUBLIC_CONFIG;

export function readManagedPublicConfig(key: string): string | undefined {
  if (key !== "VITE_SUPABASE_URL" && key !== "VITE_SUPABASE_PUBLISHABLE_KEY") return undefined;
  return MANAGED_PUBLIC_CONFIG[key];
}
