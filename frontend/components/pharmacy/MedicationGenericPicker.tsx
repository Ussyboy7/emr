'use client';

import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { CATALOG_SEARCH_PAGE_SIZE } from '@/lib/pagination-constants';
import { pharmacyService } from '@/lib/services/pharmacy-service';
import {
  type GenericMedicationLike,
  formatGenericMedicationLabel,
  genericMedicationKey,
  genericMedicationSubline,
  normalizeGenericMedicationId,
} from '@/lib/pharmacy/generic-medication';

export type MedicationGenericPickerProps = {
  /** When false, search is disabled (e.g. dialog closed). */
  active?: boolean;
  label?: string;
  placeholder?: string;
  /** Stable string keys — use `genericMedicationKey`. */
  selectedKeys: string[];
  /** Full generic rows for selected chips (keyed lookup). */
  selectedGenerics: Map<string, GenericMedicationLike>;
  onToggle: (generic: GenericMedicationLike, selected: boolean) => void;
  onClearAll?: () => void;
  selectionStyle?: 'checkbox' | 'check';
  selectedLabel?: string;
  emptyHint?: string;
  pageSize?: number;
};

export function MedicationGenericPicker({
  active = true,
  label = 'Search and Select Medications *',
  placeholder = 'Type to search pharmacy generics — e.g. Paracetamol',
  selectedKeys,
  selectedGenerics,
  onToggle,
  onClearAll,
  selectionStyle = 'checkbox',
  selectedLabel = 'Selected medications',
  emptyHint = 'Try a different search term, or check that generics have been added to Pharmacy → Generics.',
  pageSize = CATALOG_SEARCH_PAGE_SIZE,
}: MedicationGenericPickerProps) {
  const [search, setSearch] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<GenericMedicationLike[]>([]);
  const searchReqRef = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active || !showResults) return;
    const term = search.trim();
    if (!term) {
      setResults([]);
      return;
    }
    const reqId = ++searchReqRef.current;
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const res = await pharmacyService.getGenericsForPrescription({
          search: term,
          page_size: pageSize,
        });
        if (reqId === searchReqRef.current) {
          setResults((res.results || []) as GenericMedicationLike[]);
        }
      } catch (err: unknown) {
        if (reqId === searchReqRef.current) {
          const message =
            (err as { message?: string })?.message ||
            (err as { detail?: string })?.detail ||
            'Failed to load medication search results.';
          toast.error(message);
          setResults([]);
        }
      } finally {
        if (reqId === searchReqRef.current) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [active, showResults, search, pageSize]);

  useEffect(() => {
    if (!active || !showResults) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = containerRef.current;
      if (el && !el.contains(e.target as Node)) setShowResults(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [active, showResults]);

  const trimmed = search.trim();

  return (
    <div className="space-y-2" ref={containerRef}>
      <Label>{label}</Label>
      <Input
        value={search}
        onChange={(e) => {
          const v = e.target.value;
          setSearch(v);
          setShowResults(!!v.trim());
        }}
        onFocus={() => {
          if (trimmed) setShowResults(true);
        }}
        placeholder={placeholder}
        autoComplete="off"
      />

      {showResults && trimmed && (
        <div className="rounded-md border bg-popover shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b bg-muted/40 text-xs text-muted-foreground flex items-center justify-between gap-2">
            <span>
              Results for &ldquo;<span className="font-medium text-foreground">{trimmed}</span>&rdquo;
            </span>
            {!loading && results.length > 0 && <span>{results.length} found</span>}
          </div>
          <div className="max-h-[240px] min-h-[120px] overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mx-auto mb-1" />
                Searching generics…
              </div>
            ) : results.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground space-y-1">
                <div>No generics found.</div>
                {emptyHint ? <div className="text-xs text-muted-foreground/75">{emptyHint}</div> : null}
              </div>
            ) : (
              results.map((g) => {
                const id = normalizeGenericMedicationId(g.id);
                if (!id) return null;
                const key = genericMedicationKey(g);
                const isSelected = selectedKeys.includes(key);
                const subline = genericMedicationSubline(g);
                return (
                  <div
                    key={key}
                    onClick={() => onToggle(g, !isSelected)}
                    className={`px-3 py-2 hover:bg-muted cursor-pointer border-b last:border-b-0 flex items-start gap-2 text-sm ${
                      isSelected ? 'bg-emerald-500/10 dark:bg-emerald-500/15' : ''
                    }`}
                  >
                    {selectionStyle === 'checkbox' ? (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggle(g, !isSelected)}
                        className="mt-0.5"
                      />
                    ) : (
                      <span
                        className={`mt-0.5 h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                          isSelected
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'border-muted-foreground/40'
                        }`}
                      >
                        {isSelected && <Check className="h-3 w-3" />}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <div className="font-medium">{formatGenericMedicationLabel(g)}</div>
                      {subline ? (
                        <div className="text-xs text-muted-foreground mt-0.5">{subline}</div>
                      ) : null}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {selectedKeys.length > 0 && (
        <div className="rounded-md border bg-emerald-500/5 dark:bg-emerald-500/10 p-3 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-emerald-700 dark:text-emerald-300">
              {selectedLabel} ({selectedKeys.length}):
            </p>
            {onClearAll ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-emerald-700 dark:text-emerald-300 hover:text-emerald-900"
                onClick={onClearAll}
              >
                Clear All
              </Button>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selectedKeys.map((key) => {
              const g = selectedGenerics.get(key);
              if (!g) return null;
              return (
                <Badge key={key} variant="secondary" className="flex items-center gap-1 text-xs">
                  {formatGenericMedicationLabel(g)}
                  <button
                    type="button"
                    onClick={() => onToggle(g, false)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remove"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
