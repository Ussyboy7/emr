'use client';

import { useEffect, useMemo, useState } from 'react';
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
import { referralService, type Referral } from '@/lib/services/referral-service';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientNumericId: number;
  onUploaded?: (doc: PatientClinicalDocument) => void;
  /** Prefill when opened from a referral row. */
  defaultReferralId?: number | null;
  defaultDocType?: ClinicalDocumentType;
  defaultSource?: ClinicalDocumentSource;
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

export function AddClinicalDocumentDialog({
  open,
  onOpenChange,
  patientNumericId,
  onUploaded,
  defaultReferralId = null,
  defaultDocType = 'consultation_report',
  defaultSource = 'scanned_paper',
}: Props) {
  const [docType, setDocType] = useState<ClinicalDocumentType>(defaultDocType);
  const [source, setSource] = useState<ClinicalDocumentSource>(defaultSource);
  const [documentDate, setDocumentDate] = useState(todayApiDateString());
  const [title, setTitle] = useState('');
  const [facility, setFacility] = useState('');
  const [clinicianName, setClinicianName] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [referralId, setReferralId] = useState<string>('none');
  const [closeReferral, setCloseReferral] = useState(false);
  const [mirrorIntoResults, setMirrorIntoResults] = useState(false);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loadingReferrals, setLoadingReferrals] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDocType(defaultDocType);
    setSource(defaultSource);
    setDocumentDate(todayApiDateString());
    setTitle('');
    setFacility('');
    setClinicianName('');
    setNotes('');
    setFile(null);
    setReferralId(defaultReferralId != null ? String(defaultReferralId) : 'none');
    setCloseReferral(Boolean(defaultReferralId));
    setMirrorIntoResults(defaultDocType === 'lab' || defaultDocType === 'radiology');
  }, [open, defaultDocType, defaultSource, defaultReferralId]);

  useEffect(() => {
    if (docType === 'lab' || docType === 'radiology') return;
    setMirrorIntoResults(false);
  }, [docType]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingReferrals(true);
    void (async () => {
      try {
        const res = await referralService.getReferrals({
          patient: String(patientNumericId),
          page_size: 50,
        });
        if (!cancelled) setReferrals(res.results || []);
      } catch {
        if (!cancelled) setReferrals([]);
      } finally {
        if (!cancelled) setLoadingReferrals(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, patientNumericId]);

  const referralOptions = useMemo(
    () =>
      referrals.map((r) => ({
        value: String(r.id),
        label: `${r.referral_id || `REF-${r.id}`} · ${r.specialty || r.facility || 'Referral'}`,
      })),
    [referrals],
  );

  const handleSave = async () => {
    if (!file || saving) return;
    if (!documentDate) {
      toast.error('Document date is required');
      return;
    }
    setSaving(true);
    try {
      const created = await patientService.uploadClinicalDocument(patientNumericId, {
        file,
        doc_type: docType,
        source,
        document_date: documentDate,
        title: title.trim() || undefined,
        facility: facility.trim() || undefined,
        clinician_name: clinicianName.trim() || undefined,
        notes: notes.trim() || undefined,
        referral: referralId !== 'none' ? Number(referralId) : null,
        close_referral: referralId !== 'none' && closeReferral,
        mirror_into_results: mirrorIntoResults && (docType === 'lab' || docType === 'radiology'),
      });
      toast.success('Document uploaded');
      onUploaded?.(created);
      onOpenChange(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to upload document');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add clinical document</DialogTitle>
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
            <Label htmlFor="doc-date">Encounter / result date</Label>
            <Input
              id="doc-date"
              type="date"
              value={documentDate}
              onChange={(e) => setDocumentDate(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-file">File (PDF or image, max 10MB)</Label>
            <Input
              id="doc-file"
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file ? (
              <p className="text-xs text-muted-foreground truncate">{file.name}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-title">Title (optional)</Label>
            <Input
              id="doc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 200))}
              placeholder="e.g. GOPD consult 12 Mar 2024"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="doc-facility">Facility (optional)</Label>
              <Input
                id="doc-facility"
                value={facility}
                onChange={(e) => setFacility(e.target.value.slice(0, 200))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="doc-clinician">Clinician / clinic (optional)</Label>
              <Input
                id="doc-clinician"
                value={clinicianName}
                onChange={(e) => setClinicianName(e.target.value.slice(0, 200))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Link referral (optional)</Label>
            <Select
              value={referralId}
              onValueChange={(v) => {
                setReferralId(v);
                if (v === 'none') setCloseReferral(false);
              }}
              disabled={loadingReferrals}
            >
              <SelectTrigger>
                <SelectValue placeholder={loadingReferrals ? 'Loading…' : 'None'} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {referralOptions.map((r) => (
                  <SelectItem key={r.value} value={r.value}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {referralId !== 'none' ? (
              <label className="flex items-center gap-2 text-sm pt-1">
                <Checkbox
                  checked={closeReferral}
                  onCheckedChange={(c) => setCloseReferral(c === true)}
                />
                Close referral after upload (when eligible)
              </label>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="doc-notes">Notes (optional)</Label>
            <Textarea
              id="doc-notes"
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
                onCheckedChange={(c) => setMirrorIntoResults(c === true)}
              />
              Mirror into {docType === 'lab' ? 'Lab Results' : 'Imaging'} tab
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || !file}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
