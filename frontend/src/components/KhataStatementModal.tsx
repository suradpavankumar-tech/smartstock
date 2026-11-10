import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Printer, MessageCircle, FileText } from "lucide-react";
import { Customer, Invoice, Business } from "../types";
import { api } from "../services/api";
import { buildWhatsAppUrl, openWhatsAppUrl, buildUpiPaymentLink } from "../utils/whatsapp";

interface KhataStatementModalProps {
  customer: Customer;
  business?: Business | null;
  onClose: () => void;
}

export const KhataStatementModal: React.FC<KhataStatementModalProps> = ({
  customer,
  business,
  onClose,
}) => {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isKannada, setIsKannada] = useState(false);

  const storeName = business?.name || "Haveri Kirana & General Stores";
  const upiVpa = business?.upi_vpa;

  useEffect(() => {
    const fetchInvoices = async () => {
      setLoading(true);
      try {
        const data = await api.getCustomerInvoices(customer.id);
        setInvoices(data);
      } catch (err) {
        console.error("Failed to load customer invoices", err);
      } finally {
        setLoading(false);
      }
    };
    fetchInvoices();
  }, [customer.id]);

  const balance = customer.outstanding_balance || 0;

  const handleShareWhatsApp = () => {
    const dateStr = new Date().toLocaleDateString("en-IN", { dateStyle: "medium" });
    const lines: string[] = [];

    if (isKannada) {
      lines.push(`📖 *${storeName} - ಖಾತೆ ವಿವರ (KHATA STATEMENT)*`);
      lines.push(`👤 ಗ್ರಾಹಕರು: *${customer.name}*`);
      if (customer.phone) lines.push(`📞 ದೂರವಾಣಿ: ${customer.phone}`);
      lines.push(`📅 ದಿನಾಂಕ: ${dateStr}`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`*ಬಾಕಿ ಇರುವ ಮೊತ್ತ (Balance Due): ₹${balance.toFixed(2)}*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

      if (invoices.length > 0) {
        lines.push(`ಇತ್ತೀಚಿನ ಬಿಲ್ಲುಗಳು:`);
        invoices.slice(0, 5).forEach((inv, idx) => {
          const invDate = new Date(inv.created_at).toLocaleDateString("en-IN");
          lines.push(`${idx + 1}. ${inv.invoice_number} (${invDate}) — ₹${inv.total_amount.toFixed(2)} [${inv.payment_method}]`);
        });
        lines.push(`─────────────────────`);
      }

      if (upiVpa && balance > 0) {
        const upiUrl = buildUpiPaymentLink(upiVpa, storeName, balance, `Khata Settlement ${customer.name}`);
        lines.push(`GooglePay / PhonePe / Paytm ಮೂಲಕ ಪಾವತಿಸಲು ಲಿಂಕ್:`);
        lines.push(upiUrl);
        lines.push(``);
        lines.push(`UPI ID: *${upiVpa}*`);
      }
      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`ಧನ್ಯವಾದಗಳು! — ${storeName}`);
    } else {
      lines.push(`📖 *${storeName} - KHATA ACCOUNT STATEMENT*`);
      lines.push(`👤 Customer: *${customer.name}*`);
      if (customer.phone) lines.push(`📞 Phone: ${customer.phone}`);
      lines.push(`📅 Date: ${dateStr}`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`*TOTAL OUTSTANDING BALANCE: ₹${balance.toFixed(2)}*`);
      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

      if (invoices.length > 0) {
        lines.push(`Recent Transactions:`);
        invoices.slice(0, 5).forEach((inv, idx) => {
          const invDate = new Date(inv.created_at).toLocaleDateString("en-IN");
          lines.push(`${idx + 1}. ${inv.invoice_number} (${invDate}) — ₹${inv.total_amount.toFixed(2)} [${inv.payment_method}]`);
        });
        lines.push(`─────────────────────`);
      }

      if (upiVpa && balance > 0) {
        const upiUrl = buildUpiPaymentLink(upiVpa, storeName, balance, `Khata Settlement ${customer.name}`);
        lines.push(`Click to pay via GooglePay / PhonePe / Paytm:`);
        lines.push(upiUrl);
        lines.push(``);
        lines.push(`Direct UPI ID: *${upiVpa}*`);
      }
      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`Thank you for your business! — ${storeName}`);
    }

    const message = lines.join("\n");
    const url = buildWhatsAppUrl(customer.phone, message);
    if (url) openWhatsAppUrl(url);
    else window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      <div className="liquid-modal max-w-lg w-full flex flex-col max-h-[90vh] overflow-hidden text-[#F8FAFC]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#FBBF24]/20 text-[#FBBF24] border border-[#FBBF24]/40 shadow-[0_0_12px_rgba(251,191,36,0.25)]">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8FAFC]">
                Khata Ledger Statement
              </h2>
              <p className="text-xs text-[#A1AEBB]">
                {customer.name} {customer.phone ? `• ${customer.phone}` : ""}
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
        <div className="p-6 overflow-y-auto space-y-4 flex-1 text-xs">
          {/* Outstanding Balance Banner */}
          <div className="p-4 rounded-2xl bg-[#FBBF24]/15 border border-[#FBBF24]/40 shadow-[0_0_15px_rgba(251,191,36,0.2)] flex items-center justify-between">
            <div>
              <span className="text-xs text-[#FBBF24] font-medium">
                Total Pending Due
              </span>
              <div className="text-2xl font-black text-[#FBBF24] drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]">
                ₹{balance.toFixed(2)}
              </div>
            </div>
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setIsKannada(false)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${!isKannada ? "bg-[#FBBF24] text-[#080B10]" : "liquid-pill text-[#A1AEBB]"}`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setIsKannada(true)}
                className={`px-2.5 py-1 rounded-lg font-bold transition-all ${isKannada ? "bg-[#FBBF24] text-[#080B10]" : "liquid-pill text-[#A1AEBB]"}`}
              >
                ಕನ್ನಡ
              </button>
            </div>
          </div>

          {/* Invoices List */}
          <div>
            <div className="text-[11px] font-bold text-[#A1AEBB] uppercase tracking-wider mb-2">
              Purchase & Billing History ({invoices.length} Invoices)
            </div>

            {loading ? (
              <div className="p-6 text-center text-[#A1AEBB]">Loading ledger records...</div>
            ) : invoices.length === 0 ? (
              <div className="p-6 text-center text-[#A1AEBB] border border-dashed border-white/20 rounded-2xl">
                No past invoices linked to this customer account.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="p-2.5 rounded-xl bg-white/[0.04] border border-white/10 flex justify-between items-center hover:bg-white/[0.08] transition-colors"
                  >
                    <div>
                      <div className="font-bold text-[#F8FAFC] flex items-center gap-1.5">
                        <span>{inv.invoice_number}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          inv.payment_status === "PAID"
                            ? "bg-[#6EE7B7]/20 text-[#6EE7B7] border border-[#5EEAD4]/30"
                            : "bg-[#FBBF24]/20 text-[#FBBF24] border border-[#FBBF24]/30"
                        }`}>
                          {inv.payment_status}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#A1AEBB]">
                        {new Date(inv.created_at).toLocaleDateString()} • {inv.payment_method}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-[#F8FAFC]">
                        ₹{inv.total_amount.toFixed(2)}
                      </div>
                      {inv.credit_amount !== undefined && inv.credit_amount > 0 && (
                        <div className="text-[10px] text-[#FBBF24] font-semibold">
                          Due: ₹{inv.credit_amount.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              Close
            </button>
            <button
              onClick={handleShareWhatsApp}
              className="px-4 py-2 text-xs font-bold rounded-xl liquid-btn-primary flex items-center gap-1.5 shadow-md active:scale-[0.98]"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Share on WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
