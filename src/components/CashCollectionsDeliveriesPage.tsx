"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  DollarSign, Lock, Plus, Edit, Trash2, Download,
  Upload, RefreshCw, Search, FileText, CheckCircle,
  ChevronDown, ChevronRight, FileDown, Banknote, ArrowDownCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { exportToPDFSimple, exportToCSVSimple, importFromCSV } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS (self-contained)
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (type === "currency") return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  return String(v);
};

const fmtDate = (d: string | Date) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

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
    if (res.status === 401) {
      localStorage.removeItem("ems_auth");
      window.location.reload();
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

function getAuthState() {
  if (typeof window === "undefined") return { isAuthenticated: false, user: null as any };
  try {
    const stored = localStorage.getItem("ems_auth");
    if (stored) return JSON.parse(stored);
  } catch {}
  return { isAuthenticated: false, user: null as any };
}

// ============================================================
// CASH COLLECTIONS & DELIVERIES PAGE COMPONENT
// ============================================================

export default function CashCollectionsDeliveriesPage() {
  const { toast } = useToast();
  const auth = getAuthState();
  const user = auth.user as { name: string; email: string; role: UserRole; displayName: string } | null;

  const isDealer = user?.role === "dealer";
  const isSR = user?.role === "sr";
  const isVatAuditor = user?.role === "vat_auditor";

  // ---- Shared State ----
  const [activeTab, setActiveTab] = useState("collections");

  // ---- Collections State ----
  const [collData, setCollData] = useState<any[]>([]);
  const [collLoading, setCollLoading] = useState(true);
  const [collSearch, setCollSearch] = useState("");
  const [collExpandedRows, setCollExpandedRows] = useState<Set<string>>(new Set());

  // ---- Deliveries State ----
  const [delData, setDelData] = useState<any[]>([]);
  const [delLoading, setDelLoading] = useState(true);
  const [delSearch, setDelSearch] = useState("");
  const [delExpandedRows, setDelExpandedRows] = useState<Set<string>>(new Set());

  // ---- Form State ----
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formType, setFormType] = useState<"collection" | "delivery">("collection");

  // Collections form
  const [collForm, setCollForm] = useState<Record<string, any>>({
    collectionCode: "", customerId: "", date: new Date().toISOString().split("T")[0],
    amount: 0, paymentOptionId: "", bankId: "", description: "", status: "Approved"
  });
  const [customerOutstanding, setCustomerOutstanding] = useState<number | null>(null);

  // Deliveries form
  const [delForm, setDelForm] = useState<Record<string, any>>({
    deliveryCode: "", supplierId: "", date: new Date().toISOString().split("T")[0],
    amount: 0, paymentOptionId: "", bankId: "", description: "", status: "Approved"
  });
  const [supplierPayable, setSupplierPayable] = useState<number | null>(null);

  // Dynamic options
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);

  // ---- Load Data ----
  const loadCollections = useCallback(async () => {
    setCollLoading(true);
    try {
      const res = await apiFetch("/api/cash-collections");
      setCollData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setCollLoading(false); }
  }, [toast]);

  const loadDeliveries = useCallback(async () => {
    setDelLoading(true);
    try {
      const res = await apiFetch("/api/cash-deliveries");
      setDelData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setDelLoading(false); }
  }, [toast]);

  useEffect(() => { loadCollections(); loadDeliveries(); }, [loadCollections, loadDeliveries]);

  // ---- Load Options ----
  const loadOptions = useCallback(async () => {
    try {
      const [cRes, sRes, poRes, bRes] = await Promise.all([
        apiFetch("/api/customers").catch(() => []),
        apiFetch("/api/suppliers").catch(() => []),
        apiFetch("/api/payment-options").catch(() => []),
        apiFetch("/api/banks").catch(() => []),
      ]);
      setCustomers(Array.isArray(cRes) ? cRes : cRes.data || []);
      setSuppliers(Array.isArray(sRes) ? sRes : sRes.data || []);
      setPaymentOptions(Array.isArray(poRes) ? poRes : poRes.data || []);
      setBanks(Array.isArray(bRes) ? bRes : bRes.data || []);
    } catch { /* silent */ }
  }, []);

  // ---- Customer Outstanding Balance ----
  const fetchCustomerOutstanding = useCallback(async (customerId: string) => {
    if (!customerId) { setCustomerOutstanding(null); return; }
    try {
      const [salesRes, collRes] = await Promise.all([
        apiFetch(`/api/sales-orders?customerId=${customerId}`).catch(() => []),
        apiFetch(`/api/cash-collections?customerId=${customerId}`).catch(() => []),
      ]);
      const salesOrders = Array.isArray(salesRes) ? salesRes : (salesRes as any).data || [];
      const collections = Array.isArray(collRes) ? collRes : (collRes as any).data || [];
      const totalSales = salesOrders
        .filter((so: any) => so.customerId === customerId)
        .reduce((s: number, so: any) => s + (so.grandTotal || 0), 0);
      const totalCollections = collections
        .filter((cc: any) => cc.customerId === customerId)
        .reduce((s: number, cc: any) => s + (cc.amount || 0), 0);
      setCustomerOutstanding(totalSales - totalCollections);
    } catch { setCustomerOutstanding(null); }
  }, []);

  // ---- Supplier Accounts Payable ----
  const fetchSupplierPayable = useCallback(async (supplierId: string) => {
    if (!supplierId) { setSupplierPayable(null); return; }
    try {
      const [poRes, delRes] = await Promise.all([
        apiFetch(`/api/purchase-orders?supplierId=${supplierId}`).catch(() => []),
        apiFetch(`/api/cash-deliveries?supplierId=${supplierId}`).catch(() => []),
      ]);
      const purchaseOrders = Array.isArray(poRes) ? poRes : (poRes as any).data || [];
      const deliveries = Array.isArray(delRes) ? delRes : (delRes as any).data || [];
      const totalPO = purchaseOrders
        .filter((po: any) => po.supplierId === supplierId)
        .reduce((s: number, po: any) => s + (po.grandTotal || 0), 0);
      const totalDeliveries = deliveries
        .filter((cd: any) => cd.supplierId === supplierId)
        .reduce((s: number, cd: any) => s + (cd.amount || 0), 0);
      setSupplierPayable(totalPO - totalDeliveries);
    } catch { setSupplierPayable(null); }
  }, []);

  // ---- Filtered Data ----
  const filteredColl = useMemo(() => {
    if (!collSearch) return collData;
    const s = collSearch.toLowerCase();
    return collData.filter((item: any) =>
      item.collectionCode?.toLowerCase().includes(s) ||
      item.customer?.name?.toLowerCase().includes(s) ||
      item.status?.toLowerCase().includes(s)
    );
  }, [collData, collSearch]);

  const filteredDel = useMemo(() => {
    if (!delSearch) return delData;
    const s = delSearch.toLowerCase();
    return delData.filter((item: any) =>
      item.deliveryCode?.toLowerCase().includes(s) ||
      item.supplier?.name?.toLowerCase().includes(s) ||
      item.status?.toLowerCase().includes(s)
    );
  }, [delData, delSearch]);

  // ---- Stats ----
  const collStats = useMemo(() => ({
    total: collData.length,
    totalAmount: collData.reduce((s: number, d: any) => s + (d.amount || 0), 0),
    pending: collData.filter((d: any) => d.status === "Pending").length,
    approved: collData.filter((d: any) => d.status === "Approved").length,
  }), [collData]);

  const delStats = useMemo(() => ({
    total: delData.length,
    totalAmount: delData.reduce((s: number, d: any) => s + (d.amount || 0), 0),
    pending: delData.filter((d: any) => d.status === "Pending").length,
    approved: delData.filter((d: any) => d.status === "Approved").length,
  }), [delData]);

  // ---- Toggle Expand ----
  const toggleCollExpand = (id: string) => {
    setCollExpandedRows(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  };
  const toggleDelExpand = (id: string) => {
    setDelExpandedRows(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  };

  // ---- Status Color ----
  const statusColor = (status: string) => {
    switch (status) {
      case "Pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  // ---- Create / Edit ----
  const openCreate = (type: "collection" | "delivery") => {
    if (type === "delivery" && isSR) return; // SR cannot create deliveries
    setFormType(type);
    setEditItem(null);
    setCustomerOutstanding(null);
    setSupplierPayable(null);
    if (type === "collection") {
      const nextNum = collData.length > 0
        ? String(Math.max(...collData.map((d: any) => parseInt(d.collectionCode?.replace("COL-", "") || "0", 10) || 0)) + 1).padStart(5, "0")
        : "00001";
      setCollForm({
        collectionCode: `COL-${nextNum}`, customerId: "",
        date: new Date().toISOString().split("T")[0],
        amount: 0, paymentOptionId: "", bankId: "", description: "", status: "Approved"
      });
    } else {
      const nextNum = delData.length > 0
        ? String(Math.max(...delData.map((d: any) => parseInt(d.deliveryCode?.replace("DEL-", "") || "0", 10) || 0)) + 1).padStart(5, "0")
        : "00001";
      setDelForm({
        deliveryCode: `DEL-${nextNum}`, supplierId: "",
        date: new Date().toISOString().split("T")[0],
        amount: 0, paymentOptionId: "", bankId: "", description: "", status: "Approved"
      });
    }
    loadOptions();
    setShowForm(true);
  };

  const openEdit = (item: any, type: "collection" | "delivery") => {
    setFormType(type);
    setEditItem(item);
    if (type === "collection") {
      setCollForm({
        collectionCode: item.collectionCode || "",
        customerId: item.customerId || "",
        date: item.date ? item.date.split("T")[0] : "",
        amount: item.amount || 0,
        paymentOptionId: item.paymentOptionId || "",
        bankId: item.bankId || "",
        description: item.description || "",
        status: item.status || "Approved",
      });
      fetchCustomerOutstanding(item.customerId);
    } else {
      setDelForm({
        deliveryCode: item.deliveryCode || "",
        supplierId: item.supplierId || "",
        date: item.date ? item.date.split("T")[0] : "",
        amount: item.amount || 0,
        paymentOptionId: item.paymentOptionId || "",
        bankId: item.bankId || "",
        description: item.description || "",
        status: item.status || "Approved",
      });
      fetchSupplierPayable(item.supplierId);
    }
    loadOptions();
    setShowForm(true);
  };

  // ---- Save ----
  const handleSave = async () => {
    if (formType === "collection") {
      if (!collForm.customerId || !collForm.date || !collForm.amount) {
        toast({ title: "Error", description: "Customer, Date and Amount are required", variant: "destructive" });
        return;
      }
      setSaving(true);
      try {
        const payload = {
          customerId: collForm.customerId,
          date: collForm.date,
          amount: Number(collForm.amount) || 0,
          paymentOptionId: collForm.paymentOptionId || null,
          bankId: collForm.bankId || null,
          description: collForm.description || null,
          status: collForm.status || "Approved",
        };
        if (editItem) {
          await apiFetch(`/api/cash-collections/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
          toast({ title: "Updated", description: "Cash Collection updated" });
        } else {
          await apiFetch("/api/cash-collections", { method: "POST", body: JSON.stringify(payload) });
          toast({ title: "Created", description: "Cash Collection created" });
        }
        setShowForm(false); loadCollections();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setSaving(false); }
    } else {
      if (!delForm.supplierId || !delForm.date || !delForm.amount) {
        toast({ title: "Error", description: "Supplier, Date and Amount are required", variant: "destructive" });
        return;
      }
      setSaving(true);
      try {
        const payload = {
          supplierId: delForm.supplierId,
          date: delForm.date,
          amount: Number(delForm.amount) || 0,
          paymentOptionId: delForm.paymentOptionId || null,
          bankId: delForm.bankId || null,
          description: delForm.description || null,
          status: delForm.status || "Approved",
        };
        if (editItem) {
          await apiFetch(`/api/cash-deliveries/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
          toast({ title: "Updated", description: "Cash Delivery updated" });
        } else {
          await apiFetch("/api/cash-deliveries", { method: "POST", body: JSON.stringify(payload) });
          toast({ title: "Created", description: "Cash Delivery created" });
        }
        setShowForm(false); loadDeliveries();
      } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
      finally { setSaving(false); }
    }
  };

  // ---- Delete ----
  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      const apiBase = formType === "collection" ? "/api/cash-collections" : "/api/cash-deliveries";
      await apiFetch(`${apiBase}/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deleted" });
      setDeleteItem(null);
      if (formType === "collection") loadCollections(); else loadDeliveries();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // ---- Export CSV ----
  const exportCSV = (type: "collection" | "delivery") => {
    try {
      if (type === "collection") {
        const headers = ["Collection Code", "Customer", "Date", "Amount", "Payment Option", "Bank", "Status"];
        const rows = filteredColl.map((item: any) => [
          item.collectionCode, item.customer?.name || "—", fmtDate(item.date), isVatAuditor ? "N/A (Audit Mode)" : String(item.amount || 0),
          item.paymentOption?.name || "—", item.bank?.bankName || "—", item.status
        ]);
        exportToCSVSimple("Cash Collections", headers, rows);
        toast({ title: "Exported", description: "Cash Collections exported to CSV" });
      } else {
        const headers = ["Delivery Code", "Supplier", "Date", "Amount", "Payment Option", "Bank", "Status"];
        const rows = filteredDel.map((item: any) => [
          item.deliveryCode, item.supplier?.name || "—", fmtDate(item.date), isVatAuditor ? "N/A (Audit Mode)" : String(item.amount || 0),
          item.paymentOption?.name || "—", item.bank?.bankName || "—", item.status
        ]);
        exportToCSVSimple("Cash Deliveries", headers, rows);
        toast({ title: "Exported", description: "Cash Deliveries exported to CSV" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ---- Export PDF ----
  const exportPDF = (type: "collection" | "delivery") => {
    try {
      if (type === "collection") {
        const headers = ["Collection Code", "Customer", "Date", "Amount", "Payment Option", "Bank", "Status"];
        const body = filteredColl.map((item: any) => [
          item.collectionCode, item.customer?.name || "—", fmtDate(item.date),
          isVatAuditor ? "N/A (Audit Mode)" : fmt(item.amount, "currency"), item.paymentOption?.name || "—",
          item.bank?.bankName || "—", item.status
        ]);
        exportToPDFSimple("Cash Collections", headers, body, "landscape");
        toast({ title: "Exported", description: "Cash Collections exported to PDF" });
      } else {
        const headers = ["Delivery Code", "Supplier", "Date", "Amount", "Payment Option", "Bank", "Status"];
        const body = filteredDel.map((item: any) => [
          item.deliveryCode, item.supplier?.name || "—", fmtDate(item.date),
          isVatAuditor ? "N/A (Audit Mode)" : fmt(item.amount, "currency"), item.paymentOption?.name || "—",
          item.bank?.bankName || "—", item.status
        ]);
        exportToPDFSimple("Cash Deliveries", headers, body, "landscape");
        toast({ title: "Exported", description: "Cash Deliveries exported to PDF" });
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ---- Import CSV ----
  const importCSV = (type: "collection" | "delivery") => {
    const apiBase = type === "collection" ? "/api/cash-collections" : "/api/cash-deliveries";
    const formFields = type === "collection"
      ? [
          { key: "collectionCode", label: "Collection Code", type: "text" as const },
          { key: "customerId", label: "Customer", type: "text" as const, required: true },
          { key: "date", label: "Date", type: "date" as const, required: true },
          { key: "amount", label: "Amount", type: "number" as const, required: true },
          { key: "status", label: "Status", type: "select" as const, options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }, { value: "Rejected", label: "Rejected" }] },
        ]
      : [
          { key: "deliveryCode", label: "Delivery Code", type: "text" as const },
          { key: "supplierId", label: "Supplier", type: "text" as const, required: true },
          { key: "date", label: "Date", type: "date" as const, required: true },
          { key: "amount", label: "Amount", type: "number" as const, required: true },
          { key: "status", label: "Status", type: "select" as const, options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }, { value: "Rejected", label: "Rejected" }] },
        ];
    importFromCSV({ apiPath: apiBase, formFields }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
      if (type === "collection") loadCollections(); else loadDeliveries();
    });
  };

  // ---- Dealer: COMPLETELY HIDDEN ----
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">You don&apos;t have permission to view Cash Collections &amp; Deliveries.</p>
        </CardContent></Card>
      </div>
    );
  }

  // ---- Render ----
  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Internal net margins and hidden expense adjustments are masked for audit compliance</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Banknote className="w-6 h-6" />Cash Collections &amp; Deliveries
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => importCSV(activeTab === "collections" ? "collection" : "delivery")}>
            <Upload className="w-4 h-4 mr-1" />Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportCSV(activeTab === "collections" ? "collection" : "delivery")}>
            <Download className="w-4 h-4 mr-1" />Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => exportPDF(activeTab === "collections" ? "collection" : "delivery")}>
            <FileDown className="w-4 h-4 mr-1" />Export PDF
          </Button>
          <Button
            size="sm"
            className="bg-[#2563eb] hover:bg-[#1d4ed8]"
            onClick={() => openCreate(activeTab === "collections" ? "collection" : "delivery")}
            disabled={activeTab === "deliveries" && isSR}
          >
            <Plus className="w-4 h-4 mr-1" />{activeTab === "collections" ? "Record Collection" : "Record Delivery"}
          </Button>
        </div>
      </div>

      {/* SR Delivery Restriction Banner */}
      {isSR && activeTab === "deliveries" && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <Lock className="w-4 h-4 text-yellow-600" />
          <span className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">Only managers can create cash deliveries</span>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="collections">Cash Collections</TabsTrigger>
          <TabsTrigger value="deliveries">Cash Deliveries</TabsTrigger>
        </TabsList>

        {/* ============ COLLECTIONS TAB ============ */}
        <TabsContent value="collections" className="space-y-4">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Collections", value: collStats.total, icon: Banknote, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
              { label: "Total Amount", value: isVatAuditor ? "N/A (Audit Mode)" : fmt(collStats.totalAmount, "currency"), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
              { label: "Pending", value: collStats.pending, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
              { label: "Approved", value: collStats.approved, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
            ].map((stat, i) => (
              <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
              </CardContent></Card>
            ))}
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by code, customer..." value={collSearch} onChange={e => setCollSearch(e.target.value)} className="pl-10" />
                </div>
                <Button variant="outline" size="sm" onClick={loadCollections}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">+</TableHead>
                      <TableHead>Collection Code</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Option</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {collLoading ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredColl.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No cash collections found</TableCell></TableRow>
                    ) : filteredColl.map((item: any) => (
                      <React.Fragment key={item.id}>
                        <TableRow className="data-table-row hover:bg-muted/50">
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleCollExpand(item.id)}>
                              {collExpandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.collectionCode}</TableCell>
                          <TableCell>{item.customer?.name || "—"}</TableCell>
                          <TableCell>{fmtDate(item.date)}</TableCell>
                          <TableCell className="font-mono">{isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">N/A (Audit Mode)</span> : fmt(item.amount, "currency")}</TableCell>
                          <TableCell>{item.paymentOption?.name || "—"}</TableCell>
                          <TableCell>{item.bank?.bankName || "—"}</TableCell>
                          <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(item, "collection")}><Edit className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => { setFormType("collection"); setDeleteItem(item); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {collExpandedRows.has(item.id) && (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/30 p-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                <div><span className="text-muted-foreground">Customer:</span> <span className="font-medium text-slate-900 dark:text-white">{item.customer?.name || "—"}</span></div>
                                <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium text-slate-900 dark:text-white">{item.bank?.bankName || "—"}</span></div>
                                <div><span className="text-muted-foreground">Payment Option:</span> <span className="font-medium text-slate-900 dark:text-white">{item.paymentOption?.name || "—"}</span></div>
                                <div><span className="text-muted-foreground">Description:</span> <span className="font-medium text-slate-900 dark:text-white">{item.description || "—"}</span></div>
                                <div><span className="text-muted-foreground">Created:</span> <span className="font-medium text-slate-900 dark:text-white">{fmtDate(item.createdAt)}</span></div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {filteredColl.length} of {collData.length} cash collections</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ DELIVERIES TAB ============ */}
        <TabsContent value="deliveries" className="space-y-4">
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Total Deliveries", value: delStats.total, icon: ArrowDownCircle, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
              { label: "Total Amount", value: isVatAuditor ? "N/A (Audit Mode)" : fmt(delStats.totalAmount, "currency"), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
              { label: "Pending", value: delStats.pending, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
              { label: "Approved", value: delStats.approved, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
            ].map((stat, i) => (
              <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
              </CardContent></Card>
            ))}
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by code, supplier..." value={delSearch} onChange={e => setDelSearch(e.target.value)} className="pl-10" />
                </div>
                <Button variant="outline" size="sm" onClick={loadDeliveries}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">+</TableHead>
                      <TableHead>Delivery Code</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment Option</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {delLoading ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredDel.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No cash deliveries found</TableCell></TableRow>
                    ) : filteredDel.map((item: any) => (
                      <React.Fragment key={item.id}>
                        <TableRow className="data-table-row hover:bg-muted/50">
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleDelExpand(item.id)}>
                              {delExpandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.deliveryCode}</TableCell>
                          <TableCell>{item.supplier?.name || "—"}</TableCell>
                          <TableCell>{fmtDate(item.date)}</TableCell>
                          <TableCell className="font-mono">{isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">N/A (Audit Mode)</span> : fmt(item.amount, "currency")}</TableCell>
                          <TableCell>{item.paymentOption?.name || "—"}</TableCell>
                          <TableCell>{item.bank?.bankName || "—"}</TableCell>
                          <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(item, "delivery")} disabled={isSR}><Edit className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="text-red-500" disabled={isSR} onClick={() => { setFormType("delivery"); setDeleteItem(item); }}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {delExpandedRows.has(item.id) && (
                          <TableRow>
                            <TableCell colSpan={9} className="bg-muted/30 p-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                                <div><span className="text-muted-foreground">Supplier:</span> <span className="font-medium text-slate-900 dark:text-white">{item.supplier?.name || "—"}</span></div>
                                <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium text-slate-900 dark:text-white">{item.bank?.bankName || "—"}</span></div>
                                <div><span className="text-muted-foreground">Payment Option:</span> <span className="font-medium text-slate-900 dark:text-white">{item.paymentOption?.name || "—"}</span></div>
                                <div><span className="text-muted-foreground">Description:</span> <span className="font-medium text-slate-900 dark:text-white">{item.description || "—"}</span></div>
                                <div><span className="text-muted-foreground">Created:</span> <span className="font-medium text-slate-900 dark:text-white">{fmtDate(item.createdAt)}</span></div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {filteredDel.length} of {delData.length} cash deliveries</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ============ CREATE / EDIT DIALOG ============ */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editItem ? "Edit" : formType === "collection" ? "Record Collection" : "Record Delivery"} {formType === "collection" ? "Cash Collection" : "Cash Delivery"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {formType === "collection" ? (
              /* ---- Collection Form ---- */
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Collection Code</Label>
                    <Input className="bg-muted cursor-not-allowed" value={collForm.collectionCode || "Auto-generated"} readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Customer <span className="text-red-500">*</span></Label>
                    <Select
                      value={collForm.customerId || ""}
                      onValueChange={v => {
                        setCollForm({ ...collForm, customerId: v });
                        fetchCustomerOutstanding(v);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger>
                      <SelectContent>
                        {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {customerOutstanding !== null && (
                      <p className={`text-xs font-medium ${customerOutstanding > 0 ? "text-red-600" : "text-green-600"}`}>
                        Outstanding: {fmt(customerOutstanding, "currency")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date <span className="text-red-500">*</span></Label>
                    <Input type="date" value={collForm.date || ""} onChange={e => setCollForm({ ...collForm, date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount <span className="text-red-500">*</span></Label>
                    <Input type="number" step="0.01" value={collForm.amount || ""} onChange={e => setCollForm({ ...collForm, amount: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Option</Label>
                    <Select value={collForm.paymentOptionId || ""} onValueChange={v => setCollForm({ ...collForm, paymentOptionId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select Payment Option" /></SelectTrigger>
                      <SelectContent>
                        {paymentOptions.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bank</Label>
                    <Select value={collForm.bankId || ""} onValueChange={v => setCollForm({ ...collForm, bankId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select Bank" /></SelectTrigger>
                      <SelectContent>
                        {banks.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bankName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Status</Label>
                    <Select value={collForm.status || "Approved"} onValueChange={v => setCollForm({ ...collForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={collForm.description || ""} onChange={e => setCollForm({ ...collForm, description: e.target.value })} placeholder="Description..." />
                </div>
              </>
            ) : (
              /* ---- Delivery Form ---- */
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Delivery Code</Label>
                    <Input className="bg-muted cursor-not-allowed" value={delForm.deliveryCode || "Auto-generated"} readOnly />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Supplier <span className="text-red-500">*</span></Label>
                    <Select
                      value={delForm.supplierId || ""}
                      onValueChange={v => {
                        setDelForm({ ...delForm, supplierId: v });
                        fetchSupplierPayable(v);
                      }}
                    >
                      <SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger>
                      <SelectContent>
                        {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {supplierPayable !== null && (
                      <p className={`text-xs font-medium ${supplierPayable > 0 ? "text-red-600" : "text-green-600"}`}>
                        Payable: {fmt(supplierPayable, "currency")}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Date <span className="text-red-500">*</span></Label>
                    <Input type="date" value={delForm.date || ""} onChange={e => setDelForm({ ...delForm, date: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Amount <span className="text-red-500">*</span></Label>
                    <Input type="number" step="0.01" value={delForm.amount || ""} onChange={e => setDelForm({ ...delForm, amount: Number(e.target.value) })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Payment Option</Label>
                    <Select value={delForm.paymentOptionId || ""} onValueChange={v => setDelForm({ ...delForm, paymentOptionId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select Payment Option" /></SelectTrigger>
                      <SelectContent>
                        {paymentOptions.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bank</Label>
                    <Select value={delForm.bankId || ""} onValueChange={v => setDelForm({ ...delForm, bankId: v })}>
                      <SelectTrigger><SelectValue placeholder="Select Bank" /></SelectTrigger>
                      <SelectContent>
                        {banks.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bankName}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>Status</Label>
                    <Select value={delForm.status || "Approved"} onValueChange={v => setDelForm({ ...delForm, status: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Pending">Pending</SelectItem>
                        <SelectItem value="Approved">Approved</SelectItem>
                        <SelectItem value="Rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Description</Label>
                  <Textarea value={delForm.description || ""} onChange={e => setDelForm({ ...delForm, description: e.target.value })} placeholder="Description..." />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editItem ? "Update" : formType === "collection" ? "Record Collection" : "Record Delivery"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============ DELETE CONFIRMATION DIALOG ============ */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete this {formType === "collection" ? "cash collection" : "cash delivery"}? This action will soft-delete the record and reverse any bank impact.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
