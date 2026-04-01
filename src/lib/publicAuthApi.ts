import { supabase } from "@/integrations/supabase/client";

type ApiError = {
  message: string;
  code?: string | null;
};

type SessionTokens = {
  access_token: string;
  refresh_token: string;
};

type LoginPayload = {
  email?: string;
  phone?: string;
  password: string;
  turnstile_token: string;
  turnstile_action: "login";
};

type SignupPayload = {
  email: string;
  password: string;
  options?: {
    emailRedirectTo?: string;
    data?: Record<string, unknown>;
  };
  turnstile_token: string;
  turnstile_action: "signup";
};

type ResetPayload = {
  email: string;
  redirectTo: string;
  turnstile_token: string;
  turnstile_action: "reset_password";
};

type ChangePasswordPayload = {
  password: string;
  turnstile_token: string;
  turnstile_action: "change_password";
};

type LoginResponse = {
  session?: SessionTokens | null;
  user?: unknown;
};

type SignupResponse = {
  session?: SessionTokens | null;
  user?: unknown;
};

const supabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

async function postPublic<T>(functionName: string, body: unknown): Promise<{ data: T | null; error: ApiError | null }> {
  if (!supabaseUrl || !anonKey) {
    return { data: null, error: { message: "auth_client_misconfigured" } };
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify(body),
    });
    const payload = (await res.json().catch(() => null)) as
      | { data?: T; error?: string; message?: string; code?: string }
      | null;
    if (!res.ok) {
      return {
        data: null,
        error: {
          message: String(payload?.error || payload?.message || `http_${res.status}`),
          code: payload?.code ?? null,
        },
      };
    }
    return { data: (payload?.data ?? null) as T | null, error: null };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "network_error" },
    };
  }
}

async function applySession(session: SessionTokens | null | undefined): Promise<ApiError | null> {
  if (!session?.access_token || !session?.refresh_token) return null;
  const { error } = await supabase.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  return error ? { message: error.message || "set_session_failed" } : null;
}

export async function authLogin(payload: LoginPayload): Promise<{ error: ApiError | null }> {
  const res = await postPublic<LoginResponse>("auth-login", payload);
  if (res.error) return { error: res.error };
  const setSessionError = await applySession(res.data?.session);
  if (setSessionError) return { error: setSessionError };
  return { error: null };
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
  if (!supabaseUrl || !anonKey) {
    return { error: { message: "auth_client_misconfigured" } };
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const accessToken = String(session?.access_token || "").trim();
  if (!accessToken) {
    return { error: { message: "auth_required" } };
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/auth-change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "x-huddle-access-token": accessToken,
      },
      body: JSON.stringify(payload),
    });
    const body = (await res.json().catch(() => null)) as
      | { error?: string; message?: string; code?: string }
      | null;
    if (!res.ok) {
      return {
        error: {
          message: String(body?.error || body?.message || `http_${res.status}`),
          code: body?.code ?? null,
        },
      };
    }
  } catch (error) {
    return {
      error: { message: error instanceof Error ? error.message : "network_error" },
    };
  }
  return {
    error: null,
  };
}
