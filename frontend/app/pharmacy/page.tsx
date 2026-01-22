"use client";

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Pill, ClipboardList, Package, Clock, CheckCircle2, AlertTriangle, Activity, ArrowRight, UserCheck, Database, TrendingUp } from 'lucide-react';
import Link from 'next/link';

export default function PharmacyPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <Pill className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Pharmacy Department</h1>
                  <p className="text-violet-100">Prescription management, dispensing, and inventory control</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-white text-violet-600 hover:bg-violet-50"
                  onClick={() => window.location.href = '/pharmacy/prescriptions'}
                >
                  <ClipboardList className="h-4 w-4 mr-2" />
                  Manage Prescriptions
                </Button>
                <Button
                  variant="outline"
                  className="border-white text-white hover:bg-white/20"
                  onClick={() => window.location.href = '/pharmacy/inventory'}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Inventory
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Overview */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Today's Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Loading...</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <p className="text-3xl font-bold text-muted-foreground">--</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className={`border-l-4 ${0 > 0 ? 'border-l-amber-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pending Rx</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className={`h-5 w-5 ${0 > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-3xl font-bold ${0 > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All caught up!</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${0 === 0 ? 'border-l-green-500' : 'border-l-emerald-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Dispensed Today</p>
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className={`h-5 w-5 ${0 === 0 ? 'text-green-500 dark:text-green-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
                          <p className={`text-3xl font-bold ${0 === 0 ? 'text-green-600 dark:text-green-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No prescriptions dispensed</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${0 === 0 ? 'border-l-green-500' : 'border-l-red-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Low Stock</p>
                        <div className="flex items-center gap-2 mt-1">
                          <AlertTriangle className={`h-5 w-5 ${0 === 0 ? 'text-green-500 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`} />
                          <p className={`text-3xl font-bold ${0 === 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All stock levels good</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${0 > 0 ? 'border-l-violet-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Inventory</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Database className={`h-5 w-5 ${0 > 0 ? 'text-violet-500 dark:text-violet-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-3xl font-bold ${0 > 0 ? 'text-violet-600 dark:text-violet-400' : 'text-green-600 dark:text-green-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">Inventory tracked</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button onClick={() => window.location.href = '/pharmacy/prescriptions'} className="h-auto py-6 flex flex-col items-center gap-3 bg-gradient-to-br from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white border-l-4 border-l-white/20">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Prescriptions Queue</span>
              <span className="text-xs opacity-90">Pending prescriptions</span>
            </Button>
            <Button onClick={() => window.location.href = '/pharmacy/dispense'} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-violet-500/30 hover:bg-violet-500/10 border-l-4 border-l-violet-500">
              <CheckCircle2 className="h-6 w-6 text-violet-500 dark:text-violet-400" />
              <span className="text-sm font-medium">Dispense History</span>
              <span className="text-xs text-muted-foreground">Completed dispensations</span>
            </Button>
            <Button onClick={() => window.location.href = '/pharmacy/inventory'} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-violet-500/30 hover:bg-violet-500/10 border-l-4 border-l-blue-500">
              <Package className="h-6 w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-sm font-medium">Inventory</span>
              <span className="text-xs text-muted-foreground">Stock management</span>
            </Button>
            <Button onClick={() => window.location.href = '/pharmacy/reports'} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-violet-500/30 hover:bg-violet-500/10 border-l-4 border-l-emerald-500">
              <UserCheck className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
              <span className="text-sm font-medium">Quality Control</span>
              <span className="text-xs text-muted-foreground">QC management</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pending Tasks */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  Pending Tasks
                </CardTitle>
                <Badge variant="default" className="bg-green-500/10 text-green-700 border-green-500/20">
                  ✓ All Complete
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-muted-foreground text-sm mb-2">All tasks completed!</p>
                    <p className="text-xs text-muted-foreground">Great work staying on top of pharmacy operations.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No recent activity</p>
                  <p className="text-xs text-muted-foreground">Activity will appear here as you work</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}