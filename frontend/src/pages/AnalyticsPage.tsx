import React, { useState, useEffect, useMemo } from "react";
import {
  FinancialSummary,
  DailySalesPoint,
  ProductPerformancePoint,
  CategoryPerformancePoint,
  Business,
} from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { KannadaText } from "../components/common/KannadaText";
import {
  BarChart3,
  PieChart,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  Receipt,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { Gstr1ExportModal } from "../components/common/Gstr1ExportModal";

type TimeRangeOption = "7D" | "14D" | "30D" | "THIS_MONTH" | "ALL";

const toLocalISODate = (dateObj: Date): string => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const formatCompactINR = (val: number): string => {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k`;
  return `₹${Math.round(val)}`;
};

const CATEGORY_BAR_STYLES = [
  "bg-[#5EEAD4] shadow-[0_0_10px_rgba(94,234,212,0.3)]",
  "bg-[#7DD3FC] shadow-[0_0_10px_rgba(125,211,252,0.28)]",
  "bg-[#A78BFA] shadow-[0_0_10px_rgba(167,139,250,0.28)]",
  "bg-[#6EE7B7] shadow-[0_0_10px_rgba(110,231,183,0.28)]",
  "bg-[#FBBF24] shadow-[0_0_10px_rgba(251,191,36,0.25)]",
];

const CATEGORY_DOT_STYLES = [
  "bg-[#5EEAD4]",
  "bg-[#7DD3FC]",
  "bg-[#A78BFA]",
  "bg-[#6EE7B7]",
  "bg-[#FBBF24]",
];

export const AnalyticsPage: React.FC = () => {
  const { t, language, formatMoney, formatDateLocalized } = useLanguage();
  const isKn = language === "kn";

  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [dailySales, setDailySales] = useState<DailySalesPoint[]>([]);
  const [topProducts, setTopProducts] = useState<ProductPerformancePoint[]>([]);
  const [categories, setCategories] = useState<CategoryPerformancePoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isGstr1ModalOpen, setIsGstr1ModalOpen] = useState(false);
  const [business, setBusiness] = useState<Business | null>(null);

  const [timeRange, setTimeRange] = useState<TimeRangeOption>("30D");
  const [chartMode, setChartMode] = useState<"BOTH" | "SALES" | "PROFIT">("BOTH");

  const computeDateRange = (
    range: TimeRangeOption
  ): { start: string; end: string; days: number; monthStart?: string } => {
    const today = new Date();
    const endStr = toLocalISODate(today);

    if (range === "7D") {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      return { start: toLocalISODate(start), end: endStr, days: 7 };
    }
    if (range === "14D") {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 13);
      return { start: toLocalISODate(start), end: endStr, days: 14 };
    }
    if (range === "30D") {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      return { start: toLocalISODate(start), end: endStr, days: 30 };
    }
    if (range === "THIS_MONTH") {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      const startStr = toLocalISODate(start);
      const dayOfMonth = Math.max(7, Math.min(90, today.getDate()));
      return { start: startStr, end: endStr, days: dayOfMonth, monthStart: startStr };
    }
    return { start: "2020-01-01", end: endStr, days: 60 };
  };

  const fetchAnalytics = async () => {
    setLoading(true);
    setError(null);
    try {
      api.getBusinessProfile().then(setBusiness).catch(() => {});
      const { start, end, days, monthStart } = computeDateRange(timeRange);
      const [sumData, dailyData, topData, catData] = await Promise.all([
        api.getFinancialSummary(start, end),
        api.getDailySales(days),
        api.getTopProducts(10),
        api.getCategoryPerformance(),
      ]);
      setSummary(sumData);
      setDailySales(monthStart ? dailyData.filter((d) => d.date >= monthStart) : dailyData);
      setTopProducts(topData);
      setCategories([...catData].sort((a, b) => b.revenue - a.revenue));
    } catch (err: any) {
      setError(err.message || "Failed to load financial analytics");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [timeRange]);

  const maxMetricValue = useMemo(() => {
    if (dailySales.length === 0) return 100;
    if (chartMode === "PROFIT") {
      return Math.max(...dailySales.map((d) => Math.max(0, d.profit)), 10);
    }
    return Math.max(...dailySales.map((d) => Math.max(d.sales, d.profit)), 10);
  }, [dailySales, chartMode]);

  const activeDaysCount = useMemo(
    () => dailySales.filter((d) => d.sales > 0).length,
    [dailySales]
  );

  const peakDay = useMemo(() => {
    if (dailySales.length === 0) return null;
    return dailySales.reduce((best, cur) => (cur.sales > best.sales ? cur : best), dailySales[0]);
  }, [dailySales]);

  const sortedSkus = useMemo(() => topProducts, [topProducts]);

  const operatingMarginPct = useMemo(() => {
    if (!summary || summary.net_sales <= 0) return 0;
    return (summary.operating_profit / summary.net_sales) * 100;
  }, [summary]);

  const overheadRatioPct = useMemo(() => {
    if (!summary || summary.net_sales <= 0) return 0;
    return (summary.operating_expenses / summary.net_sales) * 100;
  }, [summary]);

  const cogsRatioPct = useMemo(() => {
    if (!summary || summary.net_sales <= 0) return 0;
    return (summary.cost_of_goods_sold / summary.net_sales) * 100;
  }, [summary]);

  const xAxisStep = useMemo(() => {
    if (dailySales.length <= 10) return 1;
    if (dailySales.length <= 16) return 2;
    if (dailySales.length <= 35) return 5;
    return 10;
  }, [dailySales.length]);

  return (
    <div className="max-w-7xl mx-auto pb-2">
      {/* Unified Midnight Mist Liquid Glass Financial Analytics & P&L Terminal */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.12)] relative overflow-hidden backdrop-blur-2xl">
        {/* Ambient diffuse highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-gradient-to-br from-[#5EEAD4]/14 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-24 w-72 h-72 bg-gradient-to-tl from-[#A78BFA]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* 1. Header & Period Underline Controls */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_12px_rgba(94,234,212,0.25)] shrink-0">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[#6EE7B7] tracking-wider uppercase font-semibold">
                  {isKn ? "ಆರ್ಥಿಕ ವಿಶ್ಲೇಷಣೆ ಮತ್ತು ಲಾಭದ ಲೆಕ್ಕ" : "Financial Analytics & P&L"}
                </span>
                {summary && (
                  <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/[0.1] text-[#A1AEBB] tabular-nums">
                    {timeRange === "ALL"
                      ? `All Time → ${formatDateLocalized(summary.end_date)}`
                      : `${summary.start_date} → ${summary.end_date}`}
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] truncate mt-0.5">
                {isKn
                  ? "ಮಾರಾಟ ಆದಾಯ, ಖರೀದಿ ವೆಚ್ಚ (COGS), ನಿರ್ವಹಣಾ ವೆಚ್ಚಗಳು ಮತ್ತು ಜಿಎಸ್‌ಟಿ ವರದಿಗಳು"
                  : "Audited trading margin waterfall, COGS basis, inventory capital & GST filing readiness"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 shrink-0">
            {/* Underline Period Tabs */}
            <div className="flex items-center gap-4 text-xs font-semibold">
              {(["7D", "14D", "30D", "THIS_MONTH", "ALL"] as const).map((r) => {
                const isActive = timeRange === r;
                const label =
                  r === "7D"
                    ? "7D"
                    : r === "14D"
                    ? "14D"
                    : r === "30D"
                    ? "30D"
                    : r === "THIS_MONTH"
                    ? isKn
                      ? "ಈ ತಿಂಗಳು"
                      : "Month"
                    : isKn
                    ? "ಎಲ್ಲಾ"
                    : "All";
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setTimeRange(r)}
                    className={`pb-1.5 relative transition-all whitespace-nowrap active:scale-[0.98] ${
                      isActive ? "text-[#F8FAFC] font-bold" : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                    }`}
                  >
                    {label}
                    {isActive && (
                      <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6EE7B7] rounded-full shadow-[0_0_8px_#5EEAD4]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={fetchAnalytics}
                className="liquid-btn-secondary p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] shrink-0"
                title={t("refresh")}
                aria-label={t("refresh")}
              >
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#5EEAD4]" : ""}`} />
              </button>

              <button
                type="button"
                onClick={() => setIsGstr1ModalOpen(true)}
                className="liquid-btn-primary px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{isKn ? "GSTR-1 ವರದಿ" : "Export GSTR-1"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Loading / Error / Empty States */}
        {loading && !summary ? (
          <div className="relative z-10 py-16 text-center text-[#A1AEBB] text-xs space-y-2.5">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#5EEAD4]" />
            <div>{t("loading")}</div>
          </div>
        ) : error ? (
          <div className="relative z-10 m-6 p-4 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={fetchAnalytics}
              className="underline font-semibold hover:text-[#F8FAFC]"
            >
              Retry
            </button>
          </div>
        ) : !summary ? (
          <div className="relative z-10 py-14 px-6 flex flex-col items-center justify-center text-center">
            <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-[#5EEAD4]/35 flex items-center justify-center text-[#6EE7B7] mb-3">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-[#F8FAFC]">
              {isKn ? "ಯಾವುದೇ ವಿಶ್ಲೇಷಣೆ ಲಭ್ಯವಿಲ್ಲ" : "No Financial Analytics Available"}
            </h3>
            <p className="text-xs text-[#A1AEBB] max-w-md mt-1.5">
              {isKn
                ? "ಪಿಒಎಸ್ ಕೌಂಟರ್‌ನಲ್ಲಿ ಮಾರಾಟ ಮತ್ತು ವೆಚ್ಚಗಳನ್ನು ದಾಖಲಿಸಿ ನಿಮ್ಮ ಅಂಗಡಿಯ ಲಾಭದ ವಿಶ್ಲೇಷಣೆಯನ್ನು ವೀಕ್ಷಿಸಿ."
                : "Record customer sales at POS and operating expenses to generate audited financial analysis."}
            </p>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-[#A1AEBB] mt-3.5">
              <ShieldCheck className="w-3.5 h-3.5 text-[#6EE7B7]" />
              <span>Strict Real-Data Policy • Zero synthetic figures</span>
            </div>
          </div>
        ) : (
          <div className="relative z-10">
            {/* 2. Primary P&L Architectural KPI Strip (4 Hairline Columns) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-b border-white/[0.08]">
              {/* Col 1: Net Revenue */}
              <div
                className="px-5 sm:px-6 py-4 flex flex-col justify-between"
                title="Net Revenue = Gross billings minus customer discounts and product returns."
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                    {isKn ? "ನಿವ್ವಳ ಮಾರಾಟ" : "Net Revenue"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#A1AEBB] tabular-nums whitespace-nowrap">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#7DD3FC]" />
                    {summary.total_invoices_count} {summary.total_invoices_count === 1 ? "bill" : "bills"}
                  </span>
                </div>
                <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
                  {formatMoney(summary.net_sales)}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
                  <span>Gross: {formatMoney(summary.gross_sales)}</span>
                  <span>AOV {formatMoney(summary.average_order_value)}</span>
                </div>
              </div>

              {/* Col 2: Cost of Goods Sold */}
              <div
                className="px-5 sm:px-6 py-4 flex flex-col justify-between"
                title="Weighted average wholesale purchase cost of products sold."
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                    {isKn ? "ಖರೀದಿ ವೆಚ್ಚ (COGS)" : "Cost of Goods (COGS)"}
                  </span>
                  <span className="text-[11px] font-medium text-[#FBBF24] tabular-nums whitespace-nowrap">
                    {cogsRatioPct.toFixed(1)}% ratio
                  </span>
                </div>
                <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
                  {formatMoney(summary.cost_of_goods_sold)}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB]">
                  <span>Weighted Average Cost</span>
                  <span className="text-[#FBBF24]/90 font-medium">Direct Cost</span>
                </div>
              </div>

              {/* Col 3: Gross Trading Profit */}
              <div
                className="px-5 sm:px-6 py-4 flex flex-col justify-between"
                title="Trading margin: Net Sales minus Cost of Goods Sold."
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                    {isKn ? "ಒಟ್ಟು ಲಾಭ" : "Gross Profit"}
                  </span>
                  <span
                    className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                      summary.gross_profit >= 0 ? "text-[#7DD3FC]" : "text-[#FB7185]"
                    }`}
                  >
                    {summary.gross_margin_percent.toFixed(1)}% margin
                  </span>
                </div>
                <div
                  className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums mt-2 ${
                    summary.gross_profit >= 0 ? "text-[#7DD3FC]" : "text-[#FB7185]"
                  }`}
                >
                  {summary.gross_profit >= 0 ? "+" : ""}
                  {formatMoney(summary.gross_profit)}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB]">
                  <span>Pre-overhead gain</span>
                  <span className="text-[#7DD3FC]/90 font-medium">Trading Margin</span>
                </div>
              </div>

              {/* Col 4: Net Operating Profit */}
              <div
                className="px-5 sm:px-6 py-4 flex flex-col justify-between"
                title="True bottom-line earnings after deducting all operating costs."
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                    {isKn ? "ನಿವ್ವಳ ಲಾಭ" : "Operating Profit"}
                  </span>
                  <span
                    className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                      summary.operating_profit >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                    }`}
                  >
                    {operatingMarginPct.toFixed(1)}% net
                  </span>
                </div>
                <div
                  className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums mt-2 ${
                    summary.operating_profit >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                  }`}
                >
                  {summary.operating_profit >= 0 ? "+" : ""}
                  {formatMoney(summary.operating_profit)}
                </div>
                <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
                  <span>Overheads: {formatMoney(summary.operating_expenses)}</span>
                  <span
                    className={
                      summary.operating_profit >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                    }
                  >
                    {summary.operating_profit >= 0 ? "Surplus" : "Deficit"}
                  </span>
                </div>
              </div>
            </div>

            {/* 3. Secondary Store Health & Capital Telemetry Strip (Compact Rule) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] border-b border-white/[0.08] bg-[#080B10]/25">
              <div className="px-5 sm:px-6 py-3 flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#A1AEBB] whitespace-nowrap">
                    {isKn ? "ದಾಸ್ತಾನು ಮೌಲ್ಯ" : "Inventory Capital"}
                  </div>
                  <div className="text-sm font-bold text-[#F8FAFC] tabular-nums mt-0.5 whitespace-nowrap">
                    {formatMoney(summary.inventory_valuation)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-mono text-[#A78BFA] font-semibold tabular-nums whitespace-nowrap">
                    {summary.total_stock_units.toLocaleString("en-IN", { maximumFractionDigits: 0 })} units
                  </div>
                  <div className="text-[10px] text-[#A1AEBB]/75 whitespace-nowrap">On shelves</div>
                </div>
              </div>

              <div className="px-5 sm:px-6 py-3 flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#A1AEBB] whitespace-nowrap">
                    {isKn ? "ಸರಾಸರಿ ಬಿಲ್ ಮೊತ್ತ" : "Avg Basket (AOV)"}
                  </div>
                  <div className="text-sm font-bold text-[#F8FAFC] tabular-nums mt-0.5 whitespace-nowrap">
                    {formatMoney(summary.average_order_value)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[11px] font-mono text-[#7DD3FC] font-semibold tabular-nums whitespace-nowrap">
                    {summary.total_invoices_count} orders
                  </div>
                  <div className="text-[10px] text-[#A1AEBB]/75 whitespace-nowrap">Per checkout</div>
                </div>
              </div>

              <div className="px-5 sm:px-6 py-3 flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#A1AEBB] whitespace-nowrap">
                    {isKn ? "ಮರುಆದೇಶ ಎಚ್ಚರಿಕೆ" : "Low Stock Alerts"}
                  </div>
                  <div
                    className={`text-sm font-bold tabular-nums mt-0.5 whitespace-nowrap ${
                      summary.low_stock_products_count > 0 ? "text-[#FBBF24]" : "text-[#6EE7B7]"
                    }`}
                  >
                    {summary.low_stock_products_count}{" "}
                    {summary.low_stock_products_count === 1 ? "SKU" : "SKUs"}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div
                    className={`text-[10.5px] font-semibold whitespace-nowrap ${
                      summary.low_stock_products_count > 0 ? "text-[#FBBF24]" : "text-[#6EE7B7]"
                    }`}
                  >
                    {summary.low_stock_products_count > 0 ? "Reorder Needed" : "Optimal"}
                  </div>
                  <div className="text-[10px] text-[#A1AEBB]/75 whitespace-nowrap">Stock buffer</div>
                </div>
              </div>

              <div className="px-5 sm:px-6 py-3 flex items-center justify-between gap-2.5">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.09em] text-[#A1AEBB] whitespace-nowrap">
                    {isKn ? "ರಿಯಾಯಿತಿ & ಮರಳಿಸುವಿಕೆ" : "Discounts & Returns"}
                  </div>
                  <div
                    className={`text-sm font-bold tabular-nums mt-0.5 whitespace-nowrap ${
                      summary.discounts + summary.returns > 0 ? "text-[#FB7185]" : "text-[#F8FAFC]"
                    }`}
                  >
                    {formatMoney(summary.discounts + summary.returns)}
                  </div>
                </div>
                <div className="text-right shrink-0 text-[10.5px] text-[#A1AEBB] tabular-nums whitespace-nowrap">
                  <div>Disc: {formatMoney(summary.discounts)}</div>
                  <div>Ret: {formatMoney(summary.returns)}</div>
                </div>
              </div>
            </div>

            {/* 4. Audited Store Income Statement (Cardless P&L Waterfall Ledger) */}
            <div className="px-5 sm:px-7 py-5 border-b border-white/[0.08]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-white/[0.08]">
                <div>
                  <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-[#6EE7B7]" />
                    <span>
                      {isKn
                        ? "ಲಾಭ ಮತ್ತು ನಷ್ಟದ ವಿವರಣಾ ಪಟ್ಟಿ (P&L Statement)"
                        : "Store Income Statement (P&L Waterfall)"}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                    {isKn
                      ? "ಒಟ್ಟು ಮಾರಾಟದಿಂದ ನಿವ್ವಳ ನಿರ್ವಹಣಾ ಲಾಭದವರೆಗೆ ಹಂತ-ಹಂತದ ಲೆಕ್ಕ"
                      : "Audited bridge from gross invoiced billings to bottom-line operating profit"}
                  </p>
                </div>

                <span className="self-start sm:self-auto text-[11px] font-mono px-2.5 py-1 rounded-lg bg-[#080B10]/60 border border-white/[0.1] text-[#A1AEBB] tabular-nums">
                  {summary.total_invoices_count} {summary.total_invoices_count === 1 ? "Invoice" : "Invoices"} · Margin {summary.gross_margin_percent.toFixed(1)}%
                </span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] pt-4 text-xs">
                {/* Left Column: Top-line Sales -> Gross Trading Profit */}
                <div className="pb-5 lg:pb-0 lg:pr-8 space-y-2.5">
                  <div className="flex items-center justify-between py-1">
                    <span className="text-[#A1AEBB]">
                      (+) {isKn ? "ಒಟ್ಟು ಮಾರಾಟ (Gross Invoiced Sales)" : "Gross Invoiced Sales"}
                    </span>
                    <span className="font-mono font-semibold text-[#F8FAFC] tabular-nums">
                      {formatMoney(summary.gross_sales)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-[#A1AEBB]">
                      (−) {isKn ? "ಗ್ರಾಹಕ ರಿಯಾಯಿತಿ (Discounts)" : "Customer Discounts"}
                    </span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        summary.discounts > 0 ? "text-[#FB7185]" : "text-[#A1AEBB]"
                      }`}
                    >
                      −{formatMoney(summary.discounts)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-[#A1AEBB]">
                      (−) {isKn ? "ಮರಳಿಸಿದ ಸರಕು (Sales Returns)" : "Customer Sales Returns"}
                    </span>
                    <span
                      className={`font-mono font-semibold tabular-nums ${
                        summary.returns > 0 ? "text-[#FB7185]" : "text-[#A1AEBB]"
                      }`}
                    >
                      −{formatMoney(summary.returns)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-2.5 pb-1 border-t border-white/[0.12] font-bold">
                    <span className="text-[#F8FAFC]">
                      (=) {isKn ? "ನಿವ್ವಳ ಆದಾಯ (Net Realized Revenue)" : "Net Realized Revenue"}
                    </span>
                    <span className="font-mono text-sm text-[#F8FAFC] tabular-nums">
                      {formatMoney(summary.net_sales)}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-1">
                    <span className="text-[#A1AEBB]">
                      (−) {isKn ? "ಖರೀದಿ ವೆಚ್ಚ (Cost of Goods Sold)" : "Cost of Goods Sold (COGS)"}
                    </span>
                    <span className="font-mono font-semibold text-[#FBBF24] tabular-nums">
                      −{formatMoney(summary.cost_of_goods_sold)}
                    </span>
                  </div>

                  <div className="mt-2 pt-3 border-t border-[#5EEAD4]/30 flex items-center justify-between font-bold">
                    <div className="flex items-center gap-2">
                      <span className="text-[#7DD3FC]">
                        (=) {isKn ? "ಒಟ್ಟು ವ್ಯಾಪಾರ ಲಾಭ" : "Gross Trading Profit"}
                      </span>
                      <span className="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-[#7DD3FC]/12 border border-[#7DD3FC]/25 text-[#7DD3FC] tabular-nums">
                        {summary.gross_margin_percent.toFixed(1)}%
                      </span>
                    </div>
                    <span
                      className={`font-mono text-base tabular-nums ${
                        summary.gross_profit >= 0 ? "text-[#7DD3FC]" : "text-[#FB7185]"
                      }`}
                    >
                      {summary.gross_profit >= 0 ? "+" : ""}
                      {formatMoney(summary.gross_profit)}
                    </span>
                  </div>
                </div>

                {/* Right Column: Gross Trading Profit -> Operating Profit */}
                <div className="pt-5 lg:pt-0 lg:pl-8 flex flex-col justify-between gap-4">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between py-1">
                      <span className="font-semibold text-[#F8FAFC]">
                        {isKn ? "ಮುಂದುವರಿದ ಒಟ್ಟು ಲಾಭ" : "Gross Trading Profit Brought Forward"}
                      </span>
                      <span className="font-mono font-semibold text-[#7DD3FC] tabular-nums">
                        {formatMoney(summary.gross_profit)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <div>
                        <div className="text-[#A1AEBB]">
                          (−) {isKn ? "ಅಂಗಡಿ ನಿರ್ವಹಣಾ ವೆಚ್ಚಗಳು" : "Shop Operating Expenses"}
                        </div>
                        <div className="text-[10.5px] text-[#A1AEBB]/70 mt-0.5">
                          Rent, electricity, wages, freight & misc. vouchers
                        </div>
                      </div>
                      <span
                        className={`font-mono font-semibold tabular-nums ${
                          summary.operating_expenses > 0 ? "text-[#FB7185]" : "text-[#A1AEBB]"
                        }`}
                      >
                        −{formatMoney(summary.operating_expenses)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] text-[11.5px]">
                      <span className="text-[#A1AEBB]">Operating Overhead Ratio</span>
                      <span className="font-mono font-semibold text-[#A1AEBB] tabular-nums">
                        {overheadRatioPct.toFixed(1)}% of net sales
                      </span>
                    </div>
                  </div>

                  {/* Highlighted Bottom Line Operating Profit Strip (Midnight Mist Translucent) */}
                  <div
                    className={`rounded-xl px-4 py-3 border flex items-center justify-between gap-4 ${
                      summary.operating_profit >= 0
                        ? "bg-[#6EE7B7]/[0.08] border-[#6EE7B7]/30"
                        : "bg-[#FB7185]/[0.09] border-[#FB7185]/35"
                    }`}
                  >
                    <div>
                      <div
                        className={`text-[11px] font-bold uppercase tracking-wider ${
                          summary.operating_profit >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                        }`}
                      >
                        {isKn ? "ಅಂತಿಮ ನಿವ್ವಳ ಲಾಭ (Net Operating Profit)" : "Net Operating Profit"}
                      </div>
                      <div className="text-[11px] text-[#A1AEBB] mt-0.5 tabular-nums">
                        {summary.operating_profit >= 0
                          ? `Net operating margin ${operatingMarginPct.toFixed(1)}% · Profitable operations`
                          : "Operating overheads exceed gross trading margin"}
                      </div>
                    </div>
                    <div
                      className={`text-xl font-black font-mono tabular-nums whitespace-nowrap ${
                        summary.operating_profit >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                      }`}
                    >
                      {summary.operating_profit >= 0 ? "+" : ""}
                      {formatMoney(summary.operating_profit)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 5. Daily Revenue & Profit Trajectory */}
            <div className="px-5 sm:px-7 py-5 border-b border-white/[0.08]">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                  <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-[#7DD3FC]" />
                    <span>
                      {isKn ? "ದೈನಂದಿನ ಮಾರಾಟ ಮತ್ತು ಲಾಭದ ಪ್ರವೃತ್ತಿ" : "Daily Revenue & Profit Trajectory"}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#A1AEBB] mt-0.5 tabular-nums">
                    {dailySales.length} calendar days • {activeDaysCount} active billing{" "}
                    {activeDaysCount === 1 ? "day" : "days"}
                    {peakDay && peakDay.sales > 0
                      ? ` • Peak ${peakDay.date.slice(5)} (${formatMoney(peakDay.sales)})`
                      : ""}
                  </p>
                </div>

                {/* Underline Series Mode Tabs */}
                <div className="flex items-center gap-4 text-xs font-semibold self-start sm:self-auto">
                  {(
                    [
                      { key: "BOTH", label: isKn ? "ಎರಡೂ (Both)" : "Both" },
                      { key: "SALES", label: isKn ? "ಮಾರಾಟ ಮಾತ್ರ" : "Revenue" },
                      { key: "PROFIT", label: isKn ? "ಲಾಭ ಮಾತ್ರ" : "Gross Profit" },
                    ] as const
                  ).map((mode) => {
                    const isActive = chartMode === mode.key;
                    return (
                      <button
                        key={mode.key}
                        type="button"
                        onClick={() => setChartMode(mode.key)}
                        className={`pb-1.5 relative transition-all whitespace-nowrap ${
                          isActive ? "text-[#F8FAFC] font-bold" : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                        }`}
                      >
                        {mode.label}
                        {isActive && (
                          <span
                            className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${
                              mode.key === "SALES"
                                ? "bg-[#7DD3FC] shadow-[0_0_8px_#7DD3FC]"
                                : "bg-[#6EE7B7] shadow-[0_0_8px_#5EEAD4]"
                            }`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {dailySales.length === 0 || dailySales.every((d) => d.sales === 0) ? (
                <div className="py-10 text-center text-xs text-[#A1AEBB] border border-dashed border-white/[0.12] rounded-xl bg-[#080B10]/30">
                  No revenue recorded in this window. Process customer sales at the POS counter to build trend trajectories.
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Chart Stage with Y-axis Gridlines */}
                  <div className="relative h-52 flex gap-3 pt-4">
                    {/* Y-Axis Labels */}
                    <div className="w-12 shrink-0 flex flex-col justify-between items-end text-[10px] font-mono text-[#A1AEBB]/80 pb-px tabular-nums select-none">
                      <span>{formatCompactINR(maxMetricValue)}</span>
                      <span>{formatCompactINR(maxMetricValue / 2)}</span>
                      <span>₹0</span>
                    </div>

                    {/* Gridlines + Bars Container */}
                    <div className="flex-1 relative border-b border-white/[0.12]">
                      {/* Horizontal Dotted Reference Lines */}
                      <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                        <div className="border-t border-dashed border-white/[0.08] w-full" />
                        <div className="border-t border-dashed border-white/[0.06] w-full" />
                        <div />
                      </div>

                      {/* Bars Strip */}
                      <div className="relative z-10 h-full flex items-end gap-1 px-1">
                        {dailySales.map((d, idx) => {
                          const salesHeight = maxMetricValue > 0 ? (d.sales / maxMetricValue) * 100 : 0;
                          const profitHeight =
                            maxMetricValue > 0 ? (Math.max(0, d.profit) / maxMetricValue) * 100 : 0;
                          const tooltipAlign =
                            idx < 3
                              ? "left-0"
                              : idx > dailySales.length - 4
                              ? "right-0"
                              : "left-1/2 -translate-x-1/2";
                          const hasActivity = d.sales > 0 || d.profit !== 0;

                          return (
                            <div
                              key={d.date}
                              className="flex-1 h-full flex items-end justify-center gap-0.5 group relative hover:bg-white/[0.03] rounded-t transition-colors"
                            >
                              {/* High-contrast Dark Tooltip */}
                              <div
                                className={`absolute bottom-full mb-2 ${tooltipAlign} opacity-0 group-hover:opacity-100 transition-opacity bg-[#080B10]/95 border border-white/20 backdrop-blur-xl text-[#F8FAFC] text-[10.5px] px-3 py-2 rounded-xl shadow-2xl pointer-events-none whitespace-nowrap z-30 space-y-1`}
                              >
                                <div className="font-mono font-bold text-[#F8FAFC] border-b border-white/10 pb-1">
                                  {formatDateLocalized(d.date)} ({d.invoices}{" "}
                                  {d.invoices === 1 ? "bill" : "bills"})
                                </div>
                                <div className="flex items-center justify-between gap-4 text-[#7DD3FC] tabular-nums">
                                  <span>Net Revenue:</span>
                                  <span className="font-mono font-bold">{formatMoney(d.sales)}</span>
                                </div>
                                <div
                                  className={`flex items-center justify-between gap-4 tabular-nums ${
                                    d.profit >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                                  }`}
                                >
                                  <span>Gross Profit:</span>
                                  <span className="font-mono font-bold">{formatMoney(d.profit)}</span>
                                </div>
                              </div>

                              {/* Bars or subtle baseline */}
                              {!hasActivity ? (
                                <div className="w-full max-w-[10px] h-[2px] rounded-full bg-white/[0.1] group-hover:bg-white/30 transition-colors" />
                              ) : (
                                <>
                                  {chartMode !== "PROFIT" && d.sales > 0 && (
                                    <div
                                      style={{ height: `${Math.max(salesHeight, 3)}%` }}
                                      className="w-full max-w-[14px] rounded-t-sm bg-[#7DD3FC]/90 group-hover:bg-[#7DD3FC] shadow-[0_0_10px_rgba(125,211,252,0.28)] transition-all"
                                    />
                                  )}
                                  {chartMode !== "SALES" && d.profit > 0 && (
                                    <div
                                      style={{ height: `${Math.max(profitHeight, 3)}%` }}
                                      className="w-full max-w-[14px] rounded-t-sm bg-[#6EE7B7]/90 group-hover:bg-[#6EE7B7] shadow-[0_0_10px_rgba(110,231,183,0.28)] transition-all"
                                    />
                                  )}
                                  {chartMode !== "SALES" && d.profit < 0 && (
                                    <div
                                      style={{ height: "4px" }}
                                      className="w-full max-w-[14px] rounded-t-sm bg-[#FB7185]"
                                      title="Negative day margin"
                                    />
                                  )}
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Sparse Non-Colliding X-Axis Dates */}
                  <div className="flex gap-3">
                    <div className="w-12 shrink-0" />
                    <div className="flex-1 flex items-center gap-1 px-1 text-[10px] font-mono text-[#A1AEBB]/80 tabular-nums">
                      {dailySales.map((d, idx) => {
                        const showLabel =
                          idx === 0 ||
                          idx === dailySales.length - 1 ||
                          (idx % xAxisStep === 0 && dailySales.length - 1 - idx >= Math.ceil(xAxisStep / 2));
                        return (
                          <div key={d.date} className="flex-1 text-center overflow-visible whitespace-nowrap">
                            {showLabel ? d.date.slice(5) : ""}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[11px] text-[#A1AEBB]">
                    <div className="flex items-center gap-5">
                      {chartMode !== "PROFIT" && (
                        <span className="inline-flex items-center gap-1.5 font-medium text-[#F8FAFC]">
                          <span className="w-2.5 h-2.5 rounded-sm bg-[#7DD3FC] shadow-[0_0_6px_rgba(125,211,252,0.45)]" />
                          {isKn ? "ನಿವ್ವಳ ಮಾರಾಟ (Revenue)" : "Net Revenue"}
                        </span>
                      )}
                      {chartMode !== "SALES" && (
                        <span className="inline-flex items-center gap-1.5 font-medium text-[#F8FAFC]">
                          <span className="w-2.5 h-2.5 rounded-sm bg-[#6EE7B7] shadow-[0_0_6px_rgba(110,231,183,0.45)]" />
                          {isKn ? "ಒಟ್ಟು ಲಾಭ (Gross Profit)" : "Gross Profit"}
                        </span>
                      )}
                    </div>
                    <span className="text-[10.5px] text-[#A1AEBB]/75">
                      Hover any day column for bill count & exact figures
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* 6. Merchandise Performance Split (Cardless Two-Column Hairline Layout) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]">
              {/* Left: Top Selling SKUs Ledger */}
              <div className="px-5 sm:px-7 py-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight">
                      {isKn ? "ಹೆಚ್ಚು ಮಾರಾಟವಾಗುವ ವಸ್ತುಗಳು (SKUs)" : "Top Selling SKUs by Revenue"}
                    </h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Highest grossing product lines & trading margins
                    </p>
                  </div>
                  <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.1] text-[#A1AEBB]">
                    Cumulative Top {sortedSkus.length || 10}
                  </span>
                </div>

                {sortedSkus.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#A1AEBB] border border-dashed border-white/[0.12] rounded-xl bg-[#080B10]/25">
                    No product sales recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto -mx-2 px-2">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#080B10]/35 border-y border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.08em]">
                        <tr>
                          <th className="py-2.5 px-3">Product</th>
                          <th className="py-2.5 px-2.5 text-right">Units</th>
                          <th className="py-2.5 px-2.5 text-right">Revenue</th>
                          <th className="py-2.5 px-2.5 text-right">Profit</th>
                          <th className="py-2.5 px-3 text-right">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {sortedSkus.map((p, idx) => {
                          const marginBadgeClass =
                            p.margin_percent < 0
                              ? "bg-[#FB7185]/12 text-[#FB7185] border-[#FB7185]/35"
                              : p.margin_percent >= 25
                              ? "bg-[#6EE7B7]/12 text-[#6EE7B7] border-[#6EE7B7]/35"
                              : p.margin_percent < 12
                              ? "bg-[#FBBF24]/12 text-[#FBBF24] border-[#FBBF24]/35"
                              : "bg-[#7DD3FC]/12 text-[#7DD3FC] border-[#7DD3FC]/35";

                          return (
                            <tr
                              key={p.product_id}
                              className="border-l-2 border-l-transparent hover:border-l-[#5EEAD4]/75 hover:bg-white/[0.025] transition-all"
                            >
                              <td className="py-2.5 px-3">
                                <div className="flex items-start gap-2">
                                  <span className="text-[10px] font-mono text-[#A1AEBB]/65 pt-0.5 tabular-nums w-4 shrink-0">
                                    {String(idx + 1).padStart(2, "0")}
                                  </span>
                                  <div>
                                    <div className="font-semibold text-[#F8FAFC] leading-snug">
                                      <KannadaText text={p.product_name} />
                                    </div>
                                    {p.category_name && (
                                      <div className="text-[10.5px] text-[#A1AEBB]/75 mt-0.5">
                                        <KannadaText text={p.category_name} />
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-2.5 text-right text-[#A1AEBB] font-mono tabular-nums whitespace-nowrap">
                                {p.units_sold}
                              </td>
                              <td className="py-2.5 px-2.5 text-right font-semibold text-[#F8FAFC] font-mono tabular-nums whitespace-nowrap">
                                {formatMoney(p.revenue)}
                              </td>
                              <td
                                className={`py-2.5 px-2.5 text-right font-semibold font-mono tabular-nums whitespace-nowrap ${
                                  p.gross_profit >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                                }`}
                              >
                                {formatMoney(p.gross_profit)}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${marginBadgeClass}`}
                                >
                                  {p.margin_percent.toFixed(1)}%
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Right: Category Revenue Mix */}
              <div className="px-5 sm:px-7 py-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight">
                      {isKn ? "ವರ್ಗವಾರು ಆದಾಯ ಹಂಚಿಕೆ" : "Category Revenue Mix"}
                    </h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Ranked cumulative revenue share across store departments
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10.5px] font-mono text-[#A1AEBB]">
                    <PieChart className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>{categories.length} departments</span>
                  </div>
                </div>

                {categories.length === 0 ? (
                  <div className="py-10 text-center text-xs text-[#A1AEBB] border border-dashed border-white/[0.12] rounded-xl bg-[#080B10]/25">
                    No category sales data recorded.
                  </div>
                ) : (
                  <div className="space-y-4 pt-1">
                    {categories.map((c, idx) => {
                      const barClass = CATEGORY_BAR_STYLES[idx % CATEGORY_BAR_STYLES.length];
                      const dotClass = CATEGORY_DOT_STYLES[idx % CATEGORY_DOT_STYLES.length];
                      return (
                        <div key={c.category_id ?? idx} className="space-y-1.5">
                          <div className="flex items-baseline justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                              <span className="font-semibold text-[#F8FAFC] truncate">
                                <KannadaText text={c.category_name} />
                              </span>
                              <span className="text-[10.5px] font-mono text-[#A1AEBB]/75 tabular-nums shrink-0">
                                {c.units_sold} {c.units_sold === 1 ? "unit" : "units"}
                              </span>
                            </div>

                            <div className="font-mono tabular-nums whitespace-nowrap shrink-0">
                              <span className="font-bold text-[#F8FAFC]">{formatMoney(c.revenue)}</span>
                              <span className="text-[#A1AEBB] text-[11px] ml-1.5">
                                ({c.revenue_percentage.toFixed(1)}%)
                              </span>
                            </div>
                          </div>

                          <div className="w-full bg-white/[0.06] h-2 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${Math.min(Math.max(c.revenue_percentage, 1.5), 100)}%` }}
                              className={`h-full rounded-full transition-all duration-500 ${barClass}`}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* GSTR-1 Tax Export Modal */}
      <Gstr1ExportModal
        isOpen={isGstr1ModalOpen}
        onClose={() => setIsGstr1ModalOpen(false)}
        shopName={business?.name}
        shopGstin={business?.gstin}
      />
    </div>
  );
};
