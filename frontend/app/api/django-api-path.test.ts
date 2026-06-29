import { describe, expect, it } from "vitest";
import { djangoApiPath } from "./[...path]/route";

describe("djangoApiPath", () => {
  it("adds trailing slash for DRF collection endpoints", () => {
    expect(djangoApiPath("/api/accounts/auth/me")).toBe("/api/accounts/auth/me/");
    expect(djangoApiPath("/api/common/server-time/")).toBe("/api/common/server-time/");
  });

  it("does not add trailing slash for protected media files", () => {
    const media =
      "/api/common/media/patients/photos/WhatsApp_Image_2026-06-29_at_2.54.09_PM.jpeg";
    expect(djangoApiPath(media)).toBe(media);
    expect(djangoApiPath(`${media}/`)).toBe(media);
  });
});
