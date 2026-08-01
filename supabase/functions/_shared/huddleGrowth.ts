import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2.93.1";

export const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v23.0";
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const THREADS_GRAPH_BASE = Deno.env.get("THREADS_GRAPH_BASE_URL") || "https://graph.threads.net";
export const META_APP_ID = String(Deno.env.get("META_APP_ID") || "1935468547745133").trim();
export const THREADS_APP_ID = String(Deno.env.get("THREADS_APP_ID") || "1025693406835613").trim();

export const META_SCOPES = [
  "business_management", "pages_show_list", "pages_read_engagement",
  "pages_read_user_content", "pages_messaging", "instagram_basic", "instagram_content_publish",
  "instagram_manage_comments", "instagram_manage_messages", "instagram_manage_insights",
  "ads_read", "ads_management", "leads_retrieval", "whatsapp_business_management",
  "whatsapp_business_messaging",
];

export const THREADS_SCOPES = [
  "threads_basic", "threads_content_publish", "threads_manage_replies", "threads_read_replies",
  "threads_manage_insights",
];

// The Operations console is a local, authenticated admin tool. The function
// still verifies the Huddle admin JWT on every non-worker request; allowing
// browser origins here lets the local app use the same secured endpoint.
export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-huddle-access-token",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Vary": "Origin",
};

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json", ...headers },
  });

export const getServiceClient = () => createClient(
  String(Deno.env.get("SUPABASE_URL") || "").trim(),
  String(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "").trim(),
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const getBearerToken = (req: Request) => {
  const authorization = req.headers.get("Authorization") || req.headers.get("x-huddle-access-token") || "";
  return authorization.replace(/^Bearer\s+/i, "").trim();
};

export async function requireAdmin(req: Request, supabase: SupabaseClient): Promise<User> {
  const token = getBearerToken(req);
  if (!token || token.split(".").length !== 3) throw new Error("auth_required");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("auth_required");
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("is_admin,user_role")
    .eq("id", data.user.id)
    .maybeSingle();
  if (profileError || !(profile?.is_admin === true || String(profile?.user_role || "").toLowerCase() === "admin")) {
    throw new Error("admin_required");
  }
  return data.user;
}

const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string) => {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const tokenKey = async () => {
  const raw = String(Deno.env.get("META_TOKEN_ENCRYPTION_KEY") || "").trim();
  if (!raw) throw new Error("meta_token_encryption_key_missing");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};

export async function encryptToken(token: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await tokenKey(), new TextEncoder().encode(token));
  return { ciphertext: bytesToBase64(new Uint8Array(encrypted)), iv: bytesToBase64(iv) };
}

export async function decryptToken(ciphertext: string, iv: string) {
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await tokenKey(), base64ToBytes(ciphertext));
  return new TextDecoder().decode(decrypted);
}

export const randomToken = (bytes = 32) => bytesToBase64(crypto.getRandomValues(new Uint8Array(bytes))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
export const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

export const configuredRedirect = (provider: "meta" | "threads") => {
  const key = provider === "threads" ? "THREADS_OAUTH_REDIRECT_URI" : "META_OAUTH_REDIRECT_URI";
  const value = String(Deno.env.get(key) || "").trim();
  if (!value) throw new Error(`${key.toLowerCase()}_missing`);
  return value;
};

export const missingScopes = (granted: string[] | null | undefined, required: string[]) => {
  const set = new Set((granted || []).map((scope) => scope.toLowerCase()));
  return required.filter((scope) => !set.has(scope.toLowerCase()));
};

export async function graphRequest(
  url: string,
  options: { method?: string; token?: string; body?: Record<string, unknown>; form?: URLSearchParams; attempts?: number } ,
): Promise<Record<string, unknown>> {
  const attempts = Math.max(1, Math.min(options.attempts || 4, 6));
  let lastError = "graph_request_failed";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    let body: BodyInit | undefined;
    if (options.form) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = options.form;
    } else if (options.body) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    const response = await fetch(url, { method: options.method || "GET", headers, body });
    const raw = await response.text();
    let parsed: Record<string, unknown> = {};
    try { parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { parsed = { raw }; }
    if (response.ok) return parsed;
    const error = (parsed.error && typeof parsed.error === "object") ? parsed.error as Record<string, unknown> : parsed;
    lastError = String(error.message || parsed.error || `http_${response.status}`);
    const retryable = response.status === 429 || response.status >= 500 || String(error.code || "") === "17";
    if (!retryable || attempt === attempts - 1) {
      const failure = new Error(lastError);
      (failure as Error & { status?: number; payload?: unknown }).status = response.status;
      (failure as Error & { status?: number; payload?: unknown }).payload = parsed;
      throw failure;
    }
    const retryAfter = Number(response.headers.get("retry-after") || 0);
    const delay = retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * (2 ** attempt), 8000);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
  throw new Error(lastError);
}

export const graphJson = (path: string) => `${GRAPH_BASE}/${path.replace(/^\//, "")}`;
export const threadsJson = (path: string) => `${THREADS_GRAPH_BASE}/${path.replace(/^\//, "")}`;

export const safeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500).replaceAll(/(access_token|appsecret|client_secret|token)\s*(?:=|:)\s*[^&,;\s]*/gi, "$1=[redacted]");
};
