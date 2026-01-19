"use client";

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { physioService } from '@/lib/services';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  Activity, Users, Clock, CheckCircle2, Calendar, UserCheck,
  TrendingUp, AlertCircle, Plus, Eye, Stethoscope, Loader2
} from 'lucide-react';

interface PhysioStats {
  total_orders: number;
  pending_orders: number;
  completed_sessions: number;
  active_sessions: number;
  total_sessions: number;
}

export default function PhysiotherapyPage() {
  const [stats, setStats] = useState<PhysioStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  useEffect(() => {
    const loadStats = async () => {
      try {
        setLoading(true);
        setError(null);
        const statsData = await physioService.getStats();
        setStats(statsData);
      } catch (err: any) {
        console.error('Error loading physiotherapy stats:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load statistics. Please try again.');
          toast.error('Failed to load physiotherapy statistics');
        }
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  const quickActions = [
    {
      title: 'View Pool Queue',
      description: 'Manage pending physiotherapy orders',
      href: '/physiotherapy/pool-queue',
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-500/10',
      border: 'border-blue-500/20'
    },
    {
      title: 'Completed Sessions',
      description: 'View completed physiotherapy sessions',
      href: '/physiotherapy/completed',
      icon: CheckCircle2,
      color: 'text-emerald-500',
      bg: 'bg-emerald-500/10',
      border: 'border-emerald-500/20'
    },
    {
      title: 'Active Sessions',
      description: 'Monitor ongoing physiotherapy sessions',
      href: '/physiotherapy/pool-queue?filter=active',
      icon: Activity,
      color: 'text-orange-500',
      bg: 'bg-orange-500/10',
      border: 'border-orange-500/20'
    }
  ];

  const workflowSteps = [
    { step: 1, title: 'Order Received', description: 'Doctor creates physiotherapy order', icon: Stethoscope },
    { step: 2, title: 'Assessment', description: 'Initial patient assessment', icon: UserCheck },
    { step: 3, title: 'Treatment Plan', description: 'Develop individualized treatment plan', icon: Calendar },
    { step: 4, title: 'Sessions', description: 'Conduct physiotherapy sessions', icon: Activity },
    { step: 5, title: 'Progress Review', description: 'Monitor and adjust treatment', icon: TrendingUp },
    { step: 6, title: 'Completion', description: 'Treatment completion and recommendations', icon: CheckCircle2 }
  ];

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6 space-y-6">
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading physiotherapy dashboard...</span>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6 space-y-6">
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-6 w-6 text-red-500" />
                <div>
                  <p className="text-red-600 dark:text-red-400 font-medium">Error Loading Dashboard</p>
                  <p className="text-red-600 dark:text-red-400 text-sm mt-1">{error}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <Activity className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Physiotherapy Department</h1>
                  <p className="text-blue-100">Physical rehabilitation and therapeutic services management</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-white text-blue-600 hover:bg-blue-50"
                  onClick={() => window.location.href = '/physiotherapy/pool-queue'}
                >
                  <Users className="h-4 w-4 mr-2" />
                  Patient Pool
                </Button>
                <Button
                  variant="outline"
                  className="border-white text-white hover:bg-white/20"
                  onClick={() => window.location.href = '/physiotherapy/completed'}
                >
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Completed
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Overview */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500" />
            Today's Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats?.total_orders || 0}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Orders</p>
                  <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats?.pending_orders || 0}</p>
                </div>
                <Clock className="h-8 w-8 text-orange-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active Sessions</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats?.active_sessions || 0}</p>
                </div>
                <Activity className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed Sessions</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats?.completed_sessions || 0}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-l-4 border-l-indigo-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Sessions</p>
                  <p className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">{stats?.total_sessions || 0}</p>
                </div>
                <Calendar className="h-8 w-8 text-indigo-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-3">
          {quickActions.map((action, index) => (
            <Link key={index} href={action.href}>
              <Card className={`cursor-pointer hover:shadow-md transition-shadow border-2 ${action.border}`}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${action.bg}`}>
                      <action.icon className={`h-6 w-6 ${action.color}`} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{action.title}</h3>
                      <p className="text-sm text-muted-foreground">{action.description}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Physiotherapy Workflow */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              Physiotherapy Workflow
            </CardTitle>
            <CardDescription>Standard process for physiotherapy treatment and rehabilitation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {workflowSteps.map((step, index) => (
                <div key={index} className="flex items-start gap-3 p-4 rounded-lg bg-muted/30">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center text-sm font-medium">
                    {step.step}
                  </div>
                  <div>
                    <h4 className="font-medium text-foreground">{step.title}</h4>
                    <p className="text-sm text-muted-foreground">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Activity Placeholder */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>Latest physiotherapy orders and session updates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Recent activity will appear here once physiotherapy orders are created.</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}