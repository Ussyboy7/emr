"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { helpService, type UserDocSummary } from "@/lib/services/help-service";
import { useHelpPageAuth } from "@/hooks/use-help-page-auth";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, ChevronRight, Loader2 } from "lucide-react";

export default function UserGuidesPage() {
  const { ready, handleAuthError } = useHelpPageAuth();
  const [docs, setDocs] = useState<UserDocSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      try {
        setLoading(true);
        const res = await helpService.listUserDocs();
        setDocs(res.results);
      } catch (err) {
        if (handleAuthError(err)) return;
        toast.error("Could not load user guides.");
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, handleAuthError]);

  if (!ready) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto space-y-4 p-4 sm:space-y-6 sm:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold text-foreground sm:text-3xl">
              <BookOpen className="h-8 w-8 text-cyan-500" />
              User Guides
            </h1>
            <p className="mt-1 text-muted-foreground">
              Role-based documentation hosted from the EMR user guide library.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/help">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Help & Support
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Available guides</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : docs.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No guides are available on this server.</p>
            ) : (
              docs.map((doc) => (
                <Link
                  key={doc.slug}
                  href={`/help/docs/${doc.slug}`}
                  className="flex items-center justify-between gap-3 py-4 transition-colors hover:text-cyan-600"
                >
                  <div>
                    <p className="font-medium text-foreground">{doc.title}</p>
                    <p className="text-xs text-muted-foreground">{doc.filename}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                </Link>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
