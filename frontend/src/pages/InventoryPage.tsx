import React, { useState, useEffect } from "react";
import {
  ClipboardList, AlertTriangle, ShieldCheck, Plus, Search,
  Calendar, Clock, CheckCircle2, RefreshCw, Tag, Trash2, ArrowRight
} from "lucide-react";
import { api } from "../services/api";
import { StockMovement, ProductBatch, Product } from "../types";
import { useLanguage } from "../context/LanguageContext";
import { BarcodeStickerModal } from "../components/BarcodeStickerModal";
import { KannadaText } from "../components/common/KannadaText";

export const InventoryPage: React.FC = () => {
  const { t, language, tData, formatDateLocalized } = useLanguage();
  const [activeTab, setActiveTab] = useState<"ledger" | "batches" | "expiry">("ledger");

  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [batches, setBatches] = useState<ProductBatch[]>([]);
  const [expiringBatches, setExpiringBatches] = useState<ProductBatch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  // Clearance sticker modal
  const [stickerProduct, setStickerProduct] = useState<Product | null>(null);

  // Manual adjustment modal
  const [isAdjustModalOpen, setIsAdjustModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<number | undefined>();
  const [quantityChange, setQuantityChange] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState("");
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [moves, bts, prods, expBts] = await Promise.all([
        api.getStockLedger(),
        api.getBatches(),
        api.getProducts(),
        api.getExpiringBatches(60),
      ]);
      setMovements(moves);
      setBatches(bts);
      setProducts(prods);
      setExpiringBatches(expBts);
    } catch (err) {
      console.error("Failed to load inventory data", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAdjustSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId) return;
    setAdjustError(null);

    try {
      await api.adjustStock({
        product_id: selectedProductId,
        quantity_change: Number(quantityChange),
        reason: adjustReason.trim(),
        notes: adjustNotes.trim() || undefined,
      });
      setIsAdjustModalOpen(false);
      setAdjustReason("");
      setAdjustNotes("");
      setQuantityChange(0);
      loadData();
    } catch (err: any) {
      setAdjustError(err.message || "Failed to record manual adjustment");
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <span>{t("navInventory")}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Immutable transaction ledger, authorized corrections, and batch tracking
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsAdjustModalOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Audit Adjustment</span>
          </button>
          <button
            onClick={loadData}
            title="Refresh Ledger"
            className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveTab("ledger")}
          className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === "ledger"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Stock Movement Ledger ({movements.length})
        </button>
        <button
          onClick={() => setActiveTab("batches")}
          className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors ${
            activeTab === "batches"
              ? "border-emerald-600 text-emerald-600 dark:text-emerald-400"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          Batches & Expiry Dates ({batches.length})
        </button>
        <button
          onClick={() => setActiveTab("expiry")}
          className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === "expiry"
              ? "border-amber-500 text-amber-600 dark:text-amber-400"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span>Near-Expiry & Clearance Alert</span>
          {expiringBatches.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
              {expiringBatches.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-slate-500">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
          <span className="text-xs">{t("loading")}</span>
        </div>
      ) : activeTab === "ledger" ? (
        /* Stock Ledger Table */
        movements.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            No stock movements recorded yet. Movements are generated automatically from POS sales, purchase receiving, and opening stock imports.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold">
                  <tr>
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Movement Type</th>
                    <th className="px-4 py-3">Product Name</th>
                    <th className="px-4 py-3 text-right">Quantity</th>
                    <th className="px-4 py-3 text-right">Balance After</th>
                    <th className="px-4 py-3 text-right">Unit Cost</th>
                    <th className="px-4 py-3">Reason / Reference</th>
                    <th className="px-4 py-3">Recorded By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {movements.map((m) => {
                    const isPositive = m.quantity > 0;
                    return (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap text-slate-500 text-[11px]">
                          {new Date(m.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              m.movement_type === "SALE"
                                ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                                : m.movement_type === "PURCHASE_RECEIVE"
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                : m.movement_type === "AUDIT_CORRECTION"
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                : "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300"
                            }`}
                          >
                            {tData(m.movement_type)}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900 dark:text-white">
                          <KannadaText text={m.product_name} />
                        </td>
                        <td className={`px-4 py-3 text-right font-bold ${isPositive ? "text-emerald-600" : "text-rose-600"}`}>
                          {isPositive ? `+${m.quantity}` : m.quantity}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                          {m.balance_after}
                        </td>
                        <td className="px-4 py-3 text-right text-slate-500">
                          ₹{m.unit_cost.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 text-[11px]">
                          <div><KannadaText text={m.reason || "-"} /></div>
                          {m.reference_id && (
                            <span className="text-[10px] font-mono text-slate-400">Ref: {m.reference_id}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-[11px]">
                          {m.created_by_name || "System"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : activeTab === "batches" ? (
        /* Batches & Expiry Table */
        batches.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            No product batches recorded with expiry tracking. Batches are created during Purchase Receiving.
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold">
                <tr>
                  <th className="px-4 py-3">Batch Number</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Purchase Cost</th>
                  <th className="px-4 py-3">Received Date</th>
                  <th className="px-4 py-3">Expiry Date</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {batches.map((b) => {
                  const daysToExpiry = b.expiry_date
                    ? Math.ceil((new Date(b.expiry_date).getTime() - new Date().getTime()) / (1000 * 3600 * 24))
                    : null;
                  const isExpired = daysToExpiry !== null && daysToExpiry <= 0;
                  const isExpiringSoon = daysToExpiry !== null && daysToExpiry > 0 && daysToExpiry <= 30;

                  return (
                    <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono font-bold">{b.batch_number}</td>
                      <td className="px-4 py-3 font-bold">{b.quantity}</td>
                      <td className="px-4 py-3">₹{b.purchase_cost.toFixed(2)}</td>
                      <td className="px-4 py-3 text-slate-500">{b.received_date}</td>
                      <td className="px-4 py-3 font-medium">
                        {b.expiry_date ? (
                          <span className={isExpired ? "text-rose-600 font-bold" : isExpiringSoon ? "text-amber-600 font-bold" : ""}>
                            {b.expiry_date} ({daysToExpiry} days)
                          </span>
                        ) : (
                          <span className="text-slate-400">No Expiry Date</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {isExpired ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">Expired</span>
                        ) : isExpiringSoon ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">Expiring Soon</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">Valid</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Near-Expiry & Clearance Alert Tab (Feature 5) */
        expiringBatches.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
            <div className="font-bold text-slate-700 dark:text-slate-200 text-sm">All Inventory Fresh</div>
            <p className="mt-1">Zero batches expiring within the next 60 days. No clearance write-offs needed.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  <strong>{expiringBatches.length} batch(es)</strong> are expiring soon or already expired. Sell on discount or return to distributor to avoid 100% dead loss.
                </span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold">
                    <tr>
                      <th className="px-4 py-3">Product Name</th>
                      <th className="px-4 py-3">Batch Number</th>
                      <th className="px-4 py-3 text-right">Stock Qty</th>
                      <th className="px-4 py-3 text-right">Cost Value</th>
                      <th className="px-4 py-3">Expiry Date</th>
                      <th className="px-4 py-3 text-center">Urgency</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {expiringBatches.map((b) => {
                      const days = b.days_until_expiry !== undefined ? b.days_until_expiry : 0;
                      const isExpired = days < 0;
                      const isCritical = days >= 0 && days <= 15;
                      const matchedProd = products.find((p) => p.id === b.product_id);

                      return (
                        <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900 dark:text-white">
                              <KannadaText text={b.product_name || matchedProd?.name || "Product"} />
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Batch #{b.batch_number} • Recd: {b.received_date}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono font-bold">{b.batch_number}</td>
                          <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-white">
                            {b.quantity}
                          </td>
                          <td className="px-4 py-3 text-right text-slate-600 dark:text-slate-400">
                            ₹{(b.quantity * b.purchase_cost).toFixed(2)}
                          </td>
                          <td className="px-4 py-3 font-semibold">
                            <span className={isExpired ? "text-rose-600" : isCritical ? "text-amber-600" : "text-blue-600"}>
                              {b.expiry_date} ({isExpired ? `${Math.abs(days)}d ago` : `${days}d left`})
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {isExpired ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300">
                                🔴 EXPIRED
                              </span>
                            ) : isCritical ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                🟠 &lt; 15 Days
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                                🟡 Within 60 Days
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {matchedProd && (
                                <button
                                  onClick={() => setStickerProduct(matchedProd)}
                                  title="Print Clearance Discount Price Tag"
                                  className="px-2 py-1 rounded bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 hover:bg-amber-100 flex items-center gap-1"
                                >
                                  <Tag className="w-3 h-3" />
                                  <span>Clearance Tag</span>
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  if (b.product_id) {
                                    setSelectedProductId(b.product_id);
                                    setQuantityChange(-b.quantity);
                                    setAdjustReason(isExpired ? "DAMAGE_OR_EXPIRY" : "VENDOR_RETURN");
                                    setAdjustNotes(`Batch ${b.batch_number} expired on ${b.expiry_date}`);
                                    setIsAdjustModalOpen(true);
                                  }
                                }}
                                title="Write-off expired stock or record vendor return"
                                className="px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-semibold border border-rose-200 hover:bg-rose-100 flex items-center gap-1"
                              >
                                <Trash2 className="w-3 h-3" />
                                <span>{isExpired ? "Write-off" : "Vendor Return"}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )
      )}

      {/* Manual Stock Adjustment Modal */}
      {isAdjustModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800 mb-4">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Authorized Stock Correction</h3>
              <button onClick={() => setIsAdjustModalOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs">
                Close
              </button>
            </div>

            {adjustError && (
              <div className="mb-4 p-2.5 rounded bg-rose-50 text-rose-700 text-xs border border-rose-200">
                {adjustError}
              </div>
            )}

            <form onSubmit={handleAdjustSubmit} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Select Product *</label>
                <select
                  required
                  value={selectedProductId || ""}
                  onChange={(e) => setSelectedProductId(Number(e.target.value))}
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="">-- Choose Product --</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (Current: {p.current_stock} {p.unit})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold mb-1">Quantity Change (+ to add, - to deduct) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={quantityChange}
                  onChange={(e) => setQuantityChange(Number(e.target.value))}
                  placeholder="e.g. -2 for damaged, +5 for unrecorded receipt"
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 font-bold"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Audit Reason (Mandatory) *</label>
                <input
                  type="text"
                  required
                  minLength={3}
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  placeholder="e.g. Physical inventory breakage / damaged packaging"
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="block font-semibold mb-1">Additional Notes</label>
                <textarea
                  rows={2}
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Optional audit context..."
                  className="w-full p-2 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="pt-4 flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAdjustModalOpen(false)}
                  className="px-4 py-2 rounded border text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-sm"
                >
                  Record Correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Clearance Price Tag & Barcode Modal */}
      {stickerProduct && (
        <BarcodeStickerModal
          product={stickerProduct}
          onClose={() => setStickerProduct(null)}
        />
      )}
    </div>
  );
};
