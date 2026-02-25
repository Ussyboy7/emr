"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StandardPagination } from "@/components/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { pharmacyService, type StockRequest, type Medication } from "@/lib/services";
import { Send, Search, Plus, CheckCircle2, Clock, Loader2, Eye } from "lucide-react";

export default function StockRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [totalRequests, setTotalRequests] = useState(0);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  // Form state
  const [requestItems, setRequestItems] = useState<Array<{ medication: number; quantity: number }>>([]);
  const [requestNotes, setRequestNotes] = useState("");
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [medicationSearch, setMedicationSearch] = useState("");
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [requestQuantity, setRequestQuantity] = useState("100");
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    confirmed: 0,
    awaitingConfirmation: 0,
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    loadMedications();
    loadStats();
  }, []);

  useEffect(() => {
    loadRequests();
  }, [currentPage, itemsPerPage, statusFilter, searchQuery]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: itemsPerPage,
      };

      const trimmedSearch = searchQuery.trim();
      if (statusFilter !== "all") params.status = statusFilter;
      if (trimmedSearch) params.search = trimmedSearch;

      const response = await pharmacyService.getStockRequests({
        ...params,
      });
      setRequests(response.results || []);
      setTotalRequests(response.count || 0);
    } catch (err) {
      console.error("Error loading stock requests:", err);
      toast.error("Failed to load stock requests");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const [allResponse, pendingResponse, approvedResponse, receivedResponse, fulfilledResponse] = await Promise.all([
        pharmacyService.getStockRequests({ page: 1, page_size: 1 }),
        pharmacyService.getStockRequests({ status: "pending", page: 1, page_size: 1 }),
        pharmacyService.getStockRequests({ status: "approved", page: 1, page_size: 1 }),
        pharmacyService.getStockRequests({ status: "received", page: 1, page_size: 1 }),
        pharmacyService.getStockRequests({ status: "fulfilled", page: 1, page_size: 1 }),
      ]);

      setStats({
        total: allResponse.count || 0,
        pending: pendingResponse.count || 0,
        approved: approvedResponse.count || 0,
        confirmed: receivedResponse.count || 0,
        awaitingConfirmation: fulfilledResponse.count || 0,
      });
    } catch (err) {
      console.error("Error loading stock request stats:", err);
    }
  };

  const loadMedications = async () => {
    try {
      const response = await pharmacyService.getMedications({
        page: 1,
        page_size: 500,
      });
      setMedications(response.results || []);
    } catch (err) {
      console.error("Error loading medications:", err);
    }
  };

  const handleAddItem = () => {
    if (!selectedMedication) {
      toast.error("Please select a medication");
      return;
    }
    if (!requestQuantity || Number(requestQuantity) <= 0) {
      toast.error("Please enter a valid quantity");
      return;
    }

    if (requestItems.find((i) => i.medication === selectedMedication.id)) {
      toast.error("This medication is already added");
      return;
    }

    setRequestItems([
      ...requestItems,
      {
        medication: selectedMedication.id,
        quantity: Number(requestQuantity),
      },
    ]);

    setSelectedMedication(null);
    setMedicationSearch("");
    setRequestQuantity("100");
  };

  const handleCreateRequest = async () => {
    if (requestItems.length === 0) {
      toast.error("Please add at least one medication");
      return;
    }

    try {
      setCreatingRequest(true);
      await pharmacyService.createStockRequest({
        items: requestItems,
        notes: requestNotes,
      });
      toast.success("Stock request created successfully");
      setShowNewRequestModal(false);
      setRequestItems([]);
      setRequestNotes("");
      await loadRequests();
      await loadStats();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create stock request");
    } finally {
      setCreatingRequest(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!selectedRequest) return;

    try {
      setIsConfirming(true);
      await pharmacyService.confirmStockRequest(selectedRequest.id, confirmNotes);
      toast.success("Stock receipt confirmed!");
      setShowConfirmModal(false);
      setConfirmNotes("");
      await loadRequests();
      await loadStats();
    } catch (err: any) {
      toast.error(err?.message || "Failed to confirm receipt");
    } finally {
      setIsConfirming(false);
    }
  };

  const filteredMedications = useMemo(() => {
    if (!medicationSearch) return [];
    return medications.filter((med) =>
      med.name.toLowerCase().includes(medicationSearch.toLowerCase()) ||
      med.code.toLowerCase().includes(medicationSearch.toLowerCase())
    );
  }, [medications, medicationSearch]);

  const getItemUnit = (item: any) => {
    if (item.unit) return item.unit;
    const med = medications.find((m) => m.id === item.medication);
    return med?.unit || "units";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-orange-100 text-orange-800">Pending</Badge>;
      case "approved":
        return <Badge className="bg-blue-100 text-blue-800">Approved</Badge>;
      case "fulfilled":
        return <Badge className="bg-yellow-100 text-yellow-800">Issued (Awaiting Confirmation)</Badge>;
      case "received":
        return <Badge className="bg-green-100 text-green-800">Confirmed ✓</Badge>;
      case "rejected":
        return <Badge className="bg-red-100 text-red-800">Rejected</Badge>;
      case "partially_fulfilled":
        return <Badge className="bg-amber-100 text-amber-800">Partially Fulfilled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Send className="h-8 w-8 text-violet-500" />
              Dispensary Requests
            </h1>
            <p className="text-muted-foreground mt-1">Request stock from Central store to Dispensary</p>
          </div>
          <Button onClick={() => setShowNewRequestModal(true)} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="h-4 w-4 mr-2" />
            New Request
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold text-violet-600">{stats.total}</p>
                </div>
                <Send className="h-5 w-5 text-violet-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className={`text-2xl font-bold ${stats.pending > 0 ? "text-orange-600" : "text-green-600"}`}>
                    {stats.pending}
                  </p>
                </div>
                <Clock className={`h-5 w-5 ${stats.pending > 0 ? "text-orange-500" : "text-green-500"}`} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.approved}</p>
                </div>
                <Clock className="h-5 w-5 text-blue-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Confirmed</p>
                  <p className="text-2xl font-bold text-green-600">{stats.confirmed}</p>
                  <p className="text-xs text-muted-foreground">Awaiting: {stats.awaitingConfirmation}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs">Search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by ID or notes..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs">Status</Label>
                <Select value={statusFilter} onValueChange={(val) => {
                  setStatusFilter(val);
                  setCurrentPage(1);
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="fulfilled">Fulfilled</SelectItem>
                    <SelectItem value="partially_fulfilled">Partially Fulfilled</SelectItem>
                    <SelectItem value="received">Received</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Requests List */}
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading requests...</p>
              </CardContent>
            </Card>
          ) : requests.length > 0 ? (
            requests.map((req) => (
              <Card key={req.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{req.request_id}</span>
                        {getStatusBadge(req.status)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {req.items?.length || 0} item(s) • Created {new Date(req.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedRequest(req);
                        setShowDetailsModal(true);
                      }}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      View
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No requests found</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pagination */}
        {totalRequests > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalRequests}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1);
              }}
              itemName="requests"
              pageSizeOptions={[10, 25, 50, 75, 100]}
            />
          </Card>
        )}

        {/* New Request Modal */}
        <Dialog open={showNewRequestModal} onOpenChange={setShowNewRequestModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Dispensary Request</DialogTitle>
              <DialogDescription>Request medications from Central store to Dispensary</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <h4 className="font-medium mb-3">Add Items to Request</h4>

                <div className="space-y-3">
                  <div className="relative">
                    <Label className="text-xs mb-1 block">Search Medication</Label>
                    <Input
                      placeholder="Search by name or code..."
                      value={medicationSearch}
                      onChange={(e) => setMedicationSearch(e.target.value)}
                      className="mt-1"
                    />
                    {filteredMedications.length > 0 && medicationSearch && (
                      <div className="absolute top-full left-0 right-0 mt-1 border rounded-lg bg-white dark:bg-slate-950 shadow-lg z-10 max-h-48 overflow-y-auto">
                        {filteredMedications.map((med) => (
                          <button
                            key={med.id}
                            onClick={() => {
                              setSelectedMedication(med);
                              setMedicationSearch("");
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                          >
                            <div className="font-medium">{med.name}</div>
                            <div className="text-xs text-muted-foreground">{med.code} • {med.strength}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedMedication && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-2 rounded border border-blue-200 dark:border-blue-900">
                      <p className="text-sm font-medium">{selectedMedication.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedMedication.code}</p>
                    </div>
                  )}

                  {selectedMedication && (
                    <div>
                      <div>
                        <Label className="text-xs">Quantity</Label>
                        <Input
                          type="number"
                          value={requestQuantity}
                          onChange={(e) => setRequestQuantity(e.target.value)}
                          placeholder="100"
                          className="mt-1"
                        />
                      </div>
                    </div>
                  )}

                  {selectedMedication && (
                    <Button onClick={handleAddItem} className="w-full bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Request
                    </Button>
                  )}

                  {requestItems.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium">Items Added ({requestItems.length})</p>
                      {requestItems.map((item, idx) => {
                        const med = medications.find((m) => m.id === item.medication);
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-900">
                            <div>
                              <p className="text-sm font-medium">{med?.name}</p>
                              <p className="text-xs text-muted-foreground">{item.quantity} {med?.unit || "units"}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRequestItems(requestItems.filter((_, i) => i !== idx))}
                              className="h-6 w-6 p-0"
                            >
                              ×
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="e.g., Urgent request, special instructions..."
                  className="mt-1 resize-none"
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewRequestModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateRequest}
                disabled={creatingRequest || requestItems.length === 0}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {creatingRequest ? "Creating..." : "Create Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedRequest?.request_id}</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <div className="font-medium">{getStatusBadge(selectedRequest.status)}</div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">{new Date(selectedRequest.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {selectedRequest.confirmed_at && (
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                    <p className="text-sm font-medium mb-1 text-green-800 dark:text-green-200">✓ Receipt Confirmed</p>
                    <p className="text-xs text-green-700 dark:text-green-300">Confirmed by: {selectedRequest.confirmed_by_name}</p>
                    <p className="text-xs text-green-700 dark:text-green-300">On: {new Date(selectedRequest.confirmed_at).toLocaleString()}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium mb-2">Items ({selectedRequest.items?.length || 0})</p>
                  <div className="space-y-2">
                    {selectedRequest.items?.map((item, idx) => (
                      <div key={idx} className="border rounded-lg p-3 text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{item.medication_name || "Unknown"}</p>
                            <p className="text-xs text-muted-foreground">Requested: {item.quantity} {getItemUnit(item)}</p>
                          </div>
                          {item.fulfilled_quantity && item.fulfilled_quantity > 0 && (
                            <span className="text-xs font-medium text-green-600">✓ {item.fulfilled_quantity}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
                    Close
                  </Button>
                  {(selectedRequest.status === "fulfilled" || selectedRequest.status === "partially_fulfilled") && !selectedRequest.confirmed_at && (
                    <Button
                      onClick={() => setShowConfirmModal(true)}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Confirm Receipt
                    </Button>
                  )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Confirm Receipt Modal */}
        <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
          <DialogContent className="w-[95vw] sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Confirm Stock Receipt</DialogTitle>
              <DialogDescription>Verify that you have received the issued stock</DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium mb-2">Request: {selectedRequest.request_id}</p>
                  <div className="space-y-1 text-xs">
                    {selectedRequest.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between">
                        <span>{item.medication_name}</span>
                        <span className="font-medium">{item.fulfilled_quantity || item.quantity} {getItemUnit(item)}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Confirmation Notes (optional)</Label>
                  <Textarea
                    placeholder="e.g., All items received in good condition..."
                    value={confirmNotes}
                    onChange={(e) => setConfirmNotes(e.target.value)}
                    rows={3}
                    className="mt-1"
                  />
                </div>

                <DialogFooter className="gap-2">
                  <Button variant="outline" onClick={() => setShowConfirmModal(false)} disabled={isConfirming}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmReceipt}
                    disabled={isConfirming}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isConfirming ? "Confirming..." : "Confirm Receipt"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
