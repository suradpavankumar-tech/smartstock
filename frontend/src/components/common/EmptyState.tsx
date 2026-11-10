import React from "react";
import { LucideIcon, ShieldCheck, Package } from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Package,
  title,
  description,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
}) => {
  const { t } = useLanguage();

  return (
    <div className="liquid-glass-interactive rounded-2xl p-8 sm:p-12 text-center max-w-xl mx-auto my-6 text-[#F8FAFC]">
      <div className="w-14 h-14 rounded-2xl bg-[#5EEAD4]/20 border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center mx-auto mb-4 shadow-[0_0_16px_rgba(94,234,212,0.25)]">
        <Icon className="w-7 h-7" />
      </div>

      <h3 className="text-base font-bold text-[#F8FAFC] mb-2 tracking-tight">
        {title}
      </h3>

      <p className="text-xs text-[#A1AEBB] mb-6 leading-relaxed">
        {description || t("zeroDataExplanation")}
      </p>

      {/* Real Data Guarantee Badge */}
      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium bg-white/[0.06] border border-white/10 text-[#A1AEBB] mb-6">
        <ShieldCheck className="w-3.5 h-3.5 text-[#6EE7B7]" />
        <span>Strict Real-Data Policy: Zero synthetic or fabricated records</span>
      </div>

      <div className="flex items-center justify-center gap-3 flex-wrap">
        {actionText && onAction && (
          <button
            onClick={onAction}
            className="px-4 py-2 rounded-xl liquid-btn-primary font-bold text-xs shadow-md transition-all active:scale-[0.98]"
          >
            {actionText}
          </button>
        )}
        {secondaryActionText && onSecondaryAction && (
          <button
            onClick={onSecondaryAction}
            className="px-4 py-2 rounded-xl liquid-btn-secondary font-semibold text-xs transition-all active:scale-[0.98]"
          >
            {secondaryActionText}
          </button>
        )}
      </div>
    </div>
  );
};
