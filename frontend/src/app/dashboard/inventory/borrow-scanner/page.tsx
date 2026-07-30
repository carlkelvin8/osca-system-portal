"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { staffBorrowApi, inventoryApi } from "@/lib/api";
import {
  ScanLine,
  Loader2,
  User,
  ShieldCheck,
  AlertTriangle,
  Package,
  CalendarCheck,
  X,
  CheckCircle2,
  Clock,
  ArrowLeft,
  Smartphone,
} from "lucide-react";
import type {
  ScanBorrowingIDResponse,
  TransactionQRRead,
  EquipmentRequest,
  ScannedUserBorrow,
  ScannedUserSanction,
} from "@/types";
import { useAuthStore } from "@/store/useAuthStore";
import { format } from "date-fns";

type ScanStep = "idle" | "identity" | "transaction" | "done";

export default function BorrowScannerPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [step, setStep] = useState<ScanStep>("idle");
  const [identity, setIdentity] = useState<ScanBorrowingIDResponse | null>(null);
  const [transaction, setTransaction] = useState<TransactionQRRead | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<EquipmentRequest | null>(null);
  const [releaseResult, setReleaseResult] = useState<{ txnQr: string; requestId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Scanner state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [scanning, setScanning] = useState(false);
  const readerRef = useRef<import("@zxing/browser").BrowserQRCodeReader | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  const stopScanning = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopScanning();
    };
  }, [stopScanning]);

  const startScanner = useCallback(() => {
    setError(null);
    setScanning(true);
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

            if (text.startsWith("TXN-")) {
              await handleTransactionScan(text);
            } else {
              await handleIdentityScan(text);
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
  }, [scanning]);

  const handleIdentityScan = async (qrCode: string) => {
    setError(null);
    try {
      const res = await staffBorrowApi.scanBorrowingId(qrCode);
      setIdentity(res.data);
      setStep("identity");
    } catch {
      setError("Invalid QR code. Could not identify user.");
    }
  };

  const handleTransactionScan = async (qrCode: string) => {
    setError(null);
    try {
      const res = await staffBorrowApi.scanTransactionQr(qrCode);
      setTransaction(res.data);
      setStep("transaction");
    } catch {
      setError("Invalid transaction QR code.");
    }
  };

  const { mutate: confirmRelease, isPending: isReleasing } = useMutation({
    mutationFn: () => staffBorrowApi.confirmRelease(transaction!.transaction_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-transactions"] });
      setStep("done");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to confirm release.";
      setError(msg);
    },
  });

  const { mutate: completeTransaction, isPending: isCompleting } = useMutation({
    mutationFn: () => staffBorrowApi.completeTransaction(transaction!.transaction_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-transactions"] });
      setStep("done");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to complete transaction.";
      setError(msg);
    },
  });

  const { mutate: releaseRequest, isPending: isReleasingRequest } = useMutation({
    mutationFn: (requestId: string) => inventoryApi.approveRequest(requestId, {}),
    onSuccess: (res) => {
      const txn = (res.data as { transaction_qr_code?: string });
      setReleaseResult({
        txnQr: txn?.transaction_qr_code ?? "TXN-...",
        requestId: selectedRequest?.id ?? "",
      });
      queryClient.invalidateQueries({ queryKey: ["inventory-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-requests"] });
      setSelectedRequest(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to release request.";
      setError(msg);
      setSelectedRequest(null);
    },
  });

  const reset = () => {
    setStep("idle");
    setIdentity(null);
    setTransaction(null);
    setError(null);
    setReleaseResult(null);
    setSelectedRequest(null);
    setScanning(false);
    stopScanning();
  };

  if (user?.role !== "staff" && user?.role !== "admin" && user?.role !== "director") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">You do not have access to this feature.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Borrow Scanner</h1>
          <p className="text-sm text-gray-500">
            Scan QR codes to process equipment borrowing and returns
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{error}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Camera scanner */}
      {scanning && (
        <div className="relative bg-black rounded-xl overflow-hidden max-w-md mx-auto">
          <video ref={videoRef} className="w-full aspect-square object-cover" />
          <div className="absolute inset-0 border-2 border-dashed border-white/30 m-8 rounded-lg pointer-events-none" />
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <p className="text-xs text-white/70 bg-black/50 inline-block px-3 py-1 rounded-full">
              Point camera at a QR code
            </p>
          </div>
        </div>
      )}

      {/* Scan button */}
      {step === "idle" && !scanning && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#1E3A5F]/10 rounded-full mb-4">
            <Smartphone size={32} className="text-[#1E3A5F]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Ready to Scan</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
            Scan a <strong>Static QR (Borrowing ID)</strong> to identify a user, or a{" "}
            <strong>Transaction QR (TXN-)</strong> to process a release or return.
          </p>
          <button
            onClick={startScanner}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#1E3A5F] text-white rounded-xl hover:bg-[#16304f] transition font-medium"
          >
            <ScanLine size={20} /> Open Scanner
          </button>
        </div>
      )}

      {/* Identity result */}
      {step === "identity" && identity && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <User size={20} className="text-[#1E3A5F]" /> Identified User
            </h2>
            <div className="flex gap-2">
              <button
                onClick={startScanner}
                className="flex items-center gap-1 px-3 py-1.5 text-xs bg-[#1E3A5F]/10 text-[#1E3A5F] rounded-lg hover:bg-[#1E3A5F]/20 transition font-medium"
              >
                <ScanLine size={12} /> Scan Transaction QR
              </button>
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 px-2">
                <ArrowLeft size={16} /> Back
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-gray-500">Name:</span>{" "}
                <span className="font-medium">{identity.full_name}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Role:</span>{" "}
                <span className="font-medium capitalize">{identity.role.replace("_", " ")}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Email:</span>{" "}
                <span>{identity.email}</span>
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-gray-500">Account:</span>{" "}
                <span className={identity.is_active ? "text-green-600" : "text-red-600"}>
                  {identity.is_active ? "Active" : "Inactive"}
                </span>
              </p>
              {identity.eligibility && (
                <p className="text-sm">
                  <span className="text-gray-500">Eligibility:</span>{" "}
                  <span
                    className={`font-medium ${
                      identity.eligibility.is_current ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {identity.eligibility.is_current ? "Eligible" : identity.eligibility.status ?? "Not Eligible"}
                  </span>
                  {identity.eligibility.reason_detail && (
                    <span className="block text-xs text-gray-400">
                      {identity.eligibility.reason_detail}
                    </span>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Active Borrows */}
          {identity.current_borrows.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Package size={14} /> Active Borrows ({identity.current_borrows.length})
              </h3>
              <div className="space-y-1">
                {identity.current_borrows.map((b) => (
                  <div key={b.id} className="flex items-center justify-between text-xs bg-blue-50 px-3 py-2 rounded-lg">
                    <span className="text-gray-600">
                      {b.items_count} item(s) — Due {format(new Date(b.expected_return), "MMM d, yyyy")}
                    </span>
                    <span className={`font-medium ${
                      b.status === "overdue" ? "text-red-600" : "text-green-600"
                    }`}>
                      {b.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Pending Requests — clickable for release */}
          {identity.pending_requests.length > 0 && !selectedRequest && !releaseResult && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                <Clock size={14} /> Pending Requests ({identity.pending_requests.length})
              </h3>
              <p className="text-xs text-gray-400 mb-2">Click a request to review and release equipment.</p>
              <div className="space-y-1">
                {identity.pending_requests.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedRequest(r)}
                    className="w-full text-left text-xs bg-yellow-50 hover:bg-yellow-100 px-3 py-2 rounded-lg flex items-center justify-between transition cursor-pointer border border-transparent hover:border-yellow-300"
                  >
                    <span className="text-gray-700 font-medium">{r.items.map((i) => i.equipment_name).join(", ")}</span>
                    <span className="text-yellow-700 shrink-0 ml-2">{format(new Date(r.requested_at), "MMM d")}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected Request — detail & release */}
          {selectedRequest && !releaseResult && (
            <div className="border border-blue-200 rounded-xl p-4 bg-blue-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-900">Request Details</h3>
                <button onClick={() => setSelectedRequest(null)} className="text-xs text-gray-400 hover:text-gray-600">
                  <X size={14} />
                </button>
              </div>
              <div className="text-xs space-y-1">
                <p><span className="text-gray-500">Expected Return:</span> {format(new Date(selectedRequest.expected_return), "MMM d, yyyy · h:mm a")}</p>
                {selectedRequest.notes && <p><span className="text-gray-500">Notes:</span> {selectedRequest.notes}</p>}
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-blue-100">
                    <th className="text-left py-1.5 text-gray-500 font-medium">Equipment</th>
                    <th className="text-center py-1.5 text-gray-500 font-medium">Qty</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-50">
                  {selectedRequest.items.map((item) => (
                    <tr key={item.id}>
                      <td className="py-1.5 text-gray-800">{item.equipment_name}</td>
                      <td className="py-1.5 text-center text-gray-600">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button
                onClick={() => releaseRequest(selectedRequest.id)}
                disabled={isReleasingRequest}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-medium"
              >
                {isReleasingRequest ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                Release Equipment
              </button>
            </div>
          )}

          {/* Release Success — show TXN QR */}
          {releaseResult && (
            <div className="border border-green-200 rounded-xl p-4 bg-green-50 space-y-2">
              <div className="flex items-center gap-2 text-green-700">
                <CheckCircle2 size={18} />
                <h3 className="text-sm font-bold">Equipment Released</h3>
              </div>
              <p className="text-xs text-green-600">
                Transaction QR: <span className="font-mono font-bold">{releaseResult.txnQr}</span>
              </p>
              <p className="text-xs text-gray-500">
                Scan this <strong>Transaction QR (TXN-)</strong> later to process the return.
              </p>
              <button
                onClick={() => {
                  setReleaseResult(null);
                  setSelectedRequest(null);
                }}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Sanctions */}
          {identity.active_sanctions.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-1">
                <AlertTriangle size={14} /> Active Sanctions ({identity.active_sanctions.length})
              </h3>
              <div className="space-y-1">
                {identity.active_sanctions.map((s, i) => (
                  <div key={i} className="text-xs bg-red-50 px-3 py-2 rounded-lg">
                    <p className="font-medium text-red-700">{s.violation_type} — {s.severity}</p>
                    <p className="text-red-500">{s.description}</p>
                    {s.end_date && (
                      <p className="text-red-400">Until {format(new Date(s.end_date), "MMM d, yyyy")}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transaction result */}
      {step === "transaction" && transaction && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Package size={20} className="text-[#1E3A5F]" /> Transaction Details
            </h2>
            <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 px-2">
              <ArrowLeft size={16} /> Back
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-gray-500">Borrower:</span>{" "}
                <span className="font-medium">{transaction.borrower_name}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">QR Code:</span>{" "}
                <span className="font-mono text-xs">{transaction.transaction_qr_code}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Status:</span>{" "}
                <span className={`font-medium ${
                  transaction.status === "active" ? "text-green-600" :
                  transaction.status === "overdue" ? "text-red-600" :
                  transaction.status === "returned" ? "text-blue-600" : "text-gray-600"
                }`}>
                  {transaction.status}
                </span>
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-gray-500">Borrowed:</span>{" "}
                {format(new Date(transaction.borrowed_at), "MMM d, yyyy · h:mm a")}
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Expected Return:</span>{" "}
                {format(new Date(transaction.expected_return), "MMM d, yyyy · h:mm a")}
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Remaining Time:</span>{" "}
                {(() => {
                  const now = new Date();
                  const expected = new Date(transaction.expected_return);
                  if (transaction.status === "returned") return <span className="text-blue-600">Completed</span>;
                  if (now > expected) {
                    const diff = now.getTime() - expected.getTime();
                    const hours = Math.floor(diff / 3600000);
                    const mins = Math.floor((diff % 3600000) / 60000);
                    return <span className="text-red-600 font-medium">Late Return — {hours}h {mins}m overdue</span>;
                  }
                  const diff = expected.getTime() - now.getTime();
                  const days = Math.floor(diff / 86400000);
                  const hours = Math.floor((diff % 86400000) / 3600000);
                  return <span className="text-green-600">{days > 0 ? `${days}d ` : ""}{hours}h remaining</span>;
                })()}
              </p>
              {transaction.notes && (
                <p className="text-sm">
                  <span className="text-gray-500">Notes:</span> {transaction.notes}
                </p>
              )}
            </div>
          </div>

          {/* Items */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Items</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left py-2 text-xs text-gray-500 font-medium">Equipment</th>
                  <th className="text-center py-2 text-xs text-gray-500 font-medium">Qty</th>
                  <th className="text-center py-2 text-xs text-gray-500 font-medium">Returned</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {transaction.items.map((item) => (
                  <tr key={item.id}>
                    <td className="py-2 text-gray-800">{item.equipment_name}</td>
                    <td className="py-2 text-center text-gray-600">{item.quantity}</td>
                    <td className="py-2 text-center">
                      {item.is_returned ? (
                        <CheckCircle2 size={14} className="inline text-green-500" />
                      ) : (
                        <X size={14} className="inline text-gray-300" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2">
            {(transaction.status === "active" || transaction.status === "overdue") && (
              <>
                <button
                  onClick={() => confirmRelease()}
                  disabled={isReleasing}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-medium"
                >
                  {isReleasing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Confirm Release
                </button>
                <button
                  onClick={() => completeTransaction()}
                  disabled={isCompleting}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
                >
                  {isCompleting ? <Loader2 size={14} className="animate-spin" /> : <CalendarCheck size={14} />}
                  Complete Return
                </button>
              </>
            )}
            {transaction.status === "returned" && (
              <p className="text-sm text-green-600 font-medium flex items-center gap-1">
                <CheckCircle2 size={14} /> This transaction is already completed.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Done state */}
      {step === "done" && (
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Transaction Processed</h2>
          <p className="text-sm text-gray-500">
            {transaction && (
              <>Transaction <span className="font-mono font-medium">{transaction.transaction_qr_code}</span> has been processed.</>
            )}
          </p>
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-6 py-2.5 bg-[#1E3A5F] text-white rounded-xl hover:bg-[#16304f] transition font-medium"
          >
            <ScanLine size={18} /> Scan Another
          </button>
        </div>
      )}
    </div>
  );
}
