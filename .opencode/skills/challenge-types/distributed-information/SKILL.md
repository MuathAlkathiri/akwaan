---
name: challenge-type-distributed-information
description: Cooperative Puzzle World shared-fragment challenge presented in Arabic as ركّبها.
---

# ChallengeType: Distributed Information / ركّبها

## Experience Goal
Create a cooperative shared-puzzle moment where a team receives one puzzle split
into secret fragments plus one team instruction, and the participants solve it by
verbally combining what each one sees. Distributed Information belongs to Puzzle
World (عالم الألغاز) and runs as a two-team race.

## Social Dynamic
Two teams race simultaneously; within each team, participants hold complementary
private pieces of the same puzzle and must explain them aloud, listen, and
combine them. Private fragments and the instruction never appear on the host
screen or on another participant's phone; only one runtime-assigned answerer per
team submits.

## Player Emotion
Curiosity, focused verbal exchange, the aha moment when the pieces click,
urgency under the clock, relief on a correct solve, wrong-answer frustration, and
shared victory.

## Interaction Pattern
Both teams receive the same three ContentItems in independently randomized
runtime order. Each item is one shared puzzle: a team instruction plus exactly
two secret fragments. With two participants the fragments are split between them
and the instruction is randomly attached to one holder. With three participants
two participants hold the fragments and the third holds the instruction.
Assignments are shuffled and never authored. Wrong submissions lock that team
for five seconds while the main clock keeps running; the answer is never revealed
during the item.

## Thinking Pattern
Understand the shared goal from the instruction, describe your fragment's
material accurately, listen to teammates, combine the pieces into one solution,
reject misleading partial interpretations, and agree on one machine-resolvable
answer.

## Success Pattern
The instruction is necessary, every fragment is a literal puzzle piece, no
fragment alone yields the answer, verbal combination produces a deterministic
answer, the item works for team sizes two and three, and the host screen is not
needed to solve.

## Failure Pattern
A fragment leaks the full answer, the full puzzle is duplicated on one
participant's device, a fake third fragment is authored for a three-player team,
trivia masquerades as a puzzle, answer choices replace the puzzle, the answer
depends on the host screen, the instruction is unclear, the answer is ambiguous
without an explicit accepted-solution policy, the layout is unrenderable on a
phone, or solving requires information absent from the instruction and fragments.

## Input Contract
Canonical ID and runtime/plugin key are `distributed-information`; owned Pattern
and variant are `shared-fragments`; wrapper answer mode is `distributed`. Each
ContentItem stores native `answerPayload` and `mechanicPayload`. Supported inner
answer modes are `match`, `closest`, and `multiple_choice`. Team sizes are
exactly `[2,3]`, and each Challenge uses exactly three ContentItems that both
teams play in independently randomized order. The runtime contract for the
shared-fragments payload is not yet migrated in the product backend; readiness is
blocked until it lands.

## Resolution Contract
The first team to solve all three wins. At the 135-second deadline, more solved
wins; if equal, the team that reached that count earlier wins; equal elapsed
progress is a true tie. A non-tie winner receives one Match point. Wrong
submissions cause a five-second team lock; the clock continues and retries remain
unlimited. Three-player teams each answer once in random order; two-player teams
alternate from a random start. Timing, progress, order, answerer, lock state, and
score events are runtime-owned. There is no hint mechanic and no in-race reveal
of correct truth.

## Content Structure
Exactly three independent ContentItems form one Challenge. Each item contains a
localized public prompt, one localized team instruction, exactly two localized
private fragments with distinct content, `[2,3]`, the required author safety
confirmation for ready status, and optional explanation. Optionally tag the
solving operation in `mechanicPayload.puzzleFamily` with a canonical family name
from `.opencode/knowledge/architecture/PUZZLE-FAMILY.md`. Correct truth exists
only in `answerPayload`.

## Allowed Content Patterns
- `shared-fragments`

The canonical construction is the shared-puzzle model. The author designs one
complete puzzle, writes the instruction (the task the team must perform), fixes
the deterministic answer, then splits the puzzle into exactly two complementary
fragments that are literal pieces of the puzzle — letters, numbers, shapes,
images, matrices, partial equations, rules, symbols, sequences, visual patterns,
partial diagrams, answer choices, ordering information, map fragments, or
transformation rules. Neither fragment resolves the puzzle alone, and the
instruction is necessary. The author verifies the two-fragment split, the
three-participant shape (two fragments plus an instruction-only third holder),
and host-screen independence.

## Content Safety Rules
Every fragment must be a necessary, distinct, literal puzzle piece that is
private and insufficient alone. The instruction must be necessary. Reject
fragments that leak the answer, duplicated full puzzles, fake third fragments,
trivia masquerading as puzzles, answer choices as the main architecture,
host-dependent content, unclear instructions, ambiguous or non-deterministic
answers without an explicit accepted-solution policy, phone-unrenderable
layouts, puzzles needing information absent from the instruction and fragments,
and inaccessible image or text assumptions. Required confirmation:
`راجعت اللغز، ولا يستطيع أي لاعب حله بمفرده من المعلومة التي لديه، والجمع اللفظي ضروري للوصول إلى الحل.`

## Media Compatibility
Text-only is the default. Optional media belongs to a fragment and is visible
only to its assigned participant. Filenames, captions, subtitles, HUD text, alt
text, labels, future-item media, host/shared screens, and player previews must
not reveal private content or truth. Media must render on a participant's phone
screen.

## Scope Compatibility
Distributed Information is exclusively owned by Puzzle World (عالم الألغاز).
Puzzle World declares six scopes: `general-knowledge`, `letters-words`,
`numbers-arithmetic`, `logic-deduction`, `shapes-patterns`, and `symbols-codes`.
It is not a generic ChallengeType intended to run across Anime, Football, or
Video Games. Puzzles are self-contained: World, Scope, and Scope Knowledge are
used only for flavor and never supply required solving information. Apply every
declared exclusion, spoiler boundary, and version boundary.

## Validation Rules
Validate canonical IDs; exact native objects; a non-empty Arabic instruction;
exactly two fragments with distinct content; `[2,3]`; deterministic truth; no
truth in mechanic data; no runtime-owned fields; no public/private leakage;
safety confirmation when status is `ready`; supported inner mode; Scope evidence;
and three distinct items per Challenge. Run `validate_distributed_information.py`.

## Anti-patterns
A fragment that reveals the answer, a duplicated full puzzle on both phones, a
fake third fragment authored for a three-player team, trivia presented as a
distributed puzzle, answer choices as the main architecture instead of a genuine
puzzle, host-dependent content, unclear instructions, ambiguous or
non-deterministic answers without an explicit accepted-solution policy,
phone-unrenderable layouts, a puzzle requiring information outside the
instruction and fragments, unsupported claims, hidden assumptions, authored
participant IDs, answerer schedules, item orders, lock timestamps, progress,
score events, host entry, host judgment, authored hints, or any authored state
that only the runtime may produce.

## Contract Status

`authoring_only`: this Skill documents the cooperative shared-fragment authoring
model. The product backend still expects the retired `three-segment-race` payload
(`candidateSets`, A/B/C segments, `twoPlayerMergeOptions`); migrating the runtime
contract is a separate product task. Until that migration lands, no Distributed
Information item may be marked ready.
