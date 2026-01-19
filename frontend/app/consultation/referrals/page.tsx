"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight, Building2, Calendar, Clock, Eye, Filter,
  RefreshCw, Search, Stethoscope, User, UserPlus,
  AlertTriangle, CheckCircle, XCircle, Clock4, Phone, Mail
} from "lucide-react";
import { toast } from "sonner";
import { referralService, type Referral } from "@/lib/services/referral-service";
import { useRouter } from "next/navigation";
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import Link from "next/link";

interface ReferralWithPatient extends Referral {
  patient_name?: string;
  referred_by_name?: string;
}

export default function ReferralsManagementPage() {
  const router = useRouter();
  const [referrals, setReferrals] = useState<ReferralWithPatient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedReferral, setSelectedReferral] = useState<ReferralWithPatient | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('all');

  const statusOptions = [
    { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-800' },
    { value: 'sent', label: 'Sent', color: 'bg-blue-100 text-blue-800' },
    { value: 'accepted', label: 'Accepted', color: 'bg-green-100 text-green-800' },
    { value: 'scheduled', label: 'Scheduled', color: 'bg-purple-100 text-purple-800' },
    { value: 'completed', label: 'Completed', color: 'bg-emerald-100 text-emerald-800' },
    { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' }
  ];

  const urgencyOptions = [
    { value: 'routine', label: 'Routine', color: 'bg-blue-100 text-blue-800' },
    { value: 'urgent', label: 'Urgent', color: 'bg-amber-100 text-amber-800' },
    { value: 'emergency', label: 'Emergency', color: 'bg-red-100 text-red-800' }
  ];

  const facilityTypes = [
    { value: 'internal', label: 'Internal', color: 'bg-teal-100 text-teal-800' },
    { value: 'external', label: 'External', color: 'bg-orange-100 text-orange-800' },
    { value: 'specialist', label: 'Specialist', color: 'bg-purple-100 text-purple-800' }
  ];

  const fetchReferrals = async () => {
    setIsLoading(true);
    try {
      const params: any = {};

      if (statusFilter !== 'all') params.status = statusFilter;
      if (specialtyFilter !== 'all') params.specialty = specialtyFilter;
      if (facilityFilter !== 'all') params.facility = facilityFilter;
      if (urgencyFilter !== 'all') params.urgency = urgencyFilter;
      if (searchQuery.trim()) params.search = searchQuery;

      // Date filtering
      if (dateFilter !== 'all') {
        const now = new Date();
        let startDate: Date;

        switch (dateFilter) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
          default:
            startDate = new Date(0);
        }

        // Note: This would need backend support for date filtering
        // For now, we'll fetch all and filter client-side
      }

      const response = await referralService.getReferrals(params);
      setReferrals(response.results || []);
    } catch (error: any) {
      console.error("Error fetching referrals:", error);

      // Handle authentication errors
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }

      toast.error(error.message || "Failed to load referrals");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReferrals();
  }, [statusFilter, specialtyFilter, facilityFilter, urgencyFilter, dateFilter]);

  const handleStatusUpdate = async (referralId: number, newStatus: string, notes?: string) => {
    try {
      const updateData: any = { status: newStatus };
      if (notes) updateData.notes = notes;

      await referralService.updateReferral(referralId, updateData);

      // Update local state
      setReferrals(prev => prev.map(ref =>
        ref.id === referralId
          ? { ...ref, status: newStatus as any, notes: notes || ref.notes }
          : ref
      ));

      toast.success(`Referral status updated to ${newStatus}`);
      setShowDetailsModal(false);
    } catch (error: any) {
      console.error("Error updating referral:", error);

      // Handle authentication errors
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }

      toast.error(error.message || "Failed to update referral");
    }
  };

  const getStatusBadge = (status: string) => {
    const option = statusOptions.find(opt => opt.value === status);
    return option ? option.color : 'bg-gray-100 text-gray-800';
  };

  const getUrgencyBadge = (urgency: string) => {
    const option = urgencyOptions.find(opt => opt.value === urgency);
    return option ? option.color : 'bg-blue-100 text-blue-800';
  };

  const getFacilityTypeBadge = (facilityType: string) => {
    const option = facilityTypes.find(opt => opt.value === facilityType);
    return option ? option.color : 'bg-gray-100 text-gray-800';
  };

  // Get unique values for filters
  const specialties = [...new Set(referrals.map(r => r.specialty))].sort();
  const facilities = [...new Set(referrals.map(r => r.facility))].sort();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/consultation" className="hover:text-primary">Consultation</Link>
          <span>/</span>
          <span>Referrals</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <ArrowRight className="h-8 w-8 text-blue-500" />
              Referrals Management
            </h1>
            <p className="text-muted-foreground mt-1">Track and manage patient referrals to specialists and facilities</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchReferrals} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Filters
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search referrals..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {statusOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Specialty</Label>
                <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Specialties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Specialties</SelectItem>
                    {specialties.map(specialty => (
                      <SelectItem key={specialty} value={specialty}>
                        {specialty}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Urgency</Label>
                <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Urgencies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Urgencies</SelectItem>
                    {urgencyOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Referrals List */}
        <Card>
          <CardHeader>
            <CardTitle>Referrals ({referrals.length})</CardTitle>
            <CardDescription>Click on any referral to view details and update status</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin mr-2" />
                Loading referrals...
              </div>
            ) : referrals.length === 0 ? (
              <div className="text-center py-8">
                <Stethoscope className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
                <h3 className="text-lg font-medium mb-2">No referrals found</h3>
                <p className="text-muted-foreground">Try adjusting your filters or create a new referral in a consultation session.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {referrals.map((referral) => (
                  <Card
                    key={referral.id}
                    className={`cursor-pointer hover:shadow-md transition-shadow ${
                      referral.urgency === 'emergency' ? 'border-red-200 bg-red-50/50 dark:bg-red-900/10' :
                      referral.urgency === 'urgent' ? 'border-amber-200 bg-amber-50/50 dark:bg-amber-900/10' :
                      'border-border'
                    }`}
                    onClick={() => {
                      setSelectedReferral(referral);
                      setShowDetailsModal(true);
                    }}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-3 flex-1">
                          <div className={`p-2 rounded-full ${
                            referral.facility_type === 'external' ? 'bg-orange-100 dark:bg-orange-900/30' :
                            referral.facility_type === 'specialist' ? 'bg-purple-100 dark:bg-purple-900/30' :
                            'bg-teal-100 dark:bg-teal-900/30'
                          }`}>
                            {referral.facility_type === 'external' ? (
                              <Building2 className="h-4 w-4 text-orange-600" />
                            ) : referral.facility_type === 'specialist' ? (
                              <UserPlus className="h-4 w-4 text-purple-600" />
                            ) : (
                              <User className="h-4 w-4 text-teal-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold">{referral.referral_id}</span>
                              <Badge variant="outline" className={getFacilityTypeBadge(referral.facility_type)}>
                                {referral.facility_type}
                              </Badge>
                              <Badge variant="outline" className={getStatusBadge(referral.status)}>
                                {referral.status}
                              </Badge>
                              {referral.urgency !== 'routine' && (
                                <Badge variant="outline" className={getUrgencyBadge(referral.urgency)}>
                                  {referral.urgency === 'emergency' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                  {referral.urgency}
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <div><strong>Patient:</strong> {referral.patient_name || 'Unknown'}</div>
                              <div><strong>Specialty:</strong> {referral.specialty}</div>
                              <div><strong>Facility:</strong> {referral.facility}</div>
                              <div><strong>Reason:</strong> {referral.reason}</div>
                              {referral.clinical_summary && (
                                <div><strong>Summary:</strong> {referral.clinical_summary.length > 50
                                  ? `${referral.clinical_summary.substring(0, 50)}...`
                                  : referral.clinical_summary}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(referral.referred_at).toLocaleDateString()}
                              </div>
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {referral.referred_by_name || 'Unknown'}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Referral Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5" />
                Referral Details - {selectedReferral?.referral_id}
              </DialogTitle>
            </DialogHeader>

            {selectedReferral && (
              <div className="space-y-6">
                {/* Status and Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getStatusBadge(selectedReferral.status)}>
                      {selectedReferral.status}
                    </Badge>
                    <Badge variant="outline" className={getUrgencyBadge(selectedReferral.urgency)}>
                      {selectedReferral.urgency}
                    </Badge>
                    <Badge variant="outline" className={getFacilityTypeBadge(selectedReferral.facility_type)}>
                      {selectedReferral.facility_type}
                    </Badge>
                  </div>

                  {selectedReferral.status !== 'completed' && selectedReferral.status !== 'cancelled' && (
                    <div className="flex gap-2">
                      {selectedReferral.status === 'sent' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusUpdate(selectedReferral.id, 'accepted')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Accept
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusUpdate(selectedReferral.id, 'cancelled')}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Cancel
                          </Button>
                        </>
                      )}
                      {selectedReferral.status === 'accepted' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusUpdate(selectedReferral.id, 'scheduled')}
                        >
                          <Clock4 className="h-4 w-4 mr-1" />
                          Schedule
                        </Button>
                      )}
                      {(selectedReferral.status === 'scheduled' || selectedReferral.status === 'accepted') && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate(selectedReferral.id, 'completed')}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Complete
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Referral Information */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Referral ID</Label>
                    <p className="text-sm">{selectedReferral.referral_id}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Patient</Label>
                    <p className="text-sm">{selectedReferral.patient_name || 'Unknown'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Specialty</Label>
                    <p className="text-sm">{selectedReferral.specialty}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Facility</Label>
                    <p className="text-sm">{selectedReferral.facility}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Referred By</Label>
                    <p className="text-sm">{selectedReferral.referred_by_name || 'Unknown'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Date</Label>
                    <p className="text-sm">{new Date(selectedReferral.referred_at).toLocaleString()}</p>
                  </div>
                </div>

                {/* Referral Details */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Reason for Referral</Label>
                    <p className="text-sm p-3 bg-muted/50 rounded">{selectedReferral.reason}</p>
                  </div>

                  {selectedReferral.clinical_summary && (
                    <div>
                      <Label className="text-sm font-medium">Clinical Summary</Label>
                      <p className="text-sm p-3 bg-muted/50 rounded">{selectedReferral.clinical_summary}</p>
                    </div>
                  )}

                  {/* Contact Information */}
                  {(selectedReferral.contact_person || selectedReferral.contact_phone || selectedReferral.contact_email) && (
                    <div>
                      <Label className="text-sm font-medium">Contact Information</Label>
                      <div className="p-3 bg-muted/50 rounded space-y-2">
                        {selectedReferral.contact_person && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4" />
                            <span>{selectedReferral.contact_person}</span>
                          </div>
                        )}
                        {selectedReferral.contact_phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4" />
                            <span>{selectedReferral.contact_phone}</span>
                          </div>
                        )}
                        {selectedReferral.contact_email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4" />
                            <span>{selectedReferral.contact_email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedReferral.notes && (
                    <div>
                      <Label className="text-sm font-medium">Notes</Label>
                      <p className="text-sm p-3 bg-muted/50 rounded">{selectedReferral.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}