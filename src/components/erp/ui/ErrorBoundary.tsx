"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Optional page/module name shown in the error message */
  fallbackTitle?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary that catches rendering errors at the page level.
 * Displays a user-friendly error card with a "Try Again" button that
 * resets the boundary so the component tree re-mounts.
 *
 * Usage:
 *   <ErrorBoundary fallbackTitle="Dashboard">
 *     <DashboardAnalyticsPage />
 *   </ErrorBoundary>
 */
export default class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console for developer debugging (not user-facing)
    console.error(
      `[ErrorBoundary${this.props.fallbackTitle ? ` (${this.props.fallbackTitle})` : ""}] Rendering error:`,
      error,
      errorInfo.componentStack,
    );
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      const title = this.props.fallbackTitle || "Page";

      return (
        <div className="flex items-center justify-center min-h-[400px] p-6">
          <Card className="w-full max-w-lg border-red-200 dark:border-red-800">
            <CardHeader className="bg-red-50 dark:bg-red-900/20 rounded-t-lg">
              <CardTitle className="flex items-center gap-2 text-red-700 dark:text-red-400">
                <AlertTriangle className="w-5 h-5" />
                {title} — Rendering Error
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Something went wrong while rendering this page. This is likely a
                temporary issue. Please try again or refresh the browser.
              </p>
              {this.state.error && (
                <details className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
                  <summary className="cursor-pointer font-medium mb-1">
                    Technical Details
                  </summary>
                  <pre className="whitespace-pre-wrap break-words">
                    {this.state.error.message}
                  </pre>
                </details>
              )}
              <div className="flex items-center gap-3">
                <Button onClick={this.handleRetry} variant="default" size="sm">
                  <RefreshCw className="w-4 h-4 mr-1" />
                  Try Again
                </Button>
                <Button
                  onClick={() => window.location.reload()}
                  variant="outline"
                  size="sm"
                >
                  Reload Page
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
