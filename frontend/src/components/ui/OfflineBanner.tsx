"use client";

import { WifiOff, RefreshCw, CloudOff, Loader2 } from "lucide-react";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { formatDistanceToNow } from "date-fns";

export function OfflineBanner() {
  const { isServerReachable, pendingCount, isSyncing, lastCacheUpdate, sync } =
    useOfflineSync();

  if (isServerReachable && pendingCount === 0) return null;

  return (
    <div className="space-y-0">
      {!isServerReachable && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
          <WifiOff size={14} className="shrink-0" />
          <span className="flex-1">
            <strong>Offline mode</strong> — QR scanning uses cached data.
            {lastCacheUpdate && (
              <span className="text-amber-600 ml-1">
                Last synced {formatDistanceToNow(new Date(lastCacheUpdate), { addSuffix: true })}
              </span>
            )}
          </span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 bg-blue-50 border-b border-blue-200 text-blue-800 text-sm">
          <CloudOff size={14} className="shrink-0" />
          <span className="flex-1">
            <strong>{pendingCount}</strong> queued transaction{pendingCount > 1 ? "s" : ""} waiting to sync
          </span>
          {isServerReachable && (
            <button
              onClick={sync}
              disabled={isSyncing}
              className="flex items-center gap-1 px-3 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium transition"
            >
              {isSyncing ? (
                <><Loader2 size={12} className="animate-spin" /> Syncing...</>
              ) : (
                <><RefreshCw size={12} /> Sync Now</>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
