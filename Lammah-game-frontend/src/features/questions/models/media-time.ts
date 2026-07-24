export const MEDIA_TIME_PATTERN = /^\d{1,2}:[0-5]\d$/;

export function parseTimeToSeconds(value: string): number {
  const normalized = value.trim();
  if (!MEDIA_TIME_PATTERN.test(normalized))
    throw new Error("Time must use M:SS or MM:SS.");
  const [minutes, seconds] = normalized.split(":").map(Number);
  return minutes * 60 + seconds;
}

export function formatSecondsToTime(value: number): string {
  const seconds = Math.max(0, Math.trunc(value));
  const minutesPart = Math.floor(seconds / 60);
  const secondsPart = seconds % 60;
  return `${String(minutesPart).padStart(2, "0")}:${String(
    secondsPart,
  ).padStart(2, "0")}`;
}

export function optionalTimeToSeconds(value?: string): number | undefined {
  const normalized = value?.trim();
  return normalized ? parseTimeToSeconds(normalized) : undefined;
}

export function mediaTimingDefaults(input?: {
  preferredStartSeconds?: number | null;
  preferredDurationSeconds?: number;
}) {
  return {
    clipStartTime:
      input?.preferredStartSeconds === undefined ||
      input.preferredStartSeconds === null
        ? ""
        : formatSecondsToTime(input.preferredStartSeconds),
    clipDurationTime: formatSecondsToTime(
      input?.preferredDurationSeconds ?? 8,
    ),
  };
}

export function mediaTimingPayload(input: {
  clipStartTime?: string;
  clipDurationTime?: string;
}) {
  return {
    preferredStartSeconds: optionalTimeToSeconds(input.clipStartTime),
    preferredDurationSeconds: optionalTimeToSeconds(input.clipDurationTime),
  };
}
