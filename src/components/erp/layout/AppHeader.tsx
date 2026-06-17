"use client";
// ============================================================
// VILTERP — GLOBAL APPLICATION HEADER
// Features: Live Notification Bell (30s polling), RBAC badges,
// Day/Night toggle, Breadcrumb nav, Search (⌘K), User Menu
// VAT Auditor: masks monetary values in notification descriptions
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Bell, Moon, Sun, Search, Home, ChevronRight, ChevronDown,
  RefreshCw, User, Lock, LogOut, KeyRound, Menu, XCircle,
  AlertTriangle, Info, X, CheckCheck, Trash2, Clock, Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ROLES, ROLE_COLORS, ROLE_LABELS, type Role } from "@/lib/constants";
import { toLatinDigits } from "@/lib/number-format";
import { deduplicatedFetch, getCsrfToken } from "@/lib/api-client";
import { VersionBadge } from "@/components/erp/version-badge";

// ────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────
type UserRole = Role;

interface NotificationItem {
  id: string;
  code: string;
  type: string;
  severity: string;
  title: string;
  message: string;
  module?: string | null;
  referenceId?: string | null;
  referenceCode?: string | null;
  actionUrl?: string | null;
  isRead: boolean;
  isDismissed: boolean;
  createdAt: string;
}

interface AppHeaderProps {
  user: {
    name: string;
    email: string;
    role: UserRole;
    displayName: string;
  } | null;
  isVatAuditor: boolean;
  currentGroupLabel: string;
  currentPage: string;
  currentPageLabel: string;
  sidebarCollapsed: boolean;
  theme: string;
  accessToken?: string | null;
  tokenExpiry?: number | null;
  onToggleTheme: () => void;
  onNavigate: (page: string) => void;
  onToggleSidebar?: () => void;
  onToggleMobileMenu: () => void;
  onOpenSearch: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
  onProfile?: () => void;
}

// ────────────────────────────────────────────────────────────
// ROLE STYLING CONSTANTS
// ────────────────────────────────────────────────────────────
// ROLE_COLORS and ROLE_LABELS imported from @/lib/constants

// ────────────────────────────────────────────────────────────
// RELATIVE TIME FORMATTER
// ────────────────────────────────────────────────────────────
function formatRelativeTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return "just now";
    if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? "s" : ""} ago`;
    if (diffHour < 24) return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`;
    if (diffDay < 7) return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`;
    return toLatinDigits(date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }));
  } catch {
    return "—";
  }
}

// ────────────────────────────────────────────────────────────
// SEVERITY BADGE CONFIG
// ────────────────────────────────────────────────────────────
function SeverityIcon({ severity }: { severity: string }) {
  switch (severity) {
    case "Critical":
      return (
        <span className="relative flex h-3 w-3 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
        </span>
      );
    case "Warning":
      return (
        <span className="flex h-3 w-3 shrink-0 rounded-full bg-amber-500" />
      );
    case "Info":
    default:
      return (
        <span className="flex h-3 w-3 shrink-0 rounded-full bg-blue-500" />
      );
  }
}

function TypeIcon({ type }: { type: string }) {
  switch (type) {
    case "LowStock":
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    case "OverdueInstallment":
      return <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />;
    case "DataIntegrity":
      return <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />;
    case "PeriodClose":
      return <Info className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    case "BalanceMismatch":
      return <XCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />;
    case "CreditLimitExceeded":
      return <AlertTriangle className="w-3.5 h-3.5 text-orange-500 shrink-0" />;
    case "TransferDelay":
      return <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
    case "System":
    default:
      return <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />;
  }
}

// ────────────────────────────────────────────────────────────
// API FETCH HELPER — sends JWT Bearer token + CSRF for writes
// Uses deduplicatedFetch for GET requests so that 26 simultaneous
// notification pollers share ONE network request (single-flight).
// ────────────────────────────────────────────────────────────
async function notifFetch(path: string, opts?: RequestInit, _userEmail?: string, accessToken?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }
  const method = (opts?.method || "GET").toUpperCase();

  // ── CSRF Token for Write Operations ──
  // POST/PUT/DELETE require an X-CSRF-Token header (strict mode).
  // Without this, the server returns 403 and the request fails silently.
  if ((method === "POST" || method === "PUT" || method === "DELETE") && accessToken) {
    const csrfToken = await getCsrfToken();
    if (csrfToken) {
      headers["X-CSRF-Token"] = csrfToken;
    }
  }

  const doFetch = async () => {
    const res = await fetch(path, { headers: { ...headers, ...(opts?.headers as Record<string, string>) }, ...opts });
    if (!res.ok) {
      // Silently handle expected auth/routing errors (401, 403, 404) during polling
      // These are normal when session expires or endpoint is unavailable
      if (res.status === 401 || res.status === 403 || res.status === 404) {
        const silentErr: Error & { silent?: boolean } = new Error(`Silent ${res.status}`);
        silentErr.silent = true;
        throw silentErr;
      }
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || "Request failed");
    }
    return res.json();
  };

  // Deduplicate GET requests only — writes always execute fresh
  if (method === "GET") {
    return deduplicatedFetch(path, method, doFetch);
  }
  return doFetch();
}

// ============================================================
// MAIN APP HEADER COMPONENT
// ============================================================
export default function AppHeader({
  user,
  isVatAuditor,
  currentGroupLabel,
  currentPage,
  currentPageLabel,
  sidebarCollapsed,
  theme,
  accessToken,
  tokenExpiry,
  onToggleTheme,
  onNavigate,
  onToggleSidebar,
  onToggleMobileMenu,
  onOpenSearch,
  onChangePassword,
  onLogout,
  onProfile,
}: AppHeaderProps) {
  // ── Notification State ──
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [severityBreakdown, setSeverityBreakdown] = useState<{ critical: number; warning: number; info: number }>({ critical: 0, warning: 0, info: 0 });
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "critical" | "warning">("all");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // ── Access Token Ref ──
  // Keep latest accessToken in a ref so loadNotifications (memoized on
  // user?.email only) always reads the current token without re-creating
  // the callback. This prevents stale-token fetches and effect re-runs.
  const accessTokenRef = useRef<string | null | undefined>(accessToken);
  useEffect(() => {
    accessTokenRef.current = accessToken;
  }, [accessToken]);

  // ── User Menu State ──
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // ── Session Timer State ──
  const [sessionTimeLeft, setSessionTimeLeft] = useState<string | null>(null);
  const [sessionWarning, setSessionWarning] = useState(false);

  // Update session timer every minute
  useEffect(() => {
    if (!tokenExpiry) {
      setSessionTimeLeft(null);
      setSessionWarning(false);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = tokenExpiry - now;

      if (remaining <= 0) {
        setSessionTimeLeft("Expired");
        setSessionWarning(true);
        return;
      }

      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

      if (hours > 0) {
        setSessionTimeLeft(`${hours}h ${minutes}m`);
      } else if (minutes > 0) {
        setSessionTimeLeft(`${minutes}m`);
      } else {
        setSessionTimeLeft("<1m");
      }

      // Show warning when less than 30 minutes remain
      setSessionWarning(remaining < 30 * 60 * 1000);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60 * 1000); // Update every minute
    return () => clearInterval(interval);
  }, [tokenExpiry]);

  // ────────────────────────────────────────────────────────
  // NOTIFICATION DATA LOADING
  // ────────────────────────────────────────────────────────
  const loadNotifications = useCallback(async (generate = false) => {
    if (!user?.email) return;
    try {
      setNotifLoading(true);
      // Auto-generate before fetching to ensure fresh alerts.
      // This is best-effort — if it fails (e.g., CSRF, serverless instance
      // mismatch), we still fetch the existing notification list below.
      if (generate) {
        try {
          await notifFetch("/api/notifications", {
            method: "POST",
            body: JSON.stringify({ action: "generate" }),
          }, user.email ?? undefined, accessTokenRef.current);
        } catch (genErr) {
          // Suppress — generation is optional. Continue to fetch list.
          const isSilent = genErr instanceof Error && (genErr as Error & { silent?: boolean }).silent;
          if (!isSilent) {
            console.warn("Notification generate (non-blocking):", genErr instanceof Error ? genErr.message : genErr);
          }
        }
      }
      const res = await notifFetch(
        `/api/notifications?limit=50&isRead=false`,
        undefined,
        user.email ?? undefined,
        accessTokenRef.current
      );
      if (res.success) {
        setNotifications(res.data || []);
        setUnreadCount(res.count || 0);
        if (res.critical !== undefined) {
          setSeverityBreakdown({
            critical: res.critical || 0,
            warning: res.warning || 0,
            info: res.info || 0,
          });
        }
      }
    } catch (err) {
      // Only log unexpected errors; suppress expected auth/routing failures during polling
      const isSilent = err instanceof Error && (err as Error & { silent?: boolean }).silent;
      if (!isSilent) {
        console.warn("Notification fetch issue:", err instanceof Error ? err.message : err);
      }
    } finally {
      setNotifLoading(false);
    }
  }, [user?.email]);

  // ── Initial load ──
  useEffect(() => {
    if (user?.email) {
      loadNotifications(true); // Generate + fetch on first load
    }
  }, [user?.email, loadNotifications]);

  // ── Smart polling for live badge updates ──
  // Uses Page Visibility API to:
  //  - Pause polling when tab is hidden (saves battery, bandwidth, DB load)
  //  - Resume immediately when tab becomes visible again
  //  - Poll every 30s when visible, every 2min when hidden (safety net)
  useEffect(() => {
    if (!user?.email) return;

    let intervalMs = 30000; // Default: 30s when visible
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (intervalId) clearInterval(intervalId);
      intervalMs = document.hidden ? 120000 : 30000; // 2min when hidden, 30s when visible
      intervalId = setInterval(() => {
        loadNotifications(false); // Poll only, don't regenerate
      }, intervalMs);
    };

    const handleVisibilityChange = () => {
      if (!document.hidden) {
        // Tab became visible again — immediately refresh + restart fast polling
        loadNotifications(false);
        startPolling();
      } else {
        // Tab hidden — restart with slower interval
        startPolling();
      }
    };

    startPolling();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user?.email, loadNotifications]);

  // ────────────────────────────────────────────────────────
  // NOTIFICATION ACTIONS
  // ────────────────────────────────────────────────────────
  const markAsRead = useCallback(async (id: string) => {
    if (!user?.email) return;
    try {
      await notifFetch("/api/notifications", {
        method: "PUT",
        body: JSON.stringify({ id, action: "mark-read" }),
      }, user.email ?? undefined, accessTokenRef.current);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      // Silently handle expected errors during notification interactions
      const isSilent = err instanceof Error && (err as Error & { silent?: boolean }).silent;
      if (!isSilent) {
        console.warn("Mark as read issue:", err instanceof Error ? err.message : err);
      }
    }
  }, [user?.email]);

  const markAllRead = useCallback(async () => {
    if (!user?.email) return;
    try {
      await notifFetch("/api/notifications", {
        method: "PUT",
        body: JSON.stringify({ action: "mark-all-read" }),
      }, user.email ?? undefined, accessTokenRef.current);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      const isSilent = err instanceof Error && (err as Error & { silent?: boolean }).silent;
      if (!isSilent) {
        console.warn("Mark all read issue:", err instanceof Error ? err.message : err);
      }
    }
  }, [user?.email]);

  const dismissNotification = useCallback(async (id: string) => {
    if (!user?.email) return;
    try {
      await notifFetch("/api/notifications", {
        method: "PUT",
        body: JSON.stringify({ id, action: "dismiss" }),
      }, user.email ?? undefined, accessTokenRef.current);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => {
        const dismissed = notifications.find(n => n.id === id);
        return dismissed && !dismissed.isRead ? Math.max(0, prev - 1) : prev;
      });
    } catch (err) {
      const isSilent = err instanceof Error && (err as Error & { silent?: boolean }).silent;
      if (!isSilent) {
        console.warn("Dismiss notification issue:", err instanceof Error ? err.message : err);
      }
    }
  }, [user?.email, notifications]);

  // ── Navigate to notification target ──
  const handleNotifClick = useCallback((notif: NotificationItem) => {
    if (!notif.isRead) markAsRead(notif.id);
    setNotifOpen(false);
    if (notif.actionUrl) {
      // Map actionUrl paths to page keys
      const urlMap: Record<string, string> = {
        "/stock": "stock-details",
        "/hire-sales": "hire-sales",
        "/chart-of-accounts": "chart-of-accounts",
        "/balance-sheet": "balance-sheet",
        "/stock-details": "stock-details",
        "/sales-orders": "sales-orders",
        "/purchase-orders": "purchase-orders",
        "/customers": "customers",
      };
      const pageKey = urlMap[notif.actionUrl] || notif.actionUrl.replace("/", "");
      onNavigate(pageKey);
    }
  }, [markAsRead, onNavigate]);

  // ────────────────────────────────────────────────────────
  // VAT AUDITOR MASKING on notification display content
  // ────────────────────────────────────────────────────────
  const maskMessage = useCallback((msg: string): string => {
    if (!isVatAuditor) return msg;
    return msg.replace(/Tk. [\d,]+\.?\d*/g, "N/A (Audit Mode)");
  }, [isVatAuditor]);

  // ── Close user menu on outside click ──
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // ────────────────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────────────────
  return (
    <header
      className={`fixed top-0 right-0 z-30 h-12 sm:h-14 bg-white dark:bg-[#132240] border-b border-border shadow-sm transition-all duration-300 ${
        sidebarCollapsed ? "left-0 md:left-16" : "left-0 md:left-64"
      }`}
    >
      <div className="h-full flex items-center justify-between px-3 sm:px-4">
        {/* ── LEFT SIDE: Mobile menu + Breadcrumb ── */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden min-w-[44px] min-h-[44px]"
            onClick={onToggleMobileMenu}
          >
            <Menu className="w-5 h-5" />
          </Button>
          {onToggleSidebar && (
            <Button
              variant="ghost"
              size="sm"
              className="hidden md:flex min-w-[36px] min-h-[36px] h-8 w-8 p-0 text-muted-foreground"
              onClick={onToggleSidebar}
              title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              <Menu className="w-4 h-4" />
            </Button>
          )}
          <div className="flex items-center gap-1 sm:gap-2 text-sm text-muted-foreground min-w-0">
            <Button
              variant="ghost"
              size="sm"
              className="min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 shrink-0"
              onClick={() => onNavigate("dashboard")}
            >
              <Home className="w-4 h-4" />
            </Button>
            {currentGroupLabel && (
              <>
                <ChevronRight className="w-3 h-3 hidden sm:block shrink-0" />
                <span className="truncate max-w-[80px] sm:max-w-none hidden sm:inline">{currentGroupLabel}</span>
              </>
            )}
            {currentPage === "change-password" && (
              <>
                <ChevronRight className="w-3 h-3 shrink-0 hidden lg:block" />
                <span className="text-foreground font-medium truncate max-w-[120px] sm:max-w-none hidden lg:inline">Change Password</span>
              </>
            )}
            {currentPage === "profile" && (
              <>
                <ChevronRight className="w-3 h-3 shrink-0 hidden lg:block" />
                <span className="text-foreground font-medium truncate max-w-[120px] sm:max-w-none hidden lg:inline">My Profile</span>
              </>
            )}
            {currentPageLabel && currentPage !== "change-password" && currentPage !== "profile" && (
              <>
                <ChevronRight className="w-3 h-3 shrink-0 hidden lg:block" />
                <span className="text-foreground font-medium truncate max-w-[120px] sm:max-w-none hidden lg:inline">{currentPageLabel}</span>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT SIDE: Search + Theme + Notifications + User ── */}
        <div className="flex items-center gap-2">
          {/* Search Button — icon-only on mobile, full on desktop */}
          <Button
            variant="outline"
            size="sm"
            className="lg:hidden min-w-[44px] min-h-[44px] h-9 w-9 p-0 text-muted-foreground"
            onClick={onOpenSearch}
          >
            <Search className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden lg:flex items-center gap-2 text-muted-foreground h-8 px-3"
            onClick={onOpenSearch}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs">Search...</span>
            <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>

          {/* Version Badge (v3.0+) — shows current release version */}
          <div className="hidden md:block">
            <VersionBadge />
          </div>

          {/* Day/Night Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
            onClick={onToggleTheme}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>

          {/* ────────────────────────────────────────────────── */}
          {/* NOTIFICATION BELL WITH LIVE DROPDOWN                */}
          {/* ────────────────────────────────────────────────── */}
          <Popover open={notifOpen} onOpenChange={setNotifOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="relative text-muted-foreground min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
              >
                <Bell className={`w-4 h-4 ${unreadCount > 0 ? "animate-[swing_0.5s_ease-in-out]" : ""}`} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold px-1 leading-none shadow-sm shadow-red-500/30">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 p-0" align="end">
              {/* Header Bar */}
              <div className="p-3 border-b bg-muted/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold text-sm">Notifications</h4>
                    {unreadCount > 0 && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {unreadCount} new
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-6 px-2"
                      onClick={() => loadNotifications(true)}
                      disabled={notifLoading}
                    >
                      <RefreshCw className={`w-3 h-3 mr-1 ${notifLoading ? "animate-spin" : ""}`} />
                      Refresh
                    </Button>
                    {unreadCount > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs h-6 px-2 text-blue-600 hover:text-blue-700"
                        onClick={markAllRead}
                      >
                        <CheckCheck className="w-3 h-3 mr-1" />
                        Mark all read
                      </Button>
                    )}
                  </div>
                </div>
                {/* Severity Breakdown */}
                {unreadCount > 0 && (
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${activeFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"}`}
                      onClick={() => setActiveFilter("all")}
                    >
                      All ({unreadCount})
                    </button>
                    {severityBreakdown.critical > 0 && (
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${activeFilter === "critical" ? "bg-red-500 text-white" : "bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40"}`}
                        onClick={() => setActiveFilter("critical")}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                        Critical ({severityBreakdown.critical})
                      </button>
                    )}
                    {severityBreakdown.warning > 0 && (
                      <button
                        className={`text-[10px] px-2 py-0.5 rounded-full transition-colors flex items-center gap-1 ${activeFilter === "warning" ? "bg-amber-500 text-white" : "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40"}`}
                        onClick={() => setActiveFilter("warning")}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Warning ({severityBreakdown.warning})
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Notification List */}
              <ScrollArea className="max-h-[400px]">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center">
                    <Bell className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                    <p className="text-sm text-muted-foreground">No new notifications</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      System alerts will appear here
                    </p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {notifications
                      .filter(n => {
                        if (activeFilter === "critical") return n.severity === "Critical";
                        if (activeFilter === "warning") return n.severity === "Warning";
                        return true;
                      })
                      .map((notif) => (
                      <div
                        key={notif.id}
                        className={`p-3 hover:bg-muted/50 cursor-pointer transition-colors group ${
                          !notif.isRead ? "bg-blue-50/50 dark:bg-blue-900/10" : ""
                        }`}
                        onClick={() => handleNotifClick(notif)}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Severity indicator */}
                          <div className="mt-0.5 shrink-0">
                            <SeverityIcon severity={notif.severity} />
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <TypeIcon type={notif.type} />
                              <span className="text-xs font-semibold truncate">
                                {notif.title}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                              {maskMessage(notif.message)}
                            </p>
                            <div className="flex items-center gap-2 mt-1.5">
                              {notif.module && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 h-4"
                                >
                                  {notif.module}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground/70">
                                {formatRelativeTime(notif.createdAt)}
                              </span>
                              {notif.referenceCode && (
                                <span className="text-[10px] text-blue-500 font-mono">
                                  {notif.referenceCode}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action buttons (visible on hover) */}
                          <div className="flex flex-col gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!notif.isRead && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-5 w-5 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  markAsRead(notif.id);
                                }}
                                title="Mark as read"
                              >
                                <CheckCheck className="w-3 h-3 text-blue-500" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 w-5 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissNotification(notif.id);
                              }}
                              title="Dismiss"
                            >
                              <Trash2 className="w-3 h-3 text-muted-foreground hover:text-red-500" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Footer */}
              <div className="p-2 border-t bg-muted/20">
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full text-xs"
                  onClick={() => {
                    setNotifOpen(false);
                    onNavigate("notifications-integrity");
                  }}
                >
                  View All Notifications
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          {/* ── USER MENU ── */}
          <div className="relative" ref={userMenuRef}>
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center gap-2 min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <div
                className={`w-7 h-7 rounded-full ${
                  user?.role ? ROLE_COLORS[user.role] : "bg-[#2563eb]"
                } flex items-center justify-center text-white text-xs font-bold`}
              >
                {(user?.displayName || user?.name || "U")?.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium hidden sm:inline max-w-[140px] truncate">{user?.displayName || user?.name || "User"}</span>
              <ChevronDown className="w-3 h-3" />
            </Button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-[#132240] border border-border rounded-lg shadow-lg py-1 z-50">
                <div className="px-4 py-2 border-b">
                  <p className="text-sm font-medium">
                    {user?.displayName || user?.name || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground">{user?.role ? ROLE_LABELS[user.role] : ""}</p>
                  {sessionTimeLeft && (
                    <div className={`flex items-center gap-1.5 mt-1.5 text-xs ${sessionWarning ? 'text-amber-500' : 'text-muted-foreground'}`}>
                      <Clock className="w-3 h-3" />
                      <span>Session: {sessionTimeLeft}</span>
                      {sessionWarning && <Shield className="w-3 h-3 ml-1" />}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onProfile?.();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
                {user?.role === ROLES.ADMIN && (
                  <button
                    onClick={() => {
                      setUserMenuOpen(false);
                      onChangePassword();
                    }}
                    className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
                  >
                    <Lock className="w-4 h-4" />
                    Change Password
                  </button>
                )}
                <Separator />
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
