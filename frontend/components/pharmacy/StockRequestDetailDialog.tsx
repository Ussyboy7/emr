"use client";

import type { ReactNode } from "react";
import { CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StockRequest, StockRequestItem } from "@/lib/services";
import { formatDisplayDate, formatDisplayDateTime } from "@/lib/dates";
import {
  formatRouteLabel,
  formatStockRequestItemLine,
  getStockRequestPrimaryTitle,
  getStockRequestStatusConfig,
  isPartialFulfillment,
  summarizeFulfillment,
  type StockRequestCardRole,
} from "@/lib/pharmacy/stock-request-card";

type MedicationRef = { id: number; pack_size?: number | null; name?: string };

function StatusBadge({ status, role }: { status: string; role: StockRequestCardRole }) {
  const cfg = getStockRequestStatusConfig(status, role);
  const badge = <Badge className={cfg.badgeClass}>{cfg.label}</Badge>;
  if (!cfg.tip) return badge;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p>{cfg.tip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium mt-0.5">{value}</p>
    </div>
  );
}

export type StockRequestDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: StockRequest | null;
  role: StockRequestCardRole;
  medications?: MedicationRef[];
  description?: string;
  onConfirm?: () => void;
  itemsSlot?: ReactNode;
  footerSlot?: ReactNode;
};

export function StockRequestDetailDialog({
  open,
  onOpenChange,
  request,
  role,
  medications,
  description,
  onConfirm,
  itemsSlot,
  footerSlot,
}: StockRequestDetailDialogProps) {
  if (!request) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto" />
      </Dialog>
    );
  }

  const title = getStockRequestPrimaryTitle(request, role);
  const fulfillmentSummary = summarizeFulfillment(request, medications);
  const showConfirm =
    onConfirm &&
    (request.status === "fulfilled" || request.status === "partially_fulfilled") &&
    !request.confirmed_at;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {request.request_id}
            {" · "}
            {description ?? formatRouteLabel(request)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={request.status} role={role} />
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                {formatRouteLabel(request)}
              </Badge>
              {isPartialFulfillment(request) && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-5 bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                >
                  Partial
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MetaRow label="Created" value={formatDisplayDate(request.created_at)} />
              {request.confirmed_at ? (
                <MetaRow
                  label="Confirmed"
                  value={
                    <>
                      {formatDisplayDateTime(request.confirmed_at)}
                      {request.confirmed_by_name ? ` · ${request.confirmed_by_name}` : ""}
                    </>
                  }
                />
              ) : null}
              {role === "operator" &&
              request.clinic_name &&
              request.clinic_name.trim() !== title.trim() ? (
                <MetaRow label="Requesting clinic" value={request.clinic_name} />
              ) : null}
              {role === "operator" && request.requested_by_name ? (
                <MetaRow label="Requested by" value={request.requested_by_name} />
              ) : null}
            </div>

            {fulfillmentSummary && !itemsSlot ? (
              <p className="text-xs text-muted-foreground border-t border-border/60 pt-2">
                {fulfillmentSummary}
              </p>
            ) : null}
          </div>

          {request.notes ? (
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p>{request.notes}</p>
            </div>
          ) : null}

          {itemsSlot ?? (
            <div>
              <p className="text-sm font-medium mb-2">Items ({request.items?.length || 0})</p>
              <div className="space-y-2">
                {(request.items || []).map((item: StockRequestItem, idx) => {
                  const { medicationName, quantityLine } = formatStockRequestItemLine(
                    item,
                    medications,
                  );
                  return (
                    <div
                      key={item.id ?? idx}
                      className="border rounded-lg p-3 text-sm flex justify-between items-start gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium">{medicationName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{quantityLine}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {footerSlot ?? (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            {showConfirm ? (
              <Button onClick={onConfirm} className="bg-green-600 hover:bg-green-700">
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm Receipt
              </Button>
            ) : null}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
