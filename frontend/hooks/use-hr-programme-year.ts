'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { hrProgrammeYearOptions, parseProgrammeYear } from '@/lib/hr/hr-year';

/** Programme year state synced to the `?year=` query param. */
export function useHrProgrammeYear() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const yearFromUrl = parseProgrammeYear(searchParams.get('year'));
  const [year, setYear] = useState(yearFromUrl);

  useEffect(() => {
    setYear(yearFromUrl);
  }, [yearFromUrl]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (params.get('year') === String(year)) return;
    params.set('year', String(year));
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [year, router, searchParams]);

  return {
    year,
    setYear,
    yearOptions: hrProgrammeYearOptions(),
  };
}
