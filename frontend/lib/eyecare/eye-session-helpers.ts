import type { EyeSession } from '@/lib/services/eye-care-service';

export type DiagnosticCategory = 'pachymetry' | 'oct' | 'visual_field';

export const visualAcuityRows = [
  { key: 'distanceUnaided', label: 'Distance VA (Unaided)' },
  { key: 'distanceAided', label: 'Distance VA (Aided)' },
  { key: 'pinhole', label: 'Pinhole' },
  { key: 'nearVa', label: 'Near VA' },
];

export const examinationRows = [
  'Lid',
  'Conjunctiva',
  'Sclera',
  'Cornea',
  'Anterior Chamber (A/C)',
  'Iris',
  'Pupils',
  'Lens',
  'Optic Disc (CDR)',
  'Fundus',
].map((label) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label }));

export function diagnosticAttachmentsForCategory(session: EyeSession | null, category: DiagnosticCategory) {
  return session?.diagnostic_attachments?.filter((a) => a.category === category) ?? [];
}
