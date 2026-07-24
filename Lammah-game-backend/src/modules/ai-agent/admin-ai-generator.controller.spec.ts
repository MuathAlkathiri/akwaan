import { AdminAiGeneratorController } from './admin-ai-generator.controller';
import { WigoloClient } from './infrastructure/wigolo/wigolo-client';

describe('AdminAiGeneratorController Wigolo health', () => {
  const create = (readiness: jest.MockedFunction<WigoloClient['readiness']>) =>
    new AdminAiGeneratorController(
      { readiness } as unknown as WigoloClient,
      { get: () => 'false' } as never,
    );

  it('returns ready status with safe runtime fields', async () => {
    const controller = create(
      jest.fn().mockResolvedValue({
        provider: 'wigolo',
        enabled: true,
        status: 'READY',
        version: '0.2.0',
        installationType: 'project-local',
        transport: 'stdio',
        requiredToolsAvailable: true,
        cacheAvailable: true,
        lastCheckedAt: '2026-07-17T00:00:00.000Z',
        issueCodes: [],
      }),
    );

    await expect(controller.wigoloHealth()).resolves.toEqual({
      provider: 'wigolo',
      enabled: true,
      status: 'READY',
      version: '0.2.0',
      installationType: 'project-local',
      transport: 'stdio',
      requiredToolsAvailable: true,
      cacheAvailable: true,
      lastCheckedAt: '2026-07-17T00:00:00.000Z',
      issueCodes: [],
    });
  });

  it('reports degraded when a required tool is missing', async () => {
    const controller = create(
      jest.fn().mockResolvedValue({
        provider: 'wigolo',
        enabled: true,
        status: 'DEGRADED',
        requiredToolsAvailable: false,
        cacheAvailable: true,
        lastCheckedAt: '2026-07-17T00:00:00.000Z',
        issueCodes: ['WIGOLO_REQUIRED_TOOL_MISSING'],
      }),
    );

    await expect(controller.wigoloHealth()).resolves.toMatchObject({
      status: 'DEGRADED',
      issueCodes: ['WIGOLO_REQUIRED_TOOL_MISSING'],
    });
  });

  it('reports unavailable without exposing commands, paths, env values, or raw payloads', async () => {
    const controller = create(
      jest.fn().mockResolvedValue({
        provider: 'wigolo',
        enabled: true,
        status: 'UNAVAILABLE',
        requiredToolsAvailable: false,
        cacheAvailable: false,
        lastCheckedAt: '2026-07-17T00:00:00.000Z',
        issueCodes: ['WIGOLO_OPERATION_FAILED'],
      }),
    );

    const result = await controller.wigoloHealth();
    const serialized = JSON.stringify(result);
    expect(result.status).toBe('UNAVAILABLE');
    expect(serialized).not.toMatch(/command|args|\/Users|HOME=|content/);
  });

  it('caches the health response briefly', async () => {
    const readiness = jest.fn().mockResolvedValue({
      provider: 'wigolo',
      enabled: true,
      status: 'READY',
      requiredToolsAvailable: true,
      cacheAvailable: true,
      lastCheckedAt: '2026-07-17T00:00:00.000Z',
      issueCodes: [],
    });
    const controller = create(readiness);

    await controller.wigoloHealth();
    await controller.wigoloHealth();

    expect(readiness).toHaveBeenCalledTimes(1);
  });

  it('returns a structured 503 for the retired generation workflow', async () => {
    const controller = new AdminAiGeneratorController(
      {} as WigoloClient,
      { get: () => 'false' } as never,
    );

    await expect(controller.generateReviewed({})).rejects.toThrow(
      'AI question generation is currently disabled.',
    );
  });
});
