"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { ClientErrorBoundary } from '@/components/ClientErrorBoundary';
import { Toaster as ToastToaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { OrganizationProvider } from "@/contexts/OrganizationContext";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <OrganizationProvider>
        <ClientErrorBoundary>
          <TooltipProvider>
            {children}
            <Toaster />
            <ToastToaster />
          </TooltipProvider>
        </ClientErrorBoundary>
      </OrganizationProvider>
    </ThemeProvider>
  );
}

