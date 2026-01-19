"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusType =
  | "completed"
  | "pending"
  | "in_progress"
  | "cancelled"
  | "scheduled"
  | "confirmed"
  | "suspected"
  | "active"
  | "inactive"
  | "success"
  | "error"
  | "warning"
  | "info";

interface StatusBadgeProps {
  status: string;
  type?: StatusType;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const statusConfig: Record<StatusType, { color: string; label?: string }> = {
  completed: {
    color: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
  },
  pending: {
    color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
  },
  in_progress: {
    color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
  },
  cancelled: {
    color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
  },
  scheduled: {
    color: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800"
  },
  confirmed: {
    color: "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
  },
  suspected: {
    color: "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
  },
  active: {
    color: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
  },
  inactive: {
    color: "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
  },
  success: {
    color: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800"
  },
  error: {
    color: "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
  },
  warning: {
    color: "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
  },
  info: {
    color: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
  }
};

const sizeClasses = {
  sm: "text-xs px-2 py-1",
  md: "text-sm px-3 py-1",
  lg: "text-base px-4 py-2"
};

export function StatusBadge({ status, type, size = "md", className }: StatusBadgeProps) {
  // Auto-detect status type if not provided
  const detectedType = type || getStatusType(status);

  const config = statusConfig[detectedType] || statusConfig.info;

  return (
    <Badge
      className={cn(
        config.color,
        sizeClasses[size],
        className
      )}
      variant="outline"
    >
      {config.label || formatStatusText(status)}
    </Badge>
  );
}

function getStatusType(status: string): StatusType {
  const statusLower = status.toLowerCase().replace(/\s+/g, '_');

  // Direct matches
  if (statusLower in statusConfig) {
    return statusLower as StatusType;
  }

  // Pattern matches
  if (statusLower.includes('complete') || statusLower === 'done') {
    return 'completed';
  }
  if (statusLower.includes('progress') || statusLower === 'in_progress') {
    return 'in_progress';
  }
  if (statusLower.includes('cancel')) {
    return 'cancelled';
  }
  if (statusLower.includes('schedule')) {
    return 'scheduled';
  }
  if (statusLower.includes('pending') || statusLower.includes('wait')) {
    return 'pending';
  }
  if (statusLower.includes('confirm')) {
    return 'confirmed';
  }
  if (statusLower.includes('suspect')) {
    return 'suspected';
  }
  if (statusLower === 'active' || statusLower.includes('activ')) {
    return 'active';
  }
  if (statusLower === 'inactive' || statusLower.includes('inactiv')) {
    return 'inactive';
  }

  return 'info';
}

function formatStatusText(status: string): string {
  return status
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .replace(/\bIn Progress\b/, 'In Progress');
}