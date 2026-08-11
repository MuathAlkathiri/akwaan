---
name: challenge-type-one-clue
description: Global progressive five-clue knowledge mechanic presented in Arabic as بدليل واحد.
---

# ChallengeType: One Clue / بدليل واحد

## Experience Goal

Create a knowledge-recognition race where one hidden answer is revealed through
exactly five clues that progress from hardest to easiest. The team that answers
at the earliest clue proves the deepest knowledge, because the mechanic tests
"how little information do you need before you recognize the answer?" — not
reaction speed, guessing, bluffing, or puzzle solving.

## Social Dynamic

Two teams face the same item simultaneously on their phones. Each team has one
runtime-assigned answerer per clue stage who locks the team's single text
answer. All revealed clues stay on screen, so teams accumulate information
across the stage. Wrong answers eliminate that team from the remaining stages
of the current item; a correct answer resolves the item immediately.

## Player Emotion

The "wait, I think I know who this is" spark, focused confidence, tension over
when to lock the answer, regret over locking too late or too early, elimination
drama after a wrong lock, and a shared relief when the reveal confirms
recognition.

## Interaction Pattern

Exactly three ContentItems form one Challenge. Each item starts at clue stage
1. Every stage lasts 7 seconds; the runtime advances the stage when the clock
expires and ends the item as soon as one team locks a correct answer. Clues
reveal cumulatively: at stage N the team sees clues 1..N. Only the assigned
answerer per team may lock the team answer, and the runtime decides that
assignment. Wrong answers eliminate the team for the rest of the item. There is
no hint mechanic and the answer is never revealed during play.

## Thinking Pattern

Read the accumulated clues as one cumulative body of evidence, recognize the
canonical entity from genuine knowledge, filter the field to one deterministic
answer, and lock it before a later (cheaper) clue reveals the rest. Clue values
reward earlier recognition: the current stage value equals the points the item
is worth to the solving team.

## Success Pattern

Every clue adds genuinely new, verified information; the ladder is monotonically
more identifying from clue 1 to clue 5; earlier clues are difficult but
meaningful for deep followers; the final clue almost identifies the answer yet
never contains it; the team answers because it KNOWS the target, not because it
decoded the wording; and one deterministic answer resolves automatically with no
human referee.

## Failure Pattern

The answer string appears inside a clue, clue 1 is clearer than clue 3, clue 2
effectively gives the answer away, clue 5 stays impossibly vague, five clues
rephrase one fact, obscure trivia that carries no identifying value, clues that
depend on opinion or disputed facts, multiple equally valid answers, nickname
ambiguity, unstable current-stat facts without context, or content that reads as
a guessing or puzzle-solving task instead of a knowledge-recognition ladder.

## Input Contract

Canonical ID and runtime/plugin key are `one-clue`; owned Pattern is
`progressive-clues`; wrapper answer mode is `one_clue`. Each ContentItem stores
native `answerPayload` (mode `match` with `acceptedAnswers`) and `mechanicPayload`
(`clues`). Exactly five clues hold orders 1..5 and values 5, 4, 3, 2, 1. A
Challenge uses exactly three distinct ContentItems and two teams. Each clue
stage lasts exactly 7 seconds. The runtime contract is production-ready
(`fully_playable`); see the canonical One Clue definition.

## Resolution Contract

Each item resolves automatically against `acceptedAnswers` using the shared
Arabic normalization utility. The first team to lock a correct answer wins the
item's points, equal to the current stage value (5..1). A wrong lock eliminates
that team for the rest of the item. If no team locks correctly by the last
stage, the item ends with no item winner. The Challenge sums each team's item
points; the higher total receives one Match point through the `challenge.win`
scoring rule, and an equal total is a tie. The reveal shows `acceptedAnswers[0]`
as the correct answer. Timing, stage order, answerer assignment, elimination,
progress, and score events are runtime-owned.

## Content Structure

One ContentItem is one knowledge-recognition ladder: a localized public prompt,
exactly five ordered clues with values 5..1 in `mechanicPayload.clues`, and the
deterministic truth only in `answerPayload` (`mode: match`,
`acceptedAnswers: []`). Correct truth never appears in player-facing material.
Authoring metadata (sources, notes, tags) stays in `metadata`; per-clue review
records belong to the workflow stage files, never to the persisted item.

## Allowed Content Patterns

- `progressive-clues`

The canonical construction is the progressive-clues model: select one
deterministic answer target in the Scope, verify it through research, build a
five-stage information ladder where every clue adds new verified information
and later clues are progressively more identifying, then store exactly five
clues ordered 1..5 with values 5..1. Audience labels (expert, fan, casual) are
internal authoring heuristics, never persisted certainty.

## Content Safety Rules

Every clue must be factually verifiable, add new information, and narrow the
field; the ladder must be monotonically more identifying; no clue may literally
contain the canonical answer or an accepted variant; earlier clues are difficult
but meaningful, never useless trivia; the final clue may nearly identify the
answer but never reveal it; unstable current statistics require a dated context;
disputed facts are rejected; and the item must stay a knowledge-recognition
ladder rather than a guessing or puzzle-solving task. ContentItem is one item;
a Challenge is exactly three items.

## Media Compatibility

Text-first. The production contract exposes item-level media to the runtime,
but the initial One Clue skill authors text clues only and does not invent
image, audio, or video clues. When item media is added later, filenames,
captions, alt text, and metadata must never leak the answer, an accepted
variant, or a future clue.

## Scope Compatibility

One Clue is a global ChallengeType intended to run across Worlds (Football,
Anime, Video Games, Puzzle World, future Worlds). World and Scope supply the
content domain only; they never change the five-clue ladder, timing,
assignment, elimination, or scoring. Scope defines the candidate-entity
boundary: the answer must genuinely belong to the declared Scope, and the
Scope's exclusions apply. Puzzle World items must still respect the selected
Scope and must not become unrelated trivia.

## Validation Rules

Run `validate_one_clue.py`. Validate canonical IDs (`one-clue`,
`progressive-clues`, wrapper mode `one_clue`); native `answerPayload`
(`match` + nonempty `acceptedAnswers`) and `mechanicPayload` (`clues`); exactly
five clues with unique orders 1..5 and the exact value sequence 5, 4, 3, 2, 1
per order; nonblank Arabic clue text; no duplicated clue text after
normalization; no literal answer leakage in clues or prompt; no truth or
runtime-owned fields inside `mechanicPayload`; supported status
(`fully_playable`); Scope routing evidence; and three distinct items per
Challenge. Factual correctness, relative difficulty, clue usefulness, semantic
duplication, and monotonic identification quality are Reviewer and QA reasoning
gates the validator cannot prove.

## Anti-patterns

The answer string or an accepted variant inside any clue; clue 1 clearer than
clue 3; clue 2 effectively giving the answer away while later clues are generic;
an impossibly vague final clue; five rephrasings of one fact; obscure but
irrelevant trivia; clues dependent on opinion; disputed facts presented as
certain; unstable current-stat facts without date or context; multiple equally
valid answers; nickname ambiguity; clues based on spelling accidents rather than
knowledge; facts only useful after the answer is known; Scope misrouting;
trivia from another World or Scope; machine-translated Arabic; or any authored
runtime state (answerer schedules, stage order, elimination, progress, scores).

## Contract Status

`fully_playable`: the product backend implements the One Clue gameplay plugin,
launcher, provisioning, and readiness for the exact payload described here. One
Clue items may be marked ready. See `.opencode/knowledge/architecture/ONE-CLUE.md`.
