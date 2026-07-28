'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { todayApiDateString } from '@/lib/dates';
import {
  patientService,
  type ClinicalDocumentSource,
  type ClinicalDocumentType,
  type PatientClinicalDocument,
} from '@/lib/services/patient-service';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientNumericId: number;
  onUploaded?: (docs: PatientClinicalDocument[]) => void;
};

const DOC_TYPES: { value: ClinicalDocumentType; label: string }[] = [
  { value: 'consultation_report', label: 'Consultation report' },
  { value: 'lab', label: 'Lab result' },
  { value: 'radiology', label: 'Radiology / imaging' },
  { value: 'other', label: 'Other' },
];

const SOURCES: { value: ClinicalDocumentSource; label: string }[] = [
  { value: 'scanned_paper', label: 'Scanned paper' },
  { value: 'external_facility', label: 'External facility' },
];

export function BulkClinicalDocumentsDialog({
  open,
  onOpenChange,
  patientNumericId,
  onUploaded,
}: Props) {
  const [docType, setDocType] = useState<ClinicalDocumentType>('consultation_report');
  const [source, setSource] = useState<ClinicalDocumentSource>('scanned_paper');
  const [documentDate, setDocumentDate] = useState(todayApiDateString());
  const [facility, setFacility] = useState('');
  const [clinicianName, setClinicianName] = useState('');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [mirrorIntoResults, setMirrorIntoResults] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDocType('consultation_report');
    setSource('scanned_paper');
    setDocumentDate(todayApiDateString());
    setFacility('');
    setClinicianName('');
    setNotes('');
    setFiles([]);
    setMirrorIntoResults(false);
  }, [open]);

  useEffect(() => {
    setMirrorIntoResults(docType === 'lab' || docType === 'radiology');
  }, [docType]);

  const handleSave = async () => {
    if (!files.length || saving) return;
    if (!documentDate) {
      toast.error('Document date is required');
      return;
    }
    setSaving(true);
    try {
      const created = await patientService.uploadClinicalDocumentsBulk(patientNumericId, {
        files,
        doc_type: docType,
        source,
        document_date: documentDate,
        facility: facility.trim() || undefined,
        clinician_name: clinicianName.trim() || undefined,
        notes: notes.trim() || undefined,
        mirror_into_results: mirrorIntoResults && (docType === 'lab' || docType === 'radiology'),
      });
      toast.success(`${created.length} document${created.length === 1 ? '' : 's'} uploaded`);
      onUploaded?.(created);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to upload documents');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Bulk scan upload</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Document type</Label>
              <Select value={docType} onValueChange={(v) => setDocType(v as ClinicalDocumentType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={source} onValueChange={(v) => setSource(v as ClinicalDocumentSource)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SOURCES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-doc-date">Encounter / result date</Label>
            <Input
              id="bulk-doc-date"
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-doc-files">Files</Label>
            <Input
              id="bulk-doc-files"
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
            {files.length ? (
              <p className="text-xs text-muted-foreground">{files.length} file(s) selected</p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="bulk-doc-facility">Facility (optional)</Label>
              <Input
                id="bulk-doc-facility"
                value={facility}
                onChange={(e) => setFacility(e.target.value.slice(0, 200))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-doc-clinician">Clinician / clinic (optional)</Label>
              <Input
                id="bulk-doc-clinician"
                value={clinicianName}
                onChange={(e) => setClinicianName(e.target.value.slice(0, 200))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="bulk-doc-notes">Notes (optional)</Label>
            <Textarea
              id="bulk-doc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              rows={2}
              maxLength={500}
            />
          </div>

          {(docType === 'lab' || docType === 'radiology') ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={mirrorIntoResults}
                onCheckedChange={(checked) => setMirrorIntoResults(checked === true)}
              />
              Mirror into {docType === 'lab' ? 'Lab Results' : 'Imaging'} tab
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !files.length}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Upload all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
