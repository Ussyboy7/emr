"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { normalizeRolePagePath } from "@/lib/page-permissions";
import { useState } from "react";
import {
  LayoutDashboard,
  FileText,
  Users,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  BarChart3,
  UserCog,
  Activity,
  HelpCircle,
  Shield,
  Stethoscope,
  Heart,
  FlaskConical,
  Pill,
  ScanLine,
  Calendar,
  CalendarDays,
  ClipboardList,
  UserPlus,
  TestTube,
  Eye,
  Building2,
  FolderOpen,
  FilePlus,
  Syringe,
  History,
  DoorOpen,
  Play,
  TrendingUp,
  CheckCircle,
  ShieldCheck,
  Database,
  Image as ImageIcon,
  FileBarChart,
  Target,
  LucideIcon,
  Send,
  Package,
  ClipboardCheck,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NPA_LOGO_URL, NPA_EMR_TITLE } from "@/lib/branding";
import { Badge } from "@/components/ui/badge";
import { TooltipProvider, Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getHomeRouteForUser } from "@/lib/home-route";
import { useClinic } from "@/hooks/use-clinic";

// Types for menu structure
interface MenuItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: string | number;
}

interface MenuSection {
  label: string;
  icon: LucideIcon;
  color: string;
  activeColor: string;
  items: MenuItem[];
  basePath: string;
}

// Menu configuration
const menuSections: MenuSection[] = [
  {
    label: "Medical Records",
    icon: FileText,
    color: "text-blue-400",
    activeColor: "data-[active=true]:bg-blue-500/10 data-[active=true]:text-blue-400",
    basePath: "/medical-records",
    items: [
      { label: "Home", href: "/medical-records", icon: LayoutDashboard },
      { label: "Register Patient", href: "/medical-records/patients/new", icon: UserPlus },
      { label: "Manage Patients", href: "/medical-records/patients", icon: Users },
      { label: "Patient Records", href: "/medical-records/patient-records", icon: FileBarChart },
      { label: "Create Visit", href: "/medical-records/visits/new", icon: FilePlus },
      { label: "Manage Visits", href: "/medical-records/visits", icon: Calendar },
      { label: "Appointments", href: "/medical-records/appointments", icon: CalendarDays },
      { label: "Referrals", href: "/medical-records/referrals", icon: ArrowRight },
      { label: "Reports", href: "/medical-records/reports", icon: FolderOpen },
    ],
  },
  {
    label: "Nursing",
    icon: Heart,
    color: "text-rose-400",
    activeColor: "data-[active=true]:bg-rose-500/10 data-[active=true]:text-rose-400",
    basePath: "/nursing",
    items: [
      { label: "Home", href: "/nursing", icon: LayoutDashboard },
      { label: "Pool Queue", href: "/nursing/pool-queue", icon: Users },
      { label: "Room Queue", href: "/nursing/room-queue", icon: DoorOpen },
      { label: "Vitals History", href: "/nursing/vitals-history", icon: Activity },
      { label: "Procedures", href: "/nursing/procedures", icon: Syringe },
      { label: "Procedures History", href: "/nursing/procedures/history", icon: ClipboardList },
      { label: "Ward Care", href: "/nursing/wards", icon: Building2 },
      { label: "Analytics", href: "/nursing/analytics", icon: BarChart3 },
      { label: "Inventory", href: "/nursing/inventory", icon: Users },
      { label: "Requests", href: "/nursing/requests", icon: Users },
    ],
  },
  {
    label: "Consultation",
    icon: Stethoscope,
    color: "text-emerald-400",
    activeColor: "data-[active=true]:bg-emerald-500/10 data-[active=true]:text-emerald-400",
    basePath: "/consultation",
    items: [
      { label: "Home", href: "/consultation", icon: LayoutDashboard },
      { label: "Start Consultation", href: "/consultation/start", icon: Play },
      { label: "Consultation History", href: "/consultation/history", icon: History },
      { label: "Ward Overview", href: "/consultation/wards", icon: Building2 },
      { label: "Referrals", href: "/consultation/referrals", icon: ArrowRight },
      { label: "Analytics", href: "/consultation/analytics", icon: BarChart3 },

    ],
  },
  {
    label: "Laboratory",
    icon: FlaskConical,
    color: "text-amber-400",
    activeColor: "data-[active=true]:bg-amber-500/10 data-[active=true]:text-amber-400",
    basePath: "/laboratory",
    items: [
      { label: "Home", href: "/laboratory", icon: LayoutDashboard },
      { label: "Lab Orders", href: "/laboratory/orders", icon: TestTube },
      { label: "Results Verification", href: "/laboratory/verification", icon: ShieldCheck },
      { label: "Completed Tests", href: "/laboratory/completed", icon: CheckCircle },
      { label: "Test Templates", href: "/laboratory/templates", icon: FileText },
      { label: "Analysis", href: "/laboratory/analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Pharmacy",
    icon: Pill,
    color: "text-violet-400",
    activeColor: "data-[active=true]:bg-violet-500/10 data-[active=true]:text-violet-400",
    basePath: "/pharmacy",
    items: [
      { label: "Home", href: "/pharmacy", icon: LayoutDashboard },
      { label: "Prescriptions", href: "/pharmacy/prescriptions", icon: ClipboardList },
      { label: "Dispense History", href: "/pharmacy/history", icon: History },
      { label: "Dispensary inventory", href: "/pharmacy/inventory", icon: Database },
      { label: "Dispensary Requests", href: "/pharmacy/requests", icon: Send },
      { label: "Generics", href: "/pharmacy/generics", icon: Pill },
      { label: "Drug master", href: "/pharmacy/drugs", icon: Pill },
      { label: "Central store", href: "/pharmacy/store", icon: Package },
      { label: "Store Requests", href: "/pharmacy/store/requests", icon: Send },
      { label: "Inventory Analytics", href: "/pharmacy/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Radiology",
    icon: ScanLine,
    color: "text-cyan-400",
    activeColor: "data-[active=true]:bg-cyan-500/10 data-[active=true]:text-cyan-400",
    basePath: "/radiology",
    items: [
      { label: "Home", href: "/radiology", icon: LayoutDashboard },
      { label: "Study Orders", href: "/radiology/orders", icon: ClipboardList },
      { label: "Results Verification", href: "/radiology/verification", icon: ShieldCheck },
      { label: "Completed Studies", href: "/radiology/completed", icon: FileBarChart },
      { label: "Study Templates", href: "/radiology/templates", icon: FileText },
      { label: "Analysis", href: "/radiology/analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Physiotherapy",
    icon: Activity,
    color: "text-emerald-400",
    activeColor: "data-[active=true]:bg-emerald-500/10 data-[active=true]:text-emerald-400",
    basePath: "/physiotherapy",
    items: [
      { label: "Home", href: "/physiotherapy", icon: LayoutDashboard },
      { label: "Orders", href: "/physiotherapy/orders", icon: Users },
      { label: "Completed Sessions", href: "/physiotherapy/completed", icon: CheckCircle },
      { label: "Analysis", href: "/physiotherapy/analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Eye Clinic",
    icon: Eye,
    color: "text-blue-400",
    activeColor: "data-[active=true]:bg-blue-500/10 data-[active=true]:text-blue-400",
    basePath: "/eyecare",
    items: [
      { label: "Home", href: "/eyecare", icon: LayoutDashboard },
      { label: "Orders", href: "/eyecare/orders", icon: Users },
      { label: "Completed Sessions", href: "/eyecare/completed", icon: CheckCircle },
      { label: "Analysis", href: "/eyecare/analytics", icon: TrendingUp },
    ],
  },
  {
    label: "Human Resources",
    icon: ClipboardList,
    color: "text-violet-400",
    activeColor: "data-[active=true]:bg-violet-500/10 data-[active=true]:text-violet-400",
    basePath: "/hr",
    items: [
      { label: "Home", href: "/hr", icon: LayoutDashboard },
      { label: "Annual Check-ups", href: "/hr/annual-checkups", icon: ClipboardList },
      { label: "Exemptions", href: "/hr/exemptions", icon: ShieldCheck },
    ],
  },
  {
    label: "Analytics",
    icon: BarChart3,
    color: "text-indigo-400",
    activeColor: "data-[active=true]:bg-indigo-500/10 data-[active=true]:text-indigo-400",
    basePath: "/analytics",
    items: [
      { label: "Clinical Reports", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Administration",
    icon: Shield,
    color: "text-slate-400",
    activeColor: "data-[active=true]:bg-slate-500/10 data-[active=true]:text-slate-300",
    basePath: "/admin",
    items: [
      { label: "Home", href: "/admin", icon: LayoutDashboard },
      { label: "User Management", href: "/admin/users", icon: UserCog },
      { label: "Roles & Permissions", href: "/admin/roles", icon: Shield },
      { label: "Clinics & Departments", href: "/admin/clinics", icon: Building2 },
      { label: "System Settings", href: "/admin/settings", icon: Settings },
      { label: "System Health", href: "/admin/health", icon: Activity },
      { label: "Annual Check-up", href: "/admin/annual-checkup-programme", icon: ClipboardCheck },
      { label: "Audit Trail", href: "/admin/audit", icon: ClipboardList },
    ],
  },
];

export function AppSidebar() {
  const { state, toggleSidebar } = useSidebar();
  const pathname = usePathname();
  const isCollapsed = state === "collapsed";
  const { currentUser, hydrated } = useCurrentUser();
  const { activeClinicId } = useClinic();
  const homeRoute = getHomeRouteForUser(currentUser) || "/no-access";
  const canViewOverviewDashboard =
    Boolean(currentUser?.isSuperuser) || Boolean(currentUser?.permissions?.includes("/dashboard"));


  // Track which sections are open
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    menuSections.forEach((section) => {
      initial[section.label] = pathname.startsWith(section.basePath);
    });
    return initial;
  });

  const toggleSection = (label: string) => {
    setOpenSections((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  const isActive = (href: string) => {
    if (href === "/analytics") {
      return pathname === "/analytics" || (pathname.startsWith("/analytics") && !pathname.includes("/executive"));
    }
    return pathname === href || pathname.startsWith(href + "/");
  };

  const isItemActive = (href: string, basePath: string) => {
    // Dashboard pages should be exact match only
    if (href === basePath || href === "/medical-records" || href === "/nursing" ||
        href === "/laboratory" || href === "/pharmacy" || href === "/radiology" ||
        href === "/consultation") {
      return pathname === href;
    }
    // Special handling for paths that shouldn't match sub-paths
    if (href === "/medical-records/patients") {
      return pathname === href || (pathname.startsWith(href + "/") && !pathname.includes("/new"));
    }
    if (href === "/medical-records/visits") {
      return pathname === href || (pathname.startsWith(href + "/") && !pathname.includes("/new"));
    }
    if (href === "/nursing/procedures") {
      return pathname === href && !pathname.includes("/history");
    }
    return isActive(href);
  };

  // Filter menu sections based on user permissions
  const getFilteredMenuSections = () => {
    if (!hydrated || !currentUser) {
      // If not hydrated or no user, show nothing except overview
      return [];
    }

    // Super admin users see ALL sections and ALL pages
    if (currentUser.isSuperuser) {
      return menuSections;
    }

    // Check if user has access to pages from each module
    const allowedPages = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];
    const allowedSet = new Set(allowedPages.map(normalizeRolePagePath));

    const canManageUsers =
      currentUser.isSuperuser ||
      currentUser.isStaff ||
      currentUser.isDepartmentHead;

    return menuSections.filter(section => {
      return section.items.some(item => {
        if (item.href === '/admin/users') {
          const hasPage =
            allowedSet.has('/admin/users') || allowedSet.has('/admin');
          return hasPage && canManageUsers;
        }
        return allowedSet.has(normalizeRolePagePath(item.href));
      });
    });
  };

  // Filter menu items within sections based on permissions
  const getFilteredMenuItems = (section: MenuSection) => {
    if (!currentUser) {
      return [];
    }

    // Filter out Central store and Store Requests if not on Bode Thomas (superusers bypass)
    const storeHrefs = ['/pharmacy/store', '/pharmacy/store/requests'];
    const baseItems = section.items.filter(item => {
      if (storeHrefs.includes(item.href) && activeClinicId !== 5 && !currentUser.isSuperuser) {
        return false;
      }
      return true;
    });

    // Super admin users see ALL items in ALL sections
    if (currentUser.isSuperuser) {
      return baseItems;
    }

    // Check if user has access to specific pages
    const allowedPages = Array.isArray(currentUser.permissions) ? currentUser.permissions : [];
    const allowedSet = new Set(allowedPages.map(normalizeRolePagePath));

    const canManageUsers =
      currentUser.isSuperuser ||
      currentUser.isStaff ||
      currentUser.isDepartmentHead;

    return baseItems.filter(item => {
      if (item.href === '/admin/users') {
        const hasPage =
          allowedSet.has('/admin/users') || allowedSet.has('/admin');
        return hasPage && canManageUsers;
      }
      if (item.href === '/admin/health' && allowedSet.has('/admin')) {
        return true;
      }
      return allowedSet.has(normalizeRolePagePath(item.href));
    });
  };

  const filteredMenuSections = getFilteredMenuSections();

  return (
    <TooltipProvider delayDuration={0}>
      <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
        <SidebarRail />
        <SidebarHeader className="border-b border-sidebar-border px-2 py-3">
          <div className={`flex items-center w-full min-w-0 ${isCollapsed ? 'flex-col gap-2' : 'justify-between'}`}>
            <Link 
              href={homeRoute}
              className="flex items-center gap-2.5 min-w-0 group"
            >
              <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg shadow-md ring-1 ring-sidebar-primary/20 bg-white transition-transform group-hover:scale-105">
                <Image
                  src={NPA_LOGO_URL}
                  alt="NPA crest"
                  fill
                  className="object-contain p-0.5"
                  sizes="36px"
                  priority
                />
              </div>
              {!isCollapsed && (
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold tracking-tight text-sidebar-foreground truncate">
                    {NPA_EMR_TITLE}
                  </span>
                </div>
              )}
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className={`text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground ${
                isCollapsed ? 'h-6 w-6' : 'h-7 w-7'
              }`}
              title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
              <span className="sr-only">Toggle Sidebar</span>
            </Button>
          </div>
        </SidebarHeader>

        <SidebarContent className="bg-sidebar">
          {/* Overview Dashboard (global) - permission-gated */}
          {hydrated && currentUser && canViewOverviewDashboard && (
            <SidebarGroup>
              {!isCollapsed && (
                <SidebarGroupLabel className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                  Overview
                </SidebarGroupLabel>
              )}
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive("/dashboard")}
                      tooltip="Overview Dashboard"
                      className="text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary"
                    >
                      <Link href="/dashboard">
                        <LayoutDashboard className="h-4 w-4" />
                        {!isCollapsed && <span>Overview Dashboard</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}

          {/* Module Sections */}
          {filteredMenuSections.map((section) => {
            const filteredItems = getFilteredMenuItems(section);
            // Only show section if it has items the user can access
            if (filteredItems.length === 0) return null;

            return (
              <SidebarGroup key={section.label}>
                {isCollapsed ? (
                  // Collapsed: Show only icons for first item of each section as a quick access
                  <SidebarGroupContent>
                    <SidebarMenu>
                      <SidebarMenuItem>
                        <SidebarMenuButton
                          asChild
                          isActive={pathname.startsWith(section.basePath)}
                          tooltip={section.label}
                          className={cn("text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent", section.activeColor)}
                        >
                          <Link href={filteredItems[0].href}>
                            <section.icon className={cn("h-4 w-4", section.color)} />
                          </Link>
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    </SidebarMenu>
                  </SidebarGroupContent>
                ) : (
                  // Expanded: Show collapsible groups
                  <Collapsible open={openSections[section.label]} onOpenChange={() => toggleSection(section.label)}>
                    <SidebarGroupLabel asChild className="text-sidebar-foreground/50 text-xs uppercase tracking-wider">
                      <CollapsibleTrigger className="group/collapsible flex items-center justify-between w-full cursor-pointer hover:text-sidebar-foreground">
                        <span className="flex items-center gap-2">
                          <section.icon className={cn("h-3.5 w-3.5", section.color)} />
                          {section.label}
                        </span>
                        <ChevronDown className="h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </CollapsibleTrigger>
                    </SidebarGroupLabel>
                    <CollapsibleContent>
                      <SidebarGroupContent>
                        <SidebarMenu>
                          {filteredItems.map((item) => (
                            <SidebarMenuItem key={item.label}>
                              <SidebarMenuButton
                                asChild
                                isActive={isItemActive(item.href, section.basePath)}
                                tooltip={item.label}
                                className={cn("text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent", section.activeColor)}
                              >
                                <Link href={item.href}>
                                  <item.icon className={cn("h-4 w-4", section.color)} />
                                  <span>{item.label}</span>
                                </Link>
                              </SidebarMenuButton>
                            </SidebarMenuItem>
                          ))}
                        </SidebarMenu>
                      </SidebarGroupContent>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </SidebarGroup>
            );
          })}

          {/* Help - Always visible */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive("/help")} tooltip="Help & Support" className="text-sidebar-foreground/80 hover:text-sidebar-foreground hover:bg-sidebar-accent data-[active=true]:bg-sidebar-primary/10 data-[active=true]:text-sidebar-primary">
                    <Link href="/help">
                      <HelpCircle className="h-4 w-4" />
                      {!isCollapsed && <span>Help & Support</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

        </SidebarContent>
      </Sidebar>
    </TooltipProvider>
  );
}
