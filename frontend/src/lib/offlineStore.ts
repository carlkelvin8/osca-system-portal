import type { Equipment } from "@/types";

const EQUIPMENT_CACHE_KEY = "osca_equipment_cache";
const EQUIPMENT_CACHE_TS_KEY = "osca_equipment_cache_ts";
const PENDING_TX_KEY = "osca_pending_transactions";

export interface CachedEquipmentData {
  items: Equipment[];
  cachedAt: string;
}

export const equipmentCache = {
  save(items: Equipment[]) {
    localStorage.setItem(EQUIPMENT_CACHE_KEY, JSON.stringify(items));
    localStorage.setItem(EQUIPMENT_CACHE_TS_KEY, new Date().toISOString());
  },

  load(): CachedEquipmentData | null {
    const raw = localStorage.getItem(EQUIPMENT_CACHE_KEY);
    const ts = localStorage.getItem(EQUIPMENT_CACHE_TS_KEY);
    if (!raw || !ts) return null;
    try {
      return { items: JSON.parse(raw) as Equipment[], cachedAt: ts };
    } catch {
      return null;
    }
  },

  findByQR(qrCode: string): Equipment | null {
    const data = this.load();
    if (!data) return null;
    return data.items.find((eq) => eq.qr_code === qrCode) ?? null;
  },

  search(query: string): Equipment[] {
    const data = this.load();
    if (!data) return [];
    const q = query.toLowerCase();
    return data.items.filter(
      (eq) =>
        eq.name.toLowerCase().includes(q) ||
        eq.qr_code.toLowerCase().includes(q) ||
        eq.category.toLowerCase().includes(q)
    );
  },

  clear() {
    localStorage.removeItem(EQUIPMENT_CACHE_KEY);
    localStorage.removeItem(EQUIPMENT_CACHE_TS_KEY);
  },
};

export type OfflineTxType = "borrow" | "return" | "create_equipment";

export interface OfflineTransaction {
  id: string;
  type: OfflineTxType;
  payload: Record<string, unknown>;
  createdAt: string;
  status: "pending" | "syncing" | "synced" | "failed";
  error?: string;
}

function generateId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export const offlineQueue = {
  getAll(): OfflineTransaction[] {
    const raw = localStorage.getItem(PENDING_TX_KEY);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as OfflineTransaction[];
    } catch {
      return [];
    }
  },

  getPending(): OfflineTransaction[] {
    return this.getAll().filter((tx) => tx.status === "pending" || tx.status === "failed");
  },

  add(type: OfflineTxType, payload: Record<string, unknown>): OfflineTransaction {
    const tx: OfflineTransaction = {
      id: generateId(),
      type,
      payload,
      createdAt: new Date().toISOString(),
      status: "pending",
    };
    const all = this.getAll();
    all.push(tx);
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify(all));
    return tx;
  },

  update(id: string, updates: Partial<OfflineTransaction>) {
    const all = this.getAll();
    const idx = all.findIndex((tx) => tx.id === id);
    if (idx !== -1) {
      all[idx] = { ...all[idx], ...updates };
      localStorage.setItem(PENDING_TX_KEY, JSON.stringify(all));
    }
  },

  remove(id: string) {
    const all = this.getAll().filter((tx) => tx.id !== id);
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify(all));
  },

  clearSynced() {
    const remaining = this.getAll().filter((tx) => tx.status !== "synced");
    localStorage.setItem(PENDING_TX_KEY, JSON.stringify(remaining));
  },
};
