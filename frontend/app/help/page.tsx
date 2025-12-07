"use client";

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  HelpCircle, Search, Book, FileText, Video, MessageCircle, Phone, Mail,
  ExternalLink, ChevronRight, Stethoscope, TestTube, Pill, Users, Calendar,
  Shield, Settings, Clock, CheckCircle2, AlertTriangle, Send, Headphones
} from 'lucide-react';

// FAQ data
const faqs = [
  {
    category: 'Getting Started',
    questions: [
      { q: 'How do I register a new patient?', a: 'Navigate to Medical Records > Register Patient. Fill in the patient details including personal information, contact details, and medical history. Click "Register" to complete the process.' },
      { q: 'How do I start a consultation session?', a: 'Go to Consultation > Start Consultation. Select an available consultation room, then click "Start Session". The system will assign the next patient in queue to your session.' },
      { q: 'How do I access my dashboard?', a: 'Click on the "Dashboard" link in the sidebar or your profile icon. Your personalized dashboard shows your daily schedule, pending tasks, and quick actions.' },
    ]
  },
  {
    category: 'Patient Management',
    questions: [
      { q: 'How do I search for a patient?', a: 'Use the search bar in Medical Records > Manage Patients. You can search by patient name, ID, phone number, or personal number. Use filters for more specific searches.' },
      { q: 'How do I update patient information?', a: 'Find the patient in Manage Patients, click on their record, then click "Edit". Make the necessary changes and save.' },
      { q: 'How do I add a dependent to a patient?', a: 'Go to Medical Records > Manage Dependents. Click "Add Dependent", select the principal staff member, and fill in the dependent\'s details.' },
    ]
  },
  {
    category: 'Consultation',
    questions: [
      { q: 'How do I write prescriptions?', a: 'During a consultation session, go to the "Prescriptions" tab. Search for the medication, set dosage and duration, then click "Add". The prescription will be sent to the pharmacy queue.' },
      { q: 'How do I order lab tests?', a: 'In the consultation session, navigate to the "Lab Orders" tab. Select the required tests, set priority, and add clinical notes. Click "Add Order" to send to the laboratory.' },
      { q: 'How do I end a consultation session?', a: 'Click "End Session" at the top of the consultation page. Confirm the action. The session will be saved and the patient will be discharged from your queue.' },
    ]
  },
  {
    category: 'Laboratory',
    questions: [
      { q: 'How do I process a lab order?', a: 'Go to Laboratory > Lab Orders. Find the order, click "View", collect the specimen, and update the status. Enter results when ready and submit for verification.' },
      { q: 'How do I verify lab results?', a: 'Navigate to Laboratory > Results Verification. Review the results, check for accuracy, and either approve or reject. Approved results are sent to the ordering doctor.' },
      { q: 'What are critical values?', a: 'Critical values are lab results that fall outside safe ranges and require immediate attention. The system alerts both the lab and the doctor when detected.' },
    ]
  },
  {
    category: 'Pharmacy',
    questions: [
      { q: 'How do I dispense medications?', a: 'Go to Pharmacy > Prescriptions. Find the prescription, verify patient details and medications, then click "Dispense". Mark items as dispensed and complete the order.' },
      { q: 'How do I substitute a medication?', a: 'When dispensing, click "Substitute" on the medication. Select an alternative from the available options, enter the reason, and confirm. The substitution will be recorded.' },
      { q: 'How do I manage inventory?', a: 'Go to Pharmacy > Inventory. You can add new drugs, record batches, check stock levels, and set up low stock alerts from this page.' },
    ]
  },
];

// Quick links
const quickLinks = [
  { title: 'User Guide', description: 'Complete EMR user manual', icon: Book, href: '#' },
  { title: 'Video Tutorials', description: 'Step-by-step video guides', icon: Video, href: '#' },
  { title: 'API Documentation', description: 'Technical documentation', icon: FileText, href: '#' },
  { title: 'Release Notes', description: 'Latest updates and changes', icon: ExternalLink, href: '#' },
];

// Contact options
const contactOptions = [
  { title: 'IT Help Desk', description: 'For technical issues', icon: Headphones, contact: 'Ext. 1234', type: 'phone' },
  { title: 'Email Support', description: 'Send us a message', icon: Mail, contact: 'emr-support@npa.gov.ng', type: 'email' },
  { title: 'Live Chat', description: 'Chat with support', icon: MessageCircle, contact: 'Start Chat', type: 'chat' },
];

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({ category: '', priority: 'medium', subject: '', description: '' });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const filteredFaqs = faqs.filter(cat => {
    if (selectedCategory !== 'all' && cat.category !== selectedCategory) return false;
    if (searchQuery) {
      return cat.questions.some(q => 
        q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
        q.a.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    return true;
  }).map(cat => ({
    ...cat,
    questions: searchQuery 
      ? cat.questions.filter(q => 
          q.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
          q.a.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : cat.questions
  }));

  const handleSubmitTicket = async () => {
    setIsSubmitting(true);
    await new Promise(r => setTimeout(r, 1500));
    toast.success('Support ticket submitted successfully! Ticket #EMR-2024-' + Math.random().toString(36).substring(2, 8).toUpperCase());
    setIsTicketDialogOpen(false);
    setTicketForm({ category: '', priority: 'medium', subject: '', description: '' });
    setIsSubmitting(false);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <HelpCircle className="h-8 w-8 text-cyan-500" />
              Help & Support
            </h1>
            <p className="text-muted-foreground mt-1">Get help with using the EMR system</p>
          </div>
          <Button onClick={() => setIsTicketDialogOpen(true)} className="bg-cyan-600 hover:bg-cyan-700">
            <Send className="h-4 w-4 mr-2" />Submit Support Ticket
          </Button>
        </div>

        {/* Search */}
        <Card className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-500/20">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4">How can we help you today?</h2>
            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search for help articles, FAQs, or topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-12 text-lg"
              />
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {quickLinks.map(link => (
            <Card key={link.title} className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors">
                  <link.icon className="h-6 w-6 text-cyan-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{link.title}</h3>
                  <p className="text-sm text-muted-foreground">{link.description}</p>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-cyan-500 transition-colors" />
              </CardContent>
            </Card>
          ))}
          </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FAQs */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {faqs.map(cat => <SelectItem key={cat.category} value={cat.category}>{cat.category}</SelectItem>)}
                </SelectContent>
              </Select>
                  </div>

            {filteredFaqs.length === 0 ? (
              <Card className="p-8 text-center">
                <HelpCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground">No FAQs found matching your search</p>
              </Card>
            ) : (
              filteredFaqs.map(cat => (
                <Card key={cat.category}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{cat.category}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {cat.questions.map((qa, i) => (
                        <AccordionItem key={i} value={`${cat.category}-${i}`}>
                          <AccordionTrigger className="text-left">{qa.q}</AccordionTrigger>
                          <AccordionContent className="text-muted-foreground">{qa.a}</AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {/* Contact & Status */}
          <div className="space-y-4">
            {/* Contact Options */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5 text-emerald-500" />Contact Support</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {contactOptions.map(opt => (
                  <div key={opt.title} className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                      <opt.icon className="h-5 w-5 text-emerald-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{opt.title}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                    <Badge variant="secondary">{opt.contact}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* System Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-blue-500" />System Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm">EMR Core Services</span>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Operational</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Laboratory Module</span>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Operational</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Pharmacy Module</span>
                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30"><CheckCircle2 className="h-3 w-3 mr-1" />Operational</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Backup Services</span>
                  <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/30"><AlertTriangle className="h-3 w-3 mr-1" />Degraded</Badge>
                </div>
                <div className="text-xs text-muted-foreground mt-2">Last updated: 5 minutes ago</div>
              </CardContent>
            </Card>

            {/* Support Hours */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" />Support Hours</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between"><span>Monday - Friday</span><span className="font-medium">8:00 AM - 6:00 PM</span></div>
                <div className="flex justify-between"><span>Saturday</span><span className="font-medium">9:00 AM - 2:00 PM</span></div>
                <div className="flex justify-between"><span>Sunday</span><span className="text-muted-foreground">Closed</span></div>
                <div className="pt-2 border-t mt-2">
                  <div className="flex justify-between"><span>Emergency Support</span><span className="font-medium text-emerald-600">24/7</span></div>
          </div>
              </CardContent>
              </Card>
          </div>
        </div>

        {/* Submit Ticket Dialog */}
        <Dialog open={isTicketDialogOpen} onOpenChange={setIsTicketDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Send className="h-5 w-5 text-cyan-500" />Submit Support Ticket</DialogTitle>
              <DialogDescription>Describe your issue and our team will get back to you</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select value={ticketForm.category} onValueChange={(v) => setTicketForm(p => ({ ...p, category: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Technical Issue</SelectItem>
                      <SelectItem value="access">Access Problem</SelectItem>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="training">Training Request</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={ticketForm.priority} onValueChange={(v) => setTicketForm(p => ({ ...p, priority: v }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input value={ticketForm.subject} onChange={(e) => setTicketForm(p => ({ ...p, subject: e.target.value }))} placeholder="Brief description of the issue" />
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea value={ticketForm.description} onChange={(e) => setTicketForm(p => ({ ...p, description: e.target.value }))} placeholder="Please provide detailed information about your issue..." rows={5} />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsTicketDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitTicket} disabled={isSubmitting || !ticketForm.category || !ticketForm.subject || !ticketForm.description} className="bg-cyan-600 hover:bg-cyan-700">
                {isSubmitting ? 'Submitting...' : 'Submit Ticket'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
