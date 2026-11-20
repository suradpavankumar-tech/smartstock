import React, { useEffect } from "react";
import {
  X,
  LayoutDashboard,
  ShoppingCart,
  Package,
  ClipboardList,
  Receipt,
  BookOpen,
  Truck,
  Users,
  Wallet,
  BarChart3,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckSquare,
  Sliders,
  Sparkles,
  ShieldAlert,
  RefreshCw,
  UserCheck,
  Shield,
  Settings,
  LogOut,
  LucideIcon,
  ChevronRight,
  Store,
} from "lucide-react";
import { NavItemKey } from "./Sidebar";
import { useAuth } from "../../context/AuthContext";
import { useLanguage } from "../../context/LanguageContext";

interface MobileMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: NavItemKey;
  onSelectTab: (tab: NavItemKey) => void;
}

interface MenuItemDef {
  key: NavItemKey;
  labelKey: string;
  defaultLabel: string;
  icon: LucideIcon;
  roles: string[];
  badge?: string;
  description?: string;
}

interface MenuSectionDef {
  title: string;
  titleKn: string;
  items: MenuItemDef[];
}

export const MobileMoreMenu: React.FC<MobileMoreMenuProps> = ({
  isOpen,
  onClose,
  currentTab,
  onSelectTab,
}) => {
  const { currentBusiness, user, logout } = useAuth();
  const { t, language } = useLanguage();
  const role = currentBusiness?.role || "OWNER";
  const isKn = language === "kn";

  // Prevent background scroll when bottom sheet is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") onClose();
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    } else {
      document.body.style.overflow = "";
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const sections: MenuSectionDef[] = [
    {
      title: "Core Retail Operations",
      titleKn: "ಮುಖ್ಯ ಕಾರ್ಯಾಚರಣೆಗಳು",
      items: [
        {
          key: "overview",
          labelKey: "navOverview",
          defaultLabel: "Dashboard & KPIs",
          icon: LayoutDashboard,
          roles: ["OWNER", "MANAGER", "CASHIER"],
          description: isKn ? "ದೈನಂದಿನ ಮಾರಾಟ ಮತ್ತು ಅವಲೋಕನ" : "Daily sales, revenue & cash status",
        },
        {
          key: "pos",
          labelKey: "navPOS",
          defaultLabel: "Retail POS Terminal",
          icon: ShoppingCart,
          roles: ["OWNER", "MANAGER", "CASHIER"],
          badge: "F2",
          description: isKn ? "ವೇಗದ ಬಾರ್ಕೋಡ್ ಬಿಲ್ಲಿಂಗ್ ಮತ್ತು ರಶೀದಿ" : "Fast barcode billing & thermal print",
        },
        {
          key: "products",
          labelKey: "navProducts",
          defaultLabel: "Products & Pricing",
          icon: Package,
          roles: ["OWNER", "MANAGER", "CASHIER"],
          description: isKn ? "ಉತ್ಪನ್ನಗಳು ಮತ್ತು ಬೆಲೆ ಪಟ್ಟಿ" : "SKUs, barcode tags & price book",
        },
        {
          key: "inventory",
          labelKey: "navInventory",
          defaultLabel: "Inventory & Batches",
          icon: ClipboardList,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಸ್ಟಾಕ್ ಚಲನೆ ಮತ್ತು ಬ್ಯಾಚ್ ಮುಕ್ತಾಯ" : "Stock ledger & batch tracking",
        },
        {
          key: "sales",
          labelKey: "navSales",
          defaultLabel: "Sales History & Invoices",
          icon: Receipt,
          roles: ["OWNER", "MANAGER", "CASHIER"],
          description: isKn ? "ಹಿಂದಿನ ಬಿಲ್‌ಗಳು ಮತ್ತು ರಶೀದಿಗಳು" : "Invoices, payment modes & GST splits",
        },
        {
          key: "customers",
          labelKey: "navCustomers",
          defaultLabel: "Customers & Khata Ledger",
          icon: BookOpen,
          roles: ["OWNER", "MANAGER", "CASHIER"],
          description: isKn ? "ಉದ್ದರಿ ಖಾತಾ ಮತ್ತು WhatsApp ರಿಮೈಂಡರ್" : "Credit ledger & WhatsApp payment links",
        },
      ],
    },
    {
      title: "Procurement & Expenses",
      titleKn: "ಖರೀದಿ ಮತ್ತು ವೆಚ್ಚಗಳು",
      items: [
        {
          key: "purchases",
          labelKey: "navPurchases",
          defaultLabel: "Purchases & Inward POs",
          icon: Truck,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಖರೀದಿ ಆದೇಶಗಳು ಮತ್ತು GRN" : "PO management & inwards receiving",
        },
        {
          key: "suppliers",
          labelKey: "navSuppliers",
          defaultLabel: "Suppliers & Vendors",
          icon: Users,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಪೂರೈಕೆದಾರರ ಸಂಪರ್ಕ ಮತ್ತು ಬಾಕಿ" : "Vendor directory & purchase history",
        },
        {
          key: "expenses",
          labelKey: "navExpenses",
          defaultLabel: "Store Expenses & Vouchers",
          icon: Wallet,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ದೈನಂದಿನ ಅಂಗಡಿ ಖರ್ಚುಗಳು" : "Rent, tea, logistics & daily vouchers",
        },
      ],
    },
    {
      title: "Intelligence & Decisions",
      titleKn: "ವ್ಯಾಪಾರ ಬುದ್ಧಿಮತ್ತೆ ಮತ್ತು ಮುನ್ಸೂಚನೆ",
      items: [
        {
          key: "analytics",
          labelKey: "navAnalytics",
          defaultLabel: "Financial Analytics & P&L",
          icon: BarChart3,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಲಾಭ, ಮಾರ್ಜಿನ್ ಮತ್ತು ಆದಾಯ" : "Net margins, cash flow & profit analysis",
        },
        {
          key: "reorder",
          labelKey: "navReorder",
          defaultLabel: "Smart Restock Planner",
          icon: AlertCircle,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಕಡಿಮೆ ಸ್ಟಾಕ್ ಶಿಫಾರಸುಗಳು" : "AI reorder recommendations & burn rate",
        },
        {
          key: "forecasting",
          labelKey: "navForecasting",
          defaultLabel: "Runway & Demand Forecast",
          icon: TrendingUp,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಮುಂದಿನ ಬೇಡಿಕೆಯ ಮುನ್ನೋಟ" : "Predictive stockout dates & velocity",
        },
        {
          key: "stock-ageing",
          labelKey: "navStockAgeing",
          defaultLabel: "Stock Ageing & Clearance",
          icon: Clock,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ನಿಷ್ಕ್ರಿಯ ದಾಸ್ತಾನು ಮತ್ತು ರಿಯಾಯಿತಿ" : "Slow-moving SKUs & locked capital",
        },
        {
          key: "reconciliation",
          labelKey: "navReconciliation",
          defaultLabel: "Physical Stock Audit",
          icon: CheckSquare,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಭೌತಿಕ ಸ್ಟಾಕ್ ಪರಿಶೀಲನೆ" : "Audit counts & shrinkage discrepancy",
        },
        {
          key: "simulator",
          labelKey: "navSimulator",
          defaultLabel: "Price & Margin Simulator",
          icon: Sliders,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಬೆಲೆ ಬದಲಾವಣೆ ಸಿಮ್ಯುಲೇಟರ್" : "Price sensitivity & demand elasticity",
        },
        {
          key: "agent",
          labelKey: "navAgent",
          defaultLabel: "SmartStock AI Assistant",
          icon: Sparkles,
          roles: ["OWNER", "MANAGER", "CASHIER"],
          badge: "AI",
          description: isKn ? "ಧ್ವನಿ ಮತ್ತು ಚಾಟ್ ಮೂಲಕ ಸಹಾಯ" : "Deep retail reasoning & drafting",
        },
        {
          key: "anomalies",
          labelKey: "navAnomalies",
          defaultLabel: "Store Risk & Anomalies",
          icon: ShieldAlert,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಅನುಮಾನಾಸ್ಪದ ನಮೂದುಗಳ ಪತ್ತೆ" : "Theft, price drops & suspicious voids",
        },
      ],
    },
    {
      title: "Store Administration",
      titleKn: "ಅಂಗಡಿ ಆಡಳಿತ",
      items: [
        {
          key: "staff",
          labelKey: "navStaff",
          defaultLabel: "Staff & Cashiers",
          icon: UserCheck,
          roles: ["OWNER"],
          description: isKn ? "ಸಿಬ್ಬಂದಿ ಖಾತೆಗಳು ಮತ್ತು ಪಾತ್ರಗಳು" : "Role-based access & PINs",
        },
        {
          key: "audit",
          labelKey: "navAudit",
          defaultLabel: "Security Audit Trail",
          icon: Shield,
          roles: ["OWNER", "MANAGER"],
          description: isKn ? "ಭದ್ರತಾ ಲಾಗ್ ಮತ್ತು ಇತಿಹಾಸ" : "Immutable event logs & cashier actions",
        },
        {
          key: "sync",
          labelKey: "navSync",
          defaultLabel: "Offline Sync Status",
          icon: RefreshCw,
          roles: ["OWNER", "MANAGER", "CASHIER"],
          description: isKn ? "ಆಫ್‌ಲೈನ್ ಬಿಲ್‌ಗಳ ಸಿಂಕ್ ಸ್ಥಿತಿ" : "Offline queue & cloud sync buffer",
        },
        {
          key: "settings",
          labelKey: "navSettings",
          defaultLabel: "Store Profile & GST",
          icon: Settings,
          roles: ["OWNER"],
          description: isKn ? "ಅಂಗಡಿ ಮಾಹಿತಿ ಮತ್ತು ಮುದ್ರಣ ಸೆಟ್ಟಿಂಗ್ಸ್" : "Tax mode, UPI QR & thermal printer",
        },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end"
      aria-modal="true"
      role="dialog"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-[#080B10]/80 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Bottom Sheet Modal */}
      <div className="relative z-10 w-full max-h-[88vh] bg-[#0E131F] border-t border-white/[0.16] rounded-t-[28px] shadow-[0_-20px_60px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden pb-[calc(1rem+env(safe-area-inset-bottom,0px))] animate-liquid-enter">
        {/* Drag Handle */}
        <div className="pt-3 pb-1 shrink-0 flex justify-center">
          <div className="w-12 h-1.5 rounded-full bg-white/25" />
        </div>

        {/* User Profile Bar */}
        <div className="px-5 py-3 border-b border-white/[0.08] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#5EEAD4]/25 to-[#6EE7B7]/10 border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center font-bold text-sm shadow-[0_0_12px_rgba(94,234,212,0.25)] shrink-0">
              {user?.full_name?.charAt(0) || "U"}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-[#F8FAFC] truncate">
                {user?.full_name || "SmartStock User"}
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-[#A1AEBB] mt-0.5 truncate">
                <Store className="w-3 h-3 text-[#5EEAD4] shrink-0" />
                <span className="truncate">{currentBusiness?.name || "Retail Workspace"}</span>
                <span className="px-1.5 py-0.2 rounded-md bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#5EEAD4]/30 font-bold uppercase text-[9px] shrink-0">
                  {role}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={logout}
              title={isKn ? "ಲಾಗ್ ಔಟ್" : "Logout"}
              className="p-2 text-[#A1AEBB] hover:text-[#FB7185] rounded-xl hover:bg-[#FB7185]/10 active:scale-95 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-xl hover:bg-white/[0.06] active:scale-95 transition-colors"
              aria-label="Close Menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Categories List */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-5">
          {sections.map((section, idx) => {
            const visibleItems = section.items.filter((item) => item.roles.includes(role));
            if (visibleItems.length === 0) return null;

            return (
              <div key={idx} className="space-y-2">
                <div className="px-2 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-[#A1AEBB]/75 uppercase tracking-wider">
                    {isKn ? section.titleKn : section.title}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent ml-2" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {visibleItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentTab === item.key;
                    const label = t(item.labelKey) || item.defaultLabel;

                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          onSelectTab(item.key);
                          onClose();
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-2xl text-left transition-all active:scale-[0.98] border ${
                          isActive
                            ? "bg-gradient-to-r from-[#5EEAD4]/20 via-[#6EE7B7]/10 to-transparent border-[#5EEAD4]/40 text-[#6EE7B7] shadow-[0_0_16px_rgba(94,234,212,0.18)]"
                            : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06] text-[#F8FAFC]"
                        }`}
                      >
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border transition-transform ${
                            isActive
                              ? "bg-[#5EEAD4]/20 border-[#5EEAD4]/50 text-[#6EE7B7] shadow-[0_0_10px_rgba(94,234,212,0.3)]"
                              : "bg-white/[0.04] border-white/[0.1] text-[#A1AEBB]"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold truncate">{label}</span>
                            {item.badge && (
                              <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded bg-[#5EEAD4]/20 text-[#6EE7B7] border border-[#5EEAD4]/30 shrink-0">
                                {item.badge}
                              </span>
                            )}
                          </div>
                          {item.description && (
                            <p className="text-[10px] text-[#A1AEBB] truncate mt-0.5">
                              {item.description}
                            </p>
                          )}
                        </div>

                        <ChevronRight className="w-4 h-4 text-[#A1AEBB]/40 shrink-0" />
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
