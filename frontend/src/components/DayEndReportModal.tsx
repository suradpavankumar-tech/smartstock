import React, { useState, useEffect } from "react";
import { X, Printer, MessageCircle, CheckCircle2, AlertTriangle, ShieldCheck, TrendingUp, DollarSign } from "lucide-react";
import { CashShift, Business, Invoice, ProductPerformancePoint } from "../types";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { buildDayEndReportWhatsAppMessage, openWhatsAppUrl, buildWhatsAppUrl } from "../utils/whatsapp";

interface DayEndReportModalProps {
  shift: CashShift;
  business?: Business | null;
  onClose: () => void;
}

export const DayEndReportModal: React.FC<DayEndReportModalProps> = ({
  shift,
  business,
  onClose,
}) => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [topProducts, setTopProducts] = useState<ProductPerformancePoint[]>([]);
  const [todayInvoices, setTodayInvoices] = useState<Invoice[]>([]);
  const [ownerPhone, setOwnerPhone] = useState(business?.phone || "");
  const [isKannada, setIsKannada] = useState(false);

  const storeName = business?.name || "Haveri Kirana & General Stores";
  const cashierName = user?.full_name || "Cashier Staff";

  useEffect(() => {
    const loadReportData = async () => {
      setLoading(true);
      try {
        const todayStr = new Date().toISOString().split("T")[0];
        const [invoices, top] = await Promise.all([
          api.getInvoices(todayStr),
          api.getTopProducts(3),
        ]);
        setTodayInvoices(invoices);
        setTopProducts(top);
      } catch (err) {
        console.error("Failed to load daily report metrics", err);
      } finally {
        setLoading(false);
      }
    };
    loadReportData();
  }, []);

  // Compute breakdown from today's invoices
  const totalSales = todayInvoices.reduce((sum, inv) => sum + (inv.payment_status !== "CANCELLED" ? inv.total_amount : 0), 0);
  const totalInvoicesCount = todayInvoices.filter((inv) => inv.payment_status !== "CANCELLED").length;
  
  const cashSales = todayInvoices
    .filter((inv) => inv.payment_method === "CASH" && inv.payment_status !== "CANCELLED")
    .reduce((sum, inv) => sum + inv.total_amount, 0);

  const upiSales = todayInvoices
    .filter((inv) => inv.payment_method === "UPI" && inv.payment_status !== "CANCELLED")
    .reduce((sum, inv) => sum + inv.total_amount, 0);

  const cardSales = todayInvoices
    .filter((inv) => inv.payment_method === "CARD" && inv.payment_status !== "CANCELLED")
    .reduce((sum, inv) => sum + inv.total_amount, 0);

  const creditSales = todayInvoices
    .filter((inv) => inv.payment_method === "CREDIT" && inv.payment_status !== "CANCELLED")
    .reduce((sum, inv) => sum + (inv.credit_amount !== undefined ? inv.credit_amount : inv.total_amount), 0);

  const openingFloat = shift.opening_float || 0;
  const countedCash = shift.counted_cash || 0;
  const expectedCash = shift.expected_cash || (openingFloat + cashSales);
  const variance = shift.variance !== undefined ? shift.variance : (countedCash - expectedCash);

  const handleShareWhatsApp = () => {
    const message = buildDayEndReportWhatsAppMessage(
      {
        shopName: storeName,
        cashierName,
        shiftId: shift.id,
        openingFloat,
        totalSales,
        totalInvoices: totalInvoicesCount,
        cashSales,
        upiSales,
        cardSales,
        creditSales,
        khataCollectedToday: 0,
        expectedCash,
        countedCash,
        variance,
        topSellers: topProducts.map((p) => ({
          name: p.product_name,
          qty: p.units_sold,
          revenue: p.revenue,
        })),
      },
      isKannada
    );

    const url = buildWhatsAppUrl(ownerPhone || business?.phone, message);
    if (url) {
      openWhatsAppUrl(url);
    } else {
      // If no valid phone number, open general wa.me share link
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="liquid-modal max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden text-[#F8FAFC]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#5EEAD4]/20 text-[#6EE7B7] border border-[#5EEAD4]/40 shadow-[0_0_12px_rgba(94,234,212,0.25)]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8FAFC]">
                Day-End Store Closing Summary (Z-Report)
              </h2>
              <p className="text-xs text-[#A1AEBB]">
                Shift #{shift.id} • {new Date().toLocaleDateString("en-IN", { dateStyle: "medium" })}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg active:scale-[0.98]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {/* Cash Variance Hero Banner */}
          <div
            className={`p-4 rounded-2xl border flex items-center justify-between ${
              Math.abs(variance) < 1
                ? "bg-[#6EE7B7]/10 border-[#5EEAD4]/35 text-[#6EE7B7]"
                : variance > 0
                ? "bg-[#7DD3FC]/10 border-[#7DD3FC]/35 text-[#7DD3FC]"
                : "bg-[#FB7185]/12 border-[#FB7185]/35 text-[#FB7185]"
            }`}
          >
            <div>
              <div className="font-bold text-sm text-[#F8FAFC] flex items-center gap-1.5">
                {Math.abs(variance) < 1 ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-[#6EE7B7]" />
                    <span>Cash Till Perfectly Matched</span>
                  </>
                ) : variance > 0 ? (
                  <>
                    <TrendingUp className="w-4 h-4 text-[#7DD3FC]" />
                    <span>Cash Till Surplus (Excess)</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4 text-[#FB7185]" />
                    <span>Cash Till Shortage Detected</span>
                  </>
                )}
              </div>
              <div className="text-[11px] text-[#A1AEBB] mt-0.5 tabular-nums">
                Expected: ₹{expectedCash.toFixed(2)} • Physical Count: ₹{countedCash.toFixed(2)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-extrabold font-mono tabular-nums">
                {variance >= 0 ? "+" : ""}₹{variance.toFixed(2)}
              </div>
              <div className="text-[10px] uppercase font-semibold tracking-wider text-[#A1AEBB]">
                Variance
              </div>
            </div>
          </div>

          {/* Ruled Sales Breakdown */}
          <div className="rounded-2xl border border-white/[0.1] bg-white/[0.03] overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.08] font-bold text-[#F8FAFC] flex justify-between items-center">
              <span>Gross Sales ({totalInvoicesCount} Invoices)</span>
              <span className="text-sm font-extrabold text-[#6EE7B7] tabular-nums">
                ₹{totalSales.toFixed(2)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-px bg-white/[0.08]">
              <div className="flex justify-between items-center p-3 bg-[#111722]/90">
                <span className="text-[#A1AEBB]">Cash at Counter</span>
                <strong className="text-[#F8FAFC] tabular-nums">₹{cashSales.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between items-center p-3 bg-[#111722]/90">
                <span className="text-[#A1AEBB]">UPI / QR Pay</span>
                <strong className="text-[#7DD3FC] tabular-nums">₹{upiSales.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between items-center p-3 bg-[#111722]/90">
                <span className="text-[#A1AEBB]">Card Machine</span>
                <strong className="text-[#F8FAFC] tabular-nums">₹{cardSales.toFixed(2)}</strong>
              </div>
              <div className="flex justify-between items-center p-3 bg-[#111722]/90">
                <span className="text-[#A1AEBB]">Khata Given</span>
                <strong className="text-[#FBBF24] tabular-nums">₹{creditSales.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          {/* Top 3 Fast Movers */}
          {topProducts.length > 0 && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-[#A1AEBB] uppercase tracking-wider">
                Top Selling Items in this Shift
              </div>
              <div className="rounded-xl border border-white/[0.1] bg-white/[0.03] divide-y divide-white/[0.06]">
                {topProducts.slice(0, 3).map((p, idx) => (
                  <div
                    key={p.product_id}
                    className="flex justify-between items-center px-3.5 py-2.5"
                  >
                    <span className="font-semibold text-[#F8FAFC]">
                      #{idx + 1} {p.product_name}
                    </span>
                    <span className="text-[#A1AEBB] tabular-nums">
                      {p.units_sold} sold • <strong className="text-[#6EE7B7]">₹{p.revenue.toFixed(0)}</strong>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Owner WhatsApp Destination Input */}
          <div className="p-3.5 liquid-glass rounded-2xl space-y-2 border border-[#5EEAD4]/30">
            <div className="flex items-center justify-between">
              <label className="font-bold text-[#6EE7B7] flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-[#5EEAD4]" />
                <span>Owner's WhatsApp Number</span>
              </label>
              <div className="flex items-center gap-1 text-[10px]">
                <button
                  type="button"
                  onClick={() => setIsKannada(false)}
                  className={`px-2 py-0.5 rounded-lg font-bold transition-all ${!isKannada ? "bg-[#5EEAD4] text-[#080B10]" : "liquid-pill text-[#A1AEBB]"}`}
                >
                  English
                </button>
                <button
                  type="button"
                  onClick={() => setIsKannada(true)}
                  className={`px-2 py-0.5 rounded-lg font-bold transition-all ${isKannada ? "bg-[#5EEAD4] text-[#080B10]" : "liquid-pill text-[#A1AEBB]"}`}
                >
                  ಕನ್ನಡ
                </button>
              </div>
            </div>
            <input
              type="tel"
              placeholder="+91 98451 XXXXX"
              value={ownerPhone}
              onChange={(e) => setOwnerPhone(e.target.value)}
              className="w-full px-3 py-1.5 text-xs liquid-input text-[#F8FAFC]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <button
            onClick={() => window.print()}
            className="px-3.5 py-2 text-xs font-semibold rounded-xl liquid-btn-secondary flex items-center gap-1.5 active:scale-[0.98]"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Slip</span>
          </button>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC] active:scale-[0.98]"
            >
              Done
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="px-4 py-2 text-xs font-bold rounded-xl liquid-btn-primary flex items-center gap-1.5 shadow-md active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Send to WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
