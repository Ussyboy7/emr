"use client";

import { useEffect, useMemo, useState } from "react";
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { toast } from "sonner";
import {
  AlertTriangle,
  ChevronRight,
  Globe,
  Key,
  Loader2,
  Lock,
  Search,
  Shield,
} from "lucide-react";
import { adminService, type Role as ApiRole } from "@/lib/services";
import {
  ALL_PAGE_PERMISSIONS,
  convertPermissionsFromBackend,
  isGlobalUserPage,
  normalizeRolePagePaths,
  PAGE_MODULE_ORDER,
  type PagePermission,
} from "@/lib/page-permissions";

type PageGrantStatus = "global" | "granted" | "unassigned";

function pageGrantStatus(pageId: string, grantCount: number): PageGrantStatus {
  if (isGlobalUserPage(pageId)) return "global";
  if (grantCount > 0) return "granted";
  return "unassigned";
}

function borderClassForStatus(status: PageGrantStatus): string {
  switch (status) {
    case "global":
      return "border-l-sky-500";
    case "granted":
      return "border-l-emerald-500";
    default:
      return "border-l-rose-500";
  }
}

function iconBgForStatus(status: PageGrantStatus): string {
  switch (status) {
    case "global":
      return "bg-sky-500/10 text-sky-600 dark:text-sky-400";
    case "granted":
      return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
    default:
      return "bg-rose-500/10 text-rose-600 dark:text-rose-400";
  }
}

type RoleLite = {
  id: number;
  name: string;
  description: string;
  type: ApiRole["type"];
  is_active: boolean;
  pages: string[];
};

/**
 * Permissions Catalog tab.
 *
 * Renders the full list of pages the EMR exposes (from
 * `ALL_PAGE_PERMISSIONS`), grouped by module, with the count of Access
 * Roles that currently grant each one. Clicking a row opens a side panel
 * where every Access Role can be ticked / unticked for that page and
 * saved in one go.
 *
 * It also surfaces "empty roles" — Access Roles with zero pages — at the
 * top of the tab. That's the silent-failure trap that locks newly created
 * users out with the "Access not configured" screen, so flagging it
 * prominently here makes the misconfiguration obvious.
 */
export function PermissionsCatalogTab() {
  const [roles, setRoles] = useState<RoleLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("all");
  const [usageFilter, setUsageFilter] = useState<"all" | "used" | "unused">("all");

  const [activePage, setActivePage] = useState<PagePermission | null>(null);
  const [pendingRoleIds, setPendingRoleIds] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await adminService.getRoles({ page_size: MAX_LIST_PAGE_SIZE });
      const transformed: RoleLite[] = (response.results || []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description || "",
        type: r.type,
        is_active: r.is_active,
        pages: normalizeRolePagePaths(convertPermissionsFromBackend(r.permissions)),
      }));
      transformed.sort((a, b) => a.name.localeCompare(b.name));
      setRoles(transformed);
    } catch (err) {
      const message = (err as Error)?.message || "Failed to load roles";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  // page → list of roles granting it
  const rolesByPage = useMemo(() => {
    const map = new Map<string, RoleLite[]>();
    for (const role of roles) {
      for (const path of role.pages) {
        if (!map.has(path)) map.set(path, []);
        map.get(path)!.push(role);
      }
    }
    return map;
  }, [roles]);

  // Pages grouped by module, after applying filters.
  const groupedPages = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byModule: Record<string, PagePermission[]> = {};
    for (const page of ALL_PAGE_PERMISSIONS) {
      if (moduleFilter !== "all" && page.module !== moduleFilter) continue;
      if (q) {
        const haystack = `${page.name} ${page.id} ${page.description}`.toLowerCase();
        if (!haystack.includes(q)) continue;
      }
      const grantCount = rolesByPage.get(page.id)?.length ?? 0;
      const status = pageGrantStatus(page.id, grantCount);
      if (usageFilter === "used" && status !== "granted") continue;
      if (usageFilter === "unused" && status !== "unassigned") continue;
      if (!byModule[page.module]) byModule[page.module] = [];
      byModule[page.module].push(page);
    }
    return byModule;
  }, [moduleFilter, rolesByPage, search, usageFilter]);

  const orderedModules = useMemo(() => {
    const known = PAGE_MODULE_ORDER.filter((m) => groupedPages[m]?.length);
    const unknown = Object.keys(groupedPages).filter((m) => !PAGE_MODULE_ORDER.includes(m as (typeof PAGE_MODULE_ORDER)[number]));
    return [...known, ...unknown.sort()];
  }, [groupedPages]);

  const pageStats = useMemo(() => {
    let global = 0;
    let granted = 0;
    let unassigned = 0;
    for (const page of ALL_PAGE_PERMISSIONS) {
      const grantCount = rolesByPage.get(page.id)?.length ?? 0;
      const status = pageGrantStatus(page.id, grantCount);
      if (status === "global") global += 1;
      else if (status === "granted") granted += 1;
      else unassigned += 1;
    }
    return {
      total: ALL_PAGE_PERMISSIONS.length,
      global,
      granted,
      unassigned,
    };
  }, [rolesByPage]);

  const emptyRoles = useMemo(
    () => roles.filter((r) => r.is_active && r.pages.length === 0),
    [roles],
  );

  const openPanel = (page: PagePermission) => {
    setActivePage(page);
    setPendingRoleIds(new Set(rolesByPage.get(page.id)?.map((r) => r.id) ?? []));
  };

  const closePanel = () => {
    if (saving) return;
    setActivePage(null);
    setPendingRoleIds(new Set());
  };

  const toggleRole = (roleId: number) => {
    setPendingRoleIds((prev) => {
      const next = new Set(prev);
      if (next.has(roleId)) next.delete(roleId);
      else next.add(roleId);
      return next;
    });
  };

  const savePanel = async () => {
    if (!activePage) return;
    const initialIds = new Set(rolesByPage.get(activePage.id)?.map((r) => r.id) ?? []);
    const toGrant: RoleLite[] = [];
    const toRevoke: RoleLite[] = [];
    for (const role of roles) {
      const wasGranted = initialIds.has(role.id);
      const willBeGranted = pendingRoleIds.has(role.id);
      if (!wasGranted && willBeGranted) toGrant.push(role);
      if (wasGranted && !willBeGranted) toRevoke.push(role);
    }
    if (toGrant.length === 0 && toRevoke.length === 0) {
      closePanel();
      return;
    }
    setSaving(true);
    try {
      const updates = [...toGrant, ...toRevoke].map(async (role) => {
        const nextPages = new Set(role.pages);
        if (toGrant.includes(role)) nextPages.add(activePage.id);
        if (toRevoke.includes(role)) nextPages.delete(activePage.id);
        await adminService.updateRole(role.id, {
          permissions: { pages: Array.from(nextPages) },
        });
      });
      await Promise.all(updates);
      toast.success(
        `Updated ${toGrant.length + toRevoke.length} role${
          toGrant.length + toRevoke.length === 1 ? "" : "s"
        }`,
      );
      setActivePage(null);
      setPendingRoleIds(new Set());
      void refresh();
    } catch (err) {
      toast.error((err as Error)?.message || "Failed to save permission changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {emptyRoles.length > 0 && (
        <Card className="border-l-4 border-l-amber-500 bg-amber-50/40 dark:bg-amber-950/10">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {emptyRoles.length} active role
                {emptyRoles.length === 1 ? "" : "s"} grant no pages
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                Users assigned to these roles will land on "Access not configured" at sign-in. Open the role and tick at least one page below.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {emptyRoles.map((r) => (
                  <Badge
                    key={r.id}
                    variant="outline"
                    className="bg-amber-100 dark:bg-amber-900/40 text-amber-900 dark:text-amber-100 border-amber-300"
                  >
                    {r.name}
                  </Badge>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-purple-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pages</p>
                <p className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
                  {pageStats.total}
                </p>
              </div>
              <Key className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-emerald-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">On Access Roles</p>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                  {pageStats.granted}
                </p>
              </div>
              <Lock className="h-8 w-8 text-emerald-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-sky-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Global (all users)</p>
                <p className="text-2xl sm:text-3xl font-bold text-sky-600 dark:text-sky-400">
                  {pageStats.global}
                </p>
              </div>
              <Globe className="h-8 w-8 text-sky-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Needs assignment</p>
                <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">
                  {pageStats.unassigned}
                </p>
              </div>
              <AlertTriangle className="h-8 w-8 text-rose-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
            <div className="relative flex-1 min-w-[min(100%,16rem)]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Search permissions by name or path…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger className="w-[170px]">
                  <SelectValue placeholder="All modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All modules</SelectItem>
                  {PAGE_MODULE_ORDER.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={usageFilter}
                onValueChange={(v) => setUsageFilter(v as typeof usageFilter)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All usage</SelectItem>
                  <SelectItem value="used">On ≥ 1 access role</SelectItem>
                  <SelectItem value="unused">Needs role assignment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
            <p>Loading permissions…</p>
          </CardContent>
        </Card>
      ) : error ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-500" />
            <p className="text-rose-600 dark:text-rose-400">{error}</p>
            <Button variant="outline" className="mt-4" onClick={() => void refresh()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : orderedModules.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Key className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No permissions match your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {orderedModules.map((moduleName) => {
            const pages = groupedPages[moduleName] || [];
            return (
              <div key={moduleName} className="space-y-3">
                <div className="flex items-center gap-2 px-1">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <h3 className="font-semibold text-foreground">{moduleName}</h3>
                  <Badge variant="secondary" className="text-xs">
                    {pages.length} page{pages.length === 1 ? "" : "s"}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {pages.map((page) => {
                    const granters = rolesByPage.get(page.id) ?? [];
                    const grantCount = granters.length;
                    const status = pageGrantStatus(page.id, grantCount);
                    const StatusIcon =
                      status === "global" ? Globe : status === "granted" ? Lock : AlertTriangle;
                    return (
                      <Card
                        key={page.id}
                        className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer ${borderClassForStatus(status)}`}
                        onClick={() => openPanel(page)}
                      >
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBgForStatus(status)}`}
                            >
                              <StatusIcon className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                  <span className="font-semibold text-foreground truncate">
                                    {page.name}
                                  </span>
                                  {status === "global" ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 border-sky-300 text-sky-700 dark:text-sky-400"
                                    >
                                      Global
                                    </Badge>
                                  ) : grantCount === 0 ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 py-0 border-rose-300 text-rose-700 dark:text-rose-400"
                                    >
                                      Needs role
                                    </Badge>
                                  ) : (
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                      {grantCount} role{grantCount === 1 ? "" : "s"}
                                    </Badge>
                                  )}
                                </div>
                                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                                <code className="font-mono text-[11px]">{page.id}</code>
                                {page.description ? (
                                  <>
                                    <span>•</span>
                                    <span className="truncate">{page.description}</span>
                                  </>
                                ) : null}
                              </div>
                              {grantCount > 0 ? (
                                <div className="mt-1.5 flex flex-wrap gap-1">
                                  {granters.slice(0, 6).map((r) => (
                                    <Badge
                                      key={r.id}
                                      variant="outline"
                                      className={`text-[10px] ${r.is_active ? "" : "opacity-60"}`}
                                    >
                                      {r.name}
                                    </Badge>
                                  ))}
                                  {granters.length > 6 ? (
                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                      +{granters.length - 6} more
                                    </Badge>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={activePage != null} onOpenChange={(o) => !o && closePanel()}>
        <DialogContent className={MODAL_SIZES.lg}>
          {activePage ? (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Key className="h-4 w-4 text-purple-500" />
                  {activePage.name}
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="space-y-1 text-left">
                    <code className="text-[11px] font-mono block text-muted-foreground">
                      {activePage.id}
                    </code>
                    {activePage.description ? (
                      <span className="text-xs block">{activePage.description}</span>
                    ) : null}
                    <span className="text-xs block">
                      Module: <span className="font-medium text-foreground">{activePage.module}</span>
                    </span>
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                {isGlobalUserPage(activePage.id) ? (
                  <Card className="border-l-4 border-l-sky-500 bg-sky-50/40 dark:bg-sky-950/10">
                    <CardContent className="p-3 text-xs text-muted-foreground">
                      This page is <span className="font-medium text-foreground">global</span> — every
                      signed-in user can open it without an access role. Role ticks below are optional
                      (catalog only).
                    </CardContent>
                  </Card>
                ) : null}
                <p className="text-sm font-medium">
                  Tick the access roles that should grant this page:
                </p>
                <div className="border rounded-lg divide-y max-h-[50vh] overflow-y-auto">
                  {roles.length === 0 ? (
                    <div className="p-4 text-sm text-muted-foreground text-center">
                      No access roles exist yet.
                    </div>
                  ) : (
                    roles
                      .filter((role) => role.is_active || pendingRoleIds.has(role.id))
                      .map((role) => {
                      const checked = pendingRoleIds.has(role.id);
                      return (
                        <label
                          key={role.id}
                          className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleRole(role.id)}
                            disabled={saving}
                            className="mt-0.5"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate">
                                {role.name}
                              </span>
                              {!role.is_active ? (
                                <Badge variant="secondary" className="text-[10px]">
                                  Inactive
                                </Badge>
                              ) : null}
                              <Badge variant="outline" className="text-[10px]">
                                {role.pages.length} page
                                {role.pages.length === 1 ? "" : "s"}
                              </Badge>
                            </div>
                            {role.description ? (
                              <p className="text-xs text-muted-foreground line-clamp-1">
                                {role.description}
                              </p>
                            ) : null}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="outline" onClick={closePanel} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  onClick={() => void savePanel()}
                  disabled={saving}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save changes
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
