"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Info, Loader2, Save, ShieldAlert } from "lucide-react";
import { adminApi } from "@/lib/api";
import type { FRConfig, FRConfigUpdate } from "@/types";

const SECURITY_FLOOR = 0.7;

export default function FRConfigPage() {
  const queryClient = useQueryClient();

  const { data: config, isLoading } = useQuery<FRConfig>({
    queryKey: ["fr-config"],
    queryFn: async () => {
      const res = await adminApi.getFRConfig();
      return res.data as FRConfig;
    },
  });

  const [simThreshold, setSimThreshold] = useState<number>(0.50);
  const [liveThreshold, setLiveThreshold] = useState<number>(0.6);
  const [liveEnabled, setLiveEnabled] = useState<boolean>(true);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (config) {
      setSimThreshold(config.similarity_threshold);
      setLiveThreshold(config.liveness_threshold);
      setLiveEnabled(config.liveness_enabled);
    }
  }, [config]);

  const { mutate: saveConfig, isPending: isSaving } = useMutation({
    mutationFn: (update: FRConfigUpdate) =>
      adminApi.updateFRConfig(update as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fr-config"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const handleSave = () => {
    saveConfig({
      similarity_threshold: simThreshold,
      liveness_threshold: liveThreshold,
      liveness_enabled: liveEnabled,
    });
  };

  const simWarning = simThreshold < SECURITY_FLOOR;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <Loader2 className="animate-spin text-gray-400" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">

      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/osca-logo.png"
          alt="OSCA Logo"
          className="w-14 h-14 rounded-full object-cover shadow ring-2 ring-[#C9A84C]/30 shrink-0"
        />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FR Configuration</h1>
          <p className="text-sm text-gray-500 mt-1">
            Adjust facial recognition thresholds. Changes take effect immediately on the next scan.
            All updates are recorded in the audit log.
          </p>
        </div>
      </div>

      {simWarning && (
        <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-xl text-sm text-yellow-800">
          <ShieldAlert size={18} className="mt-0.5 shrink-0 text-yellow-600" />
          <div>
            <p className="font-semibold">Security Warning</p>
            <p className="mt-0.5">
              Similarity threshold is below {SECURITY_FLOOR}. A low threshold increases the risk
              of false-accept matches (one person recognized as another). Only lower this value
              under controlled conditions.
            </p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">

        <div className="p-6 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <label className="font-semibold text-gray-900">Similarity Threshold</label>
              <p className="text-xs text-gray-400 mt-0.5">
                Minimum cosine similarity for a successful face match. Default: 0.50.
              </p>
            </div>
            <span
              className={`text-2xl font-bold tabular-nums ${
                simWarning ? "text-yellow-600" : "text-[#1E3A5F]"
              }`}
            >
              {simThreshold.toFixed(2)}
            </span>
          </div>

          <input
            type="range"
            min={0.5}
            max={1.0}
            step={0.01}
            value={simThreshold}
            onChange={(e) => setSimThreshold(parseFloat(e.target.value))}
            className="w-full accent-[#1E3A5F]"
          />

          <div className="flex justify-between text-xs text-gray-400">
            <span>0.50 (permissive)</span>
            <span className="text-yellow-600 font-medium">⚠ 0.70</span>
            <span>1.00 (strict)</span>
          </div>
        </div>

        <div className="p-6 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <label className="font-semibold text-gray-900">Liveness Threshold</label>
              <p className="text-xs text-gray-400 mt-0.5">
                MiniFASNet score above which a face is considered live. Default: 0.60.
              </p>
            </div>
            <span className="text-2xl font-bold tabular-nums text-[#1E3A5F]">
              {liveThreshold.toFixed(2)}
            </span>
          </div>

          <input
            type="range"
            min={0.0}
            max={1.0}
            step={0.01}
            value={liveThreshold}
            onChange={(e) => setLiveThreshold(parseFloat(e.target.value))}
            className="w-full accent-[#1E3A5F]"
            disabled={!liveEnabled}
          />

          <div className="flex justify-between text-xs text-gray-400">
            <span>0.00 (off)</span>
            <span>1.00 (strict)</span>
          </div>
        </div>

        <div className="p-6 flex items-center justify-between">
          <div>
            <label className="font-semibold text-gray-900">Liveness Detection</label>
            <p className="text-xs text-gray-400 mt-0.5">
              Reject printed photos and screen-displayed faces (MiniFASNet).
            </p>
            {!liveEnabled && (
              <div className="flex items-center gap-1.5 mt-2 text-xs text-orange-600 font-medium">
                <AlertTriangle size={12} /> Disabling liveness reduces anti-spoofing protection.
              </div>
            )}
          </div>

          <button
            onClick={() => setLiveEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              liveEnabled ? "bg-[#1E3A5F]" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                liveEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="flex items-start gap-2 p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-700">
        <Info size={16} className="mt-0.5 shrink-0" />
        <p>
          These settings are stored in Redis and override the static environment configuration.
          They persist until manually changed here or until the Redis instance is cleared.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 bg-[#1E3A5F] text-white rounded-xl font-semibold hover:bg-[#16304f] transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save size={16} /> Save Configuration
            </>
          )}
        </button>

        {saved && (
          <div className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
            <CheckCircle2 size={16} /> Configuration saved
          </div>
        )}
      </div>
    </div>
  );
}
