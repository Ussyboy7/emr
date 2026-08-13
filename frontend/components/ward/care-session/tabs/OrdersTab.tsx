"use client";

import { Activity, Eye, ScanLine, Send, TestTube } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WardDoctorOrdersSection } from '@/components/ward/WardDoctorOrdersSection';
import { LabOrderModal, type LabOrderSubmitInput } from '@/components/consultation/orders/LabOrderModal';
import { RadiologyOrderModal, type RadiologyOrderSubmitInput } from '@/components/consultation/orders/RadiologyOrderModal';
import { PhysioOrderModal, type PhysioOrderSubmitInput } from '@/components/consultation/orders/PhysioOrderModal';
import { NewEyeOrderModal } from '@/components/eyecare/NewEyeOrderModal';
import { WardCreateReferralDialog } from '@/components/ward/WardCreateReferralDialog';
import type { PatientAdmission } from '@/lib/services/ward-service';

type Props = {
  admission: PatientAdmission;
  allowAddOrders: boolean;
  allowEditCancelOrders: boolean;
  allowPerformOrders: boolean;
  currentUserId?: number;
  labOrderOpen: boolean;
  radiologyOrderOpen: boolean;
  physioOrderOpen: boolean;
  eyeOrderOpen: boolean;
  referralOrderOpen: boolean;
  setLabOrderOpen: (v: boolean) => void;
  setRadiologyOrderOpen: (v: boolean) => void;
  setPhysioOrderOpen: (v: boolean) => void;
  setEyeOrderOpen: (v: boolean) => void;
  setReferralOrderOpen: (v: boolean) => void;
  onLabOrder: (payload: LabOrderSubmitInput) => Promise<void>;
  onRadiologyOrder: (payload: RadiologyOrderSubmitInput) => Promise<void>;
  onPhysioOrder: (payload: PhysioOrderSubmitInput) => Promise<void>;
  onReferralOrder: (payload: Record<string, unknown>) => Promise<boolean>;
  onOrdersChanged: () => void;
  openAddInstruction?: boolean;
  onAddInstructionOpened?: () => void;
};

export function OrdersTab({
  admission,
  allowAddOrders,
  allowEditCancelOrders,
  allowPerformOrders,
  currentUserId,
  labOrderOpen,
  radiologyOrderOpen,
  physioOrderOpen,
  eyeOrderOpen,
  referralOrderOpen,
  setLabOrderOpen,
  setRadiologyOrderOpen,
  setPhysioOrderOpen,
  setEyeOrderOpen,
  setReferralOrderOpen,
  onLabOrder,
  onRadiologyOrder,
  onPhysioOrder,
  onReferralOrder,
  onOrdersChanged,
  openAddInstruction,
  onAddInstructionOpened,
}: Props) {
  return (
    <div className="space-y-3">
      {allowAddOrders && admission.status === 'admitted' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
            New order
          </span>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setLabOrderOpen(true)}>
            <TestTube className="h-3 w-3 mr-1 text-amber-500" /> Lab
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRadiologyOrderOpen(true)}>
            <ScanLine className="h-3 w-3 mr-1 text-indigo-500" /> Imaging
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPhysioOrderOpen(true)}>
            <Activity className="h-3 w-3 mr-1 text-emerald-500" /> Physio
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEyeOrderOpen(true)}>
            <Eye className="h-3 w-3 mr-1 text-cyan-600" /> Eye
          </Button>
          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setReferralOrderOpen(true)}>
            <Send className="h-3 w-3 mr-1 text-teal-500" /> Referral
          </Button>
        </div>
      )}
      <WardDoctorOrdersSection
        admission={admission}
        allowAddOrders={allowAddOrders}
        allowEditCancelOrders={allowEditCancelOrders}
        allowPerformOrders={allowPerformOrders}
        historyDisplay="collapsed"
        excludeHandoffFromList
        currentUserId={currentUserId}
        openAddInstruction={openAddInstruction}
        onAddInstructionOpened={onAddInstructionOpened}
      />

      <LabOrderModal open={labOrderOpen} onOpenChange={setLabOrderOpen} onSubmit={onLabOrder} />
      <RadiologyOrderModal open={radiologyOrderOpen} onOpenChange={setRadiologyOrderOpen} onSubmit={onRadiologyOrder} />
      <PhysioOrderModal open={physioOrderOpen} onOpenChange={setPhysioOrderOpen} onSubmit={onPhysioOrder} />
      <NewEyeOrderModal
        open={eyeOrderOpen}
        onOpenChange={setEyeOrderOpen}
        onSuccess={onOrdersChanged}
        admissionId={admission.id}
        visitId={admission.visit}
      />
      <WardCreateReferralDialog
        open={referralOrderOpen}
        onOpenChange={setReferralOrderOpen}
        admission={admission}
        onSubmit={onReferralOrder}
      />
    </div>
  );
}
