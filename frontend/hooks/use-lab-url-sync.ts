'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

type UseLabUrlSyncOptions = {
  search: string;
  tab: string;
  defaultTab: string;
  onSearchFromUrl: (value: string) => void;
  onTabFromUrl: (value: string) => void;
  isValidTab: (value: string | null) => boolean;
};

/**
 * Hydrate search/tab from URL once, then keep URL in sync (replace, no scroll).
 */
export function useLabUrlSync({
  search,
  tab,
  defaultTab,
  onSearchFromUrl,
  onTabFromUrl,
  isValidTab,
}: UseLabUrlSyncOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const hydrated = useRef(false);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const urlSearch = searchParams.get('search');
    const urlTab = searchParams.get('tab');
    if (urlSearch) onSearchFromUrl(urlSearch);
    if (urlTab && isValidTab(urlTab)) onTabFromUrl(urlTab);
  }, [searchParams, onSearchFromUrl, onTabFromUrl, isValidTab]);

  useEffect(() => {
    if (!hydrated.current) return;
    const params = new URLSearchParams();
    const trimmed = search.trim();
    if (trimmed) params.set('search', trimmed);
    if (tab && tab !== defaultTab) params.set('tab', tab);
    const qs = params.toString();
    const next = qs ? `${pathname}?${qs}` : pathname;
    const current = searchParams.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname;
    if (next !== current) {
      router.replace(next, { scroll: false });
    }
  }, [search, tab, defaultTab, pathname, router, searchParams]);
}
