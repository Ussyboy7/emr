"use client";

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Stethoscope, UserCheck, FileText, Send, Calendar, Clock, Users,
  CheckCircle2, ArrowRight, Activity
} from 'lucide-react';
import { PatientAvatar } from "@/components/PatientAvatar";

const stats = [
  { label: "Today's Queue", value: 18, icon: UserCheck, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { label: 'In Consultation', value: 3, icon: Stethoscope, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { label: 'Completed', value: 12, icon: CheckCircle2, color: 'text-muted-foreground', bg: 'bg-muted' },
  { label: 'Pending Referrals', value: 5, icon: Send, color: 'text-amber-500', bg: 'bg-amber-500/10' },
];

const patientQueue = [
  { id: 1, patient: 'Adebayo Johnson', patientId: 'PAT-2024-001', visitType: 'Follow-up', waitTime: '15 min', clinic: 'General', priority: 1, patient_name: 'Adebayo Johnson', room_name: 'Room 1', room: 1 },
  { id: 2, patient: 'Fatima Mohammed', patientId: 'PAT-2024-002', visitType: 'Consultation', waitTime: '25 min', clinic: 'Eye', priority: 2, patient_name: 'Fatima Mohammed', room_name: 'Room 2', room: 2 },
  { id: 3, patient: 'Chukwu Emeka', patientId: 'PAT-2024-003', visitType: 'Emergency', waitTime: '5 min', clinic: 'General', priority: 0, patient_name: 'Chukwu Emeka', room_name: 'Room 1', room: 1 },
  { id: 4, patient: 'Grace Okonkwo', patientId: 'PAT-2024-004', visitType: 'Consultation', waitTime: '35 min', clinic: 'Physiotherapy', priority: 2, patient_name: 'Grace Okonkwo', room_name: 'Room 3', room: 3 },
];

const recentConsultations = [
  { id: 1, patient: 'Ngozi Eze', diagnosis: 'Hypertension', doctor: 'Dr. Amaka', time: '10 min ago', duration: 15 },
  { id: 2, patient: 'Olumide Afolabi', diagnosis: 'Type 2 Diabetes', doctor: 'Dr. Chidi', time: '30 min ago', duration: 20 },
  { id: 3, patient: 'Amina Bello', diagnosis: 'Upper Respiratory Infection', doctor: 'Dr. Ibrahim', time: '1 hour ago', duration: 12 },
];

export default function ConsultationDashboardPage() {
  const router = useRouter();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Stethoscope className="h-8 w-8 text-emerald-500" />
              Consultation
            </h1>
            <p className="text-muted-foreground mt-1">Physician consultations and clinical documentation</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}><stat.icon className={`h-5 w-5 ${stat.color}`} /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button onClick={() => router.push('/consultation/queue')} className="h-auto py-4 flex flex-col items-center gap-2 bg-gradient-to-br from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white">
            <UserCheck className="h-6 w-6" />
            <span>Patient Queue</span>
          </Button>
          <Button onClick={() => router.push('/consultation/consultations')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-emerald-500/30 hover:bg-emerald-500/10">
            <Stethoscope className="h-6 w-6 text-emerald-500" />
            <span>Consultations</span>
          </Button>
          <Button onClick={() => router.push('/consultation/notes')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-emerald-500/30 hover:bg-emerald-500/10">
            <FileText className="h-6 w-6 text-emerald-500" />
            <span>Clinical Notes</span>
          </Button>
          <Button onClick={() => router.push('/consultation/referrals')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-emerald-500/30 hover:bg-emerald-500/10">
            <Send className="h-6 w-6 text-emerald-500" />
            <span>Referrals</span>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Patient Queue</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => router.push('/consultation/queue')}>View All<ArrowRight className="h-4 w-4 ml-1" /></Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {patientQueue.length > 0 ? (
                  patientQueue.slice(0, 5).map((item) => {
                    const priorityLabels = ['Emergency', 'High', 'Medium', 'Low'];
                    const priorityLabel = priorityLabels[item.priority] || 'Medium';
                    const isEmergency = item.priority === 0;
                    return (
                      <div key={item.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3">
                          <PatientAvatar name={item.patient_name || 'Unknown Patient'} photoUrl={undefined} size="md" />
                          <div>
                            <p className="font-medium text-foreground">{item.patient_name || 'Unknown Patient'}</p>
                            <p className="text-xs text-muted-foreground">{item.room_name || 'Room'}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <Badge variant="outline" className={isEmergency ? 'border-rose-500/50 text-rose-600 dark:text-rose-400' : ''}>
                              {priorityLabel}
                            </Badge>
                          </div>
                          <Button 
                            size="sm" 
                            className="bg-emerald-500 hover:bg-emerald-600 text-white"
                            onClick={() => router.push(`/consultation/start-consultation?room=${item.room}`)}
                          >
                            Start
                          </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <UserCheck className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No patients in queue</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg">Recent Consultations</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {recentConsultations.length > 0 ? (
                recentConsultations.map((session) => (
                  <div key={session.id} className="flex items-start gap-3">
                    <div className="p-2 rounded-full bg-emerald-500/10"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground text-sm">{session.patient}</p>
                      <p className="text-xs text-muted-foreground">{session.diagnosis}</p>
                      <p className="text-xs text-muted-foreground mt-1">{session.duration}m • {session.time}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  No recent consultations
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
