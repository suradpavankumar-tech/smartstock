import React, { useState, useEffect, useRef } from "react";
import {
  Search, Barcode, Plus, Minus, Trash2, Printer, CheckCircle,
  CreditCard, QrCode, User, Phone, AlertCircle, MessageCircle,
  Layers, X, Camera, Edit2, Smartphone, Sparkles
} from "lucide-react";
import { api } from "../services/api";
import { Product, Invoice, PaymentMethod, Business, CashShift } from "../types";
import { useLanguage } from "../context/LanguageContext";
import { PrintableReceipt } from "../components/common/PrintableReceipt";
import { announcePayment } from "../utils/soundbox";
import { buildWhatsAppUrl, openWhatsAppUrl, buildInvoiceWhatsAppMessage } from "../utils/whatsapp";
import { qrCodeSvgDataUrl } from "../utils/qrCode";
import { DayEndReportModal } from "../components/DayEndReportModal";
import { CameraBarcodeScannerModal } from "../components/common/CameraBarcodeScannerModal";
import { KannadaText } from "../components/common/KannadaText";

interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  requested_value?: number;
}

export const POSPage: React.FC = () => {
  const { t, language, formatMoney, tData } = useLanguage();
  const [business, setBusiness] = useState<Business | null>(null);
  const [businessLoaded, setBusinessLoaded] = useState(false);
  
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [catalogFilter, setCatalogFilter] = useState<"ALL" | "IN_STOCK" | "LOW_STOCK">("ALL");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [overallDiscount, setOverallDiscount] = useState<number>(0);
  const [notes, setNotes] = useState("");
  const [paidNowAmount, setPaidNowAmount] = useState<string>("0");
  const [upfrontTender, setUpfrontTender] = useState<"CASH" | "UPI">("CASH");
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [completedInvoice, setCompletedInvoice] = useState<Invoice | null>(null);
  const [receiptPhoneInput, setReceiptPhoneInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>({});
  const [valueModeId, setValueModeId] = useState<number | null>(null);
  const [valueAmount, setValueAmount] = useState("");
  const [receiptWidth, setReceiptWidth] = useState<58 | 80>(58);

  const [currentShift, setCurrentShift] = useState<CashShift | null>(null);
  const [closedShiftReport, setClosedShiftReport] = useState<CashShift | null>(null);
  const [showDrawerModal, setShowDrawerModal] = useState(false);
  const [openingFloatInput, setOpeningFloatInput] = useState("2000");
  const [countedCashInput, setCountedCashInput] = useState("");
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState<string | null>(null);

  // Barcode Scanner & Real Owner UPI Modal State
  const [showCameraScanner, setShowCameraScanner] = useState(false);
  const [scannedToast, setScannedToast] = useState<string | null>(null);
  const [showOwnerUpiModal, setShowOwnerUpiModal] = useState(false);
  const [editOwnerPhone, setEditOwnerPhone] = useState("");
  const [editOwnerHandle, setEditOwnerHandle] = useState("@ybl");
  const [savingUpi, setSavingUpi] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Active Owner UPI VPA (defaults to Owner's real mobile number handle)
  const activeOwnerUpi =
    business?.upi_vpa ||
    (business?.phone ? `${business.phone.replace(/\D/g, "").slice(-10)}@ybl` : "9845123456@ybl");

  const handleBarcodeScanSubmit = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return;

    let match = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === q) ||
        (p.sku && p.sku.toLowerCase() === q) ||
        p.name.toLowerCase() === q
    );

    if (!match && filteredProducts.length === 1) {
      match = filteredProducts[0];
    }

    if (match) {
      addToCart(match);
      setSearchQuery("");
      setScannedToast(`Scanned & Added: ${match.name} (₹${match.selling_price.toFixed(2)})`);
      setTimeout(() => setScannedToast(null), 2500);
    } else {
      setErrorMessage(`Barcode "${query}" not found in catalogue`);
      setTimeout(() => setErrorMessage(null), 3500);
    }
  };

  const handleSaveOwnerUpi = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanDigits = editOwnerPhone.replace(/\D/g, "").slice(-10);
    if (cleanDigits.length !== 10) {
      alert("Please enter a valid 10-digit mobile number");
      return;
    }
    const newVpa = `${cleanDigits}${editOwnerHandle}`;
    setSavingUpi(true);
    try {
      if (business) {
        const updated = await api.updateBusinessProfile({ ...business, upi_vpa: newVpa });
        setBusiness(updated);
      }
      setShowOwnerUpiModal(false);
      setScannedToast(`Owner UPI updated to ${newVpa}`);
      setTimeout(() => setScannedToast(null), 3000);
    } catch (err: any) {
      alert(err.message || "Failed to update UPI ID");
    } finally {
      setSavingUpi(false);
    }
  };

  const loadCashShift = async () => {
    try {
      const shift = await api.getCurrentCashShift();
      setCurrentShift(shift);
      if (shift && shift.expected_cash !== undefined) {
        setCountedCashInput(shift.expected_cash.toFixed(2));
      }
    } catch (err) {
      console.error("Failed to load cash shift", err);
    }
  };

  const handleOpenShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const floatVal = parseFloat(openingFloatInput) || 0;
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const shift = await api.openCashShift(floatVal);
      setCurrentShift(shift);
      setCountedCashInput(shift.expected_cash?.toFixed(2) || "");
    } catch (err: any) {
      setDrawerError(err.message || "Failed to open cash drawer shift");
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const countedVal = parseFloat(countedCashInput);
    if (isNaN(countedVal) || countedVal < 0) {
      setDrawerError("Please enter a valid non-negative physical cash count.");
      return;
    }
    setDrawerLoading(true);
    setDrawerError(null);
    try {
      const shift = await api.closeCashShift(countedVal);
      setCurrentShift(null);
      setShowDrawerModal(false);
      setClosedShiftReport(shift);
    } catch (err: any) {
      setDrawerError(err.message || "Failed to close cash drawer shift");
    } finally {
      setDrawerLoading(false);
    }
  };

  // Load products on mount
  useEffect(() => {
    loadProducts();
    loadCashShift();
    api.getBusinessProfile()
      .then((profile) => {
        setBusiness(profile);
        setBusinessLoaded(true);
      })
      .catch((err) => {
        console.error("Failed to load shop receipt settings", err);
        setErrorMessage(t("loadBusinessSettingsForBilling"));
      });

    // Global keyboard shortcut: F2 focuses search input
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadProducts = async () => {
    try {
      const data = await api.getProducts();
      setProducts(data);
    } catch (err: any) {
      console.error("Failed to load products for POS", err);
    }
  };

  // Barcode / Name search filter
  const filteredProducts = products.filter((p) => {
    if (!searchQuery.trim()) return false;
    const q = searchQuery.toLowerCase().trim();
    return (
      p.name.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.toLowerCase().includes(q)) ||
      (p.sku && p.sku.toLowerCase().includes(q))
    );
  });

  const addToCart = (product: Product) => {
    setErrorMessage(null);
    if (product.current_stock <= 0) {
      setErrorMessage(t("outOfStock").replace("{product}", product.name));
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (existing.quantity + 1 > product.current_stock) {
          setErrorMessage(t("addStockLimit").replace("{product}", product.name).replace("{stock}", String(product.current_stock)).replace("{unit}", product.unit));
          return prev;
        }
        return prev.map((item) => item.product.id === product.id
          ? { ...item, quantity: item.quantity + 1, discount_amount: 0, requested_value: undefined }
          : item);
      } else {
        return [...prev, { product, quantity: 1, unit_price: product.selling_price, discount_amount: 0 }];
      }
    });
    setQuantityDrafts((prev) => {
      if (!(product.id in prev)) return prev;
      const next = { ...prev };
      delete next[product.id];
      return next;
    });
    setSearchQuery("");
  };

  const updateQuantity = (productId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty > item.product.current_stock) {
              setErrorMessage(t("quantityExceedsStock").replace("{stock}", String(item.product.current_stock)).replace("{unit}", item.product.unit));
              return item;
            }
            return newQty > 0 ? { ...item, quantity: newQty, discount_amount: 0, requested_value: undefined } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
    setQuantityDrafts((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const setExactQuantity = (productId: number, quantity: number) => {
    const rounded = Math.round(quantity * 1000) / 1000;
    setCart((prev) => prev.map((item) => {
      if (item.product.id !== productId) return item;
      if (!Number.isFinite(rounded) || rounded <= 0) return item;
      if (rounded > item.product.current_stock) {
        setErrorMessage(t("quantityExceedsStock").replace("{stock}", String(item.product.current_stock)).replace("{unit}", item.product.unit));
        return item;
      }
      return { ...item, quantity: rounded, discount_amount: 0, requested_value: undefined };
    }));
  };

  const applyValueAmount = (item: CartItem) => {
    const amount = Math.round(Number(valueAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0 || item.unit_price <= 0) {
      setErrorMessage(t("invalidValueAmount"));
      return;
    }
    // Round quantity upward to 0.001 so the requested amount can be matched with a small line discount.
    const quantity = Math.ceil((amount / item.unit_price) * 1000) / 1000;
    if (quantity > item.product.current_stock) {
      setErrorMessage(t("valueExceedsStock").replace("{quantity}", String(quantity)).replace("{unit}", item.product.unit).replace("{stock}", String(item.product.current_stock)));
      return;
    }
    const gross = Math.round(quantity * item.unit_price * 100) / 100;
    const lineDiscount = Math.max(0, Math.round((gross - amount) * 100) / 100);
    setCart((prev) => prev.map((current) => current.product.id === item.product.id
      ? { ...current, quantity, discount_amount: lineDiscount, requested_value: amount }
      : current));
    setQuantityDrafts((prev) => {
      if (!(item.product.id in prev)) return prev;
      const next = { ...prev };
      delete next[item.product.id];
      return next;
    });
    setValueModeId(null);
    setValueAmount("");
    setErrorMessage(null);
  };

  const removeFromCart = (productId: number) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
    setQuantityDrafts((prev) => {
      if (!(productId in prev)) return prev;
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  // Calculations
  const subtotal = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const lineDiscounts = cart.reduce((sum, item) => sum + item.discount_amount, 0);
  const showTax = !business || business.tax_mode === "REGULAR_GST";
  const totalTax = cart.reduce((sum, item) => {
    if (!showTax) return sum;
    const lineTotal = item.quantity * item.unit_price - item.discount_amount;
    return sum + (lineTotal * item.product.tax_rate_percent) / 100;
  }, 0);
  const grandTotal = Math.max(0, subtotal - overallDiscount - lineDiscounts + totalTax);
  const parsedPaidNow = Math.max(0, Math.min(grandTotal, parseFloat(paidNowAmount) || 0));
  const creditDue = Math.max(0, grandTotal - parsedPaidNow);

  const targetPhone = receiptPhoneInput.trim() || completedInvoice?.customer_phone;
  const whatsappBillUrl = completedInvoice && targetPhone
    ? buildWhatsAppUrl(
        targetPhone,
        buildInvoiceWhatsAppMessage(
          completedInvoice,
          business?.name || "SmartStock Retail",
          business?.phone,
          language === "kn"
        )
      )
    : null;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setIsSubmitting(true);
    setErrorMessage(null);

    if (paymentMethod === "CREDIT" && !customerName.trim() && !customerPhone.trim()) {
      setErrorMessage("Please enter customer name or mobile number for Khata credit billing.");
      setIsSubmitting(false);
      return;
    }

    const idempotency_key = "pos-inv-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8);

    try {
      const extraNote = paymentMethod === "CREDIT" && parsedPaidNow > 0
        ? `Upfront Paid: ₹${parsedPaidNow.toFixed(2)} (${upfrontTender}), Khata Due: ₹${creditDue.toFixed(2)}`
        : "";
      const combinedNotes = [notes.trim(), extraNote].filter(Boolean).join(" • ") || undefined;

      const invoiceData = {
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        payment_method: paymentMethod,
        discount_amount: overallDiscount,
        paid_amount: paymentMethod === "CREDIT" ? parsedPaidNow : grandTotal,
        notes: combinedNotes,
        idempotency_key,
        items: cart.map((item) => ({
          product_id: item.product.id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          discount_amount: item.discount_amount,
        })),
      };

      const result = await api.createInvoice(invoiceData);
      setCompletedInvoice(result);
      setReceiptPhoneInput(result.customer_phone || customerPhone || "");
      if (result.payment_method === "CREDIT") {
        if (parsedPaidNow > 0) {
          announcePayment(parsedPaidNow, upfrontTender);
        }
      } else if (result.payment_method === "CASH" || result.payment_method === "UPI") {
        announcePayment(result.total_amount, result.payment_method);
      }
      setCart([]);
      setQuantityDrafts({});
      setCustomerName("");
      setCustomerPhone("");
      setOverallDiscount(0);
      setPaidNowAmount("0");
      setNotes("");
      loadProducts(); // refresh on-hand stock
      loadCashShift(); // refresh cash register live balance
    } catch (err: any) {
      setErrorMessage(err.message || "Checkout failed. Please verify stock availability.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getQuickWeights = (unit: string) => {
    const normalized = unit.toLowerCase();
    const isKg = normalized === "kg" || normalized === "kilogram" || normalized === "kilograms";
    const isLiter = ["l", "liter", "litre", "liters", "litres"].includes(normalized);
    if (isKg) return [["50g", 0.05], ["100g", 0.1], ["250g", 0.25], ["500g", 0.5], ["1 kg", 1], ["2 kg", 2], ["5 kg", 5]] as [string, number][];
    if (isLiter) return [["50 ml", 0.05], ["100 ml", 0.1], ["250 ml", 0.25], ["500 ml", 0.5], ["1 L", 1], ["2 L", 2], ["5 L", 5]] as [string, number][];
    return [];
  };

  const formatCartQty = (q: number) =>
    Number.isInteger(q) ? String(q) : q.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");

  const inStockCount = products.filter((p) => p.current_stock > 0).length;
  const lowStockCount = products.filter((p) => p.current_stock <= p.reorder_threshold).length;
  const catalogProducts = products.filter((p) => {
    if (catalogFilter === "IN_STOCK") return p.current_stock > 0;
    if (catalogFilter === "LOW_STOCK") return p.current_stock <= p.reorder_threshold;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto">
      {/* Unified Midnight Mist Liquid Glass POS Terminal */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.14)] relative overflow-hidden backdrop-blur-2xl flex flex-col lg:h-[calc(100vh-9.5rem)] min-h-[540px]">
        {/* Ambient diffuse glass highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-gradient-to-br from-[#5EEAD4]/15 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-72 h-72 bg-gradient-to-tl from-[#7DD3FC]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* Terminal Top Architecture Bar */}
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 px-5 sm:px-6 py-3 border-b border-white/[0.08] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_12px_rgba(94,234,212,0.25)] shrink-0">
              <Barcode className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[#6EE7B7] tracking-wider uppercase font-semibold">
                  {t("navPOS")}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[#A1AEBB]">
                  F2 Search
                </span>
              </div>
              <div className="text-[11px] text-[#A1AEBB] truncate max-w-[260px] sm:max-w-md">
                {business?.name || "Retail Billing Terminal"} • Barcode & GST Checkout
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {scannedToast && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#6EE7B7]/12 border border-[#6EE7B7]/35 text-[#6EE7B7] text-xs font-semibold animate-liquid-enter">
                <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{scannedToast}</span>
              </div>
            )}

            {errorMessage && (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs font-medium animate-liquid-enter">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{errorMessage}</span>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="ml-1 text-[#FB7185]/70 hover:text-[#FB7185]"
                  aria-label="Dismiss error"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                loadCashShift();
                setDrawerError(null);
                setShowDrawerModal(true);
              }}
              className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-all active:scale-[0.98] ${
                currentShift
                  ? "bg-[#6EE7B7]/12 border-[#5EEAD4]/40 text-[#6EE7B7] hover:bg-[#6EE7B7]/18 shadow-[0_0_14px_rgba(94,234,212,0.16)]"
                  : "bg-white/[0.05] border-white/[0.14] text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.09]"
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Cash Drawer: {currentShift ? "OPEN" : "CLOSED"}</span>
              {currentShift && (
                <span className="text-[11px] font-mono text-[#F8FAFC]/85 pl-1.5 border-l border-white/[0.14] tabular-nums">
                  ₹{currentShift.expected_cash.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </span>
              )}
              <span className={`w-2 h-2 rounded-full ${currentShift ? "bg-[#6EE7B7] animate-pulse shadow-[0_0_6px_#5EEAD4]" : "bg-[#A1AEBB]/50"}`} />
            </button>
          </div>
        </div>

        {/* Main Cardless Split Terminal: Balanced 6/6 Architectural Columns */}
        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 flex-1 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08]">
          {/* LEFT PANE: Scan & Store Catalogue Matrix */}
          <div className="lg:col-span-6 flex flex-col min-h-0">
            {/* Search & Camera Bar */}
            <div className="px-5 pt-3.5 pb-2.5 border-b border-white/[0.08] space-y-2.5 shrink-0">
              <div className="relative flex gap-2">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#A1AEBB]" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && searchQuery.trim()) {
                        e.preventDefault();
                        handleBarcodeScanSubmit(searchQuery);
                      }
                    }}
                    placeholder="Scan barcode or search product / SKU (Enter to add)..."
                    className="w-full pl-10 pr-9 py-2 text-xs rounded-xl bg-[#080B10]/75 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:border-[#5EEAD4] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A1AEBB] hover:text-[#F8FAFC]"
                      aria-label="Clear search"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowCameraScanner(true)}
                  className="liquid-btn-secondary px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0"
                  title="Scan barcodes and QR codes with your phone or laptop camera"
                >
                  <Camera className="w-4 h-4 text-[#5EEAD4]" />
                  <span className="hidden sm:inline">Scan</span>
                </button>
              </div>

              {/* Search Suggestions Dropdown */}
              {searchQuery.trim() && (
                <div className="max-h-52 overflow-y-auto divide-y divide-white/[0.06] border border-[#5EEAD4]/30 rounded-2xl bg-[#111722]/95 backdrop-blur-2xl shadow-[0_18px_45px_rgba(0,0,0,0.85)]">
                  {filteredProducts.length === 0 ? (
                    <div className="p-3.5 text-center text-xs text-[#A1AEBB]">
                      No matching products found for "{searchQuery}"
                    </div>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => addToCart(p)}
                        className="w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between hover:bg-[#5EEAD4]/[0.08] transition-colors"
                      >
                        <div className="min-w-0 pr-3">
                          <div className="font-semibold text-[#F8FAFC] truncate">
                            <KannadaText text={p.name} />
                          </div>
                          <div className="text-[10px] text-[#A1AEBB] font-mono">
                            SKU: {p.sku || "-"} • Barcode: {p.barcode || "-"}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-[#6EE7B7] tabular-nums">
                            {formatMoney(p.selling_price)}
                          </div>
                          <div
                            className={`text-[10px] font-medium tabular-nums ${
                              p.current_stock <= 0
                                ? "text-[#FB7185]"
                                : p.current_stock <= p.reorder_threshold
                                ? "text-[#FBBF24]"
                                : "text-[#A1AEBB]"
                            }`}
                          >
                            {language === "kn" ? "ದಾಸ್ತಾನು:" : "Stock:"} {p.current_stock} <KannadaText text={p.unit} />
                          </div>
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}

              {/* Catalogue Filter Strip */}
              <div className="flex items-center justify-between gap-3 pt-0.5">
                <div className="flex items-center gap-4 text-[11px] font-semibold">
                  {(
                    [
                      { key: "ALL", label: `All (${products.length})` },
                      { key: "IN_STOCK", label: `In Stock (${inStockCount})` },
                      { key: "LOW_STOCK", label: `Low / Out (${lowStockCount})` },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setCatalogFilter(tab.key)}
                      className={`pb-1.5 relative transition-all ${
                        catalogFilter === tab.key
                          ? "text-[#F8FAFC] font-bold"
                          : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                      }`}
                    >
                      {tab.label}
                      {catalogFilter === tab.key && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6EE7B7] rounded-full shadow-[0_0_8px_#5EEAD4]" />
                      )}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] text-[#A1AEBB] hidden sm:inline">
                  Tap item to bill
                </span>
              </div>
            </div>

            {/* Hairline-Ruled 2-Column Catalogue Matrix (Full Legible Names) */}
            <div className="flex-1 overflow-y-auto bg-[#080B10]/25">
              {catalogProducts.length === 0 ? (
                <div className="h-full flex items-center justify-center p-8 text-xs text-[#A1AEBB]">
                  No products match this stock filter.
                </div>
              ) : (
                <div className="grid grid-cols-2 xl:grid-cols-2 border-b border-white/[0.06]">
                  {catalogProducts.map((p) => {
                    const isOutOfStock = p.current_stock <= 0;
                    const isLowStock = !isOutOfStock && p.current_stock <= p.reorder_threshold;
                    const inCart = cart.find((c) => c.product.id === p.id);
                    const formattedCartQty = inCart
                      ? formatCartQty(inCart.quantity)
                      : null;

                    return (
                      <button
                        key={p.id}
                        type="button"
                        disabled={isOutOfStock}
                        onClick={() => addToCart(p)}
                        style={{
                          boxShadow: inCart
                            ? "inset 2px 0 0 0 #5EEAD4, inset -1px -1px 0 0 rgba(255, 255, 255, 0.06)"
                            : "inset -1px -1px 0 0 rgba(255, 255, 255, 0.06)",
                        }}
                        className={`px-4 py-2.5 text-left flex flex-col justify-between min-h-[76px] transition-all relative ${
                          isOutOfStock
                            ? "opacity-40 cursor-not-allowed bg-[#080B10]/40"
                            : inCart
                            ? "bg-[#5EEAD4]/[0.07] hover:bg-[#5EEAD4]/[0.12] active:scale-[0.99]"
                            : "hover:bg-white/[0.04] active:scale-[0.99]"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-[#F8FAFC] leading-snug line-clamp-2">
                              <KannadaText text={p.name} />
                            </div>
                            <div className="text-[10px] text-[#A1AEBB] mt-0.5 truncate font-mono">
                              <KannadaText text={p.unit} />
                              {p.sku ? ` • ${p.sku}` : ""}
                            </div>
                          </div>

                          {formattedCartQty && (
                            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-[#6EE7B7]/18 text-[#6EE7B7] border border-[#5EEAD4]/40 tabular-nums shrink-0">
                              ×{formattedCartQty}
                            </span>
                          )}
                        </div>

                        <div className="mt-2.5 flex items-baseline justify-between gap-2">
                          <span className="text-sm font-bold text-[#6EE7B7] tabular-nums">
                            {formatMoney(p.selling_price)}
                          </span>
                          <span
                            className={`text-[10px] font-medium tabular-nums ${
                              isOutOfStock
                                ? "text-[#FB7185]"
                                : isLowStock
                                ? "text-[#FBBF24]"
                                : "text-[#A1AEBB]"
                            }`}
                          >
                            {isOutOfStock ? "Out of stock" : `${p.current_stock} avail`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT PANE: Executive Order Cart & Settlement */}
          <div className="lg:col-span-6 flex flex-col min-h-0 bg-[#080B10]/25">
            {/* Cart Header + Integrated Roll Width Control */}
            <div className="px-5 py-2.5 border-b border-white/[0.08] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB] shrink-0">
                  {t("cart")}
                </span>
                <span className="text-white/20">•</span>
                <span className="text-xs font-semibold text-[#F8FAFC] tabular-nums truncate">
                  {cart.length === 0
                    ? "Empty bill"
                    : `${cart.length} ${cart.length === 1 ? "item" : "items"} (${formatCartQty(
                        cart.reduce((s, i) => s + i.quantity, 0)
                      )} qty)`}
                </span>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {/* Thermal Receipt Roll Size */}
                <div
                  className="inline-flex items-center gap-1.5"
                  aria-label={t("receiptWidth")}
                  title={t("receiptWidth")}
                >
                  <span className="text-[10px] text-[#A1AEBB] hidden sm:inline">Roll:</span>
                  <div className="inline-flex p-0.5 rounded-lg bg-[#080B10]/70 border border-white/[0.1] gap-0.5">
                    {([58, 80] as const).map((width) => (
                      <button
                        key={width}
                        type="button"
                        onClick={() => setReceiptWidth(width)}
                        className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-colors ${
                          receiptWidth === width
                            ? "bg-white/[0.14] text-[#F8FAFC]"
                            : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                        }`}
                      >
                        {width === 58 ? t("roll58") : t("roll80")}
                      </button>
                    ))}
                  </div>
                </div>

                {cart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setCart([]);
                      setQuantityDrafts({});
                      setValueModeId(null);
                    }}
                    className="text-[11px] font-medium text-[#A1AEBB] hover:text-[#FB7185] flex items-center gap-1 pl-2.5 border-l border-white/[0.1] transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Clear</span>
                  </button>
                )}
              </div>
            </div>

            {/* Cart Line Items Ledger */}
            <div className="flex-1 overflow-y-auto divide-y divide-white/[0.06] min-h-[120px]">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-[#A1AEBB] space-y-2.5">
                  <div className="w-10 h-10 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-[#5EEAD4]/60 shadow-[0_0_20px_rgba(94,234,212,0.08)]">
                    <Barcode className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-[#F8FAFC]/90">Ready for Next Sale</div>
                    <div className="text-[11px] text-[#A1AEBB]/75 max-w-[260px] leading-relaxed">
                      {t("cartEmpty")}
                    </div>
                  </div>
                </div>
              ) : (
                cart.map((item, idx) => {
                  const presets = getQuickWeights(item.product.unit);
                  const lineAmount = Math.max(0, item.quantity * item.unit_price - item.discount_amount);
                  const isValueEditing = valueModeId === item.product.id;

                  return (
                    <div
                      key={item.product.id}
                      className="px-5 py-2.5 border-l-2 border-l-transparent hover:border-l-[#5EEAD4]/75 hover:bg-white/[0.025] transition-all group"
                    >
                      {/* Row 1: Line Index + Full Product Title + Tabular Line Total + Remove */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-baseline gap-2.5 min-w-0 flex-1">
                          <span className="w-4 text-[10px] font-mono text-[#A1AEBB]/45 tabular-nums shrink-0">
                            {String(idx + 1).padStart(2, "0")}
                          </span>
                          <div className="text-[13px] font-semibold text-[#F8FAFC] leading-snug">
                            <KannadaText text={item.product.name} />
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[13px] font-bold text-[#F8FAFC] tabular-nums">
                            {formatMoney(lineAmount)}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeFromCart(item.product.id)}
                            className="p-0.5 text-[#A1AEBB]/45 hover:text-[#FB7185] transition-colors"
                            aria-label="Remove item from cart"
                            title="Remove line item"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Row 2: Unit Price / Tax Metadata + Value Toggle + Precision Stepper */}
                      <div className="mt-1.5 pl-[26px] flex items-center justify-between gap-2">
                        <div className="text-[11px] text-[#A1AEBB] tabular-nums flex flex-wrap items-center gap-1.5">
                          <span>
                            {formatMoney(item.unit_price)} / <KannadaText text={item.product.unit} />
                          </span>
                          {showTax && (
                            <span className="text-[10px] text-[#A1AEBB]/65 px-1.5 py-px rounded bg-white/[0.04]">
                              GST {item.product.tax_rate_percent}%
                            </span>
                          )}
                          {item.requested_value !== undefined && (
                            <span className="px-1.5 py-px rounded bg-[#6EE7B7]/14 text-[#6EE7B7] font-medium text-[10px]">
                              {t("valueSaleLabel").replace("{amount}", formatMoney(item.requested_value))}
                            </span>
                          )}
                          {presets.length === 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                setValueModeId(isValueEditing ? null : item.product.id);
                                setValueAmount(item.requested_value?.toString() || "");
                              }}
                              className={`px-1.5 py-px text-[10px] font-medium rounded border transition-colors ${
                                isValueEditing
                                  ? "bg-[#7DD3FC]/15 border-[#7DD3FC]/40 text-[#7DD3FC]"
                                  : "bg-white/[0.03] border-white/[0.1] text-[#A1AEBB] hover:text-[#6EE7B7] hover:border-[#5EEAD4]/40"
                              }`}
                            >
                              {t("sellByValue")}
                            </button>
                          )}
                        </div>

                        {/* Precision Quantity Stepper Capsule */}
                        <div className="inline-flex items-center h-6 rounded-lg bg-[#080B10]/85 border border-white/[0.12] focus-within:border-[#5EEAD4] focus-within:ring-1 focus-within:ring-[#5EEAD4]/25 transition-all overflow-hidden shrink-0">
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, -1)}
                            className="w-6 h-full flex items-center justify-center text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.08] transition-colors"
                            aria-label="Decrease quantity"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min="0.001"
                            step="0.001"
                            value={quantityDrafts[item.product.id] ?? formatCartQty(item.quantity)}
                            onChange={(e) =>
                              setQuantityDrafts((prev) => ({ ...prev, [item.product.id]: e.target.value }))
                            }
                            onBlur={(e) => {
                              const value = Number(e.target.value);
                              if (value > 0) setExactQuantity(item.product.id, value);
                              setQuantityDrafts((prev) => {
                                if (!(item.product.id in prev)) return prev;
                                const next = { ...prev };
                                delete next[item.product.id];
                                return next;
                              });
                            }}
                            className="w-11 h-full text-center font-bold text-xs text-[#F8FAFC] bg-transparent focus:outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            aria-label={`${item.product.name} quantity`}
                          />
                          <button
                            type="button"
                            onClick={() => updateQuantity(item.product.id, 1)}
                            className="w-6 h-full flex items-center justify-center text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.08] transition-colors"
                            aria-label="Increase quantity"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      {/* Weight Quick-Select Strip & Sell-by-Value Trigger (for Loose Weight/Volume Items) */}
                      {presets.length > 0 && (
                        <div
                          className="pl-[26px] mt-2 flex flex-wrap items-center gap-1"
                          aria-label={t("quantityPresets")}
                        >
                          {presets.map(([label, qty]) => {
                            const isSelectedPreset = Math.abs(item.quantity - qty) < 0.0005;
                            return (
                              <button
                                key={label}
                                type="button"
                                onClick={() => {
                                  setExactQuantity(item.product.id, qty);
                                  setQuantityDrafts((prev) => {
                                    if (!(item.product.id in prev)) return prev;
                                    const next = { ...prev };
                                    delete next[item.product.id];
                                    return next;
                                  });
                                }}
                                className={`px-2 py-0.5 text-[10px] font-medium rounded-md border transition-all tabular-nums ${
                                  isSelectedPreset
                                    ? "bg-[#5EEAD4]/16 text-[#6EE7B7] border-[#5EEAD4]/40"
                                    : "border-white/[0.08] bg-white/[0.03] text-[#A1AEBB] hover:text-[#F8FAFC] hover:border-white/[0.2]"
                                }`}
                              >
                                {label}
                              </button>
                            );
                          })}
                          <button
                            type="button"
                            onClick={() => {
                              setValueModeId(isValueEditing ? null : item.product.id);
                              setValueAmount(item.requested_value?.toString() || "");
                            }}
                            className={`ml-auto px-2 py-0.5 text-[10px] font-semibold rounded-md border transition-colors ${
                              isValueEditing
                                ? "bg-[#7DD3FC]/18 text-[#7DD3FC] border-[#7DD3FC]/40"
                                : "border-white/[0.1] bg-white/[0.03] text-[#A1AEBB] hover:text-[#6EE7B7] hover:border-[#5EEAD4]/40"
                            }`}
                          >
                            {t("sellByValue")}
                          </button>
                        </div>
                      )}

                      {/* Inline Sell-by-Value Calculator Input */}
                      {isValueEditing && (
                        <div className="pl-[26px] mt-2 flex items-center gap-1.5">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[#A1AEBB]">
                              ₹
                            </span>
                            <input
                              type="number"
                              min="0.01"
                              step="0.01"
                              autoFocus
                              value={valueAmount}
                              onChange={(e) => setValueAmount(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  applyValueAmount(item);
                                } else if (e.key === "Escape") {
                                  setValueModeId(null);
                                }
                              }}
                              placeholder={t("valueAmount")}
                              aria-label={t("valueAmount")}
                              className="w-36 pl-6 pr-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#080B10]/90 border border-[#5EEAD4]/40 text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:border-[#5EEAD4] focus:outline-none tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => applyValueAmount(item)}
                            className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-[#5EEAD4] text-[#080B10] hover:bg-[#6EE7B7] transition-colors"
                          >
                            {t("applyValue")}
                          </button>
                          <button
                            type="button"
                            onClick={() => setValueModeId(null)}
                            className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-md"
                            aria-label="Cancel value mode"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Cardless Settlement Footer (Always Pinned Bottom CTA + Totals) */}
            <div className="border-t border-white/[0.08] bg-[#080B10]/35 shrink-0">
              {/* Flush Hairline Customer Strip (No Box Inputs) */}
              <div className="grid grid-cols-2 divide-x divide-white/[0.08] border-b border-white/[0.08]">
                <div className="relative flex items-center px-5 focus-within:bg-[#5EEAD4]/[0.04] transition-colors">
                  <User className="w-3.5 h-3.5 text-[#A1AEBB]/65 shrink-0 mr-2.5" />
                  <input
                    type="text"
                    placeholder="Customer Name"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    className="w-full py-2.5 text-xs bg-transparent text-[#F8FAFC] placeholder-[#A1AEBB]/55 focus:outline-none"
                  />
                </div>
                <div className="relative flex items-center px-5 focus-within:bg-[#5EEAD4]/[0.04] transition-colors">
                  <Phone className="w-3.5 h-3.5 text-[#A1AEBB]/65 shrink-0 mr-2.5" />
                  <input
                    type="text"
                    placeholder="Mobile Number"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    className="w-full py-2.5 text-xs bg-transparent text-[#F8FAFC] placeholder-[#A1AEBB]/55 focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              {/* Architectural Payment Mode Selector */}
              <div className="px-5 py-2 border-b border-white/[0.08]">
                <div className="grid grid-cols-4 gap-1 p-0.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                  {(["CASH", "UPI", "CARD", "CREDIT"] as PaymentMethod[]).map((mode) => {
                    const isActive = paymentMethod === mode;
                    const isKhata = mode === "CREDIT";
                    return (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => {
                          setPaymentMethod(mode);
                          if (mode !== "CREDIT") setPaidNowAmount("0");
                        }}
                        className={`py-1.5 text-[11px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 ${
                          isActive
                            ? isKhata
                              ? "bg-[#FBBF24]/18 text-[#FBBF24] border border-[#FBBF24]/45 shadow-[0_0_10px_rgba(251,191,36,0.16)]"
                              : "bg-[#5EEAD4]/16 text-[#6EE7B7] border border-[#5EEAD4]/40 shadow-[0_0_10px_rgba(94,234,212,0.16)]"
                            : "text-[#A1AEBB] hover:text-[#F8FAFC] border border-transparent"
                        }`}
                      >
                        {mode === "CARD" && <CreditCard className="w-3 h-3 opacity-80 hidden sm:inline" />}
                        <span>
                          {language === "kn"
                            ? tData(mode)
                            : mode === "UPI"
                            ? "UPI QR"
                            : mode === "CREDIT"
                            ? "KHATA"
                            : mode}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Contextual Strip 1: Owner UPI Fast-Pay QR (Horizontal Cardless Band) */}
              {paymentMethod === "UPI" && grandTotal > 0 && (
                <div className="px-5 py-2.5 border-b border-[#7DD3FC]/20 bg-[#7DD3FC]/[0.05] flex items-center gap-3.5">
                  <div
                    className="p-1 rounded-lg shrink-0 shadow-sm"
                    style={{ backgroundColor: "#FFFFFF" }}
                  >
                    <img
                      src={qrCodeSvgDataUrl(
                        `upi://pay?pa=${encodeURIComponent(activeOwnerUpi)}&pn=${encodeURIComponent(
                          business?.name || "Store Owner"
                        )}&am=${grandTotal.toFixed(2)}&cu=INR&tn=SmartStock-Bill-${Math.floor(Date.now() / 1000)}`
                      )}
                      alt="Owner UPI Payment QR"
                      className="w-[64px] h-[64px] object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                        <QrCode className="w-3.5 h-3.5 text-[#7DD3FC]" />
                        <span>Owner UPI Fast-Pay</span>
                        <span className="text-[9px] bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#6EE7B7]/30 px-1 py-px rounded font-bold uppercase">
                          NPCI
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const digits = activeOwnerUpi.split("@")[0].replace(/\D/g, "");
                          setEditOwnerPhone(digits);
                          const handle = `@${activeOwnerUpi.split("@")[1] || "ybl"}`;
                          setEditOwnerHandle(handle);
                          setShowOwnerUpiModal(true);
                        }}
                        className="text-[10px] text-[#7DD3FC] hover:text-[#F8FAFC] px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] flex items-center gap-1 transition-colors shrink-0"
                        title="Edit Owner mobile number for this QR"
                      >
                        <Edit2 className="w-2.5 h-2.5" />
                        <span>Edit VPA</span>
                      </button>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-base font-extrabold text-[#7DD3FC] tabular-nums">
                        ₹{grandTotal.toFixed(2)}
                      </span>
                      <span className="text-[10px] font-mono text-[#F8FAFC]/85 truncate">
                        {activeOwnerUpi}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-[#A1AEBB]">
                      <span>Scan via PhonePe, GPay, Paytm</span>
                      <span className="text-[#6EE7B7] font-medium flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>Exact ₹ locked</span>
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Contextual Strip 2: Khata Credit Split (Compact Cardless Band) */}
              {paymentMethod === "CREDIT" && (
                <div className="px-5 py-2.5 border-b border-[#FBBF24]/25 bg-[#FBBF24]/[0.05] space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-[#FBBF24]">
                      Khata Credit Split
                    </span>
                    <span className="text-[#A1AEBB] tabular-nums">
                      Added to Ledger: <strong className="text-[#FBBF24]">₹{creditDue.toFixed(2)}</strong>
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 min-w-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-[#A1AEBB] text-xs">₹</span>
                      <input
                        type="number"
                        min="0"
                        max={grandTotal}
                        step="any"
                        value={paidNowAmount}
                        onChange={(e) => setPaidNowAmount(e.target.value)}
                        placeholder="Upfront 0.00"
                        className="w-full pl-6 pr-2.5 py-1 text-xs font-bold rounded-lg bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#FBBF24] tabular-nums [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setPaidNowAmount("0")}
                        className={`px-2 py-1 text-[10px] rounded-md border transition-colors ${
                          parsedPaidNow === 0
                            ? "bg-[#FBBF24] text-[#080B10] font-bold border-[#FBBF24]"
                            : "bg-white/[0.05] text-[#A1AEBB] border-white/[0.12] hover:text-[#F8FAFC]"
                        }`}
                      >
                        ₹0
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaidNowAmount((grandTotal * 0.5).toFixed(2))}
                        className="px-2 py-1 text-[10px] rounded-md border bg-white/[0.05] text-[#A1AEBB] border-white/[0.12] hover:text-[#F8FAFC] transition-colors"
                      >
                        50%
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaidNowAmount(grandTotal.toFixed(2))}
                        className="px-2 py-1 text-[10px] rounded-md border bg-white/[0.05] text-[#A1AEBB] border-white/[0.12] hover:text-[#F8FAFC] transition-colors"
                      >
                        Full
                      </button>
                    </div>

                    {parsedPaidNow > 0 && (
                      <div className="flex items-center gap-0.5 pl-1.5 border-l border-white/[0.1] shrink-0">
                        {(["CASH", "UPI"] as const).map((tender) => (
                          <button
                            key={tender}
                            type="button"
                            onClick={() => setUpfrontTender(tender)}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors border ${
                              upfrontTender === tender
                                ? "bg-[#5EEAD4]/20 text-[#6EE7B7] border-[#5EEAD4]/40"
                                : "bg-white/[0.04] text-[#A1AEBB] border-white/[0.1]"
                            }`}
                          >
                            {tender}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Totals Breakdown & Primary Settlement Trigger */}
              <div className="px-5 py-3 space-y-2.5">
                <div className="space-y-1 text-[11px]">
                  <div className="flex items-center justify-between text-[#A1AEBB]">
                    <span>
                      Subtotal{" "}
                      <strong className="text-[#F8FAFC] font-medium tabular-nums ml-1">
                        ₹{subtotal.toFixed(2)}
                      </strong>
                    </span>
                    {showTax && (
                      <span>
                        GST{" "}
                        <strong className="text-[#F8FAFC] font-medium tabular-nums ml-1">
                          ₹{totalTax.toFixed(2)}
                        </strong>
                      </span>
                    )}
                    {overallDiscount + lineDiscounts > 0 && (
                      <span className="text-[#FB7185] tabular-nums">
                        Disc -₹{(overallDiscount + lineDiscounts).toFixed(2)}
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between items-baseline pt-1.5 border-t border-white/[0.08]">
                    <span className="text-xs font-bold uppercase tracking-wider text-[#F8FAFC]">
                      Grand Total
                    </span>
                    <span className="text-xl font-extrabold text-[#6EE7B7] tabular-nums tracking-tight">
                      ₹{grandTotal.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Complete Sale Action */}
                <button
                  type="button"
                  disabled={cart.length === 0 || isSubmitting || !businessLoaded}
                  onClick={handleCheckout}
                  className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-40 transition-all active:scale-[0.98] ${
                    paymentMethod === "CREDIT"
                      ? "bg-gradient-to-r from-[#FBBF24] to-[#F59E0B] text-[#080B10] shadow-[0_0_20px_rgba(251,191,36,0.3)] hover:brightness-105"
                      : "liquid-btn-primary"
                  }`}
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>
                    {isSubmitting
                      ? "Recording Transaction..."
                      : paymentMethod === "CREDIT"
                      ? parsedPaidNow > 0
                        ? `Complete Sale (₹${parsedPaidNow.toFixed(2)} Paid + ₹${creditDue.toFixed(2)} Due)`
                        : `Complete Sale (₹${creditDue.toFixed(2)} Due on Khata)`
                      : t("completeSale")}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Completed Invoice / Print Modal */}
      {completedInvoice && (
        <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
          <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
              <div className="flex items-center gap-2 text-[#6EE7B7]">
                <CheckCircle className="w-5 h-5" />
                <span className="font-bold text-sm text-[#F8FAFC]">Sale Completed</span>
              </div>
              <button
                type="button"
                onClick={() => setCompletedInvoice(null)}
                className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg transition-colors"
                aria-label="Close invoice modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white/[0.04] p-3.5 rounded-xl border border-white/[0.1] text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-[#A1AEBB]">Invoice:</span>
                <span className="font-bold font-mono text-[#F8FAFC]">{completedInvoice.invoice_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#A1AEBB]">Amount Billed:</span>
                <span className="font-bold text-[#6EE7B7] tabular-nums">₹{completedInvoice.total_amount.toFixed(2)}</span>
              </div>
              {completedInvoice.payment_method === "CREDIT" && (
                <>
                  <div className="flex justify-between text-[#6EE7B7] font-semibold">
                    <span>Paid Now:</span>
                    <span className="tabular-nums">₹{(completedInvoice.paid_amount || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-[#FBBF24] font-bold">
                    <span>Due on Khata:</span>
                    <span className="tabular-nums">
                      ₹{((completedInvoice.credit_amount !== undefined ? completedInvoice.credit_amount : (completedInvoice.total_amount - (completedInvoice.paid_amount || 0)))).toFixed(2)}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between">
                <span className="text-[#A1AEBB]">Mode:</span>
                <span className="font-semibold text-[#F8FAFC]">{completedInvoice.payment_method} ({completedInvoice.payment_status})</span>
              </div>
            </div>

            {/* Thermal Receipt Paper Preview */}
            <div
              className="max-h-60 overflow-y-auto border border-white/[0.18] rounded-xl p-2 shadow-inner [&>#printable-receipt]:!bg-[#FFFFFF]"
              style={{ backgroundColor: "#FFFFFF", color: "#000000" }}
            >
              <PrintableReceipt invoice={completedInvoice} business={business} paperWidth={receiptWidth} />
            </div>

            {/* WhatsApp Receipt Quick Sender */}
            <div className="bg-[#6EE7B7]/[0.06] p-3 rounded-xl border border-[#6EE7B7]/25 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#F8FAFC] flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-[#6EE7B7]" />
                  <span>{language === "kn" ? "ವಾಟ್ಸಾಪ್ ರಸೀದಿ ಕಳುಹಿಸಿ" : "Send WhatsApp Bill"}</span>
                </span>
              </div>
              <div className="flex gap-2">
                <input
                  type="tel"
                  placeholder={language === "kn" ? "10 ಅಂಕಿಯ ಮೊಬೈಲ್ ಸಂಖ್ಯೆ..." : "10-digit mobile number..."}
                  value={receiptPhoneInput}
                  onChange={(e) => setReceiptPhoneInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-[#080B10]/85 border border-white/[0.14] rounded-xl text-xs font-mono text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:outline-none focus:border-[#5EEAD4]"
                />
                <button
                  type="button"
                  onClick={() => whatsappBillUrl && openWhatsAppUrl(whatsappBillUrl)}
                  disabled={!receiptPhoneInput.trim()}
                  className="liquid-btn-primary px-3.5 py-1.5 disabled:opacity-40 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>{language === "kn" ? "ಕಳುಹಿಸಿ" : "Share"}</span>
                </button>
              </div>
            </div>

            <div className="flex gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => window.print()}
                className="liquid-btn-primary flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5"
              >
                <Printer className="w-4 h-4" />
                <span>{t("fastPrint")}</span>
              </button>
              <button
                type="button"
                onClick={() => setCompletedInvoice(null)}
                className="liquid-btn-secondary px-5 py-2.5 rounded-xl font-semibold text-xs"
              >
                {t("newSale")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cash Drawer Shift Control Modal */}
      {showDrawerModal && (
        <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] relative">
            <button
              type="button"
              onClick={() => setShowDrawerModal(false)}
              className="absolute right-4 top-4 text-[#A1AEBB] hover:text-[#F8FAFC] p-1 rounded-lg transition-colors"
              aria-label="Close drawer modal"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2.5 mb-4 pb-3 border-b border-white/[0.08]">
              <div className="p-2 rounded-xl bg-[#5EEAD4]/15 text-[#6EE7B7] border border-[#5EEAD4]/35">
                <Layers className="w-4 h-4" />
              </div>
              <h3 className="font-bold text-base text-[#F8FAFC]">
                Cash Drawer Shift Control
              </h3>
            </div>

            {drawerError && (
              <div className="mb-4 p-2.5 bg-[#FB7185]/12 border border-[#FB7185]/35 rounded-xl text-[#FB7185] text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{drawerError}</span>
              </div>
            )}

            {currentShift ? (
              <div className="space-y-4">
                {/* Active Shift Status */}
                <div className="bg-white/[0.04] rounded-2xl border border-white/[0.1] overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/[0.08] flex items-center justify-between">
                    <div>
                      <div className="font-bold text-xs text-[#F8FAFC]">
                        Active Shift #{currentShift.id}
                      </div>
                      <div className="text-[11px] text-[#A1AEBB] mt-0.5">
                        Opened at {new Date(currentShift.opened_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#5EEAD4]/35">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] animate-pulse" />
                      OPEN
                    </span>
                  </div>

                  {/* Ruled 2x2 Ledger Grid */}
                  <div className="grid grid-cols-2 gap-px bg-white/[0.08] text-xs">
                    <div className="p-3 bg-[#111722]/90">
                      <div className="text-[#A1AEBB] text-[10px]">Opening Cash Float</div>
                      <div className="font-bold text-[#F8FAFC] font-mono tabular-nums mt-0.5">
                        ₹{currentShift.opening_float.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-3 bg-[#111722]/90">
                      <div className="text-[#A1AEBB] text-[10px]">Cash Sales (+POS)</div>
                      <div className="font-bold text-[#6EE7B7] font-mono tabular-nums mt-0.5">
                        +₹{currentShift.cash_sales.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-3 bg-[#111722]/90">
                      <div className="text-[#A1AEBB] text-[10px]">Cash Expenses (-Out)</div>
                      <div className="font-bold text-[#FB7185] font-mono tabular-nums mt-0.5">
                        -₹{currentShift.cash_expenses.toFixed(2)}
                      </div>
                    </div>
                    <div className="p-3 bg-[#111722]/90">
                      <div className="text-[#A1AEBB] text-[10px]">Expected in Register</div>
                      <div className="font-extrabold text-[#5EEAD4] font-mono text-sm tabular-nums mt-0.5">
                        ₹{currentShift.expected_cash.toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Close Shift Form */}
                <form onSubmit={handleCloseShift} className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-[#F8FAFC] mb-1.5">
                      Physical Cash Counted in Drawer (₹) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      placeholder="Enter counted notes + coins..."
                      value={countedCashInput}
                      onChange={(e) => setCountedCashInput(e.target.value)}
                      className="w-full px-3.5 py-2 text-sm font-bold font-mono rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:outline-none focus:border-[#5EEAD4] tabular-nums"
                    />
                  </div>

                  {countedCashInput && !isNaN(parseFloat(countedCashInput)) && (
                    <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="text-[#A1AEBB]">Calculated Variance:</span>
                        <span
                          className={`font-mono font-bold tabular-nums ${
                            parseFloat(countedCashInput) - currentShift.expected_cash >= 0
                              ? "text-[#6EE7B7]"
                              : "text-[#FB7185]"
                          }`}
                        >
                          {parseFloat(countedCashInput) - currentShift.expected_cash >= 0 ? "+" : ""}
                          ₹{(parseFloat(countedCashInput) - currentShift.expected_cash).toFixed(2)}
                        </span>
                      </div>
                      {Math.abs(parseFloat(countedCashInput) - currentShift.expected_cash) >= 500 && (
                        <div className="text-[10px] text-[#FB7185] font-semibold flex items-center gap-1 pt-0.5">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>Variance ≥ ₹500 triggers an automated audit anomaly alert.</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex gap-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowDrawerModal(false)}
                      className="liquid-btn-secondary flex-1 py-2.5 rounded-xl text-xs font-semibold"
                    >
                      Keep Open
                    </button>
                    <button
                      type="submit"
                      disabled={drawerLoading || !countedCashInput}
                      className="flex-1 py-2.5 bg-[#FB7185]/90 hover:bg-[#FB7185] text-[#080B10] rounded-xl text-xs font-bold disabled:opacity-50 transition-all shadow-[0_0_16px_rgba(251,113,133,0.3)]"
                    >
                      {drawerLoading ? "Closing..." : "Close Cash Shift"}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <form onSubmit={handleOpenShift} className="space-y-4">
                <div className="p-3.5 bg-[#FBBF24]/10 border border-[#FBBF24]/30 rounded-xl text-xs text-[#FBBF24]">
                  No active cash shift. Open a register shift to track cash collections, expenses, and physical reconciliation.
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#F8FAFC] mb-1.5">
                    Opening Cash Float (₹)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="2000.00"
                    value={openingFloatInput}
                    onChange={(e) => setOpeningFloatInput(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-bold font-mono rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:outline-none focus:border-[#5EEAD4] tabular-nums"
                  />
                  <div className="text-[11px] text-[#A1AEBB] mt-1.5">
                    Initial change placed in the cash drawer at start of shift.
                  </div>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowDrawerModal(false)}
                    className="liquid-btn-secondary flex-1 py-2.5 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={drawerLoading}
                    className="liquid-btn-primary flex-1 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {drawerLoading ? "Opening..." : "Open Cash Shift"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Day-End Store Closing Summary (Z-Report) Modal */}
      {closedShiftReport && (
        <DayEndReportModal
          shift={closedShiftReport}
          business={business}
          onClose={() => setClosedShiftReport(null)}
        />
      )}

      {/* Live Camera Barcode & QR Scanner Modal */}
      {showCameraScanner && (
        <CameraBarcodeScannerModal
          products={products}
          onProductScanned={(p) => {
            addToCart(p);
            setScannedToast(`Added: ${p.name} (₹${p.selling_price.toFixed(2)})`);
            setTimeout(() => setScannedToast(null), 2500);
          }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}

      {/* Inline Owner Phone UPI Updater Modal */}
      {showOwnerUpiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/80 backdrop-blur-md p-4">
          <div className="liquid-modal p-6 max-w-sm w-full text-[#F8FAFC] space-y-4">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <h3 className="text-sm font-bold text-[#F8FAFC] flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#7DD3FC]" />
                <span>Owner Phone Number UPI Setup</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowOwnerUpiModal(false)}
                className="text-[#A1AEBB] hover:text-[#F8FAFC] p-1 rounded-lg transition-colors"
                aria-label="Close UPI modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveOwnerUpi} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[#F8FAFC] mb-1.5">
                  Owner 10-Digit Mobile Number
                </label>
                <div className="flex rounded-xl border border-white/[0.14] bg-[#080B10]/85 overflow-hidden focus-within:border-[#7DD3FC]">
                  <span className="px-3 py-2 text-xs font-bold bg-white/[0.06] text-[#A1AEBB] flex items-center border-r border-white/[0.1]">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    required
                    placeholder="9845123456"
                    value={editOwnerPhone}
                    onChange={(e) => setEditOwnerPhone(e.target.value.replace(/\D/g, ""))}
                    className="flex-1 px-3 py-2 text-sm font-mono font-bold bg-transparent text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:outline-none tabular-nums"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#F8FAFC] mb-1.5">
                  UPI App Provider
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { label: "PhonePe (@ybl)", handle: "@ybl" },
                    { label: "Google Pay (@okaxis)", handle: "@okaxis" },
                    { label: "Paytm (@paytm)", handle: "@paytm" },
                    { label: "BHIM (@upi)", handle: "@upi" },
                  ].map((p) => (
                    <button
                      key={p.handle}
                      type="button"
                      onClick={() => setEditOwnerHandle(p.handle)}
                      className={`py-2 px-2.5 text-xs rounded-xl border text-left font-medium transition-all ${
                        editOwnerHandle === p.handle
                          ? "bg-[#7DD3FC]/16 text-[#7DD3FC] border-[#7DD3FC]/45 shadow-[0_0_12px_rgba(125,211,252,0.16)] font-semibold"
                          : "bg-white/[0.04] border-white/[0.1] text-[#A1AEBB] hover:text-[#F8FAFC]"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="text-[11px] text-[#A1AEBB] font-mono bg-[#7DD3FC]/[0.06] px-3 py-2 rounded-xl border border-[#7DD3FC]/25">
                Generated UPI VPA:{" "}
                <strong className="text-[#7DD3FC]">
                  {editOwnerPhone ? `${editOwnerPhone}${editOwnerHandle}` : "..."}
                </strong>
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setShowOwnerUpiModal(false)}
                  className="liquid-btn-secondary flex-1 py-2 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingUpi}
                  className="liquid-btn-primary flex-1 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  {savingUpi ? "Saving..." : "Save & Apply QR"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
