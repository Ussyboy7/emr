"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { ReportSearchField } from "@/components/reports/ReportSearchField";
import { RefreshCw, ArrowLeft, TrendingUp, Calendar } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import { StandardPagination } from "@/components/shared/StandardPagination";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface Row {
  sn: number;
  code: string;
  description: string;
  diagnosis: string;
  count: number;
  percentage: number;
}

interface Summary {
  total_diagnosis_lines: number;
  distinct_icd10_codes: number;
  ranking_count: number;
  limit: number | null;
  total_sessions?: number;
}

const emptySummary: Summary = {
  total_diagnosis_lines: 0,
  distinct_icd10_codes: 0,
  ranking_count: 0,
  limit: 20,
};

export function ClinicalDiagnosisReportPage({
  title,
  apiPath,
  filenamePrefix,
  icon: Icon,
  iconClass,
  filterDescription,
}: {
  title: string;
  apiPath: string;
  filenamePrefix: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
  filterDescription?: string;
}) {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const {
    buildQuery,
    canFetch,
    year,
    startDate,
    endDate,
    viewMode,
    setViewMode,
    setYear,
    setStartDate,
    setEndDate,
    years,
    periodLabel,
    filenameSuffix,
  } = useMrReportPeriod("all");
  const [data, setData] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [limit, setLimit] = useState("20");
  const [customLimit, setCustomLimit] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);

  const effectiveLimit = customLimit.trim()
    ? customLimit.trim()
    : limit === "custom"
      ? "20"
      : limit;

  const searchExtra = () => {
    const queryExtra: Record<string, string> = {};
    if (effectiveLimit.toLowerCase() !== "all") {
      queryExtra.limit = effectiveLimit;
    }
    queryExtra.page = String(currentPage);
    queryExtra.page_size = String(itemsPerPage);
    const term = search.trim();
    if (term) queryExtra.search = term;
    return queryExtra;
  };

  const fetchReport = async () => {
    const params = buildQuery(searchExtra());
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: Row[]; summary: Summary }>(
        `${apiPath}?${params.toString()}`
      );
      setData(res.data ?? []);
      setSummary({
        total_diagnosis_lines: res.summary?.total_diagnosis_lines ?? 0,
        distinct_icd10_codes: res.summary?.distinct_icd10_codes ?? 0,
        ranking_count: res.summary?.ranking_count ?? res.data?.length ?? 0,
        limit: res.summary?.limit ?? null,
        total_sessions: res.summary?.total_sessions,
      });
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      toast.error(e instanceof Error ? e.message : "Failed to load report");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useMrReportAutoFetch(ready, canFetch, fetchReport, [
    year,
    startDate,
    endDate,
    viewMode,
    search,
    effectiveLimit,
    currentPage,
    itemsPerPage,
  ]);

  const hasData = (summary.total_diagnosis_lines ?? 0) > 0;
  const truncated =
    (summary.distinct_icd10_codes ?? 0) > (summary.ranking_count ?? 0);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="mb-2 print:hidden">
          <Button variant="ghost" size="sm" className="-ml-2 gap-2 px-2" asChild>
            <Link href="/medical-records/reports">
              <ArrowLeft className="h-4 w-4" />
              Back to reports
            </Link>
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Icon className={`h-8 w-8 ${iconClass}`} />
              {title}
            </h1>
            <p className="text-muted-foreground mt-1">
              ICD-10 diagnoses from completed sessions — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath={apiPath}
              buildQuery={() => buildQuery(searchExtra())}
              filenameBase={`${filenamePrefix}_${filenameSuffix}`}
              disabled={!hasData}
            />
          </div>
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>
              {filterDescription ??
                "ICD-10 diagnoses from completed physiotherapy / ophthalmology sessions."}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <ReportDateFilterFields
                viewMode={viewMode}
                onViewModeChange={(v) => {
                  setViewMode(v);
                  setCurrentPage(1);
                }}
                year={year}
                onYearChange={(v) => {
                  setYear(v);
                  setCurrentPage(1);
                }}
                startDate={startDate}
                onStartDateChange={(v) => {
                  setStartDate(v);
                  setCurrentPage(1);
                }}
                endDate={endDate}
                onEndDateChange={(v) => {
                  setEndDate(v);
                  setCurrentPage(1);
                }}
                yearOptions={years}
              />
              <div>
                <Label>Top N</Label>
                <Select
                  value={limit}
                  onValueChange={(v) => {
                    setLimit(v);
                    if (v !== "custom") setCustomLimit("");
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["10", "20", "30", "50", "100"].map((n) => (
                      <SelectItem key={n} value={n}>
                        {n}
                      </SelectItem>
                    ))}
                    <SelectItem value="all">
                      All ({summary.distinct_icd10_codes || "…"})
                    </SelectItem>
                    <SelectItem value="custom">Custom...</SelectItem>
                  </SelectContent>
                </Select>
                {(limit === "custom" || customLimit) && (
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    placeholder="Enter number (e.g. 200)"
                    value={customLimit}
                    onChange={(e) => {
                      setCustomLimit(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="mt-2"
                  />
                )}
              </div>
              <ReportSearchField
                value={search}
                onChange={(v) => {
                  setSearch(v);
                  setCurrentPage(1);
                }}
              />
              <div className="flex items-end">
                <Button onClick={() => void fetchReport()} className="w-full" disabled={isLoading}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {isLoading ? "Loading..." : "Generate Report"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ICD-10 clinical diagnoses</CardTitle>
            <CardDescription>
              Multi-count all ICD-10 diagnoses per completed session. Nursing pool check-ins use last known diagnosis.
              {truncated ? " Showing codes truncated by Top N." : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <RefreshCw className="h-8 w-8 animate-spin mx-auto my-8 text-muted-foreground" />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left p-3">S/N</th>
                        <th className="text-left p-3">Code</th>
                        <th className="text-left p-3">Description</th>
                        <th className="text-right p-3">Count</th>
                        <th className="text-right p-3">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="p-6 text-center text-muted-foreground">
                            No diagnoses for this period.
                          </td>
                        </tr>
                      ) : (
                        data.map((row) => (
                          <tr key={`${row.sn}-${row.code}`} className="border-b">
                            <td className="p-3">{row.sn}</td>
                            <td className="p-3 font-mono">{row.code}</td>
                            <td className="p-3">{row.description}</td>
                            <td className="p-3 text-right font-semibold">{row.count}</td>
                            <td className="p-3 text-right">{row.percentage.toFixed(1)}%</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={summary.ranking_count || data.length}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(n) => {
                    setItemsPerPage(n);
                    setCurrentPage(1);
                  }}
                  itemName="diagnoses"
                  pageSizeOptions={[10, 20, 50, 100]}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
