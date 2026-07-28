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

const html = (message: string, status = 200) => new Response(
  `<!doctype html><meta charset="utf-8"><title>Huddle Growth Agent</title><p>${message}</p><script>try{window.opener&&window.opener.postMessage({type:'huddle-growth-connected'},'*')}catch{};setTimeout(()=>location.href=${JSON.stringify(`${Deno.env.get("APP_URL") || "https://huddle.pet"}/admin/growth`)},400)</script>`,
  { status, headers: { ...CORS_HEADERS, "Content-Type": "text/html; charset=utf-8" } },
);

const requireWorker = (req: Request) => {
  const configured = String(Deno.env.get("GROWTH_WORKER_SECRET") || "").trim();
  const supplied = req.headers.get("x-growth-worker-secret") || "";
  if (!configured || supplied.length < 16 || supplied !== configured) throw new Error("worker_unauthorized");
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
  createdBy: string;
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
  const assets: Record<string, unknown>[] = [];
  if (!missingScopes(granted, ["pages_show_list"])[0]) {
    const pages = await graphRequest(graphJson("me/accounts?fields=id,name,access_token,instagram_business_account"), { token });
    for (const page of (Array.isArray(pages.data) ? pages.data : []) as Array<Record<string, unknown>>) {
      const pageToken = String(page.access_token || "");
      const storedPage = await storeAsset(connectionId, { assetType: "facebook_page", externalId: String(page.id), name: String(page.name || page.id), token: pageToken || undefined, scopes: granted, metadata: { page_id: page.id } });
      assets.push(storedPage);
      const ig = page.instagram_business_account as Record<string, unknown> | undefined;
      if (ig?.id) {
        const igProfile = await graphRequest(graphJson(`${ig.id}?fields=id,username,name,profile_picture_url`), { token: pageToken || token });
        assets.push(await storeAsset(connectionId, { assetType: "instagram_business", externalId: String(ig.id), name: String(igProfile.username || igProfile.name || ig.id), token: pageToken || token, scopes: granted, metadata: { page_id: page.id, username: igProfile.username } }));
      }
    }
  }
  if (!missingScopes(granted, ["ads_read"])[0]) {
    const adAccounts = await graphRequest(graphJson("me/adaccounts?fields=id,name,account_status,currency"), { token });
    for (const account of (Array.isArray(adAccounts.data) ? adAccounts.data : []) as Array<Record<string, unknown>>) {
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
  return assets;
};

const discoverThreadsAsset = async (connection: Record<string, unknown>, token: string) => {
  const userId = String(connection.external_user_id);
  const profile = await graphRequest(threadsJson(`${userId}?fields=id,username,name,threads_profile_picture_url`), { token });
  return storeAsset(String(connection.id), { assetType: "threads_profile", externalId: userId, name: String(profile.username || profile.name || userId), token, scopes: Array.isArray(connection.granted_scopes) ? connection.granted_scopes.map(String) : [], metadata: { username: profile.username } });
};

const resolveAssetToken = async (asset: Record<string, unknown>, connection: Record<string, unknown>) => {
  const assetCiphertext = String(asset.encrypted_access_token || "");
  if (assetCiphertext && asset.access_token_iv) return decryptToken(assetCiphertext, String(asset.access_token_iv));
  return readToken(connection);
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
      const imageUrl = String(payload.image_url || "").trim();
      if (!imageUrl) throw new Error("instagram_public_image_url_required");
      const created = await graphRequest(graphJson(`${asset.external_id}/media`), { method: "POST", token, form: new URLSearchParams({ image_url: imageUrl, caption: text }) });
      const published = await graphRequest(graphJson(`${asset.external_id}/media_publish`), { method: "POST", token, form: new URLSearchParams({ creation_id: String(created.id || "") }) });
      return { external_id: String(published.id || ""), platform: "instagram" };
    }
    if (platform === "facebook_page") {
      const missing = missingScopes(granted, ["pages_manage_posts"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
      const published = await graphRequest(graphJson(`${asset.external_id}/feed`), { method: "POST", token, form: new URLSearchParams({ message: text, ...(payload.link ? { link: String(payload.link) } : {}) }) });
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
      const missing = missingScopes(granted, ["pages_read_engagement"]); if (missing.length) throw new Error(`missing_scope:${missing.join(",")}`);
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
      const result = await graphRequest(threadsJson(`${targetId}/replies`), { method: "POST", token, form: new URLSearchParams({ text: message }) });
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
      await discoverMetaAssets(connection, exchanged.token);
    } else {
      const exchanged = await exchangeThreadsCode(code, redirectUri);
      const me = await graphRequest(threadsJson(`${exchanged.userId}?fields=id,username,name`), { token: exchanged.token });
      const scopes = THREADS_SCOPES;
      const connection = await storeConnection({ provider, externalUserId: String(exchanged.userId || me.id || ""), displayName: String(me.username || me.name || exchanged.userId), token: exchanged.token, expiresAt: exchanged.expiresIn ? new Date(Date.now() + exchanged.expiresIn * 1000).toISOString() : null, scopes, metadata: { app_id: THREADS_APP_ID, requested_scopes: THREADS_SCOPES }, createdBy: String(oauthState.created_by) });
      await discoverThreadsAsset(connection, exchanged.token);
    }
    return html("Huddle business account connected. You can close this window.");
  } catch (error) {
    console.error("[huddle-growth oauth]", safeError(error));
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
  const [connections, assets, actions, approvals, policy, audit] = await Promise.all([
    supabase.from("huddle_growth_connections").select("id,provider,external_user_id,display_name,status,token_expires_at,granted_scopes,metadata,last_synced_at,last_error,created_at,updated_at").order("created_at", { ascending: false }),
    supabase.from("huddle_growth_assets").select("id,connection_id,asset_type,external_id,name,status,granted_scopes,metadata,last_synced_at,updated_at").order("updated_at", { ascending: false }),
    supabase.from("huddle_growth_actions").select("id,action_type,platform,asset_id,content_id,payload,risk_level,status,idempotency_key,attempts,max_attempts,next_retry_at,requested_by,approved_by,started_at,completed_at,last_error,result,created_at,updated_at").in("status", ["queued", "awaiting_approval", "running", "failed"]).order("created_at", { ascending: false }).limit(100),
    supabase.from("huddle_growth_approvals").select("id,action_id,status,note,requested_by,decided_by,decided_at,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(100),
    supabase.from("huddle_growth_budget_policies").select("emergency_stop,daily_spend_cap_minor,monthly_spend_cap_minor,max_auto_budget_increase_percent,auto_pause_enabled,auto_pause_ctr_threshold,auto_pause_cpl_threshold_minor,allowed_actions,updated_at").eq("id", true).maybeSingle(),
    supabase.from("huddle_growth_audit_logs").select("id,actor_id,action_id,connection_id,action,platform,details,created_at").order("created_at", { ascending: false }).limit(100),
  ]);
  for (const result of [connections, assets, actions, approvals, policy, audit]) if (result.error) throw result.error;
  return { connections: connections.data || [], assets: assets.data || [], actions: actions.data || [], approvals: approvals.data || [], policy: policy.data || {}, audit: audit.data || [] };
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
  if (!apiKey) throw new Error("openai_api_key_missing");
  const model = String(Deno.env.get("OPENAI_GROWTH_MODEL") || "gpt-5.2").trim();
  const platform = String(body.platform || "Threads");
  const objective = String(body.objective || "useful local pet-safety awareness");
  const brief = String(body.brief || "").trim();
  const system = "You are Huddle's Growth Agent. Huddle is a London-first pet safety, care and social platform built around 'Know first. Act fast.'. Write concise, warm, witty, Gen-Z, useful, human, street-aware copy. Never use generic pet puns or corporate language. Never invent Huddle traction, users, partnerships, funding, locations, or product claims. Do not give veterinary, legal, financial, or crisis advice. If a safety topic is requested, use a careful reminder to contact an appropriately qualified professional. Return only the final post copy, no quotation marks or explanation.";
  const input = `Platform: ${platform}\nObjective: ${objective}\nBrief: ${brief || "Create one strong launch-ready idea for Huddle."}`;
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, store: false, input: [{ role: "developer", content: [{ type: "input_text", text: system }] }, { role: "user", content: [{ type: "input_text", text: input }] }] }) });
  const raw = await response.text();
  let parsed: Record<string, unknown> = {};
  try { parsed = raw ? JSON.parse(raw) as Record<string, unknown> : {}; } catch { parsed = {}; }
  if (!response.ok) throw new Error(`openai_request_failed:${response.status}`);
  const outputText = String(parsed.output_text || ((Array.isArray(parsed.output) ? parsed.output : []).flatMap((item) => (item && typeof item === "object" && Array.isArray((item as Record<string, unknown>).content) ? (item as Record<string, unknown>).content as Array<Record<string, unknown>> : [])).map((item) => String(item.text || "")).filter(Boolean).join("\n")) || "").trim();
  if (!outputText) throw new Error("openai_empty_response");
  return { copy: outputText, model };
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
  if (req.method === "GET" && url.searchParams.get("code")) return handleOAuthCallback(url);
  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) as Record<string, unknown> : {};
    const operation = String(body.operation || url.searchParams.get("operation") || "");
    const workerOperation = operation === "run_worker" || operation === "run_action";
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
    if (operation === "retention_cleanup") {
      if (!workerOperation) throw new Error("worker_required");
      return json(await cleanupRetention());
    }
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
