"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { TabsContent } from '@/components/ui/tabs';
import type { SessionMedicalNotes } from '@/lib/consultation/room-session-restore';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import type { PresentingComplaintCategory } from '@/lib/constants/presenting-complaints';
import { consultationService, type Diagnosis } from '@/lib/services';
import { Plus, Save, Search, Stethoscope, X } from 'lucide-react';
import { toast } from 'sonner';

export type ConsultationRoomNotesTabProps = {
  medicalNotes: SessionMedicalNotes;
  onMedicalNotesChange: React.Dispatch<React.SetStateAction<SessionMedicalNotes>>;
  presentationComplaintSearch: string;
  onPresentationComplaintSearchChange: (value: string) => void;
  presentingComplaintLibrary: PresentingComplaintCategory[];
  filteredPresentationComplaintGroups: Array<{ category: string; complaints: string[] }>;
  selectedPresentingComplaintSet: Set<string>;
  onTogglePresentationComplaint: (complaint: string) => void;
  diagnoses: Diagnosis[];
  onDiagnosesChange: (diagnoses: Diagnosis[]) => void;
  onShowAddDiagnosis: () => void;
  sessionId: number | null;
  currentPatient: ConsultationRoomPatient | null;
  onSessionUpdated: (session: unknown) => void;
};

export function ConsultationRoomNotesTab({
  medicalNotes,
  onMedicalNotesChange,
  presentationComplaintSearch,
  onPresentationComplaintSearchChange,
  presentingComplaintLibrary,
  filteredPresentationComplaintGroups,
  selectedPresentingComplaintSet,
  onTogglePresentationComplaint,
  diagnoses,
  onDiagnosesChange,
  onShowAddDiagnosis,
  sessionId,
  currentPatient,
  onSessionUpdated,
}: ConsultationRoomNotesTabProps) {
  const handleSaveMedicalNotes = async () => {
    if (!sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }

    try {
      await consultationService.updateSession(sessionId, {
        presentation_complaint: medicalNotes.presentationComplaint || '',
        history_of_presenting_illness: medicalNotes.historyOfPresentIllness || '',
        physical_examination: medicalNotes.physicalExamination || '',
        assessment: medicalNotes.assessment || '',
        plan: medicalNotes.plan || '',
        notes: '',
      });

      try {
        const updatedSession = await consultationService.getSession(sessionId);
        if (currentPatient) {
          updatedSession.patient_name = updatedSession.patient_name || currentPatient.name;
          updatedSession.patient_id = updatedSession.patient_id || currentPatient.patientId;
          updatedSession.patient_age = updatedSession.patient_age || currentPatient.age;
          updatedSession.patient_gender = updatedSession.patient_gender || currentPatient.gender;
        }
        onSessionUpdated(updatedSession);
      } catch (reloadErr) {
        console.warn('Could not reload session data:', reloadErr);
      }

      toast.success('Medical notes saved successfully');
    } catch (err: unknown) {
      console.error('Error saving medical notes:', err);
      const message = err instanceof Error ? err.message : 'Failed to save medical notes';
      toast.error(message);
    }
  };

  const handleRemoveDiagnosis = async (dx: Diagnosis) => {
    try {
      await consultationService.deleteDiagnosis(dx.id);
      onDiagnosesChange(diagnoses.filter((d) => d.id !== dx.id));
      toast.success('Diagnosis removed');
    } catch (err) {
      console.error('Error deleting diagnosis:', err);
      toast.error('Failed to remove diagnosis');
    }
  };

  return (
    <TabsContent value="notes">
      <Card>
        <CardHeader>
          <CardTitle>Medical Notes</CardTitle>
          <CardDescription>Document the consultation findings and plan</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Presentation Complaint</Label>
            <p className="text-xs text-muted-foreground">
              Search and select one or more presenting complaints.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={presentationComplaintSearch}
                onChange={(e) => onPresentationComplaintSearchChange(e.target.value)}
                placeholder="Search complaint library..."
                className="pl-9"
              />
            </div>
            <div className="max-h-72 overflow-y-auto rounded-md border p-2 space-y-2">
              {filteredPresentationComplaintGroups.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted-foreground">
                  {presentingComplaintLibrary.length === 0
                    ? 'No presenting complaints configured yet. Add entries in Admin > Settings > Consultation.'
                    : 'No matching complaint found.'}
                </p>
              ) : (
                filteredPresentationComplaintGroups.map((group) => (
                  <details
                    key={group.category}
                    open={presentationComplaintSearch.trim().length > 0}
                    className="rounded-md border bg-muted/20"
                  >
                    <summary className="px-3 py-2 cursor-pointer text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center justify-between">
                      <span>{group.category}</span>
                      <span className="normal-case text-[11px]">
                        {group.complaints.filter((c) => selectedPresentingComplaintSet.has(c.toLowerCase())).length}/
                        {group.complaints.length}
                      </span>
                    </summary>
                    <div className="p-2 pt-0 space-y-1">
                      {group.complaints.map((complaint) => {
                        const normalizedComplaint = complaint.toLowerCase();
                        const selected = selectedPresentingComplaintSet.has(normalizedComplaint);

                        return (
                          <div
                            key={`${group.category}-${complaint}`}
                            role="button"
                            tabIndex={0}
                            className="w-full flex items-start gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/70 transition-colors cursor-pointer"
                            onClick={() => onTogglePresentationComplaint(complaint)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onTogglePresentationComplaint(complaint);
                              }
                            }}
                          >
                            <Checkbox checked={selected} className="mt-0.5 pointer-events-none" />
                            <span className="text-sm">{complaint}</span>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))
              )}
            </div>
            <Textarea
              value={medicalNotes.presentationComplaint}
              onChange={(e) =>
                onMedicalNotesChange((prev) => ({
                  ...prev,
                  presentationComplaint: e.target.value,
                }))
              }
              placeholder="Additional free-text complaint details (optional)..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>History of Present Illness</Label>
            <Textarea
              value={medicalNotes.historyOfPresentIllness}
              onChange={(e) =>
                onMedicalNotesChange({ ...medicalNotes, historyOfPresentIllness: e.target.value })
              }
              placeholder="Detailed history..."
              rows={4}
            />
          </div>
          <div className="space-y-2">
            <Label>Physical Examination</Label>
            <Textarea
              value={medicalNotes.physicalExamination}
              onChange={(e) =>
                onMedicalNotesChange({ ...medicalNotes, physicalExamination: e.target.value })
              }
              placeholder="Examination findings..."
              rows={4}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Diagnosis (ICD-10)</Label>
              <Button variant="outline" size="sm" onClick={onShowAddDiagnosis}>
                <Plus className="h-4 w-4 mr-1" />
                Add Diagnosis
              </Button>
            </div>

            {diagnoses.length === 0 ? (
              <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground">
                <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No diagnoses added yet</p>
                <p className="text-xs">Click &quot;Add Diagnosis&quot; to search and add ICD-10 codes</p>
              </div>
            ) : (
              <div className="rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50/80 dark:bg-red-950/25 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-red-200/80 dark:border-red-900/40 bg-red-100/50 dark:bg-red-950/40">
                      <th className="text-left p-2.5 font-medium text-red-900 dark:text-red-200">ICD-10</th>
                      <th className="text-left p-2.5 font-medium text-red-900 dark:text-red-200">Diagnosis</th>
                      <th className="text-center p-2.5 font-medium text-red-900 dark:text-red-200">Type</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diagnoses.map((dx) => {
                      const diagnosisType =
                        dx.certainty === 'confirmed'
                          ? 'Primary'
                          : dx.certainty === 'probable'
                            ? 'Secondary'
                            : 'Differential';
                      const typeBadgeStyles =
                        dx.certainty === 'confirmed'
                          ? 'bg-red-500/15 text-red-700 border-red-500/35 dark:text-red-300'
                          : dx.certainty === 'probable'
                            ? 'bg-amber-500/15 text-amber-800 border-amber-500/35 dark:text-amber-300'
                            : 'bg-blue-500/15 text-blue-800 border-blue-500/35 dark:text-blue-300';
                      const diagnosisText =
                        dx.icd10_code_details?.description || dx.diagnosis_text || 'Unknown diagnosis';
                      const notesText =
                        dx.notes ||
                        (dx.diagnosis_text &&
                        dx.diagnosis_text !== (dx.icd10_code_details?.description ?? '')
                          ? dx.diagnosis_text
                          : '');

                      return (
                        <tr key={dx.id} className="border-t border-red-200/60 dark:border-red-900/30 align-top">
                          <td className="p-2.5 font-mono text-xs font-medium text-red-900 dark:text-red-100">
                            {dx.icd10_code_details?.code || 'Unknown'}
                          </td>
                          <td className="p-2.5 text-red-950 dark:text-red-50">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="font-medium">{diagnosisText}</p>
                                {notesText ? (
                                  <p className="text-xs text-muted-foreground mt-0.5">{notesText}</p>
                                ) : null}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 shrink-0 rounded-full"
                                onClick={() => void handleRemoveDiagnosis(dx)}
                                title="Remove diagnosis"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                          <td className="p-2.5 text-center">
                            <Badge variant="outline" className={`text-[10px] ${typeBadgeStyles}`}>
                              {diagnosisType}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label>Assessment</Label>
            <Textarea
              value={medicalNotes.assessment}
              onChange={(e) => onMedicalNotesChange({ ...medicalNotes, assessment: e.target.value })}
              placeholder="Clinical assessment and reasoning..."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Plan</Label>
            <Textarea
              value={medicalNotes.plan}
              onChange={(e) => onMedicalNotesChange({ ...medicalNotes, plan: e.target.value })}
              placeholder="Treatment plan, follow-up instructions..."
              rows={4}
            />
          </div>
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={() => void handleSaveMedicalNotes()}
          >
            <Save className="mr-2 h-4 w-4" />
            Save Medical Notes
          </Button>
        </CardContent>
      </Card>
    </TabsContent>
  );
}
