"use client";
// ============================================================
// POS TERMINAL PAGE — Phase 15
// Ultra-High-Speed Barcode Scanner Interceptor & Grid Mutation
// Multi-Gateway Split Payment Matrix & Zero-Fraud Cash-Change Engine
// Blink-Fast Optimistic Rendering, Row-Isolation Spin-Locks, Reversible Carts
// User Profile Live Activity Stream & Thermal White-Label Auto-Print Sync
// ============================================================

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw,
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  CreditCard,
  Smartphone,
  Banknote,
  Printer,
  X,
  AlertTriangle,
  CheckCircle,
  Package,
} from "lucide-react";

// ============================================================
// TYPES & INTERFACES
// ============================================================

interface PosCartItem {
  id: string;
  productId: string;
  productCode: string;
  name: string;
  rate: number;
  costPrice: number;
  quantity: number;
  discountPercent: number;
  discountAmount: number;
  total: number;
  availableStock: number;
  imeiNumber?: string;
}

interface PosPayment {
  cashAmount: number;
  cardAmount: number;
  mfsAmount: number;
}

interface Company {
  id: string;
  name: string;
  address?: string;
  phone?: string;
  mobile?: string;
  email?: string;
  logo?: string;
  logoData?: string;
  brandLogo?: string;
  vatNumber?: string;
  binNumber?: string;
  currencySymbol?: string;
  thankYouMsg?: string;
  systemNote?: string;
}

interface Godown {
  id: string;
  name: string;
  address?: string;
  status: string;
}

interface Customer {
  id: string;
  customerCode: string;
  name: string;
  phone?: string;
  customerType: string;
}

interface RecentSale {
  id: string;
  receiptNo: string;
  date: string;
  grandTotal: number;
  customerName: string;
  cashierName: string;
  status: string;
  lineCount: number;
}

interface ProductSearchResult {
  id: string;
  productCode: string;
  name: string;
  salePrice: number;
  costPrice: number;
  wholesalePrice: number;
  dealerPrice: number;
  unit?: string;
  imeiNumber?: string;
  stocks: Array<{
    godownId: string;
    godownName: string;
    quantity: number;
    costPrice: number;
  }>;
}

// ============================================================
// CURRENCY FORMATTER
// ============================================================

const bdCurrencyFmt = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function fmtCurrency(v: number): string {
  return `৳${bdCurrencyFmt.format(v)}`;
}

function safeRound(v: number): number {
  return Math.round(v * 100) / 100;
}

function safeAdd(a: number, b: number): number {
  return safeRound(a + b);
}

function safeSubtract(a: number, b: number): number {
  return safeRound(a - b);
}

// ============================================================
// AUTH HELPER — reads from localStorage like the parent app
// ============================================================

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
    } catch {
      // ignore
    }
  }
  return headers;
}

function getCompanyId(): string | null {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("ems_auth");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.user?.companyId || null;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

function getCashierName(): string {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("ems_auth");
      if (stored) {
        const parsed = JSON.parse(stored);
        return parsed?.user?.displayName || parsed?.user?.name || "Cashier";
      }
    } catch {
      // ignore
    }
  }
  return "Cashier";
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export default function POSTerminalPage() {
  // ── Cart State ──
  const [cart, setCart] = useState<PosCartItem[]>([]);
  const [posCartSnapshot, setPosCartSnapshot] = useState<PosCartItem[]>([]);

  // ── Payment State ──
  const [payment, setPayment] = useState<PosPayment>({
    cashAmount: 0,
    cardAmount: 0,
    mfsAmount: 0,
  });
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [vatPercentage, setVatPercentage] = useState<number>(0);

  // ── UI State ──
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [barcodeInput, setBarcodeInput] = useState("");
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null);
  const [checkoutSuccess, setCheckoutSuccess] = useState(false);

  // ── Reference Data ──
  const [companies, setCompanies] = useState<Company[]>([]);
  const [godowns, setGodowns] = useState<Godown[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedGodownId, setSelectedGodownId] = useState<string>("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("walk-in");
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [recentSales, setRecentSales] = useState<RecentSale[]>([]);

  // ── Barcode Scanner Buffer ──
  const barcodeBufferRef = useRef<string>("");
  const barcodeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchResultsRef = useRef<HTMLDivElement>(null);

  // ============================================================
  // D1: BARCODE SCANNER INTERCEPTOR — Global Keyboard Hook
  // ============================================================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea/select field (except our barcode input)
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (
        (tagName === "input" || tagName === "textarea" || tagName === "select") &&
        target.id !== "pos-barcode-input" &&
        !target.getAttribute("data-pos-input")
      ) {
        return;
      }

      // Handle Enter key — process accumulated barcode
      if (e.key === "Enter") {
        if (barcodeBufferRef.current.length >= 3) {
          const code = barcodeBufferRef.current.trim();
          handleBarcodeLookup(code);
        }
        barcodeBufferRef.current = "";
        if (barcodeTimerRef.current) {
          clearTimeout(barcodeTimerRef.current);
          barcodeTimerRef.current = null;
        }
        return;
      }

      // Only process printable characters
      if (e.key.length === 1) {
        barcodeBufferRef.current += e.key;

        // Reset timer — 100ms between keystrokes to distinguish scanner from human typing
        if (barcodeTimerRef.current) {
          clearTimeout(barcodeTimerRef.current);
        }
        barcodeTimerRef.current = setTimeout(() => {
          // If more than 100ms passes, reset the buffer (human typing)
          barcodeBufferRef.current = "";
        }, 100);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (barcodeTimerRef.current) {
        clearTimeout(barcodeTimerRef.current);
      }
    };
  }, [selectedGodownId]);

  // ============================================================
  // BARCODE LOOKUP
  // ============================================================

  const handleBarcodeLookup = useCallback(
    async (code: string) => {
      try {
        const res = await fetch(`/api/pos/barcode?code=${encodeURIComponent(code)}`, {
          headers: getAuthHeaders(),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Product not found" }));
          setStockWarning(`Product not found: ${code}`);
          setTimeout(() => setStockWarning(null), 3000);
          return;
        }
        const product: ProductSearchResult = await res.json();
        addProductToCart(product);
      } catch {
        setStockWarning(`Error looking up barcode: ${code}`);
        setTimeout(() => setStockWarning(null), 3000);
      }
    },
    [selectedGodownId, cart]
  );

  // ============================================================
  // ADD PRODUCT TO CART
  // ============================================================

  const addProductToCart = useCallback(
    (product: ProductSearchResult) => {
      if (!selectedGodownId) {
        setStockWarning("Please select a godown first");
        setTimeout(() => setStockWarning(null), 3000);
        return;
      }

      // Find stock at selected godown
      const godownStock = product.stocks.find((s) => s.godownId === selectedGodownId);
      const availableStock = godownStock?.quantity || 0;
      const rate = product.salePrice || 0;

      if (rate <= 0) {
        setStockWarning(`Product "${product.name}" has no sale price set`);
        setTimeout(() => setStockWarning(null), 3000);
        return;
      }

      setCart((prevCart) => {
        // Check if product already in cart — increment quantity
        const existingIndex = prevCart.findIndex((item) => item.productId === product.id);

        if (existingIndex >= 0) {
          const existing = prevCart[existingIndex];
          const newQty = existing.quantity + 1;

          // D1: Stock Limit Interlock
          if (newQty > availableStock) {
            setStockWarning(
              `Stock Limit Exceeded: Only ${availableStock} items remaining for "${product.name}"`
            );
            setTimeout(() => setStockWarning(null), 3000);
            return prevCart; // Return unchanged cart
          }

          const newGross = safeRound(newQty * existing.rate);
          const newDiscAmt = safeRound(newGross * (existing.discountPercent / 100));
          const newTotal = safeSubtract(newGross, newDiscAmt);

          const updated = [...prevCart];
          updated[existingIndex] = {
            ...existing,
            quantity: newQty,
            discountAmount: newDiscAmt,
            total: newTotal,
          };
          return updated;
        }

        // New product — check stock
        if (availableStock < 1) {
          setStockWarning(
            `Stock Limit Exceeded: Only ${availableStock} items remaining for "${product.name}"`
          );
          setTimeout(() => setStockWarning(null), 3000);
          return prevCart;
        }

        // Add new item
        const discountAmt = 0;
        const lineTotal = safeRound(rate - discountAmt);
        const newItem: PosCartItem = {
          id: `cart-${Date.now()}-${product.id}`,
          productId: product.id,
          productCode: product.productCode,
          name: product.name,
          rate,
          costPrice: product.costPrice || godownStock?.costPrice || 0,
          quantity: 1,
          discountPercent: 0,
          discountAmount: discountAmt,
          total: lineTotal,
          availableStock,
          imeiNumber: product.imeiNumber || undefined,
        };

        return [...prevCart, newItem];
      });

      // Clear barcode input
      setBarcodeInput("");
    },
    [selectedGodownId]
  );

  // ============================================================
  // CART OPERATIONS
  // ============================================================

  const updateCartItemQuantity = useCallback(
    (itemId: string, delta: number) => {
      setCart((prevCart) =>
        prevCart.map((item) => {
          if (item.id !== itemId) return item;

          const newQty = item.quantity + delta;
          if (newQty <= 0) return item;

          // D1: Stock Limit Interlock
          if (newQty > item.availableStock) {
            setStockWarning(
              `Stock Limit Exceeded: Only ${item.availableStock} items remaining for "${item.name}"`
            );
            setTimeout(() => setStockWarning(null), 3000);
            return item;
          }

          const newGross = safeRound(newQty * item.rate);
          const newDiscAmt = safeRound(newGross * (item.discountPercent / 100));
          const newTotal = safeSubtract(newGross, newDiscAmt);

          return {
            ...item,
            quantity: newQty,
            discountAmount: newDiscAmt,
            total: newTotal,
          };
        })
      );
    },
    []
  );

  const updateCartItemDiscount = useCallback((itemId: string, discPct: number) => {
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id !== itemId) return item;
        const clampedDisc = Math.min(Math.max(discPct, 0), 100);
        const newGross = safeRound(item.quantity * item.rate);
        const newDiscAmt = safeRound(newGross * (clampedDisc / 100));
        const newTotal = safeSubtract(newGross, newDiscAmt);
        return {
          ...item,
          discountPercent: clampedDisc,
          discountAmount: newDiscAmt,
          total: newTotal,
        };
      })
    );
  }, []);

  const removeCartItem = useCallback((itemId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
    setPayment({ cashAmount: 0, cardAmount: 0, mfsAmount: 0 });
    setDiscountPercent(0);
    setVatPercentage(0);
    setCheckoutMessage(null);
    setCheckoutSuccess(false);
  }, []);

  // ============================================================
  // D2: COMPUTED TOTALS — Split Payment Matrix
  // ============================================================

  const subTotal = useMemo(() => {
    return cart.reduce((sum, item) => safeAdd(sum, item.total), 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    return safeRound(subTotal * (discountPercent / 100));
  }, [subTotal, discountPercent]);

  const afterDiscount = useMemo(() => {
    return safeSubtract(subTotal, discountAmount);
  }, [subTotal, discountAmount]);

  const vatAmount = useMemo(() => {
    return safeRound(afterDiscount * (vatPercentage / 100));
  }, [afterDiscount, vatPercentage]);

  const grandTotal = useMemo(() => {
    return safeAdd(afterDiscount, vatAmount);
  }, [afterDiscount, vatAmount]);

  const totalPaid = useMemo(() => {
    return safeAdd(safeAdd(payment.cashAmount, payment.cardAmount), payment.mfsAmount);
  }, [payment]);

  const cashChange = useMemo(() => {
    return safeSubtract(totalPaid, grandTotal);
  }, [totalPaid, grandTotal]);

  const isPaymentSufficient = useMemo(() => {
    return totalPaid >= grandTotal && grandTotal > 0;
  }, [totalPaid, grandTotal]);

  // ============================================================
  // PRODUCT SEARCH
  // ============================================================

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(
          `/api/products?search=${encodeURIComponent(searchQuery)}&pageSize=20`,
          { headers: getAuthHeaders() }
        );
        if (res.ok) {
          const data = await res.json();
          const products = Array.isArray(data) ? data : data.data || [];
          setSearchResults(products);
          setShowSearchResults(products.length > 0);
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // ============================================================
  // LOAD REFERENCE DATA
  // ============================================================

  useEffect(() => {
    let isMounted = true;
    async function loadReferenceData() {
      const headers = getAuthHeaders();
      try {
        const [companiesRes, godownsRes, customersRes] = await Promise.all([
          fetch("/api/companies", { headers }).catch(() => null),
          fetch("/api/godowns", { headers }).catch(() => null),
          fetch("/api/customers?pageSize=500", { headers }).catch(() => null),
        ]);

        if (companiesRes?.ok && isMounted) {
          const data = await companiesRes.json();
          const list = Array.isArray(data) ? data : data.data || [];
          setCompanies(list);
          if (list.length > 0 && !selectedCompanyId) {
            setSelectedCompanyId(list[0].id);
          }
        }

        if (godownsRes?.ok && isMounted) {
          const data = await godownsRes.json();
          const list = Array.isArray(data) ? data : data.data || [];
          setGodowns(list.filter((g: Godown) => g.status === "ACTIVE"));
          if (list.length > 0 && !selectedGodownId) {
            const active = list.find((g: Godown) => g.status === "ACTIVE");
            if (active) setSelectedGodownId(active.id);
          }
        }

        if (customersRes?.ok && isMounted) {
          const data = await customersRes.json();
          const list = Array.isArray(data) ? data : data.data || [];
          setCustomers(list);
        }
      } catch {
        // ignore
      }
    }

    loadReferenceData();
    return () => { isMounted = false; };
  }, []);

  // ============================================================
  // LOAD RECENT SALES
  // ============================================================

  const loadRecentSales = useCallback(async () => {
    try {
      const res = await fetch("/api/pos/sales?pageSize=10&page=1", {
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const data = await res.json();
        const sales = Array.isArray(data) ? data : data.data || [];
        setRecentSales(
          sales.map((s: Record<string, unknown>) => ({
            id: s.id as string,
            receiptNo: s.receiptNo as string,
            date: s.date as string,
            grandTotal: (s.grandTotal as number) || 0,
            customerName: (s.customerName as string) || "Walk-in",
            cashierName: (s.cashierName as string) || "",
            status: (s.status as string) || "Completed",
            lineCount: (s.lineCount as number) || 0,
          }))
        );
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadRecentSales();
  }, [loadRecentSales]);

  // ============================================================
  // D3: CHECKOUT — Optimistic Rendering + Spin-Lock + Rollback
  // ============================================================

  const handleCheckout = useCallback(async () => {
    if (!isPaymentSufficient) return;
    if (cart.length === 0) return;
    if (!selectedGodownId) {
      setStockWarning("Please select a godown before checkout");
      setTimeout(() => setStockWarning(null), 3000);
      return;
    }

    // D3: Save snapshot for rollback
    setPosCartSnapshot([...cart]);

    // D3: Spin-Lock — lock entire terminal
    setIsLoading(true);
    setCheckoutMessage(null);
    setCheckoutSuccess(false);

    try {
      const lines = cart.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
        rate: item.rate,
        discountPercent: item.discountPercent,
        costPrice: item.costPrice,
      }));

      const payload = {
        customerId: selectedCustomerId === "walk-in" ? null : selectedCustomerId,
        godownId: selectedGodownId,
        cashierName: getCashierName(),
        lines,
        cashAmount: payment.cashAmount,
        cardAmount: payment.cardAmount,
        mfsAmount: payment.mfsAmount,
        discountPercent,
        vatPercentage,
        companyId: selectedCompanyId || getCompanyId() || undefined,
      };

      const res = await fetch("/api/pos/checkout", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Checkout failed" }));
        // D3: Rollback on failure
        setCart(posCartSnapshot);
        setCheckoutMessage(`Checkout failed: ${errData.error || "Unknown error"}`);
        setCheckoutSuccess(false);
        setIsLoading(false);
        return;
      }

      const result = await res.json();
      setCheckoutSuccess(true);
      setCheckoutMessage(
        `Sale completed! Receipt: ${result.receiptNo || "N/A"}`
      );

      // D4: Trigger thermal receipt print
      triggerThermalPrint(result);

      // Reset cart and payment
      setCart([]);
      setPayment({ cashAmount: 0, cardAmount: 0, mfsAmount: 0 });
      setDiscountPercent(0);
      setVatPercentage(0);
      setIsLoading(false);

      // Reload recent sales
      loadRecentSales();

      // Clear success message after 5 seconds
      setTimeout(() => {
        setCheckoutMessage(null);
        setCheckoutSuccess(false);
      }, 5000);
    } catch (error) {
      // D3: Rollback on failure
      setCart(posCartSnapshot);
      setCheckoutMessage(
        `Checkout failed: ${error instanceof Error ? error.message : "Network error"}`
      );
      setCheckoutSuccess(false);
      setIsLoading(false);
    }
  }, [
    isPaymentSufficient,
    cart,
    selectedGodownId,
    selectedCustomerId,
    selectedCompanyId,
    payment,
    discountPercent,
    vatPercentage,
    posCartSnapshot,
    loadRecentSales,
  ]);

  // ============================================================
  // D4: THERMAL RECEIPT PRINT ENGINE
  // ============================================================

  const selectedCompany = useMemo(() => {
    return companies.find((c) => c.id === selectedCompanyId) || companies[0] || null;
  }, [companies, selectedCompanyId]);

  const triggerThermalPrint = useCallback(
    (checkoutResult: Record<string, unknown>) => {
      // Build receipt data and trigger window.print()
      // The thermal-receipt div is always rendered; we just need to trigger the print
      setTimeout(() => {
        try {
          window.print();
        } catch {
          // ignore print errors
        }
      }, 500);
    },
    []
  );

  // ============================================================
  // CLOSE SEARCH RESULTS ON OUTSIDE CLICK
  // ============================================================

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        searchResultsRef.current &&
        !searchResultsRef.current.contains(e.target as Node) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(e.target as Node)
      ) {
        setShowSearchResults(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ============================================================
  // HANDLE PAYMENT INPUT — real-time binding
  // ============================================================

  const handlePaymentChange = useCallback(
    (field: keyof PosPayment, value: string) => {
      const numVal = parseFloat(value) || 0;
      setPayment((prev) => ({ ...prev, [field]: Math.max(0, numVal) }));
    },
    []
  );

  // Quick-cash shortcuts
  const setQuickCash = useCallback(
    (amount: number) => {
      setPayment((prev) => ({ ...prev, cashAmount: amount }));
    },
    []
  );

  // Exact cash
  const setExactCash = useCallback(() => {
    setPayment((prev) => ({
      ...prev,
      cashAmount: safeRound(grandTotal - prev.cardAmount - prev.mfsAmount),
    }));
  }, [grandTotal]);

  // ============================================================
  // RENDER: THERMAL RECEIPT (hidden, only visible during print)
  // ============================================================

  const receiptNo = `POS-${String(Date.now()).slice(-5)}`;
  const receiptDate = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const renderThermalReceipt = () => (
    <div
      id="thermal-receipt"
      style={{
        display: "none",
        fontFamily: "'Courier New', Courier, monospace",
        fontSize: "12px",
        lineHeight: "1.4",
        maxWidth: "80mm",
        margin: "0 auto",
        padding: "5mm",
        background: "#fff",
        color: "#000",
      }}
    >
      {/* Company Logo */}
      {(selectedCompany?.logoData || selectedCompany?.logo || selectedCompany?.brandLogo) && (
        <div style={{ textAlign: "center", marginBottom: "4px" }}>
          <img
            src={selectedCompany.logoData || selectedCompany.logo || selectedCompany.brandLogo}
            alt="Logo"
            style={{ maxHeight: "60px", maxWidth: "100%" }}
          />
        </div>
      )}

      {/* Company Header */}
      <div style={{ textAlign: "center", marginBottom: "4px" }}>
        <div style={{ fontWeight: "bold", fontSize: "14px" }}>{selectedCompany?.name || "VoltERP"}</div>
        {selectedCompany?.address && <div>{selectedCompany.address}</div>}
        {(selectedCompany?.phone || selectedCompany?.mobile) && (
          <div>Phone: {selectedCompany.phone || selectedCompany.mobile}</div>
        )}
        {selectedCompany?.vatNumber && <div>VAT/BIN: {selectedCompany.vatNumber}</div>}
      </div>

      {/* Dashed Separator */}
      <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />

      {/* Receipt Metadata Grid */}
      <div style={{ marginBottom: "4px" }}>
        <div>Receipt: {receiptNo}</div>
        <div>Date: {receiptDate}</div>
        <div>Cashier: {getCashierName()}</div>
        <div>
          Customer:{" "}
          {selectedCustomerId === "walk-in"
            ? "Walk-in"
            : customers.find((c) => c.id === selectedCustomerId)?.name || "Walk-in"}
        </div>
        <div>
          Godown: {godowns.find((g) => g.id === selectedGodownId)?.name || "N/A"}
        </div>
      </div>

      <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />

      {/* Item Grid */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #000" }}>
            <th style={{ textAlign: "left", padding: "2px 1px", fontSize: "11px" }}>Item</th>
            <th style={{ textAlign: "center", padding: "2px 1px", fontSize: "11px" }}>Qty</th>
            <th style={{ textAlign: "right", padding: "2px 1px", fontSize: "11px" }}>Rate</th>
            <th style={{ textAlign: "right", padding: "2px 1px", fontSize: "11px" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {cart.map((item) => (
            <tr key={item.id}>
              <td style={{ padding: "1px", fontSize: "11px", maxWidth: "30mm", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {item.name}
                {item.imeiNumber && (
                  <span style={{ display: "block", fontSize: "9px", color: "#555" }}>
                    IMEI: {item.imeiNumber}
                  </span>
                )}
              </td>
              <td style={{ textAlign: "center", padding: "1px", fontSize: "11px" }}>
                {item.quantity}
              </td>
              <td style={{ textAlign: "right", padding: "1px", fontSize: "11px" }}>
                {item.rate.toFixed(2)}
              </td>
              <td style={{ textAlign: "right", padding: "1px", fontSize: "11px" }}>
                {item.total.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />

      {/* Summary */}
      <div style={{ marginBottom: "2px" }}>
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <span>SubTotal:</span>
          <span>{subTotal.toFixed(2)}</span>
        </div>
        {discountPercent > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Discount ({discountPercent}%):</span>
            <span>-{discountAmount.toFixed(2)}</span>
          </div>
        )}
        {vatPercentage > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>VAT ({vatPercentage}%):</span>
            <span>{vatAmount.toFixed(2)}</span>
          </div>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            fontWeight: "bold",
            fontSize: "14px",
            borderTop: "1px solid #000",
            marginTop: "4px",
            paddingTop: "4px",
          }}
        >
          <span>Grand Total:</span>
          <span>{grandTotal.toFixed(2)}</span>
        </div>
      </div>

      <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />

      {/* Payment Breakdown Sub-Table */}
      <div style={{ marginBottom: "2px" }}>
        <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Payment Breakdown:</div>
        {payment.cashAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Cash:</span>
            <span>{payment.cashAmount.toFixed(2)}</span>
          </div>
        )}
        {payment.cardAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Card:</span>
            <span>{payment.cardAmount.toFixed(2)}</span>
          </div>
        )}
        {payment.mfsAmount > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>MFS (bKash/Nagad):</span>
            <span>{payment.mfsAmount.toFixed(2)}</span>
          </div>
        )}
        {cashChange > 0 && (
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
            <span>Change Due:</span>
            <span>{cashChange.toFixed(2)}</span>
          </div>
        )}
      </div>

      <div style={{ borderBottom: "1px dashed #000", margin: "6px 0" }} />

      {/* Thank You Message */}
      <div style={{ textAlign: "center", margin: "6px 0" }}>
        <div style={{ fontWeight: "bold" }}>
          {selectedCompany?.thankYouMsg || "Thank You Come Again."}
        </div>
      </div>

      {/* Legal Disclaimer */}
      <div
        style={{
          textAlign: "center",
          fontSize: "9px",
          color: "#666",
          marginTop: "4px",
          borderTop: "1px dashed #000",
          paddingTop: "4px",
        }}
      >
        {selectedCompany?.systemNote ||
          "This is a system-generated secure invoice and does not require seal or signature."}
      </div>
    </div>
  );

  // ============================================================
  // RENDER: MAIN LAYOUT
  // ============================================================

  return (
    <>
      {/* D4: @media print CSS overrides */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #thermal-receipt,
          #thermal-receipt * {
            visibility: visible !important;
          }
          #thermal-receipt {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 !important;
            padding: 5mm !important;
            background: #fff !important;
            color: #000 !important;
            font-family: "Courier New", Courier, monospace !important;
            font-size: 12px !important;
            box-shadow: none !important;
            border: none !important;
          }
        }

        @keyframes stockWarningPulse {
          0%,
          100% {
            background-color: rgba(239, 68, 68, 0.1);
          }
          50% {
            background-color: rgba(239, 68, 68, 0.3);
          }
        }

        .stock-warning-flash {
          animation: stockWarningPulse 0.5s ease-in-out 3;
        }
      `}</style>

      {/* Thermal Receipt (hidden, for print only) */}
      {renderThermalReceipt()}

      {/* Main POS Terminal Layout */}
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-7 w-7 text-blue-400" />
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                POS Terminal
              </h1>
              <p className="text-sm text-muted-foreground">
                Retail Checkout — Scan, Sell & Print
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              Cashier: {getCashierName()}
            </Badge>
            {selectedGodownId && (
              <Badge className="bg-blue-600 text-white text-xs">
                {godowns.find((g) => g.id === selectedGodownId)?.name || "No Godown"}
              </Badge>
            )}
          </div>
        </div>

        {/* Stock Warning Banner */}
        {stockWarning && (
          <div className="stock-warning-flash rounded-lg border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-3 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            <span className="text-red-700 dark:text-red-300 font-medium text-sm">
              {stockWarning}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 w-6 p-0"
              onClick={() => setStockWarning(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Checkout Success Message */}
        {checkoutMessage && (
          <div
            className={`rounded-lg border p-3 flex items-center gap-3 ${
              checkoutSuccess
                ? "border-green-300 dark:border-green-800 bg-green-50 dark:bg-green-900/20"
                : "border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-900/20"
            }`}
          >
            {checkoutSuccess ? (
              <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-5 w-5 text-red-500 flex-shrink-0" />
            )}
            <span
              className={`font-medium text-sm ${
                checkoutSuccess
                  ? "text-green-700 dark:text-green-300"
                  : "text-red-700 dark:text-red-300"
              }`}
            >
              {checkoutMessage}
            </span>
          </div>
        )}

        {/* Main Grid: Left Panel (60%) + Right Panel (40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
          {/* ──────────────────────────────────────────────────── */}
          {/* LEFT PANEL — Product Search + Cart Items */}
          {/* ──────────────────────────────────────────────────── */}
          <div className="lg:col-span-3 space-y-4">
            {/* Barcode Scanner Input + Product Search */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardContent className="p-4">
                <div className="flex gap-2">
                  {/* Barcode Scanner Input */}
                  <div className="flex-1 relative">
                    <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="pos-barcode-input"
                      data-pos-input="true"
                      placeholder="Scan barcode or type product code + Enter..."
                      value={barcodeInput}
                      onChange={(e) => setBarcodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && barcodeInput.trim()) {
                          handleBarcodeLookup(barcodeInput.trim());
                          setBarcodeInput("");
                        }
                      }}
                      className="pl-10 h-12 text-base font-mono"
                      disabled={isLoading}
                    />
                  </div>

                  {/* Product Search */}
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      ref={searchInputRef}
                      placeholder="Search product by name..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        if (e.target.value.length >= 2) setShowSearchResults(true);
                      }}
                      onFocus={() => {
                        if (searchResults.length > 0) setShowSearchResults(true);
                      }}
                      className="pl-10 h-12 text-base"
                      disabled={isLoading}
                    />

                    {/* Search Results Dropdown */}
                    {showSearchResults && (
                      <div
                        ref={searchResultsRef}
                        className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xl max-h-64 overflow-y-auto"
                      >
                        {isSearching ? (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-1" />
                            Searching...
                          </div>
                        ) : searchResults.length > 0 ? (
                          searchResults.map((product) => {
                            const godownStock = selectedGodownId
                              ? product.stocks?.find((s) => s.godownId === selectedGodownId)
                              : null;
                            const stockQty = godownStock?.quantity ?? 0;

                            return (
                              <button
                                key={product.id}
                                className="w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-700/50 border-b border-slate-100 dark:border-slate-700 last:border-b-0 flex items-center justify-between"
                                onClick={() => {
                                  addProductToCart(product);
                                  setSearchQuery("");
                                  setSearchResults([]);
                                  setShowSearchResults(false);
                                }}
                              >
                                <div>
                                  <div className="font-medium text-sm text-slate-900 dark:text-white">
                                    {product.name}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {product.productCode}
                                    {product.imeiNumber && ` • IMEI: ${product.imeiNumber}`}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="font-semibold text-sm text-blue-600 dark:text-blue-400">
                                    {fmtCurrency(product.salePrice)}
                                  </div>
                                  <div
                                    className={`text-xs ${
                                      stockQty > 0
                                        ? "text-green-600 dark:text-green-400"
                                        : "text-red-500"
                                    }`}
                                  >
                                    Stock: {stockQty}
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <div className="p-4 text-center text-sm text-muted-foreground">
                            No products found
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cart Items Grid */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold flex items-center gap-2">
                    <ShoppingCart className="h-4 w-4" />
                    Cart Items
                    <Badge variant="secondary" className="ml-1">
                      {cart.length} {cart.length === 1 ? "item" : "items"}
                    </Badge>
                  </CardTitle>
                  {cart.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                      onClick={clearCart}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-4 w-4 mr-1" />
                      Clear All
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {cart.length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                    <p className="text-lg font-medium">Cart is empty</p>
                    <p className="text-sm mt-1">
                      Scan a barcode or search for a product to begin
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="max-h-[55vh]">
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {cart.map((item) => (
                        <div
                          key={item.id}
                          className="p-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <div className="flex items-start gap-4">
                            {/* Product Info */}
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                                {item.name}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5">
                                {item.productCode}
                                {item.imeiNumber && (
                                  <span className="ml-2 text-blue-500">
                                    IMEI: {item.imeiNumber}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-xs text-muted-foreground">
                                  Rate: {fmtCurrency(item.rate)}
                                </span>
                                <span className="text-xs text-muted-foreground">•</span>
                                <span className="text-xs text-muted-foreground">
                                  Stock: {item.availableStock}
                                </span>
                                {item.discountPercent > 0 && (
                                  <>
                                    <span className="text-xs text-muted-foreground">•</span>
                                    <span className="text-xs text-orange-500">
                                      Disc: {item.discountPercent}%
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Quantity Controls */}
                            <div className="flex items-center gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 w-9 p-0"
                                onClick={() => updateCartItemQuantity(item.id, -1)}
                                disabled={isLoading || item.quantity <= 1}
                              >
                                <Minus className="h-3 w-3" />
                              </Button>
                              <Input
                                type="number"
                                min={1}
                                max={item.availableStock}
                                value={item.quantity}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 1;
                                  if (val >= 1 && val <= item.availableStock) {
                                    setCart((prev) =>
                                      prev.map((ci) => {
                                        if (ci.id !== item.id) return ci;
                                        const newGross = safeRound(val * ci.rate);
                                        const newDiscAmt = safeRound(
                                          newGross * (ci.discountPercent / 100)
                                        );
                                        const newTotal = safeSubtract(newGross, newDiscAmt);
                                        return {
                                          ...ci,
                                          quantity: val,
                                          discountAmount: newDiscAmt,
                                          total: newTotal,
                                        };
                                      })
                                    );
                                  } else if (val > item.availableStock) {
                                    setStockWarning(
                                      `Stock Limit Exceeded: Only ${item.availableStock} items remaining for "${item.name}"`
                                    );
                                    setTimeout(() => setStockWarning(null), 3000);
                                  }
                                }}
                                className="w-14 h-9 text-center text-sm font-semibold p-0"
                                disabled={isLoading}
                              />
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-9 w-9 p-0"
                                onClick={() => updateCartItemQuantity(item.id, 1)}
                                disabled={isLoading || item.quantity >= item.availableStock}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>

                            {/* Line Discount */}
                            <div className="w-16">
                              <Input
                                type="number"
                                min={0}
                                max={100}
                                value={item.discountPercent}
                                onChange={(e) =>
                                  updateCartItemDiscount(
                                    item.id,
                                    parseFloat(e.target.value) || 0
                                  )
                                }
                                className="h-9 text-center text-xs p-1"
                                placeholder="Disc%"
                                disabled={isLoading}
                              />
                            </div>

                            {/* Line Total */}
                            <div className="w-24 text-right">
                              <div className="font-bold text-sm text-slate-900 dark:text-white">
                                {fmtCurrency(item.total)}
                              </div>
                              {item.discountAmount > 0 && (
                                <div className="text-xs text-red-500">
                                  -{fmtCurrency(item.discountAmount)}
                                </div>
                              )}
                            </div>

                            {/* Delete */}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-9 w-9 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                              onClick={() => removeCartItem(item.id)}
                              disabled={isLoading}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ──────────────────────────────────────────────────── */}
          {/* RIGHT PANEL — Summary, Payment, Checkout */}
          {/* ──────────────────────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-4">
            {/* Cart Summary */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Cart Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">SubTotal</span>
                  <span className="font-medium">{fmtCurrency(subTotal)}</span>
                </div>

                {/* Global Discount */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    Discount ({discountPercent}%)
                  </span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={discountPercent}
                      onChange={(e) =>
                        setDiscountPercent(
                          Math.min(Math.max(parseFloat(e.target.value) || 0, 0), 100)
                        )
                      }
                      className="w-16 h-7 text-xs text-center p-0"
                      disabled={isLoading}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-red-500">
                    <span>Discount Amount</span>
                    <span>-{fmtCurrency(discountAmount)}</span>
                  </div>
                )}

                {/* VAT */}
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">VAT ({vatPercentage}%)</span>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      value={vatPercentage}
                      onChange={(e) =>
                        setVatPercentage(
                          Math.min(Math.max(parseFloat(e.target.value) || 0, 0), 100)
                        )
                      }
                      className="w-16 h-7 text-xs text-center p-0"
                      disabled={isLoading}
                    />
                    <span className="text-xs text-muted-foreground">%</span>
                  </div>
                </div>
                {vatAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT Amount</span>
                    <span>{fmtCurrency(vatAmount)}</span>
                  </div>
                )}

                <Separator />

                <div className="flex justify-between text-lg font-bold">
                  <span>Grand Total</span>
                  <span className="text-blue-600 dark:text-blue-400">
                    {fmtCurrency(grandTotal)}
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Customer & Godown Selector */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardContent className="p-4 space-y-3">
                {/* Customer Selector */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Customer
                  </label>
                  <Select
                    value={selectedCustomerId}
                    onValueChange={setSelectedCustomerId}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="walk-in">Walk-in Customer</SelectItem>
                      {customers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} {c.phone ? `(${c.phone})` : ""} [{c.customerCode}]
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Godown Selector */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Retail Godown
                  </label>
                  <Select
                    value={selectedGodownId}
                    onValueChange={setSelectedGodownId}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select godown" />
                    </SelectTrigger>
                    <SelectContent>
                      {godowns.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.name} {g.address ? `- ${g.address}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Company Selector */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    Company
                  </label>
                  <Select
                    value={selectedCompanyId}
                    onValueChange={setSelectedCompanyId}
                    disabled={isLoading}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select company" />
                    </SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* D2: Split Payment Matrix */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <CreditCard className="h-4 w-4" />
                  Split Payment
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Cash Amount */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Banknote className="h-3 w-3" />
                    Cash Amount
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payment.cashAmount || ""}
                    onChange={(e) => handlePaymentChange("cashAmount", e.target.value)}
                    placeholder="0.00"
                    className="h-10 text-base font-semibold"
                    disabled={isLoading}
                  />
                  {/* Quick Cash Buttons */}
                  <div className="flex gap-1 mt-1.5 flex-wrap">
                    {[100, 200, 500, 1000, 2000, 5000].map((amount) => (
                      <Button
                        key={amount}
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => setQuickCash(amount)}
                        disabled={isLoading}
                      >
                        ৳{new Intl.NumberFormat('en-US').format(amount)}
                      </Button>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-2 text-blue-600 border-blue-300 dark:border-blue-700"
                      onClick={setExactCash}
                      disabled={isLoading || grandTotal <= 0}
                    >
                      Exact
                    </Button>
                  </div>
                </div>

                {/* Card Amount */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <CreditCard className="h-3 w-3" />
                    Bank Card Amount
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payment.cardAmount || ""}
                    onChange={(e) => handlePaymentChange("cardAmount", e.target.value)}
                    placeholder="0.00"
                    className="h-10 text-base font-semibold"
                    disabled={isLoading}
                  />
                </div>

                {/* MFS Amount */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <Smartphone className="h-3 w-3" />
                    MFS Mobile (bKash/Nagad)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={payment.mfsAmount || ""}
                    onChange={(e) => handlePaymentChange("mfsAmount", e.target.value)}
                    placeholder="0.00"
                    className="h-10 text-base font-semibold"
                    disabled={isLoading}
                  />
                </div>

                <Separator />

                {/* Payment Summary */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Paid</span>
                    <span className="font-medium">{fmtCurrency(totalPaid)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Grand Total</span>
                    <span className="font-medium">{fmtCurrency(grandTotal)}</span>
                  </div>

                  {/* D2: Cash Change Display */}
                  <div
                    className={`flex justify-between text-sm font-bold ${
                      cashChange > 0
                        ? "text-green-600 dark:text-green-400"
                        : cashChange < 0
                        ? "text-red-500"
                        : "text-muted-foreground"
                    }`}
                  >
                    <span>
                      {cashChange > 0
                        ? "Cash Change Due"
                        : cashChange < 0
                        ? "Amount Short"
                        : "Change Due"}
                    </span>
                    <span>
                      {cashChange > 0
                        ? fmtCurrency(cashChange)
                        : cashChange < 0
                        ? fmtCurrency(Math.abs(cashChange))
                        : "৳0.00"}
                    </span>
                  </div>

                  {/* Payment Status Badge */}
                  {!isLoading && cart.length > 0 && (
                    <div className="pt-1">
                      {isPaymentSufficient ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0 w-full justify-center py-1">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Payment Sufficient
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0 w-full justify-center py-1">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          Payment Short by {fmtCurrency(grandTotal - totalPaid)}
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* D3: Complete Checkout Button — Spin-Lock */}
            <Button
              className={`w-full h-14 text-base font-bold rounded-lg transition-all duration-200 ${
                isPaymentSufficient && cart.length > 0 && !isLoading
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/20"
                  : "bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed"
              }`}
              disabled={!isPaymentSufficient || cart.length === 0 || isLoading}
              onClick={handleCheckout}
            >
              {isLoading ? (
                <>
                  <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                  <span className="text-sm">
                    Processing Split Gateways, Syncing Double-Entries & Firing Retail Print
                    Spooler...
                  </span>
                </>
              ) : (
                <>
                  <Printer className="h-5 w-5 mr-2" />
                  Complete Checkout & Print Receipt
                </>
              )}
            </Button>

            {/* Recent POS Sales History */}
            <Card className="border-slate-200 dark:border-slate-700">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-semibold">
                    Recent Sales
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={loadRecentSales}
                    disabled={isLoading}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {recentSales.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">
                    No recent sales
                  </div>
                ) : (
                  <ScrollArea className="max-h-48">
                    <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {recentSales.map((sale) => (
                        <div
                          key={sale.id}
                          className="px-4 py-2.5 flex items-center justify-between"
                        >
                          <div>
                            <div className="font-medium text-xs text-slate-900 dark:text-white">
                              {sale.receiptNo}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {sale.customerName} • {sale.cashierName || "N/A"} •{" "}
                              {sale.lineCount} items
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-semibold text-xs text-blue-600 dark:text-blue-400">
                              {fmtCurrency(sale.grandTotal)}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {(() => { if (!sale.date) return ""; const dt = new Date(sale.date); return isNaN(dt.getTime()) ? "" : dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); })()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </>
  );
}
