"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ConsultationOrderListCardProps = {
  borderClassName: string;
  cardClassName?: string;
  icon: ReactNode;
  iconWrapClassName: string;
  title: string;
  titleExtra?: ReactNode;
  badges: ReactNode;
  subtitle?: string;
  secondarySubtitle?: string;
  queueHint?: string;
  actions?: ReactNode;
  trailing?: ReactNode;
};

/** Compact order row — same layout as Lab / Prescriptions list cards. */
export function ConsultationOrderListCard({
  borderClassName,
  cardClassName,
  icon,
  iconWrapClassName,
  title,
  titleExtra,
  badges,
  subtitle,
  secondarySubtitle,
  queueHint,
  actions,
  trailing,
}: ConsultationOrderListCardProps) {
  return (
    <Card className={cn("border-l-4", borderClassName, cardClassName)}>
      <CardContent className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-2">
            <div className={cn("rounded-full p-1.5", iconWrapClassName)}>{icon}</div>
            <div className="min-w-0 flex-1">
              <div className="mb-0.5 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{title}</span>
                {titleExtra}
                {badges}
              </div>
              {subtitle ? (
                <p className="mb-0.5 line-clamp-2 text-xs text-muted-foreground">{subtitle}</p>
              ) : null}
              {secondarySubtitle ? (
                <p className="line-clamp-1 text-xs text-muted-foreground">{secondarySubtitle}</p>
              ) : null}
              {queueHint ? (
                <p className="mt-1 text-xs text-muted-foreground">{queueHint}</p>
              ) : null}
            </div>
          </div>
          {(actions || trailing) && (
            <div className="flex shrink-0 items-start gap-1">
              {actions}
              {trailing}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
