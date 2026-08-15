"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import { equipmentCache } from "@/lib/offlineStore";
import { useNetworkStatus } from "./useNetworkStatus";
import type { Equipment, PaginatedResponse } from "@/types";

const PAGE_SIZE = 20;

export interface EquipmentFilters {
  search?: string;
  category?: string;
  sport?: string;
  available_only?: boolean;
}

export function useEquipmentCount(filters: EquipmentFilters = {}) {
  const { isServerReachable } = useNetworkStatus();

  return useQuery<number>({
    queryKey: ["equipment", "count", filters],
    queryFn: async () => {
      if (!isServerReachable) {
        const cached = equipmentCache.load();
        if (!cached) return 0;
        let items = cached.items;
        if (filters.search) items = equipmentCache.search(filters.search);
        if (filters.available_only) items = items.filter((e) => e.available_quantity > 0);
        return items.length;
      }
      const params: Record<string, string | number | boolean> = { page: 1, page_size: 1 };
      if (filters.category) params.category = filters.category;
      if (filters.sport) params.sport_or_art = filters.sport;
      if (filters.available_only) params.available_only = true;
      if (filters.search) params.search = filters.search;
      const res = await inventoryApi.listEquipment(params);
      return res.data.total;
    },
    staleTime: 30_000,
  });
}

export function useInventoryList(
  page: number,
  search: string,
  filters: Omit<EquipmentFilters, "search"> = {}
) {
  const { isServerReachable } = useNetworkStatus();

  return useQuery<PaginatedResponse<Equipment>>({
    queryKey: ["equipment", page, search, filters],
    queryFn: async () => {
      if (!isServerReachable) {
        const cached = equipmentCache.load();
        if (!cached) return { items: [], total: 0, page: 1, page_size: PAGE_SIZE, pages: 0 };
        let items = cached.items;
        if (search) items = equipmentCache.search(search);
        if (filters.available_only) items = items.filter((e) => e.available_quantity > 0);
        if (filters.category) items = items.filter((e) => e.category === filters.category);
        const start = (page - 1) * PAGE_SIZE;
        return {
          items: items.slice(start, start + PAGE_SIZE),
          total: items.length,
          page,
          page_size: PAGE_SIZE,
          pages: Math.ceil(items.length / PAGE_SIZE),
        };
      }

      const params: Record<string, string | number | boolean> = {
        page,
        page_size: PAGE_SIZE,
      };
      if (search) params.search = search;
      if (filters.category) params.category = filters.category;
      if (filters.sport) params.sport_or_art = filters.sport;
      if (filters.available_only) params.available_only = true;

      const res = await inventoryApi.listEquipment(params);

      if (page === 1 && !search) {
        inventoryApi
          .listEquipment({ page_size: 100 })
          .then((r) => equipmentCache.save(r.data.items))
          .catch(() => {});
      }

      return res.data;
    },
    staleTime: 30_000,
  });
}

export function useEquipmentById(id: string | null) {
  return useQuery<Equipment>({
    queryKey: ["equipment", id],
    queryFn: async () => {
      const res = await inventoryApi.getEquipment(id!);
      return res.data;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

export function useEquipmentByBarcode(barcode: string | null) {
  const { isServerReachable } = useNetworkStatus();

  return useQuery<Equipment | null>({
    queryKey: ["equipment", "barcode", barcode],
    queryFn: async () => {
      if (!barcode) return null;
      if (!isServerReachable) {
        return equipmentCache.findByQR(barcode) ?? null;
      }
      const res = await inventoryApi.getEquipmentByQR(barcode);
      return res.data;
    },
    enabled: !!barcode,
    staleTime: 60_000,
    retry: false,
  });
}

export function useInvalidateInventory() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["equipment"] });
}
