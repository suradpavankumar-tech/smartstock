import React, { useState, useEffect } from "react";
import { ProductForecastReport, ForecastItemDetail } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import { EmptyState } from "../components/EmptyState";
import {
  BrainCircuit, ShieldCheck, AlertCircle, Info, ChevronRight,
  CheckCircle2, RefreshCw, X, Calendar, Search, Filter,
  TrendingUp, Zap, Sparkles, Clock, ArrowUpRight, Activity,
  ShoppingCart, ArrowRight
} from "lucide-react";
import { NavItemKey } from "../components/Sidebar";

interface ForecastingPageProps {
  onNavigateTab?: (tab: NavItemKey) => void;
}

export const ForecastingPage: React.FC<ForecastingPageProps> = ({ onNavigateTab }) => {
  const { t, language } = useLanguage();
  const isKn = language === "kn";
  const [reports, setReports] = useState<ProductForecastReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDetail, setSelectedDetail] = useState<ForecastItemDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailHorizon, setDetailHorizon] = useState<number>(7);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [selectedHorizon, setSelectedHorizon] = useState<7 | 14 | 30>(7);

  const fetchOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getForecastingOverview();
      setReports(data);
    } catch (err: any) {
      setError(err.message || "Failed to load forecasting models");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const handleOpenDetail = async (productId: number, horizon: number = 7) => {
    setDetailLoading(true);
    setDetailHorizon(horizon);
    try {
      const detail = await api.getProductForecastDetail(productId, horizon);
      setSelectedDetail(detail);
    } catch (err: any) {
      alert(err.message || "Failed to load forecast model details");
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSwitchDetailHorizon = async (horizon: number) => {
    if (!selectedDetail) return;
    setDetailHorizon(horizon);
    try {
      const detail = await api.getProductForecastDetail(selectedDetail.product_id, horizon);
      setSelectedDetail(detail);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Unique categories for filtering
  const categories = Array.from(new Set(reports.map((r) => r.category_name || "General")));

  // Filtered reports
  const filteredReports = reports.filter((r) => {
    if (categoryFilter !== "ALL" && (r.category_name || "General") !== categoryFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = r.product_name.toLowerCase().includes(q);
      const matchSku = r.sku ? r.sku.toLowerCase().includes(q) : false;
      const matchCat = r.category_name ? r.category_name.toLowerCase().includes(q) : false;
      if (!matchName && !matchSku && !matchCat) return false;
    }
    return true;
  });

  // Summary Metrics
  const totalForecastDemand = filteredReports.reduce((sum, r) => {
    const val = selectedHorizon === 7 ? r.forecast_7d : selectedHorizon === 14 ? r.forecast_14d : r.forecast_30d;
    return sum + (val || 0);
  }, 0);

  const fastMoversCount = filteredReports.filter((r) => r.daily_velocity >= 1.5).length;
  const atRiskRunwayCount = filteredReports.filter((r) => (r.stockout_risk_days !== undefined && r.stockout_risk_days < 14)).length;
  const activeModelsCount = filteredReports.filter((r) => r.status !== "NO_SALES_RECORDED").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-gradient-to-br from-indigo-500 to-brand-600 rounded-xl text-white shadow-md shadow-brand-500/20">
              <BrainCircuit className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                {t("navForecasting")}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 dark:bg-brand-950/60 dark:text-brand-300 border border-brand-200 dark:border-brand-800">
                  Adaptive AI v2.0
                </span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Evidence-based Kirana demand forecasting: Adaptive Sales Velocity, 7-Day Rolling Trend & Multi-Model Ensembles
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigateTab && (
            <button
              onClick={() => onNavigateTab("reorder")}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              <span>{isKn ? "ಮರುಆದೇಶ ಮಾಡಿ" : "Auto Reorder"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Horizon Toggle */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium">
            <button
              onClick={() => setSelectedHorizon(7)}
              className={`px-3 py-1.5 rounded-md transition-all ${
                selectedHorizon === 7
                  ? "bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              7-Day Demand
            </button>
            <button
              onClick={() => setSelectedHorizon(14)}
              className={`px-3 py-1.5 rounded-md transition-all ${
                selectedHorizon === 14
                  ? "bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              14-Day Demand
            </button>
            <button
              onClick={() => setSelectedHorizon(30)}
              className={`px-3 py-1.5 rounded-md transition-all ${
                selectedHorizon === 30
                  ? "bg-white dark:bg-slate-900 text-brand-600 dark:text-brand-400 shadow-sm font-bold"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
              }`}
            >
              30-Day Demand
            </button>
          </div>

          <button
            onClick={fetchOverview}
            className="p-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            title={t("refresh")}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* KPI Metric Scorecards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Projected {selectedHorizon}d Demand
            </span>
            <Sparkles className="w-4 h-4 text-brand-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 font-mono">
            {totalForecastDemand.toFixed(1)} <span className="text-xs font-normal text-slate-400">units</span>
          </div>
          <div className="text-[11px] text-brand-600 dark:text-brand-400 mt-1 flex items-center gap-1 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" /> Across {filteredReports.length} catalogue items
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Fast-Moving SKUs
            </span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 font-mono">
            {fastMoversCount} <span className="text-xs font-normal text-slate-400">lines</span>
          </div>
          <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1 font-medium">
            Daily velocity ≥ 1.5 units/day
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Runway &lt; 14 Days
            </span>
            <Clock className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 font-mono">
            {atRiskRunwayCount} <span className="text-xs font-normal text-slate-400">items</span>
          </div>
          <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-1 flex items-center gap-1 font-medium">
            Requires replenishment review
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              AI Forecast Coverage
            </span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1.5 font-mono">
            {filteredReports.length > 0 ? Math.round((activeModelsCount / filteredReports.length) * 100) : 0}%
          </div>
          <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            {activeModelsCount} of {filteredReports.length} items live
          </div>
        </div>
      </div>

      {/* Explanatory Architecture Banner */}
      <div className="bg-indigo-50/60 dark:bg-indigo-950/25 border border-indigo-200/80 dark:border-indigo-900/60 rounded-xl p-3.5 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 flex-shrink-0 mt-0.5" />
        <div className="space-y-0.5 text-xs">
          <div className="font-semibold text-indigo-950 dark:text-indigo-200">
            Multi-Tier Adaptive Kirana Forecasting (ಹಂತ ಹಂತದ ಹೊಂದಾಣಿಕೆಯ ಬೇಡಿಕೆ ಮುನ್ಸೂಚನೆ)
          </div>
          <p className="text-indigo-700 dark:text-indigo-400 leading-relaxed text-[11px]">
            SmartStock applies <strong>Adaptive Velocity & Bayesian run-rates</strong> from Day 1 to ensure immediate business guidance, transitions to <strong>7-Day Rolling Trend</strong> once weekly patterns emerge, and activates <strong>Full Ensemble ML</strong> (Ridge Regression, Seasonal Naive, 7d Moving Average) with out-of-sample chronological backtesting once 14 days of genuine sales are verified.
          </p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product name, SKU or category..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Category:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="ALL">All Categories ({reports.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Main Table */}
      {loading ? (
        <div className="p-12 text-center text-slate-500 dark:text-slate-400 text-sm animate-pulse">
          {t("loading")}
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-lg text-rose-700 dark:text-rose-400 text-sm">
          {error}
        </div>
      ) : filteredReports.length === 0 ? (
        <EmptyState
          title="No Products Found"
          description="No products match your search or category filter. Adjust filters or record sales at the POS terminal."
        />
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-5 py-3">Product & Category</th>
                  <th className="px-5 py-3 text-right">Current Stock</th>
                  <th className="px-5 py-3 text-right">Daily Velocity</th>
                  <th className="px-5 py-3 text-right">Stock Runway</th>
                  <th className="px-5 py-3 text-right">
                    {selectedHorizon}-Day Projected Demand
                  </th>
                  <th className="px-5 py-3 text-center">Model Intelligence</th>
                  <th className="px-5 py-3 text-right">Explainability</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReports.map((r) => {
                  const demandVal = selectedHorizon === 7 ? r.forecast_7d : selectedHorizon === 14 ? r.forecast_14d : r.forecast_30d;
                  const runway = r.stockout_risk_days;
                  
                  let runwayColor = "text-slate-700 dark:text-slate-300";
                  let runwayBg = "bg-slate-100 dark:bg-slate-800";
                  if (runway !== undefined) {
                    if (runway <= 7) {
                      runwayColor = "text-rose-700 dark:text-rose-400";
                      runwayBg = "bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900";
                    } else if (runway <= 14) {
                      runwayColor = "text-amber-700 dark:text-amber-400";
                      runwayBg = "bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900";
                    } else {
                      runwayColor = "text-emerald-700 dark:text-emerald-400";
                      runwayBg = "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900";
                    }
                  }

                  let statusBadge = (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      <Clock className="w-3 h-3 mr-1 text-slate-400" />
                      Awaiting Sales
                    </span>
                  );

                  if (r.status === "ACTIVE_ENSEMBLE") {
                    statusBadge = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        Ensemble ML (High)
                      </span>
                    );
                  } else if (r.status === "ROLLING_TREND") {
                    statusBadge = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border border-blue-200 dark:border-blue-800">
                        <TrendingUp className="w-3 h-3 mr-1" />
                        7d Rolling Trend
                      </span>
                    );
                  } else if (r.status === "ADAPTIVE_VELOCITY") {
                    statusBadge = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                        <Zap className="w-3 h-3 mr-1" />
                        Adaptive Velocity
                      </span>
                    );
                  }

                  return (
                    <tr key={r.product_id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {r.product_name}
                        </div>
                        <div className="text-xs text-slate-400">
                          {r.sku ? `SKU: ${r.sku} • ` : ""}{r.category_name || "General"}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-right font-medium text-slate-800 dark:text-slate-200 font-mono text-xs">
                        <span className="font-bold text-slate-900 dark:text-white text-sm">{r.current_stock}</span> {r.unit}
                      </td>

                      <td className="px-5 py-3.5 text-right font-mono text-xs">
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {r.daily_velocity.toFixed(2)}
                        </span>
                        <span className="text-[10px] text-slate-400 ml-1">/day</span>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold ${runwayBg} ${runwayColor}`}>
                          {runway !== undefined ? (runway >= 900 ? "90+ days" : `~${runway} days`) : "—"}
                        </span>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="font-mono font-bold text-sm text-brand-600 dark:text-brand-400">
                          {demandVal !== undefined && demandVal > 0 ? `${demandVal.toFixed(1)} ${r.unit}` : "0.0"}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {selectedHorizon}-day window
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        {statusBadge}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {r.days_of_sales_history} days history
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {onNavigateTab && runway !== undefined && runway <= 14 && (
                            <button
                              onClick={() => onNavigateTab("reorder")}
                              title="Stock runway low - click to create replenishment purchase order"
                              className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 rounded-lg transition-colors border border-amber-300 dark:border-amber-800"
                            >
                              <ShoppingCart className="w-3 h-3 text-amber-600" />
                              <span>Reorder</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenDetail(r.product_id, selectedHorizon)}
                            className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-brand-50 hover:bg-brand-100 dark:bg-brand-950/40 dark:hover:bg-brand-900/60 text-brand-700 dark:text-brand-300 rounded-lg transition-colors border border-brand-200/60 dark:border-brand-800/60"
                          >
                            Deep Rationale
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Model Detail / Deep Explainability Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setSelectedDetail(null)}
              className="absolute right-4 top-4 p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-5">
              <div className="p-2.5 bg-brand-50 dark:bg-brand-950/50 rounded-xl text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-brand-800">
                <BrainCircuit className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  {selectedDetail.product_name}
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                    {selectedDetail.confidence_level} CONFIDENCE
                  </span>
                </h3>
                <div className="text-xs text-slate-500">
                  Model: <span className="font-semibold text-slate-700 dark:text-slate-300">{selectedDetail.selected_model}</span> • Engine: {selectedDetail.model_version}
                </div>
              </div>
            </div>

            {/* Horizon Selector Inside Modal */}
            <div className="flex items-center gap-2 mb-4 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 ml-2">Projection Horizon:</span>
              <div className="flex items-center gap-1 ml-auto">
                {[7, 14, 30].map((h) => (
                  <button
                    key={h}
                    onClick={() => handleSwitchDetailHorizon(h)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium transition-all ${
                      detailHorizon === h
                        ? "bg-brand-600 text-white shadow-sm font-bold"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    }`}
                  >
                    {h} Days
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-4 text-xs">
              {/* Forecast summary KPI cards */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700/60 grid grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-slate-400 text-[11px]">Expected Demand ({selectedDetail.horizon_days}d)</div>
                  <div className="text-xl font-bold text-slate-900 dark:text-white mt-1 font-mono">
                    {selectedDetail.forecast_quantity}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">Lower Bound (95% CI)</div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-2 font-mono">
                    {selectedDetail.lower_bound}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">Upper Bound (95% CI)</div>
                  <div className="text-sm font-bold text-slate-700 dark:text-slate-300 mt-2 font-mono">
                    {selectedDetail.upper_bound}
                  </div>
                </div>
                <div>
                  <div className="text-slate-400 text-[11px]">Stockout Runway</div>
                  <div className="text-sm font-bold text-brand-600 dark:text-brand-400 mt-2 font-mono">
                    {selectedDetail.stockout_risk_days !== undefined && selectedDetail.stockout_risk_days < 900
                      ? `~${selectedDetail.stockout_risk_days} days`
                      : "Sufficient"}
                  </div>
                </div>
              </div>

              {/* Day-by-Day Projection Cards */}
              {selectedDetail.daily_projections && selectedDetail.daily_projections.length > 0 && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2 bg-white dark:bg-slate-900">
                  <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-brand-500" />
                      Day-by-Day Forecast Schedule & Confidence Bands
                    </span>
                    <span className="text-[10px] text-slate-400">Includes Weekend Kirana Spikes</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-1">
                    {selectedDetail.daily_projections.slice(0, Math.min(14, selectedDetail.daily_projections.length)).map((dp) => (
                      <div
                        key={dp.day_offset}
                        className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/80 border border-slate-100 dark:border-slate-800 text-center"
                      >
                        <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                          {dp.day_name}
                        </div>
                        <div className="text-xs font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                          {dp.projected_demand}
                        </div>
                        <div className="text-[9px] text-slate-400 mt-0.5 font-mono">
                          [{dp.lower_bound} - {dp.upper_bound}]
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Validation & Statistical Metrics */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-2">
                <div className="font-semibold text-slate-900 dark:text-white flex items-center justify-between">
                  <span>Statistical Model Diagnostics</span>
                  <span className="text-[10px] bg-brand-50 dark:bg-brand-950/60 px-2 py-0.5 rounded text-brand-700 dark:text-brand-300 font-semibold border border-brand-200 dark:border-brand-800">
                    {selectedDetail.selected_model}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-slate-600 dark:text-slate-400">
                  <div>
                    Mean Absolute Error (MAE):{" "}
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {selectedDetail.mae !== undefined && selectedDetail.mae !== null ? selectedDetail.mae.toFixed(2) : "0.00"}
                    </span>
                  </div>
                  <div>
                    WAPE Accuracy:{" "}
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {selectedDetail.wape !== undefined && selectedDetail.wape !== null ? `${selectedDetail.wape.toFixed(1)}%` : "N/A"}
                    </span>
                  </div>
                  <div>
                    Daily Burn Rate:{" "}
                    <span className="font-semibold text-slate-900 dark:text-white font-mono">
                      {selectedDetail.daily_run_rate ? `${selectedDetail.daily_run_rate.toFixed(2)}/day` : "0.00"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Explainability Text */}
              <div className="space-y-1">
                <div className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-brand-500" />
                  Retail Explainability & Demand Reasoning
                </div>
                <p className="text-slate-700 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
                  {selectedDetail.explanation}
                </p>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedDetail(null)}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Close Rationale
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
