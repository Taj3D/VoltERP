"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Building, Layers, Warehouse, Hash, X, Shield,
  CheckCircle, Loader2, AlertTriangle, Power, Phone,
  MapPin, User, Package, ShoppingCart, Truck, CircleDollarSign,
  ArrowRightLeft, CheckCircle2, XCircle,
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
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef, CompanyProfile as ExportCompanyProfile } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const bdFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  if (type === "currency") return `৳${bdFmt.format(Number(v))}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") return bdFmt.format(Number(v));
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
  } catch { /* ignore */ }
  const res = await fetch(path, { headers: { ...authHeaders, ...opts?.headers }, ...opts });
  if (!res.ok) {
    if (res.status === 401) { localStorage.removeItem("ems_auth"); window.location.reload(); }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
}

// ============================================================
// AUTH (local pattern matching BasicModulesGroupPage)
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
// STRUCTURE MODULE CONFIGURATION
// ============================================================

const CAPACITY_UNIT_OPTIONS = [
  { value: "m³", label: "Cubic Meters (m³)" },
  { value: "sqft", label: "Square Feet (sqft)" },
  { value: "units", label: "Units/Items" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "tons", label: "Metric Tons" },
];

const VALID_CAPACITY_UNITS = ["m³", "sqft", "units", "kg", "tons"];
const VALID_GODOWN_STATUSES = ["ACTIVE", "SUSPENDED"];
const CAPACITY_OVERFLOW_LIMIT = 999999999;

// Column definitions per module for PDF export
const DEPARTMENT_COLUMNS: ExportColumnDef[] = [
  { key: "code", label: "Code", type: "text" },
  { key: "name", label: "Name", type: "text" },
  { key: "description", label: "Description", type: "text" },
  { key: "_count.employees", label: "Employees", type: "number" },
  { key: "_count.designations", label: "Designations", type: "number" },
  { key: "isActive", label: "Status", type: "boolean" },
];

const GODOWN_COLUMNS: ExportColumnDef[] = [
  { key: "code", label: "Code", type: "text" },
  { key: "name", label: "Name", type: "text" },
  { key: "address", label: "Address", type: "text" },
  { key: "phone", label: "Phone", type: "text" },
  { key: "inCharge", label: "In Charge", type: "text" },
  { key: "status", label: "Status", type: "text" },
  { key: "capacityValue", label: "Capacity", type: "number" },
  { key: "capacityUnit", label: "Capacity Unit", type: "text" },
  { key: "_count.products", label: "Products", type: "number" },
  { key: "isActive", label: "Active", type: "boolean" },
];

const SEGMENT_COLUMNS: ExportColumnDef[] = [
  { key: "code", label: "Code", type: "text" },
  { key: "name", label: "Name", type: "text" },
  { key: "description", label: "Description", type: "text" },
  { key: "_count.products", label: "Products", type: "number" },
  { key: "isActive", label: "Status", type: "boolean" },
];

const CAPACITY_COLUMNS: ExportColumnDef[] = [
  { key: "code", label: "Code", type: "text" },
  { key: "name", label: "Name", type: "text" },
  { key: "capacityValue", label: "Capacity Value", type: "number" },
  { key: "capacityUnit", label: "Capacity Unit", type: "text" },
  { key: "description", label: "Description", type: "text" },
  { key: "isActive", label: "Status", type: "boolean" },
];

// Form field definitions per module
const DEPARTMENT_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Department Name", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
];

const GODOWN_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Warehouse Name", type: "text", required: true },
  { key: "address", label: "Address", type: "textarea", required: true },
  { key: "phone", label: "Phone", type: "text", required: true },
  { key: "inCharge", label: "In Charge", type: "text" },
  { key: "status", label: "Status", type: "select", required: true, options: [
    { value: "ACTIVE", label: "Active" },
    { value: "SUSPENDED", label: "Suspended (Emergency Closure)" },
  ]},
  { key: "capacityValue", label: "Capacity Value", type: "number", required: false, step: "0.01" },
  { key: "capacityUnit", label: "Capacity Unit", type: "select", required: false, options: CAPACITY_UNIT_OPTIONS },
  { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
];

const SEGMENT_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Segment Name", type: "text", required: true },
  { key: "description", label: "Description", type: "textarea" },
  { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
];

const CAPACITY_FIELDS: ExportFieldDef[] = [
  { key: "name", label: "Capacity Name", type: "text", required: true },
  { key: "capacityValue", label: "Capacity Value", type: "number", required: true, step: "0.01" },
  { key: "capacityUnit", label: "Capacity Unit", type: "select", required: true, options: CAPACITY_UNIT_OPTIONS },
  { key: "description", label: "Description", type: "textarea" },
  { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
];

// ============================================================
// HELPERS
// ============================================================

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
}

function sanitizeInput(input: string): string {
  return input.replace(/<[^>]*>/g, "").replace(/\r\n/g, "\n").replace(/  +/g, " ").trim();
}

// ============================================================
// ROUTING STATUS PANEL (Godowns tab only)
// ============================================================

interface RoutingStatus {
  id: string;
  code: string;
  name: string;
  status: string;
  productCount: number;
  pendingPurchaseOrders: number;
  pendingSalesOrders: number;
  pendingHireSales: number;
  pendingTransfers: number;
  isReceivable: boolean;
  isDispatchable: boolean;
}

function WarehouseRoutingPanel({ onRefreshKey }: { onRefreshKey: number }) {
  const { toast } = useToast();
  const [routingData, setRoutingData] = useState<RoutingStatus[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRouting = useCallback(async () => {
    setLoading(true);
    try {
      const result = await apiFetch("/api/godowns/routing-status");
      setRoutingData(Array.isArray(result) ? result : []);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { loadRouting(); }, [loadRouting, onRefreshKey]);

  const suspendedWithOps = routingData.filter(
    (r) => r.status === "SUSPENDED" && (r.pendingPurchaseOrders + r.pendingSalesOrders + r.pendingHireSales + r.pendingTransfers > 0)
  );

  return (
    <div className="space-y-4">
      {/* Warning banner if any SUSPENDED godown has pending operations */}
      {suspendedWithOps.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            WARNING: {suspendedWithOps.length} suspended warehouse(s) have pending operations —
            POs: {suspendedWithOps.reduce((s, r) => s + r.pendingPurchaseOrders, 0)},
            SOs: {suspendedWithOps.reduce((s, r) => s + r.pendingSalesOrders, 0)},
            Hire Sales: {suspendedWithOps.reduce((s, r) => s + r.pendingHireSales, 0)},
            Transfers: {suspendedWithOps.reduce((s, r) => s + r.pendingTransfers, 0)}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
          <Truck className="h-4 w-4" /> Warehouse Routing Status
        </h3>
        <Button variant="ghost" size="sm" onClick={loadRouting}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          <span className="ml-2 text-sm text-slate-500">Loading routing parameters...</span>
        </div>
      ) : routingData.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">No warehouses found</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {routingData.map((r) => (
            <Card
              key={r.id}
              className={`border ${
                r.status === "SUSPENDED"
                  ? "border-red-300 dark:border-red-700 bg-red-50/30 dark:bg-red-900/10"
                  : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <CardContent className="p-3 space-y-2">
                {/* Header row */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">{r.name}</p>
                    <p className="text-xs text-slate-500">{r.code}</p>
                  </div>
                  <Badge
                    variant={r.status === "ACTIVE" ? "default" : "destructive"}
                    className={
                      r.status === "ACTIVE"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }
                  >
                    {r.status === "ACTIVE" ? "ACTIVE" : "SUSPENDED"}
                  </Badge>
                </div>

                {/* Metrics grid */}
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Package className="h-3 w-3 text-slate-400" />
                    Products: <span className="font-medium text-slate-900 dark:text-white">{r.productCount}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <ShoppingCart className="h-3 w-3 text-slate-400" />
                    POs: <span className="font-medium text-slate-900 dark:text-white">{r.pendingPurchaseOrders}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <CircleDollarSign className="h-3 w-3 text-slate-400" />
                    SOs: <span className="font-medium text-slate-900 dark:text-white">{r.pendingSalesOrders}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Hash className="h-3 w-3 text-slate-400" />
                    Hire: <span className="font-medium text-slate-900 dark:text-white">{r.pendingHireSales}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 col-span-2">
                    <ArrowRightLeft className="h-3 w-3 text-slate-400" />
                    Transfers: <span className="font-medium text-slate-900 dark:text-white">{r.pendingTransfers}</span>
                  </div>
                </div>

                <Separator />

                {/* Receivable / Dispatchable */}
                <div className="flex items-center gap-4 text-xs">
                  <span className="flex items-center gap-1">
                    {r.isReceivable ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <span className={r.isReceivable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                      Receivable
                    </span>
                  </span>
                  <span className="flex items-center gap-1">
                    {r.isDispatchable ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <span className={r.isDispatchable ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                      Dispatchable
                    </span>
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// GENERIC STRUCTURE MODULE TAB COMPONENT
// ============================================================

interface StructureModuleConfig {
  key: string;
  label: string;
  icon: React.ElementType;
  apiPath: string;
  columns: ExportColumnDef[];
  formFields: ExportFieldDef[];
  vatMaskedColumns?: string[];
}

function StructureModuleTab({
  config,
  isVatAuditor,
  userRole,
  onGodownModified,
}: {
  config: StructureModuleConfig;
  isVatAuditor: boolean;
  userRole: UserRole;
  onGodownModified?: () => void;
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
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [snapshot, setSnapshot] = useState<any[] | null>(null);
  const [capacityError, setCapacityError] = useState(false);
  const [emergencyToggleConfirm, setEmergencyToggleConfirm] = useState<any | null>(null);

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

  useEffect(() => { loadData(); }, [loadData]);

  // Load company profile
  useEffect(() => {
    const loadProfile = async () => {
      try {
        const profile = await apiFetch("/api/company-branding");
        setCompanyProfile(profile);
      } catch { /* ignore */ }
    };
    loadProfile();
  }, []);

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
    setCapacityError(false);
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
    setCapacityError(false);
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

  // Emergency Closure Toggle
  const handleEmergencyToggle = async (item: any) => {
    const newStatus = item.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    setSnapshot([...data]);
    try {
      await apiFetch(`${config.apiPath}/${item.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...item, status: newStatus }),
      });
      toast({
        title: newStatus === "SUSPENDED" ? "Emergency Closure Activated" : "Warehouse Reactivated",
        description: newStatus === "SUSPENDED"
          ? `${item.name} has been suspended. All stock transfers and receipt orders are now blocked.`
          : `${item.name} has been reactivated and is now operational.`,
        variant: newStatus === "SUSPENDED" ? "destructive" : "default",
      });
      setData(prev => prev.map(d => d.id === item.id ? { ...d, status: newStatus } : d));
      setEmergencyToggleConfirm(null);
      loadData();
      if (onGodownModified) onGodownModified();
    } catch (e: any) {
      setData(snapshot || []);
      toast({
        title: "Connection Lost",
        description: "Rolled back to pre-save state. Please try again.",
        variant: "destructive",
        duration: 8000,
      });
    }
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

    // Capacity validation for godowns
    if (config.key === "godowns") {
      if (formData.capacityValue !== undefined && formData.capacityValue !== "" && Number(formData.capacityValue) < 0) {
        setCapacityError(true);
        toast({ title: "Validation Error", description: "Capacity value must be zero or greater", variant: "destructive" });
        return;
      }
      if (formData.capacityValue && Number(formData.capacityValue) > CAPACITY_OVERFLOW_LIMIT) {
        setCapacityError(true);
        toast({ title: "Overflow Prevention", description: `Capacity value exceeds maximum allowed (${bdFmt.format(CAPACITY_OVERFLOW_LIMIT)})`, variant: "destructive" });
        return;
      }
      setCapacityError(false);
    }

    // Capacity validation for capacities module
    if (config.key === "capacities") {
      if (formData.capacityValue !== undefined && formData.capacityValue !== "" && Number(formData.capacityValue) <= 0) {
        setCapacityError(true);
        toast({ title: "Validation Error", description: "Capacity value must be greater than zero", variant: "destructive" });
        return;
      }
      if (formData.capacityValue && Number(formData.capacityValue) >= CAPACITY_OVERFLOW_LIMIT) {
        setCapacityError(true);
        toast({ title: "Overflow Prevention", description: `Capacity value must be less than ${bdFmt.format(CAPACITY_OVERFLOW_LIMIT)}`, variant: "destructive" });
        return;
      }
      setCapacityError(false);
    }

    // XSS Sanitization
    const sanitizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === "string") {
        sanitizedData[key] = sanitizeInput(value);
      } else {
        sanitizedData[key] = value;
      }
    }

    setSaving(true);
    setSnapshot([...data]);

    try {
      if (editingItem) {
        const res = await apiFetch(`${config.apiPath}/${editingItem.id}`, {
          method: "PUT",
          body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Updated", description: `${config.label} updated successfully` });
      } else {
        const res = await apiFetch(config.apiPath, {
          method: "POST",
          body: JSON.stringify(sanitizedData),
        });
        if (res?.error) throw new Error(res.error);
        toast({ title: "Created", description: `${config.label} created successfully` });
      }
      setDialogOpen(false);
      // Optimistic update
      if (editingItem) {
        setData(prev => prev.map(d => d.id === editingItem.id ? { ...d, ...sanitizedData } : d));
      } else {
        setData(prev => [{ id: "temp-" + Date.now(), ...sanitizedData, isActive: true, createdAt: new Date().toISOString() }, ...prev]);
      }
      loadData();
      if (onGodownModified && config.key === "godowns") onGodownModified();
    } catch (e: any) {
      const msg = e.message || "Failed to save";
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Network request failed")) {
        setData(snapshot || []);
        toast({
          title: "Connection Lost — Rollback Executed",
          description: "Rolled back to pre-save state. Please try again.",
          variant: "destructive",
          duration: 8000,
        });
      } else {
        toast({ title: "Error", description: msg, variant: "destructive" });
      }
    } finally {
      setSaving(false);
    }
  };

  // Delete
  const handleDelete = async (id: string) => {
    setSnapshot([...data]);
    try {
      await apiFetch(`${config.apiPath}/${id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: `${config.label} deleted successfully` });
      setDeleteConfirm(null);
      loadData();
      if (onGodownModified && config.key === "godowns") onGodownModified();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };

  // Export PDF — Premium with corporate branding
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

      const authUser = authState.user;

      exportToPDF({
        title: config.label,
        subtitle: `Total Records: ${filteredData.length}`,
        orientation: "landscape",
        columns: config.columns,
        data: exportData,
        isVatAuditor,
        vatMaskedColumns: maskedColumns,
        systemNotice: "This is a system generated structural architecture report. Verify all parameters before operational use.",
        company: companyProfile ? {
          name: companyProfile.name,
          address: companyProfile.address,
          phone: companyProfile.phone,
          email: companyProfile.email,
          logo: companyProfile.logo || companyProfile.brandLogo,
          vatNumber: companyProfile.vatNumber,
        } : undefined,
        financialFooter: {
          preparedBy: authUser?.displayName || userRole || "",
          checkedBy: "",
          authorizedBy: "",
          approvedBy: "",
          printedBy: authUser?.displayName || userRole || "",
        },
      });
      toast({ title: "PDF Exported", description: `${config.label} report exported with compliance footer` });
    } catch (e: any) {
      toast({ title: "Export Error", description: e.message, variant: "destructive" });
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

  // Import CSV with validation gates
  const handleImportCSV = () => {
    // Pre-validate CSV with capacity overflow validation
    importFromCSV({
      apiPath: config.apiPath,
      formFields: config.formFields,
    }).then((result) => {
      // Post-import validation warnings
      if (config.key === "godowns" || config.key === "capacities") {
        const overflowErrors = (result.fieldErrors || []).filter(
          fe => fe.message.includes("Invalid number") || fe.message.includes("overflow")
        );
        if (overflowErrors.length > 0) {
          toast({
            title: "Import Validation",
            description: `${overflowErrors.length} row(s) had capacity overflow values (>${bdFmt.format(CAPACITY_OVERFLOW_LIMIT)})`,
            variant: "destructive",
            duration: 8000,
          });
        }
      }
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed${result.errors.length > 0 ? ` (${result.errors.slice(0, 3).join("; ")})` : ""}`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
      if (onGodownModified && config.key === "godowns") onGodownModified();
    });
  };

  // Render form field
  const renderFormField = (field: ExportFieldDef) => {
    const val = formData[field.key] ?? "";

    if (field.type === "select") {
      const options = field.options || [];
      return (
        <Select value={String(val)} onValueChange={(v) => {
          setFormData(prev => ({ ...prev, [field.key]: v }));
          if (field.key === "capacityUnit") setCapacityError(false);
        }}>
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

    const isCapacityValueField = field.key === "capacityValue" && capacityError;

    return (
      <Input
        type={field.type === "number" ? "number" : "text"}
        value={String(val)}
        onChange={(e) => {
          setFormData(prev => ({ ...prev, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }));
          if (field.key === "capacityValue") setCapacityError(false);
        }}
        placeholder={field.placeholder || field.label}
        step={field.step}
        className={isCapacityValueField ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
      />
    );
  };

  const Icon = config.icon;

  // Suspended godown count for warning
  const suspendedCount = config.key === "godowns" ? data.filter(g => g.status === "SUSPENDED").length : 0;

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
            <Plus className="h-4 w-4 mr-1" /> Add
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

      {/* Suspended Godown Warning */}
      {suspendedCount > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span className="text-sm text-red-700 dark:text-red-400 font-medium">
            EMERGENCY CLOSURE: {suspendedCount} warehouse(s) suspended — all stock transfers and receipt orders are blocked
          </span>
        </div>
      )}

      {/* Data Table */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table className="min-w-[600px]">
              <TableHeader>
                <TableRow className="bg-[#132240] dark:bg-[#0a1628]">
                  <TableHead className="text-white font-semibold w-12">#</TableHead>
                  {config.columns.map(col => (
                    <TableHead key={col.key} className="text-white font-semibold whitespace-nowrap">
                      {col.label}
                    </TableHead>
                  ))}
                  {/* Emergency toggle column for godowns */}
                  {config.key === "godowns" && canMutate && (
                    <TableHead className="text-white font-semibold w-14 text-center">Toggle</TableHead>
                  )}
                  {canMutate && <TableHead className="text-white font-semibold w-32">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={config.columns.length + (canMutate ? 3 : 1)} className="text-center py-8 text-slate-400">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={config.columns.length + (canMutate ? 3 : 1)} className="text-center py-8 text-slate-400">
                      No {config.label.toLowerCase()} found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow
                      key={item.id || idx}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        config.key === "godowns" && item.status === "SUSPENDED"
                          ? "bg-red-50/50 dark:bg-red-900/10"
                          : ""
                      }`}
                    >
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      {config.columns.map(col => {
                        let val = getNestedValue(item, col.key);
                        if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";

                        // isActive badge
                        if (col.key === "isActive") {
                          return (
                            <TableCell key={col.key}>
                              <Badge
                                variant={val ? "default" : "secondary"}
                                className={val ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}
                              >
                                {val ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                          );
                        }

                        // Godown status badge
                        if (config.key === "godowns" && col.key === "status") {
                          if (val === "SUSPENDED") {
                            return (
                              <TableCell key={col.key}>
                                <Badge variant="destructive" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  SUSPENDED
                                </Badge>
                              </TableCell>
                            );
                          }
                          return (
                            <TableCell key={col.key}>
                              <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                ACTIVE
                              </Badge>
                            </TableCell>
                          );
                        }

                        // Number formatting for capacityValue
                        if (col.key === "capacityValue" && (col.type === "number") && val !== null && val !== undefined && val !== "") {
                          return (
                            <TableCell key={col.key} className="text-right font-mono tabular-nums">
                              {fmt(val, "number")}
                            </TableCell>
                          );
                        }

                        return (
                          <TableCell key={col.key} className={
                            (col.type === "number" || col.type === "currency") ? "text-right" : ""
                          }>
                            {fmt(val, col.type)}
                          </TableCell>
                        );
                      })}

                      {/* Emergency Toggle Button for Godowns */}
                      {config.key === "godowns" && canMutate && (
                        <TableCell className="text-center">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-8 w-8 p-0 ${
                              item.status === "SUSPENDED"
                                ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                                : "text-red-500 hover:text-red-600 hover:bg-red-50"
                            }`}
                            onClick={() => setEmergencyToggleConfirm(item)}
                            title={item.status === "SUSPENDED" ? "Reactivate warehouse" : "Emergency closure"}
                          >
                            <Power className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}

                      {/* Actions */}
                      {canMutate && (
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="sm" onClick={() => openEdit(item)} className="h-8 w-8 p-0">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(item.id)} className="h-8 w-8 p-0 text-red-500 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
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

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-[520px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? `Edit ${config.label}` : `Create ${config.label}`}</DialogTitle>
            <DialogDescription>
              {editingItem ? `Update ${config.label.toLowerCase()} details` : `Add a new ${config.label.toLowerCase()}`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {config.formFields.map(field => (
              <div key={field.key} className="space-y-1.5">
                <Label className="text-sm font-medium">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {renderFormField(field)}
                {field.key === "capacityValue" && capacityError && (
                  <p className="text-xs text-red-500">
                    {config.key === "capacities"
                      ? "Capacity value must be greater than 0 and less than 999,999,999"
                      : "Capacity value must be zero or greater"}
                  </p>
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  {config.key === "godowns" ? "Compiling Spatial Matrix..." :
                   config.key === "departments" ? "Saving Department..." :
                   config.key === "segments" ? "Validating Segment..." :
                   "Validating Capacity..."}
                </>
              ) : editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Confirm Delete</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this {config.label.toLowerCase()}? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Emergency Toggle Confirmation Dialog */}
      <Dialog open={!!emergencyToggleConfirm} onOpenChange={() => setEmergencyToggleConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Power className="h-5 w-5 text-red-500" />
              {emergencyToggleConfirm?.status === "SUSPENDED" ? "Reactivate Warehouse" : "Emergency Closure"}
            </DialogTitle>
            <DialogDescription>
              {emergencyToggleConfirm?.status === "SUSPENDED"
                ? `Are you sure you want to reactivate "${emergencyToggleConfirm?.name}"? The warehouse will be able to receive and dispatch stock again.`
                : `Are you sure you want to SUSPEND "${emergencyToggleConfirm?.name}"? All stock transfers and receipt orders will be immediately blocked.`
              }
            </DialogDescription>
          </DialogHeader>
          {emergencyToggleConfirm?.status === "ACTIVE" && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
              <span className="text-xs text-red-700 dark:text-red-400">
                Warning: Suspending a warehouse with pending operations may disrupt active orders.
              </span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmergencyToggleConfirm(null)}>Cancel</Button>
            <Button
              variant={emergencyToggleConfirm?.status === "SUSPENDED" ? "default" : "destructive"}
              onClick={() => emergencyToggleConfirm && handleEmergencyToggle(emergencyToggleConfirm)}
              className={emergencyToggleConfirm?.status === "SUSPENDED" ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            >
              {emergencyToggleConfirm?.status === "SUSPENDED" ? "Reactivate" : "Suspend Warehouse"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// MAIN STRUCTURE MODULE PAGE COMPONENT
// ============================================================

interface StructureModulePageProps {
  userRole: string;
  isVatAuditor: boolean;
}

export default function StructureModulePage({ userRole, isVatAuditor }: StructureModulePageProps) {
  const [activeTab, setActiveTab] = useState("departments");
  const [routingRefreshKey, setRoutingRefreshKey] = useState(0);

  const handleGodownModified = useCallback(() => {
    setRoutingRefreshKey(prev => prev + 1);
  }, []);

  const moduleConfigs: Record<string, StructureModuleConfig> = {
    departments: {
      key: "departments",
      label: "Departments",
      icon: Building,
      apiPath: "/api/departments",
      columns: DEPARTMENT_COLUMNS,
      formFields: DEPARTMENT_FIELDS,
    },
    godowns: {
      key: "godowns",
      label: "Godowns",
      icon: Warehouse,
      apiPath: "/api/godowns",
      columns: GODOWN_COLUMNS,
      formFields: GODOWN_FIELDS,
    },
    segments: {
      key: "segments",
      label: "Segments",
      icon: Layers,
      apiPath: "/api/segments",
      columns: SEGMENT_COLUMNS,
      formFields: SEGMENT_FIELDS,
    },
    capacities: {
      key: "capacities",
      label: "Capacities",
      icon: Hash,
      apiPath: "/api/capacities",
      columns: CAPACITY_COLUMNS,
      formFields: CAPACITY_FIELDS,
    },
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Building className="h-6 w-6 text-[#2563eb]" />
            Structure Module
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage departments, warehouses, segments, and capacity specifications
          </p>
        </div>
        {isVatAuditor && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1.5 text-sm">
            <Shield className="h-4 w-4 mr-1.5" />
            VAT AUDIT MODE
          </Badge>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
          <TabsTrigger value="departments" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Building className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Departments</span>
            <span className="sm:hidden">Dept</span>
          </TabsTrigger>
          <TabsTrigger value="godowns" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Warehouse className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Godowns</span>
            <span className="sm:hidden">WH</span>
          </TabsTrigger>
          <TabsTrigger value="segments" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Layers className="h-3.5 w-3.5" />
            Segments
          </TabsTrigger>
          <TabsTrigger value="capacities" className="flex items-center gap-1.5 text-xs sm:text-sm">
            <Hash className="h-3.5 w-3.5" />
            Capacities
          </TabsTrigger>
        </TabsList>

        {/* Departments Tab */}
        <TabsContent value="departments" className="mt-4">
          <StructureModuleTab
            config={moduleConfigs.departments}
            isVatAuditor={isVatAuditor}
            userRole={userRole as UserRole}
          />
        </TabsContent>

        {/* Godowns Tab — with Routing Status Panel */}
        <TabsContent value="godowns" className="mt-4 space-y-6">
          {/* Warehouse Routing Status Panel */}
          <Card className="border-slate-200 dark:border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Truck className="h-5 w-5 text-[#2563eb]" />
                Routing Status Panel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WarehouseRoutingPanel onRefreshKey={routingRefreshKey} />
            </CardContent>
          </Card>

          <Separator />

          {/* Godown CRUD */}
          <StructureModuleTab
            config={moduleConfigs.godowns}
            isVatAuditor={isVatAuditor}
            userRole={userRole as UserRole}
            onGodownModified={handleGodownModified}
          />
        </TabsContent>

        {/* Segments Tab */}
        <TabsContent value="segments" className="mt-4">
          <StructureModuleTab
            config={moduleConfigs.segments}
            isVatAuditor={isVatAuditor}
            userRole={userRole as UserRole}
          />
        </TabsContent>

        {/* Capacities Tab */}
        <TabsContent value="capacities" className="mt-4">
          <StructureModuleTab
            config={moduleConfigs.capacities}
            isVatAuditor={isVatAuditor}
            userRole={userRole as UserRole}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
