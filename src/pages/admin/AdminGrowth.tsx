import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertOctagon, Check, CircleDot, ExternalLink, Link2, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { invokeAuthedFunction } from "@/lib/invokeAuthedFunction";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Connection = { id: string; provider: string; external_user_id: string; display_name: string | null; status: string; token_expires_at: string | null; granted_scopes: string[]; last_synced_at: string | null; last_error: string | null };
type Asset = { id: string; connection_id: string; asset_type: string; external_id: string; name: string | null; status: string; granted_scopes: string[]; metadata: Record<string, unknown> };
type Action = { id: string; action_type: string; platform: string | null; status: string; risk_level: string; payload: Record<string, unknown>; last_error: string | null; created_at: string; attempts: number };
type Approval = { id: string; action_id: string; status: string; note: string | null; created_at: string };
type Policy = { emergency_stop: boolean; daily_spend_cap_minor: number; monthly_spend_cap_minor: number; max_auto_budget_increase_percent: number; auto_pause_enabled: boolean; auto_pause_ctr_threshold: number; auto_pause_cpl_threshold_minor: number | null; allowed_actions: string[] };
type ConsoleData = { connections: Connection[]; assets: Asset[]; actions: Action[]; approvals: Approval[]; policy: Policy; audit: Array<{ id: string; action: string; platform: string | null; details: Record<string, unknown>; created_at: string }> };

const emptyConsole: ConsoleData = { connections: [], assets: [], actions: [], approvals: [], policy: { emergency_stop: false, daily_spend_cap_minor: 0, monthly_spend_cap_minor: 0, max_auto_budget_increase_percent: 10, auto_pause_enabled: true, auto_pause_ctr_threshold: 0, auto_pause_cpl_threshold_minor: null, allowed_actions: [] }, audit: [] };
const label = (value: string) => value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
const when = (value?: string | null) => value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "—";

export const GrowthOperationsPanel = () => {
  const { profile } = useAuth();
  const isAdmin = profile?.is_admin === true || profile?.user_role === "admin";
  const [consoleData, setConsoleData] = useState<ConsoleData>(emptyConsole);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [selectedAsset, setSelectedAsset] = useState("");
  const [brief, setBrief] = useState("");

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    const result = await invokeAuthedFunction<{ console?: ConsoleData }>("huddle-growth", { body: { operation: "console" } });
    if (result.error) setNotice(result.error.message);
    else setConsoleData(result.data?.console || emptyConsole);
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => { void load(); }, [load]);

  const connect = async (provider: "meta" | "threads") => {
    setBusy(provider); setNotice("");
    const result = await invokeAuthedFunction<{ authorization_url?: string }>("huddle-growth", { body: { operation: "oauth_start", provider } });
    setBusy(null);
    if (result.error || !result.data?.authorization_url) { setNotice(result.error?.message || "Unable to start Meta authorisation."); return; }
    window.location.assign(result.data.authorization_url);
  };

  const disconnect = async (id: string) => {
    if (!window.confirm("Revoke this Huddle business connection? Stored token material will be erased.")) return;
    setBusy(id); const result = await invokeAuthedFunction("huddle-growth", { body: { operation: "disconnect", connection_id: id } }); setBusy(null);
    if (result.error) setNotice(result.error.message); else await load();
  };

  const decide = async (actionId: string, approved: boolean) => {
    setBusy(actionId); const result = await invokeAuthedFunction("huddle-growth", { body: { operation: "decide_action", action_id: actionId, approved } }); setBusy(null);
    if (result.error) setNotice(result.error.message); else await load();
  };

  const queueText = async () => {
    if (!selectedAsset || !text.trim()) { setNotice("Choose a Huddle asset and add copy first."); return; }
    setBusy("queue");
    const asset = consoleData.assets.find((row) => row.id === selectedAsset);
    const result = await invokeAuthedFunction("huddle-growth", { body: { operation: "queue_action", action_type: "publish_text", platform: asset?.asset_type || "system", asset_id: selectedAsset, payload: { text: text.trim() }, risk_level: "routine", idempotency_key: `growth-publish-${selectedAsset}-${crypto.randomUUID()}` } });
    setBusy(null);
    if (result.error) setNotice(result.error.message); else { setText(""); setNotice("Queued. The server policy and action worker will execute it."); await load(); }
  };

  const generateDraft = async () => {
    setBusy("generate");
    const asset = consoleData.assets.find((row) => row.id === selectedAsset);
    const result = await invokeAuthedFunction<{ copy?: string }>("huddle-growth", { body: { operation: "generate_content", platform: asset?.asset_type || "Threads", brief } });
    setBusy(null);
    if (result.error) setNotice(result.error.message); else setText(result.data?.copy || "");
  };

  const setEmergencyStop = async (enabled: boolean) => {
    setBusy("emergency-stop");
    const result = await invokeAuthedFunction("huddle-growth", { body: { operation: "update_policy", emergency_stop: enabled } });
    setBusy(null);
    if (result.error) setNotice(result.error.message); else { setNotice(enabled ? "Emergency stop enabled." : "Emergency stop cleared."); await load(); }
  };

  const policy = consoleData.policy;
  const activeConnections = consoleData.connections.filter((connection) => connection.status === "active").length;
  const pendingApprovals = consoleData.approvals.filter((approval) => approval.status === "pending").length;
  const availableAssets = useMemo(() => consoleData.assets.filter((asset) => asset.status === "active"), [consoleData.assets]);

  if (!isAdmin) return <div className="flex min-h-[100svh] items-center justify-center p-6 text-sm text-muted-foreground">Admin access required.</div>;

  return (
    <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brandBlue"><ShieldCheck className="h-4 w-4" /> Huddle Growth Agent</div>
            <h1 className="text-3xl font-semibold tracking-tight">Know first. Act fast.</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Business-owned Meta operations for Huddle. Every action is scoped, audited, and policy-checked before it can leave this console.</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> Refresh</Button>
        </header>

        {notice ? <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-foreground">{notice}</div> : null}
        {policy.emergency_stop ? <div className="flex items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm"><AlertOctagon className="h-5 w-5 text-destructive" /><span><strong>Emergency stop is on.</strong> No queued action will execute until an admin turns it off.</span></div> : null}

        <section className="grid gap-3 sm:grid-cols-3">
          <Card><CardContent className="flex items-center gap-3 p-5"><Link2 className="h-5 w-5 text-brandBlue" /><div><div className="text-2xl font-semibold">{activeConnections}</div><div className="text-xs text-muted-foreground">Active connections</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><CircleDot className="h-5 w-5 text-brandGold" /><div><div className="text-2xl font-semibold">{availableAssets.length}</div><div className="text-xs text-muted-foreground">Discovered assets</div></div></CardContent></Card>
          <Card><CardContent className="flex items-center gap-3 p-5"><Activity className="h-5 w-5 text-brandBlue" /><div><div className="text-2xl font-semibold">{pendingApprovals}</div><div className="text-xs text-muted-foreground">Pending approvals</div></div></CardContent></Card>
        </section>

        <Tabs defaultValue="connections" className="space-y-4">
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 bg-card/70 p-1"><TabsTrigger value="connections">Connections & assets</TabsTrigger><TabsTrigger value="queue">Queue & approvals</TabsTrigger><TabsTrigger value="policy">Policy & budgets</TabsTrigger><TabsTrigger value="audit">Audit trail</TabsTrigger></TabsList>
          <TabsContent value="connections" className="space-y-4">
            <Card><CardHeader><CardTitle>Huddle-owned accounts</CardTitle><CardDescription>Connect only the Meta business assets owned by Huddle. Personal accounts are intentionally unsupported.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-3"><Button onClick={() => void connect("meta")} disabled={busy !== null}><ExternalLink className="h-4 w-4" /> Connect Meta business assets</Button><Button variant="outline" onClick={() => void connect("threads")} disabled={busy !== null}><ExternalLink className="h-4 w-4" /> Connect Threads</Button></CardContent></Card>
            <div className="grid gap-4 lg:grid-cols-2">{consoleData.connections.map((connection) => <Card key={connection.id}><CardHeader className="pb-3"><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-lg">{connection.display_name || label(connection.provider)}</CardTitle><CardDescription>{label(connection.provider)} · {connection.external_user_id}</CardDescription></div><Badge variant={connection.status === "active" ? "secondary" : "destructive"}>{connection.status}</Badge></div></CardHeader><CardContent className="space-y-3 text-sm"><div className="flex flex-wrap gap-1">{connection.granted_scopes.map((scope) => <Badge key={scope} variant="outline" className="font-normal">{scope}</Badge>)}</div><div className="text-xs text-muted-foreground">Last synced {when(connection.last_synced_at)} · token expiry {when(connection.token_expires_at)}</div>{connection.last_error ? <div className="text-xs text-destructive">{connection.last_error}</div> : null}<Button size="sm" variant="outline" onClick={() => void disconnect(connection.id)} disabled={busy === connection.id}><X className="h-4 w-4" /> Revoke connection</Button></CardContent></Card>)}{consoleData.connections.length === 0 ? <Card className="lg:col-span-2"><CardContent className="p-8 text-center text-sm text-muted-foreground">No Huddle business connection yet. Start with the Meta app authorisation above.</CardContent></Card> : null}</div>
            <Card><CardHeader><CardTitle>Discovered assets</CardTitle><CardDescription>Asset-level tokens are encrypted server-side and never shown here.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{availableAssets.map((asset) => <div key={asset.id} className="rounded-xl border border-border/70 bg-card/60 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{asset.name || asset.external_id}</div><div className="text-xs text-muted-foreground">{label(asset.asset_type)} · {asset.external_id}</div></div><Badge variant="outline">{asset.status}</Badge></div><div className="mt-3 flex flex-wrap gap-1">{asset.granted_scopes.slice(0, 4).map((scope) => <span key={scope} className="text-[11px] text-muted-foreground">{scope}</span>)}</div></div>)}{availableAssets.length === 0 ? <div className="text-sm text-muted-foreground">Assets appear after OAuth discovery succeeds.</div> : null}</CardContent></Card>
          </TabsContent>

          <TabsContent value="queue" className="space-y-4">
            <Card><CardHeader><CardTitle>Queue a safe publishing action</CardTitle><CardDescription>Routine publishing still passes through the server policy, idempotency key, retry queue, and audit log.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-[240px_1fr_auto] md:items-end"><label className="space-y-1 text-xs font-medium">Huddle asset<select value={selectedAsset} onChange={(event) => setSelectedAsset(event.target.value)} className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose asset</option>{availableAssets.map((asset) => <option key={asset.id} value={asset.id}>{asset.name || label(asset.asset_type)}</option>)}</select></label><label className="space-y-1 text-xs font-medium">Brief<textarea value={brief} onChange={(event) => setBrief(event.target.value)} placeholder="London launch, local pet safety, waitlist..." className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label><Button variant="outline" onClick={() => void generateDraft()} disabled={busy === "generate"}><Activity className="h-4 w-4" /> Draft copy</Button><label className="space-y-1 text-xs font-medium md:col-span-2">Copy<textarea value={text} onChange={(event) => setText(event.target.value)} placeholder="A useful, human Huddle post..." className="mt-1 min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></label><Button onClick={() => void queueText()} disabled={busy === "queue"}><Check className="h-4 w-4" /> Queue</Button></CardContent></Card>
            <Card><CardHeader><CardTitle>Action queue</CardTitle><CardDescription>High-risk actions remain blocked until an admin approves them.</CardDescription></CardHeader><CardContent className="space-y-3">{consoleData.actions.map((action) => <div key={action.id} className="rounded-xl border border-border/70 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-medium">{label(action.action_type)} <span className="text-muted-foreground">· {label(action.platform || "system")}</span></div><div className="mt-1 text-xs text-muted-foreground">{when(action.created_at)} · attempt {action.attempts}</div></div><Badge variant={action.status === "failed" ? "destructive" : action.status === "awaiting_approval" ? "outline" : "secondary"}>{label(action.status)}</Badge></div>{action.last_error ? <div className="mt-2 text-xs text-destructive">{action.last_error}</div> : null}{action.status === "awaiting_approval" ? <div className="mt-3 flex gap-2"><Button size="sm" onClick={() => void decide(action.id, true)} disabled={busy === action.id}><Check className="h-4 w-4" /> Approve</Button><Button size="sm" variant="outline" onClick={() => void decide(action.id, false)} disabled={busy === action.id}><X className="h-4 w-4" /> Reject</Button></div> : null}</div>)}{consoleData.actions.length === 0 ? <div className="text-sm text-muted-foreground">The queue is clear.</div> : null}</CardContent></Card>
          </TabsContent>

          <TabsContent value="policy" className="space-y-4"><Card><CardHeader><CardTitle>Control boundary</CardTitle><CardDescription>Spend caps are stored as minor currency units. A zero cap means no paid execution until a human sets one.</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-border/70 p-4"><div className="text-xs text-muted-foreground">Emergency stop</div><div className="mt-2 flex items-center justify-between gap-3"><div className="text-lg font-semibold">{policy.emergency_stop ? "ON" : "OFF"}</div><Button size="sm" variant={policy.emergency_stop ? "default" : "destructive"} onClick={() => void setEmergencyStop(!policy.emergency_stop)} disabled={busy === "emergency-stop"}>{policy.emergency_stop ? "Clear" : "Stop"}</Button></div></div><div className="rounded-xl border border-border/70 p-4"><div className="text-xs text-muted-foreground">Daily cap</div><div className="mt-2 text-lg font-semibold">{policy.daily_spend_cap_minor.toLocaleString()} minor</div></div><div className="rounded-xl border border-border/70 p-4"><div className="text-xs text-muted-foreground">Monthly cap</div><div className="mt-2 text-lg font-semibold">{policy.monthly_spend_cap_minor.toLocaleString()} minor</div></div><div className="rounded-xl border border-border/70 p-4"><div className="text-xs text-muted-foreground">Auto budget increase</div><div className="mt-2 text-lg font-semibold">{policy.max_auto_budget_increase_percent}%</div></div></CardContent></Card><Card><CardHeader><CardTitle>Allowed automatic actions</CardTitle><CardDescription>Material budget changes, new objectives, sensitive statements, deletions, and legal/crisis replies require approval.</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2">{policy.allowed_actions.map((action) => <Badge key={action} variant="outline">{label(action)}</Badge>)}</CardContent></Card></TabsContent>

          <TabsContent value="audit"><Card><CardHeader><CardTitle>Audit trail</CardTitle><CardDescription>Every connection, policy change, queue transition, and execution result is retained here.</CardDescription></CardHeader><CardContent className="space-y-3">{consoleData.audit.map((entry) => <div key={entry.id} className="flex items-start gap-3 border-b border-border/60 pb-3 last:border-0"><Activity className="mt-0.5 h-4 w-4 text-brandBlue" /><div className="min-w-0 flex-1"><div className="text-sm font-medium">{label(entry.action)}{entry.platform ? ` · ${label(entry.platform)}` : ""}</div><div className="text-xs text-muted-foreground">{when(entry.created_at)}</div></div></div>)}{consoleData.audit.length === 0 ? <div className="text-sm text-muted-foreground">No Growth Agent events yet.</div> : null}</CardContent></Card></TabsContent>
        </Tabs>
    </div>
  );
};

const AdminGrowth = () => (
  <main className="min-h-[100svh] w-full bg-transparent px-4 py-6 text-foreground sm:px-8 lg:px-12">
    <div className="mx-auto max-w-7xl">
      <GrowthOperationsPanel />
    </div>
  </main>
);

export default AdminGrowth;
