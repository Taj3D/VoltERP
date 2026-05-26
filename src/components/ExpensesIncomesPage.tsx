"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Lock, Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  ChevronDown, ChevronRight, FileDown, CheckCircle, AlertTriangle,
  DollarSign, ArrowDownCircle, ArrowUpCircle, FileText, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { exportToPDFSimple, exportToCSVSimple, importFromCSV } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS (local copies for standalone component)
// ============================================================

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

// ============================================================
// Auth Hook (local copy for standalone component)
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

let authState = {
  isAuthenticated: false,
  user: null as AuthUser | null,
};

let authListeners: Array<() => void> = [];

function useAuth() {
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const listener = () => forceUpdate({});
    authListeners.push(listener);
    return () => { authListeners = authListeners.filter(l => l !== listener); };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        authState = parsed;
        authListeners.forEach(l => l());
      } catch {}
    }
  }, []);

  const isVatAuditor = authState.user?.role === "vat_auditor";

  return { ...authState, isVatAuditor, user: authState.user };
}

// ============================================================
// ExpensesIncomesPage Component
// ============================================================

export default function ExpensesIncomesPage() {
  const { toast } = useToast();
  const { isVatAuditor, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"expenses" | "incomes">("expenses");

  // Expenses state
  const [expenses, setExpenses] = useState<any[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Dynamic options
  const [heads, setHeads] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({
    code: "",
    date: new Date().toISOString().split("T")[0],
    headId: "",
    amount: "",
    paymentOptionId: "",
    bankId: "",
    description: "",
    status: "Approved",
  });

  // RBAC
  const isDealer = user?.role === "dealer";
  const isSR = user?.role === "sr";

  // Current data based on tab
  const currentData = activeTab === "expenses" ? expenses : incomes;
  const apiBase = activeTab === "expenses" ? "/api/expenses" : "/api/incomes";
  const codeField = activeTab === "expenses" ? "expenseCode" : "incomeCode";
  const codePrefix = activeTab === "expenses" ? "EXP" : "INC";
  const tabLabel = activeTab === "expenses" ? "Expense" : "Income";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [expRes, incRes] = await Promise.all([
        apiFetch("/api/expenses").catch(() => []),
        apiFetch("/api/incomes").catch(() => []),
      ]);
      setExpenses(Array.isArray(expRes) ? expRes : expRes.data || []);
      setIncomes(Array.isArray(incRes) ? incRes : incRes.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { load(); }, [load]);

  const loadOptions = useCallback(async () => {
    try {
      const [hRes, poRes, bRes] = await Promise.all([
        apiFetch("/api/expense-income-heads").catch(() => []),
        apiFetch("/api/payment-options").catch(() => []),
        apiFetch("/api/banks").catch(() => []),
      ]);
      setHeads(Array.isArray(hRes) ? hRes : hRes.data || []);
      setPaymentOptions(Array.isArray(poRes) ? poRes : poRes.data || []);
      setBanks(Array.isArray(bRes) ? bRes : bRes.data || []);
    } catch { /* silent */ }
  }, []);

  // Filter heads by type based on active tab
  const filteredHeads = useMemo(() => {
    return heads.filter((h: any) => h.type === (activeTab === "expenses" ? "Expense" : "Income"));
  }, [heads, activeTab]);

  const filtered = useMemo(() => {
    if (!search) return currentData;
    const s = search.toLowerCase();
    return currentData.filter((item: any) =>
      item[codeField]?.toLowerCase().includes(s) ||
      item.head?.name?.toLowerCase().includes(s) ||
      item.status?.toLowerCase().includes(s) ||
      item.description?.toLowerCase().includes(s)
    );
  }, [currentData, search, codeField]);

  // Stats
  const totalCount = currentData.length;
  const totalAmount = currentData.reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const pendingCount = currentData.filter((d: any) => d.status === "Pending").length;
  const approvedCount = currentData.filter((d: any) => d.status === "Approved").length;

  const openCreate = () => {
    // SR cannot create expenses
    if (isSR && activeTab === "expenses") {
      toast({ title: "Access Denied", description: "You can only create Income entries", variant: "destructive" });
      return;
    }
    setFormData({
      code: "",
      date: new Date().toISOString().split("T")[0],
      headId: "",
      amount: "",
      paymentOptionId: "",
      bankId: "",
      description: "",
      status: "Approved",
    });
    setEditItem(null);
    setShowForm(true);
    loadOptions();
  };

  const openEdit = (item: any) => {
    // SR cannot edit expenses
    if (isSR && activeTab === "expenses") {
      toast({ title: "Access Denied", description: "You can only edit Income entries", variant: "destructive" });
      return;
    }
    setFormData({
      code: item[codeField] || "",
      date: item.date ? item.date.split("T")[0] : "",
      headId: item.headId || "",
      amount: item.amount || "",
      paymentOptionId: item.paymentOptionId || "",
      bankId: item.bankId || "",
      description: item.description || "",
      status: item.status || "Approved",
    });
    setEditItem(item);
    setShowForm(true);
    loadOptions();
  };

  const handleSave = async () => {
    if (!formData.date || !formData.headId || !formData.amount) {
      toast({ title: "Error", description: "Date, Head, and Amount are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        date: formData.date,
        headId: formData.headId,
        amount: Number(formData.amount),
        paymentOptionId: formData.paymentOptionId || null,
        bankId: formData.bankId || null,
        description: formData.description || null,
        status: formData.status || "Approved",
      };
      if (editItem) {
        await apiFetch(`${apiBase}/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: `${tabLabel} updated` });
      } else {
        await apiFetch(apiBase, { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: `${tabLabel} created` });
      }
      setShowForm(false); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`${apiBase}/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deleted" }); setDeleteItem(null); load();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const exportCSV = () => {
    try {
      const headers = [`${codePrefix} Code`, "Head", "Date", "Amount", "Payment Option", "Bank", "Status"];
      const rows = filtered.map((item: any) => [
        item[codeField], item.head?.name || "—", fmtDate(item.date),
        String(item.amount || 0), item.paymentOption?.name || "—", item.bank?.bankName || "—", item.status
      ]);
      exportToCSVSimple(tabLabel, headers, rows);
      toast({ title: "Exported", description: `${tabLabel}s exported to CSV` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const exportPDF = () => {
    try {
      const headers = [`${codePrefix} Code`, "Head", "Date", "Amount", "Payment Option", "Bank", "Status"];
      const body = filtered.map((item: any) => [
        item[codeField],
        item.head?.name || "—",
        fmtDate(item.date),
        isVatAuditor ? "N/A (Audit Mode)" : fmt(item.amount, "currency"),
        item.paymentOption?.name || "—",
        item.bank?.bankName || "—",
        item.status,
      ]);
      exportToPDFSimple(`${tabLabel}s`, headers, body, "landscape");
      toast({ title: "Exported", description: `${tabLabel}s exported to PDF` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const importCSV = () => {
    // SR cannot import expenses
    if (isSR && activeTab === "expenses") {
      toast({ title: "Access Denied", description: "You can only import Income entries", variant: "destructive" });
      return;
    }
    importFromCSV({
      apiPath: apiBase,
      formFields: [
        { key: "headId", label: "Head", type: "text", required: true },
        { key: "amount", label: "Amount", type: "number", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "paymentOptionId", label: "Payment Option", type: "text" },
        { key: "bankId", label: "Bank", type: "text" },
        { key: "status", label: "Status", type: "select", options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }, { value: "Rejected", label: "Rejected" }] },
        { key: "description", label: "Description", type: "text" },
      ],
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
      load();
    });
  };

  const toggleExpand = (id: string) => {
    setExpandedRows(prev => { const next = new Set(prev); if (next.has(id)) { next.delete(id); } else { next.add(id); } return next; });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case "Pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  // Dealer restriction - early return AFTER all hooks
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">Dealers cannot access Expenses & Incomes. Please contact your administrator.</p>
        </CardContent></Card>
      </div>
    );
  }

  // SR restricted from creating expenses
  const canCreateCurrentTab = !(isSR && activeTab === "expenses");

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Amount/cost fields hidden for audit compliance. Data maps to legal outward/inward invoicing sets only.</span>
        </div>
      )}

      {/* SR yellow banner */}
      {isSR && (
        <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          <span className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">You can only create Income entries. Expense creation is restricted.</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <DollarSign className="w-6 h-6" />
          Expenses & Incomes
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV} disabled={!canCreateCurrentTab}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate} disabled={!canCreateCurrentTab}>
            <Plus className="w-4 h-4 mr-1" />Create {tabLabel}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "expenses" | "incomes"); setSearch(""); setExpandedRows(new Set()); }}>
        <TabsList>
          <TabsTrigger value="expenses" className="flex items-center gap-1">
            <ArrowDownCircle className="w-4 h-4" />Expenses
          </TabsTrigger>
          <TabsTrigger value="incomes" className="flex items-center gap-1">
            <ArrowUpCircle className="w-4 h-4" />Incomes
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses">
          {/* Expenses content rendered below */}
        </TabsContent>
        <TabsContent value="incomes">
          {/* Incomes content rendered below */}
        </TabsContent>
      </Tabs>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: `Total ${tabLabel}s`, value: totalCount, icon: activeTab === "expenses" ? ArrowDownCircle : ArrowUpCircle, color: activeTab === "expenses" ? "text-red-600" : "text-green-600", bg: activeTab === "expenses" ? "bg-red-50 dark:bg-red-900/30" : "bg-green-50 dark:bg-green-900/30" },
          { label: "Total Amount", value: isVatAuditor ? "N/A (Audit Mode)" : fmt(totalAmount, "currency"), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Pending", value: pendingCount, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
          { label: "Approved", value: approvedCount, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
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
              <Input placeholder={`Search by ${codePrefix.toLowerCase()} code, head...`} value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead>{codePrefix} Code</TableHead>
                  <TableHead>Head</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Payment Option</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No {activeTab} found</TableCell></TableRow>
                ) : filtered.map((item: any) => (
                  <React.Fragment key={item.id}>
                    <TableRow className="data-table-row hover:bg-muted/50">
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(item.id)}>
                          {expandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item[codeField]}</TableCell>
                      <TableCell>{item.head?.name || "—"}</TableCell>
                      <TableCell>{fmtDate(item.date)}</TableCell>
                      <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmt(item.amount, "currency")}</TableCell>
                      <TableCell>{item.paymentOption?.name || "—"}</TableCell>
                      <TableCell>{item.bank?.bankName || "—"}</TableCell>
                      <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)} disabled={isSR && activeTab === "expenses"}><Edit className="w-3.5 h-3.5" /></Button>
                          <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)} disabled={isSR && activeTab === "expenses"}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {expandedRows.has(item.id) && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30 p-3">
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                            <div><span className="text-muted-foreground">Head:</span> <span className="font-medium text-slate-900 dark:text-white">{item.head?.name || "—"}</span></div>
                            <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium text-slate-900 dark:text-white">{item.bank?.bankName || "—"}</span></div>
                            <div><span className="text-muted-foreground">Payment Option:</span> <span className="font-medium text-slate-900 dark:text-white">{item.paymentOption?.name || "—"}</span></div>
                            <div className="col-span-2"><span className="text-muted-foreground">Description:</span> <span className="font-medium text-slate-900 dark:text-white">{item.description || "—"}</span></div>
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
          <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {currentData.length} {activeTab}</div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} {tabLabel}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Code - Auto-generated, read-only */}
              <div className="space-y-1.5">
                <Label>{codePrefix} Code</Label>
                <Input className="bg-muted cursor-not-allowed" value={editItem ? formData.code : "Auto-generated"} readOnly placeholder="Auto-generated" />
              </div>

              {/* Date */}
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>

              {/* Head */}
              <div className="space-y-1.5">
                <Label>Head <span className="text-red-500">*</span></Label>
                <Select value={formData.headId || ""} onValueChange={v => setFormData({ ...formData, headId: v })}>
                  <SelectTrigger><SelectValue placeholder={`Select ${tabLabel} Head`} /></SelectTrigger>
                  <SelectContent>
                    {filteredHeads.map((h: any) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label>Amount <span className="text-red-500">*</span></Label>
                {isVatAuditor ? (
                  <Input className="bg-muted cursor-not-allowed" value="N/A (Audit Mode)" readOnly />
                ) : (
                  <Input type="number" step="0.01" value={formData.amount || ""} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />
                )}
              </div>

              {/* Payment Option */}
              <div className="space-y-1.5">
                <Label>Payment Option</Label>
                <Select value={formData.paymentOptionId || ""} onValueChange={v => setFormData({ ...formData, paymentOptionId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Payment Option" /></SelectTrigger>
                  <SelectContent>
                    {paymentOptions.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Bank */}
              <div className="space-y-1.5">
                <Label>Bank</Label>
                <Select value={formData.bankId || ""} onValueChange={v => setFormData({ ...formData, bankId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Bank" /></SelectTrigger>
                  <SelectContent>
                    {banks.map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bankName}{b.branch ? ` - ${b.branch}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={formData.status || "Approved"} onValueChange={v => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} placeholder={`Enter ${tabLabel.toLowerCase()} description...`} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving || isVatAuditor}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Delete</DialogTitle></DialogHeader>
          <DialogDescription>Delete {tabLabel} {deleteItem?.[codeField]}? This cannot be undone.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
