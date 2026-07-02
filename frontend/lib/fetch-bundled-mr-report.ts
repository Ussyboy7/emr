import { apiFetch } from "@/lib/api-client";

export interface BundledReportSection {
  key: string;
  title: string;
  report: {
    error?: string;
    summary?: Record<string, unknown>;
    data?: unknown[];
  };
}

function isBundledPayload(value: unknown): value is { sections: BundledReportSection[] } {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { sections?: unknown }).sections)
  );
}

function isLegacyBundledPayload(value: unknown): boolean {
  return typeof value === "object" && value !== null && "overview" in value && !("sections" in value);
}

/** Fetch the all-sections comprehensive MR report bundle. */
export async function fetchBundledMrReport(
  params: URLSearchParams
): Promise<BundledReportSection[]> {
  const qs = params.toString();
  const paths = ["/reports/comprehensive/"];

  for (const path of paths) {
    const res = await apiFetch<unknown>(`${path}?${qs}`);
    if (isBundledPayload(res) && res.sections.length > 0) {
      return res.sections;
    }
    if (isLegacyBundledPayload(res)) {
      throw new Error(
        "The server returned an outdated /reports/comprehensive/ response (no sections). " +
          "Restart the Django backend to load the bundled comprehensive report API."
      );
    }
  }

  throw new Error(
    "Bundled report returned no sections. Restart the Django backend if you recently deployed changes."
  );
}
