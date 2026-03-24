"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { patientService, type Patient as ApiPatient } from "@/lib/services";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { isAuthenticationError } from "@/lib/auth-errors";
import { Search, FileBarChart, Loader2, Users, ChevronRight, Stethoscope, Activity, FlaskConical, Pill, Heart } from "lucide-react";
import { PatientAvatar } from "@/components/PatientAvatar";
import { StandardPagination } from "@/components/StandardPagination";

const categoryMap: Record<string, string> = {
  employee: "Employee",
  retiree: "Retiree",
  dependent: "Dependent",
  nonnpa: "NonNPA",
};

const getCategoryColor = (category: string) => {
  switch (category) {
    case "employee":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
    case "retiree":
      return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
    case "dependent":
      return "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300";
    case "nonnpa":
      return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300";
    default:
      return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
  }
};

export default function PatientRecordsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  const [recentSearches, setRecentSearches] = useState<ApiPatient[]>([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  useAuthRedirect(authError);

  // Load recent searches from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("recentPatientSearches");
    if (stored) {
      try {
        setRecentSearches(JSON.parse(stored).slice(0, 5));
      } catch {
        // ignore
      }
    }
  }, []);

  const search = useCallback(async (page = 1) => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      setTotalCount(0);
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await patientService.getPatients({ 
        search: q, 
        page, 
        page_size: itemsPerPage 
      });
      setResults(res.results || []);
      setTotalCount(res.count || res.results?.length || 0);
      setCurrentPage(page);
      setAuthError(null);
    } catch (err: unknown) {
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        setError(err instanceof Error ? err.message : "Search failed");
      }
      setResults([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [query, itemsPerPage]);

  const openRecords = (p: ApiPatient) => {
    // Save to recent searches
    const updated = [p, ...recentSearches.filter(r => r.id !== p.id)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem("recentPatientSearches", JSON.stringify(updated));
    
    router.push(`/medical-records/patients/${p.id}`);
  };

  const handlePageChange = (page: number) => {
    search(page);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <FileBarChart className="h-8 w-8 text-blue-500" />
              Patient Records
            </h1>
            <p className="text-muted-foreground mt-1">
              Look up a patient to view their full medical records
            </p>
          </div>
        </div>

        {/* Quick Info Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Consultations</p>
                  <p className="text-lg font-semibold text-blue-600">View History</p>
                </div>
                <div className="p-3 rounded-full bg-blue-500/10">
                  <Stethoscope className="h-5 w-5 text-blue-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Lab Results</p>
                  <p className="text-lg font-semibold text-emerald-600">View Tests</p>
                </div>
                <div className="p-3 rounded-full bg-emerald-500/10">
                  <FlaskConical className="h-5 w-5 text-emerald-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Prescriptions</p>
                  <p className="text-lg font-semibold text-violet-600">View Meds</p>
                </div>
                <div className="p-3 rounded-full bg-violet-500/10">
                  <Pill className="h-5 w-5 text-violet-500" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Vitals</p>
                  <p className="text-lg font-semibold text-rose-600">View Trends</p>
                </div>
                <div className="p-3 rounded-full bg-rose-500/10">
                  <Heart className="h-5 w-5 text-rose-500" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Search Section */}
        <Card>
          <CardContent className="p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, patient ID, or phone..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search(1)}
                  className="pl-10"
                />
              </div>
              <Button onClick={() => search(1)} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2 hidden sm:inline">Search</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Error Message */}
        {error && (
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
        {loading && (
          <Card>
            <CardContent className="p-8 text-center">
              <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <p className="text-muted-foreground mt-2">Searching patients...</p>
            </CardContent>
          </Card>
        )}

        {/* No Results */}
        {!loading && searched && results.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <p className="font-medium text-lg">No patients found</p>
              <p className="text-sm text-muted-foreground mt-1">Try a different name, patient ID, or phone number.</p>
            </CardContent>
          </Card>
        )}

        {/* Search Results */}
        {!loading && results.length > 0 && (
          <>
            <div className="flex items-center justify-between px-1">
              <p className="text-sm text-muted-foreground">
                Found <span className="font-medium text-foreground">{totalCount}</span> patient{totalCount !== 1 ? "s" : ""} — click to open records
              </p>
            </div>

            <div className="space-y-2">
              {results.map((p) => (
                <Card 
                  key={p.id} 
                  className="hover:shadow-md hover:border-blue-500/30 transition-all cursor-pointer"
                  onClick={() => openRecords(p)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-4">
                      <PatientAvatar
                        name={p.full_name ?? ""}
                        photoUrl={p.photo ?? undefined}
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-foreground truncate">
                            {p.full_name ?? ""}
                          </h3>
                          <Badge className={`text-[10px] px-1.5 py-0 ${getCategoryColor(p.category)}`}>
                            {categoryMap[p.category] || p.category}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground flex-wrap">
                          <span className="font-medium">{p.patient_id}</span>
                          {p.age != null && (
                            <>
                              <span>•</span>
                              <span>{p.age}y {p.gender === "male" ? "Male" : p.gender === "female" ? "Female" : ""}</span>
                            </>
                          )}
                          {p.phone && (
                            <>
                              <span>•</span>
                              <span>{p.phone}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Pagination */}
            {totalCount > itemsPerPage && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={totalCount}
                  itemsPerPage={itemsPerPage}
                  onPageChange={handlePageChange}
                  onItemsPerPageChange={(newSize) => {
                    setItemsPerPage(newSize);
                    search(1);
                  }}
                  itemName="patients"
                />
              </Card>
            )}
          </>
        )}

        {/* Initial State - Recent Searches or Instructions */}
        {!searched && !loading && (
          <>
            {recentSearches.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Recent Searches</h3>
                  <div className="space-y-2">
                    {recentSearches.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => openRecords(p)}
                        className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 hover:border-primary/30 transition-colors text-left"
                      >
                        <PatientAvatar
                          name={p.full_name ?? ""}
                          photoUrl={p.photo ?? undefined}
                          size="sm"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            {p.full_name ?? ""}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {p.patient_id}
                          </div>
                        </div>
                        <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="py-12 text-center">
                <Activity className="h-16 w-16 mx-auto mb-4 text-blue-500 opacity-40" />
                <h3 className="text-lg font-medium mb-2">Search for a Patient</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Enter a patient's name, patient ID, or phone number to view their complete medical records including consultations, lab results, imaging, prescriptions, and vitals.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
