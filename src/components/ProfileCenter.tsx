"use client";
// ============================================================
// VILTERP — PROFILE CENTER v2.0
// Features:
// A. User Profile Card with Avatar Upload (Base64), Editable Name, Phone, Designation
// B. User Action Tracking Matrix (PDF Export, CSV Export, CSV Import telemetry)
// C. User Performance & Action Ledger (paginated export/import activity grid)
// D. Admin-Only Password Reset Section (403 Forbidden for non-admin roles)
// Theme: Deep Navy Blue (#0a1628, #132240, #2563eb)
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  User, Mail, Building2, Phone, MapPin, Shield, KeyRound,
  FileDown, FileUp, FileText, RefreshCw, ChevronLeft, ChevronRight,
  Lock, CheckCircle, AlertTriangle, Activity, Eye, Camera,
  Pencil, Save, X, Upload, BarChart3, TrendingUp, Clock
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
  profileImage?: string | null;
  phone?: string | null;
  designation?: string | null;
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

const TRACKING_STORAGE_KEY = "ems_action_tracking";

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
          displayName: parsed.user.displayName || parsed.user.name,
          companyId: null,
          profileImage: parsed.user.profileImage || null,
          phone: parsed.user.phone || null,
          designation: parsed.user.designation || null,
        };
      }
    }
  } catch {}
  return null;
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
  } catch {}
  return { pdfExportCount: 0, csvExportCount: 0, csvImportCount: 0, totalActions: 0, recentActions: [] };
}

function saveActionTracking(tracking: ActionTrackingSummary): void {
  if (typeof window === "undefined") return;
  try {
    // Keep only last 50 recent actions
    tracking.recentActions = tracking.recentActions.slice(0, 50);
    localStorage.setItem(TRACKING_STORAGE_KEY, JSON.stringify(tracking));
  } catch {}
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
  const [editProfileImage, setEditProfileImage] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Action tracking state
  const [actionTracking, setActionTracking] = useState<ActionTrackingSummary>({
    pdfExportCount: 0, csvExportCount: 0, csvImportCount: 0, totalActions: 0, recentActions: []
  });

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

  // Password change (admin self) state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);

  // ────────────────────────────────────────────────────────
  // INITIAL LOAD
  // ────────────────────────────────────────────────────────
  useEffect(() => {
    const authUser = getAuthUser();
    if (authUser) {
      setUser(authUser);
      setEditName(authUser.displayName || authUser.name);
      setEditPhone(authUser.phone || "");
      setEditDesignation(authUser.designation || "");
      setEditProfileImage(authUser.profileImage || null);
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
  }, [user, activityPage, activityFilter]);

  // Refresh action tracking periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setActionTracking(getActionTracking());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // ────────────────────────────────────────────────────────
  // LOAD PROFILE FROM SERVER
  // ────────────────────────────────────────────────────────
  const loadProfileFromServer = async () => {
    try {
      const headers = getAuthHeaders();
      const res = await fetch("/api/auth/profile", { headers });
      if (res.ok) {
        const serverProfile = await res.json();
        // Update local auth state with server data
        const updatedUser: ProfileUser = {
          id: serverProfile.id,
          name: serverProfile.name,
          email: serverProfile.email,
          role: serverProfile.role,
          displayName: serverProfile.name,
          companyId: serverProfile.companyId,
          profileImage: serverProfile.profileImage,
          phone: serverProfile.phone,
          designation: serverProfile.designation,
        };
        setUser(updatedUser);
        setEditName(updatedUser.displayName || updatedUser.name);
        setEditPhone(updatedUser.phone || "");
        setEditDesignation(updatedUser.designation || "");
        setEditProfileImage(updatedUser.profileImage || null);

        // Also update localStorage auth state
        try {
          const stored = localStorage.getItem("ems_auth");
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed?.user) {
              parsed.user.name = serverProfile.name;
              parsed.user.displayName = serverProfile.name;
              parsed.user.profileImage = serverProfile.profileImage;
              parsed.user.phone = serverProfile.phone;
              parsed.user.designation = serverProfile.designation;
              localStorage.setItem("ems_auth", JSON.stringify(parsed));
            }
          }
        } catch {}
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
  // PROFILE IMAGE UPLOAD HANDLER
  // ────────────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Invalid File",
        description: "Please select an image file (PNG, JPG, GIF, WebP).",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "Profile image must be smaller than 2MB.",
        variant: "destructive",
      });
      return;
    }

    // Convert to Base64
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      setEditProfileImage(base64);
    };
    reader.onerror = () => {
      toast({
        title: "Upload Failed",
        description: "Failed to read image file. Please try again.",
        variant: "destructive",
      });
    };
    reader.readAsDataURL(file);
  };

  // ────────────────────────────────────────────────────────
  // SAVE PROFILE UPDATES
  // ────────────────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!editName.trim()) {
      toast({
        title: "Validation Error",
        description: "Name cannot be empty.",
        variant: "destructive",
      });
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
          profileImage: editProfileImage,
          phone: editPhone.trim() || null,
          designation: editDesignation.trim() || null,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to update profile" }));
        throw new Error(errData.error || "Failed to update profile");
      }

      const data = await res.json();

      // Update local state
      if (user) {
        const updatedUser: ProfileUser = {
          ...user,
          name: data.user.name,
          displayName: data.user.name,
          profileImage: data.user.profileImage,
          phone: data.user.phone,
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
            parsed.user.name = data.user.name;
            parsed.user.displayName = data.user.name;
            parsed.user.profileImage = data.user.profileImage;
            parsed.user.phone = data.user.phone;
            parsed.user.designation = data.user.designation;
            localStorage.setItem("ems_auth", JSON.stringify(parsed));
          }
        }
      } catch {}

      setIsEditing(false);
      toast({
        title: "Profile Updated",
        description: "Your profile has been saved successfully.",
      });
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to update profile",
        variant: "destructive",
      });
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
  // ADMIN SELF PASSWORD CHANGE
  // ────────────────────────────────────────────────────────
  const handleSelfPasswordChange = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      toast({
        title: "Validation Error",
        description: "All password fields are required.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword.length < 6) {
      toast({
        title: "Validation Error",
        description: "New password must be at least 6 characters.",
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      toast({
        title: "Validation Error",
        description: "New password and confirmation do not match.",
        variant: "destructive",
      });
      return;
    }

    setChangingPassword(true);
    try {
      const headers = getAuthHeaders();
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers,
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword: confirmNewPassword,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Failed to change password" }));
        // Check for 403 Privilege Escalation Blocked
        if (res.status === 403 && errData.errorCode === "PRIVILEGE_ESCALATION_BLOCKED") {
          throw new Error("403 Forbidden: Privilege Escalation Blocked — Your role is not authorized to change passwords.");
        }
        throw new Error(errData.error || "Failed to change password");
      }

      toast({
        title: "Password Changed",
        description: "Your password has been updated successfully.",
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to change password",
        variant: "destructive",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // HELPERS
  // ────────────────────────────────────────────────────────
  const totalPages = Math.ceil(activityTotal / activityPageSize);

  const getDesignation = (): string => {
    if (user?.designation) return user.designation;
    if (employeeInfo?.designation?.name) return employeeInfo.designation.name;
    if (user?.role) return ROLE_LABELS[user.role];
    return "N/A";
  };

  const getInitials = (): string => {
    if (!user?.displayName && !user?.name) return "U";
    const name = user.displayName || user.name;
    // Safety: never show raw username initials
    if (name.startsWith("emart.")) return "U";
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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => { loadProfileFromServer(); loadActivityLogs(); setActionTracking(getActionTracking()); }}
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
                setEditName(user.displayName || user.name);
                setEditPhone(user.phone || "");
                setEditDesignation(user.designation || "");
                setEditProfileImage(user.profileImage || null);
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
        </div>
      </div>

      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="tracking">
            <BarChart3 className="w-3.5 h-3.5 mr-1" />
            Action Tracking
          </TabsTrigger>
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
            TAB A: USER PROFILE CARD (EDITABLE)
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
                    ) : user.profileImage ? (
                      <img
                        src={user.profileImage}
                        alt={user.displayName || user.name}
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

                  {/* Name (editable or display) */}
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
                        {user.displayName || user.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        {getDesignation()}
                      </p>
                    </div>
                  )}

                  {/* Role Badge */}
                  <Badge
                    className={`${user.role ? ROLE_BADGE_COLORS[user.role] : ""} px-3 py-1 text-xs font-medium border`}
                  >
                    <Shield className="w-3 h-3 mr-1" />
                    {user.role ? ROLE_LABELS[user.role] : "User"}
                  </Badge>

                  <Separator />

                  {/* Contact Details */}
                  <div className="w-full space-y-3 text-left">
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                      <span className="text-muted-foreground truncate">{user.email}</span>
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
                        <span className="text-muted-foreground">{user.designation || getDesignation()}</span>
                      </div>
                    )}

                    {employeeInfo && (
                      <div className="flex items-center gap-2 text-sm">
                        <Activity className="w-4 h-4 text-muted-foreground shrink-0" />
                        <span className="text-muted-foreground">Employee Code: {(employeeInfo as Record<string, unknown>).employeeCode || "—"}</span>
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
                {user.role === "admin"
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
                    Your role ({ROLE_LABELS[user.role]}) does not have permission to change passwords.
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
            TAB B: USER ACTION TRACKING MATRIX
            ════════════════════════════════════════════════════ */}
        <TabsContent value="tracking" className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-0 shadow-md bg-gradient-to-br from-red-50 to-white dark:from-red-900/10 dark:to-[#132240]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                  <FileDown className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{actionTracking.pdfExportCount}</p>
                  <p className="text-xs text-muted-foreground">PDF Exports</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-green-50 to-white dark:from-green-900/10 dark:to-[#132240]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <FileDown className="w-6 h-6 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{actionTracking.csvExportCount}</p>
                  <p className="text-xs text-muted-foreground">CSV Exports</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-blue-50 to-white dark:from-blue-900/10 dark:to-[#132240]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <FileUp className="w-6 h-6 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{actionTracking.csvImportCount}</p>
                  <p className="text-xs text-muted-foreground">CSV Imports</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-md bg-gradient-to-br from-purple-50 to-white dark:from-purple-900/10 dark:to-[#132240]">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-purple-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{actionTracking.totalActions}</p>
                  <p className="text-xs text-muted-foreground">Total Actions</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Action Distribution Bar */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-[#2563eb]" />
                Action Distribution
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
                <div className="text-center py-8">
                  <BarChart3 className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="text-sm text-muted-foreground">No actions tracked yet</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">
                    Your PDF exports, CSV exports, and CSV imports will be tracked here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Actions */}
          <Card className="border-0 shadow-md">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Clock className="w-5 h-5 text-[#2563eb]" />
                Recent Actions
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
            TAB C: USER PERFORMANCE & ACTION LEDGER
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
            TAB D: ADMIN-ONLY PASSWORD RESET SECTION
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
                  Reset passwords for any user in the system. This action is audited. Non-admin roles receive 403 Forbidden.
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
        )}
      </Tabs>
    </div>
  );
}
