"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { patientService, type Patient as ApiPatient } from "@/lib/services";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { isAuthenticationError } from "@/lib/auth-errors";
import { Search, FileBarChart, Loader2, Users, ChevronRight, Stethoscope } from "lucide-react";
import { PatientAvatar } from "@/components/PatientAvatar";

const categoryMap: Record<string, string> = {
  employee: "Employee",
  retiree: "Retiree",
  dependent: "Dependent",
  nonnpa: "NonNPA",
};

export default function PatientRecordsPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ApiPatient[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const search = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setSearched(false);
      return;
    }
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const res = await patientService.getPatients({ search: q, page_size: 30 });
      setResults(res.results || []);
      setAuthError(null);
    } catch (err: unknown) {
      if (isAuthenticationError(err)) {
        setAuthError(err);
      } else {
        setError(err instanceof Error ? err.message : "Search failed");
      }
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  const openRecords = (p: ApiPatient) => {
    router.push(`/medical-records/patients/${p.id}`);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 max-w-3xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <FileBarChart className="h-7 w-7 text-blue-500" />
            Patient Records
          </h1>
          <p className="text-muted-foreground mt-1">
            Look up a patient to view their full medical records — consultations, lab results, imaging, prescriptions, vitals, and more. For doctors, nursing, lab, and other departments.
          </p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, patient ID, or phone..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && search()}
                  className="pl-10"
                />
              </div>
              <Button onClick={search} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">Search</span>
              </Button>
            </div>

            {error && (
              <p className="text-sm text-destructive mt-3">{error}</p>
            )}

            {loading && (
              <div className="flex items-center gap-2 mt-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Searching...</span>
              </div>
            )}

            {!loading && searched && results.length === 0 && (
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="font-medium text-muted-foreground">No patients found</p>
                <p className="text-sm text-muted-foreground mt-1">Try a different name, patient ID, or phone number.</p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="mt-6 space-y-2">
                <p className="text-sm text-muted-foreground mb-3">
                  {results.length} result{results.length !== 1 ? "s" : ""} — click to open records
                </p>
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => openRecords(p)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 hover:border-primary/30 transition-colors text-left"
                  >
                    <PatientAvatar
                      name={p.full_name || `${p.first_name || ""} ${p.surname || ""}`.trim() || "Unknown"}
                      photoUrl={p.photo ?? undefined}
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {p.full_name || `${p.first_name || ""} ${p.surname || ""}`.trim() || "Unknown"}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground flex-wrap">
                        <span>{p.patient_id}</span>
                        <span>•</span>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {categoryMap[p.category] || p.category}
                        </Badge>
                        {p.age != null && (
                          <>
                            <span>•</span>
                            <span>{p.age}y</span>
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
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}

            {!searched && !loading && (
              <div className="text-center py-12 text-muted-foreground">
                <Stethoscope className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">Enter a name, patient ID, or phone number to look up records.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
