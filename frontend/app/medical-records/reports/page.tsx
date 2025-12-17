"use client";

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Download, Printer, Calendar, FileCheck, FileClock, ArrowRight, Plus, Eye, Trash2, CheckCircle, Search } from 'lucide-react';

const patients = [
  { id: 'PAT-2024-001', name: 'Adebayo Johnson' },
  { id: 'PAT-2024-002', name: 'Fatima Mohammed' },
  { id: 'PAT-2024-003', name: 'Chukwu Emeka' },
  { id: 'PAT-2024-004', name: 'Grace Okonkwo' },
  { id: 'PAT-2024-005', name: 'Ibrahim Suleiman' },
];

const reportTypes = [
  { id: 'attendance-summary', title: 'Attendance Summary', description: 'Patient attendance by category (Officers, Staff, Dependents, Retirees, etc.)', icon: FileText, href: '/medical-records/reports/attendance-summary', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  { id: 'clinic-attendance', title: 'Clinic Attendance', description: 'Specialized clinic attendance (Diamond Club, Sickle Cell, Healthron, Eye, Physiotherapy)', icon: FileText, href: '/medical-records/reports/clinic-attendance', color: 'text-green-500', bgColor: 'bg-green-500/10' },
  { id: 'services-activities', title: 'Services & Activities', description: 'Injections, Dressing, Sick Leave, Referrals, Observations', icon: FileText, href: '/medical-records/reports/services-activities', color: 'text-orange-500', bgColor: 'bg-orange-500/10' },
  { id: 'dispensed-prescriptions', title: 'Dispensed Prescriptions', description: 'Monthly prescription dispensing statistics', icon: FileText, href: '/medical-records/reports/dispensed-prescriptions', color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  { id: 'laboratory-attendance', title: 'Laboratory Attendance', description: 'Lab services by patient category and month', icon: FileText, href: '/medical-records/reports/laboratory-attendance', color: 'text-pink-500', bgColor: 'bg-pink-500/10' },
  { id: 'radiological-services', title: 'Radiological Services', description: 'X-Ray, ECG, Ultrasound, CT Scan, MRI statistics', icon: FileText, href: '/medical-records/reports/radiological-services', color: 'text-indigo-500', bgColor: 'bg-indigo-500/10' },
  { id: 'referral-tracking', title: 'Referral Tracking', description: 'New referrals and follow-ups to retainership hospitals', icon: FileText, href: '/medical-records/reports/referral-tracking', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  { id: 'disease-pattern', title: 'Disease Pattern', description: 'Top diagnoses and disease trends', icon: FileText, href: '/medical-records/reports/disease-pattern', color: 'text-red-500', bgColor: 'bg-red-500/10' },
  { id: 'gop-attendance', title: 'G.O.P Attendance', description: 'General Outpatient attendance statistics', icon: FileText, href: '/medical-records/reports/gop-attendance', color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  { id: 'weekend-duty', title: 'Weekend Call Duty', description: 'Weekend and after-hours attendance', icon: FileText, href: '/medical-records/reports/weekend-duty', color: 'text-purple-500', bgColor: 'bg-purple-500/10' },
  { id: 'comprehensive', title: 'Comprehensive Report', description: 'All reports combined in one comprehensive view', icon: FileText, href: '/medical-records/reports/comprehensive', color: 'text-gray-500', bgColor: 'bg-gray-500/10' },
  { id: 'medical-cert', title: 'Medical Certificate', description: 'Generate fitness or illness certificates', icon: FileCheck, count: 45, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
  { id: 'discharge', title: 'Discharge Summary', description: 'Patient discharge documentation', icon: FileText, count: 28, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
  { id: 'referral', title: 'Referral Letter', description: 'Specialist referral letters', icon: FileText, count: 15, color: 'text-violet-500', bgColor: 'bg-violet-500/10' },
  { id: 'lab-report', title: 'Lab Report', description: 'Laboratory test results', icon: FileText, count: 156, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
];

// Reports data will be loaded from API
const initialReports: any[] = [];

export default function ReportsPage() {
  const router = useRouter();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  
  // Modal states
  const [isNewReportOpen, setIsNewReportOpen] = useState(false);
  const [isViewReportOpen, setIsViewReportOpen] = useState(false);
  const [isSignReportOpen, setIsSignReportOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<typeof reports[0] | null>(null);
  const [selectedReportType, setSelectedReportType] = useState('');
  
  // Form state
  const [newReport, setNewReport] = useState({
    type: '', patientId: '', purpose: '', findings: '', recommendations: '', startDate: '', endDate: '', referTo: ''
  });

  const filteredReports = reports.filter(r => {
    const matchesSearch = r.patient.toLowerCase().includes(searchQuery.toLowerCase()) || r.id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesType = typeFilter === 'all' || r.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const pendingReports = reports.filter(r => r.status === 'Pending Signature');

  const handleCreateReport = () => {
    const patient = patients.find(p => p.id === newReport.patientId);
    const report = {
      id: `RPT-${Date.now().toString().slice(-3)}`,
      type: newReport.type,
      patient: patient?.name || '',
      patientId: newReport.patientId,
      date: new Date().toISOString().split('T')[0],
      status: 'Draft',
      doctor: 'Dr. Current User'
    };
    setReports(prev => [report, ...prev]);
    setNewReport({ type: '', patientId: '', purpose: '', findings: '', recommendations: '', startDate: '', endDate: '', referTo: '' });
    setIsNewReportOpen(false);
    setSelectedReportType('');
    toast.success('Report created successfully');
  };

  const handleSignReport = () => {
    if (selectedReport) {
      setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, status: 'Completed' } : r));
      setIsSignReportOpen(false);
      setSelectedReport(null);
      toast.success('Report signed and finalized');
    }
  };

  const handleDeleteReport = (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
    toast.success('Report deleted');
  };

  const handleDownload = (report: typeof reports[0]) => {
    toast.info(`Downloading ${report.type} for ${report.patient}...`);
  };

  const handlePrint = (report: typeof reports[0]) => {
    toast.info(`Printing ${report.type}...`);
    window.print();
  };

  const openNewReportModal = (type: string) => {
    setSelectedReportType(type);
    setNewReport(prev => ({ ...prev, type }));
    setIsNewReportOpen(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link href="/medical-records" className="hover:text-primary">Medical Records</Link>
              <span>/</span>
              <span>Reports</span>
            </div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <FileText className="h-8 w-8 text-amber-500" />
              Medical Reports
            </h1>
            <p className="text-muted-foreground mt-1">Generate and manage medical reports and certificates</p>
          </div>
          <Button onClick={() => setIsNewReportOpen(true)} className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white">
            <Plus className="h-4 w-4 mr-2" />New Report
          </Button>
        </div>

        {/* Report Types */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {reportTypes.map((report) => (
            <Card 
              key={report.id} 
              className="border-border bg-card hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group"
              onClick={() => {
                if ((report as any).href) {
                  router.push((report as any).href);
                } else {
                  openNewReportModal(report.title);
                }
              }}
            >
              <CardContent className="p-6">
                <div className={`w-12 h-12 rounded-xl ${report.bgColor} flex items-center justify-center mb-4`}>
                  <report.icon className={`h-6 w-6 ${report.color}`} />
                </div>
                <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{report.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{report.description}</p>
                <div className="flex items-center justify-between mt-4">
                  {(report as any).count ? (
                    <Badge variant="outline">{(report as any).count} reports</Badge>
                  ) : (
                    <Badge variant="outline">Available</Badge>
                  )}
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Pending Reports Alert */}
        {pendingReports.length > 0 && (
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <FileClock className="h-5 w-5 text-amber-500" />
                <div className="flex-1">
                  <p className="font-medium text-amber-600 dark:text-amber-400">{pendingReports.length} Report(s) Pending Signature</p>
                  <p className="text-sm text-muted-foreground">Review and sign pending reports</p>
                </div>
                <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" onClick={() => { setSelectedReport(pendingReports[0]); setIsSignReportOpen(true); }}>
                  Review Now
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search and Filter */}
        <Card className="border-border bg-card">
          <CardContent className="p-4">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search by patient name or report ID..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-10" />
              </div>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Report Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {reportTypes.map(t => <SelectItem key={t.id} value={t.title}>{t.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Recent Reports */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-500" />
              Recent Reports
            </CardTitle>
            <CardDescription>Recently generated medical reports and certificates</CardDescription>
          </CardHeader>
          <CardContent>
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Report ID</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Type</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Patient</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Date</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Doctor</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                  <th className="text-left p-3 text-sm font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((report) => (
                  <tr key={report.id} className="border-b border-border hover:bg-muted/30 transition-colors">
                    <td className="p-3 font-medium text-primary">{report.id}</td>
                    <td className="p-3 text-foreground">{report.type}</td>
                    <td className="p-3">
                      <Link href="/medical-records/patients" className="text-foreground hover:text-primary">{report.patient}</Link>
                    </td>
                    <td className="p-3 text-foreground">{report.date}</td>
                    <td className="p-3 text-foreground">{report.doctor}</td>
                    <td className="p-3">
                      <Badge variant="outline" className={`
                        ${report.status === 'Completed' ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' :
                          report.status === 'Pending Signature' ? 'border-amber-500/50 text-amber-600 dark:text-amber-400' :
                          'border-muted-foreground/50 text-muted-foreground'}
                      `}>
                        {report.status}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={() => { setSelectedReport(report); setIsViewReportOpen(true); }}><Eye className="h-4 w-4" /></Button>
                        {report.status === 'Pending Signature' && (
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedReport(report); setIsSignReportOpen(true); }}><CheckCircle className="h-4 w-4 text-emerald-500" /></Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => handlePrint(report)}><Printer className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDownload(report)}><Download className="h-4 w-4" /></Button>
                        {report.status === 'Draft' && (
                          <Button variant="ghost" size="sm" onClick={() => handleDeleteReport(report.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* New Report Dialog */}
        <Dialog open={isNewReportOpen} onOpenChange={setIsNewReportOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-primary" />Create New Report</DialogTitle>
              <DialogDescription>Generate a new medical report or certificate.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Report Type *</Label>
                  <Select value={newReport.type} onValueChange={(v) => setNewReport(prev => ({ ...prev, type: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                    <SelectContent>{reportTypes.map(t => <SelectItem key={t.id} value={t.title}>{t.title}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Patient *</Label>
                  <Select value={newReport.patientId} onValueChange={(v) => setNewReport(prev => ({ ...prev, patientId: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select patient" /></SelectTrigger>
                    <SelectContent>{patients.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              
              {newReport.type === 'Medical Certificate' && (
                <>
                  <div className="space-y-2">
                    <Label>Purpose</Label>
                    <Select value={newReport.purpose} onValueChange={(v) => setNewReport(prev => ({ ...prev, purpose: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select purpose" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fitness">Fitness Certificate</SelectItem>
                        <SelectItem value="illness">Illness/Sick Leave</SelectItem>
                        <SelectItem value="travel">Travel Medical</SelectItem>
                        <SelectItem value="employment">Employment Medical</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>Start Date</Label><Input type="date" value={newReport.startDate} onChange={(e) => setNewReport(prev => ({ ...prev, startDate: e.target.value }))} /></div>
                    <div className="space-y-2"><Label>End Date</Label><Input type="date" value={newReport.endDate} onChange={(e) => setNewReport(prev => ({ ...prev, endDate: e.target.value }))} /></div>
                  </div>
                </>
              )}

              {newReport.type === 'Referral Letter' && (
                <div className="space-y-2">
                  <Label>Refer To (Specialist/Hospital)</Label>
                  <Input value={newReport.referTo} onChange={(e) => setNewReport(prev => ({ ...prev, referTo: e.target.value }))} placeholder="e.g., Dr. Smith, Cardiologist" />
                </div>
              )}

              <div className="space-y-2">
                <Label>Clinical Findings</Label>
                <Textarea value={newReport.findings} onChange={(e) => setNewReport(prev => ({ ...prev, findings: e.target.value }))} placeholder="Enter clinical findings and examination results..." rows={4} />
              </div>
              <div className="space-y-2">
                <Label>Recommendations</Label>
                <Textarea value={newReport.recommendations} onChange={(e) => setNewReport(prev => ({ ...prev, recommendations: e.target.value }))} placeholder="Enter recommendations..." rows={3} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewReportOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateReport} disabled={!newReport.type || !newReport.patientId}><Plus className="h-4 w-4 mr-2" />Create Report</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Report Dialog */}
        <Dialog open={isViewReportOpen} onOpenChange={setIsViewReportOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Report Details</DialogTitle>
            </DialogHeader>
            {selectedReport && (
              <div className="py-4 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">Report ID</p><p className="font-medium text-foreground">{selectedReport.id}</p></div>
                  <div><p className="text-sm text-muted-foreground">Type</p><p className="font-medium text-foreground">{selectedReport.type}</p></div>
                  <div><p className="text-sm text-muted-foreground">Patient</p><p className="font-medium text-foreground">{selectedReport.patient}</p></div>
                  <div><p className="text-sm text-muted-foreground">Date</p><p className="font-medium text-foreground">{selectedReport.date}</p></div>
                  <div><p className="text-sm text-muted-foreground">Doctor</p><p className="font-medium text-foreground">{selectedReport.doctor}</p></div>
                  <div><p className="text-sm text-muted-foreground">Status</p><Badge variant="outline">{selectedReport.status}</Badge></div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewReportOpen(false)}>Close</Button>
              <Button onClick={() => { handlePrint(selectedReport!); }}><Printer className="h-4 w-4 mr-2" />Print</Button>
              <Button onClick={() => { handleDownload(selectedReport!); }}><Download className="h-4 w-4 mr-2" />Download</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Sign Report Dialog */}
        <Dialog open={isSignReportOpen} onOpenChange={setIsSignReportOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><CheckCircle className="h-5 w-5 text-emerald-500" />Sign Report</DialogTitle>
              <DialogDescription>Review and sign this report to finalize it.</DialogDescription>
            </DialogHeader>
            {selectedReport && (
              <div className="py-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <p className="text-sm"><span className="text-muted-foreground">Report:</span> <span className="text-foreground font-medium">{selectedReport.type}</span></p>
                  <p className="text-sm"><span className="text-muted-foreground">Patient:</span> <span className="text-foreground">{selectedReport.patient}</span></p>
                  <p className="text-sm"><span className="text-muted-foreground">Date:</span> <span className="text-foreground">{selectedReport.date}</span></p>
                </div>
                <p className="text-sm text-muted-foreground mt-4">By signing this report, you confirm that all information is accurate and complete.</p>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsSignReportOpen(false)}>Cancel</Button>
              <Button className="bg-emerald-500 hover:bg-emerald-600" onClick={handleSignReport}><CheckCircle className="h-4 w-4 mr-2" />Sign & Finalize</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
