"use client";

import { Badge } from "@/components/ui/badge";
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { formatDisplayDate } from "@/lib/dates";
import { getVisitServiceClinicsList } from "@/lib/utils/clinic-utils";
import { getVisitTypeBadgeClass, getVisitTypeLabel } from "@/lib/utils/priority";
import { AlertTriangle } from "lucide-react";

type PrescriptionLike = {
  patient?: {
    name?: string;
    allergies?: string[];
    photo?: string | null;
  };
  patient_details?: {
    name?: string;
    patient_id?: string;
    age?: number | string | null;
    age_display?: string | null;
    gender?: string | null;
    division?: string | null;
    employee_type?: string | null;
    location?: string | null;
    phone?: string | null;
    phone_number?: string | null;
    photo?: string | null;
    allergies?: string[];
  };
  visit_details?: {
    clinic?: string | null;
    clinics?: string[] | null;
    visit_type?: string | null;
  };
  clinic?: string | null;
  doctor_name?: string | null;
  doctor?: string | null;
  location_clinic_name?: string | null;
  prescribed_at?: string | null;
  date?: string | null;
  status?: string;
  priority?: string;
};

type BadgeConfig = {
  label: string;
  className: string;
};

type PrescriptionPatientContextProps = {
  prescription: PrescriptionLike;
  statusBadge?: BadgeConfig;
  priorityBadge?: BadgeConfig;
};

function ContextField({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium break-words">{value}</p>
    </div>
  );
}

export function PrescriptionPatientContext({
  prescription,
  statusBadge,
  priorityBadge,
}: PrescriptionPatientContextProps) {
  const details = prescription.patient_details ?? {};
  const patientName =
    details.name ?? prescription.patient?.name ?? "";
  const visitType = prescription.visit_details?.visit_type;
  const clinics = getVisitServiceClinicsList({
    clinic: prescription.visit_details?.clinic ?? prescription.clinic,
    clinics: prescription.visit_details?.clinics,
  });
  const ageDisplay =
    details.age_display ||
    (details.age != null && String(details.age).trim() !== ""
      ? `${details.age} years`
      : null);
  const phone = details.phone || details.phone_number;
  const patientLocation = details.location;
  const pharmacyLocation = prescription.location_clinic_name;
  const doctor = prescription.doctor_name || prescription.doctor;
  const prescribedDate = prescription.prescribed_at
    ? formatDisplayDate(prescription.prescribed_at)
    : prescription.date || null;
  const allergies =
    details.allergies?.length
      ? details.allergies
      : prescription.patient?.allergies ?? [];
  const photoUrl = details.photo ?? prescription.patient?.photo ?? null;

  return (
    <div className="rounded-lg bg-muted/50 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <PatientAvatar name={patientName} photoUrl={photoUrl} size="lg" className="shrink-0" />
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-semibold leading-tight">{patientName}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {visitType ? (
                  <Badge
                    variant="outline"
                    className={`h-6 px-2 text-xs font-medium ${getVisitTypeBadgeClass(visitType)}`}
                  >
                    {getVisitTypeLabel(visitType)}
                  </Badge>
                ) : null}
                {clinics.map((clinic) => (
                  <Badge
                    key={clinic}
                    variant="outline"
                    className="h-6 border-blue-500/30 bg-blue-500/10 px-2 text-xs font-medium text-blue-700 dark:text-blue-400"
                  >
                    {clinic}
                  </Badge>
                ))}
              </div>
            </div>
            {(statusBadge || priorityBadge) && (
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {statusBadge ? (
                  <Badge variant="outline" className={statusBadge.className}>
                    {statusBadge.label}
                  </Badge>
                ) : null}
                {priorityBadge ? (
                  <Badge variant="outline" className={priorityBadge.className}>
                    {priorityBadge.label}
                  </Badge>
                ) : null}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-4">
            <ContextField label="Patient ID" value={details.patient_id} />
            <ContextField label="Age" value={ageDisplay} />
            <ContextField label="Gender" value={details.gender} />
            <ContextField label="Division" value={details.division} />
            <ContextField label="Location" value={patientLocation} />
            <ContextField label="Employee type" value={details.employee_type} />
            <ContextField label="Phone" value={phone} />
            <ContextField label="Doctor" value={doctor} />
            <ContextField label="Pharmacy" value={pharmacyLocation} />
            <ContextField label="Date" value={prescribedDate} />
          </div>

          {allergies.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-800 dark:bg-red-900/20">
              <div className="flex items-start gap-2 text-sm text-red-700 dark:text-red-400">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide opacity-80">Allergies</p>
                  <p className="font-medium">{allergies.join(", ")}</p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
