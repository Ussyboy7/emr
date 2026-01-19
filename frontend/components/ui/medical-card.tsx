"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { StatusBadge, StatusType } from "./status-badge";

interface MedicalCardProps {
  title: string;
  children: React.ReactNode;
  icon?: React.ReactNode;
  status?: string;
  statusType?: StatusType;
  priority?: "low" | "medium" | "high" | "emergency";
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

const priorityColors = {
  low: "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20",
  medium: "border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20",
  high: "border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-900/20",
  emergency: "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
};

const priorityBadges = {
  low: "Low Priority",
  medium: "Medium Priority",
  high: "High Priority",
  emergency: "Emergency"
};

export function MedicalCard({
  title,
  children,
  icon,
  status,
  statusType,
  priority,
  className,
  headerClassName,
  contentClassName
}: MedicalCardProps) {
  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-md",
      priority && priorityColors[priority],
      className
    )}>
      <CardHeader className={cn("pb-3", headerClassName)}>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            {icon}
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            {priority && (
              <Badge variant="outline" className={cn(
                priority === "emergency" && "border-red-300 text-red-700 bg-red-50",
                priority === "high" && "border-orange-300 text-orange-700 bg-orange-50",
                priority === "medium" && "border-yellow-300 text-yellow-700 bg-yellow-50",
                priority === "low" && "border-green-300 text-green-700 bg-green-50"
              )}>
                {priorityBadges[priority]}
              </Badge>
            )}
            {status && (
              <StatusBadge status={status} type={statusType} size="sm" />
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn("pt-0", contentClassName)}>
        {children}
      </CardContent>
    </Card>
  );
}

// Specialized card for patient information
export function PatientInfoCard({
  patient,
  children,
  className,
  ...props
}: MedicalCardProps & { patient?: { name?: string; id?: string; age?: number; gender?: string } }) {
  return (
    <MedicalCard
      {...props}
      className={cn("border-l-4 border-l-blue-500", className)}
    >
      {patient && (
        <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium text-blue-900 dark:text-blue-100">
                {patient.name}
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                ID: {patient.id}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {patient.age} years old
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {patient.gender}
              </p>
            </div>
          </div>
        </div>
      )}
      {children}
    </MedicalCard>
  );
}

// Specialized card for lab results
export function LabResultCard({
  testName,
  value,
  unit,
  referenceRange,
  status,
  date,
  className,
  ...props
}: MedicalCardProps & {
  testName: string;
  value?: string;
  unit?: string;
  referenceRange?: string;
  date?: string;
}) {
  const isAbnormal = status?.toLowerCase().includes('high') ||
                     status?.toLowerCase().includes('low') ||
                     status?.toLowerCase().includes('critical');

  return (
    <MedicalCard
      {...props}
      title={testName}
      status={status}
      statusType={isAbnormal ? "warning" : "success"}
      className={cn(
        isAbnormal && "border-l-4 border-l-yellow-500",
        !isAbnormal && "border-l-4 border-l-green-500",
        className
      )}
    >
      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Result</p>
          <p className="font-medium">
            {value || 'Pending'} {unit && <span className="text-gray-500">{unit}</span>}
          </p>
        </div>
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Reference Range</p>
          <p className="font-medium text-gray-700 dark:text-gray-300">
            {referenceRange || 'N/A'}
          </p>
        </div>
        {date && (
          <div className="col-span-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">Date</p>
            <p className="font-medium text-gray-700 dark:text-gray-300">
              {date}
            </p>
          </div>
        )}
      </div>
    </MedicalCard>
  );
}