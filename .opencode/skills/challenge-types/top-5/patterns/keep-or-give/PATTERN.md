---
patternId: keep-or-give
owningChallengeType: top-5
---

# Pattern: Keep or Give / خذها أو سلمها

## Experience Goal

Turn every card into a public KEEP/GIVE bluff while truth remains hidden until
a delayed staged reveal.

## Interaction Shape

The server shuffles ten entries once. Exactly two teams alternate for ten
fifteen-second turns. `keep` assigns to the acting team; `give` assigns to the
opponent; a host skip means `keep`. Recipient is public, but validity and rank
are hidden. The server owns the reveal order and withholds it until resolution.

Players do not rank entries manually.

## ContentItem Shape

One continuous ContentItem with:

- `answerMode: top_5`;
- `patternId: keep-or-give`;
- title and membership-oriented prompt;
- objective `rankingBasis`;
- authoritative `sourceLabel` and `sourceUrl`;
- required `asOfDate`;
- exactly ten unique entries;
- exactly five ranked entries holding ranks 1..5;
- exactly five traps with no rank;
- optional explicit `tiebreaker` when an authoritative source resolves equal values.

## Interaction Payload Shape

`variant`, title, prompt, ranking basis, source data, ten entries (five ranked,
five traps), turn count 10, team count 2, turn deadline 15, actions
KEEP/GIVE, and timeout action KEEP. Entry media is optional.

## Resolution Payload Shape

Scoring rule `top-5.result`, Match event `top-5.win`, no tie event, and the
runtime event types `top5-card-decided` and `top5-completed`. Internal score is
one point per real card owned; traps score nothing.

## Machine Resolution

Card ownership and stored rank determine internal scores. No human judgment
occurs. The team that owns more of the five real entries receives one Match
point; five cards cannot split evenly, so there is no tie event.

## Constraints

Entry IDs are unique. Ranked and trap sets are disjoint and exhaustive. Ranks
are the unique integers 1–5. Reject unresolved ties affecting ranks, cutoff, or
staged reveal. Store an authoritative secondary tiebreaker when used.

Prefer actual source positions 6–10 as traps, or entries immediately adjacent
to the cutoff. Every trap must be plausible. Reviewer notes must state distance
from cutoff, why the trap is credible, and whether it is too easy.

## Media Compatibility

Text is required; one image per entry is optional. Media cannot show rank,
validity, source order, or another unrevealed entry.

## Valid Example

A dated official ranking with unique positions 1–10, entries 1–5 stored as
ranked, entries 6–10 stored as traps, and a prompt asking which entries belong
within the highest five.

## Invalid Example

A popularity list with unresolved equal values, five absurd traps, or wording
that asks teams to sort the full list themselves.

## Anti-patterns

Subjective lists, stale or missing dates, unsupported tie-breaking, obvious
traps, overlapping sets, repeated IDs, early truth, exposed deck order, ten
separate ContentItems, manual ranking, alternate scoring, or the retired
poison-deck shape (fourteen candidates / ten ranks / four decoys).
