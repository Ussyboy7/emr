"use client";

import { formatDisplayDateTime, formatDisplayTime } from "@/lib/dates";
import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { modalNoOverflow } from "@/components/ui/modal-sizes";
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from "sonner";
import { isAuthenticationError } from '@/lib/auth-errors';
import {
  loadVisitJourneyData,
  type VisitJourneyDisplayVisit,
  type VisitJourneyEvent,
  type VisitJourneyPatient,
} from '@/lib/visit-journey';
import {
  Calendar, Clock, CheckCircle2, Loader2, AlertTriangle,
  User, Building2,
} from 'lucide-react';

interface VisitDetailModalProps {
  visit: { id: string; numericId?: number; visitId?: string } | null;
  visitId?: string | number;
  isOpen: boolean;
  onClose: () => void;
  onVisitUpdated?: () => void;
}

export function VisitDetailModal({
  visit: visitProp,
  visitId: visitIdProp,
  isOpen,
  onClose,
}: VisitDetailModalProps) {
  const [visit, setVisit] = useState<VisitJourneyDisplayVisit | null>(null);
  const [patient, setPatient] = useState<VisitJourneyPatient | null>(null);
  const [loading, setLoading] = useState(false);
  const [journey, setJourney] = useState<VisitJourneyEvent[]>([]);

  const loadVisitJourney = useCallback(async () => {
    const idToUse = visitIdProp || visitProp?.numericId || visitProp?.id;
    if (!idToUse) return;

    try {
      setLoading(true);
      const data = await loadVisitJourneyData(idToUse);
      setVisit(data.visit);
      setPatient(data.patient);
      setJourney(data.journey);
    } catch (err: unknown) {
      console.error('Error loading visit journey:', err);
      if (!isAuthenticationError(err)) {
        toast.error('Failed to load visit journey');
      }
      setJourney([]);
    } finally {
      setLoading(false);
    }
  }, [visitProp, visitIdProp]);

  useEffect(() => {
    if (isOpen) {
      loadVisitJourney();
    }
  }, [isOpen, loadVisitJourney]);

  const formatDateTime = (timestamp?: string) => {
    if (!timestamp) return '';
    const formatted = formatDisplayDateTime(timestamp);
    return formatted === '—' ? '' : formatted;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case 'in_progress':
        return <Loader2 className="h-5 w-5 text-blue-500 animate-spin" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={`${modalNoOverflow('lg')} p-0 flex flex-col`}>
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle className="text-2xl font-bold">
            Visit Journey: {visit?.id || visitProp?.visitId || visitProp?.id || 'Loading...'}
          </DialogTitle>
          <DialogDescription className="mt-1">
            {patient ? `${patient.name} • ${patient.id}` : 'Loading patient...'} • {visit?.date || ''}{' '}
            {visit?.time ? `at ${visit.time}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading visit journey...</span>
            </div>
          ) : journey.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <AlertTriangle className="h-8 w-8 text-destructive" />
              <span className="ml-3 text-destructive">Failed to load visit journey</span>
            </div>
          ) : (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    Visit Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Visit Type:</span>
                    <Badge variant="outline">{visit?.type || 'N/A'}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Clinic:</span>
                    <span>{visit?.department || 'N/A'}</span>
                  </div>
                  {visit?.location_clinic_name && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Location:</span>
                      <span>{visit.location_clinic_name}</span>
                    </div>
                  )}
                  {visit?.notes && (
                    <div className="mt-3 pt-3 border-t">
                      <span className="text-muted-foreground block mb-2">Notes / Special Instructions:</span>
                      <div className="p-3 rounded-lg bg-muted/50 border">
                        <p className="text-sm whitespace-pre-wrap">{visit.notes}</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5 text-purple-500" />
                    Patient Journey
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {journey.map((event, index) => {
                      const Icon = event.icon;
                      const isLast = index === journey.length - 1;
                      return (
                        <div key={event.id} className="flex gap-4">
                          <div className="flex flex-col items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${event.color} text-white`}>
                              <Icon className="h-5 w-5" />
                            </div>
                            {!isLast && (
                              <div
                                className={`w-0.5 flex-1 ${
                                  event.status === 'completed'
                                    ? 'bg-blue-300'
                                    : event.status === 'in_progress'
                                      ? 'bg-blue-200'
                                      : 'bg-gray-200'
                                }`}
                              />
                            )}
                          </div>

                          <div className="flex-1 pb-6">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-semibold">{event.title}</h4>
                                  {getStatusIcon(event.status)}
                                </div>
                                <p className="text-sm text-muted-foreground mb-1">{event.description}</p>
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                  <Badge variant="outline" className="text-xs">{event.module}</Badge>
                                  {event.location && (
                                    <span className="flex items-center gap-1">
                                      <Building2 className="h-3 w-3" />
                                      {event.location}
                                    </span>
                                  )}
                                  {event.staff && (
                                    <span className="flex items-center gap-1">
                                      <User className="h-3 w-3" />
                                      {event.staff}
                                    </span>
                                  )}
                                  {event.timestamp && (
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {formatDateTime(event.timestamp)}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
