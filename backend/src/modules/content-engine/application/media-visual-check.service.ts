import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '../../ai-agent/domain/ai-provider.interface';
import { MediaVisualCheck } from '../domain/candidate-media-plan';
import {
  ENGINE_AI_PROVIDER,
  ENGINE_MEDIA_VISION_MODEL,
} from '../domain/content-engine.constants';
import { mediaVisionCheckEnabled } from '../domain/engine-media-flags';
import { EngineBudgetService } from './engine-budget.service';

/** A `low`-detail image is a fixed charge of this order, whatever its size. */
const VISION_PROMPT_TOKENS = 3_400;
const VISION_MAX_OUTPUT_TOKENS = 200;

const VISION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['readableText', 'leaks', 'reason'],
  properties: {
    readableText: { type: 'string' },
    leaks: { type: 'boolean' },
    reason: { type: 'string' },
  },
} as const;

export interface MediaVisualCheckInput {
  jobId: string;
  /** Unique per image looked at within the job; names the ledger entry. */
  reservationKey: string;
  imageUrl: string;
  question: string;
  acceptedAnswers: readonly string[];
  mustNotShow: readonly string[];
}

/**
 * Looks at one image and says whether it gives the answer away in writing.
 *
 * Discovery proves a picture is *of* the subject; nothing before this looks at
 * what is written *in* it. A crest with the club's name on its ribbon, a shirt
 * with the player's name across the back, a captioned press photo — each is
 * the right subject and a ruined question.
 *
 * Advisory and fail-open in one direction only: a failed or refused call
 * returns `unchecked`, never `clear`. It can keep an image from being attached
 * unseen; it can never make one look safer than it is.
 */
@Injectable()
export class MediaVisualCheckService {
  constructor(
    private readonly budget: EngineBudgetService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(ENGINE_AI_PROVIDER)
    private readonly provider?: AiProvider,
  ) {}

  isAvailable(): boolean {
    return Boolean(this.provider) && mediaVisionCheckEnabled(this.config);
  }

  async check(input: MediaVisualCheckInput): Promise<MediaVisualCheck> {
    if (!this.provider || !this.isAvailable()) return { status: 'unchecked' };
    const model =
      this.config.get<string>(ENGINE_MEDIA_VISION_MODEL)?.trim() ||
      this.config.get<string>('ENGINE_QUALITY_MODEL')?.trim();
    if (!model) return { status: 'unchecked' };
    const reservationId = `${input.jobId}:media-vision:${input.reservationKey}`;

    try {
      await this.budget.reserve({
        reservationId,
        jobId: input.jobId,
        stage: 'media_vision',
        provider: this.config.get<string>('ENGINE_PROVIDER_NAME') ?? 'fake',
        model,
        expected: {
          promptTokens: VISION_PROMPT_TOKENS,
          maxOutputTokens: VISION_MAX_OUTPUT_TOKENS,
        },
      });
    } catch {
      // Out of budget, or no price for the model: nobody looks.
      return { status: 'unchecked' };
    }

    let raw: string;
    try {
      const response = await this.provider.generateText({
        model,
        prompt: this.prompt(input),
        images: [input.imageUrl],
        imageDetail: 'low',
        responseSchema: VISION_SCHEMA as unknown as Record<string, unknown>,
        omitTemperature: true,
        reasoningEffort: null,
        maxOutputTokens: VISION_MAX_OUTPUT_TOKENS,
        timeoutMs: 30_000,
      });
      raw = response.text;
      await this.budget.settle({ reservationId, usage: response.usage });
    } catch (error) {
      const rejected =
        (error as { definitelyNotBilled?: unknown })?.definitelyNotBilled ===
        true;
      await this.budget
        .settle({
          reservationId,
          ...(rejected ? { providerRejected: true } : { timedOut: true }),
        })
        .catch(() => undefined);
      return { status: 'unchecked' };
    }

    try {
      const verdict = JSON.parse(raw) as {
        readableText?: unknown;
        leaks?: unknown;
        reason?: unknown;
      };
      if (typeof verdict.leaks !== 'boolean') return { status: 'unchecked' };
      if (!verdict.leaks) return { status: 'clear' };
      const evidence = [verdict.readableText, verdict.reason]
        .filter((part): part is string => typeof part === 'string')
        .map((part) => part.trim())
        .filter(Boolean)
        .join(' — ')
        .slice(0, 300);
      return { status: 'leaks', ...(evidence ? { evidence } : {}) };
    } catch {
      return { status: 'unchecked' };
    }
  }

  private prompt(input: MediaVisualCheckInput): string {
    return [
      'You are checking one picture for a TV quiz. Players see only this picture and the question, and must work out the answer themselves.',
      `Question: ${input.question}`,
      `Accepted answers: ${input.acceptedAnswers.join(' | ') || '(none given)'}`,
      input.mustNotShow.length
        ? `The picture must not show: ${input.mustNotShow.join('; ')}`
        : '',
      'First, transcribe into "readableText" every piece of writing a viewer could read in the picture, in any script: names on shirts, lettering inside a badge or logo, captions, signs, scoreboards, watermarks. Empty string if there is none.',
      'Then set "leaks" to true only if that writing, or an explicit label in the picture, states an accepted answer (or an obvious part or spelling of it) or shows something from the must-not-show list.',
      'Recognising the subject from how it looks is NOT a leak: a famous face, a stadium, or a crest with no name on it is exactly what the question wants. Writing that does not reveal the answer (a sponsor, a shirt number, another name) is not a leak either.',
      'Give the deciding fact in "reason", in one short sentence.',
    ]
      .filter(Boolean)
      .join('\n');
  }
}
