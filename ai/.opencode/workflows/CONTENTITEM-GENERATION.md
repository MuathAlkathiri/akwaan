# ContentItem Generation Workflow

1. Resolve the ChallengeType from the manifest.
2. Load its global skill.
3. Resolve one Pattern owned by that ChallengeType.
4. Resolve the World.
5. Resolve one Scope and confirm exclusions.
6. Load `SCOPE.md` and `KNOWLEDGE.md`.
7. Plan experience goal, social dynamic, private/public information, decision,
   reveal, and success condition.
8. Assign focused research only for claims needing verification.
9. Generate schema-valid ContentItems.
10. Validate automatic resolution and payload visibility.
11. Review interaction quality and Scope fit.
12. Attach optional essential media after review.
13. Run leakage and duplicate validation.
14. Run set-level QA and hand off for human approval.

For `top-5` with `keep-or-give`, generation creates one continuous ContentItem
using runtime mode `top_5`; it never expands the ten-card deck into separate
records. Load the dedicated Top 5 schema and validator before review.

For `who-among-us` with `team-consensus`, load its dedicated authoring schema.
Generate only blocked authoring drafts using dynamic roster binding. Do not
produce review-ready or production content while the runtime status is
`runtime_contract_missing`.

For `distributed-information` with `shared-fragments`, load its dedicated
schema and validator. Plan exactly three independent ContentItems, each with
native `answerPayload` and `mechanicPayload`. Each item is one shared puzzle: a
localized team `instruction`, exactly two complementary `fragments`, and one
machine-resolvable answer. Choose a puzzle family from
`.opencode/knowledge/architecture/PUZZLE-FAMILY.md`, tag it in
`mechanicPayload.puzzleFamily`, and use three distinct families across the three
items; design one complete puzzle;
write the instruction; fix the answer; split it into two complementary
fragments; verify neither fragment alone solves; verify the two-participant
shape (fragments split, instruction attached to one holder) and the
three-participant shape (two fragments plus an instruction-only third). Never
author a fake third fragment, runtime state, hints, participant identities, or
in-race reveals. Runtime owns both team orders, answerer schedules, the
135-second clock, five-second locks, progress, and score events. The host screen
carries no puzzle material. While the shared-fragments runtime contract is
pending, every item stays `authoring_only` with a nonempty `runtimeBlocker`, and
no item may be marked ready.

For `one-clue` with `progressive-clues`, load its dedicated schema and
validator. Plan exactly three independent ContentItems, each with native
`answerPayload` (`mode: match` + `acceptedAnswers`) and `mechanicPayload`
(exactly five `clues` with `order` 1..5 and `value` 5, 4, 3, 2, 1 in exact
per-order sequence). Research 7–10 verified candidate facts per answer target;
select five; order them monotonically hardest to easiest
(`C1 < C2 < C3 < C4 < C5`); write each clue in natural Arabic adding genuinely
new verified information; keep the truth only in `answerPayload`; verify no
literal or alias leakage; and keep `media: null`, `isReusableAcrossSessions:
false`, and `runtimeContractStatus: fully_playable`. The item may be marked
ready. Runtime owns stage timing, cumulative reveal, answerer assignment,
elimination, progress, and score events.

Never route by a legacy domain hierarchy. Never let research choose the mechanic.
Every stage writes a unique file and preserves stable IDs.
