import { ContentSignalService } from './content-signal.service';
import { ContentSignalRepository } from '../persistence/content-signal.repository';
import { MatchPresentedContentLookup } from '../../match/application/match-presented-content.lookup';
import { ContentSignalError } from '../domain/content-signal';

const showing = {
  matchId: 'match-1',
  ownerAccountId: 'owner-1',
  challengeTypeKey: 'read-your-opponent',
  contentItemIds: ['item-1', 'item-2'],
};

function serviceWith(
  presented: Partial<MatchPresentedContentLookup> = {
    forSession: async () => showing,
  },
) {
  const signals = { record: jest.fn(async () => undefined) };
  return {
    service: new ContentSignalService(
      signals as unknown as ContentSignalRepository,
      presented as MatchPresentedContentLookup,
    ),
    signals,
  };
}

const verdict = {
  sessionId: 'session-1',
  participantId: 'participant-1',
  contentItemId: 'item-1',
  kind: 'liked' as const,
  source: 'reveal-buttons' as const,
};

describe('what a phone is allowed to have an opinion about', () => {
  it('files the verdict against the Match the server says is running', async () => {
    // The phone sends which item and what it thought. Whose account, which
    // Match and which mechanic all come from the server, so a verdict cannot
    // be attributed to somebody else's game.
    const { service, signals } = serviceWith();

    await service.record(verdict);

    expect(signals.record).toHaveBeenCalledWith({
      ownerAccountId: 'owner-1',
      participantId: 'participant-1',
      matchId: 'match-1',
      contentItemId: 'item-1',
      challengeTypeKey: 'read-your-opponent',
      kind: 'liked',
      source: 'reveal-buttons',
    });
  });

  it('refuses a verdict on a question this Match is not showing', async () => {
    const { service, signals } = serviceWith();

    await expect(
      service.record({ ...verdict, contentItemId: 'item-99' }),
    ).rejects.toBeInstanceOf(ContentSignalError);
    expect(signals.record).not.toHaveBeenCalled();
  });

  it('refuses a verdict when no challenge is on screen', async () => {
    // Between challenges there is nothing to have an opinion about.
    const { service, signals } = serviceWith({ forSession: async () => null });

    await expect(service.record(verdict)).rejects.toBeInstanceOf(
      ContentSignalError,
    );
    expect(signals.record).not.toHaveBeenCalled();
  });

  it('records a defect the same way, so both kinds share one path', async () => {
    const { service, signals } = serviceWith();

    await service.record({ ...verdict, kind: 'defect' });

    expect(signals.record).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'defect', contentItemId: 'item-1' }),
    );
  });
});
