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

For `distributed-information` with `three-segment-race`, load its dedicated
schema and validator. Plan exactly three independent ContentItems, each with
native `answerPayload` and `mechanicPayload`. Each segment is an independent
mini-puzzle solved alone by its holder with World, Scope, and Scope Knowledge;
its answer is the derived World clue the player announces, and the three clues
plus World knowledge isolate one answer. Never use counting, sums, arithmetic,
frequency, or list totals, and never let a segment be a decorative read-aloud.
Every one of the three canonical 2+1 partitions must be non-solving because the
runtime deals a random partition to two-player teams. Runtime owns both team
orders, answerer schedules, the 135-second clock, five-second locks, progress,
and score events. There is no hint mechanic and no in-race reveal; never author
either.

Never route by a legacy domain hierarchy. Never let research choose the mechanic.
Every stage writes a unique file and preserves stable IDs.
