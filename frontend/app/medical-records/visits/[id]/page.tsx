"use client";

import { useState, useEffect, use } from 'react';
import React from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { visitService, patientService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { ArrowLeft, Edit, Printer, Heart, ClipboardList, Pill, TestTube, Stethoscope, FileText, Plus, Save, AlertTriangle, CheckCircle, Trash2, Loader2 } from 'lucide-react';

const icdCodes = [
  { code: 'E11.9', description: 'Type 2 Diabetes Mellitus without complications' },
  { code: 'I10', description: 'Essential (primary) Hypertension' },
  { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified' },
  { code: 'R51', description: 'Headache' },
  { code: 'K21.0', description: 'Gastro-esophageal reflux disease with esophagitis' },
  { code: 'M54.5', description: 'Low back pain' },
];

const commonDrugs = ['Metformin', 'Lisinopril', 'Amlodipine', 'Aspirin', 'Paracetamol', 'Ibuprofen', 'Omeprazole', 'Amoxicillin', 'Ciprofloxacin', 'Metronidazole'];
const labTests = ['Complete Blood Count (CBC)', 'Fasting Blood Sugar (FBS)', 'HbA1c', 'Lipid Profile', 'Liver Function Test', 'Kidney Function Test', 'Urinalysis', 'Thyroid Function Test', 'Electrolytes', 'Malaria Parasite'];

export default function VisitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const visitId = resolvedParams.id;
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  
  const [visit, setVisit] = useState<any>(null);
  const [patient, setPatient] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Data states
  const [diagnoses, setDiagnoses] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [labOrders, setLabOrders] = useState<any[]>([]);

  // Load visit data from API
  useEffect(() => {
    const loadVisitData = async () => {
      if (!visitId) return;
      
      try {
        setLoading(true);
        setError(null);

        // Check if visitId is numeric or a string ID (like "VIS-2024-0127")
        const numericId = Number(visitId);
        let visitData;
        
        if (!isNaN(numericId) && numericId > 0) {
          // It's a numeric ID, use it directly
          visitData = await visitService.getVisit(numericId);
        } else {
          // It's a string ID, search for the visit
          const visitsResult = await visitService.getVisits({ search: visitId, page_size: 100 });
          const foundVisit = visitsResult.results.find(
            (v: any) => (v.visit_id || String(v.id)) === visitId
          );
          
          if (!foundVisit) {
            throw new Error(`Visit with ID "${visitId}" not found`);
          }
          
          // Get full visit details using numeric ID
          visitData = await visitService.getVisit(foundVisit.id);
        }
        
        // Transform visit data
        const transformedVisit = {
          id: visitData.visit_id || String(visitData.id),
          patientId: String(visitData.patient),
          date: visitData.date || '',
          time: visitData.time || '',
          type: visitData.visit_type || 'consultation', // Use backend value (lowercase)
          department: visitData.clinic || '',
          doctor: visitData.doctor_name || 'Doctor',
          status: visitData.status === 'scheduled' ? 'Scheduled' :
                 visitData.status === 'in_progress' ? 'In Progress' :
                 visitData.status === 'completed' ? 'Completed' :
                 visitData.status === 'cancelled' ? 'Cancelled' : visitData.status,
          chiefComplaint: visitData.chief_complaint || '',
          presentingIllness: (visitData as any).presenting_illness || visitData.clinical_notes || '',
          vitals: {
            bp: (visitData as any).vitals?.blood_pressure || '',
            pulse: (visitData as any).vitals?.pulse_rate || '',
            temp: (visitData as any).vitals?.temperature || '',
            respRate: (visitData as any).vitals?.respiratory_rate || '',
            spo2: (visitData as any).vitals?.oxygen_saturation || '',
            weight: (visitData as any).vitals?.weight || '',
            height: (visitData as any).vitals?.height || '',
          },
        };

        setVisit(transformedVisit);
        setClinicalNotes(visitData.clinical_notes || '');

        // Load patient data
        try {
          const patientData = await patientService.getPatient(visitData.patient);
          setPatient({
            id: patientData.patient_id || String(patientData.id),
            name: patientData.full_name || `${patientData.first_name} ${patientData.surname}`,
            age: patientData.age || 0,
            gender: patientData.gender === 'male' ? 'Male' : 'Female',
            bloodGroup: patientData.blood_group || '',
            allergies: [], // TODO: Load from patient allergies if available
          });
        } catch (err) {
          console.error('Failed to load patient data:', err);
          // Continue without patient data
        }

        // TODO: Load diagnoses, prescriptions, lab orders from backend APIs
        // For now, keep empty arrays - these will be added later when APIs are available
        setDiagnoses([]);
        setPrescriptions([]);
        setLabOrders([]);

      } catch (err) {
        console.error('Error loading visit data:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load visit data. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadVisitData();
  }, [visitId]);

  // Modal states
  const [isAddDiagnosisOpen, setIsAddDiagnosisOpen] = useState(false);
  const [isAddPrescriptionOpen, setIsAddPrescriptionOpen] = useState(false);
  const [isAddLabOrderOpen, setIsAddLabOrderOpen] = useState(false);
  const [isCompleteVisitOpen, setIsCompleteVisitOpen] = useState(false);
  const [isEditVitalsOpen, setIsEditVitalsOpen] = useState(false);

  // Form states
  const [newDiagnosis, setNewDiagnosis] = useState({ code: '', description: '', type: 'Primary' });
  const [newPrescription, setNewPrescription] = useState({ drug: '', dosage: '', frequency: '', duration: '', instructions: '' });
  const [newLabOrder, setNewLabOrder] = useState({ test: '', priority: 'Routine' });
  const defaultVitals = { bp: '', pulse: '', temp: '', respRate: '', spo2: '', weight: '', height: '' };
  const [editVitals, setEditVitals] = useState(defaultVitals);
  
  // Update editVitals when visit loads
  useEffect(() => {
    if (visit?.vitals) {
      setEditVitals(visit.vitals);
    }
  }, [visit]);

  const handleSaveNotes = async () => {
    if (!visitId || !visit) return;
    
    try {
      setIsSaving(true);
      await visitService.updateVisit(visitId, { clinical_notes: clinicalNotes });
      toast.success('Clinical notes saved');
    } catch (err: any) {
      console.error('Error saving notes:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to save notes. Please try again.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDiagnosis = () => {
    if (newDiagnosis.code && newDiagnosis.description) {
      setDiagnoses(prev => [...prev, { id: Date.now(), ...newDiagnosis }]);
      setNewDiagnosis({ code: '', description: '', type: 'Primary' });
      setIsAddDiagnosisOpen(false);
      toast.success('Diagnosis added');
    }
  };

  const handleRemoveDiagnosis = (id: number) => {
    setDiagnoses(prev => prev.filter(d => d.id !== id));
    toast.success('Diagnosis removed');
  };

  const handleAddPrescription = () => {
    if (newPrescription.drug && newPrescription.dosage && newPrescription.frequency) {
      setPrescriptions(prev => [...prev, { id: Date.now(), ...newPrescription }]);
      setNewPrescription({ drug: '', dosage: '', frequency: '', duration: '', instructions: '' });
      setIsAddPrescriptionOpen(false);
      toast.success('Prescription added');
    }
  };

  const handleRemovePrescription = (id: number) => {
    setPrescriptions(prev => prev.filter(p => p.id !== id));
    toast.success('Prescription removed');
  };

  const handleAddLabOrder = () => {
    if (newLabOrder.test) {
      setLabOrders(prev => [...prev, { id: Date.now(), test: newLabOrder.test, status: 'Pending', result: '-' }]);
      setNewLabOrder({ test: '', priority: 'Routine' });
      setIsAddLabOrderOpen(false);
      toast.success('Lab test ordered');
    }
  };

  const handleRemoveLabOrder = (id: number) => {
    setLabOrders(prev => prev.filter(l => l.id !== id));
    toast.success('Lab order cancelled');
  };

  const handleSaveVitals = async () => {
    if (!visitId) return;
    
    try {
      // TODO: Save vitals to backend when API is available
      // For now, just update local state
      setVisit((prev: any) => prev ? { ...prev, vitals: editVitals } : null);
      setIsEditVitalsOpen(false);
      toast.success('Vitals updated');
    } catch (err: any) {
      console.error('Error saving vitals:', err);
      toast.error(err.message || 'Failed to save vitals. Please try again.');
    }
  };

  const handleCompleteVisit = async () => {
    if (!visitId) return;
    
    try {
      await visitService.updateVisit(visitId, { status: 'completed' });
      setVisit((prev: any) => prev ? { ...prev, status: 'Completed' } : null);
      setIsCompleteVisitOpen(false);
      toast.success('Visit marked as completed');
    } catch (err: any) {
      console.error('Error completing visit:', err);
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        toast.error(err.message || 'Failed to complete visit. Please try again.');
      }
    }
  };

  const handlePrint = () => {
    toast.info('Opening print preview...');
    window.print();
  };

  const handleSelectICD = (code: string) => {
    const selected = icdCodes.find(c => c.code === code);
    if (selected) {
      setNewDiagnosis(prev => ({ ...prev, code: selected.code, description: selected.description }));
    }
  };

  // Loading state
  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6">
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading visit details...</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // Error state
  if (error || !visit) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6">
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <p className="text-lg font-medium text-red-600 dark:text-red-400 mb-2">
                {error || 'Visit not found'}
              </p>
              <Button variant="outline" onClick={() => router.push('/medical-records/visits')} asChild>
                <Link href="/medical-records/visits">Back to Visits</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Link href="/medical-records" className="hover:text-primary">Medical Records</Link>
              <span>/</span>
              <Link href="/medical-records/visits" className="hover:text-primary">Visits</Link>
              <span>/</span>
              <span>{visit.id}</span>
            </div>
            
            <div className="flex items-center gap-4 mb-4">
              <h1 className="text-2xl font-bold text-foreground">Visit: {visit.id}</h1>
              <Badge variant="outline" className={visit.status === 'Completed' ? 'border-muted-foreground/50 text-muted-foreground' : 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10'}>{visit.status}</Badge>
              <Badge variant="outline" className="border-primary/50 text-primary">{visit.type}</Badge>
            </div>

            <Card className="border-border bg-card">
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-xl font-bold text-white">
                    {patient ? patient.name.split(' ').map((n: string) => n[0]).join('') : '?'}
                  </div>
                  <div className="flex-1">
                    {patient ? (
                      <>
                        <Link href="/medical-records/patients" className="text-lg font-semibold text-foreground hover:text-primary">{patient.name}</Link>
                        <p className="text-sm text-muted-foreground">
                          {patient.id} • {patient.age > 0 ? `${patient.age}y` : ''} {patient.gender}
                          {patient.bloodGroup && ` • Blood: ${patient.bloodGroup}`}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-lg font-semibold text-foreground">Patient {visit.patientId}</p>
                        <p className="text-sm text-muted-foreground">Loading patient details...</p>
                      </>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground">{visit.date} {visit.time && `at ${visit.time}`}</p>
                    <p className="text-sm text-muted-foreground">{visit.department} • {visit.doctor}</p>
                  </div>
                </div>
                {patient && patient.allergies && patient.allergies.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 p-2 rounded bg-destructive/10 border border-destructive/20">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">Allergies: {patient.allergies.join(', ')}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted border border-border p-1">
            <TabsTrigger value="summary" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><ClipboardList className="h-4 w-4 mr-2" />Summary</TabsTrigger>
            <TabsTrigger value="vitals" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Heart className="h-4 w-4 mr-2" />Vitals</TabsTrigger>
            <TabsTrigger value="notes" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><FileText className="h-4 w-4 mr-2" />Clinical Notes</TabsTrigger>
            <TabsTrigger value="diagnosis" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Stethoscope className="h-4 w-4 mr-2" />Diagnosis</TabsTrigger>
            <TabsTrigger value="prescriptions" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Pill className="h-4 w-4 mr-2" />Prescriptions</TabsTrigger>
            <TabsTrigger value="orders" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><TestTube className="h-4 w-4 mr-2" />Lab Orders</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border bg-card"><CardHeader><CardTitle className="text-foreground">Chief Complaint</CardTitle></CardHeader><CardContent><p className="text-foreground">{visit.chiefComplaint || 'Not provided'}</p></CardContent></Card>
              <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-foreground">Vital Signs</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => { setEditVitals(visit.vitals || defaultVitals); setIsEditVitalsOpen(true); }}><Edit className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div><p className="text-2xl font-bold text-foreground">{visit.vitals?.bp || '-'}</p><p className="text-xs text-muted-foreground">BP (mmHg)</p></div>
                    <div><p className="text-2xl font-bold text-foreground">{visit.vitals?.pulse || '-'}</p><p className="text-xs text-muted-foreground">Pulse (bpm)</p></div>
                    <div><p className="text-2xl font-bold text-foreground">{visit.vitals?.temp ? `${visit.vitals.temp}°C` : '-'}</p><p className="text-xs text-muted-foreground">Temp</p></div>
                    <div><p className="text-2xl font-bold text-foreground">{visit.vitals?.spo2 ? `${visit.vitals.spo2}%` : '-'}</p><p className="text-xs text-muted-foreground">SpO2</p></div>
                    <div><p className="text-2xl font-bold text-foreground">{visit.vitals?.weight ? `${visit.vitals.weight}kg` : '-'}</p><p className="text-xs text-muted-foreground">Weight</p></div>
                    <div><p className="text-2xl font-bold text-foreground">{visit.vitals?.respRate || '-'}</p><p className="text-xs text-muted-foreground">Resp Rate</p></div>
                  </div>
                </CardContent>
              </Card>
              <Card className="border-border bg-card lg:col-span-2"><CardHeader><CardTitle className="text-foreground">History of Present Illness</CardTitle></CardHeader><CardContent><p className="text-foreground">{visit.presentingIllness}</p></CardContent></Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-foreground flex items-center gap-2"><Stethoscope className="h-5 w-5 text-blue-500" />Diagnoses ({diagnoses.length})</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setIsAddDiagnosisOpen(true)}><Plus className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {diagnoses.map((d) => (
                    <div key={d.id} className="flex items-center justify-between p-3 rounded bg-muted/50">
                      <div><p className="font-medium text-foreground">{d.description}</p><p className="text-xs text-muted-foreground">ICD-10: {d.code}</p></div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={d.type === 'Primary' ? 'border-blue-500/50 text-blue-600 dark:text-blue-400' : 'border-muted-foreground/50 text-muted-foreground'}>{d.type}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveDiagnosis(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="border-border bg-card">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-foreground flex items-center gap-2"><Pill className="h-5 w-5 text-violet-500" />Prescriptions ({prescriptions.length})</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setIsAddPrescriptionOpen(true)}><Plus className="h-4 w-4" /></Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  {prescriptions.map((p) => (
                    <div key={p.id} className="p-3 rounded bg-muted/50">
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-foreground">{p.drug} {p.dosage}</p>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="border-violet-500/30 text-violet-600 dark:text-violet-400">{p.frequency}</Badge>
                          <Button variant="ghost" size="sm" onClick={() => handleRemovePrescription(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{p.duration} • {p.instructions}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="vitals">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-foreground">Vital Signs</CardTitle>
                <Button onClick={() => { setEditVitals(visit.vitals || defaultVitals); setIsEditVitalsOpen(true); }}><Edit className="h-4 w-4 mr-2" />Edit Vitals</Button>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                  {[
                    { label: 'Blood Pressure', value: visit.vitals?.bp || '-', unit: 'mmHg', color: 'text-rose-500' },
                    { label: 'Pulse Rate', value: visit.vitals?.pulse || '-', unit: 'bpm', color: 'text-red-500' },
                    { label: 'Temperature', value: visit.vitals?.temp ? `${visit.vitals.temp}°C` : '-', unit: '°C', color: 'text-amber-500' },
                    { label: 'Respiratory Rate', value: visit.vitals?.respRate || '-', unit: '/min', color: 'text-blue-500' },
                    { label: 'SpO2', value: visit.vitals?.spo2 ? `${visit.vitals.spo2}%` : '-', unit: '%', color: 'text-cyan-500' },
                    { label: 'Weight', value: visit.vitals?.weight ? `${visit.vitals.weight}kg` : '-', unit: 'kg', color: 'text-emerald-500' },
                    { label: 'Height', value: visit.vitals?.height ? `${visit.vitals.height}cm` : '-', unit: 'cm', color: 'text-violet-500' },
                    { label: 'BMI', value: visit.vitals?.weight && visit.vitals?.height 
                      ? (parseFloat(visit.vitals.weight) / Math.pow(parseFloat(visit.vitals.height)/100, 2)).toFixed(1)
                      : '-', unit: 'kg/m²', color: 'text-pink-500' }
                  ].map((v, i) => (
                    <Card key={i} className="border-border bg-muted/30"><CardContent className="p-4 text-center"><p className={`text-3xl font-bold ${v.color}`}>{v.value}</p><p className="text-sm text-muted-foreground">{v.unit}</p><p className="text-xs text-muted-foreground mt-2">{v.label}</p></CardContent></Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="notes">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-foreground">Clinical Notes</CardTitle>
                <Button onClick={handleSaveNotes} disabled={isSaving} className="bg-primary hover:bg-primary/90"><Save className="h-4 w-4 mr-2" />{isSaving ? 'Saving...' : 'Save Notes'}</Button>
              </CardHeader>
              <CardContent><Textarea value={clinicalNotes} onChange={(e) => setClinicalNotes(e.target.value)} placeholder="Enter clinical notes, observations, examination findings..." className="min-h-[300px]" /></CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="diagnosis">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-foreground">Diagnoses (ICD-10)</CardTitle>
                <Button onClick={() => setIsAddDiagnosisOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Diagnosis</Button>
              </CardHeader>
              <CardContent>
                <table className="w-full"><thead><tr className="border-b border-border"><th className="text-left p-3 text-sm font-medium text-muted-foreground">ICD-10 Code</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Description</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Type</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Actions</th></tr></thead>
                <tbody>{diagnoses.map((d) => (<tr key={d.id} className="border-b border-border"><td className="p-3 text-primary font-mono">{d.code}</td><td className="p-3 text-foreground">{d.description}</td><td className="p-3"><Badge variant="outline" className={d.type === 'Primary' ? 'border-blue-500/50 text-blue-600 dark:text-blue-400' : 'border-muted-foreground/50 text-muted-foreground'}>{d.type}</Badge></td><td className="p-3"><Button variant="ghost" size="sm" onClick={() => handleRemoveDiagnosis(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>))}</tbody></table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prescriptions">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-foreground">Prescriptions</CardTitle>
                <Button onClick={() => setIsAddPrescriptionOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Prescription</Button>
              </CardHeader>
              <CardContent>
                <table className="w-full"><thead><tr className="border-b border-border"><th className="text-left p-3 text-sm font-medium text-muted-foreground">Drug</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Dosage</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Frequency</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Duration</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Instructions</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Actions</th></tr></thead>
                <tbody>{prescriptions.map((p) => (<tr key={p.id} className="border-b border-border"><td className="p-3 text-foreground font-medium">{p.drug}</td><td className="p-3 text-foreground">{p.dosage}</td><td className="p-3"><Badge variant="outline" className="border-violet-500/30 text-violet-600 dark:text-violet-400">{p.frequency}</Badge></td><td className="p-3 text-foreground">{p.duration}</td><td className="p-3 text-muted-foreground">{p.instructions}</td><td className="p-3"><Button variant="ghost" size="sm" onClick={() => handleRemovePrescription(p.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>))}</tbody></table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="orders">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-foreground">Laboratory Orders</CardTitle>
                <Button onClick={() => setIsAddLabOrderOpen(true)}><Plus className="h-4 w-4 mr-2" />Order Lab Test</Button>
              </CardHeader>
              <CardContent>
                <table className="w-full"><thead><tr className="border-b border-border"><th className="text-left p-3 text-sm font-medium text-muted-foreground">Test</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Result</th><th className="text-left p-3 text-sm font-medium text-muted-foreground">Actions</th></tr></thead>
                <tbody>{labOrders.map((l) => (<tr key={l.id} className="border-b border-border"><td className="p-3 text-foreground">{l.test}</td><td className="p-3"><Badge variant="outline" className={l.status === 'Completed' ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' : 'border-amber-500/50 text-amber-600 dark:text-amber-400'}>{l.status}</Badge></td><td className="p-3 text-foreground">{l.result}</td><td className="p-3"><Button variant="ghost" size="sm" onClick={() => handleRemoveLabOrder(l.id)} disabled={l.status === 'Completed'}><Trash2 className="h-4 w-4 text-destructive" /></Button></td></tr>))}</tbody></table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Add Diagnosis Dialog */}
        <Dialog open={isAddDiagnosisOpen} onOpenChange={setIsAddDiagnosisOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-blue-500" />Add Diagnosis</DialogTitle>
              <DialogDescription>Add a diagnosis using ICD-10 codes.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Quick Select (Common ICD-10)</Label>
                <Select onValueChange={handleSelectICD}><SelectTrigger><SelectValue placeholder="Select from common diagnoses" /></SelectTrigger><SelectContent>{icdCodes.map(c => <SelectItem key={c.code} value={c.code}>{c.code} - {c.description}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2"><Label>ICD-10 Code</Label><Input value={newDiagnosis.code} onChange={(e) => setNewDiagnosis(prev => ({ ...prev, code: e.target.value }))} placeholder="E11.9" /></div>
                <div className="col-span-2 space-y-2"><Label>Type</Label>
                  <Select value={newDiagnosis.type} onValueChange={(v) => setNewDiagnosis(prev => ({ ...prev, type: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Primary">Primary</SelectItem><SelectItem value="Secondary">Secondary</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Input value={newDiagnosis.description} onChange={(e) => setNewDiagnosis(prev => ({ ...prev, description: e.target.value }))} placeholder="Diagnosis description" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDiagnosisOpen(false)}>Cancel</Button>
              <Button onClick={handleAddDiagnosis}><Plus className="h-4 w-4 mr-2" />Add Diagnosis</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Prescription Dialog */}
        <Dialog open={isAddPrescriptionOpen} onOpenChange={setIsAddPrescriptionOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-violet-500" />Add Prescription</DialogTitle>
              <DialogDescription>Prescribe medication for the patient.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Drug Name</Label>
                <Select value={newPrescription.drug} onValueChange={(v) => setNewPrescription(prev => ({ ...prev, drug: v }))}><SelectTrigger><SelectValue placeholder="Select or type drug name" /></SelectTrigger><SelectContent>{commonDrugs.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Dosage</Label><Input value={newPrescription.dosage} onChange={(e) => setNewPrescription(prev => ({ ...prev, dosage: e.target.value }))} placeholder="e.g., 500mg" /></div>
                <div className="space-y-2"><Label>Frequency</Label>
                  <Select value={newPrescription.frequency} onValueChange={(v) => setNewPrescription(prev => ({ ...prev, frequency: v }))}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="OD">Once Daily (OD)</SelectItem><SelectItem value="BD">Twice Daily (BD)</SelectItem><SelectItem value="TDS">Three Times Daily (TDS)</SelectItem><SelectItem value="QDS">Four Times Daily (QDS)</SelectItem><SelectItem value="PRN">As Needed (PRN)</SelectItem><SelectItem value="STAT">Immediately (STAT)</SelectItem></SelectContent></Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Duration</Label><Input value={newPrescription.duration} onChange={(e) => setNewPrescription(prev => ({ ...prev, duration: e.target.value }))} placeholder="e.g., 7 days, 30 days" /></div>
              <div className="space-y-2"><Label>Special Instructions</Label><Textarea value={newPrescription.instructions} onChange={(e) => setNewPrescription(prev => ({ ...prev, instructions: e.target.value }))} placeholder="e.g., Take with food, Avoid alcohol" rows={2} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddPrescriptionOpen(false)}>Cancel</Button>
              <Button onClick={handleAddPrescription}><Plus className="h-4 w-4 mr-2" />Add Prescription</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Order Lab Test Dialog */}
        <Dialog open={isAddLabOrderOpen} onOpenChange={setIsAddLabOrderOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><TestTube className="h-5 w-5 text-amber-500" />Order Laboratory Test</DialogTitle>
              <DialogDescription>Order a laboratory test for the patient.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Test Name</Label>
                <Select value={newLabOrder.test} onValueChange={(v) => setNewLabOrder(prev => ({ ...prev, test: v }))}><SelectTrigger><SelectValue placeholder="Select test" /></SelectTrigger><SelectContent>{labTests.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={newLabOrder.priority} onValueChange={(v) => setNewLabOrder(prev => ({ ...prev, priority: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Routine">Routine</SelectItem><SelectItem value="Urgent">Urgent</SelectItem><SelectItem value="STAT">STAT</SelectItem></SelectContent></Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddLabOrderOpen(false)}>Cancel</Button>
              <Button onClick={handleAddLabOrder}><Plus className="h-4 w-4 mr-2" />Order Test</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Vitals Dialog */}
        <Dialog open={isEditVitalsOpen} onOpenChange={setIsEditVitalsOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-rose-500" />Edit Vital Signs</DialogTitle>
              <DialogDescription>Update the patient's vital signs.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Blood Pressure (mmHg)</Label><Input value={editVitals.bp} onChange={(e) => setEditVitals(prev => ({ ...prev, bp: e.target.value }))} placeholder="120/80" /></div>
                <div className="space-y-2"><Label>Pulse (bpm)</Label><Input value={editVitals.pulse} onChange={(e) => setEditVitals(prev => ({ ...prev, pulse: e.target.value }))} placeholder="72" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Temperature (°C)</Label><Input value={editVitals.temp} onChange={(e) => setEditVitals(prev => ({ ...prev, temp: e.target.value }))} placeholder="36.5" /></div>
                <div className="space-y-2"><Label>Respiratory Rate</Label><Input value={editVitals.respRate} onChange={(e) => setEditVitals(prev => ({ ...prev, respRate: e.target.value }))} placeholder="18" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>SpO2 (%)</Label><Input value={editVitals.spo2} onChange={(e) => setEditVitals(prev => ({ ...prev, spo2: e.target.value }))} placeholder="98" /></div>
                <div className="space-y-2"><Label>Weight (kg)</Label><Input value={editVitals.weight} onChange={(e) => setEditVitals(prev => ({ ...prev, weight: e.target.value }))} placeholder="70" /></div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditVitalsOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveVitals}><Save className="h-4 w-4 mr-2" />Save Vitals</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Complete Visit Dialog */}
        <Dialog open={isCompleteVisitOpen} onOpenChange={setIsCompleteVisitOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-emerald-500" />Complete Visit</DialogTitle>
              <DialogDescription>Are you sure you want to mark this visit as completed? This will finalize the visit record.</DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                <p className="text-sm"><span className="text-muted-foreground">Diagnoses:</span> <span className="text-foreground">{diagnoses.length}</span></p>
                <p className="text-sm"><span className="text-muted-foreground">Prescriptions:</span> <span className="text-foreground">{prescriptions.length}</span></p>
                <p className="text-sm"><span className="text-muted-foreground">Lab Orders:</span> <span className="text-foreground">{labOrders.length}</span></p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCompleteVisitOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={handleCompleteVisit}><CheckCircle className="h-4 w-4 mr-2" />Complete Visit</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
