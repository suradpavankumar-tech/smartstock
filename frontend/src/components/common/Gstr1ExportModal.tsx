import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Gstr1ReportOut } from "../../types";
import { api } from "../../services/api";
import { useLanguage } from "../../context/LanguageContext";
import { KannadaText } from "./KannadaText";
import {
  FileSpreadsheet,
  Download,
  Calendar,
  CheckCircle2,
  AlertCircle,
  X,
} from "lucide-react";

interface Gstr1ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  shopName?: string;
  shopGstin?: string;
}

const toLocalISODate = (dateObj: Date): string => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const Gstr1ExportModal: React.FC<Gstr1ExportModalProps> = ({
  isOpen,
  onClose,
  shopName = "SmartStock Retail",
  shopGstin,
}) => {
  const { language, formatMoney, formatDateLocalized } = useLanguage();
  const isKn = language === "kn";

  const today = new Date();
  const currentMonthStart = toLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1));
  const currentMonthEnd = toLocalISODate(today);

  const [startDate, setStartDate] = useState(currentMonthStart);
  const [endDate, setEndDate] = useState(currentMonthEnd);
  const [activePreset, setActivePreset] = useState<"thisMonth" | "lastMonth" | "last90" | "custom">("thisMonth");
  const [report, setReport] = useState<Gstr1ReportOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "b2cs" | "hsn" | "b2b">("summary");

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getGstr1Report(startDate, endDate);
      setReport(data);
    } catch (err: any) {
      setError(err.message || "Failed to load GSTR-1 statement");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setDownloadError(null);
      fetchReport();
    }
  }, [isOpen, startDate, endDate]);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      await api.downloadGstr1Csv(startDate, endDate);
    } catch (err: any) {
      setDownloadError(err.message || "Failed to download GSTR-1 CSV");
    } finally {
      setDownloading(false);
    }
  };

  const setPreset = (preset: "thisMonth" | "lastMonth" | "last90") => {
    const now = new Date();
    setActivePreset(preset);
    if (preset === "thisMonth") {
      setStartDate(toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 1)));
      setEndDate(toLocalISODate(now));
    } else if (preset === "lastMonth") {
      setStartDate(toLocalISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setEndDate(toLocalISODate(new Date(now.getFullYear(), now.getMonth(), 0)));
    } else if (preset === "last90") {
      setStartDate(toLocalISODate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 90)));
      setEndDate(toLocalISODate(now));
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="liquid-modal w-full max-w-4xl max-h-[88vh] flex flex-col overflow-hidden text-[#F8FAFC]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-gradient-to-r from-[#5EEAD4]/10 via-[#6EE7B7]/[0.06] to-transparent">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_15px_rgba(94,234,212,0.22)] shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold tracking-tight text-[#F8FAFC]">
                  {isKn ? "ಜಿಎಸ್‌ಟಿಆರ್-1 ಮಾರಾಟ ವರದಿ" : "GSTR-1 Tax Return Exporter"}
                </h2>
                <span className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#6EE7B7]/12 text-[#6EE7B7] font-semibold border border-[#5EEAD4]/35">
                  CA & Excel Ready
                </span>
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] truncate mt-0.5">
                {shopName} • {shopGstin || "Unregistered Retail Dealer"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg active:scale-[0.98] transition-colors"
            aria-label="Close GSTR-1 Exporter"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Presets Bar */}
        <div className="px-6 py-3.5 bg-[#080B10]/45 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 bg-[#080B10]/80 border border-white/[0.14] px-3 py-1.5 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-[#5EEAD4]" />
              <span className="text-[#A1AEBB] font-medium">{isKn ? "ಪ್ರಾರಂಭ:" : "From:"}</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActivePreset("custom");
                }}
                className="bg-transparent font-mono font-semibold text-[#F8FAFC] focus:outline-none [color-scheme:dark] tabular-nums"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-[#080B10]/80 border border-white/[0.14] px-3 py-1.5 rounded-xl">
              <Calendar className="w-3.5 h-3.5 text-[#5EEAD4]" />
              <span className="text-[#A1AEBB] font-medium">{isKn ? "ಅಂತ್ಯ:" : "To:"}</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActivePreset("custom");
                }}
                className="bg-transparent font-mono font-semibold text-[#F8FAFC] focus:outline-none [color-scheme:dark] tabular-nums"
              />
            </div>

            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: "thisMonth", label: isKn ? "ಈ ತಿಂಗಳು" : "This Month" },
                  { id: "lastMonth", label: isKn ? "ಕಳೆದ ತಿಂಗಳು" : "Last Month" },
                  { id: "last90", label: isKn ? "90 ದಿನಗಳು" : "Last 90d" },
                ] as const
              ).map((p) => {
                const active = activePreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPreset(p.id)}
                    className={`px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border transition-all ${
                      active
                        ? "bg-[#6EE7B7]/14 border-[#5EEAD4]/40 text-[#6EE7B7]"
                        : "bg-white/[0.04] border-white/[0.12] text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.08]"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={handleDownload}
            disabled={downloading || loading || !report}
            className="liquid-btn-primary px-4 py-2 disabled:opacity-50 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Download className="w-4 h-4" />
            {downloading
              ? isKn
                ? "ಡೌನ್‌ಲೋಡ್ ಆಗುತ್ತಿದೆ..."
                : "Generating CSV..."
              : isKn
              ? "GSTR-1 CSV ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ"
              : "Download GSTR-1 CSV"}
          </button>
        </div>

        {/* Underline Content Tabs */}
        <div className="flex border-b border-white/[0.08] px-6 gap-6 bg-[#080B10]/25 text-xs font-semibold overflow-x-auto">
          {(
            [
              {
                key: "summary",
                label: isKn ? "ಮುಖ್ಯ ಸಾರಾಂಶ" : "1. Executive Summary",
              },
              {
                key: "b2cs",
                label: `${isKn ? "ಚಿಲ್ಲರೆ ಮಾರಾಟ (B2CS)" : "2. Retail B2CS (Rate-wise)"} (${report?.b2cs.length || 0})`,
              },
              {
                key: "hsn",
                label: `${isKn ? "ವಸ್ತುಗಳ ಪಟ್ಟಿ (HSN)" : "3. HSN / Product Summary"} (${report?.hsn_summary.length || 0})`,
              },
              {
                key: "b2b",
                label: `${isKn ? "ನೋಂದಾಯಿತ ಬಿಲ್ಲಿಂಗ್ (B2B)" : "4. Registered B2B"} (${report?.b2b.length || 0})`,
              },
            ] as const
          ).map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`py-3 relative whitespace-nowrap transition-colors ${
                  isActive ? "text-[#F8FAFC] font-bold" : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                }`}
              >
                {tab.label}
                {isActive && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6EE7B7] rounded-full shadow-[0_0_8px_#5EEAD4]" />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {downloadError && (
            <div className="p-3 bg-[#FB7185]/12 border border-[#FB7185]/35 rounded-xl text-[#FB7185] text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{downloadError}</span>
              </div>
              <button
                type="button"
                onClick={() => setDownloadError(null)}
                className="text-[#FB7185]/80 hover:text-[#FB7185]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {loading ? (
            <div className="py-16 text-center text-[#A1AEBB] text-xs animate-pulse">
              {isKn ? "ಜಿಎಸ್‌ಟಿ ಲೆಕ್ಕಾಚಾರವಾಗುತ್ತಿದೆ..." : "Compiling GSTR-1 turnover & tax aggregates..."}
            </div>
          ) : error ? (
            <div className="p-4 bg-[#FB7185]/12 border border-[#FB7185]/35 rounded-xl text-[#FB7185] text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : !report ? null : (
            <>
              {activeTab === "summary" && (
                <div className="space-y-5">
                  {/* Hairline 4-Column Tax Telemetry Strip */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-white/[0.08] border border-white/[0.1] rounded-2xl bg-[#080B10]/35 overflow-hidden">
                    <div className="p-4">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#A1AEBB]">
                        {isKn ? "ಒಟ್ಟು ಬಿಲ್ಲುಗಳು" : "Total Invoices"}
                      </div>
                      <div className="text-2xl font-extrabold text-[#F8FAFC] mt-1 font-mono tabular-nums">
                        {report.summary.net_invoices}
                      </div>
                      <div className="text-[11px] text-[#A1AEBB]/80 mt-1 truncate">
                        {report.summary.first_invoice_number || "None"} –{" "}
                        {report.summary.last_invoice_number || "None"}
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#A1AEBB]">
                        {isKn ? "ತೆರಿಗೆಯೋಗ್ಯ ಮೊತ್ತ" : "Taxable Value"}
                      </div>
                      <div className="text-2xl font-extrabold text-[#F8FAFC] mt-1 font-mono tabular-nums">
                        {formatMoney(report.summary.total_taxable_value)}
                      </div>
                      <div className="text-[11px] text-[#A1AEBB]/80 mt-1">
                        {isKn ? "ನಿವ್ವಳ ಮಾರಾಟ ಮೌಲ್ಯ" : "Excl. of GST"}
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#A1AEBB]">
                        {isKn ? "ಒಟ್ಟು ತೆರಿಗೆ (CGST+SGST)" : "Total Tax Collected"}
                      </div>
                      <div className="text-2xl font-extrabold text-[#7DD3FC] mt-1 font-mono tabular-nums">
                        {formatMoney(report.summary.total_tax)}
                      </div>
                      <div className="text-[11px] text-[#A1AEBB]/80 mt-1 tabular-nums">
                        CGST: {formatMoney(report.summary.total_cgst)} • SGST:{" "}
                        {formatMoney(report.summary.total_sgst)}
                      </div>
                    </div>

                    <div className="p-4 bg-[#6EE7B7]/[0.06]">
                      <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#6EE7B7]">
                        {isKn ? "ಒಟ್ಟು ಬಿಲ್ಲಿಂಗ್ ಮೊತ್ತ" : "Grand Total Billed"}
                      </div>
                      <div className="text-2xl font-extrabold text-[#6EE7B7] mt-1 font-mono tabular-nums">
                        {formatMoney(report.summary.grand_total)}
                      </div>
                      <div className="text-[11px] text-[#6EE7B7]/80 mt-1">
                        {isKn ? "ಗ್ರಾಹಕರಿಂದ ಸ್ವೀಕರಿಸಿದ ಒಟ್ಟು" : "Gross Retail Value"}
                      </div>
                    </div>
                  </div>

                  {/* CA Readiness Strip */}
                  <div className="p-4 border border-white/[0.1] rounded-2xl bg-white/[0.025] text-xs space-y-1.5">
                    <div className="font-bold text-[#F8FAFC] flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-[#6EE7B7]" />
                      <span>
                        {isKn ? "ಚಾರ್ಟರ್ಡ್ ಅಕೌಂಟೆಂಟ್ (CA) ಸಲಹೆ:" : "Accountant & CA Readiness Check:"}
                      </span>
                    </div>
                    <p className="text-[#A1AEBB] leading-relaxed">
                      {isKn
                        ? "ಈ ವರದಿಯನ್ನು ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ ನಿಮ್ಮ ಲೆಕ್ಕ ಪರಿಶೋಧಕರಿಗೆ (CA) ಕಳುಹಿಸಬಹುದು. ಇದು B2CS ಚಿಲ್ಲರೆ ಮಾರಾಟ, ತೆರಿಗೆ ದರಗಳು, ಮತ್ತು HSN ವಸ್ತುಗಳ ವಿವರಗಳನ್ನು ಒಳಗೊಂಡಿದ್ದು, GSTR-1 ಪೋರ್ಟಲ್‌ನಲ್ಲಿ ನೇರವಾಗಿ ನಮೂದಿಸಲು ಸೂಕ್ತವಾಗಿದೆ."
                        : "Compiled strictly per GST Council GSTR-1 return specifications. Separates exempt/zero-rated goods from 5%, 12%, and 18% slabs so the downloaded CSV attaches directly to your monthly CA filing."}
                    </p>
                  </div>
                </div>
              )}

              {activeTab === "b2cs" && (
                <div className="space-y-3">
                  <div className="text-xs text-[#A1AEBB]">
                    {isKn
                      ? "ಚಿಲ್ಲರೆ ಗ್ರಾಹಕರ ಮಾರಾಟವನ್ನು ಜಿಎಸ್‌ಟಿ ದರದ ಆಧಾರದ ಮೇಲೆ ವಿಂಗಡಿಸಲಾಗಿದೆ:"
                      : "Retail consumer sales aggregated by applicable GST rate slab:"}
                  </div>
                  <div className="border border-white/[0.1] rounded-2xl overflow-hidden bg-[#080B10]/30">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#080B10]/55 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.08em]">
                        <tr>
                          <th className="p-3.5">GST Rate</th>
                          <th className="p-3.5 text-right">Taxable Value</th>
                          <th className="p-3.5 text-right">Central Tax (CGST)</th>
                          <th className="p-3.5 text-right">State Tax (SGST)</th>
                          <th className="p-3.5 text-right">Total Invoiced</th>
                          <th className="p-3.5 text-right">Bills</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {report.b2cs.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-[#A1AEBB]">
                              No B2CS sales recorded in this period.
                            </td>
                          </tr>
                        ) : (
                          report.b2cs.map((item) => (
                            <tr key={item.tax_rate} className="hover:bg-white/[0.025] transition-colors">
                              <td className="p-3.5 font-bold text-[#7DD3FC] font-mono tabular-nums">
                                {item.tax_rate}%
                              </td>
                              <td className="p-3.5 text-right font-mono font-medium text-[#F8FAFC] tabular-nums">
                                {formatMoney(item.taxable_value)}
                              </td>
                              <td className="p-3.5 text-right font-mono text-[#A1AEBB] tabular-nums">
                                {formatMoney(item.cgst_amount)}
                              </td>
                              <td className="p-3.5 text-right font-mono text-[#A1AEBB] tabular-nums">
                                {formatMoney(item.sgst_amount)}
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-[#6EE7B7] tabular-nums">
                                {formatMoney(item.total_amount)}
                              </td>
                              <td className="p-3.5 text-right text-[#A1AEBB] font-mono tabular-nums">
                                {item.invoice_count}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "hsn" && (
                <div className="space-y-3">
                  <div className="text-xs text-[#A1AEBB]">
                    {isKn
                      ? "ವಸ್ತುಗಳ ಪ್ರಮಾಣ ಮತ್ತು ಮಾರಾಟ ಮೌಲ್ಯದ ಸಾರಾಂಶ:"
                      : "Commodity & SKU turnover breakdown:"}
                  </div>
                  <div className="border border-white/[0.1] rounded-2xl overflow-hidden max-h-96 overflow-y-auto bg-[#080B10]/30">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-[#111722] border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.08em] sticky top-0 z-10">
                        <tr>
                          <th className="p-3.5">Product Name</th>
                          <th className="p-3.5">Unit</th>
                          <th className="p-3.5 text-right">Qty</th>
                          <th className="p-3.5 text-right">Rate</th>
                          <th className="p-3.5 text-right">Taxable</th>
                          <th className="p-3.5 text-right">CGST</th>
                          <th className="p-3.5 text-right">SGST</th>
                          <th className="p-3.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/[0.06]">
                        {report.hsn_summary.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-[#A1AEBB]">
                              No commodity sales recorded in this period.
                            </td>
                          </tr>
                        ) : (
                          report.hsn_summary.map((h, i) => (
                            <tr key={i} className="hover:bg-white/[0.025] transition-colors">
                              <td className="p-3.5 font-semibold text-[#F8FAFC]">
                                <KannadaText text={h.product_name} />
                              </td>
                              <td className="p-3.5 text-[#A1AEBB]">{h.unit}</td>
                              <td className="p-3.5 text-right font-mono text-[#F8FAFC] tabular-nums">
                                {h.total_quantity}
                              </td>
                              <td className="p-3.5 text-right font-mono text-[#7DD3FC] tabular-nums">
                                {h.tax_rate}%
                              </td>
                              <td className="p-3.5 text-right font-mono font-medium text-[#F8FAFC] tabular-nums">
                                {formatMoney(h.taxable_value)}
                              </td>
                              <td className="p-3.5 text-right font-mono text-[#A1AEBB] tabular-nums">
                                {formatMoney(h.cgst_amount)}
                              </td>
                              <td className="p-3.5 text-right font-mono text-[#A1AEBB] tabular-nums">
                                {formatMoney(h.sgst_amount)}
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-[#6EE7B7] tabular-nums">
                                {formatMoney(h.total_amount)}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {activeTab === "b2b" && (
                <div className="space-y-3">
                  {report.b2b.length === 0 ? (
                    <div className="p-12 text-center text-[#A1AEBB] text-xs border border-dashed border-white/[0.12] rounded-2xl bg-[#080B10]/25">
                      {isKn
                        ? "ಈ ಅವಧಿಯಲ್ಲಿ ಯಾವುದೇ ನೋಂದಾಯಿತ B2B (GSTIN ಹೊಂದಿರುವ) ಬಿಲ್ಲಿಂಗ್ ದಾಖಲಾಗಿಲ್ಲ. ಎಲ್ಲಾ ಮಾರಾಟಗಳು ಚಿಲ್ಲರೆ B2CS ವರ್ಗಕ್ಕೆ ಸೇರಿವೆ."
                        : "No B2B invoices with customer GSTIN recorded for this period. All transactions were B2CS retail sales."}
                    </div>
                  ) : (
                    <div className="border border-white/[0.1] rounded-2xl overflow-hidden bg-[#080B10]/30">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-[#080B10]/55 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.08em]">
                          <tr>
                            <th className="p-3.5">Invoice #</th>
                            <th className="p-3.5">Date</th>
                            <th className="p-3.5">Customer</th>
                            <th className="p-3.5">GSTIN</th>
                            <th className="p-3.5 text-right">Taxable</th>
                            <th className="p-3.5 text-right">Tax</th>
                            <th className="p-3.5 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.06]">
                          {report.b2b.map((b) => (
                            <tr key={b.invoice_number} className="hover:bg-white/[0.025] transition-colors">
                              <td className="p-3.5 font-mono font-semibold text-[#F8FAFC]">
                                {b.invoice_number}
                              </td>
                              <td className="p-3.5 text-[#A1AEBB] font-mono tabular-nums">
                                {formatDateLocalized(b.invoice_date)}
                              </td>
                              <td className="p-3.5 font-medium text-[#F8FAFC]">
                                <KannadaText text={b.customer_name} />
                              </td>
                              <td className="p-3.5 font-mono text-[#7DD3FC]">{b.customer_gstin}</td>
                              <td className="p-3.5 text-right font-mono text-[#F8FAFC] tabular-nums">
                                {formatMoney(b.taxable_value)}
                              </td>
                              <td className="p-3.5 text-right font-mono text-[#A1AEBB] tabular-nums">
                                {formatMoney(b.cgst_amount + b.sgst_amount)}
                              </td>
                              <td className="p-3.5 text-right font-mono font-bold text-[#6EE7B7] tabular-nums">
                                {formatMoney(b.total_amount)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
