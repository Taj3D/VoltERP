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
import type { ColumnDef as ExportColumnDef, FieldDef as ExportFieldDef, CompanyProfile } from "@/lib/export-utils";
import ImageUploadField from "@/components/erp/ui/ImageUploadField";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

// Safe number formatters — use Intl.NumberFormat to prevent Bengali digit output
const currencyFormatter = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numberFormatter = new Intl.NumberFormat('en-US');
const dateFormatter = new Intl.DateTimeFormat('en-US', { day: '2-digit', month: 'short', year: 'numeric' });

const fmt = (v: any, type?: string) => {
  if (v === null || v === undefined || v === "N/A (Audit Mode)") return v || "—";
  if (type === "currency") return `৳${currencyFormatter.format(Number(v))}`;
  if (type === "date") return v ? dateFormatter.format(new Date(v)) : "—";
  if (type === "boolean") return v ? "Active" : "Inactive";
  if (type === "number") return numberFormatter.format(Number(v));
  return String(v);
};

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined) return "—";
  if (v === "N/A (Audit Mode)") return v;
  return `৳${currencyFormatter.format(Number(v))}`;
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

const CREDIT_STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Frozen", label: "Frozen" },
  { value: "OverLimit", label: "Over Limit" },
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
      { key: "resignationDate", label: "Resignation Date", type: "date" },
      { key: "employeeType", label: "Employee Type", type: "text" },
      { key: "status", label: "Status", type: "text" },
      { key: "baseSalary", label: "Base Salary", type: "currency" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "isActive", label: "Active", type: "boolean" },
    ],
    formFields: [
      // Section 1: Employment Details
      { key: "name", label: "Full Name", type: "text", required: true },
      { key: "designationId", label: "Designation", type: "select", required: true, options: [] },
      { key: "departmentId", label: "Department", type: "select", required: true, options: [] },
      { key: "joiningDate", label: "Joining Date", type: "date", required: true },
      { key: "resignationDate", label: "Resignation Date", type: "date" },
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
      { title: "Employment Details", fields: ["name", "designationId", "departmentId", "joiningDate", "resignationDate", "baseSalary", "employeeType", "status", "referenceBy"] },
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
  {
    key: "leave-allocations",
    label: "Leave Allocations",
    icon: CalendarDays,
    apiPath: "/api/leave-allocations",
    category: "personnel",
    columns: [
      { key: "employee.name", label: "Employee", type: "text" },
      { key: "leaveType", label: "Leave Type", type: "text" },
      { key: "allocatedDays", label: "Allocated", type: "number" },
      { key: "usedDays", label: "Used", type: "number" },
      { key: "remainingDays", label: "Remaining", type: "number" },
      { key: "year", label: "Year", type: "number" },
      { key: "isActive", label: "Status", type: "boolean" },
    ],
    formFields: [
      { key: "employeeId", label: "Employee", type: "select", required: true, options: [] },
      { key: "leaveType", label: "Leave Type", type: "select", required: true, options: LEAVE_TYPE_OPTIONS },
      { key: "allocatedDays", label: "Allocated Days", type: "number", required: true, step: "0.5" },
      { key: "year", label: "Year", type: "number", required: true, defaultValue: new Date().getFullYear() },
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
      { key: "currentBalance", label: "Current Balance", type: "currency" },
      { key: "currentBalanceType", label: "Balance Type", type: "text" },
      { key: "creditLimit", label: "Credit Limit", type: "currency" },
      { key: "creditStatus", label: "Credit Status", type: "text" },
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
      { key: "creditStatus", label: "Credit Status", type: "select", required: false, options: CREDIT_STATUS_OPTIONS, defaultValue: "Active" },
      { key: "profileImage", label: "Profile Photo", type: "image" },
      { key: "nidFrontImage", label: "NID Front", type: "image" },
      { key: "nidBackImage", label: "NID Back", type: "image" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
    vatMaskedColumns: ["openingBalance", "creditLimit", "currentBalance", "computedCurrentBalance"],
    formSections: [
      { title: "Customer Details", fields: ["name", "phone", "email", "address", "area", "reference", "customerType", "openingBalance", "openingBalanceType", "creditLimit"] },
      { title: "Credit & Balance Info", fields: ["creditStatus"] },
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
      { key: "currentBalance", label: "Current Balance", type: "currency" },
      { key: "currentBalanceType", label: "Balance Type", type: "text" },
      { key: "creditLimit", label: "Credit Limit", type: "currency" },
      { key: "creditStatus", label: "Credit Status", type: "text" },
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
      { key: "creditStatus", label: "Credit Status", type: "select", required: false, options: CREDIT_STATUS_OPTIONS, defaultValue: "Active" },
      { key: "profileImage", label: "Profile Photo", type: "image" },
      { key: "nidFrontImage", label: "NID Front", type: "image" },
      { key: "nidBackImage", label: "NID Back", type: "image" },
      { key: "isActive", label: "Active", type: "checkbox", defaultValue: true },
    ],
    vatMaskedColumns: ["openingBalance", "creditLimit", "currentBalance", "computedCurrentBalance"],
    formSections: [
      { title: "Supplier Details", fields: ["name", "contactPerson", "phone", "email", "address", "area", "terms", "openingBalance", "openingBalanceType", "creditLimit"] },
      { title: "Credit & Balance Info", fields: ["creditStatus"] },
      { title: "Document Uploads", fields: ["profileImage", "nidFrontImage", "nidBackImage"] },
    ],
  },
];

// ============================================================
// LEAVE BALANCE ENTITLEMENTS (fallback)
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

  // Phase 8: Collision error state
  const [collisionError, setCollisionError] = useState<string>("");

  // Phase 8: Snapshot for optimistic rollback
  const [personnelSnapshot, setPersonnelSnapshot] = useState<any[] | null>(null);

  // Phase 8: Company profile for PDF
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  // Personnel Validation Gate: DOB age validation error state
  const [dobValidationError, setDobValidationError] = useState<string>("");

  // Personnel Validation Gate: Leave balance deduction preview
  const [balanceDeductionPreview, setBalanceDeductionPreview] = useState<{ type: string; currentRemaining: number; afterDeduction: number; isOver: boolean } | null>(null);

  // RBAC
  const canMutate = userRole === "admin" || userRole === "manager";
  const isSR = userRole === "sr";
  const isDealer = userRole === "dealer";
  const isAdmin = userRole === "admin";

  // Soft-delete modules: designations, employees, customers, suppliers
  // Hard-delete modules: employee-leaves, leave-allocations
  const isSoftDeleteModule = ["designations", "employees", "customers", "suppliers"].includes(config.key);

  // Dealer: hidden from HR and suppliers and leave-allocations
  const isHidden = isDealer && (config.key === "designations" || config.key === "employees" || config.key === "employee-leaves" || config.key === "leave-allocations" || config.key === "suppliers");
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

  // Load company profile for PDF export
  const loadCompanyProfile = useCallback(async () => {
    try {
      const result = await apiFetch("/api/company-branding");
      if (result && typeof result === "object") {
        setCompanyProfile(result as CompanyProfile);
      }
    } catch {
      // Silently fail — PDF export will use defaults
    }
  }, []);

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
  useEffect(() => { loadCompanyProfile(); }, [loadCompanyProfile]);

  // Calculate leave balances when employee changes in leave form
  // Phase 8: Enhanced to use LeaveAllocation API data
  const calculateLeaveBalances = useCallback(async (employeeId: string) => {
    if (!employeeId) {
      setLeaveBalances({});
      return;
    }
    try {
      // Phase 8: Try to fetch from LeaveAllocation API first
      let allocations: any[] = [];
      try {
        const allocResult = await apiFetch(`/api/leave-allocations?employeeId=${employeeId}`);
        allocations = Array.isArray(allocResult) ? allocResult : [];
      } catch {
        // Fallback to computation from employee-leaves
      }

      if (allocations.length > 0) {
        // Use LeaveAllocation data
        const balances: Record<string, { used: number; entitled: number; remaining: number }> = {};
        for (const alloc of allocations) {
          if (alloc.isActive === false) continue;
          const type = alloc.leaveType;
          balances[type] = {
            used: Number(alloc.usedDays) || 0,
            entitled: Number(alloc.allocatedDays) || 0,
            remaining: Number(alloc.remainingDays) || 0,
          };
        }
        // Fill in any missing types from LEAVE_ENTITLEMENTS fallback
        for (const [type, entitled] of Object.entries(LEAVE_ENTITLEMENTS)) {
          if (!balances[type]) {
            balances[type] = { used: 0, entitled, remaining: entitled };
          }
        }
        setLeaveBalances(balances);
      } else {
        // Fallback: compute from approved leaves
        const allLeaves = await apiFetch("/api/employee-leaves");
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
      }
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

  // Personnel Validation Gate: Watch DOB changes for real-time age validation
  useEffect(() => {
    if (config.key === "employees" && formData.dateOfBirth) {
      const dob = new Date(formData.dateOfBirth);
      const today = new Date();
      const minAgeDate = new Date(today);
      minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
      if (dob > minAgeDate) {
        const age = today.getFullYear() - dob.getFullYear();
        setDobValidationError(`Personnel Validation Gate: Employee must be at least 18 years of age. Current age is approximately ${age} years. Minimum age requirement not met.`);
      } else {
        setDobValidationError("");
      }
    } else {
      setDobValidationError("");
    }
  }, [config.key, formData.dateOfBirth]);

  // Personnel Validation Gate: Watch leave form changes for balance deduction preview
  useEffect(() => {
    if (config.key === "employee-leaves" && formData.employeeId && formData.leaveType && formData.fromDate && formData.toDate) {
      const from = new Date(formData.fromDate);
      const to = new Date(formData.toDate);
      if (to >= from) {
        const requestedDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        const balance = leaveBalances[formData.leaveType];
        if (balance) {
          setBalanceDeductionPreview({
            type: formData.leaveType,
            currentRemaining: balance.remaining,
            afterDeduction: balance.remaining - requestedDays,
            isOver: balance.remaining < requestedDays,
          });
        } else {
          setBalanceDeductionPreview(null);
        }
      } else {
        setBalanceDeductionPreview(null);
      }
    } else {
      setBalanceDeductionPreview(null);
    }
  }, [config.key, formData.employeeId, formData.leaveType, formData.fromDate, formData.toDate, leaveBalances]);

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

  // KPI stats — enhanced with module-specific metrics
  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter(d => d.isActive !== false).length;
    const inactive = total - active;
    // Employee-leave specific stats
    const pendingLeaves = config.key === "employee-leaves" ? data.filter(d => d.status === "Pending").length : 0;
    const approvedLeaves = config.key === "employee-leaves" ? data.filter(d => d.status === "Approved").length : 0;
    const rejectedLeaves = config.key === "employee-leaves" ? data.filter(d => d.status === "Rejected").length : 0;
    // Employee type breakdown
    const permanentCount = config.key === "employees" ? data.filter(d => d.employeeType === "Permanent").length : 0;
    const contractCount = config.key === "employees" ? data.filter(d => d.employeeType === "Contract").length : 0;
    const probationCount = config.key === "employees" ? data.filter(d => d.employeeType === "Probation").length : 0;
    // Total salary for employees (mask for VAT Auditor / SR)
    const totalSalary = (config.key === "employees" && !isVatAuditor && !isSR)
      ? data.filter(d => d.isActive !== false).reduce((sum, d) => sum + (Number(d.baseSalary) || 0), 0)
      : 0;
    // Credit status stats for customers/suppliers — use computed credit status
    const creditFrozen = (config.key === "customers" || config.key === "suppliers") ? data.filter(d => (d.computedCreditStatus || d.creditStatus) === "Frozen").length : 0;
    const creditOverLimit = (config.key === "customers" || config.key === "suppliers") ? data.filter(d => (d.computedCreditStatus || d.creditStatus) === "OverLimit").length : 0;
    // AR/AP totals — use computed balance for accuracy
    const totalOutstandingAR = (config.key === "customers" && !isVatAuditor)
      ? data.filter(d => d.isActive !== false).reduce((sum, d) => {
          const bal = d.computedCurrentBalance ?? Number(d.currentBalance) ?? 0;
          const type = d.computedCurrentBalanceType ?? d.currentBalanceType;
          return sum + (type === "Dr" ? bal : 0);
        }, 0)
      : 0;
    const totalOutstandingAP = (config.key === "suppliers" && !isVatAuditor)
      ? data.filter(d => d.isActive !== false).reduce((sum, d) => {
          const bal = d.computedCurrentBalance ?? Number(d.currentBalance) ?? 0;
          const type = d.computedCurrentBalanceType ?? d.currentBalanceType;
          return sum + (type === "Cr" ? bal : 0);
        }, 0)
      : 0;
    return { total, active, inactive, pendingLeaves, approvedLeaves, rejectedLeaves, permanentCount, contractCount, probationCount, totalSalary, creditFrozen, creditOverLimit, totalOutstandingAR, totalOutstandingAP };
  }, [data, config.key]);

  // Open create dialog
  const openCreate = () => {
    setEditingItem(null);
    setCollisionError("");
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
    setCollisionError("");
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

  // Save (create or update) — Phase 8: Optimistic UI + snapshot rollback
  const handleSave = async () => {
    for (const f of config.formFields) {
      if (f.required && !formData[f.key] && formData[f.key] !== 0) {
        toast({ title: "Validation Error", description: `${f.label} is required`, variant: "destructive" });
        return;
      }
    }

    // Personnel Validation Gate: Standalone DOB 18+ age check
    if (config.key === "employees" && formData.dateOfBirth) {
      const dob = new Date(formData.dateOfBirth);
      const today = new Date();
      const minAgeDate = new Date(today);
      minAgeDate.setFullYear(minAgeDate.getFullYear() - 18);
      if (dob > minAgeDate) {
        toast({ title: "Personnel Validation Gate", description: "Employee must be at least 18 years of age. Date of Birth indicates the individual is under the minimum age requirement.", variant: "destructive" });
        return;
      }
    }

    // Phase 8: Chronological Date Shield — Joining Date >= DOB + 18 years
    if (config.key === "employees" && formData.dateOfBirth && formData.joiningDate) {
      const dob = new Date(formData.dateOfBirth);
      const joining = new Date(formData.joiningDate);
      const minJoiningDate = new Date(dob);
      minJoiningDate.setFullYear(minJoiningDate.getFullYear() + 18);
      if (joining < minJoiningDate) {
        toast({ title: "Date Validation Error", description: "Joining Date must be at least 18 years after Date of Birth", variant: "destructive" });
        return;
      }
    }

    // Phase 8: Chronological Date Shield — Resignation Date > Joining Date
    if (config.key === "employees" && formData.resignationDate && formData.joiningDate) {
      const joining = new Date(formData.joiningDate);
      const resignation = new Date(formData.resignationDate);
      if (resignation <= joining) {
        toast({ title: "Date Validation Error", description: "Resignation/Termination Date must be after Joining Date", variant: "destructive" });
        return;
      }
    }

    // SR cannot modify credit limit on customers
    if (shouldMaskCreditLimit && editingItem) {
      delete formData.creditLimit;
    }
    // Case-insensitive duplicate name check before API call
    const nameField = formData.name;
    if (nameField && typeof nameField === 'string' && nameField.trim()) {
      const normalizedName = nameField.trim().toLowerCase();
      const duplicate = data.find(d => {
        const existingName = (d.name || '').trim().toLowerCase();
        return existingName === normalizedName && d.id !== editingItem?.id;
      });
      if (duplicate) {
        toast({ title: "Corporate Entity Collision", description: `A ${singularize(config.label).toLowerCase()} with the name "${nameField.trim()}" already exists (case-insensitive match).`, variant: "destructive" });
        return;
      }
    }
    // Employee Leave: validate date range (toDate >= fromDate)
    if (config.key === "employee-leaves" && formData.fromDate && formData.toDate) {
      const from = new Date(formData.fromDate);
      const to = new Date(formData.toDate);
      if (to < from) {
        toast({ title: "Validation Error", description: "End date cannot be before start date", variant: "destructive" });
        return;
      }
    }

    // Phase 8: Snapshot for optimistic rollback
    setPersonnelSnapshot([...data]);

    // Phase 8: Optimistic mutation — immediately update local data (edits only; creates rely on loadData)
    if (editingItem) {
      setData(prev => prev.map(item => item.id === editingItem.id ? { ...item, ...formData } : item));
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
      // Phase 8: Rollback on error
      if (personnelSnapshot) {
        setData(personnelSnapshot);
        setPersonnelSnapshot(null);
      } else {
        loadData(); // Fallback: reload from server
      }

      // Phase 8: Corporate Entity Collision error handling
      if (e.message && e.message.includes("Corporate Entity Collision")) {
        setCollisionError(e.message);
        setDialogOpen(true); // Re-open dialog to show collision banner
      }

      // Phase 8: Insufficient leave balance error
      if (e.message && e.message.includes("Transaction Blocked: Insufficient accumulated leave balance")) {
        toast({ title: "Leave Balance Insufficient", description: "Transaction Blocked: Insufficient accumulated leave balance.", variant: "destructive" });
      } else {
        toast({ title: "Error", description: e.message, variant: "destructive" });
      }
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

  // Approve/Reject leave — Phase 8: Spin-lock + optimistic + balance refresh
  const handleLeaveAction = async (id: string, action: "Approved" | "Rejected") => {
    // Phase 8: Snapshot for rollback
    setPersonnelSnapshot([...data]);

    // Optimistic update
    setData(prev => prev.map(item =>
      item.id === id ? { ...item, status: action } : item
    ));

    try {
      await apiFetch(`${config.apiPath}/${id}`, {
        method: "PUT",
        body: JSON.stringify({ status: action }),
      });
      toast({ title: `Leave ${action}`, description: `Leave request has been ${action.toLowerCase()}` });
      loadData();
      // Automated Leave Deductions: Refresh leave balance after approval/rejection
      if (formData.employeeId) {
        calculateLeaveBalances(formData.employeeId);
      }
    } catch (e: any) {
      // Rollback
      if (personnelSnapshot) {
        setData(personnelSnapshot);
        setPersonnelSnapshot(null);
      } else {
        loadData();
      }
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
          if (shouldMaskCreditLimit && col.key === "creditLimit") val = "N/A (Audit Mode)";
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

  // Phase 8: Export PDF with company profile and financialFooter
  const handleExportPDF = () => {
    try {
      const exportData = filteredData.map(item => {
        const row: Record<string, any> = {};
        config.columns.forEach(col => {
          let val = getNestedValue(item, col.key);
          if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
          if (shouldMaskSalary && col.key === "baseSalary") val = "N/A (Audit Mode)";
          if (shouldMaskCreditLimit && col.key === "creditLimit") val = "N/A (Audit Mode)";
          row[col.key] = val;
        });
        return row;
      });

      // Phase 8: Use exportToPDF with company profile and financialFooter
      const stored = localStorage.getItem("ems_auth");
      let userName = "";
      let userEmail = "";
      try {
        if (stored) {
          const parsed = JSON.parse(stored);
          userName = parsed.user?.displayName || parsed.user?.name || "";
          userEmail = parsed.user?.email || "";
        }
      } catch {}

      exportToPDF({
        title: config.label,
        subtitle: `Total Records: ${filteredData.length}`,
        orientation: "landscape",
        columns: config.columns,
        data: exportData,
        isVatAuditor,
        vatMaskedColumns: maskedColumns,
        company: companyProfile || undefined,
        systemNotice: config.key === "employees" || config.key === "designations" || config.key === "employee-leaves" || config.key === "leave-allocations"
          ? "CONFIDENTIAL — This document contains personnel records protected under labor law. Unauthorized disclosure is prohibited. All monetary figures are displayed in Bangladeshi Taka (BDT)."
          : config.key === "customers" || config.key === "suppliers"
          ? "CONFIDENTIAL — This document contains proprietary financial data. Credit limits and outstanding balances are subject to the Credit Limit Protection System. Unauthorized reproduction or distribution is strictly prohibited. All monetary figures are displayed in Bangladeshi Taka (BDT). Legal Disclaimer: This report is generated for internal audit and management review purposes only."
          : "This is a system-generated report. All monetary figures are displayed in Bangladeshi Taka (BDT).",
        financialFooter: {
          preparedBy: userName,
          checkedBy: "",
          authorizedBy: "",
          printedBy: userName || "System",
        },
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
        description: `${result.imported} imported, ${result.failed} failed`,
        variant: result.failed > 0 ? "destructive" : "default",
      });
      loadData();
    }).catch((e: any) => {
      toast({ title: "Import Error", description: e.message, variant: "destructive" });
    });
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
      // Personnel Validation Gate: DOB max date constraint (must be at least 18 years ago)
      const isDobField = config.key === "employees" && field.key === "dateOfBirth";
      const isJoiningField = config.key === "employees" && field.key === "joiningDate";
      const isResignationField = config.key === "employees" && field.key === "resignationDate";
      let maxDate = "";
      let minDate = "";
      if (isDobField) {
        // DOB: must be at least 18 years ago, max today-18years
        const maxDob = new Date();
        maxDob.setFullYear(maxDob.getFullYear() - 18);
        maxDate = maxDob.toISOString().split("T")[0];
      }
      if (isJoiningField) {
        // Joining date: cannot be in the future
        maxDate = new Date().toISOString().split("T")[0];
      }
      if (isResignationField) {
        // Resignation date: cannot be in the future
        maxDate = new Date().toISOString().split("T")[0];
        // Min date: must be after joining date
        if (formData.joiningDate) {
          const joiningDate = new Date(formData.joiningDate);
          joiningDate.setDate(joiningDate.getDate() + 1);
          minDate = joiningDate.toISOString().split("T")[0];
        }
      }
      return (
        <div>
          <Input
            type="date"
            value={val ? (typeof val === "string" ? val.split("T")[0] : new Date(val).toISOString().split("T")[0]) : ""}
            onChange={(e) => setFormData(prev => ({ ...prev, [field.key]: e.target.value }))}
            placeholder={field.placeholder || field.label}
            max={maxDate || undefined}
            min={minDate || undefined}
          />
          {/* Personnel Validation Gate: Inline DOB age error */}
          {isDobField && dobValidationError && (
            <div className="mt-1.5 flex items-start gap-1.5 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
              <AlertTriangle className="h-3.5 w-3.5 text-red-500 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-red-600 dark:text-red-400 font-medium">{dobValidationError}</p>
            </div>
          )}
          {/* Joining date hint */}
          {isJoiningField && (
            <p className="mt-1 text-[11px] text-slate-400">Must be at least 18 years after Date of Birth</p>
          )}
        </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-4 pl-8">
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
                            {/* Phase 8: Uniqueness warnings for employee NID/Phone/Email */}
                            {config.key === "employees" && !editingItem && (field.key === "nidNumber" || field.key === "phone" || field.key === "email") && (
                              <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">(must be unique across system)</span>
                            )}
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

    // Non-sectioned forms — add uniqueness warnings for employee fields
    return (
      <div className="space-y-4 py-2">
        {config.formFields.map(field => (
          <div key={field.key} className="space-y-1.5">
            {field.type !== "checkbox" && field.type !== "image" && (
              <Label className="text-sm font-medium">
                {field.label} {field.required && <span className="text-red-500">*</span>}
                {/* Phase 8: Uniqueness warnings for employee NID/Phone/Email */}
                {config.key === "employees" && !editingItem && (field.key === "nidNumber" || field.key === "phone" || field.key === "email") && (
                  <span className="ml-2 text-[11px] font-normal text-amber-600 dark:text-amber-400">(must be unique across system)</span>
                )}
              </Label>
            )}
            {renderFormField(field)}
          </div>
        ))}
      </div>
    );
  };

  // Personnel Validation Gate: Enhanced leave balance cards with progress gauges + deduction preview
  const renderLeaveBalanceCards = () => {
    if (config.key !== "employee-leaves" || !formData.employeeId) return null;

    // Calculate requested days from form
    let requestedDays = 0;
    if (formData.fromDate && formData.toDate) {
      const from = new Date(formData.fromDate);
      const to = new Date(formData.toDate);
      if (to >= from) {
        requestedDays = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)) + 1;
      }
    }

    return (
      <div className="space-y-3 mb-4 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-[#2563eb]" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">Leave Balance Tracker</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(leaveBalances).map(([type, balance]) => {
            // Automated Leave Deductions: Red indicator when remaining < requested
            const isOverBalance = formData.leaveType === type && requestedDays > 0 && balance.remaining < requestedDays;
            const isSelectedType = formData.leaveType === type;
            const usagePercent = balance.entitled > 0 ? Math.round((balance.used / balance.entitled) * 100) : 0;
            let gaugeColor = "bg-emerald-500";
            let gaugeBg = "bg-emerald-100 dark:bg-emerald-900/30";
            if (usagePercent > 80) { gaugeColor = "bg-red-500"; gaugeBg = "bg-red-100 dark:bg-red-900/30"; }
            else if (usagePercent > 50) { gaugeColor = "bg-amber-500"; gaugeBg = "bg-amber-100 dark:bg-amber-900/30"; }
            if (isOverBalance) { gaugeColor = "bg-red-500"; gaugeBg = "bg-red-100 dark:bg-red-900/30"; }

            return (
              <div key={type} className={`text-center p-2.5 rounded-lg border-2 transition-all ${isOverBalance ? "border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20" : isSelectedType ? "border-[#2563eb]/30 bg-blue-50 dark:bg-blue-900/20" : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"}`}>
                <p className={`text-xs font-semibold mb-1 ${isOverBalance ? "text-red-600 dark:text-red-400" : isSelectedType ? "text-[#2563eb]" : "text-slate-500 dark:text-slate-400"}`}>{type}</p>
                {/* Progress Gauge */}
                <div className={`h-2 w-full rounded-full overflow-hidden mb-1.5 ${gaugeBg}`}>
                  <div className={`h-full ${gaugeColor} rounded-full transition-all duration-300`} style={{ width: `${Math.min(usagePercent, 100)}%` }} />
                </div>
                <p className={`text-lg font-bold ${isOverBalance ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-white"}`}>
                  {balance.remaining}
                  <span className="text-[10px] font-normal text-slate-400 ml-0.5">days</span>
                </p>
                <p className="text-[10px] text-slate-400">Used: {balance.used} / Entitled: {balance.entitled}</p>
                {isOverBalance && (
                  <div className="mt-1 flex items-center justify-center gap-0.5 text-red-500">
                    <AlertTriangle className="h-3 w-3" />
                    <span className="text-[10px] font-medium">Insufficient</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Automated Leave Deductions: Balance Deduction Preview */}
        {balanceDeductionPreview && requestedDays > 0 && (
          <div className={`mt-2 p-2.5 rounded-lg border ${balanceDeductionPreview.isOver ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800"}`}>
            <div className="flex items-center gap-2 mb-1">
              {balanceDeductionPreview.isOver ? (
                <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
              ) : (
                <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />
              )}
              <span className={`text-xs font-semibold ${balanceDeductionPreview.isOver ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
                Balance Deduction Preview — {balanceDeductionPreview.type}
              </span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-300">Current: <strong>{balanceDeductionPreview.currentRemaining} days</strong></span>
              <span className="text-slate-400">→</span>
              <span className={balanceDeductionPreview.isOver ? "text-red-600 font-bold" : "text-emerald-600 font-bold"}>
                After: {balanceDeductionPreview.afterDeduction} days
              </span>
              <span className="text-slate-400">(−{requestedDays})</span>
            </div>
            {balanceDeductionPreview.isOver && (
              <p className="text-[11px] text-red-500 mt-1 font-medium">
                Transaction will be blocked — insufficient accumulated leave balance.
              </p>
            )}
          </div>
        )}
      </div>
    );
  };

  // Credit utilization for customers
  const renderCreditUtilization = (item: any) => {
    if (config.key !== "customers") return null;
    const balance = Number(item.currentBalance) || 0;
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

  // Phase 8: Determine button label based on module
  const getCreateButtonLabel = () => {
    if (config.key === "employees") return `Register Active Employee`;
    if (config.key === "employee-leaves") return `Apply for Leave`;
    return `Add ${singularize(config.label)}`;
  };

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

      {/* Employee-Leaves Specific KPI Cards */}
      {config.key === "employee-leaves" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-4">
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <CalendarDays className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Pending Approval</p>
                <p className="text-xl font-bold text-amber-600">{stats.pendingLeaves}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <Check className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Approved Leaves</p>
                <p className="text-xl font-bold text-emerald-600">{stats.approvedLeaves}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-red-500/10 flex items-center justify-center">
                <Ban className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-slate-500 dark:text-slate-400">Rejected Leaves</p>
                <p className="text-xl font-bold text-red-500">{stats.rejectedLeaves}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Employee Workforce Composition Cards */}
      {config.key === "employees" && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <Card className="border-emerald-200 dark:border-emerald-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <UserCheck className="h-4 w-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Permanent</p>
                <p className="text-lg font-bold text-emerald-600">{stats.permanentCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Briefcase className="h-4 w-4 text-blue-500" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Contract</p>
                <p className="text-lg font-bold text-blue-600">{stats.contractCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Users className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Probation</p>
                <p className="text-lg font-bold text-amber-600">{stats.probationCount}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 dark:border-slate-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
                <span className="text-sm font-bold text-[#2563eb]">৳</span>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Monthly Payroll</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{(isVatAuditor || isSR) ? "N/A (Audit Mode)" : fmtCurrency(stats.totalSalary)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Customer Credit Risk KPI Cards */}
      {config.key === "customers" && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Credit Frozen</p>
                <p className="text-lg font-bold text-red-600">{stats.creditFrozen}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Over Limit</p>
                <p className="text-lg font-bold text-amber-600">{stats.creditOverLimit}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 dark:border-slate-700 sm:col-span-2">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
                <span className="text-sm font-bold text-[#2563eb]">৳</span>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Outstanding AR</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(stats.totalOutstandingAR)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Supplier Credit Risk KPI Cards */}
      {config.key === "suppliers" && stats.total > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Credit Frozen</p>
                <p className="text-lg font-bold text-red-600">{stats.creditFrozen}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Shield className="h-4 w-4 text-amber-500" />
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Over Limit</p>
                <p className="text-lg font-bold text-amber-600">{stats.creditOverLimit}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-slate-200 dark:border-slate-700 sm:col-span-2">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-[#2563eb]/10 flex items-center justify-center">
                <span className="text-sm font-bold text-[#2563eb]">৳</span>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Total Outstanding AP</p>
                <p className="text-lg font-bold text-slate-900 dark:text-white">{isVatAuditor ? "N/A (Audit Mode)" : fmtCurrency(stats.totalOutstandingAP)}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
            <Plus className="h-4 w-4 mr-1" /> {getCreateButtonLabel()}
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
        {(canMutate || (isSR && config.key === "customers")) && (
          <Button variant="outline" size="sm" onClick={handleImportCSV}>
            <Upload className="h-4 w-4 mr-1" /> Import
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={loadData}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        {/* Recalculate Balances Button for Customers/Suppliers */}
        {(config.key === "customers" || config.key === "suppliers") && (
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const balPath = config.key === "customers" ? "/api/customers/balances?recalculate=true" : "/api/suppliers/balances?recalculate=true";
              await apiFetch(balPath);
              toast({ title: "Balances Recalculated", description: "All balance records updated from transaction engine" });
              loadData();
            } catch (e: any) {
              toast({ title: "Error", description: e.message, variant: "destructive" });
            }
          }}>
            <RefreshCw className="h-4 w-4 mr-1" /> Recalc Balances
          </Button>
        )}
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

      {/* SR Credit Limit Mask Banner */}
      {shouldMaskCreditLimit && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
          <Shield className="h-4 w-4 text-amber-600" />
          <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">SR MODE — Credit limit information is masked</span>
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
                        // Use computed balance for customers/suppliers instead of stored stale value
                        if (col.key === "currentBalance" && (config.key === "customers" || config.key === "suppliers")) {
                          val = item.computedCurrentBalance ?? item.currentBalance ?? val;
                        }
                        if (col.key === "currentBalanceType" && (config.key === "customers" || config.key === "suppliers")) {
                          val = item.computedCurrentBalanceType ?? item.currentBalanceType ?? val;
                        }
                        if (isVatAuditor && maskedColumns.includes(col.key)) val = "N/A (Audit Mode)";
                        if (shouldMaskSalary && col.key === "baseSalary") val = "N/A (Audit Mode)";
                        if (shouldMaskCreditLimit && col.key === "creditLimit") val = "N/A (Audit Mode)";

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

                        // Credit status badge for customers and suppliers — use computed credit status
                        if (col.key === "creditStatus" && (config.key === "customers" || config.key === "suppliers")) {
                          const displayStatus = item.computedCreditStatus || item.creditStatus || "Active";
                          const creditColors: Record<string, string> = {
                            Active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                            Frozen: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
                            OverLimit: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                          };
                          return (
                            <TableCell key={col.key}>
                              <Badge className={creditColors[displayStatus] || "bg-slate-100 text-slate-500"}>
                                {displayStatus === "OverLimit" ? "Over Limit" : displayStatus}
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
                            <Button variant="ghost" size="sm" onClick={() => setDeleteConfirm(item.id)} className="h-7 w-7 p-0" disabled={!isAdmin && config.key !== "customers" && config.key !== "leave-allocations"}>
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
            <div className="overflow-x-auto max-h-64 overflow-y-auto -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800">
                    <TableHead className="text-xs font-semibold">Customer</TableHead>
                    <TableHead className="text-xs font-semibold">Current Balance</TableHead>
                    <TableHead className="text-xs font-semibold">Credit Limit</TableHead>
                    <TableHead className="text-xs font-semibold">Utilization</TableHead>
                    <TableHead className="text-xs font-semibold">Credit Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.filter(item => Number(item.creditLimit) > 0 || Number(item.computedCurrentBalance) > 0).map(item => {
                    const balance = Number(item.computedCurrentBalance ?? item.currentBalance) || 0;
                    const limit = Number(item.creditLimit) || 0;
                    const pct = limit > 0 ? Math.round((Math.abs(balance) / limit) * 100) : 0;
                    let barColor = "bg-emerald-500";
                    let textColor = "text-emerald-600";
                    if (pct > 100) { barColor = "bg-red-500"; textColor = "text-red-600"; }
                    else if (pct > 80) { barColor = "bg-amber-500"; textColor = "text-amber-600"; }
                    const maskedBalance = (isVatAuditor || shouldMaskCreditLimit) ? "N/A (Audit Mode)" : fmtCurrency(balance);
                    const maskedLimit = (isVatAuditor || shouldMaskCreditLimit) ? "N/A (Audit Mode)" : fmtCurrency(limit);
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
                        <TableCell className="text-xs">
                          <Badge className={
                            (item.computedCreditStatus || item.creditStatus) === "Frozen" ? "bg-red-100 text-red-700 text-[10px]" :
                            (item.computedCreditStatus || item.creditStatus) === "OverLimit" ? "bg-amber-100 text-amber-700 text-[10px]" :
                            "bg-emerald-100 text-emerald-700 text-[10px]"
                          }>
                            {(item.computedCreditStatus || item.creditStatus) === "OverLimit" ? "Over Limit" : (item.computedCreditStatus || item.creditStatus || "Active")}
                          </Badge>
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

      {/* Supplier Credit Utilization Section */}
      {config.key === "suppliers" && filteredData.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Credit Utilization Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto max-h-64 overflow-y-auto -mx-2 sm:mx-0">
              <Table className="min-w-[600px]">
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-slate-800">
                    <TableHead className="text-xs font-semibold">Supplier</TableHead>
                    <TableHead className="text-xs font-semibold">Current Balance</TableHead>
                    <TableHead className="text-xs font-semibold">Credit Limit</TableHead>
                    <TableHead className="text-xs font-semibold">Utilization</TableHead>
                    <TableHead className="text-xs font-semibold">Credit Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.filter(item => Number(item.creditLimit) > 0 || Number(item.computedCurrentBalance) > 0).map(item => {
                    const balance = Number(item.computedCurrentBalance ?? item.currentBalance) || 0;
                    const limit = Number(item.creditLimit) || 0;
                    const pct = limit > 0 ? Math.round((Math.abs(balance) / limit) * 100) : 0;
                    let barColor = "bg-emerald-500";
                    let textColor = "text-emerald-600";
                    if (pct > 100) { barColor = "bg-red-500"; textColor = "text-red-600"; }
                    else if (pct > 80) { barColor = "bg-amber-500"; textColor = "text-amber-600"; }
                    const maskedBalance = (isVatAuditor || shouldMaskCreditLimit) ? "N/A (Audit Mode)" : fmtCurrency(balance);
                    const maskedLimit = (isVatAuditor || shouldMaskCreditLimit) ? "N/A (Audit Mode)" : fmtCurrency(limit);
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
                        <TableCell className="text-xs">
                          <Badge className={
                            (item.computedCreditStatus || item.creditStatus) === "Frozen" ? "bg-red-100 text-red-700 text-[10px]" :
                            (item.computedCreditStatus || item.creditStatus) === "OverLimit" ? "bg-amber-100 text-amber-700 text-[10px]" :
                            "bg-emerald-100 text-emerald-700 text-[10px]"
                          }>
                            {(item.computedCreditStatus || item.creditStatus) === "OverLimit" ? "Over Limit" : (item.computedCreditStatus || item.creditStatus || "Active")}
                          </Badge>
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
        <DialogContent className={`max-w-[95vw] sm:${config.dialogWidth || "max-w-lg"} max-h-[85vh] overflow-y-auto`}>
          <DialogHeader>
            <DialogTitle>{editingItem ? `Edit ${singularize(config.label)}` : `New ${singularize(config.label)}`}</DialogTitle>
            <DialogDescription>
              {editingItem ? `Update ${singularize(config.label).toLowerCase()} details` : `Create a new ${singularize(config.label).toLowerCase()}`}
            </DialogDescription>
          </DialogHeader>

          {/* Phase 8: Corporate Entity Collision Banner */}
          {collisionError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2 mb-4">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              <span className="text-sm text-red-700 dark:text-red-400 font-medium">{collisionError}</span>
            </div>
          )}

          {/* Leave Balance Cards inside dialog */}
          {renderLeaveBalanceCards()}
          {renderFormContent()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Compiling Personnel Dossier...
                </>
              ) : editingItem ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirm {isSoftDeleteModule ? "Deactivate" : "Delete"}</DialogTitle>
            <DialogDescription>Are you sure you want to {isSoftDeleteModule ? "deactivate" : "permanently remove"} this {singularize(config.label).toLowerCase()}? {isSoftDeleteModule ? "The record will be marked as inactive but preserved in the system." : "This action cannot be undone."}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>{isSoftDeleteModule ? "Deactivate" : "Delete"}</Button>
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

export default function PersonnelCRMGroupPage({ activeModule }: { activeModule?: string }) {
  const auth = useAuth();
  const isVatAuditor = auth.user?.role === "vat_auditor";
  const userRole = auth.user?.role || "admin";

  // Determine active tab — update when activeModule prop changes (sidebar navigation)
  const [activeTab, setActiveTab] = useState(activeModule || "designations");
  useEffect(() => {
    if (activeModule) setActiveTab(activeModule);
  }, [activeModule]);

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
                <p className="text-xs text-slate-500 dark:text-slate-400">Designations, Employees, Employee Leave, Leave Allocations</p>
              </div>
            </div>
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto overflow-x-auto flex-wrap gap-1 p-1 scrollbar-none">
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
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto overflow-x-auto flex-wrap gap-1 p-1 scrollbar-none">
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
            <TabsList className="bg-slate-100 dark:bg-slate-800 h-auto overflow-x-auto flex-wrap gap-1 p-1 scrollbar-none">
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
