import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiProvider } from '../../ai-agent/domain/ai-provider.interface';
import { DifferenceRequest } from '../domain/composed-difference';
import {
  ENGINE_AI_PROVIDER,
  ENGINE_MEDIA_VISION_MODEL,
} from '../domain/content-engine.constants';
import { DifferenceSceneStore } from '../infrastructure/difference-scene.store';
import {
  keepOneDifference,
  sideBySide,
} from '../infrastructure/one-difference';
import { EngineBudgetService } from './engine-budget.service';

/** The model that draws: `ENGINE_IMAGE_MODEL`, e.g. google/gemini-3.1-flash-image. */
export const ENGINE_IMAGE_MODEL = 'ENGINE_IMAGE_MODEL';
/** The model that takes the thing out, when it is not the one that draws. */
export const ENGINE_IMAGE_EDIT_MODEL = 'ENGINE_IMAGE_EDIT_MODEL';

/** One picture out is ~1,300 tokens; the ceiling leaves room and is reserved whole. */
const DRAW_PROMPT_TOKENS = 1_500;
const EDIT_PROMPT_TOKENS = 3_500;
const IMAGE_MAX_OUTPUT_TOKENS = 4_000;
const CHECK_PROMPT_TOKENS = 6_000;
const CHECK_MAX_OUTPUT_TOKENS = 200;

/**
 * Below this share of the picture nobody can see the difference; above it,
 * the model redrew far more than the one thing.
 */
export const MIN_DIFFERENCE_AREA = 0.002;
export const MAX_DIFFERENCE_AREA = 0.12;
const EDIT_ATTEMPTS = 2;

const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['inFirst', 'inSecond'],
  properties: {
    inFirst: { type: 'boolean' },
    inSecond: { type: 'boolean' },
  },
} as const;

export type DifferenceCheck = 'confirmed' | 'unchecked';

export type DifferenceOutcome =
  | {
      status: 'drawn';
      png: Buffer;
      check: DifferenceCheck;
      area: number;
      strayArea: number;
      attempts: number;
      /** True when the scene's drawing was already kept and cost nothing. */
      sceneReused: boolean;
    }
  | { status: 'failed'; failureReason: string };

/**
 * Draws one وش الفرق؟ picture: an image model draws the scene, takes the one
 * thing out, and the engine keeps that one change and no other.
 *
 * Every model call is reserved against the job's budget before it is made and
 * settled after, like every other paid call. Nothing here guesses: a picture
 * whose difference is too small, too large, or — where a vision model is
 * configured — not the thing that was asked, is drawn again once and then
 * given up, and the candidate says why.
 */
@Injectable()
export class DifferenceSceneService {
  constructor(
    private readonly budget: EngineBudgetService,
    private readonly config: ConfigService,
    @Optional()
    @Inject(ENGINE_AI_PROVIDER)
    private readonly provider?: AiProvider,
    @Optional() private readonly store?: DifferenceSceneStore,
  ) {}

  private imageModel(): string | undefined {
    return this.config.get<string>(ENGINE_IMAGE_MODEL)?.trim() || undefined;
  }

  async draw(input: {
    jobId: string;
    /** Unique per item within the job; names the ledger entries. */
    itemKey: string;
    request: DifferenceRequest;
  }): Promise<DifferenceOutcome> {
    const model = this.imageModel();
    if (!this.provider || !model)
      return {
        status: 'failed',
        failureReason: 'DIFFERENCE_IMAGE_MODEL_NOT_CONFIGURED',
      };

    const editModel =
      this.config.get<string>(ENGINE_IMAGE_EDIT_MODEL)?.trim() || model;

    // The scene is drawn once and every item about it shares the drawing.
    const sceneKey = `${input.request.sceneDrawingKey}:${model}`;
    const kept = await this.store?.get(sceneKey);
    const original =
      kept ??
      (await this.picture(model, input, 'draw', input.request.drawPrompt));
    if (typeof original === 'string')
      return { status: 'failed', failureReason: original };
    if (!kept) await this.store?.put(sceneKey, model, original);

    let lastReason = 'DIFFERENCE_NOT_FOUND';
    for (let attempt = 1; attempt <= EDIT_ATTEMPTS; attempt += 1) {
      const edited = await this.picture(
        editModel,
        input,
        `edit-${attempt}`,
        input.request.editPrompt,
        original,
      );
      if (typeof edited === 'string')
        return { status: 'failed', failureReason: edited };
      const one = await keepOneDifference(original, edited);
      if (one.area < MIN_DIFFERENCE_AREA) {
        lastReason = 'DIFFERENCE_TOO_SMALL';
        continue;
      }
      if (one.area > MAX_DIFFERENCE_AREA) {
        lastReason = 'DIFFERENCE_TOO_LARGE';
        continue;
      }
      const check = await this.check(input, attempt, one.original, one.edited);
      if (check === 'wrong') {
        lastReason = 'DIFFERENCE_NOT_THE_THING_ASKED';
        continue;
      }
      const [first, second] =
        input.request.missingFrom === 'second'
          ? [one.original, one.edited]
          : [one.edited, one.original];
      return {
        status: 'drawn',
        png: await sideBySide(first, second),
        check,
        area: one.area,
        strayArea: one.strayArea,
        attempts: attempt,
        sceneReused: Boolean(kept),
      };
    }
    return { status: 'failed', failureReason: lastReason };
  }

  /** One paid picture, or the reason there is none. */
  private async picture(
    model: string,
    input: { jobId: string; itemKey: string },
    step: string,
    prompt: string,
    from?: Buffer,
  ): Promise<Buffer | string> {
    const reservationId = `${input.jobId}:difference-image:${input.itemKey}:${step}`;
    try {
      await this.budget.reserve({
        reservationId,
        jobId: input.jobId,
        stage: 'difference_image',
        provider: this.config.get<string>('ENGINE_PROVIDER_NAME') ?? 'fake',
        model,
        expected: {
          promptTokens: from ? EDIT_PROMPT_TOKENS : DRAW_PROMPT_TOKENS,
          maxOutputTokens: IMAGE_MAX_OUTPUT_TOKENS,
        },
      });
    } catch {
      return 'DIFFERENCE_IMAGE_NOT_AFFORDABLE';
    }
    try {
      const response = await this.provider!.generateText({
        model,
        prompt,
        ...(from
          ? {
              images: [`data:image/png;base64,${from.toString('base64')}`],
              imageDetail: 'high' as const,
            }
          : {}),
        outputImage: { aspectRatio: '1:1' },
        omitTemperature: true,
        reasoningEffort: null,
        maxOutputTokens: IMAGE_MAX_OUTPUT_TOKENS,
        timeoutMs: 120_000,
      });
      await this.budget.settle({ reservationId, usage: response.usage });
      const url = response.images?.[0];
      if (!url) return 'DIFFERENCE_IMAGE_EMPTY';
      return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
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
      return 'DIFFERENCE_IMAGE_FAILED';
    }
  }

  /**
   * A vision model looks at both pictures: the thing must be in the first and
   * not in the second. Unavailable or unaffordable is `unchecked`, never
   * `confirmed`; a person approves every picture either way.
   */
  private async check(
    input: { jobId: string; itemKey: string; request: DifferenceRequest },
    attempt: number,
    original: Buffer,
    edited: Buffer,
  ): Promise<DifferenceCheck | 'wrong'> {
    const model =
      this.config.get<string>(ENGINE_MEDIA_VISION_MODEL)?.trim() ||
      this.config.get<string>('ENGINE_QUALITY_MODEL')?.trim();
    if (!model) return 'unchecked';
    const reservationId = `${input.jobId}:difference-check:${input.itemKey}:${attempt}`;
    try {
      await this.budget.reserve({
        reservationId,
        jobId: input.jobId,
        stage: 'difference_check',
        provider: this.config.get<string>('ENGINE_PROVIDER_NAME') ?? 'fake',
        model,
        expected: {
          promptTokens: CHECK_PROMPT_TOKENS,
          maxOutputTokens: CHECK_MAX_OUTPUT_TOKENS,
        },
      });
    } catch {
      return 'unchecked';
    }
    let raw: string;
    try {
      const response = await this.provider!.generateText({
        model,
        prompt: [
          'Two pictures follow: the first, then the second.',
          `Look for this one thing: ${input.request.thingEnglish}.`,
          'Is it in the first picture? Is it in the second picture?',
          'Answer only with the JSON asked for.',
        ].join('\n'),
        images: [original, edited].map(
          (bytes) => `data:image/png;base64,${bytes.toString('base64')}`,
        ),
        imageDetail: 'high',
        responseSchema: CHECK_SCHEMA as unknown as Record<string, unknown>,
        omitTemperature: true,
        reasoningEffort: null,
        maxOutputTokens: CHECK_MAX_OUTPUT_TOKENS,
        timeoutMs: 45_000,
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
      return 'unchecked';
    }
    try {
      const verdict = JSON.parse(raw) as {
        inFirst?: unknown;
        inSecond?: unknown;
      };
      if (
        typeof verdict.inFirst !== 'boolean' ||
        typeof verdict.inSecond !== 'boolean'
      )
        return 'unchecked';
      return verdict.inFirst && !verdict.inSecond ? 'confirmed' : 'wrong';
    } catch {
      return 'unchecked';
    }
  }
}
