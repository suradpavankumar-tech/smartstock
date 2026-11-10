import React, { useState, useEffect, useMemo } from "react";
import { Role, StaffMember } from "../types";
import { api } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";
import { EmptyState } from "../components/EmptyState";
import { KannadaText } from "../components/common/KannadaText";
import {
  UserCheck, UserX, Plus, Shield, ShieldCheck, Mail, Phone,
  Key, CheckCircle2, Lock, X, RefreshCw, AlertCircle, Copy,
  Check, Search, Filter, Trash2, Edit3, Crown, ShoppingBag,
  ArrowRightLeft, Sparkles, MessageCircle, AlertTriangle, Users,
  CheckCircle, Ban
} from "lucide-react";

export const StaffPage: React.FC = () => {
  const { t, language, tData, formatDateLocalized } = useLanguage();
  const { user: currentUser, currentBusiness } = useAuth();

  const isStoreOwner = currentBusiness?.role === "OWNER";

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterRole, setFilterRole] = useState<"ALL" | Role | "SUSPENDED">("ALL");

  // Modals state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [submittingInvite, setSubmittingInvite] = useState(false);

  // Success Credential Share Modal
  const [credentialCard, setCredentialCard] = useState<{
    full_name: string;
    email: string;
    phone?: string;
    role: Role;
    secret: string;
  } | null>(null);
  const [copiedCredentials, setCopiedCredentials] = useState(false);

  // Edit Role Modal
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [newSelectedRole, setNewSelectedRole] = useState<Role>("CASHIER");
  const [updatingRole, setUpdatingRole] = useState(false);

  // Reset PIN / Password Modal
  const [resettingStaff, setResettingStaff] = useState<StaffMember | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = useState<string | null>(null);

  // Delete Confirm Modal
  const [deletingStaff, setDeletingStaff] = useState<StaffMember | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toggle Status Loading map
  const [togglingId, setTogglingId] = useState<number | null>(null);

  // Add Employee Form
  const [inviteForm, setInviteForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    role: "CASHIER" as Role,
    temp_password: "",
  });

  const fetchStaff = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getStaff();
      setStaff(data);
    } catch (err: any) {
      setError(err.message || "Failed to load staff list");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStaff();
  }, []);

  // Stats calculation
  const stats = useMemo(() => {
    const total = staff.length;
    const cashiers = staff.filter((s) => s.role === "CASHIER").length;
    const managers = staff.filter((s) => s.role === "MANAGER").length;
    const owners = staff.filter((s) => s.role === "OWNER").length;
    const active = staff.filter((s) => s.is_active).length;
    const suspended = staff.filter((s) => !s.is_active).length;
    return { total, cashiers, managers, owners, active, suspended };
  }, [staff]);

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    return staff.filter((s) => {
      // Role / Status filter
      if (filterRole === "SUSPENDED" && s.is_active) return false;
      if (filterRole !== "ALL" && filterRole !== "SUSPENDED" && s.role !== filterRole) return false;

      // Search term filter
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchName = s.full_name.toLowerCase().includes(q);
        const matchEmail = s.email.toLowerCase().includes(q);
        const matchPhone = s.phone ? s.phone.toLowerCase().includes(q) : false;
        if (!matchName && !matchEmail && !matchPhone) return false;
      }

      return true;
    });
  }, [staff, filterRole, searchTerm]);

  // Generate a random 4-digit PIN for counter quick logins
  const generateRandomPin = () => {
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    return pin;
  };

  // Handle Invite
  const handleInviteStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.email.trim() || !inviteForm.full_name.trim()) return;
    setSubmittingInvite(true);
    try {
      const passwordToUse = inviteForm.temp_password.trim() || generateRandomPin();
      const payload = {
        full_name: inviteForm.full_name.trim(),
        email: inviteForm.email.trim().toLowerCase(),
        phone: inviteForm.phone.trim() || undefined,
        role: inviteForm.role,
        temp_password: passwordToUse,
      };

      await api.inviteStaff(payload);
      setShowInviteModal(false);

      // Open credentials sharing popup
      setCredentialCard({
        full_name: payload.full_name,
        email: payload.email,
        phone: payload.phone,
        role: payload.role,
        secret: passwordToUse,
      });

      // Reset form
      setInviteForm({
        full_name: "",
        email: "",
        phone: "",
        role: "CASHIER",
        temp_password: "",
      });

      await fetchStaff();
    } catch (err: any) {
      alert(err.message || "Failed to add employee");
    } finally {
      setSubmittingInvite(false);
    }
  };

  // Handle Role Change
  const handleUpdateRole = async () => {
    if (!editingStaff) return;
    setUpdatingRole(true);
    try {
      await api.updateStaff(editingStaff.id, { role: newSelectedRole });
      setEditingStaff(null);
      await fetchStaff();
    } catch (err: any) {
      alert(err.message || "Failed to update role");
    } finally {
      setUpdatingRole(false);
    }
  };

  // Handle Toggle Active/Suspend
  const handleToggleStatus = async (member: StaffMember) => {
    if (!isStoreOwner) {
      alert("Only the Store Owner can change staff status.");
      return;
    }
    if (member.user_id === currentUser?.id) {
      alert("You cannot suspend your own account.");
      return;
    }
    setTogglingId(member.id);
    try {
      await api.updateStaff(member.id, { is_active: !member.is_active });
      await fetchStaff();
    } catch (err: any) {
      alert(err.message || "Failed to update staff status");
    } finally {
      setTogglingId(null);
    }
  };

  // Handle Password/PIN Reset
  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resettingStaff || !newPassword.trim()) return;
    setResettingPassword(true);
    try {
      const res = await api.resetStaffPassword(resettingStaff.id, newPassword.trim());
      setResetSuccessMessage(res.message);
      // Give the owner the share card
      setCredentialCard({
        full_name: resettingStaff.full_name,
        email: resettingStaff.email,
        phone: resettingStaff.phone || undefined,
        role: resettingStaff.role,
        secret: newPassword.trim(),
      });
      setResettingStaff(null);
      setNewPassword("");
    } catch (err: any) {
      alert(err.message || "Failed to reset password");
    } finally {
      setResettingPassword(false);
    }
  };

  // Handle Delete Staff
  const handleDeleteStaff = async () => {
    if (!deletingStaff) return;
    setDeleting(true);
    try {
      await api.removeStaff(deletingStaff.id);
      setDeletingStaff(null);
      await fetchStaff();
    } catch (err: any) {
      alert(err.message || "Failed to remove staff member");
    } finally {
      setDeleting(false);
    }
  };

  // Generate formatted WhatsApp / Clipboard text for credentials
  const getCredentialShareText = (card: { full_name: string; email: string; role: Role; secret: string }) => {
    const shopName = currentBusiness?.name || "SmartStock Store";
    const roleLabel = card.role === "CASHIER" ? "Counter Cashier (ಕ್ಯಾಷಿಯರ್)" : card.role === "MANAGER" ? "Store Manager (ಮ್ಯಾನೇಜರ್)" : "Store Owner";
    const appUrl = window.location.origin;

    return `🏪 *${shopName}* - Employee Login Details\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `👤 *Staff Name:* ${card.full_name}\n` +
      `🛡️ *Role:* ${roleLabel}\n` +
      `📧 *Login Email:* ${card.email}\n` +
      `🔑 *PIN / Password:* ${card.secret}\n` +
      `🌐 *Store Portal:* ${appUrl}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `⚠️ Note: Please keep this login credential safe and do not share outside the store.`;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCredentials(true);
    setTimeout(() => setCopiedCredentials(false), 2500);
  };

  const openWhatsAppShare = (phone: string | undefined, text: string) => {
    const cleanPhone = phone ? phone.replace(/[^0-9]/g, "") : "";
    const phoneParam = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
    const url = phoneParam
      ? `https://wa.me/${phoneParam}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
            <UserCheck className="w-6 h-6 text-brand-600 dark:text-brand-400" />
            Staff & Permissions (ಸಿಬ್ಬಂದಿ ಮತ್ತು ಅನುಮತಿಗಳು)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage multi-user employee logins, cashier counter PINs, and role-segregated Kirana access.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchStaff}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-sm"
            title={t("refresh")}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          {isStoreOwner && (
            <button
              onClick={() => {
                setInviteForm({
                  full_name: "",
                  email: "",
                  phone: "",
                  role: "CASHIER",
                  temp_password: generateRandomPin(),
                });
                setShowInviteModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-semibold transition-all shadow-sm hover:shadow active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Add Employee
            </button>
          )}
        </div>
      </div>

      {/* View-Only Banner for non-owners */}
      {!isStoreOwner && (
        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span>
            <strong>View-Only Access:</strong> You are signed in as a <strong>{currentBusiness?.role}</strong>. Only the Store Owner has administrative rights to add employees, alter roles, or reset counter PINs.
          </span>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Total Staff</span>
            <Users className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white">
            {stats.total}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-500"></span>
            {stats.active} Active {stats.suspended > 0 && `• ${stats.suspended} Suspended`}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Billing Cashiers</span>
            <ShoppingBag className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.cashiers}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            POS counter & Khata (Costs hidden)
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Store Managers</span>
            <ShieldCheck className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
            {stats.managers}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Inventory, POs & expenses
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium mb-1">
            <span>Store Owners</span>
            <Crown className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
            {stats.owners}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Full control & profit access
          </div>
        </div>
      </div>

      {/* Main Employee Directory Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        {/* Controls: Search and Filters */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/20">
          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search staff by name, email, phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 text-xs">
            <span className="text-slate-400 text-xs mr-1 hidden md:inline">Filter:</span>
            {(["ALL", "CASHIER", "MANAGER", "OWNER", "SUSPENDED"] as const).map((roleKey) => (
              <button
                key={roleKey}
                onClick={() => setFilterRole(roleKey)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  filterRole === roleKey
                    ? "bg-brand-600 text-white shadow-xs"
                    : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                }`}
              >
                {roleKey === "ALL"
                  ? `All (${staff.length})`
                  : roleKey === "CASHIER"
                  ? `Cashiers (${stats.cashiers})`
                  : roleKey === "MANAGER"
                  ? `Managers (${stats.managers})`
                  : roleKey === "OWNER"
                  ? `Owners (${stats.owners})`
                  : `Suspended (${stats.suspended})`}
              </button>
            ))}
          </div>
        </div>

        {/* Staff Table */}
        {loading ? (
          <div className="p-16 text-center text-slate-500 dark:text-slate-400 text-sm animate-pulse flex flex-col items-center justify-center gap-2">
            <RefreshCw className="w-5 h-5 animate-spin text-brand-600" />
            <span>Loading store staff directory...</span>
          </div>
        ) : error ? (
          <div className="p-6 m-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-400 text-sm flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Unable to load staff members</p>
              <p className="text-xs mt-0.5">{error}</p>
            </div>
          </div>
        ) : filteredStaff.length === 0 ? (
          <div className="p-8">
            <EmptyState
              title={searchTerm || filterRole !== "ALL" ? "No matching employees found" : "No Additional Staff Added"}
              description={
                searchTerm || filterRole !== "ALL"
                  ? "Try clearing your search query or switching role filter tab."
                  : "You are currently the sole authenticated user for this shop. Add cashiers or store managers to grant segregated access."
              }
              actionText={searchTerm || filterRole !== "ALL" ? "Clear Filters" : isStoreOwner ? "Add Employee" : undefined}
              onAction={() => {
                if (searchTerm || filterRole !== "ALL") {
                  setSearchTerm("");
                  setFilterRole("ALL");
                } else if (isStoreOwner) {
                  setShowInviteModal(true);
                }
              }}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Staff Member</th>
                  <th className="px-5 py-3.5 font-semibold">Contact Info</th>
                  <th className="px-5 py-3.5 font-semibold text-center">Assigned Role</th>
                  <th className="px-5 py-3.5 font-semibold text-center">Login Status</th>
                  <th className="px-5 py-3.5 font-semibold text-right">Added On</th>
                  {isStoreOwner && <th className="px-5 py-3.5 font-semibold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredStaff.map((member) => {
                  const isCurrentLoggedUser = member.user_id === currentUser?.id;
                  const initials = member.full_name
                    ? member.full_name
                        .split(" ")
                        .map((n) => n[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()
                    : "SS";

                  return (
                    <tr
                      key={member.id}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${
                        !member.is_active ? "opacity-60 bg-slate-50/40 dark:bg-slate-900/40" : ""
                      }`}
                    >
                      {/* Name & Avatar */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                              member.role === "OWNER"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 ring-2 ring-purple-200 dark:ring-purple-800"
                                : member.role === "MANAGER"
                                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 ring-2 ring-blue-200 dark:ring-blue-800"
                                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300 ring-2 ring-emerald-200 dark:ring-emerald-800"
                            }`}
                          >
                            {initials}
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <span><KannadaText text={member.full_name} /></span>
                              {isCurrentLoggedUser && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-brand-100 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300">
                                  {language === "kn" ? "ನೀವು (YOU)" : "YOU"}
                                </span>
                              )}
                              {!member.is_active && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                                  {language === "kn" ? "ಅಮಾನತು" : "SUSPENDED"}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">
                              ID: #{member.id} • User #{member.user_id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Info (Email & Phone with WhatsApp link) */}
                      <td className="px-5 py-3.5">
                        <div className="space-y-1">
                          <div className="text-xs text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-mono">{member.email}</span>
                          </div>
                          {member.phone ? (
                            <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-mono">{member.phone}</span>
                              <button
                                onClick={() => {
                                  const text = getCredentialShareText({
                                    full_name: member.full_name,
                                    email: member.email,
                                    role: member.role,
                                    secret: "••••",
                                  });
                                  openWhatsAppShare(member.phone || undefined, text);
                                }}
                                title="Chat on WhatsApp"
                                className="text-emerald-600 hover:text-emerald-700 p-0.5 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/50"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400 italic">No phone added</span>
                          )}
                        </div>
                      </td>

                      {/* Assigned Role */}
                      <td className="px-5 py-3.5 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${
                            member.role === "OWNER"
                              ? "bg-purple-50 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                              : member.role === "MANAGER"
                              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                              : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                          }`}
                        >
                          {member.role === "OWNER" ? (
                            <Crown className="w-3.5 h-3.5" />
                          ) : member.role === "MANAGER" ? (
                            <ShieldCheck className="w-3.5 h-3.5" />
                          ) : (
                            <ShoppingBag className="w-3.5 h-3.5" />
                          )}
                          {member.role === "OWNER"
                            ? (language === "kn" ? "ಅಂಗಡಿ ಮಾಲೀಕರು (Owner)" : "Store Owner")
                            : member.role === "MANAGER"
                            ? (language === "kn" ? "ವ್ಯವಸ್ಥಾಪಕರು (Manager)" : "Manager")
                            : (language === "kn" ? "ಕ್ಯಾಷಿಯರ್ (Cashier)" : "Cashier")}
                        </span>
                      </td>

                      {/* Login Status */}
                      <td className="px-5 py-3.5 text-center">
                        {member.is_active ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            {language === "kn" ? "ಸಕ್ರಿಯ (Active)" : "Active"}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border border-rose-200 dark:border-rose-800">
                            <Ban className="w-3.5 h-3.5 text-rose-500" />
                            {language === "kn" ? "ಅಮಾನತು (Suspended)" : "Suspended"}
                          </span>
                        )}
                      </td>

                      {/* Added Date */}
                      <td className="px-5 py-3.5 text-right text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {member.created_at ? formatDateLocalized(member.created_at) : "—"}
                      </td>

                      {/* Owner Actions */}
                      {isStoreOwner && (
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Reset PIN / Password */}
                            <button
                              onClick={() => {
                                setResettingStaff(member);
                                setNewPassword(generateRandomPin());
                                setResetSuccessMessage(null);
                              }}
                              className="p-1.5 text-slate-600 hover:text-amber-600 hover:bg-amber-50 dark:text-slate-400 dark:hover:text-amber-400 dark:hover:bg-amber-950/40 rounded-lg transition-colors"
                              title="Reset Counter PIN / Password"
                            >
                              <Key className="w-4 h-4" />
                            </button>

                            {/* Change Role (Not allowed for self if sole owner) */}
                            {(!isCurrentLoggedUser || member.role !== "OWNER") && (
                              <button
                                onClick={() => {
                                  setEditingStaff(member);
                                  setNewSelectedRole(member.role);
                                }}
                                className="p-1.5 text-slate-600 hover:text-blue-600 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-blue-400 dark:hover:bg-blue-950/40 rounded-lg transition-colors"
                                title="Change Role (Promote / Demote)"
                              >
                                <ArrowRightLeft className="w-4 h-4" />
                              </button>
                            )}

                            {/* Suspend / Activate Toggle */}
                            {!isCurrentLoggedUser && (
                              <button
                                disabled={togglingId === member.id}
                                onClick={() => handleToggleStatus(member)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  member.is_active
                                    ? "text-slate-600 hover:text-rose-600 hover:bg-rose-50 dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-rose-950/40"
                                    : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                                }`}
                                title={member.is_active ? "Suspend login access" : "Activate employee login"}
                              >
                                {member.is_active ? (
                                  <UserX className="w-4 h-4" />
                                ) : (
                                  <UserCheck className="w-4 h-4" />
                                )}
                              </button>
                            )}

                            {/* Remove Employee */}
                            {!isCurrentLoggedUser && (
                              <button
                                onClick={() => setDeletingStaff(member)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:text-rose-400 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                                title="Remove staff from store"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Role Permissions Separation Matrix (Kirana Retail Oriented) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Shield className="w-5 h-5 text-brand-600 dark:text-brand-400" />
              Role Permission Separation Matrix (ಅನುಮತಿಗಳ ವಿವರಣೆ)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Strict access segregation protects distributor purchase rates and business profit margins.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded border border-emerald-200">
              <Check className="w-3 h-3" /> Allowed
            </span>
            <span className="inline-flex items-center gap-1 text-amber-700 dark:text-amber-400 font-semibold bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded border border-amber-200">
              ⚠️ Limited
            </span>
            <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-400 font-semibold bg-rose-50 dark:bg-rose-950/50 px-2 py-0.5 rounded border border-rose-200">
              <X className="w-3 h-3" /> Blocked
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-4 font-bold">Store Capability / Operation</th>
                <th className="py-2.5 px-4 font-bold text-center w-36">
                  <div className="flex items-center justify-center gap-1 text-purple-700 dark:text-purple-300">
                    <Crown className="w-3.5 h-3.5" /> Owner
                  </div>
                </th>
                <th className="py-2.5 px-4 font-bold text-center w-36">
                  <div className="flex items-center justify-center gap-1 text-blue-700 dark:text-blue-300">
                    <ShieldCheck className="w-3.5 h-3.5" /> Manager
                  </div>
                </th>
                <th className="py-2.5 px-4 font-bold text-center w-36">
                  <div className="flex items-center justify-center gap-1 text-emerald-700 dark:text-emerald-300">
                    <ShoppingBag className="w-3.5 h-3.5" /> Cashier
                  </div>
                </th>
                <th className="py-2.5 px-4 font-semibold text-slate-400">Kirana Safety Rule</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              <tr>
                <td className="py-2.5 px-4 font-medium">1. Fast Point of Sale (POS) Billing & Barcode Scan</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">All roles can bill customers quickly</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">2. Cash Drawer Shift Opening & Closing Count</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Daily cash balancing at counter end of shift</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">3. Customer Khata Book & Udhar Credit Ledger</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Can record credit sales and customer repayments</td>
              </tr>
              <tr className="bg-amber-50/40 dark:bg-amber-950/20">
                <td className="py-2.5 px-4 font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <span>4. Wholesale Purchase Rates & Profit Margin Visibility</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300 font-bold">
                    SECURITY
                  </span>
                </td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center font-bold text-rose-600 text-xs">
                  <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300">
                    HIDDEN
                  </span>
                </td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">
                  <strong>Critical:</strong> Supplier purchase prices and gross margins are never visible to cashiers
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">5. Purchase Orders & Receiving Supplier Stock</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Only owners and managers can raise distributor POs</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">6. Add / Edit Products, Selling Prices & MRP</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Prevents accidental price tampering during billing</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">7. Physical Stock Count & Reconciliation Approvals</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-amber-600 font-semibold text-xs">
                  Count Only
                </td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Only Owner can approve final inventory write-offs</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">8. Record Daily Operating Expenses (Tea, Rent, Power)</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Keeps store expenses accountable</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">9. Audit Trail & Suspicious Activity Logs</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Monitors bill deletions, discounts, and logins</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">10. Shop GSTIN, Legal Settings & Owner UPI QR</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Only store owner can edit UPI bank payment QR</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">11. Add / Remove Staff & Reset Cashier Counter PINs</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Strict owner-only privilege</td>
              </tr>
              <tr>
                <td className="py-2.5 px-4 font-medium">12. GSTR-1 Tax Export & Full Profit & Loss Analytics</td>
                <td className="py-2.5 px-4 text-center text-emerald-600 font-bold text-sm">✓</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-center text-slate-300 font-bold text-sm">✗</td>
                <td className="py-2.5 px-4 text-slate-500 text-[11px]">Proprietary store financial performance data</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal 1: Add Store Employee Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setShowInviteModal(false)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-brand-100 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 flex items-center justify-center shrink-0">
                <UserCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                  Add Store Employee
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Create secure staff credentials with role-based Kirana access permissions.
                </p>
              </div>
            </div>

            <form onSubmit={handleInviteStaff} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Full Name (ಹೆಸರು) *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Pujar"
                  value={inviteForm.full_name}
                  onChange={(e) => setInviteForm({ ...inviteForm, full_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              {/* Mobile Phone & Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Mobile Number (WhatsApp)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9845012345"
                    value={inviteForm.phone}
                    onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Used for 1-click WhatsApp credentials</p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="cashier@smartstock.in"
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">Used to log into the SmartStock portal</p>
                </div>
              </div>

              {/* Role Selection Cards */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                  Select Role & Capabilities *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div
                    onClick={() => setInviteForm({ ...inviteForm, role: "CASHIER" })}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      inviteForm.role === "CASHIER"
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <ShoppingBag
                        className={`w-4 h-4 ${
                          inviteForm.role === "CASHIER" ? "text-emerald-600" : "text-slate-400"
                        }`}
                      />
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        Counter Cashier
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      POS billing and customer Khata ledger only. <strong>Purchase costs & margins are strictly hidden.</strong>
                    </p>
                  </div>

                  <div
                    onClick={() => setInviteForm({ ...inviteForm, role: "MANAGER" })}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      inviteForm.role === "MANAGER"
                        ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20"
                        : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <ShieldCheck
                        className={`w-4 h-4 ${
                          inviteForm.role === "MANAGER" ? "text-blue-600" : "text-slate-400"
                        }`}
                      />
                      <span className="font-bold text-xs text-slate-900 dark:text-white">
                        Store Manager
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                      Full inventory, purchase orders, receiving, and expenses. Cannot edit owner UPI or tax setup.
                    </p>
                  </div>
                </div>
              </div>

              {/* Password / Counter PIN */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Counter PIN / Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setInviteForm({ ...inviteForm, temp_password: generateRandomPin() })}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Generate 4-Digit PIN
                  </button>
                </div>
                <div className="relative">
                  <input
                    type="text"
                    required
                    placeholder="e.g. 5821 or secure password"
                    value={inviteForm.temp_password}
                    onChange={(e) => setInviteForm({ ...inviteForm, temp_password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  A simple 4-digit PIN is easiest for cashiers at the checkout counter.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingInvite}
                  className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold shadow-sm disabled:opacity-50 flex items-center gap-2"
                >
                  {submittingInvite ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Adding Employee...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Employee
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Success Credential Share Modal */}
      {credentialCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800/80 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setCredentialCard(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-center mb-4">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                Credentials Generated!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Share login details directly with the employee via WhatsApp or clipboard.
              </p>
            </div>

            {/* Credential Slip */}
            <div className="bg-slate-50 dark:bg-slate-800/70 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl p-4 space-y-2.5 font-mono text-xs text-slate-800 dark:text-slate-200">
              <div className="flex justify-between items-center border-b border-slate-200 dark:border-slate-700 pb-2">
                <span className="text-slate-400 uppercase text-[10px]">Shop Name:</span>
                <span className="font-bold">{currentBusiness?.name || "SmartStock Store"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Staff Name:</span>
                <span className="font-semibold">{credentialCard.full_name}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Assigned Role:</span>
                <span className="font-bold text-brand-600 dark:text-brand-400">{credentialCard.role}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Login Email:</span>
                <span className="font-bold">{credentialCard.email}</span>
              </div>
              <div className="flex justify-between items-center bg-amber-50 dark:bg-amber-950/40 p-2 rounded border border-amber-200 dark:border-amber-900/60">
                <span className="text-amber-800 dark:text-amber-300 font-semibold">Counter PIN / Password:</span>
                <span className="font-extrabold text-base text-amber-900 dark:text-amber-200 tracking-wider">
                  {credentialCard.secret}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                <span>Login URL:</span>
                <span>{window.location.origin}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button
                onClick={() => copyToClipboard(getCredentialShareText(credentialCard))}
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-semibold transition-colors"
              >
                {copiedCredentials ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Login Card
                  </>
                )}
              </button>

              <button
                onClick={() =>
                  openWhatsAppShare(credentialCard.phone, getCredentialShareText(credentialCard))
                }
                className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
              >
                <MessageCircle className="w-4 h-4" />
                Send on WhatsApp
              </button>
            </div>

            <button
              onClick={() => setCredentialCard(null)}
              className="w-full mt-3 py-2 text-center text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            >
              Done & Close
            </button>
          </div>
        </div>
      )}

      {/* Modal 3: Change Role Modal */}
      {editingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setEditingStaff(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <h3 className="font-bold text-base text-slate-900 dark:text-white mb-1">
              Change Employee Role
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Update access privileges for <strong>{editingStaff.full_name}</strong> ({editingStaff.email}).
            </p>

            <div className="space-y-3 mb-5">
              <label
                onClick={() => setNewSelectedRole("CASHIER")}
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  newSelectedRole === "CASHIER"
                    ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30 ring-2 ring-emerald-500/20"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <ShoppingBag className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-xs text-slate-900 dark:text-white">
                    Counter Cashier (ಕ್ಯಾಷಿಯರ್)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Fast POS billing & Khata ledger. Wholesale costs & margins hidden.
                  </div>
                </div>
              </label>

              <label
                onClick={() => setNewSelectedRole("MANAGER")}
                className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                  newSelectedRole === "MANAGER"
                    ? "border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 ring-2 ring-blue-500/20"
                    : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                }`}
              >
                <ShieldCheck className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-xs text-slate-900 dark:text-white">
                    Store Manager (ಮ್ಯಾನೇಜರ್)
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Manage inventory, purchase orders, receiving, and daily store expenses.
                  </div>
                </div>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={updatingRole || newSelectedRole === editingStaff.role}
                onClick={handleUpdateRole}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-2"
              >
                {updatingRole ? "Saving..." : "Save Role"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Reset PIN / Password Modal */}
      {resettingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative">
            <button
              onClick={() => setResettingStaff(null)}
              className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                <Key className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-base text-slate-900 dark:text-white">
                  Reset PIN / Password
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Update credentials for <strong>{resettingStaff.full_name}</strong>
                </p>
              </div>
            </div>

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    New Counter PIN / Password *
                  </label>
                  <button
                    type="button"
                    onClick={() => setNewPassword(generateRandomPin())}
                    className="text-[11px] font-semibold text-brand-600 hover:text-brand-700 flex items-center gap-1"
                  >
                    <Sparkles className="w-3 h-3" />
                    Generate 4-Digit PIN
                  </button>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. 4829 or custom password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Once reset, you will get a 1-click button to send the new PIN over WhatsApp.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setResettingStaff(null)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={resettingPassword || !newPassword.trim()}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold disabled:opacity-50 flex items-center gap-2"
                >
                  {resettingPassword ? "Updating..." : "Reset Password"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Delete Confirm Modal */}
      {deletingStaff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl relative">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-base text-slate-900 dark:text-white text-center mb-1">
              Remove Employee?
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-5">
              Are you sure you want to remove <strong>{deletingStaff.full_name}</strong> from this store? Their login credentials will be revoked immediately.
            </p>

            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeletingStaff(null)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={handleDeleteStaff}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold disabled:opacity-50"
              >
                {deleting ? "Removing..." : "Yes, Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
