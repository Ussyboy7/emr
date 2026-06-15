"use client";

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import { CheckCircle } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';

export type DischargeFormData = {
  discharge_type: string;
  discharge_diagnosis: string;
  discharge_notes: string;
  discharge_summary: string;
  follow_up_instructions: string;
};

export type ConsultationRoomDischargeDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPatient: ConsultationRoomPatient | null;
  dischargeData: DischargeFormData;
  setDischargeData: Dispatch<SetStateAction<DischargeFormData>>;
  onConfirmDischarge: () => void | Promise<void>;
};

export function ConsultationRoomDischargeDialog({
  open,
  onOpenChange,
  currentPatient,
  dischargeData,
  setDischargeData,
  onConfirmDischarge,
}: ConsultationRoomDischargeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Discharge Patient: {currentPatient?.name}</DialogTitle>
          <DialogDescription>
            Complete patient discharge from ward. This will end their hospital admission.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Discharge Type</Label>
              <Select
                value={dischargeData.discharge_type}
                onValueChange={(value) => setDischargeData({ ...dischargeData, discharge_type: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="regular">Regular Discharge</SelectItem>
                  <SelectItem value="against_medical_advice">Against Medical Advice</SelectItem>
                  <SelectItem value="transfer">Transfer to Another Facility</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Discharge Diagnosis</Label>
              <Input
                value={dischargeData.discharge_diagnosis}
                onChange={(e) => setDischargeData({ ...dischargeData, discharge_diagnosis: e.target.value })}
                placeholder="Final diagnosis"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Discharge Notes</Label>
            <Textarea
              value={dischargeData.discharge_notes}
              onChange={(e) => setDischargeData({ ...dischargeData, discharge_notes: e.target.value })}
              placeholder="Clinical notes for discharge"
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Discharge Summary</Label>
            <Textarea
              value={dischargeData.discharge_summary}
              onChange={(e) => setDischargeData({ ...dischargeData, discharge_summary: e.target.value })}
              placeholder="Comprehensive discharge summary"
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label>Follow-up Instructions</Label>
            <Textarea
              value={dischargeData.follow_up_instructions}
              onChange={(e) => setDischargeData({ ...dischargeData, follow_up_instructions: e.target.value })}
              placeholder="Instructions for follow-up care"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void onConfirmDischarge()} className="bg-green-600 hover:bg-green-700">
            <CheckCircle className="h-4 w-4 mr-2" />
            Discharge Patient
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
