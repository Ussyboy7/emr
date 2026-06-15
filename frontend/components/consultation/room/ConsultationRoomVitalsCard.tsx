"use client";

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity } from 'lucide-react';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';

type Vitals = NonNullable<ConsultationRoomPatient['vitals']>;

export function ConsultationRoomVitalsCard({ vitals }: { vitals: Vitals }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Activity className="h-5 w-5 text-blue-600" />
          Current Vitals
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-xs text-muted-foreground">Temperature</div>
            <div className="text-lg font-bold text-blue-600">{vitals.temperature}°C</div>
          </div>
          <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <div className="text-xs text-muted-foreground">Blood Pressure</div>
            <div className="text-lg font-bold text-red-600">{vitals.bloodPressure}</div>
          </div>
          <div className="text-center p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
            <div className="text-xs text-muted-foreground">Heart Rate</div>
            <div className="text-lg font-bold text-pink-600">{vitals.heartRate} bpm</div>
          </div>
          <div className="text-center p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
            <div className="text-xs text-muted-foreground">Resp. Rate</div>
            <div className="text-lg font-bold text-cyan-600">{vitals.respiratoryRate}/min</div>
          </div>
          <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
            <div className="text-xs text-muted-foreground">SpO2</div>
            <div className="text-lg font-bold text-emerald-600">{vitals.oxygenSaturation}%</div>
          </div>
          <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
            <div className="text-xs text-muted-foreground">Weight</div>
            <div className="text-lg font-bold text-purple-600">{vitals.weight} kg</div>
          </div>
          <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
            <div className="text-xs text-muted-foreground">Height</div>
            <div className="text-lg font-bold text-orange-600">{vitals.height} cm</div>
          </div>
        </div>
        {(vitals.bmi || vitals.painScale || vitals.bloodSugar || vitals.randomBloodSugar) && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4 border-t">
            {vitals.bmi ? (
              <div className="text-center p-3 bg-slate-50 dark:bg-slate-900/20 rounded-lg">
                <div className="text-xs text-muted-foreground">BMI</div>
                <div className="text-lg font-bold text-slate-700 dark:text-slate-200">{vitals.bmi}</div>
              </div>
            ) : null}
            {vitals.painScale !== undefined && vitals.painScale !== '' ? (
              <div className="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                <div className="text-xs text-muted-foreground">Pain</div>
                <div className="text-lg font-bold text-amber-700 dark:text-amber-300">
                  {vitals.painScale}/10
                </div>
              </div>
            ) : null}
            {vitals.bloodSugar ? (
              <div className="text-center p-3 bg-violet-50 dark:bg-violet-900/20 rounded-lg">
                <div className="text-xs text-muted-foreground">Fasting Blood Sugar (FBS)</div>
                <div className="text-lg font-bold text-violet-700 dark:text-violet-300">
                  {vitals.bloodSugar} <span className="text-xs font-normal">mg/dL</span>
                </div>
              </div>
            ) : null}
            {vitals.randomBloodSugar ? (
              <div className="text-center p-3 bg-fuchsia-50 dark:bg-fuchsia-900/20 rounded-lg">
                <div className="text-xs text-muted-foreground">Random Blood Sugar (RBS)</div>
                <div className="text-lg font-bold text-fuchsia-700 dark:text-fuchsia-300">
                  {vitals.randomBloodSugar} <span className="text-xs font-normal">mg/dL</span>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
