"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost/api/v1";
const PING_INTERVAL = 15_000;

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [isServerReachable, setIsServerReachable] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkServer = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_BASE}/auth/me`, {
        method: "GET",
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setIsServerReachable(res.status < 500 || res.status === 503);
      setIsOnline(true);
    } catch {
      setIsServerReachable(false);
      setIsOnline(navigator.onLine);
    }
  }, []);

  useEffect(() => {
    checkServer();

    const handleOnline = () => {
      setIsOnline(true);
      checkServer();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsServerReachable(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    intervalRef.current = setInterval(checkServer, PING_INTERVAL);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkServer]);

  return { isOnline, isServerReachable, checkServer };
}
