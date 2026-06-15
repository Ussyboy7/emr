"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Droplets,
  Edit,
  Eye,
  History,
  Loader2,
  Pill,
  Plus,
  ScanLine,
  Send,
  Syringe,
  TestTube,
  X,
} from 'lucide-react';

import { referralService } from '@/lib/services';
import {
  referralStatusLabel,
  getStatusBadgeClass,
  getFacilityTypeBadgeClass,
  getUrgencyBadgeClass,
  referralFormsSummary,
  toLabel,
  type ReferralWithPatient,
} from '@/lib/referrals/referral-helpers';
import { toast } from 'sonner';

export type ConsultationRoomReferralTabProps = {
  sessionReferrals: ReferralWithPatient[];
  sessionReferralsLoading: boolean;
  onShowAddReferral: () => void;
  onOpenReferralView: (id: number) => void;
  onReferralUpdated: () => void;
};

export function ConsultationRoomReferralTab({
  sessionReferrals,
  sessionReferralsLoading,
  onShowAddReferral,
  onOpenReferralView,
  onReferralUpdated,
}: ConsultationRoomReferralTabProps) {
  return (
          <TabsContent value="referral">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Send className="h-5 w-5 text-teal-500" />
                      Referrals
                    </CardTitle>
                    <CardDescription>
                      Create a referral, then use Manage to print, issue forms, and send to Medical Records.
                    </CardDescription>
                  </div>
                  <Button variant="outline" onClick={() => onShowAddReferral()}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create referral
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {sessionReferralsLoading ? (
                  <div className="flex justify-center py-10 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : sessionReferrals.length > 0 ? (
                  <div className="space-y-3">
                    {sessionReferrals.map((referral) => (
                      <Card key={referral.id} className="border-l-4 border-l-teal-500">
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-semibold">{referral.specialty}</span>
                                <Badge variant="outline" className={getStatusBadgeClass(referral.status)}>
                                  {referralStatusLabel(referral.status)}
                                </Badge>
                                <Badge variant="outline" className={getFacilityTypeBadgeClass(referral.facility_type)}>
                                  {toLabel(referral.facility_type)}
                                </Badge>
                                <Badge variant="outline" className={getUrgencyBadgeClass(referral.urgency)}>
                                  {toLabel(referral.urgency)}
                                </Badge>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">{referral.facility}</span>
                                {' · '}
                                {referralFormsSummary(referral)}
                              </p>
                              <p className="text-sm text-muted-foreground line-clamp-2">{referral.reason}</p>
                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Button size="sm" variant="outline" onClick={() => onOpenReferralView(referral.id)}>
                                <Eye className="h-4 w-4 mr-1" />
                                Manage
                              </Button>
                              {referral.status === 'draft' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-500 hover:text-red-600"
                                  onClick={() => {
                                    void (async () => {
                                      try {
                                        await referralService.deleteReferral(referral.id);
                                        onReferralUpdated();
                                        toast.success('Referral removed');
                                      } catch (err: unknown) {
                                        toast.error(err instanceof Error ? err.message : 'Failed to remove referral');
                                      }
                                    })();
                                  }}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-teal-50 to-teal-100/50 dark:from-teal-900/10 dark:to-teal-900/5 rounded-lg border-2 border-dashed border-teal-200 dark:border-teal-800">
                    <Send className="h-12 w-12 mx-auto mb-3 text-teal-500 opacity-60" />
                    <p className="font-medium text-teal-900 dark:text-teal-100 mb-1">No referrals yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Refer patient to specialists or other facilities</p>
                    <Button variant="outline" size="sm" onClick={() => onShowAddReferral()} className="border-teal-300 text-teal-700 hover:bg-teal-100">
                      <Plus className="h-4 w-4 mr-1" />
                      Create referral
                    </Button>
                  </div>
                )}

              </CardContent>
            </Card>
          </TabsContent>
  );
}
