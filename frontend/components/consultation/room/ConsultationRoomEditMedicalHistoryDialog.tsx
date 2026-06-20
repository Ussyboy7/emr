"use client";

import { Badge } from '@/components/ui/badge';
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
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import { patientService } from '@/lib/services';
import { resolvePatientNumericId } from '@/lib/utils/patient-id';
import { AlertTriangle, FileText, Loader2, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import type { Dispatch, SetStateAction } from 'react';

export type MedicalHistoryFormState = {
  allergies: string[];
  diagnoses: Array<{
    code?: string;
    name: string;
    status: string;
    diagnosedDate?: string;
    treatingDoctor?: string;
  }>;
  surgicalHistory: Array<{ procedure: string; date: string; hospital: string }>;
  familyHistory: Array<{ relation: string; condition: string }>;
  socialHistory: {
    smoking: string;
    alcohol: string;
    exercise: string;
    occupation: string;
  };
};

export type ConsultationRoomEditMedicalHistoryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPatient: ConsultationRoomPatient | null;
  medicalHistory: MedicalHistoryFormState;
  setMedicalHistory: Dispatch<SetStateAction<MedicalHistoryFormState>>;
  loadingMedicalHistory: boolean;
  setLoadingMedicalHistory: (loading: boolean) => void;
};

export function ConsultationRoomEditMedicalHistoryDialog({ open, onOpenChange, currentPatient, medicalHistory, setMedicalHistory, loadingMedicalHistory, setLoadingMedicalHistory }: ConsultationRoomEditMedicalHistoryDialogProps) {
  return (
    <>
      {/* Edit Medical History Dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={MODAL_SIZES.lg}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-blue-500" />
              Edit Medical History
            </DialogTitle>
            <DialogDescription>
              Update surgical history, family history, and social history for {currentPatient?.name}
            </DialogDescription>
          </DialogHeader>
          
          {loadingMedicalHistory ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading medical history...</span>
            </div>
          ) : (
            <div className="space-y-6 py-4">
              {/* Allergies */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Allergies</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const newAllergy = prompt('Enter allergy name:');
                      if (newAllergy && newAllergy.trim()) {
                        setMedicalHistory(prev => ({
                          ...prev,
                          allergies: [...prev.allergies, newAllergy.trim()],
                        }));
                      }
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Allergy
                  </Button>
                </div>
                {medicalHistory.allergies.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No allergies recorded</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {medicalHistory.allergies.map((allergy, index) => (
                      <Badge key={index} className="bg-red-600 text-white hover:bg-red-700 pr-1">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        {allergy}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setMedicalHistory(prev => ({
                              ...prev,
                              allergies: prev.allergies.filter((_, i) => i !== index),
                            }));
                          }}
                          className="h-4 w-4 p-0 ml-1 hover:bg-red-800"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Chronic Conditions (Diagnoses) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Chronic Conditions</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMedicalHistory(prev => ({
                        ...prev,
                        diagnoses: [...prev.diagnoses, { name: '', code: '', status: 'Active', diagnosedDate: '' }],
                      }));
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Condition
                  </Button>
                </div>
                {medicalHistory.diagnoses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No chronic conditions recorded</p>
                ) : (
                  <div className="space-y-2">
                    {medicalHistory.diagnoses.map((diagnosis, index) => (
                      <div key={index} className="p-3 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-muted-foreground">Condition #{index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMedicalHistory(prev => ({
                                ...prev,
                                diagnoses: prev.diagnoses.filter((_, i) => i !== index),
                              }));
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">ICD-10 Code</Label>
                            <Input
                              value={diagnosis.code || ''}
                              onChange={(e) => {
                                const updated = [...medicalHistory.diagnoses];
                                updated[index].code = e.target.value;
                                setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                              }}
                              placeholder="e.g., I10"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Status</Label>
                            <Select
                              value={diagnosis.status}
                              onValueChange={(value) => {
                                const updated = [...medicalHistory.diagnoses];
                                updated[index].status = value;
                                setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="Resolved">Resolved</SelectItem>
                                <SelectItem value="Controlled">Controlled</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Condition Name</Label>
                          <Input
                            value={diagnosis.name}
                            onChange={(e) => {
                              const updated = [...medicalHistory.diagnoses];
                              updated[index].name = e.target.value;
                              setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                            }}
                            placeholder="e.g., Essential Hypertension"
                            className="h-8 text-xs"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Diagnosed Date</Label>
                          <Input
                            type="date"
                            value={diagnosis.diagnosedDate || ''}
                            onChange={(e) => {
                              const updated = [...medicalHistory.diagnoses];
                              updated[index].diagnosedDate = e.target.value;
                              setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                            }}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Surgical History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Surgical History</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMedicalHistory(prev => ({
                        ...prev,
                        surgicalHistory: [...prev.surgicalHistory, { procedure: '', date: '', hospital: '' }],
                      }));
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Surgery
                  </Button>
                </div>
                {medicalHistory.surgicalHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No surgical history recorded</p>
                ) : (
                  <div className="space-y-2">
                    {medicalHistory.surgicalHistory.map((surgery, index) => (
                      <div key={index} className="p-3 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-muted-foreground">Surgery #{index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMedicalHistory(prev => ({
                                ...prev,
                                surgicalHistory: prev.surgicalHistory.filter((_, i) => i !== index),
                              }));
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Procedure</Label>
                            <Input
                              value={surgery.procedure}
                              onChange={(e) => {
                                const updated = [...medicalHistory.surgicalHistory];
                                updated[index].procedure = e.target.value;
                                setMedicalHistory(prev => ({ ...prev, surgicalHistory: updated }));
                              }}
                              placeholder="e.g., Appendectomy"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Date</Label>
                            <Input
                              type="date"
                              value={surgery.date}
                              onChange={(e) => {
                                const updated = [...medicalHistory.surgicalHistory];
                                updated[index].date = e.target.value;
                                setMedicalHistory(prev => ({ ...prev, surgicalHistory: updated }));
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Hospital</Label>
                            <Input
                              value={surgery.hospital}
                              onChange={(e) => {
                                const updated = [...medicalHistory.surgicalHistory];
                                updated[index].hospital = e.target.value;
                                setMedicalHistory(prev => ({ ...prev, surgicalHistory: updated }));
                              }}
                              placeholder="Hospital name"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Family History */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Family History</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setMedicalHistory(prev => ({
                        ...prev,
                        familyHistory: [...prev.familyHistory, { relation: '', condition: '' }],
                      }));
                    }}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    Add Family Member
                  </Button>
                </div>
                {medicalHistory.familyHistory.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No family history recorded</p>
                ) : (
                  <div className="space-y-2">
                    {medicalHistory.familyHistory.map((family, index) => (
                      <div key={index} className="p-3 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-medium text-muted-foreground">Family Member #{index + 1}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMedicalHistory(prev => ({
                                ...prev,
                                familyHistory: prev.familyHistory.filter((_, i) => i !== index),
                              }));
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Relation</Label>
                            <Select
                              value={family.relation}
                              onValueChange={(value) => {
                                const updated = [...medicalHistory.familyHistory];
                                updated[index].relation = value;
                                setMedicalHistory(prev => ({ ...prev, familyHistory: updated }));
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Select relation" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Father">Father</SelectItem>
                                <SelectItem value="Mother">Mother</SelectItem>
                                <SelectItem value="Sibling">Sibling</SelectItem>
                                <SelectItem value="Grandfather">Grandfather</SelectItem>
                                <SelectItem value="Grandmother">Grandmother</SelectItem>
                                <SelectItem value="Uncle">Uncle</SelectItem>
                                <SelectItem value="Aunt">Aunt</SelectItem>
                                <SelectItem value="Other">Other</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Condition</Label>
                            <Input
                              value={family.condition}
                              onChange={(e) => {
                                const updated = [...medicalHistory.familyHistory];
                                updated[index].condition = e.target.value;
                                setMedicalHistory(prev => ({ ...prev, familyHistory: updated }));
                              }}
                              placeholder="e.g., Hypertension, Type 2 Diabetes"
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Social History */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Social History</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs">Smoking</Label>
                    <Select
                      value={medicalHistory.socialHistory.smoking}
                      onValueChange={(value) => {
                        setMedicalHistory(prev => ({
                          ...prev,
                          socialHistory: { ...prev.socialHistory, smoking: value },
                        }));
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Never">Never</SelectItem>
                        <SelectItem value="Former">Former</SelectItem>
                        <SelectItem value="Current">Current</SelectItem>
                        <SelectItem value="Occasional">Occasional</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Alcohol</Label>
                    <Select
                      value={medicalHistory.socialHistory.alcohol}
                      onValueChange={(value) => {
                        setMedicalHistory(prev => ({
                          ...prev,
                          socialHistory: { ...prev.socialHistory, alcohol: value },
                        }));
                      }}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Never">Never</SelectItem>
                        <SelectItem value="Occasional">Occasional (social)</SelectItem>
                        <SelectItem value="Regular">Regular</SelectItem>
                        <SelectItem value="Heavy">Heavy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Exercise</Label>
                    <Input
                      value={medicalHistory.socialHistory.exercise}
                      onChange={(e) => {
                        setMedicalHistory(prev => ({
                          ...prev,
                          socialHistory: { ...prev.socialHistory, exercise: e.target.value },
                        }));
                      }}
                      placeholder="e.g., 2-3 times per week"
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Occupation</Label>
                    <Input
                      value={medicalHistory.socialHistory.occupation}
                      onChange={(e) => {
                        setMedicalHistory(prev => ({
                          ...prev,
                          socialHistory: { ...prev.socialHistory, occupation: e.target.value },
                        }));
                      }}
                      placeholder="e.g., Senior Engineer - NPA"
                      className="h-8 text-xs"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={async () => {
                if (!currentPatient) return;
                setLoadingMedicalHistory(true);
                try {
                  const patientIdStr = currentPatient.patientId || currentPatient.id;
                  const numericPatientId = await resolvePatientNumericId(patientIdStr);
                  
                  await patientService.updatePatientHistory(numericPatientId, {
                    allergies: medicalHistory.allergies,
                    diagnoses: medicalHistory.diagnoses,
                    surgical_history: medicalHistory.surgicalHistory,
                    family_history: medicalHistory.familyHistory,
                    social_history: medicalHistory.socialHistory,
                  });
                  
                  toast.success('Medical history updated successfully');
                  onOpenChange(false);
                } catch (err: any) {
                  console.error('Error updating medical history:', err);
                  toast.error(err.message || 'Failed to update medical history');
                } finally {
                  setLoadingMedicalHistory(false);
                }
              }}
              disabled={loadingMedicalHistory}
            >
              {loadingMedicalHistory ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
