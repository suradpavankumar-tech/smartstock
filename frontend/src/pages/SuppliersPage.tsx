import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Supplier, PurchaseOrder } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { useAuth } from "../context/AuthContext";
import { KannadaText } from "../components/common/KannadaText";
import { buildWhatsAppUrl, openWhatsAppUrl } from "../utils/whatsapp";
import {
  Truck,
  Plus,
  Search,
  Phone,
  Mail,
  FileText,
  AlertCircle,
  RefreshCw,
  X,
  MessageCircle,
  PhoneCall,
  Edit2,
  Trash2,
  ShoppingCart,
  ShieldCheck,
  ArrowUpRight,
  MapPin,
} from "lucide-react";

interface SuppliersPageProps {
  onNavigate?: (tab: string) => void;
}

type LeadTimeTier = "ALL" | "FAST" | "STANDARD" | "LONG";

interface VendorOrderStats {
  poCount: number;
  totalSpend: number;
  openCount: number;
  completedCount: number;
}

export const SuppliersPage: React.FC<SuppliersPageProps> = ({ onNavigate }) => {
  const { t, language, formatMoney } = useLanguage();
  const isKn = language === "kn";
  const { currentBusiness } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [leadTimeFilter, setLeadTimeFilter] = useState<LeadTimeTier>("ALL");

  // Add / Edit Supplier Modal
  const [showFormModal, setShowFormModal] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Delete Confirmation Modal (replaces window.confirm / alert)
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [form, setForm] = useState({
    name: "",
    contact_person: "",
    phone: "",
    email: "",
    gstin: "",
    address: "",
    lead_time_days: 3,
    payment_terms_days: 15,
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [sups, pos] = await Promise.all([
        api.getSuppliers(),
        api.getPurchaseOrders(200).catch(() => [] as PurchaseOrder[]),
      ]);
      setSuppliers(sups);
      setPurchaseOrders(pos);
    } catch (err: any) {
      setError(err.message || "Failed to load wholesale suppliers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Aggregate real per-supplier PO metrics from real purchase orders
  const vendorStatsMap = useMemo(() => {
    const map = new Map<number, VendorOrderStats>();
    purchaseOrders.forEach((po) => {
      if (po.status === "CANCELLED") return;
      const prev = map.get(po.supplier_id) || {
        poCount: 0,
        totalSpend: 0,
        openCount: 0,
        completedCount: 0,
      };
      prev.poCount += 1;
      prev.totalSpend += po.total_amount || 0;
      if (po.status === "COMPLETED") {
        prev.completedCount += 1;
      } else {
        prev.openCount += 1;
      }
      map.set(po.supplier_id, prev);
    });
    return map;
  }, [purchaseOrders]);

  // Search-matched base before lead-time tab
  const searchMatchedSuppliers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) => {
      return (
        s.name.toLowerCase().includes(q) ||
        (s.contact_person || "").toLowerCase().includes(q) ||
        (s.phone || "").toLowerCase().includes(q) ||
        (s.email || "").toLowerCase().includes(q) ||
        (s.gstin || "").toLowerCase().includes(q) ||
        (s.address || "").toLowerCase().includes(q)
      );
    });
  }, [suppliers, searchTerm]);

  // Terminal KPI metrics (100% real data, zero synthetic percentages)
  const stats = useMemo(() => {
    const total = searchMatchedSuppliers.length;
    let fastCount = 0;
    let standardCount = 0;
    let longCount = 0;
    let gstinCount = 0;
    let whatsappReadyCount = 0;
    let leadSum = 0;
    let termsSum = 0;
    let minLeadTime = total > 0 ? Infinity : 0;
    let maxLeadTime = 0;
    let maxTerms = 0;
    let totalOrders = 0;
    let openOrders = 0;
    let completedOrders = 0;
    let totalSpend = 0;

    searchMatchedSuppliers.forEach((s) => {
      const lead = Number(s.lead_time_days) || 0;
      const terms = Number(s.payment_terms_days) || 0;

      if (lead <= 2) fastCount += 1;
      else if (lead <= 5) standardCount += 1;
      else longCount += 1;

      if (s.gstin && s.gstin.trim()) gstinCount += 1;
      if (s.phone && s.phone.trim()) whatsappReadyCount += 1;

      leadSum += lead;
      termsSum += terms;
      if (lead < minLeadTime) minLeadTime = lead;
      if (lead > maxLeadTime) maxLeadTime = lead;
      if (terms > maxTerms) maxTerms = terms;

      const vStats = vendorStatsMap.get(s.id);
      if (vStats) {
        totalOrders += vStats.poCount;
        openOrders += vStats.openCount;
        completedOrders += vStats.completedCount;
        totalSpend += vStats.totalSpend;
      } else if (s.order_count) {
        totalOrders += s.order_count;
      }
    });

    return {
      total,
      fastCount,
      standardCount,
      longCount,
      gstinCount,
      whatsappReadyCount,
      avgLeadTime: total > 0 ? Math.round((leadSum / total) * 10) / 10 : 0,
      minLeadTime: total > 0 && minLeadTime !== Infinity ? minLeadTime : 0,
      maxLeadTime,
      avgTerms: total > 0 ? Math.round(termsSum / total) : 0,
      maxTerms,
      totalOrders,
      openOrders,
      completedOrders,
      totalSpend,
    };
  }, [searchMatchedSuppliers, vendorStatsMap]);

  const filtered = useMemo(() => {
    return searchMatchedSuppliers.filter((s) => {
      const lead = Number(s.lead_time_days) || 0;
      if (leadTimeFilter === "FAST" && lead > 2) return false;
      if (leadTimeFilter === "STANDARD" && (lead < 3 || lead > 5)) return false;
      if (leadTimeFilter === "LONG" && lead <= 5) return false;
      return true;
    });
  }, [searchMatchedSuppliers, leadTimeFilter]);

  const hasActiveFilters = searchTerm.trim() !== "" || leadTimeFilter !== "ALL";

  const clearFilters = () => {
    setSearchTerm("");
    setLeadTimeFilter("ALL");
  };

  const handleOpenAddModal = () => {
    setEditingSupplier(null);
    setModalError(null);
    setForm({
      name: "",
      contact_person: "",
      phone: "",
      email: "",
      gstin: "",
      address: "",
      lead_time_days: 3,
      payment_terms_days: 15,
    });
    setShowFormModal(true);
  };

  const handleOpenEditModal = (s: Supplier) => {
    setEditingSupplier(s);
    setModalError(null);
    setForm({
      name: s.name,
      contact_person: s.contact_person || "",
      phone: s.phone || "",
      email: s.email || "",
      gstin: s.gstin || "",
      address: s.address || "",
      lead_time_days: s.lead_time_days || 3,
      payment_terms_days: s.payment_terms_days ?? 15,
    });
    setShowFormModal(true);
  };

  const handleSaveSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const cleanName = form.name.trim();
    if (cleanName.length < 2) {
      setModalError("Supplier / firm name must be at least 2 characters.");
      return;
    }
    if ((Number(form.lead_time_days) || 0) < 1) {
      setModalError("Delivery lead time must be at least 1 day.");
      return;
    }

    setSubmitting(true);
    try {
      if (editingSupplier) {
        await api.updateSupplier(editingSupplier.id, {
          name: cleanName,
          contact_person: form.contact_person.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          gstin: form.gstin.trim().toUpperCase() || null,
          address: form.address.trim() || null,
          lead_time_days: Math.max(1, Number(form.lead_time_days) || 3),
          payment_terms_days: Math.max(0, Number(form.payment_terms_days) || 0),
        });
      } else {
        await api.createSupplier({
          name: cleanName,
          contact_person: form.contact_person.trim() || undefined,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          gstin: form.gstin.trim().toUpperCase() || undefined,
          address: form.address.trim() || undefined,
          lead_time_days: Math.max(1, Number(form.lead_time_days) || 3),
          payment_terms_days: Math.max(0, Number(form.payment_terms_days) || 0),
        });
      }
      setShowFormModal(false);
      setEditingSupplier(null);
      await fetchData();
    } catch (err: any) {
      setModalError(err.message || "Failed to save supplier profile");
    } finally {
      setSubmitting(false);
    }
  };

  const openDeleteConfirm = (s: Supplier) => {
    setDeleteTarget(s);
    setDeleteError(null);
  };

  const confirmDeleteSupplier = async () => {
    if (!deleteTarget) return;
    setDeleteSubmitting(true);
    setDeleteError(null);
    try {
      await api.deleteSupplier(deleteTarget.id);
      setDeleteTarget(null);
      await fetchData();
    } catch (err: any) {
      setDeleteError(err.message || "Failed to delete supplier");
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const openWhatsApp = (phone: string, supplierName: string) => {
    const shopName = currentBusiness?.name || "SmartStock Store";
    const msg = isKn
      ? `ನಮಸ್ಕಾರ ${supplierName}, ನಾವು *${shopName}* ವತಿಯಿಂದ ದಾಸ್ತಾನು ಲಭ್ಯತೆ ಮತ್ತು ಮುಂದಿನ ಖರೀದಿ ಆದೇಶದ ಕುರಿತು ಸಂಪರ್ಕಿಸುತ್ತಿದ್ದೇವೆ.`
      : `Namaskara ${supplierName}, this is *${shopName}*. We are checking on product availability and our upcoming purchase order.`;

    const strictUrl = buildWhatsAppUrl(phone, msg);
    if (strictUrl) {
      openWhatsAppUrl(strictUrl);
    } else {
      const cleanPhone = phone.replace(/[^0-9]/g, "");
      const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
      openWhatsAppUrl(`https://wa.me/${phoneParam}?text=${encodeURIComponent(msg)}`);
    }
  };

  const handleRaisePOForSupplier = (s: Supplier) => {
    sessionStorage.setItem("smartstock_po_supplier_id", String(s.id));
    onNavigate?.("purchases");
  };

  const getLeadBadge = (days: number) => {
    if (days <= 2) {
      return {
        label: `Fast · ${days}d`,
        cls: "bg-[#6EE7B7]/12 text-[#6EE7B7] border-[#6EE7B7]/35",
        dot: "bg-[#6EE7B7]",
      };
    }
    if (days <= 5) {
      return {
        label: `Std · ${days}d`,
        cls: "bg-[#7DD3FC]/12 text-[#7DD3FC] border-[#7DD3FC]/35",
        dot: "bg-[#7DD3FC]",
      };
    }
    return {
      label: `Long · ${days}d`,
      cls: "bg-[#FBBF24]/12 text-[#FBBF24] border-[#FBBF24]/35",
      dot: "bg-[#FBBF24]",
    };
  };

  return (
    <div className="max-w-7xl mx-auto pb-2">
      {/* Unified Midnight Mist Liquid Glass Vendor Terminal */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.12)] relative overflow-hidden backdrop-blur-2xl">
        {/* Ambient diffuse glass highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-gradient-to-br from-[#5EEAD4]/14 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-24 w-72 h-72 bg-gradient-to-tl from-[#7DD3FC]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* 1. Terminal Header & Primary Toolbar */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_12px_rgba(94,234,212,0.25)] shrink-0">
              <Truck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[#6EE7B7] tracking-wider uppercase font-semibold">
                  {t("navSuppliers")}
                </span>
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[#A1AEBB] tabular-nums">
                  {filtered.length} {filtered.length === 1 ? "vendor" : "vendors"}
                </span>
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] mt-0.5">
                {isKn
                  ? "ಹೋಲ್‌ಸೇಲ್ ವಿತರಕರು, ಸರಬರಾಜು ಅವಧಿ (Lead Time), ಕ್ರೆಡಿಟ್ ನಿಯಮಗಳು ಮತ್ತು ನೇರ ಖರೀದಿ ಆದೇಶಗಳು"
                  : "Manage wholesale distributors, replenishment lead times, credit terms & direct PO dispatch"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={fetchData}
              className="liquid-btn-secondary p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] shrink-0"
              title={t("refresh")}
              aria-label={t("refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#5EEAD4]" : ""}`} />
            </button>

            <button
              type="button"
              onClick={handleOpenAddModal}
              className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{isKn ? "ಹೊಸ ಪೂರೈಕೆದಾರ" : "Add Supplier"}</span>
            </button>
          </div>
        </div>

        {/* 2. Cardless Architectural 4-Column KPI Telemetry Strip */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Col 1: Registered Vendors */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ನೋಂದಾಯಿತ ವಿತರಕರು" : "Registered Vendors"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6EE7B7] tabular-nums whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
                {stats.fastCount} fast (≤2d)
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {stats.total}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>{stats.gstinCount} GSTIN verified</span>
              <span>{stats.whatsappReadyCount} WA ready</span>
            </div>
          </div>

          {/* Col 2: Avg Delivery Lead */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಸರಾಸರಿ ವಿತರಣಾ ಅವಧಿ" : "Avg Delivery Lead"}
              </span>
              <span className="text-[11px] font-medium text-[#6EE7B7] whitespace-nowrap">
                Restock SLA
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#6EE7B7] tracking-tight tabular-nums mt-2">
              {stats.avgLeadTime}{" "}
              <span className="text-xs font-medium text-[#A1AEBB]">
                {stats.avgLeadTime === 1 ? "day" : "days"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Fastest: {stats.minLeadTime}d</span>
              <span>Max: {stats.maxLeadTime}d</span>
            </div>
          </div>

          {/* Col 3: Avg Credit Terms */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಸರಾಸರಿ ಕ್ರೆಡಿಟ್ ಅವಧಿ" : "Avg Credit Terms"}
              </span>
              <span className="text-[11px] font-medium text-[#7DD3FC] whitespace-nowrap">
                Payable Window
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#7DD3FC] tracking-tight tabular-nums mt-2">
              {stats.avgTerms}{" "}
              <span className="text-xs font-medium text-[#A1AEBB]">days</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Longest credit: Net {stats.maxTerms}d</span>
            </div>
          </div>

          {/* Col 4: Real Procurement Volume */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಖರೀದಿ ಆದೇಶಗಳ ಮೊತ್ತ" : "Procurement Volume"}
              </span>
              <span className="text-[11px] font-medium text-[#FBBF24] tabular-nums whitespace-nowrap">
                {stats.totalOrders} {stats.totalOrders === 1 ? "PO" : "POs"}
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {formatMoney(stats.totalSpend)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Open: {stats.openOrders}</span>
              <span>Completed: {stats.completedOrders}</span>
            </div>
          </div>
        </div>

        {/* 3. Interactive Lead-Time Tier SLA Mix Strip */}
        {stats.total > 0 && (
          <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] bg-[#080B10]/20">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#A1AEBB]">
                Lead-Time SLA Distribution (Click Tier to Filter)
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#A1AEBB] tabular-nums">
                {(
                  [
                    {
                      key: "FAST" as LeadTimeTier,
                      label: "Fast (≤2d)",
                      count: stats.fastCount,
                      dot: "bg-[#6EE7B7]",
                    },
                    {
                      key: "STANDARD" as LeadTimeTier,
                      label: "Standard (3–5d)",
                      count: stats.standardCount,
                      dot: "bg-[#7DD3FC]",
                    },
                    {
                      key: "LONG" as LeadTimeTier,
                      label: "Long (>5d)",
                      count: stats.longCount,
                      dot: "bg-[#FBBF24]",
                    },
                  ] as const
                )
                  .filter((seg) => seg.count > 0)
                  .map((seg) => {
                    const pct = Math.round((seg.count / stats.total) * 100);
                    return (
                      <button
                        key={seg.key}
                        type="button"
                        onClick={() =>
                          setLeadTimeFilter(leadTimeFilter === seg.key ? "ALL" : seg.key)
                        }
                        className={`inline-flex items-center gap-1.5 transition-opacity hover:opacity-100 ${
                          leadTimeFilter !== "ALL" && leadTimeFilter !== seg.key
                            ? "opacity-45"
                            : "opacity-100"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${seg.dot}`} />
                        <span className="text-[#F8FAFC]/90 font-medium">{seg.label}</span>
                        <span className="font-mono text-[#A1AEBB]">
                          {seg.count} ({pct}%)
                        </span>
                      </button>
                    );
                  })}
              </div>
            </div>

            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex gap-0.5">
              {stats.fastCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setLeadTimeFilter(leadTimeFilter === "FAST" ? "ALL" : "FAST")
                  }
                  style={{ width: `${(stats.fastCount / stats.total) * 100}%` }}
                  title={`Fast ≤2d: ${stats.fastCount} vendor(s)`}
                  className="h-full bg-[#6EE7B7] transition-all duration-500"
                />
              )}
              {stats.standardCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setLeadTimeFilter(leadTimeFilter === "STANDARD" ? "ALL" : "STANDARD")
                  }
                  style={{ width: `${(stats.standardCount / stats.total) * 100}%` }}
                  title={`Standard 3–5d: ${stats.standardCount} vendor(s)`}
                  className="h-full bg-[#7DD3FC] transition-all duration-500"
                />
              )}
              {stats.longCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setLeadTimeFilter(leadTimeFilter === "LONG" ? "ALL" : "LONG")
                  }
                  style={{ width: `${(stats.longCount / stats.total) * 100}%` }}
                  title={`Long >5d: ${stats.longCount} vendor(s)`}
                  className="h-full bg-[#FBBF24] transition-all duration-500"
                />
              )}
            </div>
          </div>
        )}

        {/* 4. Search & Underline Lead-Time Filter Tabs */}
        <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#A1AEBB]" />
            <input
              type="text"
              placeholder={
                isKn
                  ? "ಪೂರೈಕೆದಾರರ ಹೆಸರು, ಫೋನ್, GSTIN ಅಥವಾ ವಿಳಾಸ ಹುಡುಕಿ..."
                  : "Search vendor, contact person, phone, email, GSTIN or city..."
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
                aria-label="Clear supplier search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-5 text-xs font-semibold overflow-x-auto">
            {(
              [
                { key: "ALL", label: isKn ? "ಎಲ್ಲಾ" : "All", count: stats.total },
                { key: "FAST", label: isKn ? "ವೇಗ (≤2d)" : "Fast (≤2d)", count: stats.fastCount },
                {
                  key: "STANDARD",
                  label: isKn ? "ಸಾಮಾನ್ಯ (3-5d)" : "Standard (3-5d)",
                  count: stats.standardCount,
                },
                { key: "LONG", label: isKn ? "ದೀರ್ಘ (>5d)" : "Long (>5d)", count: stats.longCount },
              ] as const
            ).map((tab) => {
              const isActive = leadTimeFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setLeadTimeFilter(tab.key)}
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
                        tab.key === "LONG"
                          ? "bg-[#FBBF24] shadow-[0_0_8px_#FBBF24]"
                          : tab.key === "STANDARD"
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

        {/* Inline Error Banner */}
        {error && (
          <div className="relative z-10 px-5 sm:px-7 py-2.5 bg-[#FB7185]/12 border-b border-[#FB7185]/30 text-[#FB7185] text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
            <button
              type="button"
              onClick={fetchData}
              className="underline font-semibold hover:text-[#F8FAFC]"
            >
              Retry
            </button>
          </div>
        )}

        {/* 5. Vendor Directory Ledger Table / Cardless Empty State */}
        <div className="relative z-10">
          {loading ? (
            <div className="py-16 text-center text-[#A1AEBB] text-xs space-y-2.5">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#5EEAD4]" />
              <div>{t("loading")}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-[#5EEAD4]/35 flex items-center justify-center text-[#6EE7B7] shadow-[0_0_20px_rgba(94,234,212,0.12)] mb-3">
                <Truck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight">
                {hasActiveFilters ? "No Matching Suppliers Found" : "No Wholesale Suppliers Registered"}
              </h3>
              <p className="text-xs text-[#A1AEBB] max-w-md mt-1.5 leading-relaxed">
                {hasActiveFilters
                  ? "Adjust the search query or lead-time SLA filter to view other registered vendors."
                  : "Register wholesale distributors and manufacturers to configure delivery SLAs, GSTIN profiles, and one-click Purchase Orders."}
              </p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-[#A1AEBB] mt-3.5 mb-4">
                <ShieldCheck className="w-3.5 h-3.5 text-[#6EE7B7]" />
                <span>Verified Distributor Directory • Linked to Inventory Replenishment</span>
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
                  onClick={handleOpenAddModal}
                  className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Supplier</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#080B10]/35 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.1em]">
                  <tr>
                    <th className="px-4 sm:px-6 py-3">Supplier / Firm</th>
                    <th className="px-2.5 py-3">Contact &amp; GSTIN</th>
                    <th className="px-2.5 py-3 whitespace-nowrap">Lead &amp; Terms</th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap">PO History</th>
                    <th className="px-4 sm:px-6 py-3 text-right whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filtered.map((s) => {
                    const vStats = vendorStatsMap.get(s.id);
                    const poCount = vStats ? vStats.poCount : s.order_count || 0;
                    const totalVendorSpend = vStats ? vStats.totalSpend : 0;
                    const openVendorPOs = vStats ? vStats.openCount : 0;
                    const leadCfg = getLeadBadge(Number(s.lead_time_days) || 3);
                    const initial = (s.name || "S").trim().charAt(0).toUpperCase();

                    return (
                      <tr
                        key={s.id}
                        className="border-l-2 border-l-transparent hover:border-l-[#5EEAD4]/75 hover:bg-white/[0.025] transition-all"
                      >
                        {/* Col 1: Supplier / Firm */}
                        <td className="px-4 sm:px-6 py-3.5 max-w-[260px]">
                          <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-full bg-[#080B10] border border-[#5EEAD4]/35 text-[#6EE7B7] font-mono font-bold text-[11px] flex items-center justify-center shrink-0 mt-0.5">
                              {initial}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-semibold text-[#F8FAFC] text-[13px] truncate">
                                  <KannadaText text={s.name} />
                                </span>
                                {openVendorPOs > 0 && (
                                  <span className="px-1.5 py-0.5 rounded bg-[#FBBF24]/15 text-[#FBBF24] border border-[#FBBF24]/30 text-[9.5px] font-bold tabular-nums">
                                    {openVendorPOs} open
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] text-[#A1AEBB] truncate mt-0.5">
                                {s.contact_person ? (
                                  <span>
                                    Attn: <KannadaText text={s.contact_person} />
                                  </span>
                                ) : (
                                  <span>Wholesale Distributor</span>
                                )}
                                {s.address && (
                                  <span className="text-[#A1AEBB]/75">
                                    {" "}
                                    • <MapPin className="w-2.5 h-2.5 inline -mt-0.5" /> {s.address}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Col 2: Contact & GSTIN */}
                        <td className="px-2.5 py-3.5 max-w-[210px]">
                          <div className="space-y-0.5">
                            {s.phone ? (
                              <div className="flex items-center gap-1.5 font-mono text-[#F8FAFC]/90 text-[11.5px] tabular-nums">
                                <Phone className="w-3 h-3 text-[#6EE7B7] shrink-0" />
                                <span>{s.phone}</span>
                              </div>
                            ) : (
                              <div className="text-[11px] text-[#A1AEBB]/60 italic">No phone on file</div>
                            )}

                            {s.gstin && (
                              <div className="flex items-center gap-1.5 font-mono text-[10.5px] text-[#7DD3FC]">
                                <FileText className="w-3 h-3 shrink-0 opacity-80" />
                                <span>{s.gstin}</span>
                              </div>
                            )}

                            {s.email && (
                              <div className="flex items-center gap-1.5 text-[10.5px] text-[#A1AEBB] truncate">
                                <Mail className="w-3 h-3 shrink-0 opacity-75" />
                                <span className="truncate">{s.email}</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Col 3: Lead Time & Credit Terms */}
                        <td className="px-2.5 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold border tabular-nums ${leadCfg.cls}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${leadCfg.dot}`} />
                            {leadCfg.label}
                          </span>
                          <div className="text-[10.5px] font-mono text-[#A1AEBB] mt-1 tabular-nums">
                            Credit: Net {s.payment_terms_days ?? 0}d
                          </div>
                        </td>

                        {/* Col 4: Real PO History */}
                        <td className="px-2.5 py-3.5 text-right whitespace-nowrap tabular-nums">
                          <div className="font-mono font-bold text-[13px] text-[#F8FAFC]">
                            {poCount > 0 ? formatMoney(totalVendorSpend) : "—"}
                          </div>
                          <div className="text-[10.5px] text-[#A1AEBB] mt-0.5">
                            {poCount} {poCount === 1 ? "PO" : "POs"} placed
                          </div>
                        </td>

                        {/* Col 5: Actions */}
                        <td className="px-4 sm:px-6 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1">
                            {s.phone && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openWhatsApp(s.phone!, s.name)}
                                  title="Chat on WhatsApp"
                                  aria-label={`WhatsApp ${s.name}`}
                                  className="p-1.5 rounded-lg text-[#6EE7B7] hover:bg-[#6EE7B7]/12 transition-colors"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </button>
                                <a
                                  href={`tel:${s.phone}`}
                                  title={`Call ${s.phone}`}
                                  aria-label={`Call ${s.name}`}
                                  className="p-1.5 rounded-lg text-[#7DD3FC] hover:bg-[#7DD3FC]/12 transition-colors"
                                >
                                  <PhoneCall className="w-3.5 h-3.5" />
                                </a>
                              </>
                            )}

                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(s)}
                              title="Edit Supplier Profile"
                              aria-label={`Edit ${s.name}`}
                              className="p-1.5 rounded-lg text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.08] transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => openDeleteConfirm(s)}
                              title="Remove Supplier"
                              aria-label={`Delete ${s.name}`}
                              className="p-1.5 rounded-lg text-[#A1AEBB] hover:text-[#FB7185] hover:bg-[#FB7185]/12 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>

                            {onNavigate && (
                              <button
                                type="button"
                                onClick={() => handleRaisePOForSupplier(s)}
                                className="ml-1 liquid-btn-secondary inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold text-[#6EE7B7]"
                              >
                                <ShoppingCart className="w-3 h-3" />
                                <span>Raise PO</span>
                                <ArrowUpRight className="w-3 h-3" />
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

      {/* Add / Edit Supplier Modal (Portalled) */}
      {showFormModal &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="liquid-modal max-w-lg w-full p-6 text-[#F8FAFC] space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-[#F8FAFC]">
                      {editingSupplier ? "Edit Distributor Profile" : "Register Wholesale Supplier"}
                    </h2>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Lead time and credit terms feed into smart stock reorder forecasts.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowFormModal(false)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close supplier modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/15 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleSaveSupplier} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                    Supplier / Company Name *
                  </label>
                  <input
                    type="text"
                    required
                    minLength={2}
                    placeholder="e.g., Haveri Agro & FMCG Wholesale"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      Contact Person
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Suresh Patil"
                      value={form.contact_person}
                      onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      Phone Number (WhatsApp)
                    </label>
                    <input
                      type="tel"
                      placeholder="9845012345"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 font-mono focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      Email Address
                    </label>
                    <input
                      type="email"
                      placeholder="orders@supplier.com"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      GSTIN (Tax ID)
                    </label>
                    <input
                      type="text"
                      placeholder="29AAAAA0000A1Z5"
                      value={form.gstin}
                      onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 font-mono uppercase focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                    Business Address / City
                  </label>
                  <textarea
                    rows={2}
                    placeholder="APMC Yard, Haveri, Karnataka - 581110"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      Lead Time (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="90"
                      value={form.lead_time_days}
                      onChange={(e) =>
                        setForm({ ...form, lead_time_days: parseInt(e.target.value, 10) || 1 })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      Payment Credit (Days)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="180"
                      value={form.payment_terms_days}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          payment_terms_days: Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2.5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setShowFormModal(false)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    {t("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {submitting ? "Saving..." : editingSupplier ? "Update Supplier" : "Save Supplier"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Delete Supplier Confirmation Modal (Portalled) */}
      {deleteTarget &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4">
            <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FB7185]/15 border border-[#FB7185]/40 text-[#FB7185] flex items-center justify-center shrink-0">
                    <Trash2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">Remove Wholesale Supplier</h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Verify whether audit history links to this vendor.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close delete confirmation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#A1AEBB] leading-relaxed">
                Are you sure you want to permanently remove{" "}
                <strong className="text-[#F8FAFC]">{deleteTarget.name}</strong> from your
                distributor directory?
              </p>

              {(vendorStatsMap.get(deleteTarget.id)?.poCount || deleteTarget.order_count || 0) >
                0 && (
                <div className="p-3 rounded-xl bg-[#FBBF24]/12 border border-[#FBBF24]/30 text-[#FBBF24] text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    This supplier has{" "}
                    <strong>
                      {vendorStatsMap.get(deleteTarget.id)?.poCount || deleteTarget.order_count}
                    </strong>{" "}
                    recorded purchase order(s). To protect procurement audit trails, the backend
                    will reject deletion if linked POs exist.
                  </span>
                </div>
              )}

              {deleteError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/15 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{deleteError}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2.5 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={deleteSubmitting}
                  onClick={confirmDeleteSupplier}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#FB7185] hover:bg-[#F43F5E] text-[#080B10] disabled:opacity-50 transition-colors"
                >
                  {deleteSubmitting ? "Removing..." : "Remove Supplier"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
