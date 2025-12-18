"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  Activity, Heart, Thermometer, Wind, Droplets, Scale, TrendingUp,
  Calendar, Clock, User, AlertTriangle, CheckCircle2
} from 'lucide-react';

interface VitalsDetail {
  id: string | number;
  date?: string;
  time?: string;
  recordedAt?: string;
  recordedBy?: string;
  bloodPressureSystolic?: string;
  bloodPressureDiastolic?: string;
  pulse?: string;
  temperature?: string;
  respiratoryRate?: string;
  oxygenSaturation?: string;
  weight?: string;
  height?: string;
  bmi?: string;
  painScale?: string;
  bloodSugar?: string;
  notes?: string;
  bp?: string; // Alternative format
  temp?: string; // Alternative format
  spo2?: string; // Alternative format
  [key: string]: any;
}

interface VitalsDetailModalProps {
  vitals: VitalsDetail | null;
  patientName?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function VitalsDetailModal({ vitals, patientName, isOpen, onClose }: VitalsDetailModalProps) {
  if (!vitals) return null;

  // Normalize vitals data
  const normalizedVitals = {
    bloodPressureSystolic: vitals.bloodPressureSystolic || (vitals.bp ? vitals.bp.split('/')[0] : undefined),
    bloodPressureDiastolic: vitals.bloodPressureDiastolic || (vitals.bp ? vitals.bp.split('/')[1] : undefined),
    pulse: vitals.pulse,
    temperature: vitals.temperature || vitals.temp,
    respiratoryRate: vitals.respiratoryRate,
    oxygenSaturation: vitals.oxygenSaturation || vitals.spo2,
    weight: vitals.weight,
    height: vitals.height,
    bmi: vitals.bmi,
    painScale: vitals.painScale,
    bloodSugar: vitals.bloodSugar,
    notes: vitals.notes,
  };

  // Format date and time
  const getDateString = () => {
    if (vitals.recordedAt) {
      const date = new Date(vitals.recordedAt);
      return {
        date: date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
        time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      };
    }
    if (vitals.date || vitals.time) {
      return {
        date: vitals.date || 'Not specified',
        time: vitals.time || 'Not specified',
      };
    }
    return { date: 'Not specified', time: 'Not specified' };
  };

  const { date, time } = getDateString();

  // Calculate BMI if weight and height are available
  const calculateBMI = () => {
    if (normalizedVitals.bmi) return normalizedVitals.bmi;
    const weight = parseFloat(normalizedVitals.weight || '0');
    const height = parseFloat(normalizedVitals.height || '0');
    if (weight > 0 && height > 0) {
      const bmiValue = (weight / Math.pow(height / 100, 2)).toFixed(1);
      return bmiValue;
    }
    return null;
  };

  const bmiValue = calculateBMI();
  const bmiStatus = bmiValue ? (parseFloat(bmiValue) < 18.5 ? 'Underweight' : parseFloat(bmiValue) < 25 ? 'Normal' : parseFloat(bmiValue) < 30 ? 'Overweight' : 'Obese') : null;

  // Get vital status colors
  const getVitalStatusColor = (type: string, value: string | undefined) => {
    if (!value) return '';
    const num = parseFloat(value);
    if (isNaN(num)) return '';
    
    switch (type) {
      case 'temperature':
        if (num >= 39) return 'text-rose-600 dark:text-rose-400 font-semibold';
        if (num >= 38) return 'text-amber-600 dark:text-amber-400';
        if (num < 36) return 'text-blue-600 dark:text-blue-400';
        return '';
      case 'pulse':
        if (num >= 120) return 'text-rose-600 dark:text-rose-400 font-semibold';
        if (num >= 100) return 'text-amber-600 dark:text-amber-400';
        if (num < 60) return 'text-blue-600 dark:text-blue-400';
        return '';
      case 'systolic':
        if (num >= 180) return 'text-rose-600 dark:text-rose-400 font-semibold';
        if (num >= 140) return 'text-amber-600 dark:text-amber-400';
        if (num < 90) return 'text-blue-600 dark:text-blue-400';
        return '';
      case 'oxygen':
        if (num < 90) return 'text-rose-600 dark:text-rose-400 font-semibold';
        if (num < 95) return 'text-amber-600 dark:text-amber-400';
        return '';
      default:
        return '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-rose-500" />
            Vital Signs Details
          </DialogTitle>
          <DialogDescription>
            {patientName && `${patientName} • `}
            <Calendar className="h-3 w-3 inline mr-1" />
            {date} <Clock className="h-3 w-3 inline mx-2" />
            {time}
            {vitals.recordedBy && ` • Recorded by: ${vitals.recordedBy}`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Primary Vitals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Primary Vital Signs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Blood Pressure */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Blood Pressure</p>
                  </div>
                  <p className={`text-xl font-semibold ${getVitalStatusColor('systolic', normalizedVitals.bloodPressureSystolic)}`}>
                    {normalizedVitals.bloodPressureSystolic && normalizedVitals.bloodPressureDiastolic
                      ? `${normalizedVitals.bloodPressureSystolic}/${normalizedVitals.bloodPressureDiastolic}`
                      : '-'
                    } <span className="text-sm font-normal text-muted-foreground">mmHg</span>
                  </p>
                </div>

                {/* Pulse */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Pulse</p>
                  </div>
                  <p className={`text-xl font-semibold ${getVitalStatusColor('pulse', normalizedVitals.pulse)}`}>
                    {normalizedVitals.pulse || '-'} <span className="text-sm font-normal text-muted-foreground">bpm</span>
                  </p>
                </div>

                {/* Temperature */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Thermometer className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Temperature</p>
                  </div>
                  <p className={`text-xl font-semibold ${getVitalStatusColor('temperature', normalizedVitals.temperature)}`}>
                    {normalizedVitals.temperature || '-'} <span className="text-sm font-normal text-muted-foreground">°C</span>
                  </p>
                </div>

                {/* Respiratory Rate */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Wind className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Respiratory Rate</p>
                  </div>
                  <p className="text-xl font-semibold">
                    {normalizedVitals.respiratoryRate || '-'} <span className="text-sm font-normal text-muted-foreground">/min</span>
                  </p>
                </div>

                {/* Oxygen Saturation */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Oxygen Saturation (SpO2)</p>
                  </div>
                  <p className={`text-xl font-semibold ${getVitalStatusColor('oxygen', normalizedVitals.oxygenSaturation)}`}>
                    {normalizedVitals.oxygenSaturation || '-'} <span className="text-sm font-normal text-muted-foreground">%</span>
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Secondary Vitals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Additional Measurements</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {/* Weight */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Weight</p>
                  </div>
                  <p className="text-xl font-semibold">
                    {normalizedVitals.weight || '-'} <span className="text-sm font-normal text-muted-foreground">kg</span>
                  </p>
                </div>

                {/* Height */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Height</p>
                  </div>
                  <p className="text-xl font-semibold">
                    {normalizedVitals.height || '-'} <span className="text-sm font-normal text-muted-foreground">cm</span>
                  </p>
                </div>

                {/* BMI */}
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Body Mass Index (BMI)</p>
                  {bmiValue ? (
                    <div>
                      <p className={`text-xl font-semibold ${
                        bmiStatus === 'Normal' ? 'text-emerald-600 dark:text-emerald-400' :
                        bmiStatus === 'Underweight' ? 'text-blue-600 dark:text-blue-400' :
                        bmiStatus === 'Overweight' ? 'text-amber-600 dark:text-amber-400' :
                        'text-rose-600 dark:text-rose-400'
                      }`}>
                        {bmiValue} <span className="text-sm font-normal text-muted-foreground">kg/m²</span>
                      </p>
                      <p className={`text-xs ${
                        bmiStatus === 'Normal' ? 'text-emerald-500' :
                        bmiStatus === 'Underweight' ? 'text-blue-500' :
                        bmiStatus === 'Overweight' ? 'text-amber-500' :
                        'text-rose-500'
                      }`}>
                        {bmiStatus}
                      </p>
                    </div>
                  ) : (
                    <p className="text-xl font-semibold text-muted-foreground">-</p>
                  )}
                </div>

                {/* Pain Scale */}
                {normalizedVitals.painScale && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Pain Scale</p>
                    <p className="text-xl font-semibold">
                      {normalizedVitals.painScale} <span className="text-sm font-normal text-muted-foreground">/10</span>
                    </p>
                  </div>
                )}

                {/* Blood Sugar */}
                {normalizedVitals.bloodSugar && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">Blood Sugar</p>
                    <p className="text-xl font-semibold">
                      {normalizedVitals.bloodSugar} <span className="text-sm font-normal text-muted-foreground">mg/dL</span>
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Notes */}
          {normalizedVitals.notes && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{normalizedVitals.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex justify-end pt-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

