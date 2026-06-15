"use client";
// ============================================================
// VoltERP — ELECTRONICS MART IMS
// Sales Module Page: Sales Orders, Hire Sales, Sales Returns
// Theme: Deep Navy Blue (#0a1628, #132240) with accent blue (#2563eb)
// Footer: Developed & Copyright by NextGen Digital Studio
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Shield, X, CheckCircle, Receipt, DollarSign,
  RotateCcw, Package, BarChart3, AlertTriangle, Eye, TrendingUp,
  Clock, Printer, CreditCard, Calculator, ChevronDown, ChevronRight,
  Banknote, Users, HandCoins, Percent, FileBarChart, ArrowDownUp,
  CalendarDays, CircleDollarSign, BadgeDollarSign, Wallet,
  ClipboardCheck, FileWarning, AlertCircle, Info, Loader2, Copy,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF, exportToCSV, importFromCSV, getVatMaskedKeys,
} from "@/lib/export-utils";
import { copyTableToClipboard } from "@/lib/clipboard-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef } from "@/lib/export-utils";
import { apiFetch } from "@/lib/api-client";
import { exportInvoicePDF, type InvoiceCompanyProfile, type InvoiceTemplateConfig, type InvoiceData, type InvoiceLineItem, numberToWordsBDT } from "@/lib/invoice-engine";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

import { fmtBDT as _fmtBDT } from "@/lib/number-format";

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)" || v === "N/A (Restricted)") return v;
  return _fmtBDT(Number(v));
};

const fmtDate = (d: string | Date) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };

const fmtPercent = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)" || v === "N/A (Restricted)") return v;
  return `${Number(v).toFixed(2)}%`;
};

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
  Draft: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Approved: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Delivered: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Cancelled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Defaulted: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Paid: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  Overdue: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Partial: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
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
// PROPS
// ============================================================

interface SalesModulePageProps {
  currentPage: string;
  userRole: string;
  isVatAuditor: boolean;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function SalesModulePage({ currentPage, userRole, isVatAuditor }: SalesModulePageProps) {
  const { toast } = useToast();
  const isAdmin = userRole === "admin" || userRole === "manager";
  const isSR = userRole === "sr";
  const isDealer = userRole === "dealer";

  // ─── Tab Mapping ───
  const tabMap: Record<string, string> = {
    "sales-orders": "sales-orders",
    "hire-sales": "hire-sales",
    "sales-returns": "sales-returns",
  };
  const [activeTab, setActiveTab] = useState(tabMap[currentPage] || "sales-orders");

  useEffect(() => {
    const mapped = tabMap[currentPage];
    if (mapped && mapped !== activeTab) setActiveTab(mapped);
  }, [currentPage]);

  // ─── Shared Dropdowns ───
  const [companies, setCompanies] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [salesOrdersForReturn, setSalesOrdersForReturn] = useState<any[]>([]);

  const loadDropdowns = useCallback(async () => {
    try { const r = await apiFetch("/api/companies"); setCompanies(Array.isArray(r) ? r : []); } catch (e) { console.error('Error loading companies:', e); }
    try { const r = await apiFetch("/api/customers"); setCustomers(Array.isArray(r) ? r : []); } catch (e) { console.error('Error loading customers:', e); }
    try { const r = await apiFetch("/api/products"); setProducts(Array.isArray(r) ? r : []); } catch (e) { console.error('Error loading products:', e); }
    try { const r = await apiFetch("/api/godowns"); setGodowns(Array.isArray(r) ? r : []); } catch (e) { console.error('Error loading godowns:', e); }
    try { const r = await apiFetch("/api/payment-options"); setPaymentOptions(Array.isArray(r) ? r : []); } catch (e) { console.error('Error loading payment options:', e); }
    try {
      const r = await apiFetch("/api/employees");
      const emps = Array.isArray(r) ? r : [];
      setEmployees(emps.filter((e: any) =>
        e.designation?.name?.includes("SR") || e.designation?.name?.includes("Sales") || e.designation?.name?.includes("sr") || e.designation?.name?.includes("sales")
      ));
    } catch (e) {
      console.error('Error loading employees:', e);
    }
  }, []);

  useEffect(() => { loadDropdowns(); }, [loadDropdowns]);

  // ============================================================
  // SALES ORDER STATE
  // ============================================================

  const [soData, setSoData] = useState<any[]>([]);
  const [soLoading, setSoLoading] = useState(true);
  const [soSearch, setSoSearch] = useState("");
  const [soStatusFilter, setSoStatusFilter] = useState("all");
  const [soCustomerFilter, setSoCustomerFilter] = useState("all");
  const [soDateFrom, setSoDateFrom] = useState("");
  const [soDateTo, setSoDateTo] = useState("");
  const [soDialog, setSoDialog] = useState(false);
  const [soEdit, setSoEdit] = useState<any>(null);
  const [soSaving, setSoSaving] = useState(false);
  const [soDelete, setSoDelete] = useState<any>(null);
  const [soForm, setSoForm] = useState<Record<string, any>>({
    customerId: "", godownId: "", date: new Date().toISOString().split("T")[0],
    status: "Draft", discountPercent: 0, vatPercentage: 0, paymentOptionId: "", srId: "", notes: "",
  });
  const [soSendSms, setSoSendSms] = useState(false);
  const [soLines, setSoLines] = useState<any[]>([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
  const [soExpandedRows, setSoExpandedRows] = useState<Set<string>>(new Set());
  const [soCogsDialog, setSoCogsDialog] = useState(false);
  const [soCogsData, setSoCogsData] = useState<any>(null);
  const [soCogsLoading, setSoCogsLoading] = useState(false);

  // ─── Sales Order Computed Stats ───
  const soStats = useMemo(() => {
    const active = soData.filter(o => o.isActive !== false);
    return {
      total: active.length,
      totalRevenue: active.reduce((s, o) => s + safeNum(o.grandTotal), 0),
      totalCOGS: active.reduce((s, o) => s + safeNum(o.cogsTotal), 0),
      grossProfit: active.reduce((s, o) => s + safeNum(o.grossProfit), 0),
      avgMargin: active.length > 0 ? active.reduce((s, o) => s + safeNum(o.profitMargin), 0) / active.filter(o => safeNum(o.profitMargin) !== 0).length || 0 : 0,
      arOutstanding: active.filter(o => o.arPosted && o.status !== "Cancelled" && o.status !== "Completed").reduce((s, o) => s + safeNum(o.grandTotal), 0),
    };
  }, [soData]);

  // ─── Sales Order Filtered Data ───
  const soFiltered = useMemo(() => {
    let data = soData.filter(o => o.isActive !== false);
    if (soStatusFilter !== "all") data = data.filter(o => o.status === soStatusFilter);
    if (soCustomerFilter !== "all") data = data.filter(o => o.customerId === soCustomerFilter);
    if (soDateFrom) data = data.filter(o => new Date(o.date) >= new Date(soDateFrom));
    if (soDateTo) data = data.filter(o => new Date(o.date) <= new Date(soDateTo + "T23:59:59"));
    if (soSearch) {
      const q = soSearch.toLowerCase();
      data = data.filter(o =>
        (o.invoiceNo || "").toLowerCase().includes(q) ||
        (o.customer?.name || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [soData, soStatusFilter, soCustomerFilter, soDateFrom, soDateTo, soSearch]);

  // ─── Sales Order Loaders ───
  const loadSalesOrders = useCallback(async () => {
    setSoLoading(true);
    try {
      const params = new URLSearchParams();
      if (soStatusFilter !== "all") params.set("status", soStatusFilter);
      if (soCustomerFilter !== "all") params.set("customerId", soCustomerFilter);
      if (soDateFrom) params.set("dateFrom", soDateFrom);
      if (soDateTo) params.set("dateTo", soDateTo);
      const qs = params.toString();
      const res = await apiFetch(`/api/sales-orders${qs ? `?${qs}` : ""}`);
      setSoData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSoLoading(false); }
  }, [toast, soStatusFilter, soCustomerFilter, soDateFrom, soDateTo]);

  const loadCOGSDashboard = useCallback(async () => {
    setSoCogsLoading(true);
    setSoCogsDialog(true);
    try {
      const params = new URLSearchParams();
      if (soDateFrom) params.set("dateFrom", soDateFrom);
      if (soDateTo) params.set("dateTo", soDateTo);
      const res = await apiFetch(`/api/sales-orders/cogs${params.toString() ? `?${params.toString()}` : ""}`);
      setSoCogsData(res);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSoCogsLoading(false); }
  }, [soDateFrom, soDateTo, toast]);

  // ─── Sales Order CRUD ───
  const openSoCreate = useCallback(() => {
    setSoEdit(null);
    setSoForm({
      customerId: "", godownId: "", date: new Date().toISOString().split("T")[0],
      status: "Draft", discountPercent: 0, vatPercentage: 0, paymentOptionId: "", srId: "", notes: "",
    });
    setSoLines([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setSoDialog(true);
  }, []);

  const openSoEdit = useCallback((item: any) => {
    setSoEdit(item);
    setSoForm({
      customerId: item.customerId || "",
      godownId: item.godownId || "",
      date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
      status: item.status || "Draft",
      discountPercent: item.discountPercent || 0,
      vatPercentage: item.vatPercentage || 0,
      paymentOptionId: item.paymentOptionId || "",
      srId: item.srId || "",
      notes: item.notes || "",
    });
    setSoLines(item.lines?.length > 0
      ? item.lines.map((l: any) => ({ productId: l.productId, quantity: l.quantity, rate: l.rate, discountPercent: l.discountPercent || 0 }))
      : [{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]
    );
    setSoDialog(true);
  }, []);

  const saveSo = useCallback(async () => {
    if (!soForm.customerId) { toast({ title: "Validation", description: "Customer is required", variant: "destructive" }); return; }
    if (!soForm.date) { toast({ title: "Validation", description: "Date is required", variant: "destructive" }); return; }
    if (soLines.length === 0 || soLines.some(l => !l.productId)) {
      toast({ title: "Validation", description: "At least one line item with a product is required", variant: "destructive" }); return;
    }
    setSoSaving(true);
    try {
      const lineItems = soLines.map(l => ({
        productId: l.productId,
        quantity: Number(l.quantity) || 1,
        rate: Number(l.rate) || 0,
        discountPercent: Number(l.discountPercent) || 0,
      }));
      const payload = { ...soForm, lines: lineItems, sendSms: soSendSms };
      if (soEdit) {
        await apiFetch(`/api/sales-orders/${soEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Sales order updated" });
      } else {
        await apiFetch("/api/sales-orders", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Sales order created" });
      }
      setSoDialog(false);
      loadSalesOrders();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSoSaving(false); }
  }, [soForm, soLines, soEdit, soSendSms, toast, loadSalesOrders]);

  const deleteSo = useCallback(async () => {
    if (!soDelete) return;
    try {
      await apiFetch(`/api/sales-orders/${soDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Sales order deleted" });
      setSoDelete(null);
      loadSalesOrders();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [soDelete, toast, loadSalesOrders]);

  const handlePrintInvoice = useCallback(async (soId: string, invoiceNo?: string, format: "invoice" | "mushok63" | "challan" = "invoice") => {
    try {
      const formatLabels: Record<string, string> = { invoice: "Sales Invoice", mushok63: "Mushok 6.3", challan: "Delivery Challan" };
      toast({ title: "Generating Invoice", description: `Fetching data for ${formatLabels[format]}...` });
      const [brandingResp, so] = await Promise.all([
        apiFetch("/api/company-branding"),
        apiFetch(`/api/sales-orders/${soId}?include=lines,customer,paymentOption`),
      ]);
      const companyProfile: InvoiceCompanyProfile = (brandingResp as any)?.company || brandingResp;
      const customer = so.customer || {};
      const paymentOption = so.paymentOption || {};
      const items: InvoiceLineItem[] = (so.lines || []).map((line: any, idx: number) => {
        const qty = Number(line.quantity) || 0;
        const rate = Number(line.rate) || 0;
        const discPct = Number(line.discountPercent) || 0;
        const discAmt = qty * rate * (discPct / 100);
        const lineTotal = qty * rate - discAmt;
        return {
          sl: idx + 1,
          model: line.product?.sku || "",
          color: line.product?.color || "",
          description: line.product?.name || "Item",
          qty,
          mrp: rate,
          discountAmt: discAmt || undefined,
          unitPrice: rate,
          amount: lineTotal,
        };
      });
      const subTotal = items.reduce((s, i) => s + i.qty * (i.mrp || 0), 0);
      const discountAmount = Number(so.discount) || 0;
      const discountPercent = subTotal > 0 ? (discountAmount / subTotal) * 100 : 0;
      let printedBy = "System";
      try { const a = JSON.parse(localStorage.getItem("ems_auth") || "{}"); printedBy = a.user?.displayName || a.user?.name || "System"; } catch { /* use default */ }

      // Format-specific configuration
      const formatInvoiceType = formatLabels[format];
      let templateConfig: InvoiceTemplateConfig;
      let filename: string;

      if (format === "mushok63") {
        templateConfig = {
          showLogo: true, showBrandLogo: false, showMobile: true, showAddress: true,
          showVatNumber: true, showTradeLicense: true, showCustomerCode: true,
          showPrevDue: false, showTotalDue: false, showModel: true, showColor: false,
          showDescription: true, showMRP: true, showDiscountAmt: false, showUnitPrice: true,
          showDiscountPct: false, showPPDiscount: false, showAdjustment: false,
          showDeliveryCost: false, showPaymentDetails: false,
          showCustomerSignature: false, showPreparedBy: true, showCheckedBy: true,
          showAuthorizedBy: true, showPrintDate: true,
          termsAndConditions: "This document is prepared as per National Board of Revenue (NBR) regulations.",
          customFooterNote: "Mushok 6.3 — VAT Return Form",
        };
        filename = `Mushok63_${invoiceNo || so.invoiceNo || soId}.pdf`;
      } else if (format === "challan") {
        templateConfig = {
          showLogo: true, showBrandLogo: false, showMobile: true, showAddress: true,
          showVatNumber: false, showCustomerCode: false,
          showPrevDue: false, showTotalDue: false, showModel: true, showColor: true,
          showDescription: true, showMRP: false, showDiscountAmt: false, showUnitPrice: false,
          showDiscountPct: false, showPPDiscount: false, showAdjustment: false,
          showDeliveryCost: false, showPaymentDetails: false,
          showCustomerSignature: true, showPreparedBy: true, showCheckedBy: false,
          showAuthorizedBy: true, showPrintDate: true,
          customFooterNote: "Received the above items in good condition.",
        };
        filename = `Challan_${invoiceNo || so.invoiceNo || soId}.pdf`;
      } else {
        templateConfig = {
          showLogo: true, showBrandLogo: true, showMobile: true, showAddress: true,
          showVatNumber: true, showCustomerCode: true,
          showPrevDue: false, showTotalDue: false, showModel: false, showColor: false,
          showDescription: true, showMRP: true, showDiscountAmt: true, showUnitPrice: true,
          showDiscountPct: true, showPaymentDetails: true,
          showCustomerSignature: true, showPreparedBy: true, showAuthorizedBy: true,
          showPrintDate: true,
        };
        filename = `Invoice_${invoiceNo || so.invoiceNo || soId}.pdf`;
      }

      const invoiceData: InvoiceData = {
        invoiceNo: invoiceNo || so.invoiceNo || `INV-${String(so.id).padStart(5, "0")}`,
        invoiceDate: so.date,
        customerCode: customer.customerCode || undefined,
        customerName: customer.name || "Walk-in Customer",
        customerMobile: customer.phone || undefined,
        customerAddress: customer.address || undefined,
        items,
        discountAmount,
        discountPercent: Math.round(discountPercent * 100) / 100,
        netTotal: Number(so.grandTotal) || 0,
        paidAmount: Number(so.grandTotal) || 0,
        currentDue: 0,
        paymentDetails: [{ paymentType: paymentOption.name || "Cash", paidAmount: Number(so.grandTotal) || 0 }],
        payInWord: numberToWordsBDT(Number(so.grandTotal) || 0),
        invoiceType: formatInvoiceType,
        barcodeData: so.invoiceNo || "",
        printedBy,
        salesPerson: so.srId || "System",
      };
      exportInvoicePDF({
        invoice: invoiceData,
        company: companyProfile,
        template: templateConfig,
        filename,
      });
      toast({ title: "Invoice Generated", description: `${invoiceData.invoiceNo} — ${formatInvoiceType} PDF generated successfully` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message || "Failed to generate invoice", variant: "destructive" });
    }
  }, [toast]);

  // ─── Sales Order Line Helpers ───
  const soLineTotal = useCallback((line: any) => {
    const qty = Number(line.quantity) || 0;
    const rate = Number(line.rate) || 0;
    const disc = Number(line.discountPercent) || 0;
    return qty * rate * (1 - disc / 100);
  }, []);

  const soComputedTotals = useMemo(() => {
    const subTotal = soLines.reduce((s, l) => s + soLineTotal(l), 0);
    const discountAmt = subTotal * (Number(soForm.discountPercent) || 0) / 100;
    const afterDiscount = subTotal - discountAmt;
    const vatAmt = afterDiscount * (Number(soForm.vatPercentage) || 0) / 100;
    const grandTotal = afterDiscount + vatAmt;
    return { subTotal, discountAmt, afterDiscount, vatAmt, grandTotal };
  }, [soLines, soForm.discountPercent, soForm.vatPercentage, soLineTotal]);

  const toggleSoExpand = useCallback((id: string) => {
    setSoExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ============================================================
  // HIRE SALES STATE
  // ============================================================

  const [hsData, setHsData] = useState<any[]>([]);
  const [hsLoading, setHsLoading] = useState(true);
  const [hsSearch, setHsSearch] = useState("");
  const [hsStatusFilter, setHsStatusFilter] = useState("all");
  const [hsCustomerFilter, setHsCustomerFilter] = useState("all");
  const [hsDialog, setHsDialog] = useState(false);
  const [hsEdit, setHsEdit] = useState<any>(null);
  const [hsSaving, setHsSaving] = useState(false);
  const [hsDelete, setHsDelete] = useState<any>(null);
  const [hsForm, setHsForm] = useState<Record<string, any>>({
    customerId: "", date: new Date().toISOString().split("T")[0],
    godownId: "", downPayment: 0, hireRate: 0, duration: 12,
    penaltyRate: 0, vatPercentage: 0, notes: "",
  });
  const [hsLines, setHsLines] = useState<any[]>([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
  const [hsExpandedRows, setHsExpandedRows] = useState<Set<string>>(new Set());
  const [hsPayDialog, setHsPayDialog] = useState(false);
  const [hsPayForm, setHsPayForm] = useState<Record<string, any>>({
    hireSalesId: "", installmentId: "", paidAmount: 0,
    paidDate: new Date().toISOString().split("T")[0], paymentRef: "", notes: "",
  });
  const [hsPaySaving, setHsPaySaving] = useState(false);
  const [hsPayInstallment, setHsPayInstallment] = useState<any>(null);

  // ─── Hire Sales Computed Stats ───
  const hsStats = useMemo(() => {
    const active = hsData.filter(h => h.isActive !== false);
    const activeAccounts = active.filter(h => h.currentStatus === "Active");
    return {
      activeAccounts: activeAccounts.length,
      totalHireValue: active.reduce((s, h) => s + safeNum(h.totalHirePayable), 0),
      totalCollected: active.reduce((s, h) => s + safeNum(h.totalPaid), 0),
      outstandingBalance: active.reduce((s, h) => s + safeNum(h.outstandingBalance), 0),
      overdueInstallments: active.reduce((s, h) => s + (h.installments?.filter((i: any) => i.status === "Overdue").length || 0), 0),
      totalPenalties: active.reduce((s, h) => s + safeNum(h.totalPenaltyAmount), 0),
    };
  }, [hsData]);

  // ─── Hire Sales Filtered Data ───
  const hsFiltered = useMemo(() => {
    let data = hsData.filter(h => h.isActive !== false);
    if (hsStatusFilter !== "all") data = data.filter(h => h.currentStatus === hsStatusFilter || h.status === hsStatusFilter);
    if (hsCustomerFilter !== "all") data = data.filter(h => h.customerId === hsCustomerFilter);
    if (hsSearch) {
      const q = hsSearch.toLowerCase();
      data = data.filter(h =>
        (h.invoiceNo || "").toLowerCase().includes(q) ||
        (h.customer?.name || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [hsData, hsStatusFilter, hsCustomerFilter, hsSearch]);

  // ─── Hire Sales Loaders ───
  const loadHireSales = useCallback(async () => {
    setHsLoading(true);
    try {
      const params = new URLSearchParams();
      if (hsStatusFilter !== "all") params.set("currentStatus", hsStatusFilter);
      if (hsCustomerFilter !== "all") params.set("customerId", hsCustomerFilter);
      const qs = params.toString();
      const res = await apiFetch(`/api/hire-sales${qs ? `?${qs}` : ""}`);
      setHsData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setHsLoading(false); }
  }, [toast, hsStatusFilter, hsCustomerFilter]);

  // ─── Hire Sales CRUD ───
  const openHsCreate = useCallback(() => {
    setHsEdit(null);
    setHsForm({
      customerId: "", date: new Date().toISOString().split("T")[0],
      godownId: "", downPayment: 0, hireRate: 0, duration: 12,
      penaltyRate: 0, vatPercentage: 0, notes: "",
    });
    setHsLines([{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]);
    setHsDialog(true);
  }, []);

  const openHsEdit = useCallback((item: any) => {
    setHsEdit(item);
    setHsForm({
      customerId: item.customerId || "",
      date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
      godownId: item.godownId || "",
      downPayment: item.downPayment || 0,
      hireRate: item.hireRate || 0,
      duration: item.duration || 12,
      penaltyRate: item.penaltyRate || 0,
      vatPercentage: item.vatPercentage || 0,
      notes: item.notes || "",
    });
    setHsLines(item.lines?.length > 0
      ? item.lines.map((l: any) => ({ productId: l.productId, quantity: l.quantity, rate: l.rate, discountPercent: l.discountPercent || 0 }))
      : [{ productId: "", quantity: 1, rate: 0, discountPercent: 0 }]
    );
    setHsDialog(true);
  }, []);

  const saveHs = useCallback(async () => {
    if (!hsForm.customerId) { toast({ title: "Validation", description: "Customer is required", variant: "destructive" }); return; }
    if (!hsForm.date) { toast({ title: "Validation", description: "Date is required", variant: "destructive" }); return; }
    if (hsLines.length === 0 || hsLines.some(l => !l.productId)) {
      toast({ title: "Validation", description: "At least one line item with a product is required", variant: "destructive" }); return;
    }
    setHsSaving(true);
    try {
      const lineItems = hsLines.map(l => ({
        productId: l.productId,
        quantity: Number(l.quantity) || 1,
        rate: Number(l.rate) || 0,
        discountPercent: Number(l.discountPercent) || 0,
      }));
      const payload = { ...hsForm, lines: lineItems };
      if (hsEdit) {
        await apiFetch(`/api/hire-sales/${hsEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Hire sale updated" });
      } else {
        await apiFetch("/api/hire-sales", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Hire sale created" });
      }
      setHsDialog(false);
      loadHireSales();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setHsSaving(false); }
  }, [hsForm, hsLines, hsEdit, toast, loadHireSales]);

  const deleteHs = useCallback(async () => {
    if (!hsDelete) return;
    try {
      await apiFetch(`/api/hire-sales/${hsDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Hire sale deleted" });
      setHsDelete(null);
      loadHireSales();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [hsDelete, toast, loadHireSales]);

  // ─── Hire Sales Line Helpers ───
  const hsLineTotal = useCallback((line: any) => {
    const qty = Number(line.quantity) || 0;
    const rate = Number(line.rate) || 0;
    const disc = Number(line.discountPercent) || 0;
    return qty * rate * (1 - disc / 100);
  }, []);

  const hsComputedTotals = useMemo(() => {
    const subTotal = hsLines.reduce((s, l) => s + hsLineTotal(l), 0);
    const dp = Number(hsForm.downPayment) || 0;
    const balanceAmount = subTotal - dp;
    const vatAmt = balanceAmount * (Number(hsForm.vatPercentage) || 0) / 100;
    const duration = Number(hsForm.duration) || 12;
    const hireRate = Number(hsForm.hireRate) || 0;
    const totalInterest = balanceAmount * (hireRate / 100) * (duration / 12);
    const totalPayable = balanceAmount + totalInterest;
    const installmentAmt = duration > 0 ? totalPayable / duration : 0;
    return { subTotal, dp, balanceAmount, vatAmt, totalInterest, totalPayable, installmentAmt };
  }, [hsLines, hsForm.downPayment, hsForm.vatPercentage, hsForm.hireRate, hsForm.duration, hsLineTotal]);

  const toggleHsExpand = useCallback((id: string) => {
    setHsExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ─── Installment Payment ───
  const openPayInstallment = useCallback((hireSaleId: string, installment: any) => {
    setHsPayInstallment(installment);
    setHsPayForm({
      hireSalesId: hireSaleId,
      installmentId: installment.id,
      paidAmount: installment.amount || 0,
      paidDate: new Date().toISOString().split("T")[0],
      paymentRef: "",
      notes: "",
    });
    setHsPayDialog(true);
  }, []);

  const savePayInstallment = useCallback(async () => {
    if (!hsPayForm.paidAmount || Number(hsPayForm.paidAmount) <= 0) {
      toast({ title: "Validation", description: "Paid amount must be greater than 0", variant: "destructive" }); return;
    }
    setHsPaySaving(true);
    try {
      await apiFetch("/api/hire-sales/installment-payment", {
        method: "POST",
        body: JSON.stringify(hsPayForm),
      });
      toast({ title: "Payment Recorded", description: "Installment payment saved" });
      setHsPayDialog(false);
      loadHireSales();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setHsPaySaving(false); }
  }, [hsPayForm, toast, loadHireSales]);

  // ============================================================
  // SALES RETURNS STATE
  // ============================================================

  const [srData, setSrData] = useState<any[]>([]);
  const [srLoading, setSrLoading] = useState(true);
  const [srSearch, setSrSearch] = useState("");
  const [srStatusFilter, setSrStatusFilter] = useState("all");
  const [srCustomerFilter, setSrCustomerFilter] = useState("all");
  const [srDateFrom, setSrDateFrom] = useState("");
  const [srDateTo, setSrDateTo] = useState("");
  const [srDialog, setSrDialog] = useState(false);
  const [srEdit, setSrEdit] = useState<any>(null);
  const [srSaving, setSrSaving] = useState(false);
  const [srDelete, setSrDelete] = useState<any>(null);
  const [srForm, setSrForm] = useState<Record<string, any>>({
    salesOrderId: "", customerId: "", date: new Date().toISOString().split("T")[0],
    godownId: "", reason: "", status: "Pending",
  });
  const [srLines, setSrLines] = useState<any[]>([]);
  const [srExpandedRows, setSrExpandedRows] = useState<Set<string>>(new Set());
  const [srSelectedOrderLines, setSrSelectedOrderLines] = useState<any[]>([]);

  // ─── Sales Return Computed Stats ───
  const srStats = useMemo(() => {
    const active = srData.filter(r => r.isActive !== false);
    return {
      total: active.length,
      returnValue: active.reduce((s, r) => s + safeNum(r.grandTotal), 0),
      cogsReversal: active.reduce((s, r) => s + safeNum(r.cogsReversal), 0),
      arAdjusted: active.filter(r => r.arAdjustmentPosted).length,
      pendingApproval: active.filter(r => r.status === "Pending").length,
    };
  }, [srData]);

  // ─── Sales Return Filtered Data ───
  const srFiltered = useMemo(() => {
    let data = srData.filter(r => r.isActive !== false);
    if (srStatusFilter !== "all") data = data.filter(r => r.status === srStatusFilter);
    if (srCustomerFilter !== "all") data = data.filter(r => r.customerId === srCustomerFilter);
    if (srDateFrom) data = data.filter(r => new Date(r.date) >= new Date(srDateFrom));
    if (srDateTo) data = data.filter(r => new Date(r.date) <= new Date(srDateTo + "T23:59:59"));
    if (srSearch) {
      const q = srSearch.toLowerCase();
      data = data.filter(r =>
        (r.returnNo || "").toLowerCase().includes(q) ||
        (r.customer?.name || "").toLowerCase().includes(q)
      );
    }
    return data;
  }, [srData, srStatusFilter, srCustomerFilter, srDateFrom, srDateTo, srSearch]);

  // ─── Sales Return Loaders ───
  const loadSalesReturns = useCallback(async () => {
    setSrLoading(true);
    try {
      const params = new URLSearchParams();
      if (srStatusFilter !== "all") params.set("status", srStatusFilter);
      if (srCustomerFilter !== "all") params.set("customerId", srCustomerFilter);
      if (srDateFrom) params.set("dateFrom", srDateFrom);
      if (srDateTo) params.set("dateTo", srDateTo);
      const qs = params.toString();
      const res = await apiFetch(`/api/sales-returns${qs ? `?${qs}` : ""}`);
      setSrData(Array.isArray(res) ? res : []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSrLoading(false); }
  }, [toast, srStatusFilter, srCustomerFilter, srDateFrom, srDateTo]);

  // ─── Sales Return: Load order lines when selecting a sales order ───
  const handleSrOrderChange = useCallback(async (orderId: string) => {
    if (!orderId) { setSrSelectedOrderLines([]); setSrLines([]); return; }
    try {
      const order = await apiFetch(`/api/sales-orders/${orderId}`);
      setSrForm(prev => ({ ...prev, customerId: order.customerId || "", salesOrderId: orderId }));
      const orderLines = order.lines || [];
      setSrSelectedOrderLines(orderLines);
      setSrLines(orderLines.map((l: any) => ({
        productId: l.productId,
        quantity: l.quantity,
        maxQuantity: l.quantity,
        rate: l.rate,
        discountPercent: l.discountPercent || 0,
        costPrice: l.costPrice || 0,
      })));
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [toast]);

  // ─── Sales Return CRUD ───
  const openSrCreate = useCallback(async () => {
    setSrEdit(null);
    setSrForm({
      salesOrderId: "", customerId: "", date: new Date().toISOString().split("T")[0],
      godownId: "", reason: "", status: "Pending",
    });
    setSrLines([]);
    setSrSelectedOrderLines([]);
    try {
      const res = await apiFetch("/api/sales-orders?status=Confirmed");
      setSalesOrdersForReturn(Array.isArray(res) ? res.filter((o: any) => o.status !== "Cancelled" && o.status !== "Draft") : []);
    } catch (err) {
      console.error('Error loading sales orders for return:', err);
    }
    setSrDialog(true);
  }, []);

  const openSrEdit = useCallback((item: any) => {
    setSrEdit(item);
    setSrForm({
      salesOrderId: item.salesOrderId || "",
      customerId: item.customerId || "",
      date: item.date ? new Date(item.date).toISOString().split("T")[0] : "",
      godownId: item.godownId || "",
      reason: item.reason || "",
      status: item.status || "Pending",
    });
    setSrLines(item.lines?.length > 0
      ? item.lines.map((l: any) => ({
        productId: l.productId, quantity: l.quantity, maxQuantity: l.quantity,
        rate: l.rate, discountPercent: l.discountPercent || 0, costPrice: l.costPrice || 0,
      }))
      : []
    );
    setSrDialog(true);
  }, []);

  const saveSr = useCallback(async () => {
    if (!srForm.salesOrderId) { toast({ title: "Validation", description: "Sales Order is required", variant: "destructive" }); return; }
    if (!srForm.date) { toast({ title: "Validation", description: "Date is required", variant: "destructive" }); return; }
    if (srLines.length === 0 || srLines.every(l => Number(l.quantity) === 0)) {
      toast({ title: "Validation", description: "At least one line item with quantity is required", variant: "destructive" }); return;
    }
    setSrSaving(true);
    try {
      const lineItems = srLines.filter(l => Number(l.quantity) > 0).map(l => ({
        productId: l.productId,
        quantity: Number(l.quantity) || 0,
        rate: Number(l.rate) || 0,
        discountPercent: Number(l.discountPercent) || 0,
      }));
      const payload = { ...srForm, lines: lineItems };
      if (srEdit) {
        await apiFetch(`/api/sales-returns/${srEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Sales return updated" });
      } else {
        await apiFetch("/api/sales-returns", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Sales return created" });
      }
      setSrDialog(false);
      loadSalesReturns();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSrSaving(false); }
  }, [srForm, srLines, srEdit, toast, loadSalesReturns]);

  const deleteSr = useCallback(async () => {
    if (!srDelete) return;
    try {
      await apiFetch(`/api/sales-returns/${srDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Sales return deleted" });
      setSrDelete(null);
      loadSalesReturns();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [srDelete, toast, loadSalesReturns]);

  const toggleSrExpand = useCallback((id: string) => {
    setSrExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ─── Sales Return Line Helpers ───
  const srLineTotal = useCallback((line: any) => {
    const qty = Number(line.quantity) || 0;
    const rate = Number(line.rate) || 0;
    const disc = Number(line.discountPercent) || 0;
    return qty * rate * (1 - disc / 100);
  }, []);

  const srComputedTotals = useMemo(() => {
    const subTotal = srLines.reduce((s, l) => s + srLineTotal(l), 0);
    const discountAmt = subTotal * 0;
    const vatAmt = subTotal * 0;
    const grandTotal = subTotal;
    const cogsReversal = srLines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.costPrice) || 0), 0);
    return { subTotal, discountAmt, vatAmt, grandTotal, cogsReversal };
  }, [srLines, srLineTotal]);

  // ============================================================
  // INIT: Load data based on active tab
  // ============================================================

  useEffect(() => {
    if (activeTab === "sales-orders") loadSalesOrders();
    if (activeTab === "hire-sales") loadHireSales();
    if (activeTab === "sales-returns") loadSalesReturns();
  }, [activeTab, loadSalesOrders, loadHireSales, loadSalesReturns]);

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
    } catch (err) {
      console.error('Error loading company info for invoice:', err);
    }
    return undefined;
  }, [companies]);

  const doExportSO = useCallback(async (format: "pdf" | "csv") => {
    const columns: ExportColumnDef[] = [
      { key: "invoiceNo", label: "Invoice No", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "grandTotal", label: "Grand Total", type: "currency" },
      { key: "cogsTotal", label: "COGS", type: "currency" },
      { key: "grossProfit", label: "Profit", type: "currency" },
      { key: "profitMargin", label: "Margin%", type: "number" },
      { key: "status", label: "Status", type: "text" },
    ];
    const data = soFiltered.map((o: any) => ({
      ...o,
      customerName: o.customer?.name || "—",
    }));
    const maskedKeys = getVatMaskedKeys(columns);
    const company = await getCompanyProfile();
    if (format === "pdf") {
      exportToPDF({
        title: "Sales Order Registry",
        columns, data, isVatAuditor, vatMaskedColumns: maskedKeys,
        orientation: "landscape", company,
        financialFooter: { printedBy: (() => { try { const a = JSON.parse(localStorage.getItem("ems_auth") || "{}"); return a.user?.displayName || a.user?.name || "System"; } catch { return "System"; } })() },
        systemNotice: "This is a computer-generated document. Verify with official records.",
      });
    } else {
      exportToCSV({ title: "Sales Order Registry", columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
    }
    toast({ title: "Exported", description: `Sales Orders ${format.toUpperCase()} exported` });
  }, [soFiltered, isVatAuditor, userRole, getCompanyProfile, toast]);

  const doCopySO = useCallback(async () => {
    const columns: ExportColumnDef[] = [
      { key: "invoiceNo", label: "Invoice No", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "grandTotal", label: "Grand Total", type: "currency" },
      { key: "cogsTotal", label: "COGS", type: "currency" },
      { key: "grossProfit", label: "Profit", type: "currency" },
      { key: "profitMargin", label: "Margin%", type: "number" },
      { key: "status", label: "Status", type: "text" },
    ];
    const data = soFiltered.map((o: any) => ({ ...o, customerName: o.customer?.name || "\u2014" }));
    const maskedKeys = getVatMaskedKeys(columns);
    try {
      const result = await copyTableToClipboard({ title: "Sales Order Registry", columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
      if (result.success) { toast({ title: "Copied", description: result.message }); } else { toast({ title: "Copy Failed", description: result.message, variant: "destructive" }); }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [soFiltered, isVatAuditor, toast]);

  const doExportHS = useCallback(async (format: "pdf" | "csv") => {
    const columns: ExportColumnDef[] = [
      { key: "invoiceNo", label: "Invoice No", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "totalHirePayable", label: "Total Payable", type: "currency" },
      { key: "totalPaid", label: "Total Paid", type: "currency" },
      { key: "outstandingBalance", label: "Outstanding", type: "currency" },
      { key: "cogsTotal", label: "COGS", type: "currency" },
      { key: "currentStatus", label: "Status", type: "text" },
    ];
    const data = hsFiltered.map((h: any) => ({
      ...h,
      customerName: h.customer?.name || "—",
    }));
    const maskedKeys = getVatMaskedKeys(columns);
    const company = await getCompanyProfile();
    if (format === "pdf") {
      exportToPDF({
        title: "Hire Sales Ledger",
        columns, data, isVatAuditor, vatMaskedColumns: maskedKeys,
        orientation: "landscape", company,
        financialFooter: { printedBy: (() => { try { const a = JSON.parse(localStorage.getItem("ems_auth") || "{}"); return a.user?.displayName || a.user?.name || "System"; } catch { return "System"; } })() },
        systemNotice: "This is a computer-generated document. Verify with official records.",
      });
    } else {
      exportToCSV({ title: "Hire Sales Ledger", columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
    }
    toast({ title: "Exported", description: `Hire Sales ${format.toUpperCase()} exported` });
  }, [hsFiltered, isVatAuditor, userRole, getCompanyProfile, toast]);

  const doCopyHS = useCallback(async () => {
    const columns: ExportColumnDef[] = [
      { key: "invoiceNo", label: "Invoice No", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "totalHirePayable", label: "Total Payable", type: "currency" },
      { key: "totalPaid", label: "Total Paid", type: "currency" },
      { key: "outstandingBalance", label: "Outstanding", type: "currency" },
      { key: "cogsTotal", label: "COGS", type: "currency" },
      { key: "currentStatus", label: "Status", type: "text" },
    ];
    const data = hsFiltered.map((h: any) => ({ ...h, customerName: h.customer?.name || "\u2014" }));
    const maskedKeys = getVatMaskedKeys(columns);
    try {
      const result = await copyTableToClipboard({ title: "Hire Sales Ledger", columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
      if (result.success) { toast({ title: "Copied", description: result.message }); } else { toast({ title: "Copy Failed", description: result.message, variant: "destructive" }); }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [hsFiltered, isVatAuditor, toast]);

  const doExportSR = useCallback(async (format: "pdf" | "csv") => {
    const columns: ExportColumnDef[] = [
      { key: "returnNo", label: "Return No", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "grandTotal", label: "Grand Total", type: "currency" },
      { key: "cogsReversal", label: "COGS Reversal", type: "currency" },
      { key: "arAdjustmentPosted", label: "AR Adjusted", type: "text" },
      { key: "status", label: "Status", type: "text" },
    ];
    const data = srFiltered.map((r: any) => ({
      ...r,
      customerName: r.customer?.name || "—",
      arAdjustmentPosted: r.arAdjustmentPosted ? "Yes" : "No",
    }));
    const maskedKeys = getVatMaskedKeys(columns);
    const company = await getCompanyProfile();
    if (format === "pdf") {
      exportToPDF({
        title: "Sales Return Registry",
        columns, data, isVatAuditor, vatMaskedColumns: maskedKeys,
        orientation: "landscape", company,
        financialFooter: { printedBy: (() => { try { const a = JSON.parse(localStorage.getItem("ems_auth") || "{}"); return a.user?.displayName || a.user?.name || "System"; } catch { return "System"; } })() },
        systemNotice: "This is a computer-generated document. Verify with official records.",
      });
    } else {
      exportToCSV({ title: "Sales Return Registry", columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
    }
    toast({ title: "Exported", description: `Sales Returns ${format.toUpperCase()} exported` });
  }, [srFiltered, isVatAuditor, userRole, getCompanyProfile, toast]);

  const doCopySR = useCallback(async () => {
    const columns: ExportColumnDef[] = [
      { key: "returnNo", label: "Return No", type: "text" },
      { key: "date", label: "Date", type: "date" },
      { key: "customerName", label: "Customer", type: "text" },
      { key: "grandTotal", label: "Grand Total", type: "currency" },
      { key: "cogsReversal", label: "COGS Reversal", type: "currency" },
      { key: "arAdjustmentPosted", label: "AR Adjusted", type: "text" },
      { key: "status", label: "Status", type: "text" },
    ];
    const data = srFiltered.map((r: any) => ({
      ...r,
      customerName: r.customer?.name || "\u2014",
      arAdjustmentPosted: r.arAdjustmentPosted ? "Yes" : "No",
    }));
    const maskedKeys = getVatMaskedKeys(columns);
    try {
      const result = await copyTableToClipboard({ title: "Sales Return Registry", columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
      if (result.success) { toast({ title: "Copied", description: result.message }); } else { toast({ title: "Copy Failed", description: result.message, variant: "destructive" }); }
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  }, [srFiltered, isVatAuditor, toast]);

  const doImportCSV = useCallback((apiPath: string, fields: ExportFieldDef[], reloadFn: () => void) => {
    importFromCSV({ apiPath, formFields: fields }).then(result => {
      toast({
        title: "Import Complete",
        description: `Imported: ${result.imported}, Failed: ${result.failed}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      reloadFn();
    }).catch((e: any) => {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    });
  }, [toast]);

  // ============================================================
  // CREDIT LIMIT CHECK HELPER
  // ============================================================
  const getCustomerCreditInfo = useCallback((customerId: string) => {
    const cust = customers.find(c => c.id === customerId);
    if (!cust) return null;
    return {
      name: cust.name,
      creditLimit: cust.creditLimit || 0,
      currentBalance: cust.currentBalance || 0,
      creditStatus: cust.creditStatus || "Active",
    };
  }, [customers]);

  const soCreditWarning = useMemo(() => {
    if (!soForm.customerId) return null;
    const info = getCustomerCreditInfo(soForm.customerId);
    if (!info) return null;
    if (info.creditStatus === "Frozen") return { type: "error" as const, message: `Customer "${info.name}" account is FROZEN. Sales not allowed.` };
    if (info.creditLimit > 0) {
      const projected = info.currentBalance + soComputedTotals.grandTotal;
      if (projected > info.creditLimit) return { type: "warning" as const, message: `Projected balance ${_fmtBDT(projected)} exceeds credit limit ${_fmtBDT(info.creditLimit)}` };
    }
    return null;
  }, [soForm.customerId, soComputedTotals.grandTotal, getCustomerCreditInfo]);

  // ============================================================
  // AUTO-FILL RATE FROM PRODUCT
  // ============================================================
  const handleSoProductSelect = useCallback((idx: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setSoLines(prev => prev.map((l, i) => i === idx ? { ...l, productId, rate: product.salePrice || product.sellingPrice || 0 } : l));
    } else {
      setSoLines(prev => prev.map((l, i) => i === idx ? { ...l, productId } : l));
    }
  }, [products]);

  const handleHsProductSelect = useCallback((idx: number, productId: string) => {
    const product = products.find(p => p.id === productId);
    if (product) {
      setHsLines(prev => prev.map((l, i) => i === idx ? { ...l, productId, rate: product.salePrice || product.sellingPrice || 0 } : l));
    } else {
      setHsLines(prev => prev.map((l, i) => i === idx ? { ...l, productId } : l));
    }
  }, [products]);

  // ============================================================
  // RENDER: SALES ORDERS TAB
  // ============================================================

  const renderSalesOrders = () => {
    if (isDealer) return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="p-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">403 — Access Restricted</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Dealers cannot access Sales Orders.</p>
        </CardContent>
      </Card>
    );

    return (
      <div className="space-y-4">
        {isVatAuditor && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Cost/profit columns are masked</span>
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
          <StatCard label="Total SOs" value={soStats.total} icon={Receipt} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Total Revenue" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(soStats.totalRevenue)} icon={DollarSign} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="Total COGS" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(soStats.totalCOGS)} icon={Calculator} color="text-orange-500" bg="bg-orange-500/10" />
          <StatCard label="Gross Profit" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(soStats.grossProfit)} icon={TrendingUp} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Avg Margin" value={isVatAuditor ? "N/A (Audit Mode)" : fmtPercent(soStats.avgMargin)} icon={BarChart3} color="text-purple-500" bg="bg-purple-500/10" />
          <StatCard label="AR Outstanding" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(soStats.arOutstanding)} icon={Wallet} color="text-red-500" bg="bg-red-500/10" />
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={soSearch} onChange={e => setSoSearch(e.target.value)} placeholder="Search invoice, customer..." className="pl-8" />
          </div>
          <Select value={soStatusFilter} onValueChange={setSoStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Draft">Draft</SelectItem>
              <SelectItem value="Confirmed">Confirmed</SelectItem>
              <SelectItem value="Delivered">Delivered</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={soCustomerFilter} onValueChange={setSoCustomerFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Customer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={soDateFrom} onChange={e => setSoDateFrom(e.target.value)} className="w-[140px]" placeholder="From" />
          <Input type="date" value={soDateTo} onChange={e => setSoDateTo(e.target.value)} className="w-[140px]" placeholder="To" />
          {(isAdmin || isSR) && (
            <Button onClick={openSoCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              <Plus className="h-4 w-4 mr-1" /> Add SO
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => doExportSO("csv")}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportSO("pdf")}><FileDown className="h-4 w-4 mr-1" /> Export PDF</Button>
          <Button variant="outline" size="sm" onClick={doCopySO}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
          <Button variant="outline" size="sm" onClick={loadCOGSDashboard}><BarChart3 className="h-4 w-4 mr-1" /> COGS</Button>
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import CSV</span></Button>
            <input type="file" accept=".csv" className="hidden" onChange={() => doImportCSV("/api/sales-orders", [], loadSalesOrders)} />
          </label>
          <Button variant="ghost" size="sm" onClick={loadSalesOrders}>
            <RefreshCw className={`h-4 w-4 ${soLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* ── Sales Order Table ── */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    <TableHead className="text-white text-xs w-8"></TableHead>
                    <TableHead className="text-white text-xs">Invoice No</TableHead>
                    <TableHead className="text-white text-xs">Date</TableHead>
                    <TableHead className="text-white text-xs">Customer</TableHead>
                    <TableHead className="text-white text-xs">Godown</TableHead>
                    <TableHead className="text-white text-xs text-right">SubTotal</TableHead>
                    <TableHead className="text-white text-xs text-right">Discount</TableHead>
                    <TableHead className="text-white text-xs text-right">VAT</TableHead>
                    <TableHead className="text-white text-xs text-right">Grand Total</TableHead>
                    <TableHead className="text-white text-xs text-right">COGS</TableHead>
                    <TableHead className="text-white text-xs text-right">Gross Profit</TableHead>
                    <TableHead className="text-white text-xs text-right">Margin%</TableHead>
                    <TableHead className="text-white text-xs">AR Posted</TableHead>
                    <TableHead className="text-white text-xs">Status</TableHead>
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soLoading ? (
                    <TableRow><TableCell colSpan={15} className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : soFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={15} className="text-center py-8 text-slate-400">
                      <Receipt className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">No sales orders found</p>
                      <p className="text-xs text-slate-400">Create a new sales order or adjust filters</p>
                    </TableCell></TableRow>
                  ) : soFiltered.map((item: any) => (
                    <React.Fragment key={item.id}>
                      <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => toggleSoExpand(item.id)}>
                        <TableCell className="text-xs">
                          {soExpandedRows.has(item.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{item.invoiceNo || `SO-${String(item.id).padStart(5, "0")}`}</TableCell>
                        <TableCell className="text-xs">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-xs">{item.customer?.name || "—"}</TableCell>
                        <TableCell className="text-xs">{item.godown?.name || "—"}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.subTotal, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.discount, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.vatAmount, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{fmtCurrency(vatMask(item.grandTotal, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.cogsTotal, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.grossProfit, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtPercent(vatMask(item.profitMargin, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs">
                          <Badge className={item.arPosted ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-0 text-xs"}>
                            {item.arPosted ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs"><StatusBadge status={item.status || "Draft"} /></TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-500" title="Print Invoice"><Printer className="h-3 w-3" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={() => handlePrintInvoice(item.id, item.invoiceNo, "invoice")} className="cursor-pointer">
                                  <Receipt className="h-3.5 w-3.5 mr-2" /> Invoice
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrintInvoice(item.id, item.invoiceNo, "mushok63")} className="cursor-pointer">
                                  <FileBarChart className="h-3.5 w-3.5 mr-2" /> Mushok 6.3
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handlePrintInvoice(item.id, item.invoiceNo, "challan")} className="cursor-pointer">
                                  <Package className="h-3.5 w-3.5 mr-2" /> Delivery Challan
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                            {(isAdmin || isSR) && <Button variant="ghost" size="sm" onClick={() => openSoEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>}
                            {isAdmin && <Button variant="ghost" size="sm" onClick={() => setSoDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                      {soExpandedRows.has(item.id) && item.lines?.length > 0 && (
                        <TableRow className="bg-slate-50 dark:bg-slate-900/30">
                          <TableCell colSpan={15} className="p-2">
                            <div className="ml-6 border rounded-lg overflow-x-auto">
                              <Table className="min-w-[600px]">
                                <TableHeader>
                                  <TableRow className="bg-slate-100 dark:bg-slate-800">
                                    <TableHead className="text-xs">#</TableHead>
                                    <TableHead className="text-xs">Product</TableHead>
                                    <TableHead className="text-xs text-right">Qty</TableHead>
                                    <TableHead className="text-xs text-right">Rate</TableHead>
                                    <TableHead className="text-xs text-right">Disc%</TableHead>
                                    <TableHead className="text-xs text-right">Total</TableHead>
                                    <TableHead className="text-xs text-right">Cost Price</TableHead>
                                    <TableHead className="text-xs text-right">COGS</TableHead>
                                    <TableHead className="text-xs text-right">Line Profit</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {item.lines.map((line: any, li: number) => (
                                    <TableRow key={line.id || li}>
                                      <TableCell className="text-xs">{li + 1}</TableCell>
                                      <TableCell className="text-xs">{line.product?.name || "—"}</TableCell>
                                      <TableCell className="text-xs text-right">{line.quantity}</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.rate, isVatAuditor))}</TableCell>
                                      <TableCell className="text-xs text-right">{line.discountPercent || 0}%</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.total, isVatAuditor))}</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.costPrice, isVatAuditor))}</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.cogsAmount, isVatAuditor))}</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.grossProfit, isVatAuditor))}</TableCell>
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
          </CardContent>
        </Card>

        {/* ── Create/Edit Sales Order Dialog ── */}
        <Dialog open={soDialog} onOpenChange={setSoDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{soEdit ? "Edit" : "Create"} Sales Order</DialogTitle>
              <DialogDescription>Fill in sales order details and line items.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Customer <span className="text-red-500">*</span></Label>
                  <Select value={soForm.customerId || ""} onValueChange={v => setSoForm(p => ({ ...p, customerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name} {c.customerCode ? `(${c.customerCode})` : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={soForm.date || ""} onChange={e => setSoForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Godown</Label>
                  <Select value={soForm.godownId || "_none"} onValueChange={v => setSoForm(p => ({ ...p, godownId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Payment Option</Label>
                  <Select value={soForm.paymentOptionId || "_none"} onValueChange={v => setSoForm(p => ({ ...p, paymentOptionId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Payment" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {paymentOptions.map(po => <SelectItem key={po.id} value={po.id}>{po.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">SR (Sales Rep)</Label>
                  <Select value={soForm.srId || "_none"} onValueChange={v => setSoForm(p => ({ ...p, srId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select SR" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {soEdit && (
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <Select value={soForm.status || "Draft"} onValueChange={v => setSoForm(p => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Draft">Draft</SelectItem>
                        <SelectItem value="Confirmed">Confirmed</SelectItem>
                        <SelectItem value="Delivered">Delivered</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                        <SelectItem value="Cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Discount %</Label>
                  <Input type="number" min={0} max={100} step="0.01" value={soForm.discountPercent || 0} onChange={e => setSoForm(p => ({ ...p, discountPercent: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">VAT %</Label>
                  <Input type="number" min={0} max={100} step="0.01" value={soForm.vatPercentage || 0} onChange={e => setSoForm(p => ({ ...p, vatPercentage: Number(e.target.value) }))} />
                </div>
              </div>
              <div>
                <Label className="text-sm font-medium">Notes</Label>
                <Textarea value={soForm.notes || ""} onChange={e => setSoForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
              </div>

              {/* ── Credit Limit Warning ── */}
              {soCreditWarning && (
                <div className={`rounded-lg p-3 flex items-center gap-2 ${soCreditWarning.type === "error" ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" : "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"}`}>
                  <AlertTriangle className={`h-4 w-4 ${soCreditWarning.type === "error" ? "text-red-600" : "text-amber-600"}`} />
                  <span className={`text-sm font-medium ${soCreditWarning.type === "error" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>{soCreditWarning.message}</span>
                </div>
              )}

              {/* ── Line Items ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-900 dark:text-white">Line Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSoLines(prev => [...prev, { productId: "", quantity: 1, rate: 0, discountPercent: 0 }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Line
                  </Button>
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                        <TableHead className="text-white text-xs">#</TableHead>
                        <TableHead className="text-white text-xs">Product</TableHead>
                        <TableHead className="text-white text-xs">Qty</TableHead>
                        <TableHead className="text-white text-xs">Rate</TableHead>
                        <TableHead className="text-white text-xs">Disc%</TableHead>
                        <TableHead className="text-white text-xs text-right">Total</TableHead>
                        <TableHead className="text-white text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {soLines.map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{idx + 1}</TableCell>
                          <TableCell>
                            <Select value={line.productId || ""} onValueChange={v => handleSoProductSelect(idx, v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
                              <SelectContent>
                                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.productCode} - {p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Input type="number" min={1} value={line.quantity || 1} onChange={e => setSoLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Number(e.target.value) } : l))} className="h-8 w-20 text-xs" /></TableCell>
                          <TableCell><Input type="number" min={0} step="0.01" value={line.rate || 0} onChange={e => setSoLines(prev => prev.map((l, i) => i === idx ? { ...l, rate: Number(e.target.value) } : l))} className="h-8 w-24 text-xs" /></TableCell>
                          <TableCell><Input type="number" min={0} max={100} step="0.01" value={line.discountPercent || 0} onChange={e => setSoLines(prev => prev.map((l, i) => i === idx ? { ...l, discountPercent: Number(e.target.value) } : l))} className="h-8 w-20 text-xs" /></TableCell>
                          <TableCell className="text-xs font-medium text-right">{fmtCurrency(soLineTotal(line))}</TableCell>
                          <TableCell>
                            {soLines.length > 1 && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => setSoLines(prev => prev.filter((_, i) => i !== idx))} className="h-6 w-6 p-0 text-red-500 hover:text-red-700">
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

              {/* ── Computed Totals ── */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm"><span>SubTotal:</span><span className="font-medium">{fmtCurrency(soComputedTotals.subTotal)}</span></div>
                <div className="flex justify-between text-sm"><span>Discount ({soForm.discountPercent || 0}%):</span><span className="font-medium">-{fmtCurrency(soComputedTotals.discountAmt)}</span></div>
                <div className="flex justify-between text-sm"><span>VAT ({soForm.vatPercentage || 0}%):</span><span className="font-medium">{fmtCurrency(soComputedTotals.vatAmt)}</span></div>
                <Separator />
                <div className="flex justify-between text-sm font-bold"><span>Grand Total:</span><span className="text-[#2563eb]">{fmtCurrency(soComputedTotals.grandTotal)}</span></div>
              </div>
            </div>
            <DialogFooter>
              <div className="flex items-center gap-6 mr-auto">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="soSendSms"
                    checked={soSendSms}
                    onCheckedChange={(checked) => setSoSendSms(checked === true)}
                  />
                  <Label htmlFor="soSendSms" className="text-sm flex items-center gap-1 cursor-pointer">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Send SMS to Customer
                  </Label>
                </div>
              </div>
              <Button variant="outline" onClick={() => setSoDialog(false)}>Cancel</Button>
              <Button onClick={saveSo} disabled={soSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {soSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirmation Dialog ── */}
        <Dialog open={!!soDelete} onOpenChange={() => setSoDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Sales Order</DialogTitle>
              <DialogDescription>Are you sure? This will reverse stock entries and AR adjustments. This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSoDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteSo}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── COGS Dashboard Dialog ── */}
        <Dialog open={soCogsDialog} onOpenChange={setSoCogsDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>COGS Dashboard — Profitability Analysis</DialogTitle>
              <DialogDescription>Cost of Goods Sold breakdown and margin analysis</DialogDescription>
            </DialogHeader>
            {soCogsLoading ? (
              <div className="flex items-center justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-[#2563eb]" /></div>
            ) : soCogsData ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                  <StatCard label="Total COGS" value={fmtCurrency(vatMask(soCogsData.totalCOGS, isVatAuditor))} icon={Calculator} color="text-orange-500" bg="bg-orange-500/10" />
                  <StatCard label="Total Revenue" value={fmtCurrency(vatMask(soCogsData.totalRevenue, isVatAuditor))} icon={DollarSign} color="text-emerald-500" bg="bg-emerald-500/10" />
                  <StatCard label="Gross Profit" value={fmtCurrency(vatMask(soCogsData.totalGrossProfit, isVatAuditor))} icon={TrendingUp} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
                  <StatCard label="Avg Margin" value={fmtPercent(vatMask(soCogsData.averageMargin, isVatAuditor))} icon={BarChart3} color="text-purple-500" bg="bg-purple-500/10" />
                </div>
                <div className="border rounded-lg overflow-x-auto max-h-96 overflow-y-auto">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                        <TableHead className="text-white text-xs">Product</TableHead>
                        <TableHead className="text-white text-xs text-right">Qty Sold</TableHead>
                        <TableHead className="text-white text-xs text-right">Revenue</TableHead>
                        <TableHead className="text-white text-xs text-right">COGS</TableHead>
                        <TableHead className="text-white text-xs text-right">Profit</TableHead>
                        <TableHead className="text-white text-xs text-right">Margin%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(soCogsData.breakdown || []).length === 0 ? (
                        <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-400">No COGS data available</TableCell></TableRow>
                      ) : soCogsData.breakdown.map((b: any, i: number) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs">{b.productName || "—"}</TableCell>
                          <TableCell className="text-xs text-right">{b.totalQtySold || 0}</TableCell>
                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(b.totalRevenue, isVatAuditor))}</TableCell>
                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(b.totalCOGS, isVatAuditor))}</TableCell>
                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(b.grossProfit, isVatAuditor))}</TableCell>
                          <TableCell className="text-xs text-right">{fmtPercent(vatMask(b.margin, isVatAuditor))}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">No data available</div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // RENDER: HIRE SALES TAB
  // ============================================================

  const renderHireSales = () => {
    if (isDealer) return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="p-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">403 — Access Restricted</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Dealers cannot access Hire Sales.</p>
        </CardContent>
      </Card>
    );

    return (
      <div className="space-y-4">
        {isVatAuditor && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Cost/profit columns are masked</span>
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
          <StatCard label="Active Accounts" value={hsStats.activeAccounts} icon={Users} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Total Hire Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(hsStats.totalHireValue)} icon={BadgeDollarSign} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="Total Collected" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(hsStats.totalCollected)} icon={HandCoins} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Outstanding" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(hsStats.outstandingBalance)} icon={Wallet} color="text-red-500" bg="bg-red-500/10" />
          <StatCard label="Overdue Installments" value={hsStats.overdueInstallments} icon={AlertTriangle} color="text-amber-500" bg="bg-amber-500/10" />
          <StatCard label="Total Penalties" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(hsStats.totalPenalties)} icon={FileWarning} color="text-red-500" bg="bg-red-500/10" />
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={hsSearch} onChange={e => setHsSearch(e.target.value)} placeholder="Search invoice, customer..." className="pl-8" />
          </div>
          <Select value={hsStatusFilter} onValueChange={setHsStatusFilter}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
              <SelectItem value="Defaulted">Defaulted</SelectItem>
              <SelectItem value="Cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
          <Select value={hsCustomerFilter} onValueChange={setHsCustomerFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Customer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {(isAdmin || isSR) && (
            <Button onClick={openHsCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              <Plus className="h-4 w-4 mr-1" /> Add Hire Sale
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => doExportHS("csv")}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportHS("pdf")}><FileDown className="h-4 w-4 mr-1" /> Export PDF</Button>
          <Button variant="outline" size="sm" onClick={doCopyHS}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
          {(isAdmin) && <label className="cursor-pointer"><Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import CSV</span></Button><input type="file" accept=".csv" className="hidden" onChange={() => doImportCSV("/api/hire-sales", [], loadHireSales)} /></label>}
          <Button variant="ghost" size="sm" onClick={loadHireSales}>
            <RefreshCw className={`h-4 w-4 ${hsLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* ── Hire Sales Table ── */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    <TableHead className="text-white text-xs w-8"></TableHead>
                    <TableHead className="text-white text-xs">Invoice No</TableHead>
                    <TableHead className="text-white text-xs">Date</TableHead>
                    <TableHead className="text-white text-xs">Customer</TableHead>
                    <TableHead className="text-white text-xs text-right">SubTotal</TableHead>
                    <TableHead className="text-white text-xs text-right">Down Payment</TableHead>
                    <TableHead className="text-white text-xs text-right">Duration</TableHead>
                    <TableHead className="text-white text-xs text-right">Hire Rate%</TableHead>
                    <TableHead className="text-white text-xs text-right">Total Interest</TableHead>
                    <TableHead className="text-white text-xs text-right">Total Payable</TableHead>
                    <TableHead className="text-white text-xs text-right">Total Paid</TableHead>
                    <TableHead className="text-white text-xs text-right">Outstanding</TableHead>
                    <TableHead className="text-white text-xs text-right">COGS</TableHead>
                    <TableHead className="text-white text-xs">Status</TableHead>
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hsLoading ? (
                    <TableRow><TableCell colSpan={15} className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : hsFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={15} className="text-center py-8 text-slate-400">
                      <DollarSign className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">No hire sales found</p>
                      <p className="text-xs text-slate-400">Create a new hire sale or adjust filters</p>
                    </TableCell></TableRow>
                  ) : hsFiltered.map((item: any) => (
                    <React.Fragment key={item.id}>
                      <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => toggleHsExpand(item.id)}>
                        <TableCell className="text-xs">
                          {hsExpandedRows.has(item.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{item.invoiceNo || `HIR-${String(item.id).padStart(5, "0")}`}</TableCell>
                        <TableCell className="text-xs">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-xs">{item.customer?.name || "—"}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.subTotal, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.downPayment, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{item.duration || 0} mo</TableCell>
                        <TableCell className="text-xs text-right">{item.hireRate || 0}%</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.totalInterestAmount, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{fmtCurrency(vatMask(item.totalHirePayable, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.totalPaid, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.outstandingBalance, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.cogsTotal, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs"><StatusBadge status={item.currentStatus || item.status || "Active"} /></TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {(isAdmin || isSR) && <Button variant="ghost" size="sm" onClick={() => openHsEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>}
                            {isAdmin && <Button variant="ghost" size="sm" onClick={() => setHsDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                      {hsExpandedRows.has(item.id) && (
                        <TableRow className="bg-slate-50 dark:bg-slate-900/30">
                          <TableCell colSpan={15} className="p-2">
                            <div className="ml-6 space-y-3">
                              {/* ── Line Items ── */}
                              {item.lines?.length > 0 && (
                                <div className="border rounded-lg overflow-x-auto">
                                  <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-xs font-semibold">Line Items</div>
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-slate-100 dark:bg-slate-800">
                                        <TableHead className="text-xs">#</TableHead>
                                        <TableHead className="text-xs">Product</TableHead>
                                        <TableHead className="text-xs text-right">Qty</TableHead>
                                        <TableHead className="text-xs text-right">Rate</TableHead>
                                        <TableHead className="text-xs text-right">Disc%</TableHead>
                                        <TableHead className="text-xs text-right">Total</TableHead>
                                        <TableHead className="text-xs text-right">Cost Price</TableHead>
                                        <TableHead className="text-xs text-right">COGS</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {item.lines.map((line: any, li: number) => (
                                        <TableRow key={line.id || li}>
                                          <TableCell className="text-xs">{li + 1}</TableCell>
                                          <TableCell className="text-xs">{line.product?.name || "—"}</TableCell>
                                          <TableCell className="text-xs text-right">{line.quantity}</TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.rate, isVatAuditor))}</TableCell>
                                          <TableCell className="text-xs text-right">{line.discountPercent || 0}%</TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.total, isVatAuditor))}</TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.costPrice, isVatAuditor))}</TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.cogsAmount, isVatAuditor))}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
                              {/* ── Installment Schedule ── */}
                              {item.installments?.length > 0 && (
                                <div className="border rounded-lg overflow-x-auto">
                                  <div className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-xs font-semibold">Installment Schedule</div>
                                  <Table>
                                    <TableHeader>
                                      <TableRow className="bg-slate-100 dark:bg-slate-800">
                                        <TableHead className="text-xs">#</TableHead>
                                        <TableHead className="text-xs">Due Date</TableHead>
                                        <TableHead className="text-xs text-right">Principal</TableHead>
                                        <TableHead className="text-xs text-right">Interest</TableHead>
                                        <TableHead className="text-xs text-right">Amount</TableHead>
                                        <TableHead className="text-xs text-right">Paid</TableHead>
                                        <TableHead className="text-xs">Status</TableHead>
                                        <TableHead className="text-xs text-right">Penalty</TableHead>
                                        <TableHead className="text-xs">Actions</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {item.installments.map((inst: any, ii: number) => (
                                        <TableRow key={inst.id || ii} className={inst.status === "Overdue" ? "bg-red-50 dark:bg-red-900/10" : ""}>
                                          <TableCell className="text-xs">{inst.installmentNo || ii + 1}</TableCell>
                                          <TableCell className="text-xs">{fmtDate(inst.dueDate)}</TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(inst.principalAmount, isVatAuditor))}</TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(inst.interestAmount, isVatAuditor))}</TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(inst.amount, isVatAuditor))}</TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(inst.paidAmount, isVatAuditor))}</TableCell>
                                          <TableCell className="text-xs"><StatusBadge status={inst.status || "Pending"} /></TableCell>
                                          <TableCell className="text-xs text-right">{fmtCurrency(vatMask(inst.penaltyAmount, isVatAuditor))}</TableCell>
                                          <TableCell>
                                            {inst.status !== "Paid" && inst.status !== "WrittenOff" && (isAdmin || isSR) && (
                                              <Button variant="outline" size="sm" className="h-6 text-xs bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100" onClick={() => openPayInstallment(item.id, inst)}>
                                                <HandCoins className="h-3 w-3 mr-1" /> Pay
                                              </Button>
                                            )}
                                          </TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              )}
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

        {/* ── Create/Edit Hire Sale Dialog ── */}
        <Dialog open={hsDialog} onOpenChange={setHsDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{hsEdit ? "Edit" : "Create"} Hire Sale</DialogTitle>
              <DialogDescription>Fill in hire sale details with installment configuration.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">Customer <span className="text-red-500">*</span></Label>
                  <Select value={hsForm.customerId || ""} onValueChange={v => setHsForm(p => ({ ...p, customerId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                    <SelectContent>
                      {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={hsForm.date || ""} onChange={e => setHsForm(p => ({ ...p, date: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Godown</Label>
                  <Select value={hsForm.godownId || "_none"} onValueChange={v => setHsForm(p => ({ ...p, godownId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
                <div>
                  <Label className="text-sm font-medium">Down Payment</Label>
                  <Input type="number" min={0} step="0.01" value={hsForm.downPayment || 0} onChange={e => setHsForm(p => ({ ...p, downPayment: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Hire Rate % (Annual)</Label>
                  <Input type="number" min={0} step="0.01" value={hsForm.hireRate || 0} onChange={e => setHsForm(p => ({ ...p, hireRate: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Duration (Months)</Label>
                  <Input type="number" min={1} value={hsForm.duration || 12} onChange={e => setHsForm(p => ({ ...p, duration: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Penalty Rate % (per day)</Label>
                  <Input type="number" min={0} step="0.01" value={hsForm.penaltyRate || 0} onChange={e => setHsForm(p => ({ ...p, penaltyRate: Number(e.target.value) }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">VAT %</Label>
                  <Input type="number" min={0} max={100} step="0.01" value={hsForm.vatPercentage || 0} onChange={e => setHsForm(p => ({ ...p, vatPercentage: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Notes</Label>
                  <Input value={hsForm.notes || ""} onChange={e => setHsForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes" />
                </div>
              </div>

              {/* ── Line Items ── */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-semibold text-slate-900 dark:text-white">Line Items</Label>
                  <Button type="button" variant="outline" size="sm" onClick={() => setHsLines(prev => [...prev, { productId: "", quantity: 1, rate: 0, discountPercent: 0 }])}>
                    <Plus className="h-3 w-3 mr-1" /> Add Line
                  </Button>
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                        <TableHead className="text-white text-xs">#</TableHead>
                        <TableHead className="text-white text-xs">Product</TableHead>
                        <TableHead className="text-white text-xs">Qty</TableHead>
                        <TableHead className="text-white text-xs">Rate</TableHead>
                        <TableHead className="text-white text-xs">Disc%</TableHead>
                        <TableHead className="text-white text-xs text-right">Total</TableHead>
                        <TableHead className="text-white text-xs w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {hsLines.map((line, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="text-xs">{idx + 1}</TableCell>
                          <TableCell>
                            <Select value={line.productId || ""} onValueChange={v => handleHsProductSelect(idx, v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Product" /></SelectTrigger>
                              <SelectContent>
                                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.productCode} - {p.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell><Input type="number" min={1} value={line.quantity || 1} onChange={e => setHsLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: Number(e.target.value) } : l))} className="h-8 w-20 text-xs" /></TableCell>
                          <TableCell><Input type="number" min={0} step="0.01" value={line.rate || 0} onChange={e => setHsLines(prev => prev.map((l, i) => i === idx ? { ...l, rate: Number(e.target.value) } : l))} className="h-8 w-24 text-xs" /></TableCell>
                          <TableCell><Input type="number" min={0} max={100} step="0.01" value={line.discountPercent || 0} onChange={e => setHsLines(prev => prev.map((l, i) => i === idx ? { ...l, discountPercent: Number(e.target.value) } : l))} className="h-8 w-20 text-xs" /></TableCell>
                          <TableCell className="text-xs font-medium text-right">{fmtCurrency(hsLineTotal(line))}</TableCell>
                          <TableCell>
                            {hsLines.length > 1 && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => setHsLines(prev => prev.filter((_, i) => i !== idx))} className="h-6 w-6 p-0 text-red-500 hover:text-red-700">
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

              {/* ── Computed Totals ── */}
              <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm"><span>SubTotal:</span><span className="font-medium">{fmtCurrency(hsComputedTotals.subTotal)}</span></div>
                <div className="flex justify-between text-sm"><span>Down Payment:</span><span className="font-medium">{fmtCurrency(hsComputedTotals.dp)}</span></div>
                <div className="flex justify-between text-sm"><span>Balance Amount:</span><span className="font-medium">{fmtCurrency(hsComputedTotals.balanceAmount)}</span></div>
                <div className="flex justify-between text-sm"><span>VAT ({hsForm.vatPercentage || 0}%):</span><span className="font-medium">{fmtCurrency(hsComputedTotals.vatAmt)}</span></div>
                <Separator />
                <div className="flex justify-between text-sm"><span>Total Interest ({hsForm.hireRate || 0}% × {hsForm.duration || 12}/12):</span><span className="font-medium text-amber-600">{fmtCurrency(hsComputedTotals.totalInterest)}</span></div>
                <div className="flex justify-between text-sm font-bold"><span>Total Payable:</span><span className="text-[#2563eb]">{fmtCurrency(hsComputedTotals.totalPayable)}</span></div>
                <div className="flex justify-between text-sm"><span>Monthly Installment:</span><span className="font-medium">{fmtCurrency(hsComputedTotals.installmentAmt)}</span></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHsDialog(false)}>Cancel</Button>
              <Button onClick={saveHs} disabled={hsSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {hsSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirmation Dialog ── */}
        <Dialog open={!!hsDelete} onOpenChange={() => setHsDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Hire Sale</DialogTitle>
              <DialogDescription>Are you sure? This will reverse stock entries and AR adjustments. This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setHsDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteHs}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Installment Payment Dialog ── */}
        <Dialog open={hsPayDialog} onOpenChange={setHsPayDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Pay Installment</DialogTitle>
              <DialogDescription>Record payment for installment #{hsPayInstallment?.installmentNo || "—"}</DialogDescription>
            </DialogHeader>
            {hsPayInstallment && (
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3 space-y-1 text-sm">
                  <div className="flex justify-between"><span>Installment #:</span><span className="font-medium">{hsPayInstallment.installmentNo}</span></div>
                  <div className="flex justify-between"><span>Due Date:</span><span className="font-medium">{fmtDate(hsPayInstallment.dueDate)}</span></div>
                  <div className="flex justify-between"><span>Amount Due:</span><span className="font-medium">{fmtCurrency(hsPayInstallment.amount)}</span></div>
                  <div className="flex justify-between"><span>Principal:</span><span className="font-medium">{fmtCurrency(hsPayInstallment.principalAmount)}</span></div>
                  <div className="flex justify-between"><span>Interest:</span><span className="font-medium">{fmtCurrency(hsPayInstallment.interestAmount)}</span></div>
                  {hsPayInstallment.overdueDays > 0 && (
                    <div className="flex justify-between text-red-600"><span>Overdue Days:</span><span className="font-medium">{hsPayInstallment.overdueDays} days</span></div>
                  )}
                  {hsPayInstallment.penaltyAmount > 0 && (
                    <div className="flex justify-between text-red-600"><span>Penalty:</span><span className="font-medium">{fmtCurrency(hsPayInstallment.penaltyAmount)}</span></div>
                  )}
                </div>
                <div>
                  <Label className="text-sm font-medium">Paid Amount <span className="text-red-500">*</span></Label>
                  <Input type="number" min={0} step="0.01" value={hsPayForm.paidAmount || 0} onChange={e => setHsPayForm(p => ({ ...p, paidAmount: Number(e.target.value) }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Paid Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={hsPayForm.paidDate || ""} onChange={e => setHsPayForm(p => ({ ...p, paidDate: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-sm font-medium">Payment Reference</Label>
                  <Input value={hsPayForm.paymentRef || ""} onChange={e => setHsPayForm(p => ({ ...p, paymentRef: e.target.value }))} placeholder="Receipt #" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Notes</Label>
                  <Textarea value={hsPayForm.notes || ""} onChange={e => setHsPayForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setHsPayDialog(false)}>Cancel</Button>
              <Button onClick={savePayInstallment} disabled={hsPaySaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {hsPaySaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : "Record Payment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  };

  // ============================================================
  // RENDER: SALES RETURNS TAB
  // ============================================================

  const renderSalesReturns = () => {
    if (isDealer) return (
      <Card className="border-red-200 dark:border-red-800">
        <CardContent className="p-12 text-center">
          <Shield className="h-12 w-12 mx-auto text-red-400 mb-4" />
          <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">403 — Access Restricted</h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Dealers cannot access Sales Returns.</p>
        </CardContent>
      </Card>
    );

    return (
      <div className="space-y-4">
        {isVatAuditor && (
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-600" />
            <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Cost/profit columns are masked</span>
          </div>
        )}

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
          <StatCard label="Total Returns" value={srStats.total} icon={RotateCcw} color="text-[#2563eb]" bg="bg-[#2563eb]/10" />
          <StatCard label="Return Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(srStats.returnValue)} icon={DollarSign} color="text-red-500" bg="bg-red-500/10" />
          <StatCard label="COGS Reversal" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(srStats.cogsReversal)} icon={Calculator} color="text-orange-500" bg="bg-orange-500/10" />
          <StatCard label="AR Adjusted" value={srStats.arAdjusted} icon={ClipboardCheck} color="text-emerald-500" bg="bg-emerald-500/10" />
          <StatCard label="Pending Approval" value={srStats.pendingApproval} icon={Clock} color="text-amber-500" bg="bg-amber-500/10" />
        </div>

        {/* ── Filter Bar ── */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <Input value={srSearch} onChange={e => setSrSearch(e.target.value)} placeholder="Search return no, customer..." className="pl-8" />
          </div>
          <Select value={srStatusFilter} onValueChange={setSrStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Pending">Pending</SelectItem>
              <SelectItem value="Approved">Approved</SelectItem>
              <SelectItem value="Rejected">Rejected</SelectItem>
              <SelectItem value="Completed">Completed</SelectItem>
            </SelectContent>
          </Select>
          <Select value={srCustomerFilter} onValueChange={setSrCustomerFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Customer" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Customers</SelectItem>
              {customers.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={srDateFrom} onChange={e => setSrDateFrom(e.target.value)} className="w-[140px]" />
          <Input type="date" value={srDateTo} onChange={e => setSrDateTo(e.target.value)} className="w-[140px]" />
          {(isAdmin || isSR) && (
            <Button onClick={openSrCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              <Plus className="h-4 w-4 mr-1" /> Add Return
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => doExportSR("csv")}><Download className="h-4 w-4 mr-1" /> Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => doExportSR("pdf")}><FileDown className="h-4 w-4 mr-1" /> Export PDF</Button>
          <Button variant="outline" size="sm" onClick={doCopySR}><Copy className="h-4 w-4 mr-1" /> Copy</Button>
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" asChild><span><Upload className="h-4 w-4 mr-1" /> Import CSV</span></Button>
            <input type="file" accept=".csv" className="hidden" onChange={() => doImportCSV("/api/sales-returns", [], loadSalesReturns)} />
          </label>
          <Button variant="ghost" size="sm" onClick={loadSalesReturns}>
            <RefreshCw className={`h-4 w-4 ${srLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {/* ── Sales Return Table ── */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                    <TableHead className="text-white text-xs w-8"></TableHead>
                    <TableHead className="text-white text-xs">Return No</TableHead>
                    <TableHead className="text-white text-xs">Date</TableHead>
                    <TableHead className="text-white text-xs">Sales Order</TableHead>
                    <TableHead className="text-white text-xs">Customer</TableHead>
                    <TableHead className="text-white text-xs text-right">SubTotal</TableHead>
                    <TableHead className="text-white text-xs text-right">Discount</TableHead>
                    <TableHead className="text-white text-xs text-right">VAT</TableHead>
                    <TableHead className="text-white text-xs text-right">Grand Total</TableHead>
                    <TableHead className="text-white text-xs text-right">COGS Reversal</TableHead>
                    <TableHead className="text-white text-xs">AR Adjusted</TableHead>
                    <TableHead className="text-white text-xs">Status</TableHead>
                    <TableHead className="text-white text-xs">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {srLoading ? (
                    <TableRow><TableCell colSpan={13} className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : srFiltered.length === 0 ? (
                    <TableRow><TableCell colSpan={13} className="text-center py-8 text-slate-400">
                      <RotateCcw className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">No sales returns found</p>
                      <p className="text-xs text-slate-400">Create a new return or adjust filters</p>
                    </TableCell></TableRow>
                  ) : srFiltered.map((item: any) => (
                    <React.Fragment key={item.id}>
                      <TableRow className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => toggleSrExpand(item.id)}>
                        <TableCell className="text-xs">
                          {srExpandedRows.has(item.id) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </TableCell>
                        <TableCell className="text-xs font-medium">{item.returnNo || `SRT-${String(item.id).padStart(5, "0")}`}</TableCell>
                        <TableCell className="text-xs">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-xs">{item.salesOrder?.invoiceNo || "—"}</TableCell>
                        <TableCell className="text-xs">{item.customer?.name || "—"}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.subTotal, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.discount, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.vatAmount, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right font-medium">{fmtCurrency(vatMask(item.grandTotal, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs text-right">{fmtCurrency(vatMask(item.cogsReversal, isVatAuditor))}</TableCell>
                        <TableCell className="text-xs">
                          <Badge className={item.arAdjustmentPosted ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-0 text-xs"}>
                            {item.arAdjustmentPosted ? "Yes" : "No"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs"><StatusBadge status={item.status || "Pending"} /></TableCell>
                        <TableCell>
                          <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                            {(isAdmin || isSR) && <Button variant="ghost" size="sm" onClick={() => openSrEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3 w-3" /></Button>}
                            {isAdmin && <Button variant="ghost" size="sm" onClick={() => setSrDelete(item)} className="h-7 w-7 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                      {srExpandedRows.has(item.id) && item.lines?.length > 0 && (
                        <TableRow className="bg-slate-50 dark:bg-slate-900/30">
                          <TableCell colSpan={13} className="p-2">
                            <div className="ml-6 border rounded-lg overflow-x-auto">
                              <Table className="min-w-[600px]">
                                <TableHeader>
                                  <TableRow className="bg-slate-100 dark:bg-slate-800">
                                    <TableHead className="text-xs">#</TableHead>
                                    <TableHead className="text-xs">Product</TableHead>
                                    <TableHead className="text-xs text-right">Qty</TableHead>
                                    <TableHead className="text-xs text-right">Rate</TableHead>
                                    <TableHead className="text-xs text-right">Disc%</TableHead>
                                    <TableHead className="text-xs text-right">Total</TableHead>
                                    <TableHead className="text-xs text-right">Cost Price</TableHead>
                                    <TableHead className="text-xs text-right">COGS Reversal</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {item.lines.map((line: any, li: number) => (
                                    <TableRow key={line.id || li}>
                                      <TableCell className="text-xs">{li + 1}</TableCell>
                                      <TableCell className="text-xs">{line.product?.name || "—"}</TableCell>
                                      <TableCell className="text-xs text-right">{line.quantity}</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.rate, isVatAuditor))}</TableCell>
                                      <TableCell className="text-xs text-right">{line.discountPercent || 0}%</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.total, isVatAuditor))}</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.costPrice, isVatAuditor))}</TableCell>
                                      <TableCell className="text-xs text-right">{fmtCurrency(vatMask(line.cogsReversal, isVatAuditor))}</TableCell>
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
          </CardContent>
        </Card>

        {/* ── Create/Edit Sales Return Dialog ── */}
        <Dialog open={srDialog} onOpenChange={setSrDialog}>
          <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{srEdit ? "Edit" : "Create"} Sales Return</DialogTitle>
              <DialogDescription>{srEdit ? "Edit" : "Create a"} sales return {srEdit ? "" : "against a sales order"}.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {!srEdit && (
                  <div>
                    <Label className="text-sm font-medium">Sales Order <span className="text-red-500">*</span></Label>
                    <Select value={srForm.salesOrderId || ""} onValueChange={v => handleSrOrderChange(v)}>
                      <SelectTrigger><SelectValue placeholder="Select Sales Order" /></SelectTrigger>
                      <SelectContent>
                        {salesOrdersForReturn.map(o => <SelectItem key={o.id} value={o.id}>{o.invoiceNo} — {o.customer?.name || "—"}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <Label className="text-sm font-medium">Customer</Label>
                  <Input value={customers.find(c => c.id === srForm.customerId)?.name || "—"} disabled className="bg-slate-50" />
                </div>
                <div>
                  <Label className="text-sm font-medium">Date <span className="text-red-500">*</span></Label>
                  <Input type="date" value={srForm.date || ""} onChange={e => setSrForm(p => ({ ...p, date: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm font-medium">Godown</Label>
                  <Select value={srForm.godownId || "_none"} onValueChange={v => setSrForm(p => ({ ...p, godownId: v === "_none" ? "" : v }))}>
                    <SelectTrigger><SelectValue placeholder="Select Godown" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">None</SelectItem>
                      {godowns.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {srEdit && (
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <Select value={srForm.status || "Pending"} onValueChange={v => setSrForm(p => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                        <SelectItem value="Completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div>
                <Label className="text-sm font-medium">Reason</Label>
                <Textarea value={srForm.reason || ""} onChange={e => setSrForm(p => ({ ...p, reason: e.target.value }))} rows={2} placeholder="Reason for return" />
              </div>

              {/* ── Return Line Items ── */}
              {srLines.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold text-slate-900 dark:text-white">Return Items (edit quantity to return)</Label>
                  <div className="overflow-x-auto border rounded-lg">
                    <Table className="min-w-[600px]">
                      <TableHeader>
                        <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                          <TableHead className="text-white text-xs">#</TableHead>
                          <TableHead className="text-white text-xs">Product</TableHead>
                          <TableHead className="text-white text-xs text-right">Order Qty</TableHead>
                          <TableHead className="text-white text-xs text-right">Return Qty</TableHead>
                          <TableHead className="text-white text-xs text-right">Rate</TableHead>
                          <TableHead className="text-white text-xs text-right">Disc%</TableHead>
                          <TableHead className="text-white text-xs text-right">Total</TableHead>
                          <TableHead className="text-white text-xs text-right">COGS Reversal</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {srLines.map((line, idx) => {
                          const lineTotal = Number(line.quantity) * Number(line.rate) * (1 - Number(line.discountPercent) / 100);
                          const cogsReversal = Number(line.quantity) * Number(line.costPrice);
                          return (
                            <TableRow key={idx}>
                              <TableCell className="text-xs">{idx + 1}</TableCell>
                              <TableCell className="text-xs">{products.find(p => p.id === line.productId)?.name || "—"}</TableCell>
                              <TableCell className="text-xs text-right">{line.maxQuantity || line.quantity}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  max={line.maxQuantity || line.quantity}
                                  value={line.quantity || 0}
                                  onChange={e => {
                                    const val = Math.min(Number(e.target.value), line.maxQuantity || line.quantity);
                                    setSrLines(prev => prev.map((l, i) => i === idx ? { ...l, quantity: val } : l));
                                  }}
                                  className="h-8 w-20 text-xs"
                                />
                              </TableCell>
                              <TableCell className="text-xs text-right">{fmtCurrency(line.rate)}</TableCell>
                              <TableCell className="text-xs text-right">{line.discountPercent || 0}%</TableCell>
                              <TableCell className="text-xs text-right font-medium">{fmtCurrency(lineTotal)}</TableCell>
                              <TableCell className="text-xs text-right">{fmtCurrency(cogsReversal)}</TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}

              {/* ── Computed Totals ── */}
              {srLines.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm"><span>SubTotal:</span><span className="font-medium">{fmtCurrency(srComputedTotals.subTotal)}</span></div>
                  <div className="flex justify-between text-sm"><span>COGS Reversal:</span><span className="font-medium text-orange-600">{fmtCurrency(srComputedTotals.cogsReversal)}</span></div>
                  <Separator />
                  <div className="flex justify-between text-sm font-bold"><span>Grand Total:</span><span className="text-[#2563eb]">{fmtCurrency(srComputedTotals.grandTotal)}</span></div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSrDialog(false)}>Cancel</Button>
              <Button onClick={saveSr} disabled={srSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {srSaving ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete Confirmation Dialog ── */}
        <Dialog open={!!srDelete} onOpenChange={() => setSrDelete(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Sales Return</DialogTitle>
              <DialogDescription>Are you sure? This will reverse stock entries and AR adjustments. This action cannot be undone.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSrDelete(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteSr}>Delete</Button>
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
    <div className="page-enter flex flex-col bg-white dark:bg-slate-900">
      <div className="flex-1">
        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 dark:from-blue-700 dark:to-blue-800 p-4 sm:p-6">
          <div className="max-w-[1400px] mx-auto">
            <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
              <Receipt className="h-6 w-6 text-[#2563eb]" />
              Core Sales Module
            </h1>
            <p className="text-slate-400 text-sm mt-1">Sales Orders, Hire Sales & Installments, Sales Returns</p>
          </div>
        </div>

        {/* ── Tab Navigation ── */}
        <div className="max-w-[1400px] mx-auto p-4 sm:p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="bg-[#132240] dark:bg-[#0a1628] flex h-auto overflow-x-auto scrollbar-none gap-1 p-1 w-full">
              <TabsTrigger value="sales-orders" className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-slate-300 whitespace-nowrap flex-shrink-0">
                <Receipt className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Sales Orders</span>
                <span className="sm:hidden">Orders</span>
              </TabsTrigger>
              <TabsTrigger value="hire-sales" className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-slate-300 whitespace-nowrap flex-shrink-0">
                <DollarSign className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Hire Sales</span>
                <span className="sm:hidden">Hire</span>
              </TabsTrigger>
              <TabsTrigger value="sales-returns" className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-slate-300 whitespace-nowrap flex-shrink-0">
                <RotateCcw className="h-4 w-4 mr-1 sm:mr-2" />
                <span className="hidden sm:inline">Sales Returns</span>
                <span className="sm:hidden">Returns</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sales-orders" className="mt-4">
              {renderSalesOrders()}
            </TabsContent>
            <TabsContent value="hire-sales" className="mt-4">
              {renderHireSales()}
            </TabsContent>
            <TabsContent value="sales-returns" className="mt-4">
              {renderSalesReturns()}
            </TabsContent>
          </Tabs>
        </div>
      </div>

    </div>
  );
}
