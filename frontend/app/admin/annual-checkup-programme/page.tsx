"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Loader2,
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  CheckCircle2,
  Layers,
  ListChecks,
  TestTube,
  ScanLine,
  Stethoscope,
  Activity,
  History,
  FileText,
  GripVertical,
} from "lucide-react";
import {
  annualCheckupService,
  capturedViaLabel,
  CAPTURED_VIA_OPTIONS,
  type CapturedVia,
  type CatalogItem,
} from "@/lib/services/annual-checkup-service";
import labService, { type LabTemplate } from "@/lib/services/lab-service";
import { radiologyService, type RadiologyTemplate } from "@/lib/services/radiology-service";
import { DEFAULT_CATALOG_PAGE_SIZE } from "@/lib/pagination-constants";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useDebouncedValue } from "@/hooks/use-debounced-value";

function codesToString(codes?: string[]) {
  return (codes || []).join(", ");
}

function stringToCodes(value: string) {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function usesLabCodes(via?: string) {
  return via === "laboratory" || via === "patient_record";
}

function usesRadiologyCodes(via?: string) {
  return via === "radiology";
}

function sortCatalogItems(items: CatalogItem[]): CatalogItem[] {
  return [...items].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label)
  );
}

function applyReorderWithinFilter(
  catalog: CatalogItem[],
  filteredCodes: string[],
  activeCode: string,
  overCode: string
): CatalogItem[] | null {
  const sorted = sortCatalogItems(catalog);
  const codeSet = new Set(filteredCodes);
  const filtered = sorted.filter((item) => codeSet.has(item.code));
  const oldIndex = filtered.findIndex((item) => item.code === activeCode);
  const newIndex = filtered.findIndex((item) => item.code === overCode);
  if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
    return null;
  }

  const reorderedFiltered = arrayMove(filtered, oldIndex, newIndex);
  let filteredIndex = 0;
  const merged = sorted.map((item) =>
    codeSet.has(item.code) ? reorderedFiltered[filteredIndex++] : item
  );
  return merged.map((item, index) => ({ ...item, sort_order: (index + 1) * 10 }));
}

function SortableInvestigationCard({
  item,
  disabled,
  children,
}: {
  item: CatalogItem;
  disabled: boolean;
  children: (dragHandle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.code,
    disabled,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.85 : 1,
  };

  const dragHandle = disabled ? null : (
    <button
      type="button"
      className="cursor-grab active:cursor-grabbing touch-none rounded p-1 text-muted-foreground hover:text-foreground hover:bg-muted/50"
      {...attributes}
      {...listeners}
      aria-label={`Drag to reorder ${item.label}`}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div ref={setNodeRef} style={style}>
      {children(dragHandle)}
    </div>
  );
}

function slugCatalogCode(prefix: string, templateCode: string) {
  const slug = templateCode
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug ? `${prefix}_${slug}` : prefix;
}

function viaIcon(via?: string) {
  switch (via) {
    case "laboratory":
      return TestTube;
    case "radiology":
      return ScanLine;
    case "eyecare":
      return Eye;
    case "vitals":
      return Activity;
    case "medical_history":
      return History;
    case "patient_record":
      return FileText;
    case "annual_checkup":
      return ClipboardCheck;
    default:
      return Stethoscope;
  }
}

const emptyForm = () => ({
  code: "",
  label: "",
  captured_via: "laboratory" as CapturedVia,
  tier: "A",
  sort_order: 0,
  skippable: true,
  is_active: true,
  lab_template_codes: "",
  radiology_template_codes: "",
  name_aliases: "",
});

export default function AnnualCheckupProgrammePage() {
  const { currentUser } = useCurrentUser();
  const [activeTab, setActiveTab] = useState<"investigations" | "defaults">("investigations");
  const [year, setYear] = useState(new Date().getFullYear());
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CatalogItem | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [labTemplates, setLabTemplates] = useState<LabTemplate[]>([]);
  const [radiologyTemplates, setRadiologyTemplates] = useState<RadiologyTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatePickerSearch, setTemplatePickerSearch] = useState("");

  const isAdmin =
    currentUser?.isSuperuser || currentUser?.systemRole === "System Administrator";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await annualCheckupService.getProgramme(year);
      setCatalog(data.catalog || []);
      setSelected(data.default_selected_codes || []);
    } catch {
      toast.error("Could not load annual check-up programme.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, tierFilter, statusFilter, activeTab]);

  const loadTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const [labRes, radRes] = await Promise.all([
        labService.getTemplates({ is_active: true, page_size: DEFAULT_CATALOG_PAGE_SIZE }),
        radiologyService.getTemplates({ is_active: true, page_size: DEFAULT_CATALOG_PAGE_SIZE }),
      ]);
      setLabTemplates(labRes.results || []);
      setRadiologyTemplates(radRes.results || []);
    } catch {
      toast.error("Could not load lab and imaging templates.");
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isCreateOpen || isEditOpen) {
      void loadTemplates();
      setTemplatePickerSearch("");
    }
  }, [isCreateOpen, isEditOpen, loadTemplates]);

  const selectedLabCodes = useMemo(
    () => stringToCodes(form.lab_template_codes),
    [form.lab_template_codes]
  );
  const selectedRadiologyCodes = useMemo(
    () => stringToCodes(form.radiology_template_codes),
    [form.radiology_template_codes]
  );

  const filteredLabTemplates = useMemo(() => {
    const q = templatePickerSearch.trim().toLowerCase();
    return labTemplates
      .filter((t) => {
        if (!q) return true;
        return (
          t.name.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [labTemplates, templatePickerSearch]);

  const filteredRadiologyTemplates = useMemo(() => {
    const q = templatePickerSearch.trim().toLowerCase();
    return radiologyTemplates
      .filter((t) => {
        if (!q) return true;
        return (
          t.name.toLowerCase().includes(q) ||
          t.code.toLowerCase().includes(q) ||
          (t.category || "").toLowerCase().includes(q) ||
          (t.modality || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [radiologyTemplates, templatePickerSearch]);

  const stats = useMemo(
    () => ({
      total: catalog.length,
      preTicked: selected.length,
      tierA: catalog.filter((c) => c.tier === "A").length,
      tierB: catalog.filter((c) => c.tier === "B").length,
    }),
    [catalog, selected]
  );

  const filteredInvestigations = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return catalog
      .filter((item) => {
        if (tierFilter !== "all" && item.tier !== tierFilter) return false;
        if (statusFilter === "Active" && item.is_active === false) return false;
        if (statusFilter === "Inactive" && item.is_active !== false) return false;
        if (!q) return true;
        return (
          item.label.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q) ||
          capturedViaLabel(item.captured_via).toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label));
  }, [catalog, debouncedSearch, tierFilter, statusFilter]);

  const filteredDefaults = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return catalog
      .filter((item) => item.is_active !== false)
      .filter((item) => {
        if (!q) return true;
        return (
          item.label.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.label.localeCompare(b.label));
  }, [catalog, debouncedSearch]);

  const canReorderInvestigations =
    isAdmin && !debouncedSearch.trim() && filteredInvestigations.length > 1;

  const defaultsPaginated = filteredDefaults.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const toggleDefault = (code: string, checked: boolean) => {
    setSelected((prev) => {
      if (checked) return prev.includes(code) ? prev : [...prev, code];
      return prev.filter((c) => c !== code);
    });
  };

  const openCreate = () => {
    const maxOrder = catalog.reduce((m, c) => Math.max(m, c.sort_order ?? 0), 0);
    setForm({ ...emptyForm(), sort_order: maxOrder + 10 });
    setIsCreateOpen(true);
  };

  const openEdit = (item: CatalogItem) => {
    setSelectedItem(item);
    setForm({
      code: item.code,
      label: item.label,
      captured_via: item.captured_via,
      tier: item.tier || "A",
      sort_order: item.sort_order ?? 0,
      skippable: item.skippable !== false,
      is_active: item.is_active !== false,
      lab_template_codes: codesToString(item.lab_template_codes),
      radiology_template_codes: codesToString(item.radiology_template_codes),
      name_aliases: codesToString(item.name_aliases),
    });
    setIsEditOpen(true);
  };

  const openView = (item: CatalogItem) => {
    setSelectedItem(item);
    setIsViewOpen(true);
  };

  const toggleLabTemplate = (template: LabTemplate, checked: boolean, autofill: boolean) => {
    setForm((prev) => {
      const codes = stringToCodes(prev.lab_template_codes);
      const nextCodes = checked
        ? [...codes, template.code].filter((c, i, a) => a.indexOf(c) === i)
        : codes.filter((c) => c !== template.code);
      const next: typeof prev = {
        ...prev,
        lab_template_codes: codesToString(nextCodes),
      };
      if (checked && autofill && nextCodes.length === 1) {
        if (!prev.code.trim()) {
          next.code = slugCatalogCode("lab", template.code);
        }
        if (!prev.label.trim()) {
          next.label = template.name;
        }
      }
      return next;
    });
  };

  const toggleRadiologyTemplate = (
    template: RadiologyTemplate,
    checked: boolean,
    autofill: boolean
  ) => {
    setForm((prev) => {
      const codes = stringToCodes(prev.radiology_template_codes);
      const nextCodes = checked
        ? [...codes, template.code].filter((c, i, a) => a.indexOf(c) === i)
        : codes.filter((c) => c !== template.code);
      const next: typeof prev = {
        ...prev,
        radiology_template_codes: codesToString(nextCodes),
      };
      if (checked && autofill && nextCodes.length === 1) {
        if (!prev.code.trim()) {
          next.code = slugCatalogCode("rad", template.code);
        }
        if (!prev.label.trim()) {
          next.label = template.name;
        }
      }
      return next;
    });
  };

  const formToPayload = () => ({
    code: form.code.trim(),
    label: form.label.trim(),
    captured_via: form.captured_via,
    tier: form.tier,
    sort_order: form.sort_order,
    skippable: form.skippable,
    is_active: form.is_active,
    lab_template_codes: stringToCodes(form.lab_template_codes),
    radiology_template_codes: stringToCodes(form.radiology_template_codes),
    name_aliases: stringToCodes(form.name_aliases),
  });

  const handleCreate = async () => {
    if (!isAdmin) return;
    if (!form.code.trim() || !form.label.trim()) {
      toast.error("Code and label are required.");
      return;
    }
    if (usesLabCodes(form.captured_via) && selectedLabCodes.length === 0) {
      toast.error("Select at least one lab template.");
      return;
    }
    if (usesRadiologyCodes(form.captured_via) && selectedRadiologyCodes.length === 0) {
      toast.error("Select at least one imaging template.");
      return;
    }
    setSaving(true);
    try {
      const data = await annualCheckupService.updateProgramme(
        { catalog_creates: [formToPayload()] },
        year
      );
      setCatalog(data.catalog || []);
      setSelected(data.default_selected_codes || []);
      setIsCreateOpen(false);
      toast.success("Investigation added to catalogue.");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : "Failed to add investigation.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!isAdmin || !selectedItem) return;
    setSaving(true);
    try {
      const payload = formToPayload();
      const data = await annualCheckupService.updateProgramme(
        {
          catalog_updates: [
            {
              code: selectedItem.code,
              label: payload.label,
              captured_via: payload.captured_via,
              tier: payload.tier,
              sort_order: selectedItem.sort_order ?? 0,
              skippable: payload.skippable,
              is_active: payload.is_active,
              lab_template_codes: payload.lab_template_codes,
              radiology_template_codes: payload.radiology_template_codes,
              name_aliases: payload.name_aliases,
            },
          ],
        },
        year
      );
      setCatalog(data.catalog || []);
      setSelected(data.default_selected_codes || []);
      setIsEditOpen(false);
      toast.success("Investigation updated.");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : "Failed to update investigation.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (item: CatalogItem) => {
    if (!isAdmin) return;
    if (!window.confirm(`Deactivate "${item.label}"? It will be hidden from new annual visits.`)) return;
    setSaving(true);
    try {
      const data = await annualCheckupService.updateProgramme(
        {
          catalog_updates: [{ code: item.code, is_active: false }],
          default_selected_codes: selected.filter((c) => c !== item.code),
        },
        year
      );
      setCatalog(data.catalog || []);
      setSelected(data.default_selected_codes || []);
      toast.success("Investigation deactivated.");
    } catch {
      toast.error("Failed to deactivate investigation.");
    } finally {
      setSaving(false);
    }
  };

  const handleInvestigationDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !isAdmin) return;

    const filteredCodes = filteredInvestigations.map((item) => item.code);
    const nextCatalog = applyReorderWithinFilter(
      catalog,
      filteredCodes,
      String(active.id),
      String(over.id)
    );
    if (!nextCatalog) return;

    const updates = nextCatalog
      .filter((item) => {
        const previous = catalog.find((entry) => entry.code === item.code);
        return previous && previous.sort_order !== item.sort_order;
      })
      .map((item) => ({ code: item.code, sort_order: item.sort_order }));

    if (updates.length === 0) return;

    const previousCatalog = catalog;
    setCatalog(nextCatalog);
    setReordering(true);
    try {
      const data = await annualCheckupService.updateProgramme({ catalog_updates: updates }, year);
      setCatalog(data.catalog || []);
      toast.success("Checklist order updated.");
    } catch {
      setCatalog(previousCatalog);
      toast.error("Failed to save new order.");
    } finally {
      setReordering(false);
    }
  };

  const handleSaveDefaults = async () => {
    if (!isAdmin) {
      toast.error("Only system administrators can update programme settings.");
      return;
    }
    setSaving(true);
    try {
      const data = await annualCheckupService.updateProgramme(
        { default_selected_codes: selected },
        year
      );
      setCatalog(data.catalog || []);
      setSelected(data.default_selected_codes || []);
      toast.success(`Programme defaults saved for ${year}.`);
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "apiMessage" in err
          ? String((err as { apiMessage?: string }).apiMessage)
          : "Failed to save programme defaults.";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const renderInvestigationCard = (item: CatalogItem, dragHandle: ReactNode = null) => {
    const Icon = viaIcon(item.captured_via);
    const active = item.is_active !== false;
    const preTicked = selected.includes(item.code);
    const border = active ? "border-l-teal-500" : "border-l-gray-500";

    return (
      <Card
        className={`border-l-4 hover:shadow-md transition-shadow ${border} ${!active ? "opacity-60" : ""}`}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            {dragHandle}
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                active ? "bg-teal-100 dark:bg-teal-900/30" : "bg-gray-100 dark:bg-gray-900/30"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-teal-600" : "text-gray-600"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground truncate">{item.label}</span>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                    {item.code}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Tier {item.tier}
                  </Badge>
                  <Badge variant={active ? "default" : "secondary"} className="text-[10px] px-1.5 py-0">
                    {active ? "Active" : "Inactive"}
                  </Badge>
                  {preTicked ? (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Pre-ticked {year}
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openView(item)}>
                    <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                  </Button>
                  {isAdmin ? (
                    <>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(item)}>
                        <Edit className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </Button>
                      {active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700"
                          onClick={() => handleDeactivate(item)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span>{capturedViaLabel(item.captured_via)}</span>
                {usesLabCodes(item.captured_via) && item.lab_template_codes?.length ? (
                  <>
                    <span>•</span>
                    <span className="font-mono">{item.lab_template_codes.join(", ")}</span>
                  </>
                ) : null}
                {usesRadiologyCodes(item.captured_via) && item.radiology_template_codes?.length ? (
                  <>
                    <span>•</span>
                    <span className="font-mono">{item.radiology_template_codes.join(", ")}</span>
                  </>
                ) : null}
                {item.skippable ? (
                  <>
                    <span>•</span>
                    <span>Skippable</span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderDefaultsCard = (item: CatalogItem) => {
    const Icon = viaIcon(item.captured_via);
    const checked = selected.includes(item.code);

    return (
      <Card
        key={item.code}
        className={`border-l-4 hover:shadow-md transition-shadow ${
          checked ? "border-l-emerald-500" : "border-l-gray-300"
        }`}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={checked}
              disabled={!isAdmin}
              onCheckedChange={(v) => toggleDefault(item.code, v === true)}
              className="mt-0.5"
            />
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                checked ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-muted"
              }`}
            >
              <Icon className={`h-5 w-5 ${checked ? "text-emerald-600" : "text-muted-foreground"}`} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-foreground">{item.label}</span>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">
                  {item.code}
                </Badge>
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  Tier {item.tier}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {capturedViaLabel(item.captured_via)}
                {checked ? ` • Pre-ticked for new visits in ${year}` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openView(item)}>
              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  const investigationFormFields = (codeDisabled = false, autofillFromTemplates = false) => (
    <div className="space-y-4 mt-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Captured via *</Label>
          <Select
            value={form.captured_via}
            onValueChange={(v) =>
              setForm((p) => ({
                ...p,
                captured_via: v as CapturedVia,
                lab_template_codes:
                  v === "laboratory" || v === "patient_record" ? p.lab_template_codes : "",
                radiology_template_codes: v === "radiology" ? p.radiology_template_codes : "",
              }))
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CAPTURED_VIA_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Tier</Label>
          <Select value={form.tier} onValueChange={(v) => setForm((p) => ({ ...p, tier: v }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="A">Tier A</SelectItem>
              <SelectItem value="B">Tier B</SelectItem>
              <SelectItem value="C">Tier C</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {usesLabCodes(form.captured_via) ? (
        <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
          <Label>Lab template(s) *</Label>
          <p className="text-xs text-muted-foreground">
            Pulled from the laboratory template catalogue. Selecting a template links its code for
            ordering and auto-completion.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={templatePickerSearch}
              onChange={(e) => setTemplatePickerSearch(e.target.value)}
              placeholder="Search lab templates..."
              className="pl-10"
            />
          </div>
          {templatesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading lab templates…
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-1 rounded-md border bg-background p-2">
              {filteredLabTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">No templates found</p>
              ) : (
                filteredLabTemplates.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedLabCodes.includes(t.code)}
                      onCheckedChange={(v) =>
                        toggleLabTemplate(t, v === true, autofillFromTemplates)
                      }
                    />
                    <span className="flex-1 min-w-0 truncate">{t.name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                      {t.code}
                    </Badge>
                  </label>
                ))
              )}
            </div>
          )}
          {selectedLabCodes.length > 0 ? (
            <p className="text-xs text-muted-foreground font-mono">
              Linked: {selectedLabCodes.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {usesRadiologyCodes(form.captured_via) ? (
        <div className="space-y-2 border rounded-lg p-3 bg-muted/20">
          <Label>Imaging template(s) *</Label>
          <p className="text-xs text-muted-foreground">
            Pulled from the radiology template catalogue.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={templatePickerSearch}
              onChange={(e) => setTemplatePickerSearch(e.target.value)}
              placeholder="Search imaging templates..."
              className="pl-10"
            />
          </div>
          {templatesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading imaging templates…
            </div>
          ) : (
            <div className="max-h-52 overflow-y-auto space-y-1 rounded-md border bg-background p-2">
              {filteredRadiologyTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3 text-center">No templates found</p>
              ) : (
                filteredRadiologyTemplates.map((t) => (
                  <label
                    key={t.id}
                    className="flex items-center gap-2 text-sm cursor-pointer rounded px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={selectedRadiologyCodes.includes(t.code)}
                      onCheckedChange={(v) =>
                        toggleRadiologyTemplate(t, v === true, autofillFromTemplates)
                      }
                    />
                    <span className="flex-1 min-w-0 truncate">{t.name}</span>
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                      {t.code}
                    </Badge>
                  </label>
                ))
              )}
            </div>
          )}
          {selectedRadiologyCodes.length > 0 ? (
            <p className="text-xs text-muted-foreground font-mono">
              Linked: {selectedRadiologyCodes.join(", ")}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Code *</Label>
          <Input
            value={form.code}
            disabled={codeDisabled}
            onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
            placeholder="e.g. lab_tft"
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label>Name *</Label>
          <Input
            value={form.label}
            onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
            placeholder="e.g. Thyroid function test"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Name aliases</Label>
        <Textarea
          value={form.name_aliases}
          onChange={(e) => setForm((p) => ({ ...p, name_aliases: e.target.value }))}
          placeholder="Comma-separated aliases for matching orders"
          rows={2}
        />
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="flex items-center gap-2">
          <Switch
            checked={form.skippable}
            onCheckedChange={(c) => setForm((p) => ({ ...p, skippable: c }))}
          />
          <Label>Skippable</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={form.is_active}
            onCheckedChange={(c) => setForm((p) => ({ ...p, is_active: c }))}
          />
          <Label>Active</Label>
        </div>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-teal-500" />
              Annual Check-up Programme
            </h1>
            <p className="text-muted-foreground mt-1 max-w-3xl">
              Investigations are the master catalogue of annual check-up steps; programme defaults
              control which are pre-ticked for new employee visits each year. Doctors can still
              adjust the checklist per patient in the consultation room.
            </p>
          </div>
          {isAdmin ? (
            <Button
              onClick={() => {
                if (activeTab === "investigations") openCreate();
                else handleSaveDefaults();
              }}
              disabled={saving || loading}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {activeTab === "investigations" ? (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add investigation
                </>
              ) : (
                <>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                  )}
                  Save defaults
                </>
              )}
            </Button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-teal-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total investigations</p>
                  <p className="text-2xl sm:text-3xl font-bold text-teal-600 dark:text-teal-400">
                    {stats.total}
                  </p>
                </div>
                <Layers className="h-8 w-8 text-teal-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pre-ticked ({year})</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {stats.preTicked}
                  </p>
                </div>
                <ListChecks className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tier A</p>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {stats.tierA}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Tier B</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">
                    {stats.tierB}
                  </p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as "investigations" | "defaults")}
        >
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="investigations">Investigations</TabsTrigger>
            <TabsTrigger value="defaults">Programme defaults ({year})</TabsTrigger>
          </TabsList>

          <Card className="mt-4">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                <div className="relative flex-1 min-w-[min(100%,16rem)]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {activeTab === "investigations" ? (
                    <Select value={tierFilter} onValueChange={setTierFilter}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Tier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All tiers</SelectItem>
                        <SelectItem value="A">Tier A</SelectItem>
                        <SelectItem value="B">Tier B</SelectItem>
                        <SelectItem value="C">Tier C</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <Label htmlFor="prog-year" className="text-sm whitespace-nowrap">
                        Year
                      </Label>
                      <Input
                        id="prog-year"
                        type="number"
                        className="w-24"
                        value={year}
                        onChange={(e) =>
                          setYear(parseInt(e.target.value, 10) || new Date().getFullYear())
                        }
                      />
                    </div>
                  )}
                  {activeTab === "investigations" ? (
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All status</SelectItem>
                        <SelectItem value="Active">Active</SelectItem>
                        <SelectItem value="Inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <TabsContent value="investigations">
            {isAdmin && !loading ? (
              <p className="text-xs text-muted-foreground mt-3">
                {debouncedSearch.trim()
                  ? "Clear search to drag and reorder the checklist."
                  : "Drag investigations to set checklist order (saved automatically)."}
                {reordering ? " Saving order…" : ""}
              </p>
            ) : null}
            {loading ? (
              <Card className="mt-4">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p>Loading investigations...</p>
                </CardContent>
              </Card>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleInvestigationDragEnd}
              >
                <SortableContext
                  items={filteredInvestigations.map((item) => item.code)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-3 mt-4">
                    {filteredInvestigations.map((item) => (
                      <SortableInvestigationCard
                        key={item.code}
                        item={item}
                        disabled={!canReorderInvestigations || reordering}
                      >
                        {(dragHandle) => renderInvestigationCard(item, dragHandle)}
                      </SortableInvestigationCard>
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            {!loading && filteredInvestigations.length === 0 && (
              <Card className="mt-4">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <TestTube className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No investigations found</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="defaults">
            {!isAdmin ? (
              <Card className="mt-4 border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10">
                <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-200">
                  View only — system administrator role required to change programme defaults.
                </CardContent>
              </Card>
            ) : null}
            {loading ? (
              <Card className="mt-4">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p>Loading programme defaults...</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3 mt-4">
                {defaultsPaginated.map(renderDefaultsCard)}
              </div>
            )}
            {!loading && filteredDefaults.length === 0 && (
              <Card className="mt-4">
                <CardContent className="p-8 text-center text-muted-foreground">
                  <ListChecks className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No active investigations to configure</p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {activeTab === "defaults" && filteredDefaults.length > 0 && !loading ? (
            <div className="mt-4">
              <Card className="p-4">
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={filteredDefaults.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={setItemsPerPage}
                  itemName="defaults"
                />
              </Card>
            </div>
          ) : null}
        </Tabs>
      </div>

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-teal-500" />
              Add investigation
            </DialogTitle>
            <DialogDescription>
              For lab and imaging, pick from existing templates — code and name can auto-fill. Other
              types use a manual checklist code (lowercase, underscores).
            </DialogDescription>
          </DialogHeader>
          {investigationFormFields(false, true)}
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={saving || !form.code.trim() || !form.label.trim()}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {saving ? "Saving…" : "Create investigation"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-teal-500" />
              Edit investigation
            </DialogTitle>
            <DialogDescription>{selectedItem?.code}</DialogDescription>
          </DialogHeader>
          {investigationFormFields(true, false)}
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={saving || !form.label.trim()}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isViewOpen} onOpenChange={setIsViewOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-teal-500" />
              {selectedItem?.label}
            </DialogTitle>
            <DialogDescription className="font-mono">{selectedItem?.code}</DialogDescription>
          </DialogHeader>
          {selectedItem ? (
            <div className="space-y-4 mt-2 text-sm">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium">{capturedViaLabel(selectedItem.captured_via)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Tier</p>
                  <p className="font-medium">Tier {selectedItem.tier}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">
                    {selectedItem.is_active === false ? "Inactive" : "Active"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Pre-ticked ({year})</p>
                  <p className="font-medium">
                    {selected.includes(selectedItem.code) ? "Yes" : "No"}
                  </p>
                </div>
              </div>
              {usesLabCodes(selectedItem.captured_via) ? (
                <div>
                  <p className="text-muted-foreground">Lab template codes</p>
                  <p className="font-mono font-medium">
                    {selectedItem.lab_template_codes?.join(", ") || "—"}
                  </p>
                </div>
              ) : null}
              {usesRadiologyCodes(selectedItem.captured_via) ? (
                <div>
                  <p className="text-muted-foreground">Radiology template codes</p>
                  <p className="font-mono font-medium">
                    {selectedItem.radiology_template_codes?.join(", ") || "—"}
                  </p>
                </div>
              ) : null}
              {selectedItem.name_aliases?.length ? (
                <div>
                  <p className="text-muted-foreground">Aliases</p>
                  <p>{selectedItem.name_aliases.join(", ")}</p>
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>
              Close
            </Button>
            {isAdmin && selectedItem ? (
              <Button
                onClick={() => {
                  setIsViewOpen(false);
                  openEdit(selectedItem);
                }}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
