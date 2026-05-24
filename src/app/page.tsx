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
  CircleDollarSign, Wallet, ShoppingBag, Tag, Hash
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
    <Card className="border-border">
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-slate-900 dark:text-white text-lg">{title}</CardTitle>
            <CardDescription className="text-slate-500 dark:text-slate-400">
              {filtered.length} record(s) found
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            {onImport && (
              <Button variant="outline" size="sm" onClick={onImport} className="text-slate-700 dark:text-slate-300">
                <Upload className="h-4 w-4 mr-1" /> Import CSV
              </Button>
            )}
            {onExportCSV && (
              <Button variant="outline" size="sm" onClick={onExportCSV} className="text-slate-700 dark:text-slate-300">
                <FileDown className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            )}
            {onExportPDF && (
              <Button variant="outline" size="sm" onClick={onExportPDF} className="text-slate-700 dark:text-slate-300">
                <FileText className="h-4 w-4 mr-1" /> Export PDF
              </Button>
            )}
            {onAdd && (
              <Button size="sm" onClick={onAdd} className="bg-primary text-primary-foreground">
                <Plus className="h-4 w-4 mr-1" /> {addLabel}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
        </div>
        <div className="table-container rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                {columns.map((col) => (
                  <TableHead key={col.key} className="text-slate-700 dark:text-slate-300 font-semibold">
                    {col.label}
                  </TableHead>
                ))}
                {(onEdit || onDelete) && (
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length + (onEdit || onDelete ? 1 : 0)} className="text-center py-8 text-slate-500 dark:text-slate-400">
                    No records found
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((item, idx) => (
                  <TableRow key={idx} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                    {columns.map((col) => (
                      <TableCell key={col.key} className="text-slate-700 dark:text-slate-300">
                        {col.render ? col.render(item) : (() => {
                          const val = item[col.key];
                          if (val === null || val === undefined) return "";
                          if (typeof val === "object") {
                            // Try to resolve nested relation: show .name if available
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
                            <Button variant="ghost" size="sm" onClick={() => onEdit(item)} className="text-blue-600 dark:text-blue-400">
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {onDelete && (
                            <Button variant="ghost" size="sm" onClick={() => onDelete(item)} className="text-red-600 dark:text-red-400">
                              <Trash2 className="h-4 w-4" />
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
  const variant = status === "Active" || status === "Approved" || status === "Confirmed"
    ? "default" as const
    : status === "Pending" || status === "Draft"
    ? "secondary" as const
    : "destructive" as const;
  return <Badge variant={variant}>{status}</Badge>;
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
          <Card key={i} className="border-border hover:shadow-xl transition-all duration-300 overflow-hidden group">
            <CardContent className="p-0">
              <div className={`bg-gradient-to-br ${card.gradient} p-4 text-white`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white/80">{card.title}</p>
                    <p className="text-2xl font-bold mt-1">
                      {loading ? (
                        <span className="inline-block w-20 h-7 bg-white/20 rounded animate-pulse" />
                      ) : card.value}
                    </p>
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

  if (loading) return <div className="text-center py-8 text-slate-500">Loading report...</div>;
  if (!data) return <div className="text-center py-8 text-slate-500">Failed to load report</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profit & Loss</h1>
          <p className="text-slate-500 dark:text-slate-400">Income vs expense statement</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
      </div>
      <Card className="border-border">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="text-lg font-semibold text-slate-900 dark:text-white border-b border-border pb-2">Revenue</div>
            <div className="grid grid-cols-2 gap-2 pl-4">
              <span className="text-slate-700 dark:text-slate-300">Sales Revenue</span>
              <span className="text-slate-700 dark:text-slate-300 text-right">৳{Number(data.salesRevenue).toLocaleString()}</span>
              <span className="text-slate-700 dark:text-slate-300">Other Income</span>
              <span className="text-slate-700 dark:text-slate-300 text-right">৳{Number(data.otherIncome).toLocaleString()}</span>
            </div>
            <div className="flex justify-between bg-slate-50 dark:bg-navy-900/50 p-3 rounded-lg font-semibold">
              <span className="text-slate-900 dark:text-white">Total Revenue</span>
              <span className="text-slate-900 dark:text-white">৳{Number(data.revenue).toLocaleString()}</span>
            </div>
            <Separator />
            <div className="text-lg font-semibold text-slate-900 dark:text-white border-b border-border pb-2">Cost of Goods Sold</div>
            <div className="grid grid-cols-2 gap-2 pl-4">
              <span className="text-slate-700 dark:text-slate-300">COGS</span>
              <span className="text-slate-700 dark:text-slate-300 text-right">৳{Number(data.costOfGoods).toLocaleString()}</span>
            </div>
            <div className="flex justify-between bg-green-50 dark:bg-green-900/20 p-3 rounded-lg font-semibold">
              <span className="text-green-700 dark:text-green-400">Gross Profit</span>
              <span className="text-green-700 dark:text-green-400">৳{Number(data.grossProfit).toLocaleString()}</span>
            </div>
            <p className="text-sm text-slate-500 pl-4">Gross Profit Margin: {data.grossProfitMargin}%</p>
            <Separator />
            <div className="text-lg font-semibold text-slate-900 dark:text-white border-b border-border pb-2">Operating Expenses</div>
            <div className="grid grid-cols-2 gap-2 pl-4">
              <span className="text-slate-700 dark:text-slate-300">Total Expenses</span>
              <span className="text-slate-700 dark:text-slate-300 text-right">৳{Number(data.operatingExpenses).toLocaleString()}</span>
            </div>
            <Separator />
            <div className={`flex justify-between p-4 rounded-lg font-bold text-lg ${Number(data.netProfit) >= 0 ? "bg-green-50 dark:bg-green-900/20" : "bg-red-50 dark:bg-red-900/20"}`}>
              <span className={Number(data.netProfit) >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>Net Profit</span>
              <span className={Number(data.netProfit) >= 0 ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>৳{Number(data.netProfit).toLocaleString()}</span>
            </div>
            <p className="text-sm text-slate-500 pl-4">Net Profit Margin: {data.netProfitMargin}%</p>
          </div>
        </CardContent>
      </Card>
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

  if (loading) return <div className="text-center py-8 text-slate-500">Loading report...</div>;
  if (!data) return <div className="text-center py-8 text-slate-500">Failed to load report</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Balance Sheet</h1>
          <p className="text-slate-500 dark:text-slate-400">Assets = Liabilities + Equity</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="border-border">
          <CardHeader><CardTitle className="text-slate-900 dark:text-white">Assets</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-slate-700 dark:text-slate-300">Stock Value</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(data.assets?.stock || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-slate-700 dark:text-slate-300">Bank Balance</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(data.assets?.bankBalance || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-slate-700 dark:text-slate-300">Receivables</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(data.assets?.receivables || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between bg-slate-50 dark:bg-navy-900/50 p-3 rounded-lg font-bold">
                <span className="text-slate-900 dark:text-white">Total Assets</span>
                <span className="text-slate-900 dark:text-white">৳{Number(data.assets?.totalAssets || 0).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border">
          <CardHeader><CardTitle className="text-slate-900 dark:text-white">Liabilities & Equity</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-slate-700 dark:text-slate-300">Payables</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(data.liabilities?.payables || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border">
                <span className="text-slate-700 dark:text-slate-300">Equity (Retained Earnings)</span>
                <span className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(data.liabilities?.equity || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between bg-slate-50 dark:bg-navy-900/50 p-3 rounded-lg font-bold">
                <span className="text-slate-900 dark:text-white">Total Liabilities & Equity</span>
                <span className="text-slate-900 dark:text-white">৳{Number(data.liabilities?.totalLiabilities || 0).toLocaleString()}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300 font-semibold">Balance Check:</span>
            <Badge variant={data.balanced ? "default" : "destructive"}>{data.balanced ? "Balanced" : "Not Balanced"}</Badge>
          </div>
        </CardContent>
      </Card>
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

  if (loading) return <div className="text-center py-8 text-slate-500">Loading report...</div>;
  if (!data) return <div className="text-center py-8 text-slate-500">Failed to load report</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Trial Balance</h1>
          <p className="text-slate-500 dark:text-slate-400">Standard trial balance report</p>
        </div>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> Export PDF</Button>
      </div>
      <Card className="border-border">
        <CardContent className="p-0">
          <div className="table-container rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Account</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Debit (৳)</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Credit (৳)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data.entries || data.entries.length === 0) ? (
                  <TableRow><TableCell colSpan={3} className="text-center py-8 text-slate-500">No entries</TableCell></TableRow>
                ) : (
                  <>
                    {data.entries.map((entry: any, i: number) => (
                      <TableRow key={i} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                        <TableCell className="text-slate-700 dark:text-slate-300">{entry.account}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 text-right">{Number(entry.totalDebit).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-700 dark:text-slate-300 text-right">{Number(entry.totalCredit).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-slate-50 dark:bg-navy-900/50 font-bold">
                      <TableCell className="text-slate-900 dark:text-white">Grand Total</TableCell>
                      <TableCell className="text-slate-900 dark:text-white text-right">৳{Number(data.grandTotalDebit).toLocaleString()}</TableCell>
                      <TableCell className="text-slate-900 dark:text-white text-right">৳{Number(data.grandTotalCredit).toLocaleString()}</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-slate-700 dark:text-slate-300 font-semibold">Balance Check:</span>
            <Badge variant={data.balanced ? "default" : "destructive"}>{data.balanced ? "Balanced" : "Not Balanced"}</Badge>
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

  if (loading) return <div className="text-center py-8 text-slate-500">Loading report...</div>;
  if (!data) return <div className="text-center py-8 text-slate-500">Failed to load report</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Cash in Hand</h1>
        <p className="text-slate-500 dark:text-slate-400">Current cash balance across all methods</p>
      </div>
      <Card className="border-border">
        <CardHeader><CardTitle className="text-slate-900 dark:text-white">Summary</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-slate-700 dark:text-slate-300">Opening Balance</span>
              <span className="text-slate-700 dark:text-slate-300 font-medium">৳{Number(data.totals?.openingBalance || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-slate-700 dark:text-slate-300">+ Deposits</span>
              <span className="text-green-600 dark:text-green-400 font-medium">৳{Number(data.totals?.deposits || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-slate-700 dark:text-slate-300">- Withdrawals</span>
              <span className="text-red-600 dark:text-red-400 font-medium">৳{Number(data.totals?.withdrawals || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-slate-700 dark:text-slate-300">+ Cash Income</span>
              <span className="text-green-600 dark:text-green-400 font-medium">৳{Number(data.totals?.cashIncome || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-slate-700 dark:text-slate-300">- Cash Expense</span>
              <span className="text-red-600 dark:text-red-400 font-medium">৳{Number(data.totals?.cashExpense || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-slate-700 dark:text-slate-300">+ Cash Collections</span>
              <span className="text-green-600 dark:text-green-400 font-medium">৳{Number(data.totals?.cashCollections || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-border">
              <span className="text-slate-700 dark:text-slate-300">- Cash Deliveries</span>
              <span className="text-red-600 dark:text-red-400 font-medium">৳{Number(data.totals?.cashDeliveries || 0).toLocaleString()}</span>
            </div>
            <div className="flex justify-between bg-slate-50 dark:bg-navy-900/50 p-4 rounded-lg font-bold text-lg">
              <span className="text-slate-900 dark:text-white">Total Cash in Hand</span>
              <span className="text-slate-900 dark:text-white">৳{Number(data.totals?.totalCashInHand || 0).toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>
      <Card className="border-border">
        <CardHeader><CardTitle className="text-slate-900 dark:text-white">Bank-wise Breakdown</CardTitle></CardHeader>
        <CardContent>
          <div className="table-container rounded-md border border-border">
            <Table>
              <TableHeader>
                <TableRow className="bg-slate-50 dark:bg-navy-900/50">
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Bank</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold">Account No</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Opening</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Deposits</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Withdrawals</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Current Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!data.bankBreakdown || data.bankBreakdown.length === 0) ? (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No bank data</TableCell></TableRow>
                ) : data.bankBreakdown.map((bank: any) => (
                  <TableRow key={bank.bankId} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                    <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{bank.bankName}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300">{bank.accountNo}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300 text-right">৳{Number(bank.openingBalance).toLocaleString()}</TableCell>
                    <TableCell className="text-green-600 dark:text-green-400 text-right">৳{Number(bank.deposits).toLocaleString()}</TableCell>
                    <TableCell className="text-red-600 dark:text-red-400 text-right">৳{Number(bank.withdrawals).toLocaleString()}</TableCell>
                    <TableCell className="text-slate-700 dark:text-slate-300 text-right font-medium">৳{Number(bank.currentBalance).toLocaleString()}</TableCell>
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
// ADVANCE SEARCH PAGE
// ============================================================

function AdvanceSearchPage() {
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("products");
  const [results, setResults] = useState<any>({ products: [], customers: [], suppliers: [], purchaseOrders: [], salesOrders: [] });
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/advance-search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setResults(data);
      setSearched(true);
    } catch { /* ignore */ }
    setLoading(false);
  };

  const renderTable = (items: any[], columns: { key: string; label: string; render?: (item: any) => React.ReactNode }[]) => {
    if (items.length === 0) return <div className="text-center py-8 text-slate-500">No results found</div>;
    return (
      <div className="table-container rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50 dark:bg-navy-900/50">
              {columns.map(col => <TableHead key={col.key} className="text-slate-700 dark:text-slate-300 font-semibold">{col.label}</TableHead>)}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, i) => (
              <TableRow key={i} className="hover:bg-slate-50 dark:hover:bg-navy-900/30">
                {columns.map(col => (
                  <TableCell key={col.key} className="text-slate-700 dark:text-slate-300">
                    {col.render ? col.render(item) : String(item[col.key] ?? "-")}
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
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Advance Search</h1>
        <p className="text-slate-500 dark:text-slate-400">Search across all modules</p>
      </div>
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex gap-2">
            <Input placeholder="Search products, customers, suppliers, orders..." value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && handleSearch()} className="flex-1" />
            <Button onClick={handleSearch} className="bg-primary text-primary-foreground"><Search className="h-4 w-4 mr-1" /> Search</Button>
          </div>
        </CardContent>
      </Card>
      {loading && <div className="text-center py-8 text-slate-500">Searching...</div>}
      {searched && !loading && (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="products">Products ({results.products?.length || 0})</TabsTrigger>
            <TabsTrigger value="customers">Customers ({results.customers?.length || 0})</TabsTrigger>
            <TabsTrigger value="suppliers">Suppliers ({results.suppliers?.length || 0})</TabsTrigger>
            <TabsTrigger value="purchaseOrders">POs ({results.purchaseOrders?.length || 0})</TabsTrigger>
            <TabsTrigger value="salesOrders">SOs ({results.salesOrders?.length || 0})</TabsTrigger>
          </TabsList>
          <TabsContent value="products">
            {renderTable(results.products || [], [
              { key: "name", label: "Name" },
              { key: "productCode", label: "Code" },
              { key: "category", label: "Category", render: (i: any) => i.category?.name || "-" },
              { key: "salePrice", label: "Sale Price", render: (i: any) => `৳${Number(i.salePrice).toLocaleString()}` },
            ])}
          </TabsContent>
          <TabsContent value="customers">
            {renderTable(results.customers || [], [
              { key: "name", label: "Name" },
              { key: "customerCode", label: "Code" },
              { key: "phone", label: "Phone" },
              { key: "address", label: "Address" },
            ])}
          </TabsContent>
          <TabsContent value="suppliers">
            {renderTable(results.suppliers || [], [
              { key: "name", label: "Name" },
              { key: "supplierCode", label: "Code" },
              { key: "phone", label: "Phone" },
              { key: "address", label: "Address" },
            ])}
          </TabsContent>
          <TabsContent value="purchaseOrders">
            {renderTable(results.purchaseOrders || [], [
              { key: "poNumber", label: "PO Number" },
              { key: "supplier", label: "Supplier", render: (i: any) => i.supplier?.name || "-" },
              { key: "grandTotal", label: "Total", render: (i: any) => `৳${Number(i.grandTotal).toLocaleString()}` },
              { key: "status", label: "Status", render: (i: any) => <StatusBadge status={i.status || "Pending"} /> },
            ])}
          </TabsContent>
          <TabsContent value="salesOrders">
            {renderTable(results.salesOrders || [], [
              { key: "invoiceNo", label: "Invoice No" },
              { key: "customer", label: "Customer", render: (i: any) => i.customer?.name || "-" },
              { key: "grandTotal", label: "Total", render: (i: any) => `৳${Number(i.grandTotal).toLocaleString()}` },
              { key: "status", label: "Status", render: (i: any) => <StatusBadge status={i.status || "Pending"} /> },
            ])}
          </TabsContent>
        </Tabs>
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
// MAIN APP COMPONENT
// ============================================================

function AppContent() {
  const { theme, setTheme } = useTheme();
  const [currentPage, setCurrentPage] = useState<PageKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Dashboard", "Basic Setup", "Inventory", "Products"]));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
    if (currentPage === "advance-search") return <AdvanceSearchPage />;
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
    const config = moduleConfigs[currentPage];
    if (config) return <GenericModulePage config={config} />;
    // Placeholder for remaining complex modules
    const pageLabels: Record<string, { title: string; description: string }> = {
      "order-sheets": { title: "Order Sheets", description: "Create and manage purchase order worksheets" },
      "auto-po": { title: "Auto Purchase Orders", description: "Auto-generate POs for low stock products" },
      "replacements": { title: "Replacement Orders", description: "Manage replacement orders for defective goods" },
      "stock-details": { title: "Stock Details", description: "Detailed product stock ledger and movements" },
      "card-type-setup": { title: "Card Type Setup", description: "Configure card types with payment options" },
      "sr-targets": { title: "SR Target Setup", description: "Set sales targets for representatives" },
      "send-sms": { title: "Send SMS", description: "Compose and send SMS to contacts" },
      "sms-inbox": { title: "SMS Inbox", description: "View sent and received SMS logs" },
      "sms-bills": { title: "SMS Bills", description: "Track SMS usage and billing" },
      "sms-bill-payments": { title: "SMS Bill Payments", description: "Record payments to SMS provider" },
      "sms-reports": { title: "SMS Reports", description: "Filterable SMS reports" },
      "bulk-sms": { title: "Bulk SMS", description: "Send promotional messages in bulk" },
      "hire-sales-report": { title: "Hire Sales Report", description: "Hire sales and outstanding report" },
      "sr-report": { title: "SR Report", description: "Sales rep performance against targets" },
      "customer-wise-report": { title: "Customer Wise Report", description: "Per-customer sales and ledger" },
      "bank-report": { title: "Bank Report", description: "Bank book with credits/debits" },
      "transfer-report": { title: "Transfer Report", description: "Stock transfer log" },
    };
    const info = pageLabels[currentPage] || { title: currentPage, description: "" };
    return <PlaceholderPage title={info.title} description={info.description} />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b border-border bg-navy-950 dark:bg-navy-950 text-white shadow-lg">
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
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Package className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-base font-bold leading-tight">Electronics Mart</h1>
                <p className="text-[10px] text-navy-300 leading-tight">Inventory Management System</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              className="text-white hover:bg-navy-800"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Button variant="ghost" size="sm" className="text-white hover:bg-navy-800 relative">
              <Bell className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-[10px] flex items-center justify-center">3</span>
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
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                      currentPage === group.items[0].key
                        ? "bg-primary text-white"
                        : "text-navy-300 hover:bg-navy-900 hover:text-white"
                    }`}
                  >
                    {group.items[0].icon}
                    {sidebarOpen && <span>{group.items[0].label}</span>}
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-navy-400 hover:text-navy-200"
                    >
                      {sidebarOpen ? (
                        <>
                          {group.icon}
                          <span className="flex-1 text-left">{group.label}</span>
                          {expandedGroups.has(group.label) ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                        </>
                      ) : (
                        group.icon
                      )}
                    </button>
                    {expandedGroups.has(group.label) && sidebarOpen && (
                      <div className="ml-2">
                        {group.items.map((item) => (
                          <button
                            key={item.key}
                            onClick={() => handleNav(item.key)}
                            className={`w-full flex items-center gap-3 px-3 py-1.5 text-sm rounded-md transition-colors ${
                              currentPage === item.key
                                ? "bg-primary text-white"
                                : "text-navy-300 hover:bg-navy-900 hover:text-white"
                            }`}
                          >
                            {item.icon}
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
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 min-h-[calc(100vh-3.5rem-3rem)]">
            {renderPage()}
          </div>
          {/* Footer */}
          <footer className="bg-navy-950 dark:bg-navy-950 text-white py-3 px-4 text-center text-sm">
            <p>Developed & Copyright by NextGen Digital Studio</p>
          </footer>
        </main>
      </div>
    </div>
  );
}

// ============================================================
// EXPORT
// ============================================================

export default function HomePage() {
  return <AppContent />;
}
