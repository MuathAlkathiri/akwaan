export class LiveSessionDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LiveSessionDomainError';
  }
}

export class LiveSessionNotFoundError extends LiveSessionDomainError {
  constructor(sessionId: string) {
    super('SESSION_NOT_FOUND', `Live session "${sessionId}" was not found`);
  }
}

export class LiveSessionForbiddenError extends LiveSessionDomainError {
  constructor() {
    super('SESSION_FORBIDDEN', 'You cannot perform this live session action');
  }
}

export class StaleLiveSessionRevisionError extends LiveSessionDomainError {
  constructor(expected: number, actual: number) {
    super(
      'STALE_REVISION',
      `Expected live session revision ${expected}, but current revision is ${actual}`,
    );
  }
}

export class LiveSessionConcurrencyError extends LiveSessionDomainError {
  constructor() {
    super(
      'CONCURRENT_UPDATE',
      'The live session changed while this command was being processed',
    );
  }
}

export class GameplayRuntimeNotFoundError extends LiveSessionDomainError {
  constructor(sessionId: string) {
    super(
      'GAMEPLAY_RUNTIME_NOT_FOUND',
      `Gameplay runtime for session "${sessionId}" was not found`,
    );
  }
}

export class StaleGameplayRuntimeRevisionError extends LiveSessionDomainError {
  constructor(expected: number, actual: number) {
    super(
      'STALE_RUNTIME_REVISION',
      `Expected gameplay runtime revision ${expected}, but current revision is ${actual}`,
    );
  }
}
