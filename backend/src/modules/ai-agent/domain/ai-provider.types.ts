export interface AiTextGenerationRequest {
  model?: string;
  promptVersion?: string;
  systemInstruction?: string;
  prompt: string;
  temperature?: number;
  omitTemperature?: boolean;
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | null;
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
