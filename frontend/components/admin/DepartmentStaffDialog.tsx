"use client";

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from "sonner";
import { adminService, type Department, type User as ApiUser } from '@/lib/services';
import { Loader2, Search, UserPlus, UserMinus, Star, UserCog, X } from 'lucide-react';
import { DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { useCurrentUser } from '@/hooks/use-current-user';

interface DepartmentStaffDialogProps {
  department: {
    id: number;
    name: string;
    clinicName?: string | null;
    headName?: string | null;
    headUserId?: number | null;
    deputyHeadName?: string | null;
    deputyUserId?: number | null;
  } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStaffChanged: () => void;
}

export function DepartmentStaffDialog({ department, open, onOpenChange, onStaffChanged }: DepartmentStaffDialogProps) {
  const { currentUser } = useCurrentUser();
  const [staff, setStaff] = useState<ApiUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [availableUsers, setAvailableUsers] = useState<ApiUser[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);

  const headUserId = department?.headUserId ?? null;
  const headName = department?.headName ?? null;
  const deputyUserId = department?.deputyUserId ?? null;
  const deputyHeadName = department?.deputyHeadName ?? null;

  const canManageStructure =
    Boolean(currentUser?.isSuperuser) ||
    Boolean(currentUser?.permissions?.includes('/admin/clinics'));

  const canManageStaff =
    canManageStructure ||
    Boolean(currentUser?.isStaff) ||
    (Boolean(currentUser?.isDepartmentHead) &&
      Boolean(currentUser?.permissions?.includes('/admin/users')) &&
      Boolean(department?.id) &&
      (currentUser?.headedDepartments ?? []).some((d) => d.id === department?.id));

  const departmentId = department?.id;

  const loadStaff = useCallback(async () => {
    if (!departmentId) return;
    setLoading(true);
    try {
      const res = await adminService.getUsers({
        department: departmentId,
        page_size: MAX_LIST_PAGE_SIZE,
      });
      setStaff(res.results || []);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load department staff');
    } finally {
      setLoading(false);
    }
  }, [departmentId]);

  useEffect(() => {
    if (open && departmentId) {
      loadStaff();
      setShowAddUser(false);
      setSearchQuery('');
    }
  }, [open, departmentId, loadStaff]);

  const searchAvailableUsers = useCallback(async (query: string) => {
    if (!query.trim() || query.length < 2) {
      setAvailableUsers([]);
      return;
    }
    setSearchingUsers(true);
    try {
      const res = await adminService.getUsers({
        search: query.trim(),
        is_active: true,
        page_size: DEFAULT_LIST_PAGE_SIZE,
      });
      const alreadyInDept = new Set(staff.map(s => s.id));
      setAvailableUsers((res.results || []).filter(u => !alreadyInDept.has(u.id)));
    } catch {
      setAvailableUsers([]);
    } finally {
      setSearchingUsers(false);
    }
  }, [staff]);

  useEffect(() => {
    searchAvailableUsers(searchQuery);
  }, [searchQuery, searchAvailableUsers]);

  async function assignUser(userId: number) {
    try {
      await adminService.updateUser(userId, { department: department!.id } as any);
      toast.success('User assigned to department');
      loadStaff();
      onStaffChanged();
      setSearchQuery('');
      setAvailableUsers([]);
    } catch (err: any) {
      toast.error(err.message || 'Failed to assign user');
    }
  }

  async function removeUser(userId: number) {
    try {
      await adminService.updateUser(userId, { department: null } as any);
      toast.success('User removed from department');
      loadStaff();
      onStaffChanged();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove user');
    }
  }

  async function setHead(userId: number, userName: string) {
    try {
      const payload: Partial<Department> = { head: userId };
      if (deputyUserId === userId) {
        payload.deputy_head = undefined;
      }
      await adminService.updateDepartment(department!.id, payload);
      toast.success(`${userName} is now department head`);
      onStaffChanged();
    } catch (err: any) {
      toast.error(err.message || 'Failed to set department head');
    }
  }

  async function setDeputy(userId: number, userName: string) {
    try {
      await adminService.updateDepartment(department!.id, { deputy_head: userId });
      toast.success(`${userName} is now deputy head`);
      onStaffChanged();
    } catch (err: any) {
      toast.error(err.message || 'Failed to set deputy head');
    }
  }

  async function removeHead() {
    try {
      await adminService.updateDepartment(department!.id, { head: null as any });
      toast.success('Department head removed');
      onStaffChanged();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove department head');
    }
  }

  async function removeDeputy() {
    try {
      await adminService.updateDepartment(department!.id, { deputy_head: undefined });
      toast.success('Deputy head removed');
      onStaffChanged();
    } catch (err: any) {
      toast.error(err.message || 'Failed to remove deputy head');
    }
  }

  const isHead = (userId: number) => headUserId != null && headUserId === userId;
  const isDeputy = (userId: number) => deputyUserId != null && deputyUserId === userId;
  const clinicName = department?.clinicName ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCog className="h-5 w-5 text-blue-500" />
            {department?.name} — Staff
          </DialogTitle>
          <DialogDescription>
            {clinicName ?? '—'} · Head: {headName ?? 'None'}
            {deputyHeadName ? ` · Deputy: ${deputyHeadName}` : ''}
          </DialogDescription>
        </DialogHeader>

        {canManageStaff && !showAddUser && (
          <Button variant="outline" size="sm" onClick={() => setShowAddUser(true)} className="self-start">
            <UserPlus className="h-4 w-4 mr-2" />Add Staff
          </Button>
        )}

        {showAddUser && (
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Add user to department</span>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => { setShowAddUser(false); setSearchQuery(''); setAvailableUsers([]); }}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search users by name, email..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9" autoFocus />
              </div>
              {searchingUsers && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Searching...</div>
              )}
              {availableUsers.length > 0 && (
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {availableUsers.map(user => (
                    <div key={user.id} className="flex items-center justify-between p-2 rounded-md hover:bg-muted/50">
                      <div>
                        <span className="text-sm font-medium">{user.first_name} {user.last_name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{user.email}</span>
                        {user.system_role && <Badge variant="outline" className="ml-2 text-[10px]">{user.system_role}</Badge>}
                      </div>
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => assignUser(user.id)}>
                        <UserPlus className="h-3.5 w-3.5 mr-1" />Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {searchQuery.length >= 2 && !searchingUsers && availableUsers.length === 0 && (
                <p className="text-sm text-muted-foreground">No users found</p>
              )}
            </CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
        ) : staff.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            <UserCog className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>No staff assigned to this department</p>
          </div>
        ) : (
          <>
          <p className="text-xs text-muted-foreground">{staff.length} staff ({staff.filter(u => u.is_active).length} active)</p>
          <div className="space-y-1">
            {staff.map(user => (
              <div
                key={user.id}
                className={`flex items-center justify-between p-2 rounded-md hover:bg-muted/50 ${
                  isHead(user.id)
                    ? 'bg-blue-50 dark:bg-blue-950/20'
                    : isDeputy(user.id)
                      ? 'bg-amber-50 dark:bg-amber-950/20'
                      : ''
                } ${!user.is_active ? 'opacity-50' : ''}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  {isHead(user.id) && <Star className="h-3.5 w-3.5 text-amber-500 flex-shrink-0" />}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{user.first_name} {user.last_name}</span>
                      {isHead(user.id) && <Badge variant="secondary" className="text-[10px]">Head</Badge>}
                      {isDeputy(user.id) && <Badge variant="secondary" className="text-[10px]">Deputy</Badge>}
                      {!user.is_active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                      {user.system_role && <Badge variant="outline" className="text-[10px]">{user.system_role}</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {canManageStructure && !isHead(user.id) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setHead(user.id, `${user.first_name} ${user.last_name}`)}
                      title="Set as department head"
                    >
                      <Star className="h-3.5 w-3.5 mr-1" />Set as Head
                    </Button>
                  )}
                  {canManageStructure && !isHead(user.id) && !isDeputy(user.id) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setDeputy(user.id, `${user.first_name} ${user.last_name}`)}
                      title="Set as deputy head"
                    >
                      <UserCog className="h-3.5 w-3.5 mr-1" />Set as Deputy
                    </Button>
                  )}
                  {canManageStaff && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-rose-600 hover:text-rose-700"
                      onClick={() => removeUser(user.id)}
                      disabled={isHead(user.id) || isDeputy(user.id)}
                      title={isHead(user.id) || isDeputy(user.id) ? 'Remove head or deputy assignment first' : 'Remove from department'}
                    >
                      <UserMinus className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          </>
        )}

        {canManageStructure && (
          <div className="space-y-1 text-xs text-muted-foreground">
            {headName ? (
              <div>
                Current head: {headName} ·{' '}
                <button type="button" onClick={removeHead} className="text-rose-600 hover:underline">
                  Remove head
                </button>
              </div>
            ) : (
              <div>No department head assigned</div>
            )}
            {deputyHeadName ? (
              <div>
                Current deputy: {deputyHeadName} ·{' '}
                <button type="button" onClick={removeDeputy} className="text-rose-600 hover:underline">
                  Remove deputy
                </button>
              </div>
            ) : (
              <div>No deputy head assigned</div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
