import type { Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase/client";
import { workspaceDiagnostic, workspaceDiagnosticError } from "@/lib/diagnostics/workspaceDiagnostics";
import type { AuthSession, AuthUser, SignUpMetadata } from "../types/auth";

export interface AuthProviderAdapter {
  getSession(): Promise<{ user: AuthUser | null; session: AuthSession | null }>;
  signInWithPassword(
    email: string,
    password: string,
  ): Promise<{ user: AuthUser; session: AuthSession }>;
  signUpWithPassword(
    email: string,
    password: string,
    redirectUrl: string,
    metadata: SignUpMetadata,
  ): Promise<{ requiresEmailConfirmation: boolean }>;
  resendConfirmation(email: string): Promise<void>;
  /**
   * Start a Supabase-managed change of the account (login) email. Supabase
   * sends a confirmation link; the address only changes once confirmed.
   */
  updateEmail(email: string, redirectUrl: string): Promise<void>;
  requestPasswordReset(email: string, redirectUrl: string): Promise<void>;
  signOut(): Promise<void>;
  subscribe(
    cb: (state: { user: AuthUser | null; session: AuthSession | null }) => void,
  ): () => void;
}

function toUser(session: Session | null): AuthUser | null {
  if (!session?.user) return null;
  const meta = (session.user.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown): string | null => {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    return trimmed ? trimmed : null;
  };
  return {
    id: session.user.id,
    email: session.user.email ?? null,
    firstName: str(meta.first_name),
    lastName: str(meta.last_name),
    preferredLocale: str(meta.preferred_locale),
  };
}

function toSession(session: Session | null): AuthSession | null {
  if (!session?.user) return null;
  return { userId: session.user.id, expiresAt: session.expires_at ?? null };
}

export const supabaseAuthAdapter: AuthProviderAdapter = {
  async getSession() {
    workspaceDiagnostic("auth.getSession:start", {
      lifecycleStage: "auth-session-restore",
      authReady: false,
      userPresent: false,
    });
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      workspaceDiagnosticError("auth.getSession:error", error);
      throw error;
    }
    workspaceDiagnostic("auth.getSession:result", {
      lifecycleStage: "auth-session-restore",
      authReady: true,
      userPresent: Boolean(data.session?.user),
    });
    return { user: toUser(data.session), session: toSession(data.session) };
  },
  async signInWithPassword(email, password) {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const user = toUser(data.session);
    const session = toSession(data.session);
    if (!user || !session) throw new Error("AUTH_SESSION_NOT_PERSISTED");
    return { user, session };
  },
  async signUpWithPassword(email, password, redirectUrl, metadata) {
    const supabase = getSupabase();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          first_name: metadata.first_name,
          last_name: metadata.last_name,
          preferred_locale: metadata.preferred_locale,
        },
      },
    });
    if (error) throw error;
    // If Supabase returns a session, the user is signed in immediately
    // (email confirmation disabled). Otherwise, confirmation is required.
    return { requiresEmailConfirmation: !data.session };
  },
  async resendConfirmation(email) {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resend({ type: "signup", email });
    if (error) throw error;
  },
  async updateEmail(email, redirectUrl) {
    const supabase = getSupabase();
    const { error } = await supabase.auth.updateUser(
      { email },
      { emailRedirectTo: redirectUrl },
    );
    if (error) throw error;
  },
  async requestPasswordReset(email, redirectUrl) {
    const supabase = getSupabase();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: redirectUrl,
    });
    if (error) throw error;
  },
  async signOut() {
    const supabase = getSupabase();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  },
  subscribe(cb) {
    const supabase = getSupabase();
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      workspaceDiagnostic("auth.onAuthStateChange", {
        lifecycleStage: `auth-event-${event.toLowerCase()}`,
        authReady: true,
        userPresent: Boolean(session?.user),
      });
      cb({ user: toUser(session), session: toSession(session) });
    });
    return () => {
      data.subscription.unsubscribe();
    };
  },
};
