"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { NotificationBell } from "../notifications/NotificationBell";
import { ThemeToggle } from "./ThemeToggle";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useClinic } from "@/hooks/use-clinic";
import { NPA_LOGO_URL, NPA_EMR_TITLE } from "@/lib/branding";
import { formatDisplayDateMedium, formatDisplayTime } from "@/lib/dates-core";
import { hasTokens, logout } from "@/lib/api-client";
import { getHomeRouteForUser, isPathAllowedByPages } from "@/lib/home-route";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { LogOut, Shield, Clock, Calendar, Bell, HelpCircle, Settings, Stethoscope, LayoutDashboard } from "lucide-react";

export const TopBar = () => {
  const router = useRouter();
  const { currentUser, hydrated } = useCurrentUser();
  const { activeClinicId, activeClinicName, clinics, isMultiClinic, switchClinic, loading: clinicLoading } = useClinic();
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const homeRoute = getHomeRouteForUser(currentUser) || "/no-access";
  const canViewOverviewDashboard =
    Boolean(currentUser?.isSuperuser) ||
    isPathAllowedByPages("/dashboard", currentUser?.permissions ?? []);
  const authenticated = useMemo(() => hydrated && !!currentUser && hasTokens(), [currentUser, hydrated]);

  useEffect(() => {
    setMounted(true);
    // Set initial time only on client
    setCurrentTime(new Date());
  }, []);

  // Update the clock once per wall-clock minute, aligned to the
  // :00-second boundary. A plain `setInterval(..., 60_000)` drifts
  // relative to the wall clock (it fires every 60 s from mount), so a
  // page loaded at HH:MM:35 keeps showing HH:MM until HH:(MM+1):35 —
  // i.e. the display can be up to ~59 seconds behind. By scheduling
  // the first tick at the next minute boundary and then running a
  // 60 s interval, the clock flips at HH:(MM+1):00, HH:(MM+2):00, …
  // matching the wall clock to within a second.
  useEffect(() => {
    if (!mounted) return;

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const tick = () => setCurrentTime(new Date());

    const now = new Date();
    const msUntilNextMinute =
      60_000 - (now.getSeconds() * 1000 + now.getMilliseconds());

    const timeoutId = setTimeout(() => {
      tick();
      intervalId = setInterval(tick, 60_000);
    }, msUntilNextMinute);

    return () => {
      clearTimeout(timeoutId);
      if (intervalId !== null) clearInterval(intervalId);
    };
  }, [mounted]);

  // Pull the clock forward when the tab regains focus — otherwise a
  // backgrounded tab can have its setInterval throttled and stay
  // stuck minutes behind the wall clock until the user manually
  // refreshes.
  useEffect(() => {
    if (!mounted) return;
    const onVisibility = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        setCurrentTime(new Date());
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [mounted]);

  const handleLogout = async () => {
    await logout();
    window.location.replace("/login");
  };

  // Format time as HH:MM AM/PM
  const formatTime = (date: Date) => formatDisplayTime(date);

  const formatDate = (date: Date) => formatDisplayDateMedium(date);

  const getUserRoleDisplay = () => {
    if (!currentUser) return 'User';
    return currentUser.systemRole || '';
  };

  const getUserInitials = () => {
    if (!currentUser?.name) return 'U';
    return currentUser.name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-sidebar-border bg-sidebar overflow-hidden print:hidden">
      <div className="flex h-12 items-center gap-2 md:gap-3 px-3 md:px-4">
        {/* Mobile Sidebar Toggle */}
        <SidebarTrigger className="md:hidden h-8 w-8 text-sidebar-foreground hover:bg-sidebar-accent" />

        {/* Logo & Title - Only show on mobile */}
        <Link href={homeRoute} className="flex items-center gap-2 md:hidden min-w-0">
          <div className="relative h-8 w-8 flex-shrink-0 overflow-hidden rounded-lg shadow-sm ring-1 ring-sidebar-primary/30 bg-white">
            <Image
              src={NPA_LOGO_URL}
              alt={`${NPA_EMR_TITLE} crest`}
              fill
              className="object-contain p-0.5"
              sizes="32px"
              priority
            />
          </div>
          <span className="text-sm font-semibold truncate text-sidebar-foreground">{NPA_EMR_TITLE}</span>
        </Link>

        {/* Date & Time - Desktop (on the LEFT like NPA-ECM) */}
        <div className="hidden md:flex items-center gap-3 text-xs text-sidebar-foreground/70">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            <span className="font-medium tabular-nums text-sidebar-foreground" suppressHydrationWarning>
              {currentTime ? formatTime(currentTime) : '--:-- --'}
            </span>
          </div>
          <div className="h-4 w-px bg-sidebar-border" />
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5" />
            <span suppressHydrationWarning>
              {currentTime ? formatDate(currentTime) : '-- -- --'}
            </span>
          </div>
        </div>

        {/* Clinic Switcher */}
        {isMultiClinic && (
          <div className="flex items-center">
            <div className="h-4 w-px bg-sidebar-border mr-2 hidden md:block" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 text-sidebar-foreground hover:bg-sidebar-accent px-1.5 md:px-2">
                  <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="max-w-[80px] md:max-w-[120px] truncate font-medium">
                    {clinicLoading ? "..." : activeClinicName || "Select clinic"}
                  </span>
                  <svg className="h-3 w-3 text-sidebar-foreground/50 hidden md:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Switch clinic
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {clinics.map((clinic) => (
                  <DropdownMenuItem
                    key={clinic.id}
                    onClick={() => switchClinic(clinic.id)}
                    className={clinic.id === activeClinicId ? "bg-accent font-medium" : ""}
                  >
                    <div
                      className={`h-1.5 w-1.5 rounded-full flex-shrink-0 mr-2 ${
                        clinic.id === activeClinicId ? "bg-emerald-400" : "bg-sidebar-foreground/30"
                      }`}
                    />
                    <span className="truncate">{clinic.name}</span>
                    {clinic.id === activeClinicId && (
                      <svg className="h-4 w-4 ml-auto text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Right Actions */}
        <div className="flex items-center gap-1 md:gap-1.5">
          {/* User Info - Desktop only */}
          {hydrated && currentUser && (
            <div className="hidden lg:flex items-center gap-2 text-xs min-w-0 max-w-[140px] mr-1">
              <div className="text-right min-w-0">
                <div className="font-medium text-sidebar-foreground truncate">
                  {currentUser.name || 'User'}
                </div>
                <div className="flex items-center justify-end gap-1 text-sidebar-foreground/60">
                  <Shield className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate">{getUserRoleDisplay()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Notifications */}
          <NotificationBell />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Profile Dropdown */}
          {!hydrated ? (
            <div className="h-8 w-8 rounded-full bg-sidebar-accent animate-pulse" />
          ) : authenticated && currentUser ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0 hover:bg-sidebar-accent">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-sidebar-primary to-sidebar-primary/70 flex items-center justify-center text-sidebar-primary-foreground font-medium text-xs ring-2 ring-sidebar-primary/30">
                    {getUserInitials()}
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
                {/* User Info Header */}
                <DropdownMenuLabel className="font-normal pb-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center text-primary-foreground font-medium text-sm flex-shrink-0">
                      {getUserInitials()}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <p className="text-sm font-semibold leading-none truncate">{currentUser.name || 'User'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{currentUser.email}</p>
                      {currentUser.systemRole && (
                        <Badge variant="secondary" className="w-fit mt-1.5 text-[10px]">
                          <Shield className="h-3 w-3 mr-1" />
                          {currentUser.systemRole}
                        </Badge>
                      )}
                    </div>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                
                {/* Quick Actions */}
                <DropdownMenuItem asChild>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      router.push(homeRoute);
                    }}
                    className="flex items-center cursor-pointer w-full text-left"
                  >
                    <Stethoscope className="h-4 w-4 mr-2" />
                    Home
                  </button>
                </DropdownMenuItem>
                {canViewOverviewDashboard && (
                  <DropdownMenuItem asChild>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        router.push('/dashboard');
                      }}
                      className="flex items-center cursor-pointer w-full text-left"
                    >
                      <LayoutDashboard className="h-4 w-4 mr-2" />
                      Overview Dashboard
                    </button>
                  </DropdownMenuItem>
                )}
                  <DropdownMenuItem asChild>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        router.push('/notifications');
                      }}
                      className="flex items-center cursor-pointer w-full text-left"
                    >
                      <Bell className="h-4 w-4 mr-2" />
                      Notifications
                    </button>
                  </DropdownMenuItem>
                 <DropdownMenuSeparator />

                 {/* Settings */}
                  <DropdownMenuItem asChild>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        router.push('/settings');
                      }}
                      className="flex items-center cursor-pointer w-full text-left"
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Settings
                    </button>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        router.push('/help');
                      }}
                      className="flex items-center cursor-pointer w-full text-left"
                    >
                      <HelpCircle className="h-4 w-4 mr-2" />
                      Help & Support
                    </button>
                  </DropdownMenuItem>
                <DropdownMenuSeparator />
                
                {/* Logout */}
                <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive cursor-pointer">
                  <LogOut className="h-4 w-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : authenticated ? (
            <Button
              onClick={handleLogout}
              variant="ghost"
              size="sm"
              className="text-xs h-8 text-sidebar-foreground hover:bg-sidebar-accent"
            >
              Logout
            </Button>
          ) : (
            <Button asChild variant="ghost" size="sm" className="text-xs h-8 text-sidebar-foreground hover:bg-sidebar-accent">
              <Link href="/login">Login</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
};
