'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Percent, Calculator, TrendingUp, DollarSign, FileDown, FileUp,
  Search, Plus, Edit, Trash2, RefreshCw, Loader2, CheckCircle,
  XCircle, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { useToast } from '@/hooks/use-toast';
import {
  exportToPDF, exportToCSV, importFromCSV,
} from '@/lib/export-utils';
import type { ColumnDef, FieldDef, CompanyProfile } from '@/lib/export-utils';

// ============================================================
// PROPS
// ============================================================

interface InterestPercentageEnginePageProps {
  userRole: string;
  isVatAuditor: boolean;
}

// ============================================================
// CONSTANTS & UTILITIES
// ============================================================

const RATE_TYPES = ['HIRE_PURCHASE', 'TERM_LOAN', 'OVERDRAFT', 'CUSTOM'] as const;
type RateType = (typeof RATE_TYPES)[number];

const RATE_TYPE_LABELS: Record<RateType, string> = {
  HIRE_PURCHASE: 'Hire Purchase',
  TERM_LOAN: 'Term Loan',
  OVERDRAFT: 'Overdraft',
  CUSTOM: 'Custom',
};

const RATE_TYPE_BADGE: Record<RateType, string> = {
  HIRE_PURCHASE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  TERM_LOAN: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  OVERDRAFT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  CUSTOM: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
};

const bdCurrencyFmt = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const fmtCurrency = (v: any) => {
  if (v === null || v === undefined || v === '') return '\u2014';
  return `\u09F3${bdCurrencyFmt.format(Number(v))}`;
};

const fmtNumber = (v: any) => {
  if (v === null || v === undefined || v === '') return '\u2014';
  return bdCurrencyFmt.format(Number(v));
};

const bdDateFmt = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

const fmtDate = (d: string | Date) =>
  d ? bdDateFmt.format(new Date(d)) : '\u2014';

function sanitizeXSS(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/  +/g, ' ')
    .trim();
}

async function apiFetch(path: string, opts?: RequestInit) {
  const authHeaders: Record<string, string> = { 'Content-Type': 'application/json' };
  try {
    const stored = localStorage.getItem('ems_auth');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.accessToken) { authHeaders['Authorization'] = `Bearer ${parsed.accessToken}`; }
    }
  } catch { /* silent */ }
  const res = await fetch(path, { headers: { ...authHeaders, ...opts?.headers }, ...opts });
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('ems_auth');
      window.location.reload();
    }
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

// ============================================================
// AUTH HOOK (local copy)
// ============================================================

type UserRole = 'admin' | 'manager' | 'sr' | 'dealer' | 'vat_auditor';

interface AuthUser {
  name: string;
  email: string;
  role: UserRole;
  displayName: string;
}

let authState = {
  isAuthenticated: false,
  user: null as AuthUser | null,
};

let authListeners: Array<() => void> = [];

function useAuth() {
  const [, forceUpdate] = useState({});
  useEffect(() => {
    const listener = () => forceUpdate({});
    authListeners.push(listener);
    return () => { authListeners = authListeners.filter(l => l !== listener); };
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('ems_auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        authState = parsed;
        authListeners.forEach(l => l());
      } catch { /* silent */ }
    }
  }, []);

  const isVatAuditor = authState.user?.role === 'vat_auditor';
  return { ...authState, isVatAuditor, user: authState.user };
}

// ============================================================
// FORM DATA DEFAULTS
// ============================================================

interface RateFormData {
  percentage: string;
  type: RateType;
  effectiveDate: string;
  expiryDate: string;
  minimumAmount: string;
  maximumAmount: string;
  durationMonthsMin: string;
  durationMonthsMax: string;
  description: string;
  isActive: boolean;
}

const defaultFormData: RateFormData = {
  percentage: '',
  type: 'HIRE_PURCHASE',
  effectiveDate: new Date().toISOString().split('T')[0],
  expiryDate: '',
  minimumAmount: '0',
  maximumAmount: '0',
  durationMonthsMin: '0',
  durationMonthsMax: '0',
  description: '',
  isActive: true,
};

interface AmortForm {
  principal: string;
  downPayment: string;
  interestRate: string;
  durationMonths: string;
  rateType: RateType;
}

const defaultAmortForm: AmortForm = {
  principal: '',
  downPayment: '0',
  interestRate: '',
  durationMonths: '',
  rateType: 'HIRE_PURCHASE',
};

// ============================================================
// COMPONENT
// ============================================================

export default function InterestPercentageEnginePage({
  userRole,
  isVatAuditor: isVatAuditorProp,
}: InterestPercentageEnginePageProps) {
  const { toast } = useToast();
  const { isVatAuditor: isVatAuditorAuth, user } = useAuth();
  const isVatAuditor = isVatAuditorProp || isVatAuditorAuth;
  const isAdmin = user?.role === 'admin';

  // ── Rates state ──
  const [rates, setRates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [deleteItem, setDeleteItem] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<RateFormData>({ ...defaultFormData });

  // ── Company profile for PDF ──
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | undefined>(undefined);

  // ── Amortization state ──
  const [amortForm, setAmortForm] = useState<AmortForm>({ ...defaultAmortForm });
  const [amortResult, setAmortResult] = useState<any>(null);
  const [amortLoading, setAmortLoading] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);

  // ── Load data ──
  const loadRates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/interest-percentages?includeInactive=true');
      setRates(Array.isArray(res) ? res : res.data || []);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [toast]);

  const loadCompanyProfile = useCallback(async () => {
    try {
      const res = await apiFetch('/api/company-branding').catch(() => null);
      if (res?.company) {
        setCompanyProfile(res.company as CompanyProfile);
      }
    } catch { /* silent */ }
  }, []);

  useEffect(() => { loadRates(); loadCompanyProfile(); }, [loadRates, loadCompanyProfile]);

  // ── Computed stats ──
  const totalRates = rates.length;
  const activeRates = rates.filter((r: any) => r.isActive).length;
  const expiredRates = rates.filter((r: any) => {
    if (!r.expiryDate) return false;
    return new Date(r.expiryDate) < new Date();
  }).length;
  const rateTypes = new Set(rates.map((r: any) => r.type)).size;

  // ── Filtered rates ──
  const filtered = useMemo(() => {
    if (!search) return rates;
    const s = search.toLowerCase();
    return rates.filter((r: any) =>
      r.code?.toLowerCase().includes(s) ||
      r.type?.toLowerCase().includes(s) ||
      String(r.percentage)?.includes(s) ||
      r.description?.toLowerCase().includes(s)
    );
  }, [rates, search]);

  // ── CRUD handlers ──
  const openCreate = () => {
    setFormData({ ...defaultFormData });
    setEditItem(null);
    setShowForm(true);
  };

  const openEdit = (item: any) => {
    setFormData({
      percentage: String(item.percentage ?? ''),
      type: item.type || 'HIRE_PURCHASE',
      effectiveDate: item.effectiveDate ? item.effectiveDate.split('T')[0] : '',
      expiryDate: item.expiryDate ? item.expiryDate.split('T')[0] : '',
      minimumAmount: String(item.minimumAmount ?? 0),
      maximumAmount: String(item.maximumAmount ?? 0),
      durationMonthsMin: String(item.durationMonthsMin ?? 0),
      durationMonthsMax: String(item.durationMonthsMax ?? 0),
      description: item.description || '',
      isActive: item.isActive ?? true,
    });
    setEditItem(item);
    setShowForm(true);
  };

  const validateForm = (): string | null => {
    const pct = parseFloat(formData.percentage);
    if (isNaN(pct) || pct < 0 || pct > 100) {
      return 'Percentage must be between 0 and 100';
    }
    if (!formData.effectiveDate) {
      return 'Effective Date is required';
    }
    if (formData.expiryDate && new Date(formData.expiryDate) <= new Date(formData.effectiveDate)) {
      return 'Expiry Date must be after Effective Date';
    }
    const minAmt = parseFloat(formData.minimumAmount) || 0;
    const maxAmt = parseFloat(formData.maximumAmount) || 0;
    if (minAmt > 0 && maxAmt > 0 && minAmt > maxAmt) {
      return 'Minimum Amount must be less than or equal to Maximum Amount';
    }
    const minDur = parseInt(formData.durationMonthsMin) || 0;
    const maxDur = parseInt(formData.durationMonthsMax) || 0;
    if (minDur > 0 && maxDur > 0 && minDur > maxDur) {
      return 'Minimum Duration must be less than or equal to Maximum Duration';
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      toast({ title: 'Validation Error', description: validationError, variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        percentage: parseFloat(formData.percentage),
        type: formData.type,
        effectiveDate: formData.effectiveDate,
        expiryDate: formData.expiryDate || null,
        minimumAmount: parseFloat(formData.minimumAmount) || 0,
        maximumAmount: parseFloat(formData.maximumAmount) || 0,
        durationMonthsMin: parseInt(formData.durationMonthsMin) || 0,
        durationMonthsMax: parseInt(formData.durationMonthsMax) || 0,
        description: formData.description ? sanitizeXSS(formData.description) : null,
        isActive: formData.isActive,
      };

      if (editItem) {
        await apiFetch(`/api/interest-percentages/${editItem.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast({ title: 'Updated', description: 'Interest rate updated' });
      } else {
        await apiFetch('/api/interest-percentages', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        toast({ title: 'Created', description: 'Interest rate created' });
      }
      setShowForm(false);
      loadRates();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteItem) return;
    try {
      await apiFetch(`/api/interest-percentages/${deleteItem.id}`, { method: 'DELETE' });
      toast({ title: 'Deleted', description: 'Interest rate deleted' });
      setDeleteItem(null);
      loadRates();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── Auto-fill rate ──
  const handleAutoFillRate = async () => {
    const amount = parseFloat(amortForm.principal) - parseFloat(amortForm.downPayment || '0');
    const duration = parseInt(amortForm.durationMonths);
    if (!amortForm.principal || !amortForm.durationMonths) {
      toast({ title: 'Info', description: 'Please enter Principal and Duration first', variant: 'destructive' });
      return;
    }
    setAutoFillLoading(true);
    try {
      const res = await apiFetch(
        `/api/interest-percentages?mode=active-rate&type=${amortForm.rateType}&amount=${amount}&duration=${duration}`
      );
      if (res.percentage !== undefined) {
        setAmortForm(prev => ({ ...prev, interestRate: String(res.percentage) }));
        toast({ title: 'Rate Auto-Filled', description: `${res.code}: ${res.percentage}%` });
      }
    } catch (e: any) {
      toast({ title: 'No Rate Found', description: e.message, variant: 'destructive' });
    } finally { setAutoFillLoading(false); }
  };

  // ── Calculate amortization ──
  const handleCalculate = async () => {
    const principal = parseFloat(amortForm.principal);
    const rate = parseFloat(amortForm.interestRate);
    const duration = parseInt(amortForm.durationMonths);
    const downPayment = parseFloat(amortForm.downPayment || '0');

    if (!principal || principal <= 0) {
      toast({ title: 'Error', description: 'Principal Amount is required', variant: 'destructive' });
      return;
    }
    if (!duration || duration <= 0) {
      toast({ title: 'Error', description: 'Duration is required', variant: 'destructive' });
      return;
    }
    if (isNaN(rate)) {
      toast({ title: 'Error', description: 'Interest Rate is required', variant: 'destructive' });
      return;
    }

    setAmortLoading(true);
    try {
      const res = await apiFetch(
        `/api/interest-percentages/amortization?principal=${principal}&rate=${rate}&duration=${duration}&downPayment=${downPayment}`
      );
      setAmortResult(res);
      toast({ title: 'Calculated', description: 'Amortization schedule generated' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    } finally { setAmortLoading(false); }
  };

  // ── PDF Export: Rate Configuration ──
  const exportRatePDF = () => {
    try {
      const columns: ColumnDef[] = [
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'percentage', label: 'Percentage', type: 'number' },
        { key: 'effectiveDate', label: 'Effective Date', type: 'date' },
        { key: 'expiryDate', label: 'Expiry Date', type: 'date' },
        { key: 'minimumAmount', label: 'Min Amount', type: 'currency' },
        { key: 'maximumAmount', label: 'Max Amount', type: 'currency' },
        { key: 'durationMonthsMin', label: 'Min Duration', type: 'number' },
        { key: 'durationMonthsMax', label: 'Max Duration', type: 'number' },
        { key: 'isActive', label: 'Status', type: 'boolean' },
      ];

      const data = filtered.map((r: any) => ({
        code: r.code,
        type: RATE_TYPE_LABELS[r.type as RateType] || r.type,
        percentage: r.percentage,
        effectiveDate: r.effectiveDate,
        expiryDate: r.expiryDate,
        minimumAmount: isVatAuditor ? 'N/A (Audit Mode)' : r.minimumAmount,
        maximumAmount: isVatAuditor ? 'N/A (Audit Mode)' : r.maximumAmount,
        durationMonthsMin: r.durationMonthsMin,
        durationMonthsMax: r.durationMonthsMax,
        isActive: r.isActive,
      }));

      exportToPDF({
        title: 'Interest Rate Configuration',
        subtitle: `${filtered.length} rate(s)`,
        orientation: 'landscape',
        columns,
        data,
        isVatAuditor,
        vatMaskedColumns: isVatAuditor ? ['minimumAmount', 'maximumAmount'] : [],
        company: companyProfile,
        systemNotice: 'This is a system generated interest rate configuration report. Rates are subject to regulatory approval.',
        financialFooter: {
          preparedBy: user?.displayName || '',
          checkedBy: '',
          authorizedBy: '',
          approvedBy: '',
          printedBy: user?.displayName || 'System',
        },
      });
      toast({ title: 'Exported', description: 'Interest rate PDF exported' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── PDF Export: Amortization Schedule ──
  const exportAmortPDF = () => {
    if (!amortResult) return;
    try {
      const columns: ColumnDef[] = [
        { key: 'month', label: 'Month', type: 'number' },
        { key: 'openingBalance', label: 'Opening Balance', type: 'currency' },
        { key: 'installment', label: 'Installment', type: 'currency' },
        { key: 'interestComponent', label: 'Interest', type: 'currency' },
        { key: 'principalComponent', label: 'Principal', type: 'currency' },
        { key: 'closingBalance', label: 'Closing Balance', type: 'currency' },
      ];

      const data = amortResult.schedule.map((row: any) => ({
        month: row.month,
        openingBalance: row.openingBalance,
        installment: row.installment,
        interestComponent: row.interestComponent,
        principalComponent: row.principalComponent,
        closingBalance: row.closingBalance,
      }));

      const totalPayable = fmtCurrency(amortResult.totalPayable);
      const totalInterest = fmtCurrency(amortResult.totalInterest);

      exportToPDF({
        title: 'Amortization Schedule',
        subtitle: `Principal: ${fmtCurrency(amortResult.principal)} | Rate: ${amortResult.annualRate}% | Duration: ${amortResult.duration} months`,
        orientation: 'landscape',
        columns,
        data,
        isVatAuditor,
        vatMaskedColumns: [],
        company: companyProfile,
        systemNotice: 'This amortization schedule is generated using the reducing balance method. Verify calculations with your financial advisor.',
        summaryRows: [
          {
            cells: [
              'Total Payable', '', '', '', '', totalPayable,
            ],
            style: {
              fillColor: [10, 22, 40],
              textColor: [255, 255, 255],
              fontStyle: 'bold',
              fontSize: 8,
            },
          },
          {
            cells: [
              'Total Interest', '', '', '', '', totalInterest,
            ],
            style: {
              fillColor: [240, 244, 252],
              textColor: [30, 41, 59],
              fontStyle: 'bold',
              fontSize: 8,
            },
          },
        ],
        financialFooter: {
          preparedBy: user?.displayName || '',
          checkedBy: '',
          authorizedBy: '',
          approvedBy: '',
          printedBy: user?.displayName || 'System',
        },
      });
      toast({ title: 'Exported', description: 'Amortization schedule PDF exported' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── CSV Export: Rate Configuration ──
  const exportRateCSV = () => {
    try {
      const columns: ColumnDef[] = [
        { key: 'code', label: 'Code', type: 'text' },
        { key: 'type', label: 'Type', type: 'text' },
        { key: 'percentage', label: 'Percentage', type: 'number' },
        { key: 'effectiveDate', label: 'Effective Date', type: 'date' },
        { key: 'expiryDate', label: 'Expiry Date', type: 'date' },
        { key: 'minimumAmount', label: 'Min Amount', type: 'currency' },
        { key: 'maximumAmount', label: 'Max Amount', type: 'currency' },
        { key: 'durationMonthsMin', label: 'Min Duration (months)', type: 'number' },
        { key: 'durationMonthsMax', label: 'Max Duration (months)', type: 'number' },
        { key: 'isActive', label: 'Active', type: 'boolean' },
      ];

      const data = filtered.map((r: any) => ({
        code: r.code,
        type: RATE_TYPE_LABELS[r.type as RateType] || r.type,
        percentage: r.percentage,
        effectiveDate: r.effectiveDate,
        expiryDate: r.expiryDate || '',
        minimumAmount: isVatAuditor ? 'N/A (Audit Mode)' : r.minimumAmount,
        maximumAmount: isVatAuditor ? 'N/A (Audit Mode)' : r.maximumAmount,
        durationMonthsMin: r.durationMonthsMin,
        durationMonthsMax: r.durationMonthsMax,
        isActive: r.isActive,
      }));

      exportToCSV({
        title: 'Interest Rate Configuration',
        columns,
        data,
        isVatAuditor,
        vatMaskedColumns: isVatAuditor ? ['minimumAmount', 'maximumAmount'] : [],
        filename: 'interest-rate-configuration',
      });
      toast({ title: 'Exported', description: 'Interest rate CSV exported' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── CSV Export: Amortization Schedule ──
  const exportAmortCSV = () => {
    if (!amortResult) return;
    try {
      const columns: ColumnDef[] = [
        { key: 'month', label: 'Month', type: 'number' },
        { key: 'openingBalance', label: 'Opening Balance', type: 'currency' },
        { key: 'installment', label: 'Installment', type: 'currency' },
        { key: 'interestComponent', label: 'Interest', type: 'currency' },
        { key: 'principalComponent', label: 'Principal', type: 'currency' },
        { key: 'closingBalance', label: 'Closing Balance', type: 'currency' },
      ];

      const data = amortResult.schedule.map((row: any) => ({
        month: row.month,
        openingBalance: row.openingBalance,
        installment: row.installment,
        interestComponent: row.interestComponent,
        principalComponent: row.principalComponent,
        closingBalance: row.closingBalance,
      }));

      exportToCSV({
        title: 'Amortization Schedule',
        columns,
        data,
        isVatAuditor,
        vatMaskedColumns: [],
        filename: 'amortization-schedule',
      });
      toast({ title: 'Exported', description: 'Amortization schedule CSV exported' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message, variant: 'destructive' });
    }
  };

  // ── CSV Import ──
  const importCSV = () => {
    const formFields: FieldDef[] = [
      { key: 'percentage', label: 'Percentage', type: 'number', required: true },
      { key: 'type', label: 'Type', type: 'select', required: true, options: RATE_TYPES.map(t => ({ value: t, label: RATE_TYPE_LABELS[t] })) },
      { key: 'effectiveDate', label: 'Effective Date', type: 'date', required: true },
      { key: 'expiryDate', label: 'Expiry Date', type: 'date' },
      { key: 'minimumAmount', label: 'Minimum Amount', type: 'number', step: '0.01' },
      { key: 'maximumAmount', label: 'Maximum Amount', type: 'number', step: '0.01' },
      { key: 'durationMonthsMin', label: 'Minimum Duration (months)', type: 'number' },
      { key: 'durationMonthsMax', label: 'Maximum Duration (months)', type: 'number' },
      { key: 'description', label: 'Description', type: 'textarea' },
      { key: 'isActive', label: 'Active', type: 'checkbox' },
    ];

    importFromCSV({
      apiPath: '/api/interest-percentages',
      formFields,
    }).then(result => {
      toast({
        title: 'Import Complete',
        description: `Imported: ${result.imported}, Failed: ${result.failed}`,
        variant: result.failed > 0 ? 'destructive' : 'default',
      });
      loadRates();
    });
  };

  // ── RBAC checks ──
  const isManager = user?.role === 'manager';
  const canMutate = (isAdmin || isManager) && !isVatAuditor;
  const deleteDisabled = isVatAuditor || !isAdmin;
  const canCreateEdit = canMutate;

  return (
    <div className="page-enter space-y-4">
      {/* VAT Auditor Mode Badge */}
      {isVatAuditor && (
        <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <Badge className="bg-amber-500 text-white">VAT AUDIT MODE</Badge>
          <span className="text-sm text-amber-700 dark:text-amber-400">
            Financial amounts are masked for audit compliance.
          </span>
        </div>
      )}

      {/* Manager restriction banner */}
      {user?.role === 'manager' && (
        <div className="flex items-center gap-2 px-4 py-2 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg">
          <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
          <span className="text-sm text-orange-700 dark:text-orange-400 font-medium">
            Delete operations are restricted to administrators only.
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Percent className="w-6 h-6" />
          Interest Percentage Engine
        </h2>
      </div>

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* ════════════════════════════════════════════════════════
            LEFT PANEL — Rate Management (60% → 3/5)
        ════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-3 space-y-4">
          {/* KPI Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
            {[
              { label: 'Total Rates', value: totalRates, icon: Percent, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30' },
              { label: 'Active Rates', value: activeRates, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/30' },
              { label: 'Expired Rates', value: expiredRates, icon: XCircle, color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-900/30' },
              { label: 'Rate Types', value: rateTypes, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/30' },
            ].map((stat, i) => (
              <Card key={i} className="stat-mini-card">
                <CardContent className="p-3 flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}>
                    <stat.icon className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white">{stat.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Search & Actions */}
          <Card>
            <CardContent className="p-4">
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by code, type, percentage..."
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button variant="outline" size="sm" onClick={loadRates}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
                <div className="flex gap-2 flex-wrap ml-auto">
                  {canCreateEdit && (
                    <Button variant="outline" size="sm" onClick={importCSV}>
                      <FileUp className="w-4 h-4 mr-1" />Import
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={exportRateCSV}>
                    <FileDown className="w-4 h-4 mr-1" />CSV
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportRatePDF}>
                    <FileDown className="w-4 h-4 mr-1" />PDF
                  </Button>
                  {canCreateEdit && (
                    <Button size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]" onClick={openCreate}>
                      <Plus className="w-4 h-4 mr-1" />Create Rate
                    </Button>
                  )}
                </div>
              </div>

              {/* Data Table */}
              <div className="table-container overflow-x-auto overflow-y-auto max-h-[50vh] rounded-md border -mx-2 sm:mx-0">
                <Table className="min-w-[600px]">
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Code</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">%</TableHead>
                      <TableHead>Effective</TableHead>
                      <TableHead>Expiry</TableHead>
                      <TableHead className="text-right">Min Amt</TableHead>
                      <TableHead className="text-right">Max Amt</TableHead>
                      <TableHead className="text-right">Min Dur</TableHead>
                      <TableHead className="text-right">Max Dur</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-20 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={11} className="h-24 text-center">
                          <RefreshCw className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="h-24 text-center text-muted-foreground">
                          No interest rates found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtered.map((r: any) => (
                        <TableRow key={r.id} className="data-table-row hover:bg-muted/50">
                          <TableCell className="font-mono font-medium text-slate-900 dark:text-white">
                            {r.code}
                          </TableCell>
                          <TableCell>
                            <Badge className={RATE_TYPE_BADGE[r.type as RateType] || ''}>
                              {RATE_TYPE_LABELS[r.type as RateType] || r.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {Number(r.percentage).toFixed(2)}%
                          </TableCell>
                          <TableCell>{fmtDate(r.effectiveDate)}</TableCell>
                          <TableCell>{fmtDate(r.expiryDate)}</TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor ? 'N/A (Audit Mode)' : fmtCurrency(r.minimumAmount)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {isVatAuditor ? 'N/A (Audit Mode)' : (r.maximumAmount === 0 ? 'Unlimited' : fmtCurrency(r.maximumAmount))}
                          </TableCell>
                          <TableCell className="text-right">{r.durationMonthsMin || 0} mo</TableCell>
                          <TableCell className="text-right">
                            {r.durationMonthsMax === 0 ? 'Unlimited' : `${r.durationMonthsMax} mo`}
                          </TableCell>
                          <TableCell>
                            <Badge className={r.isActive
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}>
                              {r.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(r)} disabled={!canCreateEdit}>
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              {deleteDisabled ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span>
                                      <Button variant="ghost" size="sm" className="text-red-500" disabled>
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {isVatAuditor ? 'VAT Auditor cannot delete' : 'Only administrators can delete'}
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setDeleteItem(r)}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Showing {filtered.length} of {rates.length} rate(s)
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ════════════════════════════════════════════════════════
            RIGHT PANEL — Amortization Calculator (40% → 2/5)
        ════════════════════════════════════════════════════════ */}
        <div className="lg:col-span-2 space-y-4">
          {/* Calculator Input Form */}
          <Card>
            <CardContent className="p-4 space-y-4">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Calculator className="w-5 h-5" />
                Amortization Calculator
              </h3>

              <div className="space-y-3">
                {/* Principal Amount */}
                <div className="space-y-1.5">
                  <Label>Principal Amount <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amortForm.principal}
                    onChange={e => setAmortForm(prev => ({ ...prev, principal: e.target.value }))}
                  />
                </div>

                {/* Down Payment */}
                <div className="space-y-1.5">
                  <Label>Down Payment</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={amortForm.downPayment}
                    onChange={e => setAmortForm(prev => ({ ...prev, downPayment: e.target.value }))}
                  />
                </div>

                {/* Rate Type */}
                <div className="space-y-1.5">
                  <Label>Rate Type</Label>
                  <Select
                    value={amortForm.rateType}
                    onValueChange={v => setAmortForm(prev => ({ ...prev, rateType: v as RateType }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {RATE_TYPES.map(t => (
                        <SelectItem key={t} value={t}>{RATE_TYPE_LABELS[t]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Interest Rate */}
                <div className="space-y-1.5">
                  <Label>Interest Rate %</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="0.00"
                      className="flex-1"
                      value={amortForm.interestRate}
                      onChange={e => setAmortForm(prev => ({ ...prev, interestRate: e.target.value }))}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleAutoFillRate}
                      disabled={autoFillLoading}
                      className="whitespace-nowrap"
                    >
                      {autoFillLoading ? (
                        <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                      ) : (
                        <RefreshCw className="w-4 h-4 mr-1" />
                      )}
                      Auto-Fill
                    </Button>
                  </div>
                </div>

                {/* Duration */}
                <div className="space-y-1.5">
                  <Label>Duration (Months) <span className="text-red-500">*</span></Label>
                  <Input
                    type="number"
                    placeholder="12"
                    value={amortForm.durationMonths}
                    onChange={e => setAmortForm(prev => ({ ...prev, durationMonths: e.target.value }))}
                  />
                </div>

                {/* Calculate button */}
                <Button
                  className="w-full bg-[#2563eb] hover:bg-[#1d4ed8]"
                  onClick={handleCalculate}
                  disabled={amortLoading}
                >
                  {amortLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Calculator className="w-4 h-4 mr-2" />
                  )}
                  Calculate Schedule
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Results */}
          {amortResult && (
            <>
              {/* Summary Cards */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Net Principal', value: fmtCurrency(amortResult.netPrincipal), icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-900/30' },
                  { label: 'Monthly Installment', value: fmtCurrency(amortResult.monthlyInstallment), icon: Calculator, color: 'text-green-600', bg: 'bg-green-50 dark:bg-green-900/30' },
                  { label: 'Total Payable', value: fmtCurrency(amortResult.totalPayable), icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-50 dark:bg-purple-900/30' },
                  { label: 'Total Interest', value: fmtCurrency(amortResult.totalInterest), icon: Percent, color: 'text-orange-600', bg: 'bg-orange-50 dark:bg-orange-900/30' },
                ].map((stat, i) => (
                  <Card key={i} className="stat-mini-card">
                    <CardContent className="p-3 flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${stat.bg} ${stat.color}`}>
                        <stat.icon className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">{stat.value}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Amortization Schedule Table */}
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                    <h4 className="font-semibold text-slate-900 dark:text-white">
                      Schedule ({amortResult.duration} months @ {amortResult.annualRate}%)
                    </h4>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={exportAmortCSV}>
                        <FileDown className="w-4 h-4 mr-1" />CSV
                      </Button>
                      <Button variant="outline" size="sm" onClick={exportAmortPDF}>
                        <FileDown className="w-4 h-4 mr-1" />PDF
                      </Button>
                    </div>
                  </div>
                  <div className="table-container overflow-x-auto overflow-y-auto max-h-96 rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-muted/50">
                          <TableHead className="text-right">#</TableHead>
                          <TableHead className="text-right">Opening</TableHead>
                          <TableHead className="text-right">Installment</TableHead>
                          <TableHead className="text-right">Interest</TableHead>
                          <TableHead className="text-right">Principal</TableHead>
                          <TableHead className="text-right">Closing</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {amortResult.schedule.map((row: any) => (
                          <TableRow key={row.month} className="data-table-row hover:bg-muted/50">
                            <TableCell className="text-right font-mono text-xs">{row.month}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtNumber(row.openingBalance)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtNumber(row.installment)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtNumber(row.interestComponent)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtNumber(row.principalComponent)}</TableCell>
                            <TableCell className="text-right font-mono text-xs">{fmtNumber(row.closingBalance)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Totals row */}
                  <div className="mt-2 grid grid-cols-6 gap-1 text-xs font-bold text-slate-900 dark:text-white bg-muted/30 rounded p-2">
                    <div className="text-right">Total</div>
                    <div></div>
                    <div className="text-right font-mono">{fmtNumber(amortResult.schedule.reduce((s: number, r: any) => s + r.installment, 0))}</div>
                    <div className="text-right font-mono">{fmtNumber(amortResult.totalInterest)}</div>
                    <div className="text-right font-mono">{fmtNumber(amortResult.netPrincipal)}</div>
                    <div></div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════
          CRUD DIALOG — Create / Edit Rate
      ════════════════════════════════════════════════════════ */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editItem ? 'Edit' : 'Create'} Interest Rate</DialogTitle>
            <DialogDescription>
              {editItem ? 'Modify the interest rate configuration.' : 'Define a new interest rate for Hire Sales calculation.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Code — Auto-generated, read-only */}
              <div className="space-y-1.5">
                <Label>Code</Label>
                <Input
                  className="bg-muted cursor-not-allowed"
                  value={editItem ? editItem.code : 'Auto-generated'}
                  readOnly
                  placeholder="Auto-generated"
                />
              </div>

              {/* Percentage */}
              <div className="space-y-1.5">
                <Label>Percentage <span className="text-red-500">*</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0.00"
                  value={formData.percentage}
                  onChange={e => setFormData(prev => ({ ...prev, percentage: e.target.value }))}
                />
              </div>

              {/* Type */}
              <div className="space-y-1.5">
                <Label>Type <span className="text-red-500">*</span></Label>
                <Select
                  value={formData.type}
                  onValueChange={v => setFormData(prev => ({ ...prev, type: v as RateType }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {RATE_TYPES.map(t => (
                      <SelectItem key={t} value={t}>{RATE_TYPE_LABELS[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Effective Date */}
              <div className="space-y-1.5">
                <Label>Effective Date <span className="text-red-500">*</span></Label>
                <Input
                  type="date"
                  value={formData.effectiveDate}
                  onChange={e => setFormData(prev => ({ ...prev, effectiveDate: e.target.value }))}
                />
              </div>

              {/* Expiry Date */}
              <div className="space-y-1.5">
                <Label>Expiry Date</Label>
                <Input
                  type="date"
                  value={formData.expiryDate}
                  onChange={e => setFormData(prev => ({ ...prev, expiryDate: e.target.value }))}
                />
              </div>

              {/* Minimum Amount */}
              <div className="space-y-1.5">
                <Label>Minimum Amount</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={formData.minimumAmount}
                  onChange={e => setFormData(prev => ({ ...prev, minimumAmount: e.target.value }))}
                />
              </div>

              {/* Maximum Amount */}
              <div className="space-y-1.5">
                <Label>Maximum Amount <span className="text-xs text-muted-foreground">(0 = unlimited)</span></Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0"
                  value={formData.maximumAmount}
                  onChange={e => setFormData(prev => ({ ...prev, maximumAmount: e.target.value }))}
                />
              </div>

              {/* Minimum Duration */}
              <div className="space-y-1.5">
                <Label>Minimum Duration (months)</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.durationMonthsMin}
                  onChange={e => setFormData(prev => ({ ...prev, durationMonthsMin: e.target.value }))}
                />
              </div>

              {/* Maximum Duration */}
              <div className="space-y-1.5">
                <Label>Maximum Duration (months) <span className="text-xs text-muted-foreground">(0 = unlimited)</span></Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.durationMonthsMax}
                  onChange={e => setFormData(prev => ({ ...prev, durationMonthsMax: e.target.value }))}
                />
              </div>

              {/* Active */}
              <div className="space-y-1.5 flex items-center gap-2 pt-6">
                <Checkbox
                  id="rate-active"
                  checked={formData.isActive}
                  onCheckedChange={(checked) =>
                    setFormData(prev => ({ ...prev, isActive: checked === true }))
                  }
                />
                <Label htmlFor="rate-active" className="cursor-pointer">Active</Label>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                placeholder="Optional description..."
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: sanitizeXSS(e.target.value) }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button
              className="bg-[#2563eb] hover:bg-[#1d4ed8]"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-1" />
              )}
              {editItem ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════════════════════════════════════════════════
          DELETE CONFIRMATION DIALOG
      ════════════════════════════════════════════════════════ */}
      <Dialog open={!!deleteItem} onOpenChange={() => setDeleteItem(null)}>
        <DialogContent className="max-w-[95vw] sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <XCircle className="w-5 h-5 text-red-500" />
              Delete Interest Rate
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to deactivate rate <strong>{deleteItem?.code}</strong>?
              The rate will be marked as inactive and can be reactivated later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteItem(null)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteDisabled}
            >
              {deleteDisabled && !isAdmin ? 'Admin Only' : 'Deactivate'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
