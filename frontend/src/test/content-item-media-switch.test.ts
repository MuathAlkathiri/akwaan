import { describe, expect, it } from "vitest";
import {
  buildContentItemPayload,
  emptyContentItemForm,
} from "@/features/world-management/services/content-item-form.service";

describe("ContentItem media/reveal switching", () => {
  it.each(["audio", "none"] as const)(
    "does not submit stale reveal when switching image to %s",
    (mediaType) => {
      const values = emptyContentItemForm("scope-1");
      values.mediaType = mediaType;
      values.mediaUrls = ["/uploads/primary.webp"];
      values.revealMediaUrl = "/uploads/answer.webp";
      const payload = buildContentItemPayload(values) as Record<string, unknown>;
      expect(payload.revealMedia).toBeUndefined();
      expect(JSON.stringify(payload)).not.toContain("answer.webp");
    },
  );

  it("can switch back to image and submit primary plus reveal again", () => {
    const values = emptyContentItemForm("scope-1");
    values.mediaType = "image";
    values.mediaUrls = ["/uploads/primary.webp"];
    values.revealMediaUrl = "/uploads/answer.webp";
    expect(buildContentItemPayload(values)).toMatchObject({
      revealMedia: { type: "image", assets: [{ url: "/uploads/answer.webp" }] },
    });
  });
});
