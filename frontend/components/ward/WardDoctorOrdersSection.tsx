'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { toast } from 'sonner';
import {
  ClipboardList,
  Loader2,
  Plus,
  CheckCircle2,
  Pencil,
  Ban,
  History,
} from 'lucide-react';

export interface WardNursingOrderRow {
  id: number;
  order_id: string;
  order_type: string;
  description: string;
  status: string;
  priority: string;
  ordered_at: string;
  ordered_by_name?: string | null;
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
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medRoute, setMedRoute] = useState('Oral');
  const [medNotes, setMedNotes] = useState('');
  const [woundType, setWoundType] = useState('');
  const [woundLocation, setWoundLocation] = useState('');
  const [dressingNotes, setDressingNotes] = useState('');

  const [editingOrder, setEditingOrder] = useState<WardNursingOrderRow | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState('medium');
  const [editSaving, setEditSaving] = useState(false);

  const [cancelTarget, setCancelTarget] = useState<WardNursingOrderRow | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch<{ results: WardNursingOrderRow[] }>(
        `/nursing/orders/?admission=${admission.id}&ordering=-ordered_at&page_size=200`
      );
      setOrders(res.results || []);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load doctor orders');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [admission.id]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const filteredOrders = useMemo(() => {
    if (listFilter === 'all') return orders;
    if (listFilter === 'active') return orders.filter((o) => isActiveStatus(o.status));
    return orders.filter((o) => isHistoryStatus(o.status));
  }, [orders, listFilter]);

  const resetAddForm = () => {
    setOrderKind('instruction');
    setPriority('medium');
    setInstructionText('');
    setMedName('');
    setMedDosage('');
    setMedRoute('Oral');
    setMedNotes('');
    setWoundType('');
    setWoundLocation('');
    setDressingNotes('');
  };

  const buildDescription = (): { order_type: string; description: string } => {
    if (orderKind === 'instruction') {
      return {
        order_type: 'ward instruction',
        description: instructionText.trim() || 'Instruction',
      };
    }
    if (orderKind === 'medication') {
      const parts = [
        medName.trim() || 'Medication',
        medDosage && `Dose: ${medDosage}`,
        medRoute && `Route: ${medRoute}`,
        medNotes.trim() && `Notes: ${medNotes.trim()}`,
      ].filter(Boolean);
      return {
        order_type: 'medication',
        description: parts.join(' • '),
      };
    }
    if (orderKind === 'injection') {
      const parts = [
        medName.trim() || 'Injection',
        medDosage && `Dose: ${medDosage}`,
        medRoute && `Route: ${medRoute}`,
        medNotes.trim() && `Notes: ${medNotes.trim()}`,
      ].filter(Boolean);
      return {
        order_type: 'injection',
        description: parts.join(' • '),
      };
    }
    const parts = [
      woundType.trim() || 'Wound',
      woundLocation && `Location: ${woundLocation}`,
      dressingNotes.trim() && `Instructions: ${dressingNotes.trim()}`,
    ].filter(Boolean);
    return {
      order_type: 'dressing',
      description: parts.join(' • '),
    };
  };

  const handleSubmitOrder = async () => {
    const { order_type, description } = buildDescription();
    if (orderKind === 'instruction' && !instructionText.trim()) {
      toast.error('Enter the instruction for nursing');
      return;
    }
    if ((orderKind === 'medication' || orderKind === 'injection') && !medName.trim()) {
      toast.error('Enter medication name');
      return;
    }
    if (orderKind === 'dressing' && !woundType.trim() && !dressingNotes.trim()) {
      toast.error('Enter wound details or instructions');
      return;
    }

    setSubmitting(true);
    try {
      await apiFetch('/nursing/orders/', {
        method: 'POST',
        body: JSON.stringify({
          patient: admission.patient,
          visit: admission.visit,
          admission: admission.id,
          order_type,
          description,
          frequency: '',
          duration: '',
          status: 'pending',
          priority: priorityApi(priority),
          ordered_by: currentUserId ?? undefined,
        }),
      });
      toast.success('Order added');
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
      await loadOrders();
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
      await loadOrders();
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
    isActiveStatus(o.status);

  const renderOrderRow = (o: WardNursingOrderRow) => (
    <li
      key={o.id}
      className="rounded-lg border p-3 text-sm flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">{o.order_id}</span>
          <Badge variant="outline" className="text-[10px] capitalize">
            {isInstructionType(o.order_type) ? 'Instruction' : o.order_type}
          </Badge>
          <Badge variant={statusBadge(o.status)} className="text-[10px] capitalize">
            {o.status}
          </Badge>
          <Badge variant="secondary" className="text-[10px] capitalize">
            {o.priority}
          </Badge>
        </div>
        <p className="text-foreground whitespace-pre-wrap break-words">{o.description}</p>
        <p className="text-xs text-muted-foreground">
          {o.ordered_by_name || 'Unknown'} •{' '}
          {new Date(o.ordered_at).toLocaleString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
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

  return (
    <div className="space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="flex items-start gap-2 text-sm text-muted-foreground">
          <ClipboardList className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            <span className="font-medium text-foreground">Instructions</span> stay on this ward list only.{' '}
            <span className="font-medium text-foreground">Medication, injection, and dressing</span> orders also appear in{' '}
            <span className="font-medium text-foreground">Procedures</span>.
          </span>
        </div>
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
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs gap-1">
            <History className="h-3 w-3 hidden sm:inline" />
            History
          </TabsTrigger>
          <TabsTrigger value="all" className="text-xs">
            All
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active" className="mt-3 space-y-0">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading…
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/30">
              No active orders. Completed and cancelled orders are under <strong>History</strong>.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[min(50vh,24rem)] overflow-y-auto pr-1">
              {filteredOrders.map(renderOrderRow)}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="history" className="mt-3">
          <p className="text-xs text-muted-foreground mb-2">
            Completed instructions and cancelled orders for this admission.
          </p>
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading…
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/30">
              No history yet.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[min(50vh,24rem)] overflow-y-auto pr-1">
              {filteredOrders.map(renderOrderRow)}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="all" className="mt-3">
          {loading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin mr-2" />
              Loading…
            </div>
          ) : filteredOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center border rounded-md bg-muted/30">
              No doctor orders for this admission yet.
            </p>
          ) : (
            <ul className="space-y-2 max-h-[min(50vh,24rem)] overflow-y-auto pr-1">
              {filteredOrders.map(renderOrderRow)}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add doctor order</DialogTitle>
            <DialogDescription>
              For {admission.patient_name} ({admission.admission_id})
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Order type</Label>
              <Select value={orderKind} onValueChange={(v) => setOrderKind(v as OrderKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instruction">Instruction (monitor vitals, general care)</SelectItem>
                  <SelectItem value="medication">Medication (goes to Procedures queue)</SelectItem>
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
                <div className="space-y-2">
                  <Label>Medication name *</Label>
                  <Input value={medName} onChange={(e) => setMedName(e.target.value)} placeholder="Paracetamol" />
                </div>
                <div className="space-y-2">
                  <Label>Dosage</Label>
                  <Input value={medDosage} onChange={(e) => setMedDosage(e.target.value)} placeholder="500mg" />
                </div>
                <div className="space-y-2">
                  <Label>Route</Label>
                  <Select value={medRoute} onValueChange={setMedRoute}>
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
                <div className="space-y-2">
                  <Label>Additional notes</Label>
                  <Textarea value={medNotes} onChange={(e) => setMedNotes(e.target.value)} rows={2} />
                </div>
              </>
            )}
            {orderKind === 'dressing' && (
              <>
                <div className="space-y-2">
                  <Label>Wound / site</Label>
                  <Input
                    value={woundType}
                    onChange={(e) => setWoundType(e.target.value)}
                    placeholder="e.g. Left heel ulcer"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Location</Label>
                  <Input value={woundLocation} onChange={(e) => setWoundLocation(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Instructions</Label>
                  <Textarea value={dressingNotes} onChange={(e) => setDressingNotes(e.target.value)} rows={3} />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSubmitOrder} disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create order'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOrder} onOpenChange={(open) => !open && setEditingOrder(null)}>
        <DialogContent className="sm:max-w-[480px]">
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
