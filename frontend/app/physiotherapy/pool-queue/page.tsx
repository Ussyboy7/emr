'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Legacy route — orders workflow lives under Study Orders. */
export default function PhysiotherapyPoolQueueRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/physiotherapy/orders');
  }, [router]);
  return null;
}
