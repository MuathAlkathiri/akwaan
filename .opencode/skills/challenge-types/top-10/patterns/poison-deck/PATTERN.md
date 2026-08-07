---
patternId: poison-deck
owningChallengeType: top-10
---

# Pattern: Poison Deck / خذها أو دسّها

## Experience Goal

Turn every candidate into a public KEEP/POISON bluff while truth remains hidden
until a delayed staged reveal.

## Interaction Shape

The server shuffles fourteen candidates once. Exactly two teams alternate for
fourteen six-second turns. KEEP assigns to the acting team; POISON assigns to
the opponent; timeout means KEEP. Recipient is public, but validity and rank are
hidden. Reveal proceeds from rank 10 to rank 1, then through four decoys.

Players do not rank candidates manually.

## ContentItem Shape

One continuous ContentItem with:

- `answerMode: top_10`;
- `patternId: poison-deck`;
- title and membership-oriented prompt;
- objective `rankingBasis`;
- authoritative `sourceLabel` and `sourceUrl`;
- required `asOfDate`;
- exactly fourteen unique candidates;
- exactly ten valid candidate/rank pairs;
- exactly four unique decoy candidate IDs;
- optional explicit `tiebreaker` when an authoritative source resolves equal values.

## Interaction Payload Shape

`variant`, title, prompt, ranking basis, source data, fourteen candidates, turn
count 14, team count 2, turn deadline 6, actions KEEP/POISON, and timeout action
KEEP. Candidate media is optional.

## Resolution Payload Shape

Ten uniquely ranked valid entries, four decoy IDs, reveal order
`rank_10_to_1_then_decoys`, internal values +1/−1, scoring rule
`top10.poison-deck.result`, Match event `top10.poison-deck.win`, no tie event,
and the four social metric identifiers.

## Machine Resolution

Candidate ownership and stored validity determine internal scores. No human
judgment occurs. Higher internal score receives one Match point; a tie receives
none. No separate poison bonus exists.

## Constraints

Candidate IDs are unique. Valid and decoy sets are disjoint and exhaustive.
Ranks are the unique integers 1–10. Reject unresolved ties affecting ranks,
cutoff, or staged reveal. Store an authoritative secondary tiebreaker when used.

Prefer actual source positions 11–14 as decoys, or candidates immediately
adjacent to the cutoff. Every decoy must be plausible. Reviewer notes must state
distance from cutoff, why the decoy is credible, and whether it is too easy.

## Media Compatibility

Text is required; one image per candidate is optional. Media cannot show rank,
validity, source order, or another unrevealed candidate.

## Valid Example

A dated official ranking with unique positions 1–14, candidates 1–10 stored as
valid, candidates 11–14 stored as decoys, and a prompt asking which candidates
belong within the highest ten.

## Invalid Example

A popularity list with unresolved equal values, four absurd decoys, or wording
that asks teams to sort the full list themselves.

## Anti-patterns

Subjective lists, stale or missing dates, unsupported tie-breaking, obvious
decoys, overlapping sets, repeated IDs, early truth, exposed deck order,
fourteen separate ContentItems, manual ranking, or alternate scoring.
