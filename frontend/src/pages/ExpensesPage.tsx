import React, { useState, useEffect, useMemo } from "react";
import { Expense } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { KannadaText } from "../components/common/KannadaText";
import {
  Wallet, Plus, Search, Tag, RefreshCw, X, AlertCircle, Trash2,
  Download, Coffee, Truck, Zap, Home, Users, Package, Wrench,
  FileText, Sparkles, ShieldCheck
} from "lucide-react";

export const EXPENSE_CATEGORIES = [
  {
    value: "ELECTRICITY",
    labelEn: "Electricity & Utilities",
    labelKn: "ವಿದ್ಯುತ್ ಮತ್ತು ಉಪಯುಕ್ತತೆಗಳು",
    shortEn: "Utilities",
    shortKn: "ವಿದ್ಯುತ್",
    icon: Zap,
    color: "text-[#7DD3FC] bg-[#7DD3FC]/12 border-[#7DD3FC]/35",
    dotClass: "bg-[#7DD3FC]",
  },
  {
    value: "RENT",
    labelEn: "Shop Rent",
    labelKn: "ಅಂಗಡಿ ಬಾಡಿಗೆ",
    shortEn: "Rent",
    shortKn: "ಬಾಡಿಗೆ",
    icon: Home,
    color: "text-[#A78BFA] bg-[#A78BFA]/12 border-[#A78BFA]/35",
    dotClass: "bg-[#A78BFA]",
  },
  {
    value: "SALARIES",
    labelEn: "Staff Wages & Advance",
    labelKn: "ವೇತನ ಮತ್ತು ಮುಂಗಡ",
    shortEn: "Wages",
    shortKn: "ವೇತನ",
    icon: Users,
    color: "text-[#5EEAD4] bg-[#5EEAD4]/12 border-[#5EEAD4]/35",
    dotClass: "bg-[#5EEAD4]",
  },
  {
    value: "TRANSPORT",
    labelEn: "Freight & Transportation",
    labelKn: "ಸಾರಿಗೆ ಮತ್ತು ಸರಕು ಸಾಗಣೆ",
    shortEn: "Freight",
    shortKn: "ಸಾರಿಗೆ",
    icon: Truck,
    color: "text-[#6EE7B7] bg-[#6EE7B7]/12 border-[#6EE7B7]/35",
    dotClass: "bg-[#6EE7B7]",
  },
  {
    value: "PACKAGING",
    labelEn: "Packaging Materials",
    labelKn: "ಪ್ಯಾಕಿಂಗ್ ಸಾಮಗ್ರಿಗಳು",
    shortEn: "Packaging",
    shortKn: "ಪ್ಯಾಕಿಂಗ್",
    icon: Package,
    color: "text-[#FBBF24] bg-[#FBBF24]/12 border-[#FBBF24]/35",
    dotClass: "bg-[#FBBF24]",
  },
  {
    value: "MAINTENANCE",
    labelEn: "Repairs & Maintenance",
    labelKn: "ದುರಸ್ತಿ ಮತ್ತು ನಿರ್ವಹಣೆ",
    shortEn: "Repairs",
    shortKn: "ದುರಸ್ತಿ",
    icon: Wrench,
    color: "text-[#7DD3FC] bg-[#7DD3FC]/10 border-[#7DD3FC]/25",
    dotClass: "bg-[#7DD3FC]/80",
  },
  {
    value: "TAX_FEES",
    labelEn: "Taxes & Municipal Fees",
    labelKn: "ತೆರಿಗೆ ಮತ್ತು ಶುಲ್ಕಗಳು",
    shortEn: "Taxes",
    shortKn: "ತೆರಿಗೆ",
    icon: FileText,
    color: "text-[#FB7185] bg-[#FB7185]/12 border-[#FB7185]/35",
    dotClass: "bg-[#FB7185]",
  },
  {
    value: "OTHER",
    labelEn: "Tea, Refreshments & Other",
    labelKn: "ಚಹಾ, ತಿಂಡಿ ಮತ್ತು ಇತರೆ",
    shortEn: "Other",
    shortKn: "ಇತರೆ",
    icon: Coffee,
    color: "text-[#A1AEBB] bg-white/[0.06] border-white/[0.12]",
    dotClass: "bg-[#A1AEBB]",
  },
];

const QUICK_PRESETS = [
  {
    title: "Staff Tea & Biscuits",
    amount: "80",
    category: "OTHER",
    payment_method: "CASH",
    icon: Coffee,
    label: "Tea & Snacks · ₹80",
  },
  {
    title: "Wholesale Market Freight / Auto",
    amount: "250",
    category: "TRANSPORT",
    payment_method: "CASH",
    icon: Truck,
    label: "Auto Freight · ₹250",
  },
  {
    title: "Carry Bags & Packing Tape",
    amount: "350",
    category: "PACKAGING",
    payment_method: "CASH",
    icon: Package,
    label: "Carry Bags · ₹350",
  },
  {
    title: "Shop Cleaning & Sweeper",
    amount: "100",
    category: "OTHER",
    payment_method: "CASH",
    icon: Sparkles,
    label: "Cleaning · ₹100",
  },
  {
    title: "HESCOM Electricity Bill",
    amount: "1200",
    category: "ELECTRICITY",
    payment_method: "UPI",
    icon: Zap,
    label: "Power Bill · ₹1,200",
  },
];

export const getCategoryMeta = (cat: string) => {
  return EXPENSE_CATEGORIES.find((c) => c.value === cat) || EXPENSE_CATEGORIES[7];
};

const toLocalISODate = (dateObj: Date) => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const ExpensesPage: React.FC = () => {
  const { t, language, formatMoney, tData, formatDateLocalized } = useLanguage();
  const isKn = language === "kn";

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState<"ALL" | "TODAY" | "THIS_WEEK" | "THIS_MONTH">("ALL");

  // Modal & action state
  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const [form, setForm] = useState({
    title: "",
    category: EXPENSE_CATEGORIES[0].value,
    amount: "",
    payment_method: "CASH",
    expense_date: toLocalISODate(new Date()),
    notes: "",
  });

  const fetchExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getExpenses();
      setExpenses(data);
    } catch (err: any) {
      setError(err.message || "Failed to load expenses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const resetForm = () => {
    setForm({
      title: "",
      category: EXPENSE_CATEGORIES[0].value,
      amount: "",
      payment_method: "CASH",
      expense_date: toLocalISODate(new Date()),
      notes: "",
    });
    setModalError(null);
  };

  const handleApplyPreset = (preset: (typeof QUICK_PRESETS)[0]) => {
    setForm({
      title: preset.title,
      category: preset.category,
      amount: preset.amount,
      payment_method: preset.payment_method,
      expense_date: toLocalISODate(new Date()),
      notes: "Quick daily routine expense",
    });
    setModalError(null);
    setShowAddModal(true);
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(form.amount);
    if (!form.title.trim() || form.title.trim().length < 2) {
      setModalError("Please enter a descriptive expense title (at least 2 characters).");
      return;
    }
    if (isNaN(amt) || amt <= 0) {
      setModalError("Please enter an expense amount greater than ₹0.");
      return;
    }
    setSubmitting(true);
    setModalError(null);
    try {
      await api.createExpense({
        title: form.title.trim(),
        category: form.category,
        amount: amt,
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        notes: form.notes.trim() || undefined,
      });
      setShowAddModal(false);
      resetForm();
      await fetchExpenses();
    } catch (err: any) {
      setModalError(err.message || "Failed to record expense");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (!window.confirm("Are you sure you want to void/delete this expense record?")) return;
    setDeletingId(id);
    setError(null);
    try {
      await api.deleteExpense(id);
      setExpenses((prev) => prev.filter((e) => e.id !== id));
    } catch (err: any) {
      setError(err.message || "Failed to delete expense");
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportCSV = () => {
    if (filteredExpenses.length === 0) {
      setError("No expense entries in the current view to export.");
      return;
    }
    const headers = ["ID", "Date", "Title", "Category", "Payment Method", "Amount (INR)", "Notes", "Logged By"];
    const rows = filteredExpenses.map((e) => [
      e.id,
      e.expense_date,
      `"${e.title.replace(/"/g, '""')}"`,
      e.category,
      e.payment_method,
      e.amount.toFixed(2),
      `"${(e.notes || "").replace(/"/g, '""')}"`,
      `"${e.created_by_name || ""}"`,
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SmartStock_Expenses_${toLocalISODate(new Date())}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filter logic (local calendar boundaries to prevent UTC off-by-one shifts)
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const todayStr = toLocalISODate(now);
    const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7);
    const weekStartStr = toLocalISODate(weekStartDate);
    const monthStartStr = toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1));

    return expenses.filter((exp) => {
      if (categoryFilter !== "ALL" && exp.category !== categoryFilter) return false;

      if (dateFilter === "TODAY" && exp.expense_date !== todayStr) return false;
      if (dateFilter === "THIS_WEEK" && exp.expense_date < weekStartStr) return false;
      if (dateFilter === "THIS_MONTH" && exp.expense_date < monthStartStr) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = exp.title.toLowerCase().includes(q);
        const matchCategory = exp.category.toLowerCase().includes(q);
        const matchNotes = exp.notes?.toLowerCase().includes(q) || false;
        const matchPayment = exp.payment_method.toLowerCase().includes(q);
        if (!matchTitle && !matchCategory && !matchNotes && !matchPayment) return false;
      }

      return true;
    });
  }, [expenses, categoryFilter, dateFilter, searchQuery]);

  // Aggregate stats
  const totalAmount = useMemo(
    () => filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  const cashOutflow = useMemo(
    () =>
      filteredExpenses
        .filter((e) => e.payment_method.toUpperCase() === "CASH")
        .reduce((sum, e) => sum + e.amount, 0),
    [filteredExpenses]
  );

  const digitalOutflow = Math.max(0, totalAmount - cashOutflow);

  const categoryBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    filteredExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [filteredExpenses]);

  const topCategory = categoryBreakdown[0];
  const topMeta = topCategory ? getCategoryMeta(topCategory[0]) : null;
  const topPct = topCategory && totalAmount > 0 ? Math.round((topCategory[1] / totalAmount) * 100) : 0;

  const hasActiveFilters =
    searchQuery.trim() !== "" || categoryFilter !== "ALL" || dateFilter !== "ALL";

  const clearAllFilters = () => {
    setSearchQuery("");
    setCategoryFilter("ALL");
    setDateFilter("ALL");
  };

  return (
    <div className="max-w-7xl mx-auto pb-2">
      {/* Unified Midnight Mist Liquid Glass Operating Expense Ledger */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.12)] relative overflow-hidden backdrop-blur-2xl">
        {/* Ambient diffuse glass highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-gradient-to-br from-[#5EEAD4]/14 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-gradient-to-tl from-[#A78BFA]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* 1. Terminal Header & Primary Toolbar */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_12px_rgba(94,234,212,0.25)] shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#6EE7B7] tracking-wider uppercase font-semibold">
                  {isKn ? "ನಿರ್ವಹಣಾ ವೆಚ್ಚಗಳು • OPERATING EXPENSES" : "Operating Expenses"}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[#A1AEBB] tabular-nums">
                  {filteredExpenses.length} {filteredExpenses.length === 1 ? "entry" : "entries"}
                </span>
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] truncate mt-0.5">
                {isKn
                  ? "ದೈನಂದಿನ ಅಂಗಡಿ ಬಾಡಿಗೆ, ವಿದ್ಯುತ್ ಬಿಲ್, ಸಾರಿಗೆ ವೆಚ್ಚ, ಸಿಬ್ಬಂದಿ ವೇತನ ಮತ್ತು ಚಹಾ ಖರ್ಚುಗಳನ್ನು ದಾಖಲಿಸಿ."
                  : "Track shop rent, utilities, freight, labor wages & cash drawer outflows"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={fetchExpenses}
              className="liquid-btn-secondary p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] shrink-0"
              title={t("refresh")}
              aria-label={t("refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#5EEAD4]" : ""}`} />
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="liquid-btn-secondary px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
              title="Download CSV Statement"
            >
              <Download className="w-3.5 h-3.5 text-[#7DD3FC]" />
              <span>Export CSV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetForm();
                setShowAddModal(true);
              }}
              className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>Record Expense</span>
            </button>
          </div>
        </div>

        {/* 2. Cardless Architectural KPI Telemetry Strip */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Column 1: Total Outflows */}
          <div className="px-5 sm:px-7 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                Total Operating Outflow
              </span>
              <span className="text-[11px] font-medium text-[#A1AEBB] tabular-nums">
                {dateFilter === "ALL"
                  ? "All Time"
                  : dateFilter === "TODAY"
                  ? "Today"
                  : dateFilter === "THIS_WEEK"
                  ? "Last 7 Days"
                  : "This Month"}
              </span>
            </div>

            <div className="mt-2 flex items-baseline gap-2">
              <span
                className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums ${
                  totalAmount > 0 ? "text-[#FB7185]" : "text-[#F8FAFC]"
                }`}
              >
                {totalAmount > 0 ? `-₹${totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "₹0.00"}
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>
                Avg Voucher:{" "}
                <strong className="text-[#F8FAFC] font-semibold">
                  ₹
                  {(filteredExpenses.length > 0 ? totalAmount / filteredExpenses.length : 0).toLocaleString("en-IN", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </strong>
              </span>
              <span>{filteredExpenses.length} recorded</span>
            </div>
          </div>

          {/* Column 2: Cash Drawer vs Digital Outflow */}
          <div className="px-5 sm:px-7 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                Cash Drawer Outflow
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#FBBF24]">
                <span className="w-1.5 h-1.5 rounded-full bg-[#FBBF24]" />
                Till Auto-Deduct
              </span>
            </div>

            <div className="mt-2">
              <span
                className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums ${
                  cashOutflow > 0 ? "text-[#FBBF24]" : "text-[#F8FAFC]"
                }`}
              >
                ₹{cashOutflow.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>
                UPI / Bank / Card:{" "}
                <strong className="text-[#7DD3FC] font-semibold">
                  ₹{digitalOutflow.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </strong>
              </span>
              <span>
                {totalAmount > 0 ? `${Math.round((cashOutflow / totalAmount) * 100)}% cash` : "0% cash"}
              </span>
            </div>
          </div>

          {/* Column 3: Top Expense Driver */}
          <div className="px-5 sm:px-7 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                Top Expense Driver
              </span>
              {topCategory && (
                <span className="text-[11px] font-semibold text-[#7DD3FC] tabular-nums">
                  {topPct}% share
                </span>
              )}
            </div>

            <div className="mt-2 min-w-0">
              <div className="text-lg sm:text-xl font-bold text-[#F8FAFC] truncate">
                {topMeta ? (isKn ? topMeta.labelKn : topMeta.labelEn) : "—"}
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>
                {topCategory
                  ? `Category Spend: `
                  : "No overhead category active"}
                {topCategory && (
                  <strong className="text-[#F8FAFC] font-semibold">
                    ₹{topCategory[1].toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </strong>
                )}
              </span>
              <span>
                {categoryBreakdown.length > 0
                  ? `${categoryBreakdown.length} active ${categoryBreakdown.length === 1 ? "head" : "heads"}`
                  : "Awaiting entry"}
              </span>
            </div>
          </div>
        </div>

        {/* 3. Integrated Overhead Spend Spectrum (Rendered only when expenses exist) */}
        {categoryBreakdown.length > 0 && (
          <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] bg-[#080B10]/20 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                {isKn ? "ವೆಚ್ಚಗಳ ವಿಭಾಗವಾರು ವಿಶ್ಲೇಷಣೆ" : "Overhead Mix Breakdown"}
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                {categoryBreakdown.map(([cat, amt]) => {
                  const meta = getCategoryMeta(cat);
                  const pct = totalAmount > 0 ? Math.round((amt / totalAmount) * 100) : 0;
                  const isFiltered = categoryFilter === cat;
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategoryFilter(isFiltered ? "ALL" : cat)}
                      className={`inline-flex items-center gap-1.5 transition-opacity tabular-nums ${
                        categoryFilter !== "ALL" && !isFiltered
                          ? "opacity-45 hover:opacity-85"
                          : "opacity-100"
                      }`}
                      title={`Filter by ${meta.labelEn}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${meta.dotClass}`} />
                      <span className="text-[#A1AEBB] font-medium">
                        {isKn ? meta.shortKn : meta.shortEn}
                      </span>
                      <span className="text-[#F8FAFC] font-semibold">
                        ₹{amt.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                      </span>
                      <span className="text-[#A1AEBB]/70 text-[10px]">({pct}%)</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex gap-px">
              {categoryBreakdown.map(([cat, amt]) => {
                const meta = getCategoryMeta(cat);
                const pct = totalAmount > 0 ? (amt / totalAmount) * 100 : 0;
                return (
                  <div
                    key={cat}
                    style={{ width: `${pct}%` }}
                    title={`${isKn ? meta.labelKn : meta.labelEn}: ₹${amt.toFixed(2)} (${pct.toFixed(1)}%)`}
                    className={`h-full transition-all duration-500 ${meta.dotClass}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Quick Routine Log Presets Strip */}
        <div className="relative z-10 px-5 sm:px-7 py-2.5 border-b border-white/[0.08] bg-white/[0.015] flex flex-wrap items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB] shrink-0">
            <Zap className="w-3.5 h-3.5 text-[#5EEAD4]" />
            <span>{isKn ? "ತ್ವರಿತ ದಾಖಲೆ:" : "Quick Log:"}</span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 flex-1">
            {QUICK_PRESETS.map((preset, idx) => {
              const Icon = preset.icon;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="px-2.5 py-1 rounded-lg border border-white/[0.1] bg-[#080B10]/55 hover:border-[#5EEAD4]/45 hover:bg-[#5EEAD4]/[0.08] text-[11px] font-medium text-[#A1AEBB] hover:text-[#F8FAFC] transition-all flex items-center gap-1.5 active:scale-[0.98]"
                >
                  <Icon className="w-3 h-3 text-[#5EEAD4]/80 shrink-0" />
                  <span className="tabular-nums">{preset.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. Integrated Search, Period Underline Tabs & Category Selector */}
        <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 lg:max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#A1AEBB]" />
            <input
              type="text"
              placeholder={isKn ? "ವೆಚ್ಚದ ಹೆಸರು ಅಥವಾ ವಿವರ ಹುಡುಕಿ..." : "Search title, voucher note, or tender..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-[#080B10]/70 border border-white/[0.12] text-xs text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:border-[#5EEAD4] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1AEBB] hover:text-[#F8FAFC]"
                aria-label="Clear expense search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-5">
            {/* Period Underline Tabs (Matching Financial Cockpit) */}
            <div className="flex items-center gap-5 text-xs font-semibold">
              {(["ALL", "TODAY", "THIS_WEEK", "THIS_MONTH"] as const).map((df) => {
                const isActive = dateFilter === df;
                const label =
                  df === "ALL"
                    ? isKn ? "ಎಲ್ಲಾ" : "All Time"
                    : df === "TODAY"
                    ? isKn ? "ಇಂದು" : "Today"
                    : df === "THIS_WEEK"
                    ? isKn ? "ಈ ವಾರ" : "This Week"
                    : isKn ? "ಈ ತಿಂಗಳು" : "This Month";
                return (
                  <button
                    key={df}
                    type="button"
                    onClick={() => setDateFilter(df)}
                    className={`pb-1.5 relative transition-all whitespace-nowrap ${
                      isActive
                        ? "text-[#F8FAFC] font-bold"
                        : "text-[#A1AEBB] hover:text-[#F8FAFC]"
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

            {/* Dark Category Filter Select */}
            <div className="flex items-center gap-2 shrink-0">
              <Tag className="w-3.5 h-3.5 text-[#A1AEBB]" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                aria-label="Filter by expense category"
                className="px-3 py-1.5 bg-[#080B10]/80 border border-white/[0.12] rounded-xl text-xs font-medium text-[#F8FAFC] focus:border-[#5EEAD4] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
              >
                <option value="ALL" className="bg-[#111722] text-[#F8FAFC]">
                  {isKn ? "ಎಲ್ಲಾ ವರ್ಗಗಳು (All Categories)" : "All Categories"}
                </option>
                {EXPENSE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value} className="bg-[#111722] text-[#F8FAFC]">
                    {isKn ? `${cat.labelKn} (${cat.labelEn})` : cat.labelEn}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Inline Error Notification */}
        {error && (
          <div className="relative z-10 px-5 sm:px-7 py-2.5 bg-[#FB7185]/12 border-b border-[#FB7185]/30 text-[#FB7185] text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-[#FB7185]/70 hover:text-[#FB7185]"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 6. Expense Ledger Body / Integrated Empty State */}
        <div className="relative z-10">
          {loading ? (
            <div className="py-16 text-center text-[#A1AEBB] text-xs space-y-2.5">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#5EEAD4]" />
              <div>{t("loading")}</div>
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="py-9 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-[#5EEAD4]/35 flex items-center justify-center text-[#6EE7B7] shadow-[0_0_20px_rgba(94,234,212,0.12)] mb-3">
                <Wallet className="w-5 h-5" />
              </div>

              <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight">
                {hasActiveFilters
                  ? "No Expenses Match Active Filters"
                  : isKn
                  ? "ಯಾವುದೇ ಖರ್ಚುಗಳು ದಾಖಲಾಗಿಲ್ಲ"
                  : "No Operating Expenses Recorded"}
              </h3>

              <p className="text-xs text-[#A1AEBB] max-w-md mt-1.5 leading-relaxed">
                {hasActiveFilters
                  ? "Adjust the search query, time period, or category filter to view matching ledger entries."
                  : isKn
                  ? "ದೈನಂದಿನ ಅಂಗಡಿ ಬಾಡಿಗೆ, ಕರೆಂಟ್ ಬಿಲ್, ವಾಹನ ಸಾರಿಗೆ ಮತ್ತು ಚಹಾ ಖರ್ಚುಗಳನ್ನು ದಾಖಲಿಸಿ."
                  : "Record daily shop outflows such as rent, utilities, transport freight, and staff wages to maintain an accurate operating ledger."}
              </p>

              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-[#A1AEBB] mt-3.5 mb-4">
                <ShieldCheck className="w-3.5 h-3.5 text-[#6EE7B7]" />
                <span>Live Verified Ledger • Zero synthetic entries</span>
              </div>

              <div className="flex items-center gap-2.5">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearAllFilters}
                    className="liquid-btn-secondary px-3.5 py-2 rounded-xl text-xs font-semibold"
                  >
                    Reset Filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setShowAddModal(true);
                  }}
                  className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>{isKn ? "ಹೊಸ ಖರ್ಚು ದಾಖಲಿಸಿ" : "Record First Expense"}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#080B10]/35 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.1em]">
                  <tr>
                    <th className="px-5 sm:px-7 py-3">Date</th>
                    <th className="px-4 py-3">Description & Voucher Ref</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3 text-right">Amount</th>
                    <th className="px-5 sm:px-7 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredExpenses.map((e) => {
                    const meta = getCategoryMeta(e.category);
                    const Icon = meta.icon;
                    const modeUpper = e.payment_method.toUpperCase();
                    return (
                      <tr
                        key={e.id}
                        className="border-l-2 border-l-transparent hover:border-l-[#5EEAD4]/75 hover:bg-white/[0.025] transition-all"
                      >
                        <td className="px-5 sm:px-7 py-3 text-[#A1AEBB] font-mono text-[11px] whitespace-nowrap tabular-nums">
                          {formatDateLocalized(e.expense_date)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#F8FAFC] text-[13px] leading-snug">
                            <KannadaText text={e.title} />
                          </div>
                          {(e.notes || e.created_by_name) && (
                            <div className="text-[11px] text-[#A1AEBB]/80 mt-0.5 flex flex-wrap items-center gap-x-2">
                              {e.notes && <KannadaText text={e.notes} />}
                              {e.notes && e.created_by_name && <span className="text-white/20">•</span>}
                              {e.created_by_name && (
                                <span className="text-[10px] text-[#A1AEBB]/65">
                                  {isKn ? "ನಮೂದಿಸಿದವರು:" : "By"} <KannadaText text={e.created_by_name} />
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold border ${meta.color}`}
                          >
                            <Icon className="w-3 h-3 shrink-0" />
                            <span>{isKn ? meta.labelKn : meta.labelEn}</span>
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                              modeUpper === "CASH"
                                ? "bg-[#FBBF24]/12 text-[#FBBF24] border-[#FBBF24]/30"
                                : modeUpper === "UPI"
                                ? "bg-[#7DD3FC]/12 text-[#7DD3FC] border-[#7DD3FC]/30"
                                : "bg-[#A78BFA]/12 text-[#A78BFA] border-[#A78BFA]/30"
                            }`}
                          >
                            {tData(e.payment_method).replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-[#FB7185] font-mono text-[13px] tabular-nums whitespace-nowrap">
                          -{formatMoney(e.amount)}
                        </td>
                        <td className="px-5 sm:px-7 py-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleDeleteExpense(e.id)}
                            disabled={deletingId === e.id}
                            className="p-1.5 rounded-lg text-[#A1AEBB]/55 hover:text-[#FB7185] hover:bg-[#FB7185]/10 transition-colors disabled:opacity-40"
                            title="Void / Delete Expense"
                            aria-label={`Delete ${e.title}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-[#080B10]/45 border-t border-white/[0.1] text-xs font-bold">
                  <tr>
                    <td colSpan={4} className="px-5 sm:px-7 py-3 text-right text-[#A1AEBB]">
                      Filtered Outflow Total ({filteredExpenses.length}{" "}
                      {filteredExpenses.length === 1 ? "entry" : "entries"}):
                    </td>
                    <td className="px-4 py-3 text-right text-[#FB7185] font-mono text-sm tabular-nums whitespace-nowrap">
                      -₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 sm:px-7 py-3" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Record Operational Expense Modal (High-Contrast Midnight Mist Glass) */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4">
          <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_12px_rgba(94,234,212,0.2)] shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#F8FAFC]">
                    {isKn ? "ಹೊಸ ಖರ್ಚು ದಾಖಲಿಸಿ" : "Record Operational Expense"}
                  </h2>
                  <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                    Log verifiable overhead costs to compute true net profit.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg transition-colors"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateExpense} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                  Title / Description *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g., Shop electricity bill, Auto freight"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/55 focus:outline-none focus:border-[#5EEAD4] focus:ring-2 focus:ring-[#5EEAD4]/20 font-medium transition-all"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Category *
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4] focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
                  >
                    {EXPENSE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value} className="bg-[#111722] text-[#F8FAFC]">
                        {isKn ? c.labelKn : c.labelEn}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Amount (₹) *
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1AEBB] font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="1"
                      required
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="w-full pl-7 pr-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] font-bold text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4] focus:ring-2 focus:ring-[#5EEAD4]/20 text-right tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Expense Date
                  </label>
                  <input
                    type="date"
                    required
                    value={form.expense_date}
                    onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4] focus:ring-2 focus:ring-[#5EEAD4]/20 tabular-nums [color-scheme:dark] transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Payment Mode
                  </label>
                  <select
                    value={form.payment_method}
                    onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4] focus:ring-2 focus:ring-[#5EEAD4]/20 font-semibold transition-all"
                  >
                    <option value="CASH" className="bg-[#111722] text-[#F8FAFC]">
                      Cash (Drawer Outflow)
                    </option>
                    <option value="UPI" className="bg-[#111722] text-[#F8FAFC]">
                      UPI (GPay / PhonePe)
                    </option>
                    <option value="BANK_TRANSFER" className="bg-[#111722] text-[#F8FAFC]">
                      Bank Transfer
                    </option>
                    <option value="CARD" className="bg-[#111722] text-[#F8FAFC]">
                      Card
                    </option>
                  </select>
                </div>
              </div>

              {form.payment_method === "CASH" && (
                <div className="p-2.5 rounded-xl bg-[#FBBF24]/10 border border-[#FBBF24]/30 text-[#FBBF24] text-[11px] flex items-center gap-2">
                  <Wallet className="w-3.5 h-3.5 shrink-0" />
                  <span>
                    Cash payments automatically reflect as a cash outflow in your active drawer shift.
                  </span>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                  Notes / Voucher Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g., Voucher #883, Paid to freight driver Ramesh"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/55 focus:outline-none focus:border-[#5EEAD4] focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2.5 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  {t("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {submitting ? "Saving..." : "Record Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
