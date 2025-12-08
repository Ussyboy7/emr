"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { adminService } from "@/lib/services";
import { toast } from "sonner";
import {
  Users,
  Shield,
  Building2,
  DoorOpen,
  Settings,
  ClipboardList,
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  TrendingUp,
  Server,
  Database,
  Wifi,
  HardDrive,
  RefreshCw,
  UserPlus,
  Key,
  Stethoscope,
  ChevronRight,
  AlertCircle,
  Loader2,
} from "lucide-react";
import Link from "next/link";

export default function AdminDashboardPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [systemStats, setSystemStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    inactiveUsers: 0,
    onlineNow: 0,
    totalRoles: 0,
    totalClinics: 0,
    activeClinics: 0,
    totalRooms: 0,
    availableRooms: 0,
    occupiedRooms: 0,
  });
  const [usersByRole, setUsersByRole] = useState<any[]>([]);
  const [recentAuditEvents, setRecentAuditEvents] = useState<any[]>([]);
  const [systemHealth, setSystemHealth] = useState<any[]>([]);
  const [expiringLicenses, setExpiringLicenses] = useState<any[]>([]);
  const [clinicStatus, setClinicStatus] = useState<any[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      const stats = await adminService.getDashboardStats();
      setSystemStats({
        totalUsers: stats.totalUsers,
        activeUsers: stats.activeUsers,
        inactiveUsers: stats.inactiveUsers,
        onlineNow: stats.onlineNow,
        totalRoles: stats.totalRoles,
        totalClinics: stats.totalClinics,
        activeClinics: stats.activeClinics,
        totalRooms: stats.totalRooms,
        availableRooms: stats.availableRooms,
        occupiedRooms: stats.occupiedRooms,
      });
      setUsersByRole(stats.usersByRole);
      setRecentAuditEvents(stats.recentAuditEvents);
      setSystemHealth(stats.systemHealth);
      setExpiringLicenses(stats.expiringLicenses);
      setClinicStatus(stats.clinicStatus);
      setPendingApprovals(stats.pendingApprovals);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
      toast.error('Failed to load dashboard. Please try again.');
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData();
    setIsRefreshing(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "healthy": case "open": case "success": return "text-green-500";
      case "warning": return "text-yellow-500";
      case "error": case "closed": case "failed": return "text-red-500";
      default: return "text-gray-500";
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "high": return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">High</Badge>;
      case "medium": return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Medium</Badge>;
      case "low": return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">Low</Badge>;
      default: return <Badge variant="outline">Normal</Badge>;
    }
  };

  const totalUsers = usersByRole.reduce((sum, r) => sum + r.count, 0);

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Administration Dashboard</h1>
            <p className="text-muted-foreground">System overview and management</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <span className="text-sm text-muted-foreground">
              Last updated: {new Date().toLocaleTimeString()}
            </span>
          </div>
        </div>

        {/* Key Stats */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Loading...</p>
                      <p className="text-2xl font-bold mt-1"><Loader2 className="h-6 w-6 animate-spin" /></p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <>
              <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Users</p>
                      <p className="text-2xl font-bold text-blue-500">{systemStats.totalUsers}</p>
                    </div>
                    <Users className="h-8 w-8 text-blue-500/50" />
                  </div>
                  <div className="mt-2 flex items-center gap-1 text-xs">
                    <span className="text-green-500">{systemStats.activeUsers} active</span>
                  </div>
                </CardContent>
              </Card>

          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Online Now</p>
                  <p className="text-2xl font-bold text-green-500">{systemStats.onlineNow}</p>
                </div>
                <Activity className="h-8 w-8 text-green-500/50" />
              </div>
              <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                <TrendingUp className="h-3 w-3 text-green-500" />
                <span>12% up</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-violet-500/10 to-violet-600/5 border-violet-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Roles</p>
                  <p className="text-2xl font-bold text-violet-500">{systemStats.totalRoles}</p>
                </div>
                <Shield className="h-8 w-8 text-violet-500/50" />
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Clinics</p>
                  <p className="text-2xl font-bold text-amber-500">{systemStats.totalClinics}</p>
                </div>
                <Building2 className="h-8 w-8 text-amber-500/50" />
              </div>
              <div className="mt-2 text-xs">
                <span className="text-green-500">{systemStats.activeClinics} open</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-cyan-500/10 to-cyan-600/5 border-cyan-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rooms</p>
                  <p className="text-2xl font-bold text-cyan-500">{systemStats.totalRooms}</p>
                </div>
                <DoorOpen className="h-8 w-8 text-cyan-500/50" />
              </div>
              <div className="mt-2 text-xs">
                <span className="text-green-500">{systemStats.availableRooms} available</span>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-rose-500">
                    {pendingApprovals.reduce((sum, p) => sum + p.count, 0)}
                  </p>
                </div>
                <Clock className="h-8 w-8 text-rose-500/50" />
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Users by Role */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Users by Role</CardTitle>
                  <Link href="/admin/users">
                    <Button variant="ghost" size="sm">View All <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : usersByRole.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No role data available</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {usersByRole.map((role) => {
                      const percentage = totalUsers > 0 ? (role.count / totalUsers) * 100 : 0;
                      return (
                        <div key={role.role} className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${role.color}`} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <span className="text-sm truncate">{role.role}</span>
                              <span className="text-sm font-medium">{role.count}</span>
                            </div>
                            <Progress value={percentage} className="h-1.5 mt-1" />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Audit Activity */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Recent Audit Activity</CardTitle>
                  <Link href="/admin/audit">
                    <Button variant="ghost" size="sm">View All <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : recentAuditEvents.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No recent activity</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentAuditEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <div className={`mt-0.5 ${event.status === "success" ? "text-green-500" : "text-red-500"}`}>
                        {event.status === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{event.user}</span>
                          <Badge variant="outline" className="text-xs">{event.action}</Badge>
                          <Badge variant="secondary" className="text-xs">{event.module}</Badge>
                        </div>
                        {event.detail && <p className="text-xs text-muted-foreground mt-0.5">{event.detail}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{event.time}</span>
                    </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Clinic Status */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Clinic Status</CardTitle>
                  <Link href="/admin/clinics">
                    <Button variant="ghost" size="sm">Manage <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                )}
                {!loading && clinicStatus.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No clinics found</p>
                  </div>
                )}
                {!loading && clinicStatus.length > 0 && (
                  <div className="space-y-2">
                    {clinicStatus.map((clinic) => {
                      const statusBgClass = clinic.status === "open" ? "bg-green-500" : "bg-red-500";
                      const badgeClass = clinic.status === "open" 
                        ? "bg-green-500 bg-opacity-10 text-green-500" 
                        : "bg-red-500 bg-opacity-10 text-red-500";
                      const dotClass = "w-2 h-2 rounded-full " + statusBgClass;
                      return (
                        <div key={clinic.name} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                          <div className="flex items-center gap-3">
                            <div className={dotClass} />
                            <span className="text-sm">{clinic.name}</span>
                          </div>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" /> {clinic.patients}</span>
                            <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" /> {clinic.doctors}</span>
                            <Badge className={badgeClass}>
                              {clinic.status}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* System Health */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">System Health</CardTitle>
              </CardHeader>
              <CardContent>
                {loading && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                )}
                {!loading && (
                  <div className="space-y-3">
                    {systemHealth.map((system) => {
                      const IconComponent = system.icon;
                      const iconColorClass = getStatusColor(system.status);
                      const iconClass = "h-5 w-5 " + iconColorClass;
                      return (
                        <div key={system.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                          <div className="flex items-center gap-3">
                            <IconComponent className={iconClass} />
                            <span className="text-sm">{system.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{system.uptime}</span>
                            {system.status === "healthy" && (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            )}
                            {system.status !== "healthy" && (
                              <AlertTriangle className="h-4 w-4 text-yellow-500" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Pending Approvals */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Pending Approvals</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : pendingApprovals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No pending approvals</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {pendingApprovals.map((approval) => (
                    <div key={approval.type} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{approval.type}</span>
                        {getPriorityBadge(approval.priority)}
                      </div>
                      <Badge variant="secondary">{approval.count}</Badge>
                    </div>
                    ))}
                  </div>
                )}
                {pendingApprovals.length > 0 && (
                  <Button className="w-full mt-4" variant="outline" size="sm">Review All Pending</Button>
                )}
              </CardContent>
            </Card>

            {/* Expiring Licenses */}
            <Card className="border-yellow-500/20 bg-yellow-500/5">
              <CardHeader className="pb-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-yellow-500" />
                  <CardTitle className="text-lg">Expiring Licenses</CardTitle>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : expiringLicenses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No expiring licenses</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {expiringLicenses.map((license) => (
                    <div key={license.name} className="p-2 rounded-lg bg-background/50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{license.name}</span>
                        <Badge className={license.daysLeft <= 20 ? "bg-red-500/10 text-red-500" : "bg-yellow-500/10 text-yellow-500"}>
                          {license.daysLeft} days
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{license.type} • Expires {license.expires}</p>
                    </div>
                    ))}
                  </div>
                )}
                <Link href="/admin/users">
                  <Button className="w-full mt-4" variant="outline" size="sm">Manage Staff Licenses</Button>
                </Link>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/admin/users">
                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                      <UserPlus className="h-5 w-5 text-blue-500" />
                      <span className="text-xs">Add User</span>
                    </Button>
                  </Link>
                  <Link href="/admin/roles">
                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                      <Key className="h-5 w-5 text-violet-500" />
                      <span className="text-xs">Manage Roles</span>
                    </Button>
                  </Link>
                  <Link href="/admin/rooms">
                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                      <DoorOpen className="h-5 w-5 text-cyan-500" />
                      <span className="text-xs">Rooms</span>
                    </Button>
                  </Link>
                  <Link href="/admin/settings">
                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                      <Settings className="h-5 w-5 text-slate-500" />
                      <span className="text-xs">Settings</span>
                    </Button>
                  </Link>
                  <Link href="/admin/clinics">
                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                      <Building2 className="h-5 w-5 text-amber-500" />
                      <span className="text-xs">Clinics</span>
                    </Button>
                  </Link>
                  <Link href="/admin/audit">
                    <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                      <ClipboardList className="h-5 w-5 text-rose-500" />
                      <span className="text-xs">Audit Trail</span>
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

