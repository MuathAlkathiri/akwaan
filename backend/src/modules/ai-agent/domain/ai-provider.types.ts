export interface AiTextGenerationRequest {
  model?: string;
  promptVersion?: string;
  systemInstruction?: string;
  prompt: string;
  /**
   * Pictures the model should look at alongside the prompt: https or data
   * URLs. `imageDetail` trades reading small text for cost; `low` is a fixed,
   * small charge per image.
   */
  images?: string[];
  imageDetail?: 'low' | 'high' | 'auto';
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
