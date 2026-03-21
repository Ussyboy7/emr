"use client";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { SlidersHorizontal } from "lucide-react";

/** Compact icon button to open advanced / multi-field filter dialogs (h-9, matches Select height). */
export function AdvancedFiltersButton({ onClick }: { onClick: () => void }) {
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
            aria-label="More filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">More filters</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
