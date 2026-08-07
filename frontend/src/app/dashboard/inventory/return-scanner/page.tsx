"use client";

import { useState, useCallback } from "react";
import { useAuthStore } from "@/store/useAuthStore";
import { staffBorrowApi } from "@/lib/api";
import { useQrScanner } from "@/hooks/useQrScanner";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import type { TransactionQRRead } from "@/types";
import {
  ScanLine,
  Loader2,
  ArrowLeft,
  Smartphone,
  AlertTriangle,
  X,
  CheckCircle2,
  Package,
  ShieldCheck,
  Clock,
  RotateCcw,
} from "lucide-react";

type PageStep = "idle" | "result" | "done";

export default function ReturnScannerPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<PageStep>("idle");
  const [transaction, setTransaction] = useState<TransactionQRRead | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState("");
  const [processingCode, setProcessingCode] = useState(false);

  const processCode = useCallback(async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setProcessingCode(true);
    setError(null);
    try {
      const res = await staffBorrowApi.scanTransactionQr(trimmed);
      setTransaction(res.data);
      setStep("result");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Invalid or unrecognized Return QR code.";
      setError(msg);
    } finally {
      setProcessingCode(false);
    }
  }, []);

  const {
    videoRef,
    isScanning: scanning,
    error: scannerError,
    start: startScanner,
    stop: stopScanning,
  } = useQrScanner(processCode);
  const displayedError = error ?? scannerError;

  const { mutate: completeReturn, isPending: isCompleting } = useMutation({
    mutationFn: () => staffBorrowApi.completeTransaction(transaction!.transaction_id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory-transactions"] });
      setStep("done");
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to complete return.";
      setError(msg);
    },
  });

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

  const reset = () => {
    setStep("idle");
    setTransaction(null);
    setError(null);
    stopScanning();
  };
  const txIsLate = transaction
    ? transaction.status === "overdue" || new Date() > new Date(transaction.expected_return)
    : false;
  const txIsUsed = transaction
    ? transaction.qr_status === "used" || transaction.status === "returned"
    : false;
  const canProcess = transaction
    ? !txIsUsed && (transaction.status === "active" || transaction.status === "overdue" || txIsLate)
    : false;
  const canRelease = transaction
    ? !txIsUsed && transaction.status === "active" && !txIsLate
    : false;

  if (user?.role !== "staff" && user?.role !== "admin" && user?.role !== "director") {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-sm text-gray-500">You do not have access to this feature.</p>
      </div>
    );
  }

  const qrStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <ShieldCheck size={12} /> Active
          </span>
        );
      case "expired":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <Clock size={12} /> Expired
          </span>
        );
      case "used":
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            <CheckCircle2 size={12} /> Used
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Return Scanner</h1>
          <p className="text-sm text-gray-500">
            Scan the borrower's dynamic <strong>Return QR</strong> to process equipment returns
          </p>
        </div>
      </div>

      {displayedError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={16} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700 flex-1">{displayedError}</p>
          <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
            <X size={16} />
          </button>
        </div>
      )}

      {/* Camera scanner */}
      {scanning && (
        <div className="relative bg-black rounded-xl overflow-hidden max-w-md mx-auto">
          <video ref={videoRef} autoPlay muted playsInline className="w-full aspect-square object-cover" />
          <div className="absolute inset-0 border-2 border-dashed border-white/30 m-8 rounded-lg pointer-events-none" />
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <p className="text-xs text-white/70 bg-black/50 inline-block px-3 py-1 rounded-full">
              Point camera at the borrower's Return QR
            </p>
          </div>
        </div>
      )}

      {/* Idle state */}
      {step === "idle" && !scanning && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#1E3A5F]/10 rounded-full mb-4">
            <RotateCcw size={32} className="text-[#1E3A5F]" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">Return Equipment</h2>
          <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
            Scan the borrower's <strong>Return QR</strong> to process the equipment return.
          </p>
          <button
            onClick={startScanner}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#1E3A5F] text-white rounded-xl hover:bg-[#16304f] transition font-medium"
          >
            <ScanLine size={20} /> Open Scanner
          </button>

          <div className="my-8 flex items-center gap-3 max-w-sm mx-auto">
            <span className="h-px bg-gray-200 flex-1" />
            <span className="text-xs text-gray-400">or enter code manually</span>
            <span className="h-px bg-gray-200 flex-1" />
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              processCode(manualCode);
            }}
            className="flex gap-2 max-w-sm mx-auto"
          >
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Paste TXN- code here"
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]/40 font-mono"
            />
            <button
              type="submit"
              disabled={processingCode || !manualCode.trim()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition disabled:opacity-50 font-medium"
            >
              {processingCode ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
              Process
            </button>
          </form>
        </div>
      )}

      {/* Transaction result */}
      {step === "result" && transaction && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Package size={20} className="text-[#1E3A5F]" /> Return Transaction
            </h2>
            <div className="flex items-center gap-2">
              {txIsLate && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
                  <Clock size={12} /> Overdue
                </span>
              )}
              {qrStatusBadge(transaction.qr_status)}
              <button onClick={reset} className="text-xs text-gray-400 hover:text-gray-600 px-2">
                <ArrowLeft size={16} /> Back
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <p className="text-sm">
                <span className="text-gray-500">Borrower:</span>{" "}
                <span className="font-medium">{transaction.borrower_name}</span>
              </p>
              <p className="text-sm">
                <span className="text-gray-500">Role:</span>{" "}
                <span className="font-medium capitalize">{transaction.borrower_role.replace("_", " ")}</span>
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
                    return <span className="text-red-600 font-medium">Overdue — {hours}h {mins}m</span>;
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
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Items to Return</h3>
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
          <div className="space-y-3 pt-2">
            {txIsLate && (
              <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle size={14} className="text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700">
                  This return is overdue. Staff may still process the late return.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-3">
              {canRelease && (
                <button
                  onClick={() => confirmRelease()}
                  disabled={isReleasing}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 transition disabled:opacity-50 font-medium"
                >
                  {isReleasing ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  Confirm Release
                </button>
              )}
              {canProcess && (
                <button
                  onClick={() => completeReturn()}
                  disabled={isCompleting}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 font-medium"
                >
                  {isCompleting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                  Complete Return
                </button>
              )}
              {txIsUsed && (
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 rounded-lg">
                  <CheckCircle2 size={14} className="text-gray-400" />
                  <p className="text-sm text-gray-500">
                    {transaction.status === "returned"
                      ? "This transaction is already completed."
                      : "This Return QR has already been used."}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Done state */}
      {step === "done" && (
        <div className="bg-white rounded-xl shadow-sm border border-green-200 p-8 text-center space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
            <CheckCircle2 size={32} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900">Return Processed</h2>
          <p className="text-sm text-gray-500">
            {transaction && (
              <>Transaction <span className="font-mono font-medium">{transaction.transaction_qr_code}</span> has been completed.</>
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
