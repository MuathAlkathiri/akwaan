import { MusicTrackResponseDto } from '../dto/music-track-response.dto';
import { MusicTrack } from '../schemas/music-track.schema';

export function mapMusicTrackResponse(
  track: MusicTrack,
): MusicTrackResponseDto {
  const raw = typeof track.toObject === 'function' ? track.toObject() : track;
  const id = raw._id.toString();
  return {
    id,
    _id: id,
    title: raw.title,
    artist: raw.artist,
    album: raw.album,
    originalAudioUrl: safePublicUrl(raw.originalAudioUrl),
    snippetAudioUrl: safePublicUrl(raw.snippetAudioUrl) ?? '',
    artworkUrl: safePublicUrl(raw.artworkUrl),
    durationSeconds: finiteNumber(raw.durationSeconds),
    snippetStartSecond: finiteNumber(raw.snippetStartSecond),
    snippetDurationSeconds: finiteNumber(raw.snippetDurationSeconds) ?? 15,
    language: raw.language,
    genre: raw.genre,
    difficulty: raw.difficulty,
    source: raw.source,
    isActive: raw.isActive !== false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

function safePublicUrl(value?: string): string | undefined {
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value) || value.startsWith('/uploads/'))
    return value;
  return undefined;
}

function finiteNumber(value?: number): number | undefined {
  return Number.isFinite(value) ? Number(value) : undefined;
}
