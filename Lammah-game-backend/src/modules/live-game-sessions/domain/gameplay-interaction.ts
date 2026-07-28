import { randomUUID } from 'crypto';
import {
  GameplayCommandPayload,
  GameplayModeState,
} from './gameplay-mode.plugin';
import { LiveSessionDomainError } from './live-session.errors';

export type GameplayInteractionStatus =
  | 'prepared'
  | 'open'
  | 'closed'
  | 'adjudicating'
  | 'resolved'
  | 'cancelled'
  | 'expired';
export type GameplaySubmissionStatus =
  | 'received'
  | 'pending-adjudication'
  | 'accepted'
  | 'rejected'
  | 'superseded'
  | 'withdrawn'
  | 'expired';
export type InteractionVisibility =
  | 'public'
  | 'host-only'
  | 'active-team'
  | 'submitting-participant'
  | 'after-close'
  | 'after-resolution';

export interface GameplayPromptState {
  id: string;
  type: string;
  schemaVersion: number;
  publicPayload: GameplayModeState;
  participantPayload: GameplayModeState;
  hostPayload: GameplayModeState;
  internalPayload: GameplayModeState;
  visibility: InteractionVisibility;
  metadata: GameplayModeState;
  preparedAt: Date;
  visibleFrom?: Date;
  deadlineAt?: Date;
}

export interface GameplaySubmissionState {
  id: string;
  participantId: string;
  teamId?: string;
  type: string;
  schemaVersion: number;
  payload: GameplayCommandPayload;
  receivedAt: Date;
  clientTimestamp?: string;
  requestId: string;
  status: GameplaySubmissionStatus;
  reasonCode?: string;
  privateMetadata?: GameplayModeState;
  resultVisibility: InteractionVisibility;
}

export interface GameplayOutcomeState {
  type: string;
  schemaVersion: number;
  publicPayload: GameplayModeState;
  teamPayload: GameplayModeState;
  participantPayload: GameplayModeState;
  hostPayload: GameplayModeState;
  privatePayload: GameplayModeState;
  completionReason: string;
  selectedSubmissionIds: string[];
}

export interface GameplayInteractionState {
  id: string;
  roundId: string;
  revision: number;
  status: GameplayInteractionStatus;
  prompt: GameplayPromptState;
  submissions: GameplaySubmissionState[];
  processedRequestIds: string[];
  history: Array<{ revision: number; type: string; timestamp: Date }>;
  outcome?: GameplayOutcomeState;
  preparedAt: Date;
  openedAt?: Date;
  closedAt?: Date;
  resolvedAt?: Date;
  cancelledAt?: Date;
  expiredAt?: Date;
}

const MAX_SUBMISSIONS = 100;
const MAX_REQUESTS = 100;
const MAX_HISTORY = 100;

export class GameplayInteraction {
  private constructor(private readonly state: GameplayInteractionState) {}

  static prepare(input: {
    roundId: string;
    prompt: Omit<GameplayPromptState, 'id' | 'preparedAt'>;
    now: Date;
  }): GameplayInteraction {
    return new GameplayInteraction({
      id: randomUUID(),
      roundId: input.roundId,
      revision: 1,
      status: 'prepared',
      prompt: {
        ...input.prompt,
        id: randomUUID(),
        preparedAt: input.now,
      },
      submissions: [],
      processedRequestIds: [],
      history: [
        { revision: 1, type: 'interaction-prepared', timestamp: input.now },
      ],
      preparedAt: input.now,
    });
  }

  static restore(state: GameplayInteractionState): GameplayInteraction {
    return new GameplayInteraction({
      ...state,
      preparedAt: new Date(state.preparedAt),
      openedAt: state.openedAt ? new Date(state.openedAt) : undefined,
      closedAt: state.closedAt ? new Date(state.closedAt) : undefined,
      resolvedAt: state.resolvedAt ? new Date(state.resolvedAt) : undefined,
      cancelledAt: state.cancelledAt ? new Date(state.cancelledAt) : undefined,
      expiredAt: state.expiredAt ? new Date(state.expiredAt) : undefined,
      prompt: {
        ...state.prompt,
        preparedAt: new Date(state.prompt.preparedAt),
        visibleFrom: state.prompt.visibleFrom
          ? new Date(state.prompt.visibleFrom)
          : undefined,
        deadlineAt: state.prompt.deadlineAt
          ? new Date(state.prompt.deadlineAt)
          : undefined,
      },
      submissions: state.submissions.map((submission) => ({
        ...submission,
        receivedAt: new Date(submission.receivedAt),
      })),
      history: state.history.map((entry) => ({
        ...entry,
        timestamp: new Date(entry.timestamp),
      })),
    });
  }

  get id() {
    return this.state.id;
  }
  get revision() {
    return this.state.revision;
  }
  get status() {
    return this.state.status;
  }

  assertRevision(expected: number): void {
    if (expected !== this.state.revision) {
      throw new LiveSessionDomainError(
        'STALE_INTERACTION_REVISION',
        `Expected interaction revision ${expected}, found ${this.state.revision}`,
      );
    }
  }

  isDuplicate(requestId: string): boolean {
    return this.state.processedRequestIds.includes(requestId);
  }

  open(now: Date): void {
    this.assertStatus(['prepared']);
    this.assertNotPastDeadline(now);
    this.state.status = 'open';
    this.state.openedAt = now;
    this.transition('interaction-opened', now);
  }

  close(now: Date): void {
    this.assertStatus(['open']);
    this.state.status = 'closed';
    this.state.closedAt = now;
    this.transition('interaction-closed', now);
  }

  submit(
    input: Omit<GameplaySubmissionState, 'id' | 'receivedAt' | 'status'> & {
      now: Date;
    },
  ): GameplaySubmissionState {
    this.assertStatus(['open']);
    this.assertNotPastDeadline(input.now);
    const duplicate = this.state.submissions.find(
      (submission) => submission.requestId === input.requestId,
    );
    if (duplicate) return duplicate;
    const submission: GameplaySubmissionState = {
      ...input,
      id: randomUUID(),
      receivedAt: input.now,
      status: 'pending-adjudication',
    };
    this.state.submissions.push(submission);
    this.state.submissions = this.state.submissions.slice(-MAX_SUBMISSIONS);
    this.recordRequest(input.requestId);
    this.transition('submission-received', input.now);
    return submission;
  }

  withdraw(submissionId: string, participantId: string, now: Date): void {
    this.assertStatus(['open']);
    const submission = this.requireSubmission(submissionId);
    if (submission.participantId !== participantId) {
      throw new LiveSessionDomainError(
        'SUBMISSION_FORBIDDEN',
        'Only the submitting participant may withdraw',
      );
    }
    if (submission.status !== 'pending-adjudication') {
      throw new LiveSessionDomainError(
        'INVALID_SUBMISSION_TRANSITION',
        'Submission cannot be withdrawn',
      );
    }
    submission.status = 'withdrawn';
    this.transition('submission-withdrawn', now);
  }

  adjudicate(
    submissionId: string,
    accepted: boolean,
    reasonCode: string,
    privateMetadata: GameplayModeState,
    now: Date,
  ): void {
    this.assertStatus(['open', 'closed', 'adjudicating']);
    this.state.status = 'adjudicating';
    const submission = this.requireSubmission(submissionId);
    if (submission.status !== 'pending-adjudication') {
      throw new LiveSessionDomainError(
        'INVALID_SUBMISSION_TRANSITION',
        'Submission was already adjudicated',
      );
    }
    submission.status = accepted ? 'accepted' : 'rejected';
    submission.reasonCode = reasonCode;
    submission.privateMetadata = privateMetadata;
    this.transition('submission-adjudicated', now);
  }

  resolve(outcome: GameplayOutcomeState, requestId: string, now: Date): void {
    if (this.state.status === 'resolved' && this.isDuplicate(requestId)) return;
    this.assertStatus(['closed', 'adjudicating']);
    this.state.status = 'resolved';
    this.state.outcome = outcome;
    this.state.resolvedAt = now;
    this.recordRequest(requestId);
    this.transition('interaction-resolved', now);
  }

  cancel(now: Date): void {
    this.assertStatus(['prepared', 'open', 'closed', 'adjudicating']);
    this.state.status = 'cancelled';
    this.state.cancelledAt = now;
    this.transition('interaction-cancelled', now);
  }

  expire(now: Date): void {
    this.assertStatus(['prepared', 'open']);
    const deadline = this.state.prompt.deadlineAt;
    if (!deadline || now.getTime() < deadline.getTime()) {
      throw new LiveSessionDomainError(
        'INTERACTION_NOT_EXPIRED',
        'Interaction deadline has not passed',
      );
    }
    this.state.status = 'expired';
    this.state.expiredAt = now;
    for (const submission of this.state.submissions) {
      if (submission.status === 'pending-adjudication') {
        submission.status = 'expired';
      }
    }
    this.transition('interaction-expired', now);
  }

  serialize(): GameplayInteractionState {
    return GameplayInteraction.restore(this.state).state;
  }

  private assertNotPastDeadline(now: Date): void {
    const deadline = this.state.prompt.deadlineAt;
    if (deadline && now.getTime() >= deadline.getTime()) {
      throw new LiveSessionDomainError(
        'INTERACTION_EXPIRED',
        'Interaction deadline has passed',
      );
    }
  }

  private assertStatus(allowed: GameplayInteractionStatus[]): void {
    if (!allowed.includes(this.state.status)) {
      throw new LiveSessionDomainError(
        'INVALID_INTERACTION_TRANSITION',
        `Cannot perform this action while interaction is ${this.state.status}`,
      );
    }
  }

  private requireSubmission(id: string): GameplaySubmissionState {
    const submission = this.state.submissions.find(
      (candidate) => candidate.id === id,
    );
    if (!submission) {
      throw new LiveSessionDomainError(
        'SUBMISSION_NOT_FOUND',
        'Submission was not found',
      );
    }
    return submission;
  }

  private recordRequest(id: string): void {
    this.state.processedRequestIds.push(id);
    this.state.processedRequestIds =
      this.state.processedRequestIds.slice(-MAX_REQUESTS);
  }

  private transition(type: string, now: Date): void {
    this.state.revision += 1;
    this.state.history.push({
      revision: this.state.revision,
      type,
      timestamp: now,
    });
    this.state.history = this.state.history.slice(-MAX_HISTORY);
  }
}
