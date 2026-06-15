"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  Lock, RefreshCw, Download, FileDown, Upload,
  DollarSign, TrendingUp, BarChart3,
  CheckCircle, AlertTriangle, Wallet, Landmark, Scale,
  ArrowUpCircle, ArrowDownCircle, BookOpen, Building2,
  PieChart as PieChartIcon, FileSpreadsheet, ChevronRight, ChevronDown, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF,
  exportToCSV,
  importFromCSV,
  ColumnDef,
  CompanyProfile,
} from "@/lib/export-utils";
import { copyTableToClipboard } from "@/lib/clipboard-utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from "recharts";
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const AUDIT_MASK = "N/A (Audit Mode)";

const RESTRICTED_MASK = "N/A (Restricted)";

import { fmtBDT as _fmtBDT } from "@/lib/number-format";

const fmt = (v: any, type?: string) => {
  if (String(v) === AUDIT_MASK || String(v) === RESTRICTED_MASK) return String(v);
  if (v === null || v === undefined) return "—";
  if (type === "currency") return _fmtBDT(Number(v));
  if (type === "date") {
    if (!v) return "—";
    const dt = new Date(v);
    return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  }
  if (type === "percent") return `${Number(v).toFixed(2)}%`;
  return String(v);
};

const fmtDate = (d: string | Date) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};


// ============================================================
// Auth Hook

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// ============================================================
// Tab Key Type
// ============================================================

type TabKey = "coa" | "cash" | "trial" | "pl" | "bs";

function mapInitialTab(t?: string): TabKey {
  if (t === "chart-of-accounts") return "coa";
  if (t === "trial-balance") return "trial";
  if (t === "profit-loss") return "pl";
  if (t === "balance-sheet") return "bs";
  if (t === "cash-in-hand") return "cash";
  return "coa";
}

// ============================================================
// AccountingReportsPage Component
// ============================================================

export default function AccountingReportsPage({ initialTab }: { initialTab?: string }) {
  const { toast } = useToast();
  const { isVatAuditor, isSR, isDealer, user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>(() => mapInitialTab(initialTab));

  // Company branding for PDF export
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  // Chart of Accounts
  const [coaData, setCoaData] = useState<any[]>([]);
  const [coaLoading, setCoaLoading] = useState(true);
  const [coaSearch, setCoaSearch] = useState("");
  const [coaExpanded, setCoaExpanded] = useState<Set<string>>(new Set());

  // Cash In Hand
  const [cashData, setCashData] = useState<any>(null);
  const [cashLoading, setCashLoading] = useState(true);
  const [cashFrom, setCashFrom] = useState("");
  const [cashTo, setCashTo] = useState("");

  // Trial Balance
  const [tbData, setTbData] = useState<any>(null);
  const [tbLoading, setTbLoading] = useState(true);
  const [tbFrom, setTbFrom] = useState("");
  const [tbTo, setTbTo] = useState("");

  // P&L
  const [plData, setPlData] = useState<any>(null);
  const [plLoading, setPlLoading] = useState(true);
  const [plFrom, setPlFrom] = useState("");
  const [plTo, setPlTo] = useState("");

  // Balance Sheet
  const [bsData, setBsData] = useState<any>(null);
  const [bsLoading, setBsLoading] = useState(true);
  const [bsAsOf, setBsAsOf] = useState("");

  // Load company branding
  useEffect(() => {
    apiFetch("/api/company-branding")
      .then((res: any) => {
        if (res.company) {
          setCompanyProfile(res.company as CompanyProfile);
        }
      })
      .catch(() => { /* ignore */ });
  }, []);

  // Load Chart of Accounts
  const loadCoA = useCallback(async () => {
    setCoaLoading(true);
    try {
      const res = await apiFetch("/api/chart-of-accounts");
      setCoaData(Array.isArray(res) ? res : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCoaLoading(false);
    }
  }, [toast]);

  // Load Cash In Hand
  const loadCash = useCallback(async () => {
    setCashLoading(true);
    try {
      const params = new URLSearchParams();
      if (cashFrom) params.set("from", cashFrom);
      if (cashTo) params.set("to", cashTo);
      if (isVatAuditor) params.set("vatMode", "true");
      const qs = params.toString();
      const res = await apiFetch(`/api/reports/cash-in-hand${qs ? "?" + qs : ""}`);
      setCashData(res);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCashLoading(false);
    }
  }, [toast, cashFrom, cashTo, isVatAuditor]);

  // Load Trial Balance
  const loadTB = useCallback(async () => {
    setTbLoading(true);
    try {
      const params = new URLSearchParams();
      if (tbFrom) params.set("from", tbFrom);
      if (tbTo) params.set("to", tbTo);
      if (isVatAuditor) params.set("vatMode", "true");
      const qs = params.toString();
      const res = await apiFetch(`/api/reports/trial-balance${qs ? "?" + qs : ""}`);
      setTbData(res);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTbLoading(false);
    }
  }, [toast, tbFrom, tbTo, isVatAuditor]);

  // Load P&L
  const loadPL = useCallback(async () => {
    setPlLoading(true);
    try {
      const params = new URLSearchParams();
      if (plFrom) params.set("from", plFrom);
      if (plTo) params.set("to", plTo);
      if (isVatAuditor) params.set("vatMode", "true");
      const qs = params.toString();
      const res = await apiFetch(`/api/reports/profit-loss${qs ? "?" + qs : ""}`);
      setPlData(res);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPlLoading(false);
    }
  }, [toast, plFrom, plTo, isVatAuditor]);

  // Load Balance Sheet
  const loadBS = useCallback(async () => {
    setBsLoading(true);
    try {
      const params = new URLSearchParams();
      if (bsAsOf) params.set("asOf", bsAsOf);
      if (isVatAuditor) params.set("vatMode", "true");
      const qs = params.toString();
      const res = await apiFetch(`/api/reports/balance-sheet${qs ? "?" + qs : ""}`);
      setBsData(res);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBsLoading(false);
    }
  }, [toast, bsAsOf, isVatAuditor]);

  // Auto-load data on tab switch
  useEffect(() => { loadCoA(); }, [loadCoA]);
  useEffect(() => { if (activeTab === "cash") loadCash(); }, [activeTab, loadCash]);
  useEffect(() => { if (activeTab === "trial") loadTB(); }, [activeTab, loadTB]);
  useEffect(() => { if (activeTab === "pl") loadPL(); }, [activeTab, loadPL]);
  useEffect(() => { if (activeTab === "bs") loadBS(); }, [activeTab, loadBS]);

  // CoA tree helpers
  const coaTree = (() => {
    const rootAccounts = coaData.filter((a: any) => !a.parentAccountId);
    const filtered = coaSearch.trim()
      ? coaData.filter((a: any) =>
          a.name?.toLowerCase().includes(coaSearch.toLowerCase()) ||
          a.code?.toLowerCase().includes(coaSearch.toLowerCase()) ||
          a.classification?.toLowerCase().includes(coaSearch.toLowerCase())
        )
      : rootAccounts;
    return filtered;
  })();

  const getChildren = (parentId: string) => coaData.filter((a: any) => a.parentAccountId === parentId);

  const toggleExpand = (id: string) => {
    setCoaExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Classification color helper
  const classColor = (c: string) => {
    switch (c) {
      case "Asset": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "Liability": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "Equity": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "Income": case "Revenue": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Expense": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  // ============================================================
  // EXECUTIVE PDF EXPORT (using full exportToPDF with ColumnDef)
  // ============================================================

  const printedBy = user?.displayName || user?.name || "System";

  const doExportPDF = (title: string, subtitle: string | undefined, columns: ColumnDef[], data: any[], vatMaskedColumns: string[] = [], orientation: "landscape" | "portrait" = "landscape") => {
    try {
      exportToPDF({
        title,
        subtitle,
        orientation,
        columns,
        data,
        isVatAuditor,
        vatMaskedColumns,
        company: companyProfile || undefined,
        systemNotice: "This report is auto-generated by VoltERP. Data is subject to verification. Confidential — for internal use only.",
        financialFooter: {
          preparedBy: printedBy,
          checkedBy: "",
          authorizedBy: "",
          approvedBy: "",
          printedBy,
        },
      });
      toast({ title: "PDF Exported", description: `${title} exported successfully` });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // ENHANCED CSV EXPORT (using full exportToCSV with ColumnDef)
  // ============================================================

  const doExportCSV = (title: string, columns: ColumnDef[], data: any[], vatMaskedColumns: string[] = []) => {
    try {
      exportToCSV({
        title,
        columns,
        data,
        isVatAuditor,
        vatMaskedColumns,
      });
      toast({ title: "CSV Exported", description: `${title} exported successfully` });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const doCopyToClipboard = async (title: string, subtitle: string | undefined, columns: ColumnDef[], data: any[], vatMaskedColumns: string[] = []) => {
    try {
      const result = await copyTableToClipboard({ title: subtitle ? `${title} — ${subtitle}` : title, columns, data, isVatAuditor, vatMaskedColumns });
      if (result.success) { toast({ title: "Copied", description: result.message }); } else { toast({ title: "Copy Failed", description: result.message, variant: "destructive" }); }
    } catch (e: any) { toast({ title: "Copy Error", description: e.message, variant: "destructive" }); }
  };

  // ============================================================
  // RBAC: SR/Dealer => 403 (AFTER all hooks)
  // ============================================================

  if (isSR || isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-red-300 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">403 — Access Denied</h3>
            <p className="text-muted-foreground">You do not have permission to access Accounting Reports. Contact your administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // Loading Spinner
  // ============================================================

  const Spinner = () => (
    <div className="flex justify-center py-16">
      <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Internal cost prices, net margins, and hidden adjustments masked. Only legal outward/inward invoice tax records shown.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Accounting Reports
        </h2>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as TabKey)}>
        <TabsList className="flex overflow-x-auto h-auto gap-1 sm:gap-2 pb-1 scrollbar-none">
          <TabsTrigger value="coa" className="flex items-center gap-1 text-xs sm:text-sm"><BookOpen className="w-4 h-4" />Chart of Accounts</TabsTrigger>
          <TabsTrigger value="cash" className="flex items-center gap-1 text-xs sm:text-sm"><Wallet className="w-4 h-4" />Cash In Hand</TabsTrigger>
          <TabsTrigger value="trial" className="flex items-center gap-1 text-xs sm:text-sm"><Scale className="w-4 h-4" />Trial Balance</TabsTrigger>
          <TabsTrigger value="pl" className="flex items-center gap-1 text-xs sm:text-sm"><TrendingUp className="w-4 h-4" />Profit & Loss</TabsTrigger>
          <TabsTrigger value="bs" className="flex items-center gap-1 text-xs sm:text-sm"><Building2 className="w-4 h-4" />Balance Sheet</TabsTrigger>
        </TabsList>

        {/* ============================================ */}
        {/* TAB 1: CHART OF ACCOUNTS */}
        {/* ============================================ */}
        <TabsContent value="coa">
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Input
                placeholder="Search accounts..."
                value={coaSearch}
                onChange={e => setCoaSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={loadCoA}>
              <RefreshCw className="w-4 h-4 mr-1" />Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              const columns: ColumnDef[] = [
                { key: "code", label: "Code", type: "text" },
                { key: "name", label: "Account Name", type: "text" },
                { key: "classification", label: "Classification", type: "text" },
                { key: "parentAccountName", label: "Parent", type: "text" },
                { key: "openingBalance", label: "Opening Balance", type: "currency" },
                { key: "openingBalanceType", label: "Dr/Cr", type: "text" },
                { key: "subBalanceTotalNet", label: "Current Balance", type: "currency" },
              ];
              const vatMaskedColumns = isVatAuditor ? ["openingBalance", "subBalanceTotalNet"] : [];
              doExportPDF("Chart of Accounts", `As of ${fmtDate(new Date())}`, columns, coaData, vatMaskedColumns, "landscape");
            }}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => {
              const columns: ColumnDef[] = [
                { key: "code", label: "Code", type: "text" },
                { key: "name", label: "Account Name", type: "text" },
                { key: "classification", label: "Classification", type: "text" },
                { key: "parentAccountName", label: "Parent", type: "text" },
                { key: "openingBalance", label: "Opening Balance", type: "currency" },
                { key: "openingBalanceType", label: "Dr/Cr", type: "text" },
                { key: "subBalanceTotalNet", label: "Current Balance", type: "currency" },
              ];
              const vatMaskedColumns = isVatAuditor ? ["openingBalance", "subBalanceTotalNet"] : [];
              doExportCSV("Chart of Accounts", columns, coaData.map((a: any) => ({
                ...a,
                subBalanceTotalNet: a.subBalance?.totalNet ?? 0,
              })), vatMaskedColumns);
            }}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              const columns: ColumnDef[] = [
                { key: "code", label: "Code", type: "text" },
                { key: "name", label: "Account Name", type: "text" },
                { key: "classification", label: "Classification", type: "text" },
                { key: "parentAccountName", label: "Parent", type: "text" },
                { key: "openingBalance", label: "Opening Balance", type: "currency" },
                { key: "openingBalanceType", label: "Dr/Cr", type: "text" },
                { key: "subBalanceTotalNet", label: "Current Balance", type: "currency" },
              ];
              const vatMaskedColumns = isVatAuditor ? ["openingBalance", "subBalanceTotalNet"] : [];
              await doCopyToClipboard("Chart of Accounts", `As of ${fmtDate(new Date())}`, columns, coaData, vatMaskedColumns);
            }}><Copy className="w-4 h-4 mr-1" />Copy</Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (isVatAuditor) { toast({ title: "Access Denied", description: "VAT Auditors cannot import data", variant: "destructive" }); return; }
              importFromCSV({
                apiPath: "/api/chart-of-accounts",
                formFields: [
                  { key: "name", label: "Account Name", type: "text", required: true },
                  { key: "classification", label: "Classification", type: "select", required: true, options: [{ value: "Asset", label: "Asset" }, { value: "Liability", label: "Liability" }, { value: "Income", label: "Income" }, { value: "Expense", label: "Expense" }, { value: "Equity", label: "Equity" }] },
                  { key: "openingBalance", label: "Opening Balance", type: "number" },
                  { key: "openingBalanceType", label: "Balance Type", type: "select", options: [{ value: "Dr", label: "Dr" }, { value: "Cr", label: "Cr" }] },
                ],
              }).then(result => {
                toast({ title: "Import Complete", description: `${result.imported} imported, ${result.failed} failed` });
                loadCoA();
              }).catch((e: any) => {
                toast({ title: "Import Error", description: e.message, variant: "destructive" });
              });
            }}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          </div>

          {/* Stat Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 mt-4">
            {[
              { label: "Total Accounts", value: coaData.length, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
              { label: "Assets", value: coaData.filter((a: any) => a.classification === "Asset").length, icon: Landmark, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
              { label: "Liabilities", value: coaData.filter((a: any) => a.classification === "Liability").length, icon: ArrowDownCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
              { label: "Income", value: coaData.filter((a: any) => a.classification === "Income" || a.classification === "Revenue").length, icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
              { label: "Expenses", value: coaData.filter((a: any) => a.classification === "Expense").length, icon: DollarSign, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/30" },
            ].map((stat, i) => (
              <Card key={i} className="stat-mini-card">
                <CardContent className="p-3 flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Classification Pie Chart */}
          {coaData.length > 0 && (
            <Card className="mt-4">
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                <CardTitle className="text-white text-sm">Account Classification Distribution</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <Pie
                      data={(() => {
                        const map = new Map<string, number>();
                        coaData.forEach((a: any) => {
                          const c = a.classification || "Unclassified";
                          map.set(c, (map.get(c) || 0) + 1);
                        });
                        return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
                      })()}
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      dataKey="value"
                      label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    >
                      {(() => {
                        const map = new Map<string, number>();
                        coaData.forEach((a: any) => {
                          const c = a.classification || "Unclassified";
                          map.set(c, (map.get(c) || 0) + 1);
                        });
                        return Array.from(map.entries()).map((_: any, i: number) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ));
                      })()}
                    </Pie>
                    <RechartsTooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* CoA Tree Table */}
          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
              <CardTitle className="text-white text-sm">Chart of Accounts Tree</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {coaLoading ? <Spinner /> : (
                <div className="table-container overflow-x-auto overflow-y-auto max-h-[50vh] rounded-md border -mx-2 sm:mx-0">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-8" />
                        <TableHead>Code</TableHead>
                        <TableHead>Account Name</TableHead>
                        <TableHead>Classification</TableHead>
                        <TableHead>Parent</TableHead>
                        <TableHead className="text-right">Opening Balance</TableHead>
                        <TableHead>Dr/Cr</TableHead>
                        <TableHead className="text-right">Current Balance</TableHead>
                        <TableHead className="text-right">Children</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {coaTree.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9} className="h-16 text-center text-muted-foreground">No accounts found</TableCell>
                        </TableRow>
                      ) : coaTree.map((account: any) => (
                        <CoARow
                          key={account.id}
                          account={account}
                          level={0}
                          expanded={coaExpanded}
                          onToggle={toggleExpand}
                          getChildren={getChildren}
                          isVatAuditor={isVatAuditor}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 2: CASH IN HAND */}
        {/* ============================================ */}
        <TabsContent value="cash">
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Label className="text-sm">From</Label>
            <Input type="date" value={cashFrom} onChange={e => setCashFrom(e.target.value)} className="w-40" />
            <Label className="text-sm">To</Label>
            <Input type="date" value={cashTo} onChange={e => setCashTo(e.target.value)} className="w-40" />
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={loadCash}>
              <RefreshCw className="w-4 h-4 mr-1" />Generate Report
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (!cashData) return;
              const columns: ColumnDef[] = [
                { key: "bankName", label: "Bank Name", type: "text" },
                { key: "accountNo", label: "Account No", type: "text" },
                { key: "openingBalance", label: "Opening Balance", type: "currency" },
                { key: "deposits", label: "Deposits", type: "currency" },
                { key: "withdrawals", label: "Withdrawals", type: "currency" },
                { key: "income", label: "Income", type: "currency" },
                { key: "expense", label: "Expense", type: "currency" },
                { key: "collections", label: "Collections", type: "currency" },
                { key: "deliveries", label: "Deliveries", type: "currency" },
                { key: "currentBalance", label: "Current Balance", type: "currency" },
              ];
              const vatMasked = isVatAuditor ? ["openingBalance", "deposits", "withdrawals", "income", "expense", "collections", "deliveries", "currentBalance"] : [];
              const period = cashFrom || cashTo ? `Period: ${cashFrom || "—"} to ${cashTo || "—"}` : undefined;
              doExportPDF("Cash In Hand Report", period, columns, cashData.bankBreakdown || [], vatMasked);
            }}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (!cashData) return;
              const columns: ColumnDef[] = [
                { key: "bankName", label: "Bank Name", type: "text" },
                { key: "accountNo", label: "Account No", type: "text" },
                { key: "openingBalance", label: "Opening Balance", type: "currency" },
                { key: "deposits", label: "Deposits", type: "currency" },
                { key: "withdrawals", label: "Withdrawals", type: "currency" },
                { key: "income", label: "Income", type: "currency" },
                { key: "expense", label: "Expense", type: "currency" },
                { key: "collections", label: "Collections", type: "currency" },
                { key: "deliveries", label: "Deliveries", type: "currency" },
                { key: "currentBalance", label: "Current Balance", type: "currency" },
              ];
              const vatMasked = isVatAuditor ? ["openingBalance", "deposits", "withdrawals", "income", "expense", "collections", "deliveries", "currentBalance"] : [];
              doExportCSV("Cash In Hand Report", columns, cashData.bankBreakdown || [], vatMasked);
            }}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              if (!cashData) return;
              const columns: ColumnDef[] = [
                { key: "bankName", label: "Bank Name", type: "text" },
                { key: "accountNo", label: "Account No", type: "text" },
                { key: "openingBalance", label: "Opening Balance", type: "currency" },
                { key: "deposits", label: "Deposits", type: "currency" },
                { key: "withdrawals", label: "Withdrawals", type: "currency" },
                { key: "income", label: "Income", type: "currency" },
                { key: "expense", label: "Expense", type: "currency" },
                { key: "collections", label: "Collections", type: "currency" },
                { key: "deliveries", label: "Deliveries", type: "currency" },
                { key: "currentBalance", label: "Current Balance", type: "currency" },
              ];
              const vatMasked = isVatAuditor ? ["openingBalance", "deposits", "withdrawals", "income", "expense", "collections", "deliveries", "currentBalance"] : [];
              const period = cashFrom || cashTo ? `Period: ${cashFrom || "\u2014"} to ${cashTo || "\u2014"}` : undefined;
              await doCopyToClipboard("Cash In Hand Report", period, columns, cashData.bankBreakdown || [], vatMasked);
            }}><Copy className="w-4 h-4 mr-1" />Copy</Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (isVatAuditor) { toast({ title: "Access Denied", description: "VAT Auditors cannot import data", variant: "destructive" }); return; }
              importFromCSV({
                apiPath: "/api/expenses",
                formFields: [
                  { key: "headId", label: "Head ID", type: "text", required: true },
                  { key: "amount", label: "Amount", type: "number", required: true },
                  { key: "date", label: "Date", type: "date", required: true },
                  { key: "description", label: "Description", type: "text" },
                ],
              }).then(result => {
                toast({ title: "Import Complete", description: `${result.imported} imported, ${result.failed} failed` });
                loadCash();
              }).catch((e: any) => {
                toast({ title: "Import Error", description: e.message, variant: "destructive" });
              });
            }}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          </div>

          {cashLoading ? <Spinner /> : cashData ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 mt-4">
                {[
                  { label: "Total Cash In Hand", value: isVatAuditor ? AUDIT_MASK : fmt(cashData.totals?.totalCashInHand, "currency"), icon: Wallet, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
                  { label: "Total Bank Balance", value: isVatAuditor ? AUDIT_MASK : fmt((cashData.bankBreakdown || []).reduce((s: number, b: any) => s + (typeof b.currentBalance === "number" ? b.currentBalance : 0), 0), "currency"), icon: Landmark, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
                  { label: "Total Collections", value: isVatAuditor ? AUDIT_MASK : fmt(cashData.totals?.cashCollections, "currency"), icon: ArrowUpCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
                  { label: "Net Cash Position", value: isVatAuditor ? AUDIT_MASK : fmt(cashData.totals?.totalCashInHand, "currency"), icon: DollarSign, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/30" },
                ].map((stat, i) => (
                  <Card key={i} className="stat-mini-card">
                    <CardContent className="p-3 flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Cash Flow Trend Chart */}
              {(cashData.dailyFlow || []).length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm">Cash Flow Trend</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {isVatAuditor ? (
                      <div className="flex items-center justify-center h-[300px] bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div className="text-center">
                          <Lock className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                          <p className="text-amber-600 dark:text-amber-400 font-medium">{AUDIT_MASK}</p>
                          <p className="text-xs text-slate-400 mt-1">Financial data hidden in Audit Mode</p>
                        </div>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={cashData.dailyFlow}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip />
                          <Legend />
                          <Line type="monotone" dataKey="inflow" stroke="#10b981" strokeWidth={2} name="Inflow" />
                          <Line type="monotone" dataKey="outflow" stroke="#ef4444" strokeWidth={2} name="Outflow" />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Bank-by-Bank Breakdown Table */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">Bank-by-Bank Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="table-container overflow-x-auto overflow-y-auto max-h-[40vh] rounded-md border -mx-2 sm:mx-0">
                    <Table className="min-w-[600px]">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Bank Name</TableHead>
                          <TableHead>Account No</TableHead>
                          <TableHead className="text-right">Opening</TableHead>
                          <TableHead className="text-right">Deposits</TableHead>
                          <TableHead className="text-right">Withdrawals</TableHead>
                          <TableHead className="text-right">Income</TableHead>
                          <TableHead className="text-right">Expense</TableHead>
                          <TableHead className="text-right">Collections</TableHead>
                          <TableHead className="text-right">Deliveries</TableHead>
                          <TableHead className="text-right">Current Balance</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(cashData.bankBreakdown || []).length === 0 ? (
                          <TableRow><TableCell colSpan={10} className="h-16 text-center text-muted-foreground">No bank data</TableCell></TableRow>
                        ) : cashData.bankBreakdown.map((b: any, i: number) => (
                          <TableRow key={i} className="hover:bg-muted/50">
                            <TableCell className="font-medium text-slate-900 dark:text-white">{b.bankName}</TableCell>
                            <TableCell className="font-mono text-xs">{b.accountNo}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(b.openingBalance, "currency")}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{fmt(b.deposits, "currency")}</TableCell>
                            <TableCell className="text-right font-mono text-red-600">{fmt(b.withdrawals, "currency")}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{fmt(b.income, "currency")}</TableCell>
                            <TableCell className="text-right font-mono">{isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{AUDIT_MASK}</span> : fmt(b.expense, "currency")}</TableCell>
                            <TableCell className="text-right font-mono text-green-600">{fmt(b.collections, "currency")}</TableCell>
                            <TableCell className="text-right font-mono text-red-600">{fmt(b.deliveries, "currency")}</TableCell>
                            <TableCell className="text-right font-mono font-bold text-slate-900 dark:text-white">{fmt(b.currentBalance, "currency")}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Income vs Expense Bar Chart */}
              {(cashData.incomeVsExpense || []).length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm">Income vs Expense Comparison</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    {isVatAuditor ? (
                      <div className="flex items-center justify-center h-[300px] bg-slate-50 dark:bg-slate-800 rounded-lg">
                        <div className="text-center">
                          <Lock className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                          <p className="text-amber-600 dark:text-amber-400 font-medium">{AUDIT_MASK}</p>
                          <p className="text-xs text-slate-400 mt-1">Financial data hidden in Audit Mode</p>
                        </div>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={cashData.incomeVsExpense}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip />
                          <Legend />
                          <Bar dataKey="amount" fill="#2563eb" name="Amount" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Recent Transactions */}
              {(cashData.recentTransactions || []).length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm">Recent Transactions</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="table-container overflow-x-auto overflow-y-auto max-h-[30vh] rounded-md border -mx-2 sm:mx-0">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Date</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {cashData.recentTransactions.map((t: any, i: number) => (
                            <TableRow key={i} className="hover:bg-muted/50">
                              <TableCell>{fmtDate(t.date)}</TableCell>
                              <TableCell>{t.description}</TableCell>
                              <TableCell>
                                <Badge className={t.type === "Inflow" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                                  {t.type}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">{fmt(t.amount, "currency")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">No data available</div>
          )}
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 3: TRIAL BALANCE */}
        {/* ============================================ */}
        <TabsContent value="trial">
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Label className="text-sm">From</Label>
            <Input type="date" value={tbFrom} onChange={e => setTbFrom(e.target.value)} className="w-40" />
            <Label className="text-sm">To</Label>
            <Input type="date" value={tbTo} onChange={e => setTbTo(e.target.value)} className="w-40" />
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={loadTB}>
              <RefreshCw className="w-4 h-4 mr-1" />Generate Report
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (!tbData) return;
              const columns: ColumnDef[] = [
                { key: "account", label: "Account Name", type: "text" },
                { key: "classification", label: "Classification", type: "text" },
                { key: "totalDebit", label: "Total Debit", type: "currency" },
                { key: "totalCredit", label: "Total Credit", type: "currency" },
                { key: "netBalance", label: "Net Balance", type: "currency" },
              ];
              const vatMasked = isVatAuditor ? ["totalDebit", "totalCredit", "netBalance"] : [];
              const period = tbFrom || tbTo ? `Period: ${tbFrom || "—"} to ${tbTo || "—"}` : undefined;
              doExportPDF("Trial Balance Report", period, columns, tbData.entries || [], vatMasked);
            }}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (!tbData) return;
              const columns: ColumnDef[] = [
                { key: "account", label: "Account Name", type: "text" },
                { key: "classification", label: "Classification", type: "text" },
                { key: "totalDebit", label: "Total Debit", type: "currency" },
                { key: "totalCredit", label: "Total Credit", type: "currency" },
                { key: "netBalance", label: "Net Balance", type: "currency" },
              ];
              const vatMasked = isVatAuditor ? ["totalDebit", "totalCredit", "netBalance"] : [];
              doExportCSV("Trial Balance Report", columns, tbData.entries || [], vatMasked);
            }}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              if (!tbData) return;
              const columns: ColumnDef[] = [
                { key: "account", label: "Account Name", type: "text" },
                { key: "classification", label: "Classification", type: "text" },
                { key: "totalDebit", label: "Total Debit", type: "currency" },
                { key: "totalCredit", label: "Total Credit", type: "currency" },
                { key: "netBalance", label: "Net Balance", type: "currency" },
              ];
              const vatMasked = isVatAuditor ? ["totalDebit", "totalCredit", "netBalance"] : [];
              const period = tbFrom || tbTo ? `Period: ${tbFrom || "\u2014"} to ${tbTo || "\u2014"}` : undefined;
              await doCopyToClipboard("Trial Balance Report", period, columns, tbData.entries || [], vatMasked);
            }}><Copy className="w-4 h-4 mr-1" />Copy</Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (isVatAuditor) { toast({ title: "Access Denied", description: "VAT Auditors cannot import data", variant: "destructive" }); return; }
              importFromCSV({
                apiPath: "/api/chart-of-accounts",
                formFields: [
                  { key: "name", label: "Account Name", type: "text", required: true },
                  { key: "classification", label: "Classification", type: "select", required: true, options: [{ value: "Asset", label: "Asset" }, { value: "Liability", label: "Liability" }, { value: "Income", label: "Income" }, { value: "Expense", label: "Expense" }, { value: "Equity", label: "Equity" }] },
                  { key: "openingBalance", label: "Opening Balance", type: "number" },
                  { key: "openingBalanceType", label: "Balance Type", type: "select", options: [{ value: "Dr", label: "Dr" }, { value: "Cr", label: "Cr" }] },
                ],
              }).then(result => {
                toast({ title: "Import Complete", description: `${result.imported} imported, ${result.failed} failed` });
                loadTB();
              }).catch((e: any) => {
                toast({ title: "Import Error", description: e.message, variant: "destructive" });
              });
            }}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          </div>

          {tbLoading ? <Spinner /> : tbData ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 mt-4">
                {[
                  { label: "Total Accounts", value: (tbData.entries || []).length, icon: BookOpen, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
                  { label: "Grand Total Debit", value: isVatAuditor ? AUDIT_MASK : fmt(tbData.grandTotalDebit, "currency"), icon: ArrowUpCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
                  { label: "Grand Total Credit", value: isVatAuditor ? AUDIT_MASK : fmt(tbData.grandTotalCredit, "currency"), icon: ArrowDownCircle, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
                  {
                    label: "Status",
                    value: tbData.balanced ? "Balanced" : "Unbalanced",
                    icon: tbData.balanced ? CheckCircle : AlertTriangle,
                    color: tbData.balanced ? "text-green-600" : "text-red-600",
                    bg: tbData.balanced ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30",
                  },
                ].map((stat, i) => (
                  <Card key={i} className="stat-mini-card">
                    <CardContent className="p-3 flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Balanced/Unbalanced Badge */}
              <div className="flex items-center gap-3 mt-4">
                <Badge className={`${tbData.balanced ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"} text-sm px-3 py-1`}>
                  {tbData.balanced ? <CheckCircle className="w-4 h-4 mr-1 inline" /> : <AlertTriangle className="w-4 h-4 mr-1 inline" />}
                  {tbData.balanced ? "Balanced" : "Unbalanced"}
                </Badge>
              </div>

              {/* Trial Balance Table */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">Trial Balance</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="table-container overflow-x-auto overflow-y-auto max-h-[50vh] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Account Name</TableHead>
                          <TableHead>Classification</TableHead>
                          <TableHead className="text-right">Total Debit</TableHead>
                          <TableHead className="text-right">Total Credit</TableHead>
                          {!isVatAuditor && <TableHead className="text-right">Net Balance</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(tbData.entries || []).length === 0 ? (
                          <TableRow><TableCell colSpan={isVatAuditor ? 4 : 5} className="h-16 text-center text-muted-foreground">No entries</TableCell></TableRow>
                        ) : (
                          <>
                            {tbData.entries.map((e: any, i: number) => (
                              <TableRow key={i} className="hover:bg-muted/50">
                                <TableCell className="font-medium text-slate-900 dark:text-white">{e.account}</TableCell>
                                <TableCell><Badge className={classColor(e.classification)}>{e.classification}</Badge></TableCell>
                                <TableCell className="text-right font-mono">{fmt(e.totalDebit, "currency")}</TableCell>
                                <TableCell className="text-right font-mono">{fmt(e.totalCredit, "currency")}</TableCell>
                                {!isVatAuditor && (
                                  <TableCell className="text-right font-mono font-bold">
                                    {typeof e.totalDebit === "number" && typeof e.totalCredit === "number"
                                      ? (e.totalDebit > e.totalCredit ? fmt(e.totalDebit - e.totalCredit, "currency") + " Dr" : fmt(e.totalCredit - e.totalDebit, "currency") + " Cr")
                                      : AUDIT_MASK}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                            {/* Grand Total Row */}
                            <TableRow className="bg-muted/50 font-bold">
                              <TableCell className="text-slate-900 dark:text-white">Grand Total</TableCell>
                              <TableCell />
                              <TableCell className="text-right font-mono">{fmt(tbData.grandTotalDebit, "currency")}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(tbData.grandTotalCredit, "currency")}</TableCell>
                              {!isVatAuditor && (
                                <TableCell className="text-right font-mono">
                                  {typeof tbData.grandTotalDebit === "number" && typeof tbData.grandTotalCredit === "number"
                                    ? (Math.abs(tbData.grandTotalDebit - tbData.grandTotalCredit) < 0.01
                                      ? <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Balanced</Badge>
                                      : <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Unbalanced: {fmt(Math.abs(tbData.grandTotalDebit - tbData.grandTotalCredit), "currency")}</Badge>)
                                    : AUDIT_MASK}
                                </TableCell>
                              )}
                            </TableRow>
                          </>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Charts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {(tbData.chartData || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Top 10 Accounts by Debit/Credit</CardTitle>
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

                {(tbData.pieData || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Account Balance Distribution</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie data={tbData.pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {tbData.pieData.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
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
            <div className="text-center py-16 text-muted-foreground">No data available</div>
          )}
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 4: PROFIT & LOSS */}
        {/* ============================================ */}
        <TabsContent value="pl">
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Label className="text-sm">From</Label>
            <Input type="date" value={plFrom} onChange={e => setPlFrom(e.target.value)} className="w-40" />
            <Label className="text-sm">To</Label>
            <Input type="date" value={plTo} onChange={e => setPlTo(e.target.value)} className="w-40" />
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={loadPL}>
              <RefreshCw className="w-4 h-4 mr-1" />Generate Report
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (!plData) return;
              const rows = [
                { item: "Sales Revenue", amount: plData.salesRevenue, section: "Revenue" },
                { item: "Other Income", amount: plData.otherIncome, section: "Revenue" },
                { item: "Total Revenue", amount: plData.revenue, section: "Revenue Total" },
                { item: "Cost of Goods Sold", amount: plData.costOfGoods, section: "COGS" },
                { item: "Gross Profit", amount: plData.grossProfit, section: "Gross Profit" },
                { item: "Gross Profit Margin (%)", amount: plData.grossProfitMargin, section: "Margin" },
                { item: "Operating Expenses", amount: plData.operatingExpenses, section: "Expense" },
                { item: "Net Profit", amount: plData.netProfit, section: "Net" },
                { item: "Net Profit Margin (%)", amount: plData.netProfitMargin, section: "Margin" },
              ];
              const columns: ColumnDef[] = [
                { key: "item", label: "Item", type: "text" },
                { key: "amount", label: "Amount", type: "currency" },
                { key: "section", label: "Section", type: "text" },
              ];
              const vatMasked = isVatAuditor ? ["amount"] : [];
              const period = plFrom || plTo ? `Period: ${plFrom || "—"} to ${plTo || "—"}` : undefined;
              doExportPDF("Profit & Loss Statement", period, columns, rows, vatMasked, "portrait");
            }}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (!plData) return;
              const rows = [
                { item: "Sales Revenue", amount: plData.salesRevenue, section: "Revenue" },
                { item: "Other Income", amount: plData.otherIncome, section: "Revenue" },
                { item: "Total Revenue", amount: plData.revenue, section: "Revenue Total" },
                { item: "Cost of Goods Sold", amount: plData.costOfGoods, section: "COGS" },
                { item: "Gross Profit", amount: plData.grossProfit, section: "Gross Profit" },
                { item: "Operating Expenses", amount: plData.operatingExpenses, section: "Expense" },
                { item: "Net Profit", amount: plData.netProfit, section: "Net" },
              ];
              const columns: ColumnDef[] = [
                { key: "item", label: "Item", type: "text" },
                { key: "amount", label: "Amount", type: "currency" },
                { key: "section", label: "Section", type: "text" },
              ];
              const vatMasked = isVatAuditor ? ["amount"] : [];
              doExportCSV("Profit & Loss Statement", columns, rows, vatMasked);
            }}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              if (!plData) return;
              const rows = [
                { item: "Sales Revenue", amount: plData.salesRevenue, section: "Revenue" },
                { item: "Other Income", amount: plData.otherIncome, section: "Revenue" },
                { item: "Total Revenue", amount: plData.revenue, section: "Revenue Total" },
                { item: "Cost of Goods Sold", amount: plData.costOfGoods, section: "COGS" },
                { item: "Gross Profit", amount: plData.grossProfit, section: "Gross Profit" },
                { item: "Operating Expenses", amount: plData.operatingExpenses, section: "Expense" },
                { item: "Net Profit", amount: plData.netProfit, section: "Net" },
              ];
              const columns: ColumnDef[] = [
                { key: "item", label: "Item", type: "text" },
                { key: "amount", label: "Amount", type: "currency" },
                { key: "section", label: "Section", type: "text" },
              ];
              const vatMasked = isVatAuditor ? ["amount"] : [];
              const period = plFrom || plTo ? `Period: ${plFrom || "\u2014"} to ${plTo || "\u2014"}` : undefined;
              await doCopyToClipboard("Profit & Loss Statement", period, columns, rows, vatMasked);
            }}><Copy className="w-4 h-4 mr-1" />Copy</Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (isVatAuditor) { toast({ title: "Access Denied", description: "VAT Auditors cannot import data", variant: "destructive" }); return; }
              importFromCSV({
                apiPath: "/api/expenses",
                formFields: [
                  { key: "headId", label: "Head ID", type: "text", required: true },
                  { key: "amount", label: "Amount", type: "number", required: true },
                  { key: "date", label: "Date", type: "date", required: true },
                  { key: "description", label: "Description", type: "text" },
                ],
              }).then(result => {
                toast({ title: "Import Complete", description: `${result.imported} imported, ${result.failed} failed` });
                loadPL();
              }).catch((e: any) => {
                toast({ title: "Import Error", description: e.message, variant: "destructive" });
              });
            }}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          </div>

          {plLoading ? <Spinner /> : plData ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 mt-4">
                {[
                  { label: "Total Revenue", value: isVatAuditor ? AUDIT_MASK : fmt(plData.revenue, "currency"), icon: TrendingUp, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
                  { label: "COGS", value: isVatAuditor ? AUDIT_MASK : fmt(plData.costOfGoods, "currency"), icon: DollarSign, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
                  { label: "Gross Profit", value: isVatAuditor ? AUDIT_MASK : fmt(plData.grossProfit, "currency"), icon: ArrowUpCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
                  { label: "Operating Expenses", value: isVatAuditor ? AUDIT_MASK : fmt(plData.operatingExpenses, "currency"), icon: ArrowDownCircle, color: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-900/30" },
                  { label: "Net Profit", value: isVatAuditor ? AUDIT_MASK : fmt(plData.netProfit, "currency"), icon: DollarSign, color: typeof plData.netProfit === "number" && plData.netProfit >= 0 ? "text-green-600" : "text-red-600", bg: typeof plData.netProfit === "number" && plData.netProfit >= 0 ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30" },
                ].map((stat, i) => (
                  <Card key={i} className="stat-mini-card">
                    <CardContent className="p-3 flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* P&L Statement Table */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">Profit & Loss Statement</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="table-container overflow-x-auto overflow-y-auto max-h-[50vh] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Revenue */}
                        <TableRow className="bg-blue-50/50 dark:bg-blue-900/10">
                          <TableCell colSpan={2} className="font-bold text-blue-700 dark:text-blue-400">REVENUE</TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">Sales Revenue</TableCell>
                          <TableCell className="text-right font-mono">{fmt(plData.salesRevenue, "currency")}</TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">Other Income</TableCell>
                          <TableCell className="text-right font-mono">{fmt(plData.otherIncome, "currency")}</TableCell>
                        </TableRow>
                        <TableRow className="bg-green-50/50 dark:bg-green-900/10 font-bold">
                          <TableCell className="text-slate-900 dark:text-white">Total Revenue</TableCell>
                          <TableCell className="text-right font-mono text-green-700 dark:text-green-400">{fmt(plData.revenue, "currency")}</TableCell>
                        </TableRow>

                        {/* COGS */}
                        <TableRow className="bg-red-50/50 dark:bg-red-900/10">
                          <TableCell colSpan={2} className="font-bold text-red-700 dark:text-red-400">COST OF GOODS SOLD</TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">COGS</TableCell>
                          <TableCell className="text-right font-mono">{fmt(plData.costOfGoods, "currency")}</TableCell>
                        </TableRow>

                        {/* Gross Profit */}
                        <TableRow className="bg-emerald-50/50 dark:bg-emerald-900/10 font-bold">
                          <TableCell className="text-slate-900 dark:text-white">Gross Profit</TableCell>
                          <TableCell className="text-right font-mono text-emerald-700 dark:text-emerald-400">{fmt(plData.grossProfit, "currency")}</TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 italic text-muted-foreground">Gross Profit Margin</TableCell>
                          <TableCell className="text-right font-mono">{fmt(plData.grossProfitMargin, "percent")}</TableCell>
                        </TableRow>

                        {/* Income Details */}
                        {(plData.incomeDetails || []).length > 0 && (
                          <TableRow className="bg-teal-50/50 dark:bg-teal-900/10">
                            <TableCell colSpan={2} className="font-bold text-teal-700 dark:text-teal-400">INCOME BREAKDOWN</TableCell>
                          </TableRow>
                        )}
                        {(plData.incomeDetails || []).map((inc: any, i: number) => (
                          <TableRow key={`inc-${i}`} className="hover:bg-muted/50">
                            <TableCell className="pl-6 text-slate-900 dark:text-white">{inc.head}</TableCell>
                            <TableCell className="text-right font-mono">{fmt(inc.amount, "currency")}</TableCell>
                          </TableRow>
                        ))}

                        {/* Operating Expenses */}
                        <TableRow className="bg-amber-50/50 dark:bg-amber-900/10">
                          <TableCell colSpan={2} className="font-bold text-amber-700 dark:text-amber-400">OPERATING EXPENSES</TableCell>
                        </TableRow>
                        {(plData.expenseDetails || []).map((e: any, i: number) => (
                          <TableRow key={`exp-${i}`} className="hover:bg-muted/50">
                            <TableCell className="pl-6 text-slate-900 dark:text-white">{e.head}</TableCell>
                            <TableCell className="text-right font-mono">{isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{AUDIT_MASK}</span> : fmt(e.amount, "currency")}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="hover:bg-muted/50 font-semibold">
                          <TableCell className="text-slate-900 dark:text-white">Total Operating Expenses</TableCell>
                          <TableCell className="text-right font-mono">{isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{AUDIT_MASK}</span> : fmt(plData.operatingExpenses, "currency")}</TableCell>
                        </TableRow>

                        {/* Net Profit */}
                        <TableRow className="bg-purple-50/50 dark:bg-purple-900/10 font-bold border-t-2 border-purple-300">
                          <TableCell className="text-slate-900 dark:text-white">Net Profit</TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor
                              ? <span className="text-amber-600 dark:text-amber-400">{AUDIT_MASK}</span>
                              : <span className={typeof plData.netProfit === "number" && plData.netProfit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{fmt(plData.netProfit, "currency")}</span>}
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 italic text-muted-foreground">Net Profit Margin</TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor
                              ? <span className="text-amber-600 dark:text-amber-400">{AUDIT_MASK}</span>
                              : fmt(plData.netProfitMargin, "percent")}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Charts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {(plData.monthlyData || []).length > 0 && (
                  <Card className="md:col-span-2">
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Monthly Trend (12 Months)</CardTitle>
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
                          <Bar dataKey="profit" fill="#2563eb" name="Profit" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Revenue vs Expense Pie */}
                <Card>
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm">Revenue vs Expense</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: "Revenue", value: plData.revenue || 0 },
                            { name: "COGS", value: plData.costOfGoods || 0 },
                            { name: "Expenses", value: plData.operatingExpenses || 0 },
                            { name: "Net Profit", value: Math.max(plData.netProfit || 0, 0) },
                          ].filter(d => d.value > 0)}
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          dataKey="value"
                          label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}
                        >
                          <Cell fill="#10b981" />
                          <Cell fill="#ef4444" />
                          <Cell fill="#f59e0b" />
                          <Cell fill="#2563eb" />
                        </Pie>
                        <RechartsTooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                {/* Profit Margin Line Chart */}
                {(plData.monthlyData || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Profit Margin Trend</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <LineChart data={plData.monthlyData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip />
                          <Legend />
                          <Line type="monotone" dataKey="profitMargin" stroke="#2563eb" strokeWidth={2} name="Profit Margin %" />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">No data available</div>
          )}
        </TabsContent>

        {/* ============================================ */}
        {/* TAB 5: BALANCE SHEET */}
        {/* ============================================ */}
        <TabsContent value="bs">
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Label className="text-sm">As of Date</Label>
            <Input type="date" value={bsAsOf} onChange={e => setBsAsOf(e.target.value)} className="w-40" />
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={loadBS}>
              <RefreshCw className="w-4 h-4 mr-1" />Generate Report
            </Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (!bsData) return;
              const rows = [
                { category: "ASSETS", item: "", amount: 0, isHeader: true },
                { category: "Current Assets", item: "Bank Balance", amount: bsData.assets?.bankBalance || 0 },
                { category: "Current Assets", item: "Receivables", amount: bsData.assets?.receivables || 0 },
                { category: "Current Assets", item: "Supplier Advances", amount: bsData.assets?.supplierAdvances || 0 },
                { category: "Fixed Assets", item: "Stock Value", amount: bsData.assets?.stock || 0 },
                { category: "", item: "Total Assets", amount: bsData.assets?.totalAssets || 0 },
                { category: "LIABILITIES", item: "", amount: 0, isHeader: true },
                { category: "Current Liabilities", item: "Payables", amount: bsData.liabilities?.payables || 0 },
                { category: "Current Liabilities", item: "Customer Advances", amount: bsData.liabilities?.customerAdvances || 0 },
                { category: "", item: "Total Liabilities", amount: bsData.liabilities?.totalLiabilities || 0 },
                { category: "EQUITY", item: "", amount: 0, isHeader: true },
                { category: "Equity", item: "Retained Earnings", amount: bsData.liabilities?.retainedEarnings || 0 },
              ];
              const columns: ColumnDef[] = [
                { key: "category", label: "Category", type: "text" },
                { key: "item", label: "Item", type: "text" },
                { key: "amount", label: "Amount", type: "currency" },
              ];
              const vatMasked = isVatAuditor ? ["amount"] : [];
              doExportPDF("Balance Sheet Report", `As of ${bsAsOf ? fmtDate(bsAsOf) : fmtDate(new Date())}`, columns, rows, vatMasked, "portrait");
            }}><FileDown className="w-4 h-4 mr-1" />PDF</Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (!bsData) return;
              const rows = [
                { category: "ASSETS", item: "Bank Balance", amount: bsData.assets?.bankBalance || 0 },
                { category: "ASSETS", item: "Receivables", amount: bsData.assets?.receivables || 0 },
                { category: "ASSETS", item: "Supplier Advances", amount: bsData.assets?.supplierAdvances || 0 },
                { category: "ASSETS", item: "Stock Value", amount: bsData.assets?.stock || 0 },
                { category: "ASSETS", item: "Total Assets", amount: bsData.assets?.totalAssets || 0 },
                { category: "LIABILITIES", item: "Payables", amount: bsData.liabilities?.payables || 0 },
                { category: "LIABILITIES", item: "Customer Advances", amount: bsData.liabilities?.customerAdvances || 0 },
                { category: "LIABILITIES", item: "Total Liabilities", amount: bsData.liabilities?.totalLiabilities || 0 },
                { category: "EQUITY", item: "Retained Earnings", amount: bsData.liabilities?.retainedEarnings || 0 },
              ];
              const columns: ColumnDef[] = [
                { key: "category", label: "Category", type: "text" },
                { key: "item", label: "Item", type: "text" },
                { key: "amount", label: "Amount", type: "currency" },
              ];
              const vatMasked = isVatAuditor ? ["amount"] : [];
              doExportCSV("Balance Sheet Report", columns, rows, vatMasked);
            }}><Download className="w-4 h-4 mr-1" />CSV</Button>
            <Button variant="outline" size="sm" onClick={async () => {
              if (!bsData) return;
              const rows = [
                { category: "ASSETS", item: "Bank Balance", amount: bsData.assets?.bankBalance || 0 },
                { category: "ASSETS", item: "Receivables", amount: bsData.assets?.receivables || 0 },
                { category: "ASSETS", item: "Supplier Advances", amount: bsData.assets?.supplierAdvances || 0 },
                { category: "ASSETS", item: "Stock Value", amount: bsData.assets?.stock || 0 },
                { category: "ASSETS", item: "Total Assets", amount: bsData.assets?.totalAssets || 0 },
                { category: "LIABILITIES", item: "Payables", amount: bsData.liabilities?.payables || 0 },
                { category: "LIABILITIES", item: "Customer Advances", amount: bsData.liabilities?.customerAdvances || 0 },
                { category: "LIABILITIES", item: "Total Liabilities", amount: bsData.liabilities?.totalLiabilities || 0 },
                { category: "EQUITY", item: "Retained Earnings", amount: bsData.liabilities?.retainedEarnings || 0 },
              ];
              const columns: ColumnDef[] = [
                { key: "category", label: "Category", type: "text" },
                { key: "item", label: "Item", type: "text" },
                { key: "amount", label: "Amount", type: "currency" },
              ];
              const vatMasked = isVatAuditor ? ["amount"] : [];
              await doCopyToClipboard("Balance Sheet Report", `As of ${bsAsOf ? fmtDate(bsAsOf) : fmtDate(new Date())}`, columns, rows, vatMasked);
            }}><Copy className="w-4 h-4 mr-1" />Copy</Button>
            <Button variant="outline" size="sm" onClick={() => {
              if (isVatAuditor) { toast({ title: "Access Denied", description: "VAT Auditors cannot import data", variant: "destructive" }); return; }
              importFromCSV({
                apiPath: "/api/chart-of-accounts",
                formFields: [
                  { key: "name", label: "Account Name", type: "text", required: true },
                  { key: "classification", label: "Classification", type: "select", required: true, options: [{ value: "Asset", label: "Asset" }, { value: "Liability", label: "Liability" }, { value: "Income", label: "Income" }, { value: "Expense", label: "Expense" }, { value: "Equity", label: "Equity" }] },
                  { key: "openingBalance", label: "Opening Balance", type: "number" },
                  { key: "openingBalanceType", label: "Balance Type", type: "select", options: [{ value: "Dr", label: "Dr" }, { value: "Cr", label: "Cr" }] },
                ],
              }).then(result => {
                toast({ title: "Import Complete", description: `${result.imported} imported, ${result.failed} failed` });
                loadBS();
              }).catch((e: any) => {
                toast({ title: "Import Error", description: e.message, variant: "destructive" });
              });
            }}><Upload className="w-4 h-4 mr-1" />Import CSV</Button>
          </div>

          {bsLoading ? <Spinner /> : bsData ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 mt-4">
                {[
                  { label: "Total Assets", value: isVatAuditor ? AUDIT_MASK : fmt(bsData.assets?.totalAssets, "currency"), icon: Landmark, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
                  { label: "Total Liabilities", value: isVatAuditor ? AUDIT_MASK : fmt(bsData.liabilities?.totalLiabilities, "currency"), icon: ArrowDownCircle, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
                  { label: "Equity", value: isVatAuditor ? AUDIT_MASK : fmt(bsData.liabilities?.retainedEarnings, "currency"), icon: Scale, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/30" },
                  { label: "Current Ratio", value: isVatAuditor ? AUDIT_MASK : (bsData.ratios?.currentRatio || 0).toFixed(2), icon: BarChart3, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
                  { label: "Status", value: bsData.balanced ? "Balanced" : "Unbalanced", icon: bsData.balanced ? CheckCircle : AlertTriangle, color: bsData.balanced ? "text-green-600" : "text-red-600", bg: bsData.balanced ? "bg-green-50 dark:bg-green-900/30" : "bg-red-50 dark:bg-red-900/30" },
                ].map((stat, i) => (
                  <Card key={i} className="stat-mini-card">
                    <CardContent className="p-3 flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                      <div>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Balance / Imbalance Badge */}
              <div className="flex items-center gap-3 mt-4">
                <Badge className={`${bsData.balanced ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"} text-sm px-3 py-1`}>
                  {bsData.balanced ? <CheckCircle className="w-4 h-4 mr-1 inline" /> : <AlertTriangle className="w-4 h-4 mr-1 inline" />}
                  {bsData.balanced ? "Balance Sheet Balanced" : "Balance Sheet Unbalanced"}
                </Badge>
                {bsData.periodClose && (
                  <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-sm px-3 py-1">
                    Period: {bsData.periodClose.periodCode} ({bsData.periodClose.periodMonth}/{bsData.periodClose.periodYear})
                  </Badge>
                )}
              </div>

              {/* Balance Sheet Table */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">Balance Sheet — As of {fmtDate(bsData.asOf)}</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="table-container overflow-x-auto overflow-y-auto max-h-[50vh] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Category</TableHead>
                          <TableHead>Item</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* ASSETS */}
                        <TableRow className="bg-blue-50/50 dark:bg-blue-900/10">
                          <TableCell colSpan={3} className="font-bold text-blue-700 dark:text-blue-400 text-sm uppercase">Assets</TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">Stock Value</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{bsData.assets?.details?.fixedAssets?.stockItems || 0} items</TableCell>
                          <TableCell className="text-right font-mono">{fmt(bsData.assets?.stock, "currency")}</TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">Bank Balance</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{(bsData.assets?.details?.currentAssets?.bankBreakdown || []).length} banks</TableCell>
                          <TableCell className="text-right font-mono">{fmt(bsData.assets?.bankBalance, "currency")}</TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">Receivables</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{(bsData.assets?.details?.currentAssets?.receivablesBreakdown || []).length} customers</TableCell>
                          <TableCell className="text-right font-mono text-amber-700 dark:text-amber-400">{fmt(bsData.assets?.receivables, "currency")}</TableCell>
                        </TableRow>
                        {(bsData.assets?.supplierAdvances || 0) > 0 && (
                          <TableRow className="hover:bg-muted/50">
                            <TableCell className="pl-6 text-slate-900 dark:text-white">Supplier Advances</TableCell>
                            <TableCell />
                            <TableCell className="text-right font-mono">{fmt(bsData.assets?.supplierAdvances, "currency")}</TableCell>
                          </TableRow>
                        )}
                        <TableRow className="bg-blue-50/50 dark:bg-blue-900/10 font-bold">
                          <TableCell colSpan={2} className="text-blue-700 dark:text-blue-400">Total Assets</TableCell>
                          <TableCell className="text-right font-mono text-blue-700 dark:text-blue-400">{fmt(bsData.assets?.totalAssets, "currency")}</TableCell>
                        </TableRow>

                        {/* LIABILITIES */}
                        <TableRow className="bg-red-50/50 dark:bg-red-900/10">
                          <TableCell colSpan={3} className="font-bold text-red-700 dark:text-red-400 text-sm uppercase">Liabilities</TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">Payables</TableCell>
                          <TableCell className="text-muted-foreground text-xs">{(bsData.liabilities?.details?.currentLiabilities?.payablesBreakdown || []).length} suppliers</TableCell>
                          <TableCell className="text-right font-mono">{fmt(bsData.liabilities?.payables, "currency")}</TableCell>
                        </TableRow>
                        {(bsData.liabilities?.customerAdvances || 0) > 0 && (
                          <TableRow className="hover:bg-muted/50">
                            <TableCell className="pl-6 text-slate-900 dark:text-white">Customer Advances</TableCell>
                            <TableCell />
                            <TableCell className="text-right font-mono">{fmt(bsData.liabilities?.customerAdvances, "currency")}</TableCell>
                          </TableRow>
                        )}
                        <TableRow className="bg-red-50/50 dark:bg-red-900/10 font-bold">
                          <TableCell colSpan={2} className="text-red-700 dark:text-red-400">Total Liabilities</TableCell>
                          <TableCell className="text-right font-mono text-red-700 dark:text-red-400">{fmt(bsData.liabilities?.totalLiabilities, "currency")}</TableCell>
                        </TableRow>

                        {/* EQUITY */}
                        <TableRow className="bg-purple-50/50 dark:bg-purple-900/10">
                          <TableCell colSpan={3} className="font-bold text-purple-700 dark:text-purple-400 text-sm uppercase">Equity</TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 text-slate-900 dark:text-white">Retained Earnings</TableCell>
                          <TableCell />
                          <TableCell className="text-right font-mono">{fmt(bsData.liabilities?.retainedEarnings, "currency")}</TableCell>
                        </TableRow>
                        <TableRow className="bg-purple-50/50 dark:bg-purple-900/10 font-bold">
                          <TableCell colSpan={2} className="text-purple-700 dark:text-purple-400">Total Equity</TableCell>
                          <TableCell className="text-right font-mono text-purple-700 dark:text-purple-400">{fmt(Math.max(bsData.liabilities?.retainedEarnings || 0, 0), "currency")}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Financial Ratios */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">Financial Ratios</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Current Ratio</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{isVatAuditor ? AUDIT_MASK : (bsData.ratios?.currentRatio || 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Current Assets / Current Liabilities</p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Debt to Equity Ratio</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{isVatAuditor ? AUDIT_MASK : (bsData.ratios?.debtToEquity || 0).toFixed(2)}</p>
                      <p className="text-xs text-muted-foreground mt-1">Total Liabilities / Equity</p>
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Working Capital</p>
                      <p className="text-2xl font-bold text-slate-900 dark:text-white">{isVatAuditor ? AUDIT_MASK : fmt((bsData.assets?.bankBalance || 0) + (bsData.assets?.receivables || 0) - (bsData.liabilities?.payables || 0), "currency")}</p>
                      <p className="text-xs text-muted-foreground mt-1">Current Assets − Current Liabilities</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Charts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                {/* Asset Composition */}
                {(bsData.assetComposition || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Asset Composition</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={bsData.assetComposition} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {bsData.assetComposition.map((entry: any, i: number) => <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Liability Composition */}
                {(bsData.liabilityComposition || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Liability Composition</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <PieChart>
                          <Pie data={bsData.liabilityComposition} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {bsData.liabilityComposition.map((entry: any, i: number) => <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Assets vs Liabilities vs Equity Bar */}
                {(bsData.comparisonData || []).length > 0 && (
                  <Card className="md:col-span-2">
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Assets vs Liabilities vs Equity</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={bsData.comparisonData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip />
                          <Legend />
                          <Bar dataKey="value" fill="#2563eb" name="Amount" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Receivables Breakdown */}
              {(bsData.assets?.details?.currentAssets?.receivablesBreakdown || []).length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm">Receivables Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="table-container overflow-x-auto overflow-y-auto max-h-[30vh] rounded-md border -mx-2 sm:mx-0">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Customer</TableHead>
                            <TableHead className="text-right">Opening</TableHead>
                            <TableHead className="text-right">Sales</TableHead>
                            <TableHead className="text-right">Collections</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bsData.assets.details.currentAssets.receivablesBreakdown.map((r: any, i: number) => (
                            <TableRow key={i} className="hover:bg-muted/50">
                              <TableCell className="font-medium text-slate-900 dark:text-white">{r.customerName}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.openingBalance, "currency")}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.totalSales, "currency")}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(r.totalCollections, "currency")}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-amber-700 dark:text-amber-400">{fmt(r.balance, "currency")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Payables Breakdown */}
              {(bsData.liabilities?.details?.currentLiabilities?.payablesBreakdown || []).length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm">Payables Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="table-container overflow-x-auto overflow-y-auto max-h-[30vh] rounded-md border -mx-2 sm:mx-0">
                      <Table className="min-w-[600px]">
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Supplier</TableHead>
                            <TableHead className="text-right">Opening</TableHead>
                            <TableHead className="text-right">Purchases</TableHead>
                            <TableHead className="text-right">Deliveries</TableHead>
                            <TableHead className="text-right">Balance</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {bsData.liabilities.details.currentLiabilities.payablesBreakdown.map((p: any, i: number) => (
                            <TableRow key={i} className="hover:bg-muted/50">
                              <TableCell className="font-medium text-slate-900 dark:text-white">{p.supplierName}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(p.openingBalance, "currency")}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(p.totalPurchases, "currency")}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(p.totalDeliveries, "currency")}</TableCell>
                              <TableCell className="text-right font-mono font-bold text-red-700 dark:text-red-400">{fmt(p.balance, "currency")}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          ) : (
            <div className="text-center py-16 text-muted-foreground">No data available</div>
          )}
        </TabsContent>
      </Tabs>

    </div>
  );
}

// ============================================================
// CoA Tree Row — Recursive component
// ============================================================

function CoARow({
  account,
  level,
  expanded,
  onToggle,
  getChildren,
  isVatAuditor,
}: {
  account: any;
  level: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  getChildren: (parentId: string) => any[];
  isVatAuditor: boolean;
}) {
  const children = getChildren(account.id);
  const hasChildren = children.length > 0;
  const isExpanded = expanded.has(account.id);

  const classColor = (c: string) => {
    switch (c) {
      case "Asset": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "Liability": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "Equity": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      case "Income": case "Revenue": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "Expense": return "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400";
      default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
    }
  };

  return (
    <>
      <TableRow className={`hover:bg-muted/50 ${level === 0 ? "bg-slate-50/50 dark:bg-slate-800/20" : ""}`}>
        <TableCell className="w-8">
          {hasChildren ? (
            <button onClick={() => onToggle(account.id)} className="p-0.5 rounded hover:bg-muted">
              {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-3.5 inline-block" />
          )}
        </TableCell>
        <TableCell className="font-mono text-xs">{account.code}</TableCell>
        <TableCell className="font-medium text-slate-900 dark:text-white" style={{ paddingLeft: `${(level + 1) * 16}px` }}>
          {account.name}
        </TableCell>
        <TableCell><Badge className={classColor(account.classification)}>{account.classification}</Badge></TableCell>
        <TableCell className="text-muted-foreground text-xs">{account.parentAccountName || "—"}</TableCell>
        <TableCell className="text-right font-mono">
          {isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{AUDIT_MASK}</span> : fmt(account.openingBalance, "currency")}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs">{account.openingBalanceType || "Dr"}</Badge>
        </TableCell>
        <TableCell className="text-right font-mono font-bold">
          {isVatAuditor
            ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">{AUDIT_MASK}</span>
            : fmt(account.subBalance?.totalNet, "currency")}
        </TableCell>
        <TableCell className="text-center text-xs text-muted-foreground">{account._count?.childAccounts || 0}</TableCell>
      </TableRow>
      {hasChildren && isExpanded && children.map((child: any) => (
        <CoARow
          key={child.id}
          account={child}
          level={level + 1}
          expanded={expanded}
          onToggle={onToggle}
          getChildren={getChildren}
          isVatAuditor={isVatAuditor}
        />
      ))}
    </>
  );
}
