"use client";

import { useEffect, useState } from "react";

/**
 * Returns a value that only updates `delay` ms after the input stops changing.
 * Use to debounce fast-changing inputs (search boxes, filter text) before
 * sending them to expensive consumers like API requests.
 */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);

  return debounced;
}
