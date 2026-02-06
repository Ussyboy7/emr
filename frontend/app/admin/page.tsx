"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { adminService } from "@/lib/services";
import { toast } from "sonner";
import { GenericMedicationsModal } from "@/components/admin/GenericMedicationsModal";
import {
  Users,
  Shield,
  ShieldCheck,
  Building2,
  DoorOpen,
  Settings,
  ClipboardList,
  Activity,
  AlertTriangle,
  CheckCircle,
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
  Pill,
} from "lucide-react";
import Link from "next/link";

export default function AdminDashboardPage() {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [showGenericsModal, setShowGenericsModal] = useState(false);
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
  const [clinicStatus, setClinicStatus] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
    // Set initial time after mount to avoid hydration mismatch
    setLastUpdated(new Date().toLocaleTimeString());
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
      // Map icon names to React components
      const iconMap: Record<string, any> = {
        'Server': Server,
        'Database': Database,
        'HardDrive': HardDrive,
        'Wifi': Wifi,
      };
      const systemHealthWithIcons = stats.systemHealth.map(system => ({
        ...system,
        icon: iconMap[system.icon] || Server, // Default to Server if icon not found
      }));
      setSystemHealth(systemHealthWithIcons);
      setClinicStatus(stats.clinicStatus);
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
    setLastUpdated(new Date().toLocaleTimeString());
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
            <p className="text-muted-foreground">Enterprise healthcare system monitoring and user management</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            {lastUpdated && (
              <span className="text-sm text-muted-foreground">
                Last updated: {lastUpdated}
              </span>
            )}
          </div>
        </div>

        {/* System Summary */}
        <Card className="bg-gradient-to-r from-slate-900/50 to-slate-800/50 border-slate-700/50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-green-400">System Status: Operational</span>
                </div>
                <div className="h-4 w-px bg-slate-600"></div>
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-400" />
                  <span className="text-sm text-slate-300">{systemStats.onlineNow} active users</span>
                </div>
                <div className="h-4 w-px bg-slate-600"></div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-amber-400" />
                  <span className="text-sm text-slate-300">{systemStats.activeClinics} clinics operational</span>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-400">
                <span>Last updated: {lastUpdated}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Key Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
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
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <span className="text-green-500">{systemStats.activeUsers} active</span>
                    {systemStats.inactiveUsers > 0 && (
                      <>
                        <span className="text-muted-foreground">•</span>
                        <span className="text-muted-foreground">{systemStats.inactiveUsers} inactive</span>
                      </>
                    )}
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
                  <p className="text-sm text-muted-foreground">System Status</p>
                  <p className="text-2xl font-bold text-rose-500">Healthy</p>
                </div>
                <ShieldCheck className="h-8 w-8 text-rose-500/50" />
              </div>
              <div className="mt-2 text-xs">
                <span className="text-green-500">All systems operational</span>
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
                    {usersByRole
                      .filter(role => role.role !== 'No Role') // Filter out "No Role" entries
                      .sort((a, b) => b.count - a.count) // Sort by count descending
                      .map((role) => {
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
                    {recentAuditEvents.slice(0, 5).map((event) => ( // Limit to 5 most recent
                    <div key={event.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <div className={`mt-0.5 ${event.status === "success" ? "text-green-500" : event.status === "warning" ? "text-yellow-500" : "text-red-500"}`}>
                        {event.status === "success" ? <CheckCircle className="h-4 w-4" /> :
                         event.status === "warning" ? <AlertTriangle className="h-4 w-4" /> :
                         <AlertCircle className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{event.user}</span>
                          <Badge variant="outline" className="text-xs capitalize">{event.action}</Badge>
                          <Badge variant="secondary" className="text-xs">{event.module}</Badge>
                        </div>
                        {event.detail && <p className="text-xs text-muted-foreground mt-0.5 truncate">{event.detail}</p>}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{event.time}</span>
                    </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* System Alerts */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">System Alerts</CardTitle>
                  <Link href="/admin/audit">
                    <Button variant="ghost" size="sm">View All <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/10">
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-green-700">All Systems Operational</p>
                        <p className="text-xs text-green-600">No critical issues detected</p>
                      </div>
                      <span className="text-xs text-green-600">Live</span>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/10">
                      <Activity className="h-5 w-5 text-blue-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-blue-700">Backup Completed</p>
                        <p className="text-xs text-blue-600">Daily backup finished successfully</p>
                      </div>
                      <span className="text-xs text-blue-600">2h ago</span>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-500/5 border border-amber-500/10">
                      <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-amber-700">License Expiring Soon</p>
                        <p className="text-xs text-amber-600">System license expires in 30 days</p>
                      </div>
                      <span className="text-xs text-amber-600">Warning</span>
                    </div>
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
                        <div key={clinic.name} className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 border border-border/50">
                          <div className="flex items-center gap-3">
                            <div className={dotClass} />
                            <div>
                              <span className="text-sm font-medium">{clinic.name}</span>
                              <div className="text-xs text-muted-foreground">
                                {clinic.patients} patients • {clinic.doctors} doctors
                              </div>
                            </div>
                          </div>
                          <Badge className={badgeClass}>
                            {clinic.status === 'open' ? 'Operational' : 'Closed'}
                          </Badge>
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
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">System Health</CardTitle>
                  <Link href="/admin/settings">
                    <Button variant="ghost" size="sm">View Details <ChevronRight className="h-4 w-4 ml-1" /></Button>
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
                {!loading && (
                  <div className="space-y-3">
                    {systemHealth.map((system) => {
                      const IconComponent = system.icon;
                      const iconColorClass = getStatusColor(system.status);
                      const iconClass = "h-5 w-5 " + iconColorClass;
                      return (
                        <div key={system.name} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                          <div className="flex items-center gap-3">
                            <IconComponent className={iconClass} />
                            <div>
                              <span className="text-sm font-medium">{system.name}</span>
                              <div className="text-xs text-muted-foreground">Uptime: {system.uptime}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {system.status === "healthy" && (
                              <Badge className="bg-green-500/10 text-green-700 border-green-500/20 text-xs">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Healthy
                              </Badge>
                            )}
                            {system.status === "warning" && (
                              <Badge className="bg-yellow-500/10 text-yellow-700 border-yellow-500/20 text-xs">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Warning
                              </Badge>
                            )}
                            {system.status === "error" && (
                              <Badge className="bg-red-500/10 text-red-700 border-red-500/20 text-xs">
                                <AlertCircle className="h-3 w-3 mr-1" />
                                Error
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Performance Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-6 text-muted-foreground">
                    <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin" />
                    <p>Loading...</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Response Time</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">245ms</span>
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Error Rate</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">0.02%</span>
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Active Sessions</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{systemStats.onlineNow}</span>
                        <Activity className="h-4 w-4 text-blue-500" />
                      </div>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Data Processed</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">2.4GB</span>
                        <span className="text-xs text-muted-foreground">today</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {/* User Management */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">User Management</h4>
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
                    </div>
                  </div>

                  {/* System Management */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">System Management</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href="/admin/rooms">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <DoorOpen className="h-5 w-5 text-cyan-500" />
                          <span className="text-xs">Rooms</span>
                        </Button>
                      </Link>
                      <Link href="/admin/clinics">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <Building2 className="h-5 w-5 text-amber-500" />
                          <span className="text-xs">Clinics</span>
                        </Button>
                      </Link>
                      <Button 
                        variant="outline" 
                        className="w-full h-auto py-3 flex flex-col items-center gap-1" 
                        onClick={() => setShowGenericsModal(true)}
                      >
                        <Pill className="h-5 w-5 text-violet-500" />
                        <span className="text-xs">Generics</span>
                      </Button>
                      <div></div> {/* Empty div to maintain grid layout */}
                    </div>
                  </div>

                  {/* System Tools */}
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-2">System Tools</h4>
                    <div className="grid grid-cols-2 gap-2">
                      <Link href="/admin/settings">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <Settings className="h-5 w-5 text-slate-500" />
                          <span className="text-xs">Settings</span>
                        </Button>
                      </Link>
                      <Link href="/admin/audit">
                        <Button variant="outline" className="w-full h-auto py-3 flex flex-col items-center gap-1">
                          <ClipboardList className="h-5 w-5 text-rose-500" />
                          <span className="text-xs">Audit Trail</span>
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      <GenericMedicationsModal 
        open={showGenericsModal} 
        onOpenChange={setShowGenericsModal} 
      />
    </DashboardLayout>
  );
}

