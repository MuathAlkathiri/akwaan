---
patternId: progressive-clues
owningChallengeType: one-clue
---

# Pattern: Progressive Clues / أدلة متدرجة

## Experience Goal

Turn one hidden answer into a five-stage recognition ladder. Every clue adds
new verified information, each later clue is more identifying than the last,
and teams are rewarded for recognizing the answer from less information.

## Interaction Shape

Two teams play the same item simultaneously. Clues reveal one stage at a time,
cumulatively, on each team's phone. Each team has one runtime-assigned answerer
per stage who may lock the team's single text answer. A correct lock resolves
the item at the current stage value; a wrong lock eliminates the team for the
rest of the item. Stages last 7 seconds and the runtime owns all timing and
assignment.

## ContentItem Shape

One ContentItem with:

- `answerMode: one_clue`;
- `patternId: progressive-clues`;
- native `answerPayload` with `mode: match` and nonempty `acceptedAnswers`;
- native `mechanicPayload` with exactly five `clues`;
- each clue: `order` 1..5, `value` 5, 4, 3, 2, 1 in exact per-order sequence,
  and nonblank localized `text`;
- the deterministic truth nowhere except `answerPayload`.

## Interaction Payload Shape

The interaction is entirely runtime-owned: stage length 7 seconds, cumulative
clue reveal, one assigned answerer per team per stage, elimination on a wrong
lock, immediate resolution on a correct lock, and per-stage value 5..1. None of
these are authored. The author writes only the prompt, the five clues, and the
accepted answers.

## Resolution Payload Shape

Resolution is the shared `challenge.win` Match scoring rule: sum each team's
item points across the three items; the higher total wins one Match point and an
equal total is a tie. Each item's points equal the stage value at which a team
locked the correct answer. The reveal displays `acceptedAnswers[0]`.

## Machine Resolution

Correctness is exact normalized text matching: a submitted answer is correct
when its normalized form equals the normalized form of one accepted answer. No
human judgment occurs.

## Constraints

Exactly five clues, unique orders 1..5, values 5, 4, 3, 2, 1 per order,
nonblank Arabic text, no exact duplicate clue text, no literal answer leakage in
any clue or the prompt, and no truth or runtime-owned fields inside
`mechanicPayload`. The item is one ladder; a Challenge is exactly three items.

Later clues must be more identifying in BOTH senses: logically narrower AND more
likely to trigger recognition in the intended audience (UNIQUENESS ≠
RECOGNIZABILITY). A unique-but-unrecognizable fact does not justify a late slot.
No clue may assert a subjective superlative (الأشهر، الأعظم، الأفضل) as its
identifying fact unless anchored to an objective, sourced metric.

## Media Compatibility

Text-first. Clue media is not authored in the initial skill. Any future item
media must never leak the answer, an accepted variant, or a future clue.

## Valid Example

An answer target with 7–10 verified candidate facts, five selected clues that
are factually independent, monotonically more identifying, and never contain the
answer, stored with orders 1..5 and values 5..1, and a `match` accepted-answer
set covering the canonical naming variants.

## Invalid Example

A ladder where clue 2 basically reveals the answer while clue 4 is generic, five
clues rephrasing one fact, a clue containing the answer string, or an answer
with only one or two meaningful facts that cannot support a real five-stage
ladder.

## Anti-patterns

Literal answer leakage; inverted progression; early giveaways; an impossibly
vague final clue; semantic duplication; useless obscurity; opinion-based or
disputed facts; unstable statistics without context; ambiguous naming;
nickname collisions; a unique-but-unrecognizable record as a late "strong" clue;
subjective superlatives (الأشهر، الأعظم، الأفضل) without an objective metric;
guessing-style or puzzle-solving content; scope
misrouting; and any authored runtime state.
