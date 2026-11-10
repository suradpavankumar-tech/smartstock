import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { Business, ReorderRecommendation, Supplier } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { KannadaText } from "../components/common/KannadaText";
import { NavItemKey } from "../components/Sidebar";
import { buildWhatsAppUrl, openWhatsAppUrl } from "../utils/whatsapp";
import {
  ShoppingCart,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Filter,
  FilePlus,
  X,
  Plus,
  Minus,
  MessageCircle,
  ExternalLink,
  Search,
  ShieldCheck,
} from "lucide-react";

interface ReorderPageProps {
  onNavigateTab?: (tab: NavItemKey) => void;
}

type UrgencyTier = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "HEALTHY";

const URGENCY_CONFIG: Record<UrgencyTier, { badge: string; dot: string; label: string }> = {
  CRITICAL: {
    badge: "bg-[#FB7185]/14 text-[#FB7185] border-[#FB7185]/35",
    dot: "bg-[#FB7185]",
    label: "Critical",
  },
  HIGH: {
    badge: "bg-[#FBBF24]/14 text-[#FBBF24] border-[#FBBF24]/35",
    dot: "bg-[#FBBF24]",
    label: "High Risk",
  },
  MEDIUM: {
    badge: "bg-[#7DD3FC]/14 text-[#7DD3FC] border-[#7DD3FC]/35",
    dot: "bg-[#7DD3FC]",
    label: "Medium",
  },
  LOW: {
    badge: "bg-[#A78BFA]/14 text-[#A78BFA] border-[#A78BFA]/35",
    dot: "bg-[#A78BFA]",
    label: "Low",
  },
  HEALTHY: {
    badge: "bg-[#6EE7B7]/14 text-[#6EE7B7] border-[#6EE7B7]/35",
    dot: "bg-[#6EE7B7]",
    label: "Healthy",
  },
};

const toLocalISODate = (dateObj: Date): string => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const addDaysLocalISO = (baseIso: string, days: number): string => {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setDate(dt.getDate() + Math.max(0, days));
  return toLocalISODate(dt);
};

export const ReorderPage: React.FC<ReorderPageProps> = ({ onNavigateTab }) => {
  const { t, language, formatMoney } = useLanguage();
  const isKn = language === "kn";

  const [recommendations, setRecommendations] = useState<ReorderRecommendation[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState<"NEEDS_REORDER" | "ALL_INVENTORY">("NEEDS_REORDER");
  const [urgencyFilter, setUrgencyFilter] = useState<"ALL" | UrgencyTier>("ALL");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [customQuantities, setCustomQuantities] = useState<Record<number, number>>({});

  // Portalled PO Creation Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | null>(null);
  const [poNotes, setPoNotes] = useState("");
  const [converting, setConverting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [conversionSuccess, setConversionSuccess] = useState<{
    poNumber: string;
    itemCount: number;
    totalAmount: number;
    whatsappUrl: string | null;
  } | null>(null);

  const fetchRecommendationsAndSuppliers = async () => {
    setLoading(true);
    setError(null);
    try {
      const [recs, supps, profile] = await Promise.all([
        api.getRecommendations(true),
        api.getSuppliers(),
        api.getBusinessProfile().catch(() => null),
      ]);
      setRecommendations(recs);
      setSuppliers(supps);
      if (profile) setBusiness(profile);

      const initialQtys: Record<number, number> = {};
      recs.forEach((r) => {
        initialQtys[r.product_id] = r.recommended_order_qty;
      });
      setCustomQuantities(initialQtys);

      const needsReorderIds = recs.filter((d) => d.needs_reorder).map((d) => d.product_id);
      setSelectedIds(needsReorderIds);

      if (supps.length > 0 && !selectedSupplierId) {
        setSelectedSupplierId(supps[0].id);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load replenishment recommendations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecommendationsAndSuppliers();
  }, []);

  // Telemetry stats across full catalog
  const stats = useMemo(() => {
    let needsReorderCount = 0;
    let criticalCount = 0;
    let highCount = 0;
    let mediumCount = 0;
    let lowCount = 0;
    let healthyCount = 0;
    let totalReplenishCost = 0;
    let totalInboundStock = 0;
    let inboundSkuCount = 0;

    recommendations.forEach((r) => {
      if (r.needs_reorder) {
        needsReorderCount += 1;
        totalReplenishCost += r.estimated_cost || 0;
      }
      if (r.incoming_po_stock > 0) {
        totalInboundStock += r.incoming_po_stock;
        inboundSkuCount += 1;
      }
      if (r.urgency_level === "CRITICAL") criticalCount += 1;
      else if (r.urgency_level === "HIGH") highCount += 1;
      else if (r.urgency_level === "MEDIUM") mediumCount += 1;
      else if (r.urgency_level === "LOW") lowCount += 1;
      else healthyCount += 1;
    });

    return {
      totalSkus: recommendations.length,
      needsReorderCount,
      criticalCount,
      highCount,
      urgentCount: criticalCount + highCount,
      mediumCount,
      lowCount,
      healthyCount,
      totalReplenishCost,
      totalInboundStock,
      inboundSkuCount,
    };
  }, [recommendations]);

  const tabItems = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return recommendations.filter((r) => {
      if (activeTab === "NEEDS_REORDER" && !r.needs_reorder) return false;
      if (q) {
        const matchName = r.product_name.toLowerCase().includes(q);
        const matchSku = (r.sku || "").toLowerCase().includes(q);
        const matchSup = (r.supplier_name || "").toLowerCase().includes(q);
        const matchReason = (r.reason || "").toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchSup && !matchReason) return false;
      }
      return true;
    });
  }, [recommendations, activeTab, searchTerm]);

  const filtered = useMemo(() => {
    if (urgencyFilter === "ALL") return tabItems;
    return tabItems.filter((r) => r.urgency_level === urgencyFilter);
  }, [tabItems, urgencyFilter]);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((r) => selectedIds.includes(r.product_id));

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAllVisible = () => {
    const visibleIds = filtered.map((r) => r.product_id);
    if (allFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !visibleIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...visibleIds])));
    }
  };

  const handleQuantityChange = (productId: number, qty: number) => {
    setCustomQuantities((prev) => ({
      ...prev,
      [productId]: Math.max(1, qty),
    }));
  };

  const handleOpenPOModal = (singleProductId?: number) => {
    setModalError(null);
    if (singleProductId) {
      setSelectedIds([singleProductId]);
    }
    const targetItems = recommendations.filter((r) =>
      singleProductId ? r.product_id === singleProductId : selectedIds.includes(r.product_id)
    );

    const firstItemSupplier = targetItems[0]?.supplier_id;
    if (firstItemSupplier && suppliers.some((s) => s.id === firstItemSupplier)) {
      setSelectedSupplierId(firstItemSupplier);
    } else if (suppliers.length > 0 && !selectedSupplierId) {
      setSelectedSupplierId(suppliers[0].id);
    }

    setConversionSuccess(null);
    setIsModalOpen(true);
  };

  const handleConfirmCreatePO = async () => {
    if (selectedIds.length === 0 || !selectedSupplierId) {
      setModalError("Select a supplier and at least one product to raise a Purchase Order.");
      return;
    }

    setConverting(true);
    setModalError(null);
    try {
      const orderItems = selectedIds.map((pid) => ({
        product_id: pid,
        quantity: customQuantities[pid] || 1,
      }));

      const po = await api.convertRecommendationsToPO(
        selectedSupplierId,
        undefined,
        orderItems,
        poNotes.trim() || "Generated via SmartStock Replenishment Intelligence"
      );

      const supplier = suppliers.find((item) => item.id === selectedSupplierId);
      const orderedLines = orderItems.map((item, index) => {
        const product = recommendations.find((rec) => rec.product_id === item.product_id);
        return `${index + 1}. ${product?.product_name || `Product ${item.product_id}`} - ${item.quantity} ${
          product?.unit || "units"
        }`;
      });
      const address = [
        business?.address_line,
        business?.city,
        business?.district,
        business?.state,
        business?.pincode,
      ]
        .filter(Boolean)
        .join(", ");
      const whatsappMessage = [
        `*ಹೊಸ ಖರೀದಿ ಆರ್ಡರ್ / Purchase Order #${po.po_number}*`,
        `To: ${supplier?.name || "Wholesale Distributor"}`,
        `From: ${business?.name || "Store"}${address ? `, ${address}` : ""}`,
        "--------------------------------",
        ...orderedLines,
        "--------------------------------",
        `ಒಟ್ಟು ಅಂದಾಜು ಮೊತ್ತ: ₹${po.total_amount.toFixed(2)}`,
        "ದಯವಿಟ್ಟು ಅನುಕೂಲವಾದಾಗ ಕಳುಹಿಸಿಕೊಡಿ.",
      ].join("\n");

      setConversionSuccess({
        poNumber: po.po_number,
        itemCount: po.items?.length || orderItems.length,
        totalAmount: po.total_amount || 0,
        whatsappUrl: buildWhatsAppUrl(supplier?.phone, whatsappMessage),
      });

      setIsModalOpen(false);
      await fetchRecommendationsAndSuppliers();
    } catch (err: any) {
      setModalError(err.message || "Failed to create Purchase Order");
    } finally {
      setConverting(false);
    }
  };

  const selectedItems = recommendations.filter((r) => selectedIds.includes(r.product_id));
  const totalSelectedCost = selectedItems.reduce((sum, r) => {
    const qty =
      customQuantities[r.product_id] !== undefined
        ? customQuantities[r.product_id]
        : r.recommended_order_qty;
    return sum + qty * r.unit_cost;
  }, 0);

  const chosenSupplier = suppliers.find((s) => s.id === selectedSupplierId);
  const estimatedEta = chosenSupplier
    ? addDaysLocalISO(toLocalISODate(new Date()), chosenSupplier.lead_time_days || 3)
    : addDaysLocalISO(toLocalISODate(new Date()), 3);

  const hasActiveFilters =
    searchTerm.trim() !== "" || urgencyFilter !== "ALL" || activeTab !== "NEEDS_REORDER";

  const clearFilters = () => {
    setSearchTerm("");
    setUrgencyFilter("ALL");
    setActiveTab("NEEDS_REORDER");
  };

  return (
    <div className="max-w-7xl mx-auto pb-2">
      {/* Unified Midnight Mist Liquid Glass Replenishment Terminal */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.12)] relative overflow-hidden backdrop-blur-2xl">
        {/* Ambient diffuse highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-gradient-to-br from-[#FBBF24]/14 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-24 w-72 h-72 bg-gradient-to-tl from-[#5EEAD4]/12 to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* 1. Terminal Header & Primary Toolbar */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#FBBF24]/45 text-[#FBBF24] flex items-center justify-center shadow-[0_0_12px_rgba(251,191,36,0.25)] shrink-0">
              <ShoppingCart className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[#6EE7B7] tracking-wider uppercase font-semibold">
                  {t("navReorder")}
                </span>
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[#A1AEBB] tabular-nums">
                  {filtered.length} {filtered.length === 1 ? "SKU" : "SKUs"}
                </span>
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] mt-0.5">
                {isKn
                  ? "ಸರಬರಾಜು ಅವಧಿ (Lead Time), ದೈನಂದಿನ ಮಾರಾಟ ವೇಗ ಮತ್ತು ಸೇಫ್ಟಿ ಸ್ಟಾಕ್ ಆಧಾರಿತ ಮರು-ಆರ್ಡರ್ ಶಿಫಾರಸುಗಳು"
                  : "Dynamic reorder points from supplier lead times, sales velocity, incoming POs & safety buffers"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={fetchRecommendationsAndSuppliers}
              className="liquid-btn-secondary p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] shrink-0"
              title={t("refresh")}
              aria-label={t("refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#5EEAD4]" : ""}`} />
            </button>

            <button
              type="button"
              onClick={() => handleOpenPOModal()}
              disabled={selectedIds.length === 0}
              className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-45"
            >
              <FilePlus className="w-4 h-4" />
              <span>Review &amp; Create PO ({selectedIds.length})</span>
            </button>
          </div>
        </div>

        {/* Inline Success Notification Banner */}
        {conversionSuccess && (
          <div className="relative z-10 px-5 sm:px-7 py-3 bg-[#6EE7B7]/12 border-b border-[#6EE7B7]/30 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-[#6EE7B7]">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>
                Purchase Order <strong className="font-mono">{conversionSuccess.poNumber}</strong>{" "}
                issued for <strong>{conversionSuccess.itemCount}</strong> line(s) (Est.{" "}
                <strong className="font-mono">{formatMoney(conversionSuccess.totalAmount)}</strong>).
              </span>
            </div>
            <div className="flex items-center gap-2">
              {conversionSuccess.whatsappUrl && (
                <button
                  type="button"
                  onClick={() => openWhatsAppUrl(conversionSuccess.whatsappUrl)}
                  className="liquid-btn-secondary px-3 py-1 rounded-lg text-[11px] font-bold text-[#6EE7B7] inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{t("sendPurchaseOrder")}</span>
                </button>
              )}
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab("purchases")}
                  className="liquid-btn-primary px-3 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5"
                >
                  <span>View in Purchases</span>
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setConversionSuccess(null)}
                className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC]"
                aria-label="Dismiss PO confirmation"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* 2. Cardless Architectural 4-Column KPI Telemetry Strip */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Col 1: Items Needing Reorder */}
          <div className="px-4 sm:px-5 py-4 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A1AEBB] truncate min-w-0">
                {isKn ? "ಮರು-ಆರ್ಡರ್ ಬೇಕಾದ ವಸ್ತುಗಳು" : "Items Needing Reorder"}
              </span>
              {stats.urgentCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("NEEDS_REORDER");
                    setUrgencyFilter(stats.criticalCount > 0 ? "CRITICAL" : "HIGH");
                  }}
                  className="text-[11px] font-semibold text-[#FB7185] hover:underline whitespace-nowrap shrink-0"
                >
                  {stats.urgentCount} urgent →
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-[#6EE7B7] whitespace-nowrap shrink-0">
                  All Buffered
                </span>
              )}
            </div>
            <div
              className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums mt-2 ${
                stats.needsReorderCount > 0 ? "text-[#FBBF24]" : "text-[#6EE7B7]"
              }`}
            >
              {stats.needsReorderCount}{" "}
              <span className="text-xs font-medium text-[#A1AEBB]">
                {stats.needsReorderCount === 1 ? "SKU" : "SKUs"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Critical: {stats.criticalCount}</span>
              <span>High Risk: {stats.highCount}</span>
            </div>
          </div>

          {/* Col 2: Replenishment Capital */}
          <div className="px-4 sm:px-5 py-4 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A1AEBB] truncate min-w-0">
                {isKn ? "ಮರುಪೂರಣ ಬಂಡವಾಳ" : "Replenishment Capital"}
              </span>
              <span className="text-[11px] font-medium text-[#6EE7B7] whitespace-nowrap shrink-0 tabular-nums">
                {selectedIds.length} queued
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {formatMoney(stats.totalReplenishCost)}
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[#A1AEBB] tabular-nums">
              <span className="truncate">Selected: {formatMoney(totalSelectedCost)}</span>
              <span className="whitespace-nowrap">Est. PO Value</span>
            </div>
          </div>

          {/* Col 3: Inbound PO Stock */}
          <div className="px-4 sm:px-5 py-4 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A1AEBB] truncate min-w-0">
                {isKn ? "ಬರುತ್ತಿರುವ PO ದಾಸ್ತಾನು" : "Inbound PO Stock"}
              </span>
              <span className="text-[11px] font-medium text-[#7DD3FC] whitespace-nowrap shrink-0">
                In Transit
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#7DD3FC] tracking-tight tabular-nums mt-2">
              {Number(stats.totalInboundStock.toFixed(1))}{" "}
              <span className="text-xs font-medium text-[#A1AEBB]">units</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[#A1AEBB] tabular-nums">
              <span>{stats.inboundSkuCount} active SKUs ordered</span>
            </div>
          </div>

          {/* Col 4: Catalogue Coverage */}
          <div className="px-4 sm:px-5 py-4 flex flex-col justify-between min-w-0">
            <div className="flex items-center justify-between gap-2 min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A1AEBB] truncate min-w-0">
                {isKn ? "ಕ್ಯಾಟಲಾಗ್ ವ್ಯಾಪ್ತಿ" : "Catalogue Coverage"}
              </span>
              <span className="text-[11px] font-medium text-[#6EE7B7] tabular-nums whitespace-nowrap shrink-0">
                {stats.healthyCount} healthy
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {stats.totalSkus}{" "}
              <span className="text-xs font-medium text-[#A1AEBB]">SKUs</span>
            </div>
            <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Watch buffer: {stats.mediumCount + stats.lowCount}</span>
              <span>100% monitored</span>
            </div>
          </div>
        </div>

        {/* 3. Interactive Buffer Urgency Spectrum Bar */}
        {stats.totalSkus > 0 && (
          <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] bg-[#080B10]/20">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#A1AEBB]">
                Buffer Risk Spectrum (Click Tier to Filter)
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#A1AEBB] tabular-nums">
                {(
                  [
                    {
                      key: "CRITICAL" as UrgencyTier,
                      label: "Critical",
                      count: stats.criticalCount,
                      dot: "bg-[#FB7185]",
                    },
                    {
                      key: "HIGH" as UrgencyTier,
                      label: "High",
                      count: stats.highCount,
                      dot: "bg-[#FBBF24]",
                    },
                    {
                      key: "MEDIUM" as UrgencyTier,
                      label: "Medium",
                      count: stats.mediumCount,
                      dot: "bg-[#7DD3FC]",
                    },
                    {
                      key: "LOW" as UrgencyTier,
                      label: "Low",
                      count: stats.lowCount,
                      dot: "bg-[#A78BFA]",
                    },
                    {
                      key: "HEALTHY" as UrgencyTier,
                      label: "Healthy",
                      count: stats.healthyCount,
                      dot: "bg-[#6EE7B7]",
                    },
                  ] as const
                )
                  .filter((seg) => seg.count > 0)
                  .map((seg) => {
                    const pct = Math.round((seg.count / stats.totalSkus) * 100);
                    return (
                      <button
                        key={seg.key}
                        type="button"
                        onClick={() => {
                          if (seg.key === "HEALTHY" || seg.key === "LOW") {
                            setActiveTab("ALL_INVENTORY");
                          }
                          setUrgencyFilter(urgencyFilter === seg.key ? "ALL" : seg.key);
                        }}
                        className={`inline-flex items-center gap-1.5 transition-opacity hover:opacity-100 ${
                          urgencyFilter !== "ALL" && urgencyFilter !== seg.key
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
              {stats.criticalCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("NEEDS_REORDER");
                    setUrgencyFilter(urgencyFilter === "CRITICAL" ? "ALL" : "CRITICAL");
                  }}
                  style={{ width: `${(stats.criticalCount / stats.totalSkus) * 100}%` }}
                  title={`Critical: ${stats.criticalCount} SKU(s)`}
                  className="h-full bg-[#FB7185] transition-all duration-500"
                />
              )}
              {stats.highCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("NEEDS_REORDER");
                    setUrgencyFilter(urgencyFilter === "HIGH" ? "ALL" : "HIGH");
                  }}
                  style={{ width: `${(stats.highCount / stats.totalSkus) * 100}%` }}
                  title={`High Risk: ${stats.highCount} SKU(s)`}
                  className="h-full bg-[#FBBF24] transition-all duration-500"
                />
              )}
              {stats.mediumCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setUrgencyFilter(urgencyFilter === "MEDIUM" ? "ALL" : "MEDIUM")
                  }
                  style={{ width: `${(stats.mediumCount / stats.totalSkus) * 100}%` }}
                  title={`Medium: ${stats.mediumCount} SKU(s)`}
                  className="h-full bg-[#7DD3FC] transition-all duration-500"
                />
              )}
              {stats.lowCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("ALL_INVENTORY");
                    setUrgencyFilter(urgencyFilter === "LOW" ? "ALL" : "LOW");
                  }}
                  style={{ width: `${(stats.lowCount / stats.totalSkus) * 100}%` }}
                  title={`Low Risk: ${stats.lowCount} SKU(s)`}
                  className="h-full bg-[#A78BFA] transition-all duration-500"
                />
              )}
              {stats.healthyCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("ALL_INVENTORY");
                    setUrgencyFilter(urgencyFilter === "HEALTHY" ? "ALL" : "HEALTHY");
                  }}
                  style={{ width: `${(stats.healthyCount / stats.totalSkus) * 100}%` }}
                  title={`Healthy: ${stats.healthyCount} SKU(s)`}
                  className="h-full bg-[#6EE7B7] transition-all duration-500"
                />
              )}
            </div>
          </div>
        )}

        {/* 4. Integrated Search, Underline View Tabs & Urgency Dropdown */}
        <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#A1AEBB]" />
            <input
              type="text"
              placeholder={
                isKn
                  ? "ವಸ್ತು, SKU ಅಥವಾ ವಿತರಕರ ಹೆಸರು ಹುಡುಕಿ..."
                  : "Search SKU, product name, supplier or reorder reason..."
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
                aria-label="Clear reorder search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between lg:justify-end gap-5">
            {/* Underline Tabs */}
            <div className="flex items-center gap-5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setActiveTab("NEEDS_REORDER")}
                className={`pb-1.5 relative transition-all whitespace-nowrap ${
                  activeTab === "NEEDS_REORDER"
                    ? "text-[#F8FAFC] font-bold"
                    : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                }`}
              >
                Action Required
                <span className="ml-1 text-[10.5px] font-mono text-[#A1AEBB] tabular-nums">
                  ({stats.needsReorderCount})
                </span>
                {activeTab === "NEEDS_REORDER" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#FBBF24] shadow-[0_0_8px_#FBBF24]" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab("ALL_INVENTORY")}
                className={`pb-1.5 relative transition-all whitespace-nowrap ${
                  activeTab === "ALL_INVENTORY"
                    ? "text-[#F8FAFC] font-bold"
                    : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                }`}
              >
                All Buffer Monitor
                <span className="ml-1 text-[10.5px] font-mono text-[#A1AEBB] tabular-nums">
                  ({stats.totalSkus})
                </span>
                {activeTab === "ALL_INVENTORY" && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[#6EE7B7] shadow-[0_0_8px_#5EEAD4]" />
                )}
              </button>
            </div>

            {/* Dark Urgency Dropdown */}
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-3.5 h-3.5 text-[#A1AEBB]" />
              <select
                value={urgencyFilter}
                onChange={(e) => setUrgencyFilter(e.target.value as "ALL" | UrgencyTier)}
                aria-label="Filter by urgency"
                className="px-3 py-1.5 bg-[#080B10]/80 border border-white/[0.12] rounded-xl text-xs font-medium text-[#F8FAFC] focus:border-[#5EEAD4] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
              >
                <option value="ALL" className="bg-[#111722] text-[#F8FAFC]">
                  All Urgencies ({tabItems.length})
                </option>
                <option value="CRITICAL" className="bg-[#111722] text-[#F8FAFC]">
                  Critical Immediate
                </option>
                <option value="HIGH" className="bg-[#111722] text-[#F8FAFC]">
                  High Risk
                </option>
                <option value="MEDIUM" className="bg-[#111722] text-[#F8FAFC]">
                  Medium Buffer
                </option>
                <option value="LOW" className="bg-[#111722] text-[#F8FAFC]">
                  Low Priority
                </option>
                <option value="HEALTHY" className="bg-[#111722] text-[#F8FAFC]">
                  Healthy Stock
                </option>
              </select>
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
              onClick={fetchRecommendationsAndSuppliers}
              className="underline font-semibold hover:text-[#F8FAFC]"
            >
              Retry
            </button>
          </div>
        )}

        {/* 5. Replenishment Ledger Table / Cardless Empty State */}
        <div className="relative z-10">
          {loading ? (
            <div className="py-16 text-center text-[#A1AEBB] text-xs space-y-2.5">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#5EEAD4]" />
              <div>{t("loading")}</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-[#6EE7B7]/35 flex items-center justify-center text-[#6EE7B7] shadow-[0_0_20px_rgba(94,234,212,0.12)] mb-3">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight">
                {activeTab === "NEEDS_REORDER" && urgencyFilter === "ALL" && !searchTerm
                  ? "All Inventory Buffers Healthy"
                  : "No Matching Stock Items"}
              </h3>
              <p className="text-xs text-[#A1AEBB] max-w-md mt-1.5 leading-relaxed">
                {activeTab === "NEEDS_REORDER" && urgencyFilter === "ALL" && !searchTerm
                  ? "Every tracked product is above its reorder point with healthy safety runway. Switch to All Buffer Monitor to review proactive buffer levels."
                  : "Adjust your search term, buffer monitor tab, or urgency filter to view other items."}
              </p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-[#A1AEBB] mt-3.5 mb-4">
                <ShieldCheck className="w-3.5 h-3.5 text-[#6EE7B7]" />
                <span>Lead-Time &amp; Sales-Velocity Audited Buffers</span>
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
                {activeTab === "NEEDS_REORDER" && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab("ALL_INVENTORY");
                      setUrgencyFilter("ALL");
                    }}
                    className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold"
                  >
                    View All Buffer Monitor
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#080B10]/35 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.1em]">
                  <tr>
                    <th className="px-3 sm:px-5 py-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={allFilteredSelected}
                        onChange={handleToggleSelectAllVisible}
                        aria-label="Select all visible reorder items"
                        className="rounded border-white/25 bg-[#080B10] text-[#5EEAD4] focus:ring-[#5EEAD4] cursor-pointer"
                      />
                    </th>
                    <th className="px-2.5 py-3">Product &amp; Rationale</th>
                    <th className="px-2.5 py-3 whitespace-nowrap">Urgency</th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap">Stock &amp; ROP</th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap">Burn &amp; Runway</th>
                    <th className="px-2.5 py-3 text-right whitespace-nowrap">Order Qty &amp; Cost</th>
                    <th className="px-3 sm:px-5 py-3 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filtered.map((r) => {
                    const isSelected = selectedIds.includes(r.product_id);
                    const qty =
                      customQuantities[r.product_id] !== undefined
                        ? customQuantities[r.product_id]
                        : r.recommended_order_qty;
                    const lineTotal = qty * r.unit_cost;
                    const cfg =
                      URGENCY_CONFIG[r.urgency_level as UrgencyTier] || URGENCY_CONFIG.HEALTHY;

                    return (
                      <tr
                        key={r.product_id}
                        className={`border-l-2 transition-all ${
                          isSelected
                            ? "border-l-[#5EEAD4] bg-[#5EEAD4]/[0.04]"
                            : "border-l-transparent hover:border-l-[#5EEAD4]/60 hover:bg-white/[0.025]"
                        }`}
                      >
                        <td className="px-3 sm:px-5 py-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(r.product_id)}
                            aria-label={`Select ${r.product_name}`}
                            className="rounded border-white/25 bg-[#080B10] text-[#5EEAD4] focus:ring-[#5EEAD4] cursor-pointer"
                          />
                        </td>

                        <td className="px-2.5 py-3.5 max-w-[270px]">
                          <div className="font-semibold text-[#F8FAFC] text-[13px] truncate">
                            <KannadaText text={r.product_name} />
                          </div>
                          <div className="text-[10.5px] text-[#7DD3FC] mt-0.5 truncate">
                            {r.supplier_name ? `Distributor: ${r.supplier_name}` : "Assign supplier on PO"}
                            {r.sku ? <span className="text-[#A1AEBB]/75 font-mono"> • {r.sku}</span> : null}
                          </div>
                          <div
                            className="text-[10.5px] text-[#A1AEBB]/80 mt-0.5 line-clamp-1"
                            title={r.reason}
                          >
                            {r.reason}
                          </div>
                        </td>

                        <td className="px-2.5 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold border ${cfg.badge}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        </td>

                        <td className="px-2.5 py-3.5 text-right font-mono whitespace-nowrap tabular-nums">
                          <div className="text-[#F8FAFC] font-bold text-[13px]">
                            {Number(Number(r.current_stock ?? 0).toFixed(1))}{" "}
                            <span className="text-[10px] font-normal text-[#A1AEBB]">{r.unit}</span>
                            {(r.incoming_po_stock ?? 0) > 0 && (
                              <span className="text-[#6EE7B7] text-[10.5px] ml-1">
                                (+{Number(Number(r.incoming_po_stock ?? 0).toFixed(1))} PO)
                              </span>
                            )}
                          </div>
                          <div className="text-[10.5px] text-[#A1AEBB] mt-0.5">
                            ROP: {Number(r.reorder_point ?? 0).toFixed(1)} · Lead {r.supplier_lead_time_days ?? 0}d
                          </div>
                        </td>

                        <td className="px-2.5 py-3.5 text-right font-mono whitespace-nowrap tabular-nums">
                          <div className="text-[#F8FAFC]/90 font-semibold">
                            {(r.avg_daily_demand ?? 0) > 0
                              ? `${Number(r.avg_daily_demand ?? 0).toFixed(1)}/day`
                              : "0.0/day"}
                          </div>
                          <div
                            className={`text-[10.5px] mt-0.5 ${
                              r.stockout_risk_days != null && r.stockout_risk_days <= 3
                                ? "text-[#FB7185] font-semibold"
                                : "text-[#A1AEBB]"
                            }`}
                          >
                            {r.stockout_risk_days != null && r.stockout_risk_days < 900
                              ? `~${Number(r.stockout_risk_days).toFixed(1)}d runway`
                              : "Healthy buffer"}
                          </div>
                        </td>

                        <td className="px-2.5 py-3.5 text-right font-mono whitespace-nowrap tabular-nums">
                          <div className="font-bold text-[#6EE7B7] text-[13px]">
                            {Number(Number(qty ?? 0).toFixed(1))}{" "}
                            <span className="text-[10px] font-normal text-[#A1AEBB]">{r.unit}</span>
                          </div>
                          <div className="text-[10.5px] text-[#A1AEBB] mt-0.5">
                            {formatMoney(lineTotal)}
                          </div>
                        </td>

                        <td className="px-3 sm:px-5 py-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => handleOpenPOModal(r.product_id)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold ${
                              r.urgency_level === "CRITICAL" || r.urgency_level === "HIGH"
                                ? "liquid-btn-primary"
                                : "liquid-btn-secondary text-[#6EE7B7]"
                            }`}
                          >
                            <span>Quick Order</span>
                            <ArrowRight className="w-3 h-3" />
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
      </div>

      {/* Purchase Order Generation Modal (Portalled) */}
      {isModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="liquid-modal max-w-2xl w-full p-6 text-[#F8FAFC] space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <FilePlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">Generate Purchase Order</h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Fine-tune suggested order quantities and issue directly to your supplier.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close generate PO modal"
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

              <div className="space-y-4 text-xs">
                <div className="p-3.5 rounded-xl bg-[#080B10]/60 border border-white/[0.1] space-y-2">
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB]">
                    Target Supplier / Distributor *
                  </label>
                  {suppliers.length === 0 ? (
                    <div className="text-[#FBBF24] text-xs">
                      No suppliers registered yet. Register one in Suppliers &amp; Vendors first.
                    </div>
                  ) : (
                    <select
                      value={selectedSupplierId || ""}
                      onChange={(e) => setSelectedSupplierId(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#111722] text-[#F8FAFC] font-semibold focus:outline-none focus:border-[#5EEAD4]"
                    >
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id} className="bg-[#111722] text-[#F8FAFC]">
                          {s.name} (Lead: {s.lead_time_days}d · Net {s.payment_terms_days}d)
                        </option>
                      ))}
                    </select>
                  )}

                  {chosenSupplier && (
                    <div className="text-[11px] text-[#A1AEBB] flex flex-wrap items-center justify-between gap-2 pt-1 tabular-nums">
                      <span>Phone: {chosenSupplier.phone || "Direct Wholesale"}</span>
                      <span>Est. Delivery: {estimatedEta}</span>
                    </div>
                  )}
                </div>

                {/* Selected Line Items */}
                <div className="rounded-xl border border-white/[0.1] overflow-hidden bg-[#080B10]/45">
                  <div className="px-4 py-2.5 bg-white/[0.04] border-b border-white/[0.08] flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB]">
                    <span>Selected Products ({selectedItems.length})</span>
                    <span>Adjust Order Qty</span>
                  </div>
                  <div className="divide-y divide-white/[0.06] max-h-56 overflow-y-auto">
                    {selectedItems.map((item) => {
                      const currentQty =
                        customQuantities[item.product_id] !== undefined
                          ? customQuantities[item.product_id]
                          : item.recommended_order_qty;
                      const lineCost = currentQty * item.unit_cost;

                      return (
                        <div
                          key={item.product_id}
                          className="px-4 py-2.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="font-semibold text-[#F8FAFC] truncate">
                              <KannadaText text={item.product_name} />
                            </div>
                            <div className="text-[10.5px] text-[#A1AEBB] font-mono tabular-nums mt-0.5">
                              In Stock: {item.current_stock} {item.unit} • Unit:{" "}
                              {formatMoney(item.unit_cost)}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="flex items-center rounded-lg border border-white/[0.14] bg-[#080B10]/85 overflow-hidden">
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuantityChange(item.product_id, currentQty - 1)
                                }
                                className="p-1.5 text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.08]"
                                aria-label={`Decrease quantity for ${item.product_name}`}
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={currentQty}
                                onChange={(e) =>
                                  handleQuantityChange(
                                    item.product_id,
                                    parseFloat(e.target.value) || 1
                                  )
                                }
                                className="w-14 text-center text-xs font-bold font-mono bg-transparent text-[#F8FAFC] tabular-nums focus:outline-none"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  handleQuantityChange(item.product_id, currentQty + 1)
                                }
                                className="p-1.5 text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.08]"
                                aria-label={`Increase quantity for ${item.product_name}`}
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="w-24 text-right font-mono font-bold text-[#F8FAFC] tabular-nums">
                              {formatMoney(lineCost)}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                    PO Notes / Dispatch Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                    placeholder="e.g., Urgent morning dispatch requested"
                    className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="p-3.5 rounded-xl bg-[#5EEAD4]/[0.08] border border-[#5EEAD4]/25 flex items-center justify-between tabular-nums">
                  <span className="font-semibold text-[#F8FAFC]">Total Estimated PO Capital</span>
                  <span className="text-base font-mono font-extrabold text-[#6EE7B7]">
                    {formatMoney(totalSelectedCost)}
                  </span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmCreatePO}
                  disabled={converting || selectedIds.length === 0 || !selectedSupplierId}
                  className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <FilePlus className="w-4 h-4" />
                  <span>{converting ? "Issuing PO..." : "Confirm & Issue PO"}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
