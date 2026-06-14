'use client';

import { Card, CardContent } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2, FlaskConical, Target, Lightbulb } from 'lucide-react';
import type { CompletedSessionStats } from '@/lib/completed-sessions/completed-session-list';

type CompletedSessionStatsCardsProps = {
  stats: CompletedSessionStats;
  fourthLabel: string;
  fourthIcon?: 'findings' | 'recommendations';
};

export function CompletedSessionStatsCards({
  stats,
  fourthLabel,
  fourthIcon = 'findings',
}: CompletedSessionStatsCardsProps) {
  const FourthIcon = fourthIcon === 'recommendations' ? Lightbulb : Target;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card className="border-l-4 border-l-blue-500">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Completed</p>
              <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
            </div>
            <FlaskConical className="h-8 w-8 text-blue-400" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-emerald-500">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">With Diagnosis</p>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.withDiagnosis}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-emerald-400" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-amber-500">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Urgent</p>
              <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.urgent}</p>
            </div>
            <AlertTriangle className="h-8 w-8 text-amber-400" />
          </div>
        </CardContent>
      </Card>
      <Card className="border-l-4 border-l-rose-500">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{fourthLabel}</p>
              <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.withFindings}</p>
            </div>
            <FourthIcon className="h-8 w-8 text-rose-400" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
