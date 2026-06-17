'use client';

/**
 * Version Badge Component
 * =======================
 *
 * Displays the current software version in the UI header.
 * Shows a small badge with version number and release channel.
 *
 * Clicking the badge (admin only) opens a feature flag management dialog.
 */

import { useState, useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { GitBranch, Tag, Zap } from 'lucide-react';

export function VersionBadge() {
  const [version, setVersion] = useState<string>('3.0.0');
  const [channel, setChannel] = useState<'stable' | 'beta' | 'dev'>('stable');

  useEffect(() => {
    // Read version from package.json via API (or hardcoded for now)
    // In production, this would come from /api/system-info
    const detectChannel = () => {
      if (typeof window === 'undefined') return;
      const host = window.location.hostname;
      if (host.includes('localhost') || host.includes('dev')) {
        setChannel('dev');
      } else if (host.includes('beta') || host.includes('staging')) {
        setChannel('beta');
      } else {
        setChannel('stable');
      }
    };
    detectChannel();
  }, []);

  const channelColors = {
    stable: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    beta: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dev: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  };

  const channelLabels = {
    stable: 'Stable',
    beta: 'Beta',
    dev: 'Dev',
  };

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5 cursor-default">
            <Badge
              variant="outline"
              className={`h-6 px-2 text-xs font-medium border-0 ${channelColors[channel]}`}
            >
              <Tag className="h-3 w-3 mr-1" />
              v{version}
            </Badge>
            <Badge
              variant="outline"
              className={`h-6 px-1.5 text-[10px] font-semibold uppercase border-0 ${channelColors[channel]}`}
            >
              {channelLabels[channel]}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs">
          <div className="flex flex-col gap-1">
            <div className="font-semibold">Electronics Mart IMS v{version}</div>
            <div className="text-muted-foreground">Channel: {channelLabels[channel]}</div>
            <div className="text-muted-foreground">Release: 2025-01-18</div>
            <div className="flex items-center gap-1 pt-1 border-t mt-1">
              <Zap className="h-3 w-3" />
              <span>Feature Flags: Active</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
