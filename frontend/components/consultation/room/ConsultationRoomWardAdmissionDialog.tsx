"use client";

import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { WardAdmission } from '@/lib/consultation/room-types';
import { formatRoomDate as formatDate, formatRoomTime as formatTime } from '@/lib/consultation/room-helpers';
import { Building2, CheckCircle } from 'lucide-react';

export type ConsultationRoomWardAdmissionDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedWardAdmission: WardAdmission | null;
};

export function ConsultationRoomWardAdmissionDialog({ open, onOpenChange, selectedWardAdmission }: ConsultationRoomWardAdmissionDialogProps) {
  return (
    <>
      {/* Observation Admission Detail Dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-blue-500" />
              Observation Admission Details
            </DialogTitle>
            <DialogDescription>
              Detailed information about the patient's observation admission
            </DialogDescription>
          </DialogHeader>

          {selectedWardAdmission && (
            <div className="space-y-6">
              {/* Basic Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Admission Information</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Admission ID:</span>
                      <span className="text-sm">{selectedWardAdmission.admission_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Admission Type:</span>
                      <Badge variant="outline">{selectedWardAdmission.admission_type}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Status:</span>
                      <Badge className={
                        selectedWardAdmission.status === 'admitted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                        selectedWardAdmission.status === 'discharged' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        'bg-gray-100 text-gray-800'
                      }>
                        {selectedWardAdmission.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Timing Information</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Admission Date:</span>
                      <span className="text-sm">{formatDate(selectedWardAdmission.admission_date)} {formatTime(selectedWardAdmission.admission_date)}</span>
                    </div>
                    {selectedWardAdmission.status === 'discharged' && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Status:</span>
                        <span className="text-sm font-medium text-green-600">Discharged</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Length of Stay:</span>
                      <span className="text-sm font-medium text-blue-600">{selectedWardAdmission.length_of_stay} days</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Ward and Bed Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Ward Information</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Ward:</span>
                      <span className="text-sm">{selectedWardAdmission.ward_name}</span>
                    </div>
                    {selectedWardAdmission.bed_number && (
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">Bed:</span>
                        <span className="text-sm">{selectedWardAdmission.bed_number}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-sm font-medium">Location:</span>
                      <span className="text-sm">{selectedWardAdmission.location_clinic_name || '—'}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-sm text-muted-foreground mb-2">Medical Information</h4>
                  <div className="space-y-2">
                    <div>
                      <span className="text-sm font-medium">Ward Assignment:</span>
                      <p className="text-sm mt-1 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-blue-700 dark:text-blue-300 font-medium">
                        {selectedWardAdmission.admission_diagnosis?.includes('Admitted to ')
                          ? selectedWardAdmission.admission_diagnosis.split('Admitted to ')[1]
                          : selectedWardAdmission.ward_name}
                      </p>
                    </div>
                    {/* Show medical diagnosis separately if it exists beyond ward assignment */}
                    {selectedWardAdmission.admission_diagnosis && !selectedWardAdmission.admission_diagnosis.includes('Admitted to ') && (
                      <div>
                        <span className="text-sm font-medium">Medical Diagnosis:</span>
                        <p className="text-sm mt-1 p-2 bg-muted rounded text-muted-foreground">
                          {selectedWardAdmission.admission_diagnosis}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Discharge Information */}
              {selectedWardAdmission.status === 'discharged' && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-800 dark:text-green-200">Patient has been discharged</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
