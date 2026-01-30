"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, Plus, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { radiologyService } from "@/lib/services";

export type RadiologyTemplateLike = {
  id: number;
  name: string;
  code: string;
  category?: string;
  body_part?: string;
  modality?: string;
  contrast_required?: boolean;
  radiation_exposure?: string;
};

export type RadiologyOrderSubmitInput = {
  priority: "routine" | "urgent" | "stat";
  contrastRequired: boolean;
  clinicalIndication: string;
  specialInstructions: string;
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
  const [templates, setTemplates] = useState<RadiologyTemplateLike[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [search, setSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [priority, setPriority] = useState<"routine" | "urgent" | "stat">("routine");
  const [contrastRequired, setContrastRequired] = useState(false);
  const [clinicalIndication, setClinicalIndication] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  const reset = useCallback(() => {
    setSearch("");
    setShowDropdown(false);
    setSelected(new Set());
    setPriority("routine");
    setContrastRequired(false);
    setClinicalIndication("");
    setSpecialInstructions("");
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      try {
        setLoadingTemplates(true);
        const res = await radiologyService.getTemplates({ page_size: 500 } as any);
        setTemplates((res as any)?.results || []);
      } catch (err: any) {
        console.error("Failed to load radiology templates:", err);
        toast.error("Failed to load radiology templates");
        setTemplates([]);
      } finally {
        setLoadingTemplates(false);
      }
    };
    load();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => {
      return (
        (t.name || "").toLowerCase().includes(q) ||
        (t.code || "").toLowerCase().includes(q) ||
        (t.body_part || "").toLowerCase().includes(q) ||
        (t.modality || "").toLowerCase().includes(q) ||
        (t.category || "").toLowerCase().includes(q)
      );
    });
  }, [templates, search]);

  const handleConfirm = async () => {
    if (selected.size === 0) {
      toast.error("Please select at least one imaging study");
      return;
    }
    if (!clinicalIndication.trim()) {
      toast.error("Clinical indication is required");
      return;
    }

    const selectedTemplates = templates.filter((t) => selected.has(t.id));

    try {
      setSubmitting(true);
      await onSubmit({
        priority,
        contrastRequired,
        clinicalIndication: clinicalIndication.trim(),
        specialInstructions: specialInstructions.trim(),
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
            <div className="relative">
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

              {showDropdown && search.trim() && (
                <div className="absolute top-full left-0 right-0 z-50 bg-background border rounded-md shadow-lg max-h-60 overflow-y-auto">
                  {loadingTemplates ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <Loader2 className="h-4 w-4 mx-auto mb-2 animate-spin" />
                      <p className="text-xs">Loading templates...</p>
                    </div>
                  ) : templates.length === 0 ? (
                    <div className="p-4 text-center text-muted-foreground">
                      <p className="text-xs">No templates found</p>
                    </div>
                  ) : (
                    <div className="p-2">
                      {selected.size > 0 && (
                        <div className="mb-3 pb-2 border-b">
                          <p className="text-xs font-medium text-muted-foreground mb-2">Selected ({selected.size})</p>
                          <div className="flex flex-wrap gap-1">
                            {Array.from(selected).map((id) => {
                              const t = templates.find((x) => x.id === id);
                              if (!t) return null;
                              return (
                                <Badge
                                  key={id}
                                  variant="default"
                                  className="text-xs cursor-pointer hover:bg-destructive hover:text-destructive-foreground"
                                  onClick={() => setSelected((prev) => new Set(Array.from(prev).filter((x) => x !== id)))}
                                >
                                  {t.code} - {t.name}
                                  <X className="h-3 w-3 ml-1" />
                                </Badge>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        {filtered
                          .filter((t) => !selected.has(t.id))
                          .slice(0, 20)
                          .map((t) => (
                            <div
                              key={t.id}
                              className="flex items-center justify-between p-2 rounded hover:bg-muted cursor-pointer"
                              onClick={() => {
                                setSelected((prev) => new Set([...prev, t.id]));
                                setSearch("");
                                setShowDropdown(false);
                              }}
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
                                  {t.contrast_required && (
                                    <>
                                      <span>•</span>
                                      <Badge variant="destructive" className="text-[9px] px-1 py-0">
                                        Contrast
                                      </Badge>
                                    </>
                                  )}
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
                    const t = templates.find((x) => x.id === id);
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
                          onClick={() => setSelected((prev) => new Set(Array.from(prev).filter((x) => x !== id)))}
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
              <Label>Contrast Required?</Label>
              <Select value={contrastRequired ? "yes" : "no"} onValueChange={(v) => setContrastRequired(v === "yes")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">No</SelectItem>
                  <SelectItem value="yes">Yes - With Contrast</SelectItem>
                </SelectContent>
              </Select>
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
            <Label>Special Instructions</Label>
            <Textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              placeholder="Any special requirements, patient preparation, or notes for radiologist..."
              rows={2}
            />
          </div>

          {contrastRequired && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Patient will need kidney function test before contrast administration
              </p>
            </div>
          )}
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

