import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULTS, type GlassConfig } from "../lib/liquidglass";

export type LiquidGlassPresetKey = "crystal" | "frosted" | "prism" | "obsidian";

export interface LiquidGlassPreset {
  key: LiquidGlassPresetKey;
  label: string;
  description: string;
  config: Partial<GlassConfig>;
}

export const LIQUID_GLASS_PRESETS: Record<LiquidGlassPresetKey, LiquidGlassPreset> = {
  crystal: {
    key: "crystal",
    label: "Crystal Refraction",
    description: "Balanced optical refraction, crisp Fresnel rim, and subtle midnight mist blur.",
    config: {
      blurAmount: 0.2,
      refraction: 0.68,
      chromAberration: 0.09,
      edgeHighlight: 0.24,
      specular: 0.42,
      fresnel: 0.95,
      distortion: 0.02,
      cornerRadius: 24,
      zRadius: 32,
      opacity: 1,
      saturation: 0.14,
      tintStrength: 0.28,
      brightness: 0.08,
      shadowOpacity: 0.42,
      shadowSpread: 14,
      shadowOffsetY: 3,
    },
  },
  frosted: {
    key: "frosted",
    label: "visionOS Frosted",
    description: "Soft Gaussian frost with smooth edge glow optimized for long-session readability.",
    config: {
      blurAmount: 0.56,
      refraction: 0.52,
      chromAberration: 0.04,
      edgeHighlight: 0.28,
      specular: 0.28,
      fresnel: 0.85,
      distortion: 0.0,
      cornerRadius: 24,
      zRadius: 28,
      opacity: 1,
      saturation: 0.08,
      tintStrength: 0.36,
      brightness: 0.12,
      shadowOpacity: 0.38,
      shadowSpread: 12,
      shadowOffsetY: 2,
    },
  },
  prism: {
    key: "prism",
    label: "Prismatic Lens",
    description: "High refraction, vivid RGB chromatic dispersion, and multi-light specular sheen.",
    config: {
      blurAmount: 0.12,
      refraction: 0.88,
      chromAberration: 0.24,
      edgeHighlight: 0.35,
      specular: 0.62,
      fresnel: 1.0,
      distortion: 0.03,
      cornerRadius: 28,
      zRadius: 42,
      opacity: 1,
      saturation: 0.28,
      tintStrength: 0.22,
      brightness: 0.1,
      shadowOpacity: 0.46,
      shadowSpread: 16,
      shadowOffsetY: 4,
    },
  },
  obsidian: {
    key: "obsidian",
    label: "Obsidian Smoked",
    description: "Deep smoked slate glass with crisp teal-tinted highlights and low glare.",
    config: {
      blurAmount: 0.36,
      refraction: 0.62,
      chromAberration: 0.07,
      edgeHighlight: 0.2,
      specular: 0.48,
      fresnel: 0.9,
      distortion: 0.01,
      cornerRadius: 22,
      zRadius: 30,
      opacity: 1,
      saturation: 0.05,
      tintStrength: 0.45,
      brightness: -0.05,
      shadowOpacity: 0.5,
      shadowSpread: 14,
      shadowOffsetY: 3,
    },
  },
};

const STORAGE_KEY = "smartstock_liquid_glass_v1";

interface StoredLiquidGlassPrefs {
  enabled: boolean;
  preset: LiquidGlassPresetKey;
  overrides: Partial<GlassConfig>;
}

function detectWebGLSupport(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    if (!gl) return false;
    const ext = (gl as WebGLRenderingContext).getExtension("WEBGL_lose_context");
    ext?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function loadStoredPrefs(): StoredLiquidGlassPrefs {
  const prefersReduced =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const fallback: StoredLiquidGlassPrefs = {
    enabled: !prefersReduced,
    preset: "crystal",
    overrides: {},
  };

  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<StoredLiquidGlassPrefs>;
    const preset: LiquidGlassPresetKey =
      parsed.preset && parsed.preset in LIQUID_GLASS_PRESETS ? parsed.preset : "crystal";
    return {
      enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : fallback.enabled,
      preset,
      overrides:
        parsed.overrides && typeof parsed.overrides === "object" ? parsed.overrides : {},
    };
  } catch {
    return fallback;
  }
}

interface LiquidGlassContextValue {
  webglSupported: boolean;
  enabled: boolean;
  active: boolean;
  preset: LiquidGlassPresetKey;
  config: GlassConfig;
  setEnabled: (enabled: boolean) => void;
  toggleEnabled: () => void;
  selectPreset: (preset: LiquidGlassPresetKey) => void;
  updateConfig: (patch: Partial<GlassConfig>) => void;
  resetConfig: () => void;
}

const LiquidGlassContext = createContext<LiquidGlassContextValue>({
  webglSupported: false,
  enabled: false,
  active: false,
  preset: "crystal",
  config: { ...DEFAULTS, ...LIQUID_GLASS_PRESETS.crystal.config },
  setEnabled: () => {},
  toggleEnabled: () => {},
  selectPreset: () => {},
  updateConfig: () => {},
  resetConfig: () => {},
});

export const LiquidGlassProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const webglSupported = useMemo(() => detectWebGLSupport(), []);
  const [prefs, setPrefs] = useState<StoredLiquidGlassPrefs>(() => loadStoredPrefs());

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      // Ignore storage quota errors
    }
  }, [prefs]);

  const config = useMemo<GlassConfig>(
    () => ({
      ...DEFAULTS,
      ...LIQUID_GLASS_PRESETS[prefs.preset].config,
      ...prefs.overrides,
    }),
    [prefs.preset, prefs.overrides]
  );

  const value = useMemo<LiquidGlassContextValue>(
    () => ({
      webglSupported,
      enabled: prefs.enabled,
      active: webglSupported && prefs.enabled,
      preset: prefs.preset,
      config,
      setEnabled: (enabled) => setPrefs((prev) => ({ ...prev, enabled })),
      toggleEnabled: () => setPrefs((prev) => ({ ...prev, enabled: !prev.enabled })),
      selectPreset: (preset) => setPrefs((prev) => ({ ...prev, preset, overrides: {} })),
      updateConfig: (patch) =>
        setPrefs((prev) => ({
          ...prev,
          overrides: { ...prev.overrides, ...patch },
        })),
      resetConfig: () =>
        setPrefs({
          enabled: true,
          preset: "crystal",
          overrides: {},
        }),
    }),
    [webglSupported, prefs.enabled, prefs.preset, config]
  );

  return <LiquidGlassContext.Provider value={value}>{children}</LiquidGlassContext.Provider>;
};

export const useLiquidGlass = () => useContext(LiquidGlassContext);
