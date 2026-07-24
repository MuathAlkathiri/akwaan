import { describe, expect, it } from "vitest";
import {
  formatSecondsToTime,
  mediaTimingDefaults,
  mediaTimingPayload,
  parseTimeToSeconds,
} from "@/features/questions/models/media-time";

describe("media time helpers", () => {
  it("parses M:SS and MM:SS values to exact seconds", () => {
    expect(parseTimeToSeconds("01:14")).toBe(74);
    expect(parseTimeToSeconds("2:00")).toBe(120);
  });

  it("formats stored seconds for edit-form hydration", () => {
    expect(formatSecondsToTime(198)).toBe("03:18");
    expect(mediaTimingDefaults({ preferredStartSeconds: 198 })).toEqual({
      clipStartTime: "03:18",
      clipDurationTime: "00:08",
    });
  });

  it.each(["1:99", "abc", "1.30", "-1:30"])(
    "rejects invalid time %s",
    (value) => {
      expect(() => parseTimeToSeconds(value)).toThrow();
    },
  );

  it("converts submitted form timing back to API seconds", () => {
    expect(
      mediaTimingPayload({
        clipStartTime: "01:14",
        clipDurationTime: "00:10",
      }),
    ).toEqual({
      preferredStartSeconds: 74,
      preferredDurationSeconds: 10,
    });
  });
});
