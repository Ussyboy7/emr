"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type CalendarProps = {
  className?: string;
  classNames?: Record<string, string>;
  showOutsideDays?: boolean;
  [key: string]: any;
};

// Lazy load the Calendar component to reduce initial bundle size
const Calendar = React.lazy(() =>
  import("@/components/ui/calendar").then(module => ({
    default: React.memo(module.Calendar)
  }))
);

export function LazyCalendar(props: CalendarProps) {
  return (
    <React.Suspense
      fallback={
        <div className="flex items-center justify-center p-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }
    >
      <Calendar {...props} />
    </React.Suspense>
  );
}

// Re-export the original component for backward compatibility
export { Calendar as OriginalCalendar } from "./calendar";