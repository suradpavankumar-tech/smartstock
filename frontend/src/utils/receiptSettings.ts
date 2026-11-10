/**
 * Thermal Receipt and POS Billing Preferences for SmartStock
 * Persists customized headers, footers, paper sizes, and toggles in localStorage.
 */

export interface ReceiptSettings {
  headerBlessing: string;
  tagline: string;
  footerGreeting: string;
  returnPolicy: string;
  paperWidth: 58 | 80;
  showGstin: boolean;
  showUpiQr: boolean;
  showCashierName: boolean;
  autoPrintOnCheckout: boolean;
  roundOffCash: boolean;
  scannerBeep: boolean;
  defaultLowStockThreshold: number;
}

const STORAGE_KEY = "smartstock_receipt_settings";

export const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  headerBlessing: "ಶ್ರೀ ಗುರು ಬಸವೇಶ್ವರ ಪ್ರಸನ್ನ",
  tagline: "Quality Provisions & Wholesale Kirana Rates",
  footerGreeting: "ಧನ್ಯವಾದಗಳು! ಮತ್ತೆ ಭೇಟಿ ನೀಡಿ / Thank you, Visit again!",
  returnPolicy: "Exchange valid within 2 days with printed bill",
  paperWidth: 58,
  showGstin: true,
  showUpiQr: true,
  showCashierName: true,
  autoPrintOnCheckout: false,
  roundOffCash: true,
  scannerBeep: true,
  defaultLowStockThreshold: 5,
};

export function getReceiptSettings(): ReceiptSettings {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return DEFAULT_RECEIPT_SETTINGS;
    const parsed = JSON.parse(saved);
    return { ...DEFAULT_RECEIPT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_RECEIPT_SETTINGS;
  }
}

export function saveReceiptSettings(settings: ReceiptSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("smartstock:receipt-settings-updated"));
  } catch (err) {
    console.error("Failed to persist receipt settings", err);
  }
}
