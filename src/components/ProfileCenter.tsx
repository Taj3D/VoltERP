"use client";
// ============================================================
// VILTERP — PROFILE CENTER v3.0 (Enhanced)
// Features:
// A. User Profile Card with Avatar Upload (Base64), Editable Name, Phone, Designation
//    + Company Logo Upload in Company Info card
//    + Save success animation + Last Updated timestamp
//    + Username safety nets (RAW_USERNAME_PATTERNS)
// B. Enhanced Action Tracking Tab
//    - Client-side tracking summary (localStorage)
//    - Server-side telemetry summary from /api/user-activity
//    - Visual summary cards: PDF Exports, CSV Exports, CSV Imports, Most Active Module
//    - Recharts bar chart showing action distribution by module
//    - Auto-refresh on new telemetry
// C. Enhanced Activity Ledger Tab
//    - Live indicator badge
//    - Module filter dropdown (dynamically populated)
//    - Date range filtering (Today, Last 7 Days, Last 30 Days, All Time)
//    - Filename column + View Details expansion row
// D. Admin Password Reset Tab Enhancement
//    - Security warning banner
//    - Admin: all users list + Reset Password button
//    - Recent Password Activity section
//    - Non-admin: 403 Access Denied card
// Theme: Deep Navy Blue (#0a1628, #132240, #2563eb)
// ============================================================

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  User, Mail, Building2, Phone, MapPin, Shield, KeyRound,
  FileDown, FileUp, FileText, RefreshCw, ChevronLeft, ChevronRight,
  Lock, CheckCircle, AlertTriangle, Activity, Eye, Camera,
  Pencil, Save, X, Upload, BarChart3, TrendingUp, Clock,
  Image as ImageIcon, ChevronDown, ChevronUp, Zap, Search,
  ShieldAlert, ShieldCheck, History, Globe, Hash
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  ResponsiveContainer, Cell
} from "recharts";
import { ROLES, ROLE_COLORS as SHARED_ROLE_COLORS, ROLE_LABELS_FULL, ROLE_BADGE_COLORS, type Role } from "@/lib/constants";

// ────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────
type UserRole = Role;

interface ProfileUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
  companyId: string | null;
  photo?: string | null;  // Maps to User.photo in Prisma
  phone?: string | null;
  address?: string | null;  // Maps to User.address in Prisma
  designation?: string | null;  // Derived from Employee.designation, not stored on User
}

interface ActivityLog {
  id: string;
  action: string;
  actionLabel: string;
  module: string;
  recordId: string | null;
  recordLabel: string | null;
  userName: string | null;
  details: Record<string, unknown>;
  filename: string | null;
  createdAt: string;
}

interface CompanyInfo {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  logo?: string | null;
  brandLogo?: string | null;
  mobile?: string | null;
  website?: string | null;
  vatNumber?: string | null;
  tradeLicense?: string | null;
}

interface EmployeeInfo {
  id: string;
  name: string;
  designationId: string;
  designation?: { name: string } | null;
}

interface UserForReset {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive?: boolean;
}

interface ActionTrackingEntry {
  actionType: "PDF_EXPORT" | "CSV_EXPORT" | "CSV_IMPORT";
  module: string;
  filename: string;
  timestamp: string;
}

interface ActionTrackingSummary {
  pdfExportCount: number;
  csvExportCount: number;
  csvImportCount: number;
  totalActions: number;
  recentActions: ActionTrackingEntry[];
}

// ────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────
const ROLE_COLORS = SHARED_ROLE_COLORS;
// ROLE_BADGE_COLORS imported from @/lib/constants
const ROLE_LABELS = ROLE_LABELS_FULL;

const ACTION_TYPE_OPTIONS = [
  { value: "ALL", label: "All Activities" },
  { value: "PDF_EXPORT", label: "PDF Export" },
  { value: "CSV_EXPORT", label: "CSV Export" },
  { value: "CSV_IMPORT", label: "CSV Import" },
];

const DATE_RANGE_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];

const TRACKING_STORAGE_KEY = "ems_action_tracking";

// Comprehensive raw username pattern check
const RAW_USERNAME_PATTERNS = /^(emart\.|admin\.|user\.|sys\.|test\.)/i;

const CHART_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#f59e0b", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

// ────────────────────────────────────────────────────────────
// HELPER: get auth headers
// ────────────────────────────────────────────────────────────
function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("ems_auth");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.accessToken) {
          headers["Authorization"] = `Bearer ${parsed.accessToken}`;
        }
      }
    } catch { /* ignore */ }
  }
  return headers;
}

function getAuthUser(): ProfileUser | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem("ems_auth");
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed?.user) {
        return {
          id: parsed.user.email,
          name: parsed.user.name,
          email: parsed.user.email,
          role: parsed.user.role,
          displayName: parsed.user.displayName || parsed.user.name,
          companyId: parsed.user.companyId || null,
          photo: parsed.user.photo || null,
          phone: parsed.user.phone || null,
          address: parsed.user.address || null,
          designation: parsed.user.designation || null,
        };
      }
    }
  } catch { /* ignore */ }
  return null;
}

// ────────────────────────────────────────────────────────────
// USERNAME SAFETY: mask raw username patterns
// ────────────────────────────────────────────────────────────
function isRawUsername(name: string | null | undefined): boolean {
  if (!name) return true;
  return RAW_USERNAME_PATTERNS.test(name);
}

function getSafeDisplayName(name: string | null | undefined, fallback: string = "User"): string {
  if (!name) return fallback;
  if (isRawUsername(name)) return fallback;
  return name;
}

// ────────────────────────────────────────────────────────────
// ACTION TRACKING STORAGE (Persistent Local State)
// ────────────────────────────────────────────────────────────
function getActionTracking(): ActionTrackingSummary {
  if (typeof window === "undefined") {
    return { pdfExportCount: 0, csvExportCount: 0, csvImportCount: 0, totalActions: 0, recentActions: [] };
  }
  try {
    const stored = localStorage.getItem(TRACKING_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch { /* ignore */ }
  return { pdfExportCount: 0, csvExportCount: 0, csvImportCount: 0, totalActions: 0, recentActions: [] };
}

function saveActionTracking(tracking: ActionTrackingSummary): void {
  if (typeof window === "undefined") return;
  try {
    tracking.recentActions = tracking.recentActions.slice(0, 50);
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(tracking));
  } catch { /* ignore */ }
}

function recordAction(actionType: "PDF_EXPORT" | "CSV_EXPORT" | "CSV_IMPORT", module: string, filename: string): ActionTrackingSummary {
  const tracking = getActionTracking();
  const entry: ActionTrackingEntry = {
    actionType,
    module,
    filename,
    timestamp: new Date().toISOString(),
  };

  tracking.recentActions.unshift(entry);
  tracking.totalActions += 1;

  if (actionType === "PDF_EXPORT") tracking.pdfExportCount += 1;
  if (actionType === "CSV_EXPORT") tracking.csvExportCount += 1;
  if (actionType === "CSV_IMPORT") tracking.csvImportCount += 1;

  saveActionTracking(tracking);
  return tracking;
}

// ────────────────────────────────────────────────────────────
// DATE HELPERS
// ────────────────────────────────────────────────────────────
function getDateRangeFilter(range: string): Date | null {
  const now = new Date();
  switch (range) {
    case "today": {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      return start;
    }
    case "7d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      return start;
    }
    case "30d": {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      return start;
    }
    default:
      return null;
  }
}

// ============================================================
// MAIN COMPONENT
// ============================================================
export default function ProfileCenter() {
  const { toast } = useToast();
  const [user, setUser] = useState<ProfileUser | null>(null);
  const [companyInfo, setCompanyInfo] = useState<CompanyInfo | null>(null);
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [loading, setLoading] = useState(true);

  // Profile editing state
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editDesignation, setEditDesignation] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editProfileImage, setEditProfileImage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Company logo upload state
  const [companyLogoUploading, setCompanyLogoUploading] = useState(false);
  const [editCompanyLogo, setEditCompanyLogo] = useState<string | null>(null);
  const companyLogoInputRef = useRef<HTMLInputElement>(null);

  // Company info editing state (Company Info tab)
  const [isEditingCompany, setIsEditingCompany] = useState(false);
  const [editCompanyName, setEditCompanyName] = useState("");
  const [editCompanyAddress, setEditCompanyAddress] = useState("");
  const [editCompanyPhone, setEditCompanyPhone] = useState("");
  const [editCompanyEmail, setEditCompanyEmail] = useState("");
  const [editCompanyMobile, setEditCompanyMobile] = useState("");
  const [editCompanyWebsite, setEditCompanyWebsite] = useState("");
  const [editCompanyVatNumber, setEditCompanyVatNumber] = useState("");
  const [editCompanyTradeLicense, setEditCompanyTradeLicense] = useState("");
  const [savingCompanyInfo, setSavingCompanyInfo] = useState(false);

  // Action tracking state (client-side)
  const [actionTracking, setActionTracking] = useState<ActionTrackingSummary>({
    pdfExportCount: 0, csvExportCount: 0, csvImportCount: 0, totalActions: 0, recentActions: []
  });

  // Server-side telemetry state for Action Tracking tab
  const [serverTelemetry, setServerTelemetry] = useState<ActivityLog[]>([]);
  const [serverTelemetryLoading, setServerTelemetryLoading] = useState(false);

  // Activity ledger state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize] = useState(20);
  const [activityFilter, setActivityFilter] = useState("ALL");
  const [activityModuleFilter, setActivityModuleFilter] = useState("ALL");
  const [activityDateRange, setActivityDateRange] = useState("all");
  const [activityLoading, setActivityLoading] = useState(false);
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // Admin password reset state
  const [allUsers, setAllUsers] = useState<UserForReset[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<UserForReset | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  // Password change (admin self) state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // Recent password activity state
  const [passwordActivity, setPasswordActivity] = useState<ActivityLog[]>([]);

  // ────────────────────────────────────────────────────────
  // INITIAL LOAD
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    const authUser = getAuthUser();
    if (authUser) {
      setUser(authUser);
      setEditName(getSafeDisplayName(authUser.displayName || authUser.name));
      setEditPhone(authUser.phone || "");
      setEditDesignation(authUser.designation || "");
      setEditAddress(authUser.address || "");
      setEditProfileImage(authUser.photo || null);
      loadCompanyAndEmployee(authUser);
      loadProfileFromServer();
    }
    setActionTracking(getActionTracking());
    setLoading(false);
  }, []);

  // Load activity logs when user is set or filters change
  useEffect(() => {
    if (user) {
      loadActivityLogs();
    }
  }, [user, activityPage, activityFilter, activityModuleFilter, activityDateRange]);

  // Refresh action tracking periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setActionTracking(getActionTracking());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-refresh server telemetry when on tracking tab
  useEffect(() => {
    const interval = setInterval(() => {
      if (user) loadServerTelemetry();
    }, 15000);
    return () => clearInterval(interval);
  }, [user]);

  // ────────────────────────────────────────────────────────
  // LOAD PROFILE FROM SERVER
  // ────────────────────────────────────────────────────────
  const loadProfileFromServer = async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch("/api/auth/profile", { headers });
      if (res.ok) {
        const serverProfile = await res.json();
        const safeName = getSafeDisplayName(serverProfile.name);
        const updatedUser: ProfileUser = {
          id: serverProfile.id,
          name: serverProfile.name,
          email: serverProfile.email,
          role: serverProfile.role,
          displayName: safeName,
          companyId: serverProfile.companyId,
          photo: serverProfile.photo || null,
          phone: serverProfile.phone,
          address: serverProfile.address || null,
          designation: serverProfile.designation || null,
        };
        setUser(updatedUser);
        setEditName(safeName);
        setEditPhone(updatedUser.phone || "");
        setEditDesignation(updatedUser.designation || "");
        setEditAddress(updatedUser.address || "");
        setEditProfileImage(updatedUser.photo || null);

        // Update localStorage auth state
        try {
          const stored = localStorage.getItem("ems_auth");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.user) {
              parsed.user.name = safeName;
              parsed.user.displayName = safeName;
              parsed.user.photo = serverProfile.photo;
              parsed.user.phone = serverProfile.phone;
              parsed.user.designation = serverProfile.designation;
              parsed.user.address = serverProfile.address;
              localStorage.setItem("ems_auth", JSON.stringify(parsed));
            }
          }
        } catch { /* ignore */ }
      }
    } catch (err) {
      console.error("Failed to load server profile:", err);
    }
  };

  // ────────────────────────────────────────────────────────
  // LOAD COMPANY & EMPLOYEE DATA
  // ────────────────────────────────────────────────────────
  const loadCompanyAndEmployee = async (authUser: ProfileUser) => {
    try {
      const headers = getAuthHeaders();

      const compRes = await fetch("/api/companies", { headers });
      if (compRes.ok) {
        const compData = await compRes.json();
        const companies = compData.data || compData;
        if (Array.isArray(companies) && companies.length > 0) {
          const userCompany = authUser.companyId
            ? companies.find((c: CompanyInfo) => c.id === authUser.companyId)
            : companies[0];
          if (userCompany) {
            setCompanyInfo(userCompany);
            setEditCompanyLogo(userCompany.logo || userCompany.brandLogo || null);
            // Populate company edit fields
            setEditCompanyName(userCompany.name || "");
            setEditCompanyAddress(userCompany.address || "");
            setEditCompanyPhone(userCompany.phone || "");
            setEditCompanyEmail(userCompany.email || "");
            setEditCompanyMobile(userCompany.mobile || "");
            setEditCompanyWebsite(userCompany.website || "");
            setEditCompanyVatNumber(userCompany.vatNumber || "");
            setEditCompanyTradeLicense(userCompany.tradeLicense || "");
          }
        }
      }

      const empRes = await fetch("/api/employees", { headers });
      if (empRes.ok) {
        const empData = await empRes.json();
        const employees = empData.data || empData;
        if (Array.isArray(employees)) {
          const matchingEmployee = employees.find(
            (e: EmployeeInfo) =>
              e.name?.toLowerCase() === authUser.displayName?.toLowerCase() ||
              e.name?.toLowerCase() === authUser.name?.toLowerCase()
          );
          if (matchingEmployee) {
            setEmployeeInfo(matchingEmployee);
          }
        }
      }
    } catch (err) {
      console.error("Failed to load company/employee data:", err);
    }
  };

  // ────────────────────────────────────────────────────────
  // LOAD SERVER TELEMETRY for Action Tracking tab
  // ────────────────────────────────────────────────────────
  const loadServerTelemetry = async () => {
    if (!user) return;
    setServerTelemetryLoading(true);
    try {
      const headers = getAuthHeaders();
      const params = new URLSearchParams({
        userId: user.id || user.email,
        page: "1",
        pageSize: "200",
        actionType: "ALL",
      });
      const res = await fetch(`/api/user-activity?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setServerTelemetry(data.logs || []);
      }
    } catch (err) {
      console.error("Failed to load server telemetry:", err);
    } finally {
      setServerTelemetryLoading(false);
    }
  };

  // Load server telemetry on mount
  useEffect(() => {
    if (user) loadServerTelemetry();
  }, [user]);

  // ────────────────────────────────────────────────────────
  // COMPUTED: Server-side telemetry summary
  // ────────────────────────────────────────────────────────
  const serverSummary = useMemo(() => {
    const pdfCount = serverTelemetry.filter(l => l.actionLabel.includes("PDF")).length;
    const csvExportCount = serverTelemetry.filter(l => l.actionLabel.includes("CSV Export")).length;
    const csvImportCount = serverTelemetry.filter(l => l.actionLabel.includes("CSV Import")).length;

    // Module distribution
    const moduleMap: Record<string, number> = {};
    serverTelemetry.forEach(l => {
      const mod = l.module?.replace(/^Telemetry-/, "") || "Unknown";
      moduleMap[mod] = (moduleMap[mod] || 0) + 1;
    });

    const mostActiveModule = Object.entries(moduleMap).sort((a, b) => b[1] - a[1])[0];

    // Chart data
    const chartData = Object.entries(moduleMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([name, count]) => ({
        name: name.length > 12 ? name.slice(0, 12) + "…" : name,
        fullName: name,
        count,
      }));

    return {
      pdfCount,
      csvExportCount,
      csvImportCount,
      total: serverTelemetry.length,
      mostActiveModule: mostActiveModule ? mostActiveModule[0] : "N/A",
      mostActiveModuleCount: mostActiveModule ? mostActiveModule[1] : 0,
      chartData,
      moduleMap,
    };
  }, [serverTelemetry]);

  // ────────────────────────────────────────────────────────
  // COMPUTED: Available modules for filter dropdown
  // ────────────────────────────────────────────────────────
  const availableModules = useMemo(() => {
    const modules = new Set<string>();
    activityLogs.forEach(l => {
      if (l.module) modules.add(l.module.replace(/^Telemetry-/, ""));
    });
    return Array.from(modules).sort();
  }, [activityLogs]);

  // ────────────────────────────────────────────────────────
  // LOAD ACTIVITY LOGS
  // ────────────────────────────────────────────────────────
  const loadActivityLogs = async () => {
    if (!user) return;
    setActivityLoading(true);
    try {
      const headers = getAuthHeaders();
      const params = new URLSearchParams({
        userId: user.id || user.email,
        page: String(activityPage),
        pageSize: String(activityPageSize),
        actionType: activityFilter,
      });
      const res = await fetch(`/api/user-activity?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        let logs: ActivityLog[] = data.logs || [];

        // Client-side module filter
        if (activityModuleFilter !== "ALL") {
          logs = logs.filter(l => {
            const mod = l.module?.replace(/^Telemetry-/, "") || "";
            return mod === activityModuleFilter;
          });
        }

        // Client-side date range filter
        const dateThreshold = getDateRangeFilter(activityDateRange);
        if (dateThreshold) {
          logs = logs.filter(l => new Date(l.createdAt) >= dateThreshold);
        }

        setActivityLogs(logs);
        setActivityTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load activity logs:", err);
    } finally {
      setActivityLoading(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // LOAD PASSWORD ACTIVITY (for Admin Password tab)
  // ────────────────────────────────────────────────────────
  const loadPasswordActivity = async () => {
    if (!user || user.role !== "admin") return;
    try {
      const headers = getAuthHeaders();
      const params = new URLSearchParams({
        userId: user.id || user.email,
        page: "1",
        pageSize: "50",
        actionType: "ALL",
      });
      const res = await fetch(`/api/user-activity?${params}`, { headers });
      if (res.ok) {
        const data = await res.json();
        const allLogs: ActivityLog[] = data.logs || [];
        // Filter for password/profile related
        const pwLogs = allLogs.filter(l =>
          l.module?.toLowerCase().includes("password") ||
          l.module?.toLowerCase().includes("profile") ||
          l.actionLabel?.toLowerCase().includes("password") ||
          l.recordLabel?.toLowerCase().includes("password")
        ).slice(0, 5);
        setPasswordActivity(pwLogs);
      }
    } catch (err) {
      console.error("Failed to load password activity:", err);
    }
  };

  // ────────────────────────────────────────────────────────
  // ADMIN: LOAD ALL USERS FOR PASSWORD RESET
  // ────────────────────────────────────────────────────────
  const loadAllUsers = async () => {
    if (user?.role !== "admin") return;
    try {
      const headers = getAuthHeaders();
      const res = await fetch("/api/users", { headers });
      if (res.ok) {
        const data = await res.json();
        const users = (data.data || data || []).filter(
          (u: UserForReset) => u.isActive !== false
        );
        setAllUsers(users);
      }
    } catch (err) {
      console.error("Failed to load users:", err);
    }
  };

  useEffect(() => {
    if (user?.role === ROLES.ADMIN) {
      loadAllUsers();
      loadPasswordActivity();
    }
  }, [user]);

  // ────────────────────────────────────────────────────────
  // PROFILE IMAGE UPLOAD HANDLER
  // ────────────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file (PNG, JPG, GIF, WebP).", variant: "destructive" });
      return;
    }

    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({ title: "Invalid Format", description: "Accepted formats: JPG, PNG, GIF, WebP.", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Profile photo must be smaller than 5MB.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setEditProfileImage(base64);
    };
    reader.onerror = () => {
      toast({ title: "Upload Failed", description: "Failed to read image file. Please try again.", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  };

  // ────────────────────────────────────────────────────────
  // COMPANY LOGO UPLOAD HANDLER
  // ────────────────────────────────────────────────────────
  const handleCompanyLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid File", description: "Please select an image file (PNG, JPG, GIF, WebP).", variant: "destructive" });
      return;
    }

    const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      toast({ title: "Invalid Format", description: "Accepted formats: JPG, PNG, GIF, WebP.", variant: "destructive" });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File Too Large", description: "Company logo must be smaller than 5MB.", variant: "destructive" });
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = reader.result as string;
      setEditCompanyLogo(base64);

      // Save to server immediately via company-branding API (Admin-only)
      if (companyInfo) {
        setCompanyLogoUploading(true);
        try {
          const headers = getAuthHeaders();
          const res = await fetch("/api/company-branding", {
            method: "PUT",
            headers,
            body: JSON.stringify({ logo: base64 }),
          });
          if (res.ok) {
            setCompanyInfo(prev => prev ? { ...prev, logo: base64 } : prev);
            toast({ title: "Logo Updated", description: "Company logo has been saved successfully." });
          } else {
            const errData = await res.json().catch(() => ({ error: "Failed" }));
            toast({ title: "Error", description: errData.error || "Failed to upload company logo", variant: "destructive" });
          }
        } catch (err) {
          toast({ title: "Error", description: "Failed to upload company logo", variant: "destructive" });
        } finally {
          setCompanyLogoUploading(false);
        }
      }
    };
    reader.onerror = () => {
      toast({ title: "Upload Failed", description: "Failed to read logo file. Please try again.", variant: "destructive" });
    };
    reader.readAsDataURL(file);
  };

  // ────────────────────────────────────────────────────────
  // SAVE PROFILE UPDATES
  // ────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      toast({ title: "Validation Error", description: "Name cannot be empty.", variant: "destructive" });
      return;
    }

    // Block raw usernames
    if (isRawUsername(editName.trim())) {
      toast({ title: "Invalid Name", description: "This name pattern is not allowed. Please use a proper display name.", variant: "destructive" });
      return;
    }

    setSavingProfile(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: editName.trim(),
          photo: editProfileImage,
          phone: editPhone.trim() || null,
          address: editAddress.trim() || null,
          designation: editDesignation.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to update profile" }));
        throw new Error(errData.error || "Failed to update profile");
      }

      const data = await res.json();
      const safeName = getSafeDisplayName(data.user.name);

      // Update local state
      if (user) {
        const updatedUser: ProfileUser = {
          ...user,
          name: data.user.name,
          displayName: safeName,
          photo: data.user.photo,
          phone: data.user.phone,
          address: data.user.address,
          designation: data.user.designation,
        };
        setUser(updatedUser);
      }

      // Update localStorage auth state
      try {
        const stored = localStorage.getItem("ems_auth");
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.user) {
            parsed.user.name = safeName;
            parsed.user.displayName = safeName;
            parsed.user.photo = data.user.photo;
            parsed.user.phone = data.user.phone;
            parsed.user.designation = data.user.designation;
            parsed.user.address = data.user.address;
            localStorage.setItem("ems_auth", JSON.stringify(parsed));
          }
        }
      } catch { /* ignore */ }

      setIsEditing(false);
      setLastUpdated(new Date().toISOString());

      // Show success animation
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);

      toast({ title: "Profile Updated", description: "Your profile has been saved successfully." });
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to update profile", variant: "destructive" });
    } finally {
      setSavingProfile(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // ADMIN: HANDLE PASSWORD RESET
  // ────────────────────────────────────────────────────────
  const handlePasswordReset = async () => {
    if (!resetTargetUser) return;
    if (!resetNewPassword || resetNewPassword.length < 6) {
      toast({ title: "Validation Error", description: "Password must be at least 6 characters long.", variant: "destructive" });
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast({ title: "Validation Error", description: "Passwords do not match.", variant: "destructive" });
      return;
    }

    setResetSaving(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers,
        body: JSON.stringify({
          targetUserId: resetTargetUser.id,
          newPassword: resetNewPassword,
          adminUserId: user?.id || user?.email,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to reset password" }));
        throw new Error(errData.error || "Failed to reset password");
      }

      toast({ title: "Success", description: `Password reset successfully for ${resetTargetUser.email}` });
      setResetDialogOpen(false);
      setResetTargetUser(null);
      setResetNewPassword("");
      setResetConfirmPassword("");
      // Refresh password activity
      loadPasswordActivity();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to reset password", variant: "destructive" });
    } finally {
      setResetSaving(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // SAVE COMPANY INFO UPDATES
  // ────────────────────────────────────────────────────────
  const handleSaveCompanyInfo = async () => {
    if (!companyInfo) return;
    if (!editCompanyName.trim()) {
      toast({ title: "Validation Error", description: "Company name cannot be empty.", variant: "destructive" });
      return;
    }
    // Only Admin can modify company branding
    if (user?.role !== "admin") {
      toast({ title: "Access Denied", description: "Only administrators can modify company branding.", variant: "destructive" });
      return;
    }
    setSavingCompanyInfo(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch("/api/company-branding", {
        method: "PUT",
        headers,
        body: JSON.stringify({
          name: editCompanyName.trim(),
          address: editCompanyAddress.trim() || null,
          phone: editCompanyPhone.trim() || null,
          email: editCompanyEmail.trim() || null,
          mobile: editCompanyMobile.trim() || null,
          website: editCompanyWebsite.trim() || null,
          vatNumber: editCompanyVatNumber.trim() || null,
          tradeLicense: editCompanyTradeLicense.trim() || null,
        }),
      });
      if (res.ok) {
        const result = await res.json();
        const updated = result.company || result;
        setCompanyInfo(prev => prev ? {
          ...prev,
          name: updated.name || editCompanyName.trim(),
          address: updated.address ?? (editCompanyAddress.trim() || null),
          phone: updated.phone ?? (editCompanyPhone.trim() || null),
          email: updated.email ?? (editCompanyEmail.trim() || null),
          mobile: updated.mobile ?? (editCompanyMobile.trim() || null),
          website: updated.website ?? (editCompanyWebsite.trim() || null),
          vatNumber: updated.vatNumber ?? (editCompanyVatNumber.trim() || null),
          tradeLicense: updated.tradeLicense ?? (editCompanyTradeLicense.trim() || null),
        } : prev);
        setIsEditingCompany(false);
        toast({ title: "Company Info Updated", description: "Company information has been saved successfully." });
      } else {
        const errData = await res.json().catch(() => ({ error: "Failed to update company info" }));
        toast({ title: "Error", description: errData.error || "Failed to update company info", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Error", description: "Failed to update company info", variant: "destructive" });
    } finally {
      setSavingCompanyInfo(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // ADMIN SELF PASSWORD CHANGE
  // ────────────────────────────────────────────────────────
  const handleSelfPasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast({ title: "Validation Error", description: "All password fields are required.", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Validation Error", description: "New password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({ title: "Validation Error", description: "New password and confirmation do not match.", variant: "destructive" });
      return;
    }

    setChangingPassword(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers,
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword: confirmNewPassword }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to change password" }));
        if (res.status === 403 && errData.errorCode === "PRIVILEGE_ESCALATION_BLOCKED") {
          throw new Error("403 Forbidden: Privilege Escalation Blocked — Your role is not authorized to change passwords.");
        }
        throw new Error(errData.error || "Failed to change password");
      }

      toast({ title: "Password Changed", description: "Your password has been updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      // Refresh password activity
      loadPasswordActivity();
    } catch (err) {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed to change password", variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────
  const totalPages = Math.ceil(activityTotal / activityPageSize);

  const getDesignation = (): string => {
    if (employeeInfo?.designation?.name) return employeeInfo.designation.name;
    if (user?.designation) return user.designation;
    // Do NOT show role labels (Administrator, Manager, etc.) — return email domain instead
    if (user?.email) return user.email;
    return "N/A";
  };

  const getInitials = (): string => {
    if (!user?.displayName && !user?.name) return "U";
    const name = user.displayName || user.name;
    // Comprehensive raw username pattern check
    if (RAW_USERNAME_PATTERNS.test(name)) return "U";
    const parts = name.split(" ");
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  };

  const formatTimestamp = (dateStr: string): string => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  const getActionIcon = (actionLabel: string) => {
    if (actionLabel.includes("PDF")) return <FileDown className="w-4 h-4 text-red-500" />;
    if (actionLabel.includes("CSV Export")) return <FileDown className="w-4 h-4 text-green-500" />;
    if (actionLabel.includes("CSV Import")) return <FileUp className="w-4 h-4 text-blue-500" />;
    return <FileText className="w-4 h-4 text-muted-foreground" />;
  };

  const getActionBadgeColor = (actionLabel: string): string => {
    if (actionLabel.includes("PDF")) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (actionLabel.includes("CSV Export")) return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    if (actionLabel.includes("CSV Import")) return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    return "bg-gray-100 text-gray-700 dark:bg-gray-900/30 dark:text-gray-400";
  };

  // ────────────────────────────────────────────────────────
  // LOADING STATE
  // ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="page-enter space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-muted rounded w-48" />
          <div className="h-64 bg-muted rounded" />
          <div className="h-48 bg-muted rounded" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page-enter space-y-4">
        <Card className="border-red-300 dark:border-red-800">
          <CardContent className="p-6 text-center">
            <AlertTriangle className="w-12 h-12 mx-auto text-red-500 mb-4" />
            <h3 className="text-lg font-semibold">Not Authenticated</h3>
            <p className="text-sm text-muted-foreground mt-2">Please log in to view your profile.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Safe display name — never show raw username or email
  const safeDisplayName = getSafeDisplayName(user.displayName || user.name);

  // ────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────
  return (
    <div className="page-enter space-y-6">
      {/* Page Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">My Profile</h2>
          <p className="text-sm text-muted-foreground mt-1">Manage your account settings and view activity</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadProfileFromServer(); loadActivityLogs(); loadServerTelemetry(); setActionTracking(getActionTracking()); }}
            disabled={activityLoading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${activityLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {!isEditing ? (
            <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => setIsEditing(true)}>
              <Pencil className="w-4 h-4 mr-2" />
              Edit Profile
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => {
                setIsEditing(false);
                setEditName(safeDisplayName);
                setEditPhone(user.phone || "");
                setEditDesignation(user.designation || "");
                setEditAddress(user.address || "");
                setEditProfileImage(user.photo || null);
              }}>
                <X className="w-4 h-4 mr-2" />
                Cancel
              </Button>
              <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save Changes
              </Button>
            </div>
          )}
          {/* Save Success Animation */}
          {saveSuccess && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 animate-in fade-in slide-in-from-right">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Saved!</span>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="company">
            <Building2 className="w-3.5 h-3.5 mr-1" />
            Company Info
          </TabsTrigger>
          <TabsTrigger value="tracking">
            <BarChart3 className="w-3.5 h-3.5 mr-1" />
            Action Tracking
          </TabsTrigger>
          <TabsTrigger value="activity">
            <Activity className="w-3.5 h-3.5 mr-1" />
            Activity Ledger
            {activityTotal > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                {activityTotal}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="admin-reset">
            <KeyRound className="w-3.5 h-3.5 mr-1" />
            Password Security
          </TabsTrigger>
        </TabsList>

        {/* ════════════════════════════════════════════════════
            TAB A: USER PROFILE CARD (EDITABLE) + COMPANY LOGO
            ════════════════════════════════════════════════════ */}
        <TabsContent value="profile" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Card */}
            <Card className="lg:col-span-1 border-0 shadow-md bg-gradient-to-br from-white to-slate-50 dark:from-[#132240] dark:to-[#0a1628]">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  {/* Avatar / Profile Image */}
                  <div className="relative group">
                    {isEditing ? (
                      <div className="relative cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                        {editProfileImage ? (
                          <img
                            src={editProfileImage}
                            alt="Profile"
                            className="w-24 h-24 rounded-full object-cover border-4 border-white/20 shadow-lg"
                          />
                        ) : (
                          <div
                            className={`w-24 h-24 rounded-full ${
                              user.role ? ROLE_COLORS[user.role] : "bg-[#2563eb]"
                            } flex items-center justify-center text-white text-3xl font-bold shadow-lg border-4 border-white/20`}
                          >
                            {getInitials()}
                          </div>
                        )}
                        <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <Camera className="w-6 h-6 text-white" />
                        </div>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleImageUpload}
                        />
                      </div>
                    ) : user.photo ? (
                      <img
                        src={user.photo}
                        alt={safeDisplayName}
                        className="w-24 h-24 rounded-full object-cover border-4 border-white/20 shadow-lg"
                      />
                    ) : (
                      <div
                        className={`w-24 h-24 rounded-full ${
                          user.role ? ROLE_COLORS[user.role] : "bg-[#2563eb]"
                        } flex items-center justify-center text-white text-3xl font-bold shadow-lg`}
                      >
                        {getInitials()}
                      </div>
                    )}
                    {/* Online indicator */}
                    <span className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-white dark:border-[#132240] rounded-full" />
                  </div>

                  {/* Name (editable or display) — NEVER show raw email */}
                  {isEditing ? (
                    <div className="w-full space-y-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Full Name"
                        className="text-center font-semibold"
                      />
                    </div>
                  ) : (
                    <div>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                        {safeDisplayName}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {getDesignation()}
                      </p>
                    </div>
                  )}

                  {/* Role badge hidden per requirement — role names not visible in UI */}

                  <Separator />

                  {/* Contact Details */}
                  <div className="w-full space-y-3 text-left">
                    {/* Role label hidden per requirement — only email visible */}

                    {/* Email (read-only) */}
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground truncate" title={user.email}>{user.email}</span>
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">Read-only</Badge>
                    </div>

                    {/* Phone (editable) */}
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Input
                          value={editPhone}
                          onChange={(e) => setEditPhone(e.target.value)}
                          placeholder="Contact Number"
                          className="h-8 text-sm"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm">
                        <Phone className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">{user.phone || "—"}</span>
                      </div>
                    )}

                    {/* Address (editable) */}
                    {isEditing ? (
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-1.5" />
                        <Input
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          placeholder="Address"
                          className="h-8 text-sm"
                        />
                      </div>
                    ) : (
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                        <span className="text-muted-foreground break-words">{user.address || "—"}</span>
                      </div>
                    )}

                    {/* Designation (editable) */}
                    {isEditing ? (
                      <div className="flex items-center gap-2">
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Input
                          value={editDesignation}
                          onChange={(e) => setEditDesignation(e.target.value)}
                          placeholder="Designation"
                          className="h-8 text-sm"
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-sm">
                        <User className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">{getDesignation()}</span>
                      </div>
                    )}

                    {employeeInfo && (
                      <div className="flex items-center gap-2 text-sm">
                        <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Employee Code: {String((employeeInfo as unknown as Record<string, unknown>)?.employeeCode || "—")}</span>
                      </div>
                    )}
                  </div>

                  {/* Image upload/remove in edit mode */}
                  {isEditing && editProfileImage && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={() => setEditProfileImage(null)}
                    >
                      <X className="w-3.5 h-3.5 mr-1" />
                      Remove Photo
                    </Button>
                  )}

                  {/* Last Updated Timestamp */}
                  {lastUpdated && (
                    <div className="w-full pt-2 border-t border-border/50">
                      <p className="text-[11px] text-muted-foreground/60 text-center flex items-center justify-center gap-1">
                        <Clock className="w-3 h-3" />
                        Last updated: {formatTimestamp(lastUpdated)}
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Company & Tenant Info + Company Logo Upload (Admin only for logo changes) */}
            <Card className="lg:col-span-2 border-0 shadow-md">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#2563eb]" />
                    Tenant Company Information
                  </CardTitle>
                  {/* Company Logo Upload (Admin only) */}
                  {user?.role === "admin" && (
                    <div className="flex items-center gap-2">
                      {editCompanyLogo ? (
                        <div className="relative group">
                          <img
                            src={editCompanyLogo}
                            alt="Company Logo"
                            className="w-12 h-12 rounded-lg object-contain border border-border/50 bg-white p-0.5"
                          />
                          <div
                            className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            onClick={() => companyLogoInputRef.current?.click()}
                          >
                            <Camera className="w-4 h-4 text-white" />
                          </div>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => companyLogoInputRef.current?.click()}
                          disabled={companyLogoUploading}
                        >
                          {companyLogoUploading ? (
                            <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 mr-1" />
                          )}
                          Upload Logo
                        </Button>
                      )}
                      <input
                        ref={companyLogoInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleCompanyLogoUpload}
                      />
                    </div>
                  )}
                  {user?.role !== "admin" && editCompanyLogo && (
                    <img
                      src={editCompanyLogo}
                      alt="Company Logo"
                      className="w-12 h-12 rounded-lg object-contain border border-border/50 bg-white p-0.5"
                    />
                  )}
                </div>
                <CardDescription>
                  Company details associated with your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {companyInfo ? (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Company Name</Label>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {companyInfo.name || "—"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Company Email</Label>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {companyInfo.email || "—"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <Phone className="w-3 h-3" /> Phone
                        </Label>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {companyInfo.phone || "—"}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> Address
                        </Label>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {companyInfo.address || "—"}
                        </p>
                      </div>
                    </div>
                    {/* Company Logo Thumbnail */}
                    {editCompanyLogo && (
                      <div className="pt-3 border-t border-border/50">
                        <Label className="text-xs text-muted-foreground mb-2 block">Company Logo</Label>
                        <div className="flex items-center gap-3">
                          <img
                            src={editCompanyLogo}
                            alt="Company Logo"
                            className="w-20 h-20 rounded-lg object-contain border border-border/50 bg-white p-1 shadow-sm"
                          />
                          <div className="space-y-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => companyLogoInputRef.current?.click()}
                              disabled={companyLogoUploading}
                            >
                              <Upload className="w-3 h-3 mr-1" />
                              Replace
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={async () => {
                                setEditCompanyLogo(null);
                                if (companyInfo) {
                                  try {
                                    const headers = getAuthHeaders();
                                    await fetch("/api/company-branding", {
                                      method: "PUT",
                                      headers,
                                      body: JSON.stringify({ logo: null }),
                                    });
                                    setCompanyInfo(prev => prev ? { ...prev, logo: null } : prev);
                                    toast({ title: "Logo Removed", description: "Company logo has been removed." });
                                  } catch {
                                    toast({ title: "Error", description: "Failed to remove logo", variant: "destructive" });
                                  }
                                }
                              }}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <Building2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                    <p className="text-sm text-muted-foreground">No company associated with your account</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      Contact your administrator to link your account to a company
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Change Password Section (Admin-only with RBAC interlock) */}
          <Card className="border-0 shadow-md border-l-4 border-l-amber-500">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-amber-500" />
                Change My Password
                {user.role !== "admin" && (
                  <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] ml-2">
                    <Lock className="w-3 h-3 mr-1" />
                    ADMIN ONLY
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {user.role === ROLES.ADMIN
                  ? "Update your account password. All changes are audited."
                  : "Only users with the ADMIN role can change passwords. This route is protected by a server-side RBAC interlock."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {user.role !== "admin" ? (
                <div className="p-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-center">
                  <div className="w-14 h-14 mx-auto rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center mb-3">
                    <Shield className="w-7 h-7 text-red-500" />
                  </div>
                  <h4 className="text-base font-semibold text-red-600 dark:text-red-400">403 Forbidden: Privilege Escalation Blocked</h4>
                  <p className="text-sm text-red-500/80 dark:text-red-400/80 mt-2 max-w-md mx-auto">
                    You do not have permission to change passwords.
                    Only administrators can modify user credentials. Any attempt to bypass this interlock
                    will be logged and reported to the security audit trail.
                  </p>
                </div>
              ) : (
                <div className="max-w-md space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="current-pw">Current Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="current-pw"
                        type="password"
                        placeholder="Enter current password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="new-pw">New Password</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="new-pw"
                        type="password"
                        placeholder="Minimum 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="confirm-pw">Confirm New Password</Label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        id="confirm-pw"
                        type="password"
                        placeholder="Confirm new password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Button
                    className="bg-[#2563eb] hover:bg-[#1d4ed8] w-full"
                    onClick={handleSelfPasswordChange}
                    disabled={changingPassword || !currentPassword || !newPassword || !confirmNewPassword}
                  >
                    {changingPassword ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Change Password
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Role Access Summary */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-[#2563eb]" />
                Role Access Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {(["admin", "manager", "sr", "dealer", "vat_auditor"] as UserRole[]).map((role) => (
                  <div
                    key={role}
                    className={`p-3 rounded-lg border text-center transition-colors ${
                      user.role === role
                        ? "border-[#2563eb] bg-blue-50 dark:bg-blue-900/20"
                        : "border-border bg-muted/30"
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-full ${ROLE_COLORS[role]} mx-auto flex items-center justify-center text-white text-xs font-bold mb-2`}
                    >
                      {role.charAt(0).toUpperCase()}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">{role === 'vat_auditor' ? 'vat' : role}</p>
                    {user.role === role && (
                      <Badge className="mt-1 bg-[#2563eb] text-white text-[9px] px-1.5 py-0">
                        Current
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════
            TAB B: COMPANY INFO (ADMIN-ONLY EDITING)
            ════════════════════════════════════════════════════ */}
        <TabsContent value="company" className="space-y-6">
          {companyInfo ? (
            <>
              {/* Read-Only Banner for Non-Admin Users */}
              {user?.role !== "admin" && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
                  <Shield className="h-4 w-4 text-amber-600" />
                  <span className="text-sm text-amber-700 dark:text-amber-400 font-medium">
                    READ-ONLY MODE — Company branding can only be modified by Admin users. Contact your administrator to request changes.
                  </span>
                </div>
              )}

              {/* Company Branding Card */}
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Building2 className="w-5 h-5 text-[#2563eb]" />
                        Company Branding
                        {user?.role !== "admin" && (
                          <Badge variant="outline" className="border-amber-400 text-amber-400 text-xs ml-2">Read Only</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {user?.role === "admin"
                          ? "Edit company information and branding. Changes will appear in PDF invoices."
                          : "View company information and branding. Only Admin users can make changes."}
                      </CardDescription>
                    </div>
                    {user?.role === "admin" && (
                      !isEditingCompany ? (
                        <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={() => setIsEditingCompany(true)}>
                          <Pencil className="w-4 h-4 mr-2" />
                          Edit Company Info
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            setIsEditingCompany(false);
                            setEditCompanyName(companyInfo.name || "");
                            setEditCompanyAddress(companyInfo.address || "");
                            setEditCompanyPhone(companyInfo.phone || "");
                            setEditCompanyEmail(companyInfo.email || "");
                            setEditCompanyMobile(companyInfo.mobile || "");
                            setEditCompanyWebsite(companyInfo.website || "");
                            setEditCompanyVatNumber(companyInfo.vatNumber || "");
                            setEditCompanyTradeLicense(companyInfo.tradeLicense || "");
                          }}>
                            <X className="w-4 h-4 mr-2" />
                            Cancel
                          </Button>
                          <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={handleSaveCompanyInfo} disabled={savingCompanyInfo}>
                            {savingCompanyInfo ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Save Changes
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Company Logo Section */}
                  <div className="flex flex-col sm:flex-row items-start gap-4 pb-4 border-b border-border/50">
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">Company Logo</Label>
                      <div className="flex items-center gap-3">
                        {editCompanyLogo ? (
                          <div className="relative group">
                            <img
                              src={editCompanyLogo}
                              alt="Company Logo"
                              className="w-24 h-24 rounded-lg object-contain border border-border/50 bg-white p-1 shadow-sm"
                            />
                            {user?.role === "admin" && (
                              <div
                                className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                                onClick={() => companyLogoInputRef.current?.click()}
                              >
                                <Camera className="w-6 h-6 text-white" />
                              </div>
                            )}
                          </div>
                        ) : (
                          user?.role === "admin" ? (
                            <div
                              className="w-24 h-24 rounded-lg border-2 border-dashed border-border/60 flex items-center justify-center cursor-pointer hover:border-[#2563eb] transition-colors bg-muted/20"
                              onClick={() => companyLogoInputRef.current?.click()}
                            >
                              <div className="text-center">
                                <Upload className="w-6 h-6 mx-auto text-muted-foreground/50" />
                                <span className="text-[10px] text-muted-foreground mt-1 block">Upload Logo</span>
                              </div>
                            </div>
                          ) : (
                            <div className="w-24 h-24 rounded-lg border border-border/50 bg-muted/10 flex items-center justify-center">
                              <span className="text-[10px] text-muted-foreground">No Logo</span>
                            </div>
                          )
                        )}
                        <div className="space-y-1.5">
                          {user?.role === "admin" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7"
                              onClick={() => companyLogoInputRef.current?.click()}
                              disabled={companyLogoUploading}
                            >
                              {companyLogoUploading ? (
                                <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                              ) : (
                                <Upload className="w-3 h-3 mr-1" />
                              )}
                              {editCompanyLogo ? "Replace" : "Upload"}
                            </Button>
                          )}
                          {editCompanyLogo && user?.role === "admin" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-xs h-7 text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={async () => {
                                setEditCompanyLogo(null);
                                if (companyInfo) {
                                  try {
                                    const headers = getAuthHeaders();
                                    await fetch("/api/company-branding", {
                                      method: "PUT",
                                      headers,
                                      body: JSON.stringify({ logo: null }),
                                    });
                                    setCompanyInfo(prev => prev ? { ...prev, logo: null } : prev);
                                    toast({ title: "Logo Removed", description: "Company logo has been removed." });
                                  } catch {
                                    toast({ title: "Error", description: "Failed to remove logo", variant: "destructive" });
                                  }
                                }
                              }}
                            >
                              <X className="w-3 h-3 mr-1" />
                              Remove
                            </Button>
                          )}
                          <p className="text-[10px] text-muted-foreground/60">
                            {user?.role === "admin" ? "Max 5MB • JPG, PNG, GIF, WebP" : "Contact admin to change logo"}
                          </p>
                        </div>
                        <input
                          ref={companyLogoInputRef}
                          type="file"
                          accept="image/jpeg,image/png,image/gif,image/webp"
                          className="hidden"
                          onChange={user?.role === "admin" ? handleCompanyLogoUpload : undefined}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Company Details Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Company Name */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Building2 className="w-3 h-3" /> Company Name <span className="text-red-500">*</span>
                      </Label>
                      {isEditingCompany ? (
                        <Input value={editCompanyName} onChange={(e) => setEditCompanyName(e.target.value)} placeholder="Company Name" />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{companyInfo.name || "—"}</p>
                      )}
                    </div>

                    {/* Company Email */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Mail className="w-3 h-3" /> Email
                      </Label>
                      {isEditingCompany ? (
                        <Input type="email" value={editCompanyEmail} onChange={(e) => setEditCompanyEmail(e.target.value)} placeholder="company@example.com" />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{companyInfo.email || "—"}</p>
                      )}
                    </div>

                    {/* Phone */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Phone
                      </Label>
                      {isEditingCompany ? (
                        <Input value={editCompanyPhone} onChange={(e) => setEditCompanyPhone(e.target.value)} placeholder="+880-..." />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{companyInfo.phone || "—"}</p>
                      )}
                    </div>

                    {/* Mobile */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Phone className="w-3 h-3" /> Mobile (Invoice)
                      </Label>
                      {isEditingCompany ? (
                        <Input value={editCompanyMobile} onChange={(e) => setEditCompanyMobile(e.target.value)} placeholder="+880-..." />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{companyInfo.mobile || "—"}</p>
                      )}
                    </div>

                    {/* Website */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Globe className="w-3 h-3" /> Website
                      </Label>
                      {isEditingCompany ? (
                        <Input value={editCompanyWebsite} onChange={(e) => setEditCompanyWebsite(e.target.value)} placeholder="https://example.com" />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-white">
                          {companyInfo.website ? (
                            <a href={companyInfo.website} target="_blank" rel="noopener noreferrer" className="text-[#2563eb] hover:underline">
                              {companyInfo.website}
                            </a>
                          ) : "—"}
                        </p>
                      )}
                    </div>

                    {/* VAT Number */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <Hash className="w-3 h-3" /> VAT Number
                      </Label>
                      {isEditingCompany ? (
                        <Input value={editCompanyVatNumber} onChange={(e) => setEditCompanyVatNumber(e.target.value)} placeholder="VAT-XXXXX" />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{companyInfo.vatNumber || "—"}</p>
                      )}
                    </div>

                    {/* Trade License */}
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground flex items-center gap-1">
                        <FileText className="w-3 h-3" /> Trade License
                      </Label>
                      {isEditingCompany ? (
                        <Input value={editCompanyTradeLicense} onChange={(e) => setEditCompanyTradeLicense(e.target.value)} placeholder="TL-XXXXX" />
                      ) : (
                        <p className="text-sm font-medium text-slate-900 dark:text-white">{companyInfo.tradeLicense || "—"}</p>
                      )}
                    </div>
                  </div>

                  {/* Address (full width) */}
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> Address
                    </Label>
                    {isEditingCompany ? (
                      <Textarea value={editCompanyAddress} onChange={(e) => setEditCompanyAddress(e.target.value)} placeholder="Full company address" rows={2} />
                    ) : (
                      <p className="text-sm font-medium text-slate-900 dark:text-white whitespace-pre-line">{companyInfo.address || "—"}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Logo in PDF Invoice Preview */}
              <Card className="border-0 shadow-md border-l-4 border-l-green-500">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="w-5 h-5 text-green-500" />
                    Invoice Logo Preview
                  </CardTitle>
                  <CardDescription>
                    How your company logo will appear on PDF invoices
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4 p-4 rounded-lg bg-white dark:bg-slate-900 border border-border/50">
                    {editCompanyLogo ? (
                      <img
                        src={editCompanyLogo}
                        alt="Company Logo Preview"
                        className="h-12 object-contain"
                      />
                    ) : (
                      <div className="h-12 w-20 rounded border border-dashed border-border flex items-center justify-center text-xs text-muted-foreground">
                        No Logo
                      </div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">{companyInfo.name}</p>
                      <p className="text-xs text-muted-foreground">{companyInfo.address || companyInfo.phone || "—"}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          ) : (
            <Card className="border-0 shadow-md">
              <CardContent className="p-8 text-center">
                <Building2 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                <h3 className="text-base font-semibold">No Company Associated</h3>
                <p className="text-sm text-muted-foreground mt-2">Your account is not linked to a company.</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Contact your administrator to link your account to a company.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ════════════════════════════════════════════════════
            TAB C: ENHANCED ACTION TRACKING
            ════════════════════════════════════════════════════ */}
        <TabsContent value="tracking" className="space-y-4">
          {/* Server-side Visual Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-0 shadow-md bg-gradient-to-br from-red-50 to-white dark:from-red-900/10 dark:to-[#132240]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <FileDown className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{serverSummary.pdfCount}</p>
                  <p className="text-xs text-muted-foreground">Total PDF Exports</p>
                  <p className="text-[10px] text-muted-foreground/60">Server-side</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-green-50 to-white dark:from-green-900/10 dark:to-[#132240]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <FileDown className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{serverSummary.csvExportCount}</p>
                  <p className="text-xs text-muted-foreground">Total CSV Exports</p>
                  <p className="text-[10px] text-muted-foreground/60">Server-side</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/10 dark:to-[#132240]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <FileUp className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{serverSummary.csvImportCount}</p>
                  <p className="text-xs text-muted-foreground">Total CSV Imports</p>
                  <p className="text-[10px] text-muted-foreground/60">Server-side</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-amber-50 to-white dark:from-amber-900/10 dark:to-[#132240]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[100px]">{serverSummary.mostActiveModule}</p>
                  <p className="text-xs text-muted-foreground">Most Active Module</p>
                  <p className="text-[10px] text-muted-foreground/60">{serverSummary.mostActiveModuleCount} actions</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Module Distribution Bar Chart (Recharts) */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#2563eb]" />
                Action Distribution by Module
                {serverTelemetryLoading && <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />}
              </CardTitle>
              <CardDescription>
                Server-side telemetry — auto-refreshes every 15 seconds
              </CardDescription>
            </CardHeader>
            <CardContent>
              {serverSummary.chartData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={serverSummary.chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11 }}
                        angle={-30}
                        textAnchor="end"
                        height={60}
                      />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <RechartsTooltip
                        contentStyle={{ fontSize: 12, borderRadius: 8 }}
                        formatter={(value: number, _name: string, props: { payload?: { fullName?: string } }) => [
                          `${value} actions`,
                          props.payload?.fullName || _name,
                        ]}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {serverSummary.chartData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="text-center py-8">
                  <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No server-side telemetry data yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Your export/import activities across modules will appear here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Client-side Action Distribution */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#2563eb]" />
                Client-Side Action Distribution
                <Badge variant="outline" className="text-[10px] ml-2">localStorage</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {actionTracking.totalActions > 0 ? (
                <div className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm bg-red-500" />
                        PDF Export
                      </span>
                      <span className="font-medium">{actionTracking.pdfExportCount} ({Math.round((actionTracking.pdfExportCount / actionTracking.totalActions) * 100)}%)</span>
                    </div>
                    <Progress value={(actionTracking.pdfExportCount / actionTracking.totalActions) * 100} className="h-2" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm bg-green-500" />
                        CSV Export
                      </span>
                      <span className="font-medium">{actionTracking.csvExportCount} ({Math.round((actionTracking.csvExportCount / actionTracking.totalActions) * 100)}%)</span>
                    </div>
                    <Progress value={(actionTracking.csvExportCount / actionTracking.totalActions) * 100} className="h-2" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-sm bg-blue-500" />
                        CSV Import
                      </span>
                      <span className="font-medium">{actionTracking.csvImportCount} ({Math.round((actionTracking.csvImportCount / actionTracking.totalActions) * 100)}%)</span>
                    </div>
                    <Progress value={(actionTracking.csvImportCount / actionTracking.totalActions) * 100} className="h-2" />
                  </div>
                </div>
              ) : (
                <div className="text-center py-6">
                  <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No client-side actions tracked yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Actions (Client-side) */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#2563eb]" />
                Recent Client Actions
              </CardTitle>
              <CardDescription>
                Last {Math.min(actionTracking.recentActions.length, 20)} actions from this browser session
              </CardDescription>
            </CardHeader>
            <CardContent>
              {actionTracking.recentActions.length === 0 ? (
                <div className="text-center py-6">
                  <Activity className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No recent actions</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {actionTracking.recentActions.slice(0, 20).map((entry, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
                    >
                      {entry.actionType === "PDF_EXPORT" && <FileDown className="w-4 h-4 text-red-500 shrink-0" />}
                      {entry.actionType === "CSV_EXPORT" && <FileDown className="w-4 h-4 text-green-500 shrink-0" />}
                      {entry.actionType === "CSV_IMPORT" && <FileUp className="w-4 h-4 text-blue-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{entry.module}</p>
                        <p className="text-xs text-muted-foreground truncate">{entry.filename || "—"}</p>
                      </div>
                      <Badge
                        className={`${entry.actionType === "PDF_EXPORT" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : entry.actionType === "CSV_EXPORT" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"} text-[10px] px-2 py-0.5 border-0 shrink-0`}
                      >
                        {entry.actionType === "PDF_EXPORT" ? "PDF" : entry.actionType === "CSV_EXPORT" ? "CSV Export" : "CSV Import"}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                        {formatTimestamp(entry.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════
            TAB C: ENHANCED ACTIVITY LEDGER
            ════════════════════════════════════════════════════ */}
        <TabsContent value="activity" className="space-y-4">
          {/* Live Indicator + Filter Bar */}
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
                {/* Live Badge */}
                <div className="flex items-center gap-2 shrink-0">
                  <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800 text-xs px-2.5 py-0.5 border">
                    <Zap className="w-3 h-3 mr-1" />
                    Live
                  </Badge>
                  <span className="text-xs text-muted-foreground">Auto-refreshes</span>
                </div>

                <div className="flex-1" />

                {/* Action Type Filter */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-medium shrink-0">Action:</Label>
                  <Select value={activityFilter} onValueChange={(val) => { setActivityFilter(val); setActivityPage(1); }}>
                    <SelectTrigger className="w-36 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ACTION_TYPE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Module Filter */}
                {availableModules.length > 0 && (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-medium shrink-0">Module:</Label>
                    <Select value={activityModuleFilter} onValueChange={(val) => { setActivityModuleFilter(val); setActivityPage(1); }}>
                      <SelectTrigger className="w-40 h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Modules</SelectItem>
                        {availableModules.map((mod) => (
                          <SelectItem key={mod} value={mod}>
                            {mod}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Date Range Filter */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs font-medium shrink-0">Range:</Label>
                  <Select value={activityDateRange} onValueChange={(val) => { setActivityDateRange(val); setActivityPage(1); }}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DATE_RANGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="text-xs text-muted-foreground">
                  {activityTotal} record{activityTotal !== 1 ? "s" : ""}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Activity Table */}
          <Card className="border-0 shadow-md">
            <CardContent className="p-0">
              {activityLoading ? (
                <div className="p-8 text-center">
                  <RefreshCw className="w-8 h-8 mx-auto text-muted-foreground/40 animate-spin mb-3" />
                  <p className="text-sm text-muted-foreground">Loading activity logs...</p>
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="p-8 text-center">
                  <Activity className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No export/import activity found</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Your PDF exports, CSV exports, and CSV imports will appear here
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">#</TableHead>
                        <TableHead>Action Type</TableHead>
                        <TableHead>Module</TableHead>
                        <TableHead>Filename</TableHead>
                        <TableHead>Record</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead className="w-[40px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activityLogs.map((log, idx) => (
                        <React.Fragment key={log.id}>
                          <TableRow className="hover:bg-muted/50 cursor-pointer" onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}>
                            <TableCell className="text-xs text-muted-foreground">
                              {(activityPage - 1) * activityPageSize + idx + 1}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getActionIcon(log.actionLabel)}
                                <Badge
                                  className={`${getActionBadgeColor(log.actionLabel)} text-[11px] px-2 py-0.5 border-0`}
                                >
                                  {log.actionLabel}
                                </Badge>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm font-medium">{log.module?.replace(/^Telemetry-/, "") || log.module}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground max-w-[150px] truncate block">
                                {log.filename || "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">
                                {log.recordLabel || "—"}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground whitespace-nowrap">
                                {formatTimestamp(log.createdAt)}
                              </span>
                            </TableCell>
                            <TableCell>
                              {expandedLogId === log.id ? (
                                <ChevronUp className="w-4 h-4 text-muted-foreground" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-muted-foreground" />
                              )}
                            </TableCell>
                          </TableRow>
                          {/* Expanded Details Row */}
                          {expandedLogId === log.id && (
                            <TableRow className="bg-muted/20">
                              <TableCell colSpan={7} className="p-4">
                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Full Details</p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Action</Label>
                                      <p className="text-xs font-medium">{log.action}</p>
                                    </div>
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Module</Label>
                                      <p className="text-xs font-medium">{log.module}</p>
                                    </div>
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Record ID</Label>
                                      <p className="text-xs font-medium font-mono">{log.recordId || "—"}</p>
                                    </div>
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Record Label</Label>
                                      <p className="text-xs font-medium">{log.recordLabel || "—"}</p>
                                    </div>
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">Filename</Label>
                                      <p className="text-xs font-medium">{log.filename || "—"}</p>
                                    </div>
                                    <div>
                                      <Label className="text-[10px] text-muted-foreground">User</Label>
                                      <p className="text-xs font-medium">{log.userName || "—"}</p>
                                    </div>
                                  </div>
                                  {log.details && Object.keys(log.details).length > 0 && (
                                    <div className="mt-3">
                                      <Label className="text-[10px] text-muted-foreground">JSON Details</Label>
                                      <pre className="text-[10px] bg-muted/50 p-3 rounded-lg mt-1 overflow-x-auto max-h-40 overflow-y-auto">
                                        {JSON.stringify(log.details, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t">
                  <p className="text-xs text-muted-foreground">
                    Page {activityPage} of {totalPages}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActivityPage(Math.max(1, activityPage - 1))}
                      disabled={activityPage <= 1 || activityLoading}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setActivityPage(Math.min(totalPages, activityPage + 1))}
                      disabled={activityPage >= totalPages || activityLoading}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ════════════════════════════════════════════════════
            TAB D: ENHANCED ADMIN PASSWORD SECURITY
            ════════════════════════════════════════════════════ */}
        <TabsContent value="admin-reset" className="space-y-4">
          {/* Security Warning Banner */}
          <Card className="border-0 shadow-md bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    ⚠️ Password management is restricted to ADMIN role only
                  </h4>
                  <p className="text-xs text-amber-700/80 dark:text-amber-400/80 mt-1">
                    All password change attempts are audited and logged. Unauthorized access attempts will be reported to the security audit trail.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {user.role === ROLES.ADMIN ? (
            <>
              {/* Admin: All Users List with Reset Password */}
              <Card className="border-0 shadow-md border-l-4 border-l-[#2563eb]">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-[#2563eb]" />
                    All Users — Password Management
                  </CardTitle>
                  <CardDescription>
                    Reset passwords for any user in the system. This action is audited.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {allUsers.length === 0 ? (
                    <div className="text-center py-8">
                      <RefreshCw className="w-8 h-8 mx-auto text-muted-foreground/30 animate-spin mb-3" />
                      <p className="text-sm text-muted-foreground">Loading users...</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-[40px]">#</TableHead>
                            <TableHead>User Name</TableHead>
                            <TableHead>Email / Login ID</TableHead>
                            <TableHead className="text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {allUsers.map((u, idx) => (
                            <TableRow key={u.id} className="hover:bg-muted/50">
                              <TableCell className="text-xs text-muted-foreground">
                                {idx + 1}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <div
                                    className={`w-7 h-7 rounded-full ${
                                      ROLE_COLORS[u.role as UserRole] || "bg-gray-500"
                                    } flex items-center justify-center text-white text-[10px] font-bold shrink-0`}
                                  >
                                    {getSafeDisplayName(u.name).charAt(0).toUpperCase()}
                                  </div>
                                  <span className="text-sm font-medium">{getSafeDisplayName(u.name)}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm text-muted-foreground">{u.email}</span>
                              </TableCell>
                              {/* Role column hidden per requirement — only email shown */}
                              <TableCell className="text-right">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setResetTargetUser(u);
                                    setResetNewPassword("");
                                    setResetConfirmPassword("");
                                    setResetDialogOpen(true);
                                  }}
                                >
                                  <KeyRound className="w-3.5 h-3.5 mr-1" />
                                  Reset Password
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Recent Password Activity */}
              <Card className="border-0 shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <History className="w-5 h-5 text-[#2563eb]" />
                    Recent Password Activity
                  </CardTitle>
                  <CardDescription>
                    Last 5 password-related audit log entries
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {passwordActivity.length === 0 ? (
                    <div className="text-center py-6">
                      <History className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">No password activity found</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {passwordActivity.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center gap-3 p-3 rounded-lg bg-muted/30"
                        >
                          <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                            <KeyRound className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{log.recordLabel || log.actionLabel}</p>
                            <p className="text-xs text-muted-foreground">{log.module} — {log.userName || "System"}</p>
                          </div>
                          <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">
                            {formatTimestamp(log.createdAt)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          ) : (
            /* Non-admin: Access Denied Card */
            <Card className="border-0 shadow-md">
              <CardContent className="p-8">
                <div className="max-w-md mx-auto text-center">
                  <div className="w-20 h-20 mx-auto rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
                    <ShieldAlert className="w-10 h-10 text-red-500" />
                  </div>
                  <h3 className="text-xl font-bold text-red-600 dark:text-red-400">403 — Access Denied</h3>
                  <p className="text-sm text-muted-foreground mt-3">
                    You do not have permission to manage passwords.
                  </p>
                  <p className="text-xs text-muted-foreground/60 mt-2">
                    Only users with the ADMIN role can reset passwords and view password activity. 
                    All access attempts are logged.
                  </p>
                  <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400 font-mono">
                      ERROR: PRIVILEGE_ESCALATION_BLOCKED
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Password Reset Dialog */}
          <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-[#2563eb]" />
                  Reset Password
                </DialogTitle>
                <DialogDescription>
                  Set a new password for {resetTargetUser?.email || "user"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-8 h-8 rounded-full ${
                        resetTargetUser?.role
                          ? ROLE_COLORS[resetTargetUser.role as UserRole]
                          : "bg-gray-500"
                      } flex items-center justify-center text-white text-xs font-bold`}
                    >
                      {getSafeDisplayName(resetTargetUser?.name).charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{getSafeDisplayName(resetTargetUser?.name)}</p>
                      <p className="text-xs text-muted-foreground">{resetTargetUser?.email}</p>
                    </div>
                    {/* Role badge hidden per requirement */}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reset-new-password">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="reset-new-password"
                      type="password"
                      placeholder="Minimum 6 characters"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reset-confirm-password">Confirm Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      id="reset-confirm-password"
                      type="password"
                      placeholder="Confirm new password"
                      value={resetConfirmPassword}
                      onChange={(e) => setResetConfirmPassword(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setResetDialogOpen(false)}
                  disabled={resetSaving}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                  onClick={handlePasswordReset}
                  disabled={resetSaving || !resetNewPassword || !resetConfirmPassword}
                >
                  {resetSaving ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle className="w-4 h-4 mr-2" />
                  )}
                  Reset Password
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}
