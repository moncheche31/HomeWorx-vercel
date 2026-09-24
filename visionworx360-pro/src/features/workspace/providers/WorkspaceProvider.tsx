import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
  BOOTSTRAP_RESOLUTION_TIMEOUT_MS,
  isResolutionTimeout,
  withTimeout,
} from "@/lib/async/withTimeout";
import { workspaceDiagnostic, workspaceDiagnosticError, safeErrorCode } from "@/lib/diagnostics/workspaceDiagnostics";
import { resolveDisplayName } from "../utils/identity";
import { getMyOrganization } from "../services/organization.functions";
import type { AppNotification, Organization, UserPreferences, UserProfile } from "../types";

/**
 * Resolution state of the active organization.
 * - loading: auth or the organization lookup has not settled yet
 * - ready: a verified organization id is available
 * - missing: authenticated user with no organization (onboarding)
 * - error: the organization lookup failed
 */
export type OrganizationStatus = "loading" | "ready" | "missing" | "error";

interface WorkspaceContextValue {
  organization: Organization | null;
  organizationLoading: boolean;
  organizationStatus: OrganizationStatus;
  refreshOrganization: () => Promise<unknown>;
  profile: UserProfile;
  preferences: UserPreferences;
  notifications: AppNotification[];
  unreadCount: number;
  markAllRead: () => void;
  markRead: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

const DEFAULT_PREFERENCES: UserPreferences = {
  notificationEmail: true,
  notificationPush: true,
  notificationSms: false,
  marketingOptIn: false,
  theme: "system",
};

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, status } = useAuth();
  const { t, i18n } = useTranslation("workspace");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const queryClient = useQueryClient();
  const fetchOrg = useServerFn(getMyOrganization);

  const isAuthed = status === "authenticated" && !!user?.id;
  const authCacheState = status === "authenticated" && user?.id
    ? `authenticated:${user.id}`
    : status === "unauthenticated"
      ? "unauthenticated"
      : "auth-loading";
  const orgQuery = useQuery({
    queryKey: ["workspace", authCacheState],
    queryFn: async () => {
      workspaceDiagnostic("workspace.organizationQuery:start", {
        userId: user?.id ?? null,
        authStatus: status,
      });
      try {
        /*
         * Hard resolution budget. Without it a request that never settles keeps
         * organizationStatus at "loading" forever, and every gate downstream
         * renders a full-screen loading state with no way out.
         */
        const result = await withTimeout(
          fetchOrg({ data: undefined as never }),
          BOOTSTRAP_RESOLUTION_TIMEOUT_MS,
          "Workspace resolution",
        );
        workspaceDiagnostic("workspace.organizationQuery:result", {
          lifecycleStage: "workspace-resolution",
          authReady: isAuthed,
          userPresent: Boolean(user),
          profileLookupStatus: result.trace.profileLookupStatus,
          organizationIdPresent: result.trace.organizationIdPresent,
          membershipStatus: result.trace.membershipStatus,
          organizationLookupStatus: result.trace.organizationLookupStatus,
          workspaceState: result.organization ? "ready" : "missing",
        });
        return result;

      } catch (error) {
        workspaceDiagnosticError("workspace.organizationQuery:error", error, {
          lifecycleStage: "workspace-resolution",
          authReady: isAuthed,
          userPresent: Boolean(user),
        });
        throw error;
      }
    },
    enabled: isAuthed,
    staleTime: 60_000,
    retry: (failureCount, error) => {
      // A timeout is terminal on purpose: the user gets an explicit retry
      // instead of silently waiting out another full budget.
      if (isResolutionTimeout(error)) return false;
      const code = safeErrorCode(error);
      return failureCount < 2 && (code === "AUTH_UNAUTHORIZED" || code === "NETWORK_FAILURE");
    },
  });

  useEffect(() => {
    if (!isAuthed) return;
    workspaceDiagnostic("workspace.resolution:lifecycle", {
      lifecycleStage: orgQuery.isPending ? "workspace-resolution-started" : "workspace-resolution-completed",
      authReady: true,
      userPresent: Boolean(user),
      organizationIdPresent: Boolean(orgQuery.data?.organization?.id),
      workspaceState: orgQuery.isError ? "error" : orgQuery.isSuccess ? (orgQuery.data?.organization ? "ready" : "missing") : "loading",
    });
  }, [isAuthed, orgQuery.data, orgQuery.isError, orgQuery.isPending, orgQuery.isSuccess, user]);

  /**
   * Canonical identity: the `public.profiles` row wins, with auth metadata as
   * fallback only. Never overwrite a stored value with a default.
   */
  const profileRow = orgQuery.data?.profile ?? null;
  const profile = useMemo<UserProfile>(() => {
    const fallback = t("identity.userFallback", { defaultValue: "User" });
    const displayName = resolveDisplayName(user, profileRow, fallback);
    return {
      id: profileRow?.id || user?.id || "",
      firstName: profileRow?.firstName ?? user?.firstName ?? null,
      lastName: profileRow?.lastName ?? user?.lastName ?? null,
      displayName,
      phone: profileRow?.phone ?? null,
      email: profileRow?.email ?? user?.email ?? null,
      avatarUrl: profileRow?.avatarUrl ?? null,
      language: profileRow?.language ?? user?.preferredLocale ?? i18n.language ?? "en-US",
      role: profileRow?.role ?? "owner",
      timezone: profileRow?.timezone ?? "America/New_York",
      measurementPreference: profileRow?.measurementPreference ?? "imperial",
    };
  }, [user, profileRow, t, i18n.language]);


  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })),
    );
  }, []);

  const markRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id && !n.readAt ? { ...n, readAt: new Date().toISOString() } : n)),
    );
  }, []);

  const refreshOrganization = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["workspace", authCacheState], exact: true }),
      queryClient.invalidateQueries({ queryKey: ["organization-products"] }),
      queryClient.invalidateQueries({ queryKey: ["projects"] }),
    ]);
  }, [queryClient, authCacheState]);

  const organizationStatus = useMemo<OrganizationStatus>(() => {
    let next: OrganizationStatus = "loading";
    if (isAuthed && orgQuery.isError) next = "error";
    else if (isAuthed && (orgQuery.isPending || orgQuery.isLoading)) next = "loading";
    else if (isAuthed && !orgQuery.isSuccess) next = "loading";
    else if (isAuthed) next = orgQuery.data?.organization ? "ready" : "missing";
    workspaceDiagnostic("workspace.organizationStatus", {
      lifecycleStage: "workspace-provider",
      authReady: isAuthed,
      userPresent: Boolean(user),
      organizationIdPresent: Boolean(orgQuery.data?.organization?.id),
      workspaceState: next,
      queryEnabledReason: isAuthed ? "authenticated-user" : authCacheState,
      ...(orgQuery.error ? { safeErrorCode: safeErrorCode(orgQuery.error) } : {}),
    });
    return next;
  }, [
    isAuthed,
    status,
    orgQuery.isError,
    orgQuery.isPending,
    orgQuery.isLoading,
    orgQuery.isSuccess,
    orgQuery.data,
    orgQuery.status,
    orgQuery.fetchStatus,
    orgQuery.error,
  ]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      organization: orgQuery.data?.organization ?? null,
      organizationLoading: orgQuery.isLoading,
      organizationStatus,
      refreshOrganization,
      profile,
      preferences: DEFAULT_PREFERENCES,
      notifications,
      unreadCount: notifications.filter((n) => !n.readAt).length,
      markAllRead,
      markRead,
    }),
    [
      orgQuery.data,
      orgQuery.isLoading,
      organizationStatus,
      refreshOrganization,
      profile,
      notifications,
      markAllRead,
      markRead,
    ],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

/**
 * Workspace context when it happens to be mounted. For surfaces that only use
 * company defaults as a nicety and must still render without the provider.
 */
export function useOptionalWorkspace(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext) ?? null;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}
