"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { consultationService, type ICD10Code } from "@/lib/services/consultation-service";
import {
  ORDER_DIAGNOSIS_TYPE_OPTIONS,
  orderDiagnosisEntryKey,
  orderDiagnosesToIcd10Rows,
  type OrderDiagnosisEntry,
  type OrderDiagnosisType,
} from "@/lib/consultation/order-diagnoses";
import { Icd10DiagnosesBlock } from "@/components/medical/Icd10DiagnosesBlock";
import { toast } from "sonner";

type Icd10DiagnosisMultiPickerProps = {
  diagnoses: OrderDiagnosisEntry[];
  onChange: (diagnoses: OrderDiagnosisEntry[]) => void;
  disabled?: boolean;
};

export function Icd10DiagnosisMultiPicker({
  diagnoses,
  onChange,
  disabled = false,
}: Icd10DiagnosisMultiPickerProps) {
  const [selectedType, setSelectedType] = useState<OrderDiagnosisType>("Primary");
  const [searchQuery, setSearchQuery] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [defaultCodes, setDefaultCodes] = useState<ICD10Code[]>([]);
  const [searchResults, setSearchResults] = useState<ICD10Code[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    consultationService
      .getICD10Codes({ page_size: 50 })
      .then((res) => {
        if (!cancelled) setDefaultCodes(res.results || []);
      })
      .catch(() => {
        if (!cancelled) setDefaultCodes([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const runSearch = useCallback(async (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const res = await consultationService.getICD10Codes({ search: trimmed, page_size: 50 });
      setSearchResults(res.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleSearchChange = (next: string) => {
    setSearchQuery(next);
    setShowDropdown(true);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      void runSearch(next);
    }, 300);
  };

  const addDiagnosis = (code: ICD10Code) => {
    const entry: OrderDiagnosisEntry = {
      type: selectedType,
      code: code.code,
      description: code.description,
    };
    const key = orderDiagnosisEntryKey(entry);
    if (diagnoses.some((d) => orderDiagnosisEntryKey(d) === key)) {
      toast.info("This diagnosis is already in the list");
      return;
    }
    onChange([...diagnoses, entry]);
    toast.success(`Added ${selectedType} diagnosis: ${code.code}`);
    setSearchQuery("");
    setSearchResults([]);
    setShowDropdown(false);
  };

  const removeDiagnosis = (index: number) => {
    onChange(diagnoses.filter((_, i) => i !== index));
  };

  const displayCodes = searchQuery.trim() ? searchResults : defaultCodes.slice(0, 20);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Diagnosis Type *</Label>
        <Select
          value={selectedType}
          onValueChange={(v) => setSelectedType(v as OrderDiagnosisType)}
          disabled={disabled}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ORDER_DIAGNOSIS_TYPE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${opt.dotClass}`} />
                  {opt.label}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label>Search ICD-10 Code *</Label>
        <p className="text-xs text-muted-foreground">
          Search and select a row to add it to the list. Change the type and search again to add another diagnosis.
        </p>
        <div className="relative" ref={containerRef}>
          <Input
            value={searchQuery}
            disabled={disabled}
            onChange={(e) => handleSearchChange(e.target.value)}
            onFocus={() => setShowDropdown(true)}
            placeholder="Search by code or condition name (e.g., I10 or Hypertension)..."
          />
          {showDropdown && (
            <div className="absolute z-50 mt-1 max-h-[250px] w-full overflow-y-auto rounded-md border bg-background shadow-lg">
              {isSearching ? (
                <div className="p-4 text-center text-sm text-muted-foreground">Searching...</div>
              ) : displayCodes.length === 0 ? (
                <div className="p-4 text-center text-sm text-muted-foreground">
                  {searchQuery.trim() ? "No matching ICD-10 codes found" : "Start typing to search ICD-10 codes"}
                </div>
              ) : (
                displayCodes.map((dx, index) => (
                  <button
                    key={`${dx.code}-${index}`}
                    type="button"
                    className="w-full p-2 text-left hover:bg-muted"
                    onClick={() => addDiagnosis(dx)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium">
                        <span className="mr-2 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{dx.code}</span>
                        {dx.description}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-xs">
                        {dx.category}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {diagnoses.length > 0 ? (
        <div className="space-y-2">
          <Label className="text-sm font-semibold">Diagnosis (ICD-10)</Label>
          <Icd10DiagnosesBlock
            diagnoses={orderDiagnosesToIcd10Rows(diagnoses)}
            onRemove={disabled ? undefined : removeDiagnosis}
            compact
          />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No diagnoses added yet.</p>
      )}
    </div>
  );
}
