import React, { useState } from "react";
import {
  Store, ShieldCheck, TrendingUp, BarChart2, Cpu, CheckCircle2,
  Lock, ArrowRight, Globe
} from "lucide-react";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../context/LanguageContext";

export const LandingPage: React.FC = () => {
  const { login, register } = useAuth();
  const { language, setLanguage, t } = useLanguage();
  
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [city, setCity] = useState("Haveri");
  const [district, setDistrict] = useState("Haveri");
  const [gstin, setGstin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegisterMode) {
        await register({
          email,
          password,
          full_name: fullName,
          phone,
          business_name: businessName,
          city,
          district,
          state: "Karnataka",
          gstin: gstin || undefined,
        });
      } else {
        await login(email, password);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F8FAFC] flex flex-col justify-between relative overflow-x-hidden selection:bg-[#5EEAD4]/30 selection:text-[#6EE7B7]">
      {/* Living Ambient Midnight Mist Illumination Glow Orbs */}
      <div className="fixed top-0 left-0 w-[550px] h-[550px] bg-gradient-to-br from-[#5EEAD4]/18 via-[#6EE7B7]/10 to-transparent rounded-full blur-[130px] pointer-events-none -translate-x-1/3 -translate-y-1/3 z-0 animate-mist-1" />
      <div className="fixed top-1/4 right-0 w-[450px] h-[450px] bg-gradient-to-br from-[#A78BFA]/15 via-[#7DD3FC]/10 to-transparent rounded-full blur-[120px] pointer-events-none translate-x-1/4 z-0 animate-mist-2" />
      <div className="fixed bottom-0 left-1/3 w-[500px] h-[500px] bg-gradient-to-br from-[#7DD3FC]/14 via-[#5EEAD4]/10 to-transparent rounded-full blur-[130px] pointer-events-none translate-y-1/4 z-0 animate-mist-3" />

      {/* Top Bar */}
      <header className="max-w-7xl w-full mx-auto px-6 py-5 flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[#080B10] border border-[#5EEAD4]/50 text-[#6EE7B7] flex items-center justify-center font-black text-sm shadow-[0_0_16px_rgba(94,234,212,0.35)] shrink-0 relative overflow-hidden group">
            <div className="absolute inset-0 bg-gradient-to-br from-[#5EEAD4]/20 to-transparent pointer-events-none" />
            <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current text-[#6EE7B7]">
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4" />
              <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-extrabold tracking-tight text-[#F8FAFC]">SmartStock</span>
              <span className="px-2 py-0.5 text-[10px] font-bold bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#5EEAD4]/40 rounded-full shadow-[0_0_8px_rgba(94,234,212,0.25)]">
                Liquid Glass V5
              </span>
            </div>
            <div className="text-[11px] text-[#A1AEBB]">Karnataka Retail Platform</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setLanguage(language === "en" ? "kn" : "en")}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC] transition-all active:scale-[0.98]"
          >
            <Globe className="w-3.5 h-3.5 text-[#5EEAD4]" />
            <span>{language === "en" ? "ಕನ್ನಡಕ್ಕೆ ಬದಲಿಸಿ" : "English"}</span>
          </button>
        </div>
      </header>

      {/* Main Split Hero & Login */}
      <main className="max-w-7xl w-full mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center flex-1 relative z-10">
        {/* Left Column: Product Value Props */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#6EE7B7]/10 border border-[#5EEAD4]/30 text-[#6EE7B7] text-xs font-semibold shadow-[0_0_12px_rgba(94,234,212,0.2)]">
            <ShieldCheck className="w-4 h-4 text-[#5EEAD4]" />
            <span>Strict Tenant Isolation • Real Business Data Only</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-[#F8FAFC] leading-tight">
            Intelligent Inventory & Retail Decision Platform
          </h1>

          <p className="text-base text-[#A1AEBB] leading-relaxed max-w-2xl">
            Built specifically for independent shopkeepers in Haveri district and across Karnataka. 
            Replace guessing with deterministic stockout warnings, fast barcode billing, explainable reorder intelligence, 
            and auditable financial accounting.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div className="p-4 rounded-2xl liquid-glass-interactive liquid-sheen flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#5EEAD4]/40 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_10px_rgba(94,234,212,0.2)]">
                <Store className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#F8FAFC]">Strictly Private Dashboards</h4>
                <p className="text-[11px] text-[#A1AEBB] mt-0.5">Every shopkeeper gets an isolated, private workspace. Zero cross-shop data leakage.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl liquid-glass-interactive liquid-sheen flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#7DD3FC]/15 text-[#7DD3FC] border border-[#7DD3FC]/40 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_10px_rgba(125,211,252,0.2)]">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#F8FAFC]">Real Data & Honest ML</h4>
                <p className="text-[11px] text-[#A1AEBB] mt-0.5">Zero fabricated numbers. True demand forecasting only when 14+ days of sales records exist.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl liquid-glass-interactive liquid-sheen flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#FBBF24]/15 text-[#FBBF24] border border-[#FBBF24]/40 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_10px_rgba(251,191,36,0.2)]">
                <BarChart2 className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#F8FAFC]">Traceable Ledger Accounting</h4>
                <p className="text-[11px] text-[#A1AEBB] mt-0.5">Immutable stock movement logs. COGS and gross margins reconcile with real purchases.</p>
              </div>
            </div>

            <div className="p-4 rounded-2xl liquid-glass-interactive liquid-sheen flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-[#A78BFA]/15 text-[#A78BFA] border border-[#A78BFA]/40 flex items-center justify-center shrink-0 mt-0.5 shadow-[0_0_10px_rgba(167,139,250,0.2)]">
                <Cpu className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-[#F8FAFC]">Offline Sync & PWA</h4>
                <p className="text-[11px] text-[#A1AEBB] mt-0.5">Continue billing during network outages. Local queue synchronizes idempotently.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Auth Card */}
        <div className="lg:col-span-5">
          <div className="liquid-glass-elevated p-6 sm:p-8 shadow-2xl relative">
            <div className="mb-6">
              <h2 className="text-xl font-bold text-[#F8FAFC]">
                {isRegisterMode ? "Register Your Business" : "Shopkeeper Login"}
              </h2>
              <p className="text-xs text-[#A1AEBB] mt-1">
                {isRegisterMode
                  ? "Create your private shop workspace and start managing inventory."
                  : "Enter your registered credentials to access your private store dashboard."}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-[#FB7185]/15 border border-[#FB7185]/40 text-[#FB7185] text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {isRegisterMode && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-[#A1AEBB] mb-1">
                      Shop / Business Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Haveri Kirana & General Store"
                      className="w-full px-3 py-2 text-xs liquid-input text-[#F8FAFC]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#A1AEBB] mb-1">
                        Owner Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="e.g. Manjunath Patil"
                        className="w-full px-3 py-2 text-xs liquid-input text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#A1AEBB] mb-1">
                        Phone Number
                      </label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="9845012345"
                        className="w-full px-3 py-2 text-xs liquid-input text-[#F8FAFC]"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[#A1AEBB] mb-1">
                        Town / City
                      </label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Haveri"
                        className="w-full px-3 py-2 text-xs liquid-input text-[#F8FAFC]"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[#A1AEBB] mb-1">
                        GSTIN (Optional)
                      </label>
                      <input
                        type="text"
                        value={gstin}
                        onChange={(e) => setGstin(e.target.value)}
                        placeholder="29ABCDE1234F1Z5"
                        className="w-full px-3 py-2 text-xs liquid-input text-[#F8FAFC]"
                      />
                    </div>
                  </div>
                </>
              )}

              <div>
                <label className="block text-xs font-semibold text-[#A1AEBB] mb-1">
                  Email Address *
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="owner@yourstore.in"
                  className="w-full px-3 py-2 text-xs liquid-input text-[#F8FAFC]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#A1AEBB] mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-3 py-2 text-xs liquid-input text-[#F8FAFC]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-xl liquid-btn-primary font-bold text-xs shadow-md transition-all flex items-center justify-center gap-2 mt-2 disabled:opacity-50 active:scale-[0.98]"
              >
                <span>{loading ? "Verifying..." : isRegisterMode ? "Create Private Shop" : "Sign In to Shop"}</span>
                <ArrowRight className="w-4 h-4 text-[#080B10]" />
              </button>
            </form>

            <div className="mt-5 pt-5 border-t border-white/10 text-center">
              <button
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setError(null);
                }}
                className="text-xs text-[#6EE7B7] font-semibold hover:underline"
              >
                {isRegisterMode
                  ? "Already have an account? Sign In"
                  : "New retailer? Register your shop on SmartStock"}
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl w-full mx-auto px-6 py-6 border-t border-white/10 text-center text-xs text-[#A1AEBB] relative z-10">
        SmartStock Retail Platform • Haveri District, Karnataka • Strict Tenant Isolation • Real Data Only
      </footer>
    </div>
  );
};
