export interface AiTextGenerationRequest {
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  maxOutputTokens?: number;
  responseSchema?: Record<string, unknown>;
  timeoutMs?: number;
}

export interface AiTextGenerationResult {
  text: string;
  provider: string;
  model: string;
  durationMs: number;
  diagnostics?: Record<string, unknown>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}
