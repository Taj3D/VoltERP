"use client";
// ============================================================
// VILTERP — PROFILE CENTER
// Features:
// A. User Profile Card (avatar, display name, designation, role, email, company)
// B. User Performance & Action Ledger (paginated export/import activity grid)
// C. Admin-Only Password Reset Section (list all users, reset passwords)
// Theme: Deep Navy Blue (#0a1628, #132240, #2563eb)
// ============================================================

import React, { useState, useEffect, useCallback } from "react";
import {
  User, Mail, Building2, Phone, MapPin, Shield, KeyRound,
  FileDown, FileUp, FileText, RefreshCw, ChevronLeft, ChevronRight,
  Lock, CheckCircle, AlertTriangle, Activity, Eye
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
import { useToast } from "@/hooks/use-toast";

// ────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────
type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

interface ProfileUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
  companyId: string | null;
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
}

// ────────────────────────────────────────────────────────────
// CONSTANTS
// ────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-blue-500",
  manager: "bg-green-500",
  sr: "bg-yellow-500",
  dealer: "bg-purple-500",
  vat_auditor: "bg-amber-500",
};

const ROLE_BADGE_COLORS: Record<UserRole, string> = {
  admin: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  manager: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 border-green-200 dark:border-green-800",
  sr: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800",
  dealer: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  vat_auditor: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrator",
  manager: "Manager",
  sr: "Sales Representative",
  dealer: "Dealer",
  vat_auditor: "VAT Auditor",
};

const ACTION_TYPE_OPTIONS = [
  { value: "ALL", label: "All Activities" },
  { value: "PDF_EXPORT", label: "PDF Export" },
  { value: "CSV_EXPORT", label: "CSV Export" },
  { value: "CSV_IMPORT", label: "CSV Import" },
];

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
        if (parsed?.user?.email) {
          headers["X-User-Email"] = parsed.user.email;
        }
      }
    } catch {}
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
          id: parsed.user.email, // We use email as identifier
          name: parsed.user.name,
          email: parsed.user.email,
          role: parsed.user.role,
          displayName: parsed.user.displayName,
          companyId: null,
        };
      }
    }
  } catch {}
  return null;
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

  // Activity ledger state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize] = useState(20);
  const [activityFilter, setActivityFilter] = useState("ALL");
  const [activityLoading, setActivityLoading] = useState(false);

  // Admin password reset state
  const [allUsers, setAllUsers] = useState<UserForReset[]>([]);
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [resetTargetUser, setResetTargetUser] = useState<UserForReset | null>(null);
  const [resetNewPassword, setResetNewPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetSaving, setResetSaving] = useState(false);

  // ────────────────────────────────────────────────────────
  // INITIAL LOAD
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    const authUser = getAuthUser();
    if (authUser) {
      setUser(authUser);
      loadCompanyAndEmployee(authUser);
    }
    setLoading(false);
  }, []);

  // Load activity logs when user is set or filters change
  useEffect(() => {
    if (user) {
      loadActivityLogs();
    }
  }, [user, activityPage, activityFilter]);

  // ────────────────────────────────────────────────────────
  // LOAD COMPANY & EMPLOYEE DATA
  // ────────────────────────────────────────────────────────
  const loadCompanyAndEmployee = async (authUser: ProfileUser) => {
    try {
      const headers = getAuthHeaders();

      // Fetch companies to find tenant info
      const compRes = await fetch("/api/companies", { headers });
      if (compRes.ok) {
        const compData = await compRes.json();
        const companies = compData.data || compData;
        if (Array.isArray(companies) && companies.length > 0) {
          // Try to find user's company, or use first company
          const userCompany = authUser.companyId
            ? companies.find((c: CompanyInfo) => c.id === authUser.companyId)
            : companies[0];
          if (userCompany) {
            setCompanyInfo(userCompany);
          }
        }
      }

      // Fetch employees to find designation
      const empRes = await fetch("/api/employees", { headers });
      if (empRes.ok) {
        const empData = await empRes.json();
        const employees = empData.data || empData;
        if (Array.isArray(employees)) {
          // Try to find employee matching this user's name or email
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
        setActivityLogs(data.logs || []);
        setActivityTotal(data.total || 0);
      }
    } catch (err) {
      console.error("Failed to load activity logs:", err);
    } finally {
      setActivityLoading(false);
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
    if (user?.role === "admin") {
      loadAllUsers();
    }
  }, [user]);

  // ────────────────────────────────────────────────────────
  // ADMIN: HANDLE PASSWORD RESET
  // ────────────────────────────────────────────────────────
  const handlePasswordReset = async () => {
    if (!resetTargetUser) return;
    if (!resetNewPassword || resetNewPassword.length < 6) {
      toast({
        title: "Validation Error",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      toast({
        title: "Validation Error",
        description: "Passwords do not match.",
        variant: "destructive",
      });
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

      toast({
        title: "Success",
        description: `Password reset successfully for ${resetTargetUser.email}`,
      });
      setResetDialogOpen(false);
      setResetTargetUser(null);
      setResetNewPassword("");
      setResetConfirmPassword("");
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to reset password",
        variant: "destructive",
      });
    } finally {
      setResetSaving(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────
  const totalPages = Math.ceil(activityTotal / activityPageSize);

  const getDesignation = (): string => {
    if (employeeInfo?.designation?.name) return employeeInfo.designation.name;
    // Fallback to role label
    if (user?.role) return ROLE_LABELS[user.role];
    return "N/A";
  };

  const getInitials = (): string => {
    if (!user?.displayName && !user?.name) return "U";
    const name = user.displayName || user.name;
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
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
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
        <Button
          variant="outline"
          size="sm"
          onClick={loadActivityLogs}
          disabled={activityLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${activityLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="activity">
            Activity Ledger
            {activityTotal > 0 && (
              <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 py-0">
                {activityTotal}
              </Badge>
            )}
          </TabsTrigger>
          {user.role === "admin" && (
            <TabsTrigger value="admin-reset">
              <KeyRound className="w-3.5 h-3.5 mr-1" />
              Password Reset
            </TabsTrigger>
          )}
        </TabsList>

        {/* ════════════════════════════════════════════════════
            TAB A: USER PROFILE CARD
            ════════════════════════════════════════════════════ */}
        <TabsContent value="profile" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Profile Card */}
            <Card className="lg:col-span-1 border-0 shadow-md bg-gradient-to-br from-white to-slate-50 dark:from-[#132240] dark:to-[#0a1628]">
              <CardContent className="p-6">
                <div className="flex flex-col items-center text-center space-y-4">
                  {/* Avatar */}
                  <div
                    className={`w-20 h-20 rounded-full ${
                      user.role ? ROLE_COLORS[user.role] : "bg-[#2563eb]"
                    } flex items-center justify-center text-white text-2xl font-bold shadow-lg`}
                  >
                    {getInitials()}
                  </div>

                  {/* Display Name */}
                  <div>
                    <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                      {user.displayName || user.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {getDesignation()}
                    </p>
                  </div>

                  {/* Role Badge */}
                  <Badge
                    className={`${user.role ? ROLE_BADGE_COLORS[user.role] : ""} px-3 py-1 text-xs font-medium border`}
                  >
                    <Shield className="w-3 h-3 mr-1" />
                    {user.role ? ROLE_LABELS[user.role] : "User"}
                  </Badge>

                  <Separator />

                  {/* Email (shown only in Profile Center) */}
                  <div className="w-full space-y-3 text-left">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground truncate">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <User className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground">Username: {user.name}</span>
                    </div>
                    {employeeInfo && (
                      <div className="flex items-center gap-2 text-sm">
                        <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Employee Code: {(employeeInfo as Record<string, unknown>).employeeCode || "—"}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Company & Tenant Info */}
            <Card className="lg:col-span-2 border-0 shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-[#2563eb]" />
                  Tenant Company Information
                </CardTitle>
                <CardDescription>
                  Company details associated with your account
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {companyInfo ? (
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
                      {ROLE_LABELS[role].charAt(0)}
                    </div>
                    <p className="text-xs font-medium">{ROLE_LABELS[role]}</p>
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
            TAB B: USER PERFORMANCE & ACTION LEDGER
            ════════════════════════════════════════════════════ */}
        <TabsContent value="activity" className="space-y-4">
          {/* Filter Bar */}
          <Card className="border-0 shadow-md">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <Label className="text-sm font-medium shrink-0">Filter by Action:</Label>
                <Select value={activityFilter} onValueChange={(val) => { setActivityFilter(val); setActivityPage(1); }}>
                  <SelectTrigger className="w-full sm:w-48">
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
                <div className="text-sm text-muted-foreground ml-auto">
                  {activityTotal} total record{activityTotal !== 1 ? "s" : ""}
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
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activityLogs.map((log, idx) => (
                        <TableRow key={log.id} className="hover:bg-muted/50">
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
                            <span className="text-sm font-medium">{log.module}</span>
                          </TableCell>
                          <TableCell>
                            <span className="text-sm text-muted-foreground">
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
                        </TableRow>
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
            TAB C: ADMIN-ONLY PASSWORD RESET SECTION
            ════════════════════════════════════════════════════ */}
        {user.role === "admin" && (
          <TabsContent value="admin-reset" className="space-y-4">
            <Card className="border-0 shadow-md border-l-4 border-l-[#2563eb]">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <KeyRound className="w-5 h-5 text-[#2563eb]" />
                  Admin Password Reset
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
                          <TableHead>Email / Username</TableHead>
                          <TableHead>Role</TableHead>
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
                                  {u.name?.charAt(0).toUpperCase() || "U"}
                                </div>
                                <span className="text-sm font-medium">{u.name}</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="text-sm text-muted-foreground">{u.email}</span>
                            </TableCell>
                            <TableCell>
                              <Badge
                                className={`${
                                  ROLE_BADGE_COLORS[u.role as UserRole] || ""
                                } text-[11px] px-2 py-0.5 border`}
                              >
                                {ROLE_LABELS[u.role as UserRole] || u.role}
                              </Badge>
                            </TableCell>
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
                  {/* Target User Info */}
                  <div className="p-3 rounded-lg bg-muted/50 border">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full ${
                          resetTargetUser?.role
                            ? ROLE_COLORS[resetTargetUser.role as UserRole]
                            : "bg-gray-500"
                        } flex items-center justify-center text-white text-xs font-bold`}
                      >
                        {resetTargetUser?.name?.charAt(0).toUpperCase() || "U"}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{resetTargetUser?.name}</p>
                        <p className="text-xs text-muted-foreground">{resetTargetUser?.email}</p>
                      </div>
                      <Badge
                        className={`ml-auto ${
                          ROLE_BADGE_COLORS[resetTargetUser?.role as UserRole] || ""
                        } text-[10px] px-1.5 py-0 border`}
                      >
                        {resetTargetUser?.role ? ROLE_LABELS[resetTargetUser.role as UserRole] : ""}
                      </Badge>
                    </div>
                  </div>

                  {/* New Password */}
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

                  {/* Confirm Password */}
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
        )}
      </Tabs>
    </div>
  );
}
