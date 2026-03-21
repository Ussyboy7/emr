"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { CalendarRange } from "lucide-react";

/** Compact icon button to open AdvancedDateRangeDialog — matches inline filter selects (h-9). */
export function CustomDateRangeButton({ onClick }: { onClick: () => void }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-9 w-9 shrink-0"
            onClick={onClick}
            aria-label="Custom date range"
          >
            <CalendarRange className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Custom date range</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
