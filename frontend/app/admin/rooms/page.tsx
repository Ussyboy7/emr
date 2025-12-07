"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { roomService, type Room as ApiRoom } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import {
  DoorOpen, Search, Plus, Eye, Edit, Trash2, CheckCircle2, XCircle, Clock,
  Loader2, Save, MapPin, Stethoscope, Users, Activity, Settings
} from 'lucide-react';

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

// Rooms data will be loaded from API

// NPA Clinics (for Specialty/Clinic Type)
const clinics = ["General", "Physiotherapy", "Eye", "Sickle Cell", "Diamond"];

// NPA Locations
const locations = [
  "Headquarters", "Bode Thomas Clinic", "Lagos Port Complex", "Tincan Island Port Complex",
  "Rivers Port Complex", "Onne Port Complex", "Delta Port Complex", "Calabar Port", "Lekki Deep Sea Port"
];

const roomTypes: string[] = ['Consultation', 'Procedure', 'Emergency', 'Examination'];

export default function RoomManagementPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');
  
  // Load rooms from API
  useEffect(() => {
    const loadRooms = async () => {
      try {
        setLoading(true);
        setError(null);
        const result = await roomService.getRooms({ page_size: 1000 });
        
        // Transform API rooms to frontend format
        const transformedRooms: Room[] = result.results.map((room: ApiRoom) => ({
          id: room.id,
          name: room.name,
          room_number: room.room_number,
          location: room.location || '',
          floor: room.floor || '',
          specialty: room.specialty || '',
          capacity: room.capacity || 1,
          status: (room.status.charAt(0).toUpperCase() + room.status.slice(1)) as Room['status'],
          createdAt: room.created_at?.split('T')[0] || '',
          lastModified: room.updated_at?.split('T')[0] || '',
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
  }, []);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Dialog states
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<Partial<Room>>({
    name: '', type: 'Consultation', location: '', floor: '', specialty: '', capacity: 2, status: 'Active', description: ''
  });

  const filteredRooms = useMemo(() => rooms.filter(room => {
    const matchesSearch = room.name.toLowerCase().includes(searchQuery.toLowerCase()) || String(room.id).toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || room.status.toLowerCase() === statusFilter;
    const matchesType = typeFilter === 'all' || (room.type && room.type.toLowerCase() === typeFilter);
    const matchesLocation = locationFilter === 'all' || room.location === locationFilter;
    return matchesSearch && matchesStatus && matchesType && matchesLocation;
  }), [rooms, searchQuery, statusFilter, typeFilter, locationFilter]);

  // Paginated rooms
  const paginatedRooms = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredRooms.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredRooms, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, typeFilter, locationFilter]);

  const stats = {
    total: rooms.length,
    active: rooms.filter(r => r.status === 'Active').length,
    inactive: rooms.filter(r => r.status === 'Inactive').length,
    maintenance: rooms.filter(r => r.status === 'Maintenance').length,
  };

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
    setFormData({ name: '', type: 'Consultation', location: locations[0] || '', floor: '', specialty: '', capacity: 2, status: 'Active', description: '' });
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
        room_number: `ROOM-${String(rooms.length + 1).padStart(3, '0')}`, // Generate room number
        location: formData.location!,
        floor: formData.floor || '',
        specialty: formData.specialty!,
        capacity: formData.capacity || 2,
        status: backendStatus as 'active' | 'inactive' | 'maintenance',
      });

      // Transform and add to local state
      const transformedRoom: Room = {
        id: newRoom.id,
        name: newRoom.name,
        room_number: newRoom.room_number,
        location: newRoom.location || '',
        floor: newRoom.floor || '',
        specialty: newRoom.specialty || '',
        capacity: newRoom.capacity || 1,
        status: (newRoom.status.charAt(0).toUpperCase() + newRoom.status.slice(1)) as Room['status'],
        createdAt: newRoom.created_at?.split('T')[0] || '',
        lastModified: newRoom.updated_at?.split('T')[0] || '',
      };

      setRooms(prev => [...prev, transformedRoom]);
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
        specialty: formData.specialty || '',
        capacity: formData.capacity || 2,
        status: backendStatus as 'active' | 'inactive' | 'maintenance',
      });

      // Transform and update local state
      const transformedRoom: Room = {
        id: updatedRoom.id,
        name: updatedRoom.name,
        room_number: updatedRoom.room_number,
        location: updatedRoom.location || '',
        floor: updatedRoom.floor || '',
        specialty: updatedRoom.specialty || '',
        capacity: updatedRoom.capacity || 1,
        status: (updatedRoom.status.charAt(0).toUpperCase() + updatedRoom.status.slice(1)) as Room['status'],
        createdAt: updatedRoom.created_at?.split('T')[0] || '',
        lastModified: updatedRoom.updated_at?.split('T')[0] || '',
      };

      setRooms(prev => prev.map(r => r.id === selectedRoom.id ? transformedRoom : r));
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
      setRooms(prev => prev.filter(r => r.id !== selectedRoom.id));
      toast.success(`Room "${selectedRoom.name}" deleted`);
      setIsDeleteDialogOpen(false);
    } catch (err) {
      console.error('Error deleting room:', err);
      toast.error('Failed to delete room. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (room: Room) => {
    try {
      const roomId = typeof room.id === 'string' ? parseInt(room.id) : room.id;
      if (isNaN(roomId)) {
        toast.error('Invalid room ID');
        return;
      }
      
      const currentStatus = typeof room.status === 'string' ? room.status.toLowerCase() : 'active';
      const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
      
      const updatedRoom = await roomService.updateRoom(roomId, {
        status: newStatus as 'active' | 'inactive' | 'maintenance',
      });

      // Transform and update local state
      const transformedRoom: Room = {
        ...room,
        status: (updatedRoom.status.charAt(0).toUpperCase() + updatedRoom.status.slice(1)) as Room['status'],
        lastModified: updatedRoom.updated_at?.split('T')[0] || '',
      };

      setRooms(prev => prev.map(r => r.id === room.id ? transformedRoom : r));
      toast.success(`Room ${room.name} is now ${transformedRoom.status}`);
    } catch (err) {
      console.error('Error toggling room status:', err);
      toast.error('Failed to update room status. Please try again.');
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
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
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
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
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
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.active}</p>
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
                  <p className="text-3xl font-bold text-gray-600 dark:text-gray-400">{stats.inactive}</p>
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
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.maintenance}</p>
                </div>
                <div className="p-3 rounded-full bg-amber-500/10"><Settings className="h-5 w-5 text-amber-500" /></div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by room name or ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Location" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Locations</SelectItem>
                  {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
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
              <Button onClick={() => window.location.reload()}>Retry</Button>
            </CardContent>
          </Card>
        )}

        {/* Rooms List */}
        {!loading && !error && (
          <div className="space-y-3">
            {filteredRooms.length === 0 ? (
              <Card><CardContent className="p-8 text-center text-muted-foreground">
                <DoorOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No rooms found</p>
              </CardContent></Card>
            ) : (
              paginatedRooms.map((room) => {
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
                            <span>•</span>
                            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{room.location}</span>
                            <span>•</span>
                            <span>{room.floor}</span>
                            <span>•</span>
                            <span className="flex items-center gap-1"><Users className="h-3 w-3" />Capacity: {room.capacity}</span>
                            {room.assignedDoctor && (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{room.assignedDoctor}</span>
                              </>
                            )}
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
        {!loading && !error && filteredRooms.length > 0 && (
          <Card className="p-4 col-span-full">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredRooms.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="rooms"
            />
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-blue-500" />Room Details</DialogTitle>
              <DialogDescription>{selectedRoom?.room_number || selectedRoom?.id}</DialogDescription>
            </DialogHeader>
            {selectedRoom && (
              <div className="py-4 space-y-4">
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getStatusBadge(selectedRoom.status)}>{selectedRoom.status}</Badge>
                  <Badge variant="outline" className={getTypeBadge(selectedRoom.type)}>{selectedRoom.type}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div><p className="text-xs text-muted-foreground">Room Name</p><p className="font-medium">{selectedRoom.name}</p></div>
                  <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{selectedRoom.location}</p></div>
                  <div><p className="text-xs text-muted-foreground">Floor</p><p className="font-medium">{selectedRoom.floor}</p></div>
                  <div><p className="text-xs text-muted-foreground">Specialty</p><p className="font-medium">{selectedRoom.specialty}</p></div>
                  <div><p className="text-xs text-muted-foreground">Capacity</p><p className="font-medium">{selectedRoom.capacity} persons</p></div>
                  <div><p className="text-xs text-muted-foreground">Assigned Doctor</p><p className="font-medium">{selectedRoom.assignedDoctor || '—'}</p></div>
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
          <DialogContent className="sm:max-w-[600px]">
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
                  <Select value={formData.location} onValueChange={handleLocationChange}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
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
                      {clinics.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
          <DialogContent className="sm:max-w-[600px]">
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
                  <Select value={formData.location} onValueChange={handleLocationChange}>
                    <SelectTrigger><SelectValue placeholder="Select location" /></SelectTrigger>
                    <SelectContent>
                      {locations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
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
                      {clinics.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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

