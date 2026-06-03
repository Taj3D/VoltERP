"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Banknote, ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Plus,
  Edit, Trash2, Download, Upload, RefreshCw, Search, Lock,
  DollarSign, AlertTriangle, FileDown,
  ChevronDown, ChevronRight, Building2, X, Wallet, Landmark,
  Calendar, BookOpen
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
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF,
  exportToCSV,
  importFromCSV,
  type ColumnDef,
  type CompanyProfile,
  type SummaryRow,
} from "@/lib/export-utils";

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
  const isAdmin = authState.user?.role === "admin";

  return { user: authState.user, isAuthenticated: authState.isAuthenticated, isVatAuditor, isDealer, isSR, isAdmin };
}

// ── Intl.NumberFormat('en-US') for ALL financial/numeric figures ──
const bdCurrencyFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtCurrency = (v: any): string => {
  if (v === null || v === undefined) return "—";
  const num = Number(v);
  if (isNaN(num)) return "—";
  return `৳${bdCurrencyFormatter.format(num)}`;
};

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (type === "currency") return fmtCurrency(v);
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  return String(v);
};

const fmtDate = (d: string | Date) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// Empty field default — returns "—" if null/empty
const fmtEmpty = (v: any): string => {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
};

// VAT Auditor mask helper
const auditMask = "N/A (Audit Mode)";

// ── CRITICAL: Currency Sanitization for PDF Export ──────────────
// Prevents corrupted digits in running balances caused by floating-point issues
// Apply to ALL currency values before passing to PDF export
function sanitizeCurrency(val: any): number {
  const num = Number(val);
  if (isNaN(num) || num === null || num === undefined) return 0;
  return Math.round(num * 100) / 100;
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
    if (res.status === 401) {
      localStorage.removeItem("ems_auth");
      window.location.reload();
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ── Bank Type Helpers ───────────────────────────────────────────
const bankTypeBorder: Record<string, string> = {
  Bank: "border-l-blue-600",
  MFS: "border-l-green-600",
  CashDrawer: "border-l-amber-600",
};

const bankTypeIcon: Record<string, any> = {
  Bank: Landmark,
  MFS: Wallet,
  CashDrawer: Building2,
};

const bankTypeBadgeStyle: Record<string, string> = {
  Bank: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  MFS: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  CashDrawer: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const bankTypeLabel: Record<string, string> = {
  Bank: "Bank",
  MFS: "MFS",
  CashDrawer: "Cash Drawer",
};

// ============================================================
// BANK TRANSACTIONS PAGE - Ledger Fusion Edition
// ============================================================

export default function BankTransactionsPage() {
  const { toast } = useToast();
  const { isVatAuditor, isDealer, isSR, isAdmin, user } = useAuth();
  const [data, setData] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [bankTypeFilter, setBankTypeFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [importing, setImporting] = useState(false);

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
    chequeNo: "",
    depositorName: "",
    referenceNo: "",
  });

  // ── Load company branding for PDF export ──────────────────────
  const loadCompanyProfile = useCallback(async () => {
    try {
      const res = await apiFetch("/api/company-branding");
      if (res.company) {
        setCompanyProfile(res.company);
      }
    } catch { /* silent — PDF will use default branding */ }
  }, []);

  // Load bank transactions with server-side filtering
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (bankTypeFilter !== "All") params.set("bankType", bankTypeFilter);
      const qs = params.toString();
      const url = `/api/bank-transactions${qs ? `?${qs}` : ""}`;
      const res = await apiFetch(url);
      setData(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }, [toast, dateFrom, dateTo, bankTypeFilter]);

  // Load bank accounts
  const loadBanks = useCallback(async () => {
    try {
      const res = await apiFetch("/api/banks");
      setBanks(Array.isArray(res) ? res : res.data || []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => { load(); loadBanks(); loadCompanyProfile(); }, [load, loadBanks, loadCompanyProfile]);

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

  // ── Filtered data (client-side search + type filter) ──────────
  const filtered = useMemo(() => {
    let result = data;
    // Type filter
    if (typeFilter !== "All") {
      result = result.filter((item: any) => item.type === typeFilter);
    }
    // Bank type filter (client-side for items already loaded)
    if (bankTypeFilter !== "All") {
      result = result.filter((item: any) => item.bank?.bankType === bankTypeFilter);
    }
    // Date range filter (client-side supplement for items already loaded)
    if (dateFrom) {
      const from = new Date(dateFrom);
      result = result.filter((item: any) => new Date(item.date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      result = result.filter((item: any) => new Date(item.date) <= to);
    }
    // Search filter
    if (!search) return result;
    const s = search.toLowerCase();
    return result.filter((item: any) =>
      item.transactionCode?.toLowerCase().includes(s) ||
      item.bank?.bankName?.toLowerCase().includes(s) ||
      item.type?.toLowerCase().includes(s) ||
      item.description?.toLowerCase().includes(s) ||
      item.chequeNo?.toLowerCase().includes(s) ||
      item.depositorName?.toLowerCase().includes(s) ||
      item.referenceNo?.toLowerCase().includes(s) ||
      item.bank?.chartOfAccount?.name?.toLowerCase().includes(s) ||
      item.status?.toLowerCase().includes(s)
    );
  }, [data, search, typeFilter, bankTypeFilter, dateFrom, dateTo]);

  // ── Enhanced Stats (5 cards) ──────────────────────────────────
  const totalTransactions = filtered.length;
  const totalDeposits = filtered.filter((d: any) => d.type === "Deposit").reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const totalWithdrawals = filtered.filter((d: any) => d.type === "Withdraw").reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const totalTransfers = filtered.filter((d: any) => d.type === "Transfer").reduce((s: number, d: any) => s + (d.amount || 0), 0);
  const netCashPosition = totalDeposits - totalWithdrawals;

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
        return { className: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400", icon: ArrowLeftRight };
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

  // ── Ledger impact for expanded row ────────────────────────────
  const getLedgerImpact = (item: any): { debitAccount: string; creditAccount: string; amount: number } => {
    const bankCoA = item.bank?.chartOfAccount?.name || item.bank?.bankName || "Bank";
    switch (item.type) {
      case "Deposit":
        return { debitAccount: bankCoA, creditAccount: "Cash in Hand", amount: item.amount || 0 };
      case "Withdraw":
        return { debitAccount: "Cash in Hand", creditAccount: bankCoA, amount: item.amount || 0 };
      case "Transfer": {
        const targetCoA = item.toBank?.chartOfAccount?.name || item.toBank?.bankName || "Target Bank";
        return { debitAccount: targetCoA, creditAccount: bankCoA, amount: item.amount || 0 };
      }
      default:
        return { debitAccount: "—", creditAccount: "—", amount: 0 };
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
      chequeNo: "",
      depositorName: "",
      referenceNo: "",
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
      chequeNo: item.chequeNo || "",
      depositorName: item.depositorName || "",
      referenceNo: item.referenceNo || "",
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
        chequeNo: formData.chequeNo || undefined,
        depositorName: formData.depositorName || undefined,
        referenceNo: formData.referenceNo || undefined,
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
      loadBanks();
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

  // ── Enhanced CSV Export with ColumnDef ────────────────────────
  const exportCSV = () => {
    try {
      const columns: ColumnDef[] = [
        { key: "transactionCode", label: "Transaction Code", type: "text" },
        { key: "bankName", label: "Bank", type: "text" },
        { key: "bankType", label: "Bank Type", type: "text" },
        { key: "ledgerAccount", label: "Ledger Account", type: "text" },
        { key: "coaCode", label: "CoA Code", type: "text" },
        { key: "type", label: "Type", type: "text" },
        { key: "amount", label: "Amount", type: "currency" },
        { key: "runningBalance", label: "Running Balance", type: "currency" },
        { key: "chequeNo", label: "Cheque No", type: "text" },
        { key: "depositorName", label: "Depositor", type: "text" },
        { key: "referenceNo", label: "Reference No", type: "text" },
        { key: "toBankName", label: "To Bank", type: "text" },
        { key: "date", label: "Date", type: "date" },
        { key: "status", label: "Status", type: "text" },
      ];

      const vatMaskedColumns = isVatAuditor
        ? ["amount", "runningBalance", "chequeNo", "depositorName", "referenceNo"]
        : [];

      const csvData = filtered.map((item: any) => ({
        transactionCode: item.transactionCode,
        bankName: item.bank?.bankName || "—",
        bankType: item.bank?.bankType || "—",
        ledgerAccount: item.bank?.chartOfAccount?.name || "Unmapped",
        coaCode: item.bank?.chartOfAccount?.code || "—",
        type: item.type,
        amount: sanitizeCurrency(item.amount),
        runningBalance: sanitizeCurrency(item.runningBalance),
        chequeNo: item.chequeNo || "—",
        depositorName: item.depositorName || "—",
        referenceNo: item.referenceNo || "—",
        toBankName: item.type === "Transfer" ? (item.toBank?.bankName || "—") : "—",
        date: item.date,
        status: item.status,
      }));

      exportToCSV({
        title: "Bank Transactions",
        columns,
        data: csvData,
        isVatAuditor,
        vatMaskedColumns,
      });
      toast({ title: "Exported", description: "Bank Transactions exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Enhanced PDF Export with summary rows, company branding, sanitized currency ──
  const exportPDF = () => {
    try {
      const columns: ColumnDef[] = [
        { key: "transactionCode", label: "Code", type: "text" },
        { key: "bankName", label: "Bank", type: "text" },
        { key: "bankType", label: "Bank Type", type: "text" },
        { key: "ledgerAccount", label: "Ledger Account", type: "text" },
        { key: "type", label: "Type", type: "text" },
        { key: "amount", label: "Amount", type: "currency" },
        { key: "runningBalance", label: "Running Bal", type: "currency" },
        { key: "chequeNo", label: "Cheque No", type: "text" },
        { key: "depositorName", label: "Depositor", type: "text" },
        { key: "referenceNo", label: "Reference", type: "text" },
        { key: "toBankName", label: "To Bank", type: "text" },
        { key: "date", label: "Date", type: "date" },
        { key: "status", label: "Status", type: "text" },
      ];

      const vatMaskedColumns = isVatAuditor
        ? ["amount", "runningBalance", "chequeNo", "depositorName", "referenceNo"]
        : [];

      // CRITICAL: Use sanitizeCurrency on ALL currency values to prevent corrupted digits
      const pdfData = filtered.map((item: any) => ({
        transactionCode: item.transactionCode,
        bankName: item.bank?.bankName || "—",
        bankType: item.bank?.bankType || "—",
        ledgerAccount: item.bank?.chartOfAccount?.name || "Unmapped",
        type: item.type,
        amount: sanitizeCurrency(item.amount),
        runningBalance: sanitizeCurrency(item.runningBalance),
        chequeNo: item.chequeNo,
        depositorName: item.depositorName,
        referenceNo: item.referenceNo,
        toBankName: item.type === "Transfer" ? (item.toBank?.bankName || "—") : "—",
        date: item.date,
        status: item.status,
      }));

      // Build summary rows for the PDF
      const colCount = columns.length;
      const summaryRows: SummaryRow[] = [
        {
          cells: [
            "TOTAL DEPOSITS",
            ...Array(colCount - 3).fill(""),
            fmtCurrency(sanitizeCurrency(totalDeposits)),
            "",
          ],
          style: {
            fillColor: [22, 101, 52],   // green-800
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7,
          },
        },
        {
          cells: [
            "TOTAL WITHDRAWALS",
            ...Array(colCount - 3).fill(""),
            fmtCurrency(sanitizeCurrency(totalWithdrawals)),
            "",
          ],
          style: {
            fillColor: [153, 27, 27],   // red-800
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7,
          },
        },
        {
          cells: [
            "TOTAL TRANSFERS",
            ...Array(colCount - 3).fill(""),
            fmtCurrency(sanitizeCurrency(totalTransfers)),
            "",
          ],
          style: {
            fillColor: [7, 89, 133],    // sky-800
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 7,
          },
        },
        {
          cells: [
            "NET CASH POSITION",
            ...Array(colCount - 3).fill(""),
            fmtCurrency(sanitizeCurrency(netCashPosition)),
            "",
          ],
          style: {
            fillColor: netCashPosition >= 0 ? [22, 101, 52] : [153, 27, 27],
            textColor: [255, 255, 255],
            fontStyle: "bold",
            fontSize: 8,
          },
        },
      ];

      exportToPDF({
        title: "Bank Transactions",
        subtitle: dateFrom || dateTo
          ? `Period: ${dateFrom ? fmtDate(dateFrom) : "Start"} — ${dateTo ? fmtDate(dateTo) : "Now"}`
          : undefined,
        orientation: "landscape",
        columns,
        data: pdfData,
        isVatAuditor,
        vatMaskedColumns,
        summaryRows,
        company: companyProfile || undefined,
        financialFooter: {
          preparedBy: user?.displayName || "System",
          checkedBy: "",
          authorizedBy: "",
          printedBy: user?.displayName || "System",
        },
      });
      toast({ title: "Exported", description: "Bank Transactions exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Enhanced CSV Import with bulk-import endpoint and duplicate validation ──
  const handleImportCSV = () => {
    setImporting(true);
    importFromCSV({
      apiPath: "/api/bank-transactions", // Used for file parsing/dialog only
      formFields: [
        { key: "bankName", label: "Bank Name", type: "text", required: true },
        { key: "type", label: "Type", type: "select", required: true, options: [{ value: "Deposit", label: "Deposit" }, { value: "Withdraw", label: "Withdraw" }, { value: "Transfer", label: "Transfer" }] },
        { key: "amount", label: "Amount", type: "number", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "toBankName", label: "To Bank Name", type: "text" },
        { key: "description", label: "Description", type: "text" },
        { key: "chequeNo", label: "Cheque No", type: "text" },
        { key: "depositorName", label: "Depositor Name", type: "text" },
        { key: "referenceNo", label: "Reference No", type: "text" },
        { key: "status", label: "Status", type: "select", options: [{ value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }, { value: "Rejected", label: "Rejected" }] },
      ],
    }).then(async (result) => {
      // The importFromCSV function already attempted individual POSTs
      // But we want to show the detailed feedback from bulk-import
      // If there were no errors from the standard import, report success
      if (result.failed === 0 && result.imported > 0) {
        toast({ title: "Import Complete", description: `Imported ${result.imported} transactions successfully` });
      } else if (result.imported === 0 && result.failed === 0) {
        // No data — user cancelled or empty file
        toast({ title: "Import Cancelled", description: "No transactions were imported" });
      } else {
        // Some or all failed — show detailed error
        const errorDetails = result.errors.length > 0
          ? result.errors.slice(0, 5).join("; ")
          : "Unknown error";
        toast({
          title: "Import Issues",
          description: `Imported: ${result.imported}, Failed: ${result.failed}. ${errorDetails}`,
          variant: "destructive",
        });
      }
      load();
      loadBanks();
      setImporting(false);
    }).catch(() => {
      setImporting(false);
    });
  };

  // Column count for table spans
  const colCount = 12;

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
          <span className="text-sm text-amber-700 dark:text-amber-400">Amount, balance, cheque, depositor, reference, and bank account fields hidden — transactions mapped against legal invoicing sets and compliant VAT ledger formats only</span>
        </div>
      )}

      {/* ── Bank Balance Cards with Ledger Account Linking ─────── */}
      {banks.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Bank Account Balances — Ledger Fusion</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {banks.filter((b: any) => b.isActive !== false).map((bank: any) => {
              const bType: string = bank.bankType || "Bank";
              const borderClass = bankTypeBorder[bType] || "border-l-gray-500";
              const BIcon = bankTypeIcon[bType] || Building2;
              const badgeClass = bankTypeBadgeStyle[bType] || "bg-gray-100 text-gray-700";
              const coaName = bank.chartOfAccount?.name || "Unmapped";
              const coaCode = bank.chartOfAccount?.code || "—";

              return (
                <Card key={bank.id} className={`border-l-4 ${borderClass}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <BIcon className="w-4 h-4 shrink-0 text-slate-600 dark:text-slate-400" />
                          <span className="font-semibold text-slate-900 dark:text-white truncate">{bank.bankName}</span>
                        </div>
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={`text-[10px] px-1.5 py-0 ${badgeClass}`}>{bankTypeLabel[bType] || bType}</Badge>
                          <span className="text-xs text-muted-foreground truncate">A/C: {isVatAuditor ? auditMask : (bank.accountNo || "—")}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <BookOpen className="w-3 h-3 shrink-0" />
                          <span className="truncate">{coaName}</span>
                          {coaCode !== "—" && <span className="font-mono text-[10px] text-slate-400 dark:text-slate-500">({coaCode})</span>}
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          Opening: {isVatAuditor ? auditMask : fmt(bank.openingBalance, "currency")}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className={`text-lg font-bold font-mono ${bank.currentBalance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {isVatAuditor ? auditMask : fmt(bank.currentBalance, "currency")}
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

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Banknote className="w-6 h-6" />Bank Transactions</h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleImportCSV} disabled={importing}>
            <Upload className="w-4 h-4 mr-1" />{importing ? "Importing..." : "Import CSV"}
          </Button>
          <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Create Transaction</Button>
        </div>
      </div>

      {/* ── Enhanced Stat Cards (5 cards) ──────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {[
          { label: "Total Transactions", value: totalTransactions, icon: Banknote, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
          { label: "Total Deposits", value: isVatAuditor ? auditMask : fmt(totalDeposits, "currency"), icon: ArrowDownCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
          { label: "Total Withdrawals", value: isVatAuditor ? auditMask : fmt(totalWithdrawals, "currency"), icon: ArrowUpCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
          { label: "Total Transfers", value: isVatAuditor ? auditMask : fmt(totalTransfers, "currency"), icon: ArrowLeftRight, color: "text-sky-600", bg: "bg-sky-50 dark:bg-sky-900/30" },
          { label: "Net Cash Position", value: isVatAuditor ? auditMask : fmt(netCashPosition, "currency"), icon: DollarSign, color: netCashPosition >= 0 ? "text-green-600" : "text-red-600", bg: netCashPosition >= 0 ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30" },
        ].map((stat, i) => (
          <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className={`text-lg font-bold ${i === 4 && !isVatAuditor ? (netCashPosition >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400") : "text-slate-900 dark:text-white"}`}>{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      <Card>
        <CardContent className="p-4">
          {/* ── Filter Bar ──────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search by code, bank, type, ledger account, cheque..." value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
            </div>
            {/* Transaction Type Filter */}
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]"><SelectValue placeholder="Filter Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Types</SelectItem>
                <SelectItem value="Deposit">Deposit</SelectItem>
                <SelectItem value="Withdraw">Withdraw</SelectItem>
                <SelectItem value="Transfer">Transfer</SelectItem>
              </SelectContent>
            </Select>
            {/* Bank Type Filter */}
            <Select value={bankTypeFilter} onValueChange={setBankTypeFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Bank Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Bank Types</SelectItem>
                <SelectItem value="Bank">Bank</SelectItem>
                <SelectItem value="MFS">MFS</SelectItem>
                <SelectItem value="CashDrawer">Cash Drawer</SelectItem>
              </SelectContent>
            </Select>
            {/* Date Range Filter */}
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
              <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-[140px]" placeholder="From" />
              <span className="text-xs text-muted-foreground">—</span>
              <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-[140px]" placeholder="To" />
            </div>
            {(dateFrom || dateTo || bankTypeFilter !== "All") && (
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); setBankTypeFilter("All"); }} className="text-xs">
                <X className="w-3 h-3 mr-1" />Clear Filters
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
          </div>

          {/* ── Enhanced Table ──────────────────────────────────── */}
          <div className="table-container overflow-x-auto overflow-y-auto max-h-[60vh] rounded-md border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-10">+</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Bank</TableHead>
                  <TableHead>Bank Type</TableHead>
                  <TableHead>Ledger Account</TableHead>
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
                  const itemBankType = item.bank?.bankType || "Bank";
                  const itemBadgeClass = bankTypeBadgeStyle[itemBankType] || "bg-gray-100 text-gray-700";
                  const itemCoAName = item.bank?.chartOfAccount?.name || "Unmapped";

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
                          <Badge className={`text-[10px] px-1.5 py-0 ${itemBadgeClass}`}>
                            {bankTypeLabel[itemBankType] || itemBankType}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <BookOpen className="w-3 h-3" />
                            {itemCoAName}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge className={tb.className}>
                            <TypeIcon className="w-3 h-3 mr-1" />{item.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">{isVatAuditor ? <span className="text-xs text-muted-foreground italic">{auditMask}</span> : fmt(item.amount, "currency")}</TableCell>
                        <TableCell className="font-mono">{isVatAuditor ? <span className="text-xs text-muted-foreground italic">{auditMask}</span> : fmt(item.runningBalance, "currency")}</TableCell>
                        <TableCell>{item.type === "Transfer" ? (item.toBank?.bankName || "—") : "—"}</TableCell>
                        <TableCell>{fmtDate(item.date)}</TableCell>
                        <TableCell><Badge className={statusColor(item.status)}>{item.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(item)}><Edit className="w-3.5 h-3.5" /></Button>
                            {!isAdmin ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button variant="ghost" size="sm" className="text-red-300 cursor-not-allowed" disabled>
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Only administrators can delete financial posts</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                      {/* ── Expanded Row: Details + Ledger Impact ─── */}
                      {expandedRows.has(item.id) && (
                        <TableRow>
                          <TableCell colSpan={colCount} className="bg-muted/30 p-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                              {/* Bank Details */}
                              <div>
                                <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Bank Details</div>
                                <div className="space-y-1">
                                  <p><span className="text-muted-foreground">Bank:</span> <span className="font-medium text-slate-900 dark:text-white">{item.bank?.bankName || "—"}</span></p>
                                  <p><span className="text-muted-foreground">Bank Type:</span> <Badge className={`text-[10px] px-1.5 py-0 ${bankTypeBadgeStyle[item.bank?.bankType || "Bank"]}`}>{bankTypeLabel[item.bank?.bankType || "Bank"]}</Badge></p>
                                  <p><span className="text-muted-foreground">Account No:</span> <span className="font-mono">{isVatAuditor ? auditMask : (item.bank?.accountNo || "—")}</span></p>
                                  <p><span className="text-muted-foreground">Branch:</span> {item.bank?.branch || "—"}</p>
                                  <p><span className="text-muted-foreground">Ledger Account:</span> <span className="font-medium text-slate-900 dark:text-white">{item.bank?.chartOfAccount?.name || "Unmapped"}</span></p>
                                  {item.bank?.chartOfAccount?.code && (
                                    <p><span className="text-muted-foreground">CoA Code:</span> <span className="font-mono">{item.bank.chartOfAccount.code}</span></p>
                                  )}
                                </div>
                              </div>
                              {/* Target Bank Details (Transfer only) */}
                              {item.type === "Transfer" && (
                                <div>
                                  <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Target Bank Details</div>
                                  <div className="space-y-1">
                                    <p><span className="text-muted-foreground">Bank:</span> <span className="font-medium text-slate-900 dark:text-white">{item.toBank?.bankName || "—"}</span></p>
                                    <p><span className="text-muted-foreground">Bank Type:</span> <Badge className={`text-[10px] px-1.5 py-0 ${bankTypeBadgeStyle[item.toBank?.bankType || "Bank"]}`}>{bankTypeLabel[item.toBank?.bankType || "Bank"]}</Badge></p>
                                    <p><span className="text-muted-foreground">Account No:</span> <span className="font-mono">{isVatAuditor ? auditMask : (item.toBank?.accountNo || "—")}</span></p>
                                    <p><span className="text-muted-foreground">Branch:</span> {item.toBank?.branch || "—"}</p>
                                    <p><span className="text-muted-foreground">Ledger Account:</span> <span className="font-medium text-slate-900 dark:text-white">{item.toBank?.chartOfAccount?.name || "Unmapped"}</span></p>
                                    {item.toBank?.chartOfAccount?.code && (
                                      <p><span className="text-muted-foreground">CoA Code:</span> <span className="font-mono">{item.toBank.chartOfAccount.code}</span></p>
                                    )}
                                  </div>
                                </div>
                              )}
                              {/* Transaction Details */}
                              <div>
                                <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white">Transaction Details</div>
                                <div className="space-y-1">
                                  <p><span className="text-muted-foreground">Description:</span> {fmtEmpty(item.description)}</p>
                                  <p><span className="text-muted-foreground">Cheque No:</span> <span className="font-mono">{isVatAuditor ? auditMask : fmtEmpty(item.chequeNo)}</span></p>
                                  <p><span className="text-muted-foreground">Depositor:</span> {isVatAuditor ? auditMask : fmtEmpty(item.depositorName)}</p>
                                  <p><span className="text-muted-foreground">Reference No:</span> <span className="font-mono">{isVatAuditor ? auditMask : fmtEmpty(item.referenceNo)}</span></p>
                                  <p><span className="text-muted-foreground">Running Balance:</span> <span className="font-mono font-medium">{isVatAuditor ? auditMask : fmt(item.runningBalance, "currency")}</span></p>
                                  <p><span className="text-muted-foreground">Created:</span> {fmtDate(item.createdAt)}</p>
                                </div>
                              </div>
                            </div>
                            {/* ── Ledger Auto-Post Visualization ────────── */}
                            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                              <div className="text-xs font-medium mb-2 text-slate-900 dark:text-white flex items-center gap-1.5">
                                <BookOpen className="w-3.5 h-3.5" />
                                Ledger Impact (Double-Entry Auto-Post)
                              </div>
                              {(() => {
                                const impact = getLedgerImpact(item);
                                return (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-lg">
                                    <div className="flex items-center gap-2 p-2 rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                                      <span className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider">Debit</span>
                                      <span className="text-xs font-medium text-slate-900 dark:text-white">{impact.debitAccount}</span>
                                      <span className="ml-auto text-xs font-mono font-bold text-green-700 dark:text-green-400">{isVatAuditor ? auditMask : fmt(impact.amount, "currency")}</span>
                                    </div>
                                    <div className="flex items-center gap-2 p-2 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                                      <span className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">Credit</span>
                                      <span className="text-xs font-medium text-slate-900 dark:text-white">{impact.creditAccount}</span>
                                      <span className="ml-auto text-xs font-mono font-bold text-red-700 dark:text-red-400">{isVatAuditor ? auditMask : fmt(impact.amount, "currency")}</span>
                                    </div>
                                  </div>
                                );
                              })()}
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

      {/* ── Create/Edit Dialog ──────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editItem ? "Edit" : "Create"} Bank Transaction</DialogTitle><DialogDescription>Fill in the transaction details below. Fields marked with * are required.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                      <SelectItem key={bank.id} value={bank.id}>
                        <span className="flex items-center gap-1.5">
                          <Badge className={`text-[9px] px-1 py-0 ${bankTypeBadgeStyle[bank.bankType || "Bank"]}`}>{bankTypeLabel[bank.bankType || "Bank"]}</Badge>
                          {bank.bankName} — {bank.accountNo}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedBank && (
                  <div className="space-y-0.5">
                    <p className={`text-xs font-mono ${selectedBank.currentBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                      Current Balance: {fmt(selectedBank.currentBalance, "currency")}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Ledger: {selectedBank.chartOfAccount?.name || "Unmapped"}
                      {selectedBank.chartOfAccount?.code && ` (${selectedBank.chartOfAccount.code})`}
                    </p>
                  </div>
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
                {insufficientBalance && (
                  <p className="text-xs text-red-600 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />Insufficient balance for this transaction
                  </p>
                )}
              </div>

              {/* Cheque No */}
              <div className="space-y-1.5">
                <Label>Cheque No</Label>
                <Input
                  type="text"
                  value={formData.chequeNo || ""}
                  onChange={e => setFormData({ ...formData, chequeNo: e.target.value })}
                  placeholder="Cheque number (optional)"
                />
              </div>

              {/* Depositor Name */}
              <div className="space-y-1.5">
                <Label>Depositor Name</Label>
                <Input
                  type="text"
                  value={formData.depositorName || ""}
                  onChange={e => setFormData({ ...formData, depositorName: e.target.value })}
                  placeholder="Depositor name (optional)"
                />
              </div>

              {/* Reference No */}
              <div className="space-y-1.5">
                <Label>Reference No</Label>
                <Input
                  type="text"
                  value={formData.referenceNo || ""}
                  onChange={e => setFormData({ ...formData, referenceNo: e.target.value })}
                  placeholder="Reference number (optional)"
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
                        <SelectItem key={bank.id} value={bank.id}>
                          <span className="flex items-center gap-1.5">
                            <Badge className={`text-[9px] px-1 py-0 ${bankTypeBadgeStyle[bank.bankType || "Bank"]}`}>{bankTypeLabel[bank.bankType || "Bank"]}</Badge>
                            {bank.bankName} — {bank.accountNo}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedToBank && (
                    <div className="space-y-0.5">
                      <p className={`text-xs font-mono ${selectedToBank.currentBalance >= 0 ? "text-green-600" : "text-red-600"}`}>
                        Target Balance: {fmt(selectedToBank.currentBalance, "currency")}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        Ledger: {selectedToBank.chartOfAccount?.name || "Unmapped"}
                        {selectedToBank.chartOfAccount?.code && ` (${selectedToBank.chartOfAccount.code})`}
                      </p>
                    </div>
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

              {/* Description */}
              <div className="space-y-1.5 md:col-span-2">
                <Label>Description</Label>
                <Textarea
                  value={formData.description || ""}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Transaction description (optional)"
                  rows={2}
                />
              </div>

              {/* Status */}
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={formData.status || "Approved"} onValueChange={v => setFormData({ ...formData, status: v })}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="Approved">Approved</SelectItem>
                    <SelectItem value="Rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirmation Dialog ──────────────────────────── */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              Confirm Delete
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete transaction <span className="font-mono font-bold">{deleteItem?.transactionCode}</span>?
              This will reverse the bank balance change and remove the ledger entries. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteItem && (
            <div className="text-sm space-y-1 p-3 bg-muted/50 rounded-lg">
              <p><span className="text-muted-foreground">Type:</span> <Badge className={typeBadge(deleteItem.type).className}>{deleteItem.type}</Badge></p>
              <p><span className="text-muted-foreground">Bank:</span> {deleteItem.bank?.bankName || "—"}</p>
              <p><span className="text-muted-foreground">Amount:</span> <span className="font-mono">{fmt(deleteItem.amount, "currency")}</span></p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete}>Delete Transaction</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
