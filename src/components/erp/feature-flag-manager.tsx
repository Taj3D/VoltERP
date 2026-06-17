'use client';

/**
 * Feature Flag Manager Panel
 * ==========================
 *
 * Admin UI for viewing and toggling feature flags at runtime.
 * Added to System Settings > Feature Flags tab.
 *
 * Shows:
 *   - All flags with current state and source
 *   - Toggle switch to enable/disable each flag
 *   - Category, description, and since-version for each flag
 *   - Refresh button to reload from server
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RefreshCw, Flag, Shield, Palette, Zap, FlaskConical, Database } from 'lucide-react';
import { toast } from 'sonner';
import { apiFetch } from '@/lib/api-client';

interface FlagData {
  key: string;
  enabled: boolean;
  source: string;
  description: string;
  defaultValue: boolean;
  category: string;
  sinceVersion: string;
}

const CATEGORY_CONFIG = {
  security: { icon: Shield, color: 'text-rose-600 bg-rose-50 dark:bg-rose-950/30', label: 'Security' },
  ui: { icon: Palette, color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30', label: 'UI' },
  feature: { icon: Zap, color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30', label: 'Feature' },
  performance: { icon: Database, color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30', label: 'Performance' },
  experimental: { icon: FlaskConical, color: 'text-purple-600 bg-purple-50 dark:bg-purple-950/30', label: 'Experimental' },
} as const;

export function FeatureFlagManager() {
  const [flags, setFlags] = useState<FlagData[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);

  const loadFlags = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiFetch('/api/feature-flags');
      setFlags(data.flags || []);
    } catch (err) {
      toast.error('Failed to load feature flags', { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFlags();
  }, [loadFlags]);

  const toggleFlag = async (key: string, newEnabled: boolean) => {
    setUpdatingKey(key);
    try {
      await apiFetch('/api/feature-flags', {
        method: 'PUT',
        body: JSON.stringify({ key, enabled: newEnabled }),
      });
      // Update local state
      setFlags(prev =>
        prev.map(f => (f.key === key ? { ...f, enabled: newEnabled, source: 'runtime' } : f))
      );
      toast.success(`Feature "${key}" ${newEnabled ? 'enabled' : 'disabled'}`, {
        description: 'Change applied immediately (runtime + database)',
      });
    } catch (err) {
      toast.error('Failed to update flag', { description: (err as Error).message });
    } finally {
      setUpdatingKey(null);
    }
  };

  const groupedFlags = flags.reduce((acc, flag) => {
    const cat = flag.category || 'feature';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(flag);
    return acc;
  }, {} as Record<string, FlagData[]>);

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-lg">Feature Flags</CardTitle>
              <CardDescription>
                Runtime-toggleable features. Changes apply immediately without redeploy.
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={loadFlags} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {loading && flags.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="h-[500px] pr-4">
            <div className="space-y-6">
              {Object.entries(groupedFlags).map(([category, catFlags]) => {
                const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.feature;
                const Icon = config.icon;
                return (
                  <div key={category}>
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`p-1.5 rounded-md ${config.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <h4 className="font-semibold text-sm">{config.label}</h4>
                      <Badge variant="secondary" className="text-[10px]">
                        {catFlags.length}
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {catFlags.map(flag => (
                        <div
                          key={flag.key}
                          className="flex items-start justify-between gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-xs font-mono font-semibold">{flag.key}</code>
                              <Badge variant="outline" className="text-[10px] py-0">
                                v{flag.sinceVersion}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-[10px] py-0 ${
                                  flag.source === 'runtime'
                                    ? 'border-emerald-500 text-emerald-600'
                                    : flag.source === 'env'
                                    ? 'border-blue-500 text-blue-600'
                                    : 'border-muted-foreground text-muted-foreground'
                                }`}
                              >
                                {flag.source}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              {flag.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Switch
                              checked={flag.enabled}
                              onCheckedChange={(checked) => toggleFlag(flag.key, checked)}
                              disabled={updatingKey === flag.key}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                    <Separator className="mt-4" />
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
