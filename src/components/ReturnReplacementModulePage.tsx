"use client";
// ============================================================
// VoltERP — ELECTRONICS MART IMS
// Return & Replacement Module Page: Purchase Returns, Replacements
// Theme: Deep Navy Blue (#0a1628, #132240) with accent blue (#2563eb)
// Footer: Developed & Copyright by NextGen Digital Studio
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Shield, X, CheckCircle, RotateCcw, Package,
  AlertTriangle, ChevronDown, ChevronRight, Clock, DollarSign,
  ArrowRightLeft, Banknote, Warehouse, FileWarning, AlertCircle,
  Loader2, PackageCheck, ArrowDownUp, BadgeDollarSign, Copy
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
import { apiFetch } from "@/lib/api-client";
import { copyTableToClipboard } from "@/lib/clipboard-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

import { fmtBDT as _fmtBDT, toLatinDigits } from "@/lib/number-format";

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)" || v === "N/A (Restricted)") return v;
  return _fmtBDT(Number(v));
};

const fmtDate = (d: string | Date) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt.getTime()) ? "—" : toLatinDigits(dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })); };

const safeNum = (v: any, fallback = 0) => {
  const n = Number(v);
  return isNaN(n) ? fallback : n;
};


function vatMask(val: any, isVatAuditor: boolean) {
  if (isVatAuditor) return "N/A (Audit Mode)";
  return val;
}

// ============================================================
// STATUS BADGE STYLES
// ============================================================

const STATUS_BADGE: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Processing: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <Badge className={`${cls} border-0 text-xs font-medium`}>{status}</Badge>;
}

// ============================================================
// STAT CARD COMPONENT
// ============================================================

function StatCard({ label, value, icon: Icon, color, bg }: {
  label: string; value: any; icon: React.ElementType; color: string; bg: string;
}) {
  return (
    <Card className="border-slate-200 dark:border-slate-700 overflow-hidden">
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
// PROPS
// ============================================================

interface ReturnReplacementModulePageProps {
  currentPage: string;
  userRole: string;
  isVatAuditor: boolean;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function ReturnReplacementModulePage({ currentPage, userRole, isVatAuditor }: ReturnReplacementModulePageProps) {
  const { toast } = useToast();
  const isAdmin = userRole === "admin";
  const isManager = userRole === "manager";
  const isSR = userRole === "sr";
  const isDealer = userRole === "dealer";
  const canCreate = isAdmin || isManager;
  const canDelete = isAdmin;

  // ─── Tab Mapping ───
  const tabMap: Record<string, string> = {
    "purchase-returns": "purchase-returns",
    "replacements": "replacements",
  };
  const [activeTab, setActiveTab] = useState(tabMap[currentPage] || "purchase-returns");

  useEffect(() => {
    const mapped = tabMap[currentPage];
    if (mapped && mapped !== activeTab) setActiveTab(mapped);
  }, [currentPage]);

  // ─── Shared Dropdowns ───
  const [companies, setCompanies] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);

  const loadDropdowns = useCallback(async () => {
    try { const r = await apiFetch("/api/companies"); setCompanies(Array.isArray(r) ? r : []); } catch (e) { console.error("Failed to load companies:", e); }
    try { const r = await apiFetch("/api/suppliers"); setSuppliers(Array.isArray(r) ? r : []); } catch (e) { console.error("Failed to load suppliers:", e); }
    try { const r = await apiFetch("/api/customers"); setCustomers(Array.isArray(r) ? r : []); } catch (e) { console.error("Failed to load customers:", e); }
    try { const r = await apiFetch("/api/products"); setProducts(Array.isArray(r) ? r : []); } catch (e) { console.error("Failed to load products:", e); }
    try { const r = await apiFetch("/api/godowns"); setGodowns(Array.isArray(r) ? r : []); } catch (e) { console.error("Failed to load godowns:", e); }
    try { const r = await apiFetch("/api/purchase-orders"); setPurchaseOrders(Array.isArray(r) ? r : []); } catch (e) { console.error("Failed to load purchase orders:", e); }
    try { const r = await apiFetch("/api/sales-orders"); setSalesOrders(Array.isArray(r) ? r : []); } catch (e) { console.error("Failed to load sales orders:", e); }
  }, []);

  useEffect(() => { loadDropdowns(); }, [loadDropdowns]);

  // ============================================================
  // PURCHASE RETURNS STATE
  // ============================================================

  const [prData, setPrData] = useState<any[]>([]);
  const [prLoading, setPrLoading] = useState(true);
  const [prSearch, setPrSearch] = useState("");
  const [prStatusFilter, setPrStatusFilter] = useState("all");
  const [prSupplierFilter, setPrSupplierFilter] = useState("all");
  const [prDateFrom, setPrDateFrom] = useState("");
  const [prDateTo, setPrDateTo] = useState("");
  const [prDialog, setPrDialog] = useState(false);
  const [prEdit, setPrEdit] = useState<any>(null);
  const [prSaving, setPrSaving] = useState(false);
  const [prDelete, setPrDelete] = useState<any>(null);
  const [prForm, setPrForm] = useState<Record<string, any>>({
    purchaseOrderId: "", supplierId: "", godownId: "",
    date: new Date().toISOString().split("T")[0],
    debitNoteCode: "", challanRef: "", reason: "",
    discountPercent: 0, vatPercentage: 0, status: "Pending",
  });
  const [prLines, setPrLines] = useState<any[]>([]);
  const [prExpandedRows, setPrExpandedRows] = useState<Set<string>>(new Set());
  const [prSelectedPoLines, setPrSelectedPoLines] = useState<any[]>([]);

  // ─── Purchase Return Computed Stats ───
  const prStats = useMemo(() => {
    const active = prData.filter(r => r.isActive !== false);
    return {
      total: active.length,
      returnValue: active.reduce((s, r) => s + safeNum(r.grandTotal), 0),
      cogsReversal: active.reduce((s, r) => s + safeNum(r.cogsReversal), 0),
      apAdjusted: active.filter(r => r.apAdjustmentPosted).length,
      pendingApproval: active.filter(r => r.status === "Pending").length,
      stockRealigned: active.filter(r => r.stockRealignPosted).length,
    };
  }, [prData]);

  // ─── Purchase Return Filtered Data ───
  const prFiltered = useMemo(() => {
    let data = prData.filter(r => r.isActive !== false);
    if (prStatusFilter !== "all") data = data.filter(r => r.status === prStatusFilter);
    if (prSupplierFilter !== "all") data = data.filter(r => r.supplierId === prSupplierFilter || r.purchaseOrder?.supplierId === prSupplierFilter);
    if (prDateFrom) data = data.filter(r => new Date(r.date) >= new Date(prDateFrom));
    if (prDateTo) data = data.filter(r => new Date(r.date) <= new Date(prDateTo + "T23:59:59"));
    if (prSearch) {
      const q = prSearch.toLowerCase();
      data = data.filter(r =>
        (r.returnNo || "").toLowerCase().includes(q) ||
        (r.debitNoteCode || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [prData, prStatusFilter, prSupplierFilter, prDateFrom, prDateTo, prSearch]);

  // ─── Purchase Return Loaders ───
  const loadPurchaseReturns = useCallback(async () => {
    setPrLoading(true);
    try {
      const params = new URLSearchParams();
      if (prStatusFilter !== "all") params.set("status", prStatusFilter);
      if (prSupplierFilter !== "all") params.set("supplierId", prSupplierFilter);
      if (prDateFrom) params.set("dateFrom", prDateFrom);
      if (prDateTo) params.set("dateTo", prDateTo);
      const qs = params.toString();
      const res = await apiFetch(`/api/purchase-returns${qs ? `?${qs}` : ""}`);
      setPrData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setPrLoading(false); }
  }, [toast, prStatusFilter, prSupplierFilter, prDateFrom, prDateTo]);

  // ─── Purchase Return: Load PO lines when selecting a purchase order ───
  const handlePrPoChange = useCallback(async (orderId: string) => {
    if (!orderId) { setPrSelectedPoLines([]); setPrLines([]); return; }
    try {
      const order = await apiFetch(`/api/purchase-orders/${orderId}`);
      setPrForm(prev => ({
        ...prev,
        purchaseOrderId: orderId,
        supplierId: order.supplierId || order.supplier?.id || "",
        godownId: order.godownId || order.godown?.id || "",
      }));
      const orderLines = order.lines || [];
      setPrSelectedPoLines(orderLines);
      setPrLines(orderLines.map((l: any) => ({
        productId: l.productId,
        quantity: 0,
        maxQuantity: l.quantity || 0,
        rate: l.rate || 0,
        discountPercent: l.discountPercent || 0,
        costPrice: l.costPrice || l.product?.costPrice || 0,
        availableStock: 0,
      })));
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [toast]);

  // ─── Purchase Return CRUD ───
  const openPrCreate = useCallback(() => {
    setPrEdit(null);
    setPrForm({
      purchaseOrderId: "", supplierId: "", godownId: "",
      date: new Date().toISOString().split("T")[0],
      debitNoteCode: "", challanRef: "", reason: "",
      discountPercent: 0, vatPercentage: 0, status: "Pending",
    });
    setPrLines([]);
    setPrSelectedPoLines([]);
    setPrDialog(true);
  }, []);

  const openPrEdit = useCallback((item: any) => {
    setPrEdit(item);
    setPrForm({
      purchaseOrderId: item.purchaseOrderId || "",
      supplierId: item.supplierId || "",
      godownId: item.godownId || "",
      date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
      debitNoteCode: item.debitNoteCode || "",
      challanRef: item.challanRef || "",
      reason: item.reason || "",
      discountPercent: item.discountPercent || 0,
      vatPercentage: item.vatPercentage || 0,
      status: item.status || "Pending",
    });
    setPrLines(item.lines?.length > 0
      ? item.lines.map((l: any) => ({
        productId: l.productId,
        quantity: l.quantity,
        maxQuantity: l.quantity,
        rate: l.rate,
        discountPercent: l.discountPercent || 0,
        costPrice: l.costPrice || 0,
        availableStock: l.availableStock || 0,
      }))
      : []
    );
    setPrDialog(true);
  }, []);

  const savePr = useCallback(async () => {
    if (!prForm.purchaseOrderId) { toast({ title: "Validation", description: "Purchase Order is required", variant: "destructive" }); return; }
    if (!prForm.date) { toast({ title: "Validation", description: "Date is required", variant: "destructive" }); return; }
    if (prLines.length === 0 || prLines.every(l => Number(l.quantity) === 0)) {
      toast({ title: "Validation", description: "At least one line item with quantity is required", variant: "destructive" }); return;
    }
    setPrSaving(true);
    try {
      const lineItems = prLines.filter(l => Number(l.quantity) > 0).map(l => ({
        productId: l.productId,
        quantity: Number(l.quantity) || 0,
        rate: Number(l.rate) || 0,
        discountPercent: Number(l.discountPercent) || 0,
      }));
      const payload = { ...prForm, lines: lineItems };
      if (prEdit) {
        await apiFetch(`/api/purchase-returns/${prEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Purchase return updated" });
      } else {
        await apiFetch("/api/purchase-returns", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Purchase return created" });
      }
      setPrDialog(false);
      loadPurchaseReturns();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setPrSaving(false); }
  }, [prForm, prLines, prEdit, toast, loadPurchaseReturns]);

  const deletePr = useCallback(async () => {
    if (!prDelete) return;
    try {
      await apiFetch(`/api/purchase-returns/${prDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Purchase return deleted" });
      setPrDelete(null);
      loadPurchaseReturns();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [prDelete, toast, loadPurchaseReturns]);

  const togglePrExpand = useCallback((id: string) => {
    setPrExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ─── Purchase Return Line Helpers ───
  const prLineTotal = useCallback((line: any) => {
    const qty = Number(line.quantity) || 0;
    const rate = Number(line.rate) || 0;
    const disc = Number(line.discountPercent) || 0;
    return qty * rate * (1 - disc / 100);
  }, []);

  const prComputedTotals = useMemo(() => {
    const subTotal = prLines.reduce((s, l) => s + prLineTotal(l), 0);
    const discountAmt = subTotal * (Number(prForm.discountPercent) || 0) / 100;
    const afterDiscount = subTotal - discountAmt;
    const vatAmt = afterDiscount * (Number(prForm.vatPercentage) || 0) / 100;
    const grandTotal = afterDiscount + vatAmt;
    const cogsReversal = prLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0), 0);
    return { subTotal, discountAmt, afterDiscount, vatAmt, grandTotal, cogsReversal };
  }, [prLines, prForm.discountPercent, prForm.vatPercentage, prLineTotal]);

  // ============================================================
  // REPLACEMENT ORDERS STATE
  // ============================================================

  const [rplData, setRplData] = useState<any[]>([]);
  const [rplLoading, setRplLoading] = useState(true);
  const [rplSearch, setRplSearch] = useState("");
  const [rplStatusFilter, setRplStatusFilter] = useState("all");
  const [rplSupplierFilter, setRplSupplierFilter] = useState("all");
  const [rplCustomerFilter, setRplCustomerFilter] = useState("all");
  const [rplDialog, setRplDialog] = useState(false);
  const [rplEdit, setRplEdit] = useState<any>(null);
  const [rplSaving, setRplSaving] = useState(false);
  const [rplDelete, setRplDelete] = useState<any>(null);
  const [rplForm, setRplForm] = useState<Record<string, any>>({
    salesOrderId: "", supplierId: "", customerId: "",
    date: new Date().toISOString().split("T")[0],
    reason: "", notes: "", status: "Pending",
  });
  const [rplLines, setRplLines] = useState<any[]>([]);
  const [rplExpandedRows, setRplExpandedRows] = useState<Set<string>>(new Set());

  // ─── Replacement Computed Stats ───
  const rplStats = useMemo(() => {
    const active = rplData.filter(r => r.isActive !== false);
    return {
      total: active.length,
      originalCostTotal: active.reduce((s, r) => s + safeNum(r.originalCostTotal), 0),
      replacementCostTotal: active.reduce((s, r) => s + safeNum(r.replacementCostTotal), 0),
      netAdjustment: active.reduce((s, r) => s + safeNum(r.adjustmentAmount), 0),
      stockAdjusted: active.filter(r => r.stockAdjustmentPosted).length,
      pendingApproval: active.filter(r => r.status === "Pending").length,
    };
  }, [rplData]);

  // ─── Replacement Filtered Data ───
  const rplFiltered = useMemo(() => {
    let data = rplData.filter(r => r.isActive !== false);
    if (rplStatusFilter !== "all") data = data.filter(r => r.status === rplStatusFilter);
    if (rplSupplierFilter !== "all") data = data.filter(r => r.supplierId === rplSupplierFilter);
    if (rplCustomerFilter !== "all") data = data.filter(r => r.customerId === rplCustomerFilter);
    if (rplSearch) {
      const q = rplSearch.toLowerCase();
      data = data.filter(r =>
        (r.replacementNo || "").toLowerCase().includes(q) ||
        (r.reason || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [rplData, rplStatusFilter, rplSupplierFilter, rplCustomerFilter, rplSearch]);

  // ─── Replacement Loaders ───
  const loadReplacements = useCallback(async () => {
    setRplLoading(true);
    try {
      const params = new URLSearchParams();
      if (rplStatusFilter !== "all") params.set("status", rplStatusFilter);
      if (rplSupplierFilter !== "all") params.set("supplierId", rplSupplierFilter);
      if (rplCustomerFilter !== "all") params.set("customerId", rplCustomerFilter);
      const qs = params.toString();
      const res = await apiFetch(`/api/replacements${qs ? `?${qs}` : ""}`);
      setRplData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setRplLoading(false); }
  }, [toast, rplStatusFilter, rplSupplierFilter, rplCustomerFilter]);

  // ─── Replacement CRUD ───
  const openRplCreate = useCallback(() => {
    setRplEdit(null);
    setRplForm({
      salesOrderId: "", supplierId: "", customerId: "",
      date: new Date().toISOString().split("T")[0],
      reason: "", notes: "", status: "Pending",
    });
    setRplLines([{ productId: "", replacementProductId: "", quantity: 1, rate: 0, replacementRate: 0 }]);
    setRplDialog(true);
  }, []);

  const openRplEdit = useCallback((item: any) => {
    setRplEdit(item);
    setRplForm({
      salesOrderId: item.salesOrderId || "",
      supplierId: item.supplierId || "",
      customerId: item.customerId || "",
      date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
      reason: item.reason || "",
      notes: item.notes || "",
      status: item.status || "Pending",
    });
    setRplLines(item.lines?.length > 0
      ? item.lines.map((l: any) => ({
        productId: l.productId,
        replacementProductId: l.replacementProductId || "",
        quantity: l.quantity,
        rate: l.rate || 0,
        replacementRate: l.replacementRate || 0,
        costPrice: l.costPrice || 0,
        replacementCostPrice: l.replacementCostPrice || 0,
      }))
      : [{ productId: "", replacementProductId: "", quantity: 1, rate: 0, replacementRate: 0 }]
    );
    setRplDialog(true);
  }, []);

  const saveRpl = useCallback(async () => {
    if (!rplForm.date) { toast({ title: "Validation", description: "Date is required", variant: "destructive" }); return; }
    if (rplLines.length === 0 || rplLines.every(l => !l.productId && !l.replacementProductId)) {
      toast({ title: "Validation", description: "At least one line item with products is required", variant: "destructive" }); return;
    }
    setRplSaving(true);
    try {
      const lineItems = rplLines.filter(l => l.productId || l.replacementProductId).map(l => ({
        productId: l.productId || null,
        replacementProductId: l.replacementProductId || null,
        quantity: Number(l.quantity) || 1,
        rate: Number(l.rate) || 0,
        replacementRate: Number(l.replacementRate) || 0,
      }));
      const payload = { ...rplForm, lines: lineItems };
      if (rplEdit) {
        await apiFetch(`/api/replacements/${rplEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Replacement order updated" });
      } else {
        await apiFetch("/api/replacements", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Replacement order created" });
      }
      setRplDialog(false);
      loadReplacements();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setRplSaving(false); }
  }, [rplForm, rplLines, rplEdit, toast, loadReplacements]);

  const deleteRpl = useCallback(async () => {
    if (!rplDelete) return;
    try {
      await apiFetch(`/api/replacements/${rplDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Replacement order deleted" });
      setRplDelete(null);
      loadReplacements();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [rplDelete, toast, loadReplacements]);

  const toggleRplExpand = useCallback((id: string) => {
    setRplExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ─── Replacement Line Helpers ───
  const rplComputedTotals = useMemo(() => {
    const originalCostTotal = rplLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
    const replacementCostTotal = rplLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.replacementRate) || 0), 0);
    const netAdjustment = replacementCostTotal - originalCostTotal;
    return { originalCostTotal, replacementCostTotal, netAdjustment };
  }, [rplLines]);

  // ============================================================
  // INIT: Load data based on active tab
  // ============================================================

  useEffect(() => {
    if (activeTab === "purchase-returns") loadPurchaseReturns();
    if (activeTab === "replacements") loadReplacements();
  }, [activeTab, loadPurchaseReturns, loadReplacements]);

  // ============================================================
  // EXPORT HELPERS
  // ============================================================

  const getCompanyProfile = useCallback(async () => {
    try {
      const comps = companies;
      if (comps.length > 0) {
        return {
          name: comps[0].name || "VoltERP",
          address: comps[0].address || "",
          phone: comps[0].phone || "",
          mobile: comps[0].mobile || "",
          email: comps[0].email || "",
          vatNumber: comps[0].vatNumber || "",
          tradeLicense: comps[0].tradeLicense || "",
          logo: comps[0].logo || undefined,
        };
      }
    } catch (e) { console.warn("Failed to load company branding for PDF:", e); }
    return undefined;
  }, [companies]);

  const doExportPR = useCallback(async (format: "pdf" | "csv") => {
    const columns: ExportColumnDef[] = [
      { key: "returnNo", label: "Return No", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "poNumber", label: "PO Number", type: "text" },
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "subTotal", label: "SubTotal", type: "currency" },
      { key: "discount", label: "Discount", type: "currency" },
      { key: "vatAmount", label: "VAT", type: "currency" },
      { key: "grandTotal", label: "Grand Total", type: "currency" },
      { key: "cogsReversal", label: "COGS Reversal", type: "currency" },
      { key: "apAdjustmentPosted", label: "AP Posted", type: "text" },
      { key: "status", label: "Status", type: "text" },
    ];
    const data = prFiltered.map((r: any) => ({
      ...r,
      poNumber: r.purchaseOrder?.poNumber || "—",
      supplierName: r.supplier?.name || r.purchaseOrder?.supplier?.name || "—",
      discount: r.discount || 0,
      apAdjustmentPosted: r.apAdjustmentPosted ? "Yes" : "No",
    }));
    const maskedKeys = getVatMaskedKeys(columns);
    const company = await getCompanyProfile();
    if (format === "pdf") {
      exportToPDF({
        title: "Purchase Return Registry",
        columns, data, isVatAuditor, vatMaskedColumns: maskedKeys,
        orientation: "landscape", company,
        financialFooter: { printedBy: (() => { try { const a = JSON.parse(localStorage.getItem("ems_auth") || "{}"); return a.user?.displayName || a.user?.name || "System"; } catch { return "System"; } })() },
        systemNotice: "This is a computer-generated document. Verify with official records.",
      });
    } else {
      exportToCSV({ title: "Purchase Return Registry", columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
    }
    toast({ title: "Exported", description: `Purchase Returns ${format.toUpperCase()} exported` });
  }, [prFiltered, isVatAuditor, userRole, getCompanyProfile, toast]);

  const doExportRPL = useCallback(async (format: "pdf" | "csv") => {
    const columns: ExportColumnDef[] = [
      { key: "replacementNo", label: "Replacement No", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "salesOrderNo", label: "Sales Order", type: "text" },
      { key: "supplierName", label: "Supplier", type: "text" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "originalCostTotal", label: "Original Cost", type: "currency" },
      { key: "replacementCostTotal", label: "Replacement Cost", type: "currency" },
      { key: "adjustmentAmount", label: "Net Adjustment", type: "currency" },
      { key: "stockAdjustmentPosted", label: "Stock Posted", type: "text" },
      { key: "financialAdjustmentPosted", label: "Ledger Posted", type: "text" },
      { key: "status", label: "Status", type: "text" },
    ];
    const data = rplFiltered.map((r: any) => ({
      ...r,
      salesOrderNo: r.salesOrder?.invoiceNo || "—",
      supplierName: r.supplier?.name || "—",
      customerName: r.customer?.name || "—",
      stockAdjustmentPosted: r.stockAdjustmentPosted ? "Yes" : "No",
      financialAdjustmentPosted: r.financialAdjustmentPosted ? "Yes" : "No",
    }));
    const maskedKeys = getVatMaskedKeys(columns);
    const company = await getCompanyProfile();
    if (format === "pdf") {
      exportToPDF({
        title: "Replacement Order Registry",
        columns, data, isVatAuditor, vatMaskedColumns: maskedKeys,
        orientation: "landscape", company,
        financialFooter: { printedBy: (() => { try { const a = JSON.parse(localStorage.getItem("ems_auth") || "{}"); return a.user?.displayName || a.user?.name || "System"; } catch { return "System"; } })() },
        systemNotice: "This is a computer-generated document. Verify with official records.",
      });
    } else {
      exportToCSV({ title: "Replacement Order Registry", columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
    }
    toast({ title: "Exported", description: `Replacement Orders ${format.toUpperCase()} exported` });
  }, [rplFiltered, isVatAuditor, userRole, getCompanyProfile, toast]);

  const doImportPR = useCallback(async () => {
    const fields: ExportFieldDef[] = [
      { key: "supplierCode", label: "Supplier Code", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "productCode", label: "Product Code", type: "text", required: true },
      { key: "quantity", label: "Quantity", type: "number", required: true },
      { key: "rate", label: "Rate", type: "number", required: true },
    ];
    try {
      const result = await importFromCSV({
        apiPath: "/api/purchase-returns?import=true",
        formFields: fields,
      });
      if (result.imported > 0) {
        toast({ title: "Import Complete", description: `${result.imported} rows imported, ${result.failed} failed` });
        loadPurchaseReturns();
      } else if (result.errors.length > 0) {
        toast({ title: "Import Failed", description: result.errors[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    }
  }, [toast, loadPurchaseReturns]);

  const doImportRPL = useCallback(async () => {
    const fields: ExportFieldDef[] = [
      { key: "salesOrderNo", label: "Sales Order No", type: "text", required: true },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "productCode", label: "Product Code", type: "text", required: true },
      { key: "quantity", label: "Quantity", type: "number", required: true },
      { key: "reason", label: "Reason", type: "text" },
    ];
    try {
      const result = await importFromCSV({
        apiPath: "/api/replacements?import=true",
        formFields: fields,
      });
      if (result.imported > 0) {
        toast({ title: "Import Complete", description: `${result.imported} rows imported, ${result.failed} failed` });
        loadReplacements();
      } else if (result.errors.length > 0) {
        toast({ title: "Import Failed", description: result.errors[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    }
  }, [toast, loadReplacements]);

  // ============================================================
  // ACCESS DENIED COMPONENT
  // ============================================================

  const AccessDenied = ({ message }: { message: string }) => (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Shield className="h-12 w-12 text-red-500 mb-4" />
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Access Denied</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{message}</p>
    </div>
  );

  // ============================================================
  // TAB 1: PURCHASE RETURNS REGISTRY
  // ============================================================

  const renderPurchaseReturns = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access Purchase Returns." />;

    return (
      <div className="space-y-4">
        {isVatAuditor && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — All financial columns are masked</span>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
          <StatCard label="Total Returns" value={prStats.total} icon={RotateCcw} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Return Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(prStats.returnValue)} icon={DollarSign} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="COGS Reversal" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(prStats.cogsReversal)} icon={BadgeDollarSign} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="AP Adjusted" value={prStats.apAdjusted} icon={Banknote} color="text-purple-500" bg="bg-purple-500/10" />
          <StatCard label="Pending Approval" value={prStats.pendingApproval} icon={Clock} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Stock Realigned" value={prStats.stockRealigned} icon={Warehouse} color="text-emerald-500" bg="bg-emerald-500/10" />
        </div>

        {/* Filter Bar */}
        <Card className="border-slate-200 dark:border-slate-700 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={prStatusFilter} onValueChange={setPrStatusFilter}>
                <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={prSupplierFilter} onValueChange={setPrSupplierFilter}>
                <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input type="date" value={prDateFrom} onChange={e => setPrDateFrom(e.target.value)} className="w-[140px] h-9 text-xs" placeholder="From" />
              <Input type="date" value={prDateTo} onChange={e => setPrDateTo(e.target.value)} className="w-[140px] h-9 text-xs" placeholder="To" />
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input placeholder="Search return no, debit note, reason..." value={prSearch} onChange={e => setPrSearch(e.target.value)} className="pl-9 h-9 text-xs" />
              </div>
              <Button variant="outline" size="sm" onClick={loadPurchaseReturns} disabled={prLoading} className="h-9">
                <RefreshCw className={`h-4 w-4 mr-1 ${prLoading ? "animate-spin" : ""}`} />Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => doExportPR("csv")} className="h-9">
                <Download className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Export </span>CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => doExportPR("pdf")} className="h-9">
                <FileDown className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Export </span>PDF
              </Button>
              <Button variant="outline" size="sm" onClick={async () => {
                const columns: ExportColumnDef[] = [
                  { key: "returnNo", label: "Return No", type: "text" },
                  { key: "date", label: "Date", type: "date" },
                  { key: "poNumber", label: "PO Number", type: "text" },
                  { key: "supplierName", label: "Supplier", type: "text" },
                  { key: "subTotal", label: "SubTotal", type: "currency" },
                  { key: "discount", label: "Discount", type: "currency" },
                  { key: "vatAmount", label: "VAT", type: "currency" },
                  { key: "grandTotal", label: "Grand Total", type: "currency" },
                  { key: "status", label: "Status", type: "text" },
                ];
                const data = prFiltered.map((r: any) => ({ ...r, poNumber: r.purchaseOrder?.poNumber || "—", supplierName: r.supplier?.name || r.purchaseOrder?.supplier?.name || "—", discount: r.discount || 0 }));
                const result = await copyTableToClipboard({ title: "Purchase Return Registry", columns, data, isVatAuditor, vatMaskedColumns: getVatMaskedKeys(columns) });
                if (result.success) { toast({ title: "Copied", description: result.message }); } else { toast({ title: "Copy Failed", description: result.message, variant: "destructive" }); }
              }} className="h-9">
                <Copy className="h-4 w-4 mr-1" />Copy
              </Button>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={doImportPR} className="h-9">
                  <Upload className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Import </span>CSV
                </Button>
              )}
              {canCreate && (
                <Button size="sm" onClick={openPrCreate} className="h-9 bg-[#2563eb] hover:bg-[#1d4ed8]">
                  <Plus className="h-4 w-4 mr-1" />Create Return
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-slate-200 dark:border-slate-700 overflow-hidden">
          <CardContent className="p-0 overflow-hidden">
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    <TableHead className="text-white text-xs w-8"></TableHead>
                    <TableHead className="text-white text-xs">Return No</TableHead>
                    <TableHead className="text-white text-xs">Date</TableHead>
                    <TableHead className="text-white text-xs">PO Number</TableHead>
                    <TableHead className="text-white text-xs">Supplier</TableHead>
                    <TableHead className="text-white text-xs">Godown</TableHead>
                    <TableHead className="text-white text-xs text-right">SubTotal</TableHead>
                    <TableHead className="text-white text-xs text-right">Discount</TableHead>
                    <TableHead className="text-white text-xs text-right">VAT</TableHead>
                    <TableHead className="text-white text-xs text-right">Grand Total</TableHead>
                    <TableHead className="text-white text-xs text-right">COGS Reversal</TableHead>
                    <TableHead className="text-white text-xs">AP Posted</TableHead>
                    <TableHead className="text-white text-xs">Stock Realign</TableHead>
                    <TableHead className="text-white text-xs">Status</TableHead>
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prLoading ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center py-8 text-slate-400">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Loading purchase returns...
                      </TableCell>
                    </TableRow>
                  ) : prFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={15} className="text-center py-8 text-slate-400">
                        <RotateCcw className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="font-medium">No purchase returns found</p>
                        <p className="text-xs">Create a new return or adjust your filters</p>
                      </TableCell>
                    </TableRow>
                  ) : prFiltered.map((item: any) => (
                    <React.Fragment key={item.id}>
                      <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => togglePrExpand(item.id)}>
                        <TableCell className="text-xs">
                          {prExpandedRows.has(item.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{item.returnNo || `PRT-${String(item.id).padStart(5, "0")}`}</TableCell>
                        <TableCell className="text-xs">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-xs">{item.purchaseOrder?.poNumber || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{item.supplier?.name || item.purchaseOrder?.supplier?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{item.godown?.name || "—"}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.subTotal)}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.discount)}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.vatAmount)}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.grandTotal)}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.cogsReversal)}</TableCell>
                        <TableCell className="text-xs">{item.apAdjustmentPosted ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-slate-300" />}</TableCell>
                        <TableCell className="text-xs">{item.stockRealignPosted ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-slate-300" />}</TableCell>
                        <TableCell className="text-xs"><StatusBadge status={item.status || "Pending"} /></TableCell>
                        <TableCell className="text-xs" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            {!isSR && (
                              <Button variant="ghost" size="sm" onClick={() => openPrEdit(item)} className="h-7 w-7 p-0">
                                <Edit className="h-3 w-3" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="sm" onClick={() => setPrDelete(item)} className="h-7 w-7 p-0 text-red-500">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {prExpandedRows.has(item.id) && item.lines?.length > 0 && (
                        <TableRow className="bg-slate-50 dark:bg-slate-800/30">
                          <TableCell colSpan={15} className="p-3">
                            <div className="ml-6 text-xs">
                              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Line Items</p>
                              <div className="overflow-x-auto border rounded-lg">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-slate-100 dark:bg-slate-700/50">
                                      <TableHead className="text-xs">Product</TableHead>
                                      <TableHead className="text-xs text-right">Qty</TableHead>
                                      <TableHead className="text-xs text-right">Rate</TableHead>
                                      <TableHead className="text-xs text-right">Disc%</TableHead>
                                      <TableHead className="text-xs text-right">Total</TableHead>
                                      <TableHead className="text-xs text-right">Cost Price</TableHead>
                                      <TableHead className="text-xs text-right">COGS Reversal</TableHead>
                                      <TableHead className="text-xs text-right">Available Stock</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {item.lines.map((line: any, idx: number) => (
                                      <TableRow key={idx}>
                                        <TableCell className="text-xs">{line.product?.name || line.productId || "—"}</TableCell>
                                        <TableCell className="text-xs text-right">{line.quantity}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.rate)}</TableCell>
                                        <TableCell className="text-xs text-right">{line.discountPercent || 0}%</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.total)}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.costPrice)}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.cogsReversal)}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.availableStock)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={prDialog} onOpenChange={setPrDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{prEdit ? "Edit" : "Create"} Purchase Return</DialogTitle>
              <DialogDescription>Select a purchase order and enter return details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Purchase Order <span className="text-red-500">*</span></Label>
                  <Select value={prForm.purchaseOrderId || ""} onValueChange={handlePrPoChange} disabled={!!prEdit && prEdit.status !== "Pending"}>
                    <SelectTrigger><SelectValue placeholder="Select Purchase Order" /></SelectTrigger>
                    <SelectContent>
                      {purchaseOrders.filter((p: any) => p.status !== "Cancelled" && p.status !== "Draft").map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.poNumber || `PO-${String(p.id).padStart(5, "0")}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Supplier</Label>
                  <Input value={suppliers.find((s: any) => s.id === prForm.supplierId)?.name || "—"} disabled className="bg-slate-50 dark:bg-slate-800" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Godown</Label>
                  <Select value={prForm.godownId || ""} onValueChange={v => setPrForm(p => ({ ...p, godownId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                    <SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={prForm.date || ""} onChange={e => setPrForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Debit Note Code</Label>
                  <Input value={prForm.debitNoteCode || ""} onChange={e => setPrForm(p => ({ ...p, debitNoteCode: e.target.value }))} placeholder="Auto-generated if blank" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Challan Ref</Label>
                  <Input value={prForm.challanRef || ""} onChange={e => setPrForm(p => ({ ...p, challanRef: e.target.value }))} placeholder="Challan reference" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Reason</Label>
                  <Textarea value={prForm.reason || ""} onChange={e => setPrForm(p => ({ ...p, reason: e.target.value }))} rows={2} placeholder="Return reason" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Discount %</Label>
                  <Input type="number" step="0.01" min="0" max="100" value={prForm.discountPercent || 0} onChange={e => setPrForm(p => ({ ...p, discountPercent: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">VAT %</Label>
                  <Input type="number" step="0.01" min="0" max="100" value={prForm.vatPercentage || 0} onChange={e => setPrForm(p => ({ ...p, vatPercentage: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Status</Label>
                  <Select value={prForm.status || "Pending"} onValueChange={v => setPrForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Rejected">Rejected</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* AP Adjustment Warning */}
              {prForm.supplierId && prComputedTotals.grandTotal > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium text-amber-700 dark:text-amber-400">AP Adjustment Impact</p>
                    <p className="text-amber-600 dark:text-amber-500">Supplier balance will be reduced by {fmtCurrency(prComputedTotals.grandTotal)}. Current supplier: {suppliers.find((s: any) => s.id === prForm.supplierId)?.name || "—"}</p>
                  </div>
                </div>
              )}

              {/* Line Items */}
              {prLines.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-900 dark:text-white">Return Items</Label>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                          <TableHead className="text-white text-xs">Product</TableHead>
                          <TableHead className="text-white text-xs text-right">Max Qty</TableHead>
                          <TableHead className="text-white text-xs text-right">Return Qty</TableHead>
                          <TableHead className="text-white text-xs text-right">Rate</TableHead>
                          <TableHead className="text-white text-xs text-right">Disc%</TableHead>
                          <TableHead className="text-white text-xs text-right">Total</TableHead>
                          <TableHead className="text-white text-xs text-right">Cost Price</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {prLines.map((line: any, idx: number) => {
                          const prod = products.find((p: any) => p.id === line.productId);
                          const lineTotal = prLineTotal(line);
                          const exceedsMax = Number(line.quantity) > Number(line.maxQuantity);
                          return (
                            <TableRow key={idx} className={exceedsMax ? "bg-red-50 dark:bg-red-900/20" : ""}>
                              <TableCell className="text-xs">{prod?.name || line.productId || "—"}</TableCell>
                              <TableCell className="text-xs text-right">{line.maxQuantity || "—"}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  max={line.maxQuantity || 999}
                                  value={line.quantity || 0}
                                  onChange={e => {
                                    const val = Math.min(Number(e.target.value), line.maxQuantity || 999);
                                    setPrLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: val } : l));
                                  }}
                                  className="h-8 w-20 text-xs"
                                />
                                {exceedsMax && <p className="text-[10px] text-red-500 mt-0.5">Exceeds PO qty</p>}
                              </TableCell>
                              <TableCell className="text-xs text-right">{fmtCurrency(line.rate)}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  max="100"
                                  value={line.discountPercent || 0}
                                  onChange={e => setPrLines(prev => prev.map((l, i) => i === idx ? { ...l, discountPercent: Number(e.target.value) } : l))}
                                  className="h-8 w-16 text-xs"
                                />
                              </TableCell>
                              <TableCell className="text-xs text-right font-medium">{fmtCurrency(lineTotal)}</TableCell>
                              <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.costPrice)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* Computed Totals */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div><span className="text-slate-500 dark:text-slate-400">SubTotal:</span> <span className="font-medium">{fmtCurrency(prComputedTotals.subTotal)}</span></div>
                  <div><span className="text-slate-500 dark:text-slate-400">Discount:</span> <span className="font-medium">{fmtCurrency(prComputedTotals.discountAmt)}</span></div>
                  <div><span className="text-slate-500 dark:text-slate-400">VAT:</span> <span className="font-medium">{fmtCurrency(prComputedTotals.vatAmt)}</span></div>
                  <div><span className="text-slate-500 dark:text-slate-400">Grand Total:</span> <span className="font-bold text-[#2563eb]">{fmtCurrency(prComputedTotals.grandTotal)}</span></div>
                  <div><span className="text-slate-500 dark:text-slate-400">COGS Reversal:</span> <span className="font-medium text-amber-600">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(prComputedTotals.cogsReversal)}</span></div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPrDialog(false)}>Cancel</Button>
              <Button onClick={savePr} disabled={prSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {prSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving...</> : "Save Return"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!prDelete} onOpenChange={() => setPrDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Purchase Return</DialogTitle>
              <DialogDescription>This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm text-red-700 dark:text-red-400">
                <p className="font-medium">Warning: Financial Impact</p>
                <ul className="list-disc ml-4 mt-1 text-xs space-y-1">
                  <li>Stock reversal will be triggered — items will be restocked to inventory</li>
                  <li>AP adjustment will be reversed — supplier balance will be increased</li>
                  {prDelete?.apAdjustmentPosted && <li className="font-semibold">This return has an AP adjustment posted that will be reversed</li>}
                  {prDelete?.stockRealignPosted && <li className="font-semibold">This return has stock realignment posted that will be reversed</li>}
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPrDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deletePr}>Delete Return</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // TAB 2: REPLACEMENT ORDERS
  // ============================================================

  const renderReplacements = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access Replacement Orders." />;

    return (
      <div className="space-y-4">
        {isVatAuditor && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — All financial columns are masked</span>
          </div>
        )}

        {/* Stat Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
          <StatCard label="Total Replacements" value={rplStats.total} icon={ArrowRightLeft} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Original Cost" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(rplStats.originalCostTotal)} icon={DollarSign} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Replacement Cost" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(rplStats.replacementCostTotal)} icon={PackageCheck} color="text-purple-500" bg="bg-purple-500/10" />
          <StatCard label="Net Adjustment" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(rplStats.netAdjustment)} icon={ArrowDownUp} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="Stock Adjusted" value={rplStats.stockAdjusted} icon={Warehouse} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="Pending Approval" value={rplStats.pendingApproval} icon={Clock} color="text-amber-500" bg="bg-amber-500/10" />
        </div>

        {/* Filter Bar */}
        <Card className="border-slate-200 dark:border-slate-700 overflow-hidden">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={rplStatusFilter} onValueChange={setRplStatusFilter}>
                <SelectTrigger className="w-[140px] h-9 text-xs"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Processing">Processing</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select value={rplSupplierFilter} onValueChange={setRplSupplierFilter}>
                <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={rplCustomerFilter} onValueChange={setRplCustomerFilter}>
                <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Customer" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                <Input placeholder="Search replacement no, reason..." value={rplSearch} onChange={e => setRplSearch(e.target.value)} className="pl-9 h-9 text-xs" />
              </div>
              <Button variant="outline" size="sm" onClick={loadReplacements} disabled={rplLoading} className="h-9">
                <RefreshCw className={`h-4 w-4 mr-1 ${rplLoading ? "animate-spin" : ""}`} />Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={() => doExportRPL("csv")} className="h-9">
                <Download className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Export </span>CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => doExportRPL("pdf")} className="h-9">
                <FileDown className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Export </span>PDF
              </Button>
              <Button variant="outline" size="sm" onClick={async () => {
                const columns: ExportColumnDef[] = [
                  { key: "replacementNo", label: "Replacement No", type: "text" },
                  { key: "date", label: "Date", type: "date" },
                  { key: "salesOrderNo", label: "Sales Order", type: "text" },
                  { key: "supplierName", label: "Supplier", type: "text" },
                  { key: "customerName", label: "Customer", type: "text" },
                  { key: "originalCostTotal", label: "Original Cost", type: "currency" },
                  { key: "replacementCostTotal", label: "Replacement Cost", type: "currency" },
                  { key: "adjustmentAmount", label: "Net Adjustment", type: "currency" },
                  { key: "status", label: "Status", type: "text" },
                ];
                const data = rplFiltered.map((r: any) => ({ ...r, salesOrderNo: r.salesOrder?.orderNo || "—", supplierName: r.supplier?.name || "—", customerName: r.customer?.name || "—" }));
                const result = await copyTableToClipboard({ title: "Replacement Order Registry", columns, data, isVatAuditor, vatMaskedColumns: getVatMaskedKeys(columns) });
                if (result.success) { toast({ title: "Copied", description: result.message }); } else { toast({ title: "Copy Failed", description: result.message, variant: "destructive" }); }
              }} className="h-9">
                <Copy className="h-4 w-4 mr-1" />Copy
              </Button>
              {isAdmin && (
                <Button variant="outline" size="sm" onClick={doImportRPL} className="h-9">
                  <Upload className="h-4 w-4 mr-1" /><span className="hidden sm:inline">Import </span>CSV
                </Button>
              )}
              {canCreate && (
                <Button size="sm" onClick={openRplCreate} className="h-9 bg-[#2563eb] hover:bg-[#1d4ed8]">
                  <Plus className="h-4 w-4 mr-1" />Create Replacement
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="border-slate-200 dark:border-slate-700 overflow-hidden">
          <CardContent className="p-0 overflow-hidden">
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    <TableHead className="text-white text-xs w-8"></TableHead>
                    <TableHead className="text-white text-xs">Replacement No</TableHead>
                    <TableHead className="text-white text-xs">Date</TableHead>
                    <TableHead className="text-white text-xs">Sales Order</TableHead>
                    <TableHead className="text-white text-xs">Supplier</TableHead>
                    <TableHead className="text-white text-xs">Customer</TableHead>
                    <TableHead className="text-white text-xs text-right">Original Cost</TableHead>
                    <TableHead className="text-white text-xs text-right">Replacement Cost</TableHead>
                    <TableHead className="text-white text-xs text-right">Net Adjustment</TableHead>
                    <TableHead className="text-white text-xs">Stock Posted</TableHead>
                    <TableHead className="text-white text-xs">Ledger Posted</TableHead>
                    <TableHead className="text-white text-xs">Status</TableHead>
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rplLoading ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-slate-400">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                        Loading replacements...
                      </TableCell>
                    </TableRow>
                  ) : rplFiltered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={13} className="text-center py-8 text-slate-400">
                        <ArrowRightLeft className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="font-medium">No replacement orders found</p>
                        <p className="text-xs">Create a new replacement or adjust your filters</p>
                      </TableCell>
                    </TableRow>
                  ) : rplFiltered.map((item: any) => (
                    <React.Fragment key={item.id}>
                      <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => toggleRplExpand(item.id)}>
                        <TableCell className="text-xs">
                          {rplExpandedRows.has(item.id) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{item.replacementNo || `RPL-${String(item.id).padStart(5, "0")}`}</TableCell>
                        <TableCell className="text-xs">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-xs">{item.salesOrder?.invoiceNo || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{item.supplier?.name || "—"}</TableCell>
                        <TableCell className="text-xs max-w-[120px] truncate">{item.customer?.name || "—"}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.originalCostTotal)}</TableCell>
                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.replacementCostTotal)}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.adjustmentAmount)}</TableCell>
                        <TableCell className="text-xs">{item.stockAdjustmentPosted ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-slate-300" />}</TableCell>
                        <TableCell className="text-xs">{item.financialAdjustmentPosted ? <CheckCircle className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-slate-300" />}</TableCell>
                        <TableCell className="text-xs"><StatusBadge status={item.status || "Pending"} /></TableCell>
                        <TableCell className="text-xs" onClick={e => e.stopPropagation()}>
                          <div className="flex gap-1">
                            {!isSR && (
                              <Button variant="ghost" size="sm" onClick={() => openRplEdit(item)} className="h-7 w-7 p-0">
                                <Edit className="h-3 w-3" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="sm" onClick={() => setRplDelete(item)} className="h-7 w-7 p-0 text-red-500">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {rplExpandedRows.has(item.id) && item.lines?.length > 0 && (
                        <TableRow className="bg-slate-50 dark:bg-slate-800/30">
                          <TableCell colSpan={13} className="p-3">
                            <div className="ml-6 text-xs">
                              <p className="font-semibold text-slate-700 dark:text-slate-300 mb-2">Line Items</p>
                              <div className="overflow-x-auto border rounded-lg">
                                <Table>
                                  <TableHeader>
                                    <TableRow className="bg-slate-100 dark:bg-slate-700/50">
                                      <TableHead className="text-xs">Original Product</TableHead>
                                      <TableHead className="text-xs">Replacement Product</TableHead>
                                      <TableHead className="text-xs text-right">Qty</TableHead>
                                      <TableHead className="text-xs text-right">Rate</TableHead>
                                      <TableHead className="text-xs text-right">Repl. Rate</TableHead>
                                      <TableHead className="text-xs text-right">Total</TableHead>
                                      <TableHead className="text-xs text-right">Repl. Total</TableHead>
                                      <TableHead className="text-xs text-right">Cost Price</TableHead>
                                      <TableHead className="text-xs text-right">Repl. Cost</TableHead>
                                      <TableHead className="text-xs text-right">Line Adjustment</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {item.lines.map((line: any, idx: number) => (
                                      <TableRow key={idx}>
                                        <TableCell className="text-xs">{line.product?.name || line.productId || "—"}</TableCell>
                                        <TableCell className="text-xs">{line.replacementProduct?.name || line.replacementProductId || "—"}</TableCell>
                                        <TableCell className="text-xs text-right">{line.quantity}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.rate)}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.replacementRate)}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.total)}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.replacementTotal)}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.costPrice)}</TableCell>
                                        <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.replacementCostPrice)}</TableCell>
                                        <TableCell className="text-xs text-right font-medium">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(line.lineAdjustment)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={rplDialog} onOpenChange={setRplDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{rplEdit ? "Edit" : "Create"} Replacement Order</DialogTitle>
              <DialogDescription>Enter replacement order details.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Sales Order (optional)</Label>
                  <Select value={rplForm.salesOrderId || ""} onValueChange={v => setRplForm(p => ({ ...p, salesOrderId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Sales Order" /></SelectTrigger>
                    <SelectContent>
                      {salesOrders.filter((s: any) => s.status !== "Cancelled" && s.status !== "Draft").map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>{s.invoiceNo || `SO-${String(s.id).padStart(5, "0")}`}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Supplier (optional)</Label>
                  <Select value={rplForm.supplierId || ""} onValueChange={v => setRplForm(p => ({ ...p, supplierId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Customer (optional)</Label>
                  <Select value={rplForm.customerId || ""} onValueChange={v => setRplForm(p => ({ ...p, customerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                    <SelectContent>{customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={rplForm.date || ""} onChange={e => setRplForm(p => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Reason</Label>
                  <Textarea value={rplForm.reason || ""} onChange={e => setRplForm(p => ({ ...p, reason: e.target.value }))} rows={2} placeholder="Reason for replacement" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Notes</Label>
                  <Textarea value={rplForm.notes || ""} onChange={e => setRplForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Additional notes" />
                </div>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-900 dark:text-white">Replacement Items</Label>
                  {(!rplEdit || rplEdit.status === "Pending") && (
                    <Button variant="outline" size="sm" onClick={() => setRplLines(prev => [...prev, { productId: "", replacementProductId: "", quantity: 1, rate: 0, replacementRate: 0 }])} className="h-8 text-xs">
                      <Plus className="h-3 w-3 mr-1" />Add Line
                    </Button>
                  )}
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                        <TableHead className="text-white text-xs">Original Product</TableHead>
                        <TableHead className="text-white text-xs">Replacement Product</TableHead>
                        <TableHead className="text-white text-xs text-right">Qty</TableHead>
                        <TableHead className="text-white text-xs text-right">Rate</TableHead>
                        <TableHead className="text-white text-xs text-right">Repl. Rate</TableHead>
                        <TableHead className="text-white text-xs text-right">Total</TableHead>
                        <TableHead className="text-white text-xs text-right">Repl. Total</TableHead>
                        {(!rplEdit || rplEdit.status === "Pending") && <TableHead className="text-white text-xs w-10"></TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rplLines.map((line: any, idx: number) => {
                        const lineTotal = (Number(line.quantity) || 0) * (Number(line.rate) || 0);
                        const replTotal = (Number(line.quantity) || 0) * (Number(line.replacementRate) || 0);
                        return (
                          <TableRow key={idx}>
                            <TableCell>
                              <Select value={line.productId || ""} onValueChange={v => {
                                const prod = products.find((p: any) => p.id === v);
                                setRplLines(prev => prev.map((l, i) => i === idx ? { ...l, productId: v, rate: prod?.salePrice || prod?.costPrice || 0, costPrice: prod?.costPrice || 0 } : l));
                              }}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Select value={line.replacementProductId || ""} onValueChange={v => {
                                const prod = products.find((p: any) => p.id === v);
                                setRplLines(prev => prev.map((l, i) => i === idx ? { ...l, replacementProductId: v, replacementRate: prod?.costPrice || prod?.salePrice || 0, replacementCostPrice: prod?.costPrice || 0 } : l));
                              }}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <Input type="number" min={1} value={line.quantity || 1} onChange={e => setRplLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Number(e.target.value) } : l))} className="h-8 w-16 text-xs" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" step="0.01" value={line.rate || 0} onChange={e => setRplLines(prev => prev.map((l, i) => i === idx ? { ...l, rate: Number(e.target.value) } : l))} className="h-8 w-20 text-xs" />
                            </TableCell>
                            <TableCell>
                              <Input type="number" step="0.01" value={line.replacementRate || 0} onChange={e => setRplLines(prev => prev.map((l, i) => i === idx ? { ...l, replacementRate: Number(e.target.value) } : l))} className="h-8 w-20 text-xs" />
                            </TableCell>
                            <TableCell className="text-xs text-right font-medium">{fmtCurrency(lineTotal)}</TableCell>
                            <TableCell className="text-xs text-right font-medium">{fmtCurrency(replTotal)}</TableCell>
                            {(!rplEdit || rplEdit.status === "Pending") && (
                              <TableCell>
                                <Button variant="ghost" size="sm" onClick={() => setRplLines(prev => prev.filter((_, i) => i !== idx))} className="h-7 w-7 p-0 text-red-500" disabled={rplLines.length <= 1}>
                                  <X className="h-3 w-3" />
                                </Button>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Financial Adjustment Warning */}
              {rplComputedTotals.netAdjustment !== 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div className="text-xs">
                    <p className="font-medium text-amber-700 dark:text-amber-400">Financial Adjustment Impact</p>
                    <p className="text-amber-600 dark:text-amber-500">
                      {rplComputedTotals.netAdjustment > 0
                        ? `Replacement costs more by ${fmtCurrency(rplComputedTotals.netAdjustment)}. Supplier AP will increase.`
                        : `Replacement costs less by ${fmtCurrency(Math.abs(rplComputedTotals.netAdjustment))}. Supplier AP will decrease.`}
                      {rplForm.customerId && " Customer AR may also be affected."}
                    </p>
                  </div>
                </div>
              )}

              {/* Computed Totals */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
                  <div><span className="text-slate-500 dark:text-slate-400">Original Cost Total:</span> <span className="font-medium">{fmtCurrency(rplComputedTotals.originalCostTotal)}</span></div>
                  <div><span className="text-slate-500 dark:text-slate-400">Replacement Cost Total:</span> <span className="font-medium">{fmtCurrency(rplComputedTotals.replacementCostTotal)}</span></div>
                  <div>
                    <span className="text-slate-500 dark:text-slate-400">Net Adjustment:</span>{" "}
                    <span className={`font-bold ${rplComputedTotals.netAdjustment > 0 ? "text-red-500" : rplComputedTotals.netAdjustment < 0 ? "text-emerald-500" : "text-slate-700 dark:text-white"}`}>
                      {fmtCurrency(rplComputedTotals.netAdjustment)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRplDialog(false)}>Cancel</Button>
              <Button onClick={saveRpl} disabled={rplSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {rplSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Saving...</> : "Save Replacement"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!rplDelete} onOpenChange={() => setRplDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Replacement Order</DialogTitle>
              <DialogDescription>This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm text-red-700 dark:text-red-400">
                <p className="font-medium">Warning: Financial Impact</p>
                <ul className="list-disc ml-4 mt-1 text-xs space-y-1">
                  <li>Stock adjustment will be reversed — original product restocked, replacement product removed</li>
                  <li>Ledger adjustments (AP/AR) will be reversed</li>
                  {rplDelete?.stockAdjustmentPosted && <li className="font-semibold">This replacement has stock adjustment posted that will be reversed</li>}
                  {rplDelete?.financialAdjustmentPosted && <li className="font-semibold">This replacement has financial adjustment posted that will be reversed</li>}
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRplDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteRpl}>Delete Replacement</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="page-enter flex flex-col bg-slate-50 dark:bg-slate-900">
      <main className="flex-1 p-4 sm:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[#132240] mb-4">
            <TabsTrigger value="purchase-returns" className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-slate-400">
              <RotateCcw className="h-4 w-4 mr-1" />Purchase Returns
            </TabsTrigger>
            <TabsTrigger value="replacements" className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-slate-400">
              <ArrowRightLeft className="h-4 w-4 mr-1" />Replacement Orders
            </TabsTrigger>
          </TabsList>

          <TabsContent value="purchase-returns">
            {renderPurchaseReturns()}
          </TabsContent>

          <TabsContent value="replacements">
            {renderReplacements()}
          </TabsContent>
        </Tabs>
      </main>

    </div>
  );
}
