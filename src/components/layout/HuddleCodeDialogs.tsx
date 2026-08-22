import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import { Camera, Copy, RefreshCw, Share2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

type CodeResult = { code: string; deepLink: string };

const normalizeCode = (value: string) => String(value || "").replace(/\D/g, "").slice(0, 6);
const formatCode = (value: string) => normalizeCode(value).replace(/(\d{3})(\d{0,3})/, (_, a, b) => (b ? `${a} ${b}` : a));

const readCodeResult = (value: unknown): CodeResult => {
  const row = (Array.isArray(value) ? value[0] : value) as { code?: unknown } | null;
  const code = normalizeCode(String(row?.code || ""));
  if (code.length !== 6) throw new Error("add_code_unavailable");
  return { code, deepLink: `https://huddle.pet/add-friend?code=${encodeURIComponent(code)}` };
};

const callCodeRpc = async (name: "get_or_create_native_add_code" | "rotate_native_add_code") => {
  const { data, error } = await (supabase.rpc as unknown as (name: string, args?: Record<string, never>) => Promise<{ data: unknown; error: { message?: string } | null }>)(name, {});
  if (error) throw new Error(error.message || "add_code_unavailable");
  return readCodeResult(data);
};

const errorCopy = (error: unknown) => {
  const message = String((error as Error)?.message || error || "");
  if (message.includes("rate_limited")) return "Too many tries. Wait a moment.";
  if (message.includes("request_pending")) return "You've already sent a request.";
  if (message.includes("incoming_request_exists")) return "They've already asked you. Check your requests.";
  if (message.includes("self_code")) return "That's your own code.";
  if (message.includes("blocked")) return "This person can't be added.";
  if (message.includes("already")) return "You're already connected.";
  if (message.includes("invalid")) return "That code doesn't look right.";
  if (message.includes("target_unavailable")) return "That code is no longer available.";
  if (message.includes("actor_unavailable")) return "Your account is restricted. Contact support.";
  if (message.includes("not_authenticated") || message.includes("missing_access_token")) return "Please sign in again.";
  return "Something went wrong. Try again.";
};

const createShareLink = async (fallback: string) => {
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args?: Record<string, never>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)("create_native_add_friend_invite_token", {});
  if (error) return fallback;
  const row = (Array.isArray(data) ? data[0] : data) as { deep_link?: unknown; token?: unknown } | null;
  const deepLink = String(row?.deep_link || "").trim();
  if (deepLink) return deepLink;
  const token = String(row?.token || "").trim();
  return token ? `https://huddle.pet/add-friend?invite=${encodeURIComponent(token)}` : fallback;
};

export function MyHuddleCodeDialog({ open, onOpenChange, onAddFriend }: { open: boolean; onOpenChange: (open: boolean) => void; onAddFriend: () => void }) {
  const [result, setResult] = useState<CodeResult | null>(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (rotate = false) => {
    setBusy(true);
    setError("");
    try {
      const next = await callCodeRpc(rotate ? "rotate_native_add_code" : "get_or_create_native_add_code");
      setResult(next);
      setQr(await QRCode.toDataURL(next.deepLink, { width: 352, margin: 1, color: { dark: "#111827", light: "#00000000" } }));
    } catch {
      setError(rotate ? "Could not create a new code." : "Could not load your huddle code.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { if (open) void load(false); }, [load, open]);

  const share = async () => {
    if (!result) return;
    try {
      const link = await createShareLink(result.deepLink);
      if (navigator.share) await navigator.share({ title: "Add me on huddle", text: "I'm on huddle — tap to add me.", url: link });
      else await navigator.clipboard.writeText(link);
    } catch {
      setError("Couldn't open sharing. Try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(420px,calc(100vw-24px))] rounded-[24px] p-5">
        <div className="pr-8"><DialogTitle>My huddle code</DialogTitle><DialogDescription>Show this when you meet someone in person.</DialogDescription></div>
        {busy && !result ? <p className="py-16 text-center text-sm text-muted-foreground">Loading…</p> : null}
        {result ? <>
          <div className="mx-auto mt-3 w-fit rounded-[20px] bg-white p-3 shadow-sm">{qr ? <img src={qr} alt="Your huddle code" className="h-44 w-44" /> : null}</div>
          <p className="text-center text-3xl font-extrabold tracking-[0.14em] text-brandText">{formatCode(result.code)}</p>
          <button type="button" onClick={() => void share()} className="mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brandBlue font-bold text-white"><Share2 className="h-4 w-4" />Share code</button>
          <div className="flex justify-center gap-5 pt-2 text-sm font-bold">
            <button type="button" onClick={() => { onOpenChange(false); onAddFriend(); }} className="flex items-center gap-1.5 text-brandBlue"><Camera className="h-4 w-4" />Scan a code</button>
            <button type="button" disabled={busy} onClick={() => void load(true)} className="flex items-center gap-1.5 text-destructive"><RefreshCw className="h-4 w-4" />New code</button>
          </div>
        </> : null}
        {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

export function AddFriendDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { if (!open) { setCode(""); setMessage(""); setError(""); } }, [open]);

  const redeem = async () => {
    const clean = normalizeCode(code);
    setError(""); setMessage("");
    if (clean.length !== 6) { setError("Enter all 6 digits."); return; }
    setBusy(true);
    try {
      const { data, error: rpcError } = await (supabase.rpc as unknown as (name: string, args: { p_code: string }) => Promise<{ data: unknown; error: { message?: string } | null }>)("redeem_native_add_code", { p_code: clean });
      if (rpcError) throw new Error(rpcError.message || "redeem_add_code_failed");
      const row = (Array.isArray(data) ? data[0] : data) as { target_user_id?: unknown; already_matched?: unknown } | null;
      if (row?.already_matched) { setMessage("You're already connected."); return; }
      if (!row?.target_user_id) throw new Error("redeem_add_code_failed");
      setMessage("Request sent.");
    } catch (nextError) { setError(errorCopy(nextError)); }
    finally { setBusy(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="w-[min(420px,calc(100vw-24px))] rounded-[24px] p-5">
    <div className="pr-8"><DialogTitle>Add a Friend</DialogTitle><DialogDescription>Enter their huddle code.</DialogDescription></div>
    <label className="mt-2 text-xs font-extrabold uppercase tracking-[0.14em] text-muted-foreground">huddle code<input autoFocus inputMode="numeric" value={formatCode(code)} onChange={(event) => setCode(normalizeCode(event.target.value))} onKeyDown={(event) => { if (event.key === "Enter") void redeem(); }} placeholder="123 456" className="mt-2 h-14 w-full rounded-[14px] border border-border bg-background px-4 text-center text-xl font-bold tracking-[0.12em] text-brandText outline-none focus:border-brandBlue focus:ring-2 focus:ring-brandBlue/20" /></label>
    <button type="button" disabled={busy} onClick={() => void redeem()} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brandBlue font-bold text-white disabled:opacity-50"><Copy className="h-4 w-4" />{busy ? "Adding…" : "Add friend"}</button>
    {error ? <p role="alert" className="text-sm font-semibold text-destructive">{error}</p> : null}{message ? <p role="status" className="text-sm font-semibold text-emerald-600">{message}</p> : null}
  </DialogContent></Dialog>;
}
