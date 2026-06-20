"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { SimpleMarkdown } from "@/components/shared/SimpleMarkdown";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { helpService, type UserDocDetail } from "@/lib/services/help-service";
import { useHelpPageAuth } from "@/hooks/use-help-page-auth";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

export default function UserGuideDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const { ready, handleAuthError } = useHelpPageAuth();
  const [doc, setDoc] = useState<UserDocDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready || !slug) return;
    (async () => {
      try {
        setLoading(true);
        const res = await helpService.getUserDoc(slug);
        setDoc(res);
      } catch (err) {
        if (handleAuthError(err)) return;
        toast.error("Could not load this guide.");
      } finally {
        setLoading(false);
      }
    })();
  }, [ready, slug, handleAuthError]);

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
      <div className="container mx-auto max-w-4xl space-y-4 p-4 sm:space-y-6 sm:p-6">
        <Button variant="outline" asChild>
          <Link href="/help/docs">
            <ArrowLeft className="mr-2 h-4 w-4" />
            All guides
          </Link>
        </Button>

        <Card>
          <CardContent className="p-6 sm:p-8">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : doc ? (
              <SimpleMarkdown content={doc.content} />
            ) : (
              <p className="py-12 text-center text-muted-foreground">Guide not found.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
