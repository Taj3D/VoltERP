"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Banknote, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Plus,
  Edit, Trash2, Download, Upload, RefreshCw, Search, Lock,
  DollarSign, FileText, CheckCircle, AlertTriangle, FileDown,
  ChevronDown, ChevronRight, Building2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { exportToPDFSimple, exportToCSVSimple, importFromCSV } from "@/lib/export-utils";

// ============================================================
// LOCAL UTILITY FUNCTIONS (self-contained)
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

function useAuth() {
  // Read auth state from localStorage lazily to avoid setState in effect
  const getStoredAuth = (): { user: AuthUser | null; isAuthenticated: boolean } => {
    if (typeof window === "undefined") return { user: null, isAuthenticated: false };
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return { user: parsed.user, isAuthenticated: parsed.isAuthenticated };
      } catch { /* ignore */ }
    }
    return { user: null, isAuthenticated: false };
  };

  const [authState, setAuthState] = useState(getStoredAuth);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const listener = () => {
      const s = localStorage.getItem("ems_auth");
      if (s) {
        try {
          const p = JSON.parse(s);
          setAuthState({ user: p.user, isAuthenticated: p.isAuthenticated });
        } catch { /* ignore */ }
      }
      forceUpdate({});
    };

    // Also listen for custom event from main page.tsx auth changes
    window.addEventListener("storage", listener);
    window.addEventListener("auth-change", listener);
    return () => {
      window.removeEventListener("storage", listener);
      window.removeEventListener("auth-change", listener);
    };
  }, []);

  const isVatAuditor = authState.user?.role === "vat_auditor";
  const isDealer = authState.user?.role === "dealer";
  const isSR = authState.user?.role === "sr";

  return { user: authState.user, isAuthenticated: authState.isAuthenticated, isVatAuditor, isDealer, isSR };
}

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
// BANK TRANSACTIONS PAGE - Dedicated Transaction Page
// ============================================================

export default function BankTransactionsPage() {
  const { toast } = useToast();
  const { isVatAuditor, isDealer, isSR, user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // Form state
  const [formData, setFormData] = useState<Record<string, any>>({
    transactionCode: "",
    bankId: "",
    type: "Deposit",
    amount: "",
    toBankId: "",
    date: new Date().toISOString().split("T")[0],
    description: "",
    status: "Approved",
  });

  // Load bank transactions
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/bank-transactions");
      setData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  // Load bank accounts
  const loadBanks = useCallback(async () => {
    try {
      const res = await apiFetch("/api/banks");
      setBanks(Array.isArray(res) ? res : res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); loadBanks(); }, [load, loadBanks]);

  // Selected bank info for balance display
  const selectedBank = useMemo(() => {
    if (!formData.bankId) return null;
    return banks.find((b: any) => b.id === formData.bankId) || null;
  }, [formData.bankId, banks]);

  const selectedToBank = useMemo(() => {
    if (!formData.toBankId) return null;
    return banks.find((b: any) => b.id === formData.toBankId) || null;
  }, [formData.toBankId, banks]);

  // Insufficient balance validation
  const insufficientBalance = useMemo(() => {
    if (!selectedBank || !formData.amount) return false;
    const amount = Number(formData.amount) || 0;
    if (amount <= 0) return false;
    if (formData.type === "Withdraw" || formData.type === "Transfer") {
      return amount > selectedBank.currentBalance;
    }
    return false;
  }, [selectedBank, formData.amount, formData.type]);

  // Same bank validation for transfers
  const sameBankError = useMemo(() => {
    return formData.type === "Transfer" && formData.bankId && formData.toBankId && formData.bankId === formData.toBankId;
  }, [formData.type, formData.bankId, formData.toBankId]);

  // Filtered data
  const filtered = useMemo(() => {
    let result = data;
    if (typeFilter !== "All") {
      result = result.filter((item: any) => item.type === typeFilter);
    }
    if (!search) return result;
    const s = search.toLowerCase();
    return result.filter((item: any) =>
      item.transactionCode?.toLowerCase().includes(s) ||
      item.bank?.bankName?.toLowerCase().includes(s) ||
      item.type?.toLowerCase().includes(s) ||
      item.description?.toLowerCase().includes(s) ||
      item.status?.toLowerCase().includes(s)
    );
  }, [data, search, typeFilter]);

  // Stats
  const totalTransactions = data.length;
  const totalDeposits = data.filter((d: any) => d.type === "Deposit").reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const totalWithdrawals = data.filter((d: any) => d.type === "Withdraw").reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const totalTransfers = data.filter((d: any) => d.type === "Transfer").reduce((s: number, d: any) => s + (d.amount || 0), 0);

  // Toggle expand
  const toggleExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  };

  // Type badge styling
  const typeBadge = (type: string) => {
    switch (type) {
      case "Deposit":
        return { className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: ArrowDownCircle };
      case "Withdraw":
        return { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: ArrowUpCircle };
      case "Transfer":
        return { className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", icon: ArrowLeftRight };
      default:
        return { className: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400", icon: Banknote };
    }
  };

  // Status badge styling
  const statusColor = (status: string) => {
    switch (status) {
      case "Pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  // Open create form
  const openCreate = () => {
    const nextNum = data.length > 0
      ? String(Math.max(...data.map((d: any) => parseInt(d.transactionCode?.replace("BTX-", "") || "0", 10) || 0)) + 1).padStart(5, "0")
      : "00001";
    setFormData({
      transactionCode: `BTX-${nextNum}`,
      bankId: "",
      type: "Deposit",
      amount: "",
      toBankId: "",
      date: new Date().toISOString().split("T")[0],
      description: "",
      status: "Approved",
    });
    setEditItem(null);
    setShowForm(true);
    loadBanks();
  };

  // Open edit form
  const openEdit = (item: any) => {
    setFormData({
      transactionCode: item.transactionCode || "",
      bankId: item.bankId || "",
      type: item.type || "Deposit",
      amount: item.amount || "",
      toBankId: item.toBankId || "",
      date: item.date ? item.date.split("T")[0] : "",
      description: item.description || "",
      status: item.status || "Approved",
    });
    setEditItem(item);
    setShowForm(true);
    loadBanks();
  };

  // Handle save
  const handleSave = async () => {
    if (!formData.bankId || !formData.type || !formData.date || !formData.amount) {
      toast({ title: "Error", description: "Bank, Type, Amount, and Date are required", variant: "destructive" });
      return;
    }
    if (Number(formData.amount) <= 0) {
      toast({ title: "Error", description: "Amount must be a positive number", variant: "destructive" });
      return;
    }
    if (insufficientBalance) {
      toast({ title: "Error", description: "Insufficient bank balance for this transaction", variant: "destructive" });
      return;
    }
    if (formData.type === "Transfer" && !formData.toBankId) {
      toast({ title: "Error", description: "Target bank is required for Transfer", variant: "destructive" });
      return;
    }
    if (sameBankError) {
      toast({ title: "Error", description: "Source bank and target bank cannot be the same", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        bankId: formData.bankId,
        type: formData.type,
        amount: Number(formData.amount),
        toBankId: formData.type === "Transfer" ? formData.toBankId : undefined,
        date: formData.date,
        description: formData.description || undefined,
        status: formData.status || "Approved",
      };
      if (editItem) {
        await apiFetch(`/api/bank-transactions/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Bank Transaction updated" });
      } else {
        await apiFetch("/api/bank-transactions", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Bank Transaction created" });
      }
      setShowForm(false);
      load();
      loadBanks(); // Refresh bank balances
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/bank-transactions/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deleted" });
      setDeleteItem(null);
      load();
      loadBanks();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Export CSV
  const exportCSV = () => {
    try {
      const headers = ["Transaction Code", "Bank", "Type", "Amount", "Running Balance", "To Bank", "Date", "Status"];
      const rows = filtered.map((item: any) => [
        item.transactionCode,
        item.bank?.bankName || "—",
        item.type,
        String(item.amount || 0),
        String(item.runningBalance || 0),
        item.toBank?.bankName || "—",
        fmtDate(item.date),
        item.status,
      ]);
      exportToCSVSimple("Bank Transactions", headers, rows);
      toast({ title: "Exported", description: "Bank Transactions exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Export PDF
  const exportPDF = () => {
    try {
      const headers = ["Code", "Bank", "Type", "Amount", "Running Bal", "To Bank", "Date", "Status"];
      const body = filtered.map((item: any) => [
        item.transactionCode,
        item.bank?.bankName || "—",
        item.type,
        fmt(item.amount, "currency"),
        fmt(item.runningBalance, "currency"),
        item.toBank?.bankName || "—",
        fmtDate(item.date),
        item.status,
      ]);
      exportToPDFSimple("Bank Transactions", headers, body, "landscape");
      toast({ title: "Exported", description: "Bank Transactions exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Import CSV
  const importCSV = () => {
    importFromCSV({
      apiPath: "/api/bank-transactions",
      formFields: [
        { key: "bankId", label: "Bank", type: "text", required: true },
        { key: "type", label: "Type", type: "select", required: true, options: [{ value: "Deposit", label: "Deposit" }, { value: "Withdraw", label: "Withdraw" }, { value: "Transfer", label: "Transfer" }] },
        { key: "amount", label: "Amount", type: "number", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "toBankId", label: "To Bank", type: "text" },
        { key: "description", label: "Description", type: "text" },
        { key: "status", label: "Status", type: "select", options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }, { value: "Rejected", label: "Rejected" }] },
      ],
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
      load();
      loadBanks();
    });
  };

  // Column count for table spans
  const colCount = 10;

  // ============================================================
  // RBAC: Dealer - COMPLETELY HIDDEN
  // ============================================================
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">Dealers cannot view corporate bank accounts. Please contact your administrator.</p>
        </CardContent></Card>
      </div>
    );
  }

  // ============================================================
  // RBAC: SR - STRICTLY RESTRICTED
  // ============================================================
  if (isSR) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">Sales Representatives cannot track raw Bank Transactions. Please contact your administrator.</p>
        </CardContent></Card>
      </div>
    );
  }

  // ============================================================
  // MAIN RENDER (Admin / Manager / VAT Auditor)
  // ============================================================
  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Running balance hidden — transactions mapped against legal invoicing sets and compliant VAT ledger formats only</span>
        </div>
      )}

      {/* Bank Balance Cards */}
      {banks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Bank Account Balances</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {banks.filter((b: any) => b.isActive !== false).map((bank: any) => (
              <Card key={bank.id} className="border-l-4 border-l-[#2563eb]">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-[#2563eb]" />
                        <span className="font-semibold text-slate-900 dark:text-white">{bank.bankName}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">A/C: {bank.accountNo}</p>
                      {bank.branch && <p className="text-xs text-muted-foreground">Branch: {bank.branch}</p>}
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold font-mono ${bank.currentBalance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {fmt(bank.currentBalance, "currency")}
                      </p>
                      <p className="text-xs text-muted-foreground">Current Balance</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Banknote className="w-6 h-6" />Bank Transactions</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={importCSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Create Transaction</Button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Total Transactions", value: totalTransactions, icon: Banknote, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Total Deposits", value: fmt(totalDeposits, "currency"), icon: ArrowDownCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Total Withdrawals", value: fmt(totalWithdrawals, "currency"), icon: ArrowUpCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
          { label: "Total Transfers", value: fmt(totalTransfers, "currency"), icon: ArrowLeftRight, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by code, bank, type..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Filter Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Types</SelectItem>
                <SelectItem value="Deposit">Deposit</SelectItem>
                <SelectItem value="Withdraw">Withdraw</SelectItem>
                <SelectItem value="Transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>
          <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead>Transaction Code</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Running Balance</TableHead>
                  <TableHead>To Bank</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={colCount} className="h-24 text-center text-muted-foreground">No bank transactions found</TableCell></TableRow>
                ) : filtered.map((item: any) => {
                  const tb = typeBadge(item.type);
                  const TypeIcon = tb.icon;
                  return (
                    <React.Fragment key={item.id}>
                      <TableRow className="data-table-row hover:bg-muted/50">
                        <TableCell>
                          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(item.id)}>
                            {expandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </Button>
                        </TableCell>
                        <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.transactionCode}</TableCell>
                        <TableCell>{item.bank?.bankName || "—"}</TableCell>
                        <TableCell>
                          <Badge className={tb.className}>
                            <TypeIcon className="w-3 h-3 mr-1" />{item.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{fmt(item.amount, "currency")}</TableCell>
                        <TableCell className="font-mono">{isVatAuditor ? <span className="text-xs text-muted-foreground italic">N/A (Audit Mode)</span> : fmt(item.runningBalance, "currency")}</TableCell>
                        <TableCell>{item.type === "Transfer" ? (item.toBank?.bankName || "—") : "—"}</TableCell>
                        <TableCell>{fmtDate(item.date)}</TableCell>
                        <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedRows.has(item.id) && (
                        <TableRow>
                          <TableCell colSpan={colCount} className="bg-muted/30 p-3">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                              <div>
                                <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Bank Details</div>
                                <div className="space-y-1">
                                  <p><span className="text-muted-foreground">Bank:</span> <span className="font-medium text-slate-900 dark:text-white">{item.bank?.bankName || "—"}</span></p>
                                  <p><span className="text-muted-foreground">Account No:</span> <span className="font-mono">{item.bank?.accountNo || "—"}</span></p>
                                  <p><span className="text-muted-foreground">Branch:</span> {item.bank?.branch || "—"}</p>
                                </div>
                              </div>
                              {item.type === "Transfer" && (
                                <div>
                                  <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Target Bank Details</div>
                                  <div className="space-y-1">
                                    <p><span className="text-muted-foreground">Bank:</span> <span className="font-medium text-slate-900 dark:text-white">{item.toBank?.bankName || "—"}</span></p>
                                    <p><span className="text-muted-foreground">Account No:</span> <span className="font-mono">{item.toBank?.accountNo || "—"}</span></p>
                                    <p><span className="text-muted-foreground">Branch:</span> {item.toBank?.branch || "—"}</p>
                                  </div>
                                </div>
                              )}
                              <div>
                                <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Transaction Details</div>
                                <div className="space-y-1">
                                  <p><span className="text-muted-foreground">Description:</span> {item.description || "—"}</p>
                                  <p><span className="text-muted-foreground">Running Balance:</span> <span className="font-mono font-medium">{isVatAuditor ? "N/A (Audit Mode)" : fmt(item.runningBalance, "currency")}</span></p>
                                  <p><span className="text-muted-foreground">Created:</span> {fmtDate(item.createdAt)}</p>
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
          <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {data.length} bank transactions</div>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Bank Transaction</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Transaction Code - Auto-generated */}
              <div className="space-y-1.5">
                <Label>Transaction Code</Label>
                <Input className="bg-muted cursor-not-allowed" value={formData.transactionCode || "Auto-generated"} readOnly />
              </div>

              {/* Bank Select */}
              <div className="space-y-1.5">
                <Label>Bank <span className="text-red-500">*</span></Label>
                <Select value={formData.bankId || ""} onValueChange={v => setFormData({ ...formData, bankId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Bank" /></SelectTrigger>
                  <SelectContent>
                    {banks.filter((b: any) => b.isActive !== false).map((bank: any) => (
                      <SelectItem key={bank.id} value={bank.id}>{bank.bankName} — {bank.accountNo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedBank && (
                  <p className={`text-xs font-mono ${selectedBank.currentBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                    Current Balance: {fmt(selectedBank.currentBalance, "currency")}
                  </p>
                )}
              </div>

              {/* Type Select */}
              <div className="space-y-1.5">
                <Label>Type <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.type || "Deposit"}
                  onValueChange={v => setFormData({ ...formData, type: v, toBankId: v !== "Transfer" ? "" : formData.toBankId })}
                  disabled={!!editItem}
                >
                  <SelectTrigger><SelectValue placeholder="Select Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Deposit">Deposit</SelectItem>
                    <SelectItem value="Withdraw">Withdraw</SelectItem>
                    <SelectItem value="Transfer">Transfer</SelectItem>
                  </SelectContent>
                </Select>
                {editItem && <p className="text-xs text-muted-foreground">Transaction type cannot be changed after creation</p>}
              </div>

              {/* Amount */}
              <div className="space-y-1.5">
                <Label>Amount <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.amount || ""}
                  onChange={e => setFormData({ ...formData, amount: e.target.value })}
                  placeholder="0.00"
                />
              </div>

              {/* To Bank - only for Transfer */}
              {formData.type === "Transfer" && (
                <div className="space-y-1.5">
                  <Label>To Bank <span className="text-red-500">*</span></Label>
                  <Select value={formData.toBankId || ""} onValueChange={v => setFormData({ ...formData, toBankId: v })}>
                    <SelectTrigger><SelectValue placeholder="Select Target Bank" /></SelectTrigger>
                    <SelectContent>
                      {banks.filter((b: any) => b.isActive !== false && b.id !== formData.bankId).map((bank: any) => (
                        <SelectItem key={bank.id} value={bank.id}>{bank.bankName} — {bank.accountNo}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedToBank && (
                    <p className={`text-xs font-mono ${selectedToBank.currentBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      Target Balance: {fmt(selectedToBank.currentBalance, "currency")}
                    </p>
                  )}
                  {sameBankError && (
                    <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />Source and target bank cannot be the same
                    </p>
                  )}
                </div>
              )}

              {/* Date */}
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={formData.status || "Approved"} onValueChange={v => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue placeholder="Select Status" /></SelectTrigger>
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
              <Textarea
                value={formData.description || ""}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Transaction description..."
                rows={3}
              />
            </div>

            {/* Insufficient Balance Warning */}
            {insufficientBalance && (
              <Card className="border-red-500 bg-red-50 dark:bg-red-900/20">
                <CardContent className="p-3">
                  <p className="text-red-600 text-sm font-bold flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    Insufficient balance! Available: {fmt(selectedBank?.currentBalance, "currency")}, Requested: {fmt(Number(formData.amount), "currency")}
                  </p>
                  <p className="text-red-700 text-xs mt-1">This transaction will be blocked until sufficient funds are available.</p>
                </CardContent>
              </Card>
            )}

            {/* Same Bank Validation Warning */}
            {sameBankError && (
              <Card className="border-red-500 bg-red-50 dark:bg-red-900/20">
                <CardContent className="p-3">
                  <p className="text-red-600 text-sm font-bold flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    Source bank and target bank cannot be the same!
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              className="bg-[#2563eb] hover:bg-[#1d4ed8]"
              onClick={handleSave}
              disabled={saving || insufficientBalance || sameBankError}
            >
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              {editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Delete</DialogTitle></DialogHeader>
          <DialogDescription>Delete Bank Transaction {deleteItem?.transactionCode}? The bank balance will be reversed. This cannot be undone.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
