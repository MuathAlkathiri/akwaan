import type {
  MusicAnswerValidationDto,
  MusicTrackResponseDto,
} from "@/api/generated/models";
import { getMediaUrl } from "@/lib/api/media-url";
import type { MusicAnswerValidation, MusicTrack } from "../types/music.types";

const optionalMediaUrl = (url?: string): string | undefined =>
  url ? getMediaUrl(url) : undefined;

export function toMusicTrack(dto: MusicTrackResponseDto): MusicTrack {
  return {
    id: dto.id || dto._id,
    _id: dto._id,
    title: dto.title,
    artist: dto.artist,
    album: dto.album,
    originalAudioUrl: optionalMediaUrl(dto.originalAudioUrl),
    snippetAudioUrl: getMediaUrl(dto.snippetAudioUrl),
    artworkUrl: optionalMediaUrl(dto.artworkUrl),
    durationSeconds: dto.durationSeconds,
    snippetStartSecond: dto.snippetStartSecond,
    snippetDurationSeconds: dto.snippetDurationSeconds,
    language: dto.language,
    genre: dto.genre,
    difficulty: dto.difficulty,
    source: dto.source,
    isActive: dto.isActive,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

export const toMusicTracks = (tracks: MusicTrackResponseDto[]): MusicTrack[] =>
  tracks.map(toMusicTrack);

export const toMusicAnswerValidation = (
  result: MusicAnswerValidationDto,
): MusicAnswerValidation => ({ ...result });
