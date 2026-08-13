export type AiProviderErrorCode =
  | 'AI_PROVIDER_DISABLED'
  | 'AI_PROVIDER_AUTHENTICATION_FAILED'
  | 'AI_PROVIDER_RATE_LIMITED'
  | 'AI_PROVIDER_TIMEOUT'
  | 'AI_PROVIDER_SAFETY_REFUSAL'
  | 'AI_PROVIDER_EMPTY_RESPONSE'
  | 'AI_PROVIDER_INVALID_RESPONSE'
  | 'AI_PROVIDER_REQUEST_FAILED';

export class AiProviderError extends Error {
  constructor(
    readonly code: AiProviderErrorCode,
    message: string,
    readonly provider: string,
    readonly model: string,
    readonly details?: Record<string, unknown>,
    options?: { cause?: unknown },
  ) {
    super(message);
    if (options?.cause !== undefined)
      Object.defineProperty(this, 'cause', {
        value: options.cause,
        configurable: true,
      });
    this.name = 'AiProviderError';
  }
}
