const SUPPORTED_PHOTO_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const SUPPORTED_PHOTO_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const HEIC_EXTENSIONS = new Set([".heic", ".heif"]);
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);

export const MAX_PATIENT_PHOTO_BYTES = 5 * 1024 * 1024;

function fileExtension(name: string): string {
  const lower = name.trim().toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

export function validatePatientPhotoFile(file: File): string | null {
  if (file.size > MAX_PATIENT_PHOTO_BYTES) {
    return "Photo must be less than 5MB";
  }

  const ext = fileExtension(file.name);
  const mime = (file.type || "").toLowerCase();

  if (HEIC_EXTENSIONS.has(ext) || HEIC_MIME_TYPES.has(mime)) {
    return "iPhone HEIC photos are not supported. Export as JPEG or PNG, then upload again.";
  }

  if (mime && !SUPPORTED_PHOTO_TYPES.has(mime)) {
    return "Use a JPEG, PNG, or WebP image.";
  }

  if (ext && !SUPPORTED_PHOTO_EXTENSIONS.has(ext)) {
    return "Use a JPEG, PNG, or WebP image.";
  }

  return null;
}

/** Resolve patient photo URL from common API response shapes. */
export function resolvePatientPhoto(source: unknown): string | null | undefined {
  if (!source || typeof source !== "object") return undefined;
  const record = source as Record<string, unknown>;

  if (typeof record.patient_photo === "string") return record.patient_photo;
  if (typeof record.photo === "string") return record.photo;

  const details = record.patient_details;
  if (details && typeof details === "object") {
    const photo = (details as Record<string, unknown>).photo;
    if (typeof photo === "string") return photo;
  }

  const patient = record.patient;
  if (patient && typeof patient === "object") {
    const photo = (patient as Record<string, unknown>).photo;
    if (typeof photo === "string") return photo;
  }

  return undefined;
}
