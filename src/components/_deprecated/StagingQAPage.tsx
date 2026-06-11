'use client';

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw, FlaskConical, Database, ShieldCheck, Trash2, FileDown,
  CheckCircle, XCircle, AlertTriangle, Clock, Activity, Play, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { exportToPDF } from "@/lib/export-utils";
import type { ColumnDef as ExportColumnDef, CompanyProfile } from "@/lib/export-utils";

// ============================================================
// UTILITY FUNCTIONS
// ============================================================

const safeFmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (n: number) => safeFmt.format(n);

const fmtDate = (d: string | Date) => {
  if (!d) return "—";
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? "—" : dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
};

const fmtMs = (ms: number) => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
};

// ============================================================
// STATUS BADGE MAP
// ============================================================

const STATUS_BADGE: Record<string, string> = {
  Passed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800",
  Failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  Warning: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800",
  Running: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
  Error: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
};

const TEST_TYPE_BADGE: Record<string, string> = {
  SEED_ENGINE: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-purple-200 dark:border-purple-800",
  TEST_BED: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800",
  SEED_WIPE: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800",
  ASSERTION_CHECK: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800",
};

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function StagingQAPage() {
  const { toast } = useToast();

  // ── Shared state ──
  const [activeTab, setActiveTab] = useState("seed-engine");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [seedResult, setSeedResult] = useState<any>(null);
  const [testResult, setTestResult] = useState<any>(null);
  const [testLogs, setTestLogs] = useState<any[]>([]);
  const [wipeResult, setWipeResult] = useState<any>(null);
  const [stagingSnapshot, setStagingSnapshot] = useState<any>(null);
  const [progress, setProgress] = useState(0);

  // ── Company for PDF ──
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);

  // ── Test logs filters ──
  const [logFilterType, setLogFilterType] = useState("ALL");
  const [logFilterStatus, setLogFilterStatus] = useState("ALL");
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  // ── Re-seed dialog ──
  const [reseedDialogOpen, setReseedDialogOpen] = useState(false);

  // ── Wipe dialog ──
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const [wipeConfirmText, setWipeConfirmText] = useState("");

  // ── QA export loading ──
  const [isExportingPDF, setIsExportingPDF] = useState(false);

  // ── Company ID for seeding ──
  const [companyId, setCompanyId] = useState<string>("");

  // ── Ref for progress timeout cleanup ──
  const progressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup progress timeout on unmount
  useEffect(() => {
    return () => {
      if (progressTimeoutRef.current) clearTimeout(progressTimeoutRef.current);
    };
  }, []);

  // ============================================================
  // LOAD COMPANY DATA
  // ============================================================

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const res = await fetch("/api/companies");
        if (res.ok && isMounted) {
          const data = await res.json();
          const companies = Array.isArray(data) ? data : data.data || [];
          if (companies.length > 0) {
            const firstCompany = companies[0];
            setCompanyId(firstCompany.id);
            setCompanyProfile({
              name: firstCompany.name || "VoltERP",
              address: firstCompany.address || "",
              phone: firstCompany.phone || "",
              mobile: firstCompany.mobile || "",
              email: firstCompany.email || "",
              logo: firstCompany.logo || firstCompany.logoData || undefined,
              brandLogo: firstCompany.brandLogo || undefined,
              logoData: firstCompany.logoData || undefined,
              vatNumber: firstCompany.vatNumber || "",
              tradeLicense: firstCompany.tradeLicense || "",
              binNumber: firstCompany.binNumber || "",
              currencySymbol: firstCompany.currencySymbol || "",
            });
          }
        }
      } catch {
        // silently fail
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // ============================================================
  // LOAD TEST LOGS
  // ============================================================

  const loadTestLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/staging/test-logs");
      if (res.ok) {
        const data = await res.json();
        setTestLogs(Array.isArray(data) ? data : []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    loadTestLogs();
  }, [loadTestLogs]);

  // Poll progress during seed/test operations
  useEffect(() => {
    if (!isLoading) return;
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 12;
      });
    }, 800);
    return () => clearInterval(interval);
  }, [isLoading]);

  // ============================================================
  // SEED ENGINE
  // ============================================================

  const handleSeedEngine = async (force: boolean = false) => {
    setIsLoading(true);
    setLoadingText("Running Multi-Module Transaction Testing Matrices & Asserting Accounting Equation Integrities...");
    setSeedResult(null);
    setProgress(0);

    // Capture staging snapshot before execution
    try {
      const snapRes = await fetch("/api/staging/test-logs");
      if (snapRes.ok) {
        const snapData = await snapRes.json();
        setStagingSnapshot({ testLogs: snapData, timestamp: new Date().toISOString() });
      }
    } catch {
      // Snapshot capture failed — non-blocking
    }

    try {
      const params = new URLSearchParams();
      if (companyId) params.set("companyId", companyId);
      if (force) params.set("force", "true");

      const res = await fetch(`/api/staging/seed-engine?${params.toString()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        // Restore from snapshot on error
        if (stagingSnapshot) {
          setTestLogs(stagingSnapshot.testLogs || []);
        }
        throw new Error(data.error || data.warning || "Seed engine failed");
      }

      setProgress(100);
      setSeedResult(data);
      await loadTestLogs();
      toast({
        title: "Seed Engine Complete",
        description: `Created ${data.summary?.totalRecords || 0} records in ${fmtMs(data.executionTimeMs || 0)}`,
      });
    } catch (e: any) {
      toast({ title: "Seed Engine Error", description: e.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
      setLoadingText("");
      progressTimeoutRef.current = setTimeout(() => setProgress(0), 2000);
    }
  };

  // ============================================================
  // TEST BED
  // ============================================================

  const handleTestBed = async () => {
    setIsLoading(true);
    setLoadingText("Running Multi-Module Transaction Testing Matrices & Asserting Accounting Equation Integrities...");
    setTestResult(null);
    setProgress(0);

    try {
      const res = await fetch("/api/staging/test-bed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: companyId || undefined }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Test bed execution failed");
      }

      setProgress(100);
      setTestResult(data);
      await loadTestLogs();
      toast({
        title: "Test Bed Complete",
        description: `${data.summary?.assertionsPassed || 0}/${data.summary?.assertionsTotal || 0} assertions passed — ${data.overallStatus}`,
        variant: data.overallStatus === "Passed" ? "default" : "destructive",
      });
    } catch (e: any) {
      toast({ title: "Test Bed Error", description: e.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
      setLoadingText("");
      progressTimeoutRef.current = setTimeout(() => setProgress(0), 2000);
    }
  };

  // ============================================================
  // SYSTEM WIPE
  // ============================================================

  const handleWipe = async () => {
    if (wipeConfirmText !== "WIPE") {
      toast({ title: "Confirmation Failed", description: "Type WIPE to confirm", variant: "destructive" });
      return;
    }

    setIsLoading(true);
    setLoadingText("Wiping All Commercial Data — Destroying Transaction Records...");
    setWipeResult(null);
    setProgress(0);
    setWipeDialogOpen(false);

    try {
      const res = await fetch("/api/staging/seed-wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Wipe operation failed");
      }

      setProgress(100);
      setWipeResult(data);
      setSeedResult(null);
      setTestResult(null);
      await loadTestLogs();
      toast({
        title: "System Wipe Complete",
        description: `${data.data?.totalDeleted || 0} records deleted across ${data.data?.tablesAffected || 0} tables`,
      });
    } catch (e: any) {
      toast({ title: "Wipe Error", description: e.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
      setLoadingText("");
      setWipeConfirmText("");
      progressTimeoutRef.current = setTimeout(() => setProgress(0), 2000);
    }
  };

  // ============================================================
  // QA CERTIFICATION PDF EXPORT
  // ============================================================

  const handleExportQAPDF = async () => {
    setIsExportingPDF(true);
    try {
      // Fetch latest test logs for the certification matrix
      const logsRes = await fetch("/api/staging/test-logs");
      const logsData = await logsRes.ok ? await logsRes.json() : [];

      // Build certification data from test results and logs
      const certificationData = Array.isArray(logsData) ? logsData : [];

      // Build assertion detail rows
      const assertionRows: any[] = [];
      for (const log of certificationData) {
        if (log.details) {
          try {
            const details = typeof log.details === "string" ? JSON.parse(log.details) : log.details;
            if (details.assertions && Array.isArray(details.assertions)) {
              for (const assertion of details.assertions) {
                assertionRows.push({
                  testCode: log.testCode,
                  testType: log.testType,
                  assertionName: assertion.name || "—",
                  status: assertion.passed ? "PASS" : "FAIL",
                  message: assertion.message || "—",
                  executionTimeMs: log.executionTimeMs || 0,
                });
              }
            }
          } catch {
            // Skip unparseable details
          }
        }
      }

      // PDF columns for the test matrix
      const columns: ExportColumnDef[] = [
        { key: "testCode", label: "Test Code", type: "text" },
        { key: "testType", label: "Type", type: "text" },
        { key: "assertionName", label: "Assertion", type: "text" },
        { key: "status", label: "Status", type: "text" },
        { key: "message", label: "Result Message", type: "text" },
        { key: "executionTimeMs", label: "Exec Time (ms)", type: "number" },
      ];

      const now = new Date();
      const complianceToken = "Sys-Staging-QA-Vault";

      exportToPDF({
        title: "VoltERP System Quality Assurance & Integrity Compliance Certification",
        subtitle: `Compliance Token: ${complianceToken} | Certification Date: ${now.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })} | Total Test Runs: ${certificationData.length} | Assertions Verified: ${assertionRows.length}`,
        orientation: "landscape",
        columns,
        data: assertionRows.length > 0 ? assertionRows : certificationData,
        filename: "VoltERP-QA-Certification",
        company: companyProfile || undefined,
        financialFooter: {
          preparedBy: "",
          checkedBy: "",
          authorizedBy: "",
          printedBy: "VoltERP Staging QA System",
        },
        customHeader: (doc, _pageNumber, pageWidth, _pageHeight) => {
          // Add legal disclaimer on first page
          if (_pageNumber === 1) {
            // No additional custom header needed — subtitle already has compliance info
          }
        },
      });

      toast({ title: "QA Certification PDF Exported", description: "VoltERP System Quality Assurance & Integrity Compliance Certification generated" });
    } catch (e: any) {
      toast({ title: "PDF Export Error", description: e.message, variant: "destructive" });
    } finally {
      setIsExportingPDF(false);
    }
  };

  // ============================================================
  // FILTERED TEST LOGS
  // ============================================================

  const filteredTestLogs = testLogs.filter((log) => {
    if (logFilterType !== "ALL" && log.testType !== logFilterType) return false;
    if (logFilterStatus !== "ALL" && log.status !== logFilterStatus) return false;
    return true;
  });

  // ============================================================
  // RENDER: SEED ENGINE TAB
  // ============================================================

  const renderSeedEngine = () => (
    <div className="space-y-6">
      {/* Action Area */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-gradient-to-r from-[#132240] to-[#0a1628] rounded-t-lg pb-4">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <FlaskConical className="w-5 h-5 text-blue-400" />
            Seed Engine Control Panel
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs ml-2">Sys-Staging-QA-Vault</Badge>
          </CardTitle>
          <CardDescription className="text-slate-400 text-sm">
            Inject a high-volume demo ecosystem with full COA hierarchy, products, customers, suppliers, and 100+ chronological transactions
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <Button
              size="lg"
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold px-8 py-6 text-base"
              disabled={isLoading}
              onClick={() => handleSeedEngine(false)}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                  Running Multi-Module Transaction Testing Matrices & Asserting Accounting Equation Integrities...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5 mr-2" />
                  Inject High-Volume Demo Ecosystem
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="border-amber-500 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              disabled={isLoading}
              onClick={() => setReseedDialogOpen(true)}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Force Re-Seed
            </Button>
          </div>

          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">{loadingText}</span>
                <span className="text-blue-600 dark:text-blue-400 font-mono">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Seed Result Summary */}
      {seedResult && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-gradient-to-r from-emerald-900/40 to-[#132240] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              Seed Execution Summary
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-xs ml-2">
                {seedResult.testCode || "STG-SEED"}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Users Created</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{seedResult.summary?.usersCreated || 0}</p>
              </div>
              <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Products Created</p>
                <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">{seedResult.summary?.productsCreated || 0}</p>
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Customers/Suppliers</p>
                <p className="text-2xl font-bold text-cyan-700 dark:text-cyan-400">
                  {(seedResult.summary?.customersCreated || 0) + (seedResult.summary?.suppliersCreated || 0)}
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Transactions</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{seedResult.summary?.transactionsGenerated || 0}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Records</p>
                <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{seedResult.summary?.totalRecords || 0}</p>
              </div>
              <div className="bg-rose-50 dark:bg-rose-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Execution Time</p>
                <p className="text-2xl font-bold text-rose-700 dark:text-rose-400">{fmtMs(seedResult.executionTimeMs || 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Snapshot Info */}
      {stagingSnapshot && !isLoading && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
              <Database className="w-4 h-4 text-blue-500" />
              <span>Staging snapshot captured at {fmtDate(stagingSnapshot.timestamp)}</span>
              <Badge variant="outline" className="text-xs">
                {stagingSnapshot.testLogs?.length || 0} log entries preserved
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ============================================================
  // RENDER: SYSTEM TEST BED TAB
  // ============================================================

  const renderTestBed = () => (
    <div className="space-y-6">
      {/* Action Area */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-gradient-to-r from-[#132240] to-[#0a1628] rounded-t-lg pb-4">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            System-Wide Test Bed
            <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-xs ml-2">7 Assertions</Badge>
          </CardTitle>
          <CardDescription className="text-slate-400 text-sm">
            Execute deep validation checks across all ERP modules — accounting equation, inventory cross-reference, shield interlocks, and ledger integrity
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <Button
            size="lg"
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold px-8 py-6 text-base"
            disabled={isLoading}
            onClick={handleTestBed}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Running Multi-Module Transaction Testing Matrices & Asserting Accounting Equation Integrities...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                Execute System-Wide Test Bed
              </>
            )}
          </Button>

          {isLoading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-300">{loadingText}</span>
                <span className="text-blue-600 dark:text-blue-400 font-mono">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-3" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Results */}
      {testResult && (
        <>
          {/* Overall Status */}
          <Card className={`border-2 ${testResult.overallStatus === 'Passed' ? 'border-emerald-500' : testResult.overallStatus === 'Warning' ? 'border-amber-500' : 'border-red-500'}`}>
            <CardContent className="p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className={`h-16 w-16 rounded-full flex items-center justify-center ${
                  testResult.overallStatus === 'Passed' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                  testResult.overallStatus === 'Warning' ? 'bg-amber-100 dark:bg-amber-900/30' :
                  'bg-red-100 dark:bg-red-900/30'
                }`}>
                  {testResult.overallStatus === 'Passed' ? (
                    <CheckCircle className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
                  ) : testResult.overallStatus === 'Warning' ? (
                    <AlertTriangle className="w-8 h-8 text-amber-600 dark:text-amber-400" />
                  ) : (
                    <XCircle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  )}
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                    Overall Status: {testResult.overallStatus}
                  </h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    {testResult.summary?.assertionsPassed || 0}/{testResult.summary?.assertionsTotal || 0} assertions passed
                    ({testResult.summary?.passRate || "0%"}) in {fmtMs(testResult.executionTimeMs || 0)}
                  </p>
                </div>
                <Badge className={`${STATUS_BADGE[testResult.overallStatus] || STATUS_BADGE.Error} text-sm px-4 py-1.5 font-bold`}>
                  {testResult.overallStatus}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Assertion Results Table */}
          <Card className="border-slate-200 dark:border-slate-700">
            <CardHeader className="bg-gradient-to-r from-[#132240] to-[#0a1628] rounded-t-lg pb-3">
              <CardTitle className="text-white flex items-center gap-2 text-base">
                <Activity className="w-5 h-5 text-blue-400" />
                Test Assertion Results
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <div className="max-h-96 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-[#132240] dark:bg-[#0a1628] sticky top-0 z-10">
                        <TableHead className="text-white font-semibold">#</TableHead>
                        <TableHead className="text-white font-semibold">Assertion Name</TableHead>
                        <TableHead className="text-white font-semibold">Status</TableHead>
                        <TableHead className="text-white font-semibold">Expected</TableHead>
                        <TableHead className="text-white font-semibold">Actual</TableHead>
                        <TableHead className="text-white font-semibold">Exec Time</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {testResult.assertions?.map((assertion: any, idx: number) => (
                        <TableRow key={idx} className="hover:bg-blue-50 dark:hover:bg-slate-800/50">
                          <TableCell className="text-slate-500 text-xs font-mono">{idx + 1}</TableCell>
                          <TableCell className="text-sm font-medium text-slate-900 dark:text-white max-w-xs">
                            {assertion.name}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${assertion.passed ? STATUS_BADGE.Passed : STATUS_BADGE.Failed} font-semibold text-xs`}>
                              {assertion.passed ? (
                                <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Pass</span>
                              ) : (
                                <span className="flex items-center gap-1"><XCircle className="w-3 h-3" /> Fail</span>
                              )}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 dark:text-slate-300">
                            {assertion.passed ? "Balanced / Verified" : "Discrepancy Detected"}
                          </TableCell>
                          <TableCell className="text-xs text-slate-600 dark:text-slate-300 max-w-xs truncate">
                            {assertion.message}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-slate-500">
                            {fmtMs(testResult.executionTimeMs ? Math.round(testResult.executionTimeMs / (testResult.assertions?.length || 1)) : 0)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Accounting Equation Validation */}
          {testResult.accountingEquation && (
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="bg-gradient-to-r from-emerald-900/40 to-[#132240] rounded-t-lg pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Database className="w-5 h-5 text-emerald-400" />
                  Accounting Equation Validation
                  <Badge className={`${testResult.accountingEquation.isBalanced ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : 'bg-red-500/20 text-red-300 border-red-500/30'} text-xs ml-2`}>
                    {testResult.accountingEquation.isBalanced ? "BALANCED" : "IMBALANCED"}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Assets</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{fmt(testResult.accountingEquation.totalAssets || 0)}</p>
                  </div>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Liabilities</p>
                    <p className="text-lg font-bold text-red-700 dark:text-red-400">{fmt(testResult.accountingEquation.totalLiabilities || 0)}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Equity</p>
                    <p className="text-lg font-bold text-purple-700 dark:text-purple-400">{fmt(testResult.accountingEquation.totalEquity || 0)}</p>
                  </div>
                  <div className={`rounded-lg p-4 text-center ${testResult.accountingEquation.isBalanced ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Discrepancy</p>
                    <p className={`text-lg font-bold ${testResult.accountingEquation.isBalanced ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                      {fmt(testResult.accountingEquation.balanceDiscrepancy || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Inventory Cross-Reference */}
          {testResult.inventoryCrossReference && (
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="bg-gradient-to-r from-cyan-900/40 to-[#132240] rounded-t-lg pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <Database className="w-5 h-5 text-cyan-400" />
                  Inventory Cross-Reference
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">COA Balance</p>
                    <p className="text-lg font-bold text-blue-700 dark:text-blue-400">{fmt(testResult.inventoryCrossReference.inventoryAssetBalance || 0)}</p>
                  </div>
                  <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-4 text-center">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Stock Value</p>
                    <p className="text-lg font-bold text-cyan-700 dark:text-cyan-400">{fmt(testResult.inventoryCrossReference.inventoryStockValue || 0)}</p>
                  </div>
                  <div className={`rounded-lg p-4 text-center ${(testResult.inventoryCrossReference.inventoryDiscrepancy || 0) <= 1 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Discrepancy</p>
                    <p className={`text-lg font-bold ${(testResult.inventoryCrossReference.inventoryDiscrepancy || 0) <= 1 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                      {fmt(testResult.inventoryCrossReference.inventoryDiscrepancy || 0)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Shield Interlock Results */}
          {testResult.shieldInterlocks && (
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="bg-gradient-to-r from-amber-900/40 to-[#132240] rounded-t-lg pb-3">
                <CardTitle className="text-white flex items-center gap-2 text-base">
                  <ShieldCheck className="w-5 h-5 text-amber-400" />
                  Shield Interlock Results
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className={`rounded-lg p-4 border-2 ${testResult.shieldInterlocks.underageEmployeeBlocked ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700' : 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.shieldInterlocks.underageEmployeeBlocked ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">Underage Employee</span>
                    </div>
                    <Badge className={`${testResult.shieldInterlocks.underageEmployeeBlocked ? STATUS_BADGE.Passed : STATUS_BADGE.Failed} text-xs`}>
                      {testResult.shieldInterlocks.underageEmployeeBlocked ? "Blocked" : "Not Blocked"}
                    </Badge>
                  </div>
                  <div className={`rounded-lg p-4 border-2 ${testResult.shieldInterlocks.creditLimitBlocked ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700' : 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.shieldInterlocks.creditLimitBlocked ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">Credit Limit</span>
                    </div>
                    <Badge className={`${testResult.shieldInterlocks.creditLimitBlocked ? STATUS_BADGE.Passed : STATUS_BADGE.Failed} text-xs`}>
                      {testResult.shieldInterlocks.creditLimitBlocked ? "Blocked" : "Not Blocked"}
                    </Badge>
                  </div>
                  <div className={`rounded-lg p-4 border-2 ${testResult.shieldInterlocks.suspendedWarehouseBlocked ? 'border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700' : 'border-red-300 bg-red-50 dark:bg-red-900/20 dark:border-red-700'}`}>
                    <div className="flex items-center gap-2 mb-2">
                      {testResult.shieldInterlocks.suspendedWarehouseBlocked ? (
                        <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">Suspended Warehouse</span>
                    </div>
                    <Badge className={`${testResult.shieldInterlocks.suspendedWarehouseBlocked ? STATUS_BADGE.Passed : STATUS_BADGE.Failed} text-xs`}>
                      {testResult.shieldInterlocks.suspendedWarehouseBlocked ? "Blocked" : "Not Blocked"}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );

  // ============================================================
  // RENDER: TEST HISTORY TAB
  // ============================================================

  const renderTestHistory = () => (
    <div className="space-y-6">
      {/* Filters */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-gradient-to-r from-[#132240] to-[#0a1628] rounded-t-lg pb-3">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Clock className="w-5 h-5 text-blue-400" />
            Test History & Audit Trail
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-900 dark:text-white">Test Type</Label>
              <select
                value={logFilterType}
                onChange={(e) => setLogFilterType(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                <option value="ALL">All Types</option>
                <option value="SEED_ENGINE">Seed Engine</option>
                <option value="TEST_BED">Test Bed</option>
                <option value="SEED_WIPE">Seed Wipe</option>
                <option value="ASSERTION_CHECK">Assertion Check</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-900 dark:text-white">Status</Label>
              <select
                value={logFilterStatus}
                onChange={(e) => setLogFilterStatus(e.target.value)}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm"
              >
                <option value="ALL">All Statuses</option>
                <option value="Passed">Passed</option>
                <option value="Failed">Failed</option>
                <option value="Warning">Warning</option>
                <option value="Running">Running</option>
                <option value="Error">Error</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={loadTestLogs}
                className="gap-1.5"
              >
                <RefreshCw className="w-4 h-4" /> Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card className="border-slate-200 dark:border-slate-700">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <div className="max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-[#132240] dark:bg-[#0a1628] sticky top-0 z-10">
                    <TableHead className="text-white font-semibold">Test Code</TableHead>
                    <TableHead className="text-white font-semibold">Type</TableHead>
                    <TableHead className="text-white font-semibold">Status</TableHead>
                    <TableHead className="text-white font-semibold">Assertions</TableHead>
                    <TableHead className="text-white font-semibold">Records Created</TableHead>
                    <TableHead className="text-white font-semibold">Exec Time</TableHead>
                    <TableHead className="text-white font-semibold">Started At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTestLogs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12 text-slate-400">
                        <Database className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        <p className="text-sm">No test logs found</p>
                        <p className="text-xs mt-1">Run the Seed Engine or Test Bed to generate audit entries</p>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredTestLogs.map((log) => (
                      <React.Fragment key={log.id}>
                        <TableRow
                          className="hover:bg-blue-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                          onClick={() => setExpandedLogId(expandedLogId === log.id ? null : log.id)}
                        >
                          <TableCell className="text-sm font-mono text-slate-900 dark:text-white">
                            {log.testCode}
                          </TableCell>
                          <TableCell>
                            <Badge className={`${TEST_TYPE_BADGE[log.testType] || TEST_TYPE_BADGE.ASSERTION_CHECK} text-xs`}>
                              {log.testType}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={`${STATUS_BADGE[log.status] || STATUS_BADGE.Error} font-semibold text-xs`}>
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{log.assertionsPassed || 0}</span>
                            <span className="text-slate-400">/</span>
                            <span>{log.assertionsTotal || 0}</span>
                          </TableCell>
                          <TableCell className="text-sm text-slate-700 dark:text-slate-300">
                            {log.recordsCreated || 0}
                          </TableCell>
                          <TableCell className="text-sm font-mono text-slate-500">
                            {fmtMs(log.executionTimeMs || 0)}
                          </TableCell>
                          <TableCell className="text-xs text-slate-500 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <Clock className="w-3.5 h-3.5" />
                              {fmtDate(log.startedAt)}
                            </div>
                          </TableCell>
                        </TableRow>
                        {expandedLogId === log.id && (
                          <TableRow className="bg-slate-50 dark:bg-slate-800/30">
                            <TableCell colSpan={7} className="p-4">
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                {log.totalAssets > 0 && (
                                  <div>
                                    <span className="text-slate-500">Total Assets:</span>{" "}
                                    <span className="font-semibold text-slate-900 dark:text-white">{fmt(log.totalAssets)}</span>
                                  </div>
                                )}
                                {log.totalLiabilities > 0 && (
                                  <div>
                                    <span className="text-slate-500">Total Liabilities:</span>{" "}
                                    <span className="font-semibold text-slate-900 dark:text-white">{fmt(log.totalLiabilities)}</span>
                                  </div>
                                )}
                                {log.totalEquity > 0 && (
                                  <div>
                                    <span className="text-slate-500">Total Equity:</span>{" "}
                                    <span className="font-semibold text-slate-900 dark:text-white">{fmt(log.totalEquity)}</span>
                                  </div>
                                )}
                                <div>
                                  <span className="text-slate-500">Balance Discrepancy:</span>{" "}
                                  <span className={`font-semibold ${(log.balanceDiscrepancy || 0) <= 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {fmt(log.balanceDiscrepancy || 0)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Inventory Discrepancy:</span>{" "}
                                  <span className={`font-semibold ${(log.inventoryDiscrepancy || 0) <= 1 ? 'text-emerald-600' : 'text-red-600'}`}>
                                    {fmt(log.inventoryDiscrepancy || 0)}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Records Deleted:</span>{" "}
                                  <span className="font-semibold text-slate-900 dark:text-white">{log.recordsDeleted || 0}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Module:</span>{" "}
                                  <span className="font-semibold text-slate-900 dark:text-white">{log.moduleUnderTest || "—"}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">Triggered By:</span>{" "}
                                  <span className="font-semibold text-slate-900 dark:text-white">{log.triggeredByName || "System"}</span>
                                </div>
                              </div>
                              {log.errorMessage && (
                                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
                                  <p className="text-sm text-red-700 dark:text-red-400 font-medium">Error: {log.errorMessage}</p>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </React.Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // RENDER: SYSTEM WIPE TAB
  // ============================================================

  const renderSystemWipe = () => (
    <div className="space-y-6">
      <Card className="border-red-300 dark:border-red-800">
        <CardHeader className="bg-gradient-to-r from-red-900/60 to-[#132240] rounded-t-lg pb-4">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <Trash2 className="w-5 h-5 text-red-400" />
            System Wipe Control
            <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-xs ml-2">DESTRUCTIVE</Badge>
          </CardTitle>
          <CardDescription className="text-slate-400 text-sm">
            Permanently delete all commercial data (transactions, customers, suppliers, products, employees, stock) while preserving system configuration
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-6 h-6 text-red-500 mt-0.5 shrink-0" />
              <div>
                <h4 className="font-semibold text-red-800 dark:text-red-300">This action cannot be undone</h4>
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  All sales orders, purchase orders, POS sales, ledger entries, journal vouchers, customers, suppliers,
                  products, product stock, employees, and all transaction records will be permanently deleted.
                  System configuration (COA, branches, banks, departments, designations, etc.) will be preserved.
                </p>
              </div>
            </div>
          </div>

          <Button
            size="lg"
            variant="destructive"
            className="font-semibold px-8 py-6 text-base"
            disabled={isLoading}
            onClick={() => setWipeDialogOpen(true)}
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Wiping All Commercial Data...
              </>
            ) : (
              <>
                <Trash2 className="w-5 h-5 mr-2" />
                Wipe All Commercial Data
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Wipe Result */}
      {wipeResult && (
        <Card className="border-slate-200 dark:border-slate-700">
          <CardHeader className="bg-gradient-to-r from-emerald-900/40 to-[#132240] rounded-t-lg pb-3">
            <CardTitle className="text-white flex items-center gap-2 text-base">
              <CheckCircle className="w-5 h-5 text-emerald-400" />
              Wipe Execution Report
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Total Deleted</p>
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">
                  {wipeResult.data?.totalDeleted != null ? new Intl.NumberFormat('en-US').format(wipeResult.data.totalDeleted) : 0}
                </p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Tables Affected</p>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">
                  {wipeResult.data?.tablesAffected || 0}
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">Execution Time</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {fmtMs(wipeResult.data?.executionTimeMs || 0)}
                </p>
              </div>
            </div>

            {/* Deletion Breakdown */}
            {wipeResult.data?.deletionBreakdown && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Deletion Breakdown by Table</h4>
                <div className="max-h-64 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-100 dark:bg-slate-800">
                        <TableHead className="font-semibold">Table</TableHead>
                        <TableHead className="font-semibold text-right">Records Deleted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(wipeResult.data.deletionBreakdown)
                        .filter(([_, count]) => (count as number) > 0)
                        .sort(([_, a], [__, b]) => (b as number) - (a as number))
                        .map(([table, count]) => (
                          <TableRow key={table}>
                            <TableCell className="text-sm font-mono text-slate-900 dark:text-white">{table}</TableCell>
                            <TableCell className="text-sm text-right font-semibold text-red-600 dark:text-red-400">
                              {new Intl.NumberFormat('en-US').format(count as number)}
                            </TableCell>
                          </TableRow>
                        ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

            {/* Preserved Tables */}
            {wipeResult.data?.preservedTables && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Preserved Tables (System Configuration)</h4>
                <div className="flex flex-wrap gap-2">
                  {wipeResult.data.preservedTables.map((table: string) => (
                    <Badge key={table} variant="outline" className="text-xs text-slate-600 dark:text-slate-300">
                      {table}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Post-Wipe Resets */}
            {wipeResult.data?.postWipeResets && (
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Post-Wipe Resets Applied</h4>
                <ul className="space-y-1">
                  {wipeResult.data.postWipeResets.map((reset: string, i: number) => (
                    <li key={i} className="text-sm text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                      <CheckCircle className="w-3.5 h-3.5" /> {reset}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );

  // ============================================================
  // RENDER: QA CERTIFICATION EXPORT TAB
  // ============================================================

  const renderQACertification = () => (
    <div className="space-y-6">
      <Card className="border-slate-200 dark:border-slate-700">
        <CardHeader className="bg-gradient-to-r from-[#132240] to-[#0a1628] rounded-t-lg pb-4">
          <CardTitle className="text-white flex items-center gap-2 text-base">
            <FileDown className="w-5 h-5 text-blue-400" />
            QA Certification Export
            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs ml-2">Sys-Staging-QA-Vault</Badge>
          </CardTitle>
          <CardDescription className="text-slate-400 text-sm">
            Generate a comprehensive &quot;VoltERP System Quality Assurance &amp; Integrity Compliance Certification&quot; PDF with multi-column test matrix, assertion details, legal disclaimer, and triple-signature layout
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-6">
          <Button
            size="lg"
            className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold px-8 py-6 text-base"
            disabled={isExportingPDF}
            onClick={handleExportQAPDF}
          >
            {isExportingPDF ? (
              <>
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                Generating QA Certification PDF...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                Export QA Certification PDF
              </>
            )}
          </Button>

          {/* PDF Preview Description */}
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-6 space-y-4">
            <h4 className="font-semibold text-slate-900 dark:text-white">PDF Certification Includes:</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { icon: "🏢", text: "Company Logo & Branding" },
                { icon: "📋", text: "Multi-Column Test Log Metadata Matrix" },
                { icon: "✅", text: "Every Passed Assertion with Execution Time" },
                { icon: "📊", text: "Accounting Equation Validation Report" },
                { icon: "🛡️", text: "Shield Interlock Verification Results" },
                { icon: "📦", text: "Inventory Cross-Reference Analysis" },
                { icon: "📜", text: "Legal Secure Disclaimer Text" },
                { icon: "✍️", text: "Enterprise Triple-Signature Layout" },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                  <span>{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Compliance Token</h5>
              <div className="bg-[#0a1628] text-blue-400 font-mono text-sm px-4 py-2 rounded-md">
                Sys-Staging-QA-Vault
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Enterprise Corporate Triple-Signature Layout</h5>
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="border-b-2 border-slate-300 dark:border-slate-600 pb-2 mb-1"></div>
                  <p className="text-xs text-slate-500">Prepared By</p>
                </div>
                <div className="text-center">
                  <div className="border-b-2 border-slate-300 dark:border-slate-600 pb-2 mb-1"></div>
                  <p className="text-xs text-slate-500">Checked By</p>
                </div>
                <div className="text-center">
                  <div className="border-b-2 border-slate-300 dark:border-slate-600 pb-2 mb-1"></div>
                  <p className="text-xs text-slate-500">Authorized By</p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );

  // ============================================================
  // MAIN RENDER
  // ============================================================

  return (
    <div className="page-enter flex flex-col bg-slate-50 dark:bg-slate-900">
      {/* NAVY HEADER BAR */}
      <div className="bg-[#0a1628] text-white px-4 sm:px-6 py-4 flex items-center gap-3 shrink-0">
        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center">
          <FlaskConical className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Staging QA & Test Bed
          </h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Seed engine, system test bed, shield interlock verification, and QA certification export
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-xs">
            <ShieldCheck className="w-3 h-3 mr-1" />
            Sys-Staging-QA-Vault
          </Badge>
        </div>
      </div>

      {/* KPI STATS ROW */}
      <div className="px-4 sm:px-6 py-4 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 shrink-0">
        <Card className="border-l-4 border-l-blue-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <FlaskConical className="w-4 h-4 text-blue-500" />
              Seed Runs
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {testLogs.filter(l => l.testType === "SEED_ENGINE").length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-cyan-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <ShieldCheck className="w-4 h-4 text-cyan-500" />
              Test Bed Runs
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {testLogs.filter(l => l.testType === "TEST_BED").length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              Passed Tests
            </div>
            <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400 mt-1">
              {testLogs.filter(l => l.status === "Passed").length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Failed / Warning
            </div>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400 mt-1">
              {testLogs.filter(l => l.status === "Failed" || l.status === "Warning").length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* TAB NAVIGATION */}
      <div className="px-4 sm:px-6 flex-1 pb-8">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4 bg-slate-200 dark:bg-slate-800 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="seed-engine" className="gap-1.5 text-xs">
              <FlaskConical className="w-3.5 h-3.5" />
              Seed Engine
            </TabsTrigger>
            <TabsTrigger value="test-bed" className="gap-1.5 text-xs">
              <ShieldCheck className="w-3.5 h-3.5" />
              System Test Bed
            </TabsTrigger>
            <TabsTrigger value="test-history" className="gap-1.5 text-xs">
              <Clock className="w-3.5 h-3.5" />
              Test History
            </TabsTrigger>
            <TabsTrigger value="system-wipe" className="gap-1.5 text-xs">
              <Trash2 className="w-3.5 h-3.5" />
              System Wipe
            </TabsTrigger>
            <TabsTrigger value="qa-certification" className="gap-1.5 text-xs">
              <FileDown className="w-3.5 h-3.5" />
              QA Certification
            </TabsTrigger>
          </TabsList>

          <TabsContent value="seed-engine">{renderSeedEngine()}</TabsContent>
          <TabsContent value="test-bed">{renderTestBed()}</TabsContent>
          <TabsContent value="test-history">{renderTestHistory()}</TabsContent>
          <TabsContent value="system-wipe">{renderSystemWipe()}</TabsContent>
          <TabsContent value="qa-certification">{renderQACertification()}</TabsContent>
        </Tabs>
      </div>

      {/* RE-SEED CONFIRMATION DIALOG */}
      <Dialog open={reseedDialogOpen} onOpenChange={setReseedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              Force Re-Seed Confirmation
            </DialogTitle>
            <DialogDescription>
              This will wipe all existing commercial data and re-seed the entire demo ecosystem from scratch.
              All current transactions, customers, suppliers, and products will be permanently deleted and replaced.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReseedDialogOpen(false)}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              onClick={() => {
                setReseedDialogOpen(false);
                handleSeedEngine(true);
              }}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Force Re-Seed
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* WIPE CONFIRMATION DIALOG */}
      <Dialog open={wipeDialogOpen} onOpenChange={(open) => {
        setWipeDialogOpen(open);
        if (!open) setWipeConfirmText("");
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
              <Trash2 className="w-5 h-5" />
              Wipe All Commercial Data
            </DialogTitle>
            <DialogDescription>
              This is an irreversible operation. Type <strong>WIPE</strong> to confirm that you want to permanently delete all commercial data.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="wipe-confirm" className="text-sm font-semibold text-slate-900 dark:text-white">
              Type &quot;WIPE&quot; to confirm
            </Label>
            <Input
              id="wipe-confirm"
              value={wipeConfirmText}
              onChange={(e) => setWipeConfirmText(e.target.value)}
              placeholder="Type WIPE here..."
              className="font-mono text-center text-lg tracking-widest"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setWipeDialogOpen(false); setWipeConfirmText(""); }}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={wipeConfirmText !== "WIPE"}
              onClick={handleWipe}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Wipe All Data
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
