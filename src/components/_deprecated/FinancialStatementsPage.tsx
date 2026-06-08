"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Lock, Plus, RefreshCw, Download, FileDown,
  DollarSign, TrendingUp, TrendingDown, BarChart3, FileText,
  CheckCircle, AlertTriangle, Wallet, Landmark, Scale,
  Shield, Calendar, AlertOctagon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF, exportToCSVSimple, ColumnDef, CompanyProfile,
} from "@/lib/export-utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell,
} from "recharts";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const AUDIT_MASK = "N/A (Audit Mode)";

const bdFmt = new Intl.NumberFormat("en-BD", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmt = (v: any, type?: string) => {
  if (String(v) === AUDIT_MASK) return AUDIT_MASK;
  if (v === null || v === undefined) return "—";
  if (type === "currency") return `৳${bdFmt.format(Number(v))}`;
  if (type === "number") return bdFmt.format(Number(v));
  if (type === "date")
    return v
      ? new Date(v).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        })
      : "—";
  if (type === "percent") return `${Number(v).toFixed(2)}%`;
  return String(v);
};

const fmtDate = (d: string | Date) =>
  d
    ? new Date(d).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "—";


// ============================================================
// Auth Hook

const PIE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316",
];

// ============================================================
// FinancialStatementsPage Component
// ============================================================

export default function FinancialStatementsPage({
  initialTab,
}: {
  initialTab?: string;
}) {
  const { toast } = useToast();
  const { isVatAuditor, isSR, isDealer, isAdmin, user } = useAuth();

  // ── Tab State ──
  const [activeTab, setActiveTab] = useState<
    "trial" | "pl" | "bs" | "fy" | "yec"
  >(() => {
    if (initialTab === "profit-loss") return "pl";
    if (initialTab === "balance-sheet") return "bs";
    if (initialTab === "fiscal-years") return "fy";
    if (initialTab === "year-end-close") return "yec";
    return "trial";
  });

  // ── Trial Balance ──
  const [tbData, setTbData] = useState<any>(null);
  const [tbLoading, setTbLoading] = useState(false);
  const [tbFrom, setTbFrom] = useState("");
  const [tbTo, setTbTo] = useState("");

  // ── P&L ──
  const [plData, setPlData] = useState<any>(null);
  const [plLoading, setPlLoading] = useState(false);
  const [plFrom, setPlFrom] = useState("");
  const [plTo, setPlTo] = useState("");

  // ── Balance Sheet ──
  const [bsData, setBsData] = useState<any>(null);
  const [bsLoading, setBsLoading] = useState(false);
  const [bsAsOf, setBsAsOf] = useState("");

  // ── Fiscal Year Management ──
  const [fyList, setFyList] = useState<any[]>([]);
  const [fyLoading, setFyLoading] = useState(false);
  const [fyDialogOpen, setFyDialogOpen] = useState(false);
  const [fyForm, setFyForm] = useState({
    name: "",
    startDate: "",
    endDate: "",
    notes: "",
  });

  // ── Year-End Close ──
  const [yecSelectedFy, setYecSelectedFy] = useState("");
  const [yecLoading, setYecLoading] = useState(false);
  const [yecPreClose, setYecPreClose] = useState<any>(null);
  const [yecConfirmOpen, setYecConfirmOpen] = useState(false);
  const [yecResult, setYecResult] = useState<any>(null);

  // ── Company Profile for PDF ──
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(
    null
  );

  // ── Fiscal Snapshot for error recovery ──
  const fiscalSnapshot = useRef<any>(null);

  // ── COA Breakdown expand states ──
  const [expandAssets, setExpandAssets] = useState(false);
  const [expandLiabilities, setExpandLiabilities] = useState(false);
  const [expandEquity, setExpandEquity] = useState(false);

  // ── Load Company Profile ──
  useEffect(() => {
    apiFetch("/api/company-branding")
      .then(setCompanyProfile)
      .catch((e) => { console.warn("Failed to load company branding:", e); });
  }, []);

  // ── Load Fiscal Years ──
  const loadFiscalYears = useCallback(async () => {
    setFyLoading(true);
    try {
      const res = await apiFetch("/api/fiscal-years");
      setFyList(Array.isArray(res) ? res : []);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setFyLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadFiscalYears();
  }, [loadFiscalYears]);

  // ============================================================
  // TAB 1: TRIAL BALANCE
  // ============================================================

  const loadTrialBalance = useCallback(async () => {
    fiscalSnapshot.current = { tbData, plData, bsData, fyList };
    setTbLoading(true);
    try {
      const params = new URLSearchParams();
      if (tbFrom) params.set("from", tbFrom);
      if (tbTo) params.set("to", tbTo);
      if (isVatAuditor) params.set("vatMode", "true");
      const qs = params.toString();
      const res = await apiFetch(
        `/api/reports/trial-balance${qs ? "?" + qs : ""}`
      );
      setTbData(res);
    } catch (e: any) {
      if (fiscalSnapshot.current) setTbData(fiscalSnapshot.current.tbData);
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setTbLoading(false);
    }
  }, [toast, tbFrom, tbTo, isVatAuditor, tbData, plData, bsData, fyList]);

  useEffect(() => {
    if (activeTab === "trial") loadTrialBalance();
  }, [activeTab, loadTrialBalance]);

  // ============================================================
  // TAB 2: INCOME STATEMENT (P&L)
  // ============================================================

  const loadPL = useCallback(async () => {
    fiscalSnapshot.current = { tbData, plData, bsData, fyList };
    setPlLoading(true);
    try {
      const params = new URLSearchParams();
      if (plFrom) params.set("from", plFrom);
      if (plTo) params.set("to", plTo);
      if (isVatAuditor) params.set("vatMode", "true");
      const qs = params.toString();
      const res = await apiFetch(
        `/api/reports/profit-loss${qs ? "?" + qs : ""}`
      );
      setPlData(res);
    } catch (e: any) {
      if (fiscalSnapshot.current) setPlData(fiscalSnapshot.current.plData);
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setPlLoading(false);
    }
  }, [toast, plFrom, plTo, isVatAuditor, tbData, plData, bsData, fyList]);

  useEffect(() => {
    if (activeTab === "pl") loadPL();
  }, [activeTab, loadPL]);

  // ============================================================
  // TAB 3: BALANCE SHEET
  // ============================================================

  const loadBS = useCallback(async () => {
    fiscalSnapshot.current = { tbData, plData, bsData, fyList };
    setBsLoading(true);
    try {
      const params = new URLSearchParams();
      if (bsAsOf) params.set("asOf", bsAsOf);
      if (isVatAuditor) params.set("vatMode", "true");
      const qs = params.toString();
      const res = await apiFetch(
        `/api/reports/balance-sheet${qs ? "?" + qs : ""}`
      );
      setBsData(res);
    } catch (e: any) {
      if (fiscalSnapshot.current) setBsData(fiscalSnapshot.current.bsData);
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setBsLoading(false);
    }
  }, [toast, bsAsOf, isVatAuditor, tbData, plData, bsData, fyList]);

  useEffect(() => {
    if (activeTab === "bs") loadBS();
  }, [activeTab, loadBS]);

  // ============================================================
  // YEAR-END CLOSE: Pre-close summary
  // ============================================================

  const loadPreCloseSummary = useCallback(async () => {
    if (!yecSelectedFy) return;
    try {
      // Fetch COA-based data for pre-close summary
      const coaRes = await apiFetch("/api/reports/trial-balance");
      const revenueAccounts = (coaRes?.coaBasedEntries || []).filter(
        (e: any) =>
          ["Income", "Revenue"].includes(e.classification) &&
          e.currentBalance > 0
      );
      const expenseAccounts = (coaRes?.coaBasedEntries || []).filter(
        (e: any) =>
          ["Expense", "Expenses"].includes(e.classification) &&
          e.currentBalance > 0
      );
      let totalRevenue = 0;
      for (const a of revenueAccounts)
        totalRevenue += Math.abs(a.currentBalance);
      let totalExpenses = 0;
      for (const a of expenseAccounts)
        totalExpenses += Math.abs(a.currentBalance);
      const netProfit = totalRevenue - totalExpenses;
      const nominalCount =
        revenueAccounts.filter((a: any) => a.currentBalance !== 0).length +
        expenseAccounts.filter((a: any) => a.currentBalance !== 0).length;

      setYecPreClose({
        totalRevenue,
        totalExpenses,
        netProfit,
        nominalCount,
        revenueAccounts,
        expenseAccounts,
      });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  }, [yecSelectedFy, toast]);

  useEffect(() => {
    if (yecSelectedFy) loadPreCloseSummary();
  }, [yecSelectedFy, loadPreCloseSummary]);

  // ============================================================
  // RBAC: SR/Dealer => 403
  // ============================================================

  if (isSR || isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-red-300 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              403 - Access Denied
            </h3>
            <p className="text-muted-foreground">
              You do not have permission to access Financial Statements. Contact
              your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // EXPORT HELPERS
  // ============================================================

  const getFinancialFooter = () => ({
    preparedBy: user?.displayName || "",
    checkedBy: "",
    authorizedBy: "",
    printedBy: user?.displayName || "System",
  });

  // ── Trial Balance CSV ──
  const exportTbCSV = () => {
    if (!tbData) return;
    try {
      const headers = [
        "Account Name",
        "Classification",
        "Total Debit",
        "Total Credit",
        "Net Balance",
        "Balance Type",
      ];
      const rows = (tbData.entries || []).map((e: any) => [
        e.account,
        e.classification,
        String(e.totalDebit),
        String(e.totalCredit),
        isVatAuditor ? AUDIT_MASK : String(Math.abs(e.netBalance || 0)),
        e.netBalance >= 0 ? "Dr" : "Cr",
      ]);
      exportToCSVSimple("Trial-Balance", headers, rows);
      toast({ title: "Exported", description: "Trial Balance exported to CSV" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // ── Trial Balance PDF ──
  const exportTbPDF = () => {
    if (!tbData) return;
    try {
      const columns: ColumnDef[] = [
        { key: "account", label: "Account Name", type: "text" },
        { key: "classification", label: "Classification", type: "text" },
        { key: "totalDebit", label: "Total Debit", type: "currency" },
        { key: "totalCredit", label: "Total Credit", type: "currency" },
        { key: "netBalance", label: "Net Balance", type: "currency" },
        { key: "balanceType", label: "Dr/Cr", type: "text" },
      ];
      const data = (tbData.entries || []).map((e: any) => ({
        account: e.account,
        classification: e.classification,
        totalDebit: e.totalDebit,
        totalCredit: e.totalCredit,
        netBalance: isVatAuditor ? AUDIT_MASK : Math.abs(e.netBalance || 0),
        balanceType: e.netBalance >= 0 ? "Dr" : "Cr",
      }));
      exportToPDF({
        title: "Trial Balance",
        subtitle: tbData.from || tbData.to
          ? `Period: ${fmtDate(tbData.from)} — ${fmtDate(tbData.to)}`
          : undefined,
        columns,
        data,
        orientation: "landscape",
        isVatAuditor,
        vatMaskedColumns: ["netBalance", "totalDebit", "totalCredit"],
        company: companyProfile || undefined,
        financialFooter: getFinancialFooter(),
      });
      toast({ title: "Exported", description: "Trial Balance exported to PDF" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // ── P&L CSV ──
  const exportPlCSV = () => {
    if (!plData) return;
    try {
      const headers = ["Item", "Amount"];
      const rows = [
        ["Sales Revenue", String(plData.salesRevenue)],
        ["Other Income", String(plData.otherIncome)],
        ["Total Revenue", String(plData.revenue)],
        ["COGS", String(plData.costOfGoods)],
        ["Gross Profit", String(plData.grossProfit)],
        [
          "Operating Expenses",
          isVatAuditor ? AUDIT_MASK : String(plData.operatingExpenses),
        ],
        [
          "Net Profit",
          isVatAuditor ? AUDIT_MASK : String(plData.netProfit),
        ],
      ];
      exportToCSVSimple("Income-Statement", headers, rows);
      toast({ title: "Exported", description: "Income Statement exported to CSV" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // ── P&L PDF ──
  const exportPlPDF = () => {
    if (!plData) return;
    try {
      const columns: ColumnDef[] = [
        { key: "item", label: "Item", type: "text" },
        { key: "amount", label: "Amount", type: "currency" },
      ];
      const data = [
        { item: "Sales Revenue", amount: plData.salesRevenue },
        { item: "Other Income", amount: plData.otherIncome },
        { item: "Total Revenue", amount: plData.revenue },
        { item: "Cost of Goods Sold", amount: plData.costOfGoods },
        { item: "Gross Profit", amount: plData.grossProfit },
        {
          item: "Operating Expenses",
          amount: isVatAuditor ? AUDIT_MASK : plData.operatingExpenses,
        },
        {
          item: "Net Profit/Loss",
          amount: isVatAuditor ? AUDIT_MASK : plData.netProfit,
        },
      ];
      exportToPDF({
        title: "Income Statement",
        subtitle: plData.from || plData.to
          ? `Period: ${fmtDate(plData.from)} — ${fmtDate(plData.to)}`
          : undefined,
        columns,
        data,
        orientation: "portrait",
        isVatAuditor,
        vatMaskedColumns: ["amount"],
        company: companyProfile || undefined,
        financialFooter: getFinancialFooter(),
      });
      toast({ title: "Exported", description: "Income Statement exported to PDF" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // ── Balance Sheet CSV ──
  const exportBsCSV = () => {
    if (!bsData) return;
    try {
      const headers = ["Section", "Item", "Amount"];
      const rows: string[][] = [];
      const a = bsData.assets || {};
      const l = bsData.liabilities || {};
      rows.push(["ASSETS", "Stock Value", String(a.stock || 0)]);
      rows.push(["ASSETS", "Bank Balance", String(a.bankBalance || 0)]);
      rows.push(["ASSETS", "Receivables", String(a.receivables || 0)]);
      rows.push(["ASSETS", "Supplier Advances", String(a.supplierAdvances || 0)]);
      rows.push(["ASSETS", "Total Assets", String(a.totalAssets || 0)]);
      rows.push(["LIABILITIES", "Payables", String(l.payables || 0)]);
      rows.push(["LIABILITIES", "Customer Advances", String(l.customerAdvances || 0)]);
      rows.push(["LIABILITIES", "Equity / Retained Earnings", String(l.equity || 0)]);
      rows.push(["LIABILITIES", "Total Liabilities + Equity", String(l.totalLiabilities || 0)]);
      exportToCSVSimple("Balance-Sheet", headers, rows);
      toast({ title: "Exported", description: "Balance Sheet exported to CSV" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // ── Balance Sheet PDF ──
  const exportBsPDF = () => {
    if (!bsData) return;
    try {
      const columns: ColumnDef[] = [
        { key: "section", label: "Section", type: "text" },
        { key: "item", label: "Item", type: "text" },
        { key: "amount", label: "Amount", type: "currency" },
      ];
      const a = bsData.assets || {};
      const l = bsData.liabilities || {};
      const data = [
        { section: "ASSETS", item: "Stock Value", amount: a.stock || 0 },
        { section: "ASSETS", item: "Bank Balance", amount: a.bankBalance || 0 },
        { section: "ASSETS", item: "Receivables", amount: a.receivables || 0 },
        { section: "ASSETS", item: "Supplier Advances", amount: a.supplierAdvances || 0 },
        { section: "ASSETS", item: "Total Assets", amount: a.totalAssets || 0 },
        { section: "LIABILITIES + EQUITY", item: "Payables", amount: l.payables || 0 },
        { section: "LIABILITIES + EQUITY", item: "Customer Advances", amount: l.customerAdvances || 0 },
        { section: "LIABILITIES + EQUITY", item: "Equity / Retained Earnings", amount: l.equity || 0 },
        { section: "LIABILITIES + EQUITY", item: "Total Liabilities + Equity", amount: l.totalLiabilities || 0 },
      ];
      exportToPDF({
        title: "Balance Sheet",
        subtitle: `As of ${fmtDate(bsData.asOf)}`,
        columns,
        data,
        orientation: "portrait",
        isVatAuditor,
        vatMaskedColumns: ["amount"],
        company: companyProfile || undefined,
        financialFooter: getFinancialFooter(),
      });
      toast({ title: "Exported", description: "Balance Sheet exported to PDF" });
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // ============================================================
  // FISCAL YEAR MANAGEMENT HANDLERS
  // ============================================================

  const handleCreateFY = async () => {
    if (!fyForm.name.trim() || !fyForm.startDate || !fyForm.endDate) {
      toast({
        title: "Validation Error",
        description: "Name, start date, and end date are required.",
        variant: "destructive",
      });
      return;
    }
    try {
      await apiFetch("/api/fiscal-years", {
        method: "POST",
        body: JSON.stringify(fyForm),
      });
      toast({
        title: "Created",
        description: "Fiscal year created successfully",
      });
      setFyDialogOpen(false);
      setFyForm({ name: "", startDate: "", endDate: "", notes: "" });
      loadFiscalYears();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  const handleDeleteFY = async (id: string) => {
    if (!confirm("Are you sure you want to delete this fiscal year? Only OPEN fiscal years can be deleted."))
      return;
    try {
      await apiFetch(`/api/fiscal-years/${id}`, { method: "DELETE" });
      toast({
        title: "Deleted",
        description: "Fiscal year deleted successfully",
      });
      loadFiscalYears();
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message,
        variant: "destructive",
      });
    }
  };

  // ============================================================
  // YEAR-END CLOSE HANDLER
  // ============================================================

  const executeYearEndClose = async () => {
    if (!yecSelectedFy) return;
    fiscalSnapshot.current = { tbData, plData, bsData, fyList };
    setYecLoading(true);
    setYecConfirmOpen(false);
    try {
      const res = await apiFetch(`/api/fiscal-years/${yecSelectedFy}/close`, {
        method: "POST",
      });
      setYecResult(res);
      toast({
        title: "Year-End Close Complete",
        description: `Fiscal year closed. Net Profit Transferred: ৳${bdFmt.format(res.fiscalYear?.netProfitClosed || 0)}`,
      });
      loadFiscalYears();
      setYecPreClose(null);
    } catch (e: any) {
      if (fiscalSnapshot.current) {
        setTbData(fiscalSnapshot.current.tbData);
        setPlData(fiscalSnapshot.current.plData);
        setBsData(fiscalSnapshot.current.bsData);
        setFyList(fiscalSnapshot.current.fyList);
      }
      toast({
        title: "Year-End Close Failed",
        description: e.message,
        variant: "destructive",
      });
    } finally {
      setYecLoading(false);
    }
  };

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white flex items-center gap-1">
            <Shield className="w-3 h-3" /> VAT AUDIT MODE
          </Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">
            Financial amounts, margins, and detailed balances masked. Only
            legal outward/inward invoice tax records shown.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Scale className="w-6 h-6" />
          Financial Statements
        </h2>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) =>
          setActiveTab(v as "trial" | "pl" | "bs" | "fy" | "yec")
        }
      >
        <TabsList className="flex flex-wrap gap-1">
          <TabsTrigger value="trial" className="flex items-center gap-1">
            <Scale className="w-4 h-4" /> Trial Balance
          </TabsTrigger>
          <TabsTrigger value="pl" className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4" /> Income Statement
          </TabsTrigger>
          <TabsTrigger value="bs" className="flex items-center gap-1">
            <Landmark className="w-4 h-4" /> Balance Sheet
          </TabsTrigger>
          <TabsTrigger value="fy" className="flex items-center gap-1">
            <Calendar className="w-4 h-4" /> Fiscal Years
          </TabsTrigger>
          <TabsTrigger value="yec" className="flex items-center gap-1">
            <Lock className="w-4 h-4" /> Year-End Close
          </TabsTrigger>
        </TabsList>

        {/* ============================================ */}
        {/* TAB 1: TRIAL BALANCE */}
        {/* ============================================ */}
        <TabsContent value="trial">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Label className="text-sm">From</Label>
            <Input
              type="date"
              value={tbFrom}
              onChange={(e) => setTbFrom(e.target.value)}
              className="w-40"
            />
            <Label className="text-sm">To</Label>
            <Input
              type="date"
              value={tbTo}
              onChange={(e) => setTbTo(e.target.value)}
              className="w-40"
            />
            <Button
              size="sm"
              className="bg-[#2563eb] hover:bg-[#1d4ed8]"
              onClick={loadTrialBalance}
              disabled={tbLoading}
            >
              {tbLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Consolidating Dynamic Account Ledgers...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Compile Dynamic Trial Balance
                </>
              )}
            </Button>
            <div className="flex gap-1 ml-auto">
              <Button variant="outline" size="sm" onClick={exportTbCSV} disabled={!tbData}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportTbPDF} disabled={!tbData}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
            </div>
          </div>

          {tbLoading && !tbData ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : tbData ? (
            <>
              {/* Balanced/Unbalanced Badge */}
              <div className="flex items-center gap-3 mt-4">
                <Badge
                  className={`${
                    tbData.balanced
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  } text-sm px-3 py-1`}
                >
                  {tbData.balanced ? (
                    <CheckCircle className="w-4 h-4 mr-1 inline" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mr-1 inline" />
                  )}
                  {tbData.balanced ? "Balanced" : "Unbalanced"}
                </Badge>
                {tbData.integrityWarning && (
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-sm px-3 py-1">
                    <AlertOctagon className="w-4 h-4 mr-1 inline" />
                    Integrity: {fmt(tbData.integrityWarning.imbalance, "currency")}
                  </Badge>
                )}
              </div>

              {/* Fiscal Year Status Indicators */}
              {tbData.fiscalYearStatus &&
                tbData.fiscalYearStatus.length > 0 && (
                  <Card className="mt-4 border-amber-300 dark:border-amber-800">
                    <CardHeader className="bg-amber-50 dark:bg-amber-900/20 rounded-t-lg py-3 px-4">
                      <CardTitle className="text-amber-700 dark:text-amber-400 text-sm flex items-center gap-1">
                        <Lock className="w-4 h-4" /> Closed Fiscal Year(s) in
                        Query Range
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {tbData.fiscalYearStatus.map((fy: any) => (
                          <Badge
                            key={fy.id}
                            className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {fy.name} ({fmtDate(fy.startDate)} —{" "}
                            {fmtDate(fy.endDate)}) — CLOSED
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* Trial Balance Table */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">
                    Trial Balance
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="table-container overflow-auto max-h-[50vh] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Account Name</TableHead>
                          <TableHead>Classification</TableHead>
                          <TableHead className="text-right">Total Debit</TableHead>
                          <TableHead className="text-right">
                            Total Credit
                          </TableHead>
                          <TableHead className="text-right">
                            Net Balance
                          </TableHead>
                          <TableHead className="text-center">Dr/Cr</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(tbData.entries || []).length === 0 ? (
                          <TableRow>
                            <TableCell
                              colSpan={6}
                              className="h-16 text-center text-muted-foreground"
                            >
                              No entries
                            </TableCell>
                          </TableRow>
                        ) : (
                          <>
                            {tbData.entries.map((e: any, i: number) => (
                              <TableRow key={i} className="hover:bg-muted/50">
                                <TableCell className="font-medium text-slate-900 dark:text-white">
                                  {e.account}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    {e.classification}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {fmt(e.totalDebit, "currency")}
                                </TableCell>
                                <TableCell className="text-right font-mono">
                                  {fmt(e.totalCredit, "currency")}
                                </TableCell>
                                <TableCell className="text-right font-mono font-bold">
                                  {isVatAuditor ? (
                                    <span className="text-amber-600 dark:text-amber-400 text-xs italic">
                                      {AUDIT_MASK}
                                    </span>
                                  ) : (
                                    fmt(Math.abs(e.netBalance || 0), "currency")
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {e.netBalance >= 0 ? "Dr" : "Cr"}
                                </TableCell>
                              </TableRow>
                            ))}
                            {/* Grand Total Row */}
                            <TableRow className="bg-muted/50 font-bold">
                              <TableCell
                                className="text-slate-900 dark:text-white"
                                colSpan={2}
                              >
                                Grand Total
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {fmt(tbData.grandTotalDebit, "currency")}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {fmt(tbData.grandTotalCredit, "currency")}
                              </TableCell>
                              <TableCell className="text-right font-mono" colSpan={2}>
                                {tbData.balanced ? (
                                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                    <CheckCircle className="w-3 h-3 mr-1" /> Balanced
                                  </Badge>
                                ) : (
                                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                    <AlertTriangle className="w-3 h-3 mr-1" /> Unbalanced
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* COA-Based Cross-Check */}
              {tbData.coaBasedEntries && tbData.coaBasedEntries.length > 0 && (
                <Card className="mt-4 border-blue-200 dark:border-blue-800">
                  <CardHeader className="bg-blue-50 dark:bg-blue-900/20 rounded-t-lg py-3 px-4">
                    <CardTitle className="text-blue-700 dark:text-blue-400 text-sm flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" /> COA-Based Trial Balance
                      Cross-Check
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="table-container overflow-auto max-h-[30vh] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Code</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Classification</TableHead>
                            <TableHead className="text-right">
                              Current Balance
                            </TableHead>
                            <TableHead className="text-right">
                              Opening Balance
                            </TableHead>
                            <TableHead className="text-center">Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {tbData.coaBasedEntries.map((e: any, i: number) => (
                            <TableRow key={i} className="hover:bg-muted/50">
                              <TableCell className="font-mono text-xs">
                                {e.code}
                              </TableCell>
                              <TableCell className="font-medium text-slate-900 dark:text-white">
                                {e.name}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className="text-xs">
                                  {e.classification}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {isVatAuditor ? (
                                  <span className="text-amber-600 dark:text-amber-400 text-xs italic">
                                    {AUDIT_MASK}
                                  </span>
                                ) : (
                                  fmt(e.currentBalance, "currency")
                                )}
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {fmt(e.openingBalance, "currency")}
                              </TableCell>
                              <TableCell className="text-center text-xs">
                                {e.openingBalanceType}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Charts Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Top 10 Accounts Bar Chart */}
                {(tbData.chartData || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">
                        Top 10 Accounts by Debit/Credit
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={tbData.chartData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="account" tick={{ fontSize: 9 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip />
                          <Legend />
                          <Bar dataKey="debit" fill="#ef4444" name="Debit" />
                          <Bar dataKey="credit" fill="#10b981" name="Credit" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Account Distribution Pie */}
                {(tbData.pieData || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">
                        Account Balance Distribution
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={tbData.pieData}
                            cx="50%"
                            cy="50%"
                            outerRadius={100}
                            dataKey="value"
                            label={({ name, percent }: any) =>
                              `${name} (${(percent * 100).toFixed(0)}%)`
                            }
                          >
                            {tbData.pieData.map((_: any, i: number) => (
                              <Cell
                                key={i}
                                fill={PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              No data available. Click &quot;Compile Dynamic Trial Balance&quot;
              to generate.
            </div>
          )}
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 2: INCOME STATEMENT (P&L) */}
        {/* ============================================ */}
        <TabsContent value="pl">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Label className="text-sm">From</Label>
            <Input
              type="date"
              value={plFrom}
              onChange={(e) => setPlFrom(e.target.value)}
              className="w-40"
            />
            <Label className="text-sm">To</Label>
            <Input
              type="date"
              value={plTo}
              onChange={(e) => setPlTo(e.target.value)}
              className="w-40"
            />
            <Button
              size="sm"
              className="bg-[#2563eb] hover:bg-[#1d4ed8]"
              onClick={loadPL}
              disabled={plLoading}
            >
              {plLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Consolidating Dynamic Account Ledgers...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Compile Dynamic Income Statement
                </>
              )}
            </Button>
            <div className="flex gap-1 ml-auto">
              <Button variant="outline" size="sm" onClick={exportPlCSV} disabled={!plData}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportPlPDF} disabled={!plData}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
            </div>
          </div>

          {plLoading && !plData ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : plData ? (
            <>
              {/* P&L Statement Table */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">
                    Profit & Loss Statement (Income Statement)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="table-container overflow-auto max-h-[50vh] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Revenue Section */}
                        <TableRow className="bg-blue-50/50 dark:bg-blue-900/10">
                          <TableCell
                            colSpan={2}
                            className="font-bold text-blue-700 dark:text-blue-400"
                          >
                            REVENUE
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">
                            Sales Revenue
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(plData.salesRevenue, "currency")}
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">
                            Other Income
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(plData.otherIncome, "currency")}
                          </TableCell>
                        </TableRow>
                        <TableRow className="bg-green-50/50 dark:bg-green-900/10 font-bold">
                          <TableCell className="text-slate-900 dark:text-white">
                            Total Revenue
                          </TableCell>
                          <TableCell className="text-right font-mono text-green-700 dark:text-green-400">
                            {fmt(plData.revenue, "currency")}
                          </TableCell>
                        </TableRow>

                        {/* COGS Section */}
                        <TableRow className="bg-red-50/50 dark:bg-red-900/10">
                          <TableCell
                            colSpan={2}
                            className="font-bold text-red-700 dark:text-red-400"
                          >
                            COST OF GOODS SOLD
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">
                            COGS
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(plData.costOfGoods, "currency")}
                          </TableCell>
                        </TableRow>

                        {/* Gross Profit */}
                        <TableRow className="bg-emerald-50/50 dark:bg-emerald-900/10 font-bold">
                          <TableCell className="text-slate-900 dark:text-white">
                            Gross Profit
                          </TableCell>
                          <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">
                            {fmt(plData.grossProfit, "currency")}
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 italic text-muted-foreground">
                            Gross Profit Margin
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fmt(plData.grossProfitMargin, "percent")}
                          </TableCell>
                        </TableRow>

                        {/* Operating Expenses */}
                        <TableRow className="bg-amber-50/50 dark:bg-amber-900/10">
                          <TableCell
                            colSpan={2}
                            className="font-bold text-amber-700 dark:text-amber-400"
                          >
                            OPERATING EXPENSES
                          </TableCell>
                        </TableRow>
                        {(plData.expenseDetails || []).map((e: any, i: number) => (
                          <TableRow key={i} className="hover:bg-muted/50">
                            <TableCell className="pl-6 text-slate-900 dark:text-white">
                              {e.head}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {isVatAuditor ? (
                                <span className="text-amber-600 dark:text-amber-400 text-xs italic">
                                  {AUDIT_MASK}
                                </span>
                              ) : (
                                fmt(e.amount, "currency")
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="hover:bg-muted/50 font-semibold">
                          <TableCell className="text-slate-900 dark:text-white">
                            Total Operating Expenses
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor ? (
                              <span className="text-amber-600 dark:text-amber-400 text-xs italic">
                                {AUDIT_MASK}
                              </span>
                            ) : (
                              fmt(plData.operatingExpenses, "currency")
                            )}
                          </TableCell>
                        </TableRow>

                        {/* Net Profit */}
                        <TableRow className="bg-purple-50/50 dark:bg-purple-900/10 font-bold border-t-2 border-purple-300">
                          <TableCell className="text-slate-900 dark:text-white">
                            Net Profit / Loss
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {AUDIT_MASK}
                              </span>
                            ) : (
                              <span
                                className={
                                  typeof plData.netProfit === "number" &&
                                  plData.netProfit >= 0
                                    ? "text-green-700 dark:text-green-400"
                                    : "text-red-700 dark:text-red-400"
                                }
                              >
                                {fmt(plData.netProfit, "currency")}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 italic text-muted-foreground">
                            Net Profit Margin
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor ? (
                              <span className="text-amber-600 dark:text-amber-400">
                                {AUDIT_MASK}
                              </span>
                            ) : (
                              fmt(plData.netProfitMargin, "percent")
                            )}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* COA-Based P&L Cross-Check */}
              {plData.coaBasedPL && (
                <Card className="mt-4 border-blue-200 dark:border-blue-800">
                  <CardHeader className="bg-blue-50 dark:bg-blue-900/20 rounded-t-lg py-3 px-4">
                    <CardTitle className="text-blue-700 dark:text-blue-400 text-sm flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" /> COA-Based P&L Cross-Check
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                        <p className="text-xs text-muted-foreground">
                          COA Revenue
                        </p>
                        <p className="text-lg font-bold text-green-700 dark:text-green-400">
                          {isVatAuditor ? AUDIT_MASK : fmt(plData.coaBasedPL.revenue, "currency")}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                        <p className="text-xs text-muted-foreground">
                          COA Expenses
                        </p>
                        <p className="text-lg font-bold text-red-700 dark:text-red-400">
                          {isVatAuditor ? AUDIT_MASK : fmt(plData.coaBasedPL.expenses, "currency")}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                        <p className="text-xs text-muted-foreground">
                          COA Net Profit
                        </p>
                        <p className="text-lg font-bold text-purple-700 dark:text-purple-400">
                          {isVatAuditor ? AUDIT_MASK : fmt(plData.coaBasedPL.netProfit, "currency")}
                        </p>
                      </div>
                    </div>
                    {/* Revenue Breakdown */}
                    {(plData.coaBasedPL.revenueBreakdown || []).length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold mb-2 text-slate-900 dark:text-white">
                          Revenue Accounts (COA)
                        </p>
                        <div className="table-container overflow-auto max-h-40 rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {plData.coaBasedPL.revenueBreakdown.map(
                                (a: any, i: number) => (
                                  <TableRow key={i} className="hover:bg-muted/50">
                                    <TableCell className="font-mono text-xs">
                                      {a.code}
                                    </TableCell>
                                    <TableCell>{a.name}</TableCell>
                                    <TableCell className="text-right font-mono">
                                      {isVatAuditor
                                        ? AUDIT_MASK
                                        : fmt(a.currentBalance, "currency")}
                                    </TableCell>
                                  </TableRow>
                                )
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                    {/* Expense Breakdown */}
                    {(plData.coaBasedPL.expenseBreakdown || []).length > 0 && (
                      <div className="mt-4">
                        <p className="text-sm font-semibold mb-2 text-slate-900 dark:text-white">
                          Expense Accounts (COA)
                        </p>
                        <div className="table-container overflow-auto max-h-40 rounded-md border">
                          <Table>
                            <TableHeader>
                              <TableRow className="bg-muted/50">
                                <TableHead>Code</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead className="text-right">Balance</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {plData.coaBasedPL.expenseBreakdown.map(
                                (a: any, i: number) => (
                                  <TableRow key={i} className="hover:bg-muted/50">
                                    <TableCell className="font-mono text-xs">
                                      {a.code}
                                    </TableCell>
                                    <TableCell>{a.name}</TableCell>
                                    <TableCell className="text-right font-mono">
                                      {isVatAuditor
                                        ? AUDIT_MASK
                                        : fmt(a.currentBalance, "currency")}
                                    </TableCell>
                                  </TableRow>
                                )
                              )}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Retained Earnings Account */}
              {plData.retainedEarningsAccount && (
                <Card className="mt-4 border-emerald-200 dark:border-emerald-800">
                  <CardContent className="p-4 flex items-center gap-3">
                    <Wallet className="w-5 h-5 text-emerald-600" />
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Retained Earnings Account
                      </p>
                      <p className="font-bold text-slate-900 dark:text-white">
                        {plData.retainedEarningsAccount.code} —{" "}
                        {plData.retainedEarningsAccount.name}
                        <span className="ml-2 text-sm font-normal text-muted-foreground">
                          Balance:{" "}
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                plData.retainedEarningsAccount.currentBalance,
                                "currency"
                              )}
                        </span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Fiscal Year Context */}
              {plData.fiscalYearContext && plData.fiscalYearContext.length > 0 && (
                <Card className="mt-4 border-amber-200 dark:border-amber-800">
                  <CardHeader className="bg-amber-50 dark:bg-amber-900/20 rounded-t-lg py-3 px-4">
                    <CardTitle className="text-amber-700 dark:text-amber-400 text-sm flex items-center gap-1">
                      <Calendar className="w-4 h-4" /> Fiscal Year Context
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {plData.fiscalYearContext.map((fy: any) => (
                        <Badge
                          key={fy.id}
                          className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                        >
                          {fy.name} — Net Profit Closed:{" "}
                          {isVatAuditor ? AUDIT_MASK : fmt(fy.netProfitClosed, "currency")}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Monthly Trend Chart */}
              {(plData.monthlyData || []).length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm">
                      Monthly Trend (12 Months)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={plData.monthlyData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 10 }} />
                        <RechartsTooltip />
                        <Legend />
                        <Bar dataKey="revenue" fill="#10b981" name="Revenue" />
                        <Bar dataKey="expenses" fill="#ef4444" name="Expenses" />
                        <Bar dataKey="profit" fill="#3b82f6" name="Profit" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              No data available. Click &quot;Compile Dynamic Income
              Statement&quot; to generate.
            </div>
          )}
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 3: BALANCE SHEET */}
        {/* ============================================ */}
        <TabsContent value="bs">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Label className="text-sm">As Of</Label>
            <Input
              type="date"
              value={bsAsOf}
              onChange={(e) => setBsAsOf(e.target.value)}
              className="w-40"
            />
            <Button
              size="sm"
              className="bg-[#2563eb] hover:bg-[#1d4ed8]"
              onClick={loadBS}
              disabled={bsLoading}
            >
              {bsLoading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Consolidating Dynamic Account Ledgers &amp; Re-calculating
                  Retained Earnings...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Compile Dynamic Balance Sheet
                </>
              )}
            </Button>
            <div className="flex gap-1 ml-auto">
              <Button variant="outline" size="sm" onClick={exportBsCSV} disabled={!bsData}>
                <Download className="w-4 h-4 mr-1" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportBsPDF} disabled={!bsData}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
            </div>
          </div>

          {bsLoading && !bsData ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : bsData ? (
            <>
              {/* Balanced/Unbalanced Badge */}
              <div className="flex items-center gap-3 mt-4">
                <Badge
                  className={`${
                    bsData.balanced
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  } text-sm px-3 py-1`}
                >
                  {bsData.balanced ? (
                    <CheckCircle className="w-4 h-4 mr-1 inline" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 mr-1 inline" />
                  )}
                  {bsData.balanced ? "Balance Sheet Balanced" : "Balance Sheet Unbalanced"}
                </Badge>
              </div>

              {/* Balance Sheet Side-by-Side */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">
                    Balance Sheet — As of {fmtDate(bsData.asOf)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* ASSETS Side */}
                    <div>
                      <h4 className="font-bold text-blue-700 dark:text-blue-400 mb-3 border-b pb-1 flex items-center gap-1">
                        <TrendingUp className="w-4 h-4" /> ASSETS
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-muted/50">
                          <span className="text-sm text-slate-900 dark:text-white">
                            Stock Value
                          </span>
                          <span className="font-mono text-sm">
                            {isVatAuditor ? AUDIT_MASK : fmt(bsData.assets?.stock, "currency")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-muted/50">
                          <span className="text-sm text-slate-900 dark:text-white">
                            Bank Balance
                          </span>
                          <span className="font-mono text-sm">
                            {isVatAuditor ? AUDIT_MASK : fmt(bsData.assets?.bankBalance, "currency")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-muted/50">
                          <span className="text-sm text-slate-900 dark:text-white">
                            Receivables
                          </span>
                          <span className="font-mono text-sm">
                            {isVatAuditor ? AUDIT_MASK : fmt(bsData.assets?.receivables, "currency")}
                          </span>
                        </div>
                        {(bsData.assets?.supplierAdvances || 0) > 0 && (
                          <div className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-muted/50">
                            <span className="text-sm text-slate-900 dark:text-white">
                              Supplier Advances
                            </span>
                            <span className="font-mono text-sm">
                              {isVatAuditor ? AUDIT_MASK : fmt(bsData.assets?.supplierAdvances, "currency")}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center px-2 py-2 rounded bg-blue-50 dark:bg-blue-900/20 font-bold border-t-2 border-blue-300">
                          <span className="text-blue-700 dark:text-blue-400">
                            Total Assets
                          </span>
                          <span className="font-mono text-blue-700 dark:text-blue-400">
                            {isVatAuditor ? AUDIT_MASK : fmt(bsData.assets?.totalAssets, "currency")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* LIABILITIES + EQUITY Side */}
                    <div>
                      <h4 className="font-bold text-red-700 dark:text-red-400 mb-3 border-b pb-1 flex items-center gap-1">
                        <TrendingDown className="w-4 h-4" /> LIABILITIES + EQUITY
                      </h4>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-muted/50">
                          <span className="text-sm text-slate-900 dark:text-white">
                            Payables
                          </span>
                          <span className="font-mono text-sm">
                            {isVatAuditor ? AUDIT_MASK : fmt(bsData.liabilities?.payables, "currency")}
                          </span>
                        </div>
                        {(bsData.liabilities?.customerAdvances || 0) > 0 && (
                          <div className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-muted/50">
                            <span className="text-sm text-slate-900 dark:text-white">
                              Customer Advances
                            </span>
                            <span className="font-mono text-sm">
                              {isVatAuditor ? AUDIT_MASK : fmt(bsData.liabilities?.customerAdvances, "currency")}
                            </span>
                          </div>
                        )}
                        <div className="flex justify-between items-center px-2 py-1.5 rounded hover:bg-muted/50">
                          <span className="text-sm text-slate-900 dark:text-white">
                            Equity / Retained Earnings
                          </span>
                          <span className="font-mono text-sm">
                            {isVatAuditor ? AUDIT_MASK : fmt(bsData.liabilities?.equity, "currency")}
                          </span>
                        </div>
                        <div className="flex justify-between items-center px-2 py-2 rounded bg-red-50 dark:bg-red-900/20 font-bold border-t-2 border-red-300">
                          <span className="text-red-700 dark:text-red-400">
                            Total Liabilities + Equity
                          </span>
                          <span className="font-mono text-red-700 dark:text-red-400">
                            {isVatAuditor
                              ? AUDIT_MASK
                              : fmt(bsData.liabilities?.totalLiabilities, "currency")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ACCOUNTING EQUATION ENFORCEMENT */}
              {bsData.accountingEquation && (
                <Card className="mt-4 border-emerald-300 dark:border-emerald-800">
                  <CardHeader className="bg-emerald-50 dark:bg-emerald-900/20 rounded-t-lg py-3 px-4">
                    <CardTitle className="text-emerald-700 dark:text-emerald-400 text-sm flex items-center gap-1">
                      <Scale className="w-4 h-4" /> Accounting Equation
                      Enforcement
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                        <p className="text-xs text-muted-foreground">
                          Total Assets
                        </p>
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                bsData.accountingEquation.totalAssets,
                                "currency"
                              )}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                        <p className="text-xs text-muted-foreground">
                          Total Liabilities
                        </p>
                        <p className="text-lg font-bold text-red-700 dark:text-red-400">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                bsData.accountingEquation.totalLiabilities,
                                "currency"
                              )}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                        <p className="text-xs text-muted-foreground">
                          Total Equity (excl. Retained Earnings)
                        </p>
                        <p className="text-lg font-bold text-purple-700 dark:text-purple-400">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                bsData.accountingEquation.totalEquity,
                                "currency"
                              )}
                        </p>
                      </div>
                    </div>

                    {/* Formula Display */}
                    <div className="text-center py-2 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 font-mono text-sm">
                      Assets = Liabilities + Equity (with Retained Earnings)
                    </div>

                    {/* Runtime Net Profit as Retained Earnings */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                        <p className="text-xs text-muted-foreground">
                          Retained Earnings (Current Period)
                        </p>
                        <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                bsData.accountingEquation
                                  .retainedEarningsCurrentPeriod,
                                "currency"
                              )}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                        <p className="text-xs text-muted-foreground">
                          Equity With Retained Earnings
                        </p>
                        <p className="text-lg font-bold text-emerald-700 dark:text-emerald-400">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                bsData.accountingEquation
                                  .equityWithRetainedEarnings,
                                "currency"
                              )}
                        </p>
                      </div>
                    </div>

                    {/* Balanced / Unbalanced Badge */}
                    <div className="flex justify-center">
                      {bsData.accountingEquation.isBalanced ? (
                        <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-base px-4 py-2">
                          <CheckCircle className="w-5 h-5 mr-2" /> Accounting
                          Equation Balanced ✓
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-base px-4 py-2">
                          <AlertTriangle className="w-5 h-5 mr-2" /> IMBALANCE:{" "}
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                Math.abs(
                                  bsData.accountingEquation.imbalance
                                ),
                                "currency"
                              )}
                        </Badge>
                      )}
                    </div>

                    {/* Equity Adjustment */}
                    {bsData.equityAdjustment && (
                      <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800">
                        <p className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-1">
                          <AlertOctagon className="w-4 h-4" />{" "}
                          {bsData.equityAdjustment.message}
                        </p>
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                          Adjustment:{" "}
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                Math.abs(bsData.equityAdjustment.amount),
                                "currency"
                              )}{" "}
                          — {bsData.equityAdjustment.direction}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* COA-Based Balance Sheet Cross-Check */}
              {bsData.coaBasedBalanceSheet && (
                <Card className="mt-4 border-blue-200 dark:border-blue-800">
                  <CardHeader className="bg-blue-50 dark:bg-blue-900/20 rounded-t-lg py-3 px-4">
                    <CardTitle className="text-blue-700 dark:text-blue-400 text-sm flex items-center gap-1">
                      <BarChart3 className="w-4 h-4" /> COA-Based Balance Sheet
                      Cross-Check
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                        <p className="text-xs text-muted-foreground">
                          COA Assets
                        </p>
                        <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                bsData.coaBasedBalanceSheet.totalAssets,
                                "currency"
                              )}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                        <p className="text-xs text-muted-foreground">
                          COA Liabilities
                        </p>
                        <p className="text-lg font-bold text-red-700 dark:text-red-400">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                bsData.coaBasedBalanceSheet.totalLiabilities,
                                "currency"
                              )}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                        <p className="text-xs text-muted-foreground">
                          COA Equity
                        </p>
                        <p className="text-lg font-bold text-purple-700 dark:text-purple-400">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                bsData.coaBasedBalanceSheet.totalEquity,
                                "currency"
                              )}
                        </p>
                      </div>
                      <div className="text-center p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                        <p className="text-xs text-muted-foreground">
                          Runtime Net Profit
                        </p>
                        <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(
                                bsData.coaBasedBalanceSheet.runtimeNetProfit,
                                "currency"
                              )}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* COA Detailed Breakdown */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {/* Asset Breakdown */}
                {bsData.coaAssetBreakdown &&
                  bsData.coaAssetBreakdown.length > 0 && (
                    <Card>
                      <CardHeader
                        className="bg-blue-50 dark:bg-blue-900/20 rounded-t-lg py-2 px-4 cursor-pointer"
                        onClick={() => setExpandAssets(!expandAssets)}
                      >
                        <CardTitle className="text-blue-700 dark:text-blue-400 text-sm flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <TrendingUp className="w-4 h-4" /> Asset Accounts ({
                              bsData.coaAssetBreakdown.length
                            })
                          </span>
                          <span className="text-xs">
                            {expandAssets ? "▼" : "▶"}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      {expandAssets && (
                        <CardContent className="p-3">
                          <div className="table-container overflow-auto max-h-48 rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="text-xs">Code</TableHead>
                                  <TableHead className="text-xs">Name</TableHead>
                                  <TableHead className="text-xs text-right">
                                    Balance
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {bsData.coaAssetBreakdown.map(
                                  (a: any, i: number) => (
                                    <TableRow key={i} className="hover:bg-muted/50">
                                      <TableCell className="font-mono text-xs">
                                        {a.code}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {a.name}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-xs">
                                        {isVatAuditor
                                          ? AUDIT_MASK
                                          : fmt(a.currentBalance, "currency")}
                                      </TableCell>
                                    </TableRow>
                                  )
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  )}

                {/* Liability Breakdown */}
                {bsData.coaLiabilityBreakdown &&
                  bsData.coaLiabilityBreakdown.length > 0 && (
                    <Card>
                      <CardHeader
                        className="bg-red-50 dark:bg-red-900/20 rounded-t-lg py-2 px-4 cursor-pointer"
                        onClick={() => setExpandLiabilities(!expandLiabilities)}
                      >
                        <CardTitle className="text-red-700 dark:text-red-400 text-sm flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <TrendingDown className="w-4 h-4" /> Liability
                            Accounts ({bsData.coaLiabilityBreakdown.length})
                          </span>
                          <span className="text-xs">
                            {expandLiabilities ? "▼" : "▶"}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      {expandLiabilities && (
                        <CardContent className="p-3">
                          <div className="table-container overflow-auto max-h-48 rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="text-xs">Code</TableHead>
                                  <TableHead className="text-xs">Name</TableHead>
                                  <TableHead className="text-xs text-right">
                                    Balance
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {bsData.coaLiabilityBreakdown.map(
                                  (a: any, i: number) => (
                                    <TableRow key={i} className="hover:bg-muted/50">
                                      <TableCell className="font-mono text-xs">
                                        {a.code}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {a.name}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-xs">
                                        {isVatAuditor
                                          ? AUDIT_MASK
                                          : fmt(a.currentBalance, "currency")}
                                      </TableCell>
                                    </TableRow>
                                  )
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  )}

                {/* Equity Breakdown */}
                {bsData.coaEquityBreakdown &&
                  bsData.coaEquityBreakdown.length > 0 && (
                    <Card>
                      <CardHeader
                        className="bg-purple-50 dark:bg-purple-900/20 rounded-t-lg py-2 px-4 cursor-pointer"
                        onClick={() => setExpandEquity(!expandEquity)}
                      >
                        <CardTitle className="text-purple-700 dark:text-purple-400 text-sm flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Wallet className="w-4 h-4" /> Equity Accounts ({
                              bsData.coaEquityBreakdown.length
                            })
                          </span>
                          <span className="text-xs">
                            {expandEquity ? "▼" : "▶"}
                          </span>
                        </CardTitle>
                      </CardHeader>
                      {expandEquity && (
                        <CardContent className="p-3">
                          <div className="table-container overflow-auto max-h-48 rounded-md border">
                            <Table>
                              <TableHeader>
                                <TableRow className="bg-muted/50">
                                  <TableHead className="text-xs">Code</TableHead>
                                  <TableHead className="text-xs">Name</TableHead>
                                  <TableHead className="text-xs text-right">
                                    Balance
                                  </TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {bsData.coaEquityBreakdown.map(
                                  (a: any, i: number) => (
                                    <TableRow key={i} className="hover:bg-muted/50">
                                      <TableCell className="font-mono text-xs">
                                        {a.code}
                                      </TableCell>
                                      <TableCell className="text-xs">
                                        {a.name}
                                      </TableCell>
                                      <TableCell className="text-right font-mono text-xs">
                                        {isVatAuditor
                                          ? AUDIT_MASK
                                          : fmt(a.currentBalance, "currency")}
                                      </TableCell>
                                    </TableRow>
                                  )
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  )}
              </div>

              {/* Financial Ratios */}
              {bsData.ratios && (
                <Card className="mt-4 border-purple-200 dark:border-purple-800">
                  <CardHeader className="bg-purple-50 dark:bg-purple-900/20 rounded-t-lg py-3 px-4">
                    <CardTitle className="text-purple-700 dark:text-purple-400 text-sm flex items-center gap-1">
                      <DollarSign className="w-4 h-4" /> Financial Ratios
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
                        <p className="text-xs text-muted-foreground mb-1">
                          Current Ratio
                        </p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(bsData.ratios.currentRatio, "number")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Current Assets / Current Liabilities
                        </p>
                      </div>
                      <div className="text-center p-4 rounded-lg bg-slate-50 dark:bg-slate-900">
                        <p className="text-xs text-muted-foreground mb-1">
                          Debt-to-Equity Ratio
                        </p>
                        <p className="text-2xl font-bold text-slate-900 dark:text-white">
                          {isVatAuditor
                            ? AUDIT_MASK
                            : fmt(bsData.ratios.debtToEquity, "number")}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Total Liabilities / Total Equity
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Fiscal Year Context */}
              {bsData.fiscalYearContext &&
                bsData.fiscalYearContext.length > 0 && (
                  <Card className="mt-4 border-amber-200 dark:border-amber-800">
                    <CardHeader className="bg-amber-50 dark:bg-amber-900/20 rounded-t-lg py-3 px-4">
                      <CardTitle className="text-amber-700 dark:text-amber-400 text-sm flex items-center gap-1">
                        <Calendar className="w-4 h-4" /> Fiscal Year Context
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {bsData.fiscalYearContext.map((fy: any) => (
                          <Badge
                            key={fy.id}
                            className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                          >
                            {fy.name} — Net Profit Closed:{" "}
                            {isVatAuditor
                              ? AUDIT_MASK
                              : fmt(fy.netProfitClosed, "currency")}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

              {/* Charts Row */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {/* Asset Composition Pie */}
                {(bsData.assetComposition || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">
                        Asset Composition
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={bsData.assetComposition}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, percent }: any) =>
                              `${name} (${(percent * 100).toFixed(0)}%)`
                            }
                          >
                            {bsData.assetComposition.map((entry: any, i: number) => (
                              <Cell
                                key={i}
                                fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Liability Composition Pie */}
                {(bsData.liabilityComposition || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">
                        Liability Composition
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie
                            data={bsData.liabilityComposition}
                            cx="50%"
                            cy="50%"
                            outerRadius={80}
                            dataKey="value"
                            label={({ name, percent }: any) =>
                              `${name} (${(percent * 100).toFixed(0)}%)`
                            }
                          >
                            {bsData.liabilityComposition.map(
                              (entry: any, i: number) => (
                                <Cell
                                  key={i}
                                  fill={
                                    entry.color || PIE_COLORS[i % PIE_COLORS.length]
                                  }
                                />
                              )
                            )}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Assets vs Liabilities Bar */}
                {(bsData.comparisonData || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">
                        Assets vs Liabilities
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={bsData.comparisonData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#3b82f6" name="Amount" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              No data available. Click &quot;Compile Dynamic Balance Sheet&quot;
              to generate.
            </div>
          )}
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 4: FISCAL YEAR MANAGEMENT */}
        {/* ============================================ */}
        <TabsContent value="fy">
          <div className="flex items-center justify-between mt-4">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Fiscal Year Management
            </h3>
            {isAdmin && (
              <Button
                size="sm"
                className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                onClick={() => setFyDialogOpen(true)}
              >
                <Plus className="w-4 h-4 mr-1" /> Create Fiscal Year
              </Button>
            )}
          </div>

          {fyLoading ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Card className="mt-4">
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                <CardTitle className="text-white text-sm">
                  All Fiscal Years
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="table-container overflow-auto max-h-[50vh] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Start Date</TableHead>
                        <TableHead>End Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">
                          Net Profit Closed
                        </TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fyList.length === 0 ? (
                        <TableRow>
                          <TableCell
                            colSpan={7}
                            className="h-16 text-center text-muted-foreground"
                          >
                            No fiscal years found
                          </TableCell>
                        </TableRow>
                      ) : (
                        fyList.map((fy: any) => (
                          <TableRow key={fy.id} className="hover:bg-muted/50">
                            <TableCell className="font-mono text-xs">
                              {fy.code}
                            </TableCell>
                            <TableCell className="font-medium text-slate-900 dark:text-white">
                              {fy.name}
                            </TableCell>
                            <TableCell>{fmtDate(fy.startDate)}</TableCell>
                            <TableCell>{fmtDate(fy.endDate)}</TableCell>
                            <TableCell>
                              <Badge
                                className={
                                  fy.status === "OPEN"
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                }
                              >
                                {fy.status === "OPEN" ? (
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                ) : (
                                  <Lock className="w-3 h-3 mr-1" />
                                )}
                                {fy.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {isVatAuditor
                                ? AUDIT_MASK
                                : fmt(fy.netProfitClosed, "currency")}
                            </TableCell>
                            <TableCell>
                              {isAdmin && fy.status === "OPEN" && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() => handleDeleteFY(fy.id)}
                                >
                                  Delete
                                </Button>
                              )}
                              {fy.status === "CLOSED" && (
                                <span className="text-xs text-muted-foreground italic">
                                  Locked
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Create Fiscal Year Dialog */}
          <Dialog open={fyDialogOpen} onOpenChange={setFyDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Fiscal Year</DialogTitle>
                <DialogDescription>
                  Define the date range for a new fiscal year. Date ranges cannot
                  overlap with existing fiscal years.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="fy-name">
                    Name <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="fy-name"
                    value={fyForm.name}
                    onChange={(e) =>
                      setFyForm({ ...fyForm, name: e.target.value })
                    }
                    placeholder="e.g. FY 2025-2026"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="fy-start">
                      Start Date <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="fy-start"
                      type="date"
                      value={fyForm.startDate}
                      onChange={(e) =>
                        setFyForm({ ...fyForm, startDate: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fy-end">
                      End Date <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="fy-end"
                      type="date"
                      value={fyForm.endDate}
                      onChange={(e) =>
                        setFyForm({ ...fyForm, endDate: e.target.value })
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fy-notes">Notes</Label>
                  <Input
                    id="fy-notes"
                    value={fyForm.notes}
                    onChange={(e) =>
                      setFyForm({ ...fyForm, notes: e.target.value })
                    }
                    placeholder="Optional notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setFyDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                  onClick={handleCreateFY}
                >
                  Create Fiscal Year
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 5: YEAR-END CLOSE */}
        {/* ============================================ */}
        <TabsContent value="yec">
          <div className="mt-4">
            <Card className="border-red-300 dark:border-red-800">
              <CardHeader className="bg-red-50 dark:bg-red-900/20 rounded-t-lg py-3 px-4">
                <CardTitle className="text-red-700 dark:text-red-400 text-sm flex items-center gap-1">
                  <AlertOctagon className="w-4 h-4" /> Year-End Close — Critical
                  Operation
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                {/* Warning Banner */}
                <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800">
                  <p className="text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" /> WARNING: This
                    operation is irreversible
                  </p>
                  <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                    Year-end closing zeroes all nominal accounts (Revenue/Income
                    and Expenses) and transfers the net profit/loss to Retained
                    Earnings. A closed fiscal year cannot be reopened.
                  </p>
                </div>

                {/* Admin-only notice */}
                {!isAdmin && (
                  <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800">
                    <p className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-1">
                      <Lock className="w-4 h-4" /> Administrator Only
                    </p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                      Only administrators can execute the year-end closing
                      sequence. Contact your administrator.
                    </p>
                  </div>
                )}

                {/* Select Fiscal Year */}
                <div className="space-y-2">
                  <Label className="text-sm font-bold">
                    Select Fiscal Year to Close
                  </Label>
                  <Select
                    value={yecSelectedFy}
                    onValueChange={setYecSelectedFy}
                  >
                    <SelectTrigger className="w-full max-w-md">
                      <SelectValue placeholder="Choose an OPEN fiscal year..." />
                    </SelectTrigger>
                    <SelectContent>
                      {fyList
                        .filter((fy: any) => fy.status === "OPEN")
                        .map((fy: any) => (
                          <SelectItem key={fy.id} value={fy.id}>
                            {fy.name} ({fmtDate(fy.startDate)} —{" "}
                            {fmtDate(fy.endDate)})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Pre-Close Summary */}
                {yecPreClose && yecSelectedFy && (
                  <Card className="border-slate-300 dark:border-slate-700">
                    <CardHeader className="bg-slate-50 dark:bg-slate-900/50 rounded-t-lg py-3 px-4">
                      <CardTitle className="text-slate-700 dark:text-slate-300 text-sm flex items-center gap-1">
                        <FileText className="w-4 h-4" /> Pre-Close Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                          <p className="text-xs text-muted-foreground">
                            Total Revenue from COA
                          </p>
                          <p className="text-lg font-bold text-green-700 dark:text-green-400">
                            {isVatAuditor
                              ? AUDIT_MASK
                              : fmt(yecPreClose.totalRevenue, "currency")}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20">
                          <p className="text-xs text-muted-foreground">
                            Total Expenses from COA
                          </p>
                          <p className="text-lg font-bold text-red-700 dark:text-red-400">
                            {isVatAuditor
                              ? AUDIT_MASK
                              : fmt(yecPreClose.totalExpenses, "currency")}
                          </p>
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20">
                          <p className="text-xs text-muted-foreground">
                            Net Profit/Loss to be Transferred
                          </p>
                          <p className="text-lg font-bold text-purple-700 dark:text-purple-400">
                            {isVatAuditor
                              ? AUDIT_MASK
                              : fmt(yecPreClose.netProfit, "currency")}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                          <p className="text-xs text-muted-foreground">
                            Nominal Accounts to be Zeroed
                          </p>
                          <p className="text-lg font-bold text-amber-700 dark:text-amber-400">
                            {yecPreClose.nominalCount} accounts
                          </p>
                        </div>
                      </div>

                      {/* Execute Button */}
                      <div className="pt-4">
                        <Button
                          className="bg-red-600 hover:bg-red-700 text-white"
                          disabled={!isAdmin || yecLoading}
                          onClick={() => setYecConfirmOpen(true)}
                        >
                          {yecLoading ? (
                            <>
                              <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                              Consolidating Dynamic Account Ledgers &
                              Re-calculating Retained Earnings...
                            </>
                          ) : (
                            <>
                              <Lock className="w-4 h-4 mr-1" /> Run Year-End
                              Closing Sequence
                            </>
                          )}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Post-Close Result */}
                {yecResult && (
                  <Card className="border-green-300 dark:border-green-800">
                    <CardHeader className="bg-green-50 dark:bg-green-900/20 rounded-t-lg py-3 px-4">
                      <CardTitle className="text-green-700 dark:text-green-400 text-sm flex items-center gap-1">
                        <CheckCircle className="w-4 h-4" /> Year-End Close
                        Completed Successfully
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                          <p className="text-xs text-muted-foreground">
                            Closing Voucher No
                          </p>
                          <p className="text-lg font-bold text-slate-900 dark:text-white font-mono">
                            {yecResult.closingVoucher?.voucherNo || "—"}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                          <p className="text-xs text-muted-foreground">
                            Net Profit Transferred
                          </p>
                          <p className="text-lg font-bold text-green-700 dark:text-green-400">
                            {isVatAuditor
                              ? AUDIT_MASK
                              : fmt(
                                  yecResult.fiscalYear?.netProfitClosed,
                                  "currency"
                                )}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                          <p className="text-xs text-muted-foreground">
                            Retained Earnings Account
                          </p>
                          <p className="text-lg font-bold text-slate-900 dark:text-white">
                            {yecResult.fiscalYear?.retainedEarningsAccount?.code ||
                              "—"}{" "}
                            —{" "}
                            {yecResult.fiscalYear?.retainedEarningsAccount?.name ||
                              "—"}
                          </p>
                        </div>
                        <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-900">
                          <p className="text-xs text-muted-foreground">
                            Closed At
                          </p>
                          <p className="text-lg font-bold text-slate-900 dark:text-white">
                            {yecResult.fiscalYear?.closedAt
                              ? fmtDate(yecResult.fiscalYear.closedAt)
                              : "—"}
                          </p>
                        </div>
                      </div>

                      {/* Closing Voucher Lines */}
                      {yecResult.closingVoucher?.lines &&
                        yecResult.closingVoucher.lines.length > 0 && (
                          <div className="mt-4">
                            <p className="text-sm font-semibold mb-2 text-slate-900 dark:text-white">
                              Closing Voucher Lines
                            </p>
                            <div className="table-container overflow-auto max-h-60 rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    <TableHead>Account</TableHead>
                                    <TableHead className="text-right">
                                      Debit
                                    </TableHead>
                                    <TableHead className="text-right">
                                      Credit
                                    </TableHead>
                                    <TableHead>Particulars</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {yecResult.closingVoucher.lines.map(
                                    (line: any, i: number) => (
                                      <TableRow
                                        key={i}
                                        className="hover:bg-muted/50"
                                      >
                                        <TableCell className="font-medium text-slate-900 dark:text-white">
                                          {line.accountName}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                          {isVatAuditor
                                            ? AUDIT_MASK
                                            : fmt(line.debit, "currency")}
                                        </TableCell>
                                        <TableCell className="text-right font-mono">
                                          {isVatAuditor
                                            ? AUDIT_MASK
                                            : fmt(line.credit, "currency")}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">
                                          {line.particulars || "—"}
                                        </TableCell>
                                      </TableRow>
                                    )
                                  )}
                                </TableBody>
                              </Table>
                            </div>
                          </div>
                        )}
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Confirmation Dialog */}
          <Dialog open={yecConfirmOpen} onOpenChange={setYecConfirmOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-red-700 dark:text-red-400 flex items-center gap-2">
                  <AlertOctagon className="w-5 h-5" /> Confirm Year-End Close
                </DialogTitle>
                <DialogDescription>
                  This action is irreversible. All nominal accounts will be
                  zeroed and net profit/loss transferred to Retained Earnings.
                  Are you absolutely sure?
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-400">
                    <strong>Fiscal Year:</strong>{" "}
                    {fyList.find((fy: any) => fy.id === yecSelectedFy)?.name ||
                      "Unknown"}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                    <strong>Net Profit to Transfer:</strong>{" "}
                    {isVatAuditor
                      ? AUDIT_MASK
                      : fmt(yecPreClose?.netProfit, "currency")}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                    <strong>Accounts to Zero:</strong>{" "}
                    {yecPreClose?.nominalCount || 0}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setYecConfirmOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-red-600 hover:bg-red-700 text-white"
                  onClick={executeYearEndClose}
                  disabled={yecLoading}
                >
                  {yecLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                      Executing...
                    </>
                  ) : (
                    <>
                      <AlertOctagon className="w-4 h-4 mr-1" /> Confirm &
                      Execute Close
                    </>
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
