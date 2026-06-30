/** Anatomical sites where left/right must be recorded */
const INJECTION_SITES_NEEDING_LATERALITY = new Set([
  'Deltoid',
  'Vastus Lateralis',
  'Dorsogluteal',
  'Ventrogluteal',
  'Forearm vein',
  'Hand vein',
]);

export function injectionSiteNeedsLaterality(site: string): boolean {
  return INJECTION_SITES_NEEDING_LATERALITY.has(site);
}

export function getInjectionSiteOptions(route?: string): { value: string; label: string }[] {
  const r = (route || '').toLowerCase();
  const hasSc = r.includes('subcutaneous') || /\bsc\b/.test(r);
  const hasIm = r.includes('intramuscular') || /\bim\b/.test(r);
  const hasIv = r.includes('intravenous') || /\biv\b/.test(r) || r.includes('infusion');

  if (hasIv && !hasIm && !hasSc) {
    return [
      { value: 'Forearm vein', label: 'Forearm (peripheral IV)' },
      { value: 'Hand vein', label: 'Hand (peripheral IV)' },
      { value: 'Other IV site', label: 'Other (specify in notes)' },
    ];
  }
  if (hasSc && !hasIm) {
    return [
      { value: 'Abdomen', label: 'Abdomen (SC)' },
      { value: 'Deltoid', label: 'Outer upper arm / Deltoid (SC)' },
      { value: 'Vastus Lateralis', label: 'Anterolateral thigh (SC)' },
      { value: 'Other SC site', label: 'Other (specify in notes)' },
    ];
  }
  return [
    { value: 'Deltoid', label: 'Deltoid (Upper arm)' },
    { value: 'Vastus Lateralis', label: 'Vastus Lateralis (Thigh)' },
    { value: 'Dorsogluteal', label: 'Dorsogluteal (Buttock)' },
    { value: 'Ventrogluteal', label: 'Ventrogluteal (Hip)' },
    { value: 'Abdomen', label: 'Abdomen' },
    { value: 'Other', label: 'Other (specify in notes)' },
  ];
}

export type InjectionPerformForm = {
  site: string;
  administeredTime: string;
  notes: string;
  laterality: '' | 'Left' | 'Right';
  immediateReaction: 'none' | 'yes';
  reactionDetail: string;
};

export function emptyInjectionPerformForm(): InjectionPerformForm {
  return {
    site: '',
    administeredTime: '',
    notes: '',
    laterality: '',
    immediateReaction: 'none',
    reactionDetail: '',
  };
}

export function defaultInjectionAdminTime(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
}
