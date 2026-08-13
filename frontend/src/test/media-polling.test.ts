import { describe, expect, it } from "vitest";
import {
  mediaCandidatesRefetchInterval,
  mediaDetailRefetchInterval,
} from "@/features/questions/hooks/use-questions";

describe("question media polling", () => {
  it.each(["pending", "searching", "processing"])(
    "keeps refreshing question state while status is %s",
    (audioStatus) => {
      expect(mediaDetailRefetchInterval({ data: { audioStatus } })).toBe(1_000);
    },
  );

  it.each(["ready", "failed", "rejected", "not_required"])(
    "stops refreshing question state at terminal status %s",
    (audioStatus) => {
      expect(mediaDetailRefetchInterval({ data: { audioStatus } })).toBe(false);
    },
  );

  it("reads audioStatus from the actual one-level API envelope", () => {
    expect(
      mediaDetailRefetchInterval({ data: { audioStatus: "processing" } }),
    ).toBe(1_000);
  });

  it("polls candidates only while discovery or processing is active", () => {
    expect(mediaCandidatesRefetchInterval(true, "searching")).toBe(2_000);
    expect(mediaCandidatesRefetchInterval(true, "processing")).toBe(2_000);
    expect(mediaCandidatesRefetchInterval(true, "pending")).toBe(false);
    expect(mediaCandidatesRefetchInterval(true, "ready")).toBe(false);
    expect(mediaCandidatesRefetchInterval(false, "processing")).toBe(false);
  });
});
