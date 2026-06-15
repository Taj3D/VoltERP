"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Send, DollarSign, Coins, CheckCircle, Clock, XCircle,
  AlertTriangle, Banknote, Search, RefreshCw, Download,
  Upload, FileDown, Plus, MessageSquare, Settings,
  Phone, FileText, CreditCard, Activity, BarChart3,
  Pencil, Trash2, Shield, Lock, Mail, Eye, Flag, Archive,
  Zap, ShoppingCart, Package, Users, Megaphone, RotateCcw
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
import { apiFetch } from "@/lib/api-client";
import { useAuth } from "@/hooks/useAuth";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

import { fmtBDT as _fmtBDT, fmtNumber as _fmtNumberVal } from "@/lib/number-format";

const fmtCurrency = (v: any) => {
  if (v === "N/A (Audit Mode)" || v === "N/A (Restricted)") return v;
  const num = Number(v);
  if (isNaN(num) || v === null || v === undefined) return "—";
  return _fmtBDT(num);
};

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (type === "currency") return fmtCurrency(v);
  if (type === "date") { if (!v) return "—"; const dt = new Date(v); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") {
    const num = Number(v);
    if (isNaN(num)) return "—";
    return _fmtNumberVal(num);
  }
  return String(v);
};

const fmtEmpty = (v: any) => {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
};

const fmtDate = (d: string | Date) => { if (!d) return "—"; const dt = new Date(d); return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); };

// SMS Character Bounds Computation (Client-side mirror)
const computeClientSmsSegments = (message: string) => {
  const charCount = message.length;
  const isUnicode = /[^\x00-\x7F]/.test(message);
  const charsPerSegment = isUnicode ? 70 : 160;
  const segmentCount = charCount > 0 ? Math.ceil(charCount / charsPerSegment) : 1;
  return { charCount, isUnicode, segmentCount, charsPerSegment };
};


// ============================================================
// AUTH TYPES

// ============================================================
// SMS ANALYTICS PAGE COMPONENT
// ============================================================

export default function SMSAnalyticsPage({ initialTab }: { initialTab?: string } = {}) {
  const { toast } = useToast();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Auth state (shared hook)
  const { user: authUser, isVatAuditor, isAdmin, isSR, isDealer } = useAuth();

  // Tab state
  const [activeTab, setActiveTab] = useState(initialTab || "dashboard");

  // Data state
  const [smsLogs, setSmsLogs] = useState<any[]>([]);
  const [smsBills, setSmsBills] = useState<any[]>([]);
  const [smsSettings, setSmsSettings] = useState<any[]>([]);
  const [smsBillPayments, setSmsBillPayments] = useState<any[]>([]);
  const [smsReport, setSmsReport] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Inbox state
  const [smsInbox, setSmsInbox] = useState<any[]>([]);
  const [inboxSearch, setInboxSearch] = useState("");
  const [inboxStatusFilter, setInboxStatusFilter] = useState("all");
  const [inboxPriorityFilter, setInboxPriorityFilter] = useState("all");
  const [inboxDialog, setInboxDialog] = useState(false);
  const [inboxForm, setInboxForm] = useState({ sender: "", message: "", category: "", priority: "Normal", relatedModule: "", relatedCode: "" });
  const [inboxSaving, setInboxSaving] = useState(false);
  const [inboxDetailDialog, setInboxDetailDialog] = useState(false);
  const [inboxDetail, setInboxDetail] = useState<any>(null);

  // Campaign state
  const [smsCampaigns, setSmsCampaigns] = useState<any[]>([]);
  const [campaignDialog, setCampaignDialog] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: "", description: "", message: "", targetGroup: "All", scheduledAt: "" });
  const [campaignSaving, setCampaignSaving] = useState(false);
  const [campaignDetailDialog, setCampaignDetailDialog] = useState(false);
  const [campaignDetail, setCampaignDetail] = useState<any>(null);
  const [campaignStatusFilter, setCampaignStatusFilter] = useState("all");

  // Notification Triggers state
  const [smsTriggers, setSmsTriggers] = useState<any[]>([]);
  const [triggerDialog, setTriggerDialog] = useState(false);
  const [triggerEdit, setTriggerEdit] = useState<any>(null);
  const [triggerForm, setTriggerForm] = useState({ eventType: "SalesConfirmation", label: "", description: "", isEnabled: true, recipientType: "Customer", templateBody: "" });
  const [triggerSaving, setTriggerSaving] = useState(false);

  // Automation Config state
  const [automationConfig, setAutomationConfig] = useState<any>(null);
  const [automationSaving, setAutomationSaving] = useState(false);

  // Log trigger type filter
  const [logTriggerTypeFilter, setLogTriggerTypeFilter] = useState("all");

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

  // SMS Settings form state
  const [settingsDialog, setSettingsDialog] = useState(false);
  const [settingsEdit, setSettingsEdit] = useState<any>(null);
  const [settingsForm, setSettingsForm] = useState({
    apiUrl: "", apiKey: "", senderId: "", maskingName: "", maskingRegId: "",
    gatewayName: "", ratePerSms: 0.5, unicodeRate: 0.8, setupCost: 0, isActive: true
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

  // ============================================================
  // DATA LOADING
  // ============================================================

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [logsRes, billsRes, settingsRes, paymentsRes, inboxRes, campaignsRes, triggersRes] = await Promise.all([
        apiFetch("/api/sms-logs").catch(() => []),
        apiFetch("/api/sms-bills").catch(() => []),
        apiFetch("/api/sms-settings").catch(() => []),
        apiFetch("/api/sms-bill-payments").catch(() => []),
        apiFetch("/api/sms-inbox").catch(() => []),
        apiFetch("/api/sms-campaigns").catch(() => []),
        apiFetch("/api/sms-notification-triggers").catch(() => []),
      ]);
      setSmsLogs(Array.isArray(logsRes) ? logsRes : logsRes?.data || []);
      setSmsBills(Array.isArray(billsRes) ? billsRes : billsRes?.data || []);
      setSmsSettings(Array.isArray(settingsRes) ? settingsRes : settingsRes?.data || []);
      setSmsBillPayments(Array.isArray(paymentsRes) ? paymentsRes : paymentsRes?.data || []);
      setSmsInbox(Array.isArray(inboxRes) ? inboxRes : inboxRes?.items || inboxRes?.data || []);
      setSmsCampaigns(Array.isArray(campaignsRes) ? campaignsRes : campaignsRes?.items || campaignsRes?.data || []);
      setSmsTriggers(Array.isArray(triggersRes) ? triggersRes : triggersRes?.data || []);

      // Load automation config
      try {
        const autoConfig = await apiFetch("/api/sms-automation");
        setAutomationConfig(autoConfig);
      } catch (err) {
        console.warn('Error loading SMS automation config, using defaults:', err);
      }
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
    } catch (err) {
      console.error('Error loading SMS report:', err);
      setSmsReport([]);
    }
  }, [reportFrom, reportTo]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadReport(); }, [loadReport]);

  // SMS Settings: open create dialog
  const openSettingsCreate = () => {
    setSettingsEdit(null);
    setSettingsForm({
      apiUrl: "", apiKey: "", senderId: "", maskingName: "", maskingRegId: "",
      gatewayName: "", ratePerSms: 0.5, unicodeRate: 0.8, setupCost: 0, isActive: true
    });
    setSettingsDialog(true);
  };

  // SMS Settings: open edit dialog
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
    });
    setSettingsDialog(true);
  };

  // SMS Settings: save handler
  const saveSettings = async () => {
    if (!settingsForm.apiUrl || !settingsForm.apiKey || !settingsForm.senderId) {
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
          body: JSON.stringify(settingsForm),
        });
        toast({ title: "Settings Updated", description: "SMS configuration updated successfully" });
      } else {
        await apiFetch("/api/sms-settings", {
          method: "POST",
          body: JSON.stringify(settingsForm),
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

  const totalSent = smsLogs.filter((l: any) => l.status !== "Sending").length;
  const totalCost = smsLogs.filter((l: any) => l.status !== "Sending").reduce((sum: number, log: any) => sum + (Number(log.cost) || 0), 0);
  const avgCostPerSms = totalSent > 0 ? totalCost / totalSent : 0;
  const deliveredCount = smsLogs.filter((l: any) => l.status === "Delivered" || l.status === "delivered" || l.status === "Sent" || l.status === "sent").length;
  const pendingCount = smsLogs.filter((l: any) => l.status === "Pending" || l.status === "pending" || l.status === "Queued").length;
  const failedCount = smsLogs.filter((l: any) => l.status === "Failed" || l.status === "failed").length;
  const sendingCount = smsLogs.filter((l: any) => l.status === "Sending").length;
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
    if (logTriggerTypeFilter !== "all") {
      result = result.filter((log: any) => (log.triggerType || "Manual")?.toLowerCase() === logTriggerTypeFilter.toLowerCase());
    }
    return result;
  }, [smsLogs, logSearch, logStatusFilter, logTriggerTypeFilter]);

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
      const dateStr = (() => { if (!log.sentAt) return "Unknown"; const dt = new Date(log.sentAt); return isNaN(dt.getTime()) ? "Unknown" : dt.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }); })();
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

  // ============================================================
  // SEND SMS HANDLER
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

    setSmsSending(true);

    if (sendMode === "single") {
      // ─── WhatsApp-like Optimistic UI: Single SMS ───
      // 1. Immediately add a "Sending..." entry to local smsLogs state
      const optimisticId = `temp-${Date.now()}`;
      const { charCount: optCharCount, isUnicode: optIsUnicode, segmentCount: optSegCount } = computeClientSmsSegments(smsMessage.trim());
      const optRate = optIsUnicode ? unicodeCostPerSegment : costPerSegment;
      const estimatedCost = optSegCount * optRate;

      const optimisticLog = {
        id: optimisticId,
        recipient: smsRecipient.trim(),
        message: smsMessage.trim(),
        charCount: optCharCount,
        smsSegmentCount: optSegCount,
        isUnicode: optIsUnicode,
        status: "Sending",
        sentAt: new Date().toISOString(),
        cost: estimatedCost,
        campaignName: null,
        isOptimistic: true,
      };

      // 2. Clear the form immediately (like WhatsApp clears the input)
      const savedRecipient = smsRecipient.trim();
      const savedMessage = smsMessage.trim();
      setSmsRecipient("");
      setSmsMessage("");

      // 3. Add optimistic entry to the top of the logs
      setSmsLogs((prev) => [optimisticLog, ...prev]);

      // 4. Make the API call (gateway dispatch happens server-side now)
      try {
        const result = await apiFetch("/api/sms-logs", {
          method: "POST",
          body: JSON.stringify({
            recipient: savedRecipient,
            message: savedMessage,
          }),
        });

        // 5. Replace the optimistic entry with the real one
        setSmsLogs((prev) =>
          prev.map((log) =>
            log.id === optimisticId
              ? { ...(result as any), isOptimistic: false }
              : log
          )
        );

        const finalStatus = (result as any)?.status || "Sent";
        if (finalStatus === "Sent") {
          toast({ title: "✓ SMS Sent", description: `Message delivered to ${savedRecipient}` });
        } else if (finalStatus === "Failed") {
          toast({ title: "SMS Failed", description: `Gateway error for ${savedRecipient}: ${(result as any)?.gatewayResponse || "Unknown error"}`, variant: "destructive" });
        } else {
          toast({ title: "SMS Queued", description: `Message queued for ${savedRecipient} (Pending delivery)` });
        }
      } catch (e: any) {
        // 6. Mark the optimistic entry as Failed
        setSmsLogs((prev) =>
          prev.map((log) =>
            log.id === optimisticId
              ? { ...log, status: "Failed", isOptimistic: false }
              : log
          )
        );
        toast({ title: "Failed", description: e.message || "Failed to send SMS", variant: "destructive" });
      } finally {
        setSmsSending(false);
        // Refresh data from server to ensure consistency
        loadData();
      }
    } else {
      // ─── WhatsApp-like Optimistic UI: Bulk SMS ───
      const rawRecipients = smsBulkRecipients.split(",").map(r => r.trim()).filter(Boolean);
      const uniqueRecipients = [...new Set(rawRecipients)];
      const duplicatesRemoved = rawRecipients.length - uniqueRecipients.length;

      if (duplicatesRemoved > 0) {
        toast({ title: "Duplicates Removed", description: `${duplicatesRemoved} duplicate number(s) removed from recipient list`, variant: "destructive" });
      }
      if (uniqueRecipients.length === 0) {
        toast({ title: "Error", description: "No valid unique recipients found", variant: "destructive" });
        setSmsSending(false);
        return;
      }

      // 1. Create optimistic entries for each recipient
      const { charCount: optCharCount, isUnicode: optIsUnicode, segmentCount: optSegCount } = computeClientSmsSegments(smsMessage.trim());
      const optRate = optIsUnicode ? unicodeCostPerSegment : costPerSegment;
      const estimatedCost = optSegCount * optRate;

      const bulkMessage = smsMessage.trim();
      const bulkCampaignName = campaignName || null;

      const optimisticEntries = uniqueRecipients.map((recipient, i) => ({
        id: `temp-bulk-${Date.now()}-${i}`,
        recipient,
        message: bulkMessage,
        charCount: optCharCount,
        smsSegmentCount: optSegCount,
        isUnicode: optIsUnicode,
        status: "Sending",
        sentAt: new Date().toISOString(),
        cost: estimatedCost,
        campaignName: bulkCampaignName,
        isOptimistic: true,
      }));

      // 2. Clear form immediately
      setSmsBulkRecipients("");
      setSmsMessage("");
      setCampaignName("");

      // 3. Add optimistic entries to the top of the logs
      setSmsLogs((prev) => [...optimisticEntries, ...prev]);

      // 4. Make the API call
      try {
        const result = await apiFetch("/api/sms-logs", {
          method: "POST",
          body: JSON.stringify({
            batchMode: true,
            recipients: uniqueRecipients,
            message: bulkMessage,
            campaignName: bulkCampaignName || undefined,
          }),
        }) as any[];

        // 5. Replace optimistic entries with real ones
        if (Array.isArray(result)) {
          const resultMap = new Map(result.map((r: any) => [r.recipient, r]));
          setSmsLogs((prev) => {
            // Remove all optimistic entries for this batch
            const withoutOptimistic = prev.filter(
              (log) => !optimisticEntries.some((oe) => oe.id === log.id)
            );
            // Prepend real results
            return [...result.map((r: any) => ({ ...r, isOptimistic: false })), ...withoutOptimistic];
          });

          const sentCount = result.filter((r: any) => r.status === "Sent").length;
          const failedCount = result.filter((r: any) => r.status === "Failed").length;
          const pendingCount = result.filter((r: any) => r.status === "Pending").length;

          toast({
            title: "Bulk SMS Complete",
            description: `Sent: ${sentCount}, Failed: ${failedCount}, Pending: ${pendingCount}${duplicatesRemoved > 0 ? ` (${duplicatesRemoved} duplicates removed)` : ''}`,
          });
        }
      } catch (e: any) {
        // 6. Mark all optimistic entries as Failed
        setSmsLogs((prev) =>
          prev.map((log) =>
            optimisticEntries.some((oe) => oe.id === log.id)
              ? { ...log, status: "Failed", isOptimistic: false }
              : log
          )
        );
        toast({ title: "Failed", description: e.message || "Failed to send bulk SMS", variant: "destructive" });
      } finally {
        setSmsSending(false);
        // Refresh data from server to ensure consistency
        loadData();
      }
    }
  };

  // ============================================================
  // EXPORT HANDLERS
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

  const handleExportLogCSV = () => {
    try {
      exportToCSV({
        title: "SMS Logs",
        columns: smsLogColumns,
        data: filteredLogs,
        isVatAuditor,
        vatMaskedColumns: ["cost"],
        filename: "sms-logs",
      });
      toast({ title: "Exported", description: "SMS Logs exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportLogPDF = () => {
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
          printedBy: authUser?.displayName || "System",
        },
      });
      toast({ title: "Exported", description: "SMS Logs exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportBillCSV = () => {
    try {
      exportToCSV({
        title: "SMS Bills",
        columns: smsBillColumns,
        data: filteredBills,
        isVatAuditor,
        vatMaskedColumns: ["totalCost", "paidAmount", "outstanding"],
        filename: "sms-bills",
      });
      toast({ title: "Exported", description: "SMS Bills exported to CSV" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportBillPDF = () => {
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
          printedBy: authUser?.displayName || "System",
        },
      });
      toast({ title: "Exported", description: "SMS Bills exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // SMS Report PDF export
  const handleExportReportPDF = () => {
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
          printedBy: authUser?.displayName || "System",
        },
      });
      toast({ title: "Exported", description: "SMS Report exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // SMS Settings PDF export
  const handleExportSettingsPDF = () => {
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
          printedBy: authUser?.displayName || "System",
        },
      });
      toast({ title: "Exported", description: "SMS Settings exported to PDF" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
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
      case "sending": return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400";
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
      label: "Sending",
      value: sendingCount,
      icon: Activity,
      color: "text-cyan-600",
      bg: "bg-cyan-50 dark:bg-cyan-900/30",
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
  // CHARACTER COUNTER (SMS Segments Computation)
  // ============================================================

  const { charCount, isUnicode, segmentCount, charsPerSegment } = computeClientSmsSegments(smsMessage);
  const estimatedCostPerSegment = isUnicode ? unicodeCostPerSegment : costPerSegment;

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
        <TabsList className="flex overflow-x-auto h-auto gap-1 pb-1 scrollbar-none w-full">
          <TabsTrigger value="dashboard" className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
            <Activity className="w-4 h-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="inbox" className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
            <Mail className="w-4 h-4" />
            Inbox
            {smsInbox.filter((m: any) => m.status === "Unread").length > 0 && (
              <Badge className="bg-red-500 text-white text-xs ml-1 px-1.5 py-0 min-w-[18px] text-center">{smsInbox.filter((m: any) => m.status === "Unread").length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
            <MessageSquare className="w-4 h-4" />
            SMS Log
          </TabsTrigger>
          {/* Hide Billing tab for SR */}
          {!isSR && (
            <TabsTrigger value="billing" className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
              <CreditCard className="w-4 h-4" />
              SMS Billing
            </TabsTrigger>
          )}
          <TabsTrigger value="send" className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
            <Send className="w-4 h-4" />
            Send SMS
          </TabsTrigger>
          {!isSR && (
            <TabsTrigger value="campaigns" className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
              <Megaphone className="w-4 h-4" />
              Campaigns
            </TabsTrigger>
          )}
          {/* Hide Settings tab for SR */}
          {!isSR && (
            <TabsTrigger value="settings" className="flex items-center gap-1 whitespace-nowrap flex-shrink-0">
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
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
                <Button variant="outline" size="sm" onClick={handleExportReportPDF}>
                  <FileDown className="w-4 h-4 mr-1" />
                  Export PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  try {
                    const reportColumns: ExportColumnDef[] = [
                      { key: "date", label: "Date", type: "date" },
                      { key: "totalSent", label: "Total Sent", type: "number" },
                      { key: "delivered", label: "Delivered", type: "number" },
                      { key: "failed", label: "Failed", type: "number" },
                      { key: "cost", label: "Cost", type: "currency" },
                    ];
                    exportToCSV({ title: "SMS Report", columns: reportColumns, data: smsReport, isVatAuditor, vatMaskedColumns: ["cost"], filename: "sms-report" });
                    toast({ title: "Exported", description: "SMS Report exported to CSV" });
                  } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                }}>
                  <Download className="w-4 h-4 mr-1" />
                  Export CSV
                </Button>
              </div>

              {smsReport.length > 0 ? (
                <div className="table-container overflow-x-auto overflow-y-auto max-h-96 rounded-md border -mx-2 sm:mx-0">
                  <Table className="min-w-[600px]">
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
            SMS INBOX TAB
            ============================================================ */}
        <TabsContent value="inbox" className="space-y-4">
          {/* Inbox KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
            {[
              { label: "Total Messages", value: smsInbox.length, icon: Mail, color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-900/30" },
              { label: "Unread", value: smsInbox.filter((m: any) => m.status === "Unread").length, icon: Eye, color: "text-yellow-600", bg: "bg-yellow-50 dark:bg-yellow-900/30" },
              { label: "Flagged", value: smsInbox.filter((m: any) => m.status === "Flagged").length, icon: Flag, color: "text-red-600", bg: "bg-red-50 dark:bg-red-900/30" },
              { label: "High Priority", value: smsInbox.filter((m: any) => m.priority === "High" || m.priority === "Urgent").length, icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-900/30" },
            ].map((kpi, i) => (
              <Card key={i} className="stat-mini-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${kpi.bg} ${kpi.color}`}><kpi.icon className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{fmt(kpi.value, "number")}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Inbox Toolbar */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search inbox..." value={inboxSearch} onChange={e => setInboxSearch(e.target.value)} className="pl-9" />
              </div>
              <Select value={inboxStatusFilter} onValueChange={setInboxStatusFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Unread">Unread</SelectItem>
                  <SelectItem value="Read">Read</SelectItem>
                  <SelectItem value="Archived">Archived</SelectItem>
                  <SelectItem value="Flagged">Flagged</SelectItem>
                </SelectContent>
              </Select>
              <Select value={inboxPriorityFilter} onValueChange={setInboxPriorityFilter}>
                <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Priority</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => { setInboxForm({ sender: "", message: "", category: "", priority: "Normal", relatedModule: "", relatedCode: "" }); setInboxDialog(true); }}>
                <Plus className="w-4 h-4 mr-1" /> Add Entry
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                try {
                  const inboxColumns: ExportColumnDef[] = [
                    { key: "sender", label: "Sender", type: "text" },
                    { key: "message", label: "Message", type: "text" },
                    { key: "category", label: "Category", type: "text" },
                    { key: "priority", label: "Priority", type: "text" },
                    { key: "status", label: "Status", type: "text" },
                    { key: "receivedAt", label: "Received", type: "date" },
                  ];
                  exportToPDF({ title: "SMS Inbox", columns: inboxColumns, data: smsInbox, isVatAuditor, filename: "sms-inbox", financialFooter: { preparedBy: authUser?.displayName || "", checkedBy: "", authorizedBy: "", printedBy: authUser?.displayName || "System" } });
                  toast({ title: "Exported", description: "SMS Inbox exported to PDF" });
                } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
              }}>
                <FileDown className="w-4 h-4 mr-1" /> Export PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                try {
                  const inboxColumns: ExportColumnDef[] = [
                    { key: "sender", label: "Sender", type: "text" },
                    { key: "message", label: "Message", type: "text" },
                    { key: "category", label: "Category", type: "text" },
                    { key: "priority", label: "Priority", type: "text" },
                    { key: "status", label: "Status", type: "text" },
                    { key: "receivedAt", label: "Received", type: "date" },
                  ];
                  exportToCSV({ title: "SMS Inbox", columns: inboxColumns, data: smsInbox, isVatAuditor, filename: "sms-inbox" });
                  toast({ title: "Exported", description: "SMS Inbox exported to CSV" });
                } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
              }}>
                <Download className="w-4 h-4 mr-1" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                importFromCSV({ apiPath: "/api/sms-inbox", formFields: [
                  { key: "sender", label: "Sender", type: "text", required: true },
                  { key: "message", label: "Message", type: "textarea", required: true },
                  { key: "category", label: "Category", type: "text" },
                  { key: "priority", label: "Priority", type: "text" },
                ] }).then(result => {
                  toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
                  loadData();
                });
              }}>
                <Upload className="w-4 h-4 mr-1" /> Import CSV
              </Button>
            </CardContent>
          </Card>

          {/* Inbox Table */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-x-auto overflow-y-auto -mx-2 sm:mx-0">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Sender</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Received</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {smsInbox
                      .filter((m: any) => {
                        if (inboxStatusFilter !== "all" && m.status !== inboxStatusFilter) return false;
                        if (inboxPriorityFilter !== "all" && m.priority !== inboxPriorityFilter) return false;
                        if (inboxSearch) {
                          const s = inboxSearch.toLowerCase();
                          return m.sender?.toLowerCase().includes(s) || m.message?.toLowerCase().includes(s);
                        }
                        return true;
                      })
                      .map((msg: any) => (
                      <TableRow key={msg.id} className={msg.status === "Unread" ? "bg-yellow-50/50 dark:bg-yellow-900/10" : ""}>
                        <TableCell className="font-medium text-sm">{msg.sender || "—"}</TableCell>
                        <TableCell className="max-w-[200px] truncate text-sm">{msg.message || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{msg.category || "—"}</Badge></TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${msg.priority === "Urgent" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : msg.priority === "High" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" : msg.priority === "Low" ? "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}`}>{msg.priority}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${msg.status === "Unread" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : msg.status === "Flagged" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : msg.status === "Archived" ? "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"}`}>{msg.status}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{fmtDate(msg.receivedAt)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {msg.status === "Unread" && (
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={async () => { await apiFetch(`/api/sms-inbox/${msg.id}`, { method: "PUT", body: JSON.stringify({ status: "Read" }) }); loadData(); }}><Eye className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Mark Read</TooltipContent></Tooltip>
                            )}
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={() => { setInboxDetail(msg); setInboxDetailDialog(true); }}><FileText className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>View</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={async () => { await apiFetch(`/api/sms-inbox/${msg.id}`, { method: "PUT", body: JSON.stringify({ status: msg.status === "Flagged" ? "Read" : "Flagged" }) }); loadData(); }}><Flag className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>{msg.status === "Flagged" ? "Unflag" : "Flag"}</TooltipContent></Tooltip>
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={async () => { await apiFetch(`/api/sms-inbox/${msg.id}`, { method: "PUT", body: JSON.stringify({ status: "Archived" }) }); loadData(); }}><Archive className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Archive</TooltipContent></Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {smsInbox.filter((m: any) => {
                      if (inboxStatusFilter !== "all" && m.status !== inboxStatusFilter) return false;
                      if (inboxPriorityFilter !== "all" && m.priority !== inboxPriorityFilter) return false;
                      if (inboxSearch) { const s = inboxSearch.toLowerCase(); return m.sender?.toLowerCase().includes(s) || m.message?.toLowerCase().includes(s); }
                      return true;
                    }).length === 0 && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground"><Mail className="w-8 h-8 mx-auto mb-2 opacity-40" />No inbox messages found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Inbox Create Dialog */}
          <Dialog open={inboxDialog} onOpenChange={setInboxDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader><DialogTitle>Add Inbox Message</DialogTitle><DialogDescription>Record an incoming SMS message</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div><Label>Sender Phone *</Label><Input value={inboxForm.sender} onChange={e => setInboxForm({ ...inboxForm, sender: e.target.value })} placeholder="+880XXXXXXXXXX" /></div>
                <div><Label>Message *</Label><Textarea value={inboxForm.message} onChange={e => setInboxForm({ ...inboxForm, message: e.target.value })} rows={3} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Category</Label><Select value={inboxForm.category} onValueChange={v => setInboxForm({ ...inboxForm, category: v })}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="CustomerReply">Customer Reply</SelectItem><SelectItem value="SupplierNotice">Supplier Notice</SelectItem><SelectItem value="SystemAlert">System Alert</SelectItem><SelectItem value="Spam">Spam</SelectItem><SelectItem value="OptOut">Opt-Out</SelectItem></SelectContent></Select></div>
                  <div><Label>Priority</Label><Select value={inboxForm.priority} onValueChange={v => setInboxForm({ ...inboxForm, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Low">Low</SelectItem><SelectItem value="Normal">Normal</SelectItem><SelectItem value="High">High</SelectItem><SelectItem value="Urgent">Urgent</SelectItem></SelectContent></Select></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Related Module</Label><Input value={inboxForm.relatedModule} onChange={e => setInboxForm({ ...inboxForm, relatedModule: e.target.value })} placeholder="e.g. SalesOrder" /></div>
                  <div><Label>Related Code</Label><Input value={inboxForm.relatedCode} onChange={e => setInboxForm({ ...inboxForm, relatedCode: e.target.value })} placeholder="e.g. SO-00001" /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setInboxDialog(false)}>Cancel</Button>
                <Button disabled={inboxSaving} onClick={async () => {
                  if (!inboxForm.sender || !inboxForm.message) { toast({ title: "Error", description: "Sender and message are required", variant: "destructive" }); return; }
                  setInboxSaving(true);
                  try {
                    await apiFetch("/api/sms-inbox", { method: "POST", body: JSON.stringify(inboxForm) });
                    toast({ title: "Created", description: "Inbox message recorded" });
                    setInboxDialog(false); loadData();
                  } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } finally { setInboxSaving(false); }
                }}>{inboxSaving ? "Saving..." : "Save"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Inbox Detail Dialog */}
          <Dialog open={inboxDetailDialog} onOpenChange={setInboxDetailDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader><DialogTitle>Inbox Message Detail</DialogTitle></DialogHeader>
              {inboxDetail && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-muted-foreground">Sender:</span> <span className="font-medium">{inboxDetail.sender}</span></div>
                    <div><span className="text-muted-foreground">Status:</span> <Badge className={`text-xs ${inboxDetail.status === "Unread" ? "bg-yellow-100 text-yellow-700" : inboxDetail.status === "Flagged" ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"}`}>{inboxDetail.status}</Badge></div>
                    <div><span className="text-muted-foreground">Priority:</span> <Badge variant="outline" className="text-xs">{inboxDetail.priority}</Badge></div>
                    <div><span className="text-muted-foreground">Category:</span> {inboxDetail.category || "—"}</div>
                    <div><span className="text-muted-foreground">Received:</span> {fmtDate(inboxDetail.receivedAt)}</div>
                    {inboxDetail.relatedCode && <div><span className="text-muted-foreground">Reference:</span> {inboxDetail.relatedCode}</div>}
                  </div>
                  <Separator />
                  <div><span className="text-muted-foreground">Message:</span><p className="mt-1 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg whitespace-pre-wrap">{inboxDetail.message}</p></div>
                  {inboxDetail.notes && <div><span className="text-muted-foreground">Notes:</span> {inboxDetail.notes}</div>}
                </div>
              )}
            </DialogContent>
          </Dialog>
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
                <Select value={logTriggerTypeFilter} onValueChange={setLogTriggerTypeFilter}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Trigger Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Manual">Manual</SelectItem>
                    <SelectItem value="SalesConfirmation">Sales Confirm</SelectItem>
                    <SelectItem value="FinancialCollection">Collection</SelectItem>
                    <SelectItem value="InventoryIngestion">Ingestion</SelectItem>
                    <SelectItem value="HRLifecycle">HR Lifecycle</SelectItem>
                    <SelectItem value="Campaign">Campaign</SelectItem>
                  </SelectContent>
                </Select>
                <Separator orientation="vertical" className="h-8" />
                <Button variant="outline" size="sm" onClick={handleImportLogCSV}>
                  <Upload className="w-4 h-4 mr-1" />
                  Import CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportLogCSV}>
                  <Download className="w-4 h-4 mr-1" />
                  Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportLogPDF}>
                  <FileDown className="w-4 h-4 mr-1" />
                  Export PDF
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
              <div className="table-container overflow-x-auto overflow-y-auto max-h-[60vh] rounded-b-md">
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
                              {log.status === "Sending" && (
                                <Clock className="w-3 h-3 mr-1 animate-spin inline" />
                              )}
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
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
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
                <Button variant="outline" size="sm" onClick={handleExportBillCSV}>
                  <Download className="w-4 h-4 mr-1" />
                  Export CSV
                </Button>
                <Button variant="outline" size="sm" onClick={handleExportBillPDF}>
                  <FileDown className="w-4 h-4 mr-1" />
                  Export PDF
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
              <div className="table-container overflow-x-auto overflow-y-auto max-h-[60vh] rounded-b-md">
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
              <div className="table-container overflow-x-auto overflow-y-auto max-h-96 rounded-b-md">
                <Table className="min-w-[600px]">
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
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
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
                    <Label htmlFor="bill-total-cost">Total Cost (Tk. )</Label>
                    <Input id="bill-total-cost" type="number" step="0.01" min="0" value={billForm.totalCost} onChange={e => setBillForm({ ...billForm, totalCost: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bill-paid-amount">Paid Amount (Tk. )</Label>
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
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogDescription>
                  Record a payment for this SMS bill.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="payment-amount">Amount (Tk. ) <span className="text-red-500">*</span></Label>
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
            SEND SMS TAB
            ============================================================ */}
        <TabsContent value="send" className="space-y-4">
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
                      {(() => {
                        const raw = smsBulkRecipients.split(",").filter(r => r.trim()).length;
                        const unique = new Set(smsBulkRecipients.split(",").map(r => r.trim()).filter(Boolean)).size;
                        const dupes = raw - unique;
                        return dupes > 0 ? `${unique} unique recipient(s) (${dupes} duplicate(s) removed)` : `${raw} recipient(s) detected`;
                      })()}
                    </p>
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
                        Est. cost: {isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(segmentCount * estimatedCostPerSegment * (sendMode === "bulk" ? new Set(smsBulkRecipients.split(",").map(r => r.trim()).filter(Boolean)).size || 1 : 1))}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Send Button */}
                <Button
                  className="w-full bg-[#2563eb] hover:bg-[#1d4ed8]"
                  size="lg"
                  onClick={handleSendSms}
                  disabled={smsSending}
                >
                  {smsSending ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4 mr-2" />
                  )}
                  {smsSending
                    ? "Sending..."
                    : sendMode === "single"
                      ? "Send SMS"
                      : `Send Bulk SMS (${smsBulkRecipients.split(",").filter(r => r.trim()).length} recipients)`
                  }
                </Button>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="space-y-4">
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
                  <div className="flex justify-between items-center py-2">
                    <span className="text-sm text-muted-foreground">Failed</span>
                    <span className="font-bold text-red-600 dark:text-red-400">{failedCount}</span>
                  </div>
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
                            log.status === "Sending"
                              ? "bg-cyan-500 animate-pulse"
                              : log.status === "Delivered" || log.status === "delivered"
                              ? "bg-emerald-500"
                              : log.status === "Failed" || log.status === "failed"
                                ? "bg-red-500"
                                : log.status === "Sent" || log.status === "sent"
                                  ? "bg-blue-500"
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
            CAMPAIGNS TAB (Hidden for SR)
            ============================================================ */}
        {!isSR && (
        <TabsContent value="campaigns" className="space-y-4">
          {/* Campaigns KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
            {[
              { label: "Total Campaigns", value: smsCampaigns.length, icon: Megaphone, color: "text-cyan-600", bg: "bg-cyan-50 dark:bg-cyan-900/30" },
              { label: "Active", value: smsCampaigns.filter((c: any) => c.status === "Draft" || c.status === "Scheduled" || c.status === "Sending").length, icon: Zap, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-900/30" },
              { label: "Completed", value: smsCampaigns.filter((c: any) => c.status === "Completed").length, icon: CheckCircle, color: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-900/30" },
              { label: "Total Recipients", value: smsCampaigns.reduce((s: number, c: any) => s + (c.recipientCount || 0), 0), icon: Users, color: "text-purple-600", bg: "bg-purple-50 dark:bg-purple-900/30" },
            ].map((kpi, i) => (
              <Card key={i} className="stat-mini-card">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${kpi.bg} ${kpi.color}`}><kpi.icon className="w-5 h-5" /></div>
                  <div>
                    <p className="text-xs text-muted-foreground">{kpi.label}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{fmt(kpi.value, "number")}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Campaigns Toolbar */}
          <Card>
            <CardContent className="p-4 flex flex-wrap items-center gap-3">
              <Select value={campaignStatusFilter} onValueChange={setCampaignStatusFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="Sending">Sending</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Failed">Failed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" onClick={() => { setCampaignForm({ name: "", description: "", message: "", targetGroup: "All", scheduledAt: "" }); setCampaignDialog(true); }}>
                <Plus className="w-4 h-4 mr-1" /> New Campaign
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                try {
                  const campaignColumns: ExportColumnDef[] = [
                    { key: "code", label: "Code", type: "text" },
                    { key: "name", label: "Name", type: "text" },
                    { key: "targetGroup", label: "Target", type: "text" },
                    { key: "recipientCount", label: "Recipients", type: "number" },
                    { key: "sentCount", label: "Sent", type: "number" },
                    { key: "deliveredCount", label: "Delivered", type: "number" },
                    { key: "failedCount", label: "Failed", type: "number" },
                    { key: "totalCost", label: "Cost", type: "currency" },
                    { key: "status", label: "Status", type: "text" },
                  ];
                  exportToPDF({ title: "SMS Campaigns", columns: campaignColumns, data: smsCampaigns, isVatAuditor, vatMaskedColumns: ["totalCost"], filename: "sms-campaigns", financialFooter: { preparedBy: authUser?.displayName || "", checkedBy: "", authorizedBy: "", printedBy: authUser?.displayName || "System" } });
                  toast({ title: "Exported", description: "Campaigns exported to PDF" });
                } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
              }}>
                <FileDown className="w-4 h-4 mr-1" /> Export PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                try {
                  const campaignColumns: ExportColumnDef[] = [
                    { key: "code", label: "Code", type: "text" },
                    { key: "name", label: "Name", type: "text" },
                    { key: "targetGroup", label: "Target", type: "text" },
                    { key: "recipientCount", label: "Recipients", type: "number" },
                    { key: "totalCost", label: "Cost", type: "currency" },
                    { key: "status", label: "Status", type: "text" },
                  ];
                  exportToCSV({ title: "SMS Campaigns", columns: campaignColumns, data: smsCampaigns, isVatAuditor, vatMaskedColumns: ["totalCost"], filename: "sms-campaigns" });
                  toast({ title: "Exported", description: "Campaigns exported to CSV" });
                } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
              }}>
                <Download className="w-4 h-4 mr-1" /> Export CSV
              </Button>
              <Button variant="outline" size="sm" onClick={() => {
                importFromCSV({ apiPath: "/api/sms-campaigns", formFields: [
                  { key: "name", label: "Name", type: "text", required: true },
                  { key: "message", label: "Message", type: "textarea", required: true },
                  { key: "targetGroup", label: "Target Group", type: "text" },
                ] }).then(result => {
                  toast({ title: "Import Complete", description: `Imported: ${result.imported}, Failed: ${result.failed}`, variant: result.failed > 0 ? "destructive" : "default" });
                  loadData();
                });
              }}>
                <Upload className="w-4 h-4 mr-1" /> Import CSV
              </Button>
            </CardContent>
          </Card>

          {/* Campaigns Table */}
          <Card>
            <CardContent className="p-0">
              <div className="max-h-[500px] overflow-x-auto overflow-y-auto -mx-2 sm:mx-0">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead className="text-right">Recipients</TableHead>
                      <TableHead className="text-right">Sent</TableHead>
                      <TableHead className="text-right">Delivered</TableHead>
                      <TableHead className="text-right">Failed</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {smsCampaigns
                      .filter((c: any) => campaignStatusFilter === "all" || c.status === campaignStatusFilter)
                      .map((camp: any) => (
                      <TableRow key={camp.id}>
                        <TableCell className="font-mono text-xs">{camp.code || "—"}</TableCell>
                        <TableCell className="font-medium text-sm">{camp.name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-xs">{camp.targetGroup}</Badge></TableCell>
                        <TableCell className="text-right text-sm">{camp.recipientCount || 0}</TableCell>
                        <TableCell className="text-right text-sm">{camp.sentCount || 0}</TableCell>
                        <TableCell className="text-right text-sm text-emerald-600">{camp.deliveredCount || 0}</TableCell>
                        <TableCell className="text-right text-sm text-red-600">{camp.failedCount || 0}</TableCell>
                        <TableCell className="text-right text-sm">{isVatAuditor ? "N/A" : fmt(camp.totalCost, "currency")}</TableCell>
                        <TableCell>
                          <Badge className={`text-xs ${camp.status === "Completed" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : camp.status === "Draft" ? "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400" : camp.status === "Sending" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400" : camp.status === "Failed" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : camp.status === "Scheduled" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" : "bg-gray-100 text-gray-700"}`}>{camp.status}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {camp.status === "Draft" && (
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="text-emerald-600" onClick={async () => { try { await apiFetch(`/api/sms-campaigns/${camp.id}`, { method: "PUT", body: JSON.stringify({ action: "launch" }) }); toast({ title: "Launched", description: "Campaign is now sending" }); loadData(); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } }}><Zap className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Launch Campaign</TooltipContent></Tooltip>
                            )}
                            {(camp.status === "Draft" || camp.status === "Scheduled") && (
                              <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" className="text-red-600" onClick={async () => { try { await apiFetch(`/api/sms-campaigns/${camp.id}`, { method: "PUT", body: JSON.stringify({ action: "cancel" }) }); toast({ title: "Cancelled", description: "Campaign cancelled" }); loadData(); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } }}><XCircle className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Cancel</TooltipContent></Tooltip>
                            )}
                            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="sm" onClick={() => { setCampaignDetail(camp); setCampaignDetailDialog(true); }}><Eye className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>View Detail</TooltipContent></Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {smsCampaigns.filter((c: any) => campaignStatusFilter === "all" || c.status === campaignStatusFilter).length === 0 && (
                      <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground"><Megaphone className="w-8 h-8 mx-auto mb-2 opacity-40" />No campaigns found</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Campaign Create Dialog */}
          <Dialog open={campaignDialog} onOpenChange={setCampaignDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader><DialogTitle>Create Campaign</DialogTitle><DialogDescription>Set up a new SMS campaign</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div><Label>Campaign Name *</Label><Input value={campaignForm.name} onChange={e => setCampaignForm({ ...campaignForm, name: e.target.value })} placeholder="e.g. Weekend Sale Promo" /></div>
                <div><Label>Description</Label><Textarea value={campaignForm.description} onChange={e => setCampaignForm({ ...campaignForm, description: e.target.value })} rows={2} /></div>
                <div>
                  <Label>Message *</Label>
                  <Textarea value={campaignForm.message} onChange={e => setCampaignForm({ ...campaignForm, message: e.target.value })} rows={3} placeholder="Campaign message body..." />
                  {campaignForm.message && (
                    <p className="text-xs text-muted-foreground mt-1">{campaignForm.message.length} chars | {computeClientSmsSegments(campaignForm.message).segmentCount} segments | {computeClientSmsSegments(campaignForm.message).isUnicode ? "Unicode" : "Standard"}</p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Target Group</Label><Select value={campaignForm.targetGroup} onValueChange={v => setCampaignForm({ ...campaignForm, targetGroup: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="All">All</SelectItem><SelectItem value="Customers">Customers</SelectItem><SelectItem value="Dealers">Dealers</SelectItem><SelectItem value="Suppliers">Suppliers</SelectItem><SelectItem value="Employees">Employees</SelectItem></SelectContent></Select></div>
                  <div><Label>Scheduled Date</Label><Input type="datetime-local" value={campaignForm.scheduledAt} onChange={e => setCampaignForm({ ...campaignForm, scheduledAt: e.target.value })} /></div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCampaignDialog(false)}>Cancel</Button>
                <Button disabled={campaignSaving} onClick={async () => {
                  if (!campaignForm.name || !campaignForm.message) { toast({ title: "Error", description: "Name and message are required", variant: "destructive" }); return; }
                  setCampaignSaving(true);
                  try {
                    await apiFetch("/api/sms-campaigns", { method: "POST", body: JSON.stringify(campaignForm) });
                    toast({ title: "Created", description: "Campaign created as Draft" });
                    setCampaignDialog(false); loadData();
                  } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } finally { setCampaignSaving(false); }
                }}>{campaignSaving ? "Saving..." : "Create Campaign"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* Campaign Detail Dialog */}
          <Dialog open={campaignDetailDialog} onOpenChange={setCampaignDetailDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader><DialogTitle>Campaign Detail</DialogTitle></DialogHeader>
              {campaignDetail && (
                <div className="space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-muted-foreground">Code:</span> <span className="font-mono">{campaignDetail.code}</span></div>
                    <div><span className="text-muted-foreground">Name:</span> <span className="font-medium">{campaignDetail.name}</span></div>
                    <div><span className="text-muted-foreground">Target:</span> {campaignDetail.targetGroup}</div>
                    <div><span className="text-muted-foreground">Status:</span> <Badge className="text-xs">{campaignDetail.status}</Badge></div>
                  </div>
                  <Separator />
                  <div className="grid grid-cols-2 gap-3">
                    <div><span className="text-muted-foreground">Recipients:</span> {campaignDetail.recipientCount}</div>
                    <div><span className="text-muted-foreground">Sent:</span> {campaignDetail.sentCount}</div>
                    <div><span className="text-muted-foreground">Delivered:</span> <span className="text-emerald-600">{campaignDetail.deliveredCount}</span></div>
                    <div><span className="text-muted-foreground">Failed:</span> <span className="text-red-600">{campaignDetail.failedCount}</span></div>
                    <div><span className="text-muted-foreground">Cost/SMS:</span> {isVatAuditor ? "N/A" : fmt(campaignDetail.costPerSms, "currency")}</div>
                    <div><span className="text-muted-foreground">Total Cost:</span> {isVatAuditor ? "N/A" : fmt(campaignDetail.totalCost, "currency")}</div>
                  </div>
                  <Separator />
                  <div><span className="text-muted-foreground">Message:</span><p className="mt-1 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg whitespace-pre-wrap text-xs">{campaignDetail.message}</p></div>
                  {campaignDetail.description && <div><span className="text-muted-foreground">Description:</span> {campaignDetail.description}</div>}
                </div>
              )}
            </DialogContent>
          </Dialog>
        </TabsContent>
        )}

        {/* ============================================================
            SETTINGS TAB (Hidden for SR)
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
                <Button variant="outline" size="sm" onClick={handleExportSettingsPDF}>
                  <FileDown className="w-4 h-4 mr-1" />
                  Export PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
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
                    exportToCSV({ title: "SMS Settings", columns: settingsColumns, data: smsSettings, isVatAuditor, vatMaskedColumns: ["ratePerSms", "unicodeRate", "setupCost"], filename: "sms-settings" });
                    toast({ title: "Exported", description: "SMS Settings exported to CSV" });
                  } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                }}>
                  <Download className="w-4 h-4 mr-1" />
                  Export CSV
                </Button>
              </div>
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
                          <Label className="text-xs text-muted-foreground">Rate/SMS (Tk. )</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : fmt(setting.ratePerSms, "currency")}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Unicode Rate (Tk. )</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : fmt(setting.unicodeRate, "currency")}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-muted-foreground">Setup Cost (Tk. )</Label>
                          <div className="flex items-center gap-2 p-2 rounded-md bg-background border">
                            <span className="text-sm font-mono text-slate-900 dark:text-white">
                              {isVatAuditor ? "N/A (Audit Mode)" : fmt(setting.setupCost, "currency")}
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

          {/* Settings Form Dialog */}
          <Dialog open={settingsDialog} onOpenChange={setSettingsDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{settingsEdit ? "Edit SMS Configuration" : "New SMS Configuration"}</DialogTitle>
                <DialogDescription>
                  {settingsEdit ? "Update your SMS API provider settings." : "Configure your SMS API provider to start sending messages."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-api-url">API URL <span className="text-red-500">*</span></Label>
                    <Input id="settings-api-url" placeholder="https://api.sms-provider.com/send" value={settingsForm.apiUrl} onChange={e => setSettingsForm({ ...settingsForm, apiUrl: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-api-key">API Key <span className="text-red-500">*</span></Label>
                    <Input id="settings-api-key" placeholder="Enter API key" type="password" value={settingsForm.apiKey} onChange={e => setSettingsForm({ ...settingsForm, apiKey: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-sender-id">Sender ID <span className="text-red-500">*</span></Label>
                    <Input id="settings-sender-id" placeholder="e.g. EMART" value={settingsForm.senderId} onChange={e => setSettingsForm({ ...settingsForm, senderId: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-gateway-name">Gateway Name</Label>
                    <Input id="settings-gateway-name" placeholder="e.g., BulkSMSBD, Infobip" value={settingsForm.gatewayName} onChange={e => setSettingsForm({ ...settingsForm, gatewayName: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-masking-name">Masking Name</Label>
                    <Input id="settings-masking-name" placeholder="Registered masking name" value={settingsForm.maskingName} onChange={e => setSettingsForm({ ...settingsForm, maskingName: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-masking-reg-id">Masking Registration ID</Label>
                    <Input id="settings-masking-reg-id" placeholder="Masking registration ID" value={settingsForm.maskingRegId} onChange={e => setSettingsForm({ ...settingsForm, maskingRegId: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="settings-rate-per-sms">Rate/SMS (Tk. ) <span className="text-red-500">*</span></Label>
                    <Input id="settings-rate-per-sms" type="number" step="0.01" min="0" value={settingsForm.ratePerSms} onChange={e => setSettingsForm({ ...settingsForm, ratePerSms: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-unicode-rate">Unicode Rate (Tk. ) <span className="text-red-500">*</span></Label>
                    <Input id="settings-unicode-rate" type="number" step="0.01" min="0" value={settingsForm.unicodeRate} onChange={e => setSettingsForm({ ...settingsForm, unicodeRate: Number(e.target.value) || 0 })} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="settings-setup-cost">Setup Cost (Tk. )</Label>
                    <Input id="settings-setup-cost" type="number" step="0.01" min="0" value={settingsForm.setupCost} onChange={e => setSettingsForm({ ...settingsForm, setupCost: Number(e.target.value) || 0 })} />
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
              </div>
            </CardContent>
          </Card>

          {/* ── Auto SMS Triggers ── */}
          <div className="mt-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Auto SMS Triggers / স্বয়ংক্রিয় এসএমএস ট্রিগার
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: "autoSmsOnPurchase", label: "Customer Purchase SMS / ক্রেতা ক্রয় এসএমএস", desc: "Auto SMS to customer when they purchase a product — includes product info, invoice number & amount", icon: ShoppingCart, color: "blue" },
                { key: "autoSmsOnReceipt", label: "Cash/Bank Receipt SMS / নগদ/ব্যাংক রশিদ এসএমএস", desc: "Auto SMS to customer/dealer when cash or bank payment is received — includes payment method & amount", icon: DollarSign, color: "green" },
                { key: "autoSmsOnStockReceive", label: "Stock Receipt SMS / স্টক গ্রহণ এসএমএস", desc: "Auto SMS to supplier when products are received at godown/showroom — includes product, quantity & location", icon: Package, color: "orange" },
                { key: "autoSmsOnEmployeeEvent", label: "Employee Event SMS / কর্মী ইভেন্ট এসএমএস", desc: "Auto SMS for employee events — exam date, joining date, confirmation & other HR milestones", icon: Users, color: "purple" },
              ].map((toggle) => {
                const isEnabled = automationConfig?.[toggle.key] ?? false;
                return (
                  <Card key={toggle.key} className={`border-l-4 ${toggle.color === "blue" ? "border-l-blue-500" : toggle.color === "green" ? "border-l-emerald-500" : toggle.color === "orange" ? "border-l-orange-500" : "border-l-purple-500"}`}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2 rounded-lg ${toggle.color === "blue" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600" : toggle.color === "green" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600" : toggle.color === "orange" ? "bg-orange-50 dark:bg-orange-900/30 text-orange-600" : "bg-purple-50 dark:bg-purple-900/30 text-purple-600"}`}>
                            <toggle.icon className="w-5 h-5" />
                          </div>
                          <div>
                            <h4 className="font-semibold text-sm text-slate-900 dark:text-white">{toggle.label}</h4>
                            <p className="text-xs text-muted-foreground">{toggle.desc}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${isEnabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                            {isEnabled ? "ON" : "OFF"}
                          </span>
                          {isAdmin ? (
                            <Switch
                              checked={isEnabled}
                              onCheckedChange={async (checked: boolean) => {
                                setAutomationSaving(true);
                                try {
                                  const updated = { ...automationConfig, [toggle.key]: checked };
                                  await apiFetch("/api/sms-automation", {
                                    method: "PUT",
                                    body: JSON.stringify({
                                      autoSmsOnPurchase: updated.autoSmsOnPurchase ?? false,
                                      autoSmsOnReceipt: updated.autoSmsOnReceipt ?? false,
                                      autoSmsOnStockReceive: updated.autoSmsOnStockReceive ?? false,
                                      autoSmsOnEmployeeEvent: updated.autoSmsOnEmployeeEvent ?? false,
                                    }),
                                  });
                                  setAutomationConfig((prev: any) => ({ ...prev, [toggle.key]: checked }));
                                  toast({ title: checked ? "Enabled" : "Disabled", description: `${toggle.label} auto-SMS ${checked ? "enabled" : "disabled"}` });
                                } catch (e: any) {
                                  toast({ title: "Error", description: e.message, variant: "destructive" });
                                } finally {
                                  setAutomationSaving(false);
                                }
                              }}
                              disabled={automationSaving}
                            />
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Switch checked={isEnabled} disabled />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Only administrators can modify auto-SMS triggers</p>
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              These are master switches. Even if Notification Triggers are enabled, SMS will NOT be sent when the corresponding master toggle is OFF.
            </p>
          </div>

          {/* ── Notification Triggers ── */}
          <div className="mt-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-[#2563eb]" />
                Automated Notification Triggers / স্বয়ংক্রিয় এসএমএস ট্রিগার
              </h3>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => {
                  try {
                    const triggerColumns: ExportColumnDef[] = [
                      { key: "eventType", label: "Event Type", type: "text" },
                      { key: "label", label: "Label", type: "text" },
                      { key: "recipientType", label: "Recipient", type: "text" },
                      { key: "isEnabled", label: "Enabled", type: "boolean" },
                      { key: "templateBody", label: "Template", type: "text" },
                    ];
                    exportToPDF({ title: "SMS Notification Triggers", columns: triggerColumns, data: smsTriggers, isVatAuditor, filename: "sms-triggers", financialFooter: { preparedBy: authUser?.displayName || "", checkedBy: "", authorizedBy: "", printedBy: authUser?.displayName || "System" } });
                    toast({ title: "Exported", description: "Triggers exported to PDF" });
                  } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                }}>
                  <FileDown className="w-4 h-4 mr-1" /> Export PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => {
                  try {
                    const triggerColumns: ExportColumnDef[] = [
                      { key: "eventType", label: "Event Type", type: "text" },
                      { key: "label", label: "Label", type: "text" },
                      { key: "recipientType", label: "Recipient", type: "text" },
                      { key: "isEnabled", label: "Enabled", type: "boolean" },
                    ];
                    exportToCSV({ title: "SMS Notification Triggers", columns: triggerColumns, data: smsTriggers, isVatAuditor, filename: "sms-triggers" });
                    toast({ title: "Exported", description: "Triggers exported to CSV" });
                  } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                }}>
                  <Download className="w-4 h-4 mr-1" /> Export CSV
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { eventType: "SalesConfirmation", label: "Sales Confirmation / বিক্রয় নিশ্চিতি", description: "Auto-SMS on confirmed sales with product summary — ক্রেতা/ডিলার পণ্য ক্রয় করলে স্বয়ংক্রিয়ভাবে SMS প্রেরণ", icon: ShoppingCart, color: "blue", variables: "{{customerName}}, {{invoiceNo}}, {{amount}}, {{date}}, {{productSummary}}" },
                { eventType: "FinancialCollection", label: "Payment Receipt / পেমেন্ট রশিদ", description: "Receipt SMS after processing inflow — ক্যাশ/ব্যাংক/bKash/নগদ পেমেন্ট প্রাপ্তির স্বয়ংক্রিয় SMS", icon: DollarSign, color: "green", variables: "{{clientName}}, {{amount}}, {{paymentMethod}}, {{date}}, {{receiptRef}}" },
                { eventType: "InventoryIngestion", label: "Inventory Received / ইনভেন্টরি গ্রহণ", description: "Notify suppliers when inventory items are checked in — গুডাম/শোরুমে পণ্য এলে সাপ্লায়ারকে স্বয়ংক্রিয় SMS", icon: Package, color: "orange", variables: "{{supplierName}}, {{productName}}, {{quantity}}, {{godownName}}, {{date}}, {{referenceNo}}" },
                { eventType: "HRLifecycle", label: "Employee Lifecycle / কর্মী জীবনচক্র", description: "Joining & exam date alerts — নতুন কর্মী যোগদান বা পরীক্ষার তারিখে স্বয়ংক্রিয় SMS", icon: Users, color: "purple", variables: "{{employeeName}}, {{eventType}}, {{details}}, {{companyName}}" },
              ].map((evt) => {
                const trigger = smsTriggers.find((t: any) => t.eventType === evt.eventType);
                return (
                  <Card key={evt.eventType} className={`border-l-4 ${evt.color === "blue" ? "border-l-blue-500" : evt.color === "green" ? "border-l-emerald-500" : evt.color === "orange" ? "border-l-orange-500" : "border-l-purple-500"}`}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${evt.color === "blue" ? "bg-blue-50 dark:bg-blue-900/30 text-blue-600" : evt.color === "green" ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600" : evt.color === "orange" ? "bg-orange-50 dark:bg-orange-900/30 text-orange-600" : "bg-purple-50 dark:bg-purple-900/30 text-purple-600"}`}>
                            <evt.icon className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold text-sm">{evt.label}</h4>
                              {trigger && (
                                <>
                                  <Badge variant="outline" className="text-xs">{trigger.recipientType}</Badge>
                                  <Badge className={`text-xs ${trigger.isEnabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                                    {trigger.isEnabled ? "● Active / সক্রিয়" : "○ Inactive / নিষ্ক্রিয়"}
                                  </Badge>
                                </>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">{evt.description}</p>
                            {trigger ? (
                              <div className="mt-2">
                                <p className="text-xs bg-slate-50 dark:bg-slate-900 p-2 rounded font-mono whitespace-pre-wrap line-clamp-3">
                                  {trigger.templateBody || "No template configured"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">Variables: <span className="font-mono">{evt.variables}</span></p>
                              </div>
                            ) : (
                              <p className="text-xs text-amber-600 mt-1">Not configured</p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          {trigger && (
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-medium ${trigger.isEnabled ? "text-emerald-600" : "text-slate-400"}`}>
                                {trigger.isEnabled ? "ON / চালু" : "OFF / বন্ধ"}
                              </span>
                              <Switch checked={trigger.isEnabled} onCheckedChange={async (checked: boolean) => {
                                try { await apiFetch(`/api/sms-notification-triggers/${trigger.id}`, { method: "PUT", body: JSON.stringify({ isEnabled: checked }) }); toast({ title: checked ? "Enabled / চালু" : "Disabled / বন্ধ", description: `${evt.label} trigger ${checked ? "enabled" : "disabled"}` }); loadData(); } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
                              }} />
                            </div>
                          )}
                          <Button variant="outline" size="sm" onClick={() => {
                            if (trigger) {
                              setTriggerEdit(trigger);
                              setTriggerForm({ eventType: trigger.eventType, label: trigger.label || "", description: trigger.description || "", isEnabled: trigger.isEnabled, recipientType: trigger.recipientType || "Customer", templateBody: trigger.templateBody || "" });
                            } else {
                              setTriggerEdit(null);
                              setTriggerForm({ eventType: evt.eventType, label: evt.label, description: evt.description, isEnabled: true, recipientType: evt.eventType === "SalesConfirmation" || evt.eventType === "FinancialCollection" ? "Customer" : evt.eventType === "InventoryIngestion" ? "Supplier" : "Employee", templateBody: "" });
                            }
                            setTriggerDialog(true);
                          }}>
                            <Pencil className="w-3 h-3 mr-1" /> {trigger ? "Edit" : "Create"}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* Trigger Create/Edit Dialog */}
          <Dialog open={triggerDialog} onOpenChange={setTriggerDialog}>
            <DialogContent className="max-w-[95vw] sm:max-w-lg">
              <DialogHeader><DialogTitle>{triggerEdit ? "Edit" : "Create"} Notification Trigger</DialogTitle><DialogDescription>Configure automated SMS trigger for business events</DialogDescription></DialogHeader>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Event Type</Label><Select value={triggerForm.eventType} onValueChange={v => setTriggerForm({ ...triggerForm, eventType: v })} disabled={!!triggerEdit}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="SalesConfirmation">Sales Confirmation</SelectItem><SelectItem value="FinancialCollection">Financial Collection</SelectItem><SelectItem value="InventoryIngestion">Inventory Ingestion</SelectItem><SelectItem value="HRLifecycle">HR Lifecycle</SelectItem></SelectContent></Select></div>
                  <div><Label>Recipient Type</Label><Select value={triggerForm.recipientType} onValueChange={v => setTriggerForm({ ...triggerForm, recipientType: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Customer">Customer</SelectItem><SelectItem value="Dealer">Dealer</SelectItem><SelectItem value="Supplier">Supplier</SelectItem><SelectItem value="Employee">Employee</SelectItem><SelectItem value="Custom">Custom</SelectItem></SelectContent></Select></div>
                </div>
                <div><Label>Label</Label><Input value={triggerForm.label} onChange={e => setTriggerForm({ ...triggerForm, label: e.target.value })} placeholder="e.g. Sale Confirmation SMS" /></div>
                <div><Label>Description</Label><Input value={triggerForm.description} onChange={e => setTriggerForm({ ...triggerForm, description: e.target.value })} placeholder="Optional description" /></div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <Label>Template Body *</Label>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-muted-foreground">Enabled</Label>
                      <Switch checked={triggerForm.isEnabled} onCheckedChange={checked => setTriggerForm({ ...triggerForm, isEnabled: checked })} />
                    </div>
                  </div>
                  <Textarea value={triggerForm.templateBody} onChange={e => setTriggerForm({ ...triggerForm, templateBody: e.target.value })} rows={4} placeholder="Dear {{customerName}}, your order {{invoiceNo}} of {{amount}} has been confirmed." />
                  <p className="text-xs text-muted-foreground mt-1">
                    {triggerForm.eventType === "SalesConfirmation" && "Available: {{customerName}}, {{invoiceNo}}, {{amount}}, {{date}}, {{productSummary}}"}
                    {triggerForm.eventType === "FinancialCollection" && "Available: {{clientName}}, {{amount}}, {{paymentMethod}}, {{date}}, {{receiptRef}}"}
                    {triggerForm.eventType === "InventoryIngestion" && "Available: {{supplierName}}, {{productName}}, {{quantity}}, {{godownName}}, {{date}}, {{referenceNo}}"}
                    {triggerForm.eventType === "HRLifecycle" && "Available: {{employeeName}}, {{eventType}}, {{details}}, {{companyName}}"}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTriggerDialog(false)}>Cancel</Button>
                <Button disabled={triggerSaving} onClick={async () => {
                  if (!triggerForm.templateBody) { toast({ title: "Error", description: "Template body is required", variant: "destructive" }); return; }
                  setTriggerSaving(true);
                  try {
                    if (triggerEdit) {
                      await apiFetch(`/api/sms-notification-triggers/${triggerEdit.id}`, { method: "PUT", body: JSON.stringify(triggerForm) });
                      toast({ title: "Updated", description: "Notification trigger updated" });
                    } else {
                      await apiFetch("/api/sms-notification-triggers", { method: "POST", body: JSON.stringify(triggerForm) });
                      toast({ title: "Created", description: "Notification trigger created" });
                    }
                    setTriggerDialog(false); loadData();
                  } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); } finally { setTriggerSaving(false); }
                }}>{triggerSaving ? "Saving..." : "Save Trigger"}</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
        )}
      </Tabs>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog} onOpenChange={setDeleteDialog}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Confirm Deactivation
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate this {deleteTarget?.type === "bill" ? "SMS bill" : deleteTarget?.type === "settings" ? "SMS configuration" : "record"}? It will be marked as inactive and hidden from views. An administrator can restore it later if needed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => { setDeleteDialog(false); setDeleteTarget(null); }}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>
              Deactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
