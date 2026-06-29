"use client";

import type { ReactNode } from "react";
import { Package, Eye, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { StockRequest } from "@/lib/services";
import {
  buildStockRequestCardMeta,
  formatRouteLabel,
  getStockRequestPrimaryTitle,
  getStockRequestStatusConfig,
  isPartialFulfillment,
  needsConfirmReceipt,
  summarizeItemNames,
  type StockRequestCardRole,
} from "@/lib/pharmacy/stock-request-card";
import { cn } from "@/lib/utils";

type MedicationRef = { id: number; pack_size?: number | null; name?: string };

export type StockRequestListCardProps = {
  request: StockRequest;
  role: StockRequestCardRole;
  medications?: MedicationRef[];
  onOpen: (request: StockRequest) => void;
  onApprove?: (requestId: number) => void;
  onIssue?: (requestId: number) => void;
  onConfirm?: (request: StockRequest) => void;
  isProcessing?: boolean;
  primaryTitle?: string;
  showItemSummaryForOperator?: boolean;
};

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

export function StockRequestListCard({
  request,
  role,
  medications,
  onOpen,
  onApprove,
  onIssue,
  onConfirm,
  isProcessing = false,
  primaryTitle,
  showItemSummaryForOperator = true,
}: StockRequestListCardProps) {
  const needsConfirm = needsConfirmReceipt(request);
  const statusCfg = getStockRequestStatusConfig(request.status, role);
  const title = primaryTitle ?? getStockRequestPrimaryTitle(request, role);
  const cardMeta = buildStockRequestCardMeta(request, role, medications);
  const itemSummary = summarizeItemNames(request);

  let actions: ReactNode = null;
  if (role === "operator") {
    if (request.status === "pending" && onApprove) {
      actions = (
        <Button
          size="sm"
          onClick={() => onApprove(request.id)}
          disabled={isProcessing}
          className="bg-blue-600 hover:bg-blue-700 h-8"
        >
          Approve
        </Button>
      );
    } else if (request.status === "approved" && onIssue) {
      actions = (
        <Button
          size="sm"
          onClick={() => onIssue(request.id)}
          disabled={isProcessing}
          className="bg-green-600 hover:bg-green-700 h-8"
        >
          {isProcessing ? "Issuing..." : "Issue"}
        </Button>
      );
    }
  } else if (needsConfirm && onConfirm) {
    actions = (
      <Button
        size="sm"
        onClick={() => onConfirm(request)}
        className="bg-green-600 hover:bg-green-700 h-8"
      >
        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
        Confirm
      </Button>
    );
  }

  return (
    <Card
      className={cn(
        "border-l-4 hover:shadow-md transition-shadow cursor-pointer",
        statusCfg.borderClass,
      )}
      onClick={() => onOpen(request)}
    >
      <CardContent className="py-3 px-4">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 rounded-full bg-violet-500/10 p-2 mt-0.5">
            <Package className="h-4 w-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="flex-1 min-w-0 overflow-hidden">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium text-foreground text-sm truncate">{title}</h3>
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
                    {formatRouteLabel(request)}
                  </Badge>
                  <StatusBadge status={request.status} role={role} />
                  {isPartialFulfillment(request) && request.status === "received" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-5 bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300"
                    >
                      Partial
                    </Badge>
                  )}
                </div>
                {role === "operator" && showItemSummaryForOperator && itemSummary !== title && (
                  <p className="text-xs text-foreground/80 mt-0.5 truncate">{itemSummary}</p>
                )}
                {cardMeta ? (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{cardMeta}</p>
                ) : null}
              </div>
              <div
                className="flex items-center gap-1 flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                {actions}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => onOpen(request)}
                  title="View details"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
            {request.notes && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                <span className="font-medium">Notes:</span> {request.notes}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
