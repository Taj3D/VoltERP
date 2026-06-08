"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  ChevronDown, ChevronRight, FileDown, Shield, Landmark,
  Building2, Wallet, ArrowDownCircle, ArrowUpCircle, FileBarChart,
  Banknote, TrendingUp, CheckCircle, AlertTriangle, Activity,
  PieChart, Calculator, Layers, BarChart3, Clock,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF, exportToCSV, importFromCSV, getVatMaskedKeys,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef } from "@/lib/export-utils";
import ImageUploadField from "@/components/erp/ui/ImageUploadField";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

// Safe number formatter — avoids Bengali digits from toLocaleString
const safeNumberFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${safeNumberFmt.format(Number(v))}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  return String(v);
};

const fmtDate = (d: string | Date) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${safeNumberFmt.format(Number(v))}`;
};

const fmtPct = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `${Number(v).toFixed(2)}%`;
};

async function apiFetch(path: string, opts?: RequestInit) {
  const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
  try {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.accessToken) { authHeaders["Authorization"] = `Bearer ${parsed.accessToken}`; }
    }
  } catch {
    console.warn('InvestmentGroupPage: Failed to parse auth token');
  }
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
      } catch {
        console.warn('InvestmentGroupPage: Failed to parse stored auth state');
      }
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

const LIABILITY_TYPE_BADGE: Record<string, string> = {
  SHORT_TERM: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  LONG_TERM: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
};

const CATEGORY_BADGE: Record<string, string> = {
  Fixed: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  Current: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
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
  const [activeTab, setActiveTab] = useState(initialTab || "investment-heads");

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
    name: "", type: "Liability", openingBalance: 0, openingType: "None", description: "", isActive: true,
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
    usefulLifeMonths: 0, description: "", isActive: true,
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
    amount: 0, type: "received", liabilityType: "SHORT_TERM", principalAmount: 0,
    interestRate: 0, loanDurationMonths: 0, paymentMethod: "Cash",
    bankId: "", voucherNo: "", chequeNo: "", description: "", isActive: true,
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
    amount: 0, type: "pay", liabilityType: "SHORT_TERM", principalAmount: 0,
    interestRate: 0, loanDurationMonths: 0, paymentMethod: "Cash",
    bankId: "", voucherNo: "", chequeNo: "", description: "", isActive: true,
  });

  // ─── Liability Report State ───
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportData, setReportData] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [expandedReport, setExpandedReport] = useState<Set<string>>(new Set());

  // ─── Shared: Investment Heads for dropdowns ───
  const [headOptions, setHeadOptions] = useState<any[]>([]);

  // ─── Phase 4: New Liability State ───
  const [banks, setBanks] = useState<any[]>([]);
  const [companyBranding, setCompanyBranding] = useState<any>(null);
  const [exceedBalanceWarning, setExceedBalanceWarning] = useState(false);
  const liabilitySnapshotRef = useRef<any>(null);

  // ─── Enhancement: Depreciation Schedule State ───
  const [depreciationData, setDepreciationData] = useState<any[]>([]);
  const [depreciationLoading, setDepreciationLoading] = useState(false);
  const [depreciationAssetId, setDepreciationAssetId] = useState<string | null>(null);

  // ─── Enhancement: Amortization Schedule State ───
  const [amortizationData, setAmortizationData] = useState<any[]>([]);
  const [amortizationVisible, setAmortizationVisible] = useState(false);

  // ─── Enhancement: Activity Log State ───
  const [activityLog, setActivityLog] = useState<any[]>([]);
  const [activityLogLoading, setActivityLogLoading] = useState(false);

  // ─── Enhancement: Bulk Select State ───
  const [selectedHeadIds, setSelectedHeadIds] = useState<Set<string>>(new Set());
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set());
  const [selectedCurrentAssetIds, setSelectedCurrentAssetIds] = useState<Set<string>>(new Set());
  const [selectedLiabReceiveIds, setSelectedLiabReceiveIds] = useState<Set<string>>(new Set());
  const [selectedLiabPayIds, setSelectedLiabPayIds] = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState<string | null>(null);

  // ============================================================
  // DATA LOADERS
  // ============================================================

  const loadHeads = useCallback(async () => {
    setHeadsLoading(true);
    try {
      const res = await apiFetch("/api/investment-heads?includeInactive=true");
      setHeads(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setHeadsLoading(false);
    }
  }, [toast]);

  const loadHeadOptions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/investment-heads?includeInactive=true");
      setHeadOptions(Array.isArray(res) ? res : res.data || []);
    } catch (err) {
      console.error('Error loading investment head options:', err);
      toast({ title: 'Error', description: 'Failed to load investment head options.', variant: 'destructive' });
    }
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

  const loadBanks = useCallback(async () => {
    try {
      const res = await apiFetch("/api/banks");
      setBanks(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Error loading banks:', err);
      toast({ title: 'Error', description: 'Failed to load banks list.', variant: 'destructive' });
    }
  }, []);

  const loadCompanyBranding = useCallback(async () => {
    try {
      const res = await apiFetch("/api/company-branding");
      setCompanyBranding(res.company || null);
    } catch (err) {
      console.error('Error loading company branding:', err);
    }
  }, []);

  // ─── Enhancement: Load Depreciation Schedule ───
  const loadDepreciation = useCallback(async (assetId: string) => {
    setDepreciationLoading(true);
    setDepreciationAssetId(assetId);
    try {
      const res = await apiFetch(`/api/asset-depreciation?assetId=${assetId}`);
      setDepreciationData(Array.isArray(res) ? res : []);
    } catch (err) {
      console.error('Error loading depreciation schedule:', err);
      setDepreciationData([]);
    } finally {
      setDepreciationLoading(false);
    }
  }, []);

  // ─── Enhancement: Load Activity Log ───
  const loadActivityLog = useCallback(async () => {
    setActivityLogLoading(true);
    try {
      const res = await apiFetch("/api/audit-logs?module=InvestmentHeads&module=Assets&module=Fin-Liability-Core&module=Inv-Asset-Ledger&limit=20");
      setActivityLog(Array.isArray(res) ? res.slice(0, 20) : (res.data || []).slice(0, 20));
    } catch (err) {
      console.error('Error loading activity log:', err);
      setActivityLog([]);
    } finally {
      setActivityLogLoading(false);
    }
  }, []);

  // ─── Enhancement: Compute Amortization Schedule ───
  const computeAmortization = useCallback((principal: number, annualRate: number, months: number) => {
    if (principal <= 0 || months <= 0 || annualRate <= 0) {
      // Simple linear schedule for zero-interest loans
      const monthlyPayment = months > 0 ? principal / months : 0;
      const schedule: { month: number; payment: number; principal: number; interest: number; balance: number }[] = [];
      let balance = principal;
      for (let i = 1; i <= months; i++) {
        balance -= monthlyPayment;
        schedule.push({ month: i, payment: monthlyPayment, principal: monthlyPayment, interest: 0, balance: Math.max(0, balance) });
      }
      return schedule;
    }
    const monthlyRate = annualRate / 100 / 12;
    const emi = principal * monthlyRate * Math.pow(1 + monthlyRate, months) / (Math.pow(1 + monthlyRate, months) - 1);
    const schedule: { month: number; payment: number; principal: number; interest: number; balance: number }[] = [];
    let balance2 = principal;
    for (let i = 1; i <= months; i++) {
      const interest = balance2 * monthlyRate;
      const principalPart = emi - interest;
      balance2 -= principalPart;
      schedule.push({ month: i, payment: emi, principal: principalPart, interest, balance: Math.max(0, balance2) });
    }
    return schedule;
  }, []);

  // ─── Enhancement: Bulk Delete ───
  const handleBulkDelete = async (type: string) => {
    const ids = type === "heads" ? selectedHeadIds
      : type === "assets" ? selectedAssetIds
      : type === "currentAssets" ? selectedCurrentAssetIds
      : type === "liabReceive" ? selectedLiabReceiveIds
      : selectedLiabPayIds;
    if (ids.size === 0) return;
    const apiBase = type === "heads" ? "/api/investment-heads"
      : (type === "assets" || type === "currentAssets") ? "/api/assets"
      : "/api/liabilities";
    let success = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        await apiFetch(`${apiBase}/${id}`, { method: "DELETE" });
        success++;
      } catch { failed++; }
    }
    toast({ title: "Bulk Delete", description: `Deleted: ${success}, Failed: ${failed}`, variant: failed > 0 ? "destructive" : "default" });
    setBulkDeleteConfirm(null);
    if (type === "heads") { setSelectedHeadIds(new Set()); loadHeads(); loadHeadOptions(); }
    else if (type === "assets") { setSelectedAssetIds(new Set()); loadAssets(); }
    else if (type === "currentAssets") { setSelectedCurrentAssetIds(new Set()); loadCurrentAssets(); }
    else if (type === "liabReceive") { setSelectedLiabReceiveIds(new Set()); loadLiabReceive(); }
    else { setSelectedLiabPayIds(new Set()); loadLiabPay(); }
  };

  // ============================================================
  // INIT
  // ============================================================

  useEffect(() => {
    loadHeads();
    loadHeadOptions();
    loadBanks();
    loadCompanyBranding();
    loadActivityLog();
  }, [loadHeads, loadHeadOptions, loadBanks, loadCompanyBranding, loadActivityLog]);

  useEffect(() => {
    if (activeTab === "investment") loadInvestments();
    if (activeTab === "fixed-asset") loadAssets();
    if (activeTab === "current-asset") loadCurrentAssets();
    if (activeTab === "liability-receive") loadLiabReceive();
    if (activeTab === "liability-pay") loadLiabPay();
  }, [activeTab, loadInvestments, loadAssets, loadCurrentAssets, loadLiabReceive, loadLiabPay]);

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
    const shortTerm = liabReceive.filter((l: any) => l.liabilityType === "SHORT_TERM").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const longTerm = liabReceive.filter((l: any) => l.liabilityType === "LONG_TERM").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const interestBurden = liabReceive.reduce((s: number, l: any) => s + (typeof l.interestRate === "number" ? (l.principalAmount || 0) * l.interestRate / 100 : 0), 0);
    const totalOutstanding = liabReceive.reduce((s: number, l: any) => s + (typeof l.outstandingBalance === "number" ? l.outstandingBalance : 0), 0);
    return {
      total: liabReceive.reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0),
      cash, bank, cheque, shortTerm, longTerm, interestBurden, totalOutstanding,
    };
  }, [liabReceive]);

  const liabPayStats = useMemo(() => {
    const cash = liabPay.filter((l: any) => l.paymentMethod === "Cash").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const bank = liabPay.filter((l: any) => l.paymentMethod === "Bank Transfer").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const cheque = liabPay.filter((l: any) => l.paymentMethod === "Cheque").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const shortTerm = liabPay.filter((l: any) => l.liabilityType === "SHORT_TERM").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    const longTerm = liabPay.filter((l: any) => l.liabilityType === "LONG_TERM").reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0);
    return {
      total: liabPay.reduce((s: number, l: any) => s + (typeof l.amount === "number" ? l.amount : 0), 0),
      cash, bank, cheque, shortTerm, longTerm,
    };
  }, [liabPay]);

  // ─── Outstanding Balances Computed State (includes opening balance) ───
  const outstandingBalances = useMemo(() => {
    const map: Record<string, number> = {};
    // Start with opening balances from heads
    headOptions.forEach((h: any) => {
      if (h.type === "Liability") {
        map[h.id] = (typeof h.openingBalance === "number" ? h.openingBalance : 0);
      }
    });
    // Add received amounts
    liabReceive.forEach((l: any) => {
      const hid = l.investmentHeadId;
      map[hid] = (map[hid] || 0) + (typeof l.amount === "number" ? l.amount : 0);
    });
    // Subtract pay amounts
    liabPay.forEach((l: any) => {
      const hid = l.investmentHeadId;
      map[hid] = (map[hid] || 0) - (typeof l.amount === "number" ? l.amount : 0);
    });
    return map;
  }, [headOptions, liabReceive, liabPay]);

  // ─── Enhancement: Quick Stats Dashboard ───
  const quickStats = useMemo(() => {
    const totalAssets = assets.reduce((s: number, a: any) => s + (typeof a.amount === "number" ? a.amount : 0), 0)
      + currentAssets.reduce((s: number, a: any) => s + (typeof a.amount === "number" ? a.amount : 0), 0);
    const totalLiabilities = Object.values(outstandingBalances).reduce((s: number, v: number) => s + Math.max(0, v), 0);
    const netWorth = totalAssets - totalLiabilities;
    return { totalAssets, totalLiabilities, netWorth };
  }, [assets, currentAssets, outstandingBalances]);

  // ─── Enhancement: Investment Performance Metrics ───
  const investPerformance = useMemo(() => {
    if (!investments || investments.length === 0) return [];
    return investments.map((head: any) => {
      const totalInvested = typeof head.totalAssets === "number" ? head.totalAssets : 0;
      const totalReturns = typeof head.totalLiabilities === "number" ? head.totalLiabilities : 0;
      const netValue = typeof head.netValue === "number" ? head.netValue : 0;
      const opening = head.openingBalance || 0;
      const costBasis = opening + totalInvested;
      const roi = costBasis > 0 ? ((netValue - costBasis) / costBasis) * 100 : 0;
      // CAGR approximation: assume 1 year if no data, otherwise calculate from first asset date
      const firstAssetDate = head.assets?.[0]?.date;
      const years = firstAssetDate ? Math.max(0.1, (Date.now() - new Date(firstAssetDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)) : 1;
      const cagr = costBasis > 0 && netValue > 0 ? (Math.pow(netValue / costBasis, 1 / years) - 1) * 100 : 0;
      return { ...head, roi, cagr, costBasis };
    });
  }, [investments]);

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
    setHeadsFormData({ name: "", type: "Liability", openingBalance: 0, openingType: "None", description: "", profileImage: null, nidFrontImage: null, nidBackImage: null, isActive: true });
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
    setHeadsSaving(true);
    try {
      const payload = {
        name: headsFormData.name,
        type: headsFormData.type,
        openingBalance: Number(headsFormData.openingBalance) || 0,
        openingType: headsFormData.openingType,
        description: headsFormData.description || null,
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
      toast({ title: "Deactivated", description: "Investment Head deactivated" });
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
      usefulLifeMonths: 0, description: "", isActive: true,
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
      purchaseValue: item.purchaseValue || item.amount || 0,
      salvageValue: item.salvageValue || 0,
      usefulLifeMonths: item.usefulLifeMonths || 0,
      description: item.description || "",
      isActive: item.isActive ?? true,
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
    if (isFixed) setAssetsSaving(true);
    else setCurrentAssetsSaving(true);
    try {
      const payload = {
        investmentHeadId: formData.investmentHeadId,
        date: formData.date,
        amount: Number(formData.amount) || 0,
        assetCategory: formData.assetCategory || category,
        purchaseValue: Number(formData.purchaseValue) || Number(formData.amount) || 0,
        salvageValue: Number(formData.salvageValue) || 0,
        usefulLifeMonths: Number(formData.usefulLifeMonths) || 0,
        description: formData.description || null,
        isActive: formData.isActive ?? true,
      };
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
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      if (isFixed) setAssetsSaving(false);
      else setCurrentAssetsSaving(false);
    }
  };

  const deleteAsset = async (item: any, category: "Fixed" | "Current") => {
    try {
      await apiFetch(`/api/assets/${item.id}`, { method: "DELETE" });
      toast({ title: "Deactivated", description: `${category} Asset deactivated` });
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
      amount: 0, type, liabilityType: "SHORT_TERM", principalAmount: 0,
      interestRate: 0, loanDurationMonths: 0, paymentMethod: "Cash",
      bankId: "", voucherNo: "", chequeNo: "", description: "", isActive: true,
    });
    setExceedBalanceWarning(false);
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
      liabilityType: item.liabilityType || "SHORT_TERM",
      principalAmount: item.principalAmount || 0,
      interestRate: item.interestRate || 0,
      loanDurationMonths: item.loanDurationMonths || 0,
      paymentMethod: item.paymentMethod || "Cash",
      bankId: item.bankId || "",
      voucherNo: item.voucherNo || "",
      chequeNo: item.chequeNo || "",
      description: item.description || "",
      isActive: item.isActive ?? true,
    });
    setExceedBalanceWarning(false);
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
    // Directive 1: Validate amount > 0
    if (Number(formData.amount) <= 0) {
      toast({ title: "Validation Error", description: "Amount must be greater than zero", variant: "destructive" });
      return;
    }
    // Directive 1: Validate principalAmount > 0 for receive
    if (isReceive && Number(formData.principalAmount) <= 0) {
      toast({ title: "Validation Error", description: "Principal Amount must be greater than zero for loan receipts", variant: "destructive" });
      return;
    }
    // Directive 1: Validate interestRate >= 0
    if (Number(formData.interestRate) < 0) {
      toast({ title: "Validation Error", description: "Interest Rate cannot be negative", variant: "destructive" });
      return;
    }
    // Directive 1: Validate loanDurationMonths >= 0
    if (Number(formData.loanDurationMonths) < 0) {
      toast({ title: "Validation Error", description: "Loan Duration cannot be negative", variant: "destructive" });
      return;
    }
    // Directive 1: Zero Balance Protection for "pay" type
    if (type === "pay" && !editItem) {
      const currentOutstanding = outstandingBalances[formData.investmentHeadId] || 0;
      if (Number(formData.amount) > currentOutstanding) {
        setExceedBalanceWarning(true);
        return;
      }
    }
    setExceedBalanceWarning(false);
    if (isReceive) setLiabReceiveSaving(true);
    else setLiabPaySaving(true);
    // Directive 3: Capture snapshot before mutation
    liabilitySnapshotRef.current = { liabReceive: [...liabReceive], liabPay: [...liabPay] };
    try {
      // Directive 2: Generate referenceKey for new records
      const referenceKey = editItem?.referenceKey || `LIAB-${Date.now()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const outstandingBal = isReceive ? (Number(formData.principalAmount) || Number(formData.amount)) : Math.max(0, (outstandingBalances[formData.investmentHeadId] || 0) - Number(formData.amount));
      const payload = {
        investmentHeadId: formData.investmentHeadId,
        date: formData.date,
        amount: Number(formData.amount) || 0,
        type: formData.type || type,
        liabilityType: formData.liabilityType || "SHORT_TERM",
        principalAmount: Number(formData.principalAmount) || 0,
        interestRate: Number(formData.interestRate) || 0,
        loanDurationMonths: Number(formData.loanDurationMonths) || 0,
        outstandingBalance: outstandingBal,
        paymentMethod: formData.paymentMethod || null,
        bankId: formData.bankId || null,
        voucherNo: formData.voucherNo || null,
        chequeNo: formData.chequeNo || null,
        referenceKey,
        description: formData.description || null,
        isActive: formData.isActive ?? true,
      };
      let savedItem: any;
      if (editItem) {
        savedItem = await apiFetch(`/api/liabilities/${editItem.id}`, { method: "PUT", body: JSON.stringify(payload) });
      } else {
        savedItem = await apiFetch("/api/liabilities", { method: "POST", body: JSON.stringify(payload) });
      }
      // Directive 3: Optimistic UI update
      if (isReceive) {
        if (editItem) {
          setLiabReceive(prev => prev.map((l: any) => l.id === editItem.id ? { ...l, ...savedItem } : l));
        } else {
          setLiabReceive(prev => [{ ...savedItem }, ...prev]);
        }
      } else {
        if (editItem) {
          setLiabPay(prev => prev.map((l: any) => l.id === editItem.id ? { ...l, ...savedItem } : l));
        } else {
          setLiabPay(prev => [{ ...savedItem }, ...prev]);
        }
      }
      // Directive 4: Activity logged toast
      toast({ title: editItem ? "Updated" : "Created", description: `Liability ${type === "received" ? "Receive" : "Pay"} ${editItem ? "updated" : "created"}. Activity logged: Fin-Liability-Core` });
      if (isReceive) setLiabReceiveForm(false);
      else setLiabPayForm(false);
      // Reload data to ensure consistency
      if (isReceive) loadLiabReceive();
      else loadLiabPay();
    } catch (e: any) {
      // Directive 3: Restore from snapshot on error
      if (liabilitySnapshotRef.current) {
        setLiabReceive(liabilitySnapshotRef.current.liabReceive);
        setLiabPay(liabilitySnapshotRef.current.liabPay);
      }
      toast({ title: "Network Error", description: "Liability data restored to last known state", variant: "destructive" });
    } finally {
      if (isReceive) setLiabReceiveSaving(false);
      else setLiabPaySaving(false);
    }
  };

  const deleteLiab = async (item: any, type: "received" | "pay") => {
    try {
      await apiFetch(`/api/liabilities/${item.id}`, { method: "DELETE" });
      toast({ title: "Deactivated", description: `Liability ${type === "received" ? "Receive" : "Pay"} deactivated` });
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
            principalAmount: Number(investFormData.amount) || 0,
            interestRate: 0,
            loanDurationMonths: 0,
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
        title,
        columns,
        data,
        isVatAuditor,
        vatMaskedColumns: maskedKeys,
        orientation,
        company: companyBranding ? {
          name: companyBranding.name || "",
          address: companyBranding.address || "",
          phone: companyBranding.phone || "",
          mobile: companyBranding.mobile || "",
          email: companyBranding.email || "",
          logo: companyBranding.logo || "",
          brandLogo: companyBranding.brandLogo || "",
          vatNumber: companyBranding.vatNumber || "",
          tradeLicense: companyBranding.tradeLicense || "",
        } : undefined,
        financialFooter: {
          preparedBy: authState.user?.displayName || authState.user?.name || "",
          checkedBy: "",
          authorizedBy: "",
          printedBy: authState.user?.displayName || "System",
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
    { key: "description", label: "Description", type: "text" },
    { key: "isActive", label: "Status", type: "boolean" },
  ];

  const assetsExportColumns: ExportColumnDef[] = [
    { key: "date", label: "Date", type: "date" },
    { key: "investmentHeadName", label: "Investment Head", type: "text" },
    { key: "amount", label: "Amount", type: "currency" },
    { key: "assetCategory", label: "Category", type: "text" },
    { key: "description", label: "Description", type: "text" },
    { key: "isActive", label: "Status", type: "boolean" },
  ];

  const liabExportColumns: ExportColumnDef[] = [
    { key: "date", label: "Date", type: "date" },
    { key: "investmentHeadName", label: "Investment Head", type: "text" },
    { key: "liabilityType", label: "Liability Type", type: "text" },
    { key: "principalAmount", label: "Principal Amount", type: "currency" },
    { key: "amount", label: "Amount", type: "currency" },
    { key: "outstandingBalance", label: "Outstanding Balance", type: "currency" },
    { key: "interestRate", label: "Interest Rate (%)", type: "number" },
    { key: "paymentMethod", label: "Payment Method", type: "text" },
    { key: "bankName", label: "Bank", type: "text" },
    { key: "voucherNo", label: "Voucher No", type: "text" },
    { key: "chequeNo", label: "Cheque No", type: "text" },
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
  ];

  // Prepare data for export (flatten nested relations)
  const prepareAssetExport = (items: any[]) =>
    items.map((a: any) => ({
      ...a,
      investmentHeadName: a.investmentHead?.name || "—",
    }));

  const prepareLiabExport = (items: any[]) =>
    items.map((l: any) => {
      const bankObj = banks.find((b: any) => b.id === l.bankId);
      return {
        ...l,
        investmentHeadName: l.investmentHead?.name || "—",
        bankName: bankObj ? `${bankObj.bankName} (${bankObj.accountNo})` : "—",
        outstandingBalance: outstandingBalances[l.investmentHeadId] || 0,
      };
    });

  // ============================================================
  // IMPORT CSV HELPERS
  // ============================================================

  const headsImportFields: ExportFieldDef[] = [
    { key: "name", label: "Name", type: "text", required: true },
    { key: "type", label: "Type", type: "select", options: [{ value: "Liability", label: "Liability" }, { value: "Asset", label: "Asset" }, { value: "Investment", label: "Investment" }] },
    { key: "openingBalance", label: "Opening Balance", type: "number" },
    { key: "openingType", label: "Opening Type", type: "select", options: [{ value: "None", label: "None" }, { value: "Payment", label: "Payment" }, { value: "Receive", label: "Receive" }] },
    { key: "description", label: "Description", type: "textarea" },
  ];

  const assetsImportFields: ExportFieldDef[] = [
    { key: "investmentHeadId", label: "Investment Head ID", type: "text", required: true },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "amount", label: "Amount", type: "number", required: true },
    { key: "assetCategory", label: "Asset Category", type: "select", options: [{ value: "Fixed", label: "Fixed" }, { value: "Current", label: "Current" }] },
    { key: "description", label: "Description", type: "textarea" },
  ];

  const liabImportFields: ExportFieldDef[] = [
    { key: "investmentHeadId", label: "Investment Head ID", type: "text", required: true },
    { key: "date", label: "Date", type: "date", required: true },
    { key: "amount", label: "Amount", type: "number", required: true },
    { key: "type", label: "Type", type: "select", options: [{ value: "received", label: "Received" }, { value: "pay", label: "Pay" }] },
    { key: "liabilityType", label: "Liability Type", type: "select", options: [{ value: "SHORT_TERM", label: "Short-Term" }, { value: "LONG_TERM", label: "Long-Term" }] },
    { key: "principalAmount", label: "Principal Amount", type: "number" },
    { key: "interestRate", label: "Interest Rate (%)", type: "number" },
    { key: "loanDurationMonths", label: "Loan Duration (Months)", type: "number" },
    { key: "paymentMethod", label: "Payment Method", type: "select", options: [{ value: "Cash", label: "Cash" }, { value: "Bank Transfer", label: "Bank Transfer" }, { value: "Cheque", label: "Cheque" }] },
    { key: "bankId", label: "Bank ID", type: "text" },
    { key: "voucherNo", label: "Voucher No", type: "text" },
    { key: "chequeNo", label: "Cheque No", type: "text" },
    { key: "description", label: "Description", type: "textarea" },
    { key: "isActive", label: "Active", type: "checkbox" },
  ];

  const handleImportCSV = (apiPath: string, fields: ExportFieldDef[], reloadFn: () => void) => {
    importFromCSV({ apiPath, formFields: fields }).then((result) => {
      toast({
        title: "Import Complete",
        description: `Imported: ${result.imported}, Failed: ${result.failed}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      reloadFn();
    }).catch((e: any) => {
      toast({ title: "Import Error", description: e?.message || "Import failed", variant: "destructive" });
    });
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

      {/* Enhancement: Quick Stats Dashboard */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="border-green-200 dark:border-green-900 bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-green-100 dark:bg-green-900/40">
              <Building2 className="w-5 h-5 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Assets</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A" : fmtCurrency(quickStats.totalAssets)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-900 bg-gradient-to-br from-red-50 to-rose-50 dark:from-red-900/20 dark:to-rose-900/20">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-xl bg-red-100 dark:bg-red-900/40">
              <Wallet className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total Liabilities</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A" : fmtCurrency(quickStats.totalLiabilities)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className={`border-2 ${quickStats.netWorth >= 0 ? "border-cyan-200 dark:border-cyan-900 bg-gradient-to-br from-cyan-50 to-sky-50 dark:from-cyan-900/20 dark:to-sky-900/20" : "border-amber-200 dark:border-amber-900 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20"}`}>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`p-2 rounded-xl ${quickStats.netWorth >= 0 ? "bg-cyan-100 dark:bg-cyan-900/40" : "bg-amber-100 dark:bg-amber-900/40"}`}>
              <PieChart className={`w-5 h-5 ${quickStats.netWorth >= 0 ? "text-cyan-600 dark:text-cyan-400" : "text-amber-600 dark:text-amber-400"}`} />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Net Worth (Assets - Liabilities)</p>
              <p className={`text-xl font-bold ${quickStats.netWorth >= 0 ? "text-cyan-700 dark:text-cyan-300" : "text-amber-700 dark:text-amber-300"}`}>{isVatAuditor ? "N/A" : fmtCurrency(quickStats.netWorth)}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex overflow-x-auto h-auto gap-1 sm:gap-2 pb-1 scrollbar-none">
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
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════
            TAB 1: INVESTMENT HEADS
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="investment-heads">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-4">
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
                  {selectedHeadIds.size > 0 && (
                    <Button variant="destructive" size="sm" onClick={() => setBulkDeleteConfirm("heads")}>
                      <Trash2 className="w-4 h-4 mr-1" />Delete ({selectedHeadIds.size})
                    </Button>
                  )}
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
              <div className="overflow-x-auto overflow-y-auto max-h-[65vh] rounded-md border -mx-2 sm:mx-0">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-10">
                        <Checkbox
                          checked={filteredHeads.length > 0 && filteredHeads.every((h: any) => selectedHeadIds.has(h.id))}
                          onCheckedChange={(v) => {
                            if (v) setSelectedHeadIds(new Set(filteredHeads.map((h: any) => h.id)));
                            else setSelectedHeadIds(new Set());
                          }}
                        />
                      </TableHead>
                      <TableHead></TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Opening Balance</TableHead>
                      <TableHead>Opening Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {headsLoading ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredHeads.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No investment heads found</TableCell></TableRow>
                    ) : filteredHeads.map((item: any) => (
                      <React.Fragment key={item.id}>
                        <TableRow className="hover:bg-muted/50">
                          <TableCell>
                            <Checkbox
                              checked={selectedHeadIds.has(item.id)}
                              onCheckedChange={(v) => {
                                const next = new Set(selectedHeadIds);
                                if (v) next.add(item.id); else next.delete(item.id);
                                setSelectedHeadIds(next);
                              }}
                            />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(setExpandedHeads, item.id)}>
                              {expandedHeads.has(item.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </Button>
                          </TableCell>
                          <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{item.code}</TableCell>
                          <TableCell className="text-slate-900 dark:text-white">{item.name}</TableCell>
                          <TableCell><Badge className={TYPE_BADGE[item.type] || "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}>{item.type}</Badge></TableCell>
                          <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.openingBalance)}</TableCell>
                          <TableCell><Badge variant="outline">{item.openingType || "None"}</Badge></TableCell>
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
                            <TableCell colSpan={9} className="bg-muted/30 p-3">
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                                <div><span className="text-muted-foreground">Description:</span> <span className="font-medium text-slate-900 dark:text-white">{item.description || "—"}</span></div>
                                <div><span className="text-muted-foreground">Asset Count:</span> <span className="font-medium text-slate-900 dark:text-white">{item._count?.assets ?? 0}</span></div>
                                <div><span className="text-muted-foreground">Liability Count:</span> <span className="font-medium text-slate-900 dark:text-white">{item._count?.liabilities ?? 0}</span></div>
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 mt-4">
            <StatCard label="Total Investment Heads" value={investSummary?.totalHeads ?? investments.length} icon={Landmark} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
            <StatCard label="Total Opening Balance" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(investSummary?.grandOpeningBalances ?? 0)} icon={Banknote} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-900/30" />
            <StatCard label="Total Invested Amount" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(investSummary?.grandTotalAssets ?? 0)} icon={Banknote} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
            <StatCard label="Total Returns" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(investSummary?.grandTotalLiabilities ?? 0)} icon={TrendingUp} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
            <StatCard label="Net Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(investSummary?.grandNetValue ?? 0)} icon={CheckCircle} color="text-cyan-600" bg="bg-cyan-50 dark:bg-cyan-900/30" />
          </div>

          {/* Enhancement: Investment Performance Metrics */}
          {investPerformance.length > 0 && !isVatAuditor && (
            <Card className="mt-4">
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-green-600" />Investment Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                <div className="overflow-x-auto rounded-md border">
                  <Table className="min-w-[600px]">
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Head</TableHead>
                        <TableHead>Cost Basis</TableHead>
                        <TableHead>Current Value</TableHead>
                        <TableHead>ROI</TableHead>
                        <TableHead>CAGR</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {investPerformance.map((head: any) => (
                        <TableRow key={head.id}>
                          <TableCell className="font-medium text-slate-900 dark:text-white">{head.name} <span className="text-xs text-muted-foreground font-mono">({head.code})</span></TableCell>
                          <TableCell className="font-mono">{fmtCurrency(head.costBasis)}</TableCell>
                          <TableCell className="font-mono font-bold">{fmtCurrency(head.netValue)}</TableCell>
                          <TableCell><Badge className={head.roi >= 0 ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>{fmtPct(head.roi)}</Badge></TableCell>
                          <TableCell><Badge variant="outline">{fmtPct(head.cagr)}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions Bar */}
          <div className="flex items-center justify-end gap-2 mt-4 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => handleImportCSV("/api/assets", assetsImportFields, loadInvestments)}>
              <Upload className="w-4 h-4 mr-1" />Import CSV
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
                      <div className="flex items-center gap-4 text-xs">
                        <span>Opening: <span className="font-mono font-bold">{isVatAuditor ? "N/A" : fmtCurrency(head.openingBalance)}</span></span>
                        <span>Assets: <span className="font-mono font-bold">{isVatAuditor ? "N/A" : fmtCurrency(head.totalAssets)}</span></span>
                        <span>Liabilities: <span className="font-mono font-bold">{isVatAuditor ? "N/A" : fmtCurrency(head.totalLiabilities)}</span></span>
                        <span>Net: <span className="font-mono font-bold">{isVatAuditor ? "N/A" : fmtCurrency(head.netValue)}</span></span>
                      </div>
                    </div>
                  </CardHeader>
                  {expandedInvest.has(head.id) && (
                    <CardContent className="p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Assets mini-table */}
                        <div>
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Assets ({head.assets?.length ?? 0})</h4>
                          {head.assets?.length > 0 ? (
                            <div className="overflow-x-auto overflow-y-auto max-h-48 rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    <TableHead className="text-xs">Date</TableHead>
                                    <TableHead className="text-xs">Category</TableHead>
                                    <TableHead className="text-xs">Amount</TableHead>
                                    <TableHead className="text-xs">Description</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {head.assets.map((a: any) => (
                                    <TableRow key={a.id}>
                                      <TableCell className="text-xs">{fmtDate(a.date)}</TableCell>
                                      <TableCell className="text-xs"><Badge className={CATEGORY_BADGE[a.assetCategory] || ""}>{a.assetCategory}</Badge></TableCell>
                                      <TableCell className="text-xs font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(a.amount)}</TableCell>
                                      <TableCell className="text-xs">{a.description || "—"}</TableCell>
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
                          <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Liabilities ({head.liabilities?.length ?? 0})</h4>
                          {head.liabilities?.length > 0 ? (
                            <div className="overflow-x-auto overflow-y-auto max-h-48 rounded-md border">
                              <Table>
                                <TableHeader>
                                  <TableRow className="bg-muted/50">
                                    <TableHead className="text-xs">Date</TableHead>
                                    <TableHead className="text-xs">Type</TableHead>
                                    <TableHead className="text-xs">Method</TableHead>
                                    <TableHead className="text-xs">Amount</TableHead>
                                    <TableHead className="text-xs">Description</TableHead>
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
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-4">
            <StatCard label="Total Fixed Assets" value={assetsStats.total} icon={Building2} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
            <StatCard label="Total Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(assetsStats.totalValue)} icon={Banknote} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
            <StatCard label="Active Count" value={assetsStats.activeCount} icon={CheckCircle} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
          </div>

          {/* Actions Bar */}
          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Fixed Assets</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => handleImportCSV("/api/assets", assetsImportFields, loadAssets)}>
                    <Upload className="w-4 h-4 mr-1" />Import CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Fixed-Assets", assetsExportColumns, prepareAssetExport(filteredAssets))}>
                    <Download className="w-4 h-4 mr-1" />Export CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportPDF("Fixed-Assets", assetsExportColumns, prepareAssetExport(filteredAssets))}>
                    <FileDown className="w-4 h-4 mr-1" />Export PDF
                  </Button>
                  <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => openAssetCreate("Fixed")} disabled={isVatAuditor}>
                    <Plus className="w-4 h-4 mr-1" />Create Fixed Asset
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
              <div className="overflow-x-auto overflow-y-auto max-h-[65vh] rounded-md border -mx-2 sm:mx-0">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Investment Head</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Net Book Value</TableHead>
                      <TableHead>Accum. Dep.</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assetsLoading ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredAssets.length === 0 ? (
                      <TableRow><TableCell colSpan={9} className="h-24 text-center text-muted-foreground">No fixed assets found</TableCell></TableRow>
                    ) : filteredAssets.map((item: any) => (
                      <TableRow key={item.id} className="hover:bg-muted/50">
                        <TableCell className="text-slate-900 dark:text-white">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-slate-900 dark:text-white">{item.investmentHead?.name || "—"}</TableCell>
                        <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.amount)}</TableCell>
                        <TableCell><Badge className={CATEGORY_BADGE[item.assetCategory] || "bg-slate-100 text-slate-700"}>{item.assetCategory}</Badge></TableCell>
                        <TableCell className="font-mono">{isVatAuditor ? "N/A" : fmtCurrency(item.netBookValue ?? item.amount)}</TableCell>
                        <TableCell className="font-mono text-xs">{isVatAuditor ? "N/A" : fmtCurrency(item.accumulatedDepreciation ?? 0)}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{item.description || "—"}</TableCell>
                        <TableCell>
                          <Badge className={item.isActive ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"}>
                            {item.isActive ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => { openAssetEdit(item, "Fixed"); if (item.usefulLifeMonths > 0) loadDepreciation(item.id); }} disabled={isVatAuditor} title="Edit"><Edit className="w-3.5 h-3.5" /></Button>
                            <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setAssetsDelete(item)} disabled={isVatAuditor} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                            {item.usefulLifeMonths > 0 && (
                              <Button variant="ghost" size="sm" onClick={() => loadDepreciation(item.id)} title="View Depreciation Schedule"><Layers className="w-3.5 h-3.5 text-purple-600" /></Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {filteredAssets.length} of {assets.length} fixed assets</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 4: CURRENT ASSET
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="current-asset">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 mt-4">
            <StatCard label="Total Current Assets" value={currentAssetsStats.total} icon={Wallet} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
            <StatCard label="Total Value" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(currentAssetsStats.totalValue)} icon={Banknote} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
            <StatCard label="Active Count" value={currentAssetsStats.activeCount} icon={CheckCircle} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
          </div>

          {/* Actions Bar */}
          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Current Assets</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => handleImportCSV("/api/assets", assetsImportFields, loadCurrentAssets)}>
                    <Upload className="w-4 h-4 mr-1" />Import CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Current-Assets", assetsExportColumns, prepareAssetExport(filteredCurrentAssets))}>
                    <Download className="w-4 h-4 mr-1" />Export CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportPDF("Current-Assets", assetsExportColumns, prepareAssetExport(filteredCurrentAssets))}>
                    <FileDown className="w-4 h-4 mr-1" />Export PDF
                  </Button>
                  <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => openAssetCreate("Current")} disabled={isVatAuditor}>
                    <Plus className="w-4 h-4 mr-1" />Create Current Asset
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
              <div className="overflow-x-auto overflow-y-auto max-h-[65vh] rounded-md border -mx-2 sm:mx-0">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Investment Head</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {currentAssetsLoading ? (
                      <TableRow><TableCell colSpan={7} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredCurrentAssets.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="h-24 text-center text-muted-foreground">No current assets found</TableCell></TableRow>
                    ) : filteredCurrentAssets.map((item: any) => (
                      <TableRow key={item.id} className="hover:bg-muted/50">
                        <TableCell className="text-slate-900 dark:text-white">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-slate-900 dark:text-white">{item.investmentHead?.name || "—"}</TableCell>
                        <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.amount)}</TableCell>
                        <TableCell><Badge className={CATEGORY_BADGE[item.assetCategory] || "bg-slate-100 text-slate-700"}>{item.assetCategory}</Badge></TableCell>
                        <TableCell className="max-w-[200px] truncate">{item.description || "—"}</TableCell>
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
            TAB 5: LIABILITY RECEIVE
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="liability-receive">
          {/* Exceed Balance Warning Banner */}
          {exceedBalanceWarning && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg mt-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">Action Blocked: Repayment value exceeds total outstanding liability balance.</span>
            </div>
          )}
          {/* Deactivated Head Shield Banner */}
          {liabilityTypeHeads.some((h: any) => !h.isActive) && (
            <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg mt-4">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span className="text-xs text-amber-700 dark:text-amber-400">⚠️ Heads marked as inactive cannot receive new transactions</span>
            </div>
          )}
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 mt-4">
            <StatCard label="Total Received" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabReceiveStats.total)} icon={ArrowDownCircle} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
            <StatCard label="Cash" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabReceiveStats.cash)} icon={Banknote} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
            <StatCard label="Bank Transfer" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabReceiveStats.bank)} icon={Building2} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
            <StatCard label="Cheque" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabReceiveStats.cheque)} icon={Wallet} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-900/30" />
            <StatCard label="Total Outstanding" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(Object.values(outstandingBalances).reduce((s: number, v: number) => s + Math.max(0, v), 0))} icon={TrendingUp} color="text-red-600" bg="bg-red-50 dark:bg-red-900/30" />
          </div>

          {/* Actions Bar */}
          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Liability Receive</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => handleImportCSV("/api/liabilities", liabImportFields, loadLiabReceive)}>
                    <Upload className="w-4 h-4 mr-1" />Import CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Liability-Receive", liabExportColumns, prepareLiabExport(filteredLiabReceive))}>
                    <Download className="w-4 h-4 mr-1" />Export CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportPDF("Liability-Receive", liabExportColumns, prepareLiabExport(filteredLiabReceive))}>
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
              <div className="overflow-x-auto overflow-y-auto max-h-[65vh] rounded-md border -mx-2 sm:mx-0">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Investment Head</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Principal</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Outstanding</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Voucher</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liabReceiveLoading ? (
                      <TableRow><TableCell colSpan={11} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredLiabReceive.length === 0 ? (
                      <TableRow><TableCell colSpan={11} className="h-24 text-center text-muted-foreground">No liability receives found</TableCell></TableRow>
                    ) : filteredLiabReceive.map((item: any) => {
                      const bankObj = banks.find((b: any) => b.id === item.bankId);
                      return (
                      <TableRow key={item.id} className="hover:bg-muted/50">
                        <TableCell className="text-slate-900 dark:text-white">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-slate-900 dark:text-white">{item.investmentHead?.name || "—"}</TableCell>
                        <TableCell><Badge className={LIABILITY_TYPE_BADGE[item.liabilityType] || "bg-slate-100 text-slate-700"}>{item.liabilityType === "LONG_TERM" ? "Long-Term" : "Short-Term"}</Badge></TableCell>
                        <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.principalAmount)}</TableCell>
                        <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.amount)}</TableCell>
                        <TableCell className="font-mono font-semibold text-red-600 dark:text-red-400">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(outstandingBalances[item.investmentHeadId] || 0)}</TableCell>
                        <TableCell><Badge className={PAYMENT_METHOD_BADGE[item.paymentMethod] || "bg-slate-100 text-slate-700"}>{item.paymentMethod || "—"}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{bankObj ? `${bankObj.bankName} (${bankObj.accountNo})` : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.voucherNo || "—"}</TableCell>
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
                    );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {filteredLiabReceive.length} of {liabReceive.length} entries</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 6: LIABILITY PAY
        ═══════════════════════════════════════════════════════════ */}
        <TabsContent value="liability-pay">
          {/* Exceed Balance Warning Banner */}
          {exceedBalanceWarning && (
            <div className="flex items-center gap-2 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800 rounded-lg mt-4">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <span className="text-sm font-semibold text-red-700 dark:text-red-400">Action Blocked: Repayment value exceeds total outstanding liability balance.</span>
            </div>
          )}
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3 mt-4">
            <StatCard label="Total Paid" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabPayStats.total)} icon={ArrowUpCircle} color="text-red-600" bg="bg-red-50 dark:bg-red-900/30" />
            <StatCard label="Cash" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabPayStats.cash)} icon={Banknote} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
            <StatCard label="Bank Transfer" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabPayStats.bank)} icon={Building2} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
            <StatCard label="Cheque" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(liabPayStats.cheque)} icon={Wallet} color="text-purple-600" bg="bg-purple-50 dark:bg-purple-900/30" />
          </div>

          {/* Actions Bar */}
          <Card className="mt-4">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base">Liability Pay</CardTitle>
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => handleImportCSV("/api/liabilities", liabImportFields, loadLiabPay)}>
                    <Upload className="w-4 h-4 mr-1" />Import CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportCSV("Liability-Pay", liabExportColumns, prepareLiabExport(filteredLiabPay))}>
                    <Download className="w-4 h-4 mr-1" />Export CSV
                  </Button>
                  <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={() => doExportPDF("Liability-Pay", liabExportColumns, prepareLiabExport(filteredLiabPay))}>
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
              <div className="overflow-x-auto overflow-y-auto max-h-[65vh] rounded-md border -mx-2 sm:mx-0">
                <Table className="min-w-[700px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Date</TableHead>
                      <TableHead>Investment Head</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Remaining Outstanding</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Cheque</TableHead>
                      <TableHead>Voucher</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liabPayLoading ? (
                      <TableRow><TableCell colSpan={10} className="h-24 text-center"><RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
                    ) : filteredLiabPay.length === 0 ? (
                      <TableRow><TableCell colSpan={10} className="h-24 text-center text-muted-foreground">No liability pays found</TableCell></TableRow>
                    ) : filteredLiabPay.map((item: any) => {
                      const bankObj = banks.find((b: any) => b.id === item.bankId);
                      return (
                      <TableRow key={item.id} className="hover:bg-muted/50">
                        <TableCell className="text-slate-900 dark:text-white">{fmtDate(item.date)}</TableCell>
                        <TableCell className="text-slate-900 dark:text-white">{item.investmentHead?.name || "—"}</TableCell>
                        <TableCell className="font-mono">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(item.amount)}</TableCell>
                        <TableCell className="font-mono font-semibold text-red-600 dark:text-red-400">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(outstandingBalances[item.investmentHeadId] || 0)}</TableCell>
                        <TableCell><Badge className={PAYMENT_METHOD_BADGE[item.paymentMethod] || "bg-slate-100 text-slate-700"}>{item.paymentMethod || "—"}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground">{bankObj ? `${bankObj.bankName} (${bankObj.accountNo})` : "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.chequeNo || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.voucherNo || "—"}</TableCell>
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
                    );})}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">Showing {filteredLiabPay.length} of {liabPay.length} entries</div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════
            TAB 7: LIABILITY REPORT
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
                    <Button variant="outline" size="sm" onClick={() => doExportCSV("Liability-Report", reportExportColumns, reportData.heads || [])}>
                      <Download className="w-4 h-4 mr-1" />Export CSV
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => doExportPDF("Liability-Report", reportExportColumns, reportData.heads || [], "landscape")}>
                      <FileDown className="w-4 h-4 mr-1" />Export PDF
                    </Button>
                  </>
                )}
              </div>

              {/* Report Data */}
              {reportData ? (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 mb-4">
                    <StatCard label="Total Heads" value={reportData.summary?.totalHeads ?? 0} icon={Landmark} color="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/30" />
                    <StatCard label="Total Opening" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(reportData.summary?.totalOpening ?? 0)} icon={Banknote} color="text-green-600" bg="bg-green-50 dark:bg-green-900/30" />
                    <StatCard label="Total Received" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(reportData.summary?.totalReceived ?? 0)} icon={ArrowDownCircle} color="text-cyan-600" bg="bg-cyan-50 dark:bg-cyan-900/30" />
                    <StatCard label="Total Paid" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(reportData.summary?.totalPaid ?? 0)} icon={ArrowUpCircle} color="text-red-600" bg="bg-red-50 dark:bg-red-900/30" />
                    <StatCard label="Outstanding Balance" value={isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(reportData.summary?.totalOutstanding ?? 0)} icon={CheckCircle} color="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/30" />
                  </div>

                  <Separator className="my-4" />

                  {/* Enhancement: Bar Chart Visualization — Received vs Paid per Head */}
                  {!isVatAuditor && (reportData.heads || []).length > 0 && (
                    <Card className="mb-4">
                      <CardHeader className="py-3 px-4">
                        <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-cyan-600" />Received vs Paid per Head</CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="flex items-end gap-2 h-48 overflow-x-auto">
                          {(reportData.heads || []).map((head: any) => {
                            const maxVal = Math.max(head.totalReceived || 0, head.totalPaid || 0, 1);
                            const receivedH = Math.max(4, ((head.totalReceived || 0) / maxVal) * 160);
                            const paidH = Math.max(4, ((head.totalPaid || 0) / maxVal) * 160);
                            return (
                              <div key={head.id} className="flex flex-col items-center gap-1 min-w-[50px] flex-1">
                                <div className="flex items-end gap-1 h-40">
                                  <div className="w-5 bg-green-400 dark:bg-green-500 rounded-t transition-all" style={{ height: `${receivedH}px` }} title={`Received: ${fmtCurrency(head.totalReceived)}`} />
                                  <div className="w-5 bg-red-400 dark:bg-red-500 rounded-t transition-all" style={{ height: `${paidH}px` }} title={`Paid: ${fmtCurrency(head.totalPaid)}`} />
                                </div>
                                <p className="text-[9px] text-muted-foreground truncate w-full text-center">{head.name}</p>
                              </div>
                            );
                          })}
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-400 dark:bg-green-500" />Received</span>
                          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-400 dark:bg-red-500" />Paid</span>
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Per-head Breakdown Table */}
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-2">Per-Head Breakdown</h3>
                  <div className="overflow-x-auto overflow-y-auto max-h-[65vh] rounded-md border -mx-2 sm:mx-0">
                    <Table className="min-w-[700px]">
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="w-10"></TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Opening</TableHead>
                          <TableHead>Received</TableHead>
                          <TableHead>Paid</TableHead>
                          <TableHead>Current Balance</TableHead>
                          <TableHead>Transactions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(reportData.heads || []).length === 0 ? (
                          <TableRow><TableCell colSpan={8} className="h-24 text-center text-muted-foreground">No liability heads found for this period</TableCell></TableRow>
                        ) : (reportData.heads || []).map((head: any) => (
                          <React.Fragment key={head.id}>
                            <TableRow className="hover:bg-muted/50">
                              <TableCell>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => toggleExpand(setExpandedReport, head.id)}>
                                  {expandedReport.has(head.id) ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                </Button>
                              </TableCell>
                              <TableCell className="font-mono font-medium text-slate-900 dark:text-white">{head.code}</TableCell>
                              <TableCell className="text-slate-900 dark:text-white">{head.name}</TableCell>
                              <TableCell className="font-mono">{fmtCurrency(head.openingBalance)}</TableCell>
                              <TableCell className="font-mono">{fmtCurrency(head.totalReceived)}</TableCell>
                              <TableCell className="font-mono">{fmtCurrency(head.totalPaid)}</TableCell>
                              <TableCell className="font-mono font-bold">{fmtCurrency(head.currentBalance)}</TableCell>
                              <TableCell><Badge variant="outline">{head.transactionCount ?? 0}</Badge></TableCell>
                            </TableRow>
                            {expandedReport.has(head.id) && (
                              <TableRow>
                                <TableCell colSpan={8} className="bg-muted/30 p-3">
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

                                  {/* Individual Transactions */}
                                  {head.transactions && head.transactions.length > 0 && (
                                    <div>
                                      <h5 className="text-xs font-semibold text-muted-foreground mb-1">Transactions</h5>
                                      <div className="overflow-x-auto overflow-y-auto max-h-40 rounded-md border">
                                        <Table>
                                          <TableHeader>
                                            <TableRow>
                                              <TableHead className="text-xs">Date</TableHead>
                                              <TableHead className="text-xs">Type</TableHead>
                                              <TableHead className="text-xs">Method</TableHead>
                                              <TableHead className="text-xs">Amount</TableHead>
                                              <TableHead className="text-xs">Description</TableHead>
                                            </TableRow>
                                          </TableHeader>
                                          <TableBody>
                                            {head.transactions.map((t: any) => (
                                              <TableRow key={t.id}>
                                                <TableCell className="text-xs">{fmtDate(t.date)}</TableCell>
                                                <TableCell className="text-xs"><Badge variant="outline">{t.type}</Badge></TableCell>
                                                <TableCell className="text-xs"><Badge className={PAYMENT_METHOD_BADGE[t.paymentMethod] || ""}>{t.paymentMethod || "—"}</Badge></TableCell>
                                                <TableCell className="text-xs font-mono">{fmtCurrency(t.amount)}</TableCell>
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
                        ))}
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
      </Tabs>

      {/* ═══════════════════════════════════════════════════════════
          DIALOGS
      ═══════════════════════════════════════════════════════════ */}

      {/* ─── Investment Head Create/Edit Dialog ─── */}
      <Dialog open={headsForm} onOpenChange={setHeadsForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
              <Input id="head-opening-balance" type="number" step="0.01" value={headsFormData.openingBalance} onChange={(e) => setHeadsFormData({ ...headsFormData, openingBalance: e.target.value })} />
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
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate &quot;{headsDelete?.name}&quot; ({headsDelete?.code})?</DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">The investment head will be marked as inactive. If it has active assets or liabilities, deactivation will be blocked.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeadsDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={deleteHeads}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Investment Entry (Add against head) Dialog ─── */}
      <Dialog open={investForm} onOpenChange={setInvestForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
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
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">{assetsEdit ? "Edit Fixed Asset" : "Create Fixed Asset"}</DialogTitle>
            <DialogDescription>{assetsEdit ? "Update fixed asset details" : "Add a new fixed asset"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Investment Head <span className="text-red-500">*</span></Label>
              <Select value={assetsFormData.investmentHeadId} onValueChange={(v) => setAssetsFormData({ ...assetsFormData, investmentHeadId: v })}>
                <SelectTrigger><SelectValue placeholder="Select investment head" /></SelectTrigger>
                <SelectContent>
                  {assetTypeHeads.map((h: any) => (
                    <SelectItem key={h.id} value={h.id}>{h.code} - {h.name}</SelectItem>
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
                <Input type="number" step="0.01" value={assetsFormData.amount} onChange={(e) => setAssetsFormData({ ...assetsFormData, amount: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Asset Category</Label>
              <Input value="Fixed" disabled className="bg-muted" />
            </div>
            <Separator />
            <div className="flex items-center gap-2 mb-1">
              <Calculator className="w-4 h-4 text-purple-600" />
              <span className="text-sm font-semibold text-slate-900 dark:text-white">Depreciation Details</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Purchase Value</Label>
                <Input type="number" step="0.01" min="0" value={assetsFormData.purchaseValue} onChange={(e) => setAssetsFormData({ ...assetsFormData, purchaseValue: e.target.value })} placeholder="Original purchase value" />
              </div>
              <div>
                <Label>Salvage Value</Label>
                <Input type="number" step="0.01" min="0" value={assetsFormData.salvageValue} onChange={(e) => setAssetsFormData({ ...assetsFormData, salvageValue: e.target.value })} placeholder="Residual value" />
              </div>
              <div>
                <Label>Useful Life (Months)</Label>
                <Input type="number" min="0" value={assetsFormData.usefulLifeMonths} onChange={(e) => setAssetsFormData({ ...assetsFormData, usefulLifeMonths: e.target.value })} placeholder="e.g., 60" />
              </div>
            </div>
            {Number(assetsFormData.usefulLifeMonths) > 0 && Number(assetsFormData.purchaseValue) > 0 && (
              <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 rounded-md text-xs text-purple-700 dark:text-purple-300">
                <Calculator className="w-3.5 h-3.5 inline mr-1" />
                Monthly Depreciation: ৳{safeNumberFmt.format(Math.max(0, (Number(assetsFormData.purchaseValue) - Number(assetsFormData.salvageValue)) / Number(assetsFormData.usefulLifeMonths)))}
                {Number(assetsFormData.salvageValue) > 0 && ` | Salvage: ৳${safeNumberFmt.format(Number(assetsFormData.salvageValue))}`}
              </div>
            )}
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
              {assetsSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
              {assetsEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Fixed Asset Delete Confirmation ─── */}
      <Dialog open={!!assetsDelete} onOpenChange={() => setAssetsDelete(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this fixed asset?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssetsDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteAsset(assetsDelete, "Fixed")}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Current Asset Create/Edit Dialog ─── */}
      <Dialog open={currentAssetsForm} onOpenChange={setCurrentAssetsForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">{currentAssetsEdit ? "Edit Current Asset" : "Create Current Asset"}</DialogTitle>
            <DialogDescription>{currentAssetsEdit ? "Update current asset details" : "Add a new current asset"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Investment Head <span className="text-red-500">*</span></Label>
              <Select value={currentAssetsFormData.investmentHeadId} onValueChange={(v) => setCurrentAssetsFormData({ ...currentAssetsFormData, investmentHeadId: v })}>
                <SelectTrigger><SelectValue placeholder="Select investment head" /></SelectTrigger>
                <SelectContent>
                  {assetTypeHeads.map((h: any) => (
                    <SelectItem key={h.id} value={h.id}>{h.code} - {h.name}</SelectItem>
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
                <Input type="number" step="0.01" value={currentAssetsFormData.amount} onChange={(e) => setCurrentAssetsFormData({ ...currentAssetsFormData, amount: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Asset Category</Label>
              <Input value="Current" disabled className="bg-muted" />
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
              {currentAssetsSaving ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
              {currentAssetsEdit ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Current Asset Delete Confirmation ─── */}
      <Dialog open={!!currentAssetsDelete} onOpenChange={() => setCurrentAssetsDelete(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this current asset?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCurrentAssetsDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteAsset(currentAssetsDelete, "Current")}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Liability Receive Create/Edit Dialog ─── */}
      <Dialog open={liabReceiveForm} onOpenChange={setLiabReceiveForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">{liabReceiveEdit ? "Edit Liability Receive" : "Record Loan Receipt"}</DialogTitle>
            <DialogDescription>{liabReceiveEdit ? "Update liability receive details" : "Record a new liability/loan receipt into the system"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Investment Head <span className="text-red-500">*</span></Label>
                <Select value={liabReceiveFormData.investmentHeadId} onValueChange={(v) => {
                  setLiabReceiveFormData({ ...liabReceiveFormData, investmentHeadId: v });
                  const selectedHead = liabilityTypeHeads.find((h: any) => h.id === v);
                  if (selectedHead && !selectedHead.isActive) {
                    toast({ title: "Warning", description: "This head is inactive. Transactions are blocked.", variant: "destructive" });
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Select liability head" /></SelectTrigger>
                  <SelectContent>
                    {liabilityTypeHeads.map((h: any) => (
                      <SelectItem key={h.id} value={h.id} disabled={!h.isActive}>
                        {h.code} - {h.name} {!h.isActive ? "(Inactive)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Liability Type <span className="text-red-500">*</span></Label>
                <Select value={liabReceiveFormData.liabilityType} onValueChange={(v) => setLiabReceiveFormData({ ...liabReceiveFormData, liabilityType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SHORT_TERM">Short-Term (&lt; 1 Year)</SelectItem>
                    <SelectItem value="LONG_TERM">Long-Term (≥ 1 Year)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={liabReceiveFormData.date} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, date: e.target.value })} />
              </div>
              <div>
                <Label>Principal Amount <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" min="0.01" value={liabReceiveFormData.principalAmount} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, principalAmount: e.target.value })} className={Number(liabReceiveFormData.principalAmount) <= 0 && liabReceiveFormData.principalAmount !== "" ? "border-red-500 focus:border-red-500" : ""} />
                {Number(liabReceiveFormData.principalAmount) <= 0 && liabReceiveFormData.principalAmount !== "" && <p className="text-xs text-red-500 mt-1">Must be greater than zero</p>}
              </div>
              <div>
                <Label>Amount Received <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" min="0.01" value={liabReceiveFormData.amount} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, amount: e.target.value })} className={Number(liabReceiveFormData.amount) <= 0 && liabReceiveFormData.amount !== "" ? "border-red-500 focus:border-red-500" : ""} />
                {Number(liabReceiveFormData.amount) <= 0 && liabReceiveFormData.amount !== "" && <p className="text-xs text-red-500 mt-1">Must be greater than zero</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Interest Rate (%)</Label>
                <Input type="number" step="0.01" min="0" value={liabReceiveFormData.interestRate} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, interestRate: e.target.value })} className={Number(liabReceiveFormData.interestRate) < 0 ? "border-red-500 focus:border-red-500" : ""} />
                {Number(liabReceiveFormData.interestRate) < 0 && <p className="text-xs text-red-500 mt-1">Cannot be negative</p>}
              </div>
              <div>
              <Label>Loan Duration (Months)</Label>
                <Input type="number" min="0" value={liabReceiveFormData.loanDurationMonths} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, loanDurationMonths: e.target.value })} className={Number(liabReceiveFormData.loanDurationMonths) < 0 ? "border-red-500 focus:border-red-500" : ""} />
                {Number(liabReceiveFormData.loanDurationMonths) < 0 && <p className="text-xs text-red-500 mt-1">Cannot be negative</p>}
            </div>
            </div>
            {Number(liabReceiveFormData.interestRate) > 0 && Number(liabReceiveFormData.loanDurationMonths) > 0 && Number(liabReceiveFormData.principalAmount) > 0 && (
              <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-md text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between">
                <span>
                  <Calculator className="w-3.5 h-3.5 inline mr-1" />
                  Monthly EMI: {fmtCurrency(computeAmortization(Number(liabReceiveFormData.principalAmount), Number(liabReceiveFormData.interestRate), Number(liabReceiveFormData.loanDurationMonths))?.[0]?.payment || 0)}
                  {" | "}Total Interest: {fmtCurrency(computeAmortization(Number(liabReceiveFormData.principalAmount), Number(liabReceiveFormData.interestRate), Number(liabReceiveFormData.loanDurationMonths)).reduce((s, r) => s + r.interest, 0))}
                </span>
                <Button variant="outline" size="sm" className="text-xs h-6" onClick={() => { setAmortizationData(computeAmortization(Number(liabReceiveFormData.principalAmount), Number(liabReceiveFormData.interestRate), Number(liabReceiveFormData.loanDurationMonths))); setAmortizationVisible(true); }}>View Schedule</Button>
              </div>
            )}
            <Separator />
            <div className="grid grid-cols-2 gap-4">
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
                <Label>Bank Account</Label>
                <Select value={liabReceiveFormData.bankId || "none"} onValueChange={(v) => setLiabReceiveFormData({ ...liabReceiveFormData, bankId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Cash)</SelectItem>
                    {banks.filter((b: any) => b.isActive).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{b.bankName} - {b.accountNo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Voucher No</Label>
                <Input value={liabReceiveFormData.voucherNo} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, voucherNo: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <Label>Cheque No</Label>
                <Input value={liabReceiveFormData.chequeNo} onChange={(e) => setLiabReceiveFormData({ ...liabReceiveFormData, chequeNo: e.target.value })} placeholder="Optional" />
              </div>
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
              {liabReceiveSaving ? <><RefreshCw className="w-4 h-4 mr-1 animate-spin" />Re-calculating Debt Schedules & Liquid Vault Balances...</> : (liabReceiveEdit ? "Update Receive" : "Record Loan Receipt")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Liability Receive Delete Confirmation ─── */}
      <Dialog open={!!liabReceiveDelete} onOpenChange={() => setLiabReceiveDelete(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this liability receive entry?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiabReceiveDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteLiab(liabReceiveDelete, "received")}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Liability Pay Create/Edit Dialog ─── */}
      <Dialog open={liabPayForm} onOpenChange={setLiabPayForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">{liabPayEdit ? "Edit Liability Payment" : "Execute Liability Payment"}</DialogTitle>
            <DialogDescription>{liabPayEdit ? "Update liability payment details" : "Execute a liability/loan repayment"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Investment Head <span className="text-red-500">*</span></Label>
                <Select value={liabPayFormData.investmentHeadId} onValueChange={(v) => {
                  setLiabPayFormData({ ...liabPayFormData, investmentHeadId: v });
                  const selectedHead = liabilityTypeHeads.find((h: any) => h.id === v);
                  if (selectedHead && !selectedHead.isActive) {
                    toast({ title: "Warning", description: "This head is inactive. Transactions are blocked.", variant: "destructive" });
                  }
                  const outBal = outstandingBalances[v] || 0;
                  if (outBal <= 0) {
                    setExceedBalanceWarning(true);
                  } else {
                    setExceedBalanceWarning(false);
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="Select liability head" /></SelectTrigger>
                  <SelectContent>
                    {liabilityTypeHeads.map((h: any) => (
                      <SelectItem key={h.id} value={h.id} disabled={!h.isActive}>
                        {h.code} - {h.name} {!h.isActive ? "(Inactive)" : ""} {outstandingBalances[h.id] > 0 ? `(Outstanding: ৳${safeNumberFmt.format(outstandingBalances[h.id])})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Date <span className="text-red-500">*</span></Label>
                <Input type="date" value={liabPayFormData.date} onChange={(e) => setLiabPayFormData({ ...liabPayFormData, date: e.target.value })} />
              </div>
            </div>
            {liabPayFormData.investmentHeadId && (
              <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-md text-sm">
                <span className="font-semibold">Current Outstanding: </span>
                <span className={`font-mono ${outstandingBalances[liabPayFormData.investmentHeadId] > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                  {fmtCurrency(outstandingBalances[liabPayFormData.investmentHeadId] || 0)}
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Payment Amount <span className="text-red-500">*</span></Label>
                <Input type="number" step="0.01" min="0.01" value={liabPayFormData.amount} onChange={(e) => {
                  setLiabPayFormData({ ...liabPayFormData, amount: e.target.value });
                  const val = Number(e.target.value);
                  const outBal = outstandingBalances[liabPayFormData.investmentHeadId] || 0;
                  if (val > outBal) setExceedBalanceWarning(true);
                  else setExceedBalanceWarning(false);
                }} className={Number(liabPayFormData.amount) <= 0 && liabPayFormData.amount !== "" ? "border-red-500 focus:border-red-500" : ""} />
                {Number(liabPayFormData.amount) <= 0 && liabPayFormData.amount !== "" && <p className="text-xs text-red-500 mt-1">Must be greater than zero</p>}
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
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Bank Account</Label>
                <Select value={liabPayFormData.bankId || "none"} onValueChange={(v) => setLiabPayFormData({ ...liabPayFormData, bankId: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Select bank" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None (Cash)</SelectItem>
                    {banks.filter((b: any) => b.isActive).map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>{b.bankName} - {b.accountNo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Liability Type</Label>
                <Select value={liabPayFormData.liabilityType} onValueChange={(v) => setLiabPayFormData({ ...liabPayFormData, liabilityType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SHORT_TERM">Short-Term (&lt; 1 Year)</SelectItem>
                    <SelectItem value="LONG_TERM">Long-Term (≥ 1 Year)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Voucher No</Label>
                <Input value={liabPayFormData.voucherNo} onChange={(e) => setLiabPayFormData({ ...liabPayFormData, voucherNo: e.target.value })} placeholder="Optional" />
              </div>
              <div>
                <Label>Cheque No</Label>
                <Input value={liabPayFormData.chequeNo} onChange={(e) => setLiabPayFormData({ ...liabPayFormData, chequeNo: e.target.value })} placeholder="Optional" />
              </div>
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
            <Button className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => saveLiab("pay")} disabled={liabPaySaving || exceedBalanceWarning}>
              {liabPaySaving ? <><RefreshCw className="w-4 h-4 mr-1 animate-spin" />Re-calculating Debt Schedules & Liquid Vault Balances...</> : (liabPayEdit ? "Update Payment" : "Execute Liability Payment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Liability Pay Delete Confirmation ─── */}
      <Dialog open={!!liabPayDelete} onOpenChange={() => setLiabPayDelete(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this liability pay entry?</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLiabPayDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteLiab(liabPayDelete, "pay")}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Enhancement: Depreciation Schedule Dialog ─── */}
      <Dialog open={depreciationAssetId !== null} onOpenChange={() => { setDepreciationAssetId(null); setDepreciationData([]); }}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-600" />Asset Depreciation Schedule
            </DialogTitle>
            <DialogDescription>Straight-line depreciation schedule for this fixed asset</DialogDescription>
          </DialogHeader>
          {depreciationLoading ? (
            <div className="flex items-center justify-center py-10"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : depreciationData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Layers className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No depreciation entries yet. Create one by clicking "Record Depreciation".</p>
              <Button size="sm" className="mt-3 bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={async () => {
                if (!depreciationAssetId) return;
                try {
                  await apiFetch("/api/asset-depreciation", { method: "POST", body: JSON.stringify({ assetId: depreciationAssetId, periodDate: new Date().toISOString() }) });
                  loadDepreciation(depreciationAssetId);
                  loadAssets();
                  toast({ title: "Depreciation Recorded", description: "Monthly depreciation entry created with ledger posting" });
                } catch (e: any) {
                  toast({ title: "Error", description: e.message, variant: "destructive" });
                }
              }}>
                <Plus className="w-4 h-4 mr-1" />Record Depreciation
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Period</TableHead>
                    <TableHead>Depreciation</TableHead>
                    <TableHead>Accumulated</TableHead>
                    <TableHead>Net Book Value</TableHead>
                    <TableHead>Method</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depreciationData.map((d: any) => (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm">{fmtDate(d.periodDate)}</TableCell>
                      <TableCell className="font-mono text-sm">{isVatAuditor ? "N/A" : fmtCurrency(d.depreciationAmount)}</TableCell>
                      <TableCell className="font-mono text-sm">{isVatAuditor ? "N/A" : fmtCurrency(d.accumulatedDepreciation)}</TableCell>
                      <TableCell className="font-mono text-sm font-bold">{isVatAuditor ? "N/A" : fmtCurrency(d.netBookValue)}</TableCell>
                      <TableCell><Badge variant="outline">{d.method}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {depreciationData.length > 0 && (
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={async () => {
                if (!depreciationAssetId) return;
                try {
                  await apiFetch("/api/asset-depreciation", { method: "POST", body: JSON.stringify({ assetId: depreciationAssetId, periodDate: new Date().toISOString() }) });
                  loadDepreciation(depreciationAssetId);
                  loadAssets();
                  toast({ title: "Depreciation Recorded", description: "Monthly depreciation entry created with ledger posting" });
                } catch (e: any) {
                  toast({ title: "Error", description: e.message, variant: "destructive" });
                }
              }}>
                <Plus className="w-4 h-4 mr-1" />Record Next Month
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Enhancement: Amortization Schedule Dialog ─── */}
      <Dialog open={amortizationVisible} onOpenChange={setAmortizationVisible}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <Calculator className="w-5 h-5 text-amber-600" />Amortization Schedule
            </DialogTitle>
            <DialogDescription>Monthly EMI breakdown (principal vs interest)</DialogDescription>
          </DialogHeader>
          {amortizationData.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Calculator className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No amortization data. Record a liability with interest rate and loan duration to see the schedule.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Month</TableHead>
                    <TableHead>EMI Payment</TableHead>
                    <TableHead>Principal</TableHead>
                    <TableHead>Interest</TableHead>
                    <TableHead>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {amortizationData.map((row: any) => (
                    <TableRow key={row.month}>
                      <TableCell className="text-sm font-medium">{row.month}</TableCell>
                      <TableCell className="font-mono text-sm">{isVatAuditor ? "N/A" : fmtCurrency(row.payment)}</TableCell>
                      <TableCell className="font-mono text-sm text-green-600">{isVatAuditor ? "N/A" : fmtCurrency(row.principal)}</TableCell>
                      <TableCell className="font-mono text-sm text-amber-600">{isVatAuditor ? "N/A" : fmtCurrency(row.interest)}</TableCell>
                      <TableCell className="font-mono text-sm font-bold">{isVatAuditor ? "N/A" : fmtCurrency(row.balance)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ─── Enhancement: Bulk Delete Confirmation ─── */}
      <Dialog open={bulkDeleteConfirm !== null} onOpenChange={() => setBulkDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Bulk Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {bulkDeleteConfirm === "heads" ? selectedHeadIds.size
                : bulkDeleteConfirm === "assets" ? selectedAssetIds.size
                : bulkDeleteConfirm === "currentAssets" ? selectedCurrentAssetIds.size
                : bulkDeleteConfirm === "liabReceive" ? selectedLiabReceiveIds.size
                : selectedLiabPayIds.size} selected items? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => handleBulkDelete(bulkDeleteConfirm || "heads")}>Delete All Selected</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Enhancement: Activity Log ─── */}
      <Card className="mt-6">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] text-white py-3 px-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4" />Recent Activity — Investment Module
            </CardTitle>
            <Button variant="outline" size="sm" className="text-white border-slate-500 hover:bg-slate-700" onClick={loadActivityLog}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          {activityLogLoading ? (
            <div className="flex items-center justify-center py-6"><RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : activityLog.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
          ) : (
            <div className="overflow-x-auto -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Record</TableHead>
                    <TableHead>User</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityLog.slice(0, 10).map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">{log.createdAt ? new Date(log.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</TableCell>
                      <TableCell><Badge className={log.action === "CREATE" ? "bg-green-100 text-green-700" : log.action === "UPDATE" ? "bg-blue-100 text-blue-700" : "bg-red-100 text-red-700"}>{log.action}</Badge></TableCell>
                      <TableCell className="text-xs">{log.module || "—"}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{log.recordLabel || "—"}</TableCell>
                      <TableCell className="text-xs">{log.userName || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
