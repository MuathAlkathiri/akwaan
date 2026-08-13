export enum AudioRetryMode {
  RESEARCH = 'research',
  RETRY_PROCESSING = 'retryProcessing',
}

export interface QuestionAudioJob {
  jobId?: string;
  questionId: string;
  requestVersion: number;
  requestHash: string;
  mode: AudioRetryMode;
  candidateId?: string;
}
