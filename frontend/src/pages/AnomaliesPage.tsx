import React, { useState, useEffect } from "react";
import { AnomalyAlert, AnomalySeverity, AnomalyStatus } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { EmptyState } from "../components/EmptyState";
import {
  ShieldAlert, AlertTriangle, CheckCircle2, Clock, Check,
  Filter, X, RefreshCw, Eye, ArrowRight, ShieldCheck, Zap, Info, Search
} from "lucide-react";

interface AnomaliesPageProps {
  onNavigateTab?: (tab: string) => void;
}

export const AnomaliesPage: React.FC<AnomaliesPageProps> = ({ onNavigateTab }) => {
  const { t } = useLanguage();
  const [alerts, setAlerts] = useState<AnomalyAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<AnomalyAlert | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState<"RESOLVED" | "DISMISSED">("RESOLVED");
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getAnomalies();
      setAlerts(data);
    } catch (err: any) {
      setError(err.message || "Failed to load anomaly detection alerts");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const handleResolve = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAlert || !resolutionNotes.trim()) return;
    setSubmitting(true);
    try {
      await api.resolveAnomaly(selectedAlert.id, resolutionStatus, resolutionNotes);
      setSelectedAlert(null);
      setResolutionNotes("");
      await fetchAlerts();
    } catch (err: any) {
      alert(err.message || "Failed to resolve anomaly alert");
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = alerts.filter((a) => {
    if (statusFilter !== "ALL" && a.status !== statusFilter) return false;
    if (severityFilter !== "ALL" && a.severity !== severityFilter) return false;
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase();
      const matchType = a.alert_type.toLowerCase().includes(s);
      const matchDesc = a.description.toLowerCase().includes(s);
      const matchEntity = a.entity_id ? a.entity_id.toLowerCase().includes(s) : false;
      if (!matchType && !matchDesc && !matchEntity) return false;
    }
    return true;
  });

  const pendingCount = alerts.filter((a) => a.status === "PENDING_REVIEW").length;
  const criticalHighCount = alerts.filter((a) => a.severity === "CRITICAL" || a.severity === "HIGH").length;
  const resolvedCount = alerts.filter((a) => a.status === "RESOLVED").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-brand-600 dark:text-brand-400" />
            {t("navAnomalies")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Automated detection of irregular inventory depletion, abnormal invoice discounts, and shrinkage risks
          </p>
        </div>
        <button
          onClick={fetchAlerts}
          className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors self-start sm:self-auto"
          title={t("refresh")}
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Executive Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Pending Review</span>
            <span className={`w-2 h-2 rounded-full ${pendingCount > 0 ? "bg-amber-500 animate-pulse" : "bg-slate-300"}`} />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
            {pendingCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {pendingCount > 0 ? "Requires manager sign-off" : "All alerts verified"}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>High & Critical Risk</span>
            <span className="w-2 h-2 rounded-full bg-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
            {criticalHighCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Shrinkage & cash discrepancies
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Resolved Incidents</span>
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400 mt-1">
            {resolvedCount}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Verified with audit reason
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Total Audited Alerts</span>
            <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
            {alerts.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            Across 5 loss-prevention rules
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search anomalies by description, alert type, or entity ID..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex items-center gap-2.5">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Statuses</option>
            <option value="PENDING_REVIEW">Pending Review</option>
            <option value="RESOLVED">Resolved</option>
            <option value="DISMISSED">Dismissed</option>
          </select>

          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>

          {(statusFilter !== "ALL" || severityFilter !== "ALL" || searchTerm) && (
            <button
              onClick={() => {
                setStatusFilter("ALL");
                setSeverityFilter("ALL");
                setSearchTerm("");
              }}
              className="p-1.5 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
              title="Reset Filters"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Alerts Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm animate-pulse">
          {t("loading")}
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-700 dark:text-rose-400 text-sm">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Zero Suspicious Anomalies Detected"
          description="Your store transactions, discounts, and inventory ledgers are fully aligned with normal baseline ranges."
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3 font-semibold">Severity</th>
                  <th className="px-5 py-3 font-semibold">Alert Type</th>
                  <th className="px-5 py-3 font-semibold">Description</th>
                  <th className="px-5 py-3 font-semibold">Detected At</th>
                  <th className="px-5 py-3 font-semibold text-center">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((a) => {
                  let sevBadge = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                  if (a.severity === "CRITICAL") {
                    sevBadge = "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200";
                  } else if (a.severity === "HIGH") {
                    sevBadge = "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200";
                  } else if (a.severity === "MEDIUM") {
                    sevBadge = "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200";
                  }

                  return (
                    <tr key={a.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${sevBadge}`}>
                          {a.severity}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 font-mono text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {a.alert_type}
                      </td>

                      <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300 max-w-md">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{a.description}</div>
                        {a.entity_type && a.entity_id && (
                          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                            <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-300">
                              {a.entity_type}: #{a.entity_id}
                            </span>
                            {onNavigateTab && a.entity_type === "invoice" && (
                              <button
                                onClick={() => onNavigateTab("sales")}
                                className="text-[10px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 inline-flex items-center gap-0.5"
                              >
                                View in Sales <ArrowRight className="w-2.5 h-2.5" />
                              </button>
                            )}
                            {onNavigateTab && (a.entity_type === "product" || a.entity_type === "stock_movement") && (
                              <button
                                onClick={() => onNavigateTab("inventory")}
                                className="text-[10px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 inline-flex items-center gap-0.5"
                              >
                                View in Inventory <ArrowRight className="w-2.5 h-2.5" />
                              </button>
                            )}
                            {onNavigateTab && a.entity_type === "cash_drawer" && (
                              <button
                                onClick={() => onNavigateTab("pos")}
                                className="text-[10px] font-semibold text-brand-600 hover:text-brand-700 dark:text-brand-400 inline-flex items-center gap-0.5"
                              >
                                View in POS Drawer <ArrowRight className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        )}
                        {a.resolution_notes && (
                          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 font-sans bg-emerald-50/60 dark:bg-emerald-950/30 p-1.5 rounded-lg border border-emerald-200 dark:border-emerald-900/50">
                            <span className="font-semibold">Resolution: </span>{a.resolution_notes}
                          </div>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-xs text-slate-400 font-mono">
                        {new Date(a.created_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {a.status}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        {a.status === "PENDING_REVIEW" ? (
                          <button
                            onClick={() => setSelectedAlert(a)}
                            className="px-3 py-1 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium transition-colors"
                          >
                            Review
                          </button>
                        ) : (
                          <button
                            onClick={() => setSelectedAlert(a)}
                            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded"
                            title="View Resolution"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 24/7 Loss Prevention Heuristics Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-brand-600" />
          Automated Loss Prevention & Anti-Theft Heuristics (24/7 Active)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 dark:text-slate-400">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              1. Excessive Bill Discounts (&gt;25%)
            </div>
            <p className="leading-relaxed">
              Monitors POS invoices where cashier applies discount exceeding 25% of subtotal, detecting sweet-hearting or unauthorized price slashing.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
              2. Repeated Invoice Cancellations
            </div>
            <p className="leading-relaxed">
              Triggers HIGH alert if &gt;2 completed bills are voided within 24 hours, preventing the classic retail tactic of pocketing cash after customer leaves.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              3. Cash Register Shift Discrepancies
            </div>
            <p className="leading-relaxed">
              Monitors shift reconciliation. Any physical cash variance &ge;₹500 against calculated system sales creates an immediate audit flag.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              4. Large Stock Adjustment (&gt;10 units / &gt;₹5,000)
            </div>
            <p className="leading-relaxed">
              Flags any manual inventory balance alteration exceeding 10 units or ₹5,000 in wholesale value to protect against backroom inventory diversion.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-500" />
              5. Negative Stock Billing Protection
            </div>
            <p className="leading-relaxed">
              Intercepts billing attempts for out-of-stock items, preventing ghost inventory deficits and triggering replenishment reminders.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-brand-600" />
              Owner/Manager Sign-Off
            </div>
            <p className="leading-relaxed">
              Every flagged anomaly requires an immutable resolution record with logged manager ID, timestamp, and verification explanation.
            </p>
          </div>
        </div>
      </div>

      {/* Review Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setSelectedAlert(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-2">
              Review Anomaly Alert #{selectedAlert.id}
            </h3>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-lg text-xs space-y-1 mb-4">
              <div className="font-semibold text-slate-700 dark:text-slate-300">
                {selectedAlert.alert_type}
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                {selectedAlert.description}
              </p>
            </div>

            {selectedAlert.status === "PENDING_REVIEW" ? (
              <form onSubmit={handleResolve} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Disposition Status
                  </label>
                  <select
                    value={resolutionStatus}
                    onChange={(e) => setResolutionStatus(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                  >
                    <option value="RESOLVED">Resolved (Action Taken / Verified)</option>
                    <option value="DISMISSED">Dismissed (False Positive / Expected)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Audit Notes / Explanation *
                  </label>
                  <textarea
                    rows={3}
                    required
                    placeholder="Enter verifiable reason or investigation result..."
                    value={resolutionNotes}
                    onChange={(e) => setResolutionNotes(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setSelectedAlert(null)}
                    className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || !resolutionNotes.trim()}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : "Submit Disposition"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Reviewed At: </span>
                  <span className="text-slate-500">
                    {selectedAlert.reviewed_at ? new Date(selectedAlert.reviewed_at).toLocaleString("en-IN") : "—"}
                  </span>
                </div>
                <div>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">Notes: </span>
                  <span className="text-slate-600 dark:text-slate-400">{selectedAlert.resolution_notes || "—"}</span>
                </div>
                <div className="flex justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => setSelectedAlert(null)}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-medium"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
