"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AlertTriangle, Building2, FileText, Hash, Gauge,
  Download, Upload, FileDown, RefreshCw, Plus, Trash2,
  Edit, Eye, Shield, CheckCircle, X, Save, Settings,
  Printer, Mail, DollarSign, Percent, Palette, Search,
  Database, Zap, Trash, RotateCcw, Info, Code,
  Image as ImageIcon, Phone, Globe, Receipt, StickyNote,
  HardDrive, Activity, Server, Cpu, MemoryStick, Clock,
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
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF, exportToCSV, importFromCSV,
  sanitizeCurrencyValue,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef, CompanyProfile } from "@/lib/export-utils";
import ImageUploadField from "@/components/erp/ui/ImageUploadField";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const settingsCurrencyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const settingsNumberFmt = new Intl.NumberFormat("en-US");

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${settingsCurrencyFmt.format(Number(v))}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") return settingsNumberFmt.format(Number(v));
  return String(v);
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
    if (res.status === 401) { localStorage.removeItem("ems_auth"); window.location.reload(); }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

/** Validate Bangladesh phone number with +880 prefix */
function validateBDPhone(phone: string): { valid: boolean; message: string } {
  if (!phone) return { valid: true, message: "" };
  const stripped = phone.replace(/[\s\-()]/g, "");
  if (/^\+?880\d{9,10}$/.test(stripped) || /^01\d{9}$/.test(stripped)) {
    return { valid: true, message: "" };
  }
  return { valid: false, message: "Phone must use Bangladesh format: +880XXXXXXXXXX or 01XXXXXXXXX" };
}

/** Convert file to base64 data URL */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// AUTH
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
  const loadAuth = useCallback(() => {
    try {
      const stored = localStorage.getItem("ems_auth");
      if (stored) { const parsed = JSON.parse(stored); authState = { isAuthenticated: true, user: parsed.user }; }
      else { authState = { isAuthenticated: false, user: null }; }
    } catch { authState = { isAuthenticated: false, user: null }; }
    authListeners.forEach(l => l());
  }, []);
  useEffect(() => { loadAuth(); }, [loadAuth]);
  return authState;
}

// ============================================================
// TYPES
// ============================================================

interface SystemConfigGroupPageProps {
  initialTab?: string;
}

interface SystemConfig {
  id: string;
  configKey: string;
  configValue: string;
  configType: string;
  category: string;
  description: string | null;
  isActive: boolean;
}

interface CompanyData {
  id: string;
  code: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo: string | null;
  brandLogo: string | null;
  mobile: string | null;
  website: string | null;
  vatNumber: string | null;
  tradeLicense: string | null;
  invoicePrefix: string | null;
  thankYouMsg: string | null;
  systemNote: string | null;
  showBarcode: boolean;
  showPayInWord: boolean;
  logoWidth: number;
  logoHeight: number;
  isActive: boolean;
}

interface InvoiceTemplate {
  id: string;
  code: string;
  name: string;
  templateType: string;
  subject: string | null;
  headerHtml: string | null;
  bodyHtml: string | null;
  footerHtml: string | null;
  cssStyles: string | null;
  paperSize: string;
  orientation: string;
  defaultPrinter: string | null;
  companyName: string | null;
  showLogo: boolean;
  showBrandLogo: boolean;
  showMobile: boolean;
  showAddress: boolean;
  showVatNumber: boolean;
  showTradeLicense: boolean;
  showCustomerCode: boolean;
  showPrevDue: boolean;
  showTotalDue: boolean;
  showRemindDate: boolean;
  showModel: boolean;
  showColor: boolean;
  showDescription: boolean;
  showMRP: boolean;
  showDiscountAmt: boolean;
  showUnitPrice: boolean;
  showDiscountPct: boolean;
  showPPDiscount: boolean;
  showAdjustment: boolean;
  showDeliveryCost: boolean;
  showPaymentDetails: boolean;
  showCustomerSignature: boolean;
  showPreparedBy: boolean;
  showCheckedBy: boolean;
  showAuthorizedBy: boolean;
  showPrintedBy: boolean;
  showSalesPerson: boolean;
  showPrintDate: boolean;
  termsAndConditions: string | null;
  customFooterNote: string | null;
  isActive: boolean;
}

interface NumberFormat {
  id: string;
  code: string;
  moduleKey: string;
  prefix: string;
  paddingLength: number;
  nextSequence: number;
  resetYearly: boolean;
  separator: string | null;
  dateFormat: string | null;
  isActive: boolean;
}

// Category icon and color map
const CATEGORY_META: Record<string, { icon: React.ElementType; color: string }> = {
  General: { icon: Settings, color: "text-blue-500" },
  Tax: { icon: Percent, color: "text-emerald-500" },
  Currency: { icon: DollarSign, color: "text-amber-500" },
  Printer: { icon: Printer, color: "text-purple-500" },
  Branding: { icon: Palette, color: "text-pink-500" },
  Email: { icon: Mail, color: "text-cyan-500" },
};

// Sensitive keys that VAT Auditor should not see values for
const PROFIT_SENSITIVE_PATTERNS = ["profit", "margin", "writeoff"];

function isProfitSensitive(key: string): boolean {
  return PROFIT_SENSITIVE_PATTERNS.some(s => key.toLowerCase().includes(s));
}

// 27 toggle field definitions for Invoice Templates
const TOGGLE_FIELDS: { key: keyof InvoiceTemplate; label: string; group: string }[] = [
  { key: "showLogo", label: "Logo", group: "Header" },
  { key: "showBrandLogo", label: "Brand Logo", group: "Header" },
  { key: "showMobile", label: "Mobile", group: "Header" },
  { key: "showAddress", label: "Address", group: "Header" },
  { key: "showVatNumber", label: "VAT Number", group: "Header" },
  { key: "showTradeLicense", label: "Trade License", group: "Header" },
  { key: "showCustomerCode", label: "Customer Code", group: "Metadata" },
  { key: "showPrevDue", label: "Previous Due", group: "Metadata" },
  { key: "showTotalDue", label: "Total Due", group: "Metadata" },
  { key: "showRemindDate", label: "Remind Date", group: "Metadata" },
  { key: "showModel", label: "Model Column", group: "Table Columns" },
  { key: "showColor", label: "Color Column", group: "Table Columns" },
  { key: "showDescription", label: "Description Column", group: "Table Columns" },
  { key: "showMRP", label: "MRP Column", group: "Table Columns" },
  { key: "showDiscountAmt", label: "Discount Amount", group: "Table Columns" },
  { key: "showUnitPrice", label: "Unit Price", group: "Table Columns" },
  { key: "showDiscountPct", label: "Discount %", group: "Summary" },
  { key: "showPPDiscount", label: "PP Discount", group: "Summary" },
  { key: "showAdjustment", label: "Adjustment", group: "Summary" },
  { key: "showDeliveryCost", label: "Delivery Cost", group: "Summary" },
  { key: "showPaymentDetails", label: "Payment Details", group: "Payment" },
  { key: "showCustomerSignature", label: "Customer Signature", group: "Footer" },
  { key: "showPreparedBy", label: "Prepared By", group: "Footer" },
  { key: "showCheckedBy", label: "Checked By", group: "Footer" },
  { key: "showAuthorizedBy", label: "Authorized By", group: "Footer" },
  { key: "showPrintedBy", label: "Printed By", group: "Footer" },
  { key: "showSalesPerson", label: "Sales Person", group: "Footer" },
];

// All 28 toggle fields including showPrintDate
const ALL_TOGGLE_FIELDS = [...TOGGLE_FIELDS, { key: "showPrintDate" as keyof InvoiceTemplate, label: "Print Date", group: "Footer" }];

const TEMPLATE_TYPES = ["Invoice", "Receipt", "Email", "CreditMemo", "DebitNote", "Statement"];

// ============================================================
// 403 FORBIDDEN PAGE
// ============================================================

function ForbiddenPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="h-20 w-20 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
        <AlertTriangle className="h-10 w-10 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold text-red-600 dark:text-red-400">403 Forbidden</h1>
      <p className="text-slate-600 dark:text-slate-400 text-center max-w-md">
        Access Denied. System Settings are restricted to Admin and Manager roles.
      </p>
    </div>
  );
}

// ============================================================
// TAB 1: COMPANY SETTINGS
// ============================================================

function CompanySettingsTab({ isVatAuditor, userRole }: { isVatAuditor: boolean; userRole: UserRole }) {
  const { toast } = useToast();
  const [company, setCompany] = useState<CompanyData | null>(null);
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});
  const [companyEdits, setCompanyEdits] = useState<Partial<CompanyData>>({});
  const [phoneError, setPhoneError] = useState("");
  const [mobileError, setMobileError] = useState("");

  // Company branding is Admin-only for editing; Manager/VAT Auditor/other roles are read-only
  const isAdmin = userRole === "admin";
  const canMutateBranding = isAdmin && !isVatAuditor;
  // System configs can still be mutated by admin or manager
  const canMutateConfigs = (userRole === "admin" || userRole === "manager") && !isVatAuditor;

  // Load company data via company-branding API (single source of truth)
  const loadCompany = useCallback(async () => {
    try {
      const result = await apiFetch("/api/company-branding");
      if (result.company) {
        // Map the branding API response to CompanyData format
        const c = result.company;
        setCompany({
          id: c.id,
          code: "",
          name: c.name || "",
          address: c.address || null,
          phone: c.phone || null,
          email: c.email || null,
          logo: c.logo || null,
          brandLogo: c.brandLogo || null,
          mobile: c.mobile || null,
          website: null,
          vatNumber: c.vatNumber || null,
          tradeLicense: c.tradeLicense || null,
          invoicePrefix: c.invoicePrefix || null,
          thankYouMsg: c.thankYouMsg || null,
          systemNote: c.systemNote || null,
          showBarcode: c.showBarcode ?? true,
          showPayInWord: c.showPayInWord ?? true,
          logoWidth: c.logoWidth ?? 30,
          logoHeight: c.logoHeight ?? 20,
          isActive: true,
        });
        setCompanyEdits({});
      }
    } catch (e: any) {
      console.error("Failed to load company branding:", e);
    }
  }, []);

  // Load system configs
  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/system-config");
      const configsList = result.configs || result || [];
      setConfigs(Array.isArray(configsList) ? configsList : []);
      const vals: Record<string, string> = {};
      configsList.forEach((c: SystemConfig) => { vals[c.configKey] = c.configValue; });
      setEditedValues(vals);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadCompany(); loadConfigs(); }, [loadCompany, loadConfigs]);

  // Group by category
  const groupedConfigs = useMemo(() => {
    const groups: Record<string, SystemConfig[]> = {};
    configs.forEach(c => {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    });
    return groups;
  }, [configs]);

  const categories = Object.keys(groupedConfigs).sort();

  // Save company branding via dedicated branding API (Admin-only)
  const handleSaveCompany = async () => {
    if (!company) return;
    const phoneVal = companyEdits.phone !== undefined ? companyEdits.phone : company.phone;
    const mobileVal = companyEdits.mobile !== undefined ? companyEdits.mobile : company.mobile;
    if (phoneVal) {
      const v = validateBDPhone(phoneVal);
      if (!v.valid) { setPhoneError(v.message); return; }
    }
    if (mobileVal) {
      const v = validateBDPhone(mobileVal);
      if (!v.valid) { setMobileError(v.message); return; }
    }
    setPhoneError("");
    setMobileError("");
    setSavingCompany(true);
    try {
      await apiFetch("/api/company-branding", {
        method: "PUT",
        body: JSON.stringify(companyEdits),
      });
      toast({ title: "Saved", description: "Company branding saved successfully" });
      loadCompany();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingCompany(false);
    }
  };

  // Save config category
  const handleSaveCategory = async (category: string) => {
    setSavingCategory(category);
    try {
      const categoryConfigs = groupedConfigs[category];
      for (const config of categoryConfigs) {
        const newValue = editedValues[config.configKey];
        if (newValue !== config.configValue) {
          await apiFetch(`/api/system-config?configKey=${encodeURIComponent(config.configKey)}`, {
            method: "PUT",
            body: JSON.stringify({ configValue: newValue }),
          });
        }
      }
      toast({ title: "Saved", description: `${category} settings saved successfully` });
      loadConfigs();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSavingCategory(null);
    }
  };

  // Export handlers
  const handleExportPDF = async () => {
    try {
      let companyProfile: CompanyProfile | undefined;
      try {
        const brandingRes = await apiFetch("/api/company-profile");
        companyProfile = brandingRes.profile || undefined;
      } catch {}
      const columns: ExportColumnDef[] = [
        { key: "configKey", label: "Key", type: "text" },
        { key: "configValue", label: "Value", type: "text" },
        { key: "configType", label: "Type", type: "text" },
        { key: "category", label: "Category", type: "text" },
        { key: "description", label: "Description", type: "text" },
      ];
      const exportData = configs.map(c => ({
        ...c,
        configValue: isVatAuditor && isProfitSensitive(c.configKey) ? "N/A (Audit Mode)" : c.configValue,
      }));
      const userName = authState.user?.displayName || authState.user?.name || "System";
      exportToPDF({
        title: "Company Settings",
        subtitle: `Total: ${configs.length} configurations`,
        columns,
        data: exportData,
        isVatAuditor,
        company: companyProfile,
        systemNotice: "This document contains system configuration data. Handle with care.",
        financialFooter: {
          preparedBy: userName,
          checkedBy: "",
          authorizedBy: "",
          printedBy: userName || "System",
        },
      });
      toast({ title: "PDF Exported", description: "Company settings data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "configKey", label: "Key", type: "text" },
        { key: "configValue", label: "Value", type: "text" },
        { key: "configType", label: "Type", type: "text" },
        { key: "category", label: "Category", type: "text" },
        { key: "description", label: "Description", type: "text" },
        { key: "isActive", label: "Active", type: "boolean" },
      ];
      const exportData = configs.map(c => ({
        ...c,
        configValue: isVatAuditor && isProfitSensitive(c.configKey) ? "N/A (Audit Mode)" : c.configValue,
      }));
      exportToCSV({ title: "Company Settings", columns, data: exportData, isVatAuditor, vatMaskedColumns: [] });
      toast({ title: "CSV Exported", description: "Company settings data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = () => {
    importFromCSV({
      apiPath: "/api/system-config",
      formFields: [
        { key: "configKey", label: "Key", type: "text", required: true },
        { key: "configValue", label: "Value", type: "text", required: true },
        { key: "configType", label: "Type", type: "text" },
        { key: "category", label: "Category", type: "text" },
        { key: "description", label: "Description", type: "textarea" },
      ] as ExportFieldDef[],
    }).then(result => {
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadConfigs();
    }).catch((e: any) => {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    });
  };

  const renderConfigField = (config: SystemConfig) => {
    const value = editedValues[config.configKey] ?? config.configValue;
    const sensitive = isVatAuditor && isProfitSensitive(config.configKey);
    const disabled = !canMutateConfigs || sensitive;
    if (sensitive) {
      return <Input value="N/A (Audit Mode)" disabled className="bg-slate-50 dark:bg-slate-800 text-slate-400" />;
    }
    if (config.configType === "boolean") {
      return (
        <div className="flex items-center gap-2">
          <Switch checked={value === "true"} onCheckedChange={(checked) => setEditedValues(prev => ({ ...prev, [config.configKey]: String(checked) }))} disabled={disabled} />
          <span className="text-sm text-slate-600 dark:text-slate-400">{value === "true" ? "Enabled" : "Disabled"}</span>
        </div>
      );
    }
    if (config.configType === "number") {
      return <Input type="number" value={value} onChange={(e) => setEditedValues(prev => ({ ...prev, [config.configKey]: e.target.value }))} disabled={disabled} />;
    }
    if (config.configType === "json") {
      return <Textarea value={value} onChange={(e) => setEditedValues(prev => ({ ...prev, [config.configKey]: e.target.value }))} disabled={disabled} rows={3} className="font-mono text-xs" />;
    }
    return <Input type="text" value={value} onChange={(e) => setEditedValues(prev => ({ ...prev, [config.configKey]: e.target.value }))} disabled={disabled} />;
  };

  const getCompanyValue = (field: keyof CompanyData) => {
    return companyEdits[field] !== undefined ? companyEdits[field] : company?.[field] ?? "";
  };

  // Compute effective values for PDF preview
  const effectiveLogo = companyEdits.logo !== undefined ? companyEdits.logo : company?.logo;
  const effectiveBrandLogo = companyEdits.brandLogo !== undefined ? companyEdits.brandLogo : company?.brandLogo;
  const effectiveName = companyEdits.name !== undefined ? companyEdits.name : company?.name || "";
  const effectiveAddress = companyEdits.address !== undefined ? companyEdits.address : company?.address || "";
  const effectiveMobile = companyEdits.mobile !== undefined ? companyEdits.mobile : company?.mobile || "";
  const effectiveVatNumber = companyEdits.vatNumber !== undefined ? companyEdits.vatNumber : company?.vatNumber || "";
  const effectiveThankYouMsg = companyEdits.thankYouMsg !== undefined ? companyEdits.thankYouMsg : company?.thankYouMsg || "Thank You Come Again.";

  // Compute preview dimensions (avoid 'as' cast inside template literal JSX)
  const currentLogoWidth = (companyEdits.logoWidth !== undefined ? companyEdits.logoWidth : company?.logoWidth) || 30;
  const currentLogoHeight = (companyEdits.logoHeight !== undefined ? companyEdits.logoHeight : company?.logoHeight) || 20;
  const previewLogoWidthPx = `${Math.min(currentLogoWidth * 2.5, 100)}px`;
  const previewLogoHeightPx = `${Math.min(currentLogoHeight * 2.5, 65)}px`;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-1" /> Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <FileDown className="h-4 w-4 mr-1" /> Export PDF
        </Button>
        {canMutateConfigs && (
          <Button variant="outline" size="sm" onClick={handleImportCSV}>
            <Upload className="h-4 w-4 mr-1" /> Import CSV
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => { loadCompany(); loadConfigs(); }}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Read-Only Banner for Non-Admin Users */}
      {!isAdmin && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            {isVatAuditor
              ? "VAT AUDIT MODE — Profit/margin/writeoff configurations are masked. You can view but not modify settings."
              : "READ-ONLY MODE — Company branding can only be modified by Admin users. Contact your administrator to request changes."}
          </span>
        </div>
      )}

      {/* ============================================================
          SECTION 1: COMPANY IDENTITY
          ============================================================ */}
      {company && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-emerald-400" />
              Company Identity
              {company.code && <Badge variant="secondary" className="ml-2 bg-white/10 text-white/70 text-xs">{company.code}</Badge>}
              {!canMutateBranding && (
                <Badge variant="outline" className="ml-auto border-amber-400 text-amber-400 text-xs">Read Only</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Company Name */}
              <div className="space-y-1.5 lg:col-span-1">
                <Label className="text-sm font-medium">Company Name</Label>
                <Input
                  value={getCompanyValue("name") as string}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, name: e.target.value }))}
                  disabled={!canMutateBranding}
                  placeholder="Your Company Name"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">Appears on all PDF headers and invoices</p>
              </div>

              {/* Company Logo */}
              <div className="space-y-1.5 lg:col-span-1">
                <ImageUploadField
                  value={effectiveLogo || null}
                  onChange={(base64) => setCompanyEdits(prev => ({ ...prev, logo: base64 }))}
                  label="Company Logo"
                  placeholder="Drop company logo here or click to browse"
                  maxSizeMB={5}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">Primary logo for invoice headers</p>
              </div>

              {/* Brand Logo */}
              <div className="space-y-1.5 lg:col-span-1">
                <ImageUploadField
                  value={effectiveBrandLogo || null}
                  onChange={(base64) => setCompanyEdits(prev => ({ ...prev, brandLogo: base64 }))}
                  label="Brand Logo"
                  placeholder="Drop brand logo here or click to browse"
                  maxSizeMB={5}
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">Secondary logo (right-aligned on invoices)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          SECTION 2: COMPANY ADDRESS
          ============================================================ */}
      {company && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Globe className="h-4 w-4 text-cyan-400" />
              Company Address & Contact
              {!canMutateBranding && (
                <Badge variant="outline" className="ml-auto border-amber-400 text-amber-400 text-xs">Read Only</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label className="text-sm font-medium">Full Address</Label>
                <Textarea
                  value={getCompanyValue("address") as string}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, address: e.target.value }))}
                  disabled={!canMutateBranding}
                  rows={2}
                  placeholder="Street, City, State, Postal Code, Country"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Phone
                </Label>
                <Input
                  value={getCompanyValue("phone") as string}
                  onChange={(e) => { setCompanyEdits(prev => ({ ...prev, phone: e.target.value })); const v = validateBDPhone(e.target.value); setPhoneError(v.valid ? "" : v.message); }}
                  disabled={!canMutateBranding}
                  placeholder="+880XXXXXXXXXX"
                />
                {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Phone className="h-3 w-3" /> Mobile
                </Label>
                <Input
                  value={getCompanyValue("mobile") as string}
                  onChange={(e) => { setCompanyEdits(prev => ({ ...prev, mobile: e.target.value })); const v = validateBDPhone(e.target.value); setMobileError(v.valid ? "" : v.message); }}
                  disabled={!canMutateBranding}
                  placeholder="+880XXXXXXXXXX"
                />
                {mobileError && <p className="text-xs text-red-500">{mobileError}</p>}
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Mail className="h-3 w-3" /> Email
                </Label>
                <Input
                  type="email"
                  value={getCompanyValue("email") as string}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, email: e.target.value }))}
                  disabled={!canMutateBranding}
                  placeholder="info@company.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Globe className="h-3 w-3" /> Website
                </Label>
                <Input
                  value={getCompanyValue("website") as string}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, website: e.target.value }))}
                  disabled={!canMutateBranding}
                  placeholder="https://www.company.com"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          SECTION 3: LEGAL INFORMATION
          ============================================================ */}
      {company && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Receipt className="h-4 w-4 text-amber-400" />
              Legal Information
              {!canMutateBranding && (
                <Badge variant="outline" className="ml-auto border-amber-400 text-amber-400 text-xs">Read Only</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">BIN / VAT Number</Label>
                <Input
                  value={getCompanyValue("vatNumber") as string}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, vatNumber: e.target.value }))}
                  disabled={!canMutateBranding}
                  placeholder="e.g. 1234567890"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">Business Identification Number for tax purposes</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Trade License Number</Label>
                <Input
                  value={getCompanyValue("tradeLicense") as string}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, tradeLicense: e.target.value }))}
                  disabled={!canMutateBranding}
                  placeholder="e.g. TRD-123456"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">Official trade license registration number</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          SECTION 4: INVOICE CUSTOMIZATION
          ============================================================ */}
      {company && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-pink-400" />
              Invoice Customization
              {!canMutateBranding && (
                <Badge variant="outline" className="ml-auto border-amber-400 text-amber-400 text-xs">Read Only</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Invoice Prefix</Label>
                <Input
                  value={getCompanyValue("invoicePrefix") as string}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, invoicePrefix: e.target.value }))}
                  disabled={!canMutateBranding}
                  placeholder="e.g. EM"
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">Prepended to all invoice numbers</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-sm font-medium">Thank You Message</Label>
                <Input
                  value={getCompanyValue("thankYouMsg") as string}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, thankYouMsg: e.target.value }))}
                  disabled={!canMutateBranding}
                  placeholder="Thank You Come Again."
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">Displayed centered and bold in PDF footer</p>
              </div>
              <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                <Label className="text-sm font-medium">System Note / Disclaimer</Label>
                <Textarea
                  value={getCompanyValue("systemNote") as string}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, systemNote: e.target.value }))}
                  disabled={!canMutateBranding}
                  rows={2}
                  placeholder="This is a system generated invoice no need to seal & signature."
                />
                <p className="text-xs text-slate-500 dark:text-slate-400">Italic disclaimer at the bottom of all PDF invoices</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          SECTION 5: DISPLAY OPTIONS
          ============================================================ */}
      {company && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Palette className="h-4 w-4 text-violet-400" />
              Display Options
              {!canMutateBranding && (
                <Badge variant="outline" className="ml-auto border-amber-400 text-amber-400 text-xs">Read Only</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Logo Width (mm)</Label>
                <Input
                  type="number"
                  value={getCompanyValue("logoWidth") as number}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, logoWidth: parseFloat(e.target.value) || 30 }))}
                  disabled={!canMutateBranding}
                  min={10}
                  max={80}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Logo Height (mm)</Label>
                <Input
                  type="number"
                  value={getCompanyValue("logoHeight") as number}
                  onChange={(e) => setCompanyEdits(prev => ({ ...prev, logoHeight: parseFloat(e.target.value) || 20 }))}
                  disabled={!canMutateBranding}
                  min={10}
                  max={60}
                />
              </div>
              <div className="flex items-center gap-3 pt-5">
                <Switch
                  checked={companyEdits.showBarcode !== undefined ? companyEdits.showBarcode : company.showBarcode}
                  onCheckedChange={(checked) => setCompanyEdits(prev => ({ ...prev, showBarcode: checked }))}
                  disabled={!canMutateBranding}
                />
                <Label className="text-sm font-medium">Show Barcode on Invoices</Label>
              </div>
              <div className="flex items-center gap-3 pt-5">
                <Switch
                  checked={companyEdits.showPayInWord !== undefined ? companyEdits.showPayInWord : company.showPayInWord}
                  onCheckedChange={(checked) => setCompanyEdits(prev => ({ ...prev, showPayInWord: checked }))}
                  disabled={!canMutateBranding}
                />
                <Label className="text-sm font-medium">Show Amount in Words</Label>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============================================================
          SECTION 6: PDF HEADER PREVIEW
          ============================================================ */}
      {company && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Eye className="h-4 w-4 text-sky-400" />
              PDF Header Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <div className="border border-slate-300 dark:border-slate-600 rounded-lg p-4 bg-white dark:bg-slate-900">
              {/* Mini preview of PDF header */}
              <div className="flex items-start gap-3">
                {/* Logo preview */}
                <div className="shrink-0" style={{ width: previewLogoWidthPx, height: previewLogoHeightPx }}>
                  {effectiveLogo ? (
                    <img src={effectiveLogo} alt="Logo Preview" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full border border-dashed border-slate-300 dark:border-slate-600 rounded flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-slate-400" />
                    </div>
                  )}
                </div>
                {/* Company info preview */}
                <div className="flex-1 min-w-0 space-y-0.5">
                  <p className="font-bold text-[#0a1628] dark:text-white text-sm truncate">{effectiveName || "Company Name"}</p>
                  {effectiveAddress && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">{effectiveAddress}</p>
                  )}
                  {effectiveMobile && (
                    <p className="text-xs text-slate-600 dark:text-slate-400 truncate">Mobile: {effectiveMobile}</p>
                  )}
                  {effectiveVatNumber && (
                    <p className="text-xs text-slate-500 dark:text-slate-500 truncate">VAT: {effectiveVatNumber}</p>
                  )}
                </div>
                {/* Brand logo preview */}
                <div className="shrink-0" style={{ width: previewLogoWidthPx, height: previewLogoHeightPx }}>
                  {effectiveBrandLogo ? (
                    <img src={effectiveBrandLogo} alt="Brand Logo Preview" className="w-full h-full object-contain" />
                  ) : (
                    <div className="w-full h-full border border-dashed border-slate-300 dark:border-slate-600 rounded flex items-center justify-center">
                      <ImageIcon className="h-4 w-4 text-slate-400" />
                    </div>
                  )}
                </div>
              </div>
              {/* Separator */}
              <div className="border-t-2 border-[#0a1628] dark:border-white/30 mt-3" />
              {/* Invoice title placeholder */}
              <p className="text-center font-bold text-[#0a1628] dark:text-white text-xs mt-2">Sales Invoice</p>
              <div className="border-t border-[#0a1628]/30 dark:border-white/10 mt-2" />
              {/* Footer preview */}
              <div className="mt-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                <p className="text-center font-bold text-xs text-slate-700 dark:text-slate-300">{effectiveThankYouMsg}</p>
              </div>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 flex items-center gap-1">
              <Info className="h-3 w-3" />
              This is a simplified preview. The actual PDF output may differ slightly.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Save Company Branding Button */}
      {company && canMutateBranding && (
        <div className="flex justify-end">
          <Button onClick={handleSaveCompany} disabled={savingCompany} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            {savingCompany ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-1" /> Save Company Branding</>}
          </Button>
        </div>
      )}

      {/* ============================================================
          SYSTEM CONFIGURATION GROUPS (below company branding)
          ============================================================ */}
      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
          Loading configurations...
        </div>
      ) : (
        categories.map(category => {
          const meta = CATEGORY_META[category] || { icon: Settings, color: "text-slate-500" };
          const CategoryIcon = meta.icon;
          return (
            <Card key={category} className="border-slate-200 dark:border-slate-700">
              <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <CategoryIcon className={`h-4 w-4 ${meta.color}`} />
                  {category}
                  <Badge variant="secondary" className="ml-2 bg-white/10 text-white/70 text-xs">
                    {groupedConfigs[category].length} settings
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-4 space-y-4">
                {groupedConfigs[category].map(config => (
                  <div key={config.id} className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-2 items-start">
                    <div>
                      <Label className="text-sm font-medium text-slate-900 dark:text-white">
                        {config.configKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </Label>
                      {config.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{config.description}</p>
                      )}
                    </div>
                    {renderConfigField(config)}
                  </div>
                ))}
                {canMutateConfigs && (
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => handleSaveCategory(category)} disabled={savingCategory === category} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                      {savingCategory === category ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Saving...</> : <><Save className="h-4 w-4 mr-1" /> Save {category}</>}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}

// ============================================================
// TAB 2: INVOICE TEMPLATES
// ============================================================

function InvoiceTemplatesTab({ isVatAuditor, userRole }: { isVatAuditor: boolean; userRole: UserRole }) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<InvoiceTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<InvoiceTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTemplate, setNewTemplate] = useState({
    name: "",
    templateType: "Invoice",
    subject: "",
    paperSize: "A4",
    orientation: "Portrait",
  });
  const [editorData, setEditorData] = useState({
    headerHtml: "",
    bodyHtml: "",
    footerHtml: "",
    cssStyles: "",
    termsAndConditions: "",
    customFooterNote: "",
  });
  const [toggleData, setToggleData] = useState<Record<string, boolean>>({});
  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  const canMutate = (userRole === "admin" || userRole === "manager") && !isVatAuditor;
  const isAdmin = userRole === "admin";

  const loadTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/invoice-templates");
      const list = result.templates || result || [];
      setTemplates(Array.isArray(list) ? list : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const q = search.toLowerCase();
    return templates.filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.code.toLowerCase().includes(q) ||
      t.templateType.toLowerCase().includes(q)
    );
  }, [templates, search]);

  const openEditor = (template: InvoiceTemplate) => {
    setSelectedTemplate(template);
    setEditorData({
      headerHtml: template.headerHtml || "",
      bodyHtml: template.bodyHtml || "",
      footerHtml: template.footerHtml || "",
      cssStyles: template.cssStyles || "",
      termsAndConditions: template.termsAndConditions || "",
      customFooterNote: template.customFooterNote || "",
    });
    const toggles: Record<string, boolean> = {};
    ALL_TOGGLE_FIELDS.forEach(f => {
      toggles[f.key] = template[f.key] as boolean;
    });
    setToggleData(toggles);
    setEditorOpen(true);
  };

  const openToggleEditor = (template: InvoiceTemplate) => {
    setSelectedTemplate(template);
    const toggles: Record<string, boolean> = {};
    ALL_TOGGLE_FIELDS.forEach(f => {
      toggles[f.key] = template[f.key] as boolean;
    });
    setToggleData(toggles);
    setToggleOpen(true);
  };

  const handleCreate = async () => {
    if (!newTemplate.name.trim()) {
      toast({ title: "Validation Error", description: "Template name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/invoice-templates", {
        method: "POST",
        body: JSON.stringify(newTemplate),
      });
      toast({ title: "Created", description: "Template created successfully" });
      setCreateOpen(false);
      setNewTemplate({ name: "", templateType: "Invoice", subject: "", paperSize: "A4", orientation: "Portrait" });
      loadTemplates();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEditor = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await apiFetch("/api/invoice-templates", {
        method: "PUT",
        body: JSON.stringify({
          id: selectedTemplate.id,
          ...editorData,
        }),
      });
      toast({ title: "Saved", description: "Template HTML/CSS updated successfully" });
      setEditorOpen(false);
      loadTemplates();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveToggles = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      await apiFetch("/api/invoice-templates", {
        method: "PUT",
        body: JSON.stringify({
          id: selectedTemplate.id,
          ...toggleData,
          termsAndConditions: editorData.termsAndConditions || null,
          customFooterNote: editorData.customFooterNote || null,
        }),
      });
      toast({ title: "Saved", description: "Template toggle settings updated successfully" });
      setToggleOpen(false);
      loadTemplates();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/invoice-templates?id=${id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Template deleted successfully" });
      setDeleteConfirm(null);
      loadTemplates();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const updatePreview = useCallback(() => {
    if (!previewIframeRef.current) return;
    const css = editorData.cssStyles || "";
    const html = `
      <!DOCTYPE html>
      <html>
      <head><style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 16px; color: #1e293b; font-size: 13px; }
        ${css}
      </style></head>
      <body>
        ${editorData.headerHtml || "<!-- No header -->"}
        <hr style="border-color: #e2e8f0; margin: 12px 0;" />
        ${editorData.bodyHtml || "<!-- No body -->"}
        <hr style="border-color: #e2e8f0; margin: 12px 0;" />
        ${editorData.footerHtml || "<!-- No footer -->"}
        ${editorData.termsAndConditions ? `<div style="margin-top:16px;padding:8px;border:1px solid #e2e8f0;border-radius:4px;"><strong>Terms & Conditions:</strong><br/>${editorData.termsAndConditions}</div>` : ""}
        ${editorData.customFooterNote ? `<div style="margin-top:8px;font-style:italic;color:#64748b;">${editorData.customFooterNote}</div>` : ""}
      </body>
      </html>
    `;
    const doc = previewIframeRef.current.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
    }
  }, [editorData]);

  useEffect(() => {
    if (editorOpen) {
      const timer = setTimeout(updatePreview, 300);
      return () => clearTimeout(timer);
    }
  }, [editorOpen, editorData, updatePreview]);

  // Export handlers
  const handleExportPDF = async () => {
    try {
      let companyProfile: CompanyProfile | undefined;
      try { const r = await apiFetch("/api/company-profile"); companyProfile = r.profile || undefined; } catch {}
      const columns: ExportColumnDef[] = [
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Name", type: "text" },
        { key: "templateType", label: "Type", type: "text" },
        { key: "paperSize", label: "Paper Size", type: "text" },
        { key: "orientation", label: "Orientation", type: "text" },
        { key: "isActive", label: "Active", type: "boolean" },
      ];
      const userName = authState.user?.displayName || authState.user?.name || "System";
      exportToPDF({
        title: "Invoice Templates",
        subtitle: `Total: ${filteredTemplates.length}`,
        columns,
        data: filteredTemplates,
        isVatAuditor,
        company: companyProfile,
        financialFooter: { preparedBy: userName, checkedBy: "", authorizedBy: "", printedBy: userName || "System" },
      });
      toast({ title: "PDF Exported", description: "Invoice templates data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Name", type: "text" },
        { key: "templateType", label: "Type", type: "text" },
        { key: "paperSize", label: "Paper Size", type: "text" },
        { key: "orientation", label: "Orientation", type: "text" },
        { key: "isActive", label: "Active", type: "boolean" },
      ];
      exportToCSV({ title: "Invoice Templates", columns, data: filteredTemplates, isVatAuditor });
      toast({ title: "CSV Exported", description: "Invoice templates data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = () => {
    importFromCSV({
      apiPath: "/api/invoice-templates",
      formFields: [
        { key: "name", label: "Name", type: "text", required: true },
        { key: "templateType", label: "Type", type: "text" },
        { key: "subject", label: "Subject", type: "text" },
        { key: "paperSize", label: "Paper Size", type: "text" },
        { key: "orientation", label: "Orientation", type: "text" },
      ] as ExportFieldDef[],
    }).then(result => {
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadTemplates();
    }).catch((e: any) => {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    });
  };

  // Group toggle fields by group
  const toggleGroups = useMemo(() => {
    const groups: Record<string, typeof ALL_TOGGLE_FIELDS> = {};
    ALL_TOGGLE_FIELDS.forEach(f => {
      if (!groups[f.group]) groups[f.group] = [];
      groups[f.group].push(f);
    });
    return groups;
  }, []);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates..." className="pl-8" />
        </div>
        {canMutate && (
          <Button onClick={() => setCreateOpen(true)} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4 mr-1" /> Create Template
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <FileDown className="h-4 w-4 mr-1" /> PDF
        </Button>
        {canMutate && (
          <Button variant="outline" size="sm" onClick={handleImportCSV}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={loadTemplates}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {isVatAuditor && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            VAT AUDIT MODE — Templates containing cost/profit placeholders are masked.
          </span>
        </div>
      )}

      {/* Templates Table */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  <TableHead className="text-white font-semibold">Code</TableHead>
                  <TableHead className="text-white font-semibold">Name</TableHead>
                  <TableHead className="text-white font-semibold">Type</TableHead>
                  <TableHead className="text-white font-semibold">Paper</TableHead>
                  <TableHead className="text-white font-semibold">Orientation</TableHead>
                  <TableHead className="text-white font-semibold">Active</TableHead>
                  <TableHead className="text-white font-semibold w-40">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading...</TableCell></TableRow>
                ) : filteredTemplates.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No templates found</TableCell></TableRow>
                ) : (
                  filteredTemplates.map((t, idx) => (
                    <TableRow key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{t.code}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-white">{t.name}</TableCell>
                      <TableCell><Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">{t.templateType}</Badge></TableCell>
                      <TableCell>{t.paperSize}</TableCell>
                      <TableCell>{t.orientation}</TableCell>
                      <TableCell>
                        <Badge variant={t.isActive ? "default" : "secondary"} className={t.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}>
                          {t.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEditor(t)} className="h-7 px-2" title="Edit HTML/CSS">
                            <Code className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => openToggleEditor(t)} className="h-7 px-2" title="Toggle Fields">
                            <Settings className="h-3.5 w-3.5 text-emerald-500" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(t.id)} className="h-7 px-2" title="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        Showing {filteredTemplates.length} of {templates.length} templates
      </div>

      {/* Create Template Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Invoice Template</DialogTitle>
            <DialogDescription>Create a new invoice template with HTML/CSS support</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Name <span className="text-red-500">*</span></Label>
              <Input value={newTemplate.name} onChange={(e) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g. Sales Invoice V2" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Template Type</Label>
              <Select value={newTemplate.templateType} onValueChange={(v) => setNewTemplate(prev => ({ ...prev, templateType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEMPLATE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Subject</Label>
              <Input value={newTemplate.subject} onChange={(e) => setNewTemplate(prev => ({ ...prev, subject: e.target.value }))} placeholder="e.g. Invoice {{invoiceNo}}" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Paper Size</Label>
                <Select value={newTemplate.paperSize} onValueChange={(v) => setNewTemplate(prev => ({ ...prev, paperSize: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A4">A4</SelectItem>
                    <SelectItem value="Letter">Letter</SelectItem>
                    <SelectItem value="Legal">Legal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Orientation</Label>
                <Select value={newTemplate.orientation} onValueChange={(v) => setNewTemplate(prev => ({ ...prev, orientation: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Portrait">Portrait</SelectItem>
                    <SelectItem value="Landscape">Landscape</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving ? "Creating..." : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template HTML/CSS Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template: {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>Customize the HTML template with placeholders. Preview updates in real-time.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1"><Code className="h-3.5 w-3.5" /> Header HTML</Label>
                <Textarea value={editorData.headerHtml} onChange={(e) => setEditorData(prev => ({ ...prev, headerHtml: e.target.value }))} rows={5} className="font-mono text-xs" disabled={!canMutate} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1"><Code className="h-3.5 w-3.5" /> Body HTML</Label>
                <Textarea value={editorData.bodyHtml} onChange={(e) => setEditorData(prev => ({ ...prev, bodyHtml: e.target.value }))} rows={8} className="font-mono text-xs" disabled={!canMutate} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1"><Code className="h-3.5 w-3.5" /> Footer HTML</Label>
                <Textarea value={editorData.footerHtml} onChange={(e) => setEditorData(prev => ({ ...prev, footerHtml: e.target.value }))} rows={5} className="font-mono text-xs" disabled={!canMutate} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1"><Palette className="h-3.5 w-3.5" /> CSS Styles</Label>
                <Textarea value={editorData.cssStyles} onChange={(e) => setEditorData(prev => ({ ...prev, cssStyles: e.target.value }))} rows={5} className="font-mono text-xs" disabled={!canMutate} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1"><StickyNote className="h-3.5 w-3.5" /> Terms & Conditions</Label>
                <Textarea value={editorData.termsAndConditions} onChange={(e) => setEditorData(prev => ({ ...prev, termsAndConditions: e.target.value }))} rows={3} className="text-xs" disabled={!canMutate} placeholder="Payment due within 30 days..." />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Custom Footer Note</Label>
                <Input value={editorData.customFooterNote} onChange={(e) => setEditorData(prev => ({ ...prev, customFooterNote: e.target.value }))} disabled={!canMutate} placeholder="Override system note..." />
              </div>
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-xs">
                <p className="font-semibold text-slate-900 dark:text-white mb-1">Available Placeholders:</p>
                <p className="text-slate-600 dark:text-slate-400">Header: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{company_name}}"}</code> <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{company_logo}}"}</code> <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{company_address}}"}</code></p>
                <p className="text-slate-600 dark:text-slate-400 mt-1">Body: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{invoice_no}}"}</code> <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{date}}"}</code> <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{customer_name}}"}</code> <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{items_table}}"}</code> <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{grand_total}}"}</code></p>
                <p className="text-slate-600 dark:text-slate-400 mt-1">Footer: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{bank_details}}"}</code> <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{terms}}"}</code></p>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Live Preview</Label>
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white">
                <iframe ref={previewIframeRef} className="w-full" style={{ height: "600px" }} title="Template Preview" sandbox="allow-same-origin" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditorOpen(false)}>Close</Button>
            {canMutate && (
              <Button onClick={handleSaveEditor} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {saving ? "Saving..." : <><Save className="h-4 w-4 mr-1" /> Save Template</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Toggle Fields Editor Dialog */}
      <Dialog open={toggleOpen} onOpenChange={setToggleOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Toggle Fields: {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>Control which fields appear on the invoice template.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {Object.entries(toggleGroups).map(([group, fields]) => (
              <div key={group}>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2 flex items-center gap-1">
                  <Receipt className="h-3.5 w-3.5 text-emerald-500" /> {group}
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {fields.map(f => (
                    <div key={f.key} className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
                      <Switch
                        checked={toggleData[f.key] ?? true}
                        onCheckedChange={(checked) => setToggleData(prev => ({ ...prev, [f.key]: checked }))}
                        disabled={!canMutate}
                      />
                      <Label className="text-xs">{f.label}</Label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <Separator />
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Terms & Conditions</Label>
              <Textarea
                value={editorData.termsAndConditions}
                onChange={(e) => setEditorData(prev => ({ ...prev, termsAndConditions: e.target.value }))}
                rows={3}
                disabled={!canMutate}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Custom Footer Note</Label>
              <Input
                value={editorData.customFooterNote}
                onChange={(e) => setEditorData(prev => ({ ...prev, customFooterNote: e.target.value }))}
                disabled={!canMutate}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setToggleOpen(false)}>Cancel</Button>
            {canMutate && (
              <Button onClick={handleSaveToggles} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {saving ? "Saving..." : <><Save className="h-4 w-4 mr-1" /> Save Toggles</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Permanently Remove Invoice Template</DialogTitle>
            <DialogDescription>Are you sure you want to permanently remove this invoice template? All associated HTML/CSS and toggle configurations will be lost. This action cannot be undone and the data cannot be recovered.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Permanently Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// TAB 3: NUMBER FORMATS
// ============================================================

function NumberFormatsTab({ isVatAuditor, userRole }: { isVatAuditor: boolean; userRole: UserRole }) {
  const { toast } = useToast();
  const [formats, setFormats] = useState<NumberFormat[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<NumberFormat | null>(null);
  const [saving, setSaving] = useState(false);
  const [newFormat, setNewFormat] = useState({ moduleKey: "", prefix: "", paddingLength: 5, nextSequence: 1, resetYearly: false, separator: "", dateFormat: "" });
  const [editFormat, setEditFormat] = useState<Partial<NumberFormat>>({});

  const canMutate = (userRole === "admin" || userRole === "manager") && !isVatAuditor;
  const isAdmin = userRole === "admin";

  const loadFormats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/number-formats");
      const list = result.formats || result || [];
      setFormats(Array.isArray(list) ? list : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadFormats(); }, [loadFormats]);

  // Generate preview string from format
  const getPreview = (f: NumberFormat | Partial<NumberFormat>) => {
    const prefix = f.prefix || "";
    const sep = f.separator || "";
    const pad = f.paddingLength || 5;
    const seq = f.nextSequence || 1;
    const padded = String(seq).padStart(pad, "0");
    return `${prefix}${sep}${padded}`;
  };

  const handleCreate = async () => {
    if (!newFormat.moduleKey.trim() || !newFormat.prefix.trim()) {
      toast({ title: "Validation Error", description: "Module Key and Prefix are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/api/number-formats", {
        method: "POST",
        body: JSON.stringify({
          ...newFormat,
          separator: newFormat.separator || null,
          dateFormat: newFormat.dateFormat || null,
        }),
      });
      toast({ title: "Created", description: "Number format created successfully" });
      setCreateOpen(false);
      setNewFormat({ moduleKey: "", prefix: "", paddingLength: 5, nextSequence: 1, resetYearly: false, separator: "", dateFormat: "" });
      loadFormats();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (format: NumberFormat) => {
    setSelectedFormat(format);
    setEditFormat({ ...format });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedFormat || !editFormat) return;
    setSaving(true);
    try {
      await apiFetch("/api/number-formats", {
        method: "PUT",
        body: JSON.stringify({
          id: selectedFormat.id,
          prefix: editFormat.prefix,
          paddingLength: editFormat.paddingLength,
          nextSequence: editFormat.nextSequence,
          resetYearly: editFormat.resetYearly,
          separator: editFormat.separator === "" ? null : editFormat.separator,
          dateFormat: editFormat.dateFormat === "" ? null : editFormat.dateFormat,
          isActive: editFormat.isActive,
        }),
      });
      toast({ title: "Saved", description: "Number format updated successfully" });
      setEditOpen(false);
      loadFormats();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleResetSequence = async (format: NumberFormat) => {
    try {
      await apiFetch("/api/number-formats", {
        method: "PUT",
        body: JSON.stringify({ id: format.id, nextSequence: 1 }),
      });
      toast({ title: "Sequence Reset", description: `${format.moduleKey} sequence reset to 1` });
      loadFormats();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/number-formats?id=${id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Number format deleted successfully" });
      setDeleteConfirm(null);
      loadFormats();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Export handlers
  const handleExportPDF = async () => {
    try {
      let companyProfile: CompanyProfile | undefined;
      try { const r = await apiFetch("/api/company-profile"); companyProfile = r.profile || undefined; } catch {}
      const columns: ExportColumnDef[] = [
        { key: "code", label: "Code", type: "text" },
        { key: "moduleKey", label: "Module", type: "text" },
        { key: "prefix", label: "Prefix", type: "text" },
        { key: "paddingLength", label: "Padding", type: "number" },
        { key: "nextSequence", label: "Next Seq", type: "number" },
        { key: "resetYearly", label: "Reset Yearly", type: "boolean" },
        { key: "preview", label: "Preview", type: "text" },
      ];
      const dataWithPreview = formats.map(f => ({ ...f, preview: getPreview(f) }));
      const userName = authState.user?.displayName || authState.user?.name || "System";
      exportToPDF({
        title: "Number Formats",
        subtitle: `Total: ${formats.length} format configurations`,
        columns,
        data: dataWithPreview,
        isVatAuditor,
        company: companyProfile,
        financialFooter: { preparedBy: userName, checkedBy: "", authorizedBy: "", printedBy: userName || "System" },
      });
      toast({ title: "PDF Exported", description: "Number formats data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "code", label: "Code", type: "text" },
        { key: "moduleKey", label: "Module", type: "text" },
        { key: "prefix", label: "Prefix", type: "text" },
        { key: "paddingLength", label: "Padding", type: "number" },
        { key: "nextSequence", label: "Next Seq", type: "number" },
        { key: "resetYearly", label: "Reset Yearly", type: "boolean" },
        { key: "preview", label: "Preview", type: "text" },
      ];
      const dataWithPreview = formats.map(f => ({ ...f, preview: getPreview(f) }));
      exportToCSV({ title: "Number Formats", columns, data: dataWithPreview, isVatAuditor });
      toast({ title: "CSV Exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = () => {
    importFromCSV({
      apiPath: "/api/number-formats",
      formFields: [
        { key: "moduleKey", label: "Module Key", type: "text", required: true },
        { key: "prefix", label: "Prefix", type: "text", required: true },
        { key: "paddingLength", label: "Padding", type: "number" },
        { key: "nextSequence", label: "Next Sequence", type: "number" },
        { key: "resetYearly", label: "Reset Yearly", type: "text" },
      ] as ExportFieldDef[],
    }).then(result => {
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadFormats();
    }).catch((e: any) => {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {canMutate && (
          <Button onClick={() => setCreateOpen(true)} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4 mr-1" /> Add Format
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <FileDown className="h-4 w-4 mr-1" /> PDF
        </Button>
        {canMutate && (
          <Button variant="outline" size="sm" onClick={handleImportCSV}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={loadFormats}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Number Formats Table */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  <TableHead className="text-white font-semibold">Code</TableHead>
                  <TableHead className="text-white font-semibold">Module</TableHead>
                  <TableHead className="text-white font-semibold">Prefix</TableHead>
                  <TableHead className="text-white font-semibold">Padding</TableHead>
                  <TableHead className="text-white font-semibold">Next Seq</TableHead>
                  <TableHead className="text-white font-semibold">Preview</TableHead>
                  <TableHead className="text-white font-semibold">Reset Yearly</TableHead>
                  <TableHead className="text-white font-semibold">Active</TableHead>
                  <TableHead className="text-white font-semibold w-36">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400"><RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" />Loading...</TableCell></TableRow>
                ) : formats.length === 0 ? (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-slate-400">No number formats found</TableCell></TableRow>
                ) : (
                  formats.map((f, idx) => (
                    <TableRow key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-mono text-xs">{f.code}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-white">{f.moduleKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}</TableCell>
                      <TableCell className="font-mono text-xs font-semibold text-emerald-600 dark:text-emerald-400">{f.prefix}</TableCell>
                      <TableCell>{f.paddingLength}</TableCell>
                      <TableCell>{f.nextSequence}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100">
                          {getPreview(f)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.resetYearly ? "default" : "secondary"} className={f.resetYearly ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 text-slate-500"}>
                          {f.resetYearly ? "Yes" : "No"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={f.isActive ? "default" : "secondary"} className={f.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500"}>
                          {f.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {canMutate && (
                            <Button variant="ghost" size="sm" onClick={() => openEdit(f)} className="h-7 px-2" title="Edit">
                              <Edit className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                          )}
                          {canMutate && (
                            <Button variant="ghost" size="sm" onClick={() => handleResetSequence(f)} className="h-7 px-2" title="Reset Sequence">
                              <RotateCcw className="h-3.5 w-3.5 text-amber-500" />
                            </Button>
                          )}
                          {isAdmin && (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(f.id)} className="h-7 px-2" title="Delete">
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 dark:text-slate-400">{formats.length} number format configurations</div>

      {/* Create Format Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Number Format</DialogTitle>
            <DialogDescription>Define a new document number format for a module.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Module Key <span className="text-red-500">*</span></Label>
              <Input value={newFormat.moduleKey} onChange={(e) => setNewFormat(prev => ({ ...prev, moduleKey: e.target.value.replace(/\s+/g, "_").toLowerCase() }))} placeholder="e.g. purchase_order" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Prefix <span className="text-red-500">*</span></Label>
              <Input value={newFormat.prefix} onChange={(e) => setNewFormat(prev => ({ ...prev, prefix: e.target.value }))} placeholder="e.g. PUR-" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Padding Length</Label>
                <Input type="number" value={newFormat.paddingLength} onChange={(e) => setNewFormat(prev => ({ ...prev, paddingLength: parseInt(e.target.value) || 5 }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Start Sequence</Label>
                <Input type="number" value={newFormat.nextSequence} onChange={(e) => setNewFormat(prev => ({ ...prev, nextSequence: parseInt(e.target.value) || 1 }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Separator (optional)</Label>
              <Input value={newFormat.separator} onChange={(e) => setNewFormat(prev => ({ ...prev, separator: e.target.value }))} placeholder="e.g. - or /" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={newFormat.resetYearly} onCheckedChange={(checked) => setNewFormat(prev => ({ ...prev, resetYearly: checked }))} />
              <Label className="text-sm font-medium">Reset Yearly</Label>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <Label className="text-sm font-medium text-slate-500">Preview</Label>
              <p className="font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-400 mt-1">{getPreview(newFormat)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving ? "Creating..." : "Create Format"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Format Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Number Format: {selectedFormat?.moduleKey}</DialogTitle>
            <DialogDescription>Update the number format configuration.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Prefix</Label>
              <Input value={editFormat.prefix || ""} onChange={(e) => setEditFormat(prev => ({ ...prev, prefix: e.target.value }))} disabled={!canMutate} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Padding Length</Label>
                <Input type="number" value={editFormat.paddingLength || 5} onChange={(e) => setEditFormat(prev => ({ ...prev, paddingLength: parseInt(e.target.value) || 5 }))} disabled={!canMutate} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">Next Sequence</Label>
                <Input type="number" value={editFormat.nextSequence || 1} onChange={(e) => setEditFormat(prev => ({ ...prev, nextSequence: parseInt(e.target.value) || 1 }))} disabled={!canMutate} />
                <p className="text-xs text-amber-600">Can only be increased, never decreased.</p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Separator</Label>
              <Input value={editFormat.separator || ""} onChange={(e) => setEditFormat(prev => ({ ...prev, separator: e.target.value }))} disabled={!canMutate} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Date Format</Label>
              <Input value={editFormat.dateFormat || ""} onChange={(e) => setEditFormat(prev => ({ ...prev, dateFormat: e.target.value }))} disabled={!canMutate} placeholder="e.g. YYYYMMDD" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={editFormat.resetYearly || false} onCheckedChange={(checked) => setEditFormat(prev => ({ ...prev, resetYearly: checked }))} disabled={!canMutate} />
              <Label className="text-sm font-medium">Reset Yearly</Label>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
              <Label className="text-sm font-medium text-slate-500">Preview</Label>
              <p className="font-mono text-lg font-semibold text-emerald-600 dark:text-emerald-400 mt-1">{getPreview(editFormat)}</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            {canMutate && (
              <Button onClick={handleSaveEdit} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
                {saving ? "Saving..." : <><Save className="h-4 w-4 mr-1" /> Save</>}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Permanently Remove Number Format</DialogTitle>
            <DialogDescription>Are you sure you want to permanently remove this number format? Documents using this format will no longer auto-increment. This action cannot be undone and the data cannot be recovered.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Permanently Remove</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// TAB 4: AUDIT TRAIL VIEWER
// ============================================================

function AuditTrailTab({ isVatAuditor, userRole }: { isVatAuditor: boolean; userRole: UserRole }) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterModule, setFilterModule] = useState<string>("all");
  const [filterAction, setFilterAction] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ module: "", action: "", dateFrom: "", dateTo: "", search: "" });
  const [availableModules, setAvailableModules] = useState<string[]>([]);
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "200");
      if (appliedFilters.module) params.set("module", appliedFilters.module);
      if (appliedFilters.action) params.set("action", appliedFilters.action);
      if (appliedFilters.dateFrom) params.set("dateFrom", appliedFilters.dateFrom);
      if (appliedFilters.dateTo) params.set("dateTo", appliedFilters.dateTo);
      if (appliedFilters.search) params.set("search", appliedFilters.search);

      const res = await apiFetch(`/api/audit-trail?${params.toString()}`);
      setEntries(res.entries || []);
      setTotalCount(res.total || 0);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [appliedFilters, toast]);

  const loadFilterOptions = useCallback(async () => {
    try {
      const res = await apiFetch("/api/audit-logs?limit=1&offset=0");
      if (res.modules) setAvailableModules(res.modules);
      if (res.actions) setAvailableActions(res.actions);
    } catch {}
  }, []);

  useEffect(() => { loadEntries(); }, [appliedFilters, loadEntries]);
  useEffect(() => { loadFilterOptions(); }, [loadFilterOptions]);

  const handleApplyFilters = () => {
    setAppliedFilters({
      module: filterModule === "all" ? "" : filterModule,
      action: filterAction === "all" ? "" : filterAction,
      dateFrom: filterDateFrom,
      dateTo: filterDateTo,
      search: filterSearch.trim(),
    });
  };

  const handleResetFilters = () => {
    setFilterModule("all");
    setFilterAction("all");
    setFilterDateFrom("");
    setFilterDateTo("");
    setFilterSearch("");
    setAppliedFilters({ module: "", action: "", dateFrom: "", dateTo: "", search: "" });
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Mask details for VAT Auditor
  const maskDetailsIfVat = (details: string | null | undefined): string => {
    if (!details) return "—";
    if (isVatAuditor) {
      const lower = details.toLowerCase();
      if (lower.includes("profit") || lower.includes("margin") || lower.includes("cost") || lower.includes("writeoff") || lower.includes("costprice") || lower.includes("wholesaleprice") || lower.includes("dealerprice")) {
        return "N/A (Audit Mode)";
      }
    }
    return details;
  };

  const actionBadgeClass = (action: string): string => {
    switch ((action || "").toUpperCase()) {
      case "CREATE": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "UPDATE": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "DELETE": return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "LOGIN": case "LOGOUT": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "EXPORT": case "IMPORT": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
      default: return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400";
    }
  };

  const actionDotColor = (action: string): string => {
    switch ((action || "").toUpperCase()) {
      case "CREATE": return "bg-green-500";
      case "UPDATE": return "bg-blue-500";
      case "DELETE": return "bg-red-500";
      case "LOGIN": case "LOGOUT": return "bg-yellow-500";
      case "EXPORT": case "IMPORT": return "bg-purple-500";
      default: return "bg-slate-500";
    }
  };

  // Export handlers
  const handleExportPDF = async () => {
    try {
      let companyProfile: CompanyProfile | undefined;
      try { const r = await apiFetch("/api/company-profile"); companyProfile = r.profile || undefined; } catch {}
      const columns: ExportColumnDef[] = [
        { key: "action", label: "Action", type: "text" },
        { key: "module", label: "Module", type: "text" },
        { key: "recordLabel", label: "Record", type: "text" },
        { key: "userName", label: "User", type: "text" },
        { key: "details", label: "Details", type: "text" },
        { key: "createdAt", label: "Timestamp", type: "date" },
      ];
      const exportData = entries.map(e => ({
        ...e,
        details: maskDetailsIfVat(e.details),
      }));
      const userName = authState.user?.displayName || authState.user?.name || "System";
      exportToPDF({
        title: "Audit Trail",
        subtitle: `${totalCount} entries${isVatAuditor ? " — VAT Audit Mode" : ""}`,
        columns,
        data: exportData,
        isVatAuditor,
        company: companyProfile,
        financialFooter: { preparedBy: userName, checkedBy: "", authorizedBy: "", printedBy: userName || "System" },
      });
      toast({ title: "PDF Exported", description: "Audit trail data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "action", label: "Action", type: "text" },
        { key: "module", label: "Module", type: "text" },
        { key: "recordLabel", label: "Record", type: "text" },
        { key: "userName", label: "User", type: "text" },
        { key: "details", label: "Details", type: "text" },
        { key: "createdAt", label: "Timestamp", type: "date" },
      ];
      const exportData = entries.map(e => ({
        ...e,
        details: maskDetailsIfVat(e.details),
      }));
      exportToCSV({ title: "Audit Trail", columns, data: exportData, isVatAuditor, vatMaskedColumns: ["details"] });
      toast({ title: "CSV Exported", description: "Audit trail data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <FileDown className="h-4 w-4 mr-1" /> PDF
        </Button>
        <Button variant="ghost" size="sm" onClick={loadEntries}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-cyan-400" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Module</Label>
              <Select value={filterModule} onValueChange={setFilterModule}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Modules</SelectItem>
                  {availableModules.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={filterAction} onValueChange={setFilterAction}>
                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Actions</SelectItem>
                  {availableActions.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date From</Label>
              <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date To</Label>
              <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Search</Label>
              <Input value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="Search records..." className="h-8 text-xs" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" onClick={handleApplyFilters} className="bg-[#2563eb] hover:bg-[#1d4ed8] h-8 text-xs">Apply</Button>
            <Button size="sm" variant="outline" onClick={handleResetFilters} className="h-8 text-xs">Reset</Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-3 flex items-center gap-2">
            <Activity className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xs text-slate-500">Total Entries</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{totalCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-3 flex items-center gap-2">
            <Plus className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-xs text-slate-500">Creates</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{entries.filter(e => (e.action || "").toUpperCase() === "CREATE").length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-3 flex items-center gap-2">
            <Edit className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-xs text-slate-500">Updates</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{entries.filter(e => (e.action || "").toUpperCase() === "UPDATE").length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-3 flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-red-500" />
            <div>
              <p className="text-xs text-slate-500">Deletes</p>
              <p className="text-lg font-bold text-slate-900 dark:text-white">{entries.filter(e => (e.action || "").toUpperCase() === "DELETE").length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Shield className="h-4 w-4 text-emerald-400" />
            Audit Timeline
            <span className="ml-auto text-xs text-white/60">Showing {entries.length} of {totalCount}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="text-center py-8 text-slate-400">
              <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2" /> Loading audit trail...
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-8 text-slate-400">No audit entries found</div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-3.5 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />

              <div className="space-y-4">
                {entries.slice(0, 100).map((entry, idx) => {
                  const entryId = entry.id || `entry-${idx}`;
                  const isExpanded = expandedIds.has(entryId);
                  const action = (entry.action || "UNKNOWN").toUpperCase();
                  const maskedDetails = maskDetailsIfVat(entry.details);

                  return (
                    <div key={entryId} className="relative pl-10 group">
                      {/* Timeline dot */}
                      <div className={`absolute left-2 top-1.5 w-3 h-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${actionDotColor(action)}`} />

                      <div className="hover:bg-slate-50 dark:hover:bg-slate-800/30 rounded-lg p-3 transition-colors">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={`${actionBadgeClass(action)} font-semibold text-xs`}>{action}</Badge>
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{entry.module || "—"}</span>
                            {entry.recordLabel && (
                              <>
                                <span className="text-slate-300 dark:text-slate-600">›</span>
                                <span className="text-sm text-[#2563eb] dark:text-blue-400">{entry.recordLabel}</span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
                            <Clock className="h-3 w-3" />
                            <span>{entry.timeAgo || fmt(entry.createdAt, "date")}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-5 h-5 rounded-full bg-[#132240] dark:bg-[#0a1628] flex items-center justify-center">
                            <span className="text-[8px] font-bold text-white">{(entry.userName || "?").charAt(0).toUpperCase()}</span>
                          </div>
                          <span className="text-xs text-slate-700 dark:text-slate-300">{entry.userName || "System"}</span>
                        </div>

                        {/* Expandable details */}
                        {maskedDetails && maskedDetails.length > 80 && (
                          <div className="mt-2">
                            <button onClick={() => toggleExpand(entryId)} className="flex items-center gap-1 text-xs text-[#2563eb] hover:text-[#1d4ed8] dark:text-blue-400">
                              {isExpanded ? <>▲ Hide</> : <>▼ Show Details</>}
                            </button>
                            {isExpanded && (
                              <pre className="mt-2 text-xs bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-md p-2 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                                <code className="text-slate-700 dark:text-slate-300">{maskedDetails}</code>
                              </pre>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {entries.length > 100 && (
                <p className="text-xs text-slate-500 mt-4 text-center">Showing first 100 of {totalCount} entries. Use filters to narrow results.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// TAB 5: PERFORMANCE & CACHE
// ============================================================

function PerformanceCacheTab({ isVatAuditor, userRole }: { isVatAuditor: boolean; userRole: UserRole }) {
  const { toast } = useToast();
  const [cacheStats, setCacheStats] = useState<Record<string, any>>({});
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [dbHealth, setDbHealth] = useState<{
    status: string;
    dbType?: string;
    dbSizeMB?: string;
    tableCount?: number;
    integrity?: string;
    journalMode?: string;
    keyRecords?: Record<string, number>;
    checkedAt?: string;
  }>({ status: "unknown" });
  const [loading, setLoading] = useState(true);
  const [invalidating, setInvalidating] = useState(false);

  const canMutate = (userRole === "admin" || userRole === "manager") && !isVatAuditor;

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/system-config");
      const configsList = result.configs || result || [];
      setConfigs(Array.isArray(configsList) ? configsList : []);

      // Build cache statistics from system configs
      const stats: Record<string, any> = {
        totalConfigs: configsList.length,
        categories: {} as Record<string, number>,
        booleanEnabled: 0,
        booleanDisabled: 0,
        lastUpdated: new Date().toISOString(),
      };
      configsList.forEach((c: SystemConfig) => {
        stats.categories[c.category] = (stats.categories[c.category] || 0) + 1;
        if (c.configType === "boolean") {
          if (c.configValue === "true") stats.booleanEnabled++;
          else stats.booleanDisabled++;
        }
      });
      setCacheStats(stats);

      // Real DB health check
      try {
        const health = await apiFetch("/api/system-health");
        setDbHealth(health);
      } catch {
        setDbHealth({ status: "error" });
      }
    } catch (e: any) {
      setDbHealth({ status: "error" });
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const handleInvalidateCache = async () => {
    setInvalidating(true);
    try {
      // Force refresh by re-fetching all config data
      await loadStats();
      toast({ title: "Cache Invalidated", description: "System cache has been cleared and refreshed" });
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setInvalidating(false);
    }
  };

  const handleExportPDF = async () => {
    try {
      let companyProfile: CompanyProfile | undefined;
      try { const r = await apiFetch("/api/company-profile"); companyProfile = r.profile || undefined; } catch {}
      const columns: ExportColumnDef[] = [
        { key: "category", label: "Category", type: "text" },
        { key: "count", label: "Config Count", type: "number" },
      ];
      const data = Object.entries(cacheStats.categories || {}).map(([category, count]) => ({ category, count }));
      const userName = authState.user?.displayName || authState.user?.name || "System";
      exportToPDF({
        title: "Performance & Cache Report",
        subtitle: `System configuration statistics`,
        columns,
        data,
        isVatAuditor,
        company: companyProfile,
        financialFooter: { preparedBy: userName, checkedBy: "", authorizedBy: "", printedBy: userName || "System" },
      });
      toast({ title: "PDF Exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "category", label: "Category", type: "text" },
        { key: "count", label: "Config Count", type: "number" },
      ];
      const data = Object.entries(cacheStats.categories || {}).map(([category, count]) => ({ category, count }));
      exportToCSV({ title: "Performance & Cache", columns, data, isVatAuditor });
      toast({ title: "CSV Exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = () => {
    importFromCSV({
      apiPath: "/api/system-config",
      formFields: [
        { key: "configKey", label: "Key", type: "text", required: true },
        { key: "configValue", label: "Value", type: "text", required: true },
        { key: "configType", label: "Type", type: "text" },
        { key: "category", label: "Category", type: "text" },
      ] as ExportFieldDef[],
    }).then(result => {
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadStats();
    }).catch((e: any) => {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    });
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <FileDown className="h-4 w-4 mr-1" /> PDF
        </Button>
        {canMutate && (
          <Button variant="outline" size="sm" onClick={handleImportCSV}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
        )}
        {canMutate && (
          <Button variant="outline" size="sm" onClick={handleInvalidateCache} disabled={invalidating}>
            <Trash className={`h-4 w-4 mr-1 ${invalidating ? "animate-spin" : ""}`} /> Invalidate Cache
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={loadStats}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-400">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
          Loading system diagnostics...
        </div>
      ) : (
        <>
          {/* System Health Card */}
          <Card className="border-slate-200 dark:border-slate-700">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
              <CardTitle className="text-white flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-emerald-400" />
                System Health
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${dbHealth.status === "connected" ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                    <Server className={`h-5 w-5 ${dbHealth.status === "connected" ? "text-emerald-600" : "text-red-600"}`} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Database Status</p>
                    <p className={`font-semibold ${dbHealth.status === "connected" ? "text-emerald-600" : dbHealth.status === "degraded" ? "text-amber-600" : "text-red-600"}`}>
                      {dbHealth.status === "connected" ? "Connected" : dbHealth.status === "degraded" ? "Degraded" : "Error"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <HardDrive className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Database Size</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{dbHealth.dbSizeMB || dbHealth.dbType || "SQLite"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <div className="h-10 w-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                    <Database className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Total Tables</p>
                    <p className="font-semibold text-slate-900 dark:text-white">{dbHealth.tableCount ?? "—"}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${dbHealth.integrity === "ok" ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-amber-100 dark:bg-amber-900/30"}`}>
                    <Activity className={`h-5 w-5 ${dbHealth.integrity === "ok" ? "text-emerald-600" : "text-amber-600"}`} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">Integrity Check</p>
                    <p className={`font-semibold ${dbHealth.integrity === "ok" ? "text-emerald-600" : "text-amber-600"}`}>
                      {dbHealth.integrity || "Unknown"}
                    </p>
                  </div>
                </div>
              </div>
              {dbHealth.keyRecords && (
                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 mb-2">Key Record Counts (Active)</p>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {Object.entries(dbHealth.keyRecords).map(([key, count]) => (
                      <div key={key} className="text-center p-2 rounded bg-slate-50 dark:bg-slate-800">
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{Number(count).toLocaleString('en-US')}</p>
                        <p className="text-xs text-slate-500 capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {dbHealth.journalMode && (
                <div className="mt-3 text-xs text-slate-400 flex items-center gap-4">
                  <span>Journal: <span className="font-medium text-slate-600 dark:text-slate-300">{dbHealth.journalMode}</span></span>
                  <span>Checked: {dbHealth.checkedAt ? new Date(dbHealth.checkedAt).toLocaleTimeString('en-GB') : '—'}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cache Statistics Card */}
          <Card className="border-slate-200 dark:border-slate-700">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
              <CardTitle className="text-white flex items-center gap-2 text-base">
                <Zap className="h-4 w-4 text-amber-400" />
                Cache Statistics
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{cacheStats.totalConfigs || 0}</p>
                  <p className="text-xs text-slate-500">Total Configs</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-2xl font-bold text-emerald-600">{cacheStats.booleanEnabled || 0}</p>
                  <p className="text-xs text-slate-500">Features Enabled</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-2xl font-bold text-red-500">{cacheStats.booleanDisabled || 0}</p>
                  <p className="text-xs text-slate-500">Features Disabled</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
                  <p className="text-2xl font-bold text-blue-600">{Object.keys(cacheStats.categories || {}).length}</p>
                  <p className="text-xs text-slate-500">Categories</p>
                </div>
              </div>

              <Separator />

              {/* Category Breakdown */}
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Configuration by Category</h4>
                <div className="space-y-2">
                  {Object.entries(cacheStats.categories || {}).sort(([a], [b]) => a.localeCompare(b)).map(([category, count]) => {
                    const meta = CATEGORY_META[category] || { icon: Settings, color: "text-slate-500" };
                    const CategoryIcon = meta.icon;
                    const total = cacheStats.totalConfigs || 1;
                    const pct = Math.round(((count as number) / total) * 100);
                    return (
                      <div key={category} className="flex items-center gap-3">
                        <CategoryIcon className={`h-4 w-4 ${meta.color} shrink-0`} />
                        <span className="text-sm text-slate-900 dark:text-white w-24 shrink-0">{category}</span>
                        <div className="flex-1 h-4 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full bg-[#2563eb] rounded-full transition-all" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-slate-500 w-20 text-right">{count as number} configs ({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cache Invalidation Controls */}
          <Card className="border-slate-200 dark:border-slate-700">
            <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
              <CardTitle className="text-white flex items-center gap-2 text-base">
                <RotateCcw className="h-4 w-4 text-amber-400" />
                Cache Invalidation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1">
                  <p className="text-sm text-slate-900 dark:text-white font-medium">Clear System Configuration Cache</p>
                  <p className="text-xs text-slate-500 mt-1">Forces re-fetch of all system configurations from the database. Use this when settings appear stale or after manual database modifications.</p>
                </div>
                {canMutate && (
                  <Button variant="destructive" onClick={handleInvalidateCache} disabled={invalidating} className="shrink-0">
                    {invalidating ? <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Clearing...</> : <><Trash className="h-4 w-4 mr-1" /> Clear Cache</>}
                  </Button>
                )}
              </div>
              <div className="mt-4 text-xs text-slate-400">
                Last refreshed: {cacheStats.lastUpdated ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(cacheStats.lastUpdated)) : "Never"}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function SystemSettingsGroupPage({ initialTab }: SystemConfigGroupPageProps) {
  const auth = useAuth();
  const userRole = auth.user?.role as UserRole || "sr";
  const isVatAuditor = userRole === "vat_auditor";
  const isSROrDealer = userRole === "sr" || userRole === "dealer";

  // SR and Dealer see 403
  if (isSROrDealer) {
    return <ForbiddenPage />;
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-[#132240] flex items-center justify-center">
          <Settings className="h-5 w-5 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">System Settings</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Manage company profile, templates, number formats, and performance</p>
        </div>
      </div>

      {/* VAT Auditor Badge */}
      {isVatAuditor && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <Shield className="h-5 w-5 text-amber-600" />
          <div>
            <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold">VAT AUDITOR MODE</p>
            <p className="text-xs text-amber-600 dark:text-amber-500">You have read-only access. Profit-sensitive data is masked. Changes are not permitted.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs defaultValue={initialTab || "company"} className="space-y-4">
        <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full overflow-x-auto">
          <TabsTrigger value="company" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Building2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Company</span> Settings
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <FileText className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Invoice</span> Templates
          </TabsTrigger>
          <TabsTrigger value="formats" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Hash className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Number</span> Formats
          </TabsTrigger>
          <TabsTrigger value="audit" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Shield className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Audit</span> Trail
          </TabsTrigger>
          <TabsTrigger value="performance" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Gauge className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Performance</span> & Cache
          </TabsTrigger>
        </TabsList>

        <TabsContent value="company">
          <CompanySettingsTab isVatAuditor={isVatAuditor} userRole={userRole} />
        </TabsContent>

        <TabsContent value="templates">
          <InvoiceTemplatesTab isVatAuditor={isVatAuditor} userRole={userRole} />
        </TabsContent>

        <TabsContent value="formats">
          <NumberFormatsTab isVatAuditor={isVatAuditor} userRole={userRole} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTrailTab isVatAuditor={isVatAuditor} userRole={userRole} />
        </TabsContent>

        <TabsContent value="performance">
          <PerformanceCacheTab isVatAuditor={isVatAuditor} userRole={userRole} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
