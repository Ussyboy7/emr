"use client";

import { Activity } from "lucide-react";
import { ClinicalDiagnosisReportPage } from "@/components/medical-records/ClinicalDiagnosisReportPage";

export default function PhysioClinicalDiagnosisReport() {
  return (
    <ClinicalDiagnosisReportPage
      title="Physiotherapy Clinical Diagnosis"
      apiPath="/reports/physio-clinical-diagnosis/"
      filenamePrefix="physio_clinical_diagnosis"
      icon={Activity}
      iconClass="text-orange-500"
      filterDescription="ICD-10 diagnoses from completed physiotherapy sessions."
    />
  );
}
