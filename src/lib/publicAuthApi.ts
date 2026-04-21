import { supabase } from "@/integrations/supabase/client";
import { postPublicFunction } from "@/lib/publicFunctionClient";
import { mapAuthFailureMessage } from "@/lib/authErrorMessages";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";

type ApiError = {
  message: string;
  code?: string | null;
  details?: unknown;
};

type SessionTokens = {
  access_token: string;
  refresh_token: string;
};

type LoginPayload = {
  email?: string;
  phone?: string;
  password: string;
  turnstile_token?: string;
  turnstile_action?: "login";
};

type SignupPayload = {
  email: string;
  password: string;
  options?: {
    emailRedirectTo?: string;
    data?: Record<string, unknown>;
  };
  turnstile_token?: string;
  turnstile_action?: "signup";
  signup_proof?: string;
};

type ResetPayload = {
  email: string;
  redirectTo: string;
  turnstile_token: string;
  turnstile_action: "reset_password";
};

type ChangePasswordPayload = {
  password: string;
  turnstile_token?: string;
  turnstile_action?: "change_password";
};

type LoginResponse = {
  session?: SessionTokens | null;
  user?: unknown;
};

type SignupResponse = {
  session?: SessionTokens | null;
  user?: unknown;
};

async function postPublic<T>(functionName: string, body: unknown): Promise<{ data: T | null; error: ApiError | null }> {
  const res = await postPublicFunction<T>(functionName, body);
  return {
    data: res.data,
    error: res.error
      ? {
          ...res.error,
          message: mapAuthFailureMessage(res.error),
        }
      : null,
  };
}

async function applySession(session: SessionTokens | null | undefined): Promise<ApiError | null> {
  if (!session?.access_token || !session?.refresh_token) return null;
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return error ? { message: mapAuthFailureMessage(error.message || "set_session_failed") } : null;
}

export async function authLogin(payload: LoginPayload): Promise<{ userId: string | null; error: ApiError | null }> {
  const res = await postPublic<LoginResponse>("auth-login", payload);
  if (res.error) return { userId: null, error: res.error };
  const setSessionError = await applySession(res.data?.session);
  if (setSessionError) return { userId: null, error: setSessionError };
  const userId = String((res.data?.user as { id?: string | null } | null)?.id || "").trim() || null;
  return { userId, error: null };
}

export async function authSignup(payload: SignupPayload): Promise<{ session: SessionTokens | null; user: unknown | null; error: ApiError | null }> {
  const res = await postPublic<SignupResponse>("auth-signup", payload);
  if (res.error) return { session: null, user: null, error: res.error };
  const session = res.data?.session ?? null;
  const setSessionError = await applySession(session);
  if (setSessionError) {
    return { session: null, user: null, error: setSessionError };
  }
  return { session, user: res.data?.user ?? null, error: null };
}

export async function authResetPassword(payload: ResetPayload): Promise<{ error: ApiError | null }> {
  const res = await postPublic<null>("auth-reset-password", payload);
  return { error: res.error };
}

export async function authChangePassword(payload: ChangePasswordPayload): Promise<{ error: ApiError | null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = String(session?.access_token || "").trim();
  if (!accessToken) {
    return { error: { message: "auth_required" } };
  }
  const res = await invokeAuthedFunction<null>("auth-change-password", { body: payload });
  if (res.error) {
    return {
      error: {
        message: mapAuthFailureMessage(res.error.message || "password_change_failed"),
      },
    };
  }
  return {
    error: null,
  };
}
