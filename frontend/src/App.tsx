import React, { useState } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { LanguageProvider, useLanguage } from "./context/LanguageContext";
import { ThemeProvider } from "./context/ThemeContext";
import { OfflineSyncProvider } from "./context/OfflineSyncContext";

import { Sidebar, NavItemKey } from "./components/Sidebar";
import { Header } from "./components/Header";
import { FloatingAiLauncher } from "./components/ai/FloatingAiLauncher";
import { AIModeType } from "./types";

// Pages
import { LandingPage } from "./pages/LandingPage";
import { DashboardPage } from "./pages/DashboardPage";
import { POSPage } from "./pages/POSPage";
import { ProductsPage } from "./pages/ProductsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { PurchasesPage } from "./pages/PurchasesPage";
import { SuppliersPage } from "./pages/SuppliersPage";
import { SalesHistoryPage } from "./pages/SalesHistoryPage";
import { CustomersPage } from "./pages/CustomersPage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { ForecastingPage } from "./pages/ForecastingPage";
import { ReorderPage } from "./pages/ReorderPage";
import { StockAgeingPage } from "./pages/StockAgeingPage";
import { ReconciliationPage } from "./pages/ReconciliationPage";
import { SimulatorPage } from "./pages/SimulatorPage";
import { AgentPage } from "./pages/AgentPage";
import { AnomaliesPage } from "./pages/AnomaliesPage";
import { SyncStatusPage } from "./pages/SyncStatusPage";
import { StaffPage } from "./pages/StaffPage";
import { AuditPage } from "./pages/AuditPage";
import { SettingsPage } from "./pages/SettingsPage";

const MainLayout: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<NavItemKey>("overview");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiPromptRequest, setAiPromptRequest] = useState<{
    text: string;
    mode?: AIModeType;
    nonce: number;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-white text-sm animate-pulse">
        Initializing SmartStock Retail Engine...
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LandingPage />;
  }

  const renderContent = () => {
    switch (currentTab) {
      case "overview":
        return <DashboardPage onNavigate={setCurrentTab} />;
      case "pos":
        return <POSPage />;
      case "products":
        return <ProductsPage />;
      case "inventory":
        return <InventoryPage />;
      case "purchases":
        return <PurchasesPage />;
      case "suppliers":
        return <SuppliersPage onNavigate={(tab) => setCurrentTab(tab as NavItemKey)} />;
      case "sales":
        return <SalesHistoryPage />;
      case "customers":
        return <CustomersPage />;
      case "expenses":
        return <ExpensesPage />;
      case "analytics":
        return <AnalyticsPage />;
      case "forecasting":
        return <ForecastingPage onNavigateTab={(tab) => setCurrentTab(tab as NavItemKey)} />;
      case "reorder":
        return <ReorderPage onNavigateTab={(tab) => setCurrentTab(tab as NavItemKey)} />;
      case "stock-ageing":
        return <StockAgeingPage />;
      case "reconciliation":
        return <ReconciliationPage />;
      case "simulator":
        return <SimulatorPage onNavigateTab={(tab) => setCurrentTab(tab as NavItemKey)} />;
      case "agent":
        return (
          <AgentPage
            onNavigateTab={(tab) => setCurrentTab(tab as NavItemKey)}
            externalPromptRequest={aiPromptRequest}
          />
        );
      case "anomalies":
        return <AnomaliesPage onNavigateTab={(tab) => setCurrentTab(tab as NavItemKey)} />;
      case "sync":
        return <SyncStatusPage />;
      case "staff":
        return <StaffPage />;
      case "audit":
        return <AuditPage />;
      case "settings":
        return <SettingsPage />;
      default:
        return <DashboardPage onNavigate={setCurrentTab} />;
    }
  };

  return (
    <div className="min-h-screen bg-[#080B10] text-[#F8FAFC] flex relative overflow-x-hidden selection:bg-[#5EEAD4]/30 selection:text-[#6EE7B7]">
      {/* Living Ambient Midnight Mist Illumination Glow Orbs with Floating Motion */}
      <div className="fixed top-0 left-0 w-[550px] h-[550px] bg-gradient-to-br from-[#5EEAD4]/18 via-[#6EE7B7]/10 to-transparent rounded-full blur-[130px] pointer-events-none -translate-x-1/3 -translate-y-1/3 z-0 animate-mist-1" />
      <div className="fixed top-1/4 right-0 w-[450px] h-[450px] bg-gradient-to-br from-[#A78BFA]/15 via-[#7DD3FC]/10 to-transparent rounded-full blur-[120px] pointer-events-none translate-x-1/4 z-0 animate-mist-2" />
      <div className="fixed bottom-0 left-1/3 w-[500px] h-[500px] bg-gradient-to-br from-[#7DD3FC]/14 via-[#5EEAD4]/10 to-transparent rounded-full blur-[130px] pointer-events-none translate-y-1/4 z-0 animate-mist-3" />

      {/* Floating Sidebar Navigation (Apple visionOS/macOS Floating Dock) */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={setCurrentTab}
        isOpenMobile={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      {/* Main Content Area (Detached Floating Island Offset) */}
      <div className="flex-1 lg:pl-[17.5rem] flex flex-col min-w-0 z-10 relative pr-0 sm:pr-4 pb-6">
        <Header onToggleMobileMenu={() => setMobileMenuOpen(true)} onNavigate={setCurrentTab} />
        <main className="flex-1 p-3 sm:p-5 lg:p-6 max-w-7xl mx-auto w-full">
          <div key={currentTab} className="animate-liquid-enter">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Persistent SmartStock AI Ultra Floating Launcher on non-AI tabs */}
      <FloatingAiLauncher
        visible={currentTab !== "agent"}
        onExpandWorkspace={(prompt, mode) => {
          if (prompt) {
            setAiPromptRequest({ text: prompt, mode, nonce: Date.now() });
          }
          setCurrentTab("agent");
        }}
      />
    </div>
  );
};

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthProvider>
          <OfflineSyncProvider>
            <MainLayout />
          </OfflineSyncProvider>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}
