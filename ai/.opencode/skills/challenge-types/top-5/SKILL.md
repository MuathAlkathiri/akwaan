---
name: challenge-type-top-5
description: Global Top 5 mechanic with canonical keep-or-give play across ten cards.
---

# ChallengeType: Top 5

## Experience Goal

Keep both teams continuously engaged through bluffing, tactical give-aways,
delayed truth, and a social decision on every card.

## Social Dynamic

Two teams alternate in public confrontation. The acting team decides whether to
keep a card or give it to the opponent while validity and rank remain hidden.
Every action exposes intent without exposing truth.

## Player Emotion

Suspicion, confidence, doubt, regret, relief, playful toxicity, and a staged
reveal payoff.

## Interaction Pattern

One shuffled card appears → active team selects KEEP or GIVE → recipient becomes
public → truth stays hidden → turn alternates → all ten cards are owned → the
five real entries reveal in a server-owned order.

## Thinking Pattern

Estimate Top 5 membership, judge cutoff plausibility, interpret opponent
behavior, and decide whether to retain likely value or transfer likely risk.

## Success Pattern

A team owns more of the five real entries. Strategic transfers, mistaken reads,
and delayed reveals produce memorable group moments. Content succeeds when all
ten cards create credible KEEP/GIVE uncertainty.

## Failure Pattern

Obvious traps, impossible ranking bases, ambiguous cutoffs, unsupported ties,
manual-ranking prompts, trivial validity, subjective lists, stale data, or
server-owned truth exposed during assignment invalidate the experience.

## Input Contract

Exactly two teams take ten alternating turns. The active team submits `keep` or
`give` within fifteen seconds. `keep` assigns the card to the acting team;
`give` assigns it to the opposing team; a host skip defaults to `keep`. Players
never submit ranks. Only the active team may act.

## Resolution Contract

The server shuffles once and persists deck order. Card validity, rank, deck
order, and internal score remain server-owned through assignment. Exactly five
cards carry ranks 1..5; the other five are traps and score nothing. The server
owns the reveal order and withholds it until resolution.

Only the five real entries score: one internal point per real card owned. The
central scoring rule `top-5.result` emits one `top-5.win` ScoreEvent awarding
+1 Match point to the team that owned more of the five real entries. Five cards
cannot split evenly between two teams, so a tie emits no Match point.

## Content Structure

Keep-or-give is one continuous ContentItem, not ten separate records. It
contains one membership prompt, an objective ranking basis, authoritative
source, required as-of date, and exactly ten unique entries: five carrying
ranks 1..5 and five traps with no rank.

The prompt asks whether entries belong within the Top 5. It never asks players
to rank entries manually.

## Allowed Content Patterns

- `keep-or-give`: the canonical active authoring Pattern.

## Content Safety Rules

Use objective, respectful ranking bases. Reject sensitive personal ranking,
demeaning comparisons, unverifiable reputation lists, and anything requiring a
human referee. Factual claims require authoritative dated evidence.

## Media Compatibility

Entry text is required. One entry image is optional. Media belongs to the
ContentItem, must not expose validity or rank, and must remain comparable
across all ten entries.

## Scope Compatibility

This global ChallengeType works with any Scope that supplies at least five
plausible ranked entries, five near-cutoff traps, and an authoritative, uniquely
ordered Top 5. Respect Scope exclusions. World and Scope provide theme only;
they do not alter turns, timing, assignment, reveal, or scoring.

## Validation Rules

- canonical IDs are `top-5`, `keep-or-give`, and runtime mode `top_5`;
- exactly one continuous ContentItem;
- exactly ten unique entry IDs;
- exactly five ranked entries with unique ranks 1–5;
- exactly five traps (no rank);
- ranked and trap sets are disjoint and cover all entries;
- objective ranking basis, authoritative source, and as-of date are present;
- unresolved ties affecting ranks 1–5 or the cutoff are rejected;
- an authoritative secondary tiebreaker must be stored when equal source values
  are resolved into unique ranks;
- traps should normally be actual positions 6–10 or immediately adjacent to the
  cutoff;
- reviewer records cutoff distance, plausibility, and easy-trap risk for each
  trap;
- prompt describes membership rather than manual ranking;
- assignment truth, deck order, and unrevealed score never reach clients;
- ten turns, fifteen-second deadline, host-skip KEEP, server-owned staged
  reveal, scoring, and winner behavior match this contract exactly.

## Anti-patterns

Absurd traps, famous entries far below the cutoff chosen only for recognition,
ambiguous ranking periods, equal ranks without runtime support, partial entry
sets, repeated IDs, visible server deck order, early truth, manual scoring,
local Match-point mutation, or resurrecting the retired poison-deck shape.

World configuration may provide a distinct display name and presentation but
must not change this mechanic. This ChallengeType does not assign or replace a
World Signature mechanic.
