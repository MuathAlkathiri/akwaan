import { describe, expect, it } from "vitest";
import { discTint } from "@/features/worlds/components/world-disc";

/**
 * The disc behind a World's artwork.
 *
 * Its colour is derived from the World's own id rather than looked up in a
 * table, because the alternative is that every World added after this file was
 * written falls back to one default until somebody remembers to extend a list.
 * Nobody remembers.
 */
describe("the disc tint", () => {
  it("gives a World the same colour every time", () => {
    const id = "65f1a2b3c4d5e6f708192a3b";
    expect(discTint(id)).toBe(discTint(id));
  });

  it("gives different Worlds different colours", () => {
    const tints = new Set(
      ["world-a", "world-b", "world-c", "world-d"].map(discTint),
    );
    expect(tints.size).toBeGreaterThan(1);
  });

  it("always answers with a colour, even for an id it has never seen", () => {
    // The case that matters: a World created a minute ago.
    expect(discTint("")).toMatch(/^#[0-9A-F]{6}$/i);
    expect(discTint("٣عربي-id")).toMatch(/^#[0-9A-F]{6}$/i);
  });
});
