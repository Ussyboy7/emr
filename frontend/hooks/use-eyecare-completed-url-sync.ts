'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type UseEyecareCompletedUrlSyncOptions = {
  search: string;
  dateFilter: string;
  onSearchFromUrl: (value: string) => void;
  onDateFilterFromUrl: (value: string) => void;
};

/** Hydrate search/date from URL once, then keep URL in sync (replace, no scroll). */
export function useEyecareCompletedUrlSync({
  search,
  dateFilter,
  onSearchFromUrl,
  onDateFilterFromUrl,
}: UseEyecareCompletedUrlSyncOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const urlSearch = searchParams.get('search');
    const urlDate = searchParams.get('date');
    if (urlSearch) onSearchFromUrl(urlSearch);
    if (urlDate === 'all') onDateFilterFromUrl('all');
  }, [searchParams, onSearchFromUrl, onDateFilterFromUrl]);

  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams();
    const trimmed = search.trim();
    if (trimmed) params.set('search', trimmed);
    if (dateFilter === 'all') params.set('date', 'all');
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    const current = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    if (next !== current) {
      router.replace(next, { scroll: false });
    }
  }, [search, dateFilter, pathname, router, searchParams]);
}
