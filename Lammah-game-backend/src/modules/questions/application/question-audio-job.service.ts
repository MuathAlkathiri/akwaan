import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { QuestionAudioProcessingService } from './question-audio-processing.service';
import { QuestionAudioJob } from './question-audio-job.types';

/** Small in-process job boundary; replaceable by BullMQ without changing callers. */
@Injectable()
export class QuestionAudioJobService {
  private readonly logger = new Logger(QuestionAudioJobService.name);
  private readonly active = new Set<string>();

  constructor(private readonly processor: QuestionAudioProcessingService) {}

  enqueue(job: QuestionAudioJob): boolean {
    const processingJob = { ...job, jobId: job.jobId ?? randomUUID() };
    const key = this.key(processingJob);
    if (this.active.has(key)) return false;
    this.active.add(key);
    setImmediate(() => {
      void this.processor
        .process(processingJob)
        .catch((error: unknown) =>
          this.logger.error(
            JSON.stringify({
              event: 'media.lifecycle.job-failed',
              questionId: processingJob.questionId,
              candidateId: processingJob.candidateId ?? null,
              processingJobId: processingJob.jobId,
              errorType:
                error instanceof Error ? error.constructor.name : typeof error,
              caughtError:
                error instanceof Error
                  ? error.message.slice(0, 300)
                  : String(error).slice(0, 300),
            }),
          ),
        )
        .finally(() => this.active.delete(key));
    });
    return true;
  }

  private key(job: QuestionAudioJob): string {
    return [
      job.questionId,
      job.requestVersion,
      job.requestHash,
      job.mode,
      job.candidateId ?? '',
    ].join(':');
  }
}
