"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Building2, Tag, Palette, Box, Layers, Building,
  Warehouse, CreditCard, Settings, Target, Hash, X, Shield,
  CheckCircle, ChevronRight, Ruler, Loader2, AlertTriangle, Banknote,
  Power, Package,
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
import ImageUploadField from "@/components/erp/ui/ImageUploadField";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const bdFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const bdFmtInt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${bdFmt.format(Number(v))}`;
  if (type === "date") return v ? new Date(v).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") return bdFmtInt.format(Number(v));
  return String(v);
};

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${bdFmt.format(Number(v))}`;
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
      { key: "logo", label: "Company Logo", type: "image" },
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
    key: "banks", label: "Bank/Vault Profiles", icon: Banknote, apiPath: "/api/banks",
    category: "core",
    columns: [
      { key: "bankName", label: "Bank Name", type: "text" },
      { key: "bankType", label: "Type", type: "text" },
      { key: "branch", label: "Branch", type: "text" },
      { key: "accountNo", label: "Account No", type: "text" },
      { key: "accountHolder", label: "Account Holder", type: "text" },
      { key: "openingBalance", label: "Opening Balance", type: "currency" },
      { key: "currentBalance", label: "Current Balance", type: "currency" },
      { key: "chartOfAccount.name", label: "CoA Mapping", type: "text" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "bankName", label: "Bank Name", type: "text", required: true },
      { key: "bankType", label: "Account Type", type: "select", required: true, options: [
        { value: "Bank", label: "Bank Account" },
        { value: "MFS", label: "Mobile Financial Service (Bkash/Nagad)" },
        { value: "CashDrawer", label: "Physical Cash Drawer" },
      ]},
      { key: "branch", label: "Branch", type: "text" },
      { key: "accountNo", label: "Account No", type: "text", required: true },
      { key: "accountHolder", label: "Account Holder", type: "text", required: true },
      { key: "openingBalance", label: "Opening Balance", type: "number", defaultValue: 0, step: "0.01" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
    vatMaskedColumns: ["openingBalance", "currentBalance", "accountNo"],
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
  {
    key: "products", label: "Products", icon: Package, apiPath: "/api/products",
    category: "core",
    columns: [
      { key: "productCode", label: "Code", type: "text" },
      { key: "name", label: "Product Name", type: "text" },
      { key: "category.name", label: "Category", type: "text" },
      { key: "brand.name", label: "Brand", type: "text" },
      { key: "costPrice", label: "Purchase Price", type: "currency" },
      { key: "salePrice", label: "MRP/Retail", type: "currency" },
      { key: "wholesalePrice", label: "Wholesale", type: "currency" },
      { key: "dealerPrice", label: "Dealer", type: "currency" },
      { key: "currentStock", label: "Stock", type: "number" },
      { key: "stockStatus", label: "Stock Status", type: "text" },
      { key: "skuStatus", label: "SKU Status", type: "text" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Product Name", type: "text", required: true },
      { key: "categoryId", label: "Category", type: "select", required: true, options: [] },
      { key: "brandId", label: "Brand", type: "select", required: false, options: [] },
      { key: "colorId", label: "Color", type: "select", required: false, options: [] },
      { key: "sku", label: "SKU", type: "text", required: false },
      { key: "barcode", label: "Barcode", type: "text", required: false },
      { key: "unit", label: "Unit", type: "text", required: false, placeholder: "e.g. pcs, kg" },
      { key: "sizeCapacity", label: "Size/Capacity", type: "text", required: false },
      { key: "costPrice", label: "Purchase Price (৳)", type: "number", required: true, step: "0.01" },
      { key: "salePrice", label: "MRP/Retail Price (৳)", type: "number", required: true, step: "0.01" },
      { key: "wholesalePrice", label: "Wholesale Price (৳)", type: "number", defaultValue: 0, step: "0.01" },
      { key: "dealerPrice", label: "Dealer Price (৳)", type: "number", defaultValue: 0, step: "0.01" },
      { key: "openingStock", label: "Opening Stock", type: "number", defaultValue: 0, step: "0.01" },
      { key: "reorderLevel", label: "Reorder Level", type: "number", defaultValue: 0, step: "0.01" },
      { key: "godownId", label: "Warehouse", type: "select", required: false, options: [] },
      { key: "segmentId", label: "Segment", type: "select", required: false, options: [] },
      { key: "imeiNumber", label: "IMEI Number", type: "text", required: false },
      { key: "image", label: "Product Image", type: "image" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
    vatMaskedColumns: ["costPrice", "wholesalePrice", "dealerPrice"],
  },
  // ── Structural Infrastructure ──
  {
    key: "departments", label: "Departments", icon: Building, apiPath: "/api/departments",
    category: "structural",
    columns: [
      { key: "code", label: "Code", type: "text" },
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
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Warehouse Name", type: "text" },
      { key: "address", label: "Address", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "inCharge", label: "In Charge", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "capacityValue", label: "Capacity", type: "number" },
      { key: "capacityUnit", label: "Unit", type: "text" },
      { key: "_count.products", label: "Products", type: "number" },
      { key: "isActive", label: "Active", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Warehouse Name", type: "text", required: true },
      { key: "address", label: "Address", type: "textarea", required: true },
      { key: "phone", label: "Phone", type: "text", required: true },
      { key: "inCharge", label: "In Charge", type: "text" },
      { key: "status", label: "Status", type: "select", required: true, options: [
        { value: "ACTIVE", label: "Active" },
        { value: "SUSPENDED", label: "Suspended (Emergency Closure)" },
      ]},
      { key: "capacityValue", label: "Capacity Value", type: "number", required: false, step: "0.01" },
      { key: "capacityUnit", label: "Capacity Unit", type: "select", required: false, options: [
        { value: "m³", label: "Cubic Meters (m³)" },
        { value: "sqft", label: "Square Feet (sqft)" },
        { value: "units", label: "Units/Items" },
        { value: "kg", label: "Kilograms (kg)" },
        { value: "tons", label: "Metric Tons" },
      ]},
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  {
    key: "segments", label: "Segments", icon: Layers, apiPath: "/api/segments",
    category: "structural",
    columns: [
      { key: "code", label: "Code", type: "text" },
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
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Capacity Name", type: "text" },
      { key: "capacityValue", label: "Capacity Value", type: "number" },
      { key: "capacityUnit", label: "Unit", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Capacity Name", type: "text", required: true },
      { key: "capacityValue", label: "Capacity Value", type: "number", required: true, step: "0.01" },
      { key: "capacityUnit", label: "Capacity Unit", type: "select", required: true, options: [
        { value: "m³", label: "Cubic Meters (m³)" },
        { value: "sqft", label: "Square Feet (sqft)" },
        { value: "units", label: "Units/Items" },
        { value: "kg", label: "Kilograms (kg)" },
        { value: "tons", label: "Metric Tons" },
      ]},
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
  },
  // ── Operational Framework ── Phase 7: Financial benchmark shields, card fee architecture, status toggles
  {
    key: "sr-targets", label: "SR Target Setup", icon: Target, apiPath: "/api/sr-targets",
    category: "operational",
    columns: [
      { key: "employee.name", label: "Employee", type: "text" },
      { key: "month", label: "Month", type: "number" },
      { key: "year", label: "Year", type: "number" },
      { key: "targetAmount", label: "Target Amount", type: "currency" },
      { key: "minimumSalesQuota", label: "Min Sales Quota", type: "currency" },
      { key: "commissionPercentage", label: "Commission %", type: "number" },
      { key: "status", label: "Channel Status", type: "text" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "employeeId", label: "Employee (SR)", type: "select", required: true, options: [] },
      { key: "month", label: "Month", type: "number", required: true },
      { key: "year", label: "Year", type: "number", required: true },
      { key: "targetAmount", label: "Target Amount (৳)", type: "number", required: true, step: "0.01" },
      { key: "minimumSalesQuota", label: "Minimum Sales Quota (৳)", type: "number", required: true, step: "0.01" },
      { key: "commissionPercentage", label: "Commission Percentage (%)", type: "number", required: true, step: "0.01" },
    ],
    vatMaskedColumns: ["targetAmount", "minimumSalesQuota", "commissionPercentage"],
  },
  {
    key: "payment-options", label: "Payment Options", icon: CreditCard, apiPath: "/api/payment-options",
    category: "operational",
    columns: [
      { key: "name", label: "Payment Option", type: "text" },
      { key: "status", label: "Channel Status", type: "text" },
      { key: "_count.cardTypeSetups", label: "Card Setups", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Payment Option Name", type: "text", required: true },
      { key: "status", label: "Channel Status", type: "select", required: true, options: [{ value: "ACTIVE", label: "ACTIVE" }, { value: "INACTIVE", label: "INACTIVE" }] },
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
      { key: "bankServiceCharge", label: "BSC %", type: "number" },
      { key: "customerConvFee", label: "Conv. Fee %", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "paymentOptionId", label: "Payment Option", type: "select", required: true, options: [] },
      { key: "cardTypeId", label: "Card Type", type: "select", required: true, options: [] },
      { key: "chargePercentage", label: "Charge Percentage (%)", type: "number", defaultValue: 0, step: "0.01" },
      { key: "bankServiceCharge", label: "Bank Service Charge BSC (%)", type: "number", defaultValue: 0, step: "0.01" },
      { key: "customerConvFee", label: "Customer Conv. Fee (%)", type: "number", defaultValue: 0, step: "0.01" },
    ],
    vatMaskedColumns: ["chargePercentage", "bankServiceCharge", "customerConvFee"],
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
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dynamicOptions, setDynamicOptions] = useState<Record<string, any[]>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  // Phase 6: Optimistic UI with snapshot rollback
  const [structuralSnapshot, setStructuralSnapshot] = useState<any[] | null>(null);

  // Phase 7: Operational snapshot for rollback on connection drop
  const [operationsSnapshot, setOperationsSnapshot] = useState<any[] | null>(null);

  // Phase 6: Capacity validation error state
  const [capacityError, setCapacityError] = useState(false);

  // Phase 7: Financial benchmark validation error states
  const [srTargetError, setSrTargetError] = useState<string | null>(null);
  const [cardFeeError, setCardFeeError] = useState<string | null>(null);

  const canMutate = userRole === "admin" || userRole === "manager";

  const maskedColumns = useMemo(() => {
    if (!isVatAuditor) return [];
    return config.vatMaskedColumns || [];
  }, [isVatAuditor, config.vatMaskedColumns]);

  // Phase 6: XSS Sanitization helper
  const sanitizeInput = (input: string): string => {
    return input.replace(/<[^>]*>/g, '').replace(/\r\n/g, '\n').replace(/  +/g, ' ').trim();
  };

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
        else if (field.key === "categoryId") apiPath = "/api/categories";
        else if (field.key === "brandId") apiPath = "/api/brands";
        else if (field.key === "colorId") apiPath = "/api/colors";
        else if (field.key === "godownId") apiPath = "/api/godowns";
        else if (field.key === "segmentId") apiPath = "/api/segments";
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

  // Load company profile for white-label PDF
  useEffect(() => {
    const loadCompanyProfile = async () => {
      try {
        const profile = await apiFetch("/api/company-branding");
        setCompanyProfile(profile.company || profile);
      } catch {}
    };
    loadCompanyProfile();
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

  // Phase 6: Emergency Closure toggle for godowns
  const handleEmergencyClosureToggle = async (item: any) => {
    const newStatus = item.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED";
    // Store snapshot for rollback
    setStructuralSnapshot([...data]);
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
      // Optimistic update
      setData(prev => prev.map(d => d.id === item.id ? { ...d, status: newStatus } : d));
      // Fetch to confirm
      loadData();
    } catch (e: any) {
      // Rollback on failure
      setData(structuralSnapshot || []);
      toast({
        title: "Connection Lost",
        description: "Rolled back to pre-save state. Please try again.",
        variant: "destructive",
        duration: 8000,
      });
    }
  };

  // Save (create or update) — Phase 6: sanitization, capacity validation, snapshot/rollback
  const handleSave = async () => {
    // Validate required fields
    for (const f of config.formFields) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        toast({ title: "Validation Error", description: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }

    // Phase 6: Capacity validation for capacities module
    if (config.key === "capacities") {
      if (formData.capacityValue !== undefined && formData.capacityValue !== "" && Number(formData.capacityValue) <= 0) {
        setCapacityError(true);
        toast({ title: "Validation Error", description: "Capacity value must be greater than zero", variant: "destructive" });
        return;
      }
      setCapacityError(false);
    }

    // Phase 6: Capacity validation for godowns module
    if (config.key === "godowns") {
      if (formData.capacityValue !== undefined && formData.capacityValue !== "" && Number(formData.capacityValue) <= 0) {
        setCapacityError(true);
        toast({ title: "Validation Error", description: "Capacity value must be greater than zero", variant: "destructive" });
        return;
      }
      setCapacityError(false);
    }

    // Phase 7: SR Target financial benchmark shields
    if (config.key === "sr-targets") {
      const targetAmt = Number(formData.targetAmount);
      const minQuota = Number(formData.minimumSalesQuota);
      const commPct = Number(formData.commissionPercentage);

      if (!targetAmt || targetAmt <= 0) {
        setSrTargetError("Target Amount must be greater than zero");
        toast({ title: "Financial Benchmark Shield", description: "Target Amount must be greater than zero", variant: "destructive" });
        return;
      }
      if (!minQuota || minQuota <= 0) {
        setSrTargetError("Minimum Sales Quota must be greater than zero");
        toast({ title: "Financial Benchmark Shield", description: "Minimum Sales Quota must be greater than zero", variant: "destructive" });
        return;
      }
      if (isNaN(commPct) || commPct < 0) {
        setSrTargetError("Commission Percentage must be zero or positive");
        toast({ title: "Financial Benchmark Shield", description: "Commission Percentage must be zero or positive", variant: "destructive" });
        return;
      }
      setSrTargetError(null);
    }

    // Phase 7: Card Type Setup — safeFinancial rate bounds validation (0 <= rate <= 10.00)
    if (config.key === "card-type-setup") {
      const bsc = Number(formData.bankServiceCharge);
      const convFee = Number(formData.customerConvFee);

      if (isNaN(bsc) || bsc < 0 || bsc > 10) {
        setCardFeeError("Bank Service Charge must be between 0% and 10%");
        toast({ title: "Card Fee Architecture", description: "Bank Service Charge (BSC %) must be between 0% and 10%", variant: "destructive" });
        return;
      }
      if (isNaN(convFee) || convFee < 0 || convFee > 10) {
        setCardFeeError("Customer Convenience Fee must be between 0% and 10%");
        toast({ title: "Card Fee Architecture", description: "Customer Conv. Fee (%) must be between 0% and 10%", variant: "destructive" });
        return;
      }
      setCardFeeError(null);
    }

    // Product pricing validation
    if (config.key === "products") {
      const costPrice = Number(formData.costPrice);
      const salePrice = Number(formData.salePrice);
      if (costPrice <= 0 || salePrice <= 0) {
        toast({ title: "Validation Error", description: "Purchase Price and MRP/Retail Price must be greater than zero", variant: "destructive" });
        return;
      }
      if (costPrice >= salePrice) {
        toast({ title: "Pricing Interlock", description: "Purchase Price must be less than MRP/Retail Price", variant: "destructive" });
        return;
      }
    }

    // Phase 6: XSS Sanitization — sanitize all string fields
    const sanitizedData: Record<string, any> = {};
    for (const [key, value] of Object.entries(formData)) {
      if (typeof value === "string") {
        sanitizedData[key] = sanitizeInput(value);
      } else {
        sanitizedData[key] = value;
      }
    }

    setSaveError(null);
    setSaving(true);

    // Phase 6 + 7: Store snapshot before save for rollback
    const isOperationalModule = ["sr-targets", "payment-options", "card-types", "card-type-setup"].includes(config.key);
    if (isOperationalModule) {
      setOperationsSnapshot([...data]);
    } else {
      setStructuralSnapshot([...data]);
    }

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
      // Phase 7: Optimistic update — update client data instantly (edits only; creates rely on loadData)
      if (editingItem) {
        setData(prev => prev.map(d => d.id === editingItem.id ? { ...d, ...sanitizedData } : d));
      }
      loadData();
    } catch (e: any) {
      const msg = e.message || "Failed to save";
      if (msg.includes("already exists") || msg.includes("overlap") || msg.includes("duplicate") || msg.includes("Duplicate")) {
        setSaveError(msg);
      }
      // Phase 7: Rollback on network errors using operationsSnapshot for operational modules
      if (msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("Network request failed")) {
        const snapshotToRestore = isOperationalModule ? operationsSnapshot : structuralSnapshot;
        setData(snapshotToRestore || []);
        toast({
          title: "Connection Lost — Rollback Executed",
          description: "Rolled back to pre-save state using operationsSnapshot. Please try again.",
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
    try {
      await apiFetch(`${config.apiPath}/${id}`, { method: "DELETE" });
      toast({ title: "Deactivated", description: `${config.label} deactivated successfully` });
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

  // Export PDF — Phase 6: white-label sync for structural modules
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

      // Phase 6 + 7: Structural and Operational modules get proper financialFooter with auth user info (Triple-Signature Layout)
      const isStructuralModule = ["departments", "godowns", "segments", "capacities"].includes(config.key);
      const isOperationalModule = ["sr-targets", "payment-options", "card-types", "card-type-setup"].includes(config.key);
      const authUser = authState.user;

      exportToPDF({
        title: config.label,
        subtitle: `Total Records: ${filteredData.length}`,
        orientation: "landscape",
        columns: config.columns,
        data: exportData,
        isVatAuditor,
        vatMaskedColumns: maskedColumns,
        company: companyProfile ? {
          name: companyProfile.name,
          address: companyProfile.address,
          phone: companyProfile.phone,
          email: companyProfile.email,
          logo: companyProfile.logo || companyProfile.brandLogo,
          vatNumber: companyProfile.vatNumber,
        } : undefined,
        financialFooter: {
          preparedBy: authUser?.displayName || "System",
          checkedBy: "",
          authorizedBy: "",
          printedBy: authUser?.displayName || "System",
        },
      });
      toast({ title: "PDF Exported", description: `${config.label} data exported with compliance footer` });
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

  // Phase 6 + 7: Get spin-lock text for structural and operational modules
  const getSpinLockText = () => {
    if (config.key === "godowns") return "Compiling Spatial Matrix & Initializing Volumetric Warehouses...";
    if (config.key === "departments") return "Saving Department Structure...";
    if (config.key === "segments") return "Validating Segment Matrix...";
    if (config.key === "capacities") return "Validating Capacity Specifications...";
    if (["categories", "colors", "brands", "units"].includes(config.key)) return "Validating Catalog Collisions...";
    if (config.key === "banks") return "Validating Catalog Collisions & Mapping Liquid Asset Trees...";
    // Phase 7: Operational module spin-locks
    if (config.key === "sr-targets") return "Synchronizing Field Targets & Financial Processing Fees...";
    if (config.key === "payment-options") return "Authorizing Payment Channel...";
    if (config.key === "card-types") return "Registering Card Type Classification...";
    if (config.key === "card-type-setup") return "Synchronizing Field Targets & Financial Processing Fees...";
    if (config.key === "products") return "Validating Product Catalog & SKU Matrix...";
    return "Saving...";
  };

  // Render form field — Phase 6: capacity field red highlight
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
        <Select value={String(val)} onValueChange={(v) => {
          setFormData(prev => ({ ...prev, [field.key]: v }));
          // Clear capacity error when changing unit
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

    // Color code field with preview swatch
    if (field.key === "colorCode") {
      const colorVal = String(val);
      const isValidHex = /^#[0-9A-Fa-f]{6}$/.test(colorVal);
      return (
        <div className="flex items-center gap-2">
          <div className="flex-1">
            <Input
              value={colorVal}
              onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
              placeholder={field.placeholder || field.label}
              className={colorVal && !isValidHex ? "border-amber-500" : ""}
            />
          </div>
          <input
            type="color"
            value={isValidHex ? colorVal : "#000000"}
            onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value.toUpperCase() }))}
            className="h-9 w-9 rounded border border-slate-300 cursor-pointer shrink-0"
            title="Pick color"
          />
          {isValidHex && (
            <div
              className="h-9 w-9 rounded border border-slate-300 shrink-0"
              style={{ backgroundColor: colorVal }}
              title={colorVal}
            />
          )}
        </div>
      );
    }

    // Phase 6: Red highlight on capacityValue input when validation fails
    const isCapacityValueField = field.key === "capacityValue" && capacityError;

    // Phase 7: Red highlight on SR target financial fields when validation fails
    const isSrTargetErrorField = config.key === "sr-targets" && srTargetError &&
      ["targetAmount", "minimumSalesQuota", "commissionPercentage"].includes(field.key);

    // Phase 7: Red highlight on card fee fields when validation fails
    const isCardFeeErrorField = config.key === "card-type-setup" && cardFeeError &&
      ["bankServiceCharge", "customerConvFee"].includes(field.key);

    return (
      <Input
        type={field.type === "number" ? "number" : field.type === "email" ? "email" : "text"}
        value={String(val)}
        onChange={(e) => {
          setFormData(prev => ({ ...prev, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value }));
          // Clear capacity error when user types in capacityValue
          if (field.key === "capacityValue") setCapacityError(false);
        }}
        placeholder={field.placeholder || field.label}
        step={field.step}
        className={isCapacityValueField || isSrTargetErrorField || isCardFeeErrorField ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
      />
    );
  };

  // Month names for SR Target display
  const MONTH_NAMES = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const Icon = config.icon;

  // Phase 6: Count suspended godowns for warning banner
  const suspendedGodownCount = config.key === "godowns"
    ? data.filter(g => g.status === "SUSPENDED").length
    : 0;

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
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
            <Plus className="h-4 w-4 mr-1" /> Add {singularize(config.label)}
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

      {/* Phase 6: Suspended Godown Warning Banner */}
      {suspendedGodownCount > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2 mb-4">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <span className="text-sm text-red-700 dark:text-red-400 font-medium">
            EMERGENCY CLOSURE: {suspendedGodownCount} warehouse(s) suspended — all stock transfers and receipt orders are blocked
          </span>
        </div>
      )}

      {/* Phase 7: Deactivated Payment Channel Warning Banner */}
      {config.key === "payment-options" && data.filter(p => p.status === "INACTIVE").length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2 mb-4">
          <Power className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
            DEACTIVATED CHANNEL: {data.filter(p => p.status === "INACTIVE").length} payment channel(s) inactive — filtered out from all Invoice/Collection dropdowns
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
                  {canMutate && <TableHead className="text-white font-semibold w-32">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={config.columns.length + 2} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow><TableCell colSpan={config.columns.length + 2} className="text-center py-8 text-slate-400">No {config.label.toLowerCase()} found</TableCell></TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={item.id || idx} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${item.status === "SUSPENDED" ? "bg-red-50/50 dark:bg-red-900/10" : ""}`}>
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      {config.columns.map(col => {
                        let val = getNestedValue(item, col.key);
                        if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";

                        // Special rendering for isActive
                        if (col.key === "isActive") {
                          return (
                            <TableCell key={col.key}>
                              <Badge variant={val ? "default" : "secondary"} className={val ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}>
                                {val ? "Active" : "Inactive"}
                              </Badge>
                            </TableCell>
                          );
                        }

                        // Phase 6: Special rendering for godown status column
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

                        // Phase 7: Special rendering for payment-option status column (Deactivated Channel Shield)
                        if (config.key === "payment-options" && col.key === "status") {
                          if (val === "INACTIVE") {
                            return (
                              <TableCell key={col.key}>
                                <Badge variant="destructive" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 flex items-center gap-1">
                                  <Power className="h-3 w-3" />
                                  INACTIVE
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

                        // Phase 7: Special rendering for SR Target status column
                        if (config.key === "sr-targets" && col.key === "status") {
                          if (val === "INACTIVE") {
                            return (
                              <TableCell key={col.key}>
                                <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                  INACTIVE
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

                        // Color code with preview swatch
                        if (col.key === "colorCode" && val) {
                          return (
                            <TableCell key={col.key} className="whitespace-nowrap">
                              <div className="flex items-center gap-1.5">
                                <div className="h-4 w-4 rounded border border-slate-300 shrink-0" style={{ backgroundColor: String(val) }} />
                                <span className="text-xs font-mono">{fmt(val, col.type)}</span>
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
                            {/* Phase 6: Emergency Closure toggle for godowns */}
                            {config.key === "godowns" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEmergencyClosureToggle(item)}
                                className={`h-7 px-1.5 ${item.status === "SUSPENDED" ? "text-emerald-600 hover:text-emerald-700" : "text-amber-600 hover:text-amber-700"}`}
                                title={item.status === "SUSPENDED" ? "Reactivate Warehouse" : "Emergency Closure"}
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {/* Phase 7: Deactivated Channel Shield toggle for payment options */}
                            {config.key === "payment-options" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={async () => {
                                  const newStatus = item.status === "INACTIVE" ? "ACTIVE" : "INACTIVE";
                                  setOperationsSnapshot([...data]);
                                  try {
                                    await apiFetch(`${config.apiPath}/${item.id}`, {
                                      method: "PUT",
                                      body: JSON.stringify({ ...item, status: newStatus }),
                                    });
                                    toast({
                                      title: newStatus === "INACTIVE" ? "Payment Channel Deactivated" : "Payment Channel Activated",
                                      description: newStatus === "INACTIVE"
                                        ? `${item.name} has been deactivated. It will be filtered out from all Invoice/Collection dropdowns.`
                                        : `${item.name} has been reactivated and is now available in dropdowns.`,
                                      variant: newStatus === "INACTIVE" ? "destructive" : "default",
                                    });
                                    setData(prev => prev.map(d => d.id === item.id ? { ...d, status: newStatus } : d));
                                    loadData();
                                  } catch {
                                    setData(operationsSnapshot || []);
                                    toast({
                                      title: "Connection Lost — Rollback Executed",
                                      description: "Rolled back to pre-save state. Please try again.",
                                      variant: "destructive",
                                      duration: 8000,
                                    });
                                  }
                                }}
                                className={`h-7 px-1.5 ${item.status === "INACTIVE" ? "text-emerald-600 hover:text-emerald-700" : "text-amber-600 hover:text-amber-700"}`}
                                title={item.status === "INACTIVE" ? "Reactivate Channel" : "Deactivate Channel"}
                              >
                                <Power className="h-3.5 w-3.5" />
                              </Button>
                            )}
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
        <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? `Edit ${singularize(config.label)}` : `New ${singularize(config.label)}`}</DialogTitle>
            <DialogDescription>
              {editingItem ? `Update ${singularize(config.label).toLowerCase()} details` : `Create a new ${singularize(config.label).toLowerCase()}`}
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
                {/* Phase 6: Inline capacity error message */}
                {field.key === "capacityValue" && capacityError && (
                  <p className="text-xs text-red-600 dark:text-red-400">Capacity value must be greater than zero</p>
                )}
                {/* Phase 7: SR target financial benchmark error */}
                {config.key === "sr-targets" && srTargetError && ["targetAmount", "minimumSalesQuota", "commissionPercentage"].includes(field.key) && (
                  <p className="text-xs text-red-600 dark:text-red-400">{srTargetError}</p>
                )}
                {/* Phase 7: Card fee architecture error */}
                {config.key === "card-type-setup" && cardFeeError && ["bankServiceCharge", "customerConvFee"].includes(field.key) && (
                  <p className="text-xs text-red-600 dark:text-red-400">{cardFeeError}</p>
                )}
              </div>
            ))}
          </div>
          {saveError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-700 dark:text-red-400">{saveError}</span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{getSpinLockText()}</>
              ) : editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm Deactivate</DialogTitle>
            <DialogDescription>Are you sure you want to deactivate this {singularize(config.label).toLowerCase()}? It will be marked as inactive but can be restored by an admin.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>Deactivate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// MAIN COMPONENT
// ============================================================

function singularize(word: string): string {
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("ses") || word.endsWith("xes") || word.endsWith("zes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

export default function BasicModulesGroupPage({ activeModule }: { activeModule?: string }) {
  const auth = useAuth();
  const isVatAuditor = auth.user?.role === "vat_auditor";
  const userRole = auth.user?.role || "admin";

  // Determine active tab — update when activeModule prop changes (sidebar navigation)
  const [activeTab, setActiveTab] = useState(activeModule || "companies");
  useEffect(() => {
    if (activeModule) setActiveTab(activeModule);
  }, [activeModule]);

  // Group modules by category
  const coreModules = MODULE_CONFIGS.filter(m => m.category === "core");
  const structuralModules = MODULE_CONFIGS.filter(m => m.category === "structural");
  const operationalModules = MODULE_CONFIGS.filter(m => m.category === "operational");

  const activeConfig = MODULE_CONFIGS.find(m => m.key === activeTab);

  // Category headers
  const categoryInfo: Record<string, { label: string; icon: React.ElementType; color: string; desc: string }> = {
    core: { label: "Core Configurations", icon: Building2, color: "text-blue-500", desc: "Companies, Categories, Colors, Brands, Banks, Units" },
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
                <p className="text-xs text-slate-500 dark:text-slate-400">Companies, Categories, Colors, Brands, Banks, Units</p>
              </div>
            </div>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto overflow-x-auto flex-wrap gap-1 p-1 scrollbar-none">
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
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto overflow-x-auto flex-wrap gap-1 p-1 scrollbar-none">
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
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto overflow-x-auto flex-wrap gap-1 p-1 scrollbar-none">
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
