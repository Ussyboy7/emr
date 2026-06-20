import type { PhysioSession } from '@/lib/services';

/** Shared physiotherapy session documentation fields (orders workflow). */
export type PhysioSessionFormData = {
  presenting_complaint: string;
  pain_level_before: number | null;
  pain_level_after: number | null;
  medical_history: string;
  surgical_history: string;
  medications: string;
  allergies: string;
  social_history: string;
  previous_treatments: string;
  posture_gait: string;
  range_of_motion: string;
  muscle_strength: string;
  sensation: string;
  reflexes: string;
  balance_coordination: string;
  special_tests: string;
  functional_assessment: string;
  assistive_devices: string;
  functional_goals: string;
  functional_limitations: string;
  assessment_findings: string;
  diagnosis_impression: string;
  prognosis: string;
  clinical_reasoning: string;
  treatment_performed: string;
  exercises_prescribed: string[];
  equipment_used: Record<string, unknown>[];
  patient_education: string;
  next_session_plan: string;
  session_notes: string;
  progress_notes: string;
  recommendations: Record<string, unknown>[];
  follow_up_instructions: string;
  home_exercises: Array<{ description: string } | string>;
};

export function emptyPhysioSessionForm(): PhysioSessionFormData {
  return {
    presenting_complaint: '',
    pain_level_before: null,
    pain_level_after: null,
    medical_history: '',
    surgical_history: '',
    medications: '',
    allergies: '',
    social_history: '',
    previous_treatments: '',
    posture_gait: '',
    range_of_motion: '',
    muscle_strength: '',
    sensation: '',
    reflexes: '',
    balance_coordination: '',
    special_tests: '',
    functional_assessment: '',
    assistive_devices: '',
    functional_goals: '',
    functional_limitations: '',
    assessment_findings: '',
    diagnosis_impression: '',
    prognosis: '',
    clinical_reasoning: '',
    treatment_performed: '',
    exercises_prescribed: [],
    equipment_used: [],
    patient_education: '',
    next_session_plan: '',
    session_notes: '',
    progress_notes: '',
    recommendations: [],
    follow_up_instructions: '',
    home_exercises: [],
  };
}

function exerciseLinesFromSession(session: PhysioSession): string[] {
  const ex = session.exercises_prescribed || (session as { home_exercises?: unknown[] }).home_exercises || [];
  if (!Array.isArray(ex)) return [];
  return ex.map((e) => (typeof e === 'string' ? e : String((e as { description?: string })?.description ?? '')));
}

/** Hydrate form state from an existing session row. */
export function physioSessionFormFromSession(session: PhysioSession): PhysioSessionFormData {
  const exLines = exerciseLinesFromSession(session);
  const homeEx = Array.isArray((session as { home_exercises?: unknown[] }).home_exercises)
    ? ((session as { home_exercises?: Array<{ description: string } | string> }).home_exercises ?? [])
    : exLines.map((description) => ({ description }));

  return {
    presenting_complaint: session.presenting_complaint || '',
    pain_level_before: session.pain_level_before ?? null,
    pain_level_after: session.pain_level_after ?? null,
    medical_history: session.medical_history || '',
    surgical_history: session.surgical_history || '',
    medications: session.medications || '',
    allergies: session.allergies || '',
    social_history: session.social_history || '',
    previous_treatments: session.previous_treatments || '',
    posture_gait: session.posture_gait || '',
    range_of_motion: session.range_of_motion || '',
    muscle_strength: session.muscle_strength || '',
    sensation: session.sensation || '',
    reflexes: session.reflexes || '',
    balance_coordination: session.balance_coordination || '',
    special_tests: session.special_tests || '',
    functional_assessment: session.functional_assessment || '',
    assistive_devices: session.assistive_devices || '',
    functional_goals: session.functional_goals || '',
    functional_limitations: session.functional_limitations || '',
    assessment_findings: session.assessment_findings || '',
    diagnosis_impression: session.diagnosis_impression || '',
    prognosis: session.prognosis || '',
    clinical_reasoning: session.clinical_reasoning || session.assessment_findings || '',
    treatment_performed: session.treatment_performed || '',
    exercises_prescribed: exLines,
    equipment_used: Array.isArray(session.equipment_used) ? session.equipment_used : [],
    patient_education: session.patient_education || '',
    next_session_plan: session.next_session_plan || '',
    session_notes: session.session_notes || '',
    progress_notes: session.progress_notes || '',
    recommendations: Array.isArray(session.recommendations) ? session.recommendations : [],
    follow_up_instructions: session.follow_up_instructions || '',
    home_exercises: homeEx,
  };
}

/** Defaults for a newly started session, optionally carrying forward from last completed. */
export function physioSessionFormForNewSession(lastCompleted?: PhysioSession | null): PhysioSessionFormData {
  const form = emptyPhysioSessionForm();
  if (!lastCompleted) return form;
  form.presenting_complaint = lastCompleted.presenting_complaint || '';
  form.medical_history = lastCompleted.medical_history || '';
  form.functional_goals = lastCompleted.functional_goals || '';
  form.diagnosis_impression = lastCompleted.diagnosis_impression || '';
  form.clinical_reasoning = lastCompleted.clinical_reasoning || '';
  return form;
}

/** Payload for ``updateSession`` (full documentation). */
export function physioSessionFormToUpdatePayload(form: PhysioSessionFormData): Record<string, unknown> {
  return {
    presenting_complaint: form.presenting_complaint,
    pain_level_before: form.pain_level_before ?? undefined,
    pain_level_after: form.pain_level_after ?? undefined,
    medical_history: form.medical_history,
    surgical_history: form.surgical_history,
    medications: form.medications,
    allergies: form.allergies,
    social_history: form.social_history,
    previous_treatments: form.previous_treatments,
    posture_gait: form.posture_gait,
    range_of_motion: form.range_of_motion,
    muscle_strength: form.muscle_strength,
    sensation: form.sensation,
    reflexes: form.reflexes,
    balance_coordination: form.balance_coordination,
    special_tests: form.special_tests,
    functional_assessment: form.functional_assessment,
    assistive_devices: form.assistive_devices,
    functional_goals: form.functional_goals,
    functional_limitations: form.functional_limitations,
    assessment_findings: form.assessment_findings,
    diagnosis_impression: form.diagnosis_impression,
    prognosis: form.prognosis,
    clinical_reasoning: form.clinical_reasoning,
    treatment_performed: form.treatment_performed,
    exercises_prescribed: form.exercises_prescribed.map((d) => ({ description: d })),
    equipment_used: form.equipment_used,
    patient_education: form.patient_education,
    next_session_plan: form.next_session_plan,
    session_notes: form.session_notes,
    progress_notes: form.progress_notes,
    recommendations: form.recommendations,
    follow_up_instructions: form.follow_up_instructions,
  };
}

/** Payload for in-progress save (subset). */
export function physioSessionFormToProgressPayload(form: PhysioSessionFormData): Record<string, unknown> {
  return {
    treatment_performed: form.treatment_performed,
    pain_level_after: form.pain_level_after,
    progress_notes: form.progress_notes,
  };
}

/** Payload for ``createSession`` (full assessment + in_progress). */
export function physioSessionFormToCreatePayload(form: PhysioSessionFormData): Record<string, unknown> {
  return {
    ...physioSessionFormToUpdatePayload(form),
    status: 'in_progress',
  };
}

/** Payload for completing a session. */
export function physioSessionFormToCompletionPayload(form: PhysioSessionFormData): Record<string, unknown> {
  return {
    treatment_performed: form.treatment_performed,
    pain_level_after: form.pain_level_after,
    progress_notes: form.progress_notes,
    exercises_prescribed: form.home_exercises?.length
      ? form.home_exercises
      : form.exercises_prescribed.map((description) => ({ description })),
    next_session_plan: form.next_session_plan,
    recommendations: form.recommendations,
    follow_up_instructions: form.follow_up_instructions,
  };
}
