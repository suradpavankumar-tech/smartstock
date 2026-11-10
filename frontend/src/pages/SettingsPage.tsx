import React, { useState, useEffect } from "react";
import { Business } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import {
  getSoundboxSettings,
  saveSoundboxSettings,
  SoundboxSettings,
  announcePayment,
  playSoundboxChime,
} from "../utils/soundbox";
import {
  getReceiptSettings,
  saveReceiptSettings,
  ReceiptSettings,
  DEFAULT_RECEIPT_SETTINGS,
} from "../utils/receiptSettings";
import { qrCodeSvgDataUrl } from "../utils/qrCode";
import {
  Settings, Building2, MapPin, Phone, Mail, CheckCircle2, Save,
  AlertCircle, QrCode, Smartphone, Copy, Check, Sparkles, Printer,
  Volume2, Sliders, HardDrive, Keyboard, Download, FileSpreadsheet,
  Receipt, ShieldCheck, Eye, RefreshCw
} from "lucide-react";

type SettingsTab = "profile" | "upi" | "receipt" | "soundbox" | "billing" | "backup";

export const SettingsPage: React.FC = () => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  
  // Business Profile
  const [profile, setProfile] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Soundbox Preferences
  const [soundbox, setSoundbox] = useState<SoundboxSettings>(() => getSoundboxSettings());

  // Receipt & Printer Preferences
  const [receipt, setReceipt] = useState<ReceiptSettings>(() => getReceiptSettings());

  // Owner UPI Builder State
  const [ownerPhoneDigits, setOwnerPhoneDigits] = useState<string>("");
  const [selectedHandle, setSelectedHandle] = useState<string>("@ybl");
  const [isCustomUpi, setIsCustomUpi] = useState<boolean>(false);
  const [copiedUpi, setCopiedUpi] = useState<boolean>(false);
  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const fetchProfile = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBusinessProfile();
      setProfile(data);

      // Parse existing UPI VPA or initialize from phone number
      if (data.upi_vpa) {
        const parts = data.upi_vpa.split("@");
        if (parts.length === 2 && /^\d{10}$/.test(parts[0])) {
          setOwnerPhoneDigits(parts[0]);
          const handle = `@${parts[1]}`;
          if (["@ybl", "@ibl", "@paytm", "@okaxis", "@okhdfcbank", "@upi"].includes(handle)) {
            setSelectedHandle(handle);
            setIsCustomUpi(false);
          } else {
            setSelectedHandle(handle);
            setIsCustomUpi(true);
          }
        } else {
          setIsCustomUpi(true);
        }
      } else if (data.phone) {
        const digits = data.phone.replace(/\D/g, "").slice(-10);
        if (digits.length === 10) {
          setOwnerPhoneDigits(digits);
          setSelectedHandle("@ybl");
        }
      }
    } catch (err: any) {
      setError(err.message || "Failed to load business profile");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const handlePhoneOrHandleChange = (phone: string, handle: string) => {
    setOwnerPhoneDigits(phone);
    setSelectedHandle(handle);
    setHasUnsavedChanges(true);
    if (!profile) return;
    const clean = phone.replace(/\D/g, "").slice(-10);
    if (clean.length === 10) {
      setProfile({ ...profile, upi_vpa: `${clean}${handle}` });
    }
  };

  const handleProfileFieldChange = (field: keyof Business, value: any) => {
    if (!profile) return;
    setProfile({ ...profile, [field]: value });
    setHasUnsavedChanges(true);
  };

  const handleReceiptChange = (field: keyof ReceiptSettings, value: any) => {
    const updated = { ...receipt, [field]: value };
    setReceipt(updated);
    saveReceiptSettings(updated);
    setHasUnsavedChanges(true);
  };

  const handleSoundboxChange = (field: keyof SoundboxSettings, value: any) => {
    const updated = { ...soundbox, [field]: value };
    setSoundbox(updated);
    saveSoundboxSettings(updated);
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!profile) return;
    setSaving(true);
    setSavedSuccess(false);
    try {
      // Save backend business profile
      const updated = await api.updateBusinessProfile(profile);
      setProfile(updated);

      // Save local preferences
      saveReceiptSettings(receipt);
      saveSoundboxSettings(soundbox);

      setSavedSuccess(true);
      setHasUnsavedChanges(false);
      setTimeout(() => setSavedSuccess(false), 3500);
    } catch (err: any) {
      alert(err.message || "Failed to update business settings");
    } finally {
      setSaving(false);
    }
  };

  // Keyboard shortcut Ctrl+S / Cmd+S to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [profile, receipt, soundbox]);

  const handleDownloadProductsCsv = async () => {
    setIsExportingCsv(true);
    try {
      const csvText = await api.exportProductsCsv();
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `smartstock_products_${new Date().toISOString().split("T")[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || "Failed to download catalogue CSV");
    } finally {
      setIsExportingCsv(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm animate-pulse space-y-2">
        <Settings className="w-8 h-8 mx-auto animate-spin text-emerald-600" />
        <p>Loading shop settings & preferences...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-6 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-700 dark:text-rose-400 text-sm space-y-3 max-w-xl mx-auto my-8">
        <div className="flex items-center gap-2 font-bold text-base">
          <AlertCircle className="w-5 h-5" />
          <span>Error loading shop settings</span>
        </div>
        <p>{error || "Business profile could not be loaded"}</p>
        <button
          onClick={fetchProfile}
          className="px-4 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-semibold hover:bg-rose-700"
        >
          Retry Loading
        </button>
      </div>
    );
  }

  const activeVpa = profile.upi_vpa || `${ownerPhoneDigits || "9845123456"}${selectedHandle}`;

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12">
      {/* Top Header Card with Quick Status & Floating Save Action */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-sm">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                <span>Shop Settings & Preferences</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Manage shop identity, tax GSTIN, owner UPI QR, thermal receipt printing, voice soundbox, and data backups
              </p>
            </div>
          </div>

          {/* Quick Info Badges */}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-[11px]">
            <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              Tax: {profile.tax_mode.replace("_", " ")}
            </span>
            <span className="px-2 py-0.5 rounded-md font-mono font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
              UPI: {activeVpa}
            </span>
            <span className="px-2 py-0.5 rounded-md font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
              Paper: {receipt.paperWidth}mm Thermal
            </span>
            <span className="px-2 py-0.5 rounded-md font-semibold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
              Soundbox: {soundbox.enabled ? (soundbox.language === "kn" ? "ಕನ್ನಡ (ON)" : "English (ON)") : "Disabled"}
            </span>
          </div>
        </div>

        {/* Save Button & Shortcut */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-sm ${
              hasUnsavedChanges
                ? "bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-500/50 animate-pulse"
                : "bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
            } disabled:opacity-50`}
          >
            {saving ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{hasUnsavedChanges ? "Save Unsaved Changes" : "Save Changes"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {savedSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-3 text-emerald-800 dark:text-emerald-300 text-xs font-semibold shadow-xs">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
          <span>Shop settings updated successfully! Changes reflect immediately on POS billing and receipts.</span>
        </div>
      )}

      {/* Navigation Tabs Bar */}
      <div className="flex overflow-x-auto gap-1 border-b border-slate-200 dark:border-slate-800 pb-2">
        {[
          { key: "profile", label: "Store Profile & Tax", icon: Building2 },
          { key: "upi", label: "Owner UPI QR Payment", icon: QrCode },
          { key: "receipt", label: "Receipt & Thermal Printer", icon: Printer },
          { key: "soundbox", label: "Voice Soundbox", icon: Volume2 },
          { key: "billing", label: "Billing & Scanner", icon: Sliders },
          { key: "backup", label: "Data Safety & Backup", icon: HardDrive },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as SettingsTab)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: STORE PROFILE & TAX                                                */}
      {/* ========================================================================= */}
      {activeTab === "profile" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-base">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <span>General Store Identity</span>
              </div>
              <span className="text-xs text-slate-400">Printed on bill headers and tax filings</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Shop Trade Name *
                </label>
                <input
                  type="text"
                  required
                  value={profile.name}
                  onChange={(e) => handleProfileFieldChange("name", e.target.value)}
                  placeholder="e.g. Haveri Kirana & General Stores"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-400">The main name customers see on receipts and signs</span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Legal Entity / Proprietor Name
                </label>
                <input
                  type="text"
                  value={profile.legal_name || ""}
                  onChange={(e) => handleProfileFieldChange("legal_name", e.target.value)}
                  placeholder="e.g. Sri Basaveshwara Enterprises"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <span className="text-[11px] text-slate-400">Official registered business or proprietor name</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Store Contact Phone
                </label>
                <input
                  type="tel"
                  placeholder="+91 98450 12345"
                  value={profile.phone || ""}
                  onChange={(e) => handleProfileFieldChange("phone", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Store Email (Optional)
                </label>
                <input
                  type="email"
                  placeholder="contact@haverikirana.com"
                  value={profile.email || ""}
                  onChange={(e) => handleProfileFieldChange("email", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Tax Credentials & Scheme Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-base">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                <span>GST Tax Scheme & Compliance</span>
              </div>
              <span className="text-xs text-slate-400">Controls receipt headings and CGST/SGST tax math</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                Select Your Shop's Tax Scheme:
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    key: "REGULAR_GST",
                    title: "Regular GST Scheme",
                    desc: "Issues itemized Tax Invoices with CGST + SGST breakdown. Suitable for registered businesses.",
                    badge: "Tax Invoice",
                  },
                  {
                    key: "COMPOSITION_SCHEME",
                    title: "Composition Scheme",
                    desc: "Issues 'Bill of Supply'. Flat turnover tax rate, cannot charge tax to retail customers.",
                    badge: "Bill of Supply",
                  },
                  {
                    key: "NON_GST_RETAIL",
                    title: "Non-GST Retail Shop",
                    desc: "Issues simple Retail Cash Memos. For small un-registered local kirana shops.",
                    badge: "Retail Cash Memo",
                  },
                ].map((mode) => {
                  const isSelected = profile.tax_mode === mode.key;
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => handleProfileFieldChange("tax_mode", mode.key)}
                      className={`p-3.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                        isSelected
                          ? "border-emerald-600 bg-emerald-50/60 dark:bg-emerald-950/60 ring-2 ring-emerald-500/40 shadow-xs"
                          : "border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/60 hover:bg-slate-100"
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs font-bold ${isSelected ? "text-emerald-700 dark:text-emerald-300" : "text-slate-900 dark:text-white"}`}>
                            {mode.title}
                          </span>
                          <span className="text-[9px] font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 rounded">
                            {mode.badge}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                          {mode.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                GSTIN (15-Digit Goods & Services Tax Number)
              </label>
              <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-emerald-500">
                <span className="px-3 py-2 bg-slate-100 dark:bg-slate-700/60 text-slate-500 text-xs font-mono font-bold flex items-center border-r border-slate-200 dark:border-slate-700">
                  GST
                </span>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="29AAAAA0000A1Z5"
                  value={profile.gstin || ""}
                  onChange={(e) => handleProfileFieldChange("gstin", e.target.value.toUpperCase())}
                  className="flex-1 px-3 py-2 text-sm font-mono font-bold tracking-wider text-slate-900 dark:text-white bg-transparent focus:outline-none"
                />
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Karnataka State GSTIN prefix is <strong>29</strong> followed by 10-digit PAN + entity code.
              </p>
            </div>
          </div>

          {/* Physical Address Section */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-base border-b border-slate-100 dark:border-slate-800 pb-3">
              <MapPin className="w-5 h-5 text-emerald-600" />
              <span>Physical Store Location & Address</span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Shop Door / Street / Market Address
              </label>
              <input
                type="text"
                placeholder="Shop No. 12, APMC Market Yard, Station Road"
                value={profile.address_line || ""}
                onChange={(e) => handleProfileFieldChange("address_line", e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">City / Town *</label>
                <input
                  type="text"
                  required
                  value={profile.city}
                  onChange={(e) => handleProfileFieldChange("city", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">District *</label>
                <input
                  type="text"
                  required
                  value={profile.district}
                  onChange={(e) => handleProfileFieldChange("district", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">State *</label>
                <input
                  type="text"
                  required
                  value={profile.state}
                  onChange={(e) => handleProfileFieldChange("state", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">Pincode *</label>
                <input
                  type="text"
                  required
                  maxLength={6}
                  value={profile.pincode}
                  onChange={(e) => handleProfileFieldChange("pincode", e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: OWNER UPI QR PAYMENT                                               */}
      {/* ========================================================================= */}
      {activeTab === "upi" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 font-bold text-slate-900 dark:text-white text-base">
              <div className="p-2 rounded-xl bg-blue-600 text-white shadow-sm">
                <QrCode className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span>Owner Phone Number UPI Payment Setup</span>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold uppercase">
                    NPCI Compliant
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Generates scannable QR codes using your phone number so payments deposit directly into your shop bank account
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
            {/* Left Controls */}
            <div className="md:col-span-7 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4 text-blue-600" />
                  <span>Owner 10-Digit Mobile Number (Bank Linked)</span>
                </label>
                <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
                  <span className="px-3 py-2 bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 text-xs font-bold flex items-center border-r border-slate-200 dark:border-slate-700">
                    🇮🇳 +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    placeholder="9845123456"
                    value={ownerPhoneDigits}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      handlePhoneOrHandleChange(digits, selectedHandle);
                    }}
                    className="flex-1 px-3 py-2 text-sm font-mono font-bold text-slate-900 dark:text-white bg-transparent focus:outline-none"
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Enter the phone number registered on PhonePe, Google Pay, or Paytm for this store.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Choose Your Active UPI Provider Handle:
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { name: "PhonePe", handle: "@ybl" },
                    { name: "Google Pay", handle: "@okaxis" },
                    { name: "Paytm", handle: "@paytm" },
                    { name: "BHIM / UPI", handle: "@upi" },
                  ].map((p) => {
                    const isSelected = !isCustomUpi && selectedHandle === p.handle;
                    return (
                      <button
                        key={p.handle}
                        type="button"
                        onClick={() => {
                          setIsCustomUpi(false);
                          handlePhoneOrHandleChange(ownerPhoneDigits, p.handle);
                        }}
                        className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                          isSelected
                            ? "border-blue-600 bg-blue-50 dark:bg-blue-950/60 ring-2 ring-blue-500/40 shadow-xs"
                            : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100"
                        }`}
                      >
                        <span className={`text-xs font-bold ${isSelected ? "text-blue-700 dark:text-blue-300" : "text-slate-900 dark:text-white"}`}>
                          {p.name}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 mt-0.5">{p.handle}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bank Handle Chips */}
              <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-400">Other handles:</span>
                {[
                  { label: "GPay HDFC", handle: "@okhdfcbank" },
                  { label: "GPay SBI", handle: "@oksbi" },
                  { label: "GPay ICICI", handle: "@okicici" },
                  { label: "PhonePe YesBank", handle: "@ibl" },
                ].map((alt) => (
                  <button
                    key={alt.handle}
                    type="button"
                    onClick={() => {
                      setIsCustomUpi(false);
                      handlePhoneOrHandleChange(ownerPhoneDigits, alt.handle);
                    }}
                    className={`px-2 py-0.5 rounded text-[10px] font-mono border transition-colors ${
                      !isCustomUpi && selectedHandle === alt.handle
                        ? "bg-blue-600 text-white border-blue-600"
                        : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                    }`}
                  >
                    {alt.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setIsCustomUpi(!isCustomUpi)}
                  className="text-[10px] text-blue-600 dark:text-blue-400 underline font-semibold ml-1"
                >
                  {isCustomUpi ? "Use preset provider" : "Custom VPA"}
                </button>
              </div>

              {isCustomUpi && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Enter Complete Custom UPI VPA:
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. storename@icici or 9845123456@axl"
                    value={profile.upi_vpa || ""}
                    onChange={(e) => handleProfileFieldChange("upi_vpa", e.target.value.trim())}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
              )}

              {/* Active VPA pill with copy */}
              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-900 flex items-center justify-between">
                <div>
                  <div className="text-[10px] uppercase font-bold text-blue-800 dark:text-blue-300">
                    Active Counter UPI VPA:
                  </div>
                  <div className="text-sm font-mono font-black text-slate-900 dark:text-white">
                    {activeVpa}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(activeVpa);
                    setCopiedUpi(true);
                    setTimeout(() => setCopiedUpi(false), 2000);
                  }}
                  className="px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-xs font-bold text-blue-700 dark:text-blue-300 hover:bg-blue-50 flex items-center gap-1 shadow-xs"
                >
                  {copiedUpi ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedUpi ? "Copied" : "Copy VPA"}</span>
                </button>
              </div>
            </div>

            {/* Right Live Test QR Preview */}
            <div className="md:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-50 dark:bg-slate-850 rounded-2xl border border-slate-200 dark:border-slate-700 text-center">
              <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                <span>Live Test QR (PhonePe / GPay)</span>
              </div>

              <div className="p-3 bg-white rounded-2xl shadow-md border border-slate-200">
                <img
                  src={qrCodeSvgDataUrl(
                    `upi://pay?pa=${encodeURIComponent(activeVpa)}&pn=${encodeURIComponent(
                      profile.name || "Store Owner"
                    )}&am=1.00&cu=INR&tn=SmartStock-Test-Payment`
                  )}
                  alt="Owner UPI Payment QR"
                  className="w-44 h-44 object-contain mx-auto"
                />
              </div>

              <div className="mt-3">
                <div className="text-xs font-mono font-bold text-slate-900 dark:text-white">
                  ₹1.00 Test Amount
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 max-w-[220px] mx-auto leading-tight">
                  Point your smartphone camera or open PhonePe/GPay now. Scanning this code sends ₹1.00 directly to your shop bank account.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: RECEIPT & THERMAL PRINTER SETUP                                    */}
      {/* ========================================================================= */}
      {activeTab === "receipt" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Form: Receipt Configuration */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-base">
                <Printer className="w-5 h-5 text-emerald-600" />
                <span>Thermal Bill & Printer Preferences</span>
              </div>
              <span className="text-xs text-slate-400">Customizes printed paper receipts</span>
            </div>

            {/* Paper Size Selector */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                Thermal Paper Width:
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleReceiptChange("paperWidth", 58)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    receipt.paperWidth === 58
                      ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 ring-2 ring-emerald-500/40"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900 dark:text-white">58mm (2-Inch Roll)</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Standard handheld POS & Bluetooth pocket printers
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleReceiptChange("paperWidth", 80)}
                  className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    receipt.paperWidth === 80
                      ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/60 ring-2 ring-emerald-500/40"
                      : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                  }`}
                >
                  <div className="text-xs font-bold text-slate-900 dark:text-white">80mm (3-Inch Roll)</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Wide desktop counter printers with auto-cutter
                  </div>
                </button>
              </div>
            </div>

            {/* Header Blessing / Motto */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Top Blessing / Inscription (Top of Bill)
              </label>
              <input
                type="text"
                value={receipt.headerBlessing}
                onChange={(e) => handleReceiptChange("headerBlessing", e.target.value)}
                placeholder="e.g. ಶ್ರೀ ಗುರು ಬಸವೇಶ್ವರ ಪ್ರಸನ್ನ"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
              />
              <span className="text-[10px] text-slate-400">Printed centered at the very top of every customer receipt</span>
            </div>

            {/* Shop Tagline */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Shop Subtitle / Tagline
              </label>
              <input
                type="text"
                value={receipt.tagline}
                onChange={(e) => handleReceiptChange("tagline", e.target.value)}
                placeholder="e.g. Quality Provisions & Wholesale Kirana Rates"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
              />
            </div>

            {/* Footer Greeting */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Receipt Footer Greeting
              </label>
              <input
                type="text"
                value={receipt.footerGreeting}
                onChange={(e) => handleReceiptChange("footerGreeting", e.target.value)}
                placeholder="e.g. ಧನ್ಯವಾದಗಳು! ಮತ್ತೆ ಭೇಟಿ ನೀಡಿ / Thank you, Visit again!"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
              />
            </div>

            {/* Return Policy note */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                Return / Exchange Policy (Footer Note)
              </label>
              <input
                type="text"
                value={receipt.returnPolicy}
                onChange={(e) => handleReceiptChange("returnPolicy", e.target.value)}
                placeholder="e.g. Exchange valid within 2 days with printed bill"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white"
              />
            </div>

            {/* Toggles */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Print Store UPI QR Code at Bottom of Bill</div>
                  <div className="text-[11px] text-slate-500">Customers can scan the paper bill with PhonePe/GPay to pay!</div>
                </div>
                <input
                  type="checkbox"
                  checked={receipt.showUpiQr}
                  onChange={(e) => handleReceiptChange("showUpiQr", e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-200">Print GSTIN on Bill</div>
                  <div className="text-[11px] text-slate-500">Include your 15-digit GST registration on the printed header</div>
                </div>
                <input
                  type="checkbox"
                  checked={receipt.showGstin}
                  onChange={(e) => handleReceiptChange("showGstin", e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>
            </div>
          </div>

          {/* Right Live Paper Receipt Simulator */}
          <div className="lg:col-span-5 bg-slate-100 dark:bg-slate-850 p-6 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between mb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <span className="flex items-center gap-1.5">
                <Eye className="w-4 h-4 text-emerald-600" />
                <span>Live Thermal Paper Preview</span>
              </span>
              <span className="font-mono text-[10px] bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
                {receipt.paperWidth}mm
              </span>
            </div>

            {/* Realistic Paper Receipt Mockup */}
            <div
              className="bg-white text-black p-4 rounded-lg shadow-lg border border-slate-300 font-mono text-[11px] leading-tight mx-auto"
              style={{ maxWidth: receipt.paperWidth === 58 ? "260px" : "330px" }}
            >
              <div className="text-center pb-2 border-b border-dashed border-black">
                {receipt.headerBlessing && (
                  <p className="font-bold text-[9px] mb-0.5 tracking-wider">{receipt.headerBlessing}</p>
                )}
                <h2 className="text-sm font-black uppercase">{profile.name}</h2>
                {receipt.tagline && <p className="text-[8px] italic">{receipt.tagline}</p>}
                <p className="text-[9px] font-semibold mt-0.5">
                  {profile.tax_mode === "REGULAR_GST" ? "Tax Invoice" : profile.tax_mode === "COMPOSITION_SCHEME" ? "Bill of Supply" : "Retail Cash Memo"}
                </p>
                <p className="text-[8px]">{profile.address_line || "Station Road, APMC Market"}</p>
                <p className="text-[8px]">{profile.city}, {profile.state} - {profile.pincode}</p>
                {profile.phone && <p className="text-[8px]">Ph: {profile.phone}</p>}
                {receipt.showGstin && profile.gstin && (
                  <p className="text-[8px] font-bold mt-0.5">GSTIN: {profile.gstin}</p>
                )}
              </div>

              <div className="py-1.5 border-b border-dashed border-black text-[9px] space-y-0.5">
                <div className="flex justify-between">
                  <span>Bill: #INV-2026-0042</span>
                  <span>14:30 IST</span>
                </div>
                <div className="flex justify-between">
                  <span>Customer: Cash Retail</span>
                  <span>Counter 1</span>
                </div>
              </div>

              {/* Sample Items */}
              <div className="py-1.5 border-b border-dashed border-black text-[9px] space-y-1">
                <div className="flex justify-between font-bold">
                  <span>Item</span>
                  <span>Qty × Rate = Amt</span>
                </div>
                <div className="flex justify-between">
                  <span>Sona Masoori Rice</span>
                  <span>2 kg × ₹58 = ₹116</span>
                </div>
                <div className="flex justify-between">
                  <span>Toor Dal Supreme</span>
                  <span>1 kg × ₹145 = ₹145</span>
                </div>
              </div>

              {/* Totals */}
              <div className="py-1.5 border-b border-dashed border-black text-[10px] space-y-0.5">
                <div className="flex justify-between font-black text-xs pt-0.5">
                  <span>TOTAL:</span>
                  <span>₹261.00</span>
                </div>
                <div className="flex justify-between text-[8px] text-gray-700">
                  <span>Payment: CASH</span>
                  <span>PAID</span>
                </div>
              </div>

              {/* UPI QR on Paper */}
              {receipt.showUpiQr && activeVpa && (
                <div className="text-center pt-2 pb-1">
                  <img
                    src={qrCodeSvgDataUrl(
                      `upi://pay?pa=${encodeURIComponent(activeVpa)}&pn=${encodeURIComponent(
                        profile.name
                      )}&am=261.00&cu=INR`
                    )}
                    alt="Bill QR"
                    className="w-16 h-16 mx-auto"
                  />
                  <p className="text-[7px] text-gray-600 mt-0.5">Scan paper bill to pay via UPI</p>
                </div>
              )}

              {/* Footer Greeting */}
              <div className="text-center pt-2 text-[8px] space-y-0.5 border-t border-dashed border-black">
                <p className="font-bold">{receipt.footerGreeting}</p>
                {receipt.returnPolicy && <p className="italic text-[7px]">{receipt.returnPolicy}</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: VOICE SOUNDBOX & AUDIO                                             */}
      {/* ========================================================================= */}
      {activeTab === "soundbox" && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2.5 font-bold text-slate-900 dark:text-white text-base">
              <div className="p-2 rounded-xl bg-purple-600 text-white shadow-sm">
                <Volume2 className="w-5 h-5" />
              </div>
              <div>
                <span>Smart Payment Soundbox & Voice Alerts</span>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Announces payment receipts instantly through counter speakers in Kannada or English
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Soundbox Controls */}
            <div className="space-y-4">
              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Enable Payment Soundbox Voice</div>
                  <div className="text-[11px] text-slate-500">Announces "Received ₹... on UPI" on every checkout</div>
                </div>
                <input
                  type="checkbox"
                  checked={soundbox.enabled}
                  onChange={(e) => handleSoundboxChange("enabled", e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded"
                />
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1.5">
                  Announcement Language:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSoundboxChange("language", "kn")}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      soundbox.language === "kn"
                        ? "border-purple-600 bg-purple-50 dark:bg-purple-950/60 ring-2 ring-purple-500/40"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-900 dark:text-white">ಕನ್ನಡ (Kannada)</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">ಯುಪಿಐ ಮೂಲಕ ಸ್ವೀಕರಿಸಲಾಗಿದೆ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSoundboxChange("language", "en")}
                    className={`p-3 rounded-xl border text-left flex flex-col justify-between transition-all ${
                      soundbox.language === "en"
                        ? "border-purple-600 bg-purple-50 dark:bg-purple-950/60 ring-2 ring-purple-500/40"
                        : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                    }`}
                  >
                    <span className="text-xs font-bold text-slate-900 dark:text-white">English</span>
                    <span className="text-[10px] text-slate-500 mt-0.5">Received on UPI</span>
                  </button>
                </div>
              </div>

              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Play Pre-Announcement Chime</div>
                  <div className="text-[11px] text-slate-500">Authentic 2-tone musical chime before voice announcement</div>
                </div>
                <input
                  type="checkbox"
                  checked={soundbox.chimeEnabled}
                  onChange={(e) => handleSoundboxChange("chimeEnabled", e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded"
                />
              </label>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200">Speaker Volume</label>
                  <span className="text-xs font-mono font-bold text-purple-600">{Math.round(soundbox.volume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={soundbox.volume}
                  onChange={(e) => handleSoundboxChange("volume", parseFloat(e.target.value))}
                  className="w-full accent-purple-600"
                />
              </div>
            </div>

            {/* Test Play Box */}
            <div className="p-6 bg-purple-50/50 dark:bg-purple-950/20 rounded-2xl border border-purple-200 dark:border-purple-900 flex flex-col justify-between text-center">
              <div>
                <div className="w-12 h-12 rounded-2xl bg-purple-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md">
                  <Volume2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">Live Soundbox Speaker Test</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
                  Click the buttons below to test the sound chime and speech on your counter computer or tablet speakers.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
                <button
                  type="button"
                  onClick={() => announcePayment(150, "UPI")}
                  className="px-3.5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-sm transition-colors flex items-center justify-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Test ₹150 (UPI)</span>
                </button>

                <button
                  type="button"
                  onClick={() => announcePayment(500, "CASH")}
                  className="px-3.5 py-2.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-purple-700 dark:text-purple-300 hover:bg-purple-50 text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>Test ₹500 (Cash)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 5: BILLING & SCANNER DEFAULTS                                         */}
      {/* ========================================================================= */}
      {activeTab === "billing" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-base">
                <Sliders className="w-5 h-5 text-emerald-600" />
                <span>Point of Sale (POS) Counter Workflow Defaults</span>
              </div>
            </div>

            <div className="space-y-4">
              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Auto Cash Round-Off to Nearest ₹1.00</div>
                  <div className="text-[11px] text-slate-500">Rounds loose paise (e.g. ₹142.40 to ₹142.00) for fast cash change calculation</div>
                </div>
                <input
                  type="checkbox"
                  checked={receipt.roundOffCash}
                  onChange={(e) => handleReceiptChange("roundOffCash", e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Audio Beep on Barcode Scan</div>
                  <div className="text-[11px] text-slate-500">Emits a confirmation audio beep whenever a product barcode is scanned into POS</div>
                </div>
                <input
                  type="checkbox"
                  checked={receipt.scannerBeep}
                  onChange={(e) => handleReceiptChange("scannerBeep", e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>

              <label className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">Auto-Open Print Dialog Immediately on Checkout</div>
                  <div className="text-[11px] text-slate-500">Automatically triggers thermal printer after completing every bill</div>
                </div>
                <input
                  type="checkbox"
                  checked={receipt.autoPrintOnCheckout}
                  onChange={(e) => handleReceiptChange("autoPrintOnCheckout", e.target.checked)}
                  className="w-4 h-4 text-emerald-600 rounded"
                />
              </label>

              <div>
                <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">
                  Default Low Stock Reorder Threshold Alert
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={receipt.defaultLowStockThreshold}
                    onChange={(e) => handleReceiptChange("defaultLowStockThreshold", parseInt(e.target.value) || 5)}
                    className="w-24 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-900 dark:text-white"
                  />
                  <span className="text-xs text-slate-500">
                    Units remaining before items appear in low-stock and reorder recommendations
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Keyboard Shortcuts Reference */}
          <div className="bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-xs uppercase tracking-wider mb-3">
              <Keyboard className="w-4 h-4 text-emerald-600" />
              <span>Counter Keyboard Shortcuts Reference</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px]">F2</span>
                <span className="ml-2 text-slate-600 dark:text-slate-400">Focus Barcode Search</span>
              </div>
              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px]">Enter</span>
                <span className="ml-2 text-slate-600 dark:text-slate-400">Add Scanned Item</span>
              </div>
              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px]">Ctrl+S</span>
                <span className="ml-2 text-slate-600 dark:text-slate-400">Save Shop Settings</span>
              </div>
              <div className="p-2.5 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700">
                <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono font-bold text-[10px]">Ctrl+P</span>
                <span className="ml-2 text-slate-600 dark:text-slate-400">Print Bill</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 6: DATA SAFETY & BACKUP                                               */}
      {/* ========================================================================= */}
      {activeTab === "backup" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white text-base">
                <HardDrive className="w-5 h-5 text-emerald-600" />
                <span>Store Data Safety & 1-Click Offline Backups</span>
              </div>
              <span className="text-xs bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full">
                Offline-First Ready
              </span>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Your business data belongs to you. You can export complete copies of your inventory catalogue, invoices, and Khata ledger at any time for offline accounting or backup.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Product Catalogue Backup</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Download full product list with barcodes, purchase costs, selling prices, tax rates, and current on-hand stock.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadProductsCsv}
                  disabled={isExportingCsv}
                  className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isExportingCsv ? "Downloading CSV..." : "Download Product Catalogue (CSV)"}</span>
                </button>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 flex flex-col justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Receipt className="w-4 h-4 text-blue-600" />
                    <span>Invoices & Sales Archive</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Export GSTR-1 compliant sales history, customer transactions, and credit balance records for CA filing.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await api.downloadGstr1Csv();
                    } catch (err: any) {
                      alert(err.message || "Failed to download GSTR-1 sales CSV");
                    }
                  }}
                  className="mt-4 px-4 py-2 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs"
                >
                  <Download className="w-3.5 h-3.5 text-blue-600" />
                  <span>Download Sales Archive (GSTR-1 CSV)</span>
                </button>
              </div>
            </div>

            <div className="p-3.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs text-slate-600 dark:text-slate-400 flex items-center justify-between">
              <div>
                <strong>Database Engine:</strong> SQLite Local Store • Tenant ID #{profile.id} • Currency: {profile.currency} (₹)
              </div>
              <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
                <Check className="w-3.5 h-3.5" /> Connected
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
