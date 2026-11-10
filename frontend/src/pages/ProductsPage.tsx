import React, { useState, useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  Package,
  Plus,
  Upload,
  Search,
  AlertTriangle,
  Archive,
  CheckCircle2,
  RefreshCw,
  Pencil,
  Tag,
  X,
  FolderPlus,
  Download,
  FileSpreadsheet,
  Camera,
  AlertCircle,
  Layers,
  ShieldCheck,
  Filter,
} from "lucide-react";
import { api } from "../services/api";
import { Product, Category } from "../types";
import { useLanguage } from "../context/LanguageContext";
import { BarcodeStickerModal } from "../components/BarcodeStickerModal";
import { CameraBarcodeScannerModal } from "../components/common/CameraBarcodeScannerModal";
import { KannadaText } from "../components/common/KannadaText";

type ViewTab = "CATALOGUE" | "CATEGORIES";
type StockStatusTab = "ALL" | "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

const toLocalISODate = (dateObj: Date): string => {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const SPECTRUM_DOT_STYLES = [
  "bg-[#5EEAD4]",
  "bg-[#7DD3FC]",
  "bg-[#A78BFA]",
  "bg-[#6EE7B7]",
  "bg-[#FBBF24]",
];

export const ProductsPage: React.FC = () => {
  const { t, language, formatMoney, tData } = useLanguage();
  const isKn = language === "kn";

  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<ViewTab>("CATALOGUE");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();
  const [stockFilter, setStockFilter] = useState<StockStatusTab>("ALL");
  const [showCameraScanner, setShowCameraScanner] = useState(false);

  // Create Product Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newProdName, setNewProdName] = useState("");
  const [newProdSku, setNewProdSku] = useState("");
  const [newProdBarcode, setNewProdBarcode] = useState("");
  const [newProdCategory, setNewProdCategory] = useState<number | undefined>();
  const [newProdUnit, setNewProdUnit] = useState("piece");
  const [newProdCost, setNewProdCost] = useState<string>("0");
  const [newProdPrice, setNewProdPrice] = useState<string>("");
  const [newProdStock, setNewProdStock] = useState<string>("0");
  const [newProdThreshold, setNewProdThreshold] = useState<string>("10");
  const [newProdTax, setNewProdTax] = useState<number>(0);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Product Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editProdName, setEditProdName] = useState("");
  const [editProdSku, setEditProdSku] = useState("");
  const [editProdBarcode, setEditProdBarcode] = useState("");
  const [editProdCategory, setEditProdCategory] = useState<number | undefined>();
  const [editProdUnit, setEditProdUnit] = useState("piece");
  const [editProdCost, setEditProdCost] = useState<string>("0");
  const [editProdPrice, setEditProdPrice] = useState<string>("0");
  const [editProdThreshold, setEditProdThreshold] = useState<string>("10");
  const [editProdTax, setEditProdTax] = useState<number>(0);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editModalError, setEditModalError] = useState<string | null>(null);

  // Create / Edit Category Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState("");
  const [catSection, setCatSection] = useState("Aisle 1");
  const [catDesc, setCatDesc] = useState("");
  const [catModalSubmitting, setCatModalSubmitting] = useState(false);
  const [catModalError, setCatModalError] = useState<string | null>(null);

  // CSV Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [previewResult, setPreviewResult] = useState<any>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccessResult, setImportSuccessResult] = useState<any>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Archive Confirm Modal State (replaces native confirm/alert)
  const [archiveTarget, setArchiveTarget] = useState<{
    type: "product" | "category";
    id: number;
    name: string;
  } | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  // Barcode Label Modal State
  const [selectedProductForStickers, setSelectedProductForStickers] = useState<Product | null>(null);

  // Debounce search so server queries don't spam per keystroke
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const loadData = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [prods, cats] = await Promise.all([
        api.getProducts({
          search: debouncedSearch || undefined,
          limit: 500,
        }),
        api.getCategories(),
      ]);
      setProducts(prods);
      setCategories(cats);
    } catch (err: any) {
      setPageError(err.message || "Failed to load products & categories");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [debouncedSearch]);

  // Derived Telemetry & Filtering
  const catalogueStats = useMemo(() => {
    let totalCostVal = 0;
    let totalRetailVal = 0;
    let inStockCount = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    products.forEach((p) => {
      const qty = Math.max(0, p.current_stock || 0);
      totalCostVal += qty * (p.purchase_cost || 0);
      totalRetailVal += qty * (p.selling_price || 0);

      if (p.current_stock <= 0) {
        outOfStockCount += 1;
      } else if (p.current_stock <= p.reorder_threshold) {
        lowStockCount += 1;
      } else {
        inStockCount += 1;
      }
    });

    const uniqueSections = new Set(categories.map((c) => c.section_name || "General")).size;

    return {
      totalSkus: products.length,
      inStockCount,
      lowStockCount,
      outOfStockCount,
      attentionCount: lowStockCount + outOfStockCount,
      totalCostVal,
      totalRetailVal,
      categoriesCount: categories.length,
      uniqueSections,
    };
  }, [products, categories]);

  // Category metrics computed from loaded catalogue
  const categoryStats = useMemo(() => {
    const map = new Map<number, { skuCount: number; totalUnits: number; costValue: number }>();
    products.forEach((p) => {
      if (!p.category_id) return;
      const prev = map.get(p.category_id) || { skuCount: 0, totalUnits: 0, costValue: 0 };
      const qty = Math.max(0, p.current_stock || 0);
      prev.skuCount += 1;
      prev.totalUnits += qty;
      prev.costValue += qty * (p.purchase_cost || 0);
      map.set(p.category_id, prev);
    });
    return map;
  }, [products]);

  const topCategoryBreakdown = useMemo(() => {
    return categories
      .map((cat) => {
        const st = categoryStats.get(cat.id);
        return {
          id: cat.id,
          name: cat.name,
          section: cat.section_name,
          skuCount: st?.skuCount ?? (cat.product_count || 0),
          costValue: st?.costValue ?? 0,
        };
      })
      .filter((c) => c.skuCount > 0)
      .sort((a, b) => b.skuCount - a.skuCount || b.costValue - a.costValue)
      .slice(0, 5);
  }, [categories, categoryStats]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (q) {
        const matchName = p.name.toLowerCase().includes(q);
        const matchSku = (p.sku || "").toLowerCase().includes(q);
        const matchBarcode = (p.barcode || "").toLowerCase().includes(q);
        const matchCat = (p.category_name || "").toLowerCase().includes(q);
        if (!matchName && !matchSku && !matchBarcode && !matchCat) return false;
      }
      if (selectedCategory && p.category_id !== selectedCategory) return false;

      if (stockFilter === "OUT_OF_STOCK" && p.current_stock > 0) return false;
      if (
        stockFilter === "LOW_STOCK" &&
        (p.current_stock <= 0 || p.current_stock > p.reorder_threshold)
      ) {
        return false;
      }
      if (stockFilter === "IN_STOCK" && p.current_stock <= p.reorder_threshold) return false;

      return true;
    });
  }, [products, search, selectedCategory, stockFilter]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.section_name.toLowerCase().includes(q) ||
        (c.description || "").toLowerCase().includes(q)
    );
  }, [categories, search]);

  const hasActiveFilters =
    search.trim() !== "" || selectedCategory !== undefined || stockFilter !== "ALL";

  const clearFilters = () => {
    setSearch("");
    setSelectedCategory(undefined);
    setStockFilter("ALL");
  };

  const handleExportCsv = async () => {
    setIsExporting(true);
    setPageError(null);
    try {
      const csvText = await api.exportProductsCsv();
      const blob = new Blob([csvText], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `smartstock_products_${toLocalISODate(new Date())}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setPageError(err.message || "Failed to export product catalogue");
    } finally {
      setIsExporting(false);
    }
  };

  const resetCreateForm = () => {
    setNewProdName("");
    setNewProdSku("");
    setNewProdBarcode("");
    setNewProdCategory(undefined);
    setNewProdUnit("piece");
    setNewProdCost("0");
    setNewProdPrice("");
    setNewProdStock("0");
    setNewProdThreshold("10");
    setNewProdTax(0);
    setModalError(null);
  };

  const handleCreateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);
    const costVal = Number(newProdCost) || 0;
    const priceVal = Number(newProdPrice);
    if (!newProdName.trim()) {
      setModalError("Please enter a valid product name.");
      return;
    }
    if (isNaN(priceVal) || priceVal < 0) {
      setModalError("Please enter a valid selling price.");
      return;
    }

    setCreateSubmitting(true);
    try {
      await api.createProduct({
        name: newProdName.trim(),
        sku: newProdSku.trim() || undefined,
        barcode: newProdBarcode.trim() || undefined,
        category_id: newProdCategory,
        unit: newProdUnit,
        purchase_cost: costVal,
        selling_price: priceVal,
        initial_stock: Number(newProdStock) || 0,
        reorder_threshold: Number(newProdThreshold) || 0,
        tax_rate_percent: Number(newProdTax) || 0,
      });
      setIsCreateModalOpen(false);
      resetCreateForm();
      await loadData();
    } catch (err: any) {
      setModalError(err.message || "Failed to create product");
    } finally {
      setCreateSubmitting(false);
    }
  };

  const openEditModal = (p: Product) => {
    setEditingProduct(p);
    setEditProdName(p.name);
    setEditProdSku(p.sku || "");
    setEditProdBarcode(p.barcode || "");
    setEditProdCategory(p.category_id);
    setEditProdUnit(p.unit);
    setEditProdCost(String(p.purchase_cost));
    setEditProdPrice(String(p.selling_price));
    setEditProdThreshold(String(p.reorder_threshold));
    setEditProdTax(p.tax_rate_percent);
    setEditModalError(null);
    setIsEditModalOpen(true);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setEditModalError(null);
    const priceVal = Number(editProdPrice);
    if (!editProdName.trim()) {
      setEditModalError("Product name is required.");
      return;
    }
    if (isNaN(priceVal) || priceVal < 0) {
      setEditModalError("Selling price must be 0 or greater.");
      return;
    }

    setEditSubmitting(true);
    try {
      await api.updateProduct(editingProduct.id, {
        name: editProdName.trim(),
        sku: editProdSku.trim() || undefined,
        barcode: editProdBarcode.trim() || undefined,
        category_id: editProdCategory || null,
        unit: editProdUnit,
        purchase_cost: Number(editProdCost) || 0,
        selling_price: priceVal,
        reorder_threshold: Number(editProdThreshold) || 0,
        tax_rate_percent: Number(editProdTax) || 0,
      });
      setIsEditModalOpen(false);
      setEditingProduct(null);
      await loadData();
    } catch (err: any) {
      setEditModalError(err.message || "Failed to update product");
    } finally {
      setEditSubmitting(false);
    }
  };

  const openCategoryCreateModal = () => {
    setEditingCategory(null);
    setCatName("");
    setCatSection("Aisle 1");
    setCatDesc("");
    setCatModalError(null);
    setIsCategoryModalOpen(true);
  };

  const openCategoryEditModal = (c: Category) => {
    setEditingCategory(c);
    setCatName(c.name);
    setCatSection(c.section_name || "General");
    setCatDesc(c.description || "");
    setCatModalError(null);
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) {
      setCatModalError("Category name is required.");
      return;
    }
    setCatModalSubmitting(true);
    setCatModalError(null);
    try {
      if (editingCategory) {
        await api.updateCategory(editingCategory.id, {
          name: catName.trim(),
          section_name: catSection.trim() || "General",
          description: catDesc.trim() || undefined,
        });
      } else {
        const created = await api.createCategory({
          name: catName.trim(),
          section_name: catSection.trim() || "General",
          description: catDesc.trim() || undefined,
        });
        if (isCreateModalOpen) setNewProdCategory(created.id);
        if (isEditModalOpen) setEditProdCategory(created.id);
      }
      await loadData();
      setIsCategoryModalOpen(false);
      setEditingCategory(null);
      setCatName("");
      setCatDesc("");
    } catch (err: any) {
      setCatModalError(err.message || "Failed to save category");
    } finally {
      setCatModalSubmitting(false);
    }
  };

  const handleConfirmArchive = async () => {
    if (!archiveTarget) return;
    setArchiving(true);
    setArchiveError(null);
    try {
      if (archiveTarget.type === "product") {
        await api.archiveProduct(archiveTarget.id);
      } else {
        await api.archiveCategory(archiveTarget.id);
        if (selectedCategory === archiveTarget.id) {
          setSelectedCategory(undefined);
        }
      }
      setArchiveTarget(null);
      await loadData();
    } catch (err: any) {
      setArchiveError(err.message || `Failed to archive ${archiveTarget.type}`);
    } finally {
      setArchiving(false);
    }
  };

  const handlePreviewCSV = async (file: File) => {
    setImportFile(file);
    setImportError(null);
    try {
      const res = await api.previewProductsCSV(file);
      setPreviewResult(res);
    } catch (err: any) {
      setImportError(err.message || "Failed to preview CSV file");
    }
  };

  const handleExecuteImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await api.executeProductsCSV(importFile);
      setImportSuccessResult(res);
      setPreviewResult(null);
      await loadData();
    } catch (err: any) {
      setImportError(err.message || "Failed to import CSV products");
    } finally {
      setImporting(false);
    }
  };

  const marginPreviewCreate = useMemo(() => {
    const c = Number(newProdCost) || 0;
    const p = Number(newProdPrice) || 0;
    if (p <= 0) return null;
    const margin = ((p - c) / p) * 100;
    return { profit: p - c, margin };
  }, [newProdCost, newProdPrice]);

  return (
    <div className="max-w-7xl mx-auto pb-2">
      {/* Unified Midnight Mist Liquid Glass Catalogue & Category Terminal */}
      <div className="rounded-[26px] bg-gradient-to-b from-[rgba(55,70,80,0.68)] via-[rgba(41,52,61,0.58)] to-[#080B10]/95 border border-white/[0.16] shadow-[0_30px_70px_-15px_rgba(0,0,0,0.95),0_0_40px_-5px_rgba(94,234,212,0.12)] relative overflow-hidden backdrop-blur-2xl">
        {/* Ambient diffuse glass highlights */}
        <div className="absolute -top-24 -left-24 w-72 h-72 bg-gradient-to-br from-[#5EEAD4]/14 to-transparent rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -right-24 w-72 h-72 bg-gradient-to-tl from-[#7DD3FC]/10 to-transparent rounded-full blur-3xl pointer-events-none" />

        {/* 1. Terminal Header & Primary Toolbar */}
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-4 px-5 sm:px-7 py-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-9 h-9 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shadow-[0_0_12px_rgba(94,234,212,0.25)] shrink-0">
              <Package className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-mono text-[#6EE7B7] tracking-wider uppercase font-semibold">
                  {t("navProducts")}
                </span>
                <span className="text-[10.5px] font-mono px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.12] text-[#A1AEBB] tabular-nums">
                  {catalogueStats.totalSkus} SKUs · {catalogueStats.categoriesCount}{" "}
                  {catalogueStats.categoriesCount === 1 ? "Category" : "Categories"}
                </span>
              </div>
              <p className="text-[11.5px] text-[#A1AEBB] mt-0.5">
                {isKn
                  ? "ಅಂಗಡಿ ವಸ್ತುಗಳ ಕ್ಯಾಟಲಾಗ್, ವಿಭಾಗಗಳು, ಬೆಲೆ, ಬಾರ್‌ಕೋಡ್ ಲೇಬಲ್ ಮತ್ತು ಕನಿಷ್ಠ ದಾಸ್ತಾನು ನಿರ್ವಹಣೆ"
                  : "Manage store SKUs, aisle sections, barcodes, wholesale margins & reorder thresholds"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={loadData}
              className="liquid-btn-secondary p-2 rounded-xl text-[#A1AEBB] hover:text-[#F8FAFC] shrink-0"
              title={t("refresh")}
              aria-label={t("refresh")}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-[#5EEAD4]" : ""}`} />
            </button>

            <button
              type="button"
              onClick={openCategoryCreateModal}
              className="liquid-btn-secondary px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <FolderPlus className="w-3.5 h-3.5 text-[#5EEAD4]" />
              <span>{isKn ? "+ ವರ್ಗ" : "+ Category"}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              disabled={isExporting}
              className="liquid-btn-secondary px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
              title="Download catalogue as Excel/CSV"
            >
              <Download className="w-3.5 h-3.5 text-[#7DD3FC]" />
              <span>{isExporting ? "Exporting..." : "Export"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setImportFile(null);
                setPreviewResult(null);
                setImportSuccessResult(null);
                setImportError(null);
                setIsImportModalOpen(true);
              }}
              className="liquid-btn-secondary px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Upload className="w-3.5 h-3.5 text-[#A78BFA]" />
              <span>Import CSV</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetCreateForm();
                setIsCreateModalOpen(true);
              }}
              className="liquid-btn-primary px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>{isKn ? "ಉತ್ಪನ್ನ ಸೇರಿಸಿ" : "Add Product"}</span>
            </button>
          </div>
        </div>

        {/* Workspace Mode Sub-bar (Catalogue vs Categories & Aisles) */}
        <div className="relative z-10 px-5 sm:px-7 pt-2.5 flex items-center justify-between border-b border-white/[0.08] bg-[#080B10]/20">
          <div className="flex items-center gap-6 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setActiveTab("CATALOGUE")}
              className={`pb-2.5 relative transition-all whitespace-nowrap ${
                activeTab === "CATALOGUE"
                  ? "text-[#F8FAFC] font-bold"
                  : "text-[#A1AEBB] hover:text-[#F8FAFC]"
              }`}
            >
              {isKn ? "ಉತ್ಪನ್ನಗಳ ಪಟ್ಟಿ" : "Catalogue"}
              <span className="ml-1.5 text-[10.5px] font-mono text-[#A1AEBB] tabular-nums">
                ({catalogueStats.totalSkus})
              </span>
              {activeTab === "CATALOGUE" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6EE7B7] rounded-full shadow-[0_0_8px_#5EEAD4]" />
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("CATEGORIES")}
              className={`pb-2.5 relative transition-all whitespace-nowrap ${
                activeTab === "CATEGORIES"
                  ? "text-[#F8FAFC] font-bold"
                  : "text-[#A1AEBB] hover:text-[#F8FAFC]"
              }`}
            >
              {isKn ? "ವರ್ಗಗಳು ಮತ್ತು ವಿಭಾಗಗಳು" : "Categories & Aisles"}
              <span className="ml-1.5 text-[10.5px] font-mono text-[#A1AEBB] tabular-nums">
                ({categories.length})
              </span>
              {activeTab === "CATEGORIES" && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#6EE7B7] rounded-full shadow-[0_0_8px_#5EEAD4]" />
              )}
            </button>
          </div>

          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10.5px] font-mono text-[#A1AEBB]/80 pb-2">
            <ShieldCheck className="w-3.5 h-3.5 text-[#5EEAD4]" />
            <span>Zero synthetic stock • Real-time GST &amp; barcode pricing</span>
          </span>
        </div>

        {/* 2. Cardless Architectural 4-Column KPI Telemetry Strip */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] border-b border-white/[0.08]">
          {/* Col 1: Active SKUs */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಸಕ್ರಿಯ ಉತ್ಪನ್ನಗಳು" : "Active Catalogue"}
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#6EE7B7] tabular-nums whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#6EE7B7]" />
                {catalogueStats.inStockCount} healthy
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {catalogueStats.totalSkus}{" "}
              <span className="text-xs font-medium text-[#A1AEBB]">
                {catalogueStats.totalSkus === 1 ? "SKU" : "SKUs"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>Low: {catalogueStats.lowStockCount}</span>
              <span className={catalogueStats.outOfStockCount > 0 ? "text-[#FB7185] font-semibold" : ""}>
                Out: {catalogueStats.outOfStockCount}
              </span>
            </div>
          </div>

          {/* Col 2: Stock Valuation (Cost vs Retail) */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ದಾಸ್ತಾನು ವೆಚ್ಚ ಮೌಲ್ಯ" : "Stock Value (Cost)"}
              </span>
              <span className="text-[11px] font-medium text-[#7DD3FC] whitespace-nowrap">
                Cost Basis
              </span>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {formatMoney(catalogueStats.totalCostVal)}
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>
                Retail Value:{" "}
                <strong className="text-[#7DD3FC] font-semibold">
                  {formatMoney(catalogueStats.totalRetailVal)}
                </strong>
              </span>
            </div>
          </div>

          {/* Col 3: Reorder Watchlist */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಕಡಿಮೆ ದಾಸ್ತಾನು ಎಚ್ಚರಿಕೆ" : "Reorder Attention"}
              </span>
              {catalogueStats.attentionCount > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("CATALOGUE");
                    setStockFilter(
                      catalogueStats.lowStockCount > 0 ? "LOW_STOCK" : "OUT_OF_STOCK"
                    );
                  }}
                  className="text-[11px] font-semibold text-[#FBBF24] hover:underline whitespace-nowrap"
                >
                  Inspect Alerts →
                </button>
              ) : (
                <span className="text-[11px] font-semibold text-[#6EE7B7]">Stock Optimal</span>
              )}
            </div>
            <div
              className={`text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums mt-2 ${
                catalogueStats.outOfStockCount > 0
                  ? "text-[#FB7185]"
                  : catalogueStats.lowStockCount > 0
                  ? "text-[#FBBF24]"
                  : "text-[#6EE7B7]"
              }`}
            >
              {catalogueStats.attentionCount}{" "}
              <span className="text-xs font-medium text-[#A1AEBB]">
                {catalogueStats.attentionCount === 1 ? "item" : "items"}
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB] tabular-nums">
              <span>{catalogueStats.lowStockCount} low buffer</span>
              <span className={catalogueStats.outOfStockCount > 0 ? "text-[#FB7185]" : ""}>
                {catalogueStats.outOfStockCount} depleted
              </span>
            </div>
          </div>

          {/* Col 4: Store Categories & Aisles */}
          <div className="px-5 sm:px-6 py-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.11em] text-[#A1AEBB] whitespace-nowrap">
                {isKn ? "ಅಂಗಡಿ ವರ್ಗಗಳು" : "Categories & Aisles"}
              </span>
              <button
                type="button"
                onClick={() =>
                  setActiveTab(activeTab === "CATALOGUE" ? "CATEGORIES" : "CATALOGUE")
                }
                className="text-[11px] font-semibold text-[#A78BFA] hover:underline whitespace-nowrap"
              >
                {activeTab === "CATALOGUE" ? "Manage Aisles →" : "View Catalogue →"}
              </button>
            </div>
            <div className="text-2xl sm:text-[28px] font-extrabold text-[#F8FAFC] tracking-tight tabular-nums mt-2">
              {catalogueStats.categoriesCount}{" "}
              <span className="text-xs font-medium text-[#A1AEBB]">
                across {catalogueStats.uniqueSections} aisles
              </span>
            </div>
            <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#A1AEBB]">
              <span>Shelf & section mapping</span>
              <span className="text-[#A78BFA] font-medium">Organized</span>
            </div>
          </div>
        </div>

        {/* 3. Integrated Category SKU Distribution Bar */}
        {topCategoryBreakdown.length > 0 && activeTab === "CATALOGUE" && (
          <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] bg-[#080B10]/20 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#A1AEBB]">
                {isKn ? "ಪ್ರಮುಖ ವರ್ಗಗಳ ಹಂಚಿಕೆ" : "Top Category Mix (Click to Filter)"}
              </span>
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                {topCategoryBreakdown.map((cat, idx) => {
                  const isFiltered = selectedCategory === cat.id;
                  const dotClass = SPECTRUM_DOT_STYLES[idx % SPECTRUM_DOT_STYLES.length];
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() =>
                        setSelectedCategory(isFiltered ? undefined : cat.id)
                      }
                      className={`inline-flex items-center gap-1.5 transition-opacity tabular-nums ${
                        selectedCategory !== undefined && !isFiltered
                          ? "opacity-45 hover:opacity-85"
                          : "opacity-100"
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                      <span className="text-[#A1AEBB] font-medium">
                        <KannadaText text={cat.name} />
                      </span>
                      <span className="text-[#F8FAFC] font-semibold">{cat.skuCount}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="h-1.5 w-full rounded-full bg-white/[0.06] overflow-hidden flex gap-px">
              {topCategoryBreakdown.map((cat, idx) => {
                const totalShown = topCategoryBreakdown.reduce((s, c) => s + c.skuCount, 0);
                const pct = totalShown > 0 ? (cat.skuCount / totalShown) * 100 : 0;
                const dotClass = SPECTRUM_DOT_STYLES[idx % SPECTRUM_DOT_STYLES.length];
                return (
                  <div
                    key={cat.id}
                    style={{ width: `${pct}%` }}
                    title={`${cat.name} (${cat.section}): ${cat.skuCount} SKUs`}
                    className={`h-full transition-all duration-500 ${dotClass}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* 4. Integrated Search, Stock Underline Tabs & Category Filter */}
        <div className="relative z-10 px-5 sm:px-7 py-3 border-b border-white/[0.08] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Search + Camera Scanner */}
          <div className="flex items-center gap-2 flex-1 lg:max-w-md">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[#A1AEBB]" />
              <input
                type="text"
                placeholder={
                  activeTab === "CATALOGUE"
                    ? isKn
                      ? "ಉತ್ಪನ್ನ, SKU ಅಥವಾ ಬಾರ್‌ಕೋಡ್ ಹುಡುಕಿ..."
                      : "Search by product name, SKU, or barcode..."
                    : isKn
                    ? "ವರ್ಗ ಅಥವಾ ವಿಭಾಗ ಹುಡುಕಿ..."
                    : "Search categories or shop aisles..."
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-1.5 rounded-xl bg-[#080B10]/70 border border-white/[0.12] text-xs text-[#F8FAFC] placeholder-[#A1AEBB]/60 focus:border-[#5EEAD4] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A1AEBB] hover:text-[#F8FAFC]"
                  aria-label="Clear product search"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {activeTab === "CATALOGUE" && (
              <button
                type="button"
                onClick={() => setShowCameraScanner(true)}
                className="liquid-btn-secondary p-1.5 rounded-xl text-[#6EE7B7] hover:border-[#5EEAD4]/40 shrink-0"
                title="Scan barcode with camera to locate product"
                aria-label="Scan barcode with camera"
              >
                <Camera className="w-4 h-4" />
              </button>
            )}
          </div>

          {activeTab === "CATALOGUE" && (
            <div className="flex flex-wrap items-center justify-between lg:justify-end gap-5">
              {/* Stock Filter Underline Tabs */}
              <div className="flex items-center gap-4 text-xs font-semibold">
                {(
                  [
                    { key: "ALL", label: isKn ? "ಎಲ್ಲಾ" : "All", count: catalogueStats.totalSkus },
                    { key: "IN_STOCK", label: isKn ? "ಲಭ್ಯ" : "In Stock", count: catalogueStats.inStockCount },
                    { key: "LOW_STOCK", label: isKn ? "ಕಡಿಮೆ" : "Low Stock", count: catalogueStats.lowStockCount },
                    { key: "OUT_OF_STOCK", label: isKn ? "ಖಾಲಿ" : "Out", count: catalogueStats.outOfStockCount },
                  ] as const
                ).map((tab) => {
                  const isActive = stockFilter === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setStockFilter(tab.key)}
                      className={`pb-1.5 relative transition-all whitespace-nowrap ${
                        isActive ? "text-[#F8FAFC] font-bold" : "text-[#A1AEBB] hover:text-[#F8FAFC]"
                      }`}
                    >
                      {tab.label}
                      <span className="ml-1 text-[10.5px] font-mono text-[#A1AEBB] tabular-nums">
                        ({tab.count})
                      </span>
                      {isActive && (
                        <span
                          className={`absolute bottom-0 left-0 right-0 h-0.5 rounded-full ${
                            tab.key === "OUT_OF_STOCK"
                              ? "bg-[#FB7185] shadow-[0_0_8px_#FB7185]"
                              : tab.key === "LOW_STOCK"
                              ? "bg-[#FBBF24] shadow-[0_0_8px_#FBBF24]"
                              : "bg-[#6EE7B7] shadow-[0_0_8px_#5EEAD4]"
                          }`}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Category Select */}
              <div className="flex items-center gap-2 shrink-0">
                <Filter className="w-3.5 h-3.5 text-[#A1AEBB]" />
                <select
                  value={selectedCategory || ""}
                  onChange={(e) =>
                    setSelectedCategory(e.target.value ? Number(e.target.value) : undefined)
                  }
                  aria-label="Filter by category"
                  className="px-3 py-1.5 bg-[#080B10]/80 border border-white/[0.12] rounded-xl text-xs font-medium text-[#F8FAFC] focus:border-[#5EEAD4] focus:outline-none focus:ring-2 focus:ring-[#5EEAD4]/20 transition-all"
                >
                  <option value="" className="bg-[#111722] text-[#F8FAFC]">
                    All Categories & Sections
                  </option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#111722] text-[#F8FAFC]">
                      {tData(c.section_name)} › {tData(c.name)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Page-level inline error banner */}
        {pageError && (
          <div className="relative z-10 px-5 sm:px-7 py-2.5 bg-[#FB7185]/12 border-b border-[#FB7185]/30 text-[#FB7185] text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{pageError}</span>
            </div>
            <button
              type="button"
              onClick={() => setPageError(null)}
              className="text-[#FB7185]/80 hover:text-[#FB7185]"
              aria-label="Dismiss error"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 5. Main Tab Body */}
        <div className="relative z-10">
          {loading ? (
            <div className="py-16 text-center text-[#A1AEBB] text-xs space-y-2.5">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-[#5EEAD4]" />
              <div>{t("loading")}</div>
            </div>
          ) : activeTab === "CATALOGUE" ? (
            filteredProducts.length === 0 ? (
              <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
                <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-[#5EEAD4]/35 flex items-center justify-center text-[#6EE7B7] shadow-[0_0_20px_rgba(94,234,212,0.12)] mb-3">
                  <Package className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-[#F8FAFC] tracking-tight">
                  {hasActiveFilters
                    ? "No Products Match Active Filters"
                    : "No Products in Store Catalogue"}
                </h3>
                <p className="text-xs text-[#A1AEBB] max-w-md mt-1.5 leading-relaxed">
                  {hasActiveFilters
                    ? "Adjust your search term, stock status tab, or category filter to inspect items."
                    : "Add individual store SKUs or bulk-import a spreadsheet CSV to start billing and tracking stock."}
                </p>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-medium bg-white/[0.04] border border-white/[0.08] text-[#A1AEBB] mt-3.5 mb-4">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#6EE7B7]" />
                  <span>Live Verified Inventory • Zero synthetic items</span>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2.5">
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="liquid-btn-secondary px-3.5 py-2 rounded-xl text-xs font-semibold"
                    >
                      Reset Filters
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsImportModalOpen(true)}
                    className="liquid-btn-secondary px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5"
                  >
                    <Upload className="w-3.5 h-3.5 text-[#A78BFA]" />
                    <span>Import CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      resetCreateForm();
                      setIsCreateModalOpen(true);
                    }}
                    className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Product</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#080B10]/35 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.1em]">
                    <tr>
                      <th className="px-4 sm:px-6 py-3">Product & Unit</th>
                      <th className="px-2.5 py-3 whitespace-nowrap">SKU / Barcode</th>
                      <th className="px-2.5 py-3">Section · Category</th>
                      <th className="px-2.5 py-3 text-right whitespace-nowrap">Cost & Margin</th>
                      <th className="px-2.5 py-3 text-right whitespace-nowrap">Selling Price</th>
                      <th className="px-2.5 py-3 text-right whitespace-nowrap">Stock Level</th>
                      <th className="px-2.5 py-3 text-center">Status</th>
                      <th className="px-4 sm:px-6 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredProducts.map((p) => {
                      const isOut = p.current_stock <= 0;
                      const isLow = !isOut && p.current_stock <= p.reorder_threshold;
                      const marginPct =
                        p.selling_price > 0
                          ? ((p.selling_price - p.purchase_cost) / p.selling_price) * 100
                          : 0;

                      return (
                        <tr
                          key={p.id}
                          className="border-l-2 border-l-transparent hover:border-l-[#5EEAD4]/75 hover:bg-white/[0.025] transition-all"
                        >
                          <td className="px-4 sm:px-6 py-3">
                            <div className="font-semibold text-[#F8FAFC] text-[13px] leading-snug">
                              <KannadaText text={p.name} />
                            </div>
                            <div className="text-[10.5px] text-[#A1AEBB] mt-0.5 flex items-center gap-1.5">
                              <span>
                                {isKn ? "ಪ್ರಮಾಣ:" : "Unit:"} <KannadaText text={p.unit} />
                              </span>
                            </div>
                          </td>

                          <td className="px-2.5 py-3 font-mono text-[11px] text-[#A1AEBB] tabular-nums whitespace-nowrap">
                            <div className="text-[#F8FAFC]/85">{p.sku || "—"}</div>
                            <div className="text-[10px] text-[#A1AEBB]/70">
                              {p.barcode || "No barcode"}
                            </div>
                          </td>

                          <td className="px-2.5 py-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-medium bg-white/[0.05] border border-white/[0.1] text-[#A1AEBB]">
                              <span className="text-[#7DD3FC]">
                                <KannadaText text={p.section_name || "General"} />
                              </span>
                              <span className="text-white/25">›</span>
                              <span className="text-[#F8FAFC]">
                                <KannadaText text={p.category_name || "General"} />
                              </span>
                            </span>
                          </td>

                          <td className="px-2.5 py-3 text-right whitespace-nowrap tabular-nums">
                            <div className="font-mono text-[#A1AEBB]">
                              {formatMoney(p.purchase_cost)}
                            </div>
                            {p.selling_price > 0 && p.purchase_cost > 0 && (
                              <div
                                className={`text-[10px] font-mono ${
                                  marginPct >= 15
                                    ? "text-[#6EE7B7]"
                                    : marginPct >= 0
                                    ? "text-[#7DD3FC]"
                                    : "text-[#FB7185]"
                                }`}
                              >
                                {marginPct.toFixed(1)}% margin
                              </div>
                            )}
                          </td>

                          <td className="px-2.5 py-3 text-right whitespace-nowrap tabular-nums">
                            <div className="font-mono font-bold text-[13px] text-[#F8FAFC]">
                              {formatMoney(p.selling_price)}
                            </div>
                            {p.tax_rate_percent > 0 && (
                              <div className="text-[10px] text-[#A1AEBB]/80">
                                GST {p.tax_rate_percent}%
                              </div>
                            )}
                          </td>

                          <td className="px-2.5 py-3 text-right whitespace-nowrap tabular-nums">
                            <div
                              className={`font-mono font-bold text-[13px] ${
                                isOut
                                  ? "text-[#FB7185]"
                                  : isLow
                                  ? "text-[#FBBF24]"
                                  : "text-[#6EE7B7]"
                              }`}
                            >
                              {p.current_stock} <KannadaText text={p.unit} />
                            </div>
                            <div className="text-[10px] text-[#A1AEBB]/75">
                              {isKn ? "ಕನಿಷ್ಠ:" : "Min:"} {p.reorder_threshold}
                            </div>
                          </td>

                          <td className="px-2.5 py-3 text-center whitespace-nowrap">
                            {isOut ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold bg-[#FB7185]/12 text-[#FB7185] border border-[#FB7185]/35">
                                {isKn ? "ಖಾಲಿಯಾಗಿದೆ (Out)" : "Out of Stock"}
                              </span>
                            ) : isLow ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold bg-[#FBBF24]/12 text-[#FBBF24] border border-[#FBBF24]/35">
                                {isKn ? "ಕಡಿಮೆ ದಾಸ್ತಾನು" : "Low Stock"}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[10.5px] font-bold bg-[#6EE7B7]/12 text-[#6EE7B7] border border-[#6EE7B7]/35">
                                {isKn ? "ಲಭ್ಯವಿದೆ" : "In Stock"}
                              </span>
                            )}
                          </td>

                          <td className="px-4 sm:px-6 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => setSelectedProductForStickers(p)}
                                title="Generate & Print Barcode / Price Sticker"
                                aria-label={`Print barcode stickers for ${p.name}`}
                                className="p-1.5 rounded-lg text-[#6EE7B7]/85 hover:text-[#6EE7B7] hover:bg-[#5EEAD4]/10 transition-colors"
                              >
                                <Tag className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditModal(p)}
                                title="Edit Product & Pricing"
                                aria-label={`Edit ${p.name}`}
                                className="p-1.5 rounded-lg text-[#A1AEBB] hover:text-[#7DD3FC] hover:bg-[#7DD3FC]/10 transition-colors"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setArchiveError(null);
                                  setArchiveTarget({
                                    type: "product",
                                    id: p.id,
                                    name: p.name,
                                  });
                                }}
                                title="Archive Product"
                                aria-label={`Archive ${p.name}`}
                                className="p-1.5 rounded-lg text-[#A1AEBB]/70 hover:text-[#FB7185] hover:bg-[#FB7185]/10 transition-colors"
                              >
                                <Archive className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          ) : /* Categories & Aisles Ledger View */
          filteredCategories.length === 0 ? (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center">
              <div className="w-11 h-11 rounded-full bg-white/[0.04] border border-[#5EEAD4]/35 flex items-center justify-center text-[#6EE7B7] mb-3">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-sm font-bold text-[#F8FAFC]">
                {search.trim() ? "No Categories Match Search" : "No Categories Created Yet"}
              </h3>
              <p className="text-xs text-[#A1AEBB] max-w-md mt-1.5">
                Group SKUs by store aisle, shelf, or category to streamline POS browsing and category profit reports.
              </p>
              <button
                type="button"
                onClick={openCategoryCreateModal}
                className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 mt-4"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                <span>Create First Category</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#080B10]/35 border-b border-white/[0.08] text-[10.5px] text-[#A1AEBB] font-semibold uppercase tracking-[0.1em]">
                  <tr>
                    <th className="px-5 sm:px-7 py-3">Store Aisle / Section</th>
                    <th className="px-4 py-3">Category Name</th>
                    <th className="px-4 py-3">Notes / Description</th>
                    <th className="px-4 py-3 text-right">Linked SKUs</th>
                    <th className="px-4 py-3 text-right">Units On Shelf</th>
                    <th className="px-4 py-3 text-right">Stock Valuation</th>
                    <th className="px-5 sm:px-7 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.06]">
                  {filteredCategories.map((c) => {
                    const stats = categoryStats.get(c.id);
                    const skuCount = stats?.skuCount ?? (c.product_count || 0);
                    return (
                      <tr
                        key={c.id}
                        className="border-l-2 border-l-transparent hover:border-l-[#5EEAD4]/75 hover:bg-white/[0.025] transition-all"
                      >
                        <td className="px-5 sm:px-7 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10.5px] font-semibold bg-[#7DD3FC]/12 text-[#7DD3FC] border border-[#7DD3FC]/30">
                            <KannadaText text={c.section_name || "General"} />
                          </span>
                        </td>
                        <td className="px-4 py-3 font-semibold text-[#F8FAFC] text-[13px]">
                          <KannadaText text={c.name} />
                        </td>
                        <td className="px-4 py-3 text-[#A1AEBB] max-w-xs truncate">
                          {c.description || "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-[#F8FAFC] tabular-nums">
                          {skuCount}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-[#A1AEBB] tabular-nums">
                          {(stats?.totalUnits || 0).toLocaleString("en-IN", {
                            maximumFractionDigits: 1,
                          })}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-semibold text-[#6EE7B7] tabular-nums">
                          {formatMoney(stats?.costValue || 0)}
                        </td>
                        <td className="px-5 sm:px-7 py-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCategory(c.id);
                                setActiveTab("CATALOGUE");
                              }}
                              className="liquid-btn-secondary px-2.5 py-1 rounded-lg text-[11px] font-semibold text-[#7DD3FC]"
                            >
                              View SKUs
                            </button>
                            <button
                              type="button"
                              onClick={() => openCategoryEditModal(c)}
                              title="Edit Category"
                              aria-label={`Edit category ${c.name}`}
                              className="p-1.5 rounded-lg text-[#A1AEBB] hover:text-[#7DD3FC] hover:bg-[#7DD3FC]/10 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setArchiveError(null);
                                setArchiveTarget({
                                  type: "category",
                                  id: c.id,
                                  name: c.name,
                                });
                              }}
                              title="Archive Category"
                              aria-label={`Archive category ${c.name}`}
                              className="p-1.5 rounded-lg text-[#A1AEBB]/70 hover:text-[#FB7185] hover:bg-[#FB7185]/10 transition-colors"
                            >
                              <Archive className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Create Product Modal (Portalled) */}
      {isCreateModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="liquid-modal max-w-lg w-full p-6 text-[#F8FAFC] space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <Plus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">Add New Product SKU</h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Register pricing, tax slab, and opening stock balance.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg transition-colors"
                  aria-label="Close create product modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleCreateProduct} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newProdName}
                    onChange={(e) => setNewProdName(e.target.value)}
                    placeholder="e.g. Byadgi Chilli Powder 500g"
                    className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4] focus:ring-2 focus:ring-[#5EEAD4]/20"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      SKU Code
                    </label>
                    <input
                      type="text"
                      value={newProdSku}
                      onChange={(e) => setNewProdSku(e.target.value)}
                      placeholder="CHILLI-500G"
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/50 font-mono focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Barcode
                    </label>
                    <input
                      type="text"
                      value={newProdBarcode}
                      onChange={(e) => setNewProdBarcode(e.target.value)}
                      placeholder="890123456789"
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/50 font-mono focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB]">
                        Category & Section
                      </label>
                      <button
                        type="button"
                        onClick={openCategoryCreateModal}
                        className="text-[11px] text-[#6EE7B7] hover:underline flex items-center gap-0.5 font-semibold"
                      >
                        <Plus className="w-3 h-3" /> Quick Add
                      </button>
                    </div>
                    <select
                      value={newProdCategory || ""}
                      onChange={(e) =>
                        setNewProdCategory(e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4]"
                    >
                      <option value="" className="bg-[#111722] text-[#F8FAFC]">
                        Uncategorized
                      </option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#111722] text-[#F8FAFC]">
                          {tData(c.section_name)} - {tData(c.name)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Unit of Measure
                    </label>
                    <select
                      value={newProdUnit}
                      onChange={(e) => setNewProdUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4]"
                    >
                      <option value="piece" className="bg-[#111722]">Piece (pc)</option>
                      <option value="kg" className="bg-[#111722]">Kilogram (kg)</option>
                      <option value="g" className="bg-[#111722]">Gram (g)</option>
                      <option value="packet" className="bg-[#111722]">Packet (pkt)</option>
                      <option value="l" className="bg-[#111722]">Liter (L)</option>
                      <option value="box" className="bg-[#111722]">Box</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Cost Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={newProdCost}
                      onChange={(e) => setNewProdCost(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB]">
                        Selling Price (₹) *
                      </label>
                      {marginPreviewCreate && (
                        <span
                          className={`text-[10px] font-mono font-semibold ${
                            marginPreviewCreate.margin >= 0 ? "text-[#6EE7B7]" : "text-[#FB7185]"
                          }`}
                        >
                          {marginPreviewCreate.margin.toFixed(1)}% margin
                        </span>
                      )}
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={newProdPrice}
                      onChange={(e) => setNewProdPrice(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] font-mono font-bold tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Opening Stock
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={newProdStock}
                      onChange={(e) => setNewProdStock(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Min Threshold
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newProdThreshold}
                      onChange={(e) => setNewProdThreshold(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      GST Rate %
                    </label>
                    <select
                      value={newProdTax}
                      onChange={(e) => setNewProdTax(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4]"
                    >
                      <option value="0" className="bg-[#111722]">0% (Exempt)</option>
                      <option value="5" className="bg-[#111722]">5% GST</option>
                      <option value="12" className="bg-[#111722]">12% GST</option>
                      <option value="18" className="bg-[#111722]">18% GST</option>
                      <option value="28" className="bg-[#111722]">28% GST</option>
                    </select>
                  </div>
                </div>

                <div className="pt-3 flex justify-end gap-2.5 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(false)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createSubmitting}
                    className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {createSubmitting ? "Saving..." : "Save Product"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Edit Product Modal (Portalled) */}
      {isEditModalOpen &&
        editingProduct &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="liquid-modal max-w-lg w-full p-6 text-[#F8FAFC] space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#7DD3FC]/40 text-[#7DD3FC] flex items-center justify-center shrink-0">
                    <Pencil className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-[#F8FAFC] truncate">
                      Edit Product: {editingProduct.name}
                    </h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Update barcode, shelf category, pricing & reorder level.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingProduct(null);
                  }}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close edit product modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {editModalError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{editModalError}</span>
                </div>
              )}

              <form onSubmit={handleUpdateProduct} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Product Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={editProdName}
                    onChange={(e) => setEditProdName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      SKU Code
                    </label>
                    <input
                      type="text"
                      value={editProdSku}
                      onChange={(e) => setEditProdSku(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] font-mono focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Barcode
                    </label>
                    <input
                      type="text"
                      value={editProdBarcode}
                      onChange={(e) => setEditProdBarcode(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] font-mono focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB]">
                        Category & Section
                      </label>
                      <button
                        type="button"
                        onClick={openCategoryCreateModal}
                        className="text-[11px] text-[#6EE7B7] hover:underline flex items-center gap-0.5 font-semibold"
                      >
                        <Plus className="w-3 h-3" /> Quick Add
                      </button>
                    </div>
                    <select
                      value={editProdCategory || ""}
                      onChange={(e) =>
                        setEditProdCategory(e.target.value ? Number(e.target.value) : undefined)
                      }
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4]"
                    >
                      <option value="" className="bg-[#111722]">Uncategorized</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id} className="bg-[#111722]">
                          {tData(c.section_name)} - {tData(c.name)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Unit of Measure
                    </label>
                    <select
                      value={editProdUnit}
                      onChange={(e) => setEditProdUnit(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4]"
                    >
                      <option value="piece" className="bg-[#111722]">Piece (pc)</option>
                      <option value="kg" className="bg-[#111722]">Kilogram (kg)</option>
                      <option value="g" className="bg-[#111722]">Gram (g)</option>
                      <option value="packet" className="bg-[#111722]">Packet (pkt)</option>
                      <option value="l" className="bg-[#111722]">Liter (L)</option>
                      <option value="box" className="bg-[#111722]">Box</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Cost Price (₹)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editProdCost}
                      onChange={(e) => setEditProdCost(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Selling Price (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editProdPrice}
                      onChange={(e) => setEditProdPrice(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] font-mono font-bold tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      Min Threshold Alert
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={editProdThreshold}
                      onChange={(e) => setEditProdThreshold(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] font-mono tabular-nums focus:outline-none focus:border-[#5EEAD4]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                      GST Rate %
                    </label>
                    <select
                      value={editProdTax}
                      onChange={(e) => setEditProdTax(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] focus:outline-none focus:border-[#5EEAD4]"
                    >
                      <option value="0" className="bg-[#111722]">0% (Nil / Exempt)</option>
                      <option value="5" className="bg-[#111722]">5% (Essentials)</option>
                      <option value="12" className="bg-[#111722]">12% (Standard)</option>
                      <option value="18" className="bg-[#111722]">18% (General Goods)</option>
                      <option value="28" className="bg-[#111722]">28% (Luxury / Aerated)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditModalOpen(false);
                      setEditingProduct(null);
                    }}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={editSubmitting}
                    className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {editSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* CSV Import Modal (Portalled) */}
      {isImportModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="liquid-modal max-w-2xl w-full p-6 text-[#F8FAFC] space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#A78BFA]/40 text-[#A78BFA] flex items-center justify-center shrink-0">
                    <Upload className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">Import Products via CSV</h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Bulk upload store catalogue items with schema validation preview.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setPreviewResult(null);
                    setImportSuccessResult(null);
                    setImportError(null);
                  }}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close CSV import modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {importError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}

              {importSuccessResult ? (
                <div className="p-4 rounded-xl bg-[#6EE7B7]/[0.08] border border-[#6EE7B7]/35 text-xs space-y-2">
                  <div className="font-bold flex items-center gap-2 text-sm text-[#6EE7B7]">
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Import Completed Successfully</span>
                  </div>
                  <div className="text-[#F8FAFC] tabular-nums">
                    Imported: <strong>{importSuccessResult.imported_count}</strong> products · Rejected:{" "}
                    <strong>{importSuccessResult.rejected_count}</strong> rows
                  </div>
                  {importSuccessResult.rejected_rows?.length > 0 && (
                    <div className="mt-2 p-2.5 bg-[#080B10]/70 rounded-xl border border-white/[0.1] text-[11px] max-h-32 overflow-y-auto">
                      <div className="font-semibold text-[#FB7185] mb-1">Rejected Rows:</div>
                      {importSuccessResult.rejected_rows.map((r: any, idx: number) => (
                        <div key={idx} className="text-[#A1AEBB]">
                          Row {r.row_number}: {r.reason}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setIsImportModalOpen(false);
                        setImportSuccessResult(null);
                      }}
                      className="liquid-btn-primary px-4 py-2 rounded-xl text-xs font-bold"
                    >
                      Done
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 text-xs">
                  {/* Sample Store Template Box */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-[#6EE7B7]/[0.06] border border-[#5EEAD4]/30 rounded-xl">
                    <div>
                      <div className="font-bold text-[#F8FAFC] flex items-center gap-1.5">
                        <FileSpreadsheet className="w-4 h-4 text-[#6EE7B7]" />
                        <span>
                          {isKn ? "ಮಾದರಿ ಅಂಗಡಿ ಕ್ಯಾಟಲಾಗ್ (CSV)" : "Sample Real Store Catalogue (CSV)"}
                        </span>
                      </div>
                      <div className="text-[11px] text-[#A1AEBB] mt-0.5">
                        {isKn
                          ? "25 ನಿಜವಾದ ದಿನಸಿ ವಸ್ತುಗಳ ಬೆಲೆ ಮತ್ತು ದಾಸ್ತಾನು ವಿವರಗಳನ್ನು ಒಳಗೊಂಡಿದೆ."
                          : "Includes 25 popular Indian Kirana items with barcodes, prices, and stock."}
                      </div>
                    </div>
                    <a
                      href="/smartstock_sample_store_catalogue.csv"
                      download="smartstock_sample_store_catalogue.csv"
                      className="liquid-btn-primary px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap self-start sm:self-auto"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>{isKn ? "ಮಾದರಿ ಡೌನ್‌ಲೋಡ್" : "Download Sample"}</span>
                    </a>
                  </div>

                  <p className="text-[#A1AEBB] leading-relaxed">
                    Upload a CSV file containing columns:{" "}
                    <code className="text-[#7DD3FC]">name</code>,{" "}
                    <code className="text-[#7DD3FC]">selling_price</code>,{" "}
                    <code className="text-[#7DD3FC]">purchase_cost</code>,{" "}
                    <code className="text-[#7DD3FC]">sku</code>,{" "}
                    <code className="text-[#7DD3FC]">barcode</code>,{" "}
                    <code className="text-[#7DD3FC]">category</code>,{" "}
                    <code className="text-[#7DD3FC]">section</code>,{" "}
                    <code className="text-[#7DD3FC]">unit</code>,{" "}
                    <code className="text-[#7DD3FC]">initial_stock</code>.
                  </p>

                  <div className="border-2 border-dashed border-white/[0.16] rounded-xl p-5 text-center bg-[#080B10]/50 hover:border-[#5EEAD4]/50 transition-colors">
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => e.target.files?.[0] && handlePreviewCSV(e.target.files[0])}
                      className="block w-full text-xs text-[#A1AEBB] file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border file:border-[#5EEAD4]/40 file:text-xs file:font-semibold file:bg-[#5EEAD4]/15 file:text-[#6EE7B7] hover:file:bg-[#5EEAD4]/25 cursor-pointer"
                    />
                  </div>

                  {/* Validation Preview */}
                  {previewResult && (
                    <div className="space-y-3 pt-1">
                      <div className="flex items-center justify-between font-bold text-xs tabular-nums">
                        <span className="text-[#F8FAFC]">
                          Total Parsed: {previewResult.total_parsed} rows
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-[#6EE7B7]">
                            Valid: {previewResult.valid_count}
                          </span>
                          <span className="text-[#FB7185]">
                            Rejected: {previewResult.rejected_count}
                          </span>
                        </div>
                      </div>

                      <div className="max-h-48 overflow-y-auto border border-white/[0.12] rounded-xl bg-[#080B10]/60">
                        <table className="w-full text-[11px] divide-y divide-white/[0.08]">
                          <thead className="bg-[#111722] text-[#A1AEBB]">
                            <tr>
                              <th className="p-2 text-left">Product</th>
                              <th className="p-2 text-left">Category</th>
                              <th className="p-2 text-right">Cost</th>
                              <th className="p-2 text-right">Price</th>
                              <th className="p-2 text-right">Initial Stock</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/[0.06]">
                            {previewResult.valid_preview.map((r: any, idx: number) => (
                              <tr key={idx}>
                                <td className="p-2 font-semibold text-[#F8FAFC]">{r.name}</td>
                                <td className="p-2 text-[#A1AEBB]">{r.category_name}</td>
                                <td className="p-2 text-right font-mono text-[#A1AEBB]">
                                  ₹{r.purchase_cost}
                                </td>
                                <td className="p-2 text-right font-mono font-bold text-[#F8FAFC]">
                                  ₹{r.selling_price}
                                </td>
                                <td className="p-2 text-right font-mono text-[#6EE7B7]">
                                  {r.initial_stock} {r.unit}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      <button
                        type="button"
                        onClick={handleExecuteImport}
                        disabled={importing || previewResult.valid_count === 0}
                        className="liquid-btn-primary w-full py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                      >
                        <span>
                          {importing
                            ? "Importing Records..."
                            : `Confirm & Import ${previewResult.valid_count} Products`}
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* Create / Edit Category Modal (Portalled) */}
      {isCategoryModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto">
            <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#080B10] border border-[#5EEAD4]/40 text-[#6EE7B7] flex items-center justify-center shrink-0">
                    <FolderPlus className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">
                      {editingCategory ? "Edit Category & Section" : "Add Category & Section"}
                    </h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5">
                      Map shelf sections and group retail SKUs cleanly.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close category modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {catModalError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{catModalError}</span>
                </div>
              )}

              <form onSubmit={handleSaveCategory} className="space-y-3.5 text-xs">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Category Name *
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    placeholder="e.g. Grains, Atta & Dals or Cold Drinks"
                    value={catName}
                    onChange={(e) => setCatName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Store Section / Shelf / Aisle
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Aisle 1 - Staples or Refrigerator 2"
                    value={catSection}
                    onChange={(e) => setCatSection(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[#A1AEBB] mb-1.5">
                    Description (Optional)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Notes about products in this category..."
                    value={catDesc}
                    onChange={(e) => setCatDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#080B10]/85 border border-white/[0.14] text-[#F8FAFC] placeholder-[#A1AEBB]/50 focus:outline-none focus:border-[#5EEAD4]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setIsCategoryModalOpen(false)}
                    className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={catModalSubmitting}
                    className="liquid-btn-primary px-5 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                  >
                    {catModalSubmitting
                      ? "Saving..."
                      : editingCategory
                      ? "Save Changes"
                      : "Create Category"}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* Archive Confirmation Modal (Replaces native confirm/alert, Portalled) */}
      {archiveTarget &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-[#080B10]/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="liquid-modal max-w-md w-full p-6 text-[#F8FAFC] space-y-4">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#FB7185]/15 border border-[#FB7185]/40 text-[#FB7185] flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-[#F8FAFC]">
                      Archive {archiveTarget.type === "product" ? "Product" : "Category"}
                    </h3>
                    <p className="text-[11px] text-[#A1AEBB] mt-0.5 truncate max-w-[260px]">
                      {archiveTarget.name}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setArchiveTarget(null)}
                  className="p-1 text-[#A1AEBB] hover:text-[#F8FAFC] rounded-lg"
                  aria-label="Close archive dialog"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[#A1AEBB] leading-relaxed">
                {archiveTarget.type === "product"
                  ? `Archive '${archiveTarget.name}'? It will be hidden from POS and active stock lists while preserving historical invoice & ledger records.`
                  : `Archive category '${archiveTarget.name}'? Existing products remain intact and historical invoices are unaffected.`}
              </p>

              {archiveError && (
                <div className="p-2.5 rounded-xl bg-[#FB7185]/12 border border-[#FB7185]/35 text-[#FB7185] text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{archiveError}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={() => setArchiveTarget(null)}
                  className="liquid-btn-secondary px-4 py-2 rounded-xl text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmArchive}
                  disabled={archiving}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-[#FB7185] text-[#080B10] hover:bg-[#FB7185]/90 transition-colors disabled:opacity-50"
                >
                  {archiving ? "Archiving..." : "Confirm Archive"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Barcode & Price Tag Generator Modal (Portalled) */}
      {selectedProductForStickers && (
        <BarcodeStickerModal
          product={selectedProductForStickers}
          onClose={() => setSelectedProductForStickers(null)}
        />
      )}

      {/* Live Camera Barcode Scanner to Find Product (Portalled) */}
      {showCameraScanner && (
        <CameraBarcodeScannerModal
          products={products}
          title="Scan Product to Locate in Catalogue"
          autoAddToCart={false}
          onProductScanned={(p) => {
            setActiveTab("CATALOGUE");
            setSearch(p.name);
            setShowCameraScanner(false);
          }}
          onClose={() => setShowCameraScanner(false)}
        />
      )}
    </div>
  );
};
