import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';

export class MatchDomainError extends BadRequestException {
  constructor(code: string, message: string) {
    super({ code, message });
  }
}

export class MatchStaleRevisionError extends ConflictException {
  constructor(expected: number, actual: number) {
    super({
      code: 'MATCH_STALE_REVISION',
      message: `Expected match revision ${expected}, found ${actual}`,
    });
  }
}

export class MatchNotFoundError extends NotFoundException {
  constructor(message = 'This live session has no match') {
    super({ code: 'MATCH_NOT_FOUND', message });
  }
}

export class MatchForbiddenError extends ForbiddenException {
  constructor() {
    super({
      code: 'MATCH_FORBIDDEN',
      message: 'Only the session controller can drive the match',
    });
  }
}
