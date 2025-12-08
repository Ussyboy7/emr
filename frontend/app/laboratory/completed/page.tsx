"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { labService, type LabTest as ApiLabTest } from '@/lib/services';
import {
  CheckCircle2, Search, Eye, Clock, AlertTriangle, Calendar,
  User, FileText, Stethoscope, RefreshCw, Download, Printer, FlaskConical, Loader2
} from 'lucide-react';

interface TestResult {
  parameter: string;
  value: string;
  unit: string;
  normalRange: string;
  status: 'Normal' | 'Abnormal' | 'Critical';
}

interface CompletedTest {
  id: string;
  orderId: string;
  patient: { id: string; name: string; age: number; gender: string; };
  doctor: { id: string; name: string; specialty: string; };
  testName: string;
  testCode: string;
  results: TestResult[];
  overallStatus: 'Normal' | 'Abnormal' | 'Critical';
  priority: 'Routine' | 'Urgent' | 'STAT';
  orderedAt: string;
  completedAt: string;
  verifiedBy: string;
  verifiedAt: string;
  submittedBy: string;
  clinic: string;
  turnaroundTime: string;
}

// Demo data - completed/verified tests
const demoCompletedTests: CompletedTest[] = [
  {
    id: 'COMP-001', orderId: 'LAB-2024-010',
    patient: { id: 'PAT-010', name: 'Olumide Afolabi', age: 48, gender: 'Male' },
    doctor: { id: 'DOC-001', name: 'Dr. Amaka Eze', specialty: 'General Practice' },
    testName: 'Complete Blood Count', testCode: 'CBC',
    results: [
      { parameter: 'WBC', value: '8.2', unit: '×10³/μL', normalRange: '4.0-11.0', status: 'Normal' },
      { parameter: 'RBC', value: '4.9', unit: '×10⁶/μL', normalRange: '4.2-5.4', status: 'Normal' },
      { parameter: 'Hemoglobin', value: '14.5', unit: 'g/dL', normalRange: '13.5-17.5', status: 'Normal' },
      { parameter: 'Hematocrit', value: '43', unit: '%', normalRange: '40-50', status: 'Normal' },
      { parameter: 'Platelets', value: '275', unit: '×10³/μL', normalRange: '150-400', status: 'Normal' },
    ],
    overallStatus: 'Normal', priority: 'Routine',
    orderedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    verifiedBy: 'Dr. Pathologist', verifiedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    submittedBy: 'Lab Tech Ada', clinic: 'General Clinic', turnaroundTime: '2h 15m'
  },
  {
    id: 'COMP-002', orderId: 'LAB-2024-011',
    patient: { id: 'PAT-011', name: 'Amina Bello', age: 35, gender: 'Female' },
    doctor: { id: 'DOC-002', name: 'Dr. Chidi Okafor', specialty: 'Internal Medicine' },
    testName: 'Liver Function Test', testCode: 'LFT',
    results: [
      { parameter: 'ALT', value: '45', unit: 'U/L', normalRange: '7-56', status: 'Normal' },
      { parameter: 'AST', value: '38', unit: 'U/L', normalRange: '10-40', status: 'Normal' },
      { parameter: 'ALP', value: '85', unit: 'U/L', normalRange: '44-147', status: 'Normal' },
      { parameter: 'Bilirubin', value: '0.9', unit: 'mg/dL', normalRange: '0.1-1.2', status: 'Normal' },
    ],
    overallStatus: 'Normal', priority: 'Routine',
    orderedAt: new Date(Date.now() - 5 * 3600000).toISOString(),
    completedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    verifiedBy: 'Dr. Pathologist', verifiedAt: new Date(Date.now() - 2.5 * 3600000).toISOString(),
    submittedBy: 'Lab Tech Bola', clinic: 'General Clinic', turnaroundTime: '2h 30m'
  },
  {
    id: 'COMP-003', orderId: 'LAB-2024-012',
    patient: { id: 'PAT-012', name: 'Chidinma Obi', age: 52, gender: 'Female' },
    doctor: { id: 'DOC-001', name: 'Dr. Amaka Eze', specialty: 'General Practice' },
    testName: 'Lipid Profile', testCode: 'LIP',
    results: [
      { parameter: 'Total Cholesterol', value: '245', unit: 'mg/dL', normalRange: '<200', status: 'Abnormal' },
      { parameter: 'LDL', value: '165', unit: 'mg/dL', normalRange: '<100', status: 'Abnormal' },
      { parameter: 'HDL', value: '38', unit: 'mg/dL', normalRange: '>40', status: 'Abnormal' },
      { parameter: 'Triglycerides', value: '180', unit: 'mg/dL', normalRange: '<150', status: 'Abnormal' },
    ],
    overallStatus: 'Abnormal', priority: 'Routine',
    orderedAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    completedAt: new Date(Date.now() - 4 * 3600000).toISOString(),
    verifiedBy: 'Dr. Pathologist', verifiedAt: new Date(Date.now() - 3.5 * 3600000).toISOString(),
    submittedBy: 'Lab Tech Ada', clinic: 'Cardiology', turnaroundTime: '2h 45m'
  },
  {
    id: 'COMP-004', orderId: 'LAB-2024-013',
    patient: { id: 'PAT-013', name: 'Emeka Nwosu', age: 62, gender: 'Male' },
    doctor: { id: 'DOC-003', name: 'Dr. Ibrahim Hassan', specialty: 'Emergency Medicine' },
    testName: 'Serum Electrolytes', testCode: 'ELEC',
    results: [
      { parameter: 'Sodium', value: '142', unit: 'mmol/L', normalRange: '135-145', status: 'Normal' },
      { parameter: 'Potassium', value: '4.2', unit: 'mmol/L', normalRange: '3.5-5.0', status: 'Normal' },
      { parameter: 'Chloride', value: '102', unit: 'mmol/L', normalRange: '98-107', status: 'Normal' },
      { parameter: 'Bicarbonate', value: '24', unit: 'mmol/L', normalRange: '22-29', status: 'Normal' },
    ],
    overallStatus: 'Normal', priority: 'STAT',
    orderedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    completedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    verifiedBy: 'Dr. Pathologist', verifiedAt: new Date(Date.now() - 1.5 * 3600000).toISOString(),
    submittedBy: 'Lab Tech Chidi', clinic: 'Emergency', turnaroundTime: '45m'
  },
  {
    id: 'COMP-005', orderId: 'LAB-2024-014',
    patient: { id: 'PAT-014', name: 'Fatimah Yusuf', age: 28, gender: 'Female' },
    doctor: { id: 'DOC-004', name: 'Dr. Ngozi Adamu', specialty: 'Pediatrics' },
    testName: 'Malaria Parasite', testCode: 'MP',
    results: [
      { parameter: 'Malaria Parasite', value: 'Positive', unit: '', normalRange: 'Negative', status: 'Abnormal' },
      { parameter: 'Parasite Density', value: '++', unit: '', normalRange: 'Negative', status: 'Abnormal' },
    ],
    overallStatus: 'Abnormal', priority: 'Urgent',
    orderedAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    completedAt: new Date(Date.now() - 1 * 3600000).toISOString(),
    verifiedBy: 'Dr. Pathologist', verifiedAt: new Date(Date.now() - 0.5 * 3600000).toISOString(),
    submittedBy: 'Lab Tech Ada', clinic: 'Pediatrics', turnaroundTime: '1h 15m'
  },
];

export default function CompletedTestsPage() {
  const [tests, setTests] = useState<CompletedTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [clinicFilter, setClinicFilter] = useState('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Dialog states
  const [selectedTest, setSelectedTest] = useState<CompletedTest | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Load completed tests from API
  useEffect(() => {
    loadTests();
  }, [currentPage]);

  const loadTests = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await labService.getCompletedTests({
        page: currentPage,
      });
      // Transform API data to frontend format
      const transformed = await Promise.all(response.results.map(async (test: any) => {
        // Extract patient data from test
        const patientName = test.patient_name || (test.lab_order?.patient_name) || 'Unknown Patient';
        const patientId = test.patient_id || (test.lab_order?.visit?.patient?.id) || '';
        const orderId = test.lab_order?.order_id || (test.order_id) || '';
        
        // Extract doctor data
        const doctorName = test.ordered_by_name || (test.lab_order?.doctor_name) || (test.lab_order?.ordered_by_name) || '';
        const doctorSpecialty = (test.lab_order?.doctor?.specialty) || '';
        
        // Extract clinic and other order data
        const clinic = (test.lab_order?.visit?.clinic) || (test.clinic) || '';
        const age = (test.lab_order?.visit?.patient?.age) || (test.age) || 0;
        const gender = (test.lab_order?.visit?.patient?.gender) || (test.gender) || '';
        
        // Calculate turnaround time
        const orderedAt = test.collected_at || (test.lab_order?.order_date) || new Date().toISOString();
        const completedAt = test.processed_at || (test.verified_at) || new Date().toISOString();
        const turnaroundMs = new Date(completedAt).getTime() - new Date(orderedAt).getTime();
        const turnaroundHours = Math.floor(turnaroundMs / 3600000);
        const turnaroundMins = Math.floor((turnaroundMs % 3600000) / 60000);
        const turnaroundTime = turnaroundHours > 0 ? `${turnaroundHours}h ${turnaroundMins}m` : `${turnaroundMins}m`;
        
        // Determine overall status from results
        let overallStatus: 'Normal' | 'Abnormal' | 'Critical' = 'Normal';
        if (test.overall_status) {
          const statusMap: Record<string, 'Normal' | 'Abnormal' | 'Critical'> = {
            'normal': 'Normal',
            'abnormal': 'Abnormal',
            'critical': 'Critical',
          };
          overallStatus = statusMap[test.overall_status.toLowerCase()] || 'Normal';
        }
        
        // Determine priority
        const priorityMap: Record<string, 'Routine' | 'Urgent' | 'STAT'> = {
          'routine': 'Routine',
          'urgent': 'Urgent',
          'stat': 'STAT',
        };
        const priority = priorityMap[(test.lab_order?.priority || test.priority || 'routine').toLowerCase()] || 'Routine';
        
        return {
          id: test.id.toString(),
          orderId,
          patient: { 
            id: patientId.toString(), 
            name: patientName, 
            age: age || 0, 
            gender: gender || 'Unknown' 
          },
          doctor: { 
            id: (test.lab_order?.doctor?.id)?.toString() || '', 
            name: doctorName, 
            specialty: doctorSpecialty 
          },
          testName: test.name,
          testCode: test.code,
          results: Object.entries(test.results || {}).map(([key, value]) => ({
            parameter: key,
            value: String(value),
            unit: '', // Would need template data for units
            normalRange: '', // Would need template data for normal ranges
            status: 'Normal' as const, // Would need to calculate based on normal ranges
          })),
          overallStatus,
          priority,
          orderedAt,
          completedAt,
          verifiedBy: test.verified_by || (test.verified_by_name) || '',
          verifiedAt: test.verified_at || new Date().toISOString(),
          submittedBy: test.processed_by || (test.performed_by_name) || '',
          clinic,
          turnaroundTime,
        };
      }));
      setTests(transformed);
    } catch (err: any) {
      setError(err.message || 'Failed to load completed tests');
      console.error('Error loading completed tests:', err);
    } finally {
      setLoading(false);
    }
  };

  const clinics = [...new Set(tests.map(t => t.clinic))];

  const filteredTests = useMemo(() => tests.filter(test => {
    const matchesSearch = test.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      test.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
      test.testName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || test.overallStatus.toLowerCase() === statusFilter;
    const matchesClinic = clinicFilter === 'all' || test.clinic === clinicFilter;
    return matchesSearch && matchesStatus && matchesClinic;
  }), [tests, searchQuery, statusFilter, clinicFilter]);

  // Paginated tests
  const paginatedTests = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredTests.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredTests, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, clinicFilter]);

  const stats = {
    total: tests.length,
    normal: tests.filter(t => t.overallStatus === 'Normal').length,
    abnormal: tests.filter(t => t.overallStatus === 'Abnormal').length,
    critical: tests.filter(t => t.overallStatus === 'Critical').length,
  };

  const getOverallStatusBadge = (status: string) => {
    switch (status) {
      case 'Critical': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Abnormal': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      default: return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'STAT': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Urgent': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
    }
  };

  const getResultStatusColor = (status: string) => {
    switch (status) {
      case 'Critical': return 'text-rose-600 dark:text-rose-400 font-bold';
      case 'Abnormal': return 'text-amber-600 dark:text-amber-400 font-medium';
      default: return 'text-foreground';
    }
  };

  const formatDateTime = (isoString: string) => {
    const date = new Date(isoString);
    return {
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    };
  };

  const handlePrint = (test: CompletedTest) => {
    toast.info(`Printing result for ${test.patient.name}...`);
  };

  const handleDownload = (test: CompletedTest) => {
    toast.success(`Downloaded result for ${test.patient.name}`);
  };

  const openViewDialog = (test: CompletedTest) => { setSelectedTest(test); setIsViewDialogOpen(true); };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
              Completed Tests
            </h1>
            <p className="text-muted-foreground mt-1">History of verified and completed lab tests</p>
          </div>
          <Button variant="outline" onClick={loadTests} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Completed</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.total}</p>
                </div>
                <FlaskConical className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Normal</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.normal}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Abnormal</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.abnormal}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Critical</p>
                  <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.critical}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-rose-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by patient, order ID, or test..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Date" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="abnormal">Abnormal</SelectItem>
                  <SelectItem value="critical">Critical</SelectItem>
                </SelectContent>
              </Select>
              <Select value={clinicFilter} onValueChange={setClinicFilter}>
                <SelectTrigger className="w-[160px]"><SelectValue placeholder="Clinic" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clinics</SelectItem>
                  {clinics.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tests List */}
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading completed tests...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" className="mt-4" onClick={loadTests}>Retry</Button>
              </CardContent>
            </Card>
          ) : filteredTests.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">No completed tests found</CardContent></Card>
          ) : (
            paginatedTests.map(test => {
              const completed = formatDateTime(test.completedAt);
              return (
                <Card key={test.id} className={`border-l-4 hover:shadow-md transition-shadow ${
                  test.overallStatus === 'Critical' ? 'border-l-rose-500' :
                  test.overallStatus === 'Abnormal' ? 'border-l-amber-500' : 'border-l-emerald-500'
                }`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        test.overallStatus === 'Critical' ? 'bg-rose-100 dark:bg-rose-900/30' :
                        test.overallStatus === 'Abnormal' ? 'bg-amber-100 dark:bg-amber-900/30' :
                        'bg-emerald-100 dark:bg-emerald-900/30'
                      }`}>
                        <span className={`font-semibold text-xs ${
                          test.overallStatus === 'Critical' ? 'text-rose-600' :
                          test.overallStatus === 'Abnormal' ? 'text-amber-600' :
                          'text-emerald-600'
                        }`}>{test.patient.name.split(' ').map(n => n[0]).join('')}</span>
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + Badges + Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{test.patient.name}</span>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getOverallStatusBadge(test.overallStatus)}`}>
                              {test.overallStatus === 'Critical' && <AlertTriangle className="h-2 w-2 mr-0.5" />}{test.overallStatus}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{test.testCode}</Badge>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openViewDialog(test)}>
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handlePrint(test)}>
                              <Printer className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(test)}>
                              <Download className="h-4 w-4 text-muted-foreground hover:text-emerald-500" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Row 2: Details */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                          <span>{test.patient.age}y {test.patient.gender}</span>
                          <span>•</span>
                          <span>{test.orderId}</span>
                          <span>•</span>
                          <span>{test.testName}</span>
                          <span>•</span>
                          <span>{test.clinic}</span>
                          <span>•</span>
                          <span>{completed.date} {completed.time}</span>
                          <span>•</span>
                          <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{test.turnaroundTime}</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {filteredTests.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredTests.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="tests"
            />
          </Card>
        )}

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-500" />Lab Report</DialogTitle>
              <DialogDescription>{selectedTest?.testName} - {selectedTest?.patient.name}</DialogDescription>
            </DialogHeader>
            {selectedTest && (
              <div className="space-y-6 py-4">
                {/* Header */}
                <div className="text-center p-4 border-b">
                  <h2 className="text-xl font-bold">LABORATORY REPORT</h2>
                  <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
                </div>

                {/* Patient & Test Info */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient Name</p>
                    <p className="font-medium">{selectedTest.patient.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Age / Gender</p>
                    <p className="font-medium">{selectedTest.patient.age} years / {selectedTest.patient.gender}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Ordering Doctor</p>
                    <p className="font-medium">{selectedTest.doctor.name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Order ID</p>
                    <p className="font-medium">{selectedTest.orderId}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Test Name</p>
                    <p className="font-medium">{selectedTest.testName} ({selectedTest.testCode})</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Clinic</p>
                    <p className="font-medium">{selectedTest.clinic}</p>
                  </div>
                </div>

                {/* Results */}
                <div>
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <FlaskConical className="h-4 w-4 text-amber-500" />
                    Test Results
                    <Badge variant="outline" className={getOverallStatusBadge(selectedTest.overallStatus)}>{selectedTest.overallStatus}</Badge>
                  </h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b bg-muted/50">
                        <th className="text-left p-3 font-medium">Parameter</th>
                        <th className="text-left p-3 font-medium">Result</th>
                        <th className="text-left p-3 font-medium">Unit</th>
                        <th className="text-left p-3 font-medium">Normal Range</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </tr></thead>
                      <tbody>
                        {selectedTest.results.map(r => (
                          <tr key={r.parameter} className="border-b">
                            <td className="p-3 font-medium">{r.parameter}</td>
                            <td className={`p-3 ${getResultStatusColor(r.status)}`}>{r.value}</td>
                            <td className="p-3 text-muted-foreground">{r.unit}</td>
                            <td className="p-3 text-muted-foreground">{r.normalRange}</td>
                            <td className="p-3">
                              {r.status === 'Normal' ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              ) : (
                                <AlertTriangle className={`h-4 w-4 ${r.status === 'Critical' ? 'text-rose-500' : 'text-amber-500'}`} />
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Timeline */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Ordered</p>
                    <p className="font-medium">{formatDateTime(selectedTest.orderedAt).date} {formatDateTime(selectedTest.orderedAt).time}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Completed</p>
                    <p className="font-medium">{formatDateTime(selectedTest.completedAt).date} {formatDateTime(selectedTest.completedAt).time}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Verified</p>
                    <p className="font-medium">{formatDateTime(selectedTest.verifiedAt).date} {formatDateTime(selectedTest.verifiedAt).time}</p>
                  </div>
                  <div className="p-3 rounded-lg border">
                    <p className="text-xs text-muted-foreground">Turnaround Time</p>
                    <p className="font-medium">{selectedTest.turnaroundTime}</p>
                  </div>
                </div>

                {/* Signatures */}
                <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                  <div>
                    <p className="text-xs text-muted-foreground">Performed By</p>
                    <p className="font-medium">{selectedTest.submittedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Verified By</p>
                    <p className="font-medium">{selectedTest.verifiedBy}</p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
              <Button variant="outline" onClick={() => selectedTest && handlePrint(selectedTest)}>
                <Printer className="h-4 w-4 mr-2" />Print
              </Button>
              <Button onClick={() => selectedTest && handleDownload(selectedTest)}>
                <Download className="h-4 w-4 mr-2" />Download PDF
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}

