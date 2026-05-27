"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Lock, Plus, Edit, Trash2, Download, RefreshCw, Search,
  ChevronDown, ChevronRight, FileDown, CheckCircle, AlertTriangle,
  Scale, FileText, Shield, Calendar, LockOpen, Landmark, TrendingUp
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { exportToPDFSimple, exportToCSVSimple, importFromCSV } from "@/lib/export-utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";

// ============================================================
// UTILITY FUNCTIONS
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
// Auth Hook
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";
interface AuthUser { name: string; email: string; role: UserRole; displayName: string; }
let authState = { isAuthenticated: false, user: null as AuthUser | null };
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
    if (stored) { try { const parsed = JSON.parse(stored); authState = parsed; authListeners.forEach(l => l()); } catch {} }
  }, []);
  return { ...authState, isVatAuditor: authState.user?.role === "vat_auditor", isSR: authState.user?.role === "sr", isDealer: authState.user?.role === "dealer", isAdmin: authState.user?.role === "admin", isManager: authState.user?.role === "manager", user: authState.user };
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// ============================================================
// BalanceSheetPeriodClosePage Component
// ============================================================

export default function BalanceSheetPeriodClosePage({ initialTab }: { initialTab?: string }) {
  const { toast } = useToast();
  const { isVatAuditor, isSR, isDealer, isAdmin, isManager, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"bs" | "period">(() => initialTab === "period-close" ? "period" : "bs");

  // Balance Sheet
  const [bsData, setBsData] = useState<any>(null);
  const [bsLoading, setBsLoading] = useState(true);
  const [bsAsOf, setBsAsOf] = useState(new Date().toISOString().split("T")[0]);

  // Period Close
  const [periods, setPeriods] = useState<any[]>([]);
  const [perLoading, setPerLoading] = useState(true);
  const [perForm, setPerForm] = useState(false);
  const [perEdit, setPerEdit] = useState<any>(null);
  const [perDelete, setPerDelete] = useState<any>(null);
  const [perSaving, setPerSaving] = useState(false);
  const [perFormData, setPerFormData] = useState<Record<string, any>>({
    code: "", periodMonth: 1, periodYear: new Date().getFullYear(), notes: "",
  });

  const canModify = isAdmin || isManager;

  // Load Balance Sheet
  const loadBS = useCallback(async () => {
    setBsLoading(true);
    try {
      const params = new URLSearchParams();
      if (bsAsOf) params.set('asOf', bsAsOf);
      if (isVatAuditor) params.set('hideMargins', 'true');
      const qs = params.toString();
      const url = `/api/reports/balance-sheet${qs ? '?' + qs : ''}`;
      const res = await apiFetch(url);
      setBsData(res);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setBsLoading(false); }
  }, [toast, bsAsOf, isVatAuditor]);

  // Load Period Close
  const loadPeriods = useCallback(async () => {
    setPerLoading(true);
    try {
      const res = await apiFetch("/api/period-close");
      setPeriods(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setPerLoading(false); }
  }, [toast]);

  useEffect(() => { loadBS(); }, [loadBS]);
  useEffect(() => { if (activeTab === "period") loadPeriods(); }, [activeTab, loadPeriods]);

  // Period Close CRUD
  const openPerCreate = () => {
    const count = periods.length;
    setPerFormData({
      code: `BAL-${String(count + 1).padStart(5, "0")}`,
      periodMonth: new Date().getMonth() + 1,
      periodYear: new Date().getFullYear(),
      notes: "",
    });
    setPerEdit(null);
    setPerForm(true);
  };

  const savePeriod = async () => {
    setPerSaving(true);
    try {
      const payload = {
        periodMonth: Number(perFormData.periodMonth),
        periodYear: Number(perFormData.periodYear),
        notes: perFormData.notes || null,
        closedBy: user?.displayName || null,
      };
      if (perEdit) {
        await apiFetch(`/api/period-close/${perEdit.id}`, { method: "PUT", body: JSON.stringify({ notes: payload.notes }) });
        toast({ title: "Updated", description: "Period updated" });
      } else {
        await apiFetch("/api/period-close", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Period close created (Locked by default)" });
      }
      setPerForm(false); loadPeriods();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setPerSaving(false); }
  };

  const deletePeriod = async () => {
    if (!perDelete) return;
    try {
      await apiFetch(`/api/period-close/${perDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted" }); setPerDelete(null); loadPeriods();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  const toggleLock = async (item: any) => {
    try {
      await apiFetch(`/api/period-close/${item.id}`, { method: "PUT", body: JSON.stringify({ isLocked: !item.isLocked }) });
      toast({ title: item.isLocked ? "Unlocked" : "Locked", description: `Period ${item.code} ${item.isLocked ? "unlocked" : "locked"}` });
      loadPeriods();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
  };

  // Period Stats
  const perStats = useMemo(() => ({
    total: periods.length,
    locked: periods.filter((p: any) => p.isLocked).length,
    unlocked: periods.filter((p: any) => !p.isLocked).length,
    latest: periods.length > 0 ? fmtDate(periods[0].closeDate) : "—",
  }), [periods]);

  // Financial Ratios
  const ratios = useMemo(() => {
    if (!bsData) return { currentRatio: "—", debtToEquity: "—" };
    const currentAssets = bsData.assets?.stock + bsData.assets?.bankBalance + bsData.assets?.receivables;
    const currentLiabilities = bsData.liabilities?.payables;
    const equity = bsData.liabilities?.equity;
    const totalLiabilities = bsData.liabilities?.totalLiabilities;
    return {
      currentRatio: currentLiabilities > 0 ? (currentAssets / currentLiabilities).toFixed(2) : "∞",
      debtToEquity: equity > 0 ? (totalLiabilities / Math.max(equity, 1)).toFixed(2) : "∞",
    };
  }, [bsData]);

  // Export
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
      exportToPDFSimple(title, headers, rows, "landscape");
      toast({ title: "Exported", description: `${title} exported to PDF` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handlePerImportCSV = () => {
    importFromCSV({
      apiPath: "/api/period-close",
      formFields: [
        { key: "periodMonth", label: "Period Month", type: "number", required: true },
        { key: "periodYear", label: "Period Year", type: "number", required: true },
        { key: "notes", label: "Notes", type: "text" },
      ],
    }).then(result => {
      toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
      loadPeriods();
    });
  };

  // RBAC: SR/Dealer => 403 (AFTER all hooks and memos)
  if (isSR || isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-red-300 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">403 - Access Denied</h3>
            <p className="text-muted-foreground">You do not have permission to access Balance Sheet & Period Close. Contact your administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Equity and internal calculations masked for audit compliance.</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Scale className="w-6 h-6" />
          Balance Sheet & Period Close
        </h2>
        <div className="flex gap-2 flex-wrap">
          {activeTab === "period" && <Button variant="outline" size="sm" onClick={handlePerImportCSV}><Download className="w-4 h-4 mr-1" />Import CSV</Button>}
          <Button variant="outline" size="sm" onClick={() => {
            if (activeTab === "bs" && bsData) {
              exportCSV("Balance-Sheet", ["Section", "Item", "Amount"],
                [
                  ["Assets", "Stock Value", String(bsData.assets?.stock || 0)],
                  ["Assets", "Bank Balance", String(bsData.assets?.bankBalance || 0)],
                  ["Assets", "Receivables", String(bsData.assets?.receivables || 0)],
                  ...(bsData.assets?.supplierAdvances > 0 ? [["Assets", "Supplier Advances", String(bsData.assets?.supplierAdvances || 0)]] : []),
                  ["Assets", "Total Assets", String(bsData.assets?.totalAssets || 0)],
                  ["Liabilities", "Payables", String(bsData.liabilities?.payables || 0)],
                  ...(bsData.liabilities?.customerAdvances > 0 ? [["Liabilities", "Customer Advances", String(bsData.liabilities?.customerAdvances || 0)]] : []),
                  ["Liabilities", isVatAuditor ? "Equity (Masked)" : "Equity", isVatAuditor ? "N/A" : String(bsData.liabilities?.equity || 0)],
                  ["Liabilities", "Total Liabilities", String(bsData.liabilities?.totalLiabilities || 0)],
                ]);
            } else {
              exportCSV("Period-Close", ["Code", "Period", "Close Date", "Locked", "Notes"],
                periods.map((p: any) => [p.code, `${p.periodMonth}/${p.periodYear}`, fmtDate(p.closeDate), p.isLocked ? "Yes" : "No", p.notes || ""]));
            }
          }}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (activeTab === "bs" && bsData) {
              exportPDF("Balance-Sheet", ["Section", "Item", "Amount"],
                [
                  ["Assets", "Stock Value", String(bsData.assets?.stock || 0)],
                  ["Assets", "Bank Balance", String(bsData.assets?.bankBalance || 0)],
                  ["Assets", "Receivables", String(bsData.assets?.receivables || 0)],
                  ...(bsData.assets?.supplierAdvances > 0 ? [["Assets", "Supplier Advances", String(bsData.assets?.supplierAdvances || 0)]] : []),
                  ["Assets", "Total Assets", String(bsData.assets?.totalAssets || 0)],
                  ["Liabilities", "Payables", String(bsData.liabilities?.payables || 0)],
                  ...(bsData.liabilities?.customerAdvances > 0 ? [["Liabilities", "Customer Advances", String(bsData.liabilities?.customerAdvances || 0)]] : []),
                  ["Liabilities", isVatAuditor ? "Equity (Masked)" : "Equity", isVatAuditor ? "N/A (Audit Mode)" : String(bsData.liabilities?.equity || 0)],
                  ["Liabilities", "Total Liabilities", String(bsData.liabilities?.totalLiabilities || 0)],
                ]);
            } else {
              exportPDF("Period-Close", ["Code", "Period", "Close Date", "Locked", "Notes"],
                periods.map((p: any) => [p.code, `${p.periodMonth}/${p.periodYear}`, fmtDate(p.closeDate), p.isLocked ? "Yes" : "No", p.notes || ""]));
            }
          }}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
          {activeTab === "period" && canModify && (
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openPerCreate}>
              <Plus className="w-4 h-4 mr-1" />Create Period Close
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "bs" | "period")}>
        <TabsList>
          <TabsTrigger value="bs" className="flex items-center gap-1"><Scale className="w-4 h-4" />Balance Sheet</TabsTrigger>
          <TabsTrigger value="period" className="flex items-center gap-1"><Calendar className="w-4 h-4" />Period Close</TabsTrigger>
        </TabsList>

        {/* ============================================ */}
        {/* BALANCE SHEET TAB */}
        {/* ============================================ */}
        <TabsContent value="bs">
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <Label className="text-sm">As Of</Label>
            <Input type="date" value={bsAsOf} onChange={e => setBsAsOf(e.target.value)} className="w-40" />
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={loadBS}>
              <RefreshCw className="w-4 h-4 mr-1" />Generate Report
            </Button>
          </div>

          {bsLoading ? (
            <div className="flex justify-center py-16"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : bsData ? (
            <>
              {/* Balance Check */}
              <div className="flex items-center gap-3 mt-4">
                <Badge className={bsData.balanced ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-3 py-1" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 px-3 py-1"}>
                  {bsData.balanced ? <><CheckCircle className="w-4 h-4 mr-1 inline" />Balanced</> : <><AlertTriangle className="w-4 h-4 mr-1 inline" />Unbalanced</>}
                </Badge>
                <span className="text-sm text-muted-foreground">
                  Total Assets: {fmt(bsData.assets?.totalAssets, "currency")} | Total Liabilities: {fmt(bsData.liabilities?.totalLiabilities, "currency")}
                </span>
              </div>

              {/* Financial Ratios */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">Financial Ratios</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-900/30"><TrendingUp className="w-5 h-5 text-blue-600" /></div>
                      <div>
                        <p className="text-sm text-muted-foreground">Current Ratio</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : ratios.currentRatio}</p>
                        <p className="text-xs text-muted-foreground">Current Assets / Current Liabilities</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/30"><Landmark className="w-5 h-5 text-red-600" /></div>
                      <div>
                        <p className="text-sm text-muted-foreground">Debt-to-Equity</p>
                        <p className="text-xl font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : ratios.debtToEquity}</p>
                        <p className="text-xs text-muted-foreground">Total Liabilities / Equity</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Assets & Liabilities Tables */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Assets */}
                <Card>
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm flex items-center gap-2"><Shield className="w-4 h-4" />Assets</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <Table>
                      <TableHeader><TableRow className="bg-muted/50"><TableHead>Item</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                      <TableBody>
                        <TableRow className="hover:bg-muted/50"><TableCell className="text-slate-900 dark:text-white">Stock Value</TableCell><TableCell className="text-right font-mono">{fmt(bsData.assets?.stock, "currency")}</TableCell></TableRow>
                        <TableRow className="hover:bg-muted/50"><TableCell className="text-slate-900 dark:text-white">Bank Balance</TableCell><TableCell className="text-right font-mono">{fmt(bsData.assets?.bankBalance, "currency")}</TableCell></TableRow>
                        <TableRow className="hover:bg-muted/50"><TableCell className="text-slate-900 dark:text-white">Receivables</TableCell><TableCell className="text-right font-mono">{fmt(bsData.assets?.receivables, "currency")}</TableCell></TableRow>
                        {bsData.assets?.supplierAdvances > 0 && (
                          <TableRow className="hover:bg-muted/50"><TableCell className="text-slate-900 dark:text-white">Supplier Advances</TableCell><TableCell className="text-right font-mono">{fmt(bsData.assets?.supplierAdvances, "currency")}</TableCell></TableRow>
                        )}
                        <TableRow className="bg-blue-50/50 dark:bg-blue-900/10 font-bold"><TableCell className="text-slate-900 dark:text-white">Total Assets</TableCell><TableCell className="text-right font-mono text-blue-700 dark:text-blue-400">{fmt(bsData.assets?.totalAssets, "currency")}</TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Liabilities */}
                <Card>
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm flex items-center gap-2"><Landmark className="w-4 h-4" />Liabilities</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <Table>
                      <TableHeader><TableRow className="bg-muted/50"><TableHead>Item</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
                      <TableBody>
                        <TableRow className="hover:bg-muted/50"><TableCell className="text-slate-900 dark:text-white">Payables</TableCell><TableCell className="text-right font-mono">{fmt(bsData.liabilities?.payables, "currency")}</TableCell></TableRow>
                        {bsData.liabilities?.customerAdvances > 0 && (
                          <TableRow className="hover:bg-muted/50"><TableCell className="text-slate-900 dark:text-white">Customer Advances</TableCell><TableCell className="text-right font-mono">{fmt(bsData.liabilities?.customerAdvances, "currency")}</TableCell></TableRow>
                        )}
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="text-slate-900 dark:text-white">Equity</TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor
                              ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">N/A (Audit Mode)</span>
                              : fmt(bsData.liabilities?.equity, "currency")}
                          </TableCell>
                        </TableRow>
                        <TableRow className="bg-red-50/50 dark:bg-red-900/10 font-bold"><TableCell className="text-slate-900 dark:text-white">Total Liabilities</TableCell><TableCell className="text-right font-mono text-red-700 dark:text-red-400">{fmt(bsData.liabilities?.totalLiabilities, "currency")}</TableCell></TableRow>
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                {/* Asset Composition Pie */}
                {(bsData.assetComposition || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Asset Composition</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={bsData.assetComposition} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {bsData.assetComposition.map((entry: any, i: number) => <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
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
                      <CardTitle className="text-white text-sm">Liability Composition</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={bsData.liabilityComposition} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {bsData.liabilityComposition.map((entry: any, i: number) => <Cell key={i} fill={entry.color || PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Assets vs Liabilities Comparison Bar */}
                {(bsData.comparisonData || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Assets vs Liabilities</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={bsData.comparisonData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="category" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <RechartsTooltip />
                          <Bar dataKey="value" fill="#2563eb" name="Amount" />
                        </BarChart>
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
        {/* PERIOD CLOSE TAB */}
        {/* ============================================ */}
        <TabsContent value="period">
          {/* Read-only notice for non-admin/manager */}
          {!canModify && (
            <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg mt-4">
              <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
              <span className="text-sm text-yellow-700 dark:text-yellow-400 font-medium">
                {isVatAuditor ? "Read-only access. VAT Auditor cannot create, lock, or unlock periods." : "Read-only access."}
              </span>
            </div>
          )}

          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {[
              { label: "Total Periods", value: perStats.total, icon: Calendar, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
              { label: "Locked", value: perStats.locked, icon: Lock, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
              { label: "Unlocked", value: perStats.unlocked, icon: LockOpen, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
              { label: "Latest Close", value: perStats.latest, icon: CheckCircle, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/30" },
            ].map((stat, i) => (
              <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
                <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
              </CardContent></Card>
            ))}
          </div>

          {/* Period Close Table */}
          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Button variant="outline" size="sm" onClick={loadPeriods}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <div className="table-container overflow-auto max-h-[60vh] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Code</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Close Date</TableHead>
                      <TableHead>Closed By</TableHead>
                      <TableHead>Locked</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="w-28 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {perLoading ? (
                      <TableRow><TableCell colSpan={7} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : periods.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No period closes found</TableCell></TableRow>
                    ) : periods.map((item: any) => (
                      <TableRow key={item.id} className="hover:bg-muted/50">
                        <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.code}</TableCell>
                        <TableCell>{item.periodMonth}/{item.periodYear}</TableCell>
                        <TableCell>{fmtDate(item.closeDate)}</TableCell>
                        <TableCell>{item.closedBy || "—"}</TableCell>
                        <TableCell>
                          <Badge className={item.isLocked
                            ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                            : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"}>
                            {item.isLocked ? <><Lock className="w-3 h-3 mr-1 inline" />Locked</> : <><LockOpen className="w-3 h-3 mr-1 inline" />Unlocked</>}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">{item.notes || "—"}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canModify && (
                              <Button variant="outline" size="sm" className={item.isLocked ? "text-green-600 hover:bg-green-50" : "text-red-600 hover:bg-red-50"} onClick={() => toggleLock(item)}>
                                {item.isLocked ? <LockOpen className="w-3.5 h-3.5 mr-1" /> : <Lock className="w-3.5 h-3.5 mr-1" />}
                                {item.isLocked ? "Unlock" : "Lock"}
                              </Button>
                            )}
                            {canModify && !item.isLocked && (
                              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setPerDelete(item)}><Trash2 className="w-3.5 h-3.5" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {periods.length} periods</div>
            </CardContent>
          </Card>

          {/* Red Warning for locked period operations */}
          {perDelete && perDelete.isLocked && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-400 font-medium flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />This period is locked. You must unlock it before deleting.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Period Close Create Dialog */}
      <Dialog open={perForm} onOpenChange={setPerForm}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{perEdit ? "Edit" : "Create"} Period Close</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input className="bg-muted cursor-not-allowed" value={perFormData.code || "Auto-generated"} readOnly />
              </div>
              <div className="space-y-1.5">
                <Label>Period Month <span className="text-red-500">*</span></Label>
                <Select value={String(perFormData.periodMonth || 1)} onValueChange={v => setPerFormData({ ...perFormData, periodMonth: parseInt(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <SelectItem key={m} value={String(m)}>{new Date(2024, m - 1, 1).toLocaleString("en", { month: "long" })}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Period Year <span className="text-red-500">*</span></Label>
                <Input type="number" value={perFormData.periodYear || ""} onChange={e => setPerFormData({ ...perFormData, periodYear: parseInt(e.target.value) || 2025 })} />
              </div>
              <div className="space-y-1.5 flex items-end">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="w-4 h-4 text-red-500" />
                  <span>Period will be <strong>locked</strong> by default</span>
                </div>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={perFormData.notes || ""} onChange={e => setPerFormData({ ...perFormData, notes: e.target.value })} placeholder="Optional notes..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={savePeriod} disabled={perSaving}>
              {perSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}{perEdit ? "Update" : "Create (Lock)"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Period Delete Dialog */}
      <Dialog open={!!perDelete} onOpenChange={() => setPerDelete(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-red-500" />Confirm Delete</DialogTitle></DialogHeader>
          <DialogDescription>
            {perDelete?.isLocked
              ? `Period ${perDelete?.code} is locked. Unlock it first before deleting.`
              : `Delete period ${perDelete?.code} (${perDelete?.periodMonth}/${perDelete?.periodYear})? This cannot be undone.`}
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPerDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deletePeriod} disabled={perDelete?.isLocked}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
