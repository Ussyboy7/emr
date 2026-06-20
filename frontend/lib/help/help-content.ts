import { NPA_EMR_CONTACT_EMAIL, NPA_EMR_SUPPORT_PHONE } from '@/lib/branding';

export type HelpFaq = {
  category: string;
  questions: { q: string; a: string }[];
};

/** IT support contact — single source with login/branding. */
export const SUPPORT_EMAIL = NPA_EMR_CONTACT_EMAIL;
export const SUPPORT_PHONE = NPA_EMR_SUPPORT_PHONE;
export const SUPPORT_PHONE_NOTE = 'Internal extension — use from NPA network phones when published by your site IT team';

export const helpSupportHours = [
  { days: 'Monday – Friday', hours: '8:00 AM – 6:00 PM' },
  { days: 'Saturday', hours: '9:00 AM – 2:00 PM' },
  { days: 'Sunday', hours: 'Closed', muted: true },
  { days: 'Emergency Support', hours: '24/7', highlight: true },
] as const;

export const helpFaqs: HelpFaq[] = [
  {
    category: 'Getting Started',
    questions: [
      {
        q: 'How do I register a new patient?',
        a: 'Navigate to Medical Records → Register Patient. Fill in patient details including personal information, contact details, and medical history, then save.',
      },
      {
        q: 'How do I start a consultation session?',
        a: 'Go to Consultation → Start Consultation. Select an available room, then start the session. The next patient in queue is assigned to you.',
      },
      {
        q: 'How do I access my dashboard?',
        a: 'Use the sidebar module home for your role (e.g. Nursing, Laboratory). Your dashboard shows pending work and quick actions.',
      },
      {
        q: 'Why was I signed out?',
        a: 'Sessions expire after a period of inactivity (org default 30 minutes) or when your refresh token expires. If an administrator changed your role, sign in again. Use Help → Submit Support Ticket if access problems persist.',
      },
    ],
  },
  {
    category: 'Patient Management',
    questions: [
      {
        q: 'How do I search for a patient?',
        a: 'Use Medical Records → Manage Patients. Search by name, patient ID, phone number, or personal number.',
      },
      {
        q: 'How do I update patient information?',
        a: 'Find the patient in Manage Patients, open their record, choose Edit, save your changes.',
      },
      {
        q: 'How do I add a dependent?',
        a: 'From the principal employee or retiree record use Add Dependent, or register a new patient with category Dependent and link the principal.',
      },
    ],
  },
  {
    category: 'Nursing',
    questions: [
      {
        q: 'Where is the patient queue?',
        a: 'Nursing → Pool Queue or Room Queue depending on your clinic workflow.',
      },
      {
        q: 'How do I record vitals?',
        a: 'Open the patient from the nursing queue or Nursing → Patient Vitals / Vitals History.',
      },
      {
        q: 'How do I manage ward admissions?',
        a: 'Nursing → Wards for bed management and inpatient care tasks.',
      },
    ],
  },
  {
    category: 'Consultation',
    questions: [
      {
        q: 'How do I write prescriptions?',
        a: 'During a consultation, open the Prescriptions tab, search for medication, set dose and duration, then add to the order queue.',
      },
      {
        q: 'How do I order lab tests?',
        a: 'In the consultation session, open Lab Orders, select tests, set priority, add notes, and submit to the laboratory.',
      },
      {
        q: 'How do I end a consultation session?',
        a: 'Click End Session at the top of the consultation workspace and confirm. The visit is saved and the patient leaves your queue.',
      },
    ],
  },
  {
    category: 'Laboratory',
    questions: [
      {
        q: 'How do I process a lab order?',
        a: 'Go to Laboratory → Lab Orders, open the order, collect the specimen, enter results, and submit for verification.',
      },
      {
        q: 'How do I verify lab results?',
        a: 'Open Laboratory → Results Verification, review results, then approve or reject.',
      },
      {
        q: 'What are critical values?',
        a: 'Results outside safe ranges that need immediate clinical attention. The system alerts the lab and ordering clinician.',
      },
    ],
  },
  {
    category: 'Pharmacy',
    questions: [
      {
        q: 'How do I dispense medications?',
        a: 'Go to Pharmacy → Prescriptions, verify patient and items, then dispense and complete the order.',
      },
      {
        q: 'How do I substitute a medication?',
        a: 'When dispensing, choose Substitute, pick an alternative, record the reason, and confirm.',
      },
      {
        q: 'How do I manage inventory?',
        a: 'Use Pharmacy → Inventory to add drugs, record batches, and monitor stock levels.',
      },
    ],
  },
  {
    category: 'Radiology',
    questions: [
      {
        q: 'How do I work the imaging order queue?',
        a: 'Radiology → Orders lists new requests. Open an order to schedule, perform, or update status.',
      },
      {
        q: 'How do I verify and release reports?',
        a: 'Use Radiology → Verification to review and sign off studies before clinicians see final reports.',
      },
    ],
  },
  {
    category: 'Physiotherapy & Eye Clinic',
    questions: [
      {
        q: 'How do I manage physiotherapy orders?',
        a: 'Physiotherapy → Orders for the active queue; complete sessions from the order detail view.',
      },
      {
        q: 'How do I manage eye clinic orders?',
        a: 'Eye Clinic → Orders for referrals and visits; use Completed for signed-off encounters.',
      },
    ],
  },
  {
    category: 'Human Resources',
    questions: [
      {
        q: 'Where do I see annual check-up compliance?',
        a: 'Human Resources → Annual Check-ups lists employee programme status. HR → Dashboard shows programme summary.',
      },
      {
        q: 'How do I grant a check-up exemption?',
        a: 'Human Resources → Exemptions → Grant exemption. Select the employee, programme year, and reason.',
      },
    ],
  },
  {
    category: 'Administration',
    questions: [
      {
        q: 'How do I add a user or change roles?',
        a: 'Administration → Users to manage accounts. Administration → Roles to edit page access for access roles.',
      },
      {
        q: 'Where is full system health information?',
        a: 'Administrators with System Health access should open Administration → System Health for storage, backups, and detailed probes.',
      },
    ],
  },
];

export type HelpQuickAction =
  | { title: string; description: string; kind: 'scroll'; target: 'faqs' | 'status' | 'resources' }
  | { title: string; description: string; kind: 'ticket' }
  | { title: string; description: string; kind: 'mailto'; href: string };

export const helpQuickActions: HelpQuickAction[] = [
  {
    title: 'Browse FAQs',
    description: 'Common questions by module',
    kind: 'scroll',
    target: 'faqs',
  },
  {
    title: 'Role tips',
    description: 'Getting started by module',
    kind: 'scroll',
    target: 'resources',
  },
  {
    title: 'Email Support',
    description: 'Send a message to IT',
    kind: 'mailto',
    href: `mailto:${SUPPORT_EMAIL}?subject=EMR%20Support%20Request`,
  },
  {
    title: 'Submit Ticket',
    description: 'Log an issue for follow-up',
    kind: 'ticket',
  },
  {
    title: 'System Status',
    description: 'Check service availability',
    kind: 'scroll',
    target: 'status',
  },
];

export const helpContactOptions = [
  {
    title: 'IT Help Desk',
    description: SUPPORT_PHONE_NOTE,
    contact: SUPPORT_PHONE,
    kind: 'phone' as const,
  },
  {
    title: 'Email Support',
    description: 'Non-urgent requests',
    contact: SUPPORT_EMAIL,
    kind: 'email' as const,
  },
  {
    title: 'Submit Ticket',
    description: 'Logged for IT follow-up',
    contact: 'Open form',
    kind: 'ticket' as const,
  },
];

/** Short role-based menu paths (mirrors docs/user quick start). */
export const helpRoleTips = [
  { role: 'Medical records', paths: 'Register Patient · Manage Patients · Create Visit · Appointments' },
  { role: 'Nursing', paths: 'Pool / Room Queue · Vitals · Procedures · Wards' },
  { role: 'Consultation', paths: 'Start Consultation · Room workspace · Orders & prescriptions' },
  { role: 'Laboratory', paths: 'Lab Orders · Verification · Completed' },
  { role: 'Pharmacy', paths: 'Prescriptions · Dispensing · Inventory' },
  { role: 'Radiology', paths: 'Orders · Verification · Viewer' },
  { role: 'Administration', paths: 'Users · Roles · Clinics · System Health · Audit' },
];

export const helpFaqCategories = helpFaqs.map((cat) => cat.category);
