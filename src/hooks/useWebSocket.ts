import { useEffect, useRef, useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface Message {
  id: string;
  chatId: string;
  senderId: string;
  content: string;
  messageType: "text" | "image" | "voice" | "location" | "system";
  createdAt: string;
  sender?: {
    display_name: string | null;
    avatar_url: string | null;
    is_verified: boolean;
  };
}

interface TypingUser {
  id: string;
  name: string;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  sendMessage: (chatId: string, content: string, messageType?: string) => void;
  markAsRead: (chatId: string) => void;
  startTyping: (chatId: string) => void;
  stopTyping: (chatId: string) => void;
  onNewMessage: (callback: (message: Message) => void) => void;
  onTypingUpdate: (callback: (chatId: string, users: TypingUser[]) => void) => void;
  onOnlineStatus: (callback: (userId: string, isOnline: boolean) => void) => void;
  getOnlineStatus: (userIds: string[]) => void;
}

export const useWebSocket = (): UseWebSocketReturn => {
  const { session } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const messageCallbackRef = useRef<((message: Message) => void) | null>(null);
  const typingCallbackRef = useRef<((chatId: string, users: TypingUser[]) => void) | null>(null);
  const onlineCallbackRef = useRef<((userId: string, isOnline: boolean) => void) | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    if (!session?.access_token) return;

    const wsUrl = import.meta.env.VITE_WS_URL || "ws://localhost:3000";

    try {
      wsRef.current = new WebSocket(`${wsUrl}?token=${session.access_token}`);

      wsRef.current.onopen = () => {
        console.log("WebSocket connected");
        setIsConnected(true);
      };

      wsRef.current.onclose = () => {
        console.log("WebSocket disconnected");
        setIsConnected(false);

        // Attempt reconnection after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      wsRef.current.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case "new_message":
              if (messageCallbackRef.current) {
                messageCallbackRef.current(data.message);
              }
              break;

            case "typing_update":
              if (typingCallbackRef.current) {
                typingCallbackRef.current(data.chatId, data.users);
              }
              break;

            case "online_status":
              if (onlineCallbackRef.current) {
                onlineCallbackRef.current(data.userId, data.isOnline);
              }
              break;

            case "message_read":
              // Handle read receipts
              break;

            default:
              console.log("Unknown WebSocket message type:", data.type);
          }
        } catch (error) {
          console.error("Error parsing WebSocket message:", error);
        }
      };
    } catch (error) {
      console.error("Error creating WebSocket:", error);
    }
  }, [session?.access_token]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((chatId: string, content: string, messageType: string = "text") => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "send_message",
        chatId,
        content,
        messageType,
      }));
    }
  }, []);

  const markAsRead = useCallback((chatId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "mark_read",
        chatId,
      }));
    }
  }, []);

  const startTyping = useCallback((chatId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "typing_start",
        chatId,
      }));
    }
  }, []);

  const stopTyping = useCallback((chatId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "typing_stop",
        chatId,
      }));
    }
  }, []);

  const getOnlineStatus = useCallback((userIds: string[]) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: "get_online_status",
        userIds,
      }));
    }
  }, []);

  const onNewMessage = useCallback((callback: (message: Message) => void) => {
    messageCallbackRef.current = callback;
  }, []);

  const onTypingUpdate = useCallback((callback: (chatId: string, users: TypingUser[]) => void) => {
    typingCallbackRef.current = callback;
  }, []);

  const onOnlineStatus = useCallback((callback: (userId: string, isOnline: boolean) => void) => {
    onlineCallbackRef.current = callback;
  }, []);

  return {
    isConnected,
    sendMessage,
    markAsRead,
    startTyping,
    stopTyping,
    onNewMessage,
    onTypingUpdate,
    onOnlineStatus,
    getOnlineStatus,
  };
};

export default useWebSocket;
