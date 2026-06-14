import type { EyeSession } from '@/lib/services/eye-care-service';

const NURSING_EYE_CHECKIN =
  /^nursing\s+pool\s+check-in(?:\s*[—–\-:]\s*(?:eye\s+clinic)?)?\s*/i;

/** Strip nursing check-in boilerplate from order chief complaint. */
export function cleanEyeChiefComplaint(raw?: string | null): string {
  if (!raw?.trim()) return '';
  let s = raw.trim().replace(NURSING_EYE_CHECKIN, '');
  s = s.replace(/continue\s+comprehensive\s+eye\s+session/gi, '');
  s = s.replace(/\bEye\s+Clinic\b/gi, '');
  s = s.replace(/\s{2,}/g, ' ').trim();
  if (/^nursing\s+pool\s+check-in[\s—–\-:]*$/i.test(s)) return '';
  return s;
}

/** Completed list subtitle — findings or cleaned complaint (diagnosis is shown as a badge). */
export function eyeCompletedSessionSubtitle(session: EyeSession): string | null {
  const order = session.order_details;
  const diagnosis = (order?.diagnosis || '').trim().toLowerCase();

  const findings = session.findings?.trim();
  if (findings) return findings;

  const cleaned = cleanEyeChiefComplaint(order?.chief_complaint);
  if (cleaned && cleaned.toLowerCase() !== diagnosis) return cleaned;

  return null;
}

/** Dashboard / queue row subtitle. */
export function eyeSessionSubtitle(session: EyeSession): string {
  const order = session.order_details;
  return (
    order?.diagnosis?.trim() ||
    session.findings?.trim() ||
    cleanEyeChiefComplaint(order?.chief_complaint) ||
    ''
  );
}
