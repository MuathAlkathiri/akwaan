import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import {
  LocalAudioStorageService,
  StoredLocalAudio,
  UploadedAudioFile,
} from '../../common/uploads/local-audio-storage.service';
import { AudioProcessorService } from '../../infrastructure/media/audio-processor.service';
import { MediaInspectorService } from '../../infrastructure/media/media-inspector.service';
import { CategoriesService } from '../categories/categories.service';
import { QuestionRepository } from '../questions/persistence/question.repository';
import {
  DifficultyLevel,
  Question,
  QuestionPoints,
  QuestionSource,
  QuestionStatus,
  QuestionType,
} from '../questions/schemas/question.schema';
import { UploadMusicTrackDto, UpdateMusicTrackDto } from './dto/music.dto';
import { mapMusicTrackResponse } from './mappers/music-track-response.mapper';
import { MusicMetadataAgentService } from './music-metadata-agent.service';
import { MusicTrackRepository } from './persistence/music-track.repository';
import { MusicTrackPolicy } from './policies/music-track.policy';
import { MusicTrack, MusicTrackSource } from './schemas/music-track.schema';
import { normalizeMusicAnswer } from './utils/answer-normalization.util';

export interface GuessSongQuestionResponse {
  id: string;
  type: 'guess_song';
  question: 'ما اسم هذه الأغنية؟';
  audioUrl: string;
  answer: string;
  difficulty: DifficultyLevel;
  metadata: ReturnType<MusicService['buildQuestionMetadata']>;
}

@Injectable()
export class MusicService {
  private readonly logger = new Logger(MusicService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly metadataAgent: MusicMetadataAgentService,
    private readonly tracks: MusicTrackRepository,
    private readonly questions: QuestionRepository,
    private readonly categories: CategoriesService,
    private readonly storage: LocalAudioStorageService,
    private readonly inspector: MediaInspectorService,
    private readonly audioProcessor: AudioProcessorService,
    private readonly policy: MusicTrackPolicy,
  ) {}

  async createFromUpload(
    file: UploadedAudioFile | undefined,
    dto: UploadMusicTrackDto,
  ) {
    this.policy.validateFile(file);
    let original: StoredLocalAudio | undefined;
    let snippet: StoredLocalAudio | undefined;
    let persisted: MusicTrack | undefined;
    try {
      original = await this.storage.saveOriginal(file);
      const durationSeconds = await this.inspector.audioDurationSeconds(
        original.absolutePath,
      );
      const plan = this.policy.snippetPlan(
        dto.snippetDurationSeconds,
        dto.snippetStartSecond,
        durationSeconds,
      );
      snippet = await this.storage.allocateSnippet(original.filename);
      await this.audioProcessor.createMp3Snippet({
        inputPath: original.absolutePath,
        outputPath: snippet.absolutePath,
        startSecond: plan.snippetStartSecond,
        durationSeconds: plan.snippetDurationSeconds,
      });
      const metadata = await this.metadataAgent.inferMetadata({
        filename: file.originalname,
        ...dto,
      });
      const deleteOriginal = this.booleanConfig(
        'MUSIC_DELETE_ORIGINAL_AFTER_SNIPPET',
        false,
      );
      persisted = await this.tracks.create({
        ...metadata,
        originalAudioUrl: deleteOriginal ? undefined : original.url,
        snippetAudioUrl: snippet.url,
        durationSeconds,
        ...plan,
        source: MusicTrackSource.ADMIN_UPLOAD,
        isActive: true,
      });
      const question = await this.createQuestionForTrack(persisted);
      if (deleteOriginal) await this.cleanup(original, 'original audio');
      return {
        musicTrack: mapMusicTrackResponse(persisted),
        question: this.toGuessSongQuestion(question, persisted),
      };
    } catch (error) {
      if (persisted)
        await this.tracks
          .deleteById(persisted._id.toString())
          .catch((cleanupError) =>
            this.logCleanup(cleanupError, 'music record'),
          );
      await this.cleanup(snippet, 'snippet');
      await this.cleanup(original, 'original audio');
      throw error;
    }
  }

  async findAll() {
    return (await this.tracks.findAll()).map(mapMusicTrackResponse);
  }

  async findById(id: string) {
    return mapMusicTrackResponse(await this.requireTrack(id));
  }

  async update(id: string, dto: UpdateMusicTrackDto) {
    this.assertObjectId(id, 'id');
    const track = await this.tracks.updateById(id, dto);
    if (!track) throw this.notFound(id);
    await this.questions.updateMusicTrackQuestions(track._id, {
      answer: track.title,
      difficulty: track.difficulty ?? DifficultyLevel.EASY,
      metadata: this.buildQuestionMetadata(track),
    });
    return mapMusicTrackResponse(track);
  }

  async softDelete(id: string) {
    this.assertObjectId(id, 'id');
    const track = await this.tracks.updateById(id, { isActive: false });
    if (!track) throw this.notFound(id);
    await this.questions.updateMusicTrackQuestions(track._id, {
      status: QuestionStatus.REJECTED,
    });
    return mapMusicTrackResponse(track);
  }

  async validateAnswer(questionId: string, answer: string) {
    this.assertObjectId(questionId, 'questionId');
    const question = await this.questions.findMusicQuestionById(questionId);
    if (!question)
      throw new NotFoundException(`Question with ID "${questionId}" not found`);
    if (
      question.type !== QuestionType.AUDIO ||
      question.source !== QuestionSource.MUSIC ||
      !question.mediaUrl
    ) {
      throw new BadRequestException('Question is not a music audio question');
    }
    const normalizedAnswer = normalizeMusicAnswer(answer);
    const normalizedCorrectAnswer = normalizeMusicAnswer(question.answer);
    if (!normalizedAnswer) throw new BadRequestException('Answer is required');
    return {
      isCorrect: normalizedAnswer === normalizedCorrectAnswer,
      normalizedAnswer,
      normalizedCorrectAnswer,
    };
  }

  private async requireTrack(id: string) {
    this.assertObjectId(id, 'id');
    const track = await this.tracks.findById(id);
    if (!track) throw this.notFound(id);
    return track;
  }

  private async createQuestionForTrack(track: MusicTrack) {
    if (!track.snippetAudioUrl)
      throw new BadRequestException(
        'Cannot create music question without audio',
      );
    const configuredSlug =
      this.config.get<string>('MUSIC_QUESTION_CATEGORY_SLUG') ?? 'songs';
    const category =
      await this.categories.findActiveMusicCategory(configuredSlug);
    if (!category)
      throw new InternalServerErrorException(
        `Music question category "${configuredSlug}" was not found. Set MUSIC_QUESTION_CATEGORY_SLUG or create a music/songs category.`,
      );
    const difficulty = track.difficulty ?? DifficultyLevel.EASY;
    return this.questions.create({
      category: category._id,
      question: 'ما اسم هذه الأغنية؟',
      answer: track.title,
      explanation: track.artist
        ? `الأغنية هي "${track.title}" للفنان ${track.artist}.`
        : `الأغنية هي "${track.title}".`,
      difficulty,
      points: this.pointsForDifficulty(difficulty),
      type: QuestionType.AUDIO,
      mediaUrl: track.snippetAudioUrl,
      mediaKey: `admin-upload:${track._id.toString()}`,
      musicTrack: track._id,
      hasPreviewAudio: true,
      status: QuestionStatus.DRAFT,
      source: QuestionSource.MUSIC,
      isFreeGameQuestion: false,
      metadata: this.buildQuestionMetadata(track),
    });
  }

  buildQuestionMetadata(track: MusicTrack) {
    return {
      artist: track.artist,
      album: track.album,
      genre: track.genre,
      language: track.language,
      source: MusicTrackSource.ADMIN_UPLOAD as const,
      musicTrackId: track._id.toString(),
    };
  }

  private toGuessSongQuestion(
    question: Question,
    track: MusicTrack,
  ): GuessSongQuestionResponse {
    return {
      id: question._id.toString(),
      type: 'guess_song',
      question: 'ما اسم هذه الأغنية؟',
      audioUrl: track.snippetAudioUrl,
      answer: track.title,
      difficulty: track.difficulty ?? DifficultyLevel.EASY,
      metadata: this.buildQuestionMetadata(track),
    };
  }

  private pointsForDifficulty(difficulty: DifficultyLevel) {
    return difficulty === DifficultyLevel.HARD
      ? QuestionPoints.HIGH
      : difficulty === DifficultyLevel.MEDIUM
        ? QuestionPoints.MEDIUM
        : QuestionPoints.LOW;
  }

  private booleanConfig(key: string, fallback: boolean) {
    const value = this.config.get<string>(key);
    return value
      ? ['true', '1', 'yes', 'on'].includes(value.toLowerCase())
      : fallback;
  }

  private async cleanup(file: StoredLocalAudio | undefined, label: string) {
    if (!file) return;
    await this.storage
      .delete(file)
      .catch((error) => this.logCleanup(error, label));
  }

  private logCleanup(error: unknown, label: string) {
    this.logger.warn(
      `Failed to clean up ${label}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  private assertObjectId(id: string, field: string) {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException(`${field} must be a valid MongoDB ID`);
  }

  private notFound(id: string) {
    return new NotFoundException(`Music track with ID "${id}" not found`);
  }
}
