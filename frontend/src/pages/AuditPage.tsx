import React, { useState, useEffect, useMemo, useCallback } from "react";
import { AuditLog, AuditSummary, StaffMember } from "../types";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { EmptyState } from "../components/EmptyState";
import { KannadaText } from "../components/common/KannadaText";
import {
  ShieldCheck, ShieldAlert, AlertTriangle, FileText, Search, Filter,
  Eye, RefreshCw, X, Calendar, User, Download, Check, Copy,
  ShoppingBag, Truck, Key, Settings, Ban, ArrowRight, DollarSign,
  Database, Clock, ChevronDown, ChevronRight, AlertCircle, Sparkles
} from "lucide-react";

type ActionCategory = "ALL" | "HIGH_RISK" | "INVOICE" | "PRODUCT_STOCK" | "PURCHASE" | "STAFF_SECURITY" | "BUSINESS_CONFIG";
type DatePreset = "ALL" | "TODAY" | "YESTERDAY" | "LAST_7_DAYS" | "THIS_MONTH";

export const AuditPage: React.FC = () => {
  const { t, language, tData, formatDateLocalized } = useLanguage();
  const { currentBusiness } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [categoryFilter, setCategoryFilter] = useState<ActionCategory>("ALL");
  const [datePreset, setDatePreset] = useState<DatePreset>("ALL");
  const [selectedStaffId, setSelectedStaffId] = useState<string>("ALL");
  const [searchTerm, setSearchTerm] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);

  // Modal
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [copiedJson, setCopiedJson] = useState(false);

  // Fetch Summary
  const fetchSummary = async () => {
    try {
      const data = await api.getAuditSummary();
      setSummary(data);
    } catch (_) {}
  };

  // Fetch Staff Directory for filtering
  const fetchStaff = async () => {
    try {
      const data = await api.getStaff();
      setStaffList(data);
    } catch (_) {}
  };

  // Compute date_from and date_to from preset
  const getDateRange = useCallback((): { date_from?: string; date_to?: string } => {
    const now = new Date();
    if (datePreset === "TODAY") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { date_from: start.toISOString() };
    }
    if (datePreset === "YESTERDAY") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return { date_from: start.toISOString(), date_to: end.toISOString() };
    }
    if (datePreset === "LAST_7_DAYS") {
      const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { date_from: start.toISOString() };
    }
    if (datePreset === "THIS_MONTH") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return { date_from: start.toISOString() };
    }
    return {};
  }, [datePreset]);

  // Fetch Logs
  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const { date_from, date_to } = getDateRange();
      const params: any = {
        limit: 150,
      };

      if (categoryFilter === "HIGH_RISK") {
        params.high_risk_only = true;
      }

      if (selectedStaffId !== "ALL") {
        params.user_id = Number(selectedStaffId);
      }

      if (date_from) params.date_from = date_from;
      if (date_to) params.date_to = date_to;
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const data = await api.getAuditLogs(params);
      setLogs(data);
    } catch (err: any) {
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSummary();
    fetchStaff();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [categoryFilter, datePreset, selectedStaffId]);

  // 30s Auto-refresh timer
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchLogs();
      fetchSummary();
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, categoryFilter, datePreset, selectedStaffId, searchTerm]);

  // Filter logs locally if category is specific entity
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (categoryFilter === "INVOICE") {
        return (
          log.entity_type === "invoice" ||
          log.action.includes("INVOICE") ||
          log.action.includes("CASH_SHIFT")
        );
      }
      if (categoryFilter === "PRODUCT_STOCK") {
        return (
          log.entity_type === "product" ||
          log.entity_type === "stock" ||
          log.entity_type === "reconciliation" ||
          log.action.includes("STOCK") ||
          log.action.includes("PRODUCT") ||
          log.action.includes("RECONCILIATION")
        );
      }
      if (categoryFilter === "PURCHASE") {
        return (
          log.entity_type === "purchase" ||
          log.entity_type === "supplier" ||
          log.action.includes("PURCHASE") ||
          log.action.includes("PO") ||
          log.action.includes("SUPPLIER")
        );
      }
      if (categoryFilter === "STAFF_SECURITY") {
        return (
          log.entity_type === "user" ||
          log.entity_type === "membership" ||
          log.action.includes("STAFF") ||
          log.action.includes("LOGIN") ||
          log.action.includes("PASSWORD")
        );
      }
      if (categoryFilter === "BUSINESS_CONFIG") {
        return (
          log.entity_type === "business" ||
          log.entity_type === "category" ||
          log.entity_type === "expense" ||
          log.action.includes("BUSINESS") ||
          log.action.includes("PROFILE") ||
          log.action.includes("EXPENSE")
        );
      }
      return true;
    });
  }, [logs, categoryFilter]);

  // Export CSV handler
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      await api.downloadAuditCSV({
        high_risk_only: categoryFilter === "HIGH_RISK",
      });
    } catch (err: any) {
      alert(err.message || "Failed to download audit logs CSV");
    } finally {
      setExporting(false);
    }
  };

  // Helper: Format human-friendly description for an audit log
  const formatEventNarrative = (log: AuditLog) => {
    let details: Record<string, any> = {};
    try {
      if (log.details_json) {
        details = JSON.parse(log.details_json);
      }
    } catch (_) {}

    switch (log.action) {
      case "CREATE_INVOICE": {
        const invNum = details.invoice_number || log.entity_id || "";
        const amount = details.total_amount != null ? `₹${Number(details.total_amount).toFixed(2)}` : "";
        const method = details.payment_method || "CASH";
        return {
          title: "New POS Bill Created",
          badge: "INVOICE",
          color: "emerald",
          description: `Bill #${invNum} generated for ${amount} (${method}).`,
        };
      }
      case "CANCEL_INVOICE":
      case "INVOICE_CANCEL": {
        const invNum = details.invoice_number || log.entity_id || "";
        const reason = details.reason ? `Reason: "${details.reason}"` : "Marked cancelled";
        return {
          title: "POS Bill Cancelled / Voided",
          badge: "CANCELLED",
          color: "rose",
          description: `Bill #${invNum} was cancelled. ${reason}. Stock automatically returned.`,
        };
      }
      case "STOCK_ADJUST":
      case "ADJUST_STOCK": {
        const pName = details.product_name || details.name || `Product #${log.entity_id}`;
        const qty = details.quantity_change != null ? details.quantity_change : details.difference;
        const sign = Number(qty) > 0 ? `+${qty}` : `${qty}`;
        const reason = details.reason ? ` (${details.reason})` : "";
        return {
          title: "Manual Stock Adjustment",
          badge: "STOCK ADJUST",
          color: "amber",
          description: `${pName} stock adjusted by ${sign} units${reason}.`,
        };
      }
      case "APPROVE_RECONCILIATION": {
        const code = details.session_code || `REC #${log.entity_id}`;
        const items = details.items_count != null ? ` for ${details.items_count} items` : "";
        return {
          title: "Stock Audit Approved & Written Off",
          badge: "RECONCILIATION",
          color: "purple",
          description: `Inventory count audit ${code} was finalized${items}.`,
        };
      }
      case "CREATE_PRODUCT": {
        const name = details.name || `Item #${log.entity_id}`;
        const price = details.selling_price ? ` at ₹${details.selling_price}` : "";
        return {
          title: "New Product Added to Catalogue",
          badge: "PRODUCT",
          color: "blue",
          description: `Added "${name}"${price}.`,
        };
      }
      case "UPDATE_PRODUCT": {
        const name = details.name || `Product #${log.entity_id}`;
        return {
          title: "Product Details or Price Updated",
          badge: "CATALOGUE",
          color: "blue",
          description: `Edited pricing/details for "${name}".`,
        };
      }
      case "ARCHIVE_PRODUCT": {
        return {
          title: "Product Removed / Archived",
          badge: "ARCHIVE",
          color: "rose",
          description: `Product #${log.entity_id} was archived from active billing catalogue.`,
        };
      }
      case "INVITE_STAFF": {
        const email = details.invited_email || log.entity_id;
        const role = details.role || "CASHIER";
        return {
          title: "New Employee Onboarded",
          badge: "STAFF INVITE",
          color: "indigo",
          description: `Created new ${role} login for ${email}.`,
        };
      }
      case "UPDATE_STAFF": {
        const role = details.new_role || details.role || "";
        const status = details.is_active === false ? "Suspended" : details.is_active === true ? "Activated" : "";
        return {
          title: "Staff Permissions Modified",
          badge: "PERMISSIONS",
          color: "purple",
          description: `Updated staff permissions: ${role} ${status}.`,
        };
      }
      case "RESET_STAFF_PASSWORD": {
        const target = details.target_user_email || `User #${log.entity_id}`;
        return {
          title: "Staff Password / PIN Reset",
          badge: "CREDENTIALS",
          color: "amber",
          description: `Reset counter PIN/password for ${target}.`,
        };
      }
      case "REMOVE_STAFF": {
        const name = details.removed_name || `Member #${log.entity_id}`;
        return {
          title: "Staff Member Removed",
          badge: "STAFF REMOVAL",
          color: "rose",
          description: `${name} was removed from store access.`,
        };
      }
      case "UPDATE_BUSINESS_PROFILE": {
        return {
          title: "Shop Settings / UPI Profile Updated",
          badge: "SETTINGS",
          color: "slate",
          description: "Store profile, UPI payment QR, or GST tax configuration was altered.",
        };
      }
      case "OPEN_CASH_SHIFT": {
        const float = details.opening_float != null ? ` with opening float ₹${details.opening_float}` : "";
        return {
          title: "Counter Cash Shift Opened",
          badge: "CASH SHIFT",
          color: "teal",
          description: `Cash register opened for billing${float}.`,
        };
      }
      case "CLOSE_CASH_SHIFT": {
        const counted = details.counted_cash != null ? ` (Counted: ₹${details.counted_cash})` : "";
        return {
          title: "Counter Cash Shift Closed",
          badge: "CASH SHIFT",
          color: "teal",
          description: `Daily cash drawer reconciled and closed${counted}.`,
        };
      }
      case "CREATE_PURCHASE_ORDER": {
        const po = details.po_number || `PO #${log.entity_id}`;
        return {
          title: "Purchase Order Raised",
          badge: "PO CREATED",
          color: "cyan",
          description: `Sent purchase order ${po} to wholesale distributor.`,
        };
      }
      case "RECEIVE_PURCHASE_ORDER":
      case "RECEIVE_PO": {
        const po = details.po_number || `PO #${log.entity_id}`;
        return {
          title: "Wholesale Stock Received & Batched",
          badge: "PO RECEIVED",
          color: "emerald",
          description: `Received goods for ${po}; inventory quantity updated.`,
        };
      }
      case "CREATE_EXPENSE": {
        const amount = details.amount != null ? `₹${details.amount}` : "";
        const cat = details.category || "General";
        return {
          title: "Store Operating Expense Logged",
          badge: "EXPENSE",
          color: "amber",
          description: `Recorded ${cat} expense of ${amount}.`,
        };
      }
      case "RECORD_PAYMENT": {
        const amt = details.amount != null ? `₹${details.amount}` : "";
        return {
          title: "Customer Khata Repayment Received",
          badge: "KHATA",
          color: "emerald",
          description: `Customer udhar balance reduced by ${amt}.`,
        };
      }
      case "LOGIN": {
        return {
          title: "Staff Member Logged In",
          badge: "AUTH",
          color: "slate",
          description: `Authenticated session opened at counter station.`,
        };
      }
      default: {
        return {
          title: log.action.replace(/_/g, " "),
          badge: log.entity_type?.toUpperCase() || "AUDIT",
          color: "slate",
          description: log.entity_type ? `Action on ${log.entity_type} #${log.entity_id || ""}` : "Operational event recorded.",
        };
      }
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-brand-600 dark:text-brand-400" />
            Audit Logs & Security Trail (ಲೆಕ್ಕಪರಿಶೋಧನೆ ಮತ್ತು ಭದ್ರತೆ)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Immutable, append-only security and operational audit trail for compliance, cash reconciliation, and dispute resolution.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          {/* Auto Refresh Toggle */}
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shadow-xs ${
              autoRefresh
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-50"
            }`}
            title="Auto-refresh every 30 seconds"
          >
            <Clock className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin text-emerald-600" : ""}`} />
            {autoRefresh ? "Live Stream (30s)" : "Auto-Refresh Off"}
          </button>

          {/* Manual Refresh Button */}
          <button
            onClick={() => {
              fetchLogs();
              fetchSummary();
            }}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-xs"
            title={t("refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>

          {/* Export CSV Button */}
          <button
            disabled={exporting || logs.length === 0}
            onClick={handleExportCSV}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-900 hover:bg-black dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95 disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Top Security & Risk Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Total Events */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Total Events Logged</span>
            <Database className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {summary ? summary.total_events.toLocaleString() : "..."}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            {summary ? `${summary.today_events} recorded today` : "Loading..."}
          </div>
        </div>

        {/* Cancelled Bills (Crucial Kirana theft indicator) */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Cancelled Bills</span>
            <Ban className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-rose-600 dark:text-rose-400">
            {summary ? summary.cancelled_invoices_count : "..."}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Voided transactions / Cash refunds
          </div>
        </div>

        {/* Stock Adjustments & Reconciliation */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Stock Corrections</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
            {summary ? summary.stock_adjustments_count : "..."}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Audited write-offs & discrepancies
          </div>
        </div>

        {/* Staff & Security Actions */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Staff & Security Events</span>
            <Key className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
            {summary ? summary.security_events_count : "..."}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {summary ? `${summary.unique_users_count} active employees recorded` : "Permissions & PIN changes"}
          </div>
        </div>
      </div>

      {/* Main Filter & Control Center */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-4 space-y-3">
        {/* Search & Staff Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Keyword Search */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by Bill #, product, staff name, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchLogs();
              }}
              className="w-full pl-9 pr-8 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm("");
                  setTimeout(fetchLogs, 50);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Secondary Controls: Date Preset & Staff Filter */}
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {/* Filter by Staff Member */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <User className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedStaffId}
                onChange={(e) => setSelectedStaffId(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="ALL">All Staff Members</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.user_id.toString()}>
                    {s.full_name} ({s.role})
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Preset */}
            <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={datePreset}
                onChange={(e) => setDatePreset(e.target.value as DatePreset)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value="ALL">All Time</option>
                <option value="TODAY">Today Only</option>
                <option value="YESTERDAY">Yesterday</option>
                <option value="LAST_7_DAYS">Last 7 Days</option>
                <option value="THIS_MONTH">This Month</option>
              </select>
            </div>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <span className="text-slate-400 text-xs mr-1 shrink-0">Category:</span>

          <button
            onClick={() => setCategoryFilter("ALL")}
            className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              categoryFilter === "ALL"
                ? "bg-brand-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            All Logs
          </button>

          <button
            onClick={() => setCategoryFilter("HIGH_RISK")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
              categoryFilter === "HIGH_RISK"
                ? "bg-rose-600 text-white shadow-xs"
                : "bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 hover:bg-rose-100 border border-rose-200 dark:border-rose-900"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            ⚠️ High-Risk Only
          </button>

          <button
            onClick={() => setCategoryFilter("INVOICE")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              categoryFilter === "INVOICE"
                ? "bg-emerald-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <ShoppingBag className="w-3.5 h-3.5" />
            Billing & POS
          </button>

          <button
            onClick={() => setCategoryFilter("PRODUCT_STOCK")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              categoryFilter === "PRODUCT_STOCK"
                ? "bg-blue-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Stock & Products
          </button>

          <button
            onClick={() => setCategoryFilter("PURCHASE")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              categoryFilter === "PURCHASE"
                ? "bg-cyan-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            Wholesale & POs
          </button>

          <button
            onClick={() => setCategoryFilter("STAFF_SECURITY")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              categoryFilter === "STAFF_SECURITY"
                ? "bg-purple-600 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <Key className="w-3.5 h-3.5" />
            Staff & Passwords
          </button>

          <button
            onClick={() => setCategoryFilter("BUSINESS_CONFIG")}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
              categoryFilter === "BUSINESS_CONFIG"
                ? "bg-slate-700 text-white shadow-xs"
                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            Shop Config
          </button>
        </div>
      </div>

      {/* Main Audit Trail List */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 text-center text-slate-500 dark:text-slate-400 text-sm animate-pulse flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-brand-600" />
            <span>Scanning secure audit records...</span>
          </div>
        ) : error ? (
          <div className="p-6 m-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-400 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load audit logs</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title={searchTerm || categoryFilter !== "ALL" || datePreset !== "ALL" ? "No matching audit events" : "No Audit Records Yet"}
              description={
                searchTerm || categoryFilter !== "ALL" || datePreset !== "ALL"
                  ? "Try clearing your search term, switching categories, or expanding the date range."
                  : "Every invoice creation, bill cancellation, stock adjustment, cashier login, and staff PIN reset generates a permanent tamper-proof record."
              }
              actionText={searchTerm || categoryFilter !== "ALL" || datePreset !== "ALL" ? "Clear Filters" : undefined}
              onAction={() => {
                setSearchTerm("");
                setCategoryFilter("ALL");
                setDatePreset("ALL");
                setSelectedStaffId("ALL");
              }}
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredLogs.map((log) => {
              const narrative = formatEventNarrative(log);
              const eventDate = new Date(log.created_at);
              const timeStr = eventDate.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              });
              const dateStr = eventDate.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });

              return (
                <div
                  key={log.id}
                  className={`p-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    log.is_high_risk ? "bg-rose-50/25 dark:bg-rose-950/10" : ""
                  }`}
                >
                  {/* Left: Event Icon & Details */}
                  <div className="flex items-start gap-3.5">
                    {/* Event Category Icon */}
                    <div
                      className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        log.is_high_risk
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 ring-2 ring-rose-200 dark:ring-rose-900"
                          : narrative.color === "emerald"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          : narrative.color === "blue"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300"
                          : narrative.color === "amber"
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                          : narrative.color === "purple"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300"
                          : narrative.color === "cyan"
                          ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      {log.is_high_risk ? (
                        <ShieldAlert className="w-5 h-5" />
                      ) : narrative.color === "emerald" ? (
                        <ShoppingBag className="w-5 h-5" />
                      ) : narrative.color === "blue" ? (
                        <Database className="w-5 h-5" />
                      ) : narrative.color === "amber" ? (
                        <AlertTriangle className="w-5 h-5" />
                      ) : narrative.color === "purple" ? (
                        <Key className="w-5 h-5" />
                      ) : narrative.color === "cyan" ? (
                        <Truck className="w-5 h-5" />
                      ) : (
                        <FileText className="w-5 h-5" />
                      )}
                    </div>

                    {/* Narrative & Context */}
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-slate-900 dark:text-white">
                          {narrative.title}
                        </span>

                        {log.is_high_risk && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 flex items-center gap-1 border border-rose-200">
                            ⚠️ HIGH RISK
                          </span>
                        )}

                        <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                          {narrative.badge}
                        </span>

                        {log.entity_id && (
                          <span className="text-[11px] font-mono text-slate-400">
                            #{log.entity_id}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        <KannadaText text={narrative.description} />
                      </p>

                      {/* Performer & Station Info */}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 mt-1">
                        <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
                          <User className="w-3 h-3 text-slate-400" />
                          <KannadaText text={log.user_name || (language === "kn" ? "ಸಿಸ್ಟಮ್ (System)" : "System")} />
                          {log.user_role && (
                            <span className="text-[10px] px-1 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 font-bold">
                              {tData(log.user_role)}
                            </span>
                          )}
                        </span>

                        <span>•</span>

                        <span className="font-mono text-slate-400">
                          {dateStr} at {timeStr}
                        </span>

                        {log.ip_address && (
                          <>
                            <span>•</span>
                            <span className="font-mono text-[10px] text-slate-400">
                              Terminal: {log.ip_address}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Quick View Button */}
                  <div className="flex items-center justify-end sm:self-center shrink-0">
                    <button
                      onClick={() => setSelectedLog(log)}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/50 dark:text-brand-300 rounded-lg transition-colors"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Inspect Payload
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Forensic Snapshot Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative max-h-[90vh] flex flex-col">
            <button
              onClick={() => setSelectedLog(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3 mb-4">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                  selectedLog.is_high_risk
                    ? "bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400"
                    : "bg-brand-100 text-brand-600 dark:bg-brand-950/60 dark:text-brand-400"
                }`}
              >
                {selectedLog.is_high_risk ? <ShieldAlert className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white flex items-center gap-2">
                  <span>Forensic Audit Record #{selectedLog.id}</span>
                  {selectedLog.is_high_risk && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-rose-100 text-rose-700">
                      HIGH RISK
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {selectedLog.action} • {new Date(selectedLog.created_at).toLocaleString("en-IN")}
                </p>
              </div>
            </div>

            {/* Structured Metadata Box */}
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3.5 border border-slate-200 dark:border-slate-700 text-xs space-y-2 mb-4 font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Initiator Staff:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {selectedLog.user_name || "System"} ({selectedLog.user_role || "User"})
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Target Entity:</span>
                <span className="font-bold text-brand-600 dark:text-brand-400">
                  {selectedLog.entity_type ? `${selectedLog.entity_type.toUpperCase()} #${selectedLog.entity_id || ""}` : "System Wide"}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Station / IP:</span>
                <span className="text-slate-600 dark:text-slate-300">
                  {selectedLog.ip_address || "Local Counter Terminal"}
                </span>
              </div>
            </div>

            {/* Formatted JSON Payload */}
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Detailed Event Payload (JSON):
              </span>
              <button
                onClick={() => copyToClipboard(selectedLog.details_json || "{}")}
                className="text-xs text-brand-600 hover:text-brand-700 flex items-center gap-1 font-semibold"
              >
                {copiedJson ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Copy JSON
                  </>
                )}
              </button>
            </div>

            <div className="bg-slate-950 text-emerald-400 font-mono text-xs p-4 rounded-xl overflow-auto flex-1 max-h-72 border border-slate-800">
              <pre>
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedLog.details_json || "{}"), null, 2);
                  } catch (_) {
                    return selectedLog.details_json || "No payload attributes recorded";
                  }
                })()}
              </pre>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-black dark:bg-slate-800 dark:hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-colors"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
