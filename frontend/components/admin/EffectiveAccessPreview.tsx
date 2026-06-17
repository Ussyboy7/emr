"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { adminService } from "@/lib/services";
import { impliedCapabilitiesFromPages } from "@/lib/capabilities";
import { PAGE_MODULE_ORDER } from "@/lib/page-permissions";

type EffectiveAccess = {
  pages: string[];
  capabilities: string[];
  explicit_capabilities: string[];
  implied_capabilities: string[];
  capability_details: { id: string; name: string; module: string; description: string }[];
  api_families: { page: string; pattern: string; methods: string; note: string }[];
};

type Props = {
  roleId?: number;
  /** Client-side preview when API not used (e.g. while editing). */
  pages?: string[];
  capabilities?: string[];
};

export function EffectiveAccessPreview({ roleId, pages: pagesProp, capabilities: capsProp }: Props) {
  const [data, setData] = useState<EffectiveAccess | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (roleId) {
      setLoading(true);
      adminService
        .getRoleEffectiveAccess(roleId)
        .then(setData)
        .catch(() => setData(null))
        .finally(() => setLoading(false));
      return;
    }
    if (pagesProp) {
      const explicit = capsProp ?? [];
      const implied = Array.from(impliedCapabilitiesFromPages(pagesProp));
      const all = Array.from(new Set([...explicit, ...implied]));
      setData({
        pages: pagesProp,
        capabilities: all,
        explicit_capabilities: explicit,
        implied_capabilities: implied.filter((c) => !explicit.includes(c)),
        capability_details: [],
        api_families: [],
      });
    }
  }, [roleId, pagesProp, capsProp]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading effective access…
      </div>
    );
  }

  if (!data) return null;

  const modules = new Set(data.capability_details.map((c) => c.module));

  return (
    <div className="space-y-4 rounded-md border p-4 bg-muted/30">
      <div className="flex flex-wrap gap-2 text-sm">
        <Badge variant="secondary">{data.pages.length} pages</Badge>
        <Badge variant="secondary">{data.capabilities.length} capabilities</Badge>
        {data.api_families.length > 0 && (
          <Badge variant="outline">{data.api_families.length} API families</Badge>
        )}
      </div>

      {data.capability_details.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Capabilities</p>
          <div className="space-y-3 max-h-[200px] overflow-y-auto">
            {PAGE_MODULE_ORDER.filter((m) => modules.has(m)).map((module) => (
              <div key={module}>
                <p className="text-xs text-muted-foreground mb-1">{module}</p>
                <div className="flex flex-wrap gap-1">
                  {data.capability_details
                    .filter((c) => c.module === module)
                    .map((c) => (
                      <Badge key={c.id} variant="outline" className="text-[10px] font-normal">
                        {c.name}
                        {data.implied_capabilities.includes(c.id) && !data.explicit_capabilities.includes(c.id)
                          ? " (from page)"
                          : ""}
                      </Badge>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.api_families.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">API families (documented)</p>
          <ul className="text-xs text-muted-foreground space-y-1 max-h-[160px] overflow-y-auto">
            {data.api_families.slice(0, 12).map((row, i) => (
              <li key={`${row.pattern}-${i}`}>
                <span className="font-mono text-foreground">{row.pattern}</span>{" "}
                <span className="text-muted-foreground">[{row.methods}]</span> — {row.note}
              </li>
            ))}
            {data.api_families.length > 12 && (
              <li>…and {data.api_families.length - 12} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
