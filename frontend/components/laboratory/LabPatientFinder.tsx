'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { labService } from '@/lib/services';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  buildLabCompletedHref,
  buildLabOrdersHref,
  buildLabVerificationHref,
  type LabOrdersTab,
  type LabVerificationTab,
} from '@/lib/laboratory/lab-workflow-search';
import { ArrowRight, Loader2, Search } from 'lucide-react';

type TrackerHit = {
  patient_name: string;
  patient_id: string;
  test_name: string;
  test_code: string;
  test_status: string;
  test_status_display: string;
  lab_number: string | null;
  order_id: string | null;
  clinic: string | null;
  screen: 'lab_orders' | 'verification' | 'completed';
  tab: string;
  screen_label: string;
  tab_label: string;
  href_screen: string;
  is_active: boolean;
};

export function LabPatientFinder() {
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 350);
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<TrackerHit[]>([]);
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback(async (term: string) => {
    const q = term.trim();
    if (q.length < 2) {
      setHits([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setSearched(true);
    try {
      const res = await labService.getPatientTracker(q);
      setHits(res.results || []);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void runSearch(debounced);
  }, [debounced, runSearch]);

  const activeHits = hits.filter((h) => h.is_active);
  const doneHits = hits.filter((h) => !h.is_active);
  const searchTerm = debounced.trim();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Search className="h-5 w-5 text-amber-500" />
          Find patient in lab
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Search by patient name, patient ID, order ID, or lab number — see where they are in the workflow.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Patient name, ID, lab number (e.g. BT-26-0259)…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching…
          </div>
        )}

        {!loading && searched && searchTerm.length >= 2 && hits.length === 0 && (
          <p className="text-sm text-muted-foreground py-2">No lab records found for this search.</p>
        )}

        {!loading && activeHits.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Active in lab</p>
            {activeHits.map((hit, idx) => (
              <div
                key={`${hit.patient_id}-${hit.test_code}-${hit.test_status}-${idx}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border bg-muted/30"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{hit.patient_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {hit.test_name}
                    {hit.lab_number ? ` · ${hit.lab_number}` : ''}
                    {hit.clinic ? ` · ${hit.clinic}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5 mt-1.5">
                    <Badge variant="outline" className="text-[10px]">
                      {hit.screen_label} → {hit.tab_label}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {hit.test_status_display}
                    </Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="shrink-0" asChild>
                  <Link
                    href={
                      hit.screen === 'lab_orders'
                        ? buildLabOrdersHref(searchTerm, hit.tab as LabOrdersTab)
                        : hit.screen === 'verification'
                          ? buildLabVerificationHref(searchTerm, hit.tab as LabVerificationTab)
                          : buildLabCompletedHref(searchTerm)
                    }
                  >
                    Open
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}

        {!loading && doneHits.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completed / verified</p>
            {doneHits.slice(0, 8).map((hit, idx) => (
              <div
                key={`done-${hit.patient_id}-${hit.test_code}-${idx}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-lg border"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">{hit.patient_name}</p>
                  <p className="text-xs text-muted-foreground truncate">{hit.test_name}</p>
                </div>
                <Button variant="ghost" size="sm" className="shrink-0" asChild>
                  <Link href={buildLabCompletedHref(searchTerm)}>
                    Completed Tests
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
