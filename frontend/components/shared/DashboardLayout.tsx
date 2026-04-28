"use client";

import { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from './AppSidebar';
import { TopBar } from './TopBar';

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  return (
    <SidebarProvider className="print:min-h-0 print:h-auto">
      <div className="h-screen flex w-full bg-muted/30 overflow-hidden print:h-auto print:min-h-0 print:overflow-visible print:bg-white">
        <AppSidebar />
        <div className="flex flex-1 flex-col w-full min-h-0 print:min-h-0 print:h-auto print:overflow-visible">
          <TopBar />
          <main className="flex min-h-0 flex-1 flex-col overflow-y-auto print:block print:h-auto print:min-h-0 print:flex-none print:overflow-visible">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
};
