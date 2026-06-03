"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  DollarSign, ArrowDownCircle, ArrowUpCircle, Banknote, Landmark,
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search, Lock,
  FileDown, CheckCircle, AlertTriangle, ChevronDown, ChevronRight,
  FileText, Building2, Wallet, X, Shield, BookOpen
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
import { exportToPDF, exportToCSVSimple, importFromCSV } from "@/lib/export-utils";
import type { CompanyProfile, ColumnDef } from "@/lib/export-utils";

// ── Utility Functions ──────────────────────────────────────────────
type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

const bdCurrencyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtCurrency = (v: any): string => { if (v === null || v === undefined) return "—"; const n = Number(v); if (isNaN(n)) return "—"; return `৳${bdCurrencyFmt.format(n)}`; };
const fmtDate = (d: string | Date) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const fmtEmpty = (v: any) => (v === null || v === undefined || v === "") ? "—" : String(v);
const sanitizeCurrency = (val: any): number => { const num = Number(val); if (isNaN(num)) return 0; return Math.round(num * 100) / 100; };
const auditMask = "N/A (Audit Mode)";

const statusColor = (status: string) => {
  switch (status) {
    case "Pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "Approved": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "Rejected": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
  }
};

const typeBadge = (type: string) => {
  switch (type) {
    case "Deposit": return { className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", icon: ArrowDownCircle };
    case "Withdraw": return { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", icon: ArrowUpCircle };
    case "Transfer": return { className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400", icon: Banknote };
    default: return { className: "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400", icon: DollarSign };
  }
};

async function apiFetch(path: string, opts?: RequestInit) {
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
  try { const stored = localStorage.getItem("ems_auth"); if (stored) { const parsed = JSON.parse(stored); if (parsed.user?.email) authHeaders["X-User-Email"] = parsed.user.email; } } catch {}
  const res = await fetch(path, { headers: { ...authHeaders, ...opts?.headers }, ...opts });
  if (!res.ok) { if (res.status === 401) { localStorage.removeItem("ems_auth"); window.location.reload(); } const err = await res.json().catch(() => ({ error: res.statusText })); throw new Error(err.error || "Request failed"); }
  return res.json();
}

function useAuth() {
  const getStored = (): { user: { name: string; email: string; role: UserRole; displayName: string } | null; isAuthenticated: boolean } => {
    if (typeof window === "undefined") return { user: null, isAuthenticated: false };
    try { const s = localStorage.getItem("ems_auth"); if (s) return JSON.parse(s); } catch {}
    return { user: null, isAuthenticated: false };
  };
  const [auth, setAuth] = useState(getStored);
  const [, force] = useState({});
  useEffect(() => {
    const l = () => { const s = localStorage.getItem("ems_auth"); if (s) try { setAuth(JSON.parse(s)); } catch {} force({}); };
    window.addEventListener("storage", l); window.addEventListener("auth-change", l);
    return () => { window.removeEventListener("storage", l); window.removeEventListener("auth-change", l); };
  }, []);
  const user = auth.user;
  return { user, isVatAuditor: user?.role === "vat_auditor", isDealer: user?.role === "dealer", isSR: user?.role === "sr", isAdmin: user?.role === "admin" };
}

// ── Stat Card Component ────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, color, bg }: { label: string; value: any; icon: any; color: string; bg: string }) {
  return (
    <Card className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
      <div className={`p-1.5 rounded-lg ${bg} ${color}`}><Icon className="w-4 h-4" /></div>
      <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{value}</p></div>
    </CardContent></Card>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function AccountManagementPage() {
  const { toast } = useToast();
  const { user, isVatAuditor, isDealer, isSR, isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("heads");

  // ── Data states ──────────────────────────────────────────────
  const [heads, setHeads] = useState<any[]>([]);
  const [expenses, setExpenses] = useState<any[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [collections, setCollections] = useState<any[]>([]);
  const [deliveries, setDeliveries] = useState<any[]>([]);
  const [bankTxns, setBankTxns] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [chartOfAccounts, setChartOfAccounts] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | undefined>();

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // ── Form/Dialog states ───────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formContext, setFormContext] = useState<string>("");
  const [formData, setFormData] = useState<Record<string, any>>({});

  // ── Balance validation ───────────────────────────────────────
  const [balanceCheck, setBalanceCheck] = useState<any>(null);

  // ── Load functions ───────────────────────────────────────────
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [h, e, i, c, d, bt, b, coa, po, cust, supp, cp, bv] = await Promise.all([
        apiFetch("/api/expense-income-heads").catch(() => []),
        apiFetch("/api/expenses").catch(() => []),
        apiFetch("/api/incomes").catch(() => []),
        apiFetch("/api/cash-collections").catch(() => []),
        apiFetch("/api/cash-deliveries").catch(() => []),
        apiFetch("/api/bank-transactions").catch(() => []),
        apiFetch("/api/banks").catch(() => []),
        apiFetch("/api/chart-of-accounts").catch(() => []),
        apiFetch("/api/payment-options").catch(() => []),
        apiFetch("/api/customers").catch(() => []),
        apiFetch("/api/suppliers").catch(() => []),
        apiFetch("/api/company-branding").catch(() => ({ company: undefined })),
        apiFetch("/api/account-balance-validation").catch(() => null),
      ]);
      setHeads(Array.isArray(h) ? h : h?.data || []);
      setExpenses(Array.isArray(e) ? e : e?.data || []);
      setIncomes(Array.isArray(i) ? i : i?.data || []);
      setCollections(Array.isArray(c) ? c : c?.data || []);
      setDeliveries(Array.isArray(d) ? d : d?.data || []);
      setBankTxns(Array.isArray(bt) ? bt : bt?.data || []);
      setBanks(Array.isArray(b) ? b : b?.data || []);
      setChartOfAccounts(Array.isArray(coa) ? coa : coa?.data || []);
      setPaymentOptions(Array.isArray(po) ? po : po?.data || []);
      setCustomers(Array.isArray(cust) ? cust : cust?.data || []);
      setSuppliers(Array.isArray(supp) ? supp : supp?.data || []);
      setCompanyProfile((cp as any)?.company);
      setBalanceCheck(bv);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Current tab data ─────────────────────────────────────────
  const currentData = useMemo(() => {
    switch (activeTab) {
      case "heads": return heads;
      case "expenses": return expenses;
      case "incomes": return incomes;
      case "collections": return collections;
      case "deliveries": return deliveries;
      case "bank-transactions": return bankTxns;
      default: return [];
    }
  }, [activeTab, heads, expenses, incomes, collections, deliveries, bankTxns]);

  const filtered = useMemo(() => {
    if (!search) return currentData;
    const s = search.toLowerCase();
    return currentData.filter((item: any) => {
      const searchable = [
        item.expenseCode, item.incomeCode, item.collectionCode, item.deliveryCode, item.transactionCode,
        item.head?.name, item.customer?.name, item.supplier?.name, item.bank?.bankName,
        item.name, item.type, item.status, item.description, item.chequeNo, item.voucherNo
      ].filter(Boolean).join(" ").toLowerCase();
      return searchable.includes(s);
    });
  }, [currentData, search]);

  // ── Stats per tab ────────────────────────────────────────────
  const stats = useMemo(() => {
    switch (activeTab) {
      case "heads": return [
        { label: "Total Heads", value: heads.length, icon: FileText, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
        { label: "Expense Heads", value: heads.filter((h: any) => h.type === "Expense").length, icon: ArrowDownCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
        { label: "Income Heads", value: heads.filter((h: any) => h.type === "Income").length, icon: ArrowUpCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
        { label: "CoA Linked", value: heads.filter((h: any) => h.chartOfAccountId).length, icon: BookOpen, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/30" },
      ];
      case "expenses": return [
        { label: "Total Expenses", value: expenses.length, icon: ArrowDownCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
        { label: "Total Amount", value: isVatAuditor ? auditMask : fmtCurrency(expenses.reduce((s: number, d: any) => s + (d.amount || 0), 0)), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
        { label: "Pending", value: expenses.filter((d: any) => d.status === "Pending").length, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
        { label: "Ledger Posted", value: expenses.filter((d: any) => d.ledgerPosted).length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
      ];
      case "incomes": return [
        { label: "Total Incomes", value: incomes.length, icon: ArrowUpCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
        { label: "Total Amount", value: isVatAuditor ? auditMask : fmtCurrency(incomes.reduce((s: number, d: any) => s + (d.amount || 0), 0)), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
        { label: "Pending", value: incomes.filter((d: any) => d.status === "Pending").length, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
        { label: "Ledger Posted", value: incomes.filter((d: any) => d.ledgerPosted).length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
      ];
      case "collections": return [
        { label: "Total Collections", value: collections.length, icon: Banknote, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
        { label: "Total Amount", value: isVatAuditor ? auditMask : fmtCurrency(collections.reduce((s: number, d: any) => s + (d.amount || 0), 0)), icon: DollarSign, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
        { label: "Pending", value: collections.filter((d: any) => d.status === "Pending").length, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
        { label: "Ledger Posted", value: collections.filter((d: any) => d.ledgerPosted).length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
      ];
      case "deliveries": return [
        { label: "Total Deliveries", value: deliveries.length, icon: ArrowDownCircle, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
        { label: "Total Amount", value: isVatAuditor ? auditMask : fmtCurrency(deliveries.reduce((s: number, d: any) => s + (d.amount || 0), 0)), icon: DollarSign, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
        { label: "Pending", value: deliveries.filter((d: any) => d.status === "Pending").length, icon: FileText, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
        { label: "Ledger Posted", value: deliveries.filter((d: any) => d.ledgerPosted).length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
      ];
      case "bank-transactions": {
        const dep = bankTxns.filter((d: any) => d.type === "Deposit").reduce((s: number, d: any) => s + (d.amount || 0), 0);
        const wit = bankTxns.filter((d: any) => d.type === "Withdraw").reduce((s: number, d: any) => s + (d.amount || 0), 0);
        const net = dep - wit;
        return [
          { label: "Total Transactions", value: bankTxns.length, icon: Banknote, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Total Deposits", value: isVatAuditor ? auditMask : fmtCurrency(dep), icon: ArrowDownCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Total Withdrawals", value: isVatAuditor ? auditMask : fmtCurrency(wit), icon: ArrowUpCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
          { label: "Net Position", value: isVatAuditor ? auditMask : fmtCurrency(net), icon: DollarSign, color: net >= 0 ? "text-green-600" : "text-red-600", bg: net >= 0 ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30" },
          { label: "Ledger Posted", value: bankTxns.filter((d: any) => d.ledgerPosted).length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
        ];
      }
      default: return [];
    }
  }, [activeTab, heads, expenses, incomes, collections, deliveries, bankTxns, isVatAuditor]);

  // ── Toggle expand ────────────────────────────────────────────
  const toggleExpand = (id: string) => setExpandedRows(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // ── Form open/close ──────────────────────────────────────────
  const openCreate = (context: string) => {
    setFormContext(context);
    setEditItem(null);
    setFormData({ date: new Date().toISOString().split("T")[0], status: "Approved", amount: "", headId: "", bankId: "", paymentOptionId: "", chequeNo: "", voucherNo: "", description: "", type: "Deposit" });
    setShowForm(true);
  };

  const openEdit = (item: any, context: string) => {
    setFormContext(context);
    setEditItem(item);
    const codeField = context === "expenses" ? "expenseCode" : context === "incomes" ? "incomeCode" : context === "collections" ? "collectionCode" : context === "deliveries" ? "deliveryCode" : "transactionCode";
    setFormData({
      code: item[codeField] || "",
      date: item.date ? item.date.split("T")[0] : "",
      headId: item.headId || "",
      amount: item.amount || "",
      bankId: item.bankId || "",
      paymentOptionId: item.paymentOptionId || "",
      chequeNo: item.chequeNo || "",
      voucherNo: item.voucherNo || "",
      description: item.description || "",
      status: item.status || "Approved",
      type: item.type || "Deposit",
      toBankId: item.toBankId || "",
      customerId: item.customerId || "",
      supplierId: item.supplierId || "",
      depositorName: item.depositorName || "",
      referenceNo: item.referenceNo || "",
      name: item.name || "",
      chartOfAccountId: item.chartOfAccountId || "",
      type_head: item.type || "Expense",
    });
    setShowForm(true);
  };

  // ── Save handler ─────────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      const apiBaseMap: Record<string, string> = {
        heads: "/api/expense-income-heads",
        expenses: "/api/expenses",
        incomes: "/api/incomes",
        collections: "/api/cash-collections",
        deliveries: "/api/cash-deliveries",
        "bank-transactions": "/api/bank-transactions",
      };
      const apiBase = apiBaseMap[formContext];
      const payload: Record<string, any> = { ...formData, amount: formData.amount ? Number(formData.amount) : undefined };
      // Clean null fields
      for (const key of ["chequeNo", "voucherNo", "description", "paymentOptionId", "bankId", "toBankId", "chartOfAccountId", "referenceNo", "depositorName"]) {
        if (!payload[key]) payload[key] = null;
      }
      if (editItem) {
        await apiFetch(`${apiBase}/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Record updated successfully" });
      } else {
        await apiFetch(apiBase, { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Record created successfully" });
      }
      setShowForm(false);
      loadAll();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSaving(false); }
  };

  // ── Delete handler ───────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteItem) return;
    if (!isAdmin) { toast({ title: "Access Denied", description: "Only administrators can delete financial posts", variant: "destructive" }); setDeleteItem(null); return; }
    try {
      const apiBaseMap: Record<string, string> = { heads: "/api/expense-income-heads", expenses: "/api/expenses", incomes: "/api/incomes", collections: "/api/cash-collections", deliveries: "/api/cash-deliveries", "bank-transactions": "/api/bank-transactions" };
      await apiFetch(`${apiBaseMap[formContext]}/${deleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deleted" });
      setDeleteItem(null);
      loadAll();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // ── Export PDF ───────────────────────────────────────────────
  const exportPDF = () => {
    try {
      const columns: ColumnDef[] = [
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Name/Head", type: "text" },
        { key: "date", label: "Date", type: "date" },
        { key: "amount", label: "Amount", type: "currency" },
        { key: "status", label: "Status", type: "text" },
      ];
      const data = filtered.map((item: any) => ({
        code: item.expenseCode || item.incomeCode || item.collectionCode || item.deliveryCode || item.transactionCode || item.code || "—",
        name: item.head?.name || item.customer?.name || item.supplier?.name || item.bank?.bankName || item.name || "—",
        date: item.date, amount: isVatAuditor ? auditMask : sanitizeCurrency(item.amount || 0), status: item.status,
      }));
      exportToPDF({
        title: `Account Management — ${activeTab}`,
        columns, data, isVatAuditor, vatMaskedColumns: isVatAuditor ? ["amount"] : [],
        company: companyProfile,
        financialFooter: { preparedBy: user?.displayName || "System", checkedBy: "", authorizedBy: "", printedBy: user?.displayName || "System" },
      });
      toast({ title: "Exported", description: "PDF exported successfully" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // ── Export CSV ───────────────────────────────────────────────
  const exportCSV = () => {
    try {
      const headers = ["Code", "Name/Head", "Date", "Amount", "Status"];
      const rows = filtered.map((item: any) => [
        item.expenseCode || item.incomeCode || item.collectionCode || item.deliveryCode || item.transactionCode || item.code || "—",
        item.head?.name || item.customer?.name || item.supplier?.name || item.bank?.bankName || item.name || "—",
        fmtDate(item.date), isVatAuditor ? auditMask : String(item.amount || 0), item.status
      ]);
      exportToCSVSimple(`Account_${activeTab}`, headers, rows);
      toast({ title: "Exported", description: "CSV exported successfully" });
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // ── Import CSV ───────────────────────────────────────────────
  const importCSV = () => {
    const apiBaseMap: Record<string, string> = { heads: "/api/expense-income-heads", expenses: "/api/expenses", incomes: "/api/incomes", collections: "/api/cash-collections", deliveries: "/api/cash-deliveries", "bank-transactions": "/api/bank-transactions" };
    importFromCSV({
      apiPath: apiBaseMap[activeTab] || "/api/expenses",
      formFields: [
        { key: "headId", label: "Head", type: "text" as const },
        { key: "amount", label: "Amount", type: "number" as const, required: true },
        { key: "date", label: "Date", type: "date" as const, required: true },
        { key: "status", label: "Status", type: "select" as const, options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }] },
      ],
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
      loadAll();
    });
  };

  // ── RBAC ─────────────────────────────────────────────────────
  const canCreate = !isVatAuditor && !isDealer;
  const canDelete = isAdmin;

  // ── Dealer restriction ───────────────────────────────────────
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full"><CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Access Restricted</h3>
          <p className="text-muted-foreground">Dealers cannot access Account Management. Please contact your administrator.</p>
        </CardContent></Card>
      </div>
    );
  }

  // ── Render Table Rows ───────────────────────────────────────
  const renderRows = () => {
    if (loading) return <TableRow><TableCell colSpan={10} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>;
    if (filtered.length === 0) return <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No records found</TableCell></TableRow>;

    return filtered.map((item: any) => {
      const code = item.expenseCode || item.incomeCode || item.collectionCode || item.deliveryCode || item.transactionCode || item.code || item.id?.slice(0, 8);
      const name = item.head?.name || item.customer?.name || item.supplier?.name || item.name || "—";
      const amount = isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{auditMask}</span> : fmtCurrency(item.amount || 0);
      const coaName = item.chartOfAccount?.name || item.head?.chartOfAccount?.name || "—";
      const bankName = isVatAuditor ? (item.bank?.bankName ? `${item.bank.bankName.split(" - ")[0]} (Audit)` : "—") : (item.bank?.bankName || "—");

      return (
        <React.Fragment key={item.id}>
          <TableRow className="data-table-row hover:bg-muted/50">
            <TableCell>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(item.id)}>
                {expandedRows.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
              </Button>
            </TableCell>
            <TableCell className="font-mono font-medium text-slate-900 dark:text-white text-xs">{code}</TableCell>
            <TableCell className="text-sm">{name}</TableCell>
            <TableCell className="text-sm text-muted-foreground">{fmtDate(item.date)}</TableCell>
            {activeTab !== "heads" && <TableCell className="font-mono text-sm">{amount}</TableCell>}
            {activeTab !== "heads" && <TableCell className="text-sm">{item.type === "Deposit" || item.type === "Withdraw" || item.type === "Transfer" ? <Badge className={typeBadge(item.type).className}>{item.type}</Badge> : (item.paymentOption?.name || "—")}</TableCell>}
            {activeTab === "bank-transactions" && <TableCell className="font-mono text-sm">{isVatAuditor ? auditMask : fmtCurrency(item.runningBalance)}</TableCell>}
            <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
            {activeTab !== "heads" && <TableCell className="text-xs">{item.ledgerPosted ? <CheckCircle className="w-4 h-4 text-green-500" /> : <X className="w-4 h-4 text-gray-400" />}</TableCell>}
            <TableCell className="text-right">
              <div className="flex items-center justify-end gap-1">
                {canCreate && <Button variant="ghost" size="sm" onClick={() => openEdit(item, activeTab)}><Edit className="w-3.5 h-3.5" /></Button>}
                {canDelete && <Button variant="ghost" size="sm" className="text-red-500" onClick={() => { setFormContext(activeTab); setDeleteItem(item); }}><Trash2 className="w-3.5 h-3.5" /></Button>}
              </div>
            </TableCell>
          </TableRow>
          {expandedRows.has(item.id) && (
            <TableRow>
              <TableCell colSpan={activeTab === "bank-transactions" ? 9 : 8} className="bg-muted/30 p-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-muted-foreground">CoA Account:</span> <span className="font-medium text-slate-900 dark:text-white">{coaName}</span></div>
                  <div><span className="text-muted-foreground">Bank:</span> <span className="font-medium text-slate-900 dark:text-white">{bankName}</span></div>
                  <div><span className="text-muted-foreground">Cheque No:</span> <span className="font-medium text-slate-900 dark:text-white">{isVatAuditor ? auditMask : fmtEmpty(item.chequeNo)}</span></div>
                  <div><span className="text-muted-foreground">Voucher No:</span> <span className="font-medium text-slate-900 dark:text-white">{isVatAuditor ? auditMask : fmtEmpty(item.voucherNo)}</span></div>
                  <div><span className="text-muted-foreground">Description:</span> <span className="font-medium text-slate-900 dark:text-white">{fmtEmpty(item.description)}</span></div>
                  <div><span className="text-muted-foreground">Debit Entry:</span> <span className="font-mono font-medium text-slate-900 dark:text-white">{item.debitEntryCode || "—"}</span></div>
                  <div><span className="text-muted-foreground">Credit Entry:</span> <span className="font-mono font-medium text-slate-900 dark:text-white">{item.creditEntryCode || "—"}</span></div>
                  <div><span className="text-muted-foreground">Created:</span> <span className="font-medium text-slate-900 dark:text-white">{fmtDate(item.createdAt)}</span></div>
                </div>
              </TableCell>
            </TableRow>
          )}
        </React.Fragment>
      );
    });
  };

  // ── Form fields per context ──────────────────────────────────
  const renderFormFields = () => {
    const filteredCoA = chartOfAccounts.filter((c: any) => c.isActive);
    const expenseCoA = filteredCoA.filter((c: any) => c.classification === "Expense");
    const incomeCoA = filteredCoA.filter((c: any) => c.classification === "Income");

    switch (formContext) {
      case "heads":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Name <span className="text-red-500">*</span></Label><Input value={formData.name || ""} onChange={e => setFormData({ ...formData, name: e.target.value })} placeholder="Head name" /></div>
            <div className="space-y-1.5"><Label>Type</Label><Select value={formData.type_head || "Expense"} onValueChange={v => setFormData({ ...formData, type_head: v, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Expense">Expense</SelectItem><SelectItem value="Income">Income</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Chart of Account</Label><Select value={formData.chartOfAccountId || ""} onValueChange={v => setFormData({ ...formData, chartOfAccountId: v })}><SelectTrigger><SelectValue placeholder="Select CoA Account" /></SelectTrigger><SelectContent>{(formData.type_head === "Expense" ? expenseCoA : incomeCoA).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.code} — {c.name}</SelectItem>)}</SelectContent></Select></div>
          </div>
        );
      case "expenses":
      case "incomes": {
        const headType = formContext === "expenses" ? "Expense" : "Income";
        const filteredHeads = heads.filter((h: any) => h.type === headType);
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Date <span className="text-red-500">*</span></Label><Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Head <span className="text-red-500">*</span></Label><Select value={formData.headId || ""} onValueChange={v => setFormData({ ...formData, headId: v })}><SelectTrigger><SelectValue placeholder={`Select ${headType} Head`} /></SelectTrigger><SelectContent>{filteredHeads.map((h: any) => <SelectItem key={h.id} value={h.id}>{h.name} {h.code ? `(${h.code})` : ""}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Amount <span className="text-red-500">*</span></Label>{isVatAuditor ? <Input className="bg-muted cursor-not-allowed" value={auditMask} readOnly /> : <Input type="number" step="0.01" value={formData.amount || ""} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" />}</div>
            <div className="space-y-1.5"><Label>Payment Option</Label><Select value={formData.paymentOptionId || ""} onValueChange={v => setFormData({ ...formData, paymentOptionId: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{paymentOptions.filter((p: any) => p.status === "ACTIVE").map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Bank</Label><Select value={formData.bankId || ""} onValueChange={v => setFormData({ ...formData, bankId: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{banks.filter((b: any) => b.isActive).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bankName}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Cheque No</Label><Input value={formData.chequeNo || ""} onChange={e => setFormData({ ...formData, chequeNo: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Voucher No</Label><Input value={formData.voucherNo || ""} onChange={e => setFormData({ ...formData, voucherNo: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
          </div>
        );
      }
      case "collections":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Customer <span className="text-red-500">*</span></Label><Select value={formData.customerId || ""} onValueChange={v => setFormData({ ...formData, customerId: v })}><SelectTrigger><SelectValue placeholder="Select Customer" /></SelectTrigger><SelectContent>{customers.filter((c: any) => c.isActive).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name} ({c.customerCode})</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Date <span className="text-red-500">*</span></Label><Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Amount <span className="text-red-500">*</span></Label><Input type="number" step="0.01" value={formData.amount || ""} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" /></div>
            <div className="space-y-1.5"><Label>Payment Option</Label><Select value={formData.paymentOptionId || ""} onValueChange={v => setFormData({ ...formData, paymentOptionId: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{paymentOptions.filter((p: any) => p.status === "ACTIVE").map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Bank</Label><Select value={formData.bankId || ""} onValueChange={v => setFormData({ ...formData, bankId: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{banks.filter((b: any) => b.isActive).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bankName}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Cheque No</Label><Input value={formData.chequeNo || ""} onChange={e => setFormData({ ...formData, chequeNo: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
          </div>
        );
      case "deliveries":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Supplier <span className="text-red-500">*</span></Label><Select value={formData.supplierId || ""} onValueChange={v => setFormData({ ...formData, supplierId: v })}><SelectTrigger><SelectValue placeholder="Select Supplier" /></SelectTrigger><SelectContent>{suppliers.filter((s: any) => s.isActive).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.supplierCode})</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Date <span className="text-red-500">*</span></Label><Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Amount <span className="text-red-500">*</span></Label><Input type="number" step="0.01" value={formData.amount || ""} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" /></div>
            <div className="space-y-1.5"><Label>Bank</Label><Select value={formData.bankId || ""} onValueChange={v => setFormData({ ...formData, bankId: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{banks.filter((b: any) => b.isActive).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bankName}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Cheque No</Label><Input value={formData.chequeNo || ""} onChange={e => setFormData({ ...formData, chequeNo: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
          </div>
        );
      case "bank-transactions":
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Bank <span className="text-red-500">*</span></Label><Select value={formData.bankId || ""} onValueChange={v => setFormData({ ...formData, bankId: v })}><SelectTrigger><SelectValue placeholder="Select Bank" /></SelectTrigger><SelectContent>{banks.filter((b: any) => b.isActive).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bankName}</SelectItem>)}</SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Type <span className="text-red-500">*</span></Label><Select value={formData.type || "Deposit"} onValueChange={v => setFormData({ ...formData, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Deposit">Deposit</SelectItem><SelectItem value="Withdraw">Withdraw</SelectItem><SelectItem value="Transfer">Transfer</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label>Amount <span className="text-red-500">*</span></Label><Input type="number" step="0.01" value={formData.amount || ""} onChange={e => setFormData({ ...formData, amount: e.target.value })} placeholder="0.00" /></div>
            {formData.type === "Transfer" && <div className="space-y-1.5"><Label>To Bank <span className="text-red-500">*</span></Label><Select value={formData.toBankId || ""} onValueChange={v => setFormData({ ...formData, toBankId: v })}><SelectTrigger><SelectValue placeholder="Select Target Bank" /></SelectTrigger><SelectContent>{banks.filter((b: any) => b.isActive && b.id !== formData.bankId).map((b: any) => <SelectItem key={b.id} value={b.id}>{b.bankName}</SelectItem>)}</SelectContent></Select></div>}
            <div className="space-y-1.5"><Label>Date <span className="text-red-500">*</span></Label><Input type="date" value={formData.date || ""} onChange={e => setFormData({ ...formData, date: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Cheque No</Label><Input value={formData.chequeNo || ""} onChange={e => setFormData({ ...formData, chequeNo: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Depositor Name</Label><Input value={formData.depositorName || ""} onChange={e => setFormData({ ...formData, depositorName: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Reference No</Label><Input value={formData.referenceNo || ""} onChange={e => setFormData({ ...formData, referenceNo: e.target.value })} /></div>
            <div className="space-y-1.5 md:col-span-2"><Label>Description</Label><Textarea value={formData.description || ""} onChange={e => setFormData({ ...formData, description: e.target.value })} rows={2} /></div>
          </div>
        );
      default: return null;
    }
  };

  // ── MAIN RENDER ──────────────────────────────────────────────
  return (
    <div className="page-enter flex flex-col min-h-screen">
      <div className="flex-1 space-y-4">
        {/* VAT Auditor Badge */}
        {isVatAuditor && (
          <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
            <span className="text-sm text-amber-700 dark:text-amber-400">Financial amounts masked for audit compliance</span>
          </div>
        )}

        {/* Balance Validation Badge */}
        {balanceCheck && (
          <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${balanceCheck.isBalanced ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800" : "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"}`}>
            <Shield className={`w-4 h-4 ${balanceCheck.isBalanced ? "text-green-600" : "text-red-600"}`} />
            <span className={`text-sm font-medium ${balanceCheck.isBalanced ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}`}>
              {balanceCheck.isBalanced ? "Ledger Balanced ✓" : `Imbalance Detected: ${fmtCurrency(balanceCheck.difference)}`}
            </span>
            <span className="text-xs text-muted-foreground ml-2">{balanceCheck.entryCount} entries checked</span>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="w-6 h-6" />
            Account Management
          </h2>
          <div className="flex gap-2 flex-wrap">
            {canCreate && <Button variant="outline" size="sm" onClick={importCSV} disabled={isVatAuditor}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>}
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
            <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
            {canCreate && <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => openCreate(activeTab)}><Plus className="w-4 h-4 mr-1" />Create</Button>}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => { setActiveTab(v); setSearch(""); setExpandedRows(new Set()); }}>
          <TabsList className="flex overflow-x-auto flex-wrap gap-1 pb-1 scrollbar-none">
            <TabsTrigger value="heads" className="flex items-center gap-1"><FileText className="w-4 h-4" />Heads</TabsTrigger>
            <TabsTrigger value="expenses" className="flex items-center gap-1" disabled={isSR}><ArrowDownCircle className="w-4 h-4" />Expenses</TabsTrigger>
            <TabsTrigger value="incomes" className="flex items-center gap-1"><ArrowUpCircle className="w-4 h-4" />Incomes</TabsTrigger>
            <TabsTrigger value="collections" className="flex items-center gap-1"><Banknote className="w-4 h-4" />Collections</TabsTrigger>
            <TabsTrigger value="deliveries" className="flex items-center gap-1" disabled={isSR}><ArrowDownCircle className="w-4 h-4" />Deliveries</TabsTrigger>
            <TabsTrigger value="bank-transactions" className="flex items-center gap-1" disabled={isSR}><Landmark className="w-4 h-4" />Bank Txns</TabsTrigger>
          </TabsList>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 sm:gap-3 mt-4">
            {stats.map((stat, i) => <StatCard key={i} {...stat} />)}
          </div>

          {/* Bank Balance Cards (only for bank-transactions tab) */}
          {activeTab === "bank-transactions" && banks.length > 0 && (
            <div className="mt-2">
              <h3 className="text-sm font-semibold text-muted-foreground mb-2">Bank Account Balances — Ledger Fusion</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                {banks.filter((b: any) => b.isActive !== false).map((bank: any) => {
                  const bType = bank.bankType || "Bank";
                  const borderClass = bType === "MFS" ? "border-l-green-600" : bType === "CashDrawer" ? "border-l-amber-600" : "border-l-blue-600";
                  const coaName = bank.chartOfAccount?.name || "Unmapped";
                  return (
                    <Card key={bank.id} className={`border-l-4 ${borderClass}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <Landmark className="w-4 h-4 shrink-0 text-slate-600 dark:text-slate-400" />
                              <span className="font-semibold text-slate-900 dark:text-white truncate">{bank.bankName}</span>
                            </div>
                            <Badge className={`text-[10px] px-1.5 py-0 ${bType === "MFS" ? "bg-green-100 text-green-700" : bType === "CashDrawer" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>{bType}</Badge>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                              <BookOpen className="w-3 h-3 shrink-0" /><span className="truncate">{coaName}</span>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <p className={`text-lg font-bold font-mono ${bank.currentBalance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                              {isVatAuditor ? auditMask : fmtCurrency(bank.currentBalance)}
                            </p>
                            <p className="text-xs text-muted-foreground">Current Balance</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          )}

          {/* Data Table */}
          <Card className="mt-2">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
                </div>
                <Button variant="outline" size="sm" onClick={loadAll}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <div className="table-container overflow-x-auto overflow-y-auto max-h-[60vh] rounded-md border -mx-2 sm:mx-0">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">+</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Name/Head</TableHead>
                      <TableHead>Date</TableHead>
                      {activeTab !== "heads" && <TableHead>Amount</TableHead>}
                      {activeTab !== "heads" && <TableHead>Type/Option</TableHead>}
                      {activeTab === "bank-transactions" && <TableHead>Running Bal</TableHead>}
                      <TableHead>Status</TableHead>
                      {activeTab !== "heads" && <TableHead>Ledger</TableHead>}
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {renderRows()}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {currentData.length} records</div>
            </CardContent>
          </Card>
        </Tabs>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Record</DialogTitle></DialogHeader>
          {renderFormFields()}
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving}>
              {saving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              {editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader><DialogTitle className="text-red-600">Confirm Deletion</DialogTitle>
            <DialogDescription>This will soft-delete the record and reverse all ledger entries and bank balance changes. This action requires administrator privileges.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}><Trash2 className="w-4 h-4 mr-1" />Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sticky Footer */}
      <footer className="mt-auto border-t bg-white dark:bg-slate-900 py-3 text-center text-xs text-muted-foreground">
        Developed & Copyright by NextGen Digital Studio
      </footer>
    </div>
  );
}
