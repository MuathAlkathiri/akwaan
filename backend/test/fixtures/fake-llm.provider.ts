import { LlmClientService } from '../../src/modules/ai-agent/infrastructure/ai/llm-client.service';

export class FakeLlmProvider implements Pick<
  LlmClientService,
  'complete' | 'completeJson'
> {
  readonly calls: Array<{
    method: 'complete' | 'completeJson';
    prompt: string;
    temperature?: number;
  }> = [];

  constructor(private readonly responses: unknown[] = []) {}

  enqueue(...responses: unknown[]) {
    this.responses.push(...responses);
  }

  reset() {
    this.responses.length = 0;
    this.calls.length = 0;
  }

  async complete(prompt: string, temperature?: number): Promise<string> {
    this.calls.push({ method: 'complete', prompt, temperature });
    const response = this.next();
    if (response instanceof Error) throw response;
    return typeof response === 'string' ? response : JSON.stringify(response);
  }

  async completeJson<T>(prompt: string, temperature?: number): Promise<T> {
    this.calls.push({ method: 'completeJson', prompt, temperature });
    const response = this.next();
    if (response instanceof Error) throw response;
    if (typeof response === 'string') return JSON.parse(response) as T;
    return response as T;
  }

  private next() {
    if (this.responses.length === 0)
      throw new Error('Fake LLM response queue is empty');
    return this.responses.shift();
  }
}
