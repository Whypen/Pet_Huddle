import { FormEvent, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { PublicProfileSheet } from "@/components/profile/PublicProfileSheet";
import { useAuth } from "@/contexts/AuthContext";
import serviceImage from "@/assets/Notifications/Service.jpg";
import profilePlaceholder from "@/assets/Profile Placeholder.png";
import { ChatBubble } from "@/components/chat/ChatBubble";
import { SharedContentCard } from "@/components/chat/SharedContentCard";
import { useServiceChat } from "@/hooks/useServiceChat";
import { BookingCard } from "@/components/service-chat/BookingCard";
import { ActionBar } from "@/components/service-chat/ActionBar";
import { ServiceChatHeader } from "@/components/service-chat/ServiceChatHeader";
import { StartRequestBar } from "@/components/service-chat/StartRequestBar";
import { SystemEventPill } from "@/components/service-chat/SystemEventPill";
import { BookingConfirmedOverlay } from "@/components/service-chat/BookingConfirmedOverlay";
import { RequestForm } from "@/components/service-chat/RequestForm";
import { QuoteForm } from "@/components/service-chat/QuoteForm";
import { BookingConfirmScreen } from "@/components/service-chat/BookingConfirmScreen";
import { ReviewFlow } from "@/components/service-chat/ReviewFlow";
import { DisputeFlow } from "@/components/service-chat/DisputeFlow";
import { parseServiceMessage } from "@/components/service-chat/utils";
import { SERVICE_TYPES } from "@/components/service/carerServiceConstants";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { ServiceStatus } from "@/components/service-chat/types";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReportModal } from "@/components/moderation/ReportModal";
import { useSafetyRestrictions } from "@/hooks/useSafetyRestrictions";
import {
  extractFirstHttpUrl,
  fetchExternalLinkPreview,
  stripExternalUrlFromText,
  type ExternalLinkPreview,
} from "@/lib/externalLinkPreview";
import { ExternalLinkPreviewCard } from "@/components/ui/ExternalLinkPreviewCard";
import { parseChatShareMessage } from "@/lib/shareModel";
import { markChatRoomSeen } from "@/lib/chatSeen";

type ActiveSheet = "request" | "quote" | "payment" | "review" | "dispute" | null;
type BlockState = "none" | "blocked_by_me" | "blocked_by_them";

const formatMessageTime = (iso: string) => {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return "";
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
};

const ServiceChat = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const roomId = String(searchParams.get("room") || searchParams.get("roomId") || "").trim();
  const paidFlag = String(searchParams.get("paid") || searchParams.get("payment") || "").trim();
  const { user, profile, loading: authLoading } = useAuth();
  const { isActive } = useSafetyRestrictions();
  const userId = String(user?.id || profile?.id || "");

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
  const [sendingMessage, setSendingMessage] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [showBookedOverlay, setShowBookedOverlay] = useState(false);
  const [peerProfileOpen, setPeerProfileOpen] = useState(false);
  const [confirmWithdrawOpen, setConfirmWithdrawOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockConfirmOpen, setBlockConfirmOpen] = useState(false);
  const [blockingUser, setBlockingUser] = useState(false);
  const [blockState, setBlockState] = useState<BlockState>("none");
  const [composerUploads, setComposerUploads] = useState<File[]>([]);
  const [uploadingComposer, setUploadingComposer] = useState(false);
  const [linkPreviewByUrl, setLinkPreviewByUrl] = useState<Record<string, ExternalLinkPreview>>({});
  const [dismissedPreviewUrls, setDismissedPreviewUrls] = useState<Set<string>>(new Set());
  const [lockedPreviewUrl, setLockedPreviewUrl] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const messageScrollRef = useRef<HTMLDivElement | null>(null);
  const stickyHeaderRef = useRef<HTMLDivElement | null>(null);
  const bookingCardRef = useRef<HTMLDivElement | null>(null);
  const bottomBarRef = useRef<HTMLDivElement | null>(null);
  const [messageViewportHeight, setMessageViewportHeight] = useState<number>(420);
  const lastStatusRef = useRef<ServiceStatus | null>(null);
  const pendingInitialScrollRef = useRef(true);
  const loadingOlderAnchorRef = useRef<{ top: number; height: number } | null>(null);
  const invalidRoomHandledRef = useRef(false);
  const composerPreviewUrls = useMemo(
    () =>
      composerUploads.map((file) => ({
        key: `${file.name}-${file.size}-${file.lastModified}`,
        file,
        url: URL.createObjectURL(file),
      })),
    [composerUploads],
  );

  const peerName = counterpart?.displayName || "Service chat";
  const peerAvatar = counterpart?.avatarUrl || profilePlaceholder;

  const status = (serviceChat?.status || "pending") as ServiceStatus;
  const isRequester = role === "requester";
  const isProvider = role === "provider";
  const hasRequest = Boolean(serviceChat?.request_card);
  const currentRoomResolved = roomResolved && (!roomId || !serviceChat || serviceChat.chat_id === roomId);
  const chatDisabledBySafety = isActive("chat_disabled");
  const hasQuote = Boolean(serviceChat?.quote_card);
  const noMessagesYet = messages.length === 0;
  const requesterAllowsProfileAccess = serviceChat?.request_card?.allowProfileAccess !== false;
  const canOpenPeerProfile = isProvider ? requesterAllowsProfileAccess : true;
  const peerProfileUserId = isProvider ? serviceChat?.requester_id : serviceChat?.provider_id;

  const waitingForCounterparty =
    Boolean(serviceChat) &&
    status !== "completed" &&
    ((isRequester && serviceChat?.requester_mark_finished && !serviceChat?.provider_mark_finished) ||
      (isProvider && serviceChat?.provider_mark_finished && !serviceChat?.requester_mark_finished));

  const servicePeriodPassed = useMemo(() => {
    const request = serviceChat?.request_card;
    if (!request) return true;
    const allDates = Array.isArray(request.requestedDates)
      ? request.requestedDates.filter(Boolean)
      : [];
    const firstDate =
      allDates.length > 0
        ? [...allDates].sort()[0]
        : String(request.requestedDate || "").trim();
    const endTime = String(request.endTime || "").trim();
    if (!firstDate || !endTime) return true;
    const endAt = new Date(`${firstDate}T${endTime}:00`);
    if (Number.isNaN(endAt.getTime())) return true;
    return Date.now() >= endAt.getTime();
  }, [serviceChat?.request_card]);
  const composerFirstUrl = useMemo(() => {
    const url = extractFirstHttpUrl(composer);
    return url && !dismissedPreviewUrls.has(url) ? url : null;
  }, [composer, dismissedPreviewUrls]);
  const activePreviewUrl = lockedPreviewUrl && !dismissedPreviewUrls.has(lockedPreviewUrl)
    ? lockedPreviewUrl
    : composerFirstUrl;
  const composerPreview = activePreviewUrl ? linkPreviewByUrl[activePreviewUrl] || null : null;
  const showLoading = authLoading || loading || (!!roomId && (!userId || !currentRoomResolved));

  const markCurrentRoomSeen = useCallback(() => {
    if (!userId || !roomId || messages.length === 0) return;
    const latestMessage = messages[messages.length - 1];
    markChatRoomSeen(userId, roomId, latestMessage?.created_at || null);
  }, [messages, roomId, userId]);

  useEffect(() => {
    return () => {
      composerPreviewUrls.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [composerPreviewUrls]);

  useEffect(() => {
    if (!serviceChat) return;
    const prev = lastStatusRef.current;
    if (prev && prev !== "booked" && status === "booked") {
      setShowBookedOverlay(true);
    }
    lastStatusRef.current = status;
  }, [serviceChat, status]);

  useEffect(() => {
    let cancelled = false;
    const loadBlockState = async () => {
      if (!userId || !peerProfileUserId) {
        if (!cancelled) setBlockState("none");
        return;
      }
      const { data } = await supabase
        .from("user_blocks")
        .select("blocker_id, blocked_id")
        .or(
          `and(blocker_id.eq.${userId},blocked_id.eq.${peerProfileUserId}),and(blocker_id.eq.${peerProfileUserId},blocked_id.eq.${userId})`,
        )
        .limit(1);
      if (cancelled) return;
      const relation = Array.isArray(data) && data.length > 0 ? data[0] : null;
      if (relation?.blocker_id === userId && relation?.blocked_id === peerProfileUserId) {
        setBlockState("blocked_by_me");
      } else if (relation?.blocker_id === peerProfileUserId && relation?.blocked_id === userId) {
        setBlockState("blocked_by_them");
      } else {
        setBlockState("none");
      }
    };
    void loadBlockState();
    return () => {
      cancelled = true;
    };
  }, [peerProfileUserId, userId]);

  useEffect(() => {
    if (!roomId) return;
    if (paidFlag === "1" || paidFlag === "success") {
      toast.success("Payment completed. Waiting for booking confirmation…");
      void reload(true);
    }
    if (paidFlag === "0") {
      toast.info("Payment was canceled.");
    }
  }, [paidFlag, reload, roomId]);

  useEffect(() => {
    pendingInitialScrollRef.current = true;
    invalidRoomHandledRef.current = false;
  }, [roomId]);

  useEffect(() => {
    if (showLoading || !roomId || !roomResolved || serviceChat || invalidRoomHandledRef.current) return;
    invalidRoomHandledRef.current = true;
    toast.error("This service chat is unavailable. Returning to your chats.");
    navigate("/chats?tab=service", { replace: true });
  }, [navigate, roomId, roomResolved, serviceChat, showLoading]);

  useLayoutEffect(() => {
    if (loading || showLoading || messages.length === 0) return;
    const container = messageScrollRef.current;
    if (!container) return;

    if (loadingOlderAnchorRef.current) {
      const { top, height } = loadingOlderAnchorRef.current;
      const nextHeight = container.scrollHeight;
      container.scrollTop = top + (nextHeight - height);
      loadingOlderAnchorRef.current = null;
      return;
    }

    if (!pendingInitialScrollRef.current) return;
    container.scrollTop = container.scrollHeight;
    pendingInitialScrollRef.current = false;
    setShowScrollToBottom(false);
    markCurrentRoomSeen();
  }, [loading, markCurrentRoomSeen, messages, showLoading]);

  useEffect(() => {
    if (loading || showLoading || messages.length === 0) return;
    const container = messageScrollRef.current;
    const lastMessage = messages[messages.length - 1];
    if (!container || !lastMessage) return;
    if (lastMessage.sender_id !== userId) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
    setShowScrollToBottom(false);
    markCurrentRoomSeen();
  }, [loading, markCurrentRoomSeen, messages, showLoading, userId]);

  useEffect(() => {
    if (loading || showLoading || messages.length === 0) return;
    const container = messageScrollRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (distanceToBottom <= 120) {
      markCurrentRoomSeen();
    }
  }, [loading, markCurrentRoomSeen, messages, showLoading]);

  useEffect(() => {
    const computeHeight = () => {
      const stickyTop = stickyHeaderRef.current?.getBoundingClientRect().height ?? 0;
      const bookingTop = bookingCardRef.current?.getBoundingClientRect().height ?? 0;
      const bottom = bottomBarRef.current?.getBoundingClientRect().height ?? 0;
      const viewport = window.innerHeight;
      const reserved = stickyTop + bookingTop + bottom;
      setMessageViewportHeight(Math.max(220, viewport - reserved));
    };

    computeHeight();

    const observer = new ResizeObserver(() => computeHeight());
    if (stickyHeaderRef.current) observer.observe(stickyHeaderRef.current);
    if (bookingCardRef.current) observer.observe(bookingCardRef.current);
    if (bottomBarRef.current) observer.observe(bottomBarRef.current);
    window.addEventListener("resize", computeHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", computeHeight);
    };
  }, [status, loading]);

  useEffect(() => {
    const urls = new Set<string>();
    if (activePreviewUrl) urls.add(activePreviewUrl);
    messages.forEach((message) => {
      const parsed = parseServiceMessage(message.content);
      const parsedText = parsed.text;
      const previewUrl =
        parsed.linkPreviewUrl || extractFirstHttpUrl(parsedText);
      if (previewUrl) urls.add(previewUrl);
    });
    urls.forEach((url) => {
      if (linkPreviewByUrl[url]?.resolved || linkPreviewByUrl[url]?.failed || linkPreviewByUrl[url]?.loading) return;
      setLinkPreviewByUrl((prev) => ({ ...prev, [url]: { url, loading: true } }));
      void fetchExternalLinkPreview(url).then((preview) => {
        setLinkPreviewByUrl((prev) => ({ ...prev, [url]: preview }));
      });
    });
  }, [activePreviewUrl, linkPreviewByUrl, messages]);

  useEffect(() => {
    if (!composerFirstUrl) return;
    const preview = linkPreviewByUrl[composerFirstUrl];
    if (!preview?.resolved || preview.failed) return;
    setLockedPreviewUrl(composerFirstUrl);
    setComposer((prev) => {
      if (!prev.includes(composerFirstUrl)) return prev;
      return stripExternalUrlFromText(prev, composerFirstUrl);
    });
  }, [composerFirstUrl, linkPreviewByUrl]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const container = messageScrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior });
  };

  useEffect(() => {
    const container = messageScrollRef.current;
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    setShowScrollToBottom(distanceToBottom > 120);
  }, [messages.length, serviceChat?.status]);

  const handleSendMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (chatDisabledBySafety) return;
    if (!composer.trim() && composerUploads.length === 0 && !activePreviewUrl) return;
    setSendingMessage(true);
    setUploadingComposer(composerUploads.length > 0);
    try {
      const attachments: Array<{ url: string; mime: string; name: string }> = [];
      for (const file of composerUploads) {
        const userIdSafe = String(userId || "unknown");
        const ext = (file.name.split(".").pop() || "bin").toLowerCase();
        const path = `${userIdSafe}/chat-media/${crypto.randomUUID()}.${ext}`;
        const { error: uploadError } = await supabase.storage.from("notices").upload(path, file, {
          upsert: false,
          contentType: file.type || undefined,
          cacheControl: "3600",
        });
        if (uploadError) throw uploadError;
        const { data: signed } = await supabase.storage.from("notices").createSignedUrl(path, 60 * 60 * 24 * 30);
        if (!signed?.signedUrl) {
          throw new Error("attachment_sign_failed");
        }
        attachments.push({
          url: signed.signedUrl,
          mime: file.type || "application/octet-stream",
          name: file.name,
        });
      }
      await sendMessage(composer.trim(), attachments, { linkPreviewUrl: activePreviewUrl });
      setComposer("");
      setComposerUploads([]);
      setLockedPreviewUrl(null);
      setDismissedPreviewUrls(new Set());
    } finally {
      setSendingMessage(false);
      setUploadingComposer(false);
    }
  };

  const actionPrimary = useMemo(() => {
    if (!serviceChat) return null;
    if (status === "pending") {
      if (isRequester && !hasRequest) return { label: "Request a quote", onClick: () => setActiveSheet("request") };
      if (isProvider && hasRequest && !hasQuote) return { label: "Send quote", onClick: () => setActiveSheet("quote") };
      if (isRequester && hasRequest && hasQuote) {
        return {
          label: providerStripeReady ? "Accept & pay" : "Provider payout setup required",
          onClick: () => setActiveSheet("payment"),
          disabled: !providerStripeReady,
        };
      }
      return null;
    }
    if (status === "booked") {
      if (isProvider) {
        return { label: "Start service", onClick: () => void startService() };
      }
      return { label: "Mark finished", onClick: () => void markFinished(), disabled: !canMarkFinished };
    }
    if (status === "in_progress") {
      return { label: "Mark finished", onClick: () => void markFinished(), disabled: !canMarkFinished };
    }
    if (status === "completed" && isRequester && !hasReviewed) {
      return { label: "Leave review", onClick: () => setActiveSheet("review") };
    }
    return null;
  }, [
    canMarkFinished,
    hasQuote,
    hasRequest,
    hasReviewed,
    isProvider,
    isRequester,
    markFinished,
    providerStripeReady,
    serviceChat,
    startService,
    status,
  ]);

  return (
    <div className="h-full min-h-0 w-full max-w-full bg-background overflow-hidden">
      <div ref={stickyHeaderRef}>
        <ServiceChatHeader
          peerName={peerName}
          peerAvatar={peerAvatar}
          status={status}
          onBack={() => navigate("/chats?tab=service")}
          onReport={() => setReportOpen(true)}
          onBlock={() => setBlockConfirmOpen(true)}
          blockMenuLabel={blockState === "blocked_by_me" ? "Unblock User" : "Block User"}
          peerClickable={Boolean(serviceChat && peerProfileUserId && canOpenPeerProfile)}
          onPeerClick={() => {
            if (!serviceChat || !peerProfileUserId) return;
            if (!canOpenPeerProfile) {
              toast.info("Requester did not share profile access for this request.");
              return;
            }
            setPeerProfileOpen(true);
          }}
        />
      </div>

      {!showLoading && serviceChat ? (
        <div ref={bookingCardRef} className="shrink-0 px-4 pt-3">
          <BookingCard
            status={status}
            isRequester={Boolean(isRequester)}
            isProvider={Boolean(isProvider)}
            submittingAction={sending}
            requestCard={serviceChat.request_card}
            quoteCard={serviceChat.quote_card}
            hasQuote={hasQuote}
            onEditRequest={() => setActiveSheet("request")}
            onWithdrawRequest={() => setConfirmWithdrawOpen(true)}
            onEditQuote={() => setActiveSheet("quote")}
            onWithdrawQuote={() => void withdrawQuote()}
          />
        </div>
      ) : null}

      <div
        ref={messageScrollRef}
        onScroll={(event) => {
          const container = event.currentTarget;
          const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
          setShowScrollToBottom(distanceToBottom > 120);
          if (distanceToBottom <= 120) {
            markCurrentRoomSeen();
          }
          if (container.scrollTop <= 80 && hasOlderMessages && !loadingOlderMessages && !loading && !showLoading) {
            loadingOlderAnchorRef.current = {
              top: container.scrollTop,
              height: container.scrollHeight,
            };
            void loadOlderMessages();
          }
        }}
        style={{ height: `${messageViewportHeight}px` }}
        className="relative overflow-y-auto px-4 pt-3 pb-4 space-y-3"
      >
        {showLoading && (
          <div className="h-56 rounded-2xl border border-border/40 bg-card flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading
          </div>
        )}

        {!showLoading && serviceChat && (
          <>
            <section className="space-y-2">
              {loadingOlderMessages ? (
                <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  Loading earlier messages
                </div>
              ) : null}
              {isProvider && !hasRequest ? (
                <div className="rounded-2xl border border-border/40 bg-card p-6 text-center text-sm text-muted-foreground">
                  Waiting for requester to send service request.
                </div>
              ) : isRequester && !hasRequest && noMessagesYet ? (
                <div className="mx-auto flex w-full max-w-md flex-col items-center py-4">
                  <img src={serviceImage} alt="Service" className="w-full max-w-[300px] object-contain" />
                  <p className="mt-2 px-2 text-center text-[15px] leading-relaxed text-[rgba(74,73,101,0.70)]">
                    Let’s get started! Send a request to get a quote and start chatting with{" "}
                    <span className="font-semibold text-[#1F1F1F]">{peerName}</span>.
                  </p>
                </div>
              ) : noMessagesYet ? (
                <div className="text-center text-sm text-muted-foreground py-10">No messages yet</div>
              ) : (
                messages.map((message) => {
                  const me = message.sender_id === userId;
                  const parsed = parseServiceMessage(message.content);
                  const share = parseChatShareMessage(message.content) || parseChatShareMessage(parsed.text);
                  if (share) {
                    return (
                      <div key={message.id} className={cn("flex flex-col", me ? "items-end" : "items-start")}>
                        <SharedContentCard share={share} mine={me} />
                      </div>
                    );
                  }
                  const kind = String(parsed.kind || "");
                  if (kind) {
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
                      return <SystemEventPill key={message.id} kind={kind as never} />;
                    }
                  }
                  const text = parsed.text;
                  const previewUrl = parsed.linkPreviewUrl || extractFirstHttpUrl(text);
                  const preview = previewUrl ? linkPreviewByUrl[previewUrl] || null : null;
                  const displayText = previewUrl ? stripExternalUrlFromText(text, previewUrl) : text;
                  const attachments = parsed.attachments;
                  return (
                    <div key={message.id} className={cn("flex flex-col", me ? "items-end" : "items-start")}>
                      <ChatBubble variant={me ? "sent" : "received"}>
                        {attachments.length > 0 ? (
                          <div className={cn("mb-2 grid grid-cols-2 gap-2", attachments.length === 1 && "grid-cols-1")}>
                            {attachments.map((attachment, idx) => (
                              <a key={`${message.id}-att-${idx}`} href={String(attachment.url)} target="_blank" rel="noreferrer">
                                {String(attachment.mime || "").startsWith("video/") ? (
                                  <video src={String(attachment.url)} controls className="h-36 w-full rounded-lg border border-white/30 object-cover" />
                                ) : (
                                  <img src={String(attachment.url)} alt={String(attachment.name || "attachment")} className="h-36 w-full rounded-lg border border-white/30 object-cover" />
                                )}
                              </a>
                            ))}
                          </div>
                        ) : null}
                        {previewUrl ? (
                          <ExternalLinkPreviewCard
                            url={previewUrl}
                            preview={preview}
                            className={attachments.length > 0 ? "mt-1" : undefined}
                          />
                        ) : null}
                        {displayText ? <div className={cn(previewUrl && "mt-2")}>{displayText}</div> : null}
                      </ChatBubble>
                      <div className={cn("mt-1 flex items-center gap-1 px-1 text-[11px] text-[#9AA0B5]", me ? "justify-end" : "justify-start")}>
                        <span>{formatMessageTime(message.created_at)}</span>
                        {me ? (
                          <span
                            className={cn(
                              "font-semibold leading-none",
                              readMessageIds.has(message.id) ? "text-brandBlue" : "text-[#9AA0B5]"
                            )}
                            aria-label={readMessageIds.has(message.id) ? "read" : "sent"}
                          >
                            {readMessageIds.has(message.id) ? "✓✓" : "✓"}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  );
                })
              )}
            </section>
          </>
        )}
        {showScrollToBottom ? (
          <button
            type="button"
            onClick={() => {
              scrollToBottom("smooth");
              markCurrentRoomSeen();
            }}
            className="sticky bottom-3 ml-auto flex items-center gap-1 rounded-full border border-border/50 bg-background px-3 py-1.5 text-xs text-brandText shadow-sm"
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Latest
          </button>
        ) : null}
      </div>

      <div ref={bottomBarRef} className="shrink-0">
        {!showLoading && serviceChat && composerUploads.length > 0 ? (
          <div className="border-t border-border/40 bg-background px-4 pt-2">
            <div className="mb-2 flex gap-2 overflow-x-auto">
              {composerPreviewUrls.map(({ key, file, url }, idx) => (
                <div key={key} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-border">
                  {file.type.startsWith("video/") ? (
                    <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">Video</div>
                  ) : (
                    <img src={url} alt={file.name} className="h-full w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setComposerUploads((prev) => prev.filter((_, currentIndex) => currentIndex !== idx));
                    }}
                    className="absolute right-1 top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white"
                    aria-label={`Remove ${file.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {!showLoading && serviceChat ? (
          status === "pending" && isRequester && !hasRequest ? (
          <StartRequestBar onClick={() => setActiveSheet("request")} />
          ) : status === "pending" && isProvider && !hasRequest ? (
          <div className="border-t border-border/40 bg-background px-4 py-3 pb-[max(8px,env(safe-area-inset-bottom))]">
            <p className="text-xs text-muted-foreground text-center">Requester hasn’t sent a service request yet.</p>
          </div>
          ) : (
          <ActionBar
            waitingForCounterparty={waitingForCounterparty}
            peerName={peerName}
            actionPrimary={actionPrimary}
            canDispute={canDispute}
            status={status}
            isRequester={Boolean(isRequester)}
            hasQuote={hasQuote}
            submittingAction={sending}
            composer={composer}
            hasUploads={composerUploads.length > 0}
            hasLinkPreview={Boolean(activePreviewUrl)}
            composerLocked={Boolean(!hasRequest)}
            sendingMessage={sendingMessage || uploadingComposer}
            chatDisabled={chatDisabledBySafety}
            servicePeriodPassed={servicePeriodPassed}
            activePreviewUrl={activePreviewUrl}
            composerPreview={composerPreview}
            onComposerChange={setComposer}
            onSendMessage={handleSendMessage}
            onAttachPhoto={() => imageInputRef.current?.click()}
            onDismissPreview={(url) => {
              setDismissedPreviewUrls((prev) => {
                const next = new Set(prev);
                next.add(url);
                return next;
              });
              setLockedPreviewUrl((prev) => (prev === url ? null : prev));
            }}
            onOpenDispute={() => setActiveSheet("dispute")}
            onAskRevise={() => setActiveSheet("request")}
          />
          )
        ) : (
          <div className="border-t border-border/40 bg-background px-4 py-3 pb-[max(8px,env(safe-area-inset-bottom))]" />
        )}
        <div className="h-[calc(var(--nav-height,64px)+env(safe-area-inset-bottom)+8px)]" aria-hidden />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const picked = Array.from(event.target.files || []);
            if (picked.length) {
              setComposerUploads((prev) => [...prev, ...picked].slice(0, 6));
            }
            event.currentTarget.value = "";
          }}
          disabled={sendingMessage || uploadingComposer}
        />
      </div>

      {showBookedOverlay ? (
        <BookingConfirmedOverlay providerName={peerName} onDone={() => setShowBookedOverlay(false)} />
      ) : null}

      <RequestForm
        open={activeSheet === "request"}
        onClose={() => setActiveSheet(null)}
        onSubmit={sendRequest}
        providerServices={SERVICE_TYPES}
        initialCard={serviceChat?.request_card || undefined}
        draftKey={roomId ? `service_request_draft:${roomId}:${userId}` : undefined}
        submitLabel={serviceChat?.request_sent_at ? "Update" : "Send"}
      />

      <QuoteForm
        open={activeSheet === "quote"}
        onClose={() => setActiveSheet(null)}
        onSubmit={sendQuote}
        requestCard={serviceChat?.request_card || null}
        initialCard={serviceChat?.quote_card || undefined}
      />

      <BookingConfirmScreen
        open={activeSheet === "payment"}
        onClose={() => setActiveSheet(null)}
        quoteCard={serviceChat?.quote_card || null}
        requestServiceType={String(serviceChat?.request_card?.serviceType || "")}
        roomId={roomId}
      />

      <ReviewFlow
        open={activeSheet === "review"}
        onClose={() => setActiveSheet(null)}
        providerName={peerName}
        onSubmit={submitReview}
      />

      <DisputeFlow
        open={activeSheet === "dispute"}
        onClose={() => setActiveSheet(null)}
        onSubmit={fileDispute}
      />

      <PublicProfileSheet
        isOpen={peerProfileOpen}
        onClose={() => setPeerProfileOpen(false)}
        loading={false}
        fallbackName={peerName}
        data={null}
        viewedUserId={peerProfileUserId || null}
      />

      <Dialog open={confirmWithdrawOpen} onOpenChange={setConfirmWithdrawOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Withdraw this request?</DialogTitle>
            <DialogDescription>
              This will cancel your inquiry for{" "}
              <span className="font-semibold">{String(serviceChat?.request_card?.serviceType || "service")}</span>{" "}
              with <span className="font-semibold">{peerName}</span>. You can always send a new request if your plans change.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row gap-2">
            <button
              type="button"
              onClick={() => setConfirmWithdrawOpen(false)}
              className="h-10 flex-1 rounded-full border border-border/60 bg-white text-sm font-semibold text-brandText"
            >
              Keep it
            </button>
            <button
              type="button"
              onClick={async () => {
                setConfirmWithdrawOpen(false);
                await withdrawRequest();
              }}
              className="h-10 flex-1 rounded-full bg-[#ef6450] text-sm font-semibold text-white"
            >
              Withdraw Request
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReportModal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetUserId={peerProfileUserId || null}
        targetName={peerName}
        source="Chat"
      />

      <Dialog open={blockConfirmOpen} onOpenChange={setBlockConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {blockState === "blocked_by_me"
                ? `Unblock ${peerName}?`
                : `Block ${peerName}?`}
            </DialogTitle>
            <DialogDescription>
              {blockState === "blocked_by_me"
                ? "Allow this user to send you messages again?"
                : "You will no longer see their posts or alerts, and they won't be able to interact with you."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="!flex-row gap-2">
            <button
              type="button"
              onClick={() => setBlockConfirmOpen(false)}
              className="h-10 flex-1 rounded-full border border-border/60 bg-white text-sm font-semibold text-brandText"
              disabled={blockingUser}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!peerProfileUserId || blockingUser) return;
                setBlockingUser(true);
                try {
                  const fn = blockState === "blocked_by_me" ? "unblock_user" : "block_user";
                  const { error } = await (supabase.rpc as (fn: string, args?: Record<string, unknown>) => Promise<{ error: { message?: string } | null }>)(
                    fn,
                    { p_blocked_id: peerProfileUserId }
                  );
                  if (error) throw error;
                  toast.success(blockState === "blocked_by_me" ? "User unblocked." : "User blocked.");
                  setBlockConfirmOpen(false);
                  setBlockState((prev) => (prev === "blocked_by_me" ? "none" : "blocked_by_me"));
                } catch (error) {
                  const message = error && typeof error === "object" && "message" in error
                    ? String((error as { message?: string }).message || "")
                    : "";
                  toast.error(message || "Unable to block user right now.");
                } finally {
                  setBlockingUser(false);
                }
              }}
              className={cn(
                "h-10 flex-1 rounded-full text-sm font-semibold text-white disabled:opacity-60",
                blockState === "blocked_by_me" ? "bg-[#2145CF]" : "bg-[#ef6450]"
              )}
              disabled={blockingUser}
            >
              {blockingUser ? (blockState === "blocked_by_me" ? "Unblocking..." : "Blocking...") : (blockState === "blocked_by_me" ? "Unblock" : "Block")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ServiceChat;
