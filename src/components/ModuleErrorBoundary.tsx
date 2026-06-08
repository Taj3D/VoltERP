"use client";

import React from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ModuleErrorBoundaryProps {
  children: React.ReactNode;
  /** Display name of the module (shown in error UI) */
  moduleName: string;
}

interface ModuleErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Per-module Error Boundary that isolates crashes to a single module
 * so one broken page doesn't take down the entire app.
 *
 * Displays a user-friendly error card with:
 *  - Module name in the heading
 *  - Truncated error description
 *  - "Retry" button (resets error state, re-mounts children)
 *  - "Go to Dashboard" button (navigates to home)
 *
 * Usage:
 *   <ModuleErrorBoundary moduleName="Investment">
 *     <React.Suspense fallback={<LazyFallback />}>
 *       <InvestmentGroupPage />
 *     </React.Suspense>
 *   </ModuleErrorBoundary>
 */
export default class ModuleErrorBoundary extends React.Component<
  ModuleErrorBoundaryProps,
  ModuleErrorBoundaryState
> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error(
      `[ModuleErrorBoundary (${this.props.moduleName})] Rendering error:`,
      error,
      errorInfo.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const { moduleName } = this.props;
      const errorMsg = this.state.error?.message || "Unknown error";
      // Truncate error description to 200 characters for the UI
      const truncatedMsg =
        errorMsg.length > 200 ? errorMsg.slice(0, 200) + "…" : errorMsg;

      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <Card className="w-full max-w-lg border-red-200 dark:border-red-800">
            <CardHeader className="bg-red-50 dark:bg-red-900/20 rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                {moduleName} — Module Error
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                The <strong>{moduleName}</strong> module encountered an error and
                couldn&apos;t load. Other modules are unaffected. You can retry
                or go back to the Dashboard.
              </p>
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
                <span className="font-medium">Error: </span>
                {truncatedMsg}
              </div>
              <div className="flex items-center gap-3">
                <Button
                  onClick={this.handleRetry}
                  variant="default"
                  size="sm"
                  className="bg-[#2563eb] hover:bg-[#1d4ed8]"
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Retry
                </Button>
                <Button
                  onClick={() => (window.location.href = "/")}
                  variant="outline"
                  size="sm"
                >
                  <Home className="w-4 h-4 mr-1" />
                  Go to Dashboard
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
