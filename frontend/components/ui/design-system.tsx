"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, StatusType } from "./status-badge";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: number | string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    isPositive?: boolean;
  };
  isLoading?: boolean;
  className?: string;
}

export function MetricCard({
  title,
  value,
  icon,
  trend,
  isLoading = false,
  className
}: MetricCardProps) {
  if (isLoading) {
    return (
      <Card className={cn("p-6", className)}>
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
          <Skeleton className="h-8 w-8 rounded-full" />
        </div>
      </Card>
    );
  }

  return (
    <Card className={cn("p-6", className)}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-bold">{value}</p>
            {trend && (
              <div className={cn(
                "flex items-center text-xs",
                trend.isPositive ? "text-green-600" : "text-red-600"
              )}>
                {trend.isPositive ? (
                  <TrendingUp className="h-3 w-3 mr-1" />
                ) : (
                  <TrendingDown className="h-3 w-3 mr-1" />
                )}
                {Math.abs(trend.value)}%
              </div>
            )}
          </div>
        </div>
        {icon && (
          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({
  message = "Loading...",
  className
}: LoadingStateProps) {
  return (
    <div className={cn("flex items-center justify-center p-8", className)}>
      <div className="text-center space-y-2">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title = "No data found",
  description = "There are no items to display at this time.",
  icon,
  action,
  className
}: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center p-8 text-center", className)}>
      {icon && (
        <div className="mb-4 text-muted-foreground">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-4 max-w-md">{description}</p>
      {action}
    </div>
  );
}

// Re-export StatusBadge for convenience
export { StatusBadge };