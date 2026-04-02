type ApiError = {
  message: string;
  code?: string | null;
};

type PostOptions = {
  accessToken?: string | null;
};

const rawSupabaseUrl = String(import.meta.env.VITE_SUPABASE_URL || "").trim().replace(/\/+$/, "");
const rawApiBase = String(
  import.meta.env.VITE_PUBLIC_AUTH_BASE_URL ||
  import.meta.env.VITE_API_URL ||
  "",
).trim().replace(/\/+$/, "");
const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

function resolveFunctionsBase(): string {
  const candidate = rawApiBase || `${rawSupabaseUrl}/functions/v1`;
  if (!candidate) return "";
  if (/\/functions\/v1$/i.test(candidate)) return candidate;
  return `${candidate}/functions/v1`;
}

export function getPublicFunctionsBase(): string {
  return resolveFunctionsBase();
}

export async function postPublicFunction<T>(
  functionName: string,
  body: unknown,
  options: PostOptions = {},
): Promise<{ data: T | null; error: ApiError | null; status: number | null; headers: Headers | null }> {
  const base = resolveFunctionsBase();
  if (!base || !anonKey) {
    return {
      data: null,
      error: { message: "auth_client_misconfigured" },
      status: null,
      headers: null,
    };
  }

  const accessToken = String(options.accessToken || "").trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
  };
  if (accessToken) headers["x-huddle-access-token"] = accessToken;

  try {
    const res = await fetch(`${base}/${functionName}`, {
      method: "POST",
      headers,
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
        status: res.status,
        headers: res.headers,
      };
    }
    return {
      data: (payload?.data ?? payload ?? null) as T | null,
      error: null,
      status: res.status,
      headers: res.headers,
    };
  } catch (error) {
    return {
      data: null,
      error: { message: error instanceof Error ? error.message : "network_error" },
      status: null,
      headers: null,
    };
  }
}
