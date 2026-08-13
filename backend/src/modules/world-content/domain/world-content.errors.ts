import { BadRequestException, ConflictException } from '@nestjs/common';
import { WorldContentIssue } from './world-content.types';

/**
 * Domain validation failures carry the full issue list so the admin UI can show
 * every problem at once instead of one error per round-trip.
 */
export class WorldContentValidationError extends BadRequestException {
  constructor(
    readonly issues: WorldContentIssue[],
    message = 'World content validation failed',
  ) {
    super({
      code: 'WORLD_CONTENT_VALIDATION_FAILED',
      message,
      issues,
    });
  }
}

export class WorldContentConflictError extends ConflictException {
  constructor(
    code: string,
    message: string,
    /** Which records caused it, when the guard can name them. */
    references?: WorldContentReferenceDetail[],
  ) {
    super({ code, message, ...(references?.length ? { references } : {}) });
  }
}

/** Enough to find the blocking record, and nothing more. */
export interface WorldContentReferenceDetail {
  source: string;
  id: string;
  label: string;
  status?: string;
}

export function issue(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): WorldContentIssue {
  return details ? { code, message, details } : { code, message };
}

const MONGO_DUPLICATE_KEY = 11000;

/**
 * Slug and assignment uniqueness are pre-checked, but a concurrent write can
 * still lose the race at the index. This turns that into the same conflict the
 * pre-check would have raised rather than an unhandled server error.
 */
export async function withUniqueConstraint<T>(
  run: () => Promise<T>,
  conflict: { code: string; message: string },
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if ((error as { code?: number }).code === MONGO_DUPLICATE_KEY) {
      throw new WorldContentConflictError(conflict.code, conflict.message);
    }
    throw error;
  }
}

export function assertNoIssues(
  issues: WorldContentIssue[],
  message?: string,
): void {
  if (issues.length) throw new WorldContentValidationError(issues, message);
}
