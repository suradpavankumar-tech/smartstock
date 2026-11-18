import React, { useEffect, useMemo, useRef, useState } from "react";
import { LiquidGlass, type GlassConfig } from "../../lib/liquidglass";
import { useLiquidGlass } from "../../context/LiquidGlassContext";

export type BackdropVariant = "hero" | "dashboard" | "studio";

interface LiquidGlassStageProps {
  children: React.ReactNode;
  className?: string;
  backdropVariant?: BackdropVariant;
  disableUserSelect?: boolean;
  onFpsChange?: (fps: number) => void;
  /** Increment or change this key if direct-child glass elements mount/unmount dynamically. */
  stageKey?: string | number;
}

/**
 * Draws a crisp, luminous Midnight Mist optical backdrop directly onto a <canvas>
 * direct child of the LiquidGlass root so the WebGL shader refracts rich light
 * ribbons, teal/mint/lavender orbs, and fine telemetry grid lines via ctx.drawImage
 * without expensive SVG-foreignObject rasterization.
 */
function paintMidnightBackdrop(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  variant: BackdropVariant
): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // 1. Opaque deep Midnight Mist base
  const baseGrad = ctx.createLinearGradient(0, 0, w, h);
  baseGrad.addColorStop(0, "#070B12");
  baseGrad.addColorStop(0.5, "#0D1522");
  baseGrad.addColorStop(1, "#080D16");
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, w, h);

  // 2. Luminous volumetric color orbs for visible chromatic refraction
  const orbs =
    variant === "studio"
      ? [
          { x: w * 0.2, y: h * 0.28, r: Math.max(w, h) * 0.42, c1: "rgba(94, 234, 212, 0.52)", c2: "rgba(94, 234, 212, 0)" },
          { x: w * 0.78, y: h * 0.25, r: Math.max(w, h) * 0.38, c1: "rgba(167, 139, 250, 0.48)", c2: "rgba(167, 139, 250, 0)" },
          { x: w * 0.52, y: h * 0.82, r: Math.max(w, h) * 0.44, c1: "rgba(125, 211, 252, 0.42)", c2: "rgba(125, 211, 252, 0)" },
          { x: w * 0.85, y: h * 0.78, r: Math.max(w, h) * 0.28, c1: "rgba(110, 231, 183, 0.38)", c2: "rgba(110, 231, 183, 0)" },
        ]
      : variant === "dashboard"
      ? [
          { x: w * 0.14, y: h * 0.22, r: Math.max(w, h) * 0.38, c1: "rgba(94, 234, 212, 0.34)", c2: "rgba(94, 234, 212, 0)" },
          { x: w * 0.84, y: h * 0.3, r: Math.max(w, h) * 0.36, c1: "rgba(167, 139, 250, 0.3)", c2: "rgba(167, 139, 250, 0)" },
          { x: w * 0.52, y: h * 0.9, r: Math.max(w, h) * 0.34, c1: "rgba(125, 211, 252, 0.26)", c2: "rgba(125, 211, 252, 0)" },
        ]
      : [
          { x: w * 0.18, y: h * 0.22, r: Math.max(w, h) * 0.4, c1: "rgba(94, 234, 212, 0.44)", c2: "rgba(94, 234, 212, 0)" },
          { x: w * 0.82, y: h * 0.28, r: Math.max(w, h) * 0.36, c1: "rgba(167, 139, 250, 0.4)", c2: "rgba(167, 139, 250, 0)" },
          { x: w * 0.48, y: h * 0.85, r: Math.max(w, h) * 0.42, c1: "rgba(125, 211, 252, 0.34)", c2: "rgba(125, 211, 252, 0)" },
        ];

  for (const orb of orbs) {
    const g = ctx.createRadialGradient(orb.x, orb.y, 0, orb.x, orb.y, orb.r);
    g.addColorStop(0, orb.c1);
    g.addColorStop(1, orb.c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  // 3. Precision geometric grid (makes glass edge refraction unmistakable)
  const step = variant === "studio" ? 28 : 34;
  ctx.strokeStyle = variant === "studio" ? "rgba(255, 255, 255, 0.11)" : "rgba(255, 255, 255, 0.065)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = step; x < w; x += step) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, h);
  }
  for (let y = step; y < h; y += step) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(w, y + 0.5);
  }
  ctx.stroke();

  // 4. Sweeping luminous optical ribbons
  ctx.save();
  const ribbon1 = ctx.createLinearGradient(0, h * 0.7, w, h * 0.18);
  ribbon1.addColorStop(0, "rgba(94, 234, 212, 0.05)");
  ribbon1.addColorStop(0.35, "rgba(110, 231, 183, 0.42)");
  ribbon1.addColorStop(0.68, "rgba(125, 211, 252, 0.42)");
  ribbon1.addColorStop(1, "rgba(167, 139, 250, 0.12)");
  ctx.strokeStyle = ribbon1;
  ctx.lineWidth = variant === "studio" ? 18 : 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-20, h * 0.72);
  ctx.bezierCurveTo(w * 0.28, h * 0.16, w * 0.62, h * 0.88, w + 20, h * 0.24);
  ctx.stroke();

  const ribbon2 = ctx.createLinearGradient(0, h * 0.22, w, h * 0.82);
  ribbon2.addColorStop(0, "rgba(167, 139, 250, 0.18)");
  ribbon2.addColorStop(0.5, "rgba(94, 234, 212, 0.34)");
  ribbon2.addColorStop(1, "rgba(251, 191, 36, 0.18)");
  ctx.strokeStyle = ribbon2;
  ctx.lineWidth = variant === "studio" ? 10 : 6;
  ctx.beginPath();
  ctx.moveTo(-20, h * 0.25);
  ctx.bezierCurveTo(w * 0.35, h * 0.78, w * 0.68, h * 0.15, w + 20, h * 0.78);
  ctx.stroke();

  // Crisp accent rings & typography landmarks in studio/hero for visible magnification
  if (variant === "studio") {
    ctx.strokeStyle = "rgba(94, 234, 212, 0.28)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w * 0.28, h * 0.5, Math.min(w, h) * 0.22, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = "rgba(167, 139, 250, 0.28)";
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.5, Math.min(w, h) * 0.24, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = "rgba(248, 250, 252, 0.16)";
    ctx.font = "800 34px ui-sans-serif, system-ui, -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SMARTSTOCK • LIQUID GLASS WEBGL", w * 0.5, h * 0.5);
  }
  ctx.restore();
}

export const LiquidGlassStage: React.FC<LiquidGlassStageProps> = ({
  children,
  className = "",
  backdropVariant = "hero",
  disableUserSelect = false,
  onFpsChange,
  stageKey = 0,
}) => {
  const { active, config } = useLiquidGlass();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bgCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const instanceRef = useRef<LiquidGlass | null>(null);
  const configRef = useRef<GlassConfig>(config);
  const onFpsChangeRef = useRef(onFpsChange);
  const [webglReady, setWebglReady] = useState(false);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    onFpsChangeRef.current = onFpsChange;
  }, [onFpsChange]);

  // Keep the Midnight Mist backdrop canvas sized cleanly to the stage container
  useEffect(() => {
    const root = rootRef.current;
    const canvas = bgCanvasRef.current;
    if (!root || !canvas) return;

    const redraw = () => {
      const rect = root.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      paintMidnightBackdrop(canvas, rect.width, rect.height, backdropVariant);
      instanceRef.current?.markChanged(canvas);
    };

    redraw();
    const ro = new ResizeObserver(() => redraw());
    ro.observe(root);
    return () => ro.disconnect();
  }, [backdropVariant, active]);

  // Initialize / tear down @ybouane/liquidglass WebGL orchestrator
  useEffect(() => {
    if (!active) return;

    const root = rootRef.current;
    if (!root) return;

    let disposed = false;
    let instance: LiquidGlass | null = null;
    let fpsTimer: number | null = null;

    const glassElements = Array.from(root.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && child.dataset.liquidGlass === "true"
    );

    if (glassElements.length === 0) return;

    LiquidGlass.init({
      root,
      glassElements,
      defaults: configRef.current,
      backgroundColor: "#080B10",
      disableUserSelect,
    })
      .then((inst) => {
        if (disposed) {
          inst.destroy();
          return;
        }
        instance = inst;
        instanceRef.current = inst;
        setWebglReady(true);
        if (onFpsChangeRef.current) {
          fpsTimer = window.setInterval(() => {
            onFpsChangeRef.current?.(inst.fps);
          }, 500);
        }
      })
      .catch((err) => {
        console.warn("SmartStock LiquidGlass fallback to CSS:", err);
        if (!disposed) setWebglReady(false);
      });

    return () => {
      disposed = true;
      if (fpsTimer !== null) window.clearInterval(fpsTimer);
      instanceRef.current = null;
      if (instance) {
        instance.destroy();
      }
      setWebglReady(false);
    };
  }, [active, disableUserSelect, stageKey]);

  const isStageReady = active && webglReady;

  return (
    <div
      ref={rootRef}
      data-liquid-stage-ready={isStageReady ? "true" : "false"}
      className={`liquid-glass-stage relative rounded-[26px] ${className}`}
    >
      <canvas
        ref={bgCanvasRef}
        aria-hidden="true"
        className="absolute inset-0 w-full h-full rounded-[26px] pointer-events-none z-0"
      />
      {children}
    </div>
  );
};

interface LiquidGlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  glassConfig?: Partial<GlassConfig>;
  fallbackClassName?: string;
}

/**
 * Direct child panel inside a <LiquidGlassStage>.
 * Automatically merges global Liquid Glass context settings with per-panel overrides
 * (such as `floating: true`, `button: true`, `bevelMode: 1`, `cornerRadius`) and
 * streams updates to WebGL via `data-config` without recreating the WebGL context.
 */
export const LiquidGlassPanel: React.FC<LiquidGlassPanelProps> = ({
  children,
  glassConfig,
  className = "",
  fallbackClassName = "liquid-glass-elevated",
  style,
  ...rest
}) => {
  const { active, config } = useLiquidGlass();

  const serializedConfig = useMemo(() => {
    const merged: Partial<GlassConfig> = {
      ...config,
      ...glassConfig,
    };
    return JSON.stringify(merged);
  }, [config, glassConfig]);

  return (
    <div
      data-liquid-glass="true"
      data-config={serializedConfig}
      className={`relative z-10 ${
        active ? "liquid-glass-webgl-panel" : fallbackClassName
      } ${className}`}
      style={{
        isolation: "isolate",
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
};
