# ركّبها — authoring contract (`distributed-information`)

Backend-to-authoring handoff. Everything below is taken from the implemented and
tested backend, not from a design sketch. It is the source of truth for building
the OpenCode Skill and its validators in a separate task.

Do not create a second copy of these rules. If a content Skill already exists,
extend it rather than forking this document.

## Canonical identity

| | |
| --- | --- |
| ChallengeType slug | `distributed-information` |
| Runtime / plugin key | `distributed-information` (same string) |
| Player-facing name | `ركّبها` |
| Family | `coop` |
| Item structure | `discrete_triple` |
| Wrapper answer mode | `distributed` |
| `mechanicPayload.variant` | `three-segment-race` |
| Scoring rule | `distributed-information.race-result` |
| Overall timer | **135 seconds** (Co-op family budget 45s × 3 puzzles) |
| Wrong-answer lock | **5000 ms**, team-wide; the race clock keeps running |
| Items per challenge launch | exactly **3**, distinct |
| Supported team sizes | exactly `[2, 3]` |
| Match points | +1 to the first team to finish; **none** on a true tie |

`distributed` is a *wrapper* mode, like RYO's: the ChallengeType declares it, and
each ContentItem keeps its own answer contract. Compatible item answer modes:

- `match` — short normalized text
- `closest` — finite number
- `multiple_choice`

## Where the answer lives

**The answer is in `answerPayload`, not in `mechanicPayload`.** `answerPayload` is
already the one validated home for every mechanic's machine-resolvable answer, so
duplicating it would create two sources of truth for what is correct.

`mechanicPayload` carries only the *distributed* parts.

## Native `mechanicPayload`

```jsonc
{
  "variant": "three-segment-race",
  "publicPrompt": { "ar": "من هو اللاعب؟" },
  "segments": [
    { "id": "A", "content": { "ar": "لعب في نادٍ إسباني" } },
    { "id": "B", "content": { "ar": "فاز بالكرة الذهبية مرة واحدة" } },
    { "id": "C", "content": { "ar": "اعتزل عام 2019" } }
  ],
  "twoPlayerMergeOptions": [
    {
      "firstParticipantSegmentIds": ["A", "C"],
      "secondParticipantSegmentIds": ["B"]
    }
  ],
  "supportedTeamSizes": [2, 3],
  "authorSafetyConfirmation": true,
  "explanation": "اختياري، لمراجعة المحرّر"
}
```

A segment may also carry `media`, using the existing ContentItem media system.
Text-only items are fully supported and are what the tests use.

## Validation rules (enforced by `ContentItemCompatibilityPolicy`)

Each failure is reported with its own code so an author sees all of them at once.

| Code | Rule |
| --- | --- |
| `DISTRIBUTED_PUBLIC_PROMPT_REQUIRED` | `publicPrompt.ar` is non-empty |
| `DISTRIBUTED_SEGMENT_COUNT_INVALID` | exactly 3 segments |
| `DISTRIBUTED_SEGMENT_IDS_INVALID` | ids are exactly `A`, `B`, `C`, each once |
| `DISTRIBUTED_SEGMENT_CONTENT_REQUIRED` | every segment has content |
| `DISTRIBUTED_MERGE_OPTION_REQUIRED` | at least one two-player split |
| `DISTRIBUTED_MERGE_OPTION_INVALID` | every split covers all three segments exactly once **as 2 + 1** |
| `DISTRIBUTED_TEAM_SIZES_INVALID` | `supportedTeamSizes` is exactly `[2, 3]` |
| `DISTRIBUTED_ANSWER_MODE_UNSUPPORTED` | `answerPayload.mode` ∈ `match`, `closest`, `multiple_choice` |
| `DISTRIBUTED_SAFETY_CONFIRMATION_REQUIRED` | `authorSafetyConfirmation === true` **when status is `ready`** (a draft may still be in progress) |

### The three canonical splits

`A+B | C`, `A+C | B`, `B+C | A`. One or more may be enabled. A split giving one
player all three segments is rejected — that is the leak the rule exists to stop.

## Leakage rules

Automated validation catches *structural* leakage only. Whether a split is
genuinely unsolvable alone is the author's judgement, recorded as
`authorSafetyConfirmation` and surfaced in the admin UI as:

> راجعت التوزيع، ولا يستطيع لاعب واحد حل اللغز بمفرده.

The runtime enforces, and integration tests assert, that a participant's snapshot
never contains: another participant's segment, the opponent's plan, any answer
(`acceptedAnswers`, `correctOptionId`, `correctValue`), a team's private puzzle
order, the answerer schedule, or a future puzzle's prompt. The shared screen and
controller receive progress only.

## Race rules

- Both teams play the **same three items**, each in its **own randomized order**.
- Three players hold one segment each; two players use one enabled merge.
- One randomized answerer per puzzle. Three players each answer exactly one, in a
  random order; two players alternate from a random start (`A-B-A` or `B-A-B`).
- Fairness is not persisted across Matches.
- Every random choice is made once at launch and persisted, so a reconnect
  restores the exact same order, segments, answerer, lock, and progress.
- A wrong answer locks that team for 5 seconds and does not advance it; the same
  answerer stays responsible; the opponent is unaffected; retries are unlimited
  until the deadline.
- A correct answer advances only that team. The first team to solve puzzle 3
  resolves the whole challenge immediately.
- At the deadline: higher solved count wins → else the team that reached that
  count sooner wins → else a true tie with no point.

## Valid example

The three-item set used by the passing integration test: one `match` item, one
`closest` item, one `multiple_choice` item, each with three text segments, the
`A+C | B` merge enabled, `supportedTeamSizes: [2, 3]`, and
`authorSafetyConfirmation: true`.

## Invalid examples

```jsonc
// Two segments — rejected: DISTRIBUTED_SEGMENT_COUNT_INVALID
{ "segments": [{ "id": "A" }, { "id": "B" }] }

// One player holds everything — DISTRIBUTED_MERGE_OPTION_INVALID
{ "twoPlayerMergeOptions": [
  { "firstParticipantSegmentIds": ["A","B","C"], "secondParticipantSegmentIds": [] }
] }

// A segment nobody reads — DISTRIBUTED_MERGE_OPTION_INVALID
{ "twoPlayerMergeOptions": [
  { "firstParticipantSegmentIds": ["A"], "secondParticipantSegmentIds": ["B"] }
] }

// Solo or four-player support — DISTRIBUTED_TEAM_SIZES_INVALID
{ "supportedTeamSizes": [1, 2, 3] }

// A vote answer — DISTRIBUTED_ANSWER_MODE_UNSUPPORTED
{ "answerPayload": { "mode": "vote", "consensusRule": "majority" } }

// Ready without the confirmation — DISTRIBUTED_SAFETY_CONFIRMATION_REQUIRED
{ "status": "ready", "authorSafetyConfirmation": false }
```

## Seeding

```bash
npm run migrate:distributed-information            # dry run
npm run migrate:distributed-information -- --apply # create, idempotent
```

The ChallengeType is seeded as `draft`; an admin activates it. Look-alike
mechanics are reported and left untouched — nothing is converted.
