import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Electronics Mart - Inventory Management System",
  description: "Enterprise-grade Inventory Management System for Electronics Mart",
  icons: {
    icon: "/logo.svg",
  },
};

// ============================================================
// INSTANT BOOT SCREEN
// Pure inline HTML+CSS shown the moment the HTML document arrives.
// Does NOT wait for JS/CSS bundles to download.
// Removed automatically once React hydrates and replaces #boot-screen.
// Critical for slow mobile connections (Bangladesh) where the
// 900KB+ JS bundle can take 30-60s to download from Vercel's HKG edge.
// ============================================================
const BOOT_SCREEN_HTML = `
<div id="boot-screen" aria-busy="true" aria-live="polite">
  <div class="boot-container">
    <div class="boot-logo" role="img" aria-label="Electronics Mart">
      <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="4" y="4" width="56" height="56" rx="12" fill="#0a1628"/>
        <path d="M20 22h24v4H20zM20 30h24v4H20zM20 38h16v4H20z" fill="#60a5fa"/>
        <circle cx="48" cy="40" r="3" fill="#34d399"/>
      </svg>
    </div>
    <h1 class="boot-title">Electronics Mart</h1>
    <p class="boot-subtitle">Inventory Management System</p>
    <div class="boot-spinner" role="progressbar" aria-label="Loading">
      <div class="boot-spinner-bar"></div>
    </div>
    <p class="boot-loading-text">Loading... Please wait</p>
    <p class="boot-version">v2.1 &middot; Secured</p>
  </div>
  <style>
    #boot-screen {
      position: fixed;
      inset: 0;
      z-index: 99999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0a1628 0%, #132240 50%, #0a1628 100%);
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      text-align: center;
      padding: 1rem;
      box-sizing: border-box;
    }
    #boot-screen * { box-sizing: border-box; }
    .boot-container {
      max-width: 360px;
      width: 100%;
    }
    .boot-logo {
      margin: 0 auto 1.25rem;
      width: 64px;
      height: 64px;
      filter: drop-shadow(0 4px 12px rgba(96, 165, 250, 0.3));
      animation: boot-pulse 2s ease-in-out infinite;
    }
    .boot-title {
      font-size: 1.5rem;
      font-weight: 700;
      margin: 0 0 0.25rem;
      color: #f1f5f9;
      letter-spacing: -0.02em;
    }
    .boot-subtitle {
      font-size: 0.875rem;
      color: #94a3b8;
      margin: 0 0 1.75rem;
      font-weight: 400;
    }
    .boot-spinner {
      width: 100%;
      height: 4px;
      background: rgba(148, 163, 184, 0.15);
      border-radius: 999px;
      overflow: hidden;
      margin: 0 auto 1rem;
      max-width: 200px;
    }
    .boot-spinner-bar {
      height: 100%;
      width: 40%;
      background: linear-gradient(90deg, #60a5fa, #34d399);
      border-radius: 999px;
      animation: boot-slide 1.4s ease-in-out infinite;
    }
    .boot-loading-text {
      font-size: 0.8125rem;
      color: #cbd5e1;
      margin: 0 0 0.5rem;
      font-weight: 500;
    }
    .boot-version {
      font-size: 0.6875rem;
      color: #64748b;
      margin: 0;
      letter-spacing: 0.05em;
    }
    @keyframes boot-slide {
      0% { transform: translateX(-100%); }
      100% { transform: translateX(350%); }
    }
    @keyframes boot-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.85; transform: scale(0.97); }
    }
    @media (max-width: 480px) {
      .boot-title { font-size: 1.25rem; }
      .boot-subtitle { font-size: 0.8125rem; }
    }
    @media (prefers-reduced-motion: reduce) {
      .boot-logo, .boot-spinner-bar { animation: none; }
      .boot-spinner-bar { width: 100%; }
    }
  </style>
</div>
<script id="boot-screen-remover">
  // Hide boot screen as soon as React starts rendering
  (function() {
    function removeBootScreen() {
      var el = document.getElementById('boot-screen');
      if (el) {
        el.style.transition = 'opacity 0.3s ease';
        el.style.opacity = '0';
        setTimeout(function() {
          if (el && el.parentNode) el.parentNode.removeChild(el);
        }, 300);
      }
    }
    // Try to remove on various hydration events
    window.addEventListener('load', function() {
      setTimeout(removeBootScreen, 100);
    });
    // Also expose for explicit removal
    window.__removeBootScreen = removeBootScreen;
  })();
</script>
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#0a1628" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground h-dvh overflow-hidden`}
        suppressHydrationWarning
      >
        {/* Instant boot screen - shows before JS loads, removed on hydration */}
        <div dangerouslySetInnerHTML={{ __html: BOOT_SCREEN_HTML }} />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="emart-theme"
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <Analytics />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              // Fallback: remove boot screen after 8s no matter what
              setTimeout(function() {
                var el = document.getElementById('boot-screen');
                if (el) {
                  el.style.opacity = '0';
                  setTimeout(function() {
                    if (el && el.parentNode) el.parentNode.removeChild(el);
                  }, 300);
                }
              }, 8000);
            `,
          }}
        />
      </body>
    </html>
  );
}
