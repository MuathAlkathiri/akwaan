import {
  composeClosest,
  isComposedClosestFamily,
} from '../domain/composed-closest';
import { Injectable, Optional } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  CandidateMediaSlot,
  replaceMediaSlotAsset,
} from '../domain/candidate-media-plan';
import {
  composePuzzle,
  isComposedPuzzleFamily,
} from '../domain/composed-puzzles';
import { ComposedFamily, composeVisual } from '../domain/composed-visuals';
import { COMPOSED_ENTITY_PREFIX } from '../domain/content-identity.policy';
import { resolveMediaRequirements } from '../domain/media-requirements';
import { EngineImageIngestionService } from '../infrastructure/engine-image-ingestion.service';
import { SvgRasterizer } from '../infrastructure/svg-rasterizer';

export const COMPOSED_VISUAL_PROVIDER = 'akwaan-composer';

export const COMPOSED_LICENCE_NOTE =
  'Drawn by the Akwaan engine; no third-party source.';
const COMPOSED_NOTE =
  'Composed by the engine: the picture and the answer come from one value.';

export interface ComposedCandidate {
  draft: Record<string, unknown>;
  factualClaims: string[];
  authoring: Record<string, unknown>;
  /** Set when the target's media contract governs this picture. */
  mediaPlan?: CandidateMediaSlot[];
  mediaReviewRevision?: number;
}

/**
 * Authors one item of a composed family: draws it, stores the picture, and
 * returns the candidate whole.
 *
 * It never throws. A picture that could not be drawn or stored leaves the
 * candidate without media and says why on `authoring.composedVisual`; the
 * screen then blocks that one candidate, and the rest of the batch — which a
 * model was paid for — is kept.
 */
@Injectable()
export class ComposedVisualService {
  constructor(
    @Optional() private readonly rasterizer?: SvgRasterizer,
    @Optional() private readonly ingestion?: EngineImageIngestionService,
  ) {}

  async compose(
    familyKey: ComposedFamily,
    seed: string,
    target?: { mechanicKey: string; scopeKey: string },
    /** The template the slot was given; the seed chooses when there is none. */
    variantKey?: string,
  ): Promise<ComposedCandidate> {
    const puzzle = isComposedPuzzleFamily(familyKey)
      ? composePuzzle(familyKey, seed, variantKey)
      : undefined;
    const reading =
      !puzzle && isComposedClosestFamily(familyKey)
        ? composeClosest(familyKey, seed, variantKey)
        : undefined;
    const visual =
      puzzle || reading ? undefined : composeVisual(familyKey as never, seed);
    const drawing = (puzzle ?? reading ?? visual)!;
    let media: Record<string, unknown> | undefined;
    let failureReason: string | undefined;
    let governed:
      | { mediaPlan: CandidateMediaSlot[]; mediaReviewRevision: number }
      | undefined;

    if (!this.rasterizer || !this.ingestion) {
      failureReason = 'COMPOSED_VISUAL_NOT_CONFIGURED';
    } else {
      try {
        const stored = await this.ingestion.ingestBytes({
          bytes: await this.rasterizer.toPng(drawing.svg),
          acquisition: 'generate',
          provenance: {
            provider: COMPOSED_VISUAL_PROVIDER,
            licenceNote: COMPOSED_LICENCE_NOTE,
          },
        });
        if (stored.status === 'resolved') {
          media = {
            type: 'image',
            assets: [{ url: stored.asset.url, altText: drawing.altText }],
          };
          // Where the target's media contract asks for this picture (إكس أو
          // in a visual Scope), the same asset is entered in the plan — as
          // ours, so it waits only for a person to look at it.
          const requirement = target
            ? resolveMediaRequirements(target).find(
                (slot) =>
                  slot.targetPath === 'media' &&
                  slot.mediaType === 'image' &&
                  slot.acquisition.includes('generate'),
              )
            : undefined;
          if (requirement) {
            governed = replaceMediaSlotAsset(
              { mediaPlan: [], mediaReviewRevision: 0 },
              {
                requirement,
                expectedMediaReviewRevision: 0,
                asset: stored.asset,
                provenance: {
                  ...stored.provenance,
                  acquisition: 'generate',
                  provider: COMPOSED_VISUAL_PROVIDER,
                  licenceNote: COMPOSED_LICENCE_NOTE,
                },
                rights: {
                  status: 'CLEARED',
                  source: 'provider',
                  licence: 'Akwaan original',
                  rightsHolder: 'Akwaan',
                },
              },
            );
          }
        } else {
          failureReason = stored.failureReason;
        }
      } catch (error) {
        failureReason =
          (error as { code?: string })?.code ??
          'COMPOSED_VISUAL_RASTERIZATION_FAILED';
      }
    }

    // What makes this item itself and no other: the drawing. Two composed
    // items can share every word and still be different puzzles, and the
    // duplicate check reads identity from the draft.
    const entityId = `${COMPOSED_ENTITY_PREFIX}${drawing.familyKey}:${createHash(
      'sha256',
    )
      .update(drawing.svg)
      .digest('hex')
      .slice(0, 16)}`;

    const composedVisual = {
      familyKey: drawing.familyKey,
      variant: drawing.variant,
      ...(puzzle ? { variantKey: puzzle.variantKey } : {}),
      ...(reading ? { variantKey: reading.variantKey } : {}),
      ...((visual ?? reading) ? { value: (visual ?? reading)!.value } : {}),
      ...(failureReason ? { failureReason } : {}),
    };

    if (puzzle) {
      return {
        factualClaims: [puzzle.factualClaim],
        draft: {
          prompt: { ar: puzzle.prompt },
          answerPayload: puzzle.acceptedAnswers
            ? { mode: 'match', acceptedAnswers: puzzle.acceptedAnswers }
            : {
                mode: 'multiple_choice',
                options: puzzle.options.map((option) => ({
                  id: option.id,
                  label: { ar: option.label },
                })),
                correctOptionId: puzzle.correctOptionId,
              },
          ...(media ? { media } : {}),
          metadata: { notes: COMPOSED_NOTE, entityId },
        },
        authoring: {
          concept: puzzle.concept,
          distractorRationale: puzzle.distractorRationale,
          composedVisual,
        },
        ...(governed ?? {}),
      };
    }

    if (reading) {
      return {
        factualClaims: [reading.factualClaim],
        draft: {
          prompt: { ar: reading.prompt },
          answerPayload: { mode: 'closest', correctValue: reading.value },
          mechanicPayload: { closestSlider: reading.slider },
          ...(media ? { media } : {}),
          metadata: { notes: COMPOSED_NOTE, entityId },
        },
        authoring: {
          concept: reading.concept,
          answerBasis: 'reasoning',
          playerReasoningStrategy: reading.strategy,
          domainDescription: reading.domainDescription,
          stepsFromMin:
            (reading.value - reading.slider.min) / reading.slider.step,
          composedVisual,
        },
        ...(governed ?? {}),
      };
    }

    return {
      factualClaims: [visual!.factualClaim],
      draft: {
        prompt: { ar: visual!.prompt },
        answerPayload: { mode: 'closest', correctValue: visual!.value },
        mechanicPayload: { closestSlider: visual!.slider },
        ...(media ? { media } : {}),
        metadata: { notes: COMPOSED_NOTE, entityId },
      },
      authoring: {
        concept: visual!.concept,
        answerBasis: 'reasoning',
        playerReasoningStrategy:
          visual!.familyKey === 'colour-recall'
            ? 'Hold the colour in mind while it is shown, then find it again on the colour slider.'
            : 'Judge the drawn share by eye and place the mark at the same share of the slider.',
        domainDescription:
          visual!.familyKey === 'colour-recall'
            ? 'a hue on the colour wheel, 0 to 360'
            : 'a share of the whole, 0 to 100',
        stepsFromMin: visual!.value,
        // What the screen and a reviewer read to know this item has no
        // author, and whether its picture exists.
        composedVisual,
      },
      ...(governed ?? {}),
    };
  }
}
