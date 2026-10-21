import type { AiProvider } from '../../ai-agent/domain/ai-provider.interface';
import type {
  AiTextGenerationRequest,
  AiTextGenerationResult,
} from '../../ai-agent/domain/ai-provider.types';

/**
 * A deterministic stand-in for a real provider.
 *
 * Exists so job and budget behaviour can be exercised — including the awkward
 * cases, timeout and silent usage — without a network call or a bill. It
 * implements the same `AiProvider` boundary the real providers do, so swapping
 * it in changes nothing structural.
 *
 * Test-only. It is never registered in the application module.
 */
export class FakeAiProvider implements AiProvider {
  readonly calls: AiTextGenerationRequest[] = [];

  constructor(
    private readonly behaviour: {
      text?: string | ((request: AiTextGenerationRequest) => string);
      model?: string;
      /** Omit to simulate a provider that reports no usage at all. */
      usage?: AiTextGenerationResult['usage'];
      /** Throw instead of returning, to simulate an ambiguous timeout. */
      timeout?: boolean | ((request: AiTextGenerationRequest) => boolean);
    } = {},
  ) {}

  async generateText(
    request: AiTextGenerationRequest,
  ): Promise<AiTextGenerationResult> {
    this.calls.push(request);
    const timesOut =
      typeof this.behaviour.timeout === 'function'
        ? this.behaviour.timeout(request)
        : this.behaviour.timeout;
    if (timesOut) {
      throw new Error('fake-provider: simulated timeout with unknown billing');
    }
    const text =
      typeof this.behaviour.text === 'function'
        ? this.behaviour.text(request)
        : this.behaviour.text;
    return {
      text: text ?? '{"ok":true}',
      provider: 'fake',
      model: this.behaviour.model ?? 'fake-model',
      durationMs: 1,
      ...(this.behaviour.usage ? { usage: this.behaviour.usage } : {}),
    };
  }
}
