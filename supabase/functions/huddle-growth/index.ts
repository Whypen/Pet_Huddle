import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import {
  CORS_HEADERS,
  GRAPH_BASE,
  GRAPH_VERSION,
  META_APP_ID,
  META_SCOPES,
  THREADS_APP_ID,
  THREADS_GRAPH_BASE,
  THREADS_SCOPES,
  configuredRedirect,
  decryptToken,
  encryptToken,
  getBearerToken,
  getServiceClient,
  graphJson,
  graphRequest,
  json,
  missingScopes,
  randomToken,
  requireAdmin,
  safeError,
  sha256,
  threadsJson,
} from "../_shared/huddleGrowth.ts";

const supabase = getServiceClient();
const META_APP_SECRET = String(Deno.env.get("META_APP_SECRET") || "").trim();
const THREADS_APP_SECRET = String(Deno.env.get("THREADS_APP_SECRET") || "").trim();

const html = (message: string, status = 200) => new Response(
  `<!doctype html><meta charset="utf-8"><title>Huddle Growth Agent</title><p>${message}</p><script>try{window.opener&&window.opener.postMessage({type:'huddle-growth-connected'},'*')}catch{};setTimeout(()=>location.href=${JSON.stringify(`${Deno.env.get("APP_URL") || "https://huddle.pet"}/admin/growth`)},400)</script>`,
  { status, headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" } },
);

const requireWorker = (req: Request) => {
  const configured = String(Deno.env.get("GROWTH_WORKER_SECRET") || "").trim();
  const supplied = req.headers.get("x-growth-worker-secret") || "";
  if (!configured || supplied.length < 16 || supplied !== configured) throw new Error("worker_unauthorized");
};

const decodeBase64Url = (value: string) => {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
};

const verifySignedRequest = async (signedRequest: string, secret: string) => {
  if (!secret) throw new Error("app_secret_missing");
  const [encodedSignature, encodedPayload] = signedRequest.split(".");
  if (!encodedSignature || !encodedPayload) throw new Error("signed_request_invalid");
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("HMAC", key, decodeBase64Url(encodedSignature), new TextEncoder().encode(encodedPayload));
  if (!valid) throw new Error("signed_request_invalid");
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(encodedPayload))) as Record<string, unknown>;
  if (String(payload.algorithm || "HMAC-SHA256").toUpperCase() !== "HMAC-SHA256") throw new Error("signed_request_algorithm_invalid");
  return payload;
};

const readSignedRequest = async (req: Request) => {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    return String(body.signed_request || "");
  }
  const form = new URLSearchParams(await req.text());
  return String(form.get("signed_request") || "");
};

const handleComplianceCallback = async (req: Request, url: URL) => {
  const operation = String(url.searchParams.get("compliance") || "");
  if (operation === "deletion_status") {
    const code = String(url.searchParams.get("code") || "");
    return html(code ? `Huddle data deletion request ${code} has been received.` : "Deletion request code is missing.", code ? 200 : 400);
  }
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const provider = operation.startsWith("threads_") ? "threads" : "meta";
  const payload = await verifySignedRequest(await readSignedRequest(req), provider === "threads" ? THREADS_APP_SECRET : META_APP_SECRET);
  const externalUserId = String(payload.user_id || payload.profile_id || "");
  if (!externalUserId) throw new Error("signed_request_user_missing");
  const { data: connection } = await supabase.from("huddle_growth_connections").select("id").eq("provider", provider).eq("external_user_id", externalUserId).maybeSingle();
  if (connection?.id) {
    await supabase.from("huddle_growth_connections").update({
      status: "revoked",
      encrypted_access_token: null,
      access_token_iv: null,
      last_error: operation.endsWith("delete") ? "data_deletion_requested" : "provider_deauthorized",
      updated_at: new Date().toISOString(),
    }).eq("id", connection.id);
    await supabase.from("huddle_growth_audit_logs").insert({
      connection_id: connection.id,
      action: operation.endsWith("delete") ? "provider_data_deletion_requested" : "provider_deauthorized",
      platform: provider,
      details: { external_user_id: externalUserId },
    });
  }
  if (!operation.endsWith("delete")) return json({ ok: true });
  const confirmationCode = crypto.randomUUID();
  const statusUrl = new URL(req.url);
  statusUrl.search = new URLSearchParams({ compliance: "deletion_status", code: confirmationCode }).toString();
  return json({ url: statusUrl.toString(), confirmation_code: confirmationCode });
};

const getConnection = async (connectionId: string) => {
  const { data, error } = await supabase.from("huddle_growth_connections").select("*").eq("id", connectionId).maybeSingle();
  if (error || !data) throw new Error("connection_not_found");
  return data as Record<string, unknown>;
};

const getAsset = async (assetId: string) => {
  const { data, error } = await supabase.from("huddle_growth_assets").select("*").eq("id", assetId).maybeSingle();
  if (error || !data) throw new Error("asset_not_found");
  return data as Record<string, unknown>;
};

const readToken = async (row: Record<string, unknown>) => {
  const ciphertext = String(row.encrypted_access_token || "");
  const iv = String(row.access_token_iv || "");
  if (!ciphertext || !iv) throw new Error("connection_token_missing");
  return decryptToken(ciphertext, iv);
};

const storeConnection = async ({ provider, externalUserId, displayName, token, expiresAt, scopes, metadata, createdBy }: {
  provider: "meta" | "threads";
  externalUserId: string;
  displayName?: string;
  token: string;
  expiresAt?: string | null;
  scopes: string[];
  metadata?: Record<string, unknown>;
  createdBy: string | null;
}) => {
  const encrypted = await encryptToken(token);
  const { data, error } = await supabase.from("huddle_growth_connections").upsert({
    provider,
    external_user_id: externalUserId,
    display_name: displayName || externalUserId,
    status: "active",
    encrypted_access_token: encrypted.ciphertext,
    access_token_iv: encrypted.iv,
    token_expires_at: expiresAt || null,
    granted_scopes: scopes,
    metadata: metadata || {},
    created_by: createdBy,
    last_error: null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "provider,external_user_id" }).select("id,provider,external_user_id,display_name,status,token_expires_at,granted_scopes,metadata").single();
  if (error || !data) throw new Error(`connection_store_failed:${error?.message || "unknown"}`);
  return data as Record<string, unknown>;
};

const storeAsset = async (connectionId: string, asset: {
  assetType: string;
  externalId: string;
  name?: string;
  token?: string;
  expiresAt?: string | null;
  scopes?: string[];
  metadata?: Record<string, unknown>;
}) => {
  const encrypted = asset.token ? await encryptToken(asset.token) : null;
  const { data, error } = await supabase.from("huddle_growth_assets").upsert({
    connection_id: connectionId,
    asset_type: asset.assetType,
    external_id: asset.externalId,
    name: asset.name || asset.externalId,
    status: "active",
    encrypted_access_token: encrypted?.ciphertext || null,
    access_token_iv: encrypted?.iv || null,
    token_expires_at: asset.expiresAt || null,
    granted_scopes: asset.scopes || [],
    metadata: asset.metadata || {},
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "connection_id,asset_type,external_id" }).select("id,connection_id,asset_type,external_id,name,status,metadata,granted_scopes").single();
  if (error || !data) throw new Error(`asset_store_failed:${error?.message || "unknown"}`);
  return data as Record<string, unknown>;
};

const listMetaScopes = async (token: string) => {
  try {
    const data = await graphRequest(graphJson("me/permissions"), { token });
    return Array.isArray(data.data)
      ? (data.data as Array<Record<string, unknown>>).filter((row) => row.status === "granted").map((row) => String(row.permission || ""))
      : [];
  } catch { return []; }
};

const exchangeMetaCode = async (code: string, redirectUri: string) => {
  const secret = String(Deno.env.get("META_APP_SECRET") || "").trim();
  if (!secret) throw new Error("meta_app_secret_missing");
  const short = await graphRequest(`${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({ client_id: META_APP_ID, client_secret: secret, redirect_uri: redirectUri, code })}`, {});
  const shortToken = String(short.access_token || "");
  if (!shortToken) throw new Error("meta_access_token_missing");
  const long = await graphRequest(`${GRAPH_BASE}/oauth/access_token?${new URLSearchParams({ grant_type: "fb_exchange_token", client_id: META_APP_ID, client_secret: secret, fb_exchange_token: shortToken })}`, {});
  return { token: String(long.access_token || shortToken), expiresIn: Number(long.expires_in || 0) };
};

const exchangeThreadsCode = async (code: string, redirectUri: string) => {
  const secret = String(Deno.env.get("THREADS_APP_SECRET") || Deno.env.get("META_APP_SECRET") || "").trim();
  if (!secret) throw new Error("threads_app_secret_missing");
  const form = new URLSearchParams({ client_id: THREADS_APP_ID, client_secret: secret, grant_type: "authorization_code", redirect_uri: redirectUri, code });
  const short = await graphRequest(`${THREADS_GRAPH_BASE}/oauth/access_token`, { method: "POST", form });
  const shortToken = String(short.access_token || "");
  if (!shortToken) throw new Error("threads_access_token_missing");
  const long = await graphRequest(`${THREADS_GRAPH_BASE}/access_token?${new URLSearchParams({ grant_type: "th_exchange_token", client_secret: secret, access_token: shortToken })}`, { token: shortToken });
  return { token: String(long.access_token || shortToken), userId: String(long.user_id || short.user_id || ""), expiresIn: Number(long.expires_in || 0) };
};

const discoverMetaAssets = async (connection: Record<string, unknown>, token: string) => {
  const connectionId = String(connection.id);
  const granted = Array.isArray(connection.granted_scopes) ? connection.granted_scopes.map(String) : [];
  const configuredPageId = String(Deno.env.get("HUDDLE_FACEBOOK_PAGE_ID") || "").trim();
  const configuredInstagramId = String(Deno.env.get("HUDDLE_INSTAGRAM_ACCOUNT_ID") || "").trim();
  const configuredAdAccountId = String(Deno.env.get("HUDDLE_AD_ACCOUNT_ID") || "").trim();
  const assets: Record<string, unknown>[] = [];
  if (!missingScopes(granted, ["pages_show_list"])[0]) {
    const pages = await graphRequest(graphJson("me/accounts?fields=id,name,access_token,instagram_business_account"), { token });
    for (const page of (Array.isArray(pages.data) ? pages.data : []) as Array<Record<string, unknown>>) {
      if (configuredPageId && String(page.id) !== configuredPageId) continue;
      const pageToken = String(page.access_token || "");
      const storedPage = await storeAsset(connectionId, { assetType: "facebook_page", externalId: String(page.id), name: String(page.name || page.id), token: pageToken || undefined, scopes: granted, metadata: { page_id: page.id } });
      assets.push(storedPage);
      const ig = page.instagram_business_account as Record<string, unknown> | undefined;
      if (ig?.id && (!configuredInstagramId || String(ig.id) === configuredInstagramId)) {
        const igProfile = await graphRequest(graphJson(`${ig.id}?fields=id,username,name,profile_picture_url`), { token: pageToken || token });
        assets.push(await storeAsset(connectionId, { assetType: "instagram_business", externalId: String(ig.id), name: String(igProfile.username || igProfile.name || ig.id), token: pageToken || token, scopes: granted, metadata: { page_id: page.id, username: igProfile.username } }));
      }
    }
  }
  if (!missingScopes(granted, ["ads_read"])[0]) {
    const adAccounts = await graphRequest(graphJson("me/adaccounts?fields=id,name,account_status,currency"), { token });
    for (const account of (Array.isArray(adAccounts.data) ? adAccounts.data : []) as Array<Record<string, unknown>>) {
      if (configuredAdAccountId && String(account.id) !== configuredAdAccountId) continue;
      assets.push(await storeAsset(connectionId, { assetType: "ad_account", externalId: String(account.id), name: String(account.name || account.id), token, scopes: granted, metadata: account }));
    }
  }
  if (!missingScopes(granted, ["business_management", "whatsapp_business_management"]).length) {
    const businesses = await graphRequest(graphJson("me/businesses?fields=id,name"), { token });
    for (const business of (Array.isArray(businesses.data) ? businesses.data : []) as Array<Record<string, unknown>>) {
      const wabas = await graphRequest(graphJson(`${String(business.id)}/owned_whatsapp_business_accounts?fields=id,name`), { token });
      for (const waba of (Array.isArray(wabas.data) ? wabas.data : []) as Array<Record<string, unknown>>) {
        assets.push(await storeAsset(connectionId, { assetType: "whatsapp_business", externalId: String(waba.id), name: String(waba.name || waba.id), token, scopes: granted, metadata: { business_id: business.id } }));
        const phones = await graphRequest(graphJson(`${String(waba.id)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`), { token });
        for (const phone of (Array.isArray(phones.data) ? phones.data : []) as Array<Record<string, unknown>>) {
          assets.push(await storeAsset(connectionId, { assetType: "whatsapp_phone", externalId: String(phone.id), name: String(phone.verified_name || phone.display_phone_number || phone.id), token, scopes: granted, metadata: { waba_id: waba.id, ...phone } }));
        }
      }
    }
  }
  for (const [assetType, externalId] of [["facebook_page", configuredPageId], ["instagram_business", configuredInstagramId], ["ad_account", configuredAdAccountId]]) {
    if (externalId) await supabase.from("huddle_growth_assets").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("connection_id", connectionId).eq("asset_type", assetType).neq("external_id", externalId);
  }
  return assets;
};

const discoverThreadsAsset = async (connection: Record<string, unknown>, token: string) => {
  const profile = await graphRequest(threadsJson("me?fields=id,username,name,threads_profile_picture_url"), { token });
  const userId = String(profile.id || connection.external_user_id);
  return storeAsset(String(connection.id), { assetType: "threads_profile", externalId: userId, name: String(profile.username || profile.name || userId), token, scopes: Array.isArray(connection.granted_scopes) ? connection.granted_scopes.map(String) : [], metadata: { username: profile.username } });
};

const requiredConfiguredSecret = (name: string) => {
  const value = String(Deno.env.get(name) || "").trim();
  if (!value) throw new Error(`configured_secret_missing:${name}`);
  return value;
};

const configuredAssetId = (name: string) => requiredConfiguredSecret(name);

const enforceHuddleOwnedAssets = async () => {
  for (const [assetType, secretName] of [["facebook_page", "HUDDLE_FACEBOOK_PAGE_ID"], ["instagram_business", "HUDDLE_INSTAGRAM_ACCOUNT_ID"], ["ad_account", "HUDDLE_AD_ACCOUNT_ID"]]) {
    const externalId = String(Deno.env.get(secretName) || "").trim();
    if (externalId) await supabase.from("huddle_growth_assets").update({ status: "inactive", updated_at: new Date().toISOString() }).eq("asset_type", assetType).neq("external_id", externalId);
  }
};

const bootstrapConfiguredAssets = async (adminId: string | null) => {
  const metaToken = requiredConfiguredSecret("META_ACCESS_TOKEN");
  const pageId = configuredAssetId("HUDDLE_FACEBOOK_PAGE_ID");
  const instagramId = configuredAssetId("HUDDLE_INSTAGRAM_ACCOUNT_ID");
  const adAccountId = configuredAssetId("HUDDLE_AD_ACCOUNT_ID");
  const me = await graphRequest(graphJson("me?fields=id,name"), { token: metaToken });
  const grantedScopes = await listMetaScopes(metaToken);
  const connection = await storeConnection({
    provider: "meta",
    externalUserId: String(me.id || ""),
    displayName: String(me.name || me.id || "Huddle Meta business user"),
    token: metaToken,
    expiresAt: null,
    scopes: grantedScopes,
    metadata: { app_id: META_APP_ID, source: "configured_asset_bootstrap" },
    createdBy: adminId,
  });
  const connectionId = String(connection.id);
  const page = await graphRequest(graphJson(`${pageId}?fields=id,name,access_token,instagram_business_account`), { token: metaToken });
  if (String(page.id || "") !== pageId) throw new Error("configured_page_id_mismatch");
  const pageToken = String(page.access_token || metaToken);
  const facebookAsset = await storeAsset(connectionId, {
    assetType: "facebook_page",
    externalId: pageId,
    name: String(page.name || pageId),
    token: pageToken,
    scopes: grantedScopes,
    metadata: { page_id: pageId, source: "configured_asset_bootstrap" },
  });
  const instagram = await graphRequest(graphJson(`${instagramId}?fields=id,username,name,profile_picture_url`), { token: pageToken });
  if (String(instagram.id || "") !== instagramId) throw new Error("configured_instagram_id_mismatch");
  const instagramAsset = await storeAsset(connectionId, {
    assetType: "instagram_business",
    externalId: instagramId,
    name: String(instagram.username || instagram.name || instagramId),
    token: pageToken,
    scopes: grantedScopes,
    metadata: { page_id: pageId, username: instagram.username || null, source: "configured_asset_bootstrap" },
  });
  const adAccount = await graphRequest(graphJson(`${adAccountId}?fields=id,name,account_status,currency`), { token: metaToken });
  if (String(adAccount.id || "") !== adAccountId) throw new Error("configured_ad_account_id_mismatch");
  const adsAsset = await storeAsset(connectionId, {
    assetType: "ad_account",
    externalId: adAccountId,
    name: String(adAccount.name || adAccountId),
    token: metaToken,
    scopes: grantedScopes,
    metadata: { account_status: adAccount.account_status || null, currency: adAccount.currency || null, source: "configured_asset_bootstrap" },
  });
  const assets: Record<string, unknown>[] = [facebookAsset, instagramAsset, adsAsset];
  let whatsappError: string | null = null;
  if (!missingScopes(grantedScopes, ["business_management", "whatsapp_business_management"]).length) {
    try {
      const businesses = await graphRequest(graphJson("me/businesses?fields=id,name"), { token: metaToken });
      const failures: string[] = [];
      for (const business of (Array.isArray(businesses.data) ? businesses.data : []) as Array<Record<string, unknown>>) {
        try {
          const wabas = await graphRequest(graphJson(`${String(business.id)}/owned_whatsapp_business_accounts?fields=id,name`), { token: metaToken });
          for (const waba of (Array.isArray(wabas.data) ? wabas.data : []) as Array<Record<string, unknown>>) {
            assets.push(await storeAsset(connectionId, { assetType: "whatsapp_business", externalId: String(waba.id), name: String(waba.name || waba.id), token: metaToken, scopes: grantedScopes, metadata: { business_id: business.id, source: "configured_asset_bootstrap" } }));
            const phones = await graphRequest(graphJson(`${String(waba.id)}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating`), { token: metaToken });
            for (const phone of (Array.isArray(phones.data) ? phones.data : []) as Array<Record<string, unknown>>) {
              assets.push(await storeAsset(connectionId, { assetType: "whatsapp_phone", externalId: String(phone.id), name: String(phone.verified_name || phone.display_phone_number || phone.id), token: metaToken, scopes: grantedScopes, metadata: { waba_id: waba.id, source: "configured_asset_bootstrap", ...phone } }));
            }
          }
        } catch (error) {
          failures.push(safeError(error));
        }
      }
      whatsappError = failures.length ? failures.join("; ") : null;
    } catch (error) {
      whatsappError = safeError(error);
    }
  }
  const threadsToken = String(Deno.env.get("THREADS_ACCESS_TOKEN") || "").trim();
  let threadsError: string | null = null;
  if (threadsToken) {
    try {
      const profile = await graphRequest(threadsJson("me?fields=id,username,name,threads_profile_picture_url"), { token: threadsToken });
      const threadsUserId = String(profile.id || "");
      if (!threadsUserId) throw new Error("threads_profile_missing");
      // The configured token is verified against Threads before it is stored.
      // Only the scope supplied by the authorised connector is recorded; the
      // execution layer still blocks publishing/replies until Meta grants the
      // corresponding capability in a future OAuth refresh.
      const threadsScopes = ["threads_business_basic"];
      const threadsConnection = await storeConnection({
        provider: "threads",
        externalUserId: threadsUserId,
        displayName: String(profile.username || profile.name || threadsUserId),
        token: threadsToken,
        expiresAt: null,
        scopes: threadsScopes,
        metadata: { app_id: THREADS_APP_ID, source: "configured_asset_bootstrap" },
        createdBy: adminId,
      });
      assets.push(await storeAsset(String(threadsConnection.id), {
        assetType: "threads_profile",
        externalId: threadsUserId,
        name: String(profile.username || profile.name || threadsUserId),
        token: threadsToken,
        scopes: threadsScopes,
        metadata: { username: profile.username || null, source: "configured_asset_bootstrap" },
      }));
    } catch (error) {
      threadsError = safeError(error);
    }
  }
  await supabase.from("huddle_growth_audit_logs").insert({
    actor_id: adminId,
    connection_id: connectionId,
    action: "configured_assets_bootstrapped",
    platform: "meta",
    details: { asset_types: assets.map((asset) => String(asset.asset_type || "")), threads_error: threadsError, whatsapp_error: whatsappError },
  });
  return { assets, threads_error: threadsError, whatsapp_error: whatsappError };
};

const resolveAssetToken = async (asset: Record<string, unknown>, connection: Record<string, unknown>) => {
  const assetCiphertext = String(asset.encrypted_access_token || "");
  if (assetCiphertext && asset.access_token_iv) return decryptToken(assetCiphertext, String(asset.access_token_iv));
  return readToken(connection);
};

const recordImportedContent = async (asset: Record<string, unknown>, input: {
  platform: "instagram" | "threads" | "facebook";
  externalId: string;
  copy: string;
  publishedAt?: string | null;
  contentType: "text" | "image" | "video" | "carousel" | "reel";
  metadata: Record<string, unknown>;
  performance?: Record<string, unknown>;
}) => {
  const body = { copy: input.copy, imported_from: "meta_live_sync", ...input.metadata };
  const row = {
    platform: input.platform,
    asset_id: String(asset.id),
    external_id: input.externalId,
    objective: "Live account activity",
    content_type: input.contentType,
    body,
    performance: input.performance || {},
    status: "published",
    published_at: input.publishedAt || null,
    updated_at: new Date().toISOString(),
  };
  const { data: existing, error: lookupError } = await supabase.from("huddle_growth_content")
    .select("id")
    .eq("platform", input.platform)
    .eq("external_id", input.externalId)
    .maybeSingle();
  if (lookupError) throw lookupError;
  const result = existing
    ? await supabase.from("huddle_growth_content").update(row).eq("id", existing.id)
    : await supabase.from("huddle_growth_content").insert(row);
  if (result.error) throw result.error;
};

const stableIndex = (value: string, length: number) => {
  let hash = 0;
  for (const character of value) hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  return length ? hash % length : 0;
};

const replyAddress = (context: Record<string, unknown>, isComment: boolean) => {
  const raw = String(context.contact_label || context.author_username || "").trim().replace(/^@/, "");
  if (!raw || ["community member", "instagram user", "facebook user", "threads user", "messenger user"].includes(raw.toLowerCase())) return "";
  if (!isComment) return `Hey ${raw.split(/\s+/)[0]} — `;
  return /^[a-z0-9._]+$/i.test(raw) ? `@${raw} ` : `${raw}, `;
};

const classifyConversation = (textValue: unknown, context: Record<string, unknown> = {}) => {
  const text = String(textValue || "").trim();
  const lower = text.toLowerCase();
  const isComment = String(context.kind || context.source_type || "").toLowerCase() === "comment" || String(context.kind || "").toLowerCase() === "reply";
  const address = replyAddress(context, isComment);
  const variantSeed = `${context.external_message_id || ""}|${context.contact_label || ""}|${text}`;
  const choose = (variants: string[]) => `${address}${variants[stableIndex(variantSeed, variants.length)]}`;
  const has = (...terms: string[]) => terms.some((term) => lower.includes(term));
  const words = (...terms: string[]) => terms.some((term) => new RegExp(`\\b${term}\\b`, "i").test(text));
  if (has("where are you based", "where are you from", "which country", "what country")) return {
    classification: "location question", risk: "routine", reply_status: "ready",
    agent_draft: "huddle is operating across the UK and Asia first. Is there something you’d like help with where you are?",
  };
  if (has("vet", "veterinary", "bleeding", "poison", "can't breathe", "cannot breathe", "seizure", "emergency", "dying", "injured")) return {
    classification: "animal safety", risk: "sensitive", reply_status: "needs_approval",
    agent_draft: isComment ? choose(["this sounds urgent — please contact a local vet or emergency veterinary service now. We can’t assess an emergency from a comment."]) : `${address || "Hey — "}I’m sorry, this sounds urgent. Please contact a local vet or emergency veterinary service now. We can’t diagnose or assess an emergency from a message.`,
  };
  if (has("animal torture", "torture", "animal murder", "murder videos", "animal abuse", "kill animals", "killing animals")) return {
    classification: "animal harm", risk: "sensitive", reply_status: "needs_approval",
    agent_draft: isComment ? choose(["yeah, this is horrifying. We’re not repeating the graphic details, but animal harm should never be treated like normal content.", "this is genuinely awful. We won’t amplify the graphic details, but treating animal harm as normal content is never okay."]) : `${address || "Hey — "}I’m sorry you had to see this. Please don’t send or repost graphic material. Share the public link only and we’ll review what can be reported safely.`,
  };
  if (has("suicide", "kill myself", "self harm", "self-harm")) return {
    classification: "crisis safety", risk: "sensitive", reply_status: "needs_approval",
    agent_draft: "If you or someone else is in immediate danger, contact local emergency services now. We can’t safely handle a crisis through social messages.",
  };
  if (has("lawyer", "legal", "police", "refund", "payment", "charged", "privacy", "harass", "abuse", "scam")) return {
    classification: "sensitive support", risk: "sensitive", reply_status: "needs_approval",
    agent_draft: isComment ? choose(["we’re taking this seriously. Please DM us the details so nothing private ends up in public.", "this deserves a careful look. Send us the details privately so nothing sensitive sits in the comments."]) : `${address || "Hey — "}I’m sorry you’re dealing with this. Share only what we need to review it — never send passwords, one-time codes, full card details, or ID.`,
  };
  if (words("partner", "partnership", "collab", "collaboration", "press", "sponsor")) return {
    classification: "partnership lead", risk: "review", reply_status: "ready",
    agent_draft: isComment ? choose(["okay, you’ve got our attention 👀 send the idea and the best contact by DM.", "this could be interesting 👀 drop us a DM with the idea and who we should speak to."]) : `${address || "Hey — "}this sounds worth a proper look. Share the idea, your organisation, and the best email for us to follow up on.`,
  };
  if (has("waitlist", "launch", "available", "download", "app", "sign up")) return {
    classification: "product question", risk: "routine", reply_status: "ready",
    agent_draft: isComment ? choose(["we’re rolling it out carefully — no fake launch date over here. What would you want huddle to do first?", "still cooking, and we refuse to invent a launch date 😭 what would you want huddle to help with first?"]) : `${address || "Hey — "}we’re rolling this out carefully, so we don’t want to invent a date. Tell us where you are and what you’d want huddle to help with first.`,
  };
  if (has("missing", "lost", "reward", "last seen")) return {
    classification: "community support", risk: "review", reply_status: "ready",
    agent_draft: isComment ? choose(["really hope they’re home soon. Keeping contact details in DMs is the move.", "hoping they’re back safe soon 🤞 keep the private details out of the comments and in DMs."]) : `${address || "Hey — "}I hope they’re home soon. Send the private details by DM rather than posting contact information publicly.`,
  };
  if (has("ice water", "fresh water", "curtains", "blinds", "tower fan", "garden hose")) return {
    classification: "community care", risk: "routine", reply_status: "ready",
    agent_draft: isComment ? choose(["okay this is actually useful. Saving that for the next heatwave 🫡", "wait, this is a genuinely good shout 👀 adding it to the heatwave brain file."]) : `${address || "Hey — "}that’s a useful practical step. Tell us a little more about what’s working for you.`,
  };
  if (text.length <= 180) return {
    classification: "community comment", risk: "routine", reply_status: "ready",
    agent_draft: isComment ? choose(lower.includes("?") ? ["wait, what happened? 👀", "okay we need the rest of this story 👀", "hold on — tell us more 😭"] : ["honestly 😭 they notice way more than we give them credit for.", "yeah 😭 the animal has already read the room.", "not them understanding the assignment before us.", "exactly. They clock the vibe before anyone says a word."]) : `${address || "Hey — "}tell us a bit more and we’ll point you in the right direction.`,
  };
  return {
    classification: "general message", risk: "routine", reply_status: "ready",
    agent_draft: isComment ? choose(["the internet is very confident for something that depends on the animal in front of you 😭 what happened?", "there’s definitely more to this story 👀 what happened next?", "okay, we need context before the group chat starts guessing 😭"]) : `${address || "Hey — "}tell us a little more and we’ll point you in the right direction.`,
  };
};

const recordConversationSignal = async (platform: "instagram" | "facebook" | "threads", externalEventId: string, payload: Record<string, unknown>) => {
  const triage = classifyConversation(payload.text, payload);
  const kind = String(payload.kind || "comment");
  const incomingPayload = { platform, source: "live_sync", received_at: new Date().toISOString(), ...triage, ...payload };
  const { data: existing, error: existingError } = await supabase.from("huddle_growth_webhook_events").select("payload").eq("provider", "meta").eq("external_event_id", externalEventId).maybeSingle();
  if (existingError) throw existingError;
  const existingPayload = existing?.payload && typeof existing.payload === "object" ? existing.payload as Record<string, unknown> : {};
  const terminalStatus = ["sent", "dismissed"].includes(String(existingPayload.reply_status || ""));
  const preserved = terminalStatus ? {
    reply_status: existingPayload.reply_status,
    final_reply: existingPayload.final_reply || null,
    sent_at: existingPayload.sent_at || null,
    dismissed_at: existingPayload.dismissed_at || null,
    dismissed_by: existingPayload.dismissed_by || null,
  } : {};
  const { error } = await supabase.from("huddle_growth_webhook_events").upsert({
    provider: "meta",
    external_event_id: externalEventId,
    event_type: `${platform}_${kind}`,
    payload: { ...incomingPayload, ...preserved },
  }, { onConflict: "provider,external_event_id" });
  if (error) throw error;
};

const contentTypeFromMedia = (value: unknown): "text" | "image" | "video" | "carousel" | "reel" => {
  const type = String(value || "").toUpperCase();
  if (type.includes("CAROUSEL")) return "carousel";
  if (type.includes("REEL")) return "reel";
  if (type.includes("VIDEO")) return "video";
  return "image";
};

const insightMetrics = (result: Record<string, unknown>) => {
  const metrics: Record<string, unknown> = {};
  for (const row of (Array.isArray(result.data) ? result.data : []) as Array<Record<string, unknown>>) {
    const name = String(row.name || "");
    if (!name) continue;
    const values = Array.isArray(row.values) ? row.values as Array<Record<string, unknown>> : [];
    const totalValue = row.total_value && typeof row.total_value === "object" ? (row.total_value as Record<string, unknown>).value : undefined;
    metrics[name] = totalValue ?? values[0]?.value ?? 0;
  }
  return metrics;
};

const mediaChildren = (value: unknown) => {
  const field = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return (Array.isArray(field.data) ? field.data : []).slice(0, 10).map((child) => {
    const item = child && typeof child === "object" ? child as Record<string, unknown> : {};
    return { id: item.id || null, media_type: item.media_type || null, media_url: item.media_url || null, thumbnail_url: item.thumbnail_url || null };
  });
};

const attachmentPreview = (value: unknown): string | null => {
  const field = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const first = (Array.isArray(field.data) ? field.data[0] : null) as Record<string, unknown> | null;
  const media = first?.media && typeof first.media === "object" ? first.media as Record<string, unknown> : {};
  const image = media.image && typeof media.image === "object" ? media.image as Record<string, unknown> : {};
  return String(image.src || "") || null;
};

const normalizedIdentity = (value: unknown) => String(value || "").trim().toLowerCase().replace(/^@/, "");
const isOwnAuthor = (author: Record<string, unknown>, asset: Record<string, unknown>) => {
  const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {};
  const own = [asset.external_id, asset.name, metadata.username, metadata.page_id].map(normalizedIdentity).filter(Boolean);
  const incoming = [author.id, author.username, author.name].map(normalizedIdentity).filter(Boolean);
  return incoming.some((value) => own.includes(value)) || incoming.includes("huddle.pet") || incoming.includes("huddle");
};

const syncLiveSocial = async () => {
  const { data: assets, error: assetError } = await supabase.from("huddle_growth_assets").select("*").eq("status", "active");
  if (assetError) throw assetError;
  let imported = 0;
  let conversationSignals = 0;
  let performanceSnapshots = 0;
  const notes: string[] = [];
  for (const asset of (assets || []) as Array<Record<string, unknown>>) {
    const type = String(asset.asset_type);
    if (!['instagram_business', 'facebook_page', 'threads_profile', 'ad_account'].includes(type)) continue;
    try {
      const connection = await getConnection(String(asset.connection_id));
      const token = await resolveAssetToken(asset, connection);
      if (type === "instagram_business") {
        const media = await graphRequest(graphJson(`${asset.external_id}/media?${new URLSearchParams({ fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count,children{id,media_type,media_url,thumbnail_url},comments.limit(25){id,text,username,timestamp,like_count,from,replies.limit(25){id,text,username,timestamp,from}}", limit: "25" })}`), { token });
        const items = (Array.isArray(media.data) ? media.data : []) as Array<Record<string, unknown>>;
        const insights = new Map<string, Record<string, unknown>>();
        await Promise.all(items.map(async (item) => {
          const externalId = String(item.id || "");
          if (!externalId) return;
          try {
            const result = await graphRequest(graphJson(`${externalId}/insights?${new URLSearchParams({ metric: "reach,saved,shares,total_interactions,views" })}`), { token });
            insights.set(externalId, insightMetrics(result));
          } catch { insights.set(externalId, {}); }
        }));
        for (const item of items) {
          const externalId = String(item.id || "");
          if (!externalId) continue;
          await recordImportedContent(asset, {
            platform: "instagram", externalId, copy: String(item.caption || ""), publishedAt: String(item.timestamp || "") || null,
            contentType: contentTypeFromMedia(item.media_product_type || item.media_type), metadata: {
              permalink: item.permalink || null, media_type: item.media_type || null, media_product_type: item.media_product_type || null,
              preview_url: item.thumbnail_url || item.media_url || null, thumbnail_url: item.thumbnail_url || null,
              media_url: item.media_url || null, video_url: String(item.media_type || "").toUpperCase().includes("VIDEO") || String(item.media_product_type || "").toUpperCase().includes("REEL") ? item.media_url || null : null,
              children: mediaChildren(item.children),
            },
            performance: { like_count: item.like_count || 0, comments_count: item.comments_count || 0, ...(insights.get(externalId) || {}) },
          });
          imported += 1;
          const commentsField = item.comments as Record<string, unknown> | undefined;
          for (const comment of (Array.isArray(commentsField?.data) ? commentsField.data : []) as Array<Record<string, unknown>>) {
            const commentId = String(comment.id || "");
            if (!commentId) continue;
            const author = comment.from && typeof comment.from === "object" ? comment.from as Record<string, unknown> : { username: comment.username };
            if (isOwnAuthor(author, asset)) continue;
            const repliesField = comment.replies && typeof comment.replies === "object" ? comment.replies as Record<string, unknown> : {};
            const ownReply = ((Array.isArray(repliesField.data) ? repliesField.data : []) as Array<Record<string, unknown>>).find((reply) => {
              const replyAuthor = reply.from && typeof reply.from === "object" ? reply.from as Record<string, unknown> : { username: reply.username };
              return isOwnAuthor(replyAuthor, asset);
            });
            await recordConversationSignal("instagram", `instagram-comment:${commentId}`, {
              kind: "comment", source_type: "comment", parent_id: externalId, parent_permalink: item.permalink || null,
              parent_copy: String(item.caption || ""), parent_content_type: contentTypeFromMedia(item.media_product_type || item.media_type),
              external_message_id: commentId, text: String(comment.text || ""), author_id: author.id || null,
              author_username: author.username || comment.username || null, contact_label: String(comment.username || author.name || "Instagram user"), timestamp: comment.timestamp || null,
              ...(ownReply ? { reply_status: "sent", final_reply: String(ownReply.text || ""), sent_at: ownReply.timestamp || null, reply_source: "meta_existing_reply" } : {}),
            });
            conversationSignals += 1;
          }
        }
        try {
          const conversations = await graphRequest(graphJson(`${asset.external_id}/conversations?${new URLSearchParams({ platform: "instagram", fields: "id,updated_time,participants,messages.limit(25){id,message,created_time,from,to}", limit: "25" })}`), { token });
          for (const conversation of (Array.isArray(conversations.data) ? conversations.data : []) as Array<Record<string, unknown>>) {
            const messages = conversation.messages && typeof conversation.messages === "object" ? conversation.messages as Record<string, unknown> : {};
            for (const message of (Array.isArray(messages.data) ? messages.data : []) as Array<Record<string, unknown>>) {
              const from = message.from && typeof message.from === "object" ? message.from as Record<string, unknown> : {};
              if (String(from.id || "") === String(asset.external_id)) continue;
              const messageId = String(message.id || "");
              if (!messageId) continue;
              const messageText = String(message.message || "").trim();
              if (!messageText) continue;
              await recordConversationSignal("instagram", `instagram-message:${messageId}`, { kind: "message", source_type: "inbox", inbox_label: "Instagram inbox", external_message_id: messageId, sender_id: from.id || null, contact_label: from.name || "Instagram user", text: messageText, timestamp: message.created_time || null, conversation_id: conversation.id || null });
              conversationSignals += 1;
            }
          }
        } catch (inboxError) {
          notes.push(`instagram_inbox:${safeError(inboxError)}`);
        }
      } else if (type === "facebook_page") {
        const feed = await graphRequest(graphJson(`${asset.external_id}/feed?${new URLSearchParams({ fields: "id,message,created_time,permalink_url,full_picture,attachments{media,target,type,url,subattachments},comments.limit(25){id,message,created_time,from,comments.limit(25){id,message,created_time,from}}", limit: "25" })}`), { token });
        const items = (Array.isArray(feed.data) ? feed.data : []) as Array<Record<string, unknown>>;
        const insights = new Map<string, Record<string, unknown>>();
        await Promise.all(items.map(async (item) => {
          const externalId = String(item.id || "");
          if (!externalId) return;
          try {
            const result = await graphRequest(graphJson(`${externalId}/insights?${new URLSearchParams({ metric: "post_clicks,post_reactions_by_type_total,post_video_views,post_media_view,post_activity_by_action_type" })}`), { token });
            insights.set(externalId, insightMetrics(result));
          } catch { insights.set(externalId, {}); }
        }));
        for (const item of items) {
          const externalId = String(item.id || "");
          if (!externalId) continue;
          await recordImportedContent(asset, {
            platform: "facebook", externalId, copy: String(item.message || ""), publishedAt: String(item.created_time || "") || null,
            contentType: item.full_picture || item.attachments ? "image" : "text", metadata: {
              permalink: item.permalink_url || null, preview_url: item.full_picture || attachmentPreview(item.attachments), attachments: item.attachments || null,
            }, performance: insights.get(externalId) || {},
          });
          imported += 1;
          const commentsField = item.comments as Record<string, unknown> | undefined;
          for (const comment of (Array.isArray(commentsField?.data) ? commentsField?.data : []) as Array<Record<string, unknown>>) {
            const commentId = String(comment.id || "");
            if (!commentId) continue;
            const author = comment.from && typeof comment.from === "object" ? comment.from as Record<string, unknown> : {};
            if (isOwnAuthor(author, asset)) continue;
            const repliesField = comment.comments && typeof comment.comments === "object" ? comment.comments as Record<string, unknown> : {};
            const ownReply = ((Array.isArray(repliesField.data) ? repliesField.data : []) as Array<Record<string, unknown>>).find((reply) => {
              const replyAuthor = reply.from && typeof reply.from === "object" ? reply.from as Record<string, unknown> : {};
              return isOwnAuthor(replyAuthor, asset);
            });
            await recordConversationSignal("facebook", `facebook-comment:${commentId}`, {
              kind: "comment", source_type: "comment", parent_id: externalId, parent_permalink: item.permalink_url || null,
              parent_copy: String(item.message || ""), parent_content_type: item.full_picture || item.attachments ? "image" : "text",
              external_message_id: commentId, text: String(comment.message || ""), author_id: author.id || null,
              author_username: author.name || null, contact_label: String(author.name || "Facebook user"), timestamp: comment.created_time || null,
              ...(ownReply ? { reply_status: "sent", final_reply: String(ownReply.message || ""), sent_at: ownReply.created_time || null, reply_source: "meta_existing_reply" } : {}),
            });
            conversationSignals += 1;
          }
        }
        try {
          const conversations = await graphRequest(graphJson(`${asset.external_id}/conversations?${new URLSearchParams({ fields: "id,updated_time,participants,messages.limit(25){id,message,created_time,from,to}", limit: "25" })}`), { token });
          for (const conversation of (Array.isArray(conversations.data) ? conversations.data : []) as Array<Record<string, unknown>>) {
            const messages = conversation.messages && typeof conversation.messages === "object" ? conversation.messages as Record<string, unknown> : {};
            for (const message of (Array.isArray(messages.data) ? messages.data : []) as Array<Record<string, unknown>>) {
              const from = message.from && typeof message.from === "object" ? message.from as Record<string, unknown> : {};
              if (String(from.id || "") === String(asset.external_id)) continue;
              const messageId = String(message.id || "");
              if (!messageId) continue;
              const messageText = String(message.message || "").trim();
              if (!messageText) continue;
              await recordConversationSignal("facebook", `facebook-message:${messageId}`, { kind: "message", source_type: "inbox", inbox_label: "Facebook Messenger", external_message_id: messageId, sender_id: from.id || null, contact_label: from.name || "Messenger user", text: messageText, timestamp: message.created_time || null, conversation_id: conversation.id || null });
              conversationSignals += 1;
            }
          }
        } catch (inboxError) {
          notes.push(`messenger_inbox:${safeError(inboxError)}`);
        }
        if ((Array.isArray(asset.granted_scopes) ? asset.granted_scopes.map(String) : []).includes("leads_retrieval")) {
          const forms = await graphRequest(graphJson(`${asset.external_id}/leadgen_forms?${new URLSearchParams({ fields: "id,name,status", limit: "50" })}`), { token });
          for (const form of (Array.isArray(forms.data) ? forms.data : []) as Array<Record<string, unknown>>) {
            const formId = String(form.id || "");
            if (!formId) continue;
            const leads = await graphRequest(graphJson(`${formId}/leads?${new URLSearchParams({ fields: "id,created_time,field_data", limit: "50" })}`), { token });
            for (const lead of (Array.isArray(leads.data) ? leads.data : []) as Array<Record<string, unknown>>) {
              const leadId = String(lead.id || "");
              if (!leadId) continue;
              const { error } = await supabase.from("huddle_growth_leads").upsert({ asset_id: asset.id, external_lead_id: leadId, source: "meta_lead_ads", status: "new", data: { form_id: formId, form_name: form.name || null, created_time: lead.created_time || null, field_data: lead.field_data || [] }, last_seen_at: new Date().toISOString() }, { onConflict: "source,external_lead_id" });
              if (error) throw error;
            }
          }
        }
      } else if (type === "threads_profile") {
        const threads = await graphRequest(threadsJson(`${asset.external_id}/threads?${new URLSearchParams({ fields: "id,text,permalink,timestamp,media_type,media_url,thumbnail_url,children{id,media_type,media_url,thumbnail_url}", limit: "25" })}`), { token });
        const items = (Array.isArray(threads.data) ? threads.data : []) as Array<Record<string, unknown>>;
        const insights = new Map<string, Record<string, unknown>>();
        await Promise.all(items.map(async (item) => {
          const externalId = String(item.id || "");
          if (!externalId) return;
          try {
            const result = await graphRequest(threadsJson(`${externalId}/insights?${new URLSearchParams({ metric: "views,likes,replies,reposts,quotes,shares" })}`), { token });
            insights.set(externalId, insightMetrics(result));
          } catch { insights.set(externalId, {}); }
        }));
        for (const item of items) {
          const externalId = String(item.id || "");
          if (!externalId) continue;
          await recordImportedContent(asset, {
            platform: "threads", externalId, copy: String(item.text || ""), publishedAt: String(item.timestamp || "") || null,
            contentType: contentTypeFromMedia(item.media_type), metadata: {
              permalink: item.permalink || null, media_type: item.media_type || null,
              preview_url: item.thumbnail_url || item.media_url || null, thumbnail_url: item.thumbnail_url || null,
              media_url: item.media_url || null, video_url: String(item.media_type || "").toUpperCase().includes("VIDEO") ? item.media_url || null : null,
              children: mediaChildren(item.children),
            }, performance: insights.get(externalId) || {},
          });
          imported += 1;
          try {
            const replies = await graphRequest(threadsJson(`${externalId}/replies?${new URLSearchParams({ fields: "id,text,username,timestamp,permalink,from", limit: "25" })}`), { token });
            for (const reply of (Array.isArray(replies.data) ? replies.data : []) as Array<Record<string, unknown>>) {
              const replyId = String(reply.id || "");
              if (!replyId) continue;
              const author = reply.from && typeof reply.from === "object" ? reply.from as Record<string, unknown> : { username: reply.username };
              if (isOwnAuthor(author, asset)) continue;
              await recordConversationSignal("threads", `threads-reply:${replyId}`, {
                kind: "reply", source_type: "reply", parent_id: externalId, parent_permalink: item.permalink || null,
                parent_copy: String(item.text || ""), parent_content_type: contentTypeFromMedia(item.media_type), external_message_id: replyId,
                text: String(reply.text || ""), author_id: author.id || null, author_username: author.username || reply.username || null,
                contact_label: String(reply.username || author.name || "Threads user"), timestamp: reply.timestamp || null,
              });
              conversationSignals += 1;
            }
          } catch (replyError) {
            notes.push(`threads_replies:${safeError(replyError)}`);
          }
        }
      } else if (type === "ad_account") {
        const today = new Date();
        const periodEnd = today.toISOString().slice(0, 10);
        const periodStart = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const insight = await graphRequest(graphJson(`${asset.external_id}/insights?${new URLSearchParams({ fields: "impressions,reach,spend,clicks,ctr,cpm,cpc,actions", date_preset: "last_30d" })}`), { token });
        const metrics = ((Array.isArray(insight.data) ? insight.data[0] : null) || {}) as Record<string, unknown>;
        const { error } = await supabase.from("huddle_growth_performance").upsert({ asset_id: asset.id, platform: "ads", external_id: String(asset.external_id), period_start: periodStart, period_end: periodEnd, metrics, source_updated_at: new Date().toISOString() }, { onConflict: "asset_id,external_id,period_start,period_end" });
        if (error) throw error;
        performanceSnapshots += 1;
      }
      const syncedAt = new Date().toISOString();
      await supabase.from("huddle_growth_assets").update({ status: "active", last_synced_at: syncedAt, updated_at: syncedAt }).eq("id", asset.id);
      await supabase.from("huddle_growth_connections").update({ status: "active", last_synced_at: syncedAt, last_error: null, updated_at: syncedAt }).eq("id", asset.connection_id);
    } catch (error) {
      const message = safeError(error);
      notes.push(`${type}:${message}`);
      await supabase.from("huddle_growth_assets").update({ status: "error", updated_at: new Date().toISOString() }).eq("id", asset.id);
      await supabase.from("huddle_growth_connections").update({ status: "degraded", last_error: message, updated_at: new Date().toISOString() }).eq("id", asset.connection_id);
    }
  }
  await supabase.from("huddle_growth_audit_logs").insert({ action: "live_social_synced", platform: "system", details: { imported, conversation_signals: conversationSignals, performance_snapshots: performanceSnapshots, notes } });
  return { imported, conversation_signals: conversationSignals, performance_snapshots: performanceSnapshots, notes };
};

const executeAction = async (action: Record<string, unknown>) => {
  const payload = (action.payload && typeof action.payload === "object") ? action.payload as Record<string, unknown> : {};
  const assetId = String(action.asset_id || payload.asset_id || "");
  const asset = assetId ? await getAsset(assetId) : null;
  const connection = asset ? await getConnection(String(asset.connection_id)) : null;
  const granted = (asset?.granted_scopes || connection?.granted_scopes || []) as string[];
  const actionType = String(action.action_type);
  if (actionType === "publish_text" || actionType === "publish_content") {
    if (!asset || !connection) throw new Error("asset_required");
    const token = await resolveAssetToken(asset, connection);
    const platform = String(asset.asset_type);
    const text = String(payload.text || payload.caption || "").trim();
    if (!text) throw new Error("content_text_required");
    if (platform === "threads_profile") {
      const missing = missingScopes(granted, ["threads_content_publish"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
      const created = await graphRequest(threadsJson(`${asset.external_id}/threads`), { method: "POST", token, form: new URLSearchParams({ media_type: "TEXT", text }) });
      const published = await graphRequest(threadsJson(`${asset.external_id}/threads_publish`), { method: "POST", token, form: new URLSearchParams({ creation_id: String(created.id || "") }) });
      return { external_id: String(published.id || ""), platform: "threads" };
    }
    if (platform === "instagram_business") {
      const missing = missingScopes(granted, ["instagram_content_publish"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
      const mediaUrls = (Array.isArray(payload.media_urls) ? payload.media_urls : [payload.image_url]).map(String).map((url) => url.trim()).filter(Boolean);
      if (!mediaUrls.length) throw new Error("instagram_public_image_url_required");
      let created: Record<string, unknown>;
      if (mediaUrls.length > 1) {
        const children: string[] = [];
        for (const imageUrl of mediaUrls.slice(0, 10)) {
          const child = await graphRequest(graphJson(`${asset.external_id}/media`), { method: "POST", token, form: new URLSearchParams({ image_url: imageUrl, is_carousel_item: "true" }) });
          if (!child.id) throw new Error("instagram_carousel_child_failed");
          children.push(String(child.id));
        }
        created = await graphRequest(graphJson(`${asset.external_id}/media`), { method: "POST", token, form: new URLSearchParams({ media_type: "CAROUSEL", children: children.join(","), caption: text }) });
      } else {
        created = await graphRequest(graphJson(`${asset.external_id}/media`), { method: "POST", token, form: new URLSearchParams({ image_url: mediaUrls[0], caption: text }) });
      }
      const published = await graphRequest(graphJson(`${asset.external_id}/media_publish`), { method: "POST", token, form: new URLSearchParams({ creation_id: String(created.id || "") }) });
      return { external_id: String(published.id || ""), platform: "instagram" };
    }
    if (platform === "facebook_page") {
      const missing = missingScopes(granted, ["pages_manage_posts"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
      const imageUrl = String(payload.image_url || "").trim();
      const published = imageUrl
        ? await graphRequest(graphJson(`${asset.external_id}/photos`), { method: "POST", token, form: new URLSearchParams({ url: imageUrl, caption: text }) })
        : await graphRequest(graphJson(`${asset.external_id}/feed`), { method: "POST", token, form: new URLSearchParams({ message: text, ...(payload.link ? { link: String(payload.link) } : {}) }) });
      return { external_id: String(published.id || ""), platform: "facebook" };
    }
    throw new Error(`unsupported_publish_asset:${platform}`);
  }
  if (actionType === "send_whatsapp_text") {
    if (!asset || !connection || asset.asset_type !== "whatsapp_phone") throw new Error("whatsapp_phone_required");
    const missing = missingScopes(granted, ["whatsapp_business_messaging"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
    const token = await resolveAssetToken(asset, connection);
    const result = await graphRequest(graphJson(`${asset.external_id}/messages`), { method: "POST", token, body: { messaging_product: "whatsapp", to: String(payload.to || ""), type: "text", text: { preview_url: false, body: String(payload.text || "") } } });
    return { messages: result.messages || [], platform: "whatsapp" };
  }
  if (actionType === "send_reply") {
    if (!asset || !connection) throw new Error("asset_required");
    const token = await resolveAssetToken(asset, connection);
    const message = String(payload.message || payload.text || "").trim();
    const targetId = String(payload.target_id || payload.comment_id || payload.recipient_id || "").trim();
    if (!message || !targetId) throw new Error("reply_target_and_message_required");
    if (asset.asset_type === "facebook_page") {
      if (payload.recipient_id) {
        const missing = missingScopes(granted, ["pages_messaging"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
        const result = await graphRequest(graphJson("me/messages"), { method: "POST", token, body: { recipient: { id: targetId }, message: { text: message }, messaging_type: "RESPONSE" } });
        return { platform: "messenger", result };
      }
      const missing = missingScopes(granted, ["pages_manage_engagement"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
      const result = await graphRequest(graphJson(`${targetId}/comments`), { method: "POST", token, form: new URLSearchParams({ message }) });
      return { platform: "facebook", result };
    }
    if (asset.asset_type === "instagram_business") {
      const missing = missingScopes(granted, ["instagram_manage_comments"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
      const result = await graphRequest(graphJson(`${targetId}/replies`), { method: "POST", token, form: new URLSearchParams({ message }) });
      return { platform: "instagram", result };
    }
    if (asset.asset_type === "threads_profile") {
      const missing = missingScopes(granted, ["threads_manage_replies"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
      const created = await graphRequest(threadsJson(`${asset.external_id}/threads`), { method: "POST", token, form: new URLSearchParams({ media_type: "TEXT", text: message, reply_to_id: targetId }) });
      const result = await graphRequest(threadsJson(`${asset.external_id}/threads_publish`), { method: "POST", token, form: new URLSearchParams({ creation_id: String(created.id || "") }) });
      return { platform: "threads", result };
    }
    throw new Error(`unsupported_reply_asset:${asset.asset_type}`);
  }
  if (actionType === "pause_ad") {
    if (!asset || !connection || asset.asset_type !== "ad_account") throw new Error("ad_asset_required");
    const missing = missingScopes(granted, ["ads_management"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
    const token = await resolveAssetToken(asset, connection);
    await graphRequest(graphJson(String(payload.ad_id || "")), { method: "POST", token, form: new URLSearchParams({ status: "PAUSED" }) });
    return { status: "PAUSED", ad_id: String(payload.ad_id || "") };
  }
  if (actionType === "create_campaign") {
    if (!asset || !connection || asset.asset_type !== "ad_account") throw new Error("ad_asset_required");
    const missing = missingScopes(granted, ["ads_management"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
    const token = await resolveAssetToken(asset, connection);
    const name = String(payload.name || "").trim();
    const objective = String(payload.objective || "").trim();
    if (!name || !objective) throw new Error("campaign_name_and_objective_required");
    const result = await graphRequest(graphJson(`${asset.external_id}/campaigns`), { method: "POST", token, form: new URLSearchParams({ name, objective, status: "PAUSED", special_ad_categories: "[]" }) });
    return { campaign_id: String(result.id || ""), status: "PAUSED" };
  }
  if (actionType === "get_insights") {
    if (!asset || !connection) throw new Error("asset_required");
    const missing = missingScopes(granted, ["ads_read"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
    const token = await resolveAssetToken(asset, connection);
    const result = await graphRequest(graphJson(`${String(payload.external_id || asset.external_id)}/insights?${new URLSearchParams({ fields: String(payload.fields || "impressions,reach,spend,clicks,ctr,cpm,cpc"), date_preset: String(payload.date_preset || "last_7d") })}`), { token });
    return { data: result.data || [], platform: asset.asset_type };
  }
  if (actionType === "fetch_leads") {
    if (!asset || !connection) throw new Error("asset_required");
    const missing = missingScopes(granted, ["leads_retrieval"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
    const token = await resolveAssetToken(asset, connection);
    const result = await graphRequest(graphJson(`${String(payload.form_id || "")}/leads?fields=id,created_time,field_data`), { token });
    return { data: result.data || [], platform: "lead_ads" };
  }
  throw new Error(`unsupported_action:${actionType}`);
};

const handleOAuthCallback = async (url: URL) => {
  const state = url.searchParams.get("state") || "";
  const code = url.searchParams.get("code") || "";
  if (!state || !code) return html("OAuth callback is missing required parameters.", 400);
  const stateHash = await sha256(state);
  const { data: oauthState, error: stateError } = await supabase.from("huddle_growth_oauth_states").select("*").eq("state_hash", stateHash).maybeSingle();
  if (stateError || !oauthState || oauthState.consumed_at || new Date(String(oauthState.expires_at)).getTime() < Date.now()) return html("OAuth state expired. Start the connection again.", 400);
  const provider = String(oauthState.provider) as "meta" | "threads";
  await supabase.from("huddle_growth_oauth_states").update({ consumed_at: new Date().toISOString() }).eq("id", oauthState.id);
  try {
    const redirectUri = String(oauthState.redirect_uri);
    if (provider === "meta") {
      const exchanged = await exchangeMetaCode(code, redirectUri);
      const me = await graphRequest(graphJson("me?fields=id,name"), { token: exchanged.token });
      const scopes = await listMetaScopes(exchanged.token);
      const connection = await storeConnection({ provider, externalUserId: String(me.id || ""), displayName: String(me.name || me.id || "Meta business user"), token: exchanged.token, expiresAt: exchanged.expiresIn ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString() : null, scopes, metadata: { app_id: META_APP_ID, requested_scopes: META_SCOPES }, createdBy: String(oauthState.created_by) });
      try {
        await discoverMetaAssets(connection, exchanged.token);
      } catch (discoveryError) {
        const discoveryMessage = safeError(discoveryError);
        await supabase.from("huddle_growth_connections").update({ last_error: `asset_discovery_partial:${discoveryMessage}`, updated_at: new Date().toISOString() }).eq("id", connection.id);
        await supabase.from("huddle_growth_audit_logs").insert({ actor_id: String(oauthState.created_by), connection_id: connection.id, action: "asset_discovery_partial", platform: provider, details: { error: discoveryMessage } });
      }
      await enforceHuddleOwnedAssets();
      await supabase.from("huddle_growth_connections").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("provider", provider).neq("id", connection.id);
    } else {
      const exchanged = await exchangeThreadsCode(code, redirectUri);
      const me = await graphRequest(threadsJson("me?fields=id,username,name"), { token: exchanged.token });
      const scopes = THREADS_SCOPES;
      const connection = await storeConnection({ provider, externalUserId: String(me.id || exchanged.userId || ""), displayName: String(me.username || me.name || exchanged.userId), token: exchanged.token, expiresAt: exchanged.expiresIn ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString() : null, scopes, metadata: { app_id: THREADS_APP_ID, requested_scopes: THREADS_SCOPES }, createdBy: String(oauthState.created_by) });
      await discoverThreadsAsset(connection, exchanged.token);
      await supabase.from("huddle_growth_connections").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("provider", provider).neq("id", connection.id);
    }
    await supabase.from("huddle_growth_audit_logs").insert({
      actor_id: String(oauthState.created_by),
      action: "oauth_connection_succeeded",
      platform: provider,
      details: { scopes: provider === "threads" ? THREADS_SCOPES : META_SCOPES },
    });
    return html("Huddle business account connected. You can close this window.");
  } catch (error) {
    const message = safeError(error);
    console.error("[huddle-growth oauth]", message);
    await supabase.from("huddle_growth_audit_logs").insert({
      actor_id: String(oauthState.created_by),
      action: "oauth_connection_failed",
      platform: provider,
      details: { error: message },
    });
    return html("Meta connection failed. Check the admin log and granted permissions.", 500);
  }
};

const startOAuth = async (req: Request, provider: "meta" | "threads", adminId: string) => {
  const baseRedirectUri = configuredRedirect(provider);
  const redirectUri = new URL(baseRedirectUri);
  const state = randomToken(32);
  const stateHash = await sha256(state);
  const { error } = await supabase.from("huddle_growth_oauth_states").insert({ state_hash: stateHash, provider, created_by: adminId, redirect_uri: redirectUri.toString(), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString() });
  if (error) throw new Error(`oauth_state_store_failed:${error.message}`);
  const params = new URLSearchParams({ client_id: provider === "threads" ? THREADS_APP_ID : META_APP_ID, redirect_uri: redirectUri.toString(), response_type: "code", state });
  if (provider === "threads") {
    params.set("scope", THREADS_SCOPES.join(","));
    return { provider, authorization_url: `https://threads.net/oauth/authorize?${params}` };
  }
  params.set("scope", META_SCOPES.join(","));
  return { provider, authorization_url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}` };
};

const getConsole = async () => {
  await enforceHuddleOwnedAssets();
  const [connections, assets, content, events, performance, leads, actions, approvals, policy, audit] = await Promise.all([
    supabase.from("huddle_growth_connections").select("id,provider,external_user_id,display_name,status,token_expires_at,granted_scopes,metadata,last_synced_at,last_error,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("huddle_growth_assets").select("id,connection_id,asset_type,external_id,name,status,token_expires_at,granted_scopes,metadata,last_synced_at,updated_at").order("updated_at", { ascending: false }),
    supabase.from("huddle_growth_content").select("id,platform,asset_id,campaign_name,objective,content_type,body,status,scheduled_at,published_at,external_id,performance,created_at,updated_at").order("updated_at", { ascending: false }).limit(100),
    supabase.from("huddle_growth_webhook_events").select("id,provider,external_event_id,event_type,payload,processed_at,error,created_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("huddle_growth_performance").select("id,asset_id,platform,external_id,period_start,period_end,metrics,source_updated_at,created_at").order("period_end", { ascending: false }).limit(50),
    supabase.from("huddle_growth_leads").select("id,asset_id,source,status,tags,first_seen_at,last_seen_at").order("last_seen_at", { ascending: false }).limit(100),
    supabase.from("huddle_growth_actions").select("id,action_type,platform,asset_id,content_id,payload,risk_level,status,idempotency_key,attempts,max_attempts,next_retry_at,requested_by,approved_by,started_at,completed_at,last_error,result,created_at,updated_at").in("status", ["queued", "awaiting_approval", "running", "failed"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("huddle_growth_approvals").select("id,action_id,status,note,requested_by,decided_by,decided_at,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(100),
    supabase.from("huddle_growth_budget_policies").select("emergency_stop,daily_spend_cap_minor,monthly_spend_cap_minor,max_auto_budget_increase_percent,auto_pause_enabled,auto_pause_ctr_threshold,auto_pause_cpl_threshold_minor,allowed_actions,updated_at").eq("id", true).maybeSingle(),
    supabase.from("huddle_growth_audit_logs").select("id,actor_id,action_id,connection_id,action,platform,details,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  for (const result of [connections, assets, content, events, performance, leads, actions, approvals, policy, audit]) if (result.error) throw result.error;
  return { connections: connections.data || [], assets: assets.data || [], content: content.data || [], events: events.data || [], performance: performance.data || [], leads: leads.data || [], actions: actions.data || [], approvals: approvals.data || [], policy: policy.data || {}, audit: audit.data || [] };
};

const queueAction = async (adminId: string, body: Record<string, unknown>) => {
  const actionType = String(body.action_type || "").trim();
  const requestedRisk = String(body.risk_level || "routine");
  const riskLevel = ["create_campaign", "update_budget", "delete_content", "launch_campaign"].includes(actionType) ? "high" : requestedRisk;
  if (!actionType) throw new Error("action_type_required");
  if (!["routine", "bounded_optimisation", "high"].includes(riskLevel)) throw new Error("invalid_risk_level");
  const { data: policy, error: policyError } = await supabase.from("huddle_growth_budget_policies").select("emergency_stop,allowed_actions").eq("id", true).maybeSingle();
  if (policyError) throw policyError;
  const allowed = Array.isArray(policy?.allowed_actions) ? policy.allowed_actions.map(String) : [];
  if (policy?.emergency_stop) throw new Error("emergency_stop_enabled");
  if (riskLevel !== "high" && !allowed.includes(actionType) && !(actionType === "publish_text" && allowed.includes("schedule"))) throw new Error("action_not_allowed_by_policy");
  const idempotencyKey = String(body.idempotency_key || `${actionType}-${crypto.randomUUID()}`);
  const { data, error } = await supabase.from("huddle_growth_actions").upsert({ action_type: actionType, platform: String(body.platform || "system"), asset_id: body.asset_id ? String(body.asset_id) : null, content_id: body.content_id ? String(body.content_id) : null, payload: body.payload || {}, risk_level: riskLevel, status: riskLevel === "high" ? "awaiting_approval" : "queued", idempotency_key: idempotencyKey, requested_by: adminId, updated_at: new Date().toISOString() }, { onConflict: "idempotency_key" }).select("id,status").single();
  if (error || !data) throw error || new Error("action_queue_failed");
  if (riskLevel === "high") await supabase.from("huddle_growth_approvals").upsert({ action_id: data.id, requested_by: adminId }, { onConflict: "action_id" });
  await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, action_id: data.id, action: "action_queued", platform: String(body.platform || "system"), details: { risk_level: riskLevel, idempotency_key: idempotencyKey } });
  return data;
};

const decideAction = async (adminId: string, body: Record<string, unknown>) => {
  const actionId = String(body.action_id || "");
  const approved = body.approved === true;
  if (!actionId) throw new Error("action_required");
  const { data: approval, error: approvalError } = await supabase.from("huddle_growth_approvals").update({ status: approved ? "approved" : "rejected", note: body.note ? String(body.note) : null, decided_by: adminId, decided_at: new Date().toISOString() }).eq("action_id", actionId).eq("status", "pending").select("id").maybeSingle();
  if (approvalError || !approval) throw approvalError || new Error("approval_not_pending");
  const nextStatus = approved ? "queued" : "cancelled";
  const { error } = await supabase.from("huddle_growth_actions").update({ status: nextStatus, approved_by: approved ? adminId : null, updated_at: new Date().toISOString() }).eq("id", actionId).eq("status", "awaiting_approval");
  if (error) throw error;
  await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, action_id: actionId, action: approved ? "action_approved" : "action_rejected", details: { note: body.note || null } });
  return { action_id: actionId, status: nextStatus };
};

const updatePolicy = async (adminId: string, body: Record<string, unknown>) => {
  const patch: Record<string, unknown> = { updated_by: adminId, updated_at: new Date().toISOString() };
  if (typeof body.emergency_stop === "boolean") patch.emergency_stop = body.emergency_stop;
  const { data, error } = await supabase.from("huddle_growth_budget_policies").update(patch).eq("id", true).select("emergency_stop,daily_spend_cap_minor,monthly_spend_cap_minor,max_auto_budget_increase_percent,auto_pause_enabled,auto_pause_ctr_threshold,auto_pause_cpl_threshold_minor,allowed_actions").single();
  if (error || !data) throw error || new Error("policy_update_failed");
  await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, action: "policy_updated", details: { emergency_stop: data.emergency_stop } });
  return data;
};

const generateContent = async (body: Record<string, unknown>) => {
  const apiKey = String(Deno.env.get("OPENAI_API_KEY") || "").trim();
  const geminiKey = String(Deno.env.get("GEMINI_API_KEY") || "").trim();
  if (!apiKey && !geminiKey) throw new Error("ai_provider_key_missing");
  const model = String(Deno.env.get("OPENAI_GROWTH_MODEL") || "gpt-5.2").trim();
  const platform = String(body.platform || "Threads");
  const objective = String(body.objective || "useful local pet-safety awareness");
  const brief = String(body.brief || "").trim();
  const system = `You are huddle’s official social media manager. You are not making pet content. You are building huddle’s philosophy: animals are lives, not property; caring should not be a niche; small actions matter; communities protect better than individuals; huddle makes caring easier, never replaces rescuers; the world changes when caring becomes ordinary.

Write like a Gen Z friend sharing a real 2am thought: blunt, kind, curious, vulnerable and direct. It should make someone save it, share it, or quietly think about it later. Never preach, motivate, sound like AI, explain too much, use poetry filler, generic pet puns, corporate language, guilt, panic, rescue-saviour language, clickbait, listicles, repetitive sentence structure, or empty engagement bait. Do not give veterinary, legal, financial, or crisis advice. Never invent Huddle traction, users, partnerships, funding, product capability, locations, market availability, outcomes, or claims. Do not volunteer where huddle is from, headquartered, founded, incorporated, or where its team lives. Only if directly asked, the approved answer is: “huddle is operating across the UK and Asia first.” Do not name a city, country, launch date, or availability unless it is confirmed.

Return valid JSON only, with exactly these keys: post_type, hooks, topic_direction, cover_copy, image_copy, caption. hooks must contain 10-20 distinct curiosity hooks. post_type must be one of Carousel, Reel, Single image, Threads, Story, Short video. topic_direction explains what we are really talking about, why it matters, and the perspective shift. cover_copy is one short sentence. image_copy is one thought per slide; every line introduces a new thought. caption expands the thought without repeating slides. Hooks are curiosity, not clickbait.`;
  const input = `Platform: ${platform}\nObjective: ${objective}\nBrief: ${brief || "Create one strong launch-ready idea for Huddle."}`;
  const geminiModel = String(Deno.env.get("GEMINI_GROWTH_MODEL") || "gemini-2.5-flash").trim();
  const response = apiKey
    ? await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, store: false, input: [{ role: "developer", content: [{ type: "input_text", text: system }] }, { role: "user", content: [{ type: "input_text", text: input }] }] }) })
    : await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiKey}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: `${system}\n\n${input}` }] }], generationConfig: { responseMimeType: "application/json", temperature: 0.8 } }) });
  const raw = await response.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { parsed = {}; }
  if (!response.ok) {
    const providerError = parsed.error && typeof parsed.error === "object" ? String((parsed.error as Record<string, unknown>).message || "") : "";
    throw new Error(`ai_request_failed:${response.status}${providerError ? `:${providerError.slice(0, 240)}` : ""}`);
  }
  const geminiText = Array.isArray(parsed.candidates) ? ((parsed.candidates[0] as Record<string, unknown>)?.content as Record<string, unknown>)?.parts : [];
  const outputText = String(parsed.output_text || ((Array.isArray(parsed.output) ? parsed.output : []).flatMap((item) => (item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as Array<Record<string, unknown>> : [])).map((item) => String(item.text || "")).filter(Boolean).join("\n")) || (Array.isArray(geminiText) ? (geminiText as Array<Record<string, unknown>>).map((item) => String(item.text || "")).join("\n") : "") || "").trim();
  if (!outputText) throw new Error("ai_empty_response");
  let plan: Record<string, unknown>;
  try { plan = JSON.parse(outputText) as Record<string, unknown>; } catch { throw new Error("ai_invalid_content_plan"); }
  const hooks = Array.isArray(plan.hooks) ? plan.hooks.map(String).filter(Boolean).slice(0, 20) : [];
  const imageCopy = Array.isArray(plan.image_copy) ? plan.image_copy.map(String).filter(Boolean).slice(0, 12) : [];
  const caption = String(plan.caption || "").trim();
  if (!caption || hooks.length < 10 || !String(plan.topic_direction || "").trim() || !String(plan.cover_copy || "").trim()) throw new Error("ai_incomplete_content_plan");
  return { copy: caption, model: apiKey ? model : geminiModel, plan: { post_type: String(plan.post_type || "Carousel"), hooks, topic_direction: String(plan.topic_direction), cover_copy: String(plan.cover_copy), image_copy: imageCopy, caption } };
};

const fallbackPhilosophyPlan = (platform: string) => {
  const hooks = [
    "An animal can be loved and still be treated like an accessory.",
    "We say “my dog” like the whole day belongs to us.",
    "Maybe care starts before something is wrong.",
    "It’s strange how quickly a life becomes “just a pet.”",
    "Animals don’t need a perfect person. They need someone who notices.",
    "Love gets practical faster than people think.",
    "A pet isn’t low maintenance. They’re trusting you quietly.",
    "The bare minimum can still feel like love to someone dependent on you.",
    "Maybe being responsible is just refusing to look away.",
    "They don’t ask for much. That is not the same as needing little.",
    "A lot of care is boring. That’s why it matters.",
    "The world gets softer when care stops being a personality trait.",
  ];
  const plan = platform === "threads"
    ? {
      post_type: "Threads", hooks,
      topic_direction: "We are talking about the quiet imbalance in a human–animal relationship: they depend on us without being able to negotiate the terms. The perspective shift is from feeling affectionate to being attentive.",
      cover_copy: "They don’t ask for much. That’s not the same as needing little.",
      image_copy: [],
      caption: "I keep thinking about how easy it is to call an animal “low maintenance” when they can’t really tell us when something feels off.\n\nThey just adjust around us.\n\nMaybe care is noticing before they have to make it obvious.",
    }
    : {
      post_type: platform === "facebook" ? "Single image" : "Carousel", hooks,
      topic_direction: "We are talking about how affection can make us feel like we are already doing enough. It matters because animals live inside the systems we create for them. The perspective shift is from “I love them” to “does their life actually feel considered?”",
      cover_copy: "They don’t ask for much. That’s not the same as needing little.",
      image_copy: [
        "They live in our homes.",
        "But they also live around our moods, plans and blind spots.",
        "Most of the time, they just adapt.",
        "That can look a lot like being easy.",
        "It isn’t.",
        "They’re trusting us to notice the things they can’t explain.",
        "Maybe that’s what care is.",
      ],
      caption: "We talk about loving animals like it’s a feeling.\n\nBut a lot of love is checking the small stuff before it becomes a big thing.\n\nNot because you’re trying to be perfect.\n\nBecause someone’s whole little world is built around the choices you barely think about.",
    };
  return { copy: plan.caption, model: "huddle_curated_starter", plan };
};

const createContentPack = async (adminId: string | null, body: Record<string, unknown>) => {
  const objective = String(body.objective || "Build useful local awareness").trim().slice(0, 140);
  const direction = String(body.direction || "").trim().slice(0, 1200);
  const assetMap: Record<string, string> = {
    instagram: "instagram_business",
    threads: "threads_profile",
    facebook: "facebook_page",
  };
  const requested = Array.isArray(body.platforms) ? body.platforms.map(String) : ["instagram", "threads", "facebook"];
  const platforms = requested.filter((platform) => Object.prototype.hasOwnProperty.call(assetMap, platform));
  if (!platforms.length) throw new Error("content_platform_required");
  const { data: assets, error: assetError } = await supabase.from("huddle_growth_assets").select("id,asset_type,name,status").eq("status", "active");
  if (assetError) throw assetError;
  const { data: recent, error: recentError } = await supabase.from("huddle_growth_content").select("platform,body,published_at").eq("status", "published").order("published_at", { ascending: false }).limit(12);
  if (recentError) throw recentError;
  const recentContext = (recent || []).map((row) => {
    const content = row.body && typeof row.body === "object" ? row.body as Record<string, unknown> : {};
    return `${row.platform}: ${String(content.copy || "").slice(0, 280)}`;
  }).filter(Boolean).join("\n");
  const campaignName = `content-pack:${crypto.randomUUID()}`;
  const drafts: Record<string, unknown>[] = [];
  for (const platform of platforms) {
    const asset = (assets || []).find((item) => item.asset_type === assetMap[platform]);
    if (!asset) continue;
    let generated: Awaited<ReturnType<typeof generateContent>> | ReturnType<typeof fallbackPhilosophyPlan>;
    try {
      generated = await generateContent({
        platform: platform === "instagram" ? "Instagram" : platform === "threads" ? "Threads" : "Facebook Page",
        objective,
        brief: `${direction || "Choose the strongest current Huddle story."}\nCreate a platform-native, philosophy-led content plan ready for the founder’s final edit.\nRecent account context (do not repeat it):\n${recentContext || "No prior posts are available yet."}`,
      });
    } catch (error) {
      generated = fallbackPhilosophyPlan(platform);
      generated = { ...generated, model: `${generated.model}:${safeError(error).slice(0, 80)}` };
    }
    const postType = String(generated.plan.post_type || "").toLowerCase();
    const contentType = postType.includes("carousel") ? "carousel" : postType.includes("reel") ? "reel" : postType.includes("video") ? "video" : postType.includes("image") ? "image" : "text";
    const draftBody = {
      copy: generated.copy,
      plan: generated.plan,
      direction: direction || null,
      visual_brief: platform === "instagram" ? "Build the carousel from the approved cover and slide copy. It should feel candid, real, and human; never stock, generic pet-tip content, or an unverified product claim." : null,
      generated_by: "huddle_growth_agent",
      model: generated.model,
    };
    const { data, error } = await supabase.from("huddle_growth_content").insert({
      platform,
      asset_id: asset.id,
      campaign_name: campaignName,
      objective,
      content_type: contentType,
      body: draftBody,
      status: "draft",
      created_by: adminId,
    }).select("id,platform,asset_id,objective,content_type,body,status,created_at").single();
    if (error || !data) throw error || new Error("content_draft_store_failed");
    drafts.push(data as Record<string, unknown>);
  }
  if (!drafts.length) throw new Error("no_requested_content_assets_connected");
  await supabase.from("huddle_growth_audit_logs").insert({
    actor_id: adminId,
    action: "content_pack_prepared",
    platform: "system",
    details: { platforms: drafts.map((draft) => draft.platform), objective, campaign_name: campaignName },
  });
  return { drafts };
};

const storeAgentContentPack = async (body: Record<string, unknown>) => {
  const objective = String(body.objective || "Build Huddle’s philosophy").trim().slice(0, 140);
  const variants = body.variants && typeof body.variants === "object" ? body.variants as Record<string, unknown> : {};
  const assetTypes: Record<string, string> = { instagram: "instagram_business", threads: "threads_profile", facebook: "facebook_page" };
  const { data: assets, error: assetError } = await supabase.from("huddle_growth_assets").select("id,asset_type").eq("status", "active");
  if (assetError) throw assetError;
  const campaignName = `codex-content-pack:${crypto.randomUUID()}`;
  const drafts: Record<string, unknown>[] = [];
  for (const platform of ["instagram", "threads", "facebook"]) {
    const plan = variants[platform] && typeof variants[platform] === "object" ? variants[platform] as Record<string, unknown> : null;
    if (!plan) continue;
    const caption = String(plan.caption || "").trim();
    const cover = String(plan.cover_copy || "").trim();
    const hooks = Array.isArray(plan.hooks) ? plan.hooks.map(String).map((item) => item.trim()).filter(Boolean).slice(0, 20) : [];
    if (!caption || !cover || hooks.length < 10) throw new Error(`invalid_agent_content_plan:${platform}`);
    const asset = (assets || []).find((item) => item.asset_type === assetTypes[platform]);
    if (!asset) continue;
    const postType = String(plan.post_type || (platform === "threads" ? "Threads" : "Carousel")).toLowerCase();
    const contentType = postType.includes("carousel") ? "carousel" : postType.includes("reel") ? "reel" : postType.includes("video") ? "video" : postType.includes("image") ? "image" : "text";
    const normalizedPlan = { post_type: plan.post_type || (platform === "threads" ? "Threads" : "Carousel"), hooks, topic_direction: String(plan.topic_direction || ""), cover_copy: cover, image_copy: Array.isArray(plan.image_copy) ? plan.image_copy.map(String).filter(Boolean).slice(0, 12) : [], caption };
    const { data, error } = await supabase.from("huddle_growth_content").insert({ platform, asset_id: asset.id, campaign_name: campaignName, objective, content_type: contentType, body: { copy: caption, plan: normalizedPlan, generated_by: "codex_growth_manager", model: "codex" }, status: "draft" }).select("id,platform,content_type,status").single();
    if (error || !data) throw error || new Error("agent_content_store_failed");
    drafts.push(data as Record<string, unknown>);
  }
  if (!drafts.length) throw new Error("agent_content_variants_required");
  await supabase.from("huddle_growth_audit_logs").insert({ action: "codex_content_pack_prepared", platform: "system", details: { campaign_name: campaignName, objective, platforms: drafts.map((item) => item.platform) } });
  return { campaign_name: campaignName, drafts };
};

const publishContentDraft = async (adminId: string, body: Record<string, unknown>) => {
  const { data: policy, error: policyError } = await supabase
    .from("huddle_growth_budget_policies")
    .select("emergency_stop")
    .eq("id", true)
    .maybeSingle();
  if (policyError) throw policyError;
  if (policy?.emergency_stop) throw new Error("emergency_stop_enabled");
  const contentId = String(body.content_id || "").trim();
  if (!contentId) throw new Error("content_required");
  const { data: content, error: contentError } = await supabase.from("huddle_growth_content").select("*").eq("id", contentId).maybeSingle();
  if (contentError || !content) throw contentError || new Error("content_not_found");
  if (!["draft", "awaiting_approval", "failed"].includes(String(content.status))) throw new Error("content_not_ready_for_approval");
  const currentBody = content.body && typeof content.body === "object" ? content.body as Record<string, unknown> : {};
  const copy = String(body.copy || currentBody.copy || "").trim();
  const mediaUrls = (Array.isArray(body.media_urls) ? body.media_urls : String(body.image_url || currentBody.image_url || "").split(/\r?\n/)).map(String).map((url) => url.trim()).filter(Boolean);
  const imageUrl = mediaUrls[0] || "";
  if (!copy) throw new Error("content_text_required");
  if (content.platform === "instagram" && !imageUrl) throw new Error("instagram_public_image_url_required");
  if (content.platform === "instagram" && content.content_type === "carousel" && mediaUrls.length < 2) throw new Error("instagram_carousel_requires_two_images");
  const nextBody = { ...currentBody, copy, ...(imageUrl ? { image_url: imageUrl, media_urls: mediaUrls } : {}) };
  await supabase.from("huddle_growth_content").update({ body: nextBody, status: "publishing", approved_by: adminId, updated_at: new Date().toISOString() }).eq("id", contentId);
  try {
    const result = await executeAction({
      action_type: "publish_text",
      platform: content.platform,
      asset_id: content.asset_id,
      payload: { text: copy, ...(imageUrl ? { image_url: imageUrl, media_urls: mediaUrls } : {}) },
    });
    await supabase.from("huddle_growth_content").update({
      body: nextBody,
      status: "published",
      approved_by: adminId,
      published_at: new Date().toISOString(),
      external_id: String(result.external_id || "") || null,
      updated_at: new Date().toISOString(),
    }).eq("id", contentId);
    await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, action: "content_approved_and_published", platform: String(content.platform), details: { content_id: contentId, external_id: result.external_id || null } });
    return { content_id: contentId, status: "published", result };
  } catch (error) {
    const message = safeError(error);
    await supabase.from("huddle_growth_content").update({ body: nextBody, status: "failed", updated_at: new Date().toISOString() }).eq("id", contentId);
    await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, action: "content_publish_failed", platform: String(content.platform), details: { content_id: contentId, error: message } });
    throw error;
  }
};

const getConversationEvent = async (eventId: string) => {
  const { data, error } = await supabase.from("huddle_growth_webhook_events").select("*").eq("id", eventId).maybeSingle();
  if (error || !data) throw error || new Error("conversation_not_found");
  return data as Record<string, unknown>;
};

const prepareConversationReply = async (adminId: string, body: Record<string, unknown>) => {
  const eventId = String(body.event_id || "").trim();
  const event = await getConversationEvent(eventId);
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
  const triage = classifyConversation(payload.text || payload.message, payload);
  const nextPayload = { ...payload, ...triage, prepared_at: new Date().toISOString() };
  const { error } = await supabase.from("huddle_growth_webhook_events").update({ payload: nextPayload }).eq("id", eventId);
  if (error) throw error;
  await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, action: "conversation_reply_prepared", platform: String(payload.platform || "unknown"), details: { event_id: eventId, classification: triage.classification, risk: triage.risk } });
  return { event_id: eventId, payload: nextPayload };
};

const conversationAssetType = (platform: string) => platform === "instagram" ? "instagram_business" : platform === "threads" ? "threads_profile" : platform === "whatsapp" ? "whatsapp_phone" : "facebook_page";

const sendConversationReply = async (adminId: string, body: Record<string, unknown>) => {
  const eventId = String(body.event_id || "").trim();
  const message = String(body.message || "").trim();
  if (!message) throw new Error("reply_message_required");
  const event = await getConversationEvent(eventId);
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
  const platform = String(payload.platform || (String(event.event_type || "").includes("whatsapp") ? "whatsapp" : "facebook"));
  const { data: asset, error: assetError } = await supabase.from("huddle_growth_assets").select("*").eq("asset_type", conversationAssetType(platform)).eq("status", "active").limit(1).maybeSingle();
  if (assetError || !asset) throw assetError || new Error(`reply_asset_not_connected:${platform}`);
  const recipientId = String(payload.sender_id || payload.from || "").trim();
  const targetId = String(payload.external_message_id || payload.comment_id || "").trim();
  const action = platform === "whatsapp"
    ? { action_type: "send_whatsapp_text", asset_id: asset.id, payload: { to: recipientId, text: message } }
    : { action_type: "send_reply", asset_id: asset.id, payload: { target_id: targetId || recipientId, ...(String(event.event_type || "").includes("messag") && recipientId ? { recipient_id: recipientId } : {}), message } };
  const result = await executeAction(action);
  const sentAt = new Date().toISOString();
  const nextPayload = { ...payload, final_reply: message, reply_status: "sent", sent_at: sentAt, approved_by: adminId };
  const { error } = await supabase.from("huddle_growth_webhook_events").update({ payload: nextPayload }).eq("id", eventId);
  if (error) throw error;
  await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, action: "conversation_reply_sent", platform, details: { event_id: eventId, original_draft: payload.agent_draft || null, final_message: message, recipient_id: recipientId || null, source: payload.source || null, sent_at: sentAt } });
  return { event_id: eventId, status: "sent", result };
};

const escalateConversation = async (adminId: string, body: Record<string, unknown>) => {
  const eventId = String(body.event_id || "").trim();
  const event = await getConversationEvent(eventId);
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
  const nextPayload = { ...payload, reply_status: "escalated", escalated_at: new Date().toISOString(), escalated_by: adminId };
  const { error } = await supabase.from("huddle_growth_webhook_events").update({ payload: nextPayload }).eq("id", eventId);
  if (error) throw error;
  await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, action: "conversation_escalated", platform: String(payload.platform || "unknown"), details: { event_id: eventId, classification: payload.classification || null, risk: payload.risk || null } });
  return { event_id: eventId, status: "escalated" };
};

const setConversationArchiveState = async (adminId: string, body: Record<string, unknown>, archived: boolean) => {
  const eventId = String(body.event_id || "").trim();
  const event = await getConversationEvent(eventId);
  const payload = event.payload && typeof event.payload === "object" ? event.payload as Record<string, unknown> : {};
  if (!archived && String(payload.reply_status || "") === "sent") throw new Error("sent_conversation_cannot_be_reopened");
  const nextPayload = archived
    ? { ...payload, reply_status: "dismissed", dismissed_at: new Date().toISOString(), dismissed_by: adminId }
    : { ...payload, reply_status: payload.agent_draft ? "ready" : "unprepared", dismissed_at: null, dismissed_by: null };
  const { error } = await supabase.from("huddle_growth_webhook_events").update({ payload: nextPayload }).eq("id", eventId);
  if (error) throw error;
  await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, action: archived ? "conversation_dismissed" : "conversation_restored", platform: String(payload.platform || "unknown"), details: { event_id: eventId } });
  return { event_id: eventId, status: archived ? "dismissed" : "ready" };
};

const cleanupRetention = async () => {
  const webhookDays = Math.max(7, Number(Deno.env.get("GROWTH_WEBHOOK_RETENTION_DAYS") || 30));
  const leadDays = Math.max(30, Number(Deno.env.get("GROWTH_LEAD_RETENTION_DAYS") || 90));
  const webhookCutoff = new Date(Date.now() - webhookDays * 24 * 60 * 60 * 1000).toISOString();
  const leadCutoff = new Date(Date.now() - leadDays * 24 * 60 * 60 * 1000).toISOString();
  const [webhooks, leads, oauth] = await Promise.all([
    supabase.from("huddle_growth_webhook_events").delete().lt("created_at", webhookCutoff),
    supabase.from("huddle_growth_leads").delete().lt("last_seen_at", leadCutoff).in("status", ["new", "discarded"]),
    supabase.from("huddle_growth_oauth_states").delete().lt("expires_at", new Date().toISOString()),
  ]);
  for (const result of [webhooks, leads, oauth]) if (result.error) throw result.error;
  return { deleted: { webhook_events: webhooks.count || 0, leads: leads.count || 0, oauth_states: oauth.count || 0 }, retention_days: { webhook_events: webhookDays, leads: leadDays } };
};

const maintainTokens = async () => {
  const { data: connections, error } = await supabase.from("huddle_growth_connections").select("*").eq("status", "active");
  if (error) throw error;
  const refreshed: string[] = [];
  const checked: string[] = [];
  const notes: string[] = [];
  for (const connection of (connections || []) as Array<Record<string, unknown>>) {
    try {
      const token = await readToken(connection);
      const metadata = connection.metadata && typeof connection.metadata === "object" ? connection.metadata as Record<string, unknown> : {};
      const lastRefresh = new Date(String(metadata.last_token_refresh_at || 0)).getTime();
      if (connection.provider === "threads" && (!lastRefresh || Date.now() - lastRefresh > 7 * 24 * 60 * 60 * 1000)) {
        const secret = String(Deno.env.get("THREADS_APP_SECRET") || Deno.env.get("META_APP_SECRET") || "").trim();
        const result = await graphRequest(`${THREADS_GRAPH_BASE}/refresh_access_token?${new URLSearchParams({ grant_type: "th_refresh_token", access_token: token })}`, { token });
        const nextToken = String(result.access_token || token);
        const encrypted = await encryptToken(nextToken);
        const expiresAt = Number(result.expires_in || 0) ? new Date(Date.now() + Number(result.expires_in) * 1000).toISOString() : connection.token_expires_at;
        const nextMetadata = { ...metadata, last_token_refresh_at: new Date().toISOString() };
        await supabase.from("huddle_growth_connections").update({ encrypted_access_token: encrypted.ciphertext, access_token_iv: encrypted.iv, token_expires_at: expiresAt, metadata: nextMetadata, last_error: null, updated_at: new Date().toISOString() }).eq("id", connection.id);
        await supabase.from("huddle_growth_assets").update({ encrypted_access_token: encrypted.ciphertext, access_token_iv: encrypted.iv, token_expires_at: expiresAt, updated_at: new Date().toISOString() }).eq("connection_id", connection.id);
        refreshed.push("threads");
      } else if (connection.provider === "meta") {
        const secret = String(Deno.env.get("META_APP_SECRET") || "").trim();
        if (secret) {
          const debug = await graphRequest(graphJson(`debug_token?${new URLSearchParams({ input_token: token, access_token: `${META_APP_ID}|${secret}` })}`), {});
          const data = debug.data && typeof debug.data === "object" ? debug.data as Record<string, unknown> : {};
          const expiresAt = Number(data.expires_at || 0) ? new Date(Number(data.expires_at) * 1000).toISOString() : null;
          await supabase.from("huddle_growth_connections").update({ token_expires_at: expiresAt, status: data.is_valid === false ? "degraded" : "active", last_error: data.is_valid === false ? "meta_token_invalid" : null, updated_at: new Date().toISOString() }).eq("id", connection.id);
          checked.push("meta");
        }
      }
    } catch (tokenError) {
      const message = safeError(tokenError);
      notes.push(`${connection.provider}:${message}`);
      await supabase.from("huddle_growth_connections").update({ status: "degraded", last_error: message, updated_at: new Date().toISOString() }).eq("id", connection.id);
    }
  }
  return { refreshed, checked, notes };
};

const subscribeWhatsAppWebhooks = async () => {
  const { data: assets, error } = await supabase.from("huddle_growth_assets").select("*").eq("asset_type", "whatsapp_business").eq("status", "active");
  if (error) throw error;
  const subscriptions: Record<string, unknown>[] = [];
  for (const asset of (assets || []) as Array<Record<string, unknown>>) {
    const connection = await getConnection(String(asset.connection_id));
    const token = await resolveAssetToken(asset, connection);
    try {
      await graphRequest(graphJson(`${asset.external_id}/subscribed_apps`), { method: "POST", token, form: new URLSearchParams() });
      const verified = await graphRequest(graphJson(`${asset.external_id}/subscribed_apps`), { token });
      const count = Array.isArray(verified.data) ? verified.data.length : 0;
      const metadata = asset.metadata && typeof asset.metadata === "object" ? asset.metadata as Record<string, unknown> : {};
      const subscriptionMetadata = { ...metadata, webhook_subscription_count: count, webhook_subscription_checked_at: new Date().toISOString() };
      await supabase.from("huddle_growth_assets").update({ metadata: subscriptionMetadata, updated_at: new Date().toISOString() }).eq("id", asset.id);
      const { data: phones } = await supabase.from("huddle_growth_assets").select("id,metadata").eq("asset_type", "whatsapp_phone").eq("connection_id", asset.connection_id);
      for (const phone of (phones || []) as Array<Record<string, unknown>>) {
        const phoneMetadata = phone.metadata && typeof phone.metadata === "object" ? phone.metadata as Record<string, unknown> : {};
        if (String(phoneMetadata.waba_id || "") === String(asset.external_id)) await supabase.from("huddle_growth_assets").update({ metadata: { ...phoneMetadata, webhook_subscription_count: count, webhook_subscription_checked_at: new Date().toISOString() }, updated_at: new Date().toISOString() }).eq("id", phone.id);
      }
      subscriptions.push({ asset_id: asset.id, subscribed_apps: count });
    } catch (subscriptionError) {
      subscriptions.push({ asset_id: asset.id, error: safeError(subscriptionError) });
    }
  }
  return subscriptions;
};

const enforceSpendCaps = async () => {
  const { data: policy, error } = await supabase.from("huddle_growth_budget_policies").select("daily_spend_cap_minor,monthly_spend_cap_minor,auto_pause_enabled,emergency_stop").eq("id", true).maybeSingle();
  if (error) throw error;
  if (!policy?.auto_pause_enabled || policy.emergency_stop) return { enforced: false, reason: "disabled_or_emergency_stop" };
  const dailyCap = Number(policy.daily_spend_cap_minor || 2000);
  const monthlyCap = Number(policy.monthly_spend_cap_minor || 30000);
  if (!Number(policy.daily_spend_cap_minor || 0) && !Number(policy.monthly_spend_cap_minor || 0)) {
    await supabase.from("huddle_growth_budget_policies").update({ daily_spend_cap_minor: dailyCap, monthly_spend_cap_minor: monthlyCap, updated_at: new Date().toISOString() }).eq("id", true);
    await supabase.from("huddle_growth_audit_logs").insert({ action: "conservative_spend_caps_initialised", platform: "ads", details: { daily_cap_minor: dailyCap, monthly_cap_minor: monthlyCap, currency: "account_currency" } });
  }
  const { data: assets, error: assetError } = await supabase.from("huddle_growth_assets").select("*").eq("asset_type", "ad_account").eq("status", "active");
  if (assetError) throw assetError;
  const paused: string[] = [];
  for (const asset of (assets || []) as Array<Record<string, unknown>>) {
    const connection = await getConnection(String(asset.connection_id));
    const token = await resolveAssetToken(asset, connection);
    const [daily, monthly] = await Promise.all([
      graphRequest(graphJson(`${asset.external_id}/insights?${new URLSearchParams({ fields: "spend", date_preset: "today" })}`), { token }),
      graphRequest(graphJson(`${asset.external_id}/insights?${new URLSearchParams({ fields: "spend", date_preset: "this_month" })}`), { token }),
    ]);
    const dailySpend = Math.round(Number((Array.isArray(daily.data) ? (daily.data[0] as Record<string, unknown>)?.spend : 0) || 0) * 100);
    const monthlySpend = Math.round(Number((Array.isArray(monthly.data) ? (monthly.data[0] as Record<string, unknown>)?.spend : 0) || 0) * 100);
    if ((dailyCap && dailySpend >= dailyCap) || (monthlyCap && monthlySpend >= monthlyCap)) {
      const campaigns = await graphRequest(graphJson(`${asset.external_id}/campaigns?${new URLSearchParams({ fields: "id,effective_status", effective_status: '["ACTIVE"]', limit: "100" })}`), { token });
      for (const campaign of (Array.isArray(campaigns.data) ? campaigns.data : []) as Array<Record<string, unknown>>) {
        const campaignId = String(campaign.id || "");
        if (!campaignId) continue;
        await graphRequest(graphJson(campaignId), { method: "POST", token, form: new URLSearchParams({ status: "PAUSED" }) });
        paused.push(campaignId);
      }
      await supabase.from("huddle_growth_audit_logs").insert({ action: "spend_cap_enforced", platform: "ads", details: { asset_id: asset.id, daily_spend_minor: dailySpend, monthly_spend_minor: monthlySpend, daily_cap_minor: dailyCap, monthly_cap_minor: monthlyCap, paused_campaigns: paused } });
    }
  }
  return { enforced: true, paused_campaigns: paused };
};

const maintenanceCycle = async () => {
  const tokens = await maintainTokens();
  const whatsapp = await subscribeWhatsAppWebhooks();
  const sync = await syncLiveSocial();
  const spend = await enforceSpendCaps();
  const action = await runAction();
  const retention = await cleanupRetention();
  return { tokens, whatsapp, sync, spend, action, retention };
};

const claimAction = async (actionId?: string) => {
  const query = supabase.from("huddle_growth_actions").select("*").in("status", ["queued"]).lte("next_retry_at", new Date().toISOString()).order("created_at", { ascending: true }).limit(1);
  const { data: rows, error } = actionId ? await supabase.from("huddle_growth_actions").select("*").eq("id", actionId).eq("status", "queued").limit(1) : await query;
  const action = rows?.[0] as Record<string, unknown> | undefined;
  if (error || !action) return null;
  const { data: policy } = await supabase.from("huddle_growth_budget_policies").select("emergency_stop").eq("id", true).maybeSingle();
  if (policy?.emergency_stop) return null;
  const { data: claimed, error: claimError } = await supabase.from("huddle_growth_actions").update({ status: "running", attempts: Number(action.attempts || 0) + 1, started_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", action.id).eq("status", "queued").select("*").maybeSingle();
  if (claimError || !claimed) return null;
  return claimed as Record<string, unknown>;
};

const runAction = async (actionId?: string) => {
  const action = await claimAction(actionId);
  if (!action) return { processed: false, reason: "no_action_or_emergency_stop" };
  try {
    const result = await executeAction(action);
    await supabase.from("huddle_growth_actions").update({ status: "succeeded", result, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null }).eq("id", action.id);
    await supabase.from("huddle_growth_audit_logs").insert({ actor_id: action.requested_by, action_id: action.id, action: "action_succeeded", platform: action.platform, details: { result } });
    return { processed: true, action_id: action.id, status: "succeeded", result };
  } catch (error) {
    const attempts = Number(action.attempts || 1);
    const terminal = attempts >= Number(action.max_attempts || 5);
    const message = safeError(error);
    await supabase.from("huddle_growth_actions").update({ status: terminal ? "failed" : "queued", last_error: message, next_retry_at: new Date(Date.now() + Math.min(60 * 60 * 1000, 1000 * (2 ** Math.min(attempts, 8)))).toISOString(), updated_at: new Date().toISOString() }).eq("id", action.id);
    await supabase.from("huddle_growth_audit_logs").insert({ actor_id: action.requested_by, action_id: action.id, action: terminal ? "action_failed" : "action_retry_scheduled", platform: action.platform, details: { error: message, attempts } });
    return { processed: true, action_id: action.id, status: terminal ? "failed" : "queued", error: message };
  }
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  const url = new URL(req.url);
  if (url.searchParams.get("compliance")) {
    try {
      return await handleComplianceCallback(req, url);
    } catch (error) {
      console.error("[huddle-growth compliance]", safeError(error));
      return json({ error: "invalid_compliance_request" }, 400);
    }
  }
  if (req.method === "GET" && url.searchParams.get("code")) return handleOAuthCallback(url);
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) as Record<string, unknown> : {};
    const operation = String(body.operation || url.searchParams.get("operation") || "");
    const workerOperation = ["run_worker", "run_action", "bootstrap_configured_assets", "sync_live_social", "prepare_content_pack", "store_agent_content_pack", "retention_cleanup", "maintain_tokens", "subscribe_whatsapp_webhooks", "maintenance_cycle"].includes(operation);
    let adminId = "";
    if (workerOperation && !getBearerToken(req)) requireWorker(req);
    else adminId = (await requireAdmin(req, supabase)).id;
    if (operation === "oauth_start") {
      const provider = body.provider === "threads" ? "threads" : "meta";
      return json(await startOAuth(req, provider, adminId));
    }
    if (operation === "console") {
      return json({ console: await getConsole() });
    }
    if (operation === "bootstrap_configured_assets") {
      const bootstrap = await bootstrapConfiguredAssets(adminId || null);
      return json({ ...bootstrap, console: await getConsole() });
    }
    if (operation === "sync_live_social") {
      if (!workerOperation) throw new Error("worker_required");
      const whatsappSubscriptions = await subscribeWhatsAppWebhooks();
      return json({ ...await syncLiveSocial(), whatsapp_subscriptions: whatsappSubscriptions });
    }
    if (operation === "prepare_content_pack") {
      if (!workerOperation) throw new Error("worker_required");
      const defaults = {
        objective: "Make people rethink what it means to care for an animal",
        direction: "Build a philosophy-led post around this thought: an animal is not a smaller version of a human life. Their life still has a whole centre. Make it feel like an honest realisation, not a lesson. Use the recent huddle account activity as context, but do not repeat it.",
        platforms: ["instagram", "threads", "facebook"],
      };
      return json({ ...await createContentPack(adminId || null, { ...defaults, ...body }), console: await getConsole() });
    }
    if (operation === "store_agent_content_pack") return json(await storeAgentContentPack(body));
    if (operation === "discover") {
      const connection = await getConnection(String(body.connection_id || ""));
      const token = await readToken(connection);
      const assets = connection.provider === "threads" ? [await discoverThreadsAsset(connection, token)] : await discoverMetaAssets(connection, token);
      return json({ assets });
    }
    if (operation === "disconnect") {
      const connectionId = String(body.connection_id || "");
      await supabase.from("huddle_growth_connections").update({ status: "revoked", encrypted_access_token: null, access_token_iv: null, updated_at: new Date().toISOString() }).eq("id", connectionId);
      await supabase.from("huddle_growth_audit_logs").insert({ actor_id: adminId, connection_id: connectionId, action: "connection_revoked", details: {} });
      return json({ ok: true });
    }
    if (operation === "queue_action") {
      return json(await queueAction(adminId, body));
    }
    if (operation === "decide_action") {
      return json(await decideAction(adminId, body));
    }
    if (operation === "update_policy") {
      return json(await updatePolicy(adminId, body));
    }
    if (operation === "generate_content") {
      return json(await generateContent(body));
    }
    if (operation === "create_content_pack") {
      return json(await createContentPack(adminId, body));
    }
    if (operation === "publish_content_draft") {
      return json(await publishContentDraft(adminId, body));
    }
    if (operation === "prepare_conversation_reply") {
      return json(await prepareConversationReply(adminId, body));
    }
    if (operation === "send_conversation_reply") {
      return json(await sendConversationReply(adminId, body));
    }
    if (operation === "escalate_conversation") {
      return json(await escalateConversation(adminId, body));
    }
    if (operation === "dismiss_conversation") return json(await setConversationArchiveState(adminId, body, true));
    if (operation === "restore_conversation") return json(await setConversationArchiveState(adminId, body, false));
    if (operation === "retention_cleanup") {
      if (!workerOperation) throw new Error("worker_required");
      return json(await cleanupRetention());
    }
    if (operation === "maintain_tokens") return json(await maintainTokens());
    if (operation === "subscribe_whatsapp_webhooks") return json({ subscriptions: await subscribeWhatsAppWebhooks() });
    if (operation === "maintenance_cycle") return json(await maintenanceCycle());
    if (operation === "run_worker") return json(await runAction());
    if (operation === "run_action") return json(await runAction(String(body.action_id || "")));
    if (operation === "health") return json({ ok: true, graph_version: GRAPH_BASE, threads_graph: THREADS_GRAPH_BASE });
    return json({ error: "operation_not_found" }, 404);
  } catch (error) {
    const message = safeError(error);
    const status = message === "auth_required" || message === "admin_required" || message === "worker_unauthorized" ? 401 : 400;
    console.error("[huddle-growth]", message);
    return json({ error: message }, status);
  }
});
