import { describe, expect, it } from "vitest";
import { menuSections } from "@/components/shared/AppSidebar";
import { ALL_PAGE_PERMISSIONS } from "@/lib/page-permissions";

describe("sidebar page catalog alignment", () => {
  it("every sidebar href exists in ALL_PAGE_PERMISSIONS", () => {
    const catalogIds = new Set(ALL_PAGE_PERMISSIONS.map((p) => p.id));
    const hrefs = menuSections.flatMap((section) => section.items.map((item) => item.href));

    for (const href of hrefs) {
      expect(catalogIds.has(href), `missing catalog entry for sidebar href ${href}`).toBe(true);
    }
  });
});
