import React from "react";
import {
  LayoutDashboard, ShoppingCart, Package, ClipboardList,
  Truck, Users, Receipt, BookOpen, Wallet, BarChart3,
  AlertCircle, Bot, UserCheck, Shield, Settings, LogOut
} from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";

export type NavItemKey =
  | "overview"
  | "pos"
  | "products"
  | "categories"
  | "inventory"
  | "purchases"
  | "suppliers"
  | "sales"
  | "customers"
  | "expenses"
  | "analytics"
  | "forecasting"
  | "reorder"
  | "stock-ageing"
  | "reconciliation"
  | "simulator"
  | "agent"
  | "anomalies"
  | "sync"
  | "staff"
  | "audit"
  | "settings";

interface SidebarProps {
  currentTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
}) => {
  const { t } = useLanguage();
  const { currentBusiness, user, logout } = useAuth();
  const role = currentBusiness?.role || "OWNER";

  const navSections = [
    {
      title: "Core Operations",
      items: [
        { key: "overview" as NavItemKey, label: t("navOverview"), icon: LayoutDashboard, roles: ["OWNER", "MANAGER", "CASHIER"] },
        { key: "pos" as NavItemKey, label: t("navPOS"), icon: ShoppingCart, roles: ["OWNER", "MANAGER", "CASHIER"], badge: "F2" },
        { key: "products" as NavItemKey, label: t("navProducts"), icon: Package, roles: ["OWNER", "MANAGER", "CASHIER"] },
        { key: "inventory" as NavItemKey, label: t("navInventory"), icon: ClipboardList, roles: ["OWNER", "MANAGER"] },
        { key: "sales" as NavItemKey, label: t("navSales"), icon: Receipt, roles: ["OWNER", "MANAGER", "CASHIER"] },
        { key: "customers" as NavItemKey, label: t("navCustomers"), icon: BookOpen, roles: ["OWNER", "MANAGER", "CASHIER"] },
      ],
    },
    {
      title: "Procurement & Costs",
      items: [
        { key: "purchases" as NavItemKey, label: t("navPurchases"), icon: Truck, roles: ["OWNER", "MANAGER"] },
        { key: "suppliers" as NavItemKey, label: t("navSuppliers"), icon: Users, roles: ["OWNER", "MANAGER"] },
        { key: "expenses" as NavItemKey, label: t("navExpenses"), icon: Wallet, roles: ["OWNER", "MANAGER"] },
      ],
    },
    {
      title: "Intelligence & Decisions",
      items: [
        { key: "analytics" as NavItemKey, label: t("navAnalytics"), icon: BarChart3, roles: ["OWNER", "MANAGER"] },
        { key: "reorder" as NavItemKey, label: t("navReorder"), icon: AlertCircle, roles: ["OWNER", "MANAGER"] },
        { key: "agent" as NavItemKey, label: t("navAgent"), icon: Bot, roles: ["OWNER", "MANAGER", "CASHIER"], badge: "AI" },
      ],
    },
    {
      title: "Administration",
      items: [
        { key: "settings" as NavItemKey, label: t("navSettings"), icon: Settings, roles: ["OWNER"] },
        { key: "staff" as NavItemKey, label: t("navStaff"), icon: UserCheck, roles: ["OWNER"] },
        { key: "audit" as NavItemKey, label: t("navAudit"), icon: Shield, roles: ["OWNER", "MANAGER"] },
      ],
    },
  ];

  return (
    <>
      {/* Mobile backdrop with liquid glass blur */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 bg-[#080B10]/80 backdrop-blur-md z-40 lg:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Floating Apple-inspired Liquid Glass Sidebar Panel */}
      <aside
        className={`fixed top-3.5 bottom-3.5 left-3.5 z-50 w-64 floating-sidebar rounded-3xl flex flex-col transition-all duration-300 ease-in-out lg:translate-x-0 ${
          isOpenMobile ? "translate-x-0" : "-translate-x-[calc(100%+1.5rem)]"
        }`}
      >
        {/* Brand Header with Liquid Mist Emblem */}
        <div className="h-16 flex items-center px-4 border-b border-white/10 gap-3">
          {/* Reference circular emblem with teal/mint glow */}
          <div className="w-10 h-10 rounded-full bg-[#080B10] border border-[#5EEAD4]/50 text-[#6EE7B7] flex items-center justify-center font-black text-sm shadow-[0_0_16px_rgba(94,234,212,0.35)] shrink-0 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#5EEAD4]/20 to-transparent pointer-events-none" />
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-[#6EE7B7]">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
              <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <h1 className="text-sm font-extrabold text-[#F8FAFC] tracking-tight truncate">
                SmartStock
              </h1>
              <span className="px-1.5 py-0.2 text-[9px] font-bold rounded-full bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#5EEAD4]/40 shadow-[0_0_8px_rgba(94,234,212,0.25)]">
                Liquid Glass
              </span>
            </div>
            <p className="text-[11px] text-[#A1AEBB] font-medium truncate flex items-center gap-1.5 mt-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] shadow-[0_0_6px_#5EEAD4] animate-pulse" />
              {currentBusiness?.name || "Retail Workspace"}
            </p>
          </div>
        </div>

        {/* Navigation list with Liquid Glass Items */}
        <div className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
          {navSections.map((section, idx) => {
            const filteredItems = section.items.filter((item) => item.roles.includes(role));
            if (filteredItems.length === 0) return null;

            return (
              <div key={idx}>
                <div className="px-3 mb-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#A1AEBB]/70 uppercase tracking-wider">
                    {section.title}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent ml-2" />
                </div>
                <div className="space-y-1">
                  {filteredItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.key;
                    return (
                      <button
                        key={item.key}
                        onClick={() => {
                          onSelectTab(item.key);
                          onCloseMobile();
                        }}
                        className={`w-full group flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-all duration-200 relative active:scale-[0.98] ${
                          isActive
                            ? "bg-gradient-to-r from-[#5EEAD4]/20 via-[#6EE7B7]/10 to-transparent text-[#6EE7B7] font-bold border border-[#5EEAD4]/40 shadow-[0_0_18px_rgba(94,234,212,0.22)] backdrop-blur-md"
                            : "text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.06] border border-transparent hover:border-white/10 font-medium"
                        }`}
                      >
                        {isActive && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 rounded-r-full bg-[#6EE7B7] shadow-[0_0_8px_#5EEAD4]" />
                        )}
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-transform duration-200 ${
                            isActive
                              ? "text-[#6EE7B7] drop-shadow-[0_0_8px_rgba(110,231,183,0.6)] scale-110"
                              : "text-[#A1AEBB] group-hover:text-[#F8FAFC] group-hover:scale-105"
                          }`}
                        />
                        <span className="truncate flex-1 text-left">{item.label}</span>
                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.5 text-[9px] font-bold rounded-md shadow-2xs ${
                              isActive
                                ? "bg-[#6EE7B7]/20 text-[#6EE7B7] border border-[#5EEAD4]/50"
                                : "bg-white/[0.06] text-[#A1AEBB] border border-white/10"
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* User Footer: Floating Smoky Glass Island Card */}
        <div className="p-3 border-t border-white/10">
          <div className="flex items-center gap-2.5 p-2.5 rounded-2xl bg-white/[0.04] border border-white/10 backdrop-blur-md shadow-sm">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#5EEAD4]/25 to-[#6EE7B7]/10 border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center font-bold text-xs shadow-[0_0_10px_rgba(94,234,212,0.2)] shrink-0">
              {user?.full_name?.charAt(0) || "U"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-[#F8FAFC] truncate">
                {user?.full_name}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="px-1.5 py-0.2 text-[9px] font-bold rounded bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#5EEAD4]/30">
                  {role}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] shadow-[0_0_6px_#5EEAD4] animate-pulse" />
              </div>
            </div>
            <button
              onClick={logout}
              title={t("logout")}
              className="p-1.5 text-[#A1AEBB] hover:text-[#FB7185] rounded-lg hover:bg-[#FB7185]/10 border border-transparent hover:border-[#FB7185]/30 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};
