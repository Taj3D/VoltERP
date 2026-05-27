"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Lock, Plus, RefreshCw, Search, Download, FileDown,
  DollarSign, TrendingUp, TrendingDown, BarChart3, FileText,
  CheckCircle, AlertTriangle, Wallet, Landmark, Scale, ArrowUpCircle, ArrowDownCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { exportToPDFSimple, exportToCSVSimple } from "@/lib/export-utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell
} from "recharts";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (type === "currency") return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "percent") return `${Number(v).toFixed(2)}%`;
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
  return { ...authState, isVatAuditor: authState.user?.role === "vat_auditor", isSR: authState.user?.role === "sr", isDealer: authState.user?.role === "dealer", user: authState.user };
}

const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// ============================================================
// AccountingReportsPage Component
// ============================================================

export default function AccountingReportsPage({ initialTab }: { initialTab?: string }) {
  const { toast } = useToast();
  const { isVatAuditor, isSR, isDealer, user } = useAuth();
  const [activeTab, setActiveTab] = useState<"cash" | "trial" | "pl">(() => {
    if (initialTab === "trial-balance") return "trial";
    if (initialTab === "profit-loss") return "pl";
    return "cash";
  });

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

  // ALL hooks must be called before any early returns

  // Load Cash In Hand
  const loadCash = useCallback(async () => {
    setCashLoading(true);
    try {
      const params = new URLSearchParams();
      if (cashFrom) params.set('from', cashFrom);
      if (cashTo) params.set('to', cashTo);
      if (isVatAuditor) params.set('vatMode', 'true');
      const qs = params.toString();
      const url = `/api/reports/cash-in-hand${qs ? '?' + qs : ''}`;
      const res = await apiFetch(url);
      setCashData(res);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setCashLoading(false); }
  }, [toast, cashFrom, cashTo, isVatAuditor]);

  // Load Trial Balance
  const loadTB = useCallback(async () => {
    setTbLoading(true);
    try {
      let url = "/api/reports/trial-balance";
      if (tbFrom || tbTo) url += `?${tbFrom ? `from=${tbFrom}` : ""}${tbFrom && tbTo ? "&" : ""}${tbTo ? `to=${tbTo}` : ""}`;
      const res = await apiFetch(url);
      setTbData(res);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setTbLoading(false); }
  }, [toast, tbFrom, tbTo]);

  // Load P&L
  const loadPL = useCallback(async () => {
    setPlLoading(true);
    try {
      const params = new URLSearchParams();
      if (plFrom) params.set('from', plFrom);
      if (plTo) params.set('to', plTo);
      if (isVatAuditor) params.set('hideMargins', 'true');
      const qs = params.toString();
      const url = `/api/reports/profit-loss${qs ? '?' + qs : ''}`;
      const res = await apiFetch(url);
      setPlData(res);
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setPlLoading(false); }
  }, [toast, plFrom, plTo, isVatAuditor]);

  useEffect(() => { loadCash(); }, [loadCash]);
  useEffect(() => { if (activeTab === "trial") loadTB(); }, [activeTab, loadTB]);
  useEffect(() => { if (activeTab === "pl") loadPL(); }, [activeTab, loadPL]);

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

  // Export functions
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

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Internal cost prices, net margins, and hidden adjustments masked. Only legal outward/inward invoice tax records shown.</span>
        </div>
      )}

      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Accounting Reports
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => {
            if (activeTab === "cash" && cashData) {
              exportCSV("Cash-In-Hand", ["Bank", "Account No", "Opening", "Deposits", "Withdrawals", "Income", "Expense", "Collections", "Deliveries", "Current Balance"],
                (cashData.bankBreakdown || []).map((b: any) => [b.bankName, b.accountNo, String(b.openingBalance), String(b.deposits), String(b.withdrawals), String(b.income), isVatAuditor ? "N/A" : String(b.expense), String(b.collections), String(b.deliveries), String(b.currentBalance)]));
            } else if (activeTab === "trial" && tbData) {
              exportCSV("Trial-Balance", ["Account", "Total Debit", "Total Credit", "Net Balance"],
                (tbData.entries || []).map((e: any) => [e.account, String(e.totalDebit), String(e.totalCredit), String(e.totalDebit - e.totalCredit)]));
            } else if (activeTab === "pl" && plData) {
              exportCSV("Profit-and-Loss", ["Item", "Amount"],
                [["Sales Revenue", String(plData.salesRevenue)], ["Other Income", String(plData.otherIncome)], ["Total Revenue", String(plData.revenue)], ["COGS", String(plData.costOfGoods)], ["Gross Profit", String(plData.grossProfit)], ["Operating Expenses", String(plData.operatingExpenses)], ["Net Profit", isVatAuditor ? "N/A" : String(plData.netProfit)]]);
            }
          }}><Download className="w-4 h-4 mr-1" />Export CSV</Button>
          <Button variant="outline" size="sm" onClick={() => {
            if (activeTab === "cash" && cashData) {
              exportPDF("Cash-In-Hand", ["Bank", "Account No", "Opening", "Deposits", "Withdrawals", "Income", "Expense", "Current Balance"],
                (cashData.bankBreakdown || []).map((b: any) => [b.bankName, b.accountNo, String(b.openingBalance), String(b.deposits), String(b.withdrawals), String(b.income), isVatAuditor ? "N/A" : String(b.expense), String(b.currentBalance)]));
            } else if (activeTab === "trial" && tbData) {
              exportPDF("Trial-Balance", ["Account", "Total Debit", "Total Credit", "Net Balance"],
                (tbData.entries || []).map((e: any) => [e.account, String(e.totalDebit), String(e.totalCredit), String(e.totalDebit - e.totalCredit)]));
            } else if (activeTab === "pl" && plData) {
              exportPDF("Profit-and-Loss", ["Item", "Amount"],
                [["Sales Revenue", String(plData.salesRevenue)], ["Other Income", String(plData.otherIncome)], ["Total Revenue", String(plData.revenue)], ["COGS", String(plData.costOfGoods)], ["Gross Profit", String(plData.grossProfit)], ["Operating Expenses", String(plData.operatingExpenses)], ["Net Profit", isVatAuditor ? "N/A (Audit Mode)" : String(plData.netProfit)]]);
            }
          }}><FileDown className="w-4 h-4 mr-1" />Export PDF</Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "cash" | "trial" | "pl")}>
        <TabsList>
          <TabsTrigger value="cash" className="flex items-center gap-1"><Wallet className="w-4 h-4" />Cash In Hand</TabsTrigger>
          <TabsTrigger value="trial" className="flex items-center gap-1"><Scale className="w-4 h-4" />Trial Balance</TabsTrigger>
          <TabsTrigger value="pl" className="flex items-center gap-1"><TrendingUp className="w-4 h-4" />Profit & Loss</TabsTrigger>
        </TabsList>

        {/* ============================================ */}
        {/* CASH IN HAND TAB */}
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
          </div>

          {cashLoading ? (
            <div className="flex justify-center py-16"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : cashData ? (
            <>
              {/* Stat Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                {[
                  { label: "Total Cash In Hand", value: isVatAuditor ? "N/A (Audit Mode)" : fmt(cashData.totals?.totalCashInHand, "currency"), icon: Wallet, color: "text-green-600", bg: "bg-green-50 dark:bg-green-900/30" },
                  { label: "Total Bank Balance", value: fmt(cashData.bankBreakdown?.reduce((s: number, b: any) => s + b.currentBalance, 0), "currency"), icon: Landmark, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
                  { label: "Total Receivables", value: fmt(cashData.totals?.cashCollections, "currency"), icon: ArrowUpCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
                  { label: "Net Cash Position", value: isVatAuditor ? "N/A (Audit Mode)" : fmt(cashData.totals?.totalCashInHand, "currency"), icon: DollarSign, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/30" },
                ].map((stat, i) => (
                  <Card key={i} className="stat-mini-card"><CardContent className="p-3 flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}><stat.icon className="w-4 h-4" /></div>
                    <div><p className="text-xs text-muted-foreground">{stat.label}</p><p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p></div>
                  </CardContent></Card>
                ))}
              </div>

              {/* Cash Flow Trend Chart */}
              {(cashData.dailyFlow || []).length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm">Cash Flow Trend (Last 30 Days)</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
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
                  </CardContent>
                </Card>
              )}

              {/* Bank-by-Bank Breakdown Table */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">Bank-by-Bank Breakdown</CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="table-container overflow-auto max-h-[40vh] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Bank Name</TableHead>
                          <TableHead>Account No</TableHead>
                          <TableHead className="text-right">Opening Balance</TableHead>
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
                            <TableCell className="text-right font-mono">{isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">N/A (Audit Mode)</span> : fmt(b.expense, "currency")}</TableCell>
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

              {/* Income vs Expense Comparison Chart */}
              {(cashData.incomeVsExpense || []).length > 0 && (
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                    <CardTitle className="text-white text-sm">Income vs Expense Comparison</CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
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
                    <div className="table-container overflow-auto max-h-[30vh] rounded-md border">
                      <Table>
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
        {/* TRIAL BALANCE TAB */}
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
          </div>

          {tbLoading ? (
            <div className="flex justify-center py-16"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : tbData ? (
            <>
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
                  <div className="table-container overflow-auto max-h-[50vh] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead>Account Name</TableHead>
                          <TableHead className="text-right">Total Debit</TableHead>
                          <TableHead className="text-right">Total Credit</TableHead>
                          {!isVatAuditor && <TableHead className="text-right">Net Balance</TableHead>}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(tbData.entries || []).length === 0 ? (
                          <TableRow><TableCell colSpan={isVatAuditor ? 3 : 4} className="h-16 text-center text-muted-foreground">No entries</TableCell></TableRow>
                        ) : (
                          <>
                            {tbData.entries.map((e: any, i: number) => (
                              <TableRow key={i} className="hover:bg-muted/50">
                                <TableCell className="font-medium text-slate-900 dark:text-white">{e.account}</TableCell>
                                <TableCell className="text-right font-mono">{fmt(e.totalDebit, "currency")}</TableCell>
                                <TableCell className="text-right font-mono">{fmt(e.totalCredit, "currency")}</TableCell>
                                {!isVatAuditor && (
                                  <TableCell className="text-right font-mono font-bold">
                                    {e.totalDebit > e.totalCredit ? fmt(e.totalDebit - e.totalCredit, "currency") + " Dr" : fmt(e.totalCredit - e.totalDebit, "currency") + " Cr"}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                            {/* Grand Total Row */}
                            <TableRow className="bg-muted/50 font-bold">
                              <TableCell className="text-slate-900 dark:text-white">Grand Total</TableCell>
                              <TableCell className="text-right font-mono">{fmt(tbData.grandTotalDebit, "currency")}</TableCell>
                              <TableCell className="text-right font-mono">{fmt(tbData.grandTotalCredit, "currency")}</TableCell>
                              {!isVatAuditor && (
                                <TableCell className="text-right font-mono">
                                  {Math.abs(tbData.grandTotalDebit - tbData.grandTotalCredit) < 0.01 ? (
                                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Balanced</Badge>
                                  ) : (
                                    <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Unbalanced: {fmt(Math.abs(tbData.grandTotalDebit - tbData.grandTotalCredit), "currency")}</Badge>
                                  )}
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

              {/* Charts Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Top 10 Accounts Bar Chart */}
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

                {/* Account Balance Distribution Pie */}
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
        {/* PROFIT & LOSS TAB */}
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
          </div>

          {plLoading ? (
            <div className="flex justify-center py-16"><RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" /></div>
          ) : plData ? (
            <>
              {/* P&L Statement Table */}
              <Card className="mt-4">
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">Profit & Loss Statement</CardTitle>
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

                        {/* COGS Section */}
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

                        {/* Operating Expenses */}
                        <TableRow className="bg-amber-50/50 dark:bg-amber-900/10">
                          <TableCell colSpan={2} className="font-bold text-amber-700 dark:text-amber-400">OPERATING EXPENSES</TableCell>
                        </TableRow>
                        {(plData.expenseDetails || []).map((e: any, i: number) => (
                          <TableRow key={i} className="hover:bg-muted/50">
                            <TableCell className="pl-6 text-slate-900 dark:text-white">{e.head}</TableCell>
                            <TableCell className="text-right font-mono">{isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">N/A (Audit Mode)</span> : fmt(e.amount, "currency")}</TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="hover:bg-muted/50 font-semibold">
                          <TableCell className="text-slate-900 dark:text-white">Total Operating Expenses</TableCell>
                          <TableCell className="text-right font-mono">{isVatAuditor ? <span className="text-amber-600 dark:text-amber-400 text-xs italic">N/A (Audit Mode)</span> : fmt(plData.operatingExpenses, "currency")}</TableCell>
                        </TableRow>

                        {/* Net Profit */}
                        <TableRow className="bg-purple-50/50 dark:bg-purple-900/10 font-bold border-t-2 border-purple-300">
                          <TableCell className="text-slate-900 dark:text-white">Net Profit</TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor
                              ? <span className="text-amber-600 dark:text-amber-400">N/A (Audit Mode)</span>
                              : <span className={plData.netProfit >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>{fmt(plData.netProfit, "currency")}</span>}
                          </TableCell>
                        </TableRow>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell className="pl-6 italic text-muted-foreground">Net Profit Margin</TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor
                              ? <span className="text-amber-600 dark:text-amber-400">N/A (Audit Mode)</span>
                              : fmt(plData.netProfitMargin, "percent")}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* Charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                {/* Monthly Trend */}
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

                {/* Income by Head Pie */}
                {(plData.incomeDetails || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Income by Head</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={plData.incomeDetails.map((d: any) => ({ name: d.head, value: d.amount }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {plData.incomeDetails.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                          </Pie>
                          <RechartsTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                )}

                {/* Expense by Head Pie */}
                {(plData.expenseDetails || []).length > 0 && (
                  <Card>
                    <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                      <CardTitle className="text-white text-sm">Expense by Head</CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={plData.expenseDetails.map((d: any) => ({ name: d.head, value: d.amount }))} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }: any) => `${name} (${(percent * 100).toFixed(0)}%)`}>
                            {plData.expenseDetails.map((_: any, i: number) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
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
      </Tabs>
    </div>
  );
}
