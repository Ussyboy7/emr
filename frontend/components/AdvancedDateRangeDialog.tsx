"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Filter, X } from "lucide-react";

export interface AdvancedDateRangeValue {
  from: string;
  to: string;
}

interface AdvancedDateRangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  label: string;
  value: AdvancedDateRangeValue;
  onChange: (value: AdvancedDateRangeValue) => void;
  onClear: () => void;
}

export function AdvancedDateRangeDialog({
  open,
  onOpenChange,
  description,
  label,
  value,
  onChange,
  onClear,
}: AdvancedDateRangeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5 text-primary" />
            Advanced Filters
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="space-y-2">
            <Label>{label}</Label>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={value.from}
                onChange={(e) => onChange({ ...value, from: e.target.value })}
              />
              <span className="text-muted-foreground">to</span>
              <Input
                type="date"
                value={value.to}
                onChange={(e) => onChange({ ...value, to: e.target.value })}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClear}>
            <X className="h-4 w-4 mr-2" />
            Clear All
          </Button>
          <Button onClick={() => onOpenChange(false)}>Apply Filters</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
