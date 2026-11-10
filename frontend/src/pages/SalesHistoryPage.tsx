import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Business, Invoice } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { PrintableReceipt } from "../components/PrintableReceipt";
import { KannadaText } from "../components/common/KannadaText";
import {
  Receipt,
  Search,
  Eye,
  Ban,
  Printer,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  FileSpreadsheet,
  MessageCircle,
  RefreshCw,
  AlertCircle,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { Gstr1ExportModal } from "../components/common/Gstr1ExportModal";
import {
  buildInvoiceWhatsAppMessage,
  buildWhatsAppUrl,
  openWhatsAppUrl,
} from "../utils/whatsapp";

type StatusTab = "ALL" | "COMPLETED" | "CANCELLED";

const PAYMENT_COLORS: Record<string, { badge: string; dot: string; label: string }> = {
  CASH: {
    badge: "bg-[#6EE7B7]/12 text-[#6EE7B7] border-[#6EE7B7]/30",
    dot: "bg-[#6EE7B7]",
    label: "Cash",
  },
  UPI: {
    badge: "bg-[#7DD3FC]/12 text-[#7DD3FC] border-[#7DD3FC]/30",
    dot: "bg-[#7DD3FC]",
    label: "UPI",
  },
  CARD: {
    badge: "bg-[#A78BFA]/12 text-[#A78BFA] border-[#A78BFA]/30",
    dot: "bg-[#A78BFA]",
    label: "Card",
  },
  CREDIT: {
    badge: "bg-[#FBBF24]/12 text-[#FBBF24] border-[#FBBF24]/30",
    dot: "bg-[#FBBF24]",
    label: "Khata",
  },
  SPLIT: {
    badge: "bg-[#5EEAD4]/12 text-[#5EEAD4] border-[#5EEAD4]/30",
    dot: "bg-[#5EEAD4]",
    label: "Split",
  },
};

export const SalesHistoryPage: React.FC = () => {
  const { t, language, formatMoney } = useLanguage();
  const isKn = language === "kn";

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusTab>("ALL");
  const [paymentFilter, setPaymentFilter] = useState<string>("ALL");
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [printInvoice, setPrintInvoice] = useState<Invoice | null>(null);
  const [cancelModalInvoice, setCancelModalInvoice] = useState<Invoice | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [isGstr1ModalOpen, setIsGstr1ModalOpen] = useState(false);

  // WhatsApp Phone Modal (replaces native window.prompt/alert)
  const [whatsappInvoice, setWhatsappInvoice] = useState<Invoice | null>(null);
  const [whatsappPhoneInput, setWhatsappPhoneInput] = useState("");
  const [whatsappError, setWhatsappError] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getInvoices(debouncedSearch || undefined, 200);
      setInvoices(data);
    } catch (err: any) {
      setError(err.message || "Failed to load sales history");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, [debouncedSearch]);

  useEffect(() => {
    api
      .getBusinessProfile()
      .then(setBusiness)
      .catch((err) => console.error("Failed to load receipt settings", err));
  }, []);

  const sendInvoiceViaWhatsApp = (inv: Invoice, phone: string) => {
    const message = buildInvoiceWhatsAppMessage(
      inv,
      business?.name || "SmartStock Retail",
      business?.phone,
      isKn
    );
    const url = buildWhatsAppUrl(phone, message);
    if (url) {
      openWhatsAppUrl(url);
      return true;
    }
    return false;
  };

  const handleShareWhatsApp = (inv: Invoice) => {
    setError(null);
    if (inv.customer_phone) {
      const ok = sendInvoiceViaWhatsApp(inv, inv.customer_phone);
      if (!ok) {
        setWhatsappInvoice(inv);
        setWhatsappPhoneInput(inv.customer_phone || "");
        setWhatsappError("Stored customer number is not a valid 10-digit Indian mobile number.");
      }
      return;
    }
    setWhatsappInvoice(inv);
    setWhatsappPhoneInput("");
    setWhatsappError(null);
  };

  const handleConfirmWhatsAppModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whatsappInvoice) return;
    if (!whatsappPhoneInput.trim()) {
      setWhatsappError("Please enter a 10-digit customer mobile number.");
      return;
    }
    const ok = sendInvoiceViaWhatsApp(whatsappInvoice, whatsappPhoneInput.trim());
    if (!ok) {
      setWhatsappError("Invalid Indian mobile number. Enter a 10-digit number (e.g. 9845012345).");
      return;
    }
    setWhatsappInvoice(null);
    setWhatsappPhoneInput("");
    setWhatsappError(null);
  };

  const handleCancelInvoice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalInvoice || !cancelReason.trim()) return;
    setCancelling(true);
    setCancelError(null);
    try {
      await api.cancelInvoice(cancelModalInvoice.id, cancelReason.trim());
      setCancelModalInvoice(null);
      setCancelReason("");
      await fetchInvoices();
    } catch (err: any) {
      setCancelError(err.message || "Failed to cancel invoice");
    } finally {
      setCancelling(false);
    }
  };

  // Client filtering + aggregated telemetry
  const searchFilteredInvoices = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invoice_number.toLowerCase().includes(q) ||
        (inv.customer_name || "").toLowerCase().includes(q) ||
        (inv.customer_phone || "").toLowerCase().includes(q)
    );
  }, [invoices, searchTerm]);

  const stats = useMemo(() => {
    let completedCount = 0;
    let cancelledCount = 0;
    let completedRevenue = 0;
    let cancelledValue = 0;
    let cashTotal = 0;
    let upiCardTotal = 0;
    let khataCreditTotal = 0;
    let khataBillCount = 0;
    const methodMap: Record<string, number> = {};

    searchFilteredInvoices.forEach((inv) => {
      if (inv.status === "COMPLETED") {
        completedCount += 1;
        completedRevenue += inv.total_amount;

        const m = inv.payment_method;
        methodMap[m] = (methodMap[m] || 0) + inv.total_amount;

        if (m === "CASH") {
          cashTotal += inv.total_amount;
        } else if (m === "UPI" || m === "CARD") {
          upiCardTotal += inv.total_amount;
        } else if (m === "CREDIT") {
          const due =
            inv.credit_amount !== undefined
              ? inv.credit_amount
              : Math.max(0, inv.total_amount - (inv.paid_amount || 0));
          khataCreditTotal += due > 0 ? due : inv.total_amount;
          khataBillCount += 1;
          cashTotal += inv.paid_amount || 0;
        } else if (m === "SPLIT") {
          upiCardTotal += inv.paid_amount || 0;
          if ((inv.credit_amount || 0) > 0) {
            khataCreditTotal += inv.credit_amount || 0;
            khataBillCount += 1;
          }
        }
      } else {
        cancelledCount += 1;
        cancelledValue += inv.total_amount;
      }
    });

    const aov = completedCount > 0 ? completedRevenue / completedCount : 0;
    const methodBreakdown = Object.entries(methodMap)
      .filter(([, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1]);

    return {
      totalCount: searchFilteredInvoices.length,
      completedCount,
      cancelledCount,
      completedRevenue,
      cancelledValue,
      cashTotal,
      upiCardTotal,
      khataCreditTotal,
      khataBillCount,
      aov,
      methodBreakdown,
    };
  }, [searchFilteredInvoices]);

  const filtered = useMemo(() => {
    return searchFilteredInvoices.filter((inv) => {
      if (statusFilter === "COMPLETED" && inv.status !== "COMPLETED") return false;
      if (statusFilter === "CANCELLED" && inv.status === "COMPLETED") return false;
      if (paymentFilter !== "ALL" && inv.payment_method !== paymentFilter) return false;
      return true;
    });
  }, [searchFilteredInvoices, statusFilter, paymentFilter]);

  const hasActiveFilters =
    searchTerm.trim() !== "" || statusFilter !== "ALL" || paymentFilter !== "ALL";

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setPaymentFilter("ALL");
  };

  return (
    <div className="max-w-7xl mx-auto pb-2">
      {/* Unified Midnight Mist Liquid Glass Sales & Invoices Terminal */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.12)] relative overflow-hidden backdrop-blur-2xl">
        {/* Ambient diffuse highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-gradient-to-br from-[#5EEAD4]/14 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-24 w-72 h-72 bg-gradient-to-tl from-[#7DD3FC]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* 1. Terminal Header & Primary Toolbar */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_12px_rgba(94,234,212,0.25)] shrink-0">
              <Receipt className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[#6EE7B7] tracking-wider uppercase font-semibold">
                  {t("navSales")}
                </span>
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[#A1AEBB] tabular-nums">
                  {filtered.length} {filtered.length === 1 ? "bill" : "bills"}
                </span>
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] truncate mt-0.5">
                {isKn
                  ? "ಅಂಗಡಿ ಮಾರಾಟದ ರಶೀದಿಗಳು, ಪಾವತಿ ವಿಧಾನಗಳು, ಮರುಮುದ್ರಣ ಮತ್ತು ಬಿಲ್ ರದ್ದತಿ ಲೆಕ್ಕಪತ್ರ"
                  : "Immutable GST invoice ledger, tender splits, thermal reprints & audited cancellations"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={fetchInvoices}
              className="liquid-btn-secondary p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] shrink-0"
              title={t("refresh")}
              aria-label={t("refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#5EEAD4]" : ""}`} />
            </button>

            <button
              type="button"
              onClick={() => setIsGstr1ModalOpen(true)}
              className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>{isKn ? "GSTR-1 ವರದಿ" : "Export GSTR-1"}</span>
            </button>
          </div>
        </div>

        {/* 2. Cardless Architectural 4-Column KPI Telemetry Strip */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Col 1: Completed Sales */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಒಟ್ಟು ಮಾರಾಟ ಆದಾಯ" : "Billed Revenue"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6EE7B7] tabular-nums whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
                {stats.completedCount} settled
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {formatMoney(stats.completedRevenue)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>
                Avg Bill (AOV):{" "}
                <strong className="text-[#F8FAFC] font-semibold">
                  {formatMoney(stats.aov)}
                </strong>
              </span>
            </div>
          </div>

          {/* Col 2: Cash vs Digital Collection */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ನಗದು ಮತ್ತು ಡಿಜಿಟಲ್" : "Cash & Digital Tender"}
              </span>
              <span className="text-[11px] font-medium text-[#7DD3FC] tabular-nums whitespace-nowrap">
                {stats.completedRevenue > 0
                  ? `${Math.round(((stats.cashTotal + stats.upiCardTotal) / stats.completedRevenue) * 100)}% collected`
                  : "0%"}
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#7DD3FC] tracking-tight tabular-nums mt-2">
              {formatMoney(stats.cashTotal + stats.upiCardTotal)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Cash: {formatMoney(stats.cashTotal)}</span>
              <span>UPI/Card: {formatMoney(stats.upiCardTotal)}</span>
            </div>
          </div>

          {/* Col 3: Khata / Credit Issued */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಖಾತೆ ಉದ್ದರಿ ಮಾರಾಟ" : "Khata Credit Billed"}
              </span>
              <span
                className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                  stats.khataBillCount > 0 ? "text-[#FBBF24]" : "text-[#A1AEBB]"
                }`}
              >
                {stats.khataBillCount} {stats.khataBillCount === 1 ? "bill" : "bills"}
              </span>
            </div>
            <div
              className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums mt-2 ${
                stats.khataCreditTotal > 0 ? "text-[#FBBF24]" : "text-[#F8FAFC]"
              }`}
            >
              {formatMoney(stats.khataCreditTotal)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB]">
              <span>Receivable on ledger</span>
              <span className={stats.khataCreditTotal > 0 ? "text-[#FBBF24]" : "text-[#6EE7B7]"}>
                {stats.khataCreditTotal > 0 ? "Credit Terms" : "All Cash/UPI"}
              </span>
            </div>
          </div>

          {/* Col 4: Voided / Cancelled */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ರದ್ದಾದ ಬಿಲ್ಲುಗಳು" : "Voided / Cancelled"}
              </span>
              <span
                className={`text-[11px] font-semibold tabular-nums whitespace-nowrap ${
                  stats.cancelledCount > 0 ? "text-[#FB7185]" : "text-[#6EE7B7]"
                }`}
              >
                {stats.cancelledCount > 0 ? `${stats.cancelledCount} reversed` : "Clean Ledger"}
              </span>
            </div>
            <div
              className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums mt-2 ${
                stats.cancelledCount > 0 ? "text-[#FB7185]" : "text-[#F8FAFC]"
              }`}
            >
              {formatMoney(stats.cancelledValue)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB]">
              <span>Restocked & audited</span>
              <span>{stats.cancelledCount} count</span>
            </div>
          </div>
        </div>

        {/* 3. Payment Tender Proportion Mix (Interactive Filter Strip) */}
        {stats.methodBreakdown.length > 0 && (
          <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] bg-[#080B10]/20 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                {isKn ? "ಪಾವತಿ ವಿಧಾನಗಳ ಹಂಚಿಕೆ" : "Tender Mix Breakdown"}
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                {stats.methodBreakdown.map(([method, amt]) => {
                  const cfg = PAYMENT_COLORS[method] || PAYMENT_COLORS.SPLIT;
                  const pct =
                    stats.completedRevenue > 0
                      ? Math.round((amt / stats.completedRevenue) * 100)
                      : 0;
                  const isFiltered = paymentFilter === method;
                  return (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setPaymentFilter(isFiltered ? "ALL" : method)}
                      className={`inline-flex items-center gap-1.5 transition-opacity tabular-nums ${
                        paymentFilter !== "ALL" && !isFiltered
                          ? "opacity-45 hover:opacity-85"
                          : "opacity-100"
                      }`}
                      title={`Filter by ${cfg.label}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                      <span className="text-[#A1AEBB] font-medium">{cfg.label}</span>
                      <span className="text-[#F8FAFC] font-semibold">{formatMoney(amt)}</span>
                      <span className="text-[#A1AEBB]/70 text-[10px]">({pct}%)</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex gap-px">
              {stats.methodBreakdown.map(([method, amt]) => {
                const cfg = PAYMENT_COLORS[method] || PAYMENT_COLORS.SPLIT;
                const pct =
                  stats.completedRevenue > 0 ? (amt / stats.completedRevenue) * 100 : 0;
                return (
                  <div
                    key={method}
                    style={{ width: `${pct}%` }}
                    title={`${cfg.label}: ${formatMoney(amt)} (${pct.toFixed(1)}%)`}
                    className={`h-full transition-all duration-500 ${cfg.dot}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Integrated Search, Status Underline Tabs & Tender Filter */}
        <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#A1AEBB]" />
            <input
              type="text"
              placeholder={
                isKn
                  ? "ಬಿಲ್ ಸಂಖ್ಯೆ, ಗ್ರಾಹಕರ ಹೆಸರು ಅಥವಾ ಮೊಬೈಲ್ ಹುಡುಕಿ..."
                  : "Search by invoice # (INV-2026-...), customer name or phone..."
              }
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-[#080B10]/70 border border-white/[0.12] text-xs text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:border-[#5EEAD4] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1AEBB] hover:text-[#F8FAFC]"
                aria-label="Clear invoice search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-5">
            {/* Underline Status Tabs */}
            <div className="flex items-center gap-5 text-xs font-semibold">
              {(
                [
                  { key: "ALL", label: isKn ? "ಎಲ್ಲಾ" : "All", count: stats.totalCount },
                  {
                    key: "COMPLETED",
                    label: isKn ? "ಪೂರ್ಣಗೊಂಡಿದೆ" : "Completed",
                    count: stats.completedCount,
                  },
                  {
                    key: "CANCELLED",
                    label: isKn ? "ರದ್ದಾಗಿದೆ" : "Cancelled",
                    count: stats.cancelledCount,
                  },
                ] as const
              ).map((tab) => {
                const isActive = statusFilter === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusFilter(tab.key)}
                    className={`pb-1.5 relative transition-all whitespace-nowrap ${
                      isActive ? "text-[#F8FAFC] font-bold" : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                    }`}
                  >
                    {tab.label}
                    <span className="ml-1 text-[10.5px] font-mono text-[#A1AEBB] tabular-nums">
                      ({tab.count})
                    </span>
                    {isActive && (
                      <span
                        className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${
                          tab.key === "CANCELLED"
                            ? "bg-[#FB7185] shadow-[0_0_8px_#FB7185]"
                            : "bg-[#6EE7B7] shadow-[0_0_8px_#5EEAD4]"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dark Payment Filter Select */}
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-3.5 h-3.5 text-[#A1AEBB]" />
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                aria-label="Filter by payment method"
                className="px-3 py-1.5 bg-[#080B10]/80 border border-white/[0.12] rounded-xl text-xs font-medium text-[#F8FAFC] focus:border-[#5EEAD4] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
              >
                <option value="ALL" className="bg-[#111722] text-[#F8FAFC]">
                  All Payment Methods
                </option>
                <option value="CASH" className="bg-[#111722] text-[#F8FAFC]">
                  Cash
                </option>
                <option value="UPI" className="bg-[#111722] text-[#F8FAFC]">
                  UPI
                </option>
                <option value="CARD" className="bg-[#111722] text-[#F8FAFC]">
                  Card
                </option>
                <option value="CREDIT" className="bg-[#111722] text-[#F8FAFC]">
                  Khata (Credit)
                </option>
                <option value="SPLIT" className="bg-[#111722] text-[#F8FAFC]">
                  Split
                </option>
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
              onClick={fetchInvoices}
              className="underline font-semibold hover:text-[#F8FAFC]"
            >
              Retry
            </button>
          </div>
        )}

        {/* 5. Ledger Table Body / Empty State */}
        <div className="relative z-10">
          {loading ? (
            <div className="py-16 text-center text-[#A1AEBB] text-xs space-y-2.5">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#5EEAD4]" />
              <div>{t("loading")}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-[#5EEAD4]/35 flex items-center justify-center text-[#6EE7B7] shadow-[0_0_20px_rgba(94,234,212,0.12)] mb-3">
                <Receipt className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight">
                {hasActiveFilters
                  ? "No Invoices Match Active Filters"
                  : "No Sales Invoices Recorded"}
              </h3>
              <p className="text-xs text-[#A1AEBB] max-w-md mt-1.5 leading-relaxed">
                {hasActiveFilters
                  ? "Adjust the search term, status tab, or tender filter to inspect matching POS bills."
                  : "Completed POS sales are permanently logged here with CGST/SGST tax splits and stock audit trails."}
              </p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-[#A1AEBB] mt-3.5">
                <ShieldCheck className="w-3.5 h-3.5 text-[#6EE7B7]" />
                <span>Immutable Audited Ledger • Zero synthetic bills</span>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold mt-4"
                >
                  Reset Filters
                </button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#080B10]/35 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.1em]">
                  <tr>
                    <th className="px-5 sm:px-7 py-3">Invoice #</th>
                    <th className="px-4 py-3">Date & Time</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Payment</th>
                    <th className="px-4 py-3 text-right">Items</th>
                    <th className="px-4 py-3 text-right">Total Amount</th>
                    <th className="px-4 py-3 text-center">Status</th>
                    <th className="px-5 sm:px-7 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filtered.map((inv) => {
                    const pStyle = PAYMENT_COLORS[inv.payment_method] || PAYMENT_COLORS.SPLIT;
                    const isCompleted = inv.status === "COMPLETED";
                    return (
                      <tr
                        key={inv.id}
                        className="border-l-2 border-l-transparent hover:border-l-[#5EEAD4]/75 hover:bg-white/[0.025] transition-all"
                      >
                        <td className="px-5 sm:px-7 py-3.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setSelectedInvoice(inv)}
                            className="font-mono font-bold text-[#F8FAFC] hover:text-[#6EE7B7] transition-colors tabular-nums text-left"
                          >
                            {inv.invoice_number}
                          </button>
                          {inv.created_by_name && (
                            <div className="text-[10px] text-[#A1AEBB]/70 mt-0.5">
                              By <KannadaText text={inv.created_by_name} />
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-[11px] text-[#A1AEBB] font-mono tabular-nums whitespace-nowrap">
                          {new Date(inv.created_at).toLocaleString("en-IN", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>

                        <td className="px-4 py-3.5">
                          {inv.customer_name ? (
                            <div>
                              <div className="font-semibold text-[#F8FAFC]">
                                <KannadaText text={inv.customer_name} />
                              </div>
                              {inv.customer_phone && (
                                <div className="text-[10.5px] font-mono text-[#A1AEBB] mt-0.5">
                                  {inv.customer_phone}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[#A1AEBB]/65 italic">
                              {isKn ? "ಸಾಮಾನ್ಯ ಗ್ರಾಹಕರು" : "Walk-in Customer"}
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold border ${pStyle.badge}`}
                          >
                            {pStyle.label}
                          </span>
                          {inv.payment_method === "CREDIT" && inv.payment_status === "DUE" && (
                            <span className="block text-[9.5px] text-[#FBBF24] font-semibold mt-0.5">
                              Khata Due
                            </span>
                          )}
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono text-[#A1AEBB] tabular-nums">
                          {inv.items?.length || 0}
                        </td>

                        <td className="px-4 py-3.5 text-right font-mono font-bold text-[13px] text-[#F8FAFC] tabular-nums whitespace-nowrap">
                          {formatMoney(inv.total_amount)}
                        </td>

                        <td className="px-4 py-3.5 text-center whitespace-nowrap">
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold bg-[#6EE7B7]/12 text-[#6EE7B7] border border-[#6EE7B7]/35">
                              <CheckCircle2 className="w-3 h-3" />
                              {isKn ? "ಪೂರ್ಣ" : "Completed"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold bg-[#FB7185]/12 text-[#FB7185] border border-[#FB7185]/35">
                              <XCircle className="w-3 h-3" />
                              {inv.status === "REFUNDED"
                                ? "Refunded"
                                : isKn
                                ? "ರದ್ದು"
                                : "Cancelled"}
                            </span>
                          )}
                        </td>

                        <td className="px-5 sm:px-7 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoice(inv)}
                              className="p-1.5 rounded-lg text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.08] transition-colors"
                              title="View Invoice Breakdown"
                              aria-label={`View ${inv.invoice_number}`}
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setPrintInvoice(inv)}
                              className="p-1.5 rounded-lg text-[#7DD3FC]/85 hover:text-[#7DD3FC] hover:bg-[#7DD3FC]/10 transition-colors"
                              title="Print Thermal Receipt"
                              aria-label={`Print ${inv.invoice_number}`}
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleShareWhatsApp(inv)}
                              className="p-1.5 rounded-lg text-[#6EE7B7]/85 hover:text-[#6EE7B7] hover:bg-[#5EEAD4]/10 transition-colors"
                              title="Send WhatsApp Receipt"
                              aria-label={`WhatsApp receipt for ${inv.invoice_number}`}
                            >
                              <MessageCircle className="w-4 h-4" />
                            </button>
                            {isCompleted && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCancelReason("");
                                  setCancelError(null);
                                  setCancelModalInvoice(inv);
                                }}
                                className="p-1.5 rounded-lg text-[#A1AEBB]/65 hover:text-[#FB7185] hover:bg-[#FB7185]/10 transition-colors"
                                title="Cancel Invoice & Restock"
                                aria-label={`Cancel ${inv.invoice_number}`}
                              >
                                <Ban className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Invoice Detail Modal (Portalled) */}
      {selectedInvoice &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="liquid-modal max-w-2xl w-full p-6 text-[#F8FAFC] space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <Receipt className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-[#F8FAFC] font-mono">
                        {selectedInvoice.invoice_number}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                          selectedInvoice.status === "COMPLETED"
                            ? "bg-[#6EE7B7]/12 text-[#6EE7B7] border-[#6EE7B7]/35"
                            : "bg-[#FB7185]/12 text-[#FB7185] border-[#FB7185]/35"
                        }`}
                      >
                        {selectedInvoice.status}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#A1AEBB] mt-0.5 tabular-nums">
                      {new Date(selectedInvoice.created_at).toLocaleString("en-IN")} · Cashier:{" "}
                      <span className="text-[#F8FAFC]">
                        {selectedInvoice.created_by_name || "Admin"}
                      </span>
                      {selectedInvoice.customer_name && (
                        <>
                          {" · Customer: "}
                          <span className="text-[#6EE7B7] font-semibold">
                            {selectedInvoice.customer_name}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedInvoice(null)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close invoice detail modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Line items table */}
              <div className="border border-white/[0.1] rounded-xl overflow-hidden bg-[#080B10]/50">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#111722] border-b border-white/[0.08] text-[10.5px] uppercase tracking-wider text-[#A1AEBB]">
                    <tr>
                      <th className="px-3.5 py-2.5 font-semibold">Item</th>
                      <th className="px-3.5 py-2.5 font-semibold text-right">Qty</th>
                      <th className="px-3.5 py-2.5 font-semibold text-right">Rate</th>
                      <th className="px-3.5 py-2.5 font-semibold text-right">GST</th>
                      <th className="px-3.5 py-2.5 font-semibold text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {selectedInvoice.items?.map((item, idx) => (
                      <tr key={idx}>
                        <td className="px-3.5 py-2.5 font-semibold text-[#F8FAFC]">
                          <KannadaText text={item.product_name} />
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-[#A1AEBB] tabular-nums">
                          {item.quantity} <KannadaText text={item.unit} />
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-[#A1AEBB] font-mono tabular-nums">
                          {formatMoney(item.unit_price)}
                        </td>
                        <td className="px-3.5 py-2.5 text-right text-[#A1AEBB] font-mono tabular-nums">
                          {formatMoney(item.tax_amount)} ({item.tax_rate_percent}%)
                        </td>
                        <td className="px-3.5 py-2.5 text-right font-mono font-bold text-[#F8FAFC] tabular-nums">
                          {formatMoney(item.total_amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Financial Breakdown */}
              <div className="bg-[#080B10]/65 border border-white/[0.1] p-4 rounded-xl space-y-2 text-xs">
                <div className="flex justify-between text-[#A1AEBB] tabular-nums">
                  <span>Subtotal (Taxable Value)</span>
                  <span className="font-mono text-[#F8FAFC]">
                    {formatMoney(selectedInvoice.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between text-[#A1AEBB] tabular-nums">
                  <span>CGST</span>
                  <span className="font-mono text-[#F8FAFC]">
                    {formatMoney(selectedInvoice.cgst_amount)}
                  </span>
                </div>
                <div className="flex justify-between text-[#A1AEBB] tabular-nums">
                  <span>SGST</span>
                  <span className="font-mono text-[#F8FAFC]">
                    {formatMoney(selectedInvoice.sgst_amount)}
                  </span>
                </div>
                {selectedInvoice.discount_amount > 0 && (
                  <div className="flex justify-between text-[#6EE7B7] tabular-nums">
                    <span>Discount Applied</span>
                    <span className="font-mono">
                      -{formatMoney(selectedInvoice.discount_amount)}
                    </span>
                  </div>
                )}
                <div className="pt-2.5 border-t border-white/[0.1] flex justify-between items-center font-bold text-sm text-[#F8FAFC]">
                  <span>Total Amount ({selectedInvoice.payment_method})</span>
                  <span className="font-mono text-base text-[#6EE7B7] tabular-nums">
                    {formatMoney(selectedInvoice.total_amount)}
                  </span>
                </div>
              </div>

              <div className="pt-2 flex flex-wrap justify-end gap-2.5 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(selectedInvoice)}
                  className="liquid-btn-secondary flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold text-[#6EE7B7]"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Bill</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPrintInvoice(selectedInvoice);
                    setSelectedInvoice(null);
                  }}
                  className="liquid-btn-primary flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Receipt</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Cancel Invoice Confirmation Modal (Portalled) */}
      {cancelModalInvoice &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4">
            <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FB7185]/15 border border-[#FB7185]/40 text-[#FB7185] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-[#F8FAFC] font-mono">
                      Cancel {cancelModalInvoice.invoice_number}
                    </h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Audited reversal & inventory restock
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setCancelModalInvoice(null)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close cancellation dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#A1AEBB] leading-relaxed">
                Cancelling reverses{" "}
                <strong className="text-[#F8FAFC]">
                  {formatMoney(cancelModalInvoice.total_amount)}
                </strong>{" "}
                in billed revenue and automatically restocks all{" "}
                <strong className="text-[#F8FAFC]">
                  {cancelModalInvoice.items?.length || 0} line items
                </strong>{" "}
                into your store ledger.
              </p>

              {cancelError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{cancelError}</span>
                </div>
              )}

              <form onSubmit={handleCancelInvoice} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Reason for Cancellation *
                  </label>
                  <textarea
                    rows={3}
                    required
                    autoFocus
                    placeholder="e.g., Customer returned items / billing input error"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    className="w-full px-3 py-2 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-xs text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#FB7185]"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setCancelModalInvoice(null)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Keep Invoice
                  </button>
                  <button
                    type="submit"
                    disabled={cancelling || !cancelReason.trim()}
                    className="px-4 py-2 bg-[#FB7185] hover:bg-[#FB7185]/90 text-[#080B10] rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {cancelling ? "Cancelling..." : "Confirm Cancellation"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* WhatsApp Phone Prompt Modal (Replaces native window.prompt, Portalled) */}
      {whatsappInvoice &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4">
            <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#6EE7B7]/15 border border-[#6EE7B7]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">
                      Send Receipt on WhatsApp
                    </h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5 font-mono">
                      {whatsappInvoice.invoice_number} ·{" "}
                      {formatMoney(whatsappInvoice.total_amount)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setWhatsappInvoice(null)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close WhatsApp phone prompt"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {whatsappError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{whatsappError}</span>
                </div>
              )}

              <form onSubmit={handleConfirmWhatsAppModal} className="space-y-4 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Customer 10-Digit Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    autoFocus
                    placeholder="e.g. 9845012345"
                    value={whatsappPhoneInput}
                    onChange={(e) => setWhatsappPhoneInput(e.target.value)}
                    className="w-full px-3 py-2 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-xs font-mono text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setWhatsappInvoice(null)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>Open WhatsApp</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Printable Receipt Modal (Portalled inside PrintableReceipt) */}
      {printInvoice && (
        <PrintableReceipt
          invoice={printInvoice}
          business={business}
          businessName="SmartStock Retailer"
          onClose={() => setPrintInvoice(null)}
        />
      )}

      {/* GSTR-1 Tax Export Modal (Portalled inside Gstr1ExportModal) */}
      <Gstr1ExportModal
        isOpen={isGstr1ModalOpen}
        onClose={() => setIsGstr1ModalOpen(false)}
        shopName={business?.name}
        shopGstin={business?.gstin}
      />
    </div>
  );
};
