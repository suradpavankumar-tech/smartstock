import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ShoppingCart,
  RefreshCw,
  BarChart2,
  Clock,
  Printer,
  AlertCircle,
  Receipt,
  ChevronRight,
  Zap,
  Banknote,
  QrCode,
  CreditCard,
  Wallet,
} from "lucide-react";
import { api } from "../services/api";
import {
  FinancialSummary,
  DailySalesPoint,
  ProductPerformancePoint,
  Invoice,
  Customer,
  Expense,
  CashShift,
  Business,
} from "../types";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { NavItemKey } from "../components/Sidebar";
import { CashTillWidget } from "../components/common/CashTillWidget";
import { PrintableReceipt } from "../components/common/PrintableReceipt";
import { KannadaText } from "../components/common/KannadaText";

interface DashboardPageProps {
  onNavigate: (tab: NavItemKey) => void;
}

const toLocalISODate = (dateObj: Date): string => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  const { t, language, formatMoney } = useLanguage();
  const isKn = language === "kn";
  const { currentBusiness } = useAuth();

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [dailySales, setDailySales] = useState<DailySalesPoint[]>([]);
  const [topProducts, setTopProducts] = useState<ProductPerformancePoint[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [expiringBatchesCount, setExpiringBatchesCount] = useState<number>(0);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [cashShift, setCashShift] = useState<CashShift | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<Invoice | null>(null);

  const [activeTab, setActiveTab] = useState<"week" | "month" | "year">("month");
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const periodRange = useMemo(() => {
    const today = new Date();
    const endDate = toLocalISODate(today);
    if (activeTab === "week") {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      return { startDate: toLocalISODate(start), endDate, days: 7 };
    }
    if (activeTab === "month") {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      return { startDate: toLocalISODate(start), endDate, days: 14 };
    }
    return { startDate: undefined as string | undefined, endDate, days: 30 };
  }, [activeTab]);

  const loadData = useCallback(
    async (isRefresh = false) => {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);

      try {
        const [
          sumData,
          dailyData,
          topData,
          invData,
          custData,
          expBatches,
          expList,
          currentShift,
          bizProfile,
        ] = await Promise.all([
          api.getFinancialSummary(
            periodRange.startDate,
            periodRange.startDate ? periodRange.endDate : undefined
          ),
          api.getDailySales(periodRange.days),
          api.getTopProducts(5),
          api.getInvoices(undefined, 200),
          api.getCustomers(),
          api.getExpiringBatches(30).catch(() => []),
          api.getExpenses().catch(() => []),
          api.getCurrentCashShift().catch(() => null),
          api.getBusinessProfile().catch(() => null),
        ]);

        setSummary(sumData);
        setDailySales(dailyData);
        setTopProducts(topData);
        setAllInvoices(invData);
        setCustomers(custData);
        setExpiringBatchesCount(expBatches.length);
        setExpenses(expList);
        setCashShift(currentShift);
        if (bizProfile) setBusiness(bizProfile);
      } catch (err: any) {
        setError(err.message || "Failed to load dashboard telemetry");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [periodRange]
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Period-filtered non-cancelled invoices for Tender Mix & Recent Stream
  const periodInvoices = useMemo(() => {
    return allInvoices.filter((inv) => {
      if (inv.status === "CANCELLED") return false;
      if (!periodRange.startDate) return true;
      const invLocalDate = toLocalISODate(new Date(inv.created_at));
      return invLocalDate >= periodRange.startDate && invLocalDate <= periodRange.endDate;
    });
  }, [allInvoices, periodRange]);

  const recentInvoices = useMemo(
    () => allInvoices.filter((inv) => inv.status !== "CANCELLED").slice(0, 5),
    [allInvoices]
  );

  const paymentStats = useMemo(() => {
    const sums: Record<string, number> = { UPI: 0, CASH: 0, CREDIT: 0, CARD: 0 };
    let total = 0;
    periodInvoices.forEach((inv) => {
      const amt = inv.total_amount || 0;
      const method = inv.payment_method || "CASH";
      sums[method] = (sums[method] || 0) + amt;
      total += amt;
    });
    return { sums, total };
  }, [periodInvoices]);

  const totalKhataOutstanding = useMemo(
    () => customers.reduce((acc, c) => acc + (c.outstanding_balance || 0), 0),
    [customers]
  );
  const creditAccountsDue = useMemo(
    () => customers.filter((c) => (c.outstanding_balance || 0) > 0).length,
    [customers]
  );

  if (loading && !summary) {
    return (
      <div className="min-h-[70vh] flex flex-col items-center justify-center p-8 space-y-4">
        <div className="relative">
          <div className="w-12 h-12 rounded-full border-4 border-[#5EEAD4]/20 border-t-[#5EEAD4] animate-spin shadow-[0_0_15px_rgba(94,234,212,0.3)]" />
          <Zap className="w-5 h-5 text-[#6EE7B7] absolute inset-0 m-auto" />
        </div>
        <div className="text-center">
          <div className="text-sm font-bold text-[#F8FAFC]">
            Syncing Midnight Mist Executive Ledger...
          </div>
          <div className="text-xs text-[#A1AEBB] mt-1">
            Aggregating real sales, stock valuation, cash drawer &amp; Khata balances
          </div>
        </div>
      </div>
    );
  }

  // Real financial numbers — zero synthetic fallbacks
  const displayRevenue = summary?.net_sales ?? 0;
  const displayProfit = summary?.gross_profit ?? 0;
  const displayMargin = summary?.gross_margin_percent ?? 0;
  const realCOGS = summary?.cost_of_goods_sold ?? 0;
  const loggedExpensesSum = expenses
    .filter((e) => !periodRange.startDate || e.expense_date >= periodRange.startDate)
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const realOperatingExpenses =
    summary && summary.operating_expenses !== undefined
      ? summary.operating_expenses
      : loggedExpensesSum;
  const totalExpenses = realCOGS + realOperatingExpenses;
  const totalFlow = displayRevenue + totalExpenses;

  const incomePercent = totalFlow > 0 ? Math.round((displayRevenue / totalFlow) * 100) : 0;
  const expensePercent = totalFlow > 0 ? Math.max(0, 100 - incomePercent) : 0;
  const donutCircumference = 238.76; // 2 * PI * 38
  const incomeStrokeDash = (incomePercent / 100) * donutCircumference;
  const expenseStrokeDash = (expensePercent / 100) * donutCircumference;

  // Real Working Capital Allocation (zero hardcoded fake cash float)
  const inventoryValuation = summary?.inventory_valuation ?? 0;
  const khataReceivables = totalKhataOutstanding;
  const tillCashReserve = cashShift
    ? Math.max(0, cashShift.expected_cash ?? cashShift.opening_float ?? 0)
    : 0;
  const totalWorkingCapital = inventoryValuation + khataReceivables + tillCashReserve;
  const deployedCapital = inventoryValuation + khataReceivables;
  const deployedPercent =
    totalWorkingCapital > 0
      ? Math.min(100, Math.round((deployedCapital / totalWorkingCapital) * 100))
      : 0;
  const liquidReservePercent =
    totalWorkingCapital > 0 ? Math.max(0, 100 - deployedPercent) : 0;

  const lowStockCount = summary?.low_stock_products_count ?? 0;
  const maxDailyMetric = Math.max(
    ...dailySales.map((d) => Math.max(d.sales, d.cost)),
    10
  );
  const xLabelStep = dailySales.length > 16 ? 3 : dailySales.length > 10 ? 2 : 1;

  return (
    <div className="max-w-7xl mx-auto pb-2">
      {/* Unified Midnight Mist Liquid Glass Executive Command Terminal */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.14)] relative overflow-hidden backdrop-blur-2xl">
        {/* Diffuse ambient glow highlights */}
        <div className="absolute -top-24 -left-24 w-80 h-80 bg-gradient-to-br from-[#5EEAD4]/16 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 -right-24 w-80 h-80 bg-gradient-to-bl from-[#7DD3FC]/12 to-[#A78BFA]/10 rounded-full blur-3xl pointer-events-none" />

        {/* 1. Executive Header & Timeline / Primary Action Toolbar */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_12px_rgba(94,234,212,0.25)] shrink-0">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current text-[#6EE7B7]">
                <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
                <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="12" r="3" fill="currentColor" />
              </svg>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[#6EE7B7] tracking-wider uppercase font-semibold">
                  {t("navOverview")}
                </span>
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[#A1AEBB]">
                  {currentBusiness?.name || "SmartStock Store"}
                </span>
                {expiringBatchesCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onNavigate("inventory")}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#FBBF24]/14 border border-[#FBBF24]/35 text-[10.5px] font-semibold text-[#FBBF24] hover:bg-[#FBBF24]/20 transition-colors"
                  >
                    <Clock className="w-3 h-3" />
                    <span>{expiringBatchesCount} batch expiring ≤30d</span>
                  </button>
                )}
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] mt-0.5 truncate">
                {isKn
                  ? "ರಿಯಲ್-ಟೈಮ್ ಮಾರಾಟ, ದಾಸ್ತಾನು ಮೌಲ್ಯ, ನಗದು ಡ್ರಾಯರ್ ಮತ್ತು ಖಾತಾ ಬಾಕಿ ಕಾರ್ಯನಿರ್ವಾಹಕ ಕೇಂದ್ರ"
                  : "Live P&L telemetry, working capital allocation, till shift & counter execution"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-4 shrink-0">
            {/* Timeline Tabs */}
            <div className="flex items-center gap-5 text-xs font-semibold">
              {(
                [
                  { key: "week", label: "Week (7d)" },
                  { key: "month", label: "Month (30d)" },
                  { key: "year", label: "All Time" },
                ] as const
              ).map((tab) => {
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setActiveTab(tab.key)}
                    className={`pb-1.5 relative transition-all whitespace-nowrap ${
                      isActive ? "text-[#F8FAFC] font-bold" : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                    }`}
                  >
                    {tab.label}
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
                onClick={() => loadData(true)}
                disabled={refreshing}
                className="liquid-btn-secondary p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] shrink-0"
                title={t("refresh")}
                aria-label="Refresh overview dashboard"
              >
                <RefreshCw
                  className={`w-4 h-4 ${refreshing ? "animate-spin text-[#5EEAD4]" : ""}`}
                />
              </button>

              <button
                type="button"
                onClick={() => onNavigate("pos")}
                className="liquid-btn-primary px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-[#080B10]" />
                <span>Open POS Counter</span>
                <span className="bg-[#080B10]/20 text-[#080B10] px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">
                  F2
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Inline Error Banner */}
        {error && (
          <div className="relative z-10 px-5 sm:px-7 py-2.5 bg-[#FB7185]/12 border-b border-[#FB7185]/30 text-[#FB7185] text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => loadData(true)}
              className="underline font-semibold hover:text-[#F8FAFC]"
            >
              Retry
            </button>
          </div>
        )}

        {/* 2. Cardless Architectural 4-Column Executive KPI Strip */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Col 1: Net Revenue */}
          <div className="px-4 sm:px-5 py-4 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A1AEBB] truncate min-w-0">
                {t("netSales")}
              </span>
              <span className="text-[11px] font-medium text-[#7DD3FC] tabular-nums whitespace-nowrap shrink-0">
                {summary?.total_invoices_count || 0} bills
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {formatMoney(displayRevenue)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Gross: {formatMoney(summary?.gross_sales ?? displayRevenue)}</span>
              <span>AOV: {formatMoney(summary?.average_order_value ?? 0)}</span>
            </div>
          </div>

          {/* Col 2: Gross Profit & Margin */}
          <div className="px-4 sm:px-5 py-4 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A1AEBB] truncate min-w-0">
                {t("grossProfit")}
              </span>
              <span
                className={`text-[11px] font-semibold tabular-nums whitespace-nowrap shrink-0 ${
                  displayMargin >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                }`}
              >
                {displayMargin >= 0 ? "+" : ""}
                {displayMargin.toFixed(1)}% margin
              </span>
            </div>
            <div
              className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums mt-2 ${
                displayProfit >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
              }`}
            >
              {displayProfit >= 0 ? "+" : ""}
              {formatMoney(displayProfit)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>COGS: {formatMoney(realCOGS)}</span>
              <span>OpEx: {formatMoney(realOperatingExpenses)}</span>
            </div>
          </div>

          {/* Col 3: Inventory Valuation & Reorder Risk */}
          <div className="px-4 sm:px-5 py-4 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A1AEBB] truncate min-w-0">
                {isKn ? t("inventoryValuation") : "Inventory Valuation"}
              </span>
              <button
                type="button"
                onClick={() => onNavigate("reorder")}
                className={`text-[11px] font-semibold hover:underline whitespace-nowrap shrink-0 ${
                  lowStockCount > 0 ? "text-[#FB7185]" : "text-[#6EE7B7]"
                }`}
              >
                {lowStockCount > 0 ? `${lowStockCount} at risk →` : "Optimal →"}
              </button>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#A78BFA] tracking-tight tabular-nums mt-2">
              {formatMoney(inventoryValuation)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>{summary?.total_stock_units || 0} units on shelf</span>
              <span>WAC Cost Basis</span>
            </div>
          </div>

          {/* Col 4: Khata Credit Receivable */}
          <div className="px-4 sm:px-5 py-4 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A1AEBB] truncate min-w-0">
                Khata Receivables
              </span>
              <button
                type="button"
                onClick={() => onNavigate("customers")}
                className="text-[11px] font-semibold text-[#FBBF24] hover:underline whitespace-nowrap shrink-0"
              >
                {creditAccountsDue > 0 ? "Collect →" : "Directory →"}
              </button>
            </div>
            <div
              className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums mt-2 ${
                totalKhataOutstanding > 0 ? "text-[#FBBF24]" : "text-[#F8FAFC]"
              }`}
            >
              {formatMoney(totalKhataOutstanding)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>
                {creditAccountsDue} {creditAccountsDue === 1 ? "account" : "accounts"} due
              </span>
              <span>{totalKhataOutstanding > 0 ? "UPI Reminders" : "All Settled"}</span>
            </div>
          </div>
        </div>

        {/* 3. Inline Cash Register Shift Strip (Embedded Cardless Bar) */}
        <div className="relative z-10">
          <CashTillWidget embedded={true} onShiftChange={setCashShift} />
        </div>

        {/* 4. Cash Flow & Capital Allocation Architectural Split */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Section A: Cash Flow Margin Donut */}
          <div className="p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[#A1AEBB]">
                  Income vs. Outflows
                </h3>
                <p className="text-[11px] text-[#A1AEBB]/80 mt-0.5">
                  Operating revenue compared to COGS &amp; logged store expenses
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("analytics")}
                className="text-[11px] font-semibold text-[#6EE7B7] hover:underline whitespace-nowrap"
              >
                Full P&amp;L ↗
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6 mt-5">
              <div className="relative w-24 h-24 shrink-0 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="38"
                    fill="none"
                    stroke="rgba(255,255,255,0.06)"
                    strokeWidth="10"
                  />
                  {totalFlow > 0 && (
                    <>
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="none"
                        stroke="#A78BFA"
                        strokeWidth="10"
                        strokeDasharray={`${expenseStrokeDash.toFixed(1)} ${donutCircumference}`}
                        strokeDashoffset="0"
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                      />
                      <circle
                        cx="50"
                        cy="50"
                        r="38"
                        fill="none"
                        stroke="#6EE7B7"
                        strokeWidth="10"
                        strokeDasharray={`${incomeStrokeDash.toFixed(1)} ${donutCircumference}`}
                        strokeDashoffset={`${(-expenseStrokeDash).toFixed(1)}`}
                        strokeLinecap="round"
                        className="transition-all duration-1000"
                      />
                    </>
                  )}
                </svg>
                <div className="absolute text-center flex flex-col items-center">
                  <span className="text-xs font-extrabold text-[#F8FAFC] tabular-nums">
                    {displayMargin >= 0
                      ? `+${displayMargin.toFixed(0)}%`
                      : `${displayMargin.toFixed(0)}%`}
                  </span>
                  <span className="text-[9px] text-[#A1AEBB] uppercase tracking-wider">
                    Margin
                  </span>
                </div>
              </div>

              <div className="flex-1 w-full space-y-2.5 text-xs tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[#A1AEBB]">
                    <span className="w-2 h-2 rounded-full bg-[#6EE7B7] shadow-[0_0_6px_#5EEAD4]" />
                    Net Sales Revenue ({incomePercent}%)
                  </span>
                  <span className="font-mono font-semibold text-[#F8FAFC]">
                    {formatMoney(displayRevenue)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[#A1AEBB]">
                    <span className="w-2 h-2 rounded-full bg-[#A78BFA]" />
                    COGS &amp; Operating Costs ({expensePercent}%)
                  </span>
                  <span className="font-mono font-semibold text-[#F8FAFC]">
                    {formatMoney(totalExpenses)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] font-bold">
                  <span className="text-[#F8FAFC]">Net Operating Surplus</span>
                  <span
                    className={`font-mono ${
                      displayRevenue - totalExpenses >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                    }`}
                  >
                    {displayRevenue - totalExpenses >= 0 ? "+" : ""}
                    {formatMoney(displayRevenue - totalExpenses)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Section B: Working Capital Allocation */}
          <div className="p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[#A1AEBB]">
                  Working Capital Deployment
                </h3>
                <p className="text-[11px] text-[#A1AEBB]/80 mt-0.5">
                  Capital tied in stock &amp; Khata vs open cash register till float
                </p>
              </div>
              <span className="text-[11px] font-semibold text-[#6EE7B7] tabular-nums flex items-center gap-1.5 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] shadow-[0_0_6px_#5EEAD4]" />
                {liquidReservePercent}% Liquid
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between mb-2 tabular-nums">
                <div>
                  <span className="text-[10.5px] text-[#A1AEBB] block">Capital Deployed</span>
                  <span className="text-lg font-mono font-bold text-[#F8FAFC]">
                    {formatMoney(deployedCapital)}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[10.5px] text-[#A1AEBB] block">
                    Total Working Capital
                  </span>
                  <span className="text-sm font-mono font-semibold text-[#A1AEBB]">
                    {formatMoney(totalWorkingCapital)}
                  </span>
                </div>
              </div>

              <div className="w-full bg-white/[0.06] h-2 rounded-full overflow-hidden">
                <div
                  style={{ width: `${deployedPercent}%` }}
                  className="h-full bg-gradient-to-r from-[#A78BFA] to-[#7DD3FC] rounded-full shadow-[0_0_10px_rgba(167,139,250,0.4)] transition-all duration-700"
                />
              </div>

              <div className="mt-4 space-y-2 text-xs tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-[#A1AEBB]">Inventory Stock Valuation</span>
                  <span className="font-mono font-semibold text-[#F8FAFC]">
                    {formatMoney(inventoryValuation)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[#A1AEBB]">Customer Khata Receivables</span>
                  <span className="font-mono font-semibold text-[#F8FAFC]">
                    {formatMoney(khataReceivables)}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.08] font-semibold">
                  <span className="text-[#6EE7B7]">
                    {cashShift ? "Active Cash Drawer Float" : "Cash Drawer Float (Shift Closed)"}
                  </span>
                  <span className="font-mono text-[#6EE7B7]">
                    {formatMoney(tillCashReserve)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 5. Sales Chronology Bar Chart (2/3) & Period Tender Breakdown (1/3) */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Daily Sales vs COGS Chart */}
          <div className="lg:col-span-2 p-5 sm:p-6 flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[#A1AEBB] flex items-center gap-2">
                  <BarChart2 className="w-3.5 h-3.5 text-[#6EE7B7]" />
                  <span>Sales Revenue vs Cost of Goods Sold</span>
                </h3>
                <p className="text-[11px] text-[#A1AEBB]/80 mt-0.5">
                  Daily chronological POS billing performance ({periodRange.days}-day window)
                </p>
              </div>

              <div className="flex items-center gap-4 text-[11px] font-semibold">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#6EE7B7] shadow-[0_0_6px_#5EEAD4]" />
                  <span className="text-[#F8FAFC]">Sales</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#A78BFA]" />
                  <span className="text-[#A1AEBB]">COGS</span>
                </span>
              </div>
            </div>

            <div className="h-52 flex items-end gap-1.5 sm:gap-2 pb-2 border-b border-white/[0.08]">
              {dailySales.length === 0 ? (
                <div className="w-full h-full flex items-center justify-center text-xs text-[#A1AEBB]">
                  No historical sales records in selected timeline.
                </div>
              ) : (
                dailySales.map((pt, i) => {
                  const salesHeight =
                    pt.sales > 0 ? Math.max(6, (pt.sales / maxDailyMetric) * 100) : 2;
                  const costHeight =
                    pt.cost > 0 ? Math.max(4, (pt.cost / maxDailyMetric) * 100) : 2;
                  const showLabel = i % xLabelStep === 0 || i === dailySales.length - 1;

                  return (
                    <div
                      key={pt.date}
                      className="flex-1 min-w-0 flex flex-col items-center gap-1.5 group relative"
                    >
                      <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col z-30 bg-[#080B10] text-[#F8FAFC] text-[11px] p-2.5 rounded-xl shadow-2xl pointer-events-none min-w-[130px] border border-white/20 tabular-nums">
                        <div className="font-mono font-bold text-[#F8FAFC] border-b border-white/10 pb-1 mb-1">
                          {pt.date}
                        </div>
                        <div className="flex justify-between text-[#6EE7B7]">
                          <span>Sales:</span>
                          <span className="font-mono font-bold">{formatMoney(pt.sales)}</span>
                        </div>
                        <div className="flex justify-between text-[#A78BFA]">
                          <span>COGS:</span>
                          <span className="font-mono">{formatMoney(pt.cost)}</span>
                        </div>
                        <div className="flex justify-between text-[#7DD3FC] border-t border-white/10 pt-1 mt-1 font-bold">
                          <span>Profit:</span>
                          <span className="font-mono">{formatMoney(pt.profit)}</span>
                        </div>
                      </div>

                      <div className="w-full flex items-end justify-center gap-0.5 h-40">
                        <div
                          style={{ height: `${salesHeight}%` }}
                          className={`w-full max-w-[12px] rounded-t-sm transition-all ${
                            pt.sales > 0
                              ? "bg-[#6EE7B7] shadow-[0_0_8px_rgba(110,231,183,0.3)]"
                              : "bg-white/[0.08]"
                          }`}
                        />
                        <div
                          style={{ height: `${costHeight}%` }}
                          className={`w-full max-w-[12px] rounded-t-sm transition-all ${
                            pt.cost > 0
                              ? "bg-[#A78BFA]/60 group-hover:bg-[#A78BFA]"
                              : "bg-white/[0.04]"
                          }`}
                        />
                      </div>

                      <span className="text-[9.5px] text-[#A1AEBB] font-mono h-3.5 tabular-nums whitespace-nowrap">
                        {showLabel ? pt.date.split("-").slice(1).join("/") : ""}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex items-center justify-between pt-3 text-[11px] text-[#A1AEBB]">
              <span>Aggregated automatically from verified POS receipts</span>
              <button
                type="button"
                onClick={() => onNavigate("analytics")}
                className="text-[#6EE7B7] font-semibold hover:underline inline-flex items-center gap-1"
              >
                <span>Analytics Hub</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Tender Mix across Period Invoices */}
          <div className="p-5 sm:p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[#A1AEBB] flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-[#6EE7B7]" />
                  <span>Tender Breakdown</span>
                </h3>
                <span className="text-[10.5px] font-mono text-[#6EE7B7] tabular-nums">
                  {periodInvoices.length} bills
                </span>
              </div>
              <p className="text-[11px] text-[#A1AEBB]/80 mb-5">
                UPI QR, Cash counter, and Khata credit collection share
              </p>

              <div className="space-y-4 text-xs tabular-nums">
                {[
                  {
                    key: "UPI",
                    label: "UPI Digital",
                    icon: QrCode,
                    color: "text-[#7DD3FC]",
                    bar: "bg-[#7DD3FC] shadow-[0_0_8px_rgba(125,211,252,0.4)]",
                    amount: paymentStats.sums["UPI"] || 0,
                  },
                  {
                    key: "CASH",
                    label: "Cash Counter",
                    icon: Banknote,
                    color: "text-[#6EE7B7]",
                    bar: "bg-[#6EE7B7] shadow-[0_0_8px_rgba(110,231,183,0.4)]",
                    amount: paymentStats.sums["CASH"] || 0,
                  },
                  {
                    key: "CREDIT",
                    label: "Khata Credit",
                    icon: CreditCard,
                    color: "text-[#FBBF24]",
                    bar: "bg-[#FBBF24] shadow-[0_0_8px_rgba(251,191,36,0.4)]",
                    amount: paymentStats.sums["CREDIT"] || 0,
                  },
                ].map((row) => {
                  const pct =
                    paymentStats.total > 0
                      ? Math.round((row.amount / paymentStats.total) * 100)
                      : 0;
                  const Icon = row.icon;
                  return (
                    <div key={row.key}>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="flex items-center gap-1.5 font-medium text-[#F8FAFC]">
                          <Icon className={`w-3.5 h-3.5 ${row.color}`} />
                          <span>{row.label}</span>
                        </span>
                        <span className="font-mono font-bold text-[#F8FAFC]">
                          {formatMoney(row.amount)}{" "}
                          <span className="text-[10px] font-normal text-[#A1AEBB]">({pct}%)</span>
                        </span>
                      </div>
                      <div className="w-full bg-white/[0.06] h-1.5 rounded-full overflow-hidden">
                        <div
                          style={{ width: `${pct}%` }}
                          className={`h-full rounded-full transition-all duration-500 ${row.bar}`}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-4 mt-5 border-t border-white/[0.08] flex items-center justify-between text-[11px]">
              <span className="text-[#A1AEBB] font-mono tabular-nums">
                Total: {formatMoney(paymentStats.total)}
              </span>
              <button
                type="button"
                onClick={() => onNavigate("sales")}
                className="text-[#7DD3FC] font-semibold hover:underline"
              >
                Invoices Ledger →
              </button>
            </div>
          </div>
        </div>

        {/* 6. Fast-Moving Products & Live Counter Activity (Hairline Ledger Lists, Zero Cards) */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]">
          {/* Fast Movers Leaderboard */}
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[#A1AEBB] flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-[#6EE7B7]" />
                  <span>Fast-Moving SKUs</span>
                </h3>
                <p className="text-[11px] text-[#A1AEBB]/80 mt-0.5">
                  Top revenue and gross margin drivers in your store
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("products")}
                className="text-[11px] text-[#6EE7B7] font-semibold hover:underline"
              >
                All Products →
              </button>
            </div>

            {topProducts.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#A1AEBB]">
                No product sales recorded yet.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {topProducts.map((p, idx) => (
                  <div
                    key={p.product_id}
                    className="py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] px-1.5 -mx-1.5 rounded-lg transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-6 h-6 rounded-full bg-[#080B10] border border-[#5EEAD4]/35 text-[#6EE7B7] font-mono font-bold text-[10.5px] flex items-center justify-center shrink-0">
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <div className="font-semibold text-xs text-[#F8FAFC] truncate">
                          <KannadaText text={p.product_name} />
                        </div>
                        <div className="text-[10.5px] text-[#A1AEBB] tabular-nums mt-0.5">
                          {p.units_sold} sold • {Number(p.margin_percent ?? 0).toFixed(1)}% margin
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 tabular-nums">
                      <div className="font-mono font-bold text-xs text-[#F8FAFC]">
                        {formatMoney(p.revenue)}
                      </div>
                      <div className="text-[10.5px] font-mono font-semibold text-[#6EE7B7]">
                        +{formatMoney(p.gross_profit)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live Counter Activity Stream */}
          <div className="p-5 sm:p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-[0.11em] text-[#A1AEBB] flex items-center gap-1.5">
                  <Receipt className="w-3.5 h-3.5 text-[#7DD3FC]" />
                  <span>Live Counter Activity</span>
                </h3>
                <p className="text-[11px] text-[#A1AEBB]/80 mt-0.5">
                  Latest POS receipts with instant thermal reprint
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigate("sales")}
                className="text-[11px] text-[#6EE7B7] font-semibold hover:underline"
              >
                View All ({summary?.total_invoices_count || 0}) →
              </button>
            </div>

            {recentInvoices.length === 0 ? (
              <div className="py-10 text-center text-xs text-[#A1AEBB]">
                No counter sales recorded yet. Open POS to ring up orders.
              </div>
            ) : (
              <div className="divide-y divide-white/[0.06]">
                {recentInvoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="py-2.5 flex items-center justify-between gap-3 hover:bg-white/[0.02] px-1.5 -mx-1.5 rounded-lg transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-xs text-[#F8FAFC]">
                          {inv.invoice_number}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border ${
                            inv.payment_method === "UPI"
                              ? "bg-[#7DD3FC]/15 text-[#7DD3FC] border-[#7DD3FC]/30"
                              : inv.payment_method === "CREDIT"
                              ? "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/30"
                              : "bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#5EEAD4]/30"
                          }`}
                        >
                          {inv.payment_method}
                        </span>
                      </div>
                      <div className="text-[10.5px] text-[#A1AEBB] mt-0.5 truncate">
                        <span className="text-[#F8FAFC]/85 font-medium">
                          {inv.customer_name || "Walk-in Cash"}
                        </span>{" "}
                        •{" "}
                        {new Date(inv.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right tabular-nums">
                        <div className="font-mono font-bold text-xs text-[#F8FAFC]">
                          {formatMoney(inv.total_amount)}
                        </div>
                        <div
                          className={`text-[10px] font-semibold ${
                            inv.payment_status === "DUE" ? "text-[#FBBF24]" : "text-[#6EE7B7]"
                          }`}
                        >
                          {inv.payment_status}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setSelectedReceipt(inv)}
                        title="Reprint Thermal Receipt"
                        aria-label={`Reprint ${inv.invoice_number}`}
                        className="p-1.5 rounded-lg border border-white/[0.1] text-[#A1AEBB] hover:text-[#6EE7B7] hover:border-[#5EEAD4]/40 hover:bg-white/[0.06] transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Portalled Thermal Receipt Print Preview */}
      {selectedReceipt && (
        <PrintableReceipt
          invoice={selectedReceipt}
          business={business}
          businessName={currentBusiness?.name}
          onClose={() => setSelectedReceipt(null)}
        />
      )}
    </div>
  );
};
