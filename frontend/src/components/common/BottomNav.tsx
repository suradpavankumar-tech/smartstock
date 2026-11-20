import React from "react";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart3,
  Sparkles,
  Menu,
  ShoppingCart,
  Receipt,
  LucideIcon,
} from "lucide-react";
import { NavItemKey } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

interface BottomNavProps {
  currentTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  onOpenMoreMenu: () => void;
  isMoreMenuOpen?: boolean;
}

interface NavSlot {
  key: NavItemKey | "more";
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
  badge?: string;
  isAction?: boolean;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenMoreMenu,
  isMoreMenuOpen = false,
}) => {
  const { currentBusiness } = useAuth();
  const { t, language } = useLanguage();
  const role = currentBusiness?.role || "OWNER";
  const isKn = language === "kn";

  // Role-adaptive 5 primary slots
  const slots: NavSlot[] = role === "CASHIER"
    ? [
        {
          key: "overview",
          labelKey: "navOverview",
          defaultLabel: isKn ? "ಮುಖಪುಟ" : "Home",
          icon: LayoutDashboard,
        },
        {
          key: "pos",
          labelKey: "navPOS",
          defaultLabel: isKn ? "ಬಿಲ್ಲಿಂಗ್" : "POS",
          icon: ShoppingCart,
          badge: "F2",
        },
        {
          key: "sales",
          labelKey: "navSales",
          defaultLabel: isKn ? "ಮಾರಾಟ" : "Sales",
          icon: Receipt,
        },
        {
          key: "agent",
          labelKey: "navAgent",
          defaultLabel: isKn ? "AI ಸಹಾಯಕ" : "AI Assistant",
          icon: Sparkles,
          badge: "AI",
        },
        {
          key: "more",
          labelKey: "navMore",
          defaultLabel: isKn ? "ಇನ್ನಷ್ಟು" : "More",
          icon: Menu,
          isAction: true,
        },
      ]
    : [
        {
          key: "overview",
          labelKey: "navOverview",
          defaultLabel: isKn ? "ಮುಖಪುಟ" : "Home",
          icon: LayoutDashboard,
        },
        {
          key: "inventory",
          labelKey: "navInventory",
          defaultLabel: isKn ? "ದಾಸ್ತಾನು" : "Inventory",
          icon: ClipboardList,
        },
        {
          key: "analytics",
          labelKey: "navAnalytics",
          defaultLabel: isKn ? "ವಿಶ್ಲೇಷಣೆ" : "Analytics",
          icon: BarChart3,
        },
        {
          key: "agent",
          labelKey: "navAgent",
          defaultLabel: isKn ? "AI ಸಹಾಯಕ" : "AI Assistant",
          icon: Sparkles,
          badge: "AI",
        },
        {
          key: "more",
          labelKey: "navMore",
          defaultLabel: isKn ? "ಇನ್ನಷ್ಟು" : "More",
          icon: Menu,
          isAction: true,
        },
      ];

  return (
    <nav
      role="navigation"
      aria-label="Mobile Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden bg-[#080B10]/95 backdrop-blur-2xl border-t border-white/[0.12] shadow-[0_-8px_32px_rgba(0,0,0,0.85)] pb-[env(safe-area-inset-bottom,0px)]"
    >
      <div className="grid grid-cols-5 h-[58px] max-w-lg mx-auto items-stretch px-1">
        {slots.map((slot) => {
          const Icon = slot.icon;
          const isMore = slot.key === "more";
          const isActive = isMore ? isMoreMenuOpen : currentTab === slot.key;
          const label = t(slot.labelKey) || slot.defaultLabel;

          return (
            <button
              key={slot.key}
              type="button"
              onClick={() => {
                if (isMore) {
                  onOpenMoreMenu();
                } else {
                  onSelectTab(slot.key as NavItemKey);
                }
              }}
              className={`relative flex flex-col items-center justify-center py-1 transition-all duration-200 select-none group active:scale-[0.94] ${
                isActive ? "text-[#6EE7B7]" : "text-[#A1AEBB] hover:text-[#F8FAFC]"
              }`}
            >
              {/* Active pill background aura */}
              <div
                className={`relative flex items-center justify-center w-10 h-7 rounded-full transition-all duration-200 ${
                  isActive
                    ? "bg-[#5EEAD4]/18 border border-[#5EEAD4]/40 shadow-[0_0_12px_rgba(94,234,212,0.28)]"
                    : "group-hover:bg-white/[0.04]"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-transform duration-200 ${
                    isActive
                      ? "text-[#6EE7B7] drop-shadow-[0_0_6px_rgba(110,231,183,0.6)] scale-110"
                      : "text-[#A1AEBB] group-hover:text-[#F8FAFC]"
                  }`}
                />

                {/* Optional mini badge (e.g. AI or F2) */}
                {slot.badge && !isActive && (
                  <span className="absolute -top-1 -right-1 px-1 py-0.1 text-[8px] font-mono font-extrabold rounded bg-[#5EEAD4]/25 text-[#6EE7B7] border border-[#5EEAD4]/40 scale-90">
                    {slot.badge}
                  </span>
                )}
              </div>

              {/* Label */}
              <span
                className={`text-[10px] tracking-tight mt-0.5 max-w-[58px] truncate transition-all duration-150 ${
                  isActive ? "font-bold text-[#6EE7B7]" : "font-medium text-[#A1AEBB]"
                }`}
              >
                {label}
              </span>

              {/* Active bottom indicator line */}
              {isActive && (
                <span className="absolute bottom-1 w-3 h-0.5 rounded-full bg-[#6EE7B7] shadow-[0_0_6px_#5EEAD4]" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
