"use client";

import { useState, useEffect, useCallback } from "react";
import { inventoryApi } from "@/lib/api";
import { equipmentCache, offlineQueue, type OfflineTransaction } from "@/lib/offlineStore";
import { useNetworkStatus } from "./useNetworkStatus";

export function useOfflineSync() {
  const { isServerReachable } = useNetworkStatus();
  const [pending, setPending] = useState<OfflineTransaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastCacheUpdate, setLastCacheUpdate] = useState<string | null>(null);

  useEffect(() => {
    setPending(offlineQueue.getPending());
    const cached = equipmentCache.load();
    if (cached) setLastCacheUpdate(cached.cachedAt);
  }, []);

  const refreshCache = useCallback(async () => {
    if (!isServerReachable) return;
    try {
      const res = await inventoryApi.listEquipment({ page_size: 100 });
      equipmentCache.save(res.data.items);
      setLastCacheUpdate(new Date().toISOString());
    } catch {
    }
  }, [isServerReachable]);

  useEffect(() => {
    if (isServerReachable) {
      refreshCache();
    }
  }, [isServerReachable, refreshCache]);

  const sync = useCallback(async () => {
    if (!isServerReachable || isSyncing) return;
    const pendingTxs = offlineQueue.getPending();
    if (pendingTxs.length === 0) return;

    setIsSyncing(true);

    for (const tx of pendingTxs) {
      offlineQueue.update(tx.id, { status: "syncing" });

      try {
        if (tx.type === "borrow") {
          await inventoryApi.borrow(tx.payload);
        } else if (tx.type === "return") {
          await inventoryApi.return(tx.payload);
        } else if (tx.type === "create_equipment") {
          await inventoryApi.createEquipment(tx.payload);
        }
        offlineQueue.update(tx.id, { status: "synced" });
      } catch (err: unknown) {
        const msg =
          (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
          "Sync failed";
        offlineQueue.update(tx.id, { status: "failed", error: msg });
      }
    }

    offlineQueue.clearSynced();
    setPending(offlineQueue.getPending());
    setIsSyncing(false);

    refreshCache();
  }, [isServerReachable, isSyncing, refreshCache]);

  useEffect(() => {
    if (isServerReachable && offlineQueue.getPending().length > 0) {
      sync();
    }
  }, [isServerReachable, sync]);

  const queueTransaction = useCallback(
    (type: OfflineTransaction["type"], payload: Record<string, unknown>) => {
      const tx = offlineQueue.add(type, payload);
      setPending(offlineQueue.getPending());
      return tx;
    },
    []
  );

  const dismissTransaction = useCallback((id: string) => {
    offlineQueue.remove(id);
    setPending(offlineQueue.getPending());
  }, []);

  return {
    pending,
    pendingCount: pending.length,
    isSyncing,
    isServerReachable,
    lastCacheUpdate,
    sync,
    refreshCache,
    queueTransaction,
    dismissTransaction,
  };
}
