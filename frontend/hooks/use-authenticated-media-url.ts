"use client";

import { useEffect, useState } from "react";
import {
  fetchAuthenticatedMediaBlob,
  isInlineMediaUrl,
} from "@/lib/media-url";

export type AuthenticatedMediaState = {
  url: string | null;
  loading: boolean;
  error: boolean;
};

/**
 * Resolve a protected media path to a blob: URL via authenticated apiFetch.
 * Deduplicates concurrent fetches and caches successful loads in-memory.
 */
export function useAuthenticatedMediaUrl(
  relativePath: string | null | undefined,
): AuthenticatedMediaState {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    const trimmed = typeof relativePath === "string" ? relativePath.trim() : "";
    if (!trimmed) {
      setUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    if (isInlineMediaUrl(trimmed)) {
      setUrl(trimmed);
      setLoading(false);
      setError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setUrl(null);

    fetchAuthenticatedMediaBlob(trimmed)
      .then((blobUrl) => {
        if (cancelled) return;
        setUrl(blobUrl);
        setError(!blobUrl);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [relativePath]);

  return { url, loading, error };
}
