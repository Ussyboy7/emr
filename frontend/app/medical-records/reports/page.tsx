"use client";

import { useEffect, useState, useRef } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { patientService, medicalCertificateService, type Patient as ApiPatient } from "@/lib/services";
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  FileCheck,
  Plus,
  BarChart3,
  Stethoscope,
  Activity,
  Pill,
  FlaskConical,
  ScanLine,
  Share2,
  TrendingUp,
  Building2,
  Phone,
  Layers,
  FileSpreadsheet,
  ChevronRight,
  Search,
  Loader2,
  MapPin,
  X,
} from "lucide-react";

type ReportTile = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  count?: number;
  iconWrap: string;
  iconClass: string;
};

/** List-row cards on Manage Patients use border-l-4 + horizontal layout */
type StatisticalReportTile = ReportTile & {
  href: string;
  borderAccent: string;
};

type PatientDocumentReportTile = ReportTile & {
  borderAccent: string;
};

/** Inclusive calendar days between two YYYY-MM-DD strings (avoids UTC edge cases). */
function inclusiveCalendarDaysBetween(start: string, end: string): number | null {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const days = Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
  if (days < 1 || days > 366) return null;
  return days;
}

const statisticalReports: StatisticalReportTile[] = [
  {
    id: "attendance-summary",
    title: "Attendance Summary",
    description: "Patient attendance by category (Officers, Staff, Dependents, Retirees, etc.)",
    icon: BarChart3,
    href: "/medical-records/reports/attendance-summary",
    borderAccent: "border-l-blue-500",
    iconWrap: "bg-blue-500/10",
    iconClass: "text-blue-500",
  },
  {
    id: "clinic-attendance",
    title: "Clinic Attendance",
    description:
      "Specialized clinic attendance (Diamond, Sickle Cell, Healthron, Eye Clinic, Physiotherapy, GOPD, Dental)",
    icon: Stethoscope,
    href: "/medical-records/reports/clinic-attendance",
    borderAccent: "border-l-emerald-500",
    iconWrap: "bg-emerald-500/10",
    iconClass: "text-emerald-500",
  },
  {
    id: "services-activities",
    title: "Services & Activities",
    description: "Injections, Dressing, Sick Leave, Referrals, Observations",
    icon: Activity,
    href: "/medical-records/reports/services-activities",
    borderAccent: "border-l-orange-500",
    iconWrap: "bg-orange-500/10",
    iconClass: "text-orange-500",
  },
  {
    id: "dispensed-prescriptions",
    title: "Dispensed Prescriptions",
    description: "Monthly prescription dispensing statistics",
    icon: Pill,
    href: "/medical-records/reports/dispensed-prescriptions",
    borderAccent: "border-l-violet-500",
    iconWrap: "bg-violet-500/10",
    iconClass: "text-violet-500",
  },
  {
    id: "laboratory-attendance",
    title: "Laboratory Attendance",
    description: "Lab services by patient category and month",
    icon: FlaskConical,
    href: "/medical-records/reports/laboratory-attendance",
    borderAccent: "border-l-pink-500",
    iconWrap: "bg-pink-500/10",
    iconClass: "text-pink-500",
  },
  {
    id: "radiological-services",
    title: "Radiological Services",
    description: "X-Ray, ECG, Ultrasound, CT Scan, MRI statistics",
    icon: ScanLine,
    href: "/medical-records/reports/radiological-services",
    borderAccent: "border-l-indigo-500",
    iconWrap: "bg-indigo-500/10",
    iconClass: "text-indigo-500",
  },
  {
    id: "referral-tracking",
    title: "Referral Tracking",
    description: "New referrals and follow-ups to retainership hospitals",
    icon: Share2,
    href: "/medical-records/reports/referral-tracking",
    borderAccent: "border-l-cyan-500",
    iconWrap: "bg-cyan-500/10",
    iconClass: "text-cyan-500",
  },
  {
    id: "escort-log",
    title: "Escort Log",
    description: "Patients escorted to external facilities, with arrival confirmation and handover trail",
    icon: MapPin,
    href: "/medical-records/reports/escort-log",
    borderAccent: "border-l-rose-500",
    iconWrap: "bg-rose-500/10",
    iconClass: "text-rose-500",
  },
  {
    id: "disease-pattern",
    title: "Disease Pattern",
    description: "Top diagnoses and disease trends",
    icon: TrendingUp,
    href: "/medical-records/reports/disease-pattern",
    borderAccent: "border-l-red-500",
    iconWrap: "bg-red-500/10",
    iconClass: "text-red-500",
  },
  {
    id: "gop-attendance",
    title: "GOPD Attendance",
    description: "GOPD attendance statistics",
    icon: Building2,
    href: "/medical-records/reports/gop-attendance",
    borderAccent: "border-l-sky-500",
    iconWrap: "bg-sky-500/10",
    iconClass: "text-sky-500",
  },
  {
    id: "weekend-duty",
    title: "Weekend Call Duty",
    description: "Weekend and after-hours attendance",
    icon: Phone,
    href: "/medical-records/reports/weekend-duty",
    borderAccent: "border-l-purple-500",
    iconWrap: "bg-purple-500/10",
    iconClass: "text-purple-500",
  },
  {
    id: "comprehensive",
    title: "Comprehensive Report",
    description: "All reports combined in one comprehensive view",
    icon: Layers,
    href: "/medical-records/reports/comprehensive",
    borderAccent: "border-l-slate-500",
    iconWrap: "bg-slate-500/10",
    iconClass: "text-slate-500",
  },
];

const patientDocumentReports: PatientDocumentReportTile[] = [
  {
    id: "medical-cert",
    title: "Medical Certificate",
    description: "Generate fitness or illness medical certificates",
    icon: FileCheck,
    borderAccent: "border-l-teal-500",
    iconWrap: "bg-teal-500/10",
    iconClass: "text-teal-500",
  },
  {
    id: "discharge",
    title: "Discharge Summary",
    description: "End-of-visit summary, instructions, and follow-up",
    icon: FileSpreadsheet,
    href: "/nursing/wards",
    borderAccent: "border-l-emerald-500",
    iconWrap: "bg-emerald-500/10",
    iconClass: "text-emerald-500",
  },
  {
    id: "referral",
    title: "Referral Letter",
    description: "Referral to specialist or retainership / external hospital",
    icon: FileText,
    href: "/medical-records/referrals",
    borderAccent: "border-l-violet-500",
    iconWrap: "bg-violet-500/10",
    iconClass: "text-violet-500",
  },
  {
    id: "lab-report",
    title: "Lab Report",
    description: "Laboratory results summary for the patient record",
    icon: FlaskConical,
    href: "/laboratory/completed",
    borderAccent: "border-l-amber-500",
    iconWrap: "bg-amber-500/10",
    iconClass: "text-amber-500",
  },
];

// Only "Medical Certificate" is created from this dialog.
const medicalCertificateTypeOptions: ReportTile[] = patientDocumentReports.filter(
  (t) => t.id === "medical-cert",
);

export default function ReportsPage() {
  const router = useRouter();
  const [isNewReportOpen, setIsNewReportOpen] = useState(false);
  const [certificatePatientSearch, setCertificatePatientSearch] = useState("");
  const [certificateSearchResults, setCertificateSearchResults] = useState<ApiPatient[]>([]);
  const [certificateSearching, setCertificateSearching] = useState(false);
  const [selectedCertificatePatient, setSelectedCertificatePatient] = useState<ApiPatient | null>(null);
  const certificateSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [newReport, setNewReport] = useState({
    type: "",
    purpose: "",
    findings: "",
    recommendations: "",
    startDate: "",
    endDate: "",
    referTo: "",
    sickLeaveDays: "",
  });

  useEffect(() => {
    if (newReport.purpose !== "illness" || !newReport.startDate || !newReport.endDate) return;
    const computed = inclusiveCalendarDaysBetween(newReport.startDate, newReport.endDate);
    if (computed == null) return;
    setNewReport((prev) => {
      if (prev.purpose !== "illness") return prev;
      if (prev.sickLeaveDays.trim() !== "") return prev;
      return { ...prev, sickLeaveDays: String(computed) };
    });
  }, [newReport.purpose, newReport.startDate, newReport.endDate]);

  useEffect(() => {
    const q = certificatePatientSearch.trim();
    if (certificateSearchTimeoutRef.current) {
      clearTimeout(certificateSearchTimeoutRef.current);
      certificateSearchTimeoutRef.current = null;
    }
    if (!q) {
      setCertificateSearchResults([]);
      setCertificateSearching(false);
      return;
    }
    setCertificateSearching(true);
    certificateSearchTimeoutRef.current = setTimeout(async () => {
      certificateSearchTimeoutRef.current = null;
      try {
        const res = await patientService.getPatients({ search: q, page_size: 50 });
        setCertificateSearchResults(res.results || []);
      } catch (e: any) {
        toast.error(e?.message || "Patient search failed");
        setCertificateSearchResults([]);
      } finally {
        setCertificateSearching(false);
      }
    }, 300);
    return () => {
      if (certificateSearchTimeoutRef.current) clearTimeout(certificateSearchTimeoutRef.current);
    };
  }, [certificatePatientSearch]);

  const resetCertificatePatientPicker = () => {
    setCertificatePatientSearch("");
    setCertificateSearchResults([]);
    setSelectedCertificatePatient(null);
  };

  const escapeHtml = (value: string) => {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  };

  const buildMedicalCertificateHtml = (args: {
    certificateNumber: string;
    patientName: string;
    patientId: string;
    patientCategory: string;
    purposeLabel: string;
    validFrom?: string;
    validTo?: string;
    sickLeaveDays?: number | null;
    findings?: string;
    recommendations?: string;
    doctorName: string;
    issueDate: string;
  }) => {
    const {
      certificateNumber,
      patientName,
      patientId,
      patientCategory,
      purposeLabel,
      validFrom,
      validTo,
      sickLeaveDays,
      findings,
      recommendations,
      doctorName,
      issueDate,
    } = args;

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(purposeLabel)} - ${escapeHtml(certificateNumber)}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.4; }
    .title { text-align: center; font-weight: 700; font-size: 20px; margin-bottom: 8px; }
    .subtle { color: #333; font-size: 12px; }
    .block { margin-top: 10px; }
    .row { display: flex; justify-content: space-between; gap: 16px; }
    .kv { width: 50%; }
    .label { font-weight: 700; }
    .content { margin-top: 14px; font-size: 14px; white-space: pre-wrap; }
    .signature { margin-top: 28px; display: flex; justify-content: flex-end; }
    .sig-line { border-top: 1px solid #111; width: 240px; padding-top: 6px; text-align: left; }
    .muted-box { border: 1px solid #ddd; background: #f7f7f7; padding: 10px; border-radius: 6px; white-space: pre-wrap; min-height: 46px; }
  </style>
</head>
<body>
  <div class="title">MEDICAL CERTIFICATE</div>
  <div class="subtle" style="text-align:center;">Certificate No: ${escapeHtml(certificateNumber)} &nbsp; | &nbsp; Issued: ${escapeHtml(issueDate)}</div>

  <div class="block">
    <div class="row">
      <div class="kv">
        <div><span class="label">Patient Name:</span> ${escapeHtml(patientName)}</div>
        <div><span class="label">Patient ID:</span> ${escapeHtml(patientId)}</div>
      </div>
      <div class="kv">
        <div><span class="label">Category:</span> ${escapeHtml(patientCategory)}</div>
        <div><span class="label">Type:</span> ${escapeHtml(purposeLabel)}</div>
      </div>
    </div>

    <div class="content">
      This is to certify that <strong>${escapeHtml(patientName)}</strong> is ${escapeHtml(purposeLabel.toLowerCase())}.
      ${
        validFrom && validTo
          ? `The certificate is valid from ${escapeHtml(validFrom)} to ${escapeHtml(validTo)}.`
          : ""
      }
      ${
        sickLeaveDays != null && sickLeaveDays >= 1
          ? `\n\nNumber of sick leave days (calendar): ${escapeHtml(String(sickLeaveDays))}.`
          : ""
      }
      ${
        findings?.trim()
          ? `\n\nClinical findings:\n${escapeHtml(findings.trim())}`
          : ""
      }
      ${
        recommendations?.trim()
          ? `\n\nRecommendations:\n${escapeHtml(recommendations.trim())}`
          : ""
      }
    </div>
  </div>

  <div class="signature">
    <div class="sig-line">
      <div><strong>${escapeHtml(doctorName)}</strong></div>
      <div class="subtle">Doctor</div>
    </div>
  </div>
</body>
</html>`;
  };

  const handleCreateReport = async () => {
    const patient = selectedCertificatePatient;
    if (!patient) {
      toast.error("Please search and select a patient.");
      return;
    }
    if (!newReport.purpose) {
      toast.error("Please select certificate type/purpose.");
      return;
    }
    if (!newReport.startDate || !newReport.endDate) {
      toast.error("Please select a valid date range (Start and End).");
      return;
    }

    let sickLeaveDaysPayload: number | undefined;
    if (newReport.purpose === "illness") {
      const trimmed = newReport.sickLeaveDays.trim();
      const n = parseInt(trimmed, 10);
      if (Number.isNaN(n) || n < 1 || n > 366) {
        toast.error("Enter sick leave days (1–366).");
        return;
      }
      sickLeaveDaysPayload = n;
    }

    try {
      const created = await medicalCertificateService.createCertificate({
        patient: patient.id,
        purpose: newReport.purpose as any,
        valid_from: newReport.startDate,
        valid_to: newReport.endDate,
        ...(sickLeaveDaysPayload != null ? { sick_leave_days: sickLeaveDaysPayload } : {}),
        findings: newReport.findings,
        recommendations: newReport.recommendations,
      });

      // Build the printable HTML from persisted data (PDF is generated when user prints).
      const purposeLabelMap: Record<string, string> = {
        fitness: "FITNESS FOR DUTY",
        illness: "UNFIT FOR WORK",
        travel: "FIT TO TRAVEL",
        employment: "FIT FOR EMPLOYMENT",
      };

      const formatDisplayDate = (isoDate: string) => {
        const d = new Date(isoDate);
        if (Number.isNaN(d.getTime())) return isoDate;
        return d.toLocaleDateString();
      };

      const patientCategoryLabelMap: Record<string, string> = {
        employee: "Employee",
        retiree: "Retiree",
        dependent: "Dependent",
        nonnpa: "Non-NPA",
      };

      const certificateHtml = buildMedicalCertificateHtml({
        certificateNumber: created.certificate_number,
        patientName: created.patient_name_snapshot || created.patient_name || patient.full_name || "",
        patientId: created.patient_id_snapshot || patient.patient_id,
        patientCategory: patientCategoryLabelMap[created.patient_category_snapshot || ""] || created.patient_category_snapshot || "",
        purposeLabel: purposeLabelMap[created.purpose] || String(created.purpose),
        validFrom: formatDisplayDate(created.valid_from),
        validTo: formatDisplayDate(created.valid_to),
        sickLeaveDays: created.sick_leave_days ?? sickLeaveDaysPayload ?? null,
        findings: created.findings,
        recommendations: created.recommendations,
        doctorName: created.doctor_name_snapshot || created.issued_by_name || "",
        issueDate: formatDisplayDate(created.issued_at),
      });
      void certificateHtml;

      toast.success(
        `Medical certificate saved (${created.certificate_number}). Print from the patient Certificates tab when ready.`,
      );
    } catch (e: any) {
      toast.error(e?.message || "Failed to create medical certificate.");
      return;
    }

    setIsNewReportOpen(false);
    resetCertificatePatientPicker();
    setNewReport({
      type: "Medical Certificate",
      purpose: "",
      findings: "",
      recommendations: "",
      startDate: "",
      endDate: "",
      referTo: "",
      sickLeaveDays: "",
    });
  };

  const openNewReportModal = (type: string) => {
    resetCertificatePatientPicker();
    setNewReport({
      type,
      purpose: "",
      findings: "",
      recommendations: "",
      startDate: "",
      endDate: "",
      referTo: "",
      sickLeaveDays: "",
    });
    setIsNewReportOpen(true);
  };

  const StatisticalReportRowCard = ({ tile }: { tile: StatisticalReportTile }) => {
    const Icon = tile.icon;
    const go = () => router.push(tile.href);
  return (
            <Card 
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            go();
          }
        }}
        className={`border-l-4 ${tile.borderAccent} border-border bg-card hover:shadow-md transition-shadow cursor-pointer`}
        onClick={go}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tile.iconWrap}`}
            >
              <Icon className={`h-4 w-4 ${tile.iconClass}`} />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground text-sm sm:text-base truncate">{tile.title}</span>
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 h-5 shrink-0 border-teal-500/50 text-teal-600 dark:text-teal-400"
                  >
                    Available
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span className="line-clamp-2">{tile.description}</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-70" />
                </div>
              </CardContent>
            </Card>
    );
  };

  const PatientDocumentRowCard = ({ tile }: { tile: PatientDocumentReportTile }) => {
    const Icon = tile.icon;
    const go = () => {
      if (tile.href) {
        router.push(tile.href);
        return;
      }
      openNewReportModal(tile.title);
    };
    const badgeLabel = tile.href ? "Open" : "Create";
    return (
      <Card
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            go();
          }
        }}
        className={`border-l-4 ${tile.borderAccent} border-border bg-card hover:shadow-md transition-shadow cursor-pointer`}
        onClick={go}
      >
        <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tile.iconWrap}`}
            >
              <Icon className={`h-4 w-4 ${tile.iconClass}`} />
            </div>
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground text-sm sm:text-base truncate">{tile.title}</span>
                  <Badge
                    variant="outline"
                    className={
                      tile.href
                        ? "text-[10px] px-1.5 py-0 h-5 shrink-0 border-muted-foreground/50 text-muted-foreground font-normal"
                        : "text-[10px] px-1.5 py-0 h-5 shrink-0 border-teal-500/50 text-teal-600 dark:text-teal-400 font-normal"
                    }
                  >
                    {badgeLabel}
                  </Badge>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span className="line-clamp-2">{tile.description}</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-70" />
              </div>
            </CardContent>
          </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Hero: title, summary, counts, primary action */}
        <Card className="border-0 bg-gradient-to-br from-teal-600 via-teal-600 to-cyan-700 text-white shadow-md overflow-hidden">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
              <div className="flex items-start gap-4 min-w-0">
                <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white/15 flex items-center justify-center shrink-0 backdrop-blur-sm">
                  <FileText className="h-7 w-7 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0 space-y-2">
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Medical Reports</h1>
                  <p className="text-sm sm:text-base text-teal-50/95 leading-relaxed max-w-2xl">
                    Generate and manage medical reports and certificates — run departmental analytics or create
                    patient documents from one place.
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      {statisticalReports.length} statistical reports
                    </span>
                    <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
                      {patientDocumentReports.length} certificate & letter types
                    </span>
                  </div>
              </div>
              </div>
              <Button
                type="button"
                onClick={() => openNewReportModal("Medical Certificate")}
                className="bg-white text-teal-800 hover:bg-teal-50 shadow-md shrink-0 h-11 font-semibold w-full xl:w-auto border-0"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Report
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Two columns on large screens: analytics | patient documents */}
        <div className="grid gap-6 xl:grid-cols-2 items-start">
          <Card className="order-2 xl:order-1 border-border shadow-sm overflow-hidden h-full flex flex-col">
            <CardHeader className="pb-3 space-y-2 border-b border-border/80 bg-muted/25">
              <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/10">
                  <BarChart3 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
                </span>
                Departmental & statistical
            </CardTitle>
              <CardDescription>
                Select a row to open that report&apos;s workspace. There you choose the time period, export CSV, and print (or save as PDF).
              </CardDescription>
          </CardHeader>
            <CardContent className="pt-4 space-y-3 flex-1">
              {statisticalReports.map((tile) => (
                <StatisticalReportRowCard key={tile.id} tile={tile} />
              ))}
          </CardContent>
        </Card>

          <Card className="order-1 xl:order-2 border-border shadow-sm overflow-hidden h-full flex flex-col">
            <CardHeader className="pb-3 space-y-2 border-b border-border/80 bg-muted/25">
              <CardTitle className="text-lg flex items-center gap-2 text-foreground">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/10">
                  <FileCheck className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
                </span>
                Certificates & clinical documents
              </CardTitle>
              <CardDescription>
                Medical Certificate creates a saved certificate—view or print it from the patient&apos;s Certificates tab.
                Discharge Summary, Referral Letter, and Lab Report open their modules.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 flex-1">
              {patientDocumentReports.map((tile) => (
                <PatientDocumentRowCard key={tile.id} tile={tile} />
              ))}
            </CardContent>
          </Card>
        </div>

        {/* New Report Dialog */}
        <Dialog
          open={isNewReportOpen}
          onOpenChange={(open) => {
            setIsNewReportOpen(open);
            if (!open) resetCertificatePatientPicker();
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Create medical certificate
              </DialogTitle>
              <DialogDescription>Generate fitness/illness medical certificates for a patient.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <div className="space-y-2">
                <Label>Report type *</Label>
                <Select value={newReport.type} onValueChange={(v) => setNewReport((prev) => ({ ...prev, type: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {medicalCertificateTypeOptions.map((t) => (
                      <SelectItem key={t.id} value={t.title}>
                        {t.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Patient *</Label>
                {selectedCertificatePatient ? (
                  <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">
                        {selectedCertificatePatient.full_name ??
                          `${selectedCertificatePatient.first_name} ${selectedCertificatePatient.surname}`.trim()}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedCertificatePatient.patient_id}
                        {selectedCertificatePatient.age_display != null &&
                          selectedCertificatePatient.age_display !== "" &&
                          ` • ${selectedCertificatePatient.age_display}`}
                        {selectedCertificatePatient.gender && ` • ${selectedCertificatePatient.gender}`}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => setSelectedCertificatePatient(null)}
                      aria-label="Clear patient"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        className="pl-10"
                        placeholder="Search by name or patient ID…"
                        value={certificatePatientSearch}
                        onChange={(e) => setCertificatePatientSearch(e.target.value)}
                        autoComplete="off"
                      />
                    </div>
                    <div className="max-h-[220px] space-y-1 overflow-y-auto rounded-md border border-border p-1">
                      {certificateSearching && (
                        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching…
                        </div>
                      )}
                      {!certificateSearching &&
                        certificateSearchResults.length === 0 &&
                        certificatePatientSearch.trim() !== "" && (
                          <p className="py-6 text-center text-sm text-muted-foreground">No patients found.</p>
                        )}
                      {!certificateSearching &&
                        certificatePatientSearch.trim() === "" && (
                          <p className="py-6 text-center text-sm text-muted-foreground">
                            Type a name or patient ID to search the register.
                          </p>
                        )}
                      {!certificateSearching &&
                        certificateSearchResults.map((p) => {
                          const label = p.full_name ?? `${p.first_name} ${p.surname}`.trim();
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                setSelectedCertificatePatient(p);
                                setCertificatePatientSearch("");
                                setCertificateSearchResults([]);
                              }}
                              className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-muted/80"
                            >
                              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                                {label
                                  .split(/\s+/)
                                  .filter(Boolean)
                                  .slice(0, 2)
                                  .map((n) => n[0]?.toUpperCase())
                                  .join("")}
                              </div>
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{label}</p>
                                <p className="truncate text-xs text-muted-foreground">{p.patient_id}</p>
                              </div>
                            </button>
                          );
                        })}
                </div>
                  </>
                )}
              </div>
              
              {newReport.type === "Medical Certificate" && (
                <>
                  <div className="space-y-2">
                    <Label>Purpose</Label>
                    <Select
                      value={newReport.purpose}
                      onValueChange={(v) =>
                        setNewReport((prev) => ({
                          ...prev,
                          purpose: v,
                          sickLeaveDays: v === "illness" ? prev.sickLeaveDays : "",
                        }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select purpose" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fitness">Fitness certificate</SelectItem>
                        <SelectItem value="illness">Illness / sick leave</SelectItem>
                        <SelectItem value="travel">Travel medical</SelectItem>
                        <SelectItem value="employment">Employment medical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Start date</Label>
                      <Input
                        type="date"
                        value={newReport.startDate}
                        onChange={(e) => setNewReport((prev) => ({ ...prev, startDate: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>End date</Label>
                      <Input
                        type="date"
                        value={newReport.endDate}
                        onChange={(e) => setNewReport((prev) => ({ ...prev, endDate: e.target.value }))}
                      />
                    </div>
                  </div>
                  {newReport.purpose === "illness" && (
                    <div className="space-y-2">
                      <Label>Sick leave days (calendar) *</Label>
                      <Input
                        type="number"
                        min={1}
                        max={366}
                        inputMode="numeric"
                        placeholder="e.g. 3 — pre-filled from date range when empty"
                        value={newReport.sickLeaveDays}
                        onChange={(e) => setNewReport((prev) => ({ ...prev, sickLeaveDays: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Required for illness certificates. Matches the number of calendar days from start to end date unless you override.
                      </p>
                    </div>
                  )}
                </>
              )}

              {newReport.type === "Referral Letter" && (
                <div className="space-y-2">
                  <Label>Refer to (specialist / hospital)</Label>
                  <Input
                    value={newReport.referTo}
                    onChange={(e) => setNewReport((prev) => ({ ...prev, referTo: e.target.value }))}
                    placeholder="e.g., Dr. Smith, Cardiologist"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label>Clinical findings</Label>
                <Textarea
                  value={newReport.findings}
                  onChange={(e) => setNewReport((prev) => ({ ...prev, findings: e.target.value }))}
                  placeholder="Enter clinical findings and examination results..."
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea
                  value={newReport.recommendations}
                  onChange={(e) => setNewReport((prev) => ({ ...prev, recommendations: e.target.value }))}
                  placeholder="Enter recommendations..."
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewReportOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateReport} disabled={!newReport.type || !selectedCertificatePatient}>
                <Plus className="h-4 w-4 mr-2" />
                Create report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
