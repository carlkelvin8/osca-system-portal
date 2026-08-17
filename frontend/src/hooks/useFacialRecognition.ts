"use client";

import { useCallback, useRef, useState } from "react";
import type { FaceScanResponse, ScanResult } from "@/types";
import { attendanceApi } from "@/lib/api";

interface UseFacialRecognitionOptions {
  sessionId: string;
  scanType: "time_in" | "time_out";
  onSuccess?: (result: FaceScanResponse) => void;
  onFailure?: (result: FaceScanResponse) => void;
}

interface FRState {
  isScanning: boolean;
  lastResult: FaceScanResponse | null;
  error: string | null;
}

export function useFacialRecognition({
  sessionId,
  scanType,
  onSuccess,
  onFailure,
}: UseFacialRecognitionOptions) {
  const webcamRef = useRef<{ getScreenshot: () => string | null } | null>(null);
  const [state, setState] = useState<FRState>({
    isScanning: false,
    lastResult: null,
    error: null,
  });

  const captureAndScan = useCallback(async () => {
    if (!webcamRef.current || state.isScanning) return;

    const screenshot = webcamRef.current.getScreenshot();
    if (!screenshot) {
      setState((s) => ({ ...s, error: "Could not capture image from webcam" }));
      return;
    }

    const base64 = screenshot.split(",")[1];

    setState({ isScanning: true, lastResult: null, error: null });

    try {
      const { data: result } = await attendanceApi.scan({
        image_base64: base64,
        scan_type: scanType,
        session_id: sessionId,
      });

      setState({ isScanning: false, lastResult: result, error: null });

      if (result.result === "success") {
        onSuccess?.(result);
      } else {
        onFailure?.(result);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      const message = axiosErr?.response?.data?.detail || axiosErr?.message || "Scan failed. Try again.";
      setState({ isScanning: false, lastResult: null, error: message });
    }
  }, [sessionId, scanType, state.isScanning, onSuccess, onFailure]);

  const reset = useCallback(() => {
    setState({ isScanning: false, lastResult: null, error: null });
  }, []);

  return {
    webcamRef,
    isScanning: state.isScanning,
    lastResult: state.lastResult,
    error: state.error,
    captureAndScan,
    reset,
  };
}
