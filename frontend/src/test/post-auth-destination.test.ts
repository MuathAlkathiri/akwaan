import { beforeEach, describe, expect, it } from "vitest";
import {
  consumePostAuthDestination,
  isSafeInternalPath,
  rememberPostAuthDestination,
} from "@/features/auth/navigation/post-auth-destination";

describe("post-auth destination", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("remembers and consumes a safe internal destination once", () => {
    rememberPostAuthDestination("/matches/new");
    expect(consumePostAuthDestination()).toBe("/matches/new");
    expect(consumePostAuthDestination()).toBe("/");
  });

  it.each([
    "https://evil.example",
    "//evil.example/path",
    "/\\evil.example",
  ])("refuses unsafe redirect destination %s", (path) => {
    expect(isSafeInternalPath(path)).toBe(false);
    rememberPostAuthDestination(path);
    expect(consumePostAuthDestination()).toBe("/");
  });
});
