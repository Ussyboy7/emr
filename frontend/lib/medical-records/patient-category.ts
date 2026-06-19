export const PATIENT_CATEGORY_LABELS: Record<string, string> = {
  employee: "Employee",
  retiree: "Retiree",
  dependent: "Dependent",
  nonnpa: "NonNPA",
};

export function formatPatientCategoryLabel(category: string | null | undefined): string {
  if (!category) return "";
  const key = category.toLowerCase();
  return PATIENT_CATEGORY_LABELS[key] || category;
}

export function getPatientCategoryBadgeClass(category: string): string {
  const label = formatPatientCategoryLabel(category);
  switch (label) {
    case "Employee":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "Retiree":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "Dependent":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300";
    case "NonNPA":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  }
}

export function getPatientCategoryBorderClass(category: string): string {
  const label = formatPatientCategoryLabel(category);
  const styles: Record<string, string> = {
    Employee: "border-teal-500/50 text-teal-600 dark:text-teal-400",
    Retiree: "border-amber-500/50 text-amber-600 dark:text-amber-400",
    Dependent: "border-violet-500/50 text-violet-600 dark:text-violet-400",
    NonNPA: "border-blue-500/50 text-blue-600 dark:text-blue-400",
  };
  return styles[label] || "border-muted-foreground/50 text-muted-foreground";
}
