import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { toast } from "sonner";

interface NetworkContextType {
  isOnline: boolean;
  isServerReachable: boolean;
  lastOnlineTime: Date | null;
  retryConnection: () => Promise<void>;
  addOfflineAction: (action: OfflineAction) => void;
  pendingActions: OfflineAction[];
}

interface OfflineAction {
  id: string;
  type: string;
  data: any;
  timestamp: Date;
  retryCount: number;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || "/api/v1";
const PING_INTERVAL = 30000; // 30 seconds
const MAX_RETRY_COUNT = 3;
const OFFLINE_ACTIONS_KEY = "huddle_offline_actions";

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [lastOnlineTime, setLastOnlineTime] = useState<Date | null>(null);
  const [pendingActions, setPendingActions] = useState<OfflineAction[]>([]);
  const [hasShownOfflineToast, setHasShownOfflineToast] = useState(false);

  // Load pending actions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(OFFLINE_ACTIONS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPendingActions(parsed.map((action: any) => ({
          ...action,
          timestamp: new Date(action.timestamp)
        })));
      }
    } catch (error) {
      console.error("Failed to load offline actions:", error);
    }
  }, []);

  // Save pending actions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(OFFLINE_ACTIONS_KEY, JSON.stringify(pendingActions));
    } catch (error) {
      console.error("Failed to save offline actions:", error);
    }
  }, [pendingActions]);

  // Retry connection - sync pending actions when coming back online
  const retryConnection = useCallback(async () => {
    setIsServerReachable(true);
    setLastOnlineTime(new Date());
    toast.success("Connection restored!");

    // Process pending offline actions
    if (pendingActions.length > 0) {
      processPendingActions();
    }
  }, [pendingActions]);

  // Process pending offline actions
  const processPendingActions = useCallback(async () => {
    const actionsToProcess = [...pendingActions];
    const failedActions: OfflineAction[] = [];

    for (const action of actionsToProcess) {
      try {
        // Attempt to replay the action based on its type
        const success = await replayAction(action);
        if (!success && action.retryCount < MAX_RETRY_COUNT) {
          failedActions.push({
            ...action,
            retryCount: action.retryCount + 1
          });
        }
      } catch (error) {
        if (action.retryCount < MAX_RETRY_COUNT) {
          failedActions.push({
            ...action,
            retryCount: action.retryCount + 1
          });
        }
      }
    }

    setPendingActions(failedActions);

    if (actionsToProcess.length > 0 && failedActions.length === 0) {
      toast.success(`Synced ${actionsToProcess.length} pending action(s)`);
    } else if (failedActions.length > 0) {
      toast.warning(`${failedActions.length} action(s) still pending`);
    }
  }, [pendingActions]);

  // Replay a single offline action
  const replayAction = async (action: OfflineAction): Promise<boolean> => {
    try {
      const token = localStorage.getItem("auth_token");
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      let endpoint = "";
      let method = "POST";

      switch (action.type) {
        case "send_message":
          endpoint = `/chat/messages`;
          break;
        case "update_profile":
          endpoint = `/users/profile`;
          method = "PATCH";
          break;
        case "send_wave":
          endpoint = `/social/waves`;
          break;
        case "ai_vet_message":
          endpoint = `/ai-vet/message`;
          break;
        default:
          console.warn(`Unknown action type: ${action.type}`);
          return false;
      }

      const response = await fetch(`${API_URL}${endpoint}`, {
        method,
        headers,
        body: JSON.stringify(action.data),
      });

      return response.ok;
    } catch (error) {
      console.error("Failed to replay action:", error);
      return false;
    }
  };

  // Add an action to the offline queue
  const addOfflineAction = useCallback((action: Omit<OfflineAction, "id" | "timestamp" | "retryCount">) => {
    const newAction: OfflineAction = {
      ...action,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      retryCount: 0,
    };

    setPendingActions(prev => [...prev, newAction]);
    toast.info("Action saved. Will sync when online.");
  }, []);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setHasShownOfflineToast(false);
      toast.success("You're back online!");
      retryConnection();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsServerReachable(false);
      if (!hasShownOfflineToast) {
        toast.error("You're offline. Some features may be limited.");
        setHasShownOfflineToast(true);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [retryConnection, hasShownOfflineToast]);


  // Update lastOnlineTime when connected
  useEffect(() => {
    if (isOnline && isServerReachable) {
      setLastOnlineTime(new Date());
    }
  }, [isOnline, isServerReachable]);

  return (
    <NetworkContext.Provider
      value={{
        isOnline,
        isServerReachable,
        lastOnlineTime,
        retryConnection,
        addOfflineAction,
        pendingActions,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
};

export const useNetwork = (): NetworkContextType => {
  const context = useContext(NetworkContext);
  if (!context) {
    throw new Error("useNetwork must be used within a NetworkProvider");
  }
  return context;
};

export default NetworkContext;
