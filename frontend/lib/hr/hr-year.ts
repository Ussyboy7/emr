/** Programme year options shared across HR pages. */
export function hrProgrammeYearOptions(anchorYear = new Date().getFullYear()): number[] {
  return [anchorYear - 1, anchorYear, anchorYear + 1];
}

export function parseProgrammeYear(value: string | null | undefined): number {
  const parsed = parseInt(value || '', 10);
  if (Number.isFinite(parsed) && parsed > 2000) {
    return parsed;
  }
  return new Date().getFullYear();
}
