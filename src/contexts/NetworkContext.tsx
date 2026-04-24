import { createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode } from "react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { buildScopedStorageKey, normalizeStorageOwner } from "@/lib/signupOnboarding";

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
  data: unknown;
  timestamp: Date;
  retryCount: number;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL;
const PING_INTERVAL = 30000; // 30 seconds
const MAX_RETRY_COUNT = 3;
const OFFLINE_ACTIONS_KEY = "huddle_offline_actions";

export const NetworkProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useLanguage();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const [lastOnlineTime, setLastOnlineTime] = useState<Date | null>(null);
  const [pendingActions, setPendingActions] = useState<OfflineAction[]>([]);
  const [hasShownOfflineToast, setHasShownOfflineToast] = useState(false);
  const [storageOwner, setStorageOwner] = useState<string>("anon");
  const offlineActionsKey = buildScopedStorageKey(OFFLINE_ACTIONS_KEY, storageOwner);

  useEffect(() => {
    let mounted = true;
    const hydrateOwner = async () => {
      const { data } = await supabase.auth.getSession();
      const owner = normalizeStorageOwner(data.session?.user?.id || "anon");
      if (mounted) setStorageOwner(owner || "anon");
    };
    void hydrateOwner();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const owner = normalizeStorageOwner(session?.user?.id || "anon");
      setStorageOwner(owner || "anon");
      if (!session?.user?.id) {
        setPendingActions([]);
      }
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  // Load pending actions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(offlineActionsKey);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          const next = parsed.map((action): OfflineAction => {
            const rec = (typeof action === "object" && action !== null) ? (action as Record<string, unknown>) : {};
            const id = typeof rec.id === "string" ? rec.id : crypto.randomUUID();
            const type = typeof rec.type === "string" ? rec.type : "unknown";
            const retryCount = typeof rec.retryCount === "number" ? rec.retryCount : 0;
            const timestampRaw = rec.timestamp;
            const timestamp =
              typeof timestampRaw === "string" || timestampRaw instanceof Date
                ? new Date(timestampRaw)
                : new Date();
            return {
              id,
              type,
              data: rec.data,
              timestamp,
              retryCount,
            };
          });
          setPendingActions(next);
        } else {
          setPendingActions([]);
        }
      } else {
        setPendingActions([]);
      }
    } catch (error) {
      console.error("Failed to load offline actions:", error);
      setPendingActions([]);
    }
  }, [offlineActionsKey]);

  // Save pending actions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(offlineActionsKey, JSON.stringify(pendingActions));
    } catch (error) {
      console.error("Failed to save offline actions:", error);
    }
  }, [offlineActionsKey, pendingActions, t]);

  // Health check: prefer Supabase Functions client so anon/auth headers are attached consistently.
  const checkServerHealth = useCallback(async (): Promise<boolean> => {
    if (!API_URL) {
      return true;
    }
    try {
      const { error } = await supabase.functions.invoke("health-check", {
        body: { ping: true },
      });
      if (!error) return true;
      const status = Number((error as { context?: { status?: number } })?.context?.status || 0);
      // 401 still means edge runtime is reachable.
      if (status === 401) return true;
      return false;
    } catch {
      return false;
    }
  }, []);

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

  // Retry connection
  const retryConnection = useCallback(async () => {
    const serverOk = await checkServerHealth();
    setIsServerReachable(serverOk);

    if (serverOk && isOnline) {
      setLastOnlineTime(new Date());
      toast.success(t("Connection restored!"));

      // Process pending offline actions
      if (pendingActions.length > 0) {
        processPendingActions();
      }
    }
  }, [checkServerHealth, isOnline, pendingActions, processPendingActions, t]);

  // Replay a single offline action
  const replayAction = async (action: OfflineAction): Promise<boolean> => {
    try {
      if (!API_URL) {
        console.warn("[NetworkContext] Missing VITE_API_URL. Offline action replay skipped.");
        return false;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token || "";
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
    toast.info(t("Action saved. Will sync when online."));
  }, [t]);

  // Handle online/offline events
  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setHasShownOfflineToast(false);
      toast.success(t("You're back online!"));
      retryConnection();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setIsServerReachable(false);
      if (!hasShownOfflineToast) {
        toast.error(t("You're offline. Some features may be limited."));
        setHasShownOfflineToast(true);
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [retryConnection, hasShownOfflineToast, t]);

  // Periodic server health check
  useEffect(() => {
    if (!isOnline) return;

 const checkHealth = async () => {
      // Force reachability true for cloud-backed environments.
      setIsServerReachable(true);
    };

    // Initial check on mount
    checkHealth();

    // Set up polling interval
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [isOnline, checkServerHealth, hasShownOfflineToast]);

  // Update lastOnlineTime when connected
  useEffect(() => {
    if (isOnline && isServerReachable) {
      setLastOnlineTime(new Date());
    }
  }, [isOnline, isServerReachable]);

  const contextValue = useMemo(() => ({
    isOnline,
    isServerReachable,
    lastOnlineTime,
    retryConnection,
    addOfflineAction,
    pendingActions,
  }), [isOnline, isServerReachable, lastOnlineTime, retryConnection, addOfflineAction, pendingActions]);

  return (
    <NetworkContext.Provider value={contextValue}>
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
