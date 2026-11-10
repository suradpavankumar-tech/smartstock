import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Truck,
  Plus,
  CheckCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  MessageCircle,
  Printer,
  Mail,
  FileText,
  X,
  Send,
  Copy,
  Check,
  Search,
  Filter,
  PackageCheck,
  ShieldCheck,
  Eye,
  Trash2,
} from "lucide-react";
import { api } from "../services/api";
import { PurchaseOrder, Supplier, Product, Business, POStatus } from "../types";
import { useLanguage } from "../context/LanguageContext";
import { KannadaText } from "../components/common/KannadaText";
import {
  buildPurchaseOrderWhatsAppMessage,
  buildWhatsAppUrl,
  openWhatsAppUrl,
} from "../utils/whatsapp";

type POStatusTab = "ALL" | "ORDERED" | "PARTIALLY_RECEIVED" | "COMPLETED";

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

const STATUS_CONFIG: Record<POStatus, { badge: string; dot: string; label: string }> = {
  DRAFT: {
    badge: "bg-white/[0.06] text-[#A1AEBB] border-white/[0.15]",
    dot: "bg-[#A1AEBB]",
    label: "Draft",
  },
  ORDERED: {
    badge: "bg-[#FBBF24]/12 text-[#FBBF24] border-[#FBBF24]/35",
    dot: "bg-[#FBBF24]",
    label: "Ordered",
  },
  PARTIALLY_RECEIVED: {
    badge: "bg-[#7DD3FC]/12 text-[#7DD3FC] border-[#7DD3FC]/35",
    dot: "bg-[#7DD3FC]",
    label: "Partial",
  },
  COMPLETED: {
    badge: "bg-[#6EE7B7]/12 text-[#6EE7B7] border-[#6EE7B7]/35",
    dot: "bg-[#6EE7B7]",
    label: "Completed",
  },
  CANCELLED: {
    badge: "bg-[#FB7185]/12 text-[#FB7185] border-[#FB7185]/35",
    dot: "bg-[#FB7185]",
    label: "Cancelled",
  },
};

interface DraftOrderItem {
  product_id: number;
  quantity: number;
  cost: number;
  tax_rate_percent: number;
}

export const PurchasesPage: React.FC = () => {
  const { t, language, formatMoney, tData } = useLanguage();
  const isKn = language === "kn";

  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // Filters & search
  const [searchTerm, setSearchTerm] = useState("");
  const [statusTab, setStatusTab] = useState<POStatusTab>("ALL");
  const [supplierFilter, setSupplierFilter] = useState<string>("ALL");

  // PO Detail Modal
  const [detailPO, setDetailPO] = useState<PurchaseOrder | null>(null);

  // New PO Modal
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [selectedSupplierId, setSelectedSupplierId] = useState<number | undefined>();
  const [orderDate, setOrderDate] = useState<string>(() => toLocalISODate(new Date()));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>(() =>
    addDaysLocalISO(toLocalISODate(new Date()), 3)
  );
  const [poNotes, setPoNotes] = useState("");
  const [orderItems, setOrderItems] = useState<DraftOrderItem[]>([]);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Post-Creation Supplier Transmission Modal
  const [transmittedPO, setTransmittedPO] = useState<PurchaseOrder | null>(null);
  const [supplierPhoneInput, setSupplierPhoneInput] = useState("");
  const [supplierEmailInput, setSupplierEmailInput] = useState("");
  const [showTextPreview, setShowTextPreview] = useState(false);
  const [copiedText, setCopiedText] = useState(false);

  // Printable PO Modal
  const [printPO, setPrintPO] = useState<PurchaseOrder | null>(null);

  // Receive PO Modal
  const [receivingPO, setReceivingPO] = useState<PurchaseOrder | null>(null);
  const [receiveInputs, setReceiveInputs] = useState<{
    [itemId: number]: { qty: number; batch?: string; expiry?: string };
  }>({});
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveSubmitting, setReceiveSubmitting] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);

  // Quick Add Supplier Modal
  const [isQuickSupplierOpen, setIsQuickSupplierOpen] = useState(false);
  const [quickSupplierName, setQuickSupplierName] = useState("");
  const [quickSupplierPhone, setQuickSupplierPhone] = useState("");
  const [quickSupplierGstin, setQuickSupplierGstin] = useState("");
  const [quickSupplierLeadTime, setQuickSupplierLeadTime] = useState(3);
  const [quickSupplierSaving, setQuickSupplierSaving] = useState(false);
  const [quickSupplierError, setQuickSupplierError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [pos, sups, prods, biz] = await Promise.all([
        api.getPurchaseOrders(200),
        api.getSuppliers(),
        api.getProducts({ limit: 500 }),
        api.getBusinessProfile().catch(() => null),
      ]);
      setOrders(pos);
      setSuppliers(sups);
      setProducts(prods);
      if (biz) setBusiness(biz);

      // Support seamless "Raise PO →" handoff from Suppliers & Vendors page
      const handoffSupplierId = sessionStorage.getItem("smartstock_po_supplier_id");
      if (handoffSupplierId) {
        sessionStorage.removeItem("smartstock_po_supplier_id");
        const supId = Number(handoffSupplierId);
        const sup = sups.find((s) => s.id === supId);
        if (sup) {
          const todayIso = toLocalISODate(new Date());
          setSelectedSupplierId(sup.id);
          setOrderDate(todayIso);
          setExpectedDeliveryDate(addDaysLocalISO(todayIso, sup.lead_time_days || 3));
          setPoNotes("");
          setCreateError(null);
          setOrderItems(
            prods.length > 0
              ? [
                  {
                    product_id: prods[0].id,
                    quantity: 10,
                    cost: prods[0].purchase_cost,
                    tax_rate_percent: prods[0].tax_rate_percent || 0,
                  },
                ]
              : []
          );
          setIsNewOrderModalOpen(true);
        }
      }
    } catch (err: any) {
      setPageError(err.message || "Failed to load purchase orders");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered base before status tab (search + supplier dropdown)
  const baseMatchedOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return orders.filter((po) => {
      if (supplierFilter !== "ALL" && String(po.supplier_id) !== supplierFilter) {
        return false;
      }
      if (q) {
        const matchNumber = po.po_number.toLowerCase().includes(q);
        const matchSup = (po.supplier_name || "").toLowerCase().includes(q);
        const matchPhone = (po.supplier_phone || "").toLowerCase().includes(q);
        const matchNotes = (po.notes || "").toLowerCase().includes(q);
        const matchItem = po.items?.some((it) =>
          (it.product_name || "").toLowerCase().includes(q)
        );
        if (!matchNumber && !matchSup && !matchPhone && !matchNotes && !matchItem) {
          return false;
        }
      }
      return true;
    });
  }, [orders, searchTerm, supplierFilter]);

  const stats = useMemo(() => {
    let totalValue = 0;
    let orderedCount = 0;
    let partialCount = 0;
    let completedCount = 0;
    let cancelledCount = 0;
    let openValue = 0;
    let completedValue = 0;
    let totalOrderedUnits = 0;
    let totalReceivedUnits = 0;

    baseMatchedOrders.forEach((po) => {
      if (po.status === "CANCELLED") {
        cancelledCount += 1;
        return;
      }
      totalValue += po.total_amount;
      if (po.status === "COMPLETED") {
        completedCount += 1;
        completedValue += po.total_amount;
      } else if (po.status === "PARTIALLY_RECEIVED") {
        partialCount += 1;
        openValue += po.total_amount;
      } else {
        orderedCount += 1;
        openValue += po.total_amount;
      }

      po.items?.forEach((it) => {
        totalOrderedUnits += it.quantity_ordered || 0;
        totalReceivedUnits += it.quantity_received || 0;
      });
    });

    const openCount = orderedCount + partialCount;
    const fillRatePct =
      totalOrderedUnits > 0
        ? Math.min(100, Math.round((totalReceivedUnits / totalOrderedUnits) * 100))
        : 0;
    const activeTotal = Math.max(0, baseMatchedOrders.length - cancelledCount);
    const completionRatePct =
      activeTotal > 0 ? Math.round((completedCount / activeTotal) * 100) : 0;

    return {
      totalCount: baseMatchedOrders.length,
      activeTotal,
      totalValue,
      orderedCount,
      partialCount,
      completedCount,
      cancelledCount,
      openCount,
      openValue,
      completedValue,
      totalOrderedUnits,
      totalReceivedUnits,
      fillRatePct,
      completionRatePct,
    };
  }, [baseMatchedOrders]);

  const filtered = useMemo(() => {
    if (statusTab === "ALL") return baseMatchedOrders;
    return baseMatchedOrders.filter((po) => po.status === statusTab);
  }, [baseMatchedOrders, statusTab]);

  const hasActiveFilters =
    searchTerm.trim() !== "" || statusTab !== "ALL" || supplierFilter !== "ALL";

  const clearFilters = () => {
    setSearchTerm("");
    setStatusTab("ALL");
    setSupplierFilter("ALL");
  };

  const openNewOrderModal = () => {
    const todayIso = toLocalISODate(new Date());
    const defaultSup = suppliers[0];
    setSelectedSupplierId(defaultSup?.id);
    setOrderDate(todayIso);
    setExpectedDeliveryDate(
      addDaysLocalISO(todayIso, defaultSup?.lead_time_days || 3)
    );
    setPoNotes("");
    setCreateError(null);
    setOrderItems(
      products.length > 0
        ? [
            {
              product_id: products[0].id,
              quantity: 10,
              cost: products[0].purchase_cost,
              tax_rate_percent: products[0].tax_rate_percent || 0,
            },
          ]
        : []
    );
    setIsNewOrderModalOpen(true);
  };

  const handleSelectSupplierInCreate = (supIdStr: string) => {
    const supId = supIdStr ? Number(supIdStr) : undefined;
    setSelectedSupplierId(supId);
    const sup = suppliers.find((s) => s.id === supId);
    if (sup && orderDate) {
      setExpectedDeliveryDate(addDaysLocalISO(orderDate, sup.lead_time_days || 3));
    }
  };

  const handleAddOrderItem = () => {
    if (products.length === 0) return;
    // Prefer a product not already in the list if available
    const existingIds = new Set(orderItems.map((i) => i.product_id));
    const nextProd = products.find((p) => !existingIds.has(p.id)) || products[0];
    setOrderItems((prev) => [
      ...prev,
      {
        product_id: nextProd.id,
        quantity: 10,
        cost: nextProd.purchase_cost,
        tax_rate_percent: nextProd.tax_rate_percent || 0,
      },
    ]);
  };

  const draftTotals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    orderItems.forEach((item) => {
      const lineSub = (Number(item.quantity) || 0) * (Number(item.cost) || 0);
      const lineTax = (lineSub * (Number(item.tax_rate_percent) || 0)) / 100;
      subtotal += lineSub;
      tax += lineTax;
    });
    return {
      subtotal,
      tax,
      grandTotal: subtotal + tax,
    };
  }, [orderItems]);

  const handleCreatePO = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!selectedSupplierId) {
      setCreateError("Please select or quick-add a wholesale supplier.");
      return;
    }
    if (orderItems.length === 0) {
      setCreateError("Add at least one item line to issue a Purchase Order.");
      return;
    }
    const invalidItem = orderItems.find(
      (i) => !i.product_id || Number(i.quantity) <= 0 || Number(i.cost) < 0
    );
    if (invalidItem) {
      setCreateError("All item lines must have quantity > 0 and valid unit cost.");
      return;
    }

    setCreateSubmitting(true);
    try {
      const created = await api.createPurchaseOrder({
        supplier_id: selectedSupplierId,
        order_date: orderDate || toLocalISODate(new Date()),
        expected_delivery_date: expectedDeliveryDate || undefined,
        notes: poNotes.trim() || undefined,
        items: orderItems.map((item) => ({
          product_id: item.product_id,
          quantity_ordered: Number(item.quantity),
          unit_cost: Number(item.cost),
          tax_rate_percent: Number(item.tax_rate_percent) || 0,
        })),
      });

      setIsNewOrderModalOpen(false);
      setOrderItems([]);
      await loadData();

      // Open Supplier Transmission Modal
      const supplier = suppliers.find((s) => s.id === selectedSupplierId);
      setSupplierPhoneInput(created.supplier_phone || supplier?.phone || "");
      setSupplierEmailInput(created.supplier_email || supplier?.email || "");
      setShowTextPreview(false);
      setCopiedText(false);
      setTransmittedPO(created);
    } catch (err: any) {
      setCreateError(err.message || "Failed to create Purchase Order");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleQuickAddSupplier = async (e: React.FormEvent) => {
    e.preventDefault();
    setQuickSupplierError(null);
    if (!quickSupplierName.trim()) {
      setQuickSupplierError("Supplier / firm name is required.");
      return;
    }
    setQuickSupplierSaving(true);
    try {
      const created = await api.createSupplier({
        name: quickSupplierName.trim(),
        phone: quickSupplierPhone.trim() || undefined,
        gstin: quickSupplierGstin.trim().toUpperCase() || undefined,
        lead_time_days: quickSupplierLeadTime || 3,
        payment_terms_days: 15,
      });
      setSuppliers((prev) => [...prev, created]);
      setSelectedSupplierId(created.id);
      if (orderDate) {
        setExpectedDeliveryDate(addDaysLocalISO(orderDate, created.lead_time_days || 3));
      }
      setIsQuickSupplierOpen(false);
      setQuickSupplierName("");
      setQuickSupplierPhone("");
      setQuickSupplierGstin("");
    } catch (err: any) {
      setQuickSupplierError(err.message || "Failed to register supplier");
    } finally {
      setQuickSupplierSaving(false);
    }
  };

  const getIndentMessage = (po: PurchaseOrder) => {
    const matchingSupplier = suppliers.find((s) => s.id === po.supplier_id);
    const sName = po.supplier_name || matchingSupplier?.name || "Wholesale Distributor";
    const sContact = matchingSupplier?.contact_person;
    const shopName = business?.name || "SmartStock Retail Store";
    const shopCity = business?.city || "Haveri";
    const shopPhone = business?.phone || "";

    return buildPurchaseOrderWhatsAppMessage(
      po,
      sName,
      sContact,
      shopName,
      shopCity,
      shopPhone,
      isKn
    );
  };

  const handleSendWhatsApp = (po: PurchaseOrder, targetPhone?: string) => {
    const matchingSupplier = suppliers.find((s) => s.id === po.supplier_id);
    const phone =
      targetPhone !== undefined
        ? targetPhone
        : po.supplier_phone || matchingSupplier?.phone || "";
    const message = getIndentMessage(po);

    const url = buildWhatsAppUrl(phone, message);
    if (url) {
      openWhatsAppUrl(url);
    } else {
      openWhatsAppUrl(`https://wa.me/?text=${encodeURIComponent(message)}`);
    }
  };

  const handleSendEmail = (po: PurchaseOrder, targetEmail?: string) => {
    const matchingSupplier = suppliers.find((s) => s.id === po.supplier_id);
    const email =
      targetEmail !== undefined
        ? targetEmail
        : po.supplier_email || matchingSupplier?.email || "";
    const shopName = business?.name || "SmartStock Retail Store";
    const subject = `Purchase Order ${po.po_number} - ${shopName}`;
    const body = getIndentMessage(po);

    const mailtoUrl = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl, "_blank");
  };

  const handleCopyMessage = async (po: PurchaseOrder) => {
    const message = getIndentMessage(po);
    try {
      await navigator.clipboard.writeText(message);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2500);
    } catch {
      // Fallback ignored if clipboard blocked
    }
  };

  const openReceiveModal = (po: PurchaseOrder) => {
    setReceivingPO(po);
    setReceiveError(null);
    setReceiveNotes("");
    const initialInputs: {
      [itemId: number]: { qty: number; batch?: string; expiry?: string };
    } = {};
    po.items.forEach((item) => {
      const pending = Math.max(0, Number((item.quantity_ordered - item.quantity_received).toFixed(3)));
      initialInputs[item.id] = { qty: pending, batch: "", expiry: "" };
    });
    setReceiveInputs(initialInputs);
  };

  const fillAllPendingReceive = () => {
    if (!receivingPO) return;
    const next: {
      [itemId: number]: { qty: number; batch?: string; expiry?: string };
    } = {};
    receivingPO.items.forEach((item) => {
      const pending = Math.max(0, Number((item.quantity_ordered - item.quantity_received).toFixed(3)));
      next[item.id] = {
        ...receiveInputs[item.id],
        qty: pending,
      };
    });
    setReceiveInputs(next);
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingPO) return;
    setReceiveError(null);

    const receiptItems = Object.entries(receiveInputs)
      .filter(([_, val]) => (val?.qty || 0) > 0)
      .map(([itemId, val]) => ({
        po_item_id: Number(itemId),
        quantity_received_now: Number(val.qty),
        batch_number: val.batch?.trim() || undefined,
        expiry_date: val.expiry || undefined,
      }));

    if (receiptItems.length === 0) {
      setReceiveError("Enter at least one item quantity greater than 0 to record stock receipt.");
      return;
    }

    setReceiveSubmitting(true);
    try {
      await api.receivePurchaseOrder(receivingPO.id, {
        notes: receiveNotes.trim() || undefined,
        items: receiptItems,
      });
      setReceivingPO(null);
      await loadData();
    } catch (err: any) {
      setReceiveError(err.message || "Failed to receive purchase items");
    } finally {
      setReceiveSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto pb-2">
      {/* Print CSS styling for formal letterhead A4 PO */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-purchase-order, #printable-purchase-order * {
            visibility: visible !important;
          }
          #printable-purchase-order {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            padding: 24px !important;
            background: #ffffff !important;
            color: #0f172a !important;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Unified Midnight Mist Liquid Glass Procurement Terminal */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.12)] relative overflow-hidden backdrop-blur-2xl">
        {/* Ambient diffuse highlights */}
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
                  {t("navPurchases")}
                </span>
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[#A1AEBB] tabular-nums">
                  {filtered.length} {filtered.length === 1 ? "order" : "orders"}
                </span>
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] mt-0.5">
                {isKn
                  ? "ಖರೀದಿ ಆದೇಶಗಳನ್ನು ರಚಿಸಿ, ವಾಟ್ಸಾಪ್/ಇಮೇಲ್ ಮೂಲಕ ಪೂರೈಕೆದಾರರಿಗೆ ಕಳುಹಿಸಿ ಮತ್ತು ದಾಸ್ತಾನು ಸ್ವೀಕರಿಸಿ"
                  : "Issue stock purchase indents, dispatch via WhatsApp or Email, and receive batch deliveries"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={loadData}
              className="liquid-btn-secondary p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] shrink-0"
              title={t("refresh")}
              aria-label={t("refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#5EEAD4]" : ""}`} />
            </button>

            <button
              type="button"
              onClick={openNewOrderModal}
              className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{isKn ? "ಹೊಸ ಖರೀದಿ ಆದೇಶ" : "New Purchase Order"}</span>
            </button>
          </div>
        </div>

        {/* 2. Cardless Architectural 4-Column KPI Telemetry Strip */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Col 1: Total Procurement Spend */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಒಟ್ಟು ಖರೀದಿ ಮೊತ್ತ" : "Procurement Volume"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6EE7B7] tabular-nums whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
                {stats.activeTotal} active POs
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {formatMoney(stats.totalValue)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Settled: {formatMoney(stats.completedValue)}</span>
              <span>{stats.completionRatePct}% closed</span>
            </div>
          </div>

          {/* Col 2: Awaiting / Partial Delivery */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಬಾಕಿ ಇರುವ ಸರಬರಾಜು" : "Open / Pending POs"}
              </span>
              {stats.openCount > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setStatusTab(stats.orderedCount > 0 ? "ORDERED" : "PARTIALLY_RECEIVED")
                  }
                  className="text-[11px] font-semibold text-[#FBBF24] hover:underline whitespace-nowrap"
                >
                  Filter Open →
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-[#6EE7B7]">All Received</span>
              )}
            </div>
            <div
              className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums mt-2 ${
                stats.openCount > 0 ? "text-[#FBBF24]" : "text-[#F8FAFC]"
              }`}
            >
              {formatMoney(stats.openValue)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Ordered: {stats.orderedCount}</span>
              <span>Partial: {stats.partialCount}</span>
            </div>
          </div>

          {/* Col 3: Completed & Received */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಪೂರ್ಣಗೊಂಡ ಆದೇಶಗಳು" : "Completed Receipts"}
              </span>
              <span className="text-[11px] font-medium text-[#6EE7B7] whitespace-nowrap">
                Stock Posted
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#6EE7B7] tracking-tight tabular-nums mt-2">
              {stats.completedCount}{" "}
              <span className="text-xs font-medium text-[#A1AEBB]">
                {stats.completedCount === 1 ? "order" : "orders"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Closed value: {formatMoney(stats.completedValue)}</span>
            </div>
          </div>

          {/* Col 4: Real Receiving Fill Rate */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ವಸ್ತುಗಳ ಪೂರೈಕೆ ದರ" : "Unit Fill Rate"}
              </span>
              <span className="text-[11px] font-medium text-[#7DD3FC] whitespace-nowrap">
                Received vs Ordered
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#7DD3FC] tracking-tight tabular-nums mt-2">
              {stats.fillRatePct}%
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>
                {Number(stats.totalReceivedUnits.toFixed(1))} /{" "}
                {Number(stats.totalOrderedUnits.toFixed(1))} units
              </span>
              <span className="text-[#7DD3FC] font-medium">Audited GRN</span>
            </div>
          </div>
        </div>

        {/* 3. Interactive Delivery Pipeline Mix Bar */}
        {stats.activeTotal > 0 && (
          <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] bg-[#080B10]/20">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#A1AEBB]">
                PO Pipeline Mix (Click Status to Filter)
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-[#A1AEBB] tabular-nums">
                {(
                  [
                    {
                      key: "COMPLETED" as POStatusTab,
                      label: "Completed",
                      val: stats.completedValue,
                      count: stats.completedCount,
                      dot: "bg-[#6EE7B7]",
                    },
                    {
                      key: "PARTIALLY_RECEIVED" as POStatusTab,
                      label: "Partial",
                      val: stats.partialCount > 0 ? stats.openValue : 0,
                      count: stats.partialCount,
                      dot: "bg-[#7DD3FC]",
                    },
                    {
                      key: "ORDERED" as POStatusTab,
                      label: "Ordered",
                      val: stats.orderedCount > 0 ? stats.openValue : 0,
                      count: stats.orderedCount,
                      dot: "bg-[#FBBF24]",
                    },
                  ] as const
                )
                  .filter((seg) => seg.count > 0)
                  .map((seg) => {
                    const pct =
                      stats.activeTotal > 0
                        ? Math.round((seg.count / stats.activeTotal) * 100)
                        : 0;
                    return (
                      <button
                        key={seg.key}
                        type="button"
                        onClick={() =>
                          setStatusTab(statusTab === seg.key ? "ALL" : seg.key)
                        }
                        className={`inline-flex items-center gap-1.5 transition-opacity hover:opacity-100 ${
                          statusTab !== "ALL" && statusTab !== seg.key
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
              {stats.completedCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setStatusTab(statusTab === "COMPLETED" ? "ALL" : "COMPLETED")
                  }
                  style={{ width: `${(stats.completedCount / stats.activeTotal) * 100}%` }}
                  title={`Completed: ${stats.completedCount} order(s)`}
                  className="h-full bg-[#6EE7B7] transition-all duration-500"
                />
              )}
              {stats.partialCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setStatusTab(
                      statusTab === "PARTIALLY_RECEIVED" ? "ALL" : "PARTIALLY_RECEIVED"
                    )
                  }
                  style={{ width: `${(stats.partialCount / stats.activeTotal) * 100}%` }}
                  title={`Partial Delivery: ${stats.partialCount} order(s)`}
                  className="h-full bg-[#7DD3FC] transition-all duration-500"
                />
              )}
              {stats.orderedCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setStatusTab(statusTab === "ORDERED" ? "ALL" : "ORDERED")
                  }
                  style={{ width: `${(stats.orderedCount / stats.activeTotal) * 100}%` }}
                  title={`Ordered (Awaiting Dispatch): ${stats.orderedCount} order(s)`}
                  className="h-full bg-[#FBBF24] transition-all duration-500"
                />
              )}
            </div>
          </div>
        )}

        {/* 4. Integrated Search, Status Underline Tabs & Supplier Filter */}
        <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="relative flex-1 lg:max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#A1AEBB]" />
            <input
              type="text"
              placeholder={
                isKn
                  ? "PO ಸಂಖ್ಯೆ, ಪೂರೈಕೆದಾರರ ಹೆಸರು ಅಥವಾ ವಸ್ತು ಹುಡುಕಿ..."
                  : "Search by PO # (PO-2026-...), supplier, phone or item..."
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
                aria-label="Clear purchase order search"
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
                    key: "ORDERED",
                    label: isKn ? "ಆದೇಶಿಸಲಾಗಿದೆ" : "Ordered",
                    count: stats.orderedCount,
                  },
                  {
                    key: "PARTIALLY_RECEIVED",
                    label: isKn ? "ಭಾಗಶಃ" : "Partial",
                    count: stats.partialCount,
                  },
                  {
                    key: "COMPLETED",
                    label: isKn ? "ಪೂರ್ಣ" : "Completed",
                    count: stats.completedCount,
                  },
                ] as const
              ).map((tab) => {
                const isActive = statusTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setStatusTab(tab.key)}
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
                          tab.key === "ORDERED"
                            ? "bg-[#FBBF24] shadow-[0_0_8px_#FBBF24]"
                            : tab.key === "PARTIALLY_RECEIVED"
                            ? "bg-[#7DD3FC] shadow-[0_0_8px_#7DD3FC]"
                            : "bg-[#6EE7B7] shadow-[0_0_8px_#5EEAD4]"
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Dark Supplier Select */}
            <div className="flex items-center gap-2 shrink-0">
              <Filter className="w-3.5 h-3.5 text-[#A1AEBB]" />
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                aria-label="Filter by supplier"
                className="px-3 py-1.5 bg-[#080B10]/80 border border-white/[0.12] rounded-xl text-xs font-medium text-[#F8FAFC] focus:border-[#5EEAD4] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all max-w-[200px]"
              >
                <option value="ALL" className="bg-[#111722] text-[#F8FAFC]">
                  All Suppliers
                </option>
                {suppliers.map((s) => (
                  <option key={s.id} value={String(s.id)} className="bg-[#111722] text-[#F8FAFC]">
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Inline Error Banner */}
        {pageError && (
          <div className="relative z-10 px-5 sm:px-7 py-2.5 bg-[#FB7185]/12 border-b border-[#FB7185]/30 text-[#FB7185] text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pageError}</span>
            </div>
            <button
              type="button"
              onClick={loadData}
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
                <Truck className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight">
                {hasActiveFilters
                  ? "No Purchase Orders Match Filters"
                  : "No Purchase Orders Created Yet"}
              </h3>
              <p className="text-xs text-[#A1AEBB] max-w-md mt-1.5 leading-relaxed">
                {hasActiveFilters
                  ? "Clear the search query, status tab, or supplier filter to inspect other procurement orders."
                  : "Submit a purchase order to generate an audited indent, transmit via WhatsApp/Email, and receive stock batches."}
              </p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-[#A1AEBB] mt-3.5 mb-4">
                <ShieldCheck className="w-3.5 h-3.5 text-[#6EE7B7]" />
                <span>Audited Procurement Ledger • Real stock movements</span>
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
                  onClick={openNewOrderModal}
                  className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Purchase Order</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#080B10]/35 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.1em]">
                  <tr>
                    <th className="px-4 sm:px-6 py-3 whitespace-nowrap">PO Number</th>
                    <th className="px-3 py-3">Supplier</th>
                    <th className="px-3 py-3 whitespace-nowrap">Order &amp; ETA</th>
                    <th className="px-3 py-3">Status &amp; Fill</th>
                    <th className="px-3 py-3 text-right whitespace-nowrap">Total Amount</th>
                    <th className="px-3 py-3 text-center">Transmit</th>
                    <th className="px-4 sm:px-6 py-3 text-right">Stock Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filtered.map((po) => {
                    const matchingSup = suppliers.find((s) => s.id === po.supplier_id);
                    const phone = po.supplier_phone || matchingSup?.phone;
                    const cfg = STATUS_CONFIG[po.status] || STATUS_CONFIG.ORDERED;
                    const orderedQty = po.items?.reduce((s, it) => s + (it.quantity_ordered || 0), 0) || 0;
                    const receivedQty = po.items?.reduce((s, it) => s + (it.quantity_received || 0), 0) || 0;

                    return (
                      <tr
                        key={po.id}
                        className="border-l-2 border-l-transparent hover:border-l-[#5EEAD4]/75 hover:bg-white/[0.025] transition-all"
                      >
                        <td className="px-4 sm:px-6 py-3.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setDetailPO(po)}
                            className="font-mono font-bold text-[#F8FAFC] hover:text-[#6EE7B7] transition-colors tabular-nums text-left"
                          >
                            {po.po_number}
                          </button>
                          <div className="text-[10.5px] text-[#A1AEBB]/80 mt-0.5 tabular-nums">
                            {po.items?.length || 0}{" "}
                            {(po.items?.length || 0) === 1 ? "line" : "lines"}
                          </div>
                        </td>

                        <td className="px-3 py-3.5 max-w-[200px]">
                          <div className="font-semibold text-[#F8FAFC] text-[13px] truncate">
                            <KannadaText
                              text={po.supplier_name || matchingSup?.name || "Supplier"}
                            />
                          </div>
                          {phone && (
                            <div className="text-[10.5px] font-mono text-[#A1AEBB] mt-0.5">
                              {phone}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3.5 font-mono text-[11px] text-[#A1AEBB] tabular-nums whitespace-nowrap">
                          <div className="text-[#F8FAFC]/90">{po.order_date}</div>
                          {po.expected_delivery_date && (
                            <div className="text-[10px] text-[#A1AEBB]/75 mt-0.5">
                              ETA: {po.expected_delivery_date}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold border ${cfg.badge}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {tData(cfg.label)}
                          </span>
                          {orderedQty > 0 && (
                            <div className="text-[10px] font-mono text-[#A1AEBB]/80 mt-1 tabular-nums">
                              {Number(receivedQty.toFixed(1))} / {Number(orderedQty.toFixed(1))} units
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3.5 text-right whitespace-nowrap tabular-nums">
                          <div className="font-mono font-bold text-[13px] text-[#F8FAFC]">
                            {formatMoney(po.total_amount)}
                          </div>
                          {po.tax_amount > 0 && (
                            <div className="text-[10px] text-[#A1AEBB]/75">
                              Incl. tax {formatMoney(po.tax_amount)}
                            </div>
                          )}
                        </td>

                        <td className="px-3 py-3.5 text-center whitespace-nowrap">
                          <div className="inline-flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleSendWhatsApp(po)}
                              title="Send Order Indent on WhatsApp"
                              className="liquid-btn-secondary inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[#6EE7B7]"
                            >
                              <MessageCircle className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setPrintPO(po)}
                              title="Print Formal PO Indent"
                              className="liquid-btn-secondary inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold text-[#A1AEBB] hover:text-[#F8FAFC]"
                            >
                              <Printer className="w-3 h-3 text-[#7DD3FC]" />
                              <span>Indent</span>
                            </button>
                          </div>
                        </td>

                        <td className="px-4 sm:px-6 py-3.5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setDetailPO(po)}
                              title="Inspect PO Line Items"
                              aria-label={`View ${po.po_number}`}
                              className="p-1.5 rounded-lg text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.08] transition-colors"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>

                            {po.status !== "COMPLETED" && po.status !== "CANCELLED" ? (
                              <button
                                type="button"
                                onClick={() => openReceiveModal(po)}
                                className="liquid-btn-primary inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold"
                              >
                                <PackageCheck className="w-3.5 h-3.5" />
                                <span>Receive</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#6EE7B7] px-2">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Received</span>
                              </span>
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

      {/* PO Detail & Line Items Modal (Portalled) */}
      {detailPO &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="liquid-modal max-w-2xl w-full p-6 text-[#F8FAFC] space-y-5">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-sm font-mono font-bold text-[#F8FAFC]">
                        {detailPO.po_number}
                      </h2>
                      <span
                        className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                          (STATUS_CONFIG[detailPO.status] || STATUS_CONFIG.ORDERED).badge
                        }`}
                      >
                        {detailPO.status.replace("_", " ")}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Supplier: <strong className="text-[#F8FAFC]">{detailPO.supplier_name}</strong>{" "}
                      • Ordered {detailPO.order_date}
                      {detailPO.expected_delivery_date
                        ? ` • ETA ${detailPO.expected_delivery_date}`
                        : ""}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setDetailPO(null)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close PO details"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {detailPO.notes && (
                <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-[#A1AEBB]">
                  <span className="text-[10.5px] uppercase tracking-wider font-semibold text-[#7DD3FC] block mb-0.5">
                    Procurement Notes
                  </span>
                  {detailPO.notes}
                </div>
              )}

              <div className="rounded-xl border border-white/[0.1] overflow-hidden bg-[#080B10]/45">
                <table className="w-full text-left text-xs">
                  <thead className="bg-white/[0.04] border-b border-white/[0.08] text-[10.5px] uppercase tracking-wider text-[#A1AEBB]">
                    <tr>
                      <th className="px-3.5 py-2.5">Item</th>
                      <th className="px-3 py-2.5 text-right">Ordered</th>
                      <th className="px-3 py-2.5 text-right">Received</th>
                      <th className="px-3 py-2.5 text-right">Unit Cost</th>
                      <th className="px-3.5 py-2.5 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06] tabular-nums">
                    {detailPO.items.map((item) => {
                      const fullyDone = item.quantity_received >= item.quantity_ordered;
                      return (
                        <tr key={item.id}>
                          <td className="px-3.5 py-2.5">
                            <div className="font-semibold text-[#F8FAFC]">
                              {item.product_name || `Product #${item.product_id}`}
                            </div>
                            {item.tax_rate_percent > 0 && (
                              <div className="text-[10px] text-[#A1AEBB]">
                                GST {item.tax_rate_percent}%
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right text-[#A1AEBB]">
                            {item.quantity_ordered} {item.unit || ""}
                          </td>
                          <td
                            className={`px-3 py-2.5 text-right font-mono font-semibold ${
                              fullyDone ? "text-[#6EE7B7]" : "text-[#FBBF24]"
                            }`}
                          >
                            {item.quantity_received} {item.unit || ""}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-[#A1AEBB]">
                            {formatMoney(item.unit_cost)}
                          </td>
                          <td className="px-3.5 py-2.5 text-right font-mono font-bold text-[#F8FAFC]">
                            {formatMoney(item.total_cost)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] space-y-1.5 text-xs tabular-nums">
                <div className="flex justify-between text-[#A1AEBB]">
                  <span>Subtotal</span>
                  <span className="font-mono text-[#F8FAFC]">{formatMoney(detailPO.subtotal)}</span>
                </div>
                {detailPO.tax_amount > 0 && (
                  <div className="flex justify-between text-[#A1AEBB]">
                    <span>GST Tax</span>
                    <span className="font-mono text-[#F8FAFC]">
                      {formatMoney(detailPO.tax_amount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between font-bold text-sm pt-1.5 border-t border-white/[0.08]">
                  <span className="text-[#F8FAFC]">Total PO Value</span>
                  <span className="font-mono text-[#6EE7B7]">
                    {formatMoney(detailPO.total_amount)}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => handleSendWhatsApp(detailPO)}
                  className="liquid-btn-secondary px-3.5 py-2 rounded-xl text-xs font-semibold text-[#6EE7B7] inline-flex items-center gap-1.5"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>WhatsApp Indent</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = detailPO;
                    setDetailPO(null);
                    setPrintPO(target);
                  }}
                  className="liquid-btn-secondary px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5 text-[#7DD3FC]" />
                  <span>Print Indent</span>
                </button>
                {detailPO.status !== "COMPLETED" && detailPO.status !== "CANCELLED" && (
                  <button
                    type="button"
                    onClick={() => {
                      const target = detailPO;
                      setDetailPO(null);
                      openReceiveModal(target);
                    }}
                    className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
                  >
                    <PackageCheck className="w-4 h-4" />
                    <span>Receive Stock</span>
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Post-Creation Supplier Transmission Modal (Portalled) */}
      {transmittedPO &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="liquid-modal max-w-lg w-full p-6 text-[#F8FAFC] space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#6EE7B7]/15 border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <CheckCircle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">Purchase Order Created</h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Order Ref:{" "}
                      <span className="font-mono font-bold text-[#6EE7B7]">
                        {transmittedPO.po_number}
                      </span>
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTransmittedPO(null)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close transmission modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="p-3.5 rounded-xl bg-[#5EEAD4]/[0.08] border border-[#5EEAD4]/25 flex justify-between items-center text-xs">
                <div>
                  <p className="text-[#F8FAFC] font-bold">{transmittedPO.supplier_name}</p>
                  <p className="text-[11px] text-[#6EE7B7]">
                    {transmittedPO.items.length} product line(s) ordered
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="text-[10.5px] text-[#A1AEBB]">Order Value</p>
                  <p className="text-base font-mono font-extrabold text-[#6EE7B7]">
                    {formatMoney(transmittedPO.total_amount)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold text-[#A1AEBB]">
                  Transmit order directly to distributor sales representative:
                </p>

                {/* Channel 1: WhatsApp */}
                <div className="p-3.5 rounded-xl border border-[#5EEAD4]/30 bg-[#080B10]/55 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-[#F8FAFC]">
                      <MessageCircle className="w-4 h-4 text-[#6EE7B7]" />
                      <span>WhatsApp Direct Indent</span>
                    </div>
                    <span className="text-[9.5px] bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#6EE7B7]/35 px-2 py-0.5 rounded-md font-bold uppercase tracking-wider">
                      Fastest
                    </span>
                  </div>

                  <div>
                    <label className="block text-[10.5px] uppercase tracking-wider font-semibold text-[#A1AEBB] mb-1">
                      Supplier / Rep Mobile Number
                    </label>
                    <input
                      type="tel"
                      placeholder="+91 98450 12345 (blank picks contact in WhatsApp)"
                      value={supplierPhoneInput}
                      onChange={(e) => setSupplierPhoneInput(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 font-mono focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleSendWhatsApp(transmittedPO, supplierPhoneInput)}
                    className="w-full py-2.5 px-3 liquid-btn-primary rounded-xl font-bold text-xs flex items-center justify-center gap-2"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Transmit Indent via WhatsApp</span>
                  </button>
                </div>

                {/* Channel 2: Email */}
                <div className="p-3.5 rounded-xl border border-white/[0.1] bg-[#080B10]/45 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-[#F8FAFC]">
                    <Mail className="w-4 h-4 text-[#7DD3FC]" />
                    <span>Email Purchase Order</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      placeholder="distributor.orders@agency.com"
                      value={supplierEmailInput}
                      onChange={(e) => setSupplierEmailInput(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendEmail(transmittedPO, supplierEmailInput)}
                      className="liquid-btn-secondary px-3.5 py-2 text-xs font-bold rounded-xl text-[#7DD3FC] flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </div>
                </div>

                {/* Channel 3: Print & Copy */}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintPO(transmittedPO);
                      setTransmittedPO(null);
                    }}
                    className="flex-1 py-2 px-3 liquid-btn-secondary rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#7DD3FC]" />
                    <span>Print Formal Indent</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyMessage(transmittedPO)}
                    className="px-3.5 py-2 liquid-btn-secondary rounded-xl text-xs font-semibold flex items-center gap-1.5"
                  >
                    {copiedText ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-[#6EE7B7]" />
                        <span className="text-[#6EE7B7]">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-[#A1AEBB]" />
                        <span>Copy Text</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => setShowTextPreview(!showTextPreview)}
                    className="text-[11px] text-[#7DD3FC] hover:underline"
                  >
                    {showTextPreview ? "Hide Message Preview" : "Show Formatted Indent Preview"}
                  </button>

                  {showTextPreview && (
                    <pre className="mt-2 p-3 rounded-xl bg-[#080B10] text-[#F8FAFC]/90 text-[10.5px] whitespace-pre-wrap font-mono max-h-44 overflow-y-auto border border-white/[0.12]">
                      {getIndentMessage(transmittedPO)}
                    </pre>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-white/[0.08] flex justify-end">
                <button
                  type="button"
                  onClick={() => setTransmittedPO(null)}
                  className="liquid-btn-secondary px-5 py-2 rounded-xl text-xs font-semibold"
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Formal Printable Purchase Order Sheet Modal (Portalled) */}
      {printPO &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/85 backdrop-blur-md p-4 overflow-y-auto">
            <div className="liquid-modal max-w-3xl w-full max-h-[94vh] flex flex-col overflow-hidden">
              {/* Modal action bar (hidden during print) */}
              <div className="no-print px-5 py-3.5 border-b border-white/[0.1] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <FileText className="w-4 h-4 text-[#6EE7B7]" />
                  <span className="font-mono font-bold text-xs text-[#F8FAFC] uppercase tracking-wider">
                    Purchase Order Indent: {printPO.po_number}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="liquid-btn-primary px-3.5 py-1.5 text-xs font-bold rounded-xl flex items-center gap-1.5"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Document</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendWhatsApp(printPO)}
                    className="liquid-btn-secondary px-3 py-1.5 text-xs font-semibold rounded-xl text-[#6EE7B7] flex items-center gap-1.5"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintPO(null)}
                    className="p-1.5 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                    aria-label="Close PO print preview"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Printable Letterhead (explicit hex styling avoids dark-mode CSS overrides) */}
              <div className="overflow-y-auto p-4 sm:p-5 bg-[#080B10]/40">
                <div
                  id="printable-purchase-order"
                  className="p-7 sm:p-8 text-[#0F172A] bg-[#FFFFFF] rounded-xl shadow-xl space-y-6"
                >
                  {/* Header */}
                  <div className="flex justify-between items-start border-b-2 border-[#0F172A] pb-4">
                    <div>
                      <h1 className="text-xl font-black text-[#0F172A] tracking-tight">
                        {business?.name || "SmartStock Retail Store"}
                      </h1>
                      <p className="text-xs text-[#475569] mt-1">
                        {business?.address_line ? `${business.address_line}, ` : ""}
                        {business?.city || "Haveri"}, {business?.district || "Haveri"},{" "}
                        {business?.state || "Karnataka"} - {business?.pincode || "581110"}
                      </p>
                      <p className="text-xs text-[#475569]">
                        Phone:{" "}
                        <span className="font-semibold">
                          {business?.phone || "+91 98450 XXXXX"}
                        </span>
                        {business?.gstin && (
                          <span>
                            {" "}
                            • GSTIN:{" "}
                            <span className="font-mono font-semibold">{business.gstin}</span>
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="text-right">
                      <div className="inline-block bg-[#0F172A] text-[#FFFFFF] font-black px-3 py-1 rounded text-xs tracking-wider uppercase mb-1">
                        Purchase Order
                      </div>
                      <p className="text-xs font-mono font-bold text-[#1E293B]">
                        PO #: {printPO.po_number}
                      </p>
                      <p className="text-xs text-[#475569]">
                        Date: {printPO.order_date || toLocalISODate(new Date())}
                      </p>
                      <p className="text-xs text-[#475569]">
                        Status: <span className="font-bold">{printPO.status}</span>
                      </p>
                    </div>
                  </div>

                  {/* Vendor & Delivery Info */}
                  <div className="grid grid-cols-2 gap-6 p-3.5 bg-[#F8FAFC] rounded-lg border border-[#CBD5E1] text-xs">
                    <div>
                      <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
                        Supplier / Vendor Details
                      </p>
                      <p className="font-bold text-sm text-[#0F172A]">{printPO.supplier_name}</p>
                      {(() => {
                        const sup = suppliers.find((s) => s.id === printPO.supplier_id);
                        return (
                          <>
                            {(printPO.supplier_phone || sup?.phone) && (
                              <p className="text-[#475569] mt-0.5">
                                Phone: {printPO.supplier_phone || sup?.phone}
                              </p>
                            )}
                            {(printPO.supplier_email || sup?.email) && (
                              <p className="text-[#475569]">
                                Email: {printPO.supplier_email || sup?.email}
                              </p>
                            )}
                            {sup?.gstin && (
                              <p className="text-[#475569] font-mono">GSTIN: {sup.gstin}</p>
                            )}
                            {sup?.address && <p className="text-[#475569]">{sup.address}</p>}
                          </>
                        );
                      })()}
                    </div>

                    <div>
                      <p className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider mb-1">
                        Delivery Destination / Ship To
                      </p>
                      <p className="font-bold text-sm text-[#0F172A]">
                        {business?.name || "SmartStock Retail Store"}
                      </p>
                      <p className="text-[#475569] mt-0.5">
                        {business?.address_line ? `${business.address_line}, ` : ""}
                        {business?.city || "Haveri"} - {business?.pincode || "581110"}
                      </p>
                      <p className="text-[#475569]">
                        Contact: {business?.phone || "+91 98450 XXXXX"}
                      </p>
                      <p className="text-[#475569]">
                        Expected Delivery:{" "}
                        <span className="font-semibold">
                          {printPO.expected_delivery_date || "Standard Lead Time"}
                        </span>
                      </p>
                    </div>
                  </div>

                  {/* Line Items */}
                  <div className="border border-[#CBD5E1] rounded-lg overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#F1F5F9] text-[#334155] font-bold border-b border-[#CBD5E1]">
                        <tr>
                          <th className="p-2.5 text-center w-10">#</th>
                          <th className="p-2.5">Item Description</th>
                          <th className="p-2.5 text-right w-20">Qty</th>
                          <th className="p-2.5 text-right w-24">Rate</th>
                          <th className="p-2.5 text-right w-16">GST</th>
                          <th className="p-2.5 text-right w-28">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8F0]">
                        {printPO.items.map((item, idx) => (
                          <tr key={item.id || idx}>
                            <td className="p-2.5 text-center text-[#64748B]">{idx + 1}</td>
                            <td className="p-2.5 font-medium">
                              <span className="font-bold text-[#0F172A]">{item.product_name}</span>
                              {item.unit && (
                                <span className="text-[#64748B] ml-1">({item.unit})</span>
                              )}
                            </td>
                            <td className="p-2.5 text-right font-bold">{item.quantity_ordered}</td>
                            <td className="p-2.5 text-right font-mono">
                              ₹{item.unit_cost.toFixed(2)}
                            </td>
                            <td className="p-2.5 text-right font-mono text-[#64748B]">
                              {item.tax_rate_percent || 0}%
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold">
                              ₹{item.total_cost.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-[#F8FAFC] border-t-2 border-[#CBD5E1] text-xs font-bold">
                        {printPO.tax_amount > 0 && (
                          <tr className="border-b border-[#E2E8F0] font-normal text-[#475569]">
                            <td colSpan={4} className="p-2 text-right">
                              Subtotal: ₹{printPO.subtotal.toFixed(2)}
                            </td>
                            <td className="p-2 text-right">Tax:</td>
                            <td className="p-2 text-right font-mono">
                              ₹{printPO.tax_amount.toFixed(2)}
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td colSpan={2} className="p-2.5 text-right text-[#475569]">
                            Items: {printPO.items.length}
                          </td>
                          <td className="p-2.5 text-right">
                            {printPO.items.reduce((sum, item) => sum + item.quantity_ordered, 0)}
                          </td>
                          <td colSpan={2} className="p-2.5 text-right text-[#475569]">
                            Total PO Value:
                          </td>
                          <td className="p-2.5 text-right font-mono text-sm text-[#065F46]">
                            ₹{printPO.total_amount.toFixed(2)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Instructions & Signature */}
                  <div className="grid grid-cols-2 gap-6 pt-3 items-end">
                    <div className="text-xs text-[#475569] space-y-1">
                      <p className="font-bold text-[#1E293B]">Terms &amp; Delivery Instructions:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                        <li>Please deliver goods in sound sealed packaging.</li>
                        <li>Mention batch numbers &amp; expiry dates on Delivery Challan.</li>
                        <li>
                          Quote PO Number{" "}
                          <span className="font-mono font-bold text-[#0F172A]">
                            {printPO.po_number}
                          </span>{" "}
                          on all invoices.
                        </li>
                      </ul>
                    </div>

                    <div className="text-right space-y-8">
                      <p className="text-xs font-bold text-[#0F172A]">
                        For {business?.name || "SmartStock Retail Store"}
                      </p>
                      <div className="border-t border-[#94A3B8] inline-block pt-1 min-w-[180px] text-center">
                        <p className="text-[11px] text-[#475569] font-semibold">
                          Authorized Signatory
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* New Purchase Order Modal (Portalled) */}
      {isNewOrderModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="liquid-modal max-w-2xl w-full p-6 text-[#F8FAFC] space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <Truck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">Create Purchase Order</h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Select supplier, add line items &amp; GST rates, then transmit via WhatsApp.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsNewOrderModalOpen(false)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close create PO modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {createError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/15 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <form onSubmit={handleCreatePO} className="space-y-4 text-xs">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB]">
                      Select Supplier *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setQuickSupplierError(null);
                        setIsQuickSupplierOpen(true);
                      }}
                      className="text-[11px] text-[#6EE7B7] hover:underline flex items-center gap-1 font-semibold"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Quick Add Supplier</span>
                    </button>
                  </div>

                  {suppliers.length === 0 ? (
                    <div className="p-3 bg-[#FBBF24]/12 border border-[#FBBF24]/35 rounded-xl text-[#FBBF24] text-xs flex items-center justify-between">
                      <span>No wholesale suppliers registered yet.</span>
                      <button
                        type="button"
                        onClick={() => {
                          setQuickSupplierError(null);
                          setIsQuickSupplierOpen(true);
                        }}
                        className="liquid-btn-primary px-3 py-1.5 rounded-lg text-[11px] font-bold"
                      >
                        + Add Supplier Now
                      </button>
                    </div>
                  ) : (
                    <select
                      required
                      value={selectedSupplierId || ""}
                      onChange={(e) => handleSelectSupplierInCreate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4]"
                    >
                      <option value="" className="bg-[#111722] text-[#F8FAFC]">
                        -- Choose Supplier --
                      </option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id} className="bg-[#111722] text-[#F8FAFC]">
                          {s.name} {s.phone ? `(${s.phone})` : ""} · Lead {s.lead_time_days}d · Net{" "}
                          {s.payment_terms_days}d
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      Order Date
                    </label>
                    <input
                      type="date"
                      value={orderDate}
                      onChange={(e) => setOrderDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] tabular-nums [color-scheme:dark] focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      Expected Delivery (ETA)
                    </label>
                    <input
                      type="date"
                      value={expectedDeliveryDate}
                      onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] tabular-nums [color-scheme:dark] focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB]">
                      Order Line Items ({orderItems.length})
                    </span>
                    <button
                      type="button"
                      onClick={handleAddOrderItem}
                      className="text-[#6EE7B7] font-semibold hover:underline flex items-center gap-1 text-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Item</span>
                    </button>
                  </div>

                  {products.length === 0 ? (
                    <div className="p-3 rounded-xl border border-dashed border-white/[0.15] text-center text-[#A1AEBB]">
                      Add products in Products &amp; Categories before raising a PO.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="hidden sm:grid sm:grid-cols-[1fr_76px_92px_68px_28px] gap-2 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#A1AEBB]/80">
                        <span>Product</span>
                        <span className="text-right">Qty</span>
                        <span className="text-right">Cost ₹</span>
                        <span className="text-right">GST</span>
                        <span />
                      </div>
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {orderItems.map((item, idx) => {
                          const lineVal =
                            (Number(item.quantity) || 0) *
                            (Number(item.cost) || 0) *
                            (1 + (Number(item.tax_rate_percent) || 0) / 100);
                          return (
                            <div
                              key={idx}
                              className="grid grid-cols-12 sm:grid-cols-[1fr_76px_92px_68px_28px] items-center gap-2 p-2.5 rounded-xl bg-[#080B10]/60 border border-white/[0.1]"
                            >
                              <div className="col-span-12 sm:col-span-1 min-w-0">
                                <select
                                  value={item.product_id}
                                  onChange={(e) => {
                                    const pid = Number(e.target.value);
                                    const prod = products.find((p) => p.id === pid);
                                    const updated = [...orderItems];
                                    updated[idx].product_id = pid;
                                    if (prod) {
                                      updated[idx].cost = prod.purchase_cost;
                                      updated[idx].tax_rate_percent = prod.tax_rate_percent || 0;
                                    }
                                    setOrderItems(updated);
                                  }}
                                  className="w-full px-2.5 py-1.5 rounded-lg border border-white/[0.12] bg-[#111722] text-[#F8FAFC] text-xs focus:outline-none focus:border-[#5EEAD4]"
                                >
                                  {products.map((p) => (
                                    <option key={p.id} value={p.id} className="bg-[#111722] text-[#F8FAFC]">
                                      {p.name} ({p.unit})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="col-span-4 sm:col-span-1">
                                <input
                                  type="number"
                                  step="0.1"
                                  min="0.1"
                                  title="Order quantity"
                                  aria-label="Order quantity"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const updated = [...orderItems];
                                    updated[idx].quantity = Number(e.target.value);
                                    setOrderItems(updated);
                                  }}
                                  className="w-full px-2 py-1.5 rounded-lg border border-white/[0.12] bg-[#080B10]/90 text-[#F8FAFC] text-right font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                                />
                              </div>

                              <div className="col-span-4 sm:col-span-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  title="Unit cost ₹"
                                  aria-label="Unit cost"
                                  value={item.cost}
                                  onChange={(e) => {
                                    const updated = [...orderItems];
                                    updated[idx].cost = Number(e.target.value);
                                    setOrderItems(updated);
                                  }}
                                  className="w-full px-2 py-1.5 rounded-lg border border-white/[0.12] bg-[#080B10]/90 text-[#F8FAFC] text-right font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                                />
                              </div>

                              <div className="col-span-3 sm:col-span-1">
                                <select
                                  value={item.tax_rate_percent}
                                  title="GST rate %"
                                  aria-label="GST rate"
                                  onChange={(e) => {
                                    const updated = [...orderItems];
                                    updated[idx].tax_rate_percent = Number(e.target.value);
                                    setOrderItems(updated);
                                  }}
                                  className="w-full px-1.5 py-1.5 rounded-lg border border-white/[0.12] bg-[#111722] text-[#F8FAFC] text-right font-mono focus:outline-none focus:border-[#5EEAD4]"
                                >
                                  {[0, 5, 12, 18, 28].map((r) => (
                                    <option key={r} value={r} className="bg-[#111722] text-[#F8FAFC]">
                                      {r}%
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div className="col-span-1 flex items-center justify-end">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setOrderItems(orderItems.filter((_, i) => i !== idx))
                                  }
                                  title="Remove item"
                                  className="p-1 text-[#A1AEBB] hover:text-[#FB7185] transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>

                              <div className="col-span-12 sm:col-span-full flex justify-between text-[10px] text-[#A1AEBB] px-0.5 tabular-nums">
                                <span>Qty × Unit ₹ × (1 + GST%)</span>
                                <span className="font-mono text-[#7DD3FC]">
                                  Line: {formatMoney(lineVal)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                    Order Notes / Delivery Instructions (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Morning delivery before 10 AM, fresh batch preferred"
                    value={poNotes}
                    onChange={(e) => setPoNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                {orderItems.length > 0 && (
                  <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] space-y-1 text-xs tabular-nums">
                    <div className="flex justify-between text-[#A1AEBB]">
                      <span>Subtotal ({orderItems.length} lines)</span>
                      <span className="font-mono text-[#F8FAFC]">
                        {formatMoney(draftTotals.subtotal)}
                      </span>
                    </div>
                    {draftTotals.tax > 0 && (
                      <div className="flex justify-between text-[#A1AEBB]">
                        <span>Estimated GST</span>
                        <span className="font-mono text-[#F8FAFC]">
                          {formatMoney(draftTotals.tax)}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between items-center pt-1.5 border-t border-white/[0.08] font-bold">
                      <span className="text-[#F8FAFC]">Total Order Value</span>
                      <span className="font-mono text-sm text-[#6EE7B7]">
                        {formatMoney(draftTotals.grandTotal)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="pt-3 flex justify-end gap-2.5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setIsNewOrderModalOpen(false)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSubmitting || suppliers.length === 0 || orderItems.length === 0}
                    className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {createSubmitting ? "Creating..." : "Create & Transmit Order"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Receive Partial / Full Delivery Modal (Portalled) */}
      {receivingPO &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4 overflow-y-auto">
            <div className="liquid-modal max-w-2xl w-full p-6 text-[#F8FAFC] space-y-4 max-h-[92vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#7DD3FC]/40 text-[#7DD3FC] flex items-center justify-center shrink-0">
                    <PackageCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">
                      Receive Goods (GRN): {receivingPO.po_number}
                    </h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Supplier: <strong className="text-[#F8FAFC]">{receivingPO.supplier_name}</strong>
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={fillAllPendingReceive}
                    className="px-2.5 py-1 rounded-lg text-[10.5px] font-semibold bg-[#6EE7B7]/12 text-[#6EE7B7] border border-[#6EE7B7]/30 hover:bg-[#6EE7B7]/20"
                  >
                    Fill All Pending
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceivingPO(null)}
                    className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                    aria-label="Close receive PO modal"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {receiveError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/15 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{receiveError}</span>
                </div>
              )}

              <form onSubmit={handleReceiveSubmit} className="space-y-4 text-xs">
                <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                  {receivingPO.items.map((item) => {
                    const pending = Math.max(
                      0,
                      Number((item.quantity_ordered - item.quantity_received).toFixed(3))
                    );
                    return (
                      <div
                        key={item.id}
                        className="p-3.5 rounded-xl border border-white/[0.1] bg-[#080B10]/55 space-y-2.5"
                      >
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <span className="font-bold text-[#F8FAFC]">{item.product_name}</span>
                          <span className="text-[11px] text-[#A1AEBB] font-mono tabular-nums">
                            Ord: {item.quantity_ordered} • Rec: {item.quantity_received} •{" "}
                            <strong className="text-[#FBBF24]">Pending: {pending}</strong>
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-[#A1AEBB] mb-1">
                              Receive Qty Now
                            </label>
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              max={pending}
                              value={receiveInputs[item.id]?.qty ?? 0}
                              onChange={(e) => {
                                setReceiveInputs({
                                  ...receiveInputs,
                                  [item.id]: {
                                    ...receiveInputs[item.id],
                                    qty: Number(e.target.value),
                                  },
                                });
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-white/[0.14] bg-[#080B10]/90 text-[#F8FAFC] text-right font-mono font-bold tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-[#A1AEBB] mb-1">
                              Batch / Lot No.
                            </label>
                            <input
                              type="text"
                              placeholder="Optional batch #"
                              value={receiveInputs[item.id]?.batch || ""}
                              onChange={(e) => {
                                setReceiveInputs({
                                  ...receiveInputs,
                                  [item.id]: {
                                    ...receiveInputs[item.id],
                                    batch: e.target.value,
                                  },
                                });
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-white/[0.14] bg-[#080B10]/90 text-[#F8FAFC] placeholder-[#A1AEBB]/50 font-mono focus:outline-none focus:border-[#5EEAD4]"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] uppercase tracking-wider text-[#A1AEBB] mb-1">
                              Expiry Date
                            </label>
                            <input
                              type="date"
                              value={receiveInputs[item.id]?.expiry || ""}
                              onChange={(e) => {
                                setReceiveInputs({
                                  ...receiveInputs,
                                  [item.id]: {
                                    ...receiveInputs[item.id],
                                    expiry: e.target.value,
                                  },
                                });
                              }}
                              className="w-full px-2.5 py-1.5 rounded-lg border border-white/[0.14] bg-[#080B10]/90 text-[#F8FAFC] tabular-nums [color-scheme:dark] focus:outline-none focus:border-[#5EEAD4]"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                    Receiving Receipt Notes / Challan Reference
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Delivery challan #9983, verified sealed packaging"
                    value={receiveNotes}
                    onChange={(e) => setReceiveNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="pt-3 flex justify-end gap-2.5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setReceivingPO(null)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={receiveSubmitting}
                    className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {receiveSubmitting ? "Posting GRN..." : "Confirm & Update Stock"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Quick Add Supplier Modal (Portalled) */}
      {isQuickSupplierOpen &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#080B10]/85 backdrop-blur-md p-4">
            <div className="liquid-modal max-w-sm w-full p-6 text-[#F8FAFC] space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div>
                  <h3 className="text-sm font-bold text-[#F8FAFC]">Quick Add Supplier</h3>
                  <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                    Register vendor to assign immediately to this PO.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsQuickSupplierOpen(false)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close quick add supplier"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {quickSupplierError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/15 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{quickSupplierError}</span>
                </div>
              )}

              <form onSubmit={handleQuickAddSupplier} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                    Supplier / Firm Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Haveri FMCG Distributors"
                    value={quickSupplierName}
                    onChange={(e) => setQuickSupplierName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      Phone (WhatsApp)
                    </label>
                    <input
                      type="tel"
                      placeholder="9845012345"
                      value={quickSupplierPhone}
                      onChange={(e) => setQuickSupplierPhone(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 font-mono focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                      Lead Time (Days)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="60"
                      value={quickSupplierLeadTime}
                      onChange={(e) => setQuickSupplierLeadTime(parseInt(e.target.value) || 3)}
                      className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1">
                    GSTIN (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="29AAAAA0000A1Z5"
                    value={quickSupplierGstin}
                    onChange={(e) => setQuickSupplierGstin(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] placeholder-[#A1AEBB]/50 font-mono uppercase focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="flex justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setIsQuickSupplierOpen(false)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={quickSupplierSaving || !quickSupplierName.trim()}
                    className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {quickSupplierSaving ? "Saving..." : "Save & Select"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
