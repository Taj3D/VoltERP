"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Shield, X, CheckCircle, ClipboardList, ShoppingCart,
  FileBarChart, Receipt, DollarSign, RotateCcw, ArrowLeftRight,
  Package, BarChart3, Truck, AlertTriangle, Ban, PackageCheck,
  Calculator, ArrowRightLeft, Eye, TrendingUp, Clock, Printer,
  Layers, ChevronDown, ChevronRight, Timer, Hash, CalendarClock,
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
import { exportInvoicePDF, type InvoicePDFOptions, type InvoiceCompanyProfile, type InvoiceTemplateConfig, type InvoiceData, type InvoiceLineItem, numberToWordsBDT } from "@/lib/invoice-engine";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") return Number(v).toLocaleString();
  return String(v);
};

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;
};

const bdCurrencyFmt = new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function validateNumeric(value: any, fieldName: string): { valid: boolean; error?: string } {
  const num = Number(value);
  if (value === "" || value === null || value === undefined) return { valid: false, error: `${fieldName} is required` };
  if (isNaN(num)) return { valid: false, error: `${fieldName} must be a valid number` };
  if (num <= 0) return { valid: false, error: `${fieldName} must be greater than zero` };
  return { valid: true };
}

function sanitizeInput(input: string): string {
  return input.replace(/<[^>]*>/g, '').trim();
}

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

// ============================================================
// AUTH
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface AuthUser { name: string; email: string; role: UserRole; displayName: string; }

let authState = { isAuthenticated: false, user: null as AuthUser | null };
let authListeners: Array<() => void> = [];

function useAuth() {
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const listener = () => forceUpdate({});
    authListeners.push(listener);
    return () => { authListeners = authListeners.filter(l => l !== listener); };
  }, []);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("ems_auth");
      if (stored) { const parsed = JSON.parse(stored); authState = { isAuthenticated: true, user: parsed.user }; }
      else { authState = { isAuthenticated: false, user: null }; }
    } catch { authState = { isAuthenticated: false, user: null }; }
    authListeners.forEach(l => l());
  }, []);
  return authState;
}

// ============================================================
// BADGE STYLES
// ============================================================

const STATUS_BADGE: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "In-Transit": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Delivered: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Unpaid: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Inactive: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const STOCK_STATUS_BADGE: Record<string, string> = {
  "In Stock": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  "Low Stock": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Out of Stock": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const TYPE_BADGE: Record<string, string> = {
  IN: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  OUT: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ============================================================
// PROPS
// ============================================================

interface InventoryGroupPageProps {
  currentPage: string;
  isVatAuditor?: boolean;
  userRole?: UserRole;
}

// ============================================================
// STATUS BADGE COMPONENT
// ============================================================

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_BADGE[status] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <Badge className={`${cls} border-0 text-xs font-medium`}>{status}</Badge>;
}

function StockStatusBadge({ status }: { status: string }) {
  const cls = STOCK_STATUS_BADGE[status] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
  return <Badge className={`${cls} border-0 text-xs font-medium`}>{status}</Badge>;
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
        <div className={`h-10 w-10 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
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
    <div className="space-y-4">
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="p-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">403 — Access Restricted</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {message || "You do not have permission to view this module."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// VAT MASK HELPER
// ============================================================

function vatMask(val: any, isVatAuditor: boolean) {
  if (isVatAuditor) return "N/A (Audit Mode)";
  return val;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function InventoryGroupPage({ currentPage, isVatAuditor: propVat, userRole: propRole }: InventoryGroupPageProps) {
  const { toast } = useToast();
  const auth = useAuth();

  const isVatAuditor = propVat ?? auth.user?.role === "vat_auditor";
  const userRole = propRole ?? (auth.user?.role || "admin");
  const isAdmin = userRole === "admin" || userRole === "manager";
  const isSR = userRole === "sr";
  const isDealer = userRole === "dealer";

  // Map currentPage to tab
  const tabMap: Record<string, string> = {
    "company-ordersheet": "company-ordersheet",
    "customer-ordersheet": "customer-ordersheet",
    "ordersheet-report": "ordersheet-report",
    "purchase-orders": "purchase-orders",
    "auto-po": "auto-po",
    "sales-orders": "sales-orders",
    "hire-sales": "hire-sales",
    "sales-returns": "sales-returns",
    "purchase-returns": "purchase-returns",
    "replacements": "replacements",
    "opening-stock": "opening-stock",
    "batch-master": "batch-master",
    "stock": "stock",
    "stock-details": "stock-details",
    "stock-valuation": "stock-valuation",
    "stock-transfers": "transfers",
  };
  const [activeTab, setActiveTab] = useState(tabMap[currentPage] || "company-ordersheet");

  useEffect(() => {
    const mapped = tabMap[currentPage];
    if (mapped) setActiveTab(mapped);
  }, [currentPage]);

  // ─── Shared Dropdowns ───
  const [companies, setCompanies] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);

  const loadDropdowns = useCallback(async () => {
    try { const r = await apiFetch("/api/companies"); setCompanies(Array.isArray(r) ? r : []); } catch {}
    try { const r = await apiFetch("/api/customers"); setCustomers(Array.isArray(r) ? r : []); } catch {}
    try { const r = await apiFetch("/api/suppliers"); setSuppliers(Array.isArray(r) ? r : []); } catch {}
    try { const r = await apiFetch("/api/products"); setProducts(Array.isArray(r) ? r : []); } catch {}
    try { const r = await apiFetch("/api/godowns"); setGodowns(Array.isArray(r) ? r : []); } catch {}
    try { const r = await apiFetch("/api/payment-options"); setPaymentOptions(Array.isArray(r) ? r : []); } catch {}
  }, []);

  useEffect(() => { loadDropdowns(); }, [loadDropdowns]);

  // ─── Company Ordersheet State ───
  const [coData, setCoData] = useState<any[]>([]);
  const [coLoading, setCoLoading] = useState(true);
  const [coSearch, setCoSearch] = useState("");
  const [coDialog, setCoDialog] = useState(false);
  const [coEdit, setCoEdit] = useState<any>(null);
  const [coSaving, setCoSaving] = useState(false);
  const [coDelete, setCoDelete] = useState<any>(null);
  const [coForm, setCoForm] = useState<Record<string, any>>({ companyId: "", date: new Date().toISOString().split("T")[0], status: "Draft", notes: "" });
  const [coLines, setCoLines] = useState<any[]>([{ productId: "", quantity: 1, rate: 0, notes: "" }]);

  // ─── Customer Ordersheet State ───
  const [custOData, setCustOData] = useState<any[]>([]);
  const [custOLoading, setCustOLoading] = useState(true);
  const [custOSearch, setCustOSearch] = useState("");
  const [custODialog, setCustODialog] = useState(false);
  const [custOEdit, setCustOEdit] = useState<any>(null);
  const [custOSaving, setCustOSaving] = useState(false);
  const [custODelete, setCustODelete] = useState<any>(null);
  const [custOForm, setCustOForm] = useState<Record<string, any>>({ customerId: "", date: new Date().toISOString().split("T")[0], status: "Draft", notes: "" });
  const [custOLines, setCustOLines] = useState<any[]>([{ productId: "", quantity: 1, rate: 0, notes: "" }]);

  // ─── Ordersheet Report State ───
  const [osReportFrom, setOsReportFrom] = useState("");
  const [osReportTo, setOsReportTo] = useState("");
  const [osReportData, setOsReportData] = useState<any[]>([]);
  const [osReportLoading, setOsReportLoading] = useState(false);

  // ─── Purchase Order State ───
  const [poData, setPoData] = useState<any[]>([]);
  const [poLoading, setPoLoading] = useState(true);
  const [poSearch, setPoSearch] = useState("");
  const [poDialog, setPoDialog] = useState(false);
  const [poEdit, setPoEdit] = useState<any>(null);
  const [poSaving, setPoSaving] = useState(false);
  const [poDelete, setPoDelete] = useState<any>(null);
  const [poForm, setPoForm] = useState<Record<string, any>>({ supplierId: "", godownId: "", date: new Date().toISOString().split("T")[0], status: "Pending", discount: 0, vatPercent: 0, notes: "" });
  const [poLines, setPoLines] = useState<any[]>([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);

  // ─── Auto PO State ───
  const [autoPoData, setAutoPoData] = useState<any[]>([]);
  const [autoPoLoading, setAutoPoLoading] = useState(true);
  const [autoPoSearch, setAutoPoSearch] = useState("");
  const [autoPoSelected, setAutoPoSelected] = useState<Set<string>>(new Set());
  const [autoPoGenerating, setAutoPoGenerating] = useState(false);

  // ─── Sales Order State ───
  const [soData, setSoData] = useState<any[]>([]);
  const [soLoading, setSoLoading] = useState(true);
  const [soSearch, setSoSearch] = useState("");
  const [soDialog, setSoDialog] = useState(false);
  const [soEdit, setSoEdit] = useState<any>(null);
  const [soSaving, setSoSaving] = useState(false);
  const [soDelete, setSoDelete] = useState<any>(null);
  const [soForm, setSoForm] = useState<Record<string, any>>({ customerId: "", godownId: "", date: new Date().toISOString().split("T")[0], status: "Pending", discount: 0, vatPercent: 0, paymentOptionId: "", notes: "" });
  const [soLines, setSoLines] = useState<any[]>([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);

  // ─── Hire Sales State ───
  const [hsData, setHsData] = useState<any[]>([]);
  const [hsLoading, setHsLoading] = useState(true);
  const [hsSearch, setHsSearch] = useState("");
  const [hsDialog, setHsDialog] = useState(false);
  const [hsEdit, setHsEdit] = useState<any>(null);
  const [hsSaving, setHsSaving] = useState(false);
  const [hsDelete, setHsDelete] = useState<any>(null);
  const [hsForm, setHsForm] = useState<Record<string, any>>({ customerId: "", date: new Date().toISOString().split("T")[0], status: "Active", downPayment: 0, duration: 12, hireRate: 0, notes: "" });
  const [hsLines, setHsLines] = useState<any[]>([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
  const [hsViewInstallments, setHsViewInstallments] = useState<any>(null);

  // ─── Sales Return State ───
  const [srData, setSrData] = useState<any[]>([]);
  const [srLoading, setSrLoading] = useState(true);
  const [srSearch, setSrSearch] = useState("");
  const [srDialog, setSrDialog] = useState(false);
  const [srEdit, setSrEdit] = useState<any>(null);
  const [srSaving, setSrSaving] = useState(false);
  const [srDelete, setSrDelete] = useState<any>(null);
  const [srForm, setSrForm] = useState<Record<string, any>>({ salesOrderId: "", date: new Date().toISOString().split("T")[0], reason: "", status: "Pending" });
  const [srLines, setSrLines] = useState<any[]>([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
  const [srAvailableProducts, setSrAvailableProducts] = useState<any[]>([]);

  // ─── Purchase Return State ───
  const [prData, setPrData] = useState<any[]>([]);
  const [prLoading, setPrLoading] = useState(true);
  const [prSearch, setPrSearch] = useState("");
  const [prDialog, setPrDialog] = useState(false);
  const [prEdit, setPrEdit] = useState<any>(null);
  const [prSaving, setPrSaving] = useState(false);
  const [prDelete, setPrDelete] = useState<any>(null);
  const [prForm, setPrForm] = useState<Record<string, any>>({ purchaseOrderId: "", date: new Date().toISOString().split("T")[0], reason: "", status: "Pending" });
  const [prLines, setPrLines] = useState<any[]>([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
  const [prAvailableProducts, setPrAvailableProducts] = useState<any[]>([]);

  // ─── Replacement State ───
  const [rplData, setRplData] = useState<any[]>([]);
  const [rplLoading, setRplLoading] = useState(true);
  const [rplSearch, setRplSearch] = useState("");
  const [rplDialog, setRplDialog] = useState(false);
  const [rplEdit, setRplEdit] = useState<any>(null);
  const [rplSaving, setRplSaving] = useState(false);
  const [rplDelete, setRplDelete] = useState<any>(null);
  const [rplForm, setRplForm] = useState<Record<string, any>>({ salesOrderId: "", date: new Date().toISOString().split("T")[0], reason: "", status: "Pending" });
  const [rplLines, setRplLines] = useState<any[]>([{ productId: "", replacementProductId: "", quantity: 1, rate: 0 }]);

  // ─── Stock State ───
  const [stockData, setStockData] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockSearch, setStockSearch] = useState("");
  const [stockFilterGodown, setStockFilterGodown] = useState("all");
  const [stockFilterCategory, setStockFilterCategory] = useState("all");
  const [stockFilterStatus, setStockFilterStatus] = useState("all");

  // ─── Stock Details State ───
  const [sdSelectedProduct, setSdSelectedProduct] = useState("");
  const [sdData, setSdData] = useState<any[]>([]);
  const [sdLoading, setSdLoading] = useState(false);
  const [sdSearch, setSdSearch] = useState("");

  // ─── Transfer State ───
  const [trnData, setTrnData] = useState<any[]>([]);
  const [trnLoading, setTrnLoading] = useState(true);
  const [trnSearch, setTrnSearch] = useState("");
  const [trnDialog, setTrnDialog] = useState(false);
  const [trnEdit, setTrnEdit] = useState<any>(null);
  const [trnSaving, setTrnSaving] = useState(false);
  const [trnDelete, setTrnDelete] = useState<any>(null);
  const [trnForm, setTrnForm] = useState<Record<string, any>>({ fromGodownId: "", toGodownId: "", date: new Date().toISOString().split("T")[0], status: "Pending", notes: "" });
  const [trnLines, setTrnLines] = useState<any[]>([{ productId: "", quantity: 1 }]);

  // ─── Opening Stock State ───
  const [osData, setOsData] = useState<any[]>([]);
  const [osLoading, setOsLoading] = useState(true);
  const [osSearch, setOsSearch] = useState("");
  const [osDialog, setOsDialog] = useState(false);
  const [osSaving, setOsSaving] = useState(false);
  const [osForm, setOsForm] = useState<Record<string, any>>({ productId: "", godownId: "", quantity: "", costPrice: "", batchNumber: "", expiryDate: "", alertLevel: "", date: new Date().toISOString().split("T")[0], notes: "" });
  const [osNumericErrors, setOsNumericErrors] = useState<Record<string, string>>({});

  // ─── Batch Master State ───
  const [bmData, setBmData] = useState<any[]>([]);
  const [bmLoading, setBmLoading] = useState(true);
  const [bmSearch, setBmSearch] = useState("");
  const [bmDialog, setBmDialog] = useState(false);
  const [bmEdit, setBmEdit] = useState<any>(null);
  const [bmSaving, setBmSaving] = useState(false);
  const [bmDelete, setBmDelete] = useState<any>(null);
  const [bmForm, setBmForm] = useState<Record<string, any>>({ batchNumber: "", productId: "", godownId: "", quantity: "", costPrice: "", salePrice: "", expiryDate: "", manufacturingDate: "", supplierId: "", status: "Active" });

  // ─── Stock Valuation State ───
  const [svData, setSvData] = useState<any[]>([]);
  const [svLoading, setSvLoading] = useState(false);
  const [svMethod, setSvMethod] = useState<string>("FIFO");
  const [svExpandedProduct, setSvExpandedProduct] = useState<string | null>(null);
  const [svSearch, setSvSearch] = useState("");

  // ─── Company Profile for White-Label PDFs ───
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  // ─── Inventory Snapshot for Rollback ───
  const inventorySnapshotRef = useRef<any>(null);

  // ============================================================
  // DATA LOADERS
  // ============================================================

  const loadCompanyOrdersheets = useCallback(async () => {
    setCoLoading(true);
    try {
      const res = await apiFetch("/api/order-sheets?companyId=any");
      const all = Array.isArray(res) ? res : [];
      setCoData(all.filter((o: any) => o.companyId));
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setCoLoading(false); }
  }, [toast]);

  const loadCustomerOrdersheets = useCallback(async () => {
    setCustOLoading(true);
    try {
      const res = await apiFetch("/api/order-sheets?customerId=any");
      const all = Array.isArray(res) ? res : [];
      setCustOData(all.filter((o: any) => o.customerId));
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setCustOLoading(false); }
  }, [toast]);

  const loadPurchaseOrders = useCallback(async () => {
    setPoLoading(true);
    try {
      const res = await apiFetch("/api/purchase-orders");
      setPoData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setPoLoading(false); }
  }, [toast]);

  const loadAutoPo = useCallback(async () => {
    setAutoPoLoading(true);
    try {
      const res = await apiFetch("/api/auto-po");
      setAutoPoData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setAutoPoLoading(false); }
  }, [toast]);

  const loadSalesOrders = useCallback(async () => {
    setSoLoading(true);
    try {
      const res = await apiFetch("/api/sales-orders");
      setSoData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSoLoading(false); }
  }, [toast]);

  const loadHireSales = useCallback(async () => {
    setHsLoading(true);
    try {
      const res = await apiFetch("/api/hire-sales");
      setHsData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setHsLoading(false); }
  }, [toast]);

  const loadSalesReturns = useCallback(async () => {
    setSrLoading(true);
    try {
      const res = await apiFetch("/api/sales-returns");
      setSrData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSrLoading(false); }
  }, [toast]);

  const loadPurchaseReturns = useCallback(async () => {
    setPrLoading(true);
    try {
      const res = await apiFetch("/api/purchase-returns");
      setPrData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setPrLoading(false); }
  }, [toast]);

  const loadReplacements = useCallback(async () => {
    setRplLoading(true);
    try {
      const res = await apiFetch("/api/replacements");
      setRplData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setRplLoading(false); }
  }, [toast]);

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

  const loadStockDetails = useCallback(async (productId: string) => {
    if (!productId) { setSdData([]); return; }
    setSdLoading(true);
    try {
      const res = await apiFetch(`/api/stock-details?productId=${productId}`);
      // stock-details API returns { product, entries, summary }
      setSdData(res?.entries || (Array.isArray(res) ? res : []));
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSdLoading(false); }
  }, [toast]);

  const loadTransfers = useCallback(async () => {
    setTrnLoading(true);
    try {
      const res = await apiFetch("/api/transfers");
      setTrnData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setTrnLoading(false); }
  }, [toast]);

  const loadOpeningStock = useCallback(async () => {
    setOsLoading(true);
    try {
      const res = await apiFetch("/api/opening-stock");
      setOsData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setOsLoading(false); }
  }, [toast]);

  const loadBatchMasters = useCallback(async () => {
    setBmLoading(true);
    try {
      const res = await apiFetch("/api/batch-master");
      setBmData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setBmLoading(false); }
  }, [toast]);

  const loadStockValuation = useCallback(async (method?: string) => {
    setSvLoading(true);
    try {
      const m = method || svMethod;
      const res = await apiFetch(`/api/stock-valuation?method=${m}`);
      setSvData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSvLoading(false); }
  }, [toast, svMethod]);

  const loadCompanyProfile = useCallback(async () => {
    try {
      const res = await apiFetch("/api/company-branding");
      setCompanyProfile(res);
    } catch { /* non-blocking */ }
  }, []);

  // ============================================================
  // INIT: Load data based on active tab
  // ============================================================

  useEffect(() => {
    if (activeTab === "company-ordersheet") loadCompanyOrdersheets();
    if (activeTab === "customer-ordersheet") loadCustomerOrdersheets();
    if (activeTab === "purchase-orders") loadPurchaseOrders();
    if (activeTab === "auto-po") loadAutoPo();
    if (activeTab === "sales-orders") loadSalesOrders();
    if (activeTab === "hire-sales") loadHireSales();
    if (activeTab === "sales-returns") loadSalesReturns();
    if (activeTab === "purchase-returns") loadPurchaseReturns();
    if (activeTab === "replacements") loadReplacements();
    if (activeTab === "opening-stock") loadOpeningStock();
    if (activeTab === "batch-master") loadBatchMasters();
    if (activeTab === "stock") loadStock();
    if (activeTab === "stock-valuation") loadStockValuation();
    if (activeTab === "transfers") loadTransfers();
  }, [activeTab, loadCompanyOrdersheets, loadCustomerOrdersheets, loadPurchaseOrders, loadAutoPo, loadSalesOrders, loadHireSales, loadSalesReturns, loadPurchaseReturns, loadReplacements, loadOpeningStock, loadBatchMasters, loadStock, loadStockValuation, loadTransfers]);

  useEffect(() => { loadCompanyProfile(); }, [loadCompanyProfile]);

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
  // EXPORT HELPERS
  // ============================================================

  const doExportCSV = (title: string, columns: ExportColumnDef[], data: any[], extraMasked?: string[]) => {
    try {
      const maskedKeys = [...getVatMaskedKeys(columns), ...(extraMasked || [])];
      exportToCSV({ title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
      toast({ title: "CSV Exported", description: `${title} data exported` });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const doExportPDF = (title: string, columns: ExportColumnDef[], data: any[], extraMasked?: string[]) => {
    try {
      const maskedKeys = [...getVatMaskedKeys(columns), ...(extraMasked || [])];
      exportToPDF({ title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys, orientation: "landscape" });
      toast({ title: "PDF Exported", description: `${title} data exported` });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const doImportCSV = (apiPath: string, fields: ExportFieldDef[], reloadFn: () => void) => {
    importFromCSV({ apiPath, formFields: fields }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
      reloadFn();
    });
  };

  // ============================================================
  // TOOLBAR COMPONENT (reusable)
  // ============================================================

  function Toolbar({ search, setSearch, onRefresh, loading, onExportCSV, onExportPDF, onImportCSV, importFields, importApiPath, importReload, canCreate, onCreate, createLabel }: {
    search: string; setSearch: (v: string) => void; onRefresh: () => void; loading: boolean;
    onExportCSV: () => void; onExportPDF: () => void;
    onImportCSV?: () => void; importFields?: ExportFieldDef[]; importApiPath?: string; importReload?: () => void;
    canCreate?: boolean; onCreate?: () => void; createLabel?: string;
  }) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8" />
        </div>
        {canCreate && onCreate && (
          <Button onClick={onCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4 mr-1" /> {createLabel || "Add"}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onExportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={onExportPDF}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
        {onImportCSV && canCreate && (
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import</span></Button>
            <input type="file" accept=".csv" className="hidden" onChange={onImportCSV} />
          </label>
        )}
        <Button variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
    );
  }

  // ============================================================
  // LINE ITEMS GRID COMPONENT
  // ============================================================

  function LineItemsGrid({ lines, setLines, template, columns, showRate, showDiscount, showVat }: {
    lines: any[]; setLines: React.Dispatch<React.SetStateAction<any[]>>; template: any;
    columns: { key: string; label: string; type?: string }[];
    showRate?: boolean; showDiscount?: boolean; showVat?: boolean;
  }) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-semibold text-slate-900 dark:text-white">Line Items</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => addLine(setLines, template)}>
            <Plus className="h-3 w-3 mr-1" /> Add Line
          </Button>
        </div>
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                <TableHead className="text-white text-xs">#</TableHead>
                {columns.map(col => (
                  <TableHead key={col.key} className="text-white text-xs">{col.label}</TableHead>
                ))}
                <TableHead className="text-white text-xs w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line, idx) => (
                <TableRow key={idx}>
                  <TableCell className="text-xs">{idx + 1}</TableCell>
                  {columns.map(col => {
                    if (col.key === "productId") {
                      return (
                        <TableCell key={col.key}>
                          <Select value={line.productId || ""} onValueChange={v => updateLine(setLines, idx, "productId", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
                            <SelectContent>
                              {products.map(p => <SelectItem key={p.id} value={p.id}>{p.productCode} - {p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      );
                    }
                    if (col.key === "replacementProductId") {
                      return (
                        <TableCell key={col.key}>
                          <Select value={line.replacementProductId || ""} onValueChange={v => updateLine(setLines, idx, "replacementProductId", v)}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Replacement" /></SelectTrigger>
                            <SelectContent>
                              {products.map(p => <SelectItem key={p.id} value={p.id}>{p.productCode} - {p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      );
                    }
                    if (col.key === "quantity") {
                      return (
                        <TableCell key={col.key}>
                          <Input type="number" min={1} value={line.quantity || 1} onChange={e => updateLine(setLines, idx, "quantity", Number(e.target.value))} className="h-8 w-20 text-xs" />
                        </TableCell>
                      );
                    }
                    if (col.key === "rate") {
                      return (
                        <TableCell key={col.key}>
                          <Input type="number" min={0} step="0.01" value={line.rate || 0} onChange={e => updateLine(setLines, idx, "rate", Number(e.target.value))} className="h-8 w-24 text-xs" />
                        </TableCell>
                      );
                    }
                    if (col.key === "discountPercent") {
                      return (
                        <TableCell key={col.key}>
                          <Input type="number" min={0} max={100} step="0.01" value={line.discountPercent || 0} onChange={e => updateLine(setLines, idx, "discountPercent", Number(e.target.value))} className="h-8 w-20 text-xs" />
                        </TableCell>
                      );
                    }
                    if (col.key === "notes") {
                      return (
                        <TableCell key={col.key}>
                          <Input type="text" value={line.notes || ""} onChange={e => updateLine(setLines, idx, "notes", e.target.value)} className="h-8 text-xs" placeholder="Notes" />
                        </TableCell>
                      );
                    }
                    if (col.key === "total") {
                      const qty = Number(line.quantity) || 0;
                      const rate = Number(line.rate) || 0;
                      const disc = Number(line.discountPercent) || 0;
                      const lineTotal = qty * rate * (1 - disc / 100);
                      return <TableCell key={col.key} className="text-xs font-medium">{fmtCurrency(lineTotal)}</TableCell>;
                    }
                    if (col.key === "discountAmt") {
                      const qty = Number(line.quantity) || 0;
                      const rate = Number(line.rate) || 0;
                      const disc = Number(line.discountPercent) || 0;
                      const discAmt = qty * rate * (disc / 100);
                      return <TableCell key={col.key} className="text-xs">{fmtCurrency(discAmt)}</TableCell>;
                    }
                    if (col.key === "vatAmt") {
                      const qty = Number(line.quantity) || 0;
                      const rate = Number(line.rate) || 0;
                      const disc = Number(line.discountPercent) || 0;
                      const vatPct = showVat ? 15 : 0;
                      const net = qty * rate * (1 - disc / 100);
                      return <TableCell key={col.key} className="text-xs">{fmtCurrency(net * vatPct / 100)}</TableCell>;
                    }
                    return <TableCell key={col.key} className="text-xs">—</TableCell>;
                  })}
                  <TableCell>
                    {lines.length > 1 && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeLine(setLines, idx)} className="h-6 w-6 p-0 text-red-500 hover:text-red-700">
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  // ============================================================
  // TAB 1: COMPANY ORDERSHEET
  // ============================================================

  const coColumns: ExportColumnDef[] = [
    { key: "sheetNo", label: "Sheet No", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "companyName", label: "Company", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "totalItems", label: "Total Items", type: "number" },
    { key: "totalAmount", label: "Total Amount", type: "currency" },
    { key: "notes", label: "Notes", type: "text" },
  ];

  const coFiltered = useMemo(() => {
    if (!coSearch) return coData;
    const q = coSearch.toLowerCase();
    return coData.filter((o: any) => (o.sheetNo || "").toLowerCase().includes(q) || (o.company?.name || "").toLowerCase().includes(q) || (o.status || "").toLowerCase().includes(q));
  }, [coData, coSearch]);

  const coStats = useMemo(() => ({
    total: coData.length,
    draft: coData.filter((o: any) => o.status === "Draft").length,
    completed: coData.filter((o: any) => o.status === "Completed").length,
    totalValue: coData.reduce((s: number, o: any) => s + (Number(o.totalAmount) || 0), 0),
  }), [coData]);

  const openCoCreate = () => {
    setCoForm({ companyId: "", date: new Date().toISOString().split("T")[0], status: "Draft", notes: "" });
    setCoLines([{ productId: "", quantity: 1, rate: 0, notes: "" }]);
    setCoEdit(null);
    setCoDialog(true);
  };

  const openCoEdit = (item: any) => {
    setCoForm({
      companyId: item.companyId || "", date: item.date ? item.date.split("T")[0] : "",
      status: item.status || "Draft", notes: item.notes || "",
    });
    setCoLines(item.lines && item.lines.length > 0 ? item.lines : [{ productId: "", quantity: 1, rate: 0, notes: "" }]);
    setCoEdit(item);
    setCoDialog(true);
  };

  const saveCo = async () => {
    if (!coForm.companyId || !coForm.date) { toast({ title: "Error", description: "Company and Date are required", variant: "destructive" }); return; }
    setCoSaving(true);
    try {
      const linesPayload = coLines.filter((l: any) => l.productId).map((l: any) => ({ productId: l.productId, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, notes: l.notes || "" }));
      const payload = { ...coForm, lines: linesPayload, type: "company", totalItems: linesPayload.length, totalAmount: linesPayload.reduce((s: number, l: any) => s + l.quantity * l.rate, 0) };
      if (coEdit) {
        await apiFetch(`/api/order-sheets/${coEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Company Ordersheet updated" });
      } else {
        await apiFetch("/api/order-sheets", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Company Ordersheet created" });
      }
      setCoDialog(false);
      loadCompanyOrdersheets();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setCoSaving(false); }
  };

  const deleteCo = async () => {
    if (!coDelete) return;
    try { await apiFetch(`/api/order-sheets/${coDelete.id}`, { method: "DELETE" }); toast({ title: "Deleted", description: "Ordersheet deleted" }); setCoDelete(null); loadCompanyOrdersheets(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const renderCompanyOrdersheet = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Total Sheets" value={coStats.total} icon={ClipboardList} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
        <StatCard label="Draft" value={coStats.draft} icon={Edit} color="text-amber-500" bg="bg-amber-500/10" />
        <StatCard label="Completed" value={coStats.completed} icon={CheckCircle} color="text-emerald-500" bg="bg-emerald-500/10" />
        <StatCard label="Total Value" value={fmtCurrency(coStats.totalValue)} icon={DollarSign} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
      </div>
      <Toolbar search={coSearch} setSearch={setCoSearch} onRefresh={loadCompanyOrdersheets} loading={coLoading}
        onExportCSV={() => doExportCSV("Company Ordersheets", coColumns, coFiltered.map((o: any) => ({ ...o, companyName: o.company?.name || "—" })))}
        onExportPDF={() => doExportPDF("Company Ordersheets", coColumns, coFiltered.map((o: any) => ({ ...o, companyName: o.company?.name || "—" })))}
        onImportCSV={() => doImportCSV("/api/order-sheets", [], loadCompanyOrdersheets)}
        canCreate={isAdmin} onCreate={openCoCreate} createLabel="Add Ordersheet" />
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  {coColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                  <TableHead className="text-white text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {coLoading ? (
                  <TableRow><TableCell colSpan={coColumns.length + 1} className="text-center py-8 text-slate-400"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                ) : coFiltered.length === 0 ? (
                  <TableRow><TableCell colSpan={coColumns.length + 1} className="text-center py-8 text-slate-400">No ordersheets found</TableCell></TableRow>
                ) : coFiltered.map((item: any) => (
                  <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="text-xs font-medium">{item.sheetNo || `OS-${String(item.id).padStart(5, "0")}`}</TableCell>
                    <TableCell className="text-xs">{fmt(item.date, "date")}</TableCell>
                    <TableCell className="text-xs">{item.company?.name || "—"}</TableCell>
                    <TableCell className="text-xs"><StatusBadge status={item.status || "Draft"} /></TableCell>
                    <TableCell className="text-xs">{item.totalItems || item.lines?.length || 0}</TableCell>
                    <TableCell className="text-xs">{fmtCurrency(item.totalAmount || 0)}</TableCell>
                    <TableCell className="text-xs max-w-[150px] truncate">{item.notes || "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openCoEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => setCoDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      {/* Create/Edit Dialog */}
      <Dialog open={coDialog} onOpenChange={setCoDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{coEdit ? "Edit" : "Create"} Company Ordersheet</DialogTitle><DialogDescription>Fill in the ordersheet details and line items.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm font-medium">Company <span className="text-red-500">*</span></Label>
                <Select value={coForm.companyId || ""} onValueChange={v => setCoForm(p => ({ ...p, companyId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Company" /></SelectTrigger>
                  <SelectContent>{companies.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select></div>
              <div><Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label><Input type="date" value={coForm.date || ""} onChange={e => setCoForm(p => ({ ...p, date: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm font-medium">Status</Label>
                <Select value={coForm.status || "Draft"} onValueChange={v => setCoForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="Draft">Draft</SelectItem><SelectItem value="Confirmed">Confirmed</SelectItem><SelectItem value="Completed">Completed</SelectItem></SelectContent>
                </Select></div>
              <div><Label className="text-sm font-medium">Notes</Label><Input value={coForm.notes || ""} onChange={e => setCoForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" /></div>
            </div>
            <LineItemsGrid lines={coLines} setLines={setCoLines} template={{ productId: "", quantity: 1, rate: 0, notes: "" }}
              columns={[{ key: "productId", label: "Product" }, { key: "quantity", label: "Qty" }, { key: "rate", label: "Rate" }, { key: "total", label: "Total" }, { key: "notes", label: "Notes" }]} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setCoDialog(false)}>Cancel</Button><Button onClick={saveCo} disabled={coSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{coSaving ? "Saving..." : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Delete Dialog */}
      <Dialog open={!!coDelete} onOpenChange={() => setCoDelete(null)}>
        <DialogContent><DialogHeader><DialogTitle>Delete Ordersheet</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader>
        <DialogFooter><Button variant="outline" onClick={() => setCoDelete(null)}>Cancel</Button><Button variant="destructive" onClick={deleteCo}>Delete</Button></DialogFooter></DialogContent>
      </Dialog>
    </div>
  );

  // ============================================================
  // TAB 2: CUSTOMER ORDERSHEET
  // ============================================================

  const custOColumns: ExportColumnDef[] = [
    { key: "sheetNo", label: "Sheet No", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "customerName", label: "Customer", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "totalItems", label: "Total Items", type: "number" },
    { key: "totalAmount", label: "Total Amount", type: "currency" },
    { key: "notes", label: "Notes", type: "text" },
  ];

  const custOFiltered = useMemo(() => {
    if (!custOSearch) return custOData;
    const q = custOSearch.toLowerCase();
    return custOData.filter((o: any) => (o.sheetNo || "").toLowerCase().includes(q) || (o.customer?.name || "").toLowerCase().includes(q) || (o.status || "").toLowerCase().includes(q));
  }, [custOData, custOSearch]);

  const custOStats = useMemo(() => ({
    total: custOData.length,
    draft: custOData.filter((o: any) => o.status === "Draft").length,
    completed: custOData.filter((o: any) => o.status === "Completed").length,
    totalValue: custOData.reduce((s: number, o: any) => s + (Number(o.totalAmount) || 0), 0),
  }), [custOData]);

  const openCustOCreate = () => {
    setCustOForm({ customerId: "", date: new Date().toISOString().split("T")[0], status: "Draft", notes: "" });
    setCustOLines([{ productId: "", quantity: 1, rate: 0, notes: "" }]);
    setCustOEdit(null);
    setCustODialog(true);
  };

  const openCustOEdit = (item: any) => {
    setCustOForm({ customerId: item.customerId || "", date: item.date ? item.date.split("T")[0] : "", status: item.status || "Draft", notes: item.notes || "" });
    setCustOLines(item.lines && item.lines.length > 0 ? item.lines : [{ productId: "", quantity: 1, rate: 0, notes: "" }]);
    setCustOEdit(item);
    setCustODialog(true);
  };

  const saveCustO = async () => {
    if (!custOForm.customerId || !custOForm.date) { toast({ title: "Error", description: "Customer and Date are required", variant: "destructive" }); return; }
    setCustOSaving(true);
    try {
      const linesPayload = custOLines.filter((l: any) => l.productId).map((l: any) => ({ productId: l.productId, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, notes: l.notes || "" }));
      const payload = { ...custOForm, lines: linesPayload, type: "customer", totalItems: linesPayload.length, totalAmount: linesPayload.reduce((s: number, l: any) => s + l.quantity * l.rate, 0) };
      if (custOEdit) { await apiFetch(`/api/order-sheets/${custOEdit.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Updated", description: "Customer Ordersheet updated" }); }
      else { await apiFetch("/api/order-sheets", { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Created", description: "Customer Ordersheet created" }); }
      setCustODialog(false); loadCustomerOrdersheets();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setCustOSaving(false); }
  };

  const deleteCustO = async () => {
    if (!custODelete) return;
    try { await apiFetch(`/api/order-sheets/${custODelete.id}`, { method: "DELETE" }); toast({ title: "Deleted", description: "Ordersheet deleted" }); setCustODelete(null); loadCustomerOrdersheets(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const renderCustomerOrdersheet = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access Customer Ordersheets." />;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard label="Total Sheets" value={custOStats.total} icon={ClipboardList} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Draft" value={custOStats.draft} icon={Edit} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Completed" value={custOStats.completed} icon={CheckCircle} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="Total Value" value={fmtCurrency(custOStats.totalValue)} icon={DollarSign} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
        </div>
        <Toolbar search={custOSearch} setSearch={setCustOSearch} onRefresh={loadCustomerOrdersheets} loading={custOLoading}
          onExportCSV={() => doExportCSV("Customer Ordersheets", custOColumns, custOFiltered.map((o: any) => ({ ...o, customerName: o.customer?.name || "—" })))}
          onExportPDF={() => doExportPDF("Customer Ordersheets", custOColumns, custOFiltered.map((o: any) => ({ ...o, customerName: o.customer?.name || "—" })))}
          onImportCSV={() => doImportCSV("/api/order-sheets", [], loadCustomerOrdersheets)}
          canCreate={isAdmin || isSR} onCreate={openCustOCreate} createLabel="Add Ordersheet" />
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    {custOColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {custOLoading ? (
                    <TableRow><TableCell colSpan={custOColumns.length + 1} className="text-center py-8 text-slate-400"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : custOFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={custOColumns.length + 1} className="text-center py-8 text-slate-400">No ordersheets found</TableCell></TableRow>
                  ) : custOFiltered.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-xs font-medium">{item.sheetNo || `OS-${String(item.id).padStart(5, "0")}`}</TableCell>
                      <TableCell className="text-xs">{fmt(item.date, "date")}</TableCell>
                      <TableCell className="text-xs">{item.customer?.name || "—"}</TableCell>
                      <TableCell className="text-xs"><StatusBadge status={item.status || "Draft"} /></TableCell>
                      <TableCell className="text-xs">{item.totalItems || item.lines?.length || 0}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.totalAmount || 0)}</TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">{item.notes || "—"}</TableCell>
                      <TableCell>
                        {(isAdmin || isSR) && <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openCustOEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>
                          {isAdmin && <Button variant="ghost" size="sm" onClick={() => setCustODelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>}
                        </div>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Dialog open={custODialog} onOpenChange={setCustODialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{custOEdit ? "Edit" : "Create"} Customer Ordersheet</DialogTitle><DialogDescription>Fill in the ordersheet details and line items.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Customer <span className="text-red-500">*</span></Label>
                  <Select value={custOForm.customerId || ""} onValueChange={v => setCustOForm(p => ({ ...p, customerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label><Input type="date" value={custOForm.date || ""} onChange={e => setCustOForm(p => ({ ...p, date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Status</Label>
                  <Select value={custOForm.status || "Draft"} onValueChange={v => setCustOForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Draft">Draft</SelectItem><SelectItem value="Confirmed">Confirmed</SelectItem><SelectItem value="Completed">Completed</SelectItem></SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Notes</Label><Input value={custOForm.notes || ""} onChange={e => setCustOForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" /></div>
              </div>
              <LineItemsGrid lines={custOLines} setLines={setCustOLines} template={{ productId: "", quantity: 1, rate: 0, notes: "" }}
                columns={[{ key: "productId", label: "Product" }, { key: "quantity", label: "Qty" }, { key: "rate", label: "Rate" }, { key: "total", label: "Total" }, { key: "notes", label: "Notes" }]} />
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setCustODialog(false)}>Cancel</Button><Button onClick={saveCustO} disabled={custOSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{custOSaving ? "Saving..." : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!custODelete} onOpenChange={() => setCustODelete(null)}>
          <DialogContent><DialogHeader><DialogTitle>Delete Ordersheet</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setCustODelete(null)}>Cancel</Button><Button variant="destructive" onClick={deleteCustO}>Delete</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // TAB 3: ORDERSHEET REPORT
  // ============================================================

  const osReportColumns: ExportColumnDef[] = [
    { key: "sheetNo", label: "Sheet No", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "type", label: "Type", type: "text" },
    { key: "entityName", label: "Company/Customer", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "totalAmount", label: "Total Amount", type: "currency" },
  ];

  const loadOsReport = async () => {
    setOsReportLoading(true);
    try {
      let url = "/api/order-sheets?";
      if (osReportFrom) url += `from=${osReportFrom}&`;
      if (osReportTo) url += `to=${osReportTo}&`;
      const res = await apiFetch(url);
      setOsReportData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setOsReportLoading(false); }
  };

  const osReportStats = useMemo(() => {
    const total = osReportData.length;
    const totalValue = osReportData.reduce((s: number, o: any) => s + (Number(o.totalAmount) || 0), 0);
    const avgValue = total > 0 ? totalValue / total : 0;
    const byStatus: Record<string, number> = {};
    osReportData.forEach((o: any) => { const st = o.status || "Unknown"; byStatus[st] = (byStatus[st] || 0) + 1; });
    return { total, totalValue, avgValue, byStatus };
  }, [osReportData]);

  const renderOrdersheetReport = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard label="Total Ordersheets" value={osReportStats.total} icon={ClipboardList} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
        <StatCard label="Total Value" value={fmtCurrency(osReportStats.totalValue)} icon={DollarSign} color="text-emerald-500" bg="bg-emerald-500/10" />
        <StatCard label="Avg Value" value={fmtCurrency(osReportStats.avgValue)} icon={TrendingUp} color="text-amber-500" bg="bg-amber-500/10" />
        <StatCard label="Statuses" value={Object.keys(osReportStats.byStatus).length} icon={BarChart3} color="text-purple-500" bg="bg-purple-500/10" />
      </div>
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628]"><CardTitle className="text-white text-sm">Date Range Filter</CardTitle></CardHeader>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div><Label className="text-xs">From</Label><Input type="date" value={osReportFrom} onChange={e => setOsReportFrom(e.target.value)} className="h-9" /></div>
            <div><Label className="text-xs">To</Label><Input type="date" value={osReportTo} onChange={e => setOsReportTo(e.target.value)} className="h-9" /></div>
            <Button onClick={loadOsReport} className="bg-[#2563eb] hover:bg-[#1d4ed8]" disabled={osReportLoading}>{osReportLoading ? "Loading..." : "Generate Report"}</Button>
            <Button variant="outline" size="sm" onClick={() => doExportCSV("Ordersheet Report", osReportColumns, osReportData.map((o: any) => ({ ...o, entityName: o.company?.name || o.customer?.name || "—" })))}><Download className="h-4 w-4 mr-1" /> CSV</Button>
            <Button variant="outline" size="sm" onClick={() => doExportPDF("Ordersheet Report", osReportColumns, osReportData.map((o: any) => ({ ...o, entityName: o.company?.name || o.customer?.name || "—" })))}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          </div>
        </CardContent>
      </Card>
      {/* Status Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Object.entries(osReportStats.byStatus).map(([status, count]) => (
          <Card key={status} className="border-slate-200 dark:border-slate-700">
            <CardContent className="p-3 text-center">
              <StatusBadge status={status} />
              <p className="text-lg font-bold text-slate-900 dark:text-white mt-1">{count}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  {osReportColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                </TableRow>
              </TableHeader>
              <TableBody>
                {osReportData.length === 0 ? (
                  <TableRow><TableCell colSpan={osReportColumns.length} className="text-center py-8 text-slate-400">Select a date range and generate report</TableCell></TableRow>
                ) : osReportData.map((item: any) => (
                  <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <TableCell className="text-xs">{item.sheetNo || `OS-${String(item.id).padStart(5, "0")}`}</TableCell>
                    <TableCell className="text-xs">{fmt(item.date, "date")}</TableCell>
                    <TableCell className="text-xs">{item.companyId ? "Company" : "Customer"}</TableCell>
                    <TableCell className="text-xs">{item.company?.name || item.customer?.name || "—"}</TableCell>
                    <TableCell className="text-xs"><StatusBadge status={item.status || "Draft"} /></TableCell>
                    <TableCell className="text-xs">{fmtCurrency(item.totalAmount || 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // TAB 4: PURCHASE ORDER
  // ============================================================

  const poColumns: ExportColumnDef[] = [
    { key: "poNumber", label: "PO Number", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "supplierName", label: "Supplier", type: "text" },
    { key: "godownName", label: "Godown", type: "text" },
    { key: "subTotal", label: "Sub-Total", type: "currency" },
    { key: "discount", label: "Discount", type: "currency" },
    { key: "vatAmount", label: "VAT", type: "currency" },
    { key: "grandTotal", label: "Grand Total", type: "currency" },
    { key: "status", label: "Status", type: "text" },
  ];

  const poMaskedCols = ["subTotal", "discount", "vatAmount", "grandTotal", "costPrice", "wholesalePrice"];

  const poFiltered = useMemo(() => {
    if (!poSearch) return poData;
    const q = poSearch.toLowerCase();
    return poData.filter((o: any) => (o.poNumber || "").toLowerCase().includes(q) || (o.supplier?.name || "").toLowerCase().includes(q) || (o.status || "").toLowerCase().includes(q));
  }, [poData, poSearch]);

  const poStats = useMemo(() => ({
    total: poData.length,
    pending: poData.filter((o: any) => o.status === "Pending").length,
    completed: poData.filter((o: any) => o.status === "Completed").length,
    totalValue: poData.reduce((s: number, o: any) => s + (Number(o.grandTotal) || 0), 0),
  }), [poData]);

  const openPoCreate = () => {
    setPoForm({ supplierId: "", godownId: "", date: new Date().toISOString().split("T")[0], status: "Pending", discount: 0, vatPercent: 0, notes: "" });
    setPoLines([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setPoEdit(null);
    setPoDialog(true);
  };

  const openPoEdit = (item: any) => {
    setPoForm({ supplierId: item.supplierId || "", godownId: item.godownId || "", date: item.date ? item.date.split("T")[0] : "", status: item.status || "Pending", discount: item.discount || 0, vatPercent: item.vatPercentage || 0, notes: item.notes || "" });
    setPoLines(item.lines && item.lines.length > 0 ? item.lines : [{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setPoEdit(item);
    setPoDialog(true);
  };

  const savePo = async () => {
    if (!poForm.supplierId || !poForm.godownId || !poForm.date) { toast({ title: "Error", description: "Supplier, Godown and Date are required", variant: "destructive" }); return; }
    setPoSaving(true);
    try {
      const linesPayload = poLines.filter((l: any) => l.productId).map((l: any) => ({
        productId: l.productId, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, discountPercent: Number(l.discountPercent) || 0,
      }));
      const subTotal = linesPayload.reduce((s: number, l: any) => s + l.quantity * l.rate * (1 - l.discountPercent / 100), 0);
      const discountAmt = Number(poForm.discount) || 0;
      const vatAmt = (subTotal - discountAmt) * (Number(poForm.vatPercent) || 0) / 100;
      const grandTotal = subTotal - discountAmt + vatAmt;
      const payload = { ...poForm, lines: linesPayload, subTotal, discount: discountAmt, vatAmount: vatAmt, vatPercentage: Number(poForm.vatPercent) || 0, grandTotal };
      if (poEdit) { await apiFetch(`/api/purchase-orders/${poEdit.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Updated", description: "Purchase Order updated" }); }
      else { await apiFetch("/api/purchase-orders", { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Created", description: "Purchase Order created" }); }
      setPoDialog(false); loadPurchaseOrders();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setPoSaving(false); }
  };

  const deletePo = async () => {
    if (!poDelete) return;
    try { await apiFetch(`/api/purchase-orders/${poDelete.id}`, { method: "DELETE" }); toast({ title: "Deleted", description: "Purchase Order deleted" }); setPoDelete(null); loadPurchaseOrders(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const renderPurchaseOrder = () => {
    if (isSR) return <AccessDenied message="Sales Representatives cannot access Purchase Orders." />;
    if (isDealer) return <AccessDenied message="Dealers cannot access Purchase Orders." />;
    return (
      <div className="space-y-4">
        {isVatAuditor && <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2"><Shield className="h-4 w-4 text-amber-600" /><span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Cost/wholesale/profit columns are masked</span></div>}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard label="Total POs" value={poStats.total} icon={ShoppingCart} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Pending" value={poStats.pending} icon={Clock} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Completed" value={poStats.completed} icon={CheckCircle} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="Total Value" value={vatMask(fmtCurrency(poStats.totalValue), isVatAuditor)} icon={DollarSign} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
        </div>
        <Toolbar search={poSearch} setSearch={setPoSearch} onRefresh={loadPurchaseOrders} loading={poLoading}
          onExportCSV={() => doExportCSV("Purchase Orders", poColumns, poFiltered.map((o: any) => ({ ...o, supplierName: o.supplier?.name || "—", godownName: o.godown?.name || "—" })), poMaskedCols)}
          onExportPDF={() => doExportPDF("Purchase Orders", poColumns, poFiltered.map((o: any) => ({ ...o, supplierName: o.supplier?.name || "—", godownName: o.godown?.name || "—" })), poMaskedCols)}
          onImportCSV={() => doImportCSV("/api/purchase-orders", [], loadPurchaseOrders)}
          canCreate={isAdmin} onCreate={openPoCreate} createLabel="Add PO" />
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    {poColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {poLoading ? (
                    <TableRow><TableCell colSpan={poColumns.length + 1} className="text-center py-8 text-slate-400"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : poFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={poColumns.length + 1} className="text-center py-8 text-slate-400">No purchase orders found</TableCell></TableRow>
                  ) : poFiltered.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-xs font-medium">{item.poNumber || `PO-${String(item.id).padStart(5, "0")}`}</TableCell>
                      <TableCell className="text-xs">{fmt(item.date, "date")}</TableCell>
                      <TableCell className="text-xs">{item.supplier?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{item.godown?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.subTotal)}</TableCell>
                      <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.discount)}</TableCell>
                      <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.vatAmount)}</TableCell>
                      <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.grandTotal)}</TableCell>
                      <TableCell className="text-xs"><StatusBadge status={item.status || "Pending"} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openPoEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setPoDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Dialog open={poDialog} onOpenChange={setPoDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{poEdit ? "Edit" : "Create"} Purchase Order</DialogTitle><DialogDescription>Fill in PO details and line items.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-sm font-medium">Supplier <span className="text-red-500">*</span></Label>
                  <Select value={poForm.supplierId || ""} onValueChange={v => setPoForm(p => ({ ...p, supplierId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                    <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Godown <span className="text-red-500">*</span></Label>
                  <Select value={poForm.godownId || ""} onValueChange={v => setPoForm(p => ({ ...p, godownId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                    <SelectContent>{godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label><Input type="date" value={poForm.date || ""} onChange={e => setPoForm(p => ({ ...p, date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-sm font-medium">Discount (৳)</Label><Input type="number" min={0} step="0.01" value={poForm.discount || 0} onChange={e => setPoForm(p => ({ ...p, discount: Number(e.target.value) }))} /></div>
                <div><Label className="text-sm font-medium">VAT %</Label><Input type="number" min={0} max={100} step="0.01" value={poForm.vatPercent || 0} onChange={e => setPoForm(p => ({ ...p, vatPercent: Number(e.target.value) }))} /></div>
                <div><Label className="text-sm font-medium">Status</Label>
                  <Select value={poForm.status || "Pending"} onValueChange={v => setPoForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Confirmed">Confirmed</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="Cancelled">Cancelled</SelectItem></SelectContent>
                  </Select></div>
              </div>
              <LineItemsGrid lines={poLines} setLines={setPoLines} template={{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }}
                columns={[{ key: "productId", label: "Product" }, { key: "quantity", label: "Qty" }, { key: "rate", label: "Rate" }, { key: "discountPercent", label: "Disc %" }, { key: "discountAmt", label: "Disc Amt" }, { key: "vatAmt", label: "VAT Amt" }, { key: "total", label: "Total" }]} showVat />
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setPoDialog(false)}>Cancel</Button><Button onClick={savePo} disabled={poSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{poSaving ? "Saving..." : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!poDelete} onOpenChange={() => setPoDelete(null)}>
          <DialogContent><DialogHeader><DialogTitle>Delete Purchase Order</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setPoDelete(null)}>Cancel</Button><Button variant="destructive" onClick={deletePo}>Delete</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    );
  };


  // ============================================================
  // TAB 5: AUTO PO
  // ============================================================

  const autoPoColumns: ExportColumnDef[] = [
    { key: "productCode", label: "Product Code", type: "text" },
    { key: "productName", label: "Product Name", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "currentStock", label: "Current Stock", type: "number" },
    { key: "reorderLevel", label: "Reorder Level", type: "number" },
    { key: "suggestedQuantity", label: "Suggested Qty", type: "number" },
    { key: "costPrice", label: "Cost Price", type: "currency" },
    { key: "estimatedCost", label: "Estimated Cost", type: "currency" },
  ];

  const autoPoFiltered = useMemo(() => {
    if (!autoPoSearch) return autoPoData;
    const q = autoPoSearch.toLowerCase();
    return autoPoData.filter((o: any) => (o.productCode || "").toLowerCase().includes(q) || (o.productName || o.product?.name || "").toLowerCase().includes(q));
  }, [autoPoData, autoPoSearch]);

  const autoPoStats = useMemo(() => ({
    total: autoPoData.length,
    suggested: autoPoData.reduce((s: number, o: any) => s + (Number(o.suggestedQuantity) || 0), 0),
    totalCost: autoPoData.reduce((s: number, o: any) => s + (Number(o.estimatedCost) || Number(o.suggestedQuantity) * Number(o.costPrice) || 0), 0),
    belowReorder: autoPoData.filter((o: any) => (Number(o.currentStock) || 0) <= (Number(o.reorderLevel) || 0)).length,
  }), [autoPoData]);

  const generateAutoPo = async () => {
    setAutoPoGenerating(true);
    try {
      const selectedItems = autoPoData.filter((o: any) => autoPoSelected.has(o.productId || o.id));
      if (selectedItems.length === 0) { toast({ title: "Error", description: "Select at least one product", variant: "destructive" }); setAutoPoGenerating(false); return; }
      const lines = selectedItems.map((item: any) => ({ productId: item.productId || item.id, quantity: item.suggestedQuantity || 1, rate: item.costPrice || 0, discountPercent: 0 }));
      const subTotal = lines.reduce((s: number, l: any) => s + l.quantity * l.rate, 0);
      const payload = { supplierId: "", godownId: "", date: new Date().toISOString().split("T")[0], status: "Pending", discount: 0, vatPercent: 0, notes: "Auto-generated PO", lines, subTotal, vatAmount: 0, vatPercentage: 0, grandTotal: subTotal };
      await apiFetch("/api/purchase-orders", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "PO Generated", description: `Purchase Order created with ${selectedItems.length} items` });
      setAutoPoSelected(new Set());
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setAutoPoGenerating(false); }
  };

  const toggleAutoPoSelect = (id: string) => {
    setAutoPoSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const renderAutoPo = () => {
    if (isSR) return <AccessDenied message="Sales Representatives cannot access Auto PO." />;
    if (isDealer) return <AccessDenied message="Dealers cannot access Auto PO." />;
    return (
      <div className="space-y-4">
        {isVatAuditor && <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2"><Shield className="h-4 w-4 text-amber-600" /><span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Cost/estimated cost columns are masked</span></div>}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard label="Products Below Reorder" value={autoPoStats.belowReorder} icon={AlertTriangle} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Total Suggestions" value={autoPoStats.total} icon={Calculator} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Suggested Qty" value={autoPoStats.suggested} icon={Package} color="text-purple-500" bg="bg-purple-500/10" />
          <StatCard label="Estimated Cost" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(autoPoStats.totalCost)} icon={DollarSign} color="text-emerald-500" bg="bg-emerald-500/10" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={autoPoSearch} onChange={e => setAutoPoSearch(e.target.value)} placeholder="Search products..." className="pl-8" />
          </div>
          <Button variant="outline" size="sm" onClick={() => doExportCSV("Auto PO Suggestions", autoPoColumns, autoPoFiltered, ["costPrice", "estimatedCost"])}><Download className="h-4 w-4 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportPDF("Auto PO Suggestions", autoPoColumns, autoPoFiltered, ["costPrice", "estimatedCost"])}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
          <Button variant="ghost" size="sm" onClick={loadAutoPo}><RefreshCw className={`h-4 w-4 ${autoPoLoading ? "animate-spin" : ""}`} /></Button>
          {isAdmin && <Button onClick={generateAutoPo} disabled={autoPoGenerating || autoPoSelected.size === 0} className="bg-[#2563eb] hover:bg-[#1d4ed8]"><ShoppingCart className="h-4 w-4 mr-1" /> {autoPoGenerating ? "Generating..." : `Generate PO (${autoPoSelected.size})`}</Button>}
        </div>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-b-lg">
            <p className="text-xs text-slate-500 dark:text-slate-400"><strong>Formula:</strong> Suggested PO = Avg Sales × Lead Time − Stock + Safety Stock</p>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    <TableHead className="text-white text-xs w-10">Select</TableHead>
                    {autoPoColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {autoPoLoading ? (
                    <TableRow><TableCell colSpan={autoPoColumns.length + 1} className="text-center py-8 text-slate-400"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : autoPoFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={autoPoColumns.length + 1} className="text-center py-8 text-slate-400">No auto PO suggestions found</TableCell></TableRow>
                  ) : autoPoFiltered.map((item: any) => {
                    const id = item.productId || item.id;
                    return (
                      <TableRow key={id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell><input type="checkbox" checked={autoPoSelected.has(id)} onChange={() => toggleAutoPoSelect(id)} className="h-4 w-4 rounded border-slate-300" /></TableCell>
                        <TableCell className="text-xs font-medium">{item.productCode || item.product?.productCode || "—"}</TableCell>
                        <TableCell className="text-xs">{item.productName || item.product?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{item.category || item.product?.category?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{item.currentStock ?? "—"}</TableCell>
                        <TableCell className="text-xs">{item.reorderLevel ?? "—"}</TableCell>
                        <TableCell className="text-xs">{item.suggestedQuantity ?? "—"}</TableCell>
                        <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.costPrice)}</TableCell>
                        <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.estimatedCost || (Number(item.suggestedQuantity) || 0) * (Number(item.costPrice) || 0))}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // ============================================================
  // TAB 6: SALES ORDER
  // ============================================================

  const soColumns: ExportColumnDef[] = [
    { key: "invoiceNo", label: "Invoice No", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "customerName", label: "Customer", type: "text" },
    { key: "godownName", label: "Godown", type: "text" },
    { key: "subTotal", label: "Sub-Total", type: "currency" },
    { key: "discount", label: "Discount", type: "currency" },
    { key: "vatAmount", label: "VAT", type: "currency" },
    { key: "grandTotal", label: "Grand Total", type: "currency" },
    { key: "paymentOptionName", label: "Payment", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ];

  const soFiltered = useMemo(() => {
    if (!soSearch) return soData;
    const q = soSearch.toLowerCase();
    return soData.filter((o: any) => (o.invoiceNo || "").toLowerCase().includes(q) || (o.customer?.name || "").toLowerCase().includes(q) || (o.status || "").toLowerCase().includes(q));
  }, [soData, soSearch]);

  const soStats = useMemo(() => ({
    total: soData.length,
    pending: soData.filter((o: any) => o.status === "Pending").length,
    completed: soData.filter((o: any) => o.status === "Completed").length,
    totalValue: soData.reduce((s: number, o: any) => s + (Number(o.grandTotal) || 0), 0),
  }), [soData]);

  const openSoCreate = () => {
    setSoForm({ customerId: "", godownId: "", date: new Date().toISOString().split("T")[0], status: "Pending", discount: 0, vatPercent: 0, paymentOptionId: "", notes: "" });
    setSoLines([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setSoEdit(null);
    setSoDialog(true);
  };

  const openSoEdit = (item: any) => {
    setSoForm({ customerId: item.customerId || "", godownId: item.godownId || "", date: item.date ? item.date.split("T")[0] : "", status: item.status || "Pending", discount: item.discount || 0, vatPercent: item.vatPercentage || 0, paymentOptionId: item.paymentOptionId || "", notes: item.notes || "" });
    setSoLines(item.lines && item.lines.length > 0 ? item.lines : [{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setSoEdit(item);
    setSoDialog(true);
  };

  const saveSo = async () => {
    if (!soForm.customerId || !soForm.godownId || !soForm.date) { toast({ title: "Error", description: "Customer, Godown and Date are required", variant: "destructive" }); return; }
    // Credit limit check
    const cust = customers.find((c: any) => c.id === soForm.customerId);
    if (cust && cust.creditLimit) {
      const linesTotal = soLines.reduce((s: number, l: any) => s + (Number(l.quantity) || 0) * (Number(l.rate) || 0), 0);
      const orderTotal = linesTotal - (Number(soForm.discount) || 0);
      if (orderTotal > Number(cust.creditLimit)) {
        toast({ title: "⚠️ Credit Limit Warning", description: `Order total ৳${orderTotal.toFixed(2)} exceeds credit limit ৳${Number(cust.creditLimit).toFixed(2)}`, variant: "destructive" });
      }
    }
    setSoSaving(true);
    try {
      const linesPayload = soLines.filter((l: any) => l.productId).map((l: any) => ({ productId: l.productId, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, discountPercent: Number(l.discountPercent) || 0 }));
      const subTotal = linesPayload.reduce((s: number, l: any) => s + l.quantity * l.rate * (1 - l.discountPercent / 100), 0);
      const discountAmt = Number(soForm.discount) || 0;
      const vatAmt = (subTotal - discountAmt) * (Number(soForm.vatPercent) || 0) / 100;
      const grandTotal = subTotal - discountAmt + vatAmt;
      const payload = { ...soForm, lines: linesPayload, subTotal, discount: discountAmt, vatAmount: vatAmt, vatPercentage: soForm.vatPercent, paymentOptionId: soForm.paymentOptionId || null, grandTotal };
      if (soEdit) { await apiFetch(`/api/sales-orders/${soEdit.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Updated", description: "Sales Order updated" }); }
      else { await apiFetch("/api/sales-orders", { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Created", description: "Sales Order created" }); }
      setSoDialog(false); loadSalesOrders();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSoSaving(false); }
  };

  const deleteSo = async () => {
    if (!soDelete) return;
    try { await apiFetch(`/api/sales-orders/${soDelete.id}`, { method: "DELETE" }); toast({ title: "Deleted", description: "Sales Order deleted" }); setSoDelete(null); loadSalesOrders(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const handlePrintInvoice = async (soId: string, invoiceNo?: string) => {
    try {
      toast({ title: "Generating Invoice", description: "Fetching data..." });
      const [companyProfile, so] = await Promise.all([
        apiFetch("/api/company-branding"),
        apiFetch(`/api/sales-orders/${soId}?include=lines,customer,paymentOption`),
      ]);
      const customer = so.customer || {};
      const paymentOption = so.paymentOption || {};
      const items: InvoiceLineItem[] = (so.lines || []).map((line: any, idx: number) => {
        const qty = Number(line.quantity) || 0;
        const rate = Number(line.rate) || 0;
        const discPct = Number(line.discountPercent) || 0;
        const discAmt = qty * rate * (discPct / 100);
        const total = qty * rate - discAmt;
        return {
          sl: idx + 1,
          model: line.product?.name || "—",
          color: line.product?.color || "",
          description: line.product?.name || "—",
          qty,
          mrp: rate,
          discountAmt: discAmt,
          rate,
          total,
        };
      });
      const subTotal = items.reduce((s, i) => s + i.qty * i.mrp, 0);
      const discountAmount = Number(so.discount) || 0;
      const discountPercent = subTotal > 0 ? (discountAmount / subTotal) * 100 : 0;
      const invoiceData: InvoiceData = {
        invoiceNo: invoiceNo || so.invoiceNo || `INV-${String(so.id).padStart(5, "0")}`,
        invoiceDate: so.date ? new Date(so.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—",
        customerCode: customer.customerCode || "—",
        customerName: customer.name || "—",
        customerMobile: customer.phone || "—",
        customerAddress: customer.address || "",
        items,
        discountAmount,
        discountPercent: Math.round(discountPercent * 100) / 100,
        netTotal: Number(so.grandTotal) || 0,
        paidAmount: Number(so.grandTotal) || 0,
        currentDue: 0,
        paymentDetails: [{ method: paymentOption.name || "Cash", amount: Number(so.grandTotal) || 0 }],
        invoiceType: "Sales Invoice",
        barcodeData: so.invoiceNo || "",
        printedBy: auth.user?.displayName || auth.user?.name || "Admin",
        salesPerson: "System",
      };
      const templateConfig: InvoiceTemplateConfig = {
        showCompanyLogo: true,
        showBarcode: true,
        showQRCode: false,
        showWatermark: false,
        showTermsAndConditions: false,
        showBankDetails: false,
        showCustomerDetails: true,
        showProductImage: false,
        showDiscountColumn: true,
        showVATColumn: false,
        showAmountInWords: true,
        showSignatureLine: false,
        showFooterNote: true,
      };
      exportInvoicePDF({
        data: invoiceData,
        company: companyProfile,
        template: templateConfig,
        filename: `Invoice_${invoiceData.invoiceNo}.pdf`,
      });
      toast({ title: "Invoice Generated", description: `${invoiceData.invoiceNo} PDF generated successfully` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to generate invoice", variant: "destructive" });
    }
  };

  const renderSalesOrder = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access Sales Orders." />;
    return (
      <div className="space-y-4">
        {isVatAuditor && <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2"><Shield className="h-4 w-4 text-amber-600" /><span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Cost/profit columns are masked</span></div>}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard label="Total SOs" value={soStats.total} icon={Receipt} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Pending" value={soStats.pending} icon={Clock} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Completed" value={soStats.completed} icon={CheckCircle} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="Total Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(soStats.totalValue)} icon={DollarSign} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
        </div>
        <Toolbar search={soSearch} setSearch={setSoSearch} onRefresh={loadSalesOrders} loading={soLoading}
          onExportCSV={() => doExportCSV("Sales Orders", soColumns, soFiltered.map((o: any) => ({ ...o, customerName: o.customer?.name || "—", godownName: o.godown?.name || "—", paymentOptionName: o.paymentOption?.name || "Cash" })))}
          onExportPDF={() => doExportPDF("Sales Orders", soColumns, soFiltered.map((o: any) => ({ ...o, customerName: o.customer?.name || "—", godownName: o.godown?.name || "—", paymentOptionName: o.paymentOption?.name || "Cash" })))}
          onImportCSV={() => doImportCSV("/api/sales-orders", [], loadSalesOrders)}
          canCreate={isAdmin || isSR} onCreate={openSoCreate} createLabel="Add SO" />
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    {soColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soLoading ? (
                    <TableRow><TableCell colSpan={soColumns.length + 1} className="text-center py-8 text-slate-400"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : soFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={soColumns.length + 1} className="text-center py-8 text-slate-400">No sales orders found</TableCell></TableRow>
                  ) : soFiltered.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-xs font-medium">{item.invoiceNo || `SO-${String(item.id).padStart(5, "0")}`}</TableCell>
                      <TableCell className="text-xs">{fmt(item.date, "date")}</TableCell>
                      <TableCell className="text-xs">{item.customer?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{item.godown?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.subTotal)}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.discount)}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.vatAmount)}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.grandTotal)}</TableCell>
                      <TableCell className="text-xs">{item.paymentOption?.name || "Cash"}</TableCell>
                      <TableCell className="text-xs"><StatusBadge status={item.status || "Pending"} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handlePrintInvoice(item.id, item.invoiceNo)} className="h-7 w-7 p-0 text-blue-500" title="Print Invoice"><Printer className="h-3 w-3" /></Button>
                          {(isAdmin || isSR) && <Button variant="ghost" size="sm" onClick={() => openSoEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>}
                          {isAdmin && <Button variant="ghost" size="sm" onClick={() => setSoDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Dialog open={soDialog} onOpenChange={setSoDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{soEdit ? "Edit" : "Create"} Sales Order</DialogTitle><DialogDescription>Fill in SO details and line items.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-sm font-medium">Customer <span className="text-red-500">*</span></Label>
                  <Select value={soForm.customerId || ""} onValueChange={v => setSoForm(p => ({ ...p, customerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Godown <span className="text-red-500">*</span></Label>
                  <Select value={soForm.godownId || ""} onValueChange={v => setSoForm(p => ({ ...p, godownId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                    <SelectContent>{godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label><Input type="date" value={soForm.date || ""} onChange={e => setSoForm(p => ({ ...p, date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div><Label className="text-sm font-medium">Discount (৳)</Label><Input type="number" min={0} step="0.01" value={soForm.discount || 0} onChange={e => setSoForm(p => ({ ...p, discount: Number(e.target.value) }))} /></div>
                <div><Label className="text-sm font-medium">VAT %</Label><Input type="number" min={0} max={100} step="0.01" value={soForm.vatPercent || 0} onChange={e => setSoForm(p => ({ ...p, vatPercent: Number(e.target.value) }))} /></div>
                <div><Label className="text-sm font-medium">Payment Option</Label>
                  <Select value={soForm.paymentOptionId || "_none"} onValueChange={v => setSoForm(p => ({ ...p, paymentOptionId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Payment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {paymentOptions.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.name}</SelectItem>)}
                    </SelectContent>
                  </Select></div>
              </div>
              <div><Label className="text-sm font-medium">Notes</Label><Textarea value={soForm.notes || ""} onChange={e => setSoForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
              <LineItemsGrid lines={soLines} setLines={setSoLines} template={{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }}
                columns={[{ key: "productId", label: "Product" }, { key: "quantity", label: "Qty" }, { key: "rate", label: "Rate" }, { key: "discountPercent", label: "Disc %" }, { key: "discountAmt", label: "Disc Amt" }, { key: "vatAmt", label: "VAT Amt" }, { key: "total", label: "Total" }]} showVat />
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setSoDialog(false)}>Cancel</Button><Button onClick={saveSo} disabled={soSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{soSaving ? "Saving..." : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!soDelete} onOpenChange={() => setSoDelete(null)}>
          <DialogContent><DialogHeader><DialogTitle>Delete Sales Order</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setSoDelete(null)}>Cancel</Button><Button variant="destructive" onClick={deleteSo}>Delete</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // TAB 7: HIRE SALES
  // ============================================================

  const hsColumns: ExportColumnDef[] = [
    { key: "invoiceNo", label: "Invoice No", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "customerName", label: "Customer", type: "text" },
    { key: "subTotal", label: "Sub-Total", type: "currency" },
    { key: "downPayment", label: "Down Payment", type: "currency" },
    { key: "duration", label: "Duration (mo)", type: "number" },
    { key: "installmentAmount", label: "Installment Amt", type: "currency" },
    { key: "balanceAmount", label: "Balance", type: "currency" },
    { key: "status", label: "Status", type: "text" },
  ];

  const hsFiltered = useMemo(() => {
    if (!hsSearch) return hsData;
    const q = hsSearch.toLowerCase();
    return hsData.filter((o: any) => (o.invoiceNo || "").toLowerCase().includes(q) || (o.customer?.name || "").toLowerCase().includes(q) || (o.status || "").toLowerCase().includes(q));
  }, [hsData, hsSearch]);

  const hsStats = useMemo(() => ({
    total: hsData.length,
    active: hsData.filter((o: any) => o.status === "Active").length,
    totalValue: hsData.reduce((s: number, o: any) => s + (Number(o.grandTotal) || Number(o.subTotal) || 0), 0),
    totalOutstanding: hsData.reduce((s: number, o: any) => s + (Number(o.balanceAmount) || 0), 0),
  }), [hsData]);

  const openHsCreate = () => {
    setHsForm({ customerId: "", date: new Date().toISOString().split("T")[0], status: "Active", downPayment: 0, duration: 12, hireRate: 0, notes: "" });
    setHsLines([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setHsEdit(null);
    setHsDialog(true);
  };

  const openHsEdit = (item: any) => {
    setHsForm({ customerId: item.customerId || "", date: item.date ? item.date.split("T")[0] : "", status: item.status || "Active", downPayment: item.downPayment || 0, duration: item.duration || 12, hireRate: item.hireRate || 0, notes: item.notes || "" });
    setHsLines(item.lines && item.lines.length > 0 ? item.lines : [{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setHsEdit(item);
    setHsDialog(true);
  };

  const saveHs = async () => {
    if (!hsForm.customerId || !hsForm.date) { toast({ title: "Error", description: "Customer and Date are required", variant: "destructive" }); return; }
    setHsSaving(true);
    try {
      const linesPayload = hsLines.filter((l: any) => l.productId).map((l: any) => ({ productId: l.productId, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0, discountPercent: Number(l.discountPercent) || 0 }));
      const subTotal = linesPayload.reduce((s: number, l: any) => s + l.quantity * l.rate * (1 - l.discountPercent / 100), 0);
      const downPayment = Number(hsForm.downPayment) || 0;
      const duration = Number(hsForm.duration) || 12;
      const hireRate = Number(hsForm.hireRate) || 0;
      const hireCharge = subTotal * hireRate / 100;
      const totalWithHire = subTotal + hireCharge;
      const balance = totalWithHire - downPayment;
      const installmentAmt = duration > 0 ? balance / duration : 0;
      const payload = { ...hsForm, lines: linesPayload, subTotal, downPayment, hireCharge, grandTotal: totalWithHire, balanceAmount: balance, installmentAmount: installmentAmt };
      if (hsEdit) { await apiFetch(`/api/hire-sales/${hsEdit.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Updated", description: "Hire Sale updated" }); }
      else { await apiFetch("/api/hire-sales", { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Created", description: "Hire Sale created" }); }
      setHsDialog(false); loadHireSales();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setHsSaving(false); }
  };

  const deleteHs = async () => {
    if (!hsDelete) return;
    try { await apiFetch(`/api/hire-sales/${hsDelete.id}`, { method: "DELETE" }); toast({ title: "Deleted", description: "Hire Sale deleted" }); setHsDelete(null); loadHireSales(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const renderHireSales = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access Hire Sales." />;
    return (
      <div className="space-y-4">
        {isVatAuditor && <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2"><Shield className="h-4 w-4 text-amber-600" /><span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Balance and total paid columns are masked</span></div>}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard label="Total Hire Sales" value={hsStats.total} icon={DollarSign} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Active" value={hsStats.active} icon={CheckCircle} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="Total Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(hsStats.totalValue)} icon={TrendingUp} color="text-purple-500" bg="bg-purple-500/10" />
          <StatCard label="Outstanding" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(hsStats.totalOutstanding)} icon={AlertTriangle} color="text-amber-500" bg="bg-amber-500/10" />
        </div>
        <Toolbar search={hsSearch} setSearch={setHsSearch} onRefresh={loadHireSales} loading={hsLoading}
          onExportCSV={() => doExportCSV("Hire Sales", hsColumns, hsFiltered.map((o: any) => ({ ...o, customerName: o.customer?.name || "—" })), ["balanceAmount", "installmentAmount"])}
          onExportPDF={() => doExportPDF("Hire Sales", hsColumns, hsFiltered.map((o: any) => ({ ...o, customerName: o.customer?.name || "—" })), ["balanceAmount", "installmentAmount"])}
          onImportCSV={() => doImportCSV("/api/hire-sales", [], loadHireSales)}
          canCreate={isAdmin || isSR} onCreate={openHsCreate} createLabel="Add Hire Sale" />
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    {hsColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hsLoading ? (
                    <TableRow><TableCell colSpan={hsColumns.length + 1} className="text-center py-8 text-slate-400"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : hsFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={hsColumns.length + 1} className="text-center py-8 text-slate-400">No hire sales found</TableCell></TableRow>
                  ) : hsFiltered.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-xs font-medium">{item.invoiceNo || `HIR-${String(item.id).padStart(5, "0")}`}</TableCell>
                      <TableCell className="text-xs">{fmt(item.date, "date")}</TableCell>
                      <TableCell className="text-xs">{item.customer?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.subTotal)}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.downPayment)}</TableCell>
                      <TableCell className="text-xs">{item.duration || "—"}</TableCell>
                      <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.installmentAmount)}</TableCell>
                      <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.balanceAmount)}</TableCell>
                      <TableCell className="text-xs"><StatusBadge status={item.status || "Active"} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setHsViewInstallments(item)} className="h-7 w-7 p-0"><Eye className="h-3 w-3" /></Button>
                          {(isAdmin || isSR) && <Button variant="ghost" size="sm" onClick={() => openHsEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>}
                          {isAdmin && <Button variant="ghost" size="sm" onClick={() => setHsDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        {/* Create/Edit Dialog */}
        <Dialog open={hsDialog} onOpenChange={setHsDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{hsEdit ? "Edit" : "Create"} Hire Sale</DialogTitle><DialogDescription>Fill in hire sale details, line items and installment schedule.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Customer <span className="text-red-500">*</span></Label>
                  <Select value={hsForm.customerId || ""} onValueChange={v => setHsForm(p => ({ ...p, customerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                    <SelectContent>{customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label><Input type="date" value={hsForm.date || ""} onChange={e => setHsForm(p => ({ ...p, date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-4 gap-4">
                <div><Label className="text-sm font-medium">Down Payment</Label><Input type="number" min={0} step="0.01" value={hsForm.downPayment || 0} onChange={e => setHsForm(p => ({ ...p, downPayment: Number(e.target.value) }))} /></div>
                <div><Label className="text-sm font-medium">Duration (mo)</Label><Input type="number" min={1} value={hsForm.duration || 12} onChange={e => setHsForm(p => ({ ...p, duration: Number(e.target.value) }))} /></div>
                <div><Label className="text-sm font-medium">Hire Rate %</Label><Input type="number" min={0} step="0.01" value={hsForm.hireRate || 0} onChange={e => setHsForm(p => ({ ...p, hireRate: Number(e.target.value) }))} /></div>
                <div><Label className="text-sm font-medium">Status</Label>
                  <Select value={hsForm.status || "Active"} onValueChange={v => setHsForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="Defaulted">Defaulted</SelectItem><SelectItem value="Cancelled">Cancelled</SelectItem></SelectContent>
                  </Select></div>
              </div>
              <LineItemsGrid lines={hsLines} setLines={setHsLines} template={{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }}
                columns={[{ key: "productId", label: "Product" }, { key: "quantity", label: "Qty" }, { key: "rate", label: "Rate" }, { key: "discountPercent", label: "Disc %" }, { key: "total", label: "Total" }]} />
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setHsDialog(false)}>Cancel</Button><Button onClick={saveHs} disabled={hsSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{hsSaving ? "Saving..." : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        {/* Installment View Dialog */}
        <Dialog open={!!hsViewInstallments} onOpenChange={() => setHsViewInstallments(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader><DialogTitle>Installment Schedule — {hsViewInstallments?.invoiceNo || "HIR"}</DialogTitle><DialogDescription>View installment payments for this hire sale.</DialogDescription></DialogHeader>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    <TableHead className="text-white text-xs">#</TableHead>
                    <TableHead className="text-white text-xs">Due Date</TableHead>
                    <TableHead className="text-white text-xs">Amount</TableHead>
                    <TableHead className="text-white text-xs">Paid</TableHead>
                    <TableHead className="text-white text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(() => {
                    const h = hsViewInstallments;
                    if (!h) return null;
                    const dur = Number(h.duration) || 12;
                    const instAmt = Number(h.installmentAmount) || (dur > 0 ? (Number(h.balanceAmount) || 0) / dur : 0);
                    const installments = h.installments || [];
                    const rows = [];
                    for (let i = 1; i <= dur; i++) {
                      const inst = installments[i - 1] || {};
                      const dueDate = h.date ? new Date(new Date(h.date).getTime() + i * 30 * 24 * 60 * 60 * 1000) : null;
                      rows.push(
                        <TableRow key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <TableCell className="text-xs">{i}</TableCell>
                          <TableCell className="text-xs">{dueDate ? fmt(dueDate.toISOString(), "date") : "—"}</TableCell>
                          <TableCell className="text-xs">{fmtCurrency(instAmt)}</TableCell>
                          <TableCell className="text-xs">{fmtCurrency(inst.paidAmount || 0)}</TableCell>
                          <TableCell className="text-xs"><StatusBadge status={inst.status || "Pending"} /></TableCell>
                        </TableRow>
                      );
                    }
                    return rows;
                  })()}
                </TableBody>
              </Table>
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setHsViewInstallments(null)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!hsDelete} onOpenChange={() => setHsDelete(null)}>
          <DialogContent><DialogHeader><DialogTitle>Delete Hire Sale</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setHsDelete(null)}>Cancel</Button><Button variant="destructive" onClick={deleteHs}>Delete</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    );
  };


  // ============================================================
  // TAB 8: SALES RETURN
  // ============================================================

  const srColumns: ExportColumnDef[] = [
    { key: "returnNo", label: "Return No", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "salesOrderNo", label: "Sales Order", type: "text" },
    { key: "customerName", label: "Customer", type: "text" },
    { key: "subTotal", label: "Sub-Total", type: "currency" },
    { key: "vatAmount", label: "VAT", type: "currency" },
    { key: "grandTotal", label: "Grand Total", type: "currency" },
    { key: "reason", label: "Reason", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ];

  const srFiltered = useMemo(() => {
    if (!srSearch) return srData;
    const q = srSearch.toLowerCase();
    return srData.filter((o: any) => (o.returnNo || "").toLowerCase().includes(q) || (o.salesOrder?.invoiceNo || "").toLowerCase().includes(q) || (o.status || "").toLowerCase().includes(q));
  }, [srData, srSearch]);

  const srStats = useMemo(() => ({
    total: srData.length,
    pending: srData.filter((o: any) => o.status === "Pending").length,
    totalValue: srData.reduce((s: number, o: any) => s + (Number(o.grandTotal) || 0), 0),
  }), [srData]);

  const loadSrProducts = async (salesOrderId: string) => {
    if (!salesOrderId) { setSrAvailableProducts([]); return; }
    try {
      const order = await apiFetch(`/api/sales-orders/${salesOrderId}`);
      const existingReturns = srData.filter((r: any) => r.salesOrderId === salesOrderId && r.id !== srEdit?.id);
      const returnedQtyMap: Record<string, number> = {};
      existingReturns.forEach((r: any) => {
        (r.lines || []).forEach((l: any) => { returnedQtyMap[l.productId] = (returnedQtyMap[l.productId] || 0) + (Number(l.quantity) || 0); });
      });
      const available = (order.lines || []).map((l: any) => ({
        ...l, maxQty: (Number(l.quantity) || 0) - (returnedQtyMap[l.productId] || 0),
      })).filter((l: any) => l.maxQty > 0);
      setSrAvailableProducts(available);
      setSrLines(available.map((l: any) => ({ productId: l.productId, quantity: 1, rate: l.rate || 0, discountPercent: l.discountPercent || 0, maxQty: l.maxQty })));
    } catch { setSrAvailableProducts([]); }
  };

  const openSrCreate = () => {
    setSrForm({ salesOrderId: "", customerId: "", date: new Date().toISOString().split("T")[0], reason: "", status: "Pending" });
    setSrLines([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setSrAvailableProducts([]);
    setSrEdit(null);
    setSrDialog(true);
  };

  const openSrEdit = (item: any) => {
    setSrForm({ salesOrderId: item.salesOrderId || "", customerId: item.customerId || "", date: item.date ? item.date.split("T")[0] : "", reason: item.reason || "", status: item.status || "Pending" });
    setSrLines(item.lines && item.lines.length > 0 ? item.lines : [{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setSrEdit(item);
    setSrDialog(true);
    if (item.salesOrderId) loadSrProducts(item.salesOrderId);
  };

  const saveSr = async () => {
    const selectedSo = soData.find((so: any) => so.id === srForm.salesOrderId);
    const customerId = srForm.customerId || selectedSo?.customerId || selectedSo?.customer?.id || "";
    if (!srForm.salesOrderId || !customerId || !srForm.date) { toast({ title: "Error", description: "Sales Order and Date are required", variant: "destructive" }); return; }
    setSrSaving(true);
    try {
      const linesPayload = srLines.filter((l: any) => l.productId && l.quantity > 0).map((l: any) => {
        const maxQty = l.maxQty || Infinity;
        const qty = Math.min(Number(l.quantity) || 1, maxQty);
        return { productId: l.productId, quantity: qty, rate: Number(l.rate) || 0, discountPercent: Number(l.discountPercent) || 0 };
      });
      const subTotal = linesPayload.reduce((s: number, l: any) => s + l.quantity * l.rate * (1 - l.discountPercent / 100), 0);
      const vatAmt = subTotal * 0.15;
      const payload = { ...srForm, customerId, lines: linesPayload, subTotal, vatAmount: vatAmt, vatPercentage: 15, grandTotal: subTotal + vatAmt };
      if (srEdit) { await apiFetch(`/api/sales-returns/${srEdit.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Updated", description: "Sales Return updated" }); }
      else { await apiFetch("/api/sales-returns", { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Created", description: "Sales Return created" }); }
      setSrDialog(false); loadSalesReturns();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSrSaving(false); }
  };

  const deleteSr = async () => {
    if (!srDelete) return;
    try { await apiFetch(`/api/sales-returns/${srDelete.id}`, { method: "DELETE" }); toast({ title: "Deleted", description: "Sales Return deleted" }); setSrDelete(null); loadSalesReturns(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const renderSalesReturn = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access Sales Returns." />;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Returns" value={srStats.total} icon={RotateCcw} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Pending" value={srStats.pending} icon={Clock} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Total Value" value={fmtCurrency(srStats.totalValue)} icon={DollarSign} color="text-emerald-500" bg="bg-emerald-500/10" />
        </div>
        <Toolbar search={srSearch} setSearch={setSrSearch} onRefresh={loadSalesReturns} loading={srLoading}
          onExportCSV={() => doExportCSV("Sales Returns", srColumns, srFiltered.map((o: any) => ({ ...o, salesOrderNo: o.salesOrder?.invoiceNo || "—", customerName: o.salesOrder?.customer?.name || "—" })))}
          onExportPDF={() => doExportPDF("Sales Returns", srColumns, srFiltered.map((o: any) => ({ ...o, salesOrderNo: o.salesOrder?.invoiceNo || "—", customerName: o.salesOrder?.customer?.name || "—" })))}
          onImportCSV={() => doImportCSV("/api/sales-returns", [], loadSalesReturns)}
          canCreate={isAdmin || isSR} onCreate={openSrCreate} createLabel="Add Return" />
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    {srColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {srLoading ? (
                    <TableRow><TableCell colSpan={srColumns.length + 1} className="text-center py-8 text-slate-400"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : srFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={srColumns.length + 1} className="text-center py-8 text-slate-400">No sales returns found</TableCell></TableRow>
                  ) : srFiltered.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-xs font-medium">{item.returnNo || `SRT-${String(item.id).padStart(5, "0")}`}</TableCell>
                      <TableCell className="text-xs">{fmt(item.date, "date")}</TableCell>
                      <TableCell className="text-xs">{item.salesOrder?.invoiceNo || "—"}</TableCell>
                      <TableCell className="text-xs">{item.salesOrder?.customer?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.subTotal)}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.vatAmount)}</TableCell>
                      <TableCell className="text-xs">{fmtCurrency(item.grandTotal)}</TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">{item.reason || "—"}</TableCell>
                      <TableCell className="text-xs"><StatusBadge status={item.status || "Pending"} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openSrEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>
                          {isAdmin && <Button variant="ghost" size="sm" onClick={() => setSrDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Dialog open={srDialog} onOpenChange={setSrDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{srEdit ? "Edit" : "Create"} Sales Return</DialogTitle><DialogDescription>Select a sales order and enter return details.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Sales Order <span className="text-red-500">*</span></Label>
                  <Select value={srForm.salesOrderId || ""} onValueChange={v => { const so = soData.find((s: any) => s.id === v); setSrForm(p => ({ ...p, salesOrderId: v, customerId: so?.customerId || so?.customer?.id || "" })); loadSrProducts(v); }}>
                    <SelectTrigger><SelectValue placeholder="Select Sales Order" /></SelectTrigger>
                    <SelectContent>{soData.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.invoiceNo || `SO-${String(s.id).padStart(5, "0")}`}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label><Input type="date" value={srForm.date || ""} onChange={e => setSrForm(p => ({ ...p, date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Reason</Label><Textarea value={srForm.reason || ""} onChange={e => setSrForm(p => ({ ...p, reason: e.target.value }))} rows={2} /></div>
                <div><Label className="text-sm font-medium">Status</Label>
                  <Select value={srForm.status || "Pending"} onValueChange={v => setSrForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Approved">Approved</SelectItem><SelectItem value="Completed">Completed</SelectItem><SelectItem value="Cancelled">Cancelled</SelectItem></SelectContent>
                  </Select></div>
              </div>
              {srAvailableProducts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-900 dark:text-white">Return Items (max returnable shown)</Label>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                          <TableHead className="text-white text-xs">Product</TableHead>
                          <TableHead className="text-white text-xs">Max Qty</TableHead>
                          <TableHead className="text-white text-xs">Return Qty</TableHead>
                          <TableHead className="text-white text-xs">Rate</TableHead>
                          <TableHead className="text-white text-xs">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {srLines.map((line: any, idx: number) => {
                          const prod = products.find((p: any) => p.id === line.productId);
                          return (
                            <TableRow key={idx}>
                              <TableCell className="text-xs">{prod?.name || line.productId || "—"}</TableCell>
                              <TableCell className="text-xs">{line.maxQty || "—"}</TableCell>
                              <TableCell><Input type="number" min={1} max={line.maxQty || 999} value={line.quantity || 1} onChange={e => updateLine(setSrLines, idx, "quantity", Math.min(Number(e.target.value), line.maxQty || 999))} className="h-8 w-20 text-xs" /></TableCell>
                              <TableCell className="text-xs">{fmtCurrency(line.rate || 0)}</TableCell>
                              <TableCell className="text-xs">{fmtCurrency((Number(line.quantity) || 0) * (Number(line.rate) || 0))}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
              {srForm.salesOrderId && srAvailableProducts.length === 0 && (
                <div className="text-center py-4 text-slate-400 text-sm">No items available for return from this order</div>
              )}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setSrDialog(false)}>Cancel</Button><Button onClick={saveSr} disabled={srSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{srSaving ? "Saving..." : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!srDelete} onOpenChange={() => setSrDelete(null)}>
          <DialogContent><DialogHeader><DialogTitle>Delete Sales Return</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setSrDelete(null)}>Cancel</Button><Button variant="destructive" onClick={deleteSr}>Delete</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // TAB 9: PURCHASE RETURN
  // ============================================================

  const prColumns: ExportColumnDef[] = [
    { key: "returnNo", label: "Return No", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "purchaseOrderNo", label: "Purchase Order", type: "text" },
    { key: "supplierName", label: "Supplier", type: "text" },
    { key: "subTotal", label: "Sub-Total", type: "currency" },
    { key: "vatAmount", label: "VAT", type: "currency" },
    { key: "grandTotal", label: "Grand Total", type: "currency" },
    { key: "debitNoteCode", label: "Debit Note", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ];

  const prMaskedCols = ["subTotal", "vatAmount", "grandTotal"];

  const prFiltered = useMemo(() => {
    if (!prSearch) return prData;
    const q = prSearch.toLowerCase();
    return prData.filter((o: any) => (o.returnNo || "").toLowerCase().includes(q) || (o.purchaseOrder?.poNumber || "").toLowerCase().includes(q) || (o.status || "").toLowerCase().includes(q));
  }, [prData, prSearch]);

  const prStats = useMemo(() => ({
    total: prData.length,
    pending: prData.filter((o: any) => o.status === "Pending").length,
    totalValue: prData.reduce((s: number, o: any) => s + (Number(o.grandTotal) || 0), 0),
  }), [prData]);

  const loadPrProducts = async (purchaseOrderId: string) => {
    if (!purchaseOrderId) { setPrAvailableProducts([]); return; }
    try {
      const order = await apiFetch(`/api/purchase-orders/${purchaseOrderId}`);
      const existingReturns = prData.filter((r: any) => r.purchaseOrderId === purchaseOrderId && r.id !== prEdit?.id);
      const returnedQtyMap: Record<string, number> = {};
      existingReturns.forEach((r: any) => {
        (r.lines || []).forEach((l: any) => { returnedQtyMap[l.productId] = (returnedQtyMap[l.productId] || 0) + (Number(l.quantity) || 0); });
      });
      const available = (order.lines || []).map((l: any) => ({
        ...l, maxQty: (Number(l.quantity) || 0) - (returnedQtyMap[l.productId] || 0),
      })).filter((l: any) => l.maxQty > 0);
      setPrAvailableProducts(available);
      setPrLines(available.map((l: any) => ({ productId: l.productId, quantity: 1, rate: l.rate || 0, discountPercent: l.discountPercent || 0, maxQty: l.maxQty })));
    } catch { setPrAvailableProducts([]); }
  };

  const openPrCreate = () => {
    setPrForm({ purchaseOrderId: "", supplierId: "", date: new Date().toISOString().split("T")[0], reason: "", status: "Pending" });
    setPrLines([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setPrAvailableProducts([]);
    setPrEdit(null);
    setPrDialog(true);
  };

  const openPrEdit = (item: any) => {
    setPrForm({ purchaseOrderId: item.purchaseOrderId || "", supplierId: item.supplierId || "", date: item.date ? item.date.split("T")[0] : "", reason: item.reason || "", status: item.status || "Pending" });
    setPrLines(item.lines && item.lines.length > 0 ? item.lines : [{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setPrEdit(item);
    setPrDialog(true);
    if (item.purchaseOrderId) loadPrProducts(item.purchaseOrderId);
  };

  const savePr = async () => {
    const selectedPo = poData.find((po: any) => po.id === prForm.purchaseOrderId);
    const supplierId = prForm.supplierId || selectedPo?.supplierId || selectedPo?.supplier?.id || "";
    if (!prForm.purchaseOrderId || !supplierId || !prForm.date) { toast({ title: "Error", description: "Purchase Order and Date are required", variant: "destructive" }); return; }
    setPrSaving(true);
    try {
      const linesPayload = prLines.filter((l: any) => l.productId && l.quantity > 0).map((l: any) => {
        const maxQty = l.maxQty || Infinity;
        const qty = Math.min(Number(l.quantity) || 1, maxQty);
        return { productId: l.productId, quantity: qty, rate: Number(l.rate) || 0, discountPercent: Number(l.discountPercent) || 0 };
      });
      const subTotal = linesPayload.reduce((s: number, l: any) => s + l.quantity * l.rate * (1 - l.discountPercent / 100), 0);
      const vatAmt = subTotal * 0.15;
      const payload = { ...prForm, supplierId, lines: linesPayload, subTotal, vatAmount: vatAmt, vatPercentage: 15, grandTotal: subTotal + vatAmt };
      if (prEdit) { await apiFetch(`/api/purchase-returns/${prEdit.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Updated", description: "Purchase Return updated" }); }
      else { await apiFetch("/api/purchase-returns", { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Created", description: "Purchase Return created" }); }
      setPrDialog(false); loadPurchaseReturns();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setPrSaving(false); }
  };

  const deletePr = async () => {
    if (!prDelete) return;
    try { await apiFetch(`/api/purchase-returns/${prDelete.id}`, { method: "DELETE" }); toast({ title: "Deleted", description: "Purchase Return deleted" }); setPrDelete(null); loadPurchaseReturns(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const renderPurchaseReturn = () => {
    if (isSR) return <AccessDenied message="Sales Representatives cannot access Purchase Returns." />;
    if (isDealer) return <AccessDenied message="Dealers cannot access Purchase Returns." />;
    return (
      <div className="space-y-4">
        {isVatAuditor && <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2"><Shield className="h-4 w-4 text-amber-600" /><span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — All financial columns are masked</span></div>}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Returns" value={prStats.total} icon={RotateCcw} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Pending" value={prStats.pending} icon={Clock} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Total Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(prStats.totalValue)} icon={DollarSign} color="text-emerald-500" bg="bg-emerald-500/10" />
        </div>
        <Toolbar search={prSearch} setSearch={setPrSearch} onRefresh={loadPurchaseReturns} loading={prLoading}
          onExportCSV={() => doExportCSV("Purchase Returns", prColumns, prFiltered.map((o: any) => ({ ...o, purchaseOrderNo: o.purchaseOrder?.poNumber || "—", supplierName: o.purchaseOrder?.supplier?.name || "—" })), prMaskedCols)}
          onExportPDF={() => doExportPDF("Purchase Returns", prColumns, prFiltered.map((o: any) => ({ ...o, purchaseOrderNo: o.purchaseOrder?.poNumber || "—", supplierName: o.purchaseOrder?.supplier?.name || "—" })), prMaskedCols)}
          onImportCSV={() => doImportCSV("/api/purchase-returns", [], loadPurchaseReturns)}
          canCreate={isAdmin} onCreate={openPrCreate} createLabel="Add Return" />
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    {prColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prLoading ? (
                    <TableRow><TableCell colSpan={prColumns.length + 1} className="text-center py-8 text-slate-400"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : prFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={prColumns.length + 1} className="text-center py-8 text-slate-400">No purchase returns found</TableCell></TableRow>
                  ) : prFiltered.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-xs font-medium">{item.returnNo || `PRT-${String(item.id).padStart(5, "0")}`}</TableCell>
                      <TableCell className="text-xs">{fmt(item.date, "date")}</TableCell>
                      <TableCell className="text-xs">{item.purchaseOrder?.poNumber || "—"}</TableCell>
                      <TableCell className="text-xs">{item.purchaseOrder?.supplier?.name || "—"}</TableCell>
                      <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.subTotal)}</TableCell>
                      <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.vatAmount)}</TableCell>
                      <TableCell className="text-xs">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.grandTotal)}</TableCell>
                      <TableCell className="text-xs">{item.debitNoteCode || "—"}</TableCell>
                      <TableCell className="text-xs"><StatusBadge status={item.status || "Pending"} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openPrEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>
                          <Button variant="ghost" size="sm" onClick={() => setPrDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Dialog open={prDialog} onOpenChange={setPrDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{prEdit ? "Edit" : "Create"} Purchase Return</DialogTitle><DialogDescription>Select a purchase order and enter return details.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Purchase Order <span className="text-red-500">*</span></Label>
                  <Select value={prForm.purchaseOrderId || ""} onValueChange={v => { const po = poData.find((p: any) => p.id === v); setPrForm(p => ({ ...p, purchaseOrderId: v, supplierId: po?.supplierId || po?.supplier?.id || "" })); loadPrProducts(v); }}>
                    <SelectTrigger><SelectValue placeholder="Select PO" /></SelectTrigger>
                    <SelectContent>{poData.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.poNumber || `PO-${String(p.id).padStart(5, "0")}`}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label><Input type="date" value={prForm.date || ""} onChange={e => setPrForm(p => ({ ...p, date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Reason</Label><Textarea value={prForm.reason || ""} onChange={e => setPrForm(p => ({ ...p, reason: e.target.value }))} rows={2} /></div>
                <div><Label className="text-sm font-medium">Status</Label>
                  <Select value={prForm.status || "Pending"} onValueChange={v => setPrForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Approved">Approved</SelectItem><SelectItem value="Completed">Completed</SelectItem></SelectContent>
                  </Select></div>
              </div>
              {prAvailableProducts.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-900 dark:text-white">Return Items</Label>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                          <TableHead className="text-white text-xs">Product</TableHead>
                          <TableHead className="text-white text-xs">Max Qty</TableHead>
                          <TableHead className="text-white text-xs">Return Qty</TableHead>
                          <TableHead className="text-white text-xs">Rate</TableHead>
                          <TableHead className="text-white text-xs">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {prLines.map((line: any, idx: number) => {
                          const prod = products.find((p: any) => p.id === line.productId);
                          return (
                            <TableRow key={idx}>
                              <TableCell className="text-xs">{prod?.name || line.productId || "—"}</TableCell>
                              <TableCell className="text-xs">{line.maxQty || "—"}</TableCell>
                              <TableCell><Input type="number" min={1} max={line.maxQty || 999} value={line.quantity || 1} onChange={e => updateLine(setPrLines, idx, "quantity", Math.min(Number(e.target.value), line.maxQty || 999))} className="h-8 w-20 text-xs" /></TableCell>
                              <TableCell className="text-xs">{fmtCurrency(line.rate || 0)}</TableCell>
                              <TableCell className="text-xs">{fmtCurrency((Number(line.quantity) || 0) * (Number(line.rate) || 0))}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setPrDialog(false)}>Cancel</Button><Button onClick={savePr} disabled={prSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{prSaving ? "Saving..." : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!prDelete} onOpenChange={() => setPrDelete(null)}>
          <DialogContent><DialogHeader><DialogTitle>Delete Purchase Return</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setPrDelete(null)}>Cancel</Button><Button variant="destructive" onClick={deletePr}>Delete</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // TAB 10: REPLACEMENT ORDER
  // ============================================================

  const rplColumns: ExportColumnDef[] = [
    { key: "replacementNo", label: "Replacement No", type: "text" },
    { key: "date", label: "Date", type: "date" },
    { key: "salesOrderNo", label: "Sales Order", type: "text" },
    { key: "reason", label: "Reason", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ];

  const rplFiltered = useMemo(() => {
    if (!rplSearch) return rplData;
    const q = rplSearch.toLowerCase();
    return rplData.filter((o: any) => (o.replacementNo || "").toLowerCase().includes(q) || (o.salesOrder?.invoiceNo || "").toLowerCase().includes(q) || (o.status || "").toLowerCase().includes(q));
  }, [rplData, rplSearch]);

  const rplStats = useMemo(() => ({
    total: rplData.length,
    pending: rplData.filter((o: any) => o.status === "Pending").length,
    completed: rplData.filter((o: any) => o.status === "Completed").length,
  }), [rplData]);

  const openRplCreate = () => {
    setRplForm({ salesOrderId: "", date: new Date().toISOString().split("T")[0], reason: "", status: "Pending" });
    setRplLines([{ productId: "", replacementProductId: "", quantity: 1, rate: 0 }]);
    setRplEdit(null);
    setRplDialog(true);
  };

  const openRplEdit = (item: any) => {
    setRplForm({ salesOrderId: item.salesOrderId || "", date: item.date ? item.date.split("T")[0] : "", reason: item.reason || "", status: item.status || "Pending" });
    setRplLines(item.lines && item.lines.length > 0 ? item.lines : [{ productId: "", replacementProductId: "", quantity: 1, rate: 0 }]);
    setRplEdit(item);
    setRplDialog(true);
  };

  const saveRpl = async () => {
    if (!rplForm.date) { toast({ title: "Error", description: "Date is required", variant: "destructive" }); return; }
    setRplSaving(true);
    try {
      const linesPayload = rplLines.filter((l: any) => l.productId || l.replacementProductId).map((l: any) => ({ productId: l.productId, replacementProductId: l.replacementProductId, quantity: Number(l.quantity) || 1, rate: Number(l.rate) || 0 }));
      const payload = { ...rplForm, lines: linesPayload };
      if (rplEdit) { await apiFetch(`/api/replacements/${rplEdit.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Updated", description: "Replacement updated" }); }
      else { await apiFetch("/api/replacements", { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Created", description: "Replacement created" }); }
      setRplDialog(false); loadReplacements();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setRplSaving(false); }
  };

  const deleteRpl = async () => {
    if (!rplDelete) return;
    try { await apiFetch(`/api/replacements/${rplDelete.id}`, { method: "DELETE" }); toast({ title: "Deleted", description: "Replacement deleted" }); setRplDelete(null); loadReplacements(); }
    catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const renderReplacements = () => {
    if (isDealer) return <AccessDenied message="Dealers cannot access Replacement Orders." />;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Replacements" value={rplStats.total} icon={PackageCheck} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Pending" value={rplStats.pending} icon={Clock} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Completed" value={rplStats.completed} icon={CheckCircle} color="text-emerald-500" bg="bg-emerald-500/10" />
        </div>
        <Toolbar search={rplSearch} setSearch={setRplSearch} onRefresh={loadReplacements} loading={rplLoading}
          onExportCSV={() => doExportCSV("Replacements", rplColumns, rplFiltered.map((o: any) => ({ ...o, salesOrderNo: o.salesOrder?.invoiceNo || "—" })))}
          onExportPDF={() => doExportPDF("Replacements", rplColumns, rplFiltered.map((o: any) => ({ ...o, salesOrderNo: o.salesOrder?.invoiceNo || "—" })))}
          onImportCSV={() => doImportCSV("/api/replacements", [], loadReplacements)}
          canCreate={isAdmin} onCreate={openRplCreate} createLabel="Add Replacement" />
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    {rplColumns.map(c => <TableHead key={c.key} className="text-white text-xs">{c.label}</TableHead>)}
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rplLoading ? (
                    <TableRow><TableCell colSpan={rplColumns.length + 1} className="text-center py-8 text-slate-400"><RefreshCw className="h-4 w-4 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : rplFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={rplColumns.length + 1} className="text-center py-8 text-slate-400">No replacements found</TableCell></TableRow>
                  ) : rplFiltered.map((item: any) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-xs font-medium">{item.replacementNo || `RPL-${String(item.id).padStart(5, "0")}`}</TableCell>
                      <TableCell className="text-xs">{fmt(item.date, "date")}</TableCell>
                      <TableCell className="text-xs">{item.salesOrder?.invoiceNo || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{item.reason || "—"}</TableCell>
                      <TableCell className="text-xs"><StatusBadge status={item.status || "Pending"} /></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openRplEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>
                          {isAdmin && <Button variant="ghost" size="sm" onClick={() => setRplDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
        <Dialog open={rplDialog} onOpenChange={setRplDialog}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{rplEdit ? "Edit" : "Create"} Replacement Order</DialogTitle><DialogDescription>Enter replacement details.</DialogDescription></DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Sales Order</Label>
                  <Select value={rplForm.salesOrderId || ""} onValueChange={v => setRplForm(p => ({ ...p, salesOrderId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Sales Order (optional)" /></SelectTrigger>
                    <SelectContent>{soData.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.invoiceNo || `SO-${String(s.id).padStart(5, "0")}`}</SelectItem>)}</SelectContent>
                  </Select></div>
                <div><Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label><Input type="date" value={rplForm.date || ""} onChange={e => setRplForm(p => ({ ...p, date: e.target.value }))} /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-sm font-medium">Reason</Label><Textarea value={rplForm.reason || ""} onChange={e => setRplForm(p => ({ ...p, reason: e.target.value }))} rows={2} /></div>
                <div><Label className="text-sm font-medium">Status</Label>
                  <Select value={rplForm.status || "Pending"} onValueChange={v => setRplForm(p => ({ ...p, status: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="Pending">Pending</SelectItem><SelectItem value="Approved">Approved</SelectItem><SelectItem value="Completed">Completed</SelectItem></SelectContent>
                  </Select></div>
              </div>
              <LineItemsGrid lines={rplLines} setLines={setRplLines} template={{ productId: "", replacementProductId: "", quantity: 1, rate: 0 }}
                columns={[{ key: "productId", label: "Original Product" }, { key: "replacementProductId", label: "Replacement Product" }, { key: "quantity", label: "Qty" }, { key: "rate", label: "Rate" }, { key: "total", label: "Total" }]} />
            </div>
            <DialogFooter><Button variant="outline" onClick={() => setRplDialog(false)}>Cancel</Button><Button onClick={saveRpl} disabled={rplSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{rplSaving ? "Saving..." : "Save"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={!!rplDelete} onOpenChange={() => setRplDelete(null)}>
          <DialogContent><DialogHeader><DialogTitle>Delete Replacement</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setRplDelete(null)}>Cancel</Button><Button variant="destructive" onClick={deleteRpl}>Delete</Button></DialogFooter></DialogContent>
        </Dialog>
      </div>
    );
  };

  // ─── Phase 10: Opening Stock, Batch Master, Stock Valuation Renders ───

  const selectedGodown = useMemo(() => {
    return godowns.find((g: any) => g.id === osForm.godownId);
  }, [godowns, osForm.godownId]);

  const isGodownSuspended = selectedGodown?.status === "SUSPENDED";

  const validateOsForm = useCallback(() => {
    const errors: Record<string, string> = {};
    if (!osForm.productId) errors.productId = "Product is required";
    if (!osForm.godownId) errors.godownId = "Godown is required";
    if (!osForm.batchNumber) errors.batchNumber = "Batch Number is required";
    const qtyVal = validateNumeric(osForm.quantity, "Quantity");
    if (!qtyVal.valid) errors.quantity = qtyVal.error!;
    const cpVal = validateNumeric(osForm.costPrice, "Cost Price");
    if (!cpVal.valid) errors.costPrice = cpVal.error!;
    if (osForm.alertLevel && Number(osForm.alertLevel) < 0) errors.alertLevel = "Alert Level cannot be negative";
    setOsNumericErrors(errors);
    return Object.keys(errors).length === 0;
  }, [osForm]);

  const handlePostOpeningStock = async () => {
    if (!validateOsForm()) return;
    if (isGodownSuspended) {
      toast({ title: "Blocked", description: "This warehouse is SUSPENDED. Stock operations are blocked.", variant: "destructive" });
      return;
    }
    setOsSaving(true);
    inventorySnapshotRef.current = { osData, bmData, stockData, svData };
    try {
      const payload = {
        productId: osForm.productId,
        godownId: osForm.godownId,
        quantity: Number(osForm.quantity),
        costPrice: Number(osForm.costPrice),
        batchNumber: sanitizeInput(osForm.batchNumber),
        expiryDate: osForm.expiryDate || null,
        alertLevel: osForm.alertLevel ? Number(osForm.alertLevel) : 0,
        date: osForm.date,
        notes: sanitizeInput(osForm.notes || ""),
      };
      await apiFetch("/api/opening-stock", { method: "POST", body: JSON.stringify(payload) });
      toast({ title: "Opening Stock Posted", description: "Perpetual inventory valuations updated & double-entry ledger entries created." });
      setOsDialog(false);
      setOsForm({ productId: "", godownId: "", quantity: "", costPrice: "", batchNumber: "", expiryDate: "", alertLevel: "", date: new Date().toISOString().split("T")[0], notes: "" });
      setOsNumericErrors({});
      loadOpeningStock();
      loadStock();
    } catch (e: any) {
      if (inventorySnapshotRef.current) {
        setOsData(inventorySnapshotRef.current.osData);
        setBmData(inventorySnapshotRef.current.bmData);
        setStockData(inventorySnapshotRef.current.stockData);
        setSvData(inventorySnapshotRef.current.svData);
      }
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setOsSaving(false); }
  };

  const handleSaveBatch = async () => {
    if (!bmForm.batchNumber || !bmForm.productId || !bmForm.quantity || !bmForm.costPrice) {
      toast({ title: "Error", description: "Batch Number, Product, Quantity, and Cost Price are required", variant: "destructive" });
      return;
    }
    const qtyVal = validateNumeric(bmForm.quantity, "Quantity");
    const cpVal = validateNumeric(bmForm.costPrice, "Cost Price");
    if (!qtyVal.valid || !cpVal.valid) {
      toast({ title: "Validation Error", description: `${qtyVal.error || ""} ${cpVal.error || ""}`, variant: "destructive" });
      return;
    }
    setBmSaving(true);
    inventorySnapshotRef.current = { osData, bmData, stockData, svData };
    try {
      const payload = {
        batchNumber: sanitizeInput(bmForm.batchNumber),
        productId: bmForm.productId,
        godownId: bmForm.godownId || null,
        quantity: Number(bmForm.quantity),
        costPrice: Number(bmForm.costPrice),
        salePrice: Number(bmForm.salePrice) || 0,
        expiryDate: bmForm.expiryDate || null,
        manufacturingDate: bmForm.manufacturingDate || null,
        supplierId: bmForm.supplierId || null,
        status: bmForm.status || "Active",
      };
      if (bmEdit) {
        await apiFetch(`/api/batch-master/${bmEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Batch Updated" });
      } else {
        await apiFetch("/api/batch-master", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Batch Created" });
      }
      setBmDialog(false);
      loadBatchMasters();
    } catch (e: any) {
      if (inventorySnapshotRef.current) {
        setBmData(inventorySnapshotRef.current.bmData);
        setSvData(inventorySnapshotRef.current.svData);
      }
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setBmSaving(false); }
  };

  const handleDeleteBatch = async () => {
    if (!bmDelete) return;
    try {
      await apiFetch(`/api/batch-master/${bmDelete.id}`, { method: "DELETE" });
      toast({ title: "Batch Deleted" });
      setBmDelete(null);
      loadBatchMasters();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const getBatchExpiryBadge = (expiryDate: string | null) => {
    if (!expiryDate) return <Badge className="bg-slate-100 text-slate-600 border-0 text-xs">No Expiry</Badge>;
    const now = new Date();
    const expiry = new Date(expiryDate);
    const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return <Badge className="bg-red-100 text-red-700 border-0 text-xs">Expired</Badge>;
    if (daysUntil <= 30) return <Badge className="bg-amber-100 text-amber-700 border-0 text-xs">Expiring ({daysUntil}d)</Badge>;
    return <Badge className="bg-emerald-100 text-emerald-700 border-0 text-xs">Valid</Badge>;
  };

  const BATCH_STATUS_BADGE: Record<string, string> = {
    Active: "bg-emerald-100 text-emerald-700",
    Expired: "bg-red-100 text-red-700",
    Exhausted: "bg-slate-100 text-slate-600",
    Recalled: "bg-red-200 text-red-800",
  };

  const renderOpeningStock = () => {
    const osFiltered = osData.filter((s: any) => {
      if (!osSearch) return true;
      const q = osSearch.toLowerCase();
      return (s.product?.name || "").toLowerCase().includes(q) || (s.product?.productCode || "").toLowerCase().includes(q) || (s.batchNumber || "").toLowerCase().includes(q);
    });

    const osStats = {
      total: osData.length,
      totalQty: osData.reduce((s: number, o: any) => s + (Number(o.quantity) || 0), 0),
      totalValue: osData.reduce((s: number, o: any) => s + (Number(o.totalCost) || 0), 0),
      batches: new Set(osData.map((o: any) => o.batchNumber).filter(Boolean)).size,
    };

    const osExportCols: ExportColumnDef[] = [
      { key: "productCode", label: "Product Code", type: "text" },
      { key: "productName", label: "Product", type: "text" },
      { key: "godownName", label: "Godown", type: "text" },
      { key: "quantity", label: "Qty", type: "number" },
      { key: "costPrice", label: "Cost Price", type: "currency" },
      { key: "totalCost", label: "Total Cost", type: "currency" },
      { key: "batchNumber", label: "Batch", type: "text" },
      { key: "expiryDate", label: "Expiry", type: "date" },
      { key: "date", label: "Date", type: "date" },
    ];
    const osExportData = osFiltered.map((s: any) => ({
      productCode: s.product?.productCode || "",
      productName: s.product?.name || "",
      godownName: s.godown?.name || "",
      quantity: s.quantity || 0,
      costPrice: s.costPrice || 0,
      totalCost: s.totalCost || 0,
      batchNumber: s.batchNumber || "—",
      expiryDate: s.expiryDate || "",
      date: s.date || "",
    }));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard label="Total Entries" value={osStats.total} icon={Package} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Total Quantity" value={bdCurrencyFmt.format(osStats.totalQty)} icon={Layers} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Total Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(osStats.totalValue)} icon={DollarSign} color="text-amber-600" bg="bg-amber-50" />
          <StatCard label="Active Batches" value={osStats.batches} icon={Hash} color="text-purple-600" bg="bg-purple-50" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={osSearch} onChange={e => setOsSearch(e.target.value)} placeholder="Search opening stock..." className="pl-8" />
          </div>
          <Button onClick={() => { setOsForm({ productId: "", godownId: "", quantity: "", costPrice: "", batchNumber: "", expiryDate: "", alertLevel: "", date: new Date().toISOString().split("T")[0], notes: "" }); setOsNumericErrors({}); setOsDialog(true); }} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4 mr-1" /> Post Opening Stock
          </Button>
          <Button variant="outline" size="sm" onClick={() => { const mk = [...getVatMaskedKeys(osExportCols), "costPrice", "totalCost"]; exportToCSV({ title: "Opening Stock Ledger", columns: osExportCols, data: osExportData, isVatAuditor, vatMaskedColumns: mk }); }}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => { const mk = [...getVatMaskedKeys(osExportCols), "costPrice", "totalCost"]; exportToPDF({ title: "Opening Stock Ledger", columns: osExportCols, data: osExportData, isVatAuditor, vatMaskedColumns: mk, orientation: "landscape", company: companyProfile, financialFooter: { preparedBy: auth.user?.displayName || "", checkedBy: "", authorizedBy: "", printedBy: auth.user?.displayName || auth.user?.email || "" } }); }}>
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={loadOpeningStock}><RefreshCw className={`h-4 w-4 ${osLoading ? "animate-spin" : ""}`} /></Button>
        </div>

        <div className="border rounded-lg overflow-auto max-h-[65vh]">
          <Table>
            <TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628]">
              <TableHead className="text-white text-xs">Product</TableHead>
              <TableHead className="text-white text-xs">Godown</TableHead>
              <TableHead className="text-white text-xs text-right">Qty</TableHead>
              <TableHead className="text-white text-xs text-right">Cost Price</TableHead>
              <TableHead className="text-white text-xs text-right">Total Cost</TableHead>
              <TableHead className="text-white text-xs">Batch</TableHead>
              <TableHead className="text-white text-xs">Expiry</TableHead>
              <TableHead className="text-white text-xs">Date</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {osLoading ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow> :
              osFiltered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No opening stock entries</TableCell></TableRow> :
              osFiltered.map((s: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="text-xs font-medium">{s.product?.productCode || ""} — {s.product?.name || ""}</TableCell>
                  <TableCell className="text-xs">{s.godown?.name || "—"}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{Number(s.quantity || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(s.costPrice || 0)}</TableCell>
                  <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(s.totalCost || 0)}</TableCell>
                  <TableCell className="text-xs"><Badge className="bg-blue-50 text-blue-700 border-0 text-xs">{s.batchNumber || "—"}</Badge></TableCell>
                  <TableCell className="text-xs">{s.expiryDate ? fmt(s.expiryDate, "date") : "—"}</TableCell>
                  <TableCell className="text-xs">{fmt(s.date, "date")}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Opening Stock Dialog */}
        <Dialog open={osDialog} onOpenChange={setOsDialog}>
          <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Post Product Opening Stock</DialogTitle><DialogDescription>Initialize stock for a product at a specific warehouse location with batch tracking and automatic CoA ledger mapping.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            {isGodownSuspended && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-600" />
                <span className="text-sm text-red-700 dark:text-red-400 font-medium">This warehouse is SUSPENDED. Stock operations are blocked.</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Product <span className="text-red-500">*</span></Label>
                <Select value={osForm.productId} onValueChange={v => setOsForm(p => ({ ...p, productId: v }))}>
                  <SelectTrigger className={osNumericErrors.productId ? "border-red-500 ring-2 ring-red-200" : ""}><SelectValue placeholder="Select Product" /></SelectTrigger>
                  <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.productCode} — {p.name}</SelectItem>)}</SelectContent>
                </Select>
                {osNumericErrors.productId && <p className="text-xs text-red-500 mt-1">{osNumericErrors.productId}</p>}
              </div>
              <div>
                <Label className="text-sm font-medium">Godown <span className="text-red-500">*</span></Label>
                <Select value={osForm.godownId} onValueChange={v => setOsForm(p => ({ ...p, godownId: v }))}>
                  <SelectTrigger className={osNumericErrors.godownId ? "border-red-500 ring-2 ring-red-200" : ""}><SelectValue placeholder="Select Godown" /></SelectTrigger>
                  <SelectContent>
                    {godowns.map((g: any) => (
                      <SelectItem key={g.id} value={g.id} disabled={g.status === "SUSPENDED"}>
                        {g.name}{g.status === "SUSPENDED" ? " (SUSPENDED)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {osNumericErrors.godownId && <p className="text-xs text-red-500 mt-1">{osNumericErrors.godownId}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Quantity <span className="text-red-500">*</span></Label>
                <Input type="number" min={0.01} step="any" value={osForm.quantity} onChange={e => { setOsForm(p => ({ ...p, quantity: e.target.value })); if (e.target.value && Number(e.target.value) <= 0) setOsNumericErrors(p => ({ ...p, quantity: "Must be greater than zero" })); else setOsNumericErrors(p => { const n = {...p}; delete n.quantity; return n; }); }} className={osNumericErrors.quantity ? "border-red-500 ring-2 ring-red-200 animate-pulse" : ""} placeholder="Enter quantity" />
                {osNumericErrors.quantity && <p className="text-xs text-red-500 mt-1">{osNumericErrors.quantity}</p>}
              </div>
              <div>
                <Label className="text-sm font-medium">Cost Price (Per Unit) <span className="text-red-500">*</span></Label>
                <Input type="number" min={0.01} step="0.01" value={osForm.costPrice} onChange={e => { setOsForm(p => ({ ...p, costPrice: e.target.value })); if (e.target.value && Number(e.target.value) <= 0) setOsNumericErrors(p => ({ ...p, costPrice: "Must be greater than zero" })); else setOsNumericErrors(p => { const n = {...p}; delete n.costPrice; return n; }); }} className={osNumericErrors.costPrice ? "border-red-500 ring-2 ring-red-200 animate-pulse" : ""} placeholder="Per unit cost" />
                {osNumericErrors.costPrice && <p className="text-xs text-red-500 mt-1">{osNumericErrors.costPrice}</p>}
              </div>
            </div>
            {osForm.quantity && osForm.costPrice && Number(osForm.quantity) > 0 && Number(osForm.costPrice) > 0 && (
              <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <span className="text-sm text-blue-700 dark:text-blue-400 font-medium">Total Inventory Value: {fmtCurrency(Number(osForm.quantity) * Number(osForm.costPrice))}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Batch Number <span className="text-red-500">*</span></Label>
                <Input type="text" value={osForm.batchNumber} onChange={e => setOsForm(p => ({ ...p, batchNumber: e.target.value }))} className={osNumericErrors.batchNumber ? "border-red-500 ring-2 ring-red-200" : ""} placeholder="Required batch identifier" />
                {osNumericErrors.batchNumber && <p className="text-xs text-red-500 mt-1">{osNumericErrors.batchNumber}</p>}
              </div>
              <div>
                <Label className="text-sm font-medium">Expiry Date</Label>
                <Input type="date" value={osForm.expiryDate} onChange={e => setOsForm(p => ({ ...p, expiryDate: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Alert Level</Label>
                <Input type="number" min={0} value={osForm.alertLevel} onChange={e => setOsForm(p => ({ ...p, alertLevel: e.target.value }))} placeholder="Reorder threshold" />
              </div>
              <div>
                <Label className="text-sm font-medium">Date</Label>
                <Input type="date" value={osForm.date} onChange={e => setOsForm(p => ({ ...p, date: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Notes</Label>
              <Textarea value={osForm.notes} onChange={e => setOsForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOsDialog(false)}>Cancel</Button>
            <Button onClick={handlePostOpeningStock} disabled={osSaving || isGodownSuspended || Object.keys(osNumericErrors).length > 0} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {osSaving ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Recalculating Perpetual Inventory Valuations & Apportioning Batches...</> : <><Package className="h-4 w-4 mr-2" />Post Product Opening Stock</>}
            </Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const renderBatchMaster = () => {
    const bmFiltered = bmData.filter((b: any) => {
      if (!bmSearch) return true;
      const q = bmSearch.toLowerCase();
      return (b.batchNumber || "").toLowerCase().includes(q) || (b.product?.name || "").toLowerCase().includes(q) || (b.status || "").toLowerCase().includes(q);
    });

    const bmStats = {
      total: bmData.length,
      active: bmData.filter((b: any) => b.status === "Active").length,
      expired: bmData.filter((b: any) => b.status === "Expired").length,
      totalValue: bmData.reduce((s: number, b: any) => s + (Number(b.totalCost) || 0), 0),
    };

    const bmExportCols: ExportColumnDef[] = [
      { key: "batchNumber", label: "Batch No", type: "text" },
      { key: "productName", label: "Product", type: "text" },
      { key: "godownName", label: "Godown", type: "text" },
      { key: "quantity", label: "Qty", type: "number" },
      { key: "costPrice", label: "Cost Price", type: "currency" },
      { key: "totalCost", label: "Total Cost", type: "currency" },
      { key: "salePrice", label: "Sale Price", type: "currency" },
      { key: "expiryDate", label: "Expiry", type: "date" },
      { key: "status", label: "Status", type: "text" },
    ];
    const bmExportData = bmFiltered.map((b: any) => ({
      batchNumber: b.batchNumber || "",
      productName: b.product?.name || "",
      godownName: b.godown?.name || "—",
      quantity: b.quantity || 0,
      costPrice: b.costPrice || 0,
      totalCost: b.totalCost || 0,
      salePrice: b.salePrice || 0,
      expiryDate: b.expiryDate || "",
      status: b.status || "Active",
    }));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
          <StatCard label="Total Batches" value={bmStats.total} icon={Hash} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Active Batches" value={bmStats.active} icon={PackageCheck} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Expired Batches" value={bmStats.expired} icon={AlertTriangle} color="text-red-600" bg="bg-red-50" />
          <StatCard label="Batch Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(bmStats.totalValue)} icon={DollarSign} color="text-amber-600" bg="bg-amber-50" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={bmSearch} onChange={e => setBmSearch(e.target.value)} placeholder="Search batches..." className="pl-8" />
          </div>
          <Button onClick={() => { setBmForm({ batchNumber: "", productId: "", godownId: "", quantity: "", costPrice: "", salePrice: "", expiryDate: "", manufacturingDate: "", supplierId: "", status: "Active" }); setBmEdit(null); setBmDialog(true); }} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4 mr-1" /> Initialize Batch Variant
          </Button>
          <Button variant="outline" size="sm" onClick={() => { const mk = [...getVatMaskedKeys(bmExportCols), "costPrice", "totalCost", "salePrice"]; exportToCSV({ title: "Batch Master Ledger", columns: bmExportCols, data: bmExportData, isVatAuditor, vatMaskedColumns: mk }); }}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => { const mk = [...getVatMaskedKeys(bmExportCols), "costPrice", "totalCost", "salePrice"]; exportToPDF({ title: "Batch Expiry Forecast", columns: bmExportCols, data: bmExportData, isVatAuditor, vatMaskedColumns: mk, orientation: "landscape", company: companyProfile, financialFooter: { preparedBy: auth.user?.displayName || "", checkedBy: "", authorizedBy: "", printedBy: auth.user?.displayName || auth.user?.email || "" } }); }}>
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={loadBatchMasters}><RefreshCw className={`h-4 w-4 ${bmLoading ? "animate-spin" : ""}`} /></Button>
        </div>

        <div className="border rounded-lg overflow-auto max-h-[65vh]">
          <Table>
            <TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628]">
              <TableHead className="text-white text-xs">Batch No</TableHead>
              <TableHead className="text-white text-xs">Product</TableHead>
              <TableHead className="text-white text-xs">Godown</TableHead>
              <TableHead className="text-white text-xs text-right">Qty</TableHead>
              <TableHead className="text-white text-xs text-right">Cost Price</TableHead>
              <TableHead className="text-white text-xs text-right">Total Cost</TableHead>
              <TableHead className="text-white text-xs">Expiry</TableHead>
              <TableHead className="text-white text-xs">Status</TableHead>
              {isAdmin && <TableHead className="text-white text-xs">Actions</TableHead>}
            </TableRow></TableHeader>
            <TableBody>
              {bmLoading ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow> :
              bmFiltered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-8 text-slate-400">No batch records</TableCell></TableRow> :
              bmFiltered.map((b: any) => (
                <TableRow key={b.id}>
                  <TableCell className="text-xs font-medium"><Badge className="bg-blue-50 text-blue-700 border-0 text-xs">{b.batchNumber}</Badge></TableCell>
                  <TableCell className="text-xs">{b.product?.productCode || ""} — {b.product?.name || ""}</TableCell>
                  <TableCell className="text-xs">{b.godown?.name || "—"}</TableCell>
                  <TableCell className="text-xs text-right font-medium">{Number(b.quantity || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(b.costPrice || 0)}</TableCell>
                  <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(b.totalCost || 0)}</TableCell>
                  <TableCell className="text-xs">{getBatchExpiryBadge(b.expiryDate)}</TableCell>
                  <TableCell className="text-xs"><Badge className={`${BATCH_STATUS_BADGE[b.status] || ""} border-0 text-xs`}>{b.status}</Badge></TableCell>
                  {isAdmin && <TableCell className="text-xs">
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => { setBmEdit(b); setBmForm({ batchNumber: b.batchNumber || "", productId: b.productId || "", godownId: b.godownId || "", quantity: b.quantity || "", costPrice: b.costPrice || "", salePrice: b.salePrice || "", expiryDate: b.expiryDate ? b.expiryDate.split("T")[0] : "", manufacturingDate: b.manufacturingDate ? b.manufacturingDate.split("T")[0] : "", supplierId: b.supplierId || "", status: b.status || "Active" }); setBmDialog(true); }}><Edit className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700" onClick={() => setBmDelete(b)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </TableCell>}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Batch Master Dialog */}
        <Dialog open={bmDialog} onOpenChange={setBmDialog}>
          <DialogContent className="max-w-xl"><DialogHeader><DialogTitle>{bmEdit ? "Edit Batch Variant" : "Initialize Batch Variant"}</DialogTitle><DialogDescription>Register a new product batch with cost tracking and expiry management.</DialogDescription></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Batch Number <span className="text-red-500">*</span></Label>
                <Input type="text" value={bmForm.batchNumber} onChange={e => setBmForm(p => ({ ...p, batchNumber: e.target.value }))} placeholder="Unique batch ID" />
              </div>
              <div>
                <Label className="text-sm font-medium">Product <span className="text-red-500">*</span></Label>
                <Select value={bmForm.productId} onValueChange={v => setBmForm(p => ({ ...p, productId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Product" /></SelectTrigger>
                  <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.productCode} — {p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label className="text-sm font-medium">Quantity <span className="text-red-500">*</span></Label>
                <Input type="number" min={0.01} step="any" value={bmForm.quantity} onChange={e => setBmForm(p => ({ ...p, quantity: e.target.value }))} placeholder="Qty" />
              </div>
              <div>
                <Label className="text-sm font-medium">Cost Price <span className="text-red-500">*</span></Label>
                <Input type="number" min={0.01} step="0.01" value={bmForm.costPrice} onChange={e => setBmForm(p => ({ ...p, costPrice: e.target.value }))} placeholder="Per unit" />
              </div>
              <div>
                <Label className="text-sm font-medium">Sale Price</Label>
                <Input type="number" min={0} step="0.01" value={bmForm.salePrice} onChange={e => setBmForm(p => ({ ...p, salePrice: e.target.value }))} placeholder="Per unit" />
              </div>
            </div>
            {bmForm.quantity && bmForm.costPrice && Number(bmForm.quantity) > 0 && Number(bmForm.costPrice) > 0 && (
              <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                <span className="text-sm text-blue-700 dark:text-blue-400 font-medium">Batch Total Cost: {fmtCurrency(Number(bmForm.quantity) * Number(bmForm.costPrice))}</span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Godown</Label>
                <Select value={bmForm.godownId} onValueChange={v => setBmForm(p => ({ ...p, godownId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                  <SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id} disabled={g.status === "SUSPENDED"}>{g.name}{g.status === "SUSPENDED" ? " (SUSPENDED)" : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-sm font-medium">Status</Label>
                <Select value={bmForm.status} onValueChange={v => setBmForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Expired">Expired</SelectItem>
                    <SelectItem value="Exhausted">Exhausted</SelectItem>
                    <SelectItem value="Recalled">Recalled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-medium">Expiry Date</Label>
                <Input type="date" value={bmForm.expiryDate} onChange={e => setBmForm(p => ({ ...p, expiryDate: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm font-medium">Manufacturing Date</Label>
                <Input type="date" value={bmForm.manufacturingDate} onChange={e => setBmForm(p => ({ ...p, manufacturingDate: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Supplier</Label>
              <Select value={bmForm.supplierId} onValueChange={v => setBmForm(p => ({ ...p, supplierId: v }))}>
                <SelectTrigger><SelectValue placeholder="Select Supplier (optional)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.supplierCode} — {s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBmDialog(false)}>Cancel</Button>
            <Button onClick={handleSaveBatch} disabled={bmSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {bmSaving ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Mapping Batch Ledger Trees & Restructuring Accounting Ledgers...</> : <><Hash className="h-4 w-4 mr-2" />{bmEdit ? "Update Batch Variant" : "Initialize Batch Variant"}</>}
            </Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation */}
        <Dialog open={!!bmDelete} onOpenChange={() => setBmDelete(null)}>
          <DialogContent><DialogHeader><DialogTitle>Delete Batch</DialogTitle><DialogDescription>Are you sure you want to delete batch &quot;{bmDelete?.batchNumber}&quot;?</DialogDescription></DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBmDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteBatch} disabled={!isAdmin}>{isAdmin ? "Delete" : "Admin Only"}</Button>
          </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  const renderStockValuation = () => {
    const svFiltered = svData.filter((v: any) => {
      if (!svSearch) return true;
      const q = svSearch.toLowerCase();
      return (v.productName || "").toLowerCase().includes(q) || (v.productCode || "").toLowerCase().includes(q);
    });

    const svStats = {
      products: svData.length,
      totalValue: svData.reduce((s: number, v: any) => s + (Number(v.totalValue) || 0), 0),
      totalQty: svData.reduce((s: number, v: any) => s + (Number(v.totalQuantity) || 0), 0),
    };

    const svExportCols: ExportColumnDef[] = [
      { key: "productCode", label: "Code", type: "text" },
      { key: "productName", label: "Product", type: "text" },
      { key: "valuationMethod", label: "Method", type: "text" },
      { key: "totalQuantity", label: "Total Qty", type: "number" },
      { key: "totalValue", label: "Total Value", type: "currency" },
      { key: "averageCost", label: "Avg Cost", type: "currency" },
    ];
    const svExportData = svFiltered.map((v: any) => ({
      productCode: v.productCode || "",
      productName: v.productName || "",
      valuationMethod: v.valuationMethod || svMethod,
      totalQuantity: v.totalQuantity || 0,
      totalValue: v.totalValue || 0,
      averageCost: v.averageCost || 0,
    }));

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Products Valued" value={svStats.products} icon={Layers} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Total Qty" value={bdCurrencyFmt.format(svStats.totalQty)} icon={Package} color="text-emerald-600" bg="bg-emerald-50" />
          <StatCard label="Total Inventory Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(svStats.totalValue)} icon={TrendingUp} color="text-amber-600" bg="bg-amber-50" />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={svSearch} onChange={e => setSvSearch(e.target.value)} placeholder="Search valuations..." className="pl-8" />
          </div>
          <Select value={svMethod} onValueChange={v => { setSvMethod(v); loadStockValuation(v); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="FIFO">FIFO (First In, First Out)</SelectItem>
              <SelectItem value="WeightedAverage">Weighted Average</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => { const mk = [...getVatMaskedKeys(svExportCols), "totalValue", "averageCost"]; exportToCSV({ title: `Stock Valuation (${svMethod})`, columns: svExportCols, data: svExportData, isVatAuditor, vatMaskedColumns: mk }); }}>
            <Download className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => { const mk = [...getVatMaskedKeys(svExportCols), "totalValue", "averageCost"]; exportToPDF({ title: `Stock Valuation (${svMethod})`, columns: svExportCols, data: svExportData, isVatAuditor, vatMaskedColumns: mk, orientation: "landscape", company: companyProfile, financialFooter: { preparedBy: auth.user?.displayName || "", checkedBy: "", authorizedBy: "", printedBy: auth.user?.displayName || auth.user?.email || "" } }); }}>
            <FileDown className="h-4 w-4 mr-1" /> PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={() => loadStockValuation()}><RefreshCw className={`h-4 w-4 ${svLoading ? "animate-spin" : ""}`} /></Button>
        </div>

        <div className="border rounded-lg overflow-auto max-h-[65vh]">
          <Table>
            <TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628]">
              <TableHead className="text-white text-xs w-8"></TableHead>
              <TableHead className="text-white text-xs">Product</TableHead>
              <TableHead className="text-white text-xs">Method</TableHead>
              <TableHead className="text-white text-xs text-right">Total Qty</TableHead>
              <TableHead className="text-white text-xs text-right">Total Value</TableHead>
              <TableHead className="text-white text-xs text-right">Avg Cost</TableHead>
              <TableHead className="text-white text-xs">Category</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {svLoading ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">Loading valuations...</TableCell></TableRow> :
              svFiltered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-400">No valuation data. Click refresh to calculate.</TableCell></TableRow> :
              svFiltered.map((v: any) => (
                <React.Fragment key={v.productId}>
                  <TableRow className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800" onClick={() => setSvExpandedProduct(svExpandedProduct === v.productId ? null : v.productId)}>
                    <TableCell className="text-xs">
                      {v.layers && v.layers.length > 0 ? (svExpandedProduct === v.productId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}
                    </TableCell>
                    <TableCell className="text-xs font-medium">{v.productCode} — {v.productName}</TableCell>
                    <TableCell className="text-xs"><Badge className="bg-purple-50 text-purple-700 border-0 text-xs">{v.valuationMethod || svMethod}</Badge></TableCell>
                    <TableCell className="text-xs text-right font-medium">{Number(v.totalQuantity || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(v.totalValue || 0)}</TableCell>
                    <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(v.averageCost || 0)}</TableCell>
                    <TableCell className="text-xs">{v.category || "—"}</TableCell>
                  </TableRow>
                  {svExpandedProduct === v.productId && v.layers && v.layers.length > 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="p-0">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-3">
                          <p className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">FIFO Inventory Layers</p>
                          <Table>
                            <TableHeader><TableRow>
                              <TableHead className="text-xs h-8">Date</TableHead>
                              <TableHead className="text-xs text-right">Qty</TableHead>
                              <TableHead className="text-xs text-right">Cost Price</TableHead>
                              <TableHead className="text-xs text-right">Layer Cost</TableHead>
                              <TableHead className="text-xs">Batch</TableHead>
                            </TableRow></TableHeader>
                            <TableBody>
                              {v.layers.map((l: any, li: number) => (
                                <TableRow key={li}>
                                  <TableCell className="text-xs py-1">{l.date ? fmt(l.date, "date") : "—"}</TableCell>
                                  <TableCell className="text-xs py-1 text-right">{Number(l.quantity || 0).toLocaleString()}</TableCell>
                                  <TableCell className="text-xs py-1 text-right">{isVatAuditor ? "N/A" : fmtCurrency(l.costPrice || 0)}</TableCell>
                                  <TableCell className="text-xs py-1 text-right">{isVatAuditor ? "N/A" : fmtCurrency(l.totalCost || 0)}</TableCell>
                                  <TableCell className="text-xs py-1">{l.batchNumber || "—"}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  const renderStock = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={stockSearch} onChange={e => setStockSearch(e.target.value)} placeholder="Search stock..." className="pl-8" />
        </div>
        <Select value={stockFilterGodown} onValueChange={setStockFilterGodown}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Godown" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Godowns</SelectItem>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={stockFilterStatus} onValueChange={setStockFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Status</SelectItem><SelectItem value="In Stock">In Stock</SelectItem><SelectItem value="Low Stock">Low Stock</SelectItem><SelectItem value="Out of Stock">Out of Stock</SelectItem></SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => {
          const stockExportCols: ExportColumnDef[] = [
            { key: "productName", label: "Product", type: "text" },
            { key: "category", label: "Category", type: "text" },
            { key: "godown", label: "Godown", type: "text" },
            { key: "currentStock", label: "Qty", type: "number" },
            { key: "stockValue", label: "Value", type: "currency" },
            { key: "stockStatus", label: "Status", type: "text" },
          ];
          const stockExportData = stockData.filter((s: any) => {
            if (stockFilterGodown !== "all" && s.godownId !== stockFilterGodown) return false;
            if (stockFilterStatus !== "all" && s.stockStatus !== stockFilterStatus) return false;
            return true;
          }).map((s: any) => ({
            productName: `${s.productCode || s.product?.productCode || ""} — ${s.productName || s.product?.name || ""}`,
            category: s.category || s.product?.category?.name || "—",
            godown: s.godown || s.godown?.name || "Main",
            currentStock: s.currentStock || 0,
            stockValue: s.stockValue || 0,
            stockStatus: s.stockStatus || "In Stock",
          }));
          doExportCSV("Stock", stockExportCols, stockExportData, ["stockValue"]);
        }}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={() => {
          const stockExportCols: ExportColumnDef[] = [
            { key: "productName", label: "Product", type: "text" },
            { key: "category", label: "Category", type: "text" },
            { key: "godown", label: "Godown", type: "text" },
            { key: "currentStock", label: "Qty", type: "number" },
            { key: "stockValue", label: "Value", type: "currency" },
            { key: "stockStatus", label: "Status", type: "text" },
          ];
          const stockExportData = stockData.filter((s: any) => {
            if (stockFilterGodown !== "all" && s.godownId !== stockFilterGodown) return false;
            if (stockFilterStatus !== "all" && s.stockStatus !== stockFilterStatus) return false;
            return true;
          }).map((s: any) => ({
            productName: `${s.productCode || s.product?.productCode || ""} — ${s.productName || s.product?.name || ""}`,
            category: s.category || s.product?.category?.name || "—",
            godown: s.godown || s.godown?.name || "Main",
            currentStock: s.currentStock || 0,
            stockValue: s.stockValue || 0,
            stockStatus: s.stockStatus || "In Stock",
          }));
          doExportPDF("Stock", stockExportCols, stockExportData, ["stockValue"]);
        }}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
        <Button variant="ghost" size="sm" onClick={loadStock}><RefreshCw className={`h-4 w-4 ${stockLoading ? "animate-spin" : ""}`} /></Button>
      </div>
      <div className="border rounded-lg overflow-auto max-h-[70vh]">
        <Table>
          <TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628]">
            <TableHead className="text-white text-xs">Product</TableHead>
            <TableHead className="text-white text-xs">Category</TableHead>
            <TableHead className="text-white text-xs">Godown</TableHead>
            <TableHead className="text-white text-xs text-right">Qty</TableHead>
            <TableHead className="text-white text-xs text-right">Value</TableHead>
            <TableHead className="text-white text-xs">Status</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {stockLoading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow> :
            stockData.filter((s: any) => {
              if (stockSearch) { const q = stockSearch.toLowerCase(); if (!(s.productName || s.product?.name || "").toLowerCase().includes(q) && !(s.productCode || s.product?.productCode || "").toLowerCase().includes(q)) return false; }
              if (stockFilterGodown !== "all" && s.godownId !== stockFilterGodown) return false;
              if (stockFilterStatus !== "all" && s.stockStatus !== stockFilterStatus) return false;
              return true;
            }).map((s: any, i: number) => (
              <TableRow key={i}>
                <TableCell className="text-xs font-medium">{s.productCode || s.product?.productCode || ""} — {s.productName || s.product?.name || ""}</TableCell>
                <TableCell className="text-xs">{s.category || s.product?.category?.name || "—"}</TableCell>
                <TableCell className="text-xs">{s.godown || s.godown?.name || "Main"}</TableCell>
                <TableCell className="text-xs text-right font-medium">{Number(s.currentStock || 0).toLocaleString()}</TableCell>
                <TableCell className="text-xs text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(s.stockValue || 0)}</TableCell>
                <TableCell className="text-xs"><StockStatusBadge status={s.stockStatus || "In Stock"} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const renderStockDetails = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={sdSelectedProduct} onValueChange={v => { setSdSelectedProduct(v); loadStockDetails(v); }}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select product..." /></SelectTrigger>
          <SelectContent>{products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.productCode} — {p.name}</SelectItem>)}</SelectContent>
        </Select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={sdSearch} onChange={e => setSdSearch(e.target.value)} placeholder="Search entries..." className="pl-8" />
        </div>
        <Button variant="outline" size="sm" onClick={() => doExportCSV("Stock Details", [{ key: "date", label: "Date", type: "date" }, { key: "type", label: "Type", type: "text" }, { key: "reference", label: "Reference", type: "text" }, { key: "quantity", label: "Qty", type: "number" }, { key: "notes", label: "Notes", type: "text" }], sdData.filter((e: any) => { if (!sdSearch) return true; const q = sdSearch.toLowerCase(); return (e.reference || "").toLowerCase().includes(q) || (e.type || "").toLowerCase().includes(q); }))} disabled={!sdSelectedProduct}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={() => doExportPDF("Stock Details", [{ key: "date", label: "Date", type: "date" }, { key: "type", label: "Type", type: "text" }, { key: "reference", label: "Reference", type: "text" }, { key: "quantity", label: "Qty", type: "number" }, { key: "notes", label: "Notes", type: "text" }], sdData.filter((e: any) => { if (!sdSearch) return true; const q = sdSearch.toLowerCase(); return (e.reference || "").toLowerCase().includes(q) || (e.type || "").toLowerCase().includes(q); }))} disabled={!sdSelectedProduct}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
      </div>
      <div className="border rounded-lg overflow-auto max-h-[70vh]">
        <Table>
          <TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628]">
            <TableHead className="text-white text-xs">Date</TableHead>
            <TableHead className="text-white text-xs">Type</TableHead>
            <TableHead className="text-white text-xs">Reference</TableHead>
            <TableHead className="text-white text-xs text-right">Qty</TableHead>
            <TableHead className="text-white text-xs">Notes</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {!sdSelectedProduct ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">Select a product to view stock entries</TableCell></TableRow> :
            sdLoading ? <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow> :
            sdData.filter((e: any) => { if (!sdSearch) return true; const q = sdSearch.toLowerCase(); return (e.reference || "").toLowerCase().includes(q) || (e.type || "").toLowerCase().includes(q); }).map((e: any, i: number) => (
              <TableRow key={i}>
                <TableCell className="text-xs">{fmt(e.date, "date")}</TableCell>
                <TableCell className="text-xs"><Badge className={`${TYPE_BADGE[e.type as string] || ""} border-0 text-xs`}>{e.type}</Badge></TableCell>
                <TableCell className="text-xs">{e.reference || "—"}</TableCell>
                <TableCell className="text-xs text-right font-medium">{Number(e.quantity || 0).toLocaleString()}</TableCell>
                <TableCell className="text-xs">{e.notes || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );

  const renderTransfers = () => (
    <div className="space-y-4">
      <Toolbar search={trnSearch} setSearch={setTrnSearch} onRefresh={loadTransfers} loading={trnLoading}
        onExportCSV={() => doExportCSV("Stock Transfers", [{ key: "date", label: "Date", type: "date" }, { key: "fromGodown", label: "From", type: "text" }, { key: "toGodown", label: "To", type: "text" }, { key: "status", label: "Status", type: "text" }], trnData.map((t: any) => ({ ...t, fromGodown: t.fromGodown?.name || "—", toGodown: t.toGodown?.name || "—" })))}
        onExportPDF={() => doExportPDF("Stock Transfers", [{ key: "date", label: "Date", type: "date" }, { key: "fromGodown", label: "From", type: "text" }, { key: "toGodown", label: "To", type: "text" }, { key: "status", label: "Status", type: "text" }], trnData.map((t: any) => ({ ...t, fromGodown: t.fromGodown?.name || "—", toGodown: t.toGodown?.name || "—" })))}
        onImportCSV={() => doImportCSV("/api/transfers", [], loadTransfers)}
        canCreate={isAdmin} onCreate={() => { setTrnForm({ fromGodownId: "", toGodownId: "", date: new Date().toISOString().split("T")[0], status: "Pending", notes: "" }); setTrnLines([{ productId: "", quantity: 1 }]); setTrnEdit(null); setTrnDialog(true); }} createLabel="New Transfer"
      />
      <div className="border rounded-lg overflow-auto max-h-[70vh]">
        <Table>
          <TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628]">
            <TableHead className="text-white text-xs">Date</TableHead>
            <TableHead className="text-white text-xs">From</TableHead>
            <TableHead className="text-white text-xs">To</TableHead>
            <TableHead className="text-white text-xs">Items</TableHead>
            <TableHead className="text-white text-xs">Status</TableHead>
            {isAdmin && <TableHead className="text-white text-xs">Actions</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {trnLoading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow> :
            trnData.filter((t: any) => { if (!trnSearch) return true; const q = trnSearch.toLowerCase(); return (t.fromGodown?.name || "").toLowerCase().includes(q) || (t.toGodown?.name || "").toLowerCase().includes(q) || (t.status || "").toLowerCase().includes(q); }).map((t: any) => (
              <TableRow key={t.id}>
                <TableCell className="text-xs">{fmt(t.date, "date")}</TableCell>
                <TableCell className="text-xs">{t.fromGodown?.name || "—"}</TableCell>
                <TableCell className="text-xs">{t.toGodown?.name || "—"}</TableCell>
                <TableCell className="text-xs">{t.lines?.length || 0}</TableCell>
                <TableCell className="text-xs"><StatusBadge status={t.status} /></TableCell>
                {isAdmin && <TableCell className="text-xs"><Button variant="ghost" size="sm" onClick={() => { setTrnEdit(t); setTrnForm({ fromGodownId: t.fromGodownId || "", toGodownId: t.toGodownId || "", date: t.date?.split("T")[0] || "", status: t.status || "Pending", notes: t.notes || "" }); setTrnLines(t.lines?.length > 0 ? t.lines : [{ productId: "", quantity: 1 }]); setTrnDialog(true); }}><Edit className="h-3 w-3" /></Button></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Dialog open={trnDialog} onOpenChange={setTrnDialog}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>{trnEdit ? "Edit Transfer" : "New Stock Transfer"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div><Label className="text-sm font-medium">From Godown</Label><Select value={trnForm.fromGodownId} onValueChange={v => setTrnForm(p => ({ ...p, fromGodownId: v }))}><SelectTrigger><SelectValue placeholder="From" /></SelectTrigger><SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-sm font-medium">To Godown</Label><Select value={trnForm.toGodownId} onValueChange={v => setTrnForm(p => ({ ...p, toGodownId: v }))}><SelectTrigger><SelectValue placeholder="To" /></SelectTrigger><SelectContent>{godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label className="text-sm font-medium">Date</Label><Input type="date" value={trnForm.date} onChange={e => setTrnForm(p => ({ ...p, date: e.target.value }))} /></div>
            <LineItemsGrid lines={trnLines} setLines={setTrnLines} template={{ productId: "", quantity: 1 }} columns={[{ key: "productId", label: "Product" }, { key: "quantity", label: "Qty" }]} />
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setTrnDialog(false)}>Cancel</Button><Button onClick={async () => { setTrnSaving(true); try { const payload = { ...trnForm, lines: trnLines.filter((l: any) => l.productId).map((l: any) => ({ productId: l.productId, quantity: Number(l.quantity) || 1 })) }; if (trnEdit) { await apiFetch(`/api/transfers/${trnEdit.id}`, { method: "PUT", body: JSON.stringify(payload) }); toast({ title: "Updated" }); } else { await apiFetch("/api/transfers", { method: "POST", body: JSON.stringify(payload) }); toast({ title: "Created" }); } setTrnDialog(false); loadTransfers(); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } finally { setTrnSaving(false); } }} disabled={trnSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{trnSaving ? "Saving..." : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ─── Main Return ───

  if (isSR || isDealer) return <AccessDenied message="Sales Representatives and Dealers cannot access Inventory Management modules." />;

  return (
    <div className="page-enter space-y-4">
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Internal cost prices and margins are masked.</span>
        </div>
      )}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-slate-100 dark:bg-slate-800 p-1">
          <TabsTrigger value="company-ordersheet" className="text-xs">Company OS</TabsTrigger>
          <TabsTrigger value="customer-ordersheet" className="text-xs">Customer OS</TabsTrigger>
          <TabsTrigger value="ordersheet-report" className="text-xs">OS Report</TabsTrigger>
          <TabsTrigger value="purchase-orders" className="text-xs">Purchase Orders</TabsTrigger>
          <TabsTrigger value="auto-po" className="text-xs">Auto PO</TabsTrigger>
          <TabsTrigger value="sales-orders" className="text-xs">Sales Orders</TabsTrigger>
          <TabsTrigger value="hire-sales" className="text-xs">Hire Sales</TabsTrigger>
          <TabsTrigger value="sales-returns" className="text-xs">Sales Returns</TabsTrigger>
          <TabsTrigger value="purchase-returns" className="text-xs">Purchase Returns</TabsTrigger>
          <TabsTrigger value="replacements" className="text-xs">Replacements</TabsTrigger>
          <TabsTrigger value="opening-stock" className="text-xs">Opening Stock</TabsTrigger>
          <TabsTrigger value="batch-master" className="text-xs">Batch Master</TabsTrigger>
          <TabsTrigger value="stock" className="text-xs">Stock</TabsTrigger>
          <TabsTrigger value="stock-details" className="text-xs">Stock Details</TabsTrigger>
          <TabsTrigger value="stock-valuation" className="text-xs">Valuation</TabsTrigger>
          <TabsTrigger value="transfers" className="text-xs">Transfers</TabsTrigger>
        </TabsList>
        <TabsContent value="company-ordersheet">{renderCompanyOrdersheet()}</TabsContent>
        <TabsContent value="customer-ordersheet">{renderCustomerOrdersheet()}</TabsContent>
        <TabsContent value="ordersheet-report">{renderOrdersheetReport()}</TabsContent>
        <TabsContent value="purchase-orders">{renderPurchaseOrder()}</TabsContent>
        <TabsContent value="auto-po">{renderAutoPo()}</TabsContent>
        <TabsContent value="sales-orders">{renderSalesOrder()}</TabsContent>
        <TabsContent value="hire-sales">{renderHireSales()}</TabsContent>
        <TabsContent value="sales-returns">{renderSalesReturn()}</TabsContent>
        <TabsContent value="purchase-returns">{renderPurchaseReturn()}</TabsContent>
        <TabsContent value="replacements">{renderReplacements()}</TabsContent>
        <TabsContent value="opening-stock">{renderOpeningStock()}</TabsContent>
        <TabsContent value="batch-master">{renderBatchMaster()}</TabsContent>
        <TabsContent value="stock">{renderStock()}</TabsContent>
        <TabsContent value="stock-details">{renderStockDetails()}</TabsContent>
        <TabsContent value="stock-valuation">{renderStockValuation()}</TabsContent>
        <TabsContent value="transfers">{renderTransfers()}</TabsContent>
      </Tabs>
    </div>
  );
}
