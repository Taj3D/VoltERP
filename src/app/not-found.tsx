"use client";

import { FileQuestion, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0a1628] via-[#132240] to-[#0a1628] p-4">
      <Card className="w-full max-w-lg border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-[#132240]/95 backdrop-blur-sm">
        <CardHeader className="rounded-t-lg text-center pb-2">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
            <FileQuestion className="w-8 h-8 text-slate-500" />
          </div>
          <CardTitle className="text-xl text-slate-900 dark:text-white">
            Page Not Found
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6 space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
            Please check the URL or navigate back to the home page.
          </p>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button
              onClick={() => (window.location.href = "/")}
              className="bg-[#2563eb] hover:bg-[#1d4ed8]"
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
