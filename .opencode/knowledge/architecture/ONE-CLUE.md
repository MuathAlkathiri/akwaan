# بدليل واحد / One Clue — Canonical Product Definition

This is the canonical reference for the global knowledge challenge بدليل واحد.
It governs the Skill, Pattern, schema, validator, roles, and workflows.
Authoring agents resolve this document before any one-clue work.

## 1. Identity

بدليل واحد is a cooperative two-team knowledge-recognition Challenge where one
hidden answer is revealed through exactly five clues that progress from hardest
to easiest. The team that locks the correct answer at the earliest clue proves
the deepest knowledge and wins the most points. It is a knowledge-recognition
ladder, not a reaction race, guessing game, bluff, or puzzle-solving task.

The canonical product statement: بدليل واحد is a cooperative Challenge where a
hidden answer is revealed through exactly five progressively easier clues; teams
lock a single text answer each stage; a correct lock at an earlier clue is worth
more; a wrong lock eliminates the team from the remaining stages of that item;
and the first correct lock resolves the item.

## 2. World Ownership

One Clue is a GLOBAL ChallengeType intended to run across Worlds (Football,
Anime, Video Games, Puzzle World, and future Worlds). It is NOT owned by one
World. World and Scope supply the content domain only: they bound the
candidate-entity field, provide the answer target, and define exclusions. They
never change the five-clue ladder, 7-second stages, assignment, elimination, or
scoring. Puzzle World items must still respect the selected Scope and must not
become unrelated trivia. There is exactly one canonical Skill and one canonical
Pattern; no World-specific clones exist or are authored.

## 3. Content Model

One ContentItem is one knowledge-recognition ladder. The conceptual shape is
`OneClueItem { prompt, clues[5], acceptedAnswers[] }`:

- `prompt` — localized Arabic-first task text shown to both teams (for example,
  "who is the player we describe with five progressive clues?").
- `clues[5]` — exactly five localized Arabic clue texts ordered hardest (1) to
  easiest (5) with internal values 5, 4, 3, 2, 1.
- `acceptedAnswers[]` — the deterministic canonical answer plus accepted
  variants, resolved automatically.

Default authored shape maps to native `answerPayload` (`mode: match` +
`acceptedAnswers`) and `mechanicPayload` (`clues`), Pattern `progressive-clues`,
wrapper answer mode `one_clue`. The answer truth lives ONLY in `answerPayload` —
never in the prompt, never in a clue, never in metadata.

## 4. Runtime Contract (production-ready)

The product backend implements One Clue as a production mechanic:

- Challenge type slug/key: `one-clue`; answer mode: `one_clue`; item answer
  payload mode: `match`.
- Challenge structure: `discrete_triple`, family `coop`; exactly three items per
  Challenge; two teams.
- Stage: `ONE_CLUE_STAGE_SECONDS = 7`; default presentation `phone-text`,
  `timerSeconds 7`.
- Values: `ONE_CLUE_VALUES = [5, 4, 3, 2, 1]`; clue `order = index + 1`; clue
  `value = ONE_CLUE_VALUES[index]`.
- Behavior: clues reveal cumulatively (`clues.slice(0, clueIndex + 1)`); one
  runtime-assigned answerer per team per stage; a wrong answer eliminates that
  team for the rest of the item; the first correct team ends the item; the
  reveal shows `acceptedAnswers[0]`.
- Resolution: `normalizeAnswer` exact match; scoring rule `challenge.win`;
  item points equal the current stage value.
- Readiness: `runtimeContractStatus: fully_playable`. One Clue items may be
  marked ready.

All timing, assignment, elimination, progress, and score events are runtime
owned and never authored.

## 5. Clue Ladder Requirements

Each item is built as a monotonic identification ladder `C1 < C2 < C3 < C4 < C5`
where "later clue is more identifying than earlier":

- `C1` is the hardest and most abstract; it narrows the field and is meaningful
  only to deep knowledge holders.
- `C2`, `C3`, `C4` add genuinely new, independent, verified information, each
  progressively narrowing the candidate set.
- `C5` is the easiest and may be near-deterministic, but it NEVER contains the
  answer or an accepted variant, and it must still carry real information.
- Every clue is independently verifiable, adds new information (never a
  rephrasing of an earlier fact), and is false-positive-resistant (an informed
  player with a different candidate must not mis-identify).
- The ladder reads as knowledge recognition, not decoding, puzzle solving, or
  guesswork; the team answers because it KNOWS the target.

## 6. Answer and Alias Rules

- The answer must be deterministic for the Scope's candidate field: exactly one
  canonical entity fits the full ladder.
- `acceptedAnswers` carries the canonical name and accepted spelling/naming
  variants; every accepted variant must normalize distinctly from one another.
- Revealed `correctAnswer` equals `acceptedAnswers[0]`; order the list with the
  canonical name first.
- Answers are matched exactly after `normalizeAnswer`; no partial credit, no
  synonym matching, no human judgment.
- Reject answers that depend on opinion, disputed facts, unstable current
  statistics without dated context, or multiple equally valid entities.
- A clue's text must not leak the answer or an accepted variant, including name
  prefixes and short aliases (see LEAKAGE.md short-alias threshold).

## 7. Authoring Principles

The Writer's fixed order:

1. Read this document and the Skill.
2. Resolve the Challenge's Scope; stay inside its candidate field.
3. Fix ONE deterministic answer target in the Scope.
4. Research 7–10 verified candidate facts (Researcher provides these).
5. Select the five best facts and assign each to an ordered clue.
6. Order clues monotonically hardest→easiest (C1..C5).
7. Write each clue in natural, concise Arabic that adds new information.
8. Verify no clue contains the answer or an accepted variant.
9. Record the accepted answer set with canonical name first.
10. Verify the item is one ladder and the Challenge is exactly three distinct items.

## 8. Anti-Patterns

Rejected constructions: the answer or an accepted variant inside any clue or the
prompt; clue 1 clearer than clue 3; clue 2 effectively giving the answer away
while later clues are generic; an impossibly vague clue 5; five rephrasings of
one fact; obscure but non-identifying trivia; opinion-based or disputed facts;
unstable current statistics without date or context; multiple equally valid
answers; nickname ambiguity; clues based on spelling accidents; facts only
useful after the answer is known; machine-translated Arabic; scope misrouting;
trivia from another World or Scope; trivia as a puzzle-solving or guessing task;
media that reveals the answer; any authored runtime state (schedules, stage
order, elimination, progress, scores); and legacy fields (`points`, `score`,
`maxPoints`, `difficulty`, `correctAnswer`, `wrongAnswers`, `hostDecision`,
`approvedAnswer`, `manualCorrect`, `manualIncorrect`, `winningTeam`,
`gameMode`, `questionType`).

## 9. Difficulty

Difficulty is the depth of knowledge required to recognize the answer: it is
the number of clues a player needs. A difficult item is one only deep-knowledge
holders recognize at C1/C2; an easy item is one most informed players recognize
at C5. Difficulty is never authored as a field and never adjusted per audience;
clue values are fixed by position. "Expert", "fan", and "casual" labels are
internal authoring heuristics only.

## 10. Extensibility and Unresolved Cases

The prompt + five clues + accepted answers model is extensible across Worlds
without changing the content shape. Explicitly unresolved, left to product
direction and therefore not invented in active guidance: item media (image,
audio, video clues), multi-answer resolution, partial scoring, and one-vs-one
variants. If canonical product documentation ever defines these cases, this
document must be updated to match before any related content is authored.
