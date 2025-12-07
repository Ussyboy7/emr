"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import {
  AlertTriangle,
  Loader2,
  MapPin,
  Stethoscope,
  Users,
  Clock,
  CheckCircle,
  Play,
  UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

// Types
interface Patient {
  id: string;
  visitId: string;
  patientId: string;
  name: string;
  age: number;
  gender: string;
  mrn: string;
  allergies: string[];
  chiefComplaint: string;
  consultationRoom?: string;
  waitTime: number;
  vitalsCompleted: boolean;
  priority: "Emergency" | "High" | "Medium" | "Low";
  visitDate: string;
  visitTime: string;
}

interface ConsultationRoom {
  id: string;
  name: string;
  status: "available" | "occupied";
  currentPatient?: string;
  startTime?: string;
  doctor?: string;
  specialtyFocus?: string;
  totalConsultationsToday: number;
  averageConsultationTime: number;
  queue: { patient_id: string; position: number }[];
}

// Consultation rooms and patient data will be loaded from API
const demoPatients: Record<string, Patient> = {};

const getStatusColor = (status: ConsultationRoom["status"]): string => {
  switch (status) {
    case "available":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800";
    case "occupied":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800";
    default:
      return "bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-300";
  }
};

const getStatusIcon = (status: ConsultationRoom["status"]): string => {
  switch (status) {
    case "available":
      return "✓";
    case "occupied":
      return "⚫";
    default:
      return "";
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority?.toLowerCase()) {
    case "emergency":
      return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400";
    case "high":
      return "bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400";
    case "medium":
      return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "low":
      return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300";
  }
};

const StartConsultation = () => {
  const router = useRouter();
  const [selectedRoom, setSelectedRoom] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<boolean>(false);
  const [consultationRooms, setConsultationRooms] = useState<ConsultationRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState<boolean>(true);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  // Load demo rooms
  useEffect(() => {
    setLoadingRooms(true);
    // TODO: Load consultation rooms from API
    setConsultationRooms([]);
    setLoadingRooms(false);
  }, []);

  // Load patient for selected room
  useEffect(() => {
    if (selectedRoom) {
      const room = consultationRooms.find((r) => r.id === selectedRoom);
      if (room && room.queue.length > 0) {
        const firstPatientId = room.queue[0].patient_id;
        // TODO: Load patient data from API using firstPatientId
        setSelectedPatient(null);
      } else {
        setSelectedPatient(null);
      }
    }
  }, [selectedRoom, consultationRooms]);

  const handleStartConsultation = () => {
    if (!selectedRoom) {
      toast.error("Please select a consultation room");
      return;
    }
    setShowConfirmDialog(true);
  };

  const confirmStartConsultation = async () => {
    setIsLoading(true);

    try {
      // Simulate API call
      await new Promise((resolve) => setTimeout(resolve, 500));

      toast.success("Entering consultation room...");

      // Navigate to consultation room
      router.push(`/consultation/room/${selectedRoom}`);
    } catch (error) {
      toast.error("Failed to start consultation");
      setIsLoading(false);
    }
  };

  const handleRoomSelect = (roomId: string, status: ConsultationRoom["status"]) => {
    if (status === "available") {
      setSelectedRoom(roomId);
    }
  };

  const selectedRoomData = consultationRooms.find((room) => room.id === selectedRoom);
  const availableRooms = consultationRooms.filter((room) => room.status === "available");

  if (loadingRooms) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading consultation rooms...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Start Consultation
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Select a consultation room to begin your session
          </p>
          {availableRooms.length === 0 && (
            <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mr-2" />
                <p className="text-yellow-800 dark:text-yellow-300 text-sm">
                  No rooms are currently available. Please wait for a room to become free.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4 mb-6">
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Available Rooms</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                    {availableRooms.length}
                  </p>
                </div>
                <CheckCircle className="h-8 w-8 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Occupied Rooms</p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                    {consultationRooms.length - availableRooms.length}
                  </p>
                </div>
                <Stethoscope className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Patients Waiting</p>
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {consultationRooms.reduce((acc, room) => acc + room.queue.length, 0)}
                  </p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today's Sessions</p>
                  <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                    {consultationRooms.reduce((acc, room) => acc + room.totalConsultationsToday, 0)}
                  </p>
                </div>
                <UserCheck className="h-8 w-8 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Room Grid */}
        <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2 lg:grid-cols-3 mb-6">
          {consultationRooms.map((room) => (
            <Card
              key={room.id}
              className={`cursor-pointer transition-all duration-200 hover:shadow-lg border-2 h-80 flex flex-col ${
                selectedRoom === room.id
                  ? "ring-2 ring-emerald-500 border-emerald-500 shadow-md"
                  : "border-border"
              } ${
                room.status !== "available"
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:border-emerald-300"
              }`}
              onClick={() => handleRoomSelect(room.id, room.status)}
            >
              <CardHeader className="pb-3 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-5 w-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
                    <CardTitle className="text-lg font-semibold">{room.name}</CardTitle>
                  </div>
                  <Badge className={`${getStatusColor(room.status)} font-medium capitalize`}>
                    <span aria-hidden="true">{getStatusIcon(room.status)}</span>
                    {room.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col">
                <div className="flex-1 flex flex-col space-y-3">
                  {/* Doctor Info */}
                  <div className="text-sm text-gray-700 dark:text-gray-300 font-medium">
                    {room.doctor ? room.doctor : "No doctor assigned"}
                    {room.specialtyFocus && (
                      <span className="text-xs text-muted-foreground ml-2">
                        ({room.specialtyFocus})
                      </span>
                    )}
                  </div>

                  {/* Current Patient */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3 min-h-[60px] flex flex-col justify-center">
                    {room.status === "occupied" && room.currentPatient ? (
                      <>
                        <div className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">
                          Currently Consulting
                        </div>
                        <div className="flex items-center gap-2 text-sm text-blue-900 dark:text-blue-200">
                          <Stethoscope className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate">{room.currentPatient}</span>
                        </div>
                        {room.startTime && (
                          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Started:{" "}
                            {new Date(room.startTime).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-gray-500 dark:text-gray-400 text-center">
                        No active consultation
                      </div>
                    )}
                  </div>

                  {/* Queue Count */}
                  <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 min-h-[50px] flex items-center">
                    <div className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 w-full">
                      <Users className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium">
                        {room.queue.length > 0
                          ? `${room.queue.length} patient${room.queue.length !== 1 ? "s" : ""} in queue`
                          : "No patients in queue"}
                      </span>
                    </div>
                  </div>

                  {/* Room Stats */}
                  <div className="pt-2 border-t border-border mt-auto">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Today: {room.totalConsultationsToday} sessions</span>
                      <span>Avg: {room.averageConsultationTime}min</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row justify-center gap-4">
          <Button
            onClick={handleStartConsultation}
            disabled={!selectedRoom || isLoading || availableRooms.length === 0}
            size="lg"
            className="min-w-48 font-medium bg-emerald-600 hover:bg-emerald-700"
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            ) : (
              <Play className="mr-2 h-5 w-5" />
            )}
            {isLoading
              ? "Starting..."
              : selectedPatient
                ? "Start Consultation"
                : "Enter Room"}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="font-medium"
            onClick={() => router.push("/consultation/history")}
          >
            View Consultation History
          </Button>
        </div>

        {/* Selected Room Info */}
        {selectedRoom && (
          <div className="mt-4 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Selected:{" "}
              <span className="font-medium text-emerald-600 dark:text-emerald-400">
                {selectedRoomData?.name}
              </span>
              {selectedPatient ? (
                <>
                  {" "}
                  | Next Patient:{" "}
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    {selectedPatient.name}
                  </span>
                  <Badge className={`ml-2 ${getPriorityColor(selectedPatient.priority)}`}>
                    {selectedPatient.priority}
                  </Badge>
                </>
              ) : (
                <>
                  {" "}
                  |{" "}
                  <span className="font-medium text-amber-600 dark:text-amber-400">
                    No patients waiting
                  </span>
                </>
              )}
            </p>
          </div>
        )}

        {/* Confirm Dialog */}
        <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {selectedPatient ? "Start Consultation" : "Enter Room"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {selectedPatient ? (
                  <>
                    Are you sure you want to start a consultation in{" "}
                    <strong>{selectedRoomData?.name}</strong> with{" "}
                    <strong>{selectedPatient.name}</strong>?
                    <div className="mt-4 p-4 bg-muted rounded-lg space-y-2">
                      <p>
                        <strong>Chief Complaint:</strong> {selectedPatient.chiefComplaint}
                      </p>
                      <p>
                        <strong>Age/Gender:</strong> {selectedPatient.age} years,{" "}
                        {selectedPatient.gender}
                      </p>
                      {selectedPatient.allergies.length > 0 && (
                        <p className="text-red-600 dark:text-red-400">
                          <strong>Allergies:</strong> {selectedPatient.allergies.join(", ")}
                        </p>
                      )}
                      <p>
                        <strong>Wait Time:</strong> {selectedPatient.waitTime} minutes
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    Are you sure you want to enter <strong>{selectedRoomData?.name}</strong>?
                    There are currently no patients waiting in this room.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmStartConsultation}
                disabled={isLoading}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {selectedPatient ? "Starting..." : "Entering..."}
                  </>
                ) : selectedPatient ? (
                  "Start Consultation"
                ) : (
                  "Enter Room"
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
    </DashboardLayout>
  );
};

export default StartConsultation;

