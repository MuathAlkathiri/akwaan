# ركّبها / Distributed Information — Canonical Product Definition

This is the canonical reference for the cooperative Puzzle World challenge
ركّبها. It governs the Skill, Pattern, schema, validator, roles, and workflows.
Authoring agents resolve this document before any distributed-information work.

## 1. Identity

ركّبها is a cooperative Puzzle World Challenge where one puzzle is divided into
secret participant fragments plus a team instruction. With two participants,
fragments are split between them and the instruction is randomly attached to one
holder. With three participants, two participants hold the fragments and the
third holds the instruction. The host screen reveals no puzzle-solving
information. Players solve by verbally combining what they see.

The canonical product statement, kept verbatim as the equivalence target for all
active guidance: ركّبها is a cooperative Puzzle World Challenge where one puzzle
is divided into secret participant fragments plus a team instruction. With two
participants, fragments are split between them and the instruction is randomly
attached to one holder. With three participants, two participants hold the
fragments and the third holds the instruction. The host screen reveals no
puzzle-solving information. Players solve by verbally combining what they see.

## 2. Puzzle World Ownership

Distributed Information belongs specifically to عالم الألغاز / Puzzle World. It
is NOT a generic ChallengeType intended to run across Anime, Football, Video
Games, or other Worlds. This is an exception to the general rule that
ChallengeTypes are global. World, Scope, and Scope Knowledge are used only for
flavor and never supply required solving information; puzzles are
self-contained.

## 3. Content Model

One ContentItem is one shared puzzle. The conceptual shape is
`PuzzleItem { instruction, fragments[], answer }`:

- `instruction` — the localized task the team must perform (for
  example, "combine what you see to form a single word").
- `fragments[]` — literal puzzle pieces: text, letters, numbers, shapes, images,
  matrices, partial equations, rules, symbols, sequences, visual patterns,
  partial diagrams, answer choices, ordering information, map fragments, or
  transformation rules. Fragments are pieces of the puzzle itself, never semantic
  clues to a separate fact.
- `answer` — the accepted solution. Multiple accepted solutions are allowed only
  when every accepted value is recorded explicitly.

Default authored shape: instruction + two fragments + answer. The author never
authors a fake third fragment for a three-player team. In the active workspace
this maps to native `answerPayload` (machine truth) and `mechanicPayload`
(instruction + fragments + team sizes + safety confirmation), pattern
`shared-fragments`, wrapper answer mode `distributed`.

## 4. Two-Participant Distribution

With two participants the two fragments are split one per participant and the
instruction is randomly attached to one of the two holders. Assignments are
shuffled; authors never encode which participant holds which piece.

## 5. Three-Participant Distribution

With three participants the two fragments go to two participants and the third
participant holds the instruction only. There is no third content fragment.
Assignments are shuffled; authors never encode identities or schedules.

## 6. Host-Screen Secrecy

The host/shared screen reveals no puzzle-solving information. It shows only
neutral match state: the challenge name, the timer, team status, readiness,
progress, and waiting/resolution states. All puzzle material (instruction and
fragments) lives on participant phones and is never projected.

## 7. Puzzle-Family Taxonomy

Initial families:

- Distributed letter puzzles — letters or letter sets split across fragments
  that combine into one answer.
- Missing shape / visual pattern — a shape, pattern, or diagram split across
  fragments that must be completed or recognized as a whole.
- Distributed equations / matrices — numbers, operators, or matrix cells split
  across fragments that combine into one result.

Future families, not yet authored: ordering puzzles, distributed relationship
logic, map/path puzzles, code-breaking, symbol keys, image fragments,
spot-the-difference distributed views, instruction/rule puzzles, partial
diagrams, spatial reasoning, route finding, matching, sequence reconstruction,
and logic tables. No rigid per-family schema exists yet; the shared
instruction + fragments + answer shape covers them.

## 8. Authoring Principles

The Writer's fixed order:

1. Choose a puzzle family.
2. Design ONE complete puzzle.
3. Write the instruction (the task).
4. Fix the answer.
5. Split the puzzle into two complementary fragments.
6. Verify neither fragment alone solves the puzzle.
7. Verify the two-participant shape.
8. Verify the three-participant shape (two fragments + instruction-only third).
9. Verify host-screen independence.
10. Confirm the puzzle is fun to describe aloud.

## 9. Anti-Patterns

Rejected constructions: a fragment that leaks or contains the full answer; the
full puzzle duplicated on both phones; a fake third fragment for a three-player
team; trivia masquerading as a distributed puzzle; answer choices as the main
architecture instead of a genuine puzzle; host-dependent content; unclear
instructions; ambiguous or non-deterministic answers without an explicit
accepted-solution policy; phone-unrenderable layouts; puzzles requiring
information not present in the instruction and fragments; inaccessible image or
text assumptions; and any authored runtime state.

## 10. Quality Checklist

A ready item must satisfy: one coherent puzzle; complementary fragments; no
accidentally sufficient fragment; the instruction is necessary; works with two
participants; works with three participants; verbal communication matters;
deterministic answer (or an explicit multi-accepted-solution policy);
understandable under time pressure; no host-screen dependency; variety against
nearby content; and it feels like ركّبها rather than a quiz.

## 11. Difficulty

Difficulty is a puzzle-solving experience: fragment complexity, the amount of
verbal communication required, reasoning steps, ambiguity before combining,
visual/spatial complexity, arithmetic complexity, memory burden, and
transformation depth. Trivia knowledge is never a difficulty axis for ركّبها.

## 12. Extensibility and Unresolved Cases

The instruction + fragments + answer model is extensible to the future families
in point 7 without changing the content shape. Explicitly unresolved
participant-count cases, left unresolved by product direction and therefore not
invented in active guidance: one-participant play, four-or-more-participant
distribution, spectator behavior, and mixed fragment duplication between
participants. If canonical product documentation ever defines these cases, this
document must be updated to match before any related content is authored.
