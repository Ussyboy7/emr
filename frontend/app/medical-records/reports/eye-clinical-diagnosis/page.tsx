"use client";

import { Eye } from "lucide-react";
import { ClinicalDiagnosisReportPage } from "@/components/medical-records/ClinicalDiagnosisReportPage";

export default function EyeClinicalDiagnosisReport() {
  return (
    <ClinicalDiagnosisReportPage
      title="Ophthalmology Clinical Diagnosis"
      apiPath="/reports/eye-clinical-diagnosis/"
      filenamePrefix="eye_clinical_diagnosis"
      icon={Eye}
      iconClass="text-cyan-500"
    />
  );
}
