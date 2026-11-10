import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Camera, X, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";
import { Product } from "../../types";

interface CameraBarcodeScannerModalProps {
  products: Product[];
  onProductScanned: (product: Product) => void;
  onClose: () => void;
  title?: string;
  autoAddToCart?: boolean;
}

export const CameraBarcodeScannerModal: React.FC<CameraBarcodeScannerModalProps> = ({
  products,
  onProductScanned,
  onClose,
  title = "Camera Barcode & QR Scanner",
  autoAddToCart = true,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(true);
  const [scannedResult, setScannedResult] = useState<{
    rawCode: string;
    product: Product | null;
    timestamp: number;
  } | null>(null);
  const [manualCode, setManualCode] = useState<string>("");
  const scanIntervalRef = useRef<any>(null);

  // Play pleasant scanner beep sound using Web Audio API
  const playBeep = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {
      // Audio not supported or blocked
    }
  };

  // Find product from raw scanned string (supports 1D barcode, SKU, or SmartStock QR product tag)
  const lookupProduct = (rawText: string): { product: Product | null; extractedCode: string } => {
    const cleanText = rawText.trim();

    // Check if raw text contains structured SmartStock tag
    // e.g. "Barcode: 8901030010041" or "Code: 8901030010041"
    const barcodeMatch = cleanText.match(/(?:Barcode|Code|SKU):\s*([A-Za-z0-9_-]+)/i);
    const candidateCode = barcodeMatch ? barcodeMatch[1].trim() : cleanText;

    // 1. Exact match on barcode or sku
    let match = products.find(
      (p) =>
        (p.barcode && p.barcode.toLowerCase() === candidateCode.toLowerCase()) ||
        (p.sku && p.sku.toLowerCase() === candidateCode.toLowerCase()) ||
        (p.barcode && cleanText.includes(p.barcode)) ||
        (p.sku && cleanText.includes(p.sku))
    );

    // 2. Exact match on name if contained
    if (!match) {
      match = products.find((p) => cleanText.toLowerCase().includes(p.name.toLowerCase()));
    }

    return { product: match || null, extractedCode: candidateCode };
  };

  const handleDetectedCode = (code: string) => {
    if (!code) return;
    const { product, extractedCode } = lookupProduct(code);
    playBeep();
    setScannedResult({
      rawCode: extractedCode,
      product: product,
      timestamp: Date.now(),
    });

    if (product) {
      onProductScanned(product);
    }
  };

  // Initialize camera stream
  useEffect(() => {
    let activeStream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        setCameraError(null);
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          throw new Error("Camera video access is not supported on this browser.");
        }

        const s = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });

        activeStream = s;
        setStream(s);

        if (videoRef.current) {
          videoRef.current.srcObject = s;
          videoRef.current.play().catch(() => {});
        }
      } catch (err: any) {
        console.warn("Camera start failed, falling back to manual barcode input:", err);
        setCameraError(
          err.name === "NotAllowedError"
            ? "Camera permission was denied. Please allow camera access or use the manual test scanner below."
            : "Could not open camera stream. You can test barcode scanning using the input below."
        );
      }
    };

    startCamera();

    return () => {
      if (activeStream) {
        activeStream.getTracks().forEach((t) => t.stop());
      }
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, []);

  // Barcode / QR Detection loop
  useEffect(() => {
    if (!videoRef.current || cameraError) return;

    // Check if BarcodeDetector is supported in browser
    const BarcodeDetectorClass = (window as any).BarcodeDetector;

    if (BarcodeDetectorClass) {
      const barcodeDetector = new BarcodeDetectorClass({
        formats: [
          "qr_code",
          "code_128",
          "code_39",
          "ean_13",
          "ean_8",
          "upc_a",
          "upc_e",
          "data_matrix",
        ],
      });

      scanIntervalRef.current = setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const barcodes = await barcodeDetector.detect(videoRef.current);
          if (barcodes && barcodes.length > 0) {
            const detectedValue = barcodes[0].rawValue;
            handleDetectedCode(detectedValue);
          }
        } catch {
          // Detection frame dropped
        }
      }, 300);
    }

    return () => {
      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
    };
  }, [cameraError, products]);

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleDetectedCode(manualCode.trim());
    setManualCode("");
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="liquid-modal max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh] text-[#F8FAFC]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#5EEAD4]/20 text-[#6EE7B7] border border-[#5EEAD4]/40 shadow-[0_0_12px_rgba(94,234,212,0.25)]">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#F8FAFC] flex items-center gap-1.5">
                <span>{title}</span>
                <span className="text-[10px] bg-[#6EE7B7]/20 text-[#6EE7B7] border border-[#5EEAD4]/40 px-1.5 py-0.5 rounded font-mono font-semibold shadow-[0_0_8px_rgba(94,234,212,0.25)]">
                  LIVE
                </span>
              </h2>
              <p className="text-[11px] text-[#A1AEBB]">
                Point camera at 1D barcode or 2D SmartStock QR tag
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg active:scale-[0.98]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Camera Viewport / Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Live Camera Viewfinder */}
          <div className="relative aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center shadow-inner">
            <video
              ref={videoRef}
              playsInline
              muted
              className="w-full h-full object-cover"
            />

            {/* Targeting Crosshair Overlay */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="w-56 h-36 border-2 border-[#5EEAD4]/80 rounded-2xl relative flex items-center justify-center shadow-[0_0_20px_rgba(94,234,212,0.35)]">
                {/* Mint/Teal Laser Sweep line */}
                <div className="absolute left-2 right-2 h-0.5 bg-[#6EE7B7] shadow-[0_0_10px_#5EEAD4] animate-pulse" />
                <div className="absolute top-1 left-2 text-[9px] font-mono text-[#6EE7B7] font-bold bg-[#080B10]/90 px-1.5 py-0.5 rounded border border-[#5EEAD4]/40">
                  ALIGN BARCODE / QR
                </div>
              </div>
            </div>

            {/* Camera Error / Fallback State */}
            {cameraError && (
              <div className="absolute inset-0 bg-[#080B10]/90 p-4 flex flex-col items-center justify-center text-center text-xs text-[#A1AEBB] space-y-2">
                <AlertCircle className="w-8 h-8 text-[#FBBF24] mb-1" />
                <p className="font-semibold text-[#F8FAFC]">{cameraError}</p>
                <p className="text-[11px] text-[#A1AEBB] max-w-xs">
                  You can type or test any product barcode below to view product details immediately:
                </p>
              </div>
            )}
          </div>

          {/* Scanned Result Card */}
          {scannedResult && (
            <div
              className={`p-3.5 rounded-xl border transition-all ${
                scannedResult.product
                  ? "bg-[#6EE7B7]/[0.08] border-[#5EEAD4]/35"
                  : "bg-[#FBBF24]/[0.08] border-[#FBBF24]/35"
              }`}
            >
              {scannedResult.product ? (
                <div>
                  <div className="flex items-start justify-between gap-2 border-b border-white/[0.1] pb-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-1 rounded-md bg-[#6EE7B7]/20 text-[#6EE7B7] border border-[#5EEAD4]/30">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-[#F8FAFC]">
                          {scannedResult.product.name}
                        </div>
                        <div className="text-[10.5px] text-[#A1AEBB]">
                          Unit: {scannedResult.product.unit} • Barcode:{" "}
                          <span className="font-mono font-semibold text-[#F8FAFC]">
                            {scannedResult.rawCode}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-black text-[#6EE7B7] tabular-nums">
                        ₹{scannedResult.product.selling_price.toFixed(2)}
                      </div>
                      <div className="text-[10.5px] text-[#A1AEBB] tabular-nums">
                        In Stock:{" "}
                        <strong className="text-[#F8FAFC]">
                          {scannedResult.product.current_stock}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <span className="text-[11px] text-[#6EE7B7] font-semibold flex items-center gap-1">
                      <Sparkles className="w-3.5 h-3.5" />
                      {autoAddToCart
                        ? "Product details loaded & added to cart!"
                        : "Product located in catalogue!"}
                    </span>
                    <button
                      type="button"
                      onClick={() => setScannedResult(null)}
                      className="px-2.5 py-1 text-[11px] font-bold rounded-lg liquid-btn-primary"
                    >
                      Scan Next Item
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-[#FBBF24] shrink-0" />
                    <div>
                      <div className="text-xs font-bold text-[#F8FAFC]">
                        Unknown Barcode: {scannedResult.rawCode}
                      </div>
                      <div className="text-[10.5px] text-[#FBBF24]">
                        This item code is not in your current catalog.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScannedResult(null)}
                    className="px-2.5 py-1 text-xs rounded-lg liquid-btn-secondary"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Quick Manual Code Tester */}
          <div>
            <form onSubmit={handleManualSubmit} className="flex gap-2">
              <input
                type="text"
                placeholder="Or type/test barcode or SKU here..."
                value={manualCode}
                onChange={(e) => setManualCode(e.target.value)}
                className="flex-1 px-3 py-2 text-xs liquid-input text-[#F8FAFC] font-mono"
              />
              <button
                type="submit"
                className="px-3.5 py-2 text-xs font-bold rounded-xl liquid-btn-primary active:scale-[0.98]"
              >
                Scan Code
              </button>
            </form>
          </div>

          {/* Quick-Pick Test Badges from Store Catalog */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
              Quick Test Codes from Store Catalogue:
            </div>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
              {products
                .filter((p) => p.barcode || p.sku)
                .slice(0, 8)
                .map((p) => {
                  const code = p.barcode || p.sku || "";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleDetectedCode(code)}
                      className="px-2 py-1 rounded-xl liquid-pill text-[10px] font-mono text-[#A1AEBB] hover:text-[#F8FAFC] hover:border-[#5EEAD4]/40 transition-colors"
                      title={`Test scan: ${p.name}`}
                    >
                      {p.name.slice(0, 14)}: <strong>{code}</strong>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/10 flex items-center justify-between">
          <div className="text-[11px] text-[#A1AEBB]">
            Catalog items: <strong className="text-[#F8FAFC]">{products.length}</strong>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-xl liquid-btn-secondary"
          >
            Done Scanning
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
