"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Building2, RefreshCw, Plus, Edit, Trash2, ArrowLeftRight, Download, Upload, FileDown,
  ShieldCheck, AlertTriangle, CheckCircle, XCircle, Eye, ChevronDown,
  TrendingUp, DollarSign, Package, BarChart3, FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { exportToPDF, exportToCSV, importFromCSV, type ColumnDef, type CompanyProfile } from "@/lib/export-utils";

// ============================================================
// TYPES
// ============================================================

interface MultiBranchConsolidationPageProps {
  userRole: string;
  userName: string;
  userEmail: string;
}

interface BranchRecord {
  id: string;
  code: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  managerName?: string | null;
  companyId: string;
  status: string;
  isHeadOffice: boolean;
  gstNumber?: string | null;
  openingDate?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  company?: { id: string; name: string; code: string };
  _count?: { users: number; godowns: number };
}

interface TransferRecord {
  id: string;
  transferNo: string;
  fromBranchId: string;
  toBranchId: string;
  transferType: string;
  status: string;
  productId?: string | null;
  quantity: number;
  unitCost: number;
  totalValue: number;
  fundAmount: number;
  fromBankId?: string | null;
  toBankId?: string | null;
  authorizedBy?: string | null;
  authorizedAt?: string | null;
  companyId: string;
  notes?: string | null;
  reason?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  fromBranch: { id: string; name: string; code: string; status: string };
  toBranch: { id: string; name: string; code: string; status: string };
}

interface ConsolidationLogRecord {
  id: string;
  consolidationNo: string;
  companyId: string;
  branchIds: string;
  periodStart: string;
  periodEnd: string;
  statementType: string;
  status: string;
  totalRevenue: number;
  totalCOGS: number;
  totalExpenses: number;
  totalAssets: number;
  totalLiabilities: number;
  eliminationAmount: number;
  eliminationCount: number;
  eliminationDetails?: string | null;
  generatedBy?: string | null;
  generatedByName?: string | null;
  reviewedBy?: string | null;
  approvedBy?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  branchNames?: string[];
  company?: { id: string; name: string; code: string };
}

interface ConsolidationResult {
  type: string;
  periodStart: string;
  periodEnd: string;
  branches: Array<{
    branchId: string;
    branchName: string;
    revenue: number;
    cogs: number;
    expenses: number;
    assets: number;
    liabilities: number;
  }>;
  eliminations: Array<{
    description: string;
    amount: number;
  }>;
  consolidated: {
    totalRevenue: number;
    totalCOGS: number;
    totalExpenses: number;
    totalAssets: number;
    totalLiabilities: number;
    eliminationAmount: number;
    netRevenue: number;
    grossProfit: number;
    grossProfitMargin: number;
    netProfit: number;
    netProfitMargin: number;
  };
  suspendedBranches: string[];
}

interface ProductRecord {
  id: string;
  name: string;
  costPrice: number;
  sellingPrice: number;
}

interface BankRecord {
  id: string;
  bankName: string;
  accountNo: string;
  currentBalance: number;
}

// ============================================================
// CONSTANTS & HELPERS
// ============================================================

const AUDIT_MASK = "N/A (Audit Mode)";

const bdFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtCurrency = (v: any): string => {
  if (v === null || v === undefined) return "—";
  return `৳${bdFmt.format(Number(v))}`;
};

const fmtNumber = (v: any): string => {
  if (v === null || v === undefined) return "—";
  return bdFmt.format(Number(v));
};

const fmtDate = (d: string | Date | null | undefined): string => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const fmtEmpty = (v: any): string => {
  if (v === null || v === undefined || v === "") return "—";
  return String(v);
};

const maskIfVat = (v: any, isVatAuditor: boolean): string => {
  if (isVatAuditor) return AUDIT_MASK;
  return fmtCurrency(v);
};

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case "ACTIVE":
    case "Completed":
    case "Approved":
    case "Generated":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800";
    case "SUSPENDED":
    case "Rejected":
    case "Cancelled":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800";
    case "Pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800";
    case "Reviewed":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800";
    default:
      return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200 dark:border-slate-800";
  }
};

const transferStatusColor = (status: string) => {
  switch (status) {
    case "Pending":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200";
    case "Approved":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200";
    case "Rejected":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-200";
    case "Completed":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200";
    case "Cancelled":
      return "bg-slate-100 text-slate-600 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200";
    default:
      return "bg-slate-100 text-slate-800 dark:bg-slate-900/30 dark:text-slate-400 border-slate-200";
  }
};

const statementTypeLabel = (type: string) => {
  switch (type) {
    case "TrialBalance": return "Trial Balance";
    case "ProfitAndLoss": return "Profit & Loss";
    case "BalanceSheet": return "Balance Sheet";
    default: return type;
  }
};

// ============================================================
// COMPONENT
// ============================================================

export default function MultiBranchConsolidationPage({
  userRole,
  userName,
  userEmail,
}: MultiBranchConsolidationPageProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("branches");

  // Auth state
  const [authState, setAuthState] = useState<{ user?: { id?: string; email?: string; role?: string; companyId?: string; name?: string } }>({});

  // Branch Management
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [branchLoading, setBranchLoading] = useState(false);
  const [branchDialogOpen, setBranchDialogOpen] = useState(false);
  const [branchEditMode, setBranchEditMode] = useState(false);
  const [branchForm, setBranchForm] = useState({
    id: "",
    name: "",
    code: "",
    address: "",
    phone: "",
    email: "",
    managerName: "",
    isHeadOffice: false,
    gstNumber: "",
    openingDate: "",
  });
  const [branchSaving, setBranchSaving] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteBranchId, setDeleteBranchId] = useState("");
  const [deleteBranchName, setDeleteBranchName] = useState("");
  const [statusToggleDialog, setStatusToggleDialog] = useState(false);
  const [statusToggleBranch, setStatusToggleBranch] = useState<BranchRecord | null>(null);

  // Inter-Branch Transfers
  const [transfers, setTransfers] = useState<TransferRecord[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [transferForm, setTransferForm] = useState({
    transferType: "STOCK",
    fromBranchId: "",
    toBranchId: "",
    productId: "",
    quantity: 0,
    unitCost: 0,
    fundAmount: 0,
    fromBankId: "",
    toBankId: "",
    notes: "",
    reason: "",
  });
  const [transferSaving, setTransferSaving] = useState(false);
  const [authorizeDialog, setAuthorizeDialog] = useState(false);
  const [authorizeTransferId, setAuthorizeTransferId] = useState("");
  const [authorizeAction, setAuthorizeAction] = useState<"Approved" | "Rejected" | "Completed">("Approved");
  const [authorizeSaving, setAuthorizeSaving] = useState(false);
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [banks, setBanks] = useState<BankRecord[]>([]);

  // Consolidated Statements
  const [statementType, setStatementType] = useState("ProfitAndLoss");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);
  const [consolidationLoading, setConsolidationLoading] = useState(false);
  const [consolidationResult, setConsolidationResult] = useState<ConsolidationResult | null>(null);
  const [consolidationSnapshot, setConsolidationSnapshot] = useState<ConsolidationResult | null>(null);
  const [branchSelectorOpen, setBranchSelectorOpen] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  // Consolidation History
  const [consolidationLogs, setConsolidationLogs] = useState<ConsolidationLogRecord[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logDetailOpen, setLogDetailOpen] = useState(false);
  const [logDetail, setLogDetail] = useState<ConsolidationLogRecord | null>(null);

  // Derived
  const isVatAuditor = userRole === "vat_auditor";
  const isAdmin = userRole === "admin";
  const activeBranches = useMemo(() => branches.filter((b) => b.status === "ACTIVE"), [branches]);

  // ============================================================
  // AUTH INIT & API FETCH
  // ============================================================

  useEffect(() => {
    try {
      const stored = localStorage.getItem("ems_auth");
      if (stored) {
        setAuthState(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  const user = authState.user;

  const apiFetch = useCallback(
    async (path: string, opts?: RequestInit) => {
      const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (user?.email) authHeaders["X-User-Email"] = user.email;
      const res = await fetch(path, {
        headers: { ...authHeaders, ...opts?.headers },
        ...opts,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || "Request failed");
      }
      return res.json();
    },
    [user]
  );

  // ============================================================
  // LOAD COMPANY PROFILE
  // ============================================================

  const loadCompanyProfile = useCallback(async () => {
    try {
      const data = await apiFetch("/api/company-branding");
      setCompanyProfile(data);
    } catch {
      // silent
    }
  }, [apiFetch]);

  useEffect(() => {
    loadCompanyProfile();
  }, [loadCompanyProfile]);

  // ============================================================
  // TAB 1: BRANCH MANAGEMENT
  // ============================================================

  const loadBranches = useCallback(async () => {
    setBranchLoading(true);
    try {
      const data = await apiFetch("/api/branches");
      setBranches(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBranchLoading(false);
    }
  }, [apiFetch, toast]);

  useEffect(() => {
    loadBranches();
  }, [loadBranches]);

  const openCreateBranch = () => {
    setBranchEditMode(false);
    setBranchForm({
      id: "",
      name: "",
      code: "",
      address: "",
      phone: "",
      email: "",
      managerName: "",
      isHeadOffice: false,
      gstNumber: "",
      openingDate: "",
    });
    setBranchDialogOpen(true);
  };

  const openEditBranch = (b: BranchRecord) => {
    setBranchEditMode(true);
    setBranchForm({
      id: b.id,
      name: b.name,
      code: b.code,
      address: b.address || "",
      phone: b.phone || "",
      email: b.email || "",
      managerName: b.managerName || "",
      isHeadOffice: b.isHeadOffice,
      gstNumber: b.gstNumber || "",
      openingDate: b.openingDate ? new Date(b.openingDate).toISOString().split("T")[0] : "",
    });
    setBranchDialogOpen(true);
  };

  const handleSaveBranch = async () => {
    if (!branchForm.name.trim()) {
      toast({ title: "Validation", description: "Branch name is required.", variant: "destructive" });
      return;
    }
    setBranchSaving(true);
    try {
      const payload: Record<string, any> = {
        name: branchForm.name,
        address: branchForm.address || null,
        phone: branchForm.phone || null,
        email: branchForm.email || null,
        managerName: branchForm.managerName || null,
        isHeadOffice: branchForm.isHeadOffice,
        gstNumber: branchForm.gstNumber || null,
        openingDate: branchForm.openingDate || null,
      };

      if (branchEditMode) {
        await apiFetch(`/api/branches/${branchForm.id}`, {
          method: "PUT",
          body: JSON.stringify(payload),
        });
        toast({ title: "Branch Updated", description: `${branchForm.name} has been updated.` });
      } else {
        if (branchForm.code) payload.code = branchForm.code;
        await apiFetch("/api/branches", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        toast({ title: "Branch Created", description: `${branchForm.name} has been created.` });
      }
      setBranchDialogOpen(false);
      loadBranches();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setBranchSaving(false);
    }
  };

  const handleDeleteBranch = async () => {
    if (!isAdmin) {
      toast({ title: "Access Denied", description: "Only administrators can delete branches.", variant: "destructive" });
      return;
    }
    try {
      await apiFetch(`/api/branches/${deleteBranchId}`, { method: "DELETE" });
      toast({ title: "Branch Deleted", description: `${deleteBranchName} has been deleted.` });
      setDeleteDialogOpen(false);
      loadBranches();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const handleStatusToggle = async () => {
    if (!statusToggleBranch) return;
    try {
      const newStatus = statusToggleBranch.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE";
      await apiFetch(`/api/branches/${statusToggleBranch.id}`, {
        method: "PUT",
        body: JSON.stringify({ status: newStatus }),
      });
      toast({
        title: newStatus === "SUSPENDED" ? "Branch Suspended" : "Branch Activated",
        description: `${statusToggleBranch.name} is now ${newStatus}.`,
      });
      setStatusToggleDialog(false);
      setStatusToggleBranch(null);
      loadBranches();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  // ============================================================
  // TAB 2: INTER-BRANCH TRANSFERS
  // ============================================================

  const loadTransfers = useCallback(async () => {
    setTransferLoading(true);
    try {
      const data = await apiFetch("/api/branches/transfer");
      setTransfers(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTransferLoading(false);
    }
  }, [apiFetch, toast]);

  const loadProducts = useCallback(async () => {
    try {
      const data = await apiFetch("/api/products");
      setProducts(Array.isArray(data) ? data : []);
    } catch {
      // silent
    }
  }, [apiFetch]);

  const loadBanks = useCallback(async () => {
    try {
      const data = await apiFetch("/api/banks");
      setBanks(Array.isArray(data) ? data : []);
    } catch {
      // silent
    }
  }, [apiFetch]);

  useEffect(() => {
    loadTransfers();
    loadProducts();
    loadBanks();
  }, [loadTransfers, loadProducts, loadBanks]);

  const openCreateTransfer = () => {
    setTransferForm({
      transferType: "STOCK",
      fromBranchId: "",
      toBranchId: "",
      productId: "",
      quantity: 0,
      unitCost: 0,
      fundAmount: 0,
      fromBankId: "",
      toBankId: "",
      notes: "",
      reason: "",
    });
    setTransferDialogOpen(true);
  };

  const handleProductChange = (productId: string) => {
    const product = products.find((p) => p.id === productId);
    setTransferForm((prev) => ({
      ...prev,
      productId,
      unitCost: product?.costPrice || 0,
    }));
  };

  const handleSaveTransfer = async () => {
    if (!transferForm.fromBranchId || !transferForm.toBranchId) {
      toast({ title: "Validation", description: "Select source and destination branches.", variant: "destructive" });
      return;
    }
    if (transferForm.fromBranchId === transferForm.toBranchId) {
      toast({ title: "Validation", description: "Source and destination cannot be the same.", variant: "destructive" });
      return;
    }
    if (transferForm.transferType === "STOCK" && !transferForm.productId) {
      toast({ title: "Validation", description: "Select a product for STOCK transfer.", variant: "destructive" });
      return;
    }
    if (transferForm.transferType === "STOCK" && transferForm.quantity <= 0) {
      toast({ title: "Validation", description: "Quantity must be greater than 0.", variant: "destructive" });
      return;
    }
    if (transferForm.transferType === "FUND" && transferForm.fundAmount <= 0) {
      toast({ title: "Validation", description: "Fund amount must be greater than 0.", variant: "destructive" });
      return;
    }

    setTransferSaving(true);
    try {
      const payload: Record<string, any> = {
        fromBranchId: transferForm.fromBranchId,
        toBranchId: transferForm.toBranchId,
        transferType: transferForm.transferType,
        notes: transferForm.notes || null,
        reason: transferForm.reason || null,
      };

      if (transferForm.transferType === "STOCK") {
        payload.productId = transferForm.productId;
        payload.quantity = transferForm.quantity;
        payload.unitCost = transferForm.unitCost;
      } else {
        payload.fundAmount = transferForm.fundAmount;
        payload.fromBankId = transferForm.fromBankId || null;
        payload.toBankId = transferForm.toBankId || null;
      }

      await apiFetch("/api/branches/transfer", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      toast({ title: "Transfer Created", description: "Inter-branch transfer has been initiated." });
      setTransferDialogOpen(false);
      loadTransfers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setTransferSaving(false);
    }
  };

  const openAuthorizeTransfer = (transferId: string, action: "Approved" | "Rejected" | "Completed") => {
    setAuthorizeTransferId(transferId);
    setAuthorizeAction(action);
    setAuthorizeDialog(true);
  };

  const handleAuthorizeTransfer = async () => {
    setAuthorizeSaving(true);
    try {
      await apiFetch(`/api/branches/transfer/${authorizeTransferId}`, {
        method: "PUT",
        body: JSON.stringify({ status: authorizeAction }),
      });
      toast({
        title: "Transfer Authorized",
        description: `Transfer has been ${authorizeAction.toLowerCase()}.`,
      });
      setAuthorizeDialog(false);
      loadTransfers();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAuthorizeSaving(false);
    }
  };

  // ============================================================
  // TAB 3: CONSOLIDATED STATEMENTS
  // ============================================================

  const toggleBranchSelection = (branchId: string) => {
    setSelectedBranchIds((prev) =>
      prev.includes(branchId)
        ? prev.filter((id) => id !== branchId)
        : [...prev, branchId]
    );
  };

  const selectAllBranches = () => {
    const activeIds = activeBranches.map((b) => b.id);
    setSelectedBranchIds(
      selectedBranchIds.length === activeIds.length ? [] : activeIds
    );
  };

  const handleGenerateConsolidation = async () => {
    if (!startDate || !endDate) {
      toast({ title: "Validation", description: "Select a date range.", variant: "destructive" });
      return;
    }
    if (selectedBranchIds.length === 0) {
      toast({ title: "Validation", description: "Select at least one branch.", variant: "destructive" });
      return;
    }

    setConsolidationLoading(true);
    try {
      const params = new URLSearchParams({
        type: statementType,
        startDate,
        endDate,
        branchIds: selectedBranchIds.join(","),
      });
      const data = await apiFetch(`/api/consolidation/statements?${params.toString()}`);
      setConsolidationResult(data);
      setConsolidationSnapshot(data); // Store snapshot for resilience

      // Save consolidation log
      try {
        await apiFetch("/api/consolidation/statements", {
          method: "POST",
          body: JSON.stringify({
            statementType,
            periodStart: startDate,
            periodEnd: endDate,
            branchIds: selectedBranchIds,
            totalRevenue: data.consolidated.totalRevenue,
            totalCOGS: data.consolidated.totalCOGS,
            totalExpenses: data.consolidated.totalExpenses,
            totalAssets: data.consolidated.totalAssets,
            totalLiabilities: data.consolidated.totalLiabilities,
            eliminationAmount: data.consolidated.eliminationAmount,
            eliminationCount: data.eliminations?.length || 0,
            eliminationDetails: data.eliminations || [],
          }),
        });
      } catch {
        // Log save failure is non-critical
      }

      toast({ title: "Consolidation Complete", description: "Consolidated holding statements generated successfully." });
    } catch (err: any) {
      // Restore from snapshot on failure/timeout
      if (consolidationSnapshot) {
        setConsolidationResult(consolidationSnapshot);
        toast({ title: "API Timeout — Snapshot Restored", description: "Restored last successful consolidation from snapshot.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      }
    } finally {
      setConsolidationLoading(false);
    }
  };

  const handleExportPDF = async () => {
    if (!consolidationResult) return;
    setExportLoading(true);
    try {
      let profile = companyProfile;
      if (!profile) {
        try {
          profile = await apiFetch("/api/company-branding");
        } catch {
          profile = { name: "VoltERP" };
        }
      }

      const columns: ColumnDef[] = [
        { key: "branchName", label: "Branch", type: "text" },
        { key: "revenue", label: "Revenue", type: "currency" },
        { key: "cogs", label: "COGS", type: "currency" },
        { key: "expenses", label: "Expenses", type: "currency" },
        { key: "assets", label: "Assets", type: "currency" },
        { key: "liabilities", label: "Liabilities", type: "currency" },
      ];

      const data = consolidationResult.branches.map((b) => ({
        branchName: b.branchName,
        revenue: b.revenue,
        cogs: b.cogs,
        expenses: b.expenses,
        assets: b.assets,
        liabilities: b.liabilities,
      }));

      // Add consolidated total row
      data.push({
        branchName: "CONSOLIDATED TOTAL",
        revenue: consolidationResult.consolidated.totalRevenue,
        cogs: consolidationResult.consolidated.totalCOGS,
        expenses: consolidationResult.consolidated.totalExpenses,
        assets: consolidationResult.consolidated.totalAssets,
        liabilities: consolidationResult.consolidated.totalLiabilities,
      });

      exportToPDF({
        title: `Consolidated ${statementTypeLabel(statementType)}`,
        subtitle: `${fmtDate(startDate)} — ${fmtDate(endDate)}`,
        orientation: "landscape",
        columns,
        data,
        isVatAuditor,
        vatMaskedColumns: ["revenue", "cogs", "expenses", "assets", "liabilities"],
        filename: `consolidated-${statementType.toLowerCase()}-${startDate}-${endDate}`,
        company: profile || undefined,
        financialFooter: {
          preparedBy: userName || "System",
          checkedBy: "",
          authorizedBy: "",
          printedBy: userName || "System",
        },
      });

      toast({ title: "PDF Exported", description: "Corporate performance report has been downloaded." });
    } catch (err: any) {
      toast({ title: "Export Error", description: err.message, variant: "destructive" });
    } finally {
      setExportLoading(false);
    }
  };

  // ── Export CSV ──
  const handleExportCSV = () => {
    try {
      const columns: ColumnDef[] = [
        { key: "name", label: "Branch Name", type: "text" },
        { key: "code", label: "Branch Code", type: "text" },
        { key: "status", label: "Status", type: "text" },
        { key: "totalRevenue", label: "Revenue", type: "currency" },
        { key: "totalExpense", label: "Expense", type: "currency" },
        { key: "netProfit", label: "Net Profit", type: "currency" },
      ];
      exportToCSV({ title: "Branch Consolidation", columns, data: branches, filename: "branch-consolidation" });
      toast({ title: "Exported", description: "Branch Consolidation exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // ── Import CSV (validation-only) ──
  const handleImportCSV = async () => {
    try {
      const result = await importFromCSV({
        apiPath: "/api/branches?import=true",
        formFields: [
          { key: "name", label: "Branch Name", type: "text", required: true },
          { key: "code", label: "Branch Code", type: "text", required: true },
          { key: "address", label: "Address", type: "text" },
          { key: "contactPhone", label: "Contact Phone", type: "text" },
        ],
      });
      if (result.imported > 0) {
        toast({ title: "Import Complete", description: `${result.imported} branches imported, ${result.failed} failed` });
        loadBranches();
      } else if (result.errors.length > 0) {
        toast({ title: "Import Failed", description: result.errors[0], variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    }
  };

  // ============================================================
  // TAB 4: CONSOLIDATION HISTORY
  // ============================================================

  const loadConsolidationLogs = useCallback(async () => {
    setLogLoading(true);
    try {
      const data = await apiFetch("/api/consolidation/logs");
      setConsolidationLogs(Array.isArray(data) ? data : []);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setLogLoading(false);
    }
  }, [apiFetch, toast]);

  useEffect(() => {
    loadConsolidationLogs();
  }, [loadConsolidationLogs]);

  const openLogDetail = (log: ConsolidationLogRecord) => {
    setLogDetail(log);
    setLogDetailOpen(true);
  };

  // ============================================================
  // SUSPENDED BRANCH WARNING
  // ============================================================

  const suspendedBranchNames = useMemo(() => {
    if (!consolidationResult) return [];
    return branches
      .filter((b) => consolidationResult.suspendedBranches?.includes(b.id))
      .map((b) => b.name);
  }, [consolidationResult, branches]);

  // ============================================================
  // RENDER
  // ============================================================

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0a1628] to-[#1e3a5f] rounded-xl p-6 shadow-lg">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-white/10 rounded-lg">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Multi-Branch Consolidation</h1>
                <p className="text-slate-300 text-sm mt-0.5">
                  Holding-Level Branch Management, Inter-Branch Transfers & Financial Aggregation
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isVatAuditor && (
                <Badge className="bg-amber-500 text-white border-amber-600 px-3 py-1 text-xs font-semibold">
                  <ShieldCheck className="h-3.5 w-3.5 mr-1" />
                  VAT AUDIT MODE — Financial Amounts Masked
                </Badge>
              )}
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 px-3 py-1 text-xs">
                {userName || userEmail}
              </Badge>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 h-12 bg-slate-100 dark:bg-slate-800 p-1">
            <TabsTrigger value="branches" className="flex items-center gap-2 text-xs sm:text-sm">
              <Building2 className="h-4 w-4" />
              <span className="hidden sm:inline">Branch Management</span>
              <span className="sm:hidden">Branches</span>
            </TabsTrigger>
            <TabsTrigger value="transfers" className="flex items-center gap-2 text-xs sm:text-sm">
              <ArrowLeftRight className="h-4 w-4" />
              <span className="hidden sm:inline">Inter-Branch Transfers</span>
              <span className="sm:hidden">Transfers</span>
            </TabsTrigger>
            <TabsTrigger value="statements" className="flex items-center gap-2 text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Consolidated Statements</span>
              <span className="sm:hidden">Statements</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2 text-xs sm:text-sm">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Consolidation History</span>
              <span className="sm:hidden">History</span>
            </TabsTrigger>
          </TabsList>

          {/* ============================================================ */}
          {/* TAB 1: BRANCH MANAGEMENT */}
          {/* ============================================================ */}
          <TabsContent value="branches" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Branch Directory</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Manage all branches under your holding company
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadBranches} disabled={branchLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${branchLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={openCreateBranch}>
                  <Plus className="h-4 w-4 mr-1" />
                  Create Branch
                </Button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-slate-500" />
                    <span className="text-xs text-slate-500">Total Branches</span>
                  </div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
                    {branches.length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-slate-500">Active</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600 mt-1">
                    {branches.filter((b) => b.status === "ACTIVE").length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-xs text-slate-500">Suspended</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600 mt-1">
                    {branches.filter((b) => b.status === "SUSPENDED").length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-slate-500">Head Office</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    {branches.filter((b) => b.isHeadOffice).length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Branch Table */}
            <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
              <CardContent className="p-0">
                <ScrollArea className="max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <TableHead className="text-xs font-semibold">Code</TableHead>
                        <TableHead className="text-xs font-semibold">Name</TableHead>
                        <TableHead className="text-xs font-semibold hidden md:table-cell">Address</TableHead>
                        <TableHead className="text-xs font-semibold hidden lg:table-cell">Phone</TableHead>
                        <TableHead className="text-xs font-semibold hidden lg:table-cell">Manager</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold hidden sm:table-cell">Head Office</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {branchLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                            Loading branches...
                          </TableCell>
                        </TableRow>
                      ) : branches.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                            No branches found. Create your first branch.
                          </TableCell>
                        </TableRow>
                      ) : (
                        branches.map((b) => (
                          <TableRow key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <TableCell className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                              {b.code}
                            </TableCell>
                            <TableCell className="font-medium text-slate-900 dark:text-white">
                              {b.name}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 hidden md:table-cell">
                              {fmtEmpty(b.address)}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 hidden lg:table-cell">
                              {fmtEmpty(b.phone)}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 hidden lg:table-cell">
                              {fmtEmpty(b.managerName)}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] px-2 py-0.5 border ${statusBadgeVariant(b.status)}`}>
                                {b.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {b.isHeadOffice ? (
                                <Badge className="text-[10px] px-2 py-0.5 border bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800">
                                  HEAD OFFICE
                                </Badge>
                              ) : (
                                <span className="text-xs text-slate-400">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => openEditBranch(b)}
                                    >
                                      <Edit className="h-3.5 w-3.5 text-slate-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Edit Branch</TooltipContent>
                                </Tooltip>

                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => {
                                        setStatusToggleBranch(b);
                                        setStatusToggleDialog(true);
                                      }}
                                    >
                                      {b.status === "ACTIVE" ? (
                                        <XCircle className="h-3.5 w-3.5 text-amber-500" />
                                      ) : (
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                                      )}
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {b.status === "ACTIVE" ? "Suspend Branch" : "Activate Branch"}
                                  </TooltipContent>
                                </Tooltip>

                                {isAdmin && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => {
                                          setDeleteBranchId(b.id);
                                          setDeleteBranchName(b.name);
                                          setDeleteDialogOpen(true);
                                        }}
                                      >
                                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Delete Branch</TooltipContent>
                                  </Tooltip>
                                )}

                                {!isAdmin && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" disabled>
                                          <Trash2 className="h-3.5 w-3.5 text-slate-300" />
                                        </Button>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>Only administrators can delete branches</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================ */}
          {/* TAB 2: INTER-BRANCH TRANSFERS */}
          {/* ============================================================ */}
          <TabsContent value="transfers" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Inter-Branch Transfers</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Manage stock and fund transfers between branches
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={loadTransfers} disabled={transferLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${transferLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button size="sm" onClick={openCreateTransfer}>
                  <Plus className="h-4 w-4 mr-1" />
                  New Transfer
                </Button>
              </div>
            </div>

            {/* Transfer Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <ArrowLeftRight className="h-4 w-4 text-slate-500" />
                    <span className="text-xs text-slate-500">Total</span>
                  </div>
                  <p className="text-xl font-bold text-slate-900 dark:text-white mt-1">{transfers.length}</p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-xs text-slate-500">Pending</span>
                  </div>
                  <p className="text-xl font-bold text-amber-600 mt-1">
                    {transfers.filter((t) => t.status === "Pending").length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    <span className="text-xs text-slate-500">Approved</span>
                  </div>
                  <p className="text-xl font-bold text-emerald-600 mt-1">
                    {transfers.filter((t) => t.status === "Approved").length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <Package className="h-4 w-4 text-blue-500" />
                    <span className="text-xs text-slate-500">Stock</span>
                  </div>
                  <p className="text-xl font-bold text-blue-600 mt-1">
                    {transfers.filter((t) => t.transferType === "STOCK").length}
                  </p>
                </CardContent>
              </Card>
              <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-purple-500" />
                    <span className="text-xs text-slate-500">Fund</span>
                  </div>
                  <p className="text-xl font-bold text-purple-600 mt-1">
                    {transfers.filter((t) => t.transferType === "FUND").length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Transfer Table */}
            <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
              <CardContent className="p-0">
                <ScrollArea className="max-h-[480px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <TableHead className="text-xs font-semibold">Transfer No</TableHead>
                        <TableHead className="text-xs font-semibold hidden sm:table-cell">From</TableHead>
                        <TableHead className="text-xs font-semibold hidden sm:table-cell">To</TableHead>
                        <TableHead className="text-xs font-semibold">Type</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Amount/Value</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold hidden lg:table-cell">Date</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transferLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                            Loading transfers...
                          </TableCell>
                        </TableRow>
                      ) : transfers.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-slate-400">
                            No inter-branch transfers found.
                          </TableCell>
                        </TableRow>
                      ) : (
                        transfers.map((t) => (
                          <TableRow key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <TableCell className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                              {t.transferNo}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                              {t.fromBranch?.name || "—"}
                            </TableCell>
                            <TableCell className="text-xs text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                              {t.toBranch?.name || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] px-2 py-0.5 border ${
                                t.transferType === "STOCK"
                                  ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200"
                                  : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200"
                              }`}>
                                {t.transferType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium">
                              {isVatAuditor
                                ? AUDIT_MASK
                                : t.transferType === "STOCK"
                                  ? fmtCurrency(t.totalValue)
                                  : fmtCurrency(t.fundAmount)}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] px-2 py-0.5 border ${transferStatusColor(t.status)}`}>
                                {t.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 hidden lg:table-cell">
                              {fmtDate(t.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              {t.status === "Pending" && isAdmin && (
                                <div className="flex items-center justify-end gap-1">
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => openAuthorizeTransfer(t.id, "Approved")}
                                      >
                                        <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Approve Transfer</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => openAuthorizeTransfer(t.id, "Completed")}
                                      >
                                        <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Complete Transfer</TooltipContent>
                                  </Tooltip>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 w-7 p-0"
                                        onClick={() => openAuthorizeTransfer(t.id, "Rejected")}
                                      >
                                        <XCircle className="h-3.5 w-3.5 text-red-500" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Reject Transfer</TooltipContent>
                                  </Tooltip>
                                </div>
                              )}
                              {t.status === "Approved" && isAdmin && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0"
                                      onClick={() => openAuthorizeTransfer(t.id, "Completed")}
                                    >
                                      <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Complete Transfer</TooltipContent>
                                </Tooltip>
                              )}
                              {!isAdmin && t.status === "Pending" && (
                                <span className="text-[10px] text-slate-400">Awaiting Auth</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============================================================ */}
          {/* TAB 3: CONSOLIDATED STATEMENTS */}
          {/* ============================================================ */}
          <TabsContent value="statements" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Consolidated Holding Statements</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Generate holding-level financial aggregation with inter-branch elimination
                </p>
              </div>
            </div>

            {/* Statement Parameters */}
            <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Statement Parameters</CardTitle>
                <CardDescription className="text-xs">Configure the consolidation parameters</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Statement Type</Label>
                    <Select value={statementType} onValueChange={setStatementType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="TrialBalance">Trial Balance</SelectItem>
                        <SelectItem value="ProfitAndLoss">Profit & Loss</SelectItem>
                        <SelectItem value="BalanceSheet">Balance Sheet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Start Date</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">End Date</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </div>

                {/* Branch Multi-Select */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">
                      Branches to Include ({selectedBranchIds.length} selected)
                    </Label>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={selectAllBranches}
                    >
                      {selectedBranchIds.length === activeBranches.length ? "Deselect All" : "Select All"}
                    </Button>
                  </div>
                  <div className="border rounded-lg p-3 bg-slate-50 dark:bg-slate-700/30">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      {activeBranches.map((b) => (
                        <label
                          key={b.id}
                          className={`flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all text-xs border ${
                            selectedBranchIds.includes(b.id)
                              ? "bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-300"
                              : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-slate-300"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedBranchIds.includes(b.id)}
                            onChange={() => toggleBranchSelection(b.id)}
                            className="rounded border-slate-300"
                          />
                          <span className="truncate">{b.name}</span>
                          {b.isHeadOffice && (
                            <Badge className="text-[8px] px-1 py-0 bg-blue-100 text-blue-700 border-blue-200">
                              HO
                            </Badge>
                          )}
                        </label>
                      ))}
                      {activeBranches.length === 0 && (
                        <p className="text-xs text-slate-400 col-span-4 text-center py-4">
                          No active branches available
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Button
                    onClick={handleGenerateConsolidation}
                    disabled={consolidationLoading || !startDate || !endDate || selectedBranchIds.length === 0}
                    className="bg-gradient-to-r from-[#0a1628] to-[#1e3a5f] text-white"
                  >
                    {consolidationLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Eliminating Intra-Holding Balances & Consolidating Multi-Branch Ledger Matrices...
                      </>
                    ) : (
                      <>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Generate Consolidated Holding Statements
                      </>
                    )}
                  </Button>

                  {consolidationResult && (
                    <>
                      <Button
                        variant="outline"
                        onClick={handleExportPDF}
                        disabled={exportLoading}
                      >
                        {exportLoading ? (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-2" />
                        )}
                        Export PDF
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleExportCSV}
                      >
                        <FileDown className="h-4 w-4 mr-2" />
                        Export CSV
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleImportCSV}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        Import CSV
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Consolidation Result */}
            {consolidationResult && (
              <div className="space-y-4">
                {/* Suspended Branch Warning */}
                {suspendedBranchNames.length > 0 && (
                  <Card className="border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="font-semibold text-amber-800 dark:text-amber-300 text-sm">
                            Suspended Branch Exclusion Warning
                          </h3>
                          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                            The following branches are <strong>SUSPENDED</strong> and have been excluded from consolidation:{" "}
                            <strong>{suspendedBranchNames.join(", ")}</strong>. Their financial data is not included in the consolidated totals.
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Branch Metrics Matrix */}
                <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <TrendingUp className="h-4 w-4 text-blue-500" />
                      Branch Metrics Matrix
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {statementTypeLabel(consolidationResult.type)} · {fmtDate(consolidationResult.periodStart)} — {fmtDate(consolidationResult.periodEnd)}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <ScrollArea className="max-h-96">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                            <TableHead className="text-xs font-semibold">Branch</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Revenue</TableHead>
                            <TableHead className="text-xs font-semibold text-right">COGS</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Expenses</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Assets</TableHead>
                            <TableHead className="text-xs font-semibold text-right">Liabilities</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {consolidationResult.branches.map((b) => (
                            <TableRow key={b.branchId} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                              <TableCell className="font-medium text-slate-900 dark:text-white text-xs">
                                {b.branchName}
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium">
                                {maskIfVat(b.revenue, isVatAuditor)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium">
                                {maskIfVat(b.cogs, isVatAuditor)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium">
                                {maskIfVat(b.expenses, isVatAuditor)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium">
                                {maskIfVat(b.assets, isVatAuditor)}
                              </TableCell>
                              <TableCell className="text-right text-xs font-medium">
                                {maskIfVat(b.liabilities, isVatAuditor)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {/* Consolidated Total Row */}
                          <TableRow className="bg-gradient-to-r from-[#0a1628] to-[#1e3a5f] hover:from-[#0a1628] hover:to-[#1e3a5f]">
                            <TableCell className="font-bold text-white text-xs">
                              CONSOLIDATED (After Elimination)
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-white">
                              {maskIfVat(consolidationResult.consolidated.netRevenue, isVatAuditor)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-white">
                              {maskIfVat(consolidationResult.consolidated.totalCOGS, isVatAuditor)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-white">
                              {maskIfVat(consolidationResult.consolidated.totalExpenses, isVatAuditor)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-white">
                              {maskIfVat(consolidationResult.consolidated.totalAssets, isVatAuditor)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-bold text-white">
                              {maskIfVat(consolidationResult.consolidated.totalLiabilities, isVatAuditor)}
                            </TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </CardContent>
                </Card>

                {/* Elimination Log */}
                {consolidationResult.eliminations && consolidationResult.eliminations.length > 0 && (
                  <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm font-semibold flex items-center gap-2">
                        <ArrowLeftRight className="h-4 w-4 text-amber-500" />
                        Inter-Branch Elimination Log
                      </CardTitle>
                      <CardDescription className="text-xs">
                        {consolidationResult.eliminations.length} elimination entries applied
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                      <ScrollArea className="max-h-48">
                        <Table>
                          <TableHeader>
                            <TableRow className="bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                              <TableHead className="text-xs font-semibold">#</TableHead>
                              <TableHead className="text-xs font-semibold">Description</TableHead>
                              <TableHead className="text-xs font-semibold text-right">Elimination Amount</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {consolidationResult.eliminations.map((e, i) => (
                              <TableRow key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                                <TableCell className="text-xs text-slate-500">{i + 1}</TableCell>
                                <TableCell className="text-xs text-slate-700 dark:text-slate-300">{e.description}</TableCell>
                                <TableCell className="text-right text-xs font-medium text-red-600 dark:text-red-400">
                                  {maskIfVat(e.amount, isVatAuditor)}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                )}

                {/* Consolidated Total Card */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs text-slate-500">Gross Profit Margin</span>
                      </div>
                      <p className="text-xl font-bold text-emerald-600 mt-1">
                        {isVatAuditor ? AUDIT_MASK : `${consolidationResult.consolidated.grossProfitMargin.toFixed(2)}%`}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-blue-500" />
                        <span className="text-xs text-slate-500">Net Profit Margin</span>
                      </div>
                      <p className="text-xl font-bold text-blue-600 mt-1">
                        {isVatAuditor ? AUDIT_MASK : `${consolidationResult.consolidated.netProfitMargin.toFixed(2)}%`}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                        <span className="text-xs text-slate-500">Gross Profit</span>
                      </div>
                      <p className="text-xl font-bold text-emerald-600 mt-1">
                        {maskIfVat(consolidationResult.consolidated.grossProfit, isVatAuditor)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-blue-500" />
                        <span className="text-xs text-slate-500">Net Profit</span>
                      </div>
                      <p className="text-xl font-bold text-blue-600 mt-1">
                        {maskIfVat(consolidationResult.consolidated.netProfit, isVatAuditor)}
                      </p>
                    </CardContent>
                  </Card>
                </div>

                {/* Detailed Totals */}
                <Card className="bg-gradient-to-r from-[#0a1628] to-[#1e3a5f] border-0 shadow-lg">
                  <CardContent className="p-6">
                    <h3 className="text-white font-semibold mb-4 text-sm">Consolidated Financial Summary</h3>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                      <div>
                        <p className="text-slate-300 text-xs">Total Revenue</p>
                        <p className="text-white font-bold text-lg">{maskIfVat(consolidationResult.consolidated.totalRevenue, isVatAuditor)}</p>
                      </div>
                      <div>
                        <p className="text-slate-300 text-xs">Total COGS</p>
                        <p className="text-white font-bold text-lg">{maskIfVat(consolidationResult.consolidated.totalCOGS, isVatAuditor)}</p>
                      </div>
                      <div>
                        <p className="text-slate-300 text-xs">Total Expenses</p>
                        <p className="text-white font-bold text-lg">{maskIfVat(consolidationResult.consolidated.totalExpenses, isVatAuditor)}</p>
                      </div>
                      <div>
                        <p className="text-slate-300 text-xs">Total Assets</p>
                        <p className="text-white font-bold text-lg">{maskIfVat(consolidationResult.consolidated.totalAssets, isVatAuditor)}</p>
                      </div>
                      <div>
                        <p className="text-slate-300 text-xs">Total Liabilities</p>
                        <p className="text-white font-bold text-lg">{maskIfVat(consolidationResult.consolidated.totalLiabilities, isVatAuditor)}</p>
                      </div>
                    </div>
                    <Separator className="my-4 bg-white/20" />
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div>
                        <p className="text-slate-300 text-xs">Elimination Amount</p>
                        <p className="text-amber-400 font-bold text-lg">
                          ({maskIfVat(consolidationResult.consolidated.eliminationAmount, isVatAuditor).replace("৳", "৳-")})
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-300 text-xs">Net Revenue (After Elimination)</p>
                        <p className="text-emerald-400 font-bold text-lg">{maskIfVat(consolidationResult.consolidated.netRevenue, isVatAuditor)}</p>
                      </div>
                      <div>
                        <p className="text-slate-300 text-xs">Gross Profit Margin</p>
                        <p className="text-emerald-400 font-bold text-lg">
                          {isVatAuditor ? AUDIT_MASK : `${consolidationResult.consolidated.grossProfitMargin.toFixed(2)}%`}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* ============================================================ */}
          {/* TAB 4: CONSOLIDATION HISTORY */}
          {/* ============================================================ */}
          <TabsContent value="history" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Consolidation History</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  View all previously generated consolidated statements
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={loadConsolidationLogs} disabled={logLoading}>
                <RefreshCw className={`h-4 w-4 mr-1 ${logLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>

            <Card className="bg-white dark:bg-slate-800 border-0 shadow-sm">
              <CardContent className="p-0">
                <ScrollArea className="max-h-[520px]">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <TableHead className="text-xs font-semibold">Consolidation No</TableHead>
                        <TableHead className="text-xs font-semibold">Statement Type</TableHead>
                        <TableHead className="text-xs font-semibold hidden md:table-cell">Period</TableHead>
                        <TableHead className="text-xs font-semibold hidden lg:table-cell">Branches</TableHead>
                        <TableHead className="text-xs font-semibold text-right hidden sm:table-cell">Total Revenue</TableHead>
                        <TableHead className="text-xs font-semibold text-right hidden md:table-cell">Elimination Amt</TableHead>
                        <TableHead className="text-xs font-semibold">Status</TableHead>
                        <TableHead className="text-xs font-semibold hidden lg:table-cell">Generated By</TableHead>
                        <TableHead className="text-xs font-semibold hidden xl:table-cell">Date</TableHead>
                        <TableHead className="text-xs font-semibold text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logLoading ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-slate-400">
                            <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />
                            Loading consolidation logs...
                          </TableCell>
                        </TableRow>
                      ) : consolidationLogs.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center py-8 text-slate-400">
                            No consolidation logs found. Generate your first consolidated statement.
                          </TableCell>
                        </TableRow>
                      ) : (
                        consolidationLogs.map((log) => (
                          <TableRow key={log.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition-colors">
                            <TableCell className="font-mono text-xs font-medium text-slate-700 dark:text-slate-300">
                              {log.consolidationNo}
                            </TableCell>
                            <TableCell>
                              <Badge className="text-[10px] px-2 py-0.5 border bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200">
                                {statementTypeLabel(log.statementType)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 hidden md:table-cell">
                              {fmtDate(log.periodStart)} — {fmtDate(log.periodEnd)}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 hidden lg:table-cell">
                              {log.branchNames ? log.branchNames.join(", ") : `${log.branchIds.split(",").length} branches`}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium hidden sm:table-cell">
                              {isVatAuditor ? AUDIT_MASK : fmtCurrency(log.totalRevenue)}
                            </TableCell>
                            <TableCell className="text-right text-xs font-medium text-red-600 dark:text-red-400 hidden md:table-cell">
                              {isVatAuditor ? AUDIT_MASK : fmtCurrency(log.eliminationAmount)}
                            </TableCell>
                            <TableCell>
                              <Badge className={`text-[10px] px-2 py-0.5 border ${statusBadgeVariant(log.status)}`}>
                                {log.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 hidden lg:table-cell">
                              {fmtEmpty(log.generatedByName)}
                            </TableCell>
                            <TableCell className="text-xs text-slate-500 hidden xl:table-cell">
                              {fmtDate(log.createdAt)}
                            </TableCell>
                            <TableCell className="text-right">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => openLogDetail(log)}
                                  >
                                    <Eye className="h-3.5 w-3.5 text-slate-500" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View Details</TooltipContent>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ============================================================ */}
        {/* DIALOGS */}
        {/* ============================================================ */}

        {/* Create/Edit Branch Dialog */}
        <Dialog open={branchDialogOpen} onOpenChange={setBranchDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>{branchEditMode ? "Edit Branch" : "Create Branch"}</DialogTitle>
              <DialogDescription>
                {branchEditMode ? "Update branch details" : "Add a new branch to the holding company"}
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-xs font-medium">
                      Branch Name <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      value={branchForm.name}
                      onChange={(e) => setBranchForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g., Dhaka Main Branch"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Branch Code</Label>
                    <Input
                      value={branchForm.code}
                      onChange={(e) => setBranchForm((p) => ({ ...p, code: e.target.value }))}
                      placeholder="Auto-generated (BR-00001)"
                      disabled={branchEditMode}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Manager Name</Label>
                    <Input
                      value={branchForm.managerName}
                      onChange={(e) => setBranchForm((p) => ({ ...p, managerName: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-xs font-medium">Address</Label>
                    <Textarea
                      value={branchForm.address}
                      onChange={(e) => setBranchForm((p) => ({ ...p, address: e.target.value }))}
                      placeholder="Branch address"
                      rows={2}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Phone</Label>
                    <Input
                      value={branchForm.phone}
                      onChange={(e) => setBranchForm((p) => ({ ...p, phone: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Email</Label>
                    <Input
                      type="email"
                      value={branchForm.email}
                      onChange={(e) => setBranchForm((p) => ({ ...p, email: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">GST/VAT Number</Label>
                    <Input
                      value={branchForm.gstNumber}
                      onChange={(e) => setBranchForm((p) => ({ ...p, gstNumber: e.target.value }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Opening Date</Label>
                    <Input
                      type="date"
                      value={branchForm.openingDate}
                      onChange={(e) => setBranchForm((p) => ({ ...p, openingDate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={branchForm.isHeadOffice}
                        onChange={(e) => setBranchForm((p) => ({ ...p, isHeadOffice: e.target.checked }))}
                        className="rounded border-slate-300"
                      />
                      <span className="text-xs font-medium">This is the Head Office / Main Branch</span>
                    </label>
                  </div>
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setBranchDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveBranch} disabled={branchSaving}>
                {branchSaving && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                {branchEditMode ? "Update Branch" : "Create Branch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Branch Confirmation */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-red-600">
                <AlertTriangle className="h-5 w-5" />
                Delete Branch
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete <strong>{deleteBranchName}</strong>? This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteBranch}>
                <Trash2 className="h-4 w-4 mr-2" />
                Delete Branch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Status Toggle Confirmation */}
        <Dialog open={statusToggleDialog} onOpenChange={setStatusToggleDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {statusToggleBranch?.status === "ACTIVE" ? (
                  <>
                    <AlertTriangle className="h-5 w-5 text-amber-500" />
                    Suspend Branch
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 text-emerald-500" />
                    Activate Branch
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {statusToggleBranch?.status === "ACTIVE" ? (
                  <>
                    Are you sure you want to suspend <strong>{statusToggleBranch?.name}</strong>?
                    All pending inter-branch transfers involving this branch will be cancelled.
                    This effectively freezes all cross-branch operations for this location.
                  </>
                ) : (
                  <>
                    Are you sure you want to activate <strong>{statusToggleBranch?.name}</strong>?
                    This will re-enable inter-branch transfers for this branch.
                  </>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStatusToggleDialog(false)}>
                Cancel
              </Button>
              <Button
                variant={statusToggleBranch?.status === "ACTIVE" ? "destructive" : "default"}
                onClick={handleStatusToggle}
              >
                {statusToggleBranch?.status === "ACTIVE" ? "Suspend Branch" : "Activate Branch"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* New Transfer Dialog */}
        <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>New Inter-Branch Transfer</DialogTitle>
              <DialogDescription>
                Create a stock or fund transfer between branches
              </DialogDescription>
            </DialogHeader>
            <ScrollArea className="max-h-[60vh] pr-4">
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label className="text-xs font-medium">Transfer Type</Label>
                    <Select
                      value={transferForm.transferType}
                      onValueChange={(v) => setTransferForm((p) => ({ ...p, transferType: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STOCK">STOCK — Product Transfer</SelectItem>
                        <SelectItem value="FUND">FUND — Cash/Bank Transfer</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">From Branch</Label>
                    <Select
                      value={transferForm.fromBranchId}
                      onValueChange={(v) => setTransferForm((p) => ({ ...p, fromBranchId: v, toBranchId: v === p.toBranchId ? "" : p.toBranchId }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select source branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBranches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name} ({b.code})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">To Branch</Label>
                    <Select
                      value={transferForm.toBranchId}
                      onValueChange={(v) => setTransferForm((p) => ({ ...p, toBranchId: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select destination branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {activeBranches
                          .filter((b) => b.id !== transferForm.fromBranchId)
                          .map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.name} ({b.code})
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Separator />

                {transferForm.transferType === "STOCK" ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2 sm:col-span-3">
                      <Label className="text-xs font-medium">Product</Label>
                      <Select
                        value={transferForm.productId}
                        onValueChange={handleProductChange}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select product" />
                        </SelectTrigger>
                        <SelectContent>
                          <ScrollArea className="max-h-48">
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name} — {fmtCurrency(p.costPrice)}
                              </SelectItem>
                            ))}
                          </ScrollArea>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Quantity</Label>
                      <Input
                        type="number"
                        min="0"
                        step="1"
                        value={transferForm.quantity || ""}
                        onChange={(e) => setTransferForm((p) => ({ ...p, quantity: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Unit Cost (auto-filled)</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={transferForm.unitCost || ""}
                        onChange={(e) => setTransferForm((p) => ({ ...p, unitCost: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Total Value</Label>
                      <Input
                        type="text"
                        value={fmtCurrency(transferForm.quantity * transferForm.unitCost)}
                        disabled
                        className="bg-slate-50 dark:bg-slate-700"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">Fund Amount</Label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={transferForm.fundAmount || ""}
                        onChange={(e) => setTransferForm((p) => ({ ...p, fundAmount: Number(e.target.value) }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">From Bank</Label>
                      <Select
                        value={transferForm.fromBankId}
                        onValueChange={(v) => setTransferForm((p) => ({ ...p, fromBankId: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select source bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {banks.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.bankName} — {b.accountNo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs font-medium">To Bank</Label>
                      <Select
                        value={transferForm.toBankId}
                        onValueChange={(v) => setTransferForm((p) => ({ ...p, toBankId: v }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select destination bank" />
                        </SelectTrigger>
                        <SelectContent>
                          {banks.map((b) => (
                            <SelectItem key={b.id} value={b.id}>
                              {b.bankName} — {b.accountNo}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs font-medium">Notes / Reason</Label>
                  <Textarea
                    value={transferForm.notes}
                    onChange={(e) => setTransferForm((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="Transfer reason or additional notes"
                    rows={3}
                  />
                </div>
              </div>
            </ScrollArea>
            <DialogFooter>
              <Button variant="outline" onClick={() => setTransferDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSaveTransfer} disabled={transferSaving}>
                {transferSaving && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                Create Transfer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Authorize Transfer Dialog */}
        <Dialog open={authorizeDialog} onOpenChange={setAuthorizeDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-500" />
                Authorize Cross-Branch Asset Transfer
              </DialogTitle>
              <DialogDescription>
                {authorizeAction === "Rejected"
                  ? "Are you sure you want to reject this inter-branch transfer? This action cannot be undone."
                  : authorizeAction === "Completed"
                    ? "Are you sure you want to complete this transfer? Stock/balances will be moved between branches."
                    : "Are you sure you want to approve this inter-branch transfer?"}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAuthorizeDialog(false)}>
                Cancel
              </Button>
              <Button
                variant={authorizeAction === "Rejected" ? "destructive" : "default"}
                onClick={handleAuthorizeTransfer}
                disabled={authorizeSaving}
                className={authorizeAction !== "Rejected" ? "bg-gradient-to-r from-[#0a1628] to-[#1e3a5f] text-white" : ""}
              >
                {authorizeSaving ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Eliminating Intra-Holding Balances & Consolidating Multi-Branch Ledger Matrices...
                  </>
                ) : (
                  `${authorizeAction} Transfer`
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Consolidation Log Detail Dialog */}
        <Dialog open={logDetailOpen} onOpenChange={setLogDetailOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Consolidation Log Details
              </DialogTitle>
              <DialogDescription>
                {logDetail?.consolidationNo}
              </DialogDescription>
            </DialogHeader>
            {logDetail && (
              <ScrollArea className="max-h-[60vh]">
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-xs text-slate-500">Consolidation No</Label>
                      <p className="font-mono text-sm font-medium">{logDetail.consolidationNo}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Statement Type</Label>
                      <p className="text-sm font-medium">
                        <Badge className="text-[10px] px-2 py-0.5 border bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200">
                          {statementTypeLabel(logDetail.statementType)}
                        </Badge>
                      </p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Period</Label>
                      <p className="text-sm">{fmtDate(logDetail.periodStart)} — {fmtDate(logDetail.periodEnd)}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Status</Label>
                      <p className="text-sm">
                        <Badge className={`text-[10px] px-2 py-0.5 border ${statusBadgeVariant(logDetail.status)}`}>
                          {logDetail.status}
                        </Badge>
                      </p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs text-slate-500">Branches Included</Label>
                      <p className="text-sm">
                        {logDetail.branchNames ? logDetail.branchNames.join(", ") : `${logDetail.branchIds.split(",").length} branches`}
                      </p>
                    </div>
                  </div>

                  <Separator />

                  <div>
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Financial Summary</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-xs text-slate-500">Total Revenue</p>
                        <p className="text-sm font-bold">{isVatAuditor ? AUDIT_MASK : fmtCurrency(logDetail.totalRevenue)}</p>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-xs text-slate-500">Total COGS</p>
                        <p className="text-sm font-bold">{isVatAuditor ? AUDIT_MASK : fmtCurrency(logDetail.totalCOGS)}</p>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-xs text-slate-500">Total Expenses</p>
                        <p className="text-sm font-bold">{isVatAuditor ? AUDIT_MASK : fmtCurrency(logDetail.totalExpenses)}</p>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-xs text-slate-500">Total Assets</p>
                        <p className="text-sm font-bold">{isVatAuditor ? AUDIT_MASK : fmtCurrency(logDetail.totalAssets)}</p>
                      </div>
                      <div className="p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-xs text-slate-500">Total Liabilities</p>
                        <p className="text-sm font-bold">{isVatAuditor ? AUDIT_MASK : fmtCurrency(logDetail.totalLiabilities)}</p>
                      </div>
                      <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-amber-600">Elimination Amount</p>
                        <p className="text-sm font-bold text-amber-700 dark:text-amber-400">
                          {isVatAuditor ? AUDIT_MASK : fmtCurrency(logDetail.eliminationAmount)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Elimination Details */}
                  {logDetail.eliminationDetails && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                        Elimination Entries ({logDetail.eliminationCount})
                      </h4>
                      <ScrollArea className="max-h-48">
                        <div className="space-y-1">
                          {(() => {
                            try {
                              const details = typeof logDetail.eliminationDetails === "string"
                                ? JSON.parse(logDetail.eliminationDetails)
                                : logDetail.eliminationDetails;
                              if (Array.isArray(details)) {
                                return details.map((entry: any, i: number) => (
                                  <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-slate-50 dark:bg-slate-700/30 rounded text-xs">
                                    <span className="text-slate-600 dark:text-slate-400">
                                      {entry.description || `Entry ${i + 1}`}
                                    </span>
                                    <span className="font-medium text-red-600 dark:text-red-400">
                                      {isVatAuditor ? AUDIT_MASK : fmtCurrency(entry.amount)}
                                    </span>
                                  </div>
                                ));
                              }
                              return <p className="text-xs text-slate-400">No detailed entries available</p>;
                            } catch {
                              return <p className="text-xs text-slate-400">Could not parse elimination details</p>;
                            }
                          })()}
                        </div>
                      </ScrollArea>
                    </div>
                  )}

                  <Separator />

                  <div className="grid grid-cols-2 gap-4 text-xs">
                    <div>
                      <Label className="text-xs text-slate-500">Generated By</Label>
                      <p className="text-sm">{fmtEmpty(logDetail.generatedByName)}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Generated Date</Label>
                      <p className="text-sm">{fmtDate(logDetail.createdAt)}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Reviewed By</Label>
                      <p className="text-sm">{fmtEmpty(logDetail.reviewedBy)}</p>
                    </div>
                    <div>
                      <Label className="text-xs text-slate-500">Approved By</Label>
                      <p className="text-sm">{fmtEmpty(logDetail.approvedBy)}</p>
                    </div>
                  </div>
                </div>
              </ScrollArea>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setLogDetailOpen(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
