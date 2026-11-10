import React, { useCallback, useEffect, useState } from "react";
import { Banknote, CheckCircle2, RefreshCw } from "lucide-react";
import { api } from "../../services/api";
import { CashShift } from "../../types";
import { useLanguage } from "../../context/LanguageContext";

interface CashTillWidgetProps {
  embedded?: boolean;
  onShiftChange?: (shift: CashShift | null) => void;
}

export const CashTillWidget: React.FC<CashTillWidgetProps> = ({
  embedded = false,
  onShiftChange,
}) => {
  const { t } = useLanguage();
  const [shift, setShift] = useState<CashShift | null>(null);
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const current = await api.getCurrentCashShift();
      setShift(current);
      onShiftChange?.(current);
      setError("");
    } catch (err: any) {
      setError(t("cashShiftLoadFailed"));
    }
  }, [t, onShiftChange]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const openShift = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(openingFloat);
    if (!Number.isFinite(amount) || amount < 0) return;
    setBusy(true);
    setError("");
    try {
      const opened = await api.openCashShift(amount);
      setShift(opened);
      onShiftChange?.(opened);
      setOpeningFloat("");
      setMessage(t("shiftOpened"));
    } catch (err: any) {
      setError(t("cashShiftOpenFailed"));
    } finally {
      setBusy(false);
    }
  };

  const closeShift = async (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(countedCash);
    if (!Number.isFinite(amount) || amount < 0) return;
    setBusy(true);
    setError("");
    try {
      const closed = await api.closeCashShift(amount);
      setShift(null);
      onShiftChange?.(null);
      setCountedCash("");
      setMessage(`${t("shiftClosed")} ${t("cashVariance")}: ₹${(closed.variance || 0).toFixed(2)}`);
    } catch (err: any) {
      setError(t("cashShiftCloseFailed"));
    } finally {
      setBusy(false);
    }
  };

  const wrapperClass = embedded
    ? "px-5 sm:px-7 py-3.5 border-b border-white/[0.08] bg-[#080B10]/25 relative"
    : "liquid-glass-interactive rounded-2xl p-4 sm:p-5 relative overflow-hidden";

  return (
    <section className={wrapperClass}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 text-[#F8FAFC]">
          <span className="p-2 rounded-xl bg-[#FBBF24]/15 text-[#FBBF24] border border-[#FBBF24]/30 shadow-[0_0_10px_rgba(251,191,36,0.2)]">
            <Banknote className="w-4 h-4" />
          </span>
          <h2 className="text-sm font-bold tracking-tight">{t("cashTill")}</h2>
          {shift && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#5EEAD4]/40 font-semibold shadow-[0_0_8px_rgba(94,234,212,0.25)]">
              {t("openStatus")}
            </span>
          )}
        </div>
        <button
          onClick={refresh}
          disabled={busy}
          title={t("refresh")}
          className="p-1.5 rounded-xl liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC] active:scale-[0.98]"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? "animate-spin text-[#5EEAD4]" : ""}`} />
        </button>
      </div>

      {shift ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-[repeat(5,minmax(0,1fr))_minmax(225px,1.75fr)] gap-3 items-end">
          <div>
            <div className="text-[10px] text-[#A1AEBB]">{t("openingFloat")}</div>
            <div className="font-mono font-bold text-sm text-[#F8FAFC]">₹{shift.opening_float.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#A1AEBB]">{t("cashSales")}</div>
            <div className="font-mono font-bold text-sm text-[#6EE7B7]">₹{shift.cash_sales.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#A1AEBB]">{t("cashExpenses")}</div>
            <div className="font-mono font-bold text-sm text-[#FB7185]">₹{shift.cash_expenses.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#A1AEBB]">{t("cashRefunds")}</div>
            <div className="font-mono font-bold text-sm text-[#FBBF24]">₹{shift.cash_refunds.toFixed(2)}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#A1AEBB]">{t("expectedCash")}</div>
            <div className="font-mono font-extrabold text-[#6EE7B7] drop-shadow-[0_0_8px_rgba(110,231,183,0.4)]">
              ₹{shift.expected_cash.toFixed(2)}
            </div>
          </div>
          <form onSubmit={closeShift} className="flex gap-1.5">
            <input
              type="number"
              min="0"
              step="0.01"
              required
              value={countedCash}
              onChange={(e) => setCountedCash(e.target.value)}
              placeholder={t("countedCash")}
              aria-label={t("countedCash")}
              className="min-w-0 w-full px-2 py-1.5 text-xs liquid-input text-[#F8FAFC]"
            />
            <button
              type="submit"
              disabled={busy}
              className="px-2.5 py-1.5 whitespace-nowrap text-[10px] rounded-xl liquid-btn-secondary font-bold disabled:opacity-50"
            >
              {t("shiftClose")}
            </button>
          </form>
        </div>
      ) : (
        <form onSubmit={openShift} className="flex flex-col sm:flex-row sm:items-center gap-2">
          <span className="text-xs text-[#A1AEBB] flex-1">{t("noOpenShift")}</span>
          <input
            type="number"
            min="0"
            step="0.01"
            required
            value={openingFloat}
            onChange={(e) => setOpeningFloat(e.target.value)}
            placeholder={t("openingFloat")}
            aria-label={t("openingFloat")}
            className="w-full sm:w-48 px-2.5 py-2 text-xs liquid-input text-[#F8FAFC]"
          />
          <button
            type="submit"
            disabled={busy}
            className="px-3 py-2 text-xs rounded-xl liquid-btn-primary font-bold disabled:opacity-50"
          >
            {t("shiftOpen")}
          </button>
        </form>
      )}

      {(message || error) && (
        <div className={`mt-2 flex items-center gap-1.5 text-[10px] ${error ? "text-[#FB7185]" : "text-[#6EE7B7]"}`}>
          {message && <CheckCircle2 className="w-3.5 h-3.5" />}
          {error || message}
        </div>
      )}
    </section>
  );
};
