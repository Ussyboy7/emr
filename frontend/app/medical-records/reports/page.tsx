"use client";

import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";
import type { LucideIcon } from "lucide-react";
import {
  FileText,
  BarChart3,
  Stethoscope,
  Activity,
  Pill,
  FlaskConical,
  ScanLine,
  Share2,
  TrendingUp,
  Phone,
  Layers,
  ChevronRight,
  MapPin,
  UserPlus,
  Users,
  ArrowLeft,
} from "lucide-react";

type StatisticalReportTile = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  href: string;
  borderAccent: string;
  iconWrap: string;
  iconClass: string;
};

const statisticalReports: StatisticalReportTile[] = [
  {
    id: "visit-statistics",
    title: "Visit Statistics",
    description: "Visit records by status (completed, cancelled, in progress) with monthly breakdown",
    icon: Activity,
    href: "/medical-records/reports/visit-statistics",
    borderAccent: "border-l-purple-500",
    iconWrap: "bg-purple-500/10",
    iconClass: "text-purple-500",
  },
  {
    id: "attendance-statistics",
    title: "Attendance Statistics",
    description: "BTMC-style matrix by clinic, category, and gender (all clinics + weekend)",
    icon: BarChart3,
    href: "/medical-records/reports/attendance-statistics",
    borderAccent: "border-l-blue-500",
    iconWrap: "bg-blue-500/10",
    iconClass: "text-blue-500",
  },
  {
    id: "clinic-statistics",
    title: "Clinic Statistics",
    description: "Per-clinic attendance (GOPD, Eye Clinic, Diamond, Healthron, Sickle Cell, Physiotherapy, Dental)",
    icon: Stethoscope,
    href: "/medical-records/reports/clinic-statistics",
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
    title: "Prescriptions Report",
    description: "Fully dispensed prescription orders by period",
    icon: Pill,
    href: "/medical-records/reports/dispensed-prescriptions",
    borderAccent: "border-l-violet-500",
    iconWrap: "bg-violet-500/10",
    iconClass: "text-violet-500",
  },
  {
    id: "laboratory-attendance",
    title: "Laboratory Attendance",
    description: "Distinct patients with lab orders by category",
    icon: FlaskConical,
    href: "/medical-records/reports/laboratory-attendance",
    borderAccent: "border-l-pink-500",
    iconWrap: "bg-pink-500/10",
    iconClass: "text-pink-500",
  },
  {
    id: "radiological-services",
    title: "Radiological Services",
    description: "Radiology studies by modality (X-Ray, ECG, Ultrasound, CT, MRI)",
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
    id: "top-diagnoses",
    title: "Top Diagnoses",
    description: "Most frequent ICD-10 diagnoses from completed consultations",
    icon: Stethoscope,
    href: "/medical-records/reports/top-diagnoses",
    borderAccent: "border-l-indigo-500",
    iconWrap: "bg-indigo-500/10",
    iconClass: "text-indigo-500",
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
    description: "Visits, prescriptions, lab, nursing, and patient breakdown",
    icon: Layers,
    href: "/medical-records/reports/comprehensive",
    borderAccent: "border-l-slate-500",
    iconWrap: "bg-slate-500/10",
    iconClass: "text-slate-500",
  },
  {
    id: "patient-demographics",
    title: "Patient Demographics",
    description: "Register distribution by category, gender, age, and blood group",
    icon: Users,
    href: "/medical-records/reports/patient-demographics",
    borderAccent: "border-l-blue-500",
    iconWrap: "bg-blue-500/10",
    iconClass: "text-blue-500",
  },
  {
    id: "lab-statistics",
    title: "Lab Statistics",
    description: "Lab order volume, priority, and status distribution",
    icon: FlaskConical,
    href: "/medical-records/reports/lab-statistics",
    borderAccent: "border-l-pink-500",
    iconWrap: "bg-pink-500/10",
    iconClass: "text-pink-500",
  },
  {
    id: "new-registrations",
    title: "New Registrations",
    description: "Daily breakdown of newly registered patients by category",
    icon: UserPlus,
    href: "/medical-records/reports/new-registrations",
    borderAccent: "border-l-emerald-500",
    iconWrap: "bg-emerald-500/10",
    iconClass: "text-emerald-500",
  },
];

function StatisticalReportRowCard({
  tile,
  onOpen,
}: {
  tile: StatisticalReportTile;
  onOpen: (href: string) => void;
}) {
  const Icon = tile.icon;
  return (
    <Card
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(tile.href);
        }
      }}
      className={`border-l-4 ${tile.borderAccent} border-border bg-card hover:shadow-md transition-shadow cursor-pointer`}
      onClick={() => onOpen(tile.href)}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tile.iconWrap}`}>
            <Icon className={`h-4 w-4 ${tile.iconClass}`} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-foreground text-sm sm:text-base truncate">{tile.title}</p>
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{tile.description}</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-70" />
        </div>
      </CardContent>
    </Card>
  );
}

export default function ReportsPage() {
  useMedicalRecordsPageAuth();
  const router = useRouter();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="mb-2">
          <Button variant="ghost" size="sm" className="-ml-2 gap-2 px-2" asChild>
            <Link href="/medical-records">
              <ArrowLeft className="h-4 w-4" />
              Back to medical records
            </Link>
          </Button>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <FileText className="h-8 w-8 text-teal-600 dark:text-teal-400" />
            Medical Reports
          </h1>
          <p className="text-muted-foreground mt-1">
            {statisticalReports.length} reports — open one, set the period, export CSV or print.
          </p>
        </div>

        <div className="space-y-3">
          {statisticalReports.map((tile) => (
            <StatisticalReportRowCard key={tile.id} tile={tile} onOpen={(href) => router.push(href)} />
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
