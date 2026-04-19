"use client";

import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { NotificationList } from '@/components/notifications/NotificationList';
import { Bell } from 'lucide-react';

export default function NotificationsPage() {
  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex items-center gap-3">
          <Bell className="h-8 w-8 text-blue-500" />
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Notifications</h1>
            <p className="text-muted-foreground mt-1">In-app workflow updates (with email if enabled in preferences)</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>All notifications</CardTitle>
            <CardDescription>Open, mark as read, or archive notifications.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <NotificationList />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
