"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Plus, Edit, Trash2, Download, Upload, RefreshCw, Search,
  FileDown, Users, UserCircle, Truck, Shield, X, CheckCircle,
  Briefcase, UserCheck, CalendarDays,
  Check, Ban, AlertTriangle,
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
// HELPER: Get nested value from object
// ============================================================

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => acc?.[part], obj);
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
  category?: "personnel" | "crm";
  dialogWidth?: string;
  formSections?: { title: string; fields: string[] }[];
}

const GRADE_LEVEL_OPTIONS = [
  { value: "Grade-1", label: "Grade-1" },
  { value: "Grade-2", label: "Grade-2" },
  { value: "Grade-3", label: "Grade-3" },
  { value: "Grade-4", label: "Grade-4" },
  { value: "Grade-5", label: "Grade-5" },
  { value: "Senior", label: "Senior" },
  { value: "Junior", label: "Junior" },
  { value: "Lead", label: "Lead" },
  { value: "Executive", label: "Executive" },
];

const EMPLOYEE_TYPE_OPTIONS = [
  { value: "Permanent", label: "Permanent" },
  { value: "Contract", label: "Contract" },
  { value: "Probation", label: "Probation" },
  { value: "Part-time", label: "Part-time" },
];

const EMPLOYEE_STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "On Leave", label: "On Leave" },
  { value: "Resigned", label: "Resigned" },
  { value: "Terminated", label: "Terminated" },
];

const GENDER_OPTIONS = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
  { value: "Other", label: "Other" },
];

const BLOOD_GROUP_OPTIONS = [
  { value: "A+", label: "A+" },
  { value: "A-", label: "A-" },
  { value: "B+", label: "B+" },
  { value: "B-", label: "B-" },
  { value: "O+", label: "O+" },
  { value: "O-", label: "O-" },
  { value: "AB+", label: "AB+" },
  { value: "AB-", label: "AB-" },
];

const MARITAL_STATUS_OPTIONS = [
  { value: "Single", label: "Single" },
  { value: "Married", label: "Married" },
  { value: "Divorced", label: "Divorced" },
  { value: "Widowed", label: "Widowed" },
];

const LEAVE_TYPE_OPTIONS = [
  { value: "Casual", label: "Casual" },
  { value: "Sick", label: "Sick" },
  { value: "Annual", label: "Annual" },
  { value: "Maternity", label: "Maternity" },
];

const LEAVE_STATUS_OPTIONS = [
  { value: "Pending", label: "Pending" },
  { value: "Approved", label: "Approved" },
  { value: "Rejected", label: "Rejected" },
];

const CUSTOMER_TYPE_OPTIONS = [
  { value: "Regular", label: "Regular" },
  { value: "Dealer", label: "Dealer" },
];

const BALANCE_TYPE_OPTIONS_CUSTOMER = [
  { value: "Dr", label: "Dr" },
  { value: "Cr", label: "Cr" },
];

const BALANCE_TYPE_OPTIONS_SUPPLIER = [
  { value: "Cr", label: "Cr" },
  { value: "Dr", label: "Dr" },
];

const MODULE_CONFIGS: ModuleConfig[] = [
  // ── Personnel Management ──
  {
    key: "designations",
    label: "Designations",
    icon: Briefcase,
    apiPath: "/api/designations",
    category: "personnel",
    columns: [
      { key: "code", label: "Code", type: "text" },
      { key: "name", label: "Designation Name", type: "text" },
      { key: "department.name", label: "Department", type: "text" },
      { key: "gradeLevel", label: "Grade Level", type: "text" },
      { key: "salaryBandMin", label: "Salary Band Min", type: "currency" },
      { key: "salaryBandMax", label: "Salary Band Max", type: "currency" },
      { key: "_count.employees", label: "Employees", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Designation Name", type: "text", required: true },
      { key: "departmentId", label: "Department", type: "select", required: true, options: [] },
      { key: "gradeLevel", label: "Grade Level", type: "select", required: false, options: GRADE_LEVEL_OPTIONS },
      { key: "salaryBandMin", label: "Salary Band Min (৳)", type: "number", step: "0.01" },
      { key: "salaryBandMax", label: "Salary Band Max (৳)", type: "number", step: "0.01" },
      { key: "description", label: "Description", type: "textarea" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
    vatMaskedColumns: ["salaryBandMin", "salaryBandMax"],
  },
  {
    key: "employees",
    label: "Employees",
    icon: UserCheck,
    apiPath: "/api/employees",
    category: "personnel",
    dialogWidth: "max-w-2xl",
    columns: [
      { key: "employeeCode", label: "Employee Code", type: "text" },
      { key: "name", label: "Name", type: "text" },
      { key: "designation.name", label: "Designation", type: "text" },
      { key: "department.name", label: "Department", type: "text" },
      { key: "joiningDate", label: "Joining Date", type: "date" },
      { key: "employeeType", label: "Employee Type", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "baseSalary", label: "Base Salary", type: "currency" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      // Section 1: Employment Details
      { key: "name", label: "Full Name", type: "text", required: true },
      { key: "designationId", label: "Designation", type: "select", required: true, options: [] },
      { key: "departmentId", label: "Department", type: "select", required: true, options: [] },
      { key: "joiningDate", label: "Joining Date", type: "date", required: true },
      { key: "baseSalary", label: "Base Salary (৳)", type: "number", step: "0.01" },
      { key: "employeeType", label: "Employee Type", type: "select", required: false, options: EMPLOYEE_TYPE_OPTIONS },
      { key: "status", label: "Status", type: "select", required: false, options: EMPLOYEE_STATUS_OPTIONS },
      { key: "referenceBy", label: "Reference By", type: "text" },
      // Section 2: Personal Information
      { key: "gender", label: "Gender", type: "select", required: false, options: GENDER_OPTIONS },
      { key: "bloodGroup", label: "Blood Group", type: "select", required: false, options: BLOOD_GROUP_OPTIONS },
      { key: "religion", label: "Religion", type: "text" },
      { key: "dateOfBirth", label: "Date of Birth", type: "date" },
      { key: "fatherName", label: "Father's Name", type: "text" },
      { key: "motherName", label: "Mother's Name", type: "text" },
      { key: "spouseName", label: "Spouse Name", type: "text" },
      { key: "maritalStatus", label: "Marital Status", type: "select", required: false, options: MARITAL_STATUS_OPTIONS },
      { key: "nidNumber", label: "NID Number", type: "text" },
      { key: "tinNumber", label: "TIN Number", type: "text" },
      // Section 3: Contact & Banking
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "presentAddress", label: "Present Address", type: "textarea" },
      { key: "permanentAddress", label: "Permanent Address", type: "textarea" },
      { key: "emergencyContact", label: "Emergency Contact", type: "text" },
      { key: "emergencyContactName", label: "Emergency Contact Name", type: "text" },
      { key: "bankName", label: "Bank Name", type: "text" },
      { key: "bankAccountNo", label: "Bank Account No", type: "text" },
      // Section 4: Document Uploads
      { key: "photo", label: "Profile Photo", type: "image" },
      { key: "nidFrontImage", label: "NID Front", type: "image" },
      { key: "nidBackImage", label: "NID Back", type: "image" },
    ],
    vatMaskedColumns: ["baseSalary"],
    formSections: [
      { title: "Employment Details", fields: ["name", "designationId", "departmentId", "joiningDate", "baseSalary", "employeeType", "status", "referenceBy"] },
      { title: "Personal Information", fields: ["gender", "bloodGroup", "religion", "dateOfBirth", "fatherName", "motherName", "spouseName", "maritalStatus", "nidNumber", "tinNumber"] },
      { title: "Contact & Banking", fields: ["phone", "email", "presentAddress", "permanentAddress", "emergencyContact", "emergencyContactName", "bankName", "bankAccountNo"] },
      { title: "Document Uploads", fields: ["photo", "nidFrontImage", "nidBackImage"] },
    ],
  },
  {
    key: "employee-leaves",
    label: "Employee Leave",
    icon: CalendarDays,
    apiPath: "/api/employee-leaves",
    category: "personnel",
    columns: [
      { key: "leaveCode", label: "Leave Code", type: "text" },
      { key: "employee.name", label: "Employee", type: "text" },
      { key: "leaveType", label: "Leave Type", type: "text" },
      { key: "fromDate", label: "From Date", type: "date" },
      { key: "toDate", label: "To Date", type: "date" },
      { key: "totalDays", label: "Total Days", type: "number" },
      { key: "status", label: "Status", type: "text" },
      { key: "approvedBy", label: "Approved By", type: "text" },
      { key: "reason", label: "Reason", type: "text" },
    ],
    formFields: [
      { key: "employeeId", label: "Employee", type: "select", required: true, options: [] },
      { key: "leaveType", label: "Leave Type", type: "select", required: true, options: LEAVE_TYPE_OPTIONS },
      { key: "fromDate", label: "From Date", type: "date", required: true },
      { key: "toDate", label: "To Date", type: "date", required: true },
      { key: "reason", label: "Reason", type: "textarea" },
      { key: "status", label: "Status", type: "select", required: false, options: LEAVE_STATUS_OPTIONS, defaultValue: "Pending" },
    ],
  },
  // ── Customer CRM ──
  {
    key: "customers",
    label: "Customers",
    icon: UserCircle,
    apiPath: "/api/customers",
    category: "crm",
    columns: [
      { key: "customerCode", label: "Customer Code", type: "text" },
      { key: "name", label: "Customer Name", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "customerType", label: "Customer Type", type: "text" },
      { key: "area", label: "Area", type: "text" },
      { key: "openingBalance", label: "Opening Balance", type: "currency" },
      { key: "openingBalanceType", label: "Balance Type", type: "text" },
      { key: "creditLimit", label: "Credit Limit", type: "currency" },
      { key: "_count.salesOrders", label: "Sales Orders", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Customer Name", type: "text", required: true },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "area", label: "Area", type: "text" },
      { key: "reference", label: "Reference", type: "text" },
      { key: "customerType", label: "Customer Type", type: "select", required: true, options: CUSTOMER_TYPE_OPTIONS },
      { key: "openingBalance", label: "Opening Balance (৳)", type: "number", step: "0.01" },
      { key: "openingBalanceType", label: "Balance Type", type: "select", required: false, options: BALANCE_TYPE_OPTIONS_CUSTOMER },
      { key: "creditLimit", label: "Credit Limit (৳)", type: "number", step: "0.01" },
      { key: "profileImage", label: "Profile Photo", type: "image" },
      { key: "nidFrontImage", label: "NID Front", type: "image" },
      { key: "nidBackImage", label: "NID Back", type: "image" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
    vatMaskedColumns: ["openingBalance", "creditLimit"],
    formSections: [
      { title: "Customer Details", fields: ["name", "phone", "email", "address", "area", "reference", "customerType", "openingBalance", "openingBalanceType", "creditLimit"] },
      { title: "Document Uploads", fields: ["profileImage", "nidFrontImage", "nidBackImage"] },
    ],
  },
  // ── Supplier CRM ──
  {
    key: "suppliers",
    label: "Suppliers",
    icon: Truck,
    apiPath: "/api/suppliers",
    category: "crm",
    columns: [
      { key: "supplierCode", label: "Supplier Code", type: "text" },
      { key: "name", label: "Supplier Name", type: "text" },
      { key: "contactPerson", label: "Contact Person", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "area", label: "Area", type: "text" },
      { key: "openingBalance", label: "Opening Balance", type: "currency" },
      { key: "openingBalanceType", label: "Balance Type", type: "text" },
      { key: "creditLimit", label: "Credit Limit", type: "currency" },
      { key: "terms", label: "Terms", type: "text" },
      { key: "_count.purchaseOrders", label: "Purchase Orders", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "name", label: "Supplier Name", type: "text", required: true },
      { key: "contactPerson", label: "Contact Person", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "email" },
      { key: "address", label: "Address", type: "textarea" },
      { key: "area", label: "Area", type: "text" },
      { key: "terms", label: "Terms", type: "textarea" },
      { key: "openingBalance", label: "Opening Balance (৳)", type: "number", step: "0.01" },
      { key: "openingBalanceType", label: "Balance Type", type: "select", required: false, options: BALANCE_TYPE_OPTIONS_SUPPLIER },
      { key: "creditLimit", label: "Credit Limit (৳)", type: "number", step: "0.01" },
      { key: "profileImage", label: "Profile Photo", type: "image" },
      { key: "nidFrontImage", label: "NID Front", type: "image" },
      { key: "nidBackImage", label: "NID Back", type: "image" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
    vatMaskedColumns: ["openingBalance", "creditLimit"],
    formSections: [
      { title: "Supplier Details", fields: ["name", "contactPerson", "phone", "email", "address", "area", "terms", "openingBalance", "openingBalanceType", "creditLimit"] },
      { title: "Document Uploads", fields: ["profileImage", "nidFrontImage", "nidBackImage"] },
    ],
  },
];

// ============================================================
// LEAVE BALANCE ENTITLEMENTS
// ============================================================

const LEAVE_ENTITLEMENTS: Record<string, number> = {
  Casual: 12,
  Sick: 10,
  Annual: 15,
  Maternity: 90,
};

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
  const [leaveBalances, setLeaveBalances] = useState<Record<string, { used: number; entitled: number; remaining: number }>>({});

  // RBAC
  const canMutate = userRole === "admin" || userRole === "manager";
  const isSR = userRole === "sr";
  const isDealer = userRole === "dealer";

  // Dealer: hidden from HR and suppliers
  const isHidden = isDealer && (config.key === "designations" || config.key === "employees" || config.key === "employee-leaves" || config.key === "suppliers");
  // SR: completely blocked from suppliers
  const isBlocked = isSR && config.key === "suppliers";

  const maskedColumns = useMemo(() => {
    if (!isVatAuditor) return [];
    return config.vatMaskedColumns || [];
  }, [isVatAuditor, config.vatMaskedColumns]);

  // SR salary mask for employees
  const shouldMaskSalary = isSR && config.key === "employees";

  // SR cannot modify credit limits on customers
  const shouldMaskCreditLimit = isSR && config.key === "customers";

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
        if (field.key === "departmentId") apiPath = "/api/departments";
        else if (field.key === "designationId") apiPath = "/api/designations";
        else if (field.key === "employeeId") apiPath = "/api/employees";
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

  // Calculate leave balances when employee changes in leave form
  const calculateLeaveBalances = useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setLeaveBalances({});
      return;
    }
    try {
      const allLeaves = await apiFetch("/api/employee-leaves");
      const currentYear = new Date().getFullYear();
      const empLeaves = Array.isArray(allLeaves)
        ? allLeaves.filter((l: any) => {
            const empId = l.employeeId || (l.employee && l.employee.id);
            return empId === employeeId && l.status === "Approved";
          })
        : [];

      const balances: Record<string, { used: number; entitled: number; remaining: number }> = {};
      for (const [type, entitled] of Object.entries(LEAVE_ENTITLEMENTS)) {
        const used = empLeaves.filter((l: any) => l.leaveType === type).reduce((sum: number, l: any) => sum + (l.totalDays || 0), 0);
        balances[type] = { used, entitled, remaining: entitled - used };
      }
      setLeaveBalances(balances);
    } catch {
      setLeaveBalances({});
    }
  }, []);

  // Watch employeeId changes for leave balance
  useEffect(() => {
    if (config.key === "employee-leaves" && formData.employeeId) {
      calculateLeaveBalances(formData.employeeId);
    } else {
      setLeaveBalances({});
    }
  }, [config.key, formData.employeeId, calculateLeaveBalances]);

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
    for (const f of config.formFields) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        toast({ title: "Validation Error", description: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }
    // SR cannot modify credit limit on customers
    if (shouldMaskCreditLimit && editingItem) {
      delete formData.creditLimit;
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

  // Approve/Reject leave
  const handleLeaveAction = async (id: string, action: "Approved" | "Rejected") => {
    try {
      await apiFetch(`${config.apiPath}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: action }),
      });
      toast({ title: `Leave ${action}`, description: `Leave request has been ${action.toLowerCase()}` });
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
          if (shouldMaskSalary && col.key === "baseSalary") val = "N/A (Audit Mode)";
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
          if (shouldMaskSalary && col.key === "baseSalary") val = "N/A (Audit Mode)";
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
  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const result = await importFromCSV({ apiPath: config.apiPath, formFields: config.formFields });
      toast({
        title: "Import Complete",
        description: `${result.imported} imported, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    } catch (e: any) {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    }
    e.target.value = "";
  };

  // Render form field
  const renderFormField = (field: ExportFieldDef) => {
    const val = formData[field.key] ?? "";

    // SR: mask credit limit on customer edit
    if (shouldMaskCreditLimit && editingItem && field.key === "creditLimit") {
      return (
        <Input
          type="text"
          value="N/A (Audit Mode)"
          disabled
          className="bg-slate-100 dark:bg-slate-800"
        />
      );
    }

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
        (dynamicOptions[field.key] || []).map((item: any) => {
          if (field.key === "designationId") {
            return { value: item.id, label: `${item.code || ""} - ${item.name || item.id}`.trim() };
          }
          if (field.key === "employeeId") {
            return { value: item.id, label: `${item.employeeCode || ""} - ${item.name || item.id}`.trim() };
          }
          return { value: item.id, label: item.name || item.employeeCode || item.code || item.id };
        });
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

    if (field.type === "date") {
      return (
        <Input
          type="date"
          value={val ? (typeof val === "string" ? val.split("T")[0] : new Date(val).toISOString().split("T")[0]) : ""}
          onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
          placeholder={field.placeholder || field.label}
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

  // Render form with sections (for employees)
  const renderFormContent = () => {
    if (config.formSections && config.formSections.length > 0) {
      return (
        <div className="space-y-6 py-2">
          {config.formSections.map((section, sIdx) => {
            const sectionFields = config.formFields.filter(f => section.fields.includes(f.key));
            const isDocUploadSection = section.title === "Document Uploads";
            return (
              <div key={sIdx}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-6 rounded bg-[#2563eb]/10 flex items-center justify-center">
                    <span className="text-xs font-bold text-[#2563eb]">{sIdx + 1}</span>
                  </div>
                  <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{section.title}</h4>
                  {sIdx < config.formSections!.length - 1 && <Separator className="flex-1" />}
                </div>
                {isDocUploadSection ? (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pl-8">
                    {sectionFields.map(field => (
                      <div key={field.key}>
                        {renderFormField(field)}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-4 pl-8">
                    {sectionFields.map(field => (
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
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return (
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
    );
  };

  // Render leave balance cards
  const renderLeaveBalanceCards = () => {
    if (config.key !== "employee-leaves" || !formData.employeeId) return null;

    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
        {Object.entries(leaveBalances).map(([type, balance]) => (
          <div key={type} className="text-center p-2 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{type}</p>
            <p className="text-sm font-bold text-slate-900 dark:text-white">{balance.remaining} left</p>
            <p className="text-[10px] text-slate-400">Used: {balance.used} / Entitled: {balance.entitled}</p>
          </div>
        ))}
      </div>
    );
  };

  // Credit utilization for customers
  const renderCreditUtilization = (item: any) => {
    if (config.key !== "customers") return null;
    const balance = Number(item.openingBalance) || 0;
    const limit = Number(item.creditLimit) || 0;
    if (limit <= 0) return <span className="text-xs text-slate-400">No limit</span>;
    const pct = Math.round((balance / limit) * 100);
    let barColor = "bg-emerald-500";
    if (pct > 100) barColor = "bg-red-500";
    else if (pct > 80) barColor = "bg-amber-500";

    return (
      <div className="w-24">
        <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
        <p className={`text-[10px] mt-0.5 ${pct > 100 ? "text-red-500 font-medium" : pct > 80 ? "text-amber-500 font-medium" : "text-slate-400"}`}>
          {pct}% used
        </p>
      </div>
    );
  };

  const Icon = config.icon;

  // ── Hidden/Blocked state ──
  if (isHidden || isBlocked) {
    return (
      <div className="space-y-4">
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-4" />
            <h3 className="text-lg font-semibold text-slate-500 dark:text-slate-400">Access Restricted</h3>
            <p className="text-sm text-slate-400 dark:text-slate-500 mt-1">
              You do not have permission to view this module.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
        {/* SR can create customers too */}
        {isSR && config.key === "customers" && (
          <Button onClick={openCreate} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
            <Plus className="h-4 w-4 mr-1" /> Add Customer
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={handleExportCSV}>
          <Download className="h-4 w-4 mr-1" /> CSV
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF}>
          <FileDown className="h-4 w-4 mr-1" /> PDF
        </Button>
        {canMutate && (
          <label className="cursor-pointer">
            <Button variant="outline" size="sm" asChild>
              <span><Upload className="h-4 w-4 mr-1" /> Import</span>
            </Button>
            <input type="file" accept=".csv" className="hidden" onChange={handleImportCSV} />
          </label>
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

      {/* SR Salary Mask Banner */}
      {shouldMaskSalary && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">SR MODE — Salary information is masked</span>
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
                  {/* Approve/Reject column for employee-leaves (Admin/Manager only) */}
                  {config.key === "employee-leaves" && canMutate && (
                    <TableHead className="text-white font-semibold w-32">Leave Actions</TableHead>
                  )}
                  {canMutate && <TableHead className="text-white font-semibold w-24">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={config.columns.length + 3} className="text-center py-8 text-slate-400">Loading...</TableCell></TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow><TableCell colSpan={config.columns.length + 3} className="text-center py-8 text-slate-400">No {config.label.toLowerCase()} found</TableCell></TableRow>
                ) : (
                  filteredData.map((item, idx) => (
                    <TableRow key={item.id || idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <TableCell className="text-slate-500 text-xs">{idx + 1}</TableCell>
                      {config.columns.map(col => {
                        let val = getNestedValue(item, col.key);
                        if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
                        if (shouldMaskSalary && col.key === "baseSalary") val = "N/A (Audit Mode)";

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

                        // Leave status badge
                        if (col.key === "status" && config.key === "employee-leaves") {
                          const statusColors: Record<string, string> = {
                            Pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                            Approved: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                            Rejected: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          };
                          return (
                            <TableCell key={col.key}>
                              <Badge className={statusColors[val] || "bg-slate-100 text-slate-500"}>
                                {val || "—"}
                              </Badge>
                            </TableCell>
                          );
                        }

                        // Employee status badge
                        if (col.key === "status" && config.key === "employees") {
                          const empStatusColors: Record<string, string> = {
                            Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                            "On Leave": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                            Resigned: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                            Terminated: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                          };
                          return (
                            <TableCell key={col.key}>
                              <Badge className={empStatusColors[val] || "bg-slate-100 text-slate-500"}>
                                {val || "—"}
                              </Badge>
                            </TableCell>
                          );
                        }

                        // Customer type badge
                        if (col.key === "customerType" && config.key === "customers") {
                          return (
                            <TableCell key={col.key}>
                              <Badge className={val === "Dealer" ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"}>
                                {val || "—"}
                              </Badge>
                            </TableCell>
                          );
                        }

                        // Currency formatting
                        if (col.type === "currency") {
                          return <TableCell key={col.key} className="whitespace-nowrap font-medium">{fmtCurrency(val)}</TableCell>;
                        }

                        // Date formatting
                        if (col.type === "date" && val) {
                          return <TableCell key={col.key} className="whitespace-nowrap">{fmt(val, "date")}</TableCell>;
                        }

                        return <TableCell key={col.key} className="whitespace-nowrap">{fmt(val, col.type)}</TableCell>;
                      })}
                      {/* Approve/Reject buttons for pending leaves */}
                      {config.key === "employee-leaves" && canMutate && (
                        <TableCell>
                          {item.status === "Pending" ? (
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleLeaveAction(item.id, "Approved")}
                                className="h-7 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                              >
                                <Check className="h-3.5 w-3.5 mr-0.5" /> Approve
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleLeaveAction(item.id, "Rejected")}
                                className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                              >
                                <Ban className="h-3.5 w-3.5 mr-0.5" /> Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">—</span>
                          )}
                        </TableCell>
                      )}
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

      {/* Customer Credit Utilization Section */}
      {config.key === "customers" && filteredData.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Credit Utilization Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800">
                    <TableHead className="text-xs font-semibold">Customer</TableHead>
                    <TableHead className="text-xs font-semibold">Balance</TableHead>
                    <TableHead className="text-xs font-semibold">Credit Limit</TableHead>
                    <TableHead className="text-xs font-semibold">Utilization</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.filter(item => Number(item.creditLimit) > 0).map(item => {
                    const balance = Number(item.openingBalance) || 0;
                    const limit = Number(item.creditLimit) || 0;
                    const pct = limit > 0 ? Math.round((balance / limit) * 100) : 0;
                    let barColor = "bg-emerald-500";
                    let textColor = "text-emerald-600";
                    if (pct > 100) { barColor = "bg-red-500"; textColor = "text-red-600"; }
                    else if (pct > 80) { barColor = "bg-amber-500"; textColor = "text-amber-600"; }
                    const maskedBalance = isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(balance);
                    const maskedLimit = isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(limit);
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <TableCell className="text-xs font-medium whitespace-nowrap">{item.name}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{maskedBalance}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">{maskedLimit}</TableCell>
                        <TableCell className="w-32">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${Math.min(pct, 100)}%` }} />
                            </div>
                            <span className={`text-xs font-medium ${textColor}`}>{pct}%</span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Record count */}
      <div className="text-xs text-slate-500 dark:text-slate-400">
        Showing {filteredData.length} of {data.length} {config.label.toLowerCase()}
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className={`${config.dialogWidth || "max-w-lg"} max-h-[85vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>{editingItem ? `Edit ${config.label.slice(0, -1)}` : `New ${config.label.slice(0, -1)}`}</DialogTitle>
            <DialogDescription>
              {editingItem ? `Update ${config.label.slice(0, -1).toLowerCase()} details` : `Create a new ${config.label.slice(0, -1).toLowerCase()}`}
            </DialogDescription>
          </DialogHeader>
          {/* Leave Balance Cards inside dialog */}
          {renderLeaveBalanceCards()}
          {renderFormContent()}
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

export default function PersonnelCRMGroupPage({ activeModule }: { activeModule?: string }) {
  const auth = useAuth();
  const isVatAuditor = auth.user?.role === "vat_auditor";
  const userRole = auth.user?.role || "admin";

  // Determine active tab
  const [activeTab, setActiveTab] = useState(activeModule || "designations");

  // Group modules by category
  const personnelModules = MODULE_CONFIGS.filter(m => m.category === "personnel");
  const crmModules = MODULE_CONFIGS.filter(m => m.category === "crm");

  // Separate CRM into customer and supplier for different sections
  const customerModules = crmModules.filter(m => m.key === "customers");
  const supplierModules = crmModules.filter(m => m.key === "suppliers");

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-[#2563eb]" />
            Personnel & CRM Ecosystem
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Staff management, customer relationships, and supplier partnerships
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
          {/* Personnel Management Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Personnel Management</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Designations, Employees, Employee Leave</p>
              </div>
            </div>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto flex-wrap gap-1 p-1">
              {personnelModules.map(mod => {
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

          {/* Customer CRM Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <UserCircle className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Customer CRM</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Customer directory and credit management</p>
              </div>
            </div>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto flex-wrap gap-1 p-1">
              {customerModules.map(mod => {
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

          {/* Supplier CRM Section */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                <Truck className="h-4 w-4 text-purple-500" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Supplier CRM</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">Vendor master records and payable balances</p>
              </div>
            </div>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto flex-wrap gap-1 p-1">
              {supplierModules.map(mod => {
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
