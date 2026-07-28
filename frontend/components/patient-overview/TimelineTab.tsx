"use client";

import { useMemo } from 'react';
import { formatDisplayDateMedium, toApiDateFromInstant } from "@/lib/dates";
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, Stethoscope, TestTube, ScanLine, Pill, Heart, FileText, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { openMediaInNewTab } from '@/lib/media-url';

// Helper function to normalize date to YYYY-MM-DD format for consistent grouping
const normalizeDate = (dateString: string | undefined): string => {
  if (!dateString) return "";
  return toApiDateFromInstant(dateString);
};

// Helper function to safely parse date
const safeParseDate = (dateString: string | undefined): Date | null => {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
  }
};

interface TimelineTabProps {
  visits: any[];
  consultationSessions: any[];
  labResults: any[];
  imagingResults: any[];
  prescriptions: any[];
  vitalSigns: any[];
  clinicalDocuments?: any[];
  onVisitClick?: (visit: any) => void;
}

interface TimelineEvent {
  id: string;
  type: 'visit' | 'consultation' | 'lab' | 'imaging' | 'prescription' | 'vital' | 'document';
  date: string;
  time?: string;
  title: string;
  description?: string;
  icon: any;
  metadata?: any;
}

export function TimelineTab({
  visits,
  consultationSessions,
  labResults,
  imagingResults,
  prescriptions,
  vitalSigns,
  clinicalDocuments = [],
  onVisitClick,
}: TimelineTabProps) {
  const timelineEvents = useMemo(() => {
    const events: TimelineEvent[] = [];

    // Add visits
    visits.forEach((visit) => {
      events.push({
        id: `visit-${visit.id}`,
        type: 'visit',
        date: normalizeDate(visit.date),
        time: visit.time,
        title: `Visit: ${visit.type}`,
        description: visit.diagnosis || visit.notes,
        icon: Stethoscope,
        metadata: visit,
      });
    });

    // Add consultations
    consultationSessions.forEach((session) => {
      const consultationDate = session.date || session.created_at;
      events.push({
        id: `consultation-${session.id}`,
        type: 'consultation',
        date: normalizeDate(consultationDate),
        time: session.time,
        title: 'Consultation Session',
        description: session.notes,
        icon: FileText,
        metadata: session,
      });
    });

    // Add lab results
    labResults.forEach((lab) => {
      events.push({
        id: `lab-${lab.id}`,
        type: 'lab',
        date: normalizeDate(lab.date),
        title: `Lab Test: ${lab.test}`,
        description: lab.result || 'Pending results',
        icon: TestTube,
        metadata: lab,
      });
    });

    // Add imaging
    imagingResults.forEach((img) => {
      events.push({
        id: `imaging-${img.id}`,
        type: 'imaging',
        date: normalizeDate(img.date),
        title: `Imaging: ${img.type}`,
        description: img.description || img.result || 'No description',
        icon: ScanLine,
        metadata: img,
      });
    });

    // Add prescriptions
    prescriptions.forEach((rx) => {
      events.push({
        id: `prescription-${rx.id}`,
        type: 'prescription',
        date: normalizeDate(rx.date),
        title: `Prescription: ${rx.prescriptionId || rx.id}`,
        description: `${rx.medications?.length || 0} medication(s)`,
        icon: Pill,
        metadata: rx,
      });
    });

    // Add vital signs
    vitalSigns.forEach((vital) => {
      events.push({
        id: `vital-${vital.id}`,
        type: 'vital',
        date: normalizeDate(vital.date),
        time: vital.time,
        title: 'Vital Signs Recorded',
        description: [
          `BP: ${vital.bp}`,
          `Pulse: ${vital.pulse} bpm`,
          `Temp: ${vital.temp}°C`,
          vital.bloodSugar && vital.bloodSugar !== '-' ? `FBS: ${vital.bloodSugar}` : null,
          vital.randomBloodSugar && vital.randomBloodSugar !== '-' ? `RBS: ${vital.randomBloodSugar}` : null,
        ]
          .filter(Boolean)
          .join(' | '),
        icon: Heart,
        metadata: vital,
      });
    });

    clinicalDocuments.forEach((doc) => {
      const typeLabel =
        doc.doc_type_display ||
        String(doc.doc_type || 'Document').replace(/_/g, ' ');
      const sourceLabel = doc.source_display || String(doc.source || '').replace(/_/g, ' ');
      events.push({
        id: `document-${doc.id}`,
        type: 'document',
        date: normalizeDate(doc.document_date),
        title: doc.title || typeLabel,
        description: [sourceLabel, doc.facility, doc.clinician_name].filter(Boolean).join(' · '),
        icon: FolderOpen,
        metadata: doc,
      });
    });

    // Filter out events with invalid dates and sort by date (newest first)
    return events
      .filter(event => event.date && safeParseDate(event.date))
      .sort((a, b) => {
        const dateA = safeParseDate(a.date);
        const dateB = safeParseDate(b.date);
        if (!dateA || !dateB) return 0;
        return dateB.getTime() - dateA.getTime();
      });
  }, [visits, consultationSessions, labResults, imagingResults, prescriptions, vitalSigns, clinicalDocuments]);

  // Group events by date
  const groupedEvents = useMemo(() => {
    const groups: { [key: string]: TimelineEvent[] } = {};
    
    timelineEvents.forEach((event) => {
      const dateKey = event.date;
      if (!groups[dateKey]) {
        groups[dateKey] = [];
      }
      groups[dateKey].push(event);
    });

    // Sort events within each group by time (if available), then by type
    Object.values(groups).forEach(events => {
      events.sort((a, b) => {
        // If both have time, sort by time (descending - latest first)
        if (a.time && b.time) {
          return b.time.localeCompare(a.time);
        }
        // Events with time come before those without
        if (a.time && !b.time) return -1;
        if (!a.time && b.time) return 1;
        // If no time, maintain type order (visits, consultations, labs, etc.)
        return 0;
      });
    });

    // Sort groups by date (newest first)
    return Object.entries(groups).sort(([dateA], [dateB]) => {
      const parsedA = safeParseDate(dateA);
      const parsedB = safeParseDate(dateB);
      if (!parsedA || !parsedB) return 0;
      return parsedB.getTime() - parsedA.getTime();
    });
  }, [timelineEvents]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'visit':
        return 'bg-blue-500';
      case 'consultation':
        return 'bg-emerald-500';
      case 'lab':
        return 'bg-amber-500';
      case 'imaging':
        return 'bg-cyan-500';
      case 'prescription':
        return 'bg-violet-500';
      case 'vital':
        return 'bg-rose-500';
      case 'document':
        return 'bg-indigo-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'visit':
        return 'Visit';
      case 'consultation':
        return 'Consultation';
      case 'lab':
        return 'Lab Result';
      case 'imaging':
        return 'Imaging';
      case 'prescription':
        return 'Prescription';
      case 'vital':
        return 'Vital Signs';
      case 'document':
        return 'Document';
      default:
        return type;
    }
  };

  return (
    <div className="space-y-6">
        {groupedEvents.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-muted-foreground">No timeline events found</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {groupedEvents.map(([date, events]) => (
            <div key={date} className="space-y-4">
              {/* Date Header */}
              <div className="flex items-center gap-3 sticky top-0 bg-background/95 backdrop-blur-sm z-10 py-2 border-b pb-2">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <h3 className="text-lg font-semibold">
                  {formatDisplayDateMedium(date) || date}
                </h3>
                <Badge variant="outline" className="ml-auto">
                  {events.length} {events.length === 1 ? 'event' : 'events'}
                </Badge>
              </div>

              {/* Events for this date */}
              <div className="relative pl-8 space-y-4">
                {/* Timeline line */}
                <div className="absolute left-3 top-0 bottom-0 w-0.5 bg-border" />

                {events.map((event) => {
                  const Icon = event.icon;
                  const isVisitClickable = event.type === 'visit' && !!onVisitClick && !!event.metadata;
                  const isDocumentClickable = event.type === 'document' && !!event.metadata?.file;
                  const isClickable = isVisitClickable || isDocumentClickable;
                  const handleActivate = () => {
                    if (isVisitClickable) {
                      onVisitClick(event.metadata);
                      return;
                    }
                    if (isDocumentClickable) {
                      void openMediaInNewTab(event.metadata.file).catch((err: unknown) => {
                        toast.error(err instanceof Error ? err.message : 'Failed to open document');
                      });
                    }
                  };
                  return (
                    <div key={event.id} className="relative">
                      {/* Timeline dot */}
                      <div className={`absolute left-0 top-1.5 h-6 w-6 rounded-full ${getTypeColor(event.type)} border-4 border-background flex items-center justify-center`}>
                        <Icon className="h-3 w-3 text-white" />
                      </div>

                      {/* Event card */}
                      <Card
                        className={`ml-8 hover:shadow-md transition-shadow${
                          isClickable ? ' cursor-pointer hover:bg-muted/40' : ''
                        }`}
                        onClick={isClickable ? handleActivate : undefined}
                        role={isClickable ? 'button' : undefined}
                        tabIndex={isClickable ? 0 : undefined}
                        onKeyDown={
                          isClickable
                            ? (e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  handleActivate();
                                }
                              }
                            : undefined
                        }
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <h4 className="font-semibold">{event.title}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {getTypeLabel(event.type)}
                                </Badge>
                              </div>
                              {event.description && (
                                <p className="text-sm text-muted-foreground">{event.description}</p>
                              )}
                              {event.time && (
                                <div className="flex items-center gap-1 text-xs text-muted-foreground mt-2">
                                  <Clock className="h-3 w-3" />
                                  {event.time}
                                </div>
                              )}
                              {event.type === 'visit' && event.metadata.doctor && event.metadata.doctor !== 'Unknown' && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Doctor: {event.metadata.doctor}
                                </p>
                              )}
                              {event.type === 'consultation' && event.metadata.doctor && event.metadata.doctor !== 'Unknown' && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Doctor: {event.metadata.doctor}
                                </p>
                              )}
                              {event.type === 'prescription' && event.metadata.doctor && event.metadata.doctor !== 'Unknown' && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Prescribed by: {event.metadata.doctor}
                                </p>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })}
              </div>
            </div>
            ))}
          </div>
        )}
    </div>
  );
}
