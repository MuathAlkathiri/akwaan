import { Injectable } from '@nestjs/common';
import { issue } from './world-content.errors';
import {
  ChallengePresentation,
  normalizePresentation,
  WorldContentIssue,
} from './world-content.types';

const IDENTIFIER_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_IDENTIFIER_LENGTH = 40;
const MIN_TIMER_SECONDS = 1;
const MAX_TIMER_SECONDS = 600;

/**
 * Validates how a mechanic presents itself.
 *
 * Presentation belongs to the mechanic and nothing else: a World cannot override
 * the timer, input, or reveal behaviour, and media is not part of presentation at
 * all — it belongs to the ContentItem. Two Worlds therefore play a shared
 * mechanic identically, and differ through their Signature mechanic, their
 * content, and their own identity instead.
 */
@Injectable()
export class ChallengePresentationPolicy {
  validateShape(
    value: Partial<ChallengePresentation> | undefined | null,
    path = 'presentation',
  ): WorldContentIssue[] {
    // Normalizing first means a legacy or partially migrated record is reported
    // as invalid rather than crashing whatever loaded it.
    const presentation = normalizePresentation(value);
    const issues: WorldContentIssue[] = [];

    if (!this.isIdentifier(presentation.inputType)) {
      issues.push(
        issue(
          'INVALID_PRESENTATION_INPUT_TYPE',
          'Input type must be a lower-case, hyphenated identifier',
          { path: `${path}.inputType`, value: presentation.inputType },
        ),
      );
    }

    if (presentation.timerSeconds !== null) {
      const timer = presentation.timerSeconds;
      if (
        !Number.isInteger(timer) ||
        timer < MIN_TIMER_SECONDS ||
        timer > MAX_TIMER_SECONDS
      ) {
        issues.push(
          issue(
            'INVALID_PRESENTATION_TIMER',
            `Timer must be null or a whole number of seconds between ${MIN_TIMER_SECONDS} and ${MAX_TIMER_SECONDS}`,
            { path: `${path}.timerSeconds`, value: timer },
          ),
        );
      }
    }

    for (const key of ['soundPack', 'revealStyle'] as const) {
      const value = presentation[key];
      if (value !== undefined && value !== null && !this.isIdentifier(value)) {
        issues.push(
          issue(
            'INVALID_PRESENTATION_IDENTIFIER',
            `${key} must be a lower-case, hyphenated identifier`,
            { path: `${path}.${key}`, value },
          ),
        );
      }
    }

    return issues;
  }

  private isIdentifier(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= MAX_IDENTIFIER_LENGTH &&
      IDENTIFIER_PATTERN.test(value)
    );
  }
}
