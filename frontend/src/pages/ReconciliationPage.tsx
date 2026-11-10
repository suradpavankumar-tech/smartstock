import React, { useState, useEffect, useMemo } from "react";
import { ReconciliationSession, ReconciliationItem, Product } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { EmptyState } from "../components/EmptyState";
import {
  ClipboardCheck, Plus, CheckCircle2, Clock, AlertTriangle,
  ArrowRight, X, RefreshCw, FileText, Check, ShieldAlert,
  Search, Printer, Download, ArrowUpRight, ArrowDownRight,
  Sparkles, Layers
} from "lucide-react";

export const RECONCILIATION_REASONS = [
  { value: "COUNTING_ERROR", labelEn: "Counting Error", labelKn: "ಲೆಕ್ಕಾಚಾರದ ತಪ್ಪು" },
  { value: "SHRINKAGE", labelEn: "Shrinkage / Unrecorded Loss", labelKn: "ಕಳ್ಳತನ ಅಥವಾ ನಷ್ಟ" },
  { value: "DAMAGE", labelEn: "Damaged / Broken in Store", labelKn: "ಒಡೆದ ಅಥವಾ ಹಾನಿಯಾದ ಸರಕು" },
  { value: "EXPIRY", labelEn: "Expired / Rotten", labelKn: "ಅವಧಿ ಮುಗಿದ ಸರಕು" },
];

export const ReconciliationPage: React.FC = () => {
  const { t, language } = useLanguage();
  const isKn = language === "kn";

  const [sessions, setSessions] = useState<ReconciliationSession[]>([]);
  const [activeSession, setActiveSession] = useState<ReconciliationSession | null>(null);
  const [sessionItems, setSessionItems] = useState<ReconciliationItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New count form with product search
  const [productSearch, setProductSearch] = useState("");
  const [countForm, setCountForm] = useState({
    product_id: 0,
    counted_quantity: "",
    reason_code: "COUNTING_ERROR",
    notes: "",
  });

  const fetchSessions = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getReconciliationSessions();
      setSessions(data);
      // Auto-load in-progress session if any
      const inProg = data.find((s) => s.status === "IN_PROGRESS");
      if (inProg && !activeSession) {
        await loadSessionDetail(inProg.id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load reconciliation sessions");
    } finally {
      setLoading(false);
    }
  };

  const loadProducts = async () => {
    try {
      const prodList = await api.getProducts();
      setProducts(prodList);
      if (prodList.length > 0) {
        setCountForm((prev) => ({ ...prev, product_id: prodList[0].id }));
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchSessions();
    loadProducts();
  }, []);

  const loadSessionDetail = async (sessionId: number) => {
    setDetailLoading(true);
    try {
      const res = await api.getReconciliationDetail(sessionId);
      setActiveSession(res.session);
      setSessionItems(res.items);
    } catch (err: any) {
      alert(err.message || "Failed to load session details");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStartSession = async () => {
    try {
      const newSession = await api.startReconciliationSession("Physical stock audit");
      await fetchSessions();
      await loadSessionDetail(newSession.id);
    } catch (err: any) {
      alert(err.message || "Failed to start stock audit session");
    }
  };

  const handleRecordCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;
    const qty = parseFloat(countForm.counted_quantity);
    if (isNaN(qty) || qty < 0) return;

    try {
      await api.recordReconciliationCount(activeSession.id, {
        product_id: countForm.product_id,
        counted_quantity: qty,
        reason_code: countForm.reason_code,
        notes: countForm.notes.trim() || undefined,
      });
      setCountForm((prev) => ({ ...prev, counted_quantity: "", notes: "" }));
      await loadSessionDetail(activeSession.id);
    } catch (err: any) {
      alert(err.message || "Failed to record physical count");
    }
  };

  const handleApproveSession = async () => {
    if (!activeSession) return;
    if (!confirm("Are you sure you want to approve this reconciliation session? This will permanently update inventory stock balances with audited adjustments.")) {
      return;
    }
    setApproving(true);
    try {
      await api.approveReconciliationSession(activeSession.id);
      alert("Stock audit approved! Inventory balances and immutable stock ledger have been adjusted.");
      setActiveSession(null);
      await fetchSessions();
    } catch (err: any) {
      alert(err.message || "Failed to approve session");
    } finally {
      setApproving(false);
    }
  };

  // Filter products in select dropdown based on search
  const filteredProducts = useMemo(() => {
    if (!productSearch.trim()) return products;
    const q = productSearch.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(q) || (p.sku && p.sku.toLowerCase().includes(q)));
  }, [products, productSearch]);

  const selectedProduct = products.find((p) => p.id === countForm.product_id);

  // Active Session KPI Metrics
  const totalCounted = sessionItems.length;
  const mismatchCount = sessionItems.filter((i) => i.variance_quantity !== 0).length;
  const totalVarianceVal = sessionItems.reduce((sum, i) => sum + i.variance_value, 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ClipboardCheck className="w-6 h-6 text-brand-600 dark:text-brand-400" />
            <span>{isKn ? "ದಾಸ್ತಾನು ಪರಿಶೀಲನೆ ಮತ್ತು ಸಮನ್ವಯ (Stock Reconciliation)" : "Physical Stock Reconciliation"}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isKn
              ? "ಅಂಗಡಿ ಶೆಲ್ಫ್‌ಗಳಲ್ಲಿರುವ ಭೌತಿಕ ಸ್ಟಾಕ್ ಎಣಿಕೆ, ನಷ್ಟ/ಹಾನಿ ಪತ್ತೆ ಮತ್ತು ಲೆಡ್ಜರ್ ಹೊಂದಾಣಿಕೆ"
              : "Perform physical stocktakes, detect shrinkage/damage variances, and post audited ledger adjustments"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchSessions}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title={t("refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {!activeSession && (
            <button
              onClick={handleStartSession}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>{isKn ? "ಹೊಸ ಲೆಕ್ಕ ಪರಿಶೋಧನೆ ಪ್ರಾರಂಭಿಸಿ" : "Start Audit Session"}</span>
            </button>
          )}
        </div>
      </div>

      {/* Active Session Audit Interface */}
      {activeSession ? (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5">
            {/* Session Top Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300 px-2.5 py-0.5 rounded-lg border border-brand-200 dark:border-brand-800">
                    {activeSession.session_code}
                  </span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                    activeSession.status === "COMPLETED"
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                  }`}>
                    {activeSession.status}
                  </span>
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  Started: {new Date(activeSession.started_at).toLocaleString("en-IN")} • Auditor: <span className="text-slate-600 dark:text-slate-300 font-semibold">{activeSession.created_by_name || "Manager"}</span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Audit Sheet</span>
                </button>

                <button
                  onClick={() => setActiveSession(null)}
                  className="px-3 py-1.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300"
                >
                  Back to Sessions
                </button>

                {activeSession.status === "IN_PROGRESS" && (
                  <button
                    onClick={handleApproveSession}
                    disabled={approving || sessionItems.length === 0}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm disabled:opacity-50"
                  >
                    <Check className="w-4 h-4" />
                    <span>{approving ? "Applying..." : "Approve & Update Inventory"}</span>
                  </button>
                )}
              </div>
            </div>

            {/* Active Audit Session Scorecard */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-slate-400 text-[11px]">Items Audited</span>
                <p className="text-xl font-bold text-slate-900 dark:text-white mt-1 font-mono">{totalCounted}</p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-slate-400 text-[11px]">Items with Discrepancies</span>
                <p className={`text-xl font-bold mt-1 font-mono ${mismatchCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600"}`}>
                  {mismatchCount}
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-slate-400 text-[11px]">Net Audit Variance (₹)</span>
                <p className={`text-xl font-bold mt-1 font-mono ${totalVarianceVal < 0 ? "text-rose-600" : totalVarianceVal > 0 ? "text-blue-600" : "text-emerald-600"}`}>
                  {totalVarianceVal >= 0 ? "+" : ""}₹{totalVarianceVal.toFixed(2)}
                </p>
              </div>

              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800 text-center">
                <span className="text-slate-400 text-[11px]">Ledger Adjustment Status</span>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-2">
                  {activeSession.status === "COMPLETED" ? "Applied to Stock" : "Pending Approval"}
                </p>
              </div>
            </div>

            {/* Quick Count Entry (if session in progress) */}
            {activeSession.status === "IN_PROGRESS" && (
              <form onSubmit={handleRecordCount} className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-brand-600" />
                    <span>Record Physical Shelf Count (ಭೌತಿಕ ಲೆಕ್ಕ ದಾಖಲಿಸಿ)</span>
                  </span>
                  {selectedProduct && (
                    <span className="text-xs text-slate-500 font-mono">
                      System Balance: <span className="font-bold text-slate-900 dark:text-white">{selectedProduct.current_stock} {selectedProduct.unit}</span>
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold">Select Product SKU</label>
                      <input
                        type="text"
                        placeholder="Filter..."
                        value={productSearch}
                        onChange={(e) => setProductSearch(e.target.value)}
                        className="text-[10px] p-0.5 px-1.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800"
                      />
                    </div>
                    <select
                      value={countForm.product_id}
                      onChange={(e) => setCountForm({ ...countForm, product_id: parseInt(e.target.value) })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                    >
                      {filteredProducts.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} (Current: {p.current_stock} {p.unit})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold">
                      Counted Physical Qty *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="e.g. 48"
                      value={countForm.counted_quantity}
                      onChange={(e) => setCountForm({ ...countForm, counted_quantity: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white text-right"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold">Reason for Variance</label>
                    <select
                      value={countForm.reason_code}
                      onChange={(e) => setCountForm({ ...countForm, reason_code: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                    >
                      {RECONCILIATION_REASONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {isKn ? `${r.labelKn} (${r.labelEn})` : r.labelEn}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
                  <input
                    type="text"
                    placeholder="Optional audit observation note (e.g., Found 2 damaged packets behind shelf #3)"
                    value={countForm.notes}
                    onChange={(e) => setCountForm({ ...countForm, notes: e.target.value })}
                    className="w-full sm:flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  />

                  <button
                    type="submit"
                    className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm w-full sm:w-auto"
                  >
                    Save Physical Count
                  </button>
                </div>
              </form>
            )}

            {/* Session Items Variance Table */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-xs">
              <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3 text-right">Expected (System)</th>
                    <th className="px-4 py-3 text-right">Counted (Physical)</th>
                    <th className="px-4 py-3 text-right">Variance Units</th>
                    <th className="px-4 py-3 text-right">Monetary Variance</th>
                    <th className="px-4 py-3 text-center">Variance Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sessionItems.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        No products counted yet in this audit session. Use the form above to record physical counts.
                      </td>
                    </tr>
                  ) : (
                    sessionItems.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                          <div>{item.product_name}</div>
                          {item.notes && <div className="text-[10px] text-slate-400 font-normal mt-0.5">{item.notes}</div>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-slate-600 dark:text-slate-400">
                          {item.expected_quantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-slate-900 dark:text-white">
                          {item.counted_quantity} {item.unit}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          {item.variance_quantity === 0 ? (
                            <span className="text-emerald-600 flex items-center justify-end gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 0
                            </span>
                          ) : item.variance_quantity < 0 ? (
                            <span className="text-rose-600">{item.variance_quantity} {item.unit}</span>
                          ) : (
                            <span className="text-blue-600">+{item.variance_quantity} {item.unit}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-black">
                          {item.variance_value === 0 ? (
                            <span className="text-emerald-600">₹0.00</span>
                          ) : item.variance_value < 0 ? (
                            <span className="text-rose-600">-₹{Math.abs(item.variance_value).toFixed(2)}</span>
                          ) : (
                            <span className="text-blue-600">+₹{item.variance_value.toFixed(2)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.variance_quantity === 0
                              ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                          }`}>
                            {item.reason_code || "EXACT_MATCH"}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Sessions Registry */
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-brand-600" />
              <span>{t("loading")}</span>
            </div>
          ) : sessions.length === 0 ? (
            <EmptyState
              title={isKn ? "ಯಾವುದೇ ದಾಸ್ತಾನು ಪರಿಶೀಲನೆಗಳು ದಾಖಲಾಗಿಲ್ಲ" : "No Stocktaking Sessions"}
              description={
                isKn
                  ? "ಅಂಗಡಿ ಶೆಲ್ಫ್‌ಗಳಲ್ಲಿರುವ ಭೌತಿಕ ಸ್ಟಾಕ್ ಮತ್ತು ಕಂಪ್ಯೂಟರ್ ಲೆಕ್ಕವನ್ನು ಹೋಲಿಸಿ ನಷ್ಟಗಳನ್ನು ಸರಿಹೊಂದಿಸಲು ಹೊಸ ಪರಿಶೋಧನೆ ಪ್ರಾರಂಭಿಸಿ."
                  : "Initiate regular weekly or monthly physical inventory audits to reconcile store shelf counts against system balances."
              }
              actionText={isKn ? "+ ಹೊಸ ಪರಿಶೋಧನೆ ಪ್ರಾರಂಭಿಸಿ" : "+ Start First Stocktake"}
              onAction={handleStartSession}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="px-5 py-3.5">Audit Code</th>
                    <th className="px-5 py-3.5">Date Started</th>
                    <th className="px-5 py-3.5 text-center">Status</th>
                    <th className="px-5 py-3.5 text-right">Items Counted</th>
                    <th className="px-5 py-3.5 text-right">Total Net Variance</th>
                    <th className="px-5 py-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        {s.session_code}
                      </td>
                      <td className="px-5 py-3.5 text-slate-500">
                        {new Date(s.started_at).toLocaleDateString("en-IN", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {s.status === "COMPLETED" ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3 mr-1" />
                            Completed
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                            <Clock className="w-3 h-3 mr-1" />
                            In Progress
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right font-medium text-slate-700 dark:text-slate-300 font-mono">
                        {s.total_items_counted || 0}
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-900 dark:text-white">
                        ₹{(s.total_variance_value || 0).toFixed(2)}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => loadSessionDetail(s.id)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-colors"
                        >
                          <span>{s.status === "IN_PROGRESS" ? "Continue Audit" : "View Report"}</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
