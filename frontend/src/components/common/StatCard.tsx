import React from "react";
import { LucideIcon, Info } from "lucide-react";

export interface StatCardProps {
  label?: string;
  title?: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon | React.ReactNode;
  definition?: string;
  trend?: {
    value: string;
    isPositive: boolean;
  };
  color?: "emerald" | "blue" | "amber" | "violet" | "slate";
}

export const StatCard: React.FC<StatCardProps> = ({
  label,
  title,
  value,
  subtitle,
  icon,
  definition,
  trend,
  color = "emerald",
}) => {
  const displayTitle = label || title || "Metric";
  const colorStyles = {
    emerald: "bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#5EEAD4]/40 shadow-[0_0_14px_rgba(94,234,212,0.25)]",
    blue: "bg-[#7DD3FC]/15 text-[#7DD3FC] border-[#7DD3FC]/40 shadow-[0_0_14px_rgba(125,211,252,0.25)]",
    amber: "bg-[#FBBF24]/15 text-[#FBBF24] border-[#FBBF24]/40 shadow-[0_0_14px_rgba(251,191,36,0.25)]",
    violet: "bg-[#A78BFA]/15 text-[#A78BFA] border-[#A78BFA]/40 shadow-[0_0_14px_rgba(167,139,250,0.25)]",
    slate: "bg-white/[0.06] text-[#A1AEBB] border-white/10",
  };

  const renderIcon = () => {
    if (React.isValidElement(icon)) {
      return icon;
    }
    if (typeof icon === "function") {
      const IconComponent = icon as LucideIcon;
      return <IconComponent className="w-4 h-4" />;
    }
    return null;
  };

  return (
    <div className="liquid-glass-interactive liquid-sheen p-5 rounded-2xl relative group overflow-hidden border border-white/15">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-semibold text-[#A1AEBB] flex items-center gap-1.5">
          <span>{displayTitle}</span>
          {definition && (
            <div className="relative group/tooltip inline-block">
              <Info className="w-3.5 h-3.5 text-[#A1AEBB] hover:text-[#F8FAFC] cursor-help" />
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tooltip:block z-50 w-60 p-2 liquid-modal text-[#F8FAFC] text-[11px] rounded-xl pointer-events-none">
                {definition}
              </div>
            </div>
          )}
        </div>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${colorStyles[color]}`}>
          {renderIcon()}
        </div>
      </div>

      <div className="text-2xl font-extrabold text-[#F8FAFC] tracking-tight mb-1">
        {value}
      </div>

      <div className="flex items-center justify-between text-xs text-[#A1AEBB]">
        <span>{subtitle || "Verified from real ledger"}</span>
        {trend && (
          <span className={`font-semibold ${trend.isPositive ? "text-[#6EE7B7]" : "text-[#FB7185]"}`}>
            {trend.value}
          </span>
        )}
      </div>
    </div>
  );
};
