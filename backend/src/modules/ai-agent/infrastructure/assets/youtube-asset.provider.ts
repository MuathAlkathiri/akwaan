import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import { access, mkdir, rm, stat } from 'fs/promises';
import { join } from 'path';
import { promisify } from 'util';
import {
  AssetMetadata,
  AssetProvider,
  AssetRequest,
} from '../../contracts/asset-provider.interface';
import { evaluateAssetRelevance } from '../../contracts/asset-relevance';
import { entityFirstSearchPolicy } from '../../application/entity-first-search.policy';

const execFileAsync = promisify(execFile);

export type AssetProviderStep =
  | 'tool-detection'
  | 'search'
  | 'select-video'
  | 'download'
  | 'trim'
  | 'inspect'
  | 'store'
  | 'image-search';

type CommandResult = {
  stdout: string;
  stderr: string;
};

type SearchResult = {
  sourceUrl: string;
  searchQuery: string;
  title: string;
  channel?: string;
  durationSeconds?: number;
  relevanceScore: number;
  queryCount: number;
  candidateCount: number;
  relevanceRejections: Record<string, number>;
};
type YouTubeCandidate = {
  sourceUrl: string;
  title: string;
  description?: string;
  channel?: string;
  durationSeconds?: number;
  tags: string[];
};
type RankedYouTubeCandidate = SearchResult & {
  rawSearchResultCount: number;
  deduplicatedVideoCount: number;
  metadataAcceptedCount: number;
};
export type VoiceWindowAnalysis = {
  startSeconds: number;
  silenceSeconds: number;
  rmsDb?: number;
  peakDb?: number;
  dynamicRangeDb?: number;
  zeroCrossingRate?: number;
  classification:
    'silent' | 'music-likely' | 'speech-likely' | 'audible-uncertain';
  score: number;
  accepted: boolean;
};

export type VoiceSearchPlan = {
  entity: string;
  aliases: string[];
  franchise?: string;
  language?: string;
  contextTerms: string[];
  requiredTerms: string[];
  optionalTerms: string[];
  queries: string[];
  rejectedQueryCount: number;
};

export class AssetProviderStepError extends Error {
  constructor(
    readonly step: AssetProviderStep,
    reason: string,
    readonly diagnostics?: Record<string, unknown>,
  ) {
    super(reason);
  }
}

@Injectable()
export class YouTubeAssetProvider implements AssetProvider {
  private readonly logger = new Logger(YouTubeAssetProvider.name);
  private readonly appBaseUrl: string;
  private readonly uploadsRoot: string;
  private ffmpegBinary = 'ffmpeg';
  private ytDlpBinary = 'yt-dlp';

  constructor(private readonly configService: ConfigService) {
    this.appBaseUrl =
      this.configService.get<string>('APP_BASE_URL') ?? 'http://localhost:3000';
    this.uploadsRoot =
      this.configService.get<string>('UPLOADS_DIR') ??
      join(process.cwd(), 'uploads');
  }

  supports(assetRequest: AssetRequest): boolean {
    return this.support(assetRequest).supported;
  }

  support(assetRequest: AssetRequest) {
    const configured = this.configService.get<string>(
      'ALLOW_YOUTUBE_ASSET_DOWNLOADS',
    );
    const downloadsAllowed = configured
      ? configured.toLowerCase() === 'true'
      : this.configService.get<string>('NODE_ENV') !== 'production';
    if (!downloadsAllowed)
      return {
        supported: false,
        reason: 'YouTube asset downloads are disabled by runtime configuration',
      };
    if (!['audio', 'video'].includes(assetRequest.type))
      return {
        supported: false,
        reason: `Expected audio or video request; received ${assetRequest.type}`,
      };
    if ((assetRequest.provider ?? '').toLowerCase() !== 'youtube')
      return {
        supported: false,
        reason: `Expected youtube provider; received ${assetRequest.provider ?? 'unspecified'}`,
      };
    if (
      assetRequest.type === 'audio' &&
      !['music', 'voice', 'dialogue', 'speech'].includes(
        assetRequest.mediaIntent ?? '',
      )
    )
      return {
        supported: false,
        reason: `Unsupported mediaIntent: ${assetRequest.mediaIntent ?? 'missing'}`,
      };
    if (
      assetRequest.gameMode === 'identifyVoice' &&
      !this.readString(assetRequest.entity)
    )
      return {
        supported: false,
        reason:
          'VOICE_ENTITY_REQUIRED: identifyVoice requires a concrete entity',
      };
    if (
      assetRequest.mediaIntent === 'music' &&
      !this.readString(assetRequest.title ?? assetRequest.entity)
    )
      return { supported: false, reason: 'MUSIC_TITLE_REQUIRED' };
    if (
      assetRequest.mediaIntent === 'music' &&
      assetRequest.gameMode === 'identifySong' &&
      !this.readString(assetRequest.artist)
    )
      return { supported: false, reason: 'MUSIC_ARTIST_REQUIRED' };
    if (
      ![
        assetRequest.entity,
        assetRequest.originalName,
        assetRequest.localizedName,
        assetRequest.query,
        assetRequest.title,
      ].some((value) => this.readString(value).length > 0)
    )
      return {
        supported: false,
        reason: 'YouTube request has no searchable entity or title metadata',
      };
    return { supported: true };
  }

  async process(assetRequest: AssetRequest): Promise<AssetMetadata> {
    if (!this.supports(assetRequest)) {
      throw new Error(
        this.support(assetRequest).reason ??
          'Unsupported YouTube asset request',
      );
    }

    if (assetRequest.type === 'video') {
      return this.processVideoClip(assetRequest);
    }

    const voicePlan =
      assetRequest.mediaIntent === 'music'
        ? undefined
        : this.buildVoiceSearchPlan(assetRequest);
    const explicitCandidate = this.explicitSelectedCandidate(assetRequest);
    const searchCandidates =
      voicePlan?.queries ?? this.buildSearchCandidates(assetRequest);
    const duration = this.normalizeDuration(assetRequest.duration);
    const mediaKey = `question-assets/audio/${randomUUID()}.m4a`;
    const audioDirectory = join(this.uploadsRoot, 'question-assets', 'audio');
    const outputPath = join(this.uploadsRoot, mediaKey);
    const tempBasePath = join(audioDirectory, `${randomUUID()}-source`);

    await mkdir(audioDirectory, { recursive: true });

    try {
      this.ytDlpBinary = await this.resolveBinary('yt-dlp', '/usr/bin/yt-dlp');
      this.ffmpegBinary = await this.resolveBinary('ffmpeg', '/usr/bin/ffmpeg');

      if (assetRequest.mediaIntent !== 'music') {
        return await this.processVoiceCandidates(
          assetRequest,
          voicePlan!,
          searchCandidates,
          duration,
          outputPath,
          mediaKey,
          tempBasePath,
          explicitCandidate,
        );
      }

      const selected =
        explicitCandidate ??
        (await this.search(searchCandidates, assetRequest));
      const { sourceUrl, searchQuery } = selected;
      const sourcePattern = `${tempBasePath}.%(ext)s`;
      await this.runCommand(
        'download',
        this.ytDlpBinary,
        this.ytDlpArgs([
          sourceUrl,
          '-f',
          'bestaudio',
          '--extract-audio',
          '--audio-format',
          'm4a',
          '-o',
          sourcePattern,
        ]),
      );

      const sourcePath = `${tempBasePath}.m4a`;
      const sourceDuration = await this.probeDuration(sourcePath);
      const musicWindow = await this.selectMusicWindow(
        sourcePath,
        sourceDuration,
        duration,
        tempBasePath,
        this.optionalStart(assetRequest.preferredStartSeconds),
      );
      await this.runCommand('trim', this.ffmpegBinary, [
        '-y',
        '-ss',
        String(musicWindow.startSeconds),
        '-i',
        sourcePath,
        '-t',
        String(duration),
        '-c:a',
        'aac',
        outputPath,
      ]);

      this.logger.log('Step 5: Store locally');
      await this.assertFileExists('store', outputPath);
      const storedFile = await stat(outputPath);
      this.logger.log(`Step 5 complete: Store locally (${outputPath})`);

      return {
        localPath: outputPath,
        url: `${this.appBaseUrl.replace(/\/+$/, '')}/uploads/${mediaKey}`,
        duration,
        source: 'youtube',
        sourceUrl,
        searchQuery,
        provider: 'youtube',
        type: 'audio',
        metadata: {
          sourceId: this.youtubeSourceId(sourceUrl),
          title: selected.title,
          channel: selected.channel,
          sourceDurationSeconds: selected.durationSeconds,
          relevanceScore: selected.relevanceScore,
          validation: 'metadata-before-download-and-ffmpeg-decode',
          entityUsed: voicePlan?.entity,
          franchiseUsed: voicePlan?.franchise,
          queryCount: selected.queryCount,
          rejectedQueryCount: voicePlan?.rejectedQueryCount ?? 0,
          candidateCount: selected.candidateCount,
          relevanceRejections: selected.relevanceRejections,
          selectedQuery: selected.searchQuery,
          selectedWindowStartSeconds: musicWindow.startSeconds,
          windowsScanned: musicWindow.windowsScanned,
          musicWindowScore: musicWindow.score,
          mimetype: 'audio/mp4',
          size: storedFile.size,
        },
      };
    } finally {
      await rm(`${tempBasePath}.m4a`, { force: true });
      await rm(`${tempBasePath}.webm`, { force: true });
      await rm(`${tempBasePath}.opus`, { force: true });
    }
  }

  private async processVideoClip(
    assetRequest: AssetRequest,
  ): Promise<AssetMetadata> {
    const searchCandidates = this.buildVideoSearchCandidates(assetRequest);
    const duration = this.normalizeVideoDuration(assetRequest.duration);
    const mediaKey = `question-assets/video/${randomUUID()}.mp4`;
    const videoDirectory = join(this.uploadsRoot, 'question-assets', 'video');
    const outputPath = join(this.uploadsRoot, mediaKey);
    const tempBasePath = join(videoDirectory, `${randomUUID()}-source`);

    await mkdir(videoDirectory, { recursive: true });

    try {
      this.ytDlpBinary = await this.resolveBinary('yt-dlp', '/usr/bin/yt-dlp');
      this.ffmpegBinary = await this.resolveBinary('ffmpeg', '/usr/bin/ffmpeg');
      const selected =
        this.explicitSelectedCandidate(assetRequest) ??
        (await this.search(searchCandidates, assetRequest));
      const sourcePattern = `${tempBasePath}.%(ext)s`;
      await this.runCommand(
        'download',
        this.ytDlpBinary,
        this.ytDlpArgs([
          selected.sourceUrl,
          '-f',
          'bv*[height<=720]+ba/b[height<=720]/best',
          '--merge-output-format',
          'mp4',
          '-o',
          sourcePattern,
        ]),
      );

      const sourcePath = `${tempBasePath}.mp4`;
      const sourceDuration = await this.probeDuration(sourcePath);
      const startSeconds = this.selectVideoWindowStart(
        sourceDuration,
        duration,
        assetRequest.preferredStartSeconds,
      );
      await this.runCommand('trim', this.ffmpegBinary, [
        '-y',
        '-ss',
        String(startSeconds),
        '-i',
        sourcePath,
        '-t',
        String(duration),
        '-map',
        '0:v:0',
        '-map',
        '0:a?',
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-crf',
        '28',
        '-c:a',
        'aac',
        '-movflags',
        '+faststart',
        outputPath,
      ]);

      this.logger.log('Step 5: Store locally');
      await this.assertFileExists('store', outputPath);
      const storedFile = await stat(outputPath);
      this.logger.log(`Step 5 complete: Store locally (${outputPath})`);

      return {
        localPath: outputPath,
        url: `${this.appBaseUrl.replace(/\/+$/, '')}/uploads/${mediaKey}`,
        duration,
        source: 'youtube',
        sourceUrl: selected.sourceUrl,
        searchQuery: selected.searchQuery,
        provider: 'youtube',
        type: 'video',
        metadata: {
          title: selected.title,
          channel: selected.channel,
          sourceDurationSeconds: selected.durationSeconds ?? sourceDuration,
          relevanceScore: selected.relevanceScore,
          validation: 'entity-metadata-video-clip',
          queryCount: selected.queryCount,
          candidateCount: selected.candidateCount,
          relevanceRejections: selected.relevanceRejections,
          selectedQuery: selected.searchQuery,
          selectedWindowStartSeconds: startSeconds,
          mediaFingerprint: assetRequest.mediaFingerprint,
          mimetype: 'video/mp4',
          size: storedFile.size,
        },
      };
    } finally {
      await rm(`${tempBasePath}.mp4`, { force: true });
      await rm(`${tempBasePath}.webm`, { force: true });
      await rm(`${tempBasePath}.mkv`, { force: true });
    }
  }

  buildSearchCandidates(assetRequest: AssetRequest): string[] {
    return assetRequest.mediaIntent === 'music'
      ? this.buildMusicSearchCandidates(assetRequest)
      : this.buildVoiceSearchPlan(assetRequest).queries;
  }

  private buildVideoSearchCandidates(assetRequest: AssetRequest): string[] {
    const plan = entityFirstSearchPolicy.create(assetRequest);
    const entity = plan.canonicalEntity;
    const franchise = plan.franchise;
    const context = [
      ...plan.optionalContextTerms,
      assetRequest.context,
      assetRequest.visualHint,
    ]
      .map((value) => this.readString(value))
      .filter(Boolean)
      .slice(0, 2);
    const rawCandidates = [
      [entity, franchise, ...context, 'scene'],
      [entity, franchise, 'clip'],
      [entity, franchise, 'best scene'],
      [entity, franchise],
      [plan.aliases.find((alias) => alias !== entity), franchise, 'scene'],
    ]
      .map((parts) => this.joinSearchParts(parts))
      .filter(Boolean);
    return entityFirstSearchPolicy.queries(plan, rawCandidates, 'primary')
      .queries;
  }

  private buildMusicSearchCandidates(assetRequest: AssetRequest): string[] {
    const title =
      this.readString(assetRequest.title) ||
      this.readString(assetRequest.entity) ||
      this.readString(assetRequest.originalName) ||
      this.readString(assetRequest.localizedName);
    const artist = this.readString(assetRequest.artist);
    if (!title || !artist) return [];
    const titleAliases = Array.isArray(assetRequest.aliases)
      ? assetRequest.aliases.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const artistAliases = Array.isArray(assetRequest.artistAliases)
      ? assetRequest.artistAliases.filter(
          (value): value is string => typeof value === 'string',
        )
      : [];
    const alternateTitle = titleAliases.find(
      (alias) =>
        this.normalizeSearchText(alias) !== this.normalizeSearchText(title),
    );
    const alternateArtist = artistAliases.find(
      (alias) =>
        this.normalizeSearchText(alias) !== this.normalizeSearchText(artist),
    );
    return Array.from(
      new Set(
        [
          [artist, title, 'official audio'],
          [artist, title, 'official'],
          [artist, title, 'lyrics'],
          [title, artist, 'Topic'],
          [artist, title],
          alternateTitle ? [artist, alternateTitle] : [],
          alternateArtist ? [alternateArtist, title] : [],
        ]
          .map((parts) => this.joinSearchParts(parts))
          .filter(Boolean),
      ),
    );
  }

  buildVoiceSearchPlan(assetRequest: AssetRequest): VoiceSearchPlan {
    const safePlan = entityFirstSearchPolicy.create(assetRequest);
    const entity = safePlan.canonicalEntity;
    const franchise = safePlan.franchise;
    const language = this.readString(assetRequest.language);
    const englishTitle = this.readString(assetRequest.englishTitle);
    const arabicTitle = this.readString(assetRequest.arabicTitle);
    const aliases = safePlan.aliases;
    const title = franchise || englishTitle || arabicTitle || undefined;
    const languageQueries = safePlan.languagePreferences.map((preferred) => [
      entity,
      title,
      preferred === 'Japanese' ? 'Japanese voice' : `${preferred} dub`,
    ]);
    const shortContext = safePlan.optionalContextTerms.slice(0, 2).join(' ');
    const rawCandidates = entity
      ? [
          [entity, title, 'voice'],
          [entity, title, 'voice scene'],
          [entity, title, 'voice lines'],
          [entity, title, 'dialogue'],
          [entity, title, 'scenes'],
          ...languageQueries,
          [aliases.find((alias) => alias !== entity), title, 'voice lines'],
          shortContext ? [entity, title, shortContext, 'scene'] : [],
        ]
          .map((parts) => this.joinSearchParts(parts))
          .filter(Boolean)
      : [];
    const validated = entityFirstSearchPolicy.queries(
      safePlan,
      rawCandidates,
      'primary',
    );
    return {
      entity,
      aliases,
      franchise: title,
      language: language || undefined,
      contextTerms: safePlan.optionalContextTerms,
      requiredTerms: [entity, title].filter(Boolean) as string[],
      optionalTerms: [
        'voice',
        'dialogue',
        'scene',
        language,
        ...safePlan.optionalContextTerms,
      ].filter(Boolean) as string[],
      queries: validated.queries,
      rejectedQueryCount: validated.rejectedCodes.length,
    };
  }

  private containsNormalizedPhrase(value: string, term: string): boolean {
    const normalizedValue = this.normalizeSearchText(value);
    const normalizedTerm = this.normalizeSearchText(term);
    return Boolean(
      normalizedTerm && ` ${normalizedValue} `.includes(` ${normalizedTerm} `),
    );
  }

  private normalizeSearchText(value: string): string {
    return value
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .toLowerCase();
  }

  private readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
  }

  buildVoiceWindowStarts(
    sourceDuration: number,
    clipDuration: number,
  ): number[] {
    const lastStart = Math.max(0, sourceDuration - clipDuration - 2);
    if (sourceDuration <= clipDuration + 2) return [0];
    const ratios =
      sourceDuration > 30 ? [0.1, 0.25, 0.4, 0.55, 0.7] : [0.12, 0.35, 0.58];
    return Array.from(
      new Set(
        ratios.map(
          (ratio) =>
            Math.round(
              Math.min(
                lastStart,
                Math.max(sourceDuration > 30 ? 5 : 1, sourceDuration * ratio),
              ) * 10,
            ) / 10,
        ),
      ),
    );
  }

  buildMusicWindowStarts(
    sourceDuration: number,
    clipDuration: number,
  ): number[] {
    if (sourceDuration <= clipDuration) return [0];
    const lastStart = Math.max(0, sourceDuration - clipDuration - 2);
    return Array.from(
      new Set(
        [0.2, 0.35, 0.5, 0.65].map((ratio) =>
          Math.round(Math.min(lastStart, sourceDuration * ratio)),
        ),
      ),
    );
  }

  scoreMusicWindow(
    startSeconds: number,
    clipDuration: number,
    diagnosticOutput: string,
  ) {
    const analysis = this.scoreVoiceWindow(
      startSeconds,
      clipDuration,
      diagnosticOutput,
    );
    const silenceRatio = analysis.silenceSeconds / clipDuration;
    return {
      ...analysis,
      accepted:
        silenceRatio <= 0.35 &&
        analysis.rmsDb !== undefined &&
        analysis.rmsDb > -38,
      score:
        analysis.score +
        (analysis.classification === 'music-likely' ? 30 : 0) -
        silenceRatio * 60,
    };
  }

  private async selectMusicWindow(
    sourcePath: string,
    sourceDuration: number,
    clipDuration: number,
    tempBasePath: string,
    preferredStartSeconds?: number,
  ) {
    const analyses: ReturnType<YouTubeAssetProvider['scoreMusicWindow']>[] = [];
    const starts =
      preferredStartSeconds === undefined
        ? this.buildMusicWindowStarts(sourceDuration, clipDuration)
        : [
            Math.min(
              preferredStartSeconds,
              Math.max(0, sourceDuration - clipDuration),
            ),
          ];
    for (const [index, start] of starts.entries()) {
      const windowPath = `${tempBasePath}-music-window-${index}.m4a`;
      try {
        await this.runCommand(
          'trim',
          this.ffmpegBinary,
          [
            '-y',
            '-ss',
            String(start),
            '-i',
            sourcePath,
            '-t',
            String(clipDuration),
            '-c:a',
            'aac',
            windowPath,
          ],
          { logAsPipelineStep: false },
        );
        const { stderr } = await this.runCommand(
          'inspect',
          this.ffmpegBinary,
          [
            '-i',
            windowPath,
            '-af',
            'silencedetect=noise=-40dB:d=0.3,astats=metadata=1:reset=0',
            '-f',
            'null',
            '-',
          ],
          { logAsPipelineStep: false },
        );
        analyses.push(this.scoreMusicWindow(start, clipDuration, stderr));
      } finally {
        await rm(windowPath, { force: true });
      }
    }
    const selected = analyses
      .filter((analysis) => analysis.accepted)
      .sort((left, right) => right.score - left.score)[0];
    if (!selected)
      throw new AssetProviderStepError(
        'inspect',
        'No audible music window passed validation',
        {
          failureCode: 'MUSIC_NO_VALID_WINDOW',
          windowsScanned: analyses.length,
        },
      );
    return { ...selected, windowsScanned: analyses.length };
  }

  scoreVoiceWindow(
    startSeconds: number,
    clipDuration: number,
    diagnosticOutput: string,
  ): VoiceWindowAnalysis {
    const silenceSeconds = Array.from(
      diagnosticOutput.matchAll(/silence_duration:\s*([\d.]+)/g),
      (match) => Number(match[1]),
    )
      .filter(Number.isFinite)
      .reduce((sum, value) => sum + value, 0);
    const finiteMetric = (pattern: RegExp) => {
      const values = Array.from(diagnosticOutput.matchAll(pattern), (match) =>
        Number(match[1]),
      ).filter(Number.isFinite);
      return values.at(-1);
    };
    const rmsDb = finiteMetric(/RMS level dB:\s*(-?[\d.]+)/g);
    const peakDb = finiteMetric(/Peak level dB:\s*(-?[\d.]+)/g);
    const dynamicRangeDb = finiteMetric(/Dynamic range:\s*([\d.]+)/g);
    const zeroCrossingRate = finiteMetric(/Zero crossings rate:\s*([\d.]+)/g);
    const audibleRatio = Math.max(0, 1 - silenceSeconds / clipDuration);
    let score = Math.round(audibleRatio * 60);
    if (rmsDb !== undefined && rmsDb >= -42 && rmsDb <= -8) score += 25;
    if (peakDb !== undefined && peakDb >= -20 && peakDb <= 0) score += 15;
    if (dynamicRangeDb !== undefined && dynamicRangeDb >= 6) score += 10;
    if (
      zeroCrossingRate !== undefined &&
      zeroCrossingRate >= 0.005 &&
      zeroCrossingRate <= 0.25
    )
      score += 10;
    const classification =
      audibleRatio < 0.55
        ? 'silent'
        : dynamicRangeDb !== undefined && dynamicRangeDb < 4
          ? 'music-likely'
          : dynamicRangeDb !== undefined && zeroCrossingRate !== undefined
            ? 'speech-likely'
            : 'audible-uncertain';
    const accepted =
      classification !== 'silent' &&
      classification !== 'music-likely' &&
      rmsDb !== undefined &&
      score >= 55;
    return {
      startSeconds,
      silenceSeconds: Math.round(silenceSeconds * 100) / 100,
      rmsDb,
      peakDb,
      dynamicRangeDb,
      zeroCrossingRate,
      classification,
      score,
      accepted,
    };
  }

  private async processVoiceCandidates(
    request: AssetRequest,
    plan: VoiceSearchPlan,
    queries: string[],
    duration: number,
    outputPath: string,
    mediaKey: string,
    tempBasePath: string,
    explicitCandidate?: RankedYouTubeCandidate,
  ): Promise<AssetMetadata> {
    const { candidates, diagnostics } = explicitCandidate
      ? {
          candidates: [explicitCandidate],
          diagnostics: {
            queryStrategyCount: 0,
            rawSearchResultCount: 1,
            deduplicatedVideoCount: 1,
            metadataAcceptedCount: 1,
            explicitCandidate: true,
          },
        }
      : await this.searchVoiceCandidates(queries, request);
    let downloadedCandidateCount = 0;
    let windowsScanned = 0;
    let speechWindowsFound = 0;
    let silentWindowsRejected = 0;
    let musicDominantWindowsRejected = 0;
    const candidateFailures: Array<{ title: string; failureCode: string }> = [];

    for (const [candidateIndex, selected] of candidates.slice(0, 3).entries()) {
      const candidateBase = `${tempBasePath}-${candidateIndex}`;
      const sourcePath = `${candidateBase}.m4a`;
      try {
        await this.runCommand(
          'download',
          this.ytDlpBinary,
          this.ytDlpArgs([
            selected.sourceUrl,
            '-f',
            'bestaudio',
            '--extract-audio',
            '--audio-format',
            'm4a',
            '-o',
            `${candidateBase}.%(ext)s`,
          ]),
        );
        downloadedCandidateCount += 1;
        const sourceDuration =
          selected.durationSeconds ?? (await this.probeDuration(sourcePath));
        const analyses: VoiceWindowAnalysis[] = [];
        const preferredStart = this.optionalStart(
          request.preferredStartSeconds,
        );
        const starts =
          preferredStart === undefined
            ? this.buildVoiceWindowStarts(sourceDuration, duration)
            : [
                Math.min(
                  preferredStart,
                  Math.max(0, sourceDuration - duration),
                ),
              ];
        for (const [windowIndex, start] of starts.entries()) {
          const windowPath = `${candidateBase}-window-${windowIndex}.m4a`;
          try {
            await this.runCommand(
              'trim',
              this.ffmpegBinary,
              [
                '-y',
                '-ss',
                String(start),
                '-i',
                sourcePath,
                '-t',
                String(duration),
                '-c:a',
                'aac',
                windowPath,
              ],
              { logAsPipelineStep: false },
            );
            const { stderr } = await this.runCommand(
              'inspect',
              this.ffmpegBinary,
              [
                '-i',
                windowPath,
                '-af',
                'silencedetect=noise=-40dB:d=0.3,astats=metadata=1:reset=0',
                '-f',
                'null',
                '-',
              ],
              { logAsPipelineStep: false },
            );
            const analysis = this.scoreVoiceWindow(start, duration, stderr);
            analyses.push(analysis);
            windowsScanned += 1;
            if (analysis.accepted) speechWindowsFound += 1;
            else if (analysis.silenceSeconds / duration > 0.45)
              silentWindowsRejected += 1;
            else if (analysis.classification === 'music-likely')
              musicDominantWindowsRejected += 1;
          } finally {
            await rm(windowPath, { force: true });
          }
        }
        const best = analyses
          .filter((analysis) => analysis.accepted)
          .sort((left, right) => right.score - left.score)[0];
        if (!best) {
          candidateFailures.push({
            title: this.safeTitle(selected.title),
            failureCode: analyses.every(
              (analysis) => analysis.silenceSeconds / duration > 0.45,
            )
              ? 'VOICE_ALL_WINDOWS_SILENT'
              : analyses.length > 0 &&
                  analyses.every(
                    (analysis) => analysis.classification === 'music-likely',
                  )
                ? 'VOICE_MUSIC_DOMINANT_WINDOWS'
                : 'VOICE_NO_SPEECH_WINDOW',
          });
          continue;
        }
        await this.runCommand('trim', this.ffmpegBinary, [
          '-y',
          '-ss',
          String(best.startSeconds),
          '-i',
          sourcePath,
          '-t',
          String(duration),
          '-c:a',
          'aac',
          outputPath,
        ]);
        await this.assertFileExists('store', outputPath);
        const storedFile = await stat(outputPath);
        return {
          localPath: outputPath,
          url: `${this.appBaseUrl.replace(/\/+$/, '')}/uploads/${mediaKey}`,
          duration,
          source: 'youtube',
          sourceUrl: selected.sourceUrl,
          searchQuery: selected.searchQuery,
          provider: 'youtube',
          type: 'audio',
          metadata: {
            sourceId: this.youtubeSourceId(selected.sourceUrl),
            title: this.safeTitle(selected.title),
            channel: selected.channel,
            sourceDurationSeconds: sourceDuration,
            relevanceScore: selected.relevanceScore,
            entityUsed: plan.entity,
            franchiseUsed: plan.franchise,
            preferredLanguages: this.preferredLanguages(request.language),
            selectedQuery: selected.searchQuery,
            selectedWindowStartSeconds: best.startSeconds,
            voiceWindowScore: best.score,
            silenceSeconds: best.silenceSeconds,
            validation: 'entity-metadata-and-bounded-audible-window',
            ...diagnostics,
            downloadedCandidateCount,
            windowsScanned,
            speechWindowsFound,
            silentWindowsRejected,
            musicDominantWindowsRejected,
            mimetype: 'audio/mp4',
            size: storedFile.size,
          },
        };
      } catch (error) {
        candidateFailures.push({
          title: this.safeTitle(selected.title),
          failureCode:
            error instanceof AssetProviderStepError && error.step === 'download'
              ? 'VOICE_VIDEO_DOWNLOAD_FAILED'
              : 'VOICE_CLIP_EXTRACTION_FAILED',
        });
      } finally {
        await rm(sourcePath, { force: true });
        await rm(`${candidateBase}.webm`, { force: true });
        await rm(`${candidateBase}.opus`, { force: true });
      }
    }
    throw new AssetProviderStepError(
      'trim',
      'No entity-relevant YouTube video contained an acceptable audible voice window',
      {
        failureCode: 'VOICE_NO_VALID_VIDEO_AFTER_SEARCH',
        ...diagnostics,
        downloadedCandidateCount,
        windowsScanned,
        speechWindowsFound,
        silentWindowsRejected,
        musicDominantWindowsRejected,
        candidateFailures,
      },
    );
  }

  private optionalStart(value: unknown): number | undefined {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  private explicitSelectedCandidate(
    request: AssetRequest,
  ): RankedYouTubeCandidate | undefined {
    const sourceUrl = this.readString(request.selectedSourceUrl);
    if (!sourceUrl) return undefined;
    const raw =
      request.selectedCandidate && typeof request.selectedCandidate === 'object'
        ? (request.selectedCandidate as Record<string, unknown>)
        : {};
    const durationSeconds = Number(raw.durationSeconds);
    return {
      sourceUrl,
      title: this.safeTitle(this.readString(raw.title) || sourceUrl),
      durationSeconds:
        Number.isFinite(durationSeconds) && durationSeconds > 0
          ? durationSeconds
          : undefined,
      searchQuery:
        this.readString(raw.queryUsed) || this.readString(request.query),
      relevanceScore: 100,
      queryCount: 0,
      candidateCount: 1,
      relevanceRejections: {},
      rawSearchResultCount: 1,
      deduplicatedVideoCount: 1,
      metadataAcceptedCount: 1,
    };
  }

  private youtubeSourceId(sourceUrl: string): string {
    try {
      const url = new URL(sourceUrl);
      return (
        url.searchParams.get('v') ??
        url.pathname.split('/').filter(Boolean).at(-1) ??
        sourceUrl
      );
    } catch {
      return sourceUrl;
    }
  }

  private async searchVoiceCandidates(
    queries: string[],
    request: AssetRequest,
  ): Promise<{
    candidates: RankedYouTubeCandidate[];
    diagnostics: Record<string, unknown>;
  }> {
    const pool = new Map<string, RankedYouTubeCandidate>();
    const seenVideoUrls = new Set<string>();
    const relevanceRejections: Record<string, number> = {};
    let rawSearchResultCount = 0;
    for (const query of queries.slice(0, 6)) {
      try {
        const { stdout } = await this.runCommand(
          'search',
          this.ytDlpBinary,
          this.ytDlpArgs([
            `ytsearch5:${query}`,
            '--flat-playlist',
            '--dump-json',
            '--skip-download',
          ]),
        );
        for (const candidate of this.parseSearchResults(stdout)) {
          rawSearchResultCount += 1;
          if (seenVideoUrls.has(candidate.sourceUrl)) continue;
          seenVideoUrls.add(candidate.sourceUrl);
          const relevance = evaluateAssetRelevance(request, {
            provider: 'youtube',
            assetType: 'audio',
            mediaIntent: request.mediaIntent,
            title: candidate.title,
            description: candidate.description,
            mediaUrl: candidate.sourceUrl,
            queryUsed: query,
            durationSeconds: candidate.durationSeconds,
            metadataTerms: [candidate.channel ?? '', ...candidate.tags],
          });
          if (!relevance.accepted) {
            for (const code of relevance.rejectionCodes)
              relevanceRejections[code] = (relevanceRejections[code] ?? 0) + 1;
            continue;
          }
          pool.set(candidate.sourceUrl, {
            ...candidate,
            searchQuery: query,
            relevanceScore: relevance.score,
            queryCount: Math.min(queries.length, 6),
            candidateCount: 0,
            relevanceRejections,
            rawSearchResultCount: 0,
            deduplicatedVideoCount: 0,
            metadataAcceptedCount: 0,
          });
        }
      } catch {
        continue;
      }
    }
    const candidates = [...pool.values()]
      .sort((left, right) => right.relevanceScore - left.relevanceScore)
      .slice(0, 5);
    const diagnostics = {
      queryStrategyCount: Math.min(queries.length, 6),
      rawSearchResultCount,
      deduplicatedVideoCount: seenVideoUrls.size,
      metadataAcceptedCount: pool.size,
      relevanceRejections,
    };
    if (!candidates.length)
      throw new AssetProviderStepError(
        'search',
        'No YouTube result passed entity and voice metadata validation',
        { failureCode: 'VOICE_NO_VALID_VIDEO_AFTER_SEARCH', ...diagnostics },
      );
    return { candidates, diagnostics };
  }

  private async probeDuration(filePath: string): Promise<number> {
    const { stdout } = await this.runCommand(
      'inspect',
      'ffprobe',
      [
        '-v',
        'error',
        '-show_entries',
        'format=duration',
        '-of',
        'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { logAsPipelineStep: false },
    );
    const duration = Number(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0)
      throw new AssetProviderStepError(
        'inspect',
        'Downloaded voice candidate duration was invalid',
        { failureCode: 'VOICE_CLIP_EXTRACTION_FAILED' },
      );
    return duration;
  }

  private preferredLanguages(language: unknown): string[] {
    const value = this.readString(language).toLowerCase();
    return Array.from(
      new Set([
        ...(/japanese|日本|ja\b/.test(value) ? ['ja'] : []),
        ...(/english|en\b/.test(value) ? ['en'] : []),
        ...(/arabic|عرب|ar\b/.test(value) ? ['ar'] : []),
      ]),
    );
  }

  private safeTitle(title: string): string {
    return title
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }

  private async search(
    candidates: string[],
    request: AssetRequest,
  ): Promise<SearchResult> {
    if (request.mediaIntent === 'music')
      return this.searchMusicCandidates(candidates, request);
    const attemptedQueries: Array<{
      query: string;
      reason?: string;
      stdout?: string;
      stderr?: string;
    }> = [];
    const relevanceRejections: Record<string, number> = {};
    let candidateCount = 0;

    if (!candidates.length) {
      throw new AssetProviderStepError(
        'search',
        'No YouTube search candidates could be built from asset metadata',
      );
    }

    for (const query of candidates) {
      try {
        this.logger.log(`Trying YouTube search candidate: "${query}"`);
        const { stdout } = await this.runCommand(
          'search',
          this.ytDlpBinary,
          this.ytDlpArgs([
            `ytsearch3:${query}`,
            '--flat-playlist',
            '--dump-json',
            '--skip-download',
          ]),
        );
        const parsedCandidates = this.parseSearchResults(stdout);
        candidateCount += parsedCandidates.length;
        const ranked = parsedCandidates
          .map((candidate) => ({
            candidate,
            relevance: evaluateAssetRelevance(request, {
              provider: 'youtube',
              assetType: request.type,
              mediaIntent: request.mediaIntent,
              title: candidate.title,
              description: candidate.description,
              mediaUrl: candidate.sourceUrl,
              queryUsed: query,
              durationSeconds: candidate.durationSeconds,
              metadataTerms: [candidate.channel ?? '', ...candidate.tags],
            }),
          }))
          .filter(({ relevance }) => {
            if (relevance.accepted) return true;
            for (const code of relevance.rejectionCodes)
              relevanceRejections[code] = (relevanceRejections[code] ?? 0) + 1;
            return false;
          })
          .sort((a, b) => b.relevance.score - a.relevance.score);
        const best = ranked[0];
        if (!best) {
          attemptedQueries.push({
            query,
            reason: 'No result passed semantic relevance validation',
          });
          continue;
        }
        const sourceUrl = best.candidate.sourceUrl;
        this.logger.log(
          `Step 2 complete: Select video (${sourceUrl}) using query "${query}"`,
        );
        this.logger.log(`YouTube search query succeeded: "${query}"`);
        return {
          sourceUrl,
          searchQuery: query,
          title: best.candidate.title,
          channel: best.candidate.channel,
          durationSeconds: best.candidate.durationSeconds,
          relevanceScore: best.relevance.score,
          queryCount: attemptedQueries.length + 1,
          candidateCount,
          relevanceRejections,
        };
      } catch (error) {
        attemptedQueries.push({
          query,
          reason: this.errorMessage(error),
          ...this.commandDiagnostics(error),
        });
        this.logger.warn(
          `YouTube search candidate failed: "${query}" (${this.errorMessage(error)})`,
        );
      }
    }

    throw new AssetProviderStepError(
      'search',
      `No valid YouTube video found after ${attemptedQueries.length} search strategies`,
      this.withDevelopmentOutput({
        attemptedQueries,
        failureCode: 'MEDIA_RELEVANCE_VALIDATION_FAILED',
        relevanceRejections,
      }),
    );
  }

  private async searchMusicCandidates(
    queries: string[],
    request: AssetRequest,
  ): Promise<SearchResult> {
    if (!queries.length)
      throw new AssetProviderStepError(
        'search',
        'Canonical song title and artist are required',
        { failureCode: 'MUSIC_TITLE_ARTIST_MISMATCH' },
      );
    const pool = new Map<
      string,
      { candidate: YouTubeCandidate; query: string; score: number }
    >();
    const rejectionCodes: Record<string, number> = {};
    let rawSearchResultCount = 0;
    for (const query of queries.slice(0, 5)) {
      try {
        const { stdout } = await this.runCommand(
          'search',
          this.ytDlpBinary,
          this.ytDlpArgs([
            `ytsearch5:${query}`,
            '--flat-playlist',
            '--dump-json',
            '--skip-download',
          ]),
        );
        for (const candidate of this.parseSearchResults(stdout)) {
          rawSearchResultCount += 1;
          const relevance = evaluateAssetRelevance(request, {
            provider: 'youtube',
            assetType: 'audio',
            mediaIntent: 'music',
            title: candidate.title,
            description: candidate.description,
            mediaUrl: candidate.sourceUrl,
            queryUsed: query,
            durationSeconds: candidate.durationSeconds,
            metadataTerms: [candidate.channel ?? '', ...candidate.tags],
          });
          if (!relevance.accepted) {
            for (const code of relevance.rejectionCodes)
              rejectionCodes[code] = (rejectionCodes[code] ?? 0) + 1;
            continue;
          }
          const providerText = `${candidate.title} ${candidate.channel ?? ''}`;
          const score =
            relevance.score +
            (/official (audio|video)|قناه رسميه/i.test(providerText) ? 30 : 0) +
            (/\btopic\b/i.test(providerText) ? 25 : 0) +
            (/lyrics|كلمات/i.test(providerText) ? 5 : 0);
          const previous = pool.get(candidate.sourceUrl);
          if (!previous || score > previous.score)
            pool.set(candidate.sourceUrl, { candidate, query, score });
        }
      } catch {
        continue;
      }
    }
    const selected = [...pool.values()].sort(
      (left, right) => right.score - left.score,
    )[0];
    if (!selected)
      throw new AssetProviderStepError(
        'search',
        'No YouTube result matched the canonical song title and artist',
        {
          failureCode: 'MUSIC_NO_VALID_YOUTUBE_ASSET',
          queryStrategyCount: Math.min(queries.length, 5),
          rawSearchResultCount,
          deduplicatedCandidateCount: pool.size,
          rejectionCodes,
        },
      );
    return {
      sourceUrl: selected.candidate.sourceUrl,
      searchQuery: selected.query,
      title: selected.candidate.title,
      channel: selected.candidate.channel,
      durationSeconds: selected.candidate.durationSeconds,
      relevanceScore: selected.score,
      queryCount: Math.min(queries.length, 5),
      candidateCount: pool.size,
      relevanceRejections: rejectionCodes,
    };
  }

  selectVideoWindowStart(
    sourceDuration: number,
    clipDuration: number,
    preferredStartSeconds?: unknown,
  ): number {
    const requestedStart = Number(preferredStartSeconds);
    if (
      preferredStartSeconds !== undefined &&
      preferredStartSeconds !== null &&
      Number.isFinite(requestedStart) &&
      requestedStart >= 0
    )
      return Number.isFinite(sourceDuration)
        ? Math.min(
            Math.trunc(requestedStart),
            Math.max(0, Math.floor(sourceDuration - clipDuration)),
          )
        : Math.trunc(requestedStart);
    if (!Number.isFinite(sourceDuration) || sourceDuration <= clipDuration + 2)
      return 0;
    const lastStart = Math.max(0, sourceDuration - clipDuration - 2);
    return Math.round(Math.min(lastStart, Math.max(3, sourceDuration * 0.25)));
  }

  parseSearchResults(stdout: string): YouTubeCandidate[] {
    return stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const value = JSON.parse(line) as Record<string, unknown>;
          const sourceUrl =
            this.readString(value.webpage_url) ||
            (this.readString(value.id)
              ? `https://www.youtube.com/watch?v=${this.readString(value.id)}`
              : '');
          const title = this.readString(value.title);
          if (!sourceUrl || !title) return [];
          return [
            {
              sourceUrl,
              title,
              description: this.readString(value.description),
              channel:
                this.readString(value.channel) ||
                this.readString(value.uploader),
              durationSeconds:
                typeof value.duration === 'number' ? value.duration : undefined,
              tags: Array.isArray(value.tags)
                ? value.tags
                    .filter((tag): tag is string => typeof tag === 'string')
                    .slice(0, 20)
                : [],
            },
          ];
        } catch {
          return [];
        }
      });
  }

  private async resolveBinary(
    command: string,
    absolutePath: string,
  ): Promise<string> {
    const versionArgs = command === 'ffmpeg' ? ['-version'] : ['--version'];

    try {
      await this.runCommand('tool-detection', command, versionArgs, {
        logAsPipelineStep: false,
      });
      return command;
    } catch (pathError) {
      try {
        await access(absolutePath);
        await this.runCommand('tool-detection', absolutePath, versionArgs, {
          logAsPipelineStep: false,
        });
        return absolutePath;
      } catch (absoluteError) {
        throw new AssetProviderStepError(
          'tool-detection',
          `${command} detection failed. PATH command error: ${this.errorMessage(pathError)}. Absolute path error: ${this.errorMessage(absoluteError)}`,
          this.withDevelopmentOutput({
            command,
            absolutePath,
            pathError: this.commandDiagnostics(pathError),
            absoluteError: this.commandDiagnostics(absoluteError),
          }),
        );
      }
    }
  }

  private async runCommand(
    step: AssetProviderStep,
    command: string,
    args: string[],
    options?: { logAsPipelineStep?: boolean },
  ): Promise<CommandResult> {
    const shouldLogStep = options?.logAsPipelineStep ?? true;

    if (shouldLogStep) {
      this.logger.log(`${this.stepLabel(step)}: ${command} ${args.join(' ')}`);
    }

    try {
      const { stdout, stderr } = await execFileAsync(command, args);

      if (shouldLogStep) {
        this.logger.log(`${this.stepLabel(step)} complete`);
      }

      return {
        stdout,
        stderr,
      };
    } catch (error) {
      const diagnostics = this.commandDiagnostics(error);
      const reason = `${command} failed during ${step}: ${this.errorMessage(error)}`;

      this.logger.error(
        `${this.stepLabel(step)} failed: ${reason}`,
        JSON.stringify(diagnostics),
      );

      throw new AssetProviderStepError(
        step,
        reason,
        this.withDevelopmentOutput({
          command,
          args,
          ...diagnostics,
        }),
      );
    }
  }

  private async assertFileExists(
    step: AssetProviderStep,
    filePath: string,
  ): Promise<void> {
    try {
      await access(filePath);
    } catch (error) {
      throw new AssetProviderStepError(
        step,
        `Generated asset file was not found at ${filePath}: ${this.errorMessage(error)}`,
        this.withDevelopmentOutput({
          filePath,
          error: this.commandDiagnostics(error),
        }),
      );
    }
  }

  private stepLabel(step: AssetProviderStep): string {
    const labels: Record<AssetProviderStep, string> = {
      'tool-detection': 'Tool detection',
      search: 'Step 1: Search YouTube',
      'select-video': 'Step 2: Select video',
      download: 'Step 3: Download audio',
      trim: 'Step 4: Trim using ffmpeg',
      inspect: 'Inspect audio window',
      store: 'Step 5: Store locally',
      'image-search': 'Search image provider',
    };

    return labels[step];
  }

  private ytDlpArgs(args: string[]): string[] {
    return ['--js-runtimes', 'node:/usr/local/bin/node', ...args];
  }

  private commandDiagnostics(error: unknown): Record<string, unknown> {
    const commandError = error as {
      code?: unknown;
      signal?: unknown;
      stdout?: unknown;
      stderr?: unknown;
      path?: unknown;
      syscall?: unknown;
    };

    return {
      code: commandError.code,
      signal: commandError.signal,
      path: commandError.path,
      syscall: commandError.syscall,
      stdout:
        typeof commandError.stdout === 'string'
          ? this.truncateDiagnostic(commandError.stdout.trim())
          : commandError.stdout,
      stderr:
        typeof commandError.stderr === 'string'
          ? this.truncateDiagnostic(commandError.stderr.trim())
          : commandError.stderr,
    };
  }

  private truncateDiagnostic(value: string): string {
    const maxLength = 2_000;
    return value.length > maxLength
      ? `${value.slice(0, maxLength)}…[truncated ${value.length - maxLength} chars]`
      : value;
  }

  private joinSearchParts(parts: unknown[]): string {
    return parts
      .map((part) => this.readString(part))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }

  private withDevelopmentOutput(
    diagnostics: Record<string, unknown>,
  ): Record<string, unknown> | undefined {
    if (process.env.NODE_ENV === 'production') {
      return undefined;
    }

    return diagnostics;
  }

  private normalizeDuration(duration: unknown): number {
    const parsed = Number(duration);

    if (!Number.isFinite(parsed) || parsed <= 0) {
      return 6;
    }

    return Math.min(20, Math.max(1, Math.round(parsed)));
  }

  private normalizeVideoDuration(duration: unknown): number {
    const parsed = Number(duration);
    if (!Number.isFinite(parsed) || parsed <= 0) return 8;
    return Math.min(15, Math.max(5, Math.round(parsed)));
  }
}
