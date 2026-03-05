"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, TestTube, X } from "lucide-react";
import { toast } from "sonner";
import { labService } from "@/lib/services";

export type LabTemplateLike = {
  id: number;
  name: string;
  code?: string;
  sample_type?: string;
  description?: string;
};

export type LabOrderSubmitInput = {
  priority: "routine" | "urgent" | "stat";
  clinicalNotes: string;
  templates: LabTemplateLike[];
};

export function LabOrderModal({
  open,
  onOpenChange,
  onSubmit,
  confirmLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: LabOrderSubmitInput) => Promise<void>;
  confirmLabel?: string;
}) {
  const searchRequestIdRef = useRef(0);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const [templates, setTemplates] = useState<LabTemplateLike[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedDetails, setSelectedDetails] = useState<Map<number, LabTemplateLike>>(new Map());

  const [priority, setPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [clinicalNotes, setClinicalNotes] = useState("");

  const reset = useCallback(() => {
    setSearch("");
    setShowDropdown(false);
    setSelected(new Set());
    setSelectedDetails(new Map());
    setTemplates([]);
    setPriority("routine");
    setClinicalNotes("");
    setSubmitting(false);
  }, []);

  // Debounced search (same pattern as Prescription): search as you type, 300ms
  useEffect(() => {
    if (!open || !showDropdown) return;
    const searchTerm = search.trim();
    if (!searchTerm) {
      setTemplates([]);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    const timeout = setTimeout(async () => {
      try {
        setLoadingTemplates(true);
        const res = await labService.getTemplates({ search: searchTerm, page_size: 50 } as any);
        if (requestId === searchRequestIdRef.current) {
          setTemplates((res as any)?.results || []);
        }
      } catch (err: any) {
        if (requestId === searchRequestIdRef.current) {
          console.error("Failed to search lab templates:", err);
          toast.error("Failed to load lab templates");
          setTemplates([]);
        }
      } finally {
        if (requestId === searchRequestIdRef.current) {
          setLoadingTemplates(false);
        }
      }
    }, 300);
    return () => clearTimeout(timeout);
  }, [open, showDropdown, search]);

  // Close dropdown when clicking outside the search block
  useEffect(() => {
    if (!open || !showDropdown) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const el = dropdownContainerRef.current;
      if (el && !el.contains(target)) setShowDropdown(false);
    };
    document.addEventListener("pointerdown", handlePointerDown, true);
    return () => document.removeEventListener("pointerdown", handlePointerDown, true);
  }, [open, showDropdown]);

  const toggle = (t: LabTemplateLike) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(t.id)) {
        next.delete(t.id);
        setSelectedDetails((d) => {
          const m = new Map(d);
          m.delete(t.id);
          return m;
        });
      } else {
        next.add(t.id);
        setSelectedDetails((d) => new Map(d).set(t.id, t));
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) {
      toast.error("Please select at least one test");
      return;
    }

    const selectedTemplates = Array.from(selected)
      .map((id) => selectedDetails.get(id) || templates.find((t) => t.id === id))
      .filter((t): t is LabTemplateLike => !!t);

    try {
      setSubmitting(true);
      await onSubmit({
        priority,
        clinicalNotes: clinicalNotes.trim(),
        templates: selectedTemplates,
      });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      console.error("Failed to submit lab order:", err);
      toast.error(err?.message || "Failed to add lab order");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5 text-amber-500" />
            Order Lab Test(s)
          </DialogTitle>
          <DialogDescription>Select one or more laboratory tests to order - will be sent to Lab Tech queue</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Search and Select Tests *</Label>
            <div className="relative" ref={dropdownContainerRef}>
              <Input
                placeholder="Search tests by name, code, or sample type..."
                value={search}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearch(v);
                  if (v.trim()) setShowDropdown(true);
                  else setShowDropdown(false);
                }}
                onFocus={() => { if (search.trim()) setShowDropdown(true); }}
              />

              {showDropdown && search.trim() && (
                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
                  {loadingTemplates ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                      Loading tests...
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="p-4 text-center text-sm text-muted-foreground">No tests found. Try a different search term.</div>
                  ) : (
                    templates.map((t) => {
                      const isSelected = selected.has(t.id);
                      return (
                        <div
                          key={t.id}
                          onClick={() => toggle(t)}
                          className={`p-3 hover:bg-muted cursor-pointer border-b last:border-b-0 flex items-start gap-3 ${
                            isSelected ? "bg-amber-50 dark:bg-amber-900/20" : ""
                          }`}
                        >
                          <Checkbox checked={isSelected} onCheckedChange={() => toggle(t)} />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{t.name}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {t.code ? `${t.code} • ` : ""}
                              {t.sample_type || "N/A"}
                            </div>
                            {t.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-1">{t.description}</div>}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {selected.size > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selected Tests ({selected.size})</p>
                <div className="flex flex-wrap gap-2">
                  {Array.from(selected).map((id) => {
                    const t = selectedDetails.get(id) || templates.find((x) => x.id === id);
                    if (!t) return null;
                    return (
                      <Badge key={id} variant="secondary" className="flex items-center gap-1">
                        {t.name}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => toggle(t)} />
                      </Badge>
                    );
                  })}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setSelected(new Set()); setSelectedDetails(new Map()); }} className="text-xs">
                  Clear All
                </Button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="routine">
                    <Badge className="bg-blue-100 text-blue-800">Routine</Badge>
                  </SelectItem>
                  <SelectItem value="urgent">
                    <Badge className="bg-amber-100 text-amber-800">Urgent</Badge>
                  </SelectItem>
                  <SelectItem value="stat">
                    <Badge className="bg-red-100 text-red-800">STAT</Badge>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Clinical notes</Label>
            <Textarea
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              placeholder="Optional"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={submitting || selected.size === 0} className="bg-amber-500 hover:bg-amber-600">
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-2" />
                {confirmLabel || `Add ${selected.size ? `(${selected.size}) ` : ""}to Order`}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

