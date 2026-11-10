import React, { useState, useRef, useEffect } from "react";
import {
  Menu, Globe, Moon, Sun, Shield, Check,
  ChevronDown, Store, RefreshCw, Sparkles, Bell,
  AlertTriangle, AlertCircle, Clock, CheckCheck, X,
  ArrowRight, ShieldCheck, BookOpen, Layers, Trash2
} from "lucide-react";
import { useLanguage } from "../../context/LanguageContext";
import { useAuth } from "../../context/AuthContext";
import { SoundboxWidget } from "./SoundboxWidget";
import { NavItemKey } from "./Sidebar";
import { api } from "../../services/api";

export interface StoreNotification {
  id: string;
  category: "inventory" | "khata" | "system" | "sync";
  title: string;
  description: string;
  severity: "critical" | "warning" | "info" | "success";
  timestamp: string;
  unread: boolean;
  navTab?: NavItemKey;
}

interface HeaderProps {
  onToggleMobileMenu: () => void;
  onNavigate?: (tab: NavItemKey) => void;
}

export const Header: React.FC<HeaderProps> = ({ onToggleMobileMenu, onNavigate }) => {
  const { language, setLanguage, t, kannadaNumerals, setKannadaNumerals } = useLanguage();
  const { currentBusiness, businesses, switchBusiness } = useAuth();
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Notification state
  const [notificationOpen, setNotificationOpen] = useState(false);
  const [notifications, setNotifications] = useState<StoreNotification[]>([]);
  const [readIds, setReadIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("smartstock_read_notifications") || "[]");
    } catch {
      return [];
    }
  });
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("smartstock_dismissed_notifications") || "[]");
    } catch {
      return [];
    }
  });
  const [notificationFilter, setNotificationFilter] = useState<"all" | "inventory" | "khata" | "unread">("all");
  const [isRefreshingNotifications, setIsRefreshingNotifications] = useState(false);
  const notificationMenuRef = useRef<HTMLDivElement>(null);

  // Mock online status & pending sync items
  const isOnline = navigator.onLine;
  const [pendingCount, setPendingCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // Check local storage for offline queue
    const queue = JSON.parse(localStorage.getItem("smartstock_offline_queue") || "[]");
    setPendingCount(queue.length);
  }, []);

  // Fetch real store alerts from backend
  const fetchNotifications = async () => {
    if (!currentBusiness) return;
    setIsRefreshingNotifications(true);
    try {
      const list: StoreNotification[] = [];

      // 1. Check Low Stock Alerts
      try {
        const lowStockItems = await api.getLowStockAlerts();
        if (Array.isArray(lowStockItems) && lowStockItems.length > 0) {
          lowStockItems.slice(0, 5).forEach((item: any) => {
            const isCritical = (item.current_stock || 0) <= 0;
            list.push({
              id: `lowstock-${item.product_id || item.product_name}`,
              category: "inventory",
              title: isCritical
                ? `Out of Stock: ${item.product_name}`
                : `Low Stock: ${item.product_name}`,
              description: item.explanation || `Current stock is ${item.current_stock} ${item.unit || "units"} (Reorder point: ${item.reorder_threshold}).`,
              severity: isCritical ? "critical" : "warning",
              timestamp: isCritical ? "Immediate Action" : "Reorder Needed",
              unread: true,
              navTab: "inventory",
            });
          });
        }
      } catch (_) {}

      // 2. Check Expiring Batches within 30 days
      try {
        const expiring = await api.getExpiringBatches(30);
        if (Array.isArray(expiring) && expiring.length > 0) {
          expiring.slice(0, 3).forEach((b: any) => {
            const daysLeft = b.days_until_expiry !== undefined ? b.days_until_expiry : 0;
            list.push({
              id: `expiry-batch-${b.id || b.batch_number}`,
              category: "inventory",
              title: `Expiring Soon: ${b.product_name}`,
              description: `Batch #${b.batch_number} (${b.quantity} units) expires ${daysLeft <= 0 ? "today or has expired" : `in ${daysLeft} days`}.`,
              severity: daysLeft <= 7 ? "critical" : "warning",
              timestamp: b.expiry_date ? `Exp: ${b.expiry_date}` : "Expiring",
              unread: true,
              navTab: "stock-ageing",
            });
          });
        }
      } catch (_) {}

      // 3. Check Customer Khata Credit Balances
      try {
        const customers = await api.getCustomers();
        if (Array.isArray(customers)) {
          const owingCustomers = customers.filter((c: any) => (c.current_balance || 0) > 0);
          if (owingCustomers.length > 0) {
            const totalKhata = owingCustomers.reduce((acc: number, c: any) => acc + (c.current_balance || 0), 0);
            list.push({
              id: "khata-dues-summary",
              category: "khata",
              title: `Khata Dues: ₹${totalKhata.toLocaleString("en-IN")}`,
              description: `${owingCustomers.length} registered customer(s) have outstanding ledger balances pending collection.`,
              severity: "info",
              timestamp: "Ledger",
              unread: true,
              navTab: "customers",
            });
          }
        }
      } catch (_) {}

      // 4. Offline Queue Sync status
      const queue = JSON.parse(localStorage.getItem("smartstock_offline_queue") || "[]");
      if (queue.length > 0) {
        list.push({
          id: "offline-queue-alert",
          category: "sync",
          title: `${queue.length} Offline Bills Queued`,
          description: "Local transactions recorded in offline mode are waiting to sync to the server.",
          severity: "warning",
          timestamp: "Pending Sync",
          unread: true,
          navTab: "sync",
        });
      }

      // 5. System status if all clear
      if (list.length === 0) {
        list.push({
          id: "system-healthy",
          category: "system",
          title: "All Retail Operations Healthy",
          description: "Zero low-stock alerts, no expiring batches within 30 days, and offline sync is clean.",
          severity: "success",
          timestamp: "All Clear",
          unread: false,
        });
      }

      setNotifications(list);
    } catch (err) {
      console.error("Failed to fetch store notifications:", err);
    } finally {
      setIsRefreshingNotifications(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [currentBusiness?.id]);

  const markAllAsRead = () => {
    const allIds = notifications.map((n) => n.id);
    const updated = Array.from(new Set([...readIds, ...allIds]));
    setReadIds(updated);
    try {
      localStorage.setItem("smartstock_read_notifications", JSON.stringify(updated));
    } catch (_) {}
  };

  const markAsRead = (id: string) => {
    if (readIds.includes(id)) return;
    const updated = [...readIds, id];
    setReadIds(updated);
    try {
      localStorage.setItem("smartstock_read_notifications", JSON.stringify(updated));
    } catch (_) {}
  };

  const dismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = [...dismissedIds, id];
    setDismissedIds(updated);
    try {
      localStorage.setItem("smartstock_dismissed_notifications", JSON.stringify(updated));
    } catch (_) {}
  };

  const clearAllNotifications = () => {
    const allIds = notifications.map((n) => n.id);
    const updated = Array.from(new Set([...dismissedIds, ...allIds]));
    setDismissedIds(updated);
    try {
      localStorage.setItem("smartstock_dismissed_notifications", JSON.stringify(updated));
    } catch (_) {}
  };

  const handleNotificationClick = (item: StoreNotification) => {
    markAsRead(item.id);
    if (item.navTab && onNavigate) {
      onNavigate(item.navTab);
    }
    setNotificationOpen(false);
  };

  // Filtered notifications
  const visibleNotifications = notifications
    .filter((n) => !dismissedIds.includes(n.id))
    .map((n) => ({
      ...n,
      unread: n.unread && !readIds.includes(n.id),
    }));

  const unreadCount = visibleNotifications.filter((n) => n.unread).length;

  const displayNotifications = visibleNotifications.filter((n) => {
    if (notificationFilter === "unread") return n.unread;
    if (notificationFilter === "inventory") return n.category === "inventory";
    if (notificationFilter === "khata") return n.category === "khata";
    return true;
  });

  const triggerSync = async () => {
    setIsSyncing(true);
    setTimeout(() => {
      setPendingCount(0);
      setIsSyncing(false);
      fetchNotifications();
    }, 1200);
  };

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    if (nextTheme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  };

  // Close dropdowns on outside click or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setLangDropdownOpen(false);
      }
      if (notificationMenuRef.current && !notificationMenuRef.current.contains(event.target as Node)) {
        setNotificationOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLangDropdownOpen(false);
        setNotificationOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <header className="h-16 floating-header rounded-2xl mx-0 sm:mx-1 mt-3.5 px-4 sm:px-6 sticky top-3.5 z-30 transition-all flex items-center justify-between">
      {/* Left: Mobile hamburger & shop badge */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="p-2 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg hover:bg-white/[0.06] lg:hidden active:scale-[0.98]"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#5EEAD4]/20 via-[#6EE7B7]/10 to-transparent text-[#6EE7B7] border border-[#5EEAD4]/40 flex items-center justify-center font-bold shadow-[0_0_12px_rgba(94,234,212,0.2)]">
            <Store className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-[#F8FAFC] tracking-tight">
                {currentBusiness?.name || "SmartStock Workspace"}
              </span>
              {currentBusiness?.gstin && (
                <span className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono liquid-pill text-[#A1AEBB] rounded-md">
                  GST: {currentBusiness.gstin}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#A1AEBB]">
              {currentBusiness?.city || "Haveri"}, {currentBusiness?.district || "Karnataka"} • <span className="text-[#6EE7B7] font-semibold">Private Workspace</span>
            </div>
          </div>
        </div>

        {/* Multi-business switcher (only if user has > 1 shop) */}
        {businesses.length > 1 && (
          <div className="relative ml-2">
            <select
              value={currentBusiness?.id}
              onChange={(e) => switchBusiness(Number(e.target.value))}
              aria-label="Switch Active Shop"
              className="text-xs font-medium liquid-pill rounded-lg px-2 py-1 text-[#F8FAFC] focus:ring-1 focus:ring-[#5EEAD4] focus:border-[#5EEAD4]"
            >
              {businesses.map((b) => (
                <option key={b.id} value={b.id} className="bg-[#080B10] text-[#F8FAFC]">
                  {b.name} ({b.city})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: Sync pill, Notification Bell, Language, Theme */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* UPI Soundbox Widget */}
        <SoundboxWidget />

        {/* Offline Sync Status Indicator */}
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium liquid-pill">
          {isOnline ? (
            <>
              <div className="w-2 h-2 rounded-full bg-[#6EE7B7] shadow-[0_0_6px_#5EEAD4] animate-pulse" />
              <span className="text-[#6EE7B7] hidden sm:inline">{t("online")}</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-[#FBBF24]" />
              <span className="text-[#FBBF24] hidden sm:inline">{t("offline")}</span>
            </>
          )}

          {pendingCount > 0 && (
            <button
              onClick={() => triggerSync()}
              disabled={isSyncing}
              className="ml-1 px-1.5 py-0.5 text-[10px] bg-[#FBBF24]/20 text-[#FBBF24] rounded font-semibold flex items-center gap-1 hover:bg-[#FBBF24]/30"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
              {pendingCount}
            </button>
          )}
        </div>

        {/* Fully Functional Liquid Glass Notification Center */}
        <div className="relative" ref={notificationMenuRef}>
          <button
            onClick={() => setNotificationOpen(!notificationOpen)}
            title="Notifications & Store Alerts"
            className={`p-2 rounded-xl transition-all relative active:scale-[0.98] ${
              notificationOpen
                ? "bg-[#5EEAD4]/20 text-[#6EE7B7] border border-[#5EEAD4]/40 shadow-[0_0_12px_rgba(94,234,212,0.25)]"
                : "liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC] hover:border-white/20"
            }`}
          >
            <Bell className={`w-4 h-4 transition-transform duration-200 ${notificationOpen ? "scale-110 text-[#6EE7B7]" : ""}`} />
            {unreadCount > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-[#6EE7B7] text-[#080B10] text-[10px] font-black flex items-center justify-center shadow-[0_0_8px_#5EEAD4] animate-pulse">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            ) : (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-white/20" />
            )}
          </button>

          {notificationOpen && (
            <div className="absolute right-0 mt-3 w-80 sm:w-96 max-h-[32rem] liquid-modal rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.7)] border border-white/20 z-50 overflow-hidden flex flex-col backdrop-blur-2xl bg-[#080B10]/95 animate-liquid-enter">
              {/* Header */}
              <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#5EEAD4]/15 border border-[#5EEAD4]/30 flex items-center justify-center text-[#6EE7B7]">
                    <Bell className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                      Store Notifications
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#6EE7B7]/20 text-[#6EE7B7] border border-[#6EE7B7]/30">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#A1AEBB]">
                      Inventory, khata & system alerts
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={fetchNotifications}
                    disabled={isRefreshingNotifications}
                    title="Refresh alerts"
                    className="p-1.5 text-[#A1AEBB] hover:text-[#5EEAD4] rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingNotifications ? "animate-spin text-[#5EEAD4]" : ""}`} />
                  </button>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllAsRead}
                      title="Mark all as read"
                      className="p-1.5 text-[#A1AEBB] hover:text-[#6EE7B7] rounded-lg hover:bg-white/[0.06] transition-colors"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setNotificationOpen(false)}
                    title="Close"
                    className="p-1.5 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg hover:bg-white/[0.06] transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/10 bg-white/[0.01] overflow-x-auto text-[11px]">
                <button
                  onClick={() => setNotificationFilter("all")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    notificationFilter === "all"
                      ? "bg-[#5EEAD4]/20 text-[#6EE7B7] font-bold border border-[#5EEAD4]/30"
                      : "text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.04]"
                  }`}
                >
                  All ({visibleNotifications.length})
                </button>
                <button
                  onClick={() => setNotificationFilter("unread")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    notificationFilter === "unread"
                      ? "bg-[#5EEAD4]/20 text-[#6EE7B7] font-bold border border-[#5EEAD4]/30"
                      : "text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.04]"
                  }`}
                >
                  Unread ({unreadCount})
                </button>
                <button
                  onClick={() => setNotificationFilter("inventory")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    notificationFilter === "inventory"
                      ? "bg-[#5EEAD4]/20 text-[#6EE7B7] font-bold border border-[#5EEAD4]/30"
                      : "text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.04]"
                  }`}
                >
                  Inventory
                </button>
                <button
                  onClick={() => setNotificationFilter("khata")}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    notificationFilter === "khata"
                      ? "bg-[#5EEAD4]/20 text-[#6EE7B7] font-bold border border-[#5EEAD4]/30"
                      : "text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.04]"
                  }`}
                >
                  Khata
                </button>
              </div>

              {/* Notification List */}
              <div className="overflow-y-auto max-h-[22rem] divide-y divide-white/5">
                {displayNotifications.length === 0 ? (
                  <div className="p-8 text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 rounded-2xl bg-[#6EE7B7]/10 border border-[#6EE7B7]/30 flex items-center justify-center text-[#6EE7B7] mb-3 shadow-[0_0_16px_rgba(110,231,183,0.15)]">
                      <ShieldCheck className="w-6 h-6" />
                    </div>
                    <div className="text-xs font-bold text-[#F8FAFC]">All Caught Up!</div>
                    <div className="text-[11px] text-[#A1AEBB] mt-1 max-w-[220px]">
                      No active store alerts in this view. Your inventory and khata registers are in order.
                    </div>
                  </div>
                ) : (
                  displayNotifications.map((item) => {
                    const isCritical = item.severity === "critical";
                    const isWarning = item.severity === "warning";
                    const isSuccess = item.severity === "success";

                    return (
                      <div
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        className={`p-3 transition-colors cursor-pointer group flex items-start gap-3 hover:bg-white/[0.04] relative ${
                          item.unread ? "bg-[#5EEAD4]/[0.03]" : ""
                        }`}
                      >
                        {/* Status Icon */}
                        <div
                          className={`w-8 h-8 rounded-xl shrink-0 flex items-center justify-center border transition-transform group-hover:scale-105 ${
                            isCritical
                              ? "bg-[#FB7185]/15 border-[#FB7185]/40 text-[#FB7185] shadow-[0_0_10px_rgba(251,113,133,0.2)]"
                              : isWarning
                              ? "bg-[#FBBF24]/15 border-[#FBBF24]/40 text-[#FBBF24] shadow-[0_0_10px_rgba(251,191,36,0.2)]"
                              : isSuccess
                              ? "bg-[#6EE7B7]/15 border-[#6EE7B7]/40 text-[#6EE7B7] shadow-[0_0_10px_rgba(110,231,183,0.2)]"
                              : "bg-[#7DD3FC]/15 border-[#7DD3FC]/40 text-[#7DD3FC] shadow-[0_0_10px_rgba(125,211,252,0.2)]"
                          }`}
                        >
                          {isCritical ? (
                            <AlertTriangle className="w-4 h-4" />
                          ) : isWarning ? (
                            <Clock className="w-4 h-4" />
                          ) : isSuccess ? (
                            <ShieldCheck className="w-4 h-4" />
                          ) : item.category === "khata" ? (
                            <BookOpen className="w-4 h-4" />
                          ) : (
                            <AlertCircle className="w-4 h-4" />
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0 pr-4">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-bold text-[#F8FAFC] truncate">
                              {item.title}
                            </span>
                            {item.unread && (
                              <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7] shrink-0 shadow-[0_0_4px_#5EEAD4]" />
                            )}
                          </div>
                          <p className="text-[11px] text-[#A1AEBB] mt-0.5 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                          <div className="flex items-center justify-between mt-1.5 text-[10px]">
                            <span
                              className={`font-semibold ${
                                isCritical
                                  ? "text-[#FB7185]"
                                  : isWarning
                                  ? "text-[#FBBF24]"
                                  : isSuccess
                                  ? "text-[#6EE7B7]"
                                  : "text-[#7DD3FC]"
                              }`}
                            >
                              {item.timestamp}
                            </span>
                            {item.navTab && (
                              <span className="text-[#5EEAD4] opacity-0 group-hover:opacity-100 flex items-center gap-0.5 transition-opacity font-semibold">
                                View <ArrowRight className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Dismiss button */}
                        <button
                          onClick={(e) => dismissNotification(item.id, e)}
                          title="Dismiss notification"
                          className="absolute top-2.5 right-2.5 p-1 text-[#A1AEBB] hover:text-[#FB7185] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Popover Footer */}
              <div className="p-2.5 border-t border-white/10 bg-white/[0.02] flex items-center justify-between text-[11px]">
                <div className="text-[10px] text-[#A1AEBB]">
                  Synced with SmartStock Engine
                </div>
                {visibleNotifications.length > 0 && (
                  <button
                    onClick={clearAllNotifications}
                    className="text-[10px] font-semibold text-[#A1AEBB] hover:text-[#FB7185] transition-colors flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear all
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Smart Language Switcher (English / Kannada with Google AI Data Translate) */}
        <div className="relative" ref={langMenuRef}>
          <button
            onClick={() => setLangDropdownOpen(!langDropdownOpen)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold rounded-xl transition-all border active:scale-[0.98] ${
              language === "kn"
                ? "bg-[#5EEAD4]/15 text-[#6EE7B7] border-[#5EEAD4]/40 shadow-[0_0_12px_rgba(94,234,212,0.2)]"
                : "liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC]"
            }`}
            title="Language Switcher / ಭಾಷೆ ಆಯ್ಕೆ"
          >
            <Globe className="w-3.5 h-3.5 text-[#5EEAD4]" />
            <span>{language === "kn" ? "ಕನ್ನಡ" : "English"}</span>
            {language === "kn" && (
              <span className="hidden sm:inline-flex items-center gap-0.5 px-1 py-0.2 text-[9px] bg-[#5EEAD4] text-[#080B10] rounded font-bold shadow-2xs">
                <Sparkles className="w-2.5 h-2.5" /> Google AI
              </span>
            )}
            <ChevronDown className="w-3 h-3 text-[#A1AEBB]" />
          </button>

          {langDropdownOpen && (
            <div className="absolute right-0 mt-2 w-64 liquid-modal rounded-2xl p-2 z-50">
              <div className="text-[11px] font-bold text-[#A1AEBB] uppercase tracking-wider px-2 py-1">
                Select Language / ಭಾಷೆ
              </div>

              {/* English Option */}
              <button
                onClick={() => {
                  setLanguage("en");
                  setLangDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-left transition-colors active:scale-[0.98] ${
                  language === "en"
                    ? "bg-[#5EEAD4]/15 text-[#6EE7B7] font-bold border border-[#5EEAD4]/30"
                    : "text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.06]"
                }`}
              >
                <div>
                  <div className="font-bold">English (Standard)</div>
                  <div className="text-[10px] text-[#A1AEBB]/70">Default interface & data</div>
                </div>
                {language === "en" && <Check className="w-4 h-4 text-[#5EEAD4]" />}
              </button>

              {/* Kannada Option with Google Translate */}
              <button
                onClick={() => {
                  setLanguage("kn");
                  setLangDropdownOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3 py-2 mt-1 rounded-xl text-xs font-medium text-left transition-colors active:scale-[0.98] ${
                  language === "kn"
                    ? "bg-[#5EEAD4]/20 text-[#6EE7B7] font-bold border border-[#5EEAD4]/40 shadow-[0_0_10px_rgba(94,234,212,0.2)]"
                    : "text-[#A1AEBB] hover:text-[#F8FAFC] hover:bg-white/[0.06]"
                }`}
              >
                <div>
                  <div className="font-bold flex items-center gap-1.5">
                    ಕನ್ನಡ (Kannada)
                    <span className="px-1 py-0.2 text-[9px] bg-[#5EEAD4] text-[#080B10] rounded font-bold shadow-2xs">
                      Google AI Data
                    </span>
                  </div>
                  <div className="text-[10px] text-[#A1AEBB]/70">
                    ಎಲ್ಲಾ ಉತ್ಪನ್ನಗಳು & ಡೇಟಾ ಕನ್ನಡೀಕರಣ
                  </div>
                </div>
                {language === "kn" && <Check className="w-4 h-4 text-[#5EEAD4]" />}
              </button>

              {/* Kannada Numerals Sub-Toggle (when Kannada is active) */}
              {language === "kn" && (
                <div className="mt-2 pt-2 border-t border-white/10 px-2 py-1">
                  <label className="flex items-center justify-between cursor-pointer text-[11px] text-[#A1AEBB]">
                    <span>ಕನ್ನಡ ಅಂಕಿಗಳು (೧, ೨, ೩)</span>
                    <input
                      type="checkbox"
                      checked={kannadaNumerals}
                      onChange={(e) => setKannadaNumerals(e.target.checked)}
                      className="rounded text-[#5EEAD4] focus:ring-[#5EEAD4] w-3.5 h-3.5 bg-[#080B10] border-white/20"
                    />
                  </label>
                  <p className="text-[9px] text-[#A1AEBB]/60 mt-0.5">
                    ಬೆಲೆ ಮತ್ತು ಸಂಖ್ಯೆಗಳನ್ನು ಕನ್ನಡ ಲಿಪಿಯಲ್ಲಿ ತೋರಿಸಲು
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Dark/Light mode toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC] rounded-xl transition-all active:scale-[0.98]"
          title="Toggle Theme"
        >
          {theme === "dark" ? <Sun className="w-4 h-4 text-[#5EEAD4]" /> : <Moon className="w-4 h-4 text-[#A78BFA]" />}
        </button>
      </div>
    </header>
  );
};
