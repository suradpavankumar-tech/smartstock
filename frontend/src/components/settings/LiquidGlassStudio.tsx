import React, { useState } from "react";
import { Sparkles, RotateCcw, Move, MousePointerClick, Eye, Cpu, Layers } from "lucide-react";
import {
  useLiquidGlass,
  LIQUID_GLASS_PRESETS,
  type LiquidGlassPresetKey,
} from "../../context/LiquidGlassContext";
import { LiquidGlassStage, LiquidGlassPanel } from "../common/LiquidGlassStage";
import type { GlassConfig } from "../../lib/liquidglass";

interface SliderDef {
  key: keyof Pick<
    GlassConfig,
    | "refraction"
    | "blurAmount"
    | "chromAberration"
    | "edgeHighlight"
    | "specular"
    | "fresnel"
    | "zRadius"
    | "tintStrength"
    | "brightness"
  >;
  label: string;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
}

const SLIDERS: SliderDef[] = [
  { key: "refraction", label: "Refraction Strength", min: 0, max: 1.2, step: 0.02 },
  { key: "blurAmount", label: "Gaussian Blur", min: 0, max: 1.0, step: 0.02 },
  { key: "chromAberration", label: "Chromatic Aberration", min: 0, max: 0.35, step: 0.01 },
  { key: "edgeHighlight", label: "Edge Rim Highlight", min: 0, max: 0.6, step: 0.02 },
  { key: "specular", label: "Blinn-Phong Specular", min: 0, max: 1.0, step: 0.02 },
  { key: "fresnel", label: "Fresnel Reflection", min: 0, max: 1.5, step: 0.05 },
  {
    key: "zRadius",
    label: "Bevel Depth (zRadius)",
    min: 8,
    max: 60,
    step: 1,
    format: (v) => `${Math.round(v)}px`,
  },
  { key: "tintStrength", label: "Cool Glass Tint", min: 0, max: 0.8, step: 0.02 },
  {
    key: "brightness",
    label: "Optical Brightness",
    min: -0.3,
    max: 0.35,
    step: 0.02,
    format: (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`,
  },
];

export const LiquidGlassStudio: React.FC = () => {
  const {
    webglSupported,
    enabled,
    active,
    preset,
    config,
    setEnabled,
    selectPreset,
    updateConfig,
    resetConfig,
  } = useLiquidGlass();

  const [fps, setFps] = useState<number>(0);
  const [pulseCount, setPulseCount] = useState<number>(0);

  return (
    <div className="space-y-6">
      {/* Header & Master Toggle */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#5EEAD4]" />
              <span>Liquid Glass WebGL Shader Engine</span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[#6EE7B7]/15 text-[#6EE7B7] border border-[#5EEAD4]/40">
                @ybouane/liquidglass
              </span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Real-time WebGL optical glass refraction, 9-tap Gaussian blur, RGB chromatic dispersion, Fresnel reflection, and multi-light specular shading.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <span
              className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold border ${
                active
                  ? "bg-[#6EE7B7]/15 text-[#6EE7B7] border-[#5EEAD4]/40"
                  : "bg-white/[0.04] text-[#A1AEBB] border-white/10"
              }`}
            >
              {!webglSupported
                ? "WebGL Unavailable"
                : active
                ? `WebGL Active${fps > 0 ? ` • ${fps} FPS` : ""}`
                : "CSS Glass Fallback"}
            </span>

            <button
              type="button"
              onClick={() => setEnabled(!enabled)}
              disabled={!webglSupported}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all border ${
                enabled && webglSupported
                  ? "bg-[#5EEAD4] text-[#080B10] border-[#5EEAD4] shadow-[0_0_18px_rgba(94,234,212,0.35)]"
                  : "liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC]"
              } disabled:opacity-40`}
            >
              {enabled ? "Disable WebGL" : "Enable WebGL"}
            </button>

            <button
              type="button"
              onClick={resetConfig}
              className="p-2 rounded-xl liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC]"
              title="Reset shader defaults"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Presets */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {(Object.keys(LIQUID_GLASS_PRESETS) as LiquidGlassPresetKey[]).map((key) => {
            const p = LIQUID_GLASS_PRESETS[key];
            const selected = preset === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectPreset(key)}
                className={`p-3.5 rounded-xl text-left transition-all border ${
                  selected
                    ? "bg-[#5EEAD4]/15 border-[#5EEAD4]/60 shadow-[0_0_20px_rgba(94,234,212,0.18)]"
                    : "bg-white/[0.03] border-white/10 hover:border-white/25"
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#F8FAFC]">{p.label}</span>
                  {selected && (
                    <span className="w-2 h-2 rounded-full bg-[#6EE7B7] shadow-[0_0_8px_#5EEAD4]" />
                  )}
                </div>
                <p className="text-[11px] text-[#A1AEBB] mt-1 leading-relaxed">{p.description}</p>
              </button>
            );
          })}
        </div>

        {/* Live Interactive WebGL Liquid Glass Playground Stage */}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#A1AEBB]">
            <span className="font-semibold text-[#F8FAFC] flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-[#5EEAD4]" />
              Interactive WebGL Glass Stage — drag the floating panels or press the glass button
            </span>
            <span className="font-mono text-[10px] text-[#A1AEBB]/80">
              Biconvex Pill • Plano-Convex Dome Magnifier • Tactile Button
            </span>
          </div>

          <LiquidGlassStage
            backdropVariant="studio"
            disableUserSelect={true}
            onFpsChange={setFps}
            className="min-h-[300px] p-6 border border-white/15 overflow-hidden flex flex-wrap items-center justify-center gap-6"
          >
            {/* 1. Draggable Biconvex Glass Card */}
            <LiquidGlassPanel
              glassConfig={{
                floating: true,
                cornerRadius: 26,
                zRadius: config.zRadius,
              }}
              className="w-60 p-5 rounded-[26px] border border-white/15 cursor-grab select-none"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#6EE7B7]/20 text-[#6EE7B7] border border-[#5EEAD4]/40">
                  <Move className="w-3 h-3" /> Drag Me
                </span>
                <span className="text-[10px] font-mono text-[#A1AEBB]">Biconvex</span>
              </div>
              <div className="text-sm font-extrabold text-[#F8FAFC]">SmartStock Lens</div>
              <p className="text-[11px] text-[#CBD5E1] mt-1 leading-relaxed">
                Dual-surface Snell refraction with live RGB chromatic dispersion over Midnight Mist.
              </p>
            </LiquidGlassPanel>

            {/* 2. Draggable Dome Magnifier (bevelMode: 1) */}
            <LiquidGlassPanel
              glassConfig={{
                floating: true,
                bevelMode: 1,
                cornerRadius: 56,
                zRadius: 56,
                blurAmount: Math.min(config.blurAmount, 0.14),
                refraction: Math.max(config.refraction, 0.72),
              }}
              className="w-28 h-28 rounded-full border border-white/20 flex flex-col items-center justify-center text-center cursor-grab select-none"
            >
              <Layers className="w-5 h-5 text-[#5EEAD4] mb-1" />
              <span className="text-[11px] font-extrabold text-[#F8FAFC]">Dome</span>
              <span className="text-[9px] text-[#A1AEBB]">Magnifier</span>
            </LiquidGlassPanel>

            {/* 3. Tactile Liquid Glass Button (button: true) */}
            <LiquidGlassPanel
              glassConfig={{
                button: true,
                cornerRadius: 24,
                zRadius: Math.min(config.zRadius, 28),
              }}
              onClick={() => setPulseCount((c) => c + 1)}
              className="px-6 py-4 rounded-[24px] border border-white/20 cursor-pointer select-none text-center"
            >
              <div className="flex items-center justify-center gap-2 text-xs font-extrabold text-[#F8FAFC]">
                <MousePointerClick className="w-4 h-4 text-[#6EE7B7]" />
                <span>Interactive Glass Button</span>
              </div>
              <div className="text-[10px] text-[#CBD5E1] mt-1 font-mono">
                Hover &amp; Press • Clicks: {pulseCount}
              </div>
            </LiquidGlassPanel>
          </LiquidGlassStage>
        </div>

        {/* Live Shader Uniform Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
          {SLIDERS.map((s) => {
            const val = Number(config[s.key]);
            return (
              <div
                key={s.key}
                className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 space-y-2"
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#E2E8F0]">{s.label}</span>
                  <span className="font-mono text-[11px] text-[#5EEAD4]">
                    {s.format ? s.format(val) : val.toFixed(2)}
                  </span>
                </div>
                <input
                  type="range"
                  min={s.min}
                  max={s.max}
                  step={s.step}
                  value={val}
                  onChange={(e) => updateConfig({ [s.key]: parseFloat(e.target.value) })}
                  className="w-full accent-[#5EEAD4] cursor-pointer"
                />
              </div>
            );
          })}
        </div>

        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10 text-[11px] text-[#A1AEBB] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-[#5EEAD4] shrink-0" />
            <span>
              Powered by <strong className="text-[#F8FAFC]">@ybouane/liquidglass</strong> WebGL 1.0 shaders (MIT License) with automatic CSS backdrop-filter fallback.
            </span>
          </div>
          <a
            href="https://github.com/ybouane/liquidglass"
            target="_blank"
            rel="noreferrer"
            className="text-[#5EEAD4] hover:underline font-semibold shrink-0"
          >
            github.com/ybouane/liquidglass
          </a>
        </div>
      </div>
    </div>
  );
};
