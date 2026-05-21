"use client";

import { useState, useEffect, useCallback, useRef, useMemo, useImperativeHandle, forwardRef } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
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
import { roomService, type Room as ApiRoom } from '@/lib/services';
import { isAuthenticationError } from '@/lib/auth-errors';
import {
  DoorOpen, Search, Plus, Eye, Edit, Trash2, CheckCircle2, XCircle,
  Loader2, Save, MapPin, Stethoscope, Users, Building2
} from 'lucide-react';
import { normalizeClinicName } from '@/lib/utils/clinic-utils';
import { useLocationOptions } from '@/hooks/use-location-options';
import { useOutpatientClinicTypes } from '@/hooks/use-outpatient-clinic-types';
import { useClinic } from '@/hooks/use-clinic';

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
  if (key === 'consultation' || key === 'procedure' || key === 'emergency' || key === 'examination') return key;
  return 'consultation';
}

export interface RoomsAdminManagerHandle {
  openCreate: () => void;
}

interface RoomsAdminManagerProps {
  showHeader?: boolean;
}

const RoomsAdminManager = forwardRef<RoomsAdminManagerHandle, RoomsAdminManagerProps>(({ showHeader = true }, ref) => {
  const { names: opdClinicNames } = useOutpatientClinicTypes();
  const { locations: locationOptions } = useLocationOptions({ includeAll: true });
  const { activeClinicId } = useClinic();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0, maintenance: 0 });
  const [refreshToken, setRefreshToken] = useState(0);

  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [formData, setFormData] = useState<Partial<Room>>({});
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);

  const clinicOptions = useMemo(() => locationOptions.map(loc => ({
    value: String(loc.id),
    label: loc.label,
  })), [locationOptions]);

  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: Record<string, string | number> = {
        page: currentPage, page_size: itemsPerPage,
      };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (statusFilter !== 'all') params.status = statusFilter;
      if (typeFilter !== 'all') params.room_type = typeFilter;
      if (locationFilter !== 'all') params.clinic = locationFilter;
      const res = await roomService.getRooms(params);
      const mapped = (res.results || []).map((r: ApiRoom) => {
        const clinicLabel = clinicOptions.find(o => String(o.value) === String(r.clinic))?.label || r.location || '';
        return mapRoom(r, clinicLabel);
      });
      setRooms(mapped);
      setTotalCount(typeof res.count === 'number' ? res.count : mapped.length);
    } catch (err: any) {
      if (isAuthenticationError(err)) return;
      setError(err.message || 'Failed to load rooms');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, searchQuery, statusFilter, typeFilter, locationFilter, clinicOptions]);

  const fetchStats = useCallback(async () => {
    try {
      const params: Record<string, string | number> = { page: 1, page_size: 1 };
      if (searchQuery.trim()) params.search = searchQuery.trim();
      if (typeFilter !== 'all') params.room_type = typeFilter;
      if (locationFilter !== 'all') params.clinic = locationFilter;
      const [allRes, activeRes, inactiveRes, maintRes] = await Promise.all([
        roomService.getRooms(params),
        roomService.getRooms({ ...params, status: 'active' }),
        roomService.getRooms({ ...params, status: 'inactive' }),
        roomService.getRooms({ ...params, status: 'maintenance' }),
      ]);
      setStats({
        total: allRes.count ?? 0,
        active: activeRes.count ?? 0,
        inactive: inactiveRes.count ?? 0,
        maintenance: maintRes.count ?? 0,
      });
    } catch { /* ignore */ }
  }, [searchQuery, typeFilter, locationFilter]);

  useEffect(() => { fetchRooms(); }, [fetchRooms, refreshToken]);
  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { setCurrentPage(1); }, [searchQuery, statusFilter, typeFilter, locationFilter]);

  function mapRoom(api: ApiRoom, clinicLabel: string): Room {
    const s = (api.status || 'active').toLowerCase();
    return {
      id: api.id,
      name: api.name || '',
      type: displayRoomType(api.room_type),
      room_number: api.room_number || '',
      location: clinicLabel,
      floor: api.floor || '',
      specialty: api.specialty || '',
      capacity: api.capacity ?? 1,
      status: s === 'active' ? 'Active' : s === 'inactive' ? 'Inactive' : 'Maintenance',
      assignedDoctor: '',
      description: '',
    };
  }

  async function handleSave(isEdit: boolean) {
    const errors: Record<string, string> = {};
    if (!formData.name?.trim()) errors.name = 'Room name is required';
    setFormErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setIsSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: formData.name?.trim(),
        room_type: toApiRoomType(formData.type || 'Consultation'),
        room_number: formData.room_number?.trim() || '',
        floor: formData.floor?.trim() || '',
        specialty: formData.specialty?.trim() || '',
        capacity: formData.capacity ?? 1,
        status: (formData.status || 'Active').toLowerCase(),
        description: formData.description?.trim() || '',
        clinic: formData.location ? Number(formData.location) : activeClinicId ?? undefined,
      };
      if (isEdit) {
        await roomService.updateRoom(Number(selectedRoom!.id), payload);
        toast.success('Room updated');
      } else {
        await roomService.createRoom(payload);
        toast.success('Room created');
      }
      setRefreshToken(prev => prev + 1);
      setIsCreateDialogOpen(false);
      setIsEditDialogOpen(false);
      setFormData({});
    } catch (err: any) {
      toast.error(err.message || 'Failed to save room');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedRoom) return;
    try {
      await roomService.deleteRoom(Number(selectedRoom.id));
      toast.success('Room deleted');
      setRefreshToken(prev => prev + 1);
      setIsDeleteDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete room');
    }
  }

  const openEdit = (room: Room) => {
    setSelectedRoom(room);
    setFormData({
      name: room.name,
      type: room.type,
      room_number: room.room_number,
      floor: room.floor,
      specialty: room.specialty,
      capacity: room.capacity,
      status: room.status,
      description: room.description,
      location: room.location,
    });
    setFormErrors({});
    setIsEditDialogOpen(true);
  };

  const openCreate = () => {
    setFormData({ status: 'Active', type: 'Consultation', capacity: 1 });
    setFormErrors({});
    setIsCreateDialogOpen(true);
  };

  useImperativeHandle(ref, () => ({ openCreate }));

  const statusBadge = (status: string) => {
    const variant = status === 'Active' ? 'default' : 'secondary';
    return <Badge variant={variant} className="text-[10px] px-1.5 py-0">{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      {showHeader && (
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <DoorOpen className="h-5 w-5 text-violet-600" />
            Room Management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure consultation rooms, procedure rooms, and their availability.
          </p>
        </div>
      )}

      {showHeader && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[{ label: 'Total', value: stats.total, color: 'text-violet-500', bg: 'bg-violet-500/10' },
            { label: 'Active', value: stats.active, color: 'text-green-500', bg: 'bg-green-500/10' },
            { label: 'Inactive', value: stats.inactive, color: 'text-red-500', bg: 'bg-red-500/10' },
            { label: 'Maintenance', value: stats.maintenance, color: 'text-amber-500', bg: 'bg-amber-500/10' },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground">{stat.label}</p>
                <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center flex-wrap">
          <div className="relative flex-1 min-w-[min(100%,16rem)]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search rooms..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {roomTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[130px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
            <Select value={locationFilter} onValueChange={v => { setLocationFilter(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Clinic" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clinics</SelectItem>
                {clinicOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {loading ? (
          <Card><CardContent className="p-12 text-center"><Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" /></CardContent></Card>
        ) : error ? (
          <Card><CardContent className="p-8 text-center text-red-500">{error}</CardContent></Card>
        ) : rooms.length === 0 ? (
          <Card><CardContent className="p-12 text-center text-muted-foreground"><DoorOpen className="h-12 w-12 mx-auto mb-2 opacity-50" /><p>No rooms found</p></CardContent></Card>
        ) : (
          rooms.map(room => {
            const borderColor = room.status === 'Active' ? 'border-l-violet-500' : room.status === 'Maintenance' ? 'border-l-amber-500' : 'border-l-gray-500';
            const opacity = room.status === 'Inactive' ? 'opacity-60' : '';
            return (
            <Card key={room.id} className={`border-l-4 hover:shadow-md transition-shadow ${borderColor} ${opacity}`}>
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                    <DoorOpen className="h-4 w-4 text-violet-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="font-semibold text-foreground truncate">{room.name}</span>
                        {room.room_number && <span className="text-xs text-muted-foreground font-mono">#{room.room_number}</span>}
                        <Badge variant={room.status === 'Active' ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                          {room.status}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">{room.type}</Badge>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedRoom(room); setIsViewDialogOpen(true); }}><Eye className="h-4 w-4 text-muted-foreground hover:text-primary" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEdit(room)}><Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" /></Button>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-rose-600 hover:text-rose-700" onClick={() => { setSelectedRoom(room); setIsDeleteDialogOpen(true); }}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                      <span className="flex items-center gap-1"><Building2 className="h-3 w-3" />{room.location}</span>
                      {room.floor && <><span>•</span><span>Floor {room.floor}</span></>}
                      {room.specialty && <><span>•</span><span>{room.specialty}</span></>}
                      <span>•</span><span>Capacity: {room.capacity}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            );
          })
        )}
      </div>

      {totalCount > 0 && (
        <Card className="p-4">
          <StandardPagination currentPage={currentPage} totalItems={totalCount} itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage} onItemsPerPageChange={s => { setItemsPerPage(s); setCurrentPage(1); }}
            itemName="rooms" pageSizeOptions={[25, 50, 75, 100]} />
        </Card>
      )}

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[500px]">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DoorOpen className="h-5 w-5 text-violet-500" />{selectedRoom?.name}</DialogTitle></DialogHeader>
          {selectedRoom && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-muted-foreground">Type</span><p className="font-medium">{selectedRoom.type}</p></div>
              <div><span className="text-muted-foreground">Room #</span><p className="font-medium">{selectedRoom.room_number || '—'}</p></div>
              <div><span className="text-muted-foreground">Status</span><div className="mt-0.5">{statusBadge(selectedRoom.status)}</div></div>
              <div><span className="text-muted-foreground">Location</span><p className="font-medium">{selectedRoom.location}</p></div>
              <div><span className="text-muted-foreground">Floor</span><p className="font-medium">{selectedRoom.floor || '—'}</p></div>
              <div><span className="text-muted-foreground">Capacity</span><p className="font-medium">{selectedRoom.capacity}</p></div>
              <div className="col-span-2"><span className="text-muted-foreground">Specialty</span><p className="font-medium">{selectedRoom.specialty || '—'}</p></div>
              <div className="col-span-2"><span className="text-muted-foreground">Assigned Doctor</span><p className="font-medium">{selectedRoom.assignedDoctor || '—'}</p></div>
              {selectedRoom.description && <div className="col-span-2"><span className="text-muted-foreground">Description</span><p className="font-medium">{selectedRoom.description}</p></div>}
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={v => { if (!v) { setIsCreateDialogOpen(false); setFormData({}); } }}>
        <DialogContent className="w-[95vw] sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add New Room</DialogTitle><DialogDescription>Create a consultation room or procedure room</DialogDescription></DialogHeader>
          <RoomForm formData={formData} setFormData={setFormData} formErrors={formErrors} clinicOptions={clinicOptions} opdClinicNames={opdClinicNames} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsCreateDialogOpen(false); setFormData({}); }}>Cancel</Button>
            <Button onClick={() => handleSave(false)} disabled={isSaving}>{isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isEditDialogOpen} onOpenChange={v => { if (!v) { setIsEditDialogOpen(false); setFormData({}); } }}>
        <DialogContent className="w-[95vw] sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Room</DialogTitle><DialogDescription>Update room details</DialogDescription></DialogHeader>
          <RoomForm formData={formData} setFormData={setFormData} formErrors={formErrors} clinicOptions={clinicOptions} opdClinicNames={opdClinicNames} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditDialogOpen(false); setFormData({}); }}>Cancel</Button>
            <Button onClick={() => handleSave(true)} disabled={isSaving}>{isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Delete Room</AlertDialogTitle><AlertDialogDescription>Are you sure you want to delete {selectedRoom?.name}? This action cannot be undone.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

RoomsAdminManager.displayName = 'RoomsAdminManager';

function RoomForm({ formData, setFormData, formErrors, clinicOptions, opdClinicNames }: {
  formData: Partial<Room>;
  setFormData: (d: Partial<Room>) => void;
  formErrors: Record<string, string>;
  clinicOptions: { value: string; label: string }[];
  opdClinicNames: string[];
}) {
  const update = (field: string, value: unknown) => setFormData({ ...formData, [field]: value });
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div className="sm:col-span-2">
        <Label>Room Name *</Label>
        <Input value={formData.name || ''} onChange={e => update('name', e.target.value)} placeholder="e.g. Consultation Room 1" />
        {formErrors.name && <p className="text-xs text-red-500 mt-1">{formErrors.name}</p>}
      </div>
      <div>
        <Label>Room Number</Label>
        <Input value={formData.room_number || ''} onChange={e => update('room_number', e.target.value)} placeholder="e.g. 101" />
      </div>
      <div>
        <Label>Type</Label>
        <Select value={formData.type || 'Consultation'} onValueChange={v => update('type', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{roomTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label>Floor</Label>
        <Input value={formData.floor || ''} onChange={e => update('floor', e.target.value)} placeholder="e.g. 1st" />
      </div>
      <div>
        <Label>Capacity</Label>
        <Input type="number" min={1} value={formData.capacity ?? 1} onChange={e => update('capacity', parseInt(e.target.value) || 1)} />
      </div>
      <div>
        <Label>Status</Label>
        <Select value={formData.status || 'Active'} onValueChange={v => update('status', v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="Active">Active</SelectItem><SelectItem value="Inactive">Inactive</SelectItem><SelectItem value="Maintenance">Maintenance</SelectItem></SelectContent>
        </Select>
      </div>
      <div>
        <Label>Clinic / Location</Label>
        <Select value={formData.location ? String(formData.location) : ''} onValueChange={v => update('location', v)}>
          <SelectTrigger><SelectValue placeholder="Select clinic" /></SelectTrigger>
          <SelectContent>
            {clinicOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>OPD Clinic Type</Label>
        <Select value={formData.specialty || ''} onValueChange={v => update('specialty', v)}>
          <SelectTrigger><SelectValue placeholder="Not set" /></SelectTrigger>
          <SelectContent>
            {opdClinicNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="sm:col-span-2">
        <Label>Description</Label>
        <Textarea value={formData.description || ''} onChange={e => update('description', e.target.value)} rows={2} />
      </div>
    </div>
  );
}

export { RoomsAdminManager };
