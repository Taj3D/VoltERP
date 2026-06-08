/**
 * Shared useAuth Hook for VoltERP
 *
 * Canonical useAuth with:
 * - User state from localStorage via singleton authState
 * - Login/logout functions with JWT token management
 * - Role checking (isVatAuditor, isAdmin, isManager, isSR, isDealer)
 * - hasAccess() for RBAC group-level permission checking
 * - Auto-initialization from localStorage
 * - Stale session migration & expired token detection
 *
 * All component files should import useAuth from here
 * instead of defining their own inline copies.
 */

"use client";

import { useState, useEffect } from "react";
import {
  authState,
  authListeners,
  setAuthState,
  clearAuthState,
  initAuthState,
  scheduleTokenRefresh,
  type UserRole,
  type AuthUser,
  type AuthState,
} from "@/lib/api-client";

// ============================================================
// RBAC: Role → Module Group Access Map
// ============================================================

const ROLE_ACCESS: Record<UserRole, string[]> = {
  admin: ["*"],
  manager: ["investment", "basic-modules", "staff", "customers-suppliers", "inventory", "account", "sms", "accounting-report", "financial-audit", "mis-report", "system-settings"],
  sr: ["basic-modules", "staff", "customers-suppliers", "inventory", "sms"],
  dealer: ["basic-modules", "customers-suppliers", "inventory"],
  vat_auditor: ["basic-modules", "customers-suppliers", "inventory", "accounting-report", "financial-audit", "mis-report", "system-settings"],
};

// ============================================================
// useAuth Hook
// ============================================================

export interface UseAuthReturn extends AuthState {
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  hasAccess: (groupKey: string) => boolean;
  isVatAuditor: boolean;
  isAdmin: boolean;
  isManager: boolean;
  isSR: boolean;
  isDealer: boolean;
}

function useAuth(): UseAuthReturn {
  const [, forceUpdate] = useState({});

  useEffect(() => {
    const listener = () => forceUpdate({});
    authListeners.push(listener);
    return () => {
      // Remove this listener
      const idx = authListeners.indexOf(listener);
      if (idx >= 0) authListeners.splice(idx, 1);
    };
  }, []);

  useEffect(() => {
    initAuthState();
  }, []);

  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: username, password }),
      });
      if (!res.ok) return false;
      const serverUser = await res.json();
      // Map server response to client-side auth state
      const resolvedDisplayName = serverUser.displayName || serverUser.name || username;

      // Decode access token to get expiry timestamp
      let tokenExpiry: number | null = null;
      try {
        const payload = JSON.parse(atob(serverUser.accessToken.split(".")[1]));
        tokenExpiry = payload.exp * 1000;
      } catch {}

      setAuthState({
        isAuthenticated: true,
        user: {
          name: resolvedDisplayName,
          email: serverUser.email || username,
          role: (serverUser.role as UserRole) || "admin",
          displayName: resolvedDisplayName,
        },
        accessToken: serverUser.accessToken || null,
        refreshToken: serverUser.refreshToken || null,
        tokenExpiry,
      });

      // Schedule proactive token refresh
      scheduleTokenRefresh();

      return true;
    } catch {
      // Network error — return false so the login form shows its error message
      return false;
    }
  };

  const logout = () => {
    // Revoke the JWT token on the server (fire-and-forget)
    if (authState.accessToken) {
      fetch("/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authState.accessToken}`,
        },
        body: JSON.stringify({ refreshToken: authState.refreshToken }),
      }).catch(() => {}); // Non-blocking
    }
    clearAuthState();
  };

  const hasAccess = (groupKey: string): boolean => {
    if (!authState.user) return false;
    const access = ROLE_ACCESS[authState.user.role];
    if (!access) return false;
    return access.includes("*") || access.includes(groupKey);
  };

  const isVatAuditor = authState.user?.role === "vat_auditor";
  const isAdmin = authState.user?.role === "admin";
  const isManager = authState.user?.role === "manager";
  const isSR = authState.user?.role === "sr";
  const isDealer = authState.user?.role === "dealer";

  return {
    ...authState,
    login,
    logout,
    hasAccess,
    isVatAuditor,
    isAdmin,
    isManager,
    isSR,
    isDealer,
  };
}

export { useAuth, ROLE_ACCESS };
export type { UserRole, AuthUser, AuthState };
