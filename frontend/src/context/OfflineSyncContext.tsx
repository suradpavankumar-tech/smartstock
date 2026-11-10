import React, { createContext, useContext, useState, useEffect } from "react";
import { api } from "../services/api";

export interface QueueItem {
  client_uuid: string;
  action_type: string;
  payload: any;
  created_at_client: string;
}

interface OfflineSyncContextType {
  isOnline: boolean;
  pendingCount: number;
  queue: QueueItem[];
  enqueueAction: (action_type: string, payload: any) => Promise<string>;
  triggerSync: () => Promise<{ processed: number; skipped: number; failed: number }>;
  syncNow: () => Promise<any>;
  isSyncing: boolean;
}

const OfflineSyncContext = createContext<OfflineSyncContextType>({
  isOnline: true,
  pendingCount: 0,
  queue: [],
  enqueueAction: async () => "",
  triggerSync: async () => ({ processed: 0, skipped: 0, failed: 0 }),
  syncNow: async () => ({ processed: 0, skipped: 0, failed: 0 }),
  isSyncing: false,
});

export const OfflineSyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [queue, setQueue] = useState<QueueItem[]>(() => {
    try {
      const stored = localStorage.getItem("smartstock_offline_queue");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [queue]);

  const saveQueue = (newQueue: QueueItem[]) => {
    setQueue(newQueue);
    localStorage.setItem("smartstock_offline_queue", JSON.stringify(newQueue));
  };

  const enqueueAction = async (action_type: string, payload: any): Promise<string> => {
    const client_uuid = "client-" + Math.random().toString(36).substring(2, 11) + "-" + Date.now();
    const item: QueueItem = {
      client_uuid,
      action_type,
      payload,
      created_at_client: new Date().toISOString(),
    };
    const updated = [...queue, item];
    saveQueue(updated);

    // If online, attempt to sync immediately
    if (isOnline) {
      setTimeout(() => triggerSync(), 100);
    }
    return client_uuid;
  };

  const triggerSync = async (): Promise<{ processed: number; skipped: number; failed: number }> => {
    if (queue.length === 0 || isSyncing) {
      return { processed: 0, skipped: 0, failed: 0 };
    }

    setIsSyncing(true);
    try {
      const res = await api.pushSyncQueue(queue);
      // Clear processed or skipped items from queue
      const failedUuids = new Set(
        res.results.filter((r: any) => r.status === "FAILED").map((r: any) => r.client_uuid)
      );
      const remaining = queue.filter((item) => failedUuids.has(item.client_uuid));
      saveQueue(remaining);

      return {
        processed: res.processed_count,
        skipped: res.skipped_count,
        failed: res.failed_count,
      };
    } catch (err) {
      console.error("Sync error:", err);
      return { processed: 0, skipped: 0, failed: queue.length };
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <OfflineSyncContext.Provider
      value={{
        isOnline,
        pendingCount: queue.length,
        queue,
        enqueueAction,
        triggerSync,
        syncNow: triggerSync,
        isSyncing,
      }}
    >
      {children}
    </OfflineSyncContext.Provider>
  );
};

export const useOfflineSync = () => useContext(OfflineSyncContext);
