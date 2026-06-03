"use client";
// ============================================================
// VoltERP — ELECTRONICS MART IMS
// Stock Module Page: Stock Overview, Stock Details, Transfers,
// Opening Stock, Batch Master, Valuation
// Theme: Deep Navy Blue (#0a1628, #132240) with accent blue (#2563eb)
// Footer: Developed & Copyright by NextGen Digital Studio
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Shield, X, Package, BarChart3, Truck, AlertTriangle,
  ArrowLeftRight, Eye, TrendingUp, Clock, Warehouse, Boxes,
  Calculator, ChevronDown, ChevronRight, FileBarChart,
  CalendarDays, BadgeDollarSign, CircleDollarSign, Info,
  Loader2, Layers, Archive, AlertCircle, CheckCircle2,
  ArrowRightLeft, DollarSign, Percent, Hash,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF, exportToCSV, importFromCSV, getVatMaskedKeys,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const bdCurrencyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${bdCurrencyFmt.format(Number(v))}`;
};

const fmtDate = (d: string | Date) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtPercent = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `${Number(v).toFixed(2)}%`;
};

const safeNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
};

async function apiFetch(path: string, opts?: RequestInit) {
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.user?.email) authHeaders["X-User-Email"] = parsed.user.email;
    }
  } catch {}
  const res = await fetch(path, { headers: { ...authHeaders, ...opts?.headers }, ...opts });
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem("ems_auth"); window.location.reload(); }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function vatMask(val: any, isVatAuditor: boolean) {
  if (isVatAuditor) return "N/A (Audit Mode)";
  return val;
}

// ============================================================
// STATUS BADGE STYLES
// ============================================================

const STATUS_BADGE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "In-Transit": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Posted: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Reversed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Expired: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Depleted: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  Recalled: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const STOCK_STATUS_BADGE: Record<string, string> = {
  "In Stock": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "Low Stock": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Out of Stock": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const SOURCE_TYPE_BADGE: Record<string, string> = {
  "Purchase Order": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Sales Order": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "Hire Sales": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "Sales Return": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "Purchase Return": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Replacement: "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  Transfer: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <Badge className={`${cls} border-0 text-xs font-medium`}>{status}</Badge>;
}

function StockStatusBadge({ status }: { status: string }) {
  const cls = STOCK_STATUS_BADGE[status] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <Badge className={`${cls} border-0 text-xs font-medium`}>{status}</Badge>;
}

function SourceTypeBadge({ source }: { source: string }) {
  const cls = SOURCE_TYPE_BADGE[source] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <Badge className={`${cls} border-0 text-xs font-medium`}>{source}</Badge>;
}

// ============================================================
// STAT CARD COMPONENT
// ============================================================

function StatCard({ label, value, icon: Icon, color, bg }: {
  label: string; value: any; icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <Card className="border-slate-200 dark:border-slate-700">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{label}</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white truncate">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================
// ACCESS DENIED COMPONENT
// ============================================================

function AccessDenied({ message }: { message?: string }) {
  return (
    <Card className="border-red-200 dark:border-red-800">
      <CardContent className="p-12 text-center">
        <Shield className="h-12 w-12 mx-auto text-red-400 mb-4" />
        <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">403 — Access Restricted</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
          {message || "You do not have permission to view this module."}
        </p>
      </CardContent>
    </Card>
  );
}

// ============================================================
// LOADING SPINNER
// ============================================================

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <Loader2 className="h-8 w-8 animate-spin text-[#2563eb]" />
      <span className="ml-3 text-slate-500 dark:text-slate-400">Loading...</span>
    </div>
  );
}

// ============================================================
// EMPTY STATE
// ============================================================

function EmptyState({ icon: Icon, message }: { icon: React.ElementType; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
      <Icon className="h-12 w-12 mb-3" />
      <p className="text-sm">{message}</p>
    </div>
  );
}

// ============================================================
// PROPS
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface StockModulePageProps {
  currentPage: string;
  isVatAuditor?: boolean;
  userRole?: UserRole;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function StockModulePage({ currentPage, isVatAuditor: propVat, userRole: propRole }: StockModulePageProps) {
  const { toast } = useToast();
  const isVatAuditor = propVat ?? false;
  const userRole = propRole ?? "admin";
  const isAdmin = userRole === "admin" || userRole === "manager";
  const isSR = userRole === "sr";
  const isDealer = userRole === "dealer";

  // ─── Tab Mapping ───
  const tabMap: Record<string, string> = {
    "stock": "stock",
    "stock-details": "stock-details",
    "stock-transfers": "stock-transfers",
    "opening-stock": "opening-stock",
    "batch-master": "batch-master",
    "valuation": "valuation",
  };
  const [activeTab, setActiveTab] = useState(tabMap[currentPage] || "stock");

  useEffect(() => {
    const mapped = tabMap[currentPage];
    if (mapped && mapped !== activeTab) setActiveTab(mapped);
  }, [currentPage]);

  // ─── Shared Dropdowns ───
  const [companies, setCompanies] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);

  const loadDropdowns = useCallback(async () => {
    try { const r = await apiFetch("/api/companies"); setCompanies(Array.isArray(r) ? r : []); } catch {}
    try { const r = await apiFetch("/api/products"); setProducts(Array.isArray(r) ? r : []); } catch {}
    try { const r = await apiFetch("/api/godowns"); setGodowns(Array.isArray(r) ? r : []); } catch {}
    try { const r = await apiFetch("/api/categories"); setCategories(Array.isArray(r) ? r : []); } catch {}
  }, []);

  useEffect(() => { loadDropdowns(); }, [loadDropdowns]);

  // ============================================================
  // TAB 1: STOCK OVERVIEW STATE
  // ============================================================

  const [stockData, setStockData] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockSearch, setStockSearch] = useState("");
  const [stockFilterGodown, setStockFilterGodown] = useState("all");
  const [stockFilterCategory, setStockFilterCategory] = useState("all");
  const [stockFilterStatus, setStockFilterStatus] = useState("all");
  const [stockExpandedRows, setStockExpandedRows] = useState<Set<string>>(new Set());

  const loadStock = useCallback(async () => {
    setStockLoading(true);
    try {
      const params = new URLSearchParams();
      if (stockFilterGodown && stockFilterGodown !== "all") params.set("godownId", stockFilterGodown);
      if (stockFilterCategory && stockFilterCategory !== "all") params.set("categoryId", stockFilterCategory);
      if (stockFilterStatus && stockFilterStatus !== "all") params.set("status", stockFilterStatus);
      const qs = params.toString();
      const res = await apiFetch(`/api/stock${qs ? `?${qs}` : ""}`);
      setStockData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setStockLoading(false); }
  }, [toast, stockFilterGodown, stockFilterCategory, stockFilterStatus]);

  const stockStats = useMemo(() => ({
    totalProducts: stockData.length,
    inStock: stockData.filter(s => s.stockStatus === "In Stock").length,
    lowStock: stockData.filter(s => s.stockStatus === "Low Stock").length,
    outOfStock: stockData.filter(s => s.stockStatus === "Out of Stock").length,
    totalValue: isVatAuditor ? "N/A (Audit Mode)" : stockData.reduce((s, i) => s + safeNum(i.stockValue), 0),
    totalBatches: batches.length,
  }), [stockData, batches, isVatAuditor]);

  const stockFiltered = useMemo(() => {
    let data = stockData;
    if (stockSearch) {
      const q = stockSearch.toLowerCase();
      data = data.filter(s =>
        (s.productCode || "").toLowerCase().includes(q) ||
        (s.productName || "").toLowerCase().includes(q) ||
        (s.category || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [stockData, stockSearch]);

  const toggleStockExpand = useCallback((id: string) => {
    setStockExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ============================================================
  // TAB 2: STOCK DETAILS STATE
  // ============================================================

  const [sdSelectedProduct, setSdSelectedProduct] = useState("");
  const [sdData, setSdData] = useState<any[]>([]);
  const [sdSummary, setSdSummary] = useState<any>(null);
  const [sdProductInfo, setSdProductInfo] = useState<any>(null);
  const [sdLoading, setSdLoading] = useState(false);
  const [sdDateFrom, setSdDateFrom] = useState("");
  const [sdDateTo, setSdDateTo] = useState("");

  const loadStockDetails = useCallback(async (productId: string) => {
    if (!productId) { setSdData([]); setSdSummary(null); setSdProductInfo(null); return; }
    setSdLoading(true);
    try {
      const params = new URLSearchParams({ productId });
      if (sdDateFrom) params.set("from", sdDateFrom);
      if (sdDateTo) params.set("to", sdDateTo);
      const res = await apiFetch(`/api/stock-details?${params.toString()}`);
      if (res?.product) {
        setSdProductInfo(res.product);
        setSdData(res.entries || []);
        setSdSummary(res.summary || null);
      } else if (Array.isArray(res?.products)) {
        // No product selected yet, just product list
        setSdData([]);
        setSdSummary(null);
        setSdProductInfo(null);
      } else {
        setSdData(Array.isArray(res) ? res : []);
        setSdSummary(null);
        setSdProductInfo(null);
      }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSdLoading(false); }
  }, [toast, sdDateFrom, sdDateTo]);

  useEffect(() => {
    if (activeTab === "stock-details" && sdSelectedProduct) {
      loadStockDetails(sdSelectedProduct);
    }
  }, [activeTab, sdSelectedProduct, sdDateFrom, sdDateTo, loadStockDetails]);

  // ============================================================
  // TAB 3: STOCK TRANSFERS STATE
  // ============================================================

  const [trnData, setTrnData] = useState<any[]>([]);
  const [trnLoading, setTrnLoading] = useState(true);
  const [trnSearch, setTrnSearch] = useState("");
  const [trnStatusFilter, setTrnStatusFilter] = useState("all");
  const [trnShippingFilter, setTrnShippingFilter] = useState("all");
  const [trnDialog, setTrnDialog] = useState(false);
  const [trnEdit, setTrnEdit] = useState<any>(null);
  const [trnSaving, setTrnSaving] = useState(false);
  const [trnDelete, setTrnDelete] = useState<any>(null);
  const [trnForm, setTrnForm] = useState<Record<string, any>>({
    fromGodownId: "", toGodownId: "", date: new Date().toISOString().split("T")[0], status: "Pending", notes: "",
  });
  const [trnLines, setTrnLines] = useState<any[]>([{ productId: "", quantity: 1, batchId: "" }]);
  const [trnExpandedRows, setTrnExpandedRows] = useState<Set<string>>(new Set());

  const loadTransfers = useCallback(async () => {
    setTrnLoading(true);
    try {
      const res = await apiFetch("/api/transfers");
      setTrnData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setTrnLoading(false); }
  }, [toast]);

  const trnStats = useMemo(() => {
    const active = trnData.filter(t => t.isActive !== false);
    return {
      total: active.length,
      pendingApproval: active.filter(t => t.status === "Pending").length,
      inTransit: active.filter(t => t.shippingStatus === "In-Transit" || t.status === "In-Transit").length,
      delivered: active.filter(t => t.shippingStatus === "Delivered" || t.status === "Delivered").length,
      cancelled: active.filter(t => t.status === "Cancelled").length,
    };
  }, [trnData]);

  const trnFiltered = useMemo(() => {
    let data = trnData.filter(t => t.isActive !== false);
    if (trnStatusFilter !== "all") data = data.filter(t => t.status === trnStatusFilter);
    if (trnShippingFilter !== "all") data = data.filter(t => t.shippingStatus === trnShippingFilter);
    if (trnSearch) {
      const q = trnSearch.toLowerCase();
      data = data.filter(t =>
        (t.transferNo || "").toLowerCase().includes(q) ||
        (t.fromGodown?.name || "").toLowerCase().includes(q) ||
        (t.toGodown?.name || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [trnData, trnStatusFilter, trnShippingFilter, trnSearch]);

  const toggleTrnExpand = useCallback((id: string) => {
    setTrnExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const openTrnCreate = useCallback(() => {
    setTrnEdit(null);
    setTrnForm({
      fromGodownId: "", toGodownId: "", date: new Date().toISOString().split("T")[0], status: "Pending", notes: "",
    });
    setTrnLines([{ productId: "", quantity: 1, batchId: "" }]);
    setTrnDialog(true);
  }, []);

  const openTrnEdit = useCallback((item: any) => {
    setTrnEdit(item);
    setTrnForm({
      fromGodownId: item.fromGodownId || "",
      toGodownId: item.toGodownId || "",
      date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
      status: item.status || "Pending",
      notes: item.notes || "",
    });
    setTrnLines(item.lines?.length > 0
      ? item.lines.map((l: any) => ({ productId: l.productId, quantity: l.quantity, batchId: l.batchId || "", costPrice: l.costPrice || 0 }))
      : [{ productId: "", quantity: 1, batchId: "" }]
    );
    setTrnDialog(true);
  }, []);

  const saveTrn = useCallback(async () => {
    if (!trnForm.fromGodownId) { toast({ title: "Validation", description: "Source godown is required", variant: "destructive" }); return; }
    if (!trnForm.toGodownId) { toast({ title: "Validation", description: "Destination godown is required", variant: "destructive" }); return; }
    if (trnForm.fromGodownId === trnForm.toGodownId) { toast({ title: "Validation", description: "Source and destination cannot be the same", variant: "destructive" }); return; }
    if (!trnForm.date) { toast({ title: "Validation", description: "Date is required", variant: "destructive" }); return; }
    if (trnLines.length === 0 || trnLines.some(l => !l.productId)) {
      toast({ title: "Validation", description: "At least one line item with a product is required", variant: "destructive" }); return;
    }

    // SUSPENDED godown check
    const fromG = godowns.find(g => g.id === trnForm.fromGodownId);
    const toG = godowns.find(g => g.id === trnForm.toGodownId);
    if (fromG?.status === "SUSPENDED") {
      toast({ title: "Emergency Closure", description: `Source warehouse "${fromG.name}" is SUSPENDED. All transfers are blocked.`, variant: "destructive" }); return;
    }
    if (toG?.status === "SUSPENDED") {
      toast({ title: "Emergency Closure", description: `Destination warehouse "${toG.name}" is SUSPENDED. All transfers are blocked.`, variant: "destructive" }); return;
    }

    setTrnSaving(true);
    try {
      const lineItems = trnLines.filter(l => l.productId).map(l => ({
        productId: l.productId,
        quantity: Number(l.quantity) || 1,
        batchId: l.batchId || undefined,
      }));
      const payload = { ...trnForm, lines: lineItems };
      if (trnEdit) {
        await apiFetch(`/api/transfers/${trnEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Transfer updated" });
      } else {
        await apiFetch("/api/transfers", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Transfer created" });
      }
      setTrnDialog(false);
      loadTransfers();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setTrnSaving(false); }
  }, [trnForm, trnLines, trnEdit, godowns, toast, loadTransfers]);

  const deleteTrn = useCallback(async () => {
    if (!trnDelete) return;
    try {
      await apiFetch(`/api/transfers/${trnDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Transfer deleted. Stock entries may have been reversed." });
      setTrnDelete(null);
      loadTransfers();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [trnDelete, toast, loadTransfers]);

  const updateTransferStatus = useCallback(async (id: string, newStatus: string) => {
    try {
      await apiFetch(`/api/transfers/${id}`, {
        method: "PUT",
        body: JSON.stringify({ shippingStatus: newStatus }),
      });
      toast({ title: "Status Updated", description: `Transfer status changed to ${newStatus}` });
      loadTransfers();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [toast, loadTransfers]);

  // ============================================================
  // TAB 4: OPENING STOCK STATE
  // ============================================================

  const [osData, setOsData] = useState<any[]>([]);
  const [osLoading, setOsLoading] = useState(true);
  const [osSearch, setOsSearch] = useState("");
  const [osFilterFiscalYear, setOsFilterFiscalYear] = useState("all");
  const [osFilterStatus, setOsFilterStatus] = useState("all");
  const [osFilterGodown, setOsFilterGodown] = useState("all");
  const [osDialog, setOsDialog] = useState(false);
  const [osEdit, setOsEdit] = useState<any>(null);
  const [osSaving, setOsSaving] = useState(false);
  const [osDelete, setOsDelete] = useState<any>(null);
  const [osForm, setOsForm] = useState<Record<string, any>>({
    productId: "", productCode: "", godownId: "", quantity: 0, costPrice: 0,
    effectiveDate: new Date().toISOString().split("T")[0], fiscalYear: "", notes: "",
  });

  const loadOpeningStock = useCallback(async () => {
    setOsLoading(true);
    try {
      const params = new URLSearchParams();
      if (osFilterFiscalYear && osFilterFiscalYear !== "all") params.set("fiscalYear", osFilterFiscalYear);
      if (osFilterStatus && osFilterStatus !== "all") params.set("status", osFilterStatus);
      if (osFilterGodown && osFilterGodown !== "all") params.set("godownId", osFilterGodown);
      const qs = params.toString();
      const res = await apiFetch(`/api/opening-stock${qs ? `?${qs}` : ""}`);
      setOsData(Array.isArray(res) ? res : []);
    } catch (e: any) {
      // API might not exist yet — show empty state
      setOsData([]);
    }
    finally { setOsLoading(false); }
  }, [osFilterFiscalYear, osFilterStatus, osFilterGodown]);

  const osStats = useMemo(() => {
    const active = osData.filter(o => o.isActive !== false);
    return {
      totalEntries: active.length,
      totalValue: isVatAuditor ? "N/A (Audit Mode)" : active.reduce((s, o) => s + safeNum(o.totalValue), 0),
      postedCount: active.filter(o => o.status === "Posted").length,
    };
  }, [osData, isVatAuditor]);

  const osFiltered = useMemo(() => {
    let data = osData.filter(o => o.isActive !== false);
    if (osSearch) {
      const q = osSearch.toLowerCase();
      data = data.filter(o =>
        (o.productCode || "").toLowerCase().includes(q) ||
        (o.product?.name || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [osData, osSearch]);

  const openOsCreate = useCallback(() => {
    setOsEdit(null);
    setOsForm({
      productId: "", productCode: "", godownId: "", quantity: 0, costPrice: 0,
      effectiveDate: new Date().toISOString().split("T")[0], fiscalYear: "", notes: "",
    });
    setOsDialog(true);
  }, []);

  const openOsEdit = useCallback((item: any) => {
    if (item.status === "Posted") {
      toast({ title: "Cannot Edit", description: "Posted entries cannot be modified. Reverse first.", variant: "destructive" });
      return;
    }
    setOsEdit(item);
    setOsForm({
      productId: item.productId || "",
      productCode: item.productCode || "",
      godownId: item.godownId || "",
      quantity: item.quantity || 0,
      costPrice: item.costPrice || 0,
      effectiveDate: item.effectiveDate ? new Date(item.effectiveDate).toISOString().split("T")[0] : "",
      fiscalYear: item.fiscalYear || "",
      notes: item.notes || "",
    });
    setOsDialog(true);
  }, [toast]);

  const saveOs = useCallback(async () => {
    if (!osForm.productId) { toast({ title: "Validation", description: "Product is required", variant: "destructive" }); return; }
    if (!osForm.godownId) { toast({ title: "Validation", description: "Godown is required", variant: "destructive" }); return; }
    if (!osForm.quantity || Number(osForm.quantity) <= 0) { toast({ title: "Validation", description: "Quantity must be greater than 0", variant: "destructive" }); return; }
    if (!osForm.effectiveDate) { toast({ title: "Validation", description: "Effective date is required", variant: "destructive" }); return; }

    setOsSaving(true);
    try {
      const payload = {
        ...osForm,
        quantity: Number(osForm.quantity),
        costPrice: Number(osForm.costPrice),
        totalValue: Number(osForm.quantity) * Number(osForm.costPrice),
      };
      if (osEdit) {
        await apiFetch(`/api/opening-stock/${osEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Opening stock updated" });
      } else {
        await apiFetch("/api/opening-stock", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Opening stock entry created" });
      }
      setOsDialog(false);
      loadOpeningStock();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setOsSaving(false); }
  }, [osForm, osEdit, toast, loadOpeningStock]);

  const deleteOs = useCallback(async () => {
    if (!osDelete) return;
    try {
      await apiFetch(`/api/opening-stock/${osDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: osDelete.status === "Posted" ? "Opening stock deleted. Stock reversal applied." : "Opening stock deleted." });
      setOsDelete(null);
      loadOpeningStock();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [osDelete, toast, loadOpeningStock]);

  // Auto-fill product code and cost price when product is selected
  const handleOsProductChange = useCallback((productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (prod) {
      setOsForm(prev => ({ ...prev, productId, productCode: prod.productCode || "", costPrice: prod.costPrice || 0 }));
    } else {
      setOsForm(prev => ({ ...prev, productId, productCode: "", costPrice: 0 }));
    }
  }, [products]);

  // ============================================================
  // TAB 5: BATCH MASTER STATE
  // ============================================================

  const [bmData, setBmData] = useState<any[]>([]);
  const [bmLoading, setBmLoading] = useState(true);
  const [bmSearch, setBmSearch] = useState("");
  const [bmFilterStatus, setBmFilterStatus] = useState("all");
  const [bmFilterGodown, setBmFilterGodown] = useState("all");
  const [bmDialog, setBmDialog] = useState(false);
  const [bmEdit, setBmEdit] = useState<any>(null);
  const [bmSaving, setBmSaving] = useState(false);
  const [bmDelete, setBmDelete] = useState<any>(null);
  const [bmForm, setBmForm] = useState<Record<string, any>>({
    productId: "", godownId: "", quantityReceived: 0, costPricePerUnit: 0, salePricePerUnit: 0,
    manufacturingDate: "", expiryDate: "", supplierLotNo: "", notes: "",
  });

  const loadBatches = useCallback(async () => {
    setBmLoading(true);
    try {
      const params = new URLSearchParams();
      if (bmFilterStatus && bmFilterStatus !== "all") params.set("status", bmFilterStatus);
      if (bmFilterGodown && bmFilterGodown !== "all") params.set("godownId", bmFilterGodown);
      const qs = params.toString();
      const res = await apiFetch(`/api/batch-master${qs ? `?${qs}` : ""}`);
      setBmData(Array.isArray(res) ? res : []);
      setBatches(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setBmData([]);
      setBatches([]);
    }
    finally { setBmLoading(false); }
  }, [bmFilterStatus, bmFilterGodown]);

  const bmStats = useMemo(() => {
    const active = bmData.filter(b => b.isActive !== false);
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    return {
      totalBatches: active.length,
      activeBatches: active.filter(b => b.status === "Active").length,
      expiringSoon: active.filter(b => b.expiryDate && new Date(b.expiryDate) <= thirtyDays && new Date(b.expiryDate) > now && b.status === "Active").length,
      depletedBatches: active.filter(b => b.status === "Depleted").length,
    };
  }, [bmData]);

  const bmFiltered = useMemo(() => {
    let data = bmData.filter(b => b.isActive !== false);
    if (bmSearch) {
      const q = bmSearch.toLowerCase();
      data = data.filter(b =>
        (b.batchCode || "").toLowerCase().includes(q) ||
        (b.product?.name || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [bmData, bmSearch]);

  const openBmCreate = useCallback(() => {
    setBmEdit(null);
    setBmForm({
      productId: "", godownId: "", quantityReceived: 0, costPricePerUnit: 0, salePricePerUnit: 0,
      manufacturingDate: "", expiryDate: "", supplierLotNo: "", notes: "",
    });
    setBmDialog(true);
  }, []);

  const openBmEdit = useCallback((item: any) => {
    setBmEdit(item);
    setBmForm({
      productId: item.productId || "",
      godownId: item.godownId || "",
      quantityReceived: item.quantityReceived || 0,
      costPricePerUnit: item.costPricePerUnit || 0,
      salePricePerUnit: item.salePricePerUnit || 0,
      manufacturingDate: item.manufacturingDate ? new Date(item.manufacturingDate).toISOString().split("T")[0] : "",
      expiryDate: item.expiryDate ? new Date(item.expiryDate).toISOString().split("T")[0] : "",
      supplierLotNo: item.supplierLotNo || "",
      notes: item.notes || "",
    });
    setBmDialog(true);
  }, []);

  const saveBm = useCallback(async () => {
    if (!bmForm.productId) { toast({ title: "Validation", description: "Product is required", variant: "destructive" }); return; }
    if (!bmForm.quantityReceived || Number(bmForm.quantityReceived) <= 0) { toast({ title: "Validation", description: "Quantity received must be greater than 0", variant: "destructive" }); return; }

    setBmSaving(true);
    try {
      const payload = {
        ...bmForm,
        quantityReceived: Number(bmForm.quantityReceived),
        costPricePerUnit: Number(bmForm.costPricePerUnit),
        salePricePerUnit: Number(bmForm.salePricePerUnit),
        quantityOnHand: bmEdit ? undefined : Number(bmForm.quantityReceived),
      };
      if (bmEdit) {
        await apiFetch(`/api/batch-master/${bmEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Batch updated" });
      } else {
        await apiFetch("/api/batch-master", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Batch created" });
      }
      setBmDialog(false);
      loadBatches();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setBmSaving(false); }
  }, [bmForm, bmEdit, toast, loadBatches]);

  const deleteBm = useCallback(async () => {
    if (!bmDelete) return;
    try {
      await apiFetch(`/api/batch-master/${bmDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Batch deleted" });
      setBmDelete(null);
      loadBatches();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [bmDelete, toast, loadBatches]);

  const handleBmProductChange = useCallback((productId: string) => {
    const prod = products.find(p => p.id === productId);
    if (prod) {
      setBmForm(prev => ({ ...prev, productId, costPricePerUnit: prod.costPrice || 0, salePricePerUnit: prod.salePrice || 0 }));
    } else {
      setBmForm(prev => ({ ...prev, productId, costPricePerUnit: 0, salePricePerUnit: 0 }));
    }
  }, [products]);

  const isBatchExpired = (expiryDate: string | Date) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  // ============================================================
  // TAB 6: VALUATION STATE
  // ============================================================

  const [valData, setValData] = useState<any[]>([]);
  const [valLoading, setValLoading] = useState(true);
  const [valSearch, setValSearch] = useState("");
  const [valFilterGodown, setValFilterGodown] = useState("all");
  const [valFilterCategory, setValFilterCategory] = useState("all");
  const [valMethod, setValMethod] = useState("Weighted Average");
  const [valAsOfDate, setValAsOfDate] = useState(new Date().toISOString().split("T")[0]);

  const loadValuation = useCallback(async () => {
    setValLoading(true);
    try {
      const params = new URLSearchParams();
      if (valFilterGodown && valFilterGodown !== "all") params.set("godownId", valFilterGodown);
      if (valFilterCategory && valFilterCategory !== "all") params.set("categoryId", valFilterCategory);
      if (valMethod) params.set("method", valMethod);
      if (valAsOfDate) params.set("asOfDate", valAsOfDate);
      const qs = params.toString();
      const res = await apiFetch(`/api/valuation${qs ? `?${qs}` : ""}`);
      setValData(Array.isArray(res) ? res : []);
    } catch (e: any) {
      setValData([]);
    }
    finally { setValLoading(false); }
  }, [valFilterGodown, valFilterCategory, valMethod, valAsOfDate]);

  const valStats = useMemo(() => {
    const data = isVatAuditor ? [] : valData;
    return {
      totalInventoryValue: isVatAuditor ? "N/A (Audit Mode)" : data.reduce((s, v) => s + safeNum(v.totalValue), 0),
      totalSaleValue: isVatAuditor ? "N/A (Audit Mode)" : data.reduce((s, v) => s + safeNum(v.saleValue), 0),
      potentialProfit: isVatAuditor ? "N/A (Audit Mode)" : data.reduce((s, v) => s + safeNum(v.potentialProfit), 0),
      avgMargin: isVatAuditor ? "N/A (Audit Mode)" : (data.length > 0 ? data.reduce((s, v) => s + safeNum(v.marginPercent), 0) / data.filter(v => safeNum(v.marginPercent) !== 0).length : 0),
    };
  }, [valData, isVatAuditor]);

  const valTotals = useMemo(() => {
    const data = isVatAuditor ? [] : valFiltered;
    return {
      totalValue: data.reduce((s, v) => s + safeNum(v.totalValue), 0),
      saleValue: data.reduce((s, v) => s + safeNum(v.saleValue), 0),
      potentialProfit: data.reduce((s, v) => s + safeNum(v.potentialProfit), 0),
      avgMargin: data.length > 0 ? data.reduce((s, v) => s + safeNum(v.marginPercent), 0) / data.filter(v => safeNum(v.marginPercent) !== 0).length : 0,
    };
  }, [valFiltered, isVatAuditor]);

  const valFiltered = useMemo(() => {
    let data = valData;
    if (valSearch) {
      const q = valSearch.toLowerCase();
      data = data.filter(v =>
        (v.productCode || "").toLowerCase().includes(q) ||
        (v.productName || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [valData, valSearch]);

  // ============================================================
  // INIT: Load data based on active tab
  // ============================================================

  useEffect(() => {
    if (activeTab === "stock") loadStock();
    if (activeTab === "stock-transfers") loadTransfers();
    if (activeTab === "opening-stock") loadOpeningStock();
    if (activeTab === "batch-master") loadBatches();
    if (activeTab === "valuation") loadValuation();
  }, [activeTab, loadStock, loadTransfers, loadOpeningStock, loadBatches, loadValuation]);

  // ============================================================
  // EXPORT HELPERS
  // ============================================================

  const getCompanyProfile = useCallback(async () => {
    try {
      const res = await apiFetch("/api/company-branding");
      if (res?.company) {
        return {
          name: res.company.name || "VoltERP",
          address: res.company.address || "",
          phone: res.company.phone || "",
          mobile: res.company.mobile || "",
          email: res.company.email || "",
          logo: res.company.logo || undefined,
          brandLogo: res.company.brandLogo || undefined,
          logoWidth: res.company.logoWidth,
          logoHeight: res.company.logoHeight,
          vatNumber: res.company.vatNumber || "",
          tradeLicense: res.company.tradeLicense || "",
        };
      }
    } catch {}
    if (companies.length > 0) {
      return {
        name: companies[0].name || "VoltERP",
        address: companies[0].address || "",
        phone: companies[0].phone || "",
        mobile: companies[0].mobile || "",
        email: companies[0].email || "",
        vatNumber: companies[0].vatNumber || "",
        tradeLicense: companies[0].tradeLicense || "",
      };
    }
    return undefined;
  }, [companies]);

  const doExportPDF = useCallback(async (title: string, columns: ExportColumnDef[], data: any[]) => {
    try {
      const maskedKeys = getVatMaskedKeys(columns);
      const company = await getCompanyProfile();
      exportToPDF({
        title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys,
        orientation: "landscape", company,
        financialFooter: { printedBy: (() => { try { const a = JSON.parse(localStorage.getItem("ems_auth") || "{}"); return a.user?.displayName || a.user?.name || "System"; } catch { return "System"; } })() },
        systemNotice: "This is a computer-generated document. Verify with official records.",
      });
      toast({ title: "PDF Exported", description: `${title} data exported` });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [isVatAuditor, userRole, getCompanyProfile, toast]);

  const doExportCSV = useCallback(async (title: string, columns: ExportColumnDef[], data: any[]) => {
    try {
      const maskedKeys = getVatMaskedKeys(columns);
      exportToCSV({ title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
      toast({ title: "CSV Exported", description: `${title} data exported` });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [isVatAuditor, toast]);

  const doImportCSV = useCallback((apiPath: string, fields: ExportFieldDef[], reloadFn: () => void) => {
    importFromCSV({ apiPath, formFields: fields }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
      reloadFn();
    });
  }, [toast]);

  // ============================================================
  // LINE ITEM HELPERS
  // ============================================================

  const addLine = (setter: React.Dispatch<React.SetStateAction<any[]>>, template: any) => {
    setter(prev => [...prev, { ...template }]);
  };

  const removeLine = (setter: React.Dispatch<React.SetStateAction<any[]>>, idx: number) => {
    setter(prev => prev.filter((_, i) => i !== idx));
  };

  const updateLine = (setter: React.Dispatch<React.SetStateAction<any[]>>, idx: number, field: string, value: any) => {
    setter(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };

  // ============================================================
  // RENDER: TAB 1 — STOCK OVERVIEW
  // ============================================================

  const renderStockOverview = () => {
    const exportColumns: ExportColumnDef[] = [
      { key: "productCode", label: "Product Code", type: "text" },
      { key: "productName", label: "Product Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "godown", label: "Godown", type: "text" },
      { key: "currentStock", label: "Current Stock", type: "number" },
      { key: "reorderLevel", label: "Reorder Level", type: "number" },
      { key: "stockStatus", label: "Stock Status", type: "text" },
      { key: "costPrice", label: "Cost Price", type: "currency" },
      { key: "stockValue", label: "Stock Value", type: "currency" },
    ];

    return (
      <div className="space-y-4">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
          <StatCard label="Total Products" value={stockStats.totalProducts} icon={Package} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
          <StatCard label="In Stock" value={stockStats.inStock} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-100 dark:bg-emerald-900/30" />
          <StatCard label="Low Stock" value={stockStats.lowStock} icon={AlertTriangle} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
          <StatCard label="Out of Stock" value={stockStats.outOfStock} icon={X} color="text-red-600" bg="bg-red-100 dark:bg-red-900/30" />
          <StatCard label="Inventory Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(stockStats.totalValue)} icon={CircleDollarSign} color="text-purple-600" bg="bg-purple-100 dark:bg-purple-900/30" />
          <StatCard label="Total Batches" value={stockStats.totalBatches} icon={Layers} color="text-teal-600" bg="bg-teal-100 dark:bg-teal-900/30" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={stockFilterGodown} onValueChange={v => setStockFilterGodown(v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Godown" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Godowns</SelectItem>
              {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stockFilterCategory} onValueChange={v => setStockFilterCategory(v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={stockFilterStatus} onValueChange={v => setStockFilterStatus(v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Stock Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="In Stock">In Stock</SelectItem>
              <SelectItem value="Low Stock">Low Stock</SelectItem>
              <SelectItem value="Out of Stock">Out of Stock</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="Search products..." className="pl-8 h-9" />
          </div>
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Stock Overview", exportColumns, stockFiltered)}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Stock Overview", exportColumns, stockFiltered)}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          {isAdmin && <label className="cursor-pointer"><Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import</span></Button><input type="file" accept=".csv" className="hidden" onChange={() => doImportCSV("/api/opening-stock", [], loadStock)} /></label>}
          <Button variant="ghost" size="sm" onClick={loadStock}>
            <RefreshCw className={`h-4 w-4 ${stockLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Table */}
        {stockLoading ? <LoadingSpinner /> : stockFiltered.length === 0 ? (
          <EmptyState icon={Package} message="No stock data found" />
        ) : (
          <div className="border rounded-lg overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white text-xs w-8"></TableHead>
                  <TableHead className="text-white text-xs">Product Code</TableHead>
                  <TableHead className="text-white text-xs">Product Name</TableHead>
                  <TableHead className="text-white text-xs">Category</TableHead>
                  <TableHead className="text-white text-xs">Godown</TableHead>
                  <TableHead className="text-white text-xs text-right">Current Stock</TableHead>
                  <TableHead className="text-white text-xs text-right">Reorder Level</TableHead>
                  <TableHead className="text-white text-xs">Stock Status</TableHead>
                  <TableHead className="text-white text-xs text-right">Cost Price</TableHead>
                  <TableHead className="text-white text-xs text-right">Stock Value</TableHead>
                  <TableHead className="text-white text-xs text-right">Batch Count</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stockFiltered.map(item => {
                  const isExpanded = stockExpandedRows.has(item.productId);
                  const productBatches = batches.filter(b => b.productId === item.productId);
                  return (
                    <React.Fragment key={item.productId}>
                      <TableRow className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" onClick={() => toggleStockExpand(item.productId)}>
                        <TableCell className="w-8">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{item.productCode}</TableCell>
                        <TableCell className="text-xs font-medium">{item.productName}</TableCell>
                        <TableCell className="text-xs">{item.category}</TableCell>
                        <TableCell className="text-xs">{item.godown}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{safeNum(item.currentStock).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">{safeNum(item.reorderLevel).toLocaleString()}</TableCell>
                        <TableCell><StockStatusBadge status={item.stockStatus} /></TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.costPrice, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.stockValue, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{productBatches.length}</TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={11} className="bg-slate-50 dark:bg-slate-800/30 p-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                              {/* Warehouse Balance Grid */}
                              <div>
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Warehouse Balance</p>
                                <div className="border rounded-lg overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-slate-200 dark:bg-slate-700">
                                        <TableHead className="text-xs">Godown</TableHead>
                                        <TableHead className="text-xs text-right">Stock Qty</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {godowns.filter(g => g.isActive !== false).map(g => {
                                        const godownStock = item.godownId === g.id ? item.currentStock : 0;
                                        if (godownStock <= 0) return null;
                                        return (
                                          <TableRow key={g.id}>
                                            <TableCell className="text-xs">{g.name}</TableCell>
                                            <TableCell className="text-xs text-right font-medium">{safeNum(godownStock).toLocaleString()}</TableCell>
                                          </TableRow>
                                        );
                                      })}
                                      {godowns.filter(g => item.godownId === g.id).length === 0 && (
                                        <TableRow>
                                          <TableCell colSpan={2} className="text-xs text-center text-slate-400">No warehouse data</TableCell>
                                        </TableRow>
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                              {/* Active Batches */}
                              <div>
                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Active Batches</p>
                                <div className="border rounded-lg overflow-hidden">
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-slate-200 dark:bg-slate-700">
                                        <TableHead className="text-xs">Batch Code</TableHead>
                                        <TableHead className="text-xs text-right">Qty On Hand</TableHead>
                                        <TableHead className="text-xs">Expiry</TableHead>
                                        <TableHead className="text-xs">Status</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {productBatches.length > 0 ? productBatches.map(b => (
                                        <TableRow key={b.id} className={isBatchExpired(b.expiryDate) ? "bg-red-50 dark:bg-red-900/10" : ""}>
                                          <TableCell className="text-xs font-mono">{b.batchCode}</TableCell>
                                          <TableCell className="text-xs text-right">{safeNum(b.quantityOnHand).toLocaleString()}</TableCell>
                                          <TableCell className="text-xs">{fmtDate(b.expiryDate)}</TableCell>
                                          <TableCell><StatusBadge status={b.status || "Active"} /></TableCell>
                                        </TableRow>
                                      )) : (
                                        <TableRow>
                                          <TableCell colSpan={4} className="text-xs text-center text-slate-400">No batches</TableCell>
                                        </TableRow>
                                      )}
                                    </TableBody>
                                  </Table>
                                </div>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // RENDER: TAB 2 — STOCK DETAILS
  // ============================================================

  const renderStockDetails = () => {
    if (isSR || isDealer) {
      return isSR ? (
        <div className="space-y-4">
          {/* SR gets read-only view */}
          {renderStockDetailsContent()}
        </div>
      ) : <AccessDenied message="Dealers cannot access stock details." />;
    }
    return <div className="space-y-4">{renderStockDetailsContent()}</div>;
  };

  const renderStockDetailsContent = () => {
    const exportColumns: ExportColumnDef[] = [
      { key: "date", label: "Date", type: "date" },
      { key: "type", label: "Type", type: "text" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "reference", label: "Reference", type: "text" },
      { key: "sourceLabel", label: "Source", type: "text" },
      { key: "runningBalance", label: "Running Balance", type: "number" },
      { key: "lineValue", label: "Line Value", type: "currency" },
    ];

    return (
      <div className="space-y-4">
        {/* Product Selector + Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={sdSelectedProduct} onValueChange={v => setSdSelectedProduct(v)}>
            <SelectTrigger className="w-64 h-9 text-xs"><SelectValue placeholder="Select Product" /></SelectTrigger>
            <SelectContent>
              {products.filter(p => p.isActive !== false).map(p => (
                <SelectItem key={p.id} value={p.id}>{p.productCode} — {p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" value={sdDateFrom} onChange={e => setSdDateFrom(e.target.value)} className="h-9 w-36 text-xs" />
          <Input type="date" value={sdDateTo} onChange={e => setSdDateTo(e.target.value)} className="h-9 w-36 text-xs" />
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Stock Movement Trail", exportColumns, sdData)} disabled={!sdSelectedProduct}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Stock Movement Trail", exportColumns, sdData)} disabled={!sdSelectedProduct}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          <Button variant="ghost" size="sm" onClick={() => sdSelectedProduct && loadStockDetails(sdSelectedProduct)} disabled={!sdSelectedProduct}>
            <RefreshCw className={`h-4 w-4 ${sdLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Product Info Card */}
        {sdProductInfo && (
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="p-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3 text-xs">
                <div><span className="text-slate-500">Product:</span> <span className="font-medium">{sdProductInfo.name}</span></div>
                <div><span className="text-slate-500">Code:</span> <span className="font-mono">{sdProductInfo.productCode}</span></div>
                <div><span className="text-slate-500">Category:</span> {sdProductInfo.category}</div>
                <div><span className="text-slate-500">Godown:</span> {sdProductInfo.godown}</div>
                <div><span className="text-slate-500">Cost Price:</span> {fmtCurrency(vatMask(sdProductInfo.costPrice, isVatAuditor))}</div>
                <div><span className="text-slate-500">Sale Price:</span> {fmtCurrency(vatMask(sdProductInfo.salePrice, isVatAuditor))}</div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Summary Panel */}
        {sdSummary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Total IN" value={safeNum(sdSummary.totalIn).toLocaleString()} icon={TrendingUp} color="text-emerald-600" bg="bg-emerald-100 dark:bg-emerald-900/30" />
            <StatCard label="Total OUT" value={safeNum(sdSummary.totalOut).toLocaleString()} icon={ArrowLeftRight} color="text-red-600" bg="bg-red-100 dark:bg-red-900/30" />
            <StatCard label="Current Balance" value={safeNum(sdSummary.currentBalance).toLocaleString()} icon={Calculator} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
            <StatCard label="Opening Stock" value={safeNum(sdSummary.openingStock).toLocaleString()} icon={Archive} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
          </div>
        )}

        {/* Movement Trail Table */}
        {!sdSelectedProduct ? (
          <EmptyState icon={Eye} message="Select a product to view movement trails" />
        ) : sdLoading ? (
          <LoadingSpinner />
        ) : sdData.length === 0 ? (
          <EmptyState icon={FileBarChart} message="No movement data found for this product" />
        ) : (
          <div className="border rounded-lg overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white text-xs">Date</TableHead>
                  <TableHead className="text-white text-xs">Type</TableHead>
                  <TableHead className="text-white text-xs text-right">Quantity</TableHead>
                  <TableHead className="text-white text-xs">Reference</TableHead>
                  <TableHead className="text-white text-xs">Source</TableHead>
                  <TableHead className="text-white text-xs">Godown</TableHead>
                  <TableHead className="text-white text-xs text-right">Running Balance</TableHead>
                  <TableHead className="text-white text-xs text-right">Line Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sdData.map((entry, idx) => (
                  <TableRow key={entry.id || idx} className={entry.type === "OUT" ? "bg-red-50/50 dark:bg-red-900/5" : entry.type === "IN" ? "bg-emerald-50/50 dark:bg-emerald-900/5" : ""}>
                    <TableCell className="text-xs">{fmtDate(entry.date)}</TableCell>
                    <TableCell>
                      <Badge className={`${entry.type === "IN" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"} border-0 text-xs font-medium`}>
                        {entry.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-right font-medium">{safeNum(entry.quantity).toLocaleString()}</TableCell>
                    <TableCell className="text-xs font-mono">{entry.reference || "—"}</TableCell>
                    <TableCell><SourceTypeBadge source={entry.sourceLabel || entry.referenceType || "Manual"} /></TableCell>
                    <TableCell className="text-xs">{entry.godownId ? godowns.find(g => g.id === entry.godownId)?.name || "—" : "—"}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{entry.runningBalance !== null && entry.runningBalance !== undefined ? safeNum(entry.runningBalance).toLocaleString() : "—"}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(vatMask(entry.lineValue, isVatAuditor))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // RENDER: TAB 3 — STOCK TRANSFERS
  // ============================================================

  const renderStockTransfers = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access transfer records." />;

    const exportColumns: ExportColumnDef[] = [
      { key: "transferNo", label: "Transfer No", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "fromGodownName", label: "From Godown", type: "text" },
      { key: "toGodownName", label: "To Godown", type: "text" },
      { key: "totalItems", label: "Items", type: "number" },
      { key: "totalQuantity", label: "Total Qty", type: "number" },
      { key: "totalCostValue", label: "Cost Value", type: "currency" },
      { key: "shippingStatus", label: "Shipping", type: "text" },
      { key: "status", label: "Status", type: "text" },
    ];

    const exportData = trnFiltered.map(t => ({
      ...t,
      fromGodownName: t.fromGodown?.name || "—",
      toGodownName: t.toGodown?.name || "—",
    }));

    return (
      <div className="space-y-4">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3">
          <StatCard label="Total Transfers" value={trnStats.total} icon={ArrowRightLeft} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
          <StatCard label="Pending Approval" value={trnStats.pendingApproval} icon={Clock} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
          <StatCard label="In-Transit" value={trnStats.inTransit} icon={Truck} color="text-purple-600" bg="bg-purple-100 dark:bg-purple-900/30" />
          <StatCard label="Delivered" value={trnStats.delivered} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-100 dark:bg-emerald-900/30" />
          <StatCard label="Cancelled" value={trnStats.cancelled} icon={X} color="text-red-600" bg="bg-red-100 dark:bg-red-900/30" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={trnStatusFilter} onValueChange={v => setTrnStatusFilter(v)}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="In-Transit">In-Transit</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={trnShippingFilter} onValueChange={v => setTrnShippingFilter(v)}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Shipping" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Shipping</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="In-Transit">In-Transit</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={trnSearch} onChange={e => setTrnSearch(e.target.value)} placeholder="Search transfers..." className="pl-8 h-9" />
          </div>
          {isAdmin && (
            <Button onClick={openTrnCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8] h-9">
              <Plus className="h-4 w-4 mr-1" /> Create Transfer
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Stock Transfers", exportColumns, exportData)}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Stock Transfers", exportColumns, exportData)}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          {isAdmin && (
            <label className="cursor-pointer">
              <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import</span></Button>
              <input type="file" accept=".csv" className="hidden" onChange={() => doImportCSV("/api/transfers?import=true", [
                { key: "fromGodownCode", label: "From Godown Code", type: "text", required: true },
                { key: "toGodownCode", label: "To Godown Code", type: "text", required: true },
                { key: "date", label: "Date", type: "date", required: true },
                { key: "productCode", label: "Product Code", type: "text", required: true },
                { key: "quantity", label: "Quantity", type: "number", required: true },
              ], loadTransfers)} />
            </label>
          )}
          <Button variant="ghost" size="sm" onClick={loadTransfers}>
            <RefreshCw className={`h-4 w-4 ${trnLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Table */}
        {trnLoading ? <LoadingSpinner /> : trnFiltered.length === 0 ? (
          <EmptyState icon={ArrowRightLeft} message="No transfers found" />
        ) : (
          <div className="border rounded-lg overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white text-xs w-8"></TableHead>
                  <TableHead className="text-white text-xs">Transfer No</TableHead>
                  <TableHead className="text-white text-xs">Date</TableHead>
                  <TableHead className="text-white text-xs">From</TableHead>
                  <TableHead className="text-white text-xs">To</TableHead>
                  <TableHead className="text-white text-xs text-right">Items</TableHead>
                  <TableHead className="text-white text-xs text-right">Total Qty</TableHead>
                  <TableHead className="text-white text-xs text-right">Cost Value</TableHead>
                  <TableHead className="text-white text-xs">Shipping</TableHead>
                  <TableHead className="text-white text-xs">Status</TableHead>
                  <TableHead className="text-white text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {trnFiltered.map(item => {
                  const isExpanded = trnExpandedRows.has(item.id);
                  return (
                    <React.Fragment key={item.id}>
                      <TableRow className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell className="w-8 cursor-pointer" onClick={() => toggleTrnExpand(item.id)}>
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                        </TableCell>
                        <TableCell className="text-xs font-mono">{item.transferNo}</TableCell>
                        <TableCell className="text-xs">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-xs">{item.fromGodown?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{item.toGodown?.name || "—"}</TableCell>
                        <TableCell className="text-xs text-right">{item.totalItems}</TableCell>
                        <TableCell className="text-xs text-right">{safeNum(item.totalQuantity).toLocaleString()}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.totalCostValue, isVatAuditor))}</TableCell>
                        <TableCell><StatusBadge status={item.shippingStatus || "Pending"} /></TableCell>
                        <TableCell><StatusBadge status={item.status} /></TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {isAdmin && item.status === "Pending" && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateTransferStatus(item.id, "Approved")} title="Approve">
                                <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />
                              </Button>
                            )}
                            {isAdmin && item.status === "Approved" && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateTransferStatus(item.id, "In-Transit")} title="Ship">
                                <Truck className="h-3.5 w-3.5 text-purple-600" />
                              </Button>
                            )}
                            {isAdmin && item.shippingStatus === "In-Transit" && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateTransferStatus(item.id, "Delivered")} title="Deliver">
                                <Package className="h-3.5 w-3.5 text-emerald-600" />
                              </Button>
                            )}
                            {isAdmin && !["Delivered", "Cancelled"].includes(item.status) && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => updateTransferStatus(item.id, "Cancelled")} title="Cancel">
                                <X className="h-3.5 w-3.5 text-red-600" />
                              </Button>
                            )}
                            {isAdmin && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openTrnEdit(item)} title="Edit">
                                <Edit className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isAdmin && (
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setTrnDelete(item)} title="Delete">
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={11} className="bg-slate-50 dark:bg-slate-800/30 p-4">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Line Items</p>
                            <div className="border rounded-lg overflow-hidden">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-slate-200 dark:bg-slate-700">
                                    <TableHead className="text-xs">Product</TableHead>
                                    <TableHead className="text-xs text-right">Qty</TableHead>
                                    <TableHead className="text-xs">Batch</TableHead>
                                    <TableHead className="text-xs text-right">Cost Price</TableHead>
                                    <TableHead className="text-xs text-right">Line Total</TableHead>
                                    <TableHead className="text-xs text-right">Available Stock</TableHead>
                                    <TableHead className="text-xs">Stock Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {item.lines?.length > 0 ? item.lines.map((line: any, idx: number) => (
                                    <TableRow key={idx}>
                                      <TableCell className="text-xs">{line.product?.name || line.productId}</TableCell>
                                      <TableCell className="text-xs text-right">{safeNum(line.quantity).toLocaleString()}</TableCell>
                                      <TableCell className="text-xs font-mono">{line.batchId || "—"}</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.costPrice, isVatAuditor))}</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.lineTotal, isVatAuditor))}</TableCell>
                                      <TableCell className="text-xs text-right">{safeNum(line.availableStock).toLocaleString()}</TableCell>
                                      <TableCell><StockStatusBadge status={line.stockStatus || "Available"} /></TableCell>
                                    </TableRow>
                                  )) : (
                                    <TableRow>
                                      <TableCell colSpan={7} className="text-xs text-center text-slate-400">No line items</TableCell>
                                    </TableRow>
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Transfer Dialog */}
        <Dialog open={trnDialog} onOpenChange={setTrnDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{trnEdit ? "Edit Transfer" : "Create Transfer"}</DialogTitle>
              <DialogDescription>{trnEdit ? "Modify transfer details" : "Create a new inter-warehouse transfer"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* SUSPENDED Godown Warning */}
              {(godowns.find(g => g.id === trnForm.fromGodownId)?.status === "SUSPENDED" || godowns.find(g => g.id === trnForm.toGodownId)?.status === "SUSPENDED") && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-600 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-400">
                    EMERGENCY CLOSURE: A selected warehouse is SUSPENDED. All transfers are blocked until reactivated.
                  </p>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">From Godown *</Label>
                  <Select value={trnForm.fromGodownId} onValueChange={v => setTrnForm(prev => ({ ...prev, fromGodownId: v }))}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Source Warehouse" /></SelectTrigger>
                    <SelectContent>
                      {godowns.filter(g => g.isActive !== false).map(g => (
                        <SelectItem key={g.id} value={g.id} className={g.status === "SUSPENDED" ? "text-red-500" : ""}>
                          {g.name} {g.status === "SUSPENDED" ? "⚠️ SUSPENDED" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">To Godown *</Label>
                  <Select value={trnForm.toGodownId} onValueChange={v => setTrnForm(prev => ({ ...prev, toGodownId: v }))}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Destination Warehouse" /></SelectTrigger>
                    <SelectContent>
                      {godowns.filter(g => g.isActive !== false).map(g => (
                        <SelectItem key={g.id} value={g.id} className={g.status === "SUSPENDED" ? "text-red-500" : ""}>
                          {g.name} {g.status === "SUSPENDED" ? "⚠️ SUSPENDED" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Date *</Label>
                  <Input type="date" value={trnForm.date} onChange={e => setTrnForm(prev => ({ ...prev, date: e.target.value }))} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Notes</Label>
                  <Input value={trnForm.notes} onChange={e => setTrnForm(prev => ({ ...prev, notes: e.target.value }))} className="h-9 text-xs" placeholder="Optional notes" />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold">Line Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => addLine(setTrnLines, { productId: "", quantity: 1, batchId: "" })}>
                    <Plus className="h-3 w-3 mr-1" /> Add Line
                  </Button>
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                        <TableHead className="text-white text-xs">#</TableHead>
                        <TableHead className="text-white text-xs">Product</TableHead>
                        <TableHead className="text-white text-xs text-right">Qty</TableHead>
                        <TableHead className="text-white text-xs">Batch (Opt.)</TableHead>
                        <TableHead className="text-white text-xs text-right">Cost Price</TableHead>
                        <TableHead className="text-white text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trnLines.map((line, idx) => {
                        const prod = products.find(p => p.id === line.productId);
                        return (
                          <TableRow key={idx}>
                            <TableCell className="text-xs">{idx + 1}</TableCell>
                            <TableCell>
                              <Select value={line.productId || ""} onValueChange={v => {
                                updateLine(setTrnLines, idx, "productId", v);
                                const p = products.find(pr => pr.id === v);
                                if (p) updateLine(setTrnLines, idx, "costPrice", p.costPrice || 0);
                              }}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
                                <SelectContent>
                                  {products.filter(p => p.isActive !== false).map(p => (
                                    <SelectItem key={p.id} value={p.id}>{p.productCode} - {p.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input type="number" min={1} value={line.quantity || 1} onChange={e => updateLine(setTrnLines, idx, "quantity", Number(e.target.value))} className="h-8 w-20 text-xs" />
                            </TableCell>
                            <TableCell>
                              <Select value={line.batchId || "none"} onValueChange={v => updateLine(setTrnLines, idx, "batchId", v === "none" ? "" : v)}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Batch" /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">None</SelectItem>
                                  {batches.filter(b => b.productId === line.productId && b.status === "Active").map(b => (
                                    <SelectItem key={b.id} value={b.id}>{b.batchCode}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.costPrice || prod?.costPrice || 0, isVatAuditor))}</TableCell>
                            <TableCell>
                              {trnLines.length > 1 && (
                                <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(setTrnLines, idx)} className="h-6 w-6 p-0 text-red-500 hover:text-red-700">
                                  <X className="h-3 w-3" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTrnDialog(false)}>Cancel</Button>
              <Button onClick={saveTrn} disabled={trnSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {trnSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {trnEdit ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={!!trnDelete} onOpenChange={() => setTrnDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Transfer</DialogTitle>
              <DialogDescription>Are you sure you want to delete transfer {trnDelete?.transferNo}?</DialogDescription>
            </DialogHeader>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
              <p className="text-sm text-amber-700 dark:text-amber-400">
                Stock entries may be reversed when deleting this transfer. This action cannot be undone.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTrnDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteTrn}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // RENDER: TAB 4 — OPENING STOCK
  // ============================================================

  const renderOpeningStock = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access opening stock records." />;

    const exportColumns: ExportColumnDef[] = [
      { key: "productCode", label: "Product Code", type: "text" },
      { key: "productName", label: "Product Name", type: "text" },
      { key: "godownName", label: "Godown", type: "text" },
      { key: "quantity", label: "Quantity", type: "number" },
      { key: "costPrice", label: "Cost Price", type: "currency" },
      { key: "totalValue", label: "Total Value", type: "currency" },
      { key: "effectiveDate", label: "Effective Date", type: "date" },
      { key: "fiscalYear", label: "Fiscal Year", type: "text" },
      { key: "status", label: "Status", type: "text" },
    ];

    const exportData = osFiltered.map(o => ({
      ...o,
      productName: o.product?.name || "—",
      godownName: o.godown?.name || godowns.find(g => g.id === o.godownId)?.name || "—",
    }));

    const fiscalYears = [...new Set(osData.map(o => o.fiscalYear).filter(Boolean))];

    return (
      <div className="space-y-4">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard label="Total Entries" value={osStats.totalEntries} icon={Archive} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
          <StatCard label="Total Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(osStats.totalValue)} icon={CircleDollarSign} color="text-purple-600" bg="bg-purple-100 dark:bg-purple-900/30" />
          <StatCard label="Posted" value={osStats.postedCount} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-100 dark:bg-emerald-900/30" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={osFilterFiscalYear} onValueChange={v => setOsFilterFiscalYear(v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Fiscal Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Fiscal Years</SelectItem>
              {fiscalYears.map(fy => <SelectItem key={fy} value={fy}>{fy}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={osFilterStatus} onValueChange={v => setOsFilterStatus(v)}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Posted">Posted</SelectItem>
              <SelectItem value="Reversed">Reversed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={osFilterGodown} onValueChange={v => setOsFilterGodown(v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Godown" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Godowns</SelectItem>
              {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={osSearch} onChange={e => setOsSearch(e.target.value)} placeholder="Search opening stock..." className="pl-8 h-9" />
          </div>
          {isAdmin && (
            <Button onClick={openOsCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8] h-9">
              <Plus className="h-4 w-4 mr-1" /> Add Entry
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Opening Stock", exportColumns, exportData)}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Opening Stock", exportColumns, exportData)}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          {isAdmin && <label className="cursor-pointer"><Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import</span></Button><input type="file" accept=".csv" className="hidden" onChange={() => doImportCSV("/api/opening-stock", [], loadOpeningStock)} /></label>}
          <Button variant="ghost" size="sm" onClick={loadOpeningStock}>
            <RefreshCw className={`h-4 w-4 ${osLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Table */}
        {osLoading ? <LoadingSpinner /> : osFiltered.length === 0 ? (
          <EmptyState icon={Archive} message="No opening stock entries found" />
        ) : (
          <div className="border rounded-lg overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white text-xs">Product Code</TableHead>
                  <TableHead className="text-white text-xs">Product Name</TableHead>
                  <TableHead className="text-white text-xs">Godown</TableHead>
                  <TableHead className="text-white text-xs text-right">Quantity</TableHead>
                  <TableHead className="text-white text-xs text-right">Cost Price</TableHead>
                  <TableHead className="text-white text-xs text-right">Total Value</TableHead>
                  <TableHead className="text-white text-xs">Effective Date</TableHead>
                  <TableHead className="text-white text-xs">Fiscal Year</TableHead>
                  <TableHead className="text-white text-xs">Status</TableHead>
                  <TableHead className="text-white text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {osFiltered.map(item => (
                  <TableRow key={item.id}>
                    <TableCell className="text-xs font-mono">{item.productCode}</TableCell>
                    <TableCell className="text-xs font-medium">{item.product?.name || "—"}</TableCell>
                    <TableCell className="text-xs">{item.godown?.name || godowns.find(g => g.id === item.godownId)?.name || "—"}</TableCell>
                    <TableCell className="text-xs text-right">{safeNum(item.quantity).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.costPrice, isVatAuditor))}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.totalValue, isVatAuditor))}</TableCell>
                    <TableCell className="text-xs">{fmtDate(item.effectiveDate)}</TableCell>
                    <TableCell className="text-xs">{item.fiscalYear || "—"}</TableCell>
                    <TableCell><StatusBadge status={item.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {isAdmin && item.status === "Draft" && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openOsEdit(item)} title="Edit">
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isAdmin && (
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setOsDelete(item)} title="Delete">
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Opening Stock Dialog */}
        <Dialog open={osDialog} onOpenChange={setOsDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{osEdit ? "Edit Opening Stock" : "Create Opening Stock"}</DialogTitle>
              <DialogDescription>{osEdit ? "Modify opening stock entry (Draft only)" : "Add a new opening stock entry"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Product *</Label>
                  <Select value={osForm.productId} onValueChange={handleOsProductChange}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Product" /></SelectTrigger>
                    <SelectContent>
                      {products.filter(p => p.isActive !== false).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.productCode} - {p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Product Code (auto-filled)</Label>
                  <Input value={osForm.productCode} readOnly className="h-9 text-xs bg-slate-50 dark:bg-slate-800" />
                </div>
                <div>
                  <Label className="text-xs">Godown *</Label>
                  <Select value={osForm.godownId} onValueChange={v => setOsForm(prev => ({ ...prev, godownId: v }))}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Godown" /></SelectTrigger>
                    <SelectContent>
                      {godowns.filter(g => g.isActive !== false).map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Quantity *</Label>
                  <Input type="number" min={0} step="1" value={osForm.quantity} onChange={e => setOsForm(prev => ({ ...prev, quantity: Number(e.target.value) }))} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Cost Price (editable)</Label>
                  <Input type="number" min={0} step="0.01" value={osForm.costPrice} onChange={e => setOsForm(prev => ({ ...prev, costPrice: Number(e.target.value) }))} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Effective Date *</Label>
                  <Input type="date" value={osForm.effectiveDate} onChange={e => setOsForm(prev => ({ ...prev, effectiveDate: e.target.value }))} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Fiscal Year</Label>
                  <Input value={osForm.fiscalYear} onChange={e => setOsForm(prev => ({ ...prev, fiscalYear: e.target.value }))} className="h-9 text-xs" placeholder="e.g. 2025-2026" />
                </div>
                <div>
                  <Label className="text-xs">Computed Total Value</Label>
                  <Input value={fmtCurrency(vatMask(Number(osForm.quantity) * Number(osForm.costPrice), isVatAuditor))} readOnly className="h-9 text-xs bg-slate-50 dark:bg-slate-800" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea value={osForm.notes} onChange={e => setOsForm(prev => ({ ...prev, notes: e.target.value }))} className="text-xs" rows={2} placeholder="Optional notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOsDialog(false)}>Cancel</Button>
              <Button onClick={saveOs} disabled={osSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {osSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {osEdit ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!osDelete} onOpenChange={() => setOsDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Opening Stock</DialogTitle>
              <DialogDescription>Are you sure you want to delete this opening stock entry?</DialogDescription>
            </DialogHeader>
            {osDelete?.status === "Posted" && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
                <p className="text-sm text-amber-700 dark:text-amber-400">
                  This is a Posted entry. Deleting it will reverse the stock entries.
                </p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setOsDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteOs}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // RENDER: TAB 5 — BATCH MASTER
  // ============================================================

  const renderBatchMaster = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access batch records." />;

    const exportColumns: ExportColumnDef[] = [
      { key: "batchCode", label: "Batch Code", type: "text" },
      { key: "productName", label: "Product", type: "text" },
      { key: "godownName", label: "Godown", type: "text" },
      { key: "quantityReceived", label: "Qty Received", type: "number" },
      { key: "quantitySold", label: "Qty Sold", type: "number" },
      { key: "quantityOnHand", label: "Qty On Hand", type: "number" },
      { key: "costPricePerUnit", label: "Cost Price/Unit", type: "currency" },
      { key: "salePricePerUnit", label: "Sale Price/Unit", type: "currency" },
      { key: "expiryDate", label: "Expiry Date", type: "date" },
      { key: "status", label: "Status", type: "text" },
    ];

    const exportData = bmFiltered.map(b => ({
      ...b,
      productName: b.product?.name || "—",
      godownName: b.godown?.name || godowns.find(g => g.id === b.godownId)?.name || "—",
    }));

    return (
      <div className="space-y-4">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Batches" value={bmStats.totalBatches} icon={Layers} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
          <StatCard label="Active Batches" value={bmStats.activeBatches} icon={CheckCircle2} color="text-emerald-600" bg="bg-emerald-100 dark:bg-emerald-900/30" />
          <StatCard label="Expiring Soon" value={bmStats.expiringSoon} icon={AlertTriangle} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
          <StatCard label="Depleted" value={bmStats.depletedBatches} icon={Archive} color="text-slate-600" bg="bg-slate-100 dark:bg-slate-800" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={bmFilterStatus} onValueChange={v => setBmFilterStatus(v)}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Expired">Expired</SelectItem>
              <SelectItem value="Depleted">Depleted</SelectItem>
              <SelectItem value="Recalled">Recalled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={bmFilterGodown} onValueChange={v => setBmFilterGodown(v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Godown" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Godowns</SelectItem>
              {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={bmSearch} onChange={e => setBmSearch(e.target.value)} placeholder="Search batches..." className="pl-8 h-9" />
          </div>
          {isAdmin && (
            <Button onClick={openBmCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8] h-9">
              <Plus className="h-4 w-4 mr-1" /> Add Batch
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Batch Master", exportColumns, exportData)}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Batch Master", exportColumns, exportData)}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          {isAdmin && <label className="cursor-pointer"><Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import</span></Button><input type="file" accept=".csv" className="hidden" onChange={() => doImportCSV("/api/batches", [], loadBatches)} /></label>}
          <Button variant="ghost" size="sm" onClick={loadBatches}>
            <RefreshCw className={`h-4 w-4 ${bmLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Table */}
        {bmLoading ? <LoadingSpinner /> : bmFiltered.length === 0 ? (
          <EmptyState icon={Layers} message="No batches found" />
        ) : (
          <div className="border rounded-lg overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white text-xs">Batch Code</TableHead>
                  <TableHead className="text-white text-xs">Product</TableHead>
                  <TableHead className="text-white text-xs">Godown</TableHead>
                  <TableHead className="text-white text-xs text-right">Qty Received</TableHead>
                  <TableHead className="text-white text-xs text-right">Qty Sold</TableHead>
                  <TableHead className="text-white text-xs text-right">Qty On Hand</TableHead>
                  <TableHead className="text-white text-xs text-right">Cost/Unit</TableHead>
                  <TableHead className="text-white text-xs text-right">Sale/Unit</TableHead>
                  <TableHead className="text-white text-xs">Mfg Date</TableHead>
                  <TableHead className="text-white text-xs">Expiry Date</TableHead>
                  <TableHead className="text-white text-xs">Status</TableHead>
                  <TableHead className="text-white text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bmFiltered.map(item => {
                  const expired = isBatchExpired(item.expiryDate) && item.status === "Active";
                  return (
                    <TableRow key={item.id} className={expired ? "bg-red-50 dark:bg-red-900/10" : ""}>
                      <TableCell className="text-xs font-mono">{item.batchCode}</TableCell>
                      <TableCell className="text-xs font-medium">{item.product?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{item.godown?.name || godowns.find(g => g.id === item.godownId)?.name || "—"}</TableCell>
                      <TableCell className="text-xs text-right">{safeNum(item.quantityReceived).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{safeNum(item.quantitySold).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right font-medium">{safeNum(item.quantityOnHand).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.costPricePerUnit, isVatAuditor))}</TableCell>
                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.salePricePerUnit, isVatAuditor))}</TableCell>
                      <TableCell className="text-xs">{fmtDate(item.manufacturingDate)}</TableCell>
                      <TableCell className="text-xs">
                        <span className={expired ? "text-red-600 font-medium" : ""}>{fmtDate(item.expiryDate)}</span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={expired ? "Expired" : (item.status || "Active")} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {isAdmin && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openBmEdit(item)} title="Edit">
                              <Edit className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setBmDelete(item)} title="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Batch Dialog */}
        <Dialog open={bmDialog} onOpenChange={setBmDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{bmEdit ? "Edit Batch" : "Create Batch"}</DialogTitle>
              <DialogDescription>{bmEdit ? "Modify batch details" : "Register a new product batch"}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs">Product *</Label>
                  <Select value={bmForm.productId} onValueChange={handleBmProductChange}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Product" /></SelectTrigger>
                    <SelectContent>
                      {products.filter(p => p.isActive !== false).map(p => (
                        <SelectItem key={p.id} value={p.id}>{p.productCode} - {p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Godown</Label>
                  <Select value={bmForm.godownId} onValueChange={v => setBmForm(prev => ({ ...prev, godownId: v }))}>
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Godown" /></SelectTrigger>
                    <SelectContent>
                      {godowns.filter(g => g.isActive !== false).map(g => (
                        <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Quantity Received *</Label>
                  <Input type="number" min={0} step="1" value={bmForm.quantityReceived} onChange={e => setBmForm(prev => ({ ...prev, quantityReceived: Number(e.target.value) }))} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Cost Price/Unit (auto-filled)</Label>
                  <Input type="number" min={0} step="0.01" value={bmForm.costPricePerUnit} onChange={e => setBmForm(prev => ({ ...prev, costPricePerUnit: Number(e.target.value) }))} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Sale Price/Unit (auto-filled)</Label>
                  <Input type="number" min={0} step="0.01" value={bmForm.salePricePerUnit} onChange={e => setBmForm(prev => ({ ...prev, salePricePerUnit: Number(e.target.value) }))} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Manufacturing Date</Label>
                  <Input type="date" value={bmForm.manufacturingDate} onChange={e => setBmForm(prev => ({ ...prev, manufacturingDate: e.target.value }))} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Expiry Date</Label>
                  <Input type="date" value={bmForm.expiryDate} onChange={e => setBmForm(prev => ({ ...prev, expiryDate: e.target.value }))} className="h-9 text-xs" />
                </div>
                <div>
                  <Label className="text-xs">Supplier Lot No</Label>
                  <Input value={bmForm.supplierLotNo} onChange={e => setBmForm(prev => ({ ...prev, supplierLotNo: e.target.value }))} className="h-9 text-xs" placeholder="Supplier's lot reference" />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea value={bmForm.notes} onChange={e => setBmForm(prev => ({ ...prev, notes: e.target.value }))} className="text-xs" rows={2} placeholder="Optional notes" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBmDialog(false)}>Cancel</Button>
              <Button onClick={saveBm} disabled={bmSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {bmSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {bmEdit ? "Update" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!bmDelete} onOpenChange={() => setBmDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Batch</DialogTitle>
              <DialogDescription>Are you sure you want to delete batch {bmDelete?.batchCode}?</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBmDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteBm}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // RENDER: TAB 6 — VALUATION
  // ============================================================

  const renderValuation = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access valuation data." />;

    const exportColumns: ExportColumnDef[] = [
      { key: "productCode", label: "Product Code", type: "text" },
      { key: "productName", label: "Product Name", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "godown", label: "Godown", type: "text" },
      { key: "currentStock", label: "Current Stock", type: "number" },
      { key: "valuationPerUnit", label: "Valuation/Unit", type: "currency" },
      { key: "totalValue", label: "Total Value", type: "currency" },
      { key: "saleValue", label: "Sale Value", type: "currency" },
      { key: "potentialProfit", label: "Potential Profit", type: "currency" },
      { key: "marginPercent", label: "Margin %", type: "number" },
    ];

    return (
      <div className="space-y-4">
        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard label="Total Inventory Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(valStats.totalInventoryValue)} icon={CircleDollarSign} color="text-blue-600" bg="bg-blue-100 dark:bg-blue-900/30" />
          <StatCard label="Total Sale Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(valStats.totalSaleValue)} icon={DollarSign} color="text-emerald-600" bg="bg-emerald-100 dark:bg-emerald-900/30" />
          <StatCard label="Potential Profit" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(valStats.potentialProfit)} icon={TrendingUp} color="text-purple-600" bg="bg-purple-100 dark:bg-purple-900/30" />
          <StatCard label="Avg Margin %" value={isVatAuditor ? "N/A (Audit Mode)" : fmtPercent(valStats.avgMargin)} icon={Percent} color="text-amber-600" bg="bg-amber-100 dark:bg-amber-900/30" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <Select value={valFilterGodown} onValueChange={v => setValFilterGodown(v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Godown" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Godowns</SelectItem>
              {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={valFilterCategory} onValueChange={v => setValFilterCategory(v)}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={valMethod} onValueChange={v => setValMethod(v)}>
            <SelectTrigger className="w-44 h-9 text-xs"><SelectValue placeholder="Valuation Method" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Weighted Average">Weighted Average</SelectItem>
              <SelectItem value="FIFO">FIFO</SelectItem>
              <SelectItem value="LIFO">LIFO</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={valAsOfDate} onChange={e => setValAsOfDate(e.target.value)} className="h-9 w-36 text-xs" />
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={valSearch} onChange={e => setValSearch(e.target.value)} placeholder="Search valuation..." className="pl-8 h-9" />
          </div>
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Inventory Valuation", exportColumns, valFiltered)}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Inventory Valuation", exportColumns, valFiltered)}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          <Button variant="ghost" size="sm" onClick={loadValuation}>
            <RefreshCw className={`h-4 w-4 ${valLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* Table */}
        {valLoading ? <LoadingSpinner /> : valFiltered.length === 0 ? (
          <EmptyState icon={Calculator} message="No valuation data found. Select filters and refresh." />
        ) : (
          <div className="border rounded-lg overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white text-xs">Product Code</TableHead>
                  <TableHead className="text-white text-xs">Product Name</TableHead>
                  <TableHead className="text-white text-xs">Category</TableHead>
                  <TableHead className="text-white text-xs">Godown</TableHead>
                  <TableHead className="text-white text-xs text-right">Current Stock</TableHead>
                  <TableHead className="text-white text-xs text-right">Valuation/Unit</TableHead>
                  <TableHead className="text-white text-xs text-right">Total Value</TableHead>
                  <TableHead className="text-white text-xs text-right">Sale Value</TableHead>
                  <TableHead className="text-white text-xs text-right">Potential Profit</TableHead>
                  <TableHead className="text-white text-xs text-right">Margin %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {valFiltered.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-xs font-mono">{item.productCode}</TableCell>
                    <TableCell className="text-xs font-medium">{item.productName}</TableCell>
                    <TableCell className="text-xs">{item.category}</TableCell>
                    <TableCell className="text-xs">{item.godown}</TableCell>
                    <TableCell className="text-xs text-right">{safeNum(item.currentStock).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.valuationPerUnit, isVatAuditor))}</TableCell>
                    <TableCell className="text-xs text-right font-medium">{fmtCurrency(vatMask(item.totalValue, isVatAuditor))}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.saleValue, isVatAuditor))}</TableCell>
                    <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.potentialProfit, isVatAuditor))}</TableCell>
                    <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtPercent(item.marginPercent)}</TableCell>
                  </TableRow>
                ))}
                {/* Summary Row */}
                {!isVatAuditor && valFiltered.length > 0 && (
                  <TableRow className="bg-[#0a1628] dark:bg-[#0a1628] font-bold">
                    <TableCell colSpan={5} className="text-white text-xs text-right">TOTALS</TableCell>
                    <TableCell className="text-white text-xs text-right">—</TableCell>
                    <TableCell className="text-white text-xs text-right">{fmtCurrency(valTotals.totalValue)}</TableCell>
                    <TableCell className="text-white text-xs text-right">{fmtCurrency(valTotals.saleValue)}</TableCell>
                    <TableCell className="text-white text-xs text-right">{fmtCurrency(valTotals.potentialProfit)}</TableCell>
                    <TableCell className="text-white text-xs text-right">{fmtPercent(valTotals.avgMargin)}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-slate-900">
      <div className="flex-1">
        {/* Header */}
        <div className="bg-[#0a1628] dark:bg-[#0a1628] text-white px-4 sm:px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#2563eb] flex items-center justify-center">
              <Boxes className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Stock Management Module</h1>
              <p className="text-xs text-slate-400">Real-Time Inventory Control Framework</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-4 sm:px-6 py-4">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="flex overflow-x-auto h-auto gap-1 sm:gap-2 bg-slate-100 dark:bg-slate-800 p-1 pb-1 scrollbar-none">
              <TabsTrigger value="stock" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
                <Package className="h-3.5 w-3.5 mr-1" /> Stock Overview
              </TabsTrigger>
              <TabsTrigger value="stock-details" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
                <Eye className="h-3.5 w-3.5 mr-1" /> Stock Details
              </TabsTrigger>
              <TabsTrigger value="stock-transfers" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
                <ArrowRightLeft className="h-3.5 w-3.5 mr-1" /> Transfers
              </TabsTrigger>
              <TabsTrigger value="opening-stock" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
                <Archive className="h-3.5 w-3.5 mr-1" /> Opening Stock
              </TabsTrigger>
              <TabsTrigger value="batch-master" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
                <Layers className="h-3.5 w-3.5 mr-1" /> Batch Master
              </TabsTrigger>
              <TabsTrigger value="valuation" className="text-xs data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
                <Calculator className="h-3.5 w-3.5 mr-1" /> Valuation
              </TabsTrigger>
            </TabsList>

            <TabsContent value="stock" className="mt-4">{renderStockOverview()}</TabsContent>
            <TabsContent value="stock-details" className="mt-4">{renderStockDetails()}</TabsContent>
            <TabsContent value="stock-transfers" className="mt-4">{renderStockTransfers()}</TabsContent>
            <TabsContent value="opening-stock" className="mt-4">{renderOpeningStock()}</TabsContent>
            <TabsContent value="batch-master" className="mt-4">{renderBatchMaster()}</TabsContent>
            <TabsContent value="valuation" className="mt-4">{renderValuation()}</TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Sticky Footer */}
      <footer className="mt-auto bg-[#0a1628] text-slate-400 text-center py-3 text-xs">
        Developed &amp; Copyright by NextGen Digital Studio
      </footer>
    </div>
  );
}
