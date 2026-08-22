import type { Session } from "@supabase/supabase-js";
import { getClientEnv } from "@/lib/env";

export type WebNotificationRow = {
  id: string;
  message?: string | null;
  title?: string | null;
  body?: string | null;
  type?: string | null;
  href?: string | null;
  read?: boolean | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
  data?: Record<string, unknown> | null;
};

const getWebNotificationRequest = (session: Session | null) => {
  const token = String(session?.access_token || "").trim();
  const { supabaseUrl, supabaseAnonKey } = getClientEnv();
  if (!token || !supabaseUrl || !supabaseAnonKey) {
    throw new Error("notifications_access_token_required");
  }
  return {
    token,
    url: `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/notifications`,
    key: supabaseAnonKey,
  };
};

const parseResponse = async (response: Response) => {
  const raw = await response.text();
  let parsed: unknown = [];
  if (raw) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = raw;
    }
  }
  if (!response.ok) {
    const message =
      typeof parsed === "object" && parsed && "message" in parsed
        ? String((parsed as { message?: unknown }).message || response.statusText)
        : String(parsed || response.statusText);
    throw new Error(message);
  }
  return parsed;
};

const requestHeaders = (token: string, key: string) => ({
  Authorization: `Bearer ${token}`,
  apikey: key,
});

export const fetchWebUnreadNotifications = async (userId: string, session: Session | null) => {
  const request = getWebNotificationRequest(session);
  const params = new URLSearchParams({
    select: "id,message,body,title,metadata,data",
    limit: "200",
    user_id: `eq.${userId}`,
    read: "eq.false",
  });
  const parsed = await parseResponse(
    await fetch(`${request.url}?${params.toString()}`, { headers: requestHeaders(request.token, request.key) }),
  );
  return Array.isArray(parsed) ? (parsed as WebNotificationRow[]) : [];
};

export const fetchWebNotifications = async (userId: string, session: Session | null, limit = 200) => {
  const request = getWebNotificationRequest(session);
  const params = new URLSearchParams({
    select: "id,message,title,body,type,href,read,created_at,metadata,data",
    user_id: `eq.${userId}`,
    order: "created_at.desc",
    limit: String(Math.max(1, Math.min(limit, 200))),
  });
  const parsed = await parseResponse(
    await fetch(`${request.url}?${params.toString()}`, { headers: requestHeaders(request.token, request.key) }),
  );
  return Array.isArray(parsed) ? (parsed as WebNotificationRow[]) : [];
};

export const markWebNotificationsRead = async (userId: string, session: Session | null, id?: string) => {
  const request = getWebNotificationRequest(session);
  const params = new URLSearchParams({ user_id: `eq.${userId}`, read: "eq.false" });
  if (id) params.set("id", `eq.${id}`);
  await parseResponse(
    await fetch(`${request.url}?${params.toString()}`, {
      method: "PATCH",
      headers: { ...requestHeaders(request.token, request.key), "content-type": "application/json", prefer: "return=minimal" },
      body: JSON.stringify({ read: true }),
    }),
  );
};
