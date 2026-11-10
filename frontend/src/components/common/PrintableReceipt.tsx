import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Invoice, Business } from "../../types";
import { buildUpiPaymentLink } from "../../utils/whatsapp";
import { qrCodeSvgDataUrl } from "../../utils/qrCode";
import { getReceiptSettings } from "../../utils/receiptSettings";
import { Printer, X } from "lucide-react";

export interface PrintableReceiptProps {
  invoice: Invoice;
  business?: Business | null;
  businessName?: string;
  paperWidth?: 58 | 80;
  onClose?: () => void;
}

export const PrintableReceipt: React.FC<PrintableReceiptProps> = ({
  invoice,
  business,
  businessName,
  paperWidth: propPaperWidth,
  onClose,
}) => {
  const receiptSettings = getReceiptSettings();
  const paperWidth = propPaperWidth || receiptSettings.paperWidth || 58;
  const [upiQrData, setUpiQrData] = useState<string | null>(null);
  const compositionScheme = business?.tax_mode === "COMPOSITION_SCHEME";
  const showTax = !business?.tax_mode || business.tax_mode === "REGULAR_GST";
  const upiLink = business?.upi_vpa && receiptSettings.showUpiQr !== false
    ? buildUpiPaymentLink(business.upi_vpa, business.name.slice(0, 40), invoice.total_amount, `Invoice ${invoice.invoice_number}`)
    : null;

  useEffect(() => {
    if (!upiLink) {
      setUpiQrData(null);
      return;
    }
    try {
      setUpiQrData(qrCodeSvgDataUrl(upiLink));
    } catch {
      setUpiQrData(null);
    }
  }, [upiLink]);

  const title = compositionScheme
    ? "Bill of Supply / Retail Cash Memo (ಮಾರಾಟ ರಶೀದಿ)"
    : business?.tax_mode === "NON_GST_RETAIL" ? "Retail Cash Memo / ಚಿಲ್ಲರೆ ಮಾರಾಟ ರಶೀದಿ" : "Tax Invoice / ತೆರಿಗೆ ಬಿಲ್";

  const receiptContent = (
    <>
      <style>{`
        @media print {
          @page { size: ${paperWidth}mm auto; margin: 0; }
          html, body { width: ${paperWidth}mm !important; margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          #printable-receipt, #printable-receipt * { visibility: visible !important; }
          #printable-receipt { position: absolute !important; left: 0 !important; top: 0 !important; width: ${paperWidth}mm !important; max-width: ${paperWidth}mm !important; padding: 3mm !important; margin: 0 !important; box-sizing: border-box !important; font-size: 9pt !important; }
          #printable-receipt table { table-layout: fixed; }
          #printable-receipt img { print-color-adjust: exact; }
        }
      `}</style>
      <div id="printable-receipt" className="font-mono text-[#000000] p-4 mx-auto text-xs leading-tight bg-[#FFFFFF]" style={{ width: `${paperWidth}mm`, maxWidth: "100%" }}>
        <div className="text-center pb-2 border-b border-dashed border-black">
          {receiptSettings.headerBlessing && (
            <p className="text-[10px] font-bold text-gray-700 tracking-wider mb-0.5">{receiptSettings.headerBlessing}</p>
          )}
          <h2 className="text-base font-bold uppercase">{business?.name || businessName || "SmartStock Retail Store"}</h2>
          {receiptSettings.tagline && (
            <p className="text-[9px] text-gray-700 italic">{receiptSettings.tagline}</p>
          )}
          <p className="text-[10px] font-semibold">{title}</p>
          {business?.legal_name && <p className="text-[10px]">{business.legal_name}</p>}
          <p className="text-[10px]">{business?.address_line || "Main Bazaar Road"}</p>
          <p className="text-[10px]">
            {business?.city || "Haveri"}, {business?.district || "Haveri"}, {business?.state || "Karnataka"} - {business?.pincode || "581110"}
          </p>
          {business?.phone && <p className="text-[10px]">Phone: {business.phone}</p>}
          {business?.gstin && receiptSettings.showGstin !== false && (
            <p className="text-[10px] font-bold mt-1">GSTIN: {business.gstin}</p>
          )}
          {compositionScheme && (
            <p className="text-[9px] font-bold mt-1">Composition taxable person, not eligible to collect tax on supplies (ಸಂಯೋಜಿತ ತೆರಿಗೆದಾರ)</p>
          )}
        </div>

        <div className="py-2 border-b border-dashed border-black text-[10px] space-y-0.5">
          <div className="flex justify-between"><span>Invoice No / ಬಿಲ್ ಸಂಖ್ಯೆ:</span><span className="font-bold">{invoice.invoice_number}</span></div>
          <div className="flex justify-between"><span>Date &amp; Time / ದಿನಾಂಕ:</span><span>{new Date(invoice.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</span></div>
          {invoice.customer_name && <div className="flex justify-between"><span>Customer / ಗ್ರಾಹಕ:</span><span>{invoice.customer_name}</span></div>}
          {invoice.customer_phone && <div className="flex justify-between"><span>Phone / ದೂರವಾಣಿ:</span><span>{invoice.customer_phone}</span></div>}
          <div className="flex justify-between"><span>Cashier / ಬಿಲ್ಲರ್:</span><span>{invoice.created_by_name || "Staff"}</span></div>
        </div>

        <table className="w-full my-2 text-[9px]">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 w-[48%]">Item / ವಸ್ತು</th>
              <th className="text-right py-1 w-[30%]">Qty × Rate / ಪ್ರಮಾಣ × ದರ</th>
              <th className="text-right py-1 w-[22%]">Total / ಒಟ್ಟು</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-dotted divide-gray-400">
            {invoice.items?.map((item, idx) => (
              <tr key={idx}>
                <td className="py-1 pr-1 break-words">
                  <div className="font-semibold">{item.product_name}</div>
                  {showTax && item.tax_rate_percent > 0 && <div className="text-[8px]">GST {item.tax_rate_percent}%</div>}
                </td>
                <td className="text-right py-1 whitespace-nowrap">{item.quantity} {item.unit} × ₹{item.unit_price.toFixed(2)}</td>
                <td className="text-right py-1 font-semibold">₹{item.total_amount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-dashed border-black pt-2 space-y-1 text-[10px]">
          <div className="flex justify-between"><span>Subtotal / ಉಪಮೊತ್ತ:</span><span>₹{invoice.subtotal.toFixed(2)}</span></div>
          {invoice.discount_amount > 0 && <div className="flex justify-between"><span>Savings / Discount / ರಿಯಾಯಿತಿ:</span><span>- ₹{invoice.discount_amount.toFixed(2)}</span></div>}
          {showTax && invoice.cgst_amount > 0 && <div className="flex justify-between"><span>CGST:</span><span>+ ₹{invoice.cgst_amount.toFixed(2)}</span></div>}
          {showTax && invoice.sgst_amount > 0 && <div className="flex justify-between"><span>SGST:</span><span>+ ₹{invoice.sgst_amount.toFixed(2)}</span></div>}
          <div className="flex justify-between text-xs font-bold border-t border-b border-black py-1"><span>TOTAL / ಒಟ್ಟು ಮೊತ್ತ:</span><span>₹{invoice.total_amount.toFixed(2)}</span></div>
          <div className="flex justify-between pt-1"><span>Payment Mode / ಪಾವತಿ ವಿಧಾನ:</span><span className="font-bold">{invoice.payment_method} ({invoice.payment_status || "PAID"})</span></div>
          {invoice.payment_method === "CREDIT" && (
            <>
              <div className="flex justify-between"><span>Paid Now / ಈಗ ಪಾವತಿಸಿದ್ದು:</span><span className="font-bold">₹{(invoice.paid_amount || 0).toFixed(2)}</span></div>
              <div className="flex justify-between font-bold"><span>Khata Due / ಖಾತೆ ಬಾಕಿ:</span><span>₹{((invoice.credit_amount !== undefined ? invoice.credit_amount : (invoice.total_amount - (invoice.paid_amount || 0)))).toFixed(2)}</span></div>
            </>
          )}
        </div>

        {upiQrData && (
          <div className="text-center pt-2">
            <img src={upiQrData} alt="UPI payment QR code" className="w-24 h-24 mx-auto" />
            <p className="text-[8px]">Scan to pay via UPI / UPI ಮೂಲಕ ಪಾವತಿಸಲು ಸ್ಕ್ಯಾನ್ ಮಾಡಿ</p>
          </div>
        )}
        <div className="text-center pt-3 text-[9px] text-gray-800 space-y-1 border-t border-dashed border-black mt-3">
          <p className="font-semibold">{receiptSettings.footerGreeting || "ಧನ್ಯವಾದಗಳು / Thank you"}</p>
          {receiptSettings.returnPolicy && (
            <p className="text-[8px] text-gray-600 italic">{receiptSettings.returnPolicy}</p>
          )}
        </div>
      </div>
    </>
  );

  if (onClose) {
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#080B10]/85 backdrop-blur-md p-4 overflow-y-auto">
        <div className="liquid-modal p-5 max-w-sm w-full relative text-[#F8FAFC]">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/[0.08]">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#6EE7B7]">
              Thermal Receipt Preview
            </span>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg transition-colors"
              aria-label="Close receipt preview"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="mb-4 max-h-[65vh] overflow-y-auto rounded-xl bg-[#FFFFFF] p-1 shadow-inner">
            {receiptContent}
          </div>
          <div className="flex gap-2 justify-end border-t border-white/[0.08] pt-3">
            <button
              type="button"
              onClick={onClose}
              className="liquid-btn-secondary px-3.5 py-2 rounded-xl text-xs font-semibold"
            >
              Close / ಮುಚ್ಚಿ
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="liquid-btn-primary flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / ಮುದ್ರಿಸಿ</span>
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
  }

  return receiptContent;
};
