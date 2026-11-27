import { ConfigService } from '@nestjs/config';
import { composeDifference } from '../domain/composed-difference';
import { DifferenceSceneService } from './difference-scene.service';

// The image library ships one native binary per platform. A machine without
// the one for its own platform cannot run this, and says so by skipping.
const native = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    return require('sharp') as typeof import('sharp');
  } catch {
    return undefined;
  }
})();
const sharp = native!;
const describeNative = native ? describe : describe.skip;

const square = (body: string) =>
  sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="768"><rect width="768" height="768" fill="#BFE6FA"/><rect x="600" y="40" width="80" height="80" fill="#1B1F3B"/>${body}</svg>`,
    ),
  )
    .png()
    .toBuffer();
const asUrl = (png: Buffer) =>
  `data:image/png;base64,${png.toString('base64')}`;

const build = async (
  options: {
    edited?: string;
    verdict?: { inFirst: boolean; inSecond: boolean };
    noModel?: boolean;
    noVision?: boolean;
    editModel?: string;
    store?: { get: jest.Mock; put: jest.Mock };
  } = {},
) => {
  const original = await square(
    '<rect x="100" y="300" width="160" height="160" fill="#D8493F"/>',
  );
  const edited = await square(options.edited ?? '');
  const settings: Record<string, string> = {
    ...(options.noModel
      ? {}
      : { ENGINE_IMAGE_MODEL: 'google/gemini-3.1-flash-image' }),
    ...(options.noVision
      ? {}
      : { ENGINE_MEDIA_VISION_MODEL: 'openai/gpt-5-mini' }),
    ...(options.editModel
      ? { ENGINE_IMAGE_EDIT_MODEL: options.editModel }
      : {}),
    ENGINE_PROVIDER_NAME: 'openrouter',
  };
  const budget = {
    reserve: jest.fn(async () => ({ reservedMicros: 1 })),
    settle: jest.fn(async () => ({})),
  };
  const provider = {
    generateText: jest.fn(async (request: Record<string, unknown>) => {
      if (request.responseSchema)
        return {
          text: JSON.stringify(
            options.verdict ?? { inFirst: true, inSecond: false },
          ),
          provider: 'openrouter',
          model: 'm',
          durationMs: 1,
        };
      const images = request.images as string[] | undefined;
      return {
        text: '',
        provider: 'openrouter',
        model: 'm',
        durationMs: 1,
        images: [asUrl(images?.length ? edited : original)],
        usage: { promptTokens: 10, completionTokens: 1290 },
      };
    }),
  };
  const service = new DifferenceSceneService(
    budget as never,
    { get: (key: string) => settings[key] } as unknown as ConfigService,
    provider as never,
    options.store as never,
  );
  return { service, budget, provider };
};

const request = composeDifference('job:0', 'went-missing').request;

describeNative('DifferenceSceneService', () => {
  it('draws, takes the thing out, checks it and lays the pair side by side', async () => {
    const { service, budget, provider } = await build();
    const outcome = await service.draw({ jobId: 'job', itemKey: '0', request });
    expect(outcome.status).toBe('drawn');
    if (outcome.status !== 'drawn') return;
    expect(outcome.check).toBe('confirmed');
    expect(outcome.attempts).toBe(1);
    const meta = await sharp(outcome.png).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 675]);
    // draw + edit + check, each reserved before and settled after.
    expect(provider.generateText).toHaveBeenCalledTimes(3);
    expect(budget.reserve).toHaveBeenCalledTimes(3);
    expect(budget.settle).toHaveBeenCalledTimes(3);
    const stages = budget.reserve.mock.calls.map(
      (call) => (call as unknown as [{ stage: string }])[0].stage,
    );
    expect(stages).toEqual([
      'difference_image',
      'difference_image',
      'difference_check',
    ]);
  });

  it('asks for a square picture and sends the original to the edit', async () => {
    const { service, provider } = await build();
    await service.draw({ jobId: 'job', itemKey: '0', request });
    const [draw, edit] = provider.generateText.mock.calls.map(
      (call) => (call as unknown as [Record<string, unknown>])[0],
    );
    expect(draw.outputImage).toEqual({ aspectRatio: '1:1' });
    expect(draw.images).toBeUndefined();
    expect(draw.prompt).toBe(request.drawPrompt);
    expect((edit.images as string[])[0]).toMatch(/^data:image\/png;base64,/);
    expect(edit.prompt).toBe(request.editPrompt);
  });

  it('tries the edit again, then gives up, when the vision model disagrees', async () => {
    const { service, provider } = await build({
      verdict: { inFirst: true, inSecond: true },
    });
    const outcome = await service.draw({ jobId: 'job', itemKey: '1', request });
    expect(outcome).toEqual({
      status: 'failed',
      failureReason: 'DIFFERENCE_NOT_THE_THING_ASKED',
    });
    // draw once, edit and check twice.
    expect(provider.generateText).toHaveBeenCalledTimes(5);
  });

  it('refuses an edit that changed nothing visible', async () => {
    const { service } = await build({
      edited: '<rect x="100" y="300" width="160" height="160" fill="#D8493F"/>',
    });
    const outcome = await service.draw({ jobId: 'job', itemKey: '2', request });
    expect(outcome).toEqual({
      status: 'failed',
      failureReason: 'DIFFERENCE_TOO_SMALL',
    });
  });

  it('draws a scene once: the next item about it reuses the drawing', async () => {
    const kept = new Map<string, Buffer>();
    const store = {
      get: jest.fn(async (key: string) => kept.get(key)),
      put: jest.fn(async (key: string, _model: string, png: Buffer) => {
        kept.set(key, png);
      }),
    };
    const { service, provider } = await build({ store });
    const first = await service.draw({ jobId: 'job', itemKey: '0', request });
    expect(first.status === 'drawn' && first.sceneReused).toBe(false);
    expect(store.put).toHaveBeenCalledTimes(1);
    expect([...kept.keys()][0]).toBe(
      `${request.sceneDrawingKey}:google/gemini-3.1-flash-image`,
    );
    provider.generateText.mockClear();
    const second = await service.draw({ jobId: 'job2', itemKey: '0', request });
    expect(second.status === 'drawn' && second.sceneReused).toBe(true);
    // No drawing this time: the edit and the check only.
    expect(provider.generateText).toHaveBeenCalledTimes(2);
    expect(store.put).toHaveBeenCalledTimes(1);
  });

  it('takes the thing out with the edit model when one is set', async () => {
    const { service, provider } = await build({ editModel: 'cheap/edit' });
    await service.draw({ jobId: 'job', itemKey: '0', request });
    const models = provider.generateText.mock.calls.map(
      (call) => (call as unknown as [{ model: string }])[0].model,
    );
    expect(models.slice(0, 2)).toEqual([
      'google/gemini-3.1-flash-image',
      'cheap/edit',
    ]);
  });

  it('is unchecked, not confirmed, without a vision model', async () => {
    const { service } = await build({ noVision: true });
    const outcome = await service.draw({ jobId: 'job', itemKey: '3', request });
    expect(outcome.status === 'drawn' && outcome.check).toBe('unchecked');
  });

  it('makes no call without an image model', async () => {
    const { service, provider, budget } = await build({ noModel: true });
    const outcome = await service.draw({ jobId: 'job', itemKey: '4', request });
    expect(outcome).toEqual({
      status: 'failed',
      failureReason: 'DIFFERENCE_IMAGE_MODEL_NOT_CONFIGURED',
    });
    expect(provider.generateText).not.toHaveBeenCalled();
    expect(budget.reserve).not.toHaveBeenCalled();
  });

  it('makes no call it could not reserve', async () => {
    const { service, provider, budget } = await build();
    budget.reserve.mockRejectedValueOnce(new Error('PRICING_UNAVAILABLE'));
    const outcome = await service.draw({ jobId: 'job', itemKey: '5', request });
    expect(outcome).toEqual({
      status: 'failed',
      failureReason: 'DIFFERENCE_IMAGE_NOT_AFFORDABLE',
    });
    expect(provider.generateText).not.toHaveBeenCalled();
  });
});
