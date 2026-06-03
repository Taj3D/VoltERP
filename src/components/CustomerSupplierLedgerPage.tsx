"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Lock, Search, RefreshCw, Download, FileDown, Upload, FileText,
  Users, UserCircle, TrendingUp, AlertTriangle, ChevronDown, ChevronUp,
  CreditCard, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { exportToPDFSimple, exportToCSVSimple, importFromCSV } from "@/lib/export-utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (type === "currency") return `৳${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "percent") return `${Number(v).toFixed(2)}%`;
  return String(v);
};

const fmtDate = (d: string | Date) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

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
interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

let authState = { isAuthenticated: false, user: null as AuthUser | null };
let authListeners: Array<() => void> = [];

function useAuth() {
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const listener = () => forceUpdate({});
    authListeners.push(listener);
    return () => {
      authListeners = authListeners.filter((l) => l !== listener);
    };
  }, []);
  useEffect(() => {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        authState = parsed;
        authListeners.forEach((l) => l());
      } catch {}
    }
  }, []);
  return {
    ...authState,
    isVatAuditor: authState.user?.role === "vat_auditor",
    isSR: authState.user?.role === "sr",
    isDealer: authState.user?.role === "dealer",
    user: authState.user,
  };
}

// ============================================================
// CONSTANTS
// ============================================================

const PIE_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#ec4899", "#14b8a6", "#f97316",
];

const AGING_COLORS = {
  current: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "31-60": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  "61-90": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "90+": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

const AGING_CHART_COLORS = {
  current: "#10b981",
  "31-60": "#f59e0b",
  "61-90": "#f97316",
  "90+": "#ef4444",
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function CustomerSupplierLedgerPage({
  initialTab,
}: {
  initialTab?: "customer" | "supplier" | "aging";
}) {
  const { toast } = useToast();
  const { isVatAuditor, isSR, isDealer, user } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState<"customer" | "supplier" | "aging">(
    () => initialTab || "customer"
  );

  // ── Customer Ledger State ─────────────────────────────
  const [custList, setCustList] = useState<any[]>([]);
  const [custSelected, setCustSelected] = useState("");
  const [custFrom, setCustFrom] = useState("");
  const [custTo, setCustTo] = useState("");
  const [custViewMode, setCustViewMode] = useState<"individual" | "summary">("individual");
  const [custLedger, setCustLedger] = useState<any>(null);
  const [custSummary, setCustSummary] = useState<any>(null);
  const [custLoading, setCustLoading] = useState(false);
  const [custSortCol, setCustSortCol] = useState<string>("");
  const [custSortDir, setCustSortDir] = useState<"asc" | "desc">("asc");

  // ── Supplier Ledger State ─────────────────────────────
  const [supList, setSupList] = useState<any[]>([]);
  const [supSelected, setSupSelected] = useState("");
  const [supFrom, setSupFrom] = useState("");
  const [supTo, setSupTo] = useState("");
  const [supViewMode, setSupViewMode] = useState<"individual" | "summary">("individual");
  const [supLedger, setSupLedger] = useState<any>(null);
  const [supSummary, setSupSummary] = useState<any>(null);
  const [supLoading, setSupLoading] = useState(false);
  const [supSortCol, setSupSortCol] = useState<string>("");
  const [supSortDir, setSupSortDir] = useState<"asc" | "desc">("asc");

  // ── Aging State ───────────────────────────────────────
  const [agingEntityType, setAgingEntityType] = useState<"customer" | "supplier">("customer");
  const [agingData, setAgingData] = useState<any>(null);
  const [agingLoading, setAgingLoading] = useState(false);
  const [agingFrom, setAgingFrom] = useState("");
  const [agingTo, setAgingTo] = useState("");
  const [drillDownEntity, setDrillDownEntity] = useState<any>(null);

  // ── Load Customer List ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/customers");
        const list = Array.isArray(res) ? res : res.data || [];
        setCustList(list);
      } catch {}
    })();
  }, []);

  // ── Load Supplier List ────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch("/api/suppliers");
        const list = Array.isArray(res) ? res : res.data || [];
        setSupList(list);
      } catch {}
    })();
  }, []);

  // ── Generate Customer Ledger ──────────────────────────
  const generateCustLedger = useCallback(async () => {
    if (custViewMode === "individual" && !custSelected) {
      toast({ title: "Select Customer", description: "Please select a customer first", variant: "destructive" });
      return;
    }
    setCustLoading(true);
    try {
      const type = custViewMode === "individual" ? "customer" : "customer-summary";
      let url = `/api/ledger-reports?type=${type}`;
      if (custViewMode === "individual") url += `&customerId=${custSelected}`;
      if (custFrom) url += `&from=${custFrom}`;
      if (custTo) url += `&to=${custTo}`;
      if (isVatAuditor) url += `&vatMode=true`;
      const res = await apiFetch(url);
      if (custViewMode === "individual") {
        setCustLedger(res);
        setCustSummary(null);
      } else {
        setCustSummary(res);
        setCustLedger(null);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCustLoading(false);
    }
  }, [custViewMode, custSelected, custFrom, custTo, isVatAuditor, toast]);

  // ── Generate Supplier Ledger ──────────────────────────
  const generateSupLedger = useCallback(async () => {
    if (supViewMode === "individual" && !supSelected) {
      toast({ title: "Select Supplier", description: "Please select a supplier first", variant: "destructive" });
      return;
    }
    setSupLoading(true);
    try {
      const type = supViewMode === "individual" ? "supplier" : "supplier-summary";
      let url = `/api/ledger-reports?type=${type}`;
      if (supViewMode === "individual") url += `&supplierId=${supSelected}`;
      if (supFrom) url += `&from=${supFrom}`;
      if (supTo) url += `&to=${supTo}`;
      if (isVatAuditor) url += `&vatMode=true`;
      const res = await apiFetch(url);
      if (supViewMode === "individual") {
        setSupLedger(res);
        setSupSummary(null);
      } else {
        setSupSummary(res);
        setSupLedger(null);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSupLoading(false);
    }
  }, [supViewMode, supSelected, supFrom, supTo, isVatAuditor, toast]);

  // ── Generate Aging ────────────────────────────────────
  const generateAging = useCallback(async () => {
    setAgingLoading(true);
    try {
      const type = agingEntityType === "customer" ? "customer-aging" : "supplier-aging";
      let url = `/api/ledger-reports?type=${type}`;
      if (isVatAuditor) url += `&vatMode=true`;
      const res = await apiFetch(url);
      setAgingData(res);
      setDrillDownEntity(null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAgingLoading(false);
    }
  }, [agingEntityType, isVatAuditor, toast]);

  // ── Export Helpers ────────────────────────────────────
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

  const handleImportCSV = () => {
    importFromCSV({
      apiPath: "/api/ledger-reports",
      formFields: [
        { key: "type", label: "Type", type: "text", required: true },
        { key: "date", label: "Date", type: "date", required: true },
        { key: "account", label: "Account", type: "text", required: true },
        { key: "particulars", label: "Particulars", type: "text" },
        { key: "debit", label: "Debit", type: "number" },
        { key: "credit", label: "Credit", type: "number" },
        { key: "reference", label: "Reference", type: "text" },
        { key: "referenceType", label: "Reference Type", type: "text" },
      ],
    }).then(result => {
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
    }).catch((e: any) => {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    });
  };

  // ── Sort helpers for summary tables ───────────────────
  const handleCustSort = (col: string) => {
    if (custSortCol === col) {
      setCustSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setCustSortCol(col);
      setCustSortDir("asc");
    }
  };

  const handleSupSort = (col: string) => {
    if (supSortCol === col) {
      setSupSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSupSortCol(col);
      setSupSortDir("asc");
    }
  };

  // Sorted customer summary
  const sortedCustSummary = useMemo(() => {
    if (!custSummary?.data) return [];
    const data = [...custSummary.data];
    if (!custSortCol) return data;
    data.sort((a: any, b: any) => {
      const av = a[custSortCol] ?? 0;
      const bv = b[custSortCol] ?? 0;
      if (typeof av === "number" && typeof bv === "number") {
        return custSortDir === "asc" ? av - bv : bv - av;
      }
      return custSortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return data;
  }, [custSummary, custSortCol, custSortDir]);

  // Sorted supplier summary
  const sortedSupSummary = useMemo(() => {
    if (!supSummary?.data) return [];
    const data = [...supSummary.data];
    if (!supSortCol) return data;
    data.sort((a: any, b: any) => {
      const av = a[supSortCol] ?? 0;
      const bv = b[supSortCol] ?? 0;
      if (typeof av === "number" && typeof bv === "number") {
        return supSortDir === "asc" ? av - bv : bv - av;
      }
      return supSortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });
    return data;
  }, [supSummary, supSortCol, supSortDir]);

  // Aging chart data
  const agingBarData = useMemo(() => {
    if (!agingData?.data) return [];
    return agingData.data.map((d: any) => ({
      name: d.customerName || d.supplierName || "",
      Current: d.current || 0,
      "31-60d": d.days31to60 || 0,
      "61-90d": d.days61to90 || 0,
      "90+d": d.days90plus || 0,
    }));
  }, [agingData]);

  const agingPieData = useMemo(() => {
    if (!agingData?.totals) return [];
    const t = agingData.totals;
    return [
      { name: "Current (0-30d)", value: t.current || 0 },
      { name: "31-60 Days", value: t.days31to60 || 0 },
      { name: "61-90 Days", value: t.days61to90 || 0 },
      { name: "90+ Days", value: t.days90plus || 0 },
    ].filter((d) => d.value > 0);
  }, [agingData]);

  // ── RBAC: Dealer => 403 for entire component ──────────
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-red-300 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              403 - Access Denied
            </h3>
            <p className="text-muted-foreground">
              Dealer accounts do not have permission to access Ledger Reports.
              Contact your administrator.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Credit utilization color ──────────────────────────
  const getUtilColor = (pct: number) => {
    if (pct > 90) return "red";
    if (pct > 70) return "yellow";
    return "green";
  };

  const getProgressClass = (pct: number) => {
    if (pct > 90) return "[&>div]:bg-red-500";
    if (pct > 70) return "[&>div]:bg-yellow-500";
    return "[&>div]:bg-green-500";
  };

  // ── Sort icon helper ──────────────────────────────────
  const sortIcon = (col: string, currentCol: string, dir: "asc" | "desc") =>
    currentCol === col ? (
      dir === "asc" ? (
        <ChevronUp className="w-3 h-3 inline" />
      ) : (
        <ChevronDown className="w-3 h-3 inline" />
      )
    ) : null;

  // ============================================================
  // RENDER: Customer Individual Statement
  // ============================================================
  const renderCustIndividual = () => {
    if (!custLedger) return null;
    const c = custLedger.customer || {};
    const ob = Number(custLedger.openingBalance || 0);
    const obType = custLedger.openingBalanceType || "Dr";
    const cb = Number(custLedger.closingBalance || 0);
    const cbType = custLedger.closingBalanceType || "Dr";
    const creditLimit = Number(c.creditLimit || 0);
    const utilization =
      creditLimit > 0 ? Math.round((Math.abs(cb) / creditLimit) * 100) : 0;
    const aging = custLedger.aging || {};

    return (
      <div className="space-y-4 mt-4">
        {/* Customer Info Card */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <UserCircle className="w-4 h-4" />
              Customer Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name</span>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {c.name}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Code</span>
                <p className="font-mono font-semibold text-slate-900 dark:text-white">
                  {c.customerCode}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <p className="text-slate-900 dark:text-white">
                  {c.phone || "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Credit Limit</span>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {fmt(creditLimit, "currency")}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Opening Balance</span>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {fmt(ob, "currency")} {obType}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transaction Table */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Transaction Statement
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="table-container overflow-x-auto overflow-y-auto max-h-[55vh] rounded-b-lg border -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Reference No</TableHead>
                    <TableHead>Reference Type</TableHead>
                    <TableHead className="text-right">Debit (৳)</TableHead>
                    <TableHead className="text-right">Credit (৳)</TableHead>
                    <TableHead className="text-right">Balance (৳)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening Balance Row */}
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell colSpan={3} className="italic">
                      Opening Balance
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {obType === "Dr" ? fmt(ob, "currency") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {obType === "Cr" ? fmt(ob, "currency") : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-bold ${
                        obType === "Dr"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {fmt(ob, "currency")} {obType}
                    </TableCell>
                  </TableRow>

                  {/* Transaction Rows */}
                  {(custLedger.transactions || []).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-16 text-center text-muted-foreground"
                      >
                        No transactions in this period
                      </TableCell>
                    </TableRow>
                  ) : (
                    custLedger.transactions.map((txn: any, i: number) => {
                      const bal = Number(txn.runningBalance || 0);
                      return (
                        <TableRow key={i} className="hover:bg-muted/50">
                          <TableCell>{fmtDate(txn.date)}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {txn.referenceNo}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {txn.referenceType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {txn.debit > 0 ? fmt(txn.debit, "currency") : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {txn.credit > 0
                              ? fmt(txn.credit, "currency")
                              : "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono font-semibold ${
                              bal >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {fmt(Math.abs(bal), "currency")}{" "}
                            {bal >= 0 ? "Dr" : "Cr"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}

                  {/* Closing Balance Row */}
                  <TableRow className="bg-muted/50 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                    <TableCell colSpan={3} className="font-bold">
                      Closing Balance
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {cbType === "Dr" ? fmt(Math.abs(cb), "currency") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {cbType === "Cr" ? fmt(Math.abs(cb), "currency") : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-bold ${
                        cb >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {fmt(Math.abs(cb), "currency")} {cbType}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Bottom Cards: Aging Summary + Credit Utilization */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Aging Summary Card */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Aging Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Current (0-30d)",
                    value: aging.current || 0,
                    cls: AGING_COLORS.current,
                  },
                  {
                    label: "31-60 Days",
                    value: aging.days31to60 || 0,
                    cls: AGING_COLORS["31-60"],
                  },
                  {
                    label: "61-90 Days",
                    value: aging.days61to90 || 0,
                    cls: AGING_COLORS["61-90"],
                  },
                  {
                    label: "90+ Days",
                    value: aging.days90plus || 0,
                    cls: AGING_COLORS["90+"],
                  },
                ].map((bucket, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        {bucket.label}
                      </span>
                      <Badge className={bucket.cls}>
                        {fmt(bucket.value, "currency")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Credit Utilization Card */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Credit Utilization
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outstanding Balance</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {fmt(Math.abs(cb), "currency")}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Credit Limit</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {fmt(creditLimit, "currency")}
                </span>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Utilization</span>
                  <span
                    className={`font-bold text-${
                      getUtilColor(utilization)
                    }-600`}
                  >
                    {fmt(utilization, "percent")}
                  </span>
                </div>
                <Progress
                  value={Math.min(utilization, 100)}
                  className={`h-3 ${getProgressClass(utilization)}`}
                />
              </div>
              {utilization > 100 && (
                <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-700 dark:text-red-400">
                    Credit limit exceeded by {fmt(Math.abs(cb) - creditLimit, "currency")}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ============================================================
  // RENDER: Customer Summary View
  // ============================================================
  const renderCustSummary = () => {
    if (!custSummary) return null;
    const data = sortedCustSummary;

    return (
      <Card className="mt-4">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Customer Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="table-container overflow-x-auto overflow-y-auto max-h-[55vh] rounded-b-lg border -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleCustSort("customerCode")}
                  >
                    Code {sortIcon("customerCode", custSortCol, custSortDir)}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleCustSort("customerName")}
                  >
                    Name {sortIcon("customerName", custSortCol, custSortDir)}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => handleCustSort("totalSales")}
                  >
                    Total Sales{" "}
                    {sortIcon("totalSales", custSortCol, custSortDir)}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => handleCustSort("totalCollections")}
                  >
                    Collections{" "}
                    {sortIcon("totalCollections", custSortCol, custSortDir)}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => handleCustSort("totalReturns")}
                  >
                    Returns{" "}
                    {sortIcon("totalReturns", custSortCol, custSortDir)}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => handleCustSort("balance")}
                  >
                    Balance {sortIcon("balance", custSortCol, custSortDir)}
                  </TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => handleCustSort("creditUtilization")}
                  >
                    Utilization{" "}
                    {sortIcon("creditUtilization", custSortCol, custSortDir)}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={8}
                      className="h-16 text-center text-muted-foreground"
                    >
                      No customer data
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((c: any, i: number) => {
                    const bal = Number(c.balance || 0);
                    const limit = Number(c.creditLimit || 0);
                    const util =
                      typeof c.creditUtilization === "number"
                        ? c.creditUtilization
                        : limit > 0
                          ? Math.round((Math.abs(bal) / limit) * 100)
                          : 0;
                    const overLimit = limit > 0 && Math.abs(bal) > limit;
                    return (
                      <TableRow
                        key={i}
                        className={`hover:bg-muted/50 ${overLimit ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}
                      >
                        <TableCell className="font-mono text-xs">
                          {c.customerCode}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white">
                          {c.customerName}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(c.totalSales, "currency")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">
                          {fmt(c.totalCollections, "currency")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {fmt(c.totalReturns, "currency")}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono font-semibold ${bal >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {fmt(Math.abs(bal), "currency")}{" "}
                          {bal >= 0 ? "Dr" : "Cr"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(limit, "currency")}
                        </TableCell>
                        <TableCell className="text-right">
                          {isVatAuditor ? (
                            <span className="text-amber-600 dark:text-amber-400 text-xs italic">
                              N/A (Audit Mode)
                            </span>
                          ) : (
                            <div className="flex items-center gap-1 justify-end">
                              <Progress
                                value={Math.min(util, 100)}
                                className={`h-2 w-16 ${getProgressClass(util)}`}
                              />
                              <span
                                className={`text-xs font-semibold text-${getUtilColor(util)}-600`}
                              >
                                {util}%
                              </span>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============================================================
  // RENDER: Supplier Individual Statement
  // ============================================================
  const renderSupIndividual = () => {
    if (!supLedger) return null;
    const s = supLedger.supplier || {};
    const ob = Number(supLedger.openingBalance || 0);
    const obType = supLedger.openingBalanceType || "Cr";
    const cb = Number(supLedger.closingBalance || 0);
    const cbType = supLedger.closingBalanceType || "Cr";
    const creditLimit = Number(s.creditLimit || 0);
    const utilization =
      creditLimit > 0 ? Math.round((Math.abs(cb) / creditLimit) * 100) : 0;
    const aging = supLedger.aging || {};

    return (
      <div className="space-y-4 mt-4">
        {/* Supplier Info Card */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Users className="w-4 h-4" />
              Supplier Information
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Name</span>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {s.name}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Code</span>
                <p className="font-mono font-semibold text-slate-900 dark:text-white">
                  {s.supplierCode}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Phone</span>
                <p className="text-slate-900 dark:text-white">
                  {s.phone || "—"}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Credit Limit</span>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {fmt(creditLimit, "currency")}
                </p>
              </div>
              <div>
                <span className="text-muted-foreground">Opening Balance</span>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {fmt(ob, "currency")} {obType}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transaction Table */}
        <Card>
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Transaction Statement
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="table-container overflow-x-auto overflow-y-auto max-h-[55vh] rounded-b-lg border -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>Reference No</TableHead>
                    <TableHead>Reference Type</TableHead>
                    <TableHead className="text-right">Debit (৳)</TableHead>
                    <TableHead className="text-right">Credit (৳)</TableHead>
                    <TableHead className="text-right">Balance (৳)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening Balance Row */}
                  <TableRow className="bg-muted/30 font-medium">
                    <TableCell colSpan={3} className="italic">
                      Opening Balance
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {obType === "Dr" ? fmt(ob, "currency") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {obType === "Cr" ? fmt(ob, "currency") : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-bold ${
                        obType === "Cr"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {fmt(ob, "currency")} {obType}
                    </TableCell>
                  </TableRow>

                  {/* Transaction Rows */}
                  {(supLedger.transactions || []).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="h-16 text-center text-muted-foreground"
                      >
                        No transactions in this period
                      </TableCell>
                    </TableRow>
                  ) : (
                    supLedger.transactions.map((txn: any, i: number) => {
                      const bal = Number(txn.runningBalance || 0);
                      return (
                        <TableRow key={i} className="hover:bg-muted/50">
                          <TableCell>{fmtDate(txn.date)}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {txn.referenceNo}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">
                              {txn.referenceType}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {txn.debit > 0 ? fmt(txn.debit, "currency") : "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {txn.credit > 0
                              ? fmt(txn.credit, "currency")
                              : "—"}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono font-semibold ${
                              bal >= 0 ? "text-green-600" : "text-red-600"
                            }`}
                          >
                            {fmt(Math.abs(bal), "currency")}{" "}
                            {bal >= 0 ? "Cr" : "Dr"}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}

                  {/* Closing Balance Row */}
                  <TableRow className="bg-muted/50 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                    <TableCell colSpan={3} className="font-bold">
                      Closing Balance
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {cbType === "Dr" ? fmt(Math.abs(cb), "currency") : "—"}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {cbType === "Cr" ? fmt(Math.abs(cb), "currency") : "—"}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-bold ${
                        cb >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {fmt(Math.abs(cb), "currency")} {cb >= 0 ? "Cr" : "Dr"}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* Bottom Cards: Aging Summary + Credit Utilization */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Aging Summary Card */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Aging Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  {
                    label: "Current (0-30d)",
                    value: aging.current || 0,
                    cls: AGING_COLORS.current,
                  },
                  {
                    label: "31-60 Days",
                    value: aging.days31to60 || 0,
                    cls: AGING_COLORS["31-60"],
                  },
                  {
                    label: "61-90 Days",
                    value: aging.days61to90 || 0,
                    cls: AGING_COLORS["61-90"],
                  },
                  {
                    label: "90+ Days",
                    value: aging.days90plus || 0,
                    cls: AGING_COLORS["90+"],
                  },
                ].map((bucket, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg border bg-muted/30"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">
                        {bucket.label}
                      </span>
                      <Badge className={bucket.cls}>
                        {fmt(bucket.value, "currency")}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Credit Utilization Card */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                Credit Utilization
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Outstanding Balance</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {fmt(Math.abs(cb), "currency")}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Credit Limit</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {fmt(creditLimit, "currency")}
                </span>
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">Utilization</span>
                  <span
                    className={`font-bold text-${
                      getUtilColor(utilization)
                    }-600`}
                  >
                    {fmt(utilization, "percent")}
                  </span>
                </div>
                <Progress
                  value={Math.min(utilization, 100)}
                  className={`h-3 ${getProgressClass(utilization)}`}
                />
              </div>
              {utilization > 100 && (
                <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-700 dark:text-red-400">
                    Credit limit exceeded by {fmt(Math.abs(cb) - creditLimit, "currency")}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ============================================================
  // RENDER: Supplier Summary View
  // ============================================================
  const renderSupSummary = () => {
    if (!supSummary) return null;
    const data = sortedSupSummary;

    return (
      <Card className="mt-4">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Users className="w-4 h-4" />
            Supplier Summary
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="table-container overflow-x-auto overflow-y-auto max-h-[55vh] rounded-b-lg border -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSupSort("supplierCode")}
                  >
                    Code {sortIcon("supplierCode", supSortCol, supSortDir)}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer"
                    onClick={() => handleSupSort("supplierName")}
                  >
                    Name {sortIcon("supplierName", supSortCol, supSortDir)}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => handleSupSort("totalPurchases")}
                  >
                    Total Purchases{" "}
                    {sortIcon("totalPurchases", supSortCol, supSortDir)}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => handleSupSort("totalDeliveries")}
                  >
                    Deliveries{" "}
                    {sortIcon("totalDeliveries", supSortCol, supSortDir)}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => handleSupSort("totalReturns")}
                  >
                    Returns{" "}
                    {sortIcon("totalReturns", supSortCol, supSortDir)}
                  </TableHead>
                  <TableHead
                    className="text-right cursor-pointer"
                    onClick={() => handleSupSort("balance")}
                  >
                    Balance {sortIcon("balance", supSortCol, supSortDir)}
                  </TableHead>
                  <TableHead className="text-right">Credit Limit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-16 text-center text-muted-foreground"
                    >
                      No supplier data
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((s: any, i: number) => {
                    const bal = Number(s.balance || 0);
                    const limit = Number(s.creditLimit || 0);
                    const overLimit = limit > 0 && Math.abs(bal) > limit;
                    return (
                      <TableRow
                        key={i}
                        className={`hover:bg-muted/50 ${overLimit ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}
                      >
                        <TableCell className="font-mono text-xs">
                          {s.supplierCode}
                        </TableCell>
                        <TableCell className="font-medium text-slate-900 dark:text-white">
                          {s.supplierName}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(s.totalPurchases, "currency")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-red-600">
                          {fmt(s.totalDeliveries, "currency")}
                        </TableCell>
                        <TableCell className="text-right font-mono text-green-600">
                          {fmt(s.totalReturns, "currency")}
                        </TableCell>
                        <TableCell
                          className={`text-right font-mono font-semibold ${bal >= 0 ? "text-green-600" : "text-red-600"}`}
                        >
                          {fmt(Math.abs(bal), "currency")}{" "}
                          {bal >= 0 ? "Cr" : "Dr"}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {fmt(limit, "currency")}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    );
  };

  // ============================================================
  // RENDER: Aging Analysis Tab
  // ============================================================
  const renderAgingTab = () => (
    <div className="space-y-4">
      {/* Filter Panel */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label className="text-sm">Entity Type</Label>
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant={agingEntityType === "customer" ? "default" : "outline"}
                className={
                  agingEntityType === "customer"
                    ? "bg-[#2563eb] hover:bg-[#1d4ed8]"
                    : ""
                }
                onClick={() => setAgingEntityType("customer")}
              >
                Customer
              </Button>
              <Button
                size="sm"
                variant={agingEntityType === "supplier" ? "default" : "outline"}
                className={
                  agingEntityType === "supplier"
                    ? "bg-[#2563eb] hover:bg-[#1d4ed8]"
                    : ""
                }
                onClick={() => setAgingEntityType("supplier")}
              >
                Supplier
              </Button>
            </div>
            <Label className="text-sm">From</Label>
            <Input
              type="date"
              value={agingFrom}
              onChange={(e) => setAgingFrom(e.target.value)}
              className="w-40"
            />
            <Label className="text-sm">To</Label>
            <Input
              type="date"
              value={agingTo}
              onChange={(e) => setAgingTo(e.target.value)}
              className="w-40"
            />
            <Button
              size="sm"
              className="bg-[#2563eb] hover:bg-[#1d4ed8]"
              onClick={generateAging}
              disabled={agingLoading}
            >
              <RefreshCw
                className={`w-4 h-4 mr-1 ${agingLoading ? "animate-spin" : ""}`}
              />
              Generate
            </Button>
          </div>
        </CardContent>
      </Card>

      {agingLoading ? (
        <div className="flex justify-center py-16">
          <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      ) : agingData ? (
        <>
          {/* Stat Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              {
                label: "Total Outstanding",
                value: fmt(agingData.totals?.totalOutstanding, "currency"),
                icon: DollarSign,
                color: "text-blue-600",
                bg: "bg-blue-50 dark:bg-blue-900/30",
              },
              {
                label: "Current (0-30d)",
                value: fmt(agingData.totals?.current, "currency"),
                icon: TrendingUp,
                color: "text-green-600",
                bg: "bg-green-50 dark:bg-green-900/30",
              },
              {
                label: "31-60 Days",
                value: fmt(agingData.totals?.days31to60, "currency"),
                icon: AlertTriangle,
                color: "text-yellow-600",
                bg: "bg-yellow-50 dark:bg-yellow-900/30",
              },
              {
                label: "61-90 Days",
                value: fmt(agingData.totals?.days61to90, "currency"),
                icon: AlertTriangle,
                color: "text-orange-600",
                bg: "bg-orange-50 dark:bg-orange-900/30",
              },
              {
                label: "90+ Days",
                value: fmt(agingData.totals?.days90plus, "currency"),
                icon: Lock,
                color: "text-red-600",
                bg: "bg-red-50 dark:bg-red-900/30",
              },
            ].map((stat, i) => (
              <Card key={i} className="stat-mini-card">
                <CardContent className="p-3 flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {stat.value}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Aging Table */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
              <CardTitle className="text-white text-sm">
                {agingEntityType === "customer"
                  ? "Customer"
                  : "Supplier"}{" "}
                Aging Analysis
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="table-container overflow-x-auto overflow-y-auto max-h-[55vh] rounded-b-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead className="text-right">
                        Total Outstanding
                      </TableHead>
                      <TableHead className="text-right">Current (0-30d)</TableHead>
                      <TableHead className="text-right">31-60 Days</TableHead>
                      <TableHead className="text-right">61-90 Days</TableHead>
                      <TableHead className="text-right">90+ Days</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(agingData.data || []).length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="h-16 text-center text-muted-foreground"
                        >
                          No outstanding balances found
                        </TableCell>
                      </TableRow>
                    ) : (
                      <>
                        {agingData.data.map((row: any, i: number) => (
                          <TableRow
                            key={i}
                            className="hover:bg-muted/50 cursor-pointer"
                            onClick={() => setDrillDownEntity(row)}
                          >
                            <TableCell className="font-mono text-xs">
                              {row.customerCode || row.supplierCode}
                            </TableCell>
                            <TableCell className="font-medium text-slate-900 dark:text-white">
                              {row.customerName || row.supplierName}
                            </TableCell>
                            <TableCell className="text-right font-mono font-semibold">
                              {fmt(row.totalOutstanding, "currency")}
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <Badge className={AGING_COLORS.current}>
                                {fmt(row.current, "currency")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <Badge className={AGING_COLORS["31-60"]}>
                                {fmt(row.days31to60, "currency")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <Badge className={AGING_COLORS["61-90"]}>
                                {fmt(row.days61to90, "currency")}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              <Badge className={AGING_COLORS["90+"]}>
                                {fmt(row.days90plus, "currency")}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                        {/* Total Row */}
                        <TableRow className="bg-muted/50 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                          <TableCell colSpan={2} className="font-bold">
                            Total
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold">
                            {fmt(agingData.totals?.totalOutstanding, "currency")}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-green-600">
                            {fmt(agingData.totals?.current, "currency")}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-yellow-600">
                            {fmt(agingData.totals?.days31to60, "currency")}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-orange-600">
                            {fmt(agingData.totals?.days61to90, "currency")}
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-red-600">
                            {fmt(agingData.totals?.days90plus, "currency")}
                          </TableCell>
                        </TableRow>
                      </>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Drill Down */}
          {drillDownEntity && (
            <Card className="border-blue-300 dark:border-blue-800">
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                <CardTitle className="text-white text-sm flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <UserCircle className="w-4 h-4" />
                    {drillDownEntity.customerName ||
                      drillDownEntity.supplierName}{" "}
                    — Aging Breakdown
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-white hover:bg-white/10"
                    onClick={() => setDrillDownEntity(null)}
                  >
                    Close
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {[
                    {
                      label: "Current (0-30d)",
                      value: drillDownEntity.current,
                      cls: AGING_COLORS.current,
                    },
                    {
                      label: "31-60 Days",
                      value: drillDownEntity.days31to60,
                      cls: AGING_COLORS["31-60"],
                    },
                    {
                      label: "61-90 Days",
                      value: drillDownEntity.days61to90,
                      cls: AGING_COLORS["61-90"],
                    },
                    {
                      label: "90+ Days",
                      value: drillDownEntity.days90plus,
                      cls: AGING_COLORS["90+"],
                    },
                  ].map((bucket, i) => (
                    <div
                      key={i}
                      className="p-3 rounded-lg border bg-muted/30"
                    >
                      <p className="text-xs text-muted-foreground mb-1">
                        {bucket.label}
                      </p>
                      <Badge className={`${bucket.cls} text-sm`}>
                        {fmt(bucket.value, "currency")}
                      </Badge>
                    </div>
                  ))}
                </div>
                <p className="text-sm text-muted-foreground mt-3">
                  Total Outstanding:{" "}
                  <span className="font-bold text-slate-900 dark:text-white">
                    {fmt(drillDownEntity.totalOutstanding, "currency")}
                  </span>
                </p>
              </CardContent>
            </Card>
          )}

          {/* Charts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Stacked Bar Chart */}
            {agingBarData.length > 0 && (
              <Card>
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">
                    Aging Distribution per Entity
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={350}>
                    <BarChart data={agingBarData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 9 }}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RechartsTooltip />
                      <Legend />
                      <Bar
                        dataKey="Current"
                        stackId="a"
                        fill={AGING_CHART_COLORS.current}
                        name="Current (0-30d)"
                      />
                      <Bar
                        dataKey="31-60d"
                        stackId="a"
                        fill={AGING_CHART_COLORS["31-60"]}
                        name="31-60 Days"
                      />
                      <Bar
                        dataKey="61-90d"
                        stackId="a"
                        fill={AGING_CHART_COLORS["61-90"]}
                        name="61-90 Days"
                      />
                      <Bar
                        dataKey="90+d"
                        stackId="a"
                        fill={AGING_CHART_COLORS["90+"]}
                        name="90+ Days"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Pie Chart */}
            {agingPieData.length > 0 && (
              <Card>
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg py-3 px-4">
                  <CardTitle className="text-white text-sm">
                    Total Aging Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <ResponsiveContainer width="100%" height={350}>
                    <PieChart>
                      <Pie
                        data={agingPieData}
                        cx="50%"
                        cy="50%"
                        outerRadius={120}
                        dataKey="value"
                        label={({ name, percent }: any) =>
                          `${name} (${(percent * 100).toFixed(0)}%)`
                        }
                      >
                        {agingPieData.map((_: any, i: number) => (
                          <Cell
                            key={i}
                            fill={
                              [
                                AGING_CHART_COLORS.current,
                                AGING_CHART_COLORS["31-60"],
                                AGING_CHART_COLORS["61-90"],
                                AGING_CHART_COLORS["90+"],
                              ][i] || PIE_COLORS[i]
                            }
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
          Click Generate to view aging analysis
        </div>
      )}
    </div>
  );

  // ============================================================
  // RENDER: Supplier 403 for SR
  // ============================================================
  const renderSupplier403 = () => (
    <div className="flex items-center justify-center min-h-[40vh]">
      <Card className="max-w-md w-full border-red-300 dark:border-red-800">
        <CardContent className="p-8 text-center">
          <Lock className="w-12 h-12 mx-auto mb-4 text-red-500" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
            403 - Access Denied
          </h3>
          <p className="text-muted-foreground">
            Sales Representatives cannot access Supplier backend matrices.
            Contact your administrator.
          </p>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================
  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">
            Internal profit margins masked. Only legal invoice tax records shown.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileText className="w-6 h-6" />
          Customer & Supplier Ledger Reports
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleImportCSV}>
            <Upload className="w-4 h-4 mr-1" />
            Import CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === "customer") {
                const data =
                  custViewMode === "individual"
                    ? custLedger?.transactions || []
                    : custSummary?.data || [];
                if (data.length === 0) {
                  toast({
                    title: "No Data",
                    description: "Generate a report first",
                    variant: "destructive",
                  });
                  return;
                }
                if (custViewMode === "individual") {
                  exportCSV(
                    "Customer-Ledger",
                    [
                      "Date",
                      "Reference No",
                      "Reference Type",
                      "Debit",
                      "Credit",
                      "Balance",
                    ],
                    data.map((t: any) => [
                      fmtDate(t.date),
                      t.referenceNo,
                      t.referenceType,
                      String(t.debit),
                      String(t.credit),
                      String(t.runningBalance),
                    ])
                  );
                } else {
                  exportCSV(
                    "Customer-Summary",
                    [
                      "Code",
                      "Name",
                      "Total Sales",
                      "Collections",
                      "Returns",
                      "Balance",
                      "Credit Limit",
                    ],
                    data.map((c: any) => [
                      c.customerCode,
                      c.customerName,
                      String(c.totalSales),
                      String(c.totalCollections),
                      String(c.totalReturns),
                      String(c.balance),
                      String(c.creditLimit),
                    ])
                  );
                }
              } else if (activeTab === "supplier" && !isSR) {
                const data =
                  supViewMode === "individual"
                    ? supLedger?.transactions || []
                    : supSummary?.data || [];
                if (data.length === 0) {
                  toast({
                    title: "No Data",
                    description: "Generate a report first",
                    variant: "destructive",
                  });
                  return;
                }
                if (supViewMode === "individual") {
                  exportCSV(
                    "Supplier-Ledger",
                    [
                      "Date",
                      "Reference No",
                      "Reference Type",
                      "Debit",
                      "Credit",
                      "Balance",
                    ],
                    data.map((t: any) => [
                      fmtDate(t.date),
                      t.referenceNo,
                      t.referenceType,
                      String(t.debit),
                      String(t.credit),
                      String(t.runningBalance),
                    ])
                  );
                } else {
                  exportCSV(
                    "Supplier-Summary",
                    [
                      "Code",
                      "Name",
                      "Total Purchases",
                      "Deliveries",
                      "Returns",
                      "Balance",
                      "Credit Limit",
                    ],
                    data.map((s: any) => [
                      s.supplierCode,
                      s.supplierName,
                      String(s.totalPurchases),
                      String(s.totalDeliveries),
                      String(s.totalReturns),
                      String(s.balance),
                      String(s.creditLimit),
                    ])
                  );
                }
              } else if (activeTab === "aging" && agingData?.data) {
                const isCust = agingEntityType === "customer";
                exportCSV(
                  `${isCust ? "Customer" : "Supplier"}-Aging`,
                  [
                    "Code",
                    "Name",
                    "Total Outstanding",
                    "Current",
                    "31-60d",
                    "61-90d",
                    "90+d",
                  ],
                  agingData.data.map((r: any) => [
                    r.customerCode || r.supplierCode,
                    r.customerName || r.supplierName,
                    String(r.totalOutstanding),
                    String(r.current),
                    String(r.days31to60),
                    String(r.days61to90),
                    String(r.days90plus),
                  ])
                );
              }
            }}
          >
            <Download className="w-4 h-4 mr-1" />
            Export CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (activeTab === "customer") {
                const data =
                  custViewMode === "individual"
                    ? custLedger?.transactions || []
                    : custSummary?.data || [];
                if (data.length === 0) {
                  toast({
                    title: "No Data",
                    description: "Generate a report first",
                    variant: "destructive",
                  });
                  return;
                }
                if (custViewMode === "individual") {
                  exportPDF(
                    "Customer-Ledger",
                    [
                      "Date",
                      "Reference No",
                      "Reference Type",
                      "Debit",
                      "Credit",
                      "Balance",
                    ],
                    data.map((t: any) => [
                      fmtDate(t.date),
                      t.referenceNo,
                      t.referenceType,
                      String(t.debit),
                      String(t.credit),
                      String(t.runningBalance),
                    ])
                  );
                } else {
                  exportPDF(
                    "Customer-Summary",
                    [
                      "Code",
                      "Name",
                      "Total Sales",
                      "Collections",
                      "Returns",
                      "Balance",
                      "Credit Limit",
                    ],
                    data.map((c: any) => [
                      c.customerCode,
                      c.customerName,
                      String(c.totalSales),
                      String(c.totalCollections),
                      String(c.totalReturns),
                      String(c.balance),
                      String(c.creditLimit),
                    ])
                  );
                }
              } else if (activeTab === "supplier" && !isSR) {
                const data =
                  supViewMode === "individual"
                    ? supLedger?.transactions || []
                    : supSummary?.data || [];
                if (data.length === 0) {
                  toast({
                    title: "No Data",
                    description: "Generate a report first",
                    variant: "destructive",
                  });
                  return;
                }
                if (supViewMode === "individual") {
                  exportPDF(
                    "Supplier-Ledger",
                    [
                      "Date",
                      "Reference No",
                      "Reference Type",
                      "Debit",
                      "Credit",
                      "Balance",
                    ],
                    data.map((t: any) => [
                      fmtDate(t.date),
                      t.referenceNo,
                      t.referenceType,
                      String(t.debit),
                      String(t.credit),
                      String(t.runningBalance),
                    ])
                  );
                } else {
                  exportPDF(
                    "Supplier-Summary",
                    [
                      "Code",
                      "Name",
                      "Total Purchases",
                      "Deliveries",
                      "Returns",
                      "Balance",
                      "Credit Limit",
                    ],
                    data.map((s: any) => [
                      s.supplierCode,
                      s.supplierName,
                      String(s.totalPurchases),
                      String(s.totalDeliveries),
                      String(s.totalReturns),
                      String(s.balance),
                      String(s.creditLimit),
                    ])
                  );
                }
              } else if (activeTab === "aging" && agingData?.data) {
                const isCust = agingEntityType === "customer";
                exportPDF(
                  `${isCust ? "Customer" : "Supplier"}-Aging`,
                  [
                    "Code",
                    "Name",
                    "Total Outstanding",
                    "Current",
                    "31-60d",
                    "61-90d",
                    "90+d",
                  ],
                  agingData.data.map((r: any) => [
                    r.customerCode || r.supplierCode,
                    r.customerName || r.supplierName,
                    String(r.totalOutstanding),
                    String(r.current),
                    String(r.days31to60),
                    String(r.days61to90),
                    String(r.days90plus),
                  ])
                );
              }
            }}
          >
            <FileDown className="w-4 h-4 mr-1" />
            Export PDF
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "customer" | "supplier" | "aging")}
      >
        <TabsList className="flex overflow-x-auto gap-1 pb-1 scrollbar-none">
          <TabsTrigger value="customer" className="flex items-center gap-1">
            <UserCircle className="w-4 h-4" />
            Customer Ledger
          </TabsTrigger>
          <TabsTrigger value="supplier" className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            Supplier Ledger
          </TabsTrigger>
          <TabsTrigger value="aging" className="flex items-center gap-1">
            <TrendingUp className="w-4 h-4" />
            Aging Analysis
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════ */}
        {/* CUSTOMER LEDGER TAB */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="customer">
          {/* Filter Panel */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Label className="text-sm">Customer</Label>
                <Select
                  value={custSelected}
                  onValueChange={setCustSelected}
                >
                  <SelectTrigger className="w-56">
                    <SelectValue placeholder="Select Customer" />
                  </SelectTrigger>
                  <SelectContent>
                    {custList.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.customerCode} — {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Label className="text-sm">From</Label>
                <Input
                  type="date"
                  value={custFrom}
                  onChange={(e) => setCustFrom(e.target.value)}
                  className="w-40"
                />
                <Label className="text-sm">To</Label>
                <Input
                  type="date"
                  value={custTo}
                  onChange={(e) => setCustTo(e.target.value)}
                  className="w-40"
                />
                <Button
                  size="sm"
                  className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                  onClick={generateCustLedger}
                  disabled={custLoading}
                >
                  <RefreshCw
                    className={`w-4 h-4 mr-1 ${custLoading ? "animate-spin" : ""}`}
                  />
                  Generate Statement
                </Button>
                <div className="flex items-center gap-1 ml-auto">
                  <Button
                    size="sm"
                    variant={
                      custViewMode === "individual" ? "default" : "outline"
                    }
                    className={
                      custViewMode === "individual"
                        ? "bg-[#2563eb] hover:bg-[#1d4ed8]"
                        : ""
                    }
                    onClick={() => setCustViewMode("individual")}
                  >
                    Individual
                  </Button>
                  <Button
                    size="sm"
                    variant={
                      custViewMode === "summary" ? "default" : "outline"
                    }
                    className={
                      custViewMode === "summary"
                        ? "bg-[#2563eb] hover:bg-[#1d4ed8]"
                        : ""
                    }
                    onClick={() => setCustViewMode("summary")}
                  >
                    Summary
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {custLoading ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : custViewMode === "individual" ? (
            custLedger ? (
              renderCustIndividual()
            ) : (
              <div className="text-center py-16 text-muted-foreground">
                Select a customer and generate statement
              </div>
            )
          ) : custSummary ? (
            renderCustSummary()
          ) : (
            <div className="text-center py-16 text-muted-foreground">
              Click Generate Statement to view customer summary
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* SUPPLIER LEDGER TAB */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="supplier">
          {isSR ? (
            renderSupplier403()
          ) : (
            <>
              {/* Filter Panel */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Label className="text-sm">Supplier</Label>
                    <Select
                      value={supSelected}
                      onValueChange={setSupSelected}
                    >
                      <SelectTrigger className="w-56">
                        <SelectValue placeholder="Select Supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {supList.map((s: any) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.supplierCode} — {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Label className="text-sm">From</Label>
                    <Input
                      type="date"
                      value={supFrom}
                      onChange={(e) => setSupFrom(e.target.value)}
                      className="w-40"
                    />
                    <Label className="text-sm">To</Label>
                    <Input
                      type="date"
                      value={supTo}
                      onChange={(e) => setSupTo(e.target.value)}
                      className="w-40"
                    />
                    <Button
                      size="sm"
                      className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                      onClick={generateSupLedger}
                      disabled={supLoading}
                    >
                      <RefreshCw
                        className={`w-4 h-4 mr-1 ${supLoading ? "animate-spin" : ""}`}
                      />
                      Generate Statement
                    </Button>
                    <div className="flex items-center gap-1 ml-auto">
                      <Button
                        size="sm"
                        variant={
                          supViewMode === "individual" ? "default" : "outline"
                        }
                        className={
                          supViewMode === "individual"
                            ? "bg-[#2563eb] hover:bg-[#1d4ed8]"
                            : ""
                        }
                        onClick={() => setSupViewMode("individual")}
                      >
                        Individual
                      </Button>
                      <Button
                        size="sm"
                        variant={
                          supViewMode === "summary" ? "default" : "outline"
                        }
                        className={
                          supViewMode === "summary"
                            ? "bg-[#2563eb] hover:bg-[#1d4ed8]"
                            : ""
                        }
                        onClick={() => setSupViewMode("summary")}
                      >
                        Summary
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {supLoading ? (
                <div className="flex justify-center py-16">
                  <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                </div>
              ) : supViewMode === "individual" ? (
                supLedger ? (
                  renderSupIndividual()
                ) : (
                  <div className="text-center py-16 text-muted-foreground">
                    Select a supplier and generate statement
                  </div>
                )
              ) : supSummary ? (
                renderSupSummary()
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  Click Generate Statement to view supplier summary
                </div>
              )}
            </>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════ */}
        {/* AGING ANALYSIS TAB */}
        {/* ═══════════════════════════════════════════════════ */}
        <TabsContent value="aging">{renderAgingTab()}</TabsContent>
      </Tabs>

      {/* Custom scrollbar styles */}
      <style jsx global>{`
        .table-container::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        .table-container::-webkit-scrollbar-track {
          background: transparent;
        }
        .table-container::-webkit-scrollbar-thumb {
          background: #94a3b8;
          border-radius: 3px;
        }
        .table-container::-webkit-scrollbar-thumb:hover {
          background: #64748b;
        }
      `}</style>
    </div>
  );
}
