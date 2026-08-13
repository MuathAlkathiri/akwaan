import type {
  MusicTracksUploadBody,
  UpdateMusicTrackDto,
} from "@/api/generated/models";
import type {
  MusicTrack,
  MusicTrackUpdate,
  MusicUploadValues,
} from "../types/music.types";

export function toMusicUploadRequest(
  file: File,
  values: MusicUploadValues,
): MusicTracksUploadBody {
  const snippetStartSecond = optionalNumber(values.snippetStartSecond);
  return {
    file,
    title: text(values.title, true),
    artist: text(values.artist, true),
    ...(text(values.album) ? { album: text(values.album) } : {}),
    ...(values.language ? { language: values.language } : {}),
    ...(text(values.genre) ? { genre: text(values.genre) } : {}),
    ...(values.difficulty ? { difficulty: values.difficulty } : {}),
    snippetDurationSeconds: Number(values.snippetDurationSeconds || 15),
    ...(snippetStartSecond !== undefined ? { snippetStartSecond } : {}),
  };
}

export const toMusicUpdateRequest = (
  update: MusicTrackUpdate,
): UpdateMusicTrackDto => ({ ...update });

export function musicTrackToFormValues(track: MusicTrack): MusicUploadValues {
  return {
    title: track.title,
    artist: track.artist ?? "",
    album: track.album ?? "",
    language: track.language,
    genre: track.genre ?? "",
    difficulty: track.difficulty,
    snippetDurationSeconds: track.snippetDurationSeconds,
    snippetStartSecond: track.snippetStartSecond,
  };
}

function text(value: unknown, includeEmpty = false): string | undefined {
  const normalized = value == null ? "" : String(value).trim();
  return normalized || includeEmpty ? normalized : undefined;
}

function optionalNumber(
  value: string | number | undefined,
): number | undefined {
  if (value === undefined || value === "") return undefined;
  return Number(value);
}
