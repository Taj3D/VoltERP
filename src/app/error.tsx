"use client";

import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#132240] to-[#0a1628] p-4">
      <Card className="w-full max-w-lg border-red-200 dark:border-red-800 bg-white/95 dark:bg-[#132240]/95 backdrop-blur-sm">
        <CardHeader className="bg-red-50 dark:bg-red-900/20 rounded-t-lg">
          <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <AlertTriangle className="w-5 h-5" />
            Something went wrong
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            An unexpected error occurred. This is likely a temporary issue.
            Please try again or go back to the home page.
          </p>
          {error?.message && (
            <details className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
              <summary className="cursor-pointer font-medium mb-1">
                Technical Details
              </summary>
              <pre className="whitespace-pre-wrap break-words">
                {error.message}
              </pre>
            </details>
          )}
          <div className="flex items-center gap-3">
            <Button onClick={reset} variant="default" size="sm" className="bg-[#2563eb] hover:bg-[#1d4ed8]">
              <RefreshCw className="w-4 h-4 mr-1" />
              Try Again
            </Button>
            <Button
              onClick={() => (window.location.href = "/")}
              variant="outline"
              size="sm"
            >
              <Home className="w-4 h-4 mr-1" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
