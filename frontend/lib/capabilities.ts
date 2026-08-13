export type Capability = {
  id: string;
  name: string;
  module: string;
  description: string;
};

export const ALL_CAPABILITIES: Capability[] = [
  { id: "patient_delete", name: "Delete / deactivate patients", module: "Medical Records", description: "Soft-delete patient records" },
  { id: "patient_merge", name: "Merge duplicate patients", module: "Medical Records", description: "Merge loser into winner patient" },
  { id: "patient_unmerge", name: "Unmerge patients", module: "Medical Records", description: "Revert a patient merge" },
  { id: "patient_convert_csr", name: "Convert retiree to CSR", module: "Medical Records", description: "Retiree category → CSR" },
  { id: "patient_promote_officer", name: "Promote staff to officer", module: "Medical Records", description: "Employee staff type → officer" },
  { id: "patient_convert_retiree", name: "Convert employee to retiree", module: "Medical Records", description: "Employee category → retiree" },
  { id: "annual_checkup_programme_edit", name: "Edit annual check-up programme", module: "Administration", description: "PATCH programme defaults and catalog" },
  { id: "annual_checkup_programme_catalog_admin", name: "Full programme catalog", module: "Administration", description: "View inactive catalog entries" },
  { id: "notification_routing_manage", name: "Manage notification routing", module: "Administration", description: "Edit notification routing matrix" },
  { id: "hr_compliance_manage", name: "HR compliance administration", module: "Human Resources", description: "Write HR compliance endpoints" },
  { id: "annual_checkup_signoff", name: "Annual check-up medical sign-off", module: "Human Resources", description: "Doctor sign-off on annual check-ups" },
  { id: "ward_order_create", name: "Create ward doctor orders", module: "Consultation", description: "Add nursing orders on Ward Rounds" },
  { id: "ward_order_edit", name: "Edit/cancel ward doctor orders", module: "Consultation", description: "Edit or cancel pending ward orders" },
  { id: "ward_order_perform", name: "Perform ward nursing tasks", module: "Nursing", description: "Administer injections, dressings, and ward instructions" },
  { id: "consultation_queue_override", name: "Override consultation room presence", module: "Nursing", description: "Send or reassign when doctor is not on seat (requires reason)" },
  { id: "clinical_data_view_all", name: "View all clinics (aggregate view)", module: "Administration", description: "Read data across every clinic via scope=all (leadership)" },
  { id: "pharmacy_dispense", name: "Dispense prescriptions", module: "Pharmacy", description: "Perform stock deduction and dispense medication" },
  { id: "pharmacy_stock_issue", name: "Issue stock from store", module: "Pharmacy", description: "Transfer stock between store and dispensary" },
  { id: "pharmacy_inventory_adjust", name: "Adjust pharmacy inventory", module: "Pharmacy", description: "Add, edit, or adjust medication inventory" },
  { id: "lab_collect", name: "Collect laboratory samples", module: "Laboratory", description: "Collect and accession laboratory samples" },
  { id: "lab_process", name: "Process laboratory tests", module: "Laboratory", description: "Process laboratory tests and route work" },
  { id: "lab_result_submit", name: "Submit lab results", module: "Laboratory", description: "Enter results for collected/processed lab tests" },
  { id: "lab_result_verify", name: "Verify lab results", module: "Laboratory", description: "Approve verified lab results" },
  { id: "radiology_perform", name: "Perform radiology studies", module: "Radiology", description: "Perform and route radiology studies" },
  { id: "radiology_result_verify", name: "Verify radiology reports", module: "Radiology", description: "Approve verified radiology reports" },
  { id: "nursing_order_create", name: "Create nursing orders", module: "Nursing", description: "Add new nursing orders" },
  { id: "medical_certificate_issue", name: "Issue medical certificates", module: "Medical Records", description: "Create and manage medical certificates" },
];

/** Capabilities stripped when duplicating or seeding support roles. */
export const SENSITIVE_CAPABILITY_IDS = [
  "patient_delete",
  "patient_merge",
  "patient_unmerge",
  "patient_convert_csr",
  "patient_promote_officer",
  "patient_convert_retiree",
  "annual_checkup_programme_edit",
  "annual_checkup_programme_catalog_admin",
  "notification_routing_manage",
  "hr_compliance_manage",
  "annual_checkup_signoff",
  "clinical_data_view_all",
] as const;

export const PAGE_TO_CAPABILITIES: Record<string, string[]> = {
  "/admin/annual-checkup-programme": ["annual_checkup_programme_edit", "annual_checkup_programme_catalog_admin"],
  "/admin/settings": ["notification_routing_manage"],
  "/hr": ["hr_compliance_manage"],
  "/hr/annual-checkups": ["hr_compliance_manage"],
  "/hr/exemptions": ["hr_compliance_manage"],
  "/consultation/wards": ["ward_order_create", "ward_order_edit"],
  "/nursing/wards": ["ward_order_perform"],
  "/laboratory": ["lab_collect", "lab_process", "lab_result_submit", "lab_result_verify"],
  "/radiology": ["radiology_perform", "radiology_result_verify"],
  "/pharmacy": ["pharmacy_dispense", "pharmacy_stock_issue", "pharmacy_inventory_adjust"],
  "/nursing": ["nursing_order_create"],
  "/medical-records": ["medical_certificate_issue"],
  "/consultation": ["medical_certificate_issue"],
};

export function convertCapabilitiesFromBackend(
  raw: string[] | Record<string, unknown> | null | undefined,
): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return [];
  if (typeof raw === "object" && Array.isArray((raw as { capabilities?: unknown }).capabilities)) {
    return ((raw as { capabilities: unknown[] }).capabilities).filter(
      (c): c is string => typeof c === "string",
    );
  }
  return [];
}

export function groupCapabilitiesByModule(capIds: string[]): Record<string, Capability[]> {
  const byId = new Map(ALL_CAPABILITIES.map((c) => [c.id, c]));
  const grouped: Record<string, Capability[]> = {};
  for (const id of capIds) {
    const cap = byId.get(id);
    const moduleName = cap?.module ?? "Other";
    const entry: Capability = cap ?? { id, name: id, description: "", module: moduleName };
    if (!grouped[moduleName]) grouped[moduleName] = [];
    grouped[moduleName].push(entry);
  }
  for (const m of Object.keys(grouped)) {
    grouped[m] = grouped[m].slice().sort((a, b) => a.name.localeCompare(b.name));
  }
  return grouped;
}

export function impliedCapabilitiesFromPages(pages: string[]): Set<string> {
  const out = new Set<string>();
  for (const page of pages) {
    const direct = PAGE_TO_CAPABILITIES[page];
    if (direct) direct.forEach((c) => out.add(c));
    for (const [prefix, caps] of Object.entries(PAGE_TO_CAPABILITIES)) {
      if (page === prefix || page.startsWith(prefix + "/")) {
        caps.forEach((c) => out.add(c));
      }
    }
  }
  return out;
}
