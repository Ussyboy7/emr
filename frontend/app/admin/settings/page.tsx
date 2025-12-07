"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  Settings, Save, RefreshCw, Clock, Calendar, Bell, Shield, Database,
  Globe, Mail, Printer, Stethoscope, TestTube, Pill, ScanLine, Users,
  AlertTriangle, CheckCircle2, FileText, Lock, Key
} from "lucide-react";

export default function SystemSettingsPage() {
  const [isSaving, setIsSaving] = useState(false);

  // General Settings
  const [generalSettings, setGeneralSettings] = useState({
    facilityName: 'NPA Medical Center',
    facilityCode: 'NPA-MC-001',
    address: 'Marina, Lagos, Nigeria',
    phone: '+234 1 234 5678',
    email: 'medical@npa.gov.ng',
    timezone: 'Africa/Lagos',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
    language: 'en',
    currency: 'NGN',
  });

  // Appointment Settings
  const [appointmentSettings, setAppointmentSettings] = useState({
    defaultSlotDuration: '30',
    maxAdvanceBooking: '30',
    allowWalkIns: true,
    requireApproval: false,
    sendReminders: true,
    reminderHours: '24',
    allowCancellation: true,
    cancellationHours: '2',
    maxPatientsPerSlot: '1',
    showAvailability: true,
  });

  // Consultation Settings
  const [consultationSettings, setConsultationSettings] = useState({
    requireVitals: true,
    autoAssignRoom: true,
    sessionTimeout: '60',
    allowMultipleDiagnosis: true,
    requireDiagnosis: true,
    requirePrescription: false,
    autoEndSession: true,
    autoEndMinutes: '120',
    showPatientHistory: true,
    historyMonths: '12',
  });

  // Laboratory Settings
  const [labSettings, setLabSettings] = useState({
    requireOrderApproval: false,
    allowStatOrders: true,
    defaultTurnaround: '24',
    criticalValueAlerts: true,
    requireVerification: true,
    allowOutsourcing: true,
    autoNotifyDoctor: true,
    printOnComplete: false,
    barcodeEnabled: true,
    specimenTracking: true,
  });

  // Pharmacy Settings
  const [pharmacySettings, setPharmacySettings] = useState({
    requireDoctorApproval: false,
    allowSubstitution: true,
    lowStockThreshold: '50',
    expiryWarningDays: '90',
    autoReorderEnabled: false,
    dispensingAlert: true,
    allergyCheck: true,
    drugInteractionCheck: true,
    maxDispenseQuantity: '30',
    trackBatches: true,
  });

  // Security Settings
  const [securitySettings, setSecuritySettings] = useState({
    sessionTimeout: '30',
    maxLoginAttempts: '5',
    lockoutDuration: '15',
    passwordExpiry: '90',
    minPasswordLength: '8',
    requireSpecialChar: true,
    require2FA: false,
    auditEnabled: true,
    ipWhitelist: false,
    dataEncryption: true,
  });

  // Notification Settings
  const [notificationSettings, setNotificationSettings] = useState({
    emailEnabled: true,
    smsEnabled: false,
    inAppEnabled: true,
    appointmentReminders: true,
    labResultsReady: true,
    prescriptionReady: true,
    criticalAlerts: true,
    systemUpdates: true,
    dailyDigest: false,
    weeklyReport: true,
  });

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(r => setTimeout(r, 1500));
    toast.success('Settings saved successfully');
    setIsSaving(false);
  };

  const handleReset = () => {
    toast.info('Settings reset to defaults');
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Settings className="h-8 w-8 text-slate-500" />
              System Settings
            </h1>
            <p className="text-muted-foreground mt-1">Configure EMR system preferences and policies</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}><RefreshCw className="h-4 w-4 mr-2" />Reset</Button>
            <Button onClick={handleSave} disabled={isSaving} className="bg-slate-700 hover:bg-slate-800">
              <Save className="h-4 w-4 mr-2" />{isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </div>

        <Tabs defaultValue="general" className="space-y-4">
          <TabsList className="flex flex-wrap h-auto gap-2">
            <TabsTrigger value="general" className="flex items-center gap-1"><Globe className="h-4 w-4" />General</TabsTrigger>
            <TabsTrigger value="appointments" className="flex items-center gap-1"><Calendar className="h-4 w-4" />Appointments</TabsTrigger>
            <TabsTrigger value="consultation" className="flex items-center gap-1"><Stethoscope className="h-4 w-4" />Consultation</TabsTrigger>
            <TabsTrigger value="laboratory" className="flex items-center gap-1"><TestTube className="h-4 w-4" />Laboratory</TabsTrigger>
            <TabsTrigger value="pharmacy" className="flex items-center gap-1"><Pill className="h-4 w-4" />Pharmacy</TabsTrigger>
            <TabsTrigger value="security" className="flex items-center gap-1"><Shield className="h-4 w-4" />Security</TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1"><Bell className="h-4 w-4" />Notifications</TabsTrigger>
          </TabsList>

          {/* General Settings */}
          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Globe className="h-5 w-5 text-slate-500" />General Settings</CardTitle>
                <CardDescription>Basic facility information and regional preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label>Facility Name</Label><Input value={generalSettings.facilityName} onChange={(e) => setGeneralSettings(p => ({ ...p, facilityName: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Facility Code</Label><Input value={generalSettings.facilityCode} onChange={(e) => setGeneralSettings(p => ({ ...p, facilityCode: e.target.value }))} /></div>
                  <div className="space-y-2 md:col-span-2"><Label>Address</Label><Input value={generalSettings.address} onChange={(e) => setGeneralSettings(p => ({ ...p, address: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input value={generalSettings.phone} onChange={(e) => setGeneralSettings(p => ({ ...p, phone: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Email</Label><Input value={generalSettings.email} onChange={(e) => setGeneralSettings(p => ({ ...p, email: e.target.value }))} /></div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2"><Label>Timezone</Label><Select value={generalSettings.timezone} onValueChange={(v) => setGeneralSettings(p => ({ ...p, timezone: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="Africa/Lagos">Africa/Lagos (WAT)</SelectItem><SelectItem value="UTC">UTC</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Date Format</Label><Select value={generalSettings.dateFormat} onValueChange={(v) => setGeneralSettings(p => ({ ...p, dateFormat: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem><SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem><SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Time Format</Label><Select value={generalSettings.timeFormat} onValueChange={(v) => setGeneralSettings(p => ({ ...p, timeFormat: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="24h">24-hour</SelectItem><SelectItem value="12h">12-hour (AM/PM)</SelectItem></SelectContent></Select></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Appointment Settings */}
          <TabsContent value="appointments">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-blue-500" />Appointment Settings</CardTitle>
                <CardDescription>Configure scheduling and booking preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label>Default Slot Duration (minutes)</Label><Select value={appointmentSettings.defaultSlotDuration} onValueChange={(v) => setAppointmentSettings(p => ({ ...p, defaultSlotDuration: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="15">15 minutes</SelectItem><SelectItem value="20">20 minutes</SelectItem><SelectItem value="30">30 minutes</SelectItem><SelectItem value="45">45 minutes</SelectItem><SelectItem value="60">60 minutes</SelectItem></SelectContent></Select></div>
                  <div className="space-y-2"><Label>Max Advance Booking (days)</Label><Input type="number" value={appointmentSettings.maxAdvanceBooking} onChange={(e) => setAppointmentSettings(p => ({ ...p, maxAdvanceBooking: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Reminder Lead Time (hours)</Label><Input type="number" value={appointmentSettings.reminderHours} onChange={(e) => setAppointmentSettings(p => ({ ...p, reminderHours: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Cancellation Window (hours before)</Label><Input type="number" value={appointmentSettings.cancellationHours} onChange={(e) => setAppointmentSettings(p => ({ ...p, cancellationHours: e.target.value }))} /></div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Allow Walk-ins</Label><p className="text-sm text-muted-foreground">Accept patients without prior appointment</p></div><Switch checked={appointmentSettings.allowWalkIns} onCheckedChange={(v) => setAppointmentSettings(p => ({ ...p, allowWalkIns: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Require Approval</Label><p className="text-sm text-muted-foreground">Appointments need admin approval</p></div><Switch checked={appointmentSettings.requireApproval} onCheckedChange={(v) => setAppointmentSettings(p => ({ ...p, requireApproval: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Send Reminders</Label><p className="text-sm text-muted-foreground">Automatic appointment reminders</p></div><Switch checked={appointmentSettings.sendReminders} onCheckedChange={(v) => setAppointmentSettings(p => ({ ...p, sendReminders: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Allow Cancellation</Label><p className="text-sm text-muted-foreground">Patients can cancel appointments</p></div><Switch checked={appointmentSettings.allowCancellation} onCheckedChange={(v) => setAppointmentSettings(p => ({ ...p, allowCancellation: v }))} /></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Consultation Settings */}
          <TabsContent value="consultation">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-emerald-500" />Consultation Settings</CardTitle>
                <CardDescription>Configure clinical session preferences</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label>Session Timeout (minutes)</Label><Input type="number" value={consultationSettings.sessionTimeout} onChange={(e) => setConsultationSettings(p => ({ ...p, sessionTimeout: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Auto-End After (minutes)</Label><Input type="number" value={consultationSettings.autoEndMinutes} onChange={(e) => setConsultationSettings(p => ({ ...p, autoEndMinutes: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>History Period (months)</Label><Input type="number" value={consultationSettings.historyMonths} onChange={(e) => setConsultationSettings(p => ({ ...p, historyMonths: e.target.value }))} /></div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Require Vitals Before Consultation</Label><p className="text-sm text-muted-foreground">Patient must have vitals recorded</p></div><Switch checked={consultationSettings.requireVitals} onCheckedChange={(v) => setConsultationSettings(p => ({ ...p, requireVitals: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Auto-Assign Consultation Room</Label><p className="text-sm text-muted-foreground">System assigns available room</p></div><Switch checked={consultationSettings.autoAssignRoom} onCheckedChange={(v) => setConsultationSettings(p => ({ ...p, autoAssignRoom: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Require Diagnosis</Label><p className="text-sm text-muted-foreground">Diagnosis required to end session</p></div><Switch checked={consultationSettings.requireDiagnosis} onCheckedChange={(v) => setConsultationSettings(p => ({ ...p, requireDiagnosis: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Show Patient History</Label><p className="text-sm text-muted-foreground">Display previous visits in session</p></div><Switch checked={consultationSettings.showPatientHistory} onCheckedChange={(v) => setConsultationSettings(p => ({ ...p, showPatientHistory: v }))} /></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Laboratory Settings */}
          <TabsContent value="laboratory">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TestTube className="h-5 w-5 text-amber-500" />Laboratory Settings</CardTitle>
                <CardDescription>Configure lab testing and result management</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label>Default Turnaround Time (hours)</Label><Input type="number" value={labSettings.defaultTurnaround} onChange={(e) => setLabSettings(p => ({ ...p, defaultTurnaround: e.target.value }))} /></div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Allow STAT Orders</Label><p className="text-sm text-muted-foreground">Enable urgent test ordering</p></div><Switch checked={labSettings.allowStatOrders} onCheckedChange={(v) => setLabSettings(p => ({ ...p, allowStatOrders: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Critical Value Alerts</Label><p className="text-sm text-muted-foreground">Notify for critical results</p></div><Switch checked={labSettings.criticalValueAlerts} onCheckedChange={(v) => setLabSettings(p => ({ ...p, criticalValueAlerts: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Require Result Verification</Label><p className="text-sm text-muted-foreground">Senior approval before release</p></div><Switch checked={labSettings.requireVerification} onCheckedChange={(v) => setLabSettings(p => ({ ...p, requireVerification: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Auto-Notify Doctor</Label><p className="text-sm text-muted-foreground">Alert when results ready</p></div><Switch checked={labSettings.autoNotifyDoctor} onCheckedChange={(v) => setLabSettings(p => ({ ...p, autoNotifyDoctor: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Barcode Tracking</Label><p className="text-sm text-muted-foreground">Use barcodes for specimens</p></div><Switch checked={labSettings.barcodeEnabled} onCheckedChange={(v) => setLabSettings(p => ({ ...p, barcodeEnabled: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Allow Outsourcing</Label><p className="text-sm text-muted-foreground">Send tests to external labs</p></div><Switch checked={labSettings.allowOutsourcing} onCheckedChange={(v) => setLabSettings(p => ({ ...p, allowOutsourcing: v }))} /></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pharmacy Settings */}
          <TabsContent value="pharmacy">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-violet-500" />Pharmacy Settings</CardTitle>
                <CardDescription>Configure dispensing and inventory management</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2"><Label>Low Stock Threshold</Label><Input type="number" value={pharmacySettings.lowStockThreshold} onChange={(e) => setPharmacySettings(p => ({ ...p, lowStockThreshold: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Expiry Warning (days before)</Label><Input type="number" value={pharmacySettings.expiryWarningDays} onChange={(e) => setPharmacySettings(p => ({ ...p, expiryWarningDays: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Max Dispense Quantity (days supply)</Label><Input type="number" value={pharmacySettings.maxDispenseQuantity} onChange={(e) => setPharmacySettings(p => ({ ...p, maxDispenseQuantity: e.target.value }))} /></div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Allow Drug Substitution</Label><p className="text-sm text-muted-foreground">Pharmacist can substitute drugs</p></div><Switch checked={pharmacySettings.allowSubstitution} onCheckedChange={(v) => setPharmacySettings(p => ({ ...p, allowSubstitution: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Allergy Check</Label><p className="text-sm text-muted-foreground">Check for drug allergies</p></div><Switch checked={pharmacySettings.allergyCheck} onCheckedChange={(v) => setPharmacySettings(p => ({ ...p, allergyCheck: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Drug Interaction Check</Label><p className="text-sm text-muted-foreground">Check for interactions</p></div><Switch checked={pharmacySettings.drugInteractionCheck} onCheckedChange={(v) => setPharmacySettings(p => ({ ...p, drugInteractionCheck: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Track Batches</Label><p className="text-sm text-muted-foreground">Track inventory by batch</p></div><Switch checked={pharmacySettings.trackBatches} onCheckedChange={(v) => setPharmacySettings(p => ({ ...p, trackBatches: v }))} /></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Security Settings */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-rose-500" />Security Settings</CardTitle>
                <CardDescription>Configure authentication and access control</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2"><Label>Session Timeout (minutes)</Label><Input type="number" value={securitySettings.sessionTimeout} onChange={(e) => setSecuritySettings(p => ({ ...p, sessionTimeout: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Max Login Attempts</Label><Input type="number" value={securitySettings.maxLoginAttempts} onChange={(e) => setSecuritySettings(p => ({ ...p, maxLoginAttempts: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Lockout Duration (minutes)</Label><Input type="number" value={securitySettings.lockoutDuration} onChange={(e) => setSecuritySettings(p => ({ ...p, lockoutDuration: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Password Expiry (days)</Label><Input type="number" value={securitySettings.passwordExpiry} onChange={(e) => setSecuritySettings(p => ({ ...p, passwordExpiry: e.target.value }))} /></div>
                  <div className="space-y-2"><Label>Min Password Length</Label><Input type="number" value={securitySettings.minPasswordLength} onChange={(e) => setSecuritySettings(p => ({ ...p, minPasswordLength: e.target.value }))} /></div>
                </div>
                <Separator />
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Require Special Characters</Label><p className="text-sm text-muted-foreground">Password must contain special chars</p></div><Switch checked={securitySettings.requireSpecialChar} onCheckedChange={(v) => setSecuritySettings(p => ({ ...p, requireSpecialChar: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Two-Factor Authentication</Label><p className="text-sm text-muted-foreground">Require 2FA for all users</p></div><Switch checked={securitySettings.require2FA} onCheckedChange={(v) => setSecuritySettings(p => ({ ...p, require2FA: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Audit Logging</Label><p className="text-sm text-muted-foreground">Track all system activities</p></div><Switch checked={securitySettings.auditEnabled} onCheckedChange={(v) => setSecuritySettings(p => ({ ...p, auditEnabled: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Data Encryption</Label><p className="text-sm text-muted-foreground">Encrypt sensitive data</p></div><Switch checked={securitySettings.dataEncryption} onCheckedChange={(v) => setSecuritySettings(p => ({ ...p, dataEncryption: v }))} /></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notification Settings */}
          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-cyan-500" />Notification Settings</CardTitle>
                <CardDescription>Configure system alerts and notifications</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Email Notifications</Label></div><Switch checked={notificationSettings.emailEnabled} onCheckedChange={(v) => setNotificationSettings(p => ({ ...p, emailEnabled: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>SMS Notifications</Label></div><Switch checked={notificationSettings.smsEnabled} onCheckedChange={(v) => setNotificationSettings(p => ({ ...p, smsEnabled: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>In-App Notifications</Label></div><Switch checked={notificationSettings.inAppEnabled} onCheckedChange={(v) => setNotificationSettings(p => ({ ...p, inAppEnabled: v }))} /></div>
                </div>
                <Separator />
                <h4 className="font-medium">Notification Events</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Appointment Reminders</Label><p className="text-sm text-muted-foreground">Remind patients of appointments</p></div><Switch checked={notificationSettings.appointmentReminders} onCheckedChange={(v) => setNotificationSettings(p => ({ ...p, appointmentReminders: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Lab Results Ready</Label><p className="text-sm text-muted-foreground">Notify when results available</p></div><Switch checked={notificationSettings.labResultsReady} onCheckedChange={(v) => setNotificationSettings(p => ({ ...p, labResultsReady: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Prescription Ready</Label><p className="text-sm text-muted-foreground">Notify when prescription filled</p></div><Switch checked={notificationSettings.prescriptionReady} onCheckedChange={(v) => setNotificationSettings(p => ({ ...p, prescriptionReady: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Critical Alerts</Label><p className="text-sm text-muted-foreground">Urgent system notifications</p></div><Switch checked={notificationSettings.criticalAlerts} onCheckedChange={(v) => setNotificationSettings(p => ({ ...p, criticalAlerts: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Daily Digest</Label><p className="text-sm text-muted-foreground">Daily activity summary</p></div><Switch checked={notificationSettings.dailyDigest} onCheckedChange={(v) => setNotificationSettings(p => ({ ...p, dailyDigest: v }))} /></div>
                  <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"><div><Label>Weekly Report</Label><p className="text-sm text-muted-foreground">Weekly analytics report</p></div><Switch checked={notificationSettings.weeklyReport} onCheckedChange={(v) => setNotificationSettings(p => ({ ...p, weeklyReport: v }))} /></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

