import React, { useState, useEffect, useMemo } from "react";
import { StockAgeingReport, StockAgeingProduct, Supplier, Business } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { EmptyState } from "../components/EmptyState";
import {
  Hourglass, AlertTriangle, AlertCircle, IndianRupee, Layers, CheckCircle2,
  RefreshCw, TrendingDown, Clock, ShieldAlert, Search, Filter,
  Download, ArrowRight, MessageCircle, Tag, Package, ExternalLink,
  ChevronRight, X, Sparkles, Send, Percent, HelpCircle
} from "lucide-react";
import { buildWhatsAppUrl, openWhatsAppUrl } from "../utils/whatsapp";

export const StockAgeingPage: React.FC = () => {
  const { t, language } = useLanguage();
  const isKn = language === "kn";

  const [report, setReport] = useState<StockAgeingReport | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & sorting
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCohortFilter, setSelectedCohortFilter] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<"VALUE_DESC" | "DAYS_DESC" | "STOCK_DESC">("VALUE_DESC");

  // Liquidation & Vendor Return Modal
  const [selectedProduct, setSelectedProduct] = useState<StockAgeingProduct | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | undefined>();
  const [customPhone, setCustomPhone] = useState("");

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [ageingData, supData, bizData] = await Promise.all([
        api.getStockAgeing(),
        api.getSuppliers().catch(() => []),
        api.getBusinessProfile().catch(() => null),
      ]);
      setReport(ageingData);
      setSuppliers(supData);
      setBusiness(bizData);
      if (supData.length > 0) setSelectedSupplierId(supData[0].id);
    } catch (err: any) {
      setError(err.message || "Failed to load stock ageing intelligence");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute Total Capital Tied Up across all cohorts
  const totalInventoryCapital = useMemo(() => {
    if (!report) return 0;
    return report.cohorts.reduce((sum, c) => sum + c.total_tied_up_capital, 0);
  }, [report]);

  const activeCapital = useMemo(() => {
    if (!report) return 0;
    const active = report.cohorts.find((c) => c.cohort_name.includes("0-30"));
    return active ? active.total_tied_up_capital : 0;
  }, [report]);

  const healthScore = totalInventoryCapital > 0 ? Math.round((activeCapital / totalInventoryCapital) * 100) : 100;

  // Filtered and sorted products
  const displayedProducts = useMemo(() => {
    if (!report) return [];
    let list = [...report.slow_and_dead_products];

    // Cohort filter
    if (selectedCohortFilter !== "ALL") {
      list = list.filter((p) => {
        if (selectedCohortFilter === "SLOW") return p.status === "SLOW";
        if (selectedCohortFilter === "DORMANT") return p.status === "DORMANT";
        if (selectedCohortFilter === "DEAD") return p.status === "DEAD" || p.status === "DEAD_STOCK";
        return true;
      });
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter((p) => p.product_name.toLowerCase().includes(q));
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === "VALUE_DESC") return b.inventory_value - a.inventory_value;
      if (sortBy === "DAYS_DESC") return b.days_since_last_sale - a.days_since_last_sale;
      if (sortBy === "STOCK_DESC") return b.current_stock - a.current_stock;
      return 0;
    });

    return list;
  }, [report, selectedCohortFilter, searchQuery, sortBy]);

  const handleOpenLiquidation = (product: StockAgeingProduct) => {
    setSelectedProduct(product);
    if (suppliers.length > 0) {
      setSelectedSupplierId(suppliers[0].id);
      setCustomPhone(suppliers[0].phone || "");
    }
  };

  const handleSendVendorReturn = () => {
    if (!selectedProduct) return;
    const sup = suppliers.find((s) => s.id === selectedSupplierId);
    const phone = customPhone || sup?.phone || "";
    const shopName = business?.name || "Haveri kirana & General Stores";
    const shopCity = business?.city || "Haveri";

    let message = "";
    if (isKn) {
      message = `📦 *ಮಾರಾಟವಾಗದ ಸರಕು ವಾಪಸಾತಿ / ರಿಟರ್ನ್ ಮನವಿ*\n` +
        `ಅಂಗಡಿ: *${shopName}* (${shopCity})\n` +
        `ಪೂರೈಕೆದಾರರಿಗೆ: *${sup?.name || "ವಿತರಕರು"}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `ನಮಸ್ಕಾರ,\n` +
        `ನಮ್ಮ ಅಂಗಡಿಯಲ್ಲಿ ಈ ಕೆಳಗಿನ ವಸ್ತುವು ಕಳೆದ ${selectedProduct.days_since_last_sale} ದಿನಗಳಿಂದ ಚಲನೆಯಿಲ್ಲದೆ ಉಳಿದಿದೆ:\n\n` +
        `• ವಸ್ತು: *${selectedProduct.product_name}*\n` +
        `• ಉಳಿದ ಪ್ರಮಾಣ: *${selectedProduct.current_stock} ಯೂನಿಟ್*\n` +
        `• ಅಂದಾಜು ಖರೀದಿ ಮೌಲ್ಯ: *₹${selectedProduct.inventory_value.toFixed(2)}*\n\n` +
        `ಮುಂದಿನ ಸ್ಟಾಕ್ ವಿತರಣೆಯಲ್ಲಿ ಈ ವಸ್ತುಗಳನ್ನು ವಾಪಸ್ ಪಡೆದು ಕ್ರೆಡಿಟ್ ನೋಟ್ ಅಥವಾ ಬದಲೀ ಹೊಸ ಸರಕು ನೀಡಲು ವಿನಂತಿ.\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `ಧನ್ಯವಾದಗಳು!`;
    } else {
      message = `📦 *STOCK RETURN / VENDOR BUYBACK REQUEST*\n` +
        `From: *${shopName}* (${shopCity})\n` +
        `To: *${sup?.name || "Distributor"}*\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Dear Supplier,\n` +
        `The following item has been stagnant at our store with no sales for ${selectedProduct.days_since_last_sale} days:\n\n` +
        `• Product: *${selectedProduct.product_name}*\n` +
        `• Unsold Stock: *${selectedProduct.current_stock} units*\n` +
        `• Locked Capital: *₹${selectedProduct.inventory_value.toFixed(2)}*\n\n` +
        `Kindly arrange a return credit or exchange during your next delivery run.\n` +
        `━━━━━━━━━━━━━━━━━━━━━\n` +
        `Thank you for your partnership!`;
    }

    const url = buildWhatsAppUrl(phone, message);
    if (url) {
      openWhatsAppUrl(url);
    } else {
      openWhatsAppUrl(`https://wa.me/?text=${encodeURIComponent(message)}`);
    }
  };

  const handleExportCSV = () => {
    if (!report || report.slow_and_dead_products.length === 0) {
      alert("No stagnant inventory records to export");
      return;
    }

    const headers = ["Product Name", "Current Stock", "Unit Cost (INR)", "Locked Capital (INR)", "Days Idle", "Ageing Status"];
    const rows = report.slow_and_dead_products.map((p) => [
      `"${p.product_name.replace(/"/g, '""')}"`,
      p.current_stock,
      p.unit_cost.toFixed(2),
      p.inventory_value.toFixed(2),
      p.days_since_last_sale,
      p.status
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Stock_Ageing_Audit_${new Date().toISOString().split("T")[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <Hourglass className="w-6 h-6 text-amber-500" />
            <span>{isKn ? "ದಾಸ್ತಾನು ವಯಸ್ಸಾಗುವಿಕೆ & ಡೆಡ್ ಸ್ಟಾಕ್ (Stock Ageing)" : "Stock Ageing & Dead Stock Intelligence"}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isKn
              ? "ಚಲನೆಯಿಲ್ಲದ ಸರಕು, ಲಾಕ್ ಆಗಿರುವ ದುಡಿಯುವ ಬಂಡವಾಳ ಮತ್ತು ಎಕ್ಸ್‌ಪೈರಿ ನಷ್ಟಗಳನ್ನು ತಡೆಯುವ ಮುನ್ಸೂಚನೆ"
              : "Identify dormant inventory, unlock frozen working capital, and prevent expiry write-offs"}
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchData}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title={t("refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Export Audit CSV</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-amber-600" />
          <span>{t("loading")}</span>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-2xl text-rose-700 dark:text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : !report ? (
        <EmptyState
          title={isKn ? "ದಾಸ್ತಾನು ಮಾಹಿತಿ ಇಲ್ಲ" : "No Stock Ageing Data"}
          description="Stock movements and invoice sales will populate chronological ageing cohorts."
        />
      ) : (
        <>
          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Total Valuation */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isKn ? "ಒಟ್ಟು ದಾಸ್ತಾನು ಬಂಡವಾಳ" : "Total Inventory Capital"}
                </span>
                <div className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600">
                  <IndianRupee className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-slate-900 dark:text-white mt-1.5">
                ₹{totalInventoryCapital.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Valued at wholesale cost on shelves
              </div>
            </div>

            {/* Locked in Dead Stock */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isKn ? "ಡೆಡ್ ಸ್ಟಾಕ್‌ನಲ್ಲಿರುವ ಬಂಡವಾಳ (90d+)" : "Locked in Dead Stock (90d+)"}
                </span>
                <div className="p-1.5 rounded-lg bg-rose-100 dark:bg-rose-950/80 text-rose-600">
                  <ShieldAlert className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1.5">
                ₹{report.total_dead_stock_value.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {report.total_dead_stock_value > 0 ? "Requires urgent vendor return or sale" : "No frozen dead capital"}
              </div>
            </div>

            {/* Stagnant SKU Count */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isKn ? "ಚಲನೆಯಿಲ್ಲದ ವಸ್ತುಗಳು" : "Stagnant Inventory SKUs"}
                </span>
                <div className="p-1.5 rounded-lg bg-amber-100 dark:bg-amber-950/80 text-amber-600">
                  <Clock className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1.5">
                {report.slow_and_dead_products.length} SKUs
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                Inactive for 30+ days without counter bills
              </div>
            </div>

            {/* Working Capital Health Index */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  {isKn ? "ಬಂಡವಾಳ ಚಲನೆಯ ಆರೋಗ್ಯ" : "Working Capital Health Index"}
                </span>
                <div className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-950/80 text-blue-600">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-blue-600 dark:text-blue-400 mt-1.5">
                {healthScore}%
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">
                {healthScore >= 80 ? "Optimal rapid inventory turns" : "Sub-optimal: Too much frozen stock"}
              </div>
            </div>
          </div>

          {/* Capital Distribution Stacked Visual Progress Bar */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                  Working Capital Ageing Distribution (ಬಂಡವಾಳ ವಯಸ್ಸಿನ ವಿಂಗಡಣೆ)
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Proportion of shop money deployed across inventory age brackets
                </p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">
                Total: ₹{totalInventoryCapital.toFixed(2)}
              </span>
            </div>

            {/* Visual Bar */}
            <div className="h-3.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
              {report.cohorts.map((c, idx) => {
                const pct = totalInventoryCapital > 0 ? (c.total_tied_up_capital / totalInventoryCapital) * 100 : 0;
                const colors = [
                  "bg-emerald-500", // 0-30d
                  "bg-blue-500",    // 31-60d
                  "bg-amber-500",   // 61-90d
                  "bg-rose-500",    // 90d+
                ];
                return (
                  <div
                    key={c.cohort_name}
                    style={{ width: `${pct}%` }}
                    title={`${c.cohort_name}: ₹${c.total_tied_up_capital.toFixed(2)} (${pct.toFixed(1)}%)`}
                    className={`h-full ${colors[idx % colors.length]} transition-all`}
                  />
                );
              })}
            </div>

            {/* Cohort Legend Chips */}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
              {report.cohorts.map((c, idx) => {
                const colors = [
                  "bg-emerald-500",
                  "bg-blue-500",
                  "bg-amber-500",
                  "bg-rose-500",
                ];
                const pct = totalInventoryCapital > 0 ? (c.total_tied_up_capital / totalInventoryCapital) * 100 : 0;
                return (
                  <div
                    key={c.cohort_name}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-[11px]"
                  >
                    <span className={`w-2 h-2 rounded-full ${colors[idx % colors.length]}`} />
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {c.cohort_name}
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      ₹{c.total_tied_up_capital.toFixed(0)}
                    </span>
                    <span className="text-slate-400">({pct.toFixed(0)}%)</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 4 Interactive Ageing Cohort Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {report.cohorts.map((cohort, idx) => {
              const colors = [
                { border: "border-emerald-300 dark:border-emerald-800", text: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50/50 dark:bg-emerald-950/20" },
                { border: "border-blue-300 dark:border-blue-800", text: "text-blue-600 dark:text-blue-400", bg: "bg-blue-50/50 dark:bg-blue-950/20" },
                { border: "border-amber-300 dark:border-amber-800", text: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50/50 dark:bg-amber-950/20" },
                { border: "border-rose-300 dark:border-rose-800", text: "text-rose-600 dark:text-rose-400", bg: "bg-rose-50/50 dark:bg-rose-950/20" },
              ];
              const cStyle = colors[idx % colors.length];

              return (
                <div
                  key={cohort.cohort_name}
                  className={`bg-white dark:bg-slate-900 border rounded-2xl p-5 shadow-sm space-y-3 relative transition-all ${cStyle.border}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${cStyle.bg} ${cStyle.text}`}>
                      {cohort.cohort_name}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      {cohort.product_count} products
                    </span>
                  </div>

                  <div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Tied-up Capital (ಹೂಡಿದ ಹಣ)
                    </div>
                    <div className={`text-xl font-bold mt-0.5 font-mono ${cStyle.text}`}>
                      ₹{cohort.total_tied_up_capital.toFixed(2)}
                    </div>
                  </div>

                  <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between">
                    <span>Physical Stock Units:</span>
                    <span className="font-bold text-slate-900 dark:text-white font-mono">
                      {cohort.total_units} units
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stagnant Inventory Item Details & Liquidation Actions */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm space-y-4 p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Slow-Moving & Dead Stock Item Registry
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Items with 30+ days without sales — initiate vendor buybacks, counter clearance tags, or promotional bundles
                </p>
              </div>

              {/* Sort selector */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-400 font-medium">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <option value="VALUE_DESC">Highest Locked Capital (₹)</option>
                  <option value="DAYS_DESC">Longest Days Idle</option>
                  <option value="STOCK_DESC">Largest Unsold Stock</option>
                </select>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 absolute left-3 top-2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search stagnant products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              {/* Status Filter Pills */}
              <div className="flex items-center gap-1.5 text-xs font-medium">
                {(["ALL", "SLOW", "DORMANT", "DEAD"] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setSelectedCohortFilter(filterKey)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-colors ${
                      selectedCohortFilter === filterKey
                        ? "bg-amber-600 text-white shadow-xs"
                        : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900"
                    }`}
                  >
                    {filterKey === "ALL" ? "All Stagnant" : filterKey === "SLOW" ? "Slow (31-60d)" : filterKey === "DORMANT" ? "Dormant (61-90d)" : "Dead Stock (90d+)"}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            {displayedProducts.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl space-y-2">
                <CheckCircle2 className="w-8 h-8 mx-auto text-emerald-500 opacity-80" />
                <p className="font-bold text-slate-700 dark:text-slate-300 text-sm">
                  {searchQuery || selectedCohortFilter !== "ALL"
                    ? "No items match your active search filters."
                    : "Zero Dead Stock Detected!"}
                </p>
                <p className="max-w-md mx-auto text-slate-400">
                  {searchQuery || selectedCohortFilter !== "ALL"
                    ? "Clear filters or adjust your search query to see other stagnant inventory."
                    : "All inventory in your Kirana catalogue is actively circulating within healthy 30-day replenishment windows."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase tracking-wider">
                    <tr>
                      <th className="py-3 px-4">Product Name</th>
                      <th className="py-3 px-4 text-right">Current Stock</th>
                      <th className="py-3 px-4 text-right">Unit Wholesale Cost</th>
                      <th className="py-3 px-4 text-right">Locked Working Capital</th>
                      <th className="py-3 px-4 text-center">Days Inactive</th>
                      <th className="py-3 px-4 text-center">Ageing Status</th>
                      <th className="py-3 px-4 text-center">Action Plan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {displayedProducts.map((p) => {
                      const isDead = p.status === "DEAD" || p.status === "DEAD_STOCK";
                      const isDormant = p.status === "DORMANT";
                      return (
                        <tr key={p.product_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3.5 px-4 font-bold text-slate-900 dark:text-white">
                            {p.product_name}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                            {p.current_stock}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                            ₹{p.unit_cost.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-right font-mono font-black text-rose-600 dark:text-rose-400 text-sm">
                            ₹{p.inventory_value.toFixed(2)}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono">
                            <span className="font-bold text-slate-800 dark:text-slate-200">{p.days_since_last_sale}</span>
                            <span className="text-[10px] text-slate-400 ml-1">days</span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                              isDead
                                ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                                : isDormant
                                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-300 dark:border-blue-800"
                            }`}>
                              {p.status}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-center">
                            <button
                              onClick={() => handleOpenLiquidation(p)}
                              className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-800 dark:text-amber-200 rounded-lg text-xs font-bold transition-all border border-amber-200 dark:border-amber-800"
                            >
                              <span>Liquidation Plan</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* Liquidation & Vendor Return Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  <span>Stagnant Inventory Liquidation Plan</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Actionable options to recover frozen capital for <span className="font-bold text-slate-800 dark:text-slate-200">{selectedProduct.product_name}</span>
                </p>
              </div>
              <button
                onClick={() => setSelectedProduct(null)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Product Snapshot */}
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-3 gap-2 text-center text-xs">
              <div>
                <p className="text-[10px] text-slate-400">Unsold Quantity</p>
                <p className="font-bold text-slate-900 dark:text-white mt-0.5 font-mono text-sm">{selectedProduct.current_stock}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Days Idle</p>
                <p className="font-bold text-amber-600 dark:text-amber-400 mt-0.5 font-mono text-sm">{selectedProduct.days_since_last_sale} days</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">Locked Capital</p>
                <p className="font-bold text-rose-600 dark:text-rose-400 mt-0.5 font-mono text-sm">₹{selectedProduct.inventory_value.toFixed(2)}</p>
              </div>
            </div>

            {/* Strategy 1: Vendor Return / Exchange via WhatsApp */}
            <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/40 dark:bg-emerald-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900 dark:text-emerald-200">
                  <MessageCircle className="w-4 h-4 text-emerald-600" />
                  <span>Strategy A: Distributor Return Request</span>
                </div>
                <span className="text-[10px] bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-1.5 py-0.5 rounded font-bold">
                  RECOMMENDED
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-400">
                In Indian FMCG distribution, distributors often offer replacements or credit notes for slow-moving packaging lines before expiry.
              </p>

              {suppliers.length > 0 ? (
                <div className="space-y-2">
                  <label className="text-[11px] text-slate-500 font-medium">Select Wholesale Supplier:</label>
                  <select
                    value={selectedSupplierId}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setSelectedSupplierId(id);
                      const s = suppliers.find((x) => x.id === id);
                      if (s) setCustomPhone(s.phone || "");
                    }}
                    className="w-full p-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name} {s.phone ? `(${s.phone})` : ""}</option>
                    ))}
                  </select>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleSendVendorReturn}
                className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
              >
                <Send className="w-4 h-4" />
                <span>Send Return Request via WhatsApp</span>
              </button>
            </div>

            {/* Strategy 2: Counter Clearance Markdown */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <Percent className="w-4 h-4 text-blue-600" />
                <span>Strategy B: POS Clearance Markdown (15% – 25% Off)</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Mark down at the POS counter or apply a promotional discount tag. Even selling at cost (₹{selectedProduct.unit_cost.toFixed(2)}) recovers your 100% principal working capital to reinvest in fast-movers.
              </p>
            </div>

            {/* Strategy 3: Fast-Mover Bundle */}
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5 text-xs">
              <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                <Package className="w-4 h-4 text-purple-600" />
                <span>Strategy C: Kirana Staple Bundle</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Bundle this item with high-frequency essentials (e.g. Atta, Cooking Oil, or Sugar) as a special weekend combo pack to liquidate units immediately.
              </p>
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedProduct(null)}
                className="px-4 py-2 rounded-lg bg-slate-800 text-white font-bold text-xs hover:bg-slate-700 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
