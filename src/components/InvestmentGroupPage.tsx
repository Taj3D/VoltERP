"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  ChevronDown, ChevronRight, FileDown, Shield, Landmark,
  Building2, Wallet, ArrowDownCircle, ArrowUpCircle, FileBarChart,
  Banknote, TrendingUp, CheckCircle, Calculator, AlertTriangle,
  BookOpen, MapPin, Tag, Percent,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF, exportToCSV, importFromCSV, getVatMaskedKeys,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef, CompanyProfile } from "@/lib/export-utils";
import ImageUploadField from "@/components/erp/ui/ImageUploadField";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  return String(v);
};

const fmtDate = (d: string | Date) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const bdCurrencyFmt = new Intl.NumberFormat("bn-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${bdCurrencyFmt.format(Number(v))}`;
};

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
// AUTH
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

  const isVatAuditor = authState.user?.role === "vat_auditor";
  const isSR = authState.user?.role === "sr";
  const isDealer = authState.user?.role === "dealer";

  return { ...authState, isVatAuditor, isSR, isDealer, user: authState.user };
}

// ============================================================
// BADGE STYLES
// ============================================================

const TYPE_BADGE: Record<string, string> = {
  Liability: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  Asset: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Investment: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
};

const PAYMENT_METHOD_BADGE: Record<string, string> = {
  Cash: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Bank Transfer": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  Cheque: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
};

const CATEGORY_BADGE: Record<string, string> = {
  Fixed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Current: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
};

const AGING_BUCKET_COLORS: Record<string, string> = {
  "Current": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "1-30": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  "31-60": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "61-90": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "90+": "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-300",
};

const AP_STATUS_COLORS: Record<string, string> = {
  "Synced": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Pending": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Failed": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

// ============================================================
// PROPS
// ============================================================

interface InvestmentGroupPageProps {
  initialTab?: string;
}

// ============================================================
// COMPONENT
// ============================================================

export default function InvestmentGroupPage({ initialTab }: InvestmentGroupPageProps) {
  const { toast } = useToast();
  const { isVatAuditor, isSR, isDealer } = useAuth();
  const auth = useAuth();
  const isAdmin = auth.user?.role === "admin";
  const [activeTab, setActiveTab] = useState(initialTab || "investment-heads");

  // ─── Company Profile for White-Label PDF ───
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const loadCompanyProfile = useCallback(async () => {
    try {
      const res = await apiFetch("/api/company-branding");
      setCompanyProfile(res);
    } catch {}
  }, []);

  // ─── Investment Snapshot for Rollback ───
  const [investmentSnapshot, setInvestmentSnapshot] = useState<any[]>([]);

  // ─── Investment Heads State ───
  const [heads, setHeads] = useState<any[]>([]);
  const [headsLoading, setHeadsLoading] = useState(true);
  const [headsSearch, setHeadsSearch] = useState("");
  const [headsForm, setHeadsForm] = useState(false);
  const [headsEdit, setHeadsEdit] = useState<any>(null);
  const [headsDelete, setHeadsDelete] = useState<any>(null);
  const [headsSaving, setHeadsSaving] = useState(false);
  const [expandedHeads, setExpandedHeads] = useState<Set<string>>(new Set());
  const [headsFormData, setHeadsFormData] = useState<Record<string, any>>({
    name: "", type: "Liability", openingBalance: 0, openingType: "None", description: "",
    sharePercentage: "", capitalValue: "", isActive: true,
  });

  // ─── Investment (Detailed) State ───
  const [investments, setInvestments] = useState<any[]>([]);
  const [investSummary, setInvestSummary] = useState<any>(null);
  const [investLoading, setInvestLoading] = useState(true);
  const [expandedInvest, setExpandedInvest] = useState<Set<string>>(new Set());
  const [investForm, setInvestForm] = useState(false);
  const [investFormData, setInvestFormData] = useState<Record<string, any>>({
    investmentHeadId: "", entryType: "asset", date: new Date().toISOString().split("T")[0],
    amount: 0, assetCategory: "Fixed", description: "", isActive: true,
  });

  // ─── Assets State ───
  const [assets, setAssets] = useState<any[]>([]);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [assetsSearch, setAssetsSearch] = useState("");
  const [assetsForm, setAssetsForm] = useState(false);
  const [assetsEdit, setAssetsEdit] = useState<any>(null);
  const [assetsDelete, setAssetsDelete] = useState<any>(null);
  const [assetsSaving, setAssetsSaving] = useState(false);
  const [assetsFormData, setAssetsFormData] = useState<Record<string, any>>({
    investmentHeadId: "", date: new Date().toISOString().split("T")[0],
    amount: 0, assetCategory: "Fixed", purchaseValue: 0, salvageValue: 0,
    usefulLifeMonths: 0, depreciationRate: 0, idempotencyKey: "", description: "", isActive: true,
    assetSubCategory: "", locationTag: "",
  });

  // ─── Current Assets State ───
  const [currentAssets, setCurrentAssets] = useState<any[]>([]);
  const [currentAssetsLoading, setCurrentAssetsLoading] = useState(true);
  const [currentAssetsSearch, setCurrentAssetsSearch] = useState("");
  const [currentAssetsForm, setCurrentAssetsForm] = useState(false);
  const [currentAssetsEdit, setCurrentAssetsEdit] = useState<any>(null);
  const [currentAssetsDelete, setCurrentAssetsDelete] = useState<any>(null);
  const [currentAssetsSaving, setCurrentAssetsSaving] = useState(false);
  const [currentAssetsFormData, setCurrentAssetsFormData] = useState<Record<string, any>>({
    investmentHeadId: "", date: new Date().toISOString().split("T")[0],
    amount: 0, assetCategory: "Current", description: "", isActive: true,
    assetSubCategory: "", locationTag: "",
  });

  // ─── Liabilities (Receive) State ───
  const [liabReceive, setLiabReceive] = useState<any[]>([]);
  const [liabReceiveLoading, setLiabReceiveLoading] = useState(true);
  const [liabReceiveSearch, setLiabReceiveSearch] = useState("");
  const [liabReceiveForm, setLiabReceiveForm] = useState(false);
  const [liabReceiveEdit, setLiabReceiveEdit] = useState<any>(null);
  const [liabReceiveDelete, setLiabReceiveDelete] = useState<any>(null);
  const [liabReceiveSaving, setLiabReceiveSaving] = useState(false);
  const [liabReceiveFormData, setLiabReceiveFormData] = useState<Record<string, any>>({
    investmentHeadId: "", date: new Date().toISOString().split("T")[0],
    amount: 0, type: "received", paymentMethod: "Cash", dueDate: "", description: "", isActive: true,
  });

  // ─── Liabilities (Pay) State ───
  const [liabPay, setLiabPay] = useState<any[]>([]);
  const [liabPayLoading, setLiabPayLoading] = useState(true);
  const [liabPaySearch, setLiabPaySearch] = useState("");
  const [liabPayForm, setLiabPayForm] = useState(false);
  const [liabPayEdit, setLiabPayEdit] = useState<any>(null);
  const [liabPayDelete, setLiabPayDelete] = useState<any>(null);
  const [liabPaySaving, setLiabPaySaving] = useState(false);
  const [liabPayFormData, setLiabPayFormData] = useState<Record<string, any>>({
    investmentHeadId: "", date: new Date().toISOString().split("T")[0],
    amount: 0, type: "pay", paymentMethod: "Cash", dueDate: "", description: "", isActive: true,
  });

  // ─── Liability Report State ───
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [expandedReport, setExpandedReport] = useState<Set<string>>(new Set());

  // ─── Depreciation Ledger State ───
  const [depreciations, setDepreciations] = useState<any[]>([]);
  const [depLoading, setDepLoading] = useState(false);
  const [depGenerating, setDepGenerating] = useState(false);
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [expandedDep, setExpandedDep] = useState<Set<string>>(new Set());

  // ─── Ledger Sync Status State ───
  const [ledgerSyncStatus, setLedgerSyncStatus] = useState<Record<string, string>>({});
  const [headsLedgerSync, setHeadsLedgerSync] = useState<Record<string, string>>({});

  // ─── Asset Ledger Tab Filter State ───
  const [assetLedgerCategoryFilter, setAssetLedgerCategoryFilter] = useState<string>("All");
  const [assetLedgerLocationFilter, setAssetLedgerLocationFilter] = useState<string>("");
  const [assetLedgerSubCatFilter, setAssetLedgerSubCatFilter] = useState<string>("");

  // ─── AP Aging State ───
  const [apAgingData, setApAgingData] = useState<any>(null);
  const [apAgingLoading, setApAgingLoading] = useState(false);

  // ─── Shared: Investment Heads for dropdowns ───
  const [headOptions, setHeadOptions] = useState<any[]>([]);

  // ============================================================
  // DATA LOADERS
  // ============================================================

  const loadHeads = useCallback(async () => {
    setHeadsLoading(true);
    try {
      const res = await apiFetch("/api/investment-heads");
      setHeads(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setHeadsLoading(false);
    }
  }, [toast]);

  const loadHeadOptions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/investment-heads");
      setHeadOptions(Array.isArray(res) ? res : res.data || []);
    } catch {}
  }, []);

  const loadInvestments = useCallback(async () => {
    setInvestLoading(true);
    try {
      const res = await apiFetch("/api/investments?includeDetails=true&headType=Investment");
      setInvestments(res.investmentHeads || []);
      setInvestSummary(res.summary || null);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setInvestLoading(false);
    }
  }, [toast]);

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    try {
      const res = await apiFetch("/api/assets?category=Fixed");
      setAssets(Array.isArray(res) ? res : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setAssetsLoading(false);
    }
  }, [toast]);

  const loadCurrentAssets = useCallback(async () => {
    setCurrentAssetsLoading(true);
    try {
      const res = await apiFetch("/api/assets?category=Current");
      setCurrentAssets(Array.isArray(res) ? res : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCurrentAssetsLoading(false);
    }
  }, [toast]);

  const loadLiabReceive = useCallback(async () => {
    setLiabReceiveLoading(true);
    try {
      const res = await apiFetch("/api/liabilities?type=received");
      setLiabReceive(Array.isArray(res) ? res : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLiabReceiveLoading(false);
    }
  }, [toast]);

  const loadLiabPay = useCallback(async () => {
    setLiabPayLoading(true);
    try {
      const res = await apiFetch("/api/liabilities?type=pay");
      setLiabPay(Array.isArray(res) ? res : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLiabPayLoading(false);
    }
  }, [toast]);

  const loadDepreciations = useCallback(async () => {
    setDepLoading(true);
    try {
      const res = await apiFetch("/api/asset-depreciation");
      setDepreciations(Array.isArray(res) ? res : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDepLoading(false);
    }
  }, [toast]);

  const loadLedgerSyncStatus = useCallback(async () => {
    try {
      const res = await apiFetch("/api/ledger-auto-post?sourceType=Asset&limit=1000");
      const records = res.records || res || [];
      const mapping: Record<string, string> = {};
      (Array.isArray(records) ? records : []).forEach((r: any) => {
        if (r.sourceId && r.status === "Posted") {
          mapping[r.sourceId] = "Synced";
        }
      });
      setLedgerSyncStatus(mapping);
    } catch {}
  }, []);

  const loadHeadsLedgerSync = useCallback(async () => {
    try {
      const res = await apiFetch("/api/ledger-auto-post?sourceType=InvestmentHead&limit=1000");
      const records = res.records || res || [];
      const mapping: Record<string, string> = {};
      (Array.isArray(records) ? records : []).forEach((r: any) => {
        if (r.sourceId && r.status === "Posted") {
          mapping[r.sourceId] = "Synced";
        }
      });
      setHeadsLedgerSync(mapping);
    } catch {}
  }, []);

  // ─── AP Aging Data Loader ───
  const loadApAgingData = useCallback(async () => {
    setApAgingLoading(true);
    try {
      const res = await apiFetch("/api/liabilities/ap-sync");
      // Map API response to frontend-expected format
      const totalSynced = res?.syncStatusSummary?.synced || 0;
      const totalPending = res?.syncStatusSummary?.pending || 0;
      const totalFailed = res?.syncStatusSummary?.failed || 0;
      const totalEntries = totalSynced + totalPending + totalFailed;
      const syncRate = totalEntries > 0 ? Math.round((totalSynced / totalEntries) * 100) : 0;

      const mapped = {
        // agingBuckets maps from API's agingSummary — normalize keys to match frontend expectations
        agingBuckets: {
          "Current": res?.agingSummary?.current || { count: 0, totalAmount: 0 },
          "1-30": res?.agingSummary?.["1-30"] || { count: 0, totalAmount: 0 },
          "31-60": res?.agingSummary?.["31-60"] || { count: 0, totalAmount: 0 },
          "61-90": res?.agingSummary?.["61-90"] || { count: 0, totalAmount: 0 },
          "90+": res?.agingSummary?.["90+"] || { count: 0, totalAmount: 0 },
        },
        // apSyncStats computed from syncStatusSummary
        apSyncStats: {
          synced: totalSynced,
          pending: totalPending,
          failed: totalFailed,
          syncRate,
        },
        // overdueStats computed from heads
        overdueStats: {
          overdueCount: (res?.heads || []).reduce((count: number, h: any) =>
            count + (h.liabilities || []).filter((l: any) => (l.overdueDays || 0) > 0).length, 0),
        },
        // headOutstanding maps from API's heads
        headOutstanding: (res?.heads || []).map((h: any) => ({
          id: h.id,
          code: h.code,
          name: h.name,
          outstanding: h.outstandingBalance,
          outstandingBalance: h.outstandingBalance,
          agingBucket: h.agingBucket,
          apSyncStatus: h.apSyncStatus,
          overdueDays: (h.liabilities || []).length > 0
            ? Math.max(0, ...(h.liabilities || []).map((l: any) => l.overdueDays || 0))
            : 0,
        })),
        totalOutstanding: res?.totalOutstanding || 0,
      };
      setApAgingData(mapped);
    } catch (e: any) {
      // Silent fail - aging data is supplementary
    } finally {
      setApAgingLoading(false);
    }
  }, []);

  // ============================================================
  // INIT
  // ============================================================

  useEffect(() => {
    loadHeads();
    loadHeadOptions();
    loadCompanyProfile();
    loadHeadsLedgerSync();
  }, [loadHeads, loadHeadOptions, loadCompanyProfile, loadHeadsLedgerSync]);

  useEffect(() => {
    if (activeTab === "investment") loadInvestments();
    if (activeTab === "fixed-asset") { loadAssets(); loadLedgerSyncStatus(); }
    if (activeTab === "current-asset") { loadCurrentAssets(); loadLedgerSyncStatus(); }
    if (activeTab === "liability-receive") { loadLiabReceive(); loadApAgingData(); }
    if (activeTab === "liability-pay") { loadLiabPay(); loadApAgingData(); }
    if (activeTab === "depreciation") loadDepreciations();
    if (activeTab === "asset-ledger") { loadAssets(); loadCurrentAssets(); loadLedgerSyncStatus(); }
  }, [activeTab, loadInvestments, loadAssets, loadCurrentAssets, loadLiabReceive, loadLiabPay, loadDepreciations, loadLedgerSyncStatus, loadApAgingData]);

  // ============================================================
  // FILTERED DATA
  // ============================================================

  const filteredHeads = useMemo(() => {
    if (!headsSearch) return heads;
    const s = headsSearch.toLowerCase();
    return heads.filter(
      (h: any) =>
        h.code?.toLowerCase().includes(s) ||
        h.name?.toLowerCase().includes(s) ||
        h.type?.toLowerCase().includes(s)
    );
  }, [heads, headsSearch]);

  const filteredAssets = useMemo(() => {
    if (!assetsSearch) return assets;
    const s = assetsSearch.toLowerCase();
    return assets.filter(
      (a: any) =>
        a.investmentHead?.name?.toLowerCase().includes(s) ||
        a.description?.toLowerCase().includes(s) ||
        a.assetCategory?.toLowerCase().includes(s)
    );
  }, [assets, assetsSearch]);

  const filteredCurrentAssets = useMemo(() => {
    if (!currentAssetsSearch) return currentAssets;
    const s = currentAssetsSearch.toLowerCase();
    return currentAssets.filter(
      (a: any) =>
        a.investmentHead?.name?.toLowerCase().includes(s) ||
        a.description?.toLowerCase().includes(s)
    );
  }, [currentAssets, currentAssetsSearch]);

  const filteredLiabReceive = useMemo(() => {
    if (!liabReceiveSearch) return liabReceive;
    const s = liabReceiveSearch.toLowerCase();
    return liabReceive.filter(
      (l: any) =>
        l.investmentHead?.name?.toLowerCase().includes(s) ||
        l.description?.toLowerCase().includes(s) ||
        l.paymentMethod?.toLowerCase().includes(s)
    );
  }, [liabReceive, liabReceiveSearch]);

  const filteredLiabPay = useMemo(() => {
    if (!liabPaySearch) return liabPay;
    const s = liabPaySearch.toLowerCase();
    return liabPay.filter(
      (l: any) =>
        l.investmentHead?.name?.toLowerCase().includes(s) ||
        l.description?.toLowerCase().includes(s) ||
        l.paymentMethod?.toLowerCase().includes(s)
    );
  }, [liabPay, liabPaySearch]);

  // ============================================================
  // HEADS STATS
  // ============================================================

  const headsStats = useMemo(
    () => ({
      total: heads.length,
      active: heads.filter((h: any) => h.isActive).length,
      totalOpening: heads.reduce((s: number, h: any) => s + (Number(h.openingBalance) || 0), 0),
    }),
    [heads]
  );

  const assetsStats = useMemo(
    () => ({
      total: assets.length,
      totalValue: assets.reduce((s: number, a: any) => s + (typeof a.amount === "number" ? a.amount : 0), 0),
      activeCount: assets.filter((a: any) => a.isActive).length,
    }),
    [assets]
  );

  const currentAssetsStats = useMemo(
    () => ({
      total: currentAssets.length,
      totalValue: currentAssets.reduce((s: number, a: any) => s + (typeof a.amount === "number" ? a.amount : 0), 0),
      activeCount: currentAssets.filter((a: any) => a.isActive).length,
    }),
    [currentAssets]
  );

  const liabReceiveStats = useMemo(() => {
    const cash = liabReceive.filter((l: any) => l.paymentMethod === "Cash").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const bank = liabReceive.filter((l: any) => l.paymentMethod === "Bank Transfer").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const cheque = liabReceive.filter((l: any) => l.paymentMethod === "Cheque").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    return {
      total: liabReceive.reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0),
      cash, bank, cheque,
    };
  }, [liabReceive]);

  const liabPayStats = useMemo(() => {
    const cash = liabPay.filter((l: any) => l.paymentMethod === "Cash").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const bank = liabPay.filter((l: any) => l.paymentMethod === "Bank Transfer").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const cheque = liabPay.filter((l: any) => l.paymentMethod === "Cheque").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    return {
      total: liabPay.reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0),
      cash, bank, cheque,
    };
  }, [liabPay]);

  // ─── Depreciation Stats ───
  const depStats = useMemo(() => {
    const totalDep = depreciations.reduce((s: number, d: any) => s + (Number(d.depreciationAmount) || 0), 0);
    const totalAccum = depreciations.length > 0
      ? Math.max(...depreciations.map((d: any) => Number(d.accumulatedDepreciation) || 0))
      : 0;
    const totalNBV = depreciations.length > 0
      ? depreciations.reduce((s: number, d: any) => s + (Number(d.netBookValue) || 0), 0) / depreciations.filter((d: any) => d.netBookValue > 0).length || 0
      : 0;
    return { totalEntries: depreciations.length, totalDep, totalAccum, avgNBV: totalNBV };
  }, [depreciations]);

  // ─── Generate Monthly Depreciation ───
  const generateDepreciation = async () => {
    setDepGenerating(true);
    try {
      // Get all fixed assets that haven't been fully depreciated
      const fixedAssets = await apiFetch("/api/assets?category=Fixed");
      const activeAssets = (Array.isArray(fixedAssets) ? fixedAssets : []).filter(
        (a: any) => a.isActive && a.assetCategory === "Fixed" && a.usefulLifeMonths > 0 && Number(a.netBookValue) > Number(a.salvageValue)
      );
      if (activeAssets.length === 0) {
        toast({ title: "No Assets", description: "No active fixed assets requiring depreciation", variant: "destructive" });
        setDepGenerating(false);
        return;
      }
      let generated = 0;
      let skipped = 0;
      for (const asset of activeAssets) {
        try {
          await apiFetch("/api/asset-depreciation", {
            method: "POST",
            body: JSON.stringify({
              assetId: asset.id,
              periodDate: `${depPeriod}-28`, // End of month
              method: "StraightLine",
            }),
          });
          generated++;
        } catch (e: any) {
          skipped++;
        }
      }
      toast({
        title: "Depreciation Generated",
        description: `Generated: ${generated}, Skipped (already exists): ${skipped}`,
        variant: skipped > generated ? "destructive" : "default",
      });
      loadDepreciations();
      loadAssets(); // Refresh asset netBookValue
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDepGenerating(false);
    }
  };

  // ============================================================
  // RBAC
  // ============================================================

  if (isSR || isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full border-red-300 dark:border-red-800">
          <CardContent className="p-8 text-center">
            <Shield className="w-12 h-12 mx-auto mb-4 text-red-500" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">403 - Access Denied</h3>
            <p className="text-muted-foreground">You do not have permission to access Investment & Asset modules. Contact your administrator.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ============================================================
  // EXPAND/TOGGLE HELPERS
  // ============================================================

  const toggleExpand = (set: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    set((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ============================================================
  // CRUD: INVESTMENT HEADS
  // ============================================================

  const openHeadsCreate = () => {
    setHeadsFormData({ name: "", type: "Liability", openingBalance: 0, openingType: "None", description: "", sharePercentage: "", capitalValue: "", profileImage: null, nidFrontImage: null, nidBackImage: null, isActive: true });
    setHeadsEdit(null);
    setHeadsForm(true);
  };

  const openHeadsEdit = (item: any) => {
    setHeadsFormData({
      name: item.name || "",
      type: item.type || "Liability",
      openingBalance: item.openingBalance || 0,
      openingType: item.openingType || "None",
      description: item.description || "",
      sharePercentage: item.sharePercentage ?? "",
      capitalValue: item.capitalValue ?? "",
      profileImage: item.profileImage || null,
      nidFrontImage: item.nidFrontImage || null,
      nidBackImage: item.nidBackImage || null,
      isActive: item.isActive ?? true,
    });
    setHeadsEdit(item);
    setHeadsForm(true);
  };

  const saveHeads = async () => {
    if (!headsFormData.name) {
      toast({ title: "Error", description: "Name is required", variant: "destructive" });
      return;
    }
    // Phase 3 Validation: Block negative/zero for financial fields when provided
    const openingBal = Number(headsFormData.openingBalance);
    if (headsFormData.openingBalance !== "" && openingBal < 0) {
      toast({ title: "Validation Error", description: "Opening Balance cannot be negative", variant: "destructive" });
      return;
    }
    if (headsFormData.sharePercentage !== "" && headsFormData.sharePercentage !== null && headsFormData.sharePercentage !== undefined) {
      const sp = Number(headsFormData.sharePercentage);
      if (sp <= 0 || sp > 100) {
        toast({ title: "Validation Error", description: "Share Percentage must be between 0.01 and 100", variant: "destructive" });
        return;
      }
    }
    if (headsFormData.capitalValue !== "" && headsFormData.capitalValue !== null && headsFormData.capitalValue !== undefined) {
      const cv = Number(headsFormData.capitalValue);
      if (cv <= 0) {
        toast({ title: "Validation Error", description: "Capital Value must be greater than zero", variant: "destructive" });
        return;
      }
    }
    setHeadsSaving(true);
    try {
      const payload = {
        name: headsFormData.name,
        type: headsFormData.type,
        openingBalance: Number(headsFormData.openingBalance) || 0,
        openingType: headsFormData.openingType,
        description: headsFormData.description || null,
        sharePercentage: headsFormData.sharePercentage ? Number(headsFormData.sharePercentage) : null,
        capitalValue: headsFormData.capitalValue ? Number(headsFormData.capitalValue) : null,
        profileImage: headsFormData.profileImage || null,
        nidFrontImage: headsFormData.nidFrontImage || null,
        nidBackImage: headsFormData.nidBackImage || null,
        isActive: headsFormData.isActive ?? true,
      };
      if (headsEdit) {
        await apiFetch(`/api/investment-heads/${headsEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: "Investment Head updated" });
      } else {
        await apiFetch("/api/investment-heads", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: "Investment Head created" });
      }
      setHeadsForm(false);
      loadHeads();
      loadHeadOptions();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setHeadsSaving(false);
    }
  };

  const deleteHeads = async () => {
    if (!headsDelete) return;
    try {
      await apiFetch(`/api/investment-heads/${headsDelete.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Investment Head deleted" });
      setHeadsDelete(null);
      loadHeads();
      loadHeadOptions();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // CRUD: ASSETS (FIXED + CURRENT)
  // ============================================================

  const openAssetCreate = (category: "Fixed" | "Current") => {
    const isFixed = category === "Fixed";
    const setFormOpen = isFixed ? setAssetsForm : setCurrentAssetsForm;
    const setFormData = isFixed ? setAssetsFormData : setCurrentAssetsFormData;
    setFormData({
      investmentHeadId: "", date: new Date().toISOString().split("T")[0],
      amount: 0, assetCategory: category, purchaseValue: 0, salvageValue: 0,
      usefulLifeMonths: 0, depreciationRate: 0, idempotencyKey: "", description: "", isActive: true,
      assetSubCategory: "", locationTag: "",
    });
    if (isFixed) setAssetsEdit(null);
    else setCurrentAssetsEdit(null);
    setFormOpen(true);
  };

  const openAssetEdit = (item: any, category: "Fixed" | "Current") => {
    const isFixed = category === "Fixed";
    const setFormData = isFixed ? setAssetsFormData : setCurrentAssetsFormData;
    setFormData({
      investmentHeadId: item.investmentHeadId || "",
      date: item.date ? item.date.split("T")[0] : "",
      amount: item.amount || 0,
      assetCategory: item.assetCategory || category,
      purchaseValue: item.purchaseValue || 0,
      salvageValue: item.salvageValue || 0,
      usefulLifeMonths: item.usefulLifeMonths || 0,
      depreciationRate: item.depreciationRate || 0,
      idempotencyKey: item.idempotencyKey || "",
      description: item.description || "",
      isActive: item.isActive ?? true,
      assetSubCategory: item.assetSubCategory || "",
      locationTag: item.locationTag || "",
    });
    if (isFixed) { setAssetsEdit(item); setAssetsForm(true); }
    else { setCurrentAssetsEdit(item); setCurrentAssetsForm(true); }
  };

  const saveAsset = async (category: "Fixed" | "Current") => {
    const isFixed = category === "Fixed";
    const formData = isFixed ? assetsFormData : currentAssetsFormData;
    const editItem = isFixed ? assetsEdit : currentAssetsEdit;
    if (!formData.investmentHeadId || !formData.date || !formData.amount) {
      toast({ title: "Error", description: "Investment Head, Date and Amount are required", variant: "destructive" });
      return;
    }
    // Phase 3: Block negative/zero amount
    if (Number(formData.amount) <= 0) {
      toast({ title: "Validation Error", description: "Investment Amount must be greater than zero", variant: "destructive" });
      return;
    }
    // Phase 3: Inactive Head Shield
    const selectedHead = headOptions.find((h: any) => h.id === formData.investmentHeadId);
    if (selectedHead && !selectedHead.isActive) {
      toast({ title: "Action Blocked", description: "Chosen Investment Head is inactive or archived.", variant: "destructive" });
      return;
    }
    // Phase 3: Fixed Asset depreciation validation
    if (isFixed) {
      const pv = Number(formData.purchaseValue);
      const sv = Number(formData.salvageValue);
      const ulm = Number(formData.usefulLifeMonths);
      if (pv <= 0) {
        toast({ title: "Validation Error", description: "Purchase Value must be greater than zero for Fixed Assets", variant: "destructive" });
        return;
      }
      if (sv < 0) {
        toast({ title: "Validation Error", description: "Salvage Value cannot be negative", variant: "destructive" });
        return;
      }
      if (sv >= pv) {
        toast({ title: "Validation Error", description: "Salvage Value must be less than Purchase Value", variant: "destructive" });
        return;
      }
      if (ulm <= 0) {
        toast({ title: "Validation Error", description: "Useful Life (Months) must be greater than zero for Fixed Assets", variant: "destructive" });
        return;
      }
    }
    // Phase 3: Spin-Lock
    if (isFixed) setAssetsSaving(true);
    else setCurrentAssetsSaving(true);
    // Phase 3: Snapshot for rollback
    setInvestmentSnapshot(isFixed ? [...assets] : [...currentAssets]);
    try {
      const payload: Record<string, any> = {
        investmentHeadId: formData.investmentHeadId,
        date: formData.date,
        amount: Number(formData.amount) || 0,
        assetCategory: formData.assetCategory || category,
        description: formData.description || null,
        isActive: formData.isActive ?? true,
        assetSubCategory: formData.assetSubCategory || null,
        locationTag: formData.locationTag || null,
      };
      // Phase 3: Include depreciation fields for Fixed Assets
      if (isFixed) {
        payload.purchaseValue = Number(formData.purchaseValue) || 0;
        payload.salvageValue = Number(formData.salvageValue) || 0;
        payload.usefulLifeMonths = Number(formData.usefulLifeMonths) || 0;
        payload.depreciationRate = Number(formData.depreciationRate) || 0;
        if (formData.idempotencyKey) payload.idempotencyKey = formData.idempotencyKey;
      }
      if (editItem) {
        await apiFetch(`/api/assets/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: `${category} Asset updated` });
      } else {
        await apiFetch("/api/assets", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: `${category} Asset created` });
      }
      if (isFixed) { setAssetsForm(false); loadAssets(); }
      else { setCurrentAssetsForm(false); loadCurrentAssets(); }
    } catch (e: any) {
      // Phase 3: Rollback on failure
      if (isFixed) setAssets(investmentSnapshot);
      else setCurrentAssets(investmentSnapshot);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      if (isFixed) setAssetsSaving(false);
      else setCurrentAssetsSaving(false);
    }
  };

  const deleteAsset = async (item: any, category: "Fixed" | "Current") => {
    try {
      await apiFetch(`/api/assets/${item.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: `${category} Asset deleted` });
      if (category === "Fixed") { setAssetsDelete(null); loadAssets(); }
      else { setCurrentAssetsDelete(null); loadCurrentAssets(); }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // CRUD: LIABILITIES (RECEIVE + PAY)
  // ============================================================

  const openLiabCreate = (type: "received" | "pay") => {
    const isReceive = type === "received";
    const setFormOpen = isReceive ? setLiabReceiveForm : setLiabPayForm;
    const setFormData = isReceive ? setLiabReceiveFormData : setLiabPayFormData;
    setFormData({
      investmentHeadId: "", date: new Date().toISOString().split("T")[0],
      amount: 0, type, paymentMethod: "Cash", dueDate: "", description: "", isActive: true,
    });
    if (isReceive) setLiabReceiveEdit(null);
    else setLiabPayEdit(null);
    setFormOpen(true);
  };

  const openLiabEdit = (item: any, type: "received" | "pay") => {
    const isReceive = type === "received";
    const setFormData = isReceive ? setLiabReceiveFormData : setLiabPayFormData;
    setFormData({
      investmentHeadId: item.investmentHeadId || "",
      date: item.date ? item.date.split("T")[0] : "",
      amount: item.amount || 0,
      type: item.type || type,
      paymentMethod: item.paymentMethod || "Cash",
      dueDate: item.dueDate ? item.dueDate.split("T")[0] : "",
      description: item.description || "",
      isActive: item.isActive ?? true,
    });
    if (isReceive) { setLiabReceiveEdit(item); setLiabReceiveForm(true); }
    else { setLiabPayEdit(item); setLiabPayForm(true); }
  };

  const saveLiab = async (type: "received" | "pay") => {
    const isReceive = type === "received";
    const formData = isReceive ? liabReceiveFormData : liabPayFormData;
    const editItem = isReceive ? liabReceiveEdit : liabPayEdit;
    if (!formData.investmentHeadId || !formData.date || !formData.amount) {
      toast({ title: "Error", description: "Investment Head, Date and Amount are required", variant: "destructive" });
      return;
    }
    // Phase 3: Block negative/zero amount
    if (Number(formData.amount) <= 0) {
      toast({ title: "Validation Error", description: "Amount must be greater than zero", variant: "destructive" });
      return;
    }
    // Phase 3: Inactive Head Shield
    const selectedHead = headOptions.find((h: any) => h.id === formData.investmentHeadId);
    if (selectedHead && !selectedHead.isActive) {
      toast({ title: "Action Blocked", description: "Chosen Investment Head is inactive or archived.", variant: "destructive" });
      return;
    }
    if (isReceive) setLiabReceiveSaving(true);
    else setLiabPaySaving(true);
    try {
      // Payment validation for "pay" type — check outstanding balance
      if (type === "pay" && formData.investmentHeadId) {
        try {
          const apRes = await apiFetch("/api/liabilities/ap-sync");
          const headInfo = (apRes?.headOutstanding || []).find((h: any) => h.id === formData.investmentHeadId);
          if (headInfo && Number(formData.amount) > headInfo.outstanding) {
            toast({ title: "Validation Error", description: "Payment exceeds outstanding balance", variant: "destructive" });
            if (isReceive) setLiabReceiveSaving(false);
            else setLiabPaySaving(false);
            return;
          }
        } catch {
          // If AP sync fails, allow payment through (graceful degradation)
        }
      }
      const payload = {
        investmentHeadId: formData.investmentHeadId,
        date: formData.date,
        amount: Number(formData.amount) || 0,
        type: formData.type || type,
        paymentMethod: formData.paymentMethod || null,
        dueDate: formData.dueDate || null,
        description: formData.description || null,
        isActive: formData.isActive ?? true,
      };
      if (editItem) {
        await apiFetch(`/api/liabilities/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Updated", description: `Liability ${type === "received" ? "Receive" : "Pay"} updated` });
      } else {
        await apiFetch("/api/liabilities", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Created", description: `Liability ${type === "received" ? "Receive" : "Pay"} created` });
      }
      if (isReceive) { setLiabReceiveForm(false); loadLiabReceive(); }
      else { setLiabPayForm(false); loadLiabPay(); }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      if (isReceive) setLiabReceiveSaving(false);
      else setLiabPaySaving(false);
    }
  };

  const deleteLiab = async (item: any, type: "received" | "pay") => {
    try {
      await apiFetch(`/api/liabilities/${item.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: `Liability ${type === "received" ? "Receive" : "Pay"} deleted` });
      if (type === "received") { setLiabReceiveDelete(null); loadLiabReceive(); }
      else { setLiabPayDelete(null); loadLiabPay(); }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // INVESTMENT TAB: CREATE ENTRY
  // ============================================================

  const saveInvestEntry = async () => {
    if (!investFormData.investmentHeadId || !investFormData.date || !investFormData.amount) {
      toast({ title: "Error", description: "Investment Head, Date and Amount are required", variant: "destructive" });
      return;
    }
    // Phase 3: Block negative/zero amount
    if (Number(investFormData.amount) <= 0) {
      toast({ title: "Validation Error", description: "Investment Amount must be greater than zero", variant: "destructive" });
      return;
    }
    // Phase 3: Inactive Head Shield
    const selectedHead = headOptions.find((h: any) => h.id === investFormData.investmentHeadId);
    if (selectedHead && !selectedHead.isActive) {
      toast({ title: "Action Blocked", description: "Chosen Investment Head is inactive or archived.", variant: "destructive" });
      return;
    }
    try {
      if (investFormData.entryType === "asset") {
        await apiFetch("/api/assets", {
          method: "POST",
          body: JSON.stringify({
            investmentHeadId: investFormData.investmentHeadId,
            date: investFormData.date,
            amount: Number(investFormData.amount) || 0,
            assetCategory: investFormData.assetCategory || "Fixed",
            description: investFormData.description || null,
            isActive: investFormData.isActive ?? true,
          }),
        });
      } else {
        await apiFetch("/api/liabilities", {
          method: "POST",
          body: JSON.stringify({
            investmentHeadId: investFormData.investmentHeadId,
            date: investFormData.date,
            amount: Number(investFormData.amount) || 0,
            type: "received",
            paymentMethod: "Cash",
            description: investFormData.description || null,
            isActive: investFormData.isActive ?? true,
          }),
        });
      }
      toast({ title: "Created", description: "Entry created against investment head" });
      setInvestForm(false);
      loadInvestments();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // LIABILITY REPORT
  // ============================================================

  const generateLiabReport = async () => {
    setReportLoading(true);
    try {
      let url = "/api/reports?type=liability";
      if (reportFrom) url += `&from=${reportFrom}`;
      if (reportTo) url += `&to=${reportTo}`;
      const res = await apiFetch(url);
      setReportData(res);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setReportLoading(false);
    }
  };

  // ============================================================
  // EXPORT HELPERS
  // ============================================================

  const doExportCSV = (title: string, columns: ExportColumnDef[], data: any[]) => {
    try {
      const maskedKeys = getVatMaskedKeys(columns);
      exportToCSV({ title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys });
      toast({ title: "Exported", description: `${title} exported to CSV` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const doExportPDF = (title: string, columns: ExportColumnDef[], data: any[], orientation: "landscape" | "portrait" = "landscape") => {
    try {
      const maskedKeys = getVatMaskedKeys(columns);
      exportToPDF({
        title, columns, data, isVatAuditor, vatMaskedColumns: maskedKeys, orientation,
        company: companyProfile || undefined,
        financialFooter: {
          preparedBy: auth.user?.displayName || "",
          checkedBy: "",
          authorizedBy: "",
          printedBy: auth.user?.displayName || auth.user?.email || "",
        },
      });
      toast({ title: "Exported", description: `${title} exported to PDF` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Column definitions for exports
  const headsExportColumns: ExportColumnDef[] = [
    { key: "code", label: "Code", type: "text" },
    { key: "name", label: "Name", type: "text" },
    { key: "type", label: "Type", type: "text" },
    { key: "openingBalance", label: "Opening Balance", type: "currency" },
    { key: "openingType", label: "Opening Type", type: "text" },
    { key: "sharePercentage", label: "Share %", type: "number" },
    { key: "capitalValue", label: "Capital Value", type: "currency" },
    { key: "description", label: "Description", type: "text" },
    { key: "isActive", label: "Status", type: "boolean" },
  ];

  const assetsExportColumns: ExportColumnDef[] = [
    { key: "date", label: "Date", type: "date" },
    { key: "investmentHeadName", label: "Investment Head", type: "text" },
    { key: "amount", label: "Amount", type: "currency" },
    { key: "assetCategory", label: "Category", type: "text" },
    { key: "assetSubCategory", label: "Sub-Category", type: "text" },
    { key: "locationTag", label: "Location", type: "text" },
    { key: "purchaseValue", label: "Purchase Value", type: "currency" },
    { key: "salvageValue", label: "Salvage Value", type: "currency" },
    { key: "usefulLifeMonths", label: "Useful Life (Mo)", type: "number" },
    { key: "depreciationRate", label: "Dep. Rate (%)", type: "number" },
    { key: "accumulatedDepreciation", label: "Accum. Dep.", type: "currency" },
    { key: "netBookValue", label: "Net Book Value", type: "currency" },
    { key: "description", label: "Description", type: "text" },
    { key: "isActive", label: "Status", type: "boolean" },
  ];

  const liabExportColumns: ExportColumnDef[] = [
    { key: "date", label: "Date", type: "date" },
    { key: "investmentHeadName", label: "Investment Head", type: "text" },
    { key: "amount", label: "Amount", type: "currency" },
    { key: "paymentMethod", label: "Payment Method", type: "text" },
    { key: "agingBucket", label: "Aging Bucket", type: "text" },
    { key: "apSyncStatus", label: "AP Status", type: "text" },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "overdueDays", label: "Overdue Days", type: "number" },
    { key: "description", label: "Description", type: "text" },
    { key: "isActive", label: "Status", type: "boolean" },
  ];

  const investExportColumns: ExportColumnDef[] = [
    { key: "code", label: "Code", type: "text" },
    { key: "name", label: "Head Name", type: "text" },
    { key: "openingBalance", label: "Opening Balance", type: "currency" },
    { key: "totalAssets", label: "Total Assets", type: "currency" },
    { key: "totalLiabilities", label: "Total Liabilities", type: "currency" },
    { key: "netValue", label: "Net Value", type: "currency" },
  ];

  const reportExportColumns: ExportColumnDef[] = [
    { key: "code", label: "Code", type: "text" },
    { key: "name", label: "Head Name", type: "text" },
    { key: "openingBalance", label: "Opening Balance", type: "currency" },
    { key: "totalReceived", label: "Total Received", type: "currency" },
    { key: "totalPaid", label: "Total Paid", type: "currency" },
    { key: "currentBalance", label: "Current Balance", type: "currency" },
    { key: "agingBucket", label: "Aging Bucket", type: "text" },
    { key: "apSyncStatus", label: "AP Status", type: "text" },
  ];

  const depExportColumns: ExportColumnDef[] = [
    { key: "assetName", label: "Asset / Head", type: "text" },
    { key: "periodDate", label: "Period", type: "date" },
    { key: "depreciationAmount", label: "Depreciation", type: "currency" },
    { key: "accumulatedDepreciation", label: "Accum. Dep.", type: "currency" },
    { key: "netBookValue", label: "Net Book Value", type: "currency" },
    { key: "method", label: "Method", type: "text" },
  ];

  // Prepare data for export (flatten nested relations)
  const prepareAssetExport = (items: any[]) =>
    items.map((a: any) => ({
      ...a,
      investmentHeadName: a.investmentHead?.name || "—",
    }));

  const prepareLiabExport = (items: any[]) =>
    items.map((l: any) => ({
      ...l,
      investmentHeadName: l.investmentHead?.name || "—",
    }));

  // ============================================================
  // IMPORT CSV HELPERS
  // ============================================================

  const headsImportFields: ExportFieldDef[] = [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: [{ value: "Liability", label: "Liability" }, { value: "Asset", label: "Asset" }, { value: "Investment", label: "Investment" }] },
    { key: "openingBalance", label: "Opening Balance", type: "number" },
    { key: "openingType", label: "Opening Type", type: "select", options: [{ value: "None", label: "None" }, { value: "Payment", label: "Payment" }, { value: "Receive", label: "Receive" }] },
    { key: "description", label: "Description", type: "textarea" },
    { key: "sharePercentage", label: "Share Percentage", type: "number" },
    { key: "capitalValue", label: "Capital Value", type: "number" },
  ];

  const assetsImportFields: ExportFieldDef[] = [
    { key: "investmentHeadId", label: "Investment Head ID", type: "text", required: true },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "amount", label: "Amount", type: "number", required: true },
    { key: "assetCategory", label: "Asset Category", type: "select", options: [{ value: "Fixed", label: "Fixed" }, { value: "Current", label: "Current" }] },
    { key: "assetSubCategory", label: "Sub-Category", type: "text" },
    { key: "locationTag", label: "Location Tag", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
  ];

  const liabImportFields: ExportFieldDef[] = [
    { key: "investmentHeadId", label: "Investment Head ID", type: "text", required: true },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "amount", label: "Amount", type: "number", required: true },
    { key: "type", label: "Type", type: "select", options: [{ value: "received", label: "Received" }, { value: "pay", label: "Pay" }] },
    { key: "paymentMethod", label: "Payment Method", type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Bank Transfer", label: "Bank Transfer" }, { value: "Cheque", label: "Cheque" }] },
    { key: "dueDate", label: "Due Date", type: "date" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "isActive", label: "Active", type: "checkbox" },
  ];

  const handleImportCSV = (apiPath: string, fields: ExportFieldDef[], reloadFn: () => void) => {
    importFromCSV({ apiPath, formFields: fields }).then((result) => {
      // Enhanced CSV Import Validation: check for negative monetary values
      const monetaryKeys = ["amount", "purchaseValue", "salvageValue"];
      const rejectedRows: string[] = [];
      if (result.rawRows && Array.isArray(result.rawRows)) {
        result.rawRows.forEach((row: any, idx: number) => {
          for (const key of monetaryKeys) {
            const val = Number(row[key]);
            if (!isNaN(val) && val < 0) {
              rejectedRows.push(`Row ${idx + 2}: ${key} cannot be negative (${val})`);
            }
          }
        });
      }
      const errorDetails = result.fieldErrors && result.fieldErrors.length > 0
        ? result.fieldErrors.slice(0, 5).map((e) => `Row ${e.row} ${e.field}: ${e.message}`).join("; ")
        : "";
      if (rejectedRows.length > 0) {
        rejectedRows.slice(0, 5).forEach((msg) => {
          toast({ title: "Validation Error", description: msg, variant: "destructive" });
        });
      }
      toast({
        title: "Import Complete",
        description: `Imported: ${result.imported}, Failed: ${result.failed}${errorDetails ? ` | Errors: ${errorDetails}` : ""}${rejectedRows.length > 0 ? ` | Rejected: ${rejectedRows.length} rows with negative monetary values` : ""}`,
        variant: result.failed > 0 || rejectedRows.length > 0 ? "destructive" : "default",
      });
      reloadFn();
    }).catch((e: any) => {
      toast({ title: "Import Error", description: e?.message || "Import failed", variant: "destructive" });
    });
  };

  // ─── CSV Template Download ───
  const downloadCSVTemplate = (type: "heads" | "assets" | "liabilities") => {
    try {
      const authHeaders: Record<string, string> = {};
      try {
        const stored = localStorage.getItem("ems_auth");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed.user?.email) authHeaders["X-User-Email"] = parsed.user.email;
        }
      } catch {}
      const link = document.createElement("a");
      link.href = `/api/investments/csv-template?type=${type}`;
      link.download = `${type}-template.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast({ title: "Template Downloaded", description: `${type} CSV template downloaded` });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // STAT CARD COMPONENT
  // ============================================================

  const StatCard = ({ label, value, icon: Icon, color, bg }: {
    label: string; value: any; icon: React.ElementType; color: string; bg: string;
  }) => (
    <Card className="stat-mini-card">
      <CardContent className="p-3 flex items-center gap-2">
        <div className={`p-1.5 rounded-lg ${bg} ${color}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-lg font-bold text-slate-900 dark:text-white">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  // ============================================================
  // INVESTMENT HEAD SELECT OPTIONS (filtered)
  // ============================================================

  const investTypeHeads = headOptions.filter((h: any) => h.type === "Investment");
  const assetTypeHeads = headOptions.filter((h: any) => h.type === "Asset");
  const liabilityTypeHeads = headOptions.filter((h: any) => h.type === "Liability");

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Banner */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">Internal cost prices and net margins hidden. Only legal outward/inward invoice tax records shown.</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Landmark className="w-6 h-6" />
          Investment & Asset Balances
        </h2>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto gap-1">
          <TabsTrigger value="investment-heads" className="flex items-center gap-1 text-xs">
            <Landmark className="w-3.5 h-3.5" />Investment Heads
          </TabsTrigger>
          <TabsTrigger value="investment" className="flex items-center gap-1 text-xs">
            <TrendingUp className="w-3.5 h-3.5" />Investment
          </TabsTrigger>
          <TabsTrigger value="fixed-asset" className="flex items-center gap-1 text-xs">
            <Building2 className="w-3.5 h-3.5" />Fixed Asset
          </TabsTrigger>
          <TabsTrigger value="current-asset" className="flex items-center gap-1 text-xs">
            <Wallet className="w-3.5 h-3.5" />Current Asset
          </TabsTrigger>
          <TabsTrigger value="liability-receive" className="flex items-center gap-1 text-xs">
            <ArrowDownCircle className="w-3.5 h-3.5" />Liability Receive
          </TabsTrigger>
          <TabsTrigger value="liability-pay" className="flex items-center gap-1 text-xs">
            <ArrowUpCircle className="w-3.5 h-3.5" />Liability Pay
          </TabsTrigger>
          <TabsTrigger value="liability-report" className="flex items-center gap-1 text-xs">
            <FileBarChart className="w-3.5 h-3.5" />Liability Report
          </TabsTrigger>
          <TabsTrigger value="depreciation" className="flex items-center gap-1 text-xs">
            <Calculator className="w-3.5 h-3.5" />Depreciation Ledger
          </TabsTrigger>
          <TabsTrigger value="asset-ledger" className="flex items-center gap-1 text-xs">
            <BookOpen className="w-3.5 h-3.5" />Asset Ledger
          </TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════
            TAB 1: INVESTMENT HEADS
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="investment-heads">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-4">
            <StatCard label="Total Heads" value={headsStats.total} icon={Landmark} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
            <StatCard label="Active Heads" value={headsStats.active} icon={CheckCircle} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
            <StatCard label="Total Opening Balance" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(headsStats.totalOpening)} icon={Banknote} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
          </div>

          {/* Actions Bar */}
          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Investment Heads</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => downloadCSVTemplate("heads")}>
                    <Download className="w-4 h-4 mr-1" />CSV Template
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => handleImportCSV("/api/investment-heads", headsImportFields, loadHeads)}>
                    <Upload className="w-4 h-4 mr-1" />Import CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Investment-Heads", headsExportColumns, filteredHeads)}>
                    <Download className="w-4 h-4 mr-1" />Export CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportPDF("Investment-Heads", headsExportColumns, filteredHeads)}>
                    <FileDown className="w-4 h-4 mr-1" />Export PDF
                  </Button>
                  <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openHeadsCreate} disabled={isVatAuditor}>
                    <Plus className="w-4 h-4 mr-1" />Create Head
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search by code, name or type..." value={headsSearch} onChange={(e) => setHeadsSearch(e.target.value)} className="pl-10" />
                </div>
                <Button variant="outline" size="sm" onClick={loadHeads}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <div className="overflow-auto max-h-[65vh] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10"></TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Opening Balance</TableHead>
                      <TableHead>Share %</TableHead>
                      <TableHead>Capital Value</TableHead>
                      <TableHead>Ledger</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {headsLoading ? (
                      <TableRow><TableCell colSpan={10} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredHeads.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No investment heads found</TableCell></TableRow>
                    ) : filteredHeads.map((item: any) => (
                      <React.Fragment key={item.id}>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(setExpandedHeads, item.id)}>
                              {expandedHeads.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.code}</TableCell>
                          <TableCell className="text-slate-900 dark:text-white">{item.name}</TableCell>
                          <TableCell><Badge className={TYPE_BADGE[item.type] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}>{item.type}</Badge></TableCell>
                          <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.openingBalance)}</TableCell>
                          <TableCell className="font-mono text-sm">{item.sharePercentage != null ? `${item.sharePercentage}%` : "—"}</TableCell>
                          <TableCell className="font-mono">{item.capitalValue != null ? (isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.capitalValue)) : "—"}</TableCell>
                          <TableCell>
                            {Number(item.openingBalance) > 0 ? (
                              headsLedgerSync[item.id] ? (
                                <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]"><CheckCircle className="w-3 h-3 mr-1" />Synced</Badge>
                              ) : (
                                <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">Pending</Badge>
                              )
                            ) : (
                              <Badge variant="outline" className="text-[10px]">N/A</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={item.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                              {item.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openHeadsEdit(item)} disabled={isVatAuditor}><Edit className="w-3.5 h-3.5" /></Button>
                              <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setHeadsDelete(item)} disabled={isVatAuditor}><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedHeads.has(item.id) && (
                          <TableRow>
                            <TableCell colSpan={10} className="bg-muted/30 p-3">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                                <div><span className="text-muted-foreground">Description:</span> <span className="font-medium text-slate-900 dark:text-white">{item.description || "—"}</span></div>
                                <div><span className="text-muted-foreground">Opening Type:</span> <span className="font-medium text-slate-900 dark:text-white">{item.openingType || "None"}</span></div>
                                <div><span className="text-muted-foreground">Asset Count:</span> <span className="font-medium text-slate-900 dark:text-white">{item._count?.assets ?? 0}</span></div>
                                <div><span className="text-muted-foreground">Liability Count:</span> <span className="font-medium text-slate-900 dark:text-white">{item._count?.liabilities ?? 0}</span></div>
                                {item.sharePercentage != null && <div><span className="text-muted-foreground">Share %:</span> <span className="font-medium text-slate-900 dark:text-white">{item.sharePercentage}%</span></div>}
                                {item.capitalValue != null && <div><span className="text-muted-foreground">Capital Value:</span> <span className="font-medium text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.capitalValue)}</span></div>}
                                {Number(item.openingBalance) > 0 && (
                                  <div><span className="text-muted-foreground">Ledger:</span>{" "}
                                    {headsLedgerSync[item.id] ? (
                                      <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">✓ Double-Entry Posted</Badge>
                                    ) : (
                                      <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px]">Awaiting Sync</Badge>
                                    )}
                                  </div>
                                )}
                                {item.profileImage && <div><span className="text-muted-foreground">Profile:</span> <img src={item.profileImage} alt="Profile" className="inline-block w-8 h-8 rounded-full ml-1 object-cover" /></div>}
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {filteredHeads.length} of {heads.length} heads</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 2: INVESTMENT
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="investment">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
            <StatCard label="Total Investment Heads" value={investSummary?.totalHeads ?? investments.length} icon={Landmark} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
            <StatCard label="Total Opening Balance" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(investSummary?.grandOpeningBalances ?? 0)} icon={Banknote} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-900/30" />
            <StatCard label="Total Invested Amount" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(investSummary?.grandTotalAssets ?? 0)} icon={Banknote} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
            <StatCard label="Total Returns" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(investSummary?.grandTotalLiabilities ?? 0)} icon={TrendingUp} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
            <StatCard label="Net Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(investSummary?.grandNetValue ?? 0)} icon={CheckCircle} color="text-cyan-600" bg="bg-cyan-50 dark:bg-cyan-900/30" />
          </div>

          {/* Actions Bar */}
          <div className="flex items-center justify-end gap-2 mt-4 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => downloadCSVTemplate("assets")}>
              <Download className="w-4 h-4 mr-1" />CSV Template
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExportCSV("Investments", investExportColumns, investments)}>
              <Download className="w-4 h-4 mr-1" />Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => doExportPDF("Investments", investExportColumns, investments)}>
              <FileDown className="w-4 h-4 mr-1" />Export PDF
            </Button>
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => {
              setInvestFormData({
                investmentHeadId: "", entryType: "asset", date: new Date().toISOString().split("T")[0],
                amount: 0, assetCategory: "Fixed", description: "", isActive: true,
              });
              setInvestForm(true);
            }} disabled={isVatAuditor}>
              <Plus className="w-4 h-4 mr-1" />Add Entry
            </Button>
            <Button variant="outline" size="sm" onClick={loadInvestments}><RefreshCw className="w-4 h-4" /></Button>
          </div>

          {/* Investment Heads Cards */}
          {investLoading ? (
            <div className="flex items-center justify-center py-20"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : investments.length === 0 ? (
            <Card className="mt-4"><CardContent className="p-8 text-center text-muted-foreground">No investment heads of type &quot;Investment&quot; found</CardContent></Card>
          ) : (
            <div className="space-y-3 mt-4">
              {investments.map((head: any) => (
                <Card key={head.id}>
                  <CardHeader
                    className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg cursor-pointer"
                    onClick={() => toggleExpand(setExpandedInvest, head.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {expandedInvest.has(head.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        <div>
                          <CardTitle className="text-sm font-medium">{head.name}</CardTitle>
                          <p className="text-xs text-slate-300 font-mono">{head.code}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-wrap">
                        <span>Opening: <span className="font-mono font-bold">{isVatAuditor ? "N/A" : fmtCurrency(head.openingBalance)}</span></span>
                        <span>Assets: <span className="font-mono font-bold">{isVatAuditor ? "N/A" : fmtCurrency(head.totalAssets)}</span></span>
                        <span>Liabilities: <span className="font-mono font-bold">{isVatAuditor ? "N/A" : fmtCurrency(head.totalLiabilities)}</span></span>
                        <span>Net: <span className="font-mono font-bold">{isVatAuditor ? "N/A" : fmtCurrency(head.netValue)}</span></span>
                        {head.sharePercentage != null && <span>Share: <span className="font-mono">{head.sharePercentage}%</span></span>}
                        {head.capitalValue != null && <span>Capital: <span className="font-mono font-bold">{isVatAuditor ? "N/A" : fmtCurrency(head.capitalValue)}</span></span>}
                        <Badge className="bg-emerald-500/20 text-emerald-300 text-[10px]">✓ Double-Entry Linked</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  {expandedInvest.has(head.id) && (
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Assets mini-table */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                            Assets ({head.assets?.length ?? 0})
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">COA Linked</Badge>
                          </h4>
                          {head.assets?.length > 0 ? (
                            <div className="overflow-auto max-h-48 rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    <TableHead className="text-xs">Date</TableHead>
                                    <TableHead className="text-xs">Category</TableHead>
                                    <TableHead className="text-xs">Amount</TableHead>
                                    <TableHead className="text-xs">Description</TableHead>
                                    <TableHead className="text-xs w-16">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {head.assets.map((a: any) => (
                                    <TableRow key={a.id}>
                                      <TableCell className="text-xs">{fmtDate(a.date)}</TableCell>
                                      <TableCell className="text-xs"><Badge className={CATEGORY_BADGE[a.assetCategory] || ""}>{a.assetCategory}</Badge></TableCell>
                                      <TableCell className="text-xs font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(a.amount)}</TableCell>
                                      <TableCell className="text-xs">{a.description || "—"}</TableCell>
                                      <TableCell className="text-xs">
                                        <div className="flex gap-1">
                                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => openAssetEdit(a, a.assetCategory || "Fixed")} disabled={isVatAuditor}><Edit className="w-3 h-3" /></Button>
                                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500" onClick={() => setAssetsDelete(a)} disabled={isVatAuditor || !isAdmin}><Trash2 className="w-3 h-3" /></Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No assets</p>
                          )}
                        </div>
                        {/* Liabilities mini-table */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                            Liabilities ({head.liabilities?.length ?? 0})
                            <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">COA Linked</Badge>
                          </h4>
                          {head.liabilities?.length > 0 ? (
                            <div className="overflow-auto max-h-48 rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    <TableHead className="text-xs">Date</TableHead>
                                    <TableHead className="text-xs">Type</TableHead>
                                    <TableHead className="text-xs">Method</TableHead>
                                    <TableHead className="text-xs">Amount</TableHead>
                                    <TableHead className="text-xs">Description</TableHead>
                                    <TableHead className="text-xs w-16">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {head.liabilities.map((l: any) => (
                                    <TableRow key={l.id}>
                                      <TableCell className="text-xs">{fmtDate(l.date)}</TableCell>
                                      <TableCell className="text-xs"><Badge variant="outline">{l.type}</Badge></TableCell>
                                      <TableCell className="text-xs"><Badge className={PAYMENT_METHOD_BADGE[l.paymentMethod] || ""}>{l.paymentMethod || "—"}</Badge></TableCell>
                                      <TableCell className="text-xs font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(l.amount)}</TableCell>
                                      <TableCell className="text-xs">{l.description || "—"}</TableCell>
                                      <TableCell className="text-xs">
                                        <div className="flex gap-1">
                                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => openLiabEdit(l, l.type || "received")} disabled={isVatAuditor}><Edit className="w-3 h-3" /></Button>
                                          <Button variant="ghost" size="sm" className="h-5 w-5 p-0 text-red-500" onClick={() => l.type === "received" ? setLiabReceiveDelete(l) : setLiabPayDelete(l)} disabled={isVatAuditor || !isAdmin}><Trash2 className="w-3 h-3" /></Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">No liabilities</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 3: FIXED ASSET
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="fixed-asset">
          {/* Enhanced Summary Cards — Fixed Asset */}
          {(() => {
            const totalPurchaseValue = filteredAssets.reduce((s: number, a: any) => s + (typeof a.purchaseValue === "number" ? a.purchaseValue : 0), 0);
            const totalAccumDep = filteredAssets.reduce((s: number, a: any) => s + (typeof a.accumulatedDepreciation === "number" ? a.accumulatedDepreciation : 0), 0);
            const totalNBV = filteredAssets.reduce((s: number, a: any) => s + (typeof a.netBookValue === "number" ? a.netBookValue : 0), 0);
            const depCoverage = totalPurchaseValue > 0 ? Math.round((totalAccumDep / totalPurchaseValue) * 100) : 0;
            return (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                <StatCard label="Total Fixed Assets" value={filteredAssets.length} icon={Building2} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
                <StatCard label="Total Purchase Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(totalPurchaseValue)} icon={Banknote} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
                <StatCard label="Total Accum. Dep." value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(totalAccumDep)} icon={TrendingUp} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
                <StatCard label="Net Book Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(totalNBV)} icon={Calculator} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-900/30" />
                <StatCard label="Dep. Coverage %" value={`${depCoverage}%`} icon={Percent} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-900/30" />
              </div>
            );
          })()}

          {/* Actions Bar */}
          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">Fixed Assets <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">COA Linked</Badge></CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => downloadCSVTemplate("assets")}>
                    <Download className="w-4 h-4 mr-1" />CSV Template
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => handleImportCSV("/api/assets", assetsImportFields, loadAssets)}>
                    <Upload className="w-4 h-4 mr-1" />Import CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Fixed-Assets", assetsExportColumns, prepareAssetExport(filteredAssets))}>
                    <Download className="w-4 h-4 mr-1" />Export CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => {
                    const fixedExportCols = [
                      ...assetsExportColumns,
                      { key: "depreciationRate", label: "Dep. Rate", type: "text" as const },
                      { key: "remainingLife", label: "Remaining Life", type: "text" as const },
                    ];
                    const fixedExportData = prepareAssetExport(filteredAssets).map((a: any) => {
                      const remainingLife = a.purchaseValue > 0 && (a.purchaseValue - (a.salvageValue || 0)) > 0
                        ? Math.max(0, ((a.netBookValue - (a.salvageValue || 0)) / (a.purchaseValue - (a.salvageValue || 0))) * 100)
                        : 0;
                      return {
                        ...a,
                        depreciationRate: a.depreciationRate ? `${a.depreciationRate}%` : "—",
                        remainingLife: `${Math.round(remainingLife)}%`,
                      };
                    });
                    doExportPDF("Fixed-Assets", fixedExportCols, fixedExportData);
                  }}>
                    <FileDown className="w-4 h-4 mr-1" />Export PDF
                  </Button>
                  <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => openAssetCreate("Fixed")} disabled={isVatAuditor}>
                    <Plus className="w-4 h-4 mr-1" />Register Corporate Asset
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search fixed assets..." value={assetsSearch} onChange={(e) => setAssetsSearch(e.target.value)} className="pl-10" />
                </div>
                <Button variant="outline" size="sm" onClick={loadAssets}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <div className="overflow-auto max-h-[65vh] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Investment Head</TableHead>
                      <TableHead>Sub-Category</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Purchase Value</TableHead>
                      <TableHead className="text-right">Salvage Value</TableHead>
                      <TableHead>Useful Life</TableHead>
                      <TableHead>Dep. Rate</TableHead>
                      <TableHead className="text-right">Accum. Dep.</TableHead>
                      <TableHead className="text-right">Net Book Value</TableHead>
                      <TableHead>Remaining Life</TableHead>
                      <TableHead>Ledger</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assetsLoading ? (
                      <TableRow><TableCell colSpan={14} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredAssets.length === 0 ? (
                      <TableRow><TableCell colSpan={14} className="h-24 text-center text-muted-foreground">No fixed assets found</TableCell></TableRow>
                    ) : filteredAssets.map((item: any) => {
                      const remainingLife = item.purchaseValue > 0 && (item.purchaseValue - (item.salvageValue || 0)) > 0
                        ? Math.max(0, ((item.netBookValue - (item.salvageValue || 0)) / (item.purchaseValue - (item.salvageValue || 0))) * 100)
                        : 0;
                      const isFullyDepreciated = item.netBookValue <= (item.salvageValue || 0);
                      return (
                        <TableRow key={item.id} className={`hover:bg-muted/50 ${isFullyDepreciated ? "bg-orange-50 dark:bg-orange-900/10" : ""}`}>
                          <TableCell className="text-slate-900 dark:text-white">{fmtDate(item.date)}</TableCell>
                          <TableCell className="text-slate-900 dark:text-white">{item.investmentHead?.name || "—"}</TableCell>
                          <TableCell>
                            {item.assetSubCategory ? (
                              <Badge variant="outline" className="text-xs">{item.assetSubCategory}</Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            {item.locationTag ? (
                              <Badge variant="outline" className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />{item.locationTag}</Badge>
                            ) : "—"}
                          </TableCell>
                          <TableCell className="font-mono text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.purchaseValue)}</TableCell>
                          <TableCell className="font-mono text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.salvageValue)}</TableCell>
                          <TableCell>{item.usefulLifeMonths ? `${item.usefulLifeMonths} mo` : "—"}</TableCell>
                          <TableCell>{item.depreciationRate ? `${item.depreciationRate}%` : "—"}</TableCell>
                          <TableCell className="font-mono text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.accumulatedDepreciation)}</TableCell>
                          <TableCell className="font-mono text-right font-bold">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.netBookValue)}</TableCell>
                          <TableCell>
                            {isFullyDepreciated ? (
                              <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px]">Fully Depreciated</Badge>
                            ) : (
                              <div className="flex items-center gap-2 min-w-[100px]">
                                <Progress value={remainingLife} className="h-2 flex-1" />
                                <span className="text-xs text-muted-foreground whitespace-nowrap">{Math.round(remainingLife)}%</span>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            {ledgerSyncStatus[item.id] === "Synced" ? (
                              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                                <CheckCircle className="w-3 h-3" />Synced
                              </Badge>
                            ) : (
                              <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge className={item.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                              {item.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openAssetEdit(item, "Fixed")} disabled={isVatAuditor}><Edit className="w-3.5 h-3.5" /></Button>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0}>
                                      <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setAssetsDelete(item)} disabled={isVatAuditor || !isAdmin}><Trash2 className="w-3.5 h-3.5" /></Button>
                                    </span>
                                  </TooltipTrigger>
                                  {!isAdmin && <TooltipContent>Only administrators can delete financial posts</TooltipContent>}
                                </Tooltip>
                              </TooltipProvider>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {filteredAssets.length} of {assets.length} fixed assets</div>
              {!isAdmin && <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Manager restriction: Only administrators can delete financial posts</div>}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 4: CURRENT ASSET
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="current-asset">
          {/* Enhanced Summary Cards — Current Asset */}
          {(() => {
            const syncedCount = filteredCurrentAssets.filter((a: any) => ledgerSyncStatus[a.id] === "Synced").length;
            const syncRate = filteredCurrentAssets.length > 0 ? Math.round((syncedCount / filteredCurrentAssets.length) * 100) : 0;
            return (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <StatCard label="Total Current Assets" value={filteredCurrentAssets.length} icon={Wallet} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
                <StatCard label="Total Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(currentAssetsStats.totalValue)} icon={Banknote} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
                <StatCard label="Active Count" value={currentAssetsStats.activeCount} icon={CheckCircle} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
                <StatCard label="Ledger Sync Rate" value={`${syncRate}%`} icon={BookOpen} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-900/30" />
              </div>
            );
          })()}

          {/* Actions Bar */}
          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2">Current Assets <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">COA Linked</Badge></CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => downloadCSVTemplate("assets")}>
                    <Download className="w-4 h-4 mr-1" />CSV Template
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => handleImportCSV("/api/assets", assetsImportFields, loadCurrentAssets)}>
                    <Upload className="w-4 h-4 mr-1" />Import CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Current-Assets", assetsExportColumns, prepareAssetExport(filteredCurrentAssets))}>
                    <Download className="w-4 h-4 mr-1" />Export CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => {
                    const currentExportCols = [
                      { key: "date", label: "Date", type: "date" as const },
                      { key: "investmentHeadName", label: "Investment Head", type: "text" as const },
                      { key: "amount", label: "Amount", type: "currency" as const },
                      { key: "assetCategory", label: "Category", type: "text" as const },
                      { key: "assetSubCategory", label: "Sub-Category", type: "text" as const },
                      { key: "locationTag", label: "Location", type: "text" as const },
                      { key: "description", label: "Description", type: "text" as const },
                      { key: "isActive", label: "Status", type: "boolean" as const },
                    ];
                    doExportPDF("Current-Assets", currentExportCols, prepareAssetExport(filteredCurrentAssets));
                  }}>
                    <FileDown className="w-4 h-4 mr-1" />Export PDF
                  </Button>
                  <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => openAssetCreate("Current")} disabled={isVatAuditor}>
                    <Plus className="w-4 h-4 mr-1" />Post Capital Investment
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Search current assets..." value={currentAssetsSearch} onChange={(e) => setCurrentAssetsSearch(e.target.value)} className="pl-10" />
                </div>
                <Button variant="outline" size="sm" onClick={loadCurrentAssets}><RefreshCw className="w-4 h-4" /></Button>
              </div>
              <div className="overflow-auto max-h-[65vh] rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Investment Head</TableHead>
                      <TableHead>Sub-Category</TableHead>
                      <TableHead>Location</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Ledger</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentAssetsLoading ? (
                      <TableRow><TableCell colSpan={10} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredCurrentAssets.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No current assets found</TableCell></TableRow>
                    ) : filteredCurrentAssets.map((item: any) => (
                      <TableRow key={item.id} className="hover:bg-muted/50">
                        <TableCell className="text-slate-900 dark:text-white">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-slate-900 dark:text-white">{item.investmentHead?.name || "—"}</TableCell>
                        <TableCell>
                          {item.assetSubCategory ? (
                            <Badge variant="outline" className="text-xs">{item.assetSubCategory}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell>
                          {item.locationTag ? (
                            <Badge variant="outline" className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />{item.locationTag}</Badge>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.amount)}</TableCell>
                        <TableCell><Badge className={CATEGORY_BADGE[item.assetCategory] || "bg-slate-100 text-slate-700"}>{item.assetCategory}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate">{item.description || "—"}</TableCell>
                        <TableCell>
                          {ledgerSyncStatus[item.id] === "Synced" ? (
                            <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />Synced
                            </Badge>
                          ) : (
                            <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={item.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                            {item.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openAssetEdit(item, "Current")} disabled={isVatAuditor}><Edit className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setCurrentAssetsDelete(item)} disabled={isVatAuditor}><Trash2 className="w-3.5 h-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {filteredCurrentAssets.length} of {currentAssets.length} current assets</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 5: LIABILITY RECEIVE (Enhanced with AP Sync + Aging)
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="liability-receive">
          {(() => {
            const apSyncedRate = apAgingData?.apSyncStats
              ? `${apAgingData.apSyncStats.syncRate}%`
              : "—";
            return (
              <>
                {/* Summary Cards — 5 cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                  <StatCard label="Total Received" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabReceiveStats.total)} icon={ArrowDownCircle} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
                  <StatCard label="Cash Received" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabReceiveStats.cash)} icon={Banknote} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
                  <StatCard label="Bank Transfer" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabReceiveStats.bank)} icon={Building2} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
                  <StatCard label="Cheque" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabReceiveStats.cheque)} icon={Wallet} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-900/30" />
                  <StatCard label="AP Synced Rate" value={apSyncedRate} icon={CheckCircle} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-900/30" />
                </div>

                {/* Actions Bar */}
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        Liability Receive
                        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">AP Linked</Badge>
                      </CardTitle>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => downloadCSVTemplate("liabilities")}>
                          <Download className="w-4 h-4 mr-1" />CSV Template
                        </Button>
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => handleImportCSV("/api/liabilities", liabImportFields, loadLiabReceive)}>
                          <Upload className="w-4 h-4 mr-1" />Import CSV
                        </Button>
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Liability-Receive", liabExportColumns, prepareLiabExport(filteredLiabReceive))}>
                          <Download className="w-4 h-4 mr-1" />Export CSV
                        </Button>
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => {
                          try {
                            const enhancedLiabExportColumns = liabExportColumns;
                            const maskedKeys = getVatMaskedKeys(enhancedLiabExportColumns, isVatAuditor);
                            exportToPDF({
                              title: "Liability Receive Statement",
                              subtitle: `Period: ${reportFrom || 'All'} - ${reportTo || 'All'}`,
                              columns: enhancedLiabExportColumns,
                              data: prepareLiabExport(filteredLiabReceive),
                              isVatAuditor,
                              vatMaskedColumns: maskedKeys,
                              orientation: "landscape",
                              company: companyProfile || undefined,
                              financialFooter: {
                                preparedBy: auth.user?.displayName || "",
                                checkedBy: "",
                                authorizedBy: "",
                                printedBy: auth.user?.displayName || auth.user?.email || "",
                              },
                              summaryRows: [
                                {
                                  cells: ["", "", "TOTAL", isVatAuditor ? "N/A" : fmtCurrency(liabReceiveStats.total), "", "", "", "", "", ""],
                                  style: { fillColor: [10, 22, 40], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
                                },
                              ],
                            });
                            toast({ title: "Exported", description: "Liability Receive Statement exported to PDF" });
                          } catch (e: any) {
                            toast({ title: "Error", description: e.message, variant: "destructive" });
                          }
                        }}>
                          <FileDown className="w-4 h-4 mr-1" />Export PDF
                        </Button>
                        <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => openLiabCreate("received")} disabled={isVatAuditor}>
                          <Plus className="w-4 h-4 mr-1" />Create Receive
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input placeholder="Search liability receives..." value={liabReceiveSearch} onChange={(e) => setLiabReceiveSearch(e.target.value)} className="pl-10" />
                      </div>
                      <Button variant="outline" size="sm" onClick={loadLiabReceive}><RefreshCw className="w-4 h-4" /></Button>
                    </div>
                    <div className="overflow-auto max-h-[65vh] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Date</TableHead>
                            <TableHead>Investment Head</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Payment Method</TableHead>
                            <TableHead>AP Status</TableHead>
                            <TableHead>Aging</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Overdue</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-20 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {liabReceiveLoading ? (
                            <TableRow><TableCell colSpan={11} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                          ) : filteredLiabReceive.length === 0 ? (
                            <TableRow><TableCell colSpan={11} className="h-24 text-center text-muted-foreground">No liability receives found</TableCell></TableRow>
                          ) : filteredLiabReceive.map((item: any) => (
                            <TableRow key={item.id} className="hover:bg-muted/50">
                              <TableCell className="text-slate-900 dark:text-white">{fmtDate(item.date)}</TableCell>
                              <TableCell className="text-slate-900 dark:text-white">{item.investmentHead?.name || "—"}</TableCell>
                              <TableCell className="font-mono text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.amount)}</TableCell>
                              <TableCell><Badge className={PAYMENT_METHOD_BADGE[item.paymentMethod] || "bg-slate-100 text-slate-700"}>{item.paymentMethod || "—"}</Badge></TableCell>
                              <TableCell>
                                <Badge className={AP_STATUS_COLORS[item.apSyncStatus] || AP_STATUS_COLORS["Pending"]}>
                                  {item.apSyncStatus || "Pending"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={AGING_BUCKET_COLORS[item.agingBucket] || AGING_BUCKET_COLORS["Current"]}>
                                  {item.agingBucket || "Current"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-slate-900 dark:text-white">{item.dueDate ? fmtDate(item.dueDate) : "—"}</TableCell>
                              <TableCell>
                                {(item.overdueDays || 0) > 0 ? (
                                  <span className="text-red-600 dark:text-red-400 font-semibold">{item.overdueDays}d</span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate">{item.description || "—"}</TableCell>
                              <TableCell>
                                <Badge className={item.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                                  {item.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openLiabEdit(item, "received")} disabled={isVatAuditor}><Edit className="w-3.5 h-3.5" /></Button>
                                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setLiabReceiveDelete(item)} disabled={isVatAuditor}><Trash2 className="w-3.5 h-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Showing {filteredLiabReceive.length} of {liabReceive.length} entries</div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 6: LIABILITY PAY (Enhanced with AP Sync + Aging)
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="liability-pay">
          {(() => {
            const apSyncedRate = apAgingData?.apSyncStats
              ? `${apAgingData.apSyncStats.syncRate}%`
              : "—";
            return (
              <>
                {/* Summary Cards — 5 cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
                  <StatCard label="Total Paid" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabPayStats.total)} icon={ArrowUpCircle} color="text-red-600" bg="bg-red-50 dark:bg-red-900/30" />
                  <StatCard label="Cash Paid" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabPayStats.cash)} icon={Banknote} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
                  <StatCard label="Bank Transfer" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabPayStats.bank)} icon={Building2} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
                  <StatCard label="Cheque" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabPayStats.cheque)} icon={Wallet} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-900/30" />
                  <StatCard label="AP Synced Rate" value={apSyncedRate} icon={CheckCircle} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-900/30" />
                </div>

                {/* Actions Bar */}
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2">
                        Liability Pay
                        <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px]">AP Linked</Badge>
                      </CardTitle>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => downloadCSVTemplate("liabilities")}>
                          <Download className="w-4 h-4 mr-1" />CSV Template
                        </Button>
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => handleImportCSV("/api/liabilities", liabImportFields, loadLiabPay)}>
                          <Upload className="w-4 h-4 mr-1" />Import CSV
                        </Button>
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Liability-Pay", liabExportColumns, prepareLiabExport(filteredLiabPay))}>
                          <Download className="w-4 h-4 mr-1" />Export CSV
                        </Button>
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => {
                          try {
                            const maskedKeys = getVatMaskedKeys(liabExportColumns, isVatAuditor);
                            exportToPDF({
                              title: "Liability Pay Statement",
                              subtitle: `Period: ${reportFrom || 'All'} - ${reportTo || 'All'}`,
                              columns: liabExportColumns,
                              data: prepareLiabExport(filteredLiabPay),
                              isVatAuditor,
                              vatMaskedColumns: maskedKeys,
                              orientation: "landscape",
                              company: companyProfile || undefined,
                              financialFooter: {
                                preparedBy: auth.user?.displayName || "",
                                checkedBy: "",
                                authorizedBy: "",
                                printedBy: auth.user?.displayName || auth.user?.email || "",
                              },
                              summaryRows: [
                                {
                                  cells: ["", "", "TOTAL", isVatAuditor ? "N/A" : fmtCurrency(liabPayStats.total), "", "", "", "", "", ""],
                                  style: { fillColor: [10, 22, 40], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
                                },
                              ],
                            });
                            toast({ title: "Exported", description: "Liability Pay Statement exported to PDF" });
                          } catch (e: any) {
                            toast({ title: "Error", description: e.message, variant: "destructive" });
                          }
                        }}>
                          <FileDown className="w-4 h-4 mr-1" />Export PDF
                        </Button>
                        <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => openLiabCreate("pay")} disabled={isVatAuditor}>
                          <Plus className="w-4 h-4 mr-1" />Create Pay
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <div className="relative flex-1 min-w-[200px] max-w-sm">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input placeholder="Search liability pays..." value={liabPaySearch} onChange={(e) => setLiabPaySearch(e.target.value)} className="pl-10" />
                      </div>
                      <Button variant="outline" size="sm" onClick={loadLiabPay}><RefreshCw className="w-4 h-4" /></Button>
                    </div>
                    <div className="overflow-auto max-h-[65vh] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Date</TableHead>
                            <TableHead>Investment Head</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead>Payment Method</TableHead>
                            <TableHead>AP Status</TableHead>
                            <TableHead>Aging</TableHead>
                            <TableHead>Due Date</TableHead>
                            <TableHead>Overdue</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead className="w-20 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {liabPayLoading ? (
                            <TableRow><TableCell colSpan={11} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                          ) : filteredLiabPay.length === 0 ? (
                            <TableRow><TableCell colSpan={11} className="h-24 text-center text-muted-foreground">No liability pays found</TableCell></TableRow>
                          ) : filteredLiabPay.map((item: any) => (
                            <TableRow key={item.id} className="hover:bg-muted/50">
                              <TableCell className="text-slate-900 dark:text-white">{fmtDate(item.date)}</TableCell>
                              <TableCell className="text-slate-900 dark:text-white">{item.investmentHead?.name || "—"}</TableCell>
                              <TableCell className="font-mono text-right">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.amount)}</TableCell>
                              <TableCell><Badge className={PAYMENT_METHOD_BADGE[item.paymentMethod] || "bg-slate-100 text-slate-700"}>{item.paymentMethod || "—"}</Badge></TableCell>
                              <TableCell>
                                <Badge className={AP_STATUS_COLORS[item.apSyncStatus] || AP_STATUS_COLORS["Pending"]}>
                                  {item.apSyncStatus || "Pending"}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Badge className={AGING_BUCKET_COLORS[item.agingBucket] || AGING_BUCKET_COLORS["Current"]}>
                                  {item.agingBucket || "Current"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-slate-900 dark:text-white">{item.dueDate ? fmtDate(item.dueDate) : "—"}</TableCell>
                              <TableCell>
                                {(item.overdueDays || 0) > 0 ? (
                                  <span className="text-red-600 dark:text-red-400 font-semibold">{item.overdueDays}d</span>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate">{item.description || "—"}</TableCell>
                              <TableCell>
                                <Badge className={item.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                                  {item.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => openLiabEdit(item, "pay")} disabled={isVatAuditor}><Edit className="w-3.5 h-3.5" /></Button>
                                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setLiabPayDelete(item)} disabled={isVatAuditor}><Trash2 className="w-3.5 h-3.5" /></Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Showing {filteredLiabPay.length} of {liabPay.length} entries</div>
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 7: LIABILITY REPORT (Enhanced with Aging + Charts)
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="liability-report">
          {/* Date Range Filter */}
          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
              <CardTitle className="text-base flex items-center gap-2"><FileBarChart className="w-4 h-4" />Liability Report</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">From Date</Label>
                  <Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">To Date</Label>
                  <Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="w-40" />
                </div>
                <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={generateLiabReport} disabled={reportLoading}>
                  {reportLoading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <FileBarChart className="w-4 h-4 mr-1" />}
                  Generate Report
                </Button>
                {reportData && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => {
                      try {
                        const enrichedHeads = (reportData.heads || []).map((h: any) => {
                          const apHead = (apAgingData?.headOutstanding || []).find((ah: any) => ah.id === h.id);
                          return { ...h, agingBucket: apHead?.agingBucket || "Current", apSyncStatus: apHead?.apSyncStatus || "Pending" };
                        });
                        exportToCSV({ title: "Liability-Report", columns: reportExportColumns, data: enrichedHeads, isVatAuditor, vatMaskedColumns: getVatMaskedKeys(reportExportColumns) });
                        toast({ title: "Exported", description: "Liability Report exported to CSV" });
                      } catch (e: any) {
                        toast({ title: "Error", description: e.message, variant: "destructive" });
                      }
                    }}>
                      <Download className="w-4 h-4 mr-1" />Export CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => {
                      try {
                        const enrichedHeads = (reportData.heads || []).map((h: any) => {
                          const apHead = (apAgingData?.headOutstanding || []).find((ah: any) => ah.id === h.id);
                          return { ...h, agingBucket: apHead?.agingBucket || "Current", apSyncStatus: apHead?.apSyncStatus || "Pending" };
                        });
                        const maskedKeys = getVatMaskedKeys(reportExportColumns, isVatAuditor);
                        exportToPDF({
                          title: "Liability Report",
                          subtitle: `Period: ${reportFrom || 'All'} - ${reportTo || 'All'}`,
                          columns: reportExportColumns,
                          data: enrichedHeads,
                          isVatAuditor,
                          vatMaskedColumns: maskedKeys,
                          orientation: "landscape",
                          company: companyProfile || undefined,
                          financialFooter: {
                            preparedBy: auth.user?.displayName || "",
                            checkedBy: "",
                            authorizedBy: "",
                            printedBy: auth.user?.displayName || auth.user?.email || "",
                          },
                        });
                        toast({ title: "Exported", description: "Liability Report exported to PDF" });
                      } catch (e: any) {
                        toast({ title: "Error", description: e.message, variant: "destructive" });
                      }
                    }}>
                      <FileDown className="w-4 h-4 mr-1" />Export PDF
                    </Button>
                  </>
                )}
              </div>

              {/* Report Data */}
              {reportData ? (
                <>
                  {(() => {
                    const apSyncPct = apAgingData?.apSyncStats ? `${apAgingData.apSyncStats.syncRate}%` : "—";
                    const overdueCount = apAgingData?.overdueStats?.overdueCount ?? 0;
                    return (
                      <>
                        {/* Summary Cards — 7 cards */}
                        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-4">
                          <StatCard label="Total Heads" value={reportData.summary?.totalHeads ?? 0} icon={Landmark} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
                          <StatCard label="Total Opening" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(reportData.summary?.totalOpening ?? 0)} icon={Banknote} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
                          <StatCard label="Total Received" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(reportData.summary?.totalReceived ?? 0)} icon={ArrowDownCircle} color="text-cyan-600" bg="bg-cyan-50 dark:bg-cyan-900/30" />
                          <StatCard label="Total Paid" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(reportData.summary?.totalPaid ?? 0)} icon={ArrowUpCircle} color="text-red-600" bg="bg-red-50 dark:bg-red-900/30" />
                          <StatCard label="Outstanding Balance" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(reportData.summary?.totalOutstanding ?? 0)} icon={CheckCircle} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
                          <StatCard label="AP Synced %" value={apSyncPct} icon={CheckCircle} color="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-900/30" />
                          <StatCard label="Overdue Count" value={overdueCount} icon={AlertTriangle} color="text-red-600" bg="bg-red-50 dark:bg-red-900/30" />
                        </div>

                        {/* Aging Buckets Section */}
                        {apAgingData?.agingBuckets && (
                          <Card className="mb-4">
                            <CardHeader className="py-3 px-4">
                              <CardTitle className="text-sm flex items-center gap-2">
                                <AlertTriangle className="w-4 h-4" />AP Aging Buckets
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="p-4">
                              {(() => {
                                const buckets = apAgingData.agingBuckets;
                                const totalAmount = Object.values(buckets).reduce((s: number, b: any) => s + (b.totalAmount || 0), 0);
                                const bucketOrder = ["Current", "1-30", "31-60", "61-90", "90+"];
                                const bucketBarColors: Record<string, string> = {
                                  "Current": "bg-green-500",
                                  "1-30": "bg-yellow-500",
                                  "31-60": "bg-orange-500",
                                  "61-90": "bg-red-500",
                                  "90+": "bg-red-800",
                                };
                                return (
                                  <>
                                    {/* Stacked Bar */}
                                    <div className="flex h-8 rounded-lg overflow-hidden mb-4">
                                      {bucketOrder.map((key) => {
                                        const bucket = buckets[key];
                                        const pct = totalAmount > 0 && bucket ? (bucket.totalAmount / totalAmount) * 100 : 0;
                                        return pct > 0 ? (
                                          <div
                                            key={key}
                                            className={`${bucketBarColors[key]} flex items-center justify-center text-white text-[10px] font-bold transition-all`}
                                            style={{ width: `${pct}%` }}
                                            title={`${key}: ${fmtCurrency(bucket?.totalAmount || 0)} (${pct.toFixed(1)}%)`}
                                          >
                                            {pct > 8 ? `${pct.toFixed(0)}%` : ""}
                                          </div>
                                        ) : null;
                                      })}
                                    </div>
                                    {/* Bucket Details */}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                                      {bucketOrder.map((key) => {
                                        const bucket = buckets[key];
                                        return (
                                          <div key={key} className="flex items-center gap-2 p-2 rounded-lg border">
                                            <div className={`w-3 h-3 rounded-full ${bucketBarColors[key]}`} />
                                            <div>
                                              <p className="text-xs font-semibold text-slate-900 dark:text-white">{key} Days</p>
                                              <p className="text-xs text-muted-foreground">{bucket?.count || 0} items</p>
                                              <p className="text-xs font-mono">{isVatAuditor ? "N/A" : fmtCurrency(bucket?.totalAmount || 0)}</p>
                                            </div>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  </>
                                );
                              })()}
                            </CardContent>
                          </Card>
                        )}

                        {/* Chart Visualization */}
                        {apAgingData?.agingBuckets && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            {/* PieChart — Aging Bucket Distribution */}
                            <Card>
                              <CardHeader className="py-3 px-4">
                                <CardTitle className="text-sm">Aging Bucket Distribution</CardTitle>
                              </CardHeader>
                              <CardContent className="p-4">
                                {(() => {
                                  const PIE_COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444", "#991b1b"];
                                  const bucketOrder = ["Current", "1-30", "31-60", "61-90", "90+"];
                                  const pieData = bucketOrder.map((key, i) => ({
                                    name: `${key} Days`,
                                    value: apAgingData.agingBuckets[key]?.totalAmount || 0,
                                    fill: PIE_COLORS[i],
                                  })).filter(d => d.value > 0);
                                  return pieData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={250}>
                                      <PieChart>
                                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }: any) => `${name}: ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                                          {pieData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                          ))}
                                        </Pie>
                                        <RechartsTooltip formatter={(val: number) => fmtCurrency(val)} />
                                      </PieChart>
                                    </ResponsiveContainer>
                                  ) : <p className="text-center text-muted-foreground py-8">No aging data to chart</p>;
                                })()}
                              </CardContent>
                            </Card>

                            {/* BarChart — Outstanding Balance per Head */}
                            <Card>
                              <CardHeader className="py-3 px-4">
                                <CardTitle className="text-sm">Outstanding Balance per Head</CardTitle>
                              </CardHeader>
                              <CardContent className="p-4">
                                {(() => {
                                  const headData = (apAgingData?.headOutstanding || [])
                                    .filter((h: any) => h.outstanding > 0)
                                    .sort((a: any, b: any) => b.outstanding - a.outstanding)
                                    .slice(0, 10)
                                    .map((h: any) => ({
                                      name: h.name?.length > 15 ? h.name.slice(0, 15) + "…" : h.name || "—",
                                      outstanding: h.outstanding,
                                    }));
                                  return headData.length > 0 ? (
                                    <ResponsiveContainer width="100%" height={250}>
                                      <BarChart data={headData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                                        <YAxis tick={{ fontSize: 10 }} />
                                        <RechartsTooltip formatter={(val: number) => fmtCurrency(val)} />
                                        <Bar dataKey="outstanding" name="Outstanding" fill="#ef4444" />
                                      </BarChart>
                                    </ResponsiveContainer>
                                  ) : <p className="text-center text-muted-foreground py-8">No outstanding balances</p>;
                                })()}
                              </CardContent>
                            </Card>
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <Separator className="my-4" />

                  {/* Per-head Breakdown Table — Enhanced */}
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Per-Head Breakdown</h3>
                  <div className="overflow-auto max-h-[65vh] rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Opening</TableHead>
                          <TableHead>Received</TableHead>
                          <TableHead>Paid</TableHead>
                          <TableHead>Current Balance</TableHead>
                          <TableHead>AP Status</TableHead>
                          <TableHead>Aging</TableHead>
                          <TableHead>Transactions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reportData.heads || []).length === 0 ? (
                          <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No liability heads found for this period</TableCell></TableRow>
                        ) : (reportData.heads || []).map((head: any) => {
                          const apHead = (apAgingData?.headOutstanding || []).find((ah: any) => ah.id === head.id);
                          const isOverdue = (apHead?.overdueDays || 0) > 0;
                          return (
                            <React.Fragment key={head.id}>
                              <TableRow className="hover:bg-muted/50">
                                <TableCell>
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(setExpandedReport, head.id)}>
                                    {expandedReport.has(head.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                  </Button>
                                </TableCell>
                                <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{head.code}</TableCell>
                                <TableCell className="text-slate-900 dark:text-white">{head.name}</TableCell>
                                <TableCell className="font-mono text-right">{fmtCurrency(head.openingBalance)}</TableCell>
                                <TableCell className="font-mono text-right">{fmtCurrency(head.totalReceived)}</TableCell>
                                <TableCell className="font-mono text-right">{fmtCurrency(head.totalPaid)}</TableCell>
                                <TableCell className={`font-mono text-right font-bold ${isOverdue ? "text-red-600 dark:text-red-400" : ""}`}>{fmtCurrency(head.currentBalance)}</TableCell>
                                <TableCell>
                                  <Badge className={AP_STATUS_COLORS[apHead?.apSyncStatus || "Pending"] || AP_STATUS_COLORS["Pending"]}>
                                    {apHead?.apSyncStatus || "Pending"}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <Badge className={AGING_BUCKET_COLORS[apHead?.agingBucket || "Current"] || AGING_BUCKET_COLORS["Current"]}>
                                    {apHead?.agingBucket || "Current"}
                                  </Badge>
                                </TableCell>
                                <TableCell><Badge variant="outline">{head.transactionCount ?? 0}</Badge></TableCell>
                              </TableRow>
                              {expandedReport.has(head.id) && (
                                <TableRow>
                                  <TableCell colSpan={10} className="bg-muted/30 p-3">
                                    {/* Payment Method Breakdown */}
                                    {head.byMethod && head.byMethod.length > 0 && (
                                      <div className="mb-3">
                                        <h5 className="text-xs font-semibold text-muted-foreground mb-1">Payment Method Breakdown</h5>
                                        <div className="flex flex-wrap gap-2">
                                          {head.byMethod.map((m: any, i: number) => (
                                            <div key={i} className="text-xs bg-white dark:bg-slate-800 rounded-md border px-2 py-1">
                                              <Badge className={PAYMENT_METHOD_BADGE[m.method] || "bg-slate-100 text-slate-700"}>{m.method}</Badge>
                                              <span className="ml-1 font-mono">{fmtCurrency(m.received)} / {fmtCurrency(m.paid)}</span>
                                              <span className="ml-1 text-muted-foreground">({m.count} txns)</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Individual Transactions — Enhanced with AP Status */}
                                    {head.transactions && head.transactions.length > 0 && (
                                      <div>
                                        <h5 className="text-xs font-semibold text-muted-foreground mb-1">Transactions</h5>
                                        <div className="overflow-auto max-h-40 rounded-md border">
                                          <Table>
                                            <TableHeader>
                                              <TableRow>
                                                <TableHead className="text-xs">Date</TableHead>
                                                <TableHead className="text-xs">Type</TableHead>
                                                <TableHead className="text-xs">Method</TableHead>
                                                <TableHead className="text-xs">Amount</TableHead>
                                                <TableHead className="text-xs">AP Status</TableHead>
                                                <TableHead className="text-xs">Description</TableHead>
                                              </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                              {head.transactions.map((t: any) => (
                                                <TableRow key={t.id}>
                                                  <TableCell className="text-xs">{fmtDate(t.date)}</TableCell>
                                                  <TableCell className="text-xs"><Badge variant="outline">{t.type}</Badge></TableCell>
                                                  <TableCell className="text-xs"><Badge className={PAYMENT_METHOD_BADGE[t.paymentMethod] || ""}>{t.paymentMethod || "—"}</Badge></TableCell>
                                                  <TableCell className="text-xs font-mono text-right">{fmtCurrency(t.amount)}</TableCell>
                                                  <TableCell className="text-xs">
                                                    <Badge className={AP_STATUS_COLORS[t.apSyncStatus] || AP_STATUS_COLORS["Pending"]}>
                                                      {t.apSyncStatus || "Pending"}
                                                    </Badge>
                                                  </TableCell>
                                                  <TableCell className="text-xs">{t.description || "—"}</TableCell>
                                                </TableRow>
                                              ))}
                                            </TableBody>
                                          </Table>
                                        </div>
                                      </div>
                                    )}
                                  </TableCell>
                                </TableRow>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </>
              ) : (
                <div className="text-center py-16 text-muted-foreground">
                  <FileBarChart className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>Select a date range and click &quot;Generate Report&quot; to view liability data</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB: DEPRECIATION LEDGER (Phase 3)
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="depreciation">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <StatCard label="Total Entries" value={depStats.totalEntries} icon={Calculator} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
            <StatCard label="Total Depreciation" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(depStats.totalDep)} icon={Banknote} color="text-red-600" bg="bg-red-50 dark:bg-red-900/30" />
            <StatCard label="Max Accum. Dep." value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(depStats.totalAccum)} icon={TrendingUp} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
            <StatCard label="Avg Net Book Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(depStats.avgNBV)} icon={Building2} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
          </div>

          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base flex items-center gap-2"><Calculator className="w-4 h-4" />Asset Depreciation Ledger</CardTitle>
                <div className="flex gap-2 flex-wrap items-center">
                  <Input type="month" value={depPeriod} onChange={(e) => setDepPeriod(e.target.value)} className="w-40 text-sm" />
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Depreciation-Ledger", depExportColumns, depreciations.map((d: any) => ({ ...d, assetName: d.asset?.investmentHead?.name || d.assetId || "—" })))}>
                    <Download className="w-4 h-4 mr-1" />Export CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportPDF("Depreciation-Ledger", depExportColumns, depreciations.map((d: any) => ({ ...d, assetName: d.asset?.investmentHead?.name || d.assetId || "—" })), "landscape")}>
                    <FileDown className="w-4 h-4 mr-1" />Export PDF
                  </Button>
                  <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={generateDepreciation} disabled={depGenerating || isVatAuditor}>
                    {depGenerating ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Calculator className="w-4 h-4 mr-1" />}
                    {depGenerating ? "Recalculating Equity Balance & Fixed Asset Ledgers..." : "Generate Monthly Depreciation"}
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={loadDepreciations}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {depLoading ? (
                <div className="flex items-center justify-center py-16"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : depreciations.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Calculator className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>No depreciation entries found. Click &quot;Generate Monthly Depreciation&quot; to create entries for active fixed assets.</p>
                </div>
              ) : (
                <div className="overflow-auto max-h-[65vh] rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Asset / Head</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Depreciation Amount</TableHead>
                        <TableHead>Accum. Depreciation</TableHead>
                        <TableHead>Net Book Value</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {depreciations.map((item: any) => (
                        <React.Fragment key={item.id}>
                          <TableRow className="hover:bg-muted/50">
                            <TableCell>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(setExpandedDep, item.id)}>
                                {expandedDep.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                              </Button>
                            </TableCell>
                            <TableCell className="text-slate-900 dark:text-white font-medium">{item.asset?.investmentHead?.name || "—"}</TableCell>
                            <TableCell>{fmtDate(item.periodDate)}</TableCell>
                            <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.depreciationAmount)}</TableCell>
                            <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.accumulatedDepreciation)}</TableCell>
                            <TableCell className="font-mono font-bold">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.netBookValue)}</TableCell>
                            <TableCell><Badge variant="outline">{item.method || "StraightLine"}</Badge></TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.notes || "—"}</TableCell>
                          </TableRow>
                          {expandedDep.has(item.id) && (
                            <TableRow>
                              <TableCell colSpan={8} className="bg-muted/30 p-3">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                                  <div><span className="text-muted-foreground">Asset ID:</span> <span className="font-mono text-xs">{item.assetId}</span></div>
                                  <div><span className="text-muted-foreground">Purchase Value:</span> <span className="font-mono">{fmtCurrency(item.asset?.purchaseValue)}</span></div>
                                  <div><span className="text-muted-foreground">Salvage Value:</span> <span className="font-mono">{fmtCurrency(item.asset?.salvageValue)}</span></div>
                                  <div><span className="text-muted-foreground">Useful Life:</span> <span>{item.asset?.usefulLifeMonths ?? 0} months</span></div>
                                  <div><span className="text-muted-foreground">Dep. Rate:</span> <span>{item.asset?.depreciationRate ?? 0}%</span></div>
                                  <div><span className="text-muted-foreground">Created:</span> <span>{fmtDate(item.createdAt)}</span></div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <div className="mt-2 text-xs text-muted-foreground">Showing {depreciations.length} depreciation entries</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 9: ASSET LEDGER (Combined Fixed + Current)
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="asset-ledger">
          {(() => {
            const allAssets = [...assets, ...currentAssets];
            // Filter by category
            const filtered = allAssets.filter((a: any) => {
              if (assetLedgerCategoryFilter !== "All" && a.assetCategory !== assetLedgerCategoryFilter) return false;
              if (assetLedgerLocationFilter && !(a.locationTag || "").toLowerCase().includes(assetLedgerLocationFilter.toLowerCase())) return false;
              if (assetLedgerSubCatFilter && !(a.assetSubCategory || "").toLowerCase().includes(assetLedgerSubCatFilter.toLowerCase())) return false;
              return true;
            });
            // Stats
            const totalAssetValue = filtered.reduce((s: number, a: any) => s + (Number(a.amount) || 0), 0);
            const totalDepreciation = filtered.reduce((s: number, a: any) => s + (Number(a.accumulatedDepreciation) || 0), 0);
            const totalNBV = filtered.reduce((s: number, a: any) => s + (Number(a.netBookValue) || 0), 0);
            const depCoverage = totalAssetValue > 0 ? (totalDepreciation / totalAssetValue) * 100 : 0;
            // Unique filter options
            const uniqueLocations = [...new Set(allAssets.map((a: any) => a.locationTag).filter(Boolean))];
            const uniqueSubCats = [...new Set(allAssets.map((a: any) => a.assetSubCategory).filter(Boolean))];
            // Chart data by sub-category
            const chartData = Object.values(
              filtered.reduce((acc: any, a: any) => {
                const cat = a.assetSubCategory || a.assetCategory || "Unclassified";
                if (!acc[cat]) acc[cat] = { name: cat, totalDep: 0, totalNBV: 0, totalPV: 0 };
                acc[cat].totalDep += Number(a.accumulatedDepreciation) || 0;
                acc[cat].totalNBV += Number(a.netBookValue) || 0;
                acc[cat].totalPV += Number(a.purchaseValue) || Number(a.amount) || 0;
                return acc;
              }, {})
            ) as { name: string; totalDep: number; totalNBV: number; totalPV: number }[];
            // Export columns for Asset Ledger
            const ledgerExportCols: ExportColumnDef[] = [
              { key: "date", label: "Date", type: "date" },
              { key: "investmentHeadName", label: "Investment Head", type: "text" },
              { key: "assetSubCategory", label: "Sub-Category", type: "text" },
              { key: "locationTag", label: "Location", type: "text" },
              { key: "assetCategory", label: "Category", type: "text" },
              { key: "purchaseValue", label: "Purchase Value", type: "currency" },
              { key: "accumulatedDepreciation", label: "Accum. Dep.", type: "currency" },
              { key: "netBookValue", label: "Net Book Value", type: "currency" },
              { key: "depreciationRate", label: "Dep. Rate (%)", type: "number" },
              { key: "remainingLifePct", label: "Remaining Life %", type: "number" },
              { key: "isActive", label: "Status", type: "boolean" },
            ];
            const ledgerExportData = filtered.map((a: any) => {
              const pv = Number(a.purchaseValue) || Number(a.amount) || 0;
              const ad = Number(a.accumulatedDepreciation) || 0;
              const ulm = Number(a.usefulLifeMonths) || 0;
              const remLife = pv > 0 && ulm > 0 ? Math.max(0, ((pv - ad) / pv) * 100) : (a.assetCategory === "Current" ? 100 : 0);
              return {
                ...a,
                investmentHeadName: a.investmentHead?.name || "—",
                remainingLifePct: Math.round(remLife * 100) / 100,
              };
            });
            const doLedgerExportPDF = () => {
              try {
                const maskedKeys = getVatMaskedKeys(ledgerExportCols, isVatAuditor);
                exportToPDF({
                  title: "Asset Ledger Report",
                  subtitle: "All Periods",
                  columns: ledgerExportCols,
                  data: ledgerExportData,
                  isVatAuditor,
                  vatMaskedColumns: maskedKeys,
                  company: companyProfile || undefined,
                  financialFooter: {
                    preparedBy: auth.user?.displayName || "",
                    checkedBy: "",
                    authorizedBy: "",
                    printedBy: auth.user?.displayName || auth.user?.email || "",
                  },
                  summaryRows: [
                    { cells: ["Total Asset Value", "", "", "", "", isVatAuditor ? "N/A" : fmtCurrency(totalAssetValue), isVatAuditor ? "N/A" : fmtCurrency(totalDepreciation), isVatAuditor ? "N/A" : fmtCurrency(totalNBV), "", "", "", ""] },
                  ],
                });
                toast({ title: "Exported", description: "Asset Ledger exported to PDF" });
              } catch (e: any) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
              }
            };
            const doLedgerExportCSV = () => {
              try {
                exportToCSV({ title: "Asset-Ledger", columns: ledgerExportCols, data: ledgerExportData, isVatAuditor });
                toast({ title: "Exported", description: "Asset Ledger exported to CSV" });
              } catch (e: any) {
                toast({ title: "Error", description: e.message, variant: "destructive" });
              }
            };

            return (
              <>
                {/* Summary Dashboard */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  <StatCard label="Total Asset Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(totalAssetValue)} icon={Banknote} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
                  <StatCard label="Total Depreciation" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(totalDepreciation)} icon={Calculator} color="text-red-600" bg="bg-red-50 dark:bg-red-900/30" />
                  <StatCard label="Net Book Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(totalNBV)} icon={TrendingUp} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
                  <StatCard label="Dep. Coverage %" value={`${depCoverage.toFixed(1)}%`} icon={CheckCircle} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
                </div>

                {/* Filter Bar */}
                <Card className="mt-4">
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base flex items-center gap-2"><BookOpen className="w-4 h-4" />Asset Ledger</CardTitle>
                      <div className="flex gap-2 flex-wrap">
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={doLedgerExportCSV}>
                          <Download className="w-4 h-4 mr-1" />Export CSV
                        </Button>
                        <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={doLedgerExportPDF}>
                          <FileDown className="w-4 h-4 mr-1" />Export PDF
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      <Select value={assetLedgerCategoryFilter} onValueChange={setAssetLedgerCategoryFilter}>
                        <SelectTrigger className="w-[130px]"><SelectValue placeholder="Category" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="All">All Categories</SelectItem>
                          <SelectItem value="Fixed">Fixed</SelectItem>
                          <SelectItem value="Current">Current</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={assetLedgerSubCatFilter} onValueChange={setAssetLedgerSubCatFilter}>
                        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Sub-Category" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">All Sub-Categories</SelectItem>
                          {uniqueSubCats.map((sc: string) => (
                            <SelectItem key={sc} value={sc}>{sc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={assetLedgerLocationFilter} onValueChange={setAssetLedgerLocationFilter}>
                        <SelectTrigger className="w-[150px]"><SelectValue placeholder="Location" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">All Locations</SelectItem>
                          {uniqueLocations.map((loc: string) => (
                            <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="sm" onClick={() => { setAssetLedgerCategoryFilter("All"); setAssetLedgerSubCatFilter(""); setAssetLedgerLocationFilter(""); }}>
                        <RefreshCw className="w-4 h-4 mr-1" />Reset
                      </Button>
                    </div>

                    {/* Combined Table */}
                    <div className="overflow-auto max-h-[55vh] rounded-md border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/50">
                            <TableHead>Date</TableHead>
                            <TableHead>Investment Head</TableHead>
                            <TableHead>Sub-Category</TableHead>
                            <TableHead>Location</TableHead>
                            <TableHead>Category</TableHead>
                            <TableHead>Purchase Value</TableHead>
                            <TableHead>Accum. Dep.</TableHead>
                            <TableHead>Net Book Value</TableHead>
                            <TableHead>Dep. Rate</TableHead>
                            <TableHead>Remaining Life %</TableHead>
                            <TableHead>Ledger</TableHead>
                            <TableHead>Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {filtered.length === 0 ? (
                            <TableRow><TableCell colSpan={12} className="h-24 text-center text-muted-foreground">No assets found</TableCell></TableRow>
                          ) : filtered.map((item: any) => {
                            const pv = Number(item.purchaseValue) || Number(item.amount) || 0;
                            const ad = Number(item.accumulatedDepreciation) || 0;
                            const ulm = Number(item.usefulLifeMonths) || 0;
                            const remLife = pv > 0 && ulm > 0 ? Math.max(0, ((pv - ad) / pv) * 100) : (item.assetCategory === "Current" ? 100 : 0);
                            const isSynced = ledgerSyncStatus[item.id] === "Synced";
                            return (
                              <TableRow key={item.id} className="hover:bg-muted/50">
                                <TableCell className="text-slate-900 dark:text-white">{fmtDate(item.date)}</TableCell>
                                <TableCell className="text-slate-900 dark:text-white">{item.investmentHead?.name || "—"}</TableCell>
                                <TableCell>
                                  {item.assetSubCategory ? (
                                    <Badge variant="outline" className="text-xs">{item.assetSubCategory}</Badge>
                                  ) : "—"}
                                </TableCell>
                                <TableCell>
                                  {item.locationTag ? (
                                    <Badge variant="outline" className="text-xs flex items-center gap-1"><MapPin className="w-3 h-3" />{item.locationTag}</Badge>
                                  ) : "—"}
                                </TableCell>
                                <TableCell><Badge className={CATEGORY_BADGE[item.assetCategory] || "bg-slate-100 text-slate-700"}>{item.assetCategory}</Badge></TableCell>
                                <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(pv)}</TableCell>
                                <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(ad)}</TableCell>
                                <TableCell className="font-mono font-bold">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.netBookValue)}</TableCell>
                                <TableCell>{item.depreciationRate ? `${Number(item.depreciationRate).toFixed(1)}%` : "—"}</TableCell>
                                <TableCell>{remLife.toFixed(1)}%</TableCell>
                                <TableCell>
                                  {isSynced ? (
                                    <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                                      <CheckCircle className="w-3 h-3" />Synced
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">Pending</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  <Badge className={item.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                                    {item.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">Showing {filtered.length} of {allAssets.length} assets</div>

                    {/* Depreciation by Sub-Category Chart */}
                    {chartData.length > 0 && (
                      <Card className="mt-4">
                        <CardHeader className="py-3 px-4">
                          <CardTitle className="text-sm">Depreciation by Sub-Category</CardTitle>
                        </CardHeader>
                        <CardContent className="p-4">
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                              <YAxis tick={{ fontSize: 11 }} />
                              <RechartsTooltip formatter={(val: number) => fmtCurrency(val)} />
                              <Legend />
                              <Bar dataKey="totalPV" name="Purchase Value" fill="#6366f1" />
                              <Bar dataKey="totalDep" name="Accum. Depreciation" fill="#ef4444" />
                              <Bar dataKey="totalNBV" name="Net Book Value" fill="#22c55e" />
                            </BarChart>
                          </ResponsiveContainer>
                        </CardContent>
                      </Card>
                    )}
                  </CardContent>
                </Card>
              </>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════
          DIALOGS
      ═══════════════════════════════════════════════════════════ */}

      {/* ─── Investment Head Create/Edit Dialog ─── */}
      <Dialog open={headsForm} onOpenChange={setHeadsForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">{headsEdit ? "Edit Investment Head" : "Create Investment Head"}</DialogTitle>
            <DialogDescription>{headsEdit ? "Update investment head details" : "Add a new investment head to the system"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="head-name">Name <span className="text-red-500">*</span></Label>
              <Input id="head-name" value={headsFormData.name} onChange={(e) => setHeadsFormData({ ...headsFormData, name: e.target.value })} placeholder="Enter head name" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="head-type">Type</Label>
                <Select value={headsFormData.type} onValueChange={(v) => setHeadsFormData({ ...headsFormData, type: v })}>
                  <SelectTrigger id="head-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Liability">Liability</SelectItem>
                    <SelectItem value="Asset">Asset</SelectItem>
                    <SelectItem value="Investment">Investment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="head-opening-type">Opening Type</Label>
                <Select value={headsFormData.openingType} onValueChange={(v) => setHeadsFormData({ ...headsFormData, openingType: v })}>
                  <SelectTrigger id="head-opening-type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="None">None</SelectItem>
                    <SelectItem value="Payment">Payment</SelectItem>
                    <SelectItem value="Receive">Receive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="head-opening-balance">Opening Balance</Label>
              <Input id="head-opening-balance" type="number" step="0.01" min="0" value={headsFormData.openingBalance} onChange={(e) => setHeadsFormData({ ...headsFormData, openingBalance: e.target.value })} className={Number(headsFormData.openingBalance) < 0 ? "border-red-500 focus:border-red-500" : ""} />
              {Number(headsFormData.openingBalance) < 0 && <p className="text-xs text-red-500 mt-1">Opening Balance cannot be negative</p>}
            </div>
            {/* Phase 3: Share Percentage and Capital Value */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="head-share-pct">Share Percentage (%)</Label>
                <Input id="head-share-pct" type="number" step="0.01" min="0.01" max="100" value={headsFormData.sharePercentage} onChange={(e) => setHeadsFormData({ ...headsFormData, sharePercentage: e.target.value })} placeholder="e.g. 25.5" className={headsFormData.sharePercentage && (Number(headsFormData.sharePercentage) <= 0 || Number(headsFormData.sharePercentage) > 100) ? "border-red-500 focus:border-red-500" : ""} />
                {headsFormData.sharePercentage && (Number(headsFormData.sharePercentage) <= 0 || Number(headsFormData.sharePercentage) > 100) && <p className="text-xs text-red-500 mt-1">Must be between 0.01 and 100</p>}
              </div>
              <div>
                <Label htmlFor="head-capital-value">Capital Value</Label>
                <Input id="head-capital-value" type="number" step="0.01" min="0.01" value={headsFormData.capitalValue} onChange={(e) => setHeadsFormData({ ...headsFormData, capitalValue: e.target.value })} placeholder="e.g. 500000" className={headsFormData.capitalValue && Number(headsFormData.capitalValue) <= 0 ? "border-red-500 focus:border-red-500" : ""} />
                {headsFormData.capitalValue && Number(headsFormData.capitalValue) <= 0 && <p className="text-xs text-red-500 mt-1">Must be greater than zero</p>}
              </div>
            </div>
            <div>
              <Label htmlFor="head-description">Description</Label>
              <Textarea id="head-description" value={headsFormData.description} onChange={(e) => setHeadsFormData({ ...headsFormData, description: e.target.value })} placeholder="Optional description" rows={3} />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="head-active" checked={headsFormData.isActive} onCheckedChange={(v) => setHeadsFormData({ ...headsFormData, isActive: !!v })} />
              <Label htmlFor="head-active">Active</Label>
            </div>
            {/* Document Uploads Section */}
            <div className="pt-2">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-5 w-5 rounded bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-emerald-600">5</span>
                </div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Document Uploads</h4>
                <Separator className="flex-1" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <ImageUploadField
                  value={headsFormData.profileImage}
                  onChange={(base64) => setHeadsFormData({ ...headsFormData, profileImage: base64 })}
                  label="Profile Photo"
                  placeholder="Upload profile photo"
                />
                <ImageUploadField
                  value={headsFormData.nidFrontImage}
                  onChange={(base64) => setHeadsFormData({ ...headsFormData, nidFrontImage: base64 })}
                  label="NID Front"
                  placeholder="Upload NID front"
                />
                <ImageUploadField
                  value={headsFormData.nidBackImage}
                  onChange={(base64) => setHeadsFormData({ ...headsFormData, nidBackImage: base64 })}
                  label="NID Back"
                  placeholder="Upload NID back"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeadsForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={saveHeads} disabled={headsSaving}>
              {headsSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
              {headsEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Investment Head Delete Confirmation ─── */}
      <Dialog open={!!headsDelete} onOpenChange={() => setHeadsDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete &quot;{headsDelete?.name}&quot; ({headsDelete?.code})?</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">This action will deactivate the investment head. If it has active assets or liabilities, deletion will be blocked.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeadsDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteHeads}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Investment Entry (Add against head) Dialog ─── */}
      <Dialog open={investForm} onOpenChange={setInvestForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Entry Against Investment Head</DialogTitle>
            <DialogDescription>Create a new asset or liability entry for an investment head</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Investment Head <span className="text-red-500">*</span></Label>
              <Select value={investFormData.investmentHeadId} onValueChange={(v) => setInvestFormData({ ...investFormData, investmentHeadId: v })}>
                <SelectTrigger><SelectValue placeholder="Select investment head" /></SelectTrigger>
                <SelectContent>
                  {investTypeHeads.map((h: any) => (
                    <SelectItem key={h.id} value={h.id}>{h.code} - {h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Entry Type</Label>
                <Select value={investFormData.entryType} onValueChange={(v) => setInvestFormData({ ...investFormData, entryType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asset">Asset</SelectItem>
                    <SelectItem value="liability">Liability (Received)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={investFormData.date} onChange={(e) => setInvestFormData({ ...investFormData, date: e.target.value })} />
              </div>
            </div>
            {investFormData.entryType === "asset" && (
              <div>
                <Label>Asset Category</Label>
                <Select value={investFormData.assetCategory} onValueChange={(v) => setInvestFormData({ ...investFormData, assetCategory: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Fixed">Fixed</SelectItem>
                    <SelectItem value="Current">Current</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Amount <span className="text-red-500">*</span></Label>
              <Input type="number" step="0.01" value={investFormData.amount} onChange={(e) => setInvestFormData({ ...investFormData, amount: e.target.value })} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={investFormData.description} onChange={(e) => setInvestFormData({ ...investFormData, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInvestForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={saveInvestEntry}>
              Create Entry
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Fixed Asset Create/Edit Dialog ─── */}
      <Dialog open={assetsForm} onOpenChange={setAssetsForm}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">{assetsEdit ? "Edit Fixed Asset" : "Register Corporate Asset"}</DialogTitle>
            <DialogDescription>{assetsEdit ? "Update fixed asset details and depreciation parameters" : "Register a new corporate fixed asset with depreciation schedule"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Phase 3: Inactive Head Shield Warning */}
            {assetsFormData.investmentHeadId && (() => {
              const h = headOptions.find((hd: any) => hd.id === assetsFormData.investmentHeadId);
              return h && !h.isActive ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-700 dark:text-red-400 font-medium">Action Blocked: Chosen Investment Head is inactive or archived.</span>
                </div>
              ) : null;
            })()}
            <div>
              <Label>Investment Head <span className="text-red-500">*</span></Label>
              <Select value={assetsFormData.investmentHeadId} onValueChange={(v) => setAssetsFormData({ ...assetsFormData, investmentHeadId: v })}>
                <SelectTrigger><SelectValue placeholder="Select investment head" /></SelectTrigger>
                <SelectContent>
                  {assetTypeHeads.map((h: any) => (
                    <SelectItem key={h.id} value={h.id} className={!h.isActive ? "opacity-50" : ""}>
                      {h.code} - {h.name} {!h.isActive ? "(Inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={assetsFormData.date} onChange={(e) => setAssetsFormData({ ...assetsFormData, date: e.target.value })} />
              </div>
              <div>
                <Label>Amount <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" min="0.01" value={assetsFormData.amount} onChange={(e) => setAssetsFormData({ ...assetsFormData, amount: e.target.value })} className={Number(assetsFormData.amount) <= 0 && assetsFormData.amount !== "" && assetsFormData.amount !== 0 ? "border-red-500 focus:border-red-500" : ""} />
                {Number(assetsFormData.amount) <= 0 && assetsFormData.amount !== "" && assetsFormData.amount !== 0 && <p className="text-xs text-red-500 mt-1">Amount must be greater than zero</p>}
              </div>
            </div>
            <div>
              <Label>Asset Category</Label>
              <Input value="Fixed" disabled className="bg-muted" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sub-Category</Label>
                <Select value={assetsFormData.assetSubCategory || ""} onValueChange={(v) => setAssetsFormData({ ...assetsFormData, assetSubCategory: v })}>
                  <SelectTrigger><SelectValue placeholder="Select sub-category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Machinery">Machinery</SelectItem>
                    <SelectItem value="Vehicle">Vehicle</SelectItem>
                    <SelectItem value="Furniture">Furniture</SelectItem>
                    <SelectItem value="IT Equipment">IT Equipment</SelectItem>
                    <SelectItem value="Building">Building</SelectItem>
                    <SelectItem value="Land">Land</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location Tag</Label>
                <Input value={assetsFormData.locationTag || ""} onChange={(e) => setAssetsFormData({ ...assetsFormData, locationTag: e.target.value })} placeholder="e.g. Warehouse A, Floor 2" />
              </div>
            </div>
            {/* Phase 3: Depreciation Fields for Fixed Assets */}
            <Separator />
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-4 h-4" />Depreciation Parameters (Fixed Asset)
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Purchase Value <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" min="0.01" value={assetsFormData.purchaseValue} onChange={(e) => setAssetsFormData({ ...assetsFormData, purchaseValue: e.target.value })} className={Number(assetsFormData.purchaseValue) <= 0 && assetsFormData.purchaseValue !== "" && assetsFormData.purchaseValue !== 0 ? "border-red-500 focus:border-red-500" : ""} />
                {Number(assetsFormData.purchaseValue) <= 0 && assetsFormData.purchaseValue !== "" && assetsFormData.purchaseValue !== 0 && <p className="text-xs text-red-500 mt-1">Must be greater than zero</p>}
              </div>
              <div>
                <Label>Salvage Value <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" min="0" value={assetsFormData.salvageValue} onChange={(e) => setAssetsFormData({ ...assetsFormData, salvageValue: e.target.value })} className={Number(assetsFormData.salvageValue) >= Number(assetsFormData.purchaseValue) && Number(assetsFormData.purchaseValue) > 0 ? "border-red-500 focus:border-red-500" : ""} />
                {Number(assetsFormData.salvageValue) >= Number(assetsFormData.purchaseValue) && Number(assetsFormData.purchaseValue) > 0 && <p className="text-xs text-red-500 mt-1">Must be less than Purchase Value</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Useful Life (Months) <span className="text-red-500">*</span></Label>
                <Input type="number" min="1" value={assetsFormData.usefulLifeMonths} onChange={(e) => setAssetsFormData({ ...assetsFormData, usefulLifeMonths: e.target.value })} className={Number(assetsFormData.usefulLifeMonths) <= 0 && assetsFormData.usefulLifeMonths !== "" && assetsFormData.usefulLifeMonths !== 0 ? "border-red-500 focus:border-red-500" : ""} />
                {Number(assetsFormData.usefulLifeMonths) <= 0 && assetsFormData.usefulLifeMonths !== "" && assetsFormData.usefulLifeMonths !== 0 && <p className="text-xs text-red-500 mt-1">Must be greater than zero</p>}
              </div>
              <div>
                <Label>Depreciation Rate (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={assetsFormData.depreciationRate} onChange={(e) => setAssetsFormData({ ...assetsFormData, depreciationRate: e.target.value })} />
              </div>
            </div>
            {/* Auto-calculated monthly depreciation preview */}
            {Number(assetsFormData.purchaseValue) > 0 && Number(assetsFormData.usefulLifeMonths) > 0 && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  <strong>Monthly Depreciation:</strong> ৳{bdCurrencyFmt.format(
                    Math.max(0, (Number(assetsFormData.purchaseValue) - Number(assetsFormData.salvageValue)) / Number(assetsFormData.usefulLifeMonths))
                  )} | <strong>Total Depreciable:</strong> ৳{bdCurrencyFmt.format(
                    Math.max(0, Number(assetsFormData.purchaseValue) - Number(assetsFormData.salvageValue))
                  )}
                </p>
              </div>
            )}
            <div>
              <Label>Idempotency Key</Label>
              <Input value={assetsFormData.idempotencyKey || ""} onChange={(e) => setAssetsFormData({ ...assetsFormData, idempotencyKey: e.target.value })} placeholder="Optional reference key to prevent duplicates" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={assetsFormData.description} onChange={(e) => setAssetsFormData({ ...assetsFormData, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="asset-active" checked={assetsFormData.isActive} onCheckedChange={(v) => setAssetsFormData({ ...assetsFormData, isActive: !!v })} />
              <Label htmlFor="asset-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetsForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => saveAsset("Fixed")} disabled={assetsSaving}>
              {assetsSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Recalculating Equity Balance & Fixed Asset Ledgers...
                </>
              ) : (
                <>
                  <Building2 className="w-4 h-4 mr-1" />
                  {assetsEdit ? "Update Corporate Asset" : "Register Corporate Asset"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Fixed Asset Delete Confirmation ─── */}
      <Dialog open={!!assetsDelete} onOpenChange={() => setAssetsDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete this fixed asset?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetsDelete(null)}>Cancel</Button>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={0}>
                    <Button variant="destructive" onClick={() => deleteAsset(assetsDelete, "Fixed")} disabled={!isAdmin}>
                      {isAdmin ? "Delete" : "Admin Only"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!isAdmin && <TooltipContent>Only administrators can delete financial posts</TooltipContent>}
              </Tooltip>
            </TooltipProvider>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Current Asset Create/Edit Dialog ─── */}
      <Dialog open={currentAssetsForm} onOpenChange={setCurrentAssetsForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">{currentAssetsEdit ? "Edit Current Asset" : "Post Capital Investment"}</DialogTitle>
            <DialogDescription>{currentAssetsEdit ? "Update current asset details" : "Record a new short-term liquid capital investment"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Phase 3: Inactive Head Shield */}
            {currentAssetsFormData.investmentHeadId && (() => {
              const h = headOptions.find((hd: any) => hd.id === currentAssetsFormData.investmentHeadId);
              return h && !h.isActive ? (
                <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-red-700 dark:text-red-400 font-medium">Action Blocked: Chosen Investment Head is inactive or archived.</span>
                </div>
              ) : null;
            })()}
            <div>
              <Label>Investment Head <span className="text-red-500">*</span></Label>
              <Select value={currentAssetsFormData.investmentHeadId} onValueChange={(v) => setCurrentAssetsFormData({ ...currentAssetsFormData, investmentHeadId: v })}>
                <SelectTrigger><SelectValue placeholder="Select investment head" /></SelectTrigger>
                <SelectContent>
                  {assetTypeHeads.map((h: any) => (
                    <SelectItem key={h.id} value={h.id} className={!h.isActive ? "opacity-50" : ""}>
                      {h.code} - {h.name} {!h.isActive ? "(Inactive)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={currentAssetsFormData.date} onChange={(e) => setCurrentAssetsFormData({ ...currentAssetsFormData, date: e.target.value })} />
              </div>
              <div>
                <Label>Amount <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" min="0.01" value={currentAssetsFormData.amount} onChange={(e) => setCurrentAssetsFormData({ ...currentAssetsFormData, amount: e.target.value })} className={Number(currentAssetsFormData.amount) <= 0 && currentAssetsFormData.amount !== "" && currentAssetsFormData.amount !== 0 ? "border-red-500 focus:border-red-500" : ""} />
                {Number(currentAssetsFormData.amount) <= 0 && currentAssetsFormData.amount !== "" && currentAssetsFormData.amount !== 0 && <p className="text-xs text-red-500 mt-1">Amount must be greater than zero</p>}
              </div>
            </div>
            <div>
              <Label>Asset Category</Label>
              <Input value="Current" disabled className="bg-muted" />
              <p className="text-xs text-muted-foreground mt-1">Current assets bypass depreciation schedules</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Sub-Category</Label>
                <Select value={currentAssetsFormData.assetSubCategory || ""} onValueChange={(v) => setCurrentAssetsFormData({ ...currentAssetsFormData, assetSubCategory: v })}>
                  <SelectTrigger><SelectValue placeholder="Select sub-category" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Cash">Cash</SelectItem>
                    <SelectItem value="Inventory">Inventory</SelectItem>
                    <SelectItem value="Receivable">Receivable</SelectItem>
                    <SelectItem value="Prepaid">Prepaid</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Location Tag</Label>
                <Input value={currentAssetsFormData.locationTag || ""} onChange={(e) => setCurrentAssetsFormData({ ...currentAssetsFormData, locationTag: e.target.value })} placeholder="e.g. Vault, Branch B" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={currentAssetsFormData.description} onChange={(e) => setCurrentAssetsFormData({ ...currentAssetsFormData, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="current-asset-active" checked={currentAssetsFormData.isActive} onCheckedChange={(v) => setCurrentAssetsFormData({ ...currentAssetsFormData, isActive: !!v })} />
              <Label htmlFor="current-asset-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCurrentAssetsForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => saveAsset("Current")} disabled={currentAssetsSaving}>
              {currentAssetsSaving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-1 animate-spin" />
                  Recalculating Equity Balance & Fixed Asset Ledgers...
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4 mr-1" />
                  {currentAssetsEdit ? "Update" : "Post Capital Investment"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Current Asset Delete Confirmation ─── */}
      <Dialog open={!!currentAssetsDelete} onOpenChange={() => setCurrentAssetsDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete this current asset?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCurrentAssetsDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteAsset(currentAssetsDelete, "Current")}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Liability Receive Create/Edit Dialog ─── */}
      <Dialog open={liabReceiveForm} onOpenChange={setLiabReceiveForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">{liabReceiveEdit ? "Edit Liability Receive" : "Create Liability Receive"}</DialogTitle>
            <DialogDescription>{liabReceiveEdit ? "Update liability receive details" : "Record a new liability receive"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Investment Head <span className="text-red-500">*</span></Label>
              <Select value={liabReceiveFormData.investmentHeadId} onValueChange={(v) => setLiabReceiveFormData({ ...liabReceiveFormData, investmentHeadId: v })}>
                <SelectTrigger><SelectValue placeholder="Select investment head" /></SelectTrigger>
                <SelectContent>
                  {liabilityTypeHeads.map((h: any) => (
                    <SelectItem key={h.id} value={h.id}>{h.code} - {h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={liabReceiveFormData.date} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, date: e.target.value })} />
              </div>
              <div>
                <Label>Amount <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" value={liabReceiveFormData.amount} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, amount: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={liabReceiveFormData.paymentMethod} onValueChange={(v) => setLiabReceiveFormData({ ...liabReceiveFormData, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={liabReceiveFormData.dueDate || ""} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, dueDate: e.target.value })} placeholder="Optional due date" />
            </div>
            <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs text-green-700 dark:text-green-400">AP Sync: Will be synced on save</span>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={liabReceiveFormData.description} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="liab-receive-active" checked={liabReceiveFormData.isActive} onCheckedChange={(v) => setLiabReceiveFormData({ ...liabReceiveFormData, isActive: !!v })} />
              <Label htmlFor="liab-receive-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiabReceiveForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => saveLiab("received")} disabled={liabReceiveSaving}>
              {liabReceiveSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
              {liabReceiveEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Liability Receive Delete Confirmation ─── */}
      <Dialog open={!!liabReceiveDelete} onOpenChange={() => setLiabReceiveDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete this liability receive entry?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiabReceiveDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteLiab(liabReceiveDelete, "received")}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Liability Pay Create/Edit Dialog ─── */}
      <Dialog open={liabPayForm} onOpenChange={setLiabPayForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">{liabPayEdit ? "Edit Liability Pay" : "Create Liability Pay"}</DialogTitle>
            <DialogDescription>{liabPayEdit ? "Update liability pay details" : "Record a new liability pay"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Investment Head <span className="text-red-500">*</span></Label>
              <Select value={liabPayFormData.investmentHeadId} onValueChange={(v) => setLiabPayFormData({ ...liabPayFormData, investmentHeadId: v })}>
                <SelectTrigger><SelectValue placeholder="Select investment head" /></SelectTrigger>
                <SelectContent>
                  {liabilityTypeHeads.map((h: any) => (
                    <SelectItem key={h.id} value={h.id}>{h.code} - {h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={liabPayFormData.date} onChange={(e) => setLiabPayFormData({ ...liabPayFormData, date: e.target.value })} />
              </div>
              <div>
                <Label>Amount <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" value={liabPayFormData.amount} onChange={(e) => setLiabPayFormData({ ...liabPayFormData, amount: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Payment Method</Label>
              <Select value={liabPayFormData.paymentMethod} onValueChange={(v) => setLiabPayFormData({ ...liabPayFormData, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Due Date</Label>
              <Input type="date" value={liabPayFormData.dueDate || ""} onChange={(e) => setLiabPayFormData({ ...liabPayFormData, dueDate: e.target.value })} placeholder="Optional due date" />
            </div>
            <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-md border border-green-200 dark:border-green-800">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-xs text-green-700 dark:text-green-400">AP Sync: Will be synced on save</span>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={liabPayFormData.description} onChange={(e) => setLiabPayFormData({ ...liabPayFormData, description: e.target.value })} placeholder="Optional description" rows={2} />
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox id="liab-pay-active" checked={liabPayFormData.isActive} onCheckedChange={(v) => setLiabPayFormData({ ...liabPayFormData, isActive: !!v })} />
              <Label htmlFor="liab-pay-active">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiabPayForm(false)}>Cancel</Button>
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => saveLiab("pay")} disabled={liabPaySaving}>
              {liabPaySaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
              {liabPayEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Liability Pay Delete Confirmation ─── */}
      <Dialog open={!!liabPayDelete} onOpenChange={() => setLiabPayDelete(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete this liability pay entry?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiabPayDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteLiab(liabPayDelete, "pay")}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
