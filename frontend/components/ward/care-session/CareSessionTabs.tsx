"use client";

import { ClipboardList, FileText, History, ListChecks, Stethoscope } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OverviewTab } from '@/components/ward/care-session/tabs/OverviewTab';
import { CareTab } from '@/components/ward/care-session/tabs/CareTab';
import { OrdersTab } from '@/components/ward/care-session/tabs/OrdersTab';
import { InstructionsTab } from '@/components/ward/care-session/tabs/InstructionsTab';
import { NotesTab } from '@/components/ward/care-session/tabs/NotesTab';
import { HistoryTab, type HistoryTabCallbacks } from '@/components/ward/care-session/tabs/HistoryTab';
import type { PatientAdmission } from '@/lib/services/ward-service';
import type { ConsultationSession } from '@/lib/services';
import type { User } from '@/lib/npa-structure';
import type { LabOrderSubmitInput } from '@/components/consultation/orders/LabOrderModal';
import type { RadiologyOrderSubmitInput } from '@/components/consultation/orders/RadiologyOrderModal';
import type { PhysioOrderSubmitInput } from '@/components/consultation/orders/PhysioOrderModal';
import type { WardObservationFormData } from '@/components/ward/WardQuickObservationForm';

export type CareSessionTab =
  | 'overview'
  | 'care'
  | 'orders'
  | 'instructions'
  | 'notes'
  | 'history';

const TABS: { value: CareSessionTab; label: string; icon: typeof History }[] = [
  { value: 'overview', label: 'Overview', icon: Stethoscope },
  { value: 'care', label: 'Care', icon: Stethoscope },
  { value: 'orders', label: 'Orders', icon: ListChecks },
  { value: 'instructions', label: 'Instructions', icon: ClipboardList },
  { value: 'notes', label: 'Notes', icon: FileText },
  { value: 'history', label: 'History', icon: History },
];

export function isCareSessionTab(v: string): v is CareSessionTab {
  return TABS.some((t) => t.value === v);
}

type Props = {
  admission: PatientAdmission;
  session: ConsultationSession | null;
  currentUser: User | null;
  activeTab: CareSessionTab;
  onTabChange: (tab: CareSessionTab) => void;
  allowAddOrders: boolean;
  allowEditCancelOrders: boolean;
  allowPerformOrders: boolean;
  orderModals: {
    lab: boolean;
    radiology: boolean;
    physio: boolean;
    eye: boolean;
    referral: boolean;
    setLab: (v: boolean) => void;
    setRadiology: (v: boolean) => void;
    setPhysio: (v: boolean) => void;
    setEye: (v: boolean) => void;
    setReferral: (v: boolean) => void;
  };
  onLabOrder: (payload: LabOrderSubmitInput) => Promise<void>;
  onRadiologyOrder: (payload: RadiologyOrderSubmitInput) => Promise<void>;
  onPhysioOrder: (payload: PhysioOrderSubmitInput) => Promise<void>;
  onReferralOrder: (payload: Record<string, unknown>) => Promise<boolean>;
  onDataChanged: () => Promise<void>;
  onAdmissionChange: (fresh: PatientAdmission) => void;
  historyReloadToken: number;
  historyCallbacks: HistoryTabCallbacks;
  patientIdForHistory: number;
  onRequestAddInstruction: () => void;
  openAddInstruction?: boolean;
  onAddInstructionOpened?: () => void;
  nursingMode?: boolean;
  observationData?: WardObservationFormData;
  onObservationChange?: (next: WardObservationFormData) => void;
  onSaveObservation?: () => void;
  isSavingObservation?: boolean;
  observationRefreshKey?: number;
};

export function CareSessionTabs({
  admission,
  session,
  currentUser,
  activeTab,
  onTabChange,
  allowAddOrders,
  allowEditCancelOrders,
  allowPerformOrders,
  orderModals,
  onLabOrder,
  onRadiologyOrder,
  onPhysioOrder,
  onReferralOrder,
  onDataChanged,
  onAdmissionChange,
  historyReloadToken,
  historyCallbacks,
  patientIdForHistory,
  onRequestAddInstruction,
  openAddInstruction,
  onAddInstructionOpened,
  nursingMode,
  observationData,
  onObservationChange,
  onSaveObservation,
  isSavingObservation,
  observationRefreshKey,
}: Props) {
  return (
    <Tabs value={activeTab} onValueChange={(v) => isCareSessionTab(v) && onTabChange(v)} className="flex flex-col">
      <TabsList className="w-full sm:w-auto justify-start overflow-x-auto h-9 shrink-0 bg-transparent p-0 gap-1">
        {TABS.map((t) => (
          <TabsTrigger key={t.value} value={t.value} className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <t.icon className="h-3 w-3 mr-1 hidden sm:inline" />
            {t.label}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="overview" className="px-1 py-4 mt-1">
        <OverviewTab admission={admission} session={session} />
      </TabsContent>
      <TabsContent value="care" className="px-1 py-4 mt-1">
        <CareTab
          admission={admission}
          nursingMode={nursingMode}
          observationData={observationData}
          onObservationChange={onObservationChange}
          onSaveObservation={onSaveObservation}
          isSavingObservation={isSavingObservation}
          observationRefreshKey={observationRefreshKey}
        />
      </TabsContent>
      <TabsContent value="orders" className="px-1 py-4 mt-1">
        <OrdersTab
          admission={admission}
          allowAddOrders={allowAddOrders}
          allowEditCancelOrders={allowEditCancelOrders}
          allowPerformOrders={allowPerformOrders}
          currentUserId={currentUser?.id != null ? Number(currentUser.id) : undefined}
          labOrderOpen={orderModals.lab}
          radiologyOrderOpen={orderModals.radiology}
          physioOrderOpen={orderModals.physio}
          eyeOrderOpen={orderModals.eye}
          referralOrderOpen={orderModals.referral}
          setLabOrderOpen={orderModals.setLab}
          setRadiologyOrderOpen={orderModals.setRadiology}
          setPhysioOrderOpen={orderModals.setPhysio}
          setEyeOrderOpen={orderModals.setEye}
          setReferralOrderOpen={orderModals.setReferral}
          onLabOrder={onLabOrder}
          onRadiologyOrder={onRadiologyOrder}
          onPhysioOrder={onPhysioOrder}
          onReferralOrder={onReferralOrder}
          onOrdersChanged={() => void onDataChanged()}
          openAddInstruction={openAddInstruction}
          onAddInstructionOpened={onAddInstructionOpened}
        />
      </TabsContent>
      <TabsContent value="instructions" className="px-1 py-4 mt-1">
        <InstructionsTab
          admission={admission}
          canCompleteInstructions={allowPerformOrders}
          canCancelInstructions={allowEditCancelOrders}
          onOrdersChanged={() => void onDataChanged()}
         canAddInstruction={allowAddOrders}
         onAddInstruction={onRequestAddInstruction}
       />
      </TabsContent>
      <TabsContent value="notes" className="px-1 py-4 mt-1">
        <NotesTab
          admission={admission}
          currentUser={currentUser}
          canWriteProgressNotes={allowAddOrders}
          canWriteHandover={allowPerformOrders}
          onNotesChanged={onAdmissionChange}
          />
      </TabsContent>
      <TabsContent value="history" className="px-1 py-4 mt-1">
        {patientIdForHistory > 0 ? (
          <HistoryTab
            patientId={patientIdForHistory}
            historyReloadToken={historyReloadToken}
            callbacks={historyCallbacks}
          />
        ) : (
          <p className="text-sm text-muted-foreground">No patient selected.</p>
        )}
      </TabsContent>
    </Tabs>
  );
}
