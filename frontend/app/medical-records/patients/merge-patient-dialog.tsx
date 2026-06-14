"use client";

/**
 * Side-by-side patient-merge dialog.
 *
 * Used by /medical-records/patients (admin only) to merge a patient
 * (the loser — the row the button was clicked on) into another patient
 * (the winner — picked via search). The merge is performed by
 * `POST /api/v1/patients/{loserId}/merge/`. After success, the loser
 * is tombstoned (`patient_id=MERGED-...`, `is_active=False`,
 * `merged_into=winner`) and clinical FKs are re-pointed to the winner.
 *
 * The dialog accepts the local frontend `Patient` type for the loser
 * (which is what the patients-list page already has) and uses the raw
 * backend patient shape for the search results.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, GitMerge, AlertTriangle } from "lucide-react";
import { patientService, type Patient as ApiPatient } from "@/lib/services";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/pagination-constants";

/** Local frontend patient shape (matches the list-page Patient type). */
export interface LocalPatient {
  id: string;          // display id, e.g. "E-93610"
  numericId?: number;  // DB id used for API calls
  name: string;
  category: string;
  personalNumber?: string;
  employeeType?: string;
  division?: string;
  dob?: string;
  phone?: string;
  email?: string;
  address?: string;
  location?: string;
}

interface MergePatientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loser: LocalPatient | null;
  onSuccess?: (winnerId: number) => void;
}

function apiToLocalSummary(api: ApiPatient) {
  return {
    numericId: api.id,
    id: api.patient_id || String(api.id),
    name: api.full_name || `${api.surname || ''} ${api.first_name || ''}`.trim(),
    category: api.category,
    personalNumber: api.personal_number || '',
    employeeType: api.employee_type || '',
    division: api.division || '',
    dob: api.date_of_birth || '',
    phone: api.phone || '',
    email: api.email || '',
    address: api.residential_address || api.permanent_address || '',
    location: api.location || '',
  };
}

interface SummaryField {
  label: string;
  loser: string;
  winner: string;
  divergent: boolean;
}

function buildSummary(loser: LocalPatient, winner: ReturnType<typeof apiToLocalSummary>): SummaryField[] {
  const fields: Array<{ label: string; key: keyof LocalPatient | 'numericId' }> = [
    { label: "Patient ID", key: "id" },
    { label: "Name", key: "name" },
    { label: "Category", key: "category" },
    { label: "DOB", key: "dob" },
    { label: "Phone", key: "phone" },
    { label: "Email", key: "email" },
    { label: "Personal #", key: "personalNumber" },
    { label: "Employee type", key: "employeeType" },
    { label: "Division", key: "division" },
    { label: "Location", key: "location" },
    { label: "Address", key: "address" },
  ];
  return fields.map((f) => {
    const l = (loser as any)[f.key];
    const w = (winner as any)[f.key];
    const ls = l == null ? "" : String(l);
    const ws = w == null ? "" : String(w);
    return {
      label: f.label,
      loser: ls || "—",
      winner: ws || "—",
      divergent: ls !== ws && (ls !== "" || ws !== ""),
    };
  });
}

export function MergePatientDialog({
  open,
  onOpenChange,
  loser,
  onSuccess,
}: MergePatientDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [winner, setWinner] = useState<ApiPatient | null>(null);
  const [reason, setReason] = useState("");
  const [merging, setMerging] = useState(false);

  // Reset state whenever the dialog opens or the loser changes.
  useEffect(() => {
    if (open) {
      setQuery("");
      setResults([]);
      setWinner(null);
      setReason("");
      setMerging(false);
    }
  }, [open, loser?.id]);

  // Debounced search for the winner.
  useEffect(() => {
    if (!open) return;
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      try {
        // The list endpoint already filters out tombstones by default, so
        // search results won't include merged-away records.
        const r = await patientService.getPatients({ search: query.trim(), page_size: DEFAULT_LIST_PAGE_SIZE });
        setResults(r.results || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open]);

  const summary = useMemo(
    () => (loser && winner ? buildSummary(loser, apiToLocalSummary(winner)) : []),
    [loser, winner],
  );

  const divergentCount = useMemo(
    () => summary.filter((f) => f.divergent).length,
    [summary],
  );

  async function handleMerge() {
    if (!loser || !winner) {
      toast.error("Pick the patient to keep (winner).");
      return;
    }
    if (!loser.numericId || !winner.id) {
      toast.error("Missing numeric ID for one of the patients.");
      return;
    }
    if (!reason.trim()) {
      toast.error("A reason is required for the audit log.");
      return;
    }
    setMerging(true);
    try {
      const result = await patientService.mergePatient(loser.numericId, winner.id, reason.trim());
      const counts = Object.entries(result.counters || {}).filter(([, v]) => (v as number) > 0);
      toast.success(
        `Merged ${result.loser_old_patient_id} → ${result.winner_patient_id}. ` +
          (counts.length ? `Re-pointed ${counts.length} clinical group(s).` : ""),
      );
      onSuccess?.(result.winner_id);
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || "Merge failed.");
    } finally {
      setMerging(false);
    }
  }

  if (!loser) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-amber-500" />
            Merge patient
          </DialogTitle>
          <DialogDescription>
            Fold one patient record into another. The selected patient
            (<span className="font-mono font-semibold">{loser.id}</span>,
            {" "}{loser.name}) will be tombstoned. All clinical records
            (visits, vitals, lab orders, prescriptions, consults, etc.)
            will be re-pointed to the chosen winner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Winner search */}
          <div className="space-y-2">
            <Label htmlFor="merge-winner-search">
              Patient to keep (winner)
            </Label>
            <Input
              id="merge-winner-search"
              placeholder="Search by patient ID or name (min 2 chars)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
            />
            {searching && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Searching…
              </div>
            )}
            {!searching && query.length >= 2 && results.length === 0 && (
              <div className="text-xs text-muted-foreground">No matches.</div>
            )}
            {results.length > 0 && !winner && (
              <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setWinner(r)}
                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm"
                  >
                    <div className="font-mono text-xs text-muted-foreground">
                      {r.patient_id || r.id}
                    </div>
                    <div className="font-medium">
                      {r.full_name || `${r.surname || ''} ${r.first_name || ''}`.trim()}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {[r.category, r.gender, r.date_of_birth].filter(Boolean).join(" · ")}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {winner && (
              <div className="flex items-center justify-between border rounded-md px-3 py-2 bg-amber-50 dark:bg-amber-900/20">
                <div>
                  <div className="font-mono text-xs">{winner.patient_id || winner.id}</div>
                  <div className="font-medium">
                    {winner.full_name || `${winner.surname || ''} ${winner.first_name || ''}`.trim()}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setWinner(null)}
                >
                  Change
                </Button>
              </div>
            )}
          </div>

          {/* Side-by-side compare */}
          {loser && winner && (
            <div className="space-y-2">
              <Label>Side-by-side compare</Label>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left p-2 font-medium">Field</th>
                      <th className="text-left p-2 font-medium text-red-700">
                        Loser (will be tombstoned)
                      </th>
                      <th className="text-left p-2 font-medium text-green-700">
                        Winner (will be kept)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.map((f) => (
                      <tr
                        key={f.label}
                        className={
                          f.divergent
                            ? "bg-amber-50 dark:bg-amber-900/10"
                            : ""
                        }
                      >
                        <td className="p-2 font-medium">{f.label}</td>
                        <td className="p-2 font-mono text-xs">{f.loser}</td>
                        <td className="p-2 font-mono text-xs">{f.winner}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {divergentCount > 0 && (
                <div className="text-xs text-amber-700 dark:text-amber-300 flex items-start gap-1">
                  <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                  <span>
                    {divergentCount} field(s) differ. The winner&apos;s
                    value is kept. Any empty fields on the winner are
                    back-filled from the loser.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="merge-reason">
              Reason <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="merge-reason"
              placeholder="e.g. Duplicate created when staff was promoted to officer; merging original into the new record."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Required. Stored in the PatientMerge audit row forever.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={merging}
          >
            Cancel
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!winner || !reason.trim() || merging}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {merging ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Merging…
              </>
            ) : (
              <>
                <GitMerge className="h-4 w-4 mr-2" />
                Merge
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
