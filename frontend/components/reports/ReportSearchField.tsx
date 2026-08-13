"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ReportSearchFieldProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function ReportSearchField({
  value,
  onChange,
  placeholder = "Search code or description…",
}: ReportSearchFieldProps) {
  return (
    <div>
      <Label>Search</Label>
      <div className="relative mt-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="pl-9"
        />
      </div>
    </div>
  );
}
