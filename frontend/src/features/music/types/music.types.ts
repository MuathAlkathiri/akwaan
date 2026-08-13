import { QuestionDifficulty } from "@/types";

export type MusicLanguage = "ar" | "en" | "other";

export interface MusicTrack {
  id: string;
  _id: string;
  title: string;
  artist?: string;
  album?: string;
  originalAudioUrl?: string;
  snippetAudioUrl: string;
  artworkUrl?: string;
  durationSeconds?: number;
  snippetStartSecond?: number;
  snippetDurationSeconds: number;
  language?: MusicLanguage;
  genre?: string;
  difficulty?: QuestionDifficulty;
  source: "admin-upload";
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface MusicUploadValues {
  title?: string;
  artist?: string;
  album?: string;
  language?: MusicLanguage;
  genre?: string;
  difficulty?: QuestionDifficulty;
  snippetDurationSeconds?: string | number;
  snippetStartSecond?: string | number;
}

export type MusicTrackUpdate = Partial<
  Pick<
    MusicTrack,
    | "title"
    | "artist"
    | "album"
    | "artworkUrl"
    | "language"
    | "genre"
    | "difficulty"
    | "isActive"
  >
>;

export interface MusicAnswerValidation {
  isCorrect: boolean;
  normalizedAnswer: string;
  normalizedCorrectAnswer: string;
}
