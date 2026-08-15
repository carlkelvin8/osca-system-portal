"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Result } from "@zxing/library";

interface QRScannerState {
  isScanning: boolean;
  error: string | null;
}

export function useQrScanner(onDecoded: (text: string) => void) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const onDecodedRef = useRef(onDecoded);
  onDecodedRef.current = onDecoded;

  const [state, setState] = useState<QRScannerState>({
    isScanning: false,
    error: null,
  });

  const stop = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setState((s) => ({ ...s, isScanning: false }));
  }, []);

  useEffect(() => {
    return () => stop();
  }, [stop]);

  const start = useCallback(() => {
    setState((s) => ({ ...s, error: null, isScanning: true }));
  }, []);

  const clearError = useCallback(() => {
    setState((s) => ({ ...s, error: null }));
  }, []);

  useEffect(() => {
    if (!state.isScanning || !videoRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        const callback = (result: Result | undefined) => {
          if (cancelled || !result) return;
          const text = result.getText();
          stop();
          onDecodedRef.current(text);
        };

        let controls;
        try {
          controls = await reader.decodeFromVideoDevice(
            undefined,
            videoRef.current!,
            callback
          );
        } catch {
          controls = await reader.decodeFromConstraints(
            { video: true },
            videoRef.current!,
            callback
          );
        }

        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
      } catch {
        if (!cancelled) {
          setState((s) => ({
            ...s,
            isScanning: false,
            error:
              "Unable to access camera. Please allow camera permissions.",
          }));
        }
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [state.isScanning, stop]);

  return {
    videoRef,
    isScanning: state.isScanning,
    error: state.error,
    start,
    stop,
    clearError,
  };
}
