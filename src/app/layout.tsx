import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/theme-provider";
import { BootScreen } from "@/components/boot-screen";

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
        {/* Resource hints for faster API calls and asset loading */}
        <link rel="preconnect" href="https://volterp-app.vercel.app" />
        <link rel="dns-prefetch" href="https://volterp-app.vercel.app" />
        <link rel="preconnect" href="https://fonts.googleapis.com" crossOrigin="" />
        <link rel="dns-prefetch" href="https://fonts.gstatic.com" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground h-dvh overflow-hidden`}
        suppressHydrationWarning
      >
        {/* Instant boot screen — SSR-rendered Client Component so it
            shows before the JS bundle finishes downloading, and is
            removed by the component itself once React mounts.
            No dangerouslySetInnerHTML → no hydration mismatch. */}
        <BootScreen />
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          storageKey="emart-theme"
        >
          {children}
          <Toaster />
        </ThemeProvider>
        <noscript>
          <div className="boot-noscript">
            <div>
              <h1 style={{ fontSize: "1.5rem", marginBottom: "1rem" }}>
                JavaScript Required
              </h1>
              <p style={{ color: "#94a3b8" }}>
                Please enable JavaScript to run Electronics Mart IMS.
              </p>
            </div>
          </div>
        </noscript>
        {/* Hard fallback: remove boot screen after 30s no matter what
            (was 8s — too short for slow 3G connections in Bangladesh). */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              setTimeout(function() {
                if (typeof window !== 'undefined' && window.__removeBootScreen) {
                  window.__removeBootScreen();
                } else {
                  var el = document.getElementById('boot-screen');
                  if (el) {
                    el.style.opacity = '0';
                    setTimeout(function() {
                      if (el && el.parentNode) el.parentNode.removeChild(el);
                    }, 300);
                  }
                }
              }, 30000);
            `,
          }}
        />
      </body>
    </html>
  );
}
