"use client";

import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import {
  Activity,
  ClipboardList,
  Eye,
  FileText,
  History,
  Pill,
  ScanLine,
  Send,
  Syringe,
  TestTube,
} from 'lucide-react';

export function ConsultationRoomSessionTabList({
  patient,
}: {
  patient: ConsultationRoomPatient | null;
}) {
  const showAnnual = patient?.visitType === 'annual_checkup';

  return (
    <TabsList className={`grid w-full ${showAnnual ? 'grid-cols-10' : 'grid-cols-9'}`}>
      {showAnnual ? (
        <TabsTrigger value="annual_checkup" className="flex items-center gap-1">
          <ClipboardList className="h-4 w-4" />
          <span className="hidden lg:inline">Annual</span>
        </TabsTrigger>
      ) : null}
      <TabsTrigger value="notes" className="flex items-center gap-1">
        <FileText className="h-4 w-4" />
        <span className="hidden lg:inline">Notes</span>
      </TabsTrigger>
      <TabsTrigger value="prescriptions" className="flex items-center gap-1">
        <Pill className="h-4 w-4" />
        <span className="hidden lg:inline">Prescriptions</span>
      </TabsTrigger>
      <TabsTrigger value="lab" className="flex items-center gap-1">
        <TestTube className="h-4 w-4" />
        <span className="hidden lg:inline">Lab</span>
      </TabsTrigger>
      <TabsTrigger value="radiology" className="flex items-center gap-1">
        <ScanLine className="h-4 w-4" />
        <span className="hidden lg:inline">Radiology</span>
      </TabsTrigger>
      <TabsTrigger value="physiotherapy" className="flex items-center gap-1">
        <Activity className="h-4 w-4" />
        <span className="hidden lg:inline">Physio</span>
      </TabsTrigger>
      <TabsTrigger value="eyecare" className="flex items-center gap-1">
        <Eye className="h-4 w-4" />
        <span className="hidden lg:inline">Eye</span>
      </TabsTrigger>
      <TabsTrigger value="nursing" className="flex items-center gap-1">
        <Syringe className="h-4 w-4" />
        <span className="hidden lg:inline">Nursing</span>
      </TabsTrigger>
      <TabsTrigger value="referral" className="flex items-center gap-1">
        <Send className="h-4 w-4" />
        <span className="hidden lg:inline">Referral</span>
      </TabsTrigger>
      <TabsTrigger value="history" className="flex items-center gap-1">
        <History className="h-4 w-4" />
        <span className="hidden lg:inline">History</span>
      </TabsTrigger>
    </TabsList>
  );
}
