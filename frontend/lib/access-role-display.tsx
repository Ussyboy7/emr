import { createElement, type ReactElement } from "react";
import {
  Shield, Stethoscope, Syringe, FlaskConical, Pill, ScanLine, ClipboardList,
  Building2, Users, UserCog,
} from "lucide-react";
import type { Role as ApiRole } from "@/lib/services";

export function isSupportAccessRole(roleName?: string): boolean {
  return (roleName || "").trim().toLowerCase().endsWith(" support");
}

export function getAccessRoleBadgeClass(
  roleType?: ApiRole["type"],
  roleName?: string,
): string {
  if (isSupportAccessRole(roleName)) {
    return "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30";
  }
  switch (roleType) {
    case "admin":
      return "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30";
    case "doctor":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30";
    case "nurse":
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30";
    case "lab_tech":
      return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30";
    case "pharmacist":
      return "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/30";
    case "radiologist":
      return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30";
    case "records":
      return "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/30";
    default:
      return "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/30";
  }
}

export function getAccessRoleIcon(
  roleType?: ApiRole["type"],
  roleName?: string,
  className = "h-4 w-4",
): ReactElement {
  const iconProps = { className };
  if (isSupportAccessRole(roleName)) {
    return createElement(UserCog, iconProps);
  }
  switch (roleType) {
    case "admin":
      return createElement(Shield, iconProps);
    case "doctor":
      return createElement(Stethoscope, iconProps);
    case "nurse":
      return createElement(Syringe, iconProps);
    case "lab_tech":
      return createElement(FlaskConical, iconProps);
    case "pharmacist":
      return createElement(Pill, iconProps);
    case "radiologist":
      return createElement(ScanLine, iconProps);
    case "records":
      return createElement(ClipboardList, iconProps);
    default:
      if (roleName?.toLowerCase().includes("human resources") || roleName === "HR Support") {
        return createElement(Building2, iconProps);
      }
      return createElement(Users, iconProps);
  }
}
