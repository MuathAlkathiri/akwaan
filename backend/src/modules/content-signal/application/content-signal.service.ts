import { Injectable, Logger } from '@nestjs/common';
import { ContentSignalRepository } from '../persistence/content-signal.repository';
import { MatchPresentedContentLookup } from '../../match/application/match-presented-content.lookup';
import {
  ContentSignalError,
  ContentSignalKind,
  ContentSignalSource,
} from '../domain/content-signal';

/**
 * Takes a player's verdict on the question in front of them.
 *
 * Everything a phone could lie about is read from the server instead of the
 * request: which Match this is, whose account owns it, which mechanic is being
 * played, and whether the item named is actually on screen. The phone sends
 * two things — which item, and what it thought — and even the item is checked
 * against what the Match has launched, so a verdict cannot be filed against a
 * question nobody was shown.
 */
@Injectable()
export class ContentSignalService {
  private readonly logger = new Logger(ContentSignalService.name);

  constructor(
    private readonly signals: ContentSignalRepository,
    private readonly presented: MatchPresentedContentLookup,
  ) {}

  async record(input: {
    sessionId: string;
    participantId: string;
    contentItemId: string;
    kind: ContentSignalKind;
    source: ContentSignalSource;
  }): Promise<void> {
    const showing = await this.presented.forSession(input.sessionId);
    if (!showing || !showing.contentItemIds.includes(input.contentItemId)) {
      throw new ContentSignalError(
        'CONTENT_SIGNAL_UNSEEN_ITEM',
        'That question is not the one this match is showing',
      );
    }
    await this.signals.record({
      ownerAccountId: showing.ownerAccountId,
      participantId: input.participantId,
      matchId: showing.matchId,
      contentItemId: input.contentItemId,
      challengeTypeKey: showing.challengeTypeKey,
      kind: input.kind,
      source: input.source,
    });
    if (input.kind === 'defect') {
      // A defect is actionable today, unlike taste, so it is worth finding in
      // the logs without opening the admin screen.
      this.logger.warn({
        event: 'content_defect_reported',
        contentItemId: input.contentItemId,
        challengeTypeKey: showing.challengeTypeKey,
        matchId: showing.matchId,
      });
    }
  }
}
