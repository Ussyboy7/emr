"use client";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { OrderDiagnosesBlock } from "@/components/medical/OrderDiagnosesBlock";
import { Activity, Eye } from "lucide-react";

export type PoolOrderDetail = {
  id?: string | number;
  status?: string;
  priority?: string;
  diagnosis?: string;
  diagnoses?: import("@/lib/consultation/order-diagnoses").OrderDiagnosisEntry[];
  historyClinicalFindings?: string;
  history_clinical_findings?: string;
  drugHistory?: string;
  drug_history?: string;
  specialInstructions?: string;
  special_instructions?: string;
  chiefComplaint?: string;
  chief_complaint?: string;
  treatmentPlan?: string;
  treatment_plan?: string;
  visualAcuityOd?: string;
  visual_acuity_od?: string;
  visualAcuityOs?: string;
  visual_acuity_os?: string;
  visualAcuityOu?: string;
  visual_acuity_ou?: string;
};

type ConsultationRoomPoolOrderDetailDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module: "physio" | "eyecare";
  order: PoolOrderDetail | null;
};

function field(order: PoolOrderDetail, camel: keyof PoolOrderDetail, snake: keyof PoolOrderDetail): string {
  const v = order[camel] ?? order[snake];
  return typeof v === "string" ? v.trim() : "";
}

export function ConsultationRoomPoolOrderDetailDialog({
  open,
  onOpenChange,
  module,
  order,
}: ConsultationRoomPoolOrderDetailDialogProps) {
  const isPhysio = module === "physio";
  const Icon = isPhysio ? Activity : Eye;
  const label = isPhysio ? "Physiotherapy" : "Eye care";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[95vw] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${isPhysio ? "text-emerald-500" : "text-cyan-500"}`} />
            {label} order details
          </DialogTitle>
          <DialogDescription>
            {order?.id ? `Order ${order.id}` : "Draft order"} — full clinical summary
          </DialogDescription>
        </DialogHeader>

        {order ? (
          <div className="space-y-4 py-1">
            <div className="flex flex-wrap gap-2">
              {order.status ? (
                <Badge variant="outline" className="text-xs">
                  {order.status}
                </Badge>
              ) : null}
              {order.priority ? (
                <Badge variant="secondary" className="text-xs capitalize">
                  {order.priority}
                </Badge>
              ) : null}
            </div>

            {order.diagnosis || order.diagnoses?.length ? (
              <OrderDiagnosesBlock diagnosisText={order.diagnosis} diagnoses={order.diagnoses} />
            ) : (
              <p className="text-sm text-muted-foreground">No diagnosis recorded.</p>
            )}

            {isPhysio ? (
              <>
                {field(order, "historyClinicalFindings", "history_clinical_findings") ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">History / clinical findings</p>
                    <p className="text-sm whitespace-pre-wrap">
                      {field(order, "historyClinicalFindings", "history_clinical_findings")}
                    </p>
                  </div>
                ) : null}
                {field(order, "drugHistory", "drug_history") ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Drug history</p>
                    <p className="text-sm whitespace-pre-wrap">{field(order, "drugHistory", "drug_history")}</p>
                  </div>
                ) : null}
              </>
            ) : (
              <>
                {field(order, "chiefComplaint", "chief_complaint") ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Chief complaint</p>
                    <p className="text-sm whitespace-pre-wrap">{field(order, "chiefComplaint", "chief_complaint")}</p>
                  </div>
                ) : null}
                {field(order, "treatmentPlan", "treatment_plan") ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Treatment plan</p>
                    <p className="text-sm whitespace-pre-wrap">{field(order, "treatmentPlan", "treatment_plan")}</p>
                  </div>
                ) : null}
                {(field(order, "visualAcuityOd", "visual_acuity_od") ||
                  field(order, "visualAcuityOs", "visual_acuity_os") ||
                  field(order, "visualAcuityOu", "visual_acuity_ou")) ? (
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <p className="mb-1 text-xs font-medium text-muted-foreground">Visual acuity</p>
                    <p className="text-sm">
                      OD: {field(order, "visualAcuityOd", "visual_acuity_od") || "—"} | OS:{" "}
                      {field(order, "visualAcuityOs", "visual_acuity_os") || "—"} | OU:{" "}
                      {field(order, "visualAcuityOu", "visual_acuity_ou") || "—"}
                    </p>
                  </div>
                ) : null}
              </>
            )}

            {field(order, "specialInstructions", "special_instructions") ? (
              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="mb-1 text-xs font-medium text-muted-foreground">Special instructions</p>
                <p className="text-sm whitespace-pre-wrap">
                  {field(order, "specialInstructions", "special_instructions")}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
