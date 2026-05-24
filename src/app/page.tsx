"use client";

import React, { useState, useCallback, useMemo } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import {
  LayoutDashboard, Package, ShoppingCart, FileText, Receipt,
  Users, UserCheck, Building2, Truck, BarChart3, Settings,
  Sun, Moon, Menu, X, ChevronDown, ChevronRight, DollarSign,
  TrendingUp, TrendingDown, Warehouse, CreditCard, Phone,
  ArrowRightLeft, RefreshCcw, ClipboardList, Mail, Search,
  Plus, Pencil, Trash2, Download, Upload, FileDown, Eye,
  CheckCircle, AlertTriangle, Box, Banknote, Layers,
  Palette, Grid3X3, Gauge, UserPlus, Building, PhoneCall,
  ArrowUpRight, ArrowDownRight, Activity, ShoppingCart as CartIcon,
  FileSpreadsheet, FileText as FileTextIcon, Bell, LogOut, User,
  Calendar, Clock, Zap, Target, BarChart, PieChart as PieChartIcon,
  CircleDollarSign, Wallet, ShoppingBag, Tag, Hash, Award
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { BarChart as RechartsBarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area, Legend } from "recharts";

// ============================================================
// TYPES
// ============================================================

type PageKey =
  | "dashboard"
  | "companies" | "categories" | "colors" | "banks" | "departments"
  | "godowns" | "interest" | "segments" | "capacities" | "sr-targets"
  | "payment-options" | "card-types" | "card-type-setup"
  | "investment-heads" | "assets" | "liabilities"
  | "products"
  | "designations" | "employees" | "employee-leaves"
  | "customers" | "suppliers"
  | "order-sheets" | "purchase-orders" | "auto-po"
  | "sales-orders" | "hire-sales" | "sales-returns" | "purchase-returns"
  | "replacements" | "stock" | "stock-details" | "transfers"
  | "expense-income-heads" | "expenses" | "cash-collections"
  | "cash-deliveries" | "incomes" | "bank-transactions"
  | "sms-settings" | "send-sms" | "sms-inbox" | "sms-bills"
  | "sms-bill-payments" | "sms-reports" | "bulk-sms"
  | "cash-in-hand" | "trial-balance" | "profit-loss" | "balance-sheet"
  | "basic-report" | "purchase-report" | "sales-report"
  | "hire-sales-report" | "sr-report" | "customer-wise-report"
  | "advance-search" | "bank-report" | "transfer-report";

interface SidebarGroup {
  label: string;
  icon: React.ReactNode;
  items: { key: PageKey; label: string; icon: React.ReactNode }[];
}

// ============================================================
// SIDEBAR NAVIGATION CONFIG
// ============================================================

const sidebarGroups: SidebarGroup[] = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard className="h-4 w-4" />,
    items: [
      { key: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="h-4 w-4" /> },
    ],
  },
  {
    label: "Investment",
    icon: <TrendingUp className="h-4 w-4" />,
    items: [
      { key: "investment-heads", label: "Investment Heads", icon: <Layers className="h-4 w-4" /> },
      { key: "assets", label: "Assets", icon: <TrendingUp className="h-4 w-4" /> },
      { key: "liabilities", label: "Liabilities", icon: <TrendingDown className="h-4 w-4" /> },
    ],
  },
  {
    label: "Basic Setup",
    icon: <Settings className="h-4 w-4" />,
    items: [
      { key: "companies", label: "Companies", icon: <Building2 className="h-4 w-4" /> },
      { key: "categories", label: "Categories", icon: <Grid3X3 className="h-4 w-4" /> },
      { key: "colors", label: "Colors", icon: <Palette className="h-4 w-4" /> },
      { key: "banks", label: "Banks", icon: <Banknote className="h-4 w-4" /> },
      { key: "departments", label: "Departments", icon: <Building className="h-4 w-4" /> },
      { key: "godowns", label: "Godowns", icon: <Warehouse className="h-4 w-4" /> },
      { key: "interest", label: "Interest %", icon: <Percent className="h-4 w-4" /> },
      { key: "segments", label: "Segments", icon: <Layers className="h-4 w-4" /> },
      { key: "capacities", label: "Capacities", icon: <Gauge className="h-4 w-4" /> },
      { key: "sr-targets", label: "SR Targets", icon: <TrendingUp className="h-4 w-4" /> },
      { key: "payment-options", label: "Payment Options", icon: <CreditCard className="h-4 w-4" /> },
      { key: "card-types", label: "Card Types", icon: <CreditCard className="h-4 w-4" /> },
      { key: "card-type-setup", label: "Card Type Setup", icon: <Settings className="h-4 w-4" /> },
    ],
  },
  {
    label: "Products",
    icon: <Package className="h-4 w-4" />,
    items: [
      { key: "products", label: "Products", icon: <Package className="h-4 w-4" /> },
    ],
  },
  {
    label: "Staff",
    icon: <UserCheck className="h-4 w-4" />,
    items: [
      { key: "designations", label: "Designations", icon: <UserPlus className="h-4 w-4" /> },
      { key: "employees", label: "Employees", icon: <Users className="h-4 w-4" /> },
      { key: "employee-leaves", label: "Employee Leaves", icon: <FileText className="h-4 w-4" /> },
    ],
  },
  {
    label: "Customers & Suppliers",
    icon: <Users className="h-4 w-4" />,
    items: [
      { key: "customers", label: "Customers", icon: <Users className="h-4 w-4" /> },
      { key: "suppliers", label: "Suppliers", icon: <Truck className="h-4 w-4" /> },
    ],
  },
  {
    label: "Inventory",
    icon: <Warehouse className="h-4 w-4" />,
    items: [
      { key: "order-sheets", label: "Order Sheets", icon: <ClipboardList className="h-4 w-4" /> },
      { key: "purchase-orders", label: "Purchase Orders", icon: <ShoppingCart className="h-4 w-4" /> },
      { key: "auto-po", label: "Auto PO", icon: <RefreshCcw className="h-4 w-4" /> },
      { key: "sales-orders", label: "Sales Orders", icon: <CartIcon className="h-4 w-4" /> },
      { key: "hire-sales", label: "Hire Sales", icon: <ArrowUpRight className="h-4 w-4" /> },
      { key: "sales-returns", label: "Sales Returns", icon: <ArrowDownRight className="h-4 w-4" /> },
      { key: "purchase-returns", label: "Purchase Returns", icon: <ArrowDownRight className="h-4 w-4" /> },
      { key: "replacements", label: "Replacements", icon: <RefreshCcw className="h-4 w-4" /> },
      { key: "stock", label: "Stock", icon: <Box className="h-4 w-4" /> },
      { key: "stock-details", label: "Stock Details", icon: <Eye className="h-4 w-4" /> },
      { key: "transfers", label: "Transfers", icon: <ArrowRightLeft className="h-4 w-4" /> },
    ],
  },
  {
    label: "Accounts",
    icon: <DollarSign className="h-4 w-4" />,
    items: [
      { key: "expense-income-heads", label: "Exp/Inc Heads", icon: <Layers className="h-4 w-4" /> },
      { key: "expenses", label: "Expenses", icon: <TrendingDown className="h-4 w-4" /> },
      { key: "cash-collections", label: "Cash Collections", icon: <DollarSign className="h-4 w-4" /> },
      { key: "cash-deliveries", label: "Cash Deliveries", icon: <Banknote className="h-4 w-4" /> },
      { key: "incomes", label: "Incomes", icon: <TrendingUp className="h-4 w-4" /> },
      { key: "bank-transactions", label: "Bank Transactions", icon: <Banknote className="h-4 w-4" /> },
    ],
  },
  {
    label: "SMS Service",
    icon: <Phone className="h-4 w-4" />,
    items: [
      { key: "sms-settings", label: "SMS Settings", icon: <Settings className="h-4 w-4" /> },
      { key: "send-sms", label: "Send SMS", icon: <PhoneCall className="h-4 w-4" /> },
      { key: "sms-inbox", label: "SMS Inbox", icon: <Mail className="h-4 w-4" /> },
      { key: "sms-bills", label: "SMS Bills", icon: <Receipt className="h-4 w-4" /> },
      { key: "sms-bill-payments", label: "SMS Bill Payments", icon: <DollarSign className="h-4 w-4" /> },
      { key: "sms-reports", label: "SMS Reports", icon: <BarChart3 className="h-4 w-4" /> },
      { key: "bulk-sms", label: "Bulk SMS", icon: <Phone className="h-4 w-4" /> },
    ],
  },
  {
    label: "Accounting Reports",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    items: [
      { key: "cash-in-hand", label: "Cash in Hand", icon: <Banknote className="h-4 w-4" /> },
      { key: "trial-balance", label: "Trial Balance", icon: <FileSpreadsheet className="h-4 w-4" /> },
      { key: "profit-loss", label: "Profit & Loss", icon: <BarChart3 className="h-4 w-4" /> },
      { key: "balance-sheet", label: "Balance Sheet", icon: <FileTextIcon className="h-4 w-4" /> },
    ],
  },
  {
    label: "MIS Reports",
    icon: <BarChart3 className="h-4 w-4" />,
    items: [
      { key: "basic-report", label: "Basic Report", icon: <Activity className="h-4 w-4" /> },
      { key: "purchase-report", label: "Purchase Report", icon: <ShoppingCart className="h-4 w-4" /> },
      { key: "sales-report", label: "Sales Report", icon: <CartIcon className="h-4 w-4" /> },
      { key: "hire-sales-report", label: "Hire Sales Report", icon: <ArrowUpRight className="h-4 w-4" /> },
      { key: "sr-report", label: "SR Report", icon: <UserCheck className="h-4 w-4" /> },
      { key: "customer-wise-report", label: "Customer Report", icon: <Users className="h-4 w-4" /> },
    ],
  },
  {
    label: "Management",
    icon: <Search className="h-4 w-4" />,
    items: [
      { key: "advance-search", label: "Advance Search", icon: <Search className="h-4 w-4" /> },
      { key: "bank-report", label: "Bank Report", icon: <Banknote className="h-4 w-4" /> },
      { key: "transfer-report", label: "Transfer Report", icon: <ArrowRightLeft className="h-4 w-4" /> },
    ],
  },
];

// ============================================================
// HELPER: Percent icon (missing from lucide)
// ============================================================
function Percent({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="19" x2="5" y1="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

// ============================================================
// DATA TABLE COMPONENT
// ============================================================

interface Column<T> {
  key: string;
  label: string;
  render?: (item: T) => React.ReactNode;
}

interface DataTableProps<T> {
  title: string;
  columns: Column<T>[];
  data: T[];
  onAdd?: () => void;
  onEdit?: (item: T) => void;
  onDelete?: (item: T) => void;
  onImport?: () => void;
  onExportCSV?: () => void;
  onExportPDF?: () => void;
  searchPlaceholder?: string;
  addLabel?: string;
}

function DataTable<T extends Record<string, unknown>>({
  title,
  columns,
  data,
  onAdd,
  onEdit,
  onDelete,
  onImport,
  onExportCSV,
  onExportPDF,
  searchPlaceholder = "Search...",
  addLabel = "Add New",
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return data;
    const lower = search.toLowerCase();
    return data.filter((item) =>
      columns.some((col) => {
        const val = item[col.key];
        return val !== undefined && val !== null && String(val).toLowerCase().includes(lower);
      })
    );
  }, [data, search, columns]);

  return (
    <Card className="border-border shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-slate-900 dark:text-white text-lg flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              {title}
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400 mt-0.5">
              {filtered.length} record(s) found
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {onImport && (
              <Button variant="outline" size="sm" onClick={onImport} className="text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-400 hover:border-emerald-300 dark:hover:border-emerald-700">
                <Upload className="h-4 w-4 mr-1.5" /> Import
              </Button>
            )}
            {onExportCSV && (
              <Button variant="outline" size="sm" onClick={onExportCSV} className="text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-sky-50 dark:hover:bg-sky-900/20 hover:text-sky-700 dark:hover:text-sky-400 hover:border-sky-300 dark:hover:border-sky-700">
                <FileDown className="h-4 w-4 mr-1.5" /> CSV
              </Button>
            )}
            {onExportPDF && (
              <Button variant="outline" size="sm" onClick={onExportPDF} className="text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-700 dark:hover:text-rose-400 hover:border-rose-300 dark:hover:border-rose-700">
                <FileText className="h-4 w-4 mr-1.5" /> PDF
              </Button>
            )}
            {onAdd && (
              <Button size="sm" onClick={onAdd} className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm btn-hover-scale">
                <Plus className="h-4 w-4 mr-1.5" /> {addLabel}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
            <Input
              placeholder={searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-white dark:bg-navy-900/50 border-slate-200 dark:border-slate-700 focus:ring-2 focus:ring-primary/30"
            />
          </div>
          {search && (
            <Button variant="ghost" size="sm" onClick={() => setSearch("")} className="text-slate-500 dark:text-slate-400">
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          )}
        </div>
        <div className="table-container rounded-lg border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-navy-900/70 dark:to-navy-900/50 border-b border-border">
                {columns.map((col) => (
                  <TableHead key={col.key} className="text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">
                    {col.label}
                  </TableHead>
                ))}
                {(onEdit || onDelete) && (
                  <TableHead className="text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider text-right w-24">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + (onEdit || onDelete ? 1 : 0)} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                      <p className="text-slate-500 dark:text-slate-400 text-sm">No records found</p>
                      {search && <p className="text-slate-400 dark:text-slate-500 text-xs">Try adjusting your search query</p>}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item, idx) => (
                  <TableRow key={idx} className="data-table-row hover:bg-slate-50/80 dark:hover:bg-navy-800/40 border-b border-border/50 even:bg-slate-50/30 dark:even:bg-navy-900/20">
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-slate-700 dark:text-slate-300 text-sm">
                        {col.render ? col.render(item) : (() => {
                          const val = item[col.key];
                          if (val === null || val === undefined) return <span className="text-slate-400 dark:text-slate-600">—</span>;
                          if (typeof val === "object") {
                            const obj = val as Record<string, unknown>;
                            return String(obj.name ?? obj.title ?? JSON.stringify(val));
                          }
                          return String(val);
                        })()}
                      </TableCell>
                    ))}
                    {(onEdit || onDelete) && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {onEdit && (
                            <Button variant="ghost" size="sm" onClick={() => onEdit(item)} className="h-8 w-8 p-0 text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md" title="Edit">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button variant="ghost" size="sm" onClick={() => onDelete(item)} className="h-8 w-8 p-0 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md" title="Delete">
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
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
  );
}

// ============================================================
// STATUS BADGE
// ============================================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; className: string; dot: string }> = {
    "Active": { variant: "default", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500" },
    "Approved": { variant: "default", className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800", dot: "bg-emerald-500" },
    "Confirmed": { variant: "default", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 border-blue-200 dark:border-blue-800", dot: "bg-blue-500" },
    "Completed": { variant: "default", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800", dot: "bg-green-500" },
    "Delivered": { variant: "default", className: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300 border-green-200 dark:border-green-800", dot: "bg-green-500" },
    "Sent": { variant: "default", className: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300 border-sky-200 dark:border-sky-800", dot: "bg-sky-500" },
    "Pending": { variant: "secondary", className: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 border-amber-200 dark:border-amber-800", dot: "bg-amber-500" },
    "Draft": { variant: "secondary", className: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-slate-200 dark:border-slate-700", dot: "bg-slate-500" },
    "Partial": { variant: "secondary", className: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border-orange-200 dark:border-orange-800", dot: "bg-orange-500" },
    "Unpaid": { variant: "destructive", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800", dot: "bg-red-500" },
    "Failed": { variant: "destructive", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800", dot: "bg-red-500" },
    "Cancelled": { variant: "destructive", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800", dot: "bg-red-500" },
    "Rejected": { variant: "destructive", className: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 border-red-200 dark:border-red-800", dot: "bg-red-500" },
    "Returned": { variant: "outline", className: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300 border-purple-200 dark:border-purple-800", dot: "bg-purple-500" },
    "Processing": { variant: "secondary", className: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800", dot: "bg-indigo-500" },
  };
  const c = config[status] || { variant: "outline" as const, className: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-slate-200 dark:border-slate-700", dot: "bg-slate-400" };
  return (
    <Badge variant={c.variant} className={`${c.className} text-xs font-medium border inline-flex items-center gap-1.5 px-2 py-0.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </Badge>
  );
}

// ============================================================
// DASHBOARD PAGE
// ============================================================

function DashboardPage() {
  const [stats, setStats] = useState({
    totalProducts: 0, totalCategories: 0, totalCustomers: 0, totalSuppliers: 0,
    todaySales: 0, todayPurchase: 0, stockValue: 0, cashBalance: 0,
    pendingPO: 0, pendingSO: 0, totalExpenses: 0, totalIncome: 0,
  });
  const [loading, setLoading] = useState(true);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);

  React.useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
    fetch("/api/sales-orders?limit=5")
      .then((r) => r.json())
      .then((d) => { setRecentSales(Array.isArray(d) ? d.slice(0, 5) : []); })
      .catch(() => {});
    fetch("/api/stock")
      .then((r) => r.json())
      .then((d) => {
        const low = Array.isArray(d) ? d.filter((p: any) => Number(p.currentStock) < 10).slice(0, 5) : [];
        setLowStockProducts(low);
      })
      .catch(() => {});
  }, []);

  // Chart data
  const monthlyData = [
    { month: "Jan", sales: 45000, purchase: 32000, expense: 8000 },
    { month: "Feb", sales: 52000, purchase: 38000, expense: 9500 },
    { month: "Mar", sales: 48000, purchase: 35000, expense: 7200 },
    { month: "Apr", sales: 61000, purchase: 42000, expense: 11000 },
    { month: "May", sales: 55000, purchase: 39000, expense: 8800 },
    { month: "Jun", sales: 67000, purchase: 45000, expense: 12300 },
    { month: "Jul", sales: 72000, purchase: 48000, expense: 10500 },
    { month: "Aug", sales: 63000, purchase: 41000, expense: 9800 },
    { month: "Sep", sales: 78000, purchase: 52000, expense: 13200 },
    { month: "Oct", sales: 85000, purchase: 55000, expense: 14100 },
    { month: "Nov", sales: 91000, purchase: 58000, expense: 15600 },
    { month: "Dec", sales: 98000, purchase: 62000, expense: 16800 },
  ];

  const categoryData = [
    { name: "Electronics", value: 35, color: "#2563eb" },
    { name: "Mobile", value: 25, color: "#16a34a" },
    { name: "Computer", value: 20, color: "#ea580c" },
    { name: "Accessories", value: 15, color: "#9333ea" },
    { name: "Home Appliance", value: 5, color: "#e11d48" },
  ];

  const topProductsData = [
    { name: "LED TV 42\"", sold: 45 },
    { name: "Smartphone X", sold: 38 },
    { name: "Laptop Pro", sold: 32 },
    { name: "Bluetooth Speaker", sold: 28 },
    { name: "Wireless Mouse", sold: 24 },
    { name: "USB Cable", sold: 20 },
  ];

  const cards = [
    { title: "Total Products", value: stats.totalProducts, icon: <Package className="h-6 w-6" />, gradient: "from-blue-500 to-blue-700", trend: "+12%", description: "Active items" },
    { title: "Today's Sales", value: `৳${stats.todaySales.toLocaleString()}`, icon: <TrendingUp className="h-6 w-6" />, gradient: "from-green-500 to-emerald-700", trend: "+8%", description: "Revenue" },
    { title: "Today's Purchase", value: `৳${stats.todayPurchase.toLocaleString()}`, icon: <ShoppingCart className="h-6 w-6" />, gradient: "from-orange-500 to-amber-700", trend: "-3%", description: "Cost" },
    { title: "Stock Value", value: `৳${stats.stockValue.toLocaleString()}`, icon: <Box className="h-6 w-6" />, gradient: "from-purple-500 to-violet-700", trend: "+5%", description: "Inventory" },
    { title: "Cash Balance", value: `৳${stats.cashBalance.toLocaleString()}`, icon: <Banknote className="h-6 w-6" />, gradient: "from-emerald-500 to-teal-700", trend: "+2%", description: "Available" },
    { title: "Total Customers", value: stats.totalCustomers, icon: <Users className="h-6 w-6" />, gradient: "from-cyan-500 to-sky-700", trend: "+15%", description: "Active" },
    { title: "Total Suppliers", value: stats.totalSuppliers, icon: <Truck className="h-6 w-6" />, gradient: "from-amber-500 to-yellow-700", trend: "+4%", description: "Partners" },
    { title: "Total Expenses", value: `৳${stats.totalExpenses.toLocaleString()}`, icon: <TrendingDown className="h-6 w-6" />, gradient: "from-red-500 to-rose-700", trend: "+6%", description: "This month" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <LayoutDashboard className="h-6 w-6 text-primary" />
            Dashboard
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Welcome to Electronics Mart IMS — your business at a glance</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 flex items-center gap-1.5 py-1.5 px-3">
            <Calendar className="h-3.5 w-3.5" />
            {new Date().toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}
          </Badge>
          <Badge variant="outline" className="text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 flex items-center gap-1.5 py-1.5 px-3">
            <Clock className="h-3.5 w-3.5" />
            {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
          </Badge>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <Card key={i} className="kpi-card border-border overflow-hidden group">
            <CardContent className="p-0">
              <div className={`bg-gradient-to-br ${card.gradient} p-4 text-white relative overflow-hidden`}>
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-300" />
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/80">{card.title}</p>
                    <p className="text-2xl font-bold mt-1">
                      {loading ? (
                        <span className="inline-block w-20 h-7 bg-white/20 rounded shimmer" />
                      ) : card.value}
                    </p>
                  </div>
                  <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                    {card.icon}
                  </div>
                </div>
              </div>
              <div className="px-4 py-3 bg-card border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{card.description}</span>
                  <span className={`text-xs font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded ${card.trend.startsWith("+") ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30" : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30"}`}>
                    {card.trend.startsWith("+") ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                    {card.trend}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Sales Trend Chart */}
        <Card className="border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart className="h-5 w-5 text-primary" />
                  Sales vs Purchase Trend
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">Monthly comparison over the year</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData}>
                  <defs>
                    <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="purchaseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ea580c" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#ea580c" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                  <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                    formatter={(value: number) => [`৳${value.toLocaleString()}`, ""]}
                    labelStyle={{ color: "var(--foreground)" }}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="sales" stroke="#2563eb" fill="url(#salesGrad)" strokeWidth={2} name="Sales" />
                  <Area type="monotone" dataKey="purchase" stroke="#ea580c" fill="url(#purchaseGrad)" strokeWidth={2} name="Purchase" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Breakdown Pie */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Sales by Category
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Product category distribution</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                    formatter={(value: number) => [`${value}%`, ""]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {categoryData.map((cat, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">{cat.name} ({cat.value}%)</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Sales - now with real data */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <ShoppingBag className="h-5 w-5 text-green-500" />
              Recent Sales
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Latest transactions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentSales.length > 0 ? recentSales.map((sale: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-navy-900/30 border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-slate-900 dark:text-white">{sale.invoiceNo || `INV-${i + 1}`}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{sale.customer?.name || "Customer"}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">৳{Number(sale.grandTotal || 0).toLocaleString()}</p>
                    <StatusBadge status={sale.status || "Draft"} />
                  </div>
                </div>
              )) : (
                // Fallback placeholder data
                [
                  { inv: "INV-001", customer: "Rahim Electronics", amount: "৳15,000", status: "Completed" },
                  { inv: "INV-002", customer: "Karim Store", amount: "৳8,500", status: "Pending" },
                  { inv: "INV-003", customer: "Delta Traders", amount: "৳22,300", status: "Confirmed" },
                  { inv: "INV-004", customer: "Nova Tech", amount: "৳5,200", status: "Draft" },
                ].map((sale, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-navy-900/30 border border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                        <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-900 dark:text-white">{sale.inv}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{sale.customer}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-sm text-slate-900 dark:text-white">{sale.amount}</p>
                      <StatusBadge status={sale.status} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Low Stock Alerts - now with real data */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Low Stock Alerts
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Items below reorder level</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {lowStockProducts.length > 0 ? lowStockProducts.map((item: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <Box className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-slate-900 dark:text-white">{item.productName}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">Stock: {item.currentStock}</p>
                    </div>
                  </div>
                  <Badge variant="destructive" className="text-xs">Low</Badge>
                </div>
              )) : (
                // Fallback placeholder
                [
                  { product: "LED TV 42\"", stock: 3, reorder: 10 },
                  { product: "Bluetooth Speaker", stock: 5, reorder: 15 },
                  { product: "USB Cable Type-C", stock: 2, reorder: 50 },
                  { product: "Power Bank 10000mAh", stock: 8, reorder: 25 },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                        <Box className="h-4 w-4 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <p className="font-medium text-sm text-slate-900 dark:text-white">{item.product}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">In Stock: {item.stock} | Reorder: {item.reorder}</p>
                      </div>
                    </div>
                    <Badge variant="destructive" className="text-xs">Low</Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Top Products Bar Chart */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <Zap className="h-5 w-5 text-amber-500" />
              Top Selling Products
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Best performing items</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={topProductsData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={100} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                  />
                  <Bar dataKey="sold" fill="#2563eb" radius={[0, 4, 4, 0]} name="Units Sold" />
                </RechartsBarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card className="border-border bg-gradient-to-r from-navy-950 to-navy-900 text-white">
        <CardContent className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2"><Zap className="h-5 w-5 text-amber-400" /> Quick Actions</h3>
              <p className="text-navy-300 text-sm mt-1">Jump to frequently used operations</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" className="bg-primary hover:bg-primary/90 text-white gap-1.5">
                <Plus className="h-4 w-4" /> New Sale
              </Button>
              <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1.5">
                <ShoppingCart className="h-4 w-4" /> New Purchase
              </Button>
              <Button size="sm" className="bg-amber-600 hover:bg-amber-700 text-white gap-1.5">
                <Package className="h-4 w-4" /> Add Product
              </Button>
              <Button size="sm" variant="outline" className="border-navy-600 text-navy-200 hover:bg-navy-800 gap-1.5">
                <BarChart3 className="h-4 w-4" /> View Reports
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// GENERIC MODULE PAGE (for simple CRUD modules)
// ============================================================

interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "date" | "textarea" | "color" | "checkbox";
  options?: { value: string; label: string }[];
  required?: boolean;
  placeholder?: string;
}

interface ModuleConfig {
  title: string;
  apiPath: string;
  fields: FieldDef[];
  columns: Column<Record<string, unknown>>[];
}

// Smart singularization helper
function singularize(word: string): string {
  const irregulars: Record<string, string> = {
    "Companies": "Company", "Categories": "Category", "Colors": "Color",
    "Banks": "Bank", "Departments": "Department", "Godowns": "Godown",
    "Capacities": "Capacity", "Segments": "Segment", "Assets": "Asset",
    "Liabilities": "Liability", "Designations": "Designation",
    "Employees": "Employee", "Incomes": "Income", "Expenses": "Expense",
    "Customers": "Customer", "Suppliers": "Supplier",
    "Investment Heads": "Investment Head", "Expense/Income Heads": "Head",
    "Card Types": "Card Type", "Payment Options": "Payment Option",
    "Interest Percentages": "Interest Percentage",
    "Cash Collections": "Cash Collection", "Cash Deliveries": "Cash Delivery",
    "Bank Transactions": "Bank Transaction", "SMS Settings": "SMS Setting",
  };
  if (irregulars[word]) return irregulars[word];
  if (word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.endsWith("es")) return word.slice(0, -2);
  if (word.endsWith("s")) return word.slice(0, -1);
  return word;
}

function GenericModulePage({ config }: { config: ModuleConfig }) {
  const { toast } = useToast();
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [importOpen, setImportOpen] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch(`/api/${config.apiPath}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [config.apiPath]);

  React.useEffect(() => { loadData(); }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    const defaults: Record<string, unknown> = {};
    config.fields.forEach((f) => {
      if (f.type === "checkbox") defaults[f.key] = true;
      else if (f.type === "number") defaults[f.key] = 0;
      else defaults[f.key] = "";
    });
    setForm(defaults);
    setDialogOpen(true);
  };

  const openEdit = (item: Record<string, unknown>) => {
    setEditing(item);
    setForm({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const url = editing?.id ? `/api/${config.apiPath}/${editing.id}` : `/api/${config.apiPath}`;
      const method = editing?.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: editing?.id ? "Updated" : "Created", description: "Record saved successfully" });
      setDialogOpen(false);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to save record", variant: "destructive" });
    }
  };

  const handleDelete = async (item: Record<string, unknown>) => {
    if (!confirm("Are you sure you want to delete this record?")) return;
    try {
      const res = await fetch(`/api/${config.apiPath}/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      toast({ title: "Deleted", description: "Record deleted successfully" });
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to delete record", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = config.columns.map((c) => c.label).join(",");
    const rows = data.map((item) =>
      config.columns.map((c) => {
        const val = item[c.key];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") {
          const obj = val as Record<string, unknown>;
          const resolved = String(obj.name ?? obj.title ?? "");
          return resolved.includes(",") ? `"${resolved}"` : resolved;
        }
        return typeof val === "string" && val.includes(",") ? `"${val}"` : String(val);
      }).join(",")
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.apiPath}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(config.title, 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [config.columns.map((c) => c.label)],
      body: data.map((item) => config.columns.map((c) => {
        const val = item[c.key];
        if (val === null || val === undefined) return "";
        if (typeof val === "object") {
          const obj = val as Record<string, unknown>;
          return String(obj.name ?? obj.title ?? "");
        }
        return String(val);
      })),
      styles: { fontSize: 8 },
    });
    doc.save(`${config.apiPath}.pdf`);
  };

  const handleImportCSV = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const Papa = (await import("papaparse")).default;
      const result = Papa.parse(text, { header: true, skipEmptyLines: true });
      for (const row of result.data) {
        await fetch(`/api/${config.apiPath}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        });
      }
      toast({ title: "Imported", description: `${result.data.length} records imported` });
      loadData();
    };
    input.click();
  };

  return (
    <div className="space-y-4">
      <DataTable
        title={config.title}
        columns={config.columns}
        data={data}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        onImport={handleImportCSV}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
        addLabel={`Add ${singularize(config.title)}`}
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">
              {editing?.id ? `Edit ${singularize(config.title)}` : `Add ${singularize(config.title)}`}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {config.fields.map((field) => (
              <div key={field.key} className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">{field.label}</Label>
                {field.type === "select" ? (
                  <Select value={String(form[field.key] ?? "")} onValueChange={(v) => setForm({ ...form, [field.key]: v })}>
                    <SelectTrigger>
                      <SelectValue placeholder={field.placeholder || "Select..."} />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : field.type === "textarea" ? (
                  <Textarea
                    value={String(form[field.key] ?? "")}
                    onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                    placeholder={field.placeholder}
                  />
                ) : field.type === "color" ? (
                  <div className="flex gap-2 items-center">
                    <Input
                      type="color"
                      value={String(form[field.key] ?? "#000000")}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      className="w-12 h-10 p-1"
                    />
                    <Input
                      value={String(form[field.key] ?? "")}
                      onChange={(e) => setForm({ ...form, [field.key]: e.target.value })}
                      placeholder="#000000"
                    />
                  </div>
                ) : field.type === "checkbox" ? (
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={!!form[field.key]}
                      onCheckedChange={(v) => setForm({ ...form, [field.key]: v })}
                    />
                    <span className="text-sm text-slate-600 dark:text-slate-400">
                      {form[field.key] ? "Active" : "Inactive"}
                    </span>
                  </div>
                ) : (
                  <Input
                    type={field.type}
                    value={String(form[field.key] ?? "")}
                    onChange={(e) => setForm({ ...form, [field.key]: field.type === "number" ? Number(e.target.value) : e.target.value })}
                    placeholder={field.placeholder}
                  />
                )}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// MODULE CONFIGURATIONS
// ============================================================

const moduleConfigs: Partial<Record<PageKey, ModuleConfig>> = {
  companies: {
    title: "Companies",
    apiPath: "companies",
    fields: [
      { key: "name", label: "Company Name", type: "text", required: true, placeholder: "Enter company name" },
      { key: "address", label: "Address", type: "textarea", placeholder: "Enter address" },
      { key: "phone", label: "Phone", type: "text", placeholder: "Enter phone" },
      { key: "email", label: "Email", type: "text", placeholder: "Enter email" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Company Name" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  categories: {
    title: "Categories",
    apiPath: "categories",
    fields: [
      { key: "name", label: "Category Name", type: "text", required: true, placeholder: "Enter category name" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Category Name" },
      { key: "description", label: "Description" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  colors: {
    title: "Colors",
    apiPath: "colors",
    fields: [
      { key: "name", label: "Color Name", type: "text", required: true, placeholder: "Enter color name" },
      { key: "colorCode", label: "Color Code", type: "color", required: true },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Color Name" },
      { key: "colorCode", label: "Color Code", render: (item) => (
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded border" style={{ backgroundColor: String(item.colorCode) }} />
          <span>{String(item.colorCode)}</span>
        </div>
      )},
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  banks: {
    title: "Banks",
    apiPath: "banks",
    fields: [
      { key: "bankName", label: "Bank Name", type: "text", required: true, placeholder: "Enter bank name" },
      { key: "branch", label: "Branch", type: "text", placeholder: "Enter branch" },
      { key: "accountNo", label: "Account No", type: "text", required: true, placeholder: "Enter account number" },
      { key: "accountHolder", label: "Account Holder", type: "text", placeholder: "Enter account holder" },
      { key: "openingBalance", label: "Opening Balance", type: "number", placeholder: "0" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "bankName", label: "Bank Name" },
      { key: "branch", label: "Branch" },
      { key: "accountNo", label: "Account No" },
      { key: "accountHolder", label: "Account Holder" },
      { key: "openingBalance", label: "Opening Balance", render: (item) => `৳${Number(item.openingBalance).toLocaleString()}` },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  departments: {
    title: "Departments",
    apiPath: "departments",
    fields: [
      { key: "name", label: "Department Name", type: "text", required: true, placeholder: "Enter department name" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Department Name" },
      { key: "description", label: "Description" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  godowns: {
    title: "Godowns",
    apiPath: "godowns",
    fields: [
      { key: "name", label: "Godown Name", type: "text", required: true, placeholder: "Enter godown name" },
      { key: "address", label: "Address", type: "textarea", placeholder: "Enter address" },
      { key: "inCharge", label: "In-Charge", type: "text", placeholder: "Enter in-charge person" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Godown Name" },
      { key: "address", label: "Address" },
      { key: "inCharge", label: "In-Charge" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  interest: {
    title: "Interest Percentages",
    apiPath: "interest-percentages",
    fields: [
      { key: "percentage", label: "Percentage (%)", type: "number", required: true, placeholder: "0" },
      { key: "effectiveDate", label: "Effective Date", type: "date", required: true },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "percentage", label: "Percentage (%)" },
      { key: "effectiveDate", label: "Effective Date", render: (item) => item.effectiveDate ? new Date(String(item.effectiveDate)).toLocaleDateString() : "" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  segments: {
    title: "Segments",
    apiPath: "segments",
    fields: [
      { key: "name", label: "Segment Name", type: "text", required: true, placeholder: "Enter segment name" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Segment Name" },
      { key: "description", label: "Description" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  capacities: {
    title: "Capacities",
    apiPath: "capacities",
    fields: [
      { key: "name", label: "Capacity Name", type: "text", required: true, placeholder: "e.g., liters, kg" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Capacity Name" },
      { key: "description", label: "Description" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  "payment-options": {
    title: "Payment Options",
    apiPath: "payment-options",
    fields: [
      { key: "name", label: "Payment Method", type: "text", required: true, placeholder: "e.g., Cash, Card, bKash" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Payment Method" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  "card-types": {
    title: "Card Types",
    apiPath: "card-types",
    fields: [
      { key: "name", label: "Card Type", type: "text", required: true, placeholder: "e.g., Visa, MasterCard" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Card Type" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  "investment-heads": {
    title: "Investment Heads",
    apiPath: "investment-heads",
    fields: [
      { key: "name", label: "Head Name", type: "text", required: true, placeholder: "e.g., Fixed Deposit, Shares" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Head Name" },
      { key: "description", label: "Description" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  assets: {
    title: "Assets",
    apiPath: "assets",
    fields: [
      { key: "investmentHeadId", label: "Investment Head", type: "select", required: true, options: [] },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "amount", label: "Amount", type: "number", required: true, placeholder: "0" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "investmentHeadId", label: "Investment Head" },
      { key: "date", label: "Date", render: (item) => item.date ? new Date(String(item.date)).toLocaleDateString() : "" },
      { key: "amount", label: "Amount", render: (item) => `৳${Number(item.amount).toLocaleString()}` },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  liabilities: {
    title: "Liabilities",
    apiPath: "liabilities",
    fields: [
      { key: "investmentHeadId", label: "Investment Head", type: "select", required: true, options: [] },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "amount", label: "Amount", type: "number", required: true, placeholder: "0" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "investmentHeadId", label: "Investment Head" },
      { key: "date", label: "Date", render: (item) => item.date ? new Date(String(item.date)).toLocaleDateString() : "" },
      { key: "amount", label: "Amount", render: (item) => `৳${Number(item.amount).toLocaleString()}` },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  designations: {
    title: "Designations",
    apiPath: "designations",
    fields: [
      { key: "name", label: "Designation Name", type: "text", required: true, placeholder: "Enter designation name" },
      { key: "departmentId", label: "Department", type: "select", required: true, options: [] },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Designation" },
      { key: "departmentId", label: "Department" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  employees: {
    title: "Employees",
    apiPath: "employees",
    fields: [
      { key: "employeeCode", label: "Employee Code", type: "text", required: true, placeholder: "Auto-generated" },
      { key: "name", label: "Name", type: "text", required: true, placeholder: "Enter name" },
      { key: "designationId", label: "Designation", type: "select", required: true, options: [] },
      { key: "departmentId", label: "Department", type: "select", required: true, options: [] },
      { key: "joiningDate", label: "Joining Date", type: "date", required: true },
      { key: "phone", label: "Phone", type: "text", placeholder: "Enter phone" },
      { key: "address", label: "Address", type: "textarea", placeholder: "Enter address" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "employeeCode", label: "Code" },
      { key: "name", label: "Name" },
      { key: "joiningDate", label: "Joining Date", render: (item) => item.joiningDate ? new Date(String(item.joiningDate)).toLocaleDateString() : "" },
      { key: "phone", label: "Phone" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  "employee-leaves": {
    title: "Employee Leaves",
    apiPath: "employee-leaves",
    fields: [
      { key: "employeeId", label: "Employee", type: "select", required: true, options: [] },
      { key: "leaveType", label: "Leave Type", type: "select", required: true, options: [
        { value: "Casual", label: "Casual" }, { value: "Sick", label: "Sick" },
        { value: "Annual", label: "Annual" }, { value: "Maternity", label: "Maternity" },
      ]},
      { key: "fromDate", label: "From Date", type: "date", required: true },
      { key: "toDate", label: "To Date", type: "date", required: true },
      { key: "reason", label: "Reason", type: "textarea", placeholder: "Enter reason" },
      { key: "status", label: "Status", type: "select", options: [
        { value: "Pending", label: "Pending" }, { value: "Approved", label: "Approved" }, { value: "Rejected", label: "Rejected" },
      ]},
    ],
    columns: [
      { key: "employeeId", label: "Employee" },
      { key: "leaveType", label: "Leave Type" },
      { key: "fromDate", label: "From", render: (item) => item.fromDate ? new Date(String(item.fromDate)).toLocaleDateString() : "" },
      { key: "toDate", label: "To", render: (item) => item.toDate ? new Date(String(item.toDate)).toLocaleDateString() : "" },
      { key: "status", label: "Status", render: (item) => <StatusBadge status={String(item.status ?? "Pending")} /> },
    ],
  },
  customers: {
    title: "Customers",
    apiPath: "customers",
    fields: [
      { key: "customerCode", label: "Customer Code", type: "text", required: true, placeholder: "Auto-generated" },
      { key: "name", label: "Customer Name", type: "text", required: true, placeholder: "Enter customer name" },
      { key: "phone", label: "Phone", type: "text", placeholder: "Enter phone" },
      { key: "address", label: "Address", type: "textarea", placeholder: "Enter address" },
      { key: "openingBalance", label: "Opening Balance", type: "number", placeholder: "0" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "customerCode", label: "Code" },
      { key: "name", label: "Customer Name" },
      { key: "phone", label: "Phone" },
      { key: "openingBalance", label: "Opening Balance", render: (item) => `৳${Number(item.openingBalance).toLocaleString()}` },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  suppliers: {
    title: "Suppliers",
    apiPath: "suppliers",
    fields: [
      { key: "supplierCode", label: "Supplier Code", type: "text", required: true, placeholder: "Auto-generated" },
      { key: "name", label: "Supplier Name", type: "text", required: true, placeholder: "Enter supplier name" },
      { key: "phone", label: "Phone", type: "text", placeholder: "Enter phone" },
      { key: "address", label: "Address", type: "textarea", placeholder: "Enter address" },
      { key: "openingBalance", label: "Opening Balance", type: "number", placeholder: "0" },
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "supplierCode", label: "Code" },
      { key: "name", label: "Supplier Name" },
      { key: "phone", label: "Phone" },
      { key: "openingBalance", label: "Opening Balance", render: (item) => `৳${Number(item.openingBalance).toLocaleString()}` },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  "expense-income-heads": {
    title: "Expense/Income Heads",
    apiPath: "expense-income-heads",
    fields: [
      { key: "name", label: "Head Name", type: "text", required: true, placeholder: "Enter head name" },
      { key: "type", label: "Type", type: "select", required: true, options: [
        { value: "Expense", label: "Expense" }, { value: "Income", label: "Income" },
      ]},
      { key: "isActive", label: "Status", type: "checkbox" },
    ],
    columns: [
      { key: "name", label: "Head Name" },
      { key: "type", label: "Type", render: (item) => (
        <Badge variant={String(item.type) === "Income" ? "default" : "destructive"}>
          {String(item.type)}
        </Badge>
      )},
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
  expenses: {
    title: "Expenses",
    apiPath: "expenses",
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "headId", label: "Expense Head", type: "select", required: true, options: [] },
      { key: "amount", label: "Amount", type: "number", required: true, placeholder: "0" },
      { key: "paymentOptionId", label: "Payment Method", type: "select", options: [] },
      { key: "bankId", label: "Bank", type: "select", options: [] },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
    ],
    columns: [
      { key: "date", label: "Date", render: (item) => item.date ? new Date(String(item.date)).toLocaleDateString() : "" },
      { key: "headId", label: "Head" },
      { key: "amount", label: "Amount", render: (item) => `৳${Number(item.amount).toLocaleString()}` },
      { key: "description", label: "Description" },
    ],
  },
  incomes: {
    title: "Incomes",
    apiPath: "incomes",
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "headId", label: "Income Head", type: "select", required: true, options: [] },
      { key: "amount", label: "Amount", type: "number", required: true, placeholder: "0" },
      { key: "paymentOptionId", label: "Payment Method", type: "select", options: [] },
      { key: "bankId", label: "Bank", type: "select", options: [] },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
    ],
    columns: [
      { key: "date", label: "Date", render: (item) => item.date ? new Date(String(item.date)).toLocaleDateString() : "" },
      { key: "headId", label: "Head" },
      { key: "amount", label: "Amount", render: (item) => `৳${Number(item.amount).toLocaleString()}` },
      { key: "description", label: "Description" },
    ],
  },
  "cash-collections": {
    title: "Cash Collections",
    apiPath: "cash-collections",
    fields: [
      { key: "customerId", label: "Customer", type: "select", required: true, options: [] },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "amount", label: "Amount", type: "number", required: true, placeholder: "0" },
      { key: "paymentOptionId", label: "Payment Method", type: "select", options: [] },
      { key: "bankId", label: "Bank", type: "select", options: [] },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
    ],
    columns: [
      { key: "customerId", label: "Customer" },
      { key: "date", label: "Date", render: (item) => item.date ? new Date(String(item.date)).toLocaleDateString() : "" },
      { key: "amount", label: "Amount", render: (item) => `৳${Number(item.amount).toLocaleString()}` },
    ],
  },
  "cash-deliveries": {
    title: "Cash Deliveries",
    apiPath: "cash-deliveries",
    fields: [
      { key: "supplierId", label: "Supplier", type: "select", required: true, options: [] },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "amount", label: "Amount", type: "number", required: true, placeholder: "0" },
      { key: "paymentOptionId", label: "Payment Method", type: "select", options: [] },
      { key: "bankId", label: "Bank", type: "select", options: [] },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
    ],
    columns: [
      { key: "supplierId", label: "Supplier" },
      { key: "date", label: "Date", render: (item) => item.date ? new Date(String(item.date)).toLocaleDateString() : "" },
      { key: "amount", label: "Amount", render: (item) => `৳${Number(item.amount).toLocaleString()}` },
    ],
  },
  "bank-transactions": {
    title: "Bank Transactions",
    apiPath: "bank-transactions",
    fields: [
      { key: "bankId", label: "Bank", type: "select", required: true, options: [] },
      { key: "date", label: "Date", type: "date", required: true },
      { key: "type", label: "Type", type: "select", required: true, options: [
        { value: "Deposit", label: "Deposit" }, { value: "Withdraw", label: "Withdraw" },
      ]},
      { key: "amount", label: "Amount", type: "number", required: true, placeholder: "0" },
      { key: "description", label: "Description", type: "textarea", placeholder: "Enter description" },
    ],
    columns: [
      { key: "bankId", label: "Bank" },
      { key: "date", label: "Date", render: (item) => item.date ? new Date(String(item.date)).toLocaleDateString() : "" },
      { key: "type", label: "Type", render: (item) => (
        <Badge variant={String(item.type) === "Deposit" ? "default" : "destructive"}>
          {String(item.type)}
        </Badge>
      )},
      { key: "amount", label: "Amount", render: (item) => `৳${Number(item.amount).toLocaleString()}` },
    ],
  },
  "sms-settings": {
    title: "SMS Settings",
    apiPath: "sms-settings",
    fields: [
      { key: "apiUrl", label: "API URL", type: "text", required: true, placeholder: "https://api.sms-provider.com/send" },
      { key: "apiKey", label: "API Key", type: "text", required: true, placeholder: "Enter API key" },
      { key: "senderId", label: "Sender ID", type: "text", required: true, placeholder: "Enter sender ID" },
      { key: "isActive", label: "Active", type: "checkbox" },
    ],
    columns: [
      { key: "apiUrl", label: "API URL" },
      { key: "senderId", label: "Sender ID" },
      { key: "isActive", label: "Status", render: (item) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
    ],
  },
};

// ============================================================
// SPECIAL PAGES (non-generic)
// ============================================================

function ProductsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [colors, setColors] = useState<{ id: string; name: string }[]>([]);
  const [godowns, setGodowns] = useState<{ id: string; name: string }[]>([]);
  const [segments, setSegments] = useState<{ id: string; name: string }[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);

  const loadData = useCallback(() => {
    fetch("/api/products").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  React.useEffect(() => {
    loadData();
    fetch("/api/categories").then((r) => r.json()).then(setCategories).catch(() => {});
    fetch("/api/colors").then((r) => r.json()).then(setColors).catch(() => {});
    fetch("/api/godowns").then((r) => r.json()).then(setGodowns).catch(() => {});
    fetch("/api/segments").then((r) => r.json()).then(setSegments).catch(() => {});
    fetch("/api/companies").then((r) => r.json()).then(setCompanies).catch(() => {});
  }, [loadData]);

  const openAdd = () => {
    setEditing(null);
    setForm({ productCode: "", name: "", categoryId: "", colorId: "", unit: "Pcs", sizeCapacity: "", costPrice: 0, salePrice: 0, openingStock: 0, reorderLevel: 0, godownId: "", segmentId: "", companyId: "", isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (item: Record<string, unknown>) => {
    setEditing(item);
    setForm({ ...item });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const url = editing?.id ? `/api/products/${editing.id}` : "/api/products";
      const method = editing?.id ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Save failed");
      toast({ title: "Saved", description: "Product saved successfully" });
      setDialogOpen(false);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to save product", variant: "destructive" });
    }
  };

  const handleDelete = async (item: Record<string, unknown>) => {
    if (!confirm("Delete this product?")) return;
    try {
      await fetch(`/api/products/${item.id}`, { method: "DELETE" });
      toast({ title: "Deleted" });
      loadData();
    } catch {
      toast({ title: "Error", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "Code,Name,Category,Unit,Cost Price,Sale Price,Stock,Reorder Level";
    const rows = data.map((i) => `${i.productCode},${i.name},${i.categoryId},${i.unit},${i.costPrice},${i.salePrice},${i.openingStock},${i.reorderLevel}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "products.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Products", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Code", "Name", "Category", "Unit", "Cost", "Sale", "Stock", "Reorder"]],
      body: data.map((i) => [i.productCode, i.name, i.categoryId, i.unit, i.costPrice, i.salePrice, i.openingStock, i.reorderLevel]),
    });
    doc.save("products.pdf");
  };

  const columns = [
    { key: "productCode", label: "Code" },
    { key: "name", label: "Product Name" },
    { key: "categoryId", label: "Category", render: (item: Record<string, unknown>) => {
      const cat = item.category as Record<string, unknown> | undefined;
      return cat?.name ? String(cat.name) : String(item.categoryId ?? "");
    }},
    { key: "unit", label: "Unit" },
    { key: "costPrice", label: "Cost Price", render: (item: Record<string, unknown>) => `৳${Number(item.costPrice).toLocaleString()}` },
    { key: "salePrice", label: "Sale Price", render: (item: Record<string, unknown>) => `৳${Number(item.salePrice).toLocaleString()}` },
    { key: "openingStock", label: "Stock" },
    { key: "reorderLevel", label: "Reorder" },
    { key: "isActive", label: "Status", render: (item: Record<string, unknown>) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
  ];

  return (
    <div className="space-y-4">
      <DataTable title="Products" columns={columns} data={data} onAdd={openAdd} onEdit={openEdit} onDelete={handleDelete} onImport={() => {}} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} addLabel="Add Product" />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">
              {editing?.id ? "Edit Product" : "Add Product"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Product Code</Label>
              <Input value={String(form.productCode ?? "")} onChange={(e) => setForm({ ...form, productCode: e.target.value })} placeholder="Auto-generated" />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Name *</Label>
              <Input value={String(form.name ?? "")} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Product name" />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Category *</Label>
              <Select value={String(form.categoryId ?? "")} onValueChange={(v) => setForm({ ...form, categoryId: v })}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Color</Label>
              <Select value={String(form.colorId ?? "")} onValueChange={(v) => setForm({ ...form, colorId: v })}>
                <SelectTrigger><SelectValue placeholder="Select color" /></SelectTrigger>
                <SelectContent>
                  {colors.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Unit</Label>
              <Input value={String(form.unit ?? "Pcs")} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Size/Capacity</Label>
              <Input value={String(form.sizeCapacity ?? "")} onChange={(e) => setForm({ ...form, sizeCapacity: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Cost Price</Label>
              <Input type="number" value={Number(form.costPrice ?? 0)} onChange={(e) => setForm({ ...form, costPrice: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Sale Price</Label>
              <Input type="number" value={Number(form.salePrice ?? 0)} onChange={(e) => setForm({ ...form, salePrice: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Opening Stock</Label>
              <Input type="number" value={Number(form.openingStock ?? 0)} onChange={(e) => setForm({ ...form, openingStock: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Reorder Level</Label>
              <Input type="number" value={Number(form.reorderLevel ?? 0)} onChange={(e) => setForm({ ...form, reorderLevel: Number(e.target.value) })} />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Godown</Label>
              <Select value={String(form.godownId ?? "")} onValueChange={(v) => setForm({ ...form, godownId: v })}>
                <SelectTrigger><SelectValue placeholder="Select godown" /></SelectTrigger>
                <SelectContent>
                  {godowns.map((g) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Segment</Label>
              <Select value={String(form.segmentId ?? "")} onValueChange={(v) => setForm({ ...form, segmentId: v })}>
                <SelectTrigger><SelectValue placeholder="Select segment" /></SelectTrigger>
                <SelectContent>
                  {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Company</Label>
              <Select value={String(form.companyId ?? "")} onValueChange={(v) => setForm({ ...form, companyId: v })}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2 flex items-end">
              <div className="flex items-center gap-2">
                <Switch checked={!!form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
                <Label className="text-slate-700 dark:text-slate-300">{form.isActive ? "Active" : "Inactive"}</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Placeholder for complex pages
function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        <p className="text-slate-500 dark:text-slate-400">{description}</p>
      </div>
      <Card className="border-border">
        <CardContent className="p-8 text-center">
          <Package className="h-12 w-12 mx-auto text-slate-400 mb-4" />
          <p className="text-slate-600 dark:text-slate-400 text-lg">{title} module is ready</p>
          <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">{description}</p>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// BASIC REPORT PAGE
// ============================================================

function BasicReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch("/api/reports/basic")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const handleExportCSV = () => {
    if (!data) return;
    const headers = "Metric,Value";
    const rows = [
      `Sales Today,${data.salesToday}`,
      `Purchase Today,${data.purchaseToday}`,
      `Stock Value,${data.stockValue}`,
      `Cash Balance,${data.cashBalance}`,
      `Receivables,${data.receivables}`,
      `Payables,${data.payables}`,
    ];
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "basic-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Basic Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Metric", "Value"]],
      body: [
        ["Sales Today", `৳${(data?.salesToday || 0).toLocaleString()}`],
        ["Purchase Today", `৳${(data?.purchaseToday || 0).toLocaleString()}`],
        ["Stock Value", `৳${(data?.stockValue || 0).toLocaleString()}`],
        ["Cash Balance", `৳${(data?.cashBalance || 0).toLocaleString()}`],
        ["Receivables", `৳${(data?.receivables || 0).toLocaleString()}`],
        ["Payables", `৳${(data?.payables || 0).toLocaleString()}`],
      ],
    });
    doc.save("basic-report.pdf");
  };

  const kpiCards = data ? [
    { title: "Sales Today", value: `৳${data.salesToday.toLocaleString()}`, icon: <TrendingUp className="h-6 w-6" />, gradient: "from-green-500 to-emerald-700", trend: "+8%", description: "Revenue" },
    { title: "Purchase Today", value: `৳${data.purchaseToday.toLocaleString()}`, icon: <ShoppingCart className="h-6 w-6" />, gradient: "from-orange-500 to-amber-700", trend: "-3%", description: "Cost" },
    { title: "Stock Value", value: `৳${data.stockValue.toLocaleString()}`, icon: <Box className="h-6 w-6" />, gradient: "from-purple-500 to-violet-700", trend: "+5%", description: "Inventory" },
    { title: "Cash Balance", value: `৳${data.cashBalance.toLocaleString()}`, icon: <Banknote className="h-6 w-6" />, gradient: "from-emerald-500 to-teal-700", trend: "+2%", description: "Available" },
    { title: "Receivables", value: `৳${data.receivables.toLocaleString()}`, icon: <CircleDollarSign className="h-6 w-6" />, gradient: "from-cyan-500 to-sky-700", trend: "+12%", description: "From customers" },
    { title: "Payables", value: `৳${data.payables.toLocaleString()}`, icon: <Wallet className="h-6 w-6" />, gradient: "from-red-500 to-rose-700", trend: "-4%", description: "To suppliers" },
  ] : [];

  const topProductsData = data?.topProducts?.slice(0, 5).map((p: any) => ({
    name: p.name,
    revenue: p.totalRevenue,
  })) || [];

  const monthlySalesData = data?.monthlySales?.map((m: any) => ({
    month: m.month,
    sales: m.total,
  })) || [];

  const recentActivities = [
    { text: "Sales order SO-001 confirmed", time: "2 min ago", icon: <CheckCircle className="h-4 w-4 text-green-500" /> },
    { text: "New purchase order PO-003 created", time: "15 min ago", icon: <ShoppingCart className="h-4 w-4 text-orange-500" /> },
    { text: "Stock transfer TR-002 completed", time: "1 hr ago", icon: <ArrowRightLeft className="h-4 w-4 text-blue-500" /> },
    { text: "Customer payment received ৳15,000", time: "2 hrs ago", icon: <Banknote className="h-4 w-4 text-emerald-500" /> },
    { text: "Low stock alert: LED TV 42\"", time: "3 hrs ago", icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            Basic Report
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Key business metrics dashboard</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading report...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {kpiCards.map((card, i) => (
              <Card key={i} className="border-border hover:shadow-xl transition-all duration-300 overflow-hidden group">
                <CardContent className="p-0">
                  <div className={`bg-gradient-to-br ${card.gradient} p-4 text-white`}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-white/80">{card.title}</p>
                        <p className="text-2xl font-bold mt-1">{card.value}</p>
                      </div>
                      <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-transform">
                        {card.icon}
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-card">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-slate-400">{card.description}</span>
                      <span className={`text-xs font-semibold flex items-center gap-0.5 ${card.trend.startsWith("+") ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                        {card.trend.startsWith("+") ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {card.trend}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Monthly Sales Trend */}
            <Card className="border-border lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart className="h-5 w-5 text-primary" />
                  Monthly Sales Trend
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">Revenue trend over recent months</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {monthlySalesData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={monthlySalesData}>
                        <defs>
                          <linearGradient id="basicSalesGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                        <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`, "Sales"]} labelStyle={{ color: "var(--foreground)" }} />
                        <Area type="monotone" dataKey="sales" stroke="#16a34a" fill="url(#basicSalesGrad)" strokeWidth={2} name="Sales" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">No sales data available</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Top Products Bar Chart */}
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <Zap className="h-5 w-5 text-amber-500" />
                  Top Products by Sales
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">Top 5 revenue generators</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  {topProductsData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart data={topProductsData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={90} />
                        <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`, "Revenue"]} />
                        <Bar dataKey="revenue" fill="#16a34a" radius={[0, 4, 4, 0]} name="Revenue" />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">No product data available</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activities */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Recent Activities
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Latest system events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {recentActivities.map((activity, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 px-3 rounded-lg bg-slate-50 dark:bg-navy-900/30 border border-border">
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-navy-900/50 flex items-center justify-center">
                      {activity.icon}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-slate-700 dark:text-slate-300">{activity.text}</p>
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{activity.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

// ============================================================
// SALES REPORT PAGE
// ============================================================

function SalesReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadReport = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    fetch(`/api/reports/sales?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateFrom, dateTo]);

  React.useEffect(() => { loadReport(); }, [loadReport]);

  const handleExportCSV = () => {
    if (!data?.salesOrders) return;
    const headers = "Invoice No,Customer,Date,Grand Total,Cost of Goods,Profit,Margin %,Status";
    const rows = data.salesOrders.map((so: any) =>
      `${so.invoiceNo},${so.customer?.name || ""},${so.date ? new Date(so.date).toLocaleDateString() : ""},${so.grandTotal},${so.costOfGoods},${so.profit},${so.profitMargin}%,${so.status || "Draft"}`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sales-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    if (!data?.salesOrders) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Sales Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Invoice No", "Customer", "Date", "Grand Total", "Cost", "Profit", "Margin %", "Status"]],
      body: data.salesOrders.map((so: any) => [
        so.invoiceNo, so.customer?.name || "",
        so.date ? new Date(so.date).toLocaleDateString() : "",
        `৳${Number(so.grandTotal).toLocaleString()}`,
        `৳${Number(so.costOfGoods).toLocaleString()}`,
        `৳${Number(so.profit).toLocaleString()}`,
        `${so.profitMargin}%`,
        so.status || "Draft",
      ]),
    });
    doc.save("sales-report.pdf");
  };

  const summary = data?.summary || {};
  const dailyChartData = (() => {
    if (!data?.salesOrders) return [];
    const map = new Map<string, number>();
    data.salesOrders.forEach((so: any) => {
      if (so.date) {
        const day = new Date(so.date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
        map.set(day, (map.get(day) || 0) + so.grandTotal);
      }
    });
    return Array.from(map.entries()).map(([day, total]) => ({ day, sales: total }));
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CartIcon className="h-6 w-6 text-primary" />
            Sales Report
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Sales performance and profit margins</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
            </div>
            <Button size="sm" onClick={loadReport} className="bg-primary text-primary-foreground">
              <Search className="h-4 w-4 mr-1" /> Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading report...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                    <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Sales</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalRevenue || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                    <DollarSign className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Cost</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalCost || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                    <CircleDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Profit</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalProfit || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sales Chart */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart className="h-5 w-5 text-primary" />
                Daily Sales
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Sales value by day</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {dailyChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`, "Sales"]} />
                      <Bar dataKey="sales" fill="#16a34a" radius={[4, 4, 0, 0]} name="Sales" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">No chart data available</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Sales Orders Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 dark:text-white">Sales Orders with Profit</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">{data.salesOrders?.length || 0} order(s) found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Invoice No</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Customer</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Cost</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Profit</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Margin %</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data.salesOrders || data.salesOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No sales orders found</TableCell></TableRow>
                    ) : data.salesOrders.map((so: any) => (
                      <TableRow key={so.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{so.invoiceNo}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{so.customer?.name || "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{so.date ? new Date(so.date).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(so.grandTotal).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(so.costOfGoods).toLocaleString()}</TableCell>
                        <TableCell className={`font-medium ${so.profit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>৳{Number(so.profit).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{so.profitMargin}%</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={so.status || "Draft"} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// PURCHASE REPORT PAGE
// ============================================================

function PurchaseReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [suppliers, setSuppliers] = useState<any[]>([]);

  React.useEffect(() => {
    fetch("/api/suppliers").then((r) => r.json()).then(setSuppliers).catch(() => {});
  }, []);

  const loadReport = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (supplierId && supplierId !== "all") params.set("supplierId", supplierId);
    fetch(`/api/reports/purchase?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateFrom, dateTo, supplierId]);

  React.useEffect(() => { loadReport(); }, [loadReport]);

  const handleExportCSV = () => {
    if (!data?.purchaseOrders) return;
    const headers = "PO Number,Supplier,Date,Grand Total,Status";
    const rows = data.purchaseOrders.map((po: any) =>
      `${po.poNumber},${po.supplier?.name || ""},${po.date ? new Date(po.date).toLocaleDateString() : ""},${po.grandTotal},${po.status || "Draft"}`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "purchase-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    if (!data?.purchaseOrders) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Purchase Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["PO Number", "Supplier", "Date", "Grand Total", "Status"]],
      body: data.purchaseOrders.map((po: any) => [
        po.poNumber, po.supplier?.name || "",
        po.date ? new Date(po.date).toLocaleDateString() : "",
        `৳${Number(po.grandTotal).toLocaleString()}`,
        po.status || "Draft",
      ]),
    });
    doc.save("purchase-report.pdf");
  };

  const summary = data?.summary || {};
  const totalItems = data?.purchaseOrders?.reduce((s: number, po: any) =>
    s + (po.lines?.reduce((ls: number, l: any) => ls + l.quantity, 0) || 0), 0) || 0;
  const avgOrderValue = (summary.totalOrders || 0) > 0
    ? Math.round((summary.totalPOValue || 0) / summary.totalOrders) : 0;

  const supplierChartData = (() => {
    if (!data?.purchaseOrders) return [];
    const map = new Map<string, number>();
    data.purchaseOrders.forEach((po: any) => {
      const name = po.supplier?.name || "Unknown";
      map.set(name, (map.get(name) || 0) + po.grandTotal);
    });
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            Purchase Report
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Purchase history and analysis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="All Suppliers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={loadReport} className="bg-primary text-primary-foreground">
              <Search className="h-4 w-4 mr-1" /> Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading report...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                    <ShoppingCart className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Purchase</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalPOValue || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30">
                    <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Items</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{totalItems.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                    <Tag className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Avg Order Value</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{avgOrderValue.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Purchases by Supplier Chart */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart className="h-5 w-5 text-primary" />
                Purchases by Supplier
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Purchase value per supplier</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {supplierChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={supplierChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`, "Purchase"]} />
                      <Bar dataKey="value" fill="#ea580c" radius={[4, 4, 0, 0]} name="Purchase Value" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">No chart data available</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Purchase Orders Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 dark:text-white">Purchase Orders</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">{data.purchaseOrders?.length || 0} order(s) found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">PO Number</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Supplier</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data.purchaseOrders || data.purchaseOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No purchase orders found</TableCell></TableRow>
                    ) : data.purchaseOrders.map((po: any) => (
                      <TableRow key={po.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{po.poNumber}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{po.supplier?.name || "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{po.date ? new Date(po.date).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(po.grandTotal).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={po.status || "Draft"} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// SALES RETURN PAGE
// ============================================================

function SalesReturnPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [selectedSO, setSelectedSO] = useState("");
  const [form, setForm] = useState({ date: "", reason: "" });
  const [lines, setLines] = useState<{ productId: string; productName: string; quantity: number; rate: number; total: number }[]>([]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/sales-returns").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/sales-orders").then((r) => r.json()).then(setSalesOrders).catch(() => {});
    }
  }, [dialogOpen]);

  const handleSelectSO = (soId: string) => {
    setSelectedSO(soId);
    const so = salesOrders.find((s: any) => s.id === soId);
    if (so) {
      const soLines = (so.lines || []).map((l: any) => ({
        productId: l.productId,
        productName: l.product?.name || "Unknown",
        quantity: 1,
        rate: l.rate,
        total: l.rate,
      }));
      setLines(soLines.length > 0 ? soLines : [{ productId: "", productName: "", quantity: 1, rate: 0, total: 0 }]);
      setForm({ ...form, date: so.date ? new Date(so.date).toISOString().split("T")[0] : "" });
    }
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "quantity" || field === "rate") {
        updated.total = Number(updated.quantity) * Number(updated.rate);
      }
      return updated;
    }));
  };

  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const so = salesOrders.find((s: any) => s.id === selectedSO);
    if (!so || !form.date || lines.length === 0) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/sales-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesOrderId: selectedSO,
          customerId: so.customerId,
          date: form.date,
          reason: form.reason,
          lines: lines.filter((l) => l.productId).map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            rate: l.rate,
            total: l.total,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "Sales return created successfully" });
      setDialogOpen(false);
      setSelectedSO("");
      setForm({ date: "", reason: "" });
      setLines([]);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to create sales return", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "Return No,Invoice No,Customer,Date,Grand Total,Status";
    const rows = data.map((i) => `${i.returnNo},${i.salesOrder?.invoiceNo || ""},${i.salesOrder?.customer?.name || ""},${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.grandTotal},${i.status || "Pending"}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sales-returns.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Sales Returns Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Return No", "Invoice No", "Customer", "Date", "Grand Total", "Status"]],
      body: data.map((i) => [i.returnNo, i.salesOrder?.invoiceNo || "", i.salesOrder?.customer?.name || "", i.date ? new Date(i.date).toLocaleDateString() : "", `৳${Number(i.grandTotal).toLocaleString()}`, i.status || "Pending"]),
    });
    doc.save("sales-returns.pdf");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sales Returns</h1>
        <p className="text-slate-500 dark:text-slate-400">Process customer return transactions</p>
      </div>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Sales Returns</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add Sales Return</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Return No</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Invoice No</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Customer</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No sales returns</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.returnNo}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.salesOrder?.invoiceNo || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.salesOrder?.customer?.name || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(item.grandTotal).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={item.status || "Pending"} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Sales Return</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Original Sales Order</Label>
                <Select value={selectedSO} onValueChange={handleSelectSO}>
                  <SelectTrigger><SelectValue placeholder="Select sales order" /></SelectTrigger>
                  <SelectContent>
                    {salesOrders.map((so: any) => <SelectItem key={so.id} value={so.id}>{so.invoiceNo} - {so.customer?.name || ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label className="text-slate-700 dark:text-slate-300">Reason</Label>
                <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Return reason" />
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-slate-700 dark:text-slate-300 font-semibold">Return Items</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <Label className="text-xs text-slate-500">Product</Label>}
                    <Input className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.productName} readOnly />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
                    <Input type="number" className="h-9" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Rate</Label>}
                    <Input type="number" className="h-9" value={line.rate} onChange={(e) => updateLine(idx, "rate", Number(e.target.value))} />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs text-slate-500">Total</Label>}
                    <Input type="number" className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.total} readOnly />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-500 h-9"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-right mt-3">
                <span className="text-slate-700 dark:text-slate-300 font-semibold text-lg">
                  Grand Total: ৳{lines.reduce((s, l) => s + l.total, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// PURCHASE RETURN PAGE
// ============================================================

function PurchaseReturnPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [selectedPO, setSelectedPO] = useState("");
  const [form, setForm] = useState({ date: "", reason: "" });
  const [lines, setLines] = useState<{ productId: string; productName: string; quantity: number; rate: number; total: number }[]>([]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/purchase-returns").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/purchase-orders").then((r) => r.json()).then(setPurchaseOrders).catch(() => {});
    }
  }, [dialogOpen]);

  const handleSelectPO = (poId: string) => {
    setSelectedPO(poId);
    const po = purchaseOrders.find((p: any) => p.id === poId);
    if (po) {
      const poLines = (po.lines || []).map((l: any) => ({
        productId: l.productId,
        productName: l.product?.name || "Unknown",
        quantity: 1,
        rate: l.rate,
        total: l.rate,
      }));
      setLines(poLines.length > 0 ? poLines : [{ productId: "", productName: "", quantity: 1, rate: 0, total: 0 }]);
      setForm({ ...form, date: po.date ? new Date(po.date).toISOString().split("T")[0] : "" });
    }
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "quantity" || field === "rate") {
        updated.total = Number(updated.quantity) * Number(updated.rate);
      }
      return updated;
    }));
  };

  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const po = purchaseOrders.find((p: any) => p.id === selectedPO);
    if (!po || !form.date || lines.length === 0) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/purchase-returns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          purchaseOrderId: selectedPO,
          supplierId: po.supplierId,
          date: form.date,
          reason: form.reason,
          lines: lines.filter((l) => l.productId).map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            rate: l.rate,
            total: l.total,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "Purchase return created successfully" });
      setDialogOpen(false);
      setSelectedPO("");
      setForm({ date: "", reason: "" });
      setLines([]);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to create purchase return", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "Return No,PO Number,Supplier,Date,Grand Total,Status";
    const rows = data.map((i) => `${i.returnNo},${i.purchaseOrder?.poNumber || ""},${i.purchaseOrder?.supplier?.name || ""},${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.grandTotal},${i.status || "Pending"}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "purchase-returns.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Purchase Returns Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Return No", "PO Number", "Supplier", "Date", "Grand Total", "Status"]],
      body: data.map((i) => [i.returnNo, i.purchaseOrder?.poNumber || "", i.purchaseOrder?.supplier?.name || "", i.date ? new Date(i.date).toLocaleDateString() : "", `৳${Number(i.grandTotal).toLocaleString()}`, i.status || "Pending"]),
    });
    doc.save("purchase-returns.pdf");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Purchase Returns</h1>
        <p className="text-slate-500 dark:text-slate-400">Process supplier return transactions</p>
      </div>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Purchase Returns</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add Purchase Return</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Return No</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">PO Number</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Supplier</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No purchase returns</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.returnNo}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.purchaseOrder?.poNumber || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.purchaseOrder?.supplier?.name || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(item.grandTotal).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={item.status || "Pending"} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Purchase Return</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Original Purchase Order</Label>
                <Select value={selectedPO} onValueChange={handleSelectPO}>
                  <SelectTrigger><SelectValue placeholder="Select purchase order" /></SelectTrigger>
                  <SelectContent>
                    {purchaseOrders.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.poNumber} - {po.supplier?.name || ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label className="text-slate-700 dark:text-slate-300">Reason</Label>
                <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Return reason" />
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-slate-700 dark:text-slate-300 font-semibold">Return Items</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <Label className="text-xs text-slate-500">Product</Label>}
                    <Input className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.productName} readOnly />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
                    <Input type="number" className="h-9" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Rate</Label>}
                    <Input type="number" className="h-9" value={line.rate} onChange={(e) => updateLine(idx, "rate", Number(e.target.value))} />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs text-slate-500">Total</Label>}
                    <Input type="number" className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.total} readOnly />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-500 h-9"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-right mt-3">
                <span className="text-slate-700 dark:text-slate-300 font-semibold text-lg">
                  Grand Total: ৳{lines.reduce((s, l) => s + l.total, 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// HIRE SALES PAGE
// ============================================================

function HireSalesPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({ customerId: "", godownId: "", date: "", hireRate: 0, duration: "", returnDate: "", notes: "" });
  const [lines, setLines] = useState<{ productId: string; quantity: number; rate: number; total: number }[]>([{ productId: "", quantity: 1, rate: 0, total: 0 }]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/hire-sales").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/customers").then((r) => r.json()).then(setCustomers).catch(() => {});
      fetch("/api/godowns").then((r) => r.json()).then(setGodowns).catch(() => {});
      fetch("/api/products").then((r) => r.json()).then(setProducts).catch(() => {});
    }
  }, [dialogOpen]);

  const lineTotal = lines.reduce((s, l) => s + l.total, 0);
  const grandTotal = lineTotal + form.hireRate;

  const updateLine = (idx: number, field: string, value: any) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "productId") {
        const prod = products.find((p: any) => p.id === value);
        if (prod) { updated.rate = prod.salePrice; }
      }
      if (field === "quantity" || field === "rate" || field === "productId") {
        updated.total = Number(updated.quantity) * Number(updated.rate);
      }
      return updated;
    }));
  };

  const addLine = () => setLines((prev) => [...prev, { productId: "", quantity: 1, rate: 0, total: 0 }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    try {
      const res = await fetch("/api/hire-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          grandTotal,
          lines: lines.filter((l) => l.productId),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "Hire sale created successfully" });
      setDialogOpen(false);
      setForm({ customerId: "", godownId: "", date: "", hireRate: 0, duration: "", returnDate: "", notes: "" });
      setLines([{ productId: "", quantity: 1, rate: 0, total: 0 }]);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to create hire sale", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "Invoice No,Customer,Date,Hire Rate,Duration,Grand Total,Status";
    const rows = data.map((i) => `${i.invoiceNo},${i.customer?.name || ""},${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.hireRate},${i.duration || ""},${i.grandTotal},${i.status || "Active"}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "hire-sales.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Hire Sales Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Invoice No", "Customer", "Date", "Hire Rate", "Duration", "Grand Total", "Status"]],
      body: data.map((i) => [i.invoiceNo, i.customer?.name || "", i.date ? new Date(i.date).toLocaleDateString() : "", `৳${Number(i.hireRate).toLocaleString()}`, i.duration || "-", `৳${Number(i.grandTotal).toLocaleString()}`, i.status || "Active"]),
    });
    doc.save("hire-sales.pdf");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hire Sales</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage rental/hire sales transactions</p>
      </div>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Hire Sales</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add Hire Sale</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Invoice No</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Customer</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Hire Rate</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Duration</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">No hire sales</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.invoiceNo}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.customer?.name || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(item.hireRate).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.duration || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(item.grandTotal).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={item.status || "Active"} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Hire Sale</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Customer</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Godown</Label>
                <Select value={form.godownId} onValueChange={(v) => setForm({ ...form, godownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select godown" /></SelectTrigger>
                  <SelectContent>
                    {godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Hire Rate</Label>
                <Input type="number" value={form.hireRate} onChange={(e) => setForm({ ...form, hireRate: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Duration</Label>
                <Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 30 days" />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Return Date</Label>
                <Input type="date" value={form.returnDate} onChange={(e) => setForm({ ...form, returnDate: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label className="text-slate-700 dark:text-slate-300">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
              </div>
            </div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 dark:text-slate-300 font-semibold">Product Lines</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="text-slate-700 dark:text-slate-300"><Plus className="h-4 w-4 mr-1" /> Add Line</Button>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <Label className="text-xs text-slate-500">Product</Label>}
                    <Select value={line.productId} onValueChange={(v) => updateLine(idx, "productId", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
                    <Input type="number" className="h-9" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Rate</Label>}
                    <Input type="number" className="h-9" value={line.rate} onChange={(e) => updateLine(idx, "rate", Number(e.target.value))} />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs text-slate-500">Total</Label>}
                    <Input type="number" className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.total} readOnly />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-500 h-9"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-right mt-3 space-y-1">
                <div className="text-slate-500 dark:text-slate-400 text-sm">Line Total: ৳{lineTotal.toLocaleString()}</div>
                <div className="text-slate-500 dark:text-slate-400 text-sm">Hire Rate: ৳{Number(form.hireRate).toLocaleString()}</div>
                <div className="text-slate-700 dark:text-slate-300 font-semibold text-lg">Grand Total: ৳{grandTotal.toLocaleString()}</div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// STOCK PAGE
// ============================================================

function StockPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch("/api/stock").then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Stock Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Product", "Category", "Current Stock", "Cost Price", "Sale Price", "Stock Value"]],
      body: data.map(i => [i.productName, i.category, i.currentStock, i.costPrice, i.salePrice, i.stockValue]),
    });
    doc.save("stock.pdf");
  };

  const handleExportCSV = () => {
    const headers = "Product,Category,Current Stock,Cost Price,Sale Price,Stock Value";
    const rows = data.map(i => `${i.productName},${i.category},${i.currentStock},${i.costPrice},${i.salePrice},${i.stockValue}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "stock.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock</h1>
        <p className="text-slate-500 dark:text-slate-400">Current stock levels across all godowns</p>
      </div>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Stock Overview</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Product</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Category</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Current Stock</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Cost Price</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Sale Price</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Stock Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No stock data</TableCell></TableRow>
                  ) : data.map((item, i) => (
                    <TableRow key={i} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.productName}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.category || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">
                        <Badge variant={Number(item.currentStock) <= 0 ? "destructive" : Number(item.currentStock) < 10 ? "secondary" : "default"}>
                          {item.currentStock}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(item.costPrice).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(item.salePrice).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(item.stockValue).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// PURCHASE ORDER PAGE
// ============================================================

function PurchaseOrderPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({ supplierId: "", godownId: "", date: "", notes: "" });
  const [lines, setLines] = useState<{ productId: string; quantity: number; rate: number; total: number }[]>([{ productId: "", quantity: 1, rate: 0, total: 0 }]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/purchase-orders").then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/suppliers").then(r => r.json()).then(setSuppliers).catch(() => {});
      fetch("/api/godowns").then(r => r.json()).then(setGodowns).catch(() => {});
      fetch("/api/products").then(r => r.json()).then(setProducts).catch(() => {});
    }
  }, [dialogOpen]);

  const grandTotal = lines.reduce((s, l) => s + l.total, 0);

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "productId") {
        const prod = products.find((p: any) => p.id === value);
        if (prod) { updated.rate = prod.costPrice; }
      }
      if (field === "quantity" || field === "rate" || field === "productId") {
        updated.total = Number(updated.quantity) * Number(updated.rate);
      }
      return updated;
    }));
  };

  const addLine = () => setLines(prev => [...prev, { productId: "", quantity: 1, rate: 0, total: 0 }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    try {
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lines }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "Purchase order created successfully" });
      setDialogOpen(false);
      setForm({ supplierId: "", godownId: "", date: "", notes: "" });
      setLines([{ productId: "", quantity: 1, rate: 0, total: 0 }]);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to create purchase order", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "PO Number,Supplier,Date,Grand Total,Status";
    const rows = data.map(i => `${i.poNumber},${i.supplier?.name || ""},${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.grandTotal},${i.status || "Pending"}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "purchase-orders.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Purchase Orders Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["PO Number", "Supplier", "Date", "Grand Total", "Status"]],
      body: data.map(i => [i.poNumber, i.supplier?.name || "", i.date ? new Date(i.date).toLocaleDateString() : "", `৳${Number(i.grandTotal).toLocaleString()}`, i.status || "Pending"]),
    });
    doc.save("purchase-orders.pdf");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Purchase Orders</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage purchase orders and track deliveries</p>
      </div>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Purchase Orders</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add PO</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">PO Number</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Supplier</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No purchase orders</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.poNumber}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.supplier?.name || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(item.grandTotal).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={item.status || "Pending"} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Purchase Order</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Supplier</Label>
                <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Godown</Label>
                <Select value={form.godownId} onValueChange={(v) => setForm({ ...form, godownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select godown" /></SelectTrigger>
                  <SelectContent>
                    {godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
              </div>
            </div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 dark:text-slate-300 font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="text-slate-700 dark:text-slate-300"><Plus className="h-4 w-4 mr-1" /> Add Line</Button>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <Label className="text-xs text-slate-500">Product</Label>}
                    <Select value={line.productId} onValueChange={(v) => updateLine(idx, "productId", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
                    <Input type="number" className="h-9" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Rate</Label>}
                    <Input type="number" className="h-9" value={line.rate} onChange={(e) => updateLine(idx, "rate", Number(e.target.value))} />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs text-slate-500">Total</Label>}
                    <Input type="number" className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.total} readOnly />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-500 h-9"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-right mt-3">
                <span className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total: ৳{grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// SALES ORDER PAGE
// ============================================================

function SalesOrderPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [form, setForm] = useState({ customerId: "", godownId: "", date: "", discount: 0, paymentOptionId: "", notes: "" });
  const [lines, setLines] = useState<{ productId: string; quantity: number; rate: number; total: number }[]>([{ productId: "", quantity: 1, rate: 0, total: 0 }]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/sales-orders").then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/customers").then(r => r.json()).then(setCustomers).catch(() => {});
      fetch("/api/godowns").then(r => r.json()).then(setGodowns).catch(() => {});
      fetch("/api/products").then(r => r.json()).then(setProducts).catch(() => {});
      fetch("/api/payment-options").then(r => r.json()).then(setPaymentOptions).catch(() => {});
    }
  }, [dialogOpen]);

  const lineTotal = lines.reduce((s, l) => s + l.total, 0);
  const grandTotal = lineTotal - form.discount;

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "productId") {
        const prod = products.find((p: any) => p.id === value);
        if (prod) { updated.rate = prod.salePrice; }
      }
      if (field === "quantity" || field === "rate" || field === "productId") {
        updated.total = Number(updated.quantity) * Number(updated.rate);
      }
      return updated;
    }));
  };

  const addLine = () => setLines(prev => [...prev, { productId: "", quantity: 1, rate: 0, total: 0 }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    try {
      const res = await fetch("/api/sales-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lines }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "Sales order created successfully" });
      setDialogOpen(false);
      setForm({ customerId: "", godownId: "", date: "", discount: 0, paymentOptionId: "", notes: "" });
      setLines([{ productId: "", quantity: 1, rate: 0, total: 0 }]);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to create sales order", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "Invoice No,Customer,Date,Discount,Grand Total,Payment Option,Status";
    const rows = data.map(i => `${i.invoiceNo},${i.customer?.name || ""},${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.discount},${i.grandTotal},${i.paymentOption?.name || ""},${i.status || "Pending"}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sales-orders.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Sales Orders Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Invoice No", "Customer", "Date", "Discount", "Grand Total", "Payment", "Status"]],
      body: data.map(i => [i.invoiceNo, i.customer?.name || "", i.date ? new Date(i.date).toLocaleDateString() : "", `৳${Number(i.discount).toLocaleString()}`, `৳${Number(i.grandTotal).toLocaleString()}`, i.paymentOption?.name || "", i.status || "Pending"]),
    });
    doc.save("sales-orders.pdf");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Sales Orders</h1>
        <p className="text-slate-500 dark:text-slate-400">Process sales orders and invoices</p>
      </div>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Sales Orders</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add SO</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Invoice No</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Customer</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Discount</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Payment</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">No sales orders</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.invoiceNo}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.customer?.name || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(item.discount).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(item.grandTotal).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.paymentOption?.name || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={item.status || "Pending"} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Sales Order</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Customer</Label>
                <Select value={form.customerId} onValueChange={(v) => setForm({ ...form, customerId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Godown</Label>
                <Select value={form.godownId} onValueChange={(v) => setForm({ ...form, godownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select godown" /></SelectTrigger>
                  <SelectContent>
                    {godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Payment Option</Label>
                <Select value={form.paymentOptionId} onValueChange={(v) => setForm({ ...form, paymentOptionId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select payment" /></SelectTrigger>
                  <SelectContent>
                    {paymentOptions.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Discount</Label>
                <Input type="number" value={form.discount} onChange={(e) => setForm({ ...form, discount: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
              </div>
            </div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 dark:text-slate-300 font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="text-slate-700 dark:text-slate-300"><Plus className="h-4 w-4 mr-1" /> Add Line</Button>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <Label className="text-xs text-slate-500">Product</Label>}
                    <Select value={line.productId} onValueChange={(v) => updateLine(idx, "productId", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
                    <Input type="number" className="h-9" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Rate</Label>}
                    <Input type="number" className="h-9" value={line.rate} onChange={(e) => updateLine(idx, "rate", Number(e.target.value))} />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs text-slate-500">Total</Label>}
                    <Input type="number" className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.total} readOnly />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-500 h-9"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-right mt-3 space-y-1">
                <div className="text-slate-500 dark:text-slate-400 text-sm">Line Total: ৳{lineTotal.toLocaleString()}</div>
                <div className="text-slate-500 dark:text-slate-400 text-sm">Discount: ৳{Number(form.discount).toLocaleString()}</div>
                <div className="text-slate-700 dark:text-slate-300 font-semibold text-lg">Grand Total: ৳{grandTotal.toLocaleString()}</div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// PROFIT & LOSS PAGE
// ============================================================

function ProfitLossPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch("/api/reports/profit-loss").then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleExportPDF = async () => {
    if (!data) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Profit & Loss Statement", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Description", "Amount (৳)"]],
      body: [
        ["Sales Revenue", data.salesRevenue?.toLocaleString() || "0"],
        ["Other Income", data.otherIncome?.toLocaleString() || "0"],
        ["Total Revenue", data.revenue?.toLocaleString() || "0"],
        ["Cost of Goods Sold", data.costOfGoods?.toLocaleString() || "0"],
        ["Gross Profit", data.grossProfit?.toLocaleString() || "0"],
        ["Operating Expenses", data.operatingExpenses?.toLocaleString() || "0"],
        ["Net Profit", data.netProfit?.toLocaleString() || "0"],
      ],
    });
    doc.save("profit-loss.pdf");
  };

  if (loading) return <div className="text-center py-8 text-slate-500 dark:text-slate-400">Loading report...</div>;
  if (!data) return <div className="text-center py-8 text-slate-500 dark:text-slate-400">Failed to load report</div>;

  const monthlyData = data.monthlyData || [];

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            Profit & Loss
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Income vs expense statement</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
      </div>

      {/* Gradient KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-100">Total Revenue</p>
              <p className="text-2xl font-bold mt-1">৳{Number(data.revenue).toLocaleString()}</p>
              <p className="text-xs text-emerald-200 mt-1">Sales: ৳{Number(data.salesRevenue).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><TrendingUp className="h-7 w-7" /></div>
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-red-500 to-rose-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-100">Total Expenses</p>
              <p className="text-2xl font-bold mt-1">৳{Number(data.operatingExpenses + data.costOfGoods).toLocaleString()}</p>
              <p className="text-xs text-red-200 mt-1">COGS: ৳{Number(data.costOfGoods).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><TrendingDown className="h-7 w-7" /></div>
          </div>
        </div>
        <div className={`rounded-xl bg-gradient-to-br ${Number(data.netProfit) >= 0 ? "from-blue-500 to-indigo-600" : "from-red-600 to-rose-700"} p-5 text-white shadow-lg`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-100">Net Profit</p>
              <p className="text-2xl font-bold mt-1">৳{Number(data.netProfit).toLocaleString()}</p>
              <p className="text-xs text-blue-200 mt-1">Margin: {data.netProfitMargin}%</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">{Number(data.netProfit) >= 0 ? <ArrowUpRight className="h-7 w-7" /> : <ArrowDownRight className="h-7 w-7" />}</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue vs Expenses BarChart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" /> Revenue vs Expenses (Monthly)
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">12-month comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} angle={-45} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`]} />
                    <Legend />
                    <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} name="Revenue" />
                    <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">No monthly data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Profit Margin Trend AreaChart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> Profit Margin Trend
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Monthly profit margin %</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {monthlyData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} angle={-45} textAnchor="end" height={50} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`${value}%`]} />
                    <Area type="monotone" dataKey="profitMargin" stroke="#3b82f6" fill="url(#profitGradient)" strokeWidth={2} name="Profit Margin" />
                    <defs>
                      <linearGradient id="profitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">No monthly data available</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Breakdown Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" /> Monthly Breakdown
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">Detailed monthly P&L figures</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="table-container rounded-md border border-border max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Month</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Revenue</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Expenses</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Profit</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {monthlyData.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No monthly data</TableCell></TableRow>
                ) : monthlyData.map((row: any, i: number) => (
                  <TableRow key={i} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                    <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{row.month}</TableCell>
                    <TableCell className="text-green-600 dark:text-green-400 text-right">৳{Number(row.revenue).toLocaleString()}</TableCell>
                    <TableCell className="text-red-600 dark:text-red-400 text-right">৳{Number(row.expenses).toLocaleString()}</TableCell>
                    <TableCell className={`text-right font-medium ${Number(row.profit) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>৳{Number(row.profit).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={Number(row.profitMargin) >= 0 ? "default" : "destructive"} className="text-xs">{row.profitMargin}%</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detailed P&L Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Income Details */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-emerald-500" /> Income Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-slate-700 dark:text-slate-300">Sales Revenue</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">৳{Number(data.salesRevenue).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-slate-700 dark:text-slate-300">Other Income</span>
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">৳{Number(data.otherIncome).toLocaleString()}</span>
              </div>
              {(data.incomeDetails || []).map((d: any, i: number) => (
                <div key={i} className="flex justify-between py-1.5 pl-4 text-sm">
                  <span className="text-slate-600 dark:text-slate-400">{d.head}</span>
                  <span className="text-slate-700 dark:text-slate-300">৳{Number(d.amount).toLocaleString()} ({d.count}x)</span>
                </div>
              ))}
              <div className="flex justify-between bg-emerald-50 dark:bg-emerald-900/20 p-3 rounded-lg font-bold">
                <span className="text-emerald-700 dark:text-emerald-400">Total Revenue</span>
                <span className="text-emerald-700 dark:text-emerald-400">৳{Number(data.revenue).toLocaleString()}</span>
              </div>
              <div className="flex justify-between bg-emerald-50/50 dark:bg-emerald-900/10 p-3 rounded-lg">
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Gross Profit</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">৳{Number(data.grossProfit).toLocaleString()}</span>
              </div>
              <p className="text-sm text-slate-500 pl-2">Gross Profit Margin: {data.grossProfitMargin}%</p>
            </div>
          </CardContent>
        </Card>

        {/* Expense Details */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-red-500" /> Expense Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-slate-700 dark:text-slate-300">Cost of Goods Sold</span>
                <span className="text-red-600 dark:text-red-400 font-medium">৳{Number(data.costOfGoods).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-slate-700 dark:text-slate-300">Operating Expenses</span>
                <span className="text-red-600 dark:text-red-400 font-medium">৳{Number(data.operatingExpenses).toLocaleString()}</span>
              </div>
              {(data.expenseDetails || []).map((d: any, i: number) => (
                <div key={i} className="flex justify-between py-1.5 pl-4 text-sm">
                  <span className="text-slate-600 dark:text-slate-400">{d.head}</span>
                  <span className="text-slate-700 dark:text-slate-300">৳{Number(d.amount).toLocaleString()} ({d.count}x)</span>
                </div>
              ))}
              <div className={`flex justify-between p-4 rounded-lg font-bold text-lg ${Number(data.netProfit) >= 0 ? "bg-blue-50 dark:bg-blue-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
                <span className={Number(data.netProfit) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700 dark:text-red-400"}>Net Profit</span>
                <span className={Number(data.netProfit) >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-700 dark:text-red-400"}>৳{Number(data.netProfit).toLocaleString()}</span>
              </div>
              <p className="text-sm text-slate-500 pl-2">Net Profit Margin: {data.netProfitMargin}%</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// BALANCE SHEET PAGE
// ============================================================

function BalanceSheetPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch("/api/reports/balance-sheet").then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleExportPDF = async () => {
    if (!data) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Balance Sheet", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Category", "Item", "Amount (৳)"]],
      body: [
        ["Assets", "Stock", Number(data.assets?.stock || 0).toLocaleString()],
        ["Assets", "Bank Balance", Number(data.assets?.bankBalance || 0).toLocaleString()],
        ["Assets", "Receivables", Number(data.assets?.receivables || 0).toLocaleString()],
        ["Assets", "Total Assets", Number(data.assets?.totalAssets || 0).toLocaleString()],
        ["Liabilities", "Payables", Number(data.liabilities?.payables || 0).toLocaleString()],
        ["Liabilities", "Equity", Number(data.liabilities?.equity || 0).toLocaleString()],
        ["Liabilities", "Total Liabilities", Number(data.liabilities?.totalLiabilities || 0).toLocaleString()],
      ],
    });
    doc.save("balance-sheet.pdf");
  };

  if (loading) return <div className="text-center py-8 text-slate-500 dark:text-slate-400">Loading report...</div>;
  if (!data) return <div className="text-center py-8 text-slate-500 dark:text-slate-400">Failed to load report</div>;

  const assetComposition = data.assetComposition || [];
  const comparisonData = data.comparisonData || [];

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Layers className="h-6 w-6 text-primary" />
            Balance Sheet
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Assets = Liabilities + Equity</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
      </div>

      {/* Gradient KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-100">Total Assets</p>
              <p className="text-2xl font-bold mt-1">৳{Number(data.assets?.totalAssets || 0).toLocaleString()}</p>
              <p className="text-xs text-blue-200 mt-1">Stock + Bank + Receivables</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><TrendingUp className="h-7 w-7" /></div>
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-red-500 to-orange-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-100">Total Liabilities</p>
              <p className="text-2xl font-bold mt-1">৳{Number(data.liabilities?.totalLiabilities || 0).toLocaleString()}</p>
              <p className="text-xs text-red-200 mt-1">Payables + Equity</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><TrendingDown className="h-7 w-7" /></div>
          </div>
        </div>
        <div className={`rounded-xl bg-gradient-to-br ${data.balanced ? "from-emerald-500 to-green-600" : "from-amber-500 to-yellow-600"} p-5 text-white shadow-lg`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-100">Balance Check</p>
              <p className="text-2xl font-bold mt-1">{data.balanced ? "Balanced" : "Not Balanced"}</p>
              <p className="text-xs text-emerald-200 mt-1">A - L = ৳{Number((data.assets?.totalAssets || 0) - (data.liabilities?.totalLiabilities || 0)).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">{data.balanced ? <CheckCircle className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets vs Liabilities BarChart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" /> Assets vs Liabilities
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Comparison overview</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {comparisonData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={comparisonData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="category" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`]} />
                    <Bar dataKey="value" radius={[8, 8, 0, 0]} name="Amount">
                      {comparisonData.map((entry: any, index: number) => (
                        <Cell key={index} fill={entry.category === "Assets" ? "#3b82f6" : entry.category === "Liabilities" ? "#ef4444" : "#8b5cf6"} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">No comparison data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Asset Composition PieChart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <PieChartIcon className="h-4 w-4 text-primary" /> Asset Composition
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Breakdown of total assets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {assetComposition.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={assetComposition} cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={3} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: "var(--muted-foreground)" }}>
                      {assetComposition.map((entry: any, index: number) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">No asset data available</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assets Card */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-blue-500" /> Assets
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2.5 px-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span className="text-slate-700 dark:text-slate-300">Stock Value</span>
                </div>
                <span className="text-blue-700 dark:text-blue-400 font-semibold">৳{Number(data.assets?.stock || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500">
                <div className="flex items-center gap-2">
                  <Banknote className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span className="text-slate-700 dark:text-slate-300">Bank Balance</span>
                </div>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">৳{Number(data.assets?.bankBalance || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-500">
                <div className="flex items-center gap-2">
                  <CircleDollarSign className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-slate-700 dark:text-slate-300">Receivables</span>
                </div>
                <span className="text-amber-700 dark:text-amber-400 font-semibold">৳{Number(data.assets?.receivables || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between bg-blue-100 dark:bg-blue-900/30 p-3 rounded-lg font-bold text-lg border-t-2 border-blue-400">
                <span className="text-blue-800 dark:text-blue-300">Total Assets</span>
                <span className="text-blue-800 dark:text-blue-300">৳{Number(data.assets?.totalAssets || 0).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Liabilities & Equity Card */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-red-500" /> Liabilities & Equity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between items-center py-2.5 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500">
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <span className="text-slate-700 dark:text-slate-300">Payables</span>
                </div>
                <span className="text-red-700 dark:text-red-400 font-semibold">৳{Number(data.liabilities?.payables || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2.5 px-3 rounded-lg bg-violet-50 dark:bg-violet-900/20 border-l-4 border-violet-500">
                <div className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  <span className="text-slate-700 dark:text-slate-300">Equity (Retained Earnings)</span>
                </div>
                <span className="text-violet-700 dark:text-violet-400 font-semibold">৳{Number(data.liabilities?.equity || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between bg-red-100 dark:bg-red-900/30 p-3 rounded-lg font-bold text-lg border-t-2 border-red-400">
                <span className="text-red-800 dark:text-red-300">Total Liabilities & Equity</span>
                <span className="text-red-800 dark:text-red-300">৳{Number(data.liabilities?.totalLiabilities || 0).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// TRIAL BALANCE PAGE
// ============================================================

function TrialBalancePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch("/api/reports/trial-balance").then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const handleExportPDF = async () => {
    if (!data) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(18);
    doc.text("Trial Balance", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Account", "Debit (৳)", "Credit (৳)"]],
      body: [
        ...data.entries.map((e: any) => [e.account, e.totalDebit?.toLocaleString() || "0", e.totalCredit?.toLocaleString() || "0"]),
        ["Grand Total", data.grandTotalDebit?.toLocaleString() || "0", data.grandTotalCredit?.toLocaleString() || "0"],
      ],
    });
    doc.save("trial-balance.pdf");
  };

  if (loading) return <div className="text-center py-8 text-slate-500 dark:text-slate-400">Loading report...</div>;
  if (!data) return <div className="text-center py-8 text-slate-500 dark:text-slate-400">Failed to load report</div>;

  const chartData = data.chartData || [];
  const pieData = data.pieData || [];
  const difference = Math.abs(Number(data.grandTotalDebit) - Number(data.grandTotalCredit));

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Gauge className="h-6 w-6 text-primary" />
            Trial Balance
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Standard trial balance report</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
      </div>

      {/* Gradient KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-100">Total Debits</p>
              <p className="text-2xl font-bold mt-1">৳{Number(data.grandTotalDebit).toLocaleString()}</p>
              <p className="text-xs text-blue-200 mt-1">{data.entries?.length || 0} accounts</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><ArrowUpRight className="h-7 w-7" /></div>
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-100">Total Credits</p>
              <p className="text-2xl font-bold mt-1">৳{Number(data.grandTotalCredit).toLocaleString()}</p>
              <p className="text-xs text-emerald-200 mt-1">{data.entries?.length || 0} accounts</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><ArrowDownRight className="h-7 w-7" /></div>
          </div>
        </div>
        <div className={`rounded-xl bg-gradient-to-br ${difference === 0 ? "from-emerald-500 to-green-600" : "from-amber-500 to-yellow-600"} p-5 text-white shadow-lg`}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-100">Difference</p>
              <p className="text-2xl font-bold mt-1">৳{difference.toLocaleString()}</p>
              <p className="text-xs text-emerald-200 mt-1">{data.balanced ? "Balanced ✓" : "Not Balanced"}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">{data.balanced ? <CheckCircle className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Debit vs Credit BarChart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" /> Debit vs Credit by Account
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Top accounts comparison</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="account" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} width={100} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`]} />
                    <Legend />
                    <Bar dataKey="debit" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Debit" />
                    <Bar dataKey="credit" fill="#10b981" radius={[0, 4, 4, 0]} name="Credit" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">No chart data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Account Balance Distribution PieChart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <PieChartIcon className="h-4 w-4 text-primary" /> Account Balance Distribution
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Balance magnitude by account</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {pieData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={90} innerRadius={50} paddingAngle={2} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: "var(--muted-foreground)" }}>
                      {pieData.map((entry: any, index: number) => (
                        <Cell key={index} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">No distribution data available</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trial Balance Table with Color-Coded Columns */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
            <Layers className="h-4 w-4 text-primary" /> Account Details
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">{data.entries?.length || 0} account(s) listed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">#</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Account</TableHead>
                  <TableHead className="text-blue-700 dark:text-blue-400 font-semibold text-right bg-blue-50/50 dark:bg-blue-900/10">Debit (৳)</TableHead>
                  <TableHead className="text-emerald-700 dark:text-emerald-400 font-semibold text-right bg-emerald-50/50 dark:bg-emerald-900/10">Credit (৳)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data.entries || data.entries.length === 0) ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No entries</TableCell></TableRow>
                ) : (
                  <>
                    {data.entries.map((entry: any, i: number) => (
                      <TableRow key={i} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-500 dark:text-slate-400 text-sm">{i + 1}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{entry.account}</TableCell>
                        <TableCell className="text-right bg-blue-50/30 dark:bg-blue-900/5">
                          {Number(entry.totalDebit) > 0 ? (
                            <span className="text-blue-700 dark:text-blue-400 font-medium">৳{Number(entry.totalDebit).toLocaleString()}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </TableCell>
                        <TableCell className="text-right bg-emerald-50/30 dark:bg-emerald-900/5">
                          {Number(entry.totalCredit) > 0 ? (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">৳{Number(entry.totalCredit).toLocaleString()}</span>
                          ) : <span className="text-slate-400">-</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-100 dark:bg-navy-900/50 font-bold border-t-2 border-slate-300 dark:border-navy-700">
                      <TableCell className="text-slate-900 dark:text-white" colSpan={2}>Grand Total</TableCell>
                      <TableCell className="text-blue-800 dark:text-blue-300 text-right bg-blue-100/50 dark:bg-blue-900/20">৳{Number(data.grandTotalDebit).toLocaleString()}</TableCell>
                      <TableCell className="text-emerald-800 dark:text-emerald-300 text-right bg-emerald-100/50 dark:bg-emerald-900/20">৳{Number(data.grandTotalCredit).toLocaleString()}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Balance Check */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300 font-semibold">Balance Check:</span>
            <Badge variant={data.balanced ? "default" : "destructive"} className="px-4 py-1 text-sm">{data.balanced ? "✓ Balanced" : "✗ Not Balanced"}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// CASH IN HAND PAGE
// ============================================================

function CashInHandPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    fetch("/api/reports/cash-in-hand").then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-8 text-slate-500 dark:text-slate-400">Loading report...</div>;
  if (!data) return <div className="text-center py-8 text-slate-500 dark:text-slate-400">Failed to load report</div>;

  const dailyFlow = data.dailyFlow || [];
  const recentTransactions = data.recentTransactions || [];

  const totalIn = Number(data.totals?.deposits || 0) + Number(data.totals?.cashIncome || 0) + Number(data.totals?.cashCollections || 0);
  const totalOut = Number(data.totals?.withdrawals || 0) + Number(data.totals?.cashExpense || 0) + Number(data.totals?.cashDeliveries || 0);

  const incomeExpenseBarData = [
    { name: "Deposits", amount: Number(data.totals?.deposits || 0), fill: "#10b981" },
    { name: "Income", amount: Number(data.totals?.cashIncome || 0), fill: "#34d399" },
    { name: "Collections", amount: Number(data.totals?.cashCollections || 0), fill: "#6ee7b7" },
    { name: "Withdrawals", amount: Number(data.totals?.withdrawals || 0), fill: "#ef4444" },
    { name: "Expenses", amount: Number(data.totals?.cashExpense || 0), fill: "#f87171" },
    { name: "Deliveries", amount: Number(data.totals?.cashDeliveries || 0), fill: "#fca5a5" },
  ];

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Wallet className="h-6 w-6 text-primary" />
          Cash in Hand
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Current cash balance across all methods</p>
      </div>

      {/* Gradient KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl bg-gradient-to-br from-slate-600 to-slate-700 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-200">Opening Balance</p>
              <p className="text-2xl font-bold mt-1">৳{Number(data.totals?.openingBalance || 0).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><Banknote className="h-6 w-6" /></div>
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-emerald-100">Total In</p>
              <p className="text-2xl font-bold mt-1">৳{totalIn.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><TrendingUp className="h-6 w-6" /></div>
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-red-500 to-rose-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-red-100">Total Out</p>
              <p className="text-2xl font-bold mt-1">৳{totalOut.toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><TrendingDown className="h-6 w-6" /></div>
          </div>
        </div>
        <div className="rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-5 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-blue-100">Closing Balance</p>
              <p className="text-2xl font-bold mt-1">৳{Number(data.totals?.totalCashInHand || 0).toLocaleString()}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl"><Wallet className="h-6 w-6" /></div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cash Flow Trend AreaChart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" /> Cash Flow Trend (30 Days)
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Daily inflow vs outflow</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {dailyFlow.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyFlow}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 9, fill: "var(--muted-foreground)" }} angle={-45} textAnchor="end" height={50} interval={4} />
                    <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`]} />
                    <Legend />
                    <Area type="monotone" dataKey="inflow" stroke="#10b981" fill="url(#inflowGrad)" strokeWidth={2} name="Inflow" />
                    <Area type="monotone" dataKey="outflow" stroke="#ef4444" fill="url(#outflowGrad)" strokeWidth={2} name="Outflow" />
                    <defs>
                      <linearGradient id="inflowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="outflowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">No daily flow data available</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Income vs Expense BarChart */}
        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <BarChart3 className="h-4 w-4 text-primary" /> Income vs Expense Breakdown
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Transaction categories</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              {incomeExpenseBarData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={incomeExpenseBarData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={90} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`]} />
                    <Bar dataKey="amount" radius={[0, 6, 6, 0]} name="Amount">
                      {incomeExpenseBarData.map((entry: any, index: number) => (
                        <Cell key={index} fill={entry.fill} />
                      ))}
                    </Bar>
                  </RechartsBarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-full text-slate-400">No data available</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Details */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
            <Banknote className="h-4 w-4 text-primary" /> Cash Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Inflows */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Inflows (+)</h4>
              <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500">
                <span className="text-slate-700 dark:text-slate-300">Deposits</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">৳{Number(data.totals?.deposits || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-400">
                <span className="text-slate-700 dark:text-slate-300">Cash Income</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">৳{Number(data.totals?.cashIncome || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-300">
                <span className="text-slate-700 dark:text-slate-300">Cash Collections</span>
                <span className="text-emerald-700 dark:text-emerald-400 font-semibold">৳{Number(data.totals?.cashCollections || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-lg font-bold border-t-2 border-emerald-400">
                <span className="text-emerald-800 dark:text-emerald-300">Total In</span>
                <span className="text-emerald-800 dark:text-emerald-300">৳{totalIn.toLocaleString()}</span>
              </div>
            </div>
            {/* Outflows */}
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">Outflows (-)</h4>
              <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 border-l-4 border-red-500">
                <span className="text-slate-700 dark:text-slate-300">Withdrawals</span>
                <span className="text-red-700 dark:text-red-400 font-semibold">৳{Number(data.totals?.withdrawals || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 border-l-4 border-red-400">
                <span className="text-slate-700 dark:text-slate-300">Cash Expense</span>
                <span className="text-red-700 dark:text-red-400 font-semibold">৳{Number(data.totals?.cashExpense || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/20 border-l-4 border-red-300">
                <span className="text-slate-700 dark:text-slate-300">Cash Deliveries</span>
                <span className="text-red-700 dark:text-red-400 font-semibold">৳{Number(data.totals?.cashDeliveries || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between bg-red-100 dark:bg-red-900/30 p-3 rounded-lg font-bold border-t-2 border-red-400">
                <span className="text-red-800 dark:text-red-300">Total Out</span>
                <span className="text-red-800 dark:text-red-300">৳{totalOut.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <div className="flex justify-between bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg font-bold text-lg mt-4 border-2 border-blue-300 dark:border-blue-700">
            <span className="text-blue-800 dark:text-blue-300">Total Cash in Hand</span>
            <span className="text-blue-800 dark:text-blue-300">৳{Number(data.totals?.totalCashInHand || 0).toLocaleString()}</span>
          </div>
        </CardContent>
      </Card>

      {/* Bank-wise Breakdown */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
            <Building2 className="h-4 w-4 text-primary" /> Bank-wise Breakdown
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">{data.bankBreakdown?.length || 0} bank(s) found</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="table-container rounded-md border border-border max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Bank</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Account No</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Opening</TableHead>
                  <TableHead className="text-emerald-700 dark:text-emerald-400 font-semibold text-right bg-emerald-50/30 dark:bg-emerald-900/10">Deposits</TableHead>
                  <TableHead className="text-red-700 dark:text-red-400 font-semibold text-right bg-red-50/30 dark:bg-red-900/10">Withdrawals</TableHead>
                  <TableHead className="text-blue-700 dark:text-blue-400 font-semibold text-right bg-blue-50/30 dark:bg-blue-900/10">Current Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data.bankBreakdown || data.bankBreakdown.length === 0) ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No bank data</TableCell></TableRow>
                ) : data.bankBreakdown.map((bank: any) => (
                  <TableRow key={bank.bankId} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                    <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{bank.bankName}</TableCell>
                    <TableCell className="text-slate-500 dark:text-slate-400">{bank.accountNo}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300 text-right">৳{Number(bank.openingBalance).toLocaleString()}</TableCell>
                    <TableCell className="text-emerald-700 dark:text-emerald-400 text-right font-medium">৳{Number(bank.deposits).toLocaleString()}</TableCell>
                    <TableCell className="text-red-700 dark:text-red-400 text-right font-medium">৳{Number(bank.withdrawals).toLocaleString()}</TableCell>
                    <TableCell className="text-blue-700 dark:text-blue-400 text-right font-bold">৳{Number(bank.currentBalance).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
            <Clock className="h-4 w-4 text-primary" /> Recent Transactions
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">Latest cash movements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="table-container rounded-md border border-border max-h-64 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Description</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Type</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No recent transactions</TableCell></TableRow>
                ) : recentTransactions.map((t: any, i: number) => (
                  <TableRow key={i} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                    <TableCell className="text-slate-700 dark:text-slate-300 text-sm">{new Date(t.date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300">{t.description}</TableCell>
                    <TableCell>
                      <Badge variant={t.type === "Inflow" ? "default" : "destructive"} className="text-xs">
                        {t.type === "Inflow" ? "↑ In" : "↓ Out"}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-medium ${t.type === "Inflow" ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                      {t.type === "Inflow" ? "+" : "-"}৳{Number(t.amount).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// ADVANCE SEARCH PAGE (Enhanced)
// ============================================================

function AdvanceSearchPage({ onNavigate }: { onNavigate?: (page: PageKey) => void }) {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("products");
  const [results, setResults] = useState<any>({ products: [], customers: [], suppliers: [], employees: [], purchaseOrders: [], salesOrders: [] });
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load search history from localStorage
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("ems-search-history");
      if (saved) setSearchHistory(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveToHistory = (term: string) => {
    if (!term.trim()) return;
    const updated = [term, ...searchHistory.filter(h => h !== term)].slice(0, 5);
    setSearchHistory(updated);
    try { localStorage.setItem("ems-search-history", JSON.stringify(updated)); } catch { /* ignore */ }
  };

  const handleSearch = async (searchTerm?: string) => {
    const q = searchTerm || query;
    if (!q.trim()) return;
    setLoading(true);
    saveToHistory(q);
    try {
      const res = await fetch(`/api/reports/advance-search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data);
      setSearched(true);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const handleQueryChange = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (val.trim().length >= 2) {
      debounceRef.current = setTimeout(() => handleSearch(val), 500);
    }
  };

  const entityTabs = [
    { key: "products", label: "Products", icon: <Package className="h-3.5 w-3.5" />, page: "products" as PageKey },
    { key: "customers", label: "Customers", icon: <Users className="h-3.5 w-3.5" />, page: "customers" as PageKey },
    { key: "suppliers", label: "Suppliers", icon: <Truck className="h-3.5 w-3.5" />, page: "suppliers" as PageKey },
    { key: "employees", label: "Employees", icon: <UserCheck className="h-3.5 w-3.5" />, page: "employees" as PageKey },
    { key: "purchaseOrders", label: "Purchase Orders", icon: <ShoppingCart className="h-3.5 w-3.5" />, page: "purchase-orders" as PageKey },
    { key: "salesOrders", label: "Sales Orders", icon: <CartIcon className="h-3.5 w-3.5" />, page: "sales-orders" as PageKey },
  ];

  const renderTable = (items: any[], columns: { key: string; label: string; render?: (item: any) => React.ReactNode }[], onRowClick?: (item: any) => void) => {
    if (items.length === 0) return (
      <div className="text-center py-8 text-slate-500 dark:text-slate-400">
        <Search className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No results found</p>
      </div>
    );
    return (
      <div className="table-container rounded-md border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-navy-900/70 dark:to-navy-900/50">
              {columns.map(col => <TableHead key={col.key} className="text-slate-600 dark:text-slate-300 font-semibold text-xs uppercase tracking-wider">{col.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => (
              <TableRow key={i} className={`hover:bg-slate-50 dark:hover:bg-navy-900/30 cursor-pointer ${onRowClick ? "hover:bg-primary/5 dark:hover:bg-primary/10" : ""}`} onClick={() => onRowClick?.(item)}>
                {columns.map(col => (
                  <TableCell key={col.key} className="text-slate-700 dark:text-slate-300 text-sm">
                    {col.render ? col.render(item) : String(item[col.key] ?? "—")}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Search className="h-6 w-6 text-primary" />
          Advance Search
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Search across all modules — products, customers, suppliers, employees, orders</p>
      </div>

      {/* Search Input */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 dark:text-slate-500" />
              <Input
                placeholder="Search by name, code, phone, status..."
                value={query}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { if (debounceRef.current) clearTimeout(debounceRef.current); handleSearch(); } }}
                className="pl-9 bg-white dark:bg-navy-900/50 border-slate-200 dark:border-slate-700"
                autoFocus
              />
              {query && (
                <Button variant="ghost" size="sm" onClick={() => { setQuery(""); setSearched(false); }} className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 p-0">
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Button onClick={() => { if (debounceRef.current) clearTimeout(debounceRef.current); handleSearch(); }} className="bg-primary text-primary-foreground shadow-sm" disabled={loading}>
              {loading ? <RefreshCcw className="h-4 w-4 mr-1.5 animate-spin" /> : <Search className="h-4 w-4 mr-1.5" />}
              Search
            </Button>
          </div>

          {/* Search History */}
          {searchHistory.length > 0 && !searched && (
            <div className="mt-3 flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Recent:</span>
              {searchHistory.map((h, i) => (
                <Button key={i} variant="outline" size="sm" className="h-6 text-xs border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400" onClick={() => { setQuery(h); handleSearch(h); }}>
                  <Clock className="h-3 w-3 mr-1" />{h}
                </Button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {loading && (
        <div className="text-center py-12">
          <RefreshCcw className="h-8 w-8 mx-auto text-primary animate-spin mb-2" />
          <p className="text-slate-500 dark:text-slate-400 text-sm">Searching across all modules...</p>
        </div>
      )}

      {searched && !loading && (
        <>
          {/* Entity type selector tabs */}
          <div className="flex flex-wrap gap-2">
            {entityTabs.map(tab => {
              const count = (results as any)[tab.key]?.length || 0;
              return (
                <Button
                  key={tab.key}
                  variant={activeTab === tab.key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setActiveTab(tab.key)}
                  className={activeTab === tab.key
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-navy-900/50"
                  }
                >
                  {tab.icon}
                  <span className="ml-1.5">{tab.label}</span>
                  <Badge variant="secondary" className="ml-1.5 h-5 min-w-[20px] flex items-center justify-center text-[10px] px-1.5">
                    {count}
                  </Badge>
                </Button>
              );
            })}
          </div>

          {/* Total results summary */}
          <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
            <span>Total results: {Object.values(results).reduce((sum: number, arr: any) => sum + (Array.isArray(arr) ? arr.length : 0), 0) as number}</span>
          </div>

          {/* Tab content */}
          {activeTab === "products" && renderTable(results.products || [], [
            { key: "name", label: "Name", render: (i: any) => <span className="font-medium text-slate-900 dark:text-white">{i.name}</span> },
            { key: "productCode", label: "Code" },
            { key: "category", label: "Category", render: (i: any) => i.category?.name || "—" },
            { key: "salePrice", label: "Sale Price", render: (i: any) => `৳${Number(i.salePrice).toLocaleString()}` },
            { key: "isActive", label: "Status", render: (i: any) => <StatusBadge status={i.isActive ? "Active" : "Inactive"} /> },
          ], onNavigate ? () => onNavigate("products") : undefined)}

          {activeTab === "customers" && renderTable(results.customers || [], [
            { key: "name", label: "Name", render: (i: any) => <span className="font-medium text-slate-900 dark:text-white">{i.name}</span> },
            { key: "customerCode", label: "Code" },
            { key: "phone", label: "Phone" },
            { key: "address", label: "Address" },
            { key: "isActive", label: "Status", render: (i: any) => <StatusBadge status={i.isActive ? "Active" : "Inactive"} /> },
          ], onNavigate ? () => onNavigate("customers") : undefined)}

          {activeTab === "suppliers" && renderTable(results.suppliers || [], [
            { key: "name", label: "Name", render: (i: any) => <span className="font-medium text-slate-900 dark:text-white">{i.name}</span> },
            { key: "supplierCode", label: "Code" },
            { key: "phone", label: "Phone" },
            { key: "address", label: "Address" },
            { key: "isActive", label: "Status", render: (i: any) => <StatusBadge status={i.isActive ? "Active" : "Inactive"} /> },
          ], onNavigate ? () => onNavigate("suppliers") : undefined)}

          {activeTab === "employees" && renderTable(results.employees || [], [
            { key: "name", label: "Name", render: (i: any) => <span className="font-medium text-slate-900 dark:text-white">{i.name}</span> },
            { key: "employeeCode", label: "Code" },
            { key: "designation", label: "Designation", render: (i: any) => i.designation?.name || "—" },
            { key: "department", label: "Department", render: (i: any) => i.department?.name || "—" },
            { key: "phone", label: "Phone" },
            { key: "isActive", label: "Status", render: (i: any) => <StatusBadge status={i.isActive ? "Active" : "Inactive"} /> },
          ], onNavigate ? () => onNavigate("employees") : undefined)}

          {activeTab === "purchaseOrders" && renderTable(results.purchaseOrders || [], [
            { key: "poNumber", label: "PO Number", render: (i: any) => <span className="font-medium text-slate-900 dark:text-white">{i.poNumber}</span> },
            { key: "supplier", label: "Supplier", render: (i: any) => i.supplier?.name || "—" },
            { key: "grandTotal", label: "Total", render: (i: any) => `৳${Number(i.grandTotal).toLocaleString()}` },
            { key: "status", label: "Status", render: (i: any) => <StatusBadge status={i.status || "Pending"} /> },
          ], onNavigate ? () => onNavigate("purchase-orders") : undefined)}

          {activeTab === "salesOrders" && renderTable(results.salesOrders || [], [
            { key: "invoiceNo", label: "Invoice No", render: (i: any) => <span className="font-medium text-slate-900 dark:text-white">{i.invoiceNo}</span> },
            { key: "customer", label: "Customer", render: (i: any) => i.customer?.name || "—" },
            { key: "grandTotal", label: "Total", render: (i: any) => `৳${Number(i.grandTotal).toLocaleString()}` },
            { key: "status", label: "Status", render: (i: any) => <StatusBadge status={i.status || "Pending"} /> },
          ], onNavigate ? () => onNavigate("sales-orders") : undefined)}
        </>
      )}

      {/* Empty state */}
      {!searched && !loading && (
        <Card className="border-border">
          <CardContent className="py-16 text-center">
            <Search className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <h3 className="text-lg font-medium text-slate-900 dark:text-white">Search Across Your Data</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md mx-auto">
              Search products, customers, suppliers, employees, purchase orders, and sales orders by name, code, or phone number.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// TRANSFER PAGE
// ============================================================

function TransferPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [godowns, setGodowns] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({ fromGodownId: "", toGodownId: "", date: "", notes: "" });
  const [lines, setLines] = useState<{ productId: string; quantity: number }[]>([{ productId: "", quantity: 1 }]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/transfers").then(r => r.json()).then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/godowns").then(r => r.json()).then(setGodowns).catch(() => {});
      fetch("/api/products").then(r => r.json()).then(setProducts).catch(() => {});
    }
  }, [dialogOpen]);

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  };
  const addLine = () => setLines(prev => [...prev, { productId: "", quantity: 1 }]);
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    try {
      const res = await fetch("/api/transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lines }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "Stock transfer created successfully" });
      setDialogOpen(false);
      setForm({ fromGodownId: "", toGodownId: "", date: "", notes: "" });
      setLines([{ productId: "", quantity: 1 }]);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to create transfer", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock Transfers</h1>
        <p className="text-slate-500 dark:text-slate-400">Transfer stock between godowns</p>
      </div>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Transfers</CardTitle>
            <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add Transfer</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Transfer No</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">From</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">To</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No transfers</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.transferNo}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.fromGodown?.name || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.toGodown?.name || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.lines?.length || 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Stock Transfer</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">From Godown</Label>
                <Select value={form.fromGodownId} onValueChange={(v) => setForm({ ...form, fromGodownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select source" /></SelectTrigger>
                  <SelectContent>
                    {godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">To Godown</Label>
                <Select value={form.toGodownId} onValueChange={(v) => setForm({ ...form, toGodownId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select destination" /></SelectTrigger>
                  <SelectContent>
                    {godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
              </div>
            </div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 dark:text-slate-300 font-semibold">Line Items</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="text-slate-700 dark:text-slate-300"><Plus className="h-4 w-4 mr-1" /> Add Line</Button>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-7">
                    {idx === 0 && <Label className="text-xs text-slate-500">Product</Label>}
                    <Select value={line.productId} onValueChange={(v) => updateLine(idx, "productId", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
                    <Input type="number" className="h-9" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-500 h-9"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// SEND SMS PAGE
// ============================================================

function SendSmsPage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ recipient: "", message: "", template: "" });
  const [sending, setSending] = useState(false);
  const [recentLogs, setRecentLogs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [recipientType, setRecipientType] = useState<"manual" | "customer">("manual");

  const templates: Record<string, string> = {
    "Payment Reminder": "Dear {name}, your payment of ৳{amount} is due. Please clear your dues at your earliest convenience. Thank you.",
    "Order Confirmation": "Dear {name}, your order has been confirmed. Invoice #{invoiceNo}. Total: ৳{amount}. Thank you for your purchase!",
    "Delivery Update": "Dear {name}, your order #{invoiceNo} has been dispatched and will be delivered soon. Track your order for live updates.",
    "Promotional": "Dear {name}, exciting offers await you at Electronics Mart! Visit us today for exclusive deals on electronics and gadgets.",
  };

  const loadData = useCallback(() => {
    fetch("/api/sms-logs").then((r) => r.json()).then((d) => { setRecentLogs(Array.isArray(d) ? d.slice(0, 10) : []); }).catch(() => {});
    fetch("/api/customers").then((r) => r.json()).then((d) => { setCustomers(Array.isArray(d) ? d : []); }).catch(() => {});
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  const handleTemplateSelect = (tpl: string) => {
    setForm((prev) => ({ ...prev, template: tpl, message: templates[tpl] || "" }));
  };

  const handleCustomerSelect = (customerId: string) => {
    const customer = customers.find((c: any) => c.id === customerId);
    if (customer) {
      setForm((prev) => ({ ...prev, recipient: customer.phone || "" }));
    }
  };

  const handleSend = async () => {
    if (!form.recipient || !form.message) {
      toast({ title: "Error", description: "Recipient and message are required", variant: "destructive" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/sms-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient: form.recipient,
          message: form.message,
          status: "Sent",
          cost: 0.5,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "SMS Sent", description: `Message sent to ${form.recipient}` });
      setForm({ recipient: "", message: "", template: "" });
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to send SMS", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <PhoneCall className="h-6 w-6 text-primary" />
          Send SMS
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Compose and send SMS to contacts</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Compose Form */}
        <Card className="border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Compose Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Recipient Type */}
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Recipient Type</Label>
              <Select value={recipientType} onValueChange={(v: "manual" | "customer") => setRecipientType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Entry</SelectItem>
                  <SelectItem value="customer">Select Customer</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recipientType === "customer" ? (
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Select Customer</Label>
                <Select onValueChange={handleCustomerSelect}>
                  <SelectTrigger><SelectValue placeholder="Choose a customer" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.name} {c.phone ? `(${c.phone})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Recipient Phone</Label>
              <Input
                placeholder="e.g. +8801712345678"
                value={form.recipient}
                onChange={(e) => setForm({ ...form, recipient: e.target.value })}
              />
            </div>

            {/* Template Selector */}
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Quick Template</Label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(templates).map((tpl) => (
                  <Button
                    key={tpl}
                    variant={form.template === tpl ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleTemplateSelect(tpl)}
                    className={form.template === tpl ? "bg-primary text-primary-foreground" : "text-slate-700 dark:text-slate-300"}
                  >
                    {tpl}
                  </Button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-slate-700 dark:text-slate-300">Message</Label>
                <span className={`text-xs ${form.message.length > 160 ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>
                  {form.message.length}/160
                </span>
              </div>
              <Textarea
                placeholder="Type your message here..."
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value, template: "" })}
                rows={5}
                className="resize-none"
              />
              {form.message.length > 160 && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  ⚠ Message exceeds 160 characters — may be split into multiple SMS
                </p>
              )}
            </div>

            <Button onClick={handleSend} disabled={sending} className="bg-primary text-primary-foreground w-full sm:w-auto">
              {sending ? <><RefreshCcw className="h-4 w-4 mr-2 animate-spin" /> Sending...</> : <><PhoneCall className="h-4 w-4 mr-2" /> Send SMS</>}
            </Button>
          </CardContent>
        </Card>

        {/* Recent Sent */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
              <Clock className="h-5 w-5 text-amber-500" />
              Recent Sent
            </CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">Last 10 messages</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentLogs.length === 0 ? (
                <p className="text-center text-slate-500 dark:text-slate-400 py-4 text-sm">No messages sent yet</p>
              ) : recentLogs.map((log: any) => (
                <div key={log.id} className="p-3 rounded-lg bg-slate-50 dark:bg-navy-900/30 border border-border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-900 dark:text-white">{log.recipient}</span>
                    <Badge variant={log.status === "Sent" || log.status === "Delivered" ? "default" as const : log.status === "Failed" ? "destructive" as const : "secondary" as const} className="text-xs">
                      {log.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{log.message}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    {log.sentAt ? new Date(log.sentAt).toLocaleString() : ""}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ============================================================
// SMS INBOX PAGE
// ============================================================

function SmsInboxPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("All");

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/sms-logs").then((r) => r.json()).then((d) => { setData(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    if (statusFilter === "All") return data;
    return data.filter((item) => item.status === statusFilter);
  }, [data, statusFilter]);

  const handleExportCSV = () => {
    const headers = "Recipient,Message,Status,Sent At,Cost";
    const rows = filtered.map((i) => `"${i.recipient}","${(i.message || "").replace(/"/g, '""')}","${i.status}","${i.sentAt ? new Date(i.sentAt).toLocaleString() : ""}","${i.cost || 0}"`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sms-inbox.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("SMS Inbox Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Recipient", "Message", "Status", "Sent At", "Cost"]],
      body: filtered.map((i) => [i.recipient, (i.message || "").substring(0, 60), i.status, i.sentAt ? new Date(i.sentAt).toLocaleString() : "", `৳${Number(i.cost || 0).toFixed(2)}`]),
    });
    doc.save("sms-inbox.pdf");
  };

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { All: data.length, Sent: 0, Delivered: 0, Failed: 0, Pending: 0 };
    data.forEach((item) => { if (counts[item.status] !== undefined) counts[item.status]++; });
    return counts;
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Mail className="h-6 w-6 text-primary" />
            SMS Inbox
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">View sent and received SMS logs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {["All", "Sent", "Delivered", "Failed", "Pending"].map((status) => (
          <Button
            key={status}
            variant={statusFilter === status ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(status)}
            className={statusFilter === status ? "bg-primary text-primary-foreground" : "text-slate-700 dark:text-slate-300"}
          >
            {status} ({statusCounts[status] || 0})
          </Button>
        ))}
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : (
            <div className="table-container rounded-md border border-border max-h-[500px] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Recipient</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Message</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Sent At</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No SMS logs found</TableCell></TableRow>
                  ) : filtered.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.recipient}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 max-w-xs truncate">{item.message || "-"}</TableCell>
                      <TableCell>
                        <Badge variant={item.status === "Sent" || item.status === "Delivered" ? "default" as const : item.status === "Failed" ? "destructive" as const : "secondary" as const}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 text-sm">
                        {item.sentAt ? new Date(item.sentAt).toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(item.cost || 0).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// SMS BILLS PAGE
// ============================================================

function SmsBillsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ period: "", totalSms: 0, totalCost: 0, paidAmount: 0, status: "Unpaid" });

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/sms-bills").then((r) => r.json()).then((d) => { setData(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!form.period) {
      toast({ title: "Error", description: "Period is required", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/sms-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "SMS bill created successfully" });
      setDialogOpen(false);
      setForm({ period: "", totalSms: 0, totalCost: 0, paidAmount: 0, status: "Unpaid" });
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to create SMS bill", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "Period,Total SMS,Total Cost,Paid Amount,Status";
    const rows = data.map((i) => `${i.period},${i.totalSms},${i.totalCost},${i.paidAmount},${i.status}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sms-bills.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("SMS Bills Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Period", "Total SMS", "Total Cost", "Paid Amount", "Status"]],
      body: data.map((i) => [i.period, i.totalSms, `৳${Number(i.totalCost).toLocaleString()}`, `৳${Number(i.paidAmount).toLocaleString()}`, i.status]),
    });
    doc.save("sms-bills.pdf");
  };

  const billStatusBadge = (status: string) => {
    if (status === "Paid") return <Badge variant="default" className="bg-green-600">Paid</Badge>;
    if (status === "Partial") return <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">Partial</Badge>;
    return <Badge variant="destructive">Unpaid</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="h-6 w-6 text-primary" />
            SMS Bills
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Track SMS usage and billing</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" /> Add Bill
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Bills</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.length}</p>
              </div>
              <div className="bg-primary/10 p-3 rounded-xl"><Receipt className="h-5 w-5 text-primary" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Cost</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">৳{data.reduce((s: number, i: any) => s + Number(i.totalCost), 0).toLocaleString()}</p>
              </div>
              <div className="bg-red-500/10 p-3 rounded-xl"><TrendingDown className="h-5 w-5 text-red-500" /></div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-500 dark:text-slate-400">Total Paid</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">৳{data.reduce((s: number, i: any) => s + Number(i.paidAmount), 0).toLocaleString()}</p>
              </div>
              <div className="bg-green-500/10 p-3 rounded-xl"><CheckCircle className="h-5 w-5 text-green-500" /></div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : (
            <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Period</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Total SMS</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Total Cost</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Paid Amount</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Payments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No SMS bills</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.period}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.totalSms}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(item.totalCost).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(item.paidAmount).toLocaleString()}</TableCell>
                      <TableCell>{billStatusBadge(item.status)}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 text-sm">{(item.payments || []).length} payment(s)</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add SMS Bill</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Period</Label>
              <Input placeholder="e.g. January 2025" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Total SMS</Label>
                <Input type="number" value={form.totalSms} onChange={(e) => setForm({ ...form, totalSms: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Total Cost (৳)</Label>
                <Input type="number" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Paid Amount (৳)</Label>
                <Input type="number" value={form.paidAmount} onChange={(e) => setForm({ ...form, paidAmount: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Unpaid">Unpaid</SelectItem>
                    <SelectItem value="Partial">Partial</SelectItem>
                    <SelectItem value="Paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// SMS BILL PAYMENTS PAGE
// ============================================================

function SmsBillPaymentsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ smsBillId: "", amount: 0, date: "", method: "Cash", notes: "" });

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/sms-bill-payments").then((r) => r.json()).then((d) => { setData(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/sms-bills").then((r) => r.json()).then((d) => { setBills(Array.isArray(d) ? d : []); }).catch(() => {});
    }
  }, [dialogOpen]);

  const handleSave = async () => {
    if (!form.smsBillId || !form.amount || !form.date) {
      toast({ title: "Error", description: "Bill, amount, and date are required", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/sms-bill-payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "Payment recorded successfully" });
      setDialogOpen(false);
      setForm({ smsBillId: "", amount: 0, date: "", method: "Cash", notes: "" });
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to record payment", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "Bill Period,Amount,Payment Date,Method,Notes";
    const rows = data.map((i) => `${i.smsBill?.period || ""},${i.amount},${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.method || ""},${i.notes || ""}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sms-bill-payments.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("SMS Bill Payments Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Bill Period", "Amount", "Payment Date", "Method", "Notes"]],
      body: data.map((i) => [i.smsBill?.period || "", `৳${Number(i.amount).toLocaleString()}`, i.date ? new Date(i.date).toLocaleDateString() : "", i.method || "-", i.notes || "-"]),
    });
    doc.save("sms-bill-payments.pdf");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <DollarSign className="h-6 w-6 text-primary" />
            SMS Bill Payments
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Record payments to SMS provider</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
          <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-1" /> Add Payment
          </Button>
        </div>
      </div>

      <Card className="border-border">
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-8 text-slate-500">Loading...</div>
          ) : (
            <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Bill Period</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Amount</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Payment Date</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Method</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No payments recorded</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.smsBill?.period || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(item.amount).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.method || "-"}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 text-sm">{item.notes || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Payment</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Select Bill</Label>
              <Select value={form.smsBillId} onValueChange={(v) => setForm({ ...form, smsBillId: v })}>
                <SelectTrigger><SelectValue placeholder="Choose a bill" /></SelectTrigger>
                <SelectContent>
                  {bills.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.period} — ৳{Number(b.totalCost).toLocaleString()} ({b.status})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Amount (৳)</Label>
                <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Payment Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Payment Method</Label>
              <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank Transfer">Bank Transfer</SelectItem>
                  <SelectItem value="Mobile Payment">Mobile Payment</SelectItem>
                  <SelectItem value="Cheque">Cheque</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Notes</Label>
              <Input placeholder="Optional reference or notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// SMS REPORTS PAGE
// ============================================================

function SmsReportsPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/sms-logs").then((r) => r.json()).then((d) => { setData(Array.isArray(d) ? d : []); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  const filtered = useMemo(() => {
    if (!dateFrom && !dateTo) return data;
    return data.filter((item) => {
      const sentAt = item.sentAt ? new Date(item.sentAt) : null;
      if (!sentAt) return false;
      if (dateFrom && sentAt < new Date(dateFrom)) return false;
      if (dateTo && sentAt > new Date(dateTo + "T23:59:59")) return false;
      return true;
    });
  }, [data, dateFrom, dateTo]);

  const summary = useMemo(() => {
    const totalSms = filtered.length;
    const delivered = filtered.filter((i) => i.status === "Delivered" || i.status === "Sent").length;
    const failed = filtered.filter((i) => i.status === "Failed").length;
    const totalCost = filtered.reduce((s: number, i: any) => s + Number(i.cost || 0), 0);
    return { totalSms, delivered, failed, totalCost };
  }, [filtered]);

  const dailyVolume = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((item) => {
      const day = item.sentAt ? new Date(item.sentAt).toLocaleDateString("en-CA") : "Unknown";
      map[day] = (map[day] || 0) + 1;
    });
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-14)
      .map(([date, count]) => ({ date, count }));
  }, [filtered]);

  const statusDistribution = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((item) => { map[item.status] = (map[item.status] || 0) + 1; });
    const colors: Record<string, string> = { Sent: "#2563eb", Delivered: "#16a34a", Failed: "#dc2626", Pending: "#f59e0b" };
    return Object.entries(map).map(([name, value]) => ({ name, value, color: colors[name] || "#6b7280" }));
  }, [filtered]);

  const handleExportCSV = () => {
    const headers = "Recipient,Message,Status,Sent At,Cost";
    const rows = filtered.map((i) => `"${i.recipient}","${(i.message || "").replace(/"/g, '""')}","${i.status}","${i.sentAt ? new Date(i.sentAt).toLocaleString() : ""}","${i.cost || 0}"`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sms-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("SMS Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Recipient", "Message", "Status", "Sent At", "Cost"]],
      body: filtered.map((i) => [i.recipient, (i.message || "").substring(0, 60), i.status, i.sentAt ? new Date(i.sentAt).toLocaleString() : "", `৳${Number(i.cost || 0).toFixed(2)}`]),
    });
    doc.save("sms-report.pdf");
  };

  const summaryCards = [
    { title: "Total SMS", value: summary.totalSms, icon: <Phone className="h-6 w-6" />, gradient: "from-blue-500 to-blue-700" },
    { title: "Delivered", value: summary.delivered, icon: <CheckCircle className="h-6 w-6" />, gradient: "from-green-500 to-emerald-700" },
    { title: "Failed", value: summary.failed, icon: <AlertTriangle className="h-6 w-6" />, gradient: "from-red-500 to-rose-700" },
    { title: "Total Cost", value: `৳${summary.totalCost.toFixed(2)}`, icon: <Banknote className="h-6 w-6" />, gradient: "from-amber-500 to-orange-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="h-6 w-6 text-primary" />
            SMS Reports
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Filterable SMS reports and analytics</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Date Range Filter */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="grid gap-1">
              <Label className="text-sm text-slate-700 dark:text-slate-300">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1">
              <Label className="text-sm text-slate-700 dark:text-slate-300">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
            </div>
            <Button variant="outline" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-slate-700 dark:text-slate-300">
              Clear
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.map((card, i) => (
          <Card key={i} className="border-border overflow-hidden">
            <CardContent className="p-0">
              <div className={`bg-gradient-to-br ${card.gradient} p-4 text-white`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/80">{card.title}</p>
                    <p className="text-2xl font-bold mt-1">{loading ? "—" : card.value}</p>
                  </div>
                  <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm">{card.icon}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-border lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart className="h-5 w-5 text-primary" />
              Daily SMS Volume
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {dailyVolume.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">No data available</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <RechartsBarChart data={dailyVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                    <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} />
                    <Bar dataKey="count" fill="#2563eb" radius={[4, 4, 0, 0]} name="SMS Count" />
                  </RechartsBarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <PieChartIcon className="h-5 w-5 text-primary" />
              Status Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              {statusDistribution.length === 0 ? (
                <div className="flex items-center justify-center h-full text-slate-500 dark:text-slate-400">No data available</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusDistribution} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value">
                      {statusDistribution.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {statusDistribution.map((s, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-xs text-slate-600 dark:text-slate-400">{s.name} ({s.value})</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 dark:text-white">Detailed SMS Logs</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Recipient</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Message</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Sent At</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No SMS logs found</TableCell></TableRow>
                ) : filtered.map((item) => (
                  <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                    <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.recipient}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300 max-w-xs truncate">{item.message || "-"}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === "Sent" || item.status === "Delivered" ? "default" as const : item.status === "Failed" ? "destructive" as const : "secondary" as const}>
                        {item.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300 text-sm">{item.sentAt ? new Date(item.sentAt).toLocaleString() : "-"}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(item.cost || 0).toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// BULK SMS PAGE
// ============================================================

function BulkSmsPage() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [recipientType, setRecipientType] = useState<"all-customers" | "all-suppliers" | "custom">("all-customers");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [template, setTemplate] = useState("");
  const [sending, setSending] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const templates: Record<string, string> = {
    "Payment Reminder": "Dear valued customer, your payment is overdue. Please clear your dues at the earliest. Thank you for your continued business.",
    "Order Confirmation": "Thank you for your order! We are processing it and will notify you once it's ready for delivery. — Electronics Mart",
    "Delivery Update": "Great news! Your order has been dispatched and is on its way. Expect delivery within 2-3 business days. — Electronics Mart",
    "Promotional": "🎉 Special Offer at Electronics Mart! Get up to 30% off on electronics this week. Visit us today! Limited time only.",
  };

  React.useEffect(() => {
    fetch("/api/customers").then((r) => r.json()).then((d) => { setCustomers(Array.isArray(d) ? d : []); }).catch(() => {});
    fetch("/api/suppliers").then((r) => r.json()).then((d) => { setSuppliers(Array.isArray(d) ? d : []); }).catch(() => {});
  }, []);

  const recipients = useMemo(() => {
    if (recipientType === "all-customers") return customers.filter((c) => c.phone);
    if (recipientType === "all-suppliers") return suppliers.filter((s) => s.phone);
    return [...customers, ...suppliers].filter((item) => selectedIds.has(item.id) && item.phone);
  }, [recipientType, customers, suppliers, selectedIds]);

  const toggleRecipient = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleTemplateSelect = (tpl: string) => {
    setTemplate(tpl);
    setMessage(templates[tpl] || "");
  };

  const handleBulkSend = async () => {
    if (recipients.length === 0) {
      toast({ title: "Error", description: "No recipients with phone numbers found", variant: "destructive" });
      return;
    }
    if (!message) {
      toast({ title: "Error", description: "Message cannot be empty", variant: "destructive" });
      return;
    }
    setSending(true);
    setPreviewOpen(false);
    let successCount = 0;
    let failCount = 0;
    try {
      for (const r of recipients) {
        try {
          const res = await fetch("/api/sms-logs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recipient: r.phone, message, status: "Sent", cost: 0.5 }),
          });
          if (res.ok) successCount++; else failCount++;
        } catch { failCount++; }
      }
      toast({
        title: "Bulk SMS Complete",
        description: `Sent: ${successCount}, Failed: ${failCount}`,
        variant: failCount > 0 ? "destructive" : "default",
      });
      setMessage("");
      setTemplate("");
    } catch {
      toast({ title: "Error", description: "Bulk SMS sending failed", variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const allItems = useMemo(() => [...customers, ...suppliers], [customers, suppliers]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Phone className="h-6 w-6 text-primary" />
          Bulk SMS
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Send promotional messages in bulk</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Recipient selection */}
        <Card className="border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white">Select Recipients</CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">
              {recipients.length} recipient(s) with phone numbers
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Recipient Group</Label>
              <Select value={recipientType} onValueChange={(v: "all-customers" | "all-suppliers" | "custom") => { setRecipientType(v); setSelectedIds(new Set()); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all-customers">All Customers ({customers.filter((c) => c.phone).length})</SelectItem>
                  <SelectItem value="all-suppliers">All Suppliers ({suppliers.filter((s) => s.phone).length})</SelectItem>
                  <SelectItem value="custom">Custom Selection</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {recipientType === "custom" && (
              <div className="border border-border rounded-lg max-h-64 overflow-y-auto p-3 space-y-2">
                <div className="flex items-center gap-2 pb-2 border-b border-border mb-2">
                  <Checkbox
                    checked={selectedIds.size === allItems.filter((i) => i.phone).length && allItems.filter((i) => i.phone).length > 0}
                    onCheckedChange={(checked) => {
                      if (checked) setSelectedIds(new Set(allItems.filter((i) => i.phone).map((i) => i.id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Select All</span>
                </div>
                {allItems.filter((i) => i.phone).map((item) => (
                  <div key={item.id} className="flex items-center gap-2 py-1">
                    <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleRecipient(item.id)} />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{item.name}</span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-auto">{item.phone}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right: Message compose */}
        <Card className="border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Compose Message
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Quick Template</Label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(templates).map((tpl) => (
                  <Button
                    key={tpl}
                    variant={template === tpl ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleTemplateSelect(tpl)}
                    className={template === tpl ? "bg-primary text-primary-foreground" : "text-slate-700 dark:text-slate-300"}
                  >
                    {tpl}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="text-slate-700 dark:text-slate-300">Message</Label>
                <span className={`text-xs ${message.length > 160 ? "text-red-500" : "text-slate-500 dark:text-slate-400"}`}>
                  {message.length}/160
                </span>
              </div>
              <Textarea
                placeholder="Type your bulk message..."
                value={message}
                onChange={(e) => { setMessage(e.target.value); setTemplate(""); }}
                rows={6}
                className="resize-none"
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-navy-900/30 border border-border">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400">Recipients:</span>
                <span className="font-medium text-slate-900 dark:text-white">{recipients.length}</span>
              </div>
              <div className="flex items-center justify-between text-sm mt-1">
                <span className="text-slate-600 dark:text-slate-400">Est. Cost:</span>
                <span className="font-medium text-slate-900 dark:text-white">৳{(recipients.length * 0.5).toFixed(2)}</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setPreviewOpen(true)}
                disabled={!message || recipients.length === 0}
                className="flex-1 text-slate-700 dark:text-slate-300"
              >
                <Eye className="h-4 w-4 mr-1" /> Preview
              </Button>
              <Button
                onClick={() => setPreviewOpen(true)}
                disabled={!message || recipients.length === 0 || sending}
                className="flex-1 bg-primary text-primary-foreground"
              >
                {sending ? <><RefreshCcw className="h-4 w-4 mr-1 animate-spin" /> Sending...</> : <><PhoneCall className="h-4 w-4 mr-1" /> Send Bulk</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Confirm Bulk SMS</DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              Review before sending
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-4 rounded-lg bg-slate-50 dark:bg-navy-900/30 border border-border">
              <p className="text-sm font-medium text-slate-900 dark:text-white mb-2">Message Preview:</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{message}</p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/30">
                <p className="text-blue-600 dark:text-blue-400 font-medium">Recipients</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{recipients.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/30">
                <p className="text-amber-600 dark:text-amber-400 font-medium">Total Cost</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">৳{(recipients.length * 0.5).toFixed(2)}</p>
              </div>
            </div>
            <div className="max-h-32 overflow-y-auto border border-border rounded-lg p-2">
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Recipients List:</p>
              {recipients.slice(0, 20).map((r) => (
                <p key={r.id} className="text-xs text-slate-500 dark:text-slate-400">{r.name} — {r.phone}</p>
              ))}
              {recipients.length > 20 && (
                <p className="text-xs text-slate-400 mt-1">... and {recipients.length - 20} more</p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleBulkSend} disabled={sending} className="bg-primary text-primary-foreground">
              {sending ? <><RefreshCcw className="h-4 w-4 mr-1 animate-spin" /> Sending...</> : <><PhoneCall className="h-4 w-4 mr-1" /> Confirm & Send</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// ORDER SHEET PAGE
// ============================================================

function OrderSheetPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [viewItem, setViewItem] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [form, setForm] = useState({ date: "", notes: "" });
  const [lines, setLines] = useState<{ productId: string; quantity: number; rate: number; total: number }[]>([{ productId: "", quantity: 1, rate: 0, total: 0 }]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/order-sheets").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/products").then((r) => r.json()).then(setProducts).catch(() => {});
    }
  }, [dialogOpen]);

  const grandTotal = lines.reduce((s, l) => s + l.total, 0);

  const updateLine = (idx: number, field: string, value: any) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "productId") {
        const prod = products.find((p: any) => p.id === value);
        if (prod) { updated.rate = prod.costPrice; }
      }
      if (field === "quantity" || field === "rate" || field === "productId") {
        updated.total = Number(updated.quantity) * Number(updated.rate);
      }
      return updated;
    }));
  };

  const addLine = () => setLines((prev) => [...prev, { productId: "", quantity: 1, rate: 0, total: 0 }]);
  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    try {
      const res = await fetch("/api/order-sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, lines: lines.filter((l) => l.productId) }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "Order sheet created successfully" });
      setDialogOpen(false);
      setForm({ date: "", notes: "" });
      setLines([{ productId: "", quantity: 1, rate: 0, total: 0 }]);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to create order sheet", variant: "destructive" });
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await fetch(`/api/order-sheets/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Updated", description: `Status changed to ${status}` });
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleView = (item: any) => {
    setViewItem(item);
    setViewDialogOpen(true);
  };

  const handleExportCSV = () => {
    const headers = "Sheet No,Date,Total Items,Grand Total,Status";
    const rows = data.map((i) => `${i.sheetNo},${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.lines?.length || 0},${i.lines?.reduce((s: number, l: any) => s + (l.total || 0), 0) || 0},${i.status || "Draft"}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "order-sheets.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Order Sheets Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Sheet No", "Date", "Total Items", "Grand Total", "Status"]],
      body: data.map((i) => [i.sheetNo, i.date ? new Date(i.date).toLocaleDateString() : "", String(i.lines?.length || 0), `৳${(i.lines?.reduce((s: number, l: any) => s + (l.total || 0), 0) || 0).toLocaleString()}`, i.status || "Draft"]),
    });
    doc.save("order-sheets.pdf");
  };

  const statusFlow = ["Draft", "Confirmed", "Processing", "Completed"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Order Sheets</h1>
        <p className="text-slate-500 dark:text-slate-400">Create and manage purchase order worksheets</p>
      </div>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Order Sheets</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add Sheet</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Sheet No</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Total Items</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No order sheets</TableCell></TableRow>
                  ) : data.map((item) => {
                    const itemTotal = item.lines?.reduce((s: number, l: any) => s + (l.total || 0), 0) || 0;
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.sheetNo}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{item.lines?.length || 0}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{itemTotal.toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={item.status || "Draft"} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleView(item)} className="text-blue-600 dark:text-blue-400"><Eye className="h-4 w-4" /></Button>
                            {item.status !== "Completed" && (
                              <Button variant="ghost" size="sm" onClick={() => {
                                const nextIdx = statusFlow.indexOf(item.status || "Draft") + 1;
                                if (nextIdx < statusFlow.length) handleStatusChange(item.id, statusFlow[nextIdx]);
                              }} className="text-green-600 dark:text-green-400">
                                <CheckCircle className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Order Sheet Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Order Sheet</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Notes</Label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
              </div>
            </div>
            <Separator />
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-slate-700 dark:text-slate-300 font-semibold">Product Lines</Label>
                <Button variant="outline" size="sm" onClick={addLine} className="text-slate-700 dark:text-slate-300"><Plus className="h-4 w-4 mr-1" /> Add Line</Button>
              </div>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <Label className="text-xs text-slate-500">Product</Label>}
                    <Select value={line.productId} onValueChange={(v) => updateLine(idx, "productId", v)}>
                      <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                      <SelectContent>
                        {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
                    <Input type="number" className="h-9" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Rate</Label>}
                    <Input type="number" className="h-9" value={line.rate} onChange={(e) => updateLine(idx, "rate", Number(e.target.value))} />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs text-slate-500">Total</Label>}
                    <Input type="number" className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.total} readOnly />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-500 h-9"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-right mt-3">
                <span className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total: ৳{grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Detail Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Order Sheet Details</DialogTitle>
          </DialogHeader>
          {viewItem && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label className="text-slate-500 dark:text-slate-400 text-xs">Sheet No</Label><p className="text-slate-900 dark:text-white font-medium">{viewItem.sheetNo}</p></div>
                <div><Label className="text-slate-500 dark:text-slate-400 text-xs">Date</Label><p className="text-slate-900 dark:text-white font-medium">{viewItem.date ? new Date(viewItem.date).toLocaleDateString() : "-"}</p></div>
                <div><Label className="text-slate-500 dark:text-slate-400 text-xs">Status</Label><p><StatusBadge status={viewItem.status || "Draft"} /></p></div>
                <div><Label className="text-slate-500 dark:text-slate-400 text-xs">Notes</Label><p className="text-slate-900 dark:text-white font-medium">{viewItem.notes || "-"}</p></div>
              </div>
              <Separator />
              <div>
                <Label className="text-slate-700 dark:text-slate-300 font-semibold mb-2 block">Line Items</Label>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Product</TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Quantity</TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Rate</TableHead>
                        <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(viewItem.lines || []).map((line: any, idx: number) => (
                        <TableRow key={idx} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                          <TableCell className="text-slate-700 dark:text-slate-300">{line.product?.name || "-"}</TableCell>
                          <TableCell className="text-slate-700 dark:text-slate-300">{line.quantity}</TableCell>
                          <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(line.rate).toLocaleString()}</TableCell>
                          <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(line.total).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                <div className="text-right mt-3">
                  <span className="text-slate-700 dark:text-slate-300 font-semibold text-lg">
                    Grand Total: ৳{(viewItem.lines || []).reduce((s: number, l: any) => s + (l.total || 0), 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// AUTO PO PAGE (Auto Purchase Order Generation)
// ============================================================

function AutoPoPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [godowns, setGodowns] = useState<any[]>([]);
  const [godownId, setGodownId] = useState("");
  const [generating, setGenerating] = useState(false);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/auto-po").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    fetch("/api/suppliers").then((r) => r.json()).then(setSuppliers).catch(() => {});
    fetch("/api/godowns").then((r) => r.json()).then(setGodowns).catch(() => {});
  }, []);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === data.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(data.map((d: any) => d.productId)));
    }
  };

  const totalProducts = data.length;
  const totalShortage = data.reduce((s: number, d: any) => s + Math.max(0, d.reorderLevel - d.currentStock), 0);
  const estimatedValue = data.filter((d: any) => selected.has(d.productId)).reduce((s: number, d: any) => s + d.estimatedCost, 0);

  const handleGeneratePO = async () => {
    if (!supplierId) {
      toast({ title: "Error", description: "Please select a supplier", variant: "destructive" });
      return;
    }
    if (selected.size === 0) {
      toast({ title: "Error", description: "Please select at least one product", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      const selectedItems = data.filter((d: any) => selected.has(d.productId));
      const lines = selectedItems.map((item: any) => ({
        productId: item.productId,
        quantity: item.suggestedQuantity,
        rate: item.costPrice,
        total: item.suggestedQuantity * item.costPrice,
      }));
      const grandTotal = lines.reduce((s: number, l: any) => s + l.total, 0);
      const res = await fetch("/api/purchase-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, godownId: godownId || undefined, date: new Date().toISOString().split("T")[0], lines, grandTotal }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "PO Generated", description: `Purchase order created with ${selectedItems.length} product(s), total ৳${grandTotal.toLocaleString()}` });
      setSelected(new Set());
      setSupplierId("");
      setGodownId("");
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to generate purchase order", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const handleExportCSV = () => {
    const headers = "Product,Category,Current Stock,Reorder Level,Shortage,Suggested Qty,Estimated Cost";
    const rows = data.map((i: any) => `${i.productName},${i.category},${i.currentStock},${i.reorderLevel},${Math.max(0, i.reorderLevel - i.currentStock)},${i.suggestedQuantity},${i.estimatedCost}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "auto-po-suggestions.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Auto Purchase Orders</h1>
        <p className="text-slate-500 dark:text-slate-400">Auto-generate purchase orders for products below reorder level</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-red-500 to-rose-600 p-4 text-white">
              <p className="text-sm font-medium text-white/80">Products Below Reorder</p>
              <p className="text-2xl font-bold mt-1">{loading ? "..." : totalProducts}</p>
            </div>
            <div className="px-4 py-3 bg-card">
              <span className="text-xs text-slate-500 dark:text-slate-400">Items need restocking</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-amber-500 to-orange-600 p-4 text-white">
              <p className="text-sm font-medium text-white/80">Total Shortage</p>
              <p className="text-2xl font-bold mt-1">{loading ? "..." : totalShortage.toLocaleString()} units</p>
            </div>
            <div className="px-4 py-3 bg-card">
              <span className="text-xs text-slate-500 dark:text-slate-400">Units below reorder level</span>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-emerald-500 to-green-600 p-4 text-white">
              <p className="text-sm font-medium text-white/80">Estimated PO Value</p>
              <p className="text-2xl font-bold mt-1">৳{estimatedValue.toLocaleString()}</p>
            </div>
            <div className="px-4 py-3 bg-card">
              <span className="text-xs text-slate-500 dark:text-slate-400">For {selected.size} selected product(s)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* PO Generation Controls */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 dark:text-white">Generate Purchase Order</CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">Select a supplier and godown, then choose products to include</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Supplier</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Godown</Label>
              <Select value={godownId} onValueChange={setGodownId}>
                <SelectTrigger><SelectValue placeholder="Select godown" /></SelectTrigger>
                <SelectContent>
                  {godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-2">
              <Button onClick={handleGeneratePO} disabled={generating || selected.size === 0} className="bg-primary text-primary-foreground flex-1">
                {generating ? "Generating..." : <><ShoppingCart className="h-4 w-4 mr-1" /> Generate PO ({selected.size} items)</>}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Low Stock Products Table */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Products Below Reorder Level</CardTitle>
            <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold w-10">
                      <Checkbox checked={selected.size === data.length && data.length > 0} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Product</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Category</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Current Stock</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Reorder Level</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Shortage</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Suggested Qty</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Est. Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">All products are above reorder level</TableCell></TableRow>
                  ) : data.map((item: any) => (
                    <TableRow key={item.productId} className={`hover:bg-slate-50 dark:hover:bg-navy-900/30 ${selected.has(item.productId) ? "bg-primary/5 dark:bg-primary/10" : ""}`}>
                      <TableCell className="text-slate-700 dark:text-slate-300">
                        <Checkbox checked={selected.has(item.productId)} onCheckedChange={() => toggleSelect(item.productId)} />
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.productName}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.category}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">
                        <Badge variant={item.currentStock <= 0 ? "destructive" : "secondary"}>{item.currentStock}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.reorderLevel}</TableCell>
                      <TableCell className="text-red-600 dark:text-red-400 font-medium">{Math.max(0, item.reorderLevel - item.currentStock)}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">{item.suggestedQuantity}</TableCell>
                      <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(item.estimatedCost).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================
// STOCK DETAILS PAGE
// ============================================================

function StockDetailsPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [stockData, setStockData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  React.useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then((d) => { setProducts(d); setProductsLoading(false); }).catch(() => setProductsLoading(false));
  }, []);

  React.useEffect(() => {
    if (!selectedProduct) { setStockData(null); return; }
    setLoading(true);
    fetch(`/api/stock-details?productId=${selectedProduct}`).then((r) => r.json()).then((d) => { setStockData(d); setLoading(false); }).catch(() => { setStockData(null); setLoading(false); });
  }, [selectedProduct]);

  const entries = useMemo(() => {
    if (!stockData?.entries) return [];
    let filtered = stockData.entries;
    if (dateFrom) filtered = filtered.filter((e: any) => new Date(e.date) >= new Date(dateFrom));
    if (dateTo) filtered = filtered.filter((e: any) => new Date(e.date) <= new Date(dateTo + "T23:59:59"));
    return filtered;
  }, [stockData, dateFrom, dateTo]);

  // Calculate running balance
  const entriesWithBalance = useMemo(() => {
    const opening = stockData?.product?.openingStock || 0;
    // Entries from API are in desc order, reverse for running balance calculation
    const sorted = [...entries].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let balance = opening;
    return sorted.map((entry: any) => {
      if (entry.type === "IN") balance += entry.quantity;
      else if (entry.type === "OUT") balance -= entry.quantity;
      else if (entry.type === "TRANSFER") balance -= entry.quantity;
      return { ...entry, runningBalance: balance };
    }).reverse(); // back to desc for display
  }, [entries, stockData]);

  // Chart data - stock level over time
  const chartData = useMemo(() => {
    if (entriesWithBalance.length === 0) return [];
    const opening = stockData?.product?.openingStock || 0;
    const sorted = [...entriesWithBalance].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const result: { date: string; stock: number }[] = [{ date: "Start", stock: opening }];
    sorted.forEach((entry: any) => {
      result.push({
        date: new Date(entry.date).toLocaleDateString(),
        stock: entry.runningBalance,
      });
    });
    return result;
  }, [entriesWithBalance, stockData]);

  const currentStock = entriesWithBalance.length > 0 ? entriesWithBalance[0].runningBalance : (stockData?.product?.openingStock || 0);
  const product = stockData?.product;

  const handleExportCSV = () => {
    if (!product) return;
    const headers = "Date,Type,Reference,Quantity,Running Balance";
    const rows = entriesWithBalance.map((e: any) => `${new Date(e.date).toLocaleDateString()},${e.type},${e.reference || ""},${e.type === "IN" ? "+" : "-"}${e.quantity},${e.runningBalance}`);
    const csv = [`Stock Movements: ${product.name}`, headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `stock-${product.name}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: "CSV file downloaded" });
  };

  const handleExportPDF = async () => {
    if (!product) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`Stock Details: ${product.name}`, 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Date", "Type", "Reference", "Quantity", "Running Balance"]],
      body: entriesWithBalance.map((e: any) => [
        new Date(e.date).toLocaleDateString(),
        e.type,
        e.reference || "-",
        `${e.type === "IN" ? "+" : "-"}${e.quantity}`,
        String(e.runningBalance),
      ]),
    });
    doc.save(`stock-${product.name}.pdf`);
    toast({ title: "Exported", description: "PDF file downloaded" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock Details</h1>
        <p className="text-slate-500 dark:text-slate-400">Detailed product stock ledger and movements</p>
      </div>

      {/* Product Selector */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 dark:text-white">Select Product</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Product</Label>
              <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                <SelectTrigger><SelectValue placeholder={productsLoading ? "Loading..." : "Select a product"} /></SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.productCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      {loading && <div className="text-center py-8 text-slate-500">Loading stock details...</div>}

      {stockData && !loading && (
        <>
          {/* Product Info Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">Current Stock</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{currentStock}</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">Cost Price</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">৳{Number(product?.costPrice || 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">Sale Price</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">৳{Number(product?.salePrice || 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">Stock Value</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(currentStock * Number(product?.costPrice || 0)).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400">Reorder Level</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{product?.reorderLevel || 0}</p>
              </CardContent>
            </Card>
          </div>

          {/* Stock Level Chart */}
          {chartData.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  Stock Level Over Time
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <defs>
                        <linearGradient id="stockGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#16a34a" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#16a34a" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }}
                        formatter={(value: number) => [`${value} units`, "Stock Level"]}
                        labelStyle={{ color: "var(--foreground)" }}
                      />
                      <Area type="monotone" dataKey="stock" stroke="#16a34a" fill="url(#stockGrad)" strokeWidth={2} name="Stock Level" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Movement Timeline */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-slate-900 dark:text-white">Stock Movement Timeline</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Type</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Reference</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Quantity Change</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Running Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entriesWithBalance.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No stock movements found</TableCell></TableRow>
                    ) : entriesWithBalance.map((entry: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300">{new Date(entry.date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">
                          <Badge variant={entry.type === "IN" ? "default" : entry.type === "OUT" ? "destructive" : "secondary"}>
                            {entry.type}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{entry.reference || "-"}</TableCell>
                        <TableCell className={`font-medium ${entry.type === "IN" ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {entry.type === "IN" ? "+" : "-"}{entry.quantity}
                        </TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{entry.runningBalance}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!selectedProduct && !loading && (
        <Card className="border-border">
          <CardContent className="py-12 text-center">
            <Box className="h-12 w-12 mx-auto text-slate-400 dark:text-slate-500 mb-3" />
            <p className="text-slate-500 dark:text-slate-400">Select a product to view stock details and movements</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ============================================================
// REPLACEMENTS PAGE
// ============================================================

function ReplacementsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [salesOrders, setSalesOrders] = useState<any[]>([]);
  const [selectedSO, setSelectedSO] = useState("");
  const [form, setForm] = useState({ date: "", reason: "" });
  const [lines, setLines] = useState<{ productId: string; productName: string; quantity: number; rate: number; total: number }[]>([]);

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/replacements").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/sales-orders").then((r) => r.json()).then(setSalesOrders).catch(() => {});
    }
  }, [dialogOpen]);

  const handleSelectSO = (soId: string) => {
    setSelectedSO(soId);
    const so = salesOrders.find((s: any) => s.id === soId);
    if (so) {
      const soLines = (so.lines || []).map((l: any) => ({
        productId: l.productId,
        productName: l.product?.name || "Unknown",
        quantity: 1,
        rate: l.rate,
        total: l.rate,
      }));
      setLines(soLines.length > 0 ? soLines : [{ productId: "", productName: "", quantity: 1, rate: 0, total: 0 }]);
      setForm({ ...form, date: so.date ? new Date(so.date).toISOString().split("T")[0] : "" });
    }
  };

  const updateLine = (idx: number, field: string, value: any) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: value };
      if (field === "quantity" || field === "rate") {
        updated.total = Number(updated.quantity) * Number(updated.rate);
      }
      return updated;
    }));
  };

  const removeLine = (idx: number) => setLines((prev) => prev.filter((_, i) => i !== idx));

  const grandTotal = lines.reduce((s, l) => s + l.total, 0);

  const handleSave = async () => {
    if (!form.date || lines.length === 0) {
      toast({ title: "Error", description: "Please fill all required fields", variant: "destructive" });
      return;
    }
    try {
      const res = await fetch("/api/replacements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          salesOrderId: selectedSO || undefined,
          date: form.date,
          reason: form.reason,
          lines: lines.filter((l) => l.productId).map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            rate: l.rate,
            total: l.total,
          })),
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ title: "Created", description: "Replacement order created successfully" });
      setDialogOpen(false);
      setSelectedSO("");
      setForm({ date: "", reason: "" });
      setLines([]);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to create replacement order", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "Replacement No,Sales Order,Date,Reason,Total Items,Grand Total,Status";
    const rows = data.map((i) => `${i.replacementNo},${i.salesOrder?.invoiceNo || ""},${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.reason || ""},${i.lines?.length || 0},${i.lines?.reduce((s: number, l: any) => s + (l.total || 0), 0) || 0},${i.status || "Pending"}`);
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "replacements.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Replacement Orders Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Replacement No", "Sales Order", "Customer", "Date", "Reason", "Items", "Grand Total", "Status"]],
      body: data.map((i) => [
        i.replacementNo,
        i.salesOrder?.invoiceNo || "-",
        i.salesOrder?.customer?.name || "-",
        i.date ? new Date(i.date).toLocaleDateString() : "-",
        i.reason || "-",
        String(i.lines?.length || 0),
        `৳${(i.lines?.reduce((s: number, l: any) => s + (l.total || 0), 0) || 0).toLocaleString()}`,
        i.status || "Pending",
      ]),
    });
    doc.save("replacements.pdf");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Replacement Orders</h1>
        <p className="text-slate-500 dark:text-slate-400">Manage replacement orders for defective goods</p>
      </div>
      <Card className="border-border">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-slate-900 dark:text-white">Replacement Orders</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> Export CSV</Button>
              <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
              <Button size="sm" onClick={() => setDialogOpen(true)} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4 mr-1" /> Add Replacement</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? <div className="text-center py-8 text-slate-500">Loading...</div> : (
            <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Replacement No</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Sales Order</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Reason</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No replacement orders</TableCell></TableRow>
                  ) : data.map((item) => {
                    const itemTotal = item.lines?.reduce((s: number, l: any) => s + (l.total || 0), 0) || 0;
                    return (
                      <TableRow key={item.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{item.replacementNo}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{item.salesOrder?.invoiceNo || "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{item.date ? new Date(item.date).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{item.reason || "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{itemTotal.toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={item.status || "Pending"} /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Replacement Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white">Add Replacement Order</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Original Sales Order</Label>
                <Select value={selectedSO} onValueChange={handleSelectSO}>
                  <SelectTrigger><SelectValue placeholder="Select sales order" /></SelectTrigger>
                  <SelectContent>
                    {salesOrders.map((so: any) => <SelectItem key={so.id} value={so.id}>{so.invoiceNo} - {so.customer?.name || ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Date</Label>
                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div className="grid gap-2 sm:col-span-2">
                <Label className="text-slate-700 dark:text-slate-300">Reason</Label>
                <Textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Replacement reason" />
              </div>
            </div>
            <Separator />
            <div>
              <Label className="text-slate-700 dark:text-slate-300 font-semibold">Replacement Items</Label>
              {lines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 mb-2 items-end">
                  <div className="col-span-4">
                    {idx === 0 && <Label className="text-xs text-slate-500">Product</Label>}
                    <Input className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.productName} readOnly />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Qty</Label>}
                    <Input type="number" className="h-9" value={line.quantity} onChange={(e) => updateLine(idx, "quantity", Number(e.target.value))} />
                  </div>
                  <div className="col-span-2">
                    {idx === 0 && <Label className="text-xs text-slate-500">Rate</Label>}
                    <Input type="number" className="h-9" value={line.rate} onChange={(e) => updateLine(idx, "rate", Number(e.target.value))} />
                  </div>
                  <div className="col-span-3">
                    {idx === 0 && <Label className="text-xs text-slate-500">Total</Label>}
                    <Input type="number" className="h-9 bg-slate-50 dark:bg-navy-900/30" value={line.total} readOnly />
                  </div>
                  <div className="col-span-1">
                    {lines.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeLine(idx)} className="text-red-500 h-9"><Trash2 className="h-4 w-4" /></Button>
                    )}
                  </div>
                </div>
              ))}
              <div className="text-right mt-3">
                <span className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total: ৳{grandTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// HIRE SALES REPORT PAGE
// ============================================================

function HireSalesReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const loadReport = useCallback(() => {
    setLoading(true);
    fetch("/api/reports/hire-sales")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadReport(); }, [loadReport]);

  const filteredHireSales = useMemo(() => {
    if (!data?.hireSales) return [];
    return data.hireSales.filter((hs: any) => {
      if (statusFilter !== "all" && hs.currentStatus !== statusFilter && hs.status !== statusFilter) return false;
      if (dateFrom && new Date(hs.date) < new Date(dateFrom)) return false;
      if (dateTo && new Date(hs.date) > new Date(dateTo)) return false;
      return true;
    });
  }, [data, dateFrom, dateTo, statusFilter]);

  const summary = data?.summary || {};

  const monthlyChartData = useMemo(() => {
    const map = new Map<string, number>();
    filteredHireSales.forEach((hs: any) => {
      if (hs.date) {
        const month = new Date(hs.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
        map.set(month, (map.get(month) || 0) + hs.grandTotal);
      }
    });
    return Array.from(map.entries()).map(([month, value]) => ({ month, value }));
  }, [filteredHireSales]);

  const statusPieData = useMemo(() => {
    const map = new Map<string, number>();
    filteredHireSales.forEach((hs: any) => {
      const s = hs.currentStatus || hs.status || "Unknown";
      map.set(s, (map.get(s) || 0) + 1);
    });
    const colors: Record<string, string> = { Active: "#16a34a", Returned: "#ea580c", Completed: "#0891b2" };
    return Array.from(map.entries()).map(([name, value]) => ({ name, value, color: colors[name] || "#6b7280" }));
  }, [filteredHireSales]);

  const handleExportCSV = () => {
    const headers = "Invoice No,Customer,Date,Hire Rate,Duration,Grand Total,Status";
    const rows = filteredHireSales.map((hs: any) =>
      `${hs.invoiceNo},${hs.customer?.name || ""},${hs.date ? new Date(hs.date).toLocaleDateString() : ""},${hs.hireRate},${hs.duration || ""},${hs.grandTotal},${hs.currentStatus || hs.status}`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "hire-sales-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Hire Sales Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Invoice No", "Customer", "Date", "Hire Rate", "Duration", "Grand Total", "Status"]],
      body: filteredHireSales.map((hs: any) => [
        hs.invoiceNo, hs.customer?.name || "",
        hs.date ? new Date(hs.date).toLocaleDateString() : "",
        `৳${Number(hs.hireRate).toLocaleString()}`,
        hs.duration || "-",
        `৳${Number(hs.grandTotal).toLocaleString()}`,
        hs.currentStatus || hs.status,
      ]),
    });
    doc.save("hire-sales-report.pdf");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowUpRight className="h-6 w-6 text-primary" />
            Hire Sales Report
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Hire sales analysis and outstanding tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Returned">Returned</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={loadReport} className="bg-primary text-primary-foreground">
              <Search className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading report...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                    <CircleDollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Hire Value</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalHireValue || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                    <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Active Hires</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{summary.activeCount || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-cyan-100 dark:bg-cyan-900/30">
                    <CheckCircle className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Returned</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{summary.returnedCount || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
                    <Wallet className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Outstanding</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalOutstanding || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="border-border lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <BarChart className="h-5 w-5 text-primary" />
                  Hire Sales by Month
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">Monthly hire sales value</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {monthlyChartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsBarChart data={monthlyChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="month" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                        <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                        <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`, "Hire Value"]} />
                        <Bar dataKey="value" fill="#16a34a" radius={[4, 4, 0, 0]} name="Hire Value" />
                      </RechartsBarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">No chart data available</div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                  <PieChartIcon className="h-5 w-5 text-amber-500" />
                  Status Distribution
                </CardTitle>
                <CardDescription className="text-slate-500 dark:text-slate-400">Hire status breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  {statusPieData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={4} dataKey="value">
                          {statusPieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-slate-400">No data available</div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Hire Sales Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 dark:text-white">Hire Sales Detail</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">{filteredHireSales.length} record(s) found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Invoice No</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Customer</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Hire Rate</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Duration</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Grand Total</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHireSales.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">No hire sales found</TableCell></TableRow>
                    ) : filteredHireSales.map((hs: any) => (
                      <TableRow key={hs.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{hs.invoiceNo}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{hs.customer?.name || "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{hs.date ? new Date(hs.date).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(hs.hireRate).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{hs.duration || "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(hs.grandTotal).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={hs.currentStatus || hs.status || "Draft"} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// SR REPORT PAGE (Sales Rep Performance)
// ============================================================

function SrReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [employeeFilter, setEmployeeFilter] = useState("all");

  const loadReport = useCallback(() => {
    setLoading(true);
    fetch("/api/reports/sr")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadReport(); }, [loadReport]);

  const filteredPerformance = useMemo(() => {
    if (!data?.srPerformance) return [];
    if (employeeFilter === "all") return data.srPerformance;
    return data.srPerformance.filter((p: any) => p.employeeId === employeeFilter);
  }, [data, employeeFilter]);

  const summary = data?.summary || {};
  const topRep = filteredPerformance.length > 0
    ? filteredPerformance.reduce((best: any, p: any) => p.achievementPercent > best.achievementPercent ? p : best, filteredPerformance[0])
    : null;

  const performanceChartData = filteredPerformance.map((p: any) => ({
    name: p.employeeName?.split(" ").slice(0, 2).join(" ") || "N/A",
    target: p.targetAmount,
    achieved: p.achievedAmount,
  }));

  const handleExportCSV = () => {
    const headers = "Employee,Target,Achieved,Achievement %,Status";
    const rows = filteredPerformance.map((p: any) =>
      `${p.employeeName},${p.targetAmount},${p.achievedAmount},${p.achievementPercent}%,${p.status}`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sr-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("SR Performance Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Employee", "Target", "Achieved", "Achievement %", "Variance", "Status"]],
      body: filteredPerformance.map((p: any) => [
        p.employeeName,
        `৳${Number(p.targetAmount).toLocaleString()}`,
        `৳${Number(p.achievedAmount).toLocaleString()}`,
        `${p.achievementPercent}%`,
        `৳${Number(p.achievedAmount - p.targetAmount).toLocaleString()}`,
        p.status,
      ]),
    });
    doc.save("sr-report.pdf");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" />
            SR Performance Report
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Sales representative achievement tracking</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Filter */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Employee</Label>
              <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                <SelectTrigger className="w-56"><SelectValue placeholder="All Employees" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {data?.srPerformance?.map((p: any) => (
                    <SelectItem key={p.employeeId} value={p.employeeId}>{p.employeeName}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={loadReport} className="bg-primary text-primary-foreground">
              <Search className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading report...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                    <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Sales</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalConfirmedSales || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                    <Target className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Targets Set</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalTarget || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                    <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Achievement %</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{summary.overallAchievement || 0}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                    <Award className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Top Rep</p>
                    <p className="text-lg font-bold text-slate-900 dark:text-white truncate max-w-[140px]">{topRep?.employeeName || "N/A"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance Chart */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart className="h-5 w-5 text-primary" />
                Target vs Achievement
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Employee sales performance comparison</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {performanceChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={performanceChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`]} />
                      <Legend />
                      <Bar dataKey="target" fill="#ea580c" radius={[4, 4, 0, 0]} name="Target" />
                      <Bar dataKey="achieved" fill="#16a34a" radius={[4, 4, 0, 0]} name="Achieved" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">No performance data available</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Performance Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 dark:text-white">Employee Performance</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">{filteredPerformance.length} record(s) found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Employee</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Target</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Actual Sales</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Achievement %</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Variance</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPerformance.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No performance data found</TableCell></TableRow>
                    ) : filteredPerformance.map((p: any) => (
                      <TableRow key={p.employeeId + p.month + p.year} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{p.employeeName}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(p.targetAmount).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(p.achievedAmount).toLocaleString()}</TableCell>
                        <TableCell className={`font-medium ${p.achievementPercent >= 100 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>{p.achievementPercent}%</TableCell>
                        <TableCell className={`font-medium ${p.achievedAmount >= p.targetAmount ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>৳{Number(p.achievedAmount - p.targetAmount).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={p.status} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// CUSTOMER WISE REPORT PAGE
// ============================================================

function CustomerWiseReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [customerFilter, setCustomerFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const loadReport = useCallback(() => {
    setLoading(true);
    fetch("/api/reports/customer-wise")
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadReport(); }, [loadReport]);

  const filteredCustomers = useMemo(() => {
    if (!data?.customers) return [];
    return data.customers.filter((c: any) => {
      if (customerFilter !== "all" && c.id !== customerFilter) return false;
      if (dateFrom && c.lastOrderDate && new Date(c.lastOrderDate) < new Date(dateFrom)) return false;
      if (dateTo && c.lastOrderDate && new Date(c.lastOrderDate) > new Date(dateTo)) return false;
      return true;
    });
  }, [data, customerFilter, dateFrom, dateTo]);

  const summary = data?.summary || {};

  const top10Data = useMemo(() => {
    return [...filteredCustomers]
      .sort((a: any, b: any) => b.totalRevenue - a.totalRevenue)
      .slice(0, 10)
      .map((c: any) => ({ name: c.name, revenue: c.totalRevenue }));
  }, [filteredCustomers]);

  const handleExportCSV = () => {
    const headers = "Customer,Total Orders,Total Revenue,Last Order Date,Balance";
    const rows = filteredCustomers.map((c: any) =>
      `${c.name},${c.totalOrders},${c.totalRevenue},${c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : "-"},${c.balance}`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "customer-wise-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Customer Wise Report", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Customer", "Total Orders", "Total Revenue", "Last Order Date", "Balance"]],
      body: filteredCustomers.map((c: any) => [
        c.name, c.totalOrders,
        `৳${Number(c.totalRevenue).toLocaleString()}`,
        c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : "-",
        `৳${Number(c.balance).toLocaleString()}`,
      ]),
    });
    doc.save("customer-wise-report.pdf");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />
            Customer Wise Report
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Per-customer sales and outstanding analysis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Customer</Label>
              <Select value={customerFilter} onValueChange={setCustomerFilter}>
                <SelectTrigger className="w-56"><SelectValue placeholder="All Customers" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  {data?.customers?.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
            </div>
            <Button size="sm" onClick={loadReport} className="bg-primary text-primary-foreground">
              <Search className="h-4 w-4 mr-1" /> Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading report...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                    <Users className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Customers</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{summary.totalCustomers || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                    <CircleDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Revenue</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalRevenue || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                    <ShoppingBag className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Avg Order Value</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.avgOrderValue || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
                    <Wallet className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Outstanding</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.totalOutstanding || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Top 10 Customers Chart */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart className="h-5 w-5 text-primary" />
                Top 10 Customers by Revenue
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Highest revenue generating customers</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {top10Data.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={top10Data} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={110} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`, "Revenue"]} />
                      <Bar dataKey="revenue" fill="#16a34a" radius={[0, 4, 4, 0]} name="Revenue" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">No data available</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Customer Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 dark:text-white">Customer Summary</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">{filteredCustomers.length} customer(s) found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Customer</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Total Orders</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Total Revenue</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Last Order Date</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No customers found</TableCell></TableRow>
                    ) : filteredCustomers.map((c: any) => (
                      <TableRow key={c.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{c.name}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{c.totalOrders}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">৳{Number(c.totalRevenue).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString() : "-"}</TableCell>
                        <TableCell className={`font-medium ${c.balance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>৳{Number(c.balance).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// BANK REPORT PAGE
// ============================================================

function BankReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [banks, setBanks] = useState<any[]>([]);
  const [selectedBank, setSelectedBank] = useState("");
  const [allBankSummary, setAllBankSummary] = useState<any>(null);

  React.useEffect(() => {
    fetch("/api/banks").then((r) => r.json()).then((b: any[]) => {
      setBanks(b);
      // Calculate summary across all banks
      const totalOpening = b.reduce((s: number, bank: any) => s + (bank.openingBalance || 0), 0);
      setAllBankSummary({ totalBanks: b.length, totalOpeningBalance: totalOpening });
    }).catch(() => {});
  }, []);

  const loadReport = useCallback(() => {
    if (!selectedBank || selectedBank === "all") return;
    setLoading(true);
    fetch(`/api/reports/bank?bankId=${selectedBank}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedBank]);

  React.useEffect(() => { if (selectedBank && selectedBank !== "all") loadReport(); }, [loadReport]);

  const summary = data?.summary || {};

  const handleExportCSV = () => {
    if (!data?.transactions) return;
    const headers = "Date,Description,Type,Credit,Debit,Balance";
    const rows = data.transactions.map((t: any) =>
      `${new Date(t.date).toLocaleDateString()},${(t.description || t.type || "").replace(/,/g, ";")},${t.type},${t.credit},${t.debit},${t.balance || 0}`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "bank-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    if (!data?.transactions) return;
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text(`Bank Report - ${data.bank?.bankName || ""}`, 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Date", "Description", "Type", "Credit", "Debit", "Balance"]],
      body: data.transactions.map((t: any) => [
        new Date(t.date).toLocaleDateString(),
        t.description || t.type || "-",
        t.type,
        t.credit > 0 ? `৳${Number(t.credit).toLocaleString()}` : "-",
        t.debit > 0 ? `৳${Number(t.debit).toLocaleString()}` : "-",
        `৳${Number(t.balance || 0).toLocaleString()}`,
      ]),
    });
    doc.save("bank-report.pdf");
  };

  // Build chart data from transactions (by type)
  const chartData = useMemo(() => {
    if (!data?.transactions) return [];
    const typeMap = new Map<string, { credits: number; debits: number }>();
    data.transactions.forEach((t: any) => {
      const cat = t.category || t.type || "Other";
      const existing = typeMap.get(cat) || { credits: 0, debits: 0 };
      existing.credits += t.credit || 0;
      existing.debits += t.debit || 0;
      typeMap.set(cat, existing);
    });
    return Array.from(typeMap.entries()).map(([name, { credits, debits }]) => ({ name, credits, debits }));
  }, [data]);

  const netFlow = (summary.totalDeposits || 0) + (summary.totalIncome || 0) + (summary.totalCollections || 0)
    - (summary.totalWithdrawals || 0) - (summary.totalExpense || 0) - (summary.totalDeliveries || 0);

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Banknote className="h-6 w-6 text-primary" />
            Bank Report
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Bank book with credits and debits</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} disabled={!data} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} disabled={!data} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Bank Selector */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Select Bank</Label>
              <Select value={selectedBank} onValueChange={setSelectedBank}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Choose a bank" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">-- Select Bank --</SelectItem>
                  {banks.map((b: any) => (
                    <SelectItem key={b.id} value={b.id}>{b.bankName} - {b.accountNo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={loadReport} disabled={!selectedBank || selectedBank === "all"} className="bg-primary text-primary-foreground">
              <Search className="h-4 w-4 mr-1" /> Load Report
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-slate-500 dark:text-slate-400">Loading report...</div>
      ) : data ? (
        <>
          {/* Bank Info */}
          {data.bank && (
            <Card className="border-border bg-gradient-to-r from-slate-50 to-slate-100 dark:from-navy-900/30 dark:to-navy-900/50">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">{data.bank.bankName}</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">A/C: {data.bank.accountNo} | Branch: {data.bank.branch || "N/A"} | Holder: {data.bank.accountHolder}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Current Balance</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">৳{(summary.currentBalance || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                    <Banknote className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Balance</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{(summary.currentBalance || 0).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30">
                    <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Credits</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{((summary.totalDeposits || 0) + (summary.totalIncome || 0) + (summary.totalCollections || 0)).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-red-100 dark:bg-red-900/30">
                    <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Debits</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">৳{((summary.totalWithdrawals || 0) + (summary.totalExpense || 0) + (summary.totalDeliveries || 0)).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-xl ${netFlow >= 0 ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-red-100 dark:bg-red-900/30"}`}>
                    <Activity className={`h-5 w-5 ${netFlow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`} />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Net Flow</p>
                    <p className={`text-xl font-bold ${netFlow >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>৳{Math.abs(netFlow).toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-primary" />
                Credits vs Debits by Category
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Transaction breakdown by type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {chartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`]} />
                      <Legend />
                      <Bar dataKey="credits" fill="#16a34a" radius={[4, 4, 0, 0]} name="Credits" />
                      <Bar dataKey="debits" fill="#dc2626" radius={[4, 4, 0, 0]} name="Debits" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">No transaction data available</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Transaction Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 dark:text-white">Transaction Details</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">{data.transactions?.length || 0} transaction(s) found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Description</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Credit</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Debit</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data.transactions || data.transactions.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No transactions found</TableCell></TableRow>
                    ) : data.transactions.map((t: any, idx: number) => (
                      <TableRow key={idx} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300">{new Date(t.date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{t.description || t.type || "-"}</TableCell>
                        <TableCell className="text-green-600 dark:text-green-400">{t.credit > 0 ? `৳${Number(t.credit).toLocaleString()}` : "-"}</TableCell>
                        <TableCell className="text-red-600 dark:text-red-400">{t.debit > 0 ? `৳${Number(t.debit).toLocaleString()}` : "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(t.balance || 0).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : !selectedBank || selectedBank === "all" ? (
        /* Enhanced empty state with bank selection cards and summary */
        <div className="space-y-6">
          {/* Summary across all banks */}
          {allBankSummary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 p-5 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-blue-100">Total Banks</p>
                    <p className="text-2xl font-bold mt-1">{allBankSummary.totalBanks}</p>
                  </div>
                  <div className="p-3 bg-white/20 rounded-xl"><Building2 className="h-6 w-6" /></div>
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 p-5 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-emerald-100">Total Opening Balance</p>
                    <p className="text-2xl font-bold mt-1">৳{allBankSummary.totalOpeningBalance.toLocaleString()}</p>
                  </div>
                  <div className="p-3 bg-white/20 rounded-xl"><Banknote className="h-6 w-6" /></div>
                </div>
              </div>
              <div className="rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 p-5 text-white shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-violet-100">Avg Balance per Bank</p>
                    <p className="text-2xl font-bold mt-1">৳{allBankSummary.totalBanks > 0 ? Math.round(allBankSummary.totalOpeningBalance / allBankSummary.totalBanks).toLocaleString() : "0"}</p>
                  </div>
                  <div className="p-3 bg-white/20 rounded-xl"><Activity className="h-6 w-6" /></div>
                </div>
              </div>
            </div>
          )}

          {/* Bank selection cards */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <Banknote className="h-5 w-5 text-primary" />
                Select a Bank to View Its Report
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Click a bank card to load its detailed report</CardDescription>
            </CardHeader>
            <CardContent>
              {banks.length === 0 ? (
                <div className="text-center py-8 text-slate-500 dark:text-slate-400">
                  <Building2 className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                  <p className="text-lg font-medium">No banks configured</p>
                  <p className="text-sm mt-1">Add banks from the Banks setup page first</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {banks.map((bank: any) => (
                    <button
                      key={bank.id}
                      onClick={() => { setSelectedBank(bank.id); }}
                      className="group text-left p-4 rounded-xl border-2 border-slate-200 dark:border-navy-700 hover:border-primary dark:hover:border-primary bg-white dark:bg-navy-900/30 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                    >
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                          <Banknote className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-slate-900 dark:text-white truncate">{bank.bankName}</h4>
                          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">A/C: {bank.accountNo}</p>
                          {bank.branch && <p className="text-xs text-slate-400 dark:text-slate-500">Branch: {bank.branch}</p>}
                          <div className="mt-2 pt-2 border-t border-slate-100 dark:border-navy-700">
                            <p className="text-xs text-slate-400 dark:text-slate-500">Opening Balance</p>
                            <p className="text-lg font-bold text-primary">৳{Number(bank.openingBalance || 0).toLocaleString()}</p>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-slate-300 dark:text-slate-600 group-hover:text-primary transition-colors mt-1" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// ============================================================
// TRANSFER REPORT PAGE
// ============================================================

function TransferReportPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [godownFilter, setGodownFilter] = useState("all");
  const [godowns, setGodowns] = useState<any[]>([]);

  React.useEffect(() => {
    fetch("/api/godowns").then((r) => r.json()).then(setGodowns).catch(() => {});
  }, []);

  const loadReport = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    fetch(`/api/reports/transfer?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [dateFrom, dateTo]);

  React.useEffect(() => { loadReport(); }, [loadReport]);

  const filteredTransfers = useMemo(() => {
    if (!data?.transfers) return [];
    if (godownFilter === "all") return data.transfers;
    return data.transfers.filter((t: any) =>
      t.fromGodownId === godownFilter || t.toGodownId === godownFilter ||
      t.fromGodown?.id === godownFilter || t.toGodown?.id === godownFilter
    );
  }, [data, godownFilter]);

  const summary = data?.summary || {};

  const godownChartData = useMemo(() => {
    const fromData = summary.fromGodownSummary || [];
    const toData = summary.toGodownSummary || [];
    const allNames = [...new Set([...fromData.map((g: any) => g.godown), ...toData.map((g: any) => g.godown)])];
    return allNames.map((name) => {
      const from = fromData.find((g: any) => g.godown === name);
      const to = toData.find((g: any) => g.godown === name);
      return { name, sent: from?.totalItems || 0, received: to?.totalItems || 0 };
    });
  }, [summary]);

  const handleExportCSV = () => {
    const headers = "Date,Product,From Godown,To Godown,Quantity,Notes";
    const rows: string[] = [];
    filteredTransfers.forEach((t: any) => {
      t.lines?.forEach((l: any) => {
        rows.push(`${new Date(t.date).toLocaleDateString()},${l.product?.name || ""},${t.fromGodown?.name || ""},${t.toGodown?.name || ""},${l.quantity},${(t.notes || "").replace(/,/g, ";")}`);
      });
      if (!t.lines || t.lines.length === 0) {
        rows.push(`${new Date(t.date).toLocaleDateString()},-,${t.fromGodown?.name || ""},${t.toGodown?.name || ""},${t.totalQuantity || 0},${(t.notes || "").replace(/,/g, ";")}`);
      }
    });
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "transfer-report.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16);
    doc.text("Transfer Report", 14, 20);
    const body: string[][] = [];
    filteredTransfers.forEach((t: any) => {
      t.lines?.forEach((l: any) => {
        body.push([
          new Date(t.date).toLocaleDateString(),
          l.product?.name || "-",
          t.fromGodown?.name || "-",
          t.toGodown?.name || "-",
          String(l.quantity),
          t.notes || "-",
        ]);
      });
      if (!t.lines || t.lines.length === 0) {
        body.push([
          new Date(t.date).toLocaleDateString(),
          "-",
          t.fromGodown?.name || "-",
          t.toGodown?.name || "-",
          String(t.totalQuantity || 0),
          t.notes || "-",
        ]);
      }
    });
    autoTable(doc, {
      startY: 30,
      head: [["Date", "Product", "From Godown", "To Godown", "Quantity", "Notes"]],
      body,
    });
    doc.save("transfer-report.pdf");
  };

  const uniqueSourceGodowns = new Set(filteredTransfers.map((t: any) => t.fromGodown?.name).filter(Boolean)).size;
  const uniqueDestGodowns = new Set(filteredTransfers.map((t: any) => t.toGodown?.name).filter(Boolean)).size;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ArrowRightLeft className="h-6 w-6 text-primary" />
            Transfer Report
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Stock transfer log and analysis</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300">
            <FileDown className="h-4 w-4 mr-1" /> Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300">
            <FileText className="h-4 w-4 mr-1" /> Export PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Date To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm">Godown</Label>
              <Select value={godownFilter} onValueChange={setGodownFilter}>
                <SelectTrigger className="w-48"><SelectValue placeholder="All Godowns" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Godowns</SelectItem>
                  {godowns.map((g: any) => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={loadReport} className="bg-primary text-primary-foreground">
              <Search className="h-4 w-4 mr-1" /> Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading report...</div>
      ) : data ? (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-green-100 dark:bg-green-900/30">
                    <ArrowRightLeft className="h-5 w-5 text-green-600 dark:text-green-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Total Transfers</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{summary.totalTransfers || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                    <Package className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Products Transferred</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{summary.totalItemsTransferred || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-cyan-100 dark:bg-cyan-900/30">
                    <Warehouse className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Source Godowns</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{uniqueSourceGodowns}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                    <Warehouse className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Destination Godowns</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{uniqueDestGodowns}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Chart */}
          <Card className="border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart className="h-5 w-5 text-primary" />
                Transfers by Godown
              </CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">Items sent vs received per godown</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {godownChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RechartsBarChart data={godownChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                      <Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} />
                      <Legend />
                      <Bar dataKey="sent" fill="#ea580c" radius={[4, 4, 0, 0]} name="Sent" />
                      <Bar dataKey="received" fill="#16a34a" radius={[4, 4, 0, 0]} name="Received" />
                    </RechartsBarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">No transfer data available</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Transfer Table */}
          <Card className="border-border">
            <CardHeader className="pb-3">
              <CardTitle className="text-slate-900 dark:text-white">Transfer Details</CardTitle>
              <CardDescription className="text-slate-500 dark:text-slate-400">{filteredTransfers.length} transfer(s) found</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Date</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Transfer No</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">From Godown</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">To Godown</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Items</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Total Qty</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Status</TableHead>
                      <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransfers.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No transfers found</TableCell></TableRow>
                    ) : filteredTransfers.map((t: any) => (
                      <TableRow key={t.id} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300">{new Date(t.date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{t.transferNo}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{t.fromGodown?.name || "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{t.toGodown?.name || "-"}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{t.lineCount || t.lines?.length || 0}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300">{t.totalQuantity || 0}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300"><StatusBadge status={t.status || "Pending"} /></TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 max-w-[200px] truncate">{t.notes || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ============================================================
// CARD TYPE SETUP PAGE
// ============================================================

function CardTypeSetupPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [paymentOptions, setPaymentOptions] = useState<any[]>([]);
  const [cardTypes, setCardTypes] = useState<any[]>([]);
  const [form, setForm] = useState({ paymentOptionId: "", cardTypeId: "", chargePercentage: 0, isActive: true });

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/card-type-setup").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/payment-options").then((r) => r.json()).then(setPaymentOptions).catch(() => {});
      fetch("/api/card-types").then((r) => r.json()).then(setCardTypes).catch(() => {});
    }
  }, [dialogOpen]);

  const openAdd = () => {
    setEditItem(null);
    setForm({ paymentOptionId: "", cardTypeId: "", chargePercentage: 0, isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      paymentOptionId: item.paymentOptionId || item.paymentOption?.id || "",
      cardTypeId: item.cardTypeId || item.cardType?.id || "",
      chargePercentage: item.chargePercentage || 0,
      isActive: item.isActive !== false,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.paymentOptionId || !form.cardTypeId) {
      toast({ title: "Error", description: "Payment Option and Card Type are required", variant: "destructive" });
      return;
    }
    try {
      const url = editItem ? `/api/card-type-setup/${editItem.id}` : "/api/card-type-setup";
      const method = editItem ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Success", description: editItem ? "Card type setup updated" : "Card type setup created" });
      setDialogOpen(false);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to save card type setup", variant: "destructive" });
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm("Delete this card type setup?")) return;
    try {
      await fetch(`/api/card-type-setup/${item.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "Card type setup deleted" });
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = "Payment Option,Card Type,Charge %,Status";
    const rows = data.map((d: any) =>
      `${d.paymentOption?.name || ""},${d.cardType?.name || ""},${d.chargePercentage}%,${d.isActive ? "Active" : "Inactive"}`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "card-type-setup.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Card Type Setup", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Payment Option", "Card Type", "Charge %", "Status"]],
      body: data.map((d: any) => [
        d.paymentOption?.name || "-",
        d.cardType?.name || "-",
        `${d.chargePercentage}%`,
        d.isActive ? "Active" : "Inactive",
      ]),
    });
    doc.save("card-type-setup.pdf");
  };

  return (
    <div className="space-y-6">
      <DataTable
        title="Card Type Setup"
        columns={[
          { key: "paymentOption", label: "Payment Option", render: (item: any) => item.paymentOption?.name || "-" },
          { key: "cardType", label: "Card Type", render: (item: any) => item.cardType?.name || "-" },
          { key: "chargePercentage", label: "Charge %", render: (item: any) => `${item.chargePercentage}%` },
          { key: "isActive", label: "Status", render: (item: any) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
        ]}
        data={data as any[]}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
        addLabel="Add Setup"
        searchPlaceholder="Search card type setups..."
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit Card Type Setup" : "Add Card Type Setup"}</DialogTitle>
            <DialogDescription>Configure card type with payment option and charge percentage</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300">Payment Option</Label>
              <Select value={form.paymentOptionId} onValueChange={(v) => setForm({ ...form, paymentOptionId: v })}>
                <SelectTrigger><SelectValue placeholder="Select payment option" /></SelectTrigger>
                <SelectContent>
                  {paymentOptions.map((po: any) => <SelectItem key={po.id} value={po.id}>{po.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300">Card Type</Label>
              <Select value={form.cardTypeId} onValueChange={(v) => setForm({ ...form, cardTypeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select card type" /></SelectTrigger>
                <SelectContent>
                  {cardTypes.map((ct: any) => <SelectItem key={ct.id} value={ct.id}>{ct.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300">Charge %</Label>
              <Input type="number" step="0.01" value={form.chargePercentage} onChange={(e) => setForm({ ...form, chargePercentage: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label className="text-slate-700 dark:text-slate-300">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// SR TARGET SETUP PAGE
// ============================================================

function SrTargetSetupPage() {
  const { toast } = useToast();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [employees, setEmployees] = useState<any[]>([]);
  const [form, setForm] = useState({ employeeId: "", month: 1, year: new Date().getFullYear(), targetAmount: 0, isActive: true });

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/sr-targets").then((r) => r.json()).then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/employees").then((r) => r.json()).then(setEmployees).catch(() => {});
    }
  }, [dialogOpen]);

  const openAdd = () => {
    setEditItem(null);
    setForm({ employeeId: "", month: 1, year: new Date().getFullYear(), targetAmount: 0, isActive: true });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditItem(item);
    setForm({
      employeeId: item.employeeId || item.employee?.id || "",
      month: item.month || 1,
      year: item.year || new Date().getFullYear(),
      targetAmount: item.targetAmount || 0,
      isActive: item.isActive !== false,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.employeeId || form.targetAmount <= 0) {
      toast({ title: "Error", description: "Employee and target amount are required", variant: "destructive" });
      return;
    }
    try {
      const url = editItem ? `/api/sr-targets/${editItem.id}` : "/api/sr-targets";
      const method = editItem ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Success", description: editItem ? "SR target updated" : "SR target created" });
      setDialogOpen(false);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to save SR target", variant: "destructive" });
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm("Delete this SR target?")) return;
    try {
      await fetch(`/api/sr-targets/${item.id}`, { method: "DELETE" });
      toast({ title: "Deleted", description: "SR target deleted" });
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
    }
  };

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const handleExportCSV = () => {
    const headers = "Employee,Month,Year,Target Amount,Status";
    const rows = data.map((d: any) =>
      `${d.employee?.name || ""},${monthNames[(d.month || 1) - 1]},${d.year},${d.targetAmount},${d.isActive ? "Active" : "Inactive"}`
    );
    const csv = [headers, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "sr-targets.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("SR Target Setup", 14, 20);
    autoTable(doc, {
      startY: 30,
      head: [["Employee", "Month", "Year", "Target Amount", "Status"]],
      body: data.map((d: any) => [
        d.employee?.name || "-",
        monthNames[(d.month || 1) - 1],
        d.year,
        `৳${Number(d.targetAmount).toLocaleString()}`,
        d.isActive ? "Active" : "Inactive",
      ]),
    });
    doc.save("sr-targets.pdf");
  };

  return (
    <div className="space-y-6">
      <DataTable
        title="SR Target Setup"
        columns={[
          { key: "employee", label: "Employee", render: (item: any) => item.employee?.name || "-" },
          { key: "month", label: "Month", render: (item: any) => monthNames[(item.month || 1) - 1] },
          { key: "year", label: "Year" },
          { key: "targetAmount", label: "Target Amount", render: (item: any) => `৳${Number(item.targetAmount).toLocaleString()}` },
          { key: "isActive", label: "Status", render: (item: any) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
        ]}
        data={data as any[]}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
        addLabel="Add Target"
        searchPlaceholder="Search SR targets..."
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editItem ? "Edit SR Target" : "Add SR Target"}</DialogTitle>
            <DialogDescription>Set sales target for a representative</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300">Employee</Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                <SelectContent>
                  {employees.map((emp: any) => <SelectItem key={emp.id} value={emp.id}>{emp.name} ({emp.employeeCode})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label className="text-slate-700 dark:text-slate-300">Month</Label>
                <Select value={String(form.month)} onValueChange={(v) => setForm({ ...form, month: Number(v) })}>
                  <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                  <SelectContent>
                    {monthNames.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-slate-700 dark:text-slate-300">Year</Label>
                <Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-slate-700 dark:text-slate-300">Target Amount (৳)</Label>
              <Input type="number" value={form.targetAmount} onChange={(e) => setForm({ ...form, targetAmount: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.isActive} onCheckedChange={(v) => setForm({ ...form, isActive: v })} />
              <Label className="text-slate-700 dark:text-slate-300">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// EMPLOYEE LEAVE PAGE (Custom)
// ============================================================

function EmployeeLeavePage() {
  const { toast } = useToast();
  const [leaves, setLeaves] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState({
    employeeId: "",
    leaveType: "Casual",
    fromDate: "",
    toDate: "",
    reason: "",
    status: "Pending",
  });

  const loadData = useCallback(() => {
    setLoading(true);
    fetch("/api/employee-leaves")
      .then((r) => r.json())
      .then((d) => { setLeaves(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  React.useEffect(() => { loadData(); }, [loadData]);

  React.useEffect(() => {
    if (dialogOpen) {
      fetch("/api/employees?isActive=true")
        .then((r) => r.json())
        .then((d) => { setEmployees(Array.isArray(d) ? d : []); })
        .catch(() => {});
    }
  }, [dialogOpen]);

  // Auto-calculate days
  const calculatedDays = useMemo(() => {
    if (!form.fromDate || !form.toDate) return 0;
    const start = new Date(form.fromDate);
    const end = new Date(form.toDate);
    const diff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return diff > 0 ? diff : 0;
  }, [form.fromDate, form.toDate]);

  const openAdd = () => {
    setEditingItem(null);
    setForm({ employeeId: "", leaveType: "Casual", fromDate: "", toDate: "", reason: "", status: "Pending" });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setForm({
      employeeId: item.employeeId || "",
      leaveType: item.leaveType || "Casual",
      fromDate: item.fromDate ? new Date(item.fromDate).toISOString().split("T")[0] : "",
      toDate: item.toDate ? new Date(item.toDate).toISOString().split("T")[0] : "",
      reason: item.reason || "",
      status: item.status || "Pending",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.employeeId || !form.fromDate || !form.toDate) {
      toast({ title: "Validation Error", description: "Employee, start date, and end date are required.", variant: "destructive" });
      return;
    }
    try {
      const url = editingItem ? `/api/employee-leaves/${editingItem.id}` : "/api/employee-leaves";
      const method = editingItem ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error();
      toast({ title: editingItem ? "Updated" : "Created", description: `Leave ${editingItem ? "updated" : "created"} successfully.` });
      setDialogOpen(false);
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to save leave.", variant: "destructive" });
    }
  };

  const handleDelete = async (item: any) => {
    if (!confirm("Are you sure you want to delete this leave record?")) return;
    try {
      const res = await fetch(`/api/employee-leaves/${item.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast({ title: "Deleted", description: "Leave record deleted." });
      loadData();
    } catch {
      toast({ title: "Error", description: "Failed to delete leave.", variant: "destructive" });
    }
  };

  const handleExportCSV = () => {
    const headers = ["Employee Name", "Leave Type", "Start Date", "End Date", "Days", "Reason", "Status"];
    const rows = leaves.map((l: any) => [
      l.employee?.name || "",
      l.leaveType,
      l.fromDate ? new Date(l.fromDate).toLocaleDateString() : "",
      l.toDate ? new Date(l.toDate).toLocaleDateString() : "",
      l.fromDate && l.toDate ? Math.ceil((new Date(l.toDate).getTime() - new Date(l.fromDate).getTime()) / (1000 * 60 * 60 * 24)) + 1 : 0,
      l.reason || "",
      l.status,
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "employee-leaves.csv"; a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportPDF = () => {
    import("jspdf").then(({ default: jsPDF }) => {
      import("jspdf-autotable").then(() => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text("Employee Leaves Report", 14, 20);
        doc.setFontSize(10);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 28);
        const rows = leaves.map((l: any) => [
          l.employee?.name || "",
          l.leaveType,
          l.fromDate ? new Date(l.fromDate).toLocaleDateString() : "",
          l.toDate ? new Date(l.toDate).toLocaleDateString() : "",
          String(l.fromDate && l.toDate ? Math.ceil((new Date(l.toDate).getTime() - new Date(l.fromDate).getTime()) / (1000 * 60 * 60 * 24)) + 1 : "0"),
          l.reason || "",
          l.status,
        ]);
        (doc as any).autoTable({
          head: [["Employee", "Leave Type", "Start", "End", "Days", "Reason", "Status"]],
          body: rows,
          startY: 34,
          styles: { fontSize: 8 },
        });
        doc.save("employee-leaves.pdf");
      });
    });
  };

  // Summary stats
  const now = new Date();
  const thisMonthLeaves = leaves.filter((l: any) => {
    const d = new Date(l.fromDate);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const summary = {
    total: thisMonthLeaves.length,
    approved: thisMonthLeaves.filter((l: any) => l.status === "Approved").length,
    pending: thisMonthLeaves.filter((l: any) => l.status === "Pending").length,
    rejected: thisMonthLeaves.filter((l: any) => l.status === "Rejected").length,
  };

  const leaveTypes = ["Sick", "Casual", "Annual", "Maternity", "Paternity"];
  const statusOptions = ["Approved", "Pending", "Rejected"];

  const columns = [
    { key: "employeeId", label: "Employee", render: (item: any) => (
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
          <Users className="h-3.5 w-3.5 text-primary" />
        </div>
        <span className="font-medium text-slate-900 dark:text-white">{item.employee?.name || "—"}</span>
      </div>
    )},
    { key: "leaveType", label: "Leave Type", render: (item: any) => {
      const typeColors: Record<string, string> = {
        Sick: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
        Casual: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
        Annual: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
        Maternity: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
        Paternity: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
      };
      return <Badge variant="outline" className={`${typeColors[item.leaveType] || "bg-slate-100 text-slate-700"} text-xs border`}>{item.leaveType}</Badge>;
    }},
    { key: "fromDate", label: "Start Date", render: (item: any) => item.fromDate ? new Date(item.fromDate).toLocaleDateString() : "—" },
    { key: "toDate", label: "End Date", render: (item: any) => item.toDate ? new Date(item.toDate).toLocaleDateString() : "—" },
    { key: "days", label: "Days", render: (item: any) => {
      if (!item.fromDate || !item.toDate) return "—";
      const days = Math.ceil((new Date(item.toDate).getTime() - new Date(item.fromDate).getTime()) / (1000 * 60 * 60 * 24)) + 1;
      return <Badge variant="secondary" className="text-xs">{days} day{days > 1 ? "s" : ""}</Badge>;
    }},
    { key: "reason", label: "Reason", render: (item: any) => item.reason ? <span className="max-w-[200px] truncate inline-block">{item.reason}</span> : <span className="text-slate-400">—</span> },
    { key: "status", label: "Status", render: (item: any) => <StatusBadge status={String(item.status ?? "Pending")} /> },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Employee Leaves
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage employee leave records and approvals</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total This Month", value: summary.total, icon: <Calendar className="h-5 w-5" />, gradient: "from-blue-500 to-blue-700" },
          { title: "Approved", value: summary.approved, icon: <CheckCircle className="h-5 w-5" />, gradient: "from-emerald-500 to-green-700" },
          { title: "Pending", value: summary.pending, icon: <Clock className="h-5 w-5" />, gradient: "from-amber-500 to-yellow-700" },
          { title: "Rejected", value: summary.rejected, icon: <X className="h-5 w-5" />, gradient: "from-red-500 to-rose-700" },
        ].map((card, i) => (
          <Card key={i} className="kpi-card border-border overflow-hidden group">
            <CardContent className="p-0">
              <div className={`bg-gradient-to-br ${card.gradient} p-4 text-white relative overflow-hidden`}>
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-300" />
                <div className="relative flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/80">{card.title}</p>
                    <p className="text-2xl font-bold mt-1">{loading ? <span className="inline-block w-8 h-7 bg-white/20 rounded shimmer" /> : card.value}</p>
                  </div>
                  <div className="bg-white/20 p-2.5 rounded-xl backdrop-blur-sm group-hover:scale-110 transition-all duration-300">
                    {card.icon}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Data Table */}
      <DataTable
        title="Leave Records"
        columns={columns}
        data={leaves as any[]}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
        addLabel="Add Leave"
        searchPlaceholder="Search leaves..."
      />

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg bg-white dark:bg-navy-900 border-border">
          <DialogHeader>
            <DialogTitle className="text-slate-900 dark:text-white flex items-center gap-2">
              {editingItem ? <Pencil className="h-5 w-5 text-primary" /> : <Plus className="h-5 w-5 text-primary" />}
              {editingItem ? "Edit Leave" : "Add Leave"}
            </DialogTitle>
            <DialogDescription className="text-slate-500 dark:text-slate-400">
              {editingItem ? "Update leave record details" : "Create a new leave record for an employee"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Employee selector */}
            <div className="space-y-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm font-medium">Employee *</Label>
              <Select value={form.employeeId} onValueChange={(v) => setForm({ ...form, employeeId: v })}>
                <SelectTrigger className="bg-white dark:bg-navy-800 border-slate-200 dark:border-slate-700">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {employees.map((emp: any) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.name} ({emp.employeeCode})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Leave Type */}
            <div className="space-y-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm font-medium">Leave Type *</Label>
              <Select value={form.leaveType} onValueChange={(v) => setForm({ ...form, leaveType: v })}>
                <SelectTrigger className="bg-white dark:bg-navy-800 border-slate-200 dark:border-slate-700">
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent>
                  {leaveTypes.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date Range */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-slate-700 dark:text-slate-300 text-sm font-medium">Start Date *</Label>
                <Input type="date" value={form.fromDate} onChange={(e) => setForm({ ...form, fromDate: e.target.value })} className="bg-white dark:bg-navy-800 border-slate-200 dark:border-slate-700" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-700 dark:text-slate-300 text-sm font-medium">End Date *</Label>
                <Input type="date" value={form.toDate} onChange={(e) => setForm({ ...form, toDate: e.target.value })} className="bg-white dark:bg-navy-800 border-slate-200 dark:border-slate-700" />
              </div>
            </div>

            {/* Auto-calculated days */}
            {calculatedDays > 0 && (
              <div className="bg-primary/5 dark:bg-primary/10 rounded-lg px-3 py-2 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-primary" />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  Duration: <strong className="text-primary">{calculatedDays} day{calculatedDays > 1 ? "s" : ""}</strong>
                </span>
              </div>
            )}

            {/* Reason */}
            <div className="space-y-1.5">
              <Label className="text-slate-700 dark:text-slate-300 text-sm font-medium">Reason</Label>
              <Textarea
                placeholder="Enter reason for leave..."
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                className="bg-white dark:bg-navy-800 border-slate-200 dark:border-slate-700 min-h-[80px]"
              />
            </div>

            {/* Status (only for edit) */}
            {editingItem && (
              <div className="space-y-1.5">
                <Label className="text-slate-700 dark:text-slate-300 text-sm font-medium">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger className="bg-white dark:bg-navy-800 border-slate-200 dark:border-slate-700">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)} className="border-slate-200 dark:border-slate-700">Cancel</Button>
            <Button onClick={handleSave} className="bg-primary text-primary-foreground shadow-sm">
              {editingItem ? "Update Leave" : "Create Leave"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================
// NOTIFICATION PANEL
// ============================================================

interface NotificationItem {
  id: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  timestamp: string;
  read: boolean;
  type: "low_stock" | "pending_po" | "pending_so" | "overdue" | "return";
}

function NotificationPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    // Generate notifications from real data
    const fetchNotifications = async () => {
      const items: NotificationItem[] = [];
      try {
        // Low stock alerts
        const stockRes = await fetch("/api/stock");
        const stockData = await stockRes.json();
        const lowStock = Array.isArray(stockData) ? stockData.filter((p: any) => Number(p.currentStock) < 10) : [];
        lowStock.slice(0, 3).forEach((p: any, i: number) => {
          items.push({
            id: `low-${i}`,
            icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
            title: "Low Stock Alert",
            description: `${p.productName} — only ${p.currentStock} units remaining`,
            timestamp: new Date().toISOString(),
            read: false,
            type: "low_stock",
          });
        });

        // Pending purchase orders
        const poRes = await fetch("/api/purchase-orders");
        const poData = await poRes.json();
        const pendingPOs = Array.isArray(poData) ? poData.filter((po: any) => po.status === "Pending") : [];
        pendingPOs.slice(0, 2).forEach((po: any, i: number) => {
          items.push({
            id: `po-${i}`,
            icon: <ShoppingCart className="h-4 w-4 text-blue-500" />,
            title: "Pending Purchase Order",
            description: `PO ${po.poNumber} from ${po.supplier?.name || "Supplier"} — ৳${Number(po.grandTotal).toLocaleString()}`,
            timestamp: po.createdAt || new Date().toISOString(),
            read: false,
            type: "pending_po",
          });
        });

        // Pending sales orders
        const soRes = await fetch("/api/sales-orders");
        const soData = await soRes.json();
        const pendingSOs = Array.isArray(soData) ? soData.filter((so: any) => so.status === "Pending") : [];
        pendingSOs.slice(0, 2).forEach((so: any, i: number) => {
          items.push({
            id: `so-${i}`,
            icon: <CartIcon className="h-4 w-4 text-green-500" />,
            title: "Pending Sales Order",
            description: `${so.invoiceNo} for ${so.customer?.name || "Customer"} — ৳${Number(so.grandTotal).toLocaleString()}`,
            timestamp: so.createdAt || new Date().toISOString(),
            read: false,
            type: "pending_so",
          });
        });

        // Overdue payments (unpaid sales)
        const unpaidSOs = Array.isArray(soData) ? soData.filter((so: any) => so.status === "Unpaid" || so.status === "Partial") : [];
        unpaidSOs.slice(0, 2).forEach((so: any, i: number) => {
          items.push({
            id: `overdue-${i}`,
            icon: <DollarSign className="h-4 w-4 text-red-500" />,
            title: "Overdue Payment",
            description: `${so.invoiceNo} — ৳${Number(so.grandTotal).toLocaleString()} unpaid`,
            timestamp: so.createdAt || new Date().toISOString(),
            read: false,
            type: "overdue",
          });
        });

        // New returns
        try {
          const srRes = await fetch("/api/sales-returns");
          const srData = await srRes.json();
          const recentReturns = Array.isArray(srData) ? srData.slice(0, 2) : [];
          recentReturns.forEach((sr: any, i: number) => {
            items.push({
              id: `return-${i}`,
              icon: <RefreshCcw className="h-4 w-4 text-purple-500" />,
              title: "New Sales Return",
              description: `${sr.returnNo || "Return"} for ${sr.salesOrder?.invoiceNo || "SO"}`,
              timestamp: sr.createdAt || new Date().toISOString(),
              read: false,
              type: "return",
            });
          });
        } catch { /* ignore */ }

      } catch { /* ignore */ }

      // Fallback if no notifications
      if (items.length === 0) {
        items.push(
          { id: "welcome", icon: <Zap className="h-4 w-4 text-primary" />, title: "Welcome to Electronics Mart IMS", description: "No pending notifications at this time. All systems operational.", timestamp: new Date().toISOString(), read: true, type: "low_stock" as const },
        );
      }

      setNotifications(items);
      setLoading(false);
    };
    fetchNotifications();
  }, [open]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const formatTime = (ts: string) => {
    const date = new Date(ts);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  return (
    <>
      {/* Backdrop */}
      {open && <div className="fixed inset-0 z-50 bg-black/30" onClick={onClose} />}

      {/* Slide-out panel */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full sm:w-96 bg-white dark:bg-navy-900 shadow-2xl border-l border-border transform transition-transform duration-300 ease-in-out ${open ? "translate-x-0" : "translate-x-full"}`}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-slate-50 dark:bg-navy-800">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Notifications</h2>
              {unreadCount > 0 && (
                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5">{unreadCount}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs text-primary hover:text-primary/80 h-7">
                  <CheckCircle className="h-3.5 w-3.5 mr-1" />Mark all read
                </Button>
              )}
              <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 dark:hover:text-white">
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-8 text-center">
                <RefreshCcw className="h-8 w-8 mx-auto text-primary animate-spin mb-2" />
                <p className="text-sm text-slate-500 dark:text-slate-400">Loading notifications...</p>
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="h-12 w-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="text-slate-500 dark:text-slate-400 text-sm">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {notifications.map((notif) => (
                  <div
                    key={notif.id}
                    className={`p-4 hover:bg-slate-50 dark:hover:bg-navy-800/50 transition-colors cursor-pointer ${!notif.read ? "bg-primary/5 dark:bg-primary/10" : ""}`}
                    onClick={() => markAsRead(notif.id)}
                  >
                    <div className="flex gap-3">
                      <div className={`mt-0.5 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${!notif.read ? "bg-primary/10 dark:bg-primary/20" : "bg-slate-100 dark:bg-navy-800"}`}>
                        {notif.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm font-medium ${!notif.read ? "text-slate-900 dark:text-white" : "text-slate-600 dark:text-slate-400"}`}>{notif.title}</p>
                          {!notif.read && <span className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5" />}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{notif.description}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">{formatTime(notif.timestamp)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-border bg-slate-50 dark:bg-navy-800 text-center">
            <p className="text-xs text-slate-500 dark:text-slate-400">{notifications.length} notification{notifications.length !== 1 ? "s" : ""} • {unreadCount} unread</p>
          </div>
        </div>
      </div>
    </>
  );
}

// ============================================================
// MAIN APP COMPONENT
// ============================================================

function AppContent() {
  const { theme, setTheme } = useTheme();
  const [currentPage, setCurrentPage] = useState<PageKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Dashboard", "Basic Setup", "Inventory", "Products"]));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      return next;
    });
  };

  const handleNav = (key: PageKey) => {
    setCurrentPage(key);
    setMobileSidebarOpen(false);
  };

  // Keyboard shortcut: Ctrl+K / Cmd+K to open search
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCurrentPage("advance-search");
        setMobileSidebarOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const renderPage = () => {
    if (currentPage === "dashboard") return <DashboardPage />;
    if (currentPage === "products") return <ProductsPage />;
    // Functional pages with custom components
    if (currentPage === "stock") return <StockPage />;
    if (currentPage === "purchase-orders") return <PurchaseOrderPage />;
    if (currentPage === "sales-orders") return <SalesOrderPage />;
    if (currentPage === "profit-loss") return <ProfitLossPage />;
    if (currentPage === "balance-sheet") return <BalanceSheetPage />;
    if (currentPage === "trial-balance") return <TrialBalancePage />;
    if (currentPage === "cash-in-hand") return <CashInHandPage />;
    if (currentPage === "advance-search") return <AdvanceSearchPage onNavigate={handleNav} />;
    if (currentPage === "transfers") return <TransferPage />;
    // MIS Report pages
    if (currentPage === "basic-report") return <BasicReportPage />;
    if (currentPage === "sales-report") return <SalesReportPage />;
    if (currentPage === "purchase-report") return <PurchaseReportPage />;
    // Return pages
    if (currentPage === "sales-returns") return <SalesReturnPage />;
    if (currentPage === "purchase-returns") return <PurchaseReturnPage />;
    // Hire sales page
    if (currentPage === "hire-sales") return <HireSalesPage />;
    // Order sheet page
    if (currentPage === "order-sheets") return <OrderSheetPage />;
    // Auto PO page
    if (currentPage === "auto-po") return <AutoPoPage />;
    // Stock details page
    if (currentPage === "stock-details") return <StockDetailsPage />;
    // Replacements page
    if (currentPage === "replacements") return <ReplacementsPage />;
    // New report pages
    if (currentPage === "hire-sales-report") return <HireSalesReportPage />;
    if (currentPage === "sr-report") return <SrReportPage />;
    if (currentPage === "customer-wise-report") return <CustomerWiseReportPage />;
    if (currentPage === "bank-report") return <BankReportPage />;
    if (currentPage === "transfer-report") return <TransferReportPage />;
    // Setup pages
    if (currentPage === "card-type-setup") return <CardTypeSetupPage />;
    if (currentPage === "sr-targets") return <SrTargetSetupPage />;
    // SMS module pages
    if (currentPage === "send-sms") return <SendSmsPage />;
    if (currentPage === "sms-inbox") return <SmsInboxPage />;
    if (currentPage === "sms-bills") return <SmsBillsPage />;
    if (currentPage === "sms-bill-payments") return <SmsBillPaymentsPage />;
    if (currentPage === "sms-reports") return <SmsReportsPage />;
    if (currentPage === "bulk-sms") return <BulkSmsPage />;
    if (currentPage === "employee-leaves") return <EmployeeLeavePage />;
    const config = moduleConfigs[currentPage];
    if (config) return <GenericModulePage config={config} />;
    // Placeholder for remaining complex modules
    const pageLabels: Record<string, { title: string; description: string }> = {
    };
    const info = pageLabels[currentPage] || { title: currentPage, description: "" };
    return <PlaceholderPage title={info.title} description={info.description} />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-navy-800 bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 text-white shadow-lg">
        <div className="flex items-center justify-between h-14 px-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-navy-800 lg:hidden"
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
            >
              {mobileSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-navy-800 hidden lg:flex"
              onClick={() => setSidebarOpen(!sidebarOpen)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-gradient-to-br from-primary to-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-primary/30">
                <Package className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-sm font-bold leading-tight tracking-wide">Electronics Mart</h1>
                <p className="text-[10px] text-navy-400 leading-tight tracking-wider uppercase">Inventory Management System</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Global Search Shortcut */}
            <Button
              variant="outline"
              size="sm"
              className="hidden md:flex items-center gap-2 text-navy-300 border-navy-700 hover:bg-navy-800 hover:text-white h-8 px-3"
              onClick={() => handleNav("advance-search")}
            >
              <Search className="h-3.5 w-3.5" />
              <span className="text-xs">Search...</span>
              <kbd className="ml-2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-navy-700 bg-navy-800 px-1.5 font-mono text-[10px] font-medium text-navy-400">⌘K</kbd>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-navy-800"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="sm" className="text-white hover:bg-navy-800 relative" onClick={() => setNotifPanelOpen(true)}>
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center pulse-dot font-medium">3</span>
            </Button>
            <Separator orientation="vertical" className="h-6 bg-navy-700" />
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-navy-700 rounded-full flex items-center justify-center">
                <User className="h-4 w-4" />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium leading-tight">Admin</p>
                <p className="text-[10px] text-navy-300">admin@electronicsmart.com</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
        )}

        {/* Sidebar */}
        <aside
          className={`${
            mobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
          } lg:translate-x-0 fixed lg:static z-40 h-[calc(100vh-3.5rem)] transition-all duration-300 ease-in-out bg-navy-950 dark:bg-navy-950 border-r border-navy-800 ${
            sidebarOpen ? "w-64" : "w-16"
          } overflow-y-auto overflow-x-hidden`}
        >
          <nav className="py-2">
            {sidebarGroups.map((group) => (
              <div key={group.label} className="mb-1">
                {group.items.length === 1 ? (
                  <button
                    onClick={() => handleNav(group.items[0].key)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-r-lg ${
                      currentPage === group.items[0].key
                        ? "bg-primary/90 text-white shadow-md shadow-primary/20 sidebar-item-active"
                        : "text-navy-300 hover:bg-navy-900/80 hover:text-white"
                    }`}
                  >
                    {group.items[0].icon}
                    {sidebarOpen && <span className="font-medium">{group.items[0].label}</span>}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-navy-500 hover:text-navy-200 transition-colors"
                    >
                      {sidebarOpen ? (
                        <>
                          <span className="opacity-70">{group.icon}</span>
                          <span className="flex-1 text-left">{group.label}</span>
                          {expandedGroups.has(group.label) ? <ChevronDown className="h-3 w-3 text-navy-500" /> : <ChevronRight className="h-3 w-3 text-navy-600" />}
                        </>
                      ) : (
                        <span className="opacity-70">{group.icon}</span>
                      )}
                    </button>
                    {expandedGroups.has(group.label) && sidebarOpen && (
                      <div className="ml-3 mt-0.5 space-y-0.5">
                        {group.items.map((item) => (
                          <button
                            key={item.key}
                            onClick={() => handleNav(item.key)}
                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md transition-all duration-200 ${
                              currentPage === item.key
                                ? "bg-primary/90 text-white shadow-sm shadow-primary/20 font-medium"
                                : "text-navy-400 hover:bg-navy-800/80 hover:text-white"
                            }`}
                          >
                            <span className={`${currentPage === item.key ? "text-white" : "opacity-70"}`}>{item.icon}</span>
                            <span>{item.label}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto flex flex-col">
          {/* Breadcrumb Bar */}
          <div className="bg-slate-50 dark:bg-navy-900/40 border-b border-border px-4 sm:px-6 lg:px-8 py-2 flex items-center gap-2 text-sm">
            <button onClick={() => handleNav("dashboard")} className="text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-primary flex items-center gap-1 transition-colors">
              <LayoutDashboard className="h-3.5 w-3.5" />
              Home
            </button>
            {(() => {
              const groupMap: Record<string, string> = {};
              sidebarGroups.forEach(g => g.items.forEach(item => { groupMap[item.key] = g.label; }));
              const group = groupMap[currentPage];
              const pageItem = sidebarGroups.flatMap(g => g.items).find(i => i.key === currentPage);
              const pageLabel = pageItem?.label || currentPage;
              if (group && group !== "Dashboard") {
                return (
                  <>
                    <ChevronRight className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                    <span className="text-slate-400 dark:text-slate-500">{group}</span>
                    <ChevronRight className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                    <span className="text-slate-700 dark:text-slate-200 font-medium">{pageLabel}</span>
                  </>
                );
              }
              return (
                <>
                  {currentPage !== "dashboard" && (
                    <>
                      <ChevronRight className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                      <span className="text-slate-700 dark:text-slate-200 font-medium">{pageLabel}</span>
                    </>
                  )}
                </>
              );
            })()}
          </div>
          <div className="p-4 sm:p-6 lg:p-8 flex-1 page-enter">
            {renderPage()}
          </div>
          {/* Footer */}
          <footer className="bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 dark:from-navy-950 dark:via-navy-900 dark:to-navy-950 text-white py-3 px-4 text-center text-sm border-t border-navy-800/50">
            <div className="flex items-center justify-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <p className="text-navy-300">Developed & Copyright by <span className="text-white font-medium">NextGen Digital Studio</span></p>
              <Zap className="h-3.5 w-3.5 text-amber-400" />
            </div>
          </footer>
        </main>
      </div>

      {/* Notification Panel */}
      <NotificationPanel open={notifPanelOpen} onClose={() => setNotifPanelOpen(false)} />
    </div>
  );
}

export default function HomePage() {
  return <AppContent />;
}
