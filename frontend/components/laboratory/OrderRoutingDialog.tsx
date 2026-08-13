"use client";

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Clinic } from '@/lib/services';

export function OrderRoutingDialog({ open, onOpenChange, orderId, tests, facilities, originName, onRouted }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: number;
  tests: Array<{ id: number; name: string; code: string; status?: string; routing_status?: string; accession_number?: string | null; sample_accession?: string | null; processing_clinic_name?: string | null }>;
  facilities: Clinic[];
  originName?: string;
  onRouted: (payload: { test_ids: number[]; destination_type: 'internal' | 'external'; processing_clinic?: number; external_destination?: string; reason?: string }) => Promise<void>;
}) {
  const routeable = useMemo(() => tests.filter((test) => !['results_ready', 'verified', 'rejected', 'Results Ready', 'Verified', 'Rejected'].includes(test.status || '') && test.routing_status !== 'cancelled'), [tests]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const originFacility = facilities.find((facility) => facility.name === originName);
  const configuredDestination = originFacility?.default_processing_clinic
    ? facilities.find((facility) => facility.id === originFacility.default_processing_clinic)
    : undefined;
  const centralFacility = configuredDestination || facilities.find((facility) => /bode\s*thomas/i.test(`${facility.name} ${facility.code || ''}`));
  const requiresCentralProcessing = Boolean(configuredDestination) || /tincan|tin can|apapa|lagos port complex|\blpc\b/i.test(originName || '');
  const [reason, setReason] = useState('');
  useEffect(() => {
    setSelectedIds([]);
    setReason('');
  }, [open, requiresCentralProcessing]);
  const submit = async () => {
    if (!selectedIds.length) return;
    const processingClinic = centralFacility?.id;
    await onRouted({
      test_ids: selectedIds,
      destination_type: 'internal',
      ...(processingClinic ? { processing_clinic: processingClinic } : {}),
      reason: reason.trim(),
    });
    setSelectedIds([]);
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Route laboratory tests</DialogTitle>
        <DialogDescription>Origin: {originName || 'Unknown'} · select individual tests and their processing destination.</DialogDescription>
      </DialogHeader>
      <div className="space-y-4 py-2">
        <div className="space-y-2">
          {routeable.map((test) => <label key={test.id} className="flex items-center gap-3 rounded border p-2 text-sm">
            <Checkbox checked={selectedIds.includes(test.id)} onCheckedChange={(checked) => setSelectedIds((ids) => checked ? [...ids, test.id] : ids.filter((id) => id !== test.id))} />
             <span className="flex-1">{test.name} <span className="text-muted-foreground">({test.code})</span><span className="block text-[11px] text-muted-foreground">Processing: {test.processing_clinic_name || '—'}</span></span>
            <span className="text-xs text-muted-foreground">{test.routing_status || 'pending_triage'}</span>
            <span className="text-xs text-muted-foreground">{test.accession_number || test.sample_accession || 'No accession'}</span>
          </label>)}
          {!routeable.length && <p className="text-sm text-muted-foreground">No tests are eligible for routing.</p>}
        </div>
         {requiresCentralProcessing ? (
           <div className="rounded-md border bg-muted/30 p-3 text-sm">
             <p className="font-medium">Internal processing destination</p>
             <p className="text-muted-foreground">{centralFacility?.name || 'Bode Thomas Clinic is not available'}</p>
           </div>
         ) : (
           <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">Internal processing remains at the origin clinic. Outsourcing is handled from the processing workflow.</div>
         )}
         {requiresCentralProcessing && <div className="rounded-md border bg-background p-3 text-sm"><Label>Destination</Label><p className="mt-1 text-muted-foreground">Send to {centralFacility?.name || 'Bode Thomas Clinic'}</p></div>}
         {requiresCentralProcessing && <div className="space-y-2"><Label>Reason (optional)</Label><Textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Why are these lines being routed?" /></div>}
      </div>
       <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={!selectedIds.length || !requiresCentralProcessing || !centralFacility} onClick={() => void submit()}>Send to Bode Thomas</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
