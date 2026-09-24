export type AuthStatus =
  | "initializing"
  | "authenticated"
  | "unauthenticated"
  | "signing_in"
  | "signing_out"
  | "refreshing"
  | "error";

export interface AuthUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  preferredLocale: string | null;
}

export interface AuthSession {
  userId: string;
  expiresAt: number | null;
}

export type AuthErrorCategory =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_exists"
  | "weak_password"
  | "invalid_email"
  | "password_reset_required"
  | "expired_link"
  | "invalid_link"
  | "rate_limited"
  | "configuration_error"
  | "network_error"
  | "service_unavailable"
  | "service_error"
  | "session_error"
  | "unknown";

export interface SafeAuthError {
  category: AuthErrorCategory;
  referenceId: string;
  providerCode?: string;
}

export interface SignUpMetadata {
  first_name: string;
  last_name: string;
  preferred_locale: string;
}

export type SignUpOutcome =
  | { ok: true; requiresEmailConfirmation: boolean }
  | { ok: false; error: SafeAuthError };

export interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  session: AuthSession | null;
  error: SafeAuthError | null;
  signInWithPassword: (email: string, password: string) => Promise<SafeAuthError | null>;
  signUpWithPassword: (
    email: string,
    password: string,
    metadata: SignUpMetadata,
  ) => Promise<SignUpOutcome>;
  resendConfirmation: (email: string) => Promise<SafeAuthError | null>;
  requestPasswordReset: (email: string) => Promise<SafeAuthError | null>;
  /** Request a Supabase-verified change of the account (login) email. */
  requestEmailChange: (email: string) => Promise<SafeAuthError | null>;
  signOut: () => Promise<SafeAuthError | null>;
  clearError: () => void;
}
