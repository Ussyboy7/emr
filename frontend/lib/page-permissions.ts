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

  // Medical Records
  { id: "/medical-records", name: "Dashboard", description: "Medical Records Dashboard", module: "Medical Records" },
  { id: "/medical-records/patients/new", name: "Register Patient", description: "Register new patients", module: "Medical Records" },
  { id: "/medical-records/patients", name: "Manage Patients", description: "View and manage patient records", module: "Medical Records" },
  { id: "/medical-records/patient-records", name: "Patient Records", description: "Look up and view patient medical records", module: "Medical Records" },
  { id: "/medical-records/visits/new", name: "Create Visit", description: "Create new patient visits", module: "Medical Records" },
  { id: "/medical-records/visits", name: "Manage Visits", description: "View and manage patient visits", module: "Medical Records" },
  { id: "/medical-records/appointments", name: "Appointments", description: "Manage patient appointments", module: "Medical Records" },
  { id: "/medical-records/dependents", name: "Manage Dependents", description: "Manage patient dependents", module: "Medical Records" },
  { id: "/medical-records/reports", name: "Reports", description: "View and generate reports", module: "Medical Records" },
  { id: "/medical-records/referrals", name: "Referral queue (records)", description: "Review referrals for stamping and records workflow (same data as consultation referrals)", module: "Medical Records" },

  // Nursing
  { id: "/nursing", name: "Dashboard", description: "Nursing Dashboard", module: "Nursing" },
  { id: "/nursing/pool-queue", name: "Pool Queue", description: "Manage nursing pool queue", module: "Nursing" },
  { id: "/nursing/room-queue", name: "Room Queue", description: "Manage nursing room queue", module: "Nursing" },
  { id: "/nursing/patient-vitals", name: "Patient Vitals", description: "Record patient vital signs", module: "Nursing" },
  { id: "/nursing/procedures", name: "Procedures", description: "Manage nursing procedures", module: "Nursing" },
  { id: "/nursing/procedures/history", name: "Procedures History", description: "View procedures history", module: "Nursing" },
  { id: "/nursing/wards", name: "Ward Management", description: "Manage wards and beds", module: "Nursing" },
  { id: "/nursing/inventory", name: "Ward Stock", description: "Manage ward inventory", module: "Nursing" },
  { id: "/nursing/requests", name: "Drug Requests", description: "Request drugs from pharmacy", module: "Nursing" },

  // Consultation
  { id: "/consultation", name: "My Dashboard", description: "Consultation Dashboard", module: "Consultation" },
  { id: "/consultation/start", name: "Start Consultation", description: "Start a new consultation", module: "Consultation" },
  { id: "/consultation/history", name: "Consultation History", description: "View consultation history", module: "Consultation" },
  { id: "/consultation/wards", name: "Ward Overview", description: "View ward overview", module: "Consultation" },
  { id: "/consultation/referrals", name: "Referrals & forms", description: "Manage referrals and forms", module: "Consultation" },

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

  // Eye Clinic
  { id: "/eyecare", name: "Dashboard", description: "Eye Clinic Dashboard", module: "Eye Clinic" },
  { id: "/eyecare/pool-queue", name: "Pool Queue", description: "Eye clinic pool queue", module: "Eye Clinic" },
  { id: "/eyecare/completed", name: "Completed Orders", description: "Completed eye clinic orders", module: "Eye Clinic" },

  // Analytics
  { id: "/analytics", name: "Clinical Reports", description: "Clinical reports & analytics", module: "Analytics" },
  { id: "/analytics/executive", name: "Executive Analytics", description: "Executive analytics", module: "Analytics" },

  // Administration
  { id: "/admin", name: "Dashboard", description: "Administration Dashboard", module: "Administration" },
  { id: "/admin/users", name: "User Management", description: "Manage staff accounts", module: "Administration" },
  { id: "/admin/roles", name: "Roles & Permissions", description: "Manage roles and permissions", module: "Administration" },
  { id: "/admin/clinics", name: "Facilities & Departments", description: "Manage clinics and departments", module: "Administration" },
  { id: "/admin/rooms", name: "Room Management", description: "Manage rooms", module: "Administration" },
  { id: "/admin/settings", name: "System Settings", description: "System settings", module: "Administration" },
  { id: "/admin/audit", name: "Audit Trail", description: "View audit logs", module: "Administration" },
];

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

