"use client";
// ============================================================
// STANDALONE LOGIN PAGE — SSR-SAFE
//
// This component is server-rendered so that anonymous visitors
// see the login form INSTANTLY in the initial HTML response,
// without waiting for the heavy ERP JavaScript bundle (~650KB)
// to download and execute.
//
// Only after a successful login does page.tsx dynamically import
// and mount the full ElectronicsMartApp (which is ssr:false).
// This dramatically improves perceived load time on slow
// mobile connections (e.g., 3G in Bangladesh).
// ============================================================

import React, { useState, useEffect } from "react";
import {
  Package,
  AlertTriangle,
  User,
  Lock,
  RefreshCw,
  ArrowUpCircle,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [rateLimitSeconds, setRateLimitSeconds] = useState(0);
  const [sessionExpired, setSessionExpired] = useState(false);
  const { login } = useAuth();

  // Check for session expiry — client-only to avoid hydration mismatch
  useEffect(() => {
    try {
      if (!localStorage.getItem("ems_auth")) {
        setSessionExpired(true);
      }
    } catch {
      // ignore
    }
  }, []);

  // Rate limit countdown
  useEffect(() => {
    if (rateLimitSeconds <= 0) return;
    const timer = setTimeout(
      () => setRateLimitSeconds((prev) => prev - 1),
      1000
    );
    return () => clearTimeout(timer);
  }, [rateLimitSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const success = await login(username, password);
      if (!success) {
        setError("Invalid username or password. Please check your credentials.");
      }
    } catch (err) {
      // Check for rate limit response
      if (err instanceof Error && err.message.includes("Rate limit")) {
        const match = err.message.match(/(\d+)/);
        const seconds = match ? parseInt(match[1]) : 60;
        setRateLimitSeconds(seconds);
        setError(
          `Too many failed attempts. Please wait ${seconds} seconds before trying again.`
        );
      } else {
        setError("Login failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#132240] to-[#0a1628] login-bg-pattern p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-[#2563eb] shadow-lg shadow-blue-500/25 mb-4">
            <Package className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">Electronics Mart</h1>
          <p className="text-slate-400 mt-2">Inventory Management System</p>
        </div>
        <Card className="border-0 shadow-2xl bg-white/95 dark:bg-[#132240]/95 backdrop-blur-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-blue-500 via-blue-600 to-blue-400" />
          <CardHeader className="pb-4 pt-5">
            <CardTitle className="text-xl text-center text-slate-900 dark:text-white">
              Sign In
            </CardTitle>
            <CardDescription className="text-center">
              {sessionExpired
                ? "Your session has expired. Please sign in again."
                : "Enter your credentials to continue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-start gap-2 animate-in fade-in duration-200">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-700 dark:text-red-400">
                      {error}
                    </p>
                    {rateLimitSeconds > 0 && (
                      <p className="text-xs text-red-500 mt-1">
                        Retry in {rateLimitSeconds}s
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="username">User Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    placeholder="Enter username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 transition-all duration-200 focus:ring-2 focus:ring-blue-500/20"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200 h-11"
                disabled={
                  loading ||
                  !username.trim() ||
                  !password ||
                  rateLimitSeconds > 0
                }
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <ArrowUpCircle className="w-4 h-4 mr-2" />
                )}
                {loading
                  ? "Signing In..."
                  : rateLimitSeconds > 0
                    ? `Wait ${rateLimitSeconds}s`
                    : "Sign In"}
              </Button>
              <div className="flex items-center justify-center gap-4 pt-1">
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  System Online
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Shield className="w-3 h-3" />
                  Secured
                </div>
                <span className="text-xs text-slate-300">v3.0.0</span>
              </div>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-slate-500 text-xs mt-6">
          © {new Date().getFullYear()}{" "}
          <a
            href="https://www.facebook.com/nextgendigitalstudio"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 hover:text-white transition-colors underline underline-offset-2"
          >
            NextGen Digital Studio
          </a>{" "}
          — All Rights Reserved
        </p>
      </div>
    </div>
  );
}
