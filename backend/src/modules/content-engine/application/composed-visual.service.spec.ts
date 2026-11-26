import { createHash } from 'crypto';
import { ComposedVisualService } from './composed-visual.service';
import {
  COMPOSED_PUZZLE_FAMILIES,
  COMPOSED_PUZZLE_VARIANTS,
  composePuzzle,
} from '../domain/composed-puzzles';
import { evaluateCandidateMedia } from '../domain/candidate-media-plan';
import { composeVisual } from '../domain/composed-visuals';
import { DeterministicScreenService } from './deterministic-screen.service';
import { ConfigService } from '@nestjs/config';

const resolved = (url = 'https://cdn.example/engine-abc.png') => ({
  status: 'resolved' as const,
  asset: { url, mimetype: 'image/png', width: 1200, height: 675, sha256: 'a' },
  provenance: { acquisition: 'generate' as const, provider: 'akwaan-composer' },
  rights: { status: 'UNKNOWN' as const, source: 'unrecorded' as const },
  storage: { objectKey: 'k', mirrored: true, reusedLocalFile: false },
});

const build = (over: { png?: jest.Mock; ingest?: jest.Mock } = {}) => {
  const png = over.png ?? jest.fn(async () => Buffer.from('png'));
  const ingest = over.ingest ?? jest.fn(async () => resolved());
  return {
    png,
    ingest,
    service: new ComposedVisualService(
      { toPng: png } as never,
      { ingestBytes: ingest } as never,
    ),
  };
};

const blockingCodes = (candidate: {
  draft: Record<string, unknown>;
  authoring: Record<string, unknown>;
}) =>
  new DeterministicScreenService({
    get: () => undefined,
  } as unknown as ConfigService)
    .screen(candidate.draft, candidate.authoring, { worldKey: 'puzzles' })
    .findings.filter((finding) => finding.severity === 'blocking')
    .map((finding) => finding.code);

describe('ComposedVisualService', () => {
  it('authors the whole candidate from one value', async () => {
    const { service, png, ingest } = build();
    const expected = composeVisual('battery-level', 'job-1:2');

    const candidate = await service.compose('battery-level', 'job-1:2');

    expect(png).toHaveBeenCalledWith(expected.svg);
    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        acquisition: 'generate',
        provenance: expect.objectContaining({ provider: 'akwaan-composer' }),
      }),
    );
    expect(candidate.draft).toMatchObject({
      prompt: { ar: expected.prompt },
      answerPayload: { mode: 'closest', correctValue: expected.value },
      mechanicPayload: {
        closestSlider: {
          mode: 'between-anchors',
          min: 0,
          max: 100,
          step: 1,
          leftAnchor: 'فاضية',
          rightAnchor: 'مليانة',
        },
      },
      media: {
        type: 'image',
        assets: [
          {
            url: 'https://cdn.example/engine-abc.png',
            altText: expected.altText,
          },
        ],
      },
    });
    expect(candidate.authoring.composedVisual).toEqual({
      familyKey: 'battery-level',
      variant: expected.variant,
      value: expected.value,
    });
    expect(candidate.factualClaims).toEqual([expected.factualClaim]);
  });

  it('passes the screen when its picture exists', async () => {
    const { service } = build();
    for (const familyKey of [
      'battery-level',
      'copy-the-mark',
      'colour-recall',
    ] as const) {
      expect(
        blockingCodes(await service.compose(familyKey, 'job-1:0')),
      ).toEqual([]);
    }
  });

  it.each([
    [
      'the drawing fails',
      {
        png: jest.fn(async () =>
          Promise.reject(
            Object.assign(new Error('no binary'), {
              code: 'COMPOSED_VISUAL_RASTERIZATION_FAILED',
            }),
          ),
        ),
      },
      'COMPOSED_VISUAL_RASTERIZATION_FAILED',
    ],
    [
      'storage refuses it',
      {
        ingest: jest.fn(async () => ({
          status: 'failed',
          failureReason: 'OBJECT_STORAGE_REQUIRED',
          detail: 'x',
        })),
      },
      'OBJECT_STORAGE_REQUIRED',
    ],
  ])(
    'keeps the candidate and says why when %s',
    async (_name, over, reason) => {
      const { service } = build(over as never);
      const candidate = await service.compose('copy-the-mark', 'job-1:1');
      expect(candidate.draft).not.toHaveProperty('media');
      expect(candidate.authoring.composedVisual).toMatchObject({
        failureReason: reason,
      });
      expect(blockingCodes(candidate)).toContain('COMPOSED_VISUAL_MISSING');
    },
  );

  it('is blocked, not silently text-only, when nothing can draw', async () => {
    const candidate = await new ComposedVisualService().compose(
      'battery-level',
      'job-1:0',
    );
    expect(candidate.authoring.composedVisual).toMatchObject({
      failureReason: 'COMPOSED_VISUAL_NOT_CONFIGURED',
    });
    expect(blockingCodes(candidate)).toContain('COMPOSED_VISUAL_MISSING');
  });

  it('treats two drawings of different values as different items, and the same value as a repeat', async () => {
    const { service } = build();
    const seeds = Array.from({ length: 40 }, (_, index) => `job-1:${index}`);
    const items = await Promise.all(
      seeds.map((seed) => service.compose('battery-level', seed)),
    );
    const first = items[0];
    const valueOf = (item: typeof first) =>
      (item.draft.answerPayload as { correctValue: number }).correctValue;
    const other = items.find((item) => valueOf(item) !== valueOf(first))!;
    const same = { ...first };
    const screenAgainst = (candidate: typeof first, held: typeof first) =>
      new DeterministicScreenService({
        get: () => undefined,
      } as unknown as ConfigService)
        .screen(candidate.draft, candidate.authoring, {
          worldKey: 'puzzles',
          scopeKey: 'numbers-estimation',
          historicalRecords: [
            {
              id: 'held-1',
              sourceType: 'CANONICAL_READY',
              worldKey: 'puzzles',
              scopeKey: 'numbers-estimation',
              draft: held.draft,
            },
          ],
        })
        .findings.filter((finding) => finding.severity === 'blocking')
        .map((finding) => finding.code);

    expect(screenAgainst(other, first)).toEqual([]);
    expect(screenAgainst(same, first)).toContain(
      'DUPLICATE_HISTORICAL_CONTENT',
    );
  });

  it('authors a colour question on the whole wheel, shown for a few seconds', async () => {
    const { service } = build();
    const candidate = await service.compose('colour-recall', 'job-1:4');
    const slider = (
      candidate.draft.mechanicPayload as { closestSlider: Record<string, any> }
    ).closestSlider;
    expect(slider).toMatchObject({ mode: 'colour-hue', min: 0, max: 360 });
    expect(slider.revealSeconds).toBeGreaterThanOrEqual(3);
    expect(slider.revealSeconds).toBeLessThanOrEqual(10);
    expect(
      (candidate.draft.answerPayload as { correctValue: number }).correctValue,
    ).toBeLessThan(360);
  });

  it('refuses a colour question nobody drew', () => {
    expect(
      blockingCodes({
        draft: {
          prompt: { ar: 'وش كان لون البالون في الصورة السابقة؟' },
          answerPayload: { mode: 'closest', correctValue: 120 },
          mechanicPayload: {
            closestSlider: { mode: 'colour-hue', min: 0, max: 360, step: 1 },
          },
        },
        authoring: {},
      }),
    ).toContain('CLOSEST_SLIDER_MODE_REQUIRED');
  });

  it('blocks a model-written item that landed on a composed slot', () => {
    expect(
      blockingCodes({
        draft: {
          prompt: { ar: 'كم نسبة شحن هذا الجوال تقريبًا؟' },
          answerPayload: { mode: 'closest', correctValue: 1 },
          mechanicPayload: {
            closestSlider: { mode: 'numeric-range', min: 0, max: 100, step: 1 },
          },
        },
        authoring: { assignedSlot: { familyKey: 'battery-level' } },
      }),
    ).toContain('COMPOSED_VISUAL_MISSING');
  });
});

describe('ComposedVisualService — drawn puzzles answered by choosing', () => {
  // Stores each drawing under its own content hash, as the real storage does.
  const contentAddressed = () => {
    const png = jest.fn(async (svg: string) => Buffer.from(svg));
    const ingest = jest.fn(async (input: { bytes: Buffer }) =>
      resolved(
        `https://cdn.example/engine-${createHash('sha256').update(input.bytes).digest('hex').slice(0, 16)}.png`,
      ),
    );
    return new ComposedVisualService(
      { toPng: png } as never,
      { ingestBytes: ingest } as never,
    );
  };
  const xoInPaths = { mechanicKey: 'moving-xo', scopeKey: 'paths-motion' };

  it('authors the question, three options and the answer from the drawing', async () => {
    const expected = composePuzzle('wire-trace-terminal', 'job-9:0');
    const candidate = await contentAddressed().compose(
      'wire-trace-terminal',
      'job-9:0',
      xoInPaths,
    );
    expect(candidate.draft).toMatchObject({
      prompt: { ar: expected.prompt },
      answerPayload: {
        mode: 'multiple_choice',
        options: expected.options.map((option) => ({
          id: option.id,
          label: { ar: option.label },
        })),
        correctOptionId: expected.correctOptionId,
      },
      media: { type: 'image' },
    });
    expect(candidate.authoring.distractorRationale).toEqual(
      expected.distractorRationale,
    );
    expect(candidate.authoring.composedVisual).toEqual({
      familyKey: 'wire-trace-terminal',
      variant: expected.variant,
      variantKey: expected.variantKey,
    });
  });

  it('authors a typed answer where the puzzle has no options, and إكس أو accepts it', async () => {
    const expected = composePuzzle('picture-initials', 'job-9:4', 'cipher');
    const candidate = await contentAddressed().compose(
      'picture-initials',
      'job-9:4',
      { mechanicKey: 'moving-xo', scopeKey: 'wordplay-letters' },
      'cipher',
    );
    expect(candidate.draft.answerPayload).toEqual({
      mode: 'match',
      acceptedAnswers: expected.acceptedAnswers,
    });
    // No contract governs a picture in this Scope: it rides on the draft.
    expect(candidate).not.toHaveProperty('mediaPlan');
    expect(candidate.draft).toHaveProperty('media');
    const screen = (mechanicKey: string) =>
      new DeterministicScreenService({
        get: () => undefined,
      } as unknown as ConfigService)
        .screen(candidate.draft, candidate.authoring, {
          worldKey: 'puzzles',
          mechanicKey,
        })
        .findings.filter((finding) => finding.severity === 'blocking')
        .map((finding) => finding.code);
    expect(screen('moving-xo')).toEqual([]);
    // الكومبو still asks for its stage: the typed path is إكس أو's alone.
    expect(screen('combo')).toContain('COMBO_STAGE_REQUIRED');
  });

  it('draws the template the slot was given', async () => {
    for (const variantKey of COMPOSED_PUZZLE_VARIANTS['wire-trace-terminal']) {
      const expected = composePuzzle(
        'wire-trace-terminal',
        'job-9:0',
        variantKey,
      );
      const candidate = await contentAddressed().compose(
        'wire-trace-terminal',
        'job-9:0',
        xoInPaths,
        variantKey,
      );
      expect(candidate.draft.prompt).toEqual({ ar: expected.prompt });
      expect(candidate.authoring.composedVisual).toMatchObject({ variantKey });
    }
  });

  it.each(
    COMPOSED_PUZZLE_FAMILIES.flatMap((familyKey) =>
      COMPOSED_PUZZLE_VARIANTS[familyKey].map(
        (variantKey) => [familyKey, variantKey] as const,
      ),
    ),
  )(
    '%s / %s passes the screen as an إكس أو item',
    async (familyKey, variantKey) => {
      const candidate = await contentAddressed().compose(
        familyKey,
        'job-9:1',
        {
          mechanicKey: 'moving-xo',
          scopeKey:
            familyKey === 'wire-trace-terminal'
              ? 'paths-motion'
              : ['opposite-cube-faces', 'fold-and-punch'].includes(familyKey)
                ? 'assembly-rotation'
                : 'observation-illusions',
        },
        variantKey,
      );
      expect(
        new DeterministicScreenService({
          get: () => undefined,
        } as unknown as ConfigService)
          .screen(candidate.draft, candidate.authoring, {
            worldKey: 'puzzles',
            mechanicKey: 'moving-xo',
          })
          .findings.filter((finding) => finding.severity === 'blocking')
          .map((finding) => finding.code),
      ).toEqual([]);
    },
  );

  it('enters its picture in the media plan where the contract asks for one, as ours', async () => {
    const candidate = await contentAddressed().compose(
      'wire-trace-terminal',
      'job-9:2',
      xoInPaths,
    );
    expect(candidate.mediaReviewRevision).toBe(1);
    expect(candidate.mediaPlan).toEqual([
      expect.objectContaining({
        slotKey: 'puzzle-image',
        status: 'resolved',
        rights: expect.objectContaining({ status: 'CLEARED' }),
        provenance: expect.objectContaining({
          acquisition: 'generate',
          provider: 'akwaan-composer',
        }),
      }),
    ]);
    // Drawn and owned: the only thing left is for a person to look at it.
    const readiness = evaluateCandidateMedia({
      ...xoInPaths,
      draft: candidate.draft,
      mediaPlan: candidate.mediaPlan,
      mediaReviewRevision: candidate.mediaReviewRevision,
    });
    expect(readiness.governed).toBe(true);
    expect(readiness.blockers.map((finding) => finding.code)).toEqual([
      'MEDIA_REVIEW_REQUIRED',
    ]);
  });

  it('leaves the media plan alone where no contract governs the picture', async () => {
    const candidate = await contentAddressed().compose(
      'battery-level',
      'job-9:3',
      {
        mechanicKey: 'closest',
        scopeKey: 'numbers-estimation',
      },
    );
    expect(candidate).not.toHaveProperty('mediaPlan');
    expect(candidate.draft).toHaveProperty('media');
  });

  it('tells two drawings apart even when the question and the answer read the same', async () => {
    const service = contentAddressed();
    const items = await Promise.all(
      Array.from({ length: 400 }, (_, index) =>
        service.compose(
          'wire-trace-terminal',
          `job-9:${index}`,
          xoInPaths,
          'which-start',
        ),
      ),
    );
    const said = (item: (typeof items)[number]) => {
      const payload = item.draft.answerPayload as {
        options: Array<{ id: string; label: { ar: string } }>;
        correctOptionId: string;
      };
      return JSON.stringify([
        item.draft.prompt,
        payload.options.find((option) => option.id === payload.correctOptionId)
          ?.label.ar,
      ]);
    };
    const sameWords = (a: (typeof items)[number], b: (typeof items)[number]) =>
      said(a) === said(b);
    // Some pair among them says the same words over two different drawings.
    const first = items.find((item) =>
      items.some(
        (other) =>
          other !== item &&
          sameWords(other, item) &&
          JSON.stringify(other.draft.media) !==
            JSON.stringify(item.draft.media),
      ),
    )!;
    expect(first).toBeDefined();
    const twin = items.find(
      (item) =>
        item !== first &&
        sameWords(item, first) &&
        JSON.stringify(item.draft.media) !== JSON.stringify(first.draft.media),
    )!;
    expect(twin).toBeDefined();
    const blocking = new DeterministicScreenService({
      get: () => undefined,
    } as unknown as ConfigService)
      .screen(twin.draft, twin.authoring, {
        worldKey: 'puzzles',
        scopeKey: 'paths-motion',
        mechanicKey: 'moving-xo',
        historicalRecords: [
          {
            id: 'held-1',
            sourceType: 'CANONICAL_READY',
            worldKey: 'puzzles',
            scopeKey: 'paths-motion',
            draft: first.draft,
          },
        ],
      })
      .findings.filter((finding) => finding.severity === 'blocking')
      .map((finding) => finding.code);
    expect(blocking).toEqual([]);
  });
});
