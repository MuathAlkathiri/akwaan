# Top 10 ranked-list mode

`ranked_list` is a question gameplay type layered onto the existing question
media type. Existing questions continue to default to `standard`.

A current Top 10 definition contains exactly ten persistent entry IDs, ranks
1–10, exact normalized canonical answers and aliases, and strictly increasing
positive point values totaling 600. The default values are
`10, 20, 30, 40, 50, 60, 70, 90, 100, 130`.

## Authoritative round lifecycle

The game document stores a ranked-list round snapshot. Starting a round copies
the approved definition into that snapshot, so later question edits cannot
change an active or historical round. The snapshot owns the active team,
15-second `turnStartedAt`/`turnExpiresAt`, turn sequence, strikes, temporary
scores, revealed entries, and result.

The browser derives its countdown from `turnExpiresAt` and asks the backend to
expire a turn at zero. Submit and expiry requests include the expected turn
sequence. Stale requests return `stale_turn` without mutation. Mongoose
optimistic concurrency maps competing writes to `CONCURRENT_GAME_UPDATE`, which
prevents two clients from claiming or scoring the same entry.

Answers use deterministic Unicode normalization and exact matching against the
Arabic canonical answer, English canonical answer, and configured aliases.
There is no runtime fuzzy or LLM matching.

Correct and incorrect attempts end a turn. An already discovered answer changes
nothing, including the timer. Empty answers are rejected without a strike. A
team is eliminated on its third strike and is skipped thereafter.

The round completes after all entries are claimed or both teams are eliminated.
Completion exposes all remaining answers. Only the temporary-score winner is
awarded that exact score in the main game; the loser receives zero. A tie awards
zero to both teams.

Finalization checks the persisted completed state before applying points. The
board question is marked answered in the same game-document save, and repeated
finalization returns the existing result without awarding again.

## Operations

- `POST /games/:id/ranked-list-rounds/start`
- `GET /games/:id/ranked-list-rounds/:questionId`
- `POST /games/:id/ranked-list-rounds/:questionId/answers`
- `POST /games/:id/ranked-list-rounds/:questionId/expire`
- `POST /games/:id/ranked-list-rounds/:questionId/finalize`

No migration is required. Legacy question and game documents rely on schema
defaults and an empty ranked-list-round collection.
