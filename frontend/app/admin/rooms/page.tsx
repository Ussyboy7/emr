"use client";

import { useState, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { toApiDateFromInstant } from "@/lib/dates";
import { roomService, type Room as ApiRoom } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import {
  DoorOpen, Search, Plus, Eye, Edit, Trash2, CheckCircle2, XCircle,
  Loader2, Save, MapPin, Stethoscope, Users, Settings
} from 'lucide-react';
import { normalizeClinicName } from '@/lib/utils/clinic-utils';
import { useLocationOptions } from '@/hooks/use-location-options';
import { useOutpatientClinicTypes } from '@/hooks/use-outpatient-clinic-types';

interface Room {
  id: string | number;
  name: string;
  type?: 'Consultation' | 'Procedure' | 'Emergency' | 'Examination';
  room_number?: string;
  location: string;
  floor: string;
  specialty: string;
  capacity: number;
  status: 'Active' | 'Inactive' | 'Maintenance' | 'active' | 'inactive' | 'maintenance';
  assignedDoctor?: string;
  description?: string;
  createdAt?: string;
  lastModified?: string;
  created_at?: string;
  updated_at?: string;
}

// Rooms data is loaded from API (consultation rooms).

const roomTypes: string[] = ['Consultation', 'Procedure', 'Emergency', 'Examination'];

function displayRoomType(api?: string): NonNullable<Room['type']> {
  const map: Record<string, NonNullable<Room['type']>> = {
    consultation: 'Consultation',
    procedure: 'Procedure',
    emergency: 'Emergency',
    examination: 'Examination',
  };
  return map[(api || 'consultation').toLowerCase()] || 'Consultation';
}

function toApiRoomType(label: string): 'consultation' | 'procedure' | 'emergency' | 'examination' {
  const key = label.toLowerCase();
  if (key === 'consultation' || key === 'procedure' || key === 'emergency' || key === 'examination') {
    return key;
  }
  return 'consultation';
}

export default function RoomManagementPage() {
  const { names: opdClinicNames } = useOutpatientClinicTypes();
  const { locations: locationOptions } = useLocationOptions({ includeAll: true });
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  /** organisation.Clinic pk as string, or "all" */
  const [locationFilter, setLocationFilter] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  /** Total rows matching list filters (status + search + clinic + type) — server count */
  const [totalCount, setTotalCount] = useState(0);
  /** Breakdown ignoring status dropdown — search / clinic / room_type only */
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    inactive: 0,
    maintenance: 0,
  });
  /** Bumps the room list query after local mutations (create / edit / delete). */
  const [refreshToken, setRefreshToken] = useState(0);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<Partial<Room>>({
    name: '', type: 'Consultation', location: '', floor: '', specialty: '', capacity: 2, status: 'Active', description: ''
  });

  const hasNarrowingFilters =
    Boolean(debouncedSearch) ||
    statusFilter !== 'all' ||
    typeFilter !== 'all' ||
    locationFilter !== 'all';

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  const buildStatsBaseFilters = useCallback(() => {
    return {
      search: debouncedSearch || undefined,
      clinic: locationFilter !== 'all' ? Number(locationFilter) : undefined,
      room_type: typeFilter !== 'all' ? typeFilter : undefined,
    };
  }, [debouncedSearch, locationFilter, typeFilter]);

  const loadStats = useCallback(async () => {
    try {
      const base = buildStatsBaseFilters();
      const stats = await roomService.getListStats(base);
      setStats({
        total: stats.total ?? 0,
        active: stats.active ?? 0,
        inactive: stats.inactive ?? 0,
        maintenance: stats.maintenance ?? 0,
      });
    } catch {
      // Non-fatal — list fetch will surface errors
    }
  }, [buildStatsBaseFilters]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    const loadRooms = async () => {
      try {
        setLoading(true);
        setError(null);
        const base = buildStatsBaseFilters();
        const result = await roomService.getRooms({
          ...base,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          page: currentPage,
          page_size: itemsPerPage,
        });
        setTotalCount(result.count ?? result.results.length);

        const transformedRooms: Room[] = result.results.map((room: ApiRoom) => ({
          id: room.id,
          name: room.name,
          room_number: room.room_number,
          location: room.location || '',
          floor: room.floor || '',
          specialty: room.specialty || '',
          type: displayRoomType(room.room_type),
          capacity: room.capacity || 1,
          status: (room.status.charAt(0).toUpperCase() + room.status.slice(1)) as Room['status'],
          createdAt: toApiDateFromInstant(room.created_at),
          lastModified: toApiDateFromInstant(room.updated_at),
        }));

        setRooms(transformedRooms);
      } catch (err) {
        console.error('Error loading rooms:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load rooms. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadRooms();
  }, [currentPage, itemsPerPage, debouncedSearch, statusFilter, typeFilter, locationFilter, buildStatsBaseFilters, refreshToken]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, statusFilter, typeFilter, locationFilter, itemsPerPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Active': return 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10';
      case 'Inactive': return 'border-gray-500/50 text-gray-600 dark:text-gray-400 bg-gray-500/10';
      case 'Maintenance': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      default: return 'border-muted-foreground/50 text-muted-foreground';
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'Consultation': return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
      case 'Procedure': return 'border-purple-500/50 text-purple-600 dark:text-purple-400 bg-purple-500/10';
      case 'Emergency': return 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-500/10';
      case 'Examination': return 'border-cyan-500/50 text-cyan-600 dark:text-cyan-400 bg-cyan-500/10';
      default: return 'border-muted-foreground/50 text-muted-foreground';
    }
  };

  const openViewDialog = (room: Room) => {
    setSelectedRoom(room);
    setIsViewDialogOpen(true);
  };

  const openEditDialog = (room: Room) => {
    setSelectedRoom(room);
    setFormData({ ...room });
    setIsEditDialogOpen(true);
  };

  const openCreateDialog = () => {
    const defaultLocation = locationOptions.find((l) => l.value !== "all")?.value || "";
    setFormData({ name: '', type: 'Consultation', location: defaultLocation, floor: '', specialty: '', capacity: 2, status: 'Active', description: '' });
    setIsCreateDialogOpen(true);
  };

  const openDeleteDialog = (room: Room) => {
    setSelectedRoom(room);
    setIsDeleteDialogOpen(true);
  };

  const handleCreateRoom = async () => {
    if (!formData.name || !formData.location || !formData.specialty) {
      toast.error('Please fill in all required fields');
      return;
    }
    setIsSubmitting(true);
    
    try {
      // Map frontend status to backend status (lowercase)
      const backendStatus = formData.status?.toLowerCase() || 'active';
      
      const newRoom = await roomService.createRoom({
        name: formData.name!,
        room_number: `ROOM-${Date.now()}`,
        location: formData.location!,
        floor: formData.floor || '',
        specialty: normalizeClinicName(formData.specialty!, opdClinicNames),
        capacity: formData.capacity || 2,
        status: backendStatus as 'active' | 'inactive' | 'maintenance',
        room_type: toApiRoomType(formData.type || 'Consultation'),
      });

      void loadStats();
      setRefreshToken((x) => x + 1);
      toast.success(`Room "${newRoom.name}" created successfully`);
      setIsCreateDialogOpen(false);
      setFormData({ name: '', type: 'Consultation', location: '', floor: '', specialty: '', capacity: 2, status: 'Active', description: '' });
    } catch (err) {
      console.error('Error creating room:', err);
      toast.error('Failed to create room. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateRoom = async () => {
    if (!selectedRoom || !formData.name) return;
    setIsSubmitting(true);
    
    try {
      const roomId = typeof selectedRoom.id === 'string' ? parseInt(selectedRoom.id) : selectedRoom.id;
      if (isNaN(roomId)) {
        toast.error('Invalid room ID');
        return;
      }
      
      // Map frontend status to backend status (lowercase)
      const backendStatus = formData.status?.toLowerCase() || 'active';
      
      const updatedRoom = await roomService.updateRoom(roomId, {
        name: formData.name,
        location: formData.location || '',
        floor: formData.floor || '',
        specialty: normalizeClinicName(formData.specialty || '', opdClinicNames),
        capacity: formData.capacity || 2,
        status: backendStatus as 'active' | 'inactive' | 'maintenance',
        room_type: toApiRoomType(formData.type || 'Consultation'),
      });

      void loadStats();
      setRefreshToken((x) => x + 1);
      toast.success(`Room "${formData.name}" updated successfully`);
      setIsEditDialogOpen(false);
    } catch (err) {
      console.error('Error updating room:', err);
      toast.error('Failed to update room. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!selectedRoom) return;
    setIsSubmitting(true);
    
    try {
      const roomId = typeof selectedRoom.id === 'string' ? parseInt(selectedRoom.id) : selectedRoom.id;
      if (isNaN(roomId)) {
        toast.error('Invalid room ID');
        return;
      }
      
      await roomService.deleteRoom(roomId);
      void loadStats();
      setRefreshToken((x) => x + 1);
      toast.success(`Room "${selectedRoom.name}" deleted`);
      setIsDeleteDialogOpen(false);
    } catch (err) {
      console.error('Error deleting room:', err);
      toast.error('Failed to delete room. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Memoize the form handlers to prevent re-creation on each render
  const handleNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, name: e.target.value }));
  }, []);

  const handleFloorChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, floor: e.target.value }));
  }, []);

  const handleCapacityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, capacity: parseInt(e.target.value) || 2 }));
  }, []);

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setFormData(prev => ({ ...prev, description: e.target.value }));
  }, []);

  const handleTypeChange = useCallback((v: string) => {
    setFormData(prev => ({ ...prev, type: v as Room['type'] }));
  }, []);

  const handleLocationChange = useCallback((v: string) => {
    setFormData(prev => ({ ...prev, location: v }));
  }, []);

  const handleSpecialtyChange = useCallback((v: string) => {
    setFormData(prev => ({ ...prev, specialty: v }));
  }, []);

  const handleStatusChange = useCallback((v: string) => {
    setFormData(prev => ({ ...prev, status: v as Room['status'] }));
  }, []);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <DoorOpen className="h-8 w-8 text-blue-500" />
              Room Management
            </h1>
            <p className="text-muted-foreground mt-1">Manage consultation rooms across all locations</p>
          </div>
          <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="h-4 w-4 mr-2" />Create Room
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Rooms</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                </div>
                <div className="p-3 rounded-full bg-blue-500/10"><DoorOpen className="h-5 w-5 text-blue-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
                </div>
                <div className="p-3 rounded-full bg-emerald-500/10"><CheckCircle2 className="h-5 w-5 text-emerald-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-gray-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Inactive</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-600 dark:text-gray-400">{stats.inactive}</p>
                </div>
                <div className="p-3 rounded-full bg-gray-500/10"><XCircle className="h-5 w-5 text-gray-500" /></div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Maintenance</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.maintenance}</p>
                </div>
                <div className="p-3 rounded-full bg-amber-500/10"><Settings className="h-5 w-5 text-amber-500" /></div>
              </div>
            </CardContent>
          </Card>
        </div>
        <p className="text-xs text-muted-foreground">
          KPI totals use location, room type, and search across all statuses. The status filter below only narrows the list.
        </p>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by room name or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={locationFilter} onValueChange={setLocationFilter}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Location" /></SelectTrigger>
                  <SelectContent>
                    {locationOptions.map((l) => (
                      <SelectItem
                        key={l.value === 'all' ? 'all' : `clinic-${l.id}`}
                        value={l.value === 'all' ? 'all' : String(l.id)}
                      >
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {roomTypes.map(t => <SelectItem key={t} value={t.toLowerCase()}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Loading State */}
        {loading && (
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Loading rooms...</p>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && !loading && (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <XCircle className="h-12 w-12 text-destructive mb-4" />
              <h3 className="text-lg font-semibold mb-2">Error loading rooms</h3>
              <p className="text-muted-foreground mb-4">{error}</p>
              <Button
                onClick={() => {
                  setError(null);
                  setRefreshToken((x) => x + 1);
                }}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Rooms List */}
        {!loading && !error && (
          <div className="space-y-3">
            {rooms.length === 0 ? (
              <Card>
                <CardContent className="p-10 text-center space-y-4">
                  <DoorOpen className="h-14 w-14 mx-auto text-muted-foreground/40" />
                  <div>
                    <p className="text-lg font-medium text-foreground">
                      {hasNarrowingFilters ? 'No rooms match your filters' : 'No consultation rooms yet'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                      {hasNarrowingFilters
                        ? 'Try clearing search or setting location and type to “All”.'
                        : 'Create your first room so clinicians can be assigned to consultation spaces.'}
                    </p>
                  </div>
                  {!hasNarrowingFilters && (
                    <Button onClick={openCreateDialog} className="bg-blue-600 hover:bg-blue-700 text-white">
                      <Plus className="h-4 w-4 mr-2" />
                      Create your first room
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              rooms.map((room) => {
                const borderColor = room.status === 'Active' ? 'border-l-emerald-500' : room.status === 'Maintenance' ? 'border-l-amber-500' : 'border-l-gray-500';
                return (
                  <Card key={room.id} className={`border-l-4 hover:shadow-md transition-shadow ${borderColor} ${room.status === 'Inactive' ? 'opacity-60' : ''}`}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${room.status === 'Active' ? 'bg-emerald-100 dark:bg-emerald-900/30' : room.status === 'Maintenance' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-gray-100 dark:bg-gray-900/30'}`}>
                          <DoorOpen className={`h-5 w-5 ${room.status === 'Active' ? 'text-emerald-600' : room.status === 'Maintenance' ? 'text-amber-600' : 'text-gray-600'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-foreground truncate">{room.name}</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusBadge(room.status)}`}>
                                {room.status}
                              </Badge>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getTypeBadge(room.type || 'Consultation')}`}>
                                {room.type || 'Consultation'}
                              </Badge>
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{room.specialty}</Badge>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(room)}>
                                <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditDialog(room)}>
                                <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700" onClick={() => openDeleteDialog(room)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>{room.room_number || room.id}</span>
                            {room.location ? (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <MapPin className="h-3 w-3 shrink-0" />
                                  {room.location}
                                </span>
                              </>
                            ) : null}
                            {room.floor ? (
                              <>
                                <span>•</span>
                                <span>{room.floor}</span>
                              </>
                            ) : null}
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3 shrink-0" />
                              Capacity: {room.capacity}
                            </span>
                            {room.assignedDoctor ? (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Stethoscope className="h-3 w-3 shrink-0" />
                                  {room.assignedDoctor}
                                </span>
                              </>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && totalCount > 0 && (
          <Card className="p-4 col-span-full">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="rooms"
            />
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-blue-500" />Room Details</DialogTitle>
              <DialogDescription>{selectedRoom?.room_number || selectedRoom?.id}</DialogDescription>
            </DialogHeader>
            {selectedRoom && (
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getStatusBadge(selectedRoom.status)}>{selectedRoom.status}</Badge>
                  {selectedRoom.type && <Badge variant="outline" className={getTypeBadge(selectedRoom.type)}>{selectedRoom.type}</Badge>}
                </div>
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div><p className="text-xs text-muted-foreground">Room Name</p><p className="font-medium">{selectedRoom.name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{selectedRoom.location}</p></div>
                  <div><p className="text-xs text-muted-foreground">Floor</p><p className="font-medium">{selectedRoom.floor}</p></div>
                  <div><p className="text-xs text-muted-foreground">Specialty</p><p className="font-medium">{selectedRoom.specialty}</p></div>
                  <div><p className="text-xs text-muted-foreground">Capacity</p><p className="font-medium">{selectedRoom.capacity} persons</p></div>
                  {selectedRoom.assignedDoctor && (
                    <div><p className="text-xs text-muted-foreground">Assigned Doctor</p><p className="font-medium">{selectedRoom.assignedDoctor}</p></div>
                  )}
                </div>
                {selectedRoom.description && (
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Description</p>
                    <p className="text-sm">{selectedRoom.description}</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4 text-sm text-muted-foreground pt-2 border-t">
                  <div>Created: {selectedRoom.createdAt}</div>
                  <div>Last Modified: {selectedRoom.lastModified}</div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              <Button onClick={() => { setIsViewDialogOpen(false); if (selectedRoom) openEditDialog(selectedRoom); }}>
                <Edit className="h-4 w-4 mr-2" />Edit Room
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Create Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-blue-500" />Create New Room</DialogTitle>
              <DialogDescription>Add a new consultation or procedure room</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Room Name *</Label>
                  <Input value={formData.name || ''} onChange={handleNameChange} placeholder="e.g., Room 1 - General" />
                </div>
                <div className="space-y-2">
                  <Label>Clinic Type *</Label>
                  <Select value={formData.type} onValueChange={handleTypeChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roomTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location *</Label>
                  <Select value={formData.location} onValueChange={handleLocationChange} disabled={locationOptions.filter((l) => l.value !== "all").length === 0}>
                    <SelectTrigger><SelectValue placeholder={locationOptions.length <= 1 ? "No locations—add clinics in Admin" : "Select location"} /></SelectTrigger>
                    <SelectContent>
                      {locationOptions.filter((l) => l.value !== "all").map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Floor</Label>
                  <Input value={formData.floor || ''} onChange={handleFloorChange} placeholder="e.g., Ground Floor" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Specialty *</Label>
                  <Select value={formData.specialty} onValueChange={handleSpecialtyChange}>
                    <SelectTrigger><SelectValue placeholder="Select specialty" /></SelectTrigger>
                    <SelectContent>
                      {opdClinicNames.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Capacity</Label>
                  <Input type="number" min={1} max={20} value={formData.capacity || 2} onChange={handleCapacityChange} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={handleStatusChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description / Notes</Label>
                <Textarea value={formData.description || ''} onChange={handleDescriptionChange} placeholder="Additional notes about the room..." rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateRoom} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : <><Plus className="h-4 w-4 mr-2" />Create Room</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Edit className="h-5 w-5 text-blue-500" />Edit Room</DialogTitle>
              <DialogDescription>Update room details for {selectedRoom?.name}</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Room Name *</Label>
                  <Input value={formData.name || ''} onChange={handleNameChange} placeholder="e.g., Room 1 - General" />
                </div>
                <div className="space-y-2">
                  <Label>Clinic Type *</Label>
                  <Select value={formData.type} onValueChange={handleTypeChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {roomTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Location *</Label>
                  <Select value={formData.location} onValueChange={handleLocationChange} disabled={locationOptions.filter((l) => l.value !== "all").length === 0}>
                    <SelectTrigger><SelectValue placeholder={locationOptions.length <= 1 ? "No locations—add clinics in Admin" : "Select location"} /></SelectTrigger>
                    <SelectContent>
                      {locationOptions.filter((l) => l.value !== "all").map((l) => (
                        <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Floor</Label>
                  <Input value={formData.floor || ''} onChange={handleFloorChange} placeholder="e.g., Ground Floor" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Specialty *</Label>
                  <Select value={formData.specialty} onValueChange={handleSpecialtyChange}>
                    <SelectTrigger><SelectValue placeholder="Select specialty" /></SelectTrigger>
                    <SelectContent>
                      {opdClinicNames.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Capacity</Label>
                  <Input type="number" min={1} max={20} value={formData.capacity || 2} onChange={handleCapacityChange} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formData.status} onValueChange={handleStatusChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                    <SelectItem value="Maintenance">Maintenance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Description / Notes</Label>
                <Textarea value={formData.description || ''} onChange={handleDescriptionChange} placeholder="Additional notes about the room..." rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleUpdateRoom} disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700">
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : <><Save className="h-4 w-4 mr-2" />Save Changes</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Dialog */}
        <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete Room?</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to delete "{selectedRoom?.name}"? This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteRoom} disabled={isSubmitting} className="bg-rose-500 hover:bg-rose-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                Delete Room
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}

