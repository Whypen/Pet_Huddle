import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type {
  ChatMessageRow,
  ServiceChatRow,
  ServiceCounterpart,
  ServiceQuoteCard,
  ServiceRequestCard,
  ServiceRole,
} from "@/components/service-chat/types";

type UseServiceChatResult = {
  serviceChat: ServiceChatRow | null;
  messages: ChatMessageRow[];
  readMessageIds: Set<string>;
  hasOlderMessages: boolean;
  loadingOlderMessages: boolean;
  counterpart: ServiceCounterpart | null;
  role: ServiceRole | null;
  loading: boolean;
  roomResolved: boolean;
  sending: boolean;
  canMarkFinished: boolean;
  canDispute: boolean;
  hasReviewed: boolean;
  providerStripeReady: boolean;
  reload: (silent?: boolean) => Promise<void>;
  loadOlderMessages: () => Promise<void>;
  sendMessage: (
    text: string,
    attachments?: Array<{ url: string; mime: string; name: string }>,
    options?: { linkPreviewUrl?: string | null }
  ) => Promise<void>;
  sendRequest: (card: ServiceRequestCard) => Promise<void>;
  withdrawRequest: () => Promise<void>;
  sendQuote: (card: ServiceQuoteCard) => Promise<void>;
  withdrawQuote: () => Promise<void>;
  startService: () => Promise<void>;
  markFinished: () => Promise<void>;
  fileDispute: (category: string, description: string, evidenceUrls: string[]) => Promise<void>;
  submitReview: (rating: number, tags: string[], text: string) => Promise<void>;
};

const asMessage = (message: string | undefined, fallback: string) => {
  const normalized = String(message || "").trim();
  return normalized || fallback;
};

const INITIAL_MESSAGE_PAGE_SIZE = 10;
const OLDER_MESSAGE_PAGE_SIZE = 20;
const MESSAGE_FETCH_RETRY_COUNT = 3;
const MESSAGE_FETCH_RETRY_DELAY_MS = 350;

const isTransientMessageLoadError = (error: unknown) => {
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message || "").toLowerCase()
      : String(error || "").toLowerCase();
  return (
    message.includes("fetch") ||
    message.includes("network") ||
    message.includes("connection") ||
    message.includes("closed") ||
    message.includes("timed out")
  );
};

const isAbortLikeError = (error: unknown) => {
  const name =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name || "").toLowerCase()
      : "";
  const message =
    error && typeof error === "object" && "message" in error
      ? String((error as { message?: unknown }).message || "").toLowerCase()
      : String(error || "").toLowerCase();
  return (
    name === "aborterror" ||
    message.includes("aborterror") ||
    message.includes("signal is aborted") ||
    message.includes("aborted")
  );
};

const shouldRefreshServiceStatus = (status: string | null | undefined) => {
  return status === "pending" || status === "quoted" || status === "booked" || status === "in_progress";
};

const delay = async (ms: number) => {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
};

export const useServiceChat = (roomId: string, userId: string): UseServiceChatResult => {
  const [serviceChat, setServiceChat] = useState<ServiceChatRow | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set());
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const [counterpart, setCounterpart] = useState<ServiceCounterpart | null>(null);
  const [loading, setLoading] = useState(true);
  const [roomResolved, setRoomResolved] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const hasLoadedRef = useRef(false);
  const reloadInFlightRef = useRef(false);
  const refreshMetaPromiseRef = useRef<Promise<ServiceChatRow | null> | null>(null);
  const messagesRef = useRef<ChatMessageRow[]>([]);
  const loadErrorToastRef = useRef<string | null>(null);

  const role: ServiceRole | null = useMemo(() => {
    if (!serviceChat || !userId) return null;
    if (serviceChat.requester_id === userId) return "requester";
    if (serviceChat.provider_id === userId) return "provider";
    return null;
  }, [serviceChat, userId]);

  const providerStripeReady = Boolean(counterpart?.stripePayoutStatus === "complete" && counterpart?.stripeAccountId);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  const markMessagesRead = useCallback(
    async (roomMessages: ChatMessageRow[]) => {
      if (!userId || roomMessages.length === 0) return;

      const incomingIds = roomMessages
        .filter((message) => message.sender_id && message.sender_id !== userId)
        .map((message) => message.id)
        .filter(Boolean);

      if (incomingIds.length === 0) return;

      const { data: existingReads, error: readsError } = await supabase
        .from("message_reads")
        .select("message_id")
        .eq("user_id", userId)
        .in("message_id", incomingIds);

      if (readsError) {
        console.warn("[service_chat.mark_read.load_failed]", readsError.message);
        return;
      }

      const existingSet = new Set(
        ((existingReads || []) as Array<{ message_id?: string | null }>)
          .map((row) => String(row?.message_id || ""))
          .filter(Boolean)
      );

      const missingRows = incomingIds
        .filter((messageId) => !existingSet.has(messageId))
        .map((messageId) => ({
          message_id: messageId,
          user_id: userId,
          read_at: new Date().toISOString(),
        }));

      if (missingRows.length === 0) return;

      const { error: upsertError } = await supabase
        .from("message_reads")
        .upsert(missingRows, { onConflict: "message_id,user_id" });

      if (upsertError) {
        console.warn("[service_chat.mark_read.upsert_failed]", upsertError.message);
      }
    },
    [userId]
  );

  const refreshReadReceipts = useCallback(
    async (roomMessages?: ChatMessageRow[]) => {
      if (!roomId || !userId) return;
      const sourceRows = roomMessages || messagesRef.current;
      if (sourceRows.length === 0) {
        setReadMessageIds(new Set());
        return;
      }
      const myMessageIds = sourceRows
        .filter((message) => message.sender_id === userId)
        .map((message) => message.id)
        .filter(Boolean);
      if (myMessageIds.length === 0) {
        setReadMessageIds(new Set());
        return;
      }
      const { data, error } = await supabase
        .from("message_reads")
        .select("message_id")
        .in("message_id", myMessageIds)
        .neq("user_id", userId);
      if (error) {
        console.warn("[service_chat.read_receipts_failed]", error.message);
        return;
      }
      setReadMessageIds(new Set(((data || []) as Array<{ message_id?: string | null }>).map((row) => String(row.message_id || "")).filter(Boolean)));
    },
    [roomId, userId]
  );

  const canDispute = useMemo(() => {
    if (!serviceChat) return false;
    if (serviceChat.status === "booked" || serviceChat.status === "in_progress") return true;
    if (serviceChat.status !== "completed" || !serviceChat.completed_at) return false;
    const completedAt = new Date(serviceChat.completed_at).getTime();
    if (!Number.isFinite(completedAt)) return false;
    return Date.now() - completedAt <= 48 * 60 * 60 * 1000;
  }, [serviceChat]);

  const canMarkFinished = useMemo(() => {
    if (!serviceChat || !role) return false;
    if (!(serviceChat.status === "booked" || serviceChat.status === "in_progress")) return false;
    if (role === "requester" && serviceChat.requester_mark_finished) return false;
    if (role === "provider" && serviceChat.provider_mark_finished) return false;
    const request = serviceChat.request_card;
    if (!request) return true;
    const requestedDates = Array.isArray(request.requestedDates) ? request.requestedDates : [];
    const firstDate = requestedDates.length > 0 ? [...requestedDates].sort()[0] : String(request.requestedDate || "");
    const endTime = String(request.endTime || "");
    if (!firstDate || !endTime) return true;
    const endAt = new Date(`${firstDate}T${endTime}:00`).getTime();
    if (!Number.isFinite(endAt)) return true;
    return Date.now() >= endAt;
  }, [role, serviceChat]);

  const refreshServiceMeta = useCallback(
    async (options?: { allowStatusRefresh?: boolean }) => {
      if (!roomId || !userId) return null;
      if (refreshMetaPromiseRef.current) {
        return refreshMetaPromiseRef.current;
      }

      const promise = (async () => {
        const loadServiceRow = async () => {
          const { data, error } = await supabase
            .from("service_chats")
            .select(
              "chat_id,requester_id,provider_id,status,request_card,quote_card,request_sent_at,quote_sent_at,booked_at,in_progress_at,completed_at,disputed_at,requester_mark_finished,provider_mark_finished"
            )
            .eq("chat_id", roomId)
            .maybeSingle();
          if (error) throw new Error(asMessage(error.message, "service_chat_load_failed"));
          if (!data) throw new Error("service_chat_not_found");
          return data as unknown as ServiceChatRow;
        };

        let row = await loadServiceRow();

        if ((options?.allowStatusRefresh ?? true) && shouldRefreshServiceStatus(row.status)) {
          const { error: refreshError } = await supabase.rpc("refresh_service_chat_status", { p_chat_id: roomId });
          if (refreshError && !isAbortLikeError(refreshError)) {
            console.warn("[service_chat.refresh_status_failed]", refreshError.message);
          }
          if (!refreshError) {
            row = await loadServiceRow();
          }
        }

        setServiceChat(row);

        if (row.status === "completed" && row.requester_id === userId) {
          const { data: reviewRow } = await supabase
            .from("service_reviews")
            .select("id")
            .eq("service_chat_id", row.chat_id)
            .eq("reviewer_id", userId)
            .maybeSingle();
          setHasReviewed(Boolean(reviewRow?.id));
        } else {
          setHasReviewed(false);
        }

        return row;
      })();

      refreshMetaPromiseRef.current = promise;
      try {
        return await promise;
      } finally {
        if (refreshMetaPromiseRef.current === promise) {
          refreshMetaPromiseRef.current = null;
        }
      }
    },
    [roomId, userId]
  );

  const loadLatestMessages = useCallback(async () => {
    let attempt = 0;
    while (attempt < MESSAGE_FETCH_RETRY_COUNT) {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id,sender_id,content,created_at")
        .eq("chat_id", roomId)
        .order("created_at", { ascending: false })
        .limit(INITIAL_MESSAGE_PAGE_SIZE + 1);

      if (!error) {
        return ((data || []) as ChatMessageRow[]).filter(Boolean);
      }

      attempt += 1;
      if (attempt >= MESSAGE_FETCH_RETRY_COUNT || !isTransientMessageLoadError(error)) {
        throw error;
      }
      await delay(MESSAGE_FETCH_RETRY_DELAY_MS * attempt);
    }
    return [];
  }, [roomId]);

  const reload = useCallback(
    async (silent = false) => {
      if (!roomId) {
        setLoading(false);
        setRoomResolved(true);
        hasLoadedRef.current = false;
        setServiceChat(null);
        setMessages([]);
        setReadMessageIds(new Set());
        setHasOlderMessages(false);
        setCounterpart(null);
        setHasReviewed(false);
        return;
      }
      if (!userId) {
        setRoomResolved(false);
        return;
      }
      if (reloadInFlightRef.current) return;
      reloadInFlightRef.current = true;
      const shouldShowLoading = !silent || !hasLoadedRef.current;
      if (shouldShowLoading) setLoading(true);
      try {
        const row = await refreshServiceMeta({ allowStatusRefresh: true });
        if (!row) throw new Error("service_chat_not_found");
        let newestFirstMessages: ChatMessageRow[] = [];
        try {
          newestFirstMessages = await loadLatestMessages();
        } catch (messageError) {
          console.warn("[service_chat.initial_messages_failed]", messageError);
          toast.error("Unable to load the latest messages right now. Retrying the room data can help.");
        }
        const nextMessages = newestFirstMessages
          .slice(0, INITIAL_MESSAGE_PAGE_SIZE)
          .reverse();
        setHasOlderMessages(newestFirstMessages.length > INITIAL_MESSAGE_PAGE_SIZE);
        setMessages(nextMessages);
        void markMessagesRead(nextMessages);
        void refreshReadReceipts(nextMessages);

        const counterpartId = row.requester_id === userId ? row.provider_id : row.requester_id;
        if (counterpartId) {
          const [{ data: publicProfile }, { data: profileRow }, { data: pcpRow }] = await Promise.all([
            supabase
              .from("profiles_public")
              .select("id,display_name,avatar_url,is_verified")
              .eq("id", counterpartId)
              .maybeSingle(),
            supabase
              .from("profiles")
              .select("id,display_name,avatar_url,is_verified")
              .eq("id", counterpartId)
              .maybeSingle(),
            supabase
              .from("pet_care_profiles")
              .select("stripe_payout_status,stripe_account_id")
              .eq("user_id", counterpartId)
              .maybeSingle(),
          ]);
          const merged = (publicProfile || profileRow || {}) as Record<string, unknown>;
          setCounterpart({
            id: counterpartId,
            displayName: String(merged.display_name || "Service chat"),
            avatarUrl: (merged.avatar_url as string | null) || null,
            isVerified: merged.is_verified === true,
            stripePayoutStatus: String((pcpRow as Record<string, unknown> | null)?.stripe_payout_status || "") || null,
            stripeAccountId: String((pcpRow as Record<string, unknown> | null)?.stripe_account_id || "") || null,
          });
        } else {
          setCounterpart(null);
        }

        hasLoadedRef.current = true;
        loadErrorToastRef.current = null;
        setRoomResolved(true);
      } catch (error) {
        setRoomResolved(true);
        const message = String((error as { message?: string })?.message || "").includes("not_found")
          ? "Service chat not found."
          : "Unable to load service chat.";
        if (loadErrorToastRef.current !== `${roomId}:${message}`) {
          loadErrorToastRef.current = `${roomId}:${message}`;
          toast.error(message);
        }
      } finally {
        reloadInFlightRef.current = false;
        if (shouldShowLoading) setLoading(false);
      }
    },
    [loadLatestMessages, markMessagesRead, refreshReadReceipts, refreshServiceMeta, roomId, userId]
  );

  useEffect(() => {
    hasLoadedRef.current = false;
    reloadInFlightRef.current = false;
    refreshMetaPromiseRef.current = null;
    loadErrorToastRef.current = null;
    if (!roomId) {
      setLoading(false);
      setRoomResolved(true);
      setServiceChat(null);
      setMessages([]);
      setReadMessageIds(new Set());
      setCounterpart(null);
      setHasReviewed(false);
      return;
    }
    if (!userId) {
        setServiceChat(null);
        setMessages([]);
        setReadMessageIds(new Set());
        setHasOlderMessages(false);
        setCounterpart(null);
        setHasReviewed(false);
        setRoomResolved(false);
      setLoading(true);
      return;
    }
    setServiceChat(null);
    setMessages([]);
    setReadMessageIds(new Set());
    setHasOlderMessages(false);
    setCounterpart(null);
    setHasReviewed(false);
    setRoomResolved(false);
    setLoading(true);
    void reload(false);
  }, [reload, roomId, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;
    const roomChannel = supabase
      .channel(`service_chat_room_${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `chat_id=eq.${roomId}` },
        (payload) => {
          const row = payload.new as ChatMessageRow | null;
          if (!row?.id) return;
          setMessages((prev) => {
            if (prev.some((message) => message.id === row.id)) return prev;
            const next = [...prev, row];
            if (prev.length >= INITIAL_MESSAGE_PAGE_SIZE && !hasOlderMessages) {
              setHasOlderMessages(true);
            }
            return next;
          });
          if (row.sender_id && row.sender_id !== userId) {
            void markMessagesRead([row]);
          }
          try {
            const parsed = JSON.parse(row.content) as { kind?: string } | null;
            if (parsed?.kind?.startsWith("service_")) {
              void refreshServiceMeta({ allowStatusRefresh: true });
            }
          } catch {
            // plain text / share payloads
          }
          void refreshReadReceipts();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(roomChannel);
    };
  }, [hasOlderMessages, markMessagesRead, refreshReadReceipts, refreshServiceMeta, roomId, userId]);

  useEffect(() => {
    if (!roomId || !userId) return;
    const readChannel = supabase
      .channel(`service_chat_reads_${roomId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "message_reads" }, (payload) => {
        const row = payload.new as { message_id?: string | null; user_id?: string | null } | null;
        if (!row?.message_id || row.user_id === userId) return;
        setReadMessageIds((prev) => {
          if (prev.has(String(row.message_id))) return prev;
          return new Set([...prev, String(row.message_id)]);
        });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(readChannel);
    };
  }, [roomId, userId]);

  useEffect(() => {
    if (!roomId) return;
    const tick = window.setInterval(() => {
      if (!serviceChat) return;
      void refreshServiceMeta({ allowStatusRefresh: true });
    }, 8000);
    return () => window.clearInterval(tick);
  }, [refreshServiceMeta, roomId, serviceChat]);

  const loadOlderMessages = useCallback(async () => {
    if (!roomId || loading || loadingOlderMessages || !hasOlderMessages || messages.length === 0) return;
    const oldestLoadedMessage = messages[0];
    const oldestCreatedAt = String(oldestLoadedMessage?.created_at || "").trim();
    if (!oldestCreatedAt) return;

    setLoadingOlderMessages(true);
    try {
      const { data, error } = await supabase
        .from("chat_messages")
        .select("id,sender_id,content,created_at")
        .eq("chat_id", roomId)
        .lt("created_at", oldestCreatedAt)
        .order("created_at", { ascending: false })
        .limit(OLDER_MESSAGE_PAGE_SIZE + 1);
      if (error) throw error;

      const olderRows = ((data || []) as ChatMessageRow[]).filter(Boolean);
      const nextChunk = olderRows.slice(0, OLDER_MESSAGE_PAGE_SIZE).reverse();
      setHasOlderMessages(olderRows.length > OLDER_MESSAGE_PAGE_SIZE);
      if (nextChunk.length === 0) return;
      setMessages((prev) => {
        const seen = new Set(prev.map((message) => message.id));
        const dedupedChunk = nextChunk.filter((message) => !seen.has(message.id));
        return dedupedChunk.length > 0 ? [...dedupedChunk, ...prev] : prev;
      });
      void refreshReadReceipts();
    } catch (error) {
      console.warn("[service_chat.load_older_failed]", asMessage((error as { message?: string })?.message, "load_older_failed"));
    } finally {
      setLoadingOlderMessages(false);
    }
  }, [hasOlderMessages, loading, loadingOlderMessages, messages, refreshReadReceipts, roomId]);

  const sendMessage = useCallback(
    async (
      text: string,
      attachments?: Array<{ url: string; mime: string; name: string }>,
      options?: { linkPreviewUrl?: string | null }
    ) => {
      if (!roomId || !userId || (!text.trim() && !(attachments && attachments.length > 0) && !options?.linkPreviewUrl)) return;
      setSending(true);
      try {
        const content = text.trim();
        const payload: Record<string, unknown> = { text: content };
        if (options?.linkPreviewUrl) {
          payload.linkPreviewUrl = options.linkPreviewUrl;
        }
        if (attachments && attachments.length > 0) {
          payload.attachments = attachments;
        }
        const { error } = await supabase.from("chat_messages").insert({
          chat_id: roomId,
          sender_id: userId,
          content: JSON.stringify(payload),
        });
        if (error) throw error;
        await supabase.from("chats").update({ last_message_at: new Date().toISOString() }).eq("id", roomId);
      } catch (error) {
        toast.error(asMessage((error as { message?: string })?.message, "Unable to send message."));
      } finally {
        setSending(false);
      }
    },
    [roomId, userId]
  );

  const rpcVoid = useCallback(
    async (fn: string, params: Record<string, unknown>, fallback: string) => {
      setSending(true);
      try {
        const { error } = await supabase.rpc(fn, params);
        if (error) throw error;
        await reload(true);
      } catch (error) {
        toast.error(asMessage((error as { message?: string })?.message, fallback));
        throw error;
      } finally {
        setSending(false);
      }
    },
    [reload]
  );

  const sendRequest = useCallback(
    async (card: ServiceRequestCard) => {
      await rpcVoid("send_service_request", { p_chat_id: roomId, p_request_card: card }, "Unable to send request.");
    },
    [roomId, rpcVoid]
  );

  const withdrawRequest = useCallback(async () => {
    await rpcVoid("withdraw_service_request", { p_chat_id: roomId }, "Unable to withdraw request.");
  }, [roomId, rpcVoid]);

  const sendQuote = useCallback(
    async (card: ServiceQuoteCard) => {
      await rpcVoid("send_service_quote", { p_chat_id: roomId, p_quote_card: card }, "Unable to send quote.");
    },
    [roomId, rpcVoid]
  );

  const withdrawQuote = useCallback(async () => {
    await rpcVoid("withdraw_service_quote", { p_chat_id: roomId }, "Unable to withdraw quote.");
  }, [roomId, rpcVoid]);

  const startService = useCallback(async () => {
    if (!roomId) return;
    setSending(true);
    try {
      const { error } = await supabase.rpc("start_service_now", { p_chat_id: roomId });
      if (error) {
        const missingStartNow = String(error.message || "").toLowerCase().includes("start_service_now");
        if (!missingStartNow) throw error;
        const { error: fallbackErr } = await supabase.rpc("start_service", { p_chat_id: roomId });
        if (fallbackErr) throw fallbackErr;
      }
      await reload(true);
      toast.success("Service started.");
    } catch (error) {
      toast.error(asMessage((error as { message?: string })?.message, "Unable to start service."));
      throw error;
    } finally {
      setSending(false);
    }
  }, [reload, roomId]);

  const markFinished = useCallback(async () => {
    if (!roomId) return;
    await rpcVoid("mark_service_finished", { p_chat_id: roomId }, "Unable to mark finished.");
  }, [roomId, rpcVoid]);

  const fileDispute = useCallback(
    async (category: string, description: string, evidenceUrls: string[]) => {
      await rpcVoid(
        "file_service_dispute",
        {
          p_chat_id: roomId,
          p_category: category,
          p_description: description,
          p_evidence_urls: evidenceUrls || [],
        },
        "Unable to submit dispute."
      );
    },
    [roomId, rpcVoid]
  );

  const submitReview = useCallback(
    async (rating: number, tags: string[], text: string) => {
      await rpcVoid(
        "submit_service_review",
        {
          p_chat_id: roomId,
          p_rating: rating,
          p_tags: tags || [],
          p_review_text: text.trim(),
        },
        "Unable to submit review."
      );
      setHasReviewed(true);
    },
    [roomId, rpcVoid]
  );

  return {
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
  };
};
