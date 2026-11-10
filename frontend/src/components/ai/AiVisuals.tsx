import React, { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  ShieldCheck,
  AlertTriangle,
  Cpu,
  ChevronDown,
  ChevronUp,
  Database,
  Sparkles,
  Wrench,
  Clock,
  Lock,
  Lightbulb,
} from "lucide-react";
import {
  AIApproval,
  AIChartSpec,
  AIDataType,
  AIEvidenceItem,
  AIKpiMetric,
  AISpecialistTrace,
  AITableSpec,
  AIToolTrace,
} from "../../types";

const CHART_PALETTE = ["#5EEAD4", "#7DD3FC", "#A78BFA", "#FBBF24", "#FB7185", "#6EE7B7"];

export const formatCompactVal = (val: number, prefix = "", suffix = ""): string => {
  const abs = Math.abs(val);
  let numStr = "";
  if (abs >= 10000000) {
    numStr = `${(val / 10000000).toFixed(2)}Cr`;
  } else if (abs >= 100000) {
    numStr = `${(val / 100000).toFixed(2)}L`;
  } else if (abs >= 1000 && prefix === "₹") {
    numStr = val.toLocaleString("en-IN", { maximumFractionDigits: 0 });
  } else {
    numStr = Number.isInteger(val) ? val.toString() : val.toFixed(2);
  }
  return `${prefix}${numStr}${suffix}`;
};

export const AiDataTypeBadge: React.FC<{ dataType?: AIDataType | string | null }> = ({
  dataType,
}) => {
  if (!dataType || dataType === "ACTUAL") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#6EE7B7]/12 border border-[#6EE7B7]/30 text-[9px] font-mono uppercase tracking-wider text-[#6EE7B7]">
        <Database className="w-2.5 h-2.5" />
        Verified Actual
      </span>
    );
  }
  if (dataType === "FORECAST") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#7DD3FC]/12 border border-[#7DD3FC]/35 text-[9px] font-mono uppercase tracking-wider text-[#7DD3FC]">
        <Sparkles className="w-2.5 h-2.5" />
        Forecast Estimate
      </span>
    );
  }
  if (dataType === "HYPOTHETICAL_SIMULATION") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#FBBF24]/12 border border-[#FBBF24]/35 text-[9px] font-mono uppercase tracking-wider text-[#FBBF24]">
        <AlertTriangle className="w-2.5 h-2.5" />
        Simulated What-If
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/[0.06] border border-white/[0.12] text-[9px] font-mono uppercase tracking-wider text-[#A1AEBB]">
      {dataType}
    </span>
  );
};

const renderInlineFormatting = (text: string): React.ReactNode[] => {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-bold text-[#F8FAFC]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-[#080B10]/90 border border-white/[0.12] font-mono text-[11px] text-[#7DD3FC]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={idx} className="italic text-[#A1AEBB]">
          {part.slice(1, -1)}
        </em>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
};

export const FormattedAiMarkdown: React.FC<{ content: string }> = ({ content }) => {
  const lines = content.split("\n");
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-[#E2E8F0]">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={i} className="h-1" />;
        }
        if (trimmed.startsWith("### ")) {
          return (
            <h3
              key={i}
              className="text-sm font-bold text-[#6EE7B7] tracking-tight pt-1 first:pt-0"
            >
              {renderInlineFormatting(trimmed.slice(4))}
            </h3>
          );
        }
        if (trimmed.startsWith("## ")) {
          return (
            <h2
              key={i}
              className="text-[15px] font-extrabold text-[#F8FAFC] tracking-tight pt-1 first:pt-0"
            >
              {renderInlineFormatting(trimmed.slice(3))}
            </h2>
          );
        }
        if (trimmed.startsWith("> ")) {
          return (
            <div
              key={i}
              className="pl-3 pr-2 py-1.5 border-l-2 border-[#FBBF24] bg-[#FBBF24]/10 rounded-r-lg text-xs text-[#FDE68A]"
            >
              {renderInlineFormatting(trimmed.slice(2))}
            </div>
          );
        }
        if (trimmed.startsWith("- ") || trimmed.startsWith("• ")) {
          return (
            <div key={i} className="flex items-start gap-2 pl-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#5EEAD4] mt-2 shrink-0" />
              <span className="flex-1">{renderInlineFormatting(trimmed.slice(2))}</span>
            </div>
          );
        }
        if (/^\d+\.\s/.test(trimmed)) {
          const match = trimmed.match(/^(\d+\.)\s(.*)$/);
          if (match) {
            return (
              <div key={i} className="flex items-start gap-2 pl-1">
                <span className="font-mono text-xs font-bold text-[#7DD3FC] mt-0.5 shrink-0">
                  {match[1]}
                </span>
                <span className="flex-1">{renderInlineFormatting(match[2])}</span>
              </div>
            );
          }
        }
        return <p key={i}>{renderInlineFormatting(line)}</p>;
      })}
    </div>
  );
};

export const AiKpiStrip: React.FC<{ kpis: AIKpiMetric[]; compact?: boolean }> = ({
  kpis,
  compact = false,
}) => {
  if (!kpis || kpis.length === 0) return null;
  const colsClass =
    kpis.length === 1
      ? "grid-cols-1"
      : compact
      ? "grid-cols-2"
      : kpis.length === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : kpis.length === 3
      ? "grid-cols-1 sm:grid-cols-3"
      : "grid-cols-2 lg:grid-cols-4";

  return (
    <div
      className={`grid ${colsClass} gap-px bg-white/[0.08] border border-white/[0.1] rounded-xl overflow-hidden`}
    >
      {kpis.map((m, idx) => (
        <div key={idx} className="px-3.5 py-2.5 min-w-0 bg-[#0B1018]/95">
          <div className="flex items-center justify-between gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-[#A1AEBB] truncate font-medium">
              {m.label}
            </span>
            {m.data_type !== "ACTUAL" && (
              <span
                className={`text-[8.5px] font-mono px-1 rounded ${
                  m.data_type === "FORECAST"
                    ? "bg-[#7DD3FC]/15 text-[#7DD3FC]"
                    : "bg-[#FBBF24]/15 text-[#FBBF24]"
                }`}
              >
                {m.data_type === "FORECAST" ? "EST" : "SIM"}
              </span>
            )}
          </div>
          <div
            className={`text-sm sm:text-[15px] font-mono font-bold mt-0.5 tabular-nums truncate ${
              m.tone === "positive"
                ? "text-[#6EE7B7]"
                : m.tone === "warning"
                ? "text-[#FBBF24]"
                : m.tone === "critical"
                ? "text-[#FB7185]"
                : m.tone === "info"
                ? "text-[#7DD3FC]"
                : "text-[#F8FAFC]"
            }`}
          >
            {m.value}
          </div>
          {m.delta && (
            <div className="text-[10.5px] text-[#A1AEBB] mt-0.5 truncate font-mono">
              {m.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export const AiChartRenderer: React.FC<{ chart: AIChartSpec }> = ({ chart }) => {
  if (!chart || !chart.points || chart.points.length === 0) return null;

  const points = chart.points;
  const maxVal = Math.max(
    1,
    ...points.map((p) => Math.max(Math.abs(p.value), Math.abs(p.secondary_value ?? 0)))
  );

  return (
    <div className="rounded-xl border border-white/[0.1] bg-[#080B10]/65 p-3.5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
        <div className="min-w-0">
          <div className="text-xs font-bold text-[#F8FAFC] truncate">{chart.title}</div>
          {chart.subtitle && (
            <div className="text-[10.5px] text-[#A1AEBB] truncate">{chart.subtitle}</div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <AiDataTypeBadge dataType={chart.data_type} />
        </div>
      </div>

      {/* Legend if dual series on bar/line */}
      {(chart.chart_type === "bar" || chart.chart_type === "line") && chart.secondary_label && (
        <div className="flex items-center gap-4 text-[10.5px] text-[#A1AEBB]">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#5EEAD4]" />
            {chart.series_label}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-[#A78BFA]" />
            {chart.secondary_label}
          </span>
        </div>
      )}

      {chart.chart_type === "bar" && (
        <div className="space-y-2.5">
          {points.map((pt, idx) => {
            const pct1 = Math.min(100, Math.max(3, (Math.abs(pt.value) / maxVal) * 100));
            const hasSec = pt.secondary_value !== undefined && pt.secondary_value !== null;
            const pct2 = hasSec
              ? Math.min(100, Math.max(3, (Math.abs(pt.secondary_value!) / maxVal) * 100))
              : 0;
            const barColor = pt.color || CHART_PALETTE[idx % CHART_PALETTE.length];

            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="text-[#E2E8F0] font-medium truncate">{pt.label}</span>
                  <span className="font-mono text-[#F8FAFC] tabular-nums shrink-0">
                    {formatCompactVal(pt.value, chart.unit_prefix, chart.unit_suffix)}
                    {hasSec && (
                      <span className="text-[#A78BFA] ml-1.5">
                        / {formatCompactVal(pt.secondary_value!, chart.unit_prefix, chart.unit_suffix)}
                      </span>
                    )}
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="h-2 w-full rounded-full bg-white/[0.06] overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct1}%`, backgroundColor: barColor }}
                    />
                  </div>
                  {hasSec && (
                    <div className="h-1.5 w-full rounded-full bg-white/[0.04] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 bg-[#A78BFA]"
                        style={{ width: `${pct2}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {chart.chart_type === "line" && (
        <div className="w-full overflow-hidden">
          {(() => {
            const width = 560;
            const height = 165;
            const padL = 48;
            const padR = 16;
            const padT = 14;
            const padB = 26;
            const plotW = width - padL - padR;
            const plotH = height - padT - padB;
            const minVal = Math.min(0, ...points.map((p) => p.value));
            const span = Math.max(1, maxVal - minVal);
            const stepX = points.length > 1 ? plotW / (points.length - 1) : 0;

            const toX = (i: number) => (points.length === 1 ? padL + plotW / 2 : padL + i * stepX);
            const toY = (v: number) => padT + plotH - ((v - minVal) / span) * plotH;

            const primaryPath = points
              .map((p, i) => `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(p.value).toFixed(1)}`)
              .join(" ");

            const areaPath =
              points.length > 1
                ? `${primaryPath} L${toX(points.length - 1).toFixed(1)},${(padT + plotH).toFixed(1)} L${toX(0).toFixed(1)},${(padT + plotH).toFixed(1)} Z`
                : "";

            const hasSecondary = points.some(
              (p) => p.secondary_value !== undefined && p.secondary_value !== null
            );
            const secondaryPath = hasSecondary
              ? points
                  .map((p, i) => {
                    const v = p.secondary_value ?? 0;
                    return `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`;
                  })
                  .join(" ")
              : "";

            const tickStep = Math.max(1, Math.ceil(points.length / 6));

            return (
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full h-auto max-h-[190px] overflow-visible"
                role="img"
                aria-label={chart.title}
              >
                <defs>
                  <linearGradient id={`grad-${chart.chart_id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5EEAD4" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#5EEAD4" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {[0, 0.5, 1].map((frac, idx) => {
                  const yPos = padT + plotH * (1 - frac);
                  const tickVal = minVal + span * frac;
                  return (
                    <g key={idx}>
                      <line
                        x1={padL}
                        x2={width - padR}
                        y1={yPos}
                        y2={yPos}
                        stroke="rgba(255,255,255,0.08)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 6}
                        y={yPos + 3}
                        textAnchor="end"
                        fill="#A1AEBB"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {formatCompactVal(tickVal, chart.unit_prefix, chart.unit_suffix)}
                      </text>
                    </g>
                  );
                })}

                {areaPath && <path d={areaPath} fill={`url(#grad-${chart.chart_id})`} />}

                {secondaryPath && (
                  <path
                    d={secondaryPath}
                    fill="none"
                    stroke="#A78BFA"
                    strokeWidth="1.8"
                    strokeDasharray="4 3"
                  />
                )}

                <path
                  d={primaryPath}
                  fill="none"
                  stroke="#5EEAD4"
                  strokeWidth="2.3"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />

                {points.map((pt, i) => (
                  <g key={i}>
                    <circle
                      cx={toX(i)}
                      cy={toY(pt.value)}
                      r="3.2"
                      fill="#080B10"
                      stroke="#5EEAD4"
                      strokeWidth="2"
                    >
                      <title>{`${pt.label}: ${formatCompactVal(
                        pt.value,
                        chart.unit_prefix,
                        chart.unit_suffix
                      )}`}</title>
                    </circle>
                    {pt.secondary_value !== undefined && pt.secondary_value !== null && (
                      <circle
                        cx={toX(i)}
                        cy={toY(pt.secondary_value)}
                        r="2.5"
                        fill="#A78BFA"
                      >
                        <title>{`${pt.label} (${chart.secondary_label}): ${formatCompactVal(
                          pt.secondary_value,
                          chart.unit_prefix,
                          chart.unit_suffix
                        )}`}</title>
                      </circle>
                    )}
                    {(i % tickStep === 0 || i === points.length - 1) && (
                      <text
                        x={toX(i)}
                        y={height - 6}
                        textAnchor="middle"
                        fill="#A1AEBB"
                        fontSize="9"
                        fontFamily="monospace"
                      >
                        {pt.label}
                      </text>
                    )}
                  </g>
                ))}
              </svg>
            );
          })()}
        </div>
      )}

      {chart.chart_type === "donut" && (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {(() => {
            const total = Math.max(
              0.0001,
              points.reduce((sum, p) => sum + Math.max(0, p.value), 0)
            );
            const r = 42;
            const circ = 2 * Math.PI * r;
            let accum = 0;

            return (
              <>
                <div className="relative w-28 h-28 shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 110 110" className="w-full h-full -rotate-90">
                    <circle
                      cx="55"
                      cy="55"
                      r={r}
                      fill="none"
                      stroke="rgba(255,255,255,0.06)"
                      strokeWidth="14"
                    />
                    {points.map((pt, idx) => {
                      const val = Math.max(0, pt.value);
                      const frac = val / total;
                      const dash = frac * circ;
                      const offset = -accum * circ;
                      accum += frac;
                      return (
                        <circle
                          key={idx}
                          cx="55"
                          cy="55"
                          r={r}
                          fill="none"
                          stroke={pt.color || CHART_PALETTE[idx % CHART_PALETTE.length]}
                          strokeWidth="14"
                          strokeDasharray={`${dash} ${circ}`}
                          strokeDashoffset={offset}
                        >
                          <title>{`${pt.label}: ${formatCompactVal(
                            val,
                            chart.unit_prefix,
                            chart.unit_suffix
                          )}`}</title>
                        </circle>
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
                    <span className="text-[9px] uppercase text-[#A1AEBB]">Total</span>
                    <span className="text-[11px] font-mono font-bold text-[#F8FAFC]">
                      {formatCompactVal(total, chart.unit_prefix, chart.unit_suffix)}
                    </span>
                  </div>
                </div>

                <div className="flex-1 w-full space-y-1.5 min-w-0">
                  {points.map((pt, idx) => {
                    const val = Math.max(0, pt.value);
                    const pct = ((val / total) * 100).toFixed(1);
                    const col = pt.color || CHART_PALETTE[idx % CHART_PALETTE.length];
                    return (
                      <div key={idx} className="flex items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: col }}
                          />
                          <span className="text-[#E2E8F0] truncate">{pt.label}</span>
                        </div>
                        <span className="font-mono text-[#F8FAFC] tabular-nums shrink-0">
                          {formatCompactVal(val, chart.unit_prefix, chart.unit_suffix)}{" "}
                          <span className="text-[#A1AEBB]">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

export const AiDataTable: React.FC<{ table: AITableSpec }> = ({ table }) => {
  if (!table || !table.columns || table.rows.length === 0) return null;

  return (
    <div className="rounded-xl border border-white/[0.1] bg-[#080B10]/65 overflow-hidden">
      <div className="px-3.5 py-2 border-b border-white/[0.08] flex items-center justify-between">
        <span className="text-xs font-bold text-[#F8FAFC]">{table.title}</span>
        <span className="text-[10px] font-mono text-[#A1AEBB]">{table.rows.length} rows</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-[11.5px]">
          <thead>
            <tr className="border-b border-white/[0.08] bg-white/[0.03] text-[#A1AEBB]">
              {table.columns.map((col, idx) => (
                <th
                  key={idx}
                  className="px-3 py-2 font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.05]">
            {table.rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-white/[0.03] transition-colors">
                {row.map((cell, cIdx) => {
                  const isHighlight = table.highlight_col === cIdx;
                  const isNumeric = /^[₹+\-0-9]/.test(cell.trim());
                  return (
                    <td
                      key={cIdx}
                      className={`px-3 py-2 whitespace-nowrap ${
                        isNumeric ? "font-mono tabular-nums" : ""
                      } ${
                        isHighlight
                          ? "text-[#6EE7B7] font-semibold"
                          : cIdx === 0
                          ? "text-[#F8FAFC] font-medium"
                          : "text-[#E2E8F0]"
                      }`}
                    >
                      {cell}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface AiApprovalCardProps {
  approval: AIApproval;
  userRole: string;
  language?: string;
  onApprove: (approvalId: number, note?: string) => Promise<void>;
  onReject: (approvalId: number, note?: string) => Promise<void>;
}

const _aiL = (lang: string | undefined, en: string, kn: string, hi: string): string => {
  if (lang === "kn") return kn;
  if (lang === "hi") return hi;
  return en;
};

export const AiApprovalCard: React.FC<AiApprovalCardProps> = ({
  approval,
  userRole,
  language,
  onApprove,
  onReject,
}) => {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isPending = approval.status === "PENDING";
  const isExecuted = approval.status === "EXECUTED";
  const isRejected = approval.status === "REJECTED";
  const canDecide = userRole === "OWNER" || userRole === "MANAGER";
  const preview = approval.preview || {};

  const handleAction = async (kind: "approve" | "reject") => {
    setBusy(kind);
    setErrorMsg(null);
    try {
      if (kind === "approve") {
        await onApprove(approval.id, note.trim() || undefined);
      } else {
        await onReject(approval.id, note.trim() || undefined);
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Failed to process approval action.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className={`rounded-xl border p-3.5 space-y-3 transition-all ${
        isExecuted
          ? "bg-[#6EE7B7]/[0.06] border-[#6EE7B7]/35"
          : isRejected
          ? "bg-[#FB7185]/[0.06] border-[#FB7185]/35"
          : "bg-[#FBBF24]/[0.05] border-[#FBBF24]/35"
      }`}
    >
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex items-start gap-2.5 min-w-0">
          <div
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border ${
              isExecuted
                ? "bg-[#6EE7B7]/15 border-[#6EE7B7]/40 text-[#6EE7B7]"
                : isRejected
                ? "bg-[#FB7185]/15 border-[#FB7185]/40 text-[#FB7185]"
                : "bg-[#FBBF24]/15 border-[#FBBF24]/40 text-[#FBBF24]"
            }`}
          >
            {isExecuted ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : isRejected ? (
              <XCircle className="w-4 h-4" />
            ) : (
              <ShieldCheck className="w-4 h-4" />
            )}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-[#F8FAFC]">{approval.title}</span>
              <span className="text-[10px] text-[#A1AEBB]">
                {isPending
                  ? _aiL(language, "· Needs approval", "· ಅನುಮೋದನೆ ಬೇಕಿದೆ", "· मंज़ूरी आवश्यक")
                  : isExecuted
                  ? _aiL(language, "· Approved", "· ಅನುಮೋದಿಸಲಾಗಿದೆ", "· स्वीकृत")
                  : _aiL(language, "· Cancelled", "· ರದ್ದಾಗಿದೆ", "· अस्वीकृत")}
              </span>
            </div>
            <p className="text-[11.5px] text-[#E2E8F0] mt-0.5 leading-snug">
              {approval.summary}
            </p>
          </div>
        </div>

        <span
          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase border shrink-0 ${
            isExecuted
              ? "bg-[#6EE7B7]/15 border-[#6EE7B7]/40 text-[#6EE7B7]"
              : isRejected
              ? "bg-[#FB7185]/15 border-[#FB7185]/40 text-[#FB7185]"
              : "bg-[#FBBF24]/15 border-[#FBBF24]/40 text-[#FBBF24]"
          }`}
        >
          {approval.status}
        </span>
      </div>

      {/* Action Preview Details */}
      <div className="rounded-lg bg-[#080B10]/70 border border-white/[0.08] p-2.5 text-[11px] space-y-2">
        {Array.isArray(preview.items) && preview.items.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10.5px] text-[#A1AEBB]">
              <span>
                {_aiL(language, "Supplier:", "ಸರಬರಾಜುದಾರ:", "सप्लायर:")}{" "}
                <strong className="text-[#F8FAFC]">{preview.supplier_name || "Vendor"}</strong>
              </span>
              {(preview.estimated_total !== undefined || preview.total_amount !== undefined) && (
                <span className="font-mono font-bold text-[#6EE7B7]">
                  {_aiL(language, "Est. Total:", "ಅಂದಾಜು ಒಟ್ಟು:", "अनुमानित कुल:")} ₹{Number(preview.estimated_total ?? preview.total_amount).toLocaleString("en-IN")}
                </span>
              )}
            </div>
            <div className="divide-y divide-white/[0.06] border-t border-white/[0.06]">
              {preview.items.slice(0, 6).map((item: any, idx: number) => (
                <div key={idx} className="py-1 flex items-center justify-between gap-2">
                  <span className="text-[#E2E8F0] truncate">
                    {item.product_name || `Product #${item.product_id}`}
                  </span>
                  <span className="font-mono text-[#A1AEBB] shrink-0">
                    {item.quantity_ordered ?? item.quantity} × ₹
                    {Number(item.unit_cost || 0).toLocaleString("en-IN")}
                  </span>
                </div>
              ))}
              {preview.items.length > 6 && (
                <div className="pt-1 text-[10px] text-[#A1AEBB]">
                  + {preview.items.length - 6} more line item(s)
                </div>
              )}
            </div>
          </div>
        )}

        {/* Generic Before -> After / Structured Preview Keys */}
        {!Array.isArray(preview.items) && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Object.entries(preview)
              .filter(([k, v]) => k !== "items" && v !== null && typeof v !== "object")
              .slice(0, 6)
              .map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <div className="text-[9.5px] uppercase tracking-wider text-[#A1AEBB] truncate">
                    {k.replace(/_/g, " ")}
                  </div>
                  <div className="font-mono font-semibold text-[#F8FAFC] truncate">
                    {String(v)}
                  </div>
                </div>
              ))}
          </div>
        )}

        <div className="flex items-center justify-between text-[9.5px] font-mono text-[#A1AEBB]/80 pt-1 border-t border-white/[0.06]">
          <span>{_aiL(language, `Approval #${approval.id}`, `ಅನುಮೋದನೆ #${approval.id}`, `मंज़ूरी #${approval.id}`)}</span>
          <span>{_aiL(language, `Idempotency: ${approval.idempotency_key.slice(0, 14)}…`, `ಐಡಿ: ${approval.idempotency_key.slice(0, 14)}…`, `आईडी: ${approval.idempotency_key.slice(0, 14)}…`)}</span>
        </div>
      </div>

      {errorMsg && (
        <div className="px-2.5 py-1.5 rounded-lg bg-[#FB7185]/15 border border-[#FB7185]/40 text-[11px] text-[#FB7185]">
          {errorMsg}
        </div>
      )}

      {/* Execution Result Banner */}
      {isExecuted && approval.execution_result && (
        <div className="px-3 py-2 rounded-lg bg-[#6EE7B7]/12 border border-[#6EE7B7]/35 text-[11px] text-[#6EE7B7] flex items-center justify-between gap-2">
          <span className="font-semibold">
            {language === "kn"
              ? "ಅನುಮೋದಿಸಿದ ಕಾರ್ಯವನ್ನು ಯಶಸ್ವಿಯಾಗಿ ಕಾರ್ಯಗತಗೊಳಿಸಲಾಗಿದೆ."
              : language === "hi"
              ? "स्वीकृत कार्रवाई सफलतापूर्वक लागू कर दी गई है।"
              : approval.execution_result.message || "Approved action executed & audited cleanly."}
          </span>
          {approval.execution_result.po_number && (
            <span className="font-mono font-bold px-1.5 py-0.5 rounded bg-[#080B10]/70">
              {approval.execution_result.po_number}
            </span>
          )}
        </div>
      )}

      {isRejected && (
        <div className="px-3 py-1.5 rounded-lg bg-[#FB7185]/10 border border-[#FB7185]/30 text-[11px] text-[#FB7185]">
          Rejected{approval.decision_note ? `: ${approval.decision_note}` : " by reviewer."} No
          database changes were applied.
        </div>
      )}

      {/* Decision Controls */}
      {isPending && (
        <div className="space-y-2 pt-0.5">
          {!canDecide ? (
            <div className="flex items-center gap-2 text-[11px] text-[#FBBF24] bg-[#FBBF24]/10 border border-[#FBBF24]/30 rounded-lg px-2.5 py-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0" />
              <span>
                Your role ({userRole}) cannot execute approvals. An OWNER or MANAGER must confirm
                this draft.
              </span>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={_aiL(
                  language,
                  "Optional audit note before confirming...",
                  "ದೃಢೀಕರಿಸುವ ಮೊದಲು ಐಚ್ಛಿಕ ಟಿಪ್ಪಣಿ...",
                  "पुष्टि से पहले वैकल्पिक नोट..."
                )}
                className="flex-1 rounded-lg bg-[#080B10]/85 border border-white/[0.14] px-2.5 py-1.5 text-[11.5px] text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:border-[#5EEAD4] focus:outline-none"
              />
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void handleAction("approve")}
                  className="liquid-btn-primary px-3 py-1.5 rounded-lg text-[11.5px] font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#080B10]" />
                  <span>
                    {busy === "approve"
                      ? _aiL(language, "Executing...", "ಕಾರ್ಯಗತವಾಗುತ್ತಿದೆ...", "लागू हो रहा है...")
                      : _aiL(language, "Approve & Execute", "ಅನುಮೋದಿಸಿ ಮತ್ತು ಕಾರ್ಯಗತಗೊಳಿಸಿ", "मंज़ूर करें")}
                  </span>
                </button>
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void handleAction("reject")}
                  className="px-3 py-1.5 rounded-lg text-[11.5px] font-semibold bg-[#FB7185]/12 hover:bg-[#FB7185]/22 border border-[#FB7185]/40 text-[#FB7185] inline-flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  <span>
                    {busy === "reject"
                      ? _aiL(language, "Rejecting...", "ತಿರಸ್ಕರಿಸಲಾಗುತ್ತಿದೆ...", "अस्वीकृत...")
                      : _aiL(language, "Reject", "ತಿರಸ್ಕರಿಸಿ", "अस्वीकार करें")}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface AiReasoningDrawerProps {
  agents: AISpecialistTrace[];
  tools: AIToolTrace[];
  evidence: AIEvidenceItem[];
  assumptions: string[];
  recommendations: string[];
  dataQuality?: string | null;
  llmProvider?: string;
  language?: string;
}

export const AiReasoningDrawer: React.FC<AiReasoningDrawerProps> = ({
  agents,
  tools,
  evidence,
  assumptions,
  recommendations,
  dataQuality,
  llmProvider,
  language,
}) => {
  const [open, setOpen] = useState(false);

  const hasDeniedTools = tools.some((t) => t.status === "DENIED");
  const hasContent =
    agents.length > 0 ||
    hasDeniedTools ||
    evidence.length > 0 ||
    assumptions.length > 0 ||
    recommendations.length > 0;

  if (!hasContent) return null;

  return (
    <div className="space-y-2">
      {/* Compact Recommendations if present */}
      {recommendations.length > 0 && (
        <div className="rounded-xl border border-[#5EEAD4]/20 bg-[#5EEAD4]/[0.04] px-3 py-2 space-y-1">
          <div className="text-[10.5px] font-semibold text-[#6EE7B7] flex items-center gap-1.5">
            <Lightbulb className="w-3 h-3" />
            {_aiL(language, "Suggested Next Steps", "ಮುಂದಿನ ಸಲಹೆಗಳು", "सुझाए गए कदम")}
          </div>
          {recommendations.map((rec, idx) => (
            <div key={idx} className="text-[12px] text-[#E2E8F0] flex items-start gap-1.5">
              <span className="text-[#5EEAD4] font-bold">•</span>
              <span>{renderInlineFormatting(rec)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Subtle ChatGPT-style Expandable Details Link (only when multi-agent / verified analytical / denied work ran) */}
      {(agents.length > 0 || hasDeniedTools || evidence.length > 0 || assumptions.length > 0) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1.5 px-2 py-1 -ml-1 rounded-lg text-[11px] text-[#A1AEBB]/75 hover:text-[#6EE7B7] hover:bg-white/[0.04] transition-colors"
        >
          <Sparkles className="w-3 h-3 text-[#5EEAD4]/80 shrink-0" />
          <span>
            {agents.length > 0
              ? _aiL(
                  language,
                  `Worked across ${agents.length} agent${agents.length !== 1 ? "s" : ""}`,
                  `${agents.length} ವಿಶೇಷ ಏಜೆಂಟ್‌ಗಳೊಂದಿಗೆ ವಿಶ್ಲೇಷಿಸಲಾಗಿದೆ`,
                  `${agents.length} विशेषज्ञ एजेंटों के साथ जाँच पूरी`
                )
              : _aiL(language, "View details", "ವಿವರ ನೋಡಿ", "विवरण देखें")}
            {evidence.length > 0
              ? _aiL(
                  language,
                  ` · ${evidence.length} store source${evidence.length !== 1 ? "s" : ""}`,
                  ` · ${evidence.length} ಅಂಗಡಿ ದಾಖಲೆಗಳು`,
                  ` · ${evidence.length} स्टोर स्रोत`
                )
              : tools.length > 0
              ? _aiL(
                  language,
                  ` · ${tools.length} check${tools.length !== 1 ? "s" : ""}`,
                  ` · ${tools.length} ಪರಿಶೀಲನೆಗಳು`,
                  ` · ${tools.length} जाँच`
                )
              : ""}
          </span>
          {dataQuality && dataQuality !== "ACTUAL" && dataQuality !== "VERIFIED_LIVE_DB" && (
            <AiDataTypeBadge dataType={dataQuality} />
          )}
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        </button>
      )}

      {open && (
        <div className="rounded-xl border border-white/[0.08] bg-[#080B10]/70 p-3 space-y-3 text-[11px]">
          {agents.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#7DD3FC]">
                Specialist Agents Orchestrated
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {agents.map((ag, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg bg-white/[0.03] border border-white/[0.08] px-2.5 py-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[#F8FAFC]">{ag.agent_name}</span>
                      <span className="text-[9.5px] font-mono text-[#6EE7B7]">{ag.status}</span>
                    </div>
                    <div className="text-[10.5px] text-[#A1AEBB] mt-0.5 leading-snug">
                      {ag.summary}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tools.length > 0 && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#A78BFA] flex items-center gap-1">
                <Wrench className="w-3 h-3" />
                Authorized Backend Tool Executions
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tools.map((t, idx) => (
                  <span
                    key={idx}
                    title={t.summary}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] border ${
                      t.status === "COMPLETED"
                        ? "bg-[#6EE7B7]/10 border-[#6EE7B7]/30 text-[#6EE7B7]"
                        : t.status === "DENIED"
                        ? "bg-[#FB7185]/12 border-[#FB7185]/35 text-[#FB7185]"
                        : "bg-[#FBBF24]/12 border-[#FBBF24]/35 text-[#FBBF24]"
                    }`}
                  >
                    <span>{t.tool_name}</span>
                    <span className="opacity-70">· {t.duration_ms}ms</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {evidence.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#6EE7B7]">
                Database Evidence Sources
              </div>
              <div className="divide-y divide-white/[0.06]">
                {evidence.map((ev, idx) => (
                  <div key={idx} className="py-1 flex items-center justify-between gap-2">
                    <span className="text-[#A1AEBB]">
                      <strong className="text-[#E2E8F0]">{ev.source}</strong> · {ev.label}
                    </span>
                    <span className="font-mono text-[#F8FAFC]">{ev.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {assumptions.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#FBBF24] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                Forecast / Model Assumptions
              </div>
              <ul className="list-disc pl-4 space-y-0.5 text-[#A1AEBB]">
                {assumptions.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {llmProvider && (
            <div className="text-[9.5px] font-mono text-[#A1AEBB]/75 pt-1 border-t border-white/[0.06]">
              Inference Engine: {llmProvider}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
