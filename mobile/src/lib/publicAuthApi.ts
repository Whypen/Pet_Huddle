import { supabase } from "./supabase";
import { postPublicFunction } from "./publicFunctionClient";
import { mapAuthFailureMessage } from "./authErrorMessages";

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
  turnstile_token: string;
  turnstile_action: "login";
};

type LoginResponse = {
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
