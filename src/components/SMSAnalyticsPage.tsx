"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Send, DollarSign, Coins, CheckCircle, Clock, XCircle,
  AlertTriangle, Banknote, Search, RefreshCw, Download,
  Upload, FileDown, Plus, MessageSquare, Settings,
  Phone, FileText, CreditCard, Activity, BarChart3,
  Pencil, Trash2, Shield, Lock, Users, Filter, Zap, Info
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "next-themes";
import {
  exportToPDF,
  exportToCSV,
  importFromCSV,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const bdCurrencyFmt = new Intl.NumberFormat("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtCurrency = (v: any) => {
  const num = Number(v);
  if (isNaN(num) || v === null || v === undefined) return "—";
  return `৳${bdCurrencyFmt.format(num)}`;
};

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (type === "currency") return fmtCurrency(v);
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") {
    const num = Number(v);
    if (isNaN(num)) return "—";
    return bdCurrencyFmt.format(num);
  }
  return String(v);
};

const fmtEmpty = (v: any) => {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
};

const fmtDate = (d: string | Date) => d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";

// SMS Character Bounds Computation (Client-side mirror — GSM 03.38)
const computeClientSmsSegments = (message: string) => {
  const charCount = message.length;
  const isUnicode = /[^\x00-\x7F]/.test(message);
  const charsPerSegment = isUnicode ? 70 : 160;
  const segmentCount = charCount > 0 ? Math.ceil(charCount / charsPerSegment) : 1;
  return { charCount, isUnicode, segmentCount, charsPerSegment };
};

// Directive 1 — Strip trailing spaces/line breaks before sending to API
const sanitizeTextField = (v: string) => v.trim().replace(/[\r\n]+$/g, '');

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

// Directive 4 — Lightweight client-side activity logger for CSV exports
function logCsvExportActivity(moduleToken: string, exportName: string, userDisplayName?: string) {
  try {
    console.log(`[Activity Log] Module: ${moduleToken} | Action: CSV Export | Export: ${exportName} | User: ${userDisplayName || 'Unknown'} | Timestamp: ${new Date().toISOString()}`);
  } catch {}
}

// ============================================================
// AUDIENCE FILTER OPTIONS (Directive 3)
// ============================================================

const ZONE_OPTIONS = [
  "Dhaka North", "Dhaka South", "Chattogram", "Sylhet",
  "Rajshahi", "Khulna", "Barishal", "Rangpur", "Mymensingh"
];

const CUSTOMER_TYPE_OPTIONS = ["Retail", "Wholesale", "Corporate", "Dealer", "All"];

const DUE_BALANCE_RANGE_OPTIONS = ["No Due", "1-1000", "1001-5000", "5001-10000", "10000+", "All"];

// ============================================================
// AUTH TYPES
// ============================================================

type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

// ============================================================
// SMS SNAPSHOT TYPE (Directive 3)
// ============================================================

interface SmsSnapshot {
  recipient: string;
  bulkRecipients: string;
  message: string;
  campaignName: string;
}

// ============================================================
// SMS ANALYTICS PAGE COMPONENT
// ============================================================

export default function SMSAnalyticsPage({ initialTab }: { initialTab?: string } = {}) {
  const { toast } = useToast();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Auth state
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const isVatAuditor = authUser?.role === "vat_auditor";
  const isAdmin = authUser?.role === "admin";
  const isManager = authUser?.role === "manager";
  const isSR = authUser?.role === "sr";
  const isDealer = authUser?.role === "dealer";

  useEffect(() => {
    try {
      const stored = localStorage.getItem("ems_auth");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.user) setAuthUser(parsed.user);
      }
    } catch {}
  }, []);

  // Tab state
  const [activeTab, setActiveTab] = useState(initialTab || "dashboard");

  // Data state
  const [smsLogs, setSmsLogs] = useState<any[]>([]);
  const [smsBills, setSmsBills] = useState<any[]>([]);
  const [smsSettings, setSmsSettings] = useState<any[]>([]);
  const [smsBillPayments, setSmsBillPayments] = useState<any[]>([]);
  const [smsReport, setSmsReport] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & filter state
  const [logSearch, setLogSearch] = useState("");
  const [logStatusFilter, setLogStatusFilter] = useState("all");
  const [billStatusFilter, setBillStatusFilter] = useState("all");

  // Date range for report
  const [reportFrom, setReportFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [reportTo, setReportTo] = useState(() => new Date().toISOString().split("T")[0]);

  // Send SMS form state
  const [sendMode, setSendMode] = useState<"single" | "bulk">("single");
  const [smsRecipient, setSmsRecipient] = useState("");
  const [smsBulkRecipients, setSmsBulkRecipients] = useState("");
  const [smsMessage, setSmsMessage] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [smsSending, setSmsSending] = useState(false);

  // Directive 2 — Gateway Credit Balance
  const [gatewayCreditBalance, setGatewayCreditBalance] = useState<number | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  // Directive 3 — Audience filters for bulk SMS
  const [audienceZone, setAudienceZone] = useState<string>("all");
  const [audienceCustomerType, setAudienceCustomerType] = useState<string>("All");
  const [audienceDueBalance, setAudienceDueBalance] = useState<string>("All");
  const [filteredRecipientCount, setFilteredRecipientCount] = useState<number>(0);

  // Directive 3 — Snapshot for form restore on failure
  const smsSnapshotRef = useRef<SmsSnapshot | null>(null);

  // Directive 3 — Spin-locks for exports
  const [pdfExporting, setPdfExporting] = useState(false);
  const [csvExporting, setCsvExporting] = useState(false);
  const [billPdfExporting, setBillPdfExporting] = useState(false);
  const [billCsvExporting, setBillCsvExporting] = useState(false);
  const [reportPdfExporting, setReportPdfExporting] = useState(false);
  const [settingsPdfExporting, setSettingsPdfExporting] = useState(false);

  // Directive 2 — Campaign Balance Shield
  const [balanceShieldBlocked, setBalanceShieldBlocked] = useState(false);
  const [shieldRequiredCredits, setShieldRequiredCredits] = useState(0);
  const [shieldAvailableCredits, setShieldAvailableCredits] = useState(0);

  // SMS Character Bounds Computation (computed early for balance shield — Directive 2)
  const { charCount, isUnicode, segmentCount, charsPerSegment } = computeClientSmsSegments(smsMessage);

  // SMS Settings form state (Directive 1 — added creditBalanceLimit)
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [settingsEdit, setSettingsEdit] = useState<any>(null);
  const [settingsForm, setSettingsForm] = useState({
    apiUrl: "", apiKey: "", senderId: "", maskingName: "", maskingRegId: "",
    gatewayName: "", ratePerSms: 0.5, unicodeRate: 0.8, setupCost: 0, isActive: true,
    creditBalanceLimit: 0
  });
  const [settingsSaving, setSettingsSaving] = useState(false);

  // Bill Payment dialog state
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [paymentBillId, setPaymentBillId] = useState("");
  const [paymentForm, setPaymentForm] = useState({ amount: 0, date: new Date().toISOString().split("T")[0], method: "Cash", reference: "", notes: "" });
  const [paymentSaving, setPaymentSaving] = useState(false);

  // Bill Create dialog state
  const [billDialog, setBillDialog] = useState(false);
  const [billEdit, setBillEdit] = useState<any>(null);
  const [billForm, setBillForm] = useState({ period: "", totalSms: 0, totalSegments: 0, totalCost: 0, paidAmount: 0, status: "Unpaid" });
  const [billSaving, setBillSaving] = useState(false);

  // Delete confirmation dialog
  const [deleteDialog, setDeleteDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: string; id: string } | null>(null);

  // Get cost per segment from active settings
  const activeSetting = smsSettings.find((s: any) => s.isActive);
  const costPerSegment = activeSetting?.ratePerSms || 0.5;
  const unicodeCostPerSegment = activeSetting?.unicodeRate || 0.8;
  const estimatedCostPerSegment = isUnicode ? unicodeCostPerSegment : costPerSegment;

  // ============================================================
  // DIRECTIVE 2 — FETCH GATEWAY BALANCE
  // ============================================================

  const fetchGatewayBalance = useCallback(async () => {
    setBalanceLoading(true);
    try {
      const res = await apiFetch("/api/sms-gateway/balance").catch(() => null);
      if (res && res.balance !== undefined) {
        setGatewayCreditBalance(Number(res.balance));
      } else if (res && res.data?.balance !== undefined) {
        setGatewayCreditBalance(Number(res.data.balance));
      }
    } catch {
      // Silently fail — balance may not be available from all gateways
    } finally {
      setBalanceLoading(false);
    }
  }, []);

  // ============================================================
  // DATA LOADING
  // ============================================================

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, billsRes, settingsRes, paymentsRes] = await Promise.all([
        apiFetch("/api/sms-logs").catch(() => []),
        apiFetch("/api/sms-bills").catch(() => []),
        apiFetch("/api/sms-settings").catch(() => []),
        apiFetch("/api/sms-bill-payments").catch(() => []),
      ]);
      setSmsLogs(Array.isArray(logsRes) ? logsRes : logsRes?.data || []);
      setSmsBills(Array.isArray(billsRes) ? billsRes : billsRes?.data || []);
      setSmsSettings(Array.isArray(settingsRes) ? settingsRes : settingsRes?.data || []);
      setSmsBillPayments(Array.isArray(paymentsRes) ? paymentsRes : paymentsRes?.data || []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadReport = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/reports?type=sms&from=${reportFrom}&to=${reportTo}`).catch(() => []);
      setSmsReport(Array.isArray(res) ? res : res?.data || []);
    } catch {
      setSmsReport([]);
    }
  }, [reportFrom, reportTo]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadReport(); }, [loadReport]);

  // Directive 2 — Fetch gateway balance on mount
  useEffect(() => { fetchGatewayBalance(); }, [fetchGatewayBalance]);

  // ============================================================
  // DIRECTIVE 3 — COMPUTE FILTERED RECIPIENT COUNT
  // ============================================================

  useEffect(() => {
    if (sendMode !== "bulk") {
      setFilteredRecipientCount(0);
      return;
    }
    const baseCount = smsBulkRecipients.split(",").map(r => r.trim()).filter(Boolean).length;
    // Simulate audience filtering — in production this would query backend
    let count = baseCount;
    if (audienceZone !== "all") {
      // Simulate ~70% of recipients in selected zone
      count = Math.round(count * 0.7);
    }
    if (audienceCustomerType !== "All") {
      // Simulate ~60% of recipients matching customer type
      count = Math.round(count * 0.6);
    }
    if (audienceDueBalance !== "All") {
      if (audienceDueBalance === "No Due") {
        count = Math.round(count * 0.3);
      } else if (audienceDueBalance === "10000+") {
        count = Math.round(count * 0.1);
      } else {
        count = Math.round(count * 0.5);
      }
    }
    setFilteredRecipientCount(count);
  }, [sendMode, smsBulkRecipients, audienceZone, audienceCustomerType, audienceDueBalance]);

  // ============================================================
  // DIRECTIVE 2 — CAMPAIGN BALANCE SHIELD CHECK
  // ============================================================

  useEffect(() => {
    if (gatewayCreditBalance === null || gatewayCreditBalance <= 0) {
      setBalanceShieldBlocked(false);
      return;
    }
    const recipients = sendMode === "single" ? 1 : filteredRecipientCount || smsBulkRecipients.split(",").filter(r => r.trim()).length;
    const rate = isUnicode ? unicodeCostPerSegment : costPerSegment;
    const totalRequired = recipients * segmentCount * rate;
    setShieldRequiredCredits(totalRequired);
    setShieldAvailableCredits(gatewayCreditBalance);
    setBalanceShieldBlocked(totalRequired > gatewayCreditBalance);
  }, [sendMode, smsBulkRecipients, filteredRecipientCount, segmentCount, isUnicode, costPerSegment, unicodeCostPerSegment, gatewayCreditBalance]);

  // SMS Settings: open create dialog
  const openSettingsCreate = () => {
    setSettingsEdit(null);
    setSettingsForm({
      apiUrl: "", apiKey: "", senderId: "", maskingName: "", maskingRegId: "",
      gatewayName: "", ratePerSms: 0.5, unicodeRate: 0.8, setupCost: 0, isActive: true,
      creditBalanceLimit: 0
    });
    setSettingsDialog(true);
  };

  // SMS Settings: open edit dialog (Directive 1 — include creditBalanceLimit)
  const openSettingsEdit = (s: any) => {
    setSettingsEdit(s);
    setSettingsForm({
      apiUrl: s.apiUrl || "",
      apiKey: s.apiKey || "",
      senderId: s.senderId || "",
      maskingName: s.maskingName || "",
      maskingRegId: s.maskingRegId || "",
      gatewayName: s.gatewayName || "",
      ratePerSms: s.ratePerSms ?? 0.5,
      unicodeRate: s.unicodeRate ?? 0.8,
      setupCost: s.setupCost ?? 0,
      isActive: s.isActive ?? true,
      creditBalanceLimit: s.creditBalanceLimit ?? 0,
    });
    setSettingsDialog(true);
  };

  // ============================================================
  // DIRECTIVE 1 — SMS SETTINGS SAVE WITH STRIP + creditBalanceLimit
  // ============================================================

  const saveSettings = async () => {
    // Strip trailing spaces/line breaks on all text fields
    const sanitized = {
      ...settingsForm,
      apiUrl: sanitizeTextField(settingsForm.apiUrl),
      apiKey: sanitizeTextField(settingsForm.apiKey),
      senderId: sanitizeTextField(settingsForm.senderId),
      maskingName: sanitizeTextField(settingsForm.maskingName),
      maskingRegId: sanitizeTextField(settingsForm.maskingRegId),
      gatewayName: sanitizeTextField(settingsForm.gatewayName),
    };

    if (!sanitized.apiUrl || !sanitized.apiKey || !sanitized.senderId) {
      toast({ title: "Validation Error", description: "API URL, API Key, and Sender ID are required", variant: "destructive" });
      return;
    }
    if (!isAdmin) {
      toast({ title: "Access Denied", description: "Only administrators can modify SMS gateway settings", variant: "destructive" });
      return;
    }
    setSettingsSaving(true);
    try {
      if (settingsEdit) {
        await apiFetch(`/api/sms-settings/${settingsEdit.id}`, {
          method: "PUT",
          body: JSON.stringify(sanitized),
        });
        toast({ title: "Settings Updated", description: "SMS configuration updated successfully" });
      } else {
        await apiFetch("/api/sms-settings", {
          method: "POST",
          body: JSON.stringify(sanitized),
        });
        toast({ title: "Settings Created", description: "SMS configuration created successfully" });
      }
      setSettingsDialog(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSettingsSaving(false);
    }
  };

  // SMS Settings: delete handler
  const deleteSettings = async (id: string) => {
    if (!isAdmin) {
      toast({ title: "Access Denied", description: "Only administrators can delete SMS gateway settings", variant: "destructive" });
      return;
    }
    try {
      await apiFetch(`/api/sms-settings/${id}`, { method: "DELETE" });
      toast({ title: "Settings Deleted", description: "SMS configuration deleted" });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Bill: open create dialog
  const openBillCreate = () => {
    setBillEdit(null);
    setBillForm({ period: "", totalSms: 0, totalSegments: 0, totalCost: 0, paidAmount: 0, status: "Unpaid" });
    setBillDialog(true);
  };

  // Bill: open edit dialog
  const openBillEdit = (b: any) => {
    setBillEdit(b);
    setBillForm({
      period: b.period || "",
      totalSms: b.totalSms ?? 0,
      totalSegments: b.totalSegments ?? 0,
      totalCost: b.totalCost ?? 0,
      paidAmount: b.paidAmount ?? 0,
      status: b.status || "Unpaid",
    });
    setBillDialog(true);
  };

  // Bill: save handler
  const saveBill = async () => {
    if (!billForm.period) {
      toast({ title: "Validation Error", description: "Period is required", variant: "destructive" });
      return;
    }
    setBillSaving(true);
    try {
      const outstanding = Number(billForm.totalCost) - Number(billForm.paidAmount);
      const autoStatus = outstanding <= 0 ? "Paid" : Number(billForm.paidAmount) > 0 ? "Partial" : "Unpaid";
      const payload = { ...billForm, outstanding, status: autoStatus };
      if (billEdit) {
        await apiFetch(`/api/sms-bills/${billEdit.id}`, { method: "PUT", body: JSON.stringify(payload) });
        toast({ title: "Bill Updated", description: "SMS bill updated successfully" });
      } else {
        await apiFetch("/api/sms-bills", { method: "POST", body: JSON.stringify(payload) });
        toast({ title: "Bill Created", description: "SMS bill created successfully" });
      }
      setBillDialog(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBillSaving(false);
    }
  };

  // Bill: delete handler
  const deleteBill = async (id: string) => {
    if (!isAdmin) {
      toast({ title: "Access Denied", description: "Only administrators can delete SMS bills", variant: "destructive" });
      return;
    }
    try {
      await apiFetch(`/api/sms-bills/${id}`, { method: "DELETE" });
      toast({ title: "Bill Deleted", description: "SMS bill deleted" });
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Payment: open dialog
  const openPaymentDialog = (billId: string) => {
    setPaymentBillId(billId);
    setPaymentForm({ amount: 0, date: new Date().toISOString().split("T")[0], method: "Cash", reference: "", notes: "" });
    setPaymentDialog(true);
  };

  // Payment: save handler
  const savePayment = async () => {
    if (!paymentForm.amount || paymentForm.amount <= 0) {
      toast({ title: "Validation Error", description: "Payment amount must be greater than 0", variant: "destructive" });
      return;
    }
    setPaymentSaving(true);
    try {
      await apiFetch("/api/sms-bill-payments", {
        method: "POST",
        body: JSON.stringify({
          smsBillId: paymentBillId,
          amount: paymentForm.amount,
          date: paymentForm.date,
          method: paymentForm.method || null,
          reference: paymentForm.reference || null,
          notes: paymentForm.notes || null,
        }),
      });
      toast({ title: "Payment Recorded", description: "SMS bill payment recorded successfully" });
      setPaymentDialog(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPaymentSaving(false);
    }
  };

  // Delete confirmation handler
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "settings") {
        await deleteSettings(deleteTarget.id);
      } else if (deleteTarget.type === "bill") {
        await deleteBill(deleteTarget.id);
      }
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setDeleteDialog(false);
      setDeleteTarget(null);
    }
  };

  // ============================================================
  // COMPUTED KPIs
  // ============================================================

  const totalSent = smsLogs.length;
  const totalCost = smsLogs.reduce((sum: number, log: any) => sum + (Number(log.cost) || 0), 0);
  const avgCostPerSms = totalSent > 0 ? totalCost / totalSent : 0;
  const deliveredCount = smsLogs.filter((l: any) => l.status === "Delivered" || l.status === "delivered").length;
  const pendingCount = smsLogs.filter((l: any) => l.status === "Pending" || l.status === "pending" || l.status === "Queued").length;
  const failedCount = smsLogs.filter((l: any) => l.status === "Failed" || l.status === "failed").length;
  const deliveryRate = totalSent > 0 ? ((deliveredCount / totalSent) * 100) : 0;

  const unpaidBills = smsBills.filter((b: any) => b.status === "Unpaid").length;
  const outstandingAmount = smsBills
    .filter((b: any) => b.status !== "Paid")
    .reduce((sum: number, b: any) => sum + (Number(b.outstanding) || (Number(b.totalCost) || 0) - (Number(b.paidAmount) || 0)), 0);

  // ============================================================
  // FILTERED DATA
  // ============================================================

  const filteredLogs = useMemo(() => {
    let result = smsLogs;
    if (logSearch) {
      const s = logSearch.toLowerCase();
      result = result.filter((log: any) =>
        log.recipient?.toLowerCase().includes(s) ||
        log.message?.toLowerCase().includes(s) ||
        log.status?.toLowerCase().includes(s) ||
        log.campaignName?.toLowerCase().includes(s)
      );
    }
    if (logStatusFilter !== "all") {
      result = result.filter((log: any) => log.status?.toLowerCase() === logStatusFilter.toLowerCase());
    }
    return result;
  }, [smsLogs, logSearch, logStatusFilter]);

  const filteredBills = useMemo(() => {
    if (billStatusFilter === "all") return smsBills;
    return smsBills.filter((b: any) => b.status?.toLowerCase() === billStatusFilter.toLowerCase());
  }, [smsBills, billStatusFilter]);

  // ============================================================
  // CHART DATA
  // ============================================================

  const dailySmsTrend = useMemo(() => {
    const dayMap = new Map<string, { date: string; sent: number; delivered: number; failed: number }>();
    smsLogs.forEach((log: any) => {
      const dateStr = log.sentAt ? new Date(log.sentAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "Unknown";
      const existing = dayMap.get(dateStr) || { date: dateStr, sent: 0, delivered: 0, failed: 0 };
      existing.sent++;
      if (log.status === "Delivered" || log.status === "delivered") existing.delivered++;
      if (log.status === "Failed" || log.status === "failed") existing.failed++;
      dayMap.set(dateStr, existing);
    });
    return Array.from(dayMap.values()).slice(-14);
  }, [smsLogs]);

  const statusBreakdown = useMemo(() => {
    const statusMap = new Map<string, number>();
    smsLogs.forEach((log: any) => {
      const status = log.status || "Unknown";
      statusMap.set(status, (statusMap.get(status) || 0) + 1);
    });
    return Array.from(statusMap.entries()).map(([name, value]) => ({ name, value }));
  }, [smsLogs]);

  const PIE_COLORS = ["#10b981", "#f59e0b", "#ef4444", "#6366f1", "#8b5cf6", "#ec4899"];

  // CHARACTER COUNTER — computed early at state initialization (see line ~229)

  // ============================================================
  // SEND SMS HANDLER (Directive 2 & 3 — Balance Shield + Snapshot + Double-Hit Guard)
  // ============================================================

  const handleSendSms = async () => {
    if (sendMode === "single") {
      if (!smsRecipient.trim()) {
        toast({ title: "Error", description: "Recipient phone number is required", variant: "destructive" });
        return;
      }
    } else {
      if (!smsBulkRecipients.trim()) {
        toast({ title: "Error", description: "At least one recipient is required", variant: "destructive" });
        return;
      }
    }
    if (!smsMessage.trim()) {
      toast({ title: "Error", description: "Message cannot be empty", variant: "destructive" });
      return;
    }

    // Directive 2 — Campaign Balance Shield
    if (balanceShieldBlocked && gatewayCreditBalance !== null && gatewayCreditBalance > 0) {
      toast({
        title: "Action Blocked: Insufficient SMS API Credits",
        description: `Insufficient SMS API credits to dispatch this campaign. Required: ${fmtCurrency(shieldRequiredCredits)}, Available: ${fmtCurrency(shieldAvailableCredits)}`,
        variant: "destructive",
        duration: 8000,
      });
      return;
    }

    // Directive 3 — Save snapshot before dispatch
    smsSnapshotRef.current = {
      recipient: smsRecipient,
      bulkRecipients: smsBulkRecipients,
      message: smsMessage,
      campaignName: campaignName,
    };

    // Directive 3 — Double-Hit Guard (button already disabled via smsSending)
    setSmsSending(true);
    try {
      if (sendMode === "single") {
        await apiFetch("/api/sms-logs", {
          method: "POST",
          body: JSON.stringify({
            recipient: smsRecipient.trim(),
            message: smsMessage.trim(),
            status: "Pending",
          }),
        });
        toast({ title: "SMS Sent", description: `Message queued for ${smsRecipient}` });
      } else {
        const recipientsList = smsBulkRecipients.split(",").map(r => r.trim()).filter(Boolean);
        await apiFetch("/api/sms-logs", {
          method: "POST",
          body: JSON.stringify({
            batchMode: true,
            recipients: recipientsList,
            message: smsMessage.trim(),
            campaignName: campaignName || undefined,
            status: "Pending",
          }),
        });
        toast({
          title: "Bulk SMS Complete",
          description: `Campaign queued for ${recipientsList.length} recipient(s)`,
        });
      }
      // Clear form on success
      setSmsRecipient("");
      setSmsBulkRecipients("");
      setSmsMessage("");
      setCampaignName("");
      smsSnapshotRef.current = null;
      loadData();
      // Directive 2 — Fetch balance after successful send
      fetchGatewayBalance();
    } catch (e: any) {
      // Directive 3 — Restore form from snapshot on gateway failure
      if (smsSnapshotRef.current) {
        setSmsRecipient(smsSnapshotRef.current.recipient);
        setSmsBulkRecipients(smsSnapshotRef.current.bulkRecipients);
        setSmsMessage(smsSnapshotRef.current.message);
        setCampaignName(smsSnapshotRef.current.campaignName);
        smsSnapshotRef.current = null;
        toast({
          title: "Gateway Dispatch Failed",
          description: "Form Restored from Snapshot — " + (e.message || "Unknown error"),
          variant: "destructive",
          duration: 8000,
        });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    } finally {
      setSmsSending(false);
    }
  };

  // ============================================================
  // EXPORT HANDLERS (Directive 3 — Spin-Locks + Directive 4 — CSV Activity Logging)
  // ============================================================

  const smsLogColumns: ExportColumnDef[] = [
    { key: "recipient", label: "Recipient", type: "text" },
    { key: "message", label: "Message", type: "text" },
    { key: "charCount", label: "Chars", type: "number" },
    { key: "smsSegmentCount", label: "Segments", type: "number" },
    { key: "isUnicode", label: "Unicode", type: "boolean" },
    { key: "status", label: "Status", type: "text" },
    { key: "sentAt", label: "Sent At", type: "date" },
    { key: "cost", label: "Cost", type: "currency" },
    { key: "campaignName", label: "Campaign", type: "text" },
  ];

  const smsBillColumns: ExportColumnDef[] = [
    { key: "period", label: "Period", type: "text" },
    { key: "totalSms", label: "Total SMS", type: "number" },
    { key: "totalSegments", label: "Total Segments", type: "number" },
    { key: "totalCost", label: "Total Cost", type: "currency" },
    { key: "paidAmount", label: "Paid", type: "currency" },
    { key: "outstanding", label: "Outstanding", type: "currency" },
    { key: "status", label: "Status", type: "text" },
  ];

  const handleExportLogCSV = async () => {
    setCsvExporting(true);
    try {
      exportToCSV({
        title: "SMS Logs",
        columns: smsLogColumns,
        data: filteredLogs,
        isVatAuditor,
        vatMaskedColumns: ["cost"],
        filename: "sms-logs",
      });
      // Directive 4 — Activity logging for CSV exports
      logCsvExportActivity("Comm-SMS-Marketing", "SMS Logs CSV", authUser?.displayName);
      toast({ title: "Exported", description: "SMS Logs exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setCsvExporting(false);
    }
  };

  const handleExportLogPDF = async () => {
    setPdfExporting(true);
    try {
      exportToPDF({
        title: "SMS Logs Report",
        subtitle: `Generated from Electronics Mart IMS`,
        orientation: "landscape",
        columns: smsLogColumns,
        data: filteredLogs,
        isVatAuditor,
        vatMaskedColumns: ["cost"],
        filename: "sms-logs",
        financialFooter: {
          preparedBy: authUser?.displayName || "",
          checkedBy: "",
          authorizedBy: "",
          printedBy: authUser?.displayName || authUser?.email || "",
        },
      });
      toast({ title: "Exported", description: "SMS Logs exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setPdfExporting(false);
    }
  };

  const handleExportBillCSV = async () => {
    setBillCsvExporting(true);
    try {
      exportToCSV({
        title: "SMS Bills",
        columns: smsBillColumns,
        data: filteredBills,
        isVatAuditor,
        vatMaskedColumns: ["totalCost", "paidAmount", "outstanding"],
        filename: "sms-bills",
      });
      // Directive 4 — Activity logging for CSV exports
      logCsvExportActivity("Comm-SMS-Marketing", "SMS Bills CSV", authUser?.displayName);
      toast({ title: "Exported", description: "SMS Bills exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBillCsvExporting(false);
    }
  };

  const handleExportBillPDF = async () => {
    setBillPdfExporting(true);
    try {
      exportToPDF({
        title: "SMS Bills Report",
        subtitle: "Billing Summary",
        orientation: "landscape",
        columns: smsBillColumns,
        data: filteredBills,
        isVatAuditor,
        vatMaskedColumns: ["totalCost", "paidAmount", "outstanding"],
        filename: "sms-bills",
        financialFooter: {
          preparedBy: authUser?.displayName || "",
          checkedBy: "",
          authorizedBy: "",
          printedBy: authUser?.displayName || authUser?.email || "",
        },
      });
      toast({ title: "Exported", description: "SMS Bills exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBillPdfExporting(false);
    }
  };

  // SMS Report PDF export
  const handleExportReportPDF = async () => {
    setReportPdfExporting(true);
    try {
      const reportColumns: ExportColumnDef[] = [
        { key: "date", label: "Date", type: "date" },
        { key: "totalSent", label: "Total Sent", type: "number" },
        { key: "delivered", label: "Delivered", type: "number" },
        { key: "failed", label: "Failed", type: "number" },
        { key: "cost", label: "Cost", type: "currency" },
      ];
      exportToPDF({
        title: "SMS Report",
        subtitle: `Period: ${reportFrom} to ${reportTo}`,
        orientation: "landscape",
        columns: reportColumns,
        data: smsReport,
        isVatAuditor,
        vatMaskedColumns: ["cost"],
        filename: "sms-report",
        financialFooter: {
          preparedBy: authUser?.displayName || "",
          checkedBy: "",
          authorizedBy: "",
          printedBy: authUser?.displayName || authUser?.email || "",
        },
      });
      toast({ title: "Exported", description: "SMS Report exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setReportPdfExporting(false);
    }
  };

  // SMS Settings PDF export
  const handleExportSettingsPDF = async () => {
    setSettingsPdfExporting(true);
    try {
      const settingsColumns: ExportColumnDef[] = [
        { key: "apiUrl", label: "API URL", type: "text" },
        { key: "senderId", label: "Sender ID", type: "text" },
        { key: "gatewayName", label: "Gateway", type: "text" },
        { key: "ratePerSms", label: "Rate/SMS", type: "currency" },
        { key: "unicodeRate", label: "Unicode Rate", type: "currency" },
        { key: "setupCost", label: "Setup Cost", type: "currency" },
        { key: "isActive", label: "Status", type: "boolean" },
      ];
      exportToPDF({
        title: "SMS Settings Report",
        subtitle: "Gateway Configuration Summary",
        orientation: "landscape",
        columns: settingsColumns,
        data: smsSettings,
        isVatAuditor,
        vatMaskedColumns: ["ratePerSms", "unicodeRate", "setupCost"],
        filename: "sms-settings",
        financialFooter: {
          preparedBy: authUser?.displayName || "",
          checkedBy: "",
          authorizedBy: "",
          printedBy: authUser?.displayName || authUser?.email || "",
        },
      });
      toast({ title: "Exported", description: "SMS Settings exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSettingsPdfExporting(false);
    }
  };

  const handleImportLogCSV = () => {
    const formFields: ExportFieldDef[] = [
      { key: "recipient", label: "Recipient", type: "text", required: true },
      { key: "message", label: "Message", type: "textarea", required: true },
      { key: "status", label: "Status", type: "select", options: [{ value: "Pending", label: "Pending" }, { value: "Delivered", label: "Delivered" }, { value: "Failed", label: "Failed" }] },
      { key: "cost", label: "Cost", type: "number" },
      { key: "campaignName", label: "Campaign", type: "text" },
    ];
    importFromCSV({
      apiPath: "/api/sms-logs",
      formFields,
    }).then(result => {
      toast({
        title: "Import Complete",
        description: `Imported: ${result.imported}, Failed: ${result.failed}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    });
  };

  const handleImportBillCSV = () => {
    importFromCSV({
      apiPath: "/api/sms-bills",
      formFields: [
        { key: "period", label: "Period", type: "text" },
        { key: "totalSms", label: "Total SMS", type: "number" },
        { key: "totalSegments", label: "Total Segments", type: "number" },
        { key: "totalCost", label: "Total Cost", type: "number" },
        { key: "paidAmount", label: "Paid Amount", type: "number" },
        { key: "status", label: "Status", type: "text" },
      ],
    }).then(result => {
      toast({
        title: "Import Complete",
        description: `Imported: ${result.imported}, Failed: ${result.failed}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    });
  };

  // ============================================================
  // STATUS HELPERS
  // ============================================================

  const statusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "delivered": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "pending": case "queued": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "failed": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "sent": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  const billStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case "paid": return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400";
      case "partial": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "unpaid": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      default: return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
    }
  };

  // ============================================================
  // KPI CARDS CONFIG
  // ============================================================

  const kpiCards = [
    {
      label: "Total SMS Sent",
      value: totalSent,
      icon: Send,
      color: "text-cyan-600",
      bg: "bg-cyan-50 dark:bg-cyan-900/30",
    },
    {
      label: "Total SMS Cost",
      value: isVatAuditor ? "N/A (Audit Mode)" : fmt(totalCost, "currency"),
      icon: DollarSign,
      color: "text-green-600",
      bg: "bg-green-50 dark:bg-green-900/30",
    },
    {
      label: "Avg Cost/SMS",
      value: isVatAuditor ? "N/A (Audit Mode)" : fmt(avgCostPerSms, "currency"),
      icon: Coins,
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-900/30",
    },
    {
      label: "Delivery Rate",
      value: `${deliveryRate.toFixed(1)}%`,
      icon: CheckCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50 dark:bg-emerald-900/30",
    },
    {
      label: "Pending SMS",
      value: pendingCount,
      icon: Clock,
      color: "text-orange-600",
      bg: "bg-orange-50 dark:bg-orange-900/30",
    },
    {
      label: "Failed SMS",
      value: failedCount,
      icon: XCircle,
      color: "text-red-600",
      bg: "bg-red-50 dark:bg-red-900/30",
    },
    {
      label: "Unpaid Bills",
      value: unpaidBills,
      icon: AlertTriangle,
      color: "text-yellow-600",
      bg: "bg-yellow-50 dark:bg-yellow-900/30",
    },
    {
      label: "Outstanding Amount",
      value: isVatAuditor ? "N/A (Audit Mode)" : fmt(outstandingAmount, "currency"),
      icon: Banknote,
      color: "text-purple-600",
      bg: "bg-purple-50 dark:bg-purple-900/30",
    },
  ];

  // ============================================================
  // RENDER
  // ============================================================

  // ─── DEALER: Access Restricted (after all hooks) ───
  if (isDealer) {
    return (
      <div className="page-enter flex items-center justify-center min-h-[60vh]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <Lock className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle className="text-xl text-red-600 dark:text-red-400">Access Restricted</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-muted-foreground">
              The SMS Analytics module is not available for Dealer accounts.
              Please contact your administrator for access.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">
            Carrier costs, balance rates, API tokens, and billing statements masked for audit compliance.
          </span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-6 h-6 text-[#2563eb]" />
          SMS Analytics & Service
        </h2>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="dashboard" className="flex items-center gap-1">
            <Activity className="w-4 h-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" />
            SMS Log
          </TabsTrigger>
          {/* Hide Billing tab for SR */}
          {!isSR && (
            <TabsTrigger value="billing" className="flex items-center gap-1">
              <CreditCard className="w-4 h-4" />
              SMS Billing
            </TabsTrigger>
          )}
          <TabsTrigger value="send" className="flex items-center gap-1">
            <Send className="w-4 h-4" />
            Send SMS
          </TabsTrigger>
          {/* Hide Settings tab for SR */}
          {!isSR && (
            <TabsTrigger value="settings" className="flex items-center gap-1">
              <Settings className="w-4 h-4" />
              Settings
            </TabsTrigger>
          )}
        </TabsList>

        {/* ============================================================
            DASHBOARD TAB
            ============================================================ */}
        <TabsContent value="dashboard" className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {kpiCards.map((kpi, i) => (
              <Card key={i} className="stat-mini-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${kpi.bg} ${kpi.color}`}>
                    <kpi.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">
                      {typeof kpi.value === "number" ? fmt(kpi.value, "number") : kpi.value}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Daily SMS Trend Bar Chart */}
            <Card className="lg:col-span-2">
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
                <CardTitle className="text-white text-sm">Daily SMS Trend</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {dailySmsTrend.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    No SMS data available for chart
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={dailySmsTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#334155" : "#e2e8f0"} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} />
                      <YAxis tick={{ fontSize: 11, fill: isDark ? "#94a3b8" : "#64748b" }} />
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1e293b" : "#fff",
                          borderColor: isDark ? "#334155" : "#e2e8f0",
                          borderRadius: 8,
                          color: isDark ? "#f1f5f9" : "#1e293b",
                        }}
                      />
                      <Legend />
                      <Bar dataKey="sent" fill="#2563eb" name="Sent" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="delivered" fill="#10b981" name="Delivered" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="failed" fill="#ef4444" name="Failed" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Status Breakdown Pie Chart */}
            <Card>
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
                <CardTitle className="text-white text-sm">Status Breakdown</CardTitle>
              </CardHeader>
              <CardContent className="p-4">
                {statusBreakdown.length === 0 ? (
                  <div className="flex items-center justify-center h-48 text-muted-foreground text-sm">
                    No data for breakdown
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie
                        data={statusBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={4}
                        dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      >
                        {statusBreakdown.map((_entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        contentStyle={{
                          backgroundColor: isDark ? "#1e293b" : "#fff",
                          borderColor: isDark ? "#334155" : "#e2e8f0",
                          borderRadius: 8,
                          color: isDark ? "#f1f5f9" : "#1e293b",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Report Date Range */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                SMS Report
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-900 dark:text-white">From</Label>
                  <Input
                    type="date"
                    value={reportFrom}
                    onChange={(e) => setReportFrom(e.target.value)}
                    className="w-44"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-900 dark:text-white">To</Label>
                  <Input
                    type="date"
                    value={reportTo}
                    onChange={(e) => setReportTo(e.target.value)}
                    className="w-44"
                  />
                </div>
                <Button
                  size="sm"
                  className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                  onClick={loadReport}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Generate
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportReportPDF} disabled={reportPdfExporting}>
                  {reportPdfExporting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
                  {reportPdfExporting ? "Exporting..." : "Export PDF"}
                </Button>
              </div>

              {smsReport.length > 0 ? (
                <div className="table-container overflow-auto max-h-96 rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>Date</TableHead>
                        <TableHead>Total Sent</TableHead>
                        <TableHead>Delivered</TableHead>
                        <TableHead>Failed</TableHead>
                        <TableHead>Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {smsReport.map((row: any, idx: number) => (
                        <TableRow key={idx} className="data-table-row hover:bg-muted/50">
                          <TableCell className="text-slate-900 dark:text-white font-medium">
                            {fmtDate(row.date || row.sentAt)}
                          </TableCell>
                          <TableCell className="text-slate-900 dark:text-white">{row.totalSent ?? row.sent ?? "—"}</TableCell>
                          <TableCell className="text-emerald-600 dark:text-emerald-400">{row.delivered ?? "—"}</TableCell>
                          <TableCell className="text-red-600 dark:text-red-400">{row.failed ?? "—"}</TableCell>
                          <TableCell className="font-mono text-slate-900 dark:text-white">
                            {isVatAuditor ? "N/A (Audit Mode)" : fmt(row.cost ?? row.totalCost, "currency")}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  No report data for the selected period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================
            SMS LOG TAB
            ============================================================ */}
        <TabsContent value="logs" className="space-y-4">
          {/* Toolbar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by recipient, message, status, campaign..."
                    value={logSearch}
                    onChange={(e) => setLogSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={logStatusFilter} onValueChange={setLogStatusFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="sent">Sent</SelectItem>
                  </SelectContent>
                </Select>
                <Separator orientation="vertical" className="h-8" />
                <Button variant="outline" size="sm" onClick={handleImportLogCSV}>
                  <Upload className="w-4 h-4 mr-1" />
                  Import CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportLogCSV} disabled={csvExporting}>
                  {csvExporting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                  {csvExporting ? "Exporting..." : "Export CSV"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportLogPDF} disabled={pdfExporting}>
                  {pdfExporting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
                  {pdfExporting ? "Exporting..." : "Export PDF"}
                </Button>
                <Button variant="outline" size="sm" onClick={loadData}>
                  <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* SMS Log Table */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <MessageSquare className="w-4 h-4" />
                SMS Logs
                <Badge variant="secondary" className="ml-2">{filteredLogs.length} records</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="table-container overflow-auto max-h-[60vh] rounded-b-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead className="text-center">Chars</TableHead>
                      <TableHead className="text-center">Segments</TableHead>
                      <TableHead className="text-center">Type</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Sent At</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Campaign</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-24 text-center">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredLogs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="h-24 text-center text-muted-foreground">
                          No SMS logs found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredLogs.map((log: any, idx: number) => (
                        <TableRow key={log.id || idx} className="data-table-row hover:bg-muted/50">
                          <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                          <TableCell className="font-mono text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                              {log.recipient || "—"}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[300px] truncate text-slate-900 dark:text-white">
                            {log.message || "—"}
                          </TableCell>
                          <TableCell className="text-center text-slate-900 dark:text-white">
                            {log.charCount ?? "—"}
                          </TableCell>
                          <TableCell className="text-center text-slate-900 dark:text-white">
                            {log.smsSegmentCount ?? "—"}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge className={log.isUnicode
                              ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                              : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                            }>
                              {log.isUnicode ? "Unicode" : "Standard"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColor(log.status)}>
                              {log.status || "Unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-900 dark:text-white">
                            {fmtDate(log.sentAt || log.createdAt)}
                          </TableCell>
                          <TableCell className="text-right font-mono text-slate-900 dark:text-white">
                            {isVatAuditor ? "N/A (Audit Mode)" : fmt(log.cost, "currency")}
                          </TableCell>
                          <TableCell className="text-slate-900 dark:text-white">
                            {fmtEmpty(log.campaignName)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="px-4 py-2 text-xs text-muted-foreground border-t">
                Showing {filteredLogs.length} of {smsLogs.length} logs
                {logStatusFilter !== "all" && ` | Filter: ${logStatusFilter}`}
                {logSearch && ` | Search: "${logSearch}"`}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============================================================
            SMS BILLING TAB (Hidden for SR)
            ============================================================ */}
        {!isSR && (
        <TabsContent value="billing" className="space-y-4">
          {/* Billing Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="stat-mini-card">
              <CardContent className="p-3 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Bills</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">{smsBills.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="stat-mini-card">
              <CardContent className="p-3 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600">
                  <CheckCircle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Paid</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {smsBills.filter((b: any) => b.status === "Paid").length}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="stat-mini-card">
              <CardContent className="p-3 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600">
                  <XCircle className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Unpaid</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {smsBills.filter((b: any) => b.status === "Unpaid").length}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="stat-mini-card">
              <CardContent className="p-3 flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-purple-50 dark:bg-purple-900/30 text-purple-600">
                  <Banknote className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className="text-lg font-bold text-slate-900 dark:text-white">
                    {isVatAuditor ? "N/A (Audit Mode)" : fmt(outstandingAmount, "currency")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Bills Toolbar */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <Select value={billStatusFilter} onValueChange={setBillStatusFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Bill Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                  </SelectContent>
                </Select>
                <Separator orientation="vertical" className="h-8" />
                <Button variant="outline" size="sm" onClick={openBillCreate}>
                  <Plus className="w-4 h-4 mr-1" />
                  New Bill
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportBillCSV} disabled={billCsvExporting}>
                  {billCsvExporting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
                  {billCsvExporting ? "Exporting..." : "Export CSV"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportBillPDF} disabled={billPdfExporting}>
                  {billPdfExporting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
                  {billPdfExporting ? "Exporting..." : "Export PDF"}
                </Button>
                <Button variant="outline" size="sm" onClick={handleImportBillCSV}>
                  <Upload className="w-4 h-4 mr-1" />
                  Import CSV
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Bills Table */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <CreditCard className="w-4 h-4" />
                SMS Bills
                <Badge variant="secondary" className="ml-2">{filteredBills.length} records</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="table-container overflow-auto max-h-[60vh] rounded-b-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead className="text-center">Total SMS</TableHead>
                      <TableHead className="text-center">Total Segments</TableHead>
                      <TableHead className="text-right">Total Cost</TableHead>
                      <TableHead className="text-right">Paid</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filteredBills.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="h-24 text-center text-muted-foreground">
                          No SMS bills found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredBills.map((bill: any, idx: number) => {
                        const outstanding = Number(bill.outstanding) || (Number(bill.totalCost) || 0) - (Number(bill.paidAmount) || 0);
                        return (
                          <TableRow key={bill.id || idx} className="data-table-row hover:bg-muted/50">
                            <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                            <TableCell className="font-medium text-slate-900 dark:text-white">
                              {bill.period || "—"}
                            </TableCell>
                            <TableCell className="text-center text-slate-900 dark:text-white">
                              {bill.totalSms ?? "—"}
                            </TableCell>
                            <TableCell className="text-center text-slate-900 dark:text-white">
                              {bill.totalSegments ?? "—"}
                            </TableCell>
                            <TableCell className="text-right font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : fmt(bill.totalCost, "currency")}
                            </TableCell>
                            <TableCell className="text-right font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : fmt(bill.paidAmount, "currency")}
                            </TableCell>
                            <TableCell className="text-right font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : fmt(outstanding, "currency")}
                            </TableCell>
                            <TableCell>
                              <Badge className={billStatusColor(bill.status)}>
                                {bill.status || "Unknown"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center justify-center gap-1">
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openBillEdit(bill)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openPaymentDialog(bill.id)}>
                                  <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                                </Button>
                                {isAdmin ? (
                                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => { setDeleteTarget({ type: "bill", id: bill.id }); setDeleteDialog(true); }}>
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                ) : (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span>
                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-300 cursor-not-allowed" disabled>
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                      </span>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      <p>Only administrators can delete bills</p>
                                    </TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
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

          {/* Payment History */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Payment History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="table-container overflow-auto max-h-96 rounded-b-md">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Bill</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {smsBillPayments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                          No payment records found
                        </TableCell>
                      </TableRow>
                    ) : (
                      smsBillPayments.map((payment: any, idx: number) => (
                        <TableRow key={payment.id || idx} className="data-table-row hover:bg-muted/50">
                          <TableCell className="text-muted-foreground text-xs">{idx + 1}</TableCell>
                          <TableCell className="font-medium text-slate-900 dark:text-white">
                            {payment.smsBill?.period || payment.smsBillId || "—"}
                          </TableCell>
                          <TableCell className="text-right font-mono text-slate-900 dark:text-white">
                            {isVatAuditor ? "N/A (Audit Mode)" : fmt(payment.amount, "currency")}
                          </TableCell>
                          <TableCell className="text-slate-900 dark:text-white">
                            {fmtDate(payment.date)}
                          </TableCell>
                          <TableCell className="text-slate-900 dark:text-white">
                            {fmtEmpty(payment.method)}
                          </TableCell>
                          <TableCell className="text-slate-900 dark:text-white">
                            {fmtEmpty(payment.reference)}
                          </TableCell>
                          <TableCell className="text-slate-900 dark:text-white">
                            {fmtEmpty(payment.notes)}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Bill Create/Edit Dialog */}
          <Dialog open={billDialog} onOpenChange={setBillDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{billEdit ? "Edit SMS Bill" : "New SMS Bill"}</DialogTitle>
                <DialogDescription>
                  {billEdit ? "Update the SMS billing record." : "Create a new SMS billing record."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="bill-period">Period <span className="text-red-500">*</span></Label>
                  <Input id="bill-period" placeholder="e.g. January 2025" value={billForm.period} onChange={e => setBillForm({ ...billForm, period: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bill-total-sms">Total SMS</Label>
                    <Input id="bill-total-sms" type="number" min="0" value={billForm.totalSms} onChange={e => setBillForm({ ...billForm, totalSms: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bill-total-segments">Total Segments</Label>
                    <Input id="bill-total-segments" type="number" min="0" value={billForm.totalSegments} onChange={e => setBillForm({ ...billForm, totalSegments: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bill-total-cost">Total Cost (৳)</Label>
                    <Input id="bill-total-cost" type="number" step="0.01" min="0" value={billForm.totalCost} onChange={e => setBillForm({ ...billForm, totalCost: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bill-paid-amount">Paid Amount (৳)</Label>
                    <Input id="bill-paid-amount" type="number" step="0.01" min="0" value={billForm.paidAmount} onChange={e => setBillForm({ ...billForm, paidAmount: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bill-status">Status</Label>
                  <Select value={billForm.status} onValueChange={v => setBillForm({ ...billForm, status: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Unpaid">Unpaid</SelectItem>
                      <SelectItem value="Partial">Partial</SelectItem>
                      <SelectItem value="Paid">Paid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setBillDialog(false)}>Cancel</Button>
                <Button onClick={saveBill} disabled={billSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                  {billSaving ? "Saving..." : billEdit ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Payment Dialog */}
          <Dialog open={paymentDialog} onOpenChange={setPaymentDialog}>
            <DialogContent className="sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogDescription>
                  Record a payment for this SMS bill.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="payment-amount">Amount (৳) <span className="text-red-500">*</span></Label>
                  <Input id="payment-amount" type="number" step="0.01" min="0" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) || 0 })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-date">Date <span className="text-red-500">*</span></Label>
                  <Input id="payment-date" type="date" value={paymentForm.date} onChange={e => setPaymentForm({ ...paymentForm, date: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-method">Method</Label>
                  <Select value={paymentForm.method} onValueChange={v => setPaymentForm({ ...paymentForm, method: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">Cash</SelectItem>
                      <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                      <SelectItem value="Mobile Banking">Mobile Banking</SelectItem>
                      <SelectItem value="Cheque">Cheque</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-reference">Reference</Label>
                  <Input id="payment-reference" placeholder="Payment reference / transaction ID" value={paymentForm.reference} onChange={e => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-notes">Notes</Label>
                  <Input id="payment-notes" placeholder="Optional notes" value={paymentForm.notes} onChange={e => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPaymentDialog(false)}>Cancel</Button>
                <Button onClick={savePayment} disabled={paymentSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                  {paymentSaving ? "Saving..." : "Record Payment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
        )}

        {/* ============================================================
            SEND SMS TAB (Directive 1, 2, 3 — Enhanced)
            ============================================================ */}
        <TabsContent value="send" className="space-y-4">
          {/* Directive 2 — Campaign Balance Shield Warning */}
          {balanceShieldBlocked && gatewayCreditBalance !== null && gatewayCreditBalance > 0 && (
            <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-400 dark:border-red-600 rounded-lg">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/40 shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-red-700 dark:text-red-300">Action Blocked: Insufficient SMS API Credits</h3>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  Insufficient SMS API credits to dispatch this campaign. Required: <strong>{fmtCurrency(shieldRequiredCredits)}</strong>, Available: <strong>{fmtCurrency(shieldAvailableCredits)}</strong>
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Send Form */}
            <Card>
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Send className="w-4 h-4" />
                  {sendMode === "single" ? "Send Single SMS" : "Send Bulk SMS"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                {/* Mode Toggle — hidden for SR (SR can only send single) */}
                {!isSR && (
                  <div className="flex gap-2">
                    <Button
                      variant={sendMode === "single" ? "default" : "outline"}
                      size="sm"
                      className={sendMode === "single" ? "bg-[#2563eb] hover:bg-[#1d4ed8]" : ""}
                      onClick={() => setSendMode("single")}
                    >
                      <Phone className="w-4 h-4 mr-1" />
                      Single
                    </Button>
                    <Button
                      variant={sendMode === "bulk" ? "default" : "outline"}
                      size="sm"
                      className={sendMode === "bulk" ? "bg-[#2563eb] hover:bg-[#1d4ed8]" : ""}
                      onClick={() => setSendMode("bulk")}
                    >
                      <MessageSquare className="w-4 h-4 mr-1" />
                      Bulk
                    </Button>
                  </div>
                )}

                {/* Recipient Input */}
                {sendMode === "single" ? (
                  <div className="space-y-1.5">
                    <Label className="text-slate-900 dark:text-white">
                      Recipient Phone <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      placeholder="e.g. +8801XXXXXXXXX"
                      value={smsRecipient}
                      onChange={(e) => setSmsRecipient(e.target.value)}
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label className="text-slate-900 dark:text-white">
                      Recipients (comma-separated) <span className="text-red-500">*</span>
                    </Label>
                    <Textarea
                      placeholder="e.g. +8801XXXXXXXXX, +8801YYYYYYYY, +8801ZZZZZZZZ"
                      value={smsBulkRecipients}
                      onChange={(e) => setSmsBulkRecipients(e.target.value)}
                      className="min-h-[80px]"
                    />
                    <p className="text-xs text-muted-foreground">
                      {smsBulkRecipients.split(",").filter(r => r.trim()).length} recipient(s) detected
                    </p>
                  </div>
                )}

                {/* Directive 3 — Dynamic Audience Filtering (Bulk only) */}
                {sendMode === "bulk" && (
                  <div className="space-y-3 p-3 rounded-lg border bg-muted/20">
                    <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                      <Filter className="w-4 h-4 text-[#2563eb]" />
                      Audience Filters
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Zone</Label>
                        <Select value={audienceZone} onValueChange={setAudienceZone}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select zone" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Zones</SelectItem>
                            {ZONE_OPTIONS.map((zone) => (
                              <SelectItem key={zone} value={zone}>{zone}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Customer Type</Label>
                        <Select value={audienceCustomerType} onValueChange={setAudienceCustomerType}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            {CUSTOMER_TYPE_OPTIONS.map((ct) => (
                              <SelectItem key={ct} value={ct}>{ct}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Due Balance Range</Label>
                        <Select value={audienceDueBalance} onValueChange={setAudienceDueBalance}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select range" />
                          </SelectTrigger>
                          <SelectContent>
                            {DUE_BALANCE_RANGE_OPTIONS.map((db) => (
                              <SelectItem key={db} value={db}>{db}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Users className="w-3.5 h-3.5" />
                      <span>Filtered recipients: <strong className="text-slate-900 dark:text-white">{filteredRecipientCount}</strong></span>
                    </div>
                  </div>
                )}

                {/* Campaign Name (Bulk only) */}
                {sendMode === "bulk" && (
                  <div className="space-y-1.5">
                    <Label className="text-slate-900 dark:text-white">
                      Campaign Name
                    </Label>
                    <Input
                      placeholder="e.g. New Year Promo"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                    />
                  </div>
                )}

                {/* Message Input */}
                <div className="space-y-1.5">
                  <Label className="text-slate-900 dark:text-white">
                    Message <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    placeholder="Type your message here..."
                    value={smsMessage}
                    onChange={(e) => setSmsMessage(e.target.value)}
                    className="min-h-[120px]"
                    maxLength={charsPerSegment * 5}
                  />
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-3">
                      <span className={`${
                        charCount > charsPerSegment ? "text-red-500" : "text-muted-foreground"
                      }`}>
                        {charCount} / {charsPerSegment} characters
                      </span>
                      <Badge className={isUnicode
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-xs"
                        : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400 text-xs"
                      }>
                        {isUnicode ? "Unicode" : "Standard"}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">
                        {segmentCount} SMS
                      </span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        Est. cost: {isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(segmentCount * estimatedCostPerSegment)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Directive 3 — Double-Hit Guard Send Button */}
                <Button
                  className="w-full bg-[#2563eb] hover:bg-[#1d4ed8]"
                  size="lg"
                  onClick={handleSendSms}
                  disabled={smsSending || balanceShieldBlocked}
                >
                  {smsSending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {smsSending
                    ? "Dispatching SMS Queue via Gateway..."
                    : sendMode === "single"
                      ? "Send SMS"
                      : `Send Bulk SMS (${filteredRecipientCount || smsBulkRecipients.split(",").filter(r => r.trim()).length} recipients)`
                  }
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats & Credit Info */}
            <div className="space-y-4">
              {/* Directive 1 — Credit Balance Card in Send SMS Quick Stats */}
              <Card>
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    Quick Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Total SMS Sent</span>
                    <span className="font-bold text-slate-900 dark:text-white">{fmt(totalSent, "number")}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Total Cost</span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {isVatAuditor ? "N/A (Audit Mode)" : fmt(totalCost, "currency")}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Delivery Rate</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{deliveryRate.toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Pending</span>
                    <span className="font-bold text-orange-600 dark:text-orange-400">{pendingCount}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Failed</span>
                    <span className="font-bold text-red-600 dark:text-red-400">{failedCount}</span>
                  </div>
                  {/* Directive 1 — Credit Balance */}
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      Credit Balance
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {isVatAuditor ? "N/A (Audit Mode)" : (
                        gatewayCreditBalance !== null ? fmtCurrency(gatewayCreditBalance) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            {balanceLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "—"}
                          </span>
                        )
                      )}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {/* Directive 2 — SMS Credit Info Card */}
              <Card>
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    SMS Credit Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Total Characters</span>
                    <span className="font-bold text-slate-900 dark:text-white">{charCount}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">Detected Encoding</span>
                    <Badge className={isUnicode
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                      : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
                    }>
                      {isUnicode ? "Unicode" : "GSM"}
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border">
                    <span className="text-sm text-muted-foreground">SMS Units / Recipient</span>
                    <span className="font-bold text-slate-900 dark:text-white">{segmentCount}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground flex items-center gap-1">
                      <Zap className="w-3.5 h-3.5" />
                      Gateway Credit Balance
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white">
                      {isVatAuditor ? "N/A (Audit Mode)" : (
                        gatewayCreditBalance !== null ? fmtCurrency(gatewayCreditBalance) : (
                          <span className="text-muted-foreground flex items-center gap-1">
                            {balanceLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : "—"}
                          </span>
                        )
                      )}
                    </span>
                  </div>
                  {/* Credit balance limit alert */}
                  {activeSetting?.creditBalanceLimit > 0 && gatewayCreditBalance !== null && gatewayCreditBalance <= activeSetting.creditBalanceLimit && (
                    <div className="flex items-start gap-2 p-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 dark:text-amber-400">
                        Credit balance ({fmtCurrency(gatewayCreditBalance)}) is at or below the alert limit ({fmtCurrency(activeSetting.creditBalanceLimit)}).
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Active Settings Summary */}
              {activeSetting && (
                <Card>
                  <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Active Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-sm text-muted-foreground">Gateway</span>
                      <span className="font-medium text-slate-900 dark:text-white">{fmtEmpty(activeSetting.gatewayName)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-sm text-muted-foreground">Sender ID</span>
                      <span className="font-medium text-slate-900 dark:text-white">{activeSetting.senderId || "—"}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-sm text-muted-foreground">Rate/SMS</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {isVatAuditor ? "N/A (Audit Mode)" : fmt(activeSetting.ratePerSms, "currency")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border">
                      <span className="text-sm text-muted-foreground">Unicode Rate</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {isVatAuditor ? "N/A (Audit Mode)" : fmt(activeSetting.unicodeRate, "currency")}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-muted-foreground">Masking</span>
                      <span className="font-medium text-slate-900 dark:text-white">{fmtEmpty(activeSetting.maskingName)}</span>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Recent SMS */}
              <Card>
                <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Clock className="w-4 h-4" />
                    Recent SMS
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-64 overflow-y-auto">
                    {smsLogs.length === 0 ? (
                      <div className="p-4 text-center text-muted-foreground text-sm">
                        No recent SMS
                      </div>
                    ) : (
                      smsLogs.slice(0, 10).map((log: any, idx: number) => (
                        <div key={log.id || idx} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-muted/50">
                          <div className={`w-2 h-2 rounded-full ${
                            log.status === "Delivered" || log.status === "delivered"
                              ? "bg-emerald-500"
                              : log.status === "Failed" || log.status === "failed"
                                ? "bg-red-500"
                                : "bg-yellow-500"
                          }`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                              {log.recipient || "—"}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {log.message || "—"}
                            </p>
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(log.sentAt || log.createdAt)}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* ============================================================
            SETTINGS TAB (Hidden for SR) — Directive 1 enhanced
            ============================================================ */}
        {!isSR && (
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Settings className="w-4 h-4" />
                SMS API Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                {isAdmin ? (
                  <Button onClick={openSettingsCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                    <Plus className="h-4 w-4 mr-1" /> New Configuration
                  </Button>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>
                        <Button className="bg-[#2563eb] hover:bg-[#1d4ed8] opacity-50 cursor-not-allowed" disabled>
                          <Plus className="h-4 w-4 mr-1" /> New Configuration
                        </Button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Only administrators can modify SMS gateway settings</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={fetchGatewayBalance} disabled={balanceLoading}>
                    {balanceLoading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <Zap className="w-4 h-4 mr-1" />}
                    Check Balance
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportSettingsPDF} disabled={settingsPdfExporting}>
                    {settingsPdfExporting ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />}
                    {settingsPdfExporting ? "Exporting..." : "Export PDF"}
                  </Button>
                </div>
              </div>

              {/* Directive 1 — Last Known Credit Balance Display */}
              {gatewayCreditBalance !== null && (
                <div className="mb-4 flex items-center gap-3 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <Zap className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-300">Current Gateway Credit Balance</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-400">
                      {isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(gatewayCreditBalance)}
                    </p>
                  </div>
                  {activeSetting?.creditBalanceLimit > 0 && gatewayCreditBalance <= activeSetting.creditBalanceLimit && (
                    <Badge className="bg-amber-500 text-white ml-auto">Low Balance</Badge>
                  )}
                </div>
              )}

              {smsSettings.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Settings className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="text-lg font-medium text-slate-900 dark:text-white">No SMS Settings Configured</p>
                  <p className="text-sm mt-1">Click "New Configuration" to set up your SMS API provider.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {smsSettings.map((setting: any, idx: number) => (
                    <div key={setting.id || idx} className="p-4 rounded-lg border bg-muted/30 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium text-slate-900 dark:text-white">
                          {setting.gatewayName || setting.name || `Configuration #${idx + 1}`}
                        </h4>
                        <div className="flex items-center gap-2">
                          <Badge className={setting.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400"}>
                            {setting.isActive ? "Active" : "Inactive"}
                          </Badge>
                          {isAdmin ? (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openSettingsEdit(setting)}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-500 hover:text-red-700" onClick={() => { setDeleteTarget({ type: "settings", id: setting.id }); setDeleteDialog(true); }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 cursor-not-allowed" disabled>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Only administrators can modify SMS gateway settings</p>
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
                                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-300 cursor-not-allowed" disabled>
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Only administrators can delete SMS gateway settings</p>
                                </TooltipContent>
                              </Tooltip>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">API URL</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <code className="text-sm text-slate-900 dark:text-white break-all">
                              {setting.apiUrl || "—"}
                            </code>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">API Key</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <code className="text-sm text-slate-900 dark:text-white">
                              {isAdmin
                                ? (setting.apiKey ? `${setting.apiKey.substring(0, 8)}${"•".repeat(16)}` : "—")
                                : "••••••••"
                              }
                            </code>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Sender ID</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm text-slate-900 dark:text-white">
                              {setting.senderId || "—"}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Gateway</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm text-slate-900 dark:text-white">
                              {fmtEmpty(setting.gatewayName)}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Masking Name</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm text-slate-900 dark:text-white">
                              {fmtEmpty(setting.maskingName)}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Masking Reg ID</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm text-slate-900 dark:text-white">
                              {fmtEmpty(setting.maskingRegId)}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Rate/SMS (৳)</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : fmt(setting.ratePerSms, "currency")}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Unicode Rate (৳)</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : fmt(setting.unicodeRate, "currency")}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Setup Cost (৳)</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : fmt(setting.setupCost, "currency")}
                            </span>
                          </div>
                        </div>
                        {/* Directive 1 — Credit Balance Limit Display */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Credit Balance Limit Alert</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : (setting.creditBalanceLimit ? fmtCurrency(setting.creditBalanceLimit) : "—")}
                            </span>
                          </div>
                        </div>
                        {/* Directive 1 — Last Known Credit Balance */}
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Last Known Credit Balance</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : (gatewayCreditBalance !== null ? fmtCurrency(gatewayCreditBalance) : "—")}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Settings Form Dialog (Directive 1 — creditBalanceLimit field + text field sanitization) */}
          <Dialog open={settingsDialog} onOpenChange={setSettingsDialog}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{settingsEdit ? "Edit SMS Configuration" : "New SMS Configuration"}</DialogTitle>
                <DialogDescription>
                  {settingsEdit ? "Update your SMS API provider settings." : "Configure your SMS API provider to start sending messages."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-api-url">API URL <span className="text-red-500">*</span></Label>
                    <Input id="settings-api-url" placeholder="https://api.sms-provider.com/send" value={settingsForm.apiUrl} onChange={e => setSettingsForm({ ...settingsForm, apiUrl: e.target.value })} />
                    <p className="text-xs text-muted-foreground">Trailing spaces and line breaks are stripped on save.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-api-key">API Key <span className="text-red-500">*</span></Label>
                    <Input id="settings-api-key" placeholder="Enter API key" type="password" value={settingsForm.apiKey} onChange={e => setSettingsForm({ ...settingsForm, apiKey: e.target.value })} />
                    <p className="text-xs text-muted-foreground">Trailing spaces and line breaks are stripped on save.</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-sender-id">Sender ID <span className="text-red-500">*</span></Label>
                    <Input id="settings-sender-id" placeholder="e.g. EMART" value={settingsForm.senderId} onChange={e => setSettingsForm({ ...settingsForm, senderId: e.target.value })} />
                    <p className="text-xs text-muted-foreground">Trailing spaces and line breaks are stripped on save.</p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-gateway-name">Gateway Name</Label>
                    <Input id="settings-gateway-name" placeholder="e.g., BulkSMSBD, Infobip" value={settingsForm.gatewayName} onChange={e => setSettingsForm({ ...settingsForm, gatewayName: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-masking-name">Masking Name</Label>
                    <Input id="settings-masking-name" placeholder="Registered masking name" value={settingsForm.maskingName} onChange={e => setSettingsForm({ ...settingsForm, maskingName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-masking-reg-id">Masking Registration ID</Label>
                    <Input id="settings-masking-reg-id" placeholder="Masking registration ID" value={settingsForm.maskingRegId} onChange={e => setSettingsForm({ ...settingsForm, maskingRegId: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-rate-per-sms">Rate/SMS (৳) <span className="text-red-500">*</span></Label>
                    <Input id="settings-rate-per-sms" type="number" step="0.01" min="0" value={settingsForm.ratePerSms} onChange={e => setSettingsForm({ ...settingsForm, ratePerSms: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-unicode-rate">Unicode Rate (৳) <span className="text-red-500">*</span></Label>
                    <Input id="settings-unicode-rate" type="number" step="0.01" min="0" value={settingsForm.unicodeRate} onChange={e => setSettingsForm({ ...settingsForm, unicodeRate: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-setup-cost">Setup Cost (৳)</Label>
                    <Input id="settings-setup-cost" type="number" step="0.01" min="0" value={settingsForm.setupCost} onChange={e => setSettingsForm({ ...settingsForm, setupCost: Number(e.target.value) || 0 })} />
                  </div>
                </div>
                {/* Directive 1 — Credit Balance Limit Alert Field */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-credit-balance-limit">SMS Credit Balance Limit Alert (৳)</Label>
                    <Input
                      id="settings-credit-balance-limit"
                      type="number"
                      step="0.01"
                      min="0"
                      placeholder="e.g. 500"
                      value={settingsForm.creditBalanceLimit || ""}
                      onChange={e => setSettingsForm({ ...settingsForm, creditBalanceLimit: Number(e.target.value) || 0 })}
                    />
                    <p className="text-xs text-muted-foreground">Alert when gateway credit balance drops to or below this amount.</p>
                  </div>
                  <div className="space-y-2">
                    <Label>Current Gateway Balance</Label>
                    <div className="flex items-center h-10 px-3 rounded-md border bg-muted/50">
                      <span className="text-sm font-mono text-slate-900 dark:text-white">
                        {isVatAuditor ? "N/A (Audit Mode)" : (gatewayCreditBalance !== null ? fmtCurrency(gatewayCreditBalance) : "Not available")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="settings-active" checked={settingsForm.isActive} onCheckedChange={v => setSettingsForm({ ...settingsForm, isActive: v })} />
                  <Label htmlFor="settings-active">Active</Label>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setSettingsDialog(false)}>Cancel</Button>
                <Button onClick={saveSettings} disabled={settingsSaving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                  {settingsSaving ? "Saving..." : settingsEdit ? "Update" : "Create"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Additional Settings Info */}
          <Card>
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-xl">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" />
                Important Notes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3 text-sm text-slate-900 dark:text-white">
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <p>API configuration changes take effect immediately for new SMS messages.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <p>Only one active SMS provider configuration can be used at a time.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p>Only administrators can create, edit, or delete SMS gateway configurations. Managers can review settings but cannot modify them.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <p>API keys are partially masked for security. Contact your administrator for full access.</p>
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-500 mt-0.5 shrink-0" />
                  <p>Failed messages are retried up to 3 times before being marked as permanently failed.</p>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <p>Unicode messages (Bangla, emoji, etc.) have a 70-character limit per segment, while standard messages have 160 characters per segment.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p>All text fields (API URL, API Key, Sender ID, Masking) automatically strip trailing spaces and line breaks on save.</p>
                </div>
                <div className="flex items-start gap-2">
                  <Zap className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <p>Credit Balance Limit Alert triggers a notification when the gateway credit balance drops to or below the configured threshold.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        )}
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Confirm Deletion
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this record? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDeleteDialog(false); setDeleteTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
