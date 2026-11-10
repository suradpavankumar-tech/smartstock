import React, { useState, useEffect } from "react";
import { useOfflineSync } from "../context/OfflineSyncContext";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import {
  Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle,
  Database, ShieldCheck, ArrowUpRight, Clock, Layers
} from "lucide-react";

export const SyncStatusPage: React.FC = () => {
  const { t } = useLanguage();
  const { isOnline, queue, pendingCount, syncNow, isSyncing } = useOfflineSync();
  const [serverHealth, setServerHealth] = useState<any | null>(null);
  const [checking, setChecking] = useState(false);

  const checkServer = async () => {
    setChecking(true);
    try {
      const res = await api.getSyncStatus();
      setServerHealth(res);
    } catch (_) {
      setServerHealth({ status: "UNREACHABLE" });
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkServer();
  }, [isOnline]);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            {isOnline ? (
              <Wifi className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <WifiOff className="w-6 h-6 text-amber-600 dark:text-amber-400" />
            )}
            {t("navSync")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Resilient local queue inspection, network heartbeat, and safe two-way server synchronization
          </p>
        </div>
        <button
          onClick={syncNow}
          disabled={!isOnline || isSyncing || pendingCount === 0}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 self-start sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${isSyncing ? "animate-spin" : ""}`} />
          {isSyncing ? "Synchronizing..." : "Sync Pending Queue"}
        </button>
      </div>

      {/* Connectivity & Health Status Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Client Network State
          </div>
          <div className="text-lg font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            {isOnline ? (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                Connected (Online)
              </>
            ) : (
              <>
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                Disconnected (Offline)
              </>
            )}
          </div>
          <div className="text-xs text-slate-400">
            {isOnline ? "Broadband / 4G active" : "Local storage fallback engaged"}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Pending Queue Length
          </div>
          <div className="text-2xl font-bold text-brand-600 dark:text-brand-400">
            {pendingCount}
          </div>
          <div className="text-xs text-slate-400">
            Transactions buffered locally
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 shadow-sm space-y-1">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Server Sync Endpoint
          </div>
          <div className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5 mt-1">
            {serverHealth?.status === "healthy" || serverHealth?.status === "ok" ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Server Healthy
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Checking Connectivity
              </>
            )}
          </div>
          <div className="text-xs text-slate-400">
            FastAPI /api/v1/sync/push
          </div>
        </div>
      </div>

      {/* Conflict Resolution Principle */}
      <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
          <ShieldCheck className="w-4 h-4 text-brand-600 dark:text-brand-400" />
          Deterministic Conflict Resolution Rules
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              1. Idempotency Key Guarantee
            </div>
            <p>
              Every billing transaction generated offline receives a UUID v4 idempotency token. Even if retried multiple times on spotty network connections, duplicate charges and phantom stock deductions are impossible.
            </p>
          </div>

          <div className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 space-y-1">
            <div className="font-semibold text-slate-800 dark:text-slate-200">
              2. Server-Authoritative Ledger
            </div>
            <p>
              When queued offline sales sync with the backend, stock movements are appended to the immutable chronological ledger (`StockMovement`) and final Weighted Average Cost is recalculated without overwriting historical records.
            </p>
          </div>
        </div>
      </div>

      {/* Buffered Transactions Queue Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm space-y-4 p-5">
        <h3 className="font-semibold text-slate-900 dark:text-white text-base">
          Local Storage Mutation Queue
        </h3>
        {queue.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
            Queue is empty. All counter sales and transactions have been synced to the database.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">Entity Type</th>
                  <th className="py-2.5 px-4 font-semibold">Action</th>
                  <th className="py-2.5 px-4 font-semibold">Idempotency Key</th>
                  <th className="py-2.5 px-4 font-semibold">Buffered At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {queue.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                      {item.action_type}
                    </td>
                    <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                      QUEUED
                    </td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-500">
                      {item.client_uuid}
                    </td>
                    <td className="py-3 px-4 text-slate-400 font-mono">
                      {new Date(item.created_at_client).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
