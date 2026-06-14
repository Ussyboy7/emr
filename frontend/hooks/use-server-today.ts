"use client";

import { useEffect, useState } from "react";
import { getServerToday, peekServerNow, peekServerTimezone } from "@/lib/utils/serverTime";
import { peekServerTodayApi, todayApiDateString } from "@/lib/dates";

/**
 * Returns the server's current date (`YYYY-MM-DD` in the server timezone),
 * used as the anchor for Today / This week / This month filters.
 *
 * Before the first fetch resolves, this returns the client-local today so
 * filters still function; it then updates to the server date, causing the
 * page's data-fetching effects to re-run with the correct anchor.
 */
export function useServerToday(): string {
  const [today, setToday] = useState<string>(() => {
    const peeked = peekServerNow();
    const tz = peekServerTimezone();
    if (peeked && tz) {
      return peeked.toLocaleDateString("en-CA", { timeZone: tz });
    }
    return todayApiDateString();
  });

  useEffect(() => {
    let cancelled = false;
    getServerToday()
      .then((iso) => {
        if (!cancelled && iso && iso !== today) setToday(iso);
      })
      .catch(() => {
        // silent fallback — we're already using local today
      });
    return () => {
      cancelled = true;
    };
    // intentionally run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return today;
}
