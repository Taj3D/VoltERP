"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Building2, Tag, Palette, Box, Layers, Building,
  Warehouse, CreditCard, Settings, Target, Hash, X, Shield,
  CheckCircle, ChevronRight, Ruler,
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
import { useToast } from "@/hooks/use-toast";
import {
  exportToPDF, exportToCSV, importFromCSV,
} from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef } from "@/lib/export-utils";
import ImageUploadField from "@/components/erp/ui/ImageUploadField";

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

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${Number(v).toLocaleString("en-BD", { minimumFractionDigits: 2 })}`;
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
// MODULE CONFIGURATION
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
  // ── Core Configurations ──
  {
    key: "companies", label: "Companies", icon: Building2, apiPath: "/api/companies",
    category: "core",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Company Name", type: "text" },
      { key: "address", label: "Address", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "_count.products", label: "Products", type: "number" },
      { key: "_count.orderSheets", label: "Order Sheets", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "code", label: "Code", type: "text", required: false, placeholder: "Auto-generated" },
      { key: "name", label: "Company Name", type: "text", required: true },
      { key: "address", label: "Address", type: "textarea", required: false },
      { key: "phone", label: "Phone", type: "text", required: false },
      { key: "email", label: "Email", type: "email", required: false },
      { key: "brandLogo", label: "Brand Logo", type: "image" },
    ],
  },
  {
    key: "categories", label: "Categories", icon: Tag, apiPath: "/api/categories",
    category: "core",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Category Name", type: "text" },
      { key: "parent.name", label: "Parent Category", type: "text" },
      { key: "_count.products", label: "Products", type: "number" },
      { key: "_count.children", label: "Sub-Categories", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "code", label: "Code", type: "text", required: false, placeholder: "Auto-generated (CAT-001)" },
      { key: "name", label: "Category Name", type: "text", required: true },
      { key: "parentCategoryId", label: "Parent Category", type: "select", required: false, options: [] },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    key: "colors", label: "Colors", icon: Palette, apiPath: "/api/colors",
    category: "core",
    columns: [
      { key: "name", label: "Color Name", type: "text" },
      { key: "colorCode", label: "Color Code", type: "text" },
      { key: "_count.products", label: "Products", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Color Name", type: "text", required: true },
      { key: "colorCode", label: "Color Code (Hex)", type: "text", required: true, placeholder: "#000000" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    key: "brands", label: "Brands", icon: Box, apiPath: "/api/brands",
    category: "core",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Brand Name", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "_count.products", label: "Products", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Brand Name", type: "text", required: true },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    key: "units", label: "Units", icon: Ruler, apiPath: "/api/units",
    category: "core",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Unit Name", type: "text" },
      { key: "symbol", label: "Symbol", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Unit Name", type: "text", required: true, placeholder: "e.g. Piece, Kilogram" },
      { key: "symbol", label: "Symbol", type: "text", required: false, placeholder: "e.g. pcs, kg, m, l" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
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
// HELPER: Get nested value from object
// ============================================================

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

// ============================================================
// GENERIC MODULE TAB COMPONENT
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

  const maskedColumns = useMemo(() => {
    if (!isVatAuditor) return [];
    return config.vatMaskedColumns || [];
  }, [isVatAuditor, config.vatMaskedColumns]);

  // Load data
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

  // Load dynamic select options
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
        else if (field.key === "departmentId") apiPath = "/api/departments";
        else if (field.key === "designationId") apiPath = "/api/designations";
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

  // Filtered data
  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const q = search.toLowerCase();
    return data.filter(item =>
      config.columns.some(col =>
        String(getNestedValue(item, col.key) ?? "").toLowerCase().includes(q)
      )
    );
  }, [data, search, config.columns]);

  // KPI stats
  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(d => d.isActive !== false).length;
    const inactive = total - active;
    return { total, active, inactive };
  }, [data]);

  // Open create dialog
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

  // Open edit dialog
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

  // Save (create or update)
  const handleSave = async () => {
    // Validate required fields
    for (const f of config.formFields) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        toast({ title: "Validation Error", description: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    try {
      if (editingItem) {
        await apiFetch(`${config.apiPath}/${editingItem.id}`, {
          method: "PUT",
          body: JSON.stringify(formData),
        });
        toast({ title: "Updated", description: `${config.label} updated successfully` });
      } else {
        await apiFetch(config.apiPath, {
          method: "POST",
          body: JSON.stringify(formData),
        });
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

  // Delete
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

  // Export CSV
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
      exportToCSV({
        title: config.label,
        columns: config.columns,
        data: exportData,
        isVatAuditor,
        vatMaskedColumns: maskedColumns,
      });
      toast({ title: "CSV Exported", description: `${config.label} data exported` });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
    }
  };

  // Export PDF
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

  // Import CSV
  const handleImportCSV = () => {
    importFromCSV({ apiPath: config.apiPath, formFields: config.formFields }).then((result) => {
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    });
  };

  // Render form field
  const renderFormField = (field: ExportFieldDef) => {
    const val = formData[field.key] ?? "";

    if (field.type === "image") {
      return (
        <ImageUploadField
          value={val || null}
          onChange={(base64) => setFormData(prev => ({ ...prev, [field.key]: base64 || "" }))}
          label={field.label}
          placeholder={field.placeholder || `Upload ${field.label.toLowerCase()}`}
        />
      );
    }

    if (field.type === "select") {
      const options = field.options?.length ? field.options :
        (dynamicOptions[field.key] || []).map((item: any) => ({
          value: item.id, label: item.name || item.employeeCode || item.code || item.id,
        }));
      return (
        <Select value={String(val)} onValueChange={(v) => setFormData(prev => ({ ...prev, [field.key]: v }))}>
          <SelectTrigger><SelectValue placeholder={`Select ${field.label}`} /></SelectTrigger>
          <SelectContent>
            {options.map(opt => (
              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    if (field.type === "checkbox") {
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!val}
            onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.checked }))}
            className="h-4 w-4 rounded border-slate-300"
          />
          <Label>{field.label}</Label>
        </div>
      );
    }

    if (field.type === "textarea") {
      return (
        <Textarea
          value={String(val)}
          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
          placeholder={field.placeholder || field.label}
          rows={3}
        />
      );
    }

    return (
      <Input
        type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
        value={String(val)}
        onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }))}
        placeholder={field.placeholder || field.label}
        step={field.step}
      />
    );
  };

  // Month names for SR Target display
  const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const Icon = config.icon;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
              <Icon className="h-5 w-5 text-[#2563eb]" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Total {config.label}</p>
              <p className="text-xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Active</p>
              <p className="text-xl font-bold text-emerald-600">{stats.active}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <X className="h-5 w-5 text-red-500" />
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Inactive</p>
              <p className="text-xl font-bold text-red-500">{stats.inactive}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${config.label.toLowerCase()}...`}
            className="pl-8"
          />
        </div>
        {canMutate && (
          <Button onClick={openCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4 mr-1" /> Add {config.label.slice(0, -1)}
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
        <Button variant="ghost" size="sm" onClick={loadData}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* VAT Audit Mode Banner */}
      {isVatAuditor && maskedColumns.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">VAT AUDIT MODE — Financial columns are masked</span>
        </div>
      )}

      {/* Data Table */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  {config.columns.map(col => (
                    <TableHead key={col.key} className="text-white font-semibold whitespace-nowrap">
                      {col.label}
                    </TableHead>
                  ))}
                  {canMutate && <TableHead className="text-white font-semibold w-24">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={config.columns.length + 2} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow><TableCell colSpan={config.columns.length + 2} className="text-center py-8 text-slate-400">No {config.label.toLowerCase()} found</TableCell></TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      {config.columns.map(col => {
                        let val = getNestedValue(item, col.key);
                        if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";

                        // Special rendering
                        if (col.key === "isActive") {
                          return (
                            <TableCell key={col.key}>
                              <Badge variant={val ? "default" : "secondary"} className={val ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}>
                                {val ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                          );
                        }

                        // Color preview
                        if (col.key === "colorCode" && val) {
                          return (
                            <TableCell key={col.key}>
                              <div className="flex items-center gap-2">
                                <div className="h-4 w-4 rounded-full border border-slate-300" style={{ backgroundColor: String(val) }} />
                                <span className="text-sm">{String(val)}</span>
                              </div>
                            </TableCell>
                          );
                        }

                        // Month number to name for SR targets
                        if (col.key === "month" && typeof val === "number" && val >= 1 && val <= 12) {
                          return <TableCell key={col.key} className="whitespace-nowrap">{MONTH_NAMES[val]}</TableCell>;
                        }

                        // Currency formatting
                        if (col.type === "currency") {
                          return <TableCell key={col.key} className="whitespace-nowrap font-medium">{fmtCurrency(val)}</TableCell>;
                        }

                        return <TableCell key={col.key} className="whitespace-nowrap">{fmt(val, col.type)}</TableCell>;
                      })}
                      {canMutate && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="h-7 w-7 p-0">
                              <Edit className="h-3.5 w-3.5 text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(item.id)} className="h-7 w-7 p-0">
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Record count */}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        Showing {filteredData.length} of {data.length} {config.label.toLowerCase()}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? `Edit ${config.label.slice(0, -1)}` : `New ${config.label.slice(0, -1)}`}</DialogTitle>
            <DialogDescription>
              {editingItem ? `Update ${config.label.slice(0, -1).toLowerCase()} details` : `Create a new ${config.label.slice(0, -1).toLowerCase()}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {config.formFields.map(field => (
              <div key={field.key} className="space-y-1.5">
                {field.type !== "checkbox" && field.type !== "image" && (
                  <Label className="text-sm font-medium">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </Label>
                )}
                {renderFormField(field)}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving ? "Saving..." : editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>Are you sure you want to delete this {config.label.slice(0, -1).toLowerCase()}? This action cannot be undone.</DialogDescription>
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
// MAIN COMPONENT
// ============================================================

export default function BasicModulesGroupPage({ activeModule }: { activeModule?: string }) {
  const auth = useAuth();
  const isVatAuditor = auth.user?.role === "vat_auditor";
  const userRole = auth.user?.role || "admin";

  // Determine active tab
  const [activeTab, setActiveTab] = useState(activeModule || "companies");

  // Group modules by category
  const coreModules = MODULE_CONFIGS.filter(m => m.category === "core");
  const structuralModules = MODULE_CONFIGS.filter(m => m.category === "structural");
  const operationalModules = MODULE_CONFIGS.filter(m => m.category === "operational");

  const activeConfig = MODULE_CONFIGS.find(m => m.key === activeTab);

  // Category headers
  const categoryInfo: Record<string, { label: string; icon: React.ElementType; color: string; desc: string }> = {
    core: { label: "Core Configurations", icon: Building2, color: "text-blue-500", desc: "Companies, Categories, Colors, Brands, Units" },
    structural: { label: "Structural Infrastructure", icon: Layers, color: "text-emerald-500", desc: "Departments, Godowns, Segments, Capacities" },
    operational: { label: "Operational Framework", icon: Settings, color: "text-purple-500", desc: "SR Target Setup, Payment Options, Card Types, CardType Setup" },
  };

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
              {coreModules.map(mod => {
                const Icon = mod.icon;
                return (
                  <TabsTrigger key={mod.key} value={mod.key} className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-xs gap-1 px-3 py-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {mod.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

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
                const Icon = mod.icon;
                return (
                  <TabsTrigger key={mod.key} value={mod.key} className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-xs gap-1 px-3 py-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {mod.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

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
                const Icon = mod.icon;
                return (
                  <TabsTrigger key={mod.key} value={mod.key} className="data-[state=active]:bg-[#2563eb] data-[state=active]:text-white text-xs gap-1 px-3 py-1.5">
                    <Icon className="h-3.5 w-3.5" />
                    {mod.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          {/* Tab Content */}
          {MODULE_CONFIGS.map(mod => (
            <TabsContent key={mod.key} value={mod.key}>
              <ModuleTab config={mod} isVatAuditor={isVatAuditor} userRole={userRole} />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
}
