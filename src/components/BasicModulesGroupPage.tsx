"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Building2, Tag, Palette, Box, Layers, Building,
  Warehouse, CreditCard, Settings, Target, Hash, X, Shield,
  CheckCircle, ChevronRight, Ruler, Save, Globe, Phone,
  Mail, FileText, ToggleLeft, ToggleRight, Hash as HashIcon,
  AlertTriangle, ArrowRight, Link2, Eye, Printer,
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
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef, CompanyProfile } from "@/lib/export-utils";
import { loadCompanyProfile, clearCompanyProfileCache } from "@/lib/company-branding-cache";
import ImageUploadField from "@/components/erp/ui/ImageUploadField";
import Papa from "papaparse";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${new Intl.NumberFormat('bn-BD', { minimumFractionDigits: 2 }).format(Number(v))}`;
};

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return fmtCurrency(v);
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
// MODULE CONFIGURATION (Structural + Operational only)
// ============================================================

interface ModuleConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  apiPath: string;
  columns: ExportColumnDef[];
  formFields: ExportFieldDef[];
  vatMaskedColumns?: string[];
  category?: "core" | "structural" | "operational";
}

const MODULE_CONFIGS: ModuleConfig[] = [
  // ── Structural Infrastructure ──
  {
    key: "departments", label: "Departments", icon: Building, apiPath: "/api/departments",
    category: "structural",
    columns: [
      { key: "name", label: "Department Name", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "_count.employees", label: "Employees", type: "number" },
      { key: "_count.designations", label: "Designations", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Department Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    key: "godowns", label: "Godowns", icon: Warehouse, apiPath: "/api/godowns",
    category: "structural",
    columns: [
      { key: "name", label: "Warehouse Name", type: "text" },
      { key: "address", label: "Address", type: "text" },
      { key: "inCharge", label: "In Charge", type: "text" },
      { key: "_count.products", label: "Products", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Warehouse Name", type: "text", required: true },
      { key: "address", label: "Address", type: "textarea" },
      { key: "inCharge", label: "In Charge", type: "text" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    key: "segments", label: "Segments", icon: Layers, apiPath: "/api/segments",
    category: "structural",
    columns: [
      { key: "name", label: "Segment Name", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "_count.products", label: "Products", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Segment Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    key: "capacities", label: "Capacities", icon: Hash, apiPath: "/api/capacities",
    category: "structural",
    columns: [
      { key: "name", label: "Capacity Name", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Capacity Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  // ── Operational Framework ──
  {
    key: "sr-targets", label: "SR Target Setup", icon: Target, apiPath: "/api/sr-targets",
    category: "operational",
    columns: [
      { key: "employee.name", label: "Employee", type: "text" },
      { key: "month", label: "Month", type: "number" },
      { key: "year", label: "Year", type: "number" },
      { key: "targetAmount", label: "Target Amount", type: "currency" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "employeeId", label: "Employee", type: "select", required: true, options: [] },
      { key: "month", label: "Month", type: "number", required: true },
      { key: "year", label: "Year", type: "number", required: true },
      { key: "targetAmount", label: "Target Amount (৳)", type: "number", required: true, step: "0.01" },
    ],
    vatMaskedColumns: ["targetAmount"],
  },
  {
    key: "payment-options", label: "Payment Options", icon: CreditCard, apiPath: "/api/payment-options",
    category: "operational",
    columns: [
      { key: "name", label: "Payment Option", type: "text" },
      { key: "_count.cardTypeSetups", label: "Card Setups", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Payment Option Name", type: "text", required: true },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    key: "card-types", label: "Card Types", icon: CreditCard, apiPath: "/api/card-types",
    category: "operational",
    columns: [
      { key: "name", label: "Card Type", type: "text" },
      { key: "_count.cardTypeSetups", label: "Card Setups", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Card Type Name", type: "text", required: true },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    key: "card-type-setup", label: "CardType Setup", icon: Settings, apiPath: "/api/card-type-setup",
    category: "operational",
    columns: [
      { key: "paymentOption.name", label: "Payment Option", type: "text" },
      { key: "cardType.name", label: "Card Type", type: "text" },
      { key: "chargePercentage", label: "Charge %", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "paymentOptionId", label: "Payment Option", type: "select", required: true, options: [] },
      { key: "cardTypeId", label: "Card Type", type: "select", required: true, options: [] },
      { key: "chargePercentage", label: "Charge Percentage (%)", type: "number", defaultValue: 0, step: "0.01" },
    ],
  },
];

// ============================================================
// HELPER
// ============================================================

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

// ============================================================
// GENERIC MODULE TAB (for Structural + Operational modules)
// ============================================================

function ModuleTab({ config, isVatAuditor, userRole }: {
  config: ModuleConfig;
  isVatAuditor: boolean;
  userRole: UserRole;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const canMutate = userRole === "admin" || userRole === "manager";
  const maskedColumns = useMemo(() => isVatAuditor ? (config.vatMaskedColumns || []) : [], [isVatAuditor, config.vatMaskedColumns]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch(config.apiPath);
      setData(Array.isArray(result) ? result : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [config.apiPath, toast]);

  const loadOptions = useCallback(async () => {
    const selectFields = config.formFields.filter(f => f.type === "select" && !f.options?.length);
    const opts: Record<string, any[]> = {};
    for (const field of selectFields) {
      try {
        let apiPath = "";
        if (field.key === "parentCategoryId") apiPath = "/api/categories";
        else if (field.key === "employeeId") apiPath = "/api/employees";
        else if (field.key === "paymentOptionId") apiPath = "/api/payment-options";
        else if (field.key === "cardTypeId") apiPath = "/api/card-types";
        if (apiPath) {
          const items = await apiFetch(apiPath);
          opts[field.key] = Array.isArray(items) ? items : [];
        }
      } catch { opts[field.key] = []; }
    }
    setDynamicOptions(opts);
  }, [config.formFields]);

  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => { loadOptions(); }, [loadOptions]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(item => config.columns.some(col => String(getNestedValue(item, col.key) ?? "").toLowerCase().includes(q)));
  }, [data, search, config.columns]);

  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(d => d.isActive !== false).length;
    return { total, active, inactive: total - active };
  }, [data]);

  const openCreate = () => {
    setEditingItem(null);
    const defaults: Record<string, any> = {};
    config.formFields.forEach(f => {
      if (f.defaultValue !== undefined) defaults[f.key] = f.defaultValue;
      else if (f.type === "checkbox") defaults[f.key] = true;
      else defaults[f.key] = "";
    });
    setFormData(defaults);
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    const values: Record<string, any> = {};
    config.formFields.forEach(f => {
      const val = getNestedValue(item, f.key);
      if (val !== undefined && val !== null) values[f.key] = val;
      else if (f.defaultValue !== undefined) values[f.key] = f.defaultValue;
      else values[f.key] = f.type === "checkbox" ? true : "";
    });
    setFormData(values);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    for (const f of config.formFields) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        toast({ title: "Validation Error", description: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      if (editingItem) {
        await apiFetch(`${config.apiPath}/${editingItem.id}`, { method: "PUT", body: JSON.stringify(formData) });
        toast({ title: "Updated", description: `${config.label} updated successfully` });
      } else {
        await apiFetch(config.apiPath, { method: "POST", body: JSON.stringify(formData) });
        toast({ title: "Created", description: `${config.label} created successfully` });
      }
      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`${config.apiPath}/${id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: `${config.label} deleted successfully` });
      setDeleteConfirm(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportPDF = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        config.columns.forEach(col => {
          let val = getNestedValue(item, col.key);
          if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
          row[col.key] = val;
        });
        return row;
      });
      exportToPDF({
        title: config.label,
        subtitle: `Total Records: ${filteredData.length}`,
        orientation: "landscape",
        columns: config.columns,
        data: exportData,
        isVatAuditor,
        vatMaskedColumns: maskedColumns,
      });
      toast({ title: "PDF Exported", description: `${config.label} data exported` });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        config.columns.forEach(col => {
          let val = getNestedValue(item, col.key);
          if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
          row[col.key] = val;
        });
        return row;
      });
      exportToCSV({ title: config.label, columns: config.columns, data: exportData, isVatAuditor, vatMaskedColumns: maskedColumns });
      toast({ title: "CSV Exported", description: `${config.label} data exported` });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  const handleImportCSV = () => {
    importFromCSV({ apiPath: config.apiPath, formFields: config.formFields }).then((result) => {
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    });
  };

  const renderFormField = (field: ExportFieldDef) => {
    const val = formData[field.key] ?? "";
    if (field.type === "select") {
      const options = field.options?.length ? field.options : (dynamicOptions[field.key] || []).map((item: any) => ({ value: item.id, label: item.name || item.code || item.id }));
      return (
        <Select value={String(val)} onValueChange={(v) => setFormData(prev => ({ ...prev, [field.key]: v }))}>
          <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
          <SelectContent>
            {options.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );
    }
    if (field.type === "checkbox") {
      return (
        <div className="flex items-center gap-2">
          <input type="checkbox" checked={!!val} onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.checked }))} className="h-4 w-4 rounded border-slate-300" />
          <Label>{field.label}</Label>
        </div>
      );
    }
    if (field.type === "textarea") {
      return <Textarea value={String(val)} onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))} placeholder={field.placeholder || field.label} rows={3} />;
    }
    return <Input type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"} value={String(val)} onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }))} placeholder={field.placeholder || field.label} step={field.step} />;
  };

  const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const Icon = config.icon;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center"><Icon className="h-5 w-5 text-[#2563eb]" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">Total {config.label}</p><p className="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</p></div></CardContent></Card>
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-emerald-500" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">Active</p><p className="text-xl font-bold text-emerald-600">{stats.active}</p></div></CardContent></Card>
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center"><X className="h-5 w-5 text-red-500" /></div><div><p className="text-xs text-slate-500 dark:text-slate-400">Inactive</p><p className="text-xl font-bold text-red-500">{stats.inactive}</p></div></CardContent></Card>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${config.label.toLowerCase()}...`} className="pl-8" /></div>
        {canMutate && <Button onClick={openCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]"><Plus className="h-4 w-4 mr-1" /> Add {singularize(config.label)}</Button>}
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
        {canMutate && <Button variant="outline" size="sm" onClick={handleImportCSV}><Upload className="h-4 w-4 mr-1" /> Import</Button>}
        <Button variant="ghost" size="sm" onClick={loadData}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>
      {isVatAuditor && maskedColumns.length > 0 && (<div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2"><Shield className="h-4 w-4 text-amber-600" /><span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Financial columns are masked</span></div>)}
      <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto"><Table><TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628]"><TableHead className="text-white font-semibold w-12">#</TableHead>{config.columns.map(col => <TableHead key={col.key} className="text-white font-semibold whitespace-nowrap">{col.label}</TableHead>)}{canMutate && <TableHead className="text-white font-semibold w-24">Actions</TableHead>}</TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={config.columns.length + 2} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
        : filteredData.length === 0 ? <TableRow><TableCell colSpan={config.columns.length + 2} className="text-center py-8 text-slate-400">No {config.label.toLowerCase()} found</TableCell></TableRow>
        : filteredData.map((item, idx) => (
          <TableRow key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
            {config.columns.map(col => {
              let val = getNestedValue(item, col.key);
              if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
              if (col.key === "isActive") return <TableCell key={col.key}><Badge variant={val ? "default" : "secondary"} className={val ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}>{val ? "Active" : "Inactive"}</Badge></TableCell>;
              if (col.key === "month" && typeof val === "number" && val >= 1 && val <= 12) return <TableCell key={col.key} className="whitespace-nowrap">{MONTH_NAMES[val]}</TableCell>;
              if (col.type === "currency") return <TableCell key={col.key} className="whitespace-nowrap font-medium">{fmtCurrency(val)}</TableCell>;
              return <TableCell key={col.key} className="whitespace-nowrap">{fmt(val, col.type)}</TableCell>;
            })}
            {canMutate && <TableCell><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3.5 w-3.5 text-blue-500" /></Button><Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(item.id)} className="h-7 w-7 p-0"><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button></div></TableCell>}
          </TableRow>
        ))}
      </TableBody></Table></div></CardContent></Card>
      <div className="text-xs text-slate-500 dark:text-slate-400">Showing {filteredData.length} of {data.length} {config.label.toLowerCase()}</div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}><DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto"><DialogHeader><DialogTitle>{editingItem ? `Edit ${singularize(config.label)}` : `New ${singularize(config.label)}`}</DialogTitle><DialogDescription>{editingItem ? `Update details` : `Create a new entry`}</DialogDescription></DialogHeader><div className="space-y-4 py-2">{config.formFields.map(field => <div key={field.key} className="space-y-1.5">{field.type !== "checkbox" && <Label className="text-sm font-medium">{field.label} {field.required && <span className="text-red-500">*</span>}</Label>}{renderFormField(field)}</div>)}</div><DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">{saving ? "Saving..." : editingItem ? "Update" : "Create"}</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}><DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Confirm Delete</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}

// ============================================================
// COMPANIES WORKSPACE — Full Master Company Editor
// ============================================================

function CompaniesWorkspace({ isVatAuditor, userRole }: { isVatAuditor: boolean; userRole: UserRole }) {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [brandingSynced, setBrandingSynced] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  const canMutate = userRole === "admin" || userRole === "manager";

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/companies");
      setData(Array.isArray(result) ? result : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadProfile = useCallback(async () => {
    const profile = await loadCompanyProfile();
    setCompanyProfile(profile);
  }, []);

  useEffect(() => { loadData(); loadProfile(); }, [loadData, loadProfile]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(item =>
      ["name", "code", "address", "phone", "email", "mobile", "vatNumber", "binNumber"].some(key =>
        String(item[key] ?? "").toLowerCase().includes(q)
      )
    );
  }, [data, search]);

  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(d => d.isActive !== false).length;
    return { total, active, inactive: total - active };
  }, [data]);

  const openCreate = () => {
    setEditingItem(null);
    setFormData({
      name: "", address: "", phone: "", email: "", mobile: "", website: "",
      vatNumber: "", tradeLicense: "", binNumber: "",
      currencySymbol: "৳", invoicePrefix: "", thankYouMsg: "Thank You Come Again.",
      systemNote: "This is a system generated invoice no need to seal & signature.",
      showBarcode: true, showPayInWord: true, logoWidth: 30, logoHeight: 20,
      logo: "", brandLogo: "", logoData: "", isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setFormData({
      name: item.name || "", address: item.address || "", phone: item.phone || "",
      email: item.email || "", mobile: item.mobile || "", website: item.website || "",
      vatNumber: item.vatNumber || "", tradeLicense: item.tradeLicense || "", binNumber: item.binNumber || "",
      currencySymbol: item.currencySymbol || "৳", invoicePrefix: item.invoicePrefix || "",
      thankYouMsg: item.thankYouMsg || "", systemNote: item.systemNote || "",
      showBarcode: item.showBarcode !== undefined ? item.showBarcode : true,
      showPayInWord: item.showPayInWord !== undefined ? item.showPayInWord : true,
      logoWidth: item.logoWidth || 30, logoHeight: item.logoHeight || 20,
      logo: item.logo || "", brandLogo: item.brandLogo || "", logoData: item.logoData || "",
      isActive: item.isActive !== undefined ? item.isActive : true,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      toast({ title: "Validation Error", description: "Company name is required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      let result: any;
      if (editingItem) {
        result = await apiFetch(`/api/companies/${editingItem.id}`, { method: "PUT", body: JSON.stringify(formData) });
        toast({ title: "Updated", description: "Company updated successfully" });
      } else {
        result = await apiFetch("/api/companies", { method: "POST", body: JSON.stringify(formData) });
        toast({ title: "Created", description: "Company created successfully" });
      }

      // Directive 1: Clear branding cache to cascade changes to PDF engines
      if (result?._brandingCacheInvalidated || editingItem) {
        clearCompanyProfileCache();
        await loadProfile();
        setBrandingSynced(true);
        setTimeout(() => setBrandingSynced(false), 3000);
      }

      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`/api/companies/${id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Company deleted successfully" });
      setDeleteConfirm(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Elite PDF Export with corporate branding
  const handleExportPDF = async () => {
    try {
      const profile = await loadCompanyProfile();
      const columns: ExportColumnDef[] = [
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Company Name", type: "text" },
        { key: "address", label: "Address", type: "text" },
        { key: "phone", label: "Phone", type: "text" },
        { key: "mobile", label: "Mobile", type: "text" },
        { key: "email", label: "Email", type: "text" },
        { key: "vatNumber", label: "VAT Number", type: "text" },
        { key: "binNumber", label: "BIN", type: "text" },
        { key: "currencySymbol", label: "Currency", type: "text" },
        { key: "isActive", label: "Status", type: "boolean" },
      ];
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        columns.forEach(col => { row[col.key] = item[col.key]; });
        return row;
      });
      exportToPDF({
        title: "Companies Master List",
        subtitle: `Total Records: ${filteredData.length}`,
        orientation: "landscape",
        columns,
        data: exportData,
        company: profile || undefined,
        financialFooter: {
          printedBy: authState.user?.displayName || authState.user?.name || "System",
        },
      });
      toast({ title: "PDF Exported", description: "Companies master list exported with branding" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // CSV Export via bulk-export API
  const handleExportCSV = async () => {
    try {
      const res = await fetch("/api/core-config/bulk-export?module=companies");
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "companies-export.csv";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "CSV Exported", description: "Companies data exported with account hash" });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // Transactional CSV Import with all-or-nothing validation
  const handleImportCSV = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      document.body.removeChild(input);
      if (!file) return;

      try {
        const text = await file.text();
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (h: string) => h.trim().replace(/^["']|["']$/g, ""),
          encoding: "UTF-8",
        });

        if (result.errors.length > 0 && result.data.length === 0) {
          toast({ title: "Parse Error", description: result.errors[0].message, variant: "destructive" });
          return;
        }

        // Extract account hash from last row if present
        let accountHash: string | undefined;
        const rows = result.data as Record<string, string>[];
        if (rows.length > 0 && rows[rows.length - 1]["_accountHash"]) {
          accountHash = rows[rows.length - 1]["_accountHash"];
          rows.pop();
        }

        // Validate hash format
        if (accountHash && !accountHash.startsWith("CORE-companies-")) {
          toast({ title: "Hash Validation Failed", description: "This CSV was generated for a different module. Import rejected.", variant: "destructive" });
          return;
        }

        // Send to bulk-import API for all-or-nothing transaction
        const importResult = await apiFetch("/api/core-config/bulk-import", {
          method: "POST",
          body: JSON.stringify({ module: "companies", records: rows, accountHash }),
        });

        if (importResult.imported > 0) {
          toast({ title: "Import Complete", description: `${importResult.imported} companies imported successfully`, variant: "default" });
          loadData();
        } else if (importResult.validationErrors?.length > 0) {
          const errors = importResult.validationErrors.slice(0, 5).map((e: any) => `Row ${e.row}: ${e.message}`).join("; ");
          toast({ title: "Import Rejected", description: `${importResult.failed} errors. ${errors}`, variant: "destructive" });
        }
      } catch (e: any) {
        toast({ title: "Import Error", description: e.message, variant: "destructive" });
      }
    };

    input.click();
  };

  return (
    <div className="space-y-4">
      {/* Branding Sync Banner */}
      {brandingSynced && (
        <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3 flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" />
          <span className="text-sm text-emerald-700 dark:text-emerald-400 font-medium">Branding Synced — Company changes cascaded to all PDF engines</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center"><Building2 className="h-5 w-5 text-[#2563eb]" /></div><div><p className="text-xs text-slate-500">Total Companies</p><p className="text-xl font-bold">{stats.total}</p></div></CardContent></Card>
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-emerald-500" /></div><div><p className="text-xs text-slate-500">Active</p><p className="text-xl font-bold text-emerald-600">{stats.active}</p></div></CardContent></Card>
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center"><X className="h-5 w-5 text-red-500" /></div><div><p className="text-xs text-slate-500">Inactive</p><p className="text-xl font-bold text-red-500">{stats.inactive}</p></div></CardContent></Card>
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center"><Link2 className="h-5 w-5 text-amber-500" /></div><div><p className="text-xs text-slate-500">PDF Sync</p><p className="text-xl font-bold text-amber-600">{companyProfile ? "Active" : "None"}</p></div></CardContent></Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search companies..." className="pl-8" /></div>
        {canMutate && <Button onClick={openCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]"><Plus className="h-4 w-4 mr-1" /> Add Company</Button>}
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
        {canMutate && <Button variant="outline" size="sm" onClick={handleImportCSV}><Upload className="h-4 w-4 mr-1" /> Import</Button>}
        <Button variant="ghost" size="sm" onClick={loadData}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>

      {/* Data Table */}
      <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628]">
            <TableHead className="text-white font-semibold w-12">#</TableHead>
            <TableHead className="text-white font-semibold">Code</TableHead>
            <TableHead className="text-white font-semibold">Company Name</TableHead>
            <TableHead className="text-white font-semibold">Address</TableHead>
            <TableHead className="text-white font-semibold">Phone</TableHead>
            <TableHead className="text-white font-semibold">Email</TableHead>
            <TableHead className="text-white font-semibold">BIN</TableHead>
            <TableHead className="text-white font-semibold">Currency</TableHead>
            <TableHead className="text-white font-semibold">Products</TableHead>
            <TableHead className="text-white font-semibold">Status</TableHead>
            {canMutate && <TableHead className="text-white font-semibold w-24">Actions</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={11} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
            : filteredData.length === 0 ? <TableRow><TableCell colSpan={11} className="text-center py-8 text-slate-400">No companies found</TableCell></TableRow>
            : filteredData.map((item, idx) => (
              <TableRow key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                <TableCell className="font-mono text-xs">{item.code}</TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="text-sm text-slate-600 dark:text-slate-300 max-w-[200px] truncate">{item.address || "—"}</TableCell>
                <TableCell className="text-sm">{item.phone || item.mobile || "—"}</TableCell>
                <TableCell className="text-sm">{item.email || "—"}</TableCell>
                <TableCell className="font-mono text-xs">{item.binNumber || "—"}</TableCell>
                <TableCell className="text-center">{item.currencySymbol || "৳"}</TableCell>
                <TableCell className="text-center">{item._count?.products || 0}</TableCell>
                <TableCell><Badge variant={item.isActive ? "default" : "secondary"} className={item.isActive ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}>{item.isActive ? "Active" : "Inactive"}</Badge></TableCell>
                {canMutate && <TableCell><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3.5 w-3.5 text-blue-500" /></Button><Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(item.id)} className="h-7 w-7 p-0"><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button></div></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>

      {/* Full Company Editor Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#2563eb]" />
              {editingItem ? "Edit Company" : "New Company"}
            </DialogTitle>
            <DialogDescription>{editingItem ? "Update company details — changes cascade to all PDF engines" : "Create a new company workspace"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            {/* Section: Company Information */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-3"><Building2 className="h-4 w-4 text-[#2563eb]" />Company Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-sm font-medium">Company Name <span className="text-red-500">*</span></Label><Input value={formData.name || ""} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder="Enter company name" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">Address</Label><Input value={formData.address || ""} onChange={(e) => setFormData(prev => ({ ...prev, address: e.target.value }))} placeholder="Company address" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium flex items-center gap-1"><Phone className="h-3 w-3" />Phone</Label><Input value={formData.phone || ""} onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))} placeholder="Phone number" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium flex items-center gap-1"><Phone className="h-3 w-3" />Mobile</Label><Input value={formData.mobile || ""} onChange={(e) => setFormData(prev => ({ ...prev, mobile: e.target.value }))} placeholder="Mobile number" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium flex items-center gap-1"><Mail className="h-3 w-3" />Email</Label><Input type="email" value={formData.email || ""} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} placeholder="company@example.com" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium flex items-center gap-1"><Globe className="h-3 w-3" />Website</Label><Input value={formData.website || ""} onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))} placeholder="https://example.com" /></div>
              </div>
            </div>

            <Separator />

            {/* Section: Registration Details */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-3"><FileText className="h-4 w-4 text-emerald-500" />Registration Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5"><Label className="text-sm font-medium">VAT Number</Label><Input value={formData.vatNumber || ""} onChange={(e) => setFormData(prev => ({ ...prev, vatNumber: e.target.value }))} placeholder="VAT/TIN registration number" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">Trade License</Label><Input value={formData.tradeLicense || ""} onChange={(e) => setFormData(prev => ({ ...prev, tradeLicense: e.target.value }))} placeholder="Trade license number" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">BIN Number</Label><Input value={formData.binNumber || ""} onChange={(e) => setFormData(prev => ({ ...prev, binNumber: e.target.value }))} placeholder="Business Identification Number" /></div>
              </div>
            </div>

            <Separator />

            {/* Section: Invoice Branding */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-3"><FileText className="h-4 w-4 text-purple-500" />Invoice Branding</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Company Logo</Label>
                  <ImageUploadField value={formData.logo || null} onChange={(base64) => setFormData(prev => ({ ...prev, logo: base64 || "" }))} label="Logo" placeholder="Upload company logo" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-sm font-medium">Brand Logo</Label>
                  <ImageUploadField value={formData.brandLogo || null} onChange={(base64) => setFormData(prev => ({ ...prev, brandLogo: base64 || "" }))} label="Brand Logo" placeholder="Upload brand logo" />
                </div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">Currency Symbol</Label><Input value={formData.currencySymbol || "৳"} onChange={(e) => setFormData(prev => ({ ...prev, currencySymbol: e.target.value }))} placeholder="৳" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">Invoice Prefix</Label><Input value={formData.invoicePrefix || ""} onChange={(e) => setFormData(prev => ({ ...prev, invoicePrefix: e.target.value }))} placeholder="e.g., EM" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">Logo Width (mm)</Label><Input type="number" value={formData.logoWidth || 30} onChange={(e) => setFormData(prev => ({ ...prev, logoWidth: Number(e.target.value) }))} step="1" /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">Logo Height (mm)</Label><Input type="number" value={formData.logoHeight || 20} onChange={(e) => setFormData(prev => ({ ...prev, logoHeight: Number(e.target.value) }))} step="1" /></div>
              </div>
            </div>

            <Separator />

            {/* Section: System Settings */}
            <div>
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-3"><Settings className="h-4 w-4 text-orange-500" />System Settings</h4>
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1.5"><Label className="text-sm font-medium">Thank You Message</Label><Input value={formData.thankYouMsg || ""} onChange={(e) => setFormData(prev => ({ ...prev, thankYouMsg: e.target.value }))} placeholder="Thank You Come Again." /></div>
                <div className="space-y-1.5"><Label className="text-sm font-medium">System Note / Disclaimer</Label><Textarea value={formData.systemNote || ""} onChange={(e) => setFormData(prev => ({ ...prev, systemNote: e.target.value }))} placeholder="This is a system generated invoice..." rows={2} /></div>
                <div className="flex items-center gap-6">
                  <div className="flex items-center gap-2">
                    <Switch checked={!!formData.showBarcode} onCheckedChange={(v) => setFormData(prev => ({ ...prev, showBarcode: v }))} />
                    <Label className="text-sm">Show Barcode</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={!!formData.showPayInWord} onCheckedChange={(v) => setFormData(prev => ({ ...prev, showPayInWord: v }))} />
                    <Label className="text-sm">Show Pay in Word</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={formData.isActive !== false} onCheckedChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
                    <Label className="text-sm">Active</Label>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              <Save className="h-4 w-4 mr-1" />
              {saving ? "Saving..." : editingItem ? "Update & Sync" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirm Delete</DialogTitle><DialogDescription>Are you sure you want to delete this company? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// GENERIC CORE MODULE TAB (Categories, Colors, Brands, Units)
// With enterprise PDF/CSV export and transactional CSV import
// ============================================================

function CoreModuleTab({ moduleKey, label, icon: Icon, apiPath, isVatAuditor, userRole }: {
  moduleKey: string; label: string; icon: React.ElementType; apiPath: string;
  isVatAuditor: boolean; userRole: UserRole;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<any[]>([]);

  const canMutate = userRole === "admin" || userRole === "manager";

  // Module-specific configurations
  const getColumns = (): ExportColumnDef[] => {
    switch (moduleKey) {
      case "categories": return [
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Category Name", type: "text" },
        { key: "parentName", label: "Parent Category", type: "text" },
        { key: "description", label: "Description", type: "text" },
        { key: "productCount", label: "Products", type: "number" },
        { key: "isActive", label: "Status", type: "boolean" },
      ];
      case "colors": return [
        { key: "name", label: "Color Name", type: "text" },
        { key: "colorCode", label: "Hex Code", type: "text" },
        { key: "productCount", label: "Products", type: "number" },
        { key: "isActive", label: "Status", type: "boolean" },
      ];
      case "brands": return [
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Brand Name", type: "text" },
        { key: "description", label: "Description", type: "text" },
        { key: "productCount", label: "Products", type: "number" },
        { key: "isActive", label: "Status", type: "boolean" },
      ];
      case "units": return [
        { key: "code", label: "Code", type: "text" },
        { key: "name", label: "Unit Name", type: "text" },
        { key: "symbol", label: "Symbol", type: "text" },
        { key: "description", label: "Description", type: "text" },
        { key: "isActive", label: "Status", type: "boolean" },
      ];
      default: return [];
    }
  };

  const columns = getColumns();

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch(apiPath);
      const items = Array.isArray(result) ? result : [];
      // Enrich data with parent name and product count
      const enriched = items.map((item: any) => ({
        ...item,
        parentName: item.parent?.name || null,
        productCount: item._count?.products || 0,
      }));
      setData(enriched);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [apiPath, toast]);

  useEffect(() => { loadData(); }, [loadData]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(item => columns.some(col => String(item[col.key] ?? "").toLowerCase().includes(q)));
  }, [data, search, columns]);

  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(d => d.isActive !== false).length;
    return { total, active, inactive: total - active };
  }, [data]);

  const openCreate = () => {
    setEditingItem(null);
    const defaults: Record<string, any> = { name: "", description: "", isActive: true };
    if (moduleKey === "colors") defaults.colorCode = "#000000";
    if (moduleKey === "units") defaults.symbol = "";
    if (moduleKey === "categories") defaults.parentCategoryId = "";
    setFormData(defaults);
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    const values: Record<string, any> = {
      name: item.name || "",
      description: item.description || "",
      isActive: item.isActive !== undefined ? item.isActive : true,
    };
    if (moduleKey === "colors") values.colorCode = item.colorCode || "";
    if (moduleKey === "units") values.symbol = item.symbol || "";
    if (moduleKey === "categories") values.parentCategoryId = item.parentCategoryId || "";
    setFormData(values);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name?.trim()) {
      toast({ title: "Validation Error", description: "Name is required", variant: "destructive" });
      return;
    }
    if (moduleKey === "colors" && formData.colorCode && !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(formData.colorCode)) {
      toast({ title: "Validation Error", description: "Invalid hex color code. Use #RGB or #RRGGBB format", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (editingItem) {
        await apiFetch(`${apiPath}/${editingItem.id}`, { method: "PUT", body: JSON.stringify(formData) });
        toast({ title: "Updated", description: `${label} updated successfully` });
      } else {
        await apiFetch(apiPath, { method: "POST", body: JSON.stringify(formData) });
        toast({ title: "Created", description: `${label} created successfully` });
      }
      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await apiFetch(`${apiPath}/${id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: `${label} deleted successfully` });
      setDeleteConfirm(null);
      loadData();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Elite PDF Export with corporate branding
  const handleExportPDF = async () => {
    try {
      const profile = await loadCompanyProfile();
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        columns.forEach(col => { row[col.key] = item[col.key]; });
        return row;
      });
      exportToPDF({
        title: `${label} Master List`,
        subtitle: `Total Records: ${filteredData.length}`,
        orientation: "landscape",
        columns,
        data: exportData,
        company: profile || undefined,
        financialFooter: {
          printedBy: authState.user?.displayName || authState.user?.name || "System",
        },
      });
      toast({ title: "PDF Exported", description: `${label} master list exported` });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // Transactional CSV Import with all-or-nothing validation
  const handleImportCSV = () => {
    setImportErrors([]);
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.style.display = "none";
    document.body.appendChild(input);

    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      document.body.removeChild(input);
      if (!file) return;

      try {
        const text = await file.text();
        const result = Papa.parse(text, {
          header: true,
          skipEmptyLines: "greedy",
          transformHeader: (h: string) => h.trim().replace(/^["']|["']$/g, ""),
          encoding: "UTF-8",
        });

        if (result.errors.length > 0 && result.data.length === 0) {
          toast({ title: "Parse Error", description: result.errors[0].message, variant: "destructive" });
          return;
        }

        let accountHash: string | undefined;
        const rows = result.data as Record<string, string>[];
        if (rows.length > 0 && rows[rows.length - 1]["_accountHash"]) {
          accountHash = rows[rows.length - 1]["_accountHash"];
          rows.pop();
        }

        // Validate hash
        if (accountHash && !accountHash.startsWith(`CORE-${moduleKey}-`)) {
          toast({ title: "Hash Validation Failed", description: "This CSV was generated for a different module. Import rejected.", variant: "destructive" });
          return;
        }

        // Send to bulk-import API for all-or-nothing transaction
        const importResult = await apiFetch("/api/core-config/bulk-import", {
          method: "POST",
          body: JSON.stringify({ module: moduleKey, records: rows, accountHash }),
        });

        if (importResult.imported > 0) {
          toast({ title: "Import Complete", description: `${importResult.imported} ${label.toLowerCase()} imported successfully` });
          loadData();
        } else if (importResult.validationErrors?.length > 0) {
          setImportErrors(importResult.validationErrors);
          const errors = importResult.validationErrors.slice(0, 3).map((e: any) => `Row ${e.row}: ${e.message}`).join("; ");
          toast({ title: "Import Rejected", description: `${importResult.failed} errors. Entire file rolled back. ${errors}`, variant: "destructive" });
        }
      } catch (e: any) {
        toast({ title: "Import Error", description: e.message, variant: "destructive" });
      }
    };

    input.click();
  };

  // CSV Export via bulk-export API
  const handleExportCSV = async () => {
    try {
      const res = await fetch(`/api/core-config/bulk-export?module=${moduleKey}`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${moduleKey}-export.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast({ title: "CSV Exported", description: `${label} data exported with account hash` });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // Category parent options
  const [categoryParents, setCategoryParents] = useState<any[]>([]);
  useEffect(() => {
    if (moduleKey === "categories") {
      apiFetch("/api/categories").then(items => {
        setCategoryParents(Array.isArray(items) ? items : []);
      }).catch(() => setCategoryParents([]));
    }
  }, [moduleKey]);

  const renderFormField = () => {
    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Name <span className="text-red-500">*</span></Label>
          <Input value={formData.name || ""} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} placeholder={`Enter ${label.toLowerCase()} name`} />
        </div>

        {moduleKey === "colors" && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Color Code <span className="text-red-500">*</span></Label>
            <div className="flex items-center gap-3">
              <input type="color" value={formData.colorCode || "#000000"} onChange={(e) => setFormData(prev => ({ ...prev, colorCode: e.target.value }))} className="h-10 w-14 rounded border border-slate-300 cursor-pointer" />
              <Input value={formData.colorCode || ""} onChange={(e) => setFormData(prev => ({ ...prev, colorCode: e.target.value }))} placeholder="#000000" className="flex-1" />
              {formData.colorCode && <div className="h-10 w-10 rounded-lg border border-slate-300" style={{ backgroundColor: formData.colorCode }} />}
            </div>
          </div>
        )}

        {moduleKey === "units" && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Symbol</Label>
            <Input value={formData.symbol || ""} onChange={(e) => setFormData(prev => ({ ...prev, symbol: e.target.value }))} placeholder="e.g., pcs, kg, m, l" />
          </div>
        )}

        {moduleKey === "categories" && (
          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Parent Category</Label>
            <Select value={formData.parentCategoryId || "_none"} onValueChange={(v) => setFormData(prev => ({ ...prev, parentCategoryId: v === "_none" ? "" : v }))}>
              <SelectTrigger><SelectValue placeholder="Select parent category" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">None (Top Level)</SelectItem>
                {categoryParents.filter(c => c.id !== editingItem?.id).map(cat => (
                  <SelectItem key={cat.id} value={cat.id}>{cat.name} ({cat.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Description</Label>
          <Textarea value={formData.description || ""} onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))} placeholder={`Enter description`} rows={3} />
        </div>

        <div className="flex items-center gap-2">
          <Switch checked={formData.isActive !== false} onCheckedChange={(v) => setFormData(prev => ({ ...prev, isActive: v }))} />
          <Label className="text-sm">Active</Label>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Import Errors Panel */}
      {importErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 max-h-40 overflow-y-auto">
          <div className="flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4 text-red-600" /><span className="text-sm font-medium text-red-700 dark:text-red-400">Import Validation Errors ({importErrors.length})</span></div>
          <div className="space-y-1">
            {importErrors.slice(0, 10).map((err: any, i: number) => (
              <p key={i} className="text-xs text-red-600 dark:text-red-400">Row {err.row}, {err.field}: {err.message}</p>
            ))}
            {importErrors.length > 10 && <p className="text-xs text-red-500">...and {importErrors.length - 10} more errors</p>}
          </div>
          <Button variant="ghost" size="sm" className="mt-2" onClick={() => setImportErrors([])}>Dismiss</Button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center"><Icon className="h-5 w-5 text-[#2563eb]" /></div><div><p className="text-xs text-slate-500">Total {label}</p><p className="text-xl font-bold">{stats.total}</p></div></CardContent></Card>
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center"><CheckCircle className="h-5 w-5 text-emerald-500" /></div><div><p className="text-xs text-slate-500">Active</p><p className="text-xl font-bold text-emerald-600">{stats.active}</p></div></CardContent></Card>
        <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-4 flex items-center gap-3"><div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center"><X className="h-5 w-5 text-red-500" /></div><div><p className="text-xs text-slate-500">Inactive</p><p className="text-xl font-bold text-red-500">{stats.inactive}</p></div></CardContent></Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${label.toLowerCase()}...`} className="pl-8" /></div>
        {canMutate && <Button onClick={openCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]"><Plus className="h-4 w-4 mr-1" /> Add {singularize(label)}</Button>}
        <Button variant="outline" size="sm" onClick={handleExportCSV}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
        {canMutate && <Button variant="outline" size="sm" onClick={handleImportCSV}><Upload className="h-4 w-4 mr-1" /> Import</Button>}
        <Button variant="ghost" size="sm" onClick={loadData}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
      </div>

      {/* Data Table */}
      <Card className="border-slate-200 dark:border-slate-700"><CardContent className="p-0"><div className="overflow-x-auto">
        <Table>
          <TableHeader><TableRow className="bg-[#132240] dark:bg-[#0a1628]">
            <TableHead className="text-white font-semibold w-12">#</TableHead>
            {columns.map(col => <TableHead key={col.key} className="text-white font-semibold whitespace-nowrap">{col.label}</TableHead>)}
            {canMutate && <TableHead className="text-white font-semibold w-24">Actions</TableHead>}
          </TableRow></TableHeader>
          <TableBody>
            {loading ? <TableRow><TableCell colSpan={columns.length + 2} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
            : filteredData.length === 0 ? <TableRow><TableCell colSpan={columns.length + 2} className="text-center py-8 text-slate-400">No {label.toLowerCase()} found</TableCell></TableRow>
            : filteredData.map((item, idx) => (
              <TableRow key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                {columns.map(col => {
                  const val = item[col.key];
                  if (col.key === "isActive") return <TableCell key={col.key}><Badge variant={val ? "default" : "secondary"} className={val ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800"}>{val ? "Active" : "Inactive"}</Badge></TableCell>;
                  if (col.key === "colorCode" && val) return <TableCell key={col.key}><div className="flex items-center gap-2"><div className="h-5 w-5 rounded-full border border-slate-300 shadow-sm" style={{ backgroundColor: String(val) }} /><span className="font-mono text-sm">{String(val)}</span></div></TableCell>;
                  if (col.key === "symbol" && val) return <TableCell key={col.key}><span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-sm font-mono">{String(val)}</span></TableCell>;
                  if (col.key === "productCount") return <TableCell key={col.key} className="text-center font-medium">{val || 0}</TableCell>;
                  if (col.key === "parentName" && val) return <TableCell key={col.key}><div className="flex items-center gap-1"><ChevronRight className="h-3 w-3 text-slate-400" /><span className="text-sm">{String(val)}</span></div></TableCell>;
                  return <TableCell key={col.key} className="whitespace-nowrap">{fmt(val, col.type)}</TableCell>;
                })}
                {canMutate && <TableCell><div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="h-7 w-7 p-0"><Edit className="h-3.5 w-3.5 text-blue-500" /></Button><Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(item.id)} className="h-7 w-7 p-0"><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button></div></TableCell>}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div></CardContent></Card>
      <div className="text-xs text-slate-500 dark:text-slate-400">Showing {filteredData.length} of {data.length} {label.toLowerCase()}</div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-[#2563eb]" />{editingItem ? `Edit ${singularize(label)}` : `New ${singularize(label)}`}</DialogTitle>
            <DialogDescription>{editingItem ? "Update details" : "Create a new entry"}</DialogDescription>
          </DialogHeader>
          <div className="py-2">{renderFormField()}</div>
          <DialogFooter><Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button><Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]"><Save className="h-4 w-4 mr-1" />{saving ? "Saving..." : editingItem ? "Update" : "Create"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Confirm Delete</DialogTitle><DialogDescription>Are you sure? This action cannot be undone.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button><Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Delete</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function BasicModulesGroupPage({ activeModule }: { activeModule?: string }) {
  const auth = useAuth();
  const isVatAuditor = auth.user?.role === "vat_auditor";
  const userRole = auth.user?.role || "admin";
  const [activeTab, setActiveTab] = useState(activeModule || "companies");

  const structuralModules = MODULE_CONFIGS.filter(m => m.category === "structural");
  const operationalModules = MODULE_CONFIGS.filter(m => m.category === "operational");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[#2563eb]" />
            Basic Foundation Modules
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Core configurations, structural infrastructure, and operational framework setup
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
        <div className="space-y-4">
          {/* Core Configurations Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Building2 className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Core Configurations</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Companies, Categories, Colors, Brands, Units</p>
              </div>
            </div>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto flex-wrap gap-1 p-1">
              {[
                { key: "companies", label: "Companies", icon: Building2 },
                { key: "categories", label: "Categories", icon: Tag },
                { key: "colors", label: "Colors", icon: Palette },
                { key: "brands", label: "Brands", icon: Box },
                { key: "units", label: "Units", icon: Ruler },
              ].map(mod => {
                const ModIcon = mod.icon;
                return (
                  <TabsTrigger key={mod.key} value={mod.key} className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-xs gap-1 px-3 py-1.5">
                    <ModIcon className="h-3.5 w-3.5" />
                    {mod.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Core Config Tabs Content */}
          <TabsContent value="companies">
            <CompaniesWorkspace isVatAuditor={isVatAuditor} userRole={userRole} />
          </TabsContent>
          <TabsContent value="categories">
            <CoreModuleTab moduleKey="categories" label="Categories" icon={Tag} apiPath="/api/categories" isVatAuditor={isVatAuditor} userRole={userRole} />
          </TabsContent>
          <TabsContent value="colors">
            <CoreModuleTab moduleKey="colors" label="Colors" icon={Palette} apiPath="/api/colors" isVatAuditor={isVatAuditor} userRole={userRole} />
          </TabsContent>
          <TabsContent value="brands">
            <CoreModuleTab moduleKey="brands" label="Brands" icon={Box} apiPath="/api/brands" isVatAuditor={isVatAuditor} userRole={userRole} />
          </TabsContent>
          <TabsContent value="units">
            <CoreModuleTab moduleKey="units" label="Units" icon={Ruler} apiPath="/api/units" isVatAuditor={isVatAuditor} userRole={userRole} />
          </TabsContent>

          {/* Structural Infrastructure Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Layers className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Structural Infrastructure</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Departments, Godowns, Segments, Capacities</p>
              </div>
            </div>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto flex-wrap gap-1 p-1">
              {structuralModules.map(mod => {
                const ModIcon = mod.icon;
                return (
                  <TabsTrigger key={mod.key} value={mod.key} className="data-[state=active]:bg-emerald-600 data-[state=active]:text-white text-xs gap-1 px-3 py-1.5">
                    <ModIcon className="h-3.5 w-3.5" />
                    {mod.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {structuralModules.map(mod => (
            <TabsContent key={mod.key} value={mod.key}>
              <ModuleTab config={mod} isVatAuditor={isVatAuditor} userRole={userRole} />
            </TabsContent>
          ))}

          {/* Operational Framework Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Settings className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Operational Framework</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">SR Target Setup, Payment Options, Card Types, CardType Setup</p>
              </div>
            </div>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto flex-wrap gap-1 p-1">
              {operationalModules.map(mod => {
                const ModIcon = mod.icon;
                return (
                  <TabsTrigger key={mod.key} value={mod.key} className="data-[state=active]:bg-purple-600 data-[state=active]:text-white text-xs gap-1 px-3 py-1.5">
                    <ModIcon className="h-3.5 w-3.5" />
                    {mod.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {operationalModules.map(mod => (
            <TabsContent key={mod.key} value={mod.key}>
              <ModuleTab config={mod} isVatAuditor={isVatAuditor} userRole={userRole} />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
