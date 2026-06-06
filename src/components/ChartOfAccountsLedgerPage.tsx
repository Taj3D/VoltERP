"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Lock, Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  ChevronDown, ChevronRight, FileDown, CheckCircle, AlertTriangle,
  BookOpen, FileText, X, Shield, ArrowUpCircle, ArrowDownCircle
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

const AUDIT_MASK = "N/A (Audit Mode)";

const bdtFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (v: any, type?: string) => {
  if (String(v) === AUDIT_MASK) return AUDIT_MASK;
  if (v === null || v === undefined) return "—";
  if (type === "currency") return `৳${bdtFmt.format(Number(v))}`;
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
  const isSR = authState.user?.role === "sr";
  const isDealer = authState.user?.role === "dealer";
  const isAdmin = authState.user?.role === "admin";
  const isManager = authState.user?.role === "manager";

  return { ...authState, isVatAuditor, isSR, isDealer, isAdmin, isManager, user: authState.user };
}

// ============================================================
// ChartOfAccountsLedgerPage Component
// ============================================================

const CLASSIFICATION_COLORS: Record<string, string> = {
  Asset: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Liability: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Income: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  Expense: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  Equity: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const REF_TYPE_OPTIONS = [
  { value: "SalesOrder", label: "Sales Order" },
  { value: "PurchaseOrder", label: "Purchase Order" },
  { value: "Expense", label: "Expense" },
  { value: "Income", label: "Income" },
  { value: "CashCollection", label: "Cash Collection" },
  { value: "CashDelivery", label: "Cash Delivery" },
  { value: "BankTransaction", label: "Bank Transaction" },
  { value: "Manual", label: "Manual" },
];

export default function ChartOfAccountsLedgerPage() {
  const { toast } = useToast();
  const { isVatAuditor, isSR, isDealer, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"coa" | "ledger">("coa");

  // COA state
  const [accounts, setAccounts] = useState<any[]>([]);
  const [coaSearch, setCoaSearch] = useState("");
  const [coaFilter, setCoaFilter] = useState("all");
  const [coaLoading, setCoaLoading] = useState(true);
  const [coaForm, setCoaForm] = useState(false);
  const [coaEdit, setCoaEdit] = useState<any>(null);
  const [coaDelete, setCoaDelete] = useState<any>(null);
  const [coaSaving, setCoaSaving] = useState(false);
  const [expandedCOA, setExpandedCOA] = useState<Set<string>>(new Set());

  // Ledger state
  const [entries, setEntries] = useState<any[]>([]);
  const [ledLoading, setLedLoading] = useState(true);
  const [ledSearch, setLedSearch] = useState("");
  const [ledFrom, setLedFrom] = useState("");
  const [ledTo, setLedTo] = useState("");
  const [ledRefType, setLedRefType] = useState("all");
  const [ledForm, setLedForm] = useState(false);
  const [ledEdit, setLedEdit] = useState<any>(null);
  const [ledDelete, setLedDelete] = useState<any>(null);
  const [ledSaving, setLedSaving] = useState(false);
  const [lockedPeriods, setLockedPeriods] = useState<any[]>([]);
  const [balanceVerification, setBalanceVerification] = useState<any>(null);
  const [verifyingBalance, setVerifyingBalance] = useState(false);

  // Form data
  const [coaFormData, setCoaFormData] = useState<Record<string, any>>({
    code: "", name: "", classification: "Asset", parentAccountId: "", openingBalance: 0, openingBalanceType: "Dr",
  });
  const [ledFormData, setLedFormData] = useState<Record<string, any>>({
    entryCode: "", date: new Date().toISOString().split("T")[0], accountId: "", account: "", particulars: "", debit: 0, credit: 0, reference: "", referenceType: "Manual",
  });

  // ALL hooks must be called before any early returns

  // Load COA data
  const loadCOA = useCallback(async () => {
    setCoaLoading(true);
    try {
      const res = await apiFetch("/api/chart-of-accounts");
      setAccounts(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setCoaLoading(false); }
  }, [toast]);

  // Load Ledger data
  const loadLedger = useCallback(async () => {
    setLedLoading(true);
    try {
      let url = "/api/ledger-entries?";
      if (ledFrom) url += `from=${ledFrom}&`;
      if (ledTo) url += `to=${ledTo}&`;
      if (ledSearch) url += `account=${encodeURIComponent(ledSearch)}&`;
      if (ledRefType && ledRefType !== "all") url += `referenceType=${ledRefType}&`;
      const res = await apiFetch(url);
      setEntries(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLedLoading(false); }
  }, [toast, ledFrom, ledTo, ledSearch, ledRefType]);

  // Load locked periods
  const loadLockedPeriods = useCallback(async () => {
    try {
      const res = await apiFetch("/api/period-close");
      const data = Array.isArray(res) ? res : res.data || [];
      setLockedPeriods(data.filter((p: any) => p.isLocked));
    } catch {}
  }, []);

  useEffect(() => { loadCOA(); loadLockedPeriods(); }, [loadCOA, loadLockedPeriods]);
  useEffect(() => { if (activeTab === "ledger") loadLedger(); }, [activeTab, loadLedger]);

  // Check if any ledger entry falls in a locked period
  const hasLockedEntry = useMemo(() => {
    if (lockedPeriods.length === 0 || entries.length === 0) return false;
    return entries.some((e: any) => {
      const d = new Date(e.date);
      const m = d.getMonth() + 1;
      const y = d.getFullYear();
      return lockedPeriods.some((p: any) => p.periodMonth === m && p.periodYear === y);
    });
  }, [entries, lockedPeriods]);

  // COA filtered data
  const filteredCOA = useMemo(() => {
    let result = accounts;
    if (coaFilter !== "all") result = result.filter((a: any) => a.classification === coaFilter);
    if (coaSearch) {
      const s = coaSearch.toLowerCase();
      result = result.filter((a: any) =>
        a.code?.toLowerCase().includes(s) || a.name?.toLowerCase().includes(s)
      );
    }
    return result;
  }, [accounts, coaFilter, coaSearch]);

  // COA Stats
  const coaStats = useMemo(() => ({
    total: accounts.length,
    assets: accounts.filter((a: any) => a.classification === "Asset").length,
    liabilities: accounts.filter((a: any) => a.classification === "Liability").length,
    incomeExpense: accounts.filter((a: any) => a.classification === "Income" || a.classification === "Expense").length,
  }), [accounts]);

  // Ledger Stats
  const ledStats = useMemo(() => ({
    total: entries.length,
    totalDebit: entries.reduce((s: number, e: any) => s + (e.debit || 0), 0),
    totalCredit: entries.reduce((s: number, e: any) => s + (e.credit || 0), 0),
    balance: entries.reduce((s: number, e: any) => s + (e.debit || 0) - (e.credit || 0), 0),
  }), [entries]);

  // RBAC: SR/Dealer => 403 (AFTER all hooks)
  if (isSR || isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-red-300 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">403 - Access Denied</h3>
            <p className="text-muted-foreground">You do not have permission to access Accounting Reports. Contact your administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // COA CRUD
  const openCOACreate = () => {
    const count = accounts.length;
    setCoaFormData({
      code: `COA-${String(count + 1).padStart(5, "0")}`,
      name: "", classification: "Asset", parentAccountId: "", openingBalance: 0, openingBalanceType: "Dr",
    });
    setCoaEdit(null);
    setCoaForm(true);
  };

  const openCOAEdit = (item: any) => {
    setCoaFormData({
      code: item.code || "",
      name: item.name || "",
      classification: item.classification || "Asset",
      parentAccountId: item.parentAccountId || "",
      openingBalance: item.openingBalance || 0,
      openingBalanceType: item.openingBalanceType || "Dr",
    });
    setCoaEdit(item);
    setCoaForm(true);
  };

  const saveCOA = async () => {
    if (!coaFormData.name) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }
    setCoaSaving(true);
    try {
      const payload = {
        name: coaFormData.name,
        classification: coaFormData.classification,
        parentAccountId: coaFormData.parentAccountId || null,
        openingBalance: Number(coaFormData.openingBalance) || 0,
        openingBalanceType: coaFormData.openingBalanceType,
      };
      if (coaEdit) {
        await apiFetch(`/api/chart-of-accounts/${coaEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Account updated" });
      } else {
        await apiFetch("/api/chart-of-accounts", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Account created" });
      }
      setCoaForm(false); loadCOA();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setCoaSaving(false); }
  };

  const deleteCOA = async () => {
    if (!coaDelete) return;
    try {
      await apiFetch(`/api/chart-of-accounts/${coaDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted" }); setCoaDelete(null); loadCOA();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // Ledger CRUD
  const openLedCreate = () => {
    const count = entries.length;
    setLedFormData({
      entryCode: `LED-${String(count + 1).padStart(5, "0")}`,
      date: new Date().toISOString().split("T")[0],
      accountId: "", account: "", particulars: "", debit: 0, credit: 0, reference: "", referenceType: "Manual",
    });
    setLedEdit(null);
    setLedForm(true);
  };

  const openLedEdit = (item: any) => {
    setLedFormData({
      entryCode: item.entryCode || "",
      date: item.date ? item.date.split("T")[0] : "",
      accountId: item.accountId || "",
      account: item.account || "",
      particulars: item.particulars || "",
      debit: item.debit || 0,
      credit: item.credit || 0,
      reference: item.reference || "",
      referenceType: item.referenceType || "Manual",
    });
    setLedEdit(item);
    setLedForm(true);
  };

  const saveLedger = async () => {
    if (!ledFormData.date || !ledFormData.account) {
      toast({ title: "Error", description: "Date and Account are required", variant: "destructive" });
      return;
    }
    const d = Number(ledFormData.debit) || 0;
    const c = Number(ledFormData.credit) || 0;
    if (d > 0 && c > 0) {
      toast({ title: "Double-Entry Error", description: "An entry cannot have both debit and credit > 0", variant: "destructive" });
      return;
    }
    if (d === 0 && c === 0) {
      toast({ title: "Error", description: "Either debit or credit must be > 0", variant: "destructive" });
      return;
    }
    setLedSaving(true);
    try {
      const payload = {
        date: ledFormData.date,
        account: ledFormData.account,
        particulars: ledFormData.particulars || null,
        debit: d,
        credit: c,
        reference: ledFormData.reference || null,
        referenceType: ledFormData.referenceType || null,
        accountId: ledFormData.accountId || null,
      };
      if (ledEdit) {
        await apiFetch(`/api/ledger-entries/${ledEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Entry updated" });
      } else {
        await apiFetch("/api/ledger-entries", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Entry created" });
      }
      setLedForm(false); loadLedger();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setLedSaving(false); }
  };

  const deleteLedger = async () => {
    if (!ledDelete) return;
    try {
      await apiFetch(`/api/ledger-entries/${ledDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted" }); setLedDelete(null); loadLedger();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // Triple Utility Bundle
  const exportCSV = (title: string, headers: string[], rows: string[][]) => {
    try {
      exportToCSVSimple(title, headers, rows);
      toast({ title: "Exported", description: `${title} exported to CSV` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const exportPDF = (title: string, headers: string[], rows: string[][]) => {
    try {
      const printedBy = user?.displayName || user?.name || "System";
      exportToPDFSimple(title, headers, rows, "landscape", undefined, undefined, { preparedBy: printedBy, checkedBy: "", authorizedBy: "", printedBy });
      toast({ title: "Exported", description: `${title} exported to PDF` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleCOAImportCSV = () => {
    importFromCSV({
      apiPath: "/api/chart-of-accounts",
      formFields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "classification", label: "Classification", type: "select", options: [{ value: "Asset", label: "Asset" }, { value: "Liability", label: "Liability" }, { value: "Income", label: "Income" }, { value: "Expense", label: "Expense" }, { value: "Equity", label: "Equity" }] },
        { key: "openingBalance", label: "Opening Balance", type: "number" },
        { key: "openingBalanceType", label: "Opening Type", type: "select", options: [{ value: "Dr", label: "Dr" }, { value: "Cr", label: "Cr" }] },
      ],
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
      loadCOA();
    });
  };

  const handleLedImportCSV = () => {
    importFromCSV({
      apiPath: "/api/ledger-entries",
      formFields: [
        { key: "date", label: "Date", type: "date", required: true },
        { key: "account", label: "Account", type: "text", required: true },
        { key: "particulars", label: "Particulars", type: "text" },
        { key: "debit", label: "Debit", type: "number" },
        { key: "credit", label: "Credit", type: "number" },
        { key: "reference", label: "Reference", type: "text" },
        { key: "referenceType", label: "Reference Type", type: "select", options: [{ value: "Manual", label: "Manual" }, { value: "SalesOrder", label: "Sales Order" }, { value: "PurchaseOrder", label: "Purchase Order" }, { value: "Expense", label: "Expense" }, { value: "Income", label: "Income" }, { value: "CashCollection", label: "Cash Collection" }, { value: "CashDelivery", label: "Cash Delivery" }, { value: "BankTransaction", label: "Bank Transaction" }] },
      ],
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
      loadLedger();
    });
  };

  const toggleCOAExpand = (id: string) => {
    setExpandedCOA(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  // LED-001: Verify ledger balance
  const verifyBalance = async () => {
    setVerifyingBalance(true);
    try {
      let url = "/api/ledger-entries?action=verify-balance";
      if (ledFrom) url += `&from=${ledFrom}`;
      if (ledTo) url += `&to=${ledTo}`;
      const result = await apiFetch(url);
      setBalanceVerification(result);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setVerifyingBalance(false);
    }
  };

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Internal cost prices and net margins hidden. Only legal outward/inward invoice tax records shown.</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <BookOpen className="w-6 h-6" />
          Chart of Accounts & Ledger
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={activeTab === "coa" ? handleCOAImportCSV : handleLedImportCSV}>
            <Upload className="w-4 h-4 mr-1" />Import CSV
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (activeTab === "coa") {
              exportCSV("Chart-of-Accounts", ["Code", "Name", "Classification", "Opening Balance", "Opening Type", "Status"],
                filteredCOA.map((a: any) => [a.code, a.name, a.classification, String(a.openingBalance), a.openingBalanceType, a.isActive ? "Active" : "Inactive"]));
            } else {
              exportCSV("Ledger-Entries", ["Code", "Date", "Account", "Particulars", "Debit", "Credit", "Reference", "Ref Type"],
                entries.map((e: any) => [e.entryCode, fmtDate(e.date), e.account, e.particulars || "", isVatAuditor ? AUDIT_MASK : String(e.debit), isVatAuditor ? AUDIT_MASK : String(e.credit), e.reference || "", e.referenceType || ""]));
            }
          }}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (activeTab === "coa") {
              exportPDF("Chart-of-Accounts", ["Code", "Name", "Classification", "Opening Balance", "Opening Type", "Status"],
                filteredCOA.map((a: any) => [a.code, a.name, a.classification, String(a.openingBalance), a.openingBalanceType, a.isActive ? "Active" : "Inactive"]));
            } else {
              exportPDF("Ledger-Entries", ["Code", "Date", "Account", "Particulars", "Debit", "Credit", "Reference", "Ref Type"],
                entries.map((e: any) => [e.entryCode, fmtDate(e.date), e.account, e.particulars || "", isVatAuditor ? AUDIT_MASK : String(e.debit), isVatAuditor ? AUDIT_MASK : String(e.credit), e.reference || "", e.referenceType || ""]));
            }
          }}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={activeTab === "coa" ? openCOACreate : openLedCreate} disabled={isVatAuditor}>
            <Plus className="w-4 h-4 mr-1" />Create {activeTab === "coa" ? "Account" : "Entry"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "coa" | "ledger")}>
        <TabsList className="flex overflow-x-auto gap-1 pb-1 scrollbar-none">
          <TabsTrigger value="coa" className="flex items-center gap-1"><BookOpen className="w-4 h-4" />Chart of Accounts</TabsTrigger>
          <TabsTrigger value="ledger" className="flex items-center gap-1"><FileText className="w-4 h-4" />Ledger Entries</TabsTrigger>
        </TabsList>

        <TabsContent value="coa">
          {/* COA Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 mt-4">
            {[
              { label: "Total Accounts", value: coaStats.total, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
              { label: "Assets", value: coaStats.assets, icon: Shield, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
              { label: "Liabilities", value: coaStats.liabilities, icon: AlertTriangle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
              { label: "Income/Expense", value: coaStats.incomeExpense, icon: FileText, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
            ].map((stat, i) => (
              <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
              </CardContent></Card>
            ))}
          </div>

          {/* COA Table */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by code or name..." value={coaSearch} onChange={e => setCoaSearch(e.target.value)} className="pl-10" />
                </div>
                <Select value={coaFilter} onValueChange={setCoaFilter}>
                  <SelectTrigger className="w-40"><SelectValue placeholder="Classification" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Classifications</SelectItem>
                    <SelectItem value="Asset">Asset</SelectItem>
                    <SelectItem value="Liability">Liability</SelectItem>
                    <SelectItem value="Income">Income</SelectItem>
                    <SelectItem value="Expense">Expense</SelectItem>
                    <SelectItem value="Equity">Equity</SelectItem>
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={loadCOA}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <div className="table-container overflow-x-auto overflow-y-auto max-h-[60vh] rounded-md border -mx-2 sm:mx-0">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">+</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Classification</TableHead>
                      <TableHead>Opening Balance</TableHead>
                      <TableHead>Dr/Cr</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {coaLoading ? (
                      <TableRow><TableCell colSpan={8} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredCOA.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No accounts found</TableCell></TableRow>
                    ) : filteredCOA.map((item: any) => (
                      <React.Fragment key={item.id}>
                        <TableRow className="data-table-row hover:bg-muted/50">
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleCOAExpand(item.id)}>
                              {expandedCOA.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.code}</TableCell>
                          <TableCell>{item.name}</TableCell>
                          <TableCell><Badge className={CLASSIFICATION_COLORS[item.classification] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}>{item.classification}</Badge></TableCell>
                          <TableCell className="font-mono">{isVatAuditor ? AUDIT_MASK : fmt(item.openingBalance, "currency")}</TableCell>
                          <TableCell><Badge variant="outline">{item.openingBalanceType}</Badge></TableCell>
                          <TableCell><Badge className={item.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>{item.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openCOAEdit(item)} disabled={isVatAuditor}><Edit className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setCoaDelete(item)} disabled={isVatAuditor}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedCOA.has(item.id) && (
                          <TableRow>
                            <TableCell colSpan={8} className="bg-muted/30 p-3">
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 text-sm">
                                <div><span className="text-muted-foreground">Parent:</span> <span className="font-medium text-slate-900 dark:text-white">{item.parentAccount?.name || "—"}</span></div>
                                <div><span className="text-muted-foreground">Child Accounts:</span> <span className="font-medium text-slate-900 dark:text-white">{item._count?.childAccounts || 0}</span></div>
                                <div><span className="text-muted-foreground">Ledger Entries:</span> <span className="font-medium text-slate-900 dark:text-white">{item._count?.ledgerEntries || 0}</span></div>
                                <div><span className="text-muted-foreground">Own Balance:</span> <span className="font-medium text-slate-900 dark:text-white">{isVatAuditor ? AUDIT_MASK : fmt(item.subBalance?.ownNet || 0, "currency")}</span></div>
                                <div><span className="text-muted-foreground">Child Balance:</span> <span className="font-medium text-slate-900 dark:text-white">{isVatAuditor ? AUDIT_MASK : fmt(item.subBalance?.childNet || 0, "currency")}</span></div>
                                <div><span className="text-muted-foreground">Total Balance:</span> <span className="font-bold text-slate-900 dark:text-white">{isVatAuditor ? AUDIT_MASK : fmt(item.subBalance?.totalNet || 0, "currency")}</span></div>
                                {item.childAccounts?.length > 0 && (
                                  <div className="col-span-3">
                                    <span className="text-muted-foreground">Children:</span>{" "}
                                    {item.childAccounts.map((c: any) => (
                                      <Badge key={c.id} variant="outline" className="mr-1 mb-1">{c.code} - {c.name}</Badge>
                                    ))}
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
              <div className="mt-2 text-xs text-muted-foreground">Showing {filteredCOA.length} of {accounts.length} accounts</div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="ledger">
          {/* Period Lock Banner */}
          {hasLockedEntry && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mt-4">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">One or more entries fall within a locked period. Editing is restricted.</span>
            </div>
          )}

          {/* LED-001: Balance Verification */}
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={verifyBalance}
              disabled={verifyingBalance}
            >
              {verifyingBalance ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              Verify Ledger Balance
            </Button>
            {balanceVerification && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium ${
                balanceVerification.balanced
                  ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800"
                  : "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800"
              }`}>
                {balanceVerification.balanced ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                {balanceVerification.balanced ? "Balanced" : "Unbalanced"}
                {!isVatAuditor && (
                  <span className="font-mono text-xs">
                    (Dr: {fmt(balanceVerification.totalDebit, "currency")} | Cr: {fmt(balanceVerification.totalCredit, "currency")}
                    {balanceVerification.difference > 0 && ` | Diff: ${fmt(balanceVerification.difference, "currency")}`})
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Ledger Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 mt-4">
            {[
              { label: "Total Entries", value: ledStats.total, icon: FileText, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
              { label: "Total Debit", value: isVatAuditor ? AUDIT_MASK : fmt(ledStats.totalDebit, "currency"), icon: ArrowUpCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
              { label: "Total Credit", value: isVatAuditor ? AUDIT_MASK : fmt(ledStats.totalCredit, "currency"), icon: ArrowDownCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
              { label: "Balance", value: isVatAuditor ? AUDIT_MASK : fmt(ledStats.balance, "currency"), icon: CheckCircle, color: ledStats.balance === 0 ? "text-green-600" : "text-red-600", bg: ledStats.balance === 0 ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30" },
            ].map((stat, i) => (
              <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
              </CardContent></Card>
            ))}
          </div>

          {/* Ledger Filters */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by account..." value={ledSearch} onChange={e => setLedSearch(e.target.value)} className="pl-10" />
                </div>
                <Input type="date" value={ledFrom} onChange={e => setLedFrom(e.target.value)} className="w-40" placeholder="From" />
                <Input type="date" value={ledTo} onChange={e => setLedTo(e.target.value)} className="w-40" placeholder="To" />
                <Select value={ledRefType} onValueChange={setLedRefType}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="Ref Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Reference Types</SelectItem>
                    {REF_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="sm" onClick={loadLedger}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <div className="table-container overflow-x-auto overflow-y-auto max-h-[60vh] rounded-md border -mx-2 sm:mx-0">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Entry Code</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Particulars</TableHead>
                      <TableHead>Debit</TableHead>
                      <TableHead>Credit</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Ref Type</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledLoading ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : entries.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No entries found</TableCell></TableRow>
                    ) : entries.map((item: any) => (
                      <TableRow key={item.id} className="data-table-row hover:bg-muted/50">
                        <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.entryCode}</TableCell>
                        <TableCell>{fmtDate(item.date)}</TableCell>
                        <TableCell>{item.account}</TableCell>
                        <TableCell>{item.particulars || "—"}</TableCell>
                        <TableCell className="font-mono">
                          {isVatAuditor
                            ? (String(item.debit) === AUDIT_MASK ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{AUDIT_MASK}</span> : item.referenceType === "Manual" ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{AUDIT_MASK}</span> : fmt(item.debit, "currency"))
                            : (item.debit > 0 ? fmt(item.debit, "currency") : "—")}
                        </TableCell>
                        <TableCell className="font-mono">
                          {isVatAuditor
                            ? (String(item.credit) === AUDIT_MASK ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{AUDIT_MASK}</span> : item.referenceType === "Manual" ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{AUDIT_MASK}</span> : fmt(item.credit, "currency"))
                            : (item.credit > 0 ? fmt(item.credit, "currency") : "—")}
                        </TableCell>
                        <TableCell>{item.reference || "—"}</TableCell>
                        <TableCell><Badge variant="outline">{item.referenceType || "—"}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openLedEdit(item)} disabled={isVatAuditor}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setLedDelete(item)} disabled={isVatAuditor}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {entries.length} entries</div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* COA Create/Edit Dialog */}
      <Dialog open={coaForm} onOpenChange={setCoaForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{coaEdit ? "Edit" : "Create"} Account</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input className="bg-muted cursor-not-allowed" value={coaFormData.code || "Auto-generated"} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Name <span className="text-red-500">*</span></Label>
                <Input value={coaFormData.name || ""} onChange={e => setCoaFormData({ ...coaFormData, name: e.target.value })} placeholder="Account name" />
              </div>
              <div className="space-y-1.5">
                <Label>Classification</Label>
                <Select value={coaFormData.classification || "Asset"} onValueChange={v => setCoaFormData({ ...coaFormData, classification: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Asset">Asset</SelectItem>
                    <SelectItem value="Liability">Liability</SelectItem>
                    <SelectItem value="Income">Income</SelectItem>
                    <SelectItem value="Expense">Expense</SelectItem>
                    <SelectItem value="Equity">Equity</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Parent Account</Label>
                <Select value={coaFormData.parentAccountId || "None"} onValueChange={v => setCoaFormData({ ...coaFormData, parentAccountId: v === "None" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select parent" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">None</SelectItem>
                    {accounts.filter((a: any) => a.id !== coaEdit?.id).map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Opening Balance</Label>
                {isVatAuditor ? (
                  <Input className="bg-muted cursor-not-allowed" value="N/A (Audit Mode)" readOnly />
                ) : (
                  <Input type="number" step="0.01" value={coaFormData.openingBalance || 0} onChange={e => setCoaFormData({ ...coaFormData, openingBalance: e.target.value })} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Opening Type</Label>
                <Select value={coaFormData.openingBalanceType || "Dr"} onValueChange={v => setCoaFormData({ ...coaFormData, openingBalanceType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Dr">Dr (Debit)</SelectItem>
                    <SelectItem value="Cr">Cr (Credit)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoaForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={saveCOA} disabled={coaSaving || isVatAuditor}>
              {coaSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{coaEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger Create/Edit Dialog */}
      <Dialog open={ledForm} onOpenChange={setLedForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{ledEdit ? "Edit" : "Create"} Ledger Entry</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Entry Code</Label>
                <Input className="bg-muted cursor-not-allowed" value={ledFormData.entryCode || "Auto-generated"} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={ledFormData.date || ""} onChange={e => setLedFormData({ ...ledFormData, date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Account <span className="text-red-500">*</span></Label>
                <Select value={ledFormData.accountId || "None"} onValueChange={v => {
                  const acct = accounts.find((a: any) => a.id === v);
                  setLedFormData({ ...ledFormData, accountId: v === "None" ? "" : v, account: acct ? `${acct.name}` : ledFormData.account });
                }}>
                  <SelectTrigger><SelectValue placeholder="Select Account" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">None (Manual)</SelectItem>
                    {accounts.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{a.code} - {a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Account Name</Label>
                <Input value={ledFormData.account || ""} onChange={e => setLedFormData({ ...ledFormData, account: e.target.value })} placeholder="Account name" />
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>Particulars</Label>
                <Textarea value={ledFormData.particulars || ""} onChange={e => setLedFormData({ ...ledFormData, particulars: e.target.value })} placeholder="Entry particulars" />
              </div>
              <div className="space-y-1.5">
                <Label>Debit</Label>
                {isVatAuditor ? (
                  <Input className="bg-amber-50 dark:bg-amber-900/20 cursor-not-allowed text-amber-600" value="N/A (Audit Mode)" readOnly />
                ) : (
                  <Input type="number" step="0.01" value={ledFormData.debit || 0} onChange={e => setLedFormData({ ...ledFormData, debit: e.target.value })} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Credit</Label>
                {isVatAuditor ? (
                  <Input className="bg-amber-50 dark:bg-amber-900/20 cursor-not-allowed text-amber-600" value="N/A (Audit Mode)" readOnly />
                ) : (
                  <Input type="number" step="0.01" value={ledFormData.credit || 0} onChange={e => setLedFormData({ ...ledFormData, credit: e.target.value })} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Reference</Label>
                <Input value={ledFormData.reference || ""} onChange={e => setLedFormData({ ...ledFormData, reference: e.target.value })} placeholder="Reference" />
              </div>
              <div className="space-y-1.5">
                <Label>Reference Type</Label>
                <Select value={ledFormData.referenceType || "Manual"} onValueChange={v => setLedFormData({ ...ledFormData, referenceType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {REF_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {Number(ledFormData.debit) > 0 && Number(ledFormData.credit) > 0 && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />Double-entry violation: An entry cannot have both debit and credit &gt; 0
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLedForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={saveLedger} disabled={ledSaving || isVatAuditor}>
              {ledSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{ledEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* COA Delete Dialog */}
      <Dialog open={!!coaDelete} onOpenChange={() => setCoaDelete(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Deactivate Account</DialogTitle></DialogHeader>
          <DialogDescription>Are you sure you want to deactivate account {coaDelete?.code}? The account will be marked as inactive but preserved in the system.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCoaDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteCOA}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Ledger Delete Dialog */}
      <Dialog open={!!ledDelete} onOpenChange={() => setLedDelete(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Deactivate Entry</DialogTitle></DialogHeader>
          <DialogDescription>Are you sure you want to deactivate entry {ledDelete?.entryCode}? The entry will be marked as inactive but preserved in the system.</DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLedDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteLedger}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
