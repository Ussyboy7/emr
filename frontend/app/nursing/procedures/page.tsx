"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { patientService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { 
  Syringe, Bandage, Pill, Search, RefreshCw, Users, Clock, CheckCircle2, AlertTriangle,
  Eye, Calendar, Loader2, Save, Activity, History, ArrowRight, User, Stethoscope
} from 'lucide-react';

// ==================== TYPES ====================
interface Procedure {
  id: string;
  type: 'injection' | 'dressing' | 'medication';
  patientName: string;
  patientId: string;
  personalNumber: string;
  age: number;
  gender: string;
  ward: string;
  orderedAt: string;
  orderedBy: string;
  priority: 'Emergency' | 'High' | 'Medium' | 'Low';
  allergies: string[];
  // Type-specific details
  details: {
    // Injection
    medication?: string;
    dosage?: string;
    route?: string;
    frequency?: string;
    // Dressing
    woundType?: string;
    woundLocation?: string;
    instructions?: string;
    // Medication
    scheduledTime?: string;
  };
}

// Procedures data will be loaded from API

// ==================== HELPERS ====================
const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    'Emergency': 'bg-rose-500 text-white',
    'High': 'bg-amber-500 text-white',
    'Medium': 'bg-blue-500 text-white',
    'Low': 'bg-emerald-500 text-white',
  };
  return colors[priority] || 'bg-gray-500 text-white';
};

const getTypeConfig = (type: string) => {
  const configs: Record<string, { icon: any; color: string; bgColor: string; label: string }> = {
    'injection': { icon: Syringe, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10 border-emerald-500/30', label: 'Injection' },
    'dressing': { icon: Bandage, color: 'text-violet-500', bgColor: 'bg-violet-500/10 border-violet-500/30', label: 'Dressing' },
    'medication': { icon: Pill, color: 'text-blue-500', bgColor: 'bg-blue-500/10 border-blue-500/30', label: 'Medication' },
  };
  return configs[type] || configs['medication'];
};

const getTimeSince = (dateString: string) => {
  const now = new Date();
  const ordered = new Date(dateString);
  const diffMs = now.getTime() - ordered.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  return `${diffHrs}h ${diffMins % 60}m ago`;
};

// ==================== MAIN COMPONENT ====================
export default function ProceduresQueuePage() {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Dialog states
  const [isPerformDialogOpen, setIsPerformDialogOpen] = useState(false);
  const [selectedProcedure, setSelectedProcedure] = useState<Procedure | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [injectionForm, setInjectionForm] = useState({ site: '', batchNumber: '', expiryDate: '', manufacturer: '', notes: '' });
  const [dressingForm, setDressingForm] = useState({ dressingType: '', woundCondition: '', woundSize: '', drainage: '', painLevel: '', skinCondition: '', observations: '' });
  const [medicationForm, setMedicationForm] = useState({ site: '', notes: '' });
  
  // Load nursing orders from API
  useEffect(() => {
    const loadOrders = async () => {
      try {
        setLoading(true);
        setError(null);
        
        // Fetch pending nursing orders
        const ordersResult = await apiFetch<{ results: any[] }>('/nursing/orders/?status=pending&page_size=1000');
        const orders = ordersResult.results || [];
        
        // Transform orders to procedures format
        const transformedProcedures = await Promise.all(orders.map(async (order: any) => {
          try {
            // Get patient details
            const patient = await patientService.getPatient(order.patient);
            
            // Load patient allergies from medical history
            let allergies: string[] = [];
            try {
              const history = await patientService.getPatientHistory(order.patient);
              if (history && history.allergies) {
                allergies = Array.isArray(history.allergies) 
                  ? history.allergies 
                  : typeof history.allergies === 'string' 
                    ? history.allergies.split(/[,\n]/).map((a: string) => a.trim()).filter((a: string) => a)
                    : [];
              }
            } catch (historyErr) {
              // If history fetch fails, continue without allergies
              console.warn(`Could not load allergies for patient ${order.patient}:`, historyErr);
            }
            
            // Map backend order_type to frontend type
            const typeMap: Record<string, Procedure['type']> = {
              'injection': 'injection',
              'dressing': 'dressing',
              'wound_care': 'dressing',
              'medication': 'medication',
            };
            
            const procedureType = typeMap[order.order_type?.toLowerCase()] || 'medication';
            
            // Map backend priority to frontend priority
            const priorityMap: Record<string, Procedure['priority']> = {
              'urgent': 'Emergency',
              'high': 'High',
              'medium': 'Medium',
              'low': 'Low',
            };
            
            const orderedAt = new Date(order.ordered_at);
            
            // Parse order description to extract details
            const details: Procedure['details'] = {};
            const description = order.description || '';
            const instructions = order.instructions || '';
            
            // Try to extract medication, dosage, route, frequency from description
            if (procedureType === 'injection' || procedureType === 'medication') {
              // Look for patterns like "Medication Name - Dosage" or "Medication (Route)"
              const medMatch = description.match(/([^-•]+?)(?:\s*[-•]\s*([^•]+))?/);
              if (medMatch) {
                details.medication = medMatch[1].trim();
                if (medMatch[2]) {
                  const rest = medMatch[2].trim();
                  // Try to extract dosage, route, frequency
                  const parts = rest.split(/[•,]/).map((p: string) => p.trim());
                  details.dosage = parts[0] || '';
                  details.route = parts.find((p: string) => /oral|im|iv|sc|sublingual|topical/i.test(p)) || '';
                  details.frequency = order.frequency || parts.find((p: string) => /daily|bd|tds|qds|prn/i.test(p)) || '';
                }
              }
              if (order.frequency) details.frequency = order.frequency;
            } else if (procedureType === 'dressing') {
              // Look for wound type and location in description
              const woundMatch = description.match(/([^-•]+?)(?:\s*[-•]\s*([^•]+))?/);
              if (woundMatch) {
                details.woundType = woundMatch[1].trim();
                details.woundLocation = woundMatch[2]?.trim() || '';
              }
              details.instructions = instructions || description;
            }
            
            return {
              id: String(order.id),
              type: procedureType,
              patientName: patient.full_name || `${patient.surname} ${patient.first_name}`,
              patientId: patient.patient_id || String(patient.id),
              personalNumber: patient.personal_number || '',
              age: patient.age || 0,
              gender: patient.gender || '',
              ward: '',
              orderedAt: order.ordered_at,
              orderedBy: order.ordered_by_name || 'Unknown',
              priority: priorityMap[order.priority] || 'Medium',
              allergies,
              details,
            } as Procedure;
          } catch (err) {
            console.error(`Error loading order ${order.id}:`, err);
            return null;
          }
        }));
        
        const validProcedures = transformedProcedures.filter((p): p is Procedure => p !== null);
        setProcedures(validProcedures);
      } catch (err) {
        console.error('Error loading nursing orders:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load procedures queue. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };
    
    loadOrders();
  }, []);

  // ==================== STATS ====================
  const stats = useMemo(() => ({
    total: procedures.length,
    emergency: procedures.filter(p => p.priority === 'Emergency').length,
    injections: procedures.filter(p => p.type === 'injection').length,
    dressings: procedures.filter(p => p.type === 'dressing').length,
    medications: procedures.filter(p => p.type === 'medication').length,
  }), [procedures]);

  // ==================== FILTERING & SORTING ====================
  const filteredProcedures = useMemo(() => {
    return procedures
      .filter(p => {
        const matchesSearch = p.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             p.patientId.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesType = typeFilter === 'all' || p.type === typeFilter;
        const matchesPriority = priorityFilter === 'all' || p.priority === priorityFilter;
        const matchesGender = genderFilter === 'all' || p.gender.toLowerCase() === genderFilter.toLowerCase();
        
        // Date filter (filter by ordered date)
        if (dateFilter !== 'all') {
          const orderedDate = new Date(p.orderedAt);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (dateFilter === 'today' && orderedDate.toDateString() !== today.toDateString()) return false;
          if (dateFilter === 'week') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            if (orderedDate < weekAgo) return false;
          }
          if (dateFilter === 'month') {
            const monthAgo = new Date(today);
            monthAgo.setMonth(monthAgo.getMonth() - 1);
            if (orderedDate < monthAgo) return false;
          }
        }
        
        return matchesSearch && matchesType && matchesPriority && matchesGender;
      })
      .sort((a, b) => {
        // Sort by priority first
        const order = { 'Emergency': 0, 'High': 1, 'Medium': 2, 'Low': 3 };
        if (order[a.priority] !== order[b.priority]) {
          return order[a.priority] - order[b.priority];
        }
        // Then by time (oldest first)
        return new Date(a.orderedAt).getTime() - new Date(b.orderedAt).getTime();
      });
  }, [procedures, searchQuery, typeFilter, priorityFilter, dateFilter, genderFilter]);

  // Paginated procedures
  const paginatedProcedures = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredProcedures.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredProcedures, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, typeFilter, priorityFilter, dateFilter, genderFilter]);

  // ==================== HANDLERS ====================
  const loadOrders = async () => {
    try {
      const ordersResult = await apiFetch<{ results: any[] }>('/nursing/orders/?status=pending&page_size=1000');
      const orders = ordersResult.results || [];
      
          const transformedProcedures = await Promise.all(orders.map(async (order: any) => {
        try {
          const patient = await patientService.getPatient(order.patient);
          
          // Load patient allergies from medical history
          let allergies: string[] = [];
          try {
            const history = await patientService.getPatientHistory(order.patient);
            if (history && history.allergies) {
              allergies = Array.isArray(history.allergies) 
                ? history.allergies 
                : typeof history.allergies === 'string' 
                  ? history.allergies.split(/[,\n]/).map((a: string) => a.trim()).filter((a: string) => a)
                  : [];
            }
          } catch (historyErr) {
            // If history fetch fails, continue without allergies
            console.warn(`Could not load allergies for patient ${order.patient}:`, historyErr);
          }
          
          const typeMap: Record<string, Procedure['type']> = {
            'injection': 'injection',
            'dressing': 'dressing',
            'wound_care': 'dressing',
            'medication': 'medication',
          };
          
          const procedureType = typeMap[order.order_type?.toLowerCase()] || 'medication';
          
          const priorityMap: Record<string, Procedure['priority']> = {
            'urgent': 'Emergency',
            'high': 'High',
            'medium': 'Medium',
            'low': 'Low',
          };
          
          // Parse order description to extract details
          const details: Procedure['details'] = {};
          const description = order.description || '';
          const instructions = order.instructions || '';
          
          // Try to extract medication, dosage, route, frequency from description
          if (procedureType === 'injection' || procedureType === 'medication') {
            // Look for patterns like "Medication Name - Dosage" or "Medication (Route)"
            const medMatch = description.match(/([^-•]+?)(?:\s*[-•]\s*([^•]+))?/);
            if (medMatch) {
              details.medication = medMatch[1].trim();
              if (medMatch[2]) {
                const rest = medMatch[2].trim();
                // Try to extract dosage, route, frequency
                const parts = rest.split(/[•,]/).map((p: string) => p.trim());
                details.dosage = parts[0] || '';
                details.route = parts.find((p: string) => /oral|im|iv|sc|sublingual|topical/i.test(p)) || '';
                details.frequency = order.frequency || parts.find((p: string) => /daily|bd|tds|qds|prn/i.test(p)) || '';
              }
            }
            if (order.frequency) details.frequency = order.frequency;
          } else if (procedureType === 'dressing') {
            // Look for wound type and location in description
            const woundMatch = description.match(/([^-•]+?)(?:\s*[-•]\s*([^•]+))?/);
            if (woundMatch) {
              details.woundType = woundMatch[1].trim();
              details.woundLocation = woundMatch[2]?.trim() || '';
            }
            details.instructions = instructions || description;
          }
          
          return {
            id: String(order.id),
            type: procedureType,
            patientName: patient.full_name || `${patient.surname} ${patient.first_name}`,
            patientId: patient.patient_id || String(patient.id),
            personalNumber: patient.personal_number || '',
            age: patient.age || 0,
            gender: patient.gender || '',
            ward: '',
            orderedAt: order.ordered_at,
            orderedBy: order.ordered_by_name || 'Unknown',
            priority: priorityMap[order.priority] || 'Medium',
            allergies,
            details,
          } as Procedure;
        } catch (err) {
          return null;
        }
      }));
      
      const validProcedures = transformedProcedures.filter((p): p is Procedure => p !== null);
      setProcedures(validProcedures);
      return validProcedures;
    } catch (err) {
      console.error('Error loading orders:', err);
      throw err;
    }
  };
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadOrders();
      toast.success('Queue refreshed');
    } catch (err) {
      toast.error('Failed to refresh queue');
    } finally {
      setIsRefreshing(false);
    }
  };

  const openPerformDialog = (procedure: Procedure) => {
    setSelectedProcedure(procedure);
    setIsPerformDialogOpen(true);
  };

  const handleComplete = async () => {
    if (!selectedProcedure) return;
    setIsSubmitting(true);
    
    try {
      const orderId = parseInt(selectedProcedure.id);
      if (isNaN(orderId)) {
        toast.error('Invalid order ID');
        return;
      }
      
      // Map frontend type to backend procedure_type
      const typeMap: Record<string, string> = {
        'injection': 'injection',
        'dressing': 'dressing',
        'medication': 'other',
      };
      
      // Get patient ID from procedure
      const patientId = parseInt(selectedProcedure.patientId) || parseInt(selectedProcedure.id);
      
      // Create procedure record with all form data
      let description = '';
      let notes = '';
      
      if (selectedProcedure.type === 'injection') {
        // Build comprehensive description for injection
        const injectionDetails = [
          selectedProcedure.details.medication || 'Injection',
          selectedProcedure.details.dosage && `Dosage: ${selectedProcedure.details.dosage}`,
          selectedProcedure.details.route && `Route: ${selectedProcedure.details.route}`,
          selectedProcedure.details.frequency && `Frequency: ${selectedProcedure.details.frequency}`,
        ].filter(Boolean).join(' • ');
        
        description = `Injection: ${injectionDetails}`;
        
        // Include all form fields in notes
        const injectionNotes = [
          injectionForm.site && `Site: ${injectionForm.site}`,
          injectionForm.batchNumber && `Batch #: ${injectionForm.batchNumber}`,
          injectionForm.expiryDate && `Expiry: ${injectionForm.expiryDate}`,
          injectionForm.manufacturer && `Manufacturer: ${injectionForm.manufacturer}`,
          injectionForm.notes && `Notes: ${injectionForm.notes}`,
        ].filter(Boolean).join(' | ');
        
        notes = injectionNotes || injectionForm.notes || '';
      } else if (selectedProcedure.type === 'dressing') {
        // Build comprehensive description for dressing
        const dressingDetails = [
          selectedProcedure.details.woundType || 'Wound',
          selectedProcedure.details.woundLocation && `Location: ${selectedProcedure.details.woundLocation}`,
          selectedProcedure.details.instructions && `Instructions: ${selectedProcedure.details.instructions}`,
        ].filter(Boolean).join(' • ');
        
        description = `Dressing: ${dressingDetails}`;
        
        // Include all form fields in notes
        const dressingNotes = [
          dressingForm.dressingType && `Type: ${dressingForm.dressingType}`,
          dressingForm.woundCondition && `Condition: ${dressingForm.woundCondition}`,
          dressingForm.woundSize && `Size: ${dressingForm.woundSize}`,
          dressingForm.drainage && `Drainage: ${dressingForm.drainage}`,
          dressingForm.painLevel && `Pain Level: ${dressingForm.painLevel}/10`,
          dressingForm.skinCondition && `Skin: ${dressingForm.skinCondition}`,
          dressingForm.observations && `Observations: ${dressingForm.observations}`,
        ].filter(Boolean).join(' | ');
        
        notes = dressingNotes || dressingForm.observations || '';
      } else {
        // Medication
        const medicationDetails = [
          selectedProcedure.details.medication || 'Medication',
          selectedProcedure.details.route && `Route: ${selectedProcedure.details.route}`,
          selectedProcedure.details.scheduledTime && `Scheduled: ${selectedProcedure.details.scheduledTime}`,
        ].filter(Boolean).join(' • ');
        
        description = `Medication: ${medicationDetails}`;
        
        const medicationNotes = [
          medicationForm.site && `Site: ${medicationForm.site}`,
          medicationForm.notes && `Notes: ${medicationForm.notes}`,
        ].filter(Boolean).join(' | ');
        
        notes = medicationNotes || medicationForm.notes || '';
      }
      
      const procedureData: any = {
        patient: patientId,
        procedure_type: typeMap[selectedProcedure.type] || 'other',
        description,
        site: injectionForm.site || medicationForm.site || '',
        notes,
      };
      
      // Create procedure
      await apiFetch('/nursing/procedures/', {
        method: 'POST',
        body: JSON.stringify(procedureData),
      });
      
      // Update order status to completed
      await apiFetch(`/nursing/orders/${orderId}/`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
      
      // Remove from local state
      setProcedures(prev => prev.filter(p => p.id !== selectedProcedure.id));
      
      const typeLabel = getTypeConfig(selectedProcedure.type).label;
      toast.success(`${typeLabel} completed for ${selectedProcedure.patientName}`, {
        description: 'Procedure recorded successfully'
      });

      setIsPerformDialogOpen(false);
      resetForms();
    } catch (err) {
      console.error('Error completing procedure:', err);
      toast.error('Failed to complete procedure. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForms = () => {
    setInjectionForm({ site: '', batchNumber: '', expiryDate: '', manufacturer: '', notes: '' });
    setDressingForm({ dressingType: '', woundCondition: '', woundSize: '', drainage: '', painLevel: '', skinCondition: '', observations: '' });
    setMedicationForm({ site: '', notes: '' });
  };

  // ==================== RENDER ====================
  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500">
                <Activity className="h-6 w-6 text-white" />
              </div>
              Procedures Queue
            </h1>
            <p className="text-muted-foreground mt-1">All pending procedures ordered by doctors</p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/nursing/procedures/history">
              <Button variant="outline">
                <History className="h-4 w-4 mr-2" />
                View History
              </Button>
            </Link>
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card className={`${stats.total > 0 ? 'bg-gradient-to-br from-rose-500/10 to-pink-500/10 border-rose-500/20' : ''}`}>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Pending</p>
              <p className={`text-3xl font-bold ${stats.total > 0 ? 'text-rose-500' : 'text-muted-foreground'}`}>{stats.total}</p>
            </CardContent>
          </Card>
          <Card className={stats.emergency > 0 ? 'border-rose-500/50 bg-rose-500/5' : ''}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-rose-500/10"><AlertTriangle className="h-4 w-4 text-rose-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Emergency</p>
                <p className={`text-xl font-bold ${stats.emergency > 0 ? 'text-rose-500' : 'text-muted-foreground'}`}>{stats.emergency}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10"><Syringe className="h-4 w-4 text-emerald-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Injections</p>
                <p className="text-xl font-bold text-emerald-500">{stats.injections}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-violet-500/10"><Bandage className="h-4 w-4 text-violet-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Dressings</p>
                <p className="text-xl font-bold text-violet-500">{stats.dressings}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10"><Pill className="h-4 w-4 text-blue-500" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Medications</p>
                <p className="text-xl font-bold text-blue-500">{stats.medications}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search patients..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="Procedure Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="injection">💉 Injections</SelectItem>
                    <SelectItem value="dressing">🩹 Dressings</SelectItem>
                    <SelectItem value="medication">💊 Medications</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="Emergency">🔴 Emergency</SelectItem>
                    <SelectItem value="High">🟠 High</SelectItem>
                    <SelectItem value="Medium">🔵 Medium</SelectItem>
                    <SelectItem value="Low">🟢 Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={genderFilter} onValueChange={setGenderFilter}>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="Gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Gender</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Queue List */}
        {filteredProcedures.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <CheckCircle2 className="h-16 w-16 text-emerald-500 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">All caught up!</h3>
              <p className="text-muted-foreground text-center">
                {procedures.length === 0 
                  ? "No pending procedures in the queue"
                  : "No procedures match your current filters"}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {paginatedProcedures.map((procedure) => {
              const typeConfig = getTypeConfig(procedure.type);
              const TypeIcon = typeConfig.icon;
              
              return (
                <Card key={procedure.id} className={`border-l-4 hover:shadow-md transition-shadow ${
                  procedure.priority === 'Emergency' ? 'border-l-rose-500' :
                  procedure.priority === 'High' ? 'border-l-amber-500' :
                  procedure.priority === 'Medium' ? 'border-l-blue-500' : 'border-l-emerald-500'
                }`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${typeConfig.bgColor}`}>
                        <TypeIcon className={`h-4 w-4 ${typeConfig.color}`} />
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + Badges + Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{procedure.patientName}</span>
                            <Badge className={`text-[10px] px-1.5 py-0 ${getPriorityColor(procedure.priority)}`}>{procedure.priority}</Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${typeConfig.bgColor} ${typeConfig.color}`}>{typeConfig.label}</Badge>
                            {procedure.allergies.length > 0 && (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-rose-500 text-rose-500">⚠️</Badge>
                            )}
                            {/* Procedure summary */}
                            <span className="text-[10px] text-muted-foreground hidden md:inline truncate max-w-[200px]">
                              {procedure.type === 'injection' && `${procedure.details.medication} ${procedure.details.dosage}`}
                              {procedure.type === 'dressing' && `${procedure.details.woundType} - ${procedure.details.woundLocation}`}
                              {procedure.type === 'medication' && procedure.details.medication}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button 
                              size="sm"
                              onClick={() => openPerformDialog(procedure)} 
                              className={`h-7 px-2 text-xs text-white ${
                                procedure.type === 'injection' ? 'bg-emerald-500 hover:bg-emerald-600' :
                                procedure.type === 'dressing' ? 'bg-violet-500 hover:bg-violet-600' :
                                'bg-blue-500 hover:bg-blue-600'
                              }`}
                            >
                              <TypeIcon className="h-3 w-3 mr-1" />
                              {procedure.type === 'injection' ? 'Give' : procedure.type === 'dressing' ? 'Do' : 'Give'}
                            </Button>
                          </div>
                        </div>
                        
                        {/* Row 2: Details */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{procedure.patientId}</span>
                          <span>•</span>
                          <span>{procedure.age}y {procedure.gender}</span>
                          <span>•</span>
                          <span>{procedure.ward}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{procedure.orderedBy}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{getTimeSince(procedure.orderedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {filteredProcedures.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredProcedures.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="procedures"
            />
          </Card>
        )}

        {/* Perform Dialog */}
        <Dialog open={isPerformDialogOpen} onOpenChange={setIsPerformDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {selectedProcedure && (() => {
                  const config = getTypeConfig(selectedProcedure.type);
                  const Icon = config.icon;
                  return <><Icon className={`h-5 w-5 ${config.color}`} />{config.label}</>;
                })()}
              </DialogTitle>
              <DialogDescription>{selectedProcedure?.patientName} - {selectedProcedure?.patientId}</DialogDescription>
            </DialogHeader>

            {selectedProcedure && (
              <div className="py-4 space-y-4">
                {/* Allergy Warning */}
                {selectedProcedure.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                    <p className="text-sm font-medium text-rose-600 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />Allergy Alert: {selectedProcedure.allergies.join(', ')}
                    </p>
                  </div>
                )}

                {/* Order Info */}
                <div className="p-4 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-1">Ordered by {selectedProcedure.orderedBy}</p>
                  {selectedProcedure.type === 'injection' && (
                    <>
                      <p className="font-medium text-foreground">{selectedProcedure.details.medication} - {selectedProcedure.details.dosage}</p>
                      <p className="text-sm text-muted-foreground">{selectedProcedure.details.route} • {selectedProcedure.details.frequency}</p>
                    </>
                  )}
                  {selectedProcedure.type === 'dressing' && (
                    <>
                      <p className="font-medium text-foreground">{selectedProcedure.details.woundType} wound - {selectedProcedure.details.woundLocation}</p>
                      <p className="text-sm text-muted-foreground">{selectedProcedure.details.instructions}</p>
                    </>
                  )}
                  {selectedProcedure.type === 'medication' && (
                    <>
                      <p className="font-medium text-foreground">{selectedProcedure.details.medication}</p>
                      <p className="text-sm text-muted-foreground">{selectedProcedure.details.route} • Scheduled: {selectedProcedure.details.scheduledTime}</p>
                    </>
                  )}
                </div>

                {/* Type-specific forms */}
                {selectedProcedure.type === 'injection' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Injection Site *</Label>
                      <Select value={injectionForm.site} onValueChange={(v) => setInjectionForm(p => ({ ...p, site: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Deltoid">Deltoid (Upper arm)</SelectItem>
                          <SelectItem value="Vastus Lateralis">Vastus Lateralis (Thigh)</SelectItem>
                          <SelectItem value="Dorsogluteal">Dorsogluteal (Buttock)</SelectItem>
                          <SelectItem value="Ventrogluteal">Ventrogluteal (Hip)</SelectItem>
                          <SelectItem value="Abdomen">Abdomen</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Batch Number *</Label>
                      <Input value={injectionForm.batchNumber} onChange={(e) => setInjectionForm(p => ({ ...p, batchNumber: e.target.value }))} placeholder="e.g., BATCH123456" />
                    </div>
                    <div className="space-y-2">
                      <Label>Expiry Date *</Label>
                      <Input type="date" value={injectionForm.expiryDate} onChange={(e) => setInjectionForm(p => ({ ...p, expiryDate: e.target.value }))} />
                    </div>
                    <div className="space-y-2">
                      <Label>Manufacturer</Label>
                      <Input value={injectionForm.manufacturer} onChange={(e) => setInjectionForm(p => ({ ...p, manufacturer: e.target.value }))} placeholder="e.g., Pfizer" />
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Notes</Label>
                      <Textarea value={injectionForm.notes} onChange={(e) => setInjectionForm(p => ({ ...p, notes: e.target.value }))} placeholder="Observations..." rows={2} />
                    </div>
                  </div>
                )}

                {selectedProcedure.type === 'dressing' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Dressing Type *</Label>
                      <Select value={dressingForm.dressingType} onValueChange={(v) => setDressingForm(p => ({ ...p, dressingType: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Gauze">Gauze</SelectItem>
                          <SelectItem value="Hydrocolloid">Hydrocolloid</SelectItem>
                          <SelectItem value="Foam">Foam</SelectItem>
                          <SelectItem value="Alginate">Alginate</SelectItem>
                          <SelectItem value="Transparent">Transparent</SelectItem>
                          <SelectItem value="Non-adherent">Non-adherent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Wound Condition *</Label>
                      <Select value={dressingForm.woundCondition} onValueChange={(v) => setDressingForm(p => ({ ...p, woundCondition: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Healing">Healing</SelectItem>
                          <SelectItem value="Infected">Infected</SelectItem>
                          <SelectItem value="Stagnant">Stagnant</SelectItem>
                          <SelectItem value="Deteriorating">Deteriorating</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Wound Size</Label>
                      <Input value={dressingForm.woundSize} onChange={(e) => setDressingForm(p => ({ ...p, woundSize: e.target.value }))} placeholder="e.g., 5x3 cm" />
                    </div>
                    <div className="space-y-2">
                      <Label>Drainage</Label>
                      <Select value={dressingForm.drainage} onValueChange={(v) => setDressingForm(p => ({ ...p, drainage: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="None">None</SelectItem>
                          <SelectItem value="Serous">Serous</SelectItem>
                          <SelectItem value="Serosanguinous">Serosanguinous</SelectItem>
                          <SelectItem value="Sanguinous">Sanguinous</SelectItem>
                          <SelectItem value="Purulent">Purulent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Pain Level (1-10)</Label>
                      <Select value={dressingForm.painLevel} onValueChange={(v) => setDressingForm(p => ({ ...p, painLevel: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>{[...Array(10)].map((_, i) => <SelectItem key={i} value={String(i + 1)}>{i + 1}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Skin Condition</Label>
                      <Select value={dressingForm.skinCondition} onValueChange={(v) => setDressingForm(p => ({ ...p, skinCondition: v }))}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Intact">Intact</SelectItem>
                          <SelectItem value="Erythema">Erythema</SelectItem>
                          <SelectItem value="Maceration">Maceration</SelectItem>
                          <SelectItem value="Excoriation">Excoriation</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-2 space-y-2">
                      <Label>Observations</Label>
                      <Textarea value={dressingForm.observations} onChange={(e) => setDressingForm(p => ({ ...p, observations: e.target.value }))} placeholder="Detailed observations..." rows={3} />
                    </div>
                  </div>
                )}

                {selectedProcedure.type === 'medication' && (
                  <div className="space-y-4">
                    {['IV', 'IM', 'SC'].includes(selectedProcedure.details.route || '') && (
                      <div className="space-y-2">
                        <Label>Injection Site</Label>
                        <Select value={medicationForm.site} onValueChange={(v) => setMedicationForm(p => ({ ...p, site: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="left-arm">Left Arm</SelectItem>
                            <SelectItem value="right-arm">Right Arm</SelectItem>
                            <SelectItem value="left-thigh">Left Thigh</SelectItem>
                            <SelectItem value="right-thigh">Right Thigh</SelectItem>
                            <SelectItem value="abdomen">Abdomen</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label>Notes</Label>
                      <Textarea value={medicationForm.notes} onChange={(e) => setMedicationForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any observations..." rows={2} />
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsPerformDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleComplete} disabled={isSubmitting} className={`text-white ${
                selectedProcedure?.type === 'injection' ? 'bg-emerald-500 hover:bg-emerald-600' :
                selectedProcedure?.type === 'dressing' ? 'bg-violet-500 hover:bg-violet-600' :
                'bg-blue-500 hover:bg-blue-600'
              }`}>
                {isSubmitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Recording...</> : <><CheckCircle2 className="h-4 w-4 mr-2" />Complete</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
