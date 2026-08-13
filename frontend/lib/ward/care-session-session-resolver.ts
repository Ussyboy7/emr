import type { ConsultationSession } from '@/lib/services';
import { consultationService } from '@/lib/services';
import type { PatientAdmission } from '@/lib/services/ward-service';

/**
 * Resolve the canonical consultation session for an admission.
 *
 * Prefers the explicitly linked `admission.consultation_session`. When the
 * link is missing (legacy rows before the backfill FK), falls back to the
 * latest session for the admission's visit.
 */
export async function resolveCareSessionAdmissionSession(
  admission: PatientAdmission,
): Promise<ConsultationSession | null> {
  const linked = admission.consultation_session;
  if (typeof linked === 'number' && linked > 0) {
    try {
      const session = await consultationService.getSession(linked);
      if (session?.id) return session;
    } catch {
      // fall through to the visit-based fallback
    }
  }
  if (!admission.visit) return null;
  try {
    const resolved = await consultationService.resolveSessionForVisit({
      visit: admission.visit,
    });
    return resolved?.id ? resolved : null;
  } catch {
    return null;
  }
}