import { useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export const useApi = () => {
  const { session } = useAuth();

  const fetchApi = useCallback(async <T = any>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> => {
    try {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(session?.access_token && {
          Authorization: `Bearer ${session.access_token}`,
        }),
        ...options.headers,
      };

      const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers,
      });

      const data = await response.json();

      if (!response.ok) {
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
  }, [session?.access_token]);

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
    return fetchApi("/ai-vet/conversations", {
      method: "POST",
      body: JSON.stringify({ petId }),
    });
  }, [fetchApi]);

  const getAiVetConversations = useCallback(() => {
    return fetchApi("/ai-vet/conversations");
  }, [fetchApi]);

  const getAiVetConversation = useCallback((conversationId: string) => {
    return fetchApi(`/ai-vet/conversations/${conversationId}`);
  }, [fetchApi]);

  const sendAiVetMessage = useCallback((conversationId: string, message: string, petId?: string) => {
    return fetchApi("/ai-vet/chat", {
      method: "POST",
      body: JSON.stringify({ conversationId, message, petId }),
    });
  }, [fetchApi]);

  const getAiVetUsage = useCallback(() => {
    return fetchApi("/ai-vet/usage");
  }, [fetchApi]);

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
