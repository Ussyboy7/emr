"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Database, Search, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
  consultationService,
  type ICD10Code,
  type ICD10Stats,
} from "@/lib/services";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";
import { StandardPagination } from "@/components/shared/StandardPagination";

export default function ICD10CodingPage() {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);

  const [stats, setStats] = useState<ICD10Stats | null>(null);
  const [categories, setCategories] = useState<{ category: string; count: number }[]>([]);
  const [codes, setCodes] = useState<ICD10Code[]>([]);
  const [totalCodes, setTotalCodes] = useState(0);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, selectedCategory, itemsPerPage]);

  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const statsRes = await consultationService.getICD10Stats();
      setStats(statsRes);
      setCategories(statsRes.categories ?? []);
    } catch (err) {
      if (handleAuthError(err)) return;
      console.error("Failed to load ICD-10 stats:", err);
      toast.error("Failed to load ICD-10 statistics");
    } finally {
      setStatsLoading(false);
    }
  }, [handleAuthError]);

  const loadCodes = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page,
        page_size: itemsPerPage,
      };
      if (debouncedSearch) params.search = debouncedSearch;
      if (selectedCategory && selectedCategory !== "all")
        params.category = selectedCategory;

      const res = await consultationService.getICD10Codes(params);
      setCodes(res.results ?? []);
      setTotalCodes(res.count ?? 0);
    } catch (err) {
      if (handleAuthError(err)) return;
      console.error("Failed to load ICD-10 codes:", err);
      toast.error("Failed to load ICD-10 codes");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, selectedCategory, itemsPerPage, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadStats();
  }, [ready, loadStats]);

  useEffect(() => {
    if (!ready) return;
    void loadCodes();
  }, [ready, loadCodes]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Database className="h-8 w-8 text-amber-500" />
              ICD-10 Coding
            </h1>
            <p className="text-muted-foreground mt-1">
              Browse and search WHO ICD-10 diagnosis codes.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total codes</p>
              <p className="text-2xl font-bold text-blue-600">
                {statsLoading ? "…" : (stats?.total_codes.toLocaleString() ?? "—")}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Active codes</p>
              <p className="text-2xl font-bold text-emerald-600">
                {statsLoading ? "…" : (stats?.active_codes.toLocaleString() ?? "—")}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Diagnoses recorded</p>
              <p className="text-2xl font-bold text-amber-600">
                {statsLoading ? "…" : (stats?.total_diagnoses.toLocaleString() ?? "—")}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by code or description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select
                value={selectedCategory}
                onValueChange={setSelectedCategory}
              >
                <SelectTrigger className="w-full sm:w-[280px]">
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.category} value={cat.category}>
                      {cat.category} ({cat.count})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : codes.length === 0 ? (
              <div className="text-center py-16 px-4">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium text-muted-foreground">No codes found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try a different search term or category.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium w-[100px]">Code</th>
                      <th className="text-left p-3 font-medium">Description</th>
                      <th className="text-left p-3 font-medium hidden md:table-cell">
                        Category
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {codes.map((code) => (
                      <tr
                        key={code.id}
                        className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-3">
                          <span className="font-mono font-medium">{code.code}</span>
                        </td>
                        <td className="p-3">{code.description}</td>
                        <td className="p-3 hidden md:table-cell text-muted-foreground">
                          {code.category}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {!loading && totalCodes > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={page}
              totalItems={totalCodes}
              itemsPerPage={itemsPerPage}
              onPageChange={setPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="codes"
            />
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
