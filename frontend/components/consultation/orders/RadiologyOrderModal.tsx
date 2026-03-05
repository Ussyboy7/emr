"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { radiologyService } from "@/lib/services";
import { isAuthenticationError } from "@/lib/auth-errors";

export type RadiologyTemplateLike = {
  id: number;
  name: string;
  code: string;
  category?: string;
  body_part?: string;
  modality?: string;
  radiation_exposure?: string;
};

export type RadiologyOrderSubmitInput = {
  priority: "routine" | "urgent" | "stat";
  clinicalIndication: string;
  provisionalDiagnosis: string;
  lmp?: string;
  templates: RadiologyTemplateLike[];
};

export function RadiologyOrderModal({
  open,
  onOpenChange,
  onSubmit,
  confirmLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: RadiologyOrderSubmitInput) => Promise<void>;
  confirmLabel?: string;
}) {
  const searchRequestIdRef = useRef(0);
  const dropdownContainerRef = useRef<HTMLDivElement>(null);
  const initialTemplatesRef = useRef<RadiologyTemplateLike[]>([]);
  const [templates, setTemplates] = useState<RadiologyTemplateLike[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [selectedDetails, setSelectedDetails] = useState<Map<number, RadiologyTemplateLike>>(new Map());

  const [priority, setPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [clinicalIndication, setClinicalIndication] = useState("");
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState("");
  const [lmp, setLmp] = useState("");

  const reset = useCallback(() => {
    setSearch("");
    setShowDropdown(false);
    setSelected(new Set());
    setSelectedDetails(new Map());
    setTemplates([]);
    initialTemplatesRef.current = [];
    setTemplatesError(null);
    setPriority("routine");
    setClinicalIndication("");
    setProvisionalDiagnosis("");
    setLmp("");
    setSubmitting(false);
  }, []);

  // Load initial templates when modal opens (so dropdown can show list before/without typing)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingTemplates(true);
        setTemplatesError(null);
        const res = await radiologyService.getTemplates({ page_size: 50 } as any);
        if (cancelled) return;
        const list = (res as any)?.results || [];
        initialTemplatesRef.current = list;
        setTemplates(list);
      } catch (err: any) {
        if (cancelled) return;
        setTemplates([]);
        setTemplatesError(isAuthenticationError(err) ? "Authentication required. Please log in again." : "Failed to load radiology templates");
        toast.error(isAuthenticationError(err) ? "Authentication required. Please log in again." : "Failed to load radiology templates");
      } finally {
        if (!cancelled) setLoadingTemplates(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open]);

  // Debounced search: when user types, search; when search cleared, show initial list again
  useEffect(() => {
    if (!open || !showDropdown) return;
    const searchTerm = search.trim();
    if (!searchTerm) {
      setTemplates(initialTemplatesRef.current);
      setTemplatesError(null);
      return;
    }
    const requestId = ++searchRequestIdRef.current;
    const timeout = setTimeout(async () => {
      try {
        setLoadingTemplates(true);
        setTemplatesError(null);
        const res = await radiologyService.getTemplates({ search: searchTerm, page_size: 50 } as any);
        if (requestId === searchRequestIdRef.current) {
          setTemplates((res as any)?.results || []);
        }
      } catch (err: any) {
        if (requestId === searchRequestIdRef.current) {
          setTemplates([]);
          setTemplatesError(isAuthenticationError(err) ? "Authentication required. Please log in again." : "Failed to load radiology templates");
          toast.error(isAuthenticationError(err) ? "Authentication required. Please log in again." : "Failed to load radiology templates");
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

  const addSelection = (t: RadiologyTemplateLike) => {
    setSelected((prev) => new Set([...prev, t.id]));
    setSelectedDetails((d) => new Map(d).set(t.id, t));
  };
  const removeSelection = (id: number) => {
    setSelected((prev) => new Set(Array.from(prev).filter((x) => x !== id)));
    setSelectedDetails((d) => {
      const m = new Map(d);
      m.delete(id);
      return m;
    });
  };

  const handleConfirm = async () => {
    if (selected.size === 0) {
      toast.error("Please select at least one imaging study");
      return;
    }
    if (!clinicalIndication.trim()) {
      toast.error("Clinical indication is required");
      return;
    }

    const selectedTemplates = Array.from(selected)
      .map((id) => selectedDetails.get(id) || templates.find((t) => t.id === id))
      .filter((t): t is RadiologyTemplateLike => !!t);

    try {
      setSubmitting(true);
      await onSubmit({
        priority,
        clinicalIndication: clinicalIndication.trim(),
        provisionalDiagnosis: provisionalDiagnosis.trim(),
        lmp: lmp.trim() || undefined,
        templates: selectedTemplates,
      });
      onOpenChange(false);
      reset();
    } catch (err: any) {
      console.error("Failed to submit radiology order:", err);
      toast.error(err?.message || "Failed to add radiology order");
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
            <ScanLine className="h-5 w-5 text-indigo-500" />
            Order Imaging Study
          </DialogTitle>
          <DialogDescription>Search and select from radiology templates - orders will be sent to Radiology queue</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Template selection */}
          <div className="space-y-2">
            <Label>Search and Select Imaging Studies *</Label>
            <div className="relative" ref={dropdownContainerRef}>
              <Input
                placeholder="Search imaging studies by name, code, or modality..."
                value={search}
                onChange={(e) => {
                  const v = e.target.value;
                  setSearch(v);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
              />

              {showDropdown && (
                <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {loadingTemplates ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 mx-auto mb-2 animate-spin" />
                      <p className="text-xs">Loading templates...</p>
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <p className="text-xs">
                        {templatesError ||
                          (search.trim()
                            ? `No studies match "${search.trim()}". Try a different term or clear the search to browse all.`
                            : "No imaging studies available. Try again later.")}
                      </p>
                    </div>
                  ) : (
                    <div className="p-2">
                      <div className="space-y-1">
                        {templates
                          .filter((t) => !selected.has(t.id))
                          .slice(0, 30)
                          .map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                              onClick={() => addSelection(t)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm truncate">{t.name}</span>
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {t.code}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                  <span>{t.category || "—"}</span>
                                  <span>•</span>
                                  <span>{t.body_part || "N/A"}</span>
                                  {t.radiation_exposure === "high" && (
                                    <>
                                      <span>•</span>
                                      <Badge variant="outline" className="text-[9px] px-1 py-0 text-amber-600">
                                        High Rad
                                      </Badge>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {selected.size > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Selected Studies ({selected.size})</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {Array.from(selected).map((id) => {
                    const t = selectedDetails.get(id) || templates.find((x) => x.id === id);
                    if (!t) return null;
                    return (
                      <div key={id} className="flex items-center justify-between p-2 bg-muted rounded text-sm">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{t.name}</div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="text-[10px]">
                              {t.code}
                            </Badge>
                            <span>{t.category || "—"}</span>
                            <span>•</span>
                            <span>{t.body_part || "—"}</span>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                          onClick={() => removeSelection(id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
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
            <div className="space-y-2">
              <Label>LMP</Label>
              <Input type="date" value={lmp} onChange={(e) => setLmp(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Clinical Indication *</Label>
            <Textarea
              value={clinicalIndication}
              onChange={(e) => setClinicalIndication(e.target.value)}
              placeholder="Reason for imaging, clinical findings, suspected diagnosis..."
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Provisional Diagnosis</Label>
            <Textarea
              value={provisionalDiagnosis}
              onChange={(e) => setProvisionalDiagnosis(e.target.value)}
              placeholder="Provisional diagnosis..."
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={submitting || selected.size === 0 || !clinicalIndication.trim()}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
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
