---
name: challenge-type-top-10
description: Global Top 10 mechanic with isolated classic compatibility and canonical keep-or-poison play.
---

# ChallengeType: Top 10

## Experience Goal

Keep both teams continuously engaged through bluffing, tactical poisoning,
delayed truth, and a social decision on every candidate.

## Social Dynamic

Two teams alternate in public confrontation. The acting team decides whether to
keep a candidate or transfer its risk to the opponent while validity and rank
remain hidden. Every action exposes intent without exposing truth.

## Player Emotion

Suspicion, confidence, doubt, regret, relief, playful toxicity, and a staged
reveal payoff.

## Interaction Pattern

One shuffled candidate appears → active team selects KEEP or POISON → recipient
becomes public → truth stays hidden → turn alternates → all assignments finish
→ ranks 10 through 1 reveal → four decoys reveal.

## Thinking Pattern

Estimate Top 10 membership, judge cutoff plausibility, interpret opponent
behavior, and decide whether to retain likely value or transfer likely risk.

## Success Pattern

A team owns more valid cards and fewer decoys. Strategic transfers, mistaken
reads, and delayed reveals produce memorable group moments. Content succeeds
when all fourteen cards create credible KEEP/POISON uncertainty.

## Failure Pattern

Obvious decoys, impossible ranking bases, ambiguous cutoffs, unsupported ties,
manual-ranking prompts, trivial validity, subjective lists, stale data, or
server-owned truth exposed during assignment invalidate the experience.

## Input Contract

Exactly two teams take fourteen alternating turns. The active team submits
`KEEP` or `POISON` within six seconds. `KEEP` assigns the candidate to the acting
team; `POISON` assigns it to the opposing team; timeout defaults to `KEEP`.
Players never submit ranks. Only the active team may act.

## Resolution Contract

The server shuffles once and persists deck order. Candidate validity, rank,
deck order, and internal score remain server-owned through assignment. Reveal
valid entries from rank 10 through rank 1, then reveal all four decoys.

Each valid owned card is +1 internal point. Each owned decoy is −1 internal
point. There is no separate poison bonus. The central scoring rule
`top10.poison-deck.result` emits one `top10.poison-deck.win` ScoreEvent awarding
+1 Match point to the team with the higher internal score. A tie emits no Match
point. Preserve `successfulPoison`, `giftedValidCard`, `selfKeptDecoy`, and
`selfKeptValid` per team.

## Content Structure

Poison deck is one continuous ContentItem, not fourteen separate records. It
contains one membership prompt, an objective ranking basis, authoritative
source, required as-of date, exactly fourteen unique candidates, exactly ten
uniquely ranked valid entries, and exactly four decoys.

The prompt asks whether candidates belong within the Top 10. It never asks
players to rank candidates manually.

## Allowed Content Patterns

- `poison-deck`: canonical active authoring Pattern.
- `classic`: isolated compatibility Pattern; never inferred from poison deck.

## Content Safety Rules

Use objective, respectful ranking bases. Reject sensitive personal ranking,
demeaning comparisons, unverifiable reputation lists, and anything requiring a
human referee. Factual claims require authoritative dated evidence.

## Media Compatibility

Candidate text is required. One candidate image is optional. Media belongs to
the ContentItem, must not expose validity or rank, and must remain comparable
across all fourteen candidates.

## Scope Compatibility

This global ChallengeType works with any Scope that supplies at least fourteen
plausible candidates and an authoritative, uniquely ordered Top 10. Respect
Scope exclusions. World and Scope provide theme only; they do not alter turns,
timing, assignment, reveal, or scoring.

## Validation Rules

- canonical IDs are `top-10`, `poison-deck`, and runtime mode `top_10`;
- exactly one continuous ContentItem;
- exactly fourteen unique candidate IDs;
- exactly ten valid candidate IDs with unique ranks 1–10;
- exactly four unique decoy IDs;
- valid and decoy sets are disjoint and cover all candidates;
- objective ranking basis, authoritative source, and as-of date are present;
- unresolved ties affecting ranks 1–10, cutoff, or reveal order are rejected;
- an authoritative secondary tiebreaker must be stored when equal source values
  are resolved into unique ranks;
- decoys should normally be actual positions 11–14 or immediately adjacent to
  the cutoff;
- reviewer records cutoff distance, plausibility, and easy-decoy risk for each
  decoy;
- prompt describes membership rather than manual ranking;
- assignment truth, deck order, and unrevealed score never reach clients;
- fourteen turns, six-second deadline, timeout KEEP, staged reveal, scoring,
  tie behavior, and social metrics match this contract exactly.

## Anti-patterns

Absurd decoys, famous candidates far below the cutoff chosen only for
recognition, ambiguous ranking periods, equal ranks without runtime support,
partial candidate sets, repeated IDs, visible server deck order, early truth,
manual scoring, local Match-point mutation, or converting classic records into
poison deck implicitly.

World configuration may provide a distinct display name and presentation but
must not change this mechanic. This ChallengeType does not assign or replace a
World Signature mechanic.
