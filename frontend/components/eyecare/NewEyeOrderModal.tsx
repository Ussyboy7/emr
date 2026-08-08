'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { eyeCareService, type EyeOrder } from '@/lib/services/eye-care-service';

interface NewEyeOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
  admissionId?: number | null;
  visitId?: number | null;
}

export function NewEyeOrderModal({ open, onOpenChange, onSuccess, admissionId, visitId }: NewEyeOrderModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    patient: '',
    chief_complaint: '',
    visual_acuity_od: '',
    visual_acuity_os: '',
    visual_acuity_ou: '',
    refraction_od: '',
    refraction_os: '',
    iop_od: '',
    iop_os: '',
    diagnosis: '',
    treatment_plan: '',
    special_instructions: '',
    priority: 'routine',
  });

  const handleSubmit = async () => {
    if (!form.patient) {
      toast.error('Please select a patient');
      return;
    }

    setIsSubmitting(true);
    try {
      await eyeCareService.createOrder({
        patient: parseInt(form.patient),
        ...(admissionId != null ? { admission: admissionId } : {}),
        ...(visitId != null ? { visit: visitId } : {}),
        chief_complaint: form.chief_complaint,
        visual_acuity_od: form.visual_acuity_od,
        visual_acuity_os: form.visual_acuity_os,
        visual_acuity_ou: form.visual_acuity_ou,
        refraction_od: form.refraction_od || '',
        refraction_os: form.refraction_os || '',
        iop_od: form.iop_od ? parseFloat(form.iop_od) : null,
        iop_os: form.iop_os ? parseFloat(form.iop_os) : null,
        diagnosis: form.diagnosis,
        treatment_plan: form.treatment_plan,
        special_instructions: form.special_instructions,
        priority: form.priority as 'routine' | 'urgent' | 'stat',
      });

      toast.success('Eye order created successfully');
      onSuccess?.();
      onOpenChange(false);
      // Reset form
      setForm({
        patient: '',
        chief_complaint: '',
        visual_acuity_od: '',
        visual_acuity_os: '',
        visual_acuity_ou: '',
        refraction_od: '',
        refraction_os: '',
        iop_od: '',
        iop_os: '',
        diagnosis: '',
        treatment_plan: '',
        special_instructions: '',
        priority: 'routine',
      });
    } catch (error: any) {
      console.error('Failed to create eye order:', error);
      toast.error(error?.message || 'Failed to create eye order');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.lg}>
        <DialogHeader>
          <DialogTitle>New Eye Care Order</DialogTitle>
          <DialogDescription>
            Create a new eye clinic examination or treatment order
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {/* Patient Selection */}
          <div className="grid gap-2">
            <Label htmlFor="patient">Patient *</Label>
            <Input
              id="patient"
              value={form.patient}
              onChange={(e) => setForm({ ...form, patient: e.target.value })}
              placeholder="Enter patient ID or search..."
            />
          </div>

          {/* Chief Complaint */}
          <div className="grid gap-2">
            <Label htmlFor="chief_complaint">Chief Complaint</Label>
            <Textarea
              id="chief_complaint"
              value={form.chief_complaint}
              onChange={(e) => setForm({ ...form, chief_complaint: e.target.value })}
              placeholder="Main reason for visit..."
              rows={2}
            />
          </div>

          {/* Visual Acuity */}
          <div className="grid grid-cols-3 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="visual_acuity_od">VA OD (Right)</Label>
              <Input
                id="visual_acuity_od"
                value={form.visual_acuity_od}
                onChange={(e) => setForm({ ...form, visual_acuity_od: e.target.value })}
                placeholder="e.g., 6/6"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="visual_acuity_os">VA OS (Left)</Label>
              <Input
                id="visual_acuity_os"
                value={form.visual_acuity_os}
                onChange={(e) => setForm({ ...form, visual_acuity_os: e.target.value })}
                placeholder="e.g., 6/9"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="visual_acuity_ou">VA OU (Both)</Label>
              <Input
                id="visual_acuity_ou"
                value={form.visual_acuity_ou}
                onChange={(e) => setForm({ ...form, visual_acuity_ou: e.target.value })}
                placeholder="e.g., 6/6"
              />
            </div>
          </div>

          {/* Refraction */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="refraction_od">Refraction OD</Label>
              <Input
                id="refraction_od"
                value={form.refraction_od}
                onChange={(e) => setForm({ ...form, refraction_od: e.target.value })}
                placeholder="e.g., -2.50 DS"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="refraction_os">Refraction OS</Label>
              <Input
                id="refraction_os"
                value={form.refraction_os}
                onChange={(e) => setForm({ ...form, refraction_os: e.target.value })}
                placeholder="e.g., -1.75 DS"
              />
            </div>
          </div>

          {/* Intraocular Pressure */}
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="iop_od">IOP OD (mmHg)</Label>
              <Input
                id="iop_od"
                type="number"
                value={form.iop_od}
                onChange={(e) => setForm({ ...form, iop_od: e.target.value })}
                placeholder="e.g., 15"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="iop_os">IOP OS (mmHg)</Label>
              <Input
                id="iop_os"
                type="number"
                value={form.iop_os}
                onChange={(e) => setForm({ ...form, iop_os: e.target.value })}
                placeholder="e.g., 16"
              />
            </div>
          </div>

          {/* Diagnosis */}
          <div className="grid gap-2">
            <Label htmlFor="diagnosis">Diagnosis</Label>
            <Input
              id="diagnosis"
              value={form.diagnosis}
              onChange={(e) => setForm({ ...form, diagnosis: e.target.value })}
              placeholder="Primary diagnosis..."
            />
          </div>

          {/* Treatment Plan */}
          <div className="grid gap-2">
            <Label htmlFor="treatment_plan">Treatment Plan</Label>
            <Textarea
              id="treatment_plan"
              value={form.treatment_plan}
              onChange={(e) => setForm({ ...form, treatment_plan: e.target.value })}
              placeholder="Planned treatment or management..."
              rows={3}
            />
          </div>

          {/* Special Instructions */}
          <div className="grid gap-2">
            <Label htmlFor="special_instructions">Special Instructions</Label>
            <Textarea
              id="special_instructions"
              value={form.special_instructions}
              onChange={(e) => setForm({ ...form, special_instructions: e.target.value })}
              placeholder="Any additional instructions..."
              rows={2}
            />
          </div>

          {/* Priority */}
          <div className="grid gap-2">
            <Label htmlFor="priority">Priority</Label>
            <Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="routine">Routine</SelectItem>
                <SelectItem value="urgent">Urgent</SelectItem>
                <SelectItem value="stat">STAT</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating...' : 'Create Order'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
