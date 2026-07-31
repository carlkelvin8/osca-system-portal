"use client";

/**
 * Equipment Requests page — Coach/PE Instructor submits requests;
 * Admin/Director approves or rejects them.
 * QR code workflow: requester shows QR → approver scans to approve.
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { inventoryApi } from "@/lib/api";
import {
  CheckCircle2, XCircle, Clock, Plus, X, Loader2, Package, QrCode, ScanLine, WifiOff, AlertTriangle, RotateCcw,
} from "lucide-react";
import type {
  EquipmentRequest, PaginatedResponse, RequestStatus, Equipment, BorrowTransaction,
} from "@/types";
import { useAuthStore } from "@/store/useAuthStore";
import { format } from "date-fns";
import QRCode from "qrcode";
import { equipmentCache } from "@/lib/offlineStore";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

// ── Status badge helper ────────────────────────────────────────────────────────

const statusConfig: Record<string, { label: string; className: string; icon: React.ElementType }> = {
  pending:   { label: "Pending",   className: "bg-yellow-100 text-yellow-800", icon: Clock },
  approved:  { label: "Approved",  className: "bg-green-100 text-green-800",  icon: CheckCircle2 },
  rejected:  { label: "Rejected",  className: "bg-red-100 text-red-800",      icon: XCircle },
  cancelled: { label: "Cancelled", className: "bg-gray-200 text-gray-700",    icon: XCircle },
  expired:   { label: "Expired",   className: "bg-gray-100 text-gray-500",    icon: Clock },
  returned:  { label: "Returned",  className: "bg-blue-100 text-blue-800",    icon: RotateCcw },
};

function getRequestStatus(req: EquipmentRequest): string {
  if (req.status === "pending" && req.is_expired) return "expired";
  if (req.status === "approved" && req.return_qr_status === "used") return "returned";
  return req.status;
}

// ── Return QR Code Display Modal ────────────────────────────────────────────

const returnQrStatusConfig: Record<string, { label: string; className: string }> = {
  active:  { label: "Active",  className: "bg-green-100 text-green-800 border border-green-300" },
  expired: { label: "Expired", className: "bg-red-100 text-red-800 border border-red-300" },
  used:    { label: "Used",    className: "bg-gray-100 text-gray-600 border border-gray-300" },
};

function ReturnQRModal({ request, onClose }: { request: EquipmentRequest; onClose: () => void }) {
  const qrStatus = request.return_qr_status ?? "active";
  const statusInfo = returnQrStatusConfig[qrStatus] ?? returnQrStatusConfig.active;
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState<number | null>(null);

  const returnQrCode = request.return_qr_code;

  useEffect(() => {
    let cancelled = false;
    const generateQR = async () => {
      if (!returnQrCode) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const url = await QRCode.toDataURL(returnQrCode, { width: 400, margin: 2 });
        if (!cancelled) setQrUrl(url);
      } catch {
        // ignore
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    generateQR();
    return () => { cancelled = true; };
  }, [returnQrCode]);

  useEffect(() => {
    const expectedReturn = new Date(request.expected_return).getTime();
    const tick = () => {
      const left = Math.max(0, Math.floor((expectedReturn - Date.now()) / 1000));
      setRemaining(left);
    };
    tick();
    if (qrStatus === "active") {
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }
  }, [request.expected_return, qrStatus]);

  const minutes = Math.floor((remaining ?? 0) / 60);
  const seconds = (remaining ?? 0) % 60;
  const isActive = qrStatus === "active";
  const isExpired = qrStatus === "expired";
  const isUsed = qrStatus === "used";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Return QR Code</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* QR Status */}
        <div className="flex items-center justify-center gap-2">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${statusInfo.className}`}>
            {statusInfo.label}
          </span>
        </div>

        {/* QR Code Image */}
        <div className="flex items-center justify-center py-2">
          {loading ? (
            <Loader2 size={40} className="animate-spin text-gray-300" />
          ) : !returnQrCode ? (
            <div className="w-48 h-48 flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
              <QrCode size={32} className="text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-600 text-center px-4">No Return QR yet</p>
              <p className="text-xs text-gray-400 mt-1 text-center px-4">Equipment must be released to generate the Return QR Code.</p>
            </div>
          ) : isUsed ? (
            <div className="w-48 h-48 flex flex-col items-center justify-center bg-gray-50 rounded-xl border-2 border-dashed border-gray-300">
              <CheckCircle2 size={32} className="text-gray-400 mb-2" />
              <p className="text-sm font-medium text-gray-600">QR Used</p>
              <p className="text-xs text-gray-400 mt-1">This QR has already been scanned for return.</p>
            </div>
          ) : qrUrl ? (
            <img src={qrUrl} alt="Return QR Code" className="w-48 h-48" />
          ) : (
            <p className="text-sm text-red-500">Failed to load QR code</p>
          )}
        </div>

        {/* Return QR value for traceability */}
        {returnQrCode && !isUsed && (
          <p className="font-mono text-xs text-gray-400">{returnQrCode}</p>
        )}

        {/* Expected Return */}
        <div className="text-sm text-gray-500">
          Expected Return: <span className="font-medium text-gray-700">
            {format(new Date(request.expected_return), "MMM d, yyyy · h:mm a")}
          </span>
        </div>

        {/* Countdown for active QR */}
        {isActive && (
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
            <Clock size={12} />
            {remaining !== null && remaining > 0
              ? `Expires in ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
              : "Expiring now..."}
          </div>
        )}

        {/* Expired / overdue message */}
        {isExpired && (
          <p className="text-xs text-amber-600">
            The Expected Return time has passed. This QR is still valid for a late return.
          </p>
        )}

        {/* Description */}
        {isActive && (
          <p className="text-xs text-gray-400">
            Present this QR Code when returning the borrowed equipment.
          </p>
        )}
        {isExpired && (
          <p className="text-xs text-gray-400">
            Present this QR Code to Staff — they can still process the late return.
          </p>
        )}
      </div>
    </div>
  );
}

// ── QR Scanner Modal (Approver) ──────────────────────────────────────────────

interface ScannedRequest {
  id: string;
  requester_name: string;
  items: Array<{ equipment_name: string; quantity: number }>;
  expected_return: string;
  requested_at: string;
  status: RequestStatus;
  is_expired: boolean;
  approved_by_name: string;
  approved_at: string | null;
  rejection_reason: string | null;
}

interface ScannedEquipmentInfo {
  equipment: Equipment;
  source: "server" | "cache";
}

function QRScannerModal({ onClose, onApprove }: {
  onClose: () => void;
  onApprove: (requestId: string) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scannedRequest, setScannedRequest] = useState<ScannedRequest | null>(null);
  const [scannedEquipment, setScannedEquipment] = useState<ScannedEquipmentInfo | null>(null);
  const [relatedRequests, setRelatedRequests] = useState<ScannedRequest[]>([]);
  const [loadingRelated, setLoadingRelated] = useState(false);
  const [scanning, setScanning] = useState(true);
  const readerRef = useRef<import("@zxing/browser").BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const { isServerReachable } = useNetworkStatus();

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let cancelled = false;

    (async () => {
      try {
        const { BrowserQRCodeReader } = await import("@zxing/browser");
        const reader = new BrowserQRCodeReader();
        readerRef.current = reader;

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current!,
          async (result, _err) => {
            if (cancelled || !result) return;
            const text = result.getText();

            stopScanning();
            setScanning(false);

            // Handle request QR codes (REQ- prefix)
            if (text.startsWith("REQ-")) {
              if (!isServerReachable) {
                setError("Cannot approve requests while offline. Request QR codes require server connection.");
                return;
              }
              try {
                const res = await inventoryApi.getRequestByQR(text);
                setScannedRequest(res.data);
              } catch {
                setError("Request not found or invalid QR code.");
              }
              return;
            }

            // Handle equipment QR codes — try server first, fall back to cache
            if (isServerReachable) {
              try {
                const res = await inventoryApi.getEquipmentByQR(text);
                setScannedEquipment({ equipment: res.data, source: "server" });
                return;
              } catch {
                // Server didn't find it, try cache
              }
            }

            // Offline or server miss — look up in local cache
            const cached = equipmentCache.findByQR(text);
            if (cached) {
              setScannedEquipment({ equipment: cached, source: "cache" });
            } else {
              setError(`QR code "${text}" not found${!isServerReachable ? " (offline — using cached data)" : ""}.`);
            }
          }
        );
        controlsRef.current = controls;
      } catch {
        if (!cancelled) setError("Unable to access camera. Please allow camera permissions.");
      }
    })();

    return () => {
      cancelled = true;
      stopScanning();
    };
  }, [scanning, stopScanning, isServerReachable]);

  useEffect(() => {
    if (!scannedEquipment) return;
    let cancelled = false;
    setLoadingRelated(true);
    inventoryApi.getRequestsByEquipment(scannedEquipment.equipment.id).then((res) => {
      if (cancelled) return;
      setRelatedRequests(res.data);
    }).catch(() => {
      if (!cancelled) setRelatedRequests([]);
    }).finally(() => {
      if (!cancelled) setLoadingRelated(false);
    });
    return () => { cancelled = true; };
  }, [scannedEquipment]);

  const handleApprove = () => {
    if (!scannedRequest) return;
    onApprove(scannedRequest.id);
    onClose();
  };

  const handleRescan = () => {
    setError(null);
    setScannedRequest(null);
    setScannedEquipment(null);
    setRelatedRequests([]);
    setScanning(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">Scan QR Code</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        {!isServerReachable && (
          <div className="flex items-center gap-2 px-6 py-2 bg-amber-50 text-amber-700 text-xs border-b border-amber-200">
            <WifiOff size={12} />
            Offline — equipment lookup uses cached data
          </div>
        )}

        <div className="px-6 py-5 space-y-4">
          {scanning && (
            <>
              <p className="text-sm text-gray-500 text-center">
                Point the camera at a QR code
              </p>
              <div className="relative bg-black rounded-xl overflow-hidden aspect-square">
                <video ref={videoRef} className="w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 border-2 border-white/50 rounded-xl" />
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="text-center space-y-3">
              <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>
              <button onClick={handleRescan} className="text-sm text-[#1E3A5F] underline">
                Scan again
              </button>
            </div>
          )}

          {/* Equipment scan result */}
          {scannedEquipment && (
            <div className="space-y-4">
              {scannedEquipment.source === "cache" && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 text-center">
                  Showing cached data — quantities may not be current
                </p>
              )}
              <div className="p-4 bg-gray-50 rounded-xl space-y-2">
                <p className="text-sm font-semibold text-gray-900">{scannedEquipment.equipment.name}</p>
                <p className="text-xs text-gray-500 capitalize">
                  {scannedEquipment.equipment.category.replace("_", " ")} · {scannedEquipment.equipment.condition.replace("_", " ")}
                </p>
                <div className="flex gap-4 text-xs">
                  <span className="text-gray-600">Total: <strong>{scannedEquipment.equipment.total_quantity}</strong></span>
                  <span className={scannedEquipment.equipment.available_quantity === 0 ? "text-red-600" : "text-green-600"}>
                    Available: <strong>{scannedEquipment.equipment.available_quantity}</strong>
                  </span>
                </div>
                {scannedEquipment.equipment.storage_location && (
                  <p className="text-xs text-gray-500">Location: {scannedEquipment.equipment.storage_location}</p>
                )}
                <p className="font-mono text-xs text-gray-400">{scannedEquipment.equipment.qr_code}</p>
              </div>

              {/* Related Requests */}
              <div className="p-4 bg-white border border-gray-200 rounded-xl space-y-2">
                <p className="text-sm font-semibold text-gray-900">Related Requests</p>
                {loadingRelated ? (
                  <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Loader2 size={12} className="animate-spin" /> Loading...
                  </p>
                ) : relatedRequests.length === 0 ? (
                  <p className="text-xs text-gray-400">No requests found for this equipment.</p>
                ) : (
                  <div className="space-y-2">
                    {relatedRequests.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <div className="space-y-0.5">
                          <p className="text-xs font-medium text-gray-800">{r.requester_name}</p>
                          <p className="text-xs text-gray-500">
                            {r.items.find((i) => i.equipment_name === scannedEquipment.equipment.name)
                              ? `x${r.items.find((i) => i.equipment_name === scannedEquipment.equipment.name)!.quantity}`
                              : ""} · {format(new Date(r.requested_at), "MMM d, h:mm a")}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {(() => {
                            const rDisplayStatus = r.status === "pending" && r.is_expired ? "expired" : r.status;
                            return (
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[rDisplayStatus].className}`}>
                                {statusConfig[rDisplayStatus].label}
                              </span>
                            );
                          })()}
                          {r.status === "pending" && !r.is_expired && (
                            <button
                              onClick={() => { onApprove(r.id); onClose(); }}
                              className="text-xs px-2 py-1 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                            >
                              Approve
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={handleRescan} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
                  Scan Another
                </button>
                <button onClick={onClose} className="px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition">
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Request scan result */}
          {scannedRequest && (
            <div className="space-y-4">
              <div className="p-4 bg-gray-50 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-gray-900">
                    Request from {scannedRequest.requester_name}
                  </p>
                  {(() => {
                    const scannedDisplayStatus = scannedRequest.status === "pending" && scannedRequest.is_expired ? "expired" : scannedRequest.status;
                    return (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig[scannedDisplayStatus].className}`}>
                        {statusConfig[scannedDisplayStatus].label}
                      </span>
                    );
                  })()}
                </div>
                <ul className="space-y-0.5">
                  {scannedRequest.items.map((item, i) => (
                    <li key={i} className="text-xs text-gray-600">
                      {item.equipment_name} x {item.quantity}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-gray-500">
                  Return by: {format(new Date(scannedRequest.expected_return), "MMM d, yyyy · h:mm a")}
                </p>
                <p className="text-xs text-gray-400">
                  Requested: {format(new Date(scannedRequest.requested_at), "MMM d, yyyy · h:mm a")}
                </p>

                {scannedRequest.status === "approved" && scannedRequest.approved_by_name && (
                  <p className="text-xs text-green-700">
                    Approved by <span className="font-medium">{scannedRequest.approved_by_name}</span>
                    {scannedRequest.approved_at && (
                      <> on {format(new Date(scannedRequest.approved_at), "MMM d, yyyy · h:mm a")}</>
                    )}
                  </p>
                )}

                {scannedRequest.status === "rejected" && scannedRequest.rejection_reason && (
                  <p className="text-xs text-red-600">
                    Rejection reason: {scannedRequest.rejection_reason}
                  </p>
                )}
              </div>

              {scannedRequest.status === "pending" && scannedRequest.is_expired && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
                  <p className="text-sm font-medium text-amber-700">This request has expired.</p>
                  <p className="text-xs text-amber-500 mt-0.5">QR codes are only valid for 60 minutes after submission.</p>
                </div>
              )}

              {scannedRequest.status === "pending" && !scannedRequest.is_expired ? (
                <div className="flex justify-end gap-3">
                  <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApprove}
                    className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                  >
                    <CheckCircle2 size={14} /> Approve Request
                  </button>
                </div>
              ) : scannedRequest.status !== "pending" ? (
                <p className="text-sm text-center text-gray-500">
                  This request is already {scannedRequest.status}.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── New Request Modal ──────────────────────────────────────────────────────────

interface RequestItem { equipment_id: string; quantity: number; equipment_name: string }

interface NewRequestModalProps { onClose: () => void }

function NewRequestModal({ onClose }: NewRequestModalProps) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<RequestItem[]>([]);
  const [expectedReturn, setExpectedReturn] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { data: equipmentData } = useQuery<PaginatedResponse<Equipment>>({
    queryKey: ["equipment-for-request"],
    queryFn: async () => {
      const res = await inventoryApi.listEquipment({ available_only: true, page_size: 100 });
      return res.data;
    },
  });
  const availableEquipment = equipmentData?.items ?? [];

  const { data: activeBorrows } = useQuery<PaginatedResponse<BorrowTransaction>>({
    queryKey: ["my-active-borrows"],
    queryFn: async () => {
      const res = await inventoryApi.listTransactions({ status: "active", page_size: 50 });
      return res.data;
    },
  });

  const { data: overdueBorrows } = useQuery<PaginatedResponse<BorrowTransaction>>({
    queryKey: ["my-overdue-borrows"],
    queryFn: async () => {
      const res = await inventoryApi.listTransactions({ status: "overdue", page_size: 50 });
      return res.data;
    },
  });

  const existingBorrows: BorrowTransaction[] = [
    ...(activeBorrows?.items ?? []),
    ...(overdueBorrows?.items ?? []),
  ];
  const hasExistingBorrows = existingBorrows.length > 0;

  const addItem = (eq: Equipment) => {
    if (items.find((i) => i.equipment_id === eq.id)) return;
    setItems((prev) => [...prev, { equipment_id: eq.id, quantity: 1, equipment_name: eq.name }]);
  };

  const updateQty = (equipment_id: string, qty: number) => {
    setItems((prev) => prev.map((i) => i.equipment_id === equipment_id ? { ...i, quantity: qty } : i));
  };

  const removeItem = (equipment_id: string) => {
    setItems((prev) => prev.filter((i) => i.equipment_id !== equipment_id));
  };

  const { mutate, isPending } = useMutation({
    mutationFn: () =>
      inventoryApi.createRequest({
        items: items.map(({ equipment_id, quantity }) => ({ equipment_id, quantity })),
        expected_return: new Date(expectedReturn).toISOString(),
        notes: notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-requests"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to submit request.";
      setError(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (items.length === 0) { setError("Add at least one equipment item."); return; }
    if (!expectedReturn) { setError("Expected return date is required."); return; }
    if (new Date(expectedReturn) <= new Date()) { setError("Expected return must be in the future."); return; }
    mutate();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-lg font-bold text-gray-900">New Equipment Request</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Active borrows warning banner */}
          {hasExistingBorrows && (
            <div className="space-y-3">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    You currently have existing borrowed equipment or overdue returns.
                  </p>
                  <p className="text-xs text-amber-700 mt-0.5">
                    Your new request will still require Staff/Admin approval.
                  </p>
                </div>
              </div>
              <div className="border border-amber-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-amber-50">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium text-amber-800">Equipment</th>
                      <th className="px-3 py-1.5 text-center font-medium text-amber-800">Qty</th>
                      <th className="px-3 py-1.5 text-left font-medium text-amber-800">Borrowed</th>
                      <th className="px-3 py-1.5 text-left font-medium text-amber-800">Expected Return</th>
                      <th className="px-3 py-1.5 text-center font-medium text-amber-800">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100">
                    {existingBorrows.map((tx) =>
                      tx.items.map((item) => (
                        <tr key={`${tx.id}-${item.id}`}>
                          <td className="px-3 py-1.5 text-gray-700">{item.equipment_name}</td>
                          <td className="px-3 py-1.5 text-center text-gray-600">{item.quantity}</td>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                            {format(new Date(tx.borrowed_at), "MMM d, yyyy")}
                          </td>
                          <td className="px-3 py-1.5 text-gray-600 whitespace-nowrap">
                            {format(new Date(tx.expected_return), "MMM d, yyyy")}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                              tx.status === "overdue" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                            }`}>
                              {tx.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Equipment selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Add Equipment <span className="text-red-500">*</span>
            </label>
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y">
              {availableEquipment.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No available equipment</p>
              ) : availableEquipment.map((eq) => {
                const added = items.find((i) => i.equipment_id === eq.id);
                return (
                  <div key={eq.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{eq.name}</p>
                      <p className="text-xs text-gray-400">{eq.category} · Available: {eq.available_quantity}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => added ? removeItem(eq.id) : addItem(eq)}
                      className={`text-xs px-3 py-1 rounded-lg font-medium transition ${
                        added
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-[#1E3A5F]/10 text-[#1E3A5F] hover:bg-[#1E3A5F]/20"
                      }`}
                    >
                      {added ? "Remove" : "Add"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected items with qty */}
          {items.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">Selected Items</p>
              {items.map((item) => (
                <div key={item.equipment_id} className="flex items-center gap-3 px-3 py-2 bg-blue-50 rounded-lg">
                  <Package size={14} className="text-[#1E3A5F] shrink-0" />
                  <span className="flex-1 text-sm font-medium text-gray-800">{item.equipment_name}</span>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-gray-500">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(e) => updateQty(item.equipment_id, parseInt(e.target.value) || 1)}
                      className="w-14 px-2 py-1 text-sm border border-gray-200 rounded text-center"
                    />
                  </div>
                  <button type="button" onClick={() => removeItem(item.equipment_id)} className="text-red-400 hover:text-red-600">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Expected return */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expected Return <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              value={expectedReturn}
              onChange={(e) => setExpectedReturn(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional purpose or notes…"
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30 focus:border-[#1E3A5F] resize-none"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex items-center gap-2 px-5 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition disabled:opacity-50 font-medium"
            >
              {isPending ? <><Loader2 size={14} className="animate-spin" /> Submitting…</> : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Rejection Modal ────────────────────────────────────────────────────────────

function RejectModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () => inventoryApi.rejectRequest(requestId, reason),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-requests"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to reject request.";
      setError(msg);
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Reject Request</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Rejection Reason <span className="text-red-500">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Explain why this request is rejected…"
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-300 focus:border-red-400 resize-none"
          />
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!reason.trim()) { setError("Rejection reason is required."); return; }
              mutate();
            }}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 font-medium"
          >
            {isPending ? <><Loader2 size={14} className="animate-spin" /> Rejecting…</> : "Reject"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Cancel Confirmation Modal ───────────────────────────────────────────────────

function CancelConfirmModal({ requestId, onClose }: { requestId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation({
    mutationFn: () => inventoryApi.cancelRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["equipment-requests"] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to cancel request.";
      setError(msg);
    },
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Cancel Request</h2>
        <p className="text-sm text-gray-600">
          Are you sure you want to cancel this equipment request? This action cannot be undone.
        </p>
        {error && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition">
            Keep Request
          </button>
          <button
            onClick={() => mutate()}
            disabled={isPending}
            className="flex items-center gap-2 px-5 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 transition disabled:opacity-50 font-medium"
          >
            {isPending ? <><Loader2 size={14} className="animate-spin" /> Cancelling…</> : "Yes, Cancel Request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── View Details Modal ─────────────────────────────────────────────────────────

function ViewDetailsModal({ request, onClose }: { request: EquipmentRequest; onClose: () => void }) {
  const displayStatus = getRequestStatus(request);
  const { label, className, icon: StatusIcon } = statusConfig[displayStatus];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900">Request Details</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400">Request Number</p>
              <p className="font-mono font-medium text-gray-800">REQ-{request.id.slice(0, 8).toUpperCase()}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Current Status</p>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
                <StatusIcon size={11} />
                {label}
              </span>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-400 mb-1">Requestor</p>
            <p className="font-medium text-gray-800">{request.requester_name}</p>
            <p className="text-xs text-gray-500 capitalize">{(request.requester_role ?? "").replace("_", " ") || "—"}</p>
          </div>

          {/* Active / Overdue Borrows */}
          {request.requester_active_borrows.length > 0 && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                <AlertTriangle size={11} className="text-amber-500" />
                Current Active / Overdue Borrows
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-1 text-gray-500 font-medium">Equipment</th>
                    <th className="text-center py-1 text-gray-500 font-medium">Qty</th>
                    <th className="text-left py-1 text-gray-500 font-medium">Borrowed</th>
                    <th className="text-left py-1 text-gray-500 font-medium">Return By</th>
                    <th className="text-center py-1 text-gray-500 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {request.requester_active_borrows.map((tx) =>
                    tx.items.map((item) => (
                      <tr key={`${tx.id}-${item.id}`}>
                        <td className="py-1 text-gray-700">{item.equipment_name}</td>
                        <td className="py-1 text-center text-gray-600">{item.quantity}</td>
                        <td className="py-1 text-gray-600 whitespace-nowrap">
                          {format(new Date(tx.borrowed_at), "MMM d, yyyy")}
                        </td>
                        <td className="py-1 text-gray-600 whitespace-nowrap">
                          {format(new Date(tx.expected_return), "MMM d, yyyy")}
                        </td>
                        <td className="py-1 text-center">
                          <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
                            tx.status === "overdue" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
                          }`}>
                            {tx.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs text-gray-400 mb-2">Equipment Requested</p>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-1.5 text-gray-500 font-medium">Equipment</th>
                  <th className="text-center py-1.5 text-gray-500 font-medium">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {request.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-1.5 text-gray-700">{item.equipment_name}</td>
                    <td className="py-1.5 text-center text-gray-600">{item.quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-gray-100 pt-3 grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-400">Request Date</p>
              <p className="text-gray-700">{format(new Date(request.requested_at), "MMM d, yyyy · h:mm a")}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">Expected Return</p>
              <p className="text-gray-700">{format(new Date(request.expected_return), "MMM d, yyyy · h:mm a")}</p>
            </div>
          </div>

          {request.notes && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400">Remarks</p>
              <p className="text-gray-700">{request.notes}</p>
            </div>
          )}

          {request.status === "rejected" && request.rejection_reason && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400">Rejection Reason</p>
              <p className="text-red-600">{request.rejection_reason}</p>
            </div>
          )}

          {request.status === "approved" && request.approved_by_name && (
            <div className="border-t border-gray-100 pt-3">
              <p className="text-xs text-gray-400">Approved By</p>
              <p className="text-gray-700">{request.approved_by_name}</p>
              {request.approved_at && (
                <p className="text-xs text-gray-400">{format(new Date(request.approved_at), "MMM d, yyyy · h:mm a")}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function EquipmentRequestsPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<RequestStatus | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showNewRequest, setShowNewRequest] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [viewingRequest, setViewingRequest] = useState<EquipmentRequest | null>(null);
  const [returnQrView, setReturnQrView] = useState<EquipmentRequest | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const isRequester = user?.role === "coach" || user?.role === "pe_instructor";
  const isApprover = user?.role === "admin" || user?.role === "director" || user?.role === "staff";

  const { data, isLoading } = useQuery<PaginatedResponse<EquipmentRequest>>({
    queryKey: ["equipment-requests", page, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (statusFilter) params.status = statusFilter;
      if (dateFrom) params.date_from = `${dateFrom}T00:00:00`;
      if (dateTo) params.date_to = `${dateTo}T23:59:59`;
      const res = await inventoryApi.listRequests(params);
      return res.data;
    },
  });

  const { mutate: approveRequest } = useMutation({
    mutationFn: (id: string) => inventoryApi.approveRequest(id, { create_transaction: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["equipment-requests"] }),
  });

  const [viewingId, setViewingId] = useState<string | null>(null);

  const totalPages = data?.pages ?? 1;

  return (
    <>
      {showNewRequest && <NewRequestModal onClose={() => setShowNewRequest(false)} />}
      {rejectingId && <RejectModal requestId={rejectingId} onClose={() => setRejectingId(null)} />}
      {returnQrView && <ReturnQRModal request={returnQrView} onClose={() => setReturnQrView(null)} />}
      {viewingRequest && <ViewDetailsModal request={viewingRequest} onClose={() => setViewingRequest(null)} />}
      {showScanner && (
        <QRScannerModal
          onClose={() => setShowScanner(false)}
          onApprove={(id) => {
            approveRequest(id);
            setShowScanner(false);
          }}
        />
      )}
      {cancellingId && <CancelConfirmModal requestId={cancellingId} onClose={() => setCancellingId(null)} />}

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Equipment Requests</h1>
            <p className="text-sm text-gray-500">
              {isRequester ? "Submit and track your equipment requests" : "Review and approve equipment requests"}
            </p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
              <span className="text-xs text-gray-400">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}
                  className="flex items-center gap-1 px-2 py-2 text-xs text-gray-500 hover:text-red-600 transition"
                  title="Clear date filter"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as RequestStatus | ""); setPage(1); }}
              className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/30"
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>
            {isApprover && (
              <button
                onClick={() => setShowScanner(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              >
                <ScanLine size={16} /> Scan QR
              </button>
            )}
            {isRequester && (
              <button
                onClick={() => setShowNewRequest(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-[#1E3A5F] text-white rounded-lg hover:bg-[#16304f] transition"
              >
                <Plus size={16} /> New Request
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#1E3A5F] text-white">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Requester</th>
                <th className="px-4 py-3 text-left font-medium">Items</th>
                <th className="px-4 py-3 text-left font-medium">Expected Return</th>
                <th className="px-4 py-3 text-left font-medium">Requested At</th>
                {isApprover && <th className="px-4 py-3 text-left font-medium">Approved By</th>}
                <th className="px-4 py-3 text-center font-medium">Status</th>
                <th className="px-4 py-3 text-center font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                    <td colSpan={isApprover ? 7 : 6} className="px-4 py-8 text-center text-gray-400">
                      <Loader2 size={20} className="animate-spin inline-block mr-2" />Loading…
                    </td>
                </tr>
              ) : (data?.items ?? []).length === 0 ? (
                <tr>
                  <td colSpan={isApprover ? 7 : 6} className="px-4 py-10 text-center text-gray-400 text-sm">
                    No requests found.
                  </td>
                </tr>
              ) : (data?.items ?? []).map((req) => {
                const displayStatus = getRequestStatus(req);
                const { label, className, icon: StatusIcon } = statusConfig[displayStatus];
                return (
                  <tr key={req.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{req.requester_name}</td>
                    <td className="px-4 py-3 text-gray-600">
                      <ul className="space-y-0.5">
                        {req.items.map((item) => (
                          <li key={item.id} className="text-xs">
                            {item.equipment_name} x {item.quantity}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {format(new Date(req.expected_return), "MMM d, yyyy · h:mm a")}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {format(new Date(req.requested_at), "MMM d, yyyy")}
                    </td>
                    {isApprover && (
                      <td className="px-4 py-3 text-gray-600 text-xs">
                        {req.approved_by_name && req.status === "approved" ? (
                          <span>
                            {req.approved_by_name}
                            {req.approved_at && (
                              <span className="block text-gray-400">{format(new Date(req.approved_at), "MMM d, yyyy")}</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${className}`}>
                        <StatusIcon size={11} />
                        {label}
                      </span>
                      {req.status === "rejected" && req.rejection_reason && (
                        <p className="text-xs text-gray-400 mt-1 max-w-[140px] mx-auto truncate" title={req.rejection_reason}>
                          {req.rejection_reason}
                        </p>
                      )}
                      {req.status === "approved" && req.notes && (
                        <p className="text-xs text-gray-400 mt-1 max-w-[140px] mx-auto truncate" title={req.notes}>
                          {req.notes}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {/* View Details — always visible */}
                        <button
                          onClick={() => setViewingRequest(req)}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition font-medium"
                        >
                          <Package size={12} /> View Details
                        </button>
                        {/* Show Return QR for approved requests with active QR */}
                        {req.status === "approved" && req.return_qr_code && req.return_qr_status !== "used" && (
                          <button
                            onClick={() => setReturnQrView(req)}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-[#1E3A5F]/10 text-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/20 transition font-medium"
                          >
                            <QrCode size={12} /> Show Return QR
                          </button>
                        )}
                        {/* Requester: Cancel own pending non-expired requests */}
                        {isRequester && req.status === "pending" && !req.is_expired && (
                          <button
                            onClick={() => setCancellingId(req.id)}
                            className="flex items-center gap-1 px-3 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium border border-red-200"
                          >
                            <XCircle size={12} /> Cancel
                          </button>
                        )}
                        {/* Approver: Approve + Reject for pending non-expired requests */}
                        {isApprover && req.status === "pending" && !req.is_expired && (
                          <>
                            <button
                              onClick={() => approveRequest(req.id)}
                              className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-medium"
                            >
                              <CheckCircle2 size={12} /> Approve
                            </button>
                            <button
                              onClick={() => setRejectingId(req.id)}
                              className="flex items-center gap-1 px-3 py-1 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition font-medium border border-red-200"
                            >
                              <XCircle size={12} /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">Page {page} of {totalPages}</span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </>
  );
}
