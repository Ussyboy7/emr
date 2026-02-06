"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StandardPagination } from "@/components/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { pharmacyService, type StockRequest } from "@/lib/services";
import { Send, CheckCircle2, Clock, Loader2, Eye, Zap } from "lucide-react";

export default function HandleRequestsPage() {
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const response = await pharmacyService.getStockRequests({
        status: statusFilter,
        page: 1,
        page_size: 10000,
      });
      setRequests(response.results || []);
    } catch (err) {
      console.error("Error loading requests:", err);
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRequest = async (requestId: number) => {
    try {
      setIsProcessing(true);
      await pharmacyService.approveStockRequest(requestId);
      toast.success("Request approved");
      await loadRequests();
    } catch (err: any) {
      toast.error(err?.message || "Failed to approve request");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFulfillRequest = async (requestId: number) => {
    try {
      setIsProcessing(true);
      const response = await pharmacyService.fulfillStockRequest(requestId);
      
      // Additional check to ensure status actually changed
      if (response && response.request && response.request.status === 'approved') {
        throw new Error("Failed to issue stock: No stock available in Store inventory.");
      }

      toast.success("Request issued - awaiting dispensary confirmation");
      setShowDetailsModal(false);
      await loadRequests();
    } catch (err: any) {
      // If the backend returns 400 with a specific error message, use it.
      // Otherwise fallback to generic error.
      const errorMessage = err?.message || "Failed to issue request";
      toast.error(errorMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  const paginatedRequests = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return requests.slice(start, start + itemsPerPage);
  }, [requests, currentPage, itemsPerPage]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return <Badge className="bg-orange-100 text-orange-800">Pending Review</Badge>;
      case "approved":
        return <Badge className="bg-blue-100 text-blue-800">Approved</Badge>;
      case "partially_fulfilled":
        return <Badge className="bg-amber-100 text-amber-800">Partially Issued</Badge>;
      case "fulfilled":
        return <Badge className="bg-green-100 text-green-800">Issued (Awaiting Confirm)</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "pending":
        return <Clock className="h-5 w-5 text-orange-500" />;
      case "approved":
        return <Zap className="h-5 w-5 text-blue-500" />;
      case "fulfilled":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      default:
        return <Clock className="h-5 w-5 text-gray-500" />;
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <Send className="h-8 w-8 text-violet-500" />
            Store Requests
          </h1>
          <p className="text-muted-foreground mt-1">Review, approve, and issue stock to dispensary</p>
        </div>

        {/* Status Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2 flex-wrap">
              {["pending", "approved", "partially_fulfilled", "fulfilled"].map((status) => (
                <Button
                  key={status}
                  onClick={() => {
                    setStatusFilter(status);
                    setCurrentPage(1);
                  }}
                  variant={statusFilter === status ? "default" : "outline"}
                  className={statusFilter === status ? "bg-violet-600" : ""}
                >
                  {status === "pending" && "Pending Review"}
                  {status === "approved" && "Approved"}
                  {status === "partially_fulfilled" && "Partially Issued"}
                  {status === "fulfilled" && "Awaiting Confirmation"}
                </Button>
              ))}
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
          ) : paginatedRequests.length > 0 ? (
            paginatedRequests.map((req) => (
              <Card key={req.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getStatusIcon(req.status)}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold">{req.request_id}</span>
                          {getStatusBadge(req.status)}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {req.items?.length || 0} item(s) • Created {new Date(req.created_at).toLocaleDateString()}
                        </div>
                        {req.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{req.notes}</p>}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedRequest(req);
                          setShowDetailsModal(true);
                        }}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        Details
                      </Button>
                      {req.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => handleApproveRequest(req.id)}
                          disabled={isProcessing}
                          className="bg-blue-600 hover:bg-blue-700"
                        >
                          Approve
                        </Button>
                      )}
                      {(req.status === "approved" || req.status === "pending") && (
                        <Button
                          size="sm"
                          onClick={() => handleFulfillRequest(req.id)}
                          disabled={isProcessing}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          Issue
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No {statusFilter} requests</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pagination */}
        {requests.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={requests.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1);
              }}
              itemName="requests"
            />
          </Card>
        )}

        {/* Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedRequest?.request_id}</DialogTitle>
              <DialogDescription>Review and approve/issue stock</DialogDescription>
            </DialogHeader>

            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium">{selectedRequest.status}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">{new Date(selectedRequest.created_at).toLocaleDateString()}</p>
                  </div>
                </div>

                {selectedRequest.notes && (
                  <div>
                    <p className="text-sm font-medium mb-1">Notes</p>
                    <p className="text-sm text-muted-foreground">{selectedRequest.notes}</p>
                  </div>
                )}

                <div>
                  <p className="text-sm font-medium mb-2">Items Requested ({selectedRequest.items?.length || 0})</p>
                  <div className="space-y-2">
                    {selectedRequest.items?.map((item, idx) => (
                      <div key={idx} className="border rounded-lg p-3 bg-muted/30">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-sm">{item.medication_name}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Requested: {item.quantity} {item.unit}
                            </p>
                          </div>
                          {item.fulfilled_quantity && item.fulfilled_quantity > 0 && (
                            <p className="text-xs font-medium text-green-600">
                              ✓ Issued: {item.fulfilled_quantity}
                            </p>
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
                  {selectedRequest.status === "pending" && (
                    <Button
                      onClick={() => handleApproveRequest(selectedRequest.id)}
                      disabled={isProcessing}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {isProcessing ? "Approving..." : "Approve"}
                    </Button>
                  )}
                  {(selectedRequest.status === "approved" || selectedRequest.status === "pending") && (
                    <Button
                      onClick={() => handleFulfillRequest(selectedRequest.id)}
                      disabled={isProcessing}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {isProcessing ? "Issuing..." : "Issue to Dispensary"}
                    </Button>
                  )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
