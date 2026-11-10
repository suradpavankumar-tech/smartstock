import React, { useState } from "react";
import { createPortal } from "react-dom";
import { X, Printer, Tag, Sparkles, Layers, Smartphone } from "lucide-react";
import { Product } from "../types";
import { generateBarcodeSvg } from "../utils/barcodeGenerator";
import { qrCodeSvgDataUrl } from "../utils/qrCode";
import { useAuth } from "../context/AuthContext";

interface BarcodeStickerModalProps {
  product: Product;
  onClose: () => void;
}

const getLocalTodayISO = () => {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const BarcodeStickerModal: React.FC<BarcodeStickerModalProps> = ({
  product,
  onClose,
}) => {
  const { currentBusiness } = useAuth();
  const storeName = currentBusiness?.name || "Haveri Kirana & General Stores";

  // Label configuration
  const [packWeight, setPackWeight] = useState<string>(product.unit === "kg" ? "1 kg" : product.unit);
  const [mrp, setMrp] = useState<number>(Math.round(product.selling_price * 1.15) || product.selling_price);
  const [ourPrice, setOurPrice] = useState<number>(product.selling_price);
  const [quantityToPrint, setQuantityToPrint] = useState<number>(10);
  const [stickerFormat, setStickerFormat] = useState<"thermal_50x25" | "sheet_a4">("thermal_50x25");
  const [tagType, setTagType] = useState<"dual" | "qr_only" | "barcode_only">("dual");
  const [packedDate, setPackedDate] = useState<string>(getLocalTodayISO());

  // Barcode value to encode (barcode or SKU or fallback)
  const barcodeValue = product.barcode || product.sku || `SK-${product.id.toString().padStart(6, "0")}`;

  // Generate Code128 barcode data for laser scanners
  const barcode = generateBarcodeSvg(barcodeValue, {
    height: 38,
    moduleWidth: 1.6,
    showText: true,
  });

  // Generate Smart 2D QR Code data for Smartphone Cameras (Google Lens, iPhone Camera, Android Camera)
  const smartProductTagText = `SMARTSTOCK PRODUCT
${product.name}
Store: ${storeName}
Price: Rs.${ourPrice.toFixed(2)} (MRP: Rs.${mrp.toFixed(2)})
Net Wt: ${packWeight}
Barcode: ${barcodeValue}
Pkd: ${packedDate}`;

  let qrDataUrl = "";
  try {
    qrDataUrl = qrCodeSvgDataUrl(smartProductTagText);
  } catch {
    qrDataUrl = qrCodeSvgDataUrl(`Product: ${product.name}\nPrice: Rs.${ourPrice}\nBarcode: ${barcodeValue}`);
  }

  const savings = Math.max(0, mrp - ourPrice);

  const handlePrint = () => {
    window.print();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
      {/* Print Stylesheet injected dynamically */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #printable-stickers-area, #printable-stickers-area * {
            visibility: visible;
          }
          #printable-stickers-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            background: white !important;
          }
          .no-print {
            display: none !important;
          }
          .thermal-page-break {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>

      <div className="liquid-modal max-w-2xl w-full flex flex-col max-h-[92vh] overflow-hidden no-print text-[#F8FAFC]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[#5EEAD4]/20 text-[#6EE7B7] border border-[#5EEAD4]/40 shadow-[0_0_12px_rgba(94,234,212,0.25)]">
              <Tag className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#F8FAFC]">
                Barcode & Price Tag Generator
              </h2>
              <p className="text-xs text-[#A1AEBB]">
                Generate and print scannable barcode labels for loose & repackaged goods
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

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Top Options Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tag Type Selector: Dual, QR Only, Barcode Only */}
            <div className="sm:col-span-2 bg-[#080B10]/55 p-3.5 rounded-xl border border-white/[0.1]">
              <label className="block text-[11px] font-bold text-[#A1AEBB] uppercase tracking-wider mb-2.5 flex items-center justify-between">
                <span>Barcode & Scannable Label Type</span>
                <span className="text-[10.5px] text-[#6EE7B7] font-semibold normal-case tracking-normal">
                  {tagType === "dual" ? "Laser Scanner + Smartphone Camera" : tagType === "qr_only" ? "Smartphone Camera Only" : "POS Laser Only"}
                </span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTagType("dual")}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    tagType === "dual"
                      ? "border-[#5EEAD4]/60 bg-[#5EEAD4]/[0.12] shadow-[0_0_16px_rgba(94,234,212,0.18)]"
                      : "border-white/[0.1] bg-[#080B10]/50 hover:border-white/[0.22]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#F8FAFC]">
                    <Sparkles className="w-3.5 h-3.5 text-[#6EE7B7]" />
                    <span>Dual Smart Tag</span>
                  </div>
                  <div className="text-[10px] text-[#A1AEBB] mt-1">
                    1D Laser Barcode + Smartphone QR Code (Recommended)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTagType("qr_only")}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    tagType === "qr_only"
                      ? "border-[#7DD3FC]/60 bg-[#7DD3FC]/[0.12] shadow-[0_0_16px_rgba(125,211,252,0.18)]"
                      : "border-white/[0.1] bg-[#080B10]/50 hover:border-white/[0.22]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#F8FAFC]">
                    <Smartphone className="w-3.5 h-3.5 text-[#7DD3FC]" />
                    <span>Smart Mobile QR</span>
                  </div>
                  <div className="text-[10px] text-[#A1AEBB] mt-1">
                    Any phone scans & shows product details
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTagType("barcode_only")}
                  className={`p-2.5 rounded-xl border text-left flex flex-col justify-between transition-all ${
                    tagType === "barcode_only"
                      ? "border-[#A78BFA]/60 bg-[#A78BFA]/[0.12] shadow-[0_0_16px_rgba(167,139,250,0.18)]"
                      : "border-white/[0.1] bg-[#080B10]/50 hover:border-white/[0.22]"
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-bold text-xs text-[#F8FAFC]">
                    <Tag className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>1D Laser Barcode</span>
                  </div>
                  <div className="text-[10px] text-[#A1AEBB] mt-1">
                    Classic Code128 for counter barcode scanners
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                Product & Repack Weight
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={packWeight}
                  onChange={(e) => setPackWeight(e.target.value)}
                  placeholder="e.g. 500g / 1 kg"
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                />
                <button
                  type="button"
                  onClick={() => setPackWeight("500g")}
                  className={`px-2.5 py-1 text-xs rounded-xl border font-semibold transition-all ${
                    packWeight === "500g"
                      ? "bg-[#5EEAD4]/15 border-[#5EEAD4]/45 text-[#6EE7B7]"
                      : "border-white/[0.12] bg-[#080B10]/50 text-[#A1AEBB] hover:text-[#F8FAFC]"
                  }`}
                >
                  500g
                </button>
                <button
                  type="button"
                  onClick={() => setPackWeight("1 kg")}
                  className={`px-2.5 py-1 text-xs rounded-xl border font-semibold transition-all ${
                    packWeight === "1 kg"
                      ? "bg-[#5EEAD4]/15 border-[#5EEAD4]/45 text-[#6EE7B7]"
                      : "border-white/[0.12] bg-[#080B10]/50 text-[#A1AEBB] hover:text-[#F8FAFC]"
                  }`}
                >
                  1kg
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                Print Format
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStickerFormat("thermal_50x25")}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                    stickerFormat === "thermal_50x25"
                      ? "border-[#5EEAD4]/55 bg-[#5EEAD4]/[0.14] text-[#6EE7B7]"
                      : "border-white/[0.12] bg-[#080B10]/50 text-[#A1AEBB] hover:text-[#F8FAFC]"
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>50x25mm Roll</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStickerFormat("sheet_a4")}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border flex items-center justify-center gap-1.5 transition-all ${
                    stickerFormat === "sheet_a4"
                      ? "border-[#5EEAD4]/55 bg-[#5EEAD4]/[0.14] text-[#6EE7B7]"
                      : "border-white/[0.12] bg-[#080B10]/50 text-[#A1AEBB] hover:text-[#F8FAFC]"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>A4 Sheet (24)</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                MRP (Printed Max Price)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#A1AEBB]">₹</span>
                <input
                  type="number"
                  step="0.5"
                  value={mrp}
                  onChange={(e) => setMrp(parseFloat(e.target.value) || 0)}
                  className="w-full pl-7 pr-3 py-2 text-xs rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                Our Store Offer Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#6EE7B7] font-bold">₹</span>
                <input
                  type="number"
                  step="0.5"
                  value={ourPrice}
                  onChange={(e) => setOurPrice(parseFloat(e.target.value) || 0)}
                  className="w-full pl-7 pr-3 py-2 text-xs font-bold rounded-xl border border-[#5EEAD4]/50 bg-[#080B10]/85 text-[#6EE7B7] tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                Number of Stickers
              </label>
              <div className="flex gap-1.5">
                {[5, 10, 20, 50].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setQuantityToPrint(num)}
                    className={`px-2.5 py-1.5 text-xs rounded-xl border font-semibold tabular-nums transition-all ${
                      quantityToPrint === num
                        ? "bg-[#5EEAD4] text-[#080B10] border-transparent font-bold"
                        : "border-white/[0.12] bg-[#080B10]/50 text-[#A1AEBB] hover:text-[#F8FAFC]"
                    }`}
                  >
                    {num}
                  </button>
                ))}
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={quantityToPrint}
                  onChange={(e) => setQuantityToPrint(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-16 px-2 py-1.5 text-xs text-center rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                Packing Date
              </label>
              <input
                type="date"
                value={packedDate}
                onChange={(e) => setPackedDate(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl border border-white/[0.14] bg-[#080B10]/85 text-[#F8FAFC] tabular-nums [color-scheme:dark] focus:outline-none focus:border-[#5EEAD4]"
              />
            </div>
          </div>

          {/* Live Sticker Preview Card (Inner paper stays crisp white to match physical label) */}
          <div className="border border-white/[0.1] rounded-2xl p-4 bg-[#080B10]/65">
            <div className="text-[11px] font-bold text-[#A1AEBB] uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Live Thermal Sticker Preview (50mm x 25mm)</span>
              <span className="text-[#6EE7B7] font-semibold lowercase">laser & phone camera ready</span>
            </div>

            <div className="flex flex-col items-center gap-3">
              {/* Single Sample Sticker (explicit hex colors bypass global dark-theme utility overrides) */}
              <div className="w-[300px] bg-[#FFFFFF] text-[#0F172A] rounded-lg p-3 shadow-md border border-[#CBD5E1] font-sans flex flex-col justify-between">
                <div className="border-b border-dashed border-[#CBD5E1] pb-1 flex justify-between items-start">
                  <div className="leading-tight">
                    <div className="font-extrabold text-[12px] text-[#0F172A] truncate max-w-[200px]">
                      {product.name}
                    </div>
                    <div className="text-[10px] text-[#475569] font-medium">
                      Net Wt: <span className="font-bold text-[#1E293B]">{packWeight}</span> • {storeName}
                    </div>
                  </div>
                  {savings > 0 && (
                    <span className="bg-[#059669] text-[#FFFFFF] font-black text-[9px] px-1.5 py-0.5 rounded uppercase tracking-tighter">
                      Save ₹{savings.toFixed(0)}
                    </span>
                  )}
                </div>

                {/* Price Bar */}
                <div className="flex items-baseline justify-between my-1 px-0.5">
                  <div className="text-[10px] text-[#64748B] line-through">
                    MRP: ₹{mrp.toFixed(2)}
                  </div>
                  <div className="text-[15px] font-black text-[#020617] tracking-tight">
                    ₹{ourPrice.toFixed(2)}
                  </div>
                </div>

                {/* Barcode / QR Visual Representation */}
                {tagType === "dual" && (
                  <div className="flex items-center justify-between gap-2 mt-0.5">
                    <div className="flex-1 min-w-0 flex flex-col items-center">
                      <svg
                        viewBox={barcode.viewBox}
                        className="w-full h-8"
                        preserveAspectRatio="none"
                        shapeRendering="crispEdges"
                      >
                        <path d={barcode.svgPath} fill="#000000" />
                      </svg>
                      <div className="text-[8px] font-mono tracking-wider text-[#334155] font-bold mt-0.5 truncate">
                        {barcodeValue}
                      </div>
                    </div>
                    <div className="flex flex-col items-center shrink-0 border-l border-[#E2E8F0] pl-2">
                      <img
                        src={qrDataUrl}
                        alt="Product Details QR"
                        className="w-11 h-11 object-contain"
                      />
                      <span className="text-[7px] font-bold text-[#475569] uppercase mt-0.5 tracking-tighter">
                        📱 Phone Scan
                      </span>
                    </div>
                  </div>
                )}

                {tagType === "qr_only" && (
                  <div className="flex items-center justify-center gap-3 my-1">
                    <img
                      src={qrDataUrl}
                      alt="Product Details QR"
                      className="w-14 h-14 object-contain"
                    />
                    <div className="text-left text-[9px] text-[#475569]">
                      <div className="font-bold text-[#0F172A]">Phone Camera Scannable:</div>
                      <div>• Shows instant product card</div>
                      <div>• Name, Price, Net Weight</div>
                      <div className="font-mono text-[8px] font-bold mt-0.5 text-[#334155]">
                        {barcodeValue}
                      </div>
                    </div>
                  </div>
                )}

                {tagType === "barcode_only" && (
                  <div className="flex flex-col items-center">
                    <svg
                      viewBox={barcode.viewBox}
                      className="w-full h-9"
                      preserveAspectRatio="none"
                      shapeRendering="crispEdges"
                    >
                      <path d={barcode.svgPath} fill="#000000" />
                    </svg>
                    <div className="text-[9px] font-mono tracking-widest text-[#334155] font-bold mt-0.5">
                      {barcodeValue}
                    </div>
                  </div>
                )}

                <div className="text-[8px] text-[#64748B] text-center border-t border-dashed border-[#E2E8F0] pt-0.5 mt-0.5">
                  Pkd: {packedDate} • Incl. All Taxes
                </div>
              </div>

              {/* Phone Camera Verification Pill */}
              <div className="text-center text-[11px] text-[#A1AEBB] bg-[#111722]/90 px-3.5 py-1.5 rounded-full border border-white/[0.12] flex items-center gap-2">
                <Smartphone className="w-3.5 h-3.5 text-[#6EE7B7] shrink-0" />
                <span>
                  <strong className="text-[#F8FAFC]">Scan Test:</strong> Point your phone camera (Google Lens or Camera app) at the QR code above to preview details live.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-white/10 flex items-center justify-between">
          <div className="text-xs text-[#A1AEBB]">
            Total Labels to Print: <strong className="text-[#F8FAFC]">{quantityToPrint}</strong>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl liquid-pill text-[#A1AEBB] hover:text-[#F8FAFC] active:scale-[0.98]"
            >
              Cancel
            </button>
            <button
              onClick={handlePrint}
              className="px-5 py-2 text-xs font-bold rounded-xl liquid-btn-primary flex items-center gap-2 shadow-md active:scale-[0.98]"
            >
              <Printer className="w-4 h-4" />
              <span>Print {quantityToPrint} Labels</span>
            </button>
          </div>
        </div>
      </div>

      {/* Hidden Container Rendered ONLY during window.print() */}
      <div id="printable-stickers-area" className="hidden print:block">
        {stickerFormat === "thermal_50x25" ? (
          // Continuous 50mm x 25mm rolls with page breaks
          <div>
            {Array.from({ length: quantityToPrint }).map((_, idx) => (
              <div
                key={idx}
                className="thermal-page-break"
                style={{
                  width: "50mm",
                  height: "25mm",
                  boxSizing: "border-box",
                  padding: "1.5mm 2mm",
                  fontFamily: "Arial, sans-serif",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  overflow: "hidden",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "0.5px dashed #666", paddingBottom: "1px" }}>
                  <div>
                    <div style={{ fontSize: "7pt", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "34mm" }}>
                      {product.name}
                    </div>
                    <div style={{ fontSize: "5pt", color: "#444" }}>
                      Net: <strong>{packWeight}</strong> • {storeName.slice(0, 18)}
                    </div>
                  </div>
                  {savings > 0 && (
                    <div style={{ fontSize: "5pt", fontWeight: "bold", background: "#000", color: "#fff", padding: "1px 2px", borderRadius: "1px" }}>
                      -₹{savings.toFixed(0)}
                    </div>
                  )}
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", margin: "1px 0" }}>
                  <span style={{ fontSize: "6pt", textDecoration: "line-through", color: "#666" }}>
                    MRP: ₹{mrp.toFixed(0)}
                  </span>
                  <span style={{ fontSize: "9pt", fontWeight: "900" }}>
                    ₹{ourPrice.toFixed(0)}
                  </span>
                </div>

                {/* Print Layout: Dual (1D + QR), QR Only, or Barcode Only */}
                {tagType === "dual" ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                      <svg
                        viewBox={barcode.viewBox}
                        style={{ width: "100%", height: "6mm" }}
                        preserveAspectRatio="none"
                        shapeRendering="crispEdges"
                      >
                        <path d={barcode.svgPath} fill="#000000" />
                      </svg>
                      <div style={{ fontSize: "4.5pt", fontFamily: "monospace", fontWeight: "bold" }}>
                        {barcodeValue}
                      </div>
                    </div>
                    <div style={{ textAlign: "center", borderLeft: "0.5px solid #ccc", paddingLeft: "1mm" }}>
                      <img src={qrDataUrl} alt="QR" style={{ width: "8mm", height: "8mm" }} />
                    </div>
                  </div>
                ) : tagType === "qr_only" ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3mm" }}>
                    <img src={qrDataUrl} alt="QR" style={{ width: "9mm", height: "9mm" }} />
                    <div style={{ fontSize: "5pt", color: "#333", textAlign: "left" }}>
                      <div>Scan on Phone</div>
                      <div style={{ fontFamily: "monospace", fontWeight: "bold" }}>{barcodeValue}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <svg
                      viewBox={barcode.viewBox}
                      style={{ width: "100%", height: "7mm" }}
                      preserveAspectRatio="none"
                      shapeRendering="crispEdges"
                    >
                      <path d={barcode.svgPath} fill="#000000" />
                    </svg>
                    <div style={{ fontSize: "5.5pt", fontFamily: "monospace", letterSpacing: "1px", fontWeight: "bold" }}>
                      {barcodeValue}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          // A4 3x8 Sheet Grid (24 labels per sheet)
          <div
            style={{
              width: "210mm",
              boxSizing: "border-box",
              padding: "10mm 8mm",
              display: "grid",
              gridTemplateColumns: "repeat(3, 63mm)",
              gridAutoRows: "33mm",
              gap: "2mm",
            }}
          >
            {Array.from({ length: quantityToPrint }).map((_, idx) => (
              <div
                key={idx}
                style={{
                  border: "0.5px dotted #ccc",
                  padding: "2mm",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <div style={{ fontSize: "8pt", fontWeight: "bold", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "45mm" }}>
                    {product.name}
                  </div>
                  <span style={{ fontSize: "6pt", fontWeight: "bold" }}>{packWeight}</span>
                </div>

                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: "7pt", textDecoration: "line-through", color: "#888" }}>MRP ₹{mrp.toFixed(0)}</span>
                  <span style={{ fontSize: "11pt", fontWeight: "bold" }}>₹{ourPrice.toFixed(0)}</span>
                </div>

                {tagType === "dual" ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "2mm" }}>
                    <div style={{ flex: 1, minWidth: 0, textAlign: "center" }}>
                      <svg
                        viewBox={barcode.viewBox}
                        style={{ width: "100%", height: "8mm" }}
                        preserveAspectRatio="none"
                        shapeRendering="crispEdges"
                      >
                        <path d={barcode.svgPath} fill="#000000" />
                      </svg>
                      <div style={{ fontSize: "5.5pt", fontFamily: "monospace", letterSpacing: "1px" }}>
                        {barcodeValue}
                      </div>
                    </div>
                    <div style={{ textAlign: "center", borderLeft: "0.5px solid #ccc", paddingLeft: "1.5mm" }}>
                      <img src={qrDataUrl} alt="QR" style={{ width: "10mm", height: "10mm" }} />
                    </div>
                  </div>
                ) : tagType === "qr_only" ? (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "3mm" }}>
                    <img src={qrDataUrl} alt="QR" style={{ width: "11mm", height: "11mm" }} />
                    <div style={{ fontSize: "6pt", color: "#333", textAlign: "left" }}>
                      <div>Mobile Scannable Tag</div>
                      <div style={{ fontFamily: "monospace", fontWeight: "bold" }}>{barcodeValue}</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: "center" }}>
                    <svg
                      viewBox={barcode.viewBox}
                      style={{ width: "100%", height: "10mm" }}
                      preserveAspectRatio="none"
                      shapeRendering="crispEdges"
                    >
                      <path d={barcode.svgPath} fill="#000000" />
                    </svg>
                    <div style={{ fontSize: "6.5pt", fontFamily: "monospace", letterSpacing: "1px" }}>
                      {barcodeValue}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
