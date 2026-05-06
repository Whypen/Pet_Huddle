import { useCallback, useMemo, useRef, useState } from "react";
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import { useServiceChat } from "../hooks/useServiceChat";
import { supabase } from "../lib/supabase";
import { parseServiceMessage } from "../lib/parseServiceMessage";
import type { ChatMessageRow, ServiceStatus } from "../types/serviceChat";

// ─── Tokens ──────────────────────────────────────────────────────────────────

const C = {
  brandBlue: "#2145CF",
  brandText: "#424965",
  mutedText: "rgba(74,73,101,0.55)",
  white: "#FFFFFF",
  offWhite: "#F7F8FA",
  border: "rgba(163,168,190,0.20)",
  borderMed: "rgba(163,168,190,0.35)",
  inboundBubble: "#F0F2F8",
  shadowBlue: "rgba(33,69,207,0.28)",
  destructive: "#ef6450",
  green: "#16a34a",
  amber: "#d97706",
  amberBg: "#fffbeb",
  amberBorder: "#fde68a",
  amberText: "#92400e",
};

const STATUS_DOT: Record<ServiceStatus, string> = {
  pending: "#888888",
  booked: C.green,
  in_progress: C.brandBlue,
  completed: C.green,
  disputed: C.destructive,
};

const STATUS_LABEL: Record<ServiceStatus, string> = {
  pending: "Pending",
  booked: "Booked",
  in_progress: "In Progress",
  completed: "Done",
  disputed: "Dispute",
};

const SERVICE_TYPE_SUBTITLE: Record<string, string> = {
  "Dog Walking": "Dog Walking",
  "Dog Boarding": "Dog Boarding",
  "Dog Sitting": "Dog Sitting",
  "Cat Sitting": "Cat Sitting",
  "Pet Sitting": "Pet Sitting",
  "Home Visits": "Home Visits",
};

// ─── Event pill config ────────────────────────────────────────────────────────

type EventKind =
  | "service_request_sent"
  | "service_request_updated"
  | "service_request_withdrawn"
  | "service_quote_sent"
  | "service_booked"
  | "service_in_progress"
  | "service_completed"
  | "service_disputed";

const EVENT_CONFIG: Record<EventKind, { label: string; icon: string; color: string; bg: string }> = {
  service_request_sent:      { label: "Request sent",         icon: "📋", color: C.mutedText,   bg: C.offWhite },
  service_request_updated:   { label: "Request updated",      icon: "✏️",  color: C.mutedText,   bg: C.offWhite },
  service_request_withdrawn: { label: "Request withdrawn",    icon: "↩️",  color: C.mutedText,   bg: C.offWhite },
  service_quote_sent:        { label: "Quote received",       icon: "💬",  color: C.brandBlue,   bg: "#EEF2FF" },
  service_booked:            { label: "Booking confirmed",    icon: "✅",  color: C.green,       bg: "#F0FDF4" },
  service_in_progress:       { label: "Service in progress",  icon: "🐾",  color: C.brandBlue,   bg: "#EEF2FF" },
  service_completed:         { label: "Service complete",     icon: "🎉",  color: C.green,       bg: "#F0FDF4" },
  service_disputed:          { label: "Dispute filed",        icon: "⚠️",  color: C.destructive, bg: "#FFF1F0" },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatTime = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(dt);
};

const formatDateShort = (iso: string): string => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(dt);
};

const buildDateRangeLabel = (rawDates: unknown, fallbackDate: unknown): string => {
  const dates = Array.isArray(rawDates)
    ? (rawDates as unknown[]).map((d) => String(d || "").trim()).filter(Boolean)
    : [];
  const sorted = dates.length > 0 ? [...dates].sort() : [String(fallbackDate || "").trim()].filter(Boolean);
  if (sorted.length === 0) return "";
  if (sorted.length === 1) return formatDateShort(sorted[0]);
  return `${formatDateShort(sorted[0])} – ${formatDateShort(sorted[sorted.length - 1])}`;
};

// ─── Screen types ─────────────────────────────────────────────────────────────

type Props = {
  roomId: string;
  userId: string;
  onBack: () => void;
};

type BlockState = "none" | "blocked_by_me" | "blocked_by_them";

// ─── Sub-components ───────────────────────────────────────────────────────────

/** iMessage-style event divider: ─── icon label ─── */
function SystemEventDivider({ kind }: { kind: EventKind }) {
  const cfg = EVENT_CONFIG[kind];
  if (!cfg) return null;
  return (
    <View style={ss.eventRow} accessibilityRole="text" accessibilityLabel={cfg.label}>
      <View style={ss.eventRule} />
      <View style={[ss.eventPill, { backgroundColor: cfg.bg }]}>
        <Text style={ss.eventIcon}>{cfg.icon}</Text>
        <Text style={[ss.eventLabel, { color: cfg.color }]}>{cfg.label}</Text>
      </View>
      <View style={ss.eventRule} />
    </View>
  );
}

/** Single horizontal booking context strip */
function ContextStrip({
  serviceChat,
  isRequester,
  isProvider,
  onOpenDetail,
}: {
  serviceChat: NonNullable<ReturnType<typeof useServiceChat>["serviceChat"]>;
  isRequester: boolean;
  isProvider: boolean;
  onOpenDetail: () => void;
}) {
  const { request_card, quote_card, status } = serviceChat;

  const serviceLabel = useMemo(() => {
    if (!request_card) return null;
    if (Array.isArray(request_card.serviceTypes) && request_card.serviceTypes.length)
      return (request_card.serviceTypes as string[]).join(" · ");
    return SERVICE_TYPE_SUBTITLE[String(request_card.serviceType || "")] || String(request_card.serviceType || "");
  }, [request_card]);

  const petLabel = useMemo(() => {
    if (!request_card) return null;
    const name = String(request_card.petName || "").trim();
    return name || null;
  }, [request_card]);

  const dateLabel = useMemo(() => {
    if (!request_card) return null;
    return buildDateRangeLabel(request_card.requestedDates, request_card.requestedDate) || null;
  }, [request_card]);

  const priceLabel = useMemo(() => {
    if (quote_card?.finalPrice) {
      return `${String(quote_card.currency || "HKD")} ${String(quote_card.finalPrice)}`;
    }
    if (request_card?.suggestedPrice) {
      return `${String(request_card.suggestedCurrency || "HKD")} ${String(request_card.suggestedPrice)}`;
    }
    return null;
  }, [quote_card, request_card]);

  if (!serviceLabel && !dateLabel && !priceLabel) return null;

  return (
    <Pressable onPress={onOpenDetail} style={ss.contextOuter} accessibilityRole="button" accessibilityLabel="View booking details">
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={ss.contextScroll}
        scrollEnabled={false}
      >
        {(serviceLabel || petLabel) ? (
          <View style={ss.contextChip}>
            <Text style={ss.contextChipIcon}>🐾</Text>
            <Text style={ss.contextChipText} numberOfLines={1}>
              {[petLabel, serviceLabel].filter(Boolean).join(" · ")}
            </Text>
          </View>
        ) : null}
        {dateLabel ? (
          <View style={ss.contextChip}>
            <Text style={ss.contextChipIcon}>📅</Text>
            <Text style={ss.contextChipText} numberOfLines={1}>{dateLabel}</Text>
          </View>
        ) : null}
        {priceLabel ? (
          <View style={ss.contextChip}>
            <Text style={ss.contextChipIcon}>💰</Text>
            <Text style={ss.contextChipText} numberOfLines={1}>{priceLabel}</Text>
          </View>
        ) : null}
        {status === "disputed" ? (
          <View style={[ss.contextChip, ss.contextChipAlert]}>
            <Text style={ss.contextChipIcon}>⚠️</Text>
            <Text style={[ss.contextChipText, { color: C.destructive }]}>On hold</Text>
          </View>
        ) : null}
        <View style={ss.contextChevron}>
          <Text style={ss.contextChevronText}>›</Text>
        </View>
      </ScrollView>
    </Pressable>
  );
}

/** Bottom-sheet-style booking detail modal */
function BookingDetailModal({
  visible,
  onClose,
  serviceChat,
  isRequester,
  isProvider,
  sending,
  onEditRequest,
  onWithdrawRequest,
  onEditQuote,
  onWithdrawQuote,
}: {
  visible: boolean;
  onClose: () => void;
  serviceChat: NonNullable<ReturnType<typeof useServiceChat>["serviceChat"]>;
  isRequester: boolean;
  isProvider: boolean;
  sending: boolean;
  onEditRequest: () => void;
  onWithdrawRequest: () => void;
  onEditQuote: () => void;
  onWithdrawQuote: () => void;
}) {
  const { request_card, quote_card, status } = serviceChat;
  const hasEditableRequest = isRequester && status === "pending";
  const hasEditableQuote = isProvider && status === "pending";

  const formatDateRange = (rawDates: unknown, fallbackDate: unknown) => {
    const dates = Array.isArray(rawDates)
      ? (rawDates as unknown[]).map((d) => String(d || "").trim()).filter(Boolean)
      : [];
    const sorted = dates.length > 0 ? [...dates].sort() : [String(fallbackDate || "").trim()].filter(Boolean);
    if (sorted.length === 0) return "—";
    const fmt = (iso: string) => {
      const [y, m, d] = iso.split("-");
      if (!y || !m || !d) return iso;
      return `${d}-${m}-${y}`;
    };
    return `${fmt(sorted[0])} to ${fmt(sorted[sorted.length - 1])}`;
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={ss.modalBackdrop} onPress={onClose} accessibilityLabel="Close detail">
        <Pressable style={ss.detailSheet} onPress={(e) => e.stopPropagation()}>
          {/* Handle bar */}
          <View style={ss.sheetHandle} />
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {/* Request section */}
            {request_card ? (
              <View style={ss.detailSection}>
                <View style={ss.detailSectionHeader}>
                  <Text style={ss.detailSectionTitle}>Service Request</Text>
                  {hasEditableRequest ? (
                    <View style={ss.detailActionRow}>
                      <Pressable
                        onPress={() => { onClose(); onEditRequest(); }}
                        style={ss.detailActionPill}
                        accessibilityRole="button"
                        accessibilityLabel="Edit request"
                      >
                        <Text style={ss.detailActionPillText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { onClose(); onWithdrawRequest(); }}
                        style={[ss.detailActionPill, ss.detailActionPillDestructive]}
                        disabled={sending}
                        accessibilityRole="button"
                        accessibilityLabel="Withdraw request"
                      >
                        <Text style={[ss.detailActionPillText, { color: C.destructive }]}>Withdraw</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <DetailRow label="Service" value={
                  Array.isArray(request_card.serviceTypes) && request_card.serviceTypes.length
                    ? (request_card.serviceTypes as string[]).join(" · ")
                    : String(request_card.serviceType || "—")
                } />
                <DetailRow label="Pet" value={
                  `${String(request_card.petName || "—")} · ${String(request_card.petType || "—")}${request_card.dogSize ? ` (${request_card.dogSize})` : ""}`
                } />
                <DetailRow label="Dates" value={formatDateRange(request_card.requestedDates, request_card.requestedDate)} />
                <DetailRow label="Time" value={`${String(request_card.startTime || "—")} – ${String(request_card.endTime || "—")}`} />
                <DetailRow label="Location" value={String(request_card.locationArea || "—")} />
                {request_card.additionalNotes ? (
                  <DetailRow label="Notes" value={String(request_card.additionalNotes)} />
                ) : null}
              </View>
            ) : null}

            {/* Quote section */}
            {quote_card ? (
              <View style={[ss.detailSection, { marginTop: 4 }]}>
                <View style={ss.detailSectionHeader}>
                  <Text style={ss.detailSectionTitle}>Quote</Text>
                  {hasEditableQuote ? (
                    <View style={ss.detailActionRow}>
                      <Pressable
                        onPress={() => { onClose(); onEditQuote(); }}
                        style={ss.detailActionPill}
                        accessibilityRole="button"
                        accessibilityLabel="Edit quote"
                      >
                        <Text style={ss.detailActionPillText}>Edit</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => { onClose(); onWithdrawQuote(); }}
                        style={[ss.detailActionPill, ss.detailActionPillDestructive]}
                        disabled={sending}
                        accessibilityRole="button"
                        accessibilityLabel="Withdraw quote"
                      >
                        <Text style={[ss.detailActionPillText, { color: C.destructive }]}>Withdraw</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
                <DetailRow
                  label="Price"
                  value={`${String(quote_card.currency || "HKD")} ${String(quote_card.finalPrice || "—")} / ${String(quote_card.rate || "visit")}`}
                  highlight
                />
                {isProvider ? (() => {
                  const fp = Number(String(quote_card.finalPrice || "0").trim());
                  if (!Number.isFinite(fp) || fp <= 0) return null;
                  const payout = Math.round(fp * 0.90 * 100) / 100;
                  return (
                    <DetailRow
                      label="Your payout"
                      value={`${String(quote_card.currency || "HKD")} ${payout % 1 === 0 ? payout : payout.toFixed(2)} (after platform fee)`}
                    />
                  );
                })() : null}
                {String(quote_card.note || "").trim() ? (
                  <DetailRow label="Note" value={String(quote_card.note)} />
                ) : null}
              </View>
            ) : null}

            {/* Dispute banner */}
            {serviceChat.status === "disputed" ? (
              <View style={ss.disputeBanner}>
                <Text style={ss.disputeBannerTitle}>⚠️  Payment on hold</Text>
                <Text style={ss.disputeBannerBody}>
                  {isRequester ? "Huddle is reviewing this case." : "A complaint has been filed."}
                </Text>
              </View>
            ) : null}

            <View style={{ height: 32 }} />
          </ScrollView>
          <Pressable style={ss.sheetCloseBtn} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={ss.sheetCloseBtnText}>Done</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DetailRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={ss.detailRow}>
      <Text style={ss.detailRowLabel}>{label}</Text>
      <Text style={[ss.detailRowValue, highlight && ss.detailRowValueHL]}>{value}</Text>
    </View>
  );
}

/** Status action tray — slim pill row above composer */
function StatusActionTray({
  actionPrimary,
  canDispute,
  status,
  isRequester,
  hasQuote,
  sending,
  waitingForCounterparty,
  peerName,
  onDispute,
  onAskRevise,
}: {
  actionPrimary: { label: string; onClick: () => void; disabled?: boolean } | null;
  canDispute: boolean;
  status: ServiceStatus;
  isRequester: boolean;
  hasQuote: boolean;
  sending: boolean;
  waitingForCounterparty: boolean;
  peerName: string;
  onDispute: () => void;
  onAskRevise: () => void;
}) {
  const hasTray = Boolean(actionPrimary) || (canDispute && status !== "disputed");
  if (!hasTray && !waitingForCounterparty) return null;

  return (
    <View style={ss.tray}>
      {waitingForCounterparty ? (
        <Text style={ss.trayCaption} accessibilityRole="text">
          Waiting for {peerName} to confirm…
        </Text>
      ) : null}
      {hasTray ? (
        <View style={ss.trayRow}>
          {actionPrimary ? (
            <Pressable
              onPress={actionPrimary.onClick}
              disabled={sending || Boolean(actionPrimary.disabled)}
              style={({ pressed }) => [
                ss.trayPrimary,
                (sending || actionPrimary.disabled) ? ss.trayBtnDisabled : null,
                pressed ? { opacity: 0.82 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel={actionPrimary.label}
            >
              <Text style={ss.trayPrimaryText}>{actionPrimary.label}</Text>
            </Pressable>
          ) : null}
          {canDispute && status !== "disputed" ? (
            <Pressable
              onPress={onDispute}
              disabled={sending}
              style={({ pressed }) => [
                ss.traySecondary,
                sending ? ss.trayBtnDisabled : null,
                pressed ? { opacity: 0.82 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open dispute"
            >
              <Text style={ss.traySecondaryText}>Dispute</Text>
            </Pressable>
          ) : null}
          {status === "pending" && isRequester && hasQuote ? (
            <Pressable onPress={onAskRevise} accessibilityRole="button" accessibilityLabel="Ask to revise quote">
              <Text style={ss.trayReviseLink}>Ask to revise</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** Composer row with neumorphic input */
function ComposerBar({
  value,
  onChange,
  onSend,
  onAttach,
  locked,
  sending,
  isRequester,
  chatDisabled,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onAttach: () => void;
  locked: boolean;
  sending: boolean;
  isRequester: boolean;
  chatDisabled: boolean;
}) {
  const canSend = !chatDisabled && !locked && !sending && value.trim().length > 0;
  const placeholder = chatDisabled
    ? "Messaging restricted"
    : locked
    ? "Request a quote to start chatting"
    : isRequester
    ? "Ask a question…"
    : "Type a message…";

  return (
    <View style={ss.composerRow}>
      {chatDisabled ? (
        <View style={ss.composerRestricted}>
          <Text style={ss.composerRestrictedIcon}>🔒</Text>
          <Text style={ss.composerRestrictedText} numberOfLines={2}>
            Your messaging access is restricted due to recent account activity.
          </Text>
        </View>
      ) : (
        <View style={ss.composerInputWrap}>
          <Pressable
            onPress={onAttach}
            disabled={locked || sending}
            style={ss.composerAttachBtn}
            accessibilityRole="button"
            accessibilityLabel="Attach photo"
          >
            <Text style={ss.composerAttachIcon}>📷</Text>
          </Pressable>
          <TextInput
            style={ss.composerInput}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            placeholderTextColor={C.mutedText}
            editable={!locked && !sending}
            multiline={false}
            returnKeyType="send"
            onSubmitEditing={canSend ? onSend : undefined}
            blurOnSubmit={false}
          />
        </View>
      )}
      <Pressable
        onPress={onSend}
        disabled={!canSend}
        style={({ pressed }) => [
          ss.sendBtn,
          !canSend ? ss.sendBtnDisabled : null,
          pressed && canSend ? { opacity: 0.82 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Send message"
      >
        <Text style={ss.sendBtnIcon}>➤</Text>
      </Pressable>
    </View>
  );
}

/** Single message bubble */
function MessageBubble({
  message,
  isMe,
  isRead,
}: {
  message: ChatMessageRow;
  isMe: boolean;
  isRead: boolean;
}) {
  const parsed = useMemo(() => parseServiceMessage(message.content), [message.content]);
  const { text, attachments } = parsed;

  return (
    <View style={[ss.bubbleWrap, isMe ? ss.bubbleWrapMe : ss.bubbleWrapThem]}>
      <View style={[ss.bubble, isMe ? ss.bubbleMe : ss.bubbleThem]}>
        {attachments.length > 0 ? (
          <View style={[ss.attachGrid, attachments.length === 1 ? ss.attachGridSingle : null]}>
            {attachments.map((att, idx) => (
              <Pressable
                key={`${message.id}-att-${idx}`}
                onPress={() => Linking.openURL(att.url).catch(() => null)}
                accessibilityRole="link"
                accessibilityLabel={att.name || "attachment"}
              >
                {String(att.mime).startsWith("video/") ? (
                  <View style={ss.attachThumb}>
                    <Text style={ss.attachVideoLabel}>▶  Video</Text>
                  </View>
                ) : (
                  <Image source={{ uri: att.url }} style={ss.attachThumb} resizeMode="cover" />
                )}
              </Pressable>
            ))}
          </View>
        ) : null}
        {text ? (
          <Text style={[ss.bubbleText, isMe ? ss.bubbleTextMe : ss.bubbleTextThem]}>{text}</Text>
        ) : null}
      </View>
      <View style={[ss.bubbleMeta, isMe ? ss.bubbleMetaMe : ss.bubbleMetaThem]}>
        <Text style={ss.bubbleTime}>{formatTime(message.created_at)}</Text>
        {isMe ? (
          <Text
            style={[ss.bubbleReceipt, isRead ? ss.bubbleReceiptRead : null]}
            accessibilityLabel={isRead ? "read" : "sent"}
          >
            {isRead ? "✓✓" : "✓"}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function NativeServiceChatScreen({ roomId, userId, onBack }: Props) {
  const insets = useSafeAreaInsets();

  const {
    serviceChat,
    messages,
    readMessageIds,
    hasOlderMessages,
    loadingOlderMessages,
    counterpart,
    role,
    loading,
    roomResolved,
    sending,
    canMarkFinished,
    canDispute,
    hasReviewed,
    providerStripeReady,
    reload,
    loadOlderMessages,
    sendMessage,
    sendRequest,
    withdrawRequest,
    sendQuote,
    withdrawQuote,
    startService,
    markFinished,
    fileDispute,
    submitReview,
  } = useServiceChat(roomId, userId);

  const [composer, setComposer] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);
  const [blockState, setBlockState] = useState<BlockState>("none");
  const flatListRef = useRef<FlatList<ChatMessageRow>>(null);

  const peerName = counterpart?.displayName || "Service chat";
  const peerAvatar = counterpart?.avatarUrl || null;
  const status = (serviceChat?.status || "pending") as ServiceStatus;
  const isRequester = role === "requester";
  const isProvider = role === "provider";
  const hasRequest = Boolean(serviceChat?.request_card);
  const hasQuote = Boolean(serviceChat?.quote_card);
  const chatDisabled = false; // wired to useSafetyRestrictions when available
  const peerProfileUserId = isProvider ? serviceChat?.requester_id : serviceChat?.provider_id;

  const serviceTypeSubtitle = useMemo(() => {
    if (!serviceChat?.request_card) return null;
    const rc = serviceChat.request_card;
    if (Array.isArray(rc.serviceTypes) && rc.serviceTypes.length)
      return (rc.serviceTypes as string[]).join(" · ");
    return String(rc.serviceType || "") || null;
  }, [serviceChat]);

  const waitingForCounterparty =
    Boolean(serviceChat) &&
    status !== "completed" &&
    ((isRequester && serviceChat?.requester_mark_finished && !serviceChat?.provider_mark_finished) ||
      (isProvider && serviceChat?.provider_mark_finished && !serviceChat?.requester_mark_finished));

  const servicePeriodPassed = useMemo(() => {
    const request = serviceChat?.request_card;
    if (!request) return true;
    const allDates = Array.isArray(request.requestedDates) ? request.requestedDates.filter(Boolean) : [];
    const firstDate = allDates.length > 0 ? [...allDates].sort()[0] : String(request.requestedDate || "").trim();
    const endTime = String(request.endTime || "").trim();
    if (!firstDate || !endTime) return true;
    const endAt = new Date(`${firstDate}T${endTime}:00`);
    if (Number.isNaN(endAt.getTime())) return true;
    return Date.now() >= endAt.getTime();
  }, [serviceChat?.request_card]);

  const actionPrimary = useMemo(() => {
    if (!serviceChat) return null;
    if (status === "pending") {
      if (isRequester && !hasRequest) return { label: "Request a quote", onClick: () => notifyFormFlow("request") };
      if (isProvider && hasRequest && !hasQuote) return { label: "Send quote", onClick: () => notifyFormFlow("quote") };
      if (isRequester && hasRequest && hasQuote) {
        return {
          label: providerStripeReady ? "Accept & pay" : "Provider payout setup required",
          onClick: () => notifyFormFlow("payment"),
          disabled: !providerStripeReady,
        };
      }
      return null;
    }
    if (status === "booked") {
      if (isProvider) return { label: "Start service", onClick: () => void startService() };
      return { label: "Mark finished", onClick: () => void markFinished(), disabled: !canMarkFinished };
    }
    if (status === "in_progress") {
      return { label: "Mark finished", onClick: () => void markFinished(), disabled: !canMarkFinished };
    }
    if (status === "completed" && isRequester && !hasReviewed) {
      return { label: "Leave review", onClick: () => notifyFormFlow("review") };
    }
    return null;
  }, [canMarkFinished, hasQuote, hasRequest, hasReviewed, isProvider, isRequester, markFinished, providerStripeReady, serviceChat, startService, status]);

  const notifyFormFlow = (flow: string) => {
    Alert.alert("Coming soon", `The ${flow} form is being built for native. Use the web app for now.`);
  };

  const handleSendMessage = useCallback(async () => {
    if (chatDisabled || !composer.trim()) return;
    setSendingMsg(true);
    try {
      await sendMessage(composer.trim());
      setComposer("");
    } finally {
      setSendingMsg(false);
    }
  }, [chatDisabled, composer, sendMessage]);

  const handleAttach = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: 4,
      quality: 0.8,
    });
    if (result.canceled || !result.assets?.length) return;
    Alert.alert("Photo upload", "Image sending coming soon for native. Tap Cancel to continue.", [{ text: "OK" }]);
  }, []);

  const handleWithdrawRequest = useCallback(() => {
    Alert.alert(
      "Withdraw this request?",
      `This will cancel your inquiry with ${peerName}.`,
      [
        { text: "Keep it", style: "cancel" },
        {
          text: "Withdraw",
          style: "destructive",
          onPress: () => void withdrawRequest(),
        },
      ]
    );
  }, [peerName, withdrawRequest]);

  const handleBlockToggle = useCallback(async () => {
    if (!peerProfileUserId) return;
    const fn = blockState === "blocked_by_me" ? "unblock_user" : "block_user";
    const { error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
      fn,
      { p_blocked_id: peerProfileUserId }
    );
    if (error) {
      Alert.alert("Error", String(error.message || "Unable to update block status."));
      return;
    }
    setBlockState((prev) => (prev === "blocked_by_me" ? "none" : "blocked_by_me"));
  }, [blockState, peerProfileUserId]);

  const showOverflowMenu = useCallback(() => {
    const blockLabel = blockState === "blocked_by_me" ? "Unblock User" : "Block User";
    if (Platform.OS === "ios") {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ["Cancel", "Report User", blockLabel],
          destructiveButtonIndex: 2,
          cancelButtonIndex: 0,
        },
        (index) => {
          if (index === 1) Alert.alert("Report", "Report flow coming soon.");
          if (index === 2) void handleBlockToggle();
        }
      );
    } else {
      Alert.alert("More options", undefined, [
        { text: "Report User", onPress: () => Alert.alert("Report", "Report flow coming soon.") },
        { text: blockLabel, style: "destructive", onPress: () => void handleBlockToggle() },
        { text: "Cancel", style: "cancel" },
      ]);
    }
  }, [blockState, handleBlockToggle]);

  // Inverted list: pass reversed messages so newest is at bottom
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const renderItem = useCallback(({ item }: { item: ChatMessageRow }) => {
    const isMe = item.sender_id === userId;
    const parsed = parseServiceMessage(item.content);
    const kind = String(parsed.kind || "");

    if (
      kind === "service_request_sent" ||
      kind === "service_request_updated" ||
      kind === "service_request_withdrawn" ||
      kind === "service_quote_sent" ||
      kind === "service_booked" ||
      kind === "service_in_progress" ||
      kind === "service_completed" ||
      kind === "service_disputed"
    ) {
      return <SystemEventDivider key={item.id} kind={kind as EventKind} />;
    }

    return (
      <MessageBubble
        key={item.id}
        message={item}
        isMe={isMe}
        isRead={readMessageIds.has(item.id)}
      />
    );
  }, [readMessageIds, userId]);

  const showLoading = loading || (!!roomId && (!userId || !roomResolved));

  return (
    <SafeAreaView style={ss.safeArea} edges={["top"]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={ss.header}>
        {/* Back */}
        <Pressable onPress={onBack} style={ss.headerBack} accessibilityRole="button" accessibilityLabel="Back">
          <View style={ss.chevronWrap}>
            <View style={[ss.chevron, ss.chevronTop]} />
            <View style={[ss.chevron, ss.chevronBottom]} />
            <View style={ss.shaft} />
          </View>
        </Pressable>

        {/* Avatar */}
        <Pressable
          onPress={() => Alert.alert("Profile", "Profile view coming soon.")}
          style={ss.headerAvatarWrap}
          accessibilityRole="button"
          accessibilityLabel={`View ${peerName}'s profile`}
        >
          {peerAvatar ? (
            <Image source={{ uri: peerAvatar }} style={ss.headerAvatar} />
          ) : (
            <View style={[ss.headerAvatar, ss.headerAvatarFallback]}>
              <Text style={ss.headerAvatarInitial}>
                {peerName.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>

        {/* Name + subtitle */}
        <Pressable
          onPress={() => Alert.alert("Profile", "Profile view coming soon.")}
          style={ss.headerNameCol}
          accessibilityRole="button"
          accessibilityLabel={peerName}
        >
          <Text style={ss.headerName} numberOfLines={1}>{peerName}</Text>
          {serviceTypeSubtitle ? (
            <Text style={ss.headerSubtitle} numberOfLines={1}>{serviceTypeSubtitle}</Text>
          ) : null}
        </Pressable>

        {/* Status dot + label */}
        <View style={ss.headerStatusWrap} accessibilityRole="text" accessibilityLabel={`Status: ${STATUS_LABEL[status]}`}>
          <View style={[ss.statusDot, { backgroundColor: STATUS_DOT[status] }]} />
          <Text style={ss.statusLabel}>{STATUS_LABEL[status]}</Text>
        </View>

        {/* Overflow */}
        <Pressable
          onPress={showOverflowMenu}
          style={ss.headerOverflow}
          accessibilityRole="button"
          accessibilityLabel="More options"
        >
          <Text style={ss.overflowDots}>•••</Text>
        </Pressable>
      </View>

      {/* ── Context strip ── */}
      {!showLoading && serviceChat ? (
        <ContextStrip
          serviceChat={serviceChat}
          isRequester={Boolean(isRequester)}
          isProvider={Boolean(isProvider)}
          onOpenDetail={() => setDetailOpen(true)}
        />
      ) : null}

      {/* ── Message list ── */}
      <KeyboardAvoidingView
        style={ss.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={0}
      >
        {showLoading ? (
          <View style={ss.loadingState}>
            <ActivityIndicator size="small" color={C.brandBlue} />
            <Text style={ss.loadingText}>Loading chat…</Text>
          </View>
        ) : !serviceChat ? (
          <View style={ss.emptyState}>
            <Text style={ss.emptyStateText}>Chat not available.</Text>
          </View>
        ) : (
          <FlatList<ChatMessageRow>
            ref={flatListRef}
            data={reversedMessages}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={[ss.messageList, { paddingBottom: 12 }]}
            showsVerticalScrollIndicator={false}
            onEndReached={hasOlderMessages ? loadOlderMessages : undefined}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              loadingOlderMessages ? (
                <View style={ss.olderLoading}>
                  <ActivityIndicator size="small" color={C.mutedText} />
                  <Text style={ss.olderLoadingText}>Loading earlier messages…</Text>
                </View>
              ) : null
            }
            ListFooterComponent={
              !hasRequest && isProvider ? (
                <View style={ss.waitingState}>
                  <Text style={ss.waitingStateText}>Waiting for requester to send a service request.</Text>
                </View>
              ) : !hasRequest && isRequester && messages.length === 0 ? (
                <View style={ss.waitingState}>
                  <Text style={ss.waitingStateName}>Get started with {peerName}</Text>
                  <Text style={ss.waitingStateText}>Send a request to get a quote and start chatting.</Text>
                </View>
              ) : messages.length === 0 ? (
                <View style={ss.waitingState}>
                  <Text style={ss.waitingStateText}>No messages yet</Text>
                </View>
              ) : null
            }
          />
        )}

        {/* ── Bottom bar ── */}
        {!showLoading && serviceChat ? (
          <View style={[ss.bottomBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            {/* Status action tray (above composer) */}
            {status === "pending" && isRequester && !hasRequest ? (
              <Pressable
                onPress={() => notifyFormFlow("request")}
                style={ss.startRequestBtn}
                accessibilityRole="button"
                accessibilityLabel="Start with a request"
              >
                <Text style={ss.startRequestBtnText}>Start with a request</Text>
              </Pressable>
            ) : status === "pending" && isProvider && !hasRequest ? (
              <Text style={ss.waitingCaption}>Requester hasn't sent a service request yet.</Text>
            ) : (
              <>
                <StatusActionTray
                  actionPrimary={actionPrimary}
                  canDispute={canDispute}
                  status={status}
                  isRequester={Boolean(isRequester)}
                  hasQuote={hasQuote}
                  sending={sending}
                  waitingForCounterparty={waitingForCounterparty}
                  peerName={peerName}
                  onDispute={() => notifyFormFlow("dispute")}
                  onAskRevise={() => notifyFormFlow("request")}
                />
                {!servicePeriodPassed && status === "in_progress" ? (
                  <Text style={ss.trayCaption}>Mark finished unlocks after the service end time.</Text>
                ) : null}
                <ComposerBar
                  value={composer}
                  onChange={setComposer}
                  onSend={handleSendMessage}
                  onAttach={handleAttach}
                  locked={!hasRequest}
                  sending={sendingMsg || sending}
                  isRequester={Boolean(isRequester)}
                  chatDisabled={chatDisabled}
                />
              </>
            )}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      {/* ── Booking detail modal ── */}
      {serviceChat ? (
        <BookingDetailModal
          visible={detailOpen}
          onClose={() => setDetailOpen(false)}
          serviceChat={serviceChat}
          isRequester={Boolean(isRequester)}
          isProvider={Boolean(isProvider)}
          sending={sending}
          onEditRequest={() => notifyFormFlow("request")}
          onWithdrawRequest={handleWithdrawRequest}
          onEditQuote={() => notifyFormFlow("quote")}
          onWithdrawQuote={() => void withdrawQuote()}
        />
      ) : null}
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const ss = StyleSheet.create({
  // ── Layout
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: C.white },

  // ── Header
  header: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.97)",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  headerBack: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  chevronWrap: { width: 24, height: 24, position: "relative", alignItems: "center", justifyContent: "center" },
  chevron: { position: "absolute", left: 3, width: 9, height: 2, borderRadius: 2, backgroundColor: "rgba(74,73,101,0.85)" },
  chevronTop: { top: 8, transform: [{ rotate: "-45deg" }] },
  chevronBottom: { top: 14, transform: [{ rotate: "45deg" }] },
  shaft: { position: "absolute", left: 7, width: 13, height: 2, borderRadius: 2, backgroundColor: "rgba(74,73,101,0.85)" },
  headerAvatarWrap: { width: 44, height: 44, borderRadius: 22, overflow: "hidden" },
  headerAvatar: { width: 44, height: 44, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  headerAvatarFallback: { backgroundColor: "#EEF2FF", alignItems: "center", justifyContent: "center" },
  headerAvatarInitial: { fontFamily: "Urbanist-700", fontSize: 18, color: C.brandBlue },
  headerNameCol: { flex: 1, justifyContent: "center", gap: 1, minWidth: 0 },
  headerName: { fontFamily: "Urbanist-700", fontSize: 15, lineHeight: 19, color: C.brandText },
  headerSubtitle: { fontFamily: "Urbanist-500", fontSize: 11, lineHeight: 14, color: C.mutedText },
  headerStatusWrap: { flexDirection: "row", alignItems: "center", gap: 5, flexShrink: 0 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontFamily: "Urbanist-600", fontSize: 11, lineHeight: 14, color: C.mutedText },
  headerOverflow: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  overflowDots: { fontFamily: "Urbanist-700", fontSize: 16, color: C.brandText, letterSpacing: 1 },

  // ── Context strip
  contextOuter: {
    backgroundColor: C.offWhite,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.border,
  },
  contextScroll: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 9,
    gap: 8,
  },
  contextChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: C.white,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.borderMed,
  },
  contextChipAlert: { borderColor: "rgba(239,100,80,0.30)", backgroundColor: "#FFF8F7" },
  contextChipIcon: { fontSize: 13 },
  contextChipText: { fontFamily: "Urbanist-600", fontSize: 12, lineHeight: 16, color: C.brandText },
  contextChevron: { paddingHorizontal: 4 },
  contextChevronText: { fontFamily: "Urbanist-700", fontSize: 20, color: C.mutedText, marginTop: -2 },

  // ── Message list
  messageList: { paddingHorizontal: 16, paddingTop: 12 },

  // ── Loading / empty states
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  loadingText: { fontFamily: "Urbanist-600", fontSize: 14, color: C.mutedText },
  emptyState: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyStateText: { fontFamily: "Urbanist-500", fontSize: 14, color: C.mutedText },
  waitingState: { paddingVertical: 40, paddingHorizontal: 24, alignItems: "center", gap: 8 },
  waitingStateName: { fontFamily: "Urbanist-700", fontSize: 16, color: C.brandText, textAlign: "center" },
  waitingStateText: { fontFamily: "Urbanist-500", fontSize: 14, color: C.mutedText, textAlign: "center" },
  olderLoading: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  olderLoadingText: { fontFamily: "Urbanist-500", fontSize: 12, color: C.mutedText },

  // ── System event divider (iMessage style)
  eventRow: { flexDirection: "row", alignItems: "center", marginVertical: 12, paddingHorizontal: 4 },
  eventRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: C.borderMed },
  eventPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginHorizontal: 10,
  },
  eventIcon: { fontSize: 12 },
  eventLabel: { fontFamily: "Urbanist-600", fontSize: 11, lineHeight: 14 },

  // ── Message bubbles
  bubbleWrap: { marginBottom: 6 },
  bubbleWrapMe: { alignItems: "flex-end" },
  bubbleWrapThem: { alignItems: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  bubbleMe: { backgroundColor: C.brandBlue, borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: C.inboundBubble, borderBottomLeftRadius: 4 },
  bubbleText: { fontFamily: "Urbanist-500", fontSize: 15, lineHeight: 20 },
  bubbleTextMe: { color: C.white },
  bubbleTextThem: { color: C.brandText },
  bubbleMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, paddingHorizontal: 4 },
  bubbleMetaMe: { justifyContent: "flex-end" },
  bubbleMetaThem: { justifyContent: "flex-start" },
  bubbleTime: { fontFamily: "Urbanist-500", fontSize: 10, color: C.mutedText },
  bubbleReceipt: { fontFamily: "Urbanist-600", fontSize: 10, color: C.mutedText },
  bubbleReceiptRead: { color: C.brandBlue },

  // ── Attachment grid
  attachGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginBottom: 6 },
  attachGridSingle: {},
  attachThumb: { width: 120, height: 96, borderRadius: 10, backgroundColor: C.inboundBubble, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  attachVideoLabel: { fontFamily: "Urbanist-600", fontSize: 12, color: C.mutedText },

  // ── Bottom bar
  bottomBar: {
    backgroundColor: C.white,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: C.border,
    paddingTop: 6,
    paddingHorizontal: 16,
    gap: 6,
  },

  // ── Status action tray
  tray: { gap: 6 },
  trayRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  trayPrimary: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brandBlue,
    shadowColor: C.shadowBlue,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  trayPrimaryText: { fontFamily: "Urbanist-700", fontSize: 13, color: C.white },
  traySecondary: {
    height: 36,
    borderRadius: 18,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(239,100,80,0.40)",
    backgroundColor: "rgba(239,100,80,0.06)",
  },
  traySecondaryText: { fontFamily: "Urbanist-600", fontSize: 13, color: C.destructive },
  trayBtnDisabled: { opacity: 0.45 },
  trayCaption: { fontFamily: "Urbanist-500", fontSize: 11, color: C.mutedText, textAlign: "center", paddingVertical: 2 },
  trayReviseLink: { fontFamily: "Urbanist-500", fontSize: 12, color: C.mutedText, textDecorationLine: "underline" },
  waitingCaption: { fontFamily: "Urbanist-500", fontSize: 12, color: C.mutedText, textAlign: "center", paddingVertical: 10 },

  // ── Start request button
  startRequestBtn: {
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brandBlue,
    marginVertical: 4,
    shadowColor: C.shadowBlue,
    shadowOpacity: 0.30,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  startRequestBtnText: { fontFamily: "Urbanist-700", fontSize: 15, color: C.white },

  // ── Composer
  composerRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingBottom: 4 },
  composerInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.82)",
    paddingHorizontal: 6,
    shadowColor: "rgba(163,168,190,0.30)",
    shadowOpacity: 1,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    // Neumorphic inset — inner shadow approximated via border
    borderWidth: 1,
    borderColor: C.border,
  },
  composerAttachBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  composerAttachIcon: { fontSize: 18 },
  composerInput: {
    flex: 1,
    height: 42,
    fontFamily: "Urbanist-500",
    fontSize: 15,
    color: C.brandText,
    paddingHorizontal: 6,
  },
  composerRestricted: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 42,
    borderRadius: 21,
    backgroundColor: C.amberBg,
    borderWidth: 1,
    borderColor: C.amberBorder,
    paddingHorizontal: 14,
  },
  composerRestrictedIcon: { fontSize: 14 },
  composerRestrictedText: { flex: 1, fontFamily: "Urbanist-500", fontSize: 12, color: C.amberText },
  sendBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brandBlue,
    shadowColor: C.shadowBlue,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  sendBtnDisabled: { opacity: 0.40 },
  sendBtnIcon: { fontSize: 15, color: C.white, marginLeft: 2 },

  // ── Booking detail modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.40)",
    justifyContent: "flex-end",
  },
  detailSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "78%",
    paddingTop: 8,
    paddingHorizontal: 20,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 8,
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: "center", marginBottom: 16 },
  sheetCloseBtn: {
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.brandBlue,
    marginBottom: 20,
  },
  sheetCloseBtnText: { fontFamily: "Urbanist-700", fontSize: 15, color: C.white },

  // ── Detail modal internals
  detailSection: {
    borderRadius: 16,
    backgroundColor: C.offWhite,
    padding: 14,
    marginBottom: 4,
    gap: 8,
  },
  detailSectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  detailSectionTitle: { fontFamily: "Urbanist-700", fontSize: 14, color: C.brandText },
  detailActionRow: { flexDirection: "row", gap: 8 },
  detailActionPill: {
    height: 28,
    borderRadius: 14,
    paddingHorizontal: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.borderMed,
  },
  detailActionPillDestructive: { borderColor: "rgba(239,100,80,0.35)" },
  detailActionPillText: { fontFamily: "Urbanist-600", fontSize: 12, color: C.brandText },
  detailRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  detailRowLabel: { fontFamily: "Urbanist-600", fontSize: 12, color: C.mutedText, width: 72, flexShrink: 0, paddingTop: 1 },
  detailRowValue: { flex: 1, fontFamily: "Urbanist-500", fontSize: 13, color: C.brandText, lineHeight: 18 },
  detailRowValueHL: { fontFamily: "Urbanist-700", color: C.brandBlue },

  // ── Dispute banner
  disputeBanner: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(239,100,80,0.25)",
    backgroundColor: "rgba(239,100,80,0.08)",
    padding: 14,
    gap: 4,
    marginBottom: 4,
  },
  disputeBannerTitle: { fontFamily: "Urbanist-700", fontSize: 14, color: C.destructive },
  disputeBannerBody: { fontFamily: "Urbanist-500", fontSize: 13, color: C.destructive },
});
