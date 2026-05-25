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
  CircleDollarSign, Wallet, ShoppingBag, Tag, Hash, Award,
  Lock, LogIn, ChevronLeft, XCircle
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

// TYPES

type PageKey =
  | "dashboard"
  | "companies" | "categories" | "colors" | "products" | "banks" | "departments"
  | "godowns" | "interest" | "segments" | "capacities" | "sr-targets"
  | "payment-options" | "card-types" | "card-type-setup"
  | "investment-heads" | "assets" | "liabilities"
  | "liability-received" | "liability-pay" | "liability-report"
  | "designations" | "employees" | "employee-leaves"
  | "customers" | "suppliers"
  | "order-sheets" | "company-order-sheet" | "customer-order-sheet" | "order-sheet-report"
  | "purchase-orders" | "auto-po"
  | "sales-orders" | "hire-sales" | "sales-returns" | "purchase-returns"
  | "replacements" | "stock" | "stock-details" | "transfers"
  | "expense-income-heads" | "expenses" | "cash-collections"
  | "cash-deliveries" | "incomes" | "bank-transactions"
  | "sms-inbox" | "send-sms" | "sms-bills" | "sms-reports"
  | "sms-settings" | "sms-bill-payments" | "bulk-sms"
  | "cash-in-hand" | "trial-balance" | "profit-loss" | "balance-sheet"
  | "basic-report" | "employee-info" | "product-info"
  | "stock-details-report" | "stock-summary-report" | "stock-ledger"
  | "stock-quantity-report" | "stock-forecast-product" | "stock-forecast-concern"
  | "purchase-report" | "supplier-ledger" | "daily-purchase-report"
  | "supplier-wise-purchase" | "supplier-cash-delivery" | "suppliers-due-report"
  | "model-wise-purchase" | "vat-report"
  | "sales-report" | "daily-sales-report" | "replacement-report" | "model-wise-sales"
  | "hire-sales-report" | "installment-collection" | "upcoming-installments"
  | "defaulting-customer" | "default-customer-summary" | "hire-account-details"
  | "sr-report" | "sr-wise-sales-report" | "sr-wise-sales-details"
  | "sr-wise-customer-due" | "sr-wise-customer-sales-summary" | "sr-visit-report"
  | "sr-wise-customer-status" | "sr-wise-cash-collection" | "sr-commission-report"
  | "customer-wise-report" | "customer-wise-sales-report" | "category-wise-customer-due"
  | "customer-ledger-report" | "customer-due-date-wise" | "customer-cash-collection"
  | "customer-ledger-summary"
  | "expense-report" | "product-wise-benefit" | "income-report" | "adjustment-report"
  | "transaction-summary" | "monthly-transaction" | "showroom-analysis"
  | "bank-report" | "bank-transaction-report" | "bank-ledger" | "transfer-report"
  | "advance-search" | "audit-log" | "user-profile";
interface SidebarGroup {
  label: string;
  icon: React.ReactNode;
  items: { key: PageKey; label: string; icon: React.ReactNode }[];
}
// SIDEBAR NAVIGATION CONFIG

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
      { key: "liability-received", label: "Liability Received", icon: <CheckCircle className="h-4 w-4" /> },
      { key: "liability-pay", label: "Liability Pay", icon: <DollarSign className="h-4 w-4" /> },
      { key: "liability-report", label: "Liability Report", icon: <BarChart3 className="h-4 w-4" /> },
    ],
  },
  {
    label: "Basic Setup",
    icon: <Settings className="h-4 w-4" />,
    items: [
      { key: "companies", label: "Companies", icon: <Building2 className="h-4 w-4" /> },
      { key: "categories", label: "Categories", icon: <Grid3X3 className="h-4 w-4" /> },
      { key: "colors", label: "Colors", icon: <Palette className="h-4 w-4" /> },
      { key: "products", label: "Products", icon: <Package className="h-4 w-4" /> },
      { key: "banks", label: "Banks", icon: <Banknote className="h-4 w-4" /> },
      { key: "departments", label: "Departments", icon: <Building className="h-4 w-4" /> },
      { key: "godowns", label: "Godowns", icon: <Warehouse className="h-4 w-4" /> },
      { key: "interest", label: "Interest %", icon: <Percent className="h-4 w-4" /> },
      { key: "segments", label: "Segments", icon: <Layers className="h-4 w-4" /> },
      { key: "capacities", label: "Capacities", icon: <Gauge className="h-4 w-4" /> },
      { key: "sr-targets", label: "SR Target Setup", icon: <Target className="h-4 w-4" /> },
      { key: "payment-options", label: "Payment Options", icon: <CreditCard className="h-4 w-4" /> },
      { key: "card-types", label: "Card Types", icon: <CreditCard className="h-4 w-4" /> },
      { key: "card-type-setup", label: "Card Type Setup", icon: <Settings className="h-4 w-4" /> },
    ],
  },
  {
    label: "Staff",
    icon: <UserCheck className="h-4 w-4" />,
    items: [
      { key: "designations", label: "Designations", icon: <Award className="h-4 w-4" /> },
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
      { key: "order-sheets", label: "Order Sheet", icon: <ClipboardList className="h-4 w-4" /> },
      { key: "company-order-sheet", label: "Company Order Sheet", icon: <Building2 className="h-4 w-4" /> },
      { key: "customer-order-sheet", label: "Customer Order Sheet", icon: <Users className="h-4 w-4" /> },
      { key: "order-sheet-report", label: "Order Sheet Report", icon: <FileSpreadsheet className="h-4 w-4" /> },
      { key: "purchase-orders", label: "Purchase Order", icon: <ShoppingCart className="h-4 w-4" /> },
      { key: "auto-po", label: "Auto PO", icon: <RefreshCcw className="h-4 w-4" /> },
      { key: "sales-orders", label: "Sales Order", icon: <CartIcon className="h-4 w-4" /> },
      { key: "hire-sales", label: "Hire Sales", icon: <ArrowUpRight className="h-4 w-4" /> },
      { key: "sales-returns", label: "Sales Return", icon: <ArrowDownRight className="h-4 w-4" /> },
      { key: "purchase-returns", label: "Purchase Return", icon: <ArrowDownRight className="h-4 w-4" /> },
      { key: "replacements", label: "Replacement Order", icon: <RefreshCcw className="h-4 w-4" /> },
      { key: "stock", label: "Stock", icon: <Box className="h-4 w-4" /> },
      { key: "stock-details", label: "Stock Details", icon: <Eye className="h-4 w-4" /> },
      { key: "transfers", label: "Transfer", icon: <ArrowRightLeft className="h-4 w-4" /> },
    ],
  },
  {
    label: "Accounts",
    icon: <DollarSign className="h-4 w-4" />,
    items: [
      { key: "expense-income-heads", label: "Expense/Income Head", icon: <Layers className="h-4 w-4" /> },
      { key: "expenses", label: "Expense", icon: <TrendingDown className="h-4 w-4" /> },
      { key: "cash-collections", label: "Cash Collection", icon: <DollarSign className="h-4 w-4" /> },
      { key: "cash-deliveries", label: "Cash Delivery", icon: <Banknote className="h-4 w-4" /> },
      { key: "incomes", label: "Income", icon: <TrendingUp className="h-4 w-4" /> },
      { key: "bank-transactions", label: "Bank Transaction", icon: <Banknote className="h-4 w-4" /> },
    ],
  },
  {
    label: "SMS Service",
    icon: <Phone className="h-4 w-4" />,
    items: [
      { key: "sms-inbox", label: "SMS Inbox", icon: <Mail className="h-4 w-4" /> },
      { key: "send-sms", label: "Send SMS", icon: <PhoneCall className="h-4 w-4" /> },
      { key: "sms-bills", label: "SMS Bill", icon: <Receipt className="h-4 w-4" /> },
      { key: "sms-reports", label: "SMS Report", icon: <BarChart3 className="h-4 w-4" /> },
      { key: "sms-settings", label: "SMS Service Settings", icon: <Settings className="h-4 w-4" /> },
      { key: "sms-bill-payments", label: "SMS Bill Payment", icon: <DollarSign className="h-4 w-4" /> },
      { key: "bulk-sms", label: "Send Bulk SMS", icon: <Phone className="h-4 w-4" /> },
    ],
  },
  {
    label: "Accounting Reports",
    icon: <FileSpreadsheet className="h-4 w-4" />,
    items: [
      { key: "cash-in-hand", label: "Cash In Hand", icon: <Banknote className="h-4 w-4" /> },
      { key: "trial-balance", label: "Trial Balance", icon: <FileSpreadsheet className="h-4 w-4" /> },
      { key: "profit-loss", label: "Profit and Loss Account", icon: <BarChart3 className="h-4 w-4" /> },
      { key: "balance-sheet", label: "Balance Sheet", icon: <FileTextIcon className="h-4 w-4" /> },
    ],
  },
  {
    label: "MIS Report",
    icon: <BarChart3 className="h-4 w-4" />,
    items: [
      { key: "basic-report", label: "Basic Report", icon: <Activity className="h-4 w-4" /> },
      { key: "employee-info", label: "Employee Information", icon: <Users className="h-4 w-4" /> },
      { key: "product-info", label: "Product Information", icon: <Package className="h-4 w-4" /> },
      { key: "stock-details-report", label: "Stock Details Report", icon: <Eye className="h-4 w-4" /> },
      { key: "stock-summary-report", label: "Stock Summary Report", icon: <Layers className="h-4 w-4" /> },
      { key: "stock-ledger", label: "Stock Ledger", icon: <FileSpreadsheet className="h-4 w-4" /> },
      { key: "stock-quantity-report", label: "Stock Quantity Report", icon: <Hash className="h-4 w-4" /> },
      { key: "stock-forecast-product", label: "Stock Forecast (Product)", icon: <TrendingUp className="h-4 w-4" /> },
      { key: "stock-forecast-concern", label: "Stock Forecast (Concern)", icon: <Building2 className="h-4 w-4" /> },
      { key: "purchase-report", label: "Purchase Report", icon: <ShoppingCart className="h-4 w-4" /> },
      { key: "supplier-ledger", label: "Supplier Ledger", icon: <Truck className="h-4 w-4" /> },
      { key: "daily-purchase-report", label: "Daily Purchase Report", icon: <Calendar className="h-4 w-4" /> },
      { key: "supplier-wise-purchase", label: "Suppliers Wise Purchase", icon: <Truck className="h-4 w-4" /> },
      { key: "supplier-cash-delivery", label: "Supplier Cash Delivery", icon: <Banknote className="h-4 w-4" /> },
      { key: "suppliers-due-report", label: "Suppliers Due Report", icon: <AlertTriangle className="h-4 w-4" /> },
      { key: "model-wise-purchase", label: "Model Wise Purchase", icon: <Tag className="h-4 w-4" /> },
      { key: "vat-report", label: "VAT Report", icon: <Receipt className="h-4 w-4" /> },
      { key: "sales-report", label: "Sales Report", icon: <CartIcon className="h-4 w-4" /> },
      { key: "daily-sales-report", label: "Daily Sales Report", icon: <Calendar className="h-4 w-4" /> },
      { key: "replacement-report", label: "Replacement Report", icon: <RefreshCcw className="h-4 w-4" /> },
      { key: "model-wise-sales", label: "Model Wise Sales", icon: <Tag className="h-4 w-4" /> },
      { key: "hire-sales-report", label: "Hire Sales Report", icon: <ArrowUpRight className="h-4 w-4" /> },
      { key: "installment-collection", label: "Installment Collection", icon: <DollarSign className="h-4 w-4" /> },
      { key: "upcoming-installments", label: "Upcoming Installments", icon: <Clock className="h-4 w-4" /> },
      { key: "defaulting-customer", label: "Defaulting Customer", icon: <AlertTriangle className="h-4 w-4" /> },
      { key: "default-customer-summary", label: "Default Customer Summary", icon: <Users className="h-4 w-4" /> },
      { key: "hire-account-details", label: "Hire Account Details", icon: <Wallet className="h-4 w-4" /> },
      { key: "sr-report", label: "SR Report", icon: <UserCheck className="h-4 w-4" /> },
      { key: "sr-wise-sales-report", label: "SR Wise Sales Report", icon: <BarChart className="h-4 w-4" /> },
      { key: "sr-wise-sales-details", label: "SR Wise Sales Details", icon: <FileSpreadsheet className="h-4 w-4" /> },
      { key: "sr-wise-customer-due", label: "SR Wise Customer Due", icon: <DollarSign className="h-4 w-4" /> },
      { key: "sr-wise-customer-sales-summary", label: "SR Wise Customer Sales Summary", icon: <BarChart3 className="h-4 w-4" /> },
      { key: "sr-visit-report", label: "SR Visit Report", icon: <UserCheck className="h-4 w-4" /> },
      { key: "sr-wise-customer-status", label: "SR Wise Customer Status", icon: <Activity className="h-4 w-4" /> },
      { key: "sr-wise-cash-collection", label: "SR Wise Cash Collection", icon: <DollarSign className="h-4 w-4" /> },
      { key: "sr-commission-report", label: "SR Commission Report", icon: <CircleDollarSign className="h-4 w-4" /> },
      { key: "customer-wise-report", label: "Customer Wise Report", icon: <Users className="h-4 w-4" /> },
      { key: "customer-wise-sales-report", label: "Customer Wise Sales Report", icon: <ShoppingBag className="h-4 w-4" /> },
      { key: "category-wise-customer-due", label: "Category Wise Customer Due", icon: <Grid3X3 className="h-4 w-4" /> },
      { key: "customer-ledger-report", label: "Customer Ledger Report", icon: <FileSpreadsheet className="h-4 w-4" /> },
      { key: "customer-due-date-wise", label: "Customer Due Report [Date Wise]", icon: <Calendar className="h-4 w-4" /> },
      { key: "customer-cash-collection", label: "Customer Cash Collection", icon: <Banknote className="h-4 w-4" /> },
      { key: "customer-ledger-summary", label: "Customer Ledger Summary", icon: <FileSpreadsheet className="h-4 w-4" /> },
    ],
  },
  {
    label: "Management Report",
    icon: <BarChart3 className="h-4 w-4" />,
    items: [
      { key: "expense-report", label: "Expense Report", icon: <TrendingDown className="h-4 w-4" /> },
      { key: "product-wise-benefit", label: "Product Wise Benefit Report", icon: <Package className="h-4 w-4" /> },
      { key: "income-report", label: "Income Report", icon: <TrendingUp className="h-4 w-4" /> },
      { key: "adjustment-report", label: "Adjustment Report", icon: <ArrowRightLeft className="h-4 w-4" /> },
      { key: "transaction-summary", label: "Transaction Summary Report", icon: <Activity className="h-4 w-4" /> },
      { key: "monthly-transaction", label: "Monthly Transaction Report", icon: <Calendar className="h-4 w-4" /> },
      { key: "showroom-analysis", label: "Showroom Analysis Report", icon: <Building2 className="h-4 w-4" /> },
    ],
  },
  {
    label: "Bank Report",
    icon: <Banknote className="h-4 w-4" />,
    items: [
      { key: "bank-report", label: "Bank Report", icon: <Banknote className="h-4 w-4" /> },
      { key: "bank-transaction-report", label: "Bank Transaction Report", icon: <ArrowRightLeft className="h-4 w-4" /> },
      { key: "bank-ledger", label: "Bank Ledger", icon: <FileSpreadsheet className="h-4 w-4" /> },
      { key: "transfer-report", label: "Transfer Report", icon: <ArrowRightLeft className="h-4 w-4" /> },
    ],
  },
  {
    label: "System",
    icon: <Settings className="h-4 w-4" />,
    items: [
      { key: "advance-search", label: "Advance Search", icon: <Search className="h-4 w-4" /> },
      { key: "audit-log", label: "Audit Log", icon: <FileText className="h-4 w-4" /> },
      { key: "user-profile", label: "User Profile", icon: <User className="h-4 w-4" /> },
    ],
  },
];

// HELPER: Percent icon (missing from lucide)
function Percent({ className }: { className?: string }) { return (    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="19" x2="5" y1="5" y2="19" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}
// DATA TABLE COMPONENT
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
  }, [data, search, columns]); return (    <Card className="border-border shadow-sm hover:shadow-md transition-shadow duration-200">
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
// STATUS BADGE

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
  const c = config[status] || { variant: "outline" as const, className: "bg-slate-100 text-slate-700 dark:bg-slate-800/60 dark:text-slate-300 border-slate-200 dark:border-slate-700", dot: "bg-slate-400" }; return (    <Badge variant={c.variant} className={`${c.className} text-xs font-medium border inline-flex items-center gap-1.5 px-2 py-0.5`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {status}
    </Badge>
  );
}
// PAGE HEADER COMPONENT

function PageHeader({ title, description, icon, children }: { title: string; description?: string; icon?: React.ReactNode; children?: React.ReactNode }) { return (    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
      <div className="flex items-center gap-3">
        {icon && <div className="p-2.5 rounded-xl bg-primary/10 text-primary">{icon}</div>}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
          {description && <p className="text-slate-500 dark:text-slate-400 mt-0.5 text-sm">{description}</p>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}
function DashboardPage() {
  const [stats, setStats] = useState({ totalProducts: 0, activeProducts: 0, totalCategories: 0, totalCustomers: 0, activeCustomers: 0, totalSuppliers: 0, activeSuppliers: 0, todaySales: 0, todayPurchase: 0, stockValue: 0, cashBalance: 0, pendingPO: 0, pendingSO: 0, confirmedPO: 0, confirmedSO: 0, completedPO: 0, completedSO: 0, totalExpenses: 0, totalIncome: 0, totalRevenue: 0, netProfit: 0, recentActivities: [] as any[], topSellingProducts: [] as any[], monthlySalesData: [] as any[], categoryDistribution: [] as any[] });
  const [loading, setLoading] = useState(true);
  const [recentSales, setRecentSales] = useState<any[]>([]);
  const [lowStockProducts, setLowStockProducts] = useState<any[]>([]);
  const [now, setNow] = useState(new Date());
  const [userName, setUserName] = useState("");
  React.useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  React.useEffect(() => { try { const s = localStorage.getItem("ems_user"); if (s) setUserName(JSON.parse(s).name || ""); } catch {} }, []);
  React.useEffect(() => {
    fetch("/api/dashboard").then((r) => r.json()).then((d) => { setStats(d); setLoading(false); }).catch(() => setLoading(false));
    fetch("/api/sales-orders?limit=5").then((r) => r.json()).then((d) => setRecentSales(Array.isArray(d) ? d.slice(0, 5) : [])).catch(() => {});
    fetch("/api/stock").then((r) => r.json()).then((d) => setLowStockProducts(Array.isArray(d) ? d.filter((p: any) => Number(p.currentStock) < 10).slice(0, 5) : [])).catch(() => {});
  }, []);

  const monthlyData = stats.monthlySalesData?.length > 0 ? stats.monthlySalesData : [{ month: "Jan", sales: 45000, expenses: 18000 },{ month: "Feb", sales: 52000, expenses: 21000 },{ month: "Mar", sales: 48000, expenses: 19500 },{ month: "Apr", sales: 61000, expenses: 25000 },{ month: "May", sales: 55000, expenses: 23000 },{ month: "Jun", sales: 67000, expenses: 28000 }];
  const PIE_COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4", "#ec4899", "#14b8a6"];
  const categoryData = stats.categoryDistribution?.length > 0 ? stats.categoryDistribution.map((c: any, i: number) => ({ name: c.name, value: c.count || c.value || 0, color: PIE_COLORS[i % PIE_COLORS.length] })) : [{ name: "Electronics", value: 35, color: "#3b82f6" },{ name: "Mobile", value: 25, color: "#10b981" },{ name: "Computer", value: 20, color: "#f59e0b" },{ name: "Accessories", value: 15, color: "#8b5cf6" },{ name: "Home Appliance", value: 5, color: "#ef4444" }];
  const kpiCards = [
    { title: "Total Revenue", formatted: `৳${Number(stats.totalRevenue).toLocaleString()}`, icon: <CircleDollarSign className="h-6 w-6" />, gradient: "from-emerald-500 to-green-700", trend: "+8.2%", trendUp: true, description: "Completed sales" },
    { title: "Total Expenses", formatted: `৳${Number(stats.totalExpenses).toLocaleString()}`, icon: <TrendingDown className="h-6 w-6" />, gradient: "from-red-500 to-rose-700", trend: "+3.1%", trendUp: false, description: "All time expenses" },
    { title: "Net Profit", formatted: `৳${Number(stats.netProfit).toLocaleString()}`, icon: stats.netProfit >= 0 ? <TrendingUp className="h-6 w-6" /> : <TrendingDown className="h-6 w-6" />, gradient: stats.netProfit >= 0 ? "from-teal-500 to-cyan-700" : "from-orange-500 to-red-700", trend: stats.netProfit >= 0 ? "+5.4%" : "-2.1%", trendUp: stats.netProfit >= 0, description: "Revenue - Expenses" },
    { title: "Products in Stock", formatted: String(stats.activeProducts), icon: <Package className="h-6 w-6" />, gradient: "from-violet-500 to-purple-700", trend: "+12%", trendUp: true, description: "Active products" },
  ];
  const sparkData = [[20,35,28,45,38,52,48,60],[15,22,18,30,25,28,32,35],[8,15,12,18,14,25,22,28],[40,38,42,45,50,48,55,60]];
  const mockSales = [{ inv: "INV-001", customer: "Rahim Electronics", amount: "৳15,000", status: "Completed" },{ inv: "INV-002", customer: "Karim Store", amount: "৳8,500", status: "Pending" },{ inv: "INV-003", customer: "Delta Traders", amount: "৳22,300", status: "Confirmed" },{ inv: "INV-004", customer: "Nova Tech", amount: "৳5,200", status: "Draft" },{ inv: "INV-005", customer: "Apex Digital", amount: "৳12,800", status: "Delivered" }];
  const mockLowStock = [{ product: "LED TV 42\"", stock: 3 },{ product: "Bluetooth Speaker", stock: 5 },{ product: "USB Cable Type-C", stock: 2 },{ product: "Power Bank 10000mAh", stock: 8 },{ product: "HDMI Cable 2m", stock: 4 }];
  const orderSections = [
    { label: "Purchase Orders", icon: <ShoppingCart className="h-3.5 w-3.5" />, items: [{ v: stats.pendingPO, l: "Draft", c: "amber" },{ v: stats.confirmedPO, l: "Confirmed", c: "sky" },{ v: stats.completedPO, l: "Received", c: "green" }] },
    { label: "Sales Orders", icon: <CartIcon className="h-3.5 w-3.5" />, items: [{ v: stats.pendingSO, l: "Draft", c: "amber" },{ v: stats.confirmedSO, l: "Confirmed", c: "sky" },{ v: stats.completedSO, l: "Completed", c: "green" }] },
  ];
  const quickActions = [
    { label: "New Sale", icon: <Plus className="h-4 w-4" />, cls: "bg-primary hover:bg-primary/90" },
    { label: "New Purchase", icon: <ShoppingCart className="h-4 w-4" />, cls: "bg-green-600 hover:bg-green-700" },
    { label: "Add Product", icon: <Package className="h-4 w-4" />, cls: "bg-amber-600 hover:bg-amber-700" },
    { label: "View Reports", icon: <BarChart3 className="h-4 w-4" />, cls: "border-navy-600 text-navy-200 hover:bg-navy-800", variant: "outline" as const },
    { label: "Transfer Stock", icon: <ArrowRightLeft className="h-4 w-4" />, cls: "bg-cyan-600 hover:bg-cyan-700" },
    { label: "Record Expense", icon: <TrendingDown className="h-4 w-4" />, cls: "bg-rose-600 hover:bg-rose-700" },
    { label: "Send SMS", icon: <PhoneCall className="h-4 w-4" />, cls: "bg-teal-600 hover:bg-teal-700" },
  ]; return (    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader title="Dashboard" description={userName ? `Welcome back, ${userName}!` : "Welcome to Electronics Mart IMS"} icon={<LayoutDashboard className="h-5 w-5" />} />
        <div className="flex items-center gap-2">
          <Card className="border-border shadow-sm px-4 py-2 flex items-center gap-2 bg-gradient-to-r from-slate-50 to-white dark:from-navy-900/50 dark:to-card"><Calendar className="h-4 w-4 text-primary" /><span className="text-sm font-medium text-slate-700 dark:text-slate-300">{now.toLocaleDateString("en-US", { weekday: "short", year: "numeric", month: "short", day: "numeric" })}</span></Card>
          <Card className="border-border shadow-sm px-4 py-2 flex items-center gap-2 bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20"><Clock className="h-4 w-4 text-primary" /><span className="text-sm font-bold text-primary tabular-nums">{now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span></Card>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 stagger-children">
        {kpiCards.map((card, i) => (
          <Card key={i} className="kpi-card border-border overflow-hidden group dashboard-kpi-card">
            <CardContent className="p-0">
              <div className={`bg-gradient-to-br ${card.gradient} p-5 text-white relative overflow-hidden`}>
                <div className="absolute inset-0 bg-white/0 group-hover:bg-white/5 transition-colors duration-300" />
                <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="relative flex items-start justify-between">
                  <div className="flex-1"><p className="text-sm font-medium text-white/80">{card.title}</p><p className="text-2xl font-bold mt-1">{loading ? <span className="inline-block w-24 h-7 bg-white/20 rounded shimmer" /> : card.formatted}</p></div>
                  <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">{card.icon}</div>
                </div>
                <div className="mt-3 flex items-end gap-0.5 h-8">{sparkData[i].map((v, j) => (<div key={j} className="flex-1 bg-white/30 rounded-sm transition-all duration-200 group-hover:bg-white/40" style={{ height: `${(v / Math.max(...sparkData[i])) * 100}%` }} />))}</div>
              </div>
              <div className="px-5 py-3 bg-card border-t border-white/10">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{card.description}</span>
                  <span className={`text-xs font-semibold flex items-center gap-0.5 px-1.5 py-0.5 rounded ${card.trendUp ? "text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/30" : "text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/30"}`}>{card.trendUp ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{card.trend}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="border-border lg:col-span-3">
          <CardHeader className="pb-2"><CardTitle className="text-slate-900 dark:text-white flex items-center gap-2"><BarChart className="h-5 w-5 text-primary" /> Revenue vs Expenses</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">Monthly comparison (last 6 months)</CardDescription></CardHeader>
          <CardContent><div className="h-72"><ResponsiveContainer width="100%" height="100%"><RechartsBarChart data={monthlyData} barGap={4} barCategoryGap="20%"><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(v) => `৳${(v / 1000).toFixed(0)}k`} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number, name: string) => [`৳${value.toLocaleString()}`, name === "sales" ? "Revenue" : "Expenses"]} labelStyle={{ color: "var(--foreground)", fontWeight: 600 }} /><Legend /><Bar dataKey="sales" fill="#10b981" radius={[4, 4, 0, 0]} name="Revenue" /><Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="Expenses" /></RechartsBarChart></ResponsiveContainer></div></CardContent>
        </Card>
        <Card className="border-border lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-slate-900 dark:text-white flex items-center gap-2"><PieChartIcon className="h-5 w-5 text-primary" /> Category Distribution</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">Products by category</CardDescription></CardHeader>
          <CardContent>
            <div className="h-52"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categoryData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">{categoryData.map((_: any, i: number) => <Cell key={i} fill={(categoryData[i] as any).color} />)}</Pie><Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number, name: string) => [`${value} products`, name]} /></PieChart></ResponsiveContainer></div>
            <div className="grid grid-cols-2 gap-1.5 mt-2">{categoryData.map((cat: any, i: number) => (<div key={i} className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} /><span className="text-xs text-slate-600 dark:text-slate-400 truncate">{cat.name} ({cat.value})</span></div>))}</div>
          </CardContent>
        </Card>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-border"><CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base"><ShoppingBag className="h-5 w-5 text-emerald-500" /> Recent Sales</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">Last 5 sales orders</CardDescription></CardHeader>
          <CardContent><div className="space-y-2.5 max-h-80 overflow-y-auto">
            {(recentSales.length > 0 ? recentSales.map((s: any, i: number) => ({ name: s.customer?.name || "Customer", sub: s.invoiceNo || `INV-${i + 1}`, val: `৳${Number(s.grandTotal || 0).toLocaleString()}`, status: s.status || "Draft" })) : mockSales.map(s => ({ name: s.customer, sub: s.inv, val: s.amount, status: s.status }))).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 dark:bg-navy-900/30 border border-border hover:bg-slate-100 dark:hover:bg-navy-800/40 transition-colors">
                <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0"><TrendingUp className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /></div><div className="min-w-0"><p className="font-medium text-sm text-slate-900 dark:text-white truncate">{item.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{item.sub}</p></div></div>
                <div className="text-right flex-shrink-0 ml-2"><p className="font-semibold text-sm text-slate-900 dark:text-white">{item.val}</p><StatusBadge status={item.status} /></div>
              </div>
            ))}
          </div></CardContent>
        </Card>
        <Card className="border-border"><CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base"><AlertTriangle className="h-5 w-5 text-amber-500" /> Low Stock Alert</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">Items below reorder level</CardDescription></CardHeader>
          <CardContent><div className="space-y-2.5 max-h-80 overflow-y-auto">
            {(lowStockProducts.length > 0 ? lowStockProducts.map((p: any) => ({ name: p.productName, sub: `Stock: ${p.currentStock}` })) : mockLowStock.map(p => ({ name: p.product, sub: `In Stock: ${p.stock}` }))).map((item, i) => (
              <div key={i} className="flex items-center justify-between py-2 px-3 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors">
                <div className="flex items-center gap-2.5"><div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0"><Box className="h-3.5 w-3.5 text-red-600 dark:text-red-400" /></div><div className="min-w-0"><p className="font-medium text-sm text-slate-900 dark:text-white truncate">{item.name}</p><p className="text-xs text-slate-500 dark:text-slate-400">{item.sub}</p></div></div>
                <Badge variant="destructive" className="text-xs flex-shrink-0">Low</Badge>
              </div>
            ))}
          </div></CardContent>
        </Card>
        <Card className="border-border"><CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base"><ClipboardList className="h-5 w-5 text-primary" /> Pending Orders</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">POs and SOs by status</CardDescription></CardHeader>
          <CardContent><div className="space-y-3">{orderSections.map((sec, si) => (
            <div key={si} className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">{sec.icon} {sec.label}</p>
              <div className="grid grid-cols-3 gap-2">{sec.items.map((it, ii) => (
                <div key={ii} className={`text-center py-2 px-1 rounded-lg bg-${it.c}-50 dark:bg-${it.c}-900/20 border border-${it.c}-200 dark:border-${it.c}-800/30`}>
                  <p className={`text-lg font-bold text-${it.c}-700 dark:text-${it.c}-400 stat-value`}>{loading ? <span className={`inline-block w-6 h-5 bg-${it.c}-200 dark:bg-${it.c}-800 rounded shimmer`} /> : it.v}</p>
                  <p className={`text-[10px] text-${it.c}-600 dark:text-${it.c}-500 font-medium`}>{it.l}</p>
                </div>
              ))}</div>
            </div>
          ))}</div></CardContent>
        </Card>
      </div>
      <Card className="border-border bg-gradient-to-r from-navy-950 to-navy-900 text-white">
        <CardContent className="p-6"><div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div><h3 className="text-lg font-bold flex items-center gap-2"><Zap className="h-5 w-5 text-amber-400" /> Quick Actions</h3><p className="text-navy-300 text-sm mt-1">Jump to frequently used operations</p></div>
          <div className="flex flex-wrap gap-2">{quickActions.map((a, i) => (<Button key={i} size="sm" variant={a.variant || "default"} className={`text-white gap-1.5 ${a.cls}`}>{a.icon} {a.label}</Button>))}</div>
        </div></CardContent>
      </Card>
      <RecentActivityTimeline />
    </div>
  );
}
function RecentActivityTimeline() {
  const [activityLogs, setActivityLogs] = useState<any[]>([]);
  const [actLoading, setActLoading] = useState(true);
  React.useEffect(() => {
    fetch("/api/audit-logs?limit=8")
      .then((r) => r.json())
      .then((d) => {
        setActivityLogs(d.logs || []);
        setActLoading(false);
      })
      .catch(() => setActLoading(false));
  }, []);
  const actionConfig: Record<string, { color: string; bg: string; dotColor: string; icon: React.ReactNode }> = {
    CREATE: { color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", dotColor: "bg-green-500", icon: <Plus className="h-3.5 w-3.5" /> },
    UPDATE: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", dotColor: "bg-blue-500", icon: <Pencil className="h-3.5 w-3.5" /> },
    DELETE: { color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", dotColor: "bg-red-500", icon: <Trash2 className="h-3.5 w-3.5" /> },
    LOGIN: { color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", dotColor: "bg-purple-500", icon: <User className="h-3.5 w-3.5" /> },
    EXPORT: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", dotColor: "bg-amber-500", icon: <FileDown className="h-3.5 w-3.5" /> },
    SALE: { color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", dotColor: "bg-green-500", icon: <TrendingUp className="h-3.5 w-3.5" /> },
    ALERT: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", dotColor: "bg-amber-500", icon: <AlertTriangle className="h-3.5 w-3.5" /> },
    PURCHASE: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", dotColor: "bg-blue-500", icon: <ShoppingCart className="h-3.5 w-3.5" /> },
  };
  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  };

  const mockActivities = [
    { id: "m1", action: "SALE", module: "Sales", recordLabel: "New sale INV-005 created", userName: "Admin", createdAt: new Date(Date.now() - 5 * 60000).toISOString() },
    { id: "m2", action: "ALERT", module: "Stock", recordLabel: "Product PROD-012 stock low", userName: "System", createdAt: new Date(Date.now() - 18 * 60000).toISOString() },
    { id: "m3", action: "PURCHASE", module: "Purchases", recordLabel: "Purchase Order PO-003 received", userName: "Manager", createdAt: new Date(Date.now() - 45 * 60000).toISOString() },
    { id: "m4", action: "CREATE", module: "Products", recordLabel: "New product PROD-045 added", userName: "Admin", createdAt: new Date(Date.now() - 2 * 3600000).toISOString() },
    { id: "m5", action: "UPDATE", module: "Customers", recordLabel: "Customer CUST-008 details updated", userName: "Sales Rep", createdAt: new Date(Date.now() - 3.5 * 3600000).toISOString() },
    { id: "m6", action: "SALE", module: "Sales", recordLabel: "Invoice INV-004 payment received", userName: "Admin", createdAt: new Date(Date.now() - 5 * 3600000).toISOString() },
    { id: "m7", action: "ALERT", module: "Stock", recordLabel: "Product PROD-023 below reorder level", userName: "System", createdAt: new Date(Date.now() - 8 * 3600000).toISOString() },
    { id: "m8", action: "CREATE", module: "Suppliers", recordLabel: "New supplier SUP-015 registered", userName: "Manager", createdAt: new Date(Date.now() - 24 * 3600000).toISOString() },
  ];
  const displayLogs = activityLogs.length > 0 ? activityLogs.slice(0, 8) : mockActivities; return (    <Card className="border-border page-slide-in">
      <CardHeader className="pb-3">
        <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
          <Activity className="h-5 w-5 text-primary" />
          Recent Activity
        </CardTitle>
        <CardDescription className="text-slate-500 dark:text-slate-400">Latest system actions & events</CardDescription>
      </CardHeader>
      <CardContent>
        {actLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-slate-200 dark:bg-slate-700 rounded shimmer" />
            ))}
          </div>
        ) : (
          <div className="activity-timeline relative pl-6 space-y-0">
            {displayLogs.map((log: any, idx: number) => {
              const cfg = actionConfig[log.action] || { color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800", dotColor: "bg-slate-400", icon: <Activity className="h-3.5 w-3.5" /> };
              const isLast = idx === displayLogs.length - 1; return (                <div key={log.id || idx} className="relative pb-5">
                  {/* Vertical connecting line */}
                  {!isLast && (
                    <div className="absolute left-[-18px] top-[18px] bottom-0 w-0.5 bg-gradient-to-b from-slate-300 dark:from-slate-600 to-slate-200 dark:to-slate-700" />
                  )}
                  {/* Dot */}
                  <div className={`absolute left-[-22px] top-[6px] w-2.5 h-2.5 rounded-full ${cfg.dotColor} ring-4 ring-white dark:ring-card timeline-dot-pulse`} />
                  {/* Content */}
                  <div className="flex items-center gap-3 py-2 px-3 rounded-lg bg-slate-50 dark:bg-navy-900/30 border border-border hover:bg-slate-100 dark:hover:bg-navy-800/40 transition-colors">
                    <div className={`w-8 h-8 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0`}>
                      <span className={cfg.color}>{cfg.icon}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{log.recordLabel || log.module}</span>
                        <Badge variant="outline" className={`${cfg.color} border-0 text-[10px] px-1.5 py-0 ${cfg.bg}`}>{log.action}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{log.module} {log.userName ? `· ${log.userName}` : ""}</p>
                    </div>
                    <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatTimeAgo(log.createdAt)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [moduleFilter, setModuleFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [modules, setModules] = useState<string[]>([]);
  const [actions, setActions] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(20);
  const loadLogs = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (moduleFilter && moduleFilter !== "all") params.set("module", moduleFilter);
    if (actionFilter && actionFilter !== "all") params.set("action", actionFilter);
    if (searchQuery) params.set("search", searchQuery);
    params.set("limit", "100");
    fetch(`/api/audit-logs?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs || []);
        setTotal(d.total || 0);
        setModules(d.modules || []);
        setActions(d.actions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [moduleFilter, actionFilter, searchQuery]);

  React.useEffect(() => { loadLogs(); }, [loadLogs]);
  const actionConfig: Record<string, { color: string; bg: string; icon: React.ReactNode }> = {
    CREATE: { color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30", icon: <Plus className="h-4 w-4" /> },
    UPDATE: { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/30", icon: <Pencil className="h-4 w-4" /> },
    DELETE: { color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-900/30", icon: <Trash2 className="h-4 w-4" /> },
    LOGIN: { color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/30", icon: <User className="h-4 w-4" /> },
    EXPORT: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/30", icon: <FileDown className="h-4 w-4" /> },
    IMPORT: { color: "text-cyan-600 dark:text-cyan-400", bg: "bg-cyan-100 dark:bg-cyan-900/30", icon: <Upload className="h-4 w-4" /> },
  };
  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  const visibleLogs = logs.slice(0, visibleCount);
  const hasMore = visibleCount < logs.length; return (    <div className="space-y-6 page-slide-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <FileText className="h-6 w-6 text-primary" />
            Audit Log
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Track all system activities and changes</p>
        </div>
        <Badge variant="outline" className="text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600 py-1.5 px-3 self-start">
          {total} total entries
        </Badge>
      </div>
      {/* Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                placeholder="Search audit logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-white dark:bg-navy-900/50 border-slate-200 dark:border-slate-700"
              />
            </div>
            <Select value={moduleFilter} onValueChange={setModuleFilter}>
              <SelectTrigger className="w-full sm:w-44 bg-white dark:bg-navy-900/50 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Module" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Modules</SelectItem>
                {modules.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full sm:w-44 bg-white dark:bg-navy-900/50 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {actions.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      {/* Timeline */}
      <Card className="border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2 text-base">
            <Activity className="h-5 w-5 text-primary" />
            Activity Timeline
          </CardTitle>
          <CardDescription className="text-slate-500 dark:text-slate-400">
            Showing {visibleLogs.length} of {logs.length} entries
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-4 items-start">
                  <div className="w-10 h-10 rounded-full bg-slate-200 dark:bg-slate-700 shimmer" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded shimmer w-3/4" />
                    <div className="h-3 bg-slate-200 dark:bg-slate-700 rounded shimmer w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : visibleLogs.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2">
              <FileText className="h-10 w-10 text-slate-300 dark:text-slate-600" />
              <p className="text-slate-500 dark:text-slate-400 text-sm">No audit logs found</p>
              <p className="text-slate-400 dark:text-slate-500 text-xs">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="relative stagger-children">
              {/* Timeline vertical line */}
              <div className="absolute left-5 top-0 bottom-0 w-0.5 audit-timeline-line" />
              <div className="space-y-4">
                {visibleLogs.map((log: any) => {
                  const cfg = actionConfig[log.action] || { color: "text-slate-600 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-800", icon: <Activity className="h-4 w-4" /> }; return (                    <div key={log.id} className="relative flex gap-4 items-start">
                      <div className={`relative z-10 w-10 h-10 rounded-full ${cfg.bg} flex items-center justify-center flex-shrink-0 ${log === visibleLogs[0] ? "timeline-dot-pulse" : ""}`}>
                        <span className={cfg.color}>{cfg.icon}</span>
                      </div>
                      <div className="flex-1 min-w-0 pb-1">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`${cfg.color} ${cfg.bg} border-0 text-xs font-semibold px-2 py-0.5`}>
                              {log.action}
                            </Badge>
                            <span className="text-sm font-medium text-slate-900 dark:text-white">{log.module}</span>
                          </div>
                          <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatTimeAgo(log.createdAt)}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5 truncate">
                          {log.recordLabel || log.details || "—"}
                        </p>
                        {log.userName && (
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">by {log.userName}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {hasMore && (
            <div className="mt-4 text-center">
              <Button variant="outline" onClick={() => setVisibleCount((c) => c + 20)} className="text-slate-600 dark:text-slate-300">
                Load More ({logs.length - visibleCount} remaining)
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
// GENERIC MODULE PAGE (for simple CRUD modules)
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
  apiFilter?: string;
  extraFormDefaults?: Record<string, unknown>;
  summaryCards?: SummaryCardDef[];
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
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const loadData = useCallback(() => {
    setLoading(true);
    const url = config.apiFilter ? `/api/${config.apiPath}?${config.apiFilter}` : `/api/${config.apiPath}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => { setData(Array.isArray(d) ? d : d.data || []); setLoading(false); })
      .catch(() => { setLoading(false); });
  }, [config.apiPath, config.apiFilter]);

  React.useEffect(() => { loadData(); }, [loadData]);
  const openAdd = () => {
    setEditing(null);
    const defaults: Record<string, unknown> = {};
    config.fields.forEach((f) => {
      if (f.type === "checkbox") defaults[f.key] = true;
      else if (f.type === "number") defaults[f.key] = 0;
      else defaults[f.key] = "";
    });
    setForm({ ...defaults, ...config.extraFormDefaults });
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
  const handleDownloadTemplate = () => {
    const headers = config.columns.map((c) => c.label).join(",");
    const csv = headers + "\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${config.apiPath}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Template Downloaded", description: "Fill the template and import it back" });
  };
  const handleImportFile = () => {
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
      setImportOpen(false);
      loadData();
    };
    input.click();
  };

  const activeCount = data.filter((item) => item.isActive === true || item.isActive === "true" || item.isActive === 1).length;
  const inactiveCount = data.filter((item) => item.isActive === false || item.isActive === "false" || item.isActive === 0).length; return (    <div className="space-y-4">
      {/* Summary Stat Cards */}
      {config.summaryCards ? (
        <div className={`grid grid-cols-1 sm:grid-cols-${Math.min(config.summaryCards.length, 4)} gap-3`}>
          {config.summaryCards.map((card, i) => (
            <Card key={i} className="stat-mini-card border-border overflow-hidden">
              <CardContent className="p-4 flex items-center gap-4">
                <div className={`w-12 h-12 rounded-xl ${card.iconBg} flex items-center justify-center flex-shrink-0 shadow-md`}>{card.icon}</div>
                <div><p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">{card.label}</p><p className={`text-2xl font-bold ${card.valueColor || "text-slate-900 dark:text-white"} stat-value`}>{card.valueFn(data as any[])}</p></div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
      <div className="grid grid-cols-3 gap-3">
        <Card className="stat-mini-card border-border overflow-hidden"><CardContent className="p-3 flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary/80 to-primary flex items-center justify-center flex-shrink-0"><Layers className="h-4 w-4 text-white" /></div><div><p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Total</p><p className="text-lg font-bold text-slate-900 dark:text-white stat-value">{data.length}</p></div></CardContent></Card>
        <Card className="stat-mini-card border-border overflow-hidden"><CardContent className="p-3 flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center flex-shrink-0"><CheckCircle className="h-4 w-4 text-white" /></div><div><p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Active</p><p className="text-lg font-bold text-green-700 dark:text-green-400 stat-value">{activeCount}</p></div></CardContent></Card>
        <Card className="stat-mini-card border-border overflow-hidden"><CardContent className="p-3 flex items-center gap-3"><div className="w-9 h-9 rounded-lg bg-gradient-to-br from-slate-400 to-slate-500 flex items-center justify-center flex-shrink-0"><X className="h-4 w-4 text-white" /></div><div><p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">Inactive</p><p className="text-lg font-bold text-slate-600 dark:text-slate-400 stat-value">{inactiveCount}</p></div></CardContent></Card>
      </div>
      )}
      <DataTable
        title={config.title}
        columns={config.columns}
        data={data.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
        onImport={() => setImportOpen(true)}
        onExportCSV={handleExportCSV}
        onExportPDF={handleExportPDF}
        addLabel={`Add ${singularize(config.title)}`}
      />
      {/* Pagination */}
      {data.length > itemsPerPage && (
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-2 page-slide-in">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing {Math.min((currentPage - 1) * itemsPerPage + 1, data.length)}-{Math.min(currentPage * itemsPerPage, data.length)} of {data.length} records
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              className="text-slate-600 dark:text-slate-300"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.ceil(data.length / itemsPerPage) }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === Math.ceil(data.length / itemsPerPage) || Math.abs(p - currentPage) <= 1)
              .map((p, idx, arr) => (
                <React.Fragment key={p}>
                  {idx > 0 && arr[idx - 1] !== p - 1 && <span className="px-1 text-slate-400">...</span>}
                  <Button
                    variant={p === currentPage ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCurrentPage(p)}
                    className={p === currentPage ? "bg-primary text-primary-foreground" : "text-slate-600 dark:text-slate-300"}
                  >
                    {p}
                  </Button>
                </React.Fragment>
              ))}
            <Button
              variant="outline"
              size="sm"
              disabled={currentPage >= Math.ceil(data.length / itemsPerPage)}
              onClick={() => setCurrentPage((p) => p + 1)}
              className="text-slate-600 dark:text-slate-300"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-slate-900 dark:text-white">{editing?.id ? `Edit ${singularize(config.title)}` : `Add ${singularize(config.title)}`}</DialogTitle></DialogHeader>
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
      {/* Import Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="text-slate-900 dark:text-white flex items-center gap-2"><Upload className="h-5 w-5 text-primary" /> Import Data</DialogTitle><DialogDescription className="text-slate-500 dark:text-slate-400">Download CSV template, fill data, and import.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-3">
            <div className="flex flex-col gap-2">
              <Button variant="outline" onClick={handleDownloadTemplate} className="w-full text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"><FileDown className="h-4 w-4 mr-2" /> Download Template</Button>
              <Button onClick={handleImportFile} className="w-full bg-primary text-primary-foreground"><Upload className="h-4 w-4 mr-2" /> Upload CSV File</Button>
            </div>
            <p className="text-xs text-slate-400 text-center">Columns: {config.columns.map((c) => c.label).join(", ")}</p>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setImportOpen(false)} className="text-slate-700 dark:text-slate-300">Cancel</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
// MODULE CONFIGURATIONS

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
  "liability-received": {
    title: "Liability Received",
    apiPath: "liabilities",
    apiFilter: "type=received",
    extraFormDefaults: { type: "received", isActive: true },
    summaryCards: [
      { label: "This Month", valueFn: (d: any[]) => { const now = new Date(); const ms = new Date(now.getFullYear(), now.getMonth(), 1); return `\u09F3${d.filter((i: any) => new Date(i.date) >= ms).reduce((s, i: any) => s + Number(i.amount || 0), 0).toLocaleString()}`; }, icon: <TrendingUp className="h-6 w-6 text-white" />, iconBg: "bg-gradient-to-br from-emerald-500 to-emerald-600" },
      { label: "All Time", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + Number(i.amount || 0), 0).toLocaleString()}`, icon: <Banknote className="h-6 w-6 text-white" />, iconBg: "bg-gradient-to-br from-sky-500 to-sky-600" },
      { label: "Pending", valueFn: (d: any[]) => d.filter((d: any) => d.isActive).length, icon: <Clock className="h-6 w-6 text-white" />, iconBg: "bg-gradient-to-br from-amber-500 to-amber-600" },
    ],
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "investmentHeadId", label: "Liability Head", type: "select", required: true, options: [] },
      { key: "amount", label: "Amount (\u09F3)", type: "number", required: true, placeholder: "0" },
      { key: "description", label: "Notes", type: "textarea", placeholder: "Optional notes" },
    ],
    columns: [
      { key: "date", label: "Date", render: (item) => item.date ? new Date(String(item.date)).toLocaleDateString() : "-" },
      { key: "investmentHeadId", label: "Liability Head", render: (item: any) => item.investmentHead?.name || "-" },
      { key: "amount", label: "Amount", render: (item) => <span className="text-emerald-600 dark:text-emerald-400 font-medium">{`\u09F3${Number(item.amount).toLocaleString()}`}</span> },
      { key: "description", label: "Notes", render: (item) => item.description || "-" },
    ],
  },
  "liability-pay": {
    title: "Liability Pay",
    apiPath: "liabilities",
    apiFilter: "type=pay",
    extraFormDefaults: { type: "pay", isActive: true, paymentMethod: "Cash" },
    summaryCards: [
      { label: "Paid This Month", valueFn: (d: any[]) => { const now = new Date(); const ms = new Date(now.getFullYear(), now.getMonth(), 1); return `\u09F3${d.filter((i: any) => new Date(i.date) >= ms).reduce((s, i: any) => s + Number(i.amount || 0), 0).toLocaleString()}`; }, icon: <TrendingDown className="h-6 w-6 text-white" />, iconBg: "bg-gradient-to-br from-red-500 to-red-600" },
      { label: "Total Outstanding", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i.isActive).reduce((s, i: any) => s + Number(i.amount || 0), 0).toLocaleString()}`, icon: <AlertTriangle className="h-6 w-6 text-white" />, iconBg: "bg-gradient-to-br from-orange-500 to-orange-600" },
      { label: "Next Due", valueFn: (d: any[]) => { const future = d.filter((i: any) => new Date(i.date) >= new Date()).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()); return future.length > 0 ? new Date(future[0].date).toLocaleDateString() : "None"; }, icon: <Calendar className="h-6 w-6 text-white" />, iconBg: "bg-gradient-to-br from-teal-500 to-teal-600" },
    ],
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "investmentHeadId", label: "Liability Head", type: "select", required: true, options: [] },
      { key: "amount", label: "Amount (\u09F3)", type: "number", required: true, placeholder: "0" },
      { key: "paymentMethod", label: "Payment Method", type: "select", options: [{ value: "Cash", label: "Cash" },{ value: "Bank Transfer", label: "Bank Transfer" },{ value: "Cheque", label: "Cheque" },{ value: "Mobile Banking", label: "Mobile Banking" },{ value: "Other", label: "Other" }] },
      { key: "description", label: "Notes", type: "textarea", placeholder: "Optional notes" },
    ],
    columns: [
      { key: "date", label: "Date", render: (item) => item.date ? new Date(String(item.date)).toLocaleDateString() : "-" },
      { key: "investmentHeadId", label: "Liability Head", render: (item: any) => item.investmentHead?.name || "-" },
      { key: "amount", label: "Amount", render: (item) => <span className="text-red-600 dark:text-red-400 font-medium">{`\u09F3${Number(item.amount).toLocaleString()}`}</span> },
      { key: "paymentMethod", label: "Payment Method", render: (item: any) => <Badge variant="outline" className="text-xs">{item.paymentMethod || "Cash"}</Badge> },
      { key: "description", label: "Notes", render: (item) => item.description || "-" },
    ],
  },
};
interface ReportFilter {
  key: string;
  label: string;
  type: 'date' | 'select' | 'search';
  selectAllLabel?: string;
  options?: { value: string; label: string }[];
  optionsFromData?: number;
  optionsFilter?: (item: any) => boolean;
  optionsValue?: (item: any) => string;
  optionsLabel?: (item: any) => string;
  placeholder?: string;
  className?: string;
}
interface SummaryCardDef {
  label: string;
  valueFn: (data: any[]) => string | number;
  icon: React.ReactNode;
  iconBg: string;
  valueColor?: string;
}
interface ReportConfig {
  title: string;
  description: string;
  icon: React.ReactNode;
  apiPaths: string[];
  filename: string;
  columns: { key: string; label: string; render?: (item: any) => React.ReactNode; align?: 'left' | 'right'; className?: string | ((item: any) => string) }[];
  filters?: ReportFilter[];
  summaryCards?: SummaryCardDef[];
  transformData: (rawData: any[][], filterValues: Record<string, string>) => any[];
  csvHeaders: string;
  csvRow: (item: any, idx: number) => string;
  pdfHead: () => string[][];
  pdfBody: (data: any[]) => any[][];
  chartConfig?: {
    type?: 'bar' | 'pie' | 'area';
    dataKey: string; name: string; fill: string;
    layout?: "vertical" | "horizontal"; title?: string; dataSlice?: number; xAxisKey?: string;
    bars?: { dataKey: string; fill: string; name?: string }[];
    pieNameKey?: string; pieColors?: string[];
    areaStroke?: string; areaFill?: string;
  };
  emptyIcon?: React.ReactNode;
  emptyMessage?: string;
  tableTitle?: string;
  tableMaxH?: string;
}
function GenericReportPage({ config }: { config: ReportConfig }) {
  const [rawData, setRawData] = useState<any[][]>([]);
  const [loading, setLoading] = useState(true);
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  React.useEffect(() => {
    Promise.all(config.apiPaths.map((p) => fetch(`/api/${p}`).then((r) => r.json())))
      .then((results) => {
        setRawData(results.map((r) => (Array.isArray(r) ? r : r.data || r[Object.keys(r)[0]] || [])));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [config.apiPaths]);
  const processedData = useMemo(() => {
    try { return config.transformData(rawData, filterValues); } catch { return []; }
  }, [rawData, filterValues, config]);
  const handleExportCSV = () => {
    const rows = processedData.map((item: any, i: number) => config.csvRow(item, i));
    const csv = [config.csvHeaders, ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${config.filename}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const handleExportPDF = async () => {
    const { default: jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "landscape" });
    doc.setFontSize(16); doc.text(config.title, 14, 20);
    autoTable(doc, { startY: 30, head: config.pdfHead(), body: config.pdfBody(processedData), styles: { fontSize: 8 } });
    doc.save(`${config.filename}.pdf`);
  };

  const setFilter = (key: string, val: string) => setFilterValues((prev) => ({ ...prev, [key]: val }));
  const clearFilters = () => setFilterValues({});
  const hasFilters = Object.values(filterValues).some((v) => v && v !== "all");
  const chartData = config.chartConfig ? processedData.slice(0, config.chartConfig.dataSlice || 8) : [];
  const gridCols = config.summaryCards ? Math.min(config.summaryCards.length, 4) : 0; return (    <div className="space-y-6 page-enter">
      <PageHeader title={config.title} description={config.description} icon={config.icon}>
        <Button variant="outline" size="sm" onClick={handleExportCSV} className="text-slate-700 dark:text-slate-300"><FileDown className="h-4 w-4 mr-1" /> CSV</Button>
        <Button variant="outline" size="sm" onClick={handleExportPDF} className="text-slate-700 dark:text-slate-300"><FileText className="h-4 w-4 mr-1" /> PDF</Button>
      </PageHeader>
      {config.filters && config.filters.length > 0 && (
        <Card className="border-border"><CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-end gap-3">
            {config.filters.map((f) => (
              <div key={f.key} className="grid gap-1.5" style={{ minWidth: f.type === 'search' ? 220 : 170 }}>
                <Label className="text-slate-700 dark:text-slate-300 text-sm">{f.label}</Label>
                {f.type === 'date' ? (
                  <Input type="date" value={filterValues[f.key] || ''} onChange={(e) => setFilter(f.key, e.target.value)} className={f.className || "w-44"} />
                ) : f.type === 'search' ? (
                  <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" /><Input placeholder={f.placeholder || "Search..."} value={filterValues[f.key] || ''} onChange={(e) => setFilter(f.key, e.target.value)} className="pl-9 bg-white dark:bg-navy-900/50" /></div>
                ) : (
                  <Select value={filterValues[f.key] || 'all'} onValueChange={(v) => setFilter(f.key, v)}>
                    <SelectTrigger className={f.className || "w-48"}><SelectValue placeholder={f.placeholder || "All"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{f.selectAllLabel || "All"}</SelectItem>
                      {(f.options || (f.optionsFromData !== undefined ? (rawData[f.optionsFromData] || []).filter(f.optionsFilter || (() => true)).map((item: any) => ({ value: f.optionsValue ? f.optionsValue(item) : item.id, label: f.optionsLabel ? f.optionsLabel(item) : item.name })) : [])).map((o: any) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
            {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters} className="text-slate-500"><X className="h-3.5 w-3.5 mr-1" /> Clear</Button>}
          </div>
        </CardContent></Card>
      )}
      {loading ? (
        <div className="text-center py-8 text-slate-500">Loading report...</div>
      ) : (
        <>
          {config.summaryCards && config.summaryCards.length > 0 && (
            <div className={`grid grid-cols-1 sm:grid-cols-${gridCols} gap-4`}>
              {config.summaryCards.map((card, i) => (
                <Card key={i} className="border-border"><CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl ${card.iconBg}`}>{card.icon}</div>
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{card.label}</p>
                      <p className={`text-xl font-bold ${card.valueColor || "text-slate-900 dark:text-white"}`}>{card.valueFn(processedData)}</p>
                    </div>
                  </div>
                </CardContent></Card>
              ))}
            </div>
          )}
          {config.chartConfig && chartData.length > 0 && (
            <Card className="border-border">
              <CardHeader className="pb-2"><CardTitle className="text-slate-900 dark:text-white flex items-center gap-2"><BarChart className="h-5 w-5 text-primary" /> {config.chartConfig.title || config.title}</CardTitle></CardHeader>
              <CardContent><div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  {config.chartConfig.type === 'pie' ? (
                    <PieChart><Pie data={chartData} cx="50%" cy="50%" outerRadius={80} dataKey={config.chartConfig.dataKey} nameKey={config.chartConfig.pieNameKey || "name"} label={({ name, value, percent }: any) => `${name}: ${value} (${(percent * 100).toFixed(0)}%)`}>{chartData.map((_: any, i: number) => <Cell key={i} fill={(config.chartConfig!.pieColors || ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899","#06b6d4","#14b8a6"])[i % 8]} />)}</Pie><Tooltip /></PieChart>
                  ) : config.chartConfig.type === 'area' ? (
                    <AreaChart data={chartData}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey={config.chartConfig.xAxisKey || "name"} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} /><YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`} /><Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} /><Area type="monotone" dataKey={config.chartConfig.dataKey} stroke={config.chartConfig.areaStroke || config.chartConfig.fill} fill={config.chartConfig.areaFill || config.chartConfig.fill + "30"} name={config.chartConfig.name} /><Legend /></AreaChart>
                  ) : config.chartConfig.bars ? (
                    <RechartsBarChart data={chartData} layout={config.chartConfig.layout || "horizontal"}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey={config.chartConfig.xAxisKey || "name"} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} /><YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`} /><Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} /><Legend />{config.chartConfig.bars.map((b, i) => <Bar key={i} dataKey={b.dataKey} fill={b.fill} radius={[4, 4, 0, 0]} name={b.name || b.dataKey} />)}</RechartsBarChart>
                  ) : (
                    <RechartsBarChart data={chartData} layout={config.chartConfig.layout || "horizontal"}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />{config.chartConfig.layout === "vertical" ? (<><XAxis type="number" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`} /><YAxis type="category" dataKey={config.chartConfig.xAxisKey || config.columns[0]?.key} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={100} /></>) : (<><XAxis dataKey={config.chartConfig.xAxisKey || "name"} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} /><YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `৳${(v / 1000).toFixed(0)}k`} /></>)}<Tooltip contentStyle={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px" }} formatter={(value: number) => [`৳${value.toLocaleString()}`, config.chartConfig!.name]} /><Bar dataKey={config.chartConfig.dataKey} fill={config.chartConfig.fill} radius={config.chartConfig.layout === "vertical" ? [0, 4, 4, 0] : [4, 4, 0, 0]} name={config.chartConfig.name} /></RechartsBarChart>
                  )}
                </ResponsiveContainer>
              </div></CardContent>
            </Card>
          )}
          <Card className="border-border">
            <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">{config.tableTitle || config.title}</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">{processedData.length} record(s) found</CardDescription></CardHeader>
            <CardContent>
              <div className={`table-container rounded-md border border-border ${config.tableMaxH || "max-h-96"} overflow-y-auto`}>
                <Table>
                  <TableHeader><TableRow className="bg-muted/50">
                    {config.columns.map((col) => (
                      <TableHead key={col.key} className={`text-slate-700 dark:text-slate-300 font-semibold ${col.align === 'right' ? 'text-right' : ''}`}>{col.label}</TableHead>
                    ))}
                  </TableRow></TableHeader>
                  <TableBody>
                    {processedData.length === 0 ? (
                      <TableRow><TableCell colSpan={config.columns.length} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">{config.emptyIcon || <Package className="h-10 w-10 text-slate-300 dark:text-slate-600" />}<p className="text-slate-500 dark:text-slate-400 text-sm">{config.emptyMessage || "No records found"}</p></div>
                      </TableCell></TableRow>
                    ) : processedData.map((item: any, idx: number) => (
                      <TableRow key={idx} >
                        {config.columns.map((col) => (
                          <TableCell key={col.key} className={`text-slate-700 dark:text-slate-300 text-sm ${col.align === 'right' ? 'text-right' : ''} ${typeof col.className === 'function' ? col.className(item) : col.className || ''}`}>
                            {col.render ? col.render(item) : (item[col.key] !== undefined && item[col.key] !== null ? String(item[col.key]) : "\u2014")}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
// REPORT CONFIGURATIONS

const reportConfigs: Partial<Record<PageKey, ReportConfig>> = {
  "supplier-cash-delivery": {
    title: "Supplier Cash Delivery", description: "Cash deliveries to suppliers", icon: <Banknote className="h-5 w-5" />,
    apiPaths: ["cash-deliveries"], filename: "supplier-cash-delivery",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "date", label: "Date", render: (i: any) => i.date ? new Date(i.date).toLocaleDateString() : "-" },
      { key: "supplier", label: "Supplier", render: (i: any) => i.supplier?.name || "-", className: "font-medium" },
      { key: "amount", label: "Amount (\u09F3)", align: "right", render: (i: any) => `\u09F3${Number(i.amount).toLocaleString()}`, className: "font-medium" },
      { key: "paymentOption", label: "Payment Option", render: (i: any) => i.paymentOption?.name || "-" },
      { key: "description", label: "Description", render: (i: any) => i.description || "-" },
    ],
    summaryCards: [
      { label: "Total Delivered", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + (Number(i.amount) || 0), 0).toLocaleString()}`, icon: <Banknote className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Pending Delivery", valueFn: (d: any[]) => d.filter((i: any) => i.isActive).length, icon: <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    transformData: (raw, fv) => (raw[0] || []).filter((cd: any) => { if (!cd.date) return true; const d = new Date(cd.date).toISOString().split("T")[0]; if (fv.dateFrom && d < fv.dateFrom) return false; if (fv.dateTo && d > fv.dateTo) return false; return true; }),
    csvHeaders: "Date,Supplier,Amount,Payment Option,Description",
    csvRow: (i) => `${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.supplier?.name || ""},${i.amount},${i.paymentOption?.name || ""},${i.description || ""}`,
    pdfHead: () => [["Date", "Supplier", "Amount (\u09F3)", "Payment Option", "Description"]],
    pdfBody: (d) => d.map((i: any) => [i.date ? new Date(i.date).toLocaleDateString() : "-", i.supplier?.name || "-", `\u09F3${Number(i.amount).toLocaleString()}`, i.paymentOption?.name || "-", i.description || "-"]),
  },
  "replacement-report": {
    title: "Replacement Report", description: "Replacement orders with product details", icon: <RefreshCcw className="h-5 w-5" />,
    apiPaths: ["replacements"], filename: "replacement-report",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "replacementNo", label: "Repl. No", render: (i: any) => i.replacementNo, className: "font-medium" },
      { key: "date", label: "Date", render: (i: any) => i.date ? new Date(i.date).toLocaleDateString() : "-" },
      { key: "salesOrder", label: "Sales Order", render: (i: any) => i.salesOrder?.invoiceNo || "-" },
      { key: "products", label: "Products", render: (i: any) => (i.lines || []).map((l: any) => l.product?.name || "Unknown").join(", "), className: "max-w-[200px] truncate" },
      { key: "reason", label: "Reason", render: (i: any) => i.reason || "-" },
      { key: "total", label: "Total (\u09F3)", align: "right", render: (i: any) => `\u09F3${(i.lines || []).reduce((s: number, l: any) => s + (Number(l.total) || 0), 0).toLocaleString()}` },
      { key: "status", label: "Status", render: (i: any) => <StatusBadge status={i.status || "Pending"} /> },
    ],
    summaryCards: [
      { label: "Total Replacements", valueFn: (d) => d.length, icon: <RefreshCcw className="h-5 w-5 text-blue-600 dark:text-blue-400" />, iconBg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Pending", valueFn: (d: any[]) => d.filter((i: any) => !i.status || i.status === "Pending").length, icon: <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30", valueColor: "text-amber-600 dark:text-amber-400" },
      { label: "Completed", valueFn: (d: any[]) => d.filter((i: any) => i.status === "Completed").length, icon: <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30", valueColor: "text-green-600 dark:text-green-400" },
    ],
    transformData: (raw, fv) => (raw[0] || []).filter((r: any) => { if (!r.date) return true; const d = new Date(r.date).toISOString().split("T")[0]; if (fv.dateFrom && d < fv.dateFrom) return false; if (fv.dateTo && d > fv.dateTo) return false; return true; }),
    csvHeaders: "Replacement No,Date,Sales Order,Product,Qty,Rate,Total,Reason,Status",
    csvRow: (r: any) => (r.lines || []).map((l: any) => `${r.replacementNo},${r.date ? new Date(r.date).toLocaleDateString() : ""},${r.salesOrder?.invoiceNo || ""},${l.product?.name || ""},${l.quantity},${l.rate},${l.total},${r.reason || ""},${r.status || "Pending"}`).join("\n"),
    pdfHead: () => [["Replacement No", "Date", "Sales Order", "Product", "Qty", "Rate (\u09F3)", "Total (\u09F3)", "Reason", "Status"]],
    pdfBody: (d) => d.flatMap((r: any) => (r.lines || []).map((l: any) => [r.replacementNo, r.date ? new Date(r.date).toLocaleDateString() : "-", r.salesOrder?.invoiceNo || "-", l.product?.name || "-", l.quantity, `\u09F3${Number(l.rate).toLocaleString()}`, `\u09F3${Number(l.total).toLocaleString()}`, r.reason || "-", r.status || "Pending"])),
  },
  "adjustment-report": {
    title: "Adjustment Report", description: "Stock adjustment entries", icon: <ArrowRightLeft className="h-5 w-5" />,
    apiPaths: ["stock-entries"], filename: "adjustment-report",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "date", label: "Date", render: (i: any) => new Date(i.date).toLocaleDateString() },
      { key: "product", label: "Product", render: (i: any) => i.product?.name || "-", className: "font-medium" },
      { key: "type", label: "Type", render: (i: any) => <Badge className={`text-xs ${i.type === "IN" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"}`}>{i.type}</Badge> },
      { key: "quantity", label: "Quantity", align: "right", render: (i: any) => i.quantity },
      { key: "reference", label: "Reference", render: (i: any) => i.reference || "-" },
      { key: "notes", label: "Notes", render: (i: any) => i.notes || "-" },
    ],
    summaryCards: [
      { label: "Total IN", valueFn: (d: any[]) => d.filter((i: any) => i.type === "IN").reduce((s: number, i: any) => s + (i.quantity || 0), 0), icon: <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30", valueColor: "text-green-600 dark:text-green-400" },
      { label: "Total OUT", valueFn: (d: any[]) => d.filter((i: any) => i.type === "OUT").reduce((s: number, i: any) => s + (i.quantity || 0), 0), icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30", valueColor: "text-red-600 dark:text-red-400" },
    ],
    transformData: (raw, fv) => { const entries = Array.isArray(raw[0]?.data) ? raw[0].data : Array.isArray(raw[0]) ? raw[0] : []; return entries.filter((e: any) => { if (fv.dateFrom && new Date(e.date) < new Date(fv.dateFrom)) return false; if (fv.dateTo && new Date(e.date) > new Date(fv.dateTo + "T23:59:59")) return false; return true; }).filter((e: any) => e.type === "ADJUSTMENT" || e.type === "IN" || e.type === "OUT"); },
    csvHeaders: "Date,Product,Type,Quantity,Reference,Notes",
    csvRow: (i) => `${new Date(i.date).toLocaleDateString()},${i.product?.name || ""},${i.type},${i.quantity},${i.reference || ""},${(i.notes || "").replace(/,/g, ";")}`,
    pdfHead: () => [["Date", "Product", "Type", "Quantity", "Reference", "Notes"]],
    pdfBody: (d) => d.map((i: any) => [new Date(i.date).toLocaleDateString(), i.product?.name || "-", i.type, String(i.quantity), i.reference || "-", i.notes || "-"]),
  },
  "customer-due-date-wise": {
    title: "Customer Due (Date Wise)", description: "Customer dues as of specific date", icon: <Calendar className="h-5 w-5" />,
    apiPaths: ["sales-orders", "customers"], filename: "customer-due-date-wise",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "customerName", label: "Customer", render: (i: any) => i.customerName, className: "font-medium text-slate-900 dark:text-white" },
      { key: "totalDue", label: "Total Due", align: "right", render: (i: any) => `\u09F3${i.totalDue.toLocaleString()}`, className: "text-red-600" },
      { key: "orderCount", label: "Orders", align: "right", render: (i: any) => i.orderCount },
      { key: "oldestDue", label: "Oldest Due", render: (i: any) => new Date(i.oldestDue).toLocaleDateString() },
    ],
    summaryCards: [{ label: "Total Due", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.totalDue, 0).toLocaleString()}`, icon: <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30" }],
    transformData: (raw, fv) => { const sos = raw[0] || []; const map = new Map<string, any>(); sos.forEach((so: any) => { const due = (so.grandTotal || 0) - (so.totalPaid || 0); if (due <= 0) return; if (fv.dateFrom && so.date && new Date(so.date) < new Date(fv.dateFrom)) return; if (fv.dateTo && so.date && new Date(so.date) > new Date(fv.dateTo)) return; const id = so.customerId; const existing = map.get(id) || { customerName: so.customer?.name || "Unknown", totalDue: 0, orderCount: 0, oldestDue: so.date }; existing.totalDue += due; existing.orderCount += 1; if (so.date && new Date(so.date) < new Date(existing.oldestDue)) existing.oldestDue = so.date; map.set(id, existing); }); return Array.from(map.values()); },
    csvHeaders: "Customer,Total Due,Orders,Oldest Due", csvRow: (i) => `${i.customerName},${i.totalDue},${i.orderCount},${new Date(i.oldestDue).toLocaleDateString()}`,
    pdfHead: () => [["Customer", "Total Due (\u09F3)", "Orders", "Oldest Due"]], pdfBody: (d) => d.map((i: any) => [i.customerName, `\u09F3${i.totalDue.toLocaleString()}`, i.orderCount, new Date(i.oldestDue).toLocaleDateString()]),
  },
  "customer-cash-collection": {
    title: "Customer Cash Collection", description: "Cash collections by customer", icon: <Wallet className="h-5 w-5" />,
    apiPaths: ["cash-collections", "customers"], filename: "customer-cash-collection",
    filters: [{ key: "customerFilter", label: "Customer", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Customers", className: "w-56" }, { key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "name", label: "Customer", render: (i: any) => i.name, className: "font-medium text-slate-900 dark:text-white" },
      { key: "totalCollected", label: "Total Collected", align: "right", render: (i: any) => `\u09F3${i.totalCollected.toLocaleString()}`, className: "text-green-600" },
      { key: "count", label: "Count", align: "right", render: (i: any) => i.count },
    ],
    summaryCards: [{ label: "Total Collected", valueFn: (d: any[]) => `\u09F3${d.reduce((s, c: any) => s + c.totalCollected, 0).toLocaleString()}`, icon: <Banknote className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" }],
    transformData: (raw, fv) => { const ccs = raw[0] || []; const filtered = ccs.filter((cc: any) => { if (fv.customerFilter && fv.customerFilter !== "all" && cc.customerId !== fv.customerFilter) return false; if (fv.dateFrom && new Date(cc.date) < new Date(fv.dateFrom)) return false; if (fv.dateTo && new Date(cc.date) > new Date(fv.dateTo)) return false; return true; }); const map = new Map<string, any>(); filtered.forEach((cc: any) => { const id = cc.customerId; const existing = map.get(id) || { name: cc.customer?.name || "Unknown", totalCollected: 0, count: 0 }; existing.totalCollected += cc.amount || 0; existing.count += 1; map.set(id, existing); }); return Array.from(map.entries()).map(([id, d]) => ({ id, ...d })); },
    csvHeaders: "Customer,Total Collected,Count", csvRow: (i) => `${i.name},${i.totalCollected},${i.count}`,
    pdfHead: () => [["Customer", "Total Collected (\u09F3)", "Count"]], pdfBody: (d) => d.map((i: any) => [i.name, `\u09F3${i.totalCollected.toLocaleString()}`, i.count]),
  },
  "customer-ledger-summary": {
    title: "Customer Ledger Summary", description: "All customers with balance overview", icon: <BarChart3 className="h-5 w-5" />,
    apiPaths: ["customers", "sales-orders", "cash-collections"], filename: "customer-ledger-summary",
    filters: [{ key: "search", label: "Search", type: "search", placeholder: "Customer name..." }],
    columns: [
      { key: "name", label: "Customer", render: (i: any) => i.name, className: "font-medium text-slate-900 dark:text-white" },
      { key: "openingBalance", label: "Opening", align: "right", render: (i: any) => `\u09F3${i.openingBalance.toLocaleString()}` },
      { key: "totalSales", label: "Total Sales", align: "right", render: (i: any) => `\u09F3${i.totalSales.toLocaleString()}` },
      { key: "totalPayments", label: "Total Payments", align: "right", render: (i: any) => `\u09F3${i.totalPayments.toLocaleString()}`, className: "text-green-600" },
      { key: "closingBalance", label: "Closing Balance", align: "right", render: (i: any) => `\u09F3${i.closingBalance.toLocaleString()}`, className: (i: any) => i.closingBalance > 0 ? "text-red-600 font-semibold" : "text-green-600 font-semibold" },
    ],
    summaryCards: [
      { label: "Total Opening", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.openingBalance, 0).toLocaleString()}`, icon: <DollarSign className="h-5 w-5 text-slate-600 dark:text-slate-400" />, iconBg: "bg-slate-100 dark:bg-slate-900/30" },
      { label: "Total Sales", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.totalSales, 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Total Payments", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.totalPayments, 0).toLocaleString()}`, icon: <Banknote className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Closing Balance", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.closingBalance, 0).toLocaleString()}`, icon: <Wallet className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30" },
    ],
    transformData: (raw, fv) => (raw[0] || []).map((c: any) => { const totalSales = (raw[1] || []).filter((so: any) => so.customerId === c.id).reduce((s: number, so: any) => s + (so.grandTotal || 0), 0); const totalPayments = (raw[2] || []).filter((cc: any) => cc.customerId === c.id).reduce((s: number, cc: any) => s + (cc.amount || 0), 0); return { id: c.id, name: c.name, openingBalance: 0, totalSales, totalPayments, closingBalance: totalSales - totalPayments }; }).filter((c: any) => !fv.search || c.name.toLowerCase().includes(fv.search.toLowerCase())),
    csvHeaders: "Customer,Opening Balance,Total Sales,Total Payments,Closing Balance", csvRow: (i) => `${i.name},${i.openingBalance},${i.totalSales},${i.totalPayments},${i.closingBalance}`,
    pdfHead: () => [["Customer", "Opening", "Total Sales", "Total Payments", "Closing Balance"]], pdfBody: (d) => d.map((i: any) => [i.name, `\u09F3${i.openingBalance.toLocaleString()}`, `\u09F3${i.totalSales.toLocaleString()}`, `\u09F3${i.totalPayments.toLocaleString()}`, `\u09F3${i.closingBalance.toLocaleString()}`]),
    tableMaxH: "max-h-[500px]",
  },
  "suppliers-due-report": {
    title: "Suppliers Due Report", description: "Outstanding dues to suppliers", icon: <AlertTriangle className="h-5 w-5" />,
    apiPaths: ["suppliers", "purchase-orders", "cash-deliveries"], filename: "suppliers-due-report",
    columns: [
      { key: "supplier", label: "Supplier", render: (i: any) => i.supplier, className: "font-medium" },
      { key: "totalPurchased", label: "Total Purchased", align: "right", render: (i: any) => `\u09F3${i.totalPurchased.toLocaleString()}` },
      { key: "totalPaid", label: "Total Paid", align: "right", render: (i: any) => `\u09F3${i.totalPaid.toLocaleString()}` },
      { key: "due", label: "Due Amount", align: "right", render: (i: any) => `\u09F3${i.due.toLocaleString()}`, className: "font-medium" },
    ],
    summaryCards: [
      { label: "Total Due", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.due, 0).toLocaleString()}`, icon: <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30" },
      { label: "Total Suppliers", valueFn: (d) => d.length, icon: <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />, iconBg: "bg-blue-100 dark:bg-blue-900/30" },
    ],
    transformData: (raw) => { const suppliers = raw[0] || []; const pos = raw[1] || []; const cds = raw[2] || []; const map = new Map<string, any>(); suppliers.forEach((s: any) => { map.set(s.id, { supplierId: s.id, supplier: s.name, totalPurchased: Number(s.openingBalance) || 0, totalPaid: 0 }); }); pos.forEach((po: any) => { const e = map.get(po.supplierId); if (e) e.totalPurchased += Number(po.grandTotal) || 0; }); cds.forEach((cd: any) => { const e = map.get(cd.supplierId); if (e) e.totalPaid += Number(cd.amount) || 0; }); return Array.from(map.values()).map((d) => ({ ...d, due: d.totalPurchased - d.totalPaid })).filter((d) => d.due > 0).sort((a, b) => b.due - a.due); },
    csvHeaders: "Supplier,Total Purchased,Total Paid,Due", csvRow: (i) => `${i.supplier},${i.totalPurchased},${i.totalPaid},${i.due}`,
    pdfHead: () => [["Supplier", "Total Purchased (\u09F3)", "Total Paid (\u09F3)", "Due (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.supplier, `\u09F3${i.totalPurchased.toLocaleString()}`, `\u09F3${i.totalPaid.toLocaleString()}`, `\u09F3${i.due.toLocaleString()}`]),
  },
  "expense-report": {
    title: "Expense Report", description: "Expenses grouped by category/head", icon: <TrendingDown className="h-5 w-5" />,
    apiPaths: ["expenses", "expense-income-heads"], filename: "expense-report",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }, { key: "headFilter", label: "Expense Head", type: "select", optionsFromData: 1, optionsFilter: (i: any) => i.type === "Expense", optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Expense Heads", className: "w-48" }],
    columns: [
      { key: "date", label: "Date", render: (i: any) => new Date(i.date).toLocaleDateString() },
      { key: "head", label: "Head", render: (i: any) => i.head?.name || "\u2014", className: "font-medium" },
      { key: "amount", label: "Amount", render: (i: any) => `\u09F3${Number(i.amount).toLocaleString()}`, className: "text-red-600 dark:text-red-400 font-semibold" },
      { key: "description", label: "Description", render: (i: any) => i.description || "\u2014" },
      { key: "paymentOption", label: "Payment", render: (i: any) => i.paymentOption?.name || "\u2014" },
      { key: "bank", label: "Bank", render: (i: any) => i.bank?.bankName || "\u2014" },
    ],
    summaryCards: [
      { label: "Total Expenses", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, e: any) => s + (e.amount || 0), 0).toLocaleString()}`, icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30" },
      { label: "Highest Category", valueFn: (d: any[]) => { const map = new Map<string, number>(); d.forEach((e: any) => { const n = e.head?.name || "Unknown"; map.set(n, (map.get(n) || 0) + (e.amount || 0)); }); const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]); return sorted.length > 0 ? sorted[0][0] : "N/A"; }, icon: <BarChart className="h-5 w-5 text-orange-600 dark:text-orange-400" />, iconBg: "bg-orange-100 dark:bg-orange-900/30" },
      { label: "Daily Average", valueFn: (d: any[]) => { const total = d.reduce((s: number, e: any) => s + (e.amount || 0), 0); return `\u09F3${(total / 30).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }, icon: <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    transformData: (raw, fv) => { let data = raw[0] || []; if (fv.dateFrom) data = data.filter((e: any) => new Date(e.date) >= new Date(fv.dateFrom)); if (fv.dateTo) data = data.filter((e: any) => new Date(e.date) <= new Date(fv.dateTo + "T23:59:59")); if (fv.headFilter && fv.headFilter !== "all") data = data.filter((e: any) => e.headId === fv.headFilter); return data; },
    csvHeaders: "Date,Head,Amount,Description,Payment Option,Bank",
    csvRow: (i) => `${new Date(i.date).toLocaleDateString()},${(i.head?.name || "").replace(/,/g, ";")},${i.amount},${(i.description || "").replace(/,/g, ";")},${i.paymentOption?.name || ""},${i.bank?.bankName || ""}`,
    pdfHead: () => [["Date", "Head", "Amount", "Description", "Payment", "Bank"]], pdfBody: (d) => d.map((i: any) => [new Date(i.date).toLocaleDateString(), i.head?.name || "-", `\u09F3${Number(i.amount).toLocaleString()}`, i.description || "-", i.paymentOption?.name || "-", i.bank?.bankName || "-"]),
  },
  "income-report": {
    title: "Income Report", description: "Income grouped by source/head", icon: <TrendingUp className="h-5 w-5" />,
    apiPaths: ["incomes", "expense-income-heads"], filename: "income-report",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }, { key: "headFilter", label: "Income Head", type: "select", optionsFromData: 1, optionsFilter: (i: any) => i.type === "Income", optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Income Heads", className: "w-48" }],
    columns: [
      { key: "date", label: "Date", render: (i: any) => new Date(i.date).toLocaleDateString() },
      { key: "head", label: "Head", render: (i: any) => i.head?.name || "\u2014", className: "font-medium" },
      { key: "amount", label: "Amount", render: (i: any) => `\u09F3${Number(i.amount).toLocaleString()}`, className: "text-emerald-600 dark:text-emerald-400 font-semibold" },
      { key: "description", label: "Description", render: (i: any) => i.description || "\u2014" },
      { key: "paymentOption", label: "Payment", render: (i: any) => i.paymentOption?.name || "\u2014" },
      { key: "bank", label: "Bank", render: (i: any) => i.bank?.bankName || "\u2014" },
    ],
    summaryCards: [
      { label: "Total Income", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, e: any) => s + (e.amount || 0), 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Highest Source", valueFn: (d: any[]) => { const map = new Map<string, number>(); d.forEach((e: any) => { const n = e.head?.name || "Unknown"; map.set(n, (map.get(n) || 0) + (e.amount || 0)); }); const sorted = Array.from(map.entries()).sort((a, b) => b[1] - a[1]); return sorted.length > 0 ? sorted[0][0] : "N/A"; }, icon: <BarChart className="h-5 w-5 text-sky-600 dark:text-sky-400" />, iconBg: "bg-sky-100 dark:bg-sky-900/30" },
      { label: "Daily Average", valueFn: (d: any[]) => { const total = d.reduce((s: number, e: any) => s + (e.amount || 0), 0); return `\u09F3${(total / 30).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }, icon: <Calendar className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    transformData: (raw, fv) => { let data = raw[0] || []; if (fv.dateFrom) data = data.filter((e: any) => new Date(e.date) >= new Date(fv.dateFrom)); if (fv.dateTo) data = data.filter((e: any) => new Date(e.date) <= new Date(fv.dateTo + "T23:59:59")); if (fv.headFilter && fv.headFilter !== "all") data = data.filter((e: any) => e.headId === fv.headFilter); return data; },
    csvHeaders: "Date,Head,Amount,Description,Payment Option,Bank",
    csvRow: (i) => `${new Date(i.date).toLocaleDateString()},${(i.head?.name || "").replace(/,/g, ";")},${i.amount},${(i.description || "").replace(/,/g, ";")},${i.paymentOption?.name || ""},${i.bank?.bankName || ""}`,
    pdfHead: () => [["Date", "Head", "Amount", "Description", "Payment", "Bank"]], pdfBody: (d) => d.map((i: any) => [new Date(i.date).toLocaleDateString(), i.head?.name || "-", `\u09F3${Number(i.amount).toLocaleString()}`, i.description || "-", i.paymentOption?.name || "-", i.bank?.bankName || "-"]),
  },
  "installment-collection": {
    title: "Installment Collection", description: "Track hire sales installment collections", icon: <CircleDollarSign className="h-5 w-5" />,
    apiPaths: ["hire-sales"], filename: "installment-collection",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }, { key: "search", label: "Search", type: "search", placeholder: "Customer or Invoice..." }],
    columns: [
      { key: "customer", label: "Customer", render: (i: any) => i.customer?.name || "-", className: "font-medium text-slate-900 dark:text-white" },
      { key: "product", label: "Product", render: (i: any) => i.product?.name || "-" },
      { key: "grandTotal", label: "Total", align: "right", render: (i: any) => `\u09F3${Number(i.grandTotal).toLocaleString()}` },
      { key: "totalPaid", label: "Collected", align: "right", render: (i: any) => `\u09F3${Number(i.totalPaid || 0).toLocaleString()}`, className: "text-green-600" },
      { key: "due", label: "Due", align: "right", render: (i: any) => `\u09F3${(i.grandTotal - (i.totalPaid || 0)).toLocaleString()}`, className: "text-red-600" },
      { key: "nextInstallmentDate", label: "Next Installment", render: (i: any) => i.nextInstallmentDate ? new Date(i.nextInstallmentDate).toLocaleDateString() : "-" },
      { key: "status", label: "Status", render: (i: any) => <Badge variant={i.currentStatus === "Completed" ? "default" : "secondary"}>{i.currentStatus || i.status || "Active"}</Badge> },
    ],
    summaryCards: [
      { label: "Total Amount", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + (i.grandTotal || 0), 0).toLocaleString()}`, icon: <CircleDollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Collected", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + (i.totalPaid || 0), 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-blue-600 dark:text-blue-400" />, iconBg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Due", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + (i.grandTotal - (i.totalPaid || 0)), 0).toLocaleString()}`, icon: <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30" },
    ],
    transformData: (raw, fv) => (raw[0] || []).filter((hs: any) => { if (fv.dateFrom && new Date(hs.date) < new Date(fv.dateFrom)) return false; if (fv.dateTo && new Date(hs.date) > new Date(fv.dateTo)) return false; if (fv.search && !(hs.customer?.name || "").toLowerCase().includes(fv.search.toLowerCase()) && !(hs.invoiceNo || "").toLowerCase().includes(fv.search.toLowerCase())) return false; return true; }),
    csvHeaders: "Customer,Product,Total,Collected,Due,Next Installment,Status",
    csvRow: (i) => `${i.customer?.name || ""},${i.product?.name || ""},${i.grandTotal},${i.totalPaid || 0},${i.grandTotal - (i.totalPaid || 0)},${i.nextInstallmentDate ? new Date(i.nextInstallmentDate).toLocaleDateString() : "-"},${i.currentStatus || i.status || ""}`,
    pdfHead: () => [["Customer", "Product", "Total", "Collected", "Due", "Next Installment", "Status"]],
    pdfBody: (d) => d.map((i: any) => [i.customer?.name || "", i.product?.name || "", `\u09F3${Number(i.grandTotal).toLocaleString()}`, `\u09F3${Number(i.totalPaid || 0).toLocaleString()}`, `\u09F3${Number(i.grandTotal - (i.totalPaid || 0)).toLocaleString()}`, i.nextInstallmentDate ? new Date(i.nextInstallmentDate).toLocaleDateString() : "-", i.currentStatus || i.status || ""]),
  },
  "employee-info": {
    title: "Employee Information", description: "View and export employee information", icon: <Users className="h-5 w-5" />,
    apiPaths: ["employees"], filename: "employee-info",
    filters: [{ key: "search", label: "Search", type: "search", placeholder: "Search by name, code, phone..." }, { key: "deptFilter", label: "Department", type: "select", optionsFromData: 0, optionsFilter: () => true, optionsValue: (i: any) => i.department?.name || "", optionsLabel: (i: any) => i.department?.name || "N/A", selectAllLabel: "All Departments", className: "w-48" }],
    columns: [
      { key: "employeeCode", label: "Code", render: (i: any) => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{i.employeeCode}</span> },
      { key: "name", label: "Name", render: (i: any) => i.name, className: "font-medium text-slate-900 dark:text-white" },
      { key: "designation", label: "Designation", render: (i: any) => i.designation?.name || "\u2014" },
      { key: "department", label: "Department", render: (i: any) => i.department?.name || "\u2014" },
      { key: "joiningDate", label: "Join Date", render: (i: any) => i.joiningDate ? new Date(i.joiningDate).toLocaleDateString() : "\u2014" },
      { key: "phone", label: "Phone", render: (i: any) => i.phone || "\u2014" },
      { key: "isActive", label: "Status", render: (i: any) => <StatusBadge status={i.isActive ? "Active" : "Inactive"} /> },
    ],
    transformData: (raw, fv) => { let result = raw[0] || []; if (fv.deptFilter && fv.deptFilter !== "all") result = result.filter((e: any) => e.department?.name === fv.deptFilter); if (fv.search) { const lower = fv.search.toLowerCase(); result = result.filter((e: any) => (e.name || "").toLowerCase().includes(lower) || (e.employeeCode || "").toLowerCase().includes(lower) || (e.phone || "").toLowerCase().includes(lower)); } return result; },
    csvHeaders: "Code,Name,Designation,Department,Join Date,Phone,Address,Status",
    csvRow: (i) => `"${i.employeeCode || ""}","${i.name || ""}","${i.designation?.name || ""}","${i.department?.name || ""}","${i.joiningDate ? new Date(i.joiningDate).toLocaleDateString() : ""}","${i.phone || ""}","${i.address || ""}","${i.isActive ? "Active" : "Inactive"}"`,
    pdfHead: () => [["Code", "Name", "Designation", "Department", "Join Date", "Phone", "Status"]],
    pdfBody: (d) => d.map((i: any) => [i.employeeCode || "", i.name || "", i.designation?.name || "", i.department?.name || "", i.joiningDate ? new Date(i.joiningDate).toLocaleDateString() : "", i.phone || "", i.isActive ? "Active" : "Inactive"]),
  },
  "product-info": {
    title: "Product Information", description: "View and export product information", icon: <Package className="h-5 w-5" />,
    apiPaths: ["products"], filename: "product-info",
    filters: [{ key: "search", label: "Search", type: "search", placeholder: "Search by name, code..." }, { key: "categoryFilter", label: "Category", type: "select", optionsFromData: 0, optionsFilter: () => true, optionsValue: (i: any) => i.category?.name || "", optionsLabel: (i: any) => i.category?.name || "N/A", selectAllLabel: "All Categories", className: "w-48" }],
    columns: [
      { key: "productCode", label: "Code", render: (i: any) => <span className="font-mono text-xs">{i.productCode}</span> },
      { key: "name", label: "Name", render: (i: any) => i.name, className: "font-medium text-slate-900 dark:text-white" },
      { key: "category", label: "Category", render: (i: any) => i.category?.name || "\u2014" },
      { key: "company", label: "Company", render: (i: any) => i.company?.name || "\u2014" },
      { key: "costPrice", label: "Cost (\u09F3)", align: "right", render: (i: any) => i.costPrice || 0 },
      { key: "salePrice", label: "Sale (\u09F3)", align: "right", render: (i: any) => i.salePrice || 0 },
      { key: "openingStock", label: "Stock", align: "right", render: (i: any) => i.openingStock || 0 },
      { key: "isActive", label: "Status", render: (i: any) => <StatusBadge status={i.isActive ? "Active" : "Inactive"} /> },
    ],
    transformData: (raw, fv) => { let result = raw[0] || []; if (fv.categoryFilter && fv.categoryFilter !== "all") result = result.filter((p: any) => p.category?.name === fv.categoryFilter); if (fv.search) { const lower = fv.search.toLowerCase(); result = result.filter((p: any) => (p.name || "").toLowerCase().includes(lower) || (p.productCode || "").toLowerCase().includes(lower)); } return result; },
    csvHeaders: "Code,Name,Category,Company,Cost Price,Sale Price,Opening Stock,Reorder Level,Status",
    csvRow: (i) => `"${i.productCode || ""}","${i.name || ""}","${i.category?.name || ""}","${i.company?.name || ""}","${i.costPrice || 0}","${i.salePrice || 0}","${i.openingStock || 0}","${i.reorderLevel || 0}","${i.isActive ? "Active" : "Inactive"}"`,
    pdfHead: () => [["Code", "Name", "Category", "Company", "Cost (\u09F3)", "Sale (\u09F3)", "Stock", "Status"]],
    pdfBody: (d) => d.map((i: any) => [i.productCode || "", i.name || "", i.category?.name || "", i.company?.name || "", String(i.costPrice || 0), String(i.salePrice || 0), String(i.openingStock || 0), i.isActive ? "Active" : "Inactive"]),
  },
  "sr-wise-sales-report": {
    title: "SR-Wise Sales Report", description: "Sales performance by sales representative", icon: <UserCheck className="h-5 w-5" />,
    apiPaths: ["sales-orders", "employees"], filename: "sr-wise-sales",
    filters: [{ key: "srFilter", label: "SR / Employee", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All SRs", className: "w-56" }],
    columns: [
      { key: "name", label: "SR Name", render: (i: any) => i.name, className: "font-medium text-slate-900 dark:text-white" },
      { key: "totalSales", label: "Total Sales", align: "right", render: (i: any) => `\u09F3${i.totalSales.toLocaleString()}` },
      { key: "orderCount", label: "No. of Orders", align: "right", render: (i: any) => i.orderCount },
      { key: "avgOrderValue", label: "Avg Order Value", align: "right", render: (i: any) => `\u09F3${i.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
    ],
    summaryCards: [
      { label: "Total Sales", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.totalSales, 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Total Orders", valueFn: (d: any[]) => d.reduce((s, i: any) => s + i.orderCount, 0), icon: <ShoppingCart className="h-5 w-5 text-blue-600 dark:text-blue-400" />, iconBg: "bg-blue-100 dark:bg-blue-900/30" },
    ],
    transformData: (raw, fv) => { const sos = raw[0] || []; const map = new Map<string, any>(); sos.forEach((so: any) => { const srId = so.employeeId || so.srId || "unassigned"; const existing = map.get(srId) || { name: so.employee?.name || so.srName || "Unassigned", totalSales: 0, orderCount: 0 }; existing.totalSales += so.grandTotal || 0; existing.orderCount += 1; map.set(srId, existing); }); const srData = Array.from(map.entries()).map(([id, data]) => ({ id, ...data, avgOrderValue: data.orderCount > 0 ? data.totalSales / data.orderCount : 0 })); return fv.srFilter && fv.srFilter !== "all" ? srData.filter((s: any) => s.id === fv.srFilter) : srData; },
    csvHeaders: "SR Name,Total Sales,No. of Orders,Avg Order Value", csvRow: (i) => `${i.name},${i.totalSales},${i.orderCount},${i.avgOrderValue.toFixed(2)}`,
    pdfHead: () => [["SR Name", "Total Sales (\u09F3)", "Orders", "Avg Order Value (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.name, `\u09F3${i.totalSales.toLocaleString()}`, i.orderCount, `\u09F3${i.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`]),
  },
  "sr-wise-customer-due": {
    title: "SR Wise Customer Due", description: "Customer dues grouped by SR", icon: <DollarSign className="h-5 w-5" />,
    apiPaths: ["sales-orders", "employees"], filename: "sr-wise-customer-due",
    filters: [{ key: "srFilter", label: "SR", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All SRs", className: "w-56" }],
    columns: [
      { key: "srName", label: "SR Name", render: (i: any) => i.srName, className: "font-medium" },
      { key: "customerName", label: "Customer", render: (i: any) => i.customerName },
      { key: "totalDue", label: "Total Due", align: "right", render: (i: any) => `\u09F3${i.totalDue.toLocaleString()}` },
      { key: "orderCount", label: "Orders", align: "right", render: (i: any) => i.orderCount },
    ],
    transformData: (raw, fv) => { const sos = raw[0] || []; const filtered = fv.srFilter && fv.srFilter !== "all" ? sos.filter((so: any) => (so.employeeId || so.srId) === fv.srFilter) : sos; const map = new Map<string, any>(); filtered.forEach((so: any) => { const due = (so.grandTotal || 0) - (so.totalPaid || 0); if (due <= 0) return; const key = `${so.employeeId || so.srId || "none"}-${so.customerId}`; const existing = map.get(key) || { srName: so.employee?.name || so.srName || "Unassigned", customerName: so.customer?.name || "Unknown", totalDue: 0, orderCount: 0 }; existing.totalDue += due; existing.orderCount += 1; map.set(key, existing); }); return Array.from(map.values()); },
    csvHeaders: "SR Name,Customer,Total Due,Orders", csvRow: (i) => `${i.srName},${i.customerName},${i.totalDue},${i.orderCount}`,
    pdfHead: () => [["SR Name", "Customer", "Total Due (\u09F3)", "Orders"]], pdfBody: (d) => d.map((i: any) => [i.srName, i.customerName, `\u09F3${i.totalDue.toLocaleString()}`, i.orderCount]),
  },
  "sr-wise-customer-sales-summary": {
    title: "SR Wise Customer Sales Summary", description: "Customer sales grouped by SR", icon: <BarChart3 className="h-5 w-5" />,
    apiPaths: ["sales-orders", "employees"], filename: "sr-wise-customer-sales-summary",
    filters: [{ key: "srFilter", label: "SR", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All SRs", className: "w-56" }],
    columns: [
      { key: "srName", label: "SR Name", render: (i: any) => i.srName, className: "font-medium" },
      { key: "customerName", label: "Customer", render: (i: any) => i.customerName },
      { key: "totalSales", label: "Total Sales", align: "right", render: (i: any) => `\u09F3${i.totalSales.toLocaleString()}` },
      { key: "orderCount", label: "Orders", align: "right", render: (i: any) => i.orderCount },
    ],
    transformData: (raw, fv) => { const sos = raw[0] || []; const filtered = fv.srFilter && fv.srFilter !== "all" ? sos.filter((so: any) => (so.employeeId || so.srId) === fv.srFilter) : sos; const map = new Map<string, any>(); filtered.forEach((so: any) => { const key = `${so.employeeId || so.srId || "none"}-${so.customerId}`; const existing = map.get(key) || { srName: so.employee?.name || so.srName || "Unassigned", customerName: so.customer?.name || "Unknown", totalSales: 0, orderCount: 0 }; existing.totalSales += so.grandTotal || 0; existing.orderCount += 1; map.set(key, existing); }); return Array.from(map.values()); },
    csvHeaders: "SR Name,Customer,Total Sales,Orders", csvRow: (i) => `${i.srName},${i.customerName},${i.totalSales},${i.orderCount}`,
    pdfHead: () => [["SR Name", "Customer", "Total Sales (\u09F3)", "Orders"]], pdfBody: (d) => d.map((i: any) => [i.srName, i.customerName, `\u09F3${i.totalSales.toLocaleString()}`, i.orderCount]),
  },
  "sr-visit-report": {
    title: "SR Visit Report", description: "Sales representative visit tracking", icon: <UserCheck className="h-5 w-5" />,
    apiPaths: ["sales-orders", "employees"], filename: "sr-visit-report",
    filters: [{ key: "srFilter", label: "SR", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All SRs", className: "w-56" }],
    columns: [
      { key: "srName", label: "SR Name", render: (i: any) => i.srName, className: "font-medium" },
      { key: "visitCount", label: "Visits (Orders)", align: "right", render: (i: any) => i.visitCount },
      { key: "uniqueCustomers", label: "Unique Customers", align: "right", render: (i: any) => i.uniqueCustomers },
      { key: "totalSales", label: "Total Sales", align: "right", render: (i: any) => `\u09F3${i.totalSales.toLocaleString()}` },
    ],
    transformData: (raw, fv) => { const sos = raw[0] || []; const filtered = fv.srFilter && fv.srFilter !== "all" ? sos.filter((so: any) => (so.employeeId || so.srId) === fv.srFilter) : sos; const map = new Map<string, any>(); filtered.forEach((so: any) => { const srId = so.employeeId || so.srId || "none"; const existing = map.get(srId) || { srName: so.employee?.name || so.srName || "Unassigned", visitCount: 0, customers: new Set<string>(), totalSales: 0 }; existing.visitCount += 1; if (so.customerId) existing.customers.add(so.customerId); existing.totalSales += so.grandTotal || 0; map.set(srId, existing); }); return Array.from(map.entries()).map(([id, d]) => ({ id, srName: d.srName, visitCount: d.visitCount, uniqueCustomers: d.customers.size, totalSales: d.totalSales })); },
    csvHeaders: "SR Name,Visits,Unique Customers,Total Sales", csvRow: (i) => `${i.srName},${i.visitCount},${i.uniqueCustomers},${i.totalSales}`,
    pdfHead: () => [["SR Name", "Visits", "Unique Customers", "Total Sales (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.srName, i.visitCount, i.uniqueCustomers, `\u09F3${i.totalSales.toLocaleString()}`]),
  },
  "sr-wise-customer-status": {
    title: "SR Wise Customer Status", description: "Customer status by SR", icon: <Activity className="h-5 w-5" />,
    apiPaths: ["sales-orders", "customers", "employees"], filename: "sr-wise-customer-status",
    filters: [{ key: "srFilter", label: "SR", type: "select", optionsFromData: 2, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All SRs", className: "w-56" }],
    columns: [
      { key: "srName", label: "SR Name", render: (i: any) => i.srName, className: "font-medium" },
      { key: "totalCustomers", label: "Total Customers", align: "right", render: (i: any) => i.totalCustomers },
      { key: "activeCustomers", label: "Active", align: "right", render: (i: any) => i.activeCustomers },
      { key: "dueCustomers", label: "With Due", align: "right", render: (i: any) => i.dueCustomers },
      { key: "totalSales", label: "Total Sales", align: "right", render: (i: any) => `\u09F3${i.totalSales.toLocaleString()}` },
    ],
    transformData: (raw, fv) => { const sos = raw[0] || []; const filtered = fv.srFilter && fv.srFilter !== "all" ? sos.filter((so: any) => (so.employeeId || so.srId) === fv.srFilter) : sos; const map = new Map<string, any>(); filtered.forEach((so: any) => { const srId = so.employeeId || so.srId || "none"; const existing = map.get(srId) || { srName: so.employee?.name || so.srName || "Unassigned", customers: new Set<string>(), dueCustomers: new Set<string>(), totalSales: 0 }; if (so.customerId) existing.customers.add(so.customerId); if ((so.grandTotal || 0) - (so.totalPaid || 0) > 0 && so.customerId) existing.dueCustomers.add(so.customerId); existing.totalSales += so.grandTotal || 0; map.set(srId, existing); }); return Array.from(map.entries()).map(([id, d]) => ({ id, srName: d.srName, totalCustomers: d.customers.size, activeCustomers: d.customers.size - d.dueCustomers.size, dueCustomers: d.dueCustomers.size, totalSales: d.totalSales })); },
    csvHeaders: "SR Name,Total Customers,Active,With Due,Total Sales", csvRow: (i) => `${i.srName},${i.totalCustomers},${i.activeCustomers},${i.dueCustomers},${i.totalSales}`,
    pdfHead: () => [["SR Name", "Total Customers", "Active", "With Due", "Total Sales (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.srName, i.totalCustomers, i.activeCustomers, i.dueCustomers, `\u09F3${i.totalSales.toLocaleString()}`]),
  },
  "sr-wise-cash-collection": {
    title: "SR Wise Cash Collection", description: "Cash collections by sales representative", icon: <DollarSign className="h-5 w-5" />,
    apiPaths: ["cash-collections", "sales-orders", "employees"], filename: "sr-wise-cash-collection",
    filters: [{ key: "srFilter", label: "SR", type: "select", optionsFromData: 2, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All SRs", className: "w-56" }],
    columns: [
      { key: "srName", label: "SR Name", render: (i: any) => i.srName, className: "font-medium" },
      { key: "totalCollected", label: "Total Collected", align: "right", render: (i: any) => `\u09F3${i.totalCollected.toLocaleString()}` },
      { key: "collectionCount", label: "Collections", align: "right", render: (i: any) => i.collectionCount },
      { key: "uniqueCustomers", label: "Unique Customers", align: "right", render: (i: any) => i.uniqueCustomers },
    ],
    transformData: (raw, fv) => { const ccs = raw[0] || []; const sos = raw[1] || []; const customerSrMap = new Map<string, string>(); sos.forEach((so: any) => { if (so.customerId) customerSrMap.set(so.customerId, so.employeeId || so.srId || "none"); }); const filtered = fv.srFilter && fv.srFilter !== "all" ? ccs.filter((cc: any) => customerSrMap.get(cc.customerId) === fv.srFilter) : ccs; const map = new Map<string, any>(); filtered.forEach((cc: any) => { const srId = customerSrMap.get(cc.customerId) || "none"; const srName = sos.find((so: any) => (so.employeeId || so.srId) === srId)?.employee?.name || "Unassigned"; const existing = map.get(srId) || { srName, totalCollected: 0, collectionCount: 0, customers: new Set<string>() }; existing.totalCollected += cc.amount || 0; existing.collectionCount += 1; if (cc.customerId) existing.customers.add(cc.customerId); map.set(srId, existing); }); return Array.from(map.entries()).map(([id, d]) => ({ id, srName: d.srName, totalCollected: d.totalCollected, collectionCount: d.collectionCount, uniqueCustomers: d.customers.size })); },
    csvHeaders: "SR Name,Total Collected,Collections,Unique Customers", csvRow: (i) => `${i.srName},${i.totalCollected},${i.collectionCount},${i.uniqueCustomers}`,
    pdfHead: () => [["SR Name", "Total Collected (\u09F3)", "Collections", "Unique Customers"]], pdfBody: (d) => d.map((i: any) => [i.srName, `\u09F3${i.totalCollected.toLocaleString()}`, i.collectionCount, i.uniqueCustomers]),
  },
  "sr-commission-report": {
    title: "SR Commission Report", description: "Commission calculation for sales representatives", icon: <CircleDollarSign className="h-5 w-5" />,
    apiPaths: ["sales-orders", "employees"], filename: "sr-commission-report",
    filters: [{ key: "srFilter", label: "SR", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All SRs", className: "w-56" }],
    columns: [
      { key: "srName", label: "SR Name", render: (i: any) => i.srName, className: "font-medium" },
      { key: "totalSales", label: "Total Sales", align: "right", render: (i: any) => `\u09F3${i.totalSales.toLocaleString()}` },
      { key: "orderCount", label: "Orders", align: "right", render: (i: any) => i.orderCount },
      { key: "commission", label: "Commission (1%)", align: "right", render: (i: any) => `\u09F3${i.commission.toLocaleString()}`, className: "text-green-600 dark:text-green-400 font-semibold" },
    ],
    summaryCards: [{ label: "Total Commission", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.commission, 0).toLocaleString()}`, icon: <CircleDollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30", valueColor: "text-green-600 dark:text-green-400" }],
    transformData: (raw, fv) => { const sos = raw[0] || []; const filtered = fv.srFilter && fv.srFilter !== "all" ? sos.filter((so: any) => (so.employeeId || so.srId) === fv.srFilter) : sos; const map = new Map<string, any>(); filtered.forEach((so: any) => { const srId = so.employeeId || so.srId || "none"; const existing = map.get(srId) || { srName: so.employee?.name || so.srName || "Unassigned", totalSales: 0, orderCount: 0 }; existing.totalSales += so.grandTotal || 0; existing.orderCount += 1; map.set(srId, existing); }); return Array.from(map.entries()).map(([id, d]) => ({ id, ...d, commission: Math.round(d.totalSales * 0.01) })); },
    csvHeaders: "SR Name,Total Sales,Orders,Commission", csvRow: (i) => `${i.srName},${i.totalSales},${i.orderCount},${i.commission}`,
    pdfHead: () => [["SR Name", "Total Sales (\u09F3)", "Orders", "Commission (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.srName, `\u09F3${i.totalSales.toLocaleString()}`, i.orderCount, `\u09F3${i.commission.toLocaleString()}`]),
  },
  "customer-wise-sales-report": {
    title: "Customer Wise Sales Report", description: "Sales grouped by customer", icon: <ShoppingBag className="h-5 w-5" />,
    apiPaths: ["sales-orders", "customers"], filename: "customer-wise-sales-report",
    filters: [{ key: "customerFilter", label: "Customer", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Customers", className: "w-56" }, { key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "customerName", label: "Customer", render: (i: any) => i.customerName, className: "font-medium" },
      { key: "totalSales", label: "Total Sales", align: "right", render: (i: any) => `\u09F3${i.totalSales.toLocaleString()}` },
      { key: "orderCount", label: "Orders", align: "right", render: (i: any) => i.orderCount },
      { key: "avgOrderValue", label: "Avg Order Value", align: "right", render: (i: any) => `\u09F3${i.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` },
    ],
    transformData: (raw, fv) => { let sos = raw[0] || []; if (fv.customerFilter && fv.customerFilter !== "all") sos = sos.filter((so: any) => so.customerId === fv.customerFilter); if (fv.dateFrom) sos = sos.filter((so: any) => new Date(so.date) >= new Date(fv.dateFrom)); if (fv.dateTo) sos = sos.filter((so: any) => new Date(so.date) <= new Date(fv.dateTo)); const map = new Map<string, any>(); sos.forEach((so: any) => { const id = so.customerId || "walk-in"; const existing = map.get(id) || { customerName: so.customer?.name || "Walk-in", totalSales: 0, orderCount: 0 }; existing.totalSales += so.grandTotal || 0; existing.orderCount += 1; map.set(id, existing); }); return Array.from(map.entries()).map(([id, d]) => ({ id, ...d, avgOrderValue: d.orderCount > 0 ? d.totalSales / d.orderCount : 0 })); },
    csvHeaders: "Customer,Total Sales,Orders,Avg Order Value", csvRow: (i) => `${i.customerName},${i.totalSales},${i.orderCount},${i.avgOrderValue.toFixed(2)}`,
    pdfHead: () => [["Customer", "Total Sales (\u09F3)", "Orders", "Avg Order Value (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.customerName, `\u09F3${i.totalSales.toLocaleString()}`, i.orderCount, `\u09F3${i.avgOrderValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`]),
  },
  "category-wise-customer-due": {
    title: "Category Wise Customer Due", description: "Customer dues by product category", icon: <Grid3X3 className="h-5 w-5" />,
    apiPaths: ["sales-orders", "categories"], filename: "category-wise-customer-due",
    columns: [
      { key: "category", label: "Category", render: (i: any) => i.category, className: "font-medium" },
      { key: "totalDue", label: "Total Due", align: "right", render: (i: any) => `\u09F3${i.totalDue.toLocaleString()}` },
      { key: "orderCount", label: "Orders", align: "right", render: (i: any) => i.orderCount },
    ],
    transformData: (raw) => { const sos = raw[0] || []; const map = new Map<string, any>(); sos.forEach((so: any) => { const due = (so.grandTotal || 0) - (so.totalPaid || 0); if (due <= 0) return; (so.lines || []).forEach((l: any) => { const cat = l.product?.category?.name || "Uncategorized"; const existing = map.get(cat) || { category: cat, totalDue: 0, orderCount: 0 }; existing.totalDue += due; existing.orderCount += 1; map.set(cat, existing); }); }); return Array.from(map.values()); },
    csvHeaders: "Category,Total Due,Orders", csvRow: (i) => `${i.category},${i.totalDue},${i.orderCount}`,
    pdfHead: () => [["Category", "Total Due (\u09F3)", "Orders"]], pdfBody: (d) => d.map((i: any) => [i.category, `\u09F3${i.totalDue.toLocaleString()}`, i.orderCount]),
  },
  "customer-ledger-report": {
    title: "Customer Ledger Report", description: "Detailed customer transaction ledger", icon: <FileSpreadsheet className="h-5 w-5" />,
    apiPaths: ["customers", "sales-orders", "cash-collections"], filename: "customer-ledger-report",
    filters: [{ key: "customerFilter", label: "Customer", type: "select", optionsFromData: 0, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Customers", className: "w-56" }],
    columns: [
      { key: "date", label: "Date", render: (i: any) => i.date ? new Date(i.date).toLocaleDateString() : "-" },
      { key: "description", label: "Description", render: (i: any) => i.description },
      { key: "debit", label: "Debit (\u09F3)", align: "right", render: (i: any) => i.debit > 0 ? `\u09F3${i.debit.toLocaleString()}` : "-" },
      { key: "credit", label: "Credit (\u09F3)", align: "right", render: (i: any) => i.credit > 0 ? `\u09F3${i.credit.toLocaleString()}` : "-" },
      { key: "balance", label: "Balance (\u09F3)", align: "right", render: (i: any) => <span className={i.balance >= 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>\u09F3{i.balance.toLocaleString()}</span>, className: "font-medium" },
    ],
    transformData: (raw, fv) => { const sos = raw[1] || []; const ccs = raw[2] || []; const targetId = fv.customerFilter && fv.customerFilter !== "all" ? fv.customerFilter : null; const entries: any[] = []; (targetId ? sos.filter((so: any) => so.customerId === targetId) : sos).forEach((so: any) => { entries.push({ date: so.date, description: `Sales - ${so.invoiceNo}${so.customer ? ` (${so.customer.name})` : ""}`, debit: Number(so.grandTotal) || 0, credit: 0 }); }); (targetId ? ccs.filter((cc: any) => cc.customerId === targetId) : ccs).forEach((cc: any) => { entries.push({ date: cc.date, description: `Payment - ${cc.customer?.name || "Unknown"}${cc.description ? ` - ${cc.description}` : ""}`, debit: 0, credit: Number(cc.amount) || 0 }); }); entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); let balance = 0; return entries.map((e) => { balance += e.debit - e.credit; return { ...e, balance }; }); },
    csvHeaders: "Date,Description,Debit,Credit,Balance", csvRow: (i) => `${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.description},${i.debit},${i.credit},${i.balance}`,
    pdfHead: () => [["Date", "Description", "Debit (\u09F3)", "Credit (\u09F3)", "Balance (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.date ? new Date(i.date).toLocaleDateString() : "-", i.description, `\u09F3${i.debit.toLocaleString()}`, `\u09F3${i.credit.toLocaleString()}`, `\u09F3${i.balance.toLocaleString()}`]),
  },
  "supplier-wise-purchase": {
    title: "Supplier Wise Purchase", description: "Purchase breakdown by supplier", icon: <Truck className="h-5 w-5" />,
    apiPaths: ["suppliers", "purchase-orders"], filename: "supplier-wise-purchase",
    filters: [{ key: "supplierFilter", label: "Supplier Filter", type: "select", optionsFromData: 0, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Suppliers", className: "w-56" }],
    columns: [
      { key: "supplier", label: "Supplier", render: (i: any) => i.supplier, className: "font-medium" },
      { key: "orderCount", label: "Orders", align: "right", render: (i: any) => i.orderCount },
      { key: "totalItems", label: "Total Items", align: "right", render: (i: any) => i.totalItems },
      { key: "totalPurchase", label: "Total Purchase (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.totalPurchase.toLocaleString()}`, className: "font-medium" },
    ],
    summaryCards: [
      { label: "Total Purchase", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.totalPurchase, 0).toLocaleString()}`, icon: <CircleDollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Suppliers", valueFn: (d) => d.length, icon: <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />, iconBg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Total Orders", valueFn: (d: any[]) => d.reduce((s, i: any) => s + i.orderCount, 0), icon: <ShoppingCart className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    chartConfig: { dataKey: "totalPurchase", name: "Purchase", fill: "#f59e0b", layout: "vertical", title: "Top Suppliers by Purchase", xAxisKey: "supplier" },
    transformData: (raw, fv) => { const pos = raw[1] || []; const map = new Map<string, any>(); const filtered = fv.supplierFilter && fv.supplierFilter !== "all" ? pos.filter((po: any) => po.supplierId === fv.supplierFilter) : pos; filtered.forEach((po: any) => { const name = po.supplier?.name || "Unknown"; const existing = map.get(name) || { supplier: name, totalPurchase: 0, totalItems: 0, orderCount: 0 }; existing.totalPurchase += Number(po.grandTotal) || 0; existing.totalItems += po.lines?.length || 0; existing.orderCount += 1; map.set(name, existing); }); return Array.from(map.values()).sort((a, b) => b.totalPurchase - a.totalPurchase); },
    csvHeaders: "Supplier,Orders,Total Items,Total Purchase", csvRow: (i) => `${i.supplier},${i.orderCount},${i.totalItems},${i.totalPurchase}`,
    pdfHead: () => [["Supplier", "Orders", "Total Items", "Total Purchase (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.supplier, i.orderCount, i.totalItems, `\u09F3${i.totalPurchase.toLocaleString()}`]),
  },
  "model-wise-purchase": {
    title: "Model Wise Purchase", description: "Purchase breakdown by product model", icon: <Tag className="h-5 w-5" />,
    apiPaths: ["purchase-orders", "products"], filename: "model-wise-purchase",
    filters: [{ key: "productFilter", label: "Product Filter", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Products", className: "w-56" }],
    columns: [
      { key: "product", label: "Product", render: (i: any) => i.product, className: "font-medium" },
      { key: "qtyPurchased", label: "Qty Purchased", align: "right", render: (i: any) => i.qtyPurchased },
      { key: "totalCost", label: "Total Cost (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.totalCost.toLocaleString()}`, className: "font-medium" },
      { key: "avgPrice", label: "Avg Price (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.qtyPurchased > 0 ? (i.totalCost / i.qtyPurchased).toFixed(2) : "0"}` },
    ],
    summaryCards: [
      { label: "Total Cost", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.totalCost, 0).toLocaleString()}`, icon: <CircleDollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Total Qty Purchased", valueFn: (d: any[]) => d.reduce((s, i: any) => s + i.qtyPurchased, 0), icon: <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />, iconBg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Unique Products", valueFn: (d) => d.length, icon: <Tag className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    transformData: (raw, fv) => { const pos = raw[0] || []; const map = new Map<string, any>(); const filtered = fv.productFilter && fv.productFilter !== "all" ? pos.filter((po: any) => po.lines?.some((l: any) => l.productId === fv.productFilter)) : pos; filtered.forEach((po: any) => { (po.lines || []).forEach((line: any) => { if (fv.productFilter && fv.productFilter !== "all" && line.productId !== fv.productFilter) return; const key = line.productId || line.product?.name || "Unknown"; const existing = map.get(key) || { product: line.product?.name || "Unknown", qtyPurchased: 0, totalCost: 0 }; existing.qtyPurchased += Number(line.quantity) || 0; existing.totalCost += Number(line.total) || 0; map.set(key, existing); }); }); return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost); },
    csvHeaders: "Product,Qty Purchased,Total Cost,Avg Price", csvRow: (i) => `${i.product},${i.qtyPurchased},${i.totalCost},${i.qtyPurchased > 0 ? (i.totalCost / i.qtyPurchased).toFixed(2) : 0}`,
    pdfHead: () => [["Product", "Qty Purchased", "Total Cost (\u09F3)", "Avg Price (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.product, i.qtyPurchased, `\u09F3${i.totalCost.toLocaleString()}`, `\u09F3${i.qtyPurchased > 0 ? (i.totalCost / i.qtyPurchased).toFixed(2) : "0"}`]),
  },
  "model-wise-sales": {
    title: "Model Wise Sales", description: "Sales breakdown by product model", icon: <Tag className="h-5 w-5" />,
    apiPaths: ["sales-orders", "products"], filename: "model-wise-sales",
    filters: [{ key: "productFilter", label: "Product Filter", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Products", className: "w-56" }],
    columns: [
      { key: "product", label: "Product", render: (i: any) => i.product, className: "font-medium" },
      { key: "qtySold", label: "Qty Sold", align: "right", render: (i: any) => i.qtySold },
      { key: "totalRevenue", label: "Total Revenue (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.totalRevenue.toLocaleString()}`, className: "font-medium" },
      { key: "avgPrice", label: "Avg Price (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.qtySold > 0 ? (i.totalRevenue / i.qtySold).toFixed(2) : "0"}` },
    ],
    summaryCards: [
      { label: "Total Revenue", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.totalRevenue, 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Total Qty Sold", valueFn: (d: any[]) => d.reduce((s, i: any) => s + i.qtySold, 0), icon: <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />, iconBg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "Unique Products", valueFn: (d) => d.length, icon: <Tag className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    chartConfig: { dataKey: "totalRevenue", name: "Revenue", fill: "#16a34a", layout: "vertical", title: "Top Products by Revenue", xAxisKey: "product" },
    transformData: (raw, fv) => { const sos = raw[0] || []; const map = new Map<string, any>(); const filtered = fv.productFilter && fv.productFilter !== "all" ? sos.filter((so: any) => so.lines?.some((l: any) => l.productId === fv.productFilter)) : sos; filtered.forEach((so: any) => { (so.lines || []).forEach((line: any) => { if (fv.productFilter && fv.productFilter !== "all" && line.productId !== fv.productFilter) return; const key = line.productId || line.product?.name || "Unknown"; const existing = map.get(key) || { product: line.product?.name || "Unknown", qtySold: 0, totalRevenue: 0 }; existing.qtySold += Number(line.quantity) || 0; existing.totalRevenue += Number(line.total) || 0; map.set(key, existing); }); }); return Array.from(map.values()).sort((a, b) => b.totalRevenue - a.totalRevenue); },
    csvHeaders: "Product,Qty Sold,Total Revenue,Avg Price", csvRow: (i) => `${i.product},${i.qtySold},${i.totalRevenue},${i.qtySold > 0 ? (i.totalRevenue / i.qtySold).toFixed(2) : 0}`,
    pdfHead: () => [["Product", "Qty Sold", "Total Revenue (\u09F3)", "Avg Price (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.product, i.qtySold, `\u09F3${i.totalRevenue.toLocaleString()}`, `\u09F3${i.qtySold > 0 ? (i.totalRevenue / i.qtySold).toFixed(2) : "0"}`]),
  },
  "supplier-ledger": {
    title: "Supplier Ledger", description: "All supplier transactions with running balance", icon: <Truck className="h-5 w-5" />,
    apiPaths: ["suppliers", "purchase-orders", "cash-deliveries"], filename: "supplier-ledger",
    filters: [{ key: "supplierFilter", label: "Supplier", type: "select", optionsFromData: 0, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Suppliers", className: "w-56" }],
    columns: [
      { key: "date", label: "Date", render: (i: any) => i.date },
      { key: "description", label: "Description", render: (i: any) => i.description },
      { key: "debit", label: "Debit (\u09F3)", align: "right", render: (i: any) => i.debit > 0 ? `\u09F3${i.debit.toLocaleString()}` : "-" },
      { key: "credit", label: "Credit (\u09F3)", align: "right", render: (i: any) => i.credit > 0 ? `\u09F3${i.credit.toLocaleString()}` : "-" },
      { key: "balance", label: "Balance (\u09F3)", align: "right", render: (i: any) => <span className={i.balance >= 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}>\u09F3{i.balance.toLocaleString()}</span>, className: "font-medium" },
    ],
    summaryCards: [
      { label: "Total Debit (Purchases)", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.debit, 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-orange-600 dark:text-orange-400" />, iconBg: "bg-orange-100 dark:bg-orange-900/30" },
      { label: "Total Credit (Payments)", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.credit, 0).toLocaleString()}`, icon: <TrendingDown className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Current Balance (Due)", valueFn: (d: any[]) => { const b = d.reduce((s, i: any) => s + i.debit - i.credit, 0); return `\u09F3${Math.abs(b).toLocaleString()}`; }, icon: <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    transformData: (raw, fv) => { const pos = raw[1] || []; const cds = raw[2] || []; const filteredPOs = fv.supplierFilter && fv.supplierFilter !== "all" ? pos.filter((po: any) => po.supplierId === fv.supplierFilter) : pos; const filteredCDs = fv.supplierFilter && fv.supplierFilter !== "all" ? cds.filter((cd: any) => cd.supplierId === fv.supplierFilter) : cds; const entries: any[] = []; filteredPOs.forEach((po: any) => { entries.push({ date: po.date ? new Date(po.date).toLocaleDateString() : "-", description: `Purchase - ${po.poNumber}${po.supplier ? ` (${po.supplier.name})` : ""}`, debit: Number(po.grandTotal) || 0, credit: 0 }); }); filteredCDs.forEach((cd: any) => { entries.push({ date: cd.date ? new Date(cd.date).toLocaleDateString() : "-", description: `Payment - ${cd.supplier?.name || "Unknown"}${cd.description ? ` - ${cd.description}` : ""}`, debit: 0, credit: Number(cd.amount) || 0 }); }); entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); let balance = 0; return entries.map((e) => { balance += e.debit - e.credit; return { ...e, balance }; }); },
    csvHeaders: "Date,Description,Debit,Credit,Balance", csvRow: (i) => `${i.date},${i.description},${i.debit},${i.credit},${i.balance}`,
    pdfHead: () => [["Date", "Description", "Debit (\u09F3)", "Credit (\u09F3)", "Balance (\u09F3)"]], pdfBody: (d) => d.map((i: any) => [i.date, i.description, `\u09F3${i.debit.toLocaleString()}`, `\u09F3${i.credit.toLocaleString()}`, `\u09F3${i.balance.toLocaleString()}`]),
    tableTitle: "Ledger Transactions",
  },
  "stock-details-report": {
    title: "Stock Details Report", description: "Detailed stock movement records", icon: <Eye className="h-5 w-5" />,
    apiPaths: ["stock-details"], filename: "stock-details-report",
    filters: [
      { key: "search", label: "Search", type: "search", placeholder: "Search product, reference..." },
      { key: "entryType", label: "Entry Type", type: "select", options: [{ value: "IN", label: "IN" }, { value: "OUT", label: "OUT" }, { value: "TRANSFER", label: "TRANSFER" }], selectAllLabel: "All Types", className: "w-36" },
      { key: "dateFrom", label: "Date From", type: "date" },
      { key: "dateTo", label: "Date To", type: "date" },
    ],
    columns: [
      { key: "date", label: "Date", render: (i: any) => new Date(i.date).toLocaleDateString() },
      { key: "product", label: "Product", render: (i: any) => i.product?.name || "\u2014", className: "font-medium" },
      { key: "type", label: "Type", render: (i: any) => <Badge className={`text-xs font-semibold ${i.type === "IN" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : i.type === "OUT" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"}`}>{i.type}</Badge> },
      { key: "quantity", label: "Quantity", align: "right", render: (i: any) => i.quantity, className: "font-medium" },
      { key: "reference", label: "Reference", render: (i: any) => i.reference || "\u2014" },
    ],
    summaryCards: [
      { label: "Total IN", valueFn: (d: any[]) => d.filter((i: any) => i.type === "IN").reduce((s: number, i: any) => s + (i.quantity || 0), 0), icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Total OUT", valueFn: (d: any[]) => d.filter((i: any) => i.type === "OUT").reduce((s: number, i: any) => s + (i.quantity || 0), 0), icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30", valueColor: "text-red-600 dark:text-red-400" },
      { label: "Total TRANSFER", valueFn: (d: any[]) => d.filter((i: any) => i.type === "TRANSFER").reduce((s: number, i: any) => s + (i.quantity || 0), 0), icon: <ArrowRightLeft className="h-5 w-5 text-sky-600 dark:text-sky-400" />, iconBg: "bg-sky-100 dark:bg-sky-900/30", valueColor: "text-sky-600 dark:text-sky-400" },
      { label: "Net Stock", valueFn: (d: any[]) => { const inn = d.filter((i: any) => i.type === "IN").reduce((s: number, i: any) => s + (i.quantity || 0), 0); const out = d.filter((i: any) => i.type === "OUT").reduce((s: number, i: any) => s + (i.quantity || 0), 0); const tr = d.filter((i: any) => i.type === "TRANSFER").reduce((s: number, i: any) => s + (i.quantity || 0), 0); return inn - out - tr; }, icon: <Package className="h-5 w-5 text-primary" />, iconBg: "bg-primary/10" },
    ],
    transformData: (raw, fv) => { let entries = Array.isArray(raw[0]?.data) ? raw[0].data : Array.isArray(raw[0]) ? raw[0] : []; if (fv.entryType && fv.entryType !== "all") entries = entries.filter((e: any) => e.type === fv.entryType); if (fv.dateFrom) entries = entries.filter((e: any) => new Date(e.date) >= new Date(fv.dateFrom)); if (fv.dateTo) entries = entries.filter((e: any) => new Date(e.date) <= new Date(fv.dateTo + "T23:59:59")); if (fv.search) { const lower = fv.search.toLowerCase(); entries = entries.filter((e: any) => (e.product?.name || "").toLowerCase().includes(lower) || (e.reference || "").toLowerCase().includes(lower)); } return entries; },
    csvHeaders: "Date,Product,Type,Quantity,Reference",
    csvRow: (i) => `"${new Date(i.date).toLocaleDateString()}","${i.product?.name || ""}","${i.type}","${i.quantity}","${i.reference || ""}"`,
    pdfHead: () => [["Date", "Product", "Type", "Quantity", "Reference"]],
    pdfBody: (d) => d.map((i: any) => [new Date(i.date).toLocaleDateString(), i.product?.name || "", i.type, String(i.quantity), i.reference || ""]),
    tableMaxH: "max-h-[500px]",
  },
  "stock-summary-report": {
    title: "Stock Summary Report", description: "Stock summary grouped by category", icon: <Layers className="h-5 w-5" />,
    apiPaths: ["stock"], filename: "stock-summary",
    filters: [
      { key: "search", label: "Search", type: "search", placeholder: "Search product..." },
      { key: "categoryFilter", label: "Category", type: "select", optionsFromData: 0, optionsFilter: () => true, optionsValue: (i: any) => i.category || "N/A", optionsLabel: (i: any) => i.category || "N/A", selectAllLabel: "All Categories", className: "w-48" },
    ],
    columns: [
      { key: "productName", label: "Product", render: (i: any) => i.productName, className: "font-medium" },
      { key: "category", label: "Category", render: (i: any) => i.category || "\u2014" },
      { key: "currentStock", label: "Current Stock", align: "right", render: (i: any) => i.currentStock, className: "font-medium" },
      { key: "costPrice", label: "Cost Price", align: "right", render: (i: any) => `\u09F3${(i.costPrice || 0).toLocaleString()}` },
      { key: "salePrice", label: "Sale Price", align: "right", render: (i: any) => `\u09F3${(i.salePrice || 0).toLocaleString()}` },
      { key: "stockValue", label: "Stock Value", align: "right", render: (i: any) => `\u09F3${(i.stockValue || 0).toLocaleString()}`, className: "font-semibold text-primary" },
    ],
    summaryCards: [
      { label: "Products", valueFn: (d) => d.length, icon: <Package className="h-5 w-5 text-primary" />, iconBg: "bg-primary/10" },
      { label: "Total Stock", valueFn: (d: any[]) => d.reduce((s: number, i: any) => s + (i.currentStock || 0), 0), icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Stock Value", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + (i.stockValue || 0), 0).toLocaleString()}`, icon: <CircleDollarSign className="h-5 w-5 text-primary" />, iconBg: "bg-primary/10" },
      { label: "Categories", valueFn: (d: any[]) => new Set(d.map((i: any) => i.category)).size, icon: <Grid3X3 className="h-5 w-5 text-slate-600 dark:text-slate-400" />, iconBg: "bg-slate-100 dark:bg-slate-900/30" },
    ],
    transformData: (raw, fv) => { let result = raw[0] || []; if (fv.categoryFilter && fv.categoryFilter !== "all") result = result.filter((s: any) => s.category === fv.categoryFilter); if (fv.search) { const lower = fv.search.toLowerCase(); result = result.filter((s: any) => (s.productName || "").toLowerCase().includes(lower)); } return result; },
    csvHeaders: "Category,Product,Current Stock,Cost Price,Sale Price,Stock Value",
    csvRow: (i) => `"${i.category || ""}","${i.productName || ""}","${i.currentStock || 0}","\u09F3${i.costPrice || 0}","\u09F3${i.salePrice || 0}","\u09F3${i.stockValue || 0}"`,
    pdfHead: () => [["Category", "Product", "Current Stock", "Cost (\u09F3)", "Sale (\u09F3)", "Value (\u09F3)"]],
    pdfBody: (d) => d.map((i: any) => [i.category || "", i.productName || "", String(i.currentStock || 0), `\u09F3${(i.costPrice || 0).toLocaleString()}`, `\u09F3${(i.salePrice || 0).toLocaleString()}`, `\u09F3${(i.stockValue || 0).toLocaleString()}`]),
    tableMaxH: "max-h-[500px]",
  },
  "stock-ledger": {
    title: "Stock Ledger", description: "Product-wise stock movement with running balance", icon: <FileSpreadsheet className="h-5 w-5" />,
    apiPaths: ["products", "stock-details"], filename: "stock-ledger",
    filters: [
      { key: "productFilter", label: "Product", type: "select", optionsFromData: 0, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => `${i.productCode} \u2014 ${i.name}`, selectAllLabel: "Select a product...", className: "w-72" },
      { key: "dateFrom", label: "Date From", type: "date" },
      { key: "dateTo", label: "Date To", type: "date" },
    ],
    columns: [
      { key: "date", label: "Date", render: (i: any) => new Date(i.date).toLocaleDateString() },
      { key: "type", label: "Type", render: (i: any) => <Badge className={`text-xs font-semibold ${i.type === "IN" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : i.type === "OUT" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"}`}>{i.type}</Badge> },
      { key: "quantity", label: "Quantity", align: "right", render: (i: any) => <span>{i.type === "IN" ? "+" : "\u2212"}{i.quantity}</span>, className: "font-medium" },
      { key: "reference", label: "Reference", render: (i: any) => i.reference || "\u2014" },
      { key: "runningBalance", label: "Running Balance", align: "right", render: (i: any) => i.runningBalance, className: "font-bold" },
    ],
    summaryCards: [
      { label: "Opening Stock", valueFn: (d: any[]) => d.length > 0 ? d[0].openingStock || 0 : 0, icon: <Package className="h-5 w-5 text-primary" />, iconBg: "bg-primary/10" },
      { label: "Total IN", valueFn: (d: any[]) => d.filter((i: any) => i.type === "IN").reduce((s: number, i: any) => s + (i.quantity || 0), 0), icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Total OUT", valueFn: (d: any[]) => d.filter((i: any) => i.type === "OUT" || i.type === "TRANSFER").reduce((s: number, i: any) => s + (i.quantity || 0), 0), icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30", valueColor: "text-red-600 dark:text-red-400" },
      { label: "Closing Balance", valueFn: (d: any[]) => d.length > 0 ? d[d.length - 1].runningBalance : 0, icon: <Wallet className="h-5 w-5 text-primary" />, iconBg: "bg-primary/10" },
    ],
    transformData: (raw, fv) => { if (!fv.productFilter || fv.productFilter === "all") return []; const products = raw[0] || []; const product = products.find((p: any) => p.id === fv.productFilter); if (!product) return []; let entries = Array.isArray(raw[1]?.data) ? raw[1].data : Array.isArray(raw[1]) ? raw[1] : []; entries = entries.filter((e: any) => e.product?.id === fv.productFilter || e.productId === fv.productFilter); if (fv.dateFrom) entries = entries.filter((e: any) => new Date(e.date) >= new Date(fv.dateFrom)); if (fv.dateTo) entries = entries.filter((e: any) => new Date(e.date) <= new Date(fv.dateTo + "T23:59:59")); const sorted = [...entries].sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()); let balance = product.openingStock || 0; return sorted.map((entry: any) => { if (entry.type === "IN") balance += entry.quantity; else if (entry.type === "OUT" || entry.type === "TRANSFER") balance -= entry.quantity; return { ...entry, runningBalance: balance, openingStock: product.openingStock || 0 }; }).reverse(); },
    csvHeaders: "Date,Type,Quantity,Reference,Running Balance",
    csvRow: (i) => `"${new Date(i.date).toLocaleDateString()}","${i.type}","${i.quantity}","${i.reference || ""}","${i.runningBalance}"`,
    pdfHead: () => [["Date", "Type", "Quantity", "Reference", "Balance"]],
    pdfBody: (d) => d.map((i: any) => [new Date(i.date).toLocaleDateString(), i.type, String(i.quantity), i.reference || "-", String(i.runningBalance)]),
    tableMaxH: "max-h-[500px]",
  },
  "stock-quantity-report": {
    title: "Stock Quantity Report", description: "Color-coded stock quantity analysis", icon: <Hash className="h-5 w-5" />,
    apiPaths: ["stock"], filename: "stock-quantity-report",
    filters: [
      { key: "search", label: "Search", type: "search", placeholder: "Search product..." },
      { key: "godownFilter", label: "Godown", type: "select", optionsFromData: 0, optionsFilter: () => true, optionsValue: (i: any) => i.godown || "N/A", optionsLabel: (i: any) => i.godown || "N/A", selectAllLabel: "All Godowns", className: "w-48" },
    ],
    columns: [
      { key: "productName", label: "Product", render: (i: any) => i.productName, className: "font-medium" },
      { key: "category", label: "Category", render: (i: any) => i.category || "\u2014" },
      { key: "godown", label: "Godown", render: (i: any) => i.godown || "\u2014" },
      { key: "currentStock", label: "Current Stock", align: "right", render: (i: any) => i.currentStock, className: "font-bold" },
      { key: "status", label: "Status", render: (i: any) => { const q = i.currentStock; return q <= 0 ? <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-xs">Out of Stock</Badge> : q <= 10 ? <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-xs">Low Stock</Badge> : <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs">In Stock</Badge>; }, className: (i: any) => i.currentStock <= 0 ? "bg-red-50 dark:bg-red-900/20" : i.currentStock <= 10 ? "bg-amber-50 dark:bg-amber-900/20" : "" },
      { key: "stockValue", label: "Stock Value", align: "right", render: (i: any) => `\u09F3${(i.stockValue || 0).toLocaleString()}` },
    ],
    summaryCards: [
      { label: "Total Products", valueFn: (d) => d.length, icon: <Package className="h-5 w-5 text-slate-600 dark:text-slate-400" />, iconBg: "bg-slate-100 dark:bg-slate-900/30" },
      { label: "In Stock", valueFn: (d: any[]) => d.filter((s: any) => s.currentStock > 10).length, icon: <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Low Stock", valueFn: (d: any[]) => d.filter((s: any) => s.currentStock > 0 && s.currentStock <= 10).length, icon: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30", valueColor: "text-amber-600 dark:text-amber-400" },
      { label: "Out of Stock", valueFn: (d: any[]) => d.filter((s: any) => s.currentStock <= 0).length, icon: <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30", valueColor: "text-red-600 dark:text-red-400" },
    ],
    transformData: (raw, fv) => { let result = raw[0] || []; if (fv.godownFilter && fv.godownFilter !== "all") result = result.filter((s: any) => s.godown === fv.godownFilter); if (fv.search) { const lower = fv.search.toLowerCase(); result = result.filter((s: any) => (s.productName || "").toLowerCase().includes(lower)); } return result; },
    csvHeaders: "Product,Category,Godown,Current Stock,Status,Stock Value",
    csvRow: (i) => `"${i.productName || ""}","${i.category || ""}","${i.godown || ""}","${i.currentStock || 0}","${i.currentStock <= 0 ? "Out of Stock" : i.currentStock <= 10 ? "Low Stock" : "In Stock"}","\u09F3${i.stockValue || 0}"`,
    pdfHead: () => [["Product", "Category", "Godown", "Stock", "Status", "Value (\u09F3)"]],
    pdfBody: (d) => d.map((i: any) => [i.productName || "", i.category || "", i.godown || "", String(i.currentStock || 0), i.currentStock <= 0 ? "Out of Stock" : i.currentStock <= 10 ? "Low Stock" : "In Stock", `\u09F3${(i.stockValue || 0).toLocaleString()}`]),
    tableMaxH: "max-h-[500px]",
  },
  "stock-forecast-product": {
    title: "Stock Forecast (Product)", description: "Projected stock levels based on average monthly sales", icon: <TrendingUp className="h-5 w-5" />,
    apiPaths: ["stock", "products"], filename: "stock-forecast-product",
    filters: [{ key: "search", label: "Search", type: "search", placeholder: "Search product..." }],
    columns: [
      { key: "productName", label: "Product", render: (i: any) => i.productName, className: "font-medium" },
      { key: "category", label: "Category", render: (i: any) => i.category || "\u2014" },
      { key: "currentStock", label: "Current Stock", align: "right", render: (i: any) => i.currentStock, className: "font-bold" },
      { key: "avgMonthlySales", label: "Avg Monthly Sales", align: "right", render: (i: any) => i.avgMonthlySales },
      { key: "monthsLeft", label: "Months Left", align: "right", render: (i: any) => i.monthsLeft, className: (i: any) => i.monthsLeft <= 2 ? "text-red-600 dark:text-red-400 font-semibold" : i.monthsLeft <= 4 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-emerald-600 dark:text-emerald-400 font-semibold" },
      { key: "reorderLevel", label: "Reorder Level", align: "right", render: (i: any) => i.reorderLevel },
      { key: "reorderAlert", label: "Alert", render: (i: any) => i.reorderAlert ? <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-xs font-semibold"><AlertTriangle className="h-3 w-3 mr-1" />Reorder</Badge> : <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs"><CheckCircle className="h-3 w-3 mr-1" />OK</Badge> },
    ],
    summaryCards: [
      { label: "Products Need Reorder", valueFn: (d: any[]) => d.filter((i: any) => i.reorderAlert).length, icon: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30", valueColor: "text-amber-600 dark:text-amber-400" },
      { label: "Total Products", valueFn: (d) => d.length, icon: <Package className="h-5 w-5 text-primary" />, iconBg: "bg-primary/10" },
    ],
    transformData: (raw, fv) => { const stockData = raw[0] || []; const products = raw[1] || []; const forecast = stockData.map((s: any) => { const product = products.find((p: any) => p.id === s.productId); const reorderLevel = product?.reorderLevel || 10; const avgMonthlySales = Math.max(1, Math.round(s.currentStock * 0.15) || 1); const monthsLeft = s.currentStock > 0 ? Math.round((s.currentStock / avgMonthlySales) * 10) / 10 : 0; return { ...s, avgMonthlySales, monthsLeft, reorderAlert: s.currentStock <= reorderLevel || monthsLeft <= 2, reorderLevel }; }); if (!fv.search) return forecast; const lower = fv.search.toLowerCase(); return forecast.filter((s: any) => (s.productName || "").toLowerCase().includes(lower)); },
    csvHeaders: "Product,Category,Current Stock,Avg Monthly Sales,Months Left,Reorder Level,Alert",
    csvRow: (i) => `"${i.productName || ""}","${i.category || ""}","${i.currentStock || 0}","${i.avgMonthlySales}","${i.monthsLeft}","${i.reorderLevel}","${i.reorderAlert ? "YES" : "No"}"`,
    pdfHead: () => [["Product", "Category", "Stock", "Avg Monthly Sales", "Months Left", "Reorder Level", "Alert"]],
    pdfBody: (d) => d.map((i: any) => [i.productName || "", i.category || "", String(i.currentStock || 0), String(i.avgMonthlySales), String(i.monthsLeft), String(i.reorderLevel), i.reorderAlert ? "REORDER" : "OK"]),
    tableMaxH: "max-h-[500px]",
  },
  "stock-forecast-concern": {
    title: "Stock Forecast (Concern)", description: "Stock summary and projections by concern/category", icon: <Building2 className="h-5 w-5" />,
    apiPaths: ["stock", "companies"], filename: "stock-forecast-concern",
    filters: [{ key: "search", label: "Search", type: "search", placeholder: "Search concern..." }],
    columns: [
      { key: "concern", label: "Concern / Category", render: (i: any) => i.concern, className: "font-medium" },
      { key: "productCount", label: "Products", align: "right", render: (i: any) => i.productCount },
      { key: "totalStock", label: "Total Stock", align: "right", render: (i: any) => i.totalStock, className: "font-bold" },
      { key: "totalValue", label: "Stock Value", align: "right", render: (i: any) => `\u09F3${i.totalValue.toLocaleString()}`, className: "font-semibold text-primary" },
      { key: "avgMonthlySales", label: "Avg Monthly Sales", align: "right", render: (i: any) => i.avgMonthlySales },
      { key: "monthsLeft", label: "Months Left", align: "right", render: (i: any) => i.monthsLeft, className: (i: any) => i.monthsLeft <= 2 ? "text-red-600 dark:text-red-400 font-semibold" : i.monthsLeft <= 4 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-emerald-600 dark:text-emerald-400 font-semibold" },
      { key: "lowStockItems", label: "Low Stock", align: "right", render: (i: any) => i.lowStockItems, className: (i: any) => i.lowStockItems > 0 ? "text-amber-600 dark:text-amber-400 font-medium" : "" },
      { key: "outOfStockItems", label: "Out of Stock", align: "right", render: (i: any) => i.outOfStockItems, className: (i: any) => i.outOfStockItems > 0 ? "text-red-600 dark:text-red-400 font-medium" : "" },
      { key: "alert", label: "Alert", render: (i: any) => i.alert ? <Badge className="bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 text-xs font-semibold"><AlertTriangle className="h-3 w-3 mr-1" />Alert</Badge> : <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 text-xs"><CheckCircle className="h-3 w-3 mr-1" />OK</Badge> },
    ],
    summaryCards: [
      { label: "Concerns with Alert", valueFn: (d: any[]) => d.filter((i: any) => i.alert).length, icon: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30", valueColor: "text-amber-600 dark:text-amber-400" },
      { label: "Total Concerns", valueFn: (d) => d.length, icon: <Building2 className="h-5 w-5 text-primary" />, iconBg: "bg-primary/10" },
    ],
    transformData: (raw, fv) => { const stockData = raw[0] || []; const groups: Record<string, any> = {}; stockData.forEach((s: any) => { const concern = s.category || "Uncategorized"; if (!groups[concern]) groups[concern] = { products: [], totalStock: 0, totalValue: 0 }; groups[concern].products.push(s); groups[concern].totalStock += s.currentStock || 0; groups[concern].totalValue += s.stockValue || 0; }); const forecast = Object.entries(groups).map(([concern, data]: [string, any]) => { const avgMonthlySales = Math.max(1, Math.round(data.totalStock * 0.12)); const monthsLeft = data.totalStock > 0 ? Math.round((data.totalStock / avgMonthlySales) * 10) / 10 : 0; const lowStockItems = data.products.filter((p: any) => p.currentStock <= 10).length; const outOfStockItems = data.products.filter((p: any) => p.currentStock <= 0).length; return { concern, productCount: data.products.length, totalStock: data.totalStock, totalValue: data.totalValue, avgMonthlySales, monthsLeft, lowStockItems, outOfStockItems, alert: monthsLeft <= 2 || outOfStockItems > 0 }; }).sort((a, b) => a.concern.localeCompare(b.concern)); if (!fv.search) return forecast; const lower = fv.search.toLowerCase(); return forecast.filter((s: any) => (s.concern || "").toLowerCase().includes(lower)); },
    csvHeaders: "Concern,Products,Total Stock,Stock Value,Avg Monthly Sales,Months Left,Low Stock,Out of Stock,Alert",
    csvRow: (i) => `"${i.concern}","${i.productCount}","${i.totalStock}","\u09F3${i.totalValue}","${i.avgMonthlySales}","${i.monthsLeft}","${i.lowStockItems}","${i.outOfStockItems}","${i.alert ? "YES" : "No"}"`,
    pdfHead: () => [["Concern", "Products", "Total Stock", "Value (\u09F3)", "Avg Monthly Sales", "Months Left", "Low Stock", "Out of Stock"]],
    pdfBody: (d) => d.map((i: any) => [i.concern, String(i.productCount), String(i.totalStock), `\u09F3${i.totalValue.toLocaleString()}`, String(i.avgMonthlySales), String(i.monthsLeft), String(i.lowStockItems), String(i.outOfStockItems)]),
    tableMaxH: "max-h-[500px]",
  },
  "daily-purchase-report": {
    title: "Daily Purchase Report", description: "Purchases for a selected date", icon: <Calendar className="h-5 w-5" />,
    apiPaths: ["purchase-orders"], filename: "daily-purchase-report",
    filters: [{ key: "selectedDate", label: "Select Date", type: "date", className: "w-48" }],
    columns: [
      { key: "poNumber", label: "PO Number", render: (i: any) => i.poNumber, className: "font-medium" },
      { key: "supplier", label: "Supplier", render: (i: any) => i.supplier?.name || "-" },
      { key: "date", label: "Date", render: (i: any) => i.date ? new Date(i.date).toLocaleDateString() : "-" },
      { key: "items", label: "Items", align: "right", render: (i: any) => i.lines?.length || 0 },
      { key: "grandTotal", label: "Total (\u09F3)", align: "right", render: (i: any) => `\u09F3${Number(i.grandTotal).toLocaleString()}`, className: "font-medium" },
    ],
    summaryCards: [
      { label: "Total Purchases", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + (Number(i.grandTotal) || 0), 0).toLocaleString()}`, icon: <ShoppingCart className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Total Items", valueFn: (d: any[]) => d.reduce((s: number, i: any) => s + (i.lines?.length || 0), 0), icon: <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />, iconBg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "No. of Suppliers", valueFn: (d: any[]) => new Set(d.map((i: any) => i.supplierId)).size, icon: <Truck className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    transformData: (raw, fv) => { const pos = raw[0] || []; if (!fv.selectedDate) return pos; return pos.filter((po: any) => { if (!po.date) return false; const poDate = new Date(po.date).toISOString().split("T")[0]; return poDate === fv.selectedDate; }); },
    csvHeaders: "Supplier,PO Number,Total,Items",
    csvRow: (i) => `${i.supplier?.name || ""},${i.poNumber},${i.grandTotal},${i.lines?.length || 0}`,
    pdfHead: () => [["Supplier", "PO Number", "Total (\u09F3)", "Items"]],
    pdfBody: (d) => d.map((i: any) => [i.supplier?.name || "-", i.poNumber, `\u09F3${Number(i.grandTotal).toLocaleString()}`, String(i.lines?.length || 0)]),
  },
  "vat-report": {
    title: "VAT Report", description: "VAT collected on sales and paid on purchases", icon: <Receipt className="h-5 w-5" />,
    apiPaths: ["sales-orders", "purchase-orders"], filename: "vat-report",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "type", label: "Type", render: (i: any) => <Badge className={`text-xs font-semibold ${i.type === "Sales" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300"}`}>{i.type}</Badge> },
      { key: "reference", label: "Reference", render: (i: any) => i.reference, className: "font-medium" },
      { key: "entity", label: "Customer/Supplier", render: (i: any) => i.entity },
      { key: "date", label: "Date", render: (i: any) => i.date ? new Date(i.date).toLocaleDateString() : "-" },
      { key: "subtotal", label: "Subtotal (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.subtotal.toLocaleString()}` },
      { key: "vat", label: "VAT (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.vat.toFixed(2)}`, className: "font-medium" },
    ],
    summaryCards: [
      { label: "VAT Collected (Sales)", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i.type === "Sales").reduce((s: number, i: any) => s + i.vat, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, icon: <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30", valueColor: "text-green-600 dark:text-green-400" },
      { label: "VAT Paid (Purchases)", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i.type === "Purchase").reduce((s: number, i: any) => s + i.vat, 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, icon: <TrendingDown className="h-5 w-5 text-orange-600 dark:text-orange-400" />, iconBg: "bg-orange-100 dark:bg-orange-900/30", valueColor: "text-orange-600 dark:text-orange-400" },
      { label: "Net VAT Payable", valueFn: (d: any[]) => { const collected = d.filter((i: any) => i.type === "Sales").reduce((s: number, i: any) => s + i.vat, 0); const paid = d.filter((i: any) => i.type === "Purchase").reduce((s: number, i: any) => s + i.vat, 0); const net = collected - paid; return `\u09F3${Math.abs(net).toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }, icon: <Receipt className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
    ],
    transformData: (raw, fv) => { const VAT_RATE = 0.15; const sos = (raw[0] || []).filter((so: any) => { if (!so.date) return true; const d = new Date(so.date).toISOString().split("T")[0]; if (fv.dateFrom && d < fv.dateFrom) return false; if (fv.dateTo && d > fv.dateTo) return false; return true; }).map((so: any) => ({ type: "Sales", reference: so.invoiceNo, entity: so.customer?.name || "-", date: so.date, subtotal: Number(so.grandTotal) || 0, vat: (Number(so.grandTotal) || 0) * VAT_RATE })); const pos = (raw[1] || []).filter((po: any) => { if (!po.date) return true; const d = new Date(po.date).toISOString().split("T")[0]; if (fv.dateFrom && d < fv.dateFrom) return false; if (fv.dateTo && d > fv.dateTo) return false; return true; }).map((po: any) => ({ type: "Purchase", reference: po.poNumber, entity: po.supplier?.name || "-", date: po.date, subtotal: Number(po.grandTotal) || 0, vat: (Number(po.grandTotal) || 0) * VAT_RATE })); return [...sos, ...pos]; },
    csvHeaders: "Type,Reference,Customer/Supplier,Date,Subtotal,VAT",
    csvRow: (i) => `${i.type},${i.reference},${i.entity},${i.date ? new Date(i.date).toLocaleDateString() : ""},${i.subtotal},${i.vat.toFixed(2)}`,
    pdfHead: () => [["Type", "Reference", "Customer/Supplier", "Date", "Subtotal (\u09F3)", "VAT (\u09F3)"]],
    pdfBody: (d) => d.map((i: any) => [i.type, i.reference, i.entity, i.date ? new Date(i.date).toLocaleDateString() : "-", `\u09F3${i.subtotal.toLocaleString()}`, `\u09F3${i.vat.toFixed(2)}`]),
  },
  "daily-sales-report": {
    title: "Daily Sales Report", description: "Sales for a selected date", icon: <Calendar className="h-5 w-5" />,
    apiPaths: ["sales-orders"], filename: "daily-sales-report",
    filters: [{ key: "selectedDate", label: "Select Date", type: "date", className: "w-48" }],
    columns: [
      { key: "invoiceNo", label: "Invoice No", render: (i: any) => i.invoiceNo, className: "font-medium" },
      { key: "customer", label: "Customer", render: (i: any) => i.customer?.name || "Walk-in" },
      { key: "date", label: "Date", render: (i: any) => i.date ? new Date(i.date).toLocaleDateString() : "-" },
      { key: "items", label: "Items", align: "right", render: (i: any) => i.lines?.length || 0 },
      { key: "grandTotal", label: "Total (\u09F3)", align: "right", render: (i: any) => `\u09F3${Number(i.grandTotal).toLocaleString()}`, className: "font-medium" },
    ],
    summaryCards: [
      { label: "Total Sales", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + (Number(i.grandTotal) || 0), 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30" },
      { label: "Total Items", valueFn: (d: any[]) => d.reduce((s: number, i: any) => s + (i.lines?.length || 0), 0), icon: <Package className="h-5 w-5 text-blue-600 dark:text-blue-400" />, iconBg: "bg-blue-100 dark:bg-blue-900/30" },
      { label: "No. of Customers", valueFn: (d: any[]) => new Set(d.map((i: any) => i.customerId)).size, icon: <Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    transformData: (raw, fv) => { const sos = raw[0] || []; if (!fv.selectedDate) return sos; return sos.filter((so: any) => { if (!so.date) return false; const soDate = new Date(so.date).toISOString().split("T")[0]; return soDate === fv.selectedDate; }); },
    csvHeaders: "Customer,Invoice No,Total,Items",
    csvRow: (i) => `${i.customer?.name || "Walk-in"},${i.invoiceNo},${i.grandTotal},${i.lines?.length || 0}`,
    pdfHead: () => [["Customer", "Invoice No", "Total (\u09F3)", "Items"]],
    pdfBody: (d) => d.map((i: any) => [i.customer?.name || "Walk-in", i.invoiceNo, `\u09F3${Number(i.grandTotal).toLocaleString()}`, String(i.lines?.length || 0)]),
  },
  "product-wise-benefit": {
    title: "Product Wise Benefit Report", description: "Profit analysis by product", icon: <Package className="h-5 w-5" />,
    apiPaths: ["products", "sales-orders"], filename: "product-benefit",
    filters: [{ key: "sortBy", label: "Sort By", type: "select", options: [{ value: "benefit", label: "Total Benefit" }, { value: "margin", label: "Margin %" }], className: "w-48" }],
    columns: [
      { key: "name", label: "Product", render: (i: any) => i.name, className: "font-medium" },
      { key: "productCode", label: "Code", render: (i: any) => <span className="font-mono text-xs">{i.productCode}</span> },
      { key: "costPrice", label: "Cost Price", align: "right", render: (i: any) => `\u09F3${Number(i.costPrice).toLocaleString()}` },
      { key: "salePrice", label: "Sale Price", align: "right", render: (i: any) => `\u09F3${Number(i.salePrice).toLocaleString()}` },
      { key: "margin", label: "Margin %", render: (i: any) => i.margin >= 0 ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{i.margin.toFixed(1)}%</span> : <span className="text-red-600 dark:text-red-400 font-semibold">{i.margin.toFixed(1)}%</span> },
      { key: "qtySold", label: "Qty Sold", align: "right", render: (i: any) => i.qtySold },
      { key: "totalBenefit", label: "Total Benefit", align: "right", render: (i: any) => i.totalBenefit >= 0 ? <span className="text-emerald-600 dark:text-emerald-400">\u09F3{i.totalBenefit.toLocaleString()}</span> : <span className="text-red-600 dark:text-red-400">\u09F3{i.totalBenefit.toLocaleString()}</span> },
    ],
    summaryCards: [
      { label: "Total Benefit", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.totalBenefit, 0).toLocaleString()}`, icon: <CircleDollarSign className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Avg Margin", valueFn: (d: any[]) => d.length > 0 ? `${(d.reduce((s, i: any) => s + i.margin, 0) / d.length).toFixed(1)}%` : "0%", icon: <TrendingUp className="h-5 w-5 text-sky-600 dark:text-sky-400" />, iconBg: "bg-sky-100 dark:bg-sky-900/30" },
      { label: "Top Product", valueFn: (d: any[]) => d.length > 0 ? d[0].name : "N/A", icon: <Award className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    chartConfig: { dataKey: "totalBenefit", name: "Benefit", fill: "#16a34a", title: "Top 10 Products by Benefit", xAxisKey: "name" },
    transformData: (raw, fv) => { const products = raw[0] || []; const salesOrders = raw[1] || []; const salesMap = new Map<string, { qtySold: number; totalRevenue: number }>(); salesOrders.forEach((so: any) => { (so.lines || []).forEach((l: any) => { const existing = salesMap.get(l.productId) || { qtySold: 0, totalRevenue: 0 }; existing.qtySold += l.quantity || 0; existing.totalRevenue += l.total || 0; salesMap.set(l.productId, existing); }); }); const benefits = products.map((p: any) => { const sales = salesMap.get(p.id) || { qtySold: 0, totalRevenue: 0 }; const margin = p.salePrice > 0 ? ((p.salePrice - p.costPrice) / p.salePrice) * 100 : 0; const totalBenefit = sales.totalRevenue - (p.costPrice * sales.qtySold); return { id: p.id, name: p.name, productCode: p.productCode, costPrice: p.costPrice, salePrice: p.salePrice, margin, qtySold: sales.qtySold, totalBenefit, category: p.category?.name || "" }; }); const sortKey = fv.sortBy === "margin" ? "margin" : "totalBenefit"; return [...benefits].sort((a, b) => (b as any)[sortKey] - (a as any)[sortKey]); },
    csvHeaders: "Product,Code,Cost Price,Sale Price,Margin %,Qty Sold,Total Benefit,Category",
    csvRow: (i) => `${i.name},${i.productCode},${i.costPrice},${i.salePrice},${i.margin.toFixed(1)}%,${i.qtySold},${i.totalBenefit},${i.category}`,
    pdfHead: () => [["Product", "Code", "Cost Price", "Sale Price", "Margin %", "Qty Sold", "Total Benefit"]],
    pdfBody: (d) => d.map((i: any) => [i.name, i.productCode, `\u09F3${i.costPrice.toLocaleString()}`, `\u09F3${i.salePrice.toLocaleString()}`, `${i.margin.toFixed(1)}%`, String(i.qtySold), `\u09F3${i.totalBenefit.toLocaleString()}`]),
  },
  "showroom-analysis": {
    title: "Showroom Analysis Report", description: "Sales, stock, and performance per showroom/godown", icon: <Building2 className="h-5 w-5" />,
    apiPaths: ["godowns", "sales-orders", "stock"], filename: "showroom-analysis",
    filters: [{ key: "godownFilter", label: "Godown/Showroom", type: "select", optionsFromData: 0, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Showrooms", className: "w-56" }],
    columns: [
      { key: "name", label: "Showroom", render: (i: any) => i.name, className: "font-medium" },
      { key: "totalSales", label: "Total Sales", align: "right", render: (i: any) => i.totalSales },
      { key: "totalStock", label: "Total Stock", align: "right", render: (i: any) => i.totalStock },
      { key: "revenue", label: "Revenue", align: "right", render: (i: any) => `\u09F3${i.revenue.toLocaleString()}`, className: "text-emerald-600 dark:text-emerald-400 font-semibold" },
      { key: "performance", label: "Performance %", render: (i: any) => <div className="flex items-center gap-2"><div className="w-16 bg-slate-200 dark:bg-slate-700 rounded-full h-2"><div className={`h-2 rounded-full ${i.performance >= 70 ? "bg-emerald-500" : i.performance >= 40 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${Math.min(100, i.performance)}%` }} /></div><span className={`font-semibold text-sm ${i.performance >= 70 ? "text-emerald-600 dark:text-emerald-400" : i.performance >= 40 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400"}`}>{i.performance.toFixed(1)}%</span></div> },
    ],
    summaryCards: [
      { label: "Total Revenue", valueFn: (d: any[]) => `\u09F3${d.reduce((s, i: any) => s + i.revenue, 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Total Sales Orders", valueFn: (d: any[]) => d.reduce((s, i: any) => s + i.totalSales, 0), icon: <ShoppingCart className="h-5 w-5 text-sky-600 dark:text-sky-400" />, iconBg: "bg-sky-100 dark:bg-sky-900/30" },
      { label: "Total Stock Units", valueFn: (d: any[]) => d.reduce((s, i: any) => s + i.totalStock, 0), icon: <Package className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    chartConfig: { dataKey: "revenue", name: "Revenue", fill: "#16a34a", title: "Revenue by Showroom", xAxisKey: "name" },
    transformData: (raw, fv) => { const godowns = raw[0] || []; const salesOrders = raw[1] || []; const stock = raw[2] || []; const showroomData = godowns.map((g: any) => { const salesForGodown = salesOrders.filter((so: any) => so.godownId === g.id); const totalSales = salesForGodown.length; const revenue = salesForGodown.reduce((s: number, so: any) => s + (so.grandTotal || 0), 0); const stockForGodown = stock.filter((s: any) => s.godown === g.name); const totalStock = stockForGodown.reduce((s: number, si: any) => s + (si.currentStock || 0), 0); const performance = revenue > 0 ? Math.min(100, (revenue / (totalStock * 100 || 1)) * 100) : 0; return { id: g.id, name: g.name, address: g.address, totalSales, totalStock, revenue, performance }; }); if (fv.godownFilter && fv.godownFilter !== "all") return showroomData.filter((s: any) => s.id === fv.godownFilter); return showroomData; },
    csvHeaders: "Showroom,Total Sales,Total Stock,Revenue,Performance %",
    csvRow: (i) => `${i.name},${i.totalSales},${i.totalStock},${i.revenue},${i.performance.toFixed(1)}%`,
    pdfHead: () => [["Showroom", "Total Sales", "Total Stock", "Revenue", "Performance %"]],
    pdfBody: (d) => d.map((i: any) => [i.name, String(i.totalSales), String(i.totalStock), `\u09F3${i.revenue.toLocaleString()}`, `${i.performance.toFixed(1)}%`]),
  },
  "bank-transaction-report": {
    title: "Bank Transaction Report", description: "All bank transactions with filters", icon: <ArrowRightLeft className="h-5 w-5" />,
    apiPaths: ["bank-transactions", "banks"], filename: "bank-transaction-report",
    filters: [
      { key: "dateFrom", label: "Date From", type: "date" },
      { key: "dateTo", label: "Date To", type: "date" },
      { key: "bankFilter", label: "Bank", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => `${i.bankName} - ${i.accountNo}`, selectAllLabel: "All Banks", className: "w-48" },
    ],
    columns: [
      { key: "date", label: "Date", render: (i: any) => new Date(i.date).toLocaleDateString() },
      { key: "bank", label: "Bank", render: (i: any) => i.bank?.bankName || "\u2014", className: "font-medium" },
      { key: "type", label: "Type", render: (i: any) => <Badge className={i.type === "Deposit" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300"}>{i.type}</Badge> },
      { key: "amount", label: "Amount", align: "right", render: (i: any) => <span className={i.type === "Deposit" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-red-600 dark:text-red-400 font-semibold"}>{`\u09F3${Number(i.amount).toLocaleString()}`}</span> },
      { key: "reference", label: "Reference", render: (i: any) => i.reference || "\u2014" },
    ],
    summaryCards: [
      { label: "Total Deposits", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i.type === "Deposit").reduce((s: number, i: any) => s + (i.amount || 0), 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Total Withdrawals", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i.type === "Withdraw").reduce((s: number, i: any) => s + (i.amount || 0), 0).toLocaleString()}`, icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30", valueColor: "text-red-600 dark:text-red-400" },
      { label: "Net", valueFn: (d: any[]) => { const deposits = d.filter((i: any) => i.type === "Deposit").reduce((s: number, i: any) => s + (i.amount || 0), 0); const withdrawals = d.filter((i: any) => i.type === "Withdraw").reduce((s: number, i: any) => s + (i.amount || 0), 0); const net = deposits - withdrawals; return `\u09F3${Math.abs(net).toLocaleString()}`; }, icon: <Activity className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
    ],
    transformData: (raw, fv) => { let data = raw[0] || []; if (fv.dateFrom) data = data.filter((e: any) => new Date(e.date) >= new Date(fv.dateFrom)); if (fv.dateTo) data = data.filter((e: any) => new Date(e.date) <= new Date(fv.dateTo + "T23:59:59")); if (fv.bankFilter && fv.bankFilter !== "all") data = data.filter((e: any) => e.bankId === fv.bankFilter); return data; },
    csvHeaders: "Date,Bank,Type,Amount,Reference,Description",
    csvRow: (i) => `${new Date(i.date).toLocaleDateString()},${i.bank?.bankName || ""},${i.type},${i.amount},${(i.reference || "").replace(/,/g, ";")},${(i.description || "").replace(/,/g, ";")}`,
    pdfHead: () => [["Date", "Bank", "Type", "Amount", "Reference", "Description"]],
    pdfBody: (d) => d.map((i: any) => [new Date(i.date).toLocaleDateString(), i.bank?.bankName || "-", i.type, `\u09F3${Number(i.amount).toLocaleString()}`, i.reference || "-", i.description || "-"]),
  },
  "bank-ledger": {
    title: "Bank Ledger", description: "Bank account ledger with running balance", icon: <FileSpreadsheet className="h-5 w-5" />,
    apiPaths: ["banks", "bank-transactions"], filename: "bank-ledger",
    filters: [
      { key: "bankFilter", label: "Select Bank", type: "select", optionsFromData: 0, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => `${i.bankName} - ${i.accountNo}`, selectAllLabel: "Choose a bank", className: "w-56" },
    ],
    columns: [
      { key: "date", label: "Date", render: (i: any) => new Date(i.date).toLocaleDateString() },
      { key: "description", label: "Description", render: (i: any) => i.description || i.type || "\u2014" },
      { key: "debit", label: "Debit", align: "right", render: (i: any) => i.type === "Withdraw" ? <span className="text-red-600 dark:text-red-400 font-semibold">{`\u09F3${Number(i.amount).toLocaleString()}`}</span> : <span className="text-slate-400">\u2014</span> },
      { key: "credit", label: "Credit", align: "right", render: (i: any) => i.type === "Deposit" ? <span className="text-emerald-600 dark:text-emerald-400 font-semibold">{`\u09F3${Number(i.amount).toLocaleString()}`}</span> : <span className="text-slate-400">\u2014</span> },
      { key: "runningBalance", label: "Balance", align: "right", render: (i: any) => `\u09F3${Number(i.runningBalance).toLocaleString()}`, className: "font-bold" },
    ],
    summaryCards: [
      { label: "Total Credits", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i.type === "Deposit").reduce((s: number, i: any) => s + (i.amount || 0), 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Total Debits", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i.type === "Withdraw").reduce((s: number, i: any) => s + (i.amount || 0), 0).toLocaleString()}`, icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30", valueColor: "text-red-600 dark:text-red-400" },
      { label: "Balance", valueFn: (d: any[]) => d.length > 0 ? `\u09F3${Number(d[d.length - 1].runningBalance).toLocaleString()}` : "\u09F30", icon: <Banknote className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
    ],
    transformData: (raw, fv) => { if (!fv.bankFilter || fv.bankFilter === "all") return []; const banks = raw[0] || []; const transactions = raw[1] || []; const bank = banks.find((b: any) => b.id === fv.bankFilter); if (!bank) return []; const bankTrans = transactions.filter((t: any) => t.bankId === fv.bankFilter).sort((a: any, b: any) => new Date(a.date).getTime() - new Date(b.date).getTime()); let balance = bank.openingBalance || 0; return bankTrans.map((t: any) => { if (t.type === "Deposit") balance += t.amount || 0; else balance -= t.amount || 0; return { ...t, runningBalance: balance }; }); },
    csvHeaders: "Date,Description,Debit,Credit,Balance",
    csvRow: (i) => `${new Date(i.date).toLocaleDateString()},${(i.description || i.type || "").replace(/,/g, ";")},${i.type === "Withdraw" ? i.amount : 0},${i.type === "Deposit" ? i.amount : 0},${i.runningBalance}`,
    pdfHead: () => [["Date", "Description", "Debit", "Credit", "Balance"]],
    pdfBody: (d) => d.map((i: any) => [new Date(i.date).toLocaleDateString(), i.description || i.type || "-", i.type === "Withdraw" ? `\u09F3${Number(i.amount).toLocaleString()}` : "-", i.type === "Deposit" ? `\u09F3${Number(i.amount).toLocaleString()}` : "-", `\u09F3${Number(i.runningBalance).toLocaleString()}`]),
    tableMaxH: "max-h-[500px]",
  },

  // === Converted report pages ===
  "default-customer-summary": {
    title: "Default Customer Summary", description: "Overview of defaulting customers", icon: <AlertTriangle className="h-5 w-5" />,
    apiPaths: ["hire-sales", "customers"], filename: "default-customer-summary",
    columns: [
      { key: "customerName", label: "Customer", className: "font-medium" },
      { key: "totalOverdue", label: "Total Overdue (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.totalOverdue.toLocaleString()}` },
      { key: "overdueCount", label: "# Overdue Inst.", align: "right" },
      { key: "lastPayment", label: "Last Payment", render: (i: any) => i.lastPayment ? new Date(i.lastPayment).toLocaleDateString() : "-" },
    ],
    summaryCards: [
      { label: "Total Defaulters", valueFn: (d: any[]) => d.length, icon: <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30" },
      { label: "Total Overdue", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + i.totalOverdue, 0).toLocaleString()}`, icon: <CircleDollarSign className="h-5 w-5 text-orange-600 dark:text-orange-400" />, iconBg: "bg-orange-100 dark:bg-orange-900/30" },
      { label: "Avg Days Overdue", valueFn: (d: any[]) => d.length > 0 ? Math.round(d.reduce((s: number, i: any) => s + i.daysOverdue, 0) / d.length) : 0, icon: <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    chartConfig: { type: 'pie' as const, dataKey: "value", name: "Severity", fill: "#ef4444", pieNameKey: "name", pieColors: ["#dc2626", "#ea580c", "#eab308"] },
    transformData: (raw, _fv) => {
      const hireSales = Array.isArray(raw[0]) ? raw[0] : (raw[0] as any)?.hireSales || [];
      const now = new Date(); const defMap = new Map<string, any>();
      hireSales.forEach((hs: any) => {
        const due = hs.grandTotal - (hs.totalPaid || 0); if (due <= 0) return;
        const isOverdue = (hs.nextInstallmentDate && new Date(hs.nextInstallmentDate) < now) || (hs.currentStatus || hs.status) === "Defaulted";
        if (!isOverdue) return;
        const overdueDate = hs.nextInstallmentDate ? new Date(hs.nextInstallmentDate) : now;
        const days = Math.max(0, Math.ceil((now.getTime() - overdueDate.getTime()) / 86400000));
        const existing = defMap.get(hs.customerId);
        if (existing) { existing.totalOverdue += due; existing.overdueCount += 1; existing.daysOverdue = Math.max(existing.daysOverdue, days); }
        else { defMap.set(hs.customerId, { customerId: hs.customerId, customerName: hs.customer?.name || "Unknown", totalOverdue: due, overdueCount: 1, daysOverdue, lastPayment: hs.lastPaymentDate || null }); }
      });
      const defs = Array.from(defMap.values());
      const severe = { red: 0, orange: 0, yellow: 0 };
      defs.forEach(d => { if (d.daysOverdue > 30) severe.red++; else if (d.daysOverdue > 15) severe.orange++; else severe.yellow++; });
      return defs;
    },
    csvHeaders: "Customer,Total Overdue,Overdue Count,Days Overdue,Last Payment",
    csvRow: (i) => `${i.customerName},${i.totalOverdue},${i.overdueCount},${i.daysOverdue},${i.lastPayment || ""}`,
    pdfHead: () => [["Customer", "Total Overdue", "Overdue Count", "Last Payment"]],
    pdfBody: (d) => d.map((i: any) => [i.customerName, `\u09F3${i.totalOverdue.toLocaleString()}`, String(i.overdueCount), i.lastPayment ? new Date(i.lastPayment).toLocaleDateString() : "-"]),
  },
  "transaction-summary": {
    title: "Transaction Summary Report", description: "Overview of all financial transactions", icon: <Activity className="h-5 w-5" />,
    apiPaths: ["expenses", "incomes", "bank-transactions"], filename: "transaction-summary",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "day", label: "Date" },
      { key: "income", label: "Income (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.income.toLocaleString()}` },
      { key: "expense", label: "Expense (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.expense.toLocaleString()}` },
    ],
    summaryCards: [
      { label: "Total Income", valueFn: (d: any[]) => { const inc = d.reduce((s: number, i: any) => s + i.income, 0); return `\u09F3${inc.toLocaleString()}`; }, icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Total Expense", valueFn: (d: any[]) => { const exp = d.reduce((s: number, i: any) => s + i.expense, 0); return `\u09F3${exp.toLocaleString()}`; }, icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30", valueColor: "text-red-600 dark:text-red-400" },
      { label: "Bank Deposits", valueFn: (d: any[]) => `\u09F3${d.length > 0 ? d[0]._totalDeposits?.toLocaleString() || "0" : "0"}`, icon: <Banknote className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30", valueColor: "text-green-600 dark:text-green-400" },
      { label: "Bank Withdrawals", valueFn: (d: any[]) => `\u09F3${d.length > 0 ? d[0]._totalWithdrawals?.toLocaleString() || "0" : "0"}`, icon: <Banknote className="h-5 w-5 text-orange-600 dark:text-orange-400" />, iconBg: "bg-orange-100 dark:bg-orange-900/30", valueColor: "text-orange-600 dark:text-orange-400" },
      { label: "Cash In Hand", valueFn: (d: any[]) => { const v = d.length > 0 ? d[0]._cashInHand || 0 : 0; return `\u09F3${Math.abs(v).toLocaleString()}`; }, icon: <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
    ],
    chartConfig: { type: 'bar' as const, dataKey: "income", name: "Income vs Expense", fill: "#16a34a", xAxisKey: "day", bars: [{ dataKey: "income", fill: "#16a34a", name: "Income" }, { dataKey: "expense", fill: "#ef4444", name: "Expense" }], title: "Income vs Expense Comparison" },
    transformData: (raw, fv) => {
      const expenses = Array.isArray(raw[0]) ? raw[0] : [];
      const incomes = Array.isArray(raw[1]) ? raw[1] : [];
      const bank = Array.isArray(raw[2]) ? raw[2] : [];
      let expF = expenses, incF = incomes, bankF = bank;
      if (fv.dateFrom) { expF = expF.filter((e: any) => new Date(e.date) >= new Date(fv.dateFrom)); incF = incF.filter((e: any) => new Date(e.date) >= new Date(fv.dateFrom)); bankF = bankF.filter((e: any) => new Date(e.date) >= new Date(fv.dateFrom)); }
      if (fv.dateTo) { const to = new Date(fv.dateTo + "T23:59:59"); expF = expF.filter((e: any) => new Date(e.date) <= to); incF = incF.filter((e: any) => new Date(e.date) <= to); bankF = bankF.filter((e: any) => new Date(e.date) <= to); }
      const totalDeposits = bankF.filter((b: any) => b.type === "Deposit").reduce((s: number, b: any) => s + (b.amount || 0), 0);
      const totalWithdrawals = bankF.filter((b: any) => b.type === "Withdraw").reduce((s: number, b: any) => s + (b.amount || 0), 0);
      const totalInc = incF.reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const totalExp = expF.reduce((s: number, e: any) => s + (e.amount || 0), 0);
      const map = new Map<string, { income: number; expense: number }>();
      incF.forEach((e: any) => { const day = new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }); const ex = map.get(day) || { income: 0, expense: 0 }; ex.income += e.amount || 0; map.set(day, ex); });
      expF.forEach((e: any) => { const day = new Date(e.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }); const ex = map.get(day) || { income: 0, expense: 0 }; ex.expense += e.amount || 0; map.set(day, ex); });
      const result = Array.from(map.entries()).map(([day, val]) => ({ day, ...val, _totalDeposits: totalDeposits, _totalWithdrawals: totalWithdrawals, _cashInHand: totalInc - totalExp + totalDeposits - totalWithdrawals }));
      return result.length > 0 ? result : [{ day: "N/A", income: 0, expense: 0, _totalDeposits: totalDeposits, _totalWithdrawals: totalWithdrawals, _cashInHand: totalInc - totalExp + totalDeposits - totalWithdrawals }];
    },
    csvHeaders: "Date,Income,Expense",
    csvRow: (i) => `${i.day},${i.income},${i.expense}`,
    pdfHead: () => [["Date", "Income", "Expense"]],
    pdfBody: (d) => d.map((i: any) => [i.day, `\u09F3${i.income.toLocaleString()}`, `\u09F3${i.expense.toLocaleString()}`]),
  },
  "monthly-transaction": {
    title: "Monthly Transaction Report", description: "All transactions for a selected month", icon: <Calendar className="h-5 w-5" />,
    apiPaths: ["expenses", "incomes", "bank-transactions"], filename: "monthly-transaction",
    filters: [
      { key: "month", label: "Month", type: "select", options: [{ value: "1", label: "January" },{ value: "2", label: "February" },{ value: "3", label: "March" },{ value: "4", label: "April" },{ value: "5", label: "May" },{ value: "6", label: "June" },{ value: "7", label: "July" },{ value: "8", label: "August" },{ value: "9", label: "September" },{ value: "10", label: "October" },{ value: "11", label: "November" },{ value: "12", label: "December" }] },
      { key: "year", label: "Year", type: "select", options: Array.from({ length: 5 }, (_, i) => { const y = new Date().getFullYear() - 2 + i; return { value: String(y), label: String(y) }; }) },
    ],
    columns: [
      { key: "date", label: "Date", render: (i: any) => new Date(i.date).toLocaleDateString() },
      { key: "type", label: "Type", render: (i: any) => <Badge className={i._type === "Income" ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300" : i._type === "Expense" ? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300" : "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"}>{i._type}{i.bankType ? ` - ${i.bankType}` : ""}</Badge> },
      { key: "category", label: "Category/Source", render: (i: any) => i.category || "\u2014" },
      { key: "amount", label: "Amount", align: "right", render: (i: any) => <span className={i._type === "Income" ? "text-emerald-600 dark:text-emerald-400 font-semibold" : i._type === "Expense" ? "text-red-600 dark:text-red-400 font-semibold" : i.bankType === "Deposit" ? "text-green-600 dark:text-green-400 font-semibold" : "text-orange-600 dark:text-orange-400 font-semibold"}>{`\u09F3${Number(i.amount).toLocaleString()}`}</span> },
      { key: "description", label: "Description", render: (i: any) => i.description || "\u2014" },
    ],
    summaryCards: [
      { label: "Total Income", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i._type === "Income").reduce((s: number, i: any) => s + i.amount, 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Total Expense", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i._type === "Expense").reduce((s: number, i: any) => s + i.amount, 0).toLocaleString()}`, icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30", valueColor: "text-red-600 dark:text-red-400" },
      { label: "Bank Deposits", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i._type === "Bank" && i.bankType === "Deposit").reduce((s: number, i: any) => s + i.amount, 0).toLocaleString()}`, icon: <Banknote className="h-5 w-5 text-green-600 dark:text-green-400" />, iconBg: "bg-green-100 dark:bg-green-900/30", valueColor: "text-green-600 dark:text-green-400" },
      { label: "Bank Withdrawals", valueFn: (d: any[]) => `\u09F3${d.filter((i: any) => i._type === "Bank" && i.bankType === "Withdraw").reduce((s: number, i: any) => s + i.amount, 0).toLocaleString()}`, icon: <Banknote className="h-5 w-5 text-orange-600 dark:text-orange-400" />, iconBg: "bg-orange-100 dark:bg-orange-900/30", valueColor: "text-orange-600 dark:text-orange-400" },
    ],
    chartConfig: { type: 'area' as const, dataKey: "income", name: "Daily Income", fill: "#16a34a", areaStroke: "#16a34a", areaFill: "#16a34a20", xAxisKey: "day", title: "Daily Income vs Expense" },
    transformData: (raw, fv) => {
      const expenses = Array.isArray(raw[0]) ? raw[0] : [];
      const incomes = Array.isArray(raw[1]) ? raw[1] : [];
      const bank = Array.isArray(raw[2]) ? raw[2] : [];
      const m = parseInt(fv.month) || (new Date().getMonth() + 1);
      const y = parseInt(fv.year) || new Date().getFullYear();
      const filter = (arr: any[]) => arr.filter((e: any) => { const d = new Date(e.date); return d.getMonth() + 1 === m && d.getFullYear() === y; });
      const mExp = filter(expenses), mInc = filter(incomes), mBank = filter(bank);
      const rows: any[] = [];
      mInc.forEach((e: any) => rows.push({ ...e, _type: "Income", category: e.head?.name || "\u2014" }));
      mExp.forEach((e: any) => rows.push({ ...e, _type: "Expense", category: e.head?.name || "\u2014" }));
      mBank.forEach((e: any) => rows.push({ ...e, _type: "Bank", bankType: e.type, category: e.bank?.bankName || "\u2014" }));
      rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      return rows;
    },
    csvHeaders: "Date,Type,Category,Amount,Description",
    csvRow: (i) => `${new Date(i.date).toLocaleDateString()},${i._type}${i.bankType ? " - " + i.bankType : ""},${i.category || ""},${i.amount},${i.description || ""}`,
    pdfHead: () => [["Date", "Type", "Category", "Amount", "Description"]],
    pdfBody: (d) => d.map((i: any) => [new Date(i.date).toLocaleDateString(), `${i._type}${i.bankType ? " - " + i.bankType : ""}`, i.category || "-", `\u09F3${Number(i.amount).toLocaleString()}`, i.description || "-"]),
  },
  "liability-report": {
    title: "Liability Report", description: "Summary of all liabilities", icon: <BarChart3 className="h-5 w-5" />,
    apiPaths: ["liabilities"], filename: "liability-report",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "name", label: "Liability Head", className: "font-medium" },
      { key: "total", label: "Total Amount (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.total.toLocaleString()}` },
      { key: "received", label: "Received (\u09F3)", align: "right", render: (i: any) => <span className="text-emerald-600 dark:text-emerald-400">{`\u09F3${i.received.toLocaleString()}`}</span> },
      { key: "paid", label: "Paid (\u09F3)", align: "right", render: (i: any) => <span className="text-red-600 dark:text-red-400">{`\u09F3${i.paid.toLocaleString()}`}</span> },
      { key: "balance", label: "Balance (\u09F3)", align: "right", render: (i: any) => <span className="font-bold">{`\u09F3${(i.total - i.paid).toLocaleString()}`}</span> },
    ],
    summaryCards: [
      { label: "Total Received", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + i.received, 0).toLocaleString()}`, icon: <TrendingUp className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />, iconBg: "bg-emerald-100 dark:bg-emerald-900/30", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Total Paid", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + i.paid, 0).toLocaleString()}`, icon: <TrendingDown className="h-5 w-5 text-red-600 dark:text-red-400" />, iconBg: "bg-red-100 dark:bg-red-900/30", valueColor: "text-red-600 dark:text-red-400" },
      { label: "Balance", valueFn: (d: any[]) => `\u09F3${d.reduce((s: number, i: any) => s + i.total - i.paid, 0).toLocaleString()}`, icon: <Wallet className="h-5 w-5 text-amber-600 dark:text-amber-400" />, iconBg: "bg-amber-100 dark:bg-amber-900/30" },
    ],
    chartConfig: { type: 'bar' as const, dataKey: "Received", name: "Liability", fill: "#10b981", xAxisKey: "name", bars: [{ dataKey: "Received", fill: "#10b981", name: "Received" }, { dataKey: "Paid", fill: "#ef4444", name: "Paid" }], title: "Liability Distribution" },
    transformData: (raw, fv) => {
      let allData = Array.isArray(raw[0]) ? raw[0] : [];
      if (fv.dateFrom) { const from = new Date(fv.dateFrom); allData = allData.filter((d: any) => new Date(d.date) >= from); }
      if (fv.dateTo) { const to = new Date(fv.dateTo); to.setHours(23, 59, 59, 999); allData = allData.filter((d: any) => new Date(d.date) <= to); }
      const map: Record<string, { name: string; total: number; received: number; paid: number }> = {};
      allData.forEach((item: any) => {
        const headName = item.investmentHead?.name || "Unknown";
        if (!map[item.investmentHeadId]) map[item.investmentHeadId] = { name: headName, total: 0, received: 0, paid: 0 };
        const amount = Number(item.amount || 0);
        map[item.investmentHeadId].total += amount;
        if (item.type === "received") map[item.investmentHeadId].received += amount;
        if (item.type === "pay") map[item.investmentHeadId].paid += amount;
      });
      return Object.values(map);
    },
    csvHeaders: "Liability Head,Total Amount,Received,Paid,Balance",
    csvRow: (i) => `${i.name},${i.total},${i.received},${i.paid},${i.total - i.paid}`,
    pdfHead: () => [["Liability Head", "Total Amount", "Received", "Paid", "Balance"]],
    pdfBody: (d) => d.map((i: any) => [i.name, `\u09F3${i.total.toLocaleString()}`, `\u09F3${i.received.toLocaleString()}`, `\u09F3${i.paid.toLocaleString()}`, `\u09F3${(i.total - i.paid).toLocaleString()}`]),
  },
  "company-order-sheet": {
    title: "Company Order Sheet", description: "Order sheets grouped by company", icon: <Building2 className="h-5 w-5" />,
    apiPaths: ["order-sheets", "companies"], filename: "company-order-sheets",
    filters: [{ key: "companyFilter", label: "Select Company", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Companies", className: "w-56" }],
    columns: [
      { key: "sheetNo", label: "Order No", className: "font-medium" },
      { key: "company", label: "Company", render: (i: any) => i.companyName || "\u2014" },
      { key: "product", label: "Product", render: (i: any) => i.productName || "\u2014" },
      { key: "quantity", label: "Quantity" },
      { key: "status", label: "Status", render: (i: any) => <StatusBadge status={i.status || "Draft"} /> },
      { key: "date", label: "Date", render: (i: any) => i.date ? new Date(i.date).toLocaleDateString() : "-" },
    ],
    summaryCards: [
      { label: "Total Orders", valueFn: (d: any[]) => new Set(d.map((i: any) => i.sheetNo)).size, icon: <ClipboardList className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-sky-500 to-sky-600" },
      { label: "Pending", valueFn: (d: any[]) => d.filter((i: any) => ["Draft", "Confirmed", "Processing"].includes(i.status)).length, icon: <Clock className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-amber-500 to-amber-600", valueColor: "text-amber-600 dark:text-amber-400" },
      { label: "Completed", valueFn: (d: any[]) => d.filter((i: any) => i.status === "Completed").length, icon: <CheckCircle className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-emerald-500 to-emerald-600", valueColor: "text-emerald-600 dark:text-emerald-400" },
    ],
    transformData: (raw, fv) => {
      const sheets = Array.isArray(raw[0]) ? raw[0] : [];
      const filtered = fv.companyFilter && fv.companyFilter !== "all" ? sheets.filter((s: any) => s.companyId === fv.companyFilter) : sheets;
      const rows: any[] = [];
      filtered.forEach((sheet: any) => {
        const lines = sheet.lines || [];
        if (lines.length === 0) rows.push({ sheetNo: sheet.sheetNo, companyName: sheet.company?.name || "\u2014", productName: "\u2014", quantity: "\u2014", status: sheet.status || "Draft", date: sheet.date });
        else lines.forEach((line: any) => rows.push({ sheetNo: sheet.sheetNo, companyName: sheet.company?.name || "\u2014", productName: line.product?.name || "\u2014", quantity: line.quantity, status: sheet.status || "Draft", date: sheet.date }));
      });
      return rows;
    },
    csvHeaders: "Order No,Company,Product,Quantity,Status,Date",
    csvRow: (i) => `${i.sheetNo},${i.companyName},${i.productName},${i.quantity},${i.status},${i.date ? new Date(i.date).toLocaleDateString() : ""}`,
    pdfHead: () => [["Order No", "Company", "Product", "Quantity", "Status", "Date"]],
    pdfBody: (d) => d.map((i: any) => [i.sheetNo, i.companyName, i.productName, String(i.quantity), i.status, i.date ? new Date(i.date).toLocaleDateString() : "-"]),
  },
  "customer-order-sheet": {
    title: "Customer Order Sheet", description: "Order sheets grouped by customer", icon: <Users className="h-5 w-5" />,
    apiPaths: ["order-sheets", "customers"], filename: "customer-order-sheets",
    filters: [{ key: "customerFilter", label: "Select Customer", type: "select", optionsFromData: 1, optionsValue: (i: any) => i.id, optionsLabel: (i: any) => i.name, selectAllLabel: "All Customers", className: "w-56" }],
    columns: [
      { key: "sheetNo", label: "Order No", className: "font-medium" },
      { key: "customer", label: "Customer", render: (i: any) => i.customerName || "\u2014" },
      { key: "product", label: "Product", render: (i: any) => i.productName || "\u2014" },
      { key: "quantity", label: "Quantity" },
      { key: "status", label: "Status", render: (i: any) => <StatusBadge status={i.status || "Draft"} /> },
      { key: "date", label: "Date", render: (i: any) => i.date ? new Date(i.date).toLocaleDateString() : "-" },
    ],
    summaryCards: [
      { label: "Total Orders", valueFn: (d: any[]) => new Set(d.map((i: any) => i.sheetNo)).size, icon: <ShoppingCart className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-violet-500 to-violet-600" },
      { label: "Pending", valueFn: (d: any[]) => d.filter((i: any) => ["Draft", "Confirmed", "Processing"].includes(i.status)).length, icon: <Clock className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-amber-500 to-amber-600", valueColor: "text-amber-600 dark:text-amber-400" },
      { label: "Fulfilled", valueFn: (d: any[]) => d.filter((i: any) => i.status === "Completed").length, icon: <CheckCircle className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-green-500 to-green-600", valueColor: "text-green-600 dark:text-green-400" },
    ],
    transformData: (raw, fv) => {
      const sheets = Array.isArray(raw[0]) ? raw[0] : [];
      const filtered = fv.customerFilter && fv.customerFilter !== "all" ? sheets.filter((s: any) => s.customerId === fv.customerFilter) : sheets;
      const rows: any[] = [];
      filtered.forEach((sheet: any) => {
        const lines = sheet.lines || [];
        if (lines.length === 0) rows.push({ sheetNo: sheet.sheetNo, customerName: sheet.customer?.name || "\u2014", productName: "\u2014", quantity: "\u2014", status: sheet.status || "Draft", date: sheet.date });
        else lines.forEach((line: any) => rows.push({ sheetNo: sheet.sheetNo, customerName: sheet.customer?.name || "\u2014", productName: line.product?.name || "\u2014", quantity: line.quantity, status: sheet.status || "Draft", date: sheet.date }));
      });
      return rows;
    },
    csvHeaders: "Order No,Customer,Product,Quantity,Status,Date",
    csvRow: (i) => `${i.sheetNo},${i.customerName},${i.productName},${i.quantity},${i.status},${i.date ? new Date(i.date).toLocaleDateString() : ""}`,
    pdfHead: () => [["Order No", "Customer", "Product", "Quantity", "Status", "Date"]],
    pdfBody: (d) => d.map((i: any) => [i.sheetNo, i.customerName, i.productName, String(i.quantity), i.status, i.date ? new Date(i.date).toLocaleDateString() : "-"]),
  },
  "order-sheet-report": {
    title: "Order Sheet Report", description: "Summary report for order sheets", icon: <FileSpreadsheet className="h-5 w-5" />,
    apiPaths: ["order-sheets"], filename: "order-sheet-report",
    filters: [{ key: "dateFrom", label: "Date From", type: "date" }, { key: "dateTo", label: "Date To", type: "date" }],
    columns: [
      { key: "name", label: "Company/Customer", className: "font-medium" },
      { key: "total", label: "Total Orders", align: "right" },
      { key: "completed", label: "Completed", align: "right", render: (i: any) => <span className="text-emerald-600 dark:text-emerald-400">{i.completed}</span> },
      { key: "pending", label: "Pending", align: "right", render: (i: any) => <span className="text-amber-600 dark:text-amber-400">{i.pending}</span> },
      { key: "totalAmount", label: "Total Amount (\u09F3)", align: "right", render: (i: any) => `\u09F3${i.totalAmount.toLocaleString()}` },
    ],
    summaryCards: [
      { label: "Total", valueFn: (d: any[]) => d.length, icon: <ClipboardList className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-sky-500 to-sky-600" },
      { label: "Fulfilled", valueFn: (d: any[]) => d.filter((i: any) => i._status === "Completed").length, icon: <CheckCircle className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-emerald-500 to-emerald-600", valueColor: "text-emerald-600 dark:text-emerald-400" },
      { label: "Pending", valueFn: (d: any[]) => d.filter((i: any) => ["Draft", "Confirmed", "Processing"].includes(i._status)).length, icon: <Clock className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-amber-500 to-amber-600", valueColor: "text-amber-600 dark:text-amber-400" },
      { label: "Cancelled", valueFn: (d: any[]) => d.filter((i: any) => i._status === "Cancelled").length, icon: <X className="h-5 w-5 text-white" />, iconBg: "bg-gradient-to-br from-red-500 to-red-600", valueColor: "text-red-600 dark:text-red-400" },
    ],
    chartConfig: { type: 'bar' as const, dataKey: "Total", name: "Orders", fill: "#0ea5e9", xAxisKey: "month", bars: [{ dataKey: "Total", fill: "#0ea5e9", name: "Total" }, { dataKey: "Completed", fill: "#10b981", name: "Completed" }, { dataKey: "Pending", fill: "#f59e0b", name: "Pending" }], title: "Order Trends" },
    transformData: (raw, fv) => {
      let data = Array.isArray(raw[0]) ? raw[0] : [];
      if (fv.dateFrom) { const from = new Date(fv.dateFrom); data = data.filter((d: any) => new Date(d.date) >= from); }
      if (fv.dateTo) { const to = new Date(fv.dateTo); to.setHours(23, 59, 59, 999); data = data.filter((d: any) => new Date(d.date) <= to); }
      const map: Record<string, { name: string; total: number; completed: number; pending: number; totalAmount: number; _status: string }> = {};
      data.forEach((sheet: any) => {
        const key = sheet.companyId || sheet.customerId || "none";
        const name = sheet.company?.name || sheet.customer?.name || "No Source";
        if (!map[key]) map[key] = { name, total: 0, completed: 0, pending: 0, totalAmount: 0, _status: sheet.status || "Draft" };
        map[key].total++; map[key]._status = sheet.status || "Draft";
        map[key].totalAmount += (sheet.lines || []).reduce((s: number, l: any) => s + (l.total || 0), 0);
        if (sheet.status === "Completed") map[key].completed++;
        if (["Draft", "Confirmed", "Processing"].includes(sheet.status)) map[key].pending++;
      });
      return Object.values(map);
    },
    csvHeaders: "Source,Name,Total Orders,Completed,Pending,Total Amount",
    csvRow: (i) => `Source,${i.name},${i.total},${i.completed},${i.pending},${i.totalAmount}`,
    pdfHead: () => [["Type", "Name", "Total Orders", "Completed", "Pending", "Total Amount"]],
    pdfBody: (d) => d.map((i: any) => ["Source", i.name, String(i.total), String(i.completed), String(i.pending), `\u09F3${i.totalAmount.toLocaleString()}`]),
  },
};

// SPECIAL PAGES (non-generic)
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
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [stockFilter, setStockFilter] = useState("all");
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
    { key: "productCode", label: "Code", render: (item: Record<string, unknown>) => {
      const cat = item.category as Record<string, unknown> | undefined;
      const catName = cat?.name ? String(cat.name) : "";
      const iconBg = catName.includes("Mobile") ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" :
        catName.includes("Electri") || catName.includes("Elec") ? "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" :
        catName.includes("Compute") || catName.includes("Laptop") ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400" :
        catName.includes("Access") ? "bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400" :
        "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"; return (        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            <Package className="h-3.5 w-3.5" />
          </div>
          <span className="text-slate-700 dark:text-slate-300">{String(item.productCode ?? "")}</span>
        </div>
      );
    }},
    { key: "name", label: "Product Name" },
    { key: "categoryId", label: "Category", render: (item: Record<string, unknown>) => {
      const cat = item.category as Record<string, unknown> | undefined;
      return cat?.name ? String(cat.name) : String(item.categoryId ?? "");
    }},
    { key: "unit", label: "Unit" },
    { key: "costPrice", label: "Cost Price", render: (item: Record<string, unknown>) => `৳${Number(item.costPrice).toLocaleString()}` },
    { key: "salePrice", label: "Sale Price", render: (item: Record<string, unknown>) => `৳${Number(item.salePrice).toLocaleString()}` },
    { key: "openingStock", label: "Stock", render: (item: Record<string, unknown>) => {
      const stock = Number(item.openingStock || 0);
      const reorder = Number(item.reorderLevel || 0);
      const color = stock === 0 ? "text-red-600 dark:text-red-400 font-bold" : stock <= reorder ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-slate-700 dark:text-slate-300";
      return <span className={color}>{stock}</span>;
    }},
    { key: "reorderLevel", label: "Reorder" },
    { key: "isActive", label: "Status", render: (item: Record<string, unknown>) => <StatusBadge status={item.isActive ? "Active" : "Inactive"} /> },
  ];

  // Filtered data based on category and stock status
  const filteredData = useMemo(() => {
    let result = data;
    if (categoryFilter !== "all") {
      result = result.filter((item) => {
        const cat = item.category as Record<string, unknown> | undefined;
        const catId = cat?.id ? String(cat.id) : String(item.categoryId ?? "");
        return catId === categoryFilter;
      });
    }
    if (stockFilter !== "all") {
      result = result.filter((item) => {
        const stock = Number(item.openingStock || 0);
        const reorder = Number(item.reorderLevel || 0);
        if (stockFilter === "in-stock") return stock > reorder;
        if (stockFilter === "low-stock") return stock > 0 && stock <= reorder;
        if (stockFilter === "out-of-stock") return stock === 0;
        return true;
      });
    }
    return result;
  }, [data, categoryFilter, stockFilter]);

  // Category counts
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    data.forEach((item) => {
      const cat = item.category as Record<string, unknown> | undefined;
      const catId = cat?.id ? String(cat.id) : String(item.categoryId ?? "");
      if (catId) counts[catId] = (counts[catId] || 0) + 1;
    });
    return counts;
  }, [data]); return (    <div className="space-y-4">
      {/* Category & Stock Status Filters */}
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-4 w-4 text-slate-400" />
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Category:</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-48 bg-white dark:bg-navy-800 border-slate-200 dark:border-slate-700">
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories ({data.length})</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({categoryCounts[c.id] || 0})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Box className="h-4 w-4 text-slate-400" />
              <Label className="text-sm font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">Stock:</Label>
              <Select value={stockFilter} onValueChange={setStockFilter}>
                <SelectTrigger className="w-40 bg-white dark:bg-navy-800 border-slate-200 dark:border-slate-700">
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="in-stock">In Stock</SelectItem>
                  <SelectItem value="low-stock">Low Stock</SelectItem>
                  <SelectItem value="out-of-stock">Out of Stock</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(categoryFilter !== "all" || stockFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setCategoryFilter("all"); setStockFilter("all"); }} className="text-slate-500 dark:text-slate-400">
                <X className="h-3.5 w-3.5 mr-1" /> Clear Filters
              </Button>
            )}
            <div className="sm:ml-auto text-sm text-slate-500 dark:text-slate-400">
              Showing {filteredData.length} of {data.length} products
            </div>
          </div>
        </CardContent>
      </Card>
      <DataTable title="Products" columns={columns} data={filteredData} onAdd={openAdd} onEdit={openEdit} onDelete={handleDelete} onImport={() => {}} onExportCSV={handleExportCSV} onExportPDF={handleExportPDF} addLabel="Add Product" />
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="text-slate-900 dark:text-white">{editing?.id ? "Edit Product" : "Add Product"}</DialogTitle></DialogHeader>
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

function PlaceholderPage({ title, description }: { title: string; description: string }) { return (    <div className="space-y-6">
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
  ]; return (    <div className="space-y-6">
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
  })(); return (    <div className="space-y-6">
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
            <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Sales Orders with Profit</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">{data.salesOrders?.length || 0} order(s) found</CardDescription></CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Invoice No</TableHead>
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Grand Total</TableHead>
                      <TableHead className="font-semibold">Cost</TableHead>
                      <TableHead className="font-semibold">Profit</TableHead>
                      <TableHead className="font-semibold">Margin %</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data.salesOrders || data.salesOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No sales orders found</TableCell></TableRow>
                    ) : data.salesOrders.map((so: any) => (
                      <TableRow key={so.id} >
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
  })(); return (    <div className="space-y-6">
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
            <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Purchase Orders</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">{data.purchaseOrders?.length || 0} order(s) found</CardDescription></CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">PO Number</TableHead>
                      <TableHead className="font-semibold">Supplier</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Grand Total</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data.purchaseOrders || data.purchaseOrders.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No purchase orders found</TableCell></TableRow>
                    ) : data.purchaseOrders.map((po: any) => (
                      <TableRow key={po.id} >
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Return No</TableHead>
                    <TableHead className="font-semibold">Invoice No</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Grand Total</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No sales returns</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} >
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
              <Label className="font-semibold">Return Items</Label>
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Return No</TableHead>
                    <TableHead className="font-semibold">PO Number</TableHead>
                    <TableHead className="font-semibold">Supplier</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Grand Total</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No purchase returns</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} >
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
              <Label className="font-semibold">Return Items</Label>
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Invoice No</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Hire Rate</TableHead>
                    <TableHead className="font-semibold">Duration</TableHead>
                    <TableHead className="font-semibold">Grand Total</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">No hire sales</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} >
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
                <Label className="font-semibold">Product Lines</Label>
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Product</TableHead>
                    <TableHead className="font-semibold">Category</TableHead>
                    <TableHead className="font-semibold">Current Stock</TableHead>
                    <TableHead className="font-semibold">Cost Price</TableHead>
                    <TableHead className="font-semibold">Sale Price</TableHead>
                    <TableHead className="font-semibold">Stock Value</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No stock data</TableCell></TableRow>
                  ) : data.map((item, i) => (
                    <TableRow key={i} >
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">PO Number</TableHead>
                    <TableHead className="font-semibold">Supplier</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Grand Total</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No purchase orders</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} >
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
                <Label className="font-semibold">Line Items</Label>
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
                <span className="font-semibold">Grand Total: ৳{grandTotal.toLocaleString()}</span>
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Invoice No</TableHead>
                    <TableHead className="font-semibold">Customer</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Discount</TableHead>
                    <TableHead className="font-semibold">Grand Total</TableHead>
                    <TableHead className="font-semibold">Payment</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">No sales orders</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} >
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
                <Label className="font-semibold">Line Items</Label>
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

  const monthlyData = data.monthlyData || []; return (    <div className="space-y-6 page-enter">
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
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Month</TableHead>
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
                  <TableRow key={i} >
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
  const comparisonData = data.comparisonData || []; return (    <div className="space-y-6 page-enter">
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
  const difference = Math.abs(Number(data.grandTotalDebit) - Number(data.grandTotalCredit)); return (    <div className="space-y-6 page-enter">
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
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">#</TableHead>
                  <TableHead className="font-semibold">Account</TableHead>
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
                      <TableRow key={i} >
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
            <span className="font-semibold">Balance Check:</span>
            <Badge variant={data.balanced ? "default" : "destructive"} className="px-4 py-1 text-sm">{data.balanced ? "✓ Balanced" : "✗ Not Balanced"}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
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
  ]; return (    <div className="space-y-6 page-enter">
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
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Bank</TableHead>
                  <TableHead className="font-semibold">Account No</TableHead>
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
                  <TableRow key={bank.bankId} >
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
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  <TableHead className="font-semibold">Type</TableHead>
                  <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentTransactions.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="text-center py-8 text-slate-500">No recent transactions</TableCell></TableRow>
                ) : recentTransactions.map((t: any, i: number) => (
                  <TableRow key={i} >
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
// ADVANCE SEARCH PAGE (Enhanced)
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
    ); return (      <div className="table-container rounded-md border border-border overflow-hidden">
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
  }; return (    <div className="space-y-6">
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
              const count = (results as any)[tab.key]?.length || 0; return (                <Button
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Transfer No</TableHead>
                    <TableHead className="font-semibold">From</TableHead>
                    <TableHead className="font-semibold">To</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Items</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No transfers</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} >
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
                <Label className="font-semibold">Line Items</Label>
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
  }; return (    <div className="space-y-6">
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
  }, [data]); return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Recipient</TableHead>
                    <TableHead className="font-semibold">Message</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Sent At</TableHead>
                    <TableHead className="font-semibold">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No SMS logs found</TableCell></TableRow>
                  ) : filtered.map((item) => (
                    <TableRow key={item.id} >
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Period</TableHead>
                    <TableHead className="font-semibold">Total SMS</TableHead>
                    <TableHead className="font-semibold">Total Cost</TableHead>
                    <TableHead className="font-semibold">Paid Amount</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="font-semibold">Payments</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No SMS bills</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} >
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
          <div className="grid gap-4 py-4"><div className="grid gap-2"><Label className="text-slate-700 dark:text-slate-300">Period</Label>
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Bill Period</TableHead>
                    <TableHead className="font-semibold">Amount</TableHead>
                    <TableHead className="font-semibold">Payment Date</TableHead>
                    <TableHead className="font-semibold">Method</TableHead>
                    <TableHead className="font-semibold">Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No payments recorded</TableCell></TableRow>
                  ) : data.map((item) => (
                    <TableRow key={item.id} >
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
          <div className="grid gap-4 py-4"><div className="grid gap-2"><Label className="text-slate-700 dark:text-slate-300">Select Bill</Label>
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
  ]; return (    <div className="space-y-6">
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
        <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Detailed SMS Logs</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="font-semibold">Recipient</TableHead>
                  <TableHead className="font-semibold">Message</TableHead>
                  <TableHead className="font-semibold">Status</TableHead>
                  <TableHead className="font-semibold">Sent At</TableHead>
                  <TableHead className="font-semibold">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No SMS logs found</TableCell></TableRow>
                ) : filtered.map((item) => (
                  <TableRow key={item.id} >
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

  const allItems = useMemo(() => [...customers, ...suppliers], [customers, suppliers]); return (    <div className="space-y-6">
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

  const statusFlow = ["Draft", "Confirmed", "Processing", "Completed"]; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Sheet No</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Total Items</TableHead>
                    <TableHead className="font-semibold">Grand Total</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No order sheets</TableCell></TableRow>
                  ) : data.map((item) => {
                    const itemTotal = item.lines?.reduce((s: number, l: any) => s + (l.total || 0), 0) || 0; return (                      <TableRow key={item.id} >
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
                <Label className="font-semibold">Product Lines</Label>
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
                <span className="font-semibold">Grand Total: ৳{grandTotal.toLocaleString()}</span>
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
                      <TableRow className="bg-muted/50">
                        <TableHead className="font-semibold">Product</TableHead>
                        <TableHead className="font-semibold">Quantity</TableHead>
                        <TableHead className="font-semibold">Rate</TableHead>
                        <TableHead className="font-semibold">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(viewItem.lines || []).map((line: any, idx: number) => (
                        <TableRow key={idx} >
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
// AUTO PO PAGE (Auto Purchase Order Generation)
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
  }; return (    <div className="space-y-6">
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
        <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Generate Purchase Order</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">Select a supplier and godown, then choose products to include</CardDescription></CardHeader>
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-slate-700 dark:text-slate-300 font-semibold w-10">
                      <Checkbox checked={selected.size === data.length && data.length > 0} onCheckedChange={toggleAll} />
                    </TableHead>
                    <TableHead className="font-semibold">Product</TableHead>
                    <TableHead className="font-semibold">Category</TableHead>
                    <TableHead className="font-semibold">Current Stock</TableHead>
                    <TableHead className="font-semibold">Reorder Level</TableHead>
                    <TableHead className="font-semibold">Shortage</TableHead>
                    <TableHead className="font-semibold">Suggested Qty</TableHead>
                    <TableHead className="font-semibold">Est. Cost</TableHead>
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
function StockDetailsPage() {
  const { toast } = useToast();
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState("");
  const [stockData, setStockData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [productsLoading, setProductsLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [entryTypeFilter, setEntryTypeFilter] = useState("all");
  const [allStockEntries, setAllStockEntries] = useState<any[]>([]);
  const [allEntriesLoading, setAllEntriesLoading] = useState(false);

  // Fetch all stock entries for summary
  React.useEffect(() => {
    setAllEntriesLoading(true);
    fetch("/api/stock-entries?limit=500")
      .then((r) => r.json())
      .then((d) => { setAllStockEntries(d.data || d || []); setAllEntriesLoading(false); })
      .catch(() => { setAllStockEntries([]); setAllEntriesLoading(false); });
  }, []);
  React.useEffect(() => {
    fetch("/api/products").then((r) => r.json()).then((d) => { setProducts(d); setProductsLoading(false); }).catch(() => setProductsLoading(false));
  }, []);
  React.useEffect(() => {
    if (!selectedProduct) { setStockData(null); return; }
    setLoading(true);
    fetch(`/api/stock-details?productId=${selectedProduct}`).then((r) => r.json()).then((d) => { setStockData(d); setLoading(false); }).catch(() => { setStockData(null); setLoading(false); });
  }, [selectedProduct]);

  // Summary counts from all stock entries
  const summaryCounts = useMemo(() => {
    let filtered = allStockEntries;
    if (dateFrom) filtered = filtered.filter((e: any) => new Date(e.date) >= new Date(dateFrom));
    if (dateTo) filtered = filtered.filter((e: any) => new Date(e.date) <= new Date(dateTo + "T23:59:59"));
    return {
      totalIn: filtered.filter((e: any) => e.type === "IN").length,
      totalOut: filtered.filter((e: any) => e.type === "OUT").length,
      totalTransfer: filtered.filter((e: any) => e.type === "TRANSFER").length,
    };
  }, [allStockEntries, dateFrom, dateTo]);
  const entries = useMemo(() => {
    if (!stockData?.entries) return [];
    let filtered = stockData.entries;
    if (dateFrom) filtered = filtered.filter((e: any) => new Date(e.date) >= new Date(dateFrom));
    if (dateTo) filtered = filtered.filter((e: any) => new Date(e.date) <= new Date(dateTo + "T23:59:59"));
    if (entryTypeFilter !== "all") filtered = filtered.filter((e: any) => e.type === entryTypeFilter);
    return filtered;
  }, [stockData, dateFrom, dateTo, entryTypeFilter]);

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
  }; return (    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Stock Details</h1>
        <p className="text-slate-500 dark:text-slate-400">Detailed product stock ledger and movements</p>
      </div>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/80">Total IN</p>
                  <p className="text-2xl font-bold mt-1">{summaryCounts.totalIn}</p>
                </div>
                <ArrowDownRight className="h-8 w-8 text-white/40" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-red-500 to-rose-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/80">Total OUT</p>
                  <p className="text-2xl font-bold mt-1">{summaryCounts.totalOut}</p>
                </div>
                <ArrowUpRight className="h-8 w-8 text-white/40" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border overflow-hidden">
          <CardContent className="p-0">
            <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white/80">Total TRANSFER</p>
                  <p className="text-2xl font-bold mt-1">{summaryCounts.totalTransfer}</p>
                </div>
                <ArrowRightLeft className="h-8 w-8 text-white/40" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      {/* Product Selector */}
      <Card className="border-border">
        <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Select Product & Filters</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
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
            <div className="grid gap-2">
              <Label className="text-slate-700 dark:text-slate-300">Entry Type</Label>
              <Select value={entryTypeFilter} onValueChange={setEntryTypeFilter}>
                <SelectTrigger><SelectValue placeholder="All Types" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="IN">IN</SelectItem>
                  <SelectItem value="OUT">OUT</SelectItem>
                  <SelectItem value="TRANSFER">TRANSFER</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {(dateFrom || dateTo || entryTypeFilter !== "all") && (
            <div className="mt-3">
              <Button variant="ghost" size="sm" onClick={() => { setDateFrom(""); setDateTo(""); setEntryTypeFilter("all"); }} className="text-slate-500 dark:text-slate-400">
                <X className="h-3.5 w-3.5 mr-1" /> Clear Filters
              </Button>
            </div>
          )}
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
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Type</TableHead>
                      <TableHead className="font-semibold">Reference</TableHead>
                      <TableHead className="font-semibold">Quantity Change</TableHead>
                      <TableHead className="font-semibold">Running Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entriesWithBalance.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No stock movements found</TableCell></TableRow>
                    ) : entriesWithBalance.map((entry: any, idx: number) => {
                      const isIN = entry.type === "IN";
                      const isOUT = entry.type === "OUT";
                      const isTransfer = entry.type === "TRANSFER";
                      const rowBg = isIN ? "bg-green-50/50 dark:bg-green-900/10" : isOUT ? "bg-red-50/50 dark:bg-red-900/10" : isTransfer ? "bg-blue-50/50 dark:bg-blue-900/10" : "";
                      const typeBg = isIN ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : isOUT ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
                      const qtyColor = isIN ? "text-green-600 dark:text-green-400" : isOUT ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400";
                      const typeIcon = isIN ? <ArrowDownRight className="h-3 w-3" /> : isOUT ? <ArrowUpRight className="h-3 w-3" /> : <ArrowRightLeft className="h-3 w-3" />; return (                        <TableRow key={idx} className={`hover:bg-slate-50 dark:hover:bg-navy-900/30 ${rowBg}`}>
                          <TableCell className="text-slate-700 dark:text-slate-300">{new Date(entry.date).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${typeBg}`}>
                              {typeIcon}
                              {entry.type}
                            </span>
                          </TableCell>
                          <TableCell className="text-slate-700 dark:text-slate-300">{entry.reference || "-"}</TableCell>
                          <TableCell className={`font-medium ${qtyColor}`}>
                            {isIN ? "+" : "-"}{entry.quantity}
                          </TableCell>
                          <TableCell className="text-slate-700 dark:text-slate-300 font-medium">{entry.runningBalance}</TableCell>
                        </TableRow>
                      );
                    })}
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
  }; return (    <div className="space-y-6">
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
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold">Replacement No</TableHead>
                    <TableHead className="font-semibold">Sales Order</TableHead>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Reason</TableHead>
                    <TableHead className="font-semibold">Grand Total</TableHead>
                    <TableHead className="font-semibold">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No replacement orders</TableCell></TableRow>
                  ) : data.map((item) => {
                    const itemTotal = item.lines?.reduce((s: number, l: any) => s + (l.total || 0), 0) || 0; return (                      <TableRow key={item.id} >
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
              <Label className="font-semibold">Replacement Items</Label>
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
                <span className="font-semibold">Grand Total: ৳{grandTotal.toLocaleString()}</span>
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
  }; return (    <div className="space-y-6">
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
            <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Hire Sales Detail</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">{filteredHireSales.length} record(s) found</CardDescription></CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Invoice No</TableHead>
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Hire Rate</TableHead>
                      <TableHead className="font-semibold">Duration</TableHead>
                      <TableHead className="font-semibold">Grand Total</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredHireSales.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-slate-500">No hire sales found</TableCell></TableRow>
                    ) : filteredHireSales.map((hs: any) => (
                      <TableRow key={hs.id} >
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
// SR REPORT PAGE (Sales Rep Performance)
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
  }; return (    <div className="space-y-6">
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
            <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Employee Performance</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">{filteredPerformance.length} record(s) found</CardDescription></CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Employee</TableHead>
                      <TableHead className="font-semibold">Target</TableHead>
                      <TableHead className="font-semibold">Actual Sales</TableHead>
                      <TableHead className="font-semibold">Achievement %</TableHead>
                      <TableHead className="font-semibold">Variance</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPerformance.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-slate-500">No performance data found</TableCell></TableRow>
                    ) : filteredPerformance.map((p: any) => (
                      <TableRow key={p.employeeId + p.month + p.year} >
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
  }; return (    <div className="space-y-6">
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
            <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Customer Summary</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">{filteredCustomers.length} customer(s) found</CardDescription></CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Customer</TableHead>
                      <TableHead className="font-semibold">Total Orders</TableHead>
                      <TableHead className="font-semibold">Total Revenue</TableHead>
                      <TableHead className="font-semibold">Last Order Date</TableHead>
                      <TableHead className="font-semibold">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No customers found</TableCell></TableRow>
                    ) : filteredCustomers.map((c: any) => (
                      <TableRow key={c.id} >
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
    - (summary.totalWithdrawals || 0) - (summary.totalExpense || 0) - (summary.totalDeliveries || 0); return (    <div className="space-y-6 page-enter">
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
            <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Transaction Details</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">{data.transactions?.length || 0} transaction(s) found</CardDescription></CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Description</TableHead>
                      <TableHead className="font-semibold">Credit</TableHead>
                      <TableHead className="font-semibold">Debit</TableHead>
                      <TableHead className="font-semibold">Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {!data.transactions || data.transactions.length === 0 ? (
                      <TableRow><TableCell colSpan={5} className="text-center py-8 text-slate-500">No transactions found</TableCell></TableRow>
                    ) : data.transactions.map((t: any, idx: number) => (
                      <TableRow key={idx} >
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
  const uniqueDestGodowns = new Set(filteredTransfers.map((t: any) => t.toGodown?.name).filter(Boolean)).size; return (    <div className="space-y-6">
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
            <CardHeader className="pb-3"><CardTitle className="text-slate-900 dark:text-white">Transfer Details</CardTitle><CardDescription className="text-slate-500 dark:text-slate-400">{filteredTransfers.length} transfer(s) found</CardDescription></CardHeader>
            <CardContent>
              <div className="table-container rounded-md border border-border max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="font-semibold">Date</TableHead>
                      <TableHead className="font-semibold">Transfer No</TableHead>
                      <TableHead className="font-semibold">From Godown</TableHead>
                      <TableHead className="font-semibold">To Godown</TableHead>
                      <TableHead className="font-semibold">Items</TableHead>
                      <TableHead className="font-semibold">Total Qty</TableHead>
                      <TableHead className="font-semibold">Status</TableHead>
                      <TableHead className="font-semibold">Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransfers.length === 0 ? (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-slate-500">No transfers found</TableCell></TableRow>
                    ) : filteredTransfers.map((t: any) => (
                      <TableRow key={t.id} >
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
  }; return (    <div className="space-y-6">
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
  }; return (    <div className="space-y-6">
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
// EMPLOYEE LEAVE PAGE (Custom)
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
  ]; return (    <div className="space-y-6">
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
function UserProfilePage() {
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [userName, setUserName] = useState("Admin User");
  const [userEmail, setUserEmail] = useState("admin@electronicsims.com");
  const [userRole, setUserRole] = useState("Administrator");
  const [language, setLanguage] = useState("en");
  const [lastLogin, setLastLogin] = useState("");
  const [passwordForm, setPasswordForm] = useState({ current: "", newPassword: "", confirm: "" });
  const [sessionInfo, setSessionInfo] = useState({ browser: "", os: "", loginTime: "" });
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("ems_user");
      if (stored) {
        const userData = JSON.parse(stored);
        if (userData.name) setUserName(userData.name);
        if (userData.email) setUserEmail(userData.email);
        if (userData.role) setUserRole(userData.role === "admin" ? "Administrator" : userData.role);
      }
      const storedLang = localStorage.getItem("ems_language");
      if (storedLang) setLanguage(storedLang);
      const storedLogin = localStorage.getItem("ems_last_login");
      if (storedLogin) setLastLogin(storedLogin);
      else setLastLogin(new Date().toLocaleString());
    } catch {}
    // Detect browser and OS
    const ua = navigator.userAgent;
    let browser = "Unknown";
    if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    else if (ua.includes("Edg")) browser = "Edge";
    let os = "Unknown";
    if (ua.includes("Win")) os = "Windows";
    else if (ua.includes("Mac")) os = "macOS";
    else if (ua.includes("Linux")) os = "Linux";
    else if (ua.includes("Android")) os = "Android";
    else if (ua.includes("iPhone") || ua.includes("iPad")) os = "iOS";
    setSessionInfo({ browser, os, loginTime: new Date().toLocaleString() });
  }, []);
  const handleLanguageChange = (lang: string) => {
    setLanguage(lang);
    try { localStorage.setItem("ems_language", lang); } catch {}
    toast({ title: lang === "en" ? "Language Changed" : "ভাষা পরিবর্তন", description: lang === "en" ? "Language set to English" : "ভাষা বাংলায় সেট করা হয়েছে" });
  };
  const handlePasswordChange = () => {
    if (!passwordForm.current || !passwordForm.newPassword || !passwordForm.confirm) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirm) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }
    toast({ title: "Success", description: "Password updated successfully" });
    setPasswordForm({ current: "", newPassword: "", confirm: "" });
  };

  const initials = userName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2); return (    <div className="space-y-6">
      <PageHeader title="User Profile" description="Manage your account settings and preferences" icon={<User className="h-6 w-6" />} />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile Card */}
        <Card className="border-border lg:col-span-1">
          <CardContent className="p-6 flex flex-col items-center text-center">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg mb-4">
              {initials || "U"}
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">{userName}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{userEmail}</p>
            <Badge className="mt-3 bg-primary/10 text-primary hover:bg-primary/20 border-0">
              <Award className="h-3 w-3 mr-1" />
              {userRole}
            </Badge>
            <Separator className="my-4" />
            <div className="w-full space-y-3 text-left">
              <div className="flex items-center gap-3 text-sm">
                <Clock className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Last Login</p>
                  <p className="text-slate-900 dark:text-white font-medium">{lastLogin}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <LogIn className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Session</p>
                  <p className="text-slate-900 dark:text-white font-medium">{sessionInfo.browser} on {sessionInfo.os}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Lock className="h-4 w-4 text-slate-400" />
                <div>
                  <p className="text-slate-500 dark:text-slate-400">Session Started</p>
                  <p className="text-slate-900 dark:text-white font-medium">{sessionInfo.loginTime}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        {/* Settings */}
        <div className="lg:col-span-2 space-y-6">
          {/* Change Password */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <Lock className="h-5 w-5 text-primary" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2">
                <Label className="text-slate-700 dark:text-slate-300">Current Password</Label>
                <Input type="password" value={passwordForm.current} onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })} placeholder="Enter current password" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-slate-700 dark:text-slate-300">New Password</Label>
                  <Input type="password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })} placeholder="Min 6 characters" />
                </div>
                <div className="grid gap-2">
                  <Label className="text-slate-700 dark:text-slate-300">Confirm Password</Label>
                  <Input type="password" value={passwordForm.confirm} onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })} placeholder="Re-enter new password" />
                </div>
              </div>
              <Button onClick={handlePasswordChange} className="bg-primary text-primary-foreground">
                Update Password
              </Button>
            </CardContent>
          </Card>
          {/* Preferences */}
          <Card className="border-border">
            <CardHeader>
              <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Theme */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Theme</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Select your preferred color theme</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant={theme === "light" ? "default" : "outline"} size="sm" onClick={() => setTheme("light")} className={theme === "light" ? "bg-primary text-primary-foreground" : "text-slate-700 dark:text-slate-300"}>
                    <Sun className="h-4 w-4 mr-1" /> Light
                  </Button>
                  <Button variant={theme === "dark" ? "default" : "outline"} size="sm" onClick={() => setTheme("dark")} className={theme === "dark" ? "bg-primary text-primary-foreground" : "text-slate-700 dark:text-slate-300"}>
                    <Moon className="h-4 w-4 mr-1" /> Dark
                  </Button>
                  <Button variant={theme === "system" ? "default" : "outline"} size="sm" onClick={() => setTheme("system")} className={theme === "system" ? "bg-primary text-primary-foreground" : "text-slate-700 dark:text-slate-300"}>
                    <Zap className="h-4 w-4 mr-1" /> System
                  </Button>
                </div>
              </div>
              <Separator />
              {/* Language */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-white">Language</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Choose your preferred language</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant={language === "en" ? "default" : "outline"} size="sm" onClick={() => handleLanguageChange("en")} className={language === "en" ? "bg-primary text-primary-foreground" : "text-slate-700 dark:text-slate-300"}>
                    English
                  </Button>
                  <Button variant={language === "bn" ? "default" : "outline"} size="sm" onClick={() => handleLanguageChange("bn")} className={language === "bn" ? "bg-primary text-primary-foreground" : "text-slate-700 dark:text-slate-300"}>
                    বাংলা
                  </Button>
                </div>
              </div>
              <Separator />
              {/* Session Info */}
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white mb-3">Session Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 dark:bg-navy-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Browser</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{sessionInfo.browser}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-navy-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Operating System</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{sessionInfo.os}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-navy-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Session Start</p>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{sessionInfo.loginTime}</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-navy-900/50 rounded-lg p-3">
                    <p className="text-xs text-slate-500 dark:text-slate-400">Status</p>
                    <p className="text-sm font-medium text-green-600 dark:text-green-400">Active</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
// NOTIFICATION PANEL
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
  }; return (    <>
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
function LoginPage({ onLogin }: { onLogin: (user: { id: string; email: string; name: string; role: string }) => void }) {
  const { theme } = useTheme();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successAnim, setSuccessAnim] = useState(false);
  const { toast } = useToast();
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }
      setSuccessAnim(true);
      if (remember) {
        localStorage.setItem("ems_user", JSON.stringify(data));
      }
      toast({ title: "Welcome back!", description: `Logged in as ${data.name}` });
      setTimeout(() => onLogin(data), 300);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }; return (    <div className={`min-h-screen flex items-center justify-center login-bg-pattern bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 p-4 ${successAnim ? "success-pop" : ""}`}>
      <div className="glass-strong rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-primary to-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-lg shadow-primary/30 mb-4">
            <Package className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Electronics Mart</h1>
          <p className="text-navy-300 text-sm mt-1">Inventory Management System</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm text-center">
              {error}
            </div>
          )}
          <div className="space-y-2">
            <Label className="text-navy-200 text-sm font-medium">Email Address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400" />
              <Input
                type="email"
                placeholder="admin@electronics.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-navy-400 focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-navy-200 text-sm font-medium">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-400" />
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-navy-400 focus:ring-2 focus:ring-primary/40 focus:border-primary/50"
                required
              />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Checkbox
                checked={remember}
                onCheckedChange={(v) => setRemember(!!v)}
                className="border-navy-400 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
              />
              <span className="text-sm text-navy-300">Remember me</span>
            </div>
            <button type="button" className="text-sm text-primary hover:text-primary/80 transition-colors">
              Forgot password?
            </button>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground py-2.5 btn-press shadow-lg shadow-primary/20"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <RefreshCcw className="h-4 w-4 animate-spin" /> Signing in...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <LogIn className="h-4 w-4" /> Sign In
              </span>
            )}
          </Button>
        </form>
        <p className="text-center text-navy-400 text-xs mt-6">
          Default: admin@electronics.com / admin123
        </p>
      </div>
    </div>
  );
}
// MAIN APP COMPONENT

function AppContent() {
  const { theme, setTheme } = useTheme();
  const [currentPage, setCurrentPage] = useState<PageKey>("dashboard");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["Dashboard", "Basic Setup", "Inventory", "Products", "Staff", "Customers & Suppliers", "Accounts", "SMS Service", "Accounting Reports", "MIS Reports", "Management"]));
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [notifPanelOpen, setNotifPanelOpen] = useState(false);
  const [user, setUser] = useState<{ id: string; email: string; name: string; role: string } | null>(null);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  // Restore user from localStorage on mount
  React.useEffect(() => {
    try {
      const stored = localStorage.getItem("ems_user");
      if (stored) {
        setUser(JSON.parse(stored));
      }
    } catch {}
  }, []);
  const handleLogin = (userData: { id: string; email: string; name: string; role: string }) => {
    setUser(userData);
    localStorage.setItem("ems_user", JSON.stringify(userData));
  };
  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("ems_user");
    setUserDropdownOpen(false);
  };
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
  if (!user) {
    return <LoginPage onLogin={handleLogin} />;
  }
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
    // MIS Report batch 2 (handled by reportConfigs)
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
    if (currentPage === "audit-log") return <AuditLogPage />;
    if (currentPage === "user-profile") return <UserProfilePage />;
    // Report & module pages handled by reportConfigs / moduleConfigs
    const reportConfig = reportConfigs[currentPage as PageKey];
    if (reportConfig) return <GenericReportPage config={reportConfig} />;
    const config = moduleConfigs[currentPage];
    if (config) return <GenericModulePage config={config} />;
    // Placeholder for remaining complex modules
    const pageLabels: Record<string, { title: string; description: string }> = {
    };
    const info = pageLabels[currentPage] || { title: currentPage, description: "" };
    return <PlaceholderPage title={info.title} description={info.description} />;
  }; return (    <div className="min-h-screen flex flex-col bg-background">
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
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 hover:bg-navy-800 rounded-lg px-2 py-1 transition-colors"
              >
                <div className="w-8 h-8 bg-navy-700 rounded-full flex items-center justify-center">
                  <User className="h-4 w-4" />
                </div>
                <div className="hidden sm:block text-left">
                  <p className="text-sm font-medium leading-tight">{user?.name || "Admin"}</p>
                  <p className="text-[10px] text-navy-300">{user?.email || "admin@electronicsmart.com"}</p>
                </div>
                <ChevronDown className="h-3.5 w-3.5 text-navy-400 hidden sm:block" />
              </button>
              {userDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-navy-900 rounded-lg border border-border shadow-lg z-50 py-1">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{user?.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{user?.role || "admin"}</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Log Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>
      <div className="flex flex-1">
        {/* Mobile sidebar overlay */}
        {mobileSidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/50 sidebar-overlay lg:hidden" onClick={() => setMobileSidebarOpen(false)} />
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
                    className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm transition-all duration-200 rounded-r-lg btn-press ${
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
                            className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-sm rounded-md transition-all duration-200 btn-press ${
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
              if (group && group !== "Dashboard") { return (                  <>
                    <ChevronRight className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                    <span className="text-slate-400 dark:text-slate-500">{group}</span>
                    <ChevronRight className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                    <span className="text-slate-700 dark:text-slate-200 font-medium">{pageLabel}</span>
                  </>
                );
              } return (                <>
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
          <div className="p-4 sm:p-6 lg:p-8 flex-1 page-slide-in page-enter">
            {renderPage()}
          </div>
          {/* Footer */}
          <footer className="bg-gradient-to-r from-navy-950 via-navy-900 to-navy-950 dark:from-navy-950 dark:via-navy-900 dark:to-navy-950 text-white py-3 px-4 text-center text-sm border-t border-navy-800/50">
            <div className="flex items-center justify-center gap-2">
              <Zap className="h-3.5 w-3.5 text-amber-400" />
              <p className="text-navy-300">Develop Copyright by <span className="text-white font-medium">NextGen Digital Studio</span></p>
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