/**
 * Shared formatting for vitals tiles (nursing pool queue, VitalsDetailModal, etc.).
 */

export function vitalFieldToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "number" && !Number.isNaN(v)) return String(v);
  const s = String(v).trim();
  if (s === "" || s === "null" || s === "undefined") return "";
  return s;
}

export function formatVitalTileValue(raw: string | undefined): string {
  if (raw == null || String(raw).trim() === "") return "—";
  const n = Number(raw);
  if (!Number.isNaN(n) && Number.isFinite(n)) {
    return Number.isInteger(n) ? String(n) : parseFloat(n.toFixed(2)).toString();
  }
  return String(raw).trim();
}

/** BMI from API or computed from weight (kg) and height (cm). */
export function displayBmiFromVitals(v: { bmi?: string; weight?: string; height?: string }): string {
  const api = vitalFieldToString(v.bmi);
  if (api) return api;
  const w = parseFloat(vitalFieldToString(v.weight));
  const h = parseFloat(vitalFieldToString(v.height));
  if (!Number.isFinite(w) || !Number.isFinite(h) || h <= 0) return "";
  return (w / Math.pow(h / 100, 2)).toFixed(1);
}
