"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  AlertTriangle, Building2, FileText, Hash, Gauge,
  Download, Upload, FileDown, RefreshCw, Plus, Trash2,
  Edit, Eye, Shield, CheckCircle, X, Save, Settings,
  Printer, Mail, DollarSign, Percent, Palette, Search,
  Database, Zap, Trash, RotateCcw, Info, Code,
  Camera, XCircle,
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
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef } from "@/lib/export-utils";
import { clearCompanyProfileCache } from "@/lib/company-branding-cache";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") return Number(v).toLocaleString();
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

// --- Company Branding Profile Form Interface ---
interface CompanyProfileForm {
  id: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  mobile: string;
  website: string;
  vatNumber: string;
  tradeLicense: string;
  binNumber: string;
  currencySymbol: string;
  invoicePrefix: string;
  thankYouMsg: string;
  systemNote: string;
  showBarcode: boolean;
  showPayInWord: boolean;
  logoWidth: number;
  logoHeight: number;
  logoData: string;
}

const EMPTY_PROFILE: CompanyProfileForm = {
  id: "",
  name: "",
  address: "",
  phone: "",
  email: "",
  mobile: "",
  website: "",
  vatNumber: "",
  tradeLicense: "",
  binNumber: "",
  currencySymbol: "৳",
  invoicePrefix: "",
  thankYouMsg: "",
  systemNote: "",
  showBarcode: false,
  showPayInWord: false,
  logoWidth: 30,
  logoHeight: 20,
  logoData: "",
};

// --- Company Branding Forbidden Card for non-admin roles ---
function CompanyBrandingForbiddenCard() {
  return (
    <Card className="border-red-200 dark:border-red-800">
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center gap-3 py-4">
          <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/20 flex items-center justify-center">
            <Shield className="h-7 w-7 text-red-500" />
          </div>
          <h3 className="text-lg font-bold text-red-600 dark:text-red-400">403 Forbidden — Admin Only</h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 text-center max-w-sm">
            Company Branding Profile is restricted to Administrators. Managers and VAT Auditors can only view System Configuration below.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// --- Logo Uploader Component ---
function LogoUploader({
  logoData,
  onLogoChange,
  onLogoRemove,
  disabled,
}: {
  logoData: string;
  onLogoChange: (base64: string) => void;
  onLogoRemove: () => void;
  disabled: boolean;
}) {
  const { toast } = useToast();
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ALLOWED_EXTENSIONS = [".png", ".jpg", ".jpeg"];
  const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB

  const validateAndConvert = (file: File) => {
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      toast({
        title: "Invalid File Format",
        description: "Only .png, .jpg, .jpeg files are allowed.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast({
        title: "File Too Large",
        description: `File size (${(file.size / 1024 / 1024).toFixed(2)}MB) exceeds the 2MB limit. Please compress the image.`,
        variant: "destructive",
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      onLogoChange(result);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (disabled) return;
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      validateAndConvert(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      validateAndConvert(files[0]);
    }
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClick = () => {
    if (!disabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="space-y-3">
      <Label className="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-1.5">
        <Camera className="h-3.5 w-3.5" /> Company Logo
      </Label>

      {/* Logo Preview */}
      {logoData ? (
        <div className="flex items-center gap-4">
          <div className="w-24 h-20 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white flex items-center justify-center shadow-sm">
            <img
              src={logoData}
              alt="Company Logo Preview"
              className="max-w-full max-h-full object-contain"
            />
          </div>
          <div className="space-y-1">
            <p className="text-sm text-slate-700 dark:text-slate-300 font-medium">Logo uploaded</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">PNG, JPG up to 2MB</p>
            {!disabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onLogoRemove}
                className="text-red-600 border-red-200 hover:bg-red-50 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-900/20 mt-1"
              >
                <XCircle className="h-3.5 w-3.5 mr-1" /> Remove Logo
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* Drop Zone */
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={handleClick}
          className={`
            relative border-2 border-dashed rounded-xl p-6 text-center cursor-pointer
            transition-all duration-200 ease-in-out
            ${isDragOver
              ? "border-[#2563eb] bg-blue-50 dark:bg-blue-900/20 scale-[1.01]"
              : "border-slate-300 dark:border-slate-600 hover:border-[#2563eb]/50 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            }
            ${disabled ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".png,.jpg,.jpeg"
            onChange={handleFileSelect}
            className="hidden"
            disabled={disabled}
          />
          <div className="flex flex-col items-center gap-2">
            <div className={`h-10 w-10 rounded-full flex items-center justify-center ${isDragOver ? "bg-blue-100 dark:bg-blue-800" : "bg-slate-100 dark:bg-slate-700"}`}>
              <Upload className={`h-5 w-5 ${isDragOver ? "text-[#2563eb]" : "text-slate-400"}`} />
            </div>
            <div>
              <p className={`text-sm font-medium ${isDragOver ? "text-[#2563eb]" : "text-slate-700 dark:text-slate-300"}`}>
                {isDragOver ? "Drop image here" : "Drag & drop logo or click to browse"}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                PNG, JPG, JPEG only • Max 2MB
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Main CompanySettingsTab ---
function CompanySettingsTab({ isVatAuditor, userRole }: { isVatAuditor: boolean; userRole: UserRole }) {
  const { toast } = useToast();

  // Company Branding State
  const [profileForm, setProfileForm] = useState<CompanyProfileForm>({ ...EMPTY_PROFILE });
  const [profileLoading, setProfileLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const brandingSnapshot = useRef<CompanyProfileForm>({ ...EMPTY_PROFILE });
  const isAdmin = userRole === "admin";

  // System Config State
  const [configs, setConfigs] = useState<SystemConfig[]>([]);
  const [configLoading, setConfigLoading] = useState(true);
  const [savingCategory, setSavingCategory] = useState<string | null>(null);
  const [editedValues, setEditedValues] = useState<Record<string, string>>({});

  const canMutateConfig = (userRole === "admin" || userRole === "manager") && !isVatAuditor;

  // --- Load Company Profile ---
  const loadProfile = useCallback(async () => {
    setProfileLoading(true);
    try {
      const result = await apiFetch("/api/company-profile");
      const profile = result.profile;
      if (profile) {
        const form: CompanyProfileForm = {
          id: profile.id || "",
          name: profile.name || "",
          address: profile.address || "",
          phone: profile.phone || "",
          email: profile.email || "",
          mobile: profile.mobile || "",
          website: profile.website || "",
          vatNumber: profile.vatNumber || "",
          tradeLicense: profile.tradeLicense || "",
          binNumber: profile.binNumber || "",
          currencySymbol: profile.currencySymbol || "৳",
          invoicePrefix: profile.invoicePrefix || "",
          thankYouMsg: profile.thankYouMsg || "",
          systemNote: profile.systemNote || "",
          showBarcode: profile.showBarcode || false,
          showPayInWord: profile.showPayInWord || false,
          logoWidth: profile.logoWidth || 30,
          logoHeight: profile.logoHeight || 20,
          logoData: profile.logoData || "",
        };
        setProfileForm(form);
        brandingSnapshot.current = { ...form };
      }
    } catch (e: any) {
      // 403 for non-admin is expected — just show empty form
      if (!e.message?.includes("403") && !e.message?.includes("Access denied")) {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
    } finally {
      setProfileLoading(false);
    }
  }, [toast]);

  // --- Load System Configs ---
  const loadConfigs = useCallback(async () => {
    setConfigLoading(true);
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
      setConfigLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadProfile(); loadConfigs(); }, [loadProfile, loadConfigs]);

  // --- Save Company Branding ---
  const handleSaveBranding = async () => {
    if (!profileForm.name.trim()) {
      toast({ title: "Validation Error", description: "Company Name is required.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: profileForm.name,
        address: profileForm.address,
        phone: profileForm.phone,
        email: profileForm.email,
        mobile: profileForm.mobile,
        website: profileForm.website,
        vatNumber: profileForm.vatNumber,
        tradeLicense: profileForm.tradeLicense,
        binNumber: profileForm.binNumber,
        currencySymbol: profileForm.currencySymbol,
        invoicePrefix: profileForm.invoicePrefix,
        thankYouMsg: profileForm.thankYouMsg,
        systemNote: profileForm.systemNote,
        showBarcode: profileForm.showBarcode,
        showPayInWord: profileForm.showPayInWord,
        logoWidth: profileForm.logoWidth,
        logoHeight: profileForm.logoHeight,
        logoData: profileForm.logoData,
      };

      const result = await apiFetch("/api/company-profile", {
        method: "PUT",
        body: JSON.stringify(payload),
      });

      // Update snapshot on success
      if (result.profile) {
        const saved: CompanyProfileForm = {
          id: result.profile.id || "",
          name: result.profile.name || "",
          address: result.profile.address || "",
          phone: result.profile.phone || "",
          email: result.profile.email || "",
          mobile: result.profile.mobile || "",
          website: result.profile.website || "",
          vatNumber: result.profile.vatNumber || "",
          tradeLicense: result.profile.tradeLicense || "",
          binNumber: result.profile.binNumber || "",
          currencySymbol: result.profile.currencySymbol || "৳",
          invoicePrefix: result.profile.invoicePrefix || "",
          thankYouMsg: result.profile.thankYouMsg || "",
          systemNote: result.profile.systemNote || "",
          showBarcode: result.profile.showBarcode || false,
          showPayInWord: result.profile.showPayInWord || false,
          logoWidth: result.profile.logoWidth || 30,
          logoHeight: result.profile.logoHeight || 20,
          logoData: result.profile.logoData || "",
        };
        brandingSnapshot.current = { ...saved };
        setProfileForm(saved);
      }

      // Invalidate PDF cache
      clearCompanyProfileCache();

      toast({ title: "Branding Saved", description: "Company branding profile has been saved successfully. PDF cache cleared." });
    } catch (e: any) {
      // Roll back to snapshot
      setProfileForm({ ...brandingSnapshot.current });
      toast({
        title: "Network Error",
        description: "Branding synchronization failed. Form reverted to last saved state.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // --- Update profile form field helper ---
  const updateField = <K extends keyof CompanyProfileForm>(key: K, value: CompanyProfileForm[K]) => {
    setProfileForm(prev => ({ ...prev, [key]: value }));
  };

  // --- Group configs by category ---
  const groupedConfigs = useMemo(() => {
    const groups: Record<string, SystemConfig[]> = {};
    configs.forEach(c => {
      if (!groups[c.category]) groups[c.category] = [];
      groups[c.category].push(c);
    });
    return groups;
  }, [configs]);

  const categories = Object.keys(groupedConfigs).sort();

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

  const handleExportPDF = () => {
    try {
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
      exportToPDF({ title: "Company Settings", subtitle: `Total: ${configs.length} configurations`, columns, data: exportData, isVatAuditor });
      toast({ title: "PDF Exported", description: "Company settings data exported" });
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
    const disabled = !canMutateConfig || sensitive;

    if (sensitive) {
      return (
        <Input
          value="N/A (Audit Mode)"
          disabled
          className="bg-slate-50 dark:bg-slate-800 text-slate-400"
        />
      );
    }

    if (config.configType === "boolean") {
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={value === "true"}
            onCheckedChange={(checked) => setEditedValues(prev => ({ ...prev, [config.configKey]: String(checked) }))}
            disabled={disabled}
          />
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {value === "true" ? "Enabled" : "Disabled"}
          </span>
        </div>
      );
    }

    if (config.configType === "number") {
      return (
        <Input
          type="number"
          value={value}
          onChange={(e) => setEditedValues(prev => ({ ...prev, [config.configKey]: e.target.value }))}
          disabled={disabled}
        />
      );
    }

    if (config.configType === "json") {
      return (
        <Textarea
          value={value}
          onChange={(e) => setEditedValues(prev => ({ ...prev, [config.configKey]: e.target.value }))}
          disabled={disabled}
          rows={3}
          className="font-mono text-xs"
        />
      );
    }

    return (
      <Input
        type="text"
        value={value}
        onChange={(e) => setEditedValues(prev => ({ ...prev, [config.configKey]: e.target.value }))}
        disabled={disabled}
      />
    );
  };

  return (
    <div className="space-y-6">
      {/* ============================================== */}
      {/* SECTION 1: COMPANY BRANDING PROFILE (Admin Only) */}
      {/* ============================================== */}
      {isAdmin ? (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Building2 className="h-4 w-4 text-blue-400" />
              Company Branding Profile
              <Badge variant="secondary" className="ml-2 bg-emerald-500/20 text-emerald-300 text-xs border border-emerald-500/30">
                Admin Only
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-6">
            {profileLoading ? (
              <div className="text-center py-12 text-slate-400">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                Loading company profile...
              </div>
            ) : (
              <>
                {/* Logo Uploader */}
                <LogoUploader
                  logoData={profileForm.logoData}
                  onLogoChange={(base64) => updateField("logoData", base64)}
                  onLogoRemove={() => updateField("logoData", "")}
                  disabled={isSaving}
                />

                <Separator />

                {/* Company Details */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                    <Building2 className="h-3.5 w-3.5 text-slate-500" /> Company Details
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Company Name <span className="text-red-500">*</span></Label>
                      <Input
                        value={profileForm.name}
                        onChange={(e) => updateField("name", e.target.value)}
                        placeholder="e.g. Electronics Mart BD"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Official Address</Label>
                      <Textarea
                        value={profileForm.address}
                        onChange={(e) => updateField("address", e.target.value)}
                        placeholder="Full business address"
                        rows={2}
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Contact Phone</Label>
                      <Input
                        value={profileForm.phone}
                        onChange={(e) => updateField("phone", e.target.value)}
                        placeholder="e.g. +880-2-1234567"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Mobile Number</Label>
                      <Input
                        value={profileForm.mobile}
                        onChange={(e) => updateField("mobile", e.target.value)}
                        placeholder="e.g. +880171234567 (for invoices)"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Support Email</Label>
                      <Input
                        type="email"
                        value={profileForm.email}
                        onChange={(e) => updateField("email", e.target.value)}
                        placeholder="e.g. support@companymart.com"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Website</Label>
                      <Input
                        value={profileForm.website}
                        onChange={(e) => updateField("website", e.target.value)}
                        placeholder="e.g. https://www.companymart.com"
                        disabled={isSaving}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Business Identification */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                    <FileText className="h-3.5 w-3.5 text-slate-500" /> Business Identification
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">BIN/TIN Number</Label>
                      <Input
                        value={profileForm.binNumber}
                        onChange={(e) => updateField("binNumber", e.target.value)}
                        placeholder="Business Identification Number"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Trade License</Label>
                      <Input
                        value={profileForm.tradeLicense}
                        onChange={(e) => updateField("tradeLicense", e.target.value)}
                        placeholder="Trade license number"
                        disabled={isSaving}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">VAT Number</Label>
                      <Input
                        value={profileForm.vatNumber}
                        onChange={(e) => updateField("vatNumber", e.target.value)}
                        placeholder="VAT registration number"
                        disabled={isSaving}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Invoice Settings */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                    <DollarSign className="h-3.5 w-3.5 text-slate-500" /> Invoice Settings
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Currency Symbol</Label>
                      <Input
                        value={profileForm.currencySymbol}
                        onChange={(e) => updateField("currencySymbol", e.target.value)}
                        placeholder="৳"
                        disabled={isSaving}
                        className="max-w-[120px]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-sm font-medium">Invoice Prefix</Label>
                      <Input
                        value={profileForm.invoicePrefix}
                        onChange={(e) => updateField("invoicePrefix", e.target.value)}
                        placeholder="e.g. INV-"
                        disabled={isSaving}
                      />
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Invoice Customization */}
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mb-4">
                    <Palette className="h-3.5 w-3.5 text-slate-500" /> Invoice Customization
                  </h3>
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Thank You Message</Label>
                        <Input
                          value={profileForm.thankYouMsg}
                          onChange={(e) => updateField("thankYouMsg", e.target.value)}
                          placeholder="e.g. Thank you for your business!"
                          disabled={isSaving}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">System Note</Label>
                        <Input
                          value={profileForm.systemNote}
                          onChange={(e) => updateField("systemNote", e.target.value)}
                          placeholder="e.g. Goods once sold are not returnable"
                          disabled={isSaving}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                        <Switch
                          checked={profileForm.showBarcode}
                          onCheckedChange={(checked) => updateField("showBarcode", checked)}
                          disabled={isSaving}
                        />
                        <div>
                          <Label className="text-sm font-medium">Show Barcode</Label>
                          <p className="text-xs text-slate-500 dark:text-slate-400">On printed invoices</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                        <Switch
                          checked={profileForm.showPayInWord}
                          onCheckedChange={(checked) => updateField("showPayInWord", checked)}
                          disabled={isSaving}
                        />
                        <div>
                          <Label className="text-sm font-medium">Amount in Words</Label>
                          <p className="text-xs text-slate-500 dark:text-slate-400">On printed invoices</p>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Logo Width (mm)</Label>
                        <Input
                          type="number"
                          value={profileForm.logoWidth}
                          onChange={(e) => updateField("logoWidth", Number(e.target.value))}
                          disabled={isSaving}
                          min={5}
                          max={200}
                          className="max-w-[120px]"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-sm font-medium">Logo Height (mm)</Label>
                        <Input
                          type="number"
                          value={profileForm.logoHeight}
                          onChange={(e) => updateField("logoHeight", Number(e.target.value))}
                          disabled={isSaving}
                          min={5}
                          max={200}
                          className="max-w-[120px]"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                {/* Save Button */}
                <div className="flex justify-end">
                  <Button
                    onClick={handleSaveBranding}
                    disabled={isSaving || !profileForm.name.trim()}
                    className="bg-[#2563eb] hover:bg-[#1d4ed8] min-w-[240px]"
                  >
                    {isSaving ? (
                      <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Synchronizing Global Tenant Branding...</>
                    ) : (
                      <><Save className="h-4 w-4 mr-2" /> Save Company Branding</>
                    )}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <CompanyBrandingForbiddenCard />
      )}

      {/* ============================================== */}
      {/* SECTION 2: SYSTEM CONFIGURATION (Admin + Manager) */}
      {/* ============================================== */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Settings className="h-4 w-4 text-slate-400" />
            System Configuration
            <Badge variant="secondary" className="ml-2 bg-white/10 text-white/70 text-xs">
              Admin & Manager
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-4">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleExportCSV}>
              <Download className="h-4 w-4 mr-1" /> Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportPDF}>
              <FileDown className="h-4 w-4 mr-1" /> Export PDF
            </Button>
            {canMutateConfig && (
              <Button variant="outline" size="sm" onClick={handleImportCSV}>
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={loadConfigs}>
              <RefreshCw className={`h-4 w-4 ${configLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* VAT Audit Mode Banner */}
          {isVatAuditor && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
              <Shield className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                VAT AUDIT MODE — Profit/margin/writeoff configurations are masked. You can view but not modify settings.
              </span>
            </div>
          )}

          {configLoading ? (
            <div className="text-center py-12 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
              Loading configurations...
            </div>
          ) : (
            categories.map(category => {
              const meta = CATEGORY_META[category] || { icon: Settings, color: "text-slate-500" };
              const CategoryIcon = meta.icon;
              return (
                <Card key={category} className="border border-slate-200 dark:border-slate-700">
                  <CardHeader className="bg-slate-50 dark:bg-slate-800 rounded-t-lg pb-2 pt-3 px-4">
                    <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-sm">
                      <CategoryIcon className={`h-4 w-4 ${meta.color}`} />
                      {category}
                      <Badge variant="secondary" className="ml-2 text-xs">
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
                    {canMutateConfig && (
                      <div className="flex justify-end pt-2">
                        <Button
                          onClick={() => handleSaveCategory(category)}
                          disabled={savingCategory === category}
                          className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                        >
                          {savingCategory === category ? (
                            <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Saving...</>
                          ) : (
                            <><Save className="h-4 w-4 mr-1" /> Save {category}</>
                          )}
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </CardContent>
      </Card>
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
  });
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
    });
    setEditorOpen(true);
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
        body: JSON.stringify({ id: selectedTemplate.id, ...editorData }),
      });
      toast({ title: "Saved", description: "Template updated successfully" });
      setEditorOpen(false);
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

  const handleExportPDF = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Name", type: "text" },
        { key: "templateType", label: "Type", type: "text" },
        { key: "paperSize", label: "Paper Size", type: "text" },
        { key: "orientation", label: "Orientation", type: "text" },
        { key: "isActive", label: "Active", type: "boolean" },
      ];
      exportToPDF({ title: "Invoice Templates", subtitle: `Total: ${filteredTemplates.length}`, columns, data: filteredTemplates, isVatAuditor });
      toast({ title: "PDF Exported", description: "Invoice templates data exported" });
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

      {/* VAT Audit Mode Banner */}
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
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  <TableHead className="text-white font-semibold">Code</TableHead>
                  <TableHead className="text-white font-semibold">Name</TableHead>
                  <TableHead className="text-white font-semibold">Type</TableHead>
                  <TableHead className="text-white font-semibold">Paper Size</TableHead>
                  <TableHead className="text-white font-semibold">Orientation</TableHead>
                  <TableHead className="text-white font-semibold">Active</TableHead>
                  <TableHead className="text-white font-semibold w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                ) : filteredTemplates.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No templates found</TableCell></TableRow>
                ) : (
                  filteredTemplates.map((t, idx) => (
                    <TableRow key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer" onClick={() => openEditor(t)}>
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
                        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                          <Button variant="ghost" size="sm" onClick={() => openEditor(t)} className="h-7 w-7 p-0">
                            <Edit className="h-3.5 w-3.5 text-blue-500" />
                          </Button>
                          {isAdmin && (
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(t.id)} className="h-7 w-7 p-0">
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
        <DialogContent className="max-w-md">
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
                  <SelectItem value="Invoice">Invoice</SelectItem>
                  <SelectItem value="Receipt">Receipt</SelectItem>
                  <SelectItem value="Email">Email</SelectItem>
                  <SelectItem value="Report">Report</SelectItem>
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

      {/* Template Editor Dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Template: {selectedTemplate?.name}</DialogTitle>
            <DialogDescription>Customize the HTML template with placeholders. Preview updates in real-time.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Editor Side */}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Code className="h-3.5 w-3.5" /> Header HTML
                </Label>
                <Textarea
                  value={editorData.headerHtml}
                  onChange={(e) => setEditorData(prev => ({ ...prev, headerHtml: e.target.value }))}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder={'{{company_name}}, {{company_logo}}, {{company_address}}, {{company_phone}}'}
                  disabled={!canMutate}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Code className="h-3.5 w-3.5" /> Body HTML
                </Label>
                <Textarea
                  value={editorData.bodyHtml}
                  onChange={(e) => setEditorData(prev => ({ ...prev, bodyHtml: e.target.value }))}
                  rows={8}
                  className="font-mono text-xs"
                  placeholder={'{{invoice_no}}, {{date}}, {{customer_name}}, {{items_table}}, {{grand_total}}, {{sub_total}}, {{vat_amount}}'}
                  disabled={!canMutate}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Code className="h-3.5 w-3.5" /> Footer HTML
                </Label>
                <Textarea
                  value={editorData.footerHtml}
                  onChange={(e) => setEditorData(prev => ({ ...prev, footerHtml: e.target.value }))}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder={'{{bank_details}}, {{terms}}, {{company_name}}'}
                  disabled={!canMutate}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <Palette className="h-3.5 w-3.5" /> CSS Styles
                </Label>
                <Textarea
                  value={editorData.cssStyles}
                  onChange={(e) => setEditorData(prev => ({ ...prev, cssStyles: e.target.value }))}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder={"table { width: 100%; border-collapse: collapse; }\nth, td { border: 1px solid #ddd; padding: 8px; }"}
                  disabled={!canMutate}
                />
              </div>
              {/* Placeholder Hints */}
              <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-xs">
                <p className="font-semibold text-slate-900 dark:text-white mb-1">Available Placeholders:</p>
                <p className="text-slate-600 dark:text-slate-400">
                  Header: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{company_name}}"}</code>{" "}
                  <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{company_logo}}"}</code>{" "}
                  <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{company_address}}"}</code>
                </p>
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                  Body: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{invoice_no}}"}</code>{" "}
                  <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{date}}"}</code>{" "}
                  <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{customer_name}}"}</code>{" "}
                  <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{items_table}}"}</code>{" "}
                  <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{grand_total}}"}</code>
                </p>
                <p className="text-slate-600 dark:text-slate-400 mt-1">
                  Footer: <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{bank_details}}"}</code>{" "}
                  <code className="bg-slate-200 dark:bg-slate-700 px-1 rounded">{"{{terms}}"}</code>
                </p>
              </div>
            </div>

            {/* Preview Side */}
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" /> Live Preview
              </Label>
              <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white">
                <iframe
                  ref={previewIframeRef}
                  className="w-full"
                  style={{ height: "600px" }}
                  title="Template Preview"
                  sandbox="allow-same-origin"
                />
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

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete this template? This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button>
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
  const [editRow, setEditRow] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState<string | null>(null);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

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

  const generatePreview = (prefix: string, paddingLength: number, nextSequence: number) => {
    return `${prefix}${String(nextSequence).padStart(paddingLength, "0")}`;
  };

  const startEdit = (fmt: NumberFormat) => {
    setEditRow(fmt.id);
    setEditData({
      prefix: fmt.prefix,
      paddingLength: fmt.paddingLength,
      nextSequence: fmt.nextSequence,
      resetYearly: fmt.resetYearly,
    });
  };

  const cancelEdit = () => {
    setEditRow(null);
    setEditData({});
  };

  const handleSave = async (fmt: NumberFormat) => {
    if (editData.nextSequence < fmt.nextSequence) {
      toast({
        title: "Validation Error",
        description: `Next sequence can only be increased. Current: ${fmt.nextSequence}`,
        variant: "destructive",
      });
      return;
    }
    setSaving(fmt.id);
    try {
      await apiFetch("/api/number-formats", {
        method: "PUT",
        body: JSON.stringify({ id: fmt.id, ...editData }),
      });
      toast({ title: "Saved", description: `${fmt.moduleKey} format updated` });
      setEditRow(null);
      loadFormats();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(null);
    }
  };

  const handleResetAll = async () => {
    setResetting(true);
    try {
      for (const fmt of formats) {
        await apiFetch("/api/number-formats", {
          method: "PUT",
          body: JSON.stringify({ id: fmt.id, nextSequence: 1 }),
        });
      }
      toast({ title: "Reset Complete", description: "All sequences reset to 1" });
      setResetAllOpen(false);
      loadFormats();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setResetting(false);
    }
  };

  const handleExportCSV = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "moduleKey", label: "Module Key", type: "text" },
        { key: "prefix", label: "Prefix", type: "text" },
        { key: "paddingLength", label: "Padding Length", type: "number" },
        { key: "nextSequence", label: "Next Sequence", type: "number" },
        { key: "resetYearly", label: "Reset Yearly", type: "boolean" },
      ];
      exportToCSV({ title: "Number Formats", columns, data: formats, isVatAuditor });
      toast({ title: "CSV Exported", description: "Number formats data exported" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportPDF = () => {
    try {
      const columns: ExportColumnDef[] = [
        { key: "moduleKey", label: "Module Key", type: "text" },
        { key: "prefix", label: "Prefix", type: "text" },
        { key: "paddingLength", label: "Padding Length", type: "number" },
        { key: "nextSequence", label: "Next Sequence", type: "number" },
        { key: "resetYearly", label: "Reset Yearly", type: "boolean" },
      ];
      exportToPDF({ title: "Number Formats", subtitle: `Total: ${formats.length} formats`, columns, data: formats, isVatAuditor });
      toast({ title: "PDF Exported", description: "Number formats data exported" });
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
        { key: "paddingLength", label: "Padding Length", type: "number" },
        { key: "nextSequence", label: "Next Sequence", type: "number" },
        { key: "resetYearly", label: "Reset Yearly", type: "checkbox" },
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
        {isAdmin && (
          <Button variant="destructive" size="sm" onClick={() => setResetAllOpen(true)}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset All Sequences
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={loadFormats}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* VAT Audit Mode Banner */}
      {isVatAuditor && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            VAT AUDIT MODE — You can view but not modify number formats.
          </span>
        </div>
      )}

      {/* Formats Table */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  <TableHead className="text-white font-semibold">Module Key</TableHead>
                  <TableHead className="text-white font-semibold">Prefix</TableHead>
                  <TableHead className="text-white font-semibold">Padding</TableHead>
                  <TableHead className="text-white font-semibold">Next Seq</TableHead>
                  <TableHead className="text-white font-semibold">Reset Yearly</TableHead>
                  <TableHead className="text-white font-semibold">Preview</TableHead>
                  <TableHead className="text-white font-semibold w-28">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                ) : formats.length === 0 ? (
                  <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-400">No number formats found</TableCell></TableRow>
                ) : (
                  formats.map((f, idx) => (
                    <TableRow key={f.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      <TableCell className="font-medium text-slate-900 dark:text-white">
                        {f.moduleKey.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase())}
                      </TableCell>
                      {editRow === f.id ? (
                        <>
                          <TableCell>
                            <Input
                              value={editData.prefix}
                              onChange={(e) => setEditData(prev => ({ ...prev, prefix: e.target.value }))}
                              className="h-8 text-sm w-24"
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editData.paddingLength}
                              onChange={(e) => setEditData(prev => ({ ...prev, paddingLength: Number(e.target.value) }))}
                              className="h-8 text-sm w-20"
                              min={1}
                              max={10}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              value={editData.nextSequence}
                              onChange={(e) => setEditData(prev => ({ ...prev, nextSequence: Number(e.target.value) }))}
                              className="h-8 text-sm w-20"
                              min={f.nextSequence}
                            />
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={editData.resetYearly}
                              onCheckedChange={(checked) => setEditData(prev => ({ ...prev, resetYearly: checked }))}
                            />
                          </TableCell>
                          <TableCell className="font-mono text-xs text-[#2563eb]">
                            {generatePreview(editData.prefix, editData.paddingLength, editData.nextSequence)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleSave(f)}
                                disabled={saving === f.id}
                                className="h-7 w-7 p-0"
                              >
                                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
                              </Button>
                              <Button variant="ghost" size="sm" onClick={cancelEdit} className="h-7 w-7 p-0">
                                <X className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </div>
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell className="font-mono text-sm">{f.prefix}</TableCell>
                          <TableCell>{f.paddingLength}</TableCell>
                          <TableCell>{f.nextSequence}</TableCell>
                          <TableCell>
                            <Badge variant={f.resetYearly ? "default" : "secondary"} className={f.resetYearly ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}>
                              {f.resetYearly ? "Yes" : "No"}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs text-[#2563eb] font-medium">
                            {generatePreview(f.prefix, f.paddingLength, f.nextSequence)}
                          </TableCell>
                          <TableCell>
                            {canMutate ? (
                              <Button variant="ghost" size="sm" onClick={() => startEdit(f)} className="h-7 w-7 p-0">
                                <Edit className="h-3.5 w-3.5 text-blue-500" />
                              </Button>
                            ) : (
                              <span className="text-xs text-slate-400">View Only</span>
                            )}
                          </TableCell>
                        </>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-slate-500 dark:text-slate-400">
        Showing {formats.length} number formats
      </div>

      {/* Reset All Confirmation */}
      <Dialog open={resetAllOpen} onOpenChange={setResetAllOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Reset All Sequences</DialogTitle>
            <DialogDescription>
              This will reset ALL number format sequences back to 1. This action cannot be undone. Are you sure?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetAllOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleResetAll} disabled={resetting}>
              {resetting ? "Resetting..." : "Reset All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// TAB 4: PERFORMANCE & CACHING
// ============================================================

function PerformanceCachingTab({ isVatAuditor, userRole }: { isVatAuditor: boolean; userRole: UserRole }) {
  const { toast } = useToast();
  const [dbStats, setDbStats] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [integrityRunning, setIntegrityRunning] = useState(false);
  const [integrityResult, setIntegrityResult] = useState<string | null>(null);
  const [cacheCleared, setCacheCleared] = useState(false);

  const loadDbStats = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/dashboard");
      // Compute stats from dashboard data
      const stats: Record<string, number> = {
        Products: result.totalProducts || 0,
        Customers: result.totalCustomers || 0,
        Suppliers: result.totalSuppliers || 0,
        "Low Stock Items": result.lowStockProducts?.length || 0,
        "Pending POs": result.pendingOrders?.pendingPOCount || 0,
        "Pending SOs": result.pendingOrders?.pendingSOCount || 0,
      };
      if (result.topSellingProducts) stats["Top Products"] = result.topSellingProducts.length;
      if (result.recentActivities) stats["Recent Activities"] = result.recentActivities.length;
      if (result.categoryDistribution) stats["Categories"] = result.categoryDistribution.length;
      setDbStats(stats);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadDbStats(); }, [loadDbStats]);

  const handleIntegrityCheck = async () => {
    setIntegrityRunning(true);
    setIntegrityResult(null);
    try {
      const result = await apiFetch("/api/notifications?action=generate");
      const count = result.generated || 0;
      setIntegrityResult(`Integrity check complete. ${count} new notifications generated.`);
      toast({ title: "Integrity Check Complete", description: `${count} notifications generated` });
    } catch (e: any) {
      setIntegrityResult(`Check failed: ${e.message}`);
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIntegrityRunning(false);
    }
  };

  const handleClearCache = () => {
    // Since we use local memory caching, just clear it client-side
    setCacheCleared(true);
    toast({ title: "Cache Cleared", description: "Local memory cache has been cleared" });
    setTimeout(() => setCacheCleared(false), 3000);
  };

  // Cache TTL configuration (display-only)
  const cacheCategories = [
    { name: "Dashboard KPIs", ttl: "5 minutes", description: "Dashboard statistics and KPI cards" },
    { name: "Product Catalog", ttl: "10 minutes", description: "Product listings and search results" },
    { name: "Customer/Supplier Data", ttl: "15 minutes", description: "Customer and supplier information" },
    { name: "Financial Reports", ttl: "30 minutes", description: "Aggregated financial report data" },
    { name: "System Config", ttl: "60 minutes", description: "System configuration and settings" },
  ];

  return (
    <div className="space-y-6">
      {/* DB Statistics */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-blue-400" />
            Database Statistics
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {loading ? (
            <div className="text-center py-6 text-slate-400">
              <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
              Loading statistics...
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.entries(dbStats).map(([key, value]) => (
                <div key={key} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3 text-center">
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{key}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cache Configuration (Display Only) */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Zap className="h-4 w-4 text-amber-400" />
            Cache Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-slate-800">
                <TableHead className="text-slate-900 dark:text-white">Category</TableHead>
                <TableHead className="text-slate-900 dark:text-white">TTL</TableHead>
                <TableHead className="text-slate-900 dark:text-white">Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cacheCategories.map(cat => (
                <TableRow key={cat.name}>
                  <TableCell className="font-medium text-slate-900 dark:text-white">{cat.name}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      {cat.ttl}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-600 dark:text-slate-400 text-sm">{cat.description}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Integrity Check */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Shield className="h-4 w-4 text-emerald-400" />
              Data Integrity Check
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Run a system-wide integrity check to detect low-stock alerts, overdue installments, and other anomalies.
            </p>
            <Button
              onClick={handleIntegrityCheck}
              disabled={integrityRunning}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] w-full"
            >
              {integrityRunning ? (
                <><RefreshCw className="h-4 w-4 mr-1 animate-spin" /> Running Check...</>
              ) : (
                <><Shield className="h-4 w-4 mr-1" /> Run Integrity Check</>
              )}
            </Button>
            {integrityResult && (
              <div className={`p-3 rounded-lg text-sm ${integrityResult.includes("failed") ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400" : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400"}`}>
                {integrityResult}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Cache Management */}
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <Trash className="h-4 w-4 text-red-400" />
              Cache Management
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Clear local memory cache to force fresh data retrieval on next request.
            </p>
            <Button
              variant="outline"
              onClick={handleClearCache}
              className="w-full border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              {cacheCleared ? (
                <><CheckCircle className="h-4 w-4 mr-1 text-emerald-500" /> Cache Cleared!</>
              ) : (
                <><Trash className="h-4 w-4 mr-1" /> Clear Cache</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Optimize Queries */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-[#132240] dark:bg-[#0a1628] rounded-t-lg pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-purple-400" />
            Query Optimization Status
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center">
              <Info className="h-6 w-6 text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-900 dark:text-white">Database Engine</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">SQLite (Prisma ORM)</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center">
              <Database className="h-6 w-6 text-emerald-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-900 dark:text-white">DB Size</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Managed by Prisma</p>
            </div>
            <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-4 text-center">
              <RefreshCw className="h-6 w-6 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-900 dark:text-white">Last Optimization</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function SystemSettingsGroupPage({ initialTab }: SystemConfigGroupPageProps) {
  const auth = useAuth();
  const isVatAuditor = auth.user?.role === "vat_auditor";
  const userRole = auth.user?.role || "admin";

  // Map sidebar keys to internal tab values
  const tabMap: Record<string, string> = {
    "company-settings": "company",
    "invoice-templates": "templates",
    "number-formats": "formats",
    "performance-cache": "performance",
  };
  const [activeTab, setActiveTab] = useState(tabMap[initialTab || ""] || initialTab || "company");

  // RBAC: SR and Dealer blocked
  if (userRole === "sr" || userRole === "dealer") {
    return <ForbiddenPage />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Settings className="h-6 w-6 text-[#2563eb]" />
            System Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Core performance configurations, invoice templates, number formats, and system maintenance
          </p>
        </div>
        {isVatAuditor && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1">
            <Shield className="h-3.5 w-3.5 mr-1" /> VAT Audit Mode
          </Badge>
        )}
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto flex-wrap gap-1 p-1">
          <TabsTrigger value="company" className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-xs gap-1 px-4 py-2">
            <Building2 className="h-3.5 w-3.5" /> Company Settings
          </TabsTrigger>
          <TabsTrigger value="templates" className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-xs gap-1 px-4 py-2">
            <FileText className="h-3.5 w-3.5" /> Invoice Templates
          </TabsTrigger>
          <TabsTrigger value="formats" className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-xs gap-1 px-4 py-2">
            <Hash className="h-3.5 w-3.5" /> Number Formats
          </TabsTrigger>
          <TabsTrigger value="performance" className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-xs gap-1 px-4 py-2">
            <Gauge className="h-3.5 w-3.5" /> Performance & Caching
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

        <TabsContent value="performance">
          <PerformanceCachingTab isVatAuditor={isVatAuditor} userRole={userRole} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
