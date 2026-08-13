export type AgentExecutionContext = {
  categoryId?: string;
  catalogId?: string;
  knowledgeFile?: string;
  language: 'ar' | 'en';
  difficulty?: 'easy' | 'medium' | 'hard';
  modelConfig?: { temperature?: number };
};

export interface LlmAgent<TInput, TOutput> {
  readonly name: string;
  execute(input: TInput, context: AgentExecutionContext): Promise<TOutput>;
}

export type AgentTrace = {
  agent: string;
  status: 'completed' | 'failed' | 'fallback';
  durationMs: number;
  reason?: string;
};
