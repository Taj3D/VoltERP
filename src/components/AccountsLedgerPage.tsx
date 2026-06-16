"use client";
// ============================================================
// VoltERP — Accounts & Ledger Management Page (Phase 13)
// 5-Tab SPA: COA Tree | Journal Voucher | Cash/Bank Vouchers
//            | Voucher Register | Ledger Statement
// Theme: Deep Navy Blue (#0a1628, #132240, #2563eb)
// ============================================================

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  BookOpen, FileText, Banknote, List, ClipboardList,
  Plus, Edit, Trash2, RefreshCw, Search, ChevronDown, ChevronRight,
  Download, FileDown, Upload, Shield, CheckCircle, AlertTriangle, X,
  ArrowUpCircle, ArrowDownCircle, Eye, Lock
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
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { exportToPDFSimple, exportToCSVSimple, importFromCSV } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (type === "currency") return `৳${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(v))}`;
  if (type === "date") { if (!v) return "—"; const dt = new Date(v); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  return String(v);
};

const fmtDate = (d: string | Date) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };

async function apiFetch(path: string, opts?: RequestInit) {
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.accessToken) authHeaders["Authorization"] = `Bearer ${parsed.accessToken}`;
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
// CLASSIFICATION COLORS
// ============================================================

const CLASSIFICATION_COLORS: Record<string, string> = {
  Asset: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  Liability: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  Equity: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  Revenue: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  Expense: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
};

const CLASSIFICATION_DOT: Record<string, string> = {
  Asset: "bg-blue-500",
  Liability: "bg-red-500",
  Equity: "bg-purple-500",
  Revenue: "bg-green-500",
  Expense: "bg-amber-500",
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function AccountsLedgerPage({ initialTab, voucherType }: { initialTab?: string; voucherType?: string } = {}) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState(initialTab || "coa-tree");

  // ── Shared State ──
  const [accounts, setAccounts] = useState<any[]>([]);
  const [banks, setBanks] = useState<any[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);

  // ── Tab 1: COA Tree ──
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [coaSearch, setCoaSearch] = useState("");
  const [coaFilter, setCoaFilter] = useState("all");
  const [coaFormOpen, setCoaFormOpen] = useState(false);
  const [coaEditItem, setCoaEditItem] = useState<any>(null);
  const [coaSaving, setCoaSaving] = useState(false);
  const [coaDeleteItem, setCoaDeleteItem] = useState<any>(null);
  const [seedingRoot, setSeedingRoot] = useState(false);
  const [coaFormData, setCoaFormData] = useState<Record<string, any>>({
    code: "", name: "", classification: "Asset", parentAccountId: "",
    openingBalance: 0, openingBalanceType: "Dr",
  });

  // ── Tab 2: Journal Voucher Entry ──
  const [jvDate, setJvDate] = useState(new Date().toISOString().split("T")[0]);
  const [jvNarration, setJvNarration] = useState("");
  const [jvLines, setJvLines] = useState<Array<{ accountId: string; accountName: string; debit: number; credit: number; particulars: string }>>([
    { accountId: "", accountName: "", debit: 0, credit: 0, particulars: "" },
    { accountId: "", accountName: "", debit: 0, credit: 0, particulars: "" },
  ]);
  const [jvPosting, setJvPosting] = useState(false);
  const [jvSnapshot, setJvSnapshot] = useState<any>(null);

  // ── Tab 3: Cash/Bank Vouchers ──
  const [cbSubTab, setCbSubTab] = useState<"cash-receipt" | "cash-payment" | "bank-receipt" | "bank-payment">(() => {
    if (voucherType === "CASH_RECEIPT") return "cash-receipt";
    if (voucherType === "CASH_PAYMENT") return "cash-payment";
    if (voucherType === "BANK_RECEIPT") return "bank-receipt";
    if (voucherType === "BANK_PAYMENT") return "bank-payment";
    return "cash-receipt";
  });
  const [cbDate, setCbDate] = useState(new Date().toISOString().split("T")[0]);
  const [cbAmount, setCbAmount] = useState(0);
  const [cbAccountId, setCbAccountId] = useState("");
  const [cbNarration, setCbNarration] = useState("");
  const [cbReferenceNo, setCbReferenceNo] = useState("");
  const [cbBankId, setCbBankId] = useState("");
  const [cbChequeNo, setCbChequeNo] = useState("");
  const [cbChequeDate, setCbChequeDate] = useState("");
  const [cbPosting, setCbPosting] = useState(false);

  // ── Tab 4: Voucher Register ──
  const [vouchers, setVouchers] = useState<any[]>([]);
  const [vouchersLoading, setVouchersLoading] = useState(false);
  const [vrType, setVrType] = useState("all");
  const [vrStatus, setVrStatus] = useState("all");
  const [vrFrom, setVrFrom] = useState("");
  const [vrTo, setVrTo] = useState("");
  const [expandedVoucher, setExpandedVoucher] = useState<string | null>(null);

  // ── Tab 5: Ledger Statement ──
  const [ledgerAccountId, setLedgerAccountId] = useState("");
  const [ledgerFrom, setLedgerFrom] = useState("");
  const [ledgerTo, setLedgerTo] = useState("");
  const [ledgerEntries, setLedgerEntries] = useState<any[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);

  // ── Data Loading ──
  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const res = await apiFetch("/api/chart-of-accounts");
      setAccounts(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setAccountsLoading(false); }
  }, [toast]);

  const loadBanks = useCallback(async () => {
    try {
      const res = await apiFetch("/api/banks");
      setBanks(Array.isArray(res) ? res : res.data || []);
    } catch {}
  }, []);

  const loadVouchers = useCallback(async () => {
    setVouchersLoading(true);
    try {
      let url = "/api/journal-vouchers?";
      if (vrType !== "all") url += `type=${vrType}&`;
      if (vrStatus !== "all") url += `status=${vrStatus}&`;
      if (vrFrom) url += `from=${vrFrom}&`;
      if (vrTo) url += `to=${vrTo}&`;
      const res = await apiFetch(url);
      setVouchers(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setVouchersLoading(false); }
  }, [toast, vrType, vrStatus, vrFrom, vrTo]);

  const loadLedger = useCallback(async () => {
    if (!ledgerAccountId) return;
    setLedgerLoading(true);
    try {
      let url = `/api/ledger-entries?accountId=${ledgerAccountId}`;
      if (ledgerFrom) url += `&from=${ledgerFrom}`;
      if (ledgerTo) url += `&to=${ledgerTo}`;
      const res = await apiFetch(url);
      setLedgerEntries(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLedgerLoading(false); }
  }, [toast, ledgerAccountId, ledgerFrom, ledgerTo]);

  useEffect(() => { loadAccounts(); loadBanks(); }, [loadAccounts, loadBanks]);
  useEffect(() => { if (activeTab === "voucher-register") loadVouchers(); }, [activeTab, loadVouchers]);
  useEffect(() => { if (activeTab === "ledger-statement" && ledgerAccountId) loadLedger(); }, [activeTab, loadLedger]);

  // ── COA Tree helpers ──
  const accountMap = useMemo(() => {
    const m = new Map<string, any>();
    accounts.forEach((a: any) => m.set(a.id, a));
    return m;
  }, [accounts]);

  const rootAccounts = useMemo(() => {
    let result = accounts.filter((a: any) => !a.parentAccountId);
    if (coaFilter !== "all") result = result.filter((a: any) => a.classification === coaFilter);
    if (coaSearch) {
      const s = coaSearch.toLowerCase();
      result = result.filter((a: any) =>
        a.code?.toLowerCase().includes(s) || a.name?.toLowerCase().includes(s) ||
        hasMatchingDescendant(a.id, s)
      );
    }
    return result;
  }, [accounts, coaFilter, coaSearch, accountMap]);

  function hasMatchingDescendant(parentId: string, search: string): boolean {
    const children = accounts.filter((a: any) => a.parentAccountId === parentId);
    for (const child of children) {
      if (child.code?.toLowerCase().includes(search) || child.name?.toLowerCase().includes(search)) return true;
      if (hasMatchingDescendant(child.id, search)) return true;
    }
    return false;
  }

  function getChildren(parentId: string) {
    return accounts.filter((a: any) => a.parentAccountId === parentId);
  }

  function toggleNode(id: string) {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Tab 1: COA CRUD ──
  const openCOACreate = (parentId?: string) => {
    const count = accounts.length;
    setCoaFormData({
      code: `COA-${String(count + 1).padStart(5, "0")}`,
      name: "", classification: "Asset", parentAccountId: parentId || "",
      openingBalance: 0, openingBalanceType: "Dr",
    });
    setCoaEditItem(null);
    setCoaFormOpen(true);
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
    setCoaEditItem(item);
    setCoaFormOpen(true);
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
      if (coaEditItem) {
        await apiFetch(`/api/chart-of-accounts/${coaEditItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Account updated successfully" });
      } else {
        await apiFetch("/api/chart-of-accounts", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Account created successfully" });
      }
      setCoaFormOpen(false);
      loadAccounts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setCoaSaving(false); }
  };

  const deleteCOA = async () => {
    if (!coaDeleteItem) return;
    try {
      await apiFetch(`/api/chart-of-accounts/${coaDeleteItem.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Account deleted" });
      setCoaDeleteItem(null);
      loadAccounts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const seedRootNodes = async () => {
    setSeedingRoot(true);
    try {
      const res = await apiFetch("/api/coa-accounts-seed", { method: "POST" });
      toast({ title: "Seed Complete", description: res.message || "Root nodes seeded" });
      loadAccounts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setSeedingRoot(false); }
  };

  // ── Tab 2: Journal Voucher ──
  const jvTotalDebit = useMemo(() => jvLines.reduce((s, l) => s + (Number(l.debit) || 0), 0), [jvLines]);
  const jvTotalCredit = useMemo(() => jvLines.reduce((s, l) => s + (Number(l.credit) || 0), 0), [jvLines]);
  const jvDifference = useMemo(() => Math.abs(jvTotalDebit - jvTotalCredit), [jvTotalDebit, jvTotalCredit]);
  const jvBalanced = useMemo(() => jvDifference < 0.01 && jvTotalDebit > 0, [jvDifference, jvTotalDebit]);

  const addJvLine = () => {
    setJvLines([...jvLines, { accountId: "", accountName: "", debit: 0, credit: 0, particulars: "" }]);
  };

  const removeJvLine = (idx: number) => {
    if (jvLines.length <= 2) {
      toast({ title: "Minimum Lines", description: "At least 2 lines are required for double-entry", variant: "destructive" });
      return;
    }
    setJvLines(jvLines.filter((_, i) => i !== idx));
  };

  const updateJvLine = (idx: number, field: string, value: any) => {
    const updated = [...jvLines];
    updated[idx] = { ...updated[idx], [field]: value };
    // Auto-fill accountName from accountId
    if (field === "accountId" && value) {
      const acct = accounts.find((a: any) => a.id === value);
      if (acct) updated[idx].accountName = `${acct.code} - ${acct.name}`;
    }
    // If debit is set, clear credit and vice versa
    if (field === "debit" && Number(value) > 0) updated[idx].credit = 0;
    if (field === "credit" && Number(value) > 0) updated[idx].debit = 0;
    setJvLines(updated);
  };

  const postJournalVoucher = async () => {
    if (!jvDate) {
      toast({ title: "Error", description: "Date is required", variant: "destructive" });
      return;
    }
    if (!jvBalanced) {
      toast({ title: "Imbalance", description: "Debits and Credits must match perfectly", variant: "destructive" });
      return;
    }
    const hasAccount = jvLines.every(l => l.accountId);
    if (!hasAccount) {
      toast({ title: "Error", description: "All lines must have an account selected", variant: "destructive" });
      return;
    }

    // Save snapshot for rollback
    setJvSnapshot({ lines: [...jvLines], date: jvDate, narration: jvNarration });
    setJvPosting(true);

    try {
      await apiFetch("/api/journal-vouchers", {
        method: "POST",
        body: JSON.stringify({
          date: jvDate,
          type: "JOURNAL",
          narration: jvNarration,
          status: "Posted",
          lines: jvLines.map(l => ({
            accountId: l.accountId,
            accountName: l.accountName,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            particulars: l.particulars,
          })),
        }),
      });
      toast({ title: "Posted", description: "Journal Voucher posted to General Ledger" });
      // Reset form
      setJvDate(new Date().toISOString().split("T")[0]);
      setJvNarration("");
      setJvLines([
        { accountId: "", accountName: "", debit: 0, credit: 0, particulars: "" },
        { accountId: "", accountName: "", debit: 0, credit: 0, particulars: "" },
      ]);
      loadAccounts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
      // Rollback to snapshot
      if (jvSnapshot) {
        setJvLines(jvSnapshot.lines);
        setJvDate(jvSnapshot.date);
        setJvNarration(jvSnapshot.narration);
      }
    } finally { setJvPosting(false); }
  };

  // ── Tab 3: Cash/Bank Voucher ──
  const cbVoucherType = useMemo(() => {
    switch (cbSubTab) {
      case "cash-receipt": return "CASH_RECEIPT";
      case "cash-payment": return "CASH_PAYMENT";
      case "bank-receipt": return "BANK_RECEIPT";
      case "bank-payment": return "BANK_PAYMENT";
    }
  }, [cbSubTab]);

  const cbIsBank = useMemo(() => cbSubTab === "bank-receipt" || cbSubTab === "bank-payment", [cbSubTab]);

  const postCashBankVoucher = async () => {
    if (!cbDate || !cbAccountId || cbAmount <= 0) {
      toast({ title: "Error", description: "Date, Account, and Amount are required", variant: "destructive" });
      return;
    }
    if (cbIsBank && !cbBankId) {
      toast({ title: "Error", description: "Bank selection is required for bank vouchers", variant: "destructive" });
      return;
    }

    setCbPosting(true);

    try {
      const acct = accounts.find((a: any) => a.id === cbAccountId);
      const accountName = acct ? `${acct.code} - ${acct.name}` : cbAccountId;

      // Find Cash-in-Hand or Bank COA account
      let contraAccountId = "";
      let contraAccountName = "";

      if (!cbIsBank) {
        // Cash voucher — find Cash-in-Hand account
        const cashAccount = accounts.find((a: any) =>
          a.name?.toLowerCase().includes("cash") && a.classification === "Asset"
        );
        if (!cashAccount) {
          toast({ title: "Error", description: "No Cash-in-Hand account found in COA", variant: "destructive" });
          setCbPosting(false);
          return;
        }
        contraAccountId = cashAccount.id;
        contraAccountName = `${cashAccount.code} - ${cashAccount.name}`;
      } else {
        // Bank voucher — find bank's COA account
        const bank = banks.find((b: any) => b.id === cbBankId);
        if (bank) {
          // Look for a COA account matching this bank
          const bankCoaAccount = accounts.find((a: any) =>
            a.name?.toLowerCase().includes(bank.bankName?.toLowerCase()) && a.classification === "Asset"
          );
          if (bankCoaAccount) {
            contraAccountId = bankCoaAccount.id;
            contraAccountName = `${bankCoaAccount.code} - ${bankCoaAccount.name}`;
          } else {
            // Fallback to first bank-type asset account
            const fallbackAccount = accounts.find((a: any) =>
              a.name?.toLowerCase().includes("bank") && a.classification === "Asset"
            );
            if (fallbackAccount) {
              contraAccountId = fallbackAccount.id;
              contraAccountName = `${fallbackAccount.code} - ${fallbackAccount.name}`;
            }
          }
        }
        if (!contraAccountId) {
          toast({ title: "Error", description: "No Bank COA account found for this bank", variant: "destructive" });
          setCbPosting(false);
          return;
        }
      }

      // Build the two lines based on voucher type
      let lines: Array<{ accountId: string; accountName: string; debit: number; credit: number; particulars: string }>;
      const particulars = cbNarration || `${cbSubTab.replace("-", " ")} voucher`;

      switch (cbSubTab) {
        case "cash-receipt":
          // Debit Cash-in-Hand, Credit the receiving account
          lines = [
            { accountId: contraAccountId, accountName: contraAccountName, debit: cbAmount, credit: 0, particulars },
            { accountId: cbAccountId, accountName, debit: 0, credit: cbAmount, particulars },
          ];
          break;
        case "cash-payment":
          // Credit Cash-in-Hand, Debit the paying account
          lines = [
            { accountId: cbAccountId, accountName, debit: cbAmount, credit: 0, particulars },
            { accountId: contraAccountId, accountName: contraAccountName, debit: 0, credit: cbAmount, particulars },
          ];
          break;
        case "bank-receipt":
          // Debit Bank, Credit the receiving account
          lines = [
            { accountId: contraAccountId, accountName: contraAccountName, debit: cbAmount, credit: 0, particulars },
            { accountId: cbAccountId, accountName, debit: 0, credit: cbAmount, particulars },
          ];
          break;
        case "bank-payment":
          // Credit Bank, Debit the paying account
          lines = [
            { accountId: cbAccountId, accountName, debit: cbAmount, credit: 0, particulars },
            { accountId: contraAccountId, accountName: contraAccountName, debit: 0, credit: cbAmount, particulars },
          ];
          break;
        default:
          lines = [];
      }

      await apiFetch("/api/journal-vouchers", {
        method: "POST",
        body: JSON.stringify({
          date: cbDate,
          type: cbVoucherType,
          narration: cbNarration,
          status: "Posted",
          lines,
          bankId: cbIsBank ? cbBankId : undefined,
          chequeNo: cbIsBank ? cbChequeNo : undefined,
          chequeDate: cbIsBank ? cbChequeDate : undefined,
          referenceNo: cbReferenceNo || undefined,
        }),
      });

      toast({
        title: "Authorized",
        description: `${cbIsBank ? "Bank" : "Cash"} Voucher posted successfully`
      });

      // Reset form
      setCbAmount(0);
      setCbAccountId("");
      setCbNarration("");
      setCbReferenceNo("");
      setCbBankId("");
      setCbChequeNo("");
      setCbChequeDate("");
      loadAccounts();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setCbPosting(false); }
  };

  // ── Tab 1: COA Export helpers ──
  const exportCOAPDF = () => {
    try {
      const headers = ["Code", "Name", "Classification", "Type", "Opening Balance", "Balance Type"];
      const rows = accounts.filter((a: any) => !a.isRoot).map((a: any) => [
        a.code || "—", a.name, a.classification || "—", a.accountType || "—",
        a.openingBalance ? fmt(a.openingBalance, "currency") : "—", a.openingBalanceType || "—",
      ]);
      const printedBy = getPrintedBy();
      exportToPDFSimple("Chart-of-Accounts", headers, rows, "landscape", `Total: ${accounts.filter((a: any) => !a.isRoot).length} accounts`, undefined, { preparedBy: printedBy, checkedBy: "", authorizedBy: "", printedBy });
      toast({ title: "Exported", description: "Chart of Accounts exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const exportCOACSV = () => {
    try {
      const headers = ["Code", "Name", "Classification", "Type", "Opening Balance", "Balance Type"];
      const rows = accounts.filter((a: any) => !a.isRoot).map((a: any) => [
        a.code || "", a.name, a.classification || "", a.accountType || "",
        a.openingBalance || 0, a.openingBalanceType || "",
      ]);
      exportToCSVSimple("Chart-of-Accounts", headers, rows);
      toast({ title: "Exported", description: "Chart of Accounts exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const importCOACSV = async () => {
    try {
      const result = await importFromCSV({
        apiPath: "/api/chart-of-accounts?import=true",
        formFields: [
          { key: "code", label: "Code", type: "text", required: true },
          { key: "name", label: "Name", type: "text", required: true },
          { key: "classification", label: "Classification", type: "text", required: true },
          { key: "openingBalance", label: "Opening Balance", type: "number" },
          { key: "openingBalanceType", label: "Balance Type", type: "text" },
        ],
      });
      if (result.imported > 0) {
        toast({ title: "Import Complete", description: `${result.imported} accounts imported, ${result.failed} failed` });
        loadAccounts();
      } else if (result.errors.length > 0) {
        toast({ title: "Import Failed", description: result.errors[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Tab 4: Export helpers ──
  const getPrintedBy = () => { try { const a = JSON.parse(localStorage.getItem("ems_auth") || "{}"); return a.user?.displayName || a.user?.name || "System"; } catch { return "System"; } };
  const exportVoucherPDF = (voucher: any) => {
    try {
      const headers = ["Account", "Debit", "Credit", "Particulars"];
      const rows = (voucher.lines || []).map((l: any) => [
        l.accountName || "—",
        l.debit > 0 ? fmt(l.debit, "currency") : "—",
        l.credit > 0 ? fmt(l.credit, "currency") : "—",
        l.particulars || "—",
      ]);
      const printedBy = getPrintedBy();
      exportToPDFSimple(
        `Voucher-${voucher.voucherNo}`,
        headers,
        rows,
        "landscape",
        `${voucher.type} | ${fmtDate(voucher.date)} | ${voucher.narration || ""}`,
        undefined,
        { preparedBy: printedBy, checkedBy: "", authorizedBy: "", printedBy }
      );
      toast({ title: "Exported", description: `Voucher ${voucher.voucherNo} exported to PDF` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const exportVoucherCSV = () => {
    try {
      const headers = ["Voucher No", "Date", "Type", "Narration", "Total Debit", "Total Credit", "Status"];
      const rows = vouchers.map((v: any) => [
        v.voucherNo, fmtDate(v.date), v.type, v.narration || "",
        fmt(v.totalDebit, "currency"), fmt(v.totalCredit, "currency"), v.status,
      ]);
      exportToCSVSimple("Voucher-Register", headers, rows);
      toast({ title: "Exported", description: "Voucher Register exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const exportVoucherRegisterPDF = () => {
    try {
      const headers = ["Voucher No", "Date", "Type", "Narration", "Total Debit", "Total Credit", "Status"];
      const rows = vouchers.map((v: any) => [
        v.voucherNo, fmtDate(v.date), v.type, v.narration || "",
        fmt(v.totalDebit, "currency"), fmt(v.totalCredit, "currency"), v.status,
      ]);
      const printedBy = getPrintedBy();
      exportToPDFSimple("Voucher-Register", headers, rows, "landscape", `${vouchers.length} vouchers`, undefined, { preparedBy: printedBy, checkedBy: "", authorizedBy: "", printedBy });
      toast({ title: "Exported", description: "Voucher Register exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const importVoucherCSV = async () => {
    try {
      const result = await importFromCSV({
        apiPath: "/api/vouchers?import=true",
        formFields: [
          { key: "type", label: "Type", type: "text", required: true },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "narration", label: "Narration", type: "text" },
          { key: "accountId", label: "Account ID", type: "text", required: true },
          { key: "debit", label: "Debit", type: "number" },
          { key: "credit", label: "Credit", type: "number" },
        ],
      });
      if (result.imported > 0) {
        toast({ title: "Import Complete", description: `${result.imported} vouchers imported, ${result.failed} failed` });
        loadVouchers();
      } else if (result.errors.length > 0) {
        toast({ title: "Import Failed", description: result.errors[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Tab 5: Ledger Statement Export ──
  const exportLedgerPDF = () => {
    try {
      const acct = accounts.find((a: any) => a.id === ledgerAccountId);
      const headers = ["Date", "Particulars", "Debit", "Credit", "Balance"];
      let runningBalance = 0;
      const rows = ledgerEntries.map((e: any) => {
        runningBalance += (e.debit || 0) - (e.credit || 0);
        return [
          fmtDate(e.date), e.particulars || "—",
          e.debit > 0 ? fmt(e.debit, "currency") : "—",
          e.credit > 0 ? fmt(e.credit, "currency") : "—",
          fmt(runningBalance, "currency"),
        ];
      });
      const printedBy = getPrintedBy();
      exportToPDFSimple(
        `Ledger-${acct?.name || "Statement"}`,
        headers,
        rows,
        "portrait",
        `${acct?.code || ""} - ${acct?.name || ""} | From: ${ledgerFrom || "—"} To: ${ledgerTo || "—"}`,
        undefined,
        { preparedBy: printedBy, checkedBy: "", authorizedBy: "", printedBy }
      );
      toast({ title: "Exported", description: "Ledger statement exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const exportLedgerCSV = () => {
    try {
      const headers = ["Date", "Particulars", "Debit", "Credit", "Balance"];
      let runningBalance = 0;
      const rows = ledgerEntries.map((e: any) => {
        runningBalance += (e.debit || 0) - (e.credit || 0);
        return [
          fmtDate(e.date), e.particulars || "",
          String(e.debit || 0), String(e.credit || 0), String(runningBalance),
        ];
      });
      exportToCSVSimple("Ledger-Statement", headers, rows);
      toast({ title: "Exported", description: "Ledger statement exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const importLedgerCSV = async () => {
    try {
      const result = await importFromCSV({
        apiPath: "/api/ledger-entries?import=true",
        formFields: [
          { key: "accountId", label: "Account ID", type: "text", required: true },
          { key: "date", label: "Date", type: "date", required: true },
          { key: "particulars", label: "Particulars", type: "text" },
          { key: "debit", label: "Debit", type: "number" },
          { key: "credit", label: "Credit", type: "number" },
        ],
      });
      if (result.imported > 0) {
        toast({ title: "Import Complete", description: `${result.imported} entries imported, ${result.failed} failed` });
        if (ledgerAccountId) loadLedgerEntries(ledgerAccountId);
      } else if (result.errors.length > 0) {
        toast({ title: "Import Failed", description: result.errors[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Running balance computation ──
  const ledgerWithBalance = useMemo(() => {
    let balance = 0;
    return ledgerEntries.map((e: any) => {
      balance += (e.debit || 0) - (e.credit || 0);
      return { ...e, runningBalance: balance };
    });
  }, [ledgerEntries]);

  // ============================================================
  // RENDER: COA Tree Node (recursive)
  // ============================================================
  const renderTreeNode = (account: any, depth: number = 0) => {
    const children = getChildren(account.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedNodes.has(account.id);
    const isSelected = selectedAccount?.id === account.id;
    const isRoot = account.isRoot === true;
    const dotColor = CLASSIFICATION_DOT[account.classification] || "bg-slate-400";

    return (
      <React.Fragment key={account.id}>
        <div
          className={`flex items-center gap-1 py-1.5 px-2 rounded-md cursor-pointer transition-colors group
            ${isSelected ? "bg-[#2563eb]/10 border border-[#2563eb]/30" : "hover:bg-muted/50"}
            ${isRoot ? "font-semibold" : ""}`}
          style={{ paddingLeft: `${depth * 24 + 8}px` }}
          onClick={() => setSelectedAccount(account)}
        >
          {/* Expand/Collapse */}
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-5 p-0 shrink-0"
            onClick={(e) => { e.stopPropagation(); toggleNode(account.id); }}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />
            ) : <span className="w-3.5" />}
          </Button>

          {/* Root Shield */}
          {isRoot && <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />}

          {/* Classification Dot */}
          <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />

          {/* Code + Name */}
          <span className="font-mono text-xs text-muted-foreground shrink-0">{account.code}</span>
          <span className="text-sm truncate text-slate-900 dark:text-white">{account.name}</span>

          {/* Classification Badge */}
          <Badge className={`ml-1 text-[10px] px-1.5 py-0 ${CLASSIFICATION_COLORS[account.classification] || ""}`}>
            {account.classification}
          </Badge>

          {/* Balance */}
          <span className="ml-auto font-mono text-xs whitespace-nowrap text-muted-foreground">
            {fmt(account.currentBalance ?? account.subBalance?.totalNet ?? 0, "currency")}
          </span>

          {/* Actions */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ml-1">
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0"
              onClick={(e) => { e.stopPropagation(); openCOAEdit(account); }}>
              <Edit className="w-3 h-3" />
            </Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500"
                      disabled={isRoot}
                      onClick={(e) => { e.stopPropagation(); setCoaDeleteItem(account); }}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </span>
                </TooltipTrigger>
                {isRoot && (
                  <TooltipContent>
                    <p>Root nodes are shield-locked and cannot be deleted</p>
                  </TooltipContent>
                )}
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>

        {/* Children */}
        {hasChildren && isExpanded && children.map((child: any) => renderTreeNode(child, depth + 1))}
      </React.Fragment>
    );
  };

  // ============================================================
  // RENDER: TAB 1 — COA Tree Navigation
  // ============================================================
  const renderCOATree = () => (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search accounts..." value={coaSearch} onChange={e => setCoaSearch(e.target.value)} className="pl-10" />
        </div>
        <Select value={coaFilter} onValueChange={setCoaFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Classification" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Classifications</SelectItem>
            <SelectItem value="Asset">Asset</SelectItem>
            <SelectItem value="Liability">Liability</SelectItem>
            <SelectItem value="Equity">Equity</SelectItem>
            <SelectItem value="Revenue">Revenue</SelectItem>
            <SelectItem value="Expense">Expense</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={loadAccounts}><RefreshCw className="w-4 h-4" /></Button>
        <Button variant="outline" size="sm" onClick={exportCOAPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
        <Button variant="outline" size="sm" onClick={exportCOACSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
        <Button variant="outline" size="sm" onClick={importCOACSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
        <Button variant="outline" size="sm" onClick={seedRootNodes} disabled={seedingRoot}>
          {seedingRoot ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Shield className="w-4 h-4 mr-1" />}
          Seed Root Nodes
        </Button>
        <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => openCOACreate()}>
          <Plus className="w-4 h-4 mr-1" />Add Account
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: accounts.length, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30", icon: BookOpen },
          { label: "Assets", value: accounts.filter((a: any) => a.classification === "Asset").length, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30", icon: Shield },
          { label: "Liabilities", value: accounts.filter((a: any) => a.classification === "Liability").length, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30", icon: AlertTriangle },
          { label: "Equity", value: accounts.filter((a: any) => a.classification === "Equity").length, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/30", icon: BookOpen },
          { label: "Revenue/Expense", value: accounts.filter((a: any) => a.classification === "Revenue" || a.classification === "Expense").length, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30", icon: FileText },
        ].map((stat, i) => (
          <Card key={i}><CardContent className="p-3 flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
            <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
          </CardContent></Card>
        ))}
      </div>

      {/* Tree + Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tree */}
        <Card className="lg:col-span-2">
          <CardContent className="p-4">
            <div className="max-h-[60vh] overflow-y-auto space-y-0.5">
              {accountsLoading ? (
                <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : rootAccounts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p>No accounts found. Click "Seed Root Nodes" to initialize.</p>
                </div>
              ) : (
                rootAccounts.map((acct: any) => renderTreeNode(acct, 0))
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Showing {rootAccounts.length} root accounts · {accounts.length} total</div>
          </CardContent>
        </Card>

        {/* Detail Panel */}
        <Card>
          <CardContent className="p-4">
            {selectedAccount ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  {selectedAccount.isRoot && <Shield className="w-5 h-5 text-amber-500" />}
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">{selectedAccount.name}</h3>
                </div>
                <div className="text-sm font-mono text-muted-foreground">{selectedAccount.code}</div>
                <Badge className={CLASSIFICATION_COLORS[selectedAccount.classification] || ""}>{selectedAccount.classification}</Badge>

                <div className="border-t pt-3 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Current Balance</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {fmt(selectedAccount.currentBalance ?? selectedAccount.subBalance?.totalNet ?? 0, "currency")}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Opening Balance</span>
                    <span className="font-mono text-slate-900 dark:text-white">{fmt(selectedAccount.openingBalance, "currency")}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Opening Type</span>
                    <Badge variant="outline">{selectedAccount.openingBalanceType}</Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Parent</span>
                    <span className="text-slate-900 dark:text-white">{selectedAccount.parentAccount?.name || "— (Root)"}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Children</span>
                    <span className="text-slate-900 dark:text-white">{selectedAccount._count?.childAccounts ?? getChildren(selectedAccount.id).length}</span>
                  </div>
                  {selectedAccount.subBalance && (
                    <>
                      <div className="border-t pt-2 mt-2">
                        <div className="text-xs font-medium text-muted-foreground mb-1">Sub-Balances</div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Own Net</span>
                          <span className="font-mono text-slate-900 dark:text-white">{fmt(selectedAccount.subBalance.ownNet, "currency")}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Child Net</span>
                          <span className="font-mono text-slate-900 dark:text-white">{fmt(selectedAccount.subBalance.childNet, "currency")}</span>
                        </div>
                        <div className="flex justify-between text-sm font-medium">
                          <span className="text-muted-foreground">Total Net</span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">{fmt(selectedAccount.subBalance.totalNet, "currency")}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                <div className="border-t pt-3 flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openCOAEdit(selectedAccount)}>
                    <Edit className="w-3.5 h-3.5 mr-1" />Edit
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openCOACreate(selectedAccount.id)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />Add Child
                  </Button>
                  {!selectedAccount.isRoot && (
                    <Button size="sm" variant="outline" className="text-red-500" onClick={() => setCoaDeleteItem(selectedAccount)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Eye className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p>Select an account to view details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );

  // ============================================================
  // RENDER: TAB 2 — Journal Voucher Entry
  // ============================================================
  const renderJournalVoucher = () => (
    <div className="space-y-4">
      <Card className={`transition-all ${!jvBalanced && jvTotalDebit > 0 ? "border-[3px] border-red-500 shadow-red-500/20 shadow-lg" : ""}`}>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div>
              <Label>Date</Label>
              <Input type="date" value={jvDate} onChange={e => setJvDate(e.target.value)} />
            </div>
            <div>
              <Label>Type</Label>
              <Input value="JOURNAL" disabled className="bg-muted" />
            </div>
            <div className="md:col-span-2">
              <Label>Narration</Label>
              <Textarea placeholder="Enter voucher narration..." value={jvNarration} onChange={e => setJvNarration(e.target.value)} rows={2} />
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#0a1628]">
                  <TableHead className="text-white w-10">#</TableHead>
                  <TableHead className="text-white">Account</TableHead>
                  <TableHead className="text-white w-32">Debit (৳)</TableHead>
                  <TableHead className="text-white w-32">Credit (৳)</TableHead>
                  <TableHead className="text-white">Particulars</TableHead>
                  <TableHead className="text-white w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jvLines.map((line, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="text-muted-foreground font-mono">{idx + 1}</TableCell>
                    <TableCell>
                      <Select value={line.accountId} onValueChange={v => updateJvLine(idx, "accountId", v)}>
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select account..." /></SelectTrigger>
                        <SelectContent className="max-h-64">
                          {accounts.filter((a: any) => !a.isRoot).map((a: any) => (
                            <SelectItem key={a.id} value={a.id}>
                              <span className="flex items-center gap-1">
                                <span className={`w-2 h-2 rounded-full ${CLASSIFICATION_DOT[a.classification] || "bg-slate-400"}`} />
                                {a.code} - {a.name}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Input type="number" min="0" step="0.01" value={line.debit || ""}
                        onChange={e => updateJvLine(idx, "debit", Number(e.target.value) || 0)}
                        className={line.debit > 0 ? "border-green-500/50 bg-green-50/50 dark:bg-green-900/10" : ""} />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min="0" step="0.01" value={line.credit || ""}
                        onChange={e => updateJvLine(idx, "credit", Number(e.target.value) || 0)}
                        className={line.credit > 0 ? "border-blue-500/50 bg-blue-50/50 dark:bg-blue-900/10" : ""} />
                    </TableCell>
                    <TableCell>
                      <Input value={line.particulars} onChange={e => updateJvLine(idx, "particulars", e.target.value)} placeholder="Particulars" />
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500" onClick={() => removeJvLine(idx)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="mt-2">
            <Button variant="outline" size="sm" onClick={addJvLine}>
              <Plus className="w-4 h-4 mr-1" />Add Line
            </Button>
          </div>

          {/* Balance Indicator */}
          <div className={`mt-4 p-4 rounded-lg border-2 ${
            jvBalanced
              ? "bg-green-50 dark:bg-green-900/20 border-green-500"
              : jvTotalDebit > 0 || jvTotalCredit > 0
                ? "bg-red-50 dark:bg-red-900/20 border-[#ef4444]"
                : "bg-muted/50 border-muted"
          }`}>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-6 font-mono text-sm">
                <span>Total Debit: <strong className="text-green-600">{fmt(jvTotalDebit, "currency")}</strong></span>
                <span>Total Credit: <strong className="text-blue-600">{fmt(jvTotalCredit, "currency")}</strong></span>
                <span>Difference: <strong className={jvDifference > 0.01 ? "text-red-600" : "text-green-600"}>{fmt(jvDifference, "currency")}</strong></span>
              </div>
              <div>
                {jvBalanced ? (
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle className="w-5 h-5" />
                    <span className="font-medium">Balanced ✓</span>
                  </div>
                ) : (jvTotalDebit > 0 || jvTotalCredit > 0) ? (
                  <div className="flex items-center gap-2 text-[#ef4444]">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="font-medium">Ledger Imbalance Detected: Debits and Credits must match perfectly.</span>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-sm">Enter amounts to see balance</span>
                )}
              </div>
            </div>
          </div>

          {/* Post Button */}
          <div className="mt-4 flex justify-end">
            <Button
              className="bg-[#2563eb] hover:bg-[#1d4ed8] min-w-[240px]"
              onClick={postJournalVoucher}
              disabled={jvPosting || !jvBalanced}
            >
              {jvPosting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Re-calculating Trial Balances & Committing General Ledger Matrix...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Post Ledger Journal
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // RENDER: TAB 3 — Cash/Bank Vouchers
  // ============================================================
  const renderCashBankVouchers = () => (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "cash-receipt", label: "Cash Receipt", icon: ArrowUpCircle, color: "text-green-600" },
          { key: "cash-payment", label: "Cash Payment", icon: ArrowDownCircle, color: "text-red-600" },
          { key: "bank-receipt", label: "Bank Receipt", icon: ArrowUpCircle, color: "text-green-600" },
          { key: "bank-payment", label: "Bank Payment", icon: ArrowDownCircle, color: "text-red-600" },
        ].map(tab => (
          <Button
            key={tab.key}
            variant={cbSubTab === tab.key ? "default" : "outline"}
            size="sm"
            className={cbSubTab === tab.key ? `bg-[#2563eb] hover:bg-[#1d4ed8]` : ""}
            onClick={() => {
              setCbSubTab(tab.key as any);
              setCbAmount(0); setCbAccountId(""); setCbNarration(""); setCbReferenceNo("");
              setCbBankId(""); setCbChequeNo(""); setCbChequeDate("");
            }}
          >
            <tab.icon className={`w-4 h-4 mr-1 ${cbSubTab !== tab.key ? tab.color : ""}`} />
            {tab.label}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Date</Label>
              <Input type="date" value={cbDate} onChange={e => setCbDate(e.target.value)} />
            </div>
            <div>
              <Label>Amount (৳)</Label>
              <Input type="number" min="0" step="0.01" value={cbAmount || ""} onChange={e => setCbAmount(Number(e.target.value) || 0)} placeholder="0.00" />
            </div>
            <div>
              <Label>{cbSubTab === "cash-receipt" || cbSubTab === "bank-receipt" ? "Receiving Account (Credit)" : "Paying Account (Debit)"}</Label>
              <Select value={cbAccountId} onValueChange={setCbAccountId}>
                <SelectTrigger><SelectValue placeholder="Select account..." /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {accounts.filter((a: any) => !a.isRoot).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      <span className="flex items-center gap-1">
                        <span className={`w-2 h-2 rounded-full ${CLASSIFICATION_DOT[a.classification] || "bg-slate-400"}`} />
                        {a.code} - {a.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reference No</Label>
              <Input value={cbReferenceNo} onChange={e => setCbReferenceNo(e.target.value)} placeholder="Optional reference" />
            </div>
            <div className="md:col-span-2">
              <Label>Narration</Label>
              <Textarea value={cbNarration} onChange={e => setCbNarration(e.target.value)} placeholder="Voucher narration..." rows={2} />
            </div>

            {/* Bank-specific fields */}
            {cbIsBank && (
              <>
                <div>
                  <Label>Bank</Label>
                  <Select value={cbBankId} onValueChange={setCbBankId}>
                    <SelectTrigger><SelectValue placeholder="Select bank..." /></SelectTrigger>
                    <SelectContent className="max-h-64">
                      {banks.map((b: any) => (
                        <SelectItem key={b.id} value={b.id}>
                          {b.bankName} — {b.accountNo} {b.branch ? `(${b.branch})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cheque No</Label>
                  <Input value={cbChequeNo} onChange={e => setCbChequeNo(e.target.value)} placeholder="Cheque number" />
                </div>
                <div>
                  <Label>Cheque Date</Label>
                  <Input type="date" value={cbChequeDate} onChange={e => setCbChequeDate(e.target.value)} />
                </div>
              </>
            )}
          </div>

          {/* Auto-generated lines preview */}
          <div className="mt-4 p-3 bg-muted/50 rounded-lg border">
            <p className="text-xs font-medium text-muted-foreground mb-2">Auto-generated voucher lines:</p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              {cbSubTab === "cash-receipt" && (
                <>
                  <div className="flex justify-between"><span>Dr: Cash-in-Hand</span><span className="font-mono">{fmt(cbAmount, "currency")}</span></div>
                  <div className="flex justify-between"><span>Cr: Selected Account</span><span className="font-mono">{fmt(cbAmount, "currency")}</span></div>
                </>
              )}
              {cbSubTab === "cash-payment" && (
                <>
                  <div className="flex justify-between"><span>Dr: Selected Account</span><span className="font-mono">{fmt(cbAmount, "currency")}</span></div>
                  <div className="flex justify-between"><span>Cr: Cash-in-Hand</span><span className="font-mono">{fmt(cbAmount, "currency")}</span></div>
                </>
              )}
              {cbSubTab === "bank-receipt" && (
                <>
                  <div className="flex justify-between"><span>Dr: Bank Account</span><span className="font-mono">{fmt(cbAmount, "currency")}</span></div>
                  <div className="flex justify-between"><span>Cr: Selected Account</span><span className="font-mono">{fmt(cbAmount, "currency")}</span></div>
                </>
              )}
              {cbSubTab === "bank-payment" && (
                <>
                  <div className="flex justify-between"><span>Dr: Selected Account</span><span className="font-mono">{fmt(cbAmount, "currency")}</span></div>
                  <div className="flex justify-between"><span>Cr: Bank Account</span><span className="font-mono">{fmt(cbAmount, "currency")}</span></div>
                </>
              )}
            </div>
          </div>

          {/* Post Button */}
          <div className="mt-4 flex justify-end">
            <Button
              className="bg-[#2563eb] hover:bg-[#1d4ed8] min-w-[220px]"
              onClick={postCashBankVoucher}
              disabled={cbPosting}
            >
              {cbPosting ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Re-calculating Trial Balances & Committing General Ledger Matrix...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4 mr-2" />
                  {cbIsBank ? "Authorize Bank Voucher" : "Authorize Cash Voucher"}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // RENDER: TAB 4 — Voucher Register
  // ============================================================
  const renderVoucherRegister = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={vrType} onValueChange={setVrType}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Voucher Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="JOURNAL">Journal</SelectItem>
            <SelectItem value="CASH_RECEIPT">Cash Receipt</SelectItem>
            <SelectItem value="CASH_PAYMENT">Cash Payment</SelectItem>
            <SelectItem value="BANK_RECEIPT">Bank Receipt</SelectItem>
            <SelectItem value="BANK_PAYMENT">Bank Payment</SelectItem>
          </SelectContent>
        </Select>
        <Select value={vrStatus} onValueChange={setVrStatus}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Posted">Posted</SelectItem>
          </SelectContent>
        </Select>
        <Input type="date" value={vrFrom} onChange={e => setVrFrom(e.target.value)} className="w-36" />
        <Input type="date" value={vrTo} onChange={e => setVrTo(e.target.value)} className="w-36" />
        <Button variant="outline" size="sm" onClick={loadVouchers}><RefreshCw className="w-4 h-4" /></Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportVoucherCSV}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={exportVoucherRegisterPDF}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          <Button variant="outline" size="sm" onClick={importVoucherCSV}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[70vh]">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#0a1628]">
                  <TableHead className="text-white w-8"></TableHead>
                  <TableHead className="text-white">Voucher No</TableHead>
                  <TableHead className="text-white">Date</TableHead>
                  <TableHead className="text-white">Type</TableHead>
                  <TableHead className="text-white">Narration</TableHead>
                  <TableHead className="text-white text-right">Total Debit</TableHead>
                  <TableHead className="text-white text-right">Total Credit</TableHead>
                  <TableHead className="text-white">Status</TableHead>
                  <TableHead className="text-white w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vouchersLoading ? (
                  <TableRow><TableCell colSpan={9} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                ) : vouchers.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No vouchers found</TableCell></TableRow>
                ) : vouchers.map((v: any) => (
                  <React.Fragment key={v.id}>
                    <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => setExpandedVoucher(expandedVoucher === v.id ? null : v.id)}>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                          {expandedVoucher === v.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                        </Button>
                      </TableCell>
                      <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{v.voucherNo}</TableCell>
                      <TableCell>{fmtDate(v.date)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          v.type === "JOURNAL" ? "border-blue-300 text-blue-600" :
                          v.type.includes("RECEIPT") ? "border-green-300 text-green-600" :
                          "border-red-300 text-red-600"
                        }>{v.type.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">{v.narration || "—"}</TableCell>
                      <TableCell className="font-mono text-right">{fmt(v.totalDebit, "currency")}</TableCell>
                      <TableCell className="font-mono text-right">{fmt(v.totalCredit, "currency")}</TableCell>
                      <TableCell>
                        <Badge className={v.status === "Posted" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"}>
                          {v.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); exportVoucherPDF(v); }}>
                          <FileDown className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                    {expandedVoucher === v.id && (
                      <TableRow>
                        <TableCell colSpan={9} className="bg-muted/30 p-3">
                          <div className="max-w-3xl mx-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Account</TableHead>
                                  <TableHead className="text-right">Debit</TableHead>
                                  <TableHead className="text-right">Credit</TableHead>
                                  <TableHead>Particulars</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(v.lines || []).map((line: any) => (
                                  <TableRow key={line.id}>
                                    <TableCell className="font-medium">{line.accountName || "—"}</TableCell>
                                    <TableCell className="font-mono text-right">{line.debit > 0 ? fmt(line.debit, "currency") : "—"}</TableCell>
                                    <TableCell className="font-mono text-right">{line.credit > 0 ? fmt(line.credit, "currency") : "—"}</TableCell>
                                    <TableCell>{line.particulars || "—"}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                            {v.bank && (
                              <div className="mt-2 text-sm text-muted-foreground">
                                Bank: {v.bank.bankName} — {v.bank.accountNo}
                                {v.chequeNo && <> | Cheque: {v.chequeNo}</>}
                                {v.chequeDate && <> | Cheque Date: {fmtDate(v.chequeDate)}</>}
                                {v.referenceNo && <> | Ref: {v.referenceNo}</>}
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
          <div className="p-3 text-xs text-muted-foreground border-t">{vouchers.length} vouchers</div>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // RENDER: TAB 5 — Ledger Statement
  // ============================================================
  const renderLedgerStatement = () => (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={ledgerAccountId} onValueChange={setLedgerAccountId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Select account..." /></SelectTrigger>
          <SelectContent className="max-h-64">
            {accounts.filter((a: any) => !a.isRoot).map((a: any) => (
              <SelectItem key={a.id} value={a.id}>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${CLASSIFICATION_DOT[a.classification] || "bg-slate-400"}`} />
                  {a.code} - {a.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="date" value={ledgerFrom} onChange={e => setLedgerFrom(e.target.value)} className="w-36" />
        <Input type="date" value={ledgerTo} onChange={e => setLedgerTo(e.target.value)} className="w-36" />
        <Button variant="outline" size="sm" onClick={loadLedger} disabled={!ledgerAccountId}>
          <RefreshCw className="w-4 h-4 mr-1" />Load
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={exportLedgerCSV} disabled={ledgerEntries.length === 0}>
            <Download className="w-4 h-4 mr-1" />CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportLedgerPDF} disabled={ledgerEntries.length === 0}>
            <FileDown className="w-4 h-4 mr-1" />PDF
          </Button>
          <Button variant="outline" size="sm" onClick={importLedgerCSV}>
            <Upload className="w-4 h-4 mr-1" />Import CSV
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {ledgerLoading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : !ledgerAccountId ? (
            <div className="text-center py-12 text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Select an account to view its ledger statement</p>
            </div>
          ) : ledgerWithBalance.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">No ledger entries found for this account</div>
          ) : (
            <div className="overflow-auto max-h-[70vh]">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#0a1628]">
                    <TableHead className="text-white">Date</TableHead>
                    <TableHead className="text-white">Particulars</TableHead>
                    <TableHead className="text-white text-right">Debit</TableHead>
                    <TableHead className="text-white text-right">Credit</TableHead>
                    <TableHead className="text-white text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerWithBalance.map((entry: any) => (
                    <TableRow key={entry.id} className="hover:bg-muted/50">
                      <TableCell>{fmtDate(entry.date)}</TableCell>
                      <TableCell>{entry.particulars || entry.account || "—"}</TableCell>
                      <TableCell className="font-mono text-right">{entry.debit > 0 ? fmt(entry.debit, "currency") : "—"}</TableCell>
                      <TableCell className="font-mono text-right">{entry.credit > 0 ? fmt(entry.credit, "currency") : "—"}</TableCell>
                      <TableCell className={`font-mono text-right font-medium ${entry.runningBalance >= 0 ? "text-slate-900 dark:text-white" : "text-red-600"}`}>
                        {fmt(entry.runningBalance, "currency")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {ledgerWithBalance.length > 0 && (
            <div className="p-3 border-t flex justify-between text-sm">
              <span className="text-muted-foreground">{ledgerWithBalance.length} entries</span>
              <span className="font-mono font-bold">
                Closing Balance: {fmt(ledgerWithBalance[ledgerWithBalance.length - 1]?.runningBalance || 0, "currency")}
              </span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // RENDER: COA Add/Edit Dialog
  // ============================================================
  const renderCOADialog = () => (
    <Dialog open={coaFormOpen} onOpenChange={setCoaFormOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{coaEditItem ? "Edit Account" : "Add New Account"}</DialogTitle>
          <DialogDescription>
            {coaEditItem ? "Update the account details below." : "Create a new Chart of Accounts entry."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Account Name *</Label>
            <Input value={coaFormData.name} onChange={e => setCoaFormData({ ...coaFormData, name: e.target.value })} placeholder="Enter account name" />
          </div>
          <div>
            <Label>Classification</Label>
            <Select value={coaFormData.classification} onValueChange={v => setCoaFormData({ ...coaFormData, classification: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Asset">Asset</SelectItem>
                <SelectItem value="Liability">Liability</SelectItem>
                <SelectItem value="Equity">Equity</SelectItem>
                <SelectItem value="Revenue">Revenue</SelectItem>
                <SelectItem value="Expense">Expense</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Parent Account</Label>
            <Select value={coaFormData.parentAccountId || "__none__"} onValueChange={v => setCoaFormData({ ...coaFormData, parentAccountId: v === "__none__" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="No parent (root)" /></SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value="__none__">No parent (root level)</SelectItem>
                {accounts
                  .filter((a: any) => a.id !== coaEditItem?.id)
                  .map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.code} - {a.name} ({a.classification})
                    </SelectItem>
                  ))
                }
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Opening Balance</Label>
              <Input type="number" min="0" step="0.01" value={coaFormData.openingBalance || ""} onChange={e => setCoaFormData({ ...coaFormData, openingBalance: Number(e.target.value) || 0 })} />
            </div>
            <div>
              <Label>Opening Balance Type</Label>
              <Select value={coaFormData.openingBalanceType} onValueChange={v => setCoaFormData({ ...coaFormData, openingBalanceType: v })}>
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
          <Button variant="outline" onClick={() => setCoaFormOpen(false)}>Cancel</Button>
          <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={saveCOA} disabled={coaSaving}>
            {coaSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
            {coaEditItem ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ============================================================
  // RENDER: COA Delete Dialog
  // ============================================================
  const renderCOADeleteDialog = () => (
    <Dialog open={!!coaDeleteItem} onOpenChange={() => setCoaDeleteItem(null)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete Account</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete <strong>{coaDeleteItem?.name}</strong> ({coaDeleteItem?.code})?
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setCoaDeleteItem(null)}>Cancel</Button>
          <Button variant="destructive" onClick={deleteCOA}>
            <Trash2 className="w-4 h-4 mr-1" />Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <div className="page-enter space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <BookOpen className="w-6 h-6 text-[#2563eb]" />
          Accounts & Ledger Management
        </h2>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-[#0a1628]/5 dark:bg-[#0a1628]/20 p-1 rounded-lg">
          <TabsTrigger value="coa-tree" className="flex items-center gap-1 data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <BookOpen className="w-4 h-4" />COA Tree
          </TabsTrigger>
          <TabsTrigger value="journal-voucher" className="flex items-center gap-1 data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <FileText className="w-4 h-4" />Journal Voucher
          </TabsTrigger>
          <TabsTrigger value="cash-bank-vouchers" className="flex items-center gap-1 data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <Banknote className="w-4 h-4" />Cash/Bank Vouchers
          </TabsTrigger>
          <TabsTrigger value="voucher-register" className="flex items-center gap-1 data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <List className="w-4 h-4" />Voucher Register
          </TabsTrigger>
          <TabsTrigger value="ledger-statement" className="flex items-center gap-1 data-[state=active]:bg-[#2563eb] data-[state=active]:text-white">
            <ClipboardList className="w-4 h-4" />Ledger Statement
          </TabsTrigger>
        </TabsList>

        <TabsContent value="coa-tree">{renderCOATree()}</TabsContent>
        <TabsContent value="journal-voucher">{renderJournalVoucher()}</TabsContent>
        <TabsContent value="cash-bank-vouchers">{renderCashBankVouchers()}</TabsContent>
        <TabsContent value="voucher-register">{renderVoucherRegister()}</TabsContent>
        <TabsContent value="ledger-statement">{renderLedgerStatement()}</TabsContent>
      </Tabs>

      {/* Dialogs */}
      {renderCOADialog()}
      {renderCOADeleteDialog()}
    </div>
  );
}
