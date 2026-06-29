/**
 * Protected media URLs — files are served from /api/common/media/ with JWT auth.
 * Prefer `fetchAuthenticatedMediaBlob` / `useAuthenticatedMediaUrl` for images
 * so requests use Bearer tokens and token refresh (plain <img src> cannot).
 */

export function isInlineMediaUrl(input: string): boolean {
  return input.startsWith("data:") || input.startsWith("blob:");
}

function getApiRoot(): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!baseUrl || baseUrl.trim() === "") {
    return "/api";
  }
  const normalized = baseUrl.trim().replace(/\/$/, "");
  if (normalized.endsWith("/api/v1") || normalized.endsWith("/api")) {
    return normalized;
  }
  return `${normalized}/api`;
}

function isRewriteableMediaUrl(input: string): boolean {
  if (input.startsWith("http://") || input.startsWith("https://")) {
    try {
      const { pathname } = new URL(input);
      return pathname.includes("/common/media/") || pathname.startsWith("/media/");
    } catch {
      return false;
    }
  }
  return true;
}

export function normalizeMediaRelativePath(relativePath: string): string {
  let p = relativePath.trim();
  if (!p) return "";

  if (p.startsWith("http://") || p.startsWith("https://")) {
    try {
      p = new URL(p).pathname;
    } catch {
      return relativePath.trim();
    }
  }

  const apiRoot = getApiRoot();
  const protectedPrefix = `${apiRoot}/common/media/`;
  if (p.startsWith(protectedPrefix)) {
    p = p.slice(protectedPrefix.length);
  } else if (p.includes("/common/media/")) {
    p = p.split("/common/media/").pop() || "";
  }

  if (p.startsWith("/media/")) p = p.slice("/media/".length);
  else if (p.startsWith("media/")) p = p.slice("media/".length);

  return decodeURIComponent(p.replace(/^\/+/, ""));
}

/**
 * Build a same-origin URL for authenticated media (JWT access-token cookie on <img> requests).
 */
export function getMediaUrl(relativePath: string | null | undefined): string | null {
  if (!relativePath) return null;

  const trimmed = relativePath.trim();
  if (!trimmed) return null;

  if (
    (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
    !isRewriteableMediaUrl(trimmed)
  ) {
    return trimmed;
  }

  const rel = normalizeMediaRelativePath(trimmed);
  if (!rel || rel.startsWith("http://") || rel.startsWith("https://")) {
    return rel || null;
  }

  return `${getApiRoot()}/common/media/${encodeURI(rel)}`;
}

const mediaBlobCache = new Map<string, string>();
const inflightMediaFetches = new Map<string, Promise<string | null>>();

/** Clear cached blob URLs (tests). */
export function clearAuthenticatedMediaCache(): void {
  for (const blobUrl of mediaBlobCache.values()) {
    URL.revokeObjectURL(blobUrl);
  }
  mediaBlobCache.clear();
  inflightMediaFetches.clear();
}

/**
 * Fetch protected media via apiFetch and return a blob: URL (cached in-memory).
 */
export async function fetchAuthenticatedMediaBlob(
  relativePath: string | null | undefined,
): Promise<string | null> {
  if (!relativePath) return null;

  const trimmed = relativePath.trim();
  if (!trimmed) return null;
  if (isInlineMediaUrl(trimmed)) return trimmed;

  const rel = normalizeMediaRelativePath(trimmed);
  if (!rel) return null;

  const cached = mediaBlobCache.get(rel);
  if (cached) return cached;

  let pending = inflightMediaFetches.get(rel);
  if (!pending) {
    pending = (async () => {
      try {
        const { apiFetch } = await import("@/lib/api-client");
        const blob = await apiFetch<Blob>(`/common/media/${encodeURI(rel)}`, {
          responseType: "blob",
        });
        const blobUrl = URL.createObjectURL(blob);
        mediaBlobCache.set(rel, blobUrl);
        return blobUrl;
      } catch {
        return null;
      } finally {
        inflightMediaFetches.delete(rel);
      }
    })();
    inflightMediaFetches.set(rel, pending);
  }

  return pending;
}

/**
 * Open a protected media file in a new tab (uses Bearer token via apiFetch).
 */
export async function openMediaInNewTab(
  relativePath: string | null | undefined,
): Promise<void> {
  if (!relativePath) {
    throw new Error("No media path");
  }

  let pathInput = relativePath.trim();
  if (pathInput.startsWith("http://") || pathInput.startsWith("https://")) {
    const normalized = getMediaUrl(pathInput);
    if (normalized && normalized !== pathInput) {
      pathInput = normalized;
    } else if (pathInput.includes("/media/") && !pathInput.includes("/common/media/")) {
      const rel = normalizeMediaRelativePath(pathInput);
      if (rel && !rel.startsWith("http")) {
        pathInput = rel;
      } else {
        window.open(pathInput, "_blank", "noopener,noreferrer");
        return;
      }
    } else {
      window.open(pathInput, "_blank", "noopener,noreferrer");
      return;
    }
  }

  const rel = normalizeMediaRelativePath(pathInput);
  if (!rel) {
    throw new Error("No media path");
  }

  const blobUrl = await fetchAuthenticatedMediaBlob(rel);
  if (!blobUrl) {
    throw new Error("Failed to load media");
  }
  try {
    const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
    if (!win) {
      throw new Error("Pop-ups blocked. Allow pop-ups to view the file.");
    }
  } catch (error) {
    throw error;
  }
}
