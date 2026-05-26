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
  AlertTriangle, Info, X, CheckCheck, Trash2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// ────────────────────────────────────────────────────────────
// TYPES
// ────────────────────────────────────────────────────────────
type UserRole = "admin" | "manager" | "sr" | "dealer" | "vat_auditor";

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
  onToggleTheme: () => void;
  onNavigate: (page: string) => void;
  onToggleSidebar: () => void;
  onToggleMobileMenu: () => void;
  onOpenSearch: () => void;
  onChangePassword: () => void;
  onLogout: () => void;
}

// ────────────────────────────────────────────────────────────
// ROLE STYLING CONSTANTS
// ────────────────────────────────────────────────────────────
const ROLE_COLORS: Record<UserRole, string> = {
  admin: "bg-blue-500",
  manager: "bg-green-500",
  sr: "bg-yellow-500",
  dealer: "bg-purple-500",
  vat_auditor: "bg-amber-500",
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  sr: "SR",
  dealer: "Dealer",
  vat_auditor: "VAT Auditor",
};

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
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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
// API FETCH HELPER — sends x-user-email for RBAC
// ────────────────────────────────────────────────────────────
async function notifFetch(path: string, opts?: RequestInit, userEmail?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (userEmail) headers["X-User-Email"] = userEmail;
  const res = await fetch(path, { headers: { ...headers, ...(opts?.headers as Record<string, string>) }, ...opts });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Request failed");
  }
  return res.json();
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
  onToggleTheme,
  onNavigate,
  onToggleMobileMenu,
  onOpenSearch,
  onChangePassword,
  onLogout,
}: AppHeaderProps) {
  // ── Notification State ──
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [severityBreakdown, setSeverityBreakdown] = useState<{ critical: number; warning: number; info: number }>({ critical: 0, warning: 0, info: 0 });
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifLoading, setNotifLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "critical" | "warning">("all");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── User Menu State ──
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // ────────────────────────────────────────────────────────
  // NOTIFICATION DATA LOADING
  // ────────────────────────────────────────────────────────
  const loadNotifications = useCallback(async (generate = false) => {
    if (!user?.email) return;
    try {
      setNotifLoading(true);
      // Auto-generate before fetching to ensure fresh alerts
      if (generate) {
        await notifFetch("/api/notifications", {
          method: "POST",
          body: JSON.stringify({ action: "generate" }),
        }, user.email);
      }
      const res = await notifFetch(
        `/api/notifications?limit=50&isRead=false`,
        undefined,
        user.email
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
      console.error("Failed to load notifications:", err);
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

  // ── 30-second polling for live badge updates ──
  useEffect(() => {
    if (!user?.email) return;
    pollRef.current = setInterval(() => {
      loadNotifications(false); // Poll only, don't regenerate
    }, 30000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
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
      }, user.email);
      // Optimistic update
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark as read:", err);
    }
  }, [user?.email]);

  const markAllRead = useCallback(async () => {
    if (!user?.email) return;
    try {
      await notifFetch("/api/notifications", {
        method: "PUT",
        body: JSON.stringify({ action: "mark-all-read" }),
      }, user.email);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  }, [user?.email]);

  const dismissNotification = useCallback(async (id: string) => {
    if (!user?.email) return;
    try {
      await notifFetch("/api/notifications", {
        method: "PUT",
        body: JSON.stringify({ id, action: "dismiss" }),
      }, user.email);
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => {
        const dismissed = notifications.find(n => n.id === id);
        return dismissed && !dismissed.isRead ? Math.max(0, prev - 1) : prev;
      });
    } catch (err) {
      console.error("Failed to dismiss notification:", err);
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
    return msg.replace(/৳[\d,]+\.?\d*/g, "N/A (Audit Mode)");
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
      className={`fixed top-0 right-0 z-30 h-14 bg-white dark:bg-[#132240] border-b border-border shadow-sm transition-all duration-300 ${
        sidebarCollapsed ? "left-16" : "left-64"
      }`}
    >
      <div className="h-full flex items-center justify-between px-4">
        {/* ── LEFT SIDE: Mobile menu + Breadcrumb ── */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={onToggleMobileMenu}
          >
            <Menu className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate("dashboard")}
            >
              <Home className="w-4 h-4" />
            </Button>
            {currentGroupLabel && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span>{currentGroupLabel}</span>
              </>
            )}
            {currentPage === "change-password" && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="text-foreground font-medium">Change Password</span>
              </>
            )}
            {currentPageLabel && currentPage !== "change-password" && (
              <>
                <ChevronRight className="w-3 h-3" />
                <span className="text-foreground font-medium">{currentPageLabel}</span>
              </>
            )}
          </div>
        </div>

        {/* ── RIGHT SIDE: Search + Theme + Notifications + User ── */}
        <div className="flex items-center gap-2">
          {/* Search Button */}
          <Button
            variant="outline"
            size="sm"
            className="hidden md:flex items-center gap-2 text-muted-foreground h-8 px-3"
            onClick={onOpenSearch}
          >
            <Search className="w-3.5 h-3.5" />
            <span className="text-xs">Search...</span>
            <kbd className="ml-1 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              <span className="text-xs">⌘</span>K
            </kbd>
          </Button>

          {/* Day/Night Toggle */}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
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
                className="relative text-muted-foreground"
              >
                <Bell className={`w-4 h-4 ${unreadCount > 0 ? "animate-[swing_0.5s_ease-in-out]" : ""}`} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-[10px] text-white flex items-center justify-center font-bold px-1 leading-none shadow-sm shadow-red-500/30">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-96 p-0" align="end">
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
              className="flex items-center gap-2"
              onClick={() => setUserMenuOpen(!userMenuOpen)}
            >
              <div
                className={`w-7 h-7 rounded-full ${
                  user?.role ? ROLE_COLORS[user.role] : "bg-[#2563eb]"
                } flex items-center justify-center text-white text-xs font-bold`}
              >
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <span className="hidden md:inline text-sm">
                {user?.displayName || user?.name || "User"}
              </span>
              {user?.role && (
                <Badge
                  className={`${ROLE_COLORS[user.role]} text-white text-[10px] px-1.5 py-0 ml-1`}
                >
                  {ROLE_LABELS[user.role]}
                </Badge>
              )}
              {isVatAuditor && (
                <Badge className="bg-amber-500 text-white text-[10px] px-1.5 py-0 ml-0.5">
                  🔒 VAT AUDIT
                </Badge>
              )}
              <ChevronDown className="w-3 h-3" />
            </Button>
            {userMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-52 bg-white dark:bg-[#132240] border border-border rounded-lg shadow-lg py-1 z-50">
                <div className="px-4 py-2 border-b">
                  <p className="text-sm font-medium">
                    {user?.displayName || user?.name || "User"}
                  </p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
                <button
                  onClick={() => setUserMenuOpen(false)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
                >
                  <User className="w-4 h-4" />
                  Profile
                </button>
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
                <Separator />
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-muted"
                >
                  <KeyRound className="w-4 h-4" />
                  Switch Role
                </button>
                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    onLogout();
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <LogOut className="w-4 h-4" />
                  Log off
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
