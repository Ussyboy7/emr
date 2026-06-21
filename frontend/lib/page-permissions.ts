export type PagePermission = {
  id: string;
  name: string;
  description: string;
  module: string;
};

// Canonical list of page paths used for role/user page access.
export const ALL_PAGE_PERMISSIONS: PagePermission[] = [
  // Overview (Global EMR)
  { id: "/dashboard", name: "Overview Dashboard", description: "Global EMR overview dashboard", module: "Overview" },

  // Global User Features (available to all authenticated users)
  { id: "/notifications", name: "Notifications", description: "View and manage notifications", module: "User" },
  { id: "/settings", name: "Settings", description: "User settings and preferences", module: "User" },
  { id: "/help", name: "Help & Support", description: "Help and support resources", module: "User" },
  { id: "/help/tickets", name: "My Support Tickets", description: "View submitted support tickets", module: "User" },
  { id: "/help/docs", name: "User Guides", description: "Role-based user documentation", module: "User" },

  // Medical Records
  { id: "/medical-records", name: "Dashboard", description: "Medical Records Dashboard", module: "Medical Records" },
  { id: "/medical-records/patients/new", name: "Register Patient", description: "Register new patients", module: "Medical Records" },
  { id: "/medical-records/patients", name: "Manage Patients", description: "View and manage patient records", module: "Medical Records" },
  { id: "/medical-records/patient-records", name: "Patient Records", description: "Look up and view patient medical records", module: "Medical Records" },
  { id: "/medical-records/visits/new", name: "Create Visit", description: "Create new patient visits", module: "Medical Records" },
  { id: "/medical-records/visits", name: "Manage Visits", description: "View and manage patient visits", module: "Medical Records" },
  { id: "/medical-records/appointments", name: "Appointments", description: "Manage patient appointments", module: "Medical Records" },
  { id: "/medical-records/reports", name: "Reports", description: "View and generate reports", module: "Medical Records" },
  { id: "/medical-records/reports/attendance-statistics", name: "Attendance Statistics", description: "BTMC-style attendance matrix by clinic and category", module: "Medical Records" },
  { id: "/medical-records/reports/clinic-statistics", name: "Clinic Statistics", description: "Per-clinic attendance statistics", module: "Medical Records" },
  { id: "/medical-records/reports/comprehensive", name: "Comprehensive Report", description: "Comprehensive medical records report", module: "Medical Records" },
  { id: "/medical-records/reports/disease-pattern", name: "Disease Pattern", description: "Disease pattern analysis report", module: "Medical Records" },
  { id: "/medical-records/reports/top-diagnoses", name: "Top Diagnoses", description: "Top ICD-10 diagnoses report", module: "Medical Records" },
  { id: "/medical-records/reports/dispensed-prescriptions", name: "Prescriptions Report", description: "Fully dispensed prescription orders by period", module: "Medical Records" },
  { id: "/medical-records/reports/escort-log", name: "Escort Log", description: "Escort/transfer log report", module: "Medical Records" },
  { id: "/medical-records/reports/laboratory-attendance", name: "Lab Attendance", description: "Distinct patients with lab orders by category", module: "Medical Records" },
  { id: "/medical-records/reports/radiological-services", name: "Radiology Services", description: "Radiology studies by modality", module: "Medical Records" },
  { id: "/medical-records/reports/referral-tracking", name: "Referral Tracking", description: "Referral tracking report", module: "Medical Records" },
  { id: "/medical-records/reports/services-activities", name: "Services Activities", description: "Services and activities report", module: "Medical Records" },
  { id: "/medical-records/reports/weekend-duty", name: "Weekend Duty", description: "Weekend duty roster report", module: "Medical Records" },
  { id: "/medical-records/reports/visit-statistics", name: "Visit Statistics", description: "Visit statistics report", module: "Medical Records" },
  { id: "/medical-records/reports/new-registrations", name: "New Registrations", description: "Daily breakdown of newly registered patients by category", module: "Medical Records" },
  { id: "/medical-records/reports/lab-statistics", name: "Lab Statistics", description: "Lab order volume, priority, and status distribution", module: "Medical Records" },
  { id: "/medical-records/reports/patient-demographics", name: "Patient Demographics", description: "Register distribution by category, gender, age, and blood group", module: "Medical Records" },
  { id: "/medical-records/referrals", name: "Referral queue (records)", description: "Review referrals for stamping and records workflow (same data as consultation referrals)", module: "Medical Records" },
  { id: "/medical-records/coding", name: "ICD-10 Coding", description: "Browse and search the ICD-10 code catalog", module: "Medical Records" },
  { id: "/medical-records/diagnosis-review", name: "Diagnosis Review", description: "Review and correct ICD-10 codes on completed consultations", module: "Medical Records" },
  { id: "/medical-records/settings/referral-facilities", name: "Referral Facilities", description: "Manage referral facilities and contacts", module: "Medical Records" },

  // Nursing
  { id: "/nursing", name: "Dashboard", description: "Nursing Dashboard", module: "Nursing" },
  { id: "/nursing/pool-queue", name: "Pool Queue", description: "Manage nursing pool queue", module: "Nursing" },
  { id: "/nursing/room-queue", name: "Room Queue", description: "Manage nursing room queue", module: "Nursing" },
  { id: "/nursing/vitals-history", name: "Vitals History", description: "View recorded patient vital signs", module: "Nursing" },
  { id: "/nursing/procedures", name: "Procedures", description: "Manage nursing procedures", module: "Nursing" },
  { id: "/nursing/procedures/history", name: "Procedures History", description: "View procedures history", module: "Nursing" },
  { id: "/nursing/wards", name: "Ward Care", description: "Record observations, execute doctor orders, and manage bed assignments", module: "Nursing" },
  { id: "/nursing/inventory", name: "Ward Stock", description: "Manage ward inventory", module: "Nursing" },
  { id: "/nursing/requests", name: "Drug Requests", description: "Request drugs from pharmacy", module: "Nursing" },
  { id: "/nursing/analytics", name: "Analytics", description: "Nursing pool analytics", module: "Nursing" },


  // Consultation
  { id: "/consultation", name: "My Dashboard", description: "Consultation Dashboard", module: "Consultation" },
  { id: "/consultation/start", name: "Start Consultation", description: "Start a new consultation", module: "Consultation" },
  { id: "/consultation/room", name: "Consultation Room", description: "Active consultation workspace (opened from Start Consultation)", module: "Consultation" },
  { id: "/consultation/history", name: "Consultation History", description: "View consultation history", module: "Consultation" },
  { id: "/consultation/wards", name: "Ward Overview", description: "View ward overview", module: "Consultation" },
  { id: "/consultation/referrals", name: "Referrals & forms", description: "Manage referrals and forms", module: "Consultation" },
  { id: "/consultation/analytics", name: "Consultation Analytics", description: "View consultation analytics", module: "Consultation" },

  // Laboratory
  { id: "/laboratory", name: "Dashboard", description: "Laboratory Dashboard", module: "Laboratory" },
  { id: "/laboratory/orders", name: "Lab Orders", description: "View and manage lab orders", module: "Laboratory" },
  { id: "/laboratory/verification", name: "Results Verification", description: "Verify lab results", module: "Laboratory" },
  { id: "/laboratory/completed", name: "Completed Tests", description: "View completed tests", module: "Laboratory" },
  { id: "/laboratory/templates", name: "Test Templates", description: "Manage lab test templates", module: "Laboratory" },
  { id: "/laboratory/analytics", name: "Lab Analytics", description: "View lab analytics", module: "Laboratory" },

  // Pharmacy
  { id: "/pharmacy", name: "Dashboard", description: "Pharmacy Dashboard", module: "Pharmacy" },
  { id: "/pharmacy/prescriptions", name: "Prescriptions", description: "Manage prescriptions", module: "Pharmacy" },
  { id: "/pharmacy/history", name: "Dispense History", description: "View dispense history", module: "Pharmacy" },
  { id: "/pharmacy/inventory", name: "Inventory", description: "Manage inventory", module: "Pharmacy" },
  { id: "/pharmacy/requests", name: "Requests", description: "Manage stock requests", module: "Pharmacy" },
  { id: "/pharmacy/generics", name: "Generics", description: "Manage generics", module: "Pharmacy" },
  { id: "/pharmacy/drugs", name: "Drug Master", description: "Manage drugs", module: "Pharmacy" },
  { id: "/pharmacy/store", name: "Central Store", description: "Central store", module: "Pharmacy" },
  { id: "/pharmacy/store/requests", name: "Store Requests", description: "Manage store requests", module: "Pharmacy" },
  { id: "/pharmacy/hod-store", name: "HOD Store", description: "Pharmacy head store inventory and issue", module: "Pharmacy" },
  { id: "/pharmacy/hod-store/requests", name: "HOD Store Requests", description: "HOD store stock requests", module: "Pharmacy" },
  { id: "/pharmacy/hod-store/history", name: "HOD Dispense History", description: "HOD store issue history", module: "Pharmacy" },
  { id: "/pharmacy/analytics", name: "Pharmacy Analytics", description: "View pharmacy analytics", module: "Pharmacy" },

  // Radiology
  { id: "/radiology", name: "Dashboard", description: "Radiology Dashboard", module: "Radiology" },
  { id: "/radiology/orders", name: "Study Orders", description: "View and manage imaging orders", module: "Radiology" },
  { id: "/radiology/verification", name: "Results Verification", description: "Verify radiology results", module: "Radiology" },
  { id: "/radiology/completed", name: "Completed Studies", description: "View completed studies", module: "Radiology" },
  { id: "/radiology/templates", name: "Study Templates", description: "Manage radiology templates", module: "Radiology" },
  { id: "/radiology/analytics", name: "Radiology Analytics", description: "View radiology analytics", module: "Radiology" },

  // Physiotherapy
  { id: "/physiotherapy", name: "Dashboard", description: "Physiotherapy Dashboard", module: "Physiotherapy" },
  { id: "/physiotherapy/orders", name: "Orders", description: "Manage physiotherapy orders", module: "Physiotherapy" },
  { id: "/physiotherapy/completed", name: "Completed Sessions", description: "Completed physiotherapy sessions", module: "Physiotherapy" },
  { id: "/physiotherapy/analytics", name: "Physiotherapy Analytics", description: "View physiotherapy analytics", module: "Physiotherapy" },

  // Eye Clinic
  { id: "/eyecare", name: "Dashboard", description: "Eye Clinic Dashboard", module: "Eye Clinic" },
  { id: "/eyecare/orders", name: "Orders", description: "Manage eye clinic orders", module: "Eye Clinic" },
  { id: "/eyecare/completed", name: "Completed Sessions", description: "Completed eye clinic sessions", module: "Eye Clinic" },
  { id: "/eyecare/analytics", name: "Eye Clinic Analytics", description: "View eye clinic analytics", module: "Eye Clinic" },

  // Human Resources
  { id: "/hr", name: "Dashboard", description: "HR annual check-up compliance dashboard", module: "Human Resources" },
  { id: "/hr/annual-checkups", name: "Annual Check-ups", description: "Employee annual check-up compliance list", module: "Human Resources" },
  { id: "/hr/exemptions", name: "Exemptions", description: "Manage annual check-up exemptions", module: "Human Resources" },

  // Analytics
  { id: "/analytics", name: "Clinical Reports", description: "Clinical reports & analytics", module: "Analytics" },
  { id: "/analytics/executive", name: "Executive Analytics", description: "Executive analytics", module: "Analytics" },

  // Administration
  { id: "/admin", name: "Dashboard", description: "Administration Dashboard", module: "Administration" },
  { id: "/admin/users", name: "User Management", description: "Manage staff accounts", module: "Administration" },
  { id: "/admin/roles", name: "Roles & Permissions", description: "Manage roles and permissions", module: "Administration" },
  { id: "/admin/clinics", name: "Clinics & Departments", description: "Manage clinics and departments", module: "Administration" },
  { id: "/admin/rooms", name: "Room Management", description: "Manage rooms", module: "Administration" },
  { id: "/admin/settings", name: "System Settings", description: "System settings", module: "Administration" },
  { id: "/admin/health", name: "System Health", description: "Infrastructure status, storage, and backups", module: "Administration" },
  { id: "/admin/annual-checkup-programme", name: "Annual Check-up Programme", description: "Default pre-ticked annual check-up investigations", module: "Administration" },
  { id: "/admin/audit", name: "Audit Trail", description: "View audit logs", module: "Administration" },
  { id: "/admin/support-tickets", name: "Support Tickets", description: "IT helpdesk ticket queue", module: "Administration" },
];

/** DB / seed paths that no longer match a route id — map to the canonical path used in the UI. */
const LEGACY_PAGE_PATH_ALIASES: Record<string, string> = {
  "/consultation/dashboard": "/consultation",
  "/nursing/patient-vitals": "/nursing/vitals-history",
  "/medical-records/dependents": "/medical-records/patients",
  "/medical-records/reports/attendance-summary": "/medical-records/reports/attendance-statistics",
  "/medical-records/reports/clinic-attendance": "/medical-records/reports/clinic-statistics",
  "/medical-records/reports/gop-attendance": "/medical-records/reports/clinic-statistics",
};

/**
 * Map a single stored path to the canonical `ALL_PAGE_PERMISSIONS` id (trim, strip trailing slash, apply aliases).
 */
export function normalizeRolePagePath(path: string): string {
  const raw = (path || "").trim();
  if (!raw) return raw;
  const noTrailing = raw.replace(/\/+$/, "") || "/";
  return LEGACY_PAGE_PATH_ALIASES[noTrailing] ?? LEGACY_PAGE_PATH_ALIASES[raw] ?? noTrailing;
}

/**
 * De-duplicate and normalize role page paths for forms and access lists.
 * Unknown paths (typos, future routes) are kept so saving does not drop data.
 */
export function normalizeRolePagePaths(paths: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of paths) {
    if (typeof p !== "string") continue;
    const c = normalizeRolePagePath(p);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    out.push(c);
  }
  return out;
}

/** Canonical module display order for role editors and restrict-pages UI. */
export const PAGE_MODULE_ORDER = [
  "Overview",
  "User",
  "Medical Records",
  "Nursing",
  "Consultation",
  "Laboratory",
  "Pharmacy",
  "Radiology",
  "Physiotherapy",
  "Eye Clinic",
  "Human Resources",
  "Analytics",
  "Administration",
] as const;

/** Role.permissions from API — array of paths or legacy `{ pages: string[] }`. */
export function convertPermissionsFromBackend(
  raw: string[] | Record<string, unknown> | null | undefined,
): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.filter((p): p is string => typeof p === "string");
  }
  if (typeof raw === "object" && Array.isArray((raw as { pages?: unknown }).pages)) {
    return ((raw as { pages: unknown[] }).pages).filter(
      (p): p is string => typeof p === "string",
    );
  }
  return [];
}

/** Sort module keys using {@link PAGE_MODULE_ORDER}; unknown modules sort last. */
export function sortPageModules(modules: string[]): string[] {
  const order = PAGE_MODULE_ORDER as readonly string[];
  return modules.slice().sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    const aRank = ai === -1 ? order.length + 1 : ai;
    const bRank = bi === -1 ? order.length + 1 : bi;
    if (aRank !== bRank) return aRank - bRank;
    return a.localeCompare(b);
  });
}

export function groupPagePermissionsByModule(
  pageIds: string[]
): Record<string, PagePermission[]> {
  const byId = new Map(ALL_PAGE_PERMISSIONS.map((p) => [p.id, p]));
  const grouped: Record<string, PagePermission[]> = {};
  for (const id of pageIds) {
    const perm = byId.get(id);
    const moduleName = perm?.module ?? "Other";
    const entry: PagePermission = perm ?? {
      id,
      name: id,
      description: "",
      module: moduleName,
    };
    if (!grouped[moduleName]) grouped[moduleName] = [];
    grouped[moduleName].push(entry);
  }
  for (const m of Object.keys(grouped)) {
    grouped[m] = grouped[m].slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}

