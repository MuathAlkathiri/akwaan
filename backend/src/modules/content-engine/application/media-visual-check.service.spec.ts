import { MediaVisualCheckService } from './media-visual-check.service';

const config = (values: Record<string, string>) => ({
  get: (key: string) => values[key],
});

const ON = {
  CONTENT_ENGINE_ENABLED: 'true',
  ENGINE_MEDIA_ENRICHMENT_ENABLED: 'true',
  ENGINE_MEDIA_VISION_CHECK_ENABLED: 'true',
  ENGINE_PROVIDER_NAME: 'openrouter',
  ENGINE_QUALITY_MODEL: 'openai/gpt-4o-mini',
};

const request = {
  jobId: 'job-1',
  reservationKey: 'cand-1:item-image:abc',
  imageUrl: 'https://img.example/crest.png',
  question: 'وش اسم هذا النادي؟',
  acceptedAnswers: ['كريستال بالاس', 'Crystal Palace'],
  mustNotShow: ['club name spelled out in the badge'],
};

const build = (
  options: {
    values?: Record<string, string>;
    reply?: unknown;
    fail?: Error & { definitelyNotBilled?: boolean };
    reserveFails?: boolean;
  } = {},
) => {
  const budget = {
    reserve: jest.fn(async () => {
      if (options.reserveFails) throw new Error('BATCH_CAP_EXCEEDED');
    }),
    settle: jest.fn(async () => undefined),
  };
  const provider = {
    generateText: jest.fn(async () => {
      if (options.fail) throw options.fail;
      return {
        text:
          typeof options.reply === 'string'
            ? options.reply
            : JSON.stringify(
                options.reply ?? {
                  readableText: '',
                  leaks: false,
                  reason: 'no text',
                },
              ),
        usage: { promptTokens: 2900, completionTokens: 30 },
      };
    }),
  };
  const service = new MediaVisualCheckService(
    budget as never,
    config(options.values ?? ON) as never,
    provider as never,
  );
  return { service, budget, provider };
};

describe('MediaVisualCheckService', () => {
  it('is off unless enrichment and its own switch are both on', () => {
    expect(build().service.isAvailable()).toBe(true);
    expect(
      build({
        values: { ...ON, ENGINE_MEDIA_VISION_CHECK_ENABLED: 'false' },
      }).service.isAvailable(),
    ).toBe(false);
    expect(
      build({
        values: { ...ON, ENGINE_MEDIA_ENRICHMENT_ENABLED: 'false' },
      }).service.isAvailable(),
    ).toBe(false);
  });

  it('makes no call and reserves nothing while off', async () => {
    const { service, budget, provider } = build({
      values: { ...ON, ENGINE_MEDIA_VISION_CHECK_ENABLED: '' },
    });
    expect(await service.check(request)).toEqual({ status: 'unchecked' });
    expect(budget.reserve).not.toHaveBeenCalled();
    expect(provider.generateText).not.toHaveBeenCalled();
  });

  it('shows the model the image, the question, the answers and what must not appear', async () => {
    const { service, provider, budget } = build();
    expect(await service.check(request)).toEqual({ status: 'clear' });
    const [sent] = provider.generateText.mock.calls[0] as unknown as [
      Record<string, any>,
    ];
    expect(sent.model).toBe('openai/gpt-4o-mini');
    expect(sent.images).toEqual(['https://img.example/crest.png']);
    expect(sent.imageDetail).toBe('low');
    expect(sent.prompt).toContain('وش اسم هذا النادي؟');
    expect(sent.prompt).toContain('Crystal Palace');
    expect(sent.prompt).toContain('club name spelled out in the badge');
    expect(budget.reserve).toHaveBeenCalledWith(
      expect.objectContaining({
        reservationId: 'job-1:media-vision:cand-1:item-image:abc',
        stage: 'media_vision',
        model: 'openai/gpt-4o-mini',
      }),
    );
    expect(budget.settle).toHaveBeenCalledWith({
      reservationId: 'job-1:media-vision:cand-1:item-image:abc',
      usage: { promptTokens: 2900, completionTokens: 30 },
    });
  });

  it('reports a leak with what was read', async () => {
    const { service } = build({
      reply: {
        readableText: 'CRYSTAL PALACE F.C.',
        leaks: true,
        reason: 'The ribbon spells the club name.',
      },
    });
    expect(await service.check(request)).toEqual({
      status: 'leaks',
      evidence: 'CRYSTAL PALACE F.C. — The ribbon spells the club name.',
    });
  });

  it.each([
    ['an unparseable reply', { reply: 'not json' }],
    ['a reply with no verdict', { reply: { readableText: 'x' } }],
    ['a provider failure', { fail: new Error('timeout') }],
    ['a refused budget reservation', { reserveFails: true }],
  ])('answers unchecked, never clear, on %s', async (_name, options) => {
    const { service } = build(options);
    expect(await service.check(request)).toEqual({ status: 'unchecked' });
  });

  it('settles a failed call so the reservation is not left open', async () => {
    const rejected = Object.assign(new Error('400'), {
      definitelyNotBilled: true,
    });
    const { service, budget } = build({ fail: rejected });
    await service.check(request);
    expect(budget.settle).toHaveBeenCalledWith({
      reservationId: 'job-1:media-vision:cand-1:item-image:abc',
      providerRejected: true,
    });
  });

  it('prefers a dedicated vision model when one is configured', async () => {
    const { service, provider } = build({
      values: { ...ON, ENGINE_MEDIA_VISION_MODEL: 'google/gemini-flash' },
    });
    await service.check(request);
    expect(
      (provider.generateText.mock.calls[0] as unknown as [{ model: string }])[0]
        .model,
    ).toBe('google/gemini-flash');
  });
});
