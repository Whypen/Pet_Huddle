import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

console.log("CURRENT API URL:", import.meta.env.VITE_API_URL);

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export const useApi = () => {
  const { session } = useAuth();
  const apiUrl = import.meta.env.VITE_API_URL;

  const fetchApi = useCallback(async <T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> => {
    if (!apiUrl) {
      console.warn("[useApi] Missing VITE_API_URL. API request was skipped.");
      return {
        success: false,
        error: "Missing API URL configuration",
      };
    }

    const normalizedBaseUrl = apiUrl.replace(/\/$/, "");
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;

    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(session?.access_token && {
          Authorization: `Bearer ${session.access_token}`,
        }),
        ...options.headers,
      };

      const response = await fetch(`${normalizedBaseUrl}${normalizedEndpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
        if (response.status === 429) {
          return {
            success: false,
            error: "quota_exceeded",
            message: "Quota Exceeded",
          };
        }
        return {
          success: false,
          error: data.error || data.message || "Request failed",
        };
      }

      return {
        success: true,
        data: data.data || data,
      };
    } catch (error: any) {
      console.error("API Error:", error);
      return {
        success: false,
        error: error.message || "Network error",
      };
    }
  }, [apiUrl, session?.access_token]);

  // Chat API
  const getConversations = useCallback(() => {
    return fetchApi("/chat/conversations");
  }, [fetchApi]);

  const getMessages = useCallback((chatId: string, before?: string, limit?: number) => {
    let url = `/chat/${chatId}/messages`;
    const params = new URLSearchParams();
    if (before) params.append("before", before);
    if (limit) params.append("limit", limit.toString());
    if (params.toString()) url += `?${params.toString()}`;
    return fetchApi(url);
  }, [fetchApi]);

  const createChat = useCallback((participantIds: string[], isGroup?: boolean, name?: string) => {
    return fetchApi("/chat/create", {
      method: "POST",
      body: JSON.stringify({ participantIds, isGroup, name }),
    });
  }, [fetchApi]);

  // AI Vet API
  const createAiVetConversation = useCallback((petId?: string) => {
    if (!session?.user?.id) {
      return Promise.resolve({ success: false, error: "Missing user session" });
    }
    return fetchApi("/ai-vet/conversations", {
      method: "POST",
      body: JSON.stringify({ petId, userId: session.user.id }),
    });
  }, [fetchApi, session?.user?.id]);

  const getAiVetConversations = useCallback(() => {
    return fetchApi("/ai-vet/conversations");
  }, [fetchApi]);

  const getAiVetConversation = useCallback((conversationId: string) => {
    return fetchApi(`/ai-vet/conversations/${conversationId}`);
  }, [fetchApi]);

  const sendAiVetMessage = useCallback((
    conversationId: string,
    message: string,
    petId?: string,
    petProfile?: { name: string; species: string; breed?: string | null; weight?: number | null; weight_unit?: string | null }
  ) => {
    if (!session?.user?.id) {
      return Promise.resolve({ success: false, error: "Missing user session" });
    }
    return fetchApi("/ai-vet/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId, message, petId, petProfile, userId: session.user.id }),
    });
  }, [fetchApi, session?.user?.id]);

  const getAiVetUsage = useCallback(() => {
    if (!session?.user?.id) {
      return Promise.resolve({ success: false, error: "Missing user session" });
    }
    return fetchApi(`/ai-vet/usage?userId=${session.user.id}`);
  }, [fetchApi, session?.user?.id]);

  // Social API
  const getNearbyUsers = useCallback((lat: number, lng: number, radius?: number) => {
    return fetchApi(`/social/nearby?lat=${lat}&lng=${lng}&radius=${radius || 10}`);
  }, [fetchApi]);

  const sendWave = useCallback((targetUserId: string, message?: string) => {
    return fetchApi("/social/waves", {
      method: "POST",
      body: JSON.stringify({ targetUserId, message }),
    });
  }, [fetchApi]);

  const getWaves = useCallback(() => {
    return fetchApi("/social/waves");
  }, [fetchApi]);

  const respondToWave = useCallback((waveId: string, action: "accept" | "reject") => {
    return fetchApi(`/social/waves/${waveId}`, {
      method: "PATCH",
      body: JSON.stringify({ action }),
    });
  }, [fetchApi]);

  // Founder Message API
  const getFounderMessage = useCallback(() => {
    return fetchApi("/founder-message");
  }, [fetchApi]);

  // Subscription API
  const createCheckoutSession = useCallback((planType: "monthly" | "yearly") => {
    return fetchApi("/subscription/create-checkout", {
      method: "POST",
      body: JSON.stringify({ planType }),
    });
  }, [fetchApi]);

  return {
    fetchApi,
    // Chat
    getConversations,
    getMessages,
    createChat,
    // AI Vet
    createAiVetConversation,
    getAiVetConversations,
    getAiVetConversation,
    sendAiVetMessage,
    getAiVetUsage,
    // Social
    getNearbyUsers,
    sendWave,
    getWaves,
    respondToWave,
    // Founder Message
    getFounderMessage,
    // Subscription
    createCheckoutSession,
  };
};

export default useApi;
