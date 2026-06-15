"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import type { PhysioSession } from '@/lib/services';
import { formatDisplayDateTime } from '@/lib/dates';
import {
  Activity,
  Calendar,
  CheckCircle,
  ClipboardList,
  Clock,
  FileText,
  Heart,
  Lightbulb,
  Loader2,
  Scale,
  Target,
  TrendingUp,
  User,
  Wind,
} from 'lucide-react';

export type ConsultationRoomPhysioOrderViewDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedPhysioOrder: any;
  physioOrderSessions: PhysioSession[];
  loadingPhysioSessions: boolean;
};

export function ConsultationRoomPhysioOrderViewDialog({ open, onOpenChange, selectedPhysioOrder, physioOrderSessions, loadingPhysioSessions }: ConsultationRoomPhysioOrderViewDialogProps) {
  return (
    <>
      {/* Physio Order View Dialog */}
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-teal-500" />
              Physiotherapy Order Details
            </DialogTitle>
            <DialogDescription>
              PHY-{selectedPhysioOrder?.id?.toString().padStart(6, '0')} • Ordered {selectedPhysioOrder?.ordered_at ? formatDisplayDateTime(selectedPhysioOrder.ordered_at) : 'N/A'}
            </DialogDescription>
          </DialogHeader>

          {selectedPhysioOrder && (
            <div className="space-y-4">
              {/* Patient & Order Info */}
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Patient</p>
                  <p className="font-medium">{selectedPhysioOrder.patient_name}</p>
                  <p className="text-sm text-muted-foreground font-mono">{selectedPhysioOrder.patient_id}</p>
                  <p className="text-sm text-muted-foreground mt-1">{selectedPhysioOrder.location_clinic_name || ''}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Order Status</p>
                  <Badge variant="outline" className={`text-xs ${
                    selectedPhysioOrder.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600' :
                    selectedPhysioOrder.status === 'in_progress' ? 'bg-orange-500/10 text-orange-600' :
                    selectedPhysioOrder.status === 'scheduled' ? 'bg-blue-500/10 text-blue-600' :
                    'bg-gray-500/10 text-gray-600'
                  }`}>
                    {selectedPhysioOrder.status.replace('_', ' ')}
                  </Badge>
                  <p className="text-sm text-muted-foreground mt-1">
                    {selectedPhysioOrder.sessions_completed}/{selectedPhysioOrder.total_sessions} sessions
                  </p>
                </div>
              </div>

              {/* Clinical Information */}
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-xs text-muted-foreground mb-1">Diagnosis</p>
                  <p className="text-sm font-medium">{selectedPhysioOrder.diagnosis || 'N/A'}</p>
                </div>

                {selectedPhysioOrder.chief_complaint && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-muted-foreground mb-1">Chief Complaint</p>
                    <p className="text-sm">{selectedPhysioOrder.chief_complaint}</p>
                  </div>
                )}

                {selectedPhysioOrder.treatment_goal && (
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                    <p className="text-xs text-muted-foreground mb-1">Treatment Goal</p>
                    <p className="text-sm">{selectedPhysioOrder.treatment_goal}</p>
                  </div>
                )}

                {selectedPhysioOrder.special_instructions && (
                  <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                    <p className="text-xs text-muted-foreground mb-1">Special Instructions</p>
                    <p className="text-sm">{selectedPhysioOrder.special_instructions}</p>
                  </div>
                )}
              </div>

              {/* Order Timeline */}
              <div className="p-3 rounded-lg border bg-card">
                <p className="text-xs text-muted-foreground mb-2">Order Timeline</p>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                    <span>Ordered: {selectedPhysioOrder.ordered_at ? formatDisplayDateTime(selectedPhysioOrder.ordered_at) : 'N/A'}</span>
                  </div>
                  {selectedPhysioOrder.scheduled_at && (
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-amber-500"></div>
                      <span>Scheduled: {formatDisplayDateTime(selectedPhysioOrder.scheduled_at)}</span>
                    </div>
                  )}
                  {selectedPhysioOrder.completed_at && (
                    <div className="flex items-center gap-1">
                      <div className="h-2 w-2 rounded-full bg-green-500"></div>
                      <span>Completed: {formatDisplayDateTime(selectedPhysioOrder.completed_at)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Session Reports */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Session Reports ({physioOrderSessions.length})
                </h3>

                {loadingPhysioSessions ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-muted-foreground">Loading session reports...</span>
                  </div>
                ) : physioOrderSessions.length === 0 ? (
                  <div className="p-6 rounded-lg border border-dashed text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No sessions completed yet</p>
                    <p className="text-xs">Session reports will appear here once physiotherapy sessions are completed</p>
                  </div>
                ) : (
                  physioOrderSessions.map((session, index) => (
                    <Card key={session.id} className="border-l-4 border-l-teal-500">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Activity className="h-4 w-4 text-teal-500" />
                            Session {session.session_number} - {session.physiotherapist_name}
                          </CardTitle>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${
                              session.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30' :
                              session.status === 'in_progress' ? 'bg-orange-500/10 text-orange-600 border-orange-500/30' :
                              'bg-blue-500/10 text-blue-600 border-blue-500/30'
                            }`}>
                              {session.status.replace('_', ' ')}
                            </Badge>
                            {session.completed_at && (
                              <span className="text-xs text-muted-foreground">
                                {formatDisplayDateTime(session.completed_at)}
                              </span>
                            )}
                          </div>
                        </div>
                        {session.duration_minutes && (
                          <CardDescription>
                            Duration: {session.duration_minutes} minutes
                          </CardDescription>
                        )}
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* A. Patient Assessment */}
                        {(session.presenting_complaint || session.pain_level_before !== undefined || session.pain_level_after !== undefined) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-teal-700 dark:text-teal-400 flex items-center gap-2">
                              <User className="h-4 w-4" />
                              A. Patient Assessment
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.presenting_complaint && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Presenting Complaint</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.presenting_complaint}</p>
                                </div>
                              )}
                              {(session.pain_level_before !== undefined || session.pain_level_after !== undefined) && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Pain Level (0-10)</Label>
                                  <div className="flex gap-2">
                                    {session.pain_level_before !== undefined && (
                                      <Badge variant="outline" className="bg-red-50 dark:bg-red-900/20 text-red-600 border-red-200">
                                        Before: {session.pain_level_before}
                                      </Badge>
                                    )}
                                    {session.pain_level_after !== undefined && (
                                      <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-600 border-green-200">
                                        After: {session.pain_level_after}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* B. Medical & Social Background */}
                        {(session.medical_history || session.surgical_history || session.medications || session.allergies || session.social_history || session.previous_treatments) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2">
                              <Heart className="h-4 w-4" />
                              B. Medical & Social Background
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.medical_history && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Medical History</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.medical_history}</p>
                                </div>
                              )}
                              {session.surgical_history && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Surgical History</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.surgical_history}</p>
                                </div>
                              )}
                              {session.medications && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Medications</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.medications}</p>
                                </div>
                              )}
                              {session.allergies && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Allergies</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.allergies}</p>
                                </div>
                              )}
                              {session.social_history && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Social History</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.social_history}</p>
                                </div>
                              )}
                              {session.previous_treatments && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Previous Treatments</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.previous_treatments}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* C. Physical Examination */}
                        {(session.posture_gait || session.range_of_motion || session.muscle_strength || session.sensation || session.reflexes || session.special_tests || session.balance_coordination || session.assessment_findings) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-2">
                              <Scale className="h-4 w-4" />
                              C. Physical Examination
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.posture_gait && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Posture & Gait</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.posture_gait}</p>
                                </div>
                              )}
                              {session.range_of_motion && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Range of Motion</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.range_of_motion}</p>
                                </div>
                              )}
                              {session.muscle_strength && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Muscle Strength</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.muscle_strength}</p>
                                </div>
                              )}
                              {session.sensation && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Sensation</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.sensation}</p>
                                </div>
                              )}
                              {session.reflexes && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Reflexes</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.reflexes}</p>
                                </div>
                              )}
                              {session.special_tests && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Special Tests</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.special_tests}</p>
                                </div>
                              )}
                              {session.balance_coordination && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Balance & Coordination</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.balance_coordination}</p>
                                </div>
                              )}
                              {session.assessment_findings && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Assessment Findings</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.assessment_findings}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* D. Functional Evaluation */}
                        {(session.functional_assessment || session.functional_limitations || session.functional_goals || session.assistive_devices) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-blue-700 dark:text-blue-400 flex items-center gap-2">
                              <Target className="h-4 w-4" />
                              D. Functional Evaluation
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.functional_assessment && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Functional Assessment</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.functional_assessment}</p>
                                </div>
                              )}
                              {session.functional_limitations && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Functional Limitations</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.functional_limitations}</p>
                                </div>
                              )}
                              {session.functional_goals && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Functional Goals</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.functional_goals}</p>
                                </div>
                              )}
                              {session.assistive_devices && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Assistive Devices</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.assistive_devices}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* E. Clinical Reasoning */}
                        {(session.diagnosis_impression || session.prognosis || session.clinical_reasoning) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                              <Lightbulb className="h-4 w-4" />
                              E. Clinical Reasoning
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.diagnosis_impression && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Diagnosis/Impression</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.diagnosis_impression}</p>
                                </div>
                              )}
                              {session.prognosis && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Prognosis</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.prognosis}</p>
                                </div>
                              )}
                              {session.clinical_reasoning && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Clinical Reasoning</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.clinical_reasoning}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* F. Treatment Plan */}
                        {(session.treatment_performed || session.exercises_prescribed?.length || session.equipment_used?.length || session.patient_education) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-green-700 dark:text-green-400 flex items-center gap-2">
                              <ClipboardList className="h-4 w-4" />
                              F. Treatment Plan
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.treatment_performed && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Treatment Performed</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.treatment_performed}</p>
                                </div>
                              )}
                              {session.exercises_prescribed && session.exercises_prescribed.length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Exercises Prescribed</Label>
                                  <ul className="text-sm bg-muted/50 p-2 rounded list-disc pl-5">
                                    {session.exercises_prescribed.map((ex: any, idx: number) => (
                                      <li key={idx}>{typeof ex === 'string' ? ex : ex.name || ex}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {session.equipment_used && session.equipment_used.length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Equipment Used</Label>
                                  <ul className="text-sm bg-muted/50 p-2 rounded list-disc pl-5">
                                    {session.equipment_used.map((eq: any, idx: number) => (
                                      <li key={idx}>{typeof eq === 'string' ? eq : eq.name || eq}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {session.patient_education && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Patient Education</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.patient_education}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* G. Session & Continuity */}
                        {(session.session_notes || session.progress_notes || session.recommendations?.length || session.follow_up_instructions || session.next_session_plan) && (
                          <div className="space-y-2">
                            <h4 className="text-sm font-semibold text-indigo-700 dark:text-indigo-400 flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              G. Session & Continuity
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 ml-6">
                              {session.session_notes && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Session Notes</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.session_notes}</p>
                                </div>
                              )}
                              {session.progress_notes && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Progress Notes</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.progress_notes}</p>
                                </div>
                              )}
                              {session.recommendations && session.recommendations.length > 0 && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Recommendations</Label>
                                  <ul className="text-sm bg-muted/50 p-2 rounded list-disc pl-5">
                                    {session.recommendations.map((rec: any, idx: number) => (
                                      <li key={idx}>{typeof rec === 'string' ? rec : rec.text || rec}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {session.follow_up_instructions && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Follow-up Instructions</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.follow_up_instructions}</p>
                                </div>
                              )}
                              {session.next_session_plan && (
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Next Session Plan</Label>
                                  <p className="text-sm bg-muted/50 p-2 rounded">{session.next_session_plan}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
