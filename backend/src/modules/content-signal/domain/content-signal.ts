/**
 * What a player thought of a question, captured where they are holding a phone.
 *
 * Two signals, deliberately not one. A single button would merge "this was
 * fun" with "this is broken", and the second is the one that needs answering
 * within hours: a wrong answer key or a dead image is a defect in the catalog,
 * while a shrug is taste that is only readable in aggregate, weeks later.
 * Merged, every defect would be buried under a hundred mild opinions.
 *
 * Nothing here is a score. A question is not "bad" because a team got it wrong
 * and said so; the numbers are read beside how often the item was shown, which
 * the exposure ledger already knows.
 */
export const CONTENT_SIGNAL_KINDS = ['liked', 'defect'] as const;
export type ContentSignalKind = (typeof CONTENT_SIGNAL_KINDS)[number];

/**
 * Where the signal came from.
 *
 * Recorded because the input will change — the plan is to replace the buttons
 * with a vote at the end of a Match — and a rate measured through one input
 * cannot be compared with a rate measured through another. Without this field
 * the change would silently corrupt the series it is meant to improve.
 */
export const CONTENT_SIGNAL_SOURCES = ['reveal-buttons'] as const;
export type ContentSignalSource = (typeof CONTENT_SIGNAL_SOURCES)[number];

export interface ContentSignal {
  /** The account that owns the Match, so counts line up with exposure. */
  ownerAccountId: string;
  /** Which phone said it. One signal per participant per item per kind. */
  participantId: string;
  matchId: string;
  contentItemId: string;
  challengeTypeKey: string;
  kind: ContentSignalKind;
  source: ContentSignalSource;
}

export class ContentSignalError extends Error {
  constructor(
    readonly code: 'CONTENT_SIGNAL_UNSEEN_ITEM',
    message: string,
  ) {
    super(message);
    this.name = 'ContentSignalError';
  }
}
