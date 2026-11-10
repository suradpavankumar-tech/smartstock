import { Invoice, PurchaseOrder } from "../types";

export function getIndiaWhatsAppNumber(phone?: string | null): string | null {
  if (!phone) return null;
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
  return /^91[6-9]\d{9}$/.test(digits) ? digits : null;
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const number = getIndiaWhatsAppNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(message)}` : null;
}

export function buildUpiPaymentLink(vpa: string, shopName: string, amount: number, note: string): string {
  const params = new URLSearchParams({
    pa: vpa.trim(),
    pn: shopName,
    am: amount.toFixed(2),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${params.toString()}`;
}

export function openWhatsAppUrl(url: string | null): void {
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Builds an articulate, itemized digital receipt formatted for WhatsApp.
 */
export function buildInvoiceWhatsAppMessage(
  invoice: Invoice,
  shopName: string = "SmartStock Retail",
  shopPhone?: string,
  isKannada: boolean = false
): string {
  const dateStr = new Date(invoice.created_at).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const lines: string[] = [];

  if (isKannada) {
    lines.push(`🧾 *${shopName} - ಡಿಜಿಟಲ್ ರಸೀದಿ*`);
    if (shopPhone) lines.push(`📞 ಸಂಪರ್ಕ: ${shopPhone}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📄 ಬಿಲ್ಲು ಸಂಖ್ಯೆ: *${invoice.invoice_number}*`);
    lines.push(`📅 ದಿನಾಂಕ: ${dateStr}`);
    if (invoice.customer_name) lines.push(`👤 ಗ್ರಾಹಕರು: ${invoice.customer_name}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

    if (invoice.items && invoice.items.length > 0) {
      invoice.items.forEach((item, idx) => {
        lines.push(
          `${idx + 1}. *${item.product_name}* (${item.quantity} ${item.unit || "unit"} × ₹${item.unit_price}) = ₹${item.total_amount.toFixed(2)}`
        );
      });
      lines.push(`─────────────────────`);
    }

    lines.push(`ಒಟ್ಟು ಮೊತ್ತ (Subtotal): ₹${invoice.subtotal.toFixed(2)}`);
    if (invoice.tax_amount > 0) lines.push(`ಜಿಎಸ್‌ಟಿ ತೆರಿಗೆ (GST): ₹${invoice.tax_amount.toFixed(2)}`);
    if (invoice.discount_amount > 0) lines.push(`ರಿಯಾಯಿತಿ (Discount): -₹${invoice.discount_amount.toFixed(2)}`);
    lines.push(`*ಅಂತಿಮ ಮೊತ್ತ (Grand Total): ₹${invoice.total_amount.toFixed(2)}*`);
    lines.push(`ಪಾವತಿ ವಿಧಾನ: *${invoice.payment_method}* (${invoice.payment_status || "PAID"})`);
    if (invoice.payment_method === "CREDIT") {
      const creditDue = invoice.credit_amount !== undefined ? invoice.credit_amount : (invoice.total_amount - (invoice.paid_amount || 0));
      lines.push(`ಈಗ ಪಾವತಿ (Paid Now): ₹${(invoice.paid_amount || 0).toFixed(2)}`);
      lines.push(`*ಖಾತೆ ಬಾಕಿ (Khata Due): ₹${creditDue.toFixed(2)}*`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🙏 ನಿಮ್ಮ ಭೇಟಿಗೆ ಧನ್ಯವಾದಗಳು! ಮತ್ತೆ ಬನ್ನಿ.`);
  } else {
    lines.push(`🧾 *${shopName} - Digital Tax Receipt*`);
    if (shopPhone) lines.push(`📞 Phone: ${shopPhone}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`📄 Invoice #: *${invoice.invoice_number}*`);
    lines.push(`📅 Date: ${dateStr}`);
    if (invoice.customer_name) lines.push(`👤 Customer: ${invoice.customer_name}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);

    if (invoice.items && invoice.items.length > 0) {
      invoice.items.forEach((item, idx) => {
        lines.push(
          `${idx + 1}. *${item.product_name}*\n   ${item.quantity} ${item.unit || "unit"} × ₹${item.unit_price} = ₹${item.total_amount.toFixed(2)}`
        );
      });
      lines.push(`─────────────────────`);
    }

    lines.push(`Subtotal: ₹${invoice.subtotal.toFixed(2)}`);
    if (invoice.tax_amount > 0) lines.push(`Tax (CGST+SGST): ₹${invoice.tax_amount.toFixed(2)}`);
    if (invoice.discount_amount > 0) lines.push(`Discount: -₹${invoice.discount_amount.toFixed(2)}`);
    lines.push(`*Grand Total: ₹${invoice.total_amount.toFixed(2)}*`);
    lines.push(`Payment Mode: *${invoice.payment_method}* (${invoice.payment_status || "PAID"})`);
    if (invoice.payment_method === "CREDIT") {
      const creditDue = invoice.credit_amount !== undefined ? invoice.credit_amount : (invoice.total_amount - (invoice.paid_amount || 0));
      lines.push(`Amount Paid Now: ₹${(invoice.paid_amount || 0).toFixed(2)}`);
      lines.push(`*Khata Due Balance: ₹${creditDue.toFixed(2)}*`);
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🙏 Thank you for shopping with us! Please visit again.`);
  }

  return lines.join("\n");
}

/**
 * Builds a polite, professional Khata credit payment reminder with UPI payment link.
 */
export function buildKhataReminderWhatsAppMessage(
  customerName: string,
  dueAmount: number,
  shopName: string,
  upiVpa?: string,
  isKannada: boolean = false
): string {
  const lines: string[] = [];
  const formattedDue = dueAmount.toFixed(2);

  if (isKannada) {
    lines.push(`ನಮಸ್ಕಾರ ${customerName} ಅವರೇ,`);
    lines.push(`ಇದು *${shopName}* ವತಿಯಿಂದ ಖಾತೆ ಬಾಕಿ ಪಾವತಿಯ ಜ್ಞಾಪನೆ.`);
    lines.push(``);
    lines.push(`ನಿಮ್ಮ ಖಾತೆಯ ಪ್ರಸ್ತುತ ಬಾಕಿ ಮೊತ್ತ: *₹${formattedDue}*`);
    lines.push(``);
    if (upiVpa) {
      const upiUrl = buildUpiPaymentLink(upiVpa, shopName, dueAmount, `Khata Due ${shopName}`);
      lines.push(`GooglePay / PhonePe / Paytm ಮೂಲಕ ಪಾವತಿಸಲು ಕೆಳಗಿನ ಲಿಂಕ್ ಬಳಸಿ:`);
      lines.push(upiUrl);
      lines.push(``);
      lines.push(`ಅಥವಾ UPI ID ಗೆ ಪಾವತಿಸಿ: *${upiVpa}*`);
      lines.push(``);
    }
    lines.push(`ದಯವಿಟ್ಟು ಅನುಕೂಲವಾದಾಗ ಪಾವತಿಸಿ. ಧನ್ಯವಾದಗಳು!`);
  } else {
    lines.push(`Dear ${customerName},`);
    lines.push(`Warm greetings from *${shopName}*.`);
    lines.push(``);
    lines.push(`This is a friendly reminder that your outstanding store khata balance is *₹${formattedDue}*.`);
    lines.push(``);
    if (upiVpa) {
      const upiUrl = buildUpiPaymentLink(upiVpa, shopName, dueAmount, `Khata Payment ${shopName}`);
      lines.push(`You can pay directly via GooglePay / PhonePe / Paytm using this link:`);
      lines.push(upiUrl);
      lines.push(``);
      lines.push(`Or transfer directly to our UPI ID: *${upiVpa}*`);
      lines.push(``);
    }
    lines.push(`Please clear the dues at your earliest convenience. Thank you for your continued trust!`);
  }

  return lines.join("\n");
}

/**
 * Builds an articulate purchase order stock indent formatted to transmit directly to a supplier / distributor.
 */
export function buildPurchaseOrderWhatsAppMessage(
  po: PurchaseOrder,
  supplierName: string,
  supplierContact?: string,
  shopName: string = "SmartStock Retail",
  shopCity?: string,
  shopPhone?: string,
  isKannada: boolean = false
): string {
  const lines: string[] = [];
  const dateStr = po.order_date || new Date().toISOString().split("T")[0];

  if (isKannada) {
    lines.push(`📦 *ಖರೀದಿ ಆದೇಶ (PURCHASE ORDER): ${po.po_number}*`);
    lines.push(`ಅಂಗಡಿ: *${shopName}* (${shopCity || "Haveri"})`);
    if (shopPhone) lines.push(`ಸಂಪರ್ಕ: ${shopPhone}`);
    lines.push(`ದಿನಾಂಕ: ${dateStr}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`ಪೂರೈಕೆದಾರರು: *${supplierName}*`);
    if (supplierContact) lines.push(`ಗಮನಕ್ಕೆ: ${supplierContact}`);
    lines.push(``);
    lines.push(`ನಮಸ್ಕಾರ, ದಯವಿಟ್ಟು ನಮ್ಮ ಅಂಗಡಿಗೆ ಈ ಕೆಳಗಿನ ವಸ್ತುಗಳನ್ನು ಪೂರೈಸಿ:`);
    lines.push(``);

    if (po.items && po.items.length > 0) {
      po.items.forEach((item, idx) => {
        lines.push(
          `${idx + 1}. *${item.product_name || "Product"}* — ${item.quantity_ordered} ${item.unit || "unit"} (ದರ: ₹${item.unit_cost.toFixed(2)}) = ₹${item.total_cost.toFixed(2)}`
        );
      });
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`ಒಟ್ಟು ವಸ್ತುಗಳು: *${po.items?.length || 0} ಸಾಲುಗಳು*`);
    lines.push(`*ಅಂದಾಜು ಒಟ್ಟು ಮೊತ್ತ: ₹${po.total_amount.toFixed(2)}*`);
    if (po.expected_delivery_date) lines.push(`ಅಪೇಕ್ಷಿತ ವಿತರಣಾ ದಿನಾಂಕ: ${po.expected_delivery_date}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`ದಯವಿಟ್ಟು ಆದೇಶವನ್ನು ದೃಢೀಕರಿಸಿ ಮತ್ತು ವಿತರಣಾ ಸಮಯವನ್ನು ತಿಳಿಸಿ. ಧನ್ಯವಾದಗಳು!`);
  } else {
    lines.push(`📦 *PURCHASE ORDER: ${po.po_number}*`);
    lines.push(`From: *${shopName}* (${shopCity || "Haveri"})`);
    if (shopPhone) lines.push(`Phone: ${shopPhone}`);
    lines.push(`Date: ${dateStr}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`To: *${supplierName}*`);
    if (supplierContact) lines.push(`Attn: ${supplierContact}`);
    lines.push(``);
    lines.push(`Dear Supplier, please dispatch the following stock indent to our shop:`);
    lines.push(``);

    if (po.items && po.items.length > 0) {
      po.items.forEach((item, idx) => {
        lines.push(
          `${idx + 1}. *${item.product_name || "Product"}* — ${item.quantity_ordered} ${item.unit || "unit"} (Rate: ₹${item.unit_cost.toFixed(2)}) = ₹${item.total_cost.toFixed(2)}`
        );
      });
    }

    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Total Items: *${po.items?.length || 0} line(s)*`);
    lines.push(`*Estimated Order Value: ₹${po.total_amount.toFixed(2)}*`);
    if (po.expected_delivery_date) lines.push(`Expected Delivery: ${po.expected_delivery_date}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`Please confirm order receipt and expected delivery timing. Thank you!`);
  }

  return lines.join("\n");
}

/**
 * Builds an executive Day-End Store Closing Summary (Z-Report) for WhatsApp.
 */
export function buildDayEndReportWhatsAppMessage(
  summary: {
    shopName: string;
    cashierName: string;
    shiftId?: number;
    openingFloat: number;
    totalSales: number;
    totalInvoices: number;
    cashSales: number;
    upiSales: number;
    cardSales: number;
    creditSales: number;
    khataCollectedToday: number;
    expectedCash: number;
    countedCash: number;
    variance: number;
    topSellers?: Array<{ name: string; qty: number; revenue: number }>;
  },
  isKannada: boolean = false
): string {
  const dateStr = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const timeStr = new Date().toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const lines: string[] = [];

  if (isKannada) {
    lines.push(`🏪 *${summary.shopName} - ದಿನದ ಮುಕ್ತಾಯದ ವರದಿ (Z-REPORT)*`);
    lines.push(`📅 ದಿನಾಂಕ: ${dateStr} • ${timeStr}`);
    lines.push(`👤 ಕ್ಯಾಷಿಯರ್ / ಸಿಬ್ಬಂದಿ: ${summary.cashierName}`);
    if (summary.shiftId) lines.push(`🔖 ಶಿಫ್ಟ್ ಸಂಖ್ಯೆ: #${summary.shiftId}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`💰 *ಮಾರಾಟದ ವಿವರ (SALES SUMMARY):*`);
    lines.push(`• ಒಟ್ಟು ವ್ಯಾಪಾರ: *₹${summary.totalSales.toFixed(2)}* (${summary.totalInvoices} ರಸೀದಿಗಳು)`);
    lines.push(`• ನಗದು (Cash): ₹${summary.cashSales.toFixed(2)}`);
    lines.push(`• ಆನ್‌ಲೈನ್ UPI: ₹${summary.upiSales.toFixed(2)}`);
    if (summary.cardSales > 0) lines.push(`• ಕಾರ್ಡ್ (Card): ₹${summary.cardSales.toFixed(2)}`);
    if (summary.creditSales > 0) lines.push(`• ಖಾತೆ ಉದ್ದರಿ (Khata Given): ₹${summary.creditSales.toFixed(2)}`);
    if (summary.khataCollectedToday > 0) lines.push(`• ಹಳೆಯ ಖಾತೆ ವಸೂಲಾತಿ (Khata Collected): ₹${summary.khataCollectedToday.toFixed(2)}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🪙 *ನಗದು ಡ್ರಾಯರ್ ಲೆಕ್ಕ (CASH AUDIT):*`);
    lines.push(`• ಆರಂಭಿಕ ನಗದು (Float): ₹${summary.openingFloat.toFixed(2)}`);
    lines.push(`• ಇರಬೇಕಾದ ನಗದು (Expected): ₹${summary.expectedCash.toFixed(2)}`);
    lines.push(`• ಎಣಿಸಿದ ನಗದು (Counted): ₹${summary.countedCash.toFixed(2)}`);
    if (Math.abs(summary.variance) < 1) {
      lines.push(`• ವ್ಯತ್ಯಾಸ (Variance): *₹0.00 (ಸರಿಯಾಗಿದೆ ✅)*`);
    } else if (summary.variance > 0) {
      lines.push(`• ಹೆಚ್ಚುವರಿ (Excess): *+₹${summary.variance.toFixed(2)}*`);
    } else {
      lines.push(`• ಕೊರತೆ (Shortage): *₹${summary.variance.toFixed(2)} ⚠️*`);
    }
    if (summary.topSellers && summary.topSellers.length > 0) {
      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`⭐ *ಹೆಚ್ಚು ಮಾರಾಟವಾದ ಸರಕುಗಳು:*`);
      summary.topSellers.slice(0, 3).forEach((item, idx) => {
        lines.push(`${idx + 1}. ${item.name} (${item.qty} ಮಾರಾಟ - ₹${item.revenue.toFixed(0)})`);
      });
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`_SmartStock ಚಿಲ್ಲರೆ ನಿರ್ವಹಣಾ ವೇದಿಕೆಯಿಂದ ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಸಿದ್ಧಪಡಿಸಲಾಗಿದೆ._`);
  } else {
    lines.push(`🏪 *${summary.shopName} - DAY-END CLOSING (Z-REPORT)*`);
    lines.push(`📅 Date: ${dateStr} • ${timeStr}`);
    lines.push(`👤 Cashier / Staff: ${summary.cashierName}`);
    if (summary.shiftId) lines.push(`🔖 Register Shift: #${summary.shiftId}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`💰 *SALES & REVENUE SUMMARY:*`);
    lines.push(`• Total Gross Sales: *₹${summary.totalSales.toFixed(2)}* (${summary.totalInvoices} Bills)`);
    lines.push(`• Cash Collected: ₹${summary.cashSales.toFixed(2)}`);
    lines.push(`• UPI / Digital: ₹${summary.upiSales.toFixed(2)}`);
    if (summary.cardSales > 0) lines.push(`• Card Payments: ₹${summary.cardSales.toFixed(2)}`);
    if (summary.creditSales > 0) lines.push(`• Khata (Credit) Extended: ₹${summary.creditSales.toFixed(2)}`);
    if (summary.khataCollectedToday > 0) lines.push(`• Old Khata Dues Collected: ₹${summary.khataCollectedToday.toFixed(2)}`);
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`🪙 *CASH TILL RECONCILIATION:*`);
    lines.push(`• Opening Cash Float: ₹${summary.openingFloat.toFixed(2)}`);
    lines.push(`• Expected in Till: ₹${summary.expectedCash.toFixed(2)}`);
    lines.push(`• Physical Cash Counted: ₹${summary.countedCash.toFixed(2)}`);
    if (Math.abs(summary.variance) < 1) {
      lines.push(`• Till Variance: *₹0.00 (EXACT MATCH ✅)*`);
    } else if (summary.variance > 0) {
      lines.push(`• Till Variance: *+₹${summary.variance.toFixed(2)} (Cash Surplus)*`);
    } else {
      lines.push(`• Till Variance: *₹${summary.variance.toFixed(2)} (Cash Shortage ⚠️)*`);
    }
    if (summary.topSellers && summary.topSellers.length > 0) {
      lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
      lines.push(`⭐ *TOP SELLING PRODUCTS TODAY:*`);
      summary.topSellers.slice(0, 3).forEach((item, idx) => {
        lines.push(`${idx + 1}. ${item.name} (${item.qty} units - ₹${item.revenue.toFixed(0)})`);
      });
    }
    lines.push(`━━━━━━━━━━━━━━━━━━━━━`);
    lines.push(`_Automated store summary generated by SmartStock Retail Engine._`);
  }

  return lines.join("\n");
}
