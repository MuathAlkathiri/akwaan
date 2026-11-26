import { Injectable, Optional } from '@nestjs/common';
import {
  ComposedVisualFamily,
  composeVisual,
} from '../domain/composed-visuals';
import { EngineImageIngestionService } from '../infrastructure/engine-image-ingestion.service';
import { SvgRasterizer } from '../infrastructure/svg-rasterizer';

export const COMPOSED_VISUAL_PROVIDER = 'akwaan-composer';

export interface ComposedCandidate {
  draft: Record<string, unknown>;
  factualClaims: string[];
  authoring: Record<string, unknown>;
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
    familyKey: ComposedVisualFamily,
    seed: string,
  ): Promise<ComposedCandidate> {
    const visual = composeVisual(familyKey, seed);
    let media: Record<string, unknown> | undefined;
    let failureReason: string | undefined;

    if (!this.rasterizer || !this.ingestion) {
      failureReason = 'COMPOSED_VISUAL_NOT_CONFIGURED';
    } else {
      try {
        const stored = await this.ingestion.ingestBytes({
          bytes: await this.rasterizer.toPng(visual.svg),
          acquisition: 'generate',
          provenance: {
            provider: COMPOSED_VISUAL_PROVIDER,
            licenceNote: 'Drawn by the Akwaan engine; no third-party source.',
          },
        });
        if (stored.status === 'resolved') {
          media = {
            type: 'image',
            assets: [{ url: stored.asset.url, altText: visual.altText }],
          };
        } else {
          failureReason = stored.failureReason;
        }
      } catch (error) {
        failureReason =
          (error as { code?: string })?.code ??
          'COMPOSED_VISUAL_RASTERIZATION_FAILED';
      }
    }

    return {
      factualClaims: [visual.factualClaim],
      draft: {
        prompt: { ar: visual.prompt },
        answerPayload: { mode: 'closest', correctValue: visual.value },
        mechanicPayload: { closestSlider: visual.slider },
        ...(media ? { media } : {}),
        metadata: {
          notes: 'Composed by the engine: picture and answer share one value.',
        },
      },
      authoring: {
        concept: visual.concept,
        answerBasis: 'reasoning',
        playerReasoningStrategy:
          visual.familyKey === 'colour-recall'
            ? 'Hold the colour in mind while it is shown, then find it again on the colour slider.'
            : 'Judge the drawn share by eye and place the mark at the same share of the slider.',
        domainDescription:
          visual.familyKey === 'colour-recall'
            ? 'a hue on the colour wheel, 0 to 360'
            : 'a share of the whole, 0 to 100',
        stepsFromMin: visual.value,
        // What the screen and a reviewer read to know this item has no
        // author, and whether its picture exists.
        composedVisual: {
          familyKey: visual.familyKey,
          variant: visual.variant,
          value: visual.value,
          ...(failureReason ? { failureReason } : {}),
        },
      },
    };
  }
}
