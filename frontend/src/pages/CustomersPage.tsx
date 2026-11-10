import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Business, Customer } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { KannadaText } from "../components/common/KannadaText";
import {
  Users,
  Plus,
  Search,
  Phone,
  AlertCircle,
  FileText,
  IndianRupee,
  X,
  RefreshCw,
  MessageCircle,
  Pencil,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import {
  buildWhatsAppUrl,
  openWhatsAppUrl,
  buildKhataReminderWhatsAppMessage,
} from "../utils/whatsapp";
import { KhataStatementModal } from "../components/KhataStatementModal";

type AccountTab = "ALL" | "DUE" | "CLEAR";

const DEBTOR_DOT_CLASSES = [
  "bg-[#FBBF24]",
  "bg-[#FB7185]",
  "bg-[#A78BFA]",
  "bg-[#7DD3FC]",
  "bg-[#5EEAD4]",
];

export const CustomersPage: React.FC = () => {
  const { t, language, formatMoney } = useLanguage();
  const isKn = language === "kn";

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [accountTab, setAccountTab] = useState<AccountTab>("ALL");
  const [error, setError] = useState<string | null>(null);

  // Add / Edit Customer Modal State
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [customerModalError, setCustomerModalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    gstin: "",
  });

  // Payment Modal State
  const [paymentCustomer, setPaymentCustomer] = useState<Customer | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchCustomers = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getCustomers(debouncedSearch || undefined);
      setCustomers(data);
    } catch (err: any) {
      setError(err.message || "Failed to load customers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, [debouncedSearch]);

  useEffect(() => {
    api
      .getBusinessProfile()
      .then(setBusiness)
      .catch((err) => console.error("Failed to load shop UPI settings", err));
  }, []);

  const openAddCustomerModal = () => {
    setEditingCustomer(null);
    setForm({ name: "", phone: "", email: "", address: "", gstin: "" });
    setCustomerModalError(null);
    setShowCustomerModal(true);
  };

  const openEditCustomerModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setForm({
      name: cust.name || "",
      phone: cust.phone || "",
      email: cust.email || "",
      address: cust.address || "",
      gstin: cust.gstin || "",
    });
    setCustomerModalError(null);
    setShowCustomerModal(true);
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || form.name.trim().length < 2) {
      setCustomerModalError("Customer name must be at least 2 characters.");
      return;
    }
    setSubmitting(true);
    setCustomerModalError(null);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        address: form.address.trim() || undefined,
        gstin: form.gstin.trim() || undefined,
      };
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, payload);
      } else {
        await api.createCustomer(payload);
      }
      setShowCustomerModal(false);
      setEditingCustomer(null);
      setForm({ name: "", phone: "", email: "", address: "", gstin: "" });
      await fetchCustomers();
    } catch (err: any) {
      setCustomerModalError(err.message || "Failed to save customer");
    } finally {
      setSubmitting(false);
    }
  };

  const openPaymentModal = (cust: Customer) => {
    setPaymentCustomer(cust);
    setPaymentAmount(cust.outstanding_balance.toFixed(2));
    setPaymentMethod("CASH");
    setPaymentNote("");
    setPaymentError(null);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentCustomer) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) {
      setPaymentError("Please enter a valid payment amount greater than ₹0.");
      return;
    }
    if (amt > paymentCustomer.outstanding_balance + 0.01) {
      setPaymentError(
        `Payment cannot exceed pending Khata balance (${formatMoney(
          paymentCustomer.outstanding_balance
        )}).`
      );
      return;
    }
    setSubmitting(true);
    setPaymentError(null);
    try {
      await api.recordCustomerPayment(paymentCustomer.id, {
        amount: amt,
        payment_method: paymentMethod,
        note: paymentNote.trim() || undefined,
      });
      setPaymentCustomer(null);
      await fetchCustomers();
    } catch (err: any) {
      setPaymentError(err.message || "Failed to record payment");
    } finally {
      setSubmitting(false);
    }
  };

  // Instant search filtering + KPI aggregates
  const searchMatchedCustomers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q) ||
        (c.gstin || "").toLowerCase().includes(q) ||
        (c.address || "").toLowerCase().includes(q)
    );
  }, [customers, searchTerm]);

  const stats = useMemo(() => {
    let totalOutstanding = 0;
    let creditAccountsCount = 0;
    let clearAccountsCount = 0;

    searchMatchedCustomers.forEach((c) => {
      const bal = c.outstanding_balance || 0;
      totalOutstanding += bal;
      if (bal > 0) creditAccountsCount += 1;
      else clearAccountsCount += 1;
    });

    const avgDuePerAccount =
      creditAccountsCount > 0 ? totalOutstanding / creditAccountsCount : 0;

    const topDebtors = searchMatchedCustomers
      .filter((c) => (c.outstanding_balance || 0) > 0)
      .sort((a, b) => (b.outstanding_balance || 0) - (a.outstanding_balance || 0))
      .slice(0, 5);

    return {
      totalCount: searchMatchedCustomers.length,
      totalOutstanding,
      creditAccountsCount,
      clearAccountsCount,
      avgDuePerAccount,
      topDebtors,
    };
  }, [searchMatchedCustomers]);

  const filteredCustomers = useMemo(() => {
    return searchMatchedCustomers.filter((c) => {
      const bal = c.outstanding_balance || 0;
      if (accountTab === "DUE" && bal <= 0) return false;
      if (accountTab === "CLEAR" && bal > 0) return false;
      return true;
    });
  }, [searchMatchedCustomers, accountTab]);

  const hasActiveFilters = searchTerm.trim() !== "" || accountTab !== "ALL";

  const clearFilters = () => {
    setSearchTerm("");
    setAccountTab("ALL");
  };

  return (
    <div className="max-w-7xl mx-auto pb-2">
      {/* Unified Midnight Mist Liquid Glass Customers & Khata Terminal */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.12)] relative overflow-hidden backdrop-blur-2xl">
        {/* Ambient diffuse glass highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-gradient-to-br from-[#5EEAD4]/14 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-24 w-72 h-72 bg-gradient-to-tl from-[#FBBF24]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* 1. Terminal Header & Primary Toolbar */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_12px_rgba(94,234,212,0.25)] shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[#6EE7B7] tracking-wider uppercase font-semibold">
                  {t("navCustomers")}
                </span>
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[#A1AEBB] tabular-nums">
                  {filteredCustomers.length}{" "}
                  {filteredCustomers.length === 1 ? "account" : "accounts"}
                </span>
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] truncate mt-0.5">
                {isKn
                  ? "ಗ್ರಾಹಕರ ವಿವರ, ಡಿಜಿಟಲ್ ಖಾತಾ ಬಾಕಿ ಲೆಕ್ಕಪತ್ರ, ವಸೂಲಾತಿ ಮತ್ತು ವಾಟ್ಸಾಪ್ UPI ಜ್ಞಾಪನೆಗಳು"
                  : "Customer credit directory, digital Khata balances, settlements & WhatsApp UPI reminders"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={fetchCustomers}
              className="liquid-btn-secondary p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] shrink-0"
              title={t("refresh")}
              aria-label={t("refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#5EEAD4]" : ""}`} />
            </button>

            <button
              type="button"
              onClick={openAddCustomerModal}
              className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{isKn ? "ಹೊಸ ಗ್ರಾಹಕರು" : "Add Customer"}</span>
            </button>
          </div>
        </div>

        {/* 2. Cardless Architectural 3-Column KPI Telemetry Strip */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Col 1: Khata Credit Outstanding */}
          <div className="px-5 sm:px-7 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                {isKn ? "ಒಟ್ಟು ಖಾತೆ ಬಾಕಿ" : "Total Khata Receivable"}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${
                  stats.totalOutstanding > 0 ? "text-[#FBBF24]" : "text-[#6EE7B7]"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    stats.totalOutstanding > 0 ? "bg-[#FBBF24]" : "bg-[#6EE7B7]"
                  }`}
                />
                {stats.totalOutstanding > 0 ? "Pending Collection" : "All Settled"}
              </span>
            </div>

            <div className="mt-2">
              <span
                className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums ${
                  stats.totalOutstanding > 0 ? "text-[#FBBF24]" : "text-[#F8FAFC]"
                }`}
              >
                {formatMoney(stats.totalOutstanding)}
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>
                Avg Due:{" "}
                <strong className="text-[#F8FAFC] font-semibold">
                  {formatMoney(stats.avgDuePerAccount)}
                </strong>
              </span>
              <span>Credit exposure</span>
            </div>
          </div>

          {/* Col 2: Active Credit Accounts */}
          <div className="px-5 sm:px-7 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                {isKn ? "ಬಾಕಿ ಇರುವ ಖಾತೆಗಳು" : "Active Credit Accounts"}
              </span>
              {stats.creditAccountsCount > 0 && (
                <button
                  type="button"
                  onClick={() => setAccountTab("DUE")}
                  className="text-[11px] font-semibold text-[#FBBF24] hover:underline"
                >
                  Filter Due →
                </button>
              )}
            </div>

            <div className="mt-2">
              <span className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#F8FAFC] tabular-nums">
                {stats.creditAccountsCount}
              </span>
              <span className="text-xs text-[#A1AEBB] ml-2">
                {stats.creditAccountsCount === 1 ? "customer" : "customers"} with balance &gt; ₹0
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>
                Share of directory:{" "}
                <strong className="text-[#7DD3FC] font-semibold">
                  {stats.totalCount > 0
                    ? `${Math.round((stats.creditAccountsCount / stats.totalCount) * 100)}%`
                    : "0%"}
                </strong>
              </span>
              <span>Active Khata</span>
            </div>
          </div>

          {/* Col 3: Total Registered Contacts */}
          <div className="px-5 sm:px-7 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                {isKn ? "ನೋಂದಾಯಿತ ಗ್ರಾಹಕರು" : "Registered Customers"}
              </span>
              <span className="text-[11px] font-semibold text-[#6EE7B7] tabular-nums">
                {stats.clearAccountsCount} Clear
              </span>
            </div>

            <div className="mt-2">
              <span className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-[#F8FAFC] tabular-nums">
                {stats.totalCount}
              </span>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB]">
              <span>Verified retail accounts</span>
              <span>{business?.upi_vpa ? "UPI Reminder Ready" : "Directory Live"}</span>
            </div>
          </div>
        </div>

        {/* 3. Top Receivable Concentration Spectrum (Shown only when Khata due > 0) */}
        {stats.topDebtors.length > 0 && stats.totalOutstanding > 0 && (
          <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] bg-[#080B10]/20 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                {isKn ? "ಪ್ರಮುಖ ಬಾಕಿ ಖಾತೆಗಳು" : "Top Credit Balances (Click for Statement)"}
              </span>
              <div className="flex flex-wrap items-center gap-3.5 text-[11px]">
                {stats.topDebtors.map((cust, idx) => {
                  const pct = Math.round(
                    ((cust.outstanding_balance || 0) / stats.totalOutstanding) * 100
                  );
                  const dotClass = DEBTOR_DOT_CLASSES[idx % DEBTOR_DOT_CLASSES.length];
                  return (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => setStatementCustomer(cust)}
                      className="inline-flex items-center gap-1.5 hover:opacity-80 transition-opacity tabular-nums"
                      title={`Open Khata statement for ${cust.name}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                      <span className="text-[#A1AEBB] font-medium">
                        <KannadaText text={cust.name} />
                      </span>
                      <span className="text-[#F8FAFC] font-semibold">
                        {formatMoney(cust.outstanding_balance)}
                      </span>
                      <span className="text-[#A1AEBB]/70 text-[10px]">({pct}%)</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex gap-px">
              {stats.topDebtors.map((cust, idx) => {
                const pct =
                  stats.totalOutstanding > 0
                    ? ((cust.outstanding_balance || 0) / stats.totalOutstanding) * 100
                    : 0;
                const dotClass = DEBTOR_DOT_CLASSES[idx % DEBTOR_DOT_CLASSES.length];
                return (
                  <div
                    key={cust.id}
                    style={{ width: `${pct}%` }}
                    title={`${cust.name}: ${formatMoney(cust.outstanding_balance)}`}
                    className={`h-full transition-all duration-500 ${dotClass}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Integrated Search & Status Underline Tabs */}
        <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#A1AEBB]" />
            <input
              type="text"
              placeholder={
                isKn
                  ? "ಹೆಸರು, ಮೊಬೈಲ್ ಸಂಖ್ಯೆ ಅಥವಾ GSTIN ಹುಡುಕಿ..."
                  : "Search customers by name, phone number or GSTIN..."
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
                aria-label="Clear customer search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-5 text-xs font-semibold">
            {(
              [
                { key: "ALL", label: isKn ? "ಎಲ್ಲಾ ಖಾತೆಗಳು" : "All Accounts", count: stats.totalCount },
                {
                  key: "DUE",
                  label: isKn ? "ಬಾಕಿ ಇದೆ" : "Khata Due",
                  count: stats.creditAccountsCount,
                },
                {
                  key: "CLEAR",
                  label: isKn ? "ಚುಕ್ತಾ" : "Settled (Clear)",
                  count: stats.clearAccountsCount,
                },
              ] as const
            ).map((tab) => {
              const isActive = accountTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setAccountTab(tab.key)}
                  className={`pb-1.5 relative transition-all whitespace-nowrap ${
                    isActive ? "text-[#F8FAFC] font-bold" : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                  }`}
                >
                  {tab.label}
                  <span className="ml-1.5 text-[10.5px] font-mono text-[#A1AEBB] tabular-nums">
                    ({tab.count})
                  </span>
                  {isActive && (
                    <span
                      className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${
                        tab.key === "DUE"
                          ? "bg-[#FBBF24] shadow-[0_0_8px_#FBBF24]"
                          : "bg-[#6EE7B7] shadow-[0_0_8px_#5EEAD4]"
                      }`}
                    />
                  )}
                </button>
              );
            })}
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
              onClick={fetchCustomers}
              className="underline font-semibold hover:text-[#F8FAFC]"
            >
              Retry
            </button>
          </div>
        )}

        {/* 5. Directory Ledger Body / Empty State */}
        <div className="relative z-10">
          {loading ? (
            <div className="py-16 text-center text-[#A1AEBB] text-xs space-y-2.5">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#5EEAD4]" />
              <div>{t("loading")}</div>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-[#5EEAD4]/35 flex items-center justify-center text-[#6EE7B7] shadow-[0_0_20px_rgba(94,234,212,0.12)] mb-3">
                <Users className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight">
                {hasActiveFilters
                  ? "No Customers Match Active Filters"
                  : "No Customers Registered Yet"}
              </h3>
              <p className="text-xs text-[#A1AEBB] max-w-md mt-1.5 leading-relaxed">
                {hasActiveFilters
                  ? "Clear search text or switch status tabs to see registered contacts."
                  : "Maintain digital Khata ledgers, capture customer mobile numbers for WhatsApp bills, and track repayments."}
              </p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-[#A1AEBB] mt-3.5 mb-4">
                <ShieldCheck className="w-3.5 h-3.5 text-[#6EE7B7]" />
                <span>Verified Khata Directory • Zero synthetic entries</span>
              </div>
              <div className="flex items-center gap-2.5">
                {hasActiveFilters && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="liquid-btn-secondary px-3.5 py-2 rounded-xl text-xs font-semibold"
                  >
                    Reset Filters
                  </button>
                )}
                <button
                  type="button"
                  onClick={openAddCustomerModal}
                  className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add First Customer</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#080B10]/35 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.1em]">
                  <tr>
                    <th className="px-5 sm:px-6 py-3">Customer</th>
                    <th className="px-3 py-3">Contact &amp; GSTIN</th>
                    <th className="px-3 py-3">Location / Notes</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Khata Balance</th>
                    <th className="px-3 py-3 text-center">Status</th>
                    <th className="px-5 sm:px-6 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredCustomers.map((c) => {
                    const due = c.outstanding_balance || 0;
                    const isDue = due > 0;
                    const message = isDue
                      ? buildKhataReminderWhatsAppMessage(
                          c.name,
                          due,
                          business?.name || "SmartStock Retail",
                          business?.upi_vpa,
                          isKn
                        )
                      : "";
                    const reminderUrl = isDue ? buildWhatsAppUrl(c.phone, message) : null;

                    return (
                      <tr
                        key={c.id}
                        className="border-l-2 border-l-transparent hover:border-l-[#5EEAD4]/75 hover:bg-white/[0.025] transition-all"
                      >
                        <td className="px-5 sm:px-6 py-3.5 max-w-[200px]">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold border shrink-0 ${
                                isDue
                                  ? "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/35"
                                  : "bg-[#5EEAD4]/15 text-[#6EE7B7] border-[#5EEAD4]/35"
                              }`}
                            >
                              {c.name.trim().charAt(0).toUpperCase() || "C"}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-[#F8FAFC] text-[13px] truncate">
                                <KannadaText text={c.name} />
                              </div>
                              {c.email && (
                                <div className="text-[10.5px] text-[#A1AEBB]/75 truncate">
                                  {c.email}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-3 py-3.5 whitespace-nowrap">
                          {c.phone ? (
                            <div className="inline-flex items-center gap-1.5 font-mono text-[11.5px] text-[#F8FAFC]/85">
                              <Phone className="w-3 h-3 text-[#7DD3FC]" />
                              {c.phone}
                            </div>
                          ) : (
                            <span className="text-[#A1AEBB]/50 italic">—</span>
                          )}
                          {c.gstin && (
                            <div className="text-[10px] font-mono text-[#A1AEBB]/80 mt-0.5">
                              GSTIN: {c.gstin}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3.5 text-[#A1AEBB] max-w-[150px] truncate">
                          {c.address ? <KannadaText text={c.address} /> : "—"}
                        </td>

                        <td className="px-3 py-3.5 text-right whitespace-nowrap tabular-nums">
                          <span
                            className={`font-mono font-bold text-[13px] ${
                              isDue ? "text-[#FBBF24]" : "text-[#A1AEBB]"
                            }`}
                          >
                            {formatMoney(due)}
                          </span>
                        </td>

                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          {isDue ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-[#FBBF24]/12 text-[#FBBF24] border border-[#FBBF24]/35">
                              {isKn ? "ಬಾಕಿ ಇದೆ (Due)" : "Due"}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10.5px] font-bold bg-[#6EE7B7]/12 text-[#6EE7B7] border border-[#6EE7B7]/35">
                              <CheckCircle2 className="w-3 h-3" />
                              {isKn ? "ಚುಕ್ತಾ (Clear)" : "Clear"}
                            </span>
                          )}
                        </td>

                        <td className="px-5 sm:px-6 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openEditCustomerModal(c)}
                              title="Edit Customer Details"
                              aria-label={`Edit ${c.name}`}
                              className="p-1.5 rounded-lg text-[#A1AEBB] hover:text-[#7DD3FC] hover:bg-[#7DD3FC]/10 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => setStatementCustomer(c)}
                              title="View itemized purchase & payment statement"
                              className="liquid-btn-secondary inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold"
                            >
                              <FileText className="w-3 h-3 text-[#7DD3FC]" />
                              <span>Statement</span>
                            </button>

                            {isDue && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openWhatsAppUrl(reminderUrl)}
                                  disabled={!reminderUrl}
                                  title={
                                    reminderUrl
                                      ? "Send WhatsApp Khata reminder with UPI payment link"
                                      : "Add a valid 10-digit mobile number to send WhatsApp reminders"
                                  }
                                  aria-label={`Send WhatsApp reminder to ${c.name}`}
                                  className="liquid-btn-secondary inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[#6EE7B7] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <MessageCircle className="w-3 h-3" />
                                  <span>Remind</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => openPaymentModal(c)}
                                  className="liquid-btn-primary inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-bold"
                                  title="Record payment to settle Khata balance"
                                >
                                  <IndianRupee className="w-3 h-3" />
                                  <span>Collect</span>
                                </button>
                              </>
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

      {/* Add / Edit Customer Modal (Portalled) */}
      {showCustomerModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    {editingCustomer ? (
                      <Pencil className="w-4 h-4" />
                    ) : (
                      <Users className="w-4 h-4" />
                    )}
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#F8FAFC]">
                      {editingCustomer ? "Edit Customer Profile" : "Add Customer"}
                    </h2>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Contact info for GST billing, WhatsApp receipts & Khata ledger.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomerModal(false)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close customer modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {customerModalError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{customerModalError}</span>
                </div>
              )}

              <form onSubmit={handleSaveCustomer} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Full Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g., Basavaraj Angadi"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-xs text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      placeholder="9845012345"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-xs font-mono text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      GSTIN (B2B)
                    </label>
                    <input
                      type="text"
                      placeholder="29XXXXX0000X1ZX"
                      value={form.gstin}
                      onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-xs font-mono text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Email Address (Optional)
                  </label>
                  <input
                    type="email"
                    placeholder="customer@example.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="w-full px-3 py-2 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-xs text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Address / Village / Landmark
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Main Bazaar, Haveri"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-3 py-2 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-xs text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-2.5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setShowCustomerModal(false)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {submitting
                      ? "Saving..."
                      : editingCustomer
                      ? "Save Changes"
                      : "Save Customer"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Receive Khata Payment Modal (Portalled) */}
      {paymentCustomer &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4">
            <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#6EE7B7]/15 border border-[#6EE7B7]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <IndianRupee className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#F8FAFC]">
                      Receive Khata Payment
                    </h2>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Settlement for{" "}
                      <strong className="text-[#F8FAFC]">{paymentCustomer.name}</strong>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPaymentCustomer(null)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close payment modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 bg-[#FBBF24]/12 border border-[#FBBF24]/35 rounded-xl flex justify-between items-center">
                <div>
                  <div className="text-[10.5px] uppercase tracking-wider text-[#FBBF24] font-semibold">
                    Total Pending Due
                  </div>
                  <div className="text-[11px] text-[#A1AEBB] mt-0.5">
                    Current Khata balance
                  </div>
                </div>
                <div className="text-xl font-black font-mono text-[#FBBF24] tabular-nums">
                  {formatMoney(paymentCustomer.outstanding_balance)}
                </div>
              </div>

              {paymentError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{paymentError}</span>
                </div>
              )}

              <form onSubmit={handleRecordPayment} className="space-y-3.5 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB]">
                      Amount Received (₹) *
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentAmount((paymentCustomer.outstanding_balance * 0.5).toFixed(2))
                        }
                        className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[10px] text-[#A1AEBB] hover:text-[#F8FAFC]"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setPaymentAmount(paymentCustomer.outstanding_balance.toFixed(2))
                        }
                        className="px-2 py-0.5 rounded-md bg-[#6EE7B7]/12 border border-[#6EE7B7]/35 text-[10px] font-semibold text-[#6EE7B7]"
                      >
                        Full Due
                      </button>
                    </div>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1AEBB] font-bold">
                      ₹
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      max={paymentCustomer.outstanding_balance}
                      required
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-sm font-mono font-bold text-[#F8FAFC] tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Payment Mode
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {["CASH", "UPI", "BANK_TRANSFER"].map((method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`py-2 text-xs font-semibold rounded-xl border transition-all ${
                          paymentMethod === method
                            ? "bg-[#5EEAD4]/18 text-[#6EE7B7] border-[#5EEAD4]/55 shadow-[0_0_12px_rgba(94,234,212,0.18)]"
                            : "border-white/[0.12] bg-[#080B10]/50 text-[#A1AEBB] hover:text-[#F8FAFC]"
                        }`}
                      >
                        {method === "BANK_TRANSFER" ? "Bank" : method}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Notes / Receipt Reference (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Paid via PhonePe / cash at counter"
                    value={paymentNote}
                    onChange={(e) => setPaymentNote(e.target.value)}
                    className="w-full px-3 py-2 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-xs text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-2.5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setPaymentCustomer(null)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <IndianRupee className="w-3.5 h-3.5" />
                    <span>{submitting ? "Recording..." : "Record Payment"}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Khata Statement Modal (Portalled inside KhataStatementModal) */}
      {statementCustomer && (
        <KhataStatementModal
          customer={statementCustomer}
          business={business}
          onClose={() => setStatementCustomer(null)}
        />
      )}
    </div>
  );
};
