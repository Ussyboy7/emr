import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type ExportFormat = "csv" | "pdf";

/**
 * Download a report via server-side export (`export=csv|pdf`).
 * Pass the same query string used for the JSON fetch, or a URLSearchParams builder result.
 */
export async function downloadReportExport(
  apiPath: string,
  query: string | URLSearchParams | null,
  format: ExportFormat,
  filename: string
): Promise<void> {
  const params =
    query instanceof URLSearchParams
      ? new URLSearchParams(query)
      : new URLSearchParams(query || "");
  params.set("export", format);

  const qs = params.toString();
  const path = qs ? `${apiPath}?${qs}` : `${apiPath}?export=${format}`;

  const blob = await apiFetch<Blob>(path, { responseType: "blob" });
  downloadBlob(blob, filename);
}

export async function exportReportCsv(
  apiPath: string,
  query: string | URLSearchParams | null,
  filename: string
): Promise<boolean> {
  try {
    await downloadReportExport(apiPath, query, "csv", filename);
    toast.success("CSV exported");
    return true;
  } catch {
    toast.error("CSV export failed");
    return false;
  }
}

export async function exportReportPdf(
  apiPath: string,
  query: string | URLSearchParams | null,
  filename: string
): Promise<boolean> {
  try {
    await downloadReportExport(apiPath, query, "pdf", filename);
    toast.success("PDF downloaded");
    return true;
  } catch {
    toast.error("PDF download failed");
    return false;
  }
}
