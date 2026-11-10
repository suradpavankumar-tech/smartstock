import React, { useState, useEffect } from "react";
import { Product } from "../types";
import { api } from "../services/api";
import { useLanguage } from "../context/LanguageContext";
import {
  Sliders, AlertTriangle, ArrowRight, IndianRupee, Clock,
  TrendingUp, TrendingDown, Layers, Play, RefreshCw, ShieldAlert,
  Percent, DollarSign, CheckCircle2, Package, Sparkles, HelpCircle,
  BarChart3, Zap
} from "lucide-react";

interface SimulatorPageProps {
  onNavigateTab?: (tab: string) => void;
}

export const SimulatorPage: React.FC<SimulatorPageProps> = ({ onNavigateTab }) => {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<"PRICE" | "DELAY" | "DEMAND">("PRICE");
  const [products, setProducts] = useState<Product[]>([]);

  // -------------------------------------------------------------
  // Scenario 1: Price Elasticity State
  // -------------------------------------------------------------
  const [selectedProductId, setSelectedProductId] = useState<string>("ALL");
  const [pricePercent, setPricePercent] = useState<number>(5);
  const [elasticity, setElasticity] = useState<number>(-1.2);
  const [priceResult, setPriceResult] = useState<any | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);

  // -------------------------------------------------------------
  // Scenario 2: Delay Simulation State
  // -------------------------------------------------------------
  const [delayDays, setDelayDays] = useState<number>(5);
  const [delayResult, setDelayResult] = useState<any | null>(null);
  const [delayLoading, setDelayLoading] = useState(false);

  // -------------------------------------------------------------
  // Scenario 3: Demand Simulation State
  // -------------------------------------------------------------
  const [demandPercent, setDemandPercent] = useState<number>(25);
  const [demandResult, setDemandResult] = useState<any | null>(null);
  const [demandLoading, setDemandLoading] = useState(false);

  // Load products for dropdown
  useEffect(() => {
    const loadProducts = async () => {
      try {
        const prods = await api.getProducts();
        setProducts(prods);
      } catch (err) {
        console.error("Failed to load products for simulator", err);
      }
    };
    loadProducts();
  }, []);

  // Run price simulation
  const runPriceSimulation = async (pct: number = pricePercent, el: number = elasticity, pId: string = selectedProductId) => {
    setPriceLoading(true);
    try {
      const pidNum = pId === "ALL" ? undefined : parseInt(pId);
      const res = await api.simulatePrice(pidNum, pct, el);
      setPriceResult(res);
    } catch (err: any) {
      alert(err.message || "Failed to run price simulation");
    } finally {
      setPriceLoading(false);
    }
  };

  // Run delay simulation
  const runDelaySimulation = async (days: number = delayDays) => {
    setDelayLoading(true);
    try {
      const res = await api.simulateDelay(days);
      setDelayResult(res);
    } catch (err: any) {
      alert(err.message || "Failed to run delay simulation");
    } finally {
      setDelayLoading(false);
    }
  };

  // Run demand simulation
  const runDemandSimulation = async (pct: number = demandPercent) => {
    setDemandLoading(true);
    try {
      const res = await api.simulateDemand(pct);
      setDemandResult(res);
    } catch (err: any) {
      alert(err.message || "Failed to run demand simulation");
    } finally {
      setDemandLoading(false);
    }
  };

  // Run initial simulations on mount
  useEffect(() => {
    runPriceSimulation(5, -1.2, "ALL");
    runDelaySimulation(5);
    runDemandSimulation(25);
  }, []);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="p-2 bg-brand-50 dark:bg-brand-950/60 text-brand-600 dark:text-brand-400 rounded-xl">
            <Sliders className="w-6 h-6" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              {t("navSimulator")}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Interactive scenario modeling for retail pricing elasticity, supplier logistics disruptions, and festive demand surges without altering live store records.
            </p>
          </div>
        </div>
      </div>

      {/* Scenario Selector Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-xl px-2">
        <button
          onClick={() => setActiveTab("PRICE")}
          className={`py-3.5 px-5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "PRICE"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <IndianRupee className="w-4 h-4" />
          Scenario 1: Retail Price & Margin Elasticity
        </button>
        <button
          onClick={() => setActiveTab("DELAY")}
          className={`py-3.5 px-5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "DELAY"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <Clock className="w-4 h-4" />
          Scenario 2: Supplier Delay Stress-Test
        </button>
        <button
          onClick={() => setActiveTab("DEMAND")}
          className={`py-3.5 px-5 text-sm font-semibold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === "DEMAND"
              ? "border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Scenario 3: Festive Surge / Demand Shock
        </button>
      </div>

      {/* ========================================================================= */}
      {/* SCENARIO 1: RETAIL PRICE & MARGIN ELASTICITY */}
      {/* ========================================================================= */}
      {activeTab === "PRICE" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <Percent className="w-4 h-4 text-brand-600" />
                  Price Elasticity & Gross Profit Maximizer
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Simulate adjusting retail selling prices. See how customer demand elasticity (%ΔQ = Ed × %ΔP) alters monthly volume, revenue, and take-home gross margin.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedProductId("ALL");
                  setPricePercent(5);
                  setElasticity(-1.2);
                  runPriceSimulation(5, -1.2, "ALL");
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 self-start sm:self-auto transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset Defaults
              </button>
            </div>

            {/* Controls Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-1">
              {/* Product Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Target Product Scope:
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    runPriceSimulation(pricePercent, elasticity, e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="ALL">Entire Store (All Active SKUs)</option>
                  {products.map((p) => (
                    <option key={p.id} value={p.id.toString()}>
                      {p.name} (Now: ₹{p.selling_price.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Price Adjustment Slider & Presets */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Price Shift:</span>
                  <span className={`font-bold font-mono ${pricePercent > 0 ? "text-emerald-600" : pricePercent < 0 ? "text-rose-600" : "text-slate-600"}`}>
                    {pricePercent > 0 ? `+${pricePercent}% Hike` : pricePercent < 0 ? `${pricePercent}% Discount` : "0% (No Change)"}
                  </span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="50"
                  step="1"
                  value={pricePercent}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    setPricePercent(val);
                    runPriceSimulation(val, elasticity, selectedProductId);
                  }}
                  className="w-full accent-brand-600 cursor-pointer"
                />
                <div className="flex gap-1.5 flex-wrap pt-1">
                  {[-10, -5, 3, 5, 10, 15].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setPricePercent(pct);
                        runPriceSimulation(pct, elasticity, selectedProductId);
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                        pricePercent === pct
                          ? "bg-brand-600 text-white"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200"
                      }`}
                    >
                      {pct > 0 ? `+${pct}%` : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {/* Elasticity Coefficient Presets */}
              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Demand Sensitivity (Ed):</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">
                    {elasticity.toFixed(1)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setElasticity(-0.5);
                      runPriceSimulation(pricePercent, -0.5, selectedProductId);
                    }}
                    className={`p-1.5 rounded-lg text-[11px] font-medium text-center border transition-all ${
                      elasticity === -0.5
                        ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 text-indigo-700 font-bold"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div>Inelastic</div>
                    <div className="text-[9px] text-slate-400">Rice / Atta</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setElasticity(-1.2);
                      runPriceSimulation(pricePercent, -1.2, selectedProductId);
                    }}
                    className={`p-1.5 rounded-lg text-[11px] font-medium text-center border transition-all ${
                      elasticity === -1.2
                        ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 text-indigo-700 font-bold"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div>Standard</div>
                    <div className="text-[9px] text-slate-400">FMCG Goods</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setElasticity(-2.0);
                      runPriceSimulation(pricePercent, -2.0, selectedProductId);
                    }}
                    className={`p-1.5 rounded-lg text-[11px] font-medium text-center border transition-all ${
                      elasticity === -2.0
                        ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 text-indigo-700 font-bold"
                        : "border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div>Elastic</div>
                    <div className="text-[9px] text-slate-400">Luxury / Snacks</div>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Price Simulation Results */}
          {priceResult && (
            <div className="space-y-6">
              {/* Executive Scorecards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Projected Monthly Profit Impact
                  </div>
                  <div className={`text-2xl font-extrabold mt-1 ${priceResult.monthly_profit_delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                    {priceResult.monthly_profit_delta >= 0 ? `+₹${priceResult.monthly_profit_delta.toFixed(2)}` : `-₹${Math.abs(priceResult.monthly_profit_delta).toFixed(2)}`}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {priceResult.monthly_profit_delta >= 0 ? "Profit expands after volume adjustment" : "Margin erosion due to demand drop"}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Projected Monthly Revenue Delta
                  </div>
                  <div className={`text-2xl font-extrabold mt-1 ${priceResult.monthly_revenue_delta >= 0 ? "text-indigo-600 dark:text-indigo-400" : "text-amber-600 dark:text-amber-400"}`}>
                    {priceResult.monthly_revenue_delta >= 0 ? `+₹${priceResult.monthly_revenue_delta.toFixed(2)}` : `-₹${Math.abs(priceResult.monthly_revenue_delta).toFixed(2)}`}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Baseline: ₹{priceResult.total_baseline_monthly_revenue?.toFixed(2) || "0.00"}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Scope of Simulation
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
                    {priceResult.products_simulated_count} SKU(s)
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Price shift: {pricePercent > 0 ? `+${pricePercent}%` : `${pricePercent}%`}
                  </div>
                </div>
              </div>

              {/* Recommendation Banner */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border border-indigo-200 dark:border-indigo-900/60 flex items-start gap-3">
                <span className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-sm mt-0.5">
                  <Zap className="w-4 h-4" />
                </span>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400">
                    Pricing Elasticity Advisory
                  </div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mt-0.5">
                    {priceResult.recommendation}
                  </div>
                </div>
              </div>

              {/* Action Bar */}
              {onNavigateTab && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700">
                  <div className="text-xs text-slate-700 dark:text-slate-300 font-medium">
                    💡 Like these simulated price points and margins? Update your store's live catalog pricing in one click.
                  </div>
                  <button
                    onClick={() => onNavigateTab("products")}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors self-end sm:self-auto"
                  >
                    Open Product Catalog
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Before vs After Product Comparison Table */}
              {priceResult.product_results && priceResult.product_results.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm p-5 space-y-3">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                    <BarChart3 className="w-4 h-4 text-brand-600" />
                    Unit Economics: Before vs. After Simulation
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-4">Product Name</th>
                          <th className="py-2.5 px-4 text-right">Cost Price</th>
                          <th className="py-2.5 px-4 text-right">Current Price</th>
                          <th className="py-2.5 px-4 text-right">Simulated Price</th>
                          <th className="py-2.5 px-4 text-right">Unit Margin</th>
                          <th className="py-2.5 px-4 text-right">Monthly Units</th>
                          <th className="py-2.5 px-4 text-right">Monthly Profit Delta</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {priceResult.product_results.map((item: any, idx: number) => (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                              {item.product_name}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-500">
                              ₹{item.purchase_cost.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-700 dark:text-slate-300">
                              ₹{item.base_selling_price.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              ₹{item.simulated_selling_price.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-mono">
                              <span className="text-slate-500">₹{item.base_unit_margin.toFixed(2)}</span>
                              <ArrowRight className="w-3 h-3 inline mx-1 text-slate-400" />
                              <span className="font-bold text-emerald-600">₹{item.simulated_unit_margin.toFixed(2)}</span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                              {item.base_monthly_units} → {item.simulated_monthly_units}
                            </td>
                            <td className={`py-3 px-4 text-right font-mono font-extrabold ${item.monthly_profit_delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                              {item.monthly_profit_delta >= 0 ? `+₹${item.monthly_profit_delta.toFixed(2)}` : `-₹${Math.abs(item.monthly_profit_delta).toFixed(2)}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCENARIO 2: SUPPLIER LOGISTICS DELAY */}
      {/* ========================================================================= */}
      {activeTab === "DELAY" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-500" />
                  Distributor Logistics Disruption Simulator
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Calculate which products will face complete stockout and how much retail revenue is forfeited if suppliers experience freight or dispatch delays.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDelayDays(5);
                  runDelaySimulation(5);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 self-start sm:self-auto transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset (+5 Days)
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Simulated Delivery Disruption:</span>
                  <span className="font-bold font-mono text-amber-600">+{delayDays} Days Delay</span>
                </div>
                <div className="flex items-center gap-3">
                  {[3, 5, 7, 10, 14, 21].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setDelayDays(d);
                        runDelaySimulation(d);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        delayDays === d
                          ? "bg-brand-600 text-white shadow-sm"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                      }`}
                    >
                      +{d} Days
                    </button>
                  ))}
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={delayDays}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setDelayDays(val);
                      runDelaySimulation(val);
                    }}
                    className="flex-1 accent-brand-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Delay Output */}
          {delayResult && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Products Stocking Out
                  </div>
                  <div className={`text-2xl font-extrabold mt-1 ${(delayResult.stockout_products_count || 0) > 0 ? "text-rose-600" : "text-emerald-600"}`}>
                    {delayResult.stockout_products_count || 0}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {(delayResult.stockout_products_count || 0) > 0 ? "Shelf depleted before shipment arrives" : "All products have adequate buffer"}
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Estimated Lost Revenue
                  </div>
                  <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400 mt-1">
                    ₹{(delayResult.estimated_lost_revenue || delayResult.total_potential_lost_revenue || 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Customer demand missed during outage
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Operational Safety Level
                  </div>
                  <div className="text-base font-bold text-slate-900 dark:text-white mt-1">
                    {(delayResult.stockout_products_count || 0) === 0 ? "✅ Resilient Buffer" : "⚠️ Supply Vulnerability"}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Evaluated across active product lines
                  </div>
                </div>
              </div>

              {/* Recommendation Callout */}
              {delayResult.recommendation && (
                <div className="p-4 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                    {delayResult.recommendation}
                  </div>
                </div>
              )}

              {/* Action Bar for Stockout SKUs */}
              {onNavigateTab && (delayResult.stockout_products_count || 0) > 0 && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60">
                  <div>
                    <div className="text-xs font-bold text-rose-800 dark:text-rose-300">
                      ⚡ Action Required: {delayResult.stockout_products_count} SKU(s) Face Deficit Under This Delay
                    </div>
                    <div className="text-xs text-rose-600 dark:text-rose-400 mt-0.5">
                      Place advance purchase orders today to protect ₹{(delayResult.estimated_lost_revenue || delayResult.total_potential_lost_revenue || 0).toFixed(2)} in at-risk sales.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => onNavigateTab("purchases")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                    >
                      Raise Purchase Orders
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onNavigateTab("reorder")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                    >
                      Check Reorder Plan
                    </button>
                  </div>
                </div>
              )}

              {/* Vulnerable Products Table */}
              {(delayResult.vulnerable_products || delayResult.impacted_products) && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm p-5 space-y-3">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Stockout Vulnerability Breakdown (+{delayDays} Days Delay)
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-4">Product Name</th>
                          <th className="py-2.5 px-4 text-right">Current Stock</th>
                          <th className="py-2.5 px-4 text-right">Daily Demand</th>
                          <th className="py-2.5 px-4 text-right">Runway Until Out</th>
                          <th className="py-2.5 px-4 text-right">Units Short</th>
                          <th className="py-2.5 px-4 text-right">Lost Sales Value</th>
                          <th className="py-2.5 px-4 text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {(delayResult.vulnerable_products || delayResult.impacted_products).map((item: any, idx: number) => {
                          const isCritical = item.risk_level === "CRITICAL" || item.projected_units_short > 0;
                          const isWarning = item.risk_level === "WARNING";
                          return (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                                {item.product_name}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                                {item.current_stock} {item.unit || ""}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                                {item.avg_daily_demand?.toFixed(1) || item.daily_burn_rate?.toFixed(1) || "0.0"} /day
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-semibold">
                                {item.buffer_days !== undefined ? `${item.buffer_days.toFixed(1)} days` : "—"}
                              </td>
                              <td className={`py-3 px-4 text-right font-mono font-bold ${isCritical ? "text-rose-600" : "text-slate-500"}`}>
                                {item.projected_units_short > 0 ? `-${item.projected_units_short.toFixed(1)} ${item.unit || ""}` : "0"}
                              </td>
                              <td className={`py-3 px-4 text-right font-mono font-bold ${isCritical ? "text-rose-600" : "text-slate-500"}`}>
                                ₹{(item.lost_revenue || item.potential_lost_revenue || 0).toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  isCritical
                                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                    : isWarning
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                    : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                                }`}>
                                  {isCritical ? "Stockout" : isWarning ? "Buffer Low" : "Safe"}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* SCENARIO 3: DEMAND SHOCK / FESTIVE SURGE */}
      {/* ========================================================================= */}
      {activeTab === "DEMAND" && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-brand-600" />
                  Festive Surge / Seasonal Demand Shock Simulator
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Model the operational effect of local harvest market liquidity (Byadgi chilli / cotton harvest) or festive surges (Deepavali, Ganesha Chaturthi) on stock depletion rates and working capital requirements.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDemandPercent(25);
                  runDemandSimulation(25);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 self-start sm:self-auto transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reset (+25% Surge)
              </button>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 pt-2">
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <span>Simulated Demand Shift:</span>
                  <span className={`font-bold font-mono ${demandPercent > 0 ? "text-emerald-600" : "text-rose-600"}`}>
                    {demandPercent > 0 ? `+${demandPercent}% Festive Surge` : `${demandPercent}% Seasonal Slump`}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {[-20, 15, 25, 50, 100].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        setDemandPercent(pct);
                        runDemandSimulation(pct);
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        demandPercent === pct
                          ? "bg-brand-600 text-white shadow-sm"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                      }`}
                    >
                      {pct > 0 ? `+${pct}%` : `${pct}%`}
                    </button>
                  ))}
                  <input
                    type="range"
                    min="-50"
                    max="150"
                    step="5"
                    value={demandPercent}
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      setDemandPercent(val);
                      runDemandSimulation(val);
                    }}
                    className="flex-1 accent-brand-600 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Demand Result */}
          {demandResult && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Additional Procurement Capital Needed
                  </div>
                  <div className="text-2xl font-extrabold text-brand-600 dark:text-brand-400 mt-1">
                    ₹{(demandResult.additional_capital_required || demandResult.total_capital_needed_for_reorder || 0).toFixed(2)}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Procurement fund needed to maintain service levels
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Projected Incremental Gross Profit
                  </div>
                  <div className={`text-2xl font-extrabold mt-1 ${(demandResult.projected_additional_profit || 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600"}`}>
                    {(demandResult.projected_additional_profit || 0) >= 0 ? `+₹${(demandResult.projected_additional_profit || 0).toFixed(2)}` : `-₹${Math.abs(demandResult.projected_additional_profit || 0).toFixed(2)}`}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    Estimated monthly profit shift during surge
                  </div>
                </div>

                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    Stock Depletion Velocity
                  </div>
                  <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 mt-1">
                    {demandResult.depletion_acceleration || `${demandPercent}% faster`}
                  </div>
                  <div className="text-xs text-slate-400 mt-1">
                    {demandPercent > 0 ? "Advance procurement lead time by 3-5 days" : "Slow down supplier purchase orders"}
                  </div>
                </div>
              </div>

              {/* Working Capital Action Bar */}
              {onNavigateTab && (demandResult.total_capital_needed_for_reorder || 0) > 0 && (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-xl bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/60">
                  <div>
                    <div className="text-xs font-bold text-indigo-800 dark:text-indigo-300">
                      ⚡ Festive Capital Allocation: ₹{(demandResult.total_capital_needed_for_reorder || 0).toFixed(2)} Required
                    </div>
                    <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                      Prepare procurement funds to stock up on {demandResult.critical_lines_count} critical product lines before the surge.
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      onClick={() => onNavigateTab("purchases")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-lg shadow-sm transition-colors"
                    >
                      Prepare Purchase Indent
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => onNavigateTab("reorder")}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-lg transition-colors"
                    >
                      View Suggested Quantities
                    </button>
                  </div>
                </div>
              )}

              {/* Critical Depletion Lines Table */}
              {demandResult.critical_lines && demandResult.critical_lines.length > 0 && (
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm p-5 space-y-3">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Product Depletion & Emergency Procurement Forecast ({demandPercent > 0 ? `+${demandPercent}% Surge` : `${demandPercent}% Slump`})
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-semibold uppercase tracking-wider">
                        <tr>
                          <th className="py-2.5 px-4">Product Name</th>
                          <th className="py-2.5 px-4 text-right">Current Stock</th>
                          <th className="py-2.5 px-4 text-right">Normal Velocity</th>
                          <th className="py-2.5 px-4 text-right">Surge Velocity</th>
                          <th className="py-2.5 px-4 text-right">Runway (Normal → Surge)</th>
                          <th className="py-2.5 px-4 text-right">Emergency Reorder Qty</th>
                          <th className="py-2.5 px-4 text-right">Capital Required</th>
                          <th className="py-2.5 px-4 text-center">Urgency</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {demandResult.critical_lines.map((line: any, idx: number) => {
                          const isCritical = line.urgency === "CRITICAL";
                          const isHigh = line.urgency === "HIGH";
                          return (
                            <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                              <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                                {line.product_name}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-600 dark:text-slate-400">
                                {line.current_stock} {line.unit || ""}
                              </td>
                              <td className="py-3 px-4 text-right font-mono text-slate-500">
                                {line.normal_daily_burn} /d
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                {line.simulated_daily_burn} /d
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-semibold">
                                <span className="text-slate-400">{line.normal_runway_days}d</span>
                                <ArrowRight className="w-3 h-3 inline mx-1 text-slate-400" />
                                <span className={isCritical ? "text-rose-600 font-bold" : "text-amber-600"}>
                                  {line.simulated_runway_days}d
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                                {line.emergency_order_units > 0 ? `${line.emergency_order_units} ${line.unit || ""}` : "—"}
                              </td>
                              <td className="py-3 px-4 text-right font-mono font-bold text-brand-600 dark:text-brand-400">
                                {line.capital_required > 0 ? `₹${line.capital_required.toFixed(2)}` : "₹0.00"}
                              </td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  isCritical
                                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                                    : isHigh
                                    ? "bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300"
                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                }`}>
                                  {line.urgency}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Simulator Economic Principles Guide Card */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-4">
        <h4 className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-brand-600" />
          Kirana Scenario Modeling Principles & Economics
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-600 dark:text-slate-400">
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Percent className="w-3.5 h-3.5 text-indigo-500" />
              1. Price Elasticity (%ΔQ = Ed × %ΔP)
            </div>
            <p className="leading-relaxed">
              Staple commodities (rice, atta, cooking oil) are inelastic (Ed ≈ -0.5); price hikes generate profit expansion with minimal defection. FMCG branded goods (Ed ≈ -1.2) lose volume if nearby stores undercut.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              2. Freight & Logistics Vulnerability
            </div>
            <p className="leading-relaxed">
              When regional distributors or APMC market lorries face delays, products with less runway than Lead Time + Delay face immediate customer stockout. Advance indenting protects daily cash flow.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1.5">
            <div className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              3. Festive Working Capital Buffer
            </div>
            <p className="leading-relaxed">
              Local harvest windfalls (chilli/cotton markets) and festival weeks (Diwali, Eid, Sankranti) accelerate sales by 25%–100%. Pre-allocating working capital prevents empty shelves during peak buying frenzy.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
