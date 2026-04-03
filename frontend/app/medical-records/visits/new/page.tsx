"use client";

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { patientService, visitService, formatPatientGenderLabel } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { 
  Calendar, User, Send, Stethoscope, ClipboardList, Search, AlertTriangle,
  MapPin, FileText, Users, CheckCircle2, Clock, Loader2, CheckCircle, X
} from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CLINICS } from '@/lib/constants/clinics';
import { normalizeClinicName } from '@/lib/utils/clinic-utils';
import { useLocationOptions } from '@/lib/hooks/use-location-options';

// NPA Clinics - standardized list
const clinics = CLINICS;

// Visit Types (matching backend choices)
const visitTypes = [
  { value: 'consultation', label: 'Consultation', description: 'New patient consultation' },
  { value: 'follow_up', label: 'Follow-up', description: 'Follow-up visit for existing condition' },
  { value: 'emergency', label: 'Emergency', description: 'Urgent medical attention required' },
  { value: 'routine', label: 'Routine Checkup', description: 'Routine health checkup' },
];

function NewVisitPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientIdParam = searchParams.get('patient');
  const prefDate = searchParams.get('date');
  const prefTime = searchParams.get('time');
  const prefVisitType = searchParams.get('visit_type');
  const { locations: locationOptions } = useLocationOptions();
  
  const [loading, setLoading] = useState(!!patientIdParam);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const [patients, setPatients] = useState<any[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<any | null>(null);
  const [patientSearch, setPatientSearch] = useState('');
  const [isSuccessDialogOpen, setIsSuccessDialogOpen] = useState(false);
  const [createdVisitData, setCreatedVisitData] = useState<{ visitId: string; patientName: string; date: string; time: string; location: string; clinic: string } | null>(null);

  const [formData, setFormData] = useState({
    patientId: patientIdParam || '',
    visitType: '',
    clinic: '', // Primary clinic (for backward compatibility)
    clinics: [] as string[], // All clinics for this visit
    location: '',
    visitDate: '',
    visitTime: '',
    notes: '',
  });

  // Set date/time on client only to avoid hydration mismatch (new Date() differs server vs client)
  useEffect(() => {
    setFormData(prev => ({
      ...prev,
      visitDate: prev.visitDate || prefDate || new Date().toISOString().split('T')[0],
      visitTime: prev.visitTime || (prefTime && prefTime.length >= 5 ? prefTime.slice(0, 5) : prefTime) || new Date().toTimeString().slice(0, 5),
      visitType: prev.visitType || prefVisitType || '',
    }));
  }, [prefDate, prefTime, prefVisitType]);

  const mapPatient = useCallback((p: any) => ({
    id: p.patient_id || '',
    numericId: p.id,
    name: p.full_name ?? '',
    age: p.age || 0,
    gender: formatPatientGenderLabel(p.gender),
    bloodGroup: p.blood_group || '',
    allergies: p.allergies ? String(p.allergies).split(/[,\n]/).map((a: string) => a.trim()).filter(Boolean) : [],
  }), []);

  // Preselect patient from ?patient= URL (patient_id string or numeric PK)
  useEffect(() => {
    if (!patientIdParam) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        let p: any = null;
        if (/^\d+$/.test(patientIdParam.trim())) {
          try {
            p = await patientService.getPatient(parseInt(patientIdParam, 10));
          } catch {
            p = null;
          }
        }
        if (!p) {
          const result = await patientService.getPatients({ search: patientIdParam, page_size: 10 });
          if (cancelled) return;
          p = result.results.find((r: any) => r.patient_id === patientIdParam) ?? null;
        }
        if (cancelled) return;
        if (p) {
          setSelectedPatient(mapPatient(p));
          setFormData(prev => ({ ...prev, patientId: p.patient_id || patientIdParam }));
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Error loading patient:', err);
        if (isAuthenticationError(err)) setAuthError(err);
        else setError('Failed to load patient.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [patientIdParam, mapPatient]);

  // Backend search: debounced by patientSearch
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const q = patientSearch.trim();
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
      searchTimeoutRef.current = null;
    }
    if (!q) {
      setPatients([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      searchTimeoutRef.current = null;
      try {
        const result = await patientService.getPatients({ search: q, page_size: 50 });
        setPatients((result.results || []).map(mapPatient));
      } catch (err) {
        if (isAuthenticationError(err)) setAuthError(err);
        else setPatients([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [patientSearch, mapPatient]);

  const handleInputChange = (field: string, value: string) => setFormData(prev => ({ ...prev, [field]: value }));

  const handleClinicToggle = (clinicName: string) => {
    setFormData(prev => {
      const currentClinics = [...prev.clinics];
      const index = currentClinics.indexOf(clinicName);
      
      if (index > -1) {
        // Remove clinic if already selected
        currentClinics.splice(index, 1);
      } else {
        // Add clinic if not selected
        currentClinics.push(clinicName);
      }
      
      return { ...prev, clinics: currentClinics };
    });
  };

  const handlePatientSelect = (patientId: string) => {
    const patient = patients.find(p => p.id === patientId);
    if (patient) { 
      setSelectedPatient(patient); 
      setFormData(prev => ({ ...prev, patientId })); 
    }
  };

  // Calculate completion percentage
  const completionPercentage = useMemo(() => {
    let completed = 0;
    let total = 5; // patient, visitType, clinic(s), location, date

    if (selectedPatient) completed++;
    if (formData.visitType) completed++;
    if (formData.clinics.length > 0) completed++; // At least one clinic selected
    if (formData.location) completed++;
    if (formData.visitDate) completed++;

    return Math.round((completed / total) * 100);
  }, [selectedPatient, formData]);

  const handleSubmit = async () => {
    if (!selectedPatient || !formData.visitType || formData.clinics.length === 0 || !formData.location) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setIsSubmitting(true);

      // Prepare visit data for API
      // Ensure proper data types and format
      const patientId = selectedPatient.numericId || selectedPatient.id;
      const primaryClinic = formData.clinics[0]; // First clinic is primary
      const visitData = {
        patient: typeof patientId === 'string' ? parseInt(patientId, 10) : patientId,
        visit_type: formData.visitType,
        clinic: normalizeClinicName(primaryClinic) || primaryClinic.trim(),
        clinics: formData.clinics.map((c) => normalizeClinicName(c)).filter((x): x is string => Boolean(x)),
        location: formData.location || '',
        date: formData.visitDate,
        // Ensure time is in HH:MM:SS format for Django
        time: formData.visitTime && formData.visitTime.length === 5 ? `${formData.visitTime}:00` : formData.visitTime,
        clinical_notes: formData.notes || '',
        status: 'scheduled',
      };

      console.log('Creating visit with data:', visitData);

      const createdVisit = await visitService.createVisit(visitData);
      
      // Get visit ID
      const visitId = createdVisit.visit_id || String(createdVisit.id);
      
      // Format date for display
      const formattedDate = new Date(formData.visitDate).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "2-digit",
      });
      
      // Store created visit data for success dialog
      setCreatedVisitData({
        visitId,
        patientName: selectedPatient.name,
        date: formattedDate,
        time: formData.visitTime,
        location: formData.location,
        clinic: formData.clinics.join(', '), // Show all clinics
      });
      
      // Show success dialog
      setIsSuccessDialogOpen(true);
      setIsSubmitting(false);
      
      // Show toast notification
      toast.success('Patient visit has been created waiting to be sent to nursing in manage visit');
      
    } catch (err: any) {
      console.error('Error creating visit:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        // Try to extract more detailed error message from the API response
        let errorMessage = 'Failed to create visit. Please try again.';
        
        if (err.apiMessage) {
          errorMessage = err.apiMessage;
        } else if (err.message) {
          // Check if the message contains useful information
          const msg = err.message;
          if (msg.includes('non_field_errors')) {
            // Try to extract the actual error from the serialized error
            errorMessage = 'This patient already has an open visit for this date. Please complete or cancel the existing visit first.';
          } else if (msg !== 'Request failed. Please try again') {
            errorMessage = msg;
          }
        }
        
        toast.error(errorMessage);
        setIsSubmitting(false);
      }
    }
  };

  const selectedVisitType = visitTypes.find(v => v.value === formData.visitType);

  // Loading state
  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading patients...</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Create Visit</h1>
          <p className="text-muted-foreground mt-1">
            Register a new patient visit or encounter at an NPA medical facility
          </p>
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Patient Selection Card */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="h-5 w-5 text-blue-500" />
                  Select Patient
                </CardTitle>
                <CardDescription>Search and select the patient for this visit</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selectedPatient ? (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input 
                        placeholder="Search by name or patient ID..." 
                        value={patientSearch} 
                        onChange={(e) => setPatientSearch(e.target.value)} 
                        className="pl-10" 
                      />
                    </div>
                    <div className="space-y-2 max-h-[280px] overflow-y-auto">
                      {searching && (
                        <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>Searching...</span>
                        </div>
                      )}
                      {!searching && patients.length === 0 && patientSearch.trim() && (
                        <p className="text-center text-muted-foreground py-6">No patients found. Try a different search.</p>
                      )}
                      {!searching && patients.length === 0 && !patientSearch.trim() && (
                        <p className="text-center text-muted-foreground py-6">Type to search by name or patient ID</p>
                      )}
                      {!searching && patients.map(patient => (
                        <div 
                          key={patient.id} 
                          onClick={() => handlePatientSelect(patient.id)} 
                          className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 cursor-pointer transition-all"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium">
                              {patient.name.split(' ').map((n: string) => n[0]).join('')}
                            </div>
                            <div>
                              <p className="font-medium text-foreground">{patient.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {patient.id} 
                                {patient.age > 0 && ` • ${patient.age}y`} 
                                {patient.gender && ` ${patient.gender}`}
                              </p>
                            </div>
                          </div>
                          {patient.bloodGroup && (
                            <Badge variant="outline" className="border-rose-500/30 text-rose-600 dark:text-rose-400">
                              {patient.bloodGroup}
                            </Badge>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between p-4 rounded-lg border border-primary/30 bg-primary/5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-lg font-bold text-white">
                        {selectedPatient.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{selectedPatient.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedPatient.id}
                          {selectedPatient.age > 0 && ` • ${selectedPatient.age}y`}
                          {selectedPatient.gender && ` ${selectedPatient.gender}`}
                          {selectedPatient.bloodGroup && ` • Blood: ${selectedPatient.bloodGroup}`}
                        </p>
                        {selectedPatient.allergies && selectedPatient.allergies.length > 0 && (
                          <div className="flex items-center gap-1 mt-1">
                            <AlertTriangle className="h-3 w-3 text-destructive" />
                            <span className="text-xs text-destructive">Allergies: {selectedPatient.allergies.join(', ')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSelectedPatient(null)}>Change</Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Visit Details Card */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-emerald-500" />
                    Visit Details
                  </CardTitle>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>{completionPercentage}% complete</span>
                  </div>
                </div>
                <Progress value={completionPercentage} className="h-1" />
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Visit Type Selection */}
                <div className="space-y-3">
                  <Label className="text-base font-medium">Visit Type *</Label>
                  <div className="grid grid-cols-3 gap-3">
                    {visitTypes.map((type) => (
                      <div
                        key={type.value}
                        onClick={() => handleInputChange('visitType', type.value)}
                        className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                          formData.visitType === type.value 
                            ? 'border-teal-500 bg-teal-500/10' 
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <p className={`font-medium ${formData.visitType === type.value ? 'text-teal-600 dark:text-teal-400' : 'text-foreground'}`}>
                          {type.label}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">{type.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />

                {/* Clinic & Location */}
                <div className="space-y-4">
                  {/* Multi-Clinic Selection */}
                  <div className="space-y-3">
                    <Label>Clinics *</Label>
                    <p className="text-xs text-muted-foreground">Select one or more clinics for this visit (e.g., GOPD, Eye, Physiotherapy)</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-[300px] overflow-y-auto p-2 border rounded-lg">
                      {clinics.map((clinic) => {
                        const isSelected = formData.clinics.includes(clinic);
                        return (
                          <div
                            key={clinic}
                            onClick={() => handleClinicToggle(clinic)}
                            className={`p-2 rounded-md cursor-pointer transition-all text-center ${
                              isSelected
                                ? 'border-teal-500 bg-teal-500/10'
                                : 'border-border hover:border-primary/50'
                            }`}
                          >
                            <p className={`font-medium text-sm ${isSelected ? 'text-teal-600 dark:text-teal-400' : 'text-foreground'}`}>
                              {clinic}
                            </p>
                            {isSelected && (
                              <CheckCircle className="h-3 w-3 mx-auto mt-1 text-teal-600 dark:text-teal-400" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {formData.clinics.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {formData.clinics.map((clinic) => (
                          <Badge key={clinic} variant="secondary" className="gap-1">
                            {clinic}
                            <button
                              onClick={() => handleClinicToggle(clinic)}
                              className="ml-1 hover:text-destructive"
                              type="button"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Location */}
                  <div className="space-y-2">
                    <Label>Location *</Label>
                    <Select value={formData.location} onValueChange={(v) => handleInputChange('location', v)} disabled={locationOptions.length === 0}>
                      <SelectTrigger>
                        <SelectValue placeholder={locationOptions.length === 0 ? "No locations—add clinics in Admin" : "Select location"} />
                      </SelectTrigger>
                      <SelectContent>
                        {locationOptions.map((loc) => (
                          <SelectItem key={loc.value} value={loc.value}>{loc.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Date & Time */}
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input 
                      type="date" 
                      value={formData.visitDate} 
                      onChange={(e) => handleInputChange('visitDate', e.target.value)} 
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time</Label>
                    <Input 
                      type="time" 
                      value={formData.visitTime} 
                      onChange={(e) => handleInputChange('visitTime', e.target.value)} 
                    />
                  </div>
                </div>

                <Separator />

                {/* Notes */}
                <div className="space-y-2">
                  <Label>Notes / Special Instructions</Label>
                  <Textarea 
                    value={formData.notes} 
                    onChange={(e) => handleInputChange('notes', e.target.value)} 
                    placeholder="Any special instructions, referral notes, or additional information..." 
                    rows={3} 
                  />
                </div>

                {/* Submit Button */}
                <div className="flex justify-end pt-4">
                  <Button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting || !selectedPatient || !formData.visitType || formData.clinics.length === 0 || !formData.location}
                    className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creating...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-2" />
                        Create Visit
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {/* Summary Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3 text-sm">
                  <div className="flex items-start justify-between">
                    <span className="text-muted-foreground">Patient</span>
                    <div className="flex items-center gap-1">
                      {selectedPatient ? (
                        <>
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <span className="font-medium text-right max-w-[120px] truncate">{selectedPatient.name}</span>
                        </>
                      ) : (
                        <>
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Not selected</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Separator />
                  {selectedVisitType?.label && (
                    <div className="flex items-start justify-between">
                      <span className="text-muted-foreground">Type</span>
                      <span className="font-medium capitalize">{selectedVisitType.label}</span>
                    </div>
                  )}
                  {formData.clinics.length > 0 && (
                    <div className="flex items-start justify-between">
                      <span className="text-muted-foreground">Clinic</span>
                      <span className="font-medium text-right max-w-[120px] truncate">
                        {formData.clinics.join(', ')}
                      </span>
                    </div>
                  )}
                  {formData.location?.trim() && (
                    <div className="flex items-start justify-between">
                      <span className="text-muted-foreground">Location</span>
                      <span className="font-medium text-right max-w-[120px] truncate">{formData.location}</span>
                    </div>
                  )}
                  <Separator />
                  {formData.visitDate && (
                    <div className="flex items-start justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span className="font-medium">{formData.visitDate}</span>
                    </div>
                  )}
                  {formData.visitTime && (
                    <div className="flex items-start justify-between">
                      <span className="text-muted-foreground">Time</span>
                      <span className="font-medium">{formData.visitTime}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Workflow Info Card */}
            <Card className="border-blue-500/20 bg-blue-500/5">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Stethoscope className="h-5 w-5 text-blue-500 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-600 dark:text-blue-400 text-sm">Visit Workflow</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      After creating the visit, go to <strong>Manage Visits</strong> to change the status to <strong>In Progress</strong>. This will automatically send the patient to the <strong>Nursing Pool Queue</strong> where nursing officers will record vital signs.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Links Card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Quick Links</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/patients/new')}>
                  <User className="h-4 w-4 mr-2" />
                  Register New Patient
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/visits')}>
                  <FileText className="h-4 w-4 mr-2" />
                  View All Visits
                </Button>
                <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => router.push('/medical-records/patients')}>
                  <Users className="h-4 w-4 mr-2" />
                  Manage Patients
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Success Dialog */}
        <Dialog open={isSuccessDialogOpen} onOpenChange={setIsSuccessDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Visit Created Successfully!
              </DialogTitle>
            </DialogHeader>
            {createdVisitData && (
              <div className="space-y-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                  <div className="space-y-2">
                    <p className="font-medium text-green-800 dark:text-green-200">
                      Visit ID: {createdVisitData.visitId}
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Visit scheduled for <strong>{createdVisitData.patientName}</strong>
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Date: {createdVisitData.date} at {createdVisitData.time}
                    </p>
                    <p className="text-sm text-green-700 dark:text-green-300">
                      Location: {createdVisitData.location} - {createdVisitData.clinic}
                    </p>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">
                  <p>
                    The visit has been created and is ready to be sent to nursing staff for vital signs recording.
                  </p>
                  <p className="mt-2 text-blue-600 dark:text-blue-400">
                    Next step: Go to Manage Visits to forward this patient to the Nursing Pool Queue.
                  </p>
                </div>
              </div>
            )}
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => router.push('/medical-records/visits')}
                className="w-full sm:w-auto"
              >
                View in Manage Visits
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setIsSuccessDialogOpen(false);
                  setCreatedVisitData(null);
                  // Reset form
                  setSelectedPatient(null);
                  setFormData({
                    patientId: '',
                    visitType: '',
                    clinic: '',
                    clinics: [],
                    location: '',
                    visitDate: new Date().toISOString().split('T')[0],
                    visitTime: new Date().toTimeString().slice(0, 5),
                    notes: '',
                  });
                }}
                className="w-full sm:w-auto"
              >
                Create Another Visit
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setIsSuccessDialogOpen(false);
                  setCreatedVisitData(null);
                  router.push('/medical-records/visits');
                }}
                className="w-full sm:w-auto"
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

export default function NewVisitPage() {
  return (
    <Suspense fallback={
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
        </div>
      </DashboardLayout>
    }>
      <NewVisitPageContent />
    </Suspense>
  );
}
