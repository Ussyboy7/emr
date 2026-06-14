'use client';
import { CATALOG_SEARCH_PAGE_SIZE, MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';

import { formatDisplayDateTime } from '@/lib/dates';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { apiFetch } from '@/lib/api-client';
import type { PatientAdmission } from '@/lib/services/ward-service';
import { pharmacyService } from '@/lib/services/pharmacy-service';
import { toast } from 'sonner';
import {
  ClipboardList,
  Loader2,
  Plus,
  CheckCircle2,
  Pencil,
  Ban,
  History,
  Pill,
  Syringe,
  Bandage,
  Info,
  Check,
} from 'lucide-react';

/** Shape returned by `/v1/pharmacy/generics/for_prescription/`. */
type GenericLike = {
  id: number | string;
  name?: string;
  active_ingredient?: string;
  category?: string;
  form?: string;
  dosage_form?: string;
  strength?: string;
  route?: string;
};

const formatGenericLabel = (g: GenericLike): string => {
  const name = g.name?.trim() || '';
  const strength = (g.strength || '').trim();
  const form = (g.dosage_form || g.form || '').trim();
  if (strength && form) return `${name} (${strength}, ${form})`;
  if (strength) return `${name} (${strength})`;
  if (form) return `${name} (${form})`;
  return name;
};

/** Maps a free-text generic route ("oral", "Intravenous (IV)", …) onto the
 *  fixed Select options used by the ward order form. Falls back to whatever
 *  the user previously had so an unrecognised value never silently disappears.
 */
const mapGenericRouteToOption = (route: string | undefined, fallback: string): string => {
  const r = (route || '').trim().toLowerCase();
  if (!r) return fallback;
  if (r.includes('iv') || r.includes('intraven')) return 'Intravenous (IV)';
  if (r.includes('im') || r.includes('intramus')) return 'Intramuscular (IM)';
  if (r.includes('sc') || r.includes('subcut')) return 'Subcutaneous (SC)';
  if (r.includes('topic') || r.includes('skin')) return 'Topical';
  if (r.includes('oral')) return 'Oral';
  return fallback;
};

const FREQUENCY_OPTIONS = [
  'Once daily (OD)',
  'Twice daily (BD)',
  'Three times daily (TDS)',
  'Four times daily (QDS)',
  'Every 6 hours (Q6H)',
  'Every 8 hours (Q8H)',
  'Every 12 hours (Q12H)',
  'At bedtime (Nocte)',
  'As needed (PRN)',
  'STAT (Single dose)',
  'Weekly',
] as const;

// Mirrors the consultation Add-Nursing-Order dialog so the ward and the consult
// room speak the same language about wound care.
const WOUND_TYPES = [
  'Surgical Wound',
  'Traumatic Wound',
  'Burn Wound',
  'Pressure Ulcer',
  'Diabetic Foot Ulcer',
  'Venous Leg Ulcer',
  'Other',
] as const;

const WOUND_LOCATIONS = [
  'Head/Neck',
  'Chest',
  'Abdomen',
  'Back',
  'Upper Limb - Left',
  'Upper Limb - Right',
  'Lower Limb - Left',
  'Lower Limb - Right',
  'Perineal Region',
  'Multiple Sites',
] as const;

type MedConfig = {
  generic: GenericLike;
  dosage: string;
  frequency: string;
  durationDays: string;
  route: string;
  instructions: string;
};

export interface WardNursingOrderRow {
  id: number;
  order_id: string;
  order_type: string;
  description: string;
  status: string;
  priority: string;
  ordered_at: string;
  ordered_by_name?: string | null;
  /** 'nursing' rows are NursingOrder records (editable from the ward). */
  /** 'pharmacy' rows are virtual rows synthesized from a Pharmacy
   * prescription so the ward can show medications it sent. They're
   * read-only here — cancellation lives in the pharmacy module. */
  source?: 'nursing' | 'pharmacy';
  /** Original prescription PK, only set for source='pharmacy'. */
  prescription_id_pk?: number;
}

type OrderKind = 'instruction' | 'medication' | 'injection' | 'dressing';

type ListFilter = 'active' | 'history' | 'all';

const isInstructionType = (t: string) =>
  String(t || '').toLowerCase() === 'ward instruction';

const priorityApi = (p: string) =>
  p === 'urgent' || p === 'high' || p === 'low' || p === 'medium' ? p : 'medium';

const isActiveStatus = (s: string) => {
  const x = String(s || '').toLowerCase();
  return x === 'pending' || x === 'in_progress';
};

const isHistoryStatus = (s: string) => {
  const x = String(s || '').toLowerCase();
  return x === 'completed' || x === 'cancelled';
};

/** Visual + icon descriptor per order kind. */
const kindMeta = (orderType: string) => {
  const t = String(orderType || '').toLowerCase();
  if (t === 'medication')   return { label: 'Medication', icon: Pill,          accent: 'border-l-blue-500',   tint: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' };
  if (t === 'injection')    return { label: 'Injection',  icon: Syringe,       accent: 'border-l-purple-500', tint: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' };
  if (t === 'dressing')     return { label: 'Dressing',   icon: Bandage,       accent: 'border-l-amber-500',  tint: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
  return                   { label: 'Instruction',       icon: ClipboardList, accent: 'border-l-teal-500',   tint: 'bg-teal-500/10 text-teal-600 dark:text-teal-400' };
};

/**
 * Decompose the bullet-joined `description` produced by `buildDescription()`
 * back into structured rows for display. Falls back to the raw description
 * for legacy / unstructured records (e.g. ward instructions).
 */
const parseDescription = (orderType: string, description: string): { primary: string; fields: Array<{ label: string; value: string }> } => {
  const t = String(orderType || '').toLowerCase();
  const raw = String(description || '').trim();
  if (!raw) return { primary: '—', fields: [] };

  if (t === 'medication' || t === 'injection') {
    const [name, ...rest] = raw.split('•').map((s) => s.trim()).filter(Boolean);
    const fields: Array<{ label: string; value: string }> = [];
    for (const part of rest) {
      const m = part.match(/^(Dose|Frequency|Duration|Route|Notes|Instructions):\s*(.+)$/i);
      if (m) fields.push({ label: m[1], value: m[2] });
    }
    return { primary: name || raw, fields };
  }

  if (t === 'dressing') {
    const [siteOrWound, ...rest] = raw.split('•').map((s) => s.trim()).filter(Boolean);
    const fields: Array<{ label: string; value: string }> = [];
    for (const part of rest) {
      const m = part.match(/^(Wound type|Location|Instructions):\s*(.+)$/i);
      if (m) fields.push({ label: m[1], value: m[2] });
    }
    return { primary: siteOrWound || raw, fields };
  }

  return { primary: raw, fields: [] };
};

/** "2d ago", "5h ago", "just now" — used alongside an absolute date. */
const relativeTime = (iso: string) => {
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 5) return `${w}w ago`;
  return ''; // older than a month — absolute date is enough
};

export function WardDoctorOrdersSection({
  admission,
  allowAddOrders,
  allowEditCancelOrders,
  currentUserId,
}: {
  admission: PatientAdmission;
  allowAddOrders: boolean;
  /** Doctors + nursing staff can edit/cancel pending ward orders */
  allowEditCancelOrders: boolean;
  currentUserId?: number;
}) {
  const [orders, setOrders] = useState<WardNursingOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listFilter, setListFilter] = useState<ListFilter>('active');
  const [addOpen, setAddOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [orderKind, setOrderKind] = useState<OrderKind>('instruction');
  const [priority, setPriority] = useState<string>('medium');
  const [instructionText, setInstructionText] = useState('');
  const [woundType, setWoundType] = useState('');
  const [woundLocation, setWoundLocation] = useState('');
  const [dressingNotes, setDressingNotes] = useState('');

  const [editingOrder, setEditingOrder] = useState<WardNursingOrderRow | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editSaving, setEditSaving] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<WardNursingOrderRow | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  // Multi-select medication picker (same data source + UX as the consultation
  // prescription modal). The doctor can pick several generics, configure each,
  // and submit them as a batch — one nursing order per medication.
  const [medSearch, setMedSearch] = useState('');
  const [medGenerics, setMedGenerics] = useState<GenericLike[]>([]);
  const [medSearchLoading, setMedSearchLoading] = useState(false);
  const [showMedDropdown, setShowMedDropdown] = useState(false);
  const [selectedMedKeys, setSelectedMedKeys] = useState<string[]>([]);
  const [medConfigs, setMedConfigs] = useState<Map<string, MedConfig>>(new Map());
  const medSearchReqRef = useRef(0);
  const medSearchBoxRef = useRef<HTMLDivElement>(null);

  // Stable key per generic — covers numeric IDs, string IDs, and (future)
  // free-text custom entries.
  const genericKey = (g: GenericLike): string => `g:${String(g.id)}`;

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      // Doctor orders span two queues: NursingOrder (instructions /
      // injections / dressings) and pharmacy.Prescription (medications).
      // We fetch both and present them in one merged list so the ward
      // doctor sees everything they've ordered for this admission.
      const [nursingRes, rxRes] = await Promise.all([
        apiFetch<{ results: WardNursingOrderRow[] }>(
          `/nursing/orders/?admission=${admission.id}&ordering=-ordered_at&page_size=${MAX_LIST_PAGE_SIZE}`,
        ),
        admission.visit
          ? apiFetch<{ results: any[] }>(
              `/v1/pharmacy/prescriptions/?visit=${admission.visit}&page_size=${MAX_LIST_PAGE_SIZE}&ordering=-prescribed_at`,
            ).catch(() => ({ results: [] as any[] }))
          : Promise.resolve({ results: [] as any[] }),
      ]);

      const nursingRows: WardNursingOrderRow[] = (nursingRes.results || []).map((r) => ({
        ...r,
        source: 'nursing' as const,
      }));

      // Synthesize one row per prescription item so the merged list
      // matches the ward's "one medication = one row" mental model.
      const rxRows: WardNursingOrderRow[] = [];
      for (const rx of rxRes.results || []) {
        const items: any[] = rx.items || rx.medications || [];
        const rxStatus = String(rx.status || 'pending').toLowerCase();
        // Map pharmacy lifecycle to the active/history split this UI uses.
        const mappedStatus =
          rxStatus === 'pending' || rxStatus === 'dispensing' || rxStatus === 'partially_dispensed'
            ? 'pending'
            : rxStatus === 'dispensed'
              ? 'completed'
              : rxStatus === 'cancelled'
                ? 'cancelled'
                : 'pending';
        for (const it of items) {
          const name = it.medication_name || it.medication_details?.name || 'Medication';
          const parts = [
            name,
            it.dose && `Dose: ${it.dose}`,
            it.frequency && `Frequency: ${it.frequency}`,
            it.duration && `Duration: ${it.duration}`,
            it.route && `Route: ${it.route}`,
            it.instructions && `Instructions: ${it.instructions}`,
          ].filter(Boolean);
          rxRows.push({
            id: it.id,
            order_id: rx.prescription_id || `RX-${rx.id}`,
            order_type: 'medication',
            description: parts.join(' • '),
            status: mappedStatus,
            priority: 'medium',
            ordered_at: rx.prescribed_at || rx.created_at || new Date().toISOString(),
            ordered_by_name: rx.doctor_name || null,
            source: 'pharmacy',
            prescription_id_pk: rx.id,
          });
        }
      }

      // Merge + sort by ordered_at desc.
      const merged = [...nursingRows, ...rxRows].sort(
        (a, b) => new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime(),
      );
      setOrders(merged);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load doctor orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [admission.id, admission.visit]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    if (listFilter === 'all') return orders;
    if (listFilter === 'active') return orders.filter((o) => isActiveStatus(o.status));
    return orders.filter((o) => isHistoryStatus(o.status));
  }, [orders, listFilter]);

  const counts = useMemo(() => ({
    active:  orders.filter((o) => isActiveStatus(o.status)).length,
    history: orders.filter((o) => isHistoryStatus(o.status)).length,
    all:     orders.length,
  }), [orders]);

  const resetAddForm = () => {
    setOrderKind('instruction');
    setPriority('medium');
    setInstructionText('');
    setWoundType('');
    setWoundLocation('');
    setDressingNotes('');
    setMedSearch('');
    setMedGenerics([]);
    setShowMedDropdown(false);
    setSelectedMedKeys([]);
    setMedConfigs(new Map());
  };

  const updateMedConfig = (key: string, patch: Partial<MedConfig>) => {
    setMedConfigs((prev) => {
      const next = new Map(prev);
      const cur = next.get(key);
      if (!cur) return prev;
      next.set(key, { ...cur, ...patch });
      return next;
    });
  };

  const removeSelectedMed = (key: string) => {
    setSelectedMedKeys((prev) => prev.filter((k) => k !== key));
    setMedConfigs((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  };

  const clearAllMeds = () => {
    setSelectedMedKeys([]);
    setMedConfigs(new Map());
  };

  // Debounced generics search — only runs while the dropdown is open and a
  // medication-like order kind is selected, so we don't send phantom requests.
  useEffect(() => {
    if (!addOpen) return;
    if (orderKind !== 'medication' && orderKind !== 'injection') return;
    if (!showMedDropdown) return;
    const term = medSearch.trim();
    if (!term) {
      setMedGenerics([]);
      return;
    }
    const reqId = ++medSearchReqRef.current;
    const t = setTimeout(async () => {
      try {
        setMedSearchLoading(true);
        const res = await pharmacyService.getGenericsForPrescription({ search: term, page_size: CATALOG_SEARCH_PAGE_SIZE });
        if (reqId === medSearchReqRef.current) {
          setMedGenerics(res.results || []);
        }
      } catch {
        if (reqId === medSearchReqRef.current) {
          setMedGenerics([]);
        }
      } finally {
        if (reqId === medSearchReqRef.current) setMedSearchLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [addOpen, medSearch, orderKind, showMedDropdown]);

  // Close the dropdown when the user clicks anywhere outside the search box.
  useEffect(() => {
    if (!showMedDropdown) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (medSearchBoxRef.current && !medSearchBoxRef.current.contains(target)) {
        setShowMedDropdown(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [showMedDropdown]);

  const toggleGeneric = (g: GenericLike) => {
    const key = genericKey(g);
    const already = selectedMedKeys.includes(key);
    if (already) {
      removeSelectedMed(key);
      return;
    }
    const route = mapGenericRouteToOption(g.route, 'Oral');
    const dosage = (g.strength || '').trim();
    setSelectedMedKeys((prev) => [...prev, key]);
    setMedConfigs((prev) => {
      const next = new Map(prev);
      next.set(key, {
        generic: g,
        dosage,
        frequency: 'Once daily (OD)',
        durationDays: '',
        route,
        instructions: '',
      });
      return next;
    });
    // Keep the search focused so the doctor can quickly add the next med —
    // mirrors how the consultation prescription modal stays sticky.
    setMedSearch('');
  };

  const buildMedDescription = (cfg: MedConfig): string => {
    const parts: Array<string | false> = [
      formatGenericLabel(cfg.generic) || 'Medication',
      cfg.dosage.trim() && `Dose: ${cfg.dosage.trim()}`,
      cfg.frequency.trim() && `Frequency: ${cfg.frequency.trim()}`,
      cfg.durationDays.trim() && `Duration: ${cfg.durationDays.trim()} day(s)`,
      cfg.route.trim() && `Route: ${cfg.route.trim()}`,
      cfg.instructions.trim() && `Instructions: ${cfg.instructions.trim()}`,
    ];
    return parts.filter(Boolean).join(' • ');
  };

  const buildDressingDescription = (): string => {
    const parts: Array<string | false> = [
      woundLocation.trim() || 'Dressing',
      woundType.trim() && `Wound type: ${woundType.trim()}`,
      dressingNotes.trim() && `Instructions: ${dressingNotes.trim()}`,
    ];
    return parts.filter(Boolean).join(' • ');
  };

  const handleSubmitOrder = async () => {
    if (orderKind === 'instruction') {
      if (!instructionText.trim()) {
        toast.error('Enter the instruction for nursing');
        return;
      }
    } else if (orderKind === 'medication' || orderKind === 'injection') {
      if (selectedMedKeys.length === 0) {
        toast.error('Select at least one medication');
        return;
      }
    } else if (orderKind === 'dressing') {
      if (!woundType.trim() || !woundLocation.trim()) {
        toast.error('Wound type and location are required');
        return;
      }
    }

    setSubmitting(true);
    try {
      const apiPriority = priorityApi(priority);
      const basePayload = {
        patient: admission.patient,
        visit: admission.visit,
        admission: admission.id,
        status: 'pending',
        priority: apiPriority,
        ordered_by: currentUserId ?? undefined,
      } as const;

      if (orderKind === 'instruction') {
        await apiFetch('/nursing/orders/', {
          method: 'POST',
          body: JSON.stringify({
            ...basePayload,
            order_type: 'ward instruction',
            description: instructionText.trim(),
            frequency: '',
            duration: '',
          }),
        });
        toast.success('Order added');
      } else if (orderKind === 'dressing') {
        await apiFetch('/nursing/orders/', {
          method: 'POST',
          body: JSON.stringify({
            ...basePayload,
            order_type: 'dressing',
            description: buildDressingDescription(),
            frequency: '',
            duration: '',
          }),
        });
        toast.success('Order added');
      } else if (orderKind === 'medication') {
        // Medications are dispensed by Pharmacy — not administered by the
        // ward nurse — so we route them through the same prescription
        // endpoint the consultation room uses. This keeps stock, brand
        // selection, and dispensing tracking consistent across the system.
        const items = selectedMedKeys.map((key) => {
          const cfg = medConfigs.get(key)!;
          const days = cfg.durationDays.trim();
          const dose = cfg.dosage.trim() || 'As directed';
          // Reasonable default quantity when the doctor hasn't computed one.
          // The pharmacist refines this on dispense.
          const dailyDoses =
            cfg.frequency === 'STAT (Single dose)' ? 1 :
            cfg.frequency.startsWith('Once') ? 1 :
            cfg.frequency.startsWith('Twice') ? 2 :
            cfg.frequency.startsWith('Three') ? 3 :
            cfg.frequency.startsWith('Four')  ? 4 :
            cfg.frequency.includes('Q6H')    ? 4 :
            cfg.frequency.includes('Q8H')    ? 3 :
            cfg.frequency.includes('Q12H')   ? 2 : 1;
          const dosageNum = parseFloat(dose.replace(/[^0-9.]/g, '')) || 1;
          const dayCount = days ? parseInt(days, 10) || 1 : 1;
          const quantity = cfg.frequency === 'STAT (Single dose)'
            ? dosageNum
            : Math.max(Math.ceil(dosageNum * dailyDoses * dayCount), 1);
          const form = (cfg.generic.dosage_form || cfg.generic.form || '').trim();
          return {
            generic: typeof cfg.generic.id === 'number'
              ? cfg.generic.id
              : parseInt(String(cfg.generic.id), 10),
            medication: null,
            medication_name: cfg.generic.name || formatGenericLabel(cfg.generic),
            unit: form.toLowerCase().includes('tablet') ? 'tablet'
              : form.toLowerCase().includes('capsule') ? 'capsule'
              : form.toLowerCase().includes('syrup') || form.toLowerCase().includes('suspension') ? 'ml'
              : 'tablet',
            dosage_form: form,
            strength: (cfg.generic.strength || '').trim(),
            route: cfg.route || 'Oral',
            dosage: dose,
            frequency: cfg.frequency || 'Once daily (OD)',
            duration: days ? `${days} days` : 'As directed',
            quantity,
            instructions: cfg.instructions.trim(),
          };
        }).filter((it) => Number.isFinite(it.generic) && (it.generic as number) > 0);

        if (items.length === 0) {
          toast.error('Could not resolve a generic for the selected medications. Please re-select from the catalogue.');
          return;
        }

        try {
          await pharmacyService.createPrescription({
            patient: admission.patient,
            visit: admission.visit || undefined,
            doctor: admission.admitting_doctor || currentUserId || undefined,
            diagnosis: admission.admission_diagnosis || '',
            notes: `Ward order — ${admission.ward_name || 'ward'} · ${admission.admission_id}`,
            items,
          } as any);
          toast.success(
            items.length === 1
              ? 'Prescription sent to Pharmacy queue'
              : `Prescription with ${items.length} medications sent to Pharmacy queue`,
          );
        } catch (err: any) {
          toast.error(err?.message || 'Failed to send prescription to Pharmacy');
          return;
        }
      } else {
        // Injection — administered by nursing, so it stays in the nursing
        // procedures queue. One nursing order per selected injectable.
        const tasks = selectedMedKeys.map(async (key) => {
          const cfg = medConfigs.get(key);
          if (!cfg) return { ok: false, label: key, err: 'Missing configuration' };
          try {
            await apiFetch('/nursing/orders/', {
              method: 'POST',
              body: JSON.stringify({
                ...basePayload,
                order_type: 'injection',
                description: buildMedDescription(cfg),
                frequency: cfg.frequency.trim(),
                duration: cfg.durationDays.trim()
                  ? `${cfg.durationDays.trim()} day(s)`
                  : '',
              }),
            });
            return { ok: true, label: formatGenericLabel(cfg.generic) };
          } catch (err: any) {
            return {
              ok: false,
              label: formatGenericLabel(cfg.generic),
              err: err?.message || 'Failed',
            };
          }
        });
        const results = await Promise.all(tasks);
        const ok = results.filter((r) => r.ok).length;
        const failed = results.filter((r) => !r.ok);
        if (ok > 0) {
          toast.success(
            ok === 1
              ? `Injection order added — ${results.find((r) => r.ok)?.label}`
              : `${ok} injection orders added`,
          );
        }
        if (failed.length > 0) {
          toast.error(`Failed: ${failed.map((f) => f.label).join(', ')}`);
          if (ok === 0) {
            return;
          }
        }
      }

      setAddOpen(false);
      resetAddForm();
      await loadOrders();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  const markInstructionDone = async (order: WardNursingOrderRow) => {
    if (!isInstructionType(order.order_type)) return;
    try {
      await apiFetch(`/nursing/orders/${order.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'completed',
          completed_at: new Date().toISOString(),
        }),
      });
      toast.success('Marked complete');
      void loadOrders();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update order');
    }
  };

  const openEdit = (order: WardNursingOrderRow) => {
    setEditingOrder(order);
    setEditDescription(order.description || '');
    setEditPriority(order.priority || 'medium');
  };

  const saveEdit = async () => {
    if (!editingOrder) return;
    if (!editDescription.trim()) {
      toast.error('Description cannot be empty');
      return;
    }
    setEditSaving(true);
    try {
      await apiFetch(`/nursing/orders/${editingOrder.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          description: editDescription.trim(),
          priority: priorityApi(editPriority),
        }),
      });
      toast.success('Order updated');
      setEditingOrder(null);
      void loadOrders();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update order');
    } finally {
      setEditSaving(false);
    }
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    setCancelSubmitting(true);
    try {
      await apiFetch(`/nursing/orders/${cancelTarget.id}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      });
      toast.success('Order cancelled');
      setCancelTarget(null);
      await loadOrders();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to cancel order');
    } finally {
      setCancelSubmitting(false);
    }
  };

  const statusBadge = (status: string) => {
    const s = status?.toLowerCase();
    if (s === 'completed') return 'default';
    if (s === 'cancelled') return 'secondary';
    return 'outline';
  };

  const canModifyPending = (o: WardNursingOrderRow) =>
    allowEditCancelOrders &&
    admission.status === 'admitted' &&
    isActiveStatus(o.status) &&
    o.source !== 'pharmacy';

  const renderOrderRow = (o: WardNursingOrderRow) => {
    const meta = kindMeta(o.order_type);
    const KindIcon = meta.icon;
    const parsed = parseDescription(o.order_type, o.description);
    const orderedAt = new Date(o.ordered_at);
    const rel = relativeTime(o.ordered_at);

    return (
      <li
        key={o.id}
        className={`rounded-lg border border-l-4 ${meta.accent} p-3 text-sm flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between`}
      >
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${meta.tint}`}>
              <KindIcon className="h-3 w-3" />
              {meta.label}
            </span>
            <span className="font-mono text-[10px] text-muted-foreground">{o.order_id}</span>
            {o.source === 'pharmacy' && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
                Pharmacy queue
              </span>
            )}
            <Badge variant={statusBadge(o.status)} className="text-[10px] capitalize">
              {String(o.status).replace('_', ' ')}
            </Badge>
            {o.source !== 'pharmacy' && (
              <Badge variant="secondary" className="text-[10px] capitalize">
                {o.priority}
              </Badge>
            )}
          </div>

          <p className="text-foreground font-medium whitespace-pre-wrap break-words leading-snug">
            {parsed.primary}
          </p>

          {parsed.fields.length > 0 && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              {parsed.fields.map((f) => (
                <div key={f.label} className="contents">
                  <dt className="text-muted-foreground">{f.label}</dt>
                  <dd className="text-foreground break-words">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="text-[11px] text-muted-foreground">
            {o.ordered_by_name || '—'}
            {' · '}
            <span title={formatDisplayDateTime(orderedAt)}>
              {formatDisplayDateTime(orderedAt)}
              {rel && <span className="text-muted-foreground/70"> · {rel}</span>}
            </span>
          </p>
        </div>

        <div className="flex flex-wrap gap-1 shrink-0 justify-end">
          {isInstructionType(o.order_type) && o.status === 'pending' && admission.status === 'admitted' && (
            <Button type="button" size="sm" variant="outline" onClick={() => markInstructionDone(o)}>
              <CheckCircle2 className="h-4 w-4 mr-1" />
              Mark done
            </Button>
          )}
          {canModifyPending(o) && (
            <>
              <Button type="button" size="sm" variant="outline" onClick={() => openEdit(o)}>
                <Pencil className="h-4 w-4 mr-1" />
                Edit
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setCancelTarget(o)}>
                <Ban className="h-4 w-4 mr-1" />
                Cancel
              </Button>
            </>
          )}
        </div>
      </li>
    );
  };

  const TabCount = ({ n, tone }: { n: number; tone: 'active' | 'history' | 'all' }) => {
    if (n === 0) return null;
    const cls =
      tone === 'active'
        ? 'bg-teal-500/15 text-teal-700 dark:text-teal-300'
        : tone === 'history'
          ? 'bg-muted text-muted-foreground'
          : 'bg-muted text-foreground';
    return <span className={`ml-1.5 inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-semibold rounded ${cls}`}>{n}</span>;
  };

  const ListBody = ({ emptyMsg }: { emptyMsg: React.ReactNode }) => (
    loading ? (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        Loading…
      </div>
    ) : filteredOrders.length === 0 ? (
      <p className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/30">
        {emptyMsg}
      </p>
    ) : (
      // Outer dialog already provides vertical scroll; let the list grow
      // naturally instead of imposing a second scrollbar.
      <ul className="space-y-2">
        {filteredOrders.map(renderOrderRow)}
      </ul>
    )
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground leading-snug">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">Medications</span> route to{' '}
            <span className="font-medium text-foreground">Pharmacy</span> for dispensing.{' '}
            <span className="font-medium text-foreground">Injections, dressings</span> route to{' '}
            <span className="font-medium text-foreground">Procedures (Nursing)</span>.{' '}
            <span className="font-medium text-foreground">Instructions</span> live here only.
          </span>
        </p>
        {allowAddOrders && admission.status === 'admitted' && (
          <Button type="button" size="sm" onClick={() => setAddOpen(true)} className="shrink-0">
            <Plus className="h-4 w-4 mr-1" />
            Add order
          </Button>
        )}
      </div>

      <Tabs value={listFilter} onValueChange={(v) => setListFilter(v as ListFilter)} className="w-full">
        <TabsList className="grid w-full grid-cols-3 h-9">
          <TabsTrigger value="active" className="text-xs">
            Active
            <TabCount n={counts.active} tone="active" />
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1">
            <History className="h-3 w-3 hidden sm:inline" />
            History
            <TabCount n={counts.history} tone="history" />
          </TabsTrigger>
          <TabsTrigger value="all" className="text-xs">
            All
            <TabCount n={counts.all} tone="all" />
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-3 space-y-0">
          <ListBody emptyMsg={<>No active orders. Completed and cancelled orders are under <strong>History</strong>.</>} />
        </TabsContent>
        <TabsContent value="history" className="mt-3">
          <p className="text-xs text-muted-foreground mb-2">
            Completed instructions and cancelled orders for this admission.
          </p>
          <ListBody emptyMsg="No history yet." />
        </TabsContent>
        <TabsContent value="all" className="mt-3">
          <ListBody emptyMsg="No doctor orders for this admission yet." />
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[640px] max-h-[92vh] flex flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0 space-y-1">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Plus className="h-5 w-5 text-blue-500 shrink-0" />
              Add doctor order
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-medium text-foreground">{admission.patient_name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-xs">{admission.admission_id}</span>
              {admission.ward_name && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span>{admission.ward_name}</span>
                </>
              )}
              {admission.bed_number && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span>Bed {admission.bed_number}</span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 px-5 py-4 overflow-y-auto flex-1 min-h-0">
            <div className="space-y-2">
              <Label>Order type</Label>
              <Select
                value={orderKind}
                onValueChange={(v) => {
                  const next = v as OrderKind;
                  setOrderKind(next);
                  // Clear context that doesn't apply to the next kind, so the
                  // doctor never accidentally submits stale state from a
                  // previous selection.
                  if (next !== 'medication' && next !== 'injection') {
                    setSelectedMedKeys([]);
                    setMedConfigs(new Map());
                    setMedSearch('');
                    setShowMedDropdown(false);
                  }
                  if (next !== 'dressing') {
                    setWoundType('');
                    setWoundLocation('');
                    setDressingNotes('');
                  }
                  if (next !== 'instruction') setInstructionText('');
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instruction">Instruction (monitor vitals, general care)</SelectItem>
                  <SelectItem value="medication">Medication (goes to Pharmacy queue)</SelectItem>
                  <SelectItem value="injection">Injection (goes to Procedures queue)</SelectItem>
                  <SelectItem value="dressing">Dressing / wound care (goes to Procedures queue)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {orderKind === 'instruction' && (
              <div className="space-y-2">
                <Label>Instruction for nursing</Label>
                <Textarea
                  value={instructionText}
                  onChange={(e) => setInstructionText(e.target.value)}
                  placeholder="e.g. Monitor vital signs every 4 hours; escalate if BP is high"
                  rows={4}
                />
              </div>
            )}
            {(orderKind === 'medication' || orderKind === 'injection') && (
              <>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {orderKind === 'medication' ? (
                    <>
                      Prescribe by generic molecule — search the pharmacy generics catalogue and configure dose details for each. This will be sent to the <span className="font-medium text-foreground">Pharmacy queue</span> as one prescription; the pharmacist picks the brand from dispensary stock when dispensing.
                    </>
                  ) : (
                    <>
                      Configure each injectable. This will be sent to the <span className="font-medium text-foreground">Procedures (Nursing) queue</span> for the nurse to administer.
                    </>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>
                    Search and Select {orderKind === 'injection' ? 'Injectables' : 'Medications'} *
                  </Label>
                  <div className="relative" ref={medSearchBoxRef}>
                    <Input
                      value={medSearch}
                      onChange={(e) => {
                        const v = e.target.value;
                        setMedSearch(v);
                        setShowMedDropdown(!!v.trim());
                      }}
                      onFocus={() => {
                        if (medSearch.trim()) setShowMedDropdown(true);
                      }}
                      placeholder={
                        orderKind === 'injection'
                          ? 'Type to search injectable generics — e.g. Ceftriaxone'
                          : 'Type to search pharmacy generics — e.g. Paracetamol'
                      }
                    />
                    {showMedDropdown && medSearch.trim() && (
                      <div className="absolute z-50 left-0 right-0 mt-1 bg-popover border rounded-md shadow-md max-h-[260px] overflow-y-auto">
                        {medSearchLoading ? (
                          <div className="p-3 text-center text-sm text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                            Searching generics…
                          </div>
                        ) : medGenerics.length === 0 ? (
                          <div className="p-3 text-sm">
                            <p className="text-muted-foreground">
                              No generic matches "{medSearch.trim()}".
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Configure entries in <span className="font-medium">Pharmacy → Generics</span>.
                            </p>
                          </div>
                        ) : (
                          medGenerics.map((g) => {
                            const key = genericKey(g);
                            const isSelected = selectedMedKeys.includes(key);
                            const subline = [g.active_ingredient, g.category, g.route]
                              .map((v) => (v || '').trim())
                              .filter(Boolean)
                              .join(' · ');
                            return (
                              <button
                                key={String(g.id)}
                                type="button"
                                onClick={() => toggleGeneric(g)}
                                className={`w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0 flex items-start gap-2 ${
                                  isSelected ? 'bg-emerald-500/10' : ''
                                }`}
                              >
                                <span
                                  className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                                    isSelected
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'border-muted-foreground/40'
                                  }`}
                                >
                                  {isSelected && <Check className="h-3 w-3" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <div className="font-medium">{formatGenericLabel(g)}</div>
                                  {subline && (
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {subline}
                                    </div>
                                  )}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {selectedMedKeys.length > 0 && (
                  <div className="rounded-md border bg-emerald-500/5 dark:bg-emerald-500/10 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
                        Selected {orderKind === 'injection' ? 'injectables' : 'medications'} ({selectedMedKeys.length}):
                      </p>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-emerald-700 dark:text-emerald-300 hover:text-emerald-900"
                        onClick={clearAllMeds}
                      >
                        Clear All
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedMedKeys.map((k) => {
                        const cfg = medConfigs.get(k);
                        if (!cfg) return null;
                        return (
                          <span
                            key={k}
                            className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5 text-xs"
                          >
                            {formatGenericLabel(cfg.generic)}
                            <button
                              type="button"
                              onClick={() => removeSelectedMed(k)}
                              className="text-muted-foreground hover:text-destructive"
                              aria-label="Remove"
                            >
                              ×
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selectedMedKeys.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-baseline justify-between">
                      <h4 className="text-sm font-semibold">
                        Configure {orderKind === 'injection' ? 'Injection' : 'Prescription'}{selectedMedKeys.length > 1 ? 's' : ''}
                      </h4>
                      <span className="text-xs text-muted-foreground">
                        {selectedMedKeys.length} {orderKind === 'injection' ? 'injectable' : 'medication'}{selectedMedKeys.length > 1 ? 's' : ''} selected
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground -mt-2">
                      Set dose, frequency, duration, route, and instructions for each selected {orderKind === 'injection' ? 'injectable' : 'medication'}.
                    </p>
                    {selectedMedKeys.map((k, idx) => {
                      const cfg = medConfigs.get(k);
                      if (!cfg) return null;
                      return (
                        <div
                          key={k}
                          className="rounded-md border bg-background p-3 space-y-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">
                                <span className="text-muted-foreground mr-1">{idx + 1}.</span>
                                {formatGenericLabel(cfg.generic)}
                              </p>
                              {cfg.generic.active_ingredient && (
                                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                  {cfg.generic.active_ingredient}
                                </p>
                              )}
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground hover:text-destructive shrink-0"
                              onClick={() => removeSelectedMed(k)}
                            >
                              Remove
                            </Button>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                              <Label className="text-xs">Dose per administration</Label>
                              <Input
                                value={cfg.dosage}
                                onChange={(e) => updateMedConfig(k, { dosage: e.target.value })}
                                placeholder="e.g., 500mg, 1 tab"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Frequency *</Label>
                              <Select
                                value={cfg.frequency}
                                onValueChange={(v) => updateMedConfig(k, { frequency: v })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {FREQUENCY_OPTIONS.map((f) => (
                                    <SelectItem key={f} value={f}>
                                      {f}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Duration (days)</Label>
                              <Input
                                inputMode="numeric"
                                value={cfg.durationDays}
                                onChange={(e) => updateMedConfig(k, { durationDays: e.target.value.replace(/[^0-9]/g, '') })}
                                placeholder="e.g., 7"
                              />
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs">Route</Label>
                              <Select
                                value={cfg.route}
                                onValueChange={(v) => updateMedConfig(k, { route: v })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Oral">Oral</SelectItem>
                                  <SelectItem value="Intramuscular (IM)">Intramuscular (IM)</SelectItem>
                                  <SelectItem value="Intravenous (IV)">Intravenous (IV)</SelectItem>
                                  <SelectItem value="Subcutaneous (SC)">Subcutaneous (SC)</SelectItem>
                                  <SelectItem value="Topical">Topical</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1.5">
                            <Label className="text-xs">Instructions</Label>
                            <Textarea
                              rows={2}
                              value={cfg.instructions}
                              onChange={(e) => updateMedConfig(k, { instructions: e.target.value })}
                              placeholder="e.g., Take with food; rotate injection sites; monitor glucose"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {orderKind === 'dressing' && (
              <>
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  Add nursing procedure to order — will be sent to the Nursing queue.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Wound Type *</Label>
                    <Select value={woundType} onValueChange={setWoundType}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select wound type" />
                      </SelectTrigger>
                      <SelectContent>
                        {WOUND_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Location *</Label>
                    <Select value={woundLocation} onValueChange={setWoundLocation}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {WOUND_LOCATIONS.map((loc) => (
                          <SelectItem key={loc} value={loc}>
                            {loc}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <Textarea
                    value={dressingNotes}
                    onChange={(e) => setDressingNotes(e.target.value)}
                    rows={3}
                    placeholder="Detailed instructions for the nursing team — products, technique, frequency"
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter className="px-5 py-4 border-t shrink-0 gap-2 sm:justify-end flex-col-reverse sm:flex-row">
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmitOrder} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              {(orderKind === 'medication' || orderKind === 'injection') && selectedMedKeys.length > 1
                ? `Create ${selectedMedKeys.length} orders`
                : 'Create order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className={MODAL_SIZES.xs}>
          <DialogHeader>
            <DialogTitle>Edit order</DialogTitle>
            <DialogDescription>{editingOrder?.order_id}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-2">
              <Label>Description</Label>
              <Textarea value={editDescription} onChange={(e) => setEditDescription(e.target.value)} rows={5} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={editPriority} onValueChange={setEditPriority}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditingOrder(null)}>
              Close
            </Button>
            <Button type="button" onClick={saveEdit} disabled={editSaving}>
              {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.order_id} will be marked cancelled. This cannot be undone from the ward screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelSubmitting}>Keep order</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirmCancel();
              }}
              disabled={cancelSubmitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {cancelSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cancel order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export function userCanAddWardDoctorOrders(systemRole: string | undefined | null): boolean {
  if (!systemRole) return false;
  return /doctor|consultant|resident|physician|medical officer|mo\b/i.test(systemRole);
}

export function userCanEditCancelWardOrders(systemRole: string | undefined | null): boolean {
  if (!systemRole) return false;
  return (
    userCanAddWardDoctorOrders(systemRole) ||
    /nurse|midwife|nursing officer/i.test(systemRole)
  );
}
