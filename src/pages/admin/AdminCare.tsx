import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type CareMoneyFlowStatus =
  | "paid_pending_care"
  | "care_in_progress_hold"
  | "completed_pending_payout"
  | "payout_released"
  | "disputed_hold"
  | "refund_full_succeeded"
  | "refund_partial_succeeded"
  | "refund_pending"
  | "stripe_failed"
  | "manual_review_required";

type CareTransactionRow = {
  service_chat_id: string;
  chat_id: string;
  owner_id: string;
  owner_name: string | null;
  owner_social_id: string | null;
  carer_id: string;
  carer_name: string | null;
  carer_social_id: string | null;
  booking_status: string | null;
  dispute_status: string | null;
  normalized_money_flow_status: CareMoneyFlowStatus;
  total_paid: number | null;
  service_rate: number | null;
  owner_refunded: number | null;
  carer_receives: number | null;
  platform_fee_gross: number | null;
  stripe_fee: number | null;
  platform_net_retained: number | null;
  currency: string | null;
  payment_intent_id: string | null;
  charge_id: string | null;
  refund_ids: string[] | null;
  transfer_id: string | null;
  transfer_reversal_id: string | null;
  application_fee_id: string | null;
  dispute_id: string | null;
  connected_account_id: string | null;
  stripe_connect_model: string | null;
  db_updated_at: string | null;
  stripe_synced_at: string | null;
};

const ADMIN_EMAIL_ALLOWLIST = new Set([
  "hello@huddle.pet",
  "support@huddle.pet",
  "hyphen@huddle.pet",
]);

const statusLabel: Record<CareMoneyFlowStatus, string> = {
  paid_pending_care: "Paid, pending care",
  care_in_progress_hold: "Care in progress, payout hold",
  completed_pending_payout: "Completed, pending payout",
  payout_released: "Payout released",
  disputed_hold: "Dispute hold",
  refund_full_succeeded: "Full refund",
  refund_partial_succeeded: "Partial refund",
  refund_pending: "Refund pending",
  stripe_failed: "Stripe failed",
  manual_review_required: "Manual review required",
};

const statusClass: Record<CareMoneyFlowStatus, string> = {
  paid_pending_care: "border-blue-200 bg-blue-50 text-blue-800",
  care_in_progress_hold: "border-blue-200 bg-blue-50 text-blue-800",
  completed_pending_payout: "border-amber-200 bg-amber-50 text-amber-900",
  payout_released: "border-emerald-200 bg-emerald-50 text-emerald-800",
  disputed_hold: "border-red-200 bg-red-50 text-red-800",
  refund_full_succeeded: "border-slate-300 bg-slate-100 text-slate-700",
  refund_partial_succeeded: "border-purple-200 bg-purple-50 text-purple-800",
  refund_pending: "border-amber-200 bg-amber-50 text-amber-900",
  stripe_failed: "border-red-300 bg-red-50 text-red-900",
  manual_review_required: "border-orange-200 bg-orange-50 text-orange-900",
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", { hour12: false });
};

const formatMoney = (currency: string | null | undefined, value: number | null | undefined) => {
  const safe = Number.isFinite(Number(value)) ? Number(value) : 0;
  const code = (currency || "HKD").toUpperCase();
  try {
    return new Intl.NumberFormat("en-HK", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safe);
  } catch {
    return `${code} ${safe.toFixed(2)}`;
  }
};

const compactId = (value: string | null | undefined) => {
  if (!value) return "-";
  if (value.length <= 18) return value;
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
};

const createIdempotencyKey = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const Field = ({ label, value }: { label: string; value: string | number | null | undefined }) => (
  <div className="min-w-0 rounded-lg border bg-muted/20 p-2">
    <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="mt-1 break-words font-mono text-xs text-foreground">{value ?? "-"}</div>
  </div>
);

const AdminCare = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const [rows, setRows] = useState<CareTransactionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [syncAll, setSyncAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveTick, setLiveTick] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [messageSending, setMessageSending] = useState<"owner" | "carer" | "both" | null>(null);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [messageSuccess, setMessageSuccess] = useState<string | null>(null);

  const isAdmin =
    profile?.is_admin === true ||
    profile?.user_role === "admin" ||
    ADMIN_EMAIL_ALLOWLIST.has((user?.email || "").toLowerCase());

  const selected = useMemo(
    () => rows.find((row) => row.service_chat_id === selectedId) ?? null,
    [rows, selectedId],
  );

  const loadRows = useCallback(async () => {
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("admin_get_care_transactions" as never);
    if (rpcError) {
      setError(rpcError.message || "Unable to load CARE transactions.");
      setRows([]);
      return;
    }
    setRows((Array.isArray(data) ? data : []) as CareTransactionRow[]);
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void loadRows().finally(() => setLoading(false));
  }, [authLoading, isAdmin, loadRows]);

  useEffect(() => {
    if (!isAdmin) return;
    const channel = supabase
      .channel("admin-care-money-flow")
      .on("postgres_changes", { event: "*", schema: "public", table: "service_chats" }, () => {
        setLiveTick("DB changed just now");
        void loadRows();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "service_disputes" }, () => {
        setLiveTick("Dispute changed just now");
        void loadRows();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "care_money_flow_snapshots" }, () => {
        setLiveTick("Stripe snapshot changed just now");
        void loadRows();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [isAdmin, loadRows]);

  const syncOne = useCallback(async (row: CareTransactionRow) => {
    setSyncing((current) => ({ ...current, [row.service_chat_id]: true }));
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("admin-sync-care-money-flow", {
      body: { service_chat_id: row.service_chat_id },
    });
    setSyncing((current) => ({ ...current, [row.service_chat_id]: false }));
    if (fnError) {
      setError(fnError.message || "Stripe sync failed.");
      return false;
    }
    if (data && typeof data === "object" && "error" in data) {
      const body = data as Record<string, unknown>;
      setError(String(body.detail || body.error || "Stripe sync failed."));
      return false;
    }
    await loadRows();
    return true;
  }, [loadRows]);

  const syncVisible = useCallback(async () => {
    if (syncAll) return;
    setSyncAll(true);
    for (const row of rows) {
      await syncOne(row);
    }
    setSyncAll(false);
  }, [rows, syncAll, syncOne]);

  const sendTeamHuddleMessage = useCallback(async (row: CareTransactionRow, target: "owner" | "carer" | "both") => {
    const body = messageDraft.trim();
    if (!body) {
      setMessageError("Message body is required.");
      return;
    }

    const recipients = target === "both"
      ? [
        { userId: row.owner_id, role: "owner" },
        { userId: row.carer_id, role: "carer" },
      ]
      : [{ userId: target === "owner" ? row.owner_id : row.carer_id, role: target }];

    setMessageSending(target);
    setMessageError(null);
    setMessageSuccess(null);

    for (const recipient of recipients) {
      const { error: sendError } = await supabase.rpc(
        "admin_send_team_huddle_case_message" as never,
        {
          p_case_type: row.dispute_id ? "dispute" : "user",
          p_case_id: row.dispute_id || row.service_chat_id,
          p_recipient_user_id: recipient.userId,
          p_recipient_role: recipient.role,
          p_message_body: body,
          p_idempotency_key: `care:${row.service_chat_id}:${recipient.role}:${createIdempotencyKey()}`,
        } as never,
      );
      if (sendError) {
        setMessageError(sendError.message || "Failed to send Team Huddle message.");
        setMessageSending(null);
        return;
      }
    }

    setMessageSending(null);
    setMessageDraft("");
    setMessageSuccess(target === "both" ? "Message sent to owner and carer as Team Huddle." : `Message sent to ${target} as Team Huddle.`);
  }, [messageDraft]);

  if (authLoading || loading) return <div className="p-4 md:p-6 text-sm text-muted-foreground">Loading CARE console...</div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">CARE Money Flow</h1>
            <p className="text-sm text-muted-foreground">
              Confirmed paid care sessions only. Stripe sync is read-only and writes local snapshots.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border bg-muted px-2 py-1 text-xs text-muted-foreground">
              {liveTick || "Live local DB watch active"}
            </span>
            <Button type="button" variant="outline" onClick={() => void loadRows()}>
              Refresh DB
            </Button>
            <Button type="button" onClick={() => void syncVisible()} disabled={syncAll || rows.length === 0}>
              {syncAll ? "Syncing..." : "Refresh Stripe statuses"}
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>
        ) : null}

        <div className="overflow-hidden rounded-xl border bg-card">
          <div className="overflow-x-auto">
            <table className="min-w-[1180px] w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Care transaction</th>
                  <th className="px-3 py-2">Owner</th>
                  <th className="px-3 py-2">Carer</th>
                  <th className="px-3 py-2">Booking</th>
                  <th className="px-3 py-2">Money flow</th>
                  <th className="px-3 py-2">Paid</th>
                  <th className="px-3 py-2">Refunded</th>
                  <th className="px-3 py-2">Carer receives</th>
                  <th className="px-3 py-2">Stripe synced</th>
                  <th className="px-3 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-8 text-center text-muted-foreground" colSpan={10}>
                      No confirmed paid care sessions found.
                    </td>
                  </tr>
                ) : rows.map((row) => (
                  <tr
                    key={row.service_chat_id}
                    className="border-b last:border-b-0 hover:bg-muted/30"
                  >
                    <td className="px-3 py-2">
                      <button
                        type="button"
                        className="font-mono text-xs underline decoration-dotted underline-offset-2"
                        onClick={() => setSelectedId(row.service_chat_id)}
                      >
                        {compactId(row.service_chat_id)}
                      </button>
                      <div className="font-mono text-[11px] text-muted-foreground">PI {compactId(row.payment_intent_id)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.owner_name || "Owner"}</div>
                      <div className="text-xs text-muted-foreground">@{row.owner_social_id || compactId(row.owner_id)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{row.carer_name || "Carer"}</div>
                      <div className="text-xs text-muted-foreground">@{row.carer_social_id || compactId(row.carer_id)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <div>{row.booking_status || "-"}</div>
                      <div className="text-xs text-muted-foreground">{row.dispute_status ? `Dispute: ${row.dispute_status}` : "No dispute"}</div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`inline-flex rounded-full border px-2 py-1 text-xs font-medium ${statusClass[row.normalized_money_flow_status]}`}>
                        {statusLabel[row.normalized_money_flow_status]}
                      </span>
                    </td>
                    <td className="px-3 py-2">{formatMoney(row.currency, row.total_paid)}</td>
                    <td className="px-3 py-2">{formatMoney(row.currency, row.owner_refunded)}</td>
                    <td className="px-3 py-2">{formatMoney(row.currency, row.carer_receives)}</td>
                    <td className="px-3 py-2">
                      <div>{formatDateTime(row.stripe_synced_at)}</div>
                      <div className="text-xs text-muted-foreground">DB {formatDateTime(row.db_updated_at)}</div>
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={Boolean(syncing[row.service_chat_id])}
                        onClick={() => void syncOne(row)}
                      >
                        {syncing[row.service_chat_id] ? "Syncing" : "Sync"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>CARE Transaction Detail</SheetTitle>
            <SheetDescription>{selected?.service_chat_id ?? ""}</SheetDescription>
          </SheetHeader>
          {selected ? (
            <div className="mt-4 space-y-4 text-sm">
              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Support summary</h3>
                <p className="mt-2 text-muted-foreground">
                  Status: {statusLabel[selected.normalized_money_flow_status]}. Owner refunded {formatMoney(selected.currency, selected.owner_refunded)}.
                  Carer receives {formatMoney(selected.currency, selected.carer_receives)}. Last Stripe sync: {formatDateTime(selected.stripe_synced_at)}.
                </p>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Team Huddle message</h3>
                <Textarea
                  className="mt-2 min-h-24"
                  value={messageDraft}
                  onChange={(event) => setMessageDraft(event.target.value)}
                  placeholder="Write a Team Huddle support message..."
                />
                {messageError ? <p className="mt-2 text-xs text-red-700">{messageError}</p> : null}
                {messageSuccess ? <p className="mt-2 text-xs text-emerald-700">{messageSuccess}</p> : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(messageSending)}
                    onClick={() => void sendTeamHuddleMessage(selected, "owner")}
                  >
                    {messageSending === "owner" ? "Sending..." : "Message owner"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(messageSending)}
                    onClick={() => void sendTeamHuddleMessage(selected, "carer")}
                  >
                    {messageSending === "carer" ? "Sending..." : "Message carer"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={Boolean(messageSending)}
                    onClick={() => void sendTeamHuddleMessage(selected, "both")}
                  >
                    {messageSending === "both" ? "Sending..." : "Message both"}
                  </Button>
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Booking summary</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Service chat ID" value={selected.service_chat_id} />
                  <Field label="Chat ID" value={selected.chat_id} />
                  <Field label="Booking status" value={selected.booking_status} />
                  <Field label="Dispute status" value={selected.dispute_status || "No dispute"} />
                  <Field label="Owner" value={`${selected.owner_name || "Owner"} @${selected.owner_social_id || selected.owner_id}`} />
                  <Field label="Carer" value={`${selected.carer_name || "Carer"} @${selected.carer_social_id || selected.carer_id}`} />
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Payment timeline</h3>
                <div className="mt-2 space-y-2 text-sm">
                  <div>Payment intent: {selected.payment_intent_id ? "present" : "missing"}</div>
                  <div>Refund: {(selected.refund_ids || []).length > 0 ? selected.refund_ids?.join(", ") : "none recorded"}</div>
                  <div>Transfer: {selected.transfer_id || "none recorded"}</div>
                  <div>Transfer reversal: {selected.transfer_reversal_id || "none recorded"}</div>
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Stripe status block</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="PaymentIntent" value={selected.payment_intent_id} />
                  <Field label="Charge" value={selected.charge_id} />
                  <Field label="Refund IDs" value={(selected.refund_ids || []).join(", ") || "-"} />
                  <Field label="Transfer" value={selected.transfer_id} />
                  <Field label="Application fee" value={selected.application_fee_id} />
                  <Field label="Connected account" value={selected.connected_account_id} />
                  <Field label="Connect model" value={selected.stripe_connect_model} />
                  <Field label="Stripe synced" value={formatDateTime(selected.stripe_synced_at)} />
                </div>
              </section>

              <section className="rounded-xl border p-3">
                <h3 className="font-semibold">Internal DB status block</h3>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <Field label="Money flow" value={statusLabel[selected.normalized_money_flow_status]} />
                  <Field label="Total paid" value={formatMoney(selected.currency, selected.total_paid)} />
                  <Field label="Service rate" value={formatMoney(selected.currency, selected.service_rate)} />
                  <Field label="Owner refunded" value={formatMoney(selected.currency, selected.owner_refunded)} />
                  <Field label="Carer receives" value={formatMoney(selected.currency, selected.carer_receives)} />
                  <Field label="Platform fee gross" value={formatMoney(selected.currency, selected.platform_fee_gross)} />
                  <Field label="Stripe fee" value={formatMoney(selected.currency, selected.stripe_fee)} />
                  <Field label="Platform net retained" value={formatMoney(selected.currency, selected.platform_net_retained)} />
                </div>
              </section>

              <div className="sticky bottom-0 -mx-6 border-t bg-background p-4">
                <Button
                  type="button"
                  className="w-full"
                  disabled={Boolean(syncing[selected.service_chat_id])}
                  onClick={() => void syncOne(selected)}
                >
                  {syncing[selected.service_chat_id] ? "Syncing..." : "Sync this transaction"}
                </Button>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AdminCare;
