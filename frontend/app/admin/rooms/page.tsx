"use client";

import { useRef } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Loader2, DoorOpen, Plus } from "lucide-react";
import { useAdminPageAuth } from "@/hooks/use-admin-page-auth";
import {
  RoomsAdminManager,
  type RoomsAdminManagerHandle,
} from "@/components/admin/RoomsAdminManager";

export default function RoomManagementPage() {
  const { ready, handleAuthError } = useAdminPageAuth();
  const roomsRef = useRef<RoomsAdminManagerHandle>(null);

  if (!ready) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <DoorOpen className="h-8 w-8 text-violet-500" />
              Room Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Configure consultation rooms, procedure rooms, and their availability
            </p>
          </div>
          <Button
            onClick={() => roomsRef.current?.openCreate()}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Room
          </Button>
        </div>

        <RoomsAdminManager
          ref={roomsRef}
          showHeader={false}
          showStats
          onAuthError={handleAuthError}
        />
      </div>
    </DashboardLayout>
  );
}
