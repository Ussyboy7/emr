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
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Total Completed</p>
              <p className="text-2xl sm:text-3xl font-bold text-blue-500 mt-1">{stats.total}</p>
            </div>
            <div className="p-3 rounded-full bg-blue-500/10">
              <FlaskConical className="h-5 w-5 text-blue-500" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">With Diagnosis</p>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-500 mt-1">{stats.withDiagnosis}</p>
            </div>
            <div className="p-3 rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Urgent</p>
              <p className="text-2xl sm:text-3xl font-bold text-amber-500 mt-1">{stats.urgent}</p>
            </div>
            <div className="p-3 rounded-full bg-amber-500/10">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
            </div>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{fourthLabel}</p>
              <p className="text-2xl sm:text-3xl font-bold text-rose-500 mt-1">{stats.withFindings}</p>
            </div>
            <div className="p-3 rounded-full bg-rose-500/10">
              <FourthIcon className="h-5 w-5 text-rose-500" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
